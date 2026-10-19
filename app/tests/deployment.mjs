import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
import {launch,settle,nav,root,output,assert} from './helpers.mjs';
const folder=path.join(output,'deployment');fs.mkdirSync(folder,{recursive:true});
const authDir=fs.mkdtempSync(path.join(folder,'auth-'));const port=process.env.WINMATE_DEPLOY_TEST_PORT||'8791';const base='http://127.0.0.1:'+port;
const password=crypto.randomBytes(24).toString('base64url');
const env={...process.env,WINMATE_API_PORT:port,WINMATE_MODE:'dummy',WINMATE_ENV_FILES:'none',WINMATE_AUTH:'on',WINMATE_AUTH_DIR:authDir,WINMATE_SETUP_PASSWORD:password,LANGSMITH_TRACING:'false'};
const report={steps:[],errors:[]};let browser,server,dev,log='';
const run=async(cmd,args,extra={})=>await new Promise((resolve,reject)=>{let text='';const p=spawn(cmd,args,{cwd:root,env:{...env,...extra}});p.stdout.on('data',b=>text+=b);p.stderr.on('data',b=>text+=b);p.on('error',reject);p.on('close',code=>code===0?resolve(text):reject(new Error(cmd+' failed ('+code+'): '+text)));});
const step=async(name,fn)=>{const t=Date.now();await fn();report.steps.push({name,ok:true,ms:Date.now()-t});};
try{
 await step('start.sh 하나로 패키지·웹·DB·KB·계정 준비 및 기동',async()=>{
  server=spawn('/bin/bash',['./start.sh'],{cwd:root,env});server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
  let ready=false;
  for(let i=0;i<180;i++){if(server.exitCode!=null)throw Error('server exited: '+log);try{const r=await fetch(base+'/api/health');if(r.ok){const h=await r.json();assert(h.stage===3&&h.products===1068,'health stage3/1068');ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  assert(ready,'server started');assert(log.includes('--')||log.includes('127.0.0.1'),'loopback startup logged');
 });
 await step('로그인 전 API·화면 보호 및 외부 Origin 거부',async()=>{
  assert((await fetch(base+'/api/bootstrap')).status===401,'bootstrap protected');
  assert((await fetch(base+'/',{redirect:'manual'})).status===303,'root redirects to login');
  assert((await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({username:'admin',password})})).status===403,'cross-origin login rejected');
 });
 browser=await launch();const context=await browser.newContext({viewport:{width:1500,height:900}});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await step('실제 로그인 화면 → 앱 → 제안서 저장',async()=>{
  await page.goto(base+'/');await page.locator('#username').fill('admin');await page.locator('#password').fill(password);await page.getByRole('button',{name:/로그인/}).click();await settle(page);
  const cookies=await context.cookies();const cookie=cookies.find(x=>x.name==='winmate_session');assert(cookie?.httpOnly&&cookie.sameSite==='Strict','cookie flags');
  await nav(page,'.sb-new');await page.getByRole('textbox',{name:'자유형식 요구사항',exact:true}).fill('로그인 후 로컬 제안서 저장을 검증합니다. 카페 메뉴보드를 도입하고 운영 시간을 줄입니다.');
  await page.waitForTimeout(500);await page.screenshot({path:path.join(folder,'authenticated-app.png')});
 });
 await step('인증한 백그라운드 작업·SSE',async()=>{
  const response=await context.request.post(base+'/api/jobs',{data:{kind:'rfp',offline:true,text:'사업명: 카페 메뉴보드 도입. 고객사: 테스트 커피. 매장 세 곳에 메뉴보드 여섯 대를 설치하고 원격으로 가격을 바꾼다. 파일럿은 사 주 안에 완료한다.'}});assert(response.status()===202,'job submitted');const job=await response.json();
  const events=await context.request.get(base+'/api/jobs/'+job.id+'/events');const body=await events.text();assert(events.ok()&&body.includes('event: result')&&body.includes('id:'),'SSE authenticated and complete');
 });
 await step('계정 화면 로그아웃·재로그인 후 브라우저 데이터 유지',async()=>{
  await page.goto(base+'/account.html');await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.waitForURL('**/login.html');
  assert((await context.request.get(base+'/api/bootstrap')).status()===401,'logged out');
  await page.locator('#username').fill('admin');await page.locator('#password').fill(password);await page.getByRole('button',{name:/로그인/}).click();await settle(page);
  assert((await page.getByRole('textbox',{name:'자유형식 요구사항',exact:true}).innerText()).includes('로그인 후 로컬'),'saved data survives logout');
 });
 await step('스모크 스크립트·전체 데이터 해시·credential 권한',async()=>{
  const smoke=await run('app/.venv/bin/python',['-B','app/scripts/smoke.py','--base',base],{WINMATE_SMOKE_PASSWORD:password});fs.writeFileSync(path.join(folder,'smoke.log'),smoke);
  const preflight=await run('app/.venv/bin/python',['-B','app/scripts/preflight.py','--deep','--require-auth']);fs.writeFileSync(path.join(folder,'preflight.log'),preflight);
  for(const file of ['credentials.json','session.secret']){const p=path.join(authDir,file);assert((fs.statSync(p).mode&0o777)===0o600,'private file0600');assert(!fs.readFileSync(p,'utf8').includes(password),'no plaintext password');}
 });
 await step('Vite 개발 프록시 로그인·CSRF·서버 파일 접근 차단',async()=>{
  const devPort=process.env.WINMATE_DEV_TEST_PORT||'5174';const devBase='http://127.0.0.1:'+devPort;
  dev=spawn('npm',['--prefix','app/web','run','dev'],{cwd:root,detached:true,env:{...env,WINMATE_WEB_PORT:devPort}});dev.stdout.on('data',b=>log+=b);dev.stderr.on('data',b=>log+=b);
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(devBase+'/')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert(ready,'Vite started');
  const isolated=await browser.newContext({viewport:{width:900,height:900}});const dp=await isolated.newPage();
  dp.on('pageerror',e=>report.errors.push(String(e)));
  await dp.goto(devBase+'/');await dp.waitForURL('**/login.html');await dp.locator('#username').fill('admin');await dp.locator('#password').fill(password);await dp.getByRole('button',{name:/로그인/}).click();await settle(dp);
  const post=await isolated.request.post(devBase+'/api/llm',{headers:{Origin:devBase},data:{prompt:'dummy dev test',kind:'json'}});assert(post.status()===200&&(await post.json()).mode==='dummy','dev Origin passes only through loopback proxy');
  const denied=await isolated.request.get(devBase+'/@fs/'+path.join(authDir,'credentials.json'));assert(denied.status()===403,'runtime files outside dev fs allowlist');
  await isolated.clearCookies();
  await dp.evaluate(async()=>{const client=await import('/src/api/client.js');await client.requestJson('/api/bootstrap').catch(()=>{});});
  await dp.waitForURL('**/login.html');
  await isolated.close();
 });
}catch(e){report.failure=String(e.stack||e);}
finally{
 if(browser)await browser.close();
 if(dev&&dev.exitCode==null) { try { process.kill(-dev.pid,'SIGTERM'); } catch {} }
 if(server&&server.exitCode==null){server.kill('SIGTERM');await Promise.race([new Promise(r=>server.on('close',r)),new Promise(r=>setTimeout(r,10000))]);}
 assert(!log.includes(password),'setup password not logged');fs.writeFileSync(path.join(folder,'startup.log'),log);fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
if(report.failure||report.errors.length)process.exitCode=1;
