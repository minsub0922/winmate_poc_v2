// Reproduce the actual Hotel AI Stay L_AIS_07 history with its original six images.
// No live model calls: checks item identity, alternatives and preservation of explicit image choices.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from '../web/node_modules/esbuild/lib/main.js';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const load=p=>{const m={exports:{}};new Function('module','exports',transformSync(fs.readFileSync(path.join(root,p),'utf8'),{format:'cjs'}).code)(m,m.exports);return m.exports;};
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'app/data',n+'.json'),'utf8'));
const boot={catalog:read('catalog'),products:read('products_db'),images:read('images'),capabilities:null,user:{username:'galaxy-history-test',auth_enabled:false}};
const scenario=load('app/web/src/domain/templates/scenarios.js').SCENARIOS.find(s=>s.id==='bs21');
const fill=load('app/web/src/domain/templates/scenario_fills.js').FILLS.bs21.find(x=>x.f==='L_AIS_07');
const {f,...ov}=fill;
const document={id:'galaxy-hotel-history',title:scenario.title,customer:'H 호텔',ind:'HT',createdAt:1,updatedAt:1,stage:'story',reqTab:'form',
 req:{free:[{t:scenario.situation}],form:{customer:'H 호텔',project:'AI 스테이',keymen:[],note:''},files:[]},
 ctx:{products:[...scenario.products],solutions:[...scenario.solutions],cases:[...scenario.cases]},
 parts:[{id:'galaxy-part',name:'AI 글로벌 응대',type:'scenario',items:['갤럭시 AI 통역'],done:true,layouts:[{uid:'galaxy-sheet',f,status:'done',ov,ev:{}}]}]};
const out=path.join(root,'app/tests/output/image-item-context');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
const results=[],errors=[],modelInputs=[];let browser,page,modelMode='blocked';
const pass=n=>{results.push(n);console.log('PASS '+n);};
try{
 await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:1000}});
 await context.addInitScript(p=>{if(!localStorage.getItem('winmate.v2.proposals')){localStorage.setItem('winmate.v2.proposals',JSON.stringify([p]));localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'proposal',id:p.id}}));}},document);
 await context.route(url=>url.pathname.startsWith('/api/'),route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:boot});
  if(url.pathname.startsWith('/api/product-packs/'))return route.fulfill({path:path.join(root,'reference/live/img/prod/d00.json')});
  if(url.pathname==='/api/llm'){
   const b=route.request().postDataJSON();const input=JSON.parse(b.prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]);modelInputs.push(input);
   if(modelMode==='success')return route.fulfill({json:{mode:'real',data:{
    blocks:input.blocks.map(b=>({i:b.i,action:'keep',s:b.current,src:[],reason:'test-only item context'})),
    images:input.images.map(im=>({i:im.i,action:'replace',n:im.candidates[0].n,reason:'test-only selected item replacement'})),replacements:[],missing:[]}}});
   return route.fulfill({status:503,json:{code:'unavailable',message:'test: no live model calls'}});
  }
  return route.fulfill({status:503,json:{code:'test_no_api'}});
 });
 await context.route('**/img/**',route=>{
  const rel=decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
  const file=path.join(root,rel.startsWith('img/lib/')?rel:'app/data/static/'+rel);
  return fs.existsSync(file)?route.fulfill({path:file}):route.abort();
 });
 await context.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>route.abort());
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port);
 await page.waitForFunction(()=>window.document.querySelector('.app')&&!window.document.querySelector('.boot'));
 await page.locator('[data-layout-uid="galaxy-sheet"]').click();
 await page.locator('.modal .detail').waitFor();
 const subject=await page.evaluate(async()=>{
  const repo=await import('/src/repositories/proposals.js');window.__itemRepo=repo;
  const {readImageSlots}=await import('/src/domain/slides/Slide.jsx');const {loadImageLibrary,imagePool}=await import('/src/services/image-library.js');
  const {relatedImages,imageProducts}=await import('/src/services/images.js');const {productsNamedIn,matchesDeviceFamily}=await import('/src/services/image-identity.js');
  const p=repo.getProposal('galaxy-hotel-history'),x=p.parts[0].layouts[0];
  const library=await loadImageLibrary();const images=imagePool(p.ctx,library,{allMedia:true});const slots=readImageSlots(x.f,x.ov);
  const checks=slots.map(slot=>{const current={...slot,...x.ov.img[slot.i]};const pool=imagePool({...p.ctx,products:[...new Set([...p.ctx.products,...imageProducts(current)])]},library,{allMedia:true});const ranked=relatedImages(pool,{current,productIds:p.ctx.products,kind:slot.kind,hint:slot.hint,contextText:p.req.free[0].t}).filter(im=>im.src!==current.src);
   return {i:slot.i,name:current.name,products:imageProducts(current,images),itemText:slot.itemText,alternatives:ranked.map(im=>({pid:im.pid,src:im.src,products:im.products||[],title:im.title,desc:im.desc,familyPhone:matchesDeviceFamily(im,'phone'),familyTablet:matchesDeviceFamily(im,'tablet')}))};});
  const generic=relatedImages(images,{current:{name:'제품 컷',itemText:'글로벌 대면 통역 · 갤럭시 스마트폰'},productIds:p.ctx.products,kind:'cut'}).slice(0,9);
  const english=productsNamedIn('Galaxy S26 Ultra front / rear');const plus=productsNamedIn('갤럭시 S26+ 정면');const ai=productsNamedIn('갤럭시 AI 실시간 통역');
  const phone=images.find(im=>im.products?.includes('sg_g000184056'));
  const stale=imageProducts({src:phone.src,pid:images.find(im=>im.products?.includes('hoteltv')).pid},images);
  return {checks,generic:generic.map(im=>matchesDeviceFamily(im,'phone')),english,plus,ai,stale,connected:p.ctx.products};
 });
 assert.ok(!subject.connected.includes('sg_g000184056'));
 for(const i of [1,4]){
  const target=subject.checks.find(c=>c.i===i);assert.deepEqual(target.products,['sg_g000184056']);assert.ok(target.alternatives.length>=3);
  assert.ok(target.alternatives.every(im=>im.products.includes('sg_g000184056')));
 }
 pass('Actual AI Stay Galaxy cuts resolve S26 Ultra by name although no Galaxy is in the linked-product tray');
 assert.ok(subject.generic.length>0&&subject.generic.every(Boolean));
 pass('Generic Galaxy smartphone item labels recommend phones, not linked hotel TVs or air conditioners');
 assert.deepEqual(subject.english,['sg_g000184056']);assert.deepEqual(subject.plus,['sg_g000184048']);assert.deepEqual(subject.ai,[]);assert.ok(subject.stale.includes('sg_g000184056'));
 pass('English marketing names, S26+ variants and stale image pids resolve the displayed product');
 const tablet=subject.checks.find(c=>c.i===2);assert.ok(tablet.alternatives.length>0);assert.ok(tablet.alternatives.every(im=>im.familyTablet));
 assert.ok(tablet.itemText.includes('갤럭시'));
 pass('The adjacent Galaxy tablet scene stays tablet-related even beside a smartphone row');
 const popup=()=>page.getByRole('dialog',{name:'대체 이미지 고르기',exact:true});
 const preview=async(option,name)=>{
  const caption=await option.getAttribute('aria-label')||await option.locator('.c').innerText();
  await option.scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.mouse.move(0,0);
  await option.hover();
  await page.waitForFunction(caption=>{const tip=document.querySelector('.image-peek'),img=tip?.querySelector('img');return img?.alt===caption&&img.complete&&img.naturalWidth>0&&tip.getBoundingClientRect().top>=0;},caption);
  const geometry=await page.getByRole('tooltip',{name:'이미지 확대 미리보기'}).evaluate(el=>{
   const photo=el.querySelector('.image-peek-photo').getBoundingClientRect(),img=el.querySelector('img'),r=img.getBoundingClientRect(),tip=el.getBoundingClientRect(),style=getComputedStyle(img);
   return {square:Math.abs(photo.width-photo.height)<1,fit:style.objectFit,position:style.objectPosition,w:img.naturalWidth,h:img.naturalHeight,inside:r.left>=photo.left&&r.right<=photo.right&&r.top>=photo.top&&r.bottom<=photo.bottom,visible:tip.left>=0&&tip.right<=innerWidth&&tip.top>=0&&tip.bottom<=innerHeight};
  });
  assert.ok(geometry.square&&geometry.inside&&geometry.visible,JSON.stringify(geometry));assert.equal(geometry.fit,'contain');assert.equal(geometry.position,'50% 50%');
  await page.screenshot({path:path.join(out,`hover-${name}.png`),animations:'disabled'});
  return geometry;
 };
 await page.locator('.detail-left [data-img="1"]').click();await popup().waitFor();await popup().locator('.ip-opt').first().waitFor();
 const popupText=await popup().innerText();assert.ok(/갤럭시|S26/.test(popupText));assert.ok(!/무풍|호텔 TV|공기청정기|에어드레서/.test(popupText));
 await page.screenshot({path:path.join(out,'galaxy-related.png'),animations:'disabled'});
 pass('The real layout replacement popup shows Galaxy images instead of proposal-wide connected products');
 const portrait=await preview(popup().locator('.ip-opt').first(),'portrait');assert.ok(portrait.h>portrait.w);
 const allGalaxy=subject.checks.find(c=>c.i===1).alternatives;
 assert.ok(allGalaxy.length>9);assert.equal(await popup().locator('.ip-opt').count(),allGalaxy.length);
 assert.equal(new Set(allGalaxy.map(im=>im.src)).size,allGalaxy.length);
 assert.ok((await popup().locator('.ip-count').innerText()).includes(String(allGalaxy.length)));
 const grid=popup().getByRole('region',{name:'관련 이미지 후보',exact:true});
 const beforeScroll=await grid.evaluate(el=>({height:el.clientHeight,total:el.scrollHeight,top:el.scrollTop}));
 assert.ok(beforeScroll.total>beforeScroll.height);assert.equal(beforeScroll.top,0);
 await grid.hover();await page.mouse.wheel(0,100000);
 await page.waitForFunction(()=>{const el=document.querySelector('.imgpop .ip-grid');return el.scrollTop+el.clientHeight>=el.scrollHeight-2;});
 await page.waitForFunction(()=>{const img=document.querySelector('.imgpop .ip-opt:last-child img');return img?.complete&&img.naturalWidth>0;});
 const lastBox=await popup().locator('.ip-opt').last().boundingBox(),gridBox=await grid.boundingBox();
 assert.ok(lastBox.y>=gridBox.y&&lastBox.y+lastBox.height<=gridBox.y+gridBox.height+1);
 await page.screenshot({path:path.join(out,'galaxy-related-scrolled.png'),animations:'disabled'});
 const landscape=await preview(popup().locator('.ip-opt').last(),'landscape');assert.ok(landscape.w>landscape.h);
 pass('Portrait and landscape hover previews center the entire image inside a square without cropping or leaving the viewport');
 await page.setViewportSize({width:1500,height:420});
 await page.waitForFunction(()=>{const r=document.querySelector('.imgpop').getBoundingClientRect();return r.top>=8&&r.bottom<=innerHeight-7;});
 const compact=await popup().evaluate(el=>{const r=el.getBoundingClientRect(),foot=el.querySelector('.ip-foot').getBoundingClientRect(),grid=el.querySelector('.ip-grid');return {top:r.top,bottom:r.bottom,footer:foot.bottom,height:innerHeight,scrollable:grid.scrollHeight>grid.clientHeight};});
 assert.ok(compact.top>=8&&compact.bottom<=compact.height-7&&compact.footer<=compact.height-7);assert.ok(compact.scrollable);
 await page.setViewportSize({width:1500,height:1000});
 pass(`All ${allGalaxy.length} distinct related candidates are available; scrolling reaches loaded images beyond nine and keeps the footer visible`);
 await popup().getByRole('button',{name:'이미지 더 보기',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'이미지 넣기',exact:true});await picker.waitFor();await picker.locator('.imgopt').first().waitFor();
 const captions=await picker.locator('.imgopt .c').allTextContents();assert.ok(captions.length>=3);
 const models=await picker.locator('.imgopt .g').allTextContents();assert.ok(models.slice(0,3).every(m=>m.includes('SM-S948')));
 await preview(picker.locator('.imgopt').first(),'full-picker');
 await picker.getByRole('button',{name:'닫기',exact:true}).last().click();
 pass('The full picker leads with the same clicked-item focus while browsing the entire library');
 await page.locator('.detail-left [data-img="2"]').click();await popup().locator('.ip-opt').first().waitFor();
 const tabletText=await popup().innerText();assert.ok(/태블릿|갤럭시 탭|Tab|S11/i.test(tabletText));assert.ok(!/에어드레서|무풍|호텔 TV/.test(tabletText));
 await popup().getByRole('button',{name:'닫기',exact:true}).click();
 await page.locator('.detail-left [data-img="1"]').click();await popup().locator('.ip-opt').first().waitFor();
 const beforeImageEdit=await page.evaluate(()=>{
  window.__imageEditPhases=[];
  window.__stopImageEditWatch=window.__itemRepo.onProposalChange(p=>{if(p.id==='galaxy-hotel-history')window.__imageEditPhases.push(p.parts[0].layouts[0].adaptation?.phase);});
  return window.__itemRepo.getProposal('galaxy-hotel-history').parts[0].layouts[0];
 });
 const lastName=await popup().locator('.ip-opt').last().getAttribute('aria-label');
 await popup().locator('.ip-opt').last().click();
 await page.waitForFunction(name=>window.__itemRepo.getProposal('galaxy-hotel-history').parts[0].layouts[0].ov.img[1]?.name===name,lastName);
 await page.waitForTimeout(650); // Beyond the background worker's 350ms queue delay.
 const chosen=await page.evaluate(async()=>{
  const p=window.__itemRepo.getProposal('galaxy-hotel-history'),x=p.parts[0].layouts[0];const {inspectLayoutContext}=await import('/src/services/layout-context.js');
  return {image:x.ov.img[1],connected:p.ctx.products,issues:inspectLayoutContext(p,x),layout:x,phases:window.__imageEditPhases};
 });
 assert.equal(chosen.image.selectedBy,'user');assert.ok(chosen.image.products.includes('sg_g000184056'));assert.deepEqual(chosen.connected,document.ctx.products);
 assert.equal(chosen.image.name,lastName);assert.ok(allGalaxy.some(im=>im.src===chosen.image.src));assert.ok(!allGalaxy.slice(0,9).some(im=>im.src===chosen.image.src));
 assert.equal(modelInputs.length,0);assert.ok(chosen.phases.every(phase=>!['queued','running'].includes(phase)));
 assert.deepEqual(chosen.layout.adaptation,beforeImageEdit.adaptation);assert.equal(chosen.layout.status,beforeImageEdit.status);
 assert.deepEqual(chosen.layout.ov.t,beforeImageEdit.ov.t);
 const unchangedImages=structuredClone(chosen.layout.ov.img),originalImages=structuredClone(beforeImageEdit.ov.img);delete unchangedImages[1];delete originalImages[1];assert.deepEqual(unchangedImages,originalImages);
 assert.equal(await page.locator('.context-slide[aria-busy="true"]').count(),0);
 await page.screenshot({path:path.join(out,'image-replaced-without-reloading.png'),animations:'disabled'});
 pass('A manual image replacement changes only that image, with zero model requests or full-layout loading');
 await page.locator('.detail-left [data-img="1"]').click();await popup().locator('.ip-opt').first().waitFor();
 await popup().getByRole('button',{name:'이미지 더 보기',exact:true}).click();await picker.locator('.imgopt').first().waitFor();
 await picker.locator('.imgopt').first().click();
 await page.waitForTimeout(650);
 assert.equal(modelInputs.length,0);
 assert.equal(await page.locator('.context-slide[aria-busy="true"]').count(),0);
 assert.ok(await page.evaluate(()=>window.__imageEditPhases.every(phase=>!['queued','running'].includes(phase))));
 pass('Picking an image in the full library also applies directly without rerunning context adaptation');
 modelMode='success';
 const reviewed=await page.evaluate(async()=>{
  const {registerLayout}=await import('/src/services/catalog.js');const {personalizeLayout,inspectLayoutContext}=await import('/src/services/layout-context.js');
  const p=window.__itemRepo.getProposal('galaxy-hotel-history'),selected=p.parts[0].layouts[0].ov.img[1];
  const f='L_TEST_ITEM_REVIEW';registerLayout({f,c:'PH',name:'선택 이미지 검토',p:'products',req:[],prods:[],sols:[],when:'현재 항목을 유지'},
   '<div style="width:1280px;height:720px;position:relative;background:#fff"><div data-tb="0">모바일 안내</div><div data-img="0" data-kind="cut"><img src="'+selected.src+'"></div></div>');
  const x={uid:'item-review',f,ov:{t:{},img:{0:selected}},ev:{i0:{by:'user',src:[]}}};
  const result=await personalizeLayout(p,{id:'item-part',type:'products',name:'현재 이미지',items:[]},x);
  return {image:result.ov.img[0],missing:result.missing,issues:inspectLayoutContext(p,{...x,ov:result.ov}),connected:p.ctx.products};
 });
 assert.equal(reviewed.image.selectedBy,'user');assert.ok(reviewed.image.products.includes('sg_g000184056'));assert.deepEqual(reviewed.missing,[]);
 assert.deepEqual(reviewed.issues,[]);assert.deepEqual(reviewed.connected,document.ctx.products);
 pass('Successful automatic review also preserves the explicit Galaxy item instead of reverting to linked TVs');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:results,pageErrors:errors,subject},null,2));
}catch(error){console.error('Page errors:',errors);if(page&&!page.isClosed()){console.error((await page.locator('body').innerText()).slice(-2200));await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'});}throw error;}
finally{await browser?.close();await server.close();}
