import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {emptyStudioForm,newStudioRoom,createSceneFromForm} from '../web/src/domain/spatial/studio-form.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'app/tests/output/spatial-module-loading');fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(root,'.wm_tmp/spatial-module-loading-'));
const port=process.env.SPATIAL_MODULE_TEST_PORT||'8994',base='http://127.0.0.1:'+port;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const assetDir=path.join(root,'app/web/dist/assets');
const snapshot=()=>Object.fromEntries(fs.readdirSync(assetDir).filter(n=>/\.(js|css)$/.test(n)).map(n=>[n,hash(fs.readFileSync(path.join(assetDir,n)))]));
const report={startedAt:new Date().toISOString(),checks:[],errors:[],beforeAssets:snapshot()};
const check=message=>{report.checks.push(message);console.log('PASS '+message);};
const server=spawn(path.join(root,'app/.venv/bin/python'),['-B','app/tests/fixtures/spatial/server.py'],{cwd:root,env:{...process.env,WINMATE_API_PORT:port,WINMATE_AUTH_DIR:path.join(temporary,'auth'),WINMATE_SPATIAL_DB:path.join(temporary,'spatial.sqlite'),WINMATE_STORYBOARD_DIR:path.join(temporary,'storyboards')}});
let serverLog='',browser,page;server.stdout.on('data',b=>serverLog+=b);server.stderr.on('data',b=>serverLog+=b);
const runBuild=()=>new Promise((resolve,reject)=>{let log='';const task=spawn('npm',['--prefix','app/web','run','build'],{cwd:root});task.stdout.on('data',b=>log+=b);task.stderr.on('data',b=>log+=b);task.on('error',reject);task.on('close',code=>{fs.writeFileSync(path.join(output,'build.log'),log);code===0?resolve():reject(new Error('build failed: '+log));});});
try{
  let up=false;for(let i=0;i<100;i++){if(server.exitCode!=null)throw new Error(serverLog);try{const r=await fetch(base+'/api/spatial/library');if(r.ok){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(up,'isolated API ready');
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const descriptionFile=path.join(root,'app/web/public/assets/description-standards/layouts.json.gz');
  const description=fs.existsSync(descriptionFile)?fs.readFileSync(descriptionFile):null;if(description)JSON.parse(gunzipSync(description));
  const makeContext=async()=>{const context=await browser.newContext({viewport:{width:1480,height:1000}});assert((await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).ok());if(description)await context.route('**/assets/description-standards/layouts.json.gz',r=>r.fulfill({status:200,contentType:'application/gzip',body:description}));await context.route(u=>['/api/llm','/api/jobs'].includes(u.pathname),r=>r.request().method()==='POST'?r.fulfill({status:503,json:{detail:'isolated module-loading test'}}):r.continue());return context;};
  const context=await makeContext(),library=await(await context.request.get(base+'/api/spatial/library')).json();report.sourceHash=library.sourceHash;
  const form={...emptyStudioForm(),industry:'OF',title:'3D 모듈 배포 복구 검증',rooms:[{...newStudioRoom('배포 검증 회의실'),kind:'meeting',products:[{productId:'qm55c',quantity:2}]}]};
  const scene=createSceneFromForm(form,library);
  const created=await context.request.post(base+'/api/spatial/history',{data:{scene,form,view:'2d'}});assert.equal(created.status(),201,await created.text());const document=await created.json(),url=base+'/spatial/'+document.id;
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));const requested=[];page.on('request',r=>{if(/\/assets\/render-three-[^/]+\.js/.test(r.url()))requested.push(r.url());});
  await page.goto(url);await page.locator('.sp-plan-image svg').waitFor({timeout:120000});assert.equal(requested.length,0,'renderer remains lazy before deployment');
  await runBuild();report.afterAssets=snapshot();
  for(const [name,digest] of Object.entries(report.beforeAssets)){assert.equal(report.afterAssets[name],digest,'preserved old dependency '+name);const response=await context.request.get(base+'/assets/'+name);assert(response.ok(),name+' remains served');assert.equal(hash(await response.body()),digest,'unchanged HTTP bytes '+name);}
  check('production rebuild preserves every previous JS/CSS module and its exact HTTP bytes');
  await page.getByRole('button',{name:'3D 조감도',exact:true}).click();await page.locator('.sp-view-3d[data-ready=true] canvas').waitFor({timeout:120000});assert(requested.length>0);assert(requested.some(u=>Object.keys(report.beforeAssets).some(name=>u.endsWith('/'+name))));report.oldTabModule=requested.at(-1);await page.screenshot({path:path.join(output,'old-tab-after-build.png')});check('a tab opened before rebuilding can first load and render its original 3D module after deployment');
  await page.getByRole('button',{name:'2D 평면도',exact:true}).click();await page.locator('.sp-plan-image svg').waitFor();await page.waitForTimeout(1200);await context.close();
  const recovery=await makeContext();page=await recovery.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
  const missing='**/assets/render-three-*.js';await recovery.route(missing,r=>r.fulfill({status:404,contentType:'application/json',body:'{"detail":"Not Found"}'}));
  await page.goto(url);await page.locator('.sp-plan-image svg').waitFor({timeout:120000});await page.getByRole('button',{name:'3D 조감도',exact:true}).click();
  const alert=page.locator('.feedback-popup.error[role=alert]');await alert.waitFor();assert.match(await alert.innerText(),/3D 표시 파일을 불러오지 못했어요/);assert(!/Failed to fetch dynamically/.test(await alert.innerText()));await page.screenshot({path:path.join(output,'missing-module-recovery.png')});
  await page.getByLabel('배포 검증 회의실 QM55C 수량',{exact:true}).fill('3');await page.waitForTimeout(1200);
  await page.setViewportSize({width:390,height:844});await alert.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'mobile-recovery.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await recovery.unroute(missing);await alert.getByRole('button',{name:'최신 화면으로 새로고침',exact:true}).click();await page.locator('.sp-view-3d[data-ready=true] canvas').waitFor({timeout:120000});assert.equal(page.url(),url);assert.equal(await page.getByLabel('배포 검증 회의실 QM55C 수량',{exact:true}).inputValue(),'3');assert.equal(await page.locator('.sp-space-card').count(),1);await page.screenshot({path:path.join(output,'recovered-3d.png')});check('a missing module offers Korean recovery; refresh restores actual 3D with the same document, room, products and changed quantity on mobile');
  assert.deepEqual(report.errors,[]);report.ok=true;
}catch(error){report.ok=false;report.error=String(error.stack||error);await page?.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{report.finishedAt=new Date().toISOString();report.codeHashes=Object.fromEntries(['app/web/vite.config.js','app/web/src/components/spatial-view.jsx','app/web/src/services/spatial-renderer.js'].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM');}
