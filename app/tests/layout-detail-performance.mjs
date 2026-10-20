// Component rendering benchmark: real catalog/filled scenarios, isolated storage, zero model calls.
// Production history reset and real-model timings are collected separately in the browser backup.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'app/web'), output = path.join(root, 'app/tests/output/layout-detail-performance');
fs.mkdirSync(output, { recursive: true });
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
const bootstrap = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'detail-render-benchmark', auth_enabled: false } };
const styles = [...fs.readFileSync(path.join(web, 'src/main.jsx'), 'utf8').matchAll(/import '(\.\/styles\/[^']+\.css)'/g)].map(m => `import '${m[1].replace('./styles/', '/src/styles/')}';`).join('\n');
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fonts/fonts.css"></head><body><div id="root"></div><!-- layout-data --><script type="module">
${styles}
import React from 'react';
import {createRoot} from 'react-dom/client';
import {loadBootstrap} from '/src/api/bootstrap.js';
await loadBootstrap();
const {loadLayoutHtml}=await import('/src/services/catalog.js'); await loadLayoutHtml();
const {LayoutDetail}=await import('/src/components/detail.jsx');
const {scenarioStoryboard}=await import('/src/domain/templates/scenario_storyboard.js');
const {layoutContextKey}=await import('/src/domain/slides/context-policy.js');
const {readBlocks,readImageSlots}=await import('/src/domain/slides/Slide.jsx');
const {retainHistoryLayouts}=await import('/src/domain/slides/context-policy.js');
const mount=createRoot(document.getElementById('root'));
window.samples=['bs01','bs21','bs03'].map(sid=>{const p=structuredClone(scenarioStoryboard(sid)); p.id='benchmark-'+sid; retainHistoryLayouts(p); return p;});
window.renderDetail=(pi,partId,uid,stale=false)=>{const p=structuredClone(window.samples[pi]); const part=p.parts.find(s=>s.id===partId); const x=part.layouts.find(x=>x.uid===uid);
 if(stale)x.adaptation.appliedKey=layoutContextKey({...p,customer:'이전 고객'},part);
 mount.render(React.createElement(LayoutDetail,{p,partId,uid,pageNo:1,onClose:()=>mount.render(null)}));};
window.detailCases=window.samples.flatMap((p,pi)=>p.parts.flatMap(part=>part.layouts.map(x=>({pi,partId:part.id,uid:x.uid,f:x.f,texts:readBlocks(x.f,x.ov,true).length,images:readImageSlots(x.f,x.ov).length}))));
window.ready=true;
</script></body></html>`;
let server;
server = await createServer({ root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'error', optimizeDeps:{include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']}, plugins: [{name:'detail-component-benchmark',configureServer(s){s.middlewares.use('/__detail-benchmark', async (req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/__detail-benchmark', html));}catch(e){next(e);}});}}], server: {host:'127.0.0.1',port:0,strictPort:false,hmr:false} });
let browser, page; const errors=[], requests=[], rows=[], checks=[];
const stat=values=>{const a=[...values].sort((a,b)=>a-b);return{count:a.length,medianMs:+a[Math.floor(a.length*.5)].toFixed(1),p95Ms:+a[Math.min(a.length-1,Math.ceil(a.length*.95)-1)].toFixed(1),maxMs:+a.at(-1).toFixed(1)};};
try{
 await server.listen(); browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000},reducedMotion:'reduce'});
 await context.route(u=>!['127.0.0.1','localhost'].includes(u.hostname),r=>r.abort());
 await context.route(u=>u.pathname.startsWith('/api/'),r=>{const u=new URL(r.request().url());if(u.pathname==='/api/bootstrap')return r.fulfill({json:bootstrap}); if(u.pathname==='/api/llm')requests.push(u.pathname); return r.fulfill({status:503,json:{code:'benchmark_no_model'}});});
 await context.route('**/img/**',r=>{const rel=decodeURIComponent(new URL(r.request().url()).pathname).slice(1);const file=[path.join(root,rel),path.join(root,'reference/live',rel),path.join(root,'app/data/static',rel)].find(p=>fs.existsSync(p));return file?r.fulfill({path:file}):r.abort();});
 page=await context.newPage(); page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/__detail-benchmark');await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>document.fonts.ready);
 const cases=await page.evaluate(()=>window.detailCases);assert.equal(cases.length,70);
 const saved=await page.evaluate(()=>JSON.stringify(window.samples));
 const open=async(row,stale=false)=>{const start=performance.now();await page.evaluate(({row,stale})=>window.renderDetail(row.pi,row.partId,row.uid,stale),{row,stale});await page.locator('.modal.sheet .detail-left .slide').waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return performance.now()-start;};
 const close=async()=>{await page.locator('.modal.sheet').getByRole('button',{name:'닫기',exact:true}).last().click();await page.locator('.modal.sheet').waitFor({state:'detached'});};
 for(const row of cases){const ms=await open(row);assert.equal(await page.locator('.detail-right .fillcard,.detail-right .layout-context-refill').count(),0);rows.push({...row,ms:+ms.toFixed(1)});await close();}
 checks.push('70 real stored slides render with no obsolete element-fill section or unchanged-context refill button');
 const withImage=cases.filter(x=>x.images).sort((a,b)=>a.texts-b.texts)[0];await open(withImage);
 await page.locator('.detail-left [data-img]:visible').first().click();const popup=page.getByRole('dialog',{name:'대체 이미지 고르기',exact:true});await popup.waitFor();await popup.getByRole('button',{name:'닫기',exact:true}).click();
 await page.locator('.detail-right .unitcard').waitFor();assert.equal(await page.locator('.detail-right').getByRole('button',{name:/대체 이미지|자동으로 고르기|자동 채우기/}).count(),0);await page.screenshot({path:output+'/image-actions-removed.png'});await close();checks.push('image selection preserves source details without the removed footer actions');
 const hover=[];
 for(const row of [cases[0],cases.find(x=>x.pi===1),cases.find(x=>x.pi===2)]){await open(row,true);const button=page.locator('.layout-context-refill'),tooltip=page.locator('.layout-context-details');await button.waitFor();assert.equal(await tooltip.isVisible(),false);const b=await button.boundingBox(),wrapper=await page.locator('.layout-context-action').boundingBox();assert(Math.abs(b.width-wrapper.width)<1);const start=performance.now();await button.hover();await tooltip.waitFor({state:'visible'});hover.push(performance.now()-start);const t=await tooltip.boundingBox();assert(t.y>=b.y+b.height);await page.mouse.move(10,10);await tooltip.waitFor({state:'hidden'});await close();}
 checks.push('all three scenarios show one full-width button only for changed context; explanations stay in the tooltip below');
 await page.setViewportSize({width:390,height:844});await open(withImage,true);await page.locator('.layout-context-refill').scrollIntoViewIfNeeded();await page.locator('.layout-context-refill').hover();await page.locator('.layout-context-details').waitFor({state:'visible'});assert(await page.locator('.detail-right').evaluate(e=>e.scrollWidth<=e.clientWidth));await page.screenshot({path:output+'/mobile-hover.png'});await close();checks.push('390px panel and hover content fit without horizontal overflow');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.samples)),saved);assert.deepEqual(errors,[]);assert.equal(requests.length,0);
 const report={kind:'component rendering only; excludes AI generation and production state',slides:cases.length,render:stat(rows.map(r=>r.ms)),byScenario:[0,1,2].map(pi=>({scenario:['cafe','hotel','university'][pi],...stat(rows.filter(r=>r.pi===pi).map(r=>r.ms))})),hover:stat(hover),checks,errors,modelCalls:requests.length,rows};
 fs.writeFileSync(output+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined},null,2));
}catch(e){console.error('Benchmark errors',errors);await page?.screenshot({path:output+'/failure.png'}).catch(()=>{});throw e;}finally{await browser?.close();await server.close();}
