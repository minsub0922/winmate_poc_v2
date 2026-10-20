// These are interactions with the production application's routed pages.
// Do not mount lookalike components or rewrite DOM text/styles for recordings.
import fs from 'node:fs';
import path from 'node:path';
const requirement='전국 320개 매장의 메뉴와 가격을 본사에서 일괄 변경하고 싶습니다. 시간대별 전환과 원격 장애 확인이 필요합니다.';
const clone=value=>structuredClone(value);
export async function recordGuideStep(session,guide,step,index,capture){
 const {page,seed,reset,base}=session;
 let point={x:660,y:390},phase=0;
 const shot=async(label)=>{await page.waitForTimeout(240);await capture(phase++,point,label);};
 const click=async locator=>{await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();if(b)point={x:b.x+b.width/2,y:b.y+b.height/2};await locator.click();};
 const fill=async(locator,value)=>{await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();if(b)point={x:b.x+Math.min(110,b.width/2),y:b.y+Math.min(25,b.height/2)};await locator.fill(value);};
 const draft=(stage='req',filled=true,linked=false)=>{const p=clone(seed.blank);p.stage=stage;if(filled){p.title='전국 매장 메뉴보드 전환 제안';p.customer='A 커피';p.ind='FB';p.req.free=[{t:requirement}];p.req.form.project=p.title;p.req.form.customer=p.customer;}if(linked)p.ctx=clone(seed.complete.ctx);return p;};
 const proposal=async(p)=>{await reset({name:'proposal',id:p.id},{draft:p});await page.locator('#pr-title').waitFor();};
 const completed=async()=>{await reset({name:'proposal',id:seed.complete.id});await page.locator('.lcard').first().waitFor();};
 const req=()=>page.getByRole('dialog',{name:'고객 요구사항',exact:true});
 const match=()=>page.getByRole('dialog',{name:'제품 · 솔루션 매칭',exact:true});
 const openMatch=async()=>{await proposal(draft('match',true,true));await match().waitFor();};
 const picker=async()=>{const p=draft('story',true,true);p.parts=[{id:'guide-part',type:'value',name:'운영 가치',items:['본사 일괄 운영','시간대별 메뉴 전환','원격 장애 확인'],form:'list',text:'',done:true,layouts:[]}];await proposal(p);await click(page.getByRole('button',{name:'PPT 레이아웃 추가',exact:true}));await page.locator('#pk-q').waitFor();};
 const detail=async()=>{await completed();await click(page.locator('.lcard').first());await page.locator('.detail-left').waitFor();};
 const library=async(name='library')=>{await reset({name});await page.locator('#tl-q').waitFor();};
 const scenario=async()=>{await reset({name:'scenarios'});await page.locator('#bs-q').waitFor();};
 const summary=async()=>{
  const p=draft('story',true,true);
  await proposal(p);
  await page.evaluate(async id=>{const repo=await import('/src/repositories/proposals.js'),d=await import('/src/domain/proposals/requirement-summary.js'),p=repo.getProposal(id),key=d.requirementSourceKey(p),sources=d.requirementSources(p),source=sources.find(s=>s.id==='free'),point={text:source.text,kind:'fact',refs:[{source_id:'free',quote:source.text}]};repo.update(id,p=>{p.requirementSummary={sourceKey:key,status:'ready',result:{source_key:key,sources,coverage:{complete:true},llm:{effective:'llm',model:'guide-input-example'},summary:{overview:point,...Object.fromEntries(d.SUMMARY_SECTIONS.map(([k])=>[k,['goals','requirements'].includes(k)?[point]:[]]))}}};},{touch:false});},p.id);
 };
 if(guide.id==='scenarios'&&['form','board','sheet','editor'].includes(step.view)){
  await scenario();await fill(page.locator('#bs-q'),'메뉴보드');await click(page.getByRole('button',{name:seed.complete.title+' 상세 보기',exact:true}));await page.locator('.modal.sbv').waitFor();await shot('scenario-storyboard');
  if(step.view==='form'){await click(page.locator('.modal.sbv .start-node .node'));await page.getByRole('dialog',{name:'고객 요구사항',exact:true}).waitFor();await shot('scenario-requirements');await page.locator('.rq-body').evaluate(el=>el.scrollTop=el.scrollHeight);await shot('scenario-keymen');}
  else if(step.view==='sheet'){await click(page.locator('.modal.sbv .lcard').first());await page.locator('.modal.sheet').waitFor();await shot('scenario-filled-slide');await click(page.getByRole('button',{name:'다음 장',exact:true}));await shot('scenario-next-slide');}
  else if(step.view==='editor'){await click(page.locator('.modal.sbv').getByRole('button',{name:'활용하기',exact:true}));await page.getByRole('dialog',{name:'이 Best Scenario를 활용할까요?',exact:true}).waitFor();await shot('scenario-copy-confirmation');await click(page.getByRole('dialog',{name:'이 Best Scenario를 활용할까요?',exact:true}).getByRole('button',{name:'활용하기',exact:true}));await page.locator('main.main .story .lcard').first().waitFor();await shot('scenario-editable-copy');}
  else{await page.locator('.modal.sbv .canvas').evaluate(el=>el.scrollLeft=600);await shot('scenario-readonly-parts');await click(page.locator('.modal.sbv .col[data-pid] .node').first());await shot('scenario-readonly-part');}
 }else if(guide.id==='history'&&step.view==='requirements'){
  await proposal(draft());await shot('requirements');await click(page.getByRole('button',{name:'이전 히스토리에서 불러오기',exact:true}));await page.locator('.history-reuse').waitFor();await shot('requirement-history-reuse');await click(page.locator('.reuse-item').first());await shot('requirement-history-preview');
 }else if(step.view==='new-proposal'){
  await reset({name:'home'},{draft:draft('req',false)});await page.locator('.home-actions .start').waitFor();await shot('home');
  await click(page.getByRole('button',{name:'새 제안서 시작',exact:true}));await page.locator('#free-ed').waitFor();await shot('empty-requirements');
  await fill(page.locator('#free-ed'),requirement);await shot('requirements-input');
 }else if(step.view==='home'){
  if(step.focus==='login')await session.context.request.post(base+'/api/auth/logout');
  await reset({name:'home'});await page.locator('.home').waitFor();await shot('home');
  if(step.focus==='navigation'){
   await page.locator('.sidebar').hover({position:{x:22,y:120}});await page.waitForTimeout(300);await shot('sidebar-expanded');await page.locator('.sb-tpl').hover();await shot('sidebar-library');
  }else if(step.focus==='login'){
   await click(page.getByRole('button',{name:'새 제안서 시작',exact:true}));await page.locator('[data-login-mode="modal"]').waitFor();await shot('login-prompt');await click(page.getByRole('button',{name:'로그인 닫기',exact:true}));await shot('login-dock');await session.login();
  }else{await page.locator('.home-actions .start').hover();await shot('new-proposal-entry');await page.locator('.main').evaluate(el=>el.scrollTop=400);await shot('home-examples');}
 }else if(step.view==='requirements'){
  await proposal(draft('req',step.focus==='save'));await page.locator('#free-ed').waitFor();await shot('requirements');
  if(step.focus==='request'){
   await fill(page.locator('#pr-title'),'전국 매장 메뉴보드 전환 제안');await click(req().getByRole('tab',{name:/입력 폼/}));await fill(page.locator('#f-customer'),'A 커피');await shot('customer-form');await fill(page.locator('#f-project'),'전국 매장 메뉴보드 전환');await shot('project-form');
  }else if(step.focus==='save'){
   await fill(page.locator('#free-ed'),requirement);await shot('requirements-before-save');await click(req().getByRole('button',{name:'저장',exact:true}));await match().waitFor();await shot('matching');
  }else{
   await fill(page.locator('#free-ed'),'전국 320개 매장의 메뉴를 본사에서 변경하고 싶습니다.');await shot('requirements-typed');await fill(page.locator('#free-ed'),requirement);await shot('requirements-completed');
  }
 }else if(step.view==='form'){
  await proposal(draft());await click(req().getByRole('tab',{name:/입력 폼/}));await page.locator('#f-project').waitFor();await shot('form');await fill(page.locator('#f-project'),'전국 매장 메뉴보드 전환');await fill(page.locator('#f-customer'),'A 커피');await shot('form-customer');await fill(req().getByRole('textbox',{name:'키맨 직책',exact:true}).first(),'운영본부장');await shot('form-keyman');
 }else if(step.view==='attachment'){
  await proposal(draft());await shot('attachment-drop');await req().locator('input[type=file]').setInputFiles({name:'고객 요구사항.txt',mimeType:'text/plain',buffer:Buffer.from(requirement)});await page.locator('.fchips').waitFor();await shot('attachment-added');await click(page.getByRole('button',{name:'고객 요구사항.txt 정보 보기',exact:true}));await shot('attachment-original');
 }else if(step.view==='summary'){
  await summary();await page.getByRole('region',{name:'고객 요구사항 요약',exact:true}).waitFor();await shot('summary');await click(page.getByRole('button',{name:/원문 보기/}).first());await shot('summary-source');await click(page.getByRole('dialog',{name:/요구사항 원문/}).getByRole('button',{name:'닫기',exact:true}).last());await click(page.locator('.rq-summary-sections summary'));await shot('summary-sections');
 }else if(step.view==='match'){
  const p=draft('match',true,step.focus==='solutions');if(step.focus==='solutions')p.ctx.solutions=[];await proposal(p);await match().waitFor();await shot('matching');
  const kind=step.focus==='solutions'?'솔루션':'제품';await click(match().getByRole('button',{name:new RegExp('^'+kind+' 추가 —')}));await page.locator('#ex-q-in').waitFor();await fill(page.locator('#ex-q-in'),kind==='제품'?'QM55C':'MagicINFO');await shot('matching-search');
  await click(page.locator('.ex-row[aria-disabled]:not([aria-disabled=true]),.ex-row:not([aria-disabled]),.ex-tile:not([aria-disabled=true])').first());await click(page.getByRole('button',{name:/^1개 연결$/}));await match().waitFor();
  if(step.focus==='solutions'){await click(match().getByRole('button',{name:'저장',exact:true}));await page.getByRole('button',{name:'첫 번째 파트 직접 만들기',exact:true}).waitFor();await shot('empty-storyboard');}else await shot('matching-linked');
 }else if(step.view==='board'||step.view==='strategy'){
  if(step.partCount===1){await proposal(draft('story',true,true));await page.locator('.end-plus').waitFor();await shot('empty-board');await click(page.getByRole('button',{name:'첫 번째 파트 직접 만들기',exact:true}));await page.locator('#pe-name').waitFor();await shot('part-form');await fill(page.locator('#pe-name'),'고객 요구와 운영 가치');await fill(page.locator('#pe-text'),'본사 일괄 운영\n매장별 장애 대응\n운영 부담 절감');await shot('part-input');}
  else{await completed();await shot('storyboard');if(step.focus==='progress'){await page.locator('.canvas').evaluate(el=>el.scrollLeft=el.scrollWidth);await click(page.getByRole('button',{name:'AI로 나머지 구성',exact:true}));await shot('compose-request');await page.waitForTimeout(900);await shot('compose-job');}else{await page.locator('.canvas').evaluate(el=>el.scrollLeft=Math.min(el.scrollWidth-el.clientWidth,600));await shot('storyboard-parts');await click(page.locator('.col[data-pid] .node').first());await page.locator('#pe-text').waitFor();await shot('part-details');}}
 }else if(step.view==='part'){
  await completed();await click(page.locator('.col[data-pid] .node').nth(1));await page.locator('#pe-text').waitFor();await shot('part-details');
  if(step.focus==='ai'){await click(page.getByRole('button',{name:'AI 제안',exact:true}));await page.getByRole('dialog',{name:'AI 제안',exact:true}).waitFor();await shot('part-ai-proposal');await click(page.getByRole('button',{name:'승인 · 내용에 추가',exact:true}));await shot('part-ai-accepted');}
  else{await fill(page.locator('#pe-text'),'메뉴·가격의 당일 반영\n본사 일괄 배포와 매장별 운영 통제\n파일럿의 검증 조건과 다음 행동');await shot('part-edited');await click(page.getByRole('button',{name:/작성 완료/,exact:false}).last());await shot('part-completed');}
 }else if(['catalog','filter','picker'].includes(step.view)){
  const picking=step.view==='picker';if(picking)await picker();else await library();await shot(picking?'layout-picker':'layout-library');
  if(step.view==='filter'){await click(page.getByRole('button',{name:'필터',exact:true}));await page.locator('.modal.tlf').waitFor();await shot('layout-filters');await click(page.locator('.tlf-step').first().getByRole('button').nth(1));await shot('layout-filter-selected');}
  else if(step.focus==='favorites'&&picking){await click(page.locator('.pk-fav-toggle'));await page.locator('#pk-favorites').waitFor();await shot('picker-favorites');await click(page.locator('#pk-favorites .pk-favcard').first());await shot('picker-favorite-selected');}
  else{const q=page.locator(picking?'#pk-q':'#tl-q');if(step.focus==='ai')await click(page.getByRole('button',{name:'AI 검색',exact:true}));await fill(q,step.focus==='ai'?'전국 매장 메뉴를 본사에서 일괄 관리하는 운영 흐름':'도입 효과');await shot('layout-search');if(picking){await click(page.locator('.pk-all .pcard,.pk-rec .pcard').first());await shot('layout-selected');}else if(step.focus==='ai'){await q.press('Enter');await shot('layout-ai-request');}else{await click(page.locator('.tl-card').first());await page.locator('.modal.sheet').waitFor();await shot('layout-detail');}}
 }else if(['sheet','editor'].includes(step.view)){
  if(guide.id==='library'||guide.id==='scenarios'||guide.id==='my'){await library();await click(page.locator('.tl-card').first());await page.locator('.modal.sheet').waitFor();}
  else await detail();
  await shot('slide-detail');
  if(step.focus==='viewer'){await click(page.getByRole('button',{name:'닫기',exact:true}).last());await click(page.locator('.lay-toggle'));await page.locator('.viewer').waitFor();await shot('slide-viewer');await click(page.getByRole('button',{name:'PPTX 내보내기',exact:true}));await shot('export-options');}
  else if(step.view==='editor'){await click(page.getByRole('button',{name:'수정하기',exact:true}));await page.locator('.modal.sheet').waitFor();await shot('slide-editor');const target=page.locator('.modal.sheet [data-tb]').first();await click(target);await shot('slide-text-selected');}
  else if(guide.id==='library'||guide.id==='scenarios'||guide.id==='my'){await click(page.getByRole('button',{name:'다음 장',exact:true}));await shot('next-layout');await page.locator('.sv-panel').evaluate(el=>el.scrollTop=el.scrollHeight);await shot('layout-metadata');}
  else{const target=page.locator('.detail-left [data-tb],.sv-fit [data-tb]').first();await click(target);await shot('slide-text-context');await page.getByRole('button',{name:/원문|근거|참고/}).first().hover().catch(()=>{});await shot('slide-evidence');}
 }else if(step.view==='scenarios'){
  await scenario();await shot('scenarios');await fill(page.locator('#bs-q'),'메뉴보드');await shot('scenario-search');await click(page.locator('.bsl').first().getByRole('button',{name:/상세 보기$/}));await page.locator('.modal.sbv').waitFor();await shot('scenario-storyboard');
 }else if(step.view==='share'||step.view==='export'){
  await completed();await shot('storyboard');
  if(step.view==='share'){await click(page.locator('.storyboard-share-control button'));await page.getByRole('dialog',{name:'Storyboard 공유',exact:true}).waitFor();await shot('sharing-dialog');await page.getByRole('combobox',{name:'링크 접근 권한',exact:true}).selectOption('edit');await shot('sharing-permission');}
  else{await click(page.locator('.lay-toggle'));await click(page.getByRole('button',{name:'PPTX 내보내기',exact:true}));await shot('export-dialog');await page.getByRole('dialog',{name:'PPTX 내보내기',exact:true}).locator('.mbody').evaluate(el=>el.scrollTop=el.scrollHeight);await shot('export-slides');}
 }else if(step.view==='history'&&guide.id==='spatial'){
  await reset({name:'spatial'});await page.locator('.sp-history-card').first().waitFor({timeout:60000});await page.locator('.sp-history').scrollIntoViewIfNeeded();await shot('spatial-history');await click(page.locator('.sp-history-open').first());await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});await click(page.getByRole('button',{name:'2D 평면도',exact:true}));await shot('spatial-saved-plan');await fill(page.getByRole('textbox',{name:'조감도 이름',exact:true}),'매장 운영 동선 검토');await shot('spatial-saved-edit');
 }else if(step.view==='history'){
  await completed();await shot('proposal-history');await page.locator('.sidebar').hover({position:{x:20,y:440}});await page.waitForTimeout(300);await shot('sidebar-history');await click(page.locator('.sb-history-row').first().locator('.sb-item'));await shot('history-opened');
 }else if(['my','favorites'].includes(step.view)){
  const mine=step.view==='my';await library(mine?'my':'favorites');await shot(mine?'my-templates':'favorites');
  if(mine&&['upload','import'].includes(step.focus)){
   const file=path.resolve('build/fixtures/review_sample.pptx');if(!fs.existsSync(file))throw new Error('Native PPTX fixture is missing');await page.locator('input[data-my-file]').setInputFiles(file);await page.getByRole('button',{name:/장 My에 저장$/}).waitFor({timeout:60000});await shot('pptx-import');await page.getByRole('button',{name:/장 My에 저장$/}).hover();await shot('pptx-import-selection');
  }else{await fill(page.locator('#tl-q'),mine?'매장':'');await shot('personal-search');await click(page.locator(mine?'.tl-card':'.fav-card').first());await page.locator('.modal.sheet').waitFor();await shot('personal-detail');}
 }else if(step.view==='review'){
  await reset({name:'reviews'});await page.locator('.rvh').waitFor();await shot('review-history');
  if(['upload','progress'].includes(step.focus)){
   const file=path.resolve('build/fixtures/review_sample.pptx');await page.locator('.rvh input[type=file]').setInputFiles(file);await page.locator('.rv').waitFor();await shot('review-document');await page.waitForTimeout(500);await shot('review-progress');
  }else{await click(page.locator('.rvh-card').first());await page.locator('.rv-report').waitFor();await shot('review-report');if(step.focus==='criteria'){await click(page.getByRole('button',{name:'검토 점수 기준 보기',exact:true}));await shot('review-criteria');}else if(step.focus==='retry'){await click(page.getByRole('button',{name:/기준 조정.*다시 평가/}));await shot('review-adjustments');}else{await page.locator(step.focus==='report'?'.rv-priorities':'.rv-deck').scrollIntoViewIfNeeded();await shot('review-evidence');}}
 }else if(step.view==='simulation'){
  if(['setup','profile'].includes(step.focus)){await reset({name:'sim'});await page.locator('.ss-go').waitFor();await shot('simulation-setup');await click(page.locator(step.focus==='profile'?'.ss-pickp':'.ss-reqsum,.ss-reqempty').first());await page.getByRole('dialog').waitFor();await shot('simulation-setup-dialog');await page.getByRole('dialog').locator('.mbody').evaluate(el=>el.scrollTop=120);await shot('simulation-setup-options');}
  else{await reset({name:'sim',id:seed.sim.id});await page.locator('#sim-ed').waitFor();await shot('simulation-meeting');if(step.focus==='skill-result'){await click(page.getByRole('button',{name:'작업 과정·답변 보기',exact:true}).first());await page.locator('.sim-skill-modal').waitFor();await shot('simulation-skill-result');await click(page.getByRole('button',{name:'이 답변 사용',exact:true}).first());await shot('simulation-draft');}else if(step.focus==='skills'||step.focus==='references'){await fill(page.locator('#sim-ed'),'@');await page.getByRole('listbox').waitFor();await shot('simulation-mentions');await click(page.getByRole('listbox').getByRole('button',{name:step.focus==='skills'?'스킬':'솔루션',exact:true}));await shot('simulation-reference-options');}else if(step.focus==='feedback'){await click(page.locator('.sim-who'));await shot('simulation-profile');await page.locator('.sim-panel').evaluate(el=>el.scrollTop=300);await shot('simulation-feedback');}else if(step.focus==='debrief'){await click(page.getByRole('button',{name:'미팅 마무리',exact:true}));await shot('simulation-closing');await page.waitForTimeout(350);await shot('simulation-debrief');}else{await fill(page.locator('#sim-ed'),'현재 메뉴 반영 지연을 먼저 확인하고 10개 매장에서 파일럿 검증을 제안합니다.');await shot('simulation-message');await page.locator('.sim-send').hover();await shot('simulation-ready-to-send');}}
 }else if(step.view==='spatial'){
  await reset({name:'spatial'});await page.locator('.sp-studio-launch').waitFor({timeout:60000});
  if(step.focus==='launch'||step.focus==='form'){
   await shot('spatial-home');await click(page.locator('.sp-studio-launch'));await page.locator('.sp-blank-canvas').waitFor();await shot('spatial-blank-studio');await page.getByLabel('업종',{exact:true}).selectOption('FB');await click(page.getByRole('button',{name:'공간 추가',exact:true}));await fill(page.getByLabel('공간 1 이름',{exact:true}),'입구 카운터');await shot('spatial-room-input');
  }else{
   await click(page.getByRole('button',{name:'업종별 템플릿 활용하기',exact:true}));await page.getByLabel('템플릿 업종',{exact:true}).selectOption('FB');await click(page.locator('.sp-maps-modal .sp-map-open').first());await click(page.getByRole('button',{name:'스튜디오로 이동',exact:true}));await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});await page.getByRole('button',{name:'2D 평면도',exact:true}).click();await shot('spatial-plan');
   if(step.focus==='views'){await click(page.getByRole('button',{name:'3D 조감도',exact:true}));await page.locator('.sp-view[data-ready=true] canvas').waitFor({timeout:120000});await shot('spatial-three-dimensional');await click(page.getByRole('button',{name:'2D 평면도',exact:true}));await shot('spatial-plan-again');}
   else if(step.focus==='objects'&&index===2){await click(page.locator('.sp-space-card').first().getByRole('button',{name:'제품 선택',exact:true}));await page.getByLabel('공간 제품 검색').waitFor();await fill(page.getByLabel('공간 제품 검색'),'QM55C');await shot('spatial-room-product-picker');await click(page.getByRole('button',{name:'선택 완료',exact:true}));const quantity=page.getByRole('spinbutton',{name:/수량/}).first();await fill(quantity,'2');await shot('spatial-room-product-quantity');}
   else if(step.focus==='objects'){const object=page.locator('.sp-plan-image [data-object-id]').first();await click(object);await shot('spatial-object-selected');const rect=await object.boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+18,rect.y+rect.height/2+10,{steps:6});await page.mouse.up();await shot('spatial-object-moved');}
   else if(step.focus==='extract'){await click(page.locator('.sp-layout-extract'));await page.getByRole('dialog',{name:'Layout 추출',exact:true}).waitFor({timeout:60000});await shot('spatial-layout-extraction');await page.getByRole('button',{name:'저장하기',exact:true}).hover();await shot('spatial-layout-save');}
   else if(step.focus==='ai'){const input=page.locator('.sp-prompt [contenteditable=true],.sp-prompt textarea').first();await fill(input,'@');await shot('spatial-target-mention');await fill(input,'입구 화면을 고객 동선 방향으로 옮겨 주세요.');await shot('spatial-edit-request');}
   else{const object=page.locator('.sp-plan-image [data-object-id]').first();await click(object);await shot('spatial-selected-object');await page.locator('.sp-workspace').hover();await shot('spatial-object-details');}
  }
 }else throw new Error('No actual application recording for '+guide.id+' / '+step.view);
 if(phase!==3)throw new Error(`${guide.id}/${index+1}: recorded ${phase} screens instead of three`);
}
