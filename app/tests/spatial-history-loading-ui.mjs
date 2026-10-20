import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'app/tests/output/spatial-history-loading');fs.mkdirSync(output,{recursive:true});
const apiPort=Number(process.env.SPATIAL_TEST_API_PORT||8993),webPort=Number(process.env.SPATIAL_TEST_WEB_PORT||5293),base='http://127.0.0.1:'+webPort;
process.env.WINMATE_API_PORT=String(apiPort);process.env.WINMATE_WEB_PORT=String(webPort);
const server=await createServer({root:path.join(root,'app/web'),cacheDir:path.join(output,'vite-cache-'+webPort),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'warn',server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false}});
let browser;const errors=[],checks=[],measurements=[],pass=s=>{checks.push(s);console.log('PASS '+s);};
const frames=page=>page.evaluate(()=>new Promise(resolve=>{let remaining=4;const tick=()=>--remaining?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}));
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext();assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).status(),200);
  const history=await (await context.request.get(base+'/api/spatial/history?page=1&page_size=8')).json();assert(history.items.length>0);
  const library=await (await context.request.get(base+'/api/spatial/library')).json();
  for(const width of [1500,390])for(const outcome of ['items','empty','error']){
    const page=await context.newPage();await page.setViewportSize({width,height:960});page.on('pageerror',e=>errors.push(e.message));
    let release,requests=0;const gate=new Promise(resolve=>release=resolve);
    await page.route(url=>url.pathname==='/api/spatial/history',async route=>{
      const request=++requests;await gate;
      await route.fulfill(outcome==='error'&&request===1?{status:503,json:{detail:'히스토리 로딩 시험 오류'}}:{json:outcome==='empty'?{items:[]}:history});
    });
    await page.addInitScript(()=>{
      window.historyFrames=[];
      const tick=()=>{const region=document.querySelector('.sp-history');if(region)window.historyFrames.push({pending:region.getAttribute('aria-busy')==='true',empty:!!region.querySelector('.sp-empty h3'),count:!!region.querySelector('.sp-history-count')});requestAnimationFrame(tick);};requestAnimationFrame(tick);
    });
    await page.goto(base+'/spatial');const region=page.getByRole('region',{name:'조감도 히스토리',exact:true});await region.getByRole('status').waitFor({timeout:120000});await page.evaluate(()=>document.fonts.ready);await frames(page);
    assert.equal(await page.locator('.sp-home-maps').count(),0);assert.equal(await region.getAttribute('aria-busy'),'true');assert.equal(await region.locator('.sp-history-count').count(),0);assert.equal(await region.getByText('저장한 조감도가 없어요',{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'제품 · 가구 오브젝트',exact:true}).isEnabled(),true);
    const headerBefore=await page.locator('.sp-header').boundingBox();release();
    if(outcome==='empty'){
      await region.getByText('저장한 조감도가 없어요',{exact:true}).waitFor();assert.equal(await region.locator('.sp-history-count').innerText(),'0');
      const templates=page.getByRole('region',{name:'업종 템플릿',exact:true});await templates.waitFor();assert.equal(await templates.locator('.sp-template-card').count(),library.industries.length);
      for(const industry of library.industries)assert.equal(await templates.locator('.sp-template-card small').filter({hasText:industry.name}).count(),1);
      await templates.getByRole('button',{name:'활용하기',exact:true}).first().click();const confirmation=page.getByRole('dialog',{name:'스튜디오로 이동할까요?',exact:true});await confirmation.waitFor();await confirmation.getByRole('button',{name:'취소',exact:true}).click();await confirmation.waitFor({state:'hidden'});
      await templates.getByRole('button',{name:'전체 보기',exact:true}).click();const maps=page.getByRole('dialog',{name:'업종 템플릿',exact:true});await maps.waitFor();await page.keyboard.press('Escape');await maps.waitFor({state:'hidden'});
    }else if(outcome==='error'){
      await page.getByRole('alert',{name:'히스토리를 불러오지 못했어요',exact:true}).waitFor();assert.equal(await region.getByText('저장한 조감도가 없어요',{exact:true}).count(),0);assert.equal(await region.locator('.sp-history-count').count(),0);
    }else{
      await region.locator('.sp-map-card').first().waitFor();assert.equal(await region.locator('.sp-map-card').count(),history.items.length);assert.equal(await region.locator('.sp-history-count').innerText(),String(history.total));
    }
    if(outcome!=='empty')assert.equal(await page.locator('.sp-home-maps').count(),0);
    const headerAfter=await page.locator('.sp-header').boundingBox(),drift=Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.abs(headerBefore[key]-headerAfter[key])]));assert(Object.values(drift).every(value=>value<1));
    const samples=await page.evaluate(()=>window.historyFrames);assert(samples.some(sample=>sample.pending));assert(samples.filter(sample=>sample.pending).every(sample=>!sample.empty&&!sample.count));
    measurements.push({width,outcome,drift,pendingFrames:samples.filter(sample=>sample.pending).length});
    if(outcome==='error'){await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await region.locator('.sp-map-card').first().waitFor();assert.equal(await region.locator('.sp-map-card').count(),history.items.length);assert.equal(requests,2);assert.equal(await page.locator('.sp-home-maps').count(),0);}
    else assert.equal(requests,1,'initial history fetch must not be duplicated when the library becomes ready');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await (outcome==='empty'?page.locator('.sp-home-maps'):region).scrollIntoViewIfNeeded();await page.screenshot({path:output+'/'+outcome+'-'+width+'.png',animations:'disabled'});await page.close();
    pass(width+'px: '+outcome+' waits for history completion, never flashes empty while loading, and keeps the header stable');
  }
  const page=await context.newPage();await page.setViewportSize({width:1500,height:960});page.on('pageerror',e=>errors.push(e.message));
  let release,requests=0,staleDelivered;const gate=new Promise(resolve=>release=resolve),staleDone=new Promise(resolve=>staleDelivered=resolve);
  await page.route(url=>url.pathname==='/api/spatial/history',async route=>{if(++requests===1){await gate;await route.fulfill({json:{items:[]}}).catch(()=>{});staleDelivered();}else await route.fulfill({json:history});});
  await page.goto(base+'/spatial');await page.locator('.sp-studio-launch').waitFor({timeout:120000});await page.locator('.sp-studio-launch').click();await page.locator('.sp-blank-canvas').waitFor();await page.getByRole('button',{name:'뒤로 가기',exact:true}).click();await page.locator('.sp-history .sp-map-card').first().waitFor();assert.equal(await page.locator('.sp-history .sp-map-card').count(),history.items.length);
  release();await staleDone;await frames(page);assert.equal(await page.locator('.sp-history .sp-map-card').count(),history.items.length);assert.equal(await page.locator('.sp-history').getAttribute('aria-busy'),'false');await page.close();pass('a late empty response cannot replace the newer history after returning from the studio');
  assert.deepEqual(errors,[]);fs.writeFileSync(output+'/report.json',JSON.stringify({ok:true,checks,measurements,errors},null,2));
}catch(error){fs.writeFileSync(output+'/report.json',JSON.stringify({ok:false,checks,measurements,errors,error:String(error)},null,2));throw error;}
finally{await browser?.close();await server.close();}
