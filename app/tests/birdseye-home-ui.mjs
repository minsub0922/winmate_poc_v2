// 조감도 통합 목록 · 시작 팝업(공간 갈래) — 사이드바 한 항목, 공간 · 건물이 섞인 히스토리 한 구역, 시작 팝업의 세 갈래.
import assert from 'node:assert/strict';
import {openApp,library} from './fixtures/birdseye/harness.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';

const app=await openApp('birdseye-home'),{page,api,pass,output,base}=app;
try{
  const scene=createScene({templateId:'cowork-full-standard'},library),form=studioFormFromScene(scene);
  const made=[];for(let i=0;i<10;i++)made.push(await api.post('/api/spatial/history',{scene:{...scene,title:'통합 목록 테스트 '+(i+1)},view:'3d',form:{...form,title:'통합 목록 테스트 '+(i+1)}}));
  const historyRequests=[];page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/spatial/history')historyRequests.push(Number(url.searchParams.get('page_size')));});
  await page.goto(base+'/spatial');await page.locator('.be-home .sp-history .be-entry').first().waitFor({timeout:120000});
  assert.equal(historyRequests[0],8,'the first page asks for one page of records (each carries its whole scene), not 48');
  // 이 테스트의 건물 — 건물 모듈로 만든다(만드는 즉시 통합 목록에 반영된다)
  await page.waitForFunction(()=>window.__wmBldMod_);
  const ownBuilding=await page.evaluate(()=>window.__wmBldMod_.app.create({blank:true,title:'통합 목록 건물'}));
  await page.locator(`.sp-history [data-building-id="${ownBuilding}"]`).waitFor({timeout:60000});

  // 사이드바 · 목록 머리
  assert.equal(await page.getByRole('button',{name:'공간 조감도',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'건물 조감도',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'조감도',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'공간 조감도',exact:true}).getAttribute('aria-current'),'page');
  assert.equal((await page.locator('.be-home h1').textContent()).replace('BETA','').trim(),'공간 조감도');
  assert.equal(await page.getByText('업종별 템플릿 활용하기').count(),0);assert.equal(await page.getByText('Layout 히스토리').count(),0);assert.equal(await page.locator('.sp-saved-layouts,.sp-home-maps,.sp-template-launch').count(),0);
  assert.equal(await page.locator('.sp-history').count(),1,'one history section');
  assert.equal(await page.getByRole('button',{name:/조감도 스튜디오 시작/}).count(),1);
  pass('one sidebar entry, one start button, one history section — no template button, no layout history');

  // 히스토리: 공간 · 건물이 최근 수정순으로 섞이고 종류 표시가 붙는다
  const server=await api.get('/api/spatial/history?page=1&page_size=48');
  await page.waitForFunction(()=>document.querySelector('.sp-history .sp-history-count'));
  const buildings=await page.evaluate(async()=>(await window.__wmBldMod_.app.list()).length);
  assert(buildings>=1,'the building made above is listed');
  assert.equal(Number(await page.locator('.sp-history .sp-history-count').textContent()),server.total+buildings);
  const firstPage=await page.locator('.sp-history .be-entry').evaluateAll(nodes=>nodes.map(node=>({type:node.dataset.type,badge:node.querySelector('.be-type').textContent,title:node.querySelector('h3').textContent})));
  assert.equal(firstPage.length,8);assert.deepEqual([firstPage[0].type,firstPage[0].title],['building','통합 목록 건물'],'the newest record comes first whatever its type');assert.equal(firstPage[1].title,'통합 목록 테스트 10');assert(firstPage.every(card=>card.badge===(card.type==='building'?'건물':'공간')));
  const pages=Math.ceil((server.total+buildings)/8),walk=Math.min(pages,3);   // 격리 DB에는 지난 실행의 기록이 쌓인다 — 앞의 세 쪽만 넘겨 본다
  const seen=[...firstPage];
  for(let n=2;n<=walk;n++){await page.getByRole('button',{name:n+'페이지',exact:true}).click();await page.waitForFunction(n=>document.querySelector('.sp-history .sp-map-grid')?.dataset.historyPage===String(n),n);
    seen.push(...await page.locator('.sp-history .be-entry').evaluateAll(nodes=>nodes.map(node=>({type:node.dataset.type,title:node.querySelector('h3').textContent}))));}
  assert.equal(seen.length,Math.min(server.total+buildings,walk*8));assert(seen.some(card=>card.type==='building'));assert(seen.some(card=>card.type==='spatial'));
  assert.equal(new Set(seen.map(card=>card.type+card.title)).size>=Math.min(seen.length,11),true);
  await page.screenshot({path:output+'/home-last-page.png',fullPage:true});
  await page.getByRole('button',{name:'1페이지',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sp-history .sp-map-grid')?.dataset.historyPage==='1');
  await page.locator('.sp-history .be-entry[data-type=building] img').first().waitFor({timeout:60000});   // 건물 카드 썸네일(3D 외관)
  await page.screenshot({path:output+'/home.png',fullPage:true});
  pass('spatial and building records share one paginated history, newest first, each with a type badge');

  // 건물 카드 → 건물 스튜디오 → 뒤로 가기 → 통합 목록
  const buildingTitle=seen.find(card=>card.type==='building').title;
  while(!(await page.locator('.sp-history .be-entry[data-type=building]').count()))await page.getByRole('button',{name:'다음 페이지'}).click().then(()=>page.waitForTimeout(400));
  await page.locator('.sp-history .be-entry[data-type=building] .sp-history-open').first().click();
  await page.locator('.bd-view').waitFor({timeout:120000});   // 건물 경로는 주소가 따로 없다(UI 상태로 복원)
  assert.equal(await page.getByRole('button',{name:'공간 조감도',exact:true}).getAttribute('aria-current'),'page');
  await page.locator('.bd-page button',{hasText:'뒤로 가기'}).click();await page.locator('.be-home .sp-history .be-entry').first().waitFor();assert.equal(new URL(page.url()).pathname,'/spatial');
  // 예전 '건물 목록'에 머물던 상태로 다시 열어도 통합 목록으로 온다
  await page.evaluate(async()=>{const store=await import('/src/repositories/proposals.js');store.saveUi({...store.loadUi(),route:{name:'building'}});});
  await page.goto(base+'/');await page.locator('.be-home .sp-history .be-entry').first().waitFor({timeout:60000});assert.equal(new URL(page.url()).pathname,'/spatial');
  pass('a building card opens the building studio; back — and a saved “building list” state — return to the unified list');

  // 공간 조감도 카드는 3D 미리보기가 기본이다
  assert((await page.locator('.sp-history .sp-history-card .sp-map-preview:not([data-view=draft])').evaluateAll(nodes=>nodes.map(n=>n.dataset.view))).every(view=>view==='3d'));
  // 삭제 — 종류에 맞게
  const total=Number(await page.locator('.sp-history .sp-history-count').textContent());
  await page.locator(`.sp-history [data-history-id="${made.at(-1).id}"] .sp-history-delete`).click();await page.getByRole('dialog',{name:'조감도를 삭제할까요?'}).getByRole('button',{name:'삭제'}).click();
  await page.waitForFunction(n=>Number(document.querySelector('.sp-history .sp-history-count')?.textContent)===n,total-1);
  while(!(await page.locator('.sp-history .be-entry[data-type=building]').count()))await page.getByRole('button',{name:'다음 페이지'}).click().then(()=>page.waitForTimeout(400));
  await page.locator('.sp-history .be-entry[data-type=building] .sp-history-delete').first().click();await page.getByRole('dialog',{name:'건물을 삭제할까요?'}).getByRole('button',{name:'삭제'}).click();
  await page.waitForFunction(n=>Number(document.querySelector('.sp-history .sp-history-count')?.textContent)===n,total-2);
  assert.equal(await page.evaluate(async()=>(await window.__wmBldMod_.app.list()).length),buildings-1);
  pass('deleting a card removes the spatial record or the building it stands for');

  // 시작 팝업 — 질문 없이 창 하나: 탭(공간 · 건물, 기본 공간) + 업종 · 공간(필수)
  const open=async()=>{await page.goto(base+'/spatial');await page.getByRole('button',{name:/조감도 스튜디오 시작/}).click();return page.getByRole('dialog',{name:'조감도 스튜디오 시작'});};
  const opened=async()=>{await page.waitForURL(/\/spatial\/sp-/,{timeout:120000});await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});return api.get('/api/spatial/history/'+decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)));};
  const productsIn=(scene,name)=>{const room=scene.rooms.find(r=>r.name===name);return scene.objects.filter(o=>o.roomId===room.id&&o.assetId.startsWith('product:')).map(o=>o.assetId.slice(8));};
  let dialog=await open();
  assert.deepEqual(await dialog.getByRole('tab').evaluateAll(nodes=>nodes.map(n=>[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('')+':'+n.getAttribute('aria-selected'))),['공간:true','건물:false']);
  assert.equal(await dialog.getByRole('group',{name:'조감도 종류'}).count(),0);assert.equal(await dialog.getByRole('group',{name:'시작 방법'}).count(),0);
  const start=dialog.getByRole('button',{name:'시작',exact:true}),input=dialog.getByRole('combobox',{name:'공간 입력'}),recommend=dialog.getByRole('button',{name:/^추천 공간/});
  assert(await start.isDisabled());assert(await input.isDisabled());assert(await recommend.isDisabled());
  await page.screenshot({path:output+'/start-dialog.png'});
  await dialog.getByRole('group',{name:'업종 선택'}).getByRole('button').nth(7).click();assert(await start.isDisabled(),'an industry alone is not enough');
  // 자동완성 — 입력창에 들어가면 바로 위에 뜨고(추천 순서), 치는 대로 좁혀진다. 한글은 조합 중인 글자('회의'를 치는 도중의 '횡')로도 찾는다
  await input.click();const results=dialog.getByRole('listbox',{name:'공간 자동완성'});await results.waitFor();
  const popup=dialog.locator('.be-space-suggest'),gap=async()=>{const above=await popup.boundingBox(),field=await dialog.locator('.be-space-box').boundingBox();return field.y-(above.y+above.height);};
  assert((await gap())>=0&&(await gap())<12,'the list sits right above the input');assert.equal(await results.getByRole('option').count(),6);
  await input.pressSequentially('횡');const narrowed=await results.getByRole('option').locator('span').allTextContents();
  assert(narrowed.length>0&&narrowed.every(name=>name.includes('회의')),'a syllable still being composed already matches: '+narrowed.join(', '));assert((await gap())>=0&&(await gap())<12);
  await page.screenshot({path:output+'/start-search.png'});await results.getByRole('option').first().click();
  // 입력하고 Enter를 누르면 버블. 같은 이름은 한 번만. 목록에 없는 이름은 「그대로 넣기」로 안내한다
  await input.fill('우리 팀 창고');assert.match(await popup.innerText(),/‘우리 팀 창고’ 그대로 넣기/);await input.press('Enter');await input.fill('우리팀 창고');await input.press('Enter');
  assert.match(await dialog.locator('.be-start-note').textContent(),/이미 넣었어요/);await input.fill('');
  // 한글 조합 중에 누른 Enter(글자 확정)도 한 번으로 버블이 된다
  await input.evaluate(el=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));set.call(el,'탕비실');el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
    el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true,isComposing:true}));el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'탕비실'}));});
  await dialog.locator('.be-space-bubble',{hasText:'탕비실'}).waitFor();assert.equal(await input.inputValue(),'');
  await dialog.getByRole('button',{name:'탕비실 빼기',exact:true}).click();
  // 추천 공간 창 — 눌러서 넣고, 다시 눌러서 뺀다
  await recommend.click();const picker=page.getByRole('dialog',{name:/^추천 공간/});await picker.waitFor();
  assert.equal(await picker.locator('button[aria-pressed=true]').count(),1,'the space picked from the search is already on');
  await picker.getByRole('button',{name:'임원실',exact:true}).click();await picker.getByRole('button',{name:'구내식당',exact:true}).click();await picker.getByRole('button',{name:'구내식당',exact:true}).click();
  await page.screenshot({path:output+'/start-recommended.png'});await picker.getByRole('button',{name:'완료'}).click();
  const bubbles=await dialog.locator('.be-space-bubble').allTextContents();
  assert.equal(bubbles.length,3);assert.match(bubbles[0],/회의/);assert.deepEqual(bubbles.slice(1),['우리 팀 창고','임원실']);assert(!(await start.isDisabled()));
  await start.click();const made1=await opened();
  assert.equal(made1.form.industry,library.industries[7].code);assert.deepEqual(made1.scene.rooms.map(r=>r.name),bubbles);assert.equal(made1.view,'3d');
  assert.equal(made1.scene.objects.filter(o=>o.assetId.startsWith('product:')).length,0,'no product object without a proposal');assert(made1.scene.objects.length>0);
  assert.equal(await page.getByRole('combobox',{name:'조감도 편집 프롬프트'}).getAttribute('aria-disabled'),'false');
  pass('start › 공간 needs an industry and a space (typed, searched or recommended), then opens a studio with those spaces and no product objects');

  // 업종 템플릿에서 시작 — 업종을 골라야 켜지고, 그 업종의 템플릿을 드롭다운에서 골라 확인하면 구성된 스튜디오가 열린다
  dialog=await open();const fromTemplate=dialog.getByRole('button',{name:/업종 템플릿에서 시작/});assert(await fromTemplate.isDisabled());
  await dialog.locator('[data-industry="OF"]').click();await fromTemplate.click();
  const templates=page.locator('.be-template-menu .be-template-item');await templates.first().waitFor();await page.screenshot({path:output+'/start-templates.png'});
  await templates.first().click();const sure=page.getByRole('dialog',{name:'이 템플릿으로 시작하시겠습니까?',exact:true});await sure.waitFor();await page.screenshot({path:output+'/start-template-confirm.png'});
  await sure.getByRole('button',{name:'시작',exact:true}).click();await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  assert(await page.locator('[data-room-label]').count()>1);
  pass('start › 업종 템플릿에서 시작 lists the chosen industry’s templates, asks before starting, then opens a furnished studio');

  // 제안서 불러오기 — 제안서의 업종 · 공간 구성을 채우고, 그 제안서에서 고른 제품만 알맞은 공간에 넣는다
  await page.goto(base+'/spatial');await page.locator('.be-home').waitFor();
  const pid=await page.evaluate(async()=>{
    const store=await import('/src/repositories/proposals.js');const id=store.createProposal();
    store.update(id,d=>{d.title='스마트 오피스 제안';d.customer='테스트 고객';d.ind='OF';d.req.free=[{t:'로비와 회의실에 디스플레이를 설치하고 싶어요'}];d.ctx.products=['qm65c','flip'];
      d.spacePlan={v:1,vertical:{id:'test-vertical',name:'대기업 사옥',group:'OF'},title:'핵심 공간',summary:'로비와 회의실',at:Date.now(),spaces:[{id:'s1',name:'로비',kind:'reception',note:'',products:['qm65c']},{id:'s2',name:'회의실',kind:'meeting',note:'',products:['qm65c']}]};});
    return id;});
  await app.saved();   // 제안서 저장(브라우저 · 계정)이 끝난 뒤 다시 연다
  dialog=await open();await dialog.getByRole('button',{name:/제안서 불러오기/}).click();
  const choice=dialog.locator(`[data-proposal-id="${pid}"]`);await choice.waitFor();assert.match(await choice.textContent(),/테스트 고객/);assert.match(await choice.textContent(),/공간 2곳/);
  await page.screenshot({path:output+'/start-proposals.png'});await choice.click();
  assert.equal(await dialog.getByRole('group',{name:'업종 선택'}).locator('button[aria-pressed=true]').textContent(),library.industries.find(i=>i.code==='OF').name);
  assert.deepEqual(await dialog.locator('.be-space-bubble').allTextContents(),['로비','회의실']);assert.match(await dialog.locator('.be-start-proposal').textContent(),/테스트 고객.*제품 2종/);
  await page.screenshot({path:output+'/start-proposal-filled.png'});
  await dialog.getByRole('button',{name:'시작',exact:true}).click();const made2=await opened();
  assert.deepEqual(made2.scene.rooms.map(r=>r.name),['로비','회의실']);
  assert.deepEqual(productsIn(made2.scene,'로비'),['qm65c'],'the plan put the signage in the lobby');
  assert.deepEqual(productsIn(made2.scene,'회의실').sort(),['flip','qm65c'],'the meeting room template already has the Flip; the plan adds the signage');
  assert.equal(await page.evaluate(async id=>{const store=await import('/src/repositories/proposals.js');return store.getProposal(id).spacePlan.birdseye||null;},pid),null,'the proposal itself is left as it was');
  pass('start › 제안서 불러오기 fills the industry and spaces from the proposal and places only its chosen products in fitting spaces');

  assert.deepEqual(app.errors,[]);
  console.log(JSON.stringify({ok:true,checks:app.checks.length,output}));
}finally{await app.close();}
