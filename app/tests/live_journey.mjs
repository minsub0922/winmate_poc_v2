/** End-to-end business journey with actual Gemini, synthetic requirements and no response substitution. */
import fs from 'node:fs';import path from 'node:path';import {launch,settle,nav,root,output,assert} from './helpers.mjs';
const url=process.env.WINMATE_LIVE_WEB||'http://127.0.0.1:5175';const folder=path.join(output,'strict/live-journey');fs.mkdirSync(folder,{recursive:true});
const browser=await launch();const context=await browser.newContext({viewport:{width:1500,height:900},acceptDownloads:true});const page=await context.newPage();page.setDefaultTimeout(45000);
let pid,pptx,partId,layoutUid;
const previous=process.env.JOURNEY_RESUME?JSON.parse(fs.readFileSync(path.join(folder,'report.json'),'utf8')):null;
const restored=process.env.JOURNEY_RESUME?JSON.parse(fs.readFileSync(path.join(folder,'checkpoint.json'),'utf8')):null;
const from=Number(process.env.JOURNEY_FROM||1);
if(restored){const list=JSON.parse(restored.local['winmate.v2.proposals']);pid=list[0].id;const ui=JSON.parse(restored.local['winmate.v2.ui']||'{}');ui.route={name:'proposal',id:pid};restored.local['winmate.v2.ui']=JSON.stringify(ui);await context.addInitScript(local=>{if(sessionStorage.getItem('strict-restored'))return;for(const[k,v]of Object.entries(local))localStorage.setItem(k,v);sessionStorage.setItem('strict-restored','1');},restored.local);pptx=path.join(folder,'actual-gemini.pptx');}
const rows=[],errors=[];page.on('pageerror',e=>errors.push(String(e)));
const step=async(id,name,fn)=>{if(Number(id.slice(1))<from){const old=previous?.cases.find(c=>c.id===id&&c.pass);assert(old,'missing prior executed step '+id);rows.push({...old,resumed:true});return;}const start=Date.now();await fn();rows.push({id,name,pass:true,seconds:(Date.now()-start)/1000});fs.writeFileSync(path.join(folder,'progress.json'),JSON.stringify(rows,null,2));console.log('PASS '+id+' '+name);};
const proposal=()=>page.evaluate(pid=>JSON.parse(localStorage.getItem('winmate.v2.proposals')||'[]').find(p=>p.id===pid),pid);
try{
 await page.goto(url+'/');await settle(page);
 if(restored?.backup){await page.evaluate(async backup=>{const repo=await import('/src/repositories/backup.js');await repo.importBackup(backup);},restored.backup);await page.reload();await settle(page);}
 await step('L01','empty production history → new proposal',async()=>{assert(await page.locator('.sb-list .sb-item').count()===0,'no seeded sample history');await nav(page,'.sb-new');await page.getByRole('dialog',{name:'고객 요구사항',exact:true}).waitFor();await page.waitForTimeout(300);pid=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals'))[0].id);});
 // 고객 요구사항은 자유형식 하나 — 첨부는 모델 없이 본문으로 들어오고, 저장을 눌러야 제안서에 들어가며 그때 요약(실제 모델)이 시작된다.
 const req=()=>page.getByRole('dialog',{name:'고객 요구사항',exact:true});
 const jobOf=purpose=>page.evaluate(({pid,purpose})=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').find(j=>j.owner?.id===pid&&j.purpose===purpose),{pid,purpose});
 await step('L02','attachment → free-form text (no model, nothing saved yet)',async()=>{
  const text='# [실제 실행 검증 커피] 메뉴보드 도입\n고객사: 실행 검증 커피\n사업명: 메뉴보드 파일럿 도입\n매장 3곳에 QM55C 메뉴보드 각 2대를 도입한다. MagicINFO를 통해 본사에서 메뉴와 가격을 원격 관리한다. 운영 담당자는 변경 시간 단축, 구매 담당자는 비용과 안정성을 중요하게 생각한다. 파일럿은 4주 동안 운영하며 매장 직원 교육과 장애 대응 절차를 포함한다. 예산과 설치 위치는 현장 조사 후 확정한다.';
  await req().locator('input[type=file]').setInputFiles({name:'실행-요구사항.md',mimeType:'text/markdown',buffer:Buffer.from(text)});
  await page.waitForFunction(()=>document.querySelector('#free-ed')?.innerText.includes('메뉴보드 파일럿 도입'),null,{timeout:30000});
  const p=await proposal();assert(!p.req.free.length&&p.stage==='req','attaching does not save the proposal');assert(!(await jobOf('requirements-summary')),'no summary job before 저장');
 });
 await step('L03','customer + @ tag → 저장 → actual model summary',async()=>{
  await req().getByRole('textbox',{name:'고객사',exact:true}).fill('실행 검증 커피');
  await page.locator('#free-ed').click();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.type(' 운영은 @Magic');await page.locator('.mmenu .mopt.solution').first().click();
  await req().getByRole('button',{name:'저장',exact:true}).click();
  await page.locator('.layout-node').waitFor();assert(await page.locator('.match-node').count()===1,'매칭 · 레이아웃 구성 bubbles appear together');
  await page.waitForFunction(pid=>JSON.parse(localStorage.getItem('winmate.v2.proposals')||'[]').find(p=>p.id===pid)?.stage==='match',pid);
  let p=await proposal();assert(p.customer==='실행 검증 커피'&&JSON.stringify(p.req.free).includes('메뉴보드 파일럿 도입')&&p.ctx.solutions.includes('magicinfo')&&p.stage==='match','saved text, customer and tagged solution: '+JSON.stringify([p.customer,p.stage,p.ctx,JSON.stringify(p.req.free).slice(0,300)]));
  await page.waitForFunction(pid=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id===pid)?.requirementSummary?.status==='ready',pid,{timeout:180000});
  p=await proposal();assert(p.requirementSummary.result?.llm?.effective==='llm'&&p.requirementSummary.result.summary?.overview?.text,'actual model summary');
  assert(await page.locator('.layout-node .lyt-rec-btn').isEnabled()&&await page.locator('.layout-node .lyt-area .lyt-card').count()===0,'구성 생성하기 turns on once the summary is ready, and nothing is generated before it is pressed');
  assert(await page.locator('.board .lyt-all-btn').count()===0,'no 전체 구성 보기 button (the bubble opens all compositions)');
 });
 await step('L04','matching check → actual template recommendation',async()=>{
  await page.evaluate(async pid=>{const repo=await import('/src/repositories/proposals.js');repo.update(pid,d=>{if(!d.ctx.products.includes('qm55c'))d.ctx.products.push('qm55c');});},pid);
  // 매칭을 마친 뒤 구성 생성하기 → '매칭을 마쳤나요?' 확인 → 관리자 구성(켜 둔 것)마다 DSS 로 파트를 넣고 뺀 구성 — 모델은 업종만 고른다
  await page.locator('.layout-node .lyt-rec-btn').click();
  const ask=page.getByRole('dialog').filter({hasText:'매칭을 마쳤나요'});await ask.waitFor();
  assert(/제품\s*1/.test(await ask.innerText()),'the confirmation shows what is linked now: '+(await ask.innerText()).replace(/\s+/g,' ').slice(0,200));
  await ask.getByRole('button',{name:'구성 생성하기'}).click();await ask.waitFor({state:'detached'});
  await page.waitForFunction(()=>{const a=document.querySelector('.layout-node .lyt-area');const c=a?[...a.querySelectorAll('.lyt-card:not(.sk)')]:[];return a&&!a.hasAttribute('aria-busy')&&c.length>0;},null,{timeout:120000});
  const ids=await page.locator('.layout-node .lyt-area .lyt-card').evaluateAll(els=>els.map(e=>e.dataset.tpl));assert(new Set(ids).size===ids.length,'distinct compositions: '+ids.join());
  const flow=await page.locator('.layout-node .lyt-area .lyt-card').first().locator('.tocmf-i .node-name').evaluateAll(els=>els.map(e=>e.textContent.replace(/[\u200B]/g,'').replace(/\u00A0/g,' ').trim()));
  assert(!flow.includes('구독 상품 제안')&&!flow.includes('서비스')&&!flow.includes('제품 스펙'),'no subscription · service part without those DSS, Spec (always last) not drawn on the card: '+flow.join(' → '));
  await page.screenshot({path:path.join(folder,'template-recommendation.png')});
 });
 await step('L05','choose a template → parts placed → actual per-part layout composition',async()=>{
  await page.locator('.layout-node .lyt-area .lyt-card .lyt-hit').first().click({position:{x:24,y:12}}); // 구성은 고르는 버튼 — 샘플은 '샘플 보기'로만, 시작은 상자 아래 '제안서 작성하기'
  await page.locator('.layout-node').getByRole('button',{name:'제안서 작성하기'}).click();
  const go=page.getByRole('dialog').filter({hasText:'구성으로 진행할까요'});await go.waitFor();await go.getByRole('button',{name:'제안서 작성하기'}).click();
  await page.locator('.layout-node').waitFor({state:'detached'}); // 목차가 놓이면 레이아웃 구성 버블은 빠진다
  await page.locator('.board .col').first().waitFor();assert(await page.locator('.board .col').count()>=5,'template parts are on the board before any layout arrives');
  assert((await page.locator('.board .col .node-name').allInnerTexts()).at(-1).trim()==='제품 스펙','Spec is placed last on the board although the card does not draw it');
  for(let n=0;n<800;n++){
   const state=await jobOf('layout-auto');
   if(state?.outcome==='failed'||state?.status==='error')throw Error(JSON.stringify(state.error||state.outcomeNote));
   if(state?.outcome==='applied'){assert(state.llm?.effective==='llm','model-composed deck');break;}
   if(n===799)throw Error('layout composition timed out');await page.waitForTimeout(500);
  }
  const p=await proposal();const body=p.parts.filter(s=>!s.deck);assert(body.length>=5&&body.every(s=>s.layouts?.length),'every part has layouts');
  // kept as written: a composed sheet (origin compose) or a fixed-content one — Why Samsung · 도입사례 (origin fixed, context-policy isFixedContentLayout) — is never queued for a per-sheet rewrite
  assert(body.flatMap(s=>s.layouts).every(x=>['compose','fixed'].includes(x.adaptation?.origin)||x.status!=='done'),'composed sheets are kept as written');await page.screenshot({path:path.join(folder,'agent-result.png')});
 });
 await step('L06','real Gemini RAG → choose exact layout',async()=>{
  const before=(await proposal()).parts.flatMap(s=>s.layouts).map(x=>x.uid);
  await page.getByRole('button',{name:'PPT 레이아웃 추가',exact:true}).first().click();await page.locator('#pk-q').fill('L_PH_P3_A');await page.locator('.pcard[data-f="L_PH_P3_A"]').first().waitFor({timeout:60000});await page.locator('.pcard[data-f="L_PH_P3_A"]').first().click();/* a pick closes the picker */
  await page.waitForFunction(({pid,before})=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id===pid).parts.some(s=>s.layouts.some(x=>!before.includes(x.uid)&&x.f==='L_PH_P3_A')),{pid,before});partId=(await proposal()).parts.find(s=>s.layouts.some(x=>!before.includes(x.uid)&&x.f==='L_PH_P3_A')).id;layoutUid=(await proposal()).parts.find(s=>s.id===partId).layouts.find(x=>!before.includes(x.uid)&&x.f==='L_PH_P3_A').uid;
 });
 await step('L07','added layout → actual AI context fill → element AI fill → review → apply overrides',async()=>{
  // The sheet added in L06 is not filled at once: the real model first infers its direction (products · solutions · outline — layout-brief.js),
  // the card shows '!', and the person confirms it in the popup; only then the real model fills it for this customer (layout context fill).
  const sheet=async()=>(await proposal()).parts.flatMap(s=>s.layouts).find(x=>x.uid===layoutUid);
  await page.waitForFunction(({pid,layoutUid})=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id===pid).parts.flatMap(s=>s.layouts).find(x=>x.uid===layoutUid)?.adaptation?.phase==='brief',{pid,layoutUid},{timeout:240000});
  await page.locator('.lcard[data-layout-uid="'+layoutUid+'"] .brief-mark').click();await page.locator('.modal.lb-modal').getByRole('button',{name:'확인하고 진행',exact:true}).click();
  const settled=()=>page.waitForFunction(({pid,layoutUid})=>{const x=JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id===pid).parts.flatMap(s=>s.layouts).find(x=>x.uid===layoutUid);return x&&!['queued','running'].includes(x.adaptation?.phase);},{pid,layoutUid},{timeout:240000});
  await settled();let x=await sheet();
  assert(['ready','review'].includes(x.adaptation?.phase),'actual layout context fill finished: '+JSON.stringify(x.adaptation));
  assert(Object.keys(x.ov?.t||{}).length>0&&Object.values(x.ev||{}).some(e=>e.by==='ai'),'model text and its evidence are on the added sheet');
  await page.locator(`.col[data-pid="${partId}"]`).getByRole('button',{name:'제품 3 · 컷 + 설치 장면 열기',exact:true}).last().click();
  // One element at a time: select it on the slide → 이 요소만 AI로 채우기 → review → apply.
  // The model may have nothing to change in an element it has just written (the app says so); the next element is tried then.
  const blocks=await page.evaluate(async f=>{const {readUnits}=await import('/src/domain/slides/evidence.js');return readUnits(f).filter(u=>!u.isImg&&u.ft.length).map(u=>u.ft[0]);},x.f);
  const unchanged=page.getByRole('alert',{name:'AI로 채우지 못했어요',exact:true});let reviewed=false;
  for(const i of blocks.slice(0,5)){
   await page.locator(`.detail-left [data-tb="${i}"]`).first().click();await page.getByRole('button',{name:'이 요소만 AI로 채우기',exact:true}).click();
   reviewed=await Promise.race([page.locator('.fillflow .diff').waitFor({timeout:120000}).then(()=>true),unchanged.waitFor({timeout:120000}).then(()=>false)]);
   if(reviewed)break;
   await unchanged.getByRole('button',{name:'알림 닫기',exact:true}).click();await unchanged.waitFor({state:'detached'});
  }
  assert(reviewed,'the real model proposed a change for one of the elements');assert((await page.locator('.fillflow').innerText()).includes('AI'),'model fill review');
  const before=JSON.stringify(x.ov.t);await page.locator('.fillflow').getByRole('button',{name:/칸 반영/}).click();
  await page.waitForFunction(({pid,layoutUid,before})=>JSON.stringify(JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id===pid).parts.flatMap(s=>s.layouts).find(x=>x.uid===layoutUid)?.ov?.t||{})!==before,{pid,layoutUid,before});
  // An applied text change is checked against the customer context again (context-policy markLayoutChanges); the next step starts once that has finished.
  await settled();x=await sheet();assert(['ready','review'].includes(x.adaptation?.phase),'the applied change passed the context review: '+JSON.stringify(x.adaptation));
 });
 await step('L08','database product swap updates slide and metadata',async()=>{
  await page.getByRole('dialog').getByText('QM55C',{exact:true}).first().click();
  // 요소의 근거 · 제품은 접힌 「사용된 근거」 안에 있다 (Disclosure — 머리글을 눌러 편다)
  const used=page.locator('.detail-right .disc-toggle').filter({hasText:'사용된 근거'});if(await used.getAttribute('aria-expanded')==='false')await used.click();
  await page.getByRole('button',{name:'스마트 사이니지 QM55C — 다른 제품으로 바꾸기',exact:true}).click();await page.getByRole('dialog',{name:'제품 바꾸기',exact:true}).getByRole('button',{name:'스마트 사이니지 QM65C · 고르기',exact:true}).press('Enter');await page.getByRole('dialog',{name:'제품 바꾸기',exact:true}).getByRole('button',{name:/로 바꾸기$/}).click();assert((await page.locator('.detail-left').innerText()).includes('QM65C'),'new product visible');await page.getByRole('dialog').last().getByRole('button',{name:'닫기',exact:true}).first().click();
 });
 await step('L09','editable PowerPoint export',async()=>{
  if(!await page.getByRole('button',{name:'PPTX 내보내기',exact:true}).count())await page.locator('button.lay-toggle').click();await page.getByRole('button',{name:'PPTX 내보내기',exact:true}).click();await page.locator('#ex-name').fill('실제-Gemini-제안서');
  // Linking QM65C in L08 changed the customer context, so every sheet written for it is checked again by the real model (two at a time).
  // The export dialog offers 「PPTX 만들기」 only when no sheet is pending or failed (viewer.jsx blocked): the journey waits on that button — the saved copy
  // of the proposal lags the screen by a moment (repositories/proposals.js persist), so it is read only to name a sheet that failed.
  const build=page.getByRole('button',{name:'PPTX 만들기',exact:true});
  // A sheet the model could not finish (an upstream time-out, an answer that failed verification) is reported in 작업 알림 with 「다시 시도」.
  // The journey presses it as a person would — twice per sheet at most, each time written to the output — and fails on the third failure.
  const retried=new Map();
  for(let n=0;!await build.isEnabled();n++){
   const sheets=(await proposal()).parts.flatMap(s=>s.layouts);
   for(const x of sheets.filter(x=>x.adaptation?.phase==='error')){
    const times=(retried.get(x.uid)||0)+1;assert(times<=2,`${x.f} failed the context review ${times} times — ${x.adaptation.error}`);retried.set(x.uid,times);
    console.log(`NOTE L09 다시 시도 ${times}: ${x.f} — ${x.adaptation.error}`);
    await page.getByRole('alert').filter({hasText:x.adaptation.error}).first().getByRole('button',{name:'다시 시도',exact:true}).click();
    await page.waitForFunction(({pid,uid})=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id===pid).parts.flatMap(s=>s.layouts).find(x=>x.uid===uid)?.adaptation?.phase!=='error',{pid,uid:x.uid});
   }
   assert(n<900,'export still blocked after 15 minutes — pending '+sheets.filter(x=>['queued','running'].includes(x.adaptation?.phase)).map(x=>x.f).join(',')+' · '+(await page.locator('.modal [role="status"]').allInnerTexts()).join(' / '));
   await page.waitForTimeout(1000);
  }
  const wait=page.waitForEvent('download',{timeout:120000});await build.click();const download=await wait;pptx=path.join(folder,'actual-gemini.pptx');await download.saveAs(pptx);assert(fs.statSync(pptx).size>10000,'real exported PPTX');
 });
 await step('L10','exported deck → actual server AI review',async()=>{
  const existing=await page.evaluate(size=>JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]').find(r=>r.status==='done'&&r.ai&&r.files?.some(f=>f.name==='actual-gemini.pptx'&&f.size===size)),fs.statSync(pptx).size);
  await nav(page,'.sb-rv');
  if(restored&&existing)await page.getByRole('button',{name:'actual-gemini 평가 열기',exact:true}).first().click();
  else await page.locator('input[type=file]').first().setInputFiles(pptx);
  await page.locator('.rv-report').waitFor({timeout:180000});await page.waitForFunction(()=>{const r=JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]').find(r=>r.files?.some(f=>f.name==='actual-gemini.pptx'));return r?.status==='done'&&r.ai&&r.poc?.llm?.effective==='llm';},null,{timeout:30000});const reviews=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]'));const r=reviews.find(x=>x.files?.some(f=>f.name==='actual-gemini.pptx'));assert(r?.ai&&r.poc?.llm?.effective==='llm','real review model metadata');assert(Object.values(r.results).every(x=>x.src==='server'),'no rule grade');await page.screenshot({path:path.join(folder,'actual-review.png')});
 });
 await step('L11','PPTX → My template import and persist',async()=>{
  await nav(page,'.sb-my');await page.locator('input[data-my-file]').setInputFiles(pptx);await page.locator('.my-imp-card').first().waitFor({timeout:120000});const button=page.getByRole('button',{name:/장 My에 저장/});await button.click();await page.locator('.my-grp .tl-card').first().waitFor();await page.reload();await settle(page);if(!(await page.locator('.my-grp .tl-card').count()))await page.getByRole('button',{name:'My',exact:true}).click();assert(await page.locator('.my-grp .tl-card').count()>0,'actual templates restored after reload');
 });
}catch(error){await page.waitForTimeout(500);fs.writeFileSync(path.join(folder,'checkpoint.json'),JSON.stringify(await page.evaluate(async()=>{const repo=await import('/src/repositories/backup.js');return {local:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),backup:await repo.exportBackup()};}),null,2));rows.push({pass:false,error:String(error.stack||error)});await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});}
finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify({actual_gemini:true,cases:rows,errors},null,2));console.log(JSON.stringify({cases:rows,errors},null,2));await browser.close();}
if(rows.some(x=>!x.pass)||errors.length)process.exitCode=1;
