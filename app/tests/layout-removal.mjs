import fs from 'node:fs';
import assert from 'node:assert/strict';
import { startVite, launch, isolatedContext } from './fixtures/strict/harness.mjs';
const filter=process.env.WINMATE_REMOVE_FILTER;const web=process.env.WINMATE_REMOVE_WEB;const vite=web?null:await startVite();const base=web||vite.url;
const browser=await launch();const rows=[];const folder='app/tests/output/layout-removal';fs.mkdirSync(folder,{recursive:true});
let context,page,errors;
const instance=(uid,f='L_PH_P3_A')=>({uid,f,status:'done',ov:{t:{1:'회귀 검사 장표'},img:{}}});
const part=(id,type,layouts)=>({id,type,name:type==='products'?'제품 제안':'가치 제안',done:true,form:'list',text:'',items:['원격 메뉴 운영을 제안합니다.'],layouts});
const fixture=()=>({id:'removal-fixture',title:'선택 해제 검증',createdAt:1,updatedAt:1,stage:'story',reqTab:'free',req:{free:[{t:'메뉴보드 제안 검증'}],form:{project:'메뉴보드',customer:'합성 고객',target:'운영팀',keymen:[],note:''},files:[]},ctx:{products:['qm55c'],solutions:[],cases:[]},parts:[{...part('cover','cover',[instance('cover-1','L_C03')]),deck:true,name:'표지'},part('part-a','products',[instance('a1'),instance('a2')]),part('part-b','value',[instance('b1')])],exportedAt:null});
async function setup(options={}) {
 context=web?await browser.newContext({viewport:{width:1500,height:900},...options}):await isolatedContext(browser,base,options);errors=[];
 if(web){
  const password=process.env.WINMATE_TEST_PASSWORD;if(!password)throw Error('WINMATE_TEST_PASSWORD is required');
  const response=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username:process.env.WINMATE_TEST_USER||'admin',password}});assert.equal(response.status(),200);
  await context.route(url=>url.origin===new URL(base).origin&&['/api/llm','/api/jobs','/api/layouts/search'].includes(url.pathname),route=>route.request().method()==='GET'?route.continue():route.fulfill({status:503,contentType:'application/json',body:'{"code":"test_model_blocked"}'}));
 }
 await context.addInitScript(p=>{if(sessionStorage.getItem('removal-test'))return;localStorage.setItem('winmate.v2.proposals',JSON.stringify([p]));localStorage.setItem('winmate.v2.seedv','admin-samples-1');localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'proposal',id:p.id}}));sessionStorage.setItem('removal-test','1');},fixture());
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/');await page.locator('.lcard[data-layout-uid="a1"]').waitFor({timeout:60000});await page.locator('.boot').waitFor({state:'detached'});
}
const card=(id='a1')=>page.locator(`.lcard[data-layout-uid="${id}"]`);
const confirm=()=>page.getByRole('alertdialog',{name:'레이아웃 선택을 해제할까요?',exact:true});
const sheet=()=>page.locator('.modal.sheet');
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id==='removal-fixture'));
const ids=p=>p.parts.flatMap(s=>s.layouts.map(l=>l.uid));
async function detail(id='a1'){await card(id).click();await sheet().waitFor();await sheet().getByRole('button',{name:'선택 해제',exact:true}).click();await confirm().waitFor();await page.waitForFunction(()=>document.activeElement?.textContent==='취소');}
async function ask(id='a1'){await card(id).hover();await card(id).locator('.layout-remove').click();await confirm().waitFor();await page.waitForFunction(()=>document.activeElement?.textContent==='취소');}
async function removed(id){await page.waitForFunction(id=>!JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p=>p.id==='removal-fixture').parts.some(s=>s.layouts.some(x=>x.uid===id)),id);}
async function run(group,name,fn,options={}){
 if(filter&&!name.includes(filter))return;
 const start=Date.now();try{await setup(options);await fn();assert.deepEqual(errors,[]);rows.push({group,name,passed:true,ms:Date.now()-start});console.log('PASS',group,name);}
 catch(e){rows.push({group,name,passed:false,error:String(e.stack||e)});console.log('FAIL',group,name,String(e));await page?.screenshot({path:folder+`/failure-${rows.length}.png`,timeout:3000}).catch(()=>{});}
 finally{await context?.close();context=null;}
}
try{
 await run('detail','selection is unchanged until confirmation',async()=>{const before=await read();await detail();assert.deepEqual(await read(),before);assert.equal(await sheet().count(),1);assert((await confirm().innerText()).includes('입력한 내용'));});
 await run('detail','cancel leaves layout and detail popup intact',async()=>{await detail();await confirm().getByRole('button',{name:'취소',exact:true}).click();assert.equal(await confirm().count(),0);assert.equal(await sheet().count(),1);assert.deepEqual(ids(await read()),['cover-1','a1','a2','b1']);});
 await run('detail','Escape cancels only confirmation',async()=>{await detail();await confirm().getByRole('button',{name:'취소',exact:true}).focus();await page.keyboard.press('Escape');assert.equal(await confirm().count(),0);assert.equal(await sheet().count(),1);assert(ids(await read()).includes('a1'));});
 await run('detail','confirmation close X cancels',async()=>{await detail();await confirm().getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await sheet().count(),1);assert(ids(await read()).includes('a1'));});
 await run('detail','backdrop cancels without closing detail',async()=>{await detail();await page.locator('.mback').last().click({position:{x:3,y:3}});assert.equal(await confirm().count(),0);assert.equal(await sheet().count(),1);});
 await run('detail','confirm removes exact instance and closes detail',async()=>{await detail();await confirm().getByRole('button',{name:'선택 해제',exact:true}).click();await removed('a1');assert.deepEqual(ids(await read()),['cover-1','a2','b1']);assert.equal(await sheet().count(),0);});
 await run('detail','last layout removal preserves its part',async()=>{await detail('b1');await confirm().getByRole('button',{name:'선택 해제',exact:true}).click();await removed('b1');const p=await read();assert.equal(p.parts.find(s=>s.id==='part-b').layouts.length,0);assert.equal(p.parts.find(s=>s.id==='part-b').name,'가치 제안');});
 await run('detail','same-template second copy is independently removable',async()=>{await detail('a2');await confirm().getByRole('button',{name:'선택 해제',exact:true}).click();await removed('a2');assert.deepEqual(ids(await read()),['cover-1','a1','b1']);});
 await run('detail','confirmed removal survives reload',async()=>{await detail();await confirm().getByRole('button',{name:'선택 해제',exact:true}).click();await removed('a1');await page.reload();await card('a2').waitFor();assert.equal(await card().count(),0);});
 await run('detail','default focused action is safe cancellation',async()=>{await detail();await page.waitForFunction(()=>document.activeElement?.textContent==='취소');await page.keyboard.press('Enter');assert.equal(await confirm().count(),0);assert.equal(await sheet().count(),1);assert(ids(await read()).includes('a1'));});
 await run('detail','arrows do not navigate the underlying sheet',async()=>{await detail();const before=await sheet().locator('.sv-nav .note').innerText();await confirm().getByRole('button',{name:'취소',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await sheet().locator('.sv-nav .note').innerText(),before);assert.equal(await confirm().count(),1);});
 await run('detail','Tab wraps inside confirmation',async()=>{await detail();await confirm().getByRole('button',{name:'선택 해제',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await confirm().getByRole('button',{name:'닫기',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Shift+Tab');assert.equal(await confirm().getByRole('button',{name:'선택 해제',exact:true}).evaluate(el=>el===document.activeElement),true);});
 await run('card','X is hidden until hover or focus',async()=>{await card().scrollIntoViewIfNeeded();await page.mouse.move(1,1);assert.equal(await card().locator('.layout-remove').evaluate(el=>getComputedStyle(el).opacity),'0');});
 await run('card','hover reveals upper-right X without overlapping favorite',async()=>{await card().hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-layout-uid="a1"] .layout-remove')).opacity==='1');const b=await card().boundingBox(),x=await card().locator('.layout-remove').boundingBox(),f=await card().locator('.fav-btn').boundingBox();assert(x.x>b.x+b.width/2&&x.y<b.y+20);assert(f.x+f.width<=x.x);await page.screenshot({path:folder+'/hover.png'});});
 await run('card','X opens confirmation without opening detail',async()=>{await ask();assert.equal(await sheet().count(),0);assert.equal(await page.locator('.lcard[data-layout-uid]').count(),3);await page.screenshot({path:folder+'/confirmation.png'});});
 await run('card','cancel preserves exact proposal',async()=>{const before=await read();await ask();await confirm().getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),before);assert.equal(await confirm().count(),0);},{viewport:{width:900,height:900}});
 await run('card','Escape preserves selected card',async()=>{await ask();await confirm().getByRole('button',{name:'취소',exact:true}).focus();await page.keyboard.press('Escape');assert.equal(await confirm().count(),0);assert.equal(await card().count(),1);assert.equal(await sheet().count(),0);});
 await run('card','confirm removes only clicked card',async()=>{await ask();await confirm().getByRole('button',{name:'선택 해제',exact:true}).click();await removed('a1');assert.deepEqual(ids(await read()),['cover-1','a2','b1']);assert.equal(await sheet().count(),0);});
 await run('card','keyboard Enter on X never opens detail',async()=>{await card().locator('.layout-remove').focus();await page.keyboard.press('Enter');await confirm().waitFor();assert.equal(await sheet().count(),0);assert(ids(await read()).includes('a1'));});
 await run('card','keyboard focus reveals X',async()=>{await card().locator('.layout-remove').focus();await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-layout-uid="a1"] .layout-remove')).opacity==='1');assert.equal(await card().locator('.layout-remove').evaluate(el=>getComputedStyle(el).pointerEvents),'auto');});
 await run('card','touch device exposes and opens X',async()=>{await card().scrollIntoViewIfNeeded();assert.equal(await card().locator('.layout-remove').evaluate(el=>getComputedStyle(el).opacity),'1');await card().locator('.layout-remove').tap();await confirm().waitFor();assert.equal(await sheet().count(),0);},{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await run('card','removal is persistent after reload',async()=>{await ask();await confirm().getByRole('button',{name:'선택 해제',exact:true}).click();await removed('a1');await page.reload();await card('a2').waitFor();assert.deepEqual(ids(await read()),['cover-1','a2','b1']);});
 await run('card','clicking normal card still opens detail',async()=>{await card().click();await sheet().waitFor();assert.equal(await confirm().count(),0);});
 await run('card','Best Scenario read-only board has no removal control',async()=>{await page.locator('.sidebar').hover({position:{x:20,y:20}});await page.locator('.sb-bs').click();await page.locator('.bsl-more').first().click();await page.locator('.canvas-wrap.ro .lcard').first().waitFor({state:'attached'});assert.equal(await page.locator('.canvas-wrap.ro .layout-remove').count(),0);});
}finally{await browser.close();await vite?.close();const report={base,cases:rows,groups:Object.fromEntries(['detail','card'].map(group=>[group,{total:rows.filter(r=>r.group===group).length,passed:rows.filter(r=>r.group===group&&r.passed).length}]))};fs.writeFileSync(folder+(filter?'/retest.json':web?'/production-report.json':'/report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.groups));}
if(rows.some(r=>!r.passed))process.exitCode=1;
