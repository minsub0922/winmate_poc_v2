import fs from 'node:fs';
import path from 'node:path';
import {launch,settle,nav,showSidebar,origin,output,root,assert} from './helpers.mjs';
const width=Number(process.env.POC_TEST_WIDTH||1500);const theme=process.env.POC_TEST_THEME||'light';
const folder=path.join(output,width===1500&&theme==='light'?'poc-e2e':`poc-e2e-${width}-${theme}`);fs.mkdirSync(folder,{recursive:true});
const report={steps:[],errors:[]};let simulateFailure=false, retryCalls=0;
const browser=await launch();const context=await browser.newContext({viewport:{width,height:width<760?844:900},colorScheme:theme,acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(30000);
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
const step=async(name,fn)=>{const t=Date.now();await fn();report.steps.push({name,ok:true,ms:Date.now()-t});};
const jobs=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]'));
const waitJob=async(purpose,status)=>{await page.waitForFunction(({purpose,status})=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').some(x=>x.purpose===purpose&&(status?x.status===status:['done','error','cancelled'].includes(x.status))),{purpose,status},{timeout:120000});return(await jobs()).find(x=>x.purpose===purpose);};
context.on('request', request=>{if(simulateFailure&&request.url().endsWith('/api/llm'))retryCalls++;});
await context.route('**/api/jobs/*',async route=>{
 if(!simulateFailure||route.request().method()!=='GET')return route.continue();
 const response=await route.fetch();const snapshot=await response.json();
 if(snapshot.kind==='layout'&&snapshot.status==='done'){snapshot.llm={requested:'real',effective:'rules',llm_used:false,calls_ok:0,calls_failed:2,reason:'upstream_unavailable'};snapshot.result.llm=snapshot.llm;}
 return route.fulfill({response,json:snapshot});
});
await context.route('**/api/jobs',async route=>{
 if(route.request().method()!=='POST')return route.continue();
 const body=route.request().postDataJSON();
 if(body.kind==='layout')Object.assign(body,{force_level:'complex',max_slides:3});
 return route.continue({postData:JSON.stringify(body)});
});
try{
 await page.goto(origin+'/?poc=offline');await settle(page);
 await step('초기 제안서 → Layout Agent 질문',async()=>{
  await nav(page,'.sb-new');
  await page.waitForFunction(()=>localStorage.getItem('winmate.v2.proposals'));
  await page.evaluate(()=>{
   const list=JSON.parse(localStorage.getItem('winmate.v2.proposals'));const p=structuredClone(list.find(x=>x.id==='p_seed_acoffee'));
   p.id='p_poc_e2e';p.title='PoC 브라우저 검증';p.parts=[];p.stage='story';delete p.agent;
   localStorage.setItem('winmate.v2.proposals',JSON.stringify([p,...list]));
   localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'proposal',id:p.id}}));
  });
  await page.reload();await settle(page);
  await page.getByRole('button',{name:'AI로 나머지 구성',exact:true}).click();
  const j=await waitJob('compose','waiting');assert(j.kind==='layout','initial board invokes Layout Graph');
  await page.getByRole('group',{name:'Layout Agent 질문',exact:true}).waitFor();
  await page.screenshot({path:path.join(folder,'strategy-questions.png')});
 });
 await step('화면 이동·새로고침 → 질문 재개 → 장표 반영',async()=>{
  const before=(await jobs())[0].id;
  await nav(page,'.sb-tpl');await showSidebar(page);await page.locator('.sb-list .sb-item').filter({hasText:'PoC 브라우저 검증'}).click();await settle(page);
  await page.reload();await settle(page);
  assert((await jobs())[0].id===before,'same job restored');
  await page.getByRole('radio',{name:/^pain:/}).check();
  await page.getByRole('button',{name:'답 보내기',exact:true}).click();
  const j=await waitJob('compose','done');assert(j.llm.effective==='rules','offline mode honestly labelled');
  const server=await(await context.request.get(origin+'/api/jobs/'+j.id)).json();assert(server.result.choice.strategy==='pain','selected strategy reached the graph');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').some(x=>x.purpose==='compose'&&x.outcome==='applied'),null,{timeout:30000});
  const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(x=>x.id==='p_poc_e2e'));
  assert(p.parts.some(x=>x.layouts?.length),'actual PoC layouts applied');const count=p.parts.length;
  await page.reload();await settle(page);
  const again=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(x=>x.id==='p_poc_e2e'));
  assert(again.parts.length===count,'result applied once across reload');
  await page.screenshot({path:path.join(folder,'layout-applied.png')});
 });
 await step('결과 적용 중 새로고침 복구',async()=>{
  await page.evaluate(()=>{const js=JSON.parse(localStorage.getItem('winmate.v2.jobs'));js[0].outcome='handling';js[0].result=null;localStorage.setItem('winmate.v2.jobs',JSON.stringify(js));});
  await page.reload();await settle(page);
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs'))[0].outcome==='applied',null,{timeout:30000});
  const server=(await jobs())[0];assert(server.status==='done','finished result fetched after interrupted application');
 });
 await step('기존 Storyboard 이어 쓰기',async()=>{
  while(await page.getByRole('button',{name:'작업 카드 닫기',exact:true}).count())await page.getByRole('button',{name:'작업 카드 닫기',exact:true}).first().click();
  await page.evaluate(()=>{const list=JSON.parse(localStorage.getItem('winmate.v2.proposals'));const p=list.find(x=>x.id==='p_poc_e2e');p.parts=p.parts.filter(x=>x.deck||x.type==='cover');p.parts.push({id:'mid-challenge',type:'challenge',name:'운영 과제',items:['메뉴 교체 시간을 줄인다'],form:'list',text:'',done:true,layouts:[]});localStorage.setItem('winmate.v2.proposals',JSON.stringify(list));});
  await page.reload();await settle(page);
  await page.getByRole('button',{name:'AI로 나머지 구성',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').some(x=>x.kind==='storyboard'&&x.status==='done'&&x.outcome==='applied'),null,{timeout:120000});
  const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(x=>x.id==='p_poc_e2e'));
  assert(p.parts.some(x=>x.agent?.source==='storyboard'),'continuation applied through SBA');
 });
 await step('서버 RAG 검색',async()=>{
  // The test server must enable WINMATE_SEARCH_MODE=real; this path needs no model/key.
  await nav(page,'.sb-tpl');await page.locator('#tl-q').fill('경쟁사 비교표');
  await page.getByRole('status').filter({hasText:'서버 RAG · BM25 + TF-IDF'}).waitFor({timeout:30000});
  assert(await page.locator('.tl-card').count()>0,'ranked layouts shown');
 });
 await step('26KB 다중 사업 RFP → 선택 후 입력 폼 반영',async()=>{
  await nav(page,'.sb-new');
  const tc=JSON.parse(fs.readFileSync(path.join(root,'poc/test/tc/rfp_tc.json'),'utf8')).tcs.find(x=>x.id==='TC5');
  await page.getByRole('dialog',{name:'고객 요구사항',exact:true}).locator('input[type=file]').setInputFiles({name:'통합-RFP.md',mimeType:'text/markdown',buffer:Buffer.from(tc.input)});
  await waitJob('rfp','done');
  const choices=page.getByRole('radiogroup',{name:'첨부에서 읽은 사업',exact:true});await choices.waitFor({timeout:30000});
  assert(await choices.getByRole('radio').count()>=2,'multiple business forms require choice');
  await choices.getByRole('radio').nth(1).check();
  await page.getByRole('button',{name:'고른 내용으로 채우기',exact:true}).click();
  await page.waitForTimeout(500);
  const ps=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')));
  const p=ps.find(x=>x.agent?.jobs&&Object.values(x.agent.jobs).some(j=>j.purpose==='rfp'));
  assert(p.req.form.project&&p.req.form.keymen.some(k=>k.reqs.length),'selected form applied');
  assert(p.req.files[0].text.length<=20000,'stored attachment excerpt bounded');
  const job=(await jobs()).find(x=>x.purpose==='rfp');const srv=await(await context.request.get(origin+'/api/jobs/'+job.id)).json();
  assert(srv.params.chars>20000,'full attachment text sent to pipeline');
  await page.screenshot({path:path.join(folder,'rfp-selected.png')});
  await page.getByRole('dialog',{name:'고객 요구사항',exact:true}).getByRole('button',{name:'고객 요구사항 닫기',exact:true}).click();
 });
 await step('업로드 검토 → 서버 채점 → 화면 이동·새로고침',async()=>{
  await nav(page,'.sb-rv');await page.locator('input[type=file]').setInputFiles(path.join(root,'build/fixtures/review_sample.pptx'));
  await page.locator('.rv-report').waitFor({timeout:120000});
  await waitJob('review','done');
  await page.getByRole('region',{name:'핵심 점검 점수',exact:true}).waitFor({timeout:30000});
  assert((await page.locator('.pocr').innerText()).includes('오프라인 규칙'),'review reports actual rule mode');
  await page.reload();await settle(page);
  await page.locator('.pocr').waitFor();
  assert(await page.locator('.pocr-row').count()>0,'actual PoC criterion results restored');
  await page.locator('.pocr').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(folder,'poc-review.png')});
 });
 await step('작업 중 요구 변경 → 결과 보류 → 명시적 붙이기',async()=>{
  await page.evaluate(()=>{const list=JSON.parse(localStorage.getItem('winmate.v2.proposals'));const p=structuredClone(list.find(x=>x.id==='p_seed_acoffee'));p.id='p_guard_e2e';p.title='변경 보호 검증';p.parts=[];p.stage='story';delete p.agent;localStorage.setItem('winmate.v2.proposals',JSON.stringify([p,...list]));localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'proposal',id:p.id}}));});
  await page.reload();await settle(page);await page.getByRole('button',{name:'AI로 나머지 구성',exact:true}).click();
  await page.getByRole('group',{name:'Layout Agent 질문',exact:true}).waitFor({timeout:30000});
  await page.locator('#pr-title').fill('변경 보호 검증 · 새 요구');
  await page.getByRole('button',{name:'기본값으로 진행',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').some(x=>x.owner?.id==='p_guard_e2e'&&x.outcome==='pending'),null,{timeout:30000});
  assert((await page.locator('.col[data-pid]').count())===0,'changed input prevents automatic insertion');
  await page.getByRole('button',{name:'지금 파트 뒤에 붙이기',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').some(x=>x.owner?.id==='p_guard_e2e'&&x.outcome==='applied'),null,{timeout:30000});
 });
 await step('모델 실패 응답 주입 → 기존 더미 흐름·중복 호출 없음',async()=>{
  simulateFailure=true;
  await page.evaluate(()=>{const list=JSON.parse(localStorage.getItem('winmate.v2.proposals'));const p=structuredClone(list.find(x=>x.id==='p_seed_acoffee'));p.id='p_failure_e2e';p.title='실패 대체 검증';p.parts=[];p.stage='story';delete p.agent;localStorage.setItem('winmate.v2.proposals',JSON.stringify([p,...list]));localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'proposal',id:p.id}}));});
  await page.reload();await settle(page);await page.getByRole('button',{name:'AI로 나머지 구성',exact:true}).click();
  await page.getByRole('group',{name:'Layout Agent 질문',exact:true}).waitFor({timeout:30000});await page.getByRole('button',{name:'기본값으로 진행',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.jobs')||'[]').some(x=>x.owner?.id==='p_failure_e2e'&&x.outcome==='fallback'),null,{timeout:30000});
  const p=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(x=>x.id==='p_failure_e2e'));
  assert(p.parts.filter(x=>!x.deck).length>=6,'original artifact fallback parts');assert(p.parts.every(x=>!x.agent?.source),'failed server layout result not substituted for original dummy');assert(retryCalls===0,'failed provider not called again by fallback');
 });
}catch(e){report.failure=String(e.stack||e);await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});}
finally{fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
if(report.failure||report.errors.length)process.exitCode=1;
