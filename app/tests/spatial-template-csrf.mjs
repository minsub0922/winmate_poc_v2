// Real auth and scene storage on isolated ports; no production account/history writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'app/tests/output/spatial-template-403');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wm-template-csrf-')),apiPort=process.env.SPATIAL_CSRF_API_PORT||'8840',webPort=Number(process.env.SPATIAL_CSRF_WEB_PORT||5340),base='http://127.0.0.1:'+webPort,before=process.argv.includes('--before'),ui=process.argv.includes('--ui');
process.env.WINMATE_API_PORT=apiPort;process.env.WINMATE_WEB_PORT='5173';
const api=spawn(path.join(root,'app/.venv/bin/python'),['-B','app/tests/fixtures/spatial/server.py'],{cwd:root,env:{...process.env,WINMATE_AUTH_DIR:path.join(temp,'auth'),WINMATE_SPATIAL_DB:path.join(temp,'scenes.sqlite'),WINMATE_STORYBOARD_DIR:path.join(temp,'storyboards')}});
let apiLog='';api.stdout.on('data',v=>apiLog+=v);api.stderr.on('data',v=>apiLog+=v);
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),cacheDir:path.join(temp,'vite-cache'),...(!ui?{optimizeDeps:{noDiscovery:true,include:[]}}:{}),logLevel:'error',server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false}}),checks=[];
let browser;
try{
 let ready=false;for(let i=0;i<100;i++){if(api.exitCode!=null)throw Error(apiLog);try{if((await fetch('http://127.0.0.1:'+apiPort+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}assert(ready);await server.listen();
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'spatial-isolated-test-password'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'))),scene=createScene({templateId:'fb-full-standard'},library),form=studioFormFromScene(scene),body=JSON.stringify({scene,form,view:'3d'});
 const headers={Cookie:cookie,'Content-Type':'application/json',Referer:base+'/spatial','Sec-Fetch-Site':'same-origin'};
 const response=await fetch(base+'/api/spatial/history',{method:'POST',headers,body}),record=await response.json();
 if(before){assert.equal(response.status,403);assert.equal(record.code,'csrf_rejected');checks.push('Reproduced: authenticated same-origin template save with Referer but no Origin returns CSRF 403');}
 else{
  assert.equal(response.status,201,JSON.stringify(record));assert.deepEqual(record.scene.objects,scene.objects);assert.equal(record.scene.rooms.length,6);checks.push('Origin-less same-origin template save succeeds on the actual non-default Vite port');
  const reopened=await fetch(base+'/api/spatial/history/'+record.id,{headers:{Cookie:cookie}});assert.equal(reopened.status,200);assert.deepEqual((await reopened.json()).scene,scene);checks.push('Reopened studio preserves the exact six-room scene');
  const updated=await fetch(base+'/api/spatial/history/'+record.id,{method:'PUT',headers,body:JSON.stringify({scene,form,view:'2d',revision:record.revision})});assert.equal(updated.status,200,await updated.text());checks.push('Subsequent studio saves accept the same valid Referer');
  for(const referer of ['http://localhost:'+webPort+'/spatial',base+'/spatial?view=2d']){
   const r=await fetch(base+'/api/spatial/drafts',{method:'POST',headers:{...headers,Referer:referer},body:JSON.stringify({form,view:'2d'})});assert.equal(r.status,201,await r.text());
  }
  checks.push('Loopback aliases and Referer query strings remain supported');
  for(const bad of [{Referer:'https://evil.example/spatial'},{Referer:'http://localhost:5173/spatial'},{Origin:'null'},{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'same-site'}]){
   const r=await fetch(base+'/api/spatial/history',{method:'POST',headers:{...headers,...bad},body});assert.equal(r.status,403);assert.equal((await r.json()).code,'csrf_rejected');
  }
  checks.push('Foreign/null origins, incorrect ports and cross-site Referer-only requests remain HTTP 403');
  if(ui){
   const observed=[];server.httpServer.on('request',request=>{if(request.headers['x-wm-template-regression'])observed.push({origin:request.headers.origin,referer:request.headers.referer});});
   browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1560,height:1080}});
   assert.equal((await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username:'admin',password:'spatial-isolated-test-password'}})).status(),200);
   await context.route(url=>url.pathname.startsWith('/api/spatial/history'),async route=>{
    if(!['POST','PUT'].includes(route.request().method()))return route.continue();
    const changed={...route.request().headers(),referer:base+'/spatial','sec-fetch-site':'same-origin','x-wm-template-regression':'1'};delete changed.origin;await route.continue({headers:changed});
   });
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/spatial');await page.getByRole('button',{name:'업종별 템플릿 활용하기',exact:true}).click({timeout:120000});
   const card=page.locator('.sp-template-card[data-template-id="fb-full-standard"]');await card.getByRole('button',{name:'활용하기',exact:true}).click();
   const savedResponse=page.waitForResponse(r=>r.url().endsWith('/api/spatial/history')&&r.request().method()==='POST');
   await page.getByRole('dialog',{name:'스튜디오로 이동할까요?',exact:true}).getByRole('button',{name:'스튜디오로 이동',exact:true}).click();
   const saved=await savedResponse;assert.equal(saved.status(),201,await saved.text());await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-plan-image svg').waitFor({timeout:120000});assert.equal(await page.locator('.sp-plan-image [data-room-id]').count(),6);
   assert(observed.some(r=>r.origin===undefined&&r.referer===base+'/spatial'),'actual browser request entered proxy without Origin');
   await page.reload();await page.locator('.sp-plan-image svg').waitFor({timeout:120000});assert.equal(await page.locator('.sp-plan-image [data-room-id]').count(),6);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'studio-open.png')});checks.push('Actual template confirmation opens and reloads its six-room studio after Origin is removed at the browser request boundary');
  }
 }
 fs.writeFileSync(path.join(out,before?'before.json':'proxy-regression.json'),JSON.stringify({ok:true,sourceHash:library.sourceHash,checks,apiPort,webPort,configuredWebPort:5173,status:response.status,checkedAt:new Date().toISOString()},null,2));console.log(checks.join('\n'));
}finally{await browser?.close();await server.close();api.kill('SIGTERM');await new Promise(r=>api.exitCode!=null?r():api.once('close',r));fs.rmSync(temp,{recursive:true,force:true});}
