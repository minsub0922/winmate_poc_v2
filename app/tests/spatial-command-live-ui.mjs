// 실제 모델로 화면에서 확인 — 사용자 예시 세 문장을 스튜디오 입력창에 그대로 입력해 시뮬레이터가 바뀌는지 본다.
// 모델에 연결된 격리 API가 필요하다(spatial-command-live.mjs 머리말). 실행:
//   BIRDSEYE_TEST_API_PORT=8962 BIRDSEYE_TEST_WEB_PORT=5262 node app/tests/spatial-command-live-ui.mjs
import assert from 'node:assert/strict';
import {openApp,library} from './fixtures/birdseye/harness.mjs';
import {createScene,addAsset} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';

const app=await openApp('spatial-command-live'),{page,api,pass,output,base}=app;
try{
  const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
  let scene=createScene({templateId:'rs-full-standard'},library);
  const living=scene.rooms.find(r=>r.name==='거실'),laundry=scene.rooms.find(r=>r.name.includes('세탁')),bedroom=scene.rooms.find(r=>r.name.includes('침실'));
  let person=null;
  for(const asset of library.assets.filter(a=>a.assetGroup==='people'&&a.physical&&a.catalogVisible!==false)){try{const before=new Set(scene.objects.map(o=>o.id));const next=addAsset(scene,asset.id,bedroom.id,library);person=next.objects.find(o=>!before.has(o.id));scene=next;break;}catch{}}
  assert(person);const personName=assets[person.assetId].name;
  const sofa=scene.objects.find(o=>o.roomId===living.id&&/소파$/.test(assets[o.assetId].name));assert(sofa);
  const record=await api.post('/api/spatial/history',{scene:{...scene,title:'실제 모델 점검'},view:'2d',form:{...studioFormFromScene(scene),title:'실제 모델 점검'}});
  const calls=[];page.on('response',async response=>{if(response.url().includes('/api/spatial/command')){const body=await response.json().catch(()=>null);calls.push({status:response.status(),source:body?.source,operations:body?.plan?.operations,explanation:body?.plan?.explanation,ms:response.request().timing().responseEnd});}});
  await page.goto(base+'/spatial/'+record.id);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  const editor=page.getByRole('combobox',{name:'조감도 편집 프롬프트'});
  const tag=async(text,kind,name)=>{await editor.pressSequentially('@'+text);const option=page.locator(`#sp-mention-options [data-mention-kind=${kind}]`,name?{hasText:name}:undefined).first();await option.waitFor();await option.click();};
  const send=async()=>{const before=calls.length;await editor.press('Enter');await page.waitForFunction(()=>!document.querySelector('.feedback-popup.progress'),null,{timeout:120000}).catch(()=>{});for(let i=0;i<240&&calls.length===before;i++)await page.waitForTimeout(250);await page.waitForTimeout(700);return calls.at(-1);};
  const state=()=>page.evaluate(()=>[...document.querySelectorAll('.sp-plan-image [data-object-id]')].map(node=>node.getAttribute('data-object-id')));
  const box=id=>page.locator(`.sp-plan-image [data-object-id="${id}"]`).first().boundingBox();
  await page.screenshot({path:output+'/0-before.png',fullPage:true});

  // 1) @거실 에 @사람 2명 복사해
  let before=await state();
  await editor.click();await tag('거실','room','거실');await editor.pressSequentially(' 에 ');await tag(personName.slice(0,4),'object');await editor.pressSequentially(' 2명 복사해');
  let call=await send();console.log('1)',JSON.stringify(call));
  assert.equal(call.status,200);assert.equal(call.operations[0].type,'copy');assert.equal(call.operations[0].quantity,2);assert.equal(call.operations[0].roomId,living.id);
  let after=await state();assert.equal(after.length,before.length+2,'two clones appear in the simulator');
  await page.getByText(/2개를 복제했어요/).first().waitFor();await page.screenshot({path:output+'/1-copy.png',fullPage:true});
  pass(`"@거실 에 @사람 2명 복사해" → ${call.source}: two people bundles were cloned into 거실`);

  // 2) @소파 배치 오른쪽으로 옮겨
  const x0=(await box(sofa.id)).x;
  await editor.click();await tag('라운지 소파','object','거실');await editor.pressSequentially(' 배치 오른쪽으로 옮겨');
  call=await send();console.log('2)',JSON.stringify(call));
  assert.equal(call.status,200);assert.equal(call.operations[0].type,'move');assert.equal(call.operations[0].direction,'right');
  const x1=(await box(sofa.id)).x;assert(x1>x0+1,'the sofa moved right on screen: '+x0+' → '+x1);
  await page.screenshot({path:output+'/2-move.png',fullPage:true});
  pass(`"@소파 배치 오른쪽으로 옮겨" → ${call.source}: the sofa moved right`);

  // 3) @세탁기 3개 추가해 (공간을 말하지 않음 · 전체 맵)
  before=await state();
  await editor.click();await tag('세탁기','asset');await editor.pressSequentially(' 3개 추가해');
  call=await send();console.log('3)',JSON.stringify(call));
  assert.equal(call.status,200);assert.equal(call.operations[0].type,'add');assert.equal(call.operations[0].quantity,3);
  after=await state();assert.equal(after.length,before.length+3,'three washers appear');
  const washerRoom=scene.rooms.find(r=>r.id===call.operations[0].roomId);
  await page.screenshot({path:output+'/3-add.png',fullPage:true});
  pass(`"@세탁기 3개 추가해" → ${call.source}: three washers were added to ${washerRoom.name}`);

  // 3D로도 확인하고, 실행 취소 세 번으로 처음으로 돌아가는지 본다
  await page.getByRole('tab',{name:'3D',exact:true}).click();await page.locator('.sp-view[data-ready=true][data-view="3d"]').waitFor({timeout:120000});await page.waitForTimeout(1500);
  await page.screenshot({path:output+'/4-3d.png',fullPage:true});
  await page.getByRole('tab',{name:'2D',exact:true}).click();await page.locator('.sp-view[data-view="2d"]').waitFor();
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'실행 취소'}).click();
  await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,scene.objects.length);
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'다시 실행'}).click();
  await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,scene.objects.length+5);
  pass('undo three times returns to the start; redo restores all three commands');

  // 세 문장을 한 번에 — 처음 상태에서
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'실행 취소'}).click();
  await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,scene.objects.length);
  await editor.click();await tag('거실','room','거실');await editor.pressSequentially(' 에 ');await tag(personName.slice(0,4),'object');await editor.pressSequentially(' 2명 복사해. 그리고 ');
  await tag('라운지 소파','object','거실');await editor.pressSequentially(' 배치 오른쪽으로 옮겨. ');await tag('세탁기','asset');await editor.pressSequentially(' 3개 추가해.');
  call=await send();console.log('4)',JSON.stringify(call));
  assert.equal(call.status,200);assert.deepEqual(call.operations.map(op=>op.type),['copy','move','add']);
  await page.waitForFunction(n=>document.querySelectorAll('.sp-plan-image [data-object-id]').length===n,scene.objects.length+5);
  await page.screenshot({path:output+'/5-all-at-once.png',fullPage:true});
  pass(`all three sentences in one message → ${call.source}: copy, move and add applied together`);

  // 저장 — 뒤로 가기 후 서버 기록
  await page.getByRole('button',{name:'뒤로 가기'}).click();await page.waitForURL(u=>new URL(u).pathname==='/spatial');
  const saved=await api.get('/api/spatial/history/'+record.id);
  assert.equal(saved.scene.objects.length,scene.objects.length+5);
  assert.equal(saved.scene.objects.filter(o=>o.roomId===living.id&&o.assetId===person.assetId).length,2);
  assert.equal(saved.scene.objects.filter(o=>/세탁기/.test(assets[o.assetId].name)).length-scene.objects.filter(o=>/세탁기/.test(assets[o.assetId].name)).length,3);
  pass('the commanded scene is saved on the server');
  assert.deepEqual(app.errors,[]);
  console.log(JSON.stringify({ok:true,checks:app.checks.length,sources:calls.map(c=>c.source),output}));
}finally{await app.close();}
