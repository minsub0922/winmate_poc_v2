#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {presetGeom,buildGeom} from '../web/src/domain/slides/import/geom.js';
import {legacySrc} from '../web/src/domain/templates/legacy_img.js';
import {referencePlan,composeReference} from './compose_reference_proposals.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'output/description-standards'),target=path.join(root,'app/web/src/domain/templates');
const {sources,scenes}=JSON.parse(await fs.readFile(path.join(out,'scene.json'),'utf8'));
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const briefs=(await read('app/web/src/domain/templates/vertical_scenarios.json')).scenarios;
const productNames=Object.fromEntries((await read('app/data/catalog.json')).products.map(p=>[p.id,p.name]));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const list=v=>v==null?[]:Array.isArray(v)?v:[v];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const px=x=>Math.round(Number(x||0)*10000)/10000;
const box=b=>`position:absolute;left:${px(b[0])}px;top:${px(b[1])}px;width:${px(Math.max(.2,b[2]))}px;height:${px(Math.max(.2,b[3]))}px;box-sizing:border-box;`;
const theme={bg1:'#ffffff',bg2:'#e7e6e6',tx1:'#000000',tx2:'#44546a',dk1:'#000000',dk2:'#44546a',lt1:'#ffffff',lt2:'#e7e6e6',accent1:'#5b9bd5',accent2:'#ed7d31',accent3:'#a5a5a5',accent4:'#ffc000',accent5:'#4472c4',accent6:'#70ad47'};
function color(value,fallback='transparent'){
 if(!value)return fallback;if(typeof value==='string')return value.startsWith('#')?value:theme[value]||({white:'#fff',black:'#000',blue:'#1428a0'}[value]||fallback);
 let node=value.srgbClr||value.schemeClr||value.prstClr||value.sysClr;
 if(!node&&value.solidFill)return color(value.solidFill,fallback);
 if(!node)return fallback;
 let rgb=value.srgbClr?'#'+node.val:value.sysClr?'#'+node.lastClr:color(node.val,fallback);
 if(!/^#[\da-f]{6}$/i.test(rgb))return rgb;
 let a=[1,3,5].map(i=>parseInt(rgb.slice(i,i+2),16));
 if(node.lumMod)a=a.map(n=>n*Number(node.lumMod.val)/100000);
 if(node.lumOff)a=a.map(n=>n+255*Number(node.lumOff.val)/100000);
 const opacity=node.alpha?Number(node.alpha.val)/100000:1;
 return `rgba(${a.map(n=>Math.round(Math.max(0,Math.min(255,n)))).join(',')},${opacity})`;
}
function compactGeometry(node){
 const s=node.summary||'';const prst=(s.match(/^(\w+)/)||[])[1]||(/타원/.test(s)?'ellipse':'rect');
 const f=s.match(/채움\s+(#[\dA-Fa-f]{6}|bg[12]|tx[12]|white|black|accent\d)(?:\s+@(\d+)%)/)||s.match(/채움\s+(#[\dA-Fa-f]{6}|bg[12]|tx[12]|white|black|accent\d)/);
 const line=s.match(/선\s+(#[\dA-Fa-f]{6}|bg[12]|tx[12]|accent\d|white|black)\s*([\d.]+)?pt/);
 const g={prstGeom:{prst:prst==='자유형'?'rect':prst}};
 if(f)g.solidFill={srgbClr:{val:(color(f[1],'#e8effa').replace('#','')), ...(f[2]?{alpha:{val:String(Number(f[2])*1000)}}:{})}};
 if(line)g.ln={w:String(Number(line[2]||.6)*12700),solidFill:{schemeClr:{val:line[1]}}};
 if(/선없음/.test(s))g.ln={noFill:{}};
 if(/그라데이션/.test(s)){const colors=s.match(/#[\dA-Fa-f]{6}/g)||['#1428a0','#00b0f0'];g.gradFill={gsLst:{gs:colors.map((c,i)=>({pos:String(i*100000/Math.max(1,colors.length-1)),srgbClr:{val:c.slice(1)}}))}};}
 return g;
}
function customDef(cg){
 const defs=k=>list(cg[k]?.gd).map(g=>[g.name,g.fmla]);
 return {av:defs('avLst'),gd:defs('gdLst'),p:list(cg.pathLst?.path).map(p=>{
  const c=[];for(const [key,value] of Object.entries(p))for(const v of list(value)){
   if(key==='moveTo'||key==='lnTo')c.push([key==='moveTo'?'M':'L',v.pt?.x||'0',v.pt?.y||'0']);
   else if(key==='cubicBezTo'||key==='quadBezTo')c.push([key==='cubicBezTo'?'C':'Q',...list(v.pt).flatMap(q=>[q.x,q.y])]);
   else if(key==='arcTo')c.push(['A',v.wR,v.hR,v.stAng,v.swAng]);else if(key==='close')c.push(['Z']);
  }return {w:Number(p.w)||undefined,h:Number(p.h)||undefined,f:p.fill,s:p.stroke==='0'?0:1,c};
 })};
}
let svgSerial=0;
function shape(node){
 const [x,y,w0,h0]=node.box,w=Math.max(.2,w0),h=Math.max(.2,h0);const g=Object.keys(node.geometry||{}).length?node.geometry:compactGeometry(node);
 if(!g.solidFill&&!g.gradFill&&!g.ln&&!node.motif)return '';
 let fill=color(g.solidFill),extra='';
 if(node.motif)fill='#2d70f8';
 if(g.gradFill){const id='desc-gradient-'+(++svgSerial);const stops=list(g.gradFill.gsLst?.gs);extra=`<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops.map(s=>`<stop offset="${Number(s.pos)/1000}%" stop-color="${color(s,'#1428a0')}"/>`).join('')}</linearGradient></defs>`;fill=`url(#${id})`;}
 const line=g.ln;const stroke=line&&!line.noFill?color(line.solidFill,'#a7b1bf'):'none';
 if(fill==='transparent'&&stroke==='none'&&!node.motif)return '';
 const width=line?Math.max(.3,Number(line.w||6350)/12700*1280/(node.sourcePt?.[0]||720)):0;
 const basic=g.prstGeom?.prst||'rect';
 if(!g.custGeom&&!g.gradFill&&['rect','roundRect','ellipse'].includes(basic)){
  const radius=basic==='ellipse'?'50%':basic==='roundRect'?Math.min(14,w/8,h/8)+'px':'0';
  return `<div data-desc-native-shape="${basic}" aria-hidden="true" style="${box([x,y,w,h])}background:${fill};border-radius:${radius};${stroke!=='none'?`border:${width}px solid ${stroke};`:''}"></div>`;
 }
 let paths;
 try{paths=g.custGeom?buildGeom(customDef(g.custGeom),w,h).paths:presetGeom(node.motif?'ellipse':g.prstGeom?.prst||'rect',w,h,Object.fromEntries(list(g.prstGeom?.avLst?.gd).map(a=>[a.name,Number(String(a.fmla).split(' ').at(-1))]))).paths;}catch{paths=presetGeom('rect',w,h).paths;}
 const xf=g.xfrm||{};const transforms=[];if(xf.flipH==='1')transforms.push(`translate(${w} 0) scale(-1 1)`);if(xf.flipV==='1')transforms.push(`translate(0 ${h}) scale(1 -1)`);
 const dash=line?.prstDash?.val;return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true" style="${box([x,y,w,h])}overflow:visible">${extra}<g transform="${transforms.join(' ')}">${paths.map(p=>`<path d="${esc(p.d)}" fill="${p.fill==='none'?'none':fill}" stroke="${p.stroke?stroke:'none'}" stroke-width="${width}"${dash&&dash!=='solid'?' stroke-dasharray="5 4"':''}/>`).join('')}</g></svg>`;
}
const baseCss='width:1280px;height:720px;position:relative;overflow:hidden;font-family:Noto Sans KR,sans-serif;line-height:1.2;';
function lightColor(value){const numbers=String(value).match(/[\d.]+/g);let rgb;if(String(value).startsWith('#')){const h=value.slice(1);rgb=h.length===3?[...h].map(c=>parseInt(c+c,16)):[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}else if(String(value).startsWith('rgb')&&numbers)rgb=numbers.slice(0,3).map(Number);else return true;return (rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)>165;}
function compile(scene){
 const white=scene.role==='브랜드 엔딩';let background=white?'#000000':'#ffffff';
 // Explicit full-canvas shape fills are the background rather than opaque
 // foreground rectangles covering every source object in a compressed spec.
 for(const n of scene.nodes)if(n.kind==='shape'&&n.box[2]>1270&&n.box[3]>710){const g=Object.keys(n.geometry||{}).length?n.geometry:compactGeometry(n);if(g.solidFill)background=color(g.solidFill,background);}
 let t=0,i=0;const texts={},images={},mapping=[],parts=[],specs=[],paintedShapes=[];let openTable=null;
 const sourceNodes=scene.nodes.map(n=>({...n,sourcePt:scene.sourcePt}));
 for(let at=0;at<sourceNodes.length;at++){
  const n=sourceNodes[at];let html='';const [x,y,w,h]=n.box;
  if(openTable&&n.tableId!==openTable){parts.push('</div>');openTable=null;}
  if(n.tableCell&&!openTable){openTable=n.tableId;parts.push(`<div data-desc-table="${esc(JSON.stringify({rows:n.tableRows,cols:n.tableCols}))}" style="${box(n.tableBox)}">`);}
  if(n.kind==='shape'){html=shape(n);if(html)paintedShapes.push(html.replace(/desc-gradient-\d+/g,'desc-gradient'));}
  else if(n.kind==='image'){
   const im=n.image,idx=i++;images[idx]=im;
   const g=n.geometry||{};let radius='0';if(g.prstGeom?.prst==='ellipse'||/^ellipse/.test(n.summary||''))radius='50%';else if(/roundRect/.test(g.prstGeom?.prst||n.summary||''))radius='12px';
   const resolved=legacySrc(im.src),packed=/\.json#\d+$/.test(resolved),src=packed?'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7':resolved;
   const photoNote=!im.logo&&w>=120&&h>=72?'<span data-desc-photo-note="1" style="position:absolute;left:3px;bottom:3px;background:rgba(0,0,0,.5);color:#fff;padding:1px 4px;font-size:8px;line-height:1.2">참고 이미지</span>':'';
   html=`<div data-img="${idx}" data-slot="Photo" data-kind="${im.fit==='contain'?'cut':'space'}" data-hint="${esc(im.name)}" style="${box(n.box)}overflow:hidden;border-radius:${radius};background:${im.fit==='contain'&&!im.logo?'#fff':'transparent'}"><img ${packed?`data-fill="${esc(resolved)}"`:''} src="${esc(src)}" alt="${esc(im.name)}" style="width:100%;height:100%;display:block;object-fit:${im.fit}">${photoNote}</div>`;
   mapping.push({sourceId:n.sourceId,img:idx,box:n.box,original:n.originalAsset,replacement:im.src});
   specs.push({kind:'i',box:n.box,radius,fit:im.fit,logo:!!im.logo});
  }else if(n.kind==='text'){
   const idx=t++;texts[idx]=n.text.includes('\n')?{html:esc(n.text).replaceAll('\n','<br>')}:n.text;const st=n.style||{};const g=n.geometry||{};
   let col=color(st.color,'#121417');
   if(!st.color&&st.summary){const match=st.summary.match(/#[\da-f]{6}|\b(?:bg[12]|tx[12]|white|black)\b/i);if(match)col=color(match[0],col);}
   const imageBehind=sourceNodes.slice(0,at).some(p=>p.kind==='image'&&x+w/2>=p.box[0]&&x+w/2<=p.box[0]+p.box[2]&&y+h/2>=p.box[1]&&y+h/2<=p.box[1]+p.box[3]);
   const light=/^#fff(?:fff)?$|rgba\(255,255,255,1\)/i.test(col);
   let behind=background;for(const p of sourceNodes.slice(0,at))if(p.kind==='shape'&&x+w/2>=p.box[0]&&x+w/2<=p.box[0]+p.box[2]&&y+h/2>=p.box[1]&&y+h/2<=p.box[1]+p.box[3]){const pg=Object.keys(p.geometry||{}).length?p.geometry:compactGeometry(p);if(pg.solidFill)behind=color(pg.solidFill,behind);}
   if(light&&!imageBehind&&lightColor(behind))col='#121417';
   const hidden=sourceNodes.slice(at+1).some(p=>p.kind==='image'&&/\.(?:jpg|jpeg)$/i.test(p.originalAsset||'')&&p.box[0]<=x&&p.box[1]<=y&&p.box[0]+p.box[2]>=x+w&&p.box[1]+p.box[3]>=y+h&&p.box[2]*p.box[3]>w*h*3);
   const size=Math.max(4,Math.min(120,st.size||18));
   const align={l:'left',ctr:'center',r:'right',just:'justify'}[st.align]||'left';
   const cell=n.tableCell?'border:1px solid #d6e3fe;padding:3px;background:#fff;':'';
   const markup=esc(n.text).replaceAll('\n','<br>');
   const drawBox=n.tableCell?[x-n.tableBox[0],y-n.tableBox[1],w,h]:n.box;
   const tableAttrs=n.tableCell?` data-desc-row="${n.row}" data-desc-col="${n.col}" data-desc-rowspan="${n.rowspan}" data-desc-colspan="${n.colspan}"`:'';
   const bgShape=n.tableCell?'':shape(n);if(bgShape)paintedShapes.push(bgShape.replace(/desc-gradient-\d+/g,'desc-gradient'));
   html=bgShape+`<div data-tb="${idx}" data-desc-fit="${size}" data-source-id="${esc(n.sourceId)}"${tableAttrs}${hidden?' data-desc-occluded="1"':''} style="${box(drawBox)}font-size:${size}px;font-weight:${st.bold?700:400};line-height:1.12;letter-spacing:0;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;text-align:${align};color:${col};${cell}${hidden?'visibility:hidden;':''}${imageBehind&&light?'text-shadow:0 1px 4px rgba(0,0,0,.45);':''}">${markup}</div>`;
   mapping.push({sourceId:n.sourceId,tb:idx,box:n.box,text:n.text,occluded:hidden,tableCell:!!n.tableCell});
   specs.push({kind:'t',box:n.box,size,bold:!!st.bold,color:col,align,hidden,cell:!!n.tableCell});
  }
  parts.push(html);
 }
 if(openTable)parts.push('</div>');
 // Missing scene-only sheets still get a real editable illustration, not a
 // screenshot of the entire page. Native text remains separate throughout.
 const html=`<div data-description-standard="1" data-design-role="${esc(scene.role)}" data-source-key="${scene.key}" style="${baseCss}background:${background};color:#121417">${parts.join('')}</div>`;
 const form={background,specs,shapes:paintedShapes};
 return {html,texts,images,mapping,form,nT:t,nI:i,pf:Math.min(1,sourceNodes.filter(n=>n.kind==='image').reduce((s,n)=>s+n.box[2]*n.box[3],0)/(1280*720))};
}
const rolePart=scene=>scene.role==='표지'?'cover':scene.role==='브랜드 엔딩'?'closing':/목차|챕터/.test(scene.role)?'cover':/사례|레퍼런스/.test(scene.title)?'case':/솔루션 맵/.test(scene.role)?'bom':/기업 역량/.test(scene.role)?'why':/트렌드|변화|필요성/.test(scene.title)?'market':scene.products.length?'products':'solution';
const metas=[],htmls={},scenarioData={scenarios:[],fills:{},story:{},customers:{},sources},sourceMap=[],forms=new Map(),referencePlans=new Map();
for(const source of sources){
 const pages=scenes.filter(s=>s.key===source.key),fills=[],slides=[];let reused=0;
 const pool=pages.flatMap(p=>p.nodes.filter(n=>n.kind==='image'&&!n.image.generated&&!n.image.logo&&n.image.fit==='cover'&&n.box[2]*n.box[3]>20000).map(n=>n.image));
 const photoPool=[...new Map(pool.map(im=>[im.src,im])).values()];
 const chapterPhotos={};for(let k=0;k<pages.length;k++)if(pages[k].role==='챕터 전환'){const next=pages.slice(k+1).find(p=>p.nodes.some(n=>n.kind==='image'&&!n.image.generated&&!n.image.logo&&n.image.fit==='cover'&&n.box[2]*n.box[3]>20000));chapterPhotos[pages[k].number]=next?.nodes.filter(n=>n.kind==='image'&&!n.image.generated&&!n.image.logo&&n.image.fit==='cover').sort((a,b)=>b.box[2]*b.box[3]-a.box[2]*a.box[3])[0]?.image;}
 const context={name:source.name,productNames,hero:photoPool[0],photos:photoPool,chapterPhotos,sections:pages.filter(p=>p.role==='챕터 전환').map(p=>p.title)};
 for(const scene of pages){
  const raw=compile(scene),signature=hash(raw.form);let f=forms.get(signature),fresh=!f;
  if(fresh){f='L_DSTD_'+signature.slice(0,14).toUpperCase();forms.set(signature,f);referencePlans.set(f,referencePlan(scene,raw));}else reused++;
  const c=composeReference(scene,raw,referencePlans.get(f),context);
  if(fresh){
   htmls[f]=c.html;
   const p=rolePart(scene),title=scene.role==='표지'?'표지 · '+source.name:scene.role==='브랜드 엔딩'?'마무리 · SAMSUNG':scene.title;
   metas.push({f,c:'ST',cv:'ST_DESC',code:'DSTD-'+signature.slice(0,8).toUpperCase(),name:title,when:`${source.name} · ${scene.role} · 정보 구성과 편집 칸을 유지하며 Winmate 스타일로 제안할 때`,g:'표준 제안서 · 설명 기반 재구성',p,p2:null,ind:scene.ind,sol:null,
    pc:c.mapping.filter(x=>x.img!=null&&c.images[x.img]?.fit==='contain'&&!c.images[x.img]?.logo).length,req:[...new Set(['project',...(c.nI?['images']:[]),...(scene.products.length?['products']:[]),...(scene.solutions.length?['solutions']:[])])],prods:scene.products,sols:scene.solutions,
    ph:0,phs:[],hl:scene.title,txt:scene.sourceText.join(' '),eb:source.name,foot:'명세 기반 재구성 · 사진은 등록 자료로 대체',sample:source.name,nT:c.nT,nI:c.nI,ik:c.nI?[...new Set(Object.values(c.images).map(im=>im.fit==='contain'?'cut':'space'))]:[],ih:c.nI?['명세의 이미지 칸 · 등록 사진/제품군 참고 컷']:[],sub:'설명 기반 구성 · Winmate 디자인',pf:Math.round(c.pf*10000)/10000,
    reconstruction:true,design:'reference-3',reference:c.reference,sourceSpec:source.key,sourcePage:scene.number});
  }
  fills.push({f,t:c.texts,img:c.images,notes:scene.sourceText.join('\n'),design:'reference-3'});slides.push({f,role:scene.title});
  sourceMap.push({key:source.key,page:scene.number,title:scene.title,role:scene.role,f,source:scene.source,sourceLine:scene.sourceLine,hidden:scene.hidden,reference:c.reference,mapping:c.mapping,bindings:scene.bindings,sourceText:scene.sourceText});
 }
 const id='bs_std_'+source.key,old=briefs.find(s=>s.sourceSpec===source.key),flow=[];
 let start=0,stage=0;
 const add=(a,b)=>{if(a===b)return;const first=pages[a],type=rolePart(first),key=a===0?'open':b===pages.length?'close':type==='market'?'context':type==='case'||type==='why'?'proof':type==='products'?'space':'build';
   flow.push({key,name:`${String(++stage).padStart(2,'0')} · ${first.title}`,goal:first.role+' · 명세의 순서와 내용 유지',slides:slides.slice(a,b)});};
 for(let n=0;n<pages.length;n++){
  if(n===1||pages[n].role==='챕터 전환'||pages[n].role==='브랜드 엔딩'||(n-start>=6&&pages[n].role!=='챕터 전환')){add(start,n);start=n;}
 }add(start,pages.length);
 const audience=old?.audience||{lead:'사업·운영 책임자',others:['시설 담당자','IT 담당자']};
 const description='제공된 '+source.name+' Markdown의 장 순서와 제품·공간·솔루션 구성을 유지한 표준 제안서입니다. 호텔 AI 스테이와 공유오피스 제안서를 기준으로 핵심 메시지와 공간 사진 중심으로 편집했으며, 원문의 상세 설명·사양·지원 조건은 발표자 노트에 보존합니다. 사진과 누락된 그림은 등록 자료와 설명 기반 도형으로 대체했습니다.';
 const scenario={id,req:'std',std:true,ind:source.ind,strategy:'value',ending:'workshop',minutes:Math.ceil(pages.length/5)*5,title:`${source.name} 표준 제안서`,short:`제품·공간·솔루션을 연결하는 ${source.name} 제안 구성`,
  situation:description,signals:['업종별 제품과 솔루션을 표준 순서로 검토하고 싶습니다','공간별 적용 범위와 연동 조건을 함께 확인하고 싶습니다'],audience,criteria:['공간별 적용 범위','제품·솔루션 구성','설치·운영·연동 조건'],thesis:source.name+'의 표준 흐름으로 제품·공간·솔루션을 검토합니다',
  logic:flow.map(g=>g.name),diff:['업종 명세의 전체 장수와 순서 유지','네이티브 텍스트·표 셀을 편집 가능한 칸으로 구성','원본 부재를 표시하고 등록 자료로 이미지를 대체'],tone:'명세의 문구와 주석 보존 · 설명 기반 재구성 판본',messages:[source.name+' 표준 구성','공간별 제품과 솔루션 연결','설치·연동 조건은 현장 확인'],flow,
  ask:'적용 공간 실사와 제품·솔루션 연동 범위 검토 워크숍 합의',next:['대상 공간과 운영 담당자 확인','모델·설치·네트워크·연동 조건 실사','적용 범위와 후속 일정 합의'],prep:['현장 도면','기존 장비와 제어기 현황','네트워크와 운영·보안 조건'],
  products:[...new Set(pages.flatMap(p=>p.products))],solutions:[...new Set(pages.flatMap(p=>p.solutions))],cases:[...new Set(pages.map(p=>p.caseId).filter(Boolean))],kpis:['적용 범위 확인율','설치·연동 조건 검토 완료율'],
  objections:[['원본 제안서와 완전히 동일한가요?','원본 없이 Markdown의 설명·문구·좌표를 기반으로 재구성한 판본이며 사진과 누락된 세부 도형은 대체했습니다.'],['명세의 모델과 현재 지원 모델이 다른가요?','명세 문구는 해당 판본 그대로 보존하고 실제 공급 모델과 지원 범위는 별도로 확인합니다.']],
  fit:'업종 제품·공간·솔루션을 표준 순서로 검토하는 첫 제안',avoid:'원본 PPTX와 픽셀 단위의 동일 복제가 필요한 경우',sourceSpec:source.key,reconstruction:true,sourceMode:'markdown-description',design:'reference-3',sourceHash:source.sha256};
 scenarioData.scenarios.push(scenario);scenarioData.fills[id]=fills;scenarioData.customers[id]=source.name+' 검토 고객';
 const who=[audience.lead,...audience.others].slice(0,3),weights=who.length===3?[40,35,25]:who.length===2?[60,40]:[100];
 scenarioData.story[id]={keymen:who.map((name,i)=>[name,weights[i],[scenario.criteria[i%3]]]),note:description,parts:Object.fromEntries(flow.map((g,i)=>[g.name,{type:i===0?'cover':g.key==='close'?'closing':rolePart(pages[slides.findIndex(s=>s===g.slides[0])])||'solution',items:g.slides.map(x=>x.role)}]))};
 // A chapter separator is not a cover-only Storyboard part. If a whole chapter
 // inherits type=cover, the repository's reload migration would move its body
 // pages into the hidden cover deck. Use the chapter's actual body types.
 let at=0;for(const g of flow){
  const body=pages.slice(at,at+g.slides.length).map(rolePart).filter(type=>type!=='cover');
  const counts=new Map();for(const type of body)counts.set(type,(counts.get(type)||0)+1);
  const type=body.length?[...counts].sort((a,b)=>b[1]-a[1])[0][0]:g.key==='open'?'cover':'overview';
  scenarioData.story[id].parts[g.name].type=type;at+=g.slides.length;
 }
 console.log(source.key+': '+pages.length+' slides, reused '+reused+' registered structures');
}
// When an identical form is shared by several industries, its metadata is generic.
const industries=new Map();for(const row of sourceMap){const ind=sources.find(s=>s.key===row.key).ind;(industries.get(row.f)||industries.set(row.f,new Set()).get(row.f)).add(ind);}
for(const meta of metas)if(industries.get(meta.f).size>1)meta.ind=null;
const usage=new Map();for(const row of sourceMap)usage.set(row.f,(usage.get(row.f)||0)+1);
for(const meta of metas){meta.deckOnly=usage.get(meta.f)===1;meta.descriptionUses=usage.get(meta.f);}
await fs.mkdir(target,{recursive:true});
await fs.writeFile(path.join(target,'description_standard_scenarios.json'),JSON.stringify(scenarioData)+'\n');
await fs.writeFile(path.join(target,'description_standard_meta.json'),JSON.stringify(metas)+'\n');
const bytes=zlib.gzipSync(Buffer.from(JSON.stringify(htmls)),{level:9});
await fs.writeFile(path.join(root,'app/data/description-standard-html.json.gz'),bytes);
const asset=path.join(root,'app/web/public/assets/description-standards');await fs.mkdir(asset,{recursive:true});await fs.writeFile(path.join(asset,'layouts.json.gz'),bytes);
await fs.writeFile(path.join(out,'source-map.json'),JSON.stringify(sourceMap,null,2));
const summary={sources:sources.length,slides:scenes.length,layoutTypes:metas.length,libraryTemplates:metas.filter(m=>!m.deckOnly).length,deckSpecificSheets:metas.filter(m=>m.deckOnly).length,reusedSlideInstances:scenes.length-metas.length,htmlBytes:Buffer.byteLength(JSON.stringify(htmls)),compressedBytes:bytes.length,sourceMode:'markdown-description',originalAssetsRequired:false,design:'reference-3'};
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
