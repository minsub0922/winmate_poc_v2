// 공간 스튜디오 — 왼쪽 카드 없이 시뮬레이터 + 명령 입력창. @ 태그(공간 · 제품 · 오브젝트)로 보낸 명령의 조작 목록이 장면을 실제로 바꾼다.
// 명령 해석 API는 가로채 정해 둔 조작을 돌려준다(실제 모델 점검은 spatial-command-live.mjs).
import assert from 'node:assert/strict';
import {openApp,fakeCommands,library} from './fixtures/birdseye/harness.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene,emptyStudioForm,newStudioRoom} from '../web/src/domain/spatial/studio-form.js';

const app=await openApp('spatial-command'),{page,api,pass,output,base}=app;
try{
  const scene=createScene({templateId:'cowork-full-standard'},library),form=studioFormFromScene(scene);
  // 저장된 입력 폼이 장면에서 뽑은 것과 조금 다른 기록(예전 스튜디오가 저장한 모양) — 열기만 해서는 다시 저장하면 안 된다
  const record=await api.post('/api/spatial/history',{scene,view:'2d',form:{...form,rooms:form.rooms.map(({kindEdited,...room})=>room)}});
  const plant=scene.objects.find(o=>o.assetId==='furniture:plant'),home=scene.rooms.find(r=>r.id===plant.roomId),other=scene.rooms.find(r=>r.id!==plant.roomId);
  let next=()=>[];
  const calls=await fakeCommands(app.context,(body,n)=>next(body,n));
  const objects=()=>page.locator('.sp-plan-image [data-object-id]').count();
  const editor=page.getByRole('combobox',{name:'조감도 편집 프롬프트'});
  const tag=async(text,kind,name)=>{await editor.pressSequentially('@'+text);const option=page.locator(`#sp-mention-options [data-mention-kind=${kind}]`,name?{hasText:name}:undefined).first();await option.waitFor();await option.click();};

  await page.goto(base+'/spatial/'+record.id);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  assert.equal(await page.locator('.sp-input-form,.sp-config,.sp-space-card').count(),0,'no input card');
  assert.equal(await page.locator('.sp-layout-extract').count(),0,'no layout extraction in the studio');
  assert.equal(await page.getByRole('button',{name:/조감도 만들기/}).count(),0);
  await editor.waitFor();await page.screenshot({path:output+'/studio.png',fullPage:true});
  pass('the studio is the simulator and the command input only — no input card, no generate button, no layout extraction');
  // 열기만 해서는 다시 저장하지 않는다(히스토리 순서가 바뀌지 않게)
  await page.waitForTimeout(1800);const untouched=await api.get('/api/spatial/history/'+record.id);
  assert.equal(untouched.revision,record.revision,'opening a record does not write it back');assert.equal(untouched.updated_at,record.updated_at);
  pass('opening a record leaves it untouched on the server');

  const before=await objects();assert(before>0);
  await editor.click();await editor.pressSequentially('@');await page.locator('.sp-mention-group').first().waitFor();
  assert.deepEqual(await page.locator('.sp-mention-group').allTextContents(),['공간','제품','오브젝트']);
  assert(await page.locator('#sp-mention-options [data-mention-kind=room]').count()>0);assert(await page.locator('#sp-mention-options [data-mention-kind=space]').count()>0);
  assert(await page.locator('#sp-mention-options [data-mention-kind=asset]').count()>0);assert(await page.locator('#sp-mention-options [data-mention-kind=object]').count()>0);
  await page.screenshot({path:output+'/mention-menu.png'});
  await editor.press('Backspace');
  pass('@ lists spaces, products and objects as three groups in one menu');

  // "@거실 에 @사람 2명 복사해" 꼴 — 공간 태그 + 오브젝트 태그 → copy 2
  next=body=>{const room=body.mentions.find(m=>m.kind==='room'),object=body.mentions.find(m=>m.kind==='object');return [{type:'copy',objectId:object.id,quantity:2,roomId:room.id}];};
  await tag(other.name.slice(0,2),'room',other.name);await editor.pressSequentially(' 에 ');await tag('수목','object');await editor.pressSequentially(' 2개 복사해');
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/spatial/command')),editor.press('Enter')]);
  await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,before+2);
  const sent=calls.at(-1);
  assert.deepEqual(sent.mentions.map(m=>m.kind),['room','object']);assert.equal(sent.mentions[0].id,other.id);assert.match(sent.prompt,/@\[.+\]\s+에 @\[.+\]\s+2개 복사해/);
  assert.equal(sent.view,'2d');assert.equal(sent.scene.objects.length,scene.objects.length);
  await page.getByText(/2개를 복제했어요/).first().waitFor();assert.equal((await editor.textContent()).trim(),'','the input clears after a successful command');
  await page.screenshot({path:output+'/after-copy.png',fullPage:true});
  await page.getByRole('button',{name:'실행 취소'}).click();await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,before);
  await page.getByRole('button',{name:'다시 실행'}).click();await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,before+2);
  pass('a tagged copy command adds two clones to the simulator, reports it, and undo/redo step over it as one change');
  // 나가지 않아도 저장된다 — 명령 · 조작 뒤 잠시 후 서버의 장면이 따라온다
  let autosaved=null;for(let i=0;i<24;i++){await page.waitForTimeout(500);autosaved=await api.get('/api/spatial/history/'+record.id);if(autosaved.scene.objects.length===scene.objects.length+2)break;}
  assert.equal(autosaved.scene.objects.length,scene.objects.length+2,'the commanded scene reaches the server without leaving the studio');
  pass('changes are saved shortly after each command, not only when leaving');

  // "@소파 오른쪽으로 옮겨" 꼴 — 방향 이동은 화면 기준(평면도 = 오른쪽 +X)
  const target=page.locator(`.sp-plan-image [data-object-id="${plant.id}"]`).first(),x0=(await target.boundingBox()).x;
  next=body=>[{type:'move',objectId:body.mentions.find(m=>m.kind==='object').id,direction:'right',distance:.3}];
  await editor.click();await tag('수목','object');await editor.pressSequentially(' 오른쪽으로 옮겨');
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/spatial/command')),editor.press('Enter')]);
  await page.waitForFunction(([id,x])=>{const node=document.querySelector(`.sp-plan-image [data-object-id="${id}"]`);return node&&node.getBoundingClientRect().x>x+2;},[plant.id,x0]);
  pass('a direction command moves the tagged object on screen');

  // 조작 없이 되묻는 답은 장면을 바꾸지 않고 문장을 보여 준다
  next=()=>({explanation:'어느 공간에 놓을까요?',operations:[]});const steady=await objects();
  await editor.click();await editor.pressSequentially('세탁기 3개 추가해');
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/spatial/command')),editor.press('Enter')]);
  await page.getByText('어느 공간에 놓을까요?').first().waitFor();assert.equal(await objects(),steady);assert.match(await editor.textContent(),/세탁기 3개 추가해/,'the sentence stays so it can be completed');
  // 적용할 수 없는 조작(없는 오브젝트)은 장면을 그대로 두고 이유를 알린다
  next=()=>[{type:'remove',objectId:'no-such-object'}];
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/spatial/command')),editor.press('Enter')]);
  await page.getByText(/찾지 못/).first().waitFor();assert.equal(await objects(),steady);
  pass('a clarifying answer or an inapplicable plan leaves the scene untouched and says why');

  // 한글 조합 중 Enter는 보내지 않는다
  const sentCount=calls.length;
  await editor.evaluate(node=>node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true})));
  await page.waitForTimeout(400);assert.equal(calls.length,sentCount);
  pass('Enter during Korean composition does not send the command');

  // 뒤로 가기 — 바뀐 장면이 서버에 저장된다(복제된 오브젝트의 ID · 사람 · 받침 관계가 서버 검증을 통과)
  await page.locator('.sp-mention-chip-remove').first().click().catch(()=>{});
  await page.getByRole('button',{name:'뒤로 가기'}).click();await page.waitForURL(u=>new URL(u).pathname==='/spatial');
  const saved=await api.get('/api/spatial/history/'+record.id);
  assert.equal(saved.scene.objects.length,scene.objects.length+2);assert.equal(saved.scene.objects.filter(o=>o.roomId===other.id&&o.assetId==='furniture:plant').length,scene.objects.filter(o=>o.roomId===other.id&&o.assetId==='furniture:plant').length+2);
  pass('leaving the studio saves the commanded scene on the server');

  // 빈 스튜디오 — 장면이 없어도 입력창이 켜져 있고 첫 공간을 명령으로 만든다
  const draft=await api.post('/api/spatial/drafts',{form:{...emptyStudioForm(),industry:'OF'},view:'3d'});
  await page.goto(base+'/spatial/'+draft.id);await page.locator('.sp-blank-canvas').waitFor({timeout:60000});
  assert.equal(await page.locator('.sp-view').count(),0);await editor.waitFor();assert.equal(await editor.getAttribute('aria-disabled'),'false');
  await page.screenshot({path:output+'/blank.png',fullPage:true});
  next=body=>{assert.equal(body.scene,null);assert.equal(body.industry,'OF');assert.deepEqual(body.mentions.map(m=>m.kind),['space']);return [{type:'room_add',kind:body.mentions[0].id,name:'대회의실',ref:'new-1'},{type:'add',assetId:'furniture:plant',roomId:'new-1',quantity:1}];};
  await editor.click();await tag('회의','space','회의실');await editor.pressSequentially(' 추가하고 수목 하나 놓아줘');
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/spatial/command')),editor.press('Enter')]);
  await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  await page.locator('.sp-room-strip button',{hasText:'대회의실'}).waitFor();
  await page.screenshot({path:output+'/first-room.png',fullPage:true});
  pass('a blank studio keeps the command input on and builds its first room from a command');

  // 예전 초안 — 장면 없이 입력만 있던 기록은 열 때 그 입력으로 장면을 만든다
  const room={...newStudioRoom('예전 회의실'),kind:'meeting'};
  const legacy=await api.post('/api/spatial/drafts',{form:{...emptyStudioForm(),industry:'OF',title:'예전 초안',rooms:[room]},view:'3d'});
  await page.goto(base+'/spatial/'+legacy.id);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  await page.locator('.sp-room-strip button',{hasText:'예전 회의실'}).waitFor();
  pass('an old draft that only had typed inputs opens with its scene built from them');

  // 예전 초안 가운데 입력이 불완전해 장면을 만들 수 없는 것 — 빈 스튜디오로 열리고, 숨은 예전 입력이 첫 공간을 막지 않는다
  const broken=await api.post('/api/spatial/drafts',{form:{...emptyStudioForm(),industry:'OF',rooms:[{...newStudioRoom(''),kind:'meeting'}]},view:'3d'});
  await page.goto(base+'/spatial/'+broken.id);await page.locator('.sp-blank-canvas').waitFor({timeout:60000});
  next=()=>[{type:'room_add',kind:'lounge',name:'새 라운지'}];
  await editor.click();await editor.pressSequentially('라운지 하나 만들어줘');
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/spatial/command')),editor.press('Enter')]);
  await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});await page.locator('.sp-room-strip button',{hasText:'새 라운지'}).waitFor();
  assert.equal(await page.locator('.sp-room-strip button').count(),2,'only the new room exists — the unusable old input is gone');
  pass('an old draft whose inputs cannot build a scene opens blank and takes its first room from a command');

  assert.deepEqual(app.errors,[]);
  console.log(JSON.stringify({ok:true,checks:app.checks.length,output}));
}finally{await app.close();}
