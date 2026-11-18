// 조감도 스튜디오 시작 입력 — 업종의 추천 공간 · 자동완성(한글 조합 · 초성) · 공간 버블 · 업종 템플릿 · 공간 이름 → 스튜디오 입력 · 제안서 제품의 공간 배정 (domain/birdseye/start.js)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {recommendedSpaces,groupSpaces,searchSpaces,typedKeys,industryTemplates,addSpaceName,startRooms,assignProducts,namedKinds,spaceKey,MAX_START_SPACES,BASE_GROUP} from '../web/src/domain/birdseye/start.js';
import {createSceneFromForm,emptyStudioForm} from '../web/src/domain/spatial/studio-form.js';

const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const productsIn=(scene,roomId)=>scene.objects.filter(o=>o.assetId.startsWith('product:')&&(!roomId||o.roomId===roomId)).map(o=>o.assetId.slice(8));
const sceneOf=(industry,rooms)=>createSceneFromForm({...emptyStudioForm(),industry,rooms},library,{documentId:'test'});

// 추천 공간 — 업종마다 있고, 이름은 겹치지 않으며, 대표 공간이 있으면 먼저다
for(const industry of library.industries){
  const spaces=recommendedSpaces(library,industry.code);
  assert(spaces.length>0,industry.name+' has recommended spaces');
  assert.equal(new Set(spaces.map(s=>spaceKey(s.name))).size,spaces.length,industry.name+' names are unique');
  if(spaces.some(s=>s.group===BASE_GROUP))assert.equal(spaces[0].group,BASE_GROUP,industry.name+' lists its base spaces first');   // 버티컬 공간만 있는 업종도 있다
  assert(spaces.every(s=>s.kind&&s.templateId&&s.width>=4&&s.depth>=4));
}
assert.deepEqual(recommendedSpaces(library,''),[]);assert.deepEqual(recommendedSpaces(library,'??'),[]);
const office=recommendedSpaces(library,'OF'),names=office.map(s=>s.name);
assert(names.includes('회의실 · 협업')&&names.includes('임원실')&&names.includes('구내식당'));
assert(!names.some(name=>/장면|시나리오/.test(name)),'case templates are not spaces');
const groups=groupSpaces(office);
assert.equal(groups[0].name,BASE_GROUP);assert.equal(groups.flatMap(g=>g.items).length,office.length);assert(groups.length>1);

// 자동완성 — 아직 치지 않았으면 추천 순서대로, 치면 좁힌다. 띄어쓰기 · 기호 무시, 앞에서 맞는 이름 먼저, 이미 넣은 공간은 빼고
assert.deepEqual(searchSpaces(office,'').map(s=>s.name),names.slice(0,8),'before typing: the first recommendations');
assert.deepEqual(searchSpaces(office,'   ',[names[0]]).map(s=>s.name),names.slice(1,9));
const found=searchSpaces(office,'회의').map(s=>s.name);
assert(found.length>1&&found.every(name=>name.includes('회의')));assert(found[0].startsWith('회의'),'prefix matches come first');
assert(!searchSpaces(office,'회의',['회의실 · 협업']).some(s=>s.name==='회의실 · 협업'));
assert.equal(searchSpaces(office,'회의실협업')[0].name,'회의실 · 협업');
assert(searchSpaces(office,'실',[],3).length<=3);
assert.deepEqual(searchSpaces(office,'없는공간'),[]);
// 한글은 누르는 자모 순서로 비교한다 — '회의실'을 치는 도중의 모든 상태(호 · 회 · 횡 · 회으 · 회의 · 회읫 · 회의시)가 같은 결과다
assert.equal(typedKeys('횡'),'ㅎㅗㅣㅇ');assert.equal(typedKeys('회의실'),'ㅎㅗㅣㅇㅡㅣㅅㅣㄹ');assert.equal(typedKeys('값 A'),'ㄱㅏㅂㅅa');
for(const partial of ['회','횡','회으','회의','회읫','회의시','회의실'])assert.deepEqual(searchSpaces(office,partial).map(s=>s.name),found,partial);
assert(searchSpaces(office,'호').some(s=>s.name==='회의실 · 협업'),'the first vowel stroke of a compound vowel already matches');
// 자음만 치면 초성으로 찾는다
assert.deepEqual(searchSpaces(office,'ㅎㅇㅅ').map(s=>s.name),found);assert(searchSpaces(office,'ㄹㅂ').every(s=>s.name.includes('로비')));

// 업종 템플릿 — 그 업종의 표준 크기 전체 맵만. 업종마다 하나 이상 있다
for(const industry of library.industries){
  const templates=industryTemplates(library,industry.code);
  assert(templates.length>0,industry.name+' has a template');
  assert(templates.every(t=>t.industry===industry.code&&t.scope==='full'&&t.variant==='standard'&&t.rooms.length>1));
  assert.equal(new Set(templates.map(t=>t.id)).size,templates.length);
}
assert.equal(industryTemplates(library,'OF')[0].id,'of-full-standard','the industry’s own overview comes first');assert.deepEqual(industryTemplates(library,''),[]);

// 버블 — 빈 이름 · 같은 이름 · 한도
assert.deepEqual(addSpaceName([],'  회의실  '),{names:['회의실'],error:''});
assert.deepEqual(addSpaceName(['회의실'],'   '),{names:['회의실'],error:''});
let held=['회의실 · 협업'],again=addSpaceName(held,'회의실·협업');
assert.equal(again.names,held,'the same list comes back');assert.match(again.error,/이미/);
assert.match(addSpaceName([],'가'.repeat(101)).error,/100자/);
const filled=Array.from({length:MAX_START_SPACES},(_,i)=>'공간 '+i);
assert.match(addSpaceName(filled,'하나 더').error,new RegExp(MAX_START_SPACES+'개'));

// 공간 이름 → 스튜디오 입력: 추천 공간은 템플릿의 용도 · 구성을, 직접 쓴 이름은 이름에서 짐작한 용도를 쓴다. 제품은 없다.
const entries=startRooms(['임원실','우리 팀 창고','쉼터'],office,{kinds:{'쉼터':'dining'}});
assert.equal(entries[0].spec.name,'임원실');assert.equal(entries[0].room.kind,'office');assert.equal(entries[0].room.equipmentPolicyVersion,1);assert.equal(entries[0].room.width,entries[0].spec.width);
assert.equal(entries[1].spec,null);assert.equal(entries[1].room.kind,'warehouse');
assert.equal(entries[2].room.kind,'dining','a hinted kind (from a proposal plan) wins for a free name');
assert(entries.every(entry=>entry.room.products.length===0));assert.equal(new Set(entries.map(entry=>entry.room.id)).size,3);
const bare=sceneOf('OF',entries.map(entry=>entry.room));
assert.deepEqual(bare.rooms.map(r=>r.name),['임원실','우리 팀 창고','쉼터']);
assert.deepEqual(productsIn(bare),[],'without a proposal no product object is placed');
assert(bare.objects.length>0,'furniture and people are placed');
// 어느 업종이든 추천 공간 전부(한도까지)로 장면이 만들어지고 제품은 없다
for(const industry of library.industries){
  const spaces=recommendedSpaces(library,industry.code).slice(0,MAX_START_SPACES);
  const scene=sceneOf(industry.code,startRooms(spaces.map(s=>s.name),spaces).map(entry=>entry.room));
  assert.equal(scene.rooms.length,spaces.length);assert.deepEqual(productsIn(scene),[],industry.name);
}

// 제품 배정 — 템플릿에 이미 있는 제품은 그 공간(과 수량), 공간 구성이 둔 제품은 그 공간, 아니면 제품군 → 용도 순
const lobby=office.find(s=>s.name==='로비 · 외벽 · 공용 동선'),meeting=office.find(s=>s.name==='회의실 · 협업');
assert(lobby.productIds.includes('qm55c')&&meeting.productIds.includes('flip'));
const rooms=[{id:'a',kind:'reception',spec:lobby,categories:['lcd_std']},{id:'b',kind:'meeting',spec:meeting,planned:['qm55c'],categories:['iwb']},{id:'c',kind:'kitchen',spec:null,categories:[]}];
const options={catsOf:id=>({x1:['iwb'],x2:['nothing']}[id]||[]),kindsOf:id=>({x2:['kitchen']}[id]||[])};
const assigned=assignProducts(rooms,['qm55c','flip','x1','x2','x3','qm55c'],options);
assert.deepEqual(assigned.byRoom.get('a'),[{productId:'qm55c',quantity:1}],'the template room comes first');
assert.deepEqual(assigned.byRoom.get('b').map(p=>p.productId),['qm55c','flip','x1'],'the plan room and a category fit');
assert.deepEqual(assigned.byRoom.get('c'),[{productId:'x2',quantity:1}],'a room of the product’s usual kind');
assert.deepEqual(assigned.unplaced,['x3']);
// 수량은 템플릿의 정수 수량만 따른다
const counted={...meeting,room:{...meeting.room,equipment:[{productId:'flip',quantity:2},{productId:'book',quantity:'tables'}]}};
const quantities=assignProducts([{id:'m',kind:'meeting',spec:counted}],['flip','book']).byRoom.get('m');
assert.deepEqual(quantities,[{productId:'flip',quantity:2},{productId:'book',quantity:1}]);
assert.deepEqual(assignProducts(rooms,[]).unplaced,[]);

// 배정한 제품이 실제 장면의 그 공간에 놓인다
const picked=startRooms(['로비 · 외벽 · 공용 동선','회의실 · 협업'],office);
const placedAt=assignProducts(picked.map(({room,spec})=>({id:room.id,kind:room.kind,spec})),['qm55c','flip']);
const withProducts=sceneOf('OF',picked.map(({room})=>({...room,products:placedAt.byRoom.get(room.id)})));
assert.deepEqual(productsIn(withProducts,picked[0].room.id),['qm55c']);assert.deepEqual(productsIn(withProducts,picked[1].room.id),['flip']);

assert.deepEqual(namedKinds(['로비','회의실','알 수 없는 곳']).sort(),['meeting','reception']);
assert.deepEqual(namedKinds(['라운지']),['lounge']);assert.deepEqual(namedKinds(null),[]);
console.log('birdseye-start: ok');
