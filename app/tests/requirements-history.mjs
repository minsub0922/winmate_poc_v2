import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import path from 'node:path';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import { requirementSourceKey, requirementSources, SUMMARY_SECTIONS } from '../web/src/domain/proposals/requirement-summary.js';
const password=process.env.WINMATE_TEST_PASSWORD;
let server;
if(!process.env.WINMATE_REQ_HISTORY_WEB){server=await createServer({root:path.resolve('app/web'),configFile:path.resolve('app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});await server.listen();}
const base=process.env.WINMATE_REQ_HISTORY_WEB||'http://127.0.0.1:'+server.httpServer.address().port;
if(!server&&!password)throw Error('WINMATE_TEST_PASSWORD is required for an external server');
const readData=name=>JSON.parse(fs.readFileSync('app/data/'+name+'.json','utf8'));
const bootstrap={catalog:readData('catalog'),products:readData('products_db'),images:readData('images'),capabilities:null,user:{username:'requirements-history-test',auth_enabled:false}};
const smoke=process.env.WINMATE_REQ_HISTORY_SUITE==='smoke',folder='app/tests/output/requirements-history';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch(process.env.CHROME?{executablePath:process.env.CHROME,headless:true}:{headless:true});let context,page,errors,kind;const rows=[];
const caps={provider:{available:true},functions:{requirements:{mode:'real',ready:true,effective:'llm'}}};
const scene={version:1,title:'저장된 매장 조감도',industry:'FB',style:'modern',width:8,depth:6,source:{documentId:'sb-original'},
  rooms:[{id:'lobby',name:'로비',x:0,z:0,width:8,depth:6,height:3}],objects:[]};
const historyId='sp-source';
const requests={summary:[],match:[],copies:[],compute:[]};
const summaryResult=(key,sources,text)=>({source_key:key,llm:{effective:'llm'},sources,
  summary:{overview:{text,refs:[{source_id:sources[0].id,quote:sources[0].text}]},...Object.fromEntries(SUMMARY_SECTIONS.map(([name])=>[name,[]]))}});
const make=(id)=>({id,title:'이전 히스토리 '+id,customer:'고객 '+id,ind:'FB',createdAt:1,updatedAt:1,stage:'story',reqTab:'form',ctx:{products:['qm55c'],solutions:['magicinfo'],cases:['1490']},parts:[],req:{free:[{t:id+' 자유형식 요구사항\n매장 메뉴를 원격 관리합니다. '},{ref:'product:qm55c'}],form:{project:id+' 메뉴보드 파일럿',customer:'고객 '+id,target:'운영 책임자',keymen:[{id:'k-'+id+'-1',name:'운영팀장 '+id,weight:60,reqs:[[{t:'콘텐츠 변경 시간을 줄입니다.'}],[{t:'사이니지 '},{ref:'product:qm55c'},{t:'를 원격 관리합니다.'}]]},{id:'k-'+id+'-2',name:'구매팀장 '+id,weight:40,reqs:[[{t:'총 소유비용을 검증합니다.'}]]}],note:id+' 제작자 의견',noteSegs:[{t:id+' 제작자 의견 · '},{ref:'solution:magicinfo'}]},files:[{id:'file-'+id,name:'요구사항-'+id+'.pdf',size:2048,type:'pdf',memo:'합성 RFP 검증용 첨부 메모'}]}});
const matrixSource=(mask)=>{
  const p=make('옵션-'+mask);
  p.req.free=[{t:'옵션 '+mask+' 운영 요구사항'}];
  p.req.form={...p.req.form,keymen:[],noteSegs:[]};
  p.req.files[0].text='첨부 원문에 포함된 운영 조건';
  if(mask&2) p.ctx.subscriptions=['sub-b2b-ai'];
  else p.ctx={products:[],solutions:[],cases:[]};
  if(mask&1){const key=requirementSourceKey(p),sources=requirementSources(p).filter(s=>s.id.startsWith('file-'));
    p.requirementSummary={status:'ready',sourceKey:key,jobId:'previous-job',result:summaryResult(key,sources,'저장 요약 '+mask)};}
  if(mask&4) p.spacePlan={v:1,vertical:{id:'fb_qsr',name:'패스트푸드',group:'FB'},title:scene.title,summary:'',at:1,
    spaces:[{id:'lobby',name:'로비',kind:'retail',products:mask&2?['qm55c']:[]}],birdseye:{status:'done',by:'requirements-history-test',historyId,title:scene.title,rooms:1,products:mask&2?1:0}};
  return p;
};
const fixtures=(matrix)=>{const target=make('target');target.title='현재 제안서';target.req.files=[];target.ctx={products:['qm65c'],solutions:[],cases:[]};const a=make('A'),b=make('B'),c=make('C');b.req.free=[{t:('상세 요구사항을 생략 없이 읽습니다.\n').repeat(60)+'문서 마지막 요구사항'}];c.req={free:[],form:{project:'빈 항목 검사',customer:'',target:'',keymen:[],note:''},files:[]};return[target,a,b,c,...Array.from({length:9},(_,i)=>make('extra-'+i)),...(matrix?Array.from({length:8},(_,i)=>matrixSource(i)):[])];};
const modal=()=>page.getByRole('dialog',{name:'이전 '+(kind==='ctx'?'제품 · 솔루션 매칭':'고객 요구사항')+' 재사용',exact:true});
const preview=()=>modal().getByRole('region',{name:'불러올 내용',exact:true});
const row=id=>modal().locator('.reuse-item').filter({hasText:'이전 히스토리 '+id});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')));
const target=async()=> (await read()).find(p=>p.id==='target');
const choose=async id=>{await row(id).click();await preview().waitFor();};
async function setup(options){kind=options.kind||'req';context=await browser.newContext({viewport:{width:options.width||1500,height:900},...(options.touch?{hasTouch:true,isMobile:true}:{})});errors=[];
 if(server){
  await context.route(u=>u.pathname.startsWith('/api/'),route=>{
   const {pathname}=new URL(route.request().url());
   if(pathname==='/api/bootstrap')return route.fulfill({json:options.matrix?{...bootstrap,capabilities:caps}:bootstrap});
   if(options.matrix){
    if(pathname==='/api/jobs'&&route.request().method()==='POST'){
     const req=route.request().postDataJSON();requests.summary.push(req);
     return route.fulfill({json:{id:'summary-'+requests.summary.length,kind:'requirements',status:'done',events:[],result:summaryResult(req.source_key,req.sources,'새로 생성한 요약')}});
    }
    if(pathname==='/api/llm'){requests.match.push(route.request().postDataJSON());return route.fulfill({json:{mode:'real',data:{vertical:'fb_qsr',products:[],solutions:[],spaces:[]}}});}
    if(pathname==='/api/spatial/history/'+historyId)return route.fulfill({json:{id:historyId,scene,view:'3d'}});
    if(pathname==='/api/spatial/history'&&route.request().method()==='POST'){
     requests.copies.push(route.request().postDataJSON());return route.fulfill({json:{id:'sp-copy-'+requests.copies.length},status:201});
    }
    if(pathname==='/api/spatial/compute')requests.compute.push(pathname);
   }
   return route.fulfill({status:503,json:{code:'test_no_api'}});
  });
  await context.route('**/img/**',route=>{const rel=decodeURIComponent(new URL(route.request().url()).pathname).slice(1),file=path.resolve(rel.startsWith('img/lib/')?rel:'app/data/static/'+rel);return fs.existsSync(file)?route.fulfill({path:file}):route.abort();});
 }else{const r=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username:'admin',password}});assert.equal(r.status(),200);}
 if(!options.matrix)await context.route(u=>u.origin===new URL(base).origin&&['/api/llm','/api/jobs','/api/layouts/search'].includes(u.pathname),route=>route.request().method()==='GET'?route.continue():route.fulfill({status:503,contentType:'application/json',body:'{"code":"test_model_blocked"}'}));
 await context.route(u=>u.origin===new URL(base).origin&&u.pathname.startsWith('/api/storyboards'),route=>route.fulfill({status:404,contentType:'application/json',body:'{"detail":"isolated fixture: sharing is outside this UI test"}'}));
 await context.addInitScript(list=>{if(sessionStorage.getItem('req-hover-fixture'))return;localStorage.setItem('winmate.v2.proposals',JSON.stringify(list));localStorage.setItem('winmate.v2.seedv','admin-samples-1');localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'proposal',id:'target'}}));sessionStorage.setItem('req-hover-fixture','1');},fixtures(options.matrix));
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/');await page.locator('.app').waitFor({timeout:60000});await page.locator('.boot').waitFor({state:'detached',timeout:60000});await page.locator(kind==='ctx'?'.match-node .node':'.start-node .node').click();const trigger=page.locator(kind==='ctx'?'#mt-pop .reuse-compact':'#rq-pop .reuse-compact');await trigger.waitFor();if(options.open!==false){await trigger.click();await modal().waitFor();await modal().evaluate(el=>Promise.all([...el.getAnimations(),...el.parentElement.getAnimations()].map(a=>a.finished.catch(()=>{}))));}}
async function test(group,name,fn,options={}){if(smoke&&!options.smoke)return;const start=Date.now();try{await setup(options);await fn();assert.deepEqual(errors,[]);rows.push({group,name,passed:true,ms:Date.now()-start});console.log('PASS',group,name);}catch(e){rows.push({group,name,passed:false,error:String(e.stack||e)});console.log('FAIL',group,name,String(e));await page?.screenshot({path:folder+`/failure-${rows.length}.png`,timeout:3000}).catch(()=>{});}finally{await context?.close();}}
try{
 await test('requirements','이전 불러오기 is a compact header button immediately left of ×',async()=>{const header=page.locator('#rq-pop .bp-h');assert.deepEqual(await header.evaluate(h=>[...h.children].slice(-2).map(c=>c.className.split(' ')[0])),['bp-actions','btn']);assert.equal((await header.locator('.reuse-compact').innerText()).trim(),'이전 불러오기');const b=await header.locator('.reuse-compact').boundingBox(),x=await page.locator('.rq-x').boundingBox();assert(b.height<=32&&b.x+b.width<=x.x&&x.x-(b.x+b.width)<=16);assert.equal(await page.locator('#rq-pop .bp-body .reuse-trigger').count(),0);},{open:false,smoke:true});
 await test('requirements','structured preview shows all requirement sections',async()=>{await choose('A');const text=await preview().innerText();for(const value of ['기본 정보','A 메뉴보드 파일럿','고객 A','운영 책임자','자유형식 요구사항','키맨별 요구사항','제작자 의견','첨부파일'])assert(text.includes(value),value);},{smoke:true});
 await test('requirements','keymen, weights and every requirement are visible',async()=>{await choose('A');const text=await preview().innerText();for(const value of ['운영팀장 A','60%','구매팀장 A','40%','콘텐츠 변경 시간','총 소유비용'])assert(text.includes(value),value);});
 await test('requirements','mention tags use human-readable catalog labels',async()=>{await choose('A');const text=await preview().innerText();assert(text.includes('QM55C'));assert(text.includes('MagicINFO'));assert(!text.includes('product:qm55c'));assert(!text.includes('solution:magicinfo'));});
 await test('requirements','attachment name, size and memo appear',async()=>{await choose('A');const text=await preview().innerText();for(const value of ['요구사항-A.pdf','2.0 KB','합성 RFP 검증용 첨부 메모'])assert(text.includes(value));});
 await test('requirements','long source text is not truncated',async()=>{await choose('B');assert((await preview().innerText()).includes('문서 마지막 요구사항'));assert(await preview().evaluate(el=>el.scrollHeight>el.clientHeight));});
 await test('requirements','selection alone keeps current requirements unchanged',async()=>{const before=await target();await choose('A');assert.deepEqual((await target()).req,before.req);});
 await test('requirements','cancel keeps source and target unchanged',async()=>{const before=await read();await choose('A');await modal().getByRole('button',{name:'취소',exact:true}).click();for(const id of ['target','A'])assert.deepEqual((await read()).find(p=>p.id===id).req,before.find(p=>p.id===id).req);});
 await test('requirements','import saves requirements and DSS immediately while keeping the original evidence IDs',async()=>{
  const source=(await read()).find(p=>p.id==='A');
  await choose('A');await modal().getByRole('button',{name:'이 내역 불러오기',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#free-ed')?.innerText.includes('A 자유형식 요구사항'));
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id==='target').customer==='고객 A');
  const editor=await page.locator('#free-ed').innerText();
  for(const value of ['프로젝트: A 메뉴보드 파일럿','매장 메뉴를 원격 관리합니다.','■ 운영팀장 A (가중치 60%)','- 총 소유비용을 검증합니다.','A 제작자 의견'])assert(editor.includes(value),value);
  assert.equal(await page.locator('#rq-pop .fchip').count(),1);
  const p=await target();assert.deepEqual(p.req,source.req);assert.deepEqual(p.ctx,source.ctx);assert.equal(p.customer,source.customer);assert.ok(p.reqSaved);
  assert.deepEqual((await read()).find(p=>p.id==='A'),source);
 },{smoke:true});
 if(server)await test('requirements','all eight optional combinations use saved results and run only missing steps',async()=>{
  const before=await read();
  for(let mask=0;mask<8;mask++){
   const source=before.find(p=>p.id==='옵션-'+mask);
   const counts=Object.fromEntries(Object.entries(requests).map(([key,values])=>[key,values.length]));
   if(mask)await page.locator('#rq-pop .reuse-compact').click();
   await choose(source.id);await modal().getByRole('button',{name:'이 내역 불러오기',exact:true}).click();
   await modal().waitFor({state:'detached'});
   await page.waitForFunction(id=>{
    const p=JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id==='target');
    return p.customer==='고객 '+id&&p.requirementSummary?.status==='ready'&&p.matchExtract?.status==='done';
   },source.id);
   const p=await target();
   assert.deepEqual(p.req,source.req);assert.deepEqual(p.ctx,source.ctx);
   assert.equal(p.requirementSummary.sourceKey,requirementSourceKey(p));
   assert.equal(p.requirementSummary.result.summary.overview.text,mask&1?'저장 요약 '+mask:'새로 생성한 요약');
   if(mask&1)assert.deepEqual(p.requirementSummary.result,source.requirementSummary.result);
   assert.equal(requests.summary.length-counts.summary,mask&1?0:1);
   assert.equal(requests.match.length-counts.match,mask&2?0:1);
   assert.equal(requests.copies.length-counts.copies,mask&4?1:0);
   if(mask&4){
    assert.deepEqual(p.spacePlan.spaces,source.spacePlan.spaces);
    assert.equal(p.spacePlan.birdseye.historyId,'sp-copy-'+requests.copies.length);
    assert.deepEqual(requests.copies.at(-1).scene.rooms,scene.rooms);
    assert.equal(requests.copies.at(-1).scene.source.documentId,'sb-target');
    await page.locator('.dss-be').waitFor();
    assert.deepEqual(await page.evaluate(async()=>(await import('/src/services/space-plan.js')).ensureComposeSpaces('target')),{plan:'kept'});
   }else assert.equal(p.spacePlan,undefined);
   assert.deepEqual((await read()).find(item=>item.id===source.id),source);
  }
  assert.equal(requests.compute.length,0);
  const imported=await target();
  await page.locator('#rq-pop').getByRole('button',{name:'저장',exact:true}).click();
  await page.locator('#rq-pop').waitFor({state:'detached'});
  assert.deepEqual((await target()).req,imported.req);
  assert.equal(requests.summary.length,4);
  assert.equal(requests.match.length,4);
 },{matrix:true,smoke:true});
 await test('requirements','empty sections have explicit empty states',async()=>{await choose('C');const text=await preview().innerText();for(const value of ['자유형식 요구사항이 없어요','등록된 키맨이 없어요','제작자 의견이 없어요','첨부파일이 없어요'])assert(text.includes(value));});
 for(const width of [900,390])await test('requirements',`preview fits ${width}px`,async()=>{await choose('A');const box=await modal().boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert(await preview().evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:folder+`/requirements-${width}.png`});},{width,touch:width===390,smoke:width===390});
 for(const type of ['req','ctx'])await test('selection',type+' history has no hover popup or selection side effect',async()=>{const before=await target();await row('A').hover();await page.waitForTimeout(300);assert.equal(await page.locator('.history-hover-card').count(),0);assert.equal(await row('A').getAttribute('aria-pressed'),'false');assert(await modal().getByRole('button',{name:'이 내역 불러오기',exact:true}).isDisabled());assert.deepEqual(await target(),before);},{kind:type,smoke:true});
 await test('selection','hovering another row preserves the clicked import target',async()=>{await choose('A');await row('B').hover();await page.waitForTimeout(300);assert.equal(await page.locator('.history-hover-card').count(),0);assert((await preview().innerText()).includes('A 메뉴보드 파일럿'));assert.equal(await row('A').getAttribute('aria-pressed'),'true');assert.equal(await row('B').getAttribute('aria-pressed'),'false');},{smoke:true});
 await test('selection','clicking a history shows its full requirements in the preview',async()=>{await choose('B');assert((await preview().innerText()).includes('문서 마지막 요구사항'));assert.equal(await page.locator('.history-hover-card').count(),0);});
 await test('selection','keyboard focus does not open details and Enter selects the row',async()=>{await row('A').focus();await page.waitForTimeout(300);assert.equal(await page.locator('.history-hover-card').count(),0);assert(await modal().getByRole('button',{name:'이 내역 불러오기',exact:true}).isDisabled());await page.keyboard.press('Enter');await preview().waitFor();assert((await preview().innerText()).includes('A 메뉴보드 파일럿'));},{smoke:true});
 await test('selection','Escape closes the import dialog without an intermediate hover layer',async()=>{await row('A').hover();await page.waitForTimeout(300);await page.keyboard.press('Escape');assert.equal(await modal().count(),0);});
 await test('selection','touch tap selects without a hover-only layer',async()=>{await row('A').tap();await preview().waitFor();await page.waitForTimeout(300);assert.equal(await page.locator('.history-hover-card').count(),0);assert.equal(await row('A').getAttribute('aria-pressed'),'true');},{width:390,touch:true});
}finally{await browser.close();await server?.close();const report={base,smoke,cases:rows,groups:Object.fromEntries(['requirements','selection'].map(group=>[group,{total:rows.filter(x=>x.group===group).length,passed:rows.filter(x=>x.group===group&&x.passed).length}]))};fs.writeFileSync(folder+(smoke?'/production-report.json':'/source-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.groups));}
if(rows.some(x=>!x.passed))process.exitCode=1;
