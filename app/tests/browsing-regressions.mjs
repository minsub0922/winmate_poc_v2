// Real preview components and catalog, with isolated HTTP/storage and no model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),web=path.join(root,'app/web');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,'app/data',p),'utf8'));
const library=read('spatial/library.json'),scenes=read('spatial/scenes.json');
const out=path.join(root,'app/tests/output/browsing-regressions');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'winmate-browse-check-'));
const server=await createServer({root:web,configFile:path.join(web,'vite.config.js'),cacheDir:path.join(temp,'vite'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
let browser,page,release,ok=false;
const errors=[],checks=[],requests=[];const pass=s=>{checks.push(s);console.log('PASS '+s);};
let mode='ok',delayedId;
try{
  await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000}});
  await context.route(url=>!['localhost','127.0.0.1'].includes(url.hostname),route=>route.abort());
  await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
    const url=new URL(route.request().url()),p=url.pathname;
    if(p==='/api/bootstrap')return route.fulfill({json:{catalog:read('catalog.json'),products:read('products_db.json'),images:read('images.json'),capabilities:null,user:{username:'browse-check',auth_enabled:false}}});
    if(p.startsWith('/api/spatial/library'))return route.fulfill({json:library});
    if(p==='/api/spatial/history')return route.fulfill({json:{items:[],total:0,page:1,page_size:8}});
    if(p==='/api/storyboards')return route.fulfill({json:{items:[]}});
    if(p.endsWith('/preview.webp'))return route.fulfill({path:path.join(web,'public/assets/spatial-examples/spatial-example-1.webp')});
    if(p.startsWith('/api/spatial/templates/')){
      requests.push({p,rev:url.searchParams.get('rev'),mode});
      if(mode==='delay'&&p.endsWith('/'+delayedId))await new Promise(resolve=>{release=resolve;});
      if(mode==='404')return route.fulfill({status:404,json:{detail:'older server'}});
      if(mode==='invalid')return route.fulfill({json:{scene:{...scenes[p.split('/').at(-1)],assetRevision:'deadbeef'}}});
      if(mode==='422')return route.fulfill({status:422,json:{detail:'invalid template fixture'}});
      return route.fulfill({json:{scene:scenes[p.split('/').at(-1)]}});
    }
    if(p==='/api/spatial/compute'){
      const body=route.request().postDataJSON();requests.push({p,body});
      return route.fulfill({json:{assetRevision:body.revision,scene:{...scenes[body.templateId],assetRevision:body.revision}}});
    }
    return route.fulfill({status:422,json:{detail:'isolated browsing test'}});
  });
  await context.route('**/img/**',route=>{const file=path.join(root,'app/data/static',decodeURIComponent(new URL(route.request().url()).pathname));return fs.existsSync(file)?route.fulfill({path:file}):route.abort();});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.locator('.home').waitFor();
  await page.evaluate(async()=>{
    const urls=performance.getEntriesByType('resource').map(r=>r.name),React=(await import(urls.find(u=>/\/react\.js\?/.test(u)))).default;
    const {createRoot}=(await import(urls.find(u=>/\/react-dom_client\.js\?/.test(u)))).default;
    const {FitSlide,Slide}=await import('/src/domain/slides/Slide.jsx'),{registerLayout}=await import('/src/services/catalog.js');
    registerLayout({f:'L_BROWSE_CHECK',name:'preview check'},'<div style="position:relative;width:1280px;height:720px;background:#fff"><div data-tb="0" style="font-size:42px">original</div><div data-pgno>1</div></div>');
    const host=document.createElement('div');host.id='browse-check';host.style='position:fixed;inset:0;background:white;z-index:20000;padding:20px';document.body.append(host);
    const render=createRoot(host);let value='first',editable=false;
    window.renderPreview=(next=value,edit=editable)=>{value=next;editable=edit;render.render(React.createElement('div',{id:'preview-scroll',style:{width:'480px',height:'500px',overflow:'auto'}},
      React.createElement('div',{id:'preview-card'},React.createElement(editable?Slide:FitSlide,{f:'L_BROWSE_CHECK',ov:{t:{0:value}},pageNo:7,lazy:true,editable,width:480,onText:()=>{}})),
      React.createElement('div',{style:{height:'4000px'}})));};window.renderPreview();
  });
  const text=page.locator('#preview-card [data-tb="0"]');await text.waitFor();assert.equal(await text.textContent(),'first');assert.equal(await page.locator('#preview-card [data-pgno]').textContent(),'7');
  const bounds=await page.locator('#preview-card').boundingBox();
  await page.locator('#preview-scroll').evaluate(el=>el.scrollTop=3500);await page.evaluate(()=>window.renderPreview('changed while offscreen'));
  await page.locator('#preview-scroll').evaluate(el=>el.scrollTop=0);await page.waitForFunction(()=>document.querySelector('#preview-card [data-tb]')?.textContent==='changed while offscreen');
  assert.deepEqual(await page.locator('#preview-card').boundingBox(),bounds);pass('lazy preview keeps its dimensions, overrides and page number when scrolling away and back');
  await page.evaluate(()=>window.renderPreview('editable',true));await text.click();await text.fill('unsaved inline text');
  await page.locator('#preview-scroll').evaluate(el=>el.scrollTop=3500);await page.waitForTimeout(120);await page.locator('#preview-scroll').evaluate(el=>el.scrollTop=0);
  assert.equal(await text.textContent(),'unsaved inline text');assert.equal(await text.getAttribute('contenteditable'),'true');pass('editable slide stays mounted and retains an in-progress edit outside the viewport');
  await page.evaluate(()=>document.getElementById('browse-check').remove());
  const load=()=>page.evaluate(async()=>{const {loadSpatialTemplate,loadSpatialLibrary}=await import('/src/services/spatial.js');const lib=await loadSpatialLibrary(),t=lib.templates.find(t=>t.id==='fb-full-standard');const [a,b]=await Promise.all([loadSpatialTemplate(t,lib),loadSpatialTemplate(t,lib)]);return {same:a===b,scene:a};});
  const loaded=await load();assert(loaded.same);assert.deepEqual(loaded.scene,scenes['fb-full-standard']);await load();assert.equal(requests.filter(r=>r.p.endsWith('/fb-full-standard')).length,1);assert.equal(requests[0].rev,library.sourceHash);pass('server template is byte-for-byte identical, revision-bound and shared across concurrent/repeated consumers');
  const failing=()=>page.evaluate(async()=>{const {loadSpatialTemplate,loadSpatialLibrary}=await import('/src/services/spatial.js');const lib={...await loadSpatialLibrary()},t=lib.templates.find(t=>t.id==='fb-full-standard');try{await loadSpatialTemplate(t,lib);return null;}catch(e){return e.message;}});
  mode='invalid';assert.match(await failing(),/버전/);mode='422';assert.match(await failing(),/invalid template/);mode='ok';pass('invalid revisions and validation errors never silently become a different scene');
  mode='404';const frozen=await page.evaluate(async()=>{const {loadSpatialTemplate,loadSpatialLibrary}=await import('/src/services/spatial.js');const lib={...await loadSpatialLibrary(),sourceHash:'deadbeef'};return loadSpatialTemplate(lib.templates.find(t=>t.id==='fb-full-standard'),lib);});
  assert.equal(frozen.assetRevision,'deadbeef');assert.equal(requests.at(-1).body.revision,'deadbeef');assert.equal(requests.at(-1).body.kind,'template');mode='ok';pass('an older or archived template endpoint uses backend compute with the same requested asset revision');
  await page.evaluate(()=>{history.pushState({winmateRoute:{name:'spatial'}},'','/');window.dispatchEvent(new PopStateEvent('popstate',{state:{winmateRoute:{name:'spatial'}}}));});
  await page.locator('.sp-studio-launch').click();await page.locator('.be-industries [data-industry="FB"]').click();await page.getByRole('button',{name:'업종 템플릿에서 시작'}).click();
  const last=page.locator('.be-template-item').last();delayedId=await last.getAttribute('data-template-id');mode='delay';await last.focus();await last.press('Enter');await page.locator('.be-template-chosen').waitFor();assert.equal(await page.locator('.be-template-chosen').getAttribute('data-template-id'),delayedId);
  for(let i=0;i<30&&!release;i++)await page.waitForTimeout(50);assert(release,'last template scene should still be loading');
  await page.locator('.be-template-confirm').getByRole('button',{name:'취소',exact:true}).click();mode='ok';release();release=null;
  await last.press('Enter');await page.waitForFunction(()=>document.querySelector('.be-template-chosen small')?.textContent.includes('제품'));
  await page.locator('.be-template-confirm').getByRole('button',{name:'취소',exact:true}).click();pass('keyboard can reach the last template and open/cancel its matching confirmation');
  await page.setViewportSize({width:390,height:844});await last.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'mobile-templates.png')});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('template browsing remains within the mobile viewport');
  await page.setViewportSize({width:1500,height:1000});
  await page.evaluate(()=>{history.pushState({winmateRoute:{name:'library',scope:'sh'}},'','/');window.dispatchEvent(new PopStateEvent('popstate',{state:{winmateRoute:{name:'library',scope:'sh'}}}));});
  await page.locator('#tl-q').fill('VP-F');const group=page.locator('.tl-card[data-count-group="vp-products"]');await group.waitFor();await group.hover();
  const peek=page.getByRole('region',{name:'수량별 레이아웃 미리보기'});await peek.waitFor();assert.equal(await peek.locator('.count-group-option').count(),3);
  await peek.hover();await page.waitForTimeout(250);assert(await peek.isVisible());await peek.locator('[data-count-layout="L_VP_F4"] button').click();
  const detail=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:/가치 기둥 × 제품 · 4개/})});await detail.waitFor();await detail.getByRole('button',{name:'닫기',exact:true}).first().click();
  await group.click();const choice=page.getByRole('dialog',{name:/가치 기둥 × 제품 · 수량별 버전 3종/});await choice.waitFor();await choice.locator('[data-count-layout="L_VP_F2"] button').click();
  const second=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:/가치 기둥 × 제품 · 2개/})});await second.waitFor();await second.getByRole('button',{name:'닫기',exact:true}).first().click();pass('isolated hover stays open while entering the grouped preview and opens the exact chosen variant, as does the click chooser');
  await page.evaluate(()=>{history.pushState({winmateRoute:{name:'spatial'}},'','/');window.dispatchEvent(new PopStateEvent('popstate',{state:{winmateRoute:{name:'spatial'}}}));});
  for(const width of [1500,390]){
    await page.setViewportSize({width,height:1000});await page.locator('.sp-object-trigger').click();const drawer=page.locator('.sp-object-drawer'),scroll=drawer.locator('#sp-library-popup'),cards=scroll.locator('.sp-object-card');await cards.first().waitFor();
    const total=Number(await scroll.locator('[data-total-count]').getAttribute('data-total-count'));
    for(let n=0;await cards.count()<total;n++){assert(n<50);const count=await cards.count();await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForFunction(count=>document.querySelectorAll('#sp-library-popup .sp-object-card').length>count,count);}
    assert.equal(await cards.count(),total);await drawer.getByLabel('오브젝트 검색',{exact:true}).fill('없는-오브젝트-검증');await scroll.locator('.sp-empty-results').waitFor();assert.equal(await cards.count(),0);
    await drawer.getByLabel('오브젝트 검색',{exact:true}).fill('');await cards.first().waitFor();await page.waitForFunction(()=>document.querySelector('#sp-library-popup').scrollTop===0);assert((await cards.count())<total);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'objects-'+width+'.png')});await drawer.locator('.mhead').getByRole('button',{name:'닫기',exact:true}).click();pass(width+'px: all '+total+' object groups remain reachable; filtering resets pagination and scroll without overflow');
  }
  assert.deepEqual(errors,[]);
  ok=true;
}finally{release?.();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({ok,checks,errors,requests},null,2));await browser?.close();await server.close();fs.rmSync(temp,{recursive:true,force:true});}
