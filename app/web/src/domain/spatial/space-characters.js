// Space character (2026-11-16, layout composition 5).
// A purpose profile (reception, dining, theatre …) fixes the products of a space; many different spaces
// share one profile, so a café counter, a hotel front desk and a hospital admissions desk used to look
// alike. A character reads the space name and industry and gives each of them its own furniture plan,
// extra furnishings, props and people. Rooms older than composition 5 keep their layout.
import {detailSurfaceHeight,detailSupportError} from './detail-placement.js';
export const SPACE_CHARACTER_VERSION=5;

// [character, industries|null, kinds|null, profiles|null, name pattern] — first match wins.
const RULES=[
 // outdoor
 ['cafe-terrace','FB',['outdoor'],null,/./],
 ['bus-stop',null,['outdoor'],null,/정류장|스트리트 퍼니처/],
 ['gate-plaza',null,['outdoor','reception'],null,/게이트|매표소/],
 ['stadium-board','VN',['outdoor'],null,/빅보드|전광판|리본보드/],
 ['logistics-yard',null,['outdoor'],null,/물류 야드|배송 차량/],
 ['work-yard',null,['outdoor'],['field'],/./],
 ['park',null,['outdoor'],null,/공원|탐방로/],
 ['sports-field',null,['outdoor'],null,/경기장|골프장/],
 ['school-route',null,['outdoor'],null,/등하교/],
 ['plaza',null,['outdoor'],null,/./],
 // reception · self service
 ['self-checkout','RT',['reception'],null,/셀프계산|계산대/],
 ['atm-zone','FN',['reception'],['selfservice'],/./],
 ['kiosk-zone',null,['reception'],['selfservice'],/./],
 ['home-entry',null,['reception'],['entry'],/./],
 ['cafe-counter','FB',['reception'],null,/./],
 ['hotel-front','HT',['reception'],null,/./],
 ['hospital-front','MD',['reception'],null,/./],
 ['civil-service','PB',['reception'],null,/민원/],
 ['bank-hall','FN',['reception'],null,/./],
 ['ticket-lobby',null,['reception'],null,/매표|발권/],
 ['concession','VN',['reception'],null,/매점|컨코스|콘코스/],
 ['info-desk',null,['reception'],null,/안내|길찾기|도슨트|정문/],
 ['store-counter','RT',['reception'],null,/./],
 ['telco-counter','OE',['reception'],null,/./],
 ['salon-front','SV',['reception'],null,/리셉션/],
 ['golf-front','SV',['reception'],null,/카운터/],
 ['gym-front','SF',['reception'],null,/./],
 ['academy-front','ED',['reception'],null,/./],
 ['office-lobby',null,['reception'],null,/./],
 // dining
 ['pantry',null,['dining','lounge'],null,/탕비|팬트리/],
 ['pub-bar',null,['dining'],null,/펍|바$|· ?바|·바/],
 ['food-court',null,['dining'],null,/푸드코트/],
 ['breakfast-buffet',null,['dining'],null,/조식/],
 ['private-dining',null,['dining'],null,/프라이빗/],
 ['fellowship','RG',['dining'],null,/./],
 ['care-dining','MD',['dining'],null,/프로그램|거실|휴게/],
 ['care-dining','RS',['dining'],null,/./],
 ['canteen',null,['dining'],null,/구내식당|학생식당|급식|직원 식당|공용 식당/],
 ['restaurant','HT',['dining'],null,/./],
 ['restaurant','FB',['dining'],null,/^홀$|프라이빗|레스토랑/],
 ['cafe-hall',null,['dining'],null,/./],
 // theatre · immersive
 ['banquet',null,['theatre'],null,/연회|컨벤션/],
 ['worship',null,['theatre'],null,/예배|법당|성당|본당/],
 ['gym-hall',null,['theatre'],null,/체육관/],
 ['stadium-stand',null,['theatre'],null,/관중석|스윗박스/],
 ['cinema',null,['theatre'],null,/상영관|시네마/],
 ['studio-onair',null,['theatre'],null,/On-Air|온에어|스튜디오\(/],
 ['live-studio',null,['theatre'],null,/라이브 스튜디오|문화센터/],
 ['exhibition',null,['theatre'],null,/전시실|갤러리|전시관/],
 ['atrium',null,['theatre'],null,/아트리움|중앙 광장|메인 체험존/],
 ['outdoor-stage',null,['theatre'],null,/야외 공연|광장 무대/],
 ['immersive-room',null,['theatre'],['immersive'],/몰입|체험관/],
 ['community-hall',null,['theatre'],null,/커뮤니티/],
 ['auditorium',null,['theatre'],null,/./],
 // lounge · waiting · living
 ['ride-queue',null,['lounge'],['waiting'],/대기 동선|대기열|프리쇼/],
 ['airport-arrival',null,['lounge'],['waiting'],/입국장|공항/],
 ['subway-passage',null,['lounge'],['waiting'],/환승통로/],
 ['elevator-hall',null,['lounge'],['waiting'],/엘리베이터/],
 ['clinic-wait','MD',['lounge'],['waiting'],/./],
 ['bank-wait','FN',['lounge'],['waiting'],/./],
 ['laundromat-wait','SV',['lounge'],['waiting'],/./],
 ['telco-store','OE',['lounge'],['waiting'],/./],
 ['transit-hall',null,['lounge'],['waiting'],/./],
 ['kids-zone',null,['lounge'],['kids'],/./],
 ['golf-play',null,['lounge'],null,/플레이 룸/],
 ['skybox',null,['lounge'],null,/스카이박스|VIP석/],
 ['snack-zone',null,['lounge'],null,/스낵/],
 ['community-lounge',null,['lounge'],null,/커뮤니티/],
 ['suite-lounge','HT',['lounge'],['living'],/./],
 ['home-living',null,['lounge'],['living'],/./],
 ['vip-lounge',null,['lounge'],null,/VIP|고객 라운지/],
 ['study-lounge',null,['lounge'],null,/스터디|학생/],
 ['office-lounge',null,['lounge'],null,/./],
 // office · operations
 // a room of one's own: 대표실 (sofa set) · 임원실 (meeting table) · 실장실 (working desk with files)
 ['ceo-office',null,['office','meeting'],null,/대표실|대표이사실|사장실|회장실|CEO/i],
 ['exec-office',null,['office','meeting'],null,/임원실|이사실|부사장실|전무실|상무실|본부장실/],
 ['director-office',null,['office','meeting'],null,/실장실|팀장실|부장실|센터장실|소장실|국장실|지점장실/],
 ['call-center',null,['office'],null,/콜센터/],
 ['press-room',null,['office'],null,/기자실|미디어센터/],
 ['broadcast-room',null,['office'],null,/방송실/],
 ['sub-control',null,['office'],['operations'],/부조정실/],
 ['command-room',null,['office'],['operations'],/지휘통제|상황실|종합상황/],
 ['dealing-room',null,['office'],['operations'],/딜링룸/],
 ['plant-control',null,['office'],['operations'],/MES|중앙통제|방재/],
 ['control-room',null,['office'],['operations'],/./],
 ['teachers-room',null,['office'],null,/교무실/],
 ['print-corner',null,['office'],['administration'],/출력/],
 ['admin-office',null,['office'],['administration'],/./],
 ['bank-teller',null,['office'],['bank'],/./],
 ['nursing-station',null,['office'],['nursing'],/./],
 ['medical-office','MD',['office'],null,/./],
 ['back-office',null,['office'],null,/백오피스|사무동|사무실/],
 // study · classroom
 ['pc-cafe','SV',['study'],['computerlab'],/./],
 ['k12-class',null,['classroom'],null,/^교실$|학교/],
 // meeting
 ['boardroom',null,['meeting'],null,/이사회|대회의실/],
 ['briefing-room',null,['meeting'],null,/브리핑|교대실/],
 ['training-room',null,['meeting'],['meeting'],/교육장|교육관|세미나/],
 ['pb-lounge',null,['meeting'],['consultation'],/VIP|PB/],
 ['design-consult','ID',['meeting'],['consultation'],/./],
 ['owner-office',null,['meeting'],['consultation'],/점주|백오피스|역무실|^사무$/],
 // bedroom
 ['hotel-room','HT',['bedroom'],['bedroom'],/./],
 ['studio-apt',null,['bedroom'],['bedroom'],/원룸|스튜디오/],
 ['senior-room','RS',['bedroom'],['bedroom'],/./],
 ['barracks','MI',['bedroom'],null,/./],
 ['dress-bedroom',null,['bedroom'],['homebedroom'],/드레스/],
 // medical
 ['operating-room',null,['medical'],null,/수술/],
 ['hair-salon','SV',['medical'],null,/./],
 ['treatment-room',null,['medical'],['ward'],/처치|케어룸/],
 ['care-room',null,['medical'],['ward'],/생활실|요양/],
 ['ward-room',null,['medical'],['ward'],/./],
 // fitness
 ['gx-studio','SF',['fitness'],null,/./],
 ['spa-fitness','HT',['fitness'],null,/./],
 ['locker-gym','VN',['fitness'],null,/./],
 ['mess-gym','MI',['fitness'],null,/./],
 ['rehab-room',null,['fitness'],null,/재활|치료/],
 // utility
 ['telecom-room',null,['utility'],['mechanical'],/통신|장비실|국사/],
 ['rooftop-plant',null,['utility'],['mechanical'],/옥상|실외기|천장/],
 ['plant-room',null,['utility'],['mechanical'],/./],
 ['linen-room',null,['utility'],['laundry'],/리넨|하우스키핑|수건|^세탁실/],
 ['home-laundry','RS',['utility'],['laundry'],/드레스룸|다용도실|^세탁 공간$/],
 ['home-laundry','ID',['utility'],['laundry'],/./],
 ['home-laundry','HT',['utility'],['laundry'],/^세탁 공간$/],
 ['coin-laundry',null,['utility'],['laundry'],/./],
 ['fitting-room',null,['utility'],['garment'],/피팅/],
 ['dressing-room',null,['utility'],['garment'],/분장/],
 ['locker-room',null,['utility'],['garment'],/라커|락커|파우더/],
 // kitchen
 ['food-hall',null,['kitchen'],null,/식품관/],
 ['bakery-kitchen',null,['kitchen'],null,/베이킹|제조실/],
 ['dining-kitchen',null,['kitchen'],null,/다이닝/],
 ['commercial-kitchen','FB',['kitchen'],null,/./],
 ['commercial-kitchen',null,['kitchen'],null,/BOH|급식/],
 // retail
 ['bakery-display','FB',['retail'],null,/./],
 ['model-house',null,['retail'],null,/모델하우스|분양/],
 ['concession','VN',['retail'],null,/./],
 ['souvenir-shop','TP',['retail'],null,/./],
 ['telco-store','OE',['retail'],null,/./],
 ['appliance-zone',null,['retail'],null,/가전/],
 ['mart-aisle',null,['retail'],null,/진열 통로|엔드캡|프로모션|매장 홀|상업시설/],
 ['fashion-store',null,['retail'],null,/./],
 // warehouse-kind
 ['fresh-market','RT',['warehouse'],['coldstore'],/./],
 ['cleanroom',null,['warehouse'],['production'],/^클린룸/],
 ['assembly-line',null,['warehouse'],['production'],/./],
 ['lab',null,['warehouse'],['laboratory'],/./],
 ['art-storage',null,['warehouse'],['warehouse'],/수장고/],
 ['cold-warehouse',null,['warehouse'],['warehouse'],/저온/],
 ['shipping-dock',null,['warehouse'],['warehouse'],/./],
];
const resolved=new Map();
export function spaceCharacter(room,industry){
 if(!(room?.layoutCompositionVersion>=SPACE_CHARACTER_VERSION))return null;
 const key=[industry,room.kind,room.spaceProfile,room.name].join('|');
 if(!resolved.has(key))resolved.set(key,RULES.find(([,industries,kinds,profiles,name])=>(!industries||industries.split(' ').includes(industry))&&(!kinds||kinds.includes(room.kind))&&(!profiles||profiles.includes(room.spaceProfile))&&name.test(room.name||''))?.[0]||null);
 return resolved.get(key);
}

// Chairs around one table: n/s take `per` seats each, e/w one each (rotations already face the table).
const around=(chair,x,z,tw,td,{n=1,s=1,e=0,west=0,gap=.14,cd=.54}={})=>{
 const out=[],row=(count,dz,rot)=>{for(let i=0;i<count;i++)out.push([chair,x+(i-(count-1)/2)*Math.min(.8,tw/Math.max(1,count)*1.05),z+dz,rot]);};
 row(n,-(td/2+gap+cd/2),0);row(s,td/2+gap+cd/2,180);
 if(west)out.push([chair,x-(tw/2+gap+cd/2),z,270]);if(e)out.push([chair,x+(tw/2+gap+cd/2),z,90]);
 return out;
};
const grid=(kind,xs,zs,rot=0)=>zs.flatMap(z=>xs.map(x=>[kind,x,z,rot]));
// Office-type rooms fill with desk rows: a side piece takes the right wall when it is free, otherwise the band by the door wall.
const side=(kind,w,d,n=0,half=.45)=>[kind,[[w-half,d*.56+n*1.25,90],[n%2?w-.8-Math.floor(n/2)*1.3:.8+Math.floor(n/2)*1.3,d-.42,180],[n%2?.8+Math.floor(n/2)*1.3:w-.8-Math.floor(n/2)*1.3,d-.42,180]]];

// plan(w,d,room) replaces the profile's furniture; extra(w,d,room) is added to it. Coordinates are metres
// from the room's back-left corner (the door is at the middle of the z=d wall). Furniture that does not
// fit a smaller room is skipped, so a plan may be generous.
// seating: 'near' = each seat faces its nearest table/desk/counter · 'fixed' = keep the planned direction.
const C={
 // ── outdoor ──
 'cafe-terrace':{seating:'near',plan:(w,d)=>[['parasol-table',w*.27,d*.34],...around('outdoor-bistro',w*.27,d*.34,.9,.9,{n:1,s:1,e:1,west:1}),['parasol-table',w*.7,d*.5],...around('outdoor-bistro',w*.7,d*.5,.9,.9,{n:1,s:1,e:1,west:1}),
   ['flower-planter',1.05,d-.5],['flower-planter',w-1.05,d-.5],['bench',w*.5,.5],['queue-post',w*.5-1,d-1.45],['queue-post',w*.5+1,d-1.45]],
  dress:c=>{c.over('parasol-canopy','parasol-table',2);c.top('cup-paper','roundtable',2);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['waiter',['serve','inspect'],'parasol-table','side']]}},
 'bus-stop':{plan:(w,d)=>[['bus-shelter',w*.42,1.25],['street-tree',1,d*.62],['street-tree',w-1,d*.3],['bollard',w*.3,d-.5],['bollard',w*.7,d-.5],['bike-rack',w-1.2,d-1.3,90],['waste-sort',w*.42+2.5,.6]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['shopper',['rest','inspect'],'bus-shelter','customer'],['student',['read','inspect'],'bus-shelter','customer']]}},
 'gate-plaza':{plan:(w,d)=>[['ticket-booth',1.4,1.35],['turnstile-gate',w*.62,d*.42],['queue-rail',2.9,2.6,90],['queue-rail',2.9,4.3,90],['street-tree',w-.95,.95],['flower-planter',w-1.1,d-.55],['bollard',1.2,d-.5],['bench',w*.62,.5]],
  people:{fill:false,stand:[['guide',['present','point-left'],'turnstile-gate','side'],['customer',['inspect','menu'],'ticket-booth','customer'],['shopper',['rest','inspect'],'ticket-booth','queue']]}},
 'stadium-board':{seating:'fixed',plan:(w,d)=>[...grid('stadium-seat',[w*.2,w*.2+.62,w*.2+1.24,w*.62,w*.62+.62,w*.62+1.24],[d*.5,d*.5+1]),['queue-rail',w*.28,d*.5-.9],['queue-rail',w*.7,d*.5-.9],['flower-planter',w-1.1,d-.55],['bench',1.2,d-.5]],
  people:{fill:{type:'audience',role:'customer'},stand:[['security',['present'],'queue-rail','customer']]}},
 'logistics-yard':{plan:(w,d)=>[['carton-pallet',1,1],['carton-pallet',2.1,1],['roll-cage',w-1,1.2],['roll-cage',w-1,2.3],['pallet-jack',w*.45,d*.45],['safety-cone',w*.3,d-.6],['safety-cone',w*.72,d-.6],['bench',w-1.3,d-.5],['barricade-a',1.2,d*.6,90]],
  people:{fill:false,stand:[['courier',['carry','push'],'pallet-jack','front'],['inspector',['inspect','present'],'carton-pallet','customer']]}},
 'work-yard':{plan:(w,d)=>[['barricade-a',w*.3,d*.35],['barricade-a',w*.3+1.7,d*.35],['safety-cone',w*.3-1,d*.35+.9],['safety-cone',w*.3+2.7,d*.35+.9],['tool-cart',w-1.1,1],['carton-pallet',1,1],['bench',1.3,d-.5],['safety-cone',w*.72,d-.6]],
  people:{fill:false,stand:[['inspector',['inspect','present'],'tool-cart','customer'],['worker',['carry','inspect'],'barricade-a','customer']]}},
 'park':{seating:'near',plan:(w,d)=>[['street-tree',1,1],['street-tree',w-1,1.1],['street-tree',1,d-1.2],['park-bench',w*.3,.6],['table-outdoor',w*.62,d*.5],...around('outdoor-bistro',w*.62,d*.5,1.8,.9,{n:2,s:2}),['flower-planter',w*.3,d*.5],['flower-planter',w-1.1,d-.55]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['gardener',['water','inspect'],'flower-planter','customer']]}},
 'sports-field':{plan:(w,d)=>[['golf-tee-mat',w*.35,d*.35],['golf-tee-mat',w*.35+2.2,d*.35],['golf-bag',w*.35-1.1,d*.35],['golf-bag',w*.35+3.4,d*.35],['park-bench',1.3,d-.6,180],['ball-cart',w-1,d-.7],['street-tree',w-1,1]],
  people:{fill:false,stand:[['trainer',['present','inspect'],'golf-bag','customer'],['shopper',['rest'],'golf-tee-mat','on']]}},
 'school-route':{plan:(w,d)=>[['street-tree',1,1],['street-tree',w-1,d*.55],['park-bench',w*.45,.6],['bike-rack',w-1.3,1.2,90],['bollard',w*.3,d-.5],['bollard',w*.5-1,d-.5],['bollard',w*.7,d-.5],['safety-cone',1,d-.6],['flower-planter',1.1,d*.55,90]],
  people:{fill:{type:'lounge',role:'student'},stand:[['student',['read','inspect'],'park-bench','customer'],['student',['inspect','read'],'bike-rack','customer']]}},
 'plaza':{plan:(w,d)=>[['street-tree',1,1.1],['street-tree',w-1,1.1],['park-bench',w*.3,d*.45,90],['park-bench',w*.72,d*.45,270],['flower-planter',w*.5,d*.45],['bollard',w*.3,d-.5],['bollard',w*.7,d-.5],['bike-rack',w-1.2,d-1.4,90],['flower-planter',1.1,d-.55]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['shopper',['rest','inspect'],'flower-planter','customer'],['guide',['present','point-left'],'park-bench','customer']]}},
 // ── reception ──
 'cafe-counter':{seating:'near',plan:(w,d)=>[['counter',w*.4,1.85],['cabinet-bakery',w*.4+2,1.9],['sink',w*.4,.48],['queue-post',w*.4-.8,3.35],['queue-post',w*.4+.8,3.35],['table-bar-high',.85,d*.62,90],['bar-pedestal',1.45,d*.62-.4,90],['bar-pedestal',1.45,d*.62+.4,90],['plant',w-.7,d-.7]],
  dress:c=>{c.top('cup-paper','counter');c.top('menu-paper','counter');c.top('tray-rect','counter');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['barista',['serve','inspect','present'],'counter','front'],['customer',['menu','inspect'],'counter','customer'],['shopper',['rest','inspect'],'counter','queue']]}},
 'hotel-front':{seating:'near',plan:(w,d)=>[['reception',w*.56,1.9],['taskchair',w*.56-.6,1.05],['luggage-cart',w-1.05,d*.55,90],['sofa-three',1.75,d*.72,180],['table-sofa-round',1.75,d*.72-1.2],['sofa-single',.75,d*.72-1.25,270],['planter-tall',.6,.6],['planter-tall',w-.6,.6]],
  dress:c=>{c.floor('suitcase-pair',[[3.25,c.d*.72],[c.w*.56+1,3.1]]);c.top('vase-small','reception');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['receptionist',['present','inspect'],'reception','front'],['concierge',['push','present'],'luggage-cart','front'],['customer',['inspect','menu'],'reception','customer']]}},
 'hospital-front':{seating:'fixed',plan:(w,d)=>[['reception',w*.56,1.9],['office-mesh',w*.56-.6,1.05],['office-mesh',w*.56+.6,1.05],['waiting-arm-beam',w*.33,d*.56,180],['waiting-arm-beam',w*.33+2.1,d*.56,180],['waiting-arm-beam',w*.33,d*.56+1.15,180],['wheelchair-manual',w-.9,d*.6,90],['shelf-magazine',.4,d*.5,270],['plant',.6,.6]],
  people:{sit:[['clerk',['write'],['office-mesh'],1]],fill:{type:'lounge',role:'patient'},stand:[['clerk',['inspect','consult'],'reception','front'],['caregiver',['push','present'],'wheelchair-manual','front'],['customer',['inspect'],'reception','customer']]}},
 'civil-service':{seating:'near',plan:(w,d)=>[...[w*.2,w*.5,w*.8].flatMap(x=>[['desk-office',x,2.1],['office-mesh',x,1.3],['public-visitor',x,2.88,180]]),['waiting-beam',1.25,d-1.5,180],['bank-form-desk',w-.85,d-1.6,90],['shelf-magazine',.4,d*.5,270]],
  dress:c=>{c.top('paper-tray','desk',2);c.top('nameplate','desk',3);},
  people:{sit:[['clerk',['write','consult'],['office-mesh'],3],['customer',['listen','read','write'],['public-visitor'],2]],fill:{type:'lounge',role:'customer'},stand:[['customer',['inspect'],'bank-form-desk','front']]}},
 'bank-hall':{seating:'fixed',plan:(w,d)=>[['desk-reception-small',w*.5,1.7],['waiting-beam',w*.3,d*.55,180],['waiting-beam',w*.3+2,d*.55,180],['bank-form-desk',w-.85,d*.55,90],['queue-post',w*.5-.9,2.9],['queue-post',w*.5+.9,2.9],['shelf-magazine',.4,d*.42,270],['planter-tall',.6,.6],['planter-tall',w-.6,.6]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['banker',['inspect','point'],'desk-reception-small','front'],['customer',['inspect'],'bank-form-desk','front']]}},
 'ticket-lobby':{plan:(w,d)=>[['counter',w*.5,1.75],['queue-rail',w*.5-1.3,3.4,90],['queue-rail',w*.5,3.4,90],['queue-rail',w*.5+1.3,3.4,90],['waiting-beam',1.2,d-1.5,180],['shelf-magazine',.4,d*.4,270],['planter-tall',w-.6,.6]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['guide',['inspect','present'],'counter','front'],['customer',['inspect','menu'],'counter','customer'],['shopper',['rest','snack'],'counter','queue']]}},
 'concession':{seating:'near',plan:(w,d)=>[['counter',w*.42,1.85],['snack-shelf',w*.42+2.1,.5],['snack-shelf',.4,d*.42,270],['queue-post',w*.42-.9,3.3],['queue-post',w*.42+.9,3.3],['table-bar-high',w-1,d*.6,90],['stool',w-1.6,d*.6-.4,270],['stool',w-1.6,d*.6+.4,270],['waste-sort',w-.75,d-.5]],
  dress:c=>{c.top('cup-paper','counter',2);c.top('tray-rect','counter');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['retailer',['serve','inspect'],'counter','front'],['customer',['menu','inspect'],'counter','customer'],['shopper',['snack','rest'],'counter','queue']]}},
 'info-desk':{seating:'near',plan:(w,d)=>[['desk-reception-small',w*.5,1.9],['shelf-magazine',.4,d*.4,270],['exhibit-pedestal',w-.9,d*.45],['waiting-beam',1.3,d-1.5,180],['planter-tall',.6,.6],['planter-tall',w-.6,.6],['queue-post',w*.5+1.3,2.9]],
  dress:c=>{c.top('catalog-paper','reception');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['guide',['present','point-left'],'desk-reception-small','front'],['customer',['inspect','menu'],'desk-reception-small','customer']]}},
 'store-counter':{plan:(w,d)=>[['checkout-counter',w*.45,1.9],['snack-shelf',.4,d*.4,270],['gondola-shelf',w-1.1,d*.55,90],['snack-shelf',w*.45+2,.5],['queue-post',w*.45-.9,3.3],['waste-sort',.75,d-.5]],
  people:{fill:false,stand:[['retailer',['inspect','serve'],'checkout-counter','front'],['shopper',['inspect','rest'],'checkout-counter','customer'],['shopper',['inspect','snack'],'gondola-shelf','customer']]}},
 'telco-counter':{seating:'near',plan:(w,d)=>[...[w*.3,w*.66].flatMap(x=>[['desk-office',x,2.1],['office-mesh',x,1.3],['bank-consult',x,2.88,180]]),['experience-table',w*.5,d-2.3],['display-tier',.8,d*.55,270],['planter-tall',w-.6,.6]],
  dress:c=>{c.top('catalog-paper','desk',2);},
  people:{sit:[['retailer',['consult','write'],['office-mesh'],2],['customer',['listen','read'],['bank-consult'],2]],fill:false,stand:[['shopper',['inspect','rest'],'experience-table','customer']]}},
 'salon-front':{seating:'near',plan:(w,d)=>[['desk-reception-small',w*.55,1.8],['sofa',1.6,d*.7,180],['coffeetable',1.6,d*.7-1.1],['shelf-retail',.42,d*.35,270],['shelf-magazine',.4,d*.35+1.3,270],['stand-coat',w-.6,.6],['plant',w-.7,d-.7]],
  dress:c=>{c.top('vase-small','reception');c.top('catalog-paper','coffeetable');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['retailer',['inspect','present'],'desk-reception-small','front']]}},
 'golf-front':{seating:'near',plan:(w,d)=>[['counter',w*.55,1.85],['golf-bag',w-.6,d*.45],['golf-bag',w-.6,d*.45+.7],['sofa',1.6,d*.7,180],['coffeetable',1.6,d*.7-1.1],['shelf-retail',.42,d*.35,270],['plant',.6,.6]],
  dress:c=>{c.top('cup-mug','coffeetable');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['trainer',['inspect','present'],'counter','front'],['customer',['inspect'],'counter','customer']]}},
 'gym-front':{seating:'near',plan:(w,d)=>[['reception',w*.55,1.9],['taskchair',w*.55,1.05],['towel-shelf',.42,d*.35,270],['turnstile-gate',w-1.3,d*.55,90],['sofa-modular',1.5,d*.72,180],['table-side',1.5,d*.72-1],['snack-shelf',.42,d*.35+1.2,270],['plant',w-.6,.6]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['trainer',['inspect','present'],'reception','front'],['customer',['inspect'],'reception','customer']]}},
 'academy-front':{seating:'near',plan:(w,d)=>[['desk-reception-small',w*.3,1.8],['table-huddle',w*.7,d*.5],...around('visitor-cantilever',w*.7,d*.5,1.6,.8,{n:2,s:2,cd:.57}),['bookshelf-filled',.42,d*.5,270],['shelf-magazine',.4,d*.5+1.5,270],['plant',w-.6,.6]],
  dress:c=>{c.top('catalog-paper','table');c.top('book-stack','table');},
  people:{fill:{type:'meeting',role:'customer'},stand:[['clerk',['inspect','consult'],'desk-reception-small','front']]}},
 'office-lobby':{seating:'near',plan:(w,d)=>[['reception',w*.5,1.9],['taskchair',w*.5,1.05],['turnstile-gate',w-1.3,d*.52,90],['sofa',1.55,d*.72,180],['coffeetable',1.55,d*.72-1.1],['planter-tall',.6,.6],['planter-tall',w-.6,.6]],
  dress:c=>{c.top('catalog-paper','coffeetable');},
  people:{fill:{type:'lounge',role:'office'},stand:[['receptionist',['present','inspect'],'reception','front'],['security',['present'],'turnstile-gate','side']]}},
 'self-checkout':{plan:(w,d)=>[['checkout-counter',w*.3,2,90],['checkout-counter',w*.62,2,90],['shopping-cart',w*.3+.95,3.1],['shopping-cart',w*.62+.95,d*.6],['gondola-shelf',w-.7,d*.38,90],['queue-post',w*.46,d-1.6],['waste-sort',.75,d-.5]],
  people:{fill:false,stand:[['retailer',['inspect','serve'],'checkout-counter','front'],['shopper',['inspect','rest'],'checkout-counter','customer'],['shopper',['rest','inspect'],'shopping-cart','front']]}},
 'atm-zone':{plan:(w,d)=>[['desk-reception-small',w*.5,1.75],['partition-acoustic',w*.5-1.1,2.1,90],['partition-acoustic',w*.5+1.1,2.1,90],['bank-form-desk',w-.85,d*.55,90],['waiting-beam',1.2,d-1.5,180],['queue-post',w*.5,3.2],['planter-tall',.6,.6]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['customer',['inspect','read'],'desk-reception-small','customer'],['customer',['inspect'],'bank-form-desk','front']]}},
 'kiosk-zone':{plan:(w,d)=>[['desk-reception-small',w*.5,1.75],['queue-rail',w*.5-1.05,2.95,90],['queue-rail',w*.5+1.05,2.95,90],['bench',1.2,d*.6,90],['shelf-magazine',.4,d*.3,270],['waste-sort',w-.75,d-.5],['plant',w-.7,.7]],
  dress:(c,room)=>{if(/체크인/.test(room.name))c.floor('suitcase-pair',[[c.w*.5+1.7,2.6],[1.9,c.d*.6]]);if(/세탁|빨래/.test(room.name))c.floor('laundry-basket-filled',[[1.9,c.d*.6],[c.w-1,c.d*.5]]);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['customer',['inspect','read'],'desk-reception-small','customer'],['shopper',['rest','inspect'],'desk-reception-small','queue']]}},
 'home-entry':{dress:c=>{c.floor('umbrella-basket',[[c.w*.5+1.2,c.d-.5],[.5,c.d*.45]]);c.floor('basket-floor',[[c.w-.6,c.d*.5]]);}},
 // ── dining ──
 'cafe-hall':{seating:'near',plan:(w,d)=>[['sofa-booth',.5,d*.28,270],['table-cafe-two',1.32,d*.28],['cafe-bentwood',2.06,d*.28,90],['sofa-booth',.5,d*.28+1.95,270],['table-cafe-two',1.32,d*.28+1.95],['cafe-bentwood',2.06,d*.28+1.95,90],
   ['roundtable',w*.55,d*.3],...around('cafe-bentwood',w*.55,d*.3,.85,.85,{n:1,s:1,e:1,west:1}),['roundtable',w*.82,d*.62],...around('cafe-bentwood',w*.82,d*.62,.85,.85,{n:1,s:1,west:1}),['table-cafe-round',w*.52,d*.66],...around('cafe-bentwood',w*.52,d*.66,.65,.65,{e:1,west:1}),['plant',w-.7,.7]],
  dress:c=>{c.top('cup-mug','table',2);c.top('cup-espresso','roundtable',2);c.top('dish-side','roundtable',1);},
  people:{fill:{type:'dining',role:'customer'},stand:[['barista',['serve','inspect'],'roundtable','side']]}},
 'restaurant':{seating:'near',plan:(w,d)=>[...[[w*.26,d*.28],[w*.7,d*.28],[w*.26,d*.71],[w*.7,d*.71]].flatMap(([x,z])=>[['table-dining-four',x,z],...around('dining-upholstered',x,z,1.35,.8,{n:2,s:2,cd:.57})]),['cart-service',w-.5,d*.5,90],['planter-divider',w*.48,d*.5]],
  dress:c=>{c.top('glass-wine','table',1);},
  people:{fill:{type:'dining',role:'customer'},stand:[['waiter',['serve','inspect'],'cart-service','front']]}},
 'pub-bar':{seating:'near',plan:(w,d)=>[['bottle-shelf',1.55,.36],['bar-counter',2,1.65],...[1,1.67,2.33,3].map(x=>['bar-backrest',x,2.42,180]),['table-bar-high',w-1.4,2,90],['bar-pedestal',w-2,1.6,270],['bar-pedestal',w-2,2.4,270],
   ['roundtable',w*.34,d-1.75],...around('cafe-metal',w*.34,d-1.75,.85,.85,{n:1,e:1,west:1,cd:.5}),['roundtable',w*.78,d-1.9],...around('cafe-metal',w*.78,d-1.9,.85,.85,{n:1,west:1,e:1,cd:.5})],
  dress:c=>{c.top('glass-wine','roundtable',2);c.top('cup-tumbler','table',1);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['waiter',['inspect','serve'],'bar-counter','front']]}},
 'food-court':{seating:'near',plan:(w,d)=>[['counter',w*.28,.75],['counter',w*.28+2.6,.75],...[[w*.3,d*.48],[w*.72,d*.48]].flatMap(([x,z])=>[['table-family-six',x,z],...around('cafe-metal',x,z,1.8,.9,{n:2,s:2,cd:.5})]),['table-cafe-two',w*.3,d-1.6],...around('cafe-metal',w*.3,d-1.6,.7,.7,{e:1,west:1,cd:.5}),['tray-return',w-.6,d-1.9,90],['waste-sort',w-.75,d*.3,90]],
  dress:c=>{c.top('menu-paper','counter',2);c.top('tray-rect','table',2);},
  people:{fill:{type:'dining',role:'customer'},stand:[['chef',['present','inspect'],'counter','front'],['customer',['meal-tray','menu'],'counter','customer']]}},
 'breakfast-buffet':{seating:'near',plan:(w,d)=>[['buffet-table',1.6,1],['buffet-table',w-.65,d*.42,90],...[[w*.3,d*.44],[w*.62,d*.44],[w*.3,d*.44+2.4]].flatMap(([x,z])=>[['table-dining-four',x,z],...around('dining-upholstered',x,z,1.35,.8,{n:2,s:2,cd:.57})]),['cart-service',w-.65,d-1.3,90],['plant',w-.7,.7]],
  dress:c=>{c.top('cup-tea','table',1);},
  people:{fill:{type:'dining',role:'customer'},stand:[['customer',['meal-tray'],'buffet-table','customer'],['chef',['inspect','present'],'buffet-table','front']]}},
 'private-dining':{seating:'near',plan:(w,d)=>[['table-family-six',w*.5-.95,d*.48],['table-family-six',w*.5+.95,d*.48],...around('dining-arm',w*.5-.95,d*.48,1.8,.9,{n:2,s:2,west:1,cd:.58}),...around('dining-arm',w*.5+.95,d*.48,1.8,.9,{n:2,s:2,e:1,cd:.58}),['cabinet-showcase',.75,.42],['cart-service',w-.65,1.2,90],['planter-tall',.6,d-.7],['planter-tall',w-.6,d-.7]],
  dress:c=>{c.top('vase-small','table',2);},
  people:{fill:{type:'dining',role:'customer'},stand:[['waiter',['serve','inspect'],'cart-service','front']]}},
 'fellowship':{seating:'near',plan:(w,d)=>[['buffet-table',1.6,.9],...[[w*.28,d*.5],[w*.72,d*.5]].flatMap(([x,z])=>[['banquet-round',x,z],...around('folding-event',x,z,1.6,1.6,{n:2,s:2,e:1,west:1,gap:.12,cd:.5})]),['piano-upright',w-1.1,1],['plant',.6,d-.7]],
  people:{fill:{type:'dining',role:'customer'},stand:[['customer',['meal-tray'],'buffet-table','customer']]}},
 'care-dining':{seating:'near',plan:(w,d)=>[...[[w*.28,d*.32],[w*.7,d*.32],[w*.28,d*.7]].flatMap(([x,z])=>[['table-dining-four',x,z],...around('care-highback',x,z,1.35,.8,{n:1,s:1,e:1,cd:.66})]),['sofa-care',w*.72,d-1.2,180],['wheelchair-manual',w-.8,d*.5,90],['piano-upright',w-1.1,.75],['walker-frame',.6,d*.5]],
  dress:c=>{c.top('cup-lid','table',3);},
  people:{fill:{type:'dining',role:'patient'},stand:[['caregiver',['meal-tray','present'],'table-dining-four','side'],['caregiver',['push','present'],'wheelchair-manual','front']]}},
 'canteen':{seating:'near',plan:(w,d)=>[['serving-line',1.35,d*.44,270],...(w<7.4?[[w*.56,d*.27],[w*.56,d*.27+2.3]]:[[w*.48,d*.27],[w*.48,d*.27+2.3],[w*.78,d*.27],[w*.78,d*.27+2.3]]).flatMap(([x,z])=>[['table-dining-four',x,z],...around('training-stack',x,z,1.35,.8,{n:2,s:2,cd:.52})]),['tray-return',w-.45,d*.27+1.15,90],['waste-sort',1.3,d-.5]],
  people:{fill:{type:'dining',role:'customer'},stand:[['chef',['present','inspect','stir'],'serving-line','front'],['customer',['meal-tray'],'serving-line','customer']]}},
 'pantry':{seating:'near',plan:(w,d)=>[['sink',1.2,.48],['cabinet-kitchen',2.7,.45],['table-bar-high',w*.55,d*.5],...[-.42,.42].flatMap(x=>[['stool',w*.55+x,d*.5-.62,0],['stool',w*.55+x,d*.5+.62,180]]),['snack-shelf',.42,d*.5,270],['waste-sort',w-.75,d*.3,90],['sofa-modular',w-1.1,d-1.6,180],['plant',.6,d-.7]],
  dress:c=>{c.top('cup-mug','table',2);c.top('teapot-manual','cabinet');c.top('cup-paper','sink');},
  people:{fill:{type:'lounge',role:'office'}}},
 // ── theatre ──
 'banquet':{seating:'near',plan:(w,d)=>{const rows=d<6.5?[d*.58]:[Math.max(2.6,d*.36),d-1.6],close=rows.length>1&&rows[1]-rows[0]<3.05;
   // Two rows that stand close keep the aisle between them free: the first row seats its far side, the second its near side.
   return [['stage-teaching',w*.5,.62],...rows.flatMap((z,row)=>[w*.27,w*.73].flatMap(x=>[['banquet-round',x,z],...around('banquet-chair',x,z,1.6,1.6,{n:close&&row?0:2,s:close&&!row?0:2,e:1,west:1,gap:.11,cd:.54})])),['cart-service',w-.6,d*.5,90],['planter-tall',.6,.6]];},
  people:{fill:{type:'dining',role:'customer'},stage:[['presenter',['present','point']]],stand:[['waiter',['serve','inspect'],'cart-service','front']]}},
 'worship':{plan:(w,d)=>[['stage',w*.5,1.1],['piano-upright',.75,1.15,270],...grid('pew-bench',[w*.27,w*.73],[3.1,4.25,5.4],180),['shelf-magazine',w-.4,d*.4,90]],
  dress:c=>{c.onStage('altar-table','stage',0,-.3);c.onStage('lectern-wood','stage',1.35,.35);},
  people:{fill:{type:'audience',role:'customer'},stage:[['lecturer',['present']]]}},
 'gym-hall':{seating:'fixed',plan:(w,d)=>[['stage',w*.5,1.1],['basketball-hoop',1.2,d*.56,270],['basketball-hoop',w-1.2,d*.56,90],['ball-cart',w*.36,d*.5],['gym-bench',w*.5-1.7,d-.5],['gym-bench',w*.5+1.7,d-.5],...grid('folding-event',[w*.5-.9,w*.5-.3,w*.5+.3,w*.5+.9],[2.75],180)],
  dress:c=>{c.onStage('lectern-wood','stage',1.3,.3);},
  people:{fill:{type:'audience',role:'student'},stage:[['teacher',['present','point']]],stand:[['trainer',['present','inspect'],'ball-cart','customer']]}},
 'stadium-stand':{seating:'fixed',plan:(w,d)=>[['queue-rail',w*.25,1.5],['queue-rail',w*.5,1.5],['queue-rail',w*.75,1.5],...grid('stadium-seat',[.2,.31,.42,.58,.69,.8].map(f=>w*f),[2.5,3.5,4.5],180),['table-bar-high',w-.9,d-1.6,90],['vip-lounge-chair',.75,d-.9,180]],
  people:{fill:{type:'audience',role:'customer'},stand:[['security',['present'],'queue-rail','front']]}},
 'cinema':{seating:'fixed',plan:(w,d)=>[...grid('cinema-recliner',[.17,.33,.5,.67,.83].map(f=>w*f),[d*.42,d*.42+1.45],180),['queue-post',.5,d*.25],['queue-post',w-.5,d*.25],['waste-sort',w-.75,d-.5]],
  people:{fill:{type:'lounge',role:'customer'}}},
 'studio-onair':{seating:'near',plan:(w,d)=>[['news-desk',w*.5,2.25],['office-mesh',w*.5-.45,1.25],['office-mesh',w*.5+.45,1.25],['studio-camera',w*.3,d*.66,180],['studio-camera',w*.7,d*.66,180],['backdrop-stand',1,d*.42,270],['director-chair',w-.8,d*.7,90],['tool-cart',w-.7,1]],
  people:{sit:[['office',['read','consult'],['office-mesh'],2]],fill:false,stand:[['designer',['present'],'studio-camera','front'],['designer',['present'],'director-chair','side']]}},
 'live-studio':{plan:(w,d)=>[['stage',w*.5,1.1],['piano-upright',.75,1.15,270],['studio-camera',w-.9,d*.45,90],...grid('folding-event',[.24,.36,.48,.6,.72].map(f=>w*f),[3.1,4.05],180)],
  people:{fill:{type:'audience',role:'customer'},stage:[['performer',['present']]],stand:[['designer',['present'],'studio-camera','front']]}},
 'exhibition':{plan:(w,d)=>[['exhibit-wall',.4,d*.42,270],['exhibit-wall',w*.5,d*.36],['exhibit-pedestal',w*.3,d*.62],['exhibit-pedestal',w*.72,d*.62],['exhibit-pedestal',w-.9,1.2],['bench',w*.5,d*.36+1.5],['queue-post',w*.3-.9,d*.62],['queue-post',w*.72+.9,d*.62]],
  people:{fill:false,stand:[['guide',['point-left','present'],'exhibit-wall','customer'],['customer',['inspect','read'],'exhibit-wall','customer'],['shopper',['inspect','rest'],'exhibit-pedestal','customer']]}},
 'atrium':{plan:(w,d)=>[['stage-teaching',w*.5,d*.36],['display-plinth',w*.5-1.6,d*.36],['display-plinth',w*.5+1.6,d*.36],['flower-planter',1.1,d*.36,90],['flower-planter',w-1.1,d*.36,90],['bench',w*.3,d-1.5],['bench',w*.72,d-1.5],['planter-tall',.6,.6],['planter-tall',w-.6,.6]],
  people:{fill:{type:'lounge',role:'customer'},stage:[['guide',['present','point']]],stand:[['shopper',['inspect','rest'],'display-plinth','customer'],['shopper',['rest','snack'],'flower-planter','customer']]}},
 'outdoor-stage':{plan:(w,d)=>[['stage',w*.5,1.1],['street-tree',.95,d*.5],['street-tree',w-.95,d*.5],...grid('folding-event',[.3,.4,.5,.6,.7].map(f=>w*f),[3.1,4.05],180),['flower-planter',1.1,d-.55],['flower-planter',w-1.1,d-.55]],
  people:{fill:{type:'audience',role:'customer'},stage:[['performer',['present']]]}},
 'immersive-room':{plan:(w,d)=>[['bench',w*.3,d*.55],['bench',w*.7,d*.55],['bench',w*.5,d*.55+1.2],['queue-rail',.9,d*.3,90],['queue-rail',w-.9,d*.3,90],['display-plinth',w-.8,d-.9]],
  dress:c=>{c.floor('floor-cushion',[[c.w*.36,c.d*.36],[c.w*.5,c.d*.36],[c.w*.64,c.d*.36]],3);},
  people:{fill:{type:'audience',role:'customer'},stand:[['guide',['present','point-left'],'queue-rail','front'],['shopper',['inspect','rest'],'bench','customer']]}},
 'community-hall':{plan:(w,d)=>[['stage',w*.5,1.1],['piano-upright',.75,1.15,270],...grid('folding-event',[.3,.42,.54,.66].map(f=>w*f),[3.1,4.05],180),['table-training-fold',w-.5,d*.5,90],['planter-tall',.6,.6]],
  dress:c=>{c.top('cup-paper','table',2);c.top('water-pitcher','table');},
  people:{fill:{type:'audience',role:'customer'},stage:[['lecturer',['present']]]}},
 'auditorium':{plan:(w,d)=>[['stage',w*.5,1.1],...grid('auditorium-chair',[.2,.32,.44,.56,.68,.8].map(f=>w*f),[3.05,4.15,5.25],180),['planter-tall',.6,.6]],
  dress:c=>{c.onStage('lectern-wood','stage',1.35,.3);},
  people:{fill:{type:'audience',roleBy:{ED:'student',OF:'office',FN:'office',PB:'office',MD:'office'},role:'customer'},stage:[['lecturer',['present']]]}},
 // ── lounge · waiting ──
 'ride-queue':{plan:(w,d)=>[...[1.3,2.5,3.7].flatMap((z,i)=>[['queue-rail',w*.27+(i%2?.5:0),z],['queue-rail',w*.27+1.6+(i%2?.5:0),z],['queue-rail',w*.27+3.2+(i%2?.5:0),z]]),['bench',1,d-.5],['planter-tall',.6,.6],['waste-sort',w-.75,d-.5]],
  people:{fill:false,stand:[['guide',['present','point-left'],'queue-rail','front'],['customer',['inspect','read'],'queue-rail','customer'],['shopper',['rest','snack'],'queue-rail','customer'],['student',['inspect','read'],'queue-rail','customer']]}},
 'airport-arrival':{plan:(w,d)=>[['queue-rail',w*.25,2.2],['queue-rail',w*.25+1.6,2.2],['queue-rail',w*.25+3.2,2.2],['baggage-trolley',w*.3,1.2],['baggage-trolley',w*.62,1.3],['waiting-beam',w*.3,d-1.6,180],['waiting-beam',w*.3+2,d-1.6,180],['planter-tall',w-.6,.6]],
  dress:c=>{c.floor('suitcase-pair',[[c.w*.8,3.4],[1,3.3]],2);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['shopper',['rest','inspect'],'baggage-trolley','front'],['customer',['inspect','read'],'queue-rail','customer'],['guide',['present','point-left'],'queue-rail','customer']]}},
 'subway-passage':{plan:(w,d)=>[['queue-rail',w*.3,d*.48],['queue-rail',w*.3+1.6,d*.48],['queue-rail',w*.3+3.2,d*.48],['bench',.5,d*.3,90],['bench',.5,d*.3+2,90],['waste-sort',w-.75,d-.5],['waste-sort',w-.75,.5]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['shopper',['rest','inspect'],'queue-rail','front'],['customer',['inspect','read'],'queue-rail','customer'],['student',['read','inspect'],'queue-rail','customer']]}},
 'elevator-hall':{plan:(w,d)=>[['elevator-doors',.25,d*.45,270],['mailbox-wall',w-.3,d*.4,90],['bench',w*.5,d-1.6],['planter-tall',.6,.6],['planter-tall',.6,d-.7],['umbrella-basket',w-.4,d*.4+1.1]],
  dress:c=>{c.rug('rug-runner',c.w*.5,c.d*.45);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['customer',['inspect','read'],'elevator-doors','customer'],['courier',['carry'],'mailbox-wall','customer']]}},
 'clinic-wait':{seating:'near',plan:(w,d)=>[['waiting-arm-beam',w*.34,d*.38,180],['waiting-arm-beam',w*.34+2.1,d*.38,180],['waiting-arm-beam',w*.34,d*.38+1.3,180],['shelf-magazine',.4,d*.3,270],['table-kids-round',w-1,d-1.5],['kids-chair',w-1.75,d-1.5,270],['plant',.6,d-.7],['cart-medical',w-.6,d*.35]],
  dress:c=>{c.top('book-open','roundtable');},
  people:{fill:{type:'lounge',role:'patient'},stand:[['nurse',['inspect'],'cart-medical','customer']]}},
 'bank-wait':{seating:'fixed',plan:(w,d)=>[['waiting-beam',w*.3,d*.4,180],['waiting-beam',w*.3+2,d*.4,180],['waiting-beam',w*.3,d*.4+1.25,180],['bank-form-desk',w-.85,d*.5,90],['queue-post',w*.5-.9,1.6],['queue-post',w*.5+.9,1.6],['shelf-magazine',.4,d*.4,270],['planter-tall',.6,.6]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['customer',['inspect'],'bank-form-desk','front'],['banker',['inspect','point'],'queue-post','customer']]}},
 'laundromat-wait':{seating:'near',plan:(w,d)=>[['table-training-fold',1.2,d*.45,90],['table-cafe-two',w*.6,d*.5],...around('cafe-metal',w*.6,d*.5,.7,.7,{e:1,west:1,cd:.5}),['bench',w*.6,d-1.5],['shelf-magazine',w-.4,d*.4,90],['snack-shelf',w-.42,d*.4+1.3,90],['plant',.6,.6]],
  dress:c=>{c.floor('laundry-basket-filled',[[2,c.d*.45],[c.w*.6+1.2,c.d-1.5]],2);c.top('towels-folded','table',1);c.top('cup-paper','table',1);},
  people:{fill:{type:'lounge',role:'customer'}}},
 'transit-hall':{seating:'fixed',plan:(w,d)=>[['waiting-beam',w*.3,d*.36,180],['waiting-beam',w*.3+2,d*.36,180],['waiting-beam',w*.3,d*.36+.75],['waiting-beam',w*.3+2,d*.36+.75],['snack-shelf',.42,d*.4,270],['waste-sort',w-.75,d-.5],['queue-post',w*.5-1,d-1.5],['planter-tall',w-.6,.6]],
  dress:c=>{c.floor('suitcase-pair',[[c.w*.3+3.4,c.d*.36],[1,c.d*.36+.4]],2);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['shopper',['rest','inspect'],'queue-post','customer']]}},
 'kids-zone':{extra:(w,d)=>[['kids-slide',w-.7,d*.42],['ball-pool',1.25,d-1.25],['toy-blocks',w*.62,d*.3]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['teacher',['present','point'],'kids-slide','customer'],['guide',['present'],'ball-pool','customer']]}},
 'golf-play':{seating:'near',plan:(w,d)=>[['golf-tee-mat',w*.5,2.3],['golf-bag',w*.5-1.5,1.7],['golf-bag',w*.5+1.5,1.7],['sofa',w*.3,d-1.4,180],['coffeetable',w*.3,d-2.45],['table-side',w-.6,d*.5],['stand-coat',.6,.6]],
  dress:c=>{c.top('cup-tumbler','coffeetable',2);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['shopper',['rest'],'golf-tee-mat','on'],['trainer',['present','inspect'],'golf-bag','customer']]}},
 'skybox':{seating:'fixed',plan:(w,d)=>[...[.2,.36,.52,.68].map(f=>['vip-lounge-chair',w*f,1.5,180]),['table-side',w*.28,.75],['table-side',w*.6,.75],['table-bar-high',w*.4,d*.55],...[-.42,.42].map(x=>['bar-pedestal',w*.4+x,d*.55+.62,180]),['buffet-table',w-.65,d*.55,90],['planter-tall',.6,d-.7]],
  dress:c=>{c.top('glass-wine','table',2);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['waiter',['serve','inspect'],'buffet-table','front']]}},
 'snack-zone':{seating:'near',plan:(w,d)=>[['snack-shelf',.42,d*.3,270],['snack-shelf',.42,d*.3+1.2,270],['sink',w*.4,.48],['table-bar-high',w*.6,d*.52],...[-.42,.42].flatMap(x=>[['stool',w*.6+x,d*.52-.62,0],['stool',w*.6+x,d*.52+.62,180]]),['table-cafe-two',1.6,d-1.5],...around('cafe-metal',1.6,d-1.5,.7,.7,{e:1,west:1,cd:.5}),['waste-sort',w-.75,d-.5]],
  dress:c=>{c.top('cup-paper','table',2);},
  people:{fill:{type:'lounge',role:'student'},stand:[['student',['inspect','read'],'snack-shelf','customer']]}},
 'community-lounge':{seating:'near',plan:(w,d)=>[['sofa',1.6,d*.3,0],['coffeetable',1.6,d*.3+1.1],['bookshelf-filled',.42,d*.62,270],['desk-carrel',.75,d-.9,270],['library-chair',1.55,d-.9,90],['spin-bike',w-.8,1.4],['spin-bike',w-1.8,1.4],['gym-ball',w-.7,d*.52],['plant',w-.7,d-.7]],
  dress:c=>{c.rug('mat-yoga',c.w*.68,c.d*.56);c.top('book-open','coffeetable');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['trainer',['present','inspect'],'spin-bike','side']]}},
 'suite-lounge':{seating:'near',plan:(w,d)=>[['cabinet-hotel',w*.5,.42],['sofa-three',w*.5,d*.58,180],['table-sofa-round',w*.5,d*.58-1.2],['sofa-single',w*.5-1.7,d*.58-1.15,270],['sofa-single',w*.5+1.7,d*.58-1.15,90],['table-hotel-luggage',w-.6,d*.6,90],['planter-tall',.6,.6]],
  dress:c=>{c.rug('rug-wool',c.w*.5,c.d*.58-1.1);c.top('teapot-manual','coffeetable');c.floor('suitcase-pair',[[c.w-.7,c.d*.6+.9],[.7,c.d*.6]]);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['waiter',['serve'],'table-sofa-round','side']]}},
 'home-living':{seating:'near',plan:(w,d)=>[['cabinet-hotel',w*.5,.42],['sofa-chaise',w*.5,d*.6,180],['coffeetable',w*.5-.3,d*.6-1.45],['sofa-single',w*.5-2,d*.6-1.2,270],['bookshelf-filled',.42,d*.3,270],['table-side',w*.5+1.55,d*.6+.3],['plant',w-.7,.7]],
  dress:c=>{c.rug('rug-wool',c.w*.5-.3,c.d*.6-1.4);c.top('book-stack','coffeetable');c.top('cup-mug','coffeetable');c.top('photo-frame','cabinet');},
  people:{fill:{type:'lounge',role:'customer'}}},
 'vip-lounge':{seating:'near',plan:(w,d)=>[['table-sofa-round',w*.34,d*.4],['vip-lounge-chair',w*.34,d*.4-1,0],['vip-lounge-chair',w*.34,d*.4+1,180],['vip-lounge-chair',w*.34-1,d*.4,270],['vip-lounge-chair',w*.34+1,d*.4,90],['sofa-three',w-1.5,d-1.4,180],['coffeetable',w-1.5,d-2.5],['cabinet-showcase',w-.75,.42],['planter-tall',.6,.6]],
  dress:c=>{c.top('glass-wine','coffeetable',2);c.top('vase-small','cabinet');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['waiter',['serve','inspect'],'cabinet-showcase','customer']]}},
 'study-lounge':{seating:'near',plan:(w,d)=>[['sofa-modular',1.5,d*.3,0],['table-nesting',1.5,d*.3+1.05],['table-cafe-two',w*.6,d*.36],...around('library-chair',w*.6,d*.36,.7,.7,{e:1,west:1,cd:.52}),['table-cafe-two',w*.6,d*.36+1.8],...around('library-chair',w*.6,d*.36+1.8,.7,.7,{e:1,west:1,cd:.52}),['snack-shelf',w-.42,d*.3,90],['shelf-magazine',.4,d*.62,270]],
  dress:c=>{c.top('book-open','table',2);c.top('cup-paper','table',1);c.floor('floor-cushion',[[1.2,c.d-1],[2,c.d-1]],2);},
  people:{fill:{type:'study-lounge',role:'student'}}},
 'office-lounge':{seating:'near',plan:(w,d)=>[['sofa-modular',1.5,d*.3,0],['coffeetable',1.5,d*.3+1.1],['sofa-highback',w-1.2,d*.36,90],['table-side',w-2.1,d*.36],['table-cafe-round',w*.52,d*.55],...around('cafe-bentwood',w*.52,d*.55,.65,.65,{e:1,west:1}),['shelf-magazine',.4,d*.62,270],['planter-divider',w*.52,d*.3],['plant',w-.7,d-.7]],
  dress:c=>{c.top('cup-mug','roundtable');c.top('cup-mug','coffeetable');},
  people:{fill:{type:'lounge',role:'office'}}},
 // ── office (seats come from the profile; these add to it) ──
 // Executive rooms seat one person at a desk of their own; `capacity` is the seat count when none is given, and a room
 // asked to seat more people than the plan holds falls back to the profile's desk rows.
 'ceo-office':{capacity:1,seating:'near',plan:(w,d,room)=>room.capacity>5?null:[['desk-executive',w*.66,2],['executive-chair',w*.66,1.13],['visitor-cantilever',w*.66-.45,2.83,180],['visitor-cantilever',w*.66+.45,2.83,180],
   ['table-sofa-round',1.55,d-2.6],['sofa-three',1.55,d-1.5,180],['vip-lounge-chair',.6,d-2.6,270],['vip-lounge-chair',2.5,d-2.6,90],
   ['bookshelf-filled',.42,d*.25,270],['cabinet-showcase',w-.45,d*.62,90],['planter-tall',w-.6,.6],['planter-tall',.6,.6]],
  dress:c=>{c.rug('rug-wool',1.55,c.d-2.5);c.top('nameplate','desk-executive');c.top('photo-frame','desk-executive');c.top('teapot-manual','coffeetable');c.top('vase-small','cabinet');},
  people:{sit:[['office',['write','read'],['executive-chair'],1]],fill:{type:'meeting',role:'office'},stand:[['clerk',['consult','inspect'],'desk-executive','side']]}},
 'exec-office':{capacity:1,seating:'near',plan:(w,d,room)=>room.capacity>7?null:[['desk-executive',w*.3,2],['executive-chair',w*.3,1.13],['visitor-cantilever',w*.3-.45,2.83,180],['visitor-cantilever',w*.3+.45,2.83,180],
   ['table-huddle',w*.72,d*.52],...around('meeting-sled',w*.72,d*.52,1.6,.8,{n:2,s:2,cd:.54}),['whiteboard-plain',w-.4,d*.52,90],
   ['bookshelf-filled',.42,d*.62,270],['cabinet-office-low',w*.3+1.9,.42],['planter-tall',w-.6,.6],['stand-coat',.5,.5]],
  dress:c=>{c.top('nameplate','desk-executive');c.top('desk-calendar','desk-executive');c.top('catalog-paper','table');c.top('cup-water','table');c.top('photo-frame','cabinet');},
  people:{sit:[['office',['write','read'],['executive-chair'],1]],fill:{type:'meeting',role:'office'}}},
 'director-office':{capacity:1,seating:'near',plan:(w,d,room)=>room.capacity>5?null:[['desk-office',w*.34,2],['office-mesh',w*.34,1.2],['cabinet-office-low',w*.34+1.05,1.75,90],['visitor-cantilever',w*.34-.4,2.8,180],['visitor-cantilever',w*.34+.4,2.8,180],
   ['cabinet-files',.45,d*.5,270],['cabinet-files',.45,d*.5+1,270],['whiteboard-plain',w-.4,d*.4,90],
   ['table-cafe-round',w*.74,d*.6],['meeting-sled',w*.74-.75,d*.6,270],['meeting-sled',w*.74+.75,d*.6,90],['plant',w-.7,.7]],
  dress:c=>{c.top('paper-tray','desk-office');c.top('nameplate','desk-office');c.top('letter-box','cabinet');c.top('cup-mug','roundtable');},
  people:{sit:[['office',['write','read'],['office-mesh'],1]],fill:{type:'meeting',role:'office'}}},
 'call-center':{swap:{'desk-office':'desk-reading',desk:'desk-reading'},extra:(w,d)=>[side('whiteboard-plain',w,d,0,.4),side('cabinet-office-low',w,d,1)]},
 'press-room':{extra:(w,d)=>[['lectern-wood',[[w-.6,d*.56,90],[w-.7,d-.5,180]]],['studio-camera',[[w-.9,d*.56+1.4,270],[.9,d-.8,180]]]]},
 'broadcast-room':{extra:(w,d)=>[['cable-tray-cabinet',[[w-.5,d*.6,90],[1.6,d-.5,180]]],['studio-camera',[[w*.3,d-1,180],[w-.9,d-.8,180]]]]},
 'sub-control':{extra:(w,d)=>[side('cabinet-files',w,d,0),side('cabinet-files',w,d,2)]},
 'command-room':{extra:(w,d)=>[['table-huddle',w*.74,d-1.2],side('whiteboard-plain',w,d,0,.4)],dress:c=>{c.top('catalog-paper','table');}},
 'dealing-room':{extra:(w,d)=>[side('cabinet-office-low',w,d,0),side('cabinet-office-low',w,d,1)]},
 'plant-control':{extra:(w,d)=>[side('cabinet-files',w,d,0),side('cabinet-files',w,d,2),side('cabinet-office-low',w,d,1)]},
 'control-room':{extra:(w,d)=>[side('cabinet-office-low',w,d,0),side('whiteboard-plain',w,d,1,.4)]},
 'teachers-room':{seating:'near',extra:(w,d)=>[['bookshelf-filled',[[w-.42,d*.56,90],[.8,d-.4,180]]],['table-huddle',w*.74-.3,d-1.25],['school-chair',w*.74+.9,d-1.25,90],side('cabinet-files',w,d,2)],dress:c=>{c.top('book-stack','desk',4);c.top('pen-cup','desk',2);c.top('book-closed','table');}},
 'print-corner':{extra:(w,d)=>[side('shelf',w,d,0,.42),['waste-sort',w-.75,d-.5]],dress:c=>{c.top('paper-tray','desk',3);}},
 'admin-office':{extra:(w,d)=>[['desk-reception-small',w*.74,d-1.15],side('cabinet-files',w,d,0),side('cabinet-files',w,d,2)],dress:c=>{c.top('paper-tray','desk',3);c.top('letter-box','desk',1);}},
 'bank-teller':{seating:'near',plan:(w,d,room)=>{const count=Math.max(2,Math.ceil((room.capacity||6)/2)),pitch=(w-.5)/count;if(pitch<1.575)return null;
   const xs=Array.from({length:count},(_,i)=>.25+pitch*(i+.5));return [...xs.flatMap(x=>[['desk-office',x,2.3],['bank-teller',x,1.5],['bank-consult',x,3.1,180]]),...(pitch>=1.95?xs.slice(0,-1).map((x,i)=>['partition-low',(x+xs[i+1])/2,2.3,90]):[]),['waiting-beam',1.25,d-1.4,180],['planter-tall',w-.6,d-.7]];},
  dress:c=>{c.top('nameplate','desk',3);c.top('business-card','desk',2);},
  people:{sit:[['banker',['consult','write'],['bank-teller'],6],['customer',['listen','read','write'],['bank-consult'],3]],fill:{type:'lounge',role:'customer'}}},
 'nursing-station':{extra:(w,d)=>[['desk-reception-small',w*.74,d-1.15],side('cabinet-medical',w,d,0),['cart-medical',[[w-.6,d*.56+1.2],[1.9,d-.5]]],['stand-iv',[[w-.5,d*.56+2],[2.7,d-.5]]]],dress:c=>{c.top('paper-tray','desk',2);}},
 'medical-office':{extra:(w,d)=>[side('bookshelf-filled',w,d,0,.42),side('cabinet-medical',w,d,2)],dress:c=>{c.top('book-stack','desk',2);}},
 'back-office':{extra:(w,d)=>[side('cabinet-files',w,d,0),side('cabinet-office-low',w,d,1)],dress:c=>{c.top('paper-tray','desk',2);}},
 'pc-cafe':{swap:{'office-mesh':'gaming-chair','library-chair':'gaming-chair',taskchair:'gaming-chair'},extra:(w,d)=>[side('snack-shelf',w,d,0,.42),side('snack-shelf',w,d,2,.42)],dress:c=>{c.top('cup-paper','desk',3);}},
 'k12-class':{extra:(w,d)=>[['locker-children',w-.4,d*.5,90],['locker-children',w-.4,d*.5+1.2,90]]},
 // ── meeting ──
 'boardroom':{extra:(w,d)=>[['cabinet-office-low',w-.45,d*.5,90],['planter-tall',.6,d-.7]],dress:c=>{c.top('water-pitcher','cabinet');c.top('cup-water','conference',4);c.top('cup-water','table',2);}},
 'briefing-room':{extra:(w,d)=>[['locker-changing',w-.45,d*.3,90],['locker-changing',w-.45,d*.3+1.3,90],['whiteboard-plain',.4,d*.5,270],['gym-bench',w*.5+1.7,d-.5]],dress:c=>{c.top('cup-paper','table',2);}},
 'training-room':{extra:(w,d)=>[['whiteboard-plain',.4,d*.4,270],['lectern-wood',.9,d*.4+1.4,270],['cabinet-office-low',w-.45,d*.55,90]],dress:c=>{c.top('book-open','table',2);c.top('catalog-paper','table',1);}},
  'pb-lounge':{swap:{chair:'bank-consult','meeting-sled':'bank-consult'},extra:(w,d)=>[['cabinet-showcase',w-.5,d*.5,90],['sofa-single',.75,d-.9,0]],dress:c=>{c.top('teapot-manual','table');c.top('cup-tea','table',2);c.top('vase-small','cabinet');}},
 'design-consult':{extra:(w,d)=>[['shelf-retail',w-.42,d*.4,90],['display-tier',.8,d-1,0],['rail-clothes',w-.5,d*.4+1.5,90]],dress:c=>{c.top('catalog-paper','table',2);}},
 'owner-office':{extra:(w,d)=>[['cabinet-files',w-.45,d*.4,90],['locker-office',w-.45,d*.4+1.2,90],['whiteboard-plain',.4,d*.5,270]],dress:c=>{c.top('paper-tray','table');c.top('desk-calendar','table');}},
 // ── bedroom ──
 'hotel-room':{seating:'near',plan:(w,d)=>[['bed-king',w*.36,1.32],['table-bedside',w*.36-1.3,.5],['table-bedside',w*.36+1.3,.5],['cabinet-hotel',w*.36,d-1.5,180],['desk',w-.6,d*.5,90],['taskchair',w-1.4,d*.5,270],['sofa-single',w-.75,1,270],['table-hotel-luggage',.5,d*.6,270],['cart-service',w*.7,d-.9,180]],
  dress:c=>{c.rug('rug-bedside',c.w*.36+1.35,1.6);c.floor('suitcase-pair',[[.55,c.d*.6+.85],[c.w-.7,c.d-.9]]);c.top('pillow-bed','bed');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['housekeeper',['push','inspect'],'cart-service','front']]}},
 'studio-apt':{seating:'near',plan:(w,d)=>[['bed-single',.75,1.3],['wardrobe-clothes',w-1,.5],['sofa-modular',w*.5,d-1.65,180],['table-nesting',w*.5,d-2.7],['desk-compact',w-.5,d*.5,90],['taskchair',w-1.25,d*.5,270],['cabinet-kitchen',2.4,.45],['bookshelf-filled',.42,d*.62,270]],
  dress:c=>{c.rug('rug-accent',c.w*.5,c.d-2.7);c.top('cup-mug','coffeetable');c.top('book-open','desk');},
  people:{fill:{type:'lounge',role:'customer'}}},
 'senior-room':{seating:'near',plan:(w,d)=>[['bed-care',.8,1.35],['table-bedside',1.7,.5],['care-highback',w*.55,d*.55,180],['table-side',w*.55+.75,d*.55],['walker-frame',1.75,1.6],['wardrobe-clothes',w-1,.5],['sofa-care',w-1.1,d-1.4,180],['cabinet-hotel',.45,d*.6,270]],
  dress:c=>{c.top('cup-lid','coffeetable');c.top('photo-frame','cabinet');},
  people:{fill:{type:'lounge',role:'patient'},stand:[['caregiver',['present','meal-tray'],'care-highback','side']]}},
 'barracks':{plan:(w,d)=>[['bed-bunk',.75,1.35],['bed-bunk',2.1,1.35],['bed-bunk',w-.75,1.35],['locker',w*.55,.45],['desk',w-.6,d*.6,90],['taskchair',w-1.4,d*.6,270],['gym-bench',1.3,d-.5],['locker',.45,d*.62,270]],
  dress:c=>{c.top('book-closed','desk');c.top('towels-folded','bench');},
  people:{fill:{type:'dorm',role:'student'}}},
 'dress-bedroom':{extra:(w,d)=>[['wardrobe-clothes',w-.55,d*.3,90],['coat-rack-loaded',w-.5,d*.3+1.9,90]]},
 // ── medical ──
 'operating-room':{seating:'near',plan:(w,d)=>[['operating-table',w*.45,d*.47],['instrument-stand',w*.45+1.15,d*.47+.35],['cart-medical',w*.45-1.3,d*.47-.5],['stand-iv',w*.45-1.1,d*.47+1],['cabinet-medical',.45,d*.3,270],['cabinet-medical',.45,d*.3+1,270],['table-exam',w-1,1],['taskchair',w-1,1.8,180],['clinic-stool',w*.45+1.2,d*.47-.7]],
  people:{fill:false,bed:['operating-table'],stand:[['dentist',['consult'],'operating-table','side'],['nurse',['inspect'],'instrument-stand','customer']]}},
 'hair-salon':{seating:'near',plan:(w,d)=>[...[1.25,2.85,4.45].flatMap(z=>[['salon-station',.36,z,270],['salon-chair',1.25,z,90]]),['salon-trolley',1.5,2.05],['salon-trolley',1.5,3.65],['sofa',w-1.4,d-1.4,180],['coffeetable',w-1.4,d-2.45],['shelf-retail',w-.42,d*.3,90],['stand-coat',w-.6,.6]],
  dress:c=>{c.top('catalog-paper','coffeetable');},
  people:{sit:[['customer',['read','listen'],['salon-chair'],2],['customer',['read','drink'],['sofa'],1]],fill:false,stand:[['retailer',['inspect'],'salon-chair','front'],['retailer',['inspect','present'],'salon-trolley','customer']]}},
 'treatment-room':{extra:(w,d)=>[['partition-care',w*.44,d*.36,90],['cart-medical',w-.6,d*.5],['stand-iv',.5,d*.36+1.5],['sofa-care',w-1.3,d-1.3,180]]},
 'care-room':{swap:{hospitalbed:'bed-care',cabinet:'cabinet-bedside'},extra:(w,d)=>[['care-highback',w-.9,d*.62,270],['walker-frame',w*.44,d*.36+1.4],['partition-care',w*.44,d*.3,90],['table-bedside',w-.6,.5]]},
 'ward-room':{extra:(w,d)=>[['partition-care',w*.44,d*.36,90],['stand-iv',.5,d*.36+1.45],['cart-medical',w-.6,d*.5],['table-bedside',w*.44+.5,.45]]},
 // ── fitness ──
 'gx-studio':{plan:(w,d)=>[['mirror-wall',.25,d*.42,270],['spin-bike',w*.4,1.2],['spin-bike',w*.4+1,1.2],['spin-bike',w*.4+2,1.2],['gym-dumbbell-rack',w-.45,d*.36,90],['gym-power-rack',w-1.2,d-1.6],['gym-bench-press',w*.5-1.2,d-1.95],['gym-ball',1,d-.7],['gym-ball',1.8,d-.7]],
  dress:c=>{c.rug('mat-yoga',1.7,c.d*.42);c.rug('mat-yoga',2.7,c.d*.42);c.rug('mat-yoga',3.7,c.d*.42);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['trainer',['present','inspect'],'spin-bike','front'],['trainer',['inspect','present'],'gym-dumbbell-rack','customer']]}},
 'spa-fitness':{plan:(w,d)=>[['treadmill',1,1.4],['spin-bike',2,1.2],['gym-power-rack',3.6,1.3],['massage-bed',w-.8,1.35],['towel-shelf',w-.42,d*.5,90],['gym-bench-press',w-1.3,d-1],['gym-dumbbell-rack',.45,d*.56,270],['gym-bench',1.3,d-.5]],
  dress:c=>{c.rug('mat-yoga',c.w*.5,c.d*.58);c.top('towels-folded','bench');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['trainer',['present','inspect'],'treadmill','customer'],['trainer',['inspect','present'],'towel-shelf','customer']]}},
 'locker-gym':{plan:(w,d)=>[['locker-changing',.45,d*.3,270],['locker-changing',.45,d*.3+1.3,270],['gym-bench',1.6,d*.4,90],['gym-power-rack',w-1.3,1.4],['gym-bench-press',w-1.3,d-1.7],['gym-dumbbell-rack',w*.5,.45],['towel-shelf',.42,d-1,270]],
  dress:c=>{c.top('towels-folded','bench');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['trainer',['present','inspect'],'gym-dumbbell-rack','customer']]}},
 'mess-gym':{seating:'near',plan:(w,d)=>[['gym-power-rack',1.3,1.3],['gym-bench-press',1.3,d-1.7],['gym-dumbbell-rack',w*.5,.45],['table-dining-four',w-1.2,d*.3],...around('training-stack',w-1.2,d*.3,1.35,.8,{n:2,s:2,cd:.52}),['table-dining-four',w-1.2,d*.3+2.3],...around('training-stack',w-1.2,d*.3+2.3,1.35,.8,{n:2,s:2,cd:.52})],
  people:{fill:{type:'dining',role:'customer'},stand:[['trainer',['present','inspect'],'gym-dumbbell-rack','customer']]}},
 'rehab-room':{extra:(w,d)=>[['massage-bed',w-.8,d*.45],['gym-ball',w-.7,d-.7],['walker-frame',w*.5,d*.5]]},
 // ── utility ──
 'telecom-room':{plan:(w,d)=>[['cable-tray-cabinet',.45,d*.42,270],['cable-drum',w-.8,d-.9],['tool-cart',w*.6,d*.6],['bench',w*.3,d-.5],['cabinet',.75,.45]],
  people:{fill:false,stand:[['technician',['service','inspect'],'cable-tray-cabinet','customer']]}},
 'rooftop-plant':{plan:(w,d)=>[['pipe-manifold',.35,d*.45,270],['barricade-a',w*.5,d-1.7],['tool-cart',w*.6,d*.6],['bench',1.3,d-.5],['cabinet',.75,.45],['safety-cone',w-.5,d-.5]],
  people:{fill:false,stand:[['technician',['inspect','service'],'pipe-manifold','customer']]}},
 'plant-room':{plan:(w,d)=>[['pipe-manifold',.35,d*.42,270],['water-tank',.8,d-.9],['water-tank',2,d-.9],['tool-cart',w*.62,d*.62],['cabinet',.75,.45],['bench',w-1.2,d-.5]],
  people:{fill:false,stand:[['technician',['inspect','service'],'pipe-manifold','customer']]}},
 'linen-room':{plan:(w,d)=>[['towel-shelf',.42,d*.3,270],['towel-shelf',.42,d*.3+1.1,270],['table-training-fold',w*.45,d*.62],['cart-service',w-.7,d*.62,90],['bench',1.3,d-.5],['cabinet',.75,.45]],
  dress:c=>{c.floor('laundry-basket-filled',[[c.w*.45-1.4,c.d*.62],[c.w-.6,c.d-.6]],2);c.top('towels-folded','table',2);},
  people:{fill:false,stand:[['housekeeper',['push','inspect'],'cart-service','front'],['laundry',['fold','inspect'],'table-training-fold','front']]}},
 'home-laundry':{plan:(w,d)=>[['wardrobe-clothes',.5,d*.36,270],['drying-rack',w*.5,d*.62],['shelf',.42,d-1.1,270],['bench',w-1.3,d-.5]],
  dress:c=>{c.floor('laundry-basket-filled',[[c.w*.5+1.2,c.d*.62],[1.3,c.d*.62]],1);c.top('towels-folded','bench');},
  people:{fill:false,stand:[['customer',['inspect','read'],'drying-rack','customer']]}},
 'coin-laundry':{seating:'near',plan:(w,d)=>[['table-training-fold',.5,d*.42,90],['bench',w*.5,d-1.55],['table-cafe-two',w-1,d-1.6],['cafe-metal',w-1.75,d-1.6,270],['shelf-magazine',.4,d-1.1,270]],
  dress:c=>{c.floor('laundry-basket-filled',[[1.3,c.d*.42],[c.w*.5+1.3,c.d-1.5]],2);c.top('towels-folded','table',1);},
  people:{fill:{type:'lounge',role:'customer'},stand:[['customer',['inspect','read'],'table-training-fold','front']]}},
 'fitting-room':{seating:'fixed',plan:(w,d)=>[['fitting-booth',.75,d*.3,270],['fitting-booth',.75,d*.3+1.4,270],['rail-clothes',w*.5,.5],['retail-mannequin',w-.6,d*.5],['sofa-single',w*.55,d*.6,270],['retail-fitting',w*.55-1.1,d*.6,90],['table-side',w*.55,d*.6-.85]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['retailer',['present','inspect'],'rail-clothes','customer']]}},
 'dressing-room':{seating:'near',plan:(w,d)=>[['vanity-station',.4,d*.3,270],['director-chair',1.2,d*.3,90],['vanity-station',.4,d*.3+1.5,270],['director-chair',1.2,d*.3+1.5,90],['coat-rack-loaded',w*.5,.5],['sofa',w-1.3,d-1.4,180],['coffeetable',w-1.3,d-2.45],['salon-trolley',1.6,d*.3+.75]],
  dress:c=>{c.top('cup-paper','coffeetable');},
  people:{sit:[['customer',['read','listen'],['director-chair'],2]],fill:{type:'lounge',role:'customer'},stand:[['retailer',['inspect'],'director-chair','front']]}},
 'locker-room':{seating:'near',plan:(w,d)=>[['locker-changing',.45,d*.25,270],['locker-changing',.45,d*.25+1.25,270],['locker-changing',.45,d*.25+2.5,270],['gym-bench',1.7,d*.36,90],['gym-bench',1.7,d*.36+1.7,90],['vanity-station',w-.4,d*.5,90],['director-chair',w-1.2,d*.5,270],['towel-shelf',w*.6,.42]],
  dress:c=>{c.top('towels-folded','bench',2);},
  people:{fill:{type:'lounge',role:'customer'}}},
 // ── kitchen ──
 'food-hall':{plan:(w,d)=>[['counter',w*.3,1.9],['produce-stand',w*.72,d*.42],['produce-stand',w*.3,d-1.5],['cabinet-bakery',w-.9,d-1.6,90],['shopping-cart',w*.68,d-1.7],['island',w*.72,1.15]],
  people:{fill:false,stand:[['chef',['present','inspect'],'counter','front'],['shopper',['inspect','rest'],'produce-stand','customer'],['shopper',['rest','inspect'],'shopping-cart','front']]}},
 'bakery-kitchen':{extra:(w,d)=>[['bread-display',w-.45,d*.5,90],['food-stock-shelf',w-.42,d*.5+1.9,90],['cart-service',1,d-.9]],
  people:{fill:false,stand:[['baker',['knead','present'],'island','front'],['baker',['present','knead'],'counter','front']]}},
 'dining-kitchen':{seating:'near',extra:(w,d)=>[['table-family-six',w-1.25,d*.36],...around('dining-arm',w-1.25,d*.36,1.8,.9,{n:2,s:2,cd:.58})],dress:c=>{c.top('dish-dinner','table',2);c.top('glass-wine','table',1);}},
 'commercial-kitchen':{swap:{stool:null,plant:null},extra:(w,d)=>[['food-stock-shelf',w-.42,d*.5,90],['cart-service',w-.7,d-1,90],['waste-sort',.75,d-.5],['cabinet-kitchen',w-.75,.45]],
  people:{fill:false,stand:[['chef',['stir','inspect','present'],'island','front'],['chef',['inspect','present'],'counter','front'],['waiter',['serve','inspect'],'cart-service','front']]}},
 // ── retail ──
 'bakery-display':{plan:(w,d)=>[['bread-display',.5,d*.3,270],['bread-display',.5,d*.3+1.7,270],['cabinet-bakery',w*.42,d*.5],['cabinet-bakery',w*.42+1.5,d*.5],['counter',w-1.5,1.75],['table-side',w*.42-1.1,d*.5],['plant',w-.7,d-.7]],
  dress:c=>{c.top('tray-rect','coffeetable');c.top('cup-paper','counter');},
  people:{fill:false,stand:[['baker',['present','knead'],'counter','front'],['shopper',['inspect','rest'],'cabinet-bakery','customer'],['customer',['inspect','menu'],'bread-display','customer']]}},
 'model-house':{seating:'near',plan:(w,d)=>[['scale-model-table',w*.42,d*.42],['table-huddle',w-1.3,d-1.6],...around('visitor-cantilever',w-1.3,d-1.6,1.6,.8,{n:2,s:1,cd:.57}),['shelf-magazine',.4,d*.42,270],['display-tier',w-.8,1],['planter-tall',.6,.6],['planter-tall',.6,d-.7]],
  dress:c=>{c.top('catalog-paper','table',2);},
  people:{fill:{type:'meeting',role:'customer'},stand:[['designer',['present'],'scale-model-table','customer'],['customer',['inspect','read'],'scale-model-table','customer']]}},
 'souvenir-shop':{seating:'near',plan:(w,d)=>[['souvenir-stand',w*.3,d*.4],['souvenir-stand',w*.3+1.3,d*.4],['retail-shelf-filled',.42,d*.3,270],['retail-shelf-filled',.42,d*.3+1.4,270],['counter',w-1.5,1.75],['table-cafe-round',w-1.2,d-1.6],...around('cafe-bentwood',w-1.2,d-1.6,.65,.65,{e:1,west:1}),['display-tier',1.5,d-1.1]],
  dress:c=>{c.top('cup-paper','roundtable');},
  people:{fill:{type:'lounge',role:'customer'},stand:[['retailer',['inspect','serve'],'counter','front'],['shopper',['inspect','rest'],'souvenir-stand','customer']]}},
 'telco-store':{plan:(w,d)=>[['experience-table',w*.4,d*.36],['experience-table',w*.4,d*.36+1.9],['shelf-retail',.42,d*.4,270],['display-tier',w-.8,d*.5,90],['stool',w*.4+1.6,d*.36+.95],['planter-tall',w-.6,.6]],
  people:{fill:false,stand:[['retailer',['present','point-left'],'experience-table','front'],['shopper',['inspect','rest'],'experience-table','customer'],['customer',['inspect','read'],'display-tier','customer']]}},
 'appliance-zone':{seating:'near',plan:(w,d)=>[['display-tier',w*.3,d*.4],['display-tier',w*.3+1.6,d*.4],['experience-table',w*.4,d-1.7],['sofa-modular',w-1.1,d*.55,90],['table-side',w-1.1,d*.55-1.2],['shelf-magazine',.4,d*.5,270],['planter-tall',w-.6,.6]],
  people:{fill:{type:'lounge',role:'customer'},stand:[['retailer',['present','point-left'],'display-tier','customer'],['shopper',['inspect','rest'],'experience-table','customer']]}},
 'mart-aisle':{plan:(w,d)=>[['gondola-shelf',w*.26,d*.36,90],['gondola-shelf',w*.5,d*.36,90],['gondola-shelf',w*.74,d*.36,90],['display-tier',w*.3,d-1.4],['shopping-cart',w*.38,d*.42],['shopping-cart',w*.72,d-1.5],['snack-shelf',w-.42,d-1.3,90]],
  people:{fill:false,stand:[['shopper',['rest','inspect'],'shopping-cart','front'],['shopper',['inspect','rest'],'display-tier','customer'],['retailer',['inspect','present'],'gondola-shelf','customer']]}},
 'fashion-store':{plan:(w,d)=>[['rail-clothes',.5,d*.3,270],['rail-clothes',.5,d*.3+1.4,270],['retail-mannequin',w*.3,1],['retail-mannequin',w*.3+.8,1],['display-tier',w*.45,d*.5],['counter',w-1.5,d-1.6,180],['retail-shelf-filled',w-.42,d*.3,90],['retail-mannequin',w*.72,d*.5]],
  people:{fill:false,stand:[['retailer',['inspect','present'],'counter','front'],['shopper',['inspect','rest'],'display-tier','customer'],['shopper',['rest','inspect'],'rail-clothes','customer']]}},
 // ── warehouse-kind ──
 'fresh-market':{plan:(w,d)=>[['produce-stand',w*.34,d*.42],['produce-stand',w*.72,d*.42],['counter',w*.3,d-1.6],['food-stock-shelf',.42,1.2,270],['food-stock-shelf',.42,2.6,270],['shopping-cart',w*.53,d*.42+1.3]],
  people:{fill:false,stand:[['shopper',['rest','inspect'],'shopping-cart','front'],['retailer',['inspect','present'],'produce-stand','customer']]}},
 'cleanroom':{seating:'near',plan:(w,d)=>[['table-lab',w*.3,d*.3],['drafting-chair',w*.3,d*.3+.85,180],['table-lab',w*.7,d*.3],['drafting-chair',w*.7,d*.3+.85,180],['table-lab',w*.3,d*.3+2.45],['drafting-chair',w*.3,d*.3+3.3,180],['coat-rack-loaded',w-.5,d-1.3,90],['cabinet-medical',.45,d*.62,270]],
  dress:c=>{c.top('lab-glassware','table',2);},
  people:{fill:false,stand:[['researcher',['inspect','present'],'table-lab','front'],['researcher',['present','inspect'],'coat-rack-loaded','customer']]}},
 'assembly-line':{plan:(w,d)=>[['roller-conveyor',w*.36,Math.max(3.25,d*.52)],['roller-conveyor',w*.36+2.5,Math.max(3.25,d*.52)],['table-workbench',w*.3,1],['industrial-chair',w*.3,1.78,180],['table-workbench',w*.3+2.3,1],['industrial-chair',w*.3+2.3,1.78,180],['roll-cage',w-.7,d-1.1],['tool-cart',.7,d-.8]],
  people:{fill:false,stand:[['worker',['inspect','carry'],'roller-conveyor','customer'],['inspector',['inspect','present'],'roller-conveyor','customer'],['worker',['carry','inspect'],'roll-cage','customer']]}},
 'lab':{dress:c=>{c.top('lab-glassware','desk',3);}},
 'art-storage':{plan:(w,d)=>[['painting-rack',1.2,1.1],['painting-rack',1.2,d*.55],['art-crate-stack',w-1,d-1.2],['table-lab',w*.62,d*.45],['cabinet',w-.75,.45],['desk',w-.6,d*.36,90],['taskchair',w-1.4,d*.36,270]],
  people:{fill:false,stand:[['researcher',['inspect','present'],'table-lab','front'],['researcher',['present','inspect'],'painting-rack','customer']]}},
 'cold-warehouse':{plan:(w,d)=>[['rack-warehouse',1.4,.75],['rack-warehouse',1.4,d*.5],['food-stock-shelf',w-.42,d*.3,90],['carton-pallet',w*.6,d*.3],['pallet-jack',w*.6,d*.3+1.5],['desk',w-.6,d-1.4,90],['taskchair',w-1.4,d-1.4,270]],
  people:{fill:false,stand:[['coldstore',['carry','inspect'],'pallet-jack','front'],['coldstore',['inspect','carry'],'rack-warehouse','customer']]}},
 'shipping-dock':{plan:(w,d)=>[['rack-warehouse',1.4,.75],['roller-conveyor',w*.6,d*.42],['roll-cage',w*.6-1.9,d*.42],['roll-cage',w-.7,d*.42+1.2],['carton-pallet',1,d*.5],['pallet-jack',2.1,d*.62],['desk',w-.6,1.1,90],['taskchair',w-1.4,1.1,270]],
  people:{fill:false,stand:[['worker',['carry','inspect'],'roller-conveyor','customer'],['courier',['push','carry'],'pallet-jack','front'],['inspector',['inspect','present'],'roll-cage','customer']]}},
};
export const SPACE_CHARACTERS=Object.keys(C);
export const characterDefinition=room=>room?.character&&C[room.character]||null;

/** Furniture plan in normalized room coordinates, or null to keep the profile's plan. */
// An entry is [kind,x,z,rotation] or [kind,[[x,z,rotation],…]] — the first spot that fits is used.
const normalized=(room,list)=>list.map(([kind,x,z,rotation=0])=>Array.isArray(x)?[kind,x.map(([ax,az,ar=0])=>[ax/room.width,az/room.depth,ar])]:[kind,x/room.width,z/room.depth,rotation]);
export function characterPlan(room){
 const def=characterDefinition(room);if(!def?.plan)return null;
 const list=def.plan(room.width,room.depth,room); // null: this size or seat count keeps the profile's plan
 return list&&normalized(room,list);
}
/** Furnishings added after the profile's own plan (skipped where they do not fit). */
export function characterExtras(room){
 const def=characterDefinition(room);if(!def?.extra)return [];
 return normalized(room,def.extra(room.width,room.depth,room));
}
/** A character may swap a generic piece for its own (null removes it). */
export function characterSwap(kind,room){
 const swap=characterDefinition(room)?.swap;
 return swap&&Object.hasOwn(swap,kind)?swap[kind]:kind;
}
export const characterSeating=room=>characterDefinition(room)?.seating||null;
/** Seats of a room whose seat count was not given (an executive room is for one person). */
export const characterCapacity=room=>characterDefinition(room)?.capacity;
/**
 * A room added by name, without a template: it gets the current composition when a character applies to that name,
 * and keeps the earlier generic layout otherwise.
 */
export function namedRoomComposition(name,kind,industry){
 return spaceCharacter({name,kind,layoutCompositionVersion:SPACE_CHARACTER_VERSION},industry)?{layoutCompositionVersion:SPACE_CHARACTER_VERSION}:{};
}
export const characterPeople=room=>characterDefinition(room)?.people||null;

/** Props placed after the products, so they never take a product's place. */
// Seats that stand on their own in a room whose other seats belong to tables.
const FREE_SEATS=new Set(['furniture:wheelchair-manual','furniture:director-chair']);
export function dressCharacter(scene,room,assets,canPlace){
 const def=characterDefinition(room);if(!def)return;
 // A table that did not fit a smaller room takes its chairs with it.
 if(def.seating==='near')scene.objects=scene.objects.filter(o=>o.roomId!==room.id||!['chair','stool'].includes(assets[o.assetId]?.kind)||o.facing?.targetId||FREE_SEATS.has(o.assetId));
 if(!def.dress)return;
 let serial=0;
 const id=()=>{let value;do value=`${room.id}-c${serial++}`;while(scene.objects.some(o=>o.id===value));return value;};
 const asset=name=>{const found=assets['furniture:'+name];if(!found)throw new Error('공간 소품을 찾을 수 없습니다: '+name);return found;};
 const inRoom=()=>scene.objects.filter(o=>o.roomId===room.id);
 const hosts=key=>inRoom().filter(o=>!o.autoDressing&&(o.assetId==='furniture:'+key||assets[o.assetId].kind===key));
 const put=object=>{if(!canPlace(object,room,scene.objects,assets))return false;scene.objects.push(object);return true;};
 const c={w:room.width,d:room.depth,
  floor(name,spots,max=1){const a=asset(name);let n=0;for(const [x,z,rotation=0]of spots){if(n>=max)break;
   if(put({id:id(),assetId:a.id,roomId:room.id,x:round(room.x+x),z:round(room.z+z),elevation:0,rotation,autoDressing:true}))n++;}},
  rug(name,x,z,rotation=0){const a=asset(name),hw=(rotation%180?a.size[2]:a.size[0])/2,hd=(rotation%180?a.size[0]:a.size[2])/2;
   if(x-hw<.14||z-hd<.14||x+hw>room.width-.14||z+hd>room.depth-.14)return;
   if(inRoom().some(o=>assets[o.assetId].kind==='rug'&&Math.abs(o.x-room.x-x)<(assets[o.assetId].size[0]+a.size[0])/2&&Math.abs(o.z-room.z-z)<(assets[o.assetId].size[2]+a.size[2])/2))return;
   scene.objects.push({id:id(),assetId:a.id,roomId:room.id,x:round(room.x+x),z:round(room.z+z),elevation:0,rotation,autoDressing:true});},
  // A surface prop on up to `max` different hosts of an asset name or kind. On a work desk it takes a corner,
  // so the person who works there still has room for the hands.
  top(name,key,max=1){const a=asset(name);if(a.placement?.mode!=='surface')throw new Error('상판에 올리는 소품이 아닙니다: '+name);let n=0;
   for(const host of hosts(key)){if(n>=max)break;const sa=assets[host.assetId];
    if(!a.placement.supports.includes(sa.supportSurface||sa.kind))continue;
    const angle=(host.rotation||0)*Math.PI/180;
    const slots=sa.kind==='desk'?[[-.34,-.22],[.34,-.22],[-.34,.22],[.34,.22],[0,-.3]]:[[0,0],[-.28,-.25],[.28,-.25],[-.28,.25],[.28,.25],[0,-.3],[0,.3],[-.34,0],[.34,0]];
    for(const [nx,nz]of slots){const x=nx*sa.size[0],z=nz*sa.size[2];
     const object={id:id(),assetId:a.id,roomId:room.id,x:round(host.x+x*Math.cos(angle)-z*Math.sin(angle)),z:round(host.z+x*Math.sin(angle)+z*Math.cos(angle)),rotation:host.rotation||0,elevation:round(detailSurfaceHeight(a,host,sa)),supportId:host.id,mount:'surface',autoDressing:true};
     if(detailSupportError(object,scene,assets)||object.elevation+a.size[1]>room.height-.02||!canPlace(object,room,scene.objects,assets))continue;
     scene.objects.push(object);n++;break;}
   }},
  // An elevated piece above every host (a parasol canopy over its table).
  over(name,key,elevation){const a=asset(name);for(const host of hosts(key))put({id:id(),assetId:a.id,roomId:room.id,x:host.x,z:host.z,elevation,rotation:0,autoDressing:true});},
  // A piece standing on the first stage, dx/dz from the stage centre.
  onStage(name,key,dx=0,dz=0){const a=asset(name),stage=hosts(key)[0];if(!stage)return;const top=assets[stage.assetId].size[1];
   put({id:id(),assetId:a.id,roomId:room.id,x:round(stage.x+dx),z:round(stage.z+dz),elevation:round(top+.005),rotation:0,supportId:stage.id,autoDressing:true});},
 };
 def.dress(c,room);
}
const round=n=>Math.round(n*10000)/10000+0;
