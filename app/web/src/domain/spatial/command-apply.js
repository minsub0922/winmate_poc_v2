// 명령 적용 — 서버(/api/spatial/command)가 돌려준 조작 목록을 장면 · 입력 폼 사본에 차례로 적용한다.
// 하나라도 실패하면 던지고 입력은 그대로다(원자적). 결과 문구(lines)는 적용된 조작에서 만든다.
//   add{assetId,roomId,quantity,patch?} · copy{objectId,quantity,roomId?} · move{objectId, patch | direction(+distance) | roomId}
//   rotate{objectId, angle | rotation} · remove{objectId} · style{style}
//   room_add{kind,name?} · room_remove{roomId} · room_update{roomId,name?,purpose?}  (room-ops.js)
import {applySpatialEdit,mergeSpatialEditForm} from './edit.js';
import {copyObject,rotateObject,nudgeObject,moveObjectToRoom,directionBasis} from './object-ops.js';
import {sceneHash} from './scene.js';
import {STYLES} from './geometry.js';
import {spatialAssetLabel} from './catalog.js';
import {addRoom,removeRoom,updateRoom} from './room-ops.js';

const DIRECTIONS={left:['right',-1,'왼쪽'],right:['right',1,'오른쪽'],forward:['forward',1,'앞'],back:['forward',-1,'뒤']};
const metres=value=>Number(value.toFixed(2))+'m';

export function applySpatialCommand({scene,form},plan,library,{basis=directionBasis('2d'),documentId='draft'}={}){
  if(!Array.isArray(plan?.operations)||!plan.operations.length||plan.operations.length>100)throw new Error('적용할 변경이 없습니다.');
  const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
  let current=scene,inputs=form;const lines=[],removed=[],removedRooms=[],refs=new Map();
  const relaidNote=ids=>{if(ids.length)lines.push(`${ids.map(id=>current.rooms.find(r=>r.id===id)?.name).filter(Boolean).join(' · ')} 공간은 배치를 다시 정리했어요.`);};
  const label=object=>spatialAssetLabel(assets[object.assetId]);
  const objectOf=id=>{const object=current.objects.find(o=>o.id===id);if(!object)throw new Error('오브젝트를 찾지 못했습니다.');return object;};
  // 같은 명령에서 room_add가 만든 공간은 ref로 가리킨다.
  const roomOf=id=>{const key=refs.get(id)||id,room=current?.rooms.find(r=>r.id===key);if(!room)throw new Error('공간을 찾지 못했습니다.');return room;};
  const quantityOf=op=>{const quantity=op.quantity??1;if(!Number.isInteger(quantity)||quantity<1||quantity>30)throw new Error('수량은 1~30개여야 합니다.');return quantity;};
  for(const op of plan.operations){
    if(!op||typeof op!=='object')throw new Error('지원하지 않는 조작입니다.');
    if(op.type==='room_add'){
      const result=addRoom({scene:current,form:inputs},{kind:op.kind,name:op.name},library,{documentId});
      current=result.scene;inputs=result.form;if(typeof op.ref==='string'&&op.ref)refs.set(op.ref,result.roomId);
      lines.push(`${current.rooms.find(r=>r.id===result.roomId).name} 공간을 추가했어요.`);relaidNote(result.relaid);continue;
    }
    if(!current)throw new Error('먼저 공간을 추가해 주세요.');
    if(op.type==='room_remove'){
      const room=roomOf(op.roomId),result=removeRoom({scene:current,form:inputs},room.id,library,{documentId});
      current=result.scene;inputs=result.form;removedRooms.push(room.id);
      lines.push(`${room.name} 공간을 삭제했어요.`);if(current)relaidNote(result.relaid);continue;
    }
    if(op.type==='room_update'){
      const room=roomOf(op.roomId),result=updateRoom({scene:current,form:inputs},room.id,{name:op.name,purpose:op.purpose});
      current=result.scene;inputs=result.form;
      lines.push(op.name!==undefined?`${room.name} 공간 이름을 ${current.rooms.find(r=>r.id===room.id).name}(으)로 바꿨어요.`:`${room.name} 공간의 용도를 바꿨어요.`);continue;
    }
    const before=current;
    if(op.type==='add'){
      const quantity=quantityOf(op),room=roomOf(op.roomId);
      if(!assets[op.assetId])throw new Error('추가할 오브젝트를 찾지 못했습니다.');
      current=applySpatialEdit(current,{operations:[{...op,quantity,roomId:room.id}]},library);
      lines.push(`${room.name}에 ${spatialAssetLabel(assets[op.assetId])} ${quantity}개를 추가했어요.`);
    }else if(op.type==='copy'){
      const quantity=quantityOf(op),source=objectOf(op.objectId),room=roomOf(op.roomId||source.roomId);
      for(let i=0;i<quantity;i++)current=copyObject(current,op.objectId,room.id,library).scene;
      lines.push(`${room.name}에 ${label(source)} ${quantity}개를 복제했어요.`);
    }else if(op.type==='move'){
      const source=objectOf(op.objectId);
      if(op.direction!==undefined){
        const direction=DIRECTIONS[op.direction],distance=op.distance??1;
        if(!direction||!Number.isFinite(distance)||distance<.05||distance>50)throw new Error('이동할 방향과 거리를 확인해 주세요.');
        const axis=basis[direction[0]],result=nudgeObject(current,op.objectId,[axis[0]*direction[1]*distance,axis[1]*direction[1]*distance],library);
        current=result.scene;
        lines.push(result.moved<result.requested?`${label(source)} · ${direction[2]}으로 ${metres(result.moved)}까지만 옮겼어요(더 가면 벽이나 다른 오브젝트에 닿아요).`:`${label(source)} · ${direction[2]}으로 ${metres(result.moved)} 옮겼어요.`);
      }else if(op.roomId&&!op.patch){
        const room=roomOf(op.roomId);current=moveObjectToRoom(current,op.objectId,room.id,library);
        lines.push(`${label(source)} · ${room.name}(으)로 옮겼어요.`);
      }else{
        current=applySpatialEdit(current,{operations:[{type:'move',objectId:op.objectId,patch:op.patch}]},library);
        lines.push(`${label(source)} · 위치를 옮겼어요.`);
      }
    }else if(op.type==='rotate'){
      const source=objectOf(op.objectId);
      current=rotateObject(current,op.objectId,{angle:op.angle,rotation:op.rotation},library);
      const after=current.objects.find(o=>o.id===op.objectId).rotation;
      lines.push(`${label(source)} · ${Number(after.toFixed(0))}° 방향으로 돌렸어요.`);
    }else if(op.type==='remove'){
      const source=objectOf(op.objectId);
      current=applySpatialEdit(current,{operations:[{type:'remove',objectId:op.objectId}]},library);
      removed.push(op.objectId);lines.push(`${label(source)} · 삭제했어요.`);
    }else if(op.type==='style'){
      if(!STYLES[op.style])throw new Error('등록되지 않은 공간 스타일입니다.');
      current=applySpatialEdit(current,{operations:[{type:'style',style:op.style}]},library);
      lines.push(`공간 스타일을 ${STYLES[op.style].name}(으)로 바꿨어요.`);
    }else throw new Error('지원하지 않는 조작입니다.');
    if(before!==current)inputs=mergeSpatialEditForm(inputs,before,current,library);
  }
  if(current){current={...current,revision:(scene?.revision||0)+1};current.contentHash=sceneHash(current);}
  return {scene:current,form:inputs,lines,removed,removedRooms};
}
