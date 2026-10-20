import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.join(root,'app/tests/output/spatial-furniture');fs.mkdirSync(output,{recursive:true});
process.env.WINMATE_API_PORT='8797';process.env.WINMATE_WEB_PORT='5197';
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'warn',server:{host:'127.0.0.1',port:5197,strictPort:true,hmr:false}});
let browser;const errors=[];
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1560,height:1080}});
  const login=await context.request.post('http://127.0.0.1:5197/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}});assert.equal(login.status(),200);
  const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5197/spatial');await page.locator('.sp-home-maps').waitFor({timeout:120000});
  const toggle=page.getByRole('button',{name:'제품 · 가구 오브젝트',exact:true});await toggle.click();const popup=page.locator('.sp-objects-popup');
  await page.getByLabel('오브젝트 제품군').selectOption('furniture');const catalogue=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));assert.match(await popup.locator('.sp-filterbar').innerText(),new RegExp(catalogue.counts.furniture+'개'));
  const category=page.getByLabel('공용 가구 종류');assert.equal(await category.locator('option').count(),catalogue.counts.furnitureCategories.length+1);await category.selectOption('의자 · 좌석');assert.match(await popup.locator('.sp-filterbar').innerText(),/35개/);
  const query=page.getByLabel('오브젝트 검색');await query.fill('카페 의자');const bentwood=popup.getByRole('button',{name:'카페 곡목 체어',exact:true});await bentwood.waitFor();await bentwood.locator('img').evaluate(img=>img.decode());assert.match(await bentwood.getAttribute('title'),/등받이|등판/);
  await query.fill('병원 의자');assert(await popup.locator('.sp-object-card').count()>=3);await page.screenshot({path:output+'/medical-seats.png'});
  await query.fill('');await page.screenshot({path:output+'/seat-types.png'});await category.selectOption('all');
  for(const term of ['펜던트 조명','플로어 램프','디스플레이 이동식 스탠드']){await query.fill(term);assert.equal(await popup.locator('.sp-object-card').count(),0,term+' overlaps Samsung');}
  await query.fill('도서관 열람대');await popup.getByRole('button',{name:'도서관 개인 열람대',exact:true}).waitFor();await toggle.click();console.log('PASS 146 public furnishings, seven categories, contextual search, thumbnails and Samsung-overlap exclusion');
  await page.locator('.sp-studio-launch').click();await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-blank-canvas').waitFor();const id=page.url().split('/').pop();
  await page.getByLabel('업종',{exact:true}).selectOption('OF');await page.getByRole('button',{name:'공간 추가',exact:true}).click();await page.getByLabel('공간 1 이름',{exact:true}).fill('미팅룸');
  const generated=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/spatial/history/'+id)&&r.status()===200);
  await page.getByRole('button',{name:'조감도 만들기',exact:true}).click();await generated;await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  let document=await(await context.request.get('http://127.0.0.1:5197/api/spatial/history/'+id)).json();assert(document.scene.objects.some(o=>o.assetId==='furniture:meeting-sled'));
  await toggle.click();await query.fill('카페 곡목');await popup.getByRole('button',{name:'카페 곡목 체어',exact:true}).click();await popup.getByRole('button',{name:'가구 배치',exact:true}).click();await popup.waitFor({state:'hidden'});assert.equal(await page.getByRole('alert').count(),0);
  const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/spatial/history/'+id)&&r.status()===200);await page.getByRole('button',{name:'저장',exact:true}).click();await saved;
  document=await(await context.request.get('http://127.0.0.1:5197/api/spatial/history/'+id)).json();assert(document.scene.objects.some(o=>o.assetId==='furniture:cafe-bentwood'));
  console.log('PASS contextual meeting seating and explicit new furniture placement save through the real API');
  await page.setViewportSize({width:390,height:844});await toggle.click();await query.fill('');await category.selectOption('의자 · 좌석');const box=await popup.boundingBox();assert(box.height<=423);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:output+'/mobile-furniture.png'});
  assert.deepEqual(errors,[]);fs.writeFileSync(output+'/report.json',JSON.stringify({ok:true,errors},null,2));console.log('PASS mobile furniture filters and compact popup; no runtime errors');
}catch(error){fs.writeFileSync(output+'/report.json',JSON.stringify({ok:false,errors,error:String(error)},null,2));throw error;}
finally{await browser?.close();await server.close();}
