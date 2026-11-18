// Fixed-content sheets and the context inspection.
// Why Samsung · closing · filled 도입사례 sheets are used exactly as authored (context-policy isFixedContentLayout — never rewritten for a
// customer). The inspection that reports "선택하지 않은 제품 / 현재 선택한 제품과 다른 이미지" judges a sheet against this customer's
// selection; applied to a fixed sheet it reports something nobody can resolve (Why Samsung 4 shows an air conditioner in its
// maintenance photo) — and that report blocked PPTX export for good and kept the sheet "in progress".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const json=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const boot={catalog:json('catalog'),products:json('products_db'),images:json('images'),capabilities:null,user:{username:'context-fixed-test',auth_enabled:false}};
const details=JSON.parse(fs.readFileSync(path.join(root,'reference/live/img/prod/d00.json'),'utf8'));
const out=path.join(root,'app/tests/output/layout-context-fixed');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
const results=[],errors=[];let browser,page;
const pass=name=>{results.push(name);console.log('PASS '+name);};
try{
 await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000}});
 const modelCalls=[];
 await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:boot});
  if(url.pathname.startsWith('/api/product-packs/'))return route.fulfill({json:details});
  if(url.pathname==='/api/llm')modelCalls.push(route.request().postDataJSON()?.feature||'llm');
  return route.fulfill({status:503,json:{code:'test_no_api'}});
 });
 await context.route('**/img/**',route=>{
  const rel=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
  const file=path.join(root,rel.startsWith('img/lib/')?rel:'app/data/static/'+rel);
  return fs.existsSync(file)?route.fulfill({path:file}):route.abort();
 });
 await context.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>route.abort());
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.waitForFunction(()=>document.querySelector('.app')&&!document.querySelector('.boot'));

 // A signage-only proposal: no air conditioner is linked, yet Why Samsung 4 shows one in its maintenance photo — as authored.
 const seen=await page.evaluate(async()=>{
  const {loadLayoutHtml}=await import('/src/services/catalog.js');await loadLayoutHtml();
  const {inspectLayoutContext,layoutIsComplete}=await import('/src/services/layout-context.js');
  const {isFixedContentLayout,retainFixedLayout,layoutContextKey}=await import('/src/domain/slides/context-policy.js');
  const p={id:'fixed-check',title:'고정 장 검사',customer:'검증 고객',ind:null,req:{free:[{t:'매장 사이니지를 도입합니다.'}],form:{keymen:[]},files:[]},ctx:{products:['qm55c'],solutions:[],cases:[]},parts:[{id:'why',type:'why',name:'Why Samsung',items:[],layouts:[]}]};
  const sheet=(f,ov={t:{},img:{}})=>{const x={uid:f,f,status:'done',ov,ev:{}};p.parts[0].layouts.push(x);return x;};
  // Why Samsung 4 as the standard deck carries it (레이아웃 자동 구성 → 표준 제안서): its four authored photos
  const why4={t:{},img:{0:{src:'img/fill/r4-mdmf.json#5',fit:'cover',name:'배송 — 물류 창고',keep:true},1:{src:'img/fill/r9-bs04.json#3',fit:'cover',name:'설치 — 천장 실내기 설치 · 점검',keep:true},
   2:{src:'img/ph/ed-ac-clean.jpg',fit:'cover',name:'유지보수 — 에어컨 세척 · 케어',keep:true},3:{src:'img/fill/r9-bs21.json#0',fit:'cover',name:'서비스 — 비즈니스 고객 상담 센터',keep:true}}};
  const fixed=['L_VS_WHY_1','L_VS_WHY_2','L_VS_WHY_3','L_VS_WHY_5','L_VS_END'].map(f=>sheet(f)).concat(sheet('L_VS_WHY_4',why4));
  for(const x of fixed)retainFixedLayout(x,layoutContextKey(p,p.parts[0]));
  const open=sheet('L_PH_P3_A');   // an ordinary sheet whose template names products that are not linked
  // the same maintenance photo on an ordinary sheet: there the inspection has to keep reporting it
  const photoOnOrdinary=inspectLayoutContext(p,{uid:'ordinary',f:'L_PH_P3_A',status:'done',ov:{t:{},img:{0:structuredClone(why4.img[2])}},ev:{}});
  const {showsUnlinkedProduct}=await import('/src/services/images.js');
  return {fixed:fixed.map(x=>({f:x.f,isFixed:isFixedContentLayout(x),issues:inspectLayoutContext(p,x),complete:layoutIsComplete(p,x)})),
   photoIsUnlinked:showsUnlinkedProduct(why4.img[2],p.ctx.products,[]),open:inspectLayoutContext(p,open),photoOnOrdinary};
 });
 assert.equal(seen.photoIsUnlinked,true,'the fixture reproduces the case: the maintenance photo shows a product that is not linked');
 assert.ok(seen.fixed.every(x=>x.isFixed));
 assert.deepEqual(seen.fixed.filter(x=>x.issues.length).map(x=>[x.f,x.issues]),[],'a fixed-content sheet is not judged against this customer\'s selection');
 assert.ok(seen.fixed.every(x=>x.complete),'a fixed-content sheet counts as complete');
 pass('Fixed-content sheets (Why Samsung · closing) are never reported as showing an unselected product, so they cannot block export or stay "in progress"');
 assert.ok(seen.open.some(issue=>/선택하지 않은 제품/.test(issue)),'an ordinary sheet that names unlinked products is still reported: '+JSON.stringify(seen.open));
 assert.ok(seen.photoOnOrdinary.some(issue=>/현재 선택한 제품과 다른 이미지: 유지보수/.test(issue)),'the same photo on an ordinary sheet is still reported: '+JSON.stringify(seen.photoOnOrdinary));
 pass('An ordinary sheet that names or shows products outside the selection is still reported');
 assert.deepEqual(modelCalls,[],'inspection never calls the model');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:results,pageErrors:errors},null,2));
 console.log('ALL PASS ('+results.length+')');
}catch(error){console.error('Page errors:',errors);if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
finally{await browser?.close();await server.close();}
