import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createScene,focusScene} from '../web/src/domain/spatial/scene.js';
import {peopleInScene} from '../web/src/domain/spatial/people-placement-geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'app/tests/output/spatial-people-layout');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wm-people-layout-')),apiPort=process.env.SPATIAL_PEOPLE_API_PORT||'8825',webPort=Number(process.env.SPATIAL_PEOPLE_WEB_PORT||5325),base='http://127.0.0.1:'+webPort;
process.env.WINMATE_API_PORT=apiPort;process.env.WINMATE_WEB_PORT=String(webPort);
const api=spawn(path.join(root,'app/.venv/bin/python'),['-B','app/tests/fixtures/spatial/server.py'],{cwd:root,env:{...process.env,WINMATE_AUTH_DIR:path.join(temp,'auth'),WINMATE_SPATIAL_DB:path.join(temp,'spatial.sqlite'),WINMATE_STORYBOARD_DIR:path.join(temp,'storyboards')}});
let apiLog='';api.stdout.on('data',data=>apiLog+=data);api.stderr.on('data',data=>apiLog+=data);
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),cacheDir:path.join(temp,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false}});
let browser,page;const errors=[],checks=[],pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
 let ready=false;for(let i=0;i<120;i++){if(api.exitCode!=null)throw Error(apiLog);try{if((await fetch('http://127.0.0.1:'+apiPort+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(ready);
 await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1560,height:1080}});
 assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).status(),200);
 const library=await(await context.request.get(base+'/api/spatial/library')).json(),assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
 await context.route(u=>['/api/llm','/api/jobs'].includes(u.pathname),route=>route.request().method()==='POST'?route.fulfill({status:503,json:{detail:'isolated people layout test'}}):route.continue());
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/spatial');await page.getByRole('button',{name:'업종별 템플릿 활용하기',exact:true}).click({timeout:120000});
 const modal=page.getByRole('dialog',{name:'업종 템플릿',exact:true});await modal.getByLabel('템플릿 업종',{exact:true}).selectOption('ED');await modal.getByLabel('템플릿 범위',{exact:true}).selectOption('full');await modal.getByLabel('공간 크기',{exact:true}).selectOption('standard');
 const card=modal.locator('.sp-template-card[data-template-id="ed-full-standard"]');await card.waitFor();const expected=createScene({templateId:'ed-full-standard'},library),expectedPeople=peopleInScene(expected,assets).length;assert(expectedPeople>20);
 const svg=decodeURIComponent((await card.locator('img').getAttribute('src')).split(',').slice(1).join(','));assert.equal((svg.match(/data-person-role=/g)||[]).length,expectedPeople);
 await card.getByRole('button',{name:'3D 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-template-id="ed-full-standard"] img')?.src.startsWith('data:image/png'),null,{timeout:120000});await card.locator('img').evaluate(i=>i.decode());await page.screenshot({path:out+'/template-3d.png'});pass('industry template previews include every attached teacher/student in matching actual 2D and 3D');
 await card.getByRole('button',{name:'활용하기',exact:true}).click();await page.getByRole('dialog',{name:'스튜디오로 이동할까요?',exact:true}).getByRole('button',{name:'스튜디오로 이동',exact:true}).click();await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
 const id=page.url().split('/').at(-1),saved=await(await context.request.get(base+'/api/spatial/history/'+id)).json();assert.deepEqual(saved.scene.objects,expected.objects);assert.equal(peopleInScene(saved.scene,assets).length,expectedPeople);
 await page.getByRole('button',{name:'2D 평면도',exact:true}).click();await page.locator('.sp-plan-image svg').waitFor();assert.equal(await page.locator('.sp-plan-image [data-person-role]').count(),expectedPeople);await page.waitForTimeout(900);await page.reload();await page.locator('.sp-plan-image svg').waitFor({timeout:120000});assert.equal(await page.locator('.sp-plan-image [data-person-role]').count(),expectedPeople);pass('using a template saves exact people/furniture links and restores them after reload');
 for(const tid of ['fb-full-standard','md-full-standard','mf-full-standard']){
  const scene=createScene({templateId:tid},library),response=await context.request.post(base+'/api/spatial/history',{data:{scene,view:'3d'}});assert.equal(response.status(),201,await response.text());assert.deepEqual((await response.json()).scene.objects,scene.objects);
 }
 const bad=structuredClone(expected);bad.objects.find(o=>o.people?.length).people[0].offset[0]=100;const rejected=await context.request.post(base+'/api/spatial/history',{data:{scene:bad,view:'3d'}});assert.equal(rejected.status(),422);pass('API accepts dining/clinical/industrial occupants and rejects an out-of-bounds body');
 const classroom=focusScene(expected,expected.rooms.find(r=>r.kind==='classroom').id);
 const exported=await page.evaluate(async({scene,library})=>{
  const{createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');const host=document.createElement('div');host.style.cssText='width:1280px;height:840px;position:fixed;left:-20000px';document.body.append(host);const r=createSpatialRenderer(host);
  try{r.setScene(scene,library);await r.ready();const png=r.snapshot().image,buffer=await r.exportGlb();let bytes='';for(const n of new Uint8Array(buffer))bytes+=String.fromCharCode(n);return{png,glb:btoa(bytes)};}finally{r.dispose();host.remove();}
 },{scene:classroom,library});
 fs.writeFileSync(out+'/classroom-export.png',Buffer.from(exported.png.split(',')[1],'base64'));const glb=Buffer.from(exported.glb,'base64');fs.writeFileSync(out+'/classroom-export.glb',glb);assert.equal(glb.readUInt32LE(0),0x46546c67);const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());assert(gltf.nodes.some(n=>n.extras?.occupantRole==='선생님'));assert(gltf.nodes.some(n=>n.extras?.occupantRole==='학생'));assert(gltf.meshes.length>180);pass('PNG and real GLB preserve the same occupied furniture, actor geometry and profession metadata');
 await page.setViewportSize({width:390,height:844});await page.mouse.move(380,10);await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);await page.locator('.sp-plan-image').scrollIntoViewIfNeeded();assert.equal(await page.locator('.sp-plan-image [data-person-role]').count(),expectedPeople);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/mobile.png'});pass('mobile 2D retains every attached person without horizontal overflow');
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/ui-report.json',JSON.stringify({ok:true,sourceHash:library.sourceHash,checks,errors,checkedAt:new Date().toISOString()},null,2));
}catch(error){await page?.screenshot({path:out+'/failure.png'}).catch(()=>{});fs.writeFileSync(out+'/ui-report.json',JSON.stringify({ok:false,checks,errors,error:String(error.stack||error)},null,2));throw error;}
finally{await browser?.close();await server.close();api.kill('SIGTERM');await new Promise(r=>api.exitCode!=null?r():api.once('close',r));fs.rmSync(temp,{recursive:true,force:true});}
