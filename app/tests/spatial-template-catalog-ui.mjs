import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {spatialTemplateCatalog} from '../web/src/domain/spatial/template-catalog.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'winmate-template-catalog-'));
const output=path.join(root,'app/tests/output/spatial-template-catalog');fs.mkdirSync(output,{recursive:true});
const apiPort=process.env.SPATIAL_CATALOG_API_PORT||'15404',webPort=process.env.SPATIAL_CATALOG_WEB_PORT||'15405',base='http://127.0.0.1:'+webPort;
process.env.WINMATE_API_PORT=apiPort;process.env.WINMATE_WEB_PORT=webPort;
const api=spawn(path.join(root,'app/.venv/bin/python'),['-B','app/tests/fixtures/spatial/server.py'],{cwd:root,env:{...process.env,WINMATE_AUTH_DIR:path.join(temporary,'auth'),WINMATE_SPATIAL_DB:path.join(temporary,'spatial.sqlite'),WINMATE_STORYBOARD_DIR:path.join(temporary,'storyboards')}});
let apiLog='';api.stdout.on('data',value=>apiLog+=value);api.stderr.on('data',value=>apiLog+=value);
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),cacheDir:path.join(temporary,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:Number(webPort),strictPort:true,hmr:false}});
let browser,page;const errors=[],checks=[],pass=message=>{checks.push(message);console.log('PASS '+message);};
try{
  let ready=false;for(let attempt=0;attempt<120;attempt++){
    if(api.exitCode!=null)throw new Error(apiLog);
    try{await fetch('http://127.0.0.1:'+apiPort+'/api/health');ready=true;break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }assert(ready,'isolated API ready');
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1560,height:1080}});
  assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).status(),200);
  const library=await (await context.request.get(base+'/api/spatial/library')).json(),templates=spatialTemplateCatalog(library);
  await context.addInitScript(()=>{localStorage.setItem('winmate.v2.proposals','[]');localStorage.setItem('winmate.v2.seedv','admin-samples-1');localStorage.setItem('winmate.v2.review-example-proposals.seedv','skip-template-catalog');});
  await context.route(url=>['/api/llm','/api/jobs'].includes(url.pathname),route=>route.request().method()==='POST'?route.fulfill({status:503,json:{detail:'isolated template-catalog test'}}):route.continue());
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/spatial');const entry=page.getByRole('button',{name:'업종별 템플릿 활용하기',exact:true});await entry.waitFor({timeout:120000});await entry.click();
  const modal=page.getByRole('dialog',{name:'업종 템플릿',exact:true}),cards=modal.locator('.sp-template-card'),body=modal.locator('.mbody');
  assert.equal(await cards.count(),18);assert.equal(await modal.getByRole('button',{name:'템플릿 더 보기',exact:true}).count(),0);
  const firstIndustries=await cards.evaluateAll(elements=>elements.slice(0,16).map(element=>element.dataset.industry));assert.deepEqual(firstIndustries,library.industries.map(industry=>industry.code));
  assert.equal(await cards.locator('.sp-template-products').count(),18);
  await page.screenshot({path:path.join(output,'all-industries.png')});pass('first page includes every industry and actual product summaries without a load-more button');
  let count=await cards.count();
  while(count<templates.length){
    await body.evaluate(element=>element.scrollTop=element.scrollHeight);
    await page.waitForFunction(previous=>document.querySelectorAll('.sp-maps-modal .sp-template-card').length>previous,count);
    count=await cards.count();
  }
  assert.equal(count,templates.length);const ids=await cards.evaluateAll(elements=>elements.map(element=>element.dataset.templateId));assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids,templates.map(template=>template.id));
  await modal.getByRole('status').filter({hasText:`전체 ${templates.length}개`}).waitFor();pass('scrolling the modal automatically appends every distinct template exactly once and stops at the end');
  const industry=modal.getByLabel('템플릿 업종',{exact:true}),variant=modal.getByLabel('공간 크기',{exact:true}),scope=modal.getByLabel('템플릿 범위',{exact:true}),search=modal.getByLabel('업종 템플릿 검색',{exact:true});
  await industry.selectOption('FB');assert.equal(await cards.count(),Math.min(18,spatialTemplateCatalog(library,{industry:'FB',scope:'full'}).length));assert.equal(await body.evaluate(element=>element.scrollTop),0);
  await body.evaluate(element=>element.scrollTop=element.scrollHeight);await page.waitForFunction(total=>document.querySelectorAll('.sp-maps-modal .sp-template-card').length===total,spatialTemplateCatalog(library,{industry:'FB',scope:'full'}).length);
  await variant.selectOption('compact');assert.equal(await cards.count(),spatialTemplateCatalog(library,{industry:'FB',scope:'full',variant:'compact'}).length);assert((await cards.evaluateAll(elements=>elements.map(element=>element.dataset.templateId))).every(id=>id.endsWith('-compact')));
  await scope.selectOption('full');assert.equal(await cards.count(),1);assert.equal(await cards.first().getAttribute('data-template-id'),'fb-full-compact');
  await search.fill('no-such-template-xyz');assert.equal(await cards.count(),0);await modal.getByText('조건에 맞는 템플릿이 없어요.',{exact:true}).waitFor();assert.equal(await modal.locator('.sp-template-pagination').count(),0);
  await search.fill('');await industry.selectOption('all');await scope.selectOption('all');await variant.selectOption('all');assert.equal(await cards.count(),18);assert.equal(await body.evaluate(element=>element.scrollTop),0);
  pass('industry, size, scope and search reset pagination; empty and final pages stay stable');
  const defaults=modal.getByRole('group',{name:'기본 썸네일',exact:true});await defaults.getByRole('button',{name:'3D',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.sp-maps-modal .sp-template-card img')?.src.startsWith('data:image/png'),null,{timeout:120000});
  await defaults.getByRole('button',{name:'2D',exact:true}).click();await cards.first().getByRole('button',{name:'2D 보기',exact:true}).waitFor();
  const expectedId=await cards.first().getAttribute('data-template-id');await cards.first().getByRole('button',{name:'활용하기',exact:true}).click();
  const confirmation=page.getByRole('dialog',{name:'스튜디오로 이동할까요?',exact:true});await confirmation.getByRole('button',{name:'스튜디오로 이동',exact:true}).click();await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  const saved=await (await context.request.get(base+'/api/spatial/history/'+page.url().split('/').at(-1))).json(),expected=createScene({templateId:expectedId},library);
  assert.equal(saved.scene.templateId,expectedId);assert.deepEqual(saved.scene.rooms,expected.rooms);assert.deepEqual(saved.scene.objects,expected.objects);pass('2D and actual 3D previews work and using a template saves its exact products and placements');
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/spatial');await entry.waitFor();await entry.click();assert.equal(await cards.count(),18);
  await body.evaluate(element=>element.scrollTop=element.scrollHeight);await page.waitForFunction(total=>document.querySelectorAll('.sp-maps-modal .sp-template-card').length>=Math.min(36,total),templates.length);
  assert(await body.evaluate(element=>element.scrollWidth<=element.clientWidth+1));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(output,'mobile-pagination.png')});pass('mobile modal scroll loads another page without horizontal overflow');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:true,checks,errors,total:templates.length},null,2));
}catch(error){await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:false,checks,errors,error:String(error.stack||error)},null,2));throw error;}
finally{await browser?.close();await server.close();api.kill('SIGTERM');await new Promise(resolve=>api.exitCode!=null?resolve():api.once('close',resolve));fs.rmSync(temporary,{recursive:true,force:true});}
