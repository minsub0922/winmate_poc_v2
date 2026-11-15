// 공간 조작 — 공간 추가 · 삭제 · 이름/용도 바꾸기. 왼쪽 입력 카드 없이 명령으로 공간 구성을 바꾼다.
// 공간 수가 바뀌면 전체 배치(격자)가 달라지므로 입력 폼으로 장면을 다시 만든 뒤, 기존 공간의 오브젝트를 새 위치로
// 그대로 옮겨 붙인다(크기가 같으므로 평행 이동). 옮겨 붙인 결과가 검증에 걸리는 공간만 새 배치를 쓴다(relaid).
import {round,sceneHash,validateScene} from './scene.js';
import {SPACE_TYPES,createSceneFromForm,newStudioRoom,studioFormFromScene,studioFormKey} from './studio-form.js';

const typeName=kind=>SPACE_TYPES.find(([key])=>key===kind)?.[1];
const same=(a,b)=>Math.abs(a-b)<.001;

// 장면이 기준이다 — 폼은 이름 · 업종 · 스타일 · 템플릿만 보탠다.
function baseForm(scene,form){
  if(!scene)return {...form,rooms:form.rooms.map(room=>({...room}))};
  const current=studioFormFromScene(scene);
  return {...current,title:form.title||scene.title,templateId:null};
}
function uniqueName(name,rooms){
  const taken=new Set(rooms.map(room=>room.name.trim()));
  if(!taken.has(name))return name;
  for(let n=2;;n++)if(!taken.has(name+' '+n))return name+' '+n;
}

// 새로 만든 장면(fresh)에 예전 장면(previous)의 공간별 오브젝트를 옮겨 붙인다.
function transplant(fresh,previous,library){
  let scene=fresh;const relaid=[];
  for(const room of fresh.rooms){
    const old=previous.rooms.find(r=>r.id===room.id);if(!old)continue;
    if(!same(old.width,room.width)||!same(old.depth,room.depth)){relaid.push(room.id);continue;}
    const dx=round(room.x-old.x),dz=round(room.z-old.z);
    const moved=previous.objects.filter(o=>o.roomId===room.id).map(o=>{
      const copy={...structuredClone(o),x:round(o.x+dx),z:round(o.z+dz)};
      if(copy.facing?.point)copy.facing.point={x:round(copy.facing.point.x+dx),z:round(copy.facing.point.z+dz)};
      return copy;
    });
    const candidate={...scene,objects:[...scene.objects.filter(o=>o.roomId!==room.id),...moved]};
    // 다른 공간에 새로 생긴 오브젝트와 ID가 겹치면 새 쪽의 이름을 바꾼다.
    const kept=new Set(moved.map(o=>o.id)),renamed=new Map();
    for(const o of candidate.objects)if(o.roomId!==room.id&&kept.has(o.id)){let n=1;while(candidate.objects.some(x=>x.id===o.id+'-r'+n))n++;renamed.set(o.id,o.id+'-r'+n);}
    if(renamed.size)candidate.objects=candidate.objects.map(o=>{
      if(o.roomId===room.id)return o;
      const copy={...o,...(renamed.has(o.id)?{id:renamed.get(o.id)}:{})};
      if(renamed.has(copy.supportId))copy.supportId=renamed.get(copy.supportId);
      if(renamed.has(copy.facing?.targetId))copy.facing={...copy.facing,targetId:renamed.get(copy.facing.targetId)};
      if(copy.people?.some(p=>renamed.has(p.targetId)))copy.people=copy.people.map(p=>renamed.has(p.targetId)?{...p,targetId:renamed.get(p.targetId)}:p);
      return copy;
    });
    if(validateScene(candidate,library).errors.length)relaid.push(room.id);else scene=candidate;
  }
  return {scene,relaid};
}

function rebuild(scene,form,library,{documentId='draft'}={}){
  if(!form.rooms.length)return {scene:null,form,relaid:[]};
  // 기존 공간은 자리만 다시 잡는다(제품 · 가구 없이) — 내용은 옮겨 붙이므로, 지금 배치를 처음부터 다시 만들 수 없는 공간이 있어도 실패하지 않는다.
  const kept=new Set(scene?scene.rooms.map(room=>room.id):[]);
  const bare=room=>{const {furniture,...rest}=room;return {...rest,products:[]};};
  const fresh=createSceneFromForm({...form,rooms:form.rooms.map(room=>kept.has(room.id)?bare(room):room)},library,{documentId});
  const result=scene?transplant(fresh,scene,library):{scene:fresh,relaid:[]};
  if(result.relaid.length){
    // 옮겨 붙일 수 없던 공간만 그 공간의 제품 · 가구로 새로 배치한다
    const again=createSceneFromForm({...form,rooms:form.rooms.map(room=>kept.has(room.id)&&!result.relaid.includes(room.id)?bare(room):room)},library,{documentId});
    result.scene={...result.scene,objects:[...result.scene.objects.filter(o=>!result.relaid.includes(o.roomId)),...again.objects.filter(o=>result.relaid.includes(o.roomId))]};
  }
  const next={...result.scene,title:form.title.trim()||scene?.title||fresh.title,revision:(scene?.revision||0)+1};
  const inputs={...studioFormFromScene(next),title:form.title,templateId:null};
  next.formKey=studioFormKey(inputs);next.contentHash=sceneHash(next);
  const errors=validateScene(next,library).errors;if(errors.length)throw new Error(errors[0]);
  return {scene:next,form:inputs,relaid:result.relaid};
}

/** 공간 종류(kind)로 새 공간을 더한다. 장면이 없으면 그 공간 하나로 장면을 만든다. */
export function addRoom({scene,form},{kind,name}={},library,options={}){
  const label=typeName(kind);if(!label)throw new Error('등록되지 않은 공간 용도입니다.');
  const inputs=baseForm(scene,form),given=typeof name==='string'?name.trim():'';
  if(given.length>100)throw new Error('공간 이름은 100자 이내로 입력해 주세요.');
  const room={...newStudioRoom(given||label),kind,kindEdited:true};room.name=uniqueName(room.name,inputs.rooms);
  const result=rebuild(scene,{...inputs,rooms:[...inputs.rooms,room]},library,options);
  return {...result,roomId:room.id};
}

/** 공간과 그 안의 오브젝트를 지운다. 마지막 공간을 지우면 장면이 없어진다(scene=null). */
export function removeRoom({scene,form},roomId,library,options={}){
  if(!scene?.rooms.some(room=>room.id===roomId))throw new Error('삭제할 공간을 찾지 못했습니다.');
  const inputs=baseForm(scene,form),rooms=inputs.rooms.filter(room=>room.id!==roomId);
  if(!rooms.length)return {scene:null,form:{...inputs,rooms:[]},relaid:[]};
  const kept={...scene,rooms:scene.rooms.filter(room=>room.id!==roomId),objects:scene.objects.filter(o=>o.roomId!==roomId)};
  return rebuild(kept,{...inputs,rooms},library,options);
}

/** 공간 이름 · 용도 설명을 바꾼다. 배치는 그대로다. */
export function updateRoom({scene,form},roomId,{name,purpose}={}){
  if(!scene?.rooms.some(room=>room.id===roomId))throw new Error('공간을 찾지 못했습니다.');
  const patch={};
  if(name!==undefined){const value=String(name).trim();if(!value||value.length>100)throw new Error('공간 이름은 1~100자로 입력해 주세요.');patch.name=value;}
  if(purpose!==undefined){const value=String(purpose).trim();if(!value||value.length>100)throw new Error('공간 용도는 1~100자로 입력해 주세요.');patch.customPurpose=value;}
  if(!Object.keys(patch).length)throw new Error('바꿀 공간 이름이나 용도를 알려 주세요.');
  const next={...scene,rooms:scene.rooms.map(room=>room.id===roomId?{...room,...patch}:room),revision:(scene.revision||0)+1};
  const inputs={...form,rooms:form.rooms.map(room=>room.id===roomId?{...room,...patch}:room)};
  next.formKey=studioFormKey(inputs);next.contentHash=sceneHash(next);
  return {scene:next,form:inputs};
}
