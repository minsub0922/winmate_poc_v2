// All annotation geometry is stored in the same 1280 × 720 coordinate system.
export const LAYOUT_SIZE={width:1280,height:720};
export const IMAGE_STAGE={x:120,y:130,w:1040,h:550};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function createSpatialLayout(scene,library,{image,anchors,camera},view){
  if(!image||!anchors)throw new Error('조감도를 준비한 뒤 다시 추출해 주세요.');
  const k=Math.min(IMAGE_STAGE.w/anchors.width,IMAGE_STAGE.h/anchors.height),ox=IMAGE_STAGE.x+(IMAGE_STAGE.w-anchors.width*k)/2,oy=IMAGE_STAGE.y+(IMAGE_STAGE.h-anchors.height*k)/2;
  const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
  const targets=[...scene.rooms.map(r=>({id:'room:'+r.id,label:r.name,kind:'room',point:anchors.rooms[r.id]})),...scene.objects.map(o=>({id:o.id,label:assets[o.assetId]?.name||o.id,room:scene.rooms.find(r=>r.id===o.roomId)?.name,kind:assets[o.assetId]?.productId?'product':'furniture',point:anchors.objects[o.id]}))]
    .filter(t=>t.point&&t.point.visible!==false&&Number.isFinite(t.point.x)&&Number.isFinite(t.point.y)).map(({point,...target})=>({...target,x:ox+point.x*k,y:oy+point.y*k}));
  const {presentation,...source}=scene;
  return {version:1,renderVersion:2,...LAYOUT_SIZE,view,image,imageBox:{x:ox,y:oy,w:anchors.width*k,h:anchors.height*k},camera:camera||null,initialCamera:camera?structuredClone(camera):null,title:scene.title,sourceScene:structuredClone(source),targets,nodes:[]};
}
export function createLayoutNode(layout,type){
  const index=layout.nodes.length,id='annotation-'+globalThis.crypto.randomUUID();
  return {id,type,x:index%2?960:32,y:150+(Math.floor(index/2)%4)*126,w:288,h:104,fontSize:18,style:'blue',text:type==='callout'?'공간에 맞춘 제안\n설명을 입력하세요':'텍스트를 입력하세요',targets:[]};
}
export function createDescriptionNodes(layout,target,text){
  // Split long lists into readable linked boxes instead of clipping or omitting products.
  const fontSize=14,w=340,lines=layoutTextLines({type:'callout',text,w,fontSize}),pages=[];
  for(let i=0;i<lines.length;i+=20)pages.push(lines.slice(i,i+20).join('\n'));
  if(!pages.length||pages.length+layout.nodes.length>100)throw new Error('설명 영역이 많습니다. 기존 설명을 줄인 뒤 다시 시도해 주세요.');
  const placed=[...layout.nodes],result=[],area=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  for(const content of pages){
    const h=Math.max(100,layoutTextLines({type:'callout',text:content,w,fontSize}).length*fontSize*1.5+36);let best=null;
    for(let x=24;x<=1256-w;x+=32)for(let y=138;y<=700-h;y+=24){
      const box={x,y,w,h},score=placed.reduce((sum,n)=>sum+area(box,{x:n.x-12,y:n.y-12,w:n.w+24,h:n.h+24})*100,0)+area(box,layout.imageBox)*.12+layout.targets.filter(t=>t.x>x-8&&t.x<x+w+8&&t.y>y-8&&t.y<y+h+8).length*12000+Math.hypot(x+w/2-target.x,y+h/2-target.y)*8;
      if(!best||score<best.score)best={...box,score};
    }
    const {score,...position}=best,next={...createLayoutNode({...layout,nodes:placed},'callout'),...position,fontSize,text:content,targets:[target.id],generatedBy:'ai'};
    placed.push(next);result.push(next);
  }
  return result;
}
export function roomLabelMetrics(text){return {w:Math.max(86,Math.min(220,text.length*13+22)),h:30,fontSize:13};}
export function createRoomLabel(layout,target){
  const size=roomLabelMetrics(target.label);
  return moveLayoutNode({...createLayoutNode(layout,'room-label'),...size,text:target.label,style:'outline',targets:[target.id]},{x:target.x-size.w/2,y:target.y-size.h/2});
}
export function layoutCameraAngles(camera={}){
  if(camera?.position?.length===3&&camera?.target?.length===3){const [x,y,z]=camera.position.map((n,i)=>n-camera.target[i]);return {azimuth:(Math.atan2(x,z)*180/Math.PI+360)%360,elevation:Math.atan2(y,Math.hypot(x,z))*180/Math.PI,zoom:camera.zoom||1};}
  return {azimuth:camera?.azimuth??40,elevation:camera?.elevation??48,zoom:camera?.zoom||1};
}
export function reprojectSpatialLayout(layout,source,library,snapshot,view='3d'){
  const projected=createSpatialLayout(source,library,snapshot,view),before=Object.fromEntries(layout.targets.map(t=>[t.id,t])),after=Object.fromEntries(projected.targets.map(t=>[t.id,t]));
  return {...layout,renderVersion:2,view,image:projected.image,imageBox:projected.imageBox,camera:projected.camera,sourceScene:projected.sourceScene,targets:projected.targets,
    nodes:layout.nodes.map(node=>{if(node.type!=='room-label')return node;const id=node.targets[0];return before[id]&&after[id]?moveLayoutNode(node,{x:node.x+after[id].x-before[id].x,y:node.y+after[id].y-before[id].y}):node;})};
}
export function moveLayoutNode(node,patch){
  const w=clamp(patch.w??node.w,node.type==='room-label'?86:120,800),h=clamp(patch.h??node.h,node.type==='room-label'?30:48,500);
  return {...node,...patch,w,h,x:clamp(patch.x??node.x,0,1280-w),y:clamp(patch.y??node.y,0,720-h)};
}
export function layoutConnector(node,target){
  const cx=node.x+node.w/2,cy=node.y+node.h/2,dx=target.x-cx,dy=target.y-cy;
  if(Math.abs(dx)/node.w>=Math.abs(dy)/node.h){
    const x=cx+Math.sign(dx||1)*node.w/2,mid=(x+target.x)/2;
    return [{x,y:cy},{x:mid,y:cy},{x:mid,y:target.y},{x:target.x,y:target.y}];
  }
  const y=cy+Math.sign(dy||1)*node.h/2,mid=(y+target.y)/2;
  return [{x:cx,y},{x:cx,y:mid},{x:target.x,y:mid},{x:target.x,y:target.y}];
}
export function layoutTextLines(node){
  const maxWidth=node.w-(node.type==='room-label'?22:32),lines=[];
  for(const paragraph of node.text.split('\n')){
    let line='',width=0;
    for(const char of paragraph){const step=node.fontSize*(/[\u0000-\u007f]/.test(char)?.56:1);if(width+step>maxWidth&&line){lines.push(line);line='';width=0;}line+=char;width+=step;}
    lines.push(line);
  }
  return lines;
}
export function validSpatialLayout(layout){
  return layout?.version===1&&layout.width===1280&&layout.height===720&&typeof layout.title==='string'&&/^data:image\/(png|jpeg|svg\+xml)[;,]/.test(layout.image)&&
    layout.imageBox&&['x','y','w','h'].every(k=>Number.isFinite(layout.imageBox[k]))&&Array.isArray(layout.targets)&&layout.targets.length<=2030&&layout.targets.every(t=>typeof t.id==='string'&&typeof t.label==='string'&&Number.isFinite(t.x)&&Number.isFinite(t.y))&&
    (!layout.sourceScene||layout.sourceScene.version===1&&Array.isArray(layout.sourceScene.rooms)&&Array.isArray(layout.sourceScene.objects))&&
    Array.isArray(layout.nodes)&&layout.nodes.length<=100&&new Set(layout.nodes.map(n=>n.id)).size===layout.nodes.length&&layout.nodes.every(n=>typeof n.id==='string'&&['text','callout','room-label'].includes(n.type)&&typeof n.text==='string'&&n.text.length<=3000&&['x','y','w','h','fontSize'].every(k=>Number.isFinite(n[k]))&&n.w>=(n.type==='room-label'?86:120)&&n.w<=800&&n.h>=(n.type==='room-label'?30:48)&&n.h<=500&&n.x>=0&&n.x+n.w<=1280&&n.y>=0&&n.y+n.h<=720&&n.fontSize>=12&&n.fontSize<=36&&Array.isArray(n.targets)&&n.targets.every(id=>layout.targets.some(t=>t.id===id)));
}
