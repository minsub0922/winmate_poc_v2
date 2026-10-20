// Isolated UI replay of recorded, real model/search results. No model network calls here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const temp=await fsp.mkdtemp(path.join(os.tmpdir(),'winmate-skill-ui-'));
const port=process.env.WINMATE_SKILL_TEST_PORT || '8796';process.env.WINMATE_TEST_URL='http://127.0.0.1:'+port;process.env.WINMATE_STRICT_VITE_PORT=process.env.WINMATE_SKILL_WEB_PORT || '5196';
const server=spawn('app/.venv/bin/python',['-B','app/tests/fixtures/simulation_skills_server.py'],{env:{...process.env,WINMATE_API_PORT:port,WINMATE_AUTH_DIR:path.join(temp,'auth'),WINMATE_STORYBOARD_DIR:path.join(temp,'shares')},stdio:['ignore','ignore','pipe']});let logs='';server.stderr.on('data',x=>logs+=x);
const {startVite,launch}=await import('./fixtures/strict/harness.mjs');
const fixture=JSON.parse(fs.readFileSync('app/tests/fixtures/simulation-skills/product-fit-real.json')).result;
const competitor=JSON.parse(fs.readFileSync('app/tests/fixtures/simulation-skills/competitor-analysis-real.json')).result;
const out='app/tests/output/simulation-skills-ui';await fsp.mkdir(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),passed=[],errors=[],requests=[];let vite,browser,page;
const pass=s=>{passed.push(s);console.log('PASS '+s);};
try{
 for(let n=0;;n++){try{if((await fetch(process.env.WINMATE_TEST_URL+'/api/auth/status')).ok)break;}catch{}if(n>200||server.exitCode!==null)throw Error(logs);await sleep(100);}
 vite=await startVite();browser=await launch();const context=await browser.newContext({viewport:{width:1500,height:1000}});
 await context.route('**/api/llm',route=>route.fulfill({status:503,json:{code:'upstream_unavailable',detail:'고객 모델은 이 UI 검사에서 차단했습니다.'}}));
 await context.route('**/api/simulation/skills/run',async route=>{requests.push(route.request().postDataJSON());await route.continue();});
 const login=await context.request.post(vite.url+'/api/auth/login',{data:{username:'sharing-owner',password:'sharing-browser-test-password'}});assert.equal(login.status(),200);
 page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));await page.goto(vite.url);await page.locator('.home').waitFor();
 await page.evaluate(async()=>{
  const {setupFromScenario}=await import('/src/domain/simulation/profile.js');const repo=await import('/src/repositories/simulations.js');const proposals=await import('/src/repositories/proposals.js');
  const pid=proposals.createProposal();proposals.update(pid,p=>{p.title='현재 연결된 카페 제안';p.customer='A 커피';p.req.free=[{t:'현재 매장 10곳의 메뉴를 본사에서 바꿉니다.'}];p.ctx.products=['qm55c'];p.ctx.solutions=['magicinfo'];});
  const setup=setupFromScenario('bs01');setup.pid=pid;setup.source='proposal';const sim=repo.newSim(setup,2);sim.msgs=[{id:'customer',who:'cust',text:'카운터 55형 제품과 본사에서 관리할 솔루션을 알려 주세요.',ts:Date.now()-1000}];
  sim.cur.suggest=[1,2,3].map(n=>({title:'검사용 추천 '+n,segs:[{t:'고객 요구를 확인합니다.'}]}));sim.profile.concerns.push({id:'secret-test',text:'HIDDEN_PERSONA_SECRET_FOR_TEST',revealed:false});
  repo.putSim(sim);proposals.saveUi({route:{name:'sim',id:sim.id}});window.__skillSimId=sim.id;await new Promise(r=>setTimeout(r,350));
 });
 await page.reload();await page.locator('.sim').waitFor();
 const snapshot=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('winmate.v2.sims'))[0];return JSON.stringify([s.msgs,s.cur,s.trend]);});
 const before=await snapshot();
 async function choose(name){await page.locator('#sim-ed').fill('@');const menu=page.getByRole('listbox',{name:'제품 · 솔루션 · 유관사례 · 스킬 찾기'});await menu.waitFor();assert.deepEqual(await menu.locator('.mmenu-tabs button').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-label'))),['제품','솔루션','유관사례','스킬']);assert.equal(await menu.locator('button[aria-pressed=true]').innerText(),'제품');assert.equal(await menu.locator('.mmenu-skill-tab small').innerText(),'AI');await menu.getByRole('button',{name:'스킬',exact:true}).click();assert.equal(await menu.getByRole('option').count(),8);await menu.getByRole('option',{name:new RegExp(name)}).click();await page.locator('.sim-skill-modal').waitFor();}
 await choose('맞춤 제품 제시');
 await page.locator('.sim-skill-stream').waitFor();const partial=await page.locator('.sim-skill-stream').innerText();assert(partial.length>0);assert.equal(await page.locator('.sim-skill-draft').count(),0);await page.waitForFunction(text=>document.querySelector('.sim-skill-stream')?.textContent.length>text.length+20,partial);
 assert.equal(await snapshot(),before);assert.equal(await page.locator('.sim-skill-stages .running').count(),1);assert.equal(await page.locator('.sim-skill-collected a').count()>0,true);
 await page.screenshot({path:path.join(out,'desktop-skill-streaming.png'),animations:'disabled'});
 pass('Selecting the highlighted AI skill opens a popup immediately; real SSE progressively updates analysis, queries and sources before completion');
 await page.locator('.sim-skill-result.status-done').waitFor();assert.equal(requests[0].skill_id,'product-fit');assert(requests[0].context.proposal.title.includes('현재 연결된'));assert(requests[0].context.messages.at(-1).text.includes('카운터 55형'));
 assert(!JSON.stringify(requests[0]).includes('HIDDEN_PERSONA_SECRET_FOR_TEST'));assert(!JSON.stringify(requests[0]).includes('satisfaction'));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.sims'))[0].skillRuns?.[0]?.status==='done');assert.equal(await snapshot(),before);
 assert.ok(await page.locator('.sim-skill-modal .sim-skill-citations').count()>0);assert.equal(await page.locator('.sim-skill-replies .sim-skill-draft').count(),3);assert.equal(await page.locator('.sim-skill-stages .done').count(),5);const texts=await page.locator('.sim-skill-draft>p').allTextContents();assert.equal(new Set(texts).size,3);
await page.screenshot({path:path.join(out,'desktop-skill-result.png'),animations:'disabled'});
 pass('Product-first menu has no All, exposes eight skills, uses current context and leaves customer messages/scores untouched');
 await page.locator('.sim-skill-draft').nth(1).getByRole('button',{name:'이 답변 사용',exact:true}).click();assert.equal(await page.locator('.sim-skill-modal').count(),0);assert.ok((await page.locator('#sim-ed').innerText()).length>20);assert.ok(await page.locator('#sim-ed .mention[data-ref]').count()>0);assert.equal(await snapshot(),before);
 await page.getByRole('button',{name:'보내기',exact:true}).click();await page.locator('.feedback-popup.error').waitFor();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.sims'))[0].msgs.at(-1)?.who==='me');
 const me=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.sims'))[0].msgs.at(-1));assert.equal(me.who,'me');assert.ok(me.materials.length>0);assert.ok(me.skillRunId);assert.ok(me.segs.some(s=>s.ref));
 pass('A sourced draft stays editable; only using and sending it attaches real material evidence to the seller turn');
 await choose('경쟁사 분석');await page.locator('.sim-skill-modal').getByRole('button',{name:'실행 중지',exact:true}).click();await page.locator('.sim-skill-result.status-cancelled').waitFor();await sleep(2100);assert.equal(await page.locator('.sim-skill-result.status-done').count(),1);await page.locator('.sim-skill-modal').getByRole('button',{name:'닫기',exact:true}).click();
 pass('Stopping a pending skill discards its late response and never starts a customer turn');
 await choose('맞춤 제품 제시');const failure=page.locator('.sim-skill-result.status-error').last();await failure.waitFor();assert.ok((await failure.innerText()).includes('자료 준비 연결 오류'));
 await page.evaluate(async()=>{const repo=await import('/src/repositories/simulations.js');const s=JSON.parse(localStorage.getItem('winmate.v2.sims'))[0];repo.patchSim(s.id,x=>{x.msgs.push({id:'latest',who:'cust',text:'최신 변경: 다음 달에는 5개 매장만 우선 진행합니다.',ts:Date.now()});});});
 await page.locator('.sim-skill-modal').getByRole('button',{name:'현재 맥락으로 다시 실행',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.sims'))[0].skillRuns?.filter(r=>r.status==='done').length===2);assert.equal(requests[3].prompt,requests[0].prompt);assert.equal(requests[3].context.messages.at(-1).text,'최신 변경: 다음 달에는 5개 매장만 우선 진행합니다.');
 await page.locator('.sim-skill-modal').getByRole('button',{name:'닫기',exact:true}).click();await page.locator('.sim-skill-result.status-done').last().getByRole('button',{name:'작업 과정·답변 보기',exact:true}).click();assert.equal(await page.locator('.sim-skill-draft').count(),3);
 pass('An error is visible and retry reads the latest conversation instead of stale context');
 await page.reload();await page.locator('.sim').waitFor();assert.equal(await page.locator('.sim-skill-result.status-done').count(),2);assert.equal(requests.length,4);
 await page.evaluate(async()=>{const repo=await import('/src/repositories/simulations.js');const s=JSON.parse(localStorage.getItem('winmate.v2.sims'))[0];repo.patchSim(s.id,x=>{x.skillRuns.push({id:'interrupted-fixture',skillId:'product-fit',status:'running',startedAt:Date.now(),prompt:'검사'});});await new Promise(r=>setTimeout(r,350));});
 await page.reload();await page.locator('.sim-skill-result.status-interrupted').waitFor();assert.equal(requests.length,4);
 pass('Completed results survive reload; an unfinished run becomes interrupted and is never silently re-executed');
 await page.setViewportSize({width:390,height:844});await page.locator('#sim-ed').fill('@');await page.locator('.mmenu').waitFor();await page.locator('.mmenu').getByRole('button',{name:'스킬',exact:true}).click();
 const bounds=await page.locator('.mmenu').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(out,'phone-skills-menu.png'),animations:'disabled'});for(let n=0;n<7;n++)await page.locator('#sim-ed').press('ArrowDown');assert.ok((await page.locator('.mmenu .mopt[aria-selected=true]').innerText()).includes('의사결정 요약'));assert.ok(await page.locator('.mmenu-list').evaluate(el=>el.scrollTop>0));await page.locator('#sim-ed').press('Escape');
 await page.locator('.sim-skill-result.status-done').last().getByRole('button',{name:'작업 과정·답변 보기',exact:true}).click();assert.equal(await page.locator('.sim-skill-draft').count(),3);await page.locator('.sim-skill-process summary').click();await page.locator('.sim-skill-analysis summary').click();assert.equal(await page.locator('.sim-skill-workspace').evaluate(el=>el.scrollWidth>el.clientWidth),false);await page.locator('.sim-skill-process summary').click();await page.locator('.sim-skill-analysis summary').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'phone-skill-answers.png'),animations:'disabled'});
 assert.deepEqual(errors,[]);pass('Phone menu and sourced result layout stay within the viewport without runtime errors');
}finally{
 await fsp.writeFile(path.join(out,'report.json'),JSON.stringify({passed,errors,requests:requests.map(r=>({skill:r.skill_id,proposal:r.context?.proposal?.title,lastMessage:r.context?.messages?.at(-1)?.text}))},null,2));
 await browser?.close();await vite?.close();server.kill('SIGTERM');if(server.exitCode===null)await new Promise(r=>server.once('exit',r));await fsp.rm(temp,{recursive:true,force:true});
}
