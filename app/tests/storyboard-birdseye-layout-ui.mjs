// PPT 레이아웃 만들기는 Storyboard가 맡는다 — 조감도 장에서 조감도 히스토리의 조감도를 골라 그 자리에서 레이아웃을 만들고 장에 적용한다.
import assert from 'node:assert/strict';
import {openApp,library} from './fixtures/birdseye/harness.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';
import {applySpatialEdit} from '../web/src/domain/spatial/edit.js';

const app=await openApp('storyboard-birdseye-layout'),{page,api,pass,output,base}=app;
try{
  const scene=createScene({templateId:'cowork-cowork-meet-standard'},library),stamp=Date.now().toString(36),title='레이아웃 만들 조감도 '+stamp;
  const record=await api.post('/api/spatial/history',{scene:{...scene,title},view:'3d',form:{...studioFormFromScene(scene),title}});
  await page.goto(base+'/spatial');await page.locator('.be-home').waitFor({timeout:120000});
  const {pid,route}=await page.evaluate(async()=>{
    const store=await import('/src/repositories/proposals.js'),{layoutContextKey}=await import('/src/domain/slides/context-policy.js'),{historyPath}=await import('/src/services/shared-path.js');
    const pid=store.createProposal();
    store.update(pid,d=>{d.title='조감도 장 제안';d.customer='레이아웃 테스트 고객';d.ind='OF';d.stage='story';d.ctx.products=['flip'];
      d.parts=[{id:'part',name:'공간 설계',type:'scenario',items:[],done:true,layouts:[{uid:'aerial',f:'L_SPATIAL_3D',status:'done',ov:{t:{},img:{}}}]}];
      for(const x of d.parts[0].layouts)x.adaptation={version:3,phase:'retained',origin:'history',key:layoutContextKey(d,d.parts[0])};});
    return {pid,route:historyPath(pid)};});
  await app.saved();
  const sheet=()=>page.evaluate(async pid=>(await import('/src/repositories/proposals.js')).getProposal(pid).parts[0].layouts[0],pid);
  await page.goto(base+route);await page.locator('[data-layout-uid="aerial"]').waitFor({timeout:120000});
  const detail=page.locator('.modal.sheet').filter({has:page.locator('.detail')}),picker=page.getByRole('dialog',{name:'조감도 레이아웃 선택',exact:true}),creator=page.getByRole('dialog',{name:'조감도 레이아웃 만들기',exact:true});
  const openPicker=async()=>{await page.locator('[data-layout-uid="aerial"]').click();await detail.locator('.slide-edit').waitFor();await detail.locator('[data-spatial-slot]').click();await picker.waitFor();};

  await openPicker();
  const tabs=picker.getByRole('group',{name:'조감도 레이아웃 종류'});
  assert.deepEqual(await tabs.getByRole('button').evaluateAll(nodes=>nodes.map(n=>n.textContent.replace(/\s*\d*$/,'').trim())),['조감도 히스토리','저장한 조감도','업종별 템플릿']);
  assert.equal(await tabs.getByRole('button',{name:/^조감도 히스토리/}).getAttribute('aria-pressed'),'true');
  const mine=picker.locator(`[data-history-id="${record.id}"]`);await mine.waitFor({timeout:60000});assert.match(await mine.textContent(),new RegExp(title));
  await page.screenshot({path:output+'/picker-history.png'});
  pass('the birdseye slide’s picker opens on my birdseye history, next to saved layouts and industry templates');

  await mine.getByRole('button',{name:/레이아웃 만들기$/}).click();await creator.waitFor({timeout:60000});
  await creator.locator('.sp-layout-editor,.sp-layout-stage,[data-layout-editor]').first().waitFor({timeout:120000});
  await page.screenshot({path:output+'/creator.png'});
  // 격리 서버에는 AI가 없어 Storyboard가 띄운 알림이 오른쪽 아래 버튼을 가린다 — 닫고 진행한다
  for(const close of await page.locator('.feedback-popups button').all())await close.click({timeout:2000}).catch(()=>{});
  const saveButton=creator.getByRole('button',{name:'저장하고 사용하기',exact:true});await saveButton.waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='저장하고 사용하기')?.disabled);
  await saveButton.evaluate(node=>node.click());   // 알림이 언제 떠서 버튼을 가려도 누른다
  await creator.waitFor({state:'hidden',timeout:120000});await picker.waitFor({state:'hidden'});
  const applied=await sheet();
  assert.match(applied.f,/^L_MY_/);assert.equal(applied.spatialLayout.historyId,record.id);assert.equal(applied.spatialLayout.templateId,applied.f);assert.equal(applied.source.type,'spatial-layout');
  await detail.locator('.slide-edit').waitFor();await page.screenshot({path:output+'/applied.png'});
  pass('choosing a birdseye opens the layout editor right there; saving applies the new layout to the slide');

  // 만든 레이아웃은 "저장한 조감도"에 남아 다시 고를 수 있다
  for(const close of await page.locator('.feedback-popups button').all())await close.click({timeout:2000}).catch(()=>{});
  await detail.getByRole('button',{name:'조감도 레이아웃 선택',exact:true}).click();await picker.waitFor();
  await tabs.getByRole('button',{name:/^저장한 조감도/}).click();await picker.locator(`.sp-saved-layout-card[data-layout-id="${applied.f}"]`).waitFor({timeout:60000});
  await tabs.getByRole('button',{name:'업종별 템플릿',exact:true}).click();await picker.locator('.sp-template-card').first().waitFor({timeout:60000});
  pass('the layout made here stays under saved layouts; industry templates are still offered');

  // 조감도를 고친 뒤 다시 만들면 고친 장면으로 만든다(예전에 만든 레이아웃의 그림을 다시 열지 않는다)
  await picker.locator('.mfoot').getByRole('button',{name:'닫기',exact:true}).click();
  const current=await api.get('/api/spatial/history/'+record.id),victim=current.scene.objects.find(o=>!current.scene.objects.some(x=>x.supportId===o.id)&&o.assetId==='furniture:plant')||current.scene.objects.at(-1);
  const edited=applySpatialEdit(current.scene,{operations:[{type:'remove',objectId:victim.id}]},library);
  await api.put('/api/spatial/history/'+record.id,{scene:edited,view:'3d',revision:current.revision,form:studioFormFromScene(edited)});
  await detail.getByRole('button',{name:'조감도 레이아웃 선택',exact:true}).click();await picker.waitFor();
  await picker.locator(`[data-history-id="${record.id}"]`).getByRole('button',{name:/레이아웃 만들기$/}).click();await creator.waitFor({timeout:60000});
  await creator.locator('.sp-layout-editor').first().waitFor({timeout:120000});
  const again=creator.getByRole('button',{name:'저장하고 사용하기',exact:true});await page.waitForFunction(()=>![...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='저장하고 사용하기')?.disabled);await again.evaluate(node=>node.click());
  await creator.waitFor({state:'hidden',timeout:120000});
  const remade=await sheet(),source=await page.evaluate(async f=>(await import('/src/repositories/templates.js')).myList().find(meta=>meta.f===f).my.spatialLayout.sourceScene,remade.f);
  assert.equal(source.contentHash,edited.contentHash,'the new layout is drawn from the edited birdseye');assert.equal(source.objects.length,edited.objects.length);
  pass('a layout made after the birdseye was edited uses the edited scene, not the earlier snapshot');

  // ── 예전 스튜디오 「레이아웃 추출」이 하던 편집 · 닫기 · 이어 고치기 — 이제 Storyboard의 만들기 창이 맡는다 ──
  await page.route('**/api/spatial/layout-description',route=>route.fulfill({json:{text:'AI 공간 설명\n공간 제품 목록\n• 삼성 제품 1대',model:'ui-fixture'}}));
  const myRows=()=>page.evaluate(async()=>(await import('/src/repositories/templates.js')).myList().filter(meta=>meta.my?.kind==='spatial').map(meta=>({f:meta.f,nodes:meta.my.spatialLayout.nodes.length,hash:meta.my.spatialLayout.sourceScene.contentHash})).sort((a,b)=>a.f.localeCompare(b.f)));
  const quiet=async()=>{for(const close of await page.locator('.feedback-popups button').all())await close.click({timeout:2000}).catch(()=>{});};
  const ask=page.getByRole('dialog',{name:'저장하지 않고 닫을까요?',exact:true}),canvas=creator.locator('.sp-layout-canvas>svg'),callouts=canvas.locator('[data-layout-node-type="callout"]'),nodes=canvas.locator('[data-layout-node]');
  const reopen=async()=>{await picker.locator(`[data-history-id="${record.id}"]`).getByRole('button',{name:/레이아웃 만들기$/}).click();await creator.waitFor({timeout:60000});await creator.locator('.sp-layout-camera[data-ready=true]').waitFor({timeout:120000});await quiet();};
  const addCallout=async()=>{await canvas.locator('[data-layout-target^="room:"]').first().press('Enter');await creator.locator('.sp-layout-add-callout').click();await creator.getByLabel('설명 내용').waitFor();};
  const before=await myRows(),stored=before.find(row=>row.f===remade.f),revision=(await api.get('/api/spatial/history/'+record.id)).revision;
  assert.equal(stored.hash,edited.contentHash);
  await quiet();await detail.getByRole('button',{name:'조감도 레이아웃 선택',exact:true}).click();await picker.waitFor();await reopen();
  assert.equal(await nodes.count(),stored.nodes,'the creator continues the layout saved from this unchanged birdseye');assert.equal(await callouts.count(),0);
  assert(await creator.getByRole('button',{name:'실행 취소',exact:true}).isDisabled());
  await addCallout();assert.equal(await callouts.count(),1);assert.match(await creator.getByLabel('설명 내용').inputValue(),/공간 제품 목록/);
  await creator.getByRole('button',{name:'실행 취소',exact:true}).click();assert.equal(await callouts.count(),0);assert.equal(await nodes.count(),stored.nodes);
  await creator.getByRole('button',{name:'다시 실행',exact:true}).click();assert.equal(await callouts.count(),1);
  await page.screenshot({path:output+'/creator-callout.png'});
  pass('in the creator, an AI description is added to a room and the header undo/redo take it away and bring it back');

  await creator.locator('.mfoot').getByRole('button',{name:'닫기',exact:true}).click();await ask.waitFor();
  await ask.getByRole('button',{name:'계속 편집',exact:true}).click();await ask.waitFor({state:'hidden'});assert(await creator.isVisible());assert.equal(await callouts.count(),1);
  await creator.locator('.mhead').getByRole('button',{name:'닫기',exact:true}).click();await ask.waitFor();
  await ask.getByRole('button',{name:'저장하지 않고 닫기',exact:true}).click();await creator.waitFor({state:'hidden'});
  assert.deepEqual(await myRows(),before,'discarding saves nothing');assert.equal((await sheet()).f,remade.f);
  pass('closing with unsaved edits asks first: “계속 편집” keeps the work, “저장하지 않고 닫기” leaves the saved layout and the slide as they were');

  // 구성이 달라지면(설명 추가) 새 레이아웃으로 저장한다 — 예전 레이아웃을 쓰는 다른 장의 글상자가 어긋나지 않게. 글만 고치면 그 레이아웃을 갱신한다.
  const save=async()=>{await page.waitForFunction(()=>![...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='저장하고 사용하기')?.disabled);await creator.getByRole('button',{name:'저장하고 사용하기',exact:true}).evaluate(node=>node.click());await creator.waitFor({state:'hidden',timeout:120000});};
  await picker.waitFor();await reopen();assert.equal(await callouts.count(),0,'the discarded description is gone');
  await addCallout();await creator.getByLabel('설명 내용').fill('입주사 만족도를 높이는\n쾌적한 공용 공간');await save();
  const grown=await myRows(),applied2=await sheet();
  assert.notEqual(applied2.f,remade.f);assert.equal(grown.length,before.length+1);assert.deepEqual(grown.find(row=>row.f===remade.f),stored,'the earlier layout is left as it was');assert.equal(grown.find(row=>row.f===applied2.f).nodes,stored.nodes+1);
  await quiet();await detail.getByRole('button',{name:'조감도 레이아웃 선택',exact:true}).click();await picker.waitFor();await reopen();
  assert.equal(await callouts.count(),1,'the creator continues the newest layout of this birdseye');assert.equal(await nodes.count(),stored.nodes+1);
  await callouts.first().press('Enter');await creator.getByLabel('설명 내용').fill('다시 다듬은 설명\n쾌적한 공용 공간');await save();
  const polished=await myRows();
  assert.equal(polished.length,grown.length,'a text-only change updates the same layout');assert.equal((await sheet()).f,applied2.f);
  assert(await page.evaluate(async f=>(await import('/src/services/catalog.js')).layoutHtml(f).includes('다시 다듬은 설명'),applied2.f),'the saved layout carries the edited description');
  assert.equal((await api.get('/api/spatial/history/'+record.id)).revision,revision,'making layouts never writes to the birdseye record');
  pass('re-making from an unchanged birdseye continues its newest layout: a new description saves as a new layout, a text change updates it, and the birdseye itself is never written');

  assert.deepEqual(app.errors,[]);
  console.log(JSON.stringify({ok:true,checks:app.checks.length,output}));
}finally{await app.close();}
