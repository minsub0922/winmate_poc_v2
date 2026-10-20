import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'output/spatial-fidelity');fs.mkdirSync(out,{recursive:true});
process.env.WINMATE_API_PORT=process.env.SPATIAL_TEST_API_PORT||'8803';process.env.WINMATE_WEB_PORT='5203';
const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:5203,strictPort:true,hmr:false}});
let browser;const report={startedAt:new Date().toISOString(),sourceHash:library.sourceHash,codeHashes:Object.fromEntries(['pages/SpatialStudioPage.jsx','components/spatial-view.jsx','domain/spatial/render-three.js','styles/spatial.css'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'app/web/src',file))).digest('hex')])),headers:[],errors:[],renders:[]};
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext();assert.equal((await context.request.post('http://127.0.0.1:5203/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).status(),200);
  for(const width of [1500,390]){
    const page=await context.newPage();await page.setViewportSize({width,height:960});page.on('pageerror',e=>{report.errors.push(e.message);console.log('PAGE ERROR '+e.message);});
    page.on('console',msg=>{if(msg.type()==='error')console.log('CONSOLE '+msg.text());});
    let release;const gate=new Promise(resolve=>release=resolve);
    await page.route('**/api/spatial/library',async route=>{await gate;await route.fulfill({json:library});});
    await page.route('**/api/spatial/history',route=>route.fulfill({json:{items:[]}}));
    await page.addInitScript(()=>{window.headerSamples=[];function sample(){const header=document.querySelector('.sp-header');if(header){const r=header.getBoundingClientRect();window.headerSamples.push([r.x,r.y,r.width,r.height]);}requestAnimationFrame(sample);}requestAnimationFrame(sample);});
    await page.goto('http://127.0.0.1:5203/spatial');
    try{await page.locator('.sp-header').waitFor({timeout:45000});}catch(error){await page.screenshot({path:path.join(out,'failed-header.png')});console.log(await page.locator('body').innerText());throw error;}
    assert.equal(await page.getByRole('button',{name:'제품 · 가구 오브젝트'}).isDisabled(),true,'header exists before the library');
    await page.screenshot({path:path.join(out,`loading-${width}.png`)});await page.evaluate(()=>document.fonts.ready);release();
    await page.locator('.sp-studio-launch').waitFor();await page.locator('.sp-home-maps .sp-map-card').first().waitFor();await page.waitForTimeout(500);
    const samples=await page.evaluate(()=>window.headerSamples),drift=samples[0].map((_,i)=>Math.max(...samples.map(s=>s[i]))-Math.min(...samples.map(s=>s[i])));
    report.headers.push({width,samples:samples.length,frames:samples,drift});assert(drift.every(v=>v<1),`header changed at ${width}: ${drift}`);
    await page.getByRole('button',{name:'제품 · 가구 오브젝트'}).click();await page.locator('.sp-object-card').first().waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(out,`library-${width}.png`)});await page.close();
  }
  const draftResponse=await context.request.post('http://127.0.0.1:5203/api/spatial/drafts',{data:{form:{version:1,title:'초기 로딩 검증',industry:'',style:'modern',templateId:null,rooms:[]},view:'3d'}});
  assert.equal(draftResponse.status(),201);const draft=await draftResponse.json();
  for(const scenario of ['slow-history','history-error','direct-draft','reload-draft']){
    const page=await context.newPage();await page.setViewportSize({width:1500,height:960});page.on('pageerror',e=>report.errors.push(e.message));
    await page.route('**/api/spatial/library',route=>route.fulfill({json:library}));
    let release;const gate=new Promise(resolve=>release=resolve);
    await page.route('**/api/spatial/history',async route=>{if(scenario==='slow-history')await gate;await route.fulfill(scenario==='history-error'?{status:503,json:{detail:'히스토리 시험 오류'}}:{json:{items:[]}});});
    await page.route('**/api/spatial/history/'+draft.id,async route=>{await gate;await route.fulfill({json:draft});});
    await page.addInitScript(()=>{window.headerSamples=[];function sample(){const el=document.querySelector('.sp-header');if(el){const r=el.getBoundingClientRect();window.headerSamples.push([r.x,r.y,r.width,r.height]);}requestAnimationFrame(sample);}requestAnimationFrame(sample);});
    const direct=scenario.includes('draft');await page.goto('http://127.0.0.1:5203/spatial'+(direct?'/'+draft.id:''));await page.locator('.sp-header').waitFor();
    await page.waitForTimeout(200);release();
    if(scenario==='history-error')await page.getByRole('alert').waitFor();
    else if(direct)await page.locator('[data-spatial-id="'+draft.id+'"]').waitFor();
    else await page.locator('.sp-studio-launch').waitFor();
    if(scenario==='reload-draft'){await page.reload();await page.locator('[data-spatial-id="'+draft.id+'"]').waitFor();}
    await page.waitForTimeout(200);const frames=await page.evaluate(()=>window.headerSamples),drift=frames[0].map((_,i)=>Math.max(...frames.map(f=>f[i]))-Math.min(...frames.map(f=>f[i])));
    report.headers.push({scenario,frames,samples:frames.length,drift});assert(drift.every(v=>v<1),scenario+' header drift '+drift);await page.close();
  }
  const page=await context.newPage();await page.goto('http://127.0.0.1:5203/favicon.ico');
  // Export the same textured model used in the editor, without opening or
  // mutating the user's saved documents.
  for(const id of ['qm55c','bi_dish','wf1way','ac360','sg_g000183669']){
    const result=await page.evaluate(async({library,id})=>{
      const {createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');
      const host=document.createElement('div');host.style.cssText='width:640px;height:440px';document.body.appendChild(host);
      const asset=library.assets.find(a=>a.productId===id),s={title:id,style:'modern',width:4,depth:4,rooms:[],objects:[{id,assetId:asset.id,x:2,z:2,elevation:0,rotation:0}],camera:{azimuth:30,elevation:20}};
      const renderer=createSpatialRenderer(host,{objectOnly:true});try{
        renderer.setScene(s,library);await renderer.ready();const image=renderer.snapshot({w:640,h:440}).image,glb=await renderer.exportGlb();
        const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js'),roundtrip=await new GLTFLoader().parseAsync(glb,'');
        const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let maps=0;roundtrip.scene.updateMatrixWorld(true);
        roundtrip.scene.traverse(o=>{if(o.material?.map)maps++;if(o.geometry){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);b.min.toArray().forEach((v,i)=>min[i]=Math.min(min[i],v));b.max.toArray().forEach((v,i)=>max[i]=Math.max(max[i],v));}});
        const bounds=max.map((v,i)=>v-min[i]);
        return {image,bytes:glb.byteLength,header:Array.from(new Uint8Array(glb,0,4)),bounds,expected:asset.size,maps,expectsMap:!!asset.appearance?.facade};
      }finally{renderer.dispose();host.remove();}
    },{library,id});
    assert.deepEqual(result.header,[103,108,84,70]);assert(result.bytes>1000);result.bounds.forEach((v,i)=>assert(Math.abs(v-result.expected[i])<Math.max(.005,result.expected[i]*.015),id+' GLB roundtrip bounds'));if(result.expectsMap)assert(result.maps>0,id+' GLB retains texture');fs.writeFileSync(path.join(out,id+'.png'),Buffer.from(result.image.split(',')[1],'base64'));report.renders.push({id,glbBytes:result.bytes,bounds:result.bounds,textureMaps:result.maps});
  }
  assert.deepEqual(report.errors,[]);report.ok=true;console.log('PASS stable initial headers at desktop/mobile, library overflow, textured model PNG/GLB exports');
}finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
