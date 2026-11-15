// 공간 조감도 장면 → 건물의 층 기록. 건물 모듈(src/building)은 미리 구운 층 기록만 그린다 —
// 내가 만든 공간 조감도를 층으로 쓰려고, 굽는 스크립트(app/scripts/build_building_bake.mjs의 bakeScene · assetRef · person)와
// 같은 규칙으로 장면 하나를 '묶음(pack)'으로 바꾼다. 묶음은 스스로 완결된다(자산 표 · 레시피 · 층 기록) —
// 건물 기록 안에 함께 저장돼 원본 조감도를 지우거나 고쳐도 건물은 그대로이고, HTML 추출 파일에도 들어간다.
//   pack = { assets:[{id,n,s,r|p,pid?,bc?,gt,c}], recipes:{키:레시피}, tpl:{id,ind,name,lay:'my',style,w,d,rooms,objs,ppl} }
//   tpl.rooms [id, 이름, 종류, x, z, 가로, 세로, 실외, 목적] · tpl.objs [묶음 안 자산 순번, x, z, 높이, 회전, 공간 번호, 천장 설치] · tpl.ppl (building/data.js)
import {peopleRenderGroups,partsBounds} from '../spatial/people-placement-geometry.js';

const r3=n=>Math.round(n*1000)/1000;

export function bakeSceneFloor(scene,library,{id,name}={}){
  if(typeof id!=='string'||!id)throw new Error('층 기록 id가 필요합니다.');
  const assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),index=new Map(),baked=[],recipes={};
  const reference=assetId=>{
    if(index.has(assetId))return index.get(assetId);
    const asset=assets[assetId];if(!asset)throw new Error('등록되지 않은 자산입니다: '+assetId);
    const key=asset.recipe||asset.kind,entry={id:asset.id,n:asset.name,s:asset.size};
    if(library.recipes[key]){entry.r=key;recipes[key]=library.recipes[key];}else entry.p=asset.parts;
    if(asset.productId)entry.pid=asset.productId;
    if(asset.productId&&asset.appearance?.bodyColor)entry.bc=asset.appearance.bodyColor;
    entry.gt=asset.geometryTransform;entry.c=asset.category;
    index.set(assetId,baked.length);baked.push(entry);return index.get(assetId);
  };
  const person=(group,owner)=>{
    const b=partsBounds(group.body,owner),body=group.body.filter(part=>part.component==='person');
    return [r3((b.min[0]+b.max[0])/2),r3(b.min[1]),r3((b.min[2]+b.max[2])/2),r3(b.max[1]-b.min[1]),r3(Math.max(b.max[0]-b.min[0],b.max[2]-b.min[2])),
      body[0].material,body[1].material,body[2].material,body[4].material,group.person.mode==='seat'?1:0];
  };
  const roomIndex=new Map(scene.rooms.map((room,i)=>[room.id,i]));
  const rooms=scene.rooms.map(room=>[room.id,room.name,room.kind,room.x,room.z,room.width,room.depth,room.outdoor?1:0,room.purpose||'']);
  const objs=[],ppl=[];
  for(const object of scene.objects){
    objs.push([reference(object.assetId),r3(object.x),r3(object.z),r3(object.elevation||0),r3(object.rotation||0),roomIndex.get(object.roomId)??-1,object.mount==='ceiling'?1:0]);
    for(const group of peopleRenderGroups(object,scene,assets))ppl.push(person(group,object));
  }
  return {assets:baked,recipes,tpl:{id,ind:scene.industry,name:name||scene.title,lay:'my',style:scene.style,w:scene.width,d:scene.depth,rooms,objs,ppl}};
}
