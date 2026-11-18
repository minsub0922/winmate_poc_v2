// 공간 조감도 스튜디오 화면 구성 — 세로 스크롤 없는 한 화면 · 시뮬레이션 위 도구(2D/3D · 회전/이동 · 공간 추가)
// · 공간 이름표 메뉴(스타일 변경 · 삭제, 둘 다 확인 팝업) · 이름표 끌어 자리 바꾸기 · 오른쪽 고정 오브젝트 목록(1~3열, 브라우저에 저장).
import assert from 'node:assert/strict';
import {openApp,library} from './fixtures/birdseye/harness.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';
import {STYLES} from '../web/src/domain/spatial/geometry.js';

const app=await openApp('birdseye-studio-layout',{viewport:{width:1440,height:900}}),{page,api,pass,output,base,errors}=app;
try{
  const scene=createScene({templateId:'cowork-full-standard'},library),form=studioFormFromScene(scene);
  const record=await api.post('/api/spatial/history',{scene,view:'3d',form});
  await page.goto(base+'/spatial/'+record.id);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  await page.locator('[data-room-label]').first().waitFor();
  await page.screenshot({path:output+'/studio.png'});

  // 1. 한 화면 — 머리(뒤로 가기)와 시뮬레이션 사이 · 시뮬레이션과 입력창 사이에 아무것도 없다
  const scroll=await page.evaluate(()=>{const el=document.querySelector('.sp-studio-page');return {scroll:el.scrollHeight,client:el.clientHeight,doc:document.documentElement.scrollHeight,win:innerHeight};});
  assert(scroll.scroll<=scroll.client+1,'no vertical scroll in the studio '+JSON.stringify(scroll));assert(scroll.doc<=scroll.win+1);
  for(const gone of ['.sp-canvas-toolbar','.sp-canvas-title','.sp-room-strip','.sp-object-trigger','.sp-view-help'])assert.equal(await page.locator(gone).count(),0,gone);
  const box=sel=>page.locator(sel).first().boundingBox();
  const header=await box('.sp-topbar'),canvas=await box('.be-canvas'),prompt=await box('.sp-prompt'),view=await box('.sp-view');
  assert(Math.abs(canvas.y-(header.y+header.height+10))<=2,'the simulator starts right under the header');
  assert(Math.abs(prompt.y-(canvas.y+canvas.height))<=2,'the command input sits right under the simulator');
  assert(Math.abs(view.height-canvas.height)<=2&&Math.abs(view.width-canvas.width)<=2,'the view fills the canvas');
  pass('the studio fits one screen: header, simulator, command input — nothing in between, no vertical scroll');

  // 왼쪽 위 2D/3D 탭 · 오른쪽 위 회전/이동 탭 + 공간 추가
  const left=await box('.be-canvas-left'),right=await box('.be-canvas-right');
  assert(left.x-canvas.x<=16&&left.y-canvas.y<=16,'2D/3D tabs at the top-left');
  assert(canvas.x+canvas.width-(right.x+right.width)<=16&&right.y-canvas.y<=16,'tools at the top-right');
  const tabs=page.getByRole('tablist',{name:'보기'});
  assert.equal(await tabs.getByRole('tab',{name:'3D'}).getAttribute('aria-selected'),'true');
  const modes=page.getByRole('tablist',{name:'마우스 끌기 동작'}),add=page.getByRole('button',{name:'공간 추가'});
  assert.equal(await modes.getByRole('tab',{name:'회전'}).getAttribute('aria-selected'),'true','rotate is the default');
  const [modeBox,addBox]=[await modes.boundingBox(),await add.boundingBox()];assert(modeBox.x+modeBox.width<=addBox.x,'rotate/pan sits left of 공간 추가');
  pass('2D/3D tabs at the top-left; rotate/pan tabs (rotate by default) left of 공간 추가 at the top-right');

  // 5. 회전 · 이동 — 빈 곳 끌기가 시점을 돌리거나 화면을 옮긴다
  const drag=async(dx,dy)=>{const c=view;await page.mouse.move(c.x+c.width*.5,c.y+c.height*.9);await page.mouse.down();await page.mouse.move(c.x+c.width*.5+dx,c.y+c.height*.9+dy,{steps:8});await page.mouse.up();};
  await page.screenshot({path:output+'/rotate-before.png'});
  const label=page.locator('[data-room-label]').first(),labelAt=async()=>{const b=await label.boundingBox();return [Math.round(b.x),Math.round(b.y)];};
  let before=await labelAt();await drag(160,0);const rotated=await labelAt();assert.notDeepEqual(rotated,before,'rotate moves the view');
  await modes.getByRole('tab',{name:'이동'}).click();assert.equal(await modes.getByRole('tab',{name:'이동'}).getAttribute('aria-selected'),'true');
  const labels=async()=>Promise.all((await page.locator('[data-room-label]').all()).map(async l=>{const b=await l.boundingBox();return [b.x,b.y];}));
  before=await labels();await drag(120,40);const panned=await labels();
  const deltas=panned.map((p,i)=>[p[0]-before[i][0],p[1]-before[i][1]]);
  assert(deltas.every(d=>Math.abs(d[0]-deltas[0][0])<3&&Math.abs(d[1]-deltas[0][1])<3)&&Math.abs(deltas[0][0])>60,'pan shifts every label by the same offset '+JSON.stringify(deltas));
  await modes.getByRole('tab',{name:'회전'}).click();
  await tabs.getByRole('tab',{name:'2D'}).click();await page.locator('.sp-view-2d').waitFor();
  await page.screenshot({path:output+'/plan-2d.png'});assert.equal(await modes.count(),0,'rotate/pan only in 3D');assert(await page.locator('[data-room-label]').count()===scene.rooms.length,'2D has the same room labels');
  await tabs.getByRole('tab',{name:'3D'}).click();await page.locator('.sp-view-3d[data-ready=true]').waitFor();
  pass('rotate turns the view, pan shifts it as a whole; the switch shows only in 3D, 2D keeps the room labels');

  // 2. 공간 이름표 → 바로 아래 메뉴(스타일 변경 · 삭제) — 프롬프트에 태그하지 않는다
  const first=scene.rooms[0],firstLabel=page.locator(`[data-room-label="${first.id}"]`);
  await firstLabel.click();const menu=page.locator('.sp-room-menu');await menu.waitFor();
  const [lb,mb]=[await firstLabel.boundingBox(),await menu.boundingBox()];
  assert(mb.y>=lb.y+lb.height-2&&mb.y-(lb.y+lb.height)<16,'the menu opens right under the label');
  assert(Math.abs((mb.x+mb.width/2)-(lb.x+lb.width/2))<4||mb.x<=12||mb.x+mb.width>=canvas.x+canvas.width-12,'centered under the label');
  assert.equal(await page.locator('.sp-prompt .sp-mention-chip, .sp-prompt [data-mention-id]').count(),0,'no prompt tag');
  assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),['공간 스타일 변경','공간 삭제']);
  await page.screenshot({path:output+'/room-menu.png'});
  pass('clicking a room name opens a menu right under it with 공간 스타일 변경 · 공간 삭제 (no prompt tag)');

  // 스타일 변경 — 고른 뒤 확인 팝업, 취소하면 그대로, 변경하면 그 공간만 바뀌고 저장된다
  const target=Object.keys(STYLES).find(k=>k!==scene.style);
  await menu.getByRole('menuitem',{name:'공간 스타일 변경'}).click();
  await menu.getByRole('menuitemradio',{name:STYLES[target].name}).click();
  const confirm=page.locator('.be-style-confirm');await confirm.waitFor();await page.screenshot({path:output+'/style-confirm.png'});
  await confirm.getByRole('button',{name:'취소'}).click();await confirm.waitFor({state:'detached'});
  await page.waitForTimeout(1900);assert.equal((await api.get('/api/spatial/history/'+record.id)).revision,record.revision,'cancel keeps the scene');
  await firstLabel.click();await menu.getByRole('menuitem',{name:'공간 스타일 변경'}).click();await menu.getByRole('menuitemradio',{name:STYLES[target].name}).click();
  await confirm.getByRole('button',{name:'변경'}).click();await confirm.waitFor({state:'detached'});
  let saved;for(let i=0;i<40&&!saved;i++){await page.waitForTimeout(250);const r=await api.get('/api/spatial/history/'+record.id);if(r.scene.rooms.some(room=>room.style))saved=r;}
  assert(saved,'the change is saved');assert.equal(saved.scene.rooms.find(r=>r.id===first.id).style,target);
  assert(saved.scene.rooms.filter(r=>r.id!==first.id).every(r=>!r.style),'only that room');assert.equal(saved.scene.style,scene.style);
  await page.screenshot({path:output+'/style-changed.png'});
  pass('style change asks for confirmation first; cancel keeps everything, confirm restyles only that room and saves');

  // 3. 이름표를 끌어 다른 공간 위에 놓으면 두 공간이 자리를 바꾼다
  const second=scene.rooms[1],secondLabel=page.locator(`[data-room-label="${second.id}"]`);
  const [from,to]=[await firstLabel.boundingBox(),await secondLabel.boundingBox()];
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});
  await page.locator('.sp-room-drag-ghost').waitFor();assert.equal(await secondLabel.getAttribute('class').then(c=>c.includes('is-drop-target')),true,'the drop target lights up');
  await page.screenshot({path:output+'/room-drag.png'});await page.mouse.up();
  let swapped;for(let i=0;i<40&&!swapped;i++){await page.waitForTimeout(250);const r=await api.get('/api/spatial/history/'+record.id);if(r.scene.rooms[0].id===second.id)swapped=r;}
  assert(swapped,'the order is saved');assert.equal(swapped.scene.rooms[1].id,first.id);
  const [a,b]=[swapped.scene.rooms.find(r=>r.id===first.id),swapped.scene.rooms.find(r=>r.id===second.id)];
  assert.equal(a.style,target,'the style moves with the room');assert(b.x<a.x||b.z<a.z,'the rooms traded places');
  assert.equal(await page.locator('.sp-room-menu').count(),0,'dragging does not open the menu');
  pass('dragging a room label onto another room swaps the two rooms (layouts and style move along) and saves');

  // 3-1. 이름표를 빈 칸(끄는 동안 보이는 점선 자리)에 놓으면 그 자리로 옮긴다 — 배치 자체가 바뀐다 (새 줄)
  const depthBefore=swapped.scene.depth,objectsBefore=swapped.scene.objects.filter(o=>o.roomId===first.id).length,grab=await firstLabel.boundingBox();
  await page.mouse.move(grab.x+grab.width/2,grab.y+grab.height/2);await page.mouse.down();await page.mouse.move(grab.x+grab.width/2+30,grab.y+grab.height/2+30,{steps:4});
  const slots=await page.locator('.sp-room-slot').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),[row,col]=node.dataset.roomSlot.split(':').map(Number);return {row,col,x:r.x+r.width/2,y:r.y+r.height/2};}));
  assert(slots.length>=4,'empty cells are offered while dragging');const below=slots.sort((a,b)=>b.row-a.row||a.col-b.col)[0];
  await page.mouse.move(below.x,below.y,{steps:10});assert.equal(await page.locator('.sp-room-slot.is-drop-target').getAttribute('data-room-slot'),below.row+':'+below.col);
  await page.screenshot({path:output+'/room-drag-slot.png'});await page.mouse.up();
  let placed;for(let i=0;i<40&&!placed;i++){await page.waitForTimeout(250);const r=await api.get('/api/spatial/history/'+record.id);if(r.scene.rooms.find(room=>room.id===first.id).cell)placed=r;}
  assert(placed,'the new arrangement is saved');const lone=placed.scene.rooms.find(r=>r.id===first.id);
  assert(placed.scene.rooms.every(r=>r===lone||r.z<lone.z),'the room sits alone in a new row below');assert(placed.scene.depth>depthBefore);
  assert.deepEqual(placed.scene.rooms.map(r=>r.id),swapped.scene.rooms.map(r=>r.id),'room numbers stay');assert.equal(placed.scene.objects.filter(o=>o.roomId===first.id).length,objectsBefore);assert.equal(lone.style,target);
  await page.locator('.sp-view[data-ready=true]').waitFor();await page.screenshot({path:output+'/room-placed.png'});
  pass('dragging a room label onto an empty cell moves the room there — the arrangement itself changes (a new row) and is saved');

  // 삭제 — 확인 팝업 뒤에만, 실행 취소로 되돌릴 수 있다
  const rooms=await page.locator('[data-room-label]').count();
  await secondLabel.click();await menu.getByRole('menuitem',{name:'공간 삭제'}).click();
  const del=page.locator('.delete-confirmation');await del.waitFor();assert.match(await del.textContent(),new RegExp(second.name));
  await del.getByRole('button',{name:'취소'}).click();await del.waitFor({state:'detached'});assert.equal(await page.locator('[data-room-label]').count(),rooms);
  await secondLabel.click();await menu.getByRole('menuitem',{name:'공간 삭제'}).click();await del.getByRole('button',{name:'공간 삭제'}).click();
  await page.waitForFunction(n=>document.querySelectorAll('[data-room-label]').length===n,rooms-1);
  await page.getByRole('button',{name:'실행 취소'}).click();await page.waitForFunction(n=>document.querySelectorAll('[data-room-label]').length===n,rooms);
  pass('room delete asks for confirmation; cancel keeps it, confirm removes it, undo brings it back');

  // 공간 추가 — 오른쪽 위 버튼 → 용도 목록
  await add.click();const kinds=page.getByRole('menu',{name:'추가할 공간 용도'});await kinds.waitFor();
  await page.screenshot({path:output+'/add-room.png'});
  await kinds.getByRole('menuitem',{name:'회의실'}).click();
  await page.waitForFunction(n=>document.querySelectorAll('[data-room-label]').length===n,rooms+1);
  assert(await page.locator('[data-room-label]',{hasText:'회의실'}).count()>=1);
  pass('공간 추가 adds a room of the chosen type');

  // 4. 오른쪽 고정 오브젝트 목록 — 기본 2열, 손잡이로 1~3열, 새로고침해도 유지
  const panel=page.locator('.sp-objects-panel');assert(await panel.isVisible());assert.equal(await page.locator('.modal.sp-object-drawer').count(),0,'not a popup');
  const columns=()=>page.locator('.sp-objects-panel .sp-object-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.equal(await columns(),2,'two columns by default');
  const pb=await panel.boundingBox(),cb=await box('.be-canvas');assert(pb.x>cb.x+cb.width,'the list is right of the simulator');
  const handle=page.getByRole('separator',{name:/오브젝트 목록 폭/}),hb=await handle.boundingBox();
  const resize=async x=>{const hb=await handle.boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(x,hb.y+hb.height/2,{steps:10});await page.mouse.up();await page.waitForTimeout(200);};
  await resize(hb.x-600);assert.equal(await columns(),3,'max 3 columns');await page.screenshot({path:output+'/panel-3.png'});
  await resize(1440-4);assert.equal(await columns(),1,'min 1 column');await page.screenshot({path:output+'/panel-1.png'});
  assert.equal(await page.evaluate(()=>localStorage.getItem('winmate.v2.spatial-studio.object-columns')),'1');
  await page.reload();await page.locator('.sp-objects-panel').waitFor();await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  assert.equal(await columns(),1,'the width survives a reload');
  const after=await page.evaluate(()=>{const el=document.querySelector('.sp-studio-page');return el.scrollHeight<=el.clientHeight+1;});assert(after,'still no vertical scroll');
  await handle.focus();await page.keyboard.press('ArrowLeft');assert.equal(await columns(),2,'keyboard widens');
  pass('the object list is fixed on the right (2 columns by default), the handle snaps it between 1 and 3 columns, and the browser remembers it');

  // 목록에서 골라 추가해도 패널은 그대로 남는다
  const card=page.locator('.sp-objects-panel .sp-object-card[aria-pressed]').first();await card.click();
  await page.locator('.sp-objects-panel').getByRole('button',{name:/선택한 1개 추가/}).click();
  await page.locator('.sp-objects-panel').getByText('0개 선택').waitFor();assert(await panel.isVisible());
  pass('adding from the list keeps the panel open and clears the selection');

  assert.deepEqual(errors,[]);
  await page.screenshot({path:output+'/final.png'});
}finally{await app.close();}
