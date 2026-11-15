// 오브젝트 조작 — 복제 · 회전 · 방향 이동 · 공간 간 이동. 명령(command-apply.js)과 마우스 · 키보드 조작이 함께 쓴다.
// 모든 함수는 입력 장면을 바꾸지 않고, 결과가 장면 검증(validateScene)을 통과할 때만 새 장면을 돌려준다.
import {addAsset,moveObject,objectBounds,round,sceneHash,validateScene} from './scene.js';
import {spatialMoveGroup} from './edit.js';
import {clearMissingPeopleTargets} from './people-placement-geometry.js';

const AXES=[[1,0],[0,1],[-1,0],[0,-1]];
const STEP=.05,GRID=.25,WALL=.12,MAX_CHECKS=120;

/**
 * 화면에서 본 "오른쪽"과 "앞"(보는 사람 쪽)을 지도 좌표 단위 벡터로. 평면도는 지도 축 그대로이고,
 * 3D는 카메라가 서 있는 쪽으로 정한 뒤 가구가 벽과 나란히 움직이도록 가장 가까운 지도 축에 맞춘다.
 * camera: {azimuth(도)} 또는 뷰어의 cameraState() {position:[x,y,z], target:[x,y,z]}.
 */
export function directionBasis(view='2d',camera=null){
  let azimuth=0;
  if(view==='3d'&&camera){
    if(Number.isFinite(camera.azimuth))azimuth=camera.azimuth*Math.PI/180;
    else if(Array.isArray(camera.position)&&Array.isArray(camera.target))azimuth=Math.atan2(camera.position[0]-camera.target[0],camera.position[2]-camera.target[2]);
  }
  const side=[Math.cos(azimuth),-Math.sin(azimuth)];
  let right=AXES[0],best=-Infinity;
  for(const axis of AXES){const dot=axis[0]*side[0]+axis[1]*side[1];if(dot>best+1e-9){best=dot;right=axis;}}
  return {right:[right[0],right[1]],forward:[-right[1]||0,right[0]||0]};
}

const assetMap=library=>Object.fromEntries(library.assets.map(a=>[a.id,a]));
const finish=(next,scene)=>{next.revision=(scene.revision||0)+1;next.contentHash=sceneHash(next);return next;};
const findObject=(scene,id,message='오브젝트를 찾지 못했습니다.')=>{const object=scene.objects.find(o=>o.id===id);if(!object)throw new Error(message);return object;};
const findRoom=(scene,id)=>{const room=scene.rooms.find(r=>r.id===id);if(!room)throw new Error('공간을 찾지 못했습니다.');return room;};
// 바닥에 서 있는 것만 통째로 옮겨 붙일 수 있다. 벽 · 천장 · 가구 위에 붙는 것은 자동 배치가 자리를 다시 잡는다.
const floorStanding=object=>!object.supportId&&!['wall','ceiling','surface'].includes(object.mount);
function freshId(taken,id){
  const base=id.replace(/-c\d+$/,'');
  for(let n=1;;n++){const next=base+'-c'+n;if(!taken.has(next)){taken.add(next);return next;}}
}
const overlaps=(a,b)=>a.x<b.x+b.w+.06&&a.x+a.w+.06>b.x&&a.z<b.z+b.d+.06&&a.z+a.d+.06>b.z&&a.y<b.y+b.h-.02&&a.y+a.h>b.y+.02;

/** 묶음(members)을 room 안의 빈 자리에 놓은 장면. near에서 가까운 자리부터 찾는다. */
function placeGroup(scene,others,members,anchor,room,near,library,{skipNear=false}={}){
  const assets=assetMap(library),boxes=members.map(o=>objectBounds(o,assets));
  const left=Math.min(...boxes.map(b=>b.x))-anchor.x,right=Math.max(...boxes.map(b=>b.x+b.w))-anchor.x,top=Math.min(...boxes.map(b=>b.z))-anchor.z,bottom=Math.max(...boxes.map(b=>b.z+b.d))-anchor.z;
  const x0=room.x+WALL-left,x1=room.x+room.width-WALL-right,z0=room.z+WALL-top,z1=room.z+room.depth-WALL-bottom;
  const name=assets[anchor.assetId]?.name||'오브젝트';
  if(x1<x0||z1<z0)throw new Error(`${room.name}: ${name}을 놓기에는 공간이 좁아요.`);
  const spots=[];
  if(!skipNear&&near.x>=x0&&near.x<=x1&&near.z>=z0&&near.z<=z1)spots.push([near.x,near.z]);
  for(let x=x0;x<=x1+1e-9;x+=GRID)for(let z=z0;z<=z1+1e-9;z+=GRID)spots.push([round(x),round(z)]);
  spots.sort((a,b)=>Math.hypot(a[0]-near.x,a[1]-near.z)-Math.hypot(b[0]-near.x,b[1]-near.z));
  const neighbours=others.filter(o=>o.roomId===room.id&&assets[o.assetId]?.kind!=='rug').map(o=>objectBounds(o,assets)).filter(Boolean);
  const place=(x,z)=>{
    const dx=round(x-anchor.x),dz=round(z-anchor.z),sameRoom=anchor.roomId===room.id;
    return members.map(o=>{
      const copy={...structuredClone(o),roomId:room.id,x:round(o.x+dx),z:round(o.z+dz)};
      if(copy.facing?.point){if(sameRoom)copy.facing.point={x:round(copy.facing.point.x+dx),z:round(copy.facing.point.z+dz)};else delete copy.facing;}
      return copy;
    });
  };
  const ids=new Set(members.map(o=>o.id)),tried=new Set(),local=others.filter(o=>o.roomId===room.id);let checks=0,reason='';
  // 먼저 경계 상자로 비어 보이는 자리만 검증하고, 하나도 없으면 가까운 자리부터 그대로 검증해 본다.
  for(const clear of [true,false])for(const [x,z] of spots){
    if(checks>=MAX_CHECKS)break;
    const key=x+':'+z;if(tried.has(key))continue;
    const placed=place(x,z);
    if(clear&&placed.some(o=>{const b=objectBounds(o,assets);return neighbours.some(n=>overlaps(b,n));}))continue;
    tried.add(key);checks++;
    // 후보마다 장면 전체를 검증하면 큰 장면에서 화면이 멈춘다 — 그 공간만 먼저 확인하고, 통과한 자리만 전체로 한 번 더 확인한다.
    const nearby=validateScene({...scene,objects:[...local,...placed]},library).errors;
    if(nearby.length){reason=nearby[0];continue;}
    const next={...scene,objects:[...others,...placed]};
    for(const o of next.objects)if(!ids.has(o.id)&&o.facing?.targetId&&!next.objects.some(x=>x.id===o.facing.targetId))delete o.facing;
    const errors=validateScene(next,library).errors;
    if(!errors.length)return next;
    reason=errors[0];
  }
  throw new Error(`${room.name}: ${name}을 놓을 여유 공간이 부족해요.`+(reason?` (${reason})`:''));
}

/** 오브젝트와 그 위에 얹힌 것 · 함께 움직이는 것 · 딸린 사람을 복제해 roomId(없으면 원본 공간)의 빈 자리에 놓는다. */
export function copyObject(scene,objectId,roomId,library){
  const source=findObject(scene,objectId,'복제할 오브젝트를 찾지 못했습니다.'),room=findRoom(scene,roomId||source.roomId);
  if(!floorStanding(source)){
    const before=new Set(scene.objects.map(o=>o.id));
    const next=addAsset(scene,source.assetId,room.id,library);
    const added=next.objects.find(o=>!before.has(o.id)&&o.assetId===source.assetId);
    if(!added)throw new Error('새 오브젝트를 배치하지 못했습니다.');
    if(source.studioFurniture)added.studioFurniture=true;
    return {scene:finish(next,scene),objectId:added.id};
  }
  const group=spatialMoveGroup(scene,objectId),taken=new Set(scene.objects.map(o=>o.id)),renamed=new Map();
  for(const o of scene.objects)if(group.has(o.id))renamed.set(o.id,freshId(taken,o.id));
  const members=scene.objects.filter(o=>group.has(o.id)).map(o=>{
    const copy={...structuredClone(o),id:renamed.get(o.id)};
    if(copy.supportId)copy.supportId=renamed.get(copy.supportId);
    // 묶음 밖의 대상을 바라보던 관계(원본의 책상 · 테이블)는 끊는다 — 복제본이 원본 가구를 따라다니거나 다시 돌지 않게 방향만 남긴다.
    if(copy.facing?.targetId){
      if(renamed.has(copy.facing.targetId))copy.facing.targetId=renamed.get(copy.facing.targetId);
      else copy.facing={manual:true};
    }else if(copy.facing?.automatic)copy.facing={manual:true};
    if(copy.people)for(const person of copy.people)if(person.targetId&&renamed.has(person.targetId))person.targetId=renamed.get(person.targetId);
    return copy;
  });
  const anchor=members.find(o=>o.id===renamed.get(objectId)),sameRoom=room.id===source.roomId;
  const near=sameRoom?{x:source.x,z:source.z}:{x:room.x+room.width/2,z:room.z+room.depth/2};
  const next=placeGroup(structuredClone(scene),structuredClone(scene.objects),members,anchor,room,near,library,{skipNear:sameRoom});
  clearMissingPeopleTargets(next);
  return {scene:finish(next,scene),objectId:anchor.id};
}

/** 상대 각도(angle, 양수 = 시계 방향 · 오른쪽) 또는 절대 각도(rotation)로 돌린다. 얹힌 것 · 딸린 것도 함께 돈다. */
export function rotateObject(scene,objectId,{angle,rotation}={},library){
  const object=findObject(scene,objectId);
  const value=Number.isFinite(rotation)?rotation:Number.isFinite(angle)?object.rotation+angle:NaN;
  if(!Number.isFinite(value))throw new Error('회전 각도를 확인해 주세요.');
  const next=moveObject(scene,objectId,{rotation:round(((value%360)+360)%360)},library),turned=next.objects.find(o=>o.id===objectId);
  // 자동으로 책상 · 테이블을 바라보게 놓인 것도, 사용자가 돌린 뒤에는 옮길 때 다시 돌려놓지 않는다.
  if(turned.facing){turned.facing={...turned.facing,manual:true};delete turned.facing.automatic;next.contentHash=sceneHash(next);}
  return next;
}

/** [dx,dz](m)만큼 옮기되, 벽 · 다른 오브젝트에 막히면 닿기 직전(5cm 단계)에서 멈춘다. */
export function nudgeObject(scene,objectId,[dx,dz],library){
  const object=findObject(scene,objectId),length=Math.hypot(dx,dz);
  if(!(length>0)||!Number.isFinite(length)||length>150)throw new Error('이동할 방향과 거리를 확인해 주세요.');
  const ux=dx/length,uz=dz/length,steps=Math.ceil(length/STEP-1e-9);
  const at=distance=>({x:round(object.x+ux*distance),z:round(object.z+uz*distance)});
  // 5cm마다 장면 전체를 검증하면 큰 장면에서 멈춘다 — 걸음은 그 공간 안에서만 확인하고, 멈춘 자리만 장면 전체로 확인한다.
  const local={...scene,objects:scene.objects.filter(o=>o.roomId===object.roomId)};
  let moved=0,reason='';
  for(let i=1;i<=steps;i++){
    const distance=Math.min(length,Math.round(i*STEP*100)/100);
    try{moveObject(local,objectId,at(distance),library);moved=distance;}
    catch(error){reason=error.message;break;}
  }
  let best=null;
  while(moved>0&&!best){
    try{best=moveObject(scene,objectId,at(moved),library);}
    catch(error){reason=error.message;moved=Math.round((moved-STEP)*100)/100;}
  }
  if(!best)throw new Error('그 방향으로는 더 옮길 자리가 없어요.'+(reason?` (${reason})`:''));
  return {scene:best,moved:Math.round(moved*100)/100,requested:Math.round(length*100)/100};
}

/** 오브젝트(와 묶음)를 다른 공간의 빈 자리로 옮긴다. 인스턴스 ID는 그대로다. */
export function moveObjectToRoom(scene,objectId,roomId,library){
  const source=findObject(scene,objectId),room=findRoom(scene,roomId);
  if(room.id===source.roomId)throw new Error('이미 그 공간에 있는 오브젝트예요.');
  const group=spatialMoveGroup(scene,objectId),base=structuredClone(scene);
  const others=base.objects.filter(o=>!group.has(o.id));
  for(const o of others)if(group.has(o.facing?.targetId)&&!group.has(o.id))delete o.facing;
  if(!floorStanding(source)){
    const before=new Set(others.map(o=>o.id));
    const next=addAsset({...base,objects:others},source.assetId,room.id,library);
    const added=next.objects.find(o=>!before.has(o.id)&&o.assetId===source.assetId);
    if(!added)throw new Error('새 공간에 배치하지 못했습니다.');
    added.id=objectId;if(source.studioFurniture)added.studioFurniture=true;
    clearMissingPeopleTargets(next);
    const errors=validateScene(next,library).errors;if(errors.length)throw new Error(errors[0]);
    return finish(next,scene);
  }
  const members=base.objects.filter(o=>group.has(o.id)).map(o=>{
    if(o.facing?.targetId&&!group.has(o.facing.targetId))delete o.facing;
    return o;
  });
  const anchor=members.find(o=>o.id===objectId);
  const next=placeGroup(base,others,members,anchor,room,{x:room.x+room.width/2,z:room.z+room.depth/2},library);
  clearMissingPeopleTargets(next);
  return finish(next,scene);
}
