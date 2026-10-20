// Regression: viewing history never regenerates it; failed background work cannot hide or partly overwrite it.
// Optional real complex-slide check: WINMATE_CONTEXT_LIVE=http://127.0.0.1:<isolated API> node app/tests/layout-history.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const boot={catalog:read('catalog'),products:read('products_db'),images:read('images'),user:{username:'history-test',auth_enabled:false},capabilities:null};
const f=boot.catalog.layouts.find(l=>l.p==='overview').f;
const text=i=>({uid:i,f,status:i==='plain'?'done':'partial',ov:{t:{0:'보관 원문 '+i},img:{}},ev:{t0:{by:'user',src:[]}},
 ...(i==='failed'?{adaptation:{phase:'error',request:'old-error',error:'AI 응답을 받지 못했어요. 다시 시도해 주세요.'}}:{}),
 ...(i==='pending'?{adaptation:{phase:'running',request:'old-running',queuedAt:1}}:{}),
 ...(i==='current-error'?{adaptation:{version:3,origin:'retry',phase:'error',errorCode:'network',error:'AI 서비스 연결 시간 초과',request:'current',queuedAt:1}}:{}),
 ...(i==='obsolete-image'?{adaptation:{version:2,origin:'context',phase:'error',previousStatus:'done',errorCode:'upstream_error',error:'AI 요청 실패 (502)',request:'old-image',queuedAt:1}}:{}),
 ...(i==='obsolete-shared'?{adaptation:{version:2,origin:'added',phase:'running',previousStatus:'done',request:'old-shared',queuedAt:1}}:{}),
 ...(i==='failed-added'?{ov:{t:{},img:{}},ev:{},adaptation:{version:2,origin:'added',phase:'error',error:'실제 신규 레이아웃 채우기 실패',request:'added',queuedAt:1}}:{})});
const history={id:'history-fixture',title:'기존 히스토리',customer:'보관 고객',createdAt:1,updatedAt:1,ind:null,stage:'story',reqTab:'form',
 req:{free:[{t:'저장된 기록을 유지합니다.'}],form:{project:'보관 프로젝트',customer:'보관 고객',keymen:[],note:''},files:[]},ctx:{products:['qm55c'],solutions:[],cases:[]},
 parts:[{id:'history-part',type:'overview',name:'보관된 파트',items:['저장된 내용'],done:true,layouts:['plain','failed','pending','current-error','obsolete-image','obsolete-shared','failed-added'].map(text)}]};
const out=path.join(root,'app/tests/output/layout-history');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
const results=[],calls=[],errors=[];let page,browser,mode='batch-failure';
const pass=s=>{results.push(s);console.log('PASS '+s);};
try{
 await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000}});
 await context.addInitScript(h=>{if(!localStorage.getItem('winmate.v2.proposals')){localStorage.setItem('winmate.v2.proposals',JSON.stringify([h]));localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'proposal',id:h.id}}));}},history);
 await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:boot});
  if(url.pathname.startsWith('/api/product-packs/'))return route.fulfill({json:JSON.parse(fs.readFileSync(path.join(root,'reference/live/img/prod/d00.json'),'utf8'))});
  if(url.pathname==='/api/llm'){
   const body=route.request().postDataJSON();const input=JSON.parse(body.prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]);calls.push({stream:body.stream,input});
   if(process.env.WINMATE_CONTEXT_LIVE)return route.fulfill({response:await context.request.post(process.env.WINMATE_CONTEXT_LIVE+'/api/llm',{data:body,timeout:120000})});
   if(mode==='batch-failure'&&input.batch===2)return route.fulfill({status:504,json:{code:'network',message:'AI 서비스 연결 시간 초과'}});
   return route.fulfill({json:{mode:'real',data:{blocks:input.blocks.map(b=>({i:b.i,action:'replace',s:'안내 문구 '+b.i,src:[],reason:'test-only bounded batch response'})),
    images:input.images.map(im=>({i:im.i,action:'clear',n:-1,reason:'test-only unresolved image'})),replacements:[],missing:[]}}});
  }
  return route.fulfill({status:503,json:{code:'test_no_api'}});
 });
 await context.route('**/img/**',route=>{
  const rel=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);const file=path.join(root,rel.startsWith('img/lib/')?rel:'app/data/static/'+rel);
  return fs.existsSync(file)?route.fulfill({path:file}):route.abort();
 });
 await context.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>route.abort());
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.waitForFunction(()=>document.querySelector('.app')&&!document.querySelector('.boot'));
 await page.evaluate(async()=>{window.__historyRepo=await import('/src/repositories/proposals.js');});
 await page.waitForTimeout(650);
 const kept=await page.evaluate(()=>window.__historyRepo.getProposal('history-fixture'));
 assert.equal(calls.length,0);
 for(const original of history.parts[0].layouts){const current=kept.parts[0].layouts.find(x=>x.uid===original.uid);assert.deepEqual(current.ov,original.ov);assert.deepEqual(current.ev,original.ev);assert.equal(current.status,original.adaptation?.previousStatus||original.status);}
 assert.ok(kept.parts[0].layouts.slice(0,3).every(x=>x.adaptation.phase==='retained'));
 assert.equal(kept.parts[0].layouts[3].adaptation.phase,'error');
 pass('Opening saved history makes zero model requests and preserves text, images, evidence and status');
 await page.getByText('보관 원문 failed',{exact:true}).waitFor();
 await page.getByText('보관 원문 pending',{exact:true}).waitFor();
 pass('Old eager-sweep error/running records recover their saved previews');
 const failureCard=page.locator('[data-layout-uid="current-error"]');
 await failureCard.getByText('보관 원문 current-error',{exact:true}).waitFor();
 await failureCard.getByRole('status',{name:'저장된 레이아웃 유지'}).waitFor();
 assert.equal(await failureCard.locator('.stbadge.done').count(),0);
 pass('A genuine new failure keeps the saved slide visible without marking it complete');
 for(const uid of ['obsolete-image','obsolete-shared']){
  const x=kept.parts[0].layouts.find(x=>x.uid===uid);assert.equal(x.adaptation.phase,'retained');assert.equal(x.adaptation.needsReview,true);assert.equal(x.adaptation.version,3);
  const card=page.locator(`[data-layout-uid="${uid}"]`);await card.scrollIntoViewIfNeeded();await card.getByText('보관 원문 '+uid,{exact:true}).waitFor();assert.equal(await card.locator('.context-preserved-note,.context-slide').count(),0);
 }
 assert.equal(kept.parts[0].layouts.find(x=>x.uid==='failed-added').adaptation.phase,'error');
 assert.equal(kept.parts[0].layouts.find(x=>x.uid==='obsolete-image').adaptation.previousError,'AI 요청 실패 (502)');
 await page.locator('[data-layout-uid="obsolete-image"]').click();await page.locator('.modal .detail').waitFor();
 assert.equal(await page.locator('.detail-left .context-preserved-note').count(),0);assert.ok(!(await page.locator('.modal .detail').innerText()).includes('AI 요청 실패'));
 assert.equal(await page.locator('.done-toggle').count(),0);
 assert.equal(await page.locator('[data-layout-uid="obsolete-image"] .layout-complete').getAttribute('aria-pressed'),'false');
 assert.equal(await page.locator('[data-layout-uid="obsolete-image"] .layout-complete').isEnabled(),false);
 await page.screenshot({path:path.join(out,'obsolete-error-recovered.png'),animations:'disabled'});
 await page.locator('.modal').filter({has:page.locator('.detail')}).getByRole('button',{name:'닫기',exact:true}).last().click();
 const migration=await page.evaluate(async()=>{const {retainHistoryLayouts}=await import('/src/domain/slides/context-policy.js');return retainHistoryLayouts(structuredClone(window.__historyRepo.getProposal('history-fixture')));});
 assert.equal(migration,false);assert.equal(calls.length,0);
 pass('Obsolete image-edit and sharing jobs recover saved content without error banners, AI calls or false completion; genuine failures remain errors');
 const hydrated=await page.evaluate(()=>{
  const document=structuredClone(window.__historyRepo.getProposal('history-fixture'));document.id='owner-first-load';document.parts[0].layouts=document.parts[0].layouts.filter(x=>x.uid==='plain');delete document.parts[0].layouts[0].adaptation;
  const snapshot={token:'owner-first-load-regression-token-12345',isOwner:true,canEdit:true,permission:'view',revision:1,sourceId:document.id,document};
  const first=window.__historyRepo.sharedProposal(snapshot);
  const changed=structuredClone(snapshot);changed.revision=2;changed.document.parts[0].layouts[0].ov.img[0]={src:'img/qm55c-persp.png',name:'직접 선택한 사진',selectedBy:'user'};
  const second=window.__historyRepo.sharedProposal(changed);
  return {first:first.parts[0].layouts[0],second:second.parts[0].layouts[0]};
 });
 await page.waitForTimeout(650);assert.equal(calls.length,0);assert.equal(hydrated.first.adaptation.phase,'retained');assert.equal(hydrated.second.adaptation.phase,'retained');
 assert.deepEqual(hydrated.first.ov.t,hydrated.second.ov.t);assert.equal(hydrated.second.ov.img[0].name,'직접 선택한 사진');
 pass('First owner hydration of a shared Storyboard and later image-only sync both make zero model requests');
 await page.screenshot({path:path.join(out,'history-preserved.png'),animations:'disabled'});
 const queued=await page.evaluate(async()=>{const {markLayoutChanges}=await import('/src/domain/slides/context-policy.js');const p=window.__historyRepo.getProposal('history-fixture'),d=structuredClone(p);d.customer='다른 고객';markLayoutChanges(d,p);return d.parts[0].layouts.map(x=>x.adaptation.phase);});
 assert.ok(queued.every(phase=>phase==='queued'));assert.equal(calls.length,0);
 pass('Explicit customer/context changes still queue every affected historical layout');
 if(process.env.WINMATE_CONTEXT_LIVE){
  const live=await page.evaluate(async()=>{
   const {personalizeLayout}=await import('/src/services/layout-context.js');const p=structuredClone(window.__historyRepo.getProposal('history-fixture'));
   p.customer='검증 카페';p.ctx={products:['qm55c'],solutions:['magicinfo'],cases:[]};p.req.free=[{t:'카페 실내 메뉴 화면을 QM55C로 전환합니다. 실제 고객 수치가 없으므로 효과와 매장 수를 만들지 마세요.'}];
   const progress=[];const result=await personalizeLayout(p,{id:'live',name:'고객 운영 과제',type:'customer',items:['실내 메뉴 운영 개선'],text:''},
    {uid:'live',f:'L_PH_MI_FB_B',ov:{t:{},img:{}}},{onProgress:p=>progress.push(p)});
   return {progress,missing:result.missing,textCount:Object.keys(result.ov.t).length,imageCount:Object.keys(result.ov.img).length};
  });
  assert.ok(live.progress.length>=3);assert.equal(live.progress.at(-1).done,live.progress.at(-1).total);
  assert.ok(calls.every(c=>c.stream===false&&c.input.blocks.length<=12&&c.input.images.length<=4));
  fs.writeFileSync(path.join(out,'live.json'),JSON.stringify(live,null,2));pass('Real Gemini completes a 35-text/7-image historical template in bounded batches');
 }else{
  const before=await page.evaluate(async()=>{
   const {saveTemplates,myMeta}=await import('/src/repositories/templates.js');const f='L_MY_HISTORY_BATCH';
   const html='<div style="position:relative;width:1280px;height:720px;background:#fff">'+Array.from({length:50},(_,i)=>`<div data-tb="${i}" style="position:absolute;left:50px;top:${25+i*12}px;font-size:12px">기존 안내 문구 ${i}</div>`).join('')+'</div>';
   await saveTemplates([{meta:myMeta({f,name:'긴 레이아웃',p:'overview',kind:'edit'}),html}]);
   const x={uid:'batch',f,status:'done',ov:{t:{0:'내가 저장한 내용'},img:{}},ev:{t0:{by:'user',src:[]}}};
   window.__historyRepo.update('history-fixture',p=>p.parts[0].layouts.push(x));return {ov:x.ov,ev:x.ev};
  });
  await page.waitForFunction(()=>window.__historyRepo.getProposal('history-fixture').parts[0].layouts.find(x=>x.uid==='batch')?.adaptation.phase==='error');
  let batch=await page.evaluate(()=>window.__historyRepo.getProposal('history-fixture').parts[0].layouts.find(x=>x.uid==='batch'));
  assert.deepEqual(batch.ov,before.ov);assert.deepEqual(batch.ev,before.ev);assert.equal(batch.adaptation.errorCode,'network');
  assert.equal(batch.adaptation.error,'AI 서비스 연결 시간 초과');assert.equal(batch.adaptation.progress.done,1);
  pass('A later batch failure leaves all saved values intact and preserves the actual server error');
  mode='normal';await page.locator('[data-layout-uid="batch"]').getByRole('button',{name:'다시 시도',exact:true}).click();
  await page.waitForFunction(()=>window.__historyRepo.getProposal('history-fixture').parts[0].layouts.find(x=>x.uid==='batch')?.adaptation.phase==='ready');
  batch=await page.evaluate(()=>window.__historyRepo.getProposal('history-fixture').parts[0].layouts.find(x=>x.uid==='batch'));
  assert.equal(Object.keys(batch.ov.t).length,50);assert.equal(batch.adaptation.progress.done,5);
  assert.ok(calls.every(c=>c.stream===false&&c.input.blocks.length<=12&&c.input.images.length<=4));
  const after=await page.evaluate(()=>window.__historyRepo.getProposal('history-fixture'));
  for(const old of history.parts[0].layouts)assert.deepEqual(after.parts[0].layouts.find(x=>x.uid===old.uid).ov,old.ov);
  pass('Retry applies all 50 slots only after five bounded JSON batches succeed');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,process.env.WINMATE_CONTEXT_LIVE?'live-result.json':'result.json'),JSON.stringify({passed:results,pageErrors:errors,requests:calls.length},null,2));
}catch(error){console.error('Page errors:',errors);if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-1800));await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'});}throw error;}
finally{await browser?.close();await server.close();}
