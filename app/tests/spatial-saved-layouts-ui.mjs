import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'winmate-saved-layouts-'));
const output=path.join(root,'app/tests/output/spatial-saved-layouts');fs.mkdirSync(output,{recursive:true});
const apiPort=process.env.SPATIAL_SAVED_API_PORT||'15424',webPort=process.env.SPATIAL_SAVED_WEB_PORT||'15425',base='http://127.0.0.1:'+webPort;
process.env.WINMATE_API_PORT=apiPort;process.env.WINMATE_WEB_PORT=webPort;
const api=spawn(path.join(root,'app/.venv/bin/python'),['-B','app/tests/fixtures/spatial/server.py'],{cwd:root,env:{...process.env,WINMATE_AUTH_DIR:path.join(temporary,'auth'),WINMATE_SPATIAL_DB:path.join(temporary,'spatial.sqlite'),WINMATE_STORYBOARD_DIR:path.join(temporary,'storyboards')}});
let apiLog='';api.stdout.on('data',value=>apiLog+=value);api.stderr.on('data',value=>apiLog+=value);
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),cacheDir:path.join(temporary,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:Number(webPort),strictPort:true,hmr:false}});
let browser,page;const checks=[],errors=[],requests=[],pass=message=>{checks.push(message);console.log('PASS '+message);};
try{
  let ready=false;for(let attempt=0;attempt<120;attempt++){
    if(api.exitCode!=null)throw new Error(apiLog);
    try{await fetch('http://127.0.0.1:'+apiPort+'/api/health');ready=true;break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }assert(ready,'isolated API ready');
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1560,height:1080}});
  assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).status(),200);
  const library=await(await context.request.get(base+'/api/spatial/library')).json(),archived={...library,sourceHash:'deadbeef'};let archivedRequests=0;
  await context.route('**/api/spatial/library/deadbeef',route=>{archivedRequests++;return route.fulfill({json:archived});});
  await context.route('**/api/spatial/history/deleted-layout-*',route=>{requests.push(route.request().method()+' '+route.request().url());return route.fulfill({status:404,json:{detail:'원본 조감도 삭제됨'}});});
  await context.route(url=>['/api/llm','/api/jobs'].includes(url.pathname),route=>route.request().method()==='POST'?route.fulfill({status:503,json:{detail:'isolated saved-layout test'}}):route.continue());
  await context.addInitScript(()=>{localStorage.setItem('winmate.v2.proposals','[]');localStorage.setItem('winmate.v2.seedv','admin-samples-1');localStorage.setItem('winmate.v2.review-example-proposals.seedv','skip-saved-layouts');});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/spatial');
  const home=page.getByRole('region',{name:'Layout 히스토리',exact:true}),homeCards=home.locator('.sp-saved-layout-card');await home.waitFor({timeout:120000});
  assert.equal(await homeCards.count(),0);assert(await home.getByRole('button',{name:'전체 보기',exact:true}).isDisabled());assert(await page.evaluate(()=>!!(document.querySelector('.sp-saved-layouts').compareDocumentPosition(document.querySelector('.sp-history'))&Node.DOCUMENT_POSITION_FOLLOWING)));pass('extracted-layout section sits above history and explains the empty state');
  const seeded=await page.evaluate(async library=>{
    const {createScene,planAnchors}=await import('/src/domain/spatial/scene.js'),{planSvg,svgData}=await import('/src/domain/spatial/plan-svg.js'),{createSpatialLayout,createLayoutNode}=await import('/src/domain/spatial/layout.js'),{saveSpatialMyLayout}=await import('/src/services/spatial-my-layout.js'),repo=await import('/src/repositories/templates.js');
    const rows=[];
    for(let index=1;index<=5;index++){
      const scene=createScene({templateId:'cowork-cowork-meet-standard',title:'저장 레이아웃 '+index},index===1?{...library,sourceHash:'deadbeef'}:library);
      const layout=createSpatialLayout(scene,library,{image:svgData(planSvg(scene,library,{labels:false,productPins:false,dimensions:false})),anchors:{width:1280,height:820,...planAnchors(scene)}},'2d');
      layout.nodes=[{...createLayoutNode(layout,'callout'),text:'저장된 설명 '+index,targets:['room:'+scene.rooms[0].id]}];
      rows.push(await saveSpatialMyLayout(layout,{historyId:'deleted-layout-'+index}));
    }
    const f=repo.newF();await repo.saveTemplates([{meta:repo.myMeta({f,name:'일반 My 템플릿',kind:'edit'}),html:'<div style="width:1280px;height:720px">일반 레이아웃</div>'}]);
    return rows;
  },library);
  await page.waitForFunction(()=>document.querySelectorAll('.sp-saved-layouts .sp-saved-layout-card').length===4);assert.deepEqual(await homeCards.evaluateAll(elements=>elements.map(element=>element.dataset.layoutId)),seeded.slice(1).reverse().map(item=>item.f));
  await homeCards.first().locator('img').first().evaluate(image=>image.decode());assert.match(await homeCards.first().innerText(),/저장 레이아웃 5/);await home.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'home-four.png')});pass('home shows only the four newest extracted layouts with their actual slide thumbnails');
  await home.getByRole('button',{name:'전체 보기',exact:true}).click();const all=page.getByRole('dialog',{name:'Layout 히스토리 전체 보기',exact:true}),allCards=all.locator('.sp-saved-layout-card');await all.waitFor();assert.equal(await allCards.count(),5);
  const search=all.getByLabel('조감도 레이아웃 검색');await search.fill('레이아웃 1');assert.equal(await allCards.count(),1);await search.fill('없는 레이아웃 xyz');assert.equal(await allCards.count(),0);await all.getByRole('status').waitFor();await search.fill('');assert.equal(await allCards.count(),5);pass('full list includes older saved layouts, supports search and excludes unrelated My templates');
  const oldest=seeded[0];await all.locator('[data-layout-id="'+oldest.f+'"]').getByRole('button').click();const editor=page.getByRole('dialog',{name:'레이아웃 추출',exact:true}),canvas=editor.locator('.sp-layout-canvas>svg');await editor.locator('.sp-layout-camera[data-ready=true]').waitFor({timeout:120000});assert.equal(archivedRequests,1);assert.equal(page.url(),base+'/spatial');
  await canvas.locator('[data-layout-node-type="callout"]').first().press('Enter');await editor.getByLabel('설명 내용').fill('홈에서 다시 수정한 설명');await editor.getByRole('button',{name:'저장하기',exact:true}).click();await page.locator('.feedback-popup').filter({hasText:'Layout 히스토리에 저장됐어요.'}).waitFor();
  const edited=await page.evaluate(async f=>(await import('/src/repositories/templates.js')).myList().find(item=>item.f===f),oldest.f);assert.equal(edited.my.spatialHistoryId,'deleted-layout-1');assert.equal(edited.my.spatialLayout.sourceScene.assetRevision,'deadbeef');assert.equal(edited.my.spatialLayout.nodes[0].text,'홈에서 다시 수정한 설명');assert.equal(await allCards.count(),5);assert.equal(await homeCards.first().getAttribute('data-layout-id'),oldest.f);assert.deepEqual(requests,[]);
  await editor.locator('.mfoot').getByRole('button',{name:'닫기',exact:true}).click();await editor.waitFor({state:'hidden'});assert(await all.isVisible());await page.keyboard.press('Escape');await all.waitFor({state:'hidden'});pass('older layout reopens with its frozen assets, saves in place and returns to the full list even after its source history is deleted');
  await page.reload();await homeCards.first().waitFor({timeout:120000});assert.equal(await homeCards.first().getAttribute('data-layout-id'),oldest.f);await homeCards.first().getByRole('button').click();await editor.locator('.sp-layout-camera[data-ready=true]').waitFor({timeout:120000});await canvas.locator('[data-layout-node-type="callout"]').first().press('Enter');assert.equal(await editor.getByLabel('설명 내용').inputValue(),'홈에서 다시 수정한 설명');
  await editor.getByLabel('설명 내용').fill('저장하지 않을 변경');await editor.locator('.mfoot').getByRole('button',{name:'닫기',exact:true}).click();const discard=page.getByRole('dialog',{name:'저장하지 않고 닫을까요?',exact:true});await discard.waitFor();await discard.getByRole('button',{name:'계속 편집',exact:true}).click();await discard.waitFor({state:'hidden'});assert.equal(await editor.getByLabel('설명 내용').inputValue(),'저장하지 않을 변경');await editor.locator('.mhead').getByRole('button',{name:'닫기',exact:true}).click();await discard.getByRole('button',{name:'저장하지 않고 닫기',exact:true}).click();await editor.waitFor({state:'hidden'});
  const persisted=await page.evaluate(async f=>(await import('/src/repositories/templates.js')).myList().find(item=>item.f===f).my.spatialLayout.nodes[0].text,oldest.f);assert.equal(persisted,'홈에서 다시 수정한 설명');pass('reloading preserves edits and home editing retains the existing unsaved-change confirmation');
  const template=await(await context.request.get(base+'/api/spatial/templates/cowork-cowork-meet-standard')).json();const create=await context.request.post(base+'/api/spatial/history',{data:{scene:{...template.scene,title:'새로 추출한 레이아웃'},view:'2d'}});assert.equal(create.status(),201);const document=await create.json();await page.goto(base+'/spatial/'+document.id);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});await page.getByRole('button',{name:'레이아웃 추출',exact:true}).click();await editor.locator('.sp-layout-camera[data-ready=true]').waitFor({timeout:120000});await editor.getByRole('button',{name:'저장하기',exact:true}).click();await page.locator('.feedback-popup').filter({hasText:'Layout 히스토리에 저장됐어요.'}).waitFor();await editor.locator('.mfoot').getByRole('button',{name:'닫기',exact:true}).click();await editor.waitFor({state:'hidden'});await page.getByRole('button',{name:'뒤로 가기',exact:true}).click();await page.waitForURL(base+'/spatial');await homeCards.first().waitFor();assert.equal(await homeCards.count(),4);assert.match(await homeCards.first().innerText(),/새로 추출한 레이아웃/);const newest=await page.evaluate(async()=>(await import('/src/repositories/templates.js')).myList().find(item=>item.my.kind==='spatial'));assert.equal(newest.my.spatialHistoryId,document.id);pass('saving a freshly extracted studio layout immediately adds it to the home section with the correct history reference');
  await page.setViewportSize({width:390,height:844});await home.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'mobile-home.png')});await home.getByRole('button',{name:'전체 보기',exact:true}).click();await all.waitFor();assert.equal(await allCards.count(),6);assert(await all.locator('.mbody').evaluate(element=>element.scrollWidth<=element.clientWidth+1));await search.fill('레이아웃 1');await allCards.first().getByRole('button').click();await editor.locator('.sp-layout-camera[data-ready=true]').waitFor({timeout:120000});assert(await editor.locator('.mbody').evaluate(element=>element.scrollWidth<=element.clientWidth+1));await page.screenshot({path:path.join(output,'mobile-editor.png')});pass('mobile home, full list and editing fit the viewport');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:true,checks,errors,sourceHistoryRequests:requests},null,2));
}catch(error){await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:false,checks,errors,sourceHistoryRequests:requests,error:String(error.stack||error)},null,2));throw error;}
finally{await browser?.close();await server.close();api.kill('SIGTERM');await new Promise(resolve=>api.exitCode!=null?resolve():api.once('close',resolve));fs.rmSync(temporary,{recursive:true,force:true});}
