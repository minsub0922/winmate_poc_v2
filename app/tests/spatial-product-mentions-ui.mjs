import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'app/tests/output/spatial-product-mentions');fs.mkdirSync(output,{recursive:true});
process.env.WINMATE_API_PORT='8979';process.env.WINMATE_WEB_PORT='5279';
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),cacheDir:path.join(root,'.wm_tmp/vite-spatial-product-mentions'),logLevel:'error',server:{host:'127.0.0.1',port:5279,strictPort:true,hmr:false}});
let browser,page;const errors=[],checks=[],pass=s=>{checks.push(s);console.log('PASS '+s);};
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1540,height:1080}});
  assert((await context.request.post('http://127.0.0.1:5279/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).ok());
  const file=path.join(root,'app/web/public/assets/description-standards/layouts.json.gz');
  if(fs.existsSync(file)){const bytes=fs.readFileSync(file);JSON.parse(gunzipSync(bytes));await context.route('**/assets/description-standards/layouts.json.gz',r=>r.fulfill({status:200,contentType:'application/gzip',body:bytes}));}
  await context.route(u=>['/api/llm','/api/jobs'].includes(u.pathname),r=>r.request().method()==='POST'?r.fulfill({status:503,json:{detail:'isolated product mention test'}}):r.continue());
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5279/spatial');await page.locator('.sp-studio-launch').waitFor({timeout:120000});await page.locator('.sp-studio-launch').click();await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-blank-canvas').waitFor();
  const id=new URL(page.url()).pathname.split('/').at(-1),document=async()=>(await context.request.get('http://127.0.0.1:5279/api/spatial/history/'+id)).json();
  await page.getByLabel('업종',{exact:true}).selectOption('OF');await page.getByRole('button',{name:'공간 추가',exact:true}).click();await page.getByLabel('공간 1 이름',{exact:true}).fill('제품 회의실');
  let input=page.getByRole('combobox',{name:'제품 회의실 제품 @ 추가',exact:true});
  await input.fill('@QM55C');await page.getByRole('listbox',{name:'공간 제품 @ 검색',exact:true}).getByRole('option').first().waitFor();
  assert.match(await page.getByRole('listbox',{name:'공간 제품 @ 검색',exact:true}).getByRole('option').first().innerText(),/QM55C/);await page.screenshot({path:output+'/mention-search.png'});await input.press('Enter');
  const selected=page.locator('.sp-selected-product[data-spatial-product-preview="qm55c"]');await selected.waitFor();await page.getByLabel('제품 회의실 QM55C 수량',{exact:true}).fill('2');
  await input.fill('@QM55C');await input.press('Enter');assert.equal(await selected.count(),1);assert.equal(await page.getByLabel('제품 회의실 QM55C 수량',{exact:true}).inputValue(),'2');pass('@ exact model search and Enter add to the room; selecting again preserves quantity');
  await input.fill('@missing-product-999');await page.getByText('일치하는 제품이 없어요. 제품명·모델명으로 검색해 주세요.').waitFor();await input.press('Escape');assert.equal(await page.locator('.sp-product-mention-menu').count(),0);await input.fill('');
  await selected.hover();const preview=page.locator('.dpk .sp-product-comparison[data-spatial-product-id="qm55c"]');await preview.waitFor();
  await preview.locator('img').first().waitFor();await page.waitForFunction(()=>{const imgs=[...document.querySelectorAll('.dpk .sp-product-comparison img')];return imgs.length===2&&imgs.every(i=>i.complete&&i.naturalWidth>10);});
  const images=await preview.locator('img').evaluateAll(imgs=>imgs.map(i=>i.currentSrc));assert.notEqual(images[0],images[1]);
  await page.screenshot({path:output+'/selected-product-hover.png'});await preview.hover();await preview.locator('.sp-comparison-source').scrollIntoViewIfNeeded();assert(await preview.isVisible());
  await preview.getByRole('button',{name:'크게 보기',exact:true}).click();const detail=page.locator('.reference-detail-body');await detail.locator('.sp-product-comparison[data-spatial-product-id="qm55c"]').waitFor();assert.equal(await detail.locator('.sp-comparison-images img').count(),2);await page.screenshot({path:output+'/shared-product-detail.png'});await page.keyboard.press('Escape');await detail.waitFor({state:'hidden'});pass('hover compares loaded object/original images; larger shared product details retain the same model and comparison');
  await page.getByRole('button',{name:'공간 추가',exact:true}).click();await page.getByLabel('공간 2 이름',{exact:true}).fill('제품 라운지');const second=page.getByRole('combobox',{name:'제품 라운지 제품 @ 추가',exact:true});await second.fill('@WM75B');await page.getByRole('listbox',{name:'공간 제품 @ 검색',exact:true}).getByRole('option').first().click();await page.locator('.sp-selected-product[data-spatial-product-preview="flip"]').waitFor();
  await page.waitForTimeout(1100);const saved=await document();assert.deepEqual(saved.form.rooms.map(r=>r.products),[[{productId:'qm55c',quantity:2}],[{productId:'flip',quantity:1}]]);
  await page.reload();await page.locator('.sp-selected-product[data-spatial-product-preview="flip"]').waitFor();assert.equal(await page.getByLabel('제품 회의실 QM55C 수량',{exact:true}).inputValue(),'2');pass('mouse selection stays in its own room and saved product IDs/quantities survive reload');
  await page.locator('.sp-space-card').first().getByRole('button',{name:'제품 선택',exact:true}).click();const picker=page.locator('#sp-room-product-picker');await picker.getByLabel('공간 제품 검색').fill('QM55C');await picker.locator('.sp-room-product-options>button').first().hover();await preview.waitFor();await preview.hover();await preview.getByRole('button',{name:'크게 보기',exact:true}).click();await detail.locator('.sp-product-comparison').waitFor();assert(await picker.isVisible());await page.keyboard.press('Escape');await detail.waitFor({state:'hidden'});await picker.getByRole('button',{name:'선택 완료',exact:true}).click();pass('existing room product picker keeps selection context while showing the same comparison');
  await page.getByRole('button',{name:'제품 · 가구 오브젝트',exact:true}).click();const catalog=page.locator('#sp-library-popup');await catalog.getByLabel('오브젝트 검색',{exact:true}).fill('QM55C');await catalog.locator('.sp-object-card').first().hover();await preview.waitFor();await catalog.locator('.sp-object-card').first().click();await catalog.locator('.sp-placement-product').hover();await preview.waitFor();await catalog.getByRole('button',{name:'상세 보기',exact:true}).click();await detail.locator('.sp-product-comparison[data-spatial-product-id="qm55c"]').waitFor();await page.keyboard.press('Escape');await detail.waitFor({state:'hidden'});await catalog.getByRole('button',{name:'오브젝트 닫기',exact:true}).click();pass('catalogue hover, selected model and shared detail keep the same object/photo identity');
  await page.getByRole('button',{name:'조감도 만들기',exact:true}).click();await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  const prompt=page.getByRole('combobox',{name:'조감도 편집 프롬프트',exact:true});await prompt.fill('@QM55C');await page.locator('#sp-mention-options [role=option]').first().waitFor();await prompt.press('Enter');
  const chip=page.locator('.sp-mention-editor .sp-mention-chip[data-spatial-product-preview="qm55c"]');await chip.waitFor();await chip.hover();await preview.waitFor();await page.screenshot({path:output+'/prompt-product-hover.png'});await page.keyboard.press('Escape');pass('selected @ references in the edit prompt also expose the object/original comparison');
  await page.setViewportSize({width:390,height:844});input=page.getByRole('combobox',{name:'제품 회의실 제품 @ 추가',exact:true});await input.scrollIntoViewIfNeeded();await input.fill('@QM55C');await page.locator('.sp-product-mention-menu').waitFor();
  const bounds=await page.locator('.sp-product-mention-menu').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=391&&bounds.y>=0&&bounds.y+bounds.height<=845);await page.screenshot({path:output+'/mobile-product-search.png'});await input.press('Escape');
  await input.fill('@');await input.press('ArrowDown');await page.locator('.sp-product-mention-menu').waitFor();await input.press('Escape');await page.locator('.sp-product-mention-menu').waitFor({state:'hidden'});pass('keyboard navigation and Escape close search even when an option preview is open');
  await page.locator('.sp-space-card').first().getByRole('button',{name:/QM55C 상세 보기$/}).click();await page.locator('.reference-detail-body .sp-product-comparison').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));pass('mobile search stays in the viewport and tapping a product opens shared comparison details');
  assert.deepEqual(errors,[]);fs.writeFileSync(output+'/report.json',JSON.stringify({ok:true,checks,errors},null,2));
}catch(error){await page?.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});fs.writeFileSync(output+'/report.json',JSON.stringify({ok:false,checks,errors,error:String(error)},null,2));throw error;}
finally{await browser?.close();await server.close();}
