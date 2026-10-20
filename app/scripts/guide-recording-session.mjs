import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { documentChanges } from '../web/src/services/share-patch.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const port=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const n=server.address().port;server.close(()=>resolve(n));});});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function createRecordingSession(){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'winmate-actual-guides-')),apiPort=await port();
 const env={...process.env,WINMATE_API_PORT:String(apiPort),WINMATE_AUTH_DIR:path.join(temporary,'auth'),WINMATE_STORYBOARD_DIR:path.join(temporary,'storyboards'),WINMATE_SPATIAL_DB:path.join(temporary,'spatial.sqlite'),WINMATE_TEMPLATE_DB:path.join(temporary,'templates.sqlite'),WINMATE_TELEMETRY_DB:path.join(temporary,'telemetry.sqlite')};
 const api=spawn(path.join(root,'app/.venv/bin/python'),['-B',path.join(root,'app/scripts/fixtures/guide_recording_server.py')],{cwd:root,env,stdio:['ignore','pipe','pipe']});
 let log='';api.stdout.on('data',data=>log+=data);api.stderr.on('data',data=>log+=data);
 let vite,browser;
 const close=async()=>{await browser?.close();await vite?.close();api.kill('SIGTERM');if(api.exitCode===null)await new Promise(resolve=>api.once('exit',resolve));fs.rmSync(temporary,{recursive:true,force:true});};
 try{
  for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:'+apiPort+'/api/auth/status')).ok)break;}catch{}if(i>300||api.exitCode!==null)throw new Error('Recording API unavailable: '+log);await sleep(100);}
  // Pass the actual API's proxy target explicitly, without changing the app.
  process.env.WINMATE_API_PORT=String(apiPort);
  vite=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
  await vite.listen();const base='http://127.0.0.1:'+vite.httpServer.address().port;
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1320,height:780},deviceScaleFactor:1,acceptDownloads:true});
  const login=async()=>{const response=await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'isolated-guide-recording-password'}});if(!response.ok())throw new Error('Recording account login failed');};
  await login();
  // The screen is the real app. Only model execution is held at its real pending
  // state; completed review/skill examples come from saved, real result fixtures.
  const capabilities={provider:{available:true},functions:Object.fromEntries(['requirements','layout','storyboard','rfp','review','proposal_score'].map(name=>[name,{ready:true,mode:'real',effective:'llm'}]))};
  const jobs=new Map();let serial=0;
  await context.route(url=>url.pathname==='/api/poc/capabilities'||url.pathname==='/api/jobs'||url.pathname.startsWith('/api/jobs/'),async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/api/poc/capabilities')return route.fulfill({json:capabilities});
   if(url.pathname==='/api/jobs'&&request.method()==='POST'){
    const body=request.postDataJSON(),id='recorded-pending-'+ ++serial,job={id,kind:body.kind,title:body.kind==='requirements'?'고객 요구사항 요약':'제안서 구성',status:'running',events:[{seq:1,type:'text',message:'입력한 고객 요구사항과 연결 자료를 확인하고 있어요.'}],next_seq:1};jobs.set(id,job);return route.fulfill({json:job});
   }
   const id=url.pathname.split('/')[3],job=jobs.get(id);return route.fulfill({json:url.pathname.endsWith('/cancel')?{...job,id,status:'cancelled'}:job||{id,status:'running',events:[],next_seq:0}});
  });
  await context.route(url=>url.pathname==='/api/llm',route=>{
   const body=route.request().postDataJSON();
   if(body.feature==='part'||body.prompt?.includes('한 파트에 들어갈 내용'))return route.fulfill({status:200,json:{mode:'real',data:{items:['본사 메뉴·가격을 매장에 일괄 배포','매장별 운영 조건과 네트워크 확인','파일럿의 검증 범위와 판단 기준 합의']}}});
   // Record the real application's pending state for other live AI operations.
   return new Promise(()=>{});
  });
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('.app[data-app-ready="true"]').waitFor({timeout:60000});
  const seed=await page.evaluate(async()=>{
   const {scenarioStoryboard}=await import('/src/domain/templates/scenario_storyboard.js');
   const complete=scenarioStoryboard('bs01');complete.id='guide-recording-complete';complete.endPath='/storyboard/'+complete.id;
   const domain=await import('/src/domain/proposals/requirement-summary.js'),source_key=domain.requirementSourceKey(complete),sources=domain.requirementSources(complete),source=sources.find(source=>source.kind==='customer')||sources[0],point={text:source.text,kind:'fact',refs:[{source_id:source.id,quote:source.text}]};
   complete.requirementSummary={sourceKey:source_key,status:'ready',result:{source_key,sources,coverage:{complete:true},llm:{effective:'llm',model:'guide-input-example'},summary:{overview:point,...Object.fromEntries(domain.SUMMARY_SECTIONS.map(([key])=>[key,['goals','requirements'].includes(key)?[point]:[]]))}}};
   const original=structuredClone(complete);const blank={id:'guide-recording-draft',title:'새 제안서',createdAt:Date.now(),updatedAt:Date.now(),stage:'req',reqTab:'free',customer:'',ind:null,req:{free:[],form:{project:'',customer:'',target:'',keymen:[{id:'guide-owner',name:'',weight:100,reqs:[[]]}],note:''},files:[]},ctx:{products:[],solutions:[],cases:[]},parts:[]};
   const {setupFromScenario}=await import('/src/domain/simulation/profile.js');const {newSim}=await import('/src/repositories/simulations.js');const sim=newSim(setupFromScenario('bs01'),2);sim.id='guide-recording-simulation';sim.msgs=[{id:'guide-customer',who:'cust',text:'본사에서 메뉴와 가격을 바꾸면 전 매장에 제때 반영되는지 어떻게 확인하나요?',ev:{satisfaction:45,delta:0}}];
   const {saveTemplates,myMeta}=await import('/src/repositories/templates.js');const {layoutHtml}=await import('/src/services/catalog.js');const first=complete.parts.flatMap(part=>part.layouts).find(layout=>!layout.f.includes('COVER'));
   await saveTemplates([{meta:myMeta({f:'L_MY_GUIDE_RECORDING',name:'매장 운영 제안 양식',p:'value',kind:'edit',from:'가이드용 개인 양식'}),html:layoutHtml(first.f)}]);
   const {toggleFav}=await import('/src/repositories/favorites.js');for(const layout of complete.parts.flatMap(part=>part.layouts).slice(0,6))toggleFav(layout.f,layout.ov,'가이드 · 전국 매장 메뉴보드');
   return {complete:original,blank,sim,reviews:JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]'),proposals:JSON.parse(localStorage.getItem('winmate.v2.proposals')||'[]')};
  });
  const skill=JSON.parse(fs.readFileSync(path.join(root,'app/tests/fixtures/simulation-skills/product-fit-real.json')));
  seed.sim.skillRuns=[{id:'guide-skill',skillId:'product-fit',prompt:skill.request?.prompt||'전국 매장 원격 운영에 맞는 제품을 제안해 주세요.',status:'done',startedAt:Date.now(),finishedAt:Date.now(),result:skill.result,analysis:skill.result.analysis,stages:Object.fromEntries(['context','database','web','analysis','answers'].map(stage=>[stage,{status:'done'}]))}];
  const reset=async(route,{draft,proposals,sim}={})=>{
   const entries=proposals||[draft||seed.blank,seed.complete,...seed.proposals.filter(p=>p.id!==seed.blank.id&&p.id!==seed.complete.id)];
   await page.evaluate(({route,entries,reviews,sim})=>{
    localStorage.setItem('winmate.v2.proposals',JSON.stringify(entries));localStorage.setItem('winmate.v2.sims',JSON.stringify([sim]));localStorage.setItem('winmate.v2.reviews',JSON.stringify(reviews));localStorage.setItem('winmate.v2.jobs','[]');localStorage.setItem('winmate.v2.ui',JSON.stringify({route,viewer:false}));
    localStorage.removeItem('winmate.v2.shared-drafts');
   },{route,entries,reviews:seed.reviews,sim:sim||seed.sim});
   await page.goto('about:blank',{waitUntil:'commit'});
   // Reset the isolated server's saved original as well as this browser's draft.
   // Otherwise real sharing hydration correctly restores the previous take.
   if(route.name==='proposal'){
    const response=await context.request.get(base+'/api/history/'+route.id);
    if(response.ok()){
     const saved=await response.json(),entry=entries.find(p=>p.id===route.id),document=JSON.parse(JSON.stringify(entry,(key,value)=>['_share','sample','adaptation'].includes(key)?undefined:value));
     for(const key of ['id','endPath','exportedAt'])delete document[key];
     const operations=documentChanges(saved.document,document);
     if(operations.length){const updated=await context.request.patch(base+'/api/storyboards/'+saved.token,{headers:{Origin:base},data:{operations}});if(!updated.ok())throw new Error('Failed to reset the isolated recording original: '+await updated.text());}
    }
   }
   await page.goto(base+(route.name==='proposal'?'/storyboard/'+route.id:route.name==='spatial'?'/spatial'+(route.id?'/'+route.id:''):'/'),{waitUntil:'domcontentloaded'});
   await page.locator('.app[data-app-ready="true"]').waitFor({timeout:60000});await page.mouse.move(1310,12);await page.waitForTimeout(180);
  };
  return {page,context,browser,base,seed,reset,login,errors,close,temporary,apiPort};
 }catch(error){await close();throw error;}
}
