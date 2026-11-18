// 건물 — 통합 시작 팝업의 건물 세 갈래, 내 공간 조감도 · 템플릿 공간을 크기 제한 없이 층으로 쌓기, 명령 입력창 없음.
import assert from 'node:assert/strict';
import {openApp,library} from './fixtures/birdseye/harness.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';

const app=await openApp('building-compose'),{page,api,pass,output,base}=app;
try{
  const scene=createScene({templateId:'cowork-full-standard'},library),stamp=Date.now().toString(36),mine='층으로 쓸 조감도 '+stamp;
  const record=await api.post('/api/spatial/history',{scene:{...scene,title:mine},view:'3d',form:{...studioFormFromScene(scene),title:mine}});
  const home=async()=>{await page.goto(base+'/spatial');await page.locator('.be-home .sp-history').waitFor({timeout:120000});};
  const start=async()=>{await home();await page.getByRole('button',{name:/조감도 스튜디오 시작/}).click();const dialog=page.getByRole('dialog',{name:'조감도 스튜디오 시작'});await dialog.getByRole('tab',{name:/건물/}).click();return dialog;};
  const floors=()=>page.locator('.bd-floor-strip .bd-floor-chip').count();
  const summary=async id=>page.evaluate(async id=>(await window.__wmBldMod_.app.list()).find(b=>b.id===id),id);
  const stored=id=>page.evaluate(id=>new Promise((resolve,reject)=>{const open=indexedDB.open('winmate-building');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const request=open.result.transaction('b').objectStore('b').get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);};}),id);
  const newest=()=>page.evaluate(async()=>(await window.__wmBldMod_.app.list())[0].id);

  // 빈 건물 — 시작 팝업은 업종 · 공간을 받는다. 빈 건물은 건물 모듈로 만들어 목록에서 연다. 건물 스튜디오에 명령 입력창은 없다
  await home();
  const id=await page.evaluate(()=>window.__wmBldMod_.app.create({blank:true}));
  await page.locator(`.sp-history [data-building-id="${id}"] .sp-history-open`).click();await page.locator('.bd-view').waitFor({timeout:120000});await page.locator('.bd-floor-strip .bd-floor-chip').first().waitFor();
  assert.equal(await floors(),1);assert.equal(await newest(),id);
  assert.equal(await page.locator('.sp-prompt,.sp-mention-editor').count(),0);assert.equal(await page.getByRole('combobox',{name:'조감도 편집 프롬프트'}).count(),0);
  assert.equal(await page.locator('.bd-page [contenteditable],.bd-page textarea').count(),0);
  pass('a blank building opens with one floor; the building studio has no command input');

  // 빈 층 채우기 — 고르기 창에 "내 조감도"가 있고 크기 제한이 없다
  await page.locator('.bd-floor-strip .bd-floor-pick').first().click();await page.locator('.bd-fc-fill').click();
  let picker=page.locator('.bd-pick-modal');await picker.locator('.bd-my-group .bd-tpl').first().waitFor({timeout:60000});
  assert.equal(await picker.locator('.bd-pick-size').count(),0);assert.equal(await picker.getByText(/이 건물에 맞는 크기/).count(),0);
  const sizes=new Set(await picker.locator('.bd-group:not(.bd-my-group) .bd-tpl .bd-tpl-meta').evaluateAll(nodes=>nodes.map(n=>n.textContent.split(' · ')[1])));
  assert(sizes.size>=3,'template spaces of every size are offered: '+[...sizes].join(', '));
  const myCard=picker.locator('.bd-my-group .bd-tpl',{hasText:mine});await myCard.waitFor();
  await page.screenshot({path:output+'/picker.png'});
  await myCard.click();await picker.getByRole('button',{name:'이 공간으로'}).click();
  await page.locator('.bd-floor-card .bd-fc-rooms li').first().waitFor({timeout:60000});
  assert.equal(await page.locator('.bd-floor-card .bd-fc-rooms li').count(),scene.rooms.length);
  assert.match(await page.locator('.bd-floor-card-sub').textContent(),new RegExp(`${Math.round(scene.width)}×${Math.round(scene.depth)}m`),'the floor takes the size of the space put in it');
  await page.screenshot({path:output+'/my-floor.png'});
  pass('an empty floor can be filled with my own spatial record; the floor takes that space’s size');

  // 층 추가 — 크기가 다른 템플릿 공간 둘 + 내 조감도 하나를 한 번에
  await page.getByRole('button',{name:'층 추가',exact:true}).click();picker=page.locator('.bd-pick-modal');await picker.locator('.bd-my-group .bd-tpl').first().waitFor({timeout:60000});
  const templates=picker.locator('.bd-group:not(.bd-my-group) .bd-tpl:visible');
  const metas=await templates.evaluateAll(nodes=>nodes.map(n=>n.querySelector('.bd-tpl-meta').textContent.split(' · ')[1]));
  const firstSize=metas[0],other=metas.findIndex(size=>size!==firstSize);assert(other>0);
  await templates.nth(0).click();await templates.nth(other).click();await picker.locator('.bd-my-group .bd-tpl',{hasText:mine}).click();
  await picker.getByRole('button',{name:'3개 층 추가'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.bd-floor-strip .bd-floor-chip').length===4);
  await page.waitForTimeout(1200);   // 저장(450ms 지연) 끝
  const saved=await stored(id);
  assert.equal(saved.floors.length,4);assert.equal(saved.floors.filter(f=>String(f.tpl).startsWith('my:')).length,2);
  assert.deepEqual(Object.keys(saved.spaces).sort(),saved.floors.map(f=>f.tpl).filter(t=>String(t).startsWith('my:')).sort(),'floor packs are saved inside the building');
  assert(new Set(saved.floors.map(f=>f.shell.w+'x'+f.shell.d)).size>=2,'floors of different sizes stack');
  const full=await summary(id);assert.equal(full.floors,4);assert(full.rooms>=scene.rooms.length*2);
  await page.screenshot({path:output+'/stacked.png'});
  pass('template spaces of different sizes and my own records stack as floors in one go, saved with the building');

  // 다시 열기 — 내 층이 그대로 그려진다. 원본 조감도를 지워도 건물은 그대로다
  await api.post('/api/spatial/history',{scene:{...scene,title:'지울 원본'},view:'3d',form:studioFormFromScene(scene)});
  const removed=await app.context.request.delete(base+'/api/spatial/history/'+record.id,{headers:{Origin:base}});assert(removed.ok());
  await page.reload();await page.locator('.bd-view').waitFor({timeout:120000});await page.waitForFunction(()=>document.querySelectorAll('.bd-floor-strip .bd-floor-chip').length===4);
  assert.equal((await summary(id)).rooms,full.rooms);
  await page.locator('.bd-floor-strip .bd-floor-pick').first().click();await page.locator('.bd-floor-card .bd-fc-rooms li').first().waitFor();
  pass('the building reopens with my floors intact even after the source record is deleted');

  // 층 묶음이 없는 기록(다른 기기 · 예전 판) — 그 층은 빈 층으로, 건물은 열린다
  await page.evaluate(id=>new Promise((resolve,reject)=>{const open=indexedDB.open('winmate-building');open.onsuccess=()=>{const tx=open.result.transaction('b','readwrite'),os=tx.objectStore('b'),get=os.get(id);get.onsuccess=()=>{const b=get.result;delete b.spaces;os.put(b);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);};}),id);
  await page.evaluate(()=>{for(const key of Object.keys(window.__wmBldMod_.data().tplById))if(key.startsWith('my:'))delete window.__wmBldMod_.data().tplById[key];});
  await page.reload();await page.locator('.bd-view').waitFor({timeout:120000});await page.waitForFunction(()=>document.querySelectorAll('.bd-floor-strip .bd-floor-chip').length===4);
  assert.equal(await page.locator('.bd-floor-strip .bd-floor-pick.is-empty').count(),2);assert.deepEqual(app.errors,[]);
  pass('a record whose floor packs are missing still opens — those floors are empty');

  // 뒤로 가기 → 통합 목록에 건물 카드
  await page.locator('.bd-page button',{hasText:'뒤로 가기'}).click();await page.locator('.be-home .sp-history .be-entry').first().waitFor({timeout:60000});
  assert.equal(new URL(page.url()).pathname,'/spatial');
  const card=page.locator(`.sp-history [data-building-id="${id}"]`);await card.waitFor();assert.equal(await card.locator('xpath=..').locator('.be-type').textContent(),'건물');
  pass('back returns to the unified list where the building has its own card');

  // 건물 템플릿에서 시작 — 건물 모듈의 고르기 창에서 고른다. 닫으면 목록에 머문다
  let dialog=await start();await dialog.getByRole('button',{name:'건물 템플릿에서 시작',exact:true}).click();
  let presets=page.getByRole('dialog',{name:'건물 스튜디오 시작'});await presets.locator('.bd-tpl').first().waitFor({timeout:60000});
  await presets.getByRole('button',{name:'취소'}).click();await page.waitForTimeout(400);assert.equal(await page.locator('.bd-view').count(),0);await page.locator('.be-home').waitFor();
  dialog=await start();await dialog.getByRole('button',{name:'건물 템플릿에서 시작',exact:true}).click();presets=page.getByRole('dialog',{name:'건물 스튜디오 시작'});await presets.locator('.bd-tpl').first().waitFor({timeout:60000});
  await presets.locator('.bd-tpl').first().click();await presets.getByRole('button',{name:'스튜디오 열기'}).click();
  await page.locator('.bd-view').waitFor({timeout:120000});assert(await floors()>=1);
  pass('start › 건물 › 건물 템플릿에서 시작 picks from the building template window; cancelling stays on the list');

  // 업종 · 공간 입력 — 공간 하나가 한 층. 제안서 불러오기로 그 제안서의 업종 · 공간 구성을 채운다
  await home();
  const pid=await page.evaluate(async()=>{
    const store=await import('/src/repositories/proposals.js');const id=store.createProposal();
    store.update(id,d=>{d.title='건물 제안';d.customer='건물 테스트 고객';d.ind='OF';d.req.free=[{t:'로비 · 회의실 · 라운지에 디스플레이'}];d.ctx.products=['qm65c'];
      d.spacePlan={v:1,vertical:{id:'test-vertical',name:'대기업 사옥',group:'OF'},title:'표준',summary:'세 공간',at:Date.now(),spaces:[{id:'s1',name:'로비',kind:'reception',note:'',products:['qm65c']},{id:'s2',name:'회의실',kind:'meeting',note:'',products:['qm65c']},{id:'s3',name:'라운지',kind:'lounge',note:'',products:['qm65c']}]};});
    return id;});
  await app.saved();
  dialog=await start();assert(await dialog.getByRole('button',{name:'시작',exact:true}).isDisabled());
  await dialog.getByRole('button',{name:/제안서 불러오기/}).click();await dialog.locator(`[data-proposal-id="${pid}"]`).click();
  assert.deepEqual(await dialog.locator('.be-space-bubble').allTextContents(),['로비','회의실','라운지']);
  assert.equal(await dialog.getByRole('group',{name:'업종 선택'}).locator('button[aria-pressed=true]').textContent(),library.industries.find(i=>i.code==='OF').name);
  await dialog.getByRole('button',{name:'시작',exact:true}).click();await page.locator('.bd-view').waitFor({timeout:120000});
  await page.waitForFunction(()=>document.querySelectorAll('.bd-floor-strip .bd-floor-chip').length===3);
  assert.deepEqual(await page.locator('.bd-floor-strip .bd-floor-pick').evaluateAll(nodes=>nodes.map(n=>n.textContent.replace(/^\d+F/,''))),['로비','회의실','라운지']);
  await page.screenshot({path:output+'/from-storyboard.png'});
  pass('start › 건물 stacks one floor per entered space, bottom to top; a proposal fills the industry and spaces');

  assert.deepEqual(app.errors,[]);
  console.log(JSON.stringify({ok:true,checks:app.checks.length,output}));
}finally{await app.close();}
