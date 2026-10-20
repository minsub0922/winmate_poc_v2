import { STYLES } from './geometry.js';
import { contextFurniture } from './furniture-catalog.js';
import { detailSupportError,placeDetailAsset } from './detail-placement.js';
import {roomGridColumns,templateDimensions} from './template-composition.js';
import {populateScenePeople} from './people-layout.js';
import {peopleObjectError,objectBlocksPeople} from './people-placement-geometry.js';
import { NATURAL_LAYOUT_VERSION, CLEARANCE, bindNaturalRelations, orientNaturalRelations, inspectNaturalLayout, reflowNaturalSeating, frontVector, faceRotation, facingTarget } from './natural-layout.js';
export { inspectNaturalLayout, NATURAL_LAYOUT_VERSION } from './natural-layout.js';

export const SCENE_VERSION = 1;
export const round = n => Math.round(n*10000)/10000;
export function fingerprint(value) {
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v==='object'
    ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
  let h=2166136261;
  for (const c of JSON.stringify(canonical(value))) h=Math.imul(h^c.charCodeAt(0),16777619);
  return (h>>>0).toString(16).padStart(8,'0');
}
export function roomKind(name) {
  const rules=[['dining',/홀 테이블|레스토랑|식당/],['kitchen',/주방|키친|냉장|다이닝|식품관/],['fitness',/피트니스|체력|재활|스파/],
    ['bedroom',/객실|침실|기숙사|생활관/],['medical',/병실|호실|간호|진료/],['warehouse',/생산|물류|창고|출하|작업장|검사|클린룸/],
    ['utility',/기계실|열원|설비|실외기|천장|세탁|드레스|케어 존/],['meeting',/회의|협업|미팅|상담실/],
    ['classroom',/강의|교실|모둠|학원|학교|가정 학습/],['study',/스터디|집중실|도서관|전산실|출력/],
    ['theatre',/강당|공연|무대|빅보드|관중석|몰입|체험관|스튜디오/],['office',/업무|본사|운영|관리실|관제|컨트롤|기록실|데스크|행정|영업점 창구/],
    ['outdoor',/외벽|광장|거리|야외|공원|하천|등하교|골프장|탐방로|외부/],['reception',/입구|게이트|카운터|접수|리셉션|매표|로비|현관|개통/],
    ['retail',/매장|쇼룸|VMD|모델하우스|기념품/],['lounge',/홀 테이블|라운지|거실|휴게|대기|대합실|컨코스|카페|식당/]];
  return rules.find(([,re])=>re.test(name))?.[0] || 'lounge';
}

export function inferProducts(text, products) {
  const patterns=[['qm55c',/QM|사이니지|메뉴보드|디스플레이/],['oh55a',/실외용|실외.*사이니지/],['led_outdoor',/실외 LED|빅보드|리본보드/],
    ['led_indoor',/LED|미디어 칼럼/],['thewall',/The Wall|더 월/],['vm55b',/비디오월/],['kiosk',/키오스크/],
    ['flip',/Flip|전자칠판|플립/],['hoteltv',/호텔 TV|호텔TV/],['smartmonitor',/모니터|PC|관리 화면/],['tabs11',/갤럭시 탭|태블릿|탭|단말/],
    ['xcover7',/XCover|러기드|엑스커버/],['galaxyA',/키즈|전용폰|스마트폰/],['book',/노트북|갤럭시 북/],['smarttag',/태그|센서/],
    ['wf1way',/무풍|1Way/],['wf4way',/4Way/],['ac360',/360|시스템에어컨/],['dvms2',/실외기|DVM/],['dvmchiller',/칠러|열원/],
    ['erv',/환기|전열/],['purifier',/공기청정/],['bi_fridge',/냉장|냉동|콜드체인/],['bi_induction',/인덕션|전기레인지/],
    ['bi_dish',/식기세척/],['laundry',/세탁|건조/],['airdresser',/에어드레서/],['harman',/JBL|하만|오디오|스피커/]];
  const ids=patterns.filter(([,re])=>re.test(text)).map(([id])=>id);
  if (/프린터|복합기|출력/.test(text)) { const p=products.find(a=>a.kind==='printer');if(p)ids.push(p.productId); }
  return [...new Set(ids)];
}

// Furniture plans are designed in normalized room coordinates; products keep their real size.
const PLANS = {
  dining:[...[[.26,.3],[.7,.3],[.26,.7],[.7,.7]].flatMap(([x,z])=>[['roundtable',x,z],['chair',x-.1,z,90],['chair',x+.1,z,-90],['chair',x,z-.12,180],['chair',x,z+.12]]),['plant',.88,.12],['plant',.1,.88]],
  meeting:[['rug',.5,.52],['table',.5,.5],['chair',.3,.35,180],['chair',.5,.35,180],['chair',.7,.35,180],['chair',.3,.66],['chair',.5,.66],['chair',.7,.66],['plant',.1,.14],['cabinet',.86,.17]],
  office:[['desk',.27,.3],['desk',.52,.3],['desk',.27,.66,180],['desk',.52,.66,180],['taskchair',.27,.44],['taskchair',.52,.44],['taskchair',.27,.52,180],['taskchair',.52,.52,180],['shelf',.86,.18],['plant',.87,.8]],
  lounge:[['rug',.49,.52],['sofa',.48,.29],['sofa',.24,.55,90],['roundtable',.49,.52],['chair',.75,.58,-90],['plant',.88,.16],['plant',.85,.8],['shelf',.26,.1]],
  kitchen:[['island',.51,.53],['counter',.48,.11],['sink',.14,.36,90],['chair',.35,.77],['chair',.6,.77],['plant',.88,.78]],
  bedroom:[['rug',.45,.57],['bed',.43,.4],['roundtable',.21,.29],['desk',.79,.66,90],['chair',.65,.66,-90],['cabinet',.79,.14],['plant',.12,.8]],
  medical:[['hospitalbed',.25,.34],['hospitalbed',.63,.34],['cabinet',.87,.15],['chair',.22,.76],['chair',.65,.76],['plant',.88,.82]],
  classroom:[['stage',.5,.14],...[[.24,.42],[.5,.42],[.76,.42],[.24,.72],[.5,.72],[.76,.72]].flatMap(([x,z])=>[['desk',x,z],['chair',x,z+.13]]),['shelf',.88,.15]],
  study:[...[[.23,.27],[.55,.27],[.23,.63],[.55,.63]].flatMap(([x,z])=>[['desk',x,z],['taskchair',x,z+.13]]),['shelf',.88,.3,90],['plant',.87,.82]],
  retail:[['shelf',.18,.18],['shelf',.52,.18],['island',.45,.5],['counter',.8,.66,90],['plant',.1,.8],['plant',.88,.15]],
  warehouse:[...[[.2,.25],[.53,.25],[.2,.6],[.53,.6]].map(([x,z])=>['rack',x,z]),['desk',.85,.78,90],['taskchair',.73,.78,-90]],
  utility:[['cabinet',.15,.18],['cabinet',.44,.18],['rack',.78,.5,90],['bench',.25,.68]],
  theatre:[['stage',.5,.18],...[.43,.64,.83].flatMap(z=>[.2,.4,.6,.8].map(x=>['chair',x,z])),['plant',.1,.13]],
  outdoor:[['bench',.22,.3],['bench',.7,.68,180],['plant',.12,.77],['plant',.85,.15],['bollard',.45,.88],['bollard',.6,.88]],
  fitness:[['treadmill',.24,.35],['treadmill',.53,.35],['bench',.45,.8],['cabinet',.84,.18],['plant',.88,.8]],
  reception:[['reception',.52,.29],['taskchair',.52,.14,180],['sofa',.19,.68,90],['roundtable',.42,.69],['plant',.12,.14],['plant',.85,.79]],
};
function seatingPlan(room,capacity){
  if(['office','study','classroom'].includes(room.kind)){
    const fitCols=Math.max(1,Math.floor((room.width-1.8)/1.85)+1),cols=room.layoutReference?Math.min(fitCols,Math.max(1,Math.floor((room.layoutReference.width-1.5)/1.85))):Math.max(1,Math.floor((room.width-1.5)/1.85)),rows=Math.ceil(capacity/cols),span=rows*CLEARANCE.workRowPitch;
    if(span>room.depth-1.1)throw new Error(`${room.name}: ${capacity}석을 배치하기에는 공간이 작아요. 면적을 늘려 주세요.`);
    const out=[],start=room.layoutReference?(room.width-((Math.min(cols,capacity)-1)*1.85+1.5))/2:.9;
    for(let i=0;i<capacity;i++){const x=(start+(i%cols)*1.85+.75)/room.width,z=(.55+Math.floor(i/cols)*CLEARANCE.workRowPitch+.375)/room.depth;
      out.push(['desk',x,z],['taskchair',x,z+.785/room.depth,180]);}
    return [...out,['plant',.91,room.layoutReference?.83:.12],['plant',room.layoutReference?.12:.9,.83]];
  }
  if(room.kind==='meeting'){
    const large=capacity>8,sides=Math.ceil((capacity-2)/2),length=large?4.4:2.8,out=[['rug',.5,.5],[large?'conference':'table',.5,.5],['plant',.12,.15],['cabinet',.86,.16]];
    if(capacity>14)throw new Error('회의 공간은 최대 14석까지 지원해요. 추가 미팅룸을 사용해 주세요.');
    let seats=0;for(let side=0;side<2;side++)for(let i=0;i<sides&&seats<capacity-2;i++,seats++)out.push(['chair',.5+((i-(sides-1)/2)*.65)/room.width,.5+(side?1:-1)*.94/room.depth,side?180:0]);
    if(capacity>=2){out.push(['chair',.5-(length/2+.5)/room.width,.5,270],['chair',.5+(length/2+.5)/room.width,.5,90]);}
    return out;
  }
  return PLANS[room.kind]||PLANS.lounge;
}

function furniturePlan(room,capacity){
  if(capacity)return seatingPlan(room,capacity);
  const w=room.width,d=room.depth,at=(kind,x,z,rotation=0)=>[kind,x/w,z/d,rotation];
  if(room.kind==='lounge'){
    const x=w*.49,z=d*.52;
    return [at('rug',x,z),at('coffeetable',x,z),at('sofa',x+.2,z-1.215),at('sofa',x-1.49,z+.18,270),at('chair',x+1.26,z+.1,90),
      ['plant',.88,.16],['plant',.85,.8],['shelf',.26,.1]];
  }
  if(room.kind==='reception'){
    const x=w*.52,z=d*.29,sx=w*.19,sz=d*.68;
    return [at('reception',x,z),at('taskchair',x,z-.81),at('sofa',sx,sz,270),at('coffeetable',sx+1.46,sz),['plant',.12,.14],['plant',.85,.79]];
  }
  if(room.kind==='dining')return [...[[.26,.3],[.7,.3],[.26,.7],[.7,.7]].flatMap(([nx,nz])=>{
    const x=nx*w,z=nz*d,gap=.425+.26+CLEARANCE.diningGap;
    return [at('roundtable',x,z),at('chair',x-gap,z,270),at('chair',x+gap,z,90),at('chair',x,z-gap),at('chair',x,z+gap,180)];
  }),['plant',.88,.12],['plant',.1,.88]];
  if(room.kind==='kitchen')return [['island',.51,.53],['counter',.48,.11],['sink',.14,.36,270],
    at('stool',w*.51-.6,d*.53+.55+.21+.13,180),at('stool',w*.51+.6,d*.53+.55+.21+.13,180),['plant',.88,.78]];
  if(room.kind==='bedroom')return PLANS.bedroom.map(p=>p[0]==='chair'?at('taskchair',w*.79-.785,d*.66,270):p);
  if(room.kind==='warehouse')return PLANS.warehouse.map(p=>p[0]==='taskchair'?at('taskchair',w*.85-.785,d*.78,270):p);
  if(room.kind==='medical')return [['hospitalbed',.25,.34],['hospitalbed',.63,.34],['cabinet',.87,.15],
    at('chair',w*.25,d*.34+1.075+.26+.18,180),at('chair',w*.63,d*.34+1.075+.26+.18,180),['plant',.88,.82]];
  if(room.kind==='classroom'){
    const last=room.layoutReference?Math.min(d*.72,d-2.245):d*.72,first=room.layoutReference?last-CLEARANCE.workRowPitch:d*.42;
    return [['stage',.5,.14],...[first,last].flatMap(z=>[.24,.5,.76].flatMap(x=>[
      at('desk',x*w,z),at('chair',x*w,z+.755,180)])),['shelf',.88,.15]];
  }
  if(room.kind==='theatre')return PLANS.theatre.map(p=>p[0]==='chair'?[...p.slice(0,3),180]:p);
  return PLANS[room.kind]||PLANS.lounge;
}
const aabb = (o,assets) => {
  const a=assets[o.assetId]; if(!a)return null;
  const t=(o.rotation||0)*Math.PI/180, [w,h,d]=a.size;
  const ew=Math.abs(w*Math.cos(t))+Math.abs(d*Math.sin(t)),ed=Math.abs(d*Math.cos(t))+Math.abs(w*Math.sin(t));
  return {x:o.x-ew/2,z:o.z-ed/2,w:ew,d:ed,y:o.elevation||0,h};
};
const intersects = (a,b,pad=.06,tolerance=.02) => a.x < b.x+b.w+pad && a.x+a.w+pad>b.x && a.z<b.z+b.d+pad && a.z+a.d+pad>b.z
  && a.y < b.y+b.h-tolerance && a.y+a.h > b.y+tolerance;
export const objectBounds = aabb;
const canPlace = (o,room,objects,assets,preserveAisle=true) => {
  const b=aabb(o,assets); if(!b)return false;
  if(b.x<room.x+.12||b.z<room.z+.12||b.x+b.w>room.x+room.width-.12||b.z+b.d>room.z+room.depth-.12)return false;
  // Door clear zone is always empty, including its swing.
  if (b.y<2 && b.z+b.d>room.z+room.depth-1.15 && b.x<room.x+room.width/2+.66 && b.x+b.w>room.x+room.width/2-.66) return false;
  if(objects.some(other=>{
    if(other.id===o.id||other.id===o.supportId||other.roomId!==room.id||assets[other.assetId]?.kind==='rug')return false;
    const small=assets[o.assetId]?.placement?.mode==='surface'||assets[other.assetId]?.placement?.mode==='surface';
    return intersects(b,aabb(other,assets),small?.012:.06,small?.001:.02);
  }))return false;
  if(assets[o.assetId]?.kind!=='rug'&&(peopleObjectError(o,room,objects,assets)||objectBlocksPeople(o,objects,assets)))return false;
  // Preserve the chair's pull-out/approach aisle when adding cabinets, plants or products.
  if(preserveAisle&&b.y<.95&&assets[o.assetId]?.kind!=='rug')for(const chair of objects){
    if(chair.id===o.id||chair.roomId!==room.id||chair.elevation>.05)continue;
    const kind=assets[chair.assetId]?.kind;if(kind!=='taskchair'&&!(kind==='chair'&&room.kind==='classroom'))continue;
    const cb=aabb(chair,assets),front=frontVector(chair,assets[chair.assetId]),back={x:-front.x,z:-front.z},length=CLEARANCE.chairBack;
    const zone=Math.abs(back.x)>.5?{x:back.x>0?cb.x+cb.w:cb.x-length,z:cb.z+.05,w:length,d:cb.d-.1,y:0,h:.9}
      :{x:cb.x+.05,z:back.z>0?cb.z+cb.d:cb.z-length,w:cb.w-.1,d:length,y:0,h:.9};
    if(intersects(b,zone,0))return false;
  }
  return true;
};
function naturalPlacement(scene,assets){
  bindNaturalRelations(scene,assets);
  orientNaturalRelations(scene,assets,o=>canPlace(o,scene.rooms.find(r=>r.id===o.roomId),scene.objects.filter(x=>x.supportId!==o.id),assets));
}

export function createScene(config, library) {
  const templates=library.templates, assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
  const template=templates.find(t=>t.id===config.templateId) || templates.find(t=>t.industry===config.industry&&t.scope===(config.scope||'full'));
  if(!template)throw new Error('선택한 업종·공간 템플릿을 찾지 못했습니다.');
  const scale={compact:.85,standard:1,spacious:1.25}[config.variant||template.variant||'standard'];
  let specs=template.rooms;
  if(config.roomKeys?.length) { specs=specs.filter(r=>config.roomKeys.includes(r.key)||r.includedSpaces?.some(s=>config.roomKeys.includes(s.key))); if(!specs.length)throw new Error('선택한 공간이 템플릿에 없습니다.'); }
  const cols=template.compositionVersion?roomGridColumns(specs.length):specs.length===1?1:Math.min(3,specs.length),rows=Math.ceil(specs.length/cols),gap=1.8;
  const baseSize=template.compositionVersion&&!template.custom&&config.roomKeys?.length?templateDimensions(specs.length):template;
  const width=Number(config.width ?? baseSize.width ?? (cols*9))*scale,depth=Number(config.depth ?? baseSize.depth ?? (rows*7.6+(rows-1)*gap))*scale;
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<4||depth<4||width>150||depth>150)throw new Error('가로·세로는 4~150m로 입력해 주세요.');
  const cellWidth=(width-(cols-1)*.22)/cols,cellDepth=(depth-(rows-1)*gap)/rows;
  if(!template.custom&&(cellWidth<4||cellDepth<4))throw new Error('선택한 공간 수에 비해 면적이 작습니다. 공간당 가로·세로 4m 이상이 필요해요.');
  const scene={version:SCENE_VERSION,engine:'winmate-spatial-1',assetVersion:library.version,assetRevision:library.sourceHash||null,title:String(config.title||template.name).slice(0,150),
    industry:template.industry,templateId:template.id,style:STYLES[config.style]?config.style:template.style||'warm',width:round(width),depth:round(depth),
    height:3.1,scope:specs.length===1?'single':'full',rooms:[],objects:[],source:template.source||null,
    provenance:{kind:config.provenance?.kind||'template',...config.provenance},notes:['개념 배치 · 실측 도면 아님','치수가 없는 제품은 카탈로그 유형에 따른 추정 형상'],camera:{azimuth:40,elevation:48,zoom:1},revision:1};
  for (const [index,spec] of specs.entries()) {
    const setting=config.roomSettings?.find(s=>s.roomId===spec.key);
    const rw=template.custom?spec.geometry.width*scale:cellWidth,rd=template.custom?spec.geometry.depth*scale:cellDepth;
    const room={id:spec.key,name:spec.name,kind:spec.kind||roomKind(spec.name),purpose:spec.purpose||'',
      x:round(template.custom?spec.geometry.x*scale:(index%cols)*(cellWidth+.22)),z:round(template.custom?spec.geometry.z*scale:Math.floor(index/cols)*(cellDepth+gap)),width:round(rw),depth:round(rd),height:3.1,
      ...(template.roomReference&&!template.custom&&config.width==null&&config.depth==null?{layoutReference:{width:template.roomReference.referenceWidth*scale,depth:template.roomReference.referenceDepth*scale}}:{}),...(spec.includedSpaces?{includedSpaces:structuredClone(spec.includedSpaces)}:{}),
      floor:spec.floor||'1F',outdoor:spec.kind==='outdoor',sourceNumber:spec.sourceNumber||String(index+1)};
    const explicit=setting?.capacity??spec.capacity;
    const capacity=explicit??(['office','study'].includes(room.kind)?Math.min(12,Math.max(4,Math.floor((room.layoutReference?room.layoutReference.width*room.layoutReference.depth:rw*rd)/11))):room.kind==='meeting'?8:0);
    if(!Number.isInteger(capacity)||capacity<0||capacity>60)throw new Error('좌석 수는 공간별 1~60석으로 입력해 주세요.');
    room.capacity=capacity;
    scene.rooms.push(room);
    const plan=furniturePlan(room,capacity);
    for(const [i,[kind,x,z,rotation=0]] of plan.entries()) {
      const o={id:`${room.id}-f${i}`,assetId:`furniture:${kind}`,roomId:room.id,x:round(room.x+rw*x),z:round(room.z+rd*z),elevation:0,rotation};
      const preferred=contextFurniture(kind,room,scene.industry,assets);
      if(preferred!==o.assetId&&canPlace({...o,assetId:preferred},room,scene.objects,assets))o.assetId=preferred;
      // Rugs may sit under objects. Other furniture always obeys doors/bounds/collisions.
      if(kind==='rug'||canPlace(o,room,scene.objects,assets))scene.objects.push(o);
    }
    if(explicit&&['office','study','classroom','meeting'].includes(room.kind)){
      const seats=scene.objects.filter(o=>o.roomId===room.id&&['chair','taskchair'].includes(assets[o.assetId].kind)).length;
      if(seats<capacity)throw new Error(`${room.name}: 출입 동선 때문에 ${seats}석만 들어가요. 면적을 늘려 주세요.`);
    }
    naturalPlacement(scene,assets);
    const ids=[...new Set(spec.productIds||[])];
    for(const [i,pid] of ids.entries()) {
      const asset=assets['product:'+pid];if(!asset?.physical)continue;
      placeProduct(scene,room,asset,assets,i);
    }
  }
  for(const p of [...(config.placements||[]),...(config.furniture||[])]) {
    const asset=assets['product:'+p.productId]||assets[p.assetId],room=scene.rooms.find(r=>r.id===p.roomId);
    if(!asset?.physical||!room)throw new Error('제품 또는 공간 참조가 올바르지 않습니다.');
    const existing=scene.objects.filter(o=>o.roomId===room.id&&o.assetId===asset.id).length;
    const quantity=p.quantity??1;
    if(!Number.isInteger(quantity)||quantity<1||quantity>30)throw new Error('제품 수량은 1~30개여야 합니다.');
    if(p.placementMode!=='auto'&&p.x!=null&&p.z!=null){
      if(quantity!==1)throw new Error('정확한 좌표를 지정할 때는 제품별 수량을 1개로 나눠 입력해 주세요.');
      const old=scene.objects.find(o=>o.assetId===asset.id&&o.roomId===room.id);
      if(old)scene.objects=scene.objects.filter(o=>o.id!==old.id);
      const o={id:old?.id||`user-${scene.objects.length}`,roomId:room.id,assetId:asset.id,x:round(room.x+Number(p.x)),z:round(room.z+Number(p.z)),elevation:Number(p.elevation||0),rotation:Number(p.rotation||0),mount:'specified'};
      if(!canPlace(o,room,scene.objects,assets))throw new Error(`${asset.name}: 가구·제품 또는 출입문과 겹칩니다.`);
      scene.objects.push(o);
    }else for(let i=existing;i<quantity;i++)placeProduct(scene,room,{...asset,productId:asset.productId||asset.kind},assets,scene.objects.length);
  }
  naturalPlacement(scene,assets);
  if(config.populatePeople!==false)populateScenePeople(scene,library);
  scene.layoutPolicy={version:NATURAL_LAYOUT_VERSION,frontAxis:'+Z',workRowPitch:CLEARANCE.workRowPitch,chairBackClearance:CLEARANCE.chairBack};
  scene.contentHash=sceneHash(scene);
  const errors=validateScene(scene,library).errors;if(errors.length)throw new Error(errors[0]);
  return scene;
}

function placeProduct(scene,room,asset,assets,index) {
  const [w,h,d]=asset.size;
  while(scene.objects.some(o=>o.id===`${room.id}-p${index}-${asset.productId}`||o.id===`${room.id}-p${index}-${asset.productId}-stand`))index++;
  const base={id:`${room.id}-p${index}-${asset.productId}`,assetId:asset.id,roomId:room.id,rotation:0,elevation:0};
  const candidates=[];
  const ceiling=['cassette','cassette360','light'].includes(asset.kind);
  const wall=!asset.placementSurface&&['display','tablet','wallac','sensor'].includes(asset.kind)&&(asset.kind!=='tablet'||w>.7);
  if(ceiling) {
    for(const fx of [.5,.24,.76])for(const fz of [.45,.7,.2])candidates.push({...base,x:room.x+room.width*fx,z:room.z+room.depth*fz,elevation:room.height-h-.12,mount:'ceiling'});
  }else if(wall){
    for(const f of [.5,.23,.76])candidates.push({...base,x:room.x+room.width*f,z:room.z+d/2+.14,elevation:Math.min(1.2,room.height-h-.15),mount:'wall'});
  }else if(asset.placementSurface==='surface'||asset.placementSurface!=='floor'&&['tablet','phone','laptop','monitor','sensor','induction','kiosk'].includes(asset.kind)){
    for(const support of scene.objects.filter(o=>o.roomId===room.id&&['desk','counter','table','conference','island','reception','bench','cabinet','stage'].includes(assets[o.assetId]?.kind))){
      const s=assets[support.assetId],worker=scene.objects.find(o=>o.facing?.targetId===support.id&&o.facing.activity==='work');
      const rotation=worker?faceRotation(support,worker,asset):support.rotation||0,direction=frontVector({rotation},asset);
      if(w<s.size[0]&&d<s.size[2]){
        const offset=asset.kind==='monitor'?-Math.min(.19,(s.size[2]-d)/2-.025):asset.kind==='laptop'?Math.min(.16,(s.size[2]-d)/2-.025):0;
        candidates.push({...base,x:support.x+direction.x*offset,z:support.z+direction.z*offset,rotation,elevation:(support.elevation||0)+s.size[1]+.025,supportId:support.id,mount:'surface'});
      }
    }
  }
  // Deterministic floor search keeps Samsung products clear of furniture and door swings.
  for(const fz of [.16,.4,.65,.82])for(const fx of [.85,.12,.63,.37,.5])candidates.push({...base,x:room.x+room.width*fx,z:room.z+room.depth*fz,mount:'floor'});
  let chosen=candidates.find(o=>(!ceiling||o.mount==='ceiling')&&canPlace(o,room,scene.objects,assets));
  if(!chosen&&!ceiling){
    // A smaller room can still have a valid edge position between the coarse
    // anchor points. Search with the product's real envelope and aisle checks.
    const left=room.x+w/2+.125,right=room.x+room.width-w/2-.125,front=room.z+d/2+.125,back=room.z+room.depth-d/2-.125;
    for(let z=back;z>=front&&!chosen;z-=.4)for(let x=left;x<=right&&!chosen;x+=.4){
      const candidate={...base,x:round(x),z:round(z),mount:'floor'};
      if(canPlace(candidate,room,scene.objects,assets)){chosen=candidate;candidates.push(candidate);}
    }
  }
  if(chosen?.mount==='floor'&&asset.placementSurface!=='floor'&&(asset.placementSurface==='surface'||['tablet','phone','laptop','monitor','induction','kiosk'].includes(asset.kind))){
    const supportAsset=assets[w>.7&&asset.kind==='tablet'?'furniture:displaystand':'furniture:coffeetable'];
    const pair=candidates.filter(o=>o.mount==='floor').map(c=>{
      const support={id:base.id+'-stand',assetId:supportAsset.id,roomId:room.id,x:c.x,z:c.z,elevation:0,rotation:0};
      const child={...c,elevation:supportAsset.size[1]+.025,supportId:support.id,mount:'surface'};
      return {support,child};
    }).find(({support,child})=>child.elevation+h<=room.height-.1&&canPlace(support,room,scene.objects,assets)&&canPlace(child,room,scene.objects,assets));
    if(!pair)throw new Error(`${room.name}: ${asset.name}의 거치 가구를 놓을 공간이 부족해요. 면적을 늘려 주세요.`);
    scene.objects.push(pair.support);chosen=pair.child;
  }
  if(!chosen)throw new Error(`${room.name}: ${asset.name}을 놓을 여유 공간이 부족해요. 면적을 늘려 주세요.`);
  chosen.x=round(chosen.x);chosen.z=round(chosen.z);chosen.elevation=round(chosen.elevation);scene.objects.push(chosen);
}

export function sceneHash(scene) { const {contentHash,revision,...data}=scene;return fingerprint(data); }
export function validateScene(scene,library) {
  const errors=[],warnings=[],assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),ids=new Set();
  if(scene?.version!==SCENE_VERSION)return {errors:['지원하지 않는 장면 버전입니다.'],warnings};
  if(!Array.isArray(scene.rooms)||!scene.rooms.length||scene.rooms.length>30||!Array.isArray(scene.objects)||scene.objects.length>2000)return {errors:['공간·오브젝트 수가 올바르지 않습니다.'],warnings};
  if(!Number.isFinite(scene.width)||!Number.isFinite(scene.depth)||scene.width<4||scene.depth<4||scene.width>150||scene.depth>150)errors.push('전체 공간 치수가 올바르지 않습니다.');
  if(!STYLES[scene.style])errors.push('스타일이 올바르지 않습니다.');
  if(typeof scene.title!=='string'||!scene.title.trim()||scene.title.length>150)errors.push('제목은 1~150자로 입력해 주세요.');
  if(scene.camera?.position&&(!Array.isArray(scene.camera.position)||scene.camera.position.length!==3||!scene.camera.position.every(Number.isFinite)))errors.push('카메라 좌표가 올바르지 않습니다.');
  if(scene.camera?.target&&(!Array.isArray(scene.camera.target)||scene.camera.target.length!==3||!scene.camera.target.every(Number.isFinite)))errors.push('카메라 기준점이 올바르지 않습니다.');
  for(const room of scene.rooms){
    if(!room||typeof room.id!=='string'||typeof room.name!=='string'||room.name.length>150){errors.push('공간 이름·ID가 올바르지 않습니다.');continue;}
    if(ids.has(room.id))errors.push('공간 ID가 중복되었습니다.');ids.add(room.id);
    if(![room.x,room.z,room.width,room.depth,room.height].every(Number.isFinite)||room.width<2||room.depth<2||room.height<2||room.height>20||room.x<0||room.z<0||room.x+room.width>scene.width+.01||room.z+room.depth>scene.depth+.01)errors.push(`${room.name}: 공간이 전체 맵 경계를 벗어납니다.`);
  }
  let estimated=0;
  for(const o of scene.objects){
    if(!o||typeof o.id!=='string'||typeof o.assetId!=='string'){errors.push('오브젝트 ID가 올바르지 않습니다.');continue;}
    if(ids.has(o.id))errors.push('오브젝트 ID가 중복되었습니다.');ids.add(o.id);
    const a=assets[o.assetId],r=scene.rooms.find(r=>r.id===o.roomId);
    if(!a||!r){errors.push('등록되지 않은 오브젝트·공간 참조입니다.');continue;}
    if(!a.physical)errors.push('논리 서비스는 물리 오브젝트로 배치할 수 없습니다.');
    if(![o.x,o.z,o.rotation,o.elevation].every(Number.isFinite)||o.elevation<0||o.elevation+a.size[1]>r.height+.01){errors.push(`${a.name}: 위치·높이가 올바르지 않습니다.`);continue;}
    const b=aabb(o,assets);
    if(b.x<r.x-.01||b.z<r.z-.01||b.x+b.w>r.x+r.width+.01||b.z+b.d>r.z+r.depth+.01)errors.push(`${a.name}: 공간 경계를 벗어납니다.`);
    if(o.supportId&&!scene.objects.some(s=>s.id===o.supportId&&s.roomId===r.id))errors.push('받침 가구를 찾지 못했습니다.');
    const supportError=detailSupportError(o,scene,assets);if(supportError)errors.push(supportError);
    if(a.productId&&a.dimensionSource!=='catalog-spec')estimated++;
    if(a.kind!=='rug'&&!canPlace(o,r,scene.objects.filter(x=>x.supportId!==o.id),assets,false))errors.push(`${a.name}: 가구·제품 또는 출입문과 겹칩니다.`);
  }
  if(estimated)warnings.push(`추정 치수 제품 ${estimated}개 · 상세에서 근거를 확인하세요`);
  return {errors:[...new Set(errors)],warnings};
}

export function moveObject(scene,id,patch,library) {
  const next=structuredClone(scene),object=next.objects.find(o=>o.id===id);if(!object)throw new Error('오브젝트를 찾지 못했습니다.');
  const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));bindNaturalRelations(next,assets);
  const old={...object};Object.assign(object,patch);
  const carried=new Set([id]),queue=[id];
  while(queue.length){const parent=queue.shift();for(const child of next.objects)if(!carried.has(child.id)&&(child.supportId===parent||child.facing?.moveWithTarget&&child.facing.targetId===parent)){
    carried.add(child.id);queue.push(child.id);
  }}
  for(const child of next.objects.filter(o=>o.id!==id&&carried.has(o.id))){
    const angle=(object.rotation-old.rotation)*Math.PI/180,x=child.x-old.x,z=child.z-old.z;
    child.x=round(object.x+x*Math.cos(angle)-z*Math.sin(angle));child.z=round(object.z+x*Math.sin(angle)+z*Math.cos(angle));child.rotation+=object.rotation-old.rotation;child.elevation=round(child.elevation+object.elevation-old.elevation);
  }
  if(object.facing?.automatic&&(!Object.hasOwn(patch,'rotation')||patch.rotation===old.rotation)){
    const target=facingTarget(object,next);if(target)object.rotation=faceRotation(object,target,assets[object.assetId]);
  }
  for(const screen of next.objects.filter(o=>o.facing?.activity==='screen'&&carried.has(o.facing.targetId)&&!carried.has(o.id))){
    const target=facingTarget(screen,next),candidate={...screen,rotation:faceRotation(screen,target,assets[screen.assetId])};
    if(canPlace(candidate,next.rooms.find(r=>r.id===screen.roomId),next.objects,assets,false))screen.rotation=candidate.rotation;
  }
  const check=validateScene(next,library);if(check.errors.length)throw new Error(check.errors[0]);
  next.revision++;next.contentHash=sceneHash(next);return next;
}

export function addProduct(scene,productId,roomId,library) {
  const next=structuredClone(scene),assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),room=next.rooms.find(r=>r.id===roomId),asset=assets['product:'+productId];
  if(!room||!asset?.physical)throw new Error('배치할 물리 제품과 공간을 선택해 주세요.');
  placeProduct(next,room,asset,assets,next.objects.length);naturalPlacement(next,assets);next.revision++;next.contentHash=sceneHash(next);return next;
}

export function addAsset(scene,assetId,roomId,library,options={}) {
  const next=structuredClone(scene),assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),room=next.rooms.find(r=>r.id===roomId),asset=assets[assetId];
  if(!room||!asset?.physical)throw new Error('배치할 물리 오브젝트와 공간을 선택해 주세요.');
  if(asset.placement)placeDetailAsset(next,room,asset,assets,next.objects.length,canPlace,options);
  else placeProduct(next,room,{...asset,productId:asset.productId||asset.kind},assets,next.objects.length);
  naturalPlacement(next,assets);
  const errors=validateScene(next,library).errors;if(errors.length)throw new Error(errors[0]);next.revision++;next.contentHash=sceneHash(next);return next;
}
export function repairNaturalLayout(scene,library,{reflow=true}={}){
  const next=structuredClone(scene),assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),before=inspectNaturalLayout(scene,library);
  const fits=(o,aisle=false)=>canPlace(o,next.rooms.find(r=>r.id===o.roomId),next.objects.filter(x=>x.supportId!==o.id),assets,aisle);
  bindNaturalRelations(next,assets);orientNaturalRelations(next,assets,o=>fits(o));
  if(reflow){
    // Upgrade old tightly packed workstation rows as complete desk/chair/screen groups.
    for(const room of next.rooms.filter(r=>['office','study'].includes(r.kind))){
      if(!inspectNaturalLayout(next,library).issues.some(i=>i.roomId===room.id&&i.code==='chair-back-blocked'))continue;
      const candidate=structuredClone(next),desks=candidate.objects.filter(o=>o.roomId===room.id&&assets[o.assetId]?.kind==='desk').sort((a,b)=>a.z-b.z||a.x-b.x);
      const cols=Math.max(1,Math.floor((room.width-1.5)/1.85));if(Math.ceil(desks.length/cols)*CLEARANCE.workRowPitch>room.depth-1.1)continue;
      for(const [index,desk] of desks.entries()){
        const dx=round(room.x+1.65+(index%cols)*1.85-desk.x),dz=round(room.z+.925+Math.floor(index/cols)*CLEARANCE.workRowPitch-desk.z);
        const group=new Set([desk.id]),queue=[desk.id];
        while(queue.length){const id=queue.shift();for(const o of candidate.objects)if(!group.has(o.id)&&(o.supportId===id||o.facing?.moveWithTarget&&o.facing.targetId===id)){group.add(o.id);queue.push(o.id);}}
        for(const o of candidate.objects.filter(o=>group.has(o.id))){o.x=round(o.x+dx);o.z=round(o.z+dz);}
      }
      if(!validateScene(candidate,library).errors.length)next.objects=candidate.objects;
    }
    for(const table of next.objects){
      if(assets[table.assetId]?.kind!=='roundtable'||!next.objects.some(o=>o.facing?.targetId===table.id&&assets[o.assetId]?.kind==='sofa'))continue;
      const candidate={...table,assetId:'furniture:coffeetable'};if(!assets[candidate.assetId]||!fits(candidate))continue;
      const delta=assets[candidate.assetId].size[1]-assets[table.assetId].size[1];table.assetId=candidate.assetId;
      for(const child of next.objects.filter(o=>o.supportId===table.id))child.elevation=round(child.elevation+delta);
    }
    reflowNaturalSeating(next,assets,o=>fits(o,true));orientNaturalRelations(next,assets,o=>fits(o));
  }
  next.layoutPolicy={version:NATURAL_LAYOUT_VERSION,frontAxis:'+Z',workRowPitch:CLEARANCE.workRowPitch,chairBackClearance:CLEARANCE.chairBack};
  const errors=validateScene(next,library).errors;if(errors.length)throw new Error(errors[0]);
  const changed=next.objects.filter(o=>{const old=scene.objects.find(x=>x.id===o.id);return old&&(o.assetId!==old.assetId||o.x!==old.x||o.z!==old.z||o.elevation!==old.elevation||o.rotation!==old.rotation);}).map(o=>o.id);
  next.revision++;next.contentHash=sceneHash(next);
  return {scene:next,report:{changed,corrected:changed.length,before,after:inspectNaturalLayout(next,library)}};
}
export function focusScene(scene,roomId) {
  const room=scene.rooms.find(r=>r.id===roomId);if(!room)return scene;
  const next={...structuredClone(scene),title:scene.title+' · '+room.name,width:room.width,depth:room.depth,scope:'single',rooms:[{...room,x:0,z:0}],
    objects:scene.objects.filter(o=>o.roomId===room.id).map(o=>({...o,x:round(o.x-room.x),z:round(o.z-room.z),...(o.facing?.point?{facing:{...o.facing,point:{x:round(o.facing.point.x-room.x),z:round(o.facing.point.z-room.z)}}}:{})})),camera:{azimuth:40,elevation:48,zoom:1}};
  next.contentHash=sceneHash(next);return next;
}

export function planAnchors(scene,viewport={x:0,y:0,w:1280,h:820}) {
  const pad=48,k=Math.min((viewport.w-pad*2)/scene.width,(viewport.h-pad*2)/scene.depth);
  const ox=viewport.x+(viewport.w-scene.width*k)/2,oy=viewport.y+(viewport.h-scene.depth*k)/2;
  return {scale:k,origin:[ox,oy],rooms:Object.fromEntries(scene.rooms.map(r=>[r.id,{x:ox+(r.x+r.width/2)*k,y:oy+(r.z+r.depth/2)*k}])),
    objects:Object.fromEntries(scene.objects.map(o=>[o.id,{x:ox+o.x*k,y:oy+o.z*k}]))};
}
