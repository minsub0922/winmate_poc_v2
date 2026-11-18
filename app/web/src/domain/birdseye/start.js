// 조감도 스튜디오 시작 입력 — 업종 + 공간 목록(필수)으로 스튜디오를 연다. 순수 함수만 둔다(실행은 services/birdseye-start.js).
//   recommendedSpaces  업종의 추천 공간 = 그 업종의 공간 템플릿(공간 하나짜리 표준 템플릿). 이름이 같은 것은 하나로.
//   searchSpaces       입력창 위 실시간 자동완성 — 한글은 조합 중인 음절 · 초성으로도 찾는다.
//   startRooms         공간 이름 → 스튜디오 입력의 공간. 추천 공간과 이름이 같으면 그 템플릿의 용도 · 구성을 따른다.
//   assignProducts     제안서에서 고른 제품 → 공간. 공간 템플릿에 이미 있는 제품은 그 공간(과 수량)이 먼저다.
// 제품은 제안서에서 시작했을 때만 넣는다 — 그 밖에는 공간에 제품 오브젝트가 하나도 없다.
import {roomKind} from '../spatial/scene.js';
import {newStudioRoom} from '../spatial/studio-form.js';
import {namedRoomComposition} from '../spatial/space-characters.js';
import {verticalTitle,spatialTemplateCatalog} from '../spatial/template-catalog.js';

/** 시작할 때 넣을 수 있는 공간 수 */
export const MAX_START_SPACES=12;
export const BASE_GROUP='대표 공간';

/** 비교용 이름 — 띄어쓰기 · 구분 기호 · 대소문자를 무시한다 */
export const spaceKey=name=>String(name||'').toLocaleLowerCase().replace(/[\s·/,.()\-_]+/g,'');

/** 업종의 추천 공간 [{ name, kind, group, templateId, width, depth, room, compositionVersion, productIds }] — 대표 공간 먼저, 이어서 버티컬 순서 */
export function recommendedSpaces(library,industry){
  if(!library||!industry)return [];
  const verticals=new Map((library.verticals||[]).map(v=>[v.id,v])),seen=new Set(),out=[];
  for(const template of library.templates){
    if(template.industry!==industry||template.scope!=='single'||template.variant!=='standard'||template.id.startsWith('case-')||template.rooms.length!==1)continue;
    const room=template.rooms[0],name=String(room.name||'').trim(),key=spaceKey(name);
    if(!key||seen.has(key))continue;seen.add(key);
    const vertical=template.vertical&&verticals.get(template.vertical);
    out.push({name,kind:room.kind||roomKind(name),group:vertical?verticalTitle(vertical):BASE_GROUP,templateId:template.id,width:template.width,depth:template.depth,room,
      compositionVersion:template.compositionVersion||0,productIds:[...new Set([...(room.equipment||[]).map(item=>item.productId),...(room.productIds||[])])]});
  }
  return out;
}

/** 추천 공간을 묶음(대표 공간 · 버티컬)별로 — 추천 공간 창 */
export function groupSpaces(spaces){
  const groups=new Map();
  for(const space of spaces){if(!groups.has(space.group))groups.set(space.group,[]);groups.get(space.group).push(space);}
  return [...groups].map(([name,items])=>({name,items}));
}

// 한글 실시간 검색 — 글자를 두벌식 자판에서 누르는 순서의 자모로 풀어 비교한다. 조합 중인 음절도 맞는다:
// '회의'를 치는 도중의 '횡'(회 + ㅇ)은 ㅎㅗㅣㅇ 이고, '회의실'(ㅎㅗㅣㅇㅡㅣㅅㅣㄹ)의 앞부분이다.
const CHO=[...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const JUNG=['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅗㅏ','ㅗㅐ','ㅗㅣ','ㅛ','ㅜ','ㅜㅓ','ㅜㅔ','ㅜㅣ','ㅠ','ㅡ','ㅡㅣ','ㅣ'];
const JONG=['','ㄱ','ㄲ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ','ㄹㅌ','ㄹㅍ','ㄹㅎ','ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const COMPOUND={ㄳ:'ㄱㅅ',ㄵ:'ㄴㅈ',ㄶ:'ㄴㅎ',ㄺ:'ㄹㄱ',ㄻ:'ㄹㅁ',ㄼ:'ㄹㅂ',ㄽ:'ㄹㅅ',ㄾ:'ㄹㅌ',ㄿ:'ㄹㅍ',ㅀ:'ㄹㅎ',ㅄ:'ㅂㅅ',ㅘ:'ㅗㅏ',ㅙ:'ㅗㅐ',ㅚ:'ㅗㅣ',ㅝ:'ㅜㅓ',ㅞ:'ㅜㅔ',ㅟ:'ㅜㅣ',ㅢ:'ㅡㅣ'};
const syllable=ch=>{const code=ch.charCodeAt(0)-0xac00;return code>=0&&code<11172?code:-1;};
/** 누르는 순서의 자모(한글이 아닌 글자는 그대로) */
export function typedKeys(text){
  let out='';
  for(const ch of spaceKey(text)){const code=syllable(ch);out+=code<0?COMPOUND[ch]||ch:CHO[Math.floor(code/588)]+JUNG[Math.floor(code%588/28)]+JONG[code%28];}
  return out;
}
// 초성만 — 'ㅎㅇㅅ'으로 '회의실'을 찾는다
const initials=text=>{let out='';for(const ch of spaceKey(text)){const code=syllable(ch);out+=code<0?ch:CHO[Math.floor(code/588)];}return out;};

/**
 * 입력창 위에 띄울 자동완성 목록 — 이미 넣은 공간은 빼고, 앞에서부터 맞는 이름이 먼저다.
 * 아직 아무것도 치지 않았으면 추천 순서대로 앞의 것들을 보여 준다. 자음만 치면 초성으로 찾는다.
 */
export function searchSpaces(spaces,query,taken=[],limit=8){
  const used=new Set(taken.map(spaceKey)),free=spaces.filter(space=>!used.has(spaceKey(space.name)));
  const text=spaceKey(query);if(!text)return free.slice(0,limit);
  const keys=typedKeys(text),consonants=/^[ㄱ-ㅎ]+$/.test(text);
  const rankOf=name=>{const target=consonants?initials(name):typedKeys(name),wanted=consonants?text:keys;return target.startsWith(wanted)?0:target.includes(wanted)?1:-1;};
  return free.map((space,index)=>({space,index,rank:rankOf(space.name)})).filter(entry=>entry.rank>=0).sort((a,b)=>a.rank-b.rank||a.index-b.index).slice(0,limit).map(entry=>entry.space);
}

/** 그 업종에서 시작할 수 있는 조감도 템플릿 — 표준 크기의 전체 맵(대표 맵 · 버티컬 구역 맵 · 사례 맵, 같은 배치는 하나로) */
export function industryTemplates(library,industry){
  if(!library||!industry)return [];
  return spatialTemplateCatalog(library,{industry,scope:'full',variant:'standard'});
}

/** 공간 이름을 목록에 더한다 — 빈 이름 · 같은 이름 · 한도 초과는 이유(error)와 함께 그대로 돌려준다 */
export function addSpaceName(names,value,max=MAX_START_SPACES){
  const name=String(value||'').replace(/\s+/g,' ').trim();
  if(!name)return {names,error:''};
  if(name.length>100)return {names,error:'공간 이름은 100자 이내로 입력해 주세요.'};
  if(names.some(item=>spaceKey(item)===spaceKey(name)))return {names,error:`‘${name}’ 공간은 이미 넣었어요.`};
  if(names.length>=max)return {names,error:`공간은 ${max}개까지 넣을 수 있어요.`};
  return {names:[...names,name],error:''};
}

/**
 * 공간 이름 → 스튜디오 입력의 공간(제품 없이). 추천 공간과 이름이 같으면 그 템플릿의 용도 · 크기 · 구성 규칙을 쓰고,
 * 아니면 이름에서 용도를 짐작한다(명령으로 공간을 추가할 때와 같다). hints: 이름별 용도(제안서의 공간 구성에서 온 것).
 * @returns [{ room, spec }] — spec은 추천 공간(없으면 null)
 */
export function startRooms(names,recommended,{kinds={},industry=''}={}){
  const byKey=new Map(recommended.map(space=>[spaceKey(space.name),space]));
  return names.map(name=>{
    const spec=byKey.get(spaceKey(name))||null,room=newStudioRoom(name);
    // 템플릿에 없는 이름 — 그 이름에 공간 성격(대표실 · 실장실 …)이 있으면 그 구성으로, 없으면 예전처럼 용도만 짐작한다
    if(!spec){const typed=kinds[name]?{...room,kind:kinds[name],kindEdited:true}:room;return {room:{...typed,...namedRoomComposition(name,typed.kind,industry)},spec:null};}
    const policy=spec.room.equipmentPolicyVersion?{spaceProfile:spec.room.spaceProfile,equipmentPolicyVersion:spec.room.equipmentPolicyVersion,
      ...(spec.compositionVersion>=3?{layoutCompositionVersion:spec.compositionVersion}:{}),...(spec.room.includedSpaces?{includedSpaces:structuredClone(spec.room.includedSpaces)}:{})}:{};
    // 템플릿이 정한 좌석 수(임원실 1석 · 대회의실 12석 …)도 따른다
    return {room:{...room,kind:spec.kind,kindEdited:true,width:spec.width,depth:spec.depth,...(Number.isInteger(spec.room.capacity)?{capacity:spec.room.capacity}:{}),...policy},spec};
  });
}

/**
 * 고른 제품을 공간에 나눈다.
 *   1) 그 공간의 템플릿에 이미 있는 제품 — 템플릿의 공간(과 수량)을 따른다   2) 제안서의 공간 구성이 그 공간에 둔 제품
 *   3) 둘 다 없으면 제품군이 맞는 첫 공간   4) 그래도 없으면 제품의 주요 공간과 용도가 같은 첫 공간   5) 없으면 넣지 않는다(unplaced)
 * rooms: [{ id, kind, spec?, planned?:[제품 id], categories?:[제품군 id] }]
 * @returns { byRoom: Map<공간 id, [{ productId, quantity }]>, unplaced:[제품 id] }
 */
export function assignProducts(rooms,productIds,{catsOf=()=>[],kindsOf=()=>[]}={}){
  const byRoom=new Map(rooms.map(room=>[room.id,[]])),unplaced=[];
  const quantityIn=(room,id)=>{const quantity=room.spec?.room.equipment?.find(item=>item.productId===id)?.quantity;return Number.isInteger(quantity)&&quantity>=1&&quantity<=30?quantity:1;};
  for(const id of [...new Set(productIds)]){
    let targets=rooms.filter(room=>room.spec?.productIds.includes(id)||room.planned?.includes(id));
    if(!targets.length){const cats=new Set(catsOf(id)),fit=rooms.find(room=>(room.categories||[]).some(c=>cats.has(c)));if(fit)targets=[fit];}
    if(!targets.length){const kinds=new Set(kindsOf(id)),fit=rooms.find(room=>kinds.has(room.kind));if(fit)targets=[fit];}
    if(!targets.length){unplaced.push(id);continue;}
    for(const room of targets)byRoom.get(room.id).push({productId:id,quantity:quantityIn(room,id)});
  }
  return {byRoom,unplaced};
}

/** 제품의 '주요 공간' 이름 → 공간 용도. 어떤 규칙에도 걸리지 않는 이름(roomKind의 기본값 lounge)은 버린다. */
export function namedKinds(names){
  const out=new Set();
  for(const name of names||[]){const kind=roomKind(String(name));if(kind!=='lounge'||/라운지|거실|휴게|대기|대합실|컨코스|카페/.test(String(name)))out.add(kind);}
  return [...out];
}
