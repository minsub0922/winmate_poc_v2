/** Deployment regression in isolated browser contexts; never changes the user's browser data. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const base = process.env.WINMATE_TEST_URL || 'http://127.0.0.1:8788';
const password = process.env.WINMATE_TEST_PASSWORD;
if (!password) throw Error('WINMATE_TEST_PASSWORD is required');
const folder='app/tests/output/admin-history';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({headless:true});const rows=[];let current;
const ready=async page=>{await page.locator('.app').waitFor({timeout:60000});await page.locator('.boot').waitFor({state:'detached',timeout:60000});};
async function context(width=1500,init) {
 const ctx=await browser.newContext({viewport:{width,height:900}});current=ctx;
 if(init)await ctx.addInitScript(init);
 const response=await ctx.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username:'admin',password}});
 assert.equal(response.status(),200);return [ctx,await ctx.newPage()];
}
const history=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')||'[]'));
async function openSample(page,index=0) {
 await page.locator('.sidebar').hover({position:{x:20,y:20}});
 await page.locator('.sb-list .sb-item').nth(index).click();
 await page.getByRole('textbox',{name:'제안서 이름',exact:true}).waitFor();
}
async function test(name,fn) {
 const start=Date.now();
 try {await fn();rows.push({name,passed:true,ms:Date.now()-start});console.log('PASS',name);}
 catch(e){rows.push({name,passed:false,error:String(e.stack||e)});console.log('FAIL',name,String(e));}
 finally{if(current){await current.close();current=null;}}
}
try {
 for(const width of [1500,900,390])await test(`external form login and 3 samples at ${width}px`,async()=>{
  const ctx=await browser.newContext({viewport:{width,height:900}});current=ctx;const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/');await page.locator('#username').fill('admin');await page.locator('#password').fill(password);await page.locator('#submit').click();await ready(page);
  const list=await history(page);assert.equal(list.length,3);assert(list.every(p=>p.title.startsWith('[샘플]')&&p.parts.length&&p.sample.source==='best-scenario'));
  assert.deepEqual(errors,[]);await page.screenshot({path:`${folder}/external-${width}.png`});
 });
 await test('all 3 sample storyboards open with actual layouts',async()=>{
  const [ctx,page]=await context();const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/');await ready(page);
  for(let i=0;i<3;i++){await openSample(page,i);assert((await page.getByRole('textbox',{name:'제안서 이름',exact:true}).inputValue()).startsWith('[샘플]'));assert(await page.locator('.col[data-pid]').count()>0);assert((await page.locator('.lay-toggle').innerText()).includes('장'));}
  assert.deepEqual(errors,[]);
 });
 await test('sample editing persists after reload without duplication',async()=>{
  const [ctx,page]=await context();await page.goto(base+'/');await ready(page);await openSample(page);await page.getByRole('textbox',{name:'제안서 이름',exact:true}).fill('내가 수정한 샘플');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')).some(p=>p.title==='내가 수정한 샘플'));
  await page.reload();await ready(page);const list=await history(page);assert.equal(list.length,3);assert(list.some(p=>p.title==='내가 수정한 샘플'));
 });
 await test('existing proposal remains untouched during initial samples merge',async()=>{
  const [ctx,page]=await context(1500,()=>{localStorage.setItem('winmate.v2.proposals',JSON.stringify([{id:'existing-work',title:'기존 사용자 기록',createdAt:1,updatedAt:1,stage:'req',req:{free:[],form:{project:'',customer:'',target:'',keymen:[],note:''},files:[]},ctx:{products:[],solutions:[],cases:[]},parts:[]}]))});
  await page.goto(base+'/');await ready(page);const list=await history(page);assert.equal(list.length,4);assert.equal(list[0].id,'existing-work');assert.equal(list[0].title,'기존 사용자 기록');
 });
 await test('deleted sample does not return on a later session',async()=>{
  const [ctx,page]=await context();await page.goto(base+'/');await ready(page);await page.evaluate(()=>{const list=JSON.parse(localStorage.getItem('winmate.v2.proposals'));localStorage.setItem('winmate.v2.proposals',JSON.stringify(list.slice(1)));});await page.reload();await ready(page);assert.equal((await history(page)).length,2);
 });
 await test('new independent device receives samples',async()=>{
  const [ctx,page]=await context();await page.goto(base+'/');await ready(page);assert.equal((await history(page)).length,3);assert.equal(await page.evaluate(()=>localStorage.getItem('winmate.v2.seedv')),'admin-samples-1');
 });
 await test('slow application module keeps startup messages hidden',async()=>{
  const [ctx,page]=await context();let release;const gate=new Promise(r=>release=r);await page.route(/\/assets\/App-.*\.js$/,async r=>{await gate;await r.continue();});
  await page.goto(base+'/',{waitUntil:'commit'});
  try{await page.locator('#wm-startup').waitFor({state:'attached',timeout:10000});assert.equal(await page.locator('#wm-startup').isVisible(),false);assert.equal(await page.getByText('Winmate를 준비하고 있어요',{exact:true}).count(),0);await page.screenshot({path:folder+'/slow-start.png'});}finally{release();}
  await ready(page);
 });
 await test('blocked entry script shows retry instead of a white screen',async()=>{
  const [ctx,page]=await context();await page.route(/\/assets\/app-.*\.js$/,r=>r.abort('failed'));await page.goto(base+'/');await page.locator('#wm-startup-retry').waitFor({state:'visible'});assert((await page.locator('#wm-startup-message').innerText()).includes('앱 파일'));
 });
 await test('bootstrap outage shows an actionable failure screen',async()=>{
  const [ctx,page]=await context();await page.route('**/api/bootstrap',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'연결 검증용 장애'})}));await page.goto(base+'/');await page.getByText('앱을 준비하지 못했어요',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'다시 시도',exact:true}).isVisible());
 });
 await test('render failure preserves history and shows a recovery screen',async()=>{
  const [ctx,page]=await context(1500,()=>{localStorage.setItem('winmate.v2.proposals',JSON.stringify([{id:'malformed-fixture',title:'손상된 테스트 기록',parts:null}]));});await page.goto(base+'/');await page.getByRole('alert').getByText('화면을 표시하지 못했어요',{exact:true}).waitFor({timeout:60000});assert.equal((await history(page))[0].id,'malformed-fixture');
 });
} finally {await browser.close();fs.writeFileSync(folder+'/browser-report.json',JSON.stringify({base,cases:rows,passed:rows.filter(r=>r.passed).length,total:rows.length},null,2));console.log(JSON.stringify(rows,null,2));}
if(rows.some(r=>!r.passed))process.exitCode=1;
