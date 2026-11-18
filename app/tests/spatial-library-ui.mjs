import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {openIndustryTemplates,templatePreviewReady,confirmTemplate} from './fixtures/birdseye/entry.mjs';
import {industryTemplates} from '../web/src/domain/birdseye/start.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'),'utf8'));
const output=path.join(root,'app/tests/output/spatial');fs.mkdirSync(output,{recursive:true});
process.env.WINMATE_API_PORT=process.env.SPATIAL_TEST_API_PORT||'8793';process.env.WINMATE_WEB_PORT='5193';
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'warn',server:{host:'127.0.0.1',port:5193,strictPort:true,hmr:false}});
let browser;const errors=[];
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1560,height:1080}});
  const login=await context.request.post('http://127.0.0.1:5193/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}});assert.equal(login.status(),200);
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5193/spatial');const home=page.locator('.sp-home-launches');await home.waitFor({timeout:120000});
  // 업종 템플릿은 목록의 버튼이 아니라 시작 팝업 안에 있다 — 업종을 고르면 켜지고, 그 업종의 조감도 템플릿을 드롭다운으로 보여 준다
  assert.equal(await page.locator('.sp-home-maps').count(),0);assert.equal(await page.getByRole('button',{name:'업종별 템플릿 활용하기',exact:true}).count(),0);
  await page.screenshot({path:output+'/library-before-history.png'});console.log('PASS the list has no template section or template button; templates open from the start dialog');
  await page.getByRole('button',{name:/조감도 스튜디오 시작/}).click();
  const dialog=page.getByRole('dialog',{name:'조감도 스튜디오 시작',exact:true}),trigger=dialog.getByRole('button',{name:/업종 템플릿에서 시작/}),menu=page.locator('.be-template-menu');
  assert(await trigger.isDisabled(),'the template button waits for an industry');
  await dialog.locator('[data-industry="OF"]').click();assert(!(await trigger.isDisabled()));assert.equal(await menu.count(),0);
  await trigger.click();await menu.waitFor();assert.equal(await trigger.getAttribute('aria-expanded'),'true');
  const expected=industryTemplates(library,'OF'),items=menu.locator('.be-template-item');
  assert.deepEqual(await items.evaluateAll(nodes=>nodes.map(n=>n.dataset.templateId)),expected.map(t=>t.id),'only the chosen industry’s standard overview maps, its own overview first');
  assert.deepEqual(await items.locator('strong').allTextContents(),expected.map(t=>t.name));
  // 드롭다운은 버튼 바로 위로 열리고, 항목마다 알아볼 수 있는 크기의 3D 조감도 그림이 있다
  const menuBox=await menu.boundingBox(),triggerBox=await trigger.boundingBox();assert(menuBox.y+menuBox.height<=triggerBox.y+1&&triggerBox.y-(menuBox.y+menuBox.height)<16,'the dropdown opens right above its button');
  await templatePreviewReady(page,expected[0].id);const thumb=await items.first().locator('.be-template-thumb').boundingBox();assert(thumb.width>=300&&thumb.height>=190,'the birdseye picture is large enough to read: '+JSON.stringify(thumb));
  assert.match(await items.first().innerText(),/공간 6개/);
  await page.screenshot({path:output+'/library-default-3d.png'});console.log('PASS choosing an industry enables the template dropdown, which lists that industry’s birdseye templates with large 3D pictures');
  // 고르면 확인을 묻는다 — 취소하면 목록으로 돌아오고, Esc는 확인 창 → 드롭다운 순서로 닫는다
  const confirm=page.getByRole('dialog',{name:'이 템플릿으로 시작하시겠습니까?',exact:true});
  await items.nth(1).click();await confirm.waitFor();assert.match(await confirm.innerText(),new RegExp(expected[1].name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await page.screenshot({path:output+'/library-template-confirm.png'});
  await confirm.getByRole('button',{name:'취소',exact:true}).click();await confirm.waitFor({state:'hidden'});assert.equal(await menu.count(),1);
  await items.nth(1).click();await confirm.waitFor();await page.keyboard.press('Escape');await confirm.waitFor({state:'hidden'});assert.equal(await menu.count(),1);
  await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});assert.equal(await dialog.count(),1,'the start dialog stays');
  await trigger.click();await menu.waitFor();await confirmTemplate(page,expected[1].id);
  const id=decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)),record=await(await context.request.get('http://127.0.0.1:5193/api/spatial/history/'+id)).json();
  assert.equal(record.scene.templateId,expected[1].id);assert.equal(record.view,'3d');assert.deepEqual(record.scene.rooms.map(r=>r.name),expected[1].rooms.map(r=>r.name));
  console.log('PASS picking a template asks “이 템플릿으로 시작하시겠습니까?” and then opens the studio with that template');
  await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:5193/spatial');await home.waitFor({timeout:120000});
  await openIndustryTemplates(page,'OF');const mobile=await menu.boundingBox();assert(mobile.x>=0&&mobile.x+mobile.width<=391);
  await templatePreviewReady(page,expected[0].id);assert((await items.first().locator('.be-template-thumb').boundingBox()).width>=300);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:output+'/library-default-mobile.png'});assert.deepEqual(errors,[]);
  console.log('PASS the dropdown fits a phone with the same large pictures; no page errors');
  fs.writeFileSync(output+'/library-default-report.json',JSON.stringify({ok:true,errors},null,2));
}catch(error){fs.writeFileSync(output+'/library-default-report.json',JSON.stringify({ok:false,errors,error:String(error)},null,2));throw error;}
finally{await browser?.close();await server.close();}
