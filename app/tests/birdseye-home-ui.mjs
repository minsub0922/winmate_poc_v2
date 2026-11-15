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
  assert.equal(await page.getByRole('button',{name:'조감도',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'건물 조감도',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'공간 조감도',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'조감도',exact:true}).getAttribute('aria-current'),'page');
  assert.equal((await page.locator('.be-home h1').textContent()).replace('BETA','').trim(),'조감도');
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
  assert.equal(await page.getByRole('button',{name:'조감도',exact:true}).getAttribute('aria-current'),'page');
  await page.locator('.bd-page button',{hasText:'뒤로 가기'}).click();await page.locator('.be-home .sp-history .be-entry').first().waitFor();assert.equal(new URL(page.url()).pathname,'/spatial');
  // 예전 '건물 목록'에 머물던 상태로 다시 열어도 통합 목록으로 온다
  await page.evaluate(async()=>{const store=await import('/src/repositories/proposals.js');store.saveUi({...store.loadUi(),route:{name:'building'}});});
  await page.goto(base+'/');await page.locator('.be-home .sp-history .be-entry').first().waitFor({timeout:60000});assert.equal(new URL(page.url()).pathname,'/spatial');
  pass('a building card opens the building studio; back — and a saved “building list” state — return to the unified list');

  // 삭제 — 종류에 맞게
  const total=Number(await page.locator('.sp-history .sp-history-count').textContent());
  await page.locator(`.sp-history [data-history-id="${made.at(-1).id}"] .sp-history-delete`).click();await page.getByRole('dialog',{name:'조감도를 삭제할까요?'}).getByRole('button',{name:'삭제'}).click();
  await page.waitForFunction(n=>Number(document.querySelector('.sp-history .sp-history-count')?.textContent)===n,total-1);
  while(!(await page.locator('.sp-history .be-entry[data-type=building]').count()))await page.getByRole('button',{name:'다음 페이지'}).click().then(()=>page.waitForTimeout(400));
  await page.locator('.sp-history .be-entry[data-type=building] .sp-history-delete').first().click();await page.getByRole('dialog',{name:'건물을 삭제할까요?'}).getByRole('button',{name:'삭제'}).click();
  await page.waitForFunction(n=>Number(document.querySelector('.sp-history .sp-history-count')?.textContent)===n,total-2);
  assert.equal(await page.evaluate(async()=>(await window.__wmBldMod_.app.list()).length),buildings-1);
  pass('deleting a card removes the spatial record or the building it stands for');

  // 시작 팝업 — 공간 · 빈 스튜디오는 업종을 골라야 시작된다
  const open=async()=>{await page.goto(base+'/spatial');await page.getByRole('button',{name:/조감도 스튜디오 시작/}).click();return page.getByRole('dialog',{name:'조감도 스튜디오 시작'});};
  let dialog=await open();
  assert.deepEqual(await dialog.getByRole('group',{name:'조감도 종류'}).getByRole('button').evaluateAll(nodes=>nodes.map(n=>n.querySelector('strong').firstChild.textContent)),['공간 조감도','건물 조감도']);
  assert.equal(await dialog.getByRole('group',{name:'시작 방법'}).count(),0);
  await dialog.getByRole('button',{name:/^공간 조감도/}).click();
  assert.deepEqual(await dialog.getByRole('group',{name:'시작 방법'}).getByRole('button').evaluateAll(nodes=>nodes.map(n=>n.querySelector('strong').textContent)),['빈 스튜디오','내 Storyboard에서','업종 템플릿']);
  await dialog.getByRole('button',{name:/^빈 스튜디오/}).click();
  const start=dialog.getByRole('button',{name:'시작',exact:true});assert(await start.isDisabled());
  await page.screenshot({path:output+'/start-dialog.png'});
  await dialog.getByRole('group',{name:'업종 선택'}).getByRole('button').nth(7).click();assert(!(await start.isDisabled()));
  await start.click();await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-blank-canvas').waitFor({timeout:60000});
  const blankId=decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1)),blank=await api.get('/api/spatial/history/'+blankId);
  assert.equal(blank.scene,null);assert.equal(blank.form.industry,library.industries[7].code);assert.deepEqual(blank.form.rooms,[]);
  assert.equal(await page.getByRole('combobox',{name:'조감도 편집 프롬프트'}).getAttribute('aria-disabled'),'false');
  pass('start › 공간 › 빈 스튜디오 needs an industry, then opens a blank studio with the command input ready');

  // 업종 템플릿 — 갤러리에서 고르면 구성된 스튜디오가 열린다
  dialog=await open();await dialog.getByRole('button',{name:/^공간 조감도/}).click();await dialog.getByRole('button',{name:/^업종 템플릿/}).click();
  await dialog.locator('.sp-map-open').first().waitFor({timeout:60000});await page.screenshot({path:output+'/start-templates.png'});
  await dialog.locator('.sp-map-open').first().click();await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  assert(await page.locator('.sp-room-strip button').count()>1);
  pass('start › 공간 › 업종 템플릿 opens a furnished studio from the gallery');

  // 내 Storyboard — 공간 구성이 있는 제안서로 조감도를 만들고, 그 제안서의 조감도로 등록된다
  await page.goto(base+'/spatial');await page.locator('.be-home').waitFor();
  const pid=await page.evaluate(async()=>{
    const store=await import('/src/repositories/proposals.js');const id=store.createProposal();
    store.update(id,d=>{d.title='스마트 오피스 제안';d.customer='테스트 고객';d.ind='OF';d.req.free=[{t:'로비와 회의실에 디스플레이를 설치하고 싶어요'}];d.ctx.products=['qm65c'];
      d.spacePlan={v:1,vertical:{id:'test-vertical',name:'대기업 사옥',group:'OF'},title:'핵심 공간',summary:'로비와 회의실',at:Date.now(),spaces:[{id:'s1',name:'로비',kind:'reception',note:'',products:['qm65c']},{id:'s2',name:'회의실',kind:'meeting',note:'',products:['qm65c']}]};});
    return id;});
  await app.saved();   // 제안서 저장(브라우저 · 계정)이 끝난 뒤 다시 연다
  dialog=await open();await dialog.getByRole('button',{name:/^공간 조감도/}).click();await dialog.getByRole('button',{name:/^내 Storyboard에서/}).click();
  const choice=dialog.locator(`[data-proposal-id="${pid}"]`);await choice.waitFor();assert.match(await choice.textContent(),/테스트 고객/);assert.match(await choice.textContent(),/공간 구성 2곳/);
  assert(await dialog.getByRole('button',{name:'시작',exact:true}).isDisabled());await choice.click();await page.screenshot({path:output+'/start-storyboard.png'});
  await dialog.getByRole('button',{name:'시작',exact:true}).click();await page.waitForURL(/\/spatial\/sp-/,{timeout:120000});await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  const fromStoryboard=decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1));
  assert.deepEqual(await page.locator('.sp-room-strip button').allTextContents().then(list=>list.slice(1).map(text=>text.replace(/^\d+/,''))),['로비','회의실']);
  const registered=await page.evaluate(async id=>{const store=await import('/src/repositories/proposals.js');return store.getProposal(id).spacePlan.birdseye;},pid);
  assert.equal(registered.status,'done');assert.equal(registered.historyId,fromStoryboard);
  // 같은 제안서로 다시 시작하면 새로 만들지 않고 그 조감도를 연다
  dialog=await open();await dialog.getByRole('button',{name:/^공간 조감도/}).click();await dialog.getByRole('button',{name:/^내 Storyboard에서/}).click();
  await dialog.locator(`[data-proposal-id="${pid}"]`).click();assert.match(await dialog.locator(`[data-proposal-id="${pid}"]`).textContent(),/조감도 있음/);
  await dialog.getByRole('button',{name:'시작',exact:true}).click();await page.waitForURL(u=>decodeURIComponent(new URL(u).pathname)==='/spatial/'+fromStoryboard);
  pass('start › 공간 › 내 Storyboard builds the birdseye from the proposal’s space plan, registers it as that proposal’s, and reopens it next time');

  assert.deepEqual(app.errors,[]);
  console.log(JSON.stringify({ok:true,checks:app.checks.length,output}));
}finally{await app.close();}
