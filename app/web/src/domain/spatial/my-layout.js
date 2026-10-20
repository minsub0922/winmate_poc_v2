import {fingerprint} from './scene.js';
import {layoutConnector,layoutTextLines,validSpatialLayout} from './layout.js';
import {escapeXml} from './plan-svg.js';

const rounded=value=>Array.isArray(value)?value.map(rounded):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rounded(item)])):typeof value==='number'?Math.round(value*10000)/10000:value;
// Pixels and projected coordinates are derived from this content. Tiny camera
// normalization differences must not make an unchanged saved layout dirty.
export function spatialLayoutSignature(layout){
  if(!layout)return null;
  return fingerprint(rounded({title:layout.title,view:layout.view,camera:layout.camera,nodes:layout.nodes,sourceScene:layout.sourceScene,renderVersion:layout.renderVersion}));
}
export const spatialLayoutStructure=layout=>layout.nodes.map(node=>[node.id,node.type]);

export function spatialLayoutHtml(layout,imageSource=layout.image){
  if(!validSpatialLayout(layout))throw new Error('저장할 조감도 레이아웃을 확인해 주세요.');
  const text=(index,content,x,y,w,h,size,color,bold=false,extra='')=>`<div data-tb="${index}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;font-size:${size}px;font-weight:${bold?700:400};line-height:1.5;color:${color};overflow:hidden;word-break:keep-all;overflow-wrap:anywhere;${extra}">${content}</div>`;
  let html='<div data-my="spatial" data-spatial-layout="1" data-keep-font style="position:relative;width:1280px;height:720px;overflow:hidden;background:#ffffff;color:#121417;font-family:\'Noto Sans KR\',sans-serif">';
  html+=text(0,'공간별 맞춤 제안',64,48,1152,25,14,'#1428a0',true);
  html+=text(1,escapeXml(layout.title),64,74,1152,42,28,'#121417',true);
  const box=layout.imageBox;
  html+=`<div data-img="0" data-kind="aerial" data-hint="저장한 ${layout.view.toUpperCase()} 조감도" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;overflow:hidden"><img src="${escapeXml(imageSource)}" alt="${escapeXml(layout.title)}" style="display:block;width:100%;height:100%;object-fit:contain"/></div>`;
  const targets=Object.fromEntries(layout.targets.map(target=>[target.id,target]));
  for(const node of layout.nodes.filter(node=>node.type==='callout'))for(const id of node.targets){
    const target=targets[id];if(!target)continue;const points=layoutConnector(node,target);
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y);if(w<.001&&h<.001)continue;
      html+=`<div data-layout-line="${escapeXml(node.id+':'+id)}" style="position:absolute;left:${x-(w?0:1)}px;top:${y-(h?0:1)}px;width:${w||2}px;height:${h||2}px;background:#1428a0"></div>`;
    }
    html+=`<div style="position:absolute;left:${target.x-3}px;top:${target.y-3}px;width:6px;height:6px;border-radius:50%;background:#1428a0;border:1px solid #fff;box-sizing:border-box"></div>`;
  }
  layout.nodes.forEach((node,i)=>{
    if(node.type!=='text')html+=`<div data-layout-shape="${escapeXml(node.id)}" style="position:absolute;left:${node.x}px;top:${node.y}px;width:${node.w}px;height:${node.h}px;border-radius:${node.type==='room-label'?8:18}px;background:${node.style==='outline'?'#ffffff':'#006eff'};border:${node.type==='room-label'?1.2:2}px solid ${node.type==='room-label'?'#1428a0':'#006eff'};box-sizing:border-box"></div>`;
    const lines=layoutTextLines(node),content=lines.map(escapeXml).join('<br>');
    html+=node.type==='room-label'?text(i+2,content,node.x+11,node.y+(node.h-lines.length*node.fontSize*1.5)/2,node.w-22,lines.length*node.fontSize*1.5,node.fontSize,'#1428a0',false,'text-align:center'):text(i+2,content,node.x+16,node.y+12,node.w-32,node.h-18,node.fontSize,node.type==='callout'&&node.style!=='outline'?'#ffffff':'#182346');
  });
  return html+'</div>';
}
