import { STYLES } from './geometry.js';
import { planAnchors } from './scene.js';
import { spatialPartFootprint } from './part-plan.js';
import {peopleRenderGroups} from './people-placement-geometry.js';

export const escapeXml = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const svgData = svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
const n=x=>Number(x.toFixed(3));
// Annotation colors follow Winmate branding; room finishes and product materials remain scene data.
export function planSvg(scene,library,{width=1280,height=820,selected,highlighted=[],labels=true,productPins=true,dimensions=true,transparentBackground=false}={}) {
  const highlights=new Set(highlighted);
  const a=planAnchors(scene,{x:0,y:0,w:width,h:height}),k=a.scale,[ox,oy]=a.origin,s=STYLES[scene.style],assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
  const xy=(x,z)=>[n(ox+x*k),n(oy+z*k)];
  const rect=(x,z,w,d,fill,stroke='#d3d8e0',sw=1,extra='')=>`<rect x="${n(x)}" y="${n(z)}" width="${n(w)}" height="${n(d)}" rx="1.6" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
  let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(scene.title)} · 2D 평면도"><defs><pattern id="sp-floor" width="${n(k*.65)}" height="${n(k*2)}" patternUnits="userSpaceOnUse"><rect width="100%" height="100%" fill="${s.floor}"/><path d="M0 0V${n(k*2)}M0 0H${n(k*.65)}" stroke="#ffffff" stroke-opacity=".36" stroke-width=".8"/></pattern></defs><rect width="${width}" height="${height}" fill="#f7f8fa"/>`;
  if(transparentBackground)out=out.replace(/<rect width="\d+" height="\d+" fill="#[a-f0-9]+"\/>$/i,'');
  out+=rect(ox-4,oy-4,scene.width*k+8,scene.depth*k+8,'#eef0f4','#d3d8e0',1.5);
  for(const [ri,r] of scene.rooms.entries()){
    const [x,y]=xy(r.x,r.z),w=r.width*k,d=r.depth*k,door=Math.min(1.15*k,w*.3),cx=x+w/2;
    out+=`<g data-room-id="${escapeXml(r.id)}">${rect(x,y,w,d,r.outdoor?'#dce4d2':'url(#sp-floor)','#596170',2.4)}`;
    out+=`<path d="M${n(cx-door/2)} ${n(y+d)}h${n(door)}" stroke="${s.floor}" stroke-width="5"/><path d="M${n(cx-door/2)} ${n(y+d)}v${n(-door)}a${n(door)} ${n(door)} 0 0 1 ${n(door)} ${n(door)}" fill="none" stroke="#6e7686" stroke-width=".8"/>`;
    out+=`<path d="M${n(x+w*.16)} ${n(y)}h${n(w*.32)}M${n(x+w*.63)} ${n(y)}h${n(w*.22)}" stroke="#b7d9e2" stroke-width="4"/>`;
    if(labels)out+=`<rect x="${n(x+7)}" y="${n(y+7)}" width="${n(Math.min(w-14,Math.max(80,r.name.length*10.5+28)))}" height="25" rx="5" fill="#ffffff" opacity=".95"/><text x="${n(x+15)}" y="${n(y+24)}" font-family="'Noto Sans KR',sans-serif" font-size="12" font-weight="700" fill="#121417">${String(ri+1).padStart(2,'0')} ${escapeXml(r.name)}</text>`;
    out+='</g>';
  }
  const ordered=[...scene.objects].sort((x,y)=>x.elevation-y.elevation||(assets[x.assetId].kind==='rug'?-1:0));
  let pin=0;
  for(const o of ordered){
    const asset=assets[o.assetId];if(!asset)continue;
    const [w,h,d]=asset.size,[x,y]=xy(o.x,o.z),W=w*k,D=d*k,kind=asset.kind,product=!!asset.productId;
    const colors={wood:s.wood,fabric:s.fabric,cushion:s.cushion,body:'#f7f8f7',black:'#2c3a41',metal:'#8a969b',silver:'#b6c0c3',screen:'#1c6a9e',screenOff:'#090c10',leaf:'#4c8061',grille:'#a4b1ad',linen:'#f6f1e5',stone:'#d4d2c6',rug:'#d2d8cd',pot:'#c6b89f',cardboard:'#bf9d75',glass:'#b8ced3',light:'#fcf9ec'};
    out+=`<g data-object-id="${escapeXml(o.id)}" ${highlights.has(o.id)?'data-highlighted="true"':''} transform="translate(${x} ${y}) rotate(${o.rotation||0})" ${selected===o.id||highlights.has(o.id)?'filter="drop-shadow(0 0 3px #1428a0)"':''}>`;
    const parts=library.recipes[asset.recipe||kind]||asset.parts||[];
    if(o.mount==='ceiling')out+=`<rect x="${n(-W/2-3)}" y="${n(-D/2-3)}" width="${n(W+6)}" height="${n(D+6)}" fill="none" stroke="#596170" stroke-dasharray="3 2" rx="4"/>`;
    if((library.geometryVersion||1)<2||selected===o.id)out+=rect(-W/2,-D/2,Math.max(W,3),Math.max(D,3),(library.geometryVersion||1)>=2?'none':product?'#dcebf2':(kind==='rug'?'#d6d6cb':s.wood),product?'#1428a0':'#6e7686',selected===o.id?2.5:.8);
    const sorted=[...parts].sort((a,b)=>a.position[1]-b.position[1]);
    for(const p of sorted){
      const [px,py,pz]=p.position,[pw,ph,pd]=p.size,color=p.material==='body'&&asset.appearance?.bodyColor?asset.appearance.bodyColor:colors[p.material]||p.material==='paper'&&'#e8e5db'||p.material;
      if((library.geometryVersion||1)>=2)out+=`<polygon points="${spatialPartFootprint(p,asset).map(([x,z])=>n(x*k)+','+n(z*k)).join(' ')}" fill="${escapeXml(color)}" stroke="#8a909d" stroke-width=".4"/>`;
      else if(p.shape==='sphere')out+=`<ellipse cx="${n(px*W)}" cy="${n(pz*D)}" rx="${n(pw*W)}" ry="${n(pd*D)}" fill="${color}" stroke="#8a909d" stroke-width=".4"/>`;
      else if(p.shape==='cylinder'&&!p.rotate)out+=`<ellipse cx="${n(px*W)}" cy="${n(pz*D)}" rx="${n(pw*W)}" ry="${n(pd*D)}" fill="${color}" stroke="#8a909d" stroke-width=".5"/>`;
      else if(p.shape==='box')out+=rect((px-pw/2)*W,(pz-pd/2)*D,pw*W,Math.max(.7,pd*D),color,'#8a909d',.4);
    }
    for(const occupant of peopleRenderGroups(o,scene,assets)){
      out+=`<g data-person-role="${escapeXml(occupant.actor.role)}" data-person-source="${escapeXml(occupant.person.sourceAssetId)}"><title>${escapeXml(occupant.actor.role)}</title>`;
      for(const p of [...occupant.parts].sort((a,b)=>a.position[1]-b.position[1]))out+=`<polygon points="${spatialPartFootprint(p,{size:[1,1,1]}).map(([x,z])=>n(x*k)+','+n(z*k)).join(' ')}" fill="${escapeXml(colors[p.material]||p.material)}" stroke="#8a909d" stroke-width=".3"/>`;
      out+='</g>';
    }
    if(highlights.has(o.id))out+=rect(-Math.max(W,3)/2-5,-Math.max(D,3)/2-5,Math.max(W,3)+10,Math.max(D,3)+10,'none','#1428a0',3,`data-highlight-outline="${escapeXml(o.id)}"`);
    if(selected===o.id&&['chair','taskchair','sofa','stool'].includes(kind)){
      const start=D/2+5,end=start+Math.max(17,k*.45);
      out+=`<g data-facing-direction="${escapeXml(o.id)}" aria-label="가구 앞 방향"><path d="M0 ${n(start)}V${n(end)}" stroke="#1428a0" stroke-width="1.8"/><path d="M-4 ${n(end-5)}L0 ${n(end)}L4 ${n(end-5)}" fill="none" stroke="#1428a0" stroke-width="1.8"/></g>`;
    }
    out+='</g>';
    if(product&&productPins){pin++;out+=`<g data-product-pin="${escapeXml(o.id)}"><circle cx="${n(x+9)}" cy="${n(y-9)}" r="9" fill="#1428a0" stroke="#fff" stroke-width="1.5"/><text x="${n(x+9)}" y="${n(y-5.5)}" font-family="sans-serif" font-size="9" font-weight="700" text-anchor="middle" fill="#fff">${pin}</text></g>`;}
  }
  if(dimensions){
    out+=`<g stroke="#596170" fill="none"><path d="M${n(ox)} ${n(oy+scene.depth*k+18)}h${n(scene.width*k)}m0 -5v10M${n(ox)} ${n(oy+scene.depth*k+13)}v10"/></g><text x="${n(width/2)}" y="${n(oy+scene.depth*k+35)}" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#596170">${scene.width.toFixed(1)} m × ${scene.depth.toFixed(1)} m</text>`;
    out+=`<g transform="translate(25 ${height-33})"><path d="M0 0h${n(k*2)}m0 -5v10M0 -5v10" stroke="#596170"/><text x="${n(k)}" y="-8" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#596170">2 m</text></g>`;
  }
  return out+'</svg>';
}
