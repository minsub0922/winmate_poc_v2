import { planSvg,svgData } from './plan-svg.js';
import { planAnchors } from './scene.js';
import { STYLES } from './geometry.js';
import {peopleRenderGroups} from './people-placement-geometry.js';
import {spatialPartFootprint} from './part-plan.js';

export function embedSpatial(scene,library,{view='2d',snapshot,roomIds}={}){
  const ids=new Set(scene.objects.flatMap(o=>[o.assetId,...(o.people||[]).flatMap(p=>[p.sourceAssetId,p.meal?.sourceAssetId].filter(Boolean))])),assets=library.assets.filter(a=>ids.has(a.id)),kinds=new Set(assets.map(a=>a.recipe||a.kind));
  return {version:1,nativePlanVersion:scene.rooms.some(r=>r.layoutCompositionVersion>=4)?2:1,scene:structuredClone(scene),view,library:{version:library.version,geometryVersion:library.geometryVersion,peopleLayoutVersion:library.peopleLayoutVersion,sourceHash:library.sourceHash,assets,recipes:Object.fromEntries(Object.entries(library.recipes).filter(([k])=>kinds.has(k)))},
    ...(snapshot?{image:snapshot.image,anchors:snapshot.anchors,camera:snapshot.camera}:{}),roomIds:roomIds||scene.rooms.slice(0,6).map(r=>r.id)};
}
export function spatialSlideRows(binding){
  const byid=Object.fromEntries(binding.library.assets.map(a=>[a.id,a]));
  return binding.roomIds.map(id=>binding.scene.rooms.find(r=>r.id===id)).filter(Boolean).map(room=>{
    const products=binding.scene.objects.filter(o=>o.roomId===room.id&&byid[o.assetId]?.productId);
    return {room,products,summary:[...new Set(products.map(o=>byid[o.assetId].model))].join(' · ')||room.purpose||'공간 구성'};
  });
}
// Coordinates use the exact same projection and image fit as the preview and PPT exporter.
export function spatialConnectors(binding,stage={x:64,y:160,w:820,h:490}){
  const anchors=binding.view==='3d'?binding.anchors:{width:1280,height:820,...planAnchors(binding.scene)};
  if(!anchors?.rooms)throw new Error('조감도 투영 좌표가 없습니다. 다시 생성해 주세요.');
  const width=anchors.width||1280,height=anchors.height||820,k=Math.min(stage.w/width,stage.h/height),ox=stage.x+(stage.w-width*k)/2,oy=stage.y+(stage.h-height*k)/2;
  return spatialSlideRows(binding).map(({room},i)=>{
    const point=anchors.rooms[room.id];if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error('공간 연결 좌표가 올바르지 않습니다.');
    return {roomId:room.id,number:binding.scene.rooms.findIndex(r=>r.id===room.id)+1,x1:ox+point.x*k,y1:oy+point.y*k,x2:930,y2:181+i*79};
  });
}
export function applySpatialBinding(root,binding,textOverrides={}){
  if(!binding||binding.version!==1||!root?.hasAttribute('data-spatial-template'))return;
  const slot=root.querySelector('[data-spatial-slot]');if(!slot)return;
  slot.title='공간·제품의 위치는 공간 조감도에서 수정하세요';
  root.querySelectorAll('[data-spatial-overlay]').forEach(el=>el.remove());
  if(binding.view==='3d'&&!binding.image)throw new Error('3D 렌더 이미지가 없습니다. 3D 화면에서 다시 연결해 주세요.');
  const image=document.createElement('img');image.src=binding.view==='3d'?binding.image:svgData(planSvg(binding.scene,binding.library,{productPins:false}));
  image.alt=binding.scene.title;image.style.cssText='display:block;width:100%;height:100%;object-fit:contain';slot.replaceChildren(image);
  if(binding.view==='2d')image.setAttribute('data-spatial-plan','1');root.__spatialBinding=binding;
  const rows=spatialSlideRows(binding),title=root.querySelector('[data-tb="1"]'),subtitle=root.querySelector('[data-tb="2"]');
  if(title&&!Object.hasOwn(textOverrides,'1'))title.textContent=binding.scene.title;
  if(title){
    const canvas=document.createElement('canvas'),c=canvas.getContext('2d');c.font='700 30px "Noto Sans KR"';const measured=c.measureText(title.textContent).width;
    const font=measured<=1152?30:Math.min(20,Math.max(14,Math.floor(30*2200/measured)));
    title.style.fontSize=font+'px';title.style.lineHeight='1.1';title.style.maxHeight='44px';title.style.overflow='hidden';title.style.whiteSpace=measured<=1152?'nowrap':'normal';
  }
  if(subtitle&&!Object.hasOwn(textOverrides,'2'))subtitle.textContent=`${binding.scene.width.toFixed(1)} × ${binding.scene.depth.toFixed(1)} m · ${binding.scene.rooms.length}개 공간 · ${binding.scene.objects.filter(o=>o.assetId.startsWith('product:')).length}개 제품 · ${binding.view.toUpperCase()}`;
  for(let i=0;i<6;i++){
    const row=rows[i],card=root.querySelector(`[data-spatial-card="${i}"]`),name=root.querySelector(`[data-tb="${3+i*2}"]`),desc=root.querySelector(`[data-tb="${4+i*2}"]`);
    if(card)card.style.display=row?'block':'none';if(name){if(!Object.hasOwn(textOverrides,String(3+i*2)))name.textContent=row?.room.name||'';name.style.display=row?'block':'none';}if(desc){if(!Object.hasOwn(textOverrides,String(4+i*2)))desc.textContent=row?.summary||'';desc.style.display=row?'block':'none';desc.style.fontSize='11px';desc.style.maxHeight='33px';desc.style.overflow='hidden';}
    if(row){const number=root.querySelector(`[data-spatial-number="${i}"]`);if(number)number.textContent=String(binding.scene.rooms.indexOf(row.room)+1).padStart(2,'0');}
  }
  for(const c of spatialConnectors(binding)){
    const line=document.createElement('div');line.setAttribute('data-spatial-overlay','1');line.setAttribute('data-spatial-connector',JSON.stringify(c));const dx=c.x2-c.x1,dy=c.y2-c.y1;
    line.style.cssText=`position:absolute;left:${c.x1}px;top:${c.y1}px;width:${Math.hypot(dx,dy)}px;height:0;border-top:1.5px solid #446f96;transform-origin:0 0;transform:rotate(${Math.atan2(dy,dx)}rad);pointer-events:none`;root.appendChild(line);
    const pin=document.createElement('div');pin.setAttribute('data-spatial-overlay','1');pin.textContent=String(c.number);pin.style.cssText=`position:absolute;left:${c.x1-10}px;top:${c.y1-10}px;width:20px;height:20px;border-radius:50%;background:#1428a0;color:white;text-align:center;line-height:20px;font-size:10px;font-weight:700;box-shadow:0 0 0 2px #fff;pointer-events:none`;root.appendChild(pin);
  }
}
export function addNativePlan(slide,binding,stage,shapeType){
  const scene=binding.scene,assets=Object.fromEntries(binding.library.assets.map(a=>[a.id,a])),anchors=planAnchors(scene),k=Math.min(stage.w/1280,stage.h/820),ox=stage.x+(stage.w-1280*k)/2,oy=stage.y+(stage.h-820*k)/2,scale=anchors.scale*k,px=1/96;
  const box=(x,z,w,d)=>({x:(ox+anchors.origin[0]*k+x*scale)*px,y:(oy+anchors.origin[1]*k+z*scale)*px,w:Math.max(.005,w*scale*px),h:Math.max(.005,d*scale*px)});
  const colors={warm:'E6DCCB',modern:'E4E8EA',premium:'D8D1C7',clinical:'E6EFEF',industrial:'BFC4C7'};
  const style=STYLES[scene.style],materials={wood:style.wood,fabric:style.fabric,cushion:style.cushion,body:'#f7f8f7',black:'#2c3a41',metal:'#8a969b',silver:'#b6c0c3',screen:'#1c6a9e',screenOff:'#090c10',paper:'#e8e5db',leaf:'#4c8061',grille:'#a4b1ad',linen:'#f6f1e5',stone:'#d4d2c6',rug:'#d2d8cd',pot:'#c6b89f',cardboard:'#bf9d75',glass:'#b8ced3',light:'#fcf9ec'};
  const polygon=(part,asset,object,name,width=.2)=>{
    const angle=(object.rotation||0)*Math.PI/180,points=spatialPartFootprint(part,asset).map(([x,z])=>[object.x+x*Math.cos(angle)-z*Math.sin(angle),object.z+x*Math.sin(angle)+z*Math.cos(angle)]);
    if(points.length<3)return;
    const x=Math.min(...points.map(p=>p[0])),z=Math.min(...points.map(p=>p[1])),w=Math.max(...points.map(p=>p[0]))-x,d=Math.max(...points.map(p=>p[1]))-z;
    const color=part.material==='body'&&asset.appearance?.bodyColor?asset.appearance.bodyColor:materials[part.material]||part.material;
    slide.addShape(shapeType.custGeom||'custGeom',{...box(x,z,w,d),points:[...points.map(p=>({x:(p[0]-x)*scale*px,y:(p[1]-z)*scale*px})),{close:true}],fill:{color:color.replace('#',''),...(object.mount==='ceiling'?{transparency:35}:{})},line:{color:'788B83',width},objectName:name});
  };
  for(const room of scene.rooms){
    slide.addShape(shapeType.rect,{...box(room.x,room.z,room.width,room.depth),fill:{color:room.outdoor?'DCE4D2':colors[scene.style]},line:{color:'647877',width:1.5},objectName:'space:'+room.id});
    slide.addText(room.name,{...box(room.x+.16,room.z+.18,room.width-.32,.45),fontSize:8,fontFace:'Noto Sans KR',bold:true,color:'254B48',margin:0,objectName:'room-label:'+room.id});
    slide.addShape(shapeType.rect,{...box(room.x+room.width/2-.6,room.z+room.depth-.04,1.2,.08),fill:{color:colors[scene.style]},line:{transparency:100}});
  }
  for(const o of [...scene.objects].sort((a,b)=>a.elevation-b.elevation)){
    const asset=assets[o.assetId],[w,h,d]=asset.size;
    if(binding.nativePlanVersion!==2)slide.addShape(['plant','roundtable','cassette360'].includes(asset.kind)?shapeType.ellipse:shapeType.rect,{...box(o.x-w/2,o.z-d/2,w,d),rotate:o.rotation||0,fill:{color:asset.productId?'B9D6E8':asset.kind==='plant'?'568467':asset.kind==='rug'?'D2D8CD':'C3AC8F',transparency:o.mount==='ceiling'?35:0},line:{color:asset.productId?'306A8B':'7E877B',width:.5,dashType:o.mount==='ceiling'?'dash':undefined},objectName:o.id});
    const recipe=binding.library.recipes[asset.recipe||asset.kind]||asset.parts||[],angle=(o.rotation||0)*Math.PI/180;
    for(const [index,p] of [...recipe].sort((a,b)=>a.position[1]-b.position[1]).entries()){
      if(binding.nativePlanVersion===2){polygon(p,asset,o,o.id+':part-'+index);continue;}
      const circular=p.shape==='sphere'||p.shape==='cylinder'&&!p.rotate;if(p.shape==='cylinder'&&!circular)continue;
      const x=p.position[0]*w,z=p.position[2]*d,cx=o.x+x*Math.cos(angle)-z*Math.sin(angle),cz=o.z+x*Math.sin(angle)+z*Math.cos(angle);
      const pw=p.size[0]*w*(circular?2:1),pd=Math.max(.012,p.size[2]*d*(circular?2:1)),color=(materials[p.material]||p.material).replace('#','');
      slide.addShape(circular?shapeType.ellipse:shapeType.rect,{...box(cx-pw/2,cz-pd/2,pw,pd),rotate:o.rotation||0,fill:{color},line:{color:'788B83',width:.2},objectName:o.id+':part-'+index});
    }
    for(const occupant of peopleRenderGroups(o,scene,assets))for(const [index,p]of [...occupant.parts].sort((a,b)=>a.position[1]-b.position[1]).entries())polygon(p,{size:[1,1,1]},o,`${o.id}:occupant-${occupant.index}-${occupant.actor.roleId}:part-${index}`,.15);
  }
}
