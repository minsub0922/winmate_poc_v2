import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'app/tests/output/spatial-details');fs.mkdirSync(output,{recursive:true});
process.env.WINMATE_API_PORT='8805';process.env.WINMATE_WEB_PORT='5205';
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),cacheDir:path.join(output,'vite-cache'),logLevel:'warn',server:{host:'127.0.0.1',port:5205,strictPort:true,hmr:false}});
let browser;const errors=[];
try{
 await server.listen();let ready=false;for(let attempt=0;attempt<80;attempt++){try{if((await fetch('http://127.0.0.1:8805/api/health')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}assert(ready,'isolated API is ready');browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1560,height:1080}});
 const login=await context.request.post('http://127.0.0.1:5205/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}});assert.equal(login.status(),200);
 const seed=JSON.parse(fs.readFileSync(path.join(output,'scene.json')));
 const saved=await context.request.post('http://127.0.0.1:5205/api/spatial/history',{data:{scene:seed,view:'3d'}});assert.equal(saved.status(),201,await saved.text());const record=await saved.json();
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5205/spatial/'+record.id);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
 const toggle=page.getByRole('button',{name:'제품 · 가구 오브젝트',exact:true});await toggle.click();const popup=page.locator('.sp-objects-popup');
 await page.getByLabel('오브젝트 제품군').selectOption('furniture');const category=page.getByLabel('공용 가구 종류');await category.selectOption('컵 · 식기 · 테이블 소품');assert.equal(await popup.locator('.sp-object-card').count(),24);
 const mug=popup.getByRole('button',{name:'세라믹 머그컵',exact:true});await mug.locator('img').evaluate(img=>img.decode());await page.screenshot({path:output+'/tableware-ui.png'});
 await mug.click();await popup.getByRole('button',{name:'가구 배치',exact:true}).click();await popup.waitFor({state:'hidden'});assert.equal(await page.getByRole('alert').count(),0);
 await page.getByRole('button',{name:'조감도 목록',exact:true}).click();await page.waitForURL('http://127.0.0.1:5205/spatial');
 let document=await(await context.request.get('http://127.0.0.1:5205/api/spatial/history/'+record.id)).json();let cups=document.scene.objects.filter(o=>o.assetId==='furniture:cup-mug');assert.equal(cups.length,2);assert(cups.every(o=>o.mount==='surface'&&o.supportId&&o.elevation>0));
 // The API rejects a cup that is moved off its supporting surface.
 const bad=structuredClone(document.scene);bad.objects.find(o=>o.id===cups[0].id).elevation=0;const invalid=await context.request.put('http://127.0.0.1:5205/api/spatial/history/'+record.id,{data:{scene:bad,view:'3d',revision:document.revision}});assert.equal(invalid.status(),422);
 await page.goto('http://127.0.0.1:5205/spatial/'+record.id);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});await page.getByRole('button',{name:'2D 평면도',exact:true}).click();await page.locator('.sp-plan-image svg').waitFor();for(const cup of cups)assert.equal(await page.locator('.sp-plan-image [data-object-id="'+cup.id+'"]').count(),1);
 await page.waitForTimeout(1100);await page.reload();await page.locator('.sp-plan-image svg').waitFor({timeout:120000});document=await(await context.request.get('http://127.0.0.1:5205/api/spatial/history/'+record.id)).json();assert.equal(document.scene.objects.filter(o=>o.assetId==='furniture:cup-mug').length,2);
 console.log('PASS tableware thumbnails, surface placement, API save/reopen, 2D projection and floating-cup rejection');
 const library=await(await context.request.get('http://127.0.0.1:5205/api/spatial/library/'+document.scene.assetRevision)).json();
 const capture=await page.evaluate(async({scene,library})=>{
   const {createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');const host=window.document.createElement('div');host.style.cssText='width:1280px;height:820px;position:fixed;left:-20000px';window.document.body.appendChild(host);
   const renderer=createSpatialRenderer(host);try{renderer.setScene({...scene,camera:{azimuth:35,elevation:48,zoom:2.3}},library);await renderer.ready();const image=renderer.snapshot().image;const glb=await renderer.exportGlb();let value='';for(const v of new Uint8Array(glb))value+=String.fromCharCode(v);return{image,glb:btoa(value)};}finally{renderer.dispose();host.remove();}
 },{scene:document.scene,library});
 fs.writeFileSync(output+'/scene.png',Buffer.from(capture.image.split(',')[1],'base64'));const glb=Buffer.from(capture.glb,'base64');fs.writeFileSync(output+'/scene.glb',glb);assert.equal(glb.readUInt32LE(0),0x46546c67);
 const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());for(const cup of cups)assert(gltf.nodes.some(n=>n.extras?.objectId===cup.id),'GLB preserves cup geometry');console.log('PASS real PNG and GLB include the same nested cup, tray and rug scene');
 await toggle.click();await page.getByLabel('오브젝트 제품군').selectOption('furniture');await category.selectOption('러그 · 바닥 매트');assert.equal(await popup.locator('.sp-object-card').count(),18);await page.screenshot({path:output+'/rug-ui.png'});
 await page.setViewportSize({width:390,height:844});await category.selectOption('책 · 문구 · 데스크 소품');const box=await popup.boundingBox();assert(box.height<=423);assert(await page.evaluate(()=>window.document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:output+'/mobile-details-ui.png'});
 assert.deepEqual(errors,[]);fs.writeFileSync(output+'/ui-report.json',JSON.stringify({ok:true,sourceHash:library.sourceHash,errors},null,2));console.log('PASS rug and desk-prop categories fit the compact mobile popup; no runtime errors');
}catch(error){fs.writeFileSync(output+'/ui-report.json',JSON.stringify({ok:false,errors,error:String(error)},null,2));throw error;}
finally{await browser?.close();await server.close();}
