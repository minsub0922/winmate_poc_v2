import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'app/tests/output/spatial-naturalness');fs.mkdirSync(output,{recursive:true});
process.env.WINMATE_API_PORT='8795';process.env.WINMATE_WEB_PORT='5195';
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:5195,strictPort:true,hmr:false}});
let browser;const errors=[],checks=[];const pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1500,height:1050},acceptDownloads:true});
  const login=await context.request.post('http://127.0.0.1:5195/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}});assert.equal(login.status(),200);
  await context.route(u=>['/api/llm','/api/jobs'].includes(u.pathname),route=>route.request().method()==='POST'?route.fulfill({status:503,json:{detail:'isolated natural-layout test'}}):route.continue());
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5195/spatial');await page.locator('.sp-studio-launch').waitFor({timeout:120000});
  await page.locator('.sp-studio-launch').click();await page.locator('.sp-view[data-ready=true]').waitFor();
  assert.equal(await page.locator('.sp-natural-bar.needs-attention').count(),0);await page.screenshot({path:output+'/new-default-3d.png',fullPage:true});pass('new studio detects natural chair/table and sofa/conversation relationships');
  await page.evaluate(()=>{
    const key='winmate.v2.spatial-draft.admin',draft=JSON.parse(localStorage.getItem(key));
    for(const object of draft.scene.objects.filter(o=>['furniture:chair','furniture:taskchair','furniture:sofa'].includes(o.assetId)))object.rotation=(object.rotation+180)%360;
    draft.dirty=true;localStorage.setItem(key,JSON.stringify(draft));
  });
  await page.reload();await page.locator('.sp-studio-launch').waitFor();await page.locator('.sp-studio-launch').click();await page.locator('.sp-natural-bar.needs-attention').waitFor();
  await page.getByRole('button',{name:'자연스럽게 정리',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.sp-natural-bar.needs-attention'));pass('live detection and one-click correction of reversed chairs and sofas');
  await page.getByRole('button',{name:'실행 취소',exact:true}).click();await page.locator('.sp-natural-bar.needs-attention').waitFor();
  await page.getByRole('button',{name:'다시 실행',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.sp-natural-bar.needs-attention'));pass('repair is reversible with undo/redo');
  await page.getByRole('button',{name:'2D 평면도',exact:true}).click();await page.locator('.sp-plan-image svg').waitFor();
  await page.locator('.sp-plan-image [data-object-id="cowork-work-f1"]').click();await page.locator('.sp-facing-target').waitFor();
  assert((await page.locator('.sp-facing-target').innerText()).includes('업무 데스크'));assert.equal(await page.locator('[data-facing-direction]').count(),1);await page.screenshot({path:output+'/selected-chair-2d.png',fullPage:true});pass('2D selected chair shows front arrow and the desk it faces');
  await page.getByRole('button',{name:'저장',exact:true}).click();await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-natural-bar').waitFor();assert.equal(await page.locator('.sp-natural-bar.needs-attention').count(),0);pass('corrected relationships persist in account history');
  const legacy=JSON.parse(fs.readFileSync(path.join(output,'before-scene.json')));
  await page.evaluate(scene=>{localStorage.setItem('winmate.v2.spatial-draft.admin',JSON.stringify({scene,view:'2d',dirty:false,record:null}));},legacy);
  await page.goto('http://127.0.0.1:5195/spatial');await page.locator('.sp-studio-launch').waitFor();await page.locator('.sp-studio-launch').click();await page.locator('.sp-natural-bar').waitFor();
  assert.equal(await page.locator('.sp-natural-bar.needs-attention').count(),0);assert((await page.locator('.sp-explanation').innerText()).includes('기존 장면의 가구'));pass('legacy draft is upgraded using its frozen object library, without losing undo');
  const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));
  for(const which of ['before','after']){
    const scene=JSON.parse(fs.readFileSync(path.join(output,which+'-scene.json')));
    const data=await page.evaluate(async({scene,library})=>{
      const {createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');const host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px;width:1600px;height:1025px';document.body.appendChild(host);
      const renderer=createSpatialRenderer(host);try{renderer.setScene(scene,library);return renderer.snapshot().image;}finally{renderer.dispose();host.remove();}
    },{scene,library});fs.writeFileSync(path.join(output,which+'-3d.png'),Buffer.from(data.split(',')[1],'base64'));
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass('natural-layout controls fit mobile viewport');
  assert.deepEqual(errors,[]);fs.writeFileSync(output+'/report.json',JSON.stringify({ok:true,checks,errors},null,2));
}catch(error){fs.writeFileSync(output+'/report.json',JSON.stringify({ok:false,checks,errors,error:String(error)},null,2));throw error;}
finally{await browser?.close();await server.close();}
