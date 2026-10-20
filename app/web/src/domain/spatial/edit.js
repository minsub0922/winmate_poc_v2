import { addAsset,moveObject,sceneHash,validateScene } from './scene.js';
import { STYLES } from './geometry.js';
import {clearMissingPeopleTargets} from './people-placement-geometry.js';

// Apply a whole instruction to a private copy. A failed operation never changes the editor.
export function applySpatialEdit(scene,plan,library){
  if(!Array.isArray(plan?.operations)||!plan.operations.length||plan.operations.length>100)throw new Error('적용할 오브젝트 변경이 없습니다.');
  let next=structuredClone(scene);
  for(const op of plan.operations){
    if(op.type==='add'){
      if(!Number.isInteger(op.quantity)||op.quantity<1||op.quantity>30)throw new Error('추가 수량은 1~30개여야 합니다.');
      for(let i=0;i<op.quantity;i++){
        const before=new Set(next.objects.map(o=>o.id));
        next=addAsset(next,op.assetId,op.roomId,library);
        const added=next.objects.find(o=>!before.has(o.id)&&o.assetId===op.assetId);
        if(!added)throw new Error('새 오브젝트를 배치하지 못했습니다.');
        if(op.patch&&Object.keys(op.patch).length)next=moveObject(next,added.id,checkedPatch(op.patch),library);
      }
    }else if(op.type==='move'){
      next=moveObject(next,op.objectId,checkedPatch(op.patch),library);
    }else if(op.type==='remove'){
      if(!next.objects.some(o=>o.id===op.objectId))throw new Error('삭제할 오브젝트를 찾지 못했습니다.');
      const removed=new Set([op.objectId]);
      let count;do{count=removed.size;for(const o of next.objects)if(removed.has(o.supportId))removed.add(o.id);}while(count!==removed.size);
      next.objects=next.objects.filter(o=>!removed.has(o.id));
      for(const o of next.objects)if(removed.has(o.facing?.targetId))delete o.facing;
      clearMissingPeopleTargets(next);
    }else if(op.type==='style'){
      if(!STYLES[op.style])throw new Error('등록되지 않은 공간 스타일입니다.');next.style=op.style;
    }else throw new Error('지원하지 않는 오브젝트 조작입니다.');
  }
  const errors=validateScene(next,library).errors;if(errors.length)throw new Error(errors[0]);
  next.revision=scene.revision+1;next.contentHash=sceneHash(next);return next;
}

function checkedPatch(patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.entries(patch).some(([k,v])=>!['x','z','elevation','rotation'].includes(k)||!Number.isFinite(v)))throw new Error('오브젝트의 위치·회전 값이 올바르지 않습니다.');
  return patch;
}

export function spatialMoveGroup(scene,id){
  const ids=new Set([id]);let count;
  do{count=ids.size;for(const o of scene.objects)if(ids.has(o.supportId)||o.facing?.moveWithTarget&&ids.has(o.facing.targetId))ids.add(o.id);}while(count!==ids.size);
  return ids;
}

// Keep the structured input in step with direct map edits, preserving ungenerated input changes.
export function mergeSpatialEditForm(form,before,after,library){
  const products=new Map(library.assets.filter(a=>a.productId).map(a=>[a.id,a.productId]));
  const count=(scene,room,furniture=false)=>{const counts=new Map();for(const o of scene.objects)if(o.roomId===room&&(furniture?o.studioFurniture&&!products.has(o.assetId):products.has(o.assetId))){const id=furniture?o.assetId:products.get(o.assetId);counts.set(id,(counts.get(id)||0)+1);}return counts;};
  let changed=before.style!==after.style;
  const rooms=form.rooms.map(room=>{
    const previous=count(before,room.id),next=count(after,room.id),deltas=[...new Set([...previous.keys(),...next.keys()])].map(id=>[id,(next.get(id)||0)-(previous.get(id)||0)]).filter(([,delta])=>delta);
    const furnitureBefore=count(before,room.id,true),furnitureAfter=count(after,room.id,true),furnitureDeltas=[...new Set([...furnitureBefore.keys(),...furnitureAfter.keys()])].map(id=>[id,(furnitureAfter.get(id)||0)-(furnitureBefore.get(id)||0)]).filter(([,delta])=>delta);
    if(!deltas.length&&!furnitureDeltas.length)return room;
    changed=true;const quantities=new Map(room.products.map(p=>[p.productId,Number(p.quantity)||0]));
    for(const [id,delta] of deltas)quantities.set(id,Math.max(0,(quantities.get(id)||0)+delta));
    const result={...room,products:[...quantities].filter(([,quantity])=>quantity>0).map(([productId,quantity])=>({productId,quantity}))};
    if(furnitureDeltas.length){const counts=new Map((room.furniture||[]).map(item=>[item.assetId,Number(item.quantity)||0]));for(const [id,delta] of furnitureDeltas)counts.set(id,Math.max(0,(counts.get(id)||0)+delta));const entries=[...counts].filter(([,quantity])=>quantity>0).map(([assetId,quantity])=>({assetId,quantity}));if(entries.length)result.furniture=entries;else delete result.furniture;}
    return result;
  });
  return changed?{...form,rooms,...(before.style!==after.style?{style:after.style}:{})}:form;
}
