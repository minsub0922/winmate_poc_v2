// Reproducible production UI browsing measurements. Isolated storage, real catalog;
// API preview images are fixed fixtures so server/GPU latency is not timed as UI work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build, preview } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),web=path.join(root,'app/web');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const label=process.env.BROWSE_LABEL||'after',out=path.join(root,'app/tests/output/browsing-performance');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'winmate-browse-')),dist=process.env.BROWSE_DIST||path.join(temp,'dist');
const library=read('app/data/spatial/library.json'),bootstrap={catalog:read('app/data/catalog.json'),products:read('app/data/products_db.json'),images:read('app/data/images.json'),capabilities:null,user:{username:'browse-test',auth_enabled:false}};
const scenes=read('app/data/spatial/scenes.json');
const report={label,time:new Date().toISOString(),sourceHash:library.sourceHash,cpuRate:4,metrics:{},errors:[],hashes:{}};
for(const f of ['domain/slides/Slide.jsx','components/spatial-library.jsx','components/birdseye-start.jsx','components/spatial-object-drawer.jsx','components/pickpeek.jsx','components/customer-voice.jsx','hooks/useNearViewport.js','services/spatial.js']) report.hashes[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(web,'src',f))).digest('hex');
report.hashes['app/api/spatial.py']=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app/api/spatial.py'))).digest('hex');
let server,browser,page,cdp;
try{
  if(!process.env.BROWSE_DIST)await build({root:web,configFile:path.join(web,'vite.config.js'),logLevel:'error',build:{outDir:dist,emptyOutDir:true}});
  fs.writeFileSync(path.join(out,label+'-dist.txt'),dist);
  server=await preview({root:web,configFile:path.join(web,'vite.config.js'),logLevel:'error',build:{outDir:dist},preview:{host:'127.0.0.1',port:0}});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1500,height:1000}});
  await context.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),r=>r.abort());
  await context.route(url=>url.pathname.startsWith('/api/'),r=>{
    const p=new URL(r.request().url()).pathname;
    if(p==='/api/bootstrap')return r.fulfill({json:bootstrap});
    if(p.startsWith('/api/spatial/library'))return r.fulfill({json:library});
    if(p==='/api/spatial/history')return r.fulfill({json:{items:[],total:0,page:1,page_size:8}});
    if(p==='/api/storyboards')return r.fulfill({json:{items:[]}});
    if(p.endsWith('/preview.webp'))return r.fulfill({path:path.join(web,'public/assets/spatial-examples/spatial-example-1.webp')});
    if(p.startsWith('/api/spatial/templates/'))return r.fulfill({json:{scene:scenes[decodeURIComponent(p.split('/').at(-1))]}});
    return r.fulfill({status:422,json:{detail:'isolated browsing test'}});
  });
  await context.route(url=>['/img/','/lib/','/fonts/'].some(p=>url.pathname.startsWith(p)),r=>{
    const p=decodeURIComponent(new URL(r.request().url()).pathname).slice(1),file=path.join(root,p.startsWith('fonts/')?'app/web/public':'app/data/static',p);
    return fs.existsSync(file)?r.fulfill({path:file}):r.abort();
  });
  page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{
    window.browseStats={tasks:[],frames:[]};
    new PerformanceObserver(list=>window.browseStats.tasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
    let last=performance.now();const frame=now=>{window.browseStats.frames.push({start:now,duration:now-last});last=now;requestAnimationFrame(frame);};requestAnimationFrame(frame);
  });
  cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const measure=async(name,action)=>{
    const trace=process.env.BROWSE_TRACE&&name==='sheets-scroll';
    if(trace)await cdp.send('Tracing.start',{categories:'devtools.timeline,disabled-by-default-devtools.timeline.stack,blink.user_timing,v8.execute',transferMode:'ReturnAsStream'});
    const before=await metrics(),start=await page.evaluate(()=>performance.now());await action();await page.waitForTimeout(250);
    const after=await metrics(),stats=await page.evaluate(start=>{
      const tasks=window.browseStats.tasks.filter(t=>t.start>=start),frames=window.browseStats.frames.filter(t=>t.start>=start).map(t=>t.duration).sort((a,b)=>a-b);
      return {longTasks:tasks.length,blockingMs:tasks.reduce((s,t)=>s+Math.max(0,t.duration-50),0),maxTaskMs:Math.max(0,...tasks.map(t=>t.duration)),frameP95Ms:frames[Math.floor(frames.length*.95)]||0,dom:document.querySelectorAll('*').length,slides:document.querySelectorAll('.slide-inner').length};
    },start);
    for(const k of ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'])stats[k+'Ms']=Math.round((after[k]-before[k])*1000);
    report.metrics[name]=stats;console.log(name,JSON.stringify(stats));
    if(trace){
      const done=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await done;
      let data='',part;do{part=await cdp.send('IO.read',{handle:stream});data+=part.data;}while(!part.eof);await cdp.send('IO.close',{handle:stream});fs.writeFileSync(path.join(out,label+'-trace.json'),data);
    }
  };
  const navigate=async route=>{await page.evaluate(route=>{history.pushState({winmateRoute:route},'','/');window.dispatchEvent(new PopStateEvent('popstate',{state:{winmateRoute:route}}));},route);};
  const scroll=async selector=>{
    for(let i=0;i<28;i++){await page.locator(selector).evaluate(el=>el.scrollBy(0,600));await page.waitForTimeout(100);}
    await page.locator(selector).evaluate(el=>el.scrollTo(0,0));await page.waitForTimeout(400);
  };
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.locator('.home').waitFor();
  await measure('sheets-open',async()=>{await navigate({name:'library',scope:'sh'});await page.locator('.tl-card').first().waitFor();});
  report.sheetCount=await page.locator('.tl-card').count();
  // Pick the real scrolling ancestor rather than imposing a new scroll container.
  const scrollSelector=await page.locator('.tl-card').first().evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.scrollHeight>p.clientHeight&&/auto|scroll/.test(getComputedStyle(p).overflowY)){p.dataset.browseScroll='true';return '[data-browse-scroll]';}document.scrollingElement.dataset.browseScroll='true';return '[data-browse-scroll]';});
  await measure('sheets-scroll',()=>scroll(scrollSelector));
  await page.evaluate(()=>document.fonts.ready);
  await measure('sheets-repeat-scroll',()=>scroll(scrollSelector));
  await measure('sheets-hover',async()=>{for(let i=0;i<4;i++){await page.locator('.tl-card').nth(i).hover();await page.waitForTimeout(450);await page.mouse.move(0,0);await page.waitForTimeout(200);}});
  await page.mouse.move(0,0);await page.screenshot({path:path.join(out,label+'-sheets.png')});
  await measure('spatial-open',async()=>{await navigate({name:'spatial'});await page.locator('.sp-object-trigger').waitFor();await page.locator('.sp-object-trigger').click();await page.locator('.sp-object-card').first().waitFor();});
  await measure('objects-scroll',()=>scroll('#sp-library-popup'));
  report.objectCount=await page.locator('.sp-object-card').count();
  await measure('objects-filter',async()=>{await page.getByLabel('오브젝트 제품군',{exact:true}).selectOption('furniture');await page.getByLabel('오브젝트 검색',{exact:true}).fill('카페');await page.waitForTimeout(200);await page.getByLabel('오브젝트 검색',{exact:true}).fill('');await page.getByLabel('오브젝트 제품군',{exact:true}).selectOption('all');});
  await page.screenshot({path:path.join(out,label+'-objects.png')});
  await page.locator('.sp-object-drawer .mhead').getByRole('button',{name:'닫기',exact:true}).click();
  await page.locator('.sp-studio-launch').click();await page.locator('.be-industries [data-industry="FB"]').click();
  await measure('templates-open',async()=>{await page.getByRole('button',{name:'업종 템플릿에서 시작'}).click();await page.locator('.be-template-item').first().waitFor();});
  report.templateCount=await page.locator('.be-template-item').count();
  await measure('templates-scroll',()=>scroll('.be-template-list'));
  await page.screenshot({path:path.join(out,label+'-templates.png')});
  assert.deepEqual(report.errors,[]);
  report.ok=true;
}catch(error){report.error=String(error);throw error;
}finally{
  fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));
  // Keep this build for exact repeat measurements; output/*-dist.txt records its isolated path.
}
