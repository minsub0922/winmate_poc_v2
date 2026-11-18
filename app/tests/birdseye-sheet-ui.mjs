// 조감도 시트 — 좌우 ↔ 가운데 형태 전환 · 팝업에서 3D로 돌려 보기 (격리 API + Vite, 실제 계정 · 모델 호출 없음)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import JSZip from '../web/node_modules/jszip/lib/index.js';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'winmate-birdseye-sheet-'));
const output=path.join(root,'app/tests/output/birdseye-sheet');fs.mkdirSync(output,{recursive:true});
const apiPort=process.env.BIRDSEYE_SHEET_API_PORT||'15444',webPort=process.env.BIRDSEYE_SHEET_WEB_PORT||'15445',base='http://127.0.0.1:'+webPort;
process.env.WINMATE_API_PORT=apiPort;process.env.WINMATE_WEB_PORT=webPort;
const api=spawn(path.join(root,'app/.venv/bin/python'),['-B','app/tests/fixtures/spatial/server.py'],{cwd:root,env:{...process.env,WINMATE_AUTH_DIR:path.join(temporary,'auth'),WINMATE_SPATIAL_DB:path.join(temporary,'spatial.sqlite'),WINMATE_STORYBOARD_DIR:path.join(temporary,'storyboards')}});
let apiLog='';api.stdout.on('data',value=>apiLog+=value);api.stderr.on('data',value=>apiLog+=value);
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),cacheDir:path.join(temporary,'vite-cache'),logLevel:'error',server:{host:'127.0.0.1',port:Number(webPort),strictPort:true,hmr:false}});
const decks=JSON.parse(fs.readFileSync(path.join(root,'app/web/src/domain/templates/standard_vertical_scenarios.json')));
const standard=decks.fills.bs_std_fb_qsr.find(x=>/^L_VS_BIRD_S/.test(x.f));
const building=Object.values(decks.fills).flat().filter(x=>/^L_VS_BIRD_B/.test(x.f)).sort((a,b)=>Number(b.f.slice(11))-Number(a.f.slice(11)))[0];
let browser,page;const checks=[],errors=[],pass=message=>{checks.push(message);console.log('PASS '+message);};
try{
  let ready=false;for(let attempt=0;attempt<120;attempt++){
    if(api.exitCode!=null)throw new Error(apiLog);
    try{await fetch('http://127.0.0.1:'+apiPort+'/api/health');ready=true;break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }assert(ready,'isolated API ready');
  await server.listen();
  const chrome=process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{}),args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1560,height:1080},reducedMotion:'reduce'});
  assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).status(),200);
  await context.route(url=>['/api/llm','/api/jobs'].includes(url.pathname),route=>route.request().method()==='POST'?route.fulfill({status:503,json:{detail:'no model expected'}}):route.continue());
  await context.addInitScript(()=>{if(!localStorage.getItem('birdseye-sheet-seeded')){localStorage.setItem('birdseye-sheet-seeded','1');localStorage.setItem('winmate.v2.proposals','[]');localStorage.setItem('winmate.v2.seedv','admin-samples-1');localStorage.setItem('winmate.v2.review-example-proposals.seedv','skip-birdseye-sheet');}});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/spatial');await page.locator('.sp-home-launches').waitFor({timeout:120000});
  const route=await page.evaluate(async standard=>{
    const {layoutContextKey}=await import('/src/domain/slides/context-policy.js'),{historyPath}=await import('/src/services/shared-path.js');
    const {createScene}=await import('/src/domain/spatial/scene.js'),{embedSpatial}=await import('/src/domain/spatial/slide-binding.js'),{loadSpatialLibrary,captureSpatial}=await import('/src/services/spatial.js');
    const library=await loadSpatialLibrary(),scene=createScene({templateId:'cowork-cowork-meet-standard'},library),snapshot=await captureSpatial(scene,library);
    const p={id:'birdseye-sheet',title:'조감도 시트',customer:'고객',ind:'FB',createdAt:1,updatedAt:1,stage:'story',reqTab:'free',req:{free:[],form:{project:'',customer:'',target:'',keymen:[],note:''},files:[]},ctx:{products:[],solutions:[],cases:[]},parts:[{id:'part',name:'공간별 제안',type:'scenario',items:[],done:true,layouts:[]}]};
    p.parts[0].layouts=[{uid:'std',f:standard.f,status:'done',ov:{t:{...standard.t},img:structuredClone(standard.img)}},{uid:'link',f:'L_SPATIAL_3D',status:'done',ov:{t:{},img:{},spatial:embedSpatial(scene,library,{view:'3d',snapshot})}}];
    for(const x of p.parts[0].layouts)x.adaptation={version:3,phase:'retained',origin:'history',key:layoutContextKey(p,p.parts[0])};
    localStorage.setItem('winmate.v2.proposals',JSON.stringify([p]));localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'proposal',id:p.id}}));return historyPath(p.id);
  },standard);
  await page.goto(base+route);await page.locator('[data-layout-uid="std"]').waitFor({timeout:120000});
  const detail=page.locator('.modal.sheet').filter({has:page.locator('.detail')});
  const open=async uid=>{await page.locator('[data-layout-uid="'+uid+'"]').click();await detail.locator('.slide-edit').waitFor();},close=()=>detail.locator('.mfoot').getByRole('button',{name:'닫기',exact:true}).click();
  const sheet=uid=>page.evaluate(async uid=>(await import('/src/repositories/proposals.js')).getProposal('birdseye-sheet').parts[0].layouts.find(item=>item.uid===uid),uid);
  const live=()=>detail.locator('[data-birdseye-live="ready"]').waitFor({timeout:120000});
  const pins=()=>detail.locator('.birdseye-live-pin').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y)];}));
  const rotate=async()=>{const box=await detail.locator('.birdseye-live-host').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.93);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+160,box.y+box.height*.93-10,{steps:8});await page.mouse.up();};
  const toggle=name=>detail.getByRole('button',{name,exact:true});

  // ── 표준 제안서 조감도(범례) 시트: 편집 팝업
  await open('std');await live();
  assert.equal(await detail.locator('[data-birdseye-mode]').getAttribute('data-birdseye-mode'),'side');assert.equal((await pins()).length,6);
  await page.screenshot({path:path.join(output,'standard-side.png'),animations:'disabled'});
  await toggle('중앙 조감도로 바꾸기').click();await detail.locator('[data-birdseye-mode="center"]').waitFor();
  assert.equal((await sheet('std')).ov.spatialMode,'center');assert.equal(await detail.locator('[data-birdseye-overlay="card"]').count(),6);
  const geometry=await detail.evaluate(node=>{const slide=node.querySelector('.slide').getBoundingClientRect(),slot=node.querySelector('[data-img="0"]').getBoundingClientRect(),k=slide.width/1280;return {centre:(slot.x+slot.width/2-slide.x)/k,width:slot.width/k,cards:[...node.querySelectorAll('[data-birdseye-overlay="card"]')].map(card=>{const r=card.getBoundingClientRect();return (r.x+r.width/2-slide.x)/k;})};});
  assert(Math.abs(geometry.centre-640)<2,'조감도가 가운데');assert(geometry.width>840,'조감도가 좌우 형태(816)보다 크다');assert.equal(geometry.cards.filter(x=>x<640).length,3);assert.equal(geometry.cards.filter(x=>x>640).length,3);
  assert.equal(await detail.locator('.birdseye-live-marks polyline').count(),6);
  await page.screenshot({path:path.join(output,'standard-center.png'),animations:'disabled'});
  pass('standard legend sheet: the toggle is saved on the sheet and redraws the same content as a centred aerial with six bubbles and elbow arrows');
  assert.equal((await sheet('std')).adaptation.phase,'retained');assert(await toggle('좌우 배치로 바꾸기').isEnabled(),'switching the arrangement does not queue an AI rewrite');
  const until=async(test,label)=>{for(let i=0;i<60;i++){if(await test())return;await page.waitForTimeout(250);}throw new Error('timeout: '+label);};
  const before=await pins();await rotate();await until(async()=>!!(await sheet('std')).ov.spatial?.camera,'turned view saved');
  const after=await pins(),turned=await sheet('std');assert.notDeepEqual(after,before);assert.equal(turned.ov.spatial.view,'3d');assert.notEqual(turned.ov.img[0].src,standard.img[0].src);assert.equal(turned.ov.spatial.scene.rooms.length,6);assert.equal(turned.ov.spatialMode,'center');
  await page.waitForTimeout(300);assert.equal(await detail.locator('[data-birdseye-overlay="card"]').count(),6);
  await page.screenshot({path:path.join(output,'standard-center-rotated.png'),animations:'disabled'});
  pass('editing: dragging the aerial rotates it, pins and arrows follow, and the turned view is saved as this sheet\'s own copy');
  // 말풍선 끌어 옮기기 — 자리가 시트에 저장되고(다시 쓰기 없음), 글 칸 · 화살표가 따라간다
  const cardBox=async i=>detail.locator('[data-birdseye-overlay="card"]').nth(i).boundingBox(),scale=async()=>(await detail.locator('.slide').boundingBox()).width/1280;
  const dragBy=async(box,dx,dy)=>{await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+dx/2,box.y+box.height*.5+dy/2,{steps:4});assert.equal(await detail.locator('.birdseye-live-ghost').count(),1);await page.mouse.move(box.x+box.width*.5+dx,box.y+box.height*.5+dy,{steps:4});await page.mouse.up();};
  const card0=await cardBox(0),k0=await scale();await dragBy(card0,170*k0,-60*k0);
  await until(async()=>!!(await sheet('std')).ov.spatialBubbles,'bubble place saved');
  const placedSheet=await sheet('std'),spots=Object.entries(placedSheet.ov.spatialBubbles);assert.equal(spots.length,1);assert.equal(placedSheet.adaptation.phase,'retained');
  await page.waitForTimeout(200);const card0b=await cardBox(0);assert(Math.abs(card0b.x-card0.x-170*k0)<3&&Math.abs(card0b.y-card0.y+60*k0)<3,'the bubble sits where it was dropped');
  const rowTb=4+2*Number(spots[0][0]),nameBox=await detail.locator('[data-tb="'+rowTb+'"]').boundingBox();assert(nameBox.x>card0b.x&&nameBox.x<card0b.x+card0b.width&&nameBox.y>card0b.y&&nameBox.y<card0b.y+card0b.height,'its text moves with it');
  assert.equal(await detail.locator('.birdseye-live-marks polyline').count(),6);assert.equal(await detail.locator('.birdseye-live-selected').count(),0);
  await page.screenshot({path:path.join(output,'standard-center-bubble-moved.png'),animations:'disabled'});
  await detail.getByRole('button',{name:'말풍선 자리 되돌리기',exact:true}).click();await until(async()=>!(await sheet('std')).ov.spatialBubbles,'bubble places cleared');
  await page.waitForTimeout(200);assert(Math.abs((await cardBox(0)).x-card0.x)<2);await dragBy(await cardBox(0),170*k0,-60*k0);await until(async()=>!!(await sheet('std')).ov.spatialBubbles,'bubble place saved again');
  pass('centred form: a bubble is dragged to a new place with its text and arrow, the place is saved on the sheet without an AI rewrite, and can be reset');
  // 공간 자리 바꾸기 — 번호 핀을 끌어 다른 공간 위에 놓는다. 번호 · 글은 공간을 따라간다
  const pinBox=n=>detail.locator('.birdseye-live-pin[data-birdseye-pin="'+n+'"]').boundingBox(),centre=box=>[box.x+box.width/2,box.y+box.height/2];
  const beforeSwap=await sheet('std'),roomAt=(x,id)=>{const r=x.ov.spatial.scene.rooms.find(room=>room.id===id);return [r.x,r.z];},[idA,idB]=beforeSwap.ov.spatial.roomIds;
  const [ax,ay]=centre(await pinBox(1)),[bx,by]=centre(await pinBox(2));
  await page.mouse.move(ax,ay);await page.mouse.down();await page.mouse.move((ax+bx)/2,(ay+by)/2,{steps:4});assert.equal(await detail.locator('.birdseye-live-roomdrag').count(),1);await page.mouse.move(bx,by,{steps:4});assert.equal(await detail.locator('.birdseye-live-pin.over').count(),1);await page.mouse.up();
  await until(async()=>{const now=await sheet('std');return JSON.stringify(roomAt(now,idA))===JSON.stringify(roomAt(beforeSwap,idB));},'rooms swapped and saved');
  const afterSwap=await sheet('std');assert.deepEqual(roomAt(afterSwap,idB),roomAt(beforeSwap,idA));assert.deepEqual(afterSwap.ov.spatial.roomIds,beforeSwap.ov.spatial.roomIds);assert.deepEqual(afterSwap.ov.t,beforeSwap.ov.t);
  assert.equal(afterSwap.ov.spatial.scene.objects.filter(o=>o.roomId===idA).length,beforeSwap.ov.spatial.scene.objects.filter(o=>o.roomId===idA).length);
  await page.waitForTimeout(400);const [ax2,ay2]=centre(await pinBox(1)),[bx2,by2]=centre(await pinBox(2));assert(Math.hypot(ax2-bx,ay2-by)<Math.hypot(ax2-ax,ay2-ay),'pin 1 moved to where pin 2 was');assert(Math.hypot(bx2-ax,by2-ay)<Math.hypot(bx2-bx,by2-by));
  await page.screenshot({path:path.join(output,'standard-center-rooms-swapped.png'),animations:'disabled'});
  pass('editing: dragging a number pin onto another space swaps the two spaces (objects included); numbers and texts follow the spaces and the result is saved');
  // 공간을 빈 칸으로 — 번호 핀을 끌면 놓을 수 있는 빈 칸이 보이고, 놓으면 배치 자체가 바뀐다 (새 줄)
  const [gx,gy]=centre(await pinBox(3)),idC=afterSwap.ov.spatial.roomIds[2];
  await page.mouse.move(gx,gy);await page.mouse.down();await page.mouse.move(gx+20,gy+20,{steps:4});
  const cells=await detail.locator('.birdseye-live-slot').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),[row,col]=node.dataset.birdseyeSlot.split(':').map(Number);return {row,col,x:r.x+r.width/2,y:r.y+r.height/2};}));
  assert(cells.length>=4,'empty cells are offered while dragging a pin');const lowest=cells.sort((a,b)=>b.row-a.row||a.col-b.col)[0];
  await page.mouse.move(lowest.x,lowest.y,{steps:8});assert.equal(await detail.locator('.birdseye-live-slot.over').getAttribute('data-birdseye-slot'),lowest.row+':'+lowest.col);await page.mouse.up();
  await until(async()=>(await sheet('std')).ov.spatial.scene.depth>afterSwap.ov.spatial.scene.depth,'new arrangement saved');
  const arranged=await sheet('std'),alone=arranged.ov.spatial.scene.rooms.find(room=>room.id===idC);
  assert(arranged.ov.spatial.scene.rooms.every(room=>room===alone||room.z<alone.z),'the space sits in a new row');assert(arranged.ov.spatial.scene.depth>afterSwap.ov.spatial.scene.depth);
  assert.deepEqual(arranged.ov.spatial.roomIds,afterSwap.ov.spatial.roomIds);assert.deepEqual(arranged.ov.t,afterSwap.ov.t);assert.equal(arranged.ov.spatial.scene.objects.filter(o=>o.roomId===idC).length,afterSwap.ov.spatial.scene.objects.filter(o=>o.roomId===idC).length);
  await page.waitForTimeout(500);assert.equal((await pins()).length,6,'every space is still in view after the arrangement changed');
  const hostNow=await detail.locator('.birdseye-live-host').boundingBox();for(const [x,y] of await pins())assert(x>hostNow.x-12&&x<hostNow.x+hostNow.width&&y>hostNow.y-12&&y<hostNow.y+hostNow.height,'pins stay inside the aerial');
  await page.screenshot({path:path.join(output,'standard-center-room-placed.png'),animations:'disabled'});
  pass('editing: dragging a number pin onto an empty cell moves that space there — the arrangement changes (a new row), the view refits and the result is saved');
  const text=detail.locator('[data-tb="5"]');await text.click();await text.fill('버블에서 고친 설명');await text.press('Enter');assert.equal((await sheet('std')).ov.t[5],'버블에서 고친 설명');
  await toggle('좌우 배치로 바꾸기').click();await detail.locator('[data-birdseye-mode="side"]').waitFor();assert.equal((await sheet('std')).ov.spatialMode,undefined);assert.equal(await detail.locator('[data-tb="5"]').innerText(),'버블에서 고친 설명');
  await toggle('중앙 조감도로 바꾸기').click();await detail.locator('[data-birdseye-mode="center"]').waitFor();
  const pptx=await page.evaluate(async()=>{const x=(await import('/src/repositories/proposals.js')).getProposal('birdseye-sheet').parts[0].layouts[0],{exportPptx}=await import('/src/domain/slides/export-pptx.js');return Array.from(new Uint8Array(await(await exportPptx([{f:x.f,ov:x.ov,part:'공간별 제안'}])).arrayBuffer()));});
  const bytes=Buffer.from(pptx),xml=await(await JSZip.loadAsync(bytes)).file('ppt/slides/slide1.xml').async('string');assert(xml.includes('버블에서 고친 설명'));assert(xml.includes('<p:pic>'));assert((xml.match(/<p:sp>/g)||[]).length>=30);fs.writeFileSync(path.join(output,'standard-center.pptx'),bytes);
  await close();
  pass('text edited in a bubble survives switching back and forth, and the centred form exports to PowerPoint with bubbles, arrows and the picture');

  // ── 공간·제품 연결 시트(L_SPATIAL_3D): 오브젝트 선택 · 이동
  await open('link');await live();assert.equal((await pins()).length,(await sheet('link')).ov.spatial.roomIds.length);
  const objects=await page.evaluate(async()=>{const x=(await import('/src/repositories/proposals.js')).getProposal('birdseye-sheet').parts[0].layouts[1].ov.spatial;return {scene:x.scene.objects.map(o=>[o.id,o.x,o.z]),anchors:x.anchors};});
  const hostBox=await detail.locator('.birdseye-live-host').boundingBox();
  let moved=null;
  for(const [id] of objects.scene){
    const point=objects.anchors.objects[id];if(!point||point.visible===false)continue;
    const x=hostBox.x+point.x/objects.anchors.width*hostBox.width,y=hostBox.y+point.y/objects.anchors.height*hostBox.height;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y+12,{steps:6});await page.mouse.up();await page.waitForTimeout(900);
    const now=(await sheet('link')).ov.spatial.scene.objects;moved=now.find(o=>{const old=objects.scene.find(item=>item[0]===o.id);return old&&(old[1]!==o.x||old[2]!==o.z);});
    if(moved)break;
  }
  assert(moved,'an object dragged in the sheet moves in the sheet copy');
  await page.screenshot({path:path.join(output,'link-moved.png'),animations:'disabled'});
  await toggle('중앙 조감도로 바꾸기').click();await detail.locator('[data-birdseye-mode="center"]').waitFor();assert((await detail.locator('[data-birdseye-overlay="card"]').count())>=1);
  await page.screenshot({path:path.join(output,'link-center.png'),animations:'disabled'});await close();
  pass('space-product sheet: an object can be picked up and moved in the sheet, and the sheet switches to the centred form');

  // ── 미리 만들어진 시트(샘플 표준 제안서): 읽기 전용 — 전환 · 회전만, 저장 없음
  const stored=JSON.stringify(await sheet('std'));
  await page.evaluate(()=>localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'scenarios'}})));await page.goto(base+'/');
  await page.locator('.bsg-card[data-req="std"]').click();await page.getByRole('button',{name:'외식 프랜차이즈 · AI 퀵서비스 표준 제안서 상세 보기',exact:true}).click();
  await page.locator('.sbs-th[aria-label*="공간 조감도"]').first().click();await page.locator('.sbs-sheet').click();
  const view=page.locator('.modal.sheet').filter({has:page.locator('.tl-detail')});await view.locator('[data-birdseye-live="ready"]').waitFor({timeout:120000});
  const viewPins=()=>view.locator('.birdseye-live-pin').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y)];}));
  assert.equal(await view.locator('[data-birdseye-mode]').getAttribute('data-birdseye-mode'),'side');assert.equal(await view.locator('[contenteditable="true"]').count(),0);
  await view.getByRole('button',{name:'중앙 조감도로 보기',exact:true}).click();await view.locator('[data-birdseye-mode="center"]').waitFor();assert.equal(await view.locator('[data-birdseye-overlay="card"]').count(),6);
  const still=await viewPins(),box=await view.locator('.birdseye-live-host').boundingBox();
  // 오브젝트 위에서 끌어도 옮겨지지 않고(읽기 전용) 조감도가 돈다
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+150,box.y+box.height*.5+6,{steps:8});await page.mouse.up();
  await page.waitForTimeout(900);const spun=await viewPins();assert.equal(spun.length,6);assert.notDeepEqual(spun,still);assert.equal(await view.locator('.birdseye-live-selected').count(),0);
  assert.equal(await view.locator('[data-birdseye-overlay="card"]').count(),6);
  await page.screenshot({path:path.join(output,'readonly-center-rotated.png'),animations:'disabled'});
  await view.getByRole('button',{name:'좌우 배치로 보기',exact:true}).click();await view.locator('[data-birdseye-mode="side"]').waitFor();
  await view.locator('.mfoot').getByRole('button',{name:'닫기',exact:true}).click();
  assert.equal(JSON.stringify(await sheet('std')),stored);
  pass('ready-made standard sheet (read-only): both arrangements can be viewed and the aerial turns, nothing is editable, movable or saved');

  // ── 표준 건물 조감도(공간 7~10개): 3D는 없고 전환만 — 버블이 겹치지 않고 모두 화살표로 이어진다
  const tall=await page.evaluate(async building=>{
    const {layoutHtml}=await import('/src/services/catalog.js'),{applyOverrides}=await import('/src/domain/slides/Slide.jsx'),{birdseyeSceneKey}=await import('/src/services/birdseye-sheet.js');
    const host=document.createElement('div');host.id='birdseye-building';host.style.cssText='position:fixed;left:0;top:0;width:1280px;height:720px;z-index:99999;background:#fff';host.innerHTML=layoutHtml(building.f);document.body.appendChild(host);
    applyOverrides(host.firstElementChild,{t:building.t,img:building.img,spatialMode:'center'},1);
    const boxes=[...host.querySelectorAll('[data-birdseye-overlay="card"]')].map(card=>card.getBoundingClientRect());
    const overlap=boxes.some((a,i)=>boxes.some((b,j)=>i<j&&a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom));
    const names=[...host.querySelectorAll('[data-tb]')].filter(node=>getComputedStyle(node).display!=='none').map(node=>node.textContent);
    return {mode:host.firstElementChild.getAttribute('data-birdseye-mode'),cards:boxes.length,overlap,links:host.querySelectorAll('[data-birdseye-overlay="link"] svg').length,live:birdseyeSceneKey({img:building.img}),legend:names.includes('공간 · 대표 제품')};
  },building);
  const rooms=Number(building.f.slice(11));assert.equal(tall.mode,'center');assert.equal(tall.cards,rooms);assert.equal(tall.links,rooms);assert.equal(tall.overlap,false);assert.equal(tall.live,null);assert.equal(tall.legend,false);
  await page.locator('#birdseye-building').screenshot({path:path.join(output,'building-center.png'),animations:'disabled'});await page.evaluate(()=>document.getElementById('birdseye-building').remove());
  pass('standard building aerial ('+rooms+' spaces): the centred form places every bubble without overlap and links each one; it has no 3D scene');

  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:true,checks,errors},null,2));
}catch(error){await page?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({ok:false,checks,errors,error:String(error.stack||error)},null,2));throw error;}
finally{await browser?.close();await server.close();api.kill('SIGTERM');await new Promise(resolve=>api.exitCode!=null?resolve():api.once('close',resolve));fs.rmSync(temporary,{recursive:true,force:true});}
