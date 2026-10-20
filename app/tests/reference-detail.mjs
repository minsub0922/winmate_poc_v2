// Cross-page reference-detail contract using real catalog/components; no model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const boot={catalog:read('catalog'),products:read('products_db'),images:read('images'),capabilities:null,user:{username:'reference-detail-test',auth_enabled:false}};
const out=path.join(root,'app/tests/output/reference-detail');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
const checks=[],errors=[];let browser,page,modelCalls=0;
const pass=text=>{checks.push(text);console.log('PASS '+text);};
try{
 await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000}});
 await context.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>route.abort());
 await context.route(url=>url.pathname.startsWith('/api/'),route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:boot});
  if(url.pathname==='/api/llm')modelCalls++;
  if(url.pathname.startsWith('/api/product-packs/')){const n=Number(url.pathname.split('/').at(-1)),name='d'+String(n).padStart(2,'0')+'.json',base=path.join(root,'reference/live/img/prod',name),overlay=path.join(root,'app/data/product-details',name);if(fs.existsSync(base))return route.fulfill({json:{items:{...JSON.parse(fs.readFileSync(base)).items,...(fs.existsSync(overlay)?JSON.parse(fs.readFileSync(overlay)).items:{})}}});}
  return route.fulfill({status:503,json:{code:'test_no_api'}});
 });
 await context.route('**/img/**',route=>{const rel=decodeURIComponent(new URL(route.request().url()).pathname).slice(1),file=[path.join(root,rel),path.join(root,'reference/live',rel),path.join(root,'app/data/static',rel)].find(file=>fs.existsSync(file));return file?route.fulfill({path:file}):route.abort();});
 await context.addInitScript(()=>{if(!localStorage.getItem('winmate.v2.ui'))localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'scenarios'}}));});
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.locator('#bs-q').waitFor({timeout:60000});
 const scenario=await page.evaluate(async()=>{const {SC}=await import('/src/domain/templates/scenarios.js');return {title:SC.bs01.title};});
 const dialog=()=>page.locator('.modal.reference-detail');
 const hoverCheck=async(target,label)=>{
  await target.hover();await page.locator('.dpk .dpk-spec-section').waitFor();
  const size=await page.locator('.dpk').boundingBox();assert.ok(size.height<=480.1&&size.y>=0&&size.y+size.height<=page.viewportSize().height);
  assert.ok(await page.locator('.dpk .dpk-scroll').evaluate(el=>el.lastElementChild.classList.contains('dpk-spec-section')&&el.scrollHeight>el.clientHeight));
  await page.keyboard.press('Escape');await page.locator('.dpk').waitFor({state:'detached'});pass(label+' uses the common 480px hover limit with specs last');
 };
 const popupCheck=async(target,label)=>{
  await target.click();await dialog().waitFor();
  const size=await dialog().boundingBox();assert.ok(size.height<=720.1&&size.y>=0&&size.y+size.height<=page.viewportSize().height);
  const scroll=dialog().locator('.dpk-scroll');assert.ok(await scroll.evaluate(el=>el.lastElementChild.classList.contains('dpk-spec-section')&&el.scrollHeight>el.clientHeight));
  await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});assert.equal(await dialog().locator('.mfoot').getByRole('button',{name:'닫기',exact:true}).isVisible(),true);
  await page.screenshot({path:path.join(out,label.replace(/[^a-z0-9]+/gi,'-')+'.png'),animations:'disabled'});
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');await dialog().waitFor({state:'detached'});
  await page.waitForTimeout(320);assert.equal(await page.locator('.dpk').count(),0);
  pass(label+' opens the common 720px scrolling popup and restores focus without reopening hover');
 };
 const row=page.getByRole('article',{name:scenario.title,exact:true});
 const tag=row.locator('[data-reference-detail="product:qm55c"]');await hoverCheck(tag,'Scenario list');await popupCheck(tag,'Scenario list');
 await row.getByRole('button',{name:scenario.title+' 상세 보기',exact:true}).click();await page.locator('.modal.sbv').waitFor();
 await page.locator('.modal.sbv .match-node .node').click();const match=page.locator('.modal.sbv .mt-pop');await match.waitFor();
 const matched=match.locator('[data-reference-detail="product:qm55c"]');await hoverCheck(matched,'Scenario Storyboard');await popupCheck(matched,'Scenario Storyboard');
 assert.equal(await page.locator('.modal.sbv').count(),1);assert.equal(await match.count(),1);await page.keyboard.press('Escape');await page.locator('.modal.sbv .mfoot').getByRole('button',{name:'닫기',exact:true}).click();
 const route=async name=>{await page.evaluate(async name=>{const repo=await import('/src/repositories/proposals.js');repo.saveUi({...repo.loadUi(),route:{name}});},name);await page.reload();};
 await route('library');await page.locator('#tl-q').waitFor();
 const layout=await page.evaluate(async()=>{const {LAYOUTS}=await import('/src/services/catalog.js');const layout=LAYOUTS.find(l=>l.prods?.includes('qm55c'));return {f:layout.f,name:layout.name};});
 await page.locator('#tl-q').fill(layout.f);await page.locator(`[data-f="${layout.f}"]`).first().click();await page.locator('.modal.sheet .tl-dr').waitFor();
 const templateTag=page.locator('.modal.sheet .tl-dr [data-reference-detail="product:qm55c"]');await hoverCheck(templateTag,'Template detail');
 const before=await page.locator('.modal.sheet .mhead').innerText();await popupCheck(templateTag,'Template detail');assert.equal(await page.locator('.modal.sheet .mhead').innerText(),before);
 await page.locator('.modal.sheet .mfoot').getByRole('button',{name:'닫기',exact:true}).click();
 await route('sim');await page.locator('.simset').waitFor();const simTag=page.locator('.ss-refs [data-reference-detail^="product:"]').first();await hoverCheck(simTag,'Simulation setup');await popupCheck(simTag,'Simulation setup');
 await page.setViewportSize({width:390,height:844});await simTag.click();await dialog().waitFor();let box=await dialog().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y+box.height<=844);
 await page.setViewportSize({width:900,height:420});box=await dialog().boundingBox();assert.ok(box.height<=380.1);assert.ok(await dialog().locator('.dpk-scroll').evaluate(el=>el.scrollHeight>el.clientHeight));
 await dialog().locator('.dpk-spec-section').scrollIntoViewIfNeeded();assert.ok(await dialog().locator('.dpk-spec-section').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.keyboard.press('Escape');
 pass('Common popups resize to narrow and short viewports while specs remain scrollable');
 await page.setViewportSize({width:1500,height:1000});
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {useDetailPeek}=await import('/src/components/reference-detail.jsx'),{TagChip}=await import('/src/components/tagcard.jsx');
  const host=document.createElement('div');host.id='detail-action-contract';host.style.cssText='position:fixed;inset:20px;z-index:160;background:var(--surface)';document.body.appendChild(host);
  window.referenceSelectionCount=0;
  function Subject(){const peek=useDetailPeek();return React.createElement(React.Fragment,null,React.createElement(TagChip,{r:'product:qm55c',peek,onClick:()=>{window.referenceSelectionCount++;}}),peek.node);}
  createRoot(host).render(React.createElement(Subject));
 });
 await page.locator('#detail-action-contract button.tagchip').click();assert.equal(await page.evaluate(()=>window.referenceSelectionCount),1);assert.equal(await dialog().count(),0);
 pass('Product chips with explicit selection actions keep their action instead of opening a detail popup');
 await page.evaluate(async()=>{
  const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {useDetailPeek}=await import('/src/components/reference-detail.jsx'),{TagChip}=await import('/src/components/tagcard.jsx');
  document.getElementById('detail-action-contract').remove();
  const host=document.createElement('div');host.id='reviewed-specs';host.style.cssText='position:fixed;inset:20px;z-index:10;background:var(--surface)';document.body.appendChild(host);
  function Subject(){const peek=useDetailPeek();return React.createElement(React.Fragment,null,...['qm65c','watch','sg_g000184071','ec_228_049'].map(id=>React.createElement(TagChip,{key:id,r:'product:'+id,peek})),peek.node);}
  createRoot(host).render(React.createElement(Subject));
 });
 const specSection=()=>dialog().locator('.dpk-spec-section');
 await page.locator('#reviewed-specs [data-reference-detail="product:qm65c"]').click();await dialog().waitFor();
 await specSection().getByRole('cell',{name:'163.9 cm',exact:true}).waitFor();assert.equal(await specSection().getByRole('cell',{name:'138.7 cm',exact:true}).count(),0);
 await page.keyboard.press('Escape');pass('Reviewed QM65C renders its own 65-inch values instead of the shared 55-inch family table');
 await page.locator('#reviewed-specs [data-reference-detail="product:watch"]').click();await dialog().waitFor();
 const options=specSection().getByRole('combobox',{name:'사양 모델'});await options.waitFor();assert.equal(await options.locator('option').count(),2);
 await specSection().getByRole('button',{name:/행 더 보기/}).click();await specSection().getByRole('cell',{name:'325',exact:true}).waitFor();
 await options.selectOption('SM-L330NZSAKOO');await specSection().getByRole('button',{name:/행 더 보기/}).click();await specSection().getByRole('cell',{name:'435',exact:true}).waitFor();assert.equal(await specSection().getByRole('cell',{name:'325',exact:true}).count(),0);
 await page.keyboard.press('Escape');pass('Watch model selection updates the actual 40mm/44mm battery specification independently');
 await page.locator('#reviewed-specs [data-reference-detail="product:sg_g000184071"]').click();await dialog().waitFor();await specSection().getByRole('button',{name:/행 더 보기/}).click();
 await specSection().getByRole('rowheader').filter({hasText:'HA-MTS1S43BLK'}).first().waitFor();await page.screenshot({path:path.join(out,'reviewed-package-specs.png'),animations:'disabled'});await page.keyboard.press('Escape');pass('Package details include the actual stand component rather than an empty parent SKU');
 await page.locator('#reviewed-specs [data-reference-detail="product:ec_228_049"]').click();await dialog().waitFor();await specSection().getByText(/세부 모델을 확인하지 못해/).waitFor();assert.equal(await specSection().locator('table').count(),0);await page.keyboard.press('Escape');pass('Unknown Crown CS model is explicitly unresolved and never displays guessed CTs specifications');
 assert.equal(modelCalls,0);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,modelCalls},null,2));
}catch(error){console.error('Page errors:',errors);if(page){console.error((await page.locator('body').innerText()).slice(-1800));await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'});}throw error;}
finally{await browser?.close();await server.close();}
