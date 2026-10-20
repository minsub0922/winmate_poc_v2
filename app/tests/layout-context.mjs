// Context lifecycle/image identity contracts. Test-only model responses exercise transport/races,
// not model quality. Set WINMATE_CONTEXT_LIVE=http://127.0.0.1:<isolated API> for a real Gemini sample.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const json=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const boot={catalog:json('catalog'),products:json('products_db'),images:json('images'),capabilities:null,user:{username:'context-test',auth_enabled:false}};
const selectedId=process.env.WINMATE_CONTEXT_PRODUCT||'qm55c';
const selectedModel=boot.catalog.products.find(p=>p.id===selectedId).model;
const library=JSON.parse(fs.readFileSync(path.join(root,'img/lib/index.json'),'utf8'));
const details=JSON.parse(fs.readFileSync(path.join(root,'reference/live/img/prod/d00.json'),'utf8'));
const out=path.join(root,'app/tests/output/layout-context');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
const results=[],errors=[],calls=[];let browser,page,mode='normal';const held=[];
const pass=name=>{results.push(name);console.log('PASS '+name);};
const response=input=>{
 const product=boot.catalog.products.find(p=>input.context.includes('('+p.model+','));
 assert.ok(product,'selected product in context');
 const values={0:'검증 고객',1:product.model,2:'확인된 사양',3:'제품 안내'};
 return {blocks:input.blocks.map(b=>({i:b.i,action:b.current===values[b.i]?'keep':'replace',s:values[b.i]||b.current,src:[],reason:'test protocol fixture: reviewed against selected context'})),
  images:input.images.map(s=>{const im=s.candidates.find(im=>im.products.includes(product.id));return {i:s.i,action:im?'replace':'clear',n:im?.n??-1,reason:'test protocol fixture: exact selected product'};}),replacements:[],missing:[]};
};
try{
 await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000}});
 await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:boot});
  if(url.pathname.startsWith('/api/product-packs/'))return route.fulfill({json:details});
  if(url.pathname==='/api/llm'){
   const body=route.request().postDataJSON();
   if(process.env.WINMATE_CONTEXT_LIVE)return route.fulfill({response:await context.request.post(process.env.WINMATE_CONTEXT_LIVE+'/api/llm',{data:body,timeout:120000})});
   const input=JSON.parse(body.prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]);calls.push(input);
   if(mode==='error')return route.fulfill({status:503,json:{code:'unavailable',message:'test failure'}});
   if(mode==='forbidden')return route.fulfill({status:403,json:{code:'csrf_rejected',detail:'검증용 요청 출처 거부'}});
   if(mode==='hold')await new Promise(resolve=>held.push({resolve,input}));
   const data=response(input);
   if(mode==='invalid')data.blocks[1].s='OH55A-S';
   if(mode==='clear')data.images=data.images.map(im=>({...im,action:'clear',n:-1}));
   try{return await route.fulfill({json:{mode:'real',data}});}catch{/* a cancelled stale request */}
   return;
  }
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
 const audit=await page.evaluate(async()=>{
  const {ALL_LAYOUTS}=await import('/src/services/catalog.js');const {readBlocks,readImageSlots}=await import('/src/domain/slides/Slide.jsx');
  const problems=[];
  for(const l of ALL_LAYOUTS){try{const t=readBlocks(l.f,undefined,true),im=readImageSlots(l.f);if(new Set(t.map(x=>x.i)).size!==t.length||new Set(im.map(x=>x.i)).size!==im.length)problems.push(l.f);}catch(e){problems.push(l.f+': '+e.message);}}
  return {count:ALL_LAYOUTS.length,problems};
 });
 assert.deepEqual(audit.problems,[]);pass('All '+audit.count+' registered layout structures expose unambiguous text/image slots');
 const ranking=await page.evaluate(async()=>{
  const {loadImageLibrary,imagePool}=await import('/src/services/image-library.js');const {relatedImages}=await import('/src/services/images.js');
  const images=imagePool({products:['qm55c','oh55a']},await loadImageLibrary());
  const current=images.find(im=>im.products?.includes('qm55c')&&im.group==='cut');
  const related=relatedImages(images,{current,productIds:['oh55a'],models:['OH55A-S'],kind:'cut',hint:'옥외 고휘도 OH55A'});
  const absent=relatedImages(images,{current:{products:['definitely-missing'],model:'NOT-A-PRODUCT'},productIds:[],kind:'cut'});
  return {count:related.length,bad:related.filter(im=>!im.products?.includes('qm55c')).length,first:related[0]?.desc,unrelatedEmpty:absent.length};
 });
 assert.ok(ranking.count>1);assert.equal(ranking.bad,0);assert.equal(ranking.unrelatedEmpty,0);pass('Replacement images follow the current product even when template hints/other selected models conflict');

 mode=process.env.WINMATE_CONTEXT_LIVE?'normal':'hold';
 const ids=await page.evaluate(async({productId})=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default;const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const repo=await import('/src/repositories/proposals.js');const {myMeta,saveTemplates}=await import('/src/repositories/templates.js');const {StoryCanvas}=await import('/src/components/storyboard.jsx');const {LayoutDetail}=await import('/src/components/detail.jsx');
  const f='L_MY_CONTEXT_TEST';
  const html='<div style="width:1280px;height:720px;position:relative;background:#fff;font-family:sans-serif"><div data-tb="0" style="position:absolute;left:64px;top:60px;font-size:30px">A 예시 고객</div><div data-tb="1" style="position:absolute;left:64px;top:120px;font-size:26px">OH55A-S</div><div data-tb="2" style="position:absolute;left:64px;top:180px;font-size:22px">2500 nit 옥외 화면</div><div data-tb="3" style="position:absolute;left:64px;top:220px;font-size:22px">제품 안내</div><div data-img="0" data-kind="cut" data-pid="oh55a.front" data-hint="옥외 OH55A 제품 컷" style="position:absolute;left:64px;top:300px;width:300px;height:300px"><img src="img/bs/p-oh55a-s.png" alt="OH55A-S 옥외 화면" style="width:100%;height:100%;object-fit:contain"></div></div>';
  await saveTemplates([{meta:myMeta({f,name:'맥락 검증 템플릿',p:'products',kind:'edit'}),html}]);
  const id=repo.createProposal();window.__contextPid=id;window.__ctxRepo=repo;
  repo.update(id,p=>{p.title='맥락 검사';p.customer='검증 고객';p.stage='story';p.req.free=[{t:'검증 고객 실내 안내 화면을 설치합니다. 선택된 제품만 제안하세요.'}];p.ctx.products=[productId];p.parts=[{id:'ctx-part',name:'제품 안내',type:'products',items:['선택한 제품의 실내 안내'],done:true,layouts:[{uid:'ctx-sheet',f,status:'done',ov:{t:{1:'OH55A-S'},img:{}}}]}];});
  document.getElementById('root').style.display='none';const host=document.createElement('div');host.style.cssText='height:100vh;display:flex;flex-direction:column';document.body.appendChild(host);const mount=createRoot(host);
  function Subject(){const p=repo.useStore(s=>s.proposals.find(p=>p.id===id));const [opened,setOpened]=React.useState(null);return React.createElement(React.Fragment,null,React.createElement(StoryCanvas,{p,open:setOpened,stage:'story',onReq:()=>{},onMatch:()=>{},pageOf:()=>1}),opened?.type==='detail'&&React.createElement(LayoutDetail,{p,partId:opened.partId,uid:opened.uid,pageNo:1,onClose:()=>setOpened(null),open:setOpened}));}
  mount.render(React.createElement(Subject));return {id,f};
 },{productId:selectedId});
 const state=()=>page.evaluate(async()=>{const {getProposal}=await import('/src/repositories/proposals.js');return getProposal(window.__contextPid).parts[0].layouts[0];});
 if(!process.env.WINMATE_CONTEXT_LIVE){
  await page.getByRole('status',{name:'고객 맥락에 맞게 레이아웃을 채우는 중'}).waitFor();
  const loading=await state();assert.notEqual(loading.status,'done');
  await page.screenshot({path:path.join(out,'shimmer.png'),animations:'disabled'});
  await page.waitForFunction(()=>document.querySelector('.context-slide[aria-busy="true"]'));
  while(!held.length)await new Promise(resolve=>setTimeout(resolve,20));
  mode='normal';held.splice(0).forEach(h=>h.resolve());
 }
 await page.waitForFunction(()=>{const {getProposal}=window.__ctxRepo;return ['ready','review','error'].includes(getProposal(window.__contextPid).parts[0].layouts[0].adaptation?.phase);},null,{timeout:120000});
 let done=await state();assert.notEqual(done.adaptation.phase,'error',JSON.stringify(done.adaptation));
 assert.ok(JSON.stringify(done.ov.t).includes(selectedModel));assert.ok(!JSON.stringify(done.ov.t).includes('OH55A-S'));
 const completion=await page.evaluate(async()=>{const {getProposal}=await import('/src/repositories/proposals.js');const {layoutIsComplete}=await import('/src/services/layout-context.js');const p=getProposal(window.__contextPid);return layoutIsComplete(p,p.parts[0].layouts[0]);});
 if(!process.env.WINMATE_CONTEXT_LIVE)assert.equal(completion,true);
 pass(process.env.WINMATE_CONTEXT_LIVE?'Real Gemini reviewed/replaced example products with selected '+selectedModel:'Every added layout starts in shimmer; example values are replaced and only reviewed content completes');
 await page.locator('.lcard[data-layout-uid="ctx-sheet"]').click();
 await page.locator('.detail-left [data-img="0"]').click();
 const imagePop=page.getByRole('dialog',{name:'대체 이미지 고르기',exact:true});
 await imagePop.waitFor();await imagePop.locator('.ip-opt').first().waitFor();
 assert.ok(!(await imagePop.innerText()).includes('OH55A'));
 await page.screenshot({path:path.join(out,'related-images.png'),animations:'disabled'});
 await imagePop.getByRole('button',{name:'닫기',exact:true}).click();
 await page.locator('.modal').filter({has:page.locator('.detail')}).getByRole('button',{name:'닫기',exact:true}).last().click();
 pass('Image replacement UI follows the displayed product, not the original template hint');
 if(process.env.WINMATE_CONTEXT_LIVE){fs.writeFileSync(path.join(out,'live-result.json'),JSON.stringify({adaptation:done.adaptation,ov:done.ov,complete:completion},null,2));}
 else {
  assert.equal(done.ev.t3?.kept,true);pass('Unchanged labels are explicitly reviewed/reused, rather than treated as complete just for being nonempty');
  const beforeForbidden=await state();mode='forbidden';
  await page.evaluate(async()=>{const {retryLayoutContext}=await import('/src/services/layout-context.js');retryLayoutContext(window.__contextPid,'ctx-sheet');});
  await page.waitForFunction(()=>window.__ctxRepo.getProposal(window.__contextPid).parts[0].layouts[0].adaptation.phase==='error');
  const forbidden=await state();assert.equal(forbidden.adaptation.errorStatus,403);assert.equal(forbidden.adaptation.errorCode,'csrf_rejected');
  assert.deepEqual(forbidden.ov,beforeForbidden.ov);assert.deepEqual(forbidden.ev,beforeForbidden.ev);
  await page.locator('.lcard[data-layout-uid="ctx-sheet"]').click();
  assert((await page.locator('.modal.sheet .context-preserved-note').innerText()).includes('검증용 요청 출처 거부'));
  assert.equal(await page.getByRole('button',{name:'현재 맥락으로 다시 채우기',exact:true}).count(),0);
  mode='normal';await page.locator('.modal.sheet .context-preserved-note').getByRole('button',{name:'다시 시도',exact:true}).click();
  await page.waitForFunction(()=>window.__ctxRepo.getProposal(window.__contextPid).parts[0].layouts[0].adaptation.phase==='ready');
  await page.locator('.modal').filter({has:page.locator('.detail')}).getByRole('button',{name:'닫기',exact:true}).last().click();
  pass('403 retains exact server code and saved content; unchanged context hides refill and the error retry still recovers');
  mode='error';await page.evaluate(async()=>{const {retryLayoutContext}=await import('/src/services/layout-context.js');retryLayoutContext(window.__contextPid,'ctx-sheet');});
  await page.waitForFunction(()=>{const {getProposal}=window.__ctxRepo;return getProposal(window.__contextPid).parts[0].layouts[0].adaptation.phase==='error';});
  assert.notEqual((await state()).status,'done');mode='normal';await page.getByRole('button',{name:'다시 시도',exact:true}).click();
  await page.waitForFunction(()=>{const {getProposal}=window.__ctxRepo;return getProposal(window.__contextPid).parts[0].layouts[0].adaptation.phase==='ready';});pass('Failed model requests never complete; retry recovers');
  mode='hold';await page.evaluate(async()=>{const {retryLayoutContext}=await import('/src/services/layout-context.js');retryLayoutContext(window.__contextPid,'ctx-sheet');});
  while(!held.length)await new Promise(resolve=>setTimeout(resolve,20));
  mode='normal';await page.evaluate(async()=>{const {update}=await import('/src/repositories/proposals.js');update(window.__contextPid,p=>{p.ctx.products=['qb55c'];});});
  await page.waitForFunction(()=>{const {getProposal}=window.__ctxRepo;const x=getProposal(window.__contextPid).parts[0].layouts[0];return x.adaptation.phase==='ready'&&JSON.stringify(x.ov).includes('QB55C');});
  held.splice(0).forEach(h=>h.resolve());await page.waitForTimeout(100);done=await state();assert.ok(!JSON.stringify(done.ov.t).includes('QM55C'));pass('Changed product context cancels stale results and automatically reviews the same layout again');
  const created=await page.evaluate(async()=>{const {update,getProposal,cloneProposal}=await import('/src/repositories/proposals.js');
   update(window.__contextPid,p=>{p.parts[0].layouts.push({uid:'fav-copy',f:'L_MY_CONTEXT_TEST',status:'done',ov:{t:{1:'OH55A-S'},img:{}}});});
   const original=getProposal(window.__contextPid),copy=cloneProposal(original);return {fav:original.parts[0].layouts[1].adaptation.phase,clone:getProposal(copy).parts[0].layouts.map(x=>x.adaptation.phase),id:copy};});
  assert.equal(created.fav,'queued');assert.ok(created.clone.every(x=>x==='queued'));pass('Filled favorites/My templates/whole-proposal copies cannot bypass context review');
  await page.waitForFunction(()=>{const {getProposal}=window.__ctxRepo;return getProposal(window.__contextPid).parts[0].layouts.every(x=>x.adaptation.phase==='ready');});
  mode='clear';await page.evaluate(async()=>{const {retryLayoutContext}=await import('/src/services/layout-context.js');retryLayoutContext(window.__contextPid,'ctx-sheet');});
  await page.waitForFunction(()=>window.__ctxRepo.getProposal(window.__contextPid).parts[0].layouts[0].adaptation.phase==='review');
  assert.equal((await state()).ov.img[0].hidden,true);assert.notEqual((await state()).status,'done');
  pass('An unresolved image is explicitly cleared and requires review, never completed using the sample photo');
  mode='invalid';await page.evaluate(async()=>{const {retryLayoutContext}=await import('/src/services/layout-context.js');retryLayoutContext(window.__contextPid,'ctx-sheet');});
  await page.waitForFunction(()=>{const {getProposal}=window.__ctxRepo;return getProposal(window.__contextPid).parts[0].layouts[0].adaptation.phase==='error';});
  assert.notEqual((await state()).status,'done');pass('Model output containing an unselected product is rejected, even when all slots have content');
 }
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'result.png'),animations:'disabled'});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:results,pageErrors:errors,modelCalls:calls.length,live:!!process.env.WINMATE_CONTEXT_LIVE},null,2));
}catch(error){console.error('Page errors:',errors);if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-1800));await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'});}throw error;}
finally{held.splice(0).forEach(h=>h.resolve());await browser?.close();await server.close();}
