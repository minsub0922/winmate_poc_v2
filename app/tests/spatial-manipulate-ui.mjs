// 공간 스튜디오 — 선택한 오브젝트를 말풍선 버튼과 단축키로 회전 · 복제 · 이동 · 삭제한다.
import assert from 'node:assert/strict';
import {openApp,library} from './fixtures/birdseye/harness.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';

const app=await openApp('spatial-manipulate'),{page,api,pass,output,base}=app;
try{
  const scene=createScene({templateId:'cowork-full-standard'},library);
  const record=await api.post('/api/spatial/history',{scene,view:'2d',form:studioFormFromScene(scene)});
  // 벽에서 떨어져 있어 돌리고 옮길 여유가 있는 수목(라운지 오른쪽 아래)
  const plants=scene.objects.filter(o=>o.assetId==='furniture:plant'),plant=plants.find(o=>o.roomId===scene.rooms[3].id)||plants[0];
  await page.goto(base+'/spatial/'+record.id);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  const count=()=>page.locator('.sp-plan-image [data-object-id]').count();
  const readout=async()=>{const text=await page.locator('.sp-object-popover .sp-object-coordinates').textContent();const m=text.match(/X ([\d.-]+)m · Z ([\d.-]+)m · 높이 [\d.]+m · 회전 (-?\d+)°/);return {x:Number(m[1]),z:Number(m[2]),rotation:Number(m[3])};};
  const select=async id=>{await page.locator(`.sp-plan-image [data-object-id="${id}"]`).first().click();await page.locator('.sp-object-popover').waitFor();};
  const settle=()=>page.waitForTimeout(250);

  await select(plant.id);
  const tools=page.getByRole('group',{name:'오브젝트 조작'});await tools.waitFor();
  const start=await readout(),before=await count();
  await tools.getByRole('button',{name:'오른쪽으로 90° 회전'}).click();await settle();
  assert.equal((await readout()).rotation,(start.rotation+90)%360);
  await tools.getByRole('button',{name:'오른쪽으로 15° 회전'}).click();await settle();assert.equal((await readout()).rotation,(start.rotation+105)%360);
  await tools.getByRole('button',{name:'왼쪽으로 15° 회전'}).click();await settle();assert.equal((await readout()).rotation,(start.rotation+90)%360);
  await page.screenshot({path:output+'/popover.png'});
  pass('the selection popover rotates the object by 90° and ±15°');

  await tools.getByRole('button',{name:'복제'}).click();await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,before+1);
  await page.locator('.sp-object-popover').waitFor();
  pass('the duplicate button adds a copy in the same room and selects it');
  await page.getByRole('button',{name:'실행 취소'}).click();await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,before);

  // 단축키 — 처리한 키는 뒤로 새지 않는다
  await select(plant.id);
  await page.evaluate(()=>{window.__leaked=[];document.addEventListener('keydown',e=>window.__leaked.push(e.code));});
  const r0=await readout();
  await page.keyboard.press('r');await settle();assert.equal((await readout()).rotation,(r0.rotation+90)%360);
  await page.keyboard.press('ArrowRight');await settle();const moved=await readout();assert.equal(Math.round((moved.x-r0.x)*100),5);assert.equal(moved.z,r0.z);
  await page.keyboard.press('Shift+ArrowLeft');await settle();assert.equal(Math.round(((await readout()).x-moved.x)*100),-50);
  await page.keyboard.press('ArrowDown');await settle();assert.equal(Math.round(((await readout()).z-r0.z)*100),5);
  await page.keyboard.press('ArrowUp');await settle();assert.equal(Math.round(((await readout()).z-r0.z)*100),0);
  await page.keyboard.press('ControlOrMeta+d');await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,before+1);
  await page.keyboard.press('Delete');await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,before);
  assert.deepEqual((await page.evaluate(()=>window.__leaked)).filter(code=>!/^(Shift|Meta|Control|Alt)/.test(code)),[],'handled keys never reach listeners behind the studio');
  pass('R, arrows (5cm, Shift 50cm), Ctrl/⌘+D and Delete act on the selected object and do not leak to the page behind');

  // 글자를 입력하는 중이거나 다른 창이 떠 있으면 단축키는 동작하지 않는다
  await select(plant.id);const typed=await readout();
  const editor=page.getByRole('combobox',{name:'조감도 편집 프롬프트'});await editor.click();await editor.pressSequentially('r');
  assert.match(await editor.textContent(),/r/);
  await select(plant.id);assert.equal((await readout()).rotation,typed.rotation);
  await page.getByRole('button',{name:'제품 · 가구 오브젝트'}).click();await page.getByRole('dialog').first().waitFor();
  await page.keyboard.press('r');await settle();
  await page.keyboard.press('Escape');await page.locator('.sp-view[data-ready=true]').waitFor();
  await select(plant.id);assert.equal((await readout()).rotation,typed.rotation);
  pass('shortcuts stay off while typing a command or while another dialog is open');
  // 입력창의 태그 칩에 포커스가 있으면 Backspace는 칩을 지운다 — 선택한 오브젝트가 아니라
  await editor.click();for(let i=0;i<3;i++)await editor.press('Backspace');
  await editor.pressSequentially('@수목');await page.locator('#sp-mention-options [data-mention-kind=object]').first().click();
  await select(plant.id);const chipsBefore=await page.locator('.sp-mention-chip').count(),objectsBefore=await count();assert.equal(chipsBefore,1);
  await page.locator('.sp-mention-chip').first().focus();await page.keyboard.press('Backspace');await settle();
  assert.equal(await count(),objectsBefore,'the selected object is not deleted');assert.equal(await page.locator('.sp-mention-chip').count(),0,'the chip is');
  await page.locator('.sp-mention-chip').count();await page.keyboard.press('Escape');
  pass('Backspace on a focused tag chip removes the tag, never the selected object');

  // 벽에 막힌 방향으로는 가지 않고 알려 준다
  const edge=plants.find(o=>o.id!==plant.id)||plant;await select(edge.id);const e0=await readout();
  for(let i=0;i<40;i++)await page.keyboard.press('Shift+ArrowLeft');
  await settle();const e1=await readout();assert(e1.x<=e0.x);assert(e1.x>=0);
  await page.getByText('그 방향으로는 더 옮길 자리가 없어요.').first().waitFor();
  pass('an arrow move stops at the wall and says so');

  assert.deepEqual(app.errors,[]);
  console.log(JSON.stringify({ok:true,checks:app.checks.length,output}));
}finally{await app.close();}
