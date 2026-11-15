import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {startBlankStudio} from './fixtures/birdseye/entry.mjs';

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
  const building={id:'bld-loading-test',title:'로딩 시험 건물',example:false,updatedAt:1,floors:3,rooms:6,products:9,area:300,industries:['오피스']};
  for(const width of [1500,390])for(const outcome of ['items','empty','error']){
    const page=await context.newPage();await page.setViewportSize({width,height:960});page.on('pageerror',e=>errors.push(e.message));
    let release,requests=0;const gate=new Promise(resolve=>release=resolve);
    await page.route(url=>url.pathname==='/api/spatial/history',async route=>{
      const request=++requests;await gate;
      await route.fulfill(outcome==='error'&&request===1?{status:503,json:{detail:'히스토리 로딩 시험 오류'}}:{json:outcome==='empty'?{items:[]}:history});
    });
    // 건물은 공간 히스토리보다 먼저 준비된다(브라우저 저장소) — items에서는 건물 하나를 두어, 공간 히스토리가 오기 전에 건물만 먼저 보이지 않는지 본다
    await page.addInitScript(buildings=>{window.__wmBldMod_={app:{list:async()=>buildings,onChange:fn=>{setTimeout(fn,0);return()=>{};},thumb:async()=>null,remove:async()=>{}}};},outcome==='items'?[building]:[]);
    await page.addInitScript(()=>{
      window.historyFrames=[];
      const tick=()=>{const region=document.querySelector('.sp-history');if(region)window.historyFrames.push({pending:region.getAttribute('aria-busy')==='true',empty:!!region.querySelector('.sp-empty h3'),count:!!region.querySelector('.sp-history-count'),cards:region.querySelectorAll('.sp-map-card').length});requestAnimationFrame(tick);};requestAnimationFrame(tick);
    });
    await page.goto(base+'/spatial');const region=page.getByRole('region',{name:'조감도 히스토리',exact:true});await region.getByRole('status').waitFor({timeout:120000});await page.evaluate(()=>document.fonts.ready);await frames(page);
    assert.equal(await region.locator('.sp-map-card').count(),0,'no card before the history arrives');assert.equal(await region.getAttribute('aria-busy'),'true');assert.equal(await region.locator('.sp-history-count').count(),0);assert.equal(await region.getByText('저장한 조감도가 없어요',{exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'제품 · 가구 오브젝트',exact:true}).isEnabled(),true);
    const headerBefore=await page.locator('.sp-header').boundingBox();release();
    if(outcome==='empty'){
      await region.getByText('저장한 조감도가 없어요',{exact:true}).waitFor();assert.equal(await region.locator('.sp-history-count').innerText(),'0');
      assert(await page.getByRole('button',{name:/조감도 스튜디오 시작/}).isVisible());
    }else if(outcome==='error'){
      await page.getByRole('alert',{name:'히스토리를 불러오지 못했어요',exact:true}).waitFor();assert.equal(await region.getByText('저장한 조감도가 없어요',{exact:true}).count(),0);assert.equal(await region.locator('.sp-history-count').count(),0);
    }else{
      await region.locator('.sp-map-card').first().waitFor();assert.equal(await region.locator('.sp-map-card').count(),Math.min(8,history.items.length+1));assert.equal(await region.locator('.sp-history-count').innerText(),String(history.total+1));
    }
    const headerAfter=await page.locator('.sp-header').boundingBox(),drift=Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.abs(headerBefore[key]-headerAfter[key])]));assert(Object.values(drift).every(value=>value<1));
    const samples=await page.evaluate(()=>window.historyFrames),first=samples.findIndex(sample=>!sample.pending);assert(samples.some(sample=>sample.pending));assert(samples.filter(sample=>sample.pending).every(sample=>!sample.empty&&!sample.count));assert(samples.slice(0,first<0?samples.length:first).every(sample=>!sample.cards),'the first load shows no partial list');
    measurements.push({width,outcome,drift,pendingFrames:samples.filter(sample=>sample.pending).length});
    if(outcome==='error'){await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await region.locator('.sp-map-card').first().waitFor();assert.equal(await region.locator('.sp-map-card').count(),history.items.length);assert.equal(requests,2);}
    else assert.equal(requests,1,'initial history fetch must not be duplicated when the library becomes ready');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await region.scrollIntoViewIfNeeded();await page.screenshot({path:output+'/'+outcome+'-'+width+'.png',animations:'disabled'});await page.close();
    pass(width+'px: '+outcome+' waits for history completion, never flashes empty while loading, and keeps the header stable');
  }
  const page=await context.newPage();await page.setViewportSize({width:1500,height:960});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__wmBldMod_={app:{list:async()=>[],onChange:()=>()=>{},thumb:async()=>null,remove:async()=>{}}};});
  let release,requests=0,staleDelivered;const gate=new Promise(resolve=>release=resolve),staleDone=new Promise(resolve=>staleDelivered=resolve);
  await page.route(url=>url.pathname==='/api/spatial/history',async route=>{if(++requests===1){await gate;await route.fulfill({json:{items:[]}}).catch(()=>{});staleDelivered();}else await route.fulfill({json:history});});
  await page.goto(base+'/spatial');await page.locator('.sp-studio-launch').waitFor({timeout:120000});await startBlankStudio(page);await page.getByRole('button',{name:'뒤로 가기',exact:true}).click();await page.locator('.sp-history .sp-map-card').first().waitFor();assert.equal(await page.locator('.sp-history .sp-map-card').count(),history.items.length);
  release();await staleDone;await frames(page);assert.equal(await page.locator('.sp-history .sp-map-card').count(),history.items.length);assert.equal(await page.locator('.sp-history').getAttribute('aria-busy'),'false');await page.close();pass('a late empty response cannot replace the newer history after returning from the studio');
  // 뒤쪽을 보는 동안 건물이 늘면(다른 기기 저장 · 계정 동기화) 그 쪽에 필요한 구간만 다시 읽어 합친다 — 그 사이 빈 목록 안내는 보이지 않는다
  {
    const page=await context.newPage();await page.setViewportSize({width:1500,height:960});page.on('pageerror',e=>errors.push(e.message));
    const rows=Array.from({length:20},(_,i)=>({...history.items[0],id:'sp-load-'+i,title:'로딩 시험 '+i,updated_at:1700000000-i})),asked=[];
    await page.route(url=>url.pathname==='/api/spatial/history',route=>{const n=Number(new URL(route.request().url()).searchParams.get('page'))||1;asked.push(n);return route.fulfill({json:{items:rows.slice((n-1)*8,n*8),total:20,page:n,page_size:8,total_pages:3}});});
    await page.addInitScript(()=>{window.__bld={list:[],fns:[]};window.__wmBldMod_={app:{list:async()=>window.__bld.list,onChange:fn=>{window.__bld.fns.push(fn);return()=>{};},thumb:async()=>null,remove:async()=>{}}};
      window.historyFrames=[];const tick=()=>{const region=document.querySelector('.sp-history');if(region)window.historyFrames.push({empty:!!region.querySelector('.sp-empty h3')});requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    await page.goto(base+'/spatial');const cards=page.locator('.sp-history .sp-history-card'),ids=()=>cards.evaluateAll(nodes=>nodes.map(n=>n.dataset.historyId));
    await cards.first().waitFor({timeout:120000});await page.getByRole('button',{name:'다음 페이지',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-history-page="2"]'));
    assert.deepEqual(await ids(),rows.slice(8,16).map(row=>row.id));assert.deepEqual(asked,[1,2],'each page is read on its own');
    await page.evaluate(()=>{window.__bld.list=[1,2,3].map(n=>({id:'bld-new-'+n,title:'새 건물 '+n,example:false,updatedAt:Date.now()+n,floors:2,rooms:4,products:5,area:200,industries:['오피스']}));window.__bld.fns.forEach(fn=>fn());});
    await page.waitForFunction(()=>document.querySelector('.sp-history .sp-history-count')?.textContent==='23'&&document.querySelector('.sp-history').getAttribute('aria-busy')==='false');
    assert.deepEqual(await ids(),rows.slice(5,13).map(row=>row.id),'three newer buildings push three records onto this page');assert.equal(await page.locator('.sp-history .be-building-card').count(),0);
    assert.deepEqual(asked.slice(2),[1,2],'only the pages around this one are read again');
    assert((await page.evaluate(()=>window.historyFrames)).every(frame=>!frame.empty),'the empty notice never shows while re-reading');
    await page.getByRole('button',{name:'이전 페이지',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-history-page="1"]'));assert.equal(await page.locator('.sp-history .be-building-card').count(),3);
    await page.close();pass('buildings that appear while a later page is open re-read just that range and merge in place, without an empty flash');
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(output+'/report.json',JSON.stringify({ok:true,checks,measurements,errors},null,2));
}catch(error){fs.writeFileSync(output+'/report.json',JSON.stringify({ok:false,checks,measurements,errors,error:String(error)},null,2));throw error;}
finally{await browser?.close();await server.close();}
