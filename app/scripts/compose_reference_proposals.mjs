// Editorial compositions based on the existing AI Stay and shared-office decks.
// Source object fragments are evidence, not a finished visual composition.
import {legacySrc} from '../web/src/domain/templates/legacy_img.js';
import {readFileSync} from 'node:fs';
const EDITORIAL_COPY=JSON.parse(readFileSync(new URL('./proposal_editorial_copy.json',import.meta.url),'utf8'));
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const clean=s=>String(s??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
function excerpt(value,max=125){
 const s=clean(value).replace(/[ㅣ|]/g,' · ');if(EDITORIAL_COPY[s])return EDITORIAL_COPY[s];if(s.length<=max)return s;
 const parts=s.match(/[^.!?。]+[.!?。]?/g)||[s];let out='';for(const part of parts){if((out+part).length>max)break;out+=part;}if(out.length>max*.4)return out.trim();
 const end=Math.max(s.lastIndexOf(' ',max),s.lastIndexOf(' · ',max),s.lastIndexOf(',',max));const candidate=s.slice(0,end>max*.6?end:max).replace(/[ ,·]+$/,'')+'…';return EDITORIAL_COPY[candidate]||candidate;
}
const css=(x,y,w,h,more='')=>`position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;${more}`;
const useful=s=>s.length>1&&!/^(?:\d{1,3}|CONFIDENTIAL.*|SAMSUNG|Contents|CONTENTS|KEY MESSAGE|SAMSUNG OFFERING|Device|Solution|Service|고객사 로고|제안사 로고|삭제|IN|OUT)$/i.test(s)&&!/^\*|^※|^□|^https?:/.test(s);

export function referencePlan(scene,c){
 const nodes=scene.nodes.filter(n=>n.kind==='text').map((n,i)=>({...n,i,value:clean(n.text)}));
 const sourceImages=scene.nodes.filter(n=>n.kind==='image').map((n,i)=>({...n,i}));
 const heading=nodes.filter(n=>n.box[1]<130&&n.box[2]>300&&useful(n.value)).sort((a,b)=>(b.style?.size||0)-(a.style?.size||0))[0]||nodes.filter(n=>useful(n.value)).sort((a,b)=>(b.style?.size||0)-(a.style?.size||0))[0];
 const sub=nodes.filter(n=>n.i!==heading?.i&&n.box[1]<240&&n.box[2]>400&&n.value.length>30&&useful(n.value)).sort((a,b)=>a.box[1]-b.box[1])[0];
 const body=nodes.filter(n=>n.i!==heading?.i&&n.i!==sub?.i&&n.box[1]>115&&n.box[1]<665&&useful(n.value)&&!/^\[/.test(n.value));
 const seen=new Set(),photos=[],cuts=[];
 for(const n of [...sourceImages].sort((a,b)=>b.box[2]*b.box[3]-a.box[2]*a.box[3])){
  const im=c.images[n.i];if(!im||im.generated||im.logo||n.box[2]*n.box[3]<3000||seen.has(im.src))continue;seen.add(im.src);(im.fit==='contain'?cuts:photos).push(n.i);
 }
 const distinct=[];for(const n of [...body].filter(n=>n.value.length<=42&&n.box[2]>80&&((n.style?.size||0)>=18||n.value.length<=24)&&!/(?:합니다|드립니다|됩니다|있습니다)[.!]?$/.test(n.value)).sort((a,b)=>(b.style?.size||0)-(a.style?.size||0)||a.box[1]-b.box[1]))if(!distinct.some(v=>v.value===n.value))distinct.push(n);
 const headings=distinct.slice(0,6).sort((a,b)=>a.box[1]-b.box[1]||a.box[0]-b.box[0]);
 const taken=new Set(headings.map(n=>n.i));
 const features=headings.map(n=>{
  const candidates=body.filter(v=>v.i!==n.i&&!taken.has(v.i)&&v.value.length>20&&v.box[1]>=n.box[1]-10).sort((a,b)=>Math.abs(a.box[0]-n.box[0])*.8+Math.abs(a.box[1]-n.box[1])-Math.abs(b.box[0]-n.box[0])*.8-Math.abs(b.box[1]-n.box[1]));
  const detail=candidates[0];if(detail)taken.add(detail.i);return {h:n.i,d:detail?[detail.i]:[]};
 });
 let family=scene.role==='표지'?'cover':scene.role==='브랜드 엔딩'?'closing':scene.role==='챕터 전환'?'divider':/목차/.test(scene.role)?'contents':scene.role==='체험 스튜디오 초대'?'invitation':scene.nodes.some(n=>n.tableCell)?'comparison':/솔루션 맵/.test(scene.role)?'catalog':null;
 if(!family){
  if(/삼성\s*AI 비즈니스/.test(scene.title)&&nodes.some(n=>n.value==='Device'))family='hub';
  else if(/Samsung Business|Why Samsung|기업 역량|전문가|오퍼링|브랜드 가치/i.test(scene.title))family='capability';
  else if(/트렌드|핵심 제안|비즈니스 솔루션|세 가지|3가지/.test(scene.title))family='overview';
  else if(/시나리오|연결|흐름|단계|프로세스/.test(scene.title))family='flow';
  else if(photos.length>=2&&body.length<14)family='gallery';
  else if(photos.length||cuts.length)family='feature';
  else family='overview';
 }
 const numbers=nodes.filter(n=>/^\d{1,2}$/.test(n.value)).sort((a,b)=>(b.style?.size||0)-(a.style?.size||0));
 const sectionName=nodes.filter(n=>n.i!==numbers[0]?.i&&useful(n.value)).sort((a,b)=>(b.style?.size||0)-(a.style?.size||0))[0];
 const hub={};for(const n of nodes)hub[n.value]=n.i;
 return {family,h:heading?.i,s:sub?.i,features,hub,photos:photos.slice(0,3),cuts:cuts.slice(0,6),contents:body.filter(n=>n.value.length<45&&!/^고객 니즈|^핵심 제안$/.test(n.value)).slice(0,6).map(n=>n.i),number:numbers[0]?.i,sectionName:sectionName?.i};
}

export function composeReference(scene,c,plan,context){
 const originalTexts={...c.texts},texts={...c.texts},images={...c.images},usedT=new Set(),usedI=new Set(),mapping=[];
 let nextT=c.nT,nextI=c.nI,fallback=0;const parts=[],blue='#1428a0',ink='#121417',muted='#596170',line='#e2e5ea';
 const patterns=[[/거실|스마트홈|스마트 홈/,/거실|소파|리버파크|주거/],[/침실/,/침실|침대|세대/],[/주방/,/주방|키친|인덕션|냉장고/],[/드레스룸|의류/,/드레스|의류|에어드레서/],[/회의|협업/,/회의실|회의|미팅|협업/],[/공장|생산|물류/,/공장|생산|물류|택배|창고/]];
 const match=patterns.find(([rx])=>rx.test(scene.title));
 if(match&&plan.photos[0]!=null){const idx=plan.photos[0],current=images[idx];if(current&&!match[1].test(current.name||'')){const replacement=context.photos.find(im=>match[1].test(im.name||'')&&!/교실|학원|학교|병실/.test(im.name||''));if(replacement)images[idx]={...replacement,keep:true};}}
 const value=i=>{const v=originalTexts[i];return clean(typeof v==='object'?v?.html:v);};
 const cutProduct=images[plan.cuts[0]]?.products?.[0]||scene.products[0];
 const productName=context.productNames?.[cutProduct]||'';
 let title=excerpt(value(plan.h)||scene.title,54);const subtitle=excerpt(value(plan.s),82);
 if(plan.family==='feature'&&title.length<20&&productName&&/침실|거실|주방|업무 공간|라운지|드레스룸|세탁실|교실|병실|로비/.test(title))title=excerpt(title+' · '+productName,54);
 function text(index,content,x,y,w,h,size=18,more='',max=150){
  const i=index!=null&&!usedT.has(index)?index:nextT++;usedT.add(i);const str=excerpt(content,max);texts[i]=str;
  mapping.push({tb:i,sourceId:index==null?'editorial':c.mapping.find(m=>m.tb===index)?.sourceId,box:[x,y,w,h],text:str});
  return `<div data-tb="${i}" data-desc-fit="${size}" style="${css(x,y,w,h)}font-size:${size}px;line-height:1.45;letter-spacing:-.02em;word-break:keep-all;overflow-wrap:anywhere;color:${ink};${more}">${esc(str)}</div>`;
 }
 const fixed=(content,x,y,w,h,size=12,more='')=>`<div style="${css(x,y,w,h)}font-size:${size}px;line-height:1.4;color:${muted};${more}">${esc(content)}</div>`;
 const panel=(x,y,w,h,bg='#f7f8fa',radius=10)=>`<div data-desc-native-shape="roundRect" style="${css(x,y,w,h)}background:${bg};border:1px solid ${line};border-radius:${radius}px"></div>`;
 function image(index,x,y,w,h,fit){
  let i=index;if(i==null||!images[i]){i=nextI++;images[i]={...(context.chapterPhotos?.[scene.number]||context.photos[fallback++%Math.max(1,context.photos.length)]||context.hero),keep:true};}
  if(usedI.has(i)){const j=nextI++;images[j]={...images[i]};i=j;}usedI.add(i);
  const im=images[i],src=legacySrc(im.src),packed=/\.json#\d+$/.test(src),mode=fit||im.fit||'cover';
  mapping.push({img:i,sourceId:c.mapping.find(m=>m.img===index)?.sourceId||'editorial-photo',box:[x,y,w,h],replacement:im.src});
  return `<div data-img="${i}" data-slot="Photo" data-kind="${mode==='contain'?'cut':'space'}" data-hint="${esc(im.name)}" style="${css(x,y,w,h)}overflow:hidden;border-radius:8px;background:${im.logo?'transparent':'#fff'}"><img ${packed?`data-fill="${esc(src)}"`:''} src="${esc(packed?'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7':src)}" alt="${esc(im.name)}" style="width:100%;height:100%;display:block;object-fit:${mode}"></div>`;
 }
 function head(label=context.name){return fixed(label,64,32,1152,22,12,`color:${blue};font-weight:600`)+text(plan.h,title,64,64,1152,76,32,'font-weight:700',54)+(subtitle?text(plan.s,subtitle,64,147,1152,28,14,`color:${muted}`,82):'');}
 function feature(k){const f=plan.features[k];return {h:f?.h,d:f?.d?.[0],heading:f?value(f.h):'',detail:f?.d?.map(value).join(' · ')||''};}
 function card(k,x,y,w,h,photo=true){
  const f=feature(k),picture=plan.photos[k]??plan.cuts[k];let html='';let top=y;
  if(photo){html+=image(picture,x,y,w,210,picture!=null&&plan.cuts.includes(picture)?'contain':'cover');top+=228;}
  html+=fixed(String(k+1).padStart(2,'0'),x,top,40,24,13,`color:${blue};font-weight:700`);
  html+=text(f.h,f.heading||scene.products[k]||'적용 구성',x+40,top,w-40,66,20,'font-weight:700',32);
  if(f.detail)html+=text(f.d,f.detail,x,top+75,w,112,16,`color:${muted}`,100);
  return html;
 }
 const hero=plan.photos[0]??plan.cuts[0];
 if(plan.family==='cover'){
  parts.push(image(hero,0,0,1280,454,'cover'),`<div style="${css(0,454,1280,4)}background:${blue}"></div>`,fixed('SAMSUNG BUSINESS',64,488,1050,22,12,`color:${blue};font-weight:700;letter-spacing:.07em`),text(plan.h,context.name+' 솔루션 제안서',64,522,1152,72,40,'font-weight:700',70));
  parts.push(text(plan.s,subtitle||'공간에 맞는 제품과 솔루션으로 비즈니스 경험을 넓힙니다.',64,604,1152,44,18,`color:${muted}`,110),fixed('삼성 B2B 제품 · 솔루션',64,665,850,20,12));
 }else if(plan.family==='closing'){
  const logo=Object.entries(images).find(([,im])=>im.logo)?.[0];
  if(logo!=null)parts.push(image(Number(logo),390,294,500,130,'contain'));else parts.push(fixed('SAMSUNG',0,290,1280,140,84,'color:white;font-weight:700;font-family:Arial,sans-serif;text-align:center;letter-spacing:.05em'));
 }else if(plan.family==='divider'){
  parts.push(image(hero,0,0,690,720,'cover'),text(plan.number,value(plan.number)||'01',754,178,420,105,72,`color:${blue};font-weight:600`,8),text(plan.sectionName,value(plan.sectionName)||scene.title,754,310,420,140,38,'font-weight:700',68));
  parts.push(fixed(context.name,754,514,420,50,16));
 }else if(plan.family==='contents'){
  parts.push(fixed('CONTENTS',64,39,1152,22,12,`color:${blue};font-weight:700`),text(plan.h,'제안 구성',64,72,1152,60,32,'font-weight:700',30));
  const items=plan.contents.length?plan.contents:context.sections.map(()=>null).slice(0,6);
  for(let k=0;k<Math.min(6,items.length);k++){const x=64+(k%3)*392,y=174+Math.floor(k/3)*234;const key=items[k];parts.push(image(plan.photos[k%Math.max(1,plan.photos.length)],x,y,368,126,'cover'),fixed(String(k+1).padStart(2,'0'),x,y+144,36,24,14,`color:${blue};font-weight:700`),text(key,value(key)||context.sections[k]||'제품·솔루션 구성',x+40,y+142,328,66,19,'font-weight:600',45));}
 }else if(plan.family==='invitation'){
  parts.push(image(null,64,164,630,440,'cover'),fixed('BUSINESS SOLUTION STUDIO',750,170,466,24,12,`color:${blue};font-weight:700`),text(null,'관심 있는 제품과 솔루션을 직접 경험해 보세요',750,216,466,148,33,'font-weight:700',80),text(null,'실제 공간에서 제품을 살펴보고, 필요한 기능과 연동 범위를 함께 확인합니다.',750,382,466,96,18,`color:${muted}`,130));
  ['관심 제품과 적용 공간 정리','체험할 기능과 솔루션 협의','영업 담당자와 방문 일정 확인'].forEach((v,k)=>parts.push(text(null,v,750,510+k*42,466,32,17,'',70)));
 }else if(plan.family==='comparison'){
  parts.push(head());
  // The five native source tables retain every cell, row span and column span.
  const cells=scene.nodes.filter(n=>n.tableCell),def=cells[0],tableX=650,tableY=224,tableW=566,tableH=384;
  const oldW=def.tableBox[2],oldH=def.tableBox[3];
  parts.push(`<div data-desc-table="${esc(JSON.stringify({rows:def.tableRows,cols:def.tableCols}))}" style="${css(tableX,tableY,tableW,tableH)}">`);
  for(const n of cells){const binding=c.mapping.find(v=>v.sourceId===n.sourceId),i=binding.tb;usedT.add(i);const x=(n.box[0]-def.tableBox[0])/oldW*tableW,y=(n.box[1]-def.tableBox[1])/oldH*tableH,w=n.box[2]/oldW*tableW,h=n.box[3]/oldH*tableH;
   parts.push(`<div data-tb="${i}" data-desc-fit="17" data-desc-row="${n.row}" data-desc-col="${n.col}" data-desc-rowspan="${n.rowspan}" data-desc-colspan="${n.colspan}" style="${css(x,y,w,h)}padding:12px;font-size:17px;line-height:1.4;color:${ink};background:${n.col===0?'#eaeefb':'#fff'};border:1px solid ${line};font-weight:${n.col===0?600:400}">${esc(value(i))}</div>`);mapping.push({...binding,box:[tableX+x,tableY+y,w,h]});}
  parts.push('</div>');
  const quotes=scene.nodes.filter(n=>n.kind==='text'&&/^[“"]/.test(n.text));
  for(let k=0;k<3;k++){const q=quotes[k],i=q?c.mapping.find(v=>v.sourceId===q.sourceId)?.tb:plan.features[k]?.h;parts.push(panel(64,224+k*128,550,118),text(i,q?.text||value(i),86,244+k*128,505,74,18,'',110));}
 }else if(plan.family==='hub'){
  parts.push(head());
  const by=s=>plan.hub[s]??null;
  const left=['Galaxy AI','Samsung AI TV','Bespoke AI','시스템에어컨','사이니지'],right=['SmartThings Pro','Samsung Knox','Samsung VXT','Samsung b.IoT','3rd Party AI Solution'];
  parts.push(panel(64,197,344,366,'#fff'),panel(872,197,344,366,'#fff'),fixed('DEVICE',86,214,300,24,12,`color:${blue};font-weight:700`),fixed('SOLUTION',894,214,300,24,12,`color:${blue};font-weight:700`));
  left.forEach((s,k)=>{const idx=by(s);parts.push(text(idx,idx==null?s:value(idx),140,261+k*57,240,38,17,'font-weight:500',45));if(plan.cuts[k]!=null)parts.push(image(plan.cuts[k],85,258+k*57,44,39,'contain'));});
  right.forEach((s,k)=>{const idx=by(s);parts.push(text(idx,idx==null?s:value(idx),898,261+k*57,292,38,17,'font-weight:500',45));});
  parts.push(`<div data-desc-native-shape="ellipse" style="${css(473,233,334,292)}border:20px solid #eaeefb;border-radius:50%;background:white"></div>`,text(null,'삼성 AI 비즈니스',520,336,240,100,29,'font-weight:700;text-align:center',40));
  parts.push(`<div style="${css(64,592,1152,50)}background:${blue};border-radius:8px"></div>`);
  ['분야별 맞춤형 컨설팅','업종별 특화 오퍼링','B2B 전문 서비스'].forEach((s,k)=>{const idx=by(s);parts.push(text(idx,idx==null?s:value(idx),86+k*376,601,345,32,16,'color:white;text-align:center',50));});
 }else if(plan.family==='catalog'){
  parts.push(head());const picks=plan.cuts.length?plan.cuts:plan.photos;const n=Math.min(6,Math.max(3,picks.length));
   for(let k=0;k<n;k++){const x=64+k%3*392,y=174+Math.floor(k/3)*238,im=picks[k];parts.push(panel(x,y,368,220,'#fff'),image(im,x+20,y+14,328,138,'contain'));const f=feature(k);parts.push(text(f.h,f.heading||images[im]?.name||scene.products[k]||'제품 구성',x+20,y+166,328,45,17,'font-weight:600;text-align:center',30));}
 }else if(plan.family==='capability'){
  parts.push(head());const idx=plan.photos[0]??nextI++;images[idx]={src:'img/fill/ais-a.json#6',name:'삼성전자 수원 디지털시티 사옥 · 삼성전자 공식 참고사진',fit:'cover',keep:true};
  parts.push(image(idx,64,184,450,432,'cover'));
  for(let k=0;k<4;k++){const f=feature(k),x=546+k%2*346,y=184+Math.floor(k/2)*220;parts.push(panel(x,y,324,204,'#fff'),fixed(String(k+1).padStart(2,'0'),x+20,y+17,50,24,13,`color:${blue};font-weight:700`),text(f.h,f.heading||['전문성','제품·솔루션','구축·운영','서비스'][k],x+20,y+54,284,54,21,'font-weight:600',32));if(f.detail)parts.push(text(f.d,f.detail,x+20,y+116,284,72,15,`color:${muted}`,72));}
 }else if(plan.family==='overview'){
  parts.push(head());for(let k=0;k<3;k++)parts.push(card(k,64+k*392,184,368,442,true));
 }else if(plan.family==='flow'){
  parts.push(head());for(let k=0;k<3;k++){const x=64+k*392;parts.push(card(k,x,186,368,436,true));if(k<2)parts.push(fixed('→',x+365,282,40,40,26,`color:${blue};text-align:center`));}
 }else if(plan.family==='gallery'){
  parts.push(head(),image(plan.photos[0],64,184,744,410,'cover'),image(plan.photos[1],832,184,384,250,'cover'));
  const f=feature(0);parts.push(text(f.h,f.heading||title,832,459,384,62,21,'font-weight:600',32));if(f.detail)parts.push(text(f.d,f.detail,832,534,384,84,16,`color:${muted}`,86));
 }else{
  parts.push(head());const main=plan.photos[0]??plan.cuts[0];parts.push(image(main,64,184,660,434,plan.photos.length?'cover':'contain'));
  const f0=feature(0),f1=feature(1),lead=f1.heading?f1:f0,detail=lead.detail||f0.detail;
  parts.push(fixed('KEY MESSAGE',762,184,454,24,11,`color:${blue};font-weight:700`),text(lead.h,lead.heading||title,762,216,454,80,23,'font-weight:600',42));
  if(detail)parts.push(text(lead.d??f0.d,detail,762,298,454,82,16,`color:${muted}`,94));
  else for(let k=0;k<2;k++){const f=feature(k+2);if(f.heading)parts.push(text(f.h,'· '+f.heading,762,298+k*42,454,40,16,`color:${muted}`,40));}
  if(plan.cuts[0]!=null&&plan.cuts[0]!==main){const second=feature(2);parts.push(panel(762,399,454,219,'#fff'),image(plan.cuts[0],778,419,145,156,'contain'),text(null,productName||f0.heading||value(plan.h),943,418,250,72,17,'font-weight:600',32));if(second.heading)parts.push(text(second.h,second.heading,943,500,250,48,16,'font-weight:600',24));if(second.detail)parts.push(text(second.d,second.detail,943,550,250,60,14,`color:${muted}`,32));}
  else {const next=feature(2).heading?feature(2):f0;parts.push(`<div style="${css(762,445,454,1)}background:${line}"></div>`,text(next.h,next.heading||'적용 제품·솔루션',762,466,454,62,21,'font-weight:600',40));if(next.detail)parts.push(text(next.d,next.detail,762,538,454,80,16,`color:${muted}`,92));}
 }
 if(!['cover','closing','divider'].includes(plan.family))parts.push(`<div style="${css(64,664,1152,1)}background:${line}"></div>`,fixed(context.name+' · 삼성 B2B 제품·솔루션',64,680,1050,20,10),fixed(String(scene.number),1120,680,96,20,10,'text-align:right'));
 // Keep legacy slot identities available for stored copies. Omitted fragments
 // are not miniaturized into the presentation: their complete source is notes.
 for(let i=0;i<c.nT;i++)if(!usedT.has(i))parts.push(`<div data-tb="${i}" style="${css(0,0,1,1)}visibility:hidden">${esc(value(i))}</div>`);
 for(let i=0;i<c.nI;i++)if(!usedI.has(i)){const im=images[i],src=legacySrc(im.src),packed=/\.json#\d+$/.test(src);parts.push(`<div data-img="${i}" data-slot="Photo" style="${css(0,0,1,1)}visibility:hidden"><img ${packed?`data-fill="${esc(src)}"`:''} src="${esc(packed?'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7':src)}" alt="${esc(im.name)}"></div>`);}
 parts.push(`<div data-proposal-note="source" style="display:none">${esc(scene.sourceText.join('\n'))}</div>`);
 const html=`<div data-description-standard="1" data-reference-standard="${plan.family}" data-proposal-design="reference-3" data-source-key="${scene.key}" style="width:1280px;height:720px;position:relative;overflow:hidden;background:${plan.family==='closing'?'#000':'#fff'};color:${ink};font-family:Noto Sans KR,sans-serif">${parts.join('')}</div>`;
 return {...c,html,texts,images,mapping:[...c.mapping.filter(m=>!mapping.some(n=>n.tb!=null&&n.tb===m.tb||n.img!=null&&n.img===m.img)),...mapping],nT:nextT,nI:nextI,reference:plan.family,pf:['cover','gallery','divider'].includes(plan.family)?.6:plan.family==='comparison'||plan.family==='hub'?.1:.4};
}
