// Layout context fill — which figures the verifier accepts, and what happens when it rejects part of a model answer.
// Contracts (model answers are scripted here; the lifecycle around them is the real one):
//   1. A total one evidence sentence states by multiplication ("매장 3곳에 각 2대" → 6대) is a stated figure; nothing else is derived.
//   2. A rejected block is asked again on its own; blocks that already passed are kept, not regenerated.
//      What to fix is written after DATA (the prompt tells the model not to follow anything inside DATA).
//   3. A block the model left out is asked for on its own; an answer for a block outside the batch is never applied.
//   4. A block that never passes still fails the sheet — nothing is applied, saved content stays.
//   6. A replacement the sheet cannot apply (its "from" is not on the sheet) gets one more answer; after that it is left out —
//      the sheet is not failed for it.
//   5. A sheet answered in several batches gives every batch the whole sheet cell by cell (outline), locked cells included,
//      so a cell asked about away from its row — a page number, a label — is still seen in its place.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const json=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const boot={catalog:json('catalog'),products:json('products_db'),images:json('images'),capabilities:null,user:{username:'context-repair-test',auth_enabled:false}};
const details=JSON.parse(fs.readFileSync(path.join(root,'reference/live/img/prod/d00.json'),'utf8'));
const out=path.join(root,'app/tests/output/layout-context-repair');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
const results=[],errors=[];let browser,page;
const pass=name=>{results.push(name);console.log('PASS '+name);};
// One scripted answer per model call of the running scenario; `calls` keeps what each call was asked.
let script=[],calls=[];
const answer=(input,texts,{drop=[]}={})=>({
 blocks:input.blocks.filter(b=>!drop.includes(b.i)).map(b=>({i:b.i,action:texts[b.i]===undefined||texts[b.i]===b.current?'keep':'replace',s:texts[b.i]??b.current,src:[],reason:'test protocol fixture'})),
 images:[],replacements:[],missing:[]});
const FIRST={0:'검증 고객 도입 안내',1:'메뉴보드 도입 수량',2:'매장 3곳 · 각 2대 도입'};
try{
 await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000}});
 await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:boot});
  if(url.pathname.startsWith('/api/product-packs/'))return route.fulfill({json:details});
  if(url.pathname==='/api/llm'){
   const body=route.request().postDataJSON();
   if(!body.prompt?.includes('선택된 레이아웃 한 장'))return route.fulfill({status:503,json:{code:'test_no_api'}});
   const input=JSON.parse(body.prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]);
   const next=script.shift();calls.push({input,rules:body.prompt.split('<<<DATA\n')[0],tail:body.prompt.split('\nDATA>>>')[1]||'',scripted:!!next});
   if(!next)return route.fulfill({status:503,json:{code:'unavailable',message:'unscripted model call'}});
   try{return await route.fulfill({json:{mode:'real',data:next(input)}});}catch{/* a cancelled stale request */}
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

 const state=()=>page.evaluate(()=>window.__ctxRepo.getProposal(window.__contextPid).parts[0].layouts[0]);
 let lastRequest='';
 const run=async(steps,start)=>{
  script=[...steps];calls=[];
  await start();
  await page.waitForFunction(request=>{const a=window.__ctxRepo.getProposal(window.__contextPid).parts[0].layouts[0].adaptation;return a?.request&&a.request!==request&&['ready','review','error'].includes(a.phase);},lastRequest,{timeout:30000});
  const x=await state();lastRequest=x.adaptation.request;return x;
 };
 const retry=()=>page.evaluate(async()=>{const {retryLayoutContext}=await import('/src/services/layout-context.js');retryLayoutContext(window.__contextPid,'repair-sheet');});

 // ---- 1: which figures count as stated ----
 const totals=await page.evaluate(async cases=>{const {derivedTotals}=await import('/src/services/layout-context.js');return cases.map(text=>[...derivedTotals(text)].sort());},[
  '매장 3곳에 QM55C 메뉴보드 각 2대를 도입한다.',          // per-unit quantity × count
  '3개 매장에 키오스크를 2대씩 설치한다.',
  '5개 층에 층당 4대, 로비는 제외한다.',
  '매장마다 2명, 매장은 12곳이다.',
  '각 매장에 2대를 두며 대상은 4곳이다.',
  '매장 3곳에 메뉴보드 2대를 도입한다.',                   // no "each": 2 or 6 — not stated
  '본관 10대, 별관 5대를 설치한다.',                       // a sum needs the meaning of the sentence
  '담당 3명이 식당 2곳을 관리한다.',                       // 담당 · 식당 are not "per unit"
  '생각 2대, 매장 3곳',                                    // 생각 is not 각
  'QM55C 2대씩 설치한다.',                                 // the 55 of a model name is not a count
  '매장 3곳에 도입한다. 지점별 각 2대는 추후 확정한다.',   // different sentences
  ['매장 3곳에 도입한다','각 2대'],                        // different evidence items
  '키오스크 6대를 대당 150만원에 도입한다.',               // money per unit × count
  '매장 3곳에서 각 20% 늘었다.',                           // a ratio does not add up
  '매장 4곳에 각 500nit 화면을 12개월 운영한다.',          // nor does brightness or a period
  '매장 3곳에 2.5대씩 배정한다.',                          // not a whole number
 ]);
 assert.deepEqual(totals,[['6대'],['6대'],['20대'],['24명'],['8대'],[],[],[],[],[],[],[],['900만원'],[],[],[]]);
 pass('Only a per-unit quantity × a count in the same sentence gives a stated total (6대 from 3곳 · 각 2대); sums, look-alike words and other sentences give none');

 // ---- 1 · 2: the stated total passes at once; a figure the evidence does not state → only that block is asked again ----
 let done=await run([
  input=>answer(input,{...FIRST,0:'검증 고객 메뉴보드 6대',1:'메뉴보드 7대 도입'}),
  input=>answer(input,{1:FIRST[1]}),
 ],()=>page.evaluate(async()=>{
  const repo=await import('/src/repositories/proposals.js');const {myMeta,saveTemplates}=await import('/src/repositories/templates.js');
  const f='L_MY_CONTEXT_REPAIR';
  const html='<div style="width:1280px;height:720px;position:relative;background:#fff;font-family:sans-serif"><div data-tb="0" style="position:absolute;left:64px;top:60px;font-size:30px">A 예시 고객 도입 안내</div><div data-tb="1" style="position:absolute;left:64px;top:130px;font-size:22px">예시 수량 안내 문구</div><div data-tb="2" style="position:absolute;left:64px;top:190px;font-size:22px">예시 설명 문구를 여기에 적습니다</div><div data-tb="3" style="position:absolute;left:64px;top:250px;font-size:22px">제품 안내</div></div>';
  await saveTemplates([{meta:myMeta({f,name:'맥락 복구 검증 템플릿',p:'products',kind:'edit'}),html}]);
  const id=repo.createProposal();window.__contextPid=id;window.__ctxRepo=repo;
  repo.update(id,p=>{p.title='맥락 복구 검사';p.customer='검증 고객';p.stage='story';p.req.free=[{t:'검증 고객 매장 3곳에 메뉴보드 각 2대를 도입합니다.'}];p.ctx.products=['qm55c'];p.parts=[{id:'repair-part',name:'제품 안내',type:'products',items:['선택한 제품 안내'],done:true,layouts:[{uid:'repair-sheet',f,status:'empty',ov:{t:{},img:{}}}]}];});
 }));
 assert.equal(done.adaptation.phase,'ready',JSON.stringify(done.adaptation));
 assert.equal(calls.length,2,'one first answer + one repair, not a second full answer');
 assert.deepEqual(calls[0].input.blocks.map(b=>b.i),[0,1,2,3]);
 assert.equal(calls[0].tail.includes('직전 답'),false);
 assert.deepEqual(calls[1].input.blocks.map(b=>b.i),[1],'only the rejected block is asked again — the 6대 title was accepted');
 assert.deepEqual(calls[1].input.blocks[0],calls[0].input.blocks[1],'the block is asked exactly as before; nothing to follow is put inside DATA');
 assert.deepEqual(calls[1].input.settled.map(b=>[b.i,b.s]),[[0,'검증 고객 메뉴보드 6대'],[2,FIRST[2]],[3,'제품 안내']],'accepted blocks are shown as settled context');
 assert.ok(calls[1].tail.includes('칸 1')&&calls[1].tail.includes('7대')&&calls[1].tail.includes('"메뉴보드 7대 도입"'),'what to fix — block, fault, previous answer — is written after DATA: '+calls[1].tail);
 assert.equal(calls[1].rules,calls[0].rules,'the repair is asked under the same rules');
 assert.deepEqual(done.ov.t,{0:'검증 고객 메뉴보드 6대',1:FIRST[1],2:FIRST[2]},'blocks from the first answer are kept; the repaired block is added');
 pass('A stated total (6대) passes at once; a figure the evidence does not state (7대) is repaired on its own and the accepted blocks are kept');

 // ---- 3: a block the model left out ----
 done=await run([
  input=>answer(input,FIRST,{drop:[2]}),
  input=>answer(input,{2:'매장 3곳 도입 안내'}),
 ],retry);
 assert.equal(done.adaptation.phase,'ready',JSON.stringify(done.adaptation));
 assert.equal(calls.length,2);
 assert.deepEqual(calls[1].input.blocks.map(b=>b.i),[2],'only the missing block is asked for');
 assert.equal(done.ov.t[2],'매장 3곳 도입 안내');assert.equal(done.ov.t[0],FIRST[0]);
 pass('A block the model left out is asked for on its own');

 // ---- an answer for a block that is not in this batch is not applied ----
 done=await run([
  input=>({...answer(input,FIRST),blocks:[...answer(input,FIRST).blocks,{i:9,action:'replace',s:'이 묶음에 없는 칸',src:[],reason:'test protocol fixture'}]}),
 ],retry);
 assert.equal(done.adaptation.phase,'ready',JSON.stringify(done.adaptation));
 assert.equal(calls.length,1);assert.equal(done.ov.t[9],undefined);
 pass('An answer for a block outside the batch is never applied');

 // ---- 4: never passes → the sheet fails, saved content stays ----
 const before=await state();
 done=await run([
  input=>answer(input,{...FIRST,1:'메뉴보드 7대 도입'}),
  input=>answer(input,{1:'메뉴보드 총 7대'}),
  input=>answer(input,{1:'7대 도입 확정'}),
 ],retry);
 assert.equal(done.adaptation.phase,'error');assert.equal(done.adaptation.errorCode,'invalid_output');
 assert.ok(done.adaptation.error.includes('칸 1')&&done.adaptation.error.includes('7대'),done.adaptation.error);
 assert.equal(calls.length,3,'first answer + repair + the one retry a repair gets');
 assert.deepEqual(calls.slice(1).map(c=>c.input.blocks.map(b=>b.i)),[[1],[1]]);
 assert.deepEqual(done.ov,before.ov);assert.deepEqual(done.ev,before.ev);assert.notEqual(done.status,'done');
 pass('A block that never passes fails the sheet: nothing is applied and saved content stays');

 // ---- 6: a replacement the sheet cannot apply ----
 const withReplacements=(input,list)=>({...answer(input,{}),replacements:list});
 done=await run([
  input=>withReplacements(input,[{from:'이 장에 없는 문구',to:'바꿀 말'}]),
  input=>withReplacements(input,[{from:'이 장에 없는 문구',to:'바꿀 말'},{from:'제품 안내',to:'제품 소개'}]),
 ],retry);
 assert.notEqual(done.adaptation.phase,'error',JSON.stringify(done.adaptation));
 assert.equal(calls.length,2,'the unusable replacement is sent back once');
 assert.ok(calls[1].tail.includes('실제 원문에 존재하는 고정 문구만 치환하세요'),'the second answer is asked to fix it');
 assert.deepEqual(done.ov.r,[['제품 안내','제품 소개']],'only the replacement the sheet can apply is kept');
 pass('A replacement whose text is not on the sheet gets one more answer, then is left out instead of failing the sheet');

 // ---- 5: several batches → each one sees the whole sheet ----
 assert.equal(calls.every(c=>c.input.outline===undefined),true,'a sheet answered in one batch needs no outline');
 script=Array.from({length:4},()=>input=>answer(input,{}));calls=[];
 await page.evaluate(async()=>{
  const {myMeta,saveTemplates}=await import('/src/repositories/templates.js');const f='L_MY_CONTEXT_OUTLINE';
  // seven rows of a contents page: number (locked) · title · page range — 14 cells to review, 7 locked
  const html='<div style="width:1280px;height:720px;position:relative;background:#fff;font-family:sans-serif">'+Array.from({length:7},(_,r)=>`<div data-tb="${r*3}" data-fix="section" style="position:absolute;left:60px;top:${40+r*90}px;font-size:20px">0${r+1}</div><div data-tb="${r*3+1}" style="position:absolute;left:120px;top:${40+r*90}px;font-size:20px">검증 고객 안내 ${r+1}</div><div data-tb="${r*3+2}" style="position:absolute;left:900px;top:${40+r*90}px;font-size:16px">p.${r*3+1}–${r*3+3}</div>`).join('')+'</div>';
  await saveTemplates([{meta:myMeta({f,name:'맥락 묶음 검증 템플릿',p:'overview',kind:'edit'}),html}]);
  window.__ctxRepo.update(window.__contextPid,p=>{p.parts[0].layouts.push({uid:'outline-sheet',f,status:'empty',ov:{t:{},img:{}}});});
 });
 await page.waitForFunction(()=>['ready','review','error'].includes(window.__ctxRepo.getProposal(window.__contextPid).parts[0].layouts.find(x=>x.uid==='outline-sheet')?.adaptation?.phase),null,{timeout:30000});
 const outlined=await page.evaluate(()=>window.__ctxRepo.getProposal(window.__contextPid).parts[0].layouts.find(x=>x.uid==='outline-sheet'));
 assert.equal(outlined.adaptation.phase,'ready',JSON.stringify(outlined.adaptation));
 const batches=calls.filter(c=>c.input.layout?.name==='맥락 묶음 검증 템플릿').sort((a,b)=>a.input.batch-b.input.batch);
 assert.deepEqual(batches.map(c=>c.input.blocks.map(b=>b.i)),[[1,2,4,5,7,8,10,11,13,14,16,17],[19,20]],'locked cells are not asked about; the last row falls into a second batch');
 for(const c of batches){
  assert.deepEqual(c.input.outline.map(b=>b.i),Array.from({length:21},(_,i)=>i),'every cell of the sheet, in reading order');
  assert.deepEqual(c.input.outline.slice(18).map(b=>b.s),['07','검증 고객 안내 7','p.19–21'],'the last row is shown whole — locked number, title, page range');
  assert.ok(c.rules.includes('outline'),'the prompt says what the outline is for');
 }
 pass('A sheet split into batches shows each batch the whole sheet cell by cell, so a page-number or label cell is read in its row');

 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:results,pageErrors:errors},null,2));
 console.log('ALL PASS ('+results.length+')');
}catch(error){console.error('Page errors:',errors);console.error('Model calls:',JSON.stringify(calls.map(c=>({blocks:c.input.blocks,settled:c.input.settled,scripted:c.scripted})),null,1).slice(0,3000));if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
finally{await browser?.close();await server.close();}
