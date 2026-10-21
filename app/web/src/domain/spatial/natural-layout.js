// Design policy, not a building-code certificate. All distances are metres.
// The same rotation convention is used by SVG and Three.js: +90 turns +Z toward -X.
export const NATURAL_LAYOUT_VERSION=2;
export const CLEARANCE={workGap:.12,diningGap:.13,sofaGap:.45,chairBack:.7,workRowPitch:2.25};
const seats=new Set(['chair','taskchair','sofa','stool']);
const normal=a=>((a%360)+360)%360;
export function frontVector(object,asset){
  const axis=asset?.frontAxis||[0,0,1],t=(object.rotation||0)*Math.PI/180,x=axis[0],z=axis[2];
  return {x:x*Math.cos(t)-z*Math.sin(t),z:x*Math.sin(t)+z*Math.cos(t)};
}
export function faceRotation(object,target,asset,{snap=90}={}){
  const axis=asset?.frontAxis||[0,0,1],desired=Math.atan2(target.z-object.z,target.x-object.x),base=Math.atan2(axis[2],axis[0]);
  const angle=(desired-base)*180/Math.PI;return normal(snap?Math.round(angle/snap)*snap:angle);
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const nearest=(object,objects,kinds,assets)=>objects.filter(o=>o.id!==object.id&&o.roomId===object.roomId&&kinds.includes(assets[o.assetId]?.kind)).sort((a,b)=>distance(object,a)-distance(object,b)||a.id.localeCompare(b.id))[0];
export function facingTarget(object,scene){
  const target=scene.objects.find(o=>o.id===object.facing?.targetId);
  if(object.facing?.alignment==='parallel'&&target)return {x:object.x,z:target.z};
  return target||object.facing?.point||null;
}
export function bindNaturalRelations(scene,assets,{refresh=false}={}){
  for(const object of scene.objects){
    const asset=assets[object.assetId],room=scene.rooms.find(r=>r.id===object.roomId);if(!asset||!room)continue;
    if(!refresh&&object.facing?.targetId&&scene.objects.some(o=>o.id===object.facing.targetId&&o.roomId===object.roomId))continue;
    let target,activity,carry=false,alignment;
    if(seats.has(asset.kind)){
      if(room.kind==='theatre'){target=nearest(object,scene.objects,['stage'],assets);activity='presentation';alignment='parallel';}
      else if(room.kind==='medical'){target=nearest(object,scene.objects,room.spaceProfile==='clinic'?['desk']:['hospitalbed','bed'],assets);activity=room.spaceProfile==='clinic'?'work':'visit';carry=room.spaceProfile==='clinic';}
      else if(asset.kind==='sofa'||room.kind==='lounge'&&asset.kind==='chair'||room.kind==='reception'&&asset.kind==='chair'){
        target=nearest(object,scene.objects,['coffeetable','roundtable'],assets);activity='conversation';carry=true;
      }else if(room.kind==='dining'){target=nearest(object,scene.objects,['roundtable','table'],assets);activity='dine';carry=true;}
      else if(room.kind==='meeting'){target=nearest(object,scene.objects,['table','conference'],assets);activity='collaborate';carry=true;}
      else if(room.kind==='kitchen'){target=nearest(object,scene.objects,['island','counter'],assets);activity='dine';carry=true;}
      else {target=nearest(object,scene.objects,['desk','reception','counter'],assets);activity='work';carry=true;}
      if(!target){
        object.facing={activity:asset.kind==='sofa'?'conversation':'waiting',point:{x:room.x+room.width/2,z:room.z+room.depth/2},automatic:true};continue;
      }
    }else if(asset.kind==='sink'){
      target=nearest(object,scene.objects,['island','table'],assets);activity='access';
    }else if(['monitor','laptop','tablet'].includes(asset.kind)&&object.supportId){
      const chair=scene.objects.find(o=>o.facing?.targetId===object.supportId&&o.facing.activity==='work');
      if(chair){target=chair;activity='screen';}
    }
    if(target)object.facing={activity,targetId:target.id,automatic:true,...(carry?{moveWithTarget:true}:{}),...(alignment?{alignment}:{})};
  }
}
export function orientNaturalRelations(scene,assets,canPlace){
  const changed=[];
  for(const object of scene.objects){
    if(!object.facing?.automatic)continue;
    const target=facingTarget(object,scene);if(!target||distance(object,target)<.02)continue;
    const rotation=faceRotation(object,target,assets[object.assetId]);
    if(Math.abs(normal(object.rotation)-rotation)<.01)continue;
    const candidate={...object,rotation};if(canPlace&&!canPlace(candidate))continue;
    object.rotation=rotation;changed.push(object.id);
  }
  return changed;
}

function bounds(object,asset){
  const t=(object.rotation||0)*Math.PI/180,[w,h,d]=asset.size;
  const width=Math.abs(w*Math.cos(t))+Math.abs(d*Math.sin(t)),depth=Math.abs(d*Math.cos(t))+Math.abs(w*Math.sin(t));
  return {x:object.x-width/2,z:object.z-depth/2,w:width,d:depth,y:object.elevation||0,h};
}
export function targetGap(object,target,assets){
  const a=assets[object.assetId],b=assets[target.assetId],len=distance(object,target);if(!len)return -1;
  const dx=(target.x-object.x)/len,dz=(target.z-object.z)/len,ba=bounds(object,a),bb=bounds(target,b);
  return len-((Math.abs(dx)*ba.w+Math.abs(dz)*ba.d)+(Math.abs(dx)*bb.w+Math.abs(dz)*bb.d))/2;
}
function backClearance(object,room,objects,assets){
  const v=frontVector(object,assets[object.assetId]),dx=-v.x,dz=-v.z,b=bounds(object,assets[object.assetId]);
  const start={x:object.x+dx*(Math.abs(dx)*b.w+Math.abs(dz)*b.d)/2,z:object.z+dz*(Math.abs(dx)*b.w+Math.abs(dz)*b.d)/2};
  let space=dx>.5?room.x+room.width-start.x:dx<-.5?start.x-room.x:dz>.5?room.z+room.depth-start.z:start.z-room.z;
  for(const other of objects){
    if(other.id===object.id||other.roomId!==room.id||assets[other.assetId]?.kind==='rug'||other.elevation>.95)continue;
    const ob=bounds(other,assets[other.assetId]);
    if(Math.abs(dx)>.5){if(ob.z+ob.d<start.z-b.d*.35||ob.z>start.z+b.d*.35)continue;const gap=dx>0?ob.x-start.x:start.x-ob.x-ob.w;if(gap>=-.01)space=Math.min(space,gap);}
    else {if(ob.x+ob.w<start.x-b.w*.35||ob.x>start.x+b.w*.35)continue;const gap=dz>0?ob.z-start.z:start.z-ob.z-ob.d;if(gap>=-.01)space=Math.min(space,gap);}
  }
  return space;
}
export function inspectNaturalLayout(scene,library){
  const assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),copy=structuredClone(scene);bindNaturalRelations(copy,assets);
  const issues=[];let checked=0;
  for(const object of copy.objects){
    const a=assets[object.assetId],room=copy.rooms.find(r=>r.id===object.roomId),target=facingTarget(object,copy);
    if(!a||!room||!target||!object.facing)continue;checked++;
    const v=frontVector(object,a),len=distance(object,target);if(len<.02)continue;
    const dot=(v.x*(target.x-object.x)+v.z*(target.z-object.z))/len;
    if(dot<.64)issues.push({code:'facing-away',objectId:object.id,targetId:object.facing.targetId,roomId:room.id,severity:'error',message:`${room.name}: ${a.name}이 ${object.facing.activity==='screen'?'사용자':'사용 대상'}을 등지고 있어요.`});
    const physicalTarget=copy.objects.find(o=>o.id===object.facing.targetId);
    if(physicalTarget&&['work','dine','collaborate','conversation'].includes(object.facing.activity)){
      const gap=targetGap(object,physicalTarget,assets),limit=a.kind==='sofa'?.85:.65;
      if(gap>limit)issues.push({code:'seat-too-far',objectId:object.id,targetId:physicalTarget.id,roomId:room.id,severity:'warning',gap,message:`${room.name}: ${a.name}과 테이블 사이가 너무 멀어요.`});
    }
    if(object.facing.activity==='work'&&seats.has(a.kind)){
      const space=backClearance(object,room,copy.objects,assets);
      if(space<CLEARANCE.chairBack-.04)issues.push({code:'chair-back-blocked',objectId:object.id,roomId:room.id,severity:'warning',clearance:space,message:`${room.name}: 의자 뒤 이동 공간이 좁아요.`});
    }
  }
  return {version:NATURAL_LAYOUT_VERSION,checked,issues,errors:issues.filter(i=>i.severity==='error'),warnings:issues.filter(i=>i.severity!=='error')};
}

// Reflow only linked seating, keeping rooms and Samsung product identities intact.
export function reflowNaturalSeating(scene,assets,canPlace){
  const moved=[];
  for(const object of scene.objects){
    const asset=assets[object.assetId],target=scene.objects.find(o=>o.id===object.facing?.targetId),room=scene.rooms.find(r=>r.id===object.roomId);
    if(!asset||!target||!room||!seats.has(asset.kind)||!['work','dine','collaborate','conversation','visit'].includes(object.facing.activity))continue;
    const ta=assets[target.assetId],f=object.facing;
    let direction;
    if(f.activity==='work'){
      direction=frontVector(target,ta);if(ta.kind==='reception')direction={x:-direction.x,z:-direction.z};
    }else {const r=faceRotation(target,object,ta);direction=frontVector({rotation:r},ta);}
    const tb=bounds(target,ta),gap=asset.kind==='sofa'?CLEARANCE.sofaGap:f.activity==='conversation'?.4:CLEARANCE.workGap;
    const edge=(Math.abs(direction.x)*tb.w+Math.abs(direction.z)*tb.d)/2,offset=edge+asset.size[2]/2+gap;
    const point={x:target.x+direction.x*offset,z:target.z+direction.z*offset};
    const rotation=faceRotation(point,target,asset);
    // A slight tangent offset prevents an L-shaped pair from touching at the corner.
    const candidates=[0,.2,-.2,.4,-.4].map(shift=>({...object,x:point.x-direction.z*shift,z:point.z+direction.x*shift,rotation}));
    const chosen=candidates.find(c=>canPlace(c));
    if(chosen&&(distance(object,chosen)>.02||Math.abs(normal(object.rotation)-rotation)>.01)){
      object.x=Math.round(chosen.x*10000)/10000;object.z=Math.round(chosen.z*10000)/10000;object.rotation=chosen.rotation;moved.push(object.id);
    }
  }
  return moved;
}
