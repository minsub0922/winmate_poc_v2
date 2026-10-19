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
 await step('L02','RFP file → actual Gemini forms',async()=>{
  const text='# [실제 실행 검증 커피] 메뉴보드 도입\n고객사: 실행 검증 커피\n사업명: 메뉴보드 파일럿 도입\n매장 3곳에 QM55C 메뉴보드 각 2대를 도입한다. MagicINFO를 통해 본사에서 메뉴와 가격을 원격 관리한다. 운영 담당자는 변경 시간 단축, 구매 담당자는 비용과 안정성을 중요하게 생각한다. 파일럿은 4주 동안 운영하며 매장 직원 교육과 장애 대응 절차를 포함한다. 예산과 설치 위치는 현장 조사 후 확정한다.';
  await page.getByRole('dialog',{name:'고객 요구사항',exact:true}).locator('input[type=file]').setInputFiles({name:'실행-요구사항.md',mimeType:'text/markdown',buffer:Buffer.from(text)});
  await page.waitForFunction(pid=>JSON.parse(localStorage.getItem('winmate.v2.proposals')||'[]').find(p=>p.id===pid)?.req.form.customer,pid,{timeout:120000});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').some(j=>j.purpose==='rfp'&&j.status==='done'&&j.llm?.effective==='llm'),null,{timeout:30000});
  const p=await proposal();assert(p.req.form.keymen.some(k=>k.reqs.length),'model extracted key-person requirements');const job=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').find(j=>j.purpose==='rfp'));assert(job.llm?.effective==='llm','actual RFP model proof');
 });
 await step('L03','@ tags and creator note persist',async()=>{
  await page.getByRole('tab',{name:/^입력 폼/}).click();await page.getByRole('textbox',{name:'제작자 의견',exact:true}).fill('현장 조사 후 단계적으로 도입합니다. ');await page.getByRole('textbox',{name:'제작자 의견',exact:true}).press('End');await page.keyboard.type('@Magic');await page.locator('.mmenu .mopt.solution').first().click();await page.getByRole('dialog',{name:'고객 요구사항',exact:true}).getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('dialog',{name:'제품 · 솔루션 매칭',exact:true}).waitFor();
 });
 await step('L04','catalog matching → storyboard entry',async()=>{
  await page.getByRole('dialog',{name:'제품 · 솔루션 매칭',exact:true}).getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('button',{name:'AI로 나머지 구성',exact:true}).waitFor();
 });
 await step('L05','actual Layout Agent → strategy answers → filled slides',async()=>{
  await page.getByRole('button',{name:'AI로 나머지 구성',exact:true}).click();
  for(let n=0;n<600;n++){
   const state=await page.evaluate(pid=>{const jobs=JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]');return jobs.find(j=>j.owner?.id===pid&&j.purpose==='compose');},pid);
   if(state?.status==='error')throw Error(JSON.stringify(state.error));
   if(await page.getByRole('button',{name:'기본값으로 진행',exact:true}).count())await page.getByRole('button',{name:'기본값으로 진행',exact:true}).click();
   if(state?.outcome==='applied'){assert(state.llm?.effective==='llm','model-only graph output');break;}
   if(n===599)throw Error('Layout Agent timed out');await page.waitForTimeout(300);
  }
  const p=await proposal();assert(p.parts.some(s=>s.layouts?.length),'actual model layouts');await page.screenshot({path:path.join(folder,'agent-result.png')});while(await page.getByRole('button',{name:'작업 카드 닫기',exact:true}).count())await page.getByRole('button',{name:'작업 카드 닫기',exact:true}).first().click();
 });
 await step('L06','real Gemini RAG → choose exact layout',async()=>{
  const before=(await proposal()).parts.flatMap(s=>s.layouts).map(x=>x.uid);
  await page.getByRole('button',{name:'PPT 레이아웃 추가',exact:true}).first().click();await page.locator('#pk-q').fill('L_PH_P3_A');await page.locator('.pcard[data-f="L_PH_P3_A"]').first().waitFor({timeout:60000});await page.locator('.pcard[data-f="L_PH_P3_A"]').first().click();await page.getByRole('dialog').last().getByRole('button',{name:'완료',exact:true}).click();
  await page.waitForFunction(({pid,before})=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id===pid).parts.some(s=>s.layouts.some(x=>!before.includes(x.uid)&&x.f==='L_PH_P3_A')),{pid,before});partId=(await proposal()).parts.find(s=>s.layouts.some(x=>!before.includes(x.uid)&&x.f==='L_PH_P3_A')).id;layoutUid=(await proposal()).parts.find(s=>s.id===partId).layouts.find(x=>!before.includes(x.uid)&&x.f==='L_PH_P3_A').uid;
 });
 await step('L07','actual AI fill → review → apply overrides',async()=>{
  await page.locator(`.col[data-pid="${partId}"]`).getByRole('button',{name:'제품 3 · 컷 + 설치 장면 열기',exact:true}).last().click();await page.getByRole('button',{name:/빈 요소 \d+개 AI로 채우기/}).click();await page.locator('.fillflow .diff').waitFor({timeout:120000});assert((await page.locator('.fillflow').innerText()).includes('AI'),'model fill review');await page.locator('.fillflow').getByRole('button',{name:/칸 반영/}).click();await page.waitForFunction(({pid,layoutUid})=>Object.keys(JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id===pid).parts.flatMap(s=>s.layouts).find(x=>x.uid===layoutUid)?.ov?.t||{}).length>0,{pid,layoutUid});
 });
 await step('L08','database product swap updates slide and metadata',async()=>{
  await page.getByRole('dialog').getByText('QM55C',{exact:true}).first().click();await page.getByRole('button',{name:'스마트 사이니지 QM55C — 다른 제품으로 바꾸기',exact:true}).click();await page.getByRole('dialog',{name:'제품 바꾸기',exact:true}).getByRole('button',{name:'스마트 사이니지 QM65C · 고르기',exact:true}).press('Enter');await page.getByRole('dialog',{name:'제품 바꾸기',exact:true}).getByRole('button',{name:/로 바꾸기$/}).click();assert((await page.locator('.detail-left').innerText()).includes('QM65C'),'new product visible');await page.getByRole('dialog').last().getByRole('button',{name:'닫기',exact:true}).first().click();
 });
 await step('L09','editable PowerPoint export',async()=>{
  if(!await page.getByRole('button',{name:'PPTX 내보내기',exact:true}).count())await page.locator('button.lay-toggle').click();await page.getByRole('button',{name:'PPTX 내보내기',exact:true}).click();await page.locator('#ex-name').fill('실제-Gemini-제안서');const wait=page.waitForEvent('download',{timeout:120000});await page.getByRole('button',{name:'PPTX 만들기',exact:true}).click();const download=await wait;pptx=path.join(folder,'actual-gemini.pptx');await download.saveAs(pptx);assert(fs.statSync(pptx).size>10000,'real exported PPTX');
 });
 await step('L10','exported deck → actual server AI review',async()=>{
  const existing=await page.evaluate(size=>JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]').find(r=>r.status==='done'&&r.ai&&r.files?.some(f=>f.name==='actual-gemini.pptx'&&f.size===size)),fs.statSync(pptx).size);
  await nav(page,'.sb-rv');
  if(restored&&existing)await page.getByRole('button',{name:'actual-gemini 평가 열기',exact:true}).first().click();
  else await page.locator('input[type=file]').first().setInputFiles(pptx);
  await page.locator('.rv-report').waitFor({timeout:180000});await page.waitForFunction(()=>{const r=JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]').find(r=>r.files?.some(f=>f.name==='actual-gemini.pptx'));return r?.status==='done'&&r.ai&&r.poc?.llm?.effective==='llm';},null,{timeout:30000});const reviews=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]'));const r=reviews.find(x=>x.files?.some(f=>f.name==='actual-gemini.pptx'));assert(r?.ai&&r.poc?.llm?.effective==='llm','real review model metadata');assert(Object.values(r.results).every(x=>x.src==='server'),'no rule grade');await page.screenshot({path:path.join(folder,'actual-review.png')});
 });
 await step('L11','PPTX → My template import and persist',async()=>{
  await nav(page,'.sb-tpl');await page.getByRole('button',{name:'My',exact:true}).click();await page.locator('input[data-my-file]').setInputFiles(pptx);await page.locator('.my-imp-card').first().waitFor({timeout:120000});const button=page.getByRole('button',{name:/장 My에 저장/});await button.click();await page.locator('.my-grp .tl-card').first().waitFor();await page.reload();await settle(page);if(!(await page.locator('.my-grp .tl-card').count()))await page.getByRole('button',{name:'My',exact:true}).click();assert(await page.locator('.my-grp .tl-card').count()>0,'actual templates restored after reload');
 });
}catch(error){await page.waitForTimeout(500);fs.writeFileSync(path.join(folder,'checkpoint.json'),JSON.stringify(await page.evaluate(async()=>{const repo=await import('/src/repositories/backup.js');return {local:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),backup:await repo.exportBackup()};}),null,2));rows.push({pass:false,error:String(error.stack||error)});await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});}
finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify({actual_gemini:true,cases:rows,errors},null,2));console.log(JSON.stringify({cases:rows,errors},null,2));await browser.close();}
if(rows.some(x=>!x.pass)||errors.length)process.exitCode=1;
