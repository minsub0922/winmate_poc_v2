import {transformPeopleParts} from './people-scenes.js';

// Version 1 occupants reference the frozen people recipe, and belong to existing
// furniture. No second desk, chair or bed is introduced by automatic population.
export const PEOPLE_LAYOUT_VERSION=1;
const normalized=new WeakMap(),mealCache=new WeakMap();
const mealTypes=new Set(['meal','ricebowl','lunchtray','pasta','salad','breakfast']);
const rad=n=>n*Math.PI/180;
const yaw=([x,y,z],angle)=>[x*Math.cos(angle)+z*Math.sin(angle),y,-x*Math.sin(angle)+z*Math.cos(angle)];
export function peopleSource(person,assets){
 const source=assets[person.sourceAssetId],actor=source?.actors?.find(a=>a.id===person.actorId);
 return source?.assetGroup==='people'&&actor?{source,actor}:null;
}
function actorParts(source,actor){
 let entries=normalized.get(source);if(!entries){entries=new Map();normalized.set(source,entries);}
 if(!entries.has(actor.id)){
  const parts=source.parts.filter(p=>p.actorId===actor.id).map(p=>({...p,position:p.position.map((n,i)=>n-actor.anchor[i])}));
  entries.set(actor.id,transformPeopleParts(parts,{angle:-actor.rotation,scale:1/actor.scale}));
 }
 return entries.get(actor.id);
}
function mealParts(source){
 if(!mealCache.has(source)){
  const parts=source.parts.filter(p=>p.component==='tool'&&mealTypes.has(p.objectType));
  if(!parts.length){mealCache.set(source,[]);return [];}
  const b=partsBounds(parts),center=[(b.min[0]+b.max[0])/2,b.min[1],(b.min[2]+b.max[2])/2];
  mealCache.set(source,parts.map(p=>({...p,position:p.position.map((n,i)=>n-center[i])})));
 }
 return mealCache.get(source);
}
export function peopleRenderGroups(owner,scene,assets){
 return (Array.isArray(owner.people)?owner.people:[]).flatMap((person,index)=>{
  const resolved=peopleSource(person,assets);if(!resolved||!person.offset)return [];
  const {source,actor}=resolved;
  const body=transformPeopleParts(actorParts(source,actor),{x:person.offset[0],y:person.offset[1],z:person.offset[2],angle:-rad(person.rotation),scale:person.scale});
  let tableware=[];
  if(person.meal){
   const target=scene.objects.find(o=>o.id===person.targetId),food=assets[person.meal.sourceAssetId];
   if(target&&food){
    const v=yaw(person.meal.offset,-rad(target.rotation));v[0]+=target.x-owner.x;v[1]+=target.elevation-owner.elevation;v[2]+=target.z-owner.z;
    const local=yaw(v,rad(owner.rotation));
    tableware=transformPeopleParts(mealParts(food),{x:local[0],y:local[1],z:local[2],angle:-rad(target.rotation-owner.rotation),scale:person.meal.scale});
   }
  }
  return [{person,actor,index,body,tableware,parts:[...body,...tableware]}];
 });
}
function rotate([x,y,z],[rx=0,ry=0,rz=0]=[]){
 [x,y]=[x*Math.cos(rz)-y*Math.sin(rz),x*Math.sin(rz)+y*Math.cos(rz)];
 [x,z]=[x*Math.cos(ry)+z*Math.sin(ry),-x*Math.sin(ry)+z*Math.cos(ry)];
 return [x,y*Math.cos(rx)-z*Math.sin(rx),y*Math.sin(rx)+z*Math.cos(rx)];
}
export function partsBounds(parts,owner){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const p of parts){
  const [w,h,d]=p.size;
  let lo=p.shape==='sphere'?[-w,-h,-d]:p.shape==='cylinder'?[-w,-h/2,-d]:p.shape==='torus'?[-w,-h,-d*.2]:[-w/2,-h/2,-d/2];
  let hi=lo.map(n=>-n);
  if(p.shape==='lathe'){const r=Math.max(...p.profile.map(p=>p[0])),ys=p.profile.map(p=>p[1]);lo=[-r*w,Math.min(...ys)*h,-r*d];hi=[r*w,Math.max(...ys)*h,r*d];}
  for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]]){
   let point=rotate([x,y,z],p.rotate).map((n,i)=>n+p.position[i]);
   if(owner){point=yaw(point,-rad(owner.rotation));point=point.map((n,i)=>n+[owner.x,owner.elevation,owner.z][i]);}
   point.forEach((n,i)=>{min[i]=Math.min(min[i],n);max[i]=Math.max(max[i],n);});
  }
 }
 return {min,max};
}
export function furnitureBounds(object,asset){
 const t=rad(object.rotation),[w,h,d]=asset.size,ew=Math.abs(w*Math.cos(t))+Math.abs(d*Math.sin(t)),ed=Math.abs(d*Math.cos(t))+Math.abs(w*Math.sin(t));
 return {min:[object.x-ew/2,object.elevation,object.z-ed/2],max:[object.x+ew/2,object.elevation+h,object.z+ed/2]};
}
const overlap=(a,b,pad=.025)=>a.min.every((v,i)=>v<b.max[i]+(i===1?-.012:pad)&&a.max[i]>b.min[i]-(i===1?-.012:pad));
const seatKinds=new Set(['chair','taskchair','sofa','bench','stool']);
const targetKinds=new Set(['desk','table','roundtable','coffeetable','conference','reception','counter','island']);
function allowedTarget(owner,person,other,assets){
 return person.mode==='seat'&&owner.facing?.targetId===other.id&&person.targetId===other.id&&targetKinds.has(assets[other.assetId]?.kind);
}
export function peopleObjectError(owner,room,objects,assets,{checkOthers=true}={}){
 if(owner.people===undefined)return null;
 const scene={objects},host=assets[owner.assetId];
 if(!Array.isArray(owner.people)||owner.people.length>4)return '가구별 사람 연출은 최대 4명입니다.';
 for(const person of owner.people){
  const source=peopleSource(person,assets);
  if(!source||person.version!==1||!['seat','stand','bed'].includes(person.mode)||!Array.isArray(person.offset)||person.offset.length!==3||![...person.offset,person.rotation,person.scale].every(Number.isFinite)||person.scale<.7||person.scale>1.12||person.offset.some(n=>Math.abs(n)>4))return '사람 연출 참조·위치가 올바르지 않습니다.';
  if(person.mode==='seat'&&(!seatKinds.has(host.kind)||source.actor.pose!=='sit'))return '착석 연출에는 알맞은 의자가 필요합니다.';
  if(person.mode==='seat'&&(Math.abs(person.offset[0])>host.size[0]/2-.12||Math.abs(person.offset[2])>host.size[2]/2-.1))return '사람을 의자 좌판 안에 배치해 주세요.';
  if(person.mode==='stand'&&source.actor.pose!=='stand')return '서 있는 연출의 자세가 올바르지 않습니다.';
  if(person.mode==='bed'&&(host.kind!=='hospitalbed'||source.source.id!=='people:doctor-bed-round'||source.actor.roleId!=='patient'))return '침상 연출에는 의료 침상이 필요합니다.';
  if(person.targetId&&!objects.some(o=>o.id===person.targetId&&o.roomId===owner.roomId))return '사람 연출의 작업 대상을 찾지 못했습니다.';
  if(person.meal&&(!person.targetId||!Array.isArray(person.meal.offset)||person.meal.offset.length!==3||![...person.meal.offset,person.meal.scale].every(Number.isFinite)||person.meal.scale<.6||person.meal.scale>1||!mealParts(assets[person.meal.sourceAssetId]||{parts:[]}).length))return '식사 연출의 식기 참조가 올바르지 않습니다.';
 }
 const groups=peopleRenderGroups(owner,scene,assets);
 for(const group of groups){
  const b=partsBounds(group.body,owner);
  if(b.min[0]<room.x+.06||b.max[0]>room.x+room.width-.06||b.min[2]<room.z+.06||b.max[2]>room.z+room.depth-.06||b.min[1]<-.005||b.max[1]>room.height-.04)return '사람 연출이 공간 경계를 벗어납니다.';
  if(b.max[2]>room.z+room.depth-1.15&&b.min[0]<room.x+room.width/2+.66&&b.max[0]>room.x+room.width/2-.66)return '사람 연출이 출입 동선을 막습니다.';
  if(group.tableware.length){
   const target=objects.find(o=>o.id===group.person.targetId),ta=assets[target.assetId],local=partsBounds(mealParts(assets[group.person.meal.sourceAssetId]));
   const {offset,scale}=group.person.meal,half=local.max.map((n,i)=>(n-local.min[i])*scale/2);
   if(Math.abs(offset[0])+half[0]>ta.size[0]/2-.025||Math.abs(offset[2])+half[2]>ta.size[2]/2-.025||Math.abs(offset[1]-(ta.supportSurfaceHeight||ta.size[1]))>.025)return '식기가 테이블 상판을 벗어납니다.';
  }
  if(!checkOthers)continue;
  for(const other of objects){
   if(other.id===owner.id||other.roomId!==owner.roomId||assets[other.assetId]?.kind==='rug')continue;
   if(!allowedTarget(owner,group.person,other,assets)&&overlap(b,furnitureBounds(other,assets[other.assetId])))return `사람 연출이 ${assets[other.assetId].name}과 겹칩니다.`;
   for(const og of peopleRenderGroups(other,scene,assets))if(overlap(b,partsBounds(og.body,other),.04))return '사람 연출끼리 겹칩니다.';
   if(group.tableware.length&&other.id!==group.person.targetId&&overlap(partsBounds(group.tableware,owner),furnitureBounds(other,assets[other.assetId]),.01))return '식기가 다른 오브젝트와 겹칩니다.';
  }
  for(const other of groups)if(other.index!==group.index&&overlap(b,partsBounds(other.body,owner),.04))return '가구에 앉은 사람 사이가 너무 좁습니다.';
 }
 return null;
}
// New products/furniture must also leave already seated or working people clear.
export function objectBlocksPeople(object,objects,assets){
 const b=furnitureBounds(object,assets[object.assetId]);
 return objects.some(owner=>owner.id!==object.id&&owner.roomId===object.roomId&&owner.people?.length&&peopleRenderGroups(owner,{objects},assets).some(g=>!allowedTarget(owner,g.person,object,assets)&&overlap(b,partsBounds(g.body,owner))));
}
export function clearMissingPeopleTargets(scene){
 const ids=new Set(scene.objects.map(o=>o.id));
 for(const object of scene.objects)if(object.people){object.people=object.people.filter(p=>!p.targetId||ids.has(p.targetId));if(!object.people.length)delete object.people;}
}
export function peopleInScene(scene,assets){
 return scene.objects.flatMap(owner=>(owner.people||[]).map(person=>({ownerId:owner.id,roomId:owner.roomId,...person,role:peopleSource(person,assets)?.actor.role,roleId:peopleSource(person,assets)?.actor.roleId})));
}
