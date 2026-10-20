// Original stylized profession vignettes. Furniture, tools and people are one movable asset.
// Recipe coordinates are metres; the library builder measures their actual combined envelope.
import {peopleAppearance,peopleCostumeParts} from './people-costumes.js';
const B=(x,y,z,w,h,d,material,extra={})=>({shape:'box',position:[x,y,z],size:[w,h,d],material,cornerRadius:.012,...extra});
const S=(x,y,z,rx,ry,rz,material)=>({shape:'sphere',position:[x,y,z],size:[rx,ry,rz],material});
const C=(x,y,z,r,h,material,extra={})=>({shape:'cylinder',position:[x,y,z],size:[r,h,r],material,...extra});
const clamp=(x,a=-1,b=1)=>Math.max(a,Math.min(b,x));
function rotate([x,y,z],[rx=0,ry=0,rz=0]){
  [x,y]=[x*Math.cos(rz)-y*Math.sin(rz),x*Math.sin(rz)+y*Math.cos(rz)];
  [x,z]=[x*Math.cos(ry)+z*Math.sin(ry),-x*Math.sin(ry)+z*Math.cos(ry)];
  return [x,y*Math.cos(rx)-z*Math.sin(rx),y*Math.sin(rx)+z*Math.cos(rx)];
}
function quaternion([x=0,y=0,z=0]){
  const [a,b,c]=[x/2,y/2,z/2],[c1,c2,c3,s1,s2,s3]=[Math.cos(a),Math.cos(b),Math.cos(c),Math.sin(a),Math.sin(b),Math.sin(c)];
  return [s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3];
}
function combine(parent,child){
  const [a,b,c,d]=quaternion(parent),[e,f,g,h]=quaternion(child),x=d*e+a*h+b*g-c*f,y=d*f-a*g+b*h+c*e,z=d*g+a*f-b*e+c*h,w=d*h-a*e-b*f-c*g;
  const m11=1-2*(y*y+z*z),m12=2*(x*y-z*w),m13=2*(x*z+y*w),m22=1-2*(x*x+z*z),m23=2*(y*z-x*w),m32=2*(y*z+x*w),m33=1-2*(x*x+y*y);
  return Math.abs(m13)<.9999999?[Math.atan2(-m23,m33),Math.asin(clamp(m13)),Math.atan2(-m12,m11)]:[Math.atan2(m32,m22),Math.asin(clamp(m13)),0];
}
function transform(parts,{x=0,y=0,z=0,angle=0,tilt=0,scale=1}={}){
  const rotation=[tilt,angle,0];
  return parts.map(part=>{const position=rotate(part.position.map(n=>n*scale),rotation);return {...part,position:[position[0]+x,position[1]+y,position[2]+z],size:part.size.map(n=>n*scale),...(part.cornerRadius?{cornerRadius:part.cornerRadius*scale}:{}),...(part.profile?{profile:part.profile.map(p=>[...p])}:{}),rotate:combine(rotation,part.rotate||[0,0,0])};});
}
function segment(from,to,r,material){
  const [dx,dy,dz]=to.map((n,i)=>n-from[i]),length=Math.hypot(dx,dy,dz);
  return C(...from.map((n,i)=>(n+to[i])/2),r,length,material,{rotate:[Math.atan2(dz,dy),0,-Math.atan2(dx,Math.hypot(dy,dz))]});
}
const cues={doctor:['흰 진료복','청진기','명찰'],nurse:['스크럽 유니폼','의료 캡','기록지'],patient:['환자복','손목 띠'],teacher:['수업 자료','수업·지도 동작'],lecturer:['강연 자료','강연대·설명 동작'],student:['교재·필기구','학생용 책상·착석'],office:['업무복','문서·데스크'],presenter:['재킷','발표 자료·손짓'],barista:['앞치마','컵·서빙대'],chef:['높은 조리 모자','조리복·볼'],waiter:['앞치마','서빙 트레이'],receptionist:['정장형 유니폼','명찰·리셉션'],housekeeper:['작업 앞치마','리넨 카트'],concierge:['접객 재킷','수하물 카트'],retailer:['매장 앞치마','명찰·진열대'],shopper:['쇼핑 바구니','상품·상담 동작'],worker:['안전모','반사 조끼·작업대'],inspector:['안전모','기록판·작업대'],courier:['작업복','상자·운반 카트'],banker:['정장·넥타이','창구·상담 서류'],clerk:['명찰','민원 서류·창구'],customer:['서류','상담·대기 좌석'],guide:['안내 조끼·명찰','지도·비전원 안내대'],security:['제복형 모자','안내 차단봉'],cleaner:['작업복','밀대·청소 카트'],trainer:['운동복','매트·운동 동작'],performer:['공연복','악보대·지휘봉'],designer:['샘플 보드','상담 테이블'],caregiver:['케어 유니폼','보행 보조·휠체어']};
const roleNames={doctor:'의사',nurse:'간호사',patient:'환자',teacher:'선생님',lecturer:'강연자',student:'학생',office:'사무직 직원',presenter:'발표자',barista:'바리스타',chef:'조리사',waiter:'서빙 직원',receptionist:'호텔 리셉션 직원',housekeeper:'객실 정비 직원',concierge:'호텔 컨시어지',retailer:'매장 직원',shopper:'쇼핑 고객',worker:'현장 작업자',inspector:'검사 담당자',courier:'물류 직원',banker:'금융 상담사',clerk:'민원 담당자',customer:'이용 고객',guide:'안내 직원',security:'안전 안내 직원',cleaner:'환경 정비 직원',trainer:'운동 지도자',performer:'공연 진행자',designer:'공간 디자이너',caregiver:'돌봄 담당자'};
Object.assign(cues,{librarian:['도서관 업무 조끼','안경·목걸이 명찰','도서'],researcher:['흰 실험 가운','보호 안경·장갑','비전원 실험 도구'],pharmacist:['녹색 표식 가운','안경·약품 보관 선반'],dentist:['치과 스크럽','의료 마스크','진료 도구'],baker:['베이커 모자','포켓 앞치마','빵·반죽'],artist:['베레모','물감 앞치마','붓·팔레트'],gardener:['넓은 챙 작업 모자','작업 장갑','화분·수공구'],mechanic:['작업복','보호 안경·공구 벨트','수공구']});
Object.assign(roleNames,{librarian:'사서',researcher:'연구원',pharmacist:'약사',dentist:'치과 의료진',baker:'제빵사',artist:'미술 강사',gardener:'정원 관리사',mechanic:'정비사'});
function actor(role,options={}){
  const {pose='stand',action='rest',variant=0,scale=1,x=0,z=0,y=0,angle=0,tilt=0}=options;
  const appearance=peopleAppearance(role,options),{shirt,skin,pants,hair}=appearance;
  const seated=pose==='sit',hip=seated?.58:.9,chest=seated?.86:1.2,head=seated?1.27:1.62,shoulder=chest+.16;
  const out=[B(0,chest,0,.36,.45,.23,shirt,{cornerRadius:.055,clothingType:appearance.style}),B(0,hip,0,.33,.17,.26,pants,{cornerRadius:.04}),C(0,head-.17,0,.045,.1,skin),S(0,head,0,.095,.125,.09,skin),S(0,head+.077,-.02,.096,.06,.086,hair),S(0,head-.01,.093,.017,.025,.022,skin)];
  for(const sx of [-1,1]){
    out.push(S(sx*.033,head+.016,.083,.008,.007,.007,'#26312d'));
    const a=[sx*.1,hip-.02,0],knee=seated?[sx*.11,.49,.31]:[sx*.11,.48,.02],ankle=seated?[sx*.11,.095,.32]:[sx*.12,.095,.03];
    out.push(segment(a,knee,.063,pants),segment(knee,ankle,.051,pants),B(ankle[0],.055,ankle[2]+.065,.115,.095,.22,role==='patient'?'#d4e1df':'#303937',{cornerRadius:.025}));
  }
  let left=[[-.26,chest-.12,.04],[-.23,hip+.08,.08]],right=[[.26,chest-.12,.04],[.23,hip+.08,.08]];
  if(['write','desk','read','consult','listen'].includes(action)){
    left=[[-.25,chest-.1,.18],[-.13,seated?.79:1.03,.43]];right=[[.27,chest-.1,.19],[.16,seated?.79:1.03,.46]];
    if(action==='read'){left[1]=[-.12,chest-.01,.36];right[1]=[.12,chest-.01,.36];}
    if(action==='consult')right[1]=[.33,chest+.04,.4];
  }else if(action==='raise'){left=[[-.25,chest-.1,.18],[-.13,.79,.43]];right=[[.28,shoulder+.16,.04],[.2,shoulder+.47,.04]];}
  else if(action==='point-left'){left=[[-.35,shoulder-.06,.16],[-.63,shoulder+.03,.3]];}
  else if(['point','present'].includes(action)){right=[[.35,shoulder-.06,.16],[.63,shoulder+.03,.3]];left=[[-.28,chest-.1,.12],[-.17,chest-.04,.29]];}
  else if(action==='examine'){right=[[.28,1.12,.3],[.1,.91,.72]];}
  else if(action==='board'){right=[[.3,1.46,.28],[.22,1.64,.61]];left=[[-.25,1.05,.05],[-.2,1.0,.13]];}
  else if(action==='board-low'){right=[[.33,1.24,.26],[.25,1.25,.61]];}
  else if(['carry','serve','push','meal-tray'].includes(action)){left=[[-.28,1.11,.2],[-.22,1.02,.55]];right=[[.28,1.11,.2],[.22,1.02,.55]];}
  else if(['eat','chopsticks','snack','drink'].includes(action)){
    left=[[-.27,chest-.08,.22],[-.16,seated?.82:1.06,.45]];
    right=[[.31,chest-.03,.28],[.14,head-(action==='drink'?.1:.075),action==='drink'?.23:.22]];
  }
  else if(action==='menu'){left=[[-.26,chest-.06,.18],[-.13,chest+.02,.33]];right=[[.26,chest-.06,.18],[.13,chest+.02,.33]];}
  else if(action==='stir'){left=[[-.27,chest-.02,.25],[-.17,.99,.51]];right=[[.29,1.2,.2],[.12,1.08,.55]];}
  else if(action==='knead'){left=[[-.27,1.13,.24],[-.13,.95,.55]];right=[[.27,1.13,.24],[.13,.95,.55]];}
  else if(action==='draw'){left=[[-.25,chest-.08,.2],[-.16,seated?.8:1.03,.45]];right=[[.3,chest+.02,.2],[.18,chest+.04,.46]];}
  else if(action==='water'){left=[[-.27,chest-.08,.1],[-.23,chest-.2,.14]];right=[[.32,chest-.03,.23],[.42,chest-.17,.46]];}
  else if(action==='stretch'){left=[[-.36,shoulder+.2,0],[-.26,shoulder+.45,0]];right=[[.36,shoulder+.2,0],[.26,shoulder+.45,0]];}
  else if(action==='inspect'){left=[[-.25,1.12,.15],[-.12,1.13,.32]];right=[[.3,1.18,.13],[.1,1.19,.36]];}
  for(const [side,points]of [[-1,left],[1,right]]){
    const start=[side*.2,shoulder,0];out.push(segment(start,points[0],.048,shirt),segment(points[0],points[1],.037,['coat','jacket','coveralls'].includes(appearance.style)?shirt:skin),S(...points[1],.042,.045,.038,appearance.accessories.includes('gloves')?'#d8ded0':skin));
  }
  out.push(...peopleCostumeParts(appearance,{B,S,C,segment,head,chest,hip,right}));
  if(action==='write')out.push(segment([.16,seated?.79:1.03,.46],[.12,seated?.755:1.0,.57],.006,'#d7a45e'));
  if(action==='board'||action==='board-low'){const hand=right[1];out.push(segment(hand,[hand[0],hand[1],.66],.006,'#f5f3db'));}
  if(action==='point-left')out.push(segment(left[1],[-.79,shoulder+.12,.68],.006,'wood'));
  if(['present','point'].includes(action))out.push(segment(right[1],[.79,shoulder+.12,.68],.006,'wood'));
  if(action==='read')out.push(B(0,chest-.02,.4,.25,.018,.18,'#e7e3d7',{rotate:[.35,0,0]}));
  if(['inspect','consult'].includes(action))out.push(B(-.03,seated?.88:1.16,.36,.2,.025,.27,'#ae8d62',{rotate:[.5,0,0]}),B(-.03,seated?.895:1.175,.365,.17,.012,.23,'#eeeae0',{rotate:[.5,0,0]}));
  if(action==='carry')out.push(B(0,1.05,.5,.43,.32,.33,'#b39162'),B(0,1.214,.5,.05,.006,.33,'#ddd3b5'));
  if(action==='serve')out.push(B(0,1.025,.55,.48,.025,.34,'#b09670'),C(-.11,1.08,.53,.037,.085,'#f2eee3'),C(.1,1.052,.58,.065,.012,'#f2eee3'));
  if(action==='meal-tray')out.push(...props('lunchtray',{y:1.025,z:.55}));
  if(action==='eat')out.push(segment(right[1],[.025,head-.066,.125],.006,'#a6b1b0'),S(.024,head-.066,.127,.018,.007,.012,'#d3b974'));
  if(action==='chopsticks')for(const dx of [0,.017])out.push(segment([right[1][0]+dx,right[1][1]+.045,right[1][2]+.04],[.025+dx,head-.07,.125],.0035,'#a38a60'));
  if(action==='drink')out.push(...props('cup',{x:.075,y:head-.14,z:.165}));
  if(action==='snack')out.push(B(.095,head-.09,.16,.105,.065,.075,'#cfac6f'),B(.095,head-.088,.199,.1,.018,.008,'#7a9360'));
  if(action==='menu')out.push(B(0,chest+.05,.35,.28,.29,.018,'#766851'),B(0,chest+.05,.364,.25,.26,.006,'#eee3cd'),...[-.04,.02,.08].map(dy=>B(0,chest+dy,.37,.19,.009,.004,'#ab9574')));
  if(action==='stir')out.push(segment(right[1],[.04,.98,.61],.008,'#a38a60'));
  if(action==='draw')out.push(segment(right[1],[.22,chest+.075,.55],.006,'#ba9b63'));
  if(action==='water')out.push(...props('wateringcan',{x:.42,y:chest-.29,z:.46}));
  return transform(out.map(part=>({...part,component:'person',role})),{x,y,z,angle,tilt,scale});
}
function furniture(type,{x=0,z=0,y=0,angle=0,w,d,h,style='standard'}={}){
  let out=[];
  if(type==='chair'||type==='wheelchair'){
    out=[B(0,.46,0,.47,.075,.48,'#597b86'),B(0,.7,-.21,.46,.43,.065,'#597b86'),...[-.18,.18].flatMap(px=>[-.17,.17].map(pz=>B(px,.22,pz,.035,.44,.035,'#6d777b')))];
    if(type==='wheelchair')out.push(...[-.3,.3].map(px=>C(px,.32,0,.3,.045,'#33424a',{rotate:[0,0,Math.PI/2]})),B(0,.08,.35,.46,.04,.2,'#7d898d'),B(-.25,.7,0,.035,.035,.48,'#7d898d'),B(.25,.7,0,.035,.035,.48,'#7d898d'));
    if(type==='chair'&&style==='wood'){out=out.map(p=>({...p,material:p.material==='#597b86'?'#bc9c70':'#8d8068'}));out.push(B(-.21,.65,0,.035,.035,.43,'#bc9c70'),B(.21,.65,0,.035,.035,.43,'#bc9c70'));}
    if(type==='chair'&&style==='cafe')out=out.map(p=>({...p,material:p.material==='#597b86'?'#b08763':'#576969'}));
  }else if(type==='sofa'){
    out=[B(0,.36,0,1.55,.27,.67,'#b3b9a0'),B(0,.68,-.27,1.55,.62,.15,'#9ea98e'),B(-.77,.54,0,.16,.43,.7,'#9ea98e'),B(.77,.54,0,.16,.43,.7,'#9ea98e'),B(-.53,.105,0,.065,.18,.45,'#817864'),B(.53,.105,0,.065,.18,.45,'#817864')];
  }else if(type==='easel'){
    out=[B(0,1.18,0,.72,.85,.045,'#b59b75'),B(0,1.18,-.03,.65,.77,.015,'#eee5d4'),B(0,.73,-.045,.85,.045,.12,'#a28b66'),B(-.27,.38,0,.04,.73,.045,'#a28b66'),B(.27,.38,0,.04,.73,.045,'#a28b66'),B(0,.35,.23,.04,.7,.04,'#a28b66',{rotate:[.5,0,0]}),S(-.12,1.23,-.044,.14,.11,.006,'#91a78a'),B(.12,1.06,-.044,.17,.19,.008,'#bda078')];
  }else if(['desk','table','counter','lectern','workbench'].includes(type)){
    w??=type==='lectern'?.68:type==='counter'?1.75:1.2;d??=type==='lectern'?.5:.65;h??=type==='counter'?1.05:type==='workbench'?.9:type==='lectern'?1.1:.74;
    out=[B(0,h-.025,0,w,.05,d,'#c2a680'),...[-w*.42,w*.42].flatMap(px=>[-d*.39,d*.39].map(pz=>B(px,(h-.05)/2,pz,.045,h-.05,.045,'#66747a')))];
    if(type==='counter'||type==='lectern')out.push(B(0,h*.48,-d*.32,w*.94,h*.86,.055,'#b39979'));
  }else if(type==='board'){
    out=[B(0,1.2,0,w||1.65,1.1,.07,'#4c6659'),B(0,1.2,-.042,(w||1.65)-.07,1.03,.015,'#315d4d'),B(0,.64,-.06,(w||1.65)+.05,.035,.15,'#b39b76'),B(-.65,.34,0,.04,.68,.07,'#73827f'),B(.65,.34,0,.04,.68,.07,'#73827f'),B(-.65,.04,0,.12,.06,.5,'#73827f'),B(.65,.04,0,.12,.06,.5,'#73827f')];
    for(let i=0;i<5;i++)out.push(B(-.32+i*.16,1.48-i*.065,-.054,.12,.009,.004,'#e4e4cf'));
    out.push(B(.36,1.12,-.055,.25,.28,.006,'#3b725c'));
  }else if(type==='bed'){
    out=[B(0,.36,0,1,.28,2.02,'#92a9ae'),B(0,.55,0,.94,.14,1.92,'#e6e6df'),B(0,.62,-.74,.58,.08,.37,'#f1eee1'),B(0,.92,-1.0,1.04,.57,.055,'#81999f'),B(0,.58,1.0,1.04,.26,.055,'#81999f'),...[-.46,.46].map(px=>B(px,.72,.1,.025,.035,1.3,'#829296')),...[-.4,.4].flatMap(px=>[-.8,.8].map(pz=>C(px,.13,pz,.07,.04,'#38464d',{rotate:[0,0,Math.PI/2]})))];
  }else if(type==='trolley'){
    out=[...[-.32,.32].flatMap(px=>[-.26,.26].map(pz=>B(px,.5,pz,.03,.93,.03,'#7e8b88'))),B(0,.26,0,.68,.035,.58,'#c5b294'),B(0,.66,0,.68,.035,.58,'#c5b294'),B(0,1.02,-.27,.69,.035,.035,'#6a777c'),...[-.3,.3].flatMap(px=>[-.24,.24].map(pz=>C(px,.06,pz,.05,.035,'#35434a',{rotate:[0,0,Math.PI/2]})))];
  }else if(type==='shelf'){
    out=[B(-.44,.78,0,.045,1.55,.4,'#bca27d'),B(.44,.78,0,.045,1.55,.4,'#bca27d'),...Array.from({length:4},(_,i)=>B(0,.13+i*.44,0,.9,.035,.42,'#bca27d'))];
    for(let i=0;i<5;i++)out.push(B((i%3-1)*.23,.25+Math.floor(i/3)*.44,0,.16,.21,.24,i%2?'#d9d2bf':'#ba956a'));
  }else if(type==='stool')out=[C(0,.52,0,.2,.07,'#b8aa90'),C(0,.26,0,.025,.48,'#748283'),C(0,.035,0,.24,.04,'#748283')];
  else if(type==='bench')out=[B(0,.46,0,1.4,.07,.48,'#a8b8b7'),B(0,.73,-.21,1.4,.38,.05,'#a8b8b7'),B(-.52,.22,0,.05,.44,.06,'#6e7c82'),B(.52,.22,0,.05,.44,.06,'#6e7c82')];
  else if(type==='mat')out=[B(0,.018,0,.7,.025,1.85,'#86a0a4')];
  else if(type==='barrier')out=[C(-.45,.48,0,.03,.91,'#879393'),C(.45,.48,0,.03,.91,'#879393'),C(-.45,.025,0,.14,.035,'#879393'),C(.45,.025,0,.14,.035,'#879393'),B(0,.82,0,.9,.045,.03,'#71624e')];
  else if(type==='musicstand')out=[C(0,.53,0,.016,.98,'#56676a'),B(0,1.04,0,.48,.34,.025,'#56676a',{rotate:[-.3,0,0]}),B(0,.03,0,.43,.035,.2,'#56676a')];
  return transform(out.map(part=>({...part,component:'furniture',objectType:type})),{x,y,z,angle});
}
function paper(x,y,z,w=.26,d=.2){return [B(x,y,z,w,.008,d,'#f1eee4',{component:'tool',objectType:'paper'}),B(x,y+.005,z,w*.7,.002,d*.015,'#71868c',{component:'tool',objectType:'paper'})];}
function props(type,{x=0,y=0,z=0,angle=0,scale=1}={}){
 let out=[];
 if(type==='paper')return transform(paper(0,0,0),{x,y,z,angle});
 if(type==='cup')out=[{shape:'lathe',position:[0,0,0],size:[1,1,1],profile:[[0,0],[.032,0],[.04,.09],[.035,.09],[.028,.009],[0,.009],[0,0]],material:'#f1eee4'},{shape:'torus',position:[.043,.045,0],size:[.016,.025,.006],material:'#f1eee4'}];
 if(type==='bowl')out=[{shape:'lathe',position:[0,0,0],size:[1,1,1],profile:[[0,0],[.05,0],[.12,.1],[.115,.1],[.045,.012],[0,.012],[0,0]],material:'#d9dcd4'}];
 if(type==='box')out=[B(0,.16,0,.42,.32,.33,'#b39162'),B(0,.322,0,.045,.004,.33,'#e2d5ba')];
 if(type==='linen')out=[B(0,.035,0,.4,.065,.3,'#e8e7dd'),B(.01,.1,0,.36,.06,.29,'#d6e3e0')];
 if(type==='basket')out=[B(0,.04,0,.35,.035,.25,'#af906a'),B(-.16,.14,0,.025,.2,.24,'#af906a'),B(.16,.14,0,.025,.2,.24,'#af906a'),B(0,.14,-.11,.33,.2,.025,'#af906a'),B(0,.14,.11,.33,.2,.025,'#af906a')];
 if(type==='map')out=[B(0,.13,0,.4,.28,.018,'#eee7d3'),B(-.05,.13,.014,.014,.23,.006,'#7999a1'),B(0,.12,.015,.36,.012,.006,'#bd9b71')];
 if(type==='samples')out=[B(0,.18,0,.46,.36,.025,'#ae9b7f'),...[-.13,0,.13].map((px,i)=>B(px,.2,.02,.11,.22,.01,['#8b9c96','#c6ae8b','#6e828d'][i]))];
 if(type==='mop')out=[segment([0,.06,0],[.13,1.05,0],.012,'#a3916d'),B(0,.045,0,.35,.05,.14,'#d6d8ca')];
 if(type==='cane')out=[C(0,.43,0,.012,.83,'#977657'),B(.035,.86,0,.09,.025,.025,'#977657')];
 if(type==='dumbbell')out=[C(0,0,0,.015,.26,'#77868a',{rotate:[0,0,Math.PI/2]}),C(-.12,0,0,.055,.035,'#556772',{rotate:[0,0,Math.PI/2]}),C(.12,0,0,.055,.035,'#556772',{rotate:[0,0,Math.PI/2]})];
 if(['plate','meal','breakfast','pasta','salad','pastry'].includes(type)){
  out=[C(0,.012,0,.135,.018,'#efe8d6'),{shape:'torus',position:[0,.021,0],size:[.13,.13,.016],rotate:[Math.PI/2,0,0],material:'#ded7c2'}];
  if(type==='meal')out.push(S(-.035,.04,-.01,.065,.026,.07,'#f1e6cc'),S(.06,.04,.025,.04,.025,.04,'#a67a4c'),S(.04,.04,-.065,.045,.025,.03,'#738e50'),S(.065,.055,-.05,.028,.018,.025,'#c58b54'));
  if(type==='breakfast')out.push(B(-.04,.038,.02,.095,.035,.105,'#c79b61'),S(.05,.036,-.025,.052,.014,.048,'#eee6ca'),S(.05,.05,-.025,.024,.015,.023,'#dab75e'));
  if(type==='pasta')for(let i=0;i<5;i++)out.push(B((i-2)*.024,.039+(i%2)*.007,0,.015,.016,.13,'#d8bc7c',{rotate:[0,(i-2)*.15,0]}));
  if(type==='salad')for(const [px,pz,m]of [[-.05,-.03,'#7e9857'],[.04,-.04,'#9eaf63'],[.04,.05,'#a3ac68'],[-.04,.04,'#8b9f5b'],[0,0,'#b96e52']])out.push(S(px,.047,pz,.045,.025,.04,m));
  if(type==='pastry')out.push(S(0,.045,0,.1,.034,.06,'#bd925b'),B(0,.071,0,.09,.012,.06,'#dec08a'));
  out.push(segment([.18,.014,-.1],[.18,.014,.1],.006,'#8e9d9c'),S(.18,.016,.105,.018,.006,.03,'#8e9d9c'));
 }
 if(type==='ricebowl')out=[...props('bowl',{scale:.7}),S(0,.058,0,.071,.022,.07,'#e7dfc4'),B(.0,.08,.0,.08,.006,.025,'#81955c')];
 if(type==='lunchtray')out=[B(0,.014,0,.52,.024,.34,'#8d9f9c'),...props('meal',{x:-.07,y:.023,scale:.8}),...props('ricebowl',{x:.16,y:.025,z:-.06,scale:.65}),...props('cup',{x:.17,y:.026,z:.1,scale:.7})];
 if(type==='menustand')out=[B(0,.015,0,.18,.025,.1,'#a8926c'),B(0,.17,0,.15,.3,.018,'#e2d3b5'),...[-.05,.02,.09].map(dy=>B(0,.17+dy,.013,.11,.009,.006,'#8c7c61'))];
 if(type==='bookstack')out=[B(0,.025,0,.29,.045,.2,'#68878a'),B(.025,.07,.01,.25,.035,.19,'#b69768'),B(-.015,.109,-.01,.27,.04,.19,'#8c7e91'),B(0,.132,0,.23,.005,.16,'#e9e2cc')];
 if(type==='schoolbag'||type==='totebag')out=[B(0,.2,0,.27,.36,.17,type==='schoolbag'?'#99815f':'#c6b698',{cornerRadius:.05}),{shape:'torus',position:[0,.38,0],size:[.075,.085,.035],material:'#9e8b6a'},B(0,.17,.092,.19,.15,.03,'#b8a17d')];
 if(type==='suitcase')out=[B(0,.26,0,.34,.45,.23,'#a78d72',{cornerRadius:.04}),B(0,.59,0,.2,.22,.02,'#899390'),B(0,.7,0,.22,.025,.035,'#899390'),C(-.12,.04,.07,.035,.035,'#4d5e61',{rotate:[0,0,Math.PI/2]}),C(.12,.04,.07,.035,.035,'#4d5e61',{rotate:[0,0,Math.PI/2]})];
 if(type==='breadboard')out=[B(0,.018,0,.45,.025,.3,'#b3976b'),S(-.06,.067,0,.15,.05,.08,'#be955d'),S(.13,.055,.04,.06,.035,.05,'#e0c8a1')];
 if(type==='cuttingboard')out=[B(0,.017,0,.43,.025,.28,'#bba174'),B(-.06,.045,0,.18,.035,.08,'#7d9a62'),B(.09,.042,.045,.075,.03,.055,'#ce925e'),B(.12,.04,-.06,.15,.012,.04,'#a6b1ad')];
 if(type==='wateringcan')out=[C(0,.08,0,.07,.16,'#8ea38a'),segment([.06,.055,.02],[.2,.13,.02],.018,'#8ea38a'),{shape:'torus',position:[-.075,.1,0],size:[.05,.06,.025],material:'#8ea38a'}];
 if(type==='plant')out=[C(0,.12,0,.13,.23,'#b29370'),C(0,.45,0,.014,.55,'#6a8558'),...[-1,1].flatMap(sx=>[S(sx*.11,.48,0,.15,.045,.075,'#7f9b69'),S(sx*.075,.68,0,.1,.04,.06,'#94a878')])];
 if(type==='paintset')out=[S(0,.015,0,.14,.014,.095,'#b4a17a'),...[-.08,0,.08].map((px,i)=>S(px,.035,0,.025,.009,.025,['#bc8264','#7d9d87','#c3ad62'][i])),segment([.14,.02,-.08],[.14,.02,.12],.006,'#9a7a50')];
 if(type==='labglass')out=[C(-.1,.06,0,.04,.12,'#b7cfce'),C(.05,.07,0,.055,.14,'#bbd4cf'),C(.05,.15,0,.018,.06,'#bbd4cf'),B(.0,.012,.12,.3,.02,.12,'#96a9a3'),...[-.1,0,.1].map(px=>C(px,.09,.12,.012,.14,'#b0c9c4'))];
 if(type==='medicines')out=[B(-.075,.06,0,.09,.12,.065,'#dedec8'),B(.045,.045,0,.075,.09,.07,'#adc2b0'),C(.13,.035,.025,.025,.065,'#c5d0c5'),B(-.075,.065,.037,.06,.023,.009,'#659374')];
 if(type==='toolset')out=[B(0,.025,0,.32,.04,.21,'#a18b67'),B(-.05,.057,0,.18,.02,.045,'#839593'),B(.05,.057,.055,.045,.025,.15,'#839593'),B(.12,.057,-.04,.06,.025,.09,'#839593')];
 if(type==='flowers')out=[C(0,.12,0,.065,.23,'#b7c0ad'),...[-.06,0,.06].flatMap((px,i)=>[segment([0,.1,0],[px,.34+i*.04,0],.005,'#70865a'),S(px,.35+i*.04,0,.04,.028,.04,['#bc8d78','#d3b974','#d1c3a1'][i])])];
 return transform(out.map(part=>({...part,component:'tool',objectType:type})),{x,y,z,angle,scale});
}
const objectNames={desk:'책상',table:'테이블',counter:'카운터',lectern:'교탁 · 강연대',workbench:'작업대',chair:'의자',wheelchair:'수동 휠체어',board:'비전원 칠판',bed:'침상',trolley:'수동 카트',shelf:'진열 선반',stool:'스툴',bench:'대기 벤치',mat:'운동 매트',barrier:'차단봉',musicstand:'악보대',paper:'서류',cup:'컵',bowl:'볼',box:'상자',linen:'리넨',basket:'장바구니',map:'지도',samples:'소재 샘플',mop:'밀대',cane:'지팡이',dumbbell:'덤벨','manual-wrench':'수공구','study-divider':'열람대 칸막이','stethoscope-probe':'청진기',stage:'단상'};
Object.assign(objectNames,{sofa:'라운지 소파',easel:'이젤과 그림',plate:'접시',meal:'밥과 반찬 식사',breakfast:'토스트와 달걀 아침식사',pasta:'파스타',salad:'샐러드',pastry:'페이스트리',ricebowl:'밥그릇',lunchtray:'급식 트레이',menustand:'메뉴판',bookstack:'책 더미',schoolbag:'책가방',totebag:'토트백',suitcase:'캐리어',breadboard:'빵과 반죽판',cuttingboard:'도마와 식재료',wateringcan:'물뿌리개',plant:'화분',paintset:'붓과 팔레트',labglass:'비전원 실험 유리기구',medicines:'약품 모형',toolset:'수공구 세트',flowers:'화병과 꽃'});
const industryWords={ED:'교육 학교 교실 강의실 도서관',MD:'의료 병원 병실 진료실 요양',OF:'오피스 사무실 회사 업무 회의실',FB:'카페 식당 외식 레스토랑',HT:'호텔 숙박 리조트 객실',FN:'금융 은행 상담',RT:'매장 리테일 판매 쇼룸',SV:'편의 매장 무인',MF:'제조 공장 물류 창고',PB:'공공 민원 교통',TP:'관광 전시 체험',VN:'공연장 영화관 경기장',RS:'주거 분양 주택',ID:'인테리어 가구',AD:'야외 광고 미디어',OE:'파트너 현장 교육'};
const roleAliases={doctor:['의료진'],nurse:['의료진'],teacher:['교사','강사'],lecturer:['강사','발표자'],student:['수강생','학습자'],patient:['보호 대상'],office:['사무원','회사원'],presenter:['프레젠터'],retailer:['판매원','점원'],banker:['은행원'],clerk:['공무원','행정 직원'],housekeeper:['하우스키퍼'],worker:['기술자'],guide:['가이드','해설사'],caregiver:['요양보호사'],librarian:['도서관 사서'],researcher:['과학자','실험실'],pharmacist:['약국','조제'],dentist:['치과 의사','치과 위생사'],baker:['베이커리','제과'],artist:['화가','공방','미술 선생님'],gardener:['원예','정원사'],mechanic:['정비','기술자']};
const actionWords={write:'필기 작성 기록',read:'읽기 독서 교재',raise:'손들기 질문',board:'판서 칠판 쓰기', 'board-low':'판서 칠판 쓰기',point:'가리키기 설명 발표','point-left':'가리키기 진열 설명',present:'발표 설명 강연',consult:'상담 설명',listen:'듣기 수업',inspect:'점검 기록 확인',carry:'운반 상자',serve:'서빙 트레이',push:'이동 카트',examine:'진찰 청진',eat:'식사 밥먹는 급식 숟가락 식당',chopsticks:'식사 밥먹는 젓가락',drink:'마시기 음료 커피 차 휴식',snack:'간식 샌드위치 먹기',menu:'메뉴 주문 읽기',stir:'섞기 조리 반죽',knead:'반죽 제빵 만들기',draw:'그리기 미술 그림',water:'물주기 정원 화분',stretch:'스트레칭 기지개 휴식','meal-tray':'급식 식사 트레이 운반'};
const data=[];
function define(id,name,category,industries,situation,variant,make){
 const actors=[],objects=[],parts=[];let previewAzimuth=35;
 const api={
  person:(role,options={})=>{
   const actorId='actor-'+(actors.length+1),resolved={variant:data.length+actors.length+1,...options},look=peopleAppearance(role,resolved);
   actors.push({id:actorId,role:roleNames[role],roleId:role,pose:options.pose||'stand',action:options.action||'rest',cues:[...new Set([...(cues[role]||[]),...look.cues])],wardrobe:look.wardrobe,accessories:look.accessoryLabels,accessoryTypes:look.accessories,hairstyle:look.hairstyle,appearance:{skin:look.skin,hair:look.hair,shirt:look.shirt,pants:look.pants},scale:options.scale||1,anchor:[options.x||0,options.y||0,options.z||0],rotation:options.angle||0});
   parts.push(...actor(role,resolved).map(part=>({...part,actorId})));
  },
  object:(type,options={})=>{objects.push(type);if(type==='board'&&Math.cos(options.angle||0)>.5)previewAzimuth=145;parts.push(...furniture(type,options));},
  prop:(type,options={})=>{objects.push(type);parts.push(...props(type,options));},
  raw:(values,type)=>{objects.push(type);parts.push(...values.map(p=>({...p,component:'tool',objectType:type})));},
 };
 make(api);
 // Deliberately broad nominal size; build_spatial_library measures the metre recipe precisely.
 data.push({id:'people:'+id,name,kind:'people-scene',assetGroup:'people',recipe:'people-'+id,size:[3,1.8,2],compositionSpace:'metres',parts,category,industries:industries.split(' '),spaces:[situation],description:`${situation}. ${variant}. ${actors.map(a=>a.role).join(' · ')}와 ${[...new Set(objects)].map(type=>objectNames[type]||type).join(' · ')}를 한 오브젝트로 배치합니다.`,
  keywords:[situation,variant,...actors.flatMap(a=>[a.role,...a.cues,...(roleAliases[a.roleId]||[]),...(actionWords[a.action]||'').split(' '),...(a.pose==='sit'?['앉은','앉아있는','착석']:['서서','서있는'])]),...objects.map(type=>objectNames[type]||type),...industries.split(' ').flatMap(code=>(industryWords[code]||'').split(' ')),'사람','직종','연출','인물','사람과 가구'],roles:actors.map(a=>a.role),activity:situation,actors,composition:{type:'people-with-objects',variant,peopleCount:actors.length,objects:[...new Set(objects)],poweredProducts:false},
  previewCamera:{azimuth:previewAzimuth,elevation:28,zoom:1.5},frontAxis:[0,0,1],physical:true,powered:false,license:'CC0-1.0',dimensionSource:'designed'});
}
const education='교육 · 강의 연출',medical='의료 · 케어 연출',office='오피스 · 발표 연출',food='외식 · 카페 연출',hotel='호텔 · 접객 연출',retail='매장 · 공간 상담 연출',industry='제조 · 물류 연출',publicWork='금융 · 공공 연출',culture='관광 · 문화 · 운동 연출';
// Education: explicitly separate seated learning, podium teaching and board work.
for(const [id,label,action]of [['student-write','필기하는 학생','write'],['student-read','책 읽는 학생','read'],['student-raise','손드는 학생','raise'],['student-listen','설명을 듣는 학생','listen']])define(id,label+' · 책상과 의자',education,'ED', '교실 · 책상에 앉은 학생',label,api=>{api.object('chair');api.object('desk',{z:.66,w:.9,d:.56});api.person('student',{pose:'sit',action,scale:1});api.prop('paper',{y:.746,z:.67});});
define('students-pair','토론하는 학생 2명 · 모둠 책상',education,'ED','모둠 교실','서로 마주 보고 교재를 설명',api=>{api.object('table',{w:1.25,d:.7});api.object('chair',{z:-.63});api.object('chair',{z:.63,angle:Math.PI});api.person('student',{pose:'sit',action:'consult',z:-.63});api.person('student',{pose:'sit',action:'read',z:.63,angle:Math.PI});api.prop('paper',{y:.746});});
define('student-library','열람하는 학생 · 칸막이 열람대',education,'ED PB','도서관 · 개인 열람','정면 칸막이 안에서 독서',api=>{api.object('chair');api.object('desk',{z:.66,w:1.0,d:.65});api.person('student',{pose:'sit',action:'read'});api.raw([B(0,.98,1.0,1.02,.45,.025,'#b8c5bc'),B(-.5,.98,.7,.025,.45,.62,'#b8c5bc')],'study-divider');});
define('teacher-desk-explain','교탁 뒤 선생님 · 교재 설명',education,'ED','교탁 뒤 수업','교재를 펼치고 앞을 향해 설명',api=>{api.object('board',{z:-.78,w:1.55,angle:Math.PI});api.object('desk',{z:.6,w:1.35,d:.65});api.person('teacher',{action:'present'});api.prop('paper',{y:.746,z:.64});});
define('teacher-desk-read','교탁 뒤 선생님 · 교재 읽기',education,'ED','교탁 뒤 수업','교탁 뒤에서 책을 든 채 읽기',api=>{api.object('board',{z:-.78,w:1.55,angle:Math.PI});api.object('desk',{z:.62,w:1.35,d:.65});api.person('teacher',{action:'read'});api.prop('paper',{y:.746,z:.65});});
define('teacher-desk-consult','앉아서 지도하는 선생님 · 학생 상담',education,'ED','교무실 · 학습 상담','교사와 학생이 서류를 사이에 두고 상담',api=>{api.object('desk',{w:1.25,d:.7});api.object('chair',{z:-.65});api.object('chair',{z:.65,angle:Math.PI});api.person('teacher',{z:-.65,pose:'sit',action:'consult'});api.person('student',{z:.65,angle:Math.PI,pose:'sit',action:'listen'});api.prop('paper',{y:.746});});
for(const [id,label,action]of [['teacher-board-high','높은 위치에 판서하는 선생님','board'],['teacher-board-low','중간 위치에 판서하는 선생님','board-low'],['teacher-board-point','칠판을 가리키는 선생님','point']])define(id,label+' · 비전원 칠판',education,'ED','칠판 앞 수업',label,api=>{api.object('board',{z:.7});api.person('teacher',{action});});
define('lecturer-lectern','강연대 뒤 강연자 · 자료 설명',education,'ED PB VN','강의실 · 강연','높은 강연대와 펼친 자료를 앞에 두고 발표',api=>{api.object('lectern',{z:.62});api.person('lecturer',{action:'present'});api.prop('paper',{y:1.105,z:.63,w:.3});});
define('lecturer-table','강의 테이블의 강연자 · 손짓 발표',education,'ED OF','강의실 · 세미나','낮은 강의 테이블 옆에서 손짓으로 설명',api=>{api.object('table',{x:-.25,z:.64,w:1.5,d:.65});api.person('lecturer',{action:'present',x:.32});api.prop('paper',{x:-.45,y:.746,z:.64});});
// Healthcare: white coat / scrubs / striped gown and physical context identify the roles.
define('doctor-consult','의사와 환자 · 앉아서 문진',medical,'MD','진료실 · 문진','진료 데스크를 사이에 둔 의사와 환자',api=>{api.object('desk',{w:1.3,d:.72});api.object('chair',{z:-.66});api.object('chair',{z:.66,angle:Math.PI});api.person('doctor',{pose:'sit',action:'consult',z:-.66});api.person('patient',{pose:'sit',action:'listen',z:.66,angle:Math.PI});api.prop('paper',{y:.746});});
define('doctor-explain','의사와 환자 · 서서 설명',medical,'MD','진료실 · 설명','의사는 서서 설명하고 환자는 의자에 착석',api=>{api.object('chair',{x:.6,z:.2,angle:-Math.PI/2});api.object('table',{x:.0,z:.9,w:1.0,d:.5});api.person('doctor',{x:-.52,action:'present',angle:Math.PI/2});api.person('patient',{x:.6,z:.2,pose:'sit',action:'listen',angle:-Math.PI/2});api.prop('paper',{x:0,y:.746,z:.9});});
define('doctor-examine','의사와 환자 · 청진기 진찰',medical,'MD','진료실 · 진찰','흰 진료복의 의사가 착석 환자를 가까이서 확인',api=>{api.object('chair',{x:.42,angle:-Math.PI/2});api.person('patient',{x:.42,pose:'sit',angle:-Math.PI/2});api.person('doctor',{x:-.45,angle:Math.PI/2,action:'examine'});api.raw([segment([-.3,1.2,-.08],[0,1.08,-.1],.007,'#334b50'),segment([0,1.08,-.1],[.3,.91,-.1],.007,'#334b50'),C(.3,.91,-.1,.025,.01,'silver',{rotate:[0,0,Math.PI/2]})],'stethoscope-probe');api.object('stool',{x:-.3,z:.7});});
define('doctor-bed-round','의사와 침상 환자 · 회진',medical,'MD','병실 · 회진','난간 침상에 누운 환자와 기록을 든 의사',api=>{api.object('bed');api.person('patient',{y:.75,z:.83,tilt:-Math.PI/2});api.person('doctor',{x:-.83,z:-.25,angle:Math.PI/2,action:'inspect'});});
define('nurse-bed-check','간호사와 침상 환자 · 상태 확인',medical,'MD','병실 · 간호','스크럽 유니폼 간호사가 기록을 보며 침상 확인',api=>{api.object('bed');api.person('patient',{y:.75,z:.83,tilt:-Math.PI/2});api.person('nurse',{x:.86,z:-.1,angle:-Math.PI/2,action:'inspect'});});
define('nurse-desk','간호사 · 간호 스테이션 기록',medical,'MD','간호 스테이션','간호사 유니폼과 스테이션 데스크의 기록 작업',api=>{api.object('desk',{z:.67,w:1.25});api.object('chair');api.person('nurse',{pose:'sit',action:'write'});api.prop('paper',{y:.746,z:.67});});
define('nurse-trolley','간호사 · 물품 카트 정리',medical,'MD','처치 준비 공간','비전동 물품 카트와 기록지를 확인하는 간호사',api=>{api.object('trolley',{z:.65});api.person('nurse',{action:'inspect'});api.prop('linen',{y:.69,z:.67});});
define('patient-waiting','환자 · 대기 의자와 서류',medical,'MD','외래 대기실','환자복과 손목 띠를 한 사람이 서류를 들고 착석',api=>{api.object('chair');api.object('table',{x:.68,z:.1,w:.48,d:.48,h:.6});api.person('patient',{pose:'sit',action:'read'});});
define('care-wheelchair','돌봄 담당자와 환자 · 수동 휠체어',medical,'MD PB','요양 · 이동 보조','수동 휠체어에 앉은 환자와 뒤에서 미는 돌봄 담당자',api=>{api.object('wheelchair');api.person('patient',{pose:'sit',action:'rest'});api.person('caregiver',{z:-.85,action:'push'});});
define('care-seated-talk','돌봄 담당자와 환자 · 착석 대화',medical,'MD','요양 라운지','두 의자에 마주 앉아 대화하는 돌봄 담당자와 환자',api=>{api.object('chair',{x:-.52,angle:Math.PI/2});api.object('chair',{x:.52,angle:-Math.PI/2});api.person('caregiver',{x:-.52,pose:'sit',action:'consult',angle:Math.PI/2});api.person('patient',{x:.52,pose:'sit',action:'listen',angle:-Math.PI/2});api.object('table',{z:.72,w:.7,d:.4,h:.6});});
define('care-cane','돌봄 담당자와 환자 · 지팡이 보행',medical,'MD PB','요양 · 보행 보조','지팡이를 짚은 환자와 곁에서 설명하는 돌봄 담당자',api=>{api.person('patient',{x:.38});api.person('caregiver',{x:-.42,action:'present'});api.prop('cane',{x:.64,z:.14});api.object('bench',{z:.78});});
define('doctor-patient-board','의사와 환자 · 비전원 자료 설명판',medical,'MD','건강 상담실','벽면 그림판과 의사·착석 환자의 설명 상황',api=>{api.object('board',{z:.85,w:1.15});api.person('doctor',{x:-.38,action:'point'});api.object('chair',{x:.7,z:-.1,angle:-Math.PI/4});api.person('patient',{x:.7,z:-.1,pose:'sit',action:'listen',angle:-Math.PI/4});});
// Office and professional services.
for(const [id,label,action]of [['office-write','서류를 작성하는 직원','write'],['office-read','자료를 읽는 직원','read'],['office-review','서류를 설명하는 직원','consult']])define(id,label+' · 업무 데스크',office,'OF FN OE','개인 업무 공간',label,api=>{api.object('desk',{z:.66});api.object('chair');api.person('office',{pose:'sit',action});api.prop('paper',{y:.746,z:.65});});
define('office-pair','협업 직원 2명 · 맞은편 테이블',office,'OF OE','협업 공간','서로 마주 앉아 자료를 비교하는 직원',api=>{api.object('table',{w:1.5,d:.75});for(const [z,angle,action]of [[-.69,0,'consult'],[.69,Math.PI,'read']]){api.object('chair',{z,angle});api.person('office',{z,angle,pose:'sit',action});}api.prop('paper',{y:.746});});
define('presenter-lectern','발표자 · 강연대와 포인터',office,'OF PB OE','발표 공간','강연대 뒤에서 자료를 들고 손짓하는 발표자',api=>{api.object('lectern',{z:.6});api.person('presenter',{action:'present'});api.prop('paper',{y:1.105,z:.6});});
define('presenter-board','발표자 · 비전원 보드 설명',office,'OF FN','회의실 발표','자료가 적힌 비전원 보드 앞에서 설명',api=>{api.object('board',{z:.8});api.person('presenter',{action:'point',x:-.45});});
define('meeting-chairperson','회의 진행자 · 테이블 끝 설명',office,'OF FN','회의실 · 회의 진행','회의 테이블 끝에 서서 자료 설명',api=>{api.object('table',{z:.85,w:1.8,d:.8});api.person('presenter',{action:'present'});api.prop('paper',{y:.746,z:.78});});
define('meeting-audience','회의 참석자 2명 · 착석 토론',office,'OF FN','회의실 · 토론','같은 테이블 측면에 앉은 두 참석자의 질문과 독서',api=>{api.object('table',{z:.66,w:1.8,d:.65});for(const [x,action]of [[-.45,'raise'],[.45,'read']]){api.object('chair',{x});api.person('office',{x,pose:'sit',action});}api.prop('paper',{y:.746,z:.64});});
define('field-trainer','현장 교육 담당자 · 작업대 설명',office,'OE MF OF','파트너 현장 교육','서류와 작업대를 함께 보며 설명하는 교육 담당자',api=>{api.object('workbench',{z:.66,w:1.3});api.person('lecturer',{action:'present'});api.prop('paper',{y:.906,z:.67});});
define('designer-consult','디자이너와 고객 · 소재 상담',office,'ID RS RT','인테리어 · 자재 상담','소재 샘플 보드를 놓고 고객에게 설명',api=>{api.object('table',{w:1.3,d:.75});api.object('chair',{z:-.68});api.object('chair',{z:.68,angle:Math.PI});api.person('designer',{z:-.68,pose:'sit',action:'consult'});api.person('customer',{z:.68,pose:'sit',action:'listen',angle:Math.PI});api.prop('samples',{y:.746});});
// Hospitality and food service.
define('barista-counter','바리스타 · 카운터에서 컵 준비',food,'FB HT','카페 카운터','앞치마 바리스타와 컵이 놓인 카운터',api=>{api.object('counter',{z:.65,w:1.5});api.person('barista',{action:'inspect'});api.prop('cup',{x:-.2,y:1.055,z:.65});api.prop('cup',{x:.18,y:1.055,z:.65});});
define('barista-serve','바리스타 · 카운터 옆 트레이 서빙',food,'FB HT','카페 · 픽업','컵 트레이를 든 바리스타가 카운터 옆에 선 구성',api=>{api.object('counter',{x:-.83,z:.55,w:.9});api.person('barista',{x:.1,action:'serve'});});
define('barista-customer','바리스타와 고객 · 주문 대화',food,'FB HT','카페 주문','카운터 양쪽에서 주문과 안내를 주고받는 장면',api=>{api.object('counter',{w:1.45,d:.6});api.person('barista',{z:-.65,action:'present'});api.person('customer',{z:.66,angle:Math.PI,action:'inspect'});api.prop('cup',{x:.45,y:1.055});});
define('chef-prep','조리사 · 볼이 놓인 작업대',food,'FB HT','조리 준비 공간','조리 모자와 앞치마의 조리사가 볼 앞에서 준비',api=>{api.object('workbench',{z:.65,w:1.35,h:.9});api.person('chef',{action:'inspect'});api.prop('bowl',{y:.905,z:.64});});
define('chef-instruct','조리사 · 조리 작업대 시연',food,'FB HT ED','조리 교육','높은 조리 모자와 손짓, 볼·작업대가 함께 있는 시연',api=>{api.object('workbench',{z:.68,w:1.6,h:.9});api.person('chef',{action:'present',x:-.2});api.prop('bowl',{x:.4,y:.905,z:.68});});
define('waiter-tray','서빙 직원 · 테이블 옆 트레이',food,'FB HT','레스토랑 서비스','앞치마 직원이 테이블 곁에서 접시 트레이를 든 구성',api=>{api.object('table',{x:-.9,z:.45,w:.8,d:.8});api.person('waiter',{x:.1,action:'serve'});});
define('waiter-customer','서빙 직원과 고객 · 착석 주문',food,'FB HT','레스토랑 주문','테이블에 앉은 고객과 곁에서 서류를 확인하는 직원',api=>{api.object('table',{z:.65,w:1.15});api.object('chair');api.person('customer',{pose:'sit',action:'listen'});api.person('waiter',{x:.95,z:.45,angle:-Math.PI/2,action:'inspect'});api.prop('cup',{y:.746,z:.65});});
define('cafe-reading','카페 이용객 · 독서와 머그컵',food,'FB HT RS','카페 좌석','책 읽는 사람, 의자, 컵을 놓은 테이블의 휴식 장면',api=>{api.object('chair');api.object('table',{z:.66,w:.85,d:.6});api.person('customer',{pose:'sit',action:'read'});api.prop('cup',{x:.27,y:.746,z:.65});});
define('hotel-front','호텔 리셉션 직원 · 안내 데스크',hotel,'HT','호텔 프런트','명찰과 접객 유니폼, 안내 카운터의 정면 안내',api=>{api.object('counter',{z:.65,w:1.7});api.person('receptionist',{action:'present'});api.prop('paper',{y:1.055,z:.65});});
define('hotel-checkin','호텔 직원과 투숙객 · 체크인',hotel,'HT','호텔 체크인','카운터를 사이에 둔 투숙객과 직원의 서류 확인',api=>{api.object('counter',{w:1.55,d:.62});api.person('receptionist',{z:-.65,action:'inspect'});api.person('customer',{z:.7,angle:Math.PI,action:'inspect'});api.prop('paper',{y:1.055});});
define('housekeeping-cart','객실 정비 직원 · 리넨 카트',hotel,'HT','호텔 객실 정비','앞치마 직원이 리넨 카트를 미는 모습',api=>{api.object('trolley',{z:.67});api.person('housekeeper',{action:'push'});api.prop('linen',{y:.69,z:.67});});
define('housekeeping-fold','객실 정비 직원 · 수건 정리',hotel,'HT','호텔 리넨 정리','카트 옆에서 기록과 수건을 확인하는 직원',api=>{api.object('trolley',{x:.65,z:.3});api.person('housekeeper',{x:-.2,action:'inspect'});api.prop('linen',{x:.65,y:.69,z:.3});});
define('concierge-luggage','컨시어지 · 수하물 운반 카트',hotel,'HT','호텔 수하물 서비스','접객 직원이 상자가 실린 수동 카트를 미는 장면',api=>{api.object('trolley',{z:.67});api.person('concierge',{action:'push'});api.prop('box',{y:.28,z:.67});});
define('hotel-lounge-consult','호텔 직원과 투숙객 · 라운지 안내',hotel,'HT','호텔 라운지','착석 투숙객 옆에서 장소를 설명하는 접객 직원',api=>{api.object('chair',{x:.46,angle:-Math.PI/4});api.person('customer',{x:.46,pose:'sit',action:'read',angle:-Math.PI/4});api.person('receptionist',{x:-.65,action:'present'});api.object('table',{z:.75,w:.7,d:.45,h:.6});});
// Retail, interior and property consultation.
define('retail-shelf','매장 직원 · 진열대 상품 안내',retail,'RT SV','매장 진열','매장 앞치마와 명찰의 직원이 진열 선반을 소개',api=>{api.object('shelf',{x:-.35,z:.55});api.person('retailer',{x:.8,z:.05,action:'point-left'});});
define('retail-stock','매장 직원 · 진열대 재고 확인',retail,'RT SV','매장 재고 관리','상품 선반 앞에서 기록판을 확인하는 매장 직원',api=>{api.object('shelf',{x:-.35,z:.55});api.person('retailer',{x:.7,z:.05,action:'inspect'});});
define('retail-counter','매장 직원과 고객 · 안내 카운터',retail,'RT SV','매장 고객 응대','카운터 양쪽에서 상품 정보를 설명',api=>{api.object('counter',{w:1.4,d:.6});api.person('retailer',{z:-.6,action:'present'});api.person('shopper',{z:.65,angle:Math.PI});api.prop('basket',{x:.4,y:1.055});});
define('retail-shopper','매장 고객 · 선반과 장바구니',retail,'RT SV','매장 쇼핑','장바구니가 놓인 진열 선반 옆의 고객',api=>{api.object('shelf',{x:-.35,z:.55});api.person('shopper',{x:.7,z:.05,action:'inspect'});api.prop('basket',{x:1.22,y:0,z:.15});});
define('interior-sample-board','공간 디자이너 · 자재 샘플대',retail,'ID RS RT','인테리어 쇼룸','소재 샘플을 올린 상담대에서 설명하는 디자이너',api=>{api.object('table',{z:.7,w:1.4,d:.7});api.person('designer',{action:'present'});api.prop('samples',{y:.746,z:.7});});
define('realtor-plan','공간 상담사와 고객 · 평면도 상담',retail,'RS ID FN','주거 분양 상담','종이 평면도 앞에서 주거 공간을 설명하는 상담사',api=>{api.object('table',{w:1.4,d:.75});api.object('chair',{z:-.67});api.object('chair',{z:.67,angle:Math.PI});api.person('designer',{pose:'sit',z:-.67,action:'consult'});api.person('customer',{pose:'sit',z:.67,angle:Math.PI,action:'listen'});api.prop('paper',{y:.746});});
// Industry and logistics, with hard hats / reflective vests and manual tools.
define('worker-bench','현장 작업자 · 작업대와 상자',industry,'MF OE','제조 작업장','안전모·반사 조끼의 작업자와 작업대',api=>{api.object('workbench',{z:.65,w:1.5});api.person('worker',{action:'inspect'});api.prop('box',{y:.905,z:.65});});
define('inspector-clipboard','검사 담당자 · 작업대 기록',industry,'MF OE','검사 작업실','안전모와 기록판으로 작업대를 확인하는 검사 담당자',api=>{api.object('workbench',{z:.66,w:1.4});api.person('inspector',{action:'inspect'});api.prop('paper',{y:.905,z:.65});});
define('worker-carry','물류 작업자 · 상자와 적재대',industry,'MF SV','물류 포장','상자를 안고 낮은 적재대 옆에 선 작업자',api=>{api.object('workbench',{x:-.9,z:.55,w:.9,h:.5});api.person('worker',{x:.1,action:'carry'});});
define('courier-cart','물류 직원 · 상자 운반 카트',industry,'MF SV OE','물류 운반','상자가 실린 비전동 카트를 미는 직원',api=>{api.object('trolley',{z:.67});api.person('courier',{action:'push'});api.prop('box',{y:.28,z:.67});});
define('warehouse-count','창고 직원 · 보관 랙 재고 조사',industry,'MF SV','창고 재고 조사','보관 선반 앞에서 기록판을 확인하는 직원',api=>{api.object('shelf',{x:-.35,z:.55,w:1.0});api.person('worker',{x:.7,z:.05,action:'inspect'});});
define('site-instruction','현장 담당자 2명 · 작업 지시',industry,'MF OE','현장 작업 지시','같은 작업대를 앞에 둔 설명 담당자와 작업자',api=>{api.object('workbench',{z:.75,w:1.7});api.person('inspector',{x:-.46,action:'present'});api.person('worker',{x:.47,action:'inspect'});api.prop('paper',{y:.905,z:.75});});
define('facility-maintenance','설비 정비 직원 · 공구 작업대',industry,'MF OF PB','시설 관리 작업','안전모·작업복의 직원과 수공구를 놓은 비전동 작업대',api=>{api.object('workbench',{z:.68,w:1.3});api.person('worker',{action:'inspect'});api.raw([B(.2,.92,.68,.23,.025,.045,'#7d8a8d'),B(.31,.92,.68,.06,.025,.13,'#7d8a8d')],'manual-wrench');});
define('cleaner-cart','환경 정비 직원 · 청소 카트와 밀대',industry,'MF PB HT OF','환경 정비','작업복 직원과 수동 청소 카트·밀대의 조합',api=>{api.object('trolley',{x:.65,z:.4});api.person('cleaner',{action:'inspect'});api.prop('mop',{x:-.4,z:.25});});
// Finance and civic service.
define('banker-consult','금융 상담사와 고객 · 마주 앉은 상담',publicWork,'FN','금융 상담','정장 상담사와 서류를 든 고객이 상담 테이블에 착석',api=>{api.object('table',{w:1.35,d:.75});api.object('chair',{z:-.67});api.object('chair',{z:.67,angle:Math.PI});api.person('banker',{pose:'sit',z:-.67,action:'consult'});api.person('customer',{pose:'sit',z:.67,angle:Math.PI,action:'read'});api.prop('paper',{y:.746});});
define('banker-counter','금융 창구 직원 · 서류 확인',publicWork,'FN','금융 창구','창구 뒤에서 서류를 확인하는 정장 직원',api=>{api.object('counter',{z:.65,w:1.4});api.person('banker',{action:'inspect'});api.prop('paper',{y:1.055,z:.65});});
define('banker-explain','금융 상담사 · 안내 보드 설명',publicWork,'FN','금융 안내','비전원 안내판과 정장 상담사의 포인터 설명',api=>{api.object('board',{z:.8,w:1.2});api.person('banker',{x:-.25,action:'point'});});
define('clerk-counter','민원 담당자와 이용객 · 접수',publicWork,'PB OE','공공 민원 접수','접수 카운터 양쪽의 명찰 직원과 이용객',api=>{api.object('counter',{w:1.4,d:.6});api.person('clerk',{z:-.62,action:'inspect'});api.person('customer',{z:.65,angle:Math.PI,action:'inspect'});api.prop('paper',{y:1.055});});
define('clerk-seated','민원 담당자 · 앉아서 문서 작성',publicWork,'PB','공공 행정 업무','민원 문서를 작성하는 담당자와 업무 데스크',api=>{api.object('desk',{z:.66});api.object('chair');api.person('clerk',{pose:'sit',action:'write'});api.prop('paper',{y:.746,z:.66});});
define('transit-guide','교통 안내 직원 · 안내대와 수하물',publicWork,'PB TP','교통 안내 공간','명찰 직원이 종이 지도를 안내하는 장면',api=>{api.object('lectern',{x:.55,z:.6,w:.5,h:.9});api.person('guide',{action:'present'});api.prop('map',{x:.55,y:.905,z:.6});api.prop('box',{x:-.6});});
define('public-waiting','이용객 2명 · 연결 대기 의자',publicWork,'PB FN MD','공공 대기실','서류를 읽는 사람과 안내를 듣는 사람이 연결 벤치에 착석',api=>{api.object('bench');api.person('customer',{x:-.35,pose:'sit',action:'read'});api.person('customer',{x:.35,pose:'sit',action:'listen'});});
define('security-barrier','안전 안내 직원 · 대기열 차단봉',publicWork,'PB VN TP','출입 · 대기열 안내','제복형 모자의 안내 직원과 비전동 차단봉',api=>{api.object('barrier',{z:.75});api.person('security',{action:'present',variant:0});});
// Culture, tourism, sport and outdoor service.
define('guide-map','관광 안내자 · 지도 안내대',culture,'TP AD PB','관광 안내','조끼와 명찰의 안내자가 종이 지도로 설명',api=>{api.object('lectern',{z:.65,h:.95,w:.6});api.person('guide',{action:'present'});api.prop('map',{y:.955,z:.65});});
define('guide-group','전시 안내자와 관람객 · 전시 설명',culture,'TP VN AD','전시 해설','작품 선반 앞에서 안내자와 관람객이 함께 보는 장면',api=>{api.object('shelf',{x:-.45,z:.75});api.person('guide',{x:.65,z:.05,action:'point-left'});api.person('customer',{x:1.25,z:.25,action:'inspect'});});
define('performer-musicstand','공연 진행자 · 악보대와 지휘봉',culture,'VN ED','공연 · 리허설','악보대 앞에서 지휘봉을 든 진행자',api=>{api.object('musicstand',{z:.65});api.person('performer',{action:'present'});api.prop('paper',{y:1.08,z:.61});});
define('stage-presenter','공연장 진행자 · 단상 발표',culture,'VN TP','행사 무대','작은 단상과 강연대 뒤의 발표자',api=>{api.raw([B(0,.08,.35,1.4,.16,1.2,'#b29a76')],'stage');api.object('lectern',{z:.65,y:.16});api.person('presenter',{y:.16,action:'present'});});
define('trainer-mat','운동 지도자 · 매트와 자세 설명',culture,'HT VN RS','운동 지도','운동복 지도자가 운동 매트를 앞에 두고 설명',api=>{api.object('mat',{x:.4,z:.95});api.person('trainer',{x:-.45,action:'present'});});
define('trainer-student','운동 지도자와 이용객 · 매트 시범',culture,'HT VN TP','운동 · 재활 공간','매트 옆 지도자와 자세를 듣는 이용객',api=>{api.object('mat',{x:.55,z:.2});api.person('trainer',{x:-.6,action:'present'});api.person('customer',{x:.55,action:'inspect'});});
define('fitness-dumbbell','운동 지도자 · 벤치와 덤벨',culture,'HT VN RS','피트니스 지도','운동 벤치 옆에서 비전동 덤벨을 든 지도자',api=>{api.object('bench',{z:.8});api.person('trainer',{action:'inspect'});api.prop('dumbbell',{x:.13,y:1.18,z:.37});});
define('outdoor-guide-bench','야외 안내자 · 벤치와 안내 자료',culture,'TP PB AD','야외 쉼터 안내','벤치 옆에서 안내 자료를 설명하는 조끼 직원',api=>{api.object('bench',{z:.8});api.person('guide',{action:'present'});api.prop('map',{x:-.42,y:.46,z:.8});});

// Everyday activity is explicit geometry, not a renamed neutral pose. All meals are manual props.
function dining(api,role,{action='eat',meal='meal',style='wood',...look}={}){
 api.object('chair',{style});api.object('table',{z:.65,w:.95,d:.68});
 api.person(role,{pose:'sit',action,...look});api.prop(meal,{y:.747,z:.55});api.prop('cup',{x:.31,y:.747,z:.76});
}
function diningPair(api,roles,meals=['meal','salad'],actions=['eat','chopsticks']){
 api.object('table',{w:1.3,d:.9});
 for(let i=0;i<2;i++){const z=i?.78:-.78,angle=i?Math.PI:0;
  api.object('chair',{z,angle,style:'cafe'});api.person(roles[i],{pose:'sit',action:actions[i],z,angle});
  api.prop(meals[i],{y:.747,z:i?.19:-.19,angle});api.prop('cup',{x:i?-.42:.42,y:.747,z:i?.24:-.24});}
}
// Dining and cafe: utensils, hand-to-mouth actions, menus and serving distinguish the use.
for(const [id,name,action,meal]of [
 ['diner-rice','밥과 반찬을 먹는 손님','eat','meal'],
 ['diner-chopsticks','젓가락으로 식사하는 손님','chopsticks','ricebowl'],
 ['diner-pasta','파스타를 먹는 손님','eat','pasta'],
 ['diner-salad','샐러드를 먹는 손님','eat','salad'],
 ['diner-breakfast','아침식사하는 손님','eat','breakfast'],
 ['cafe-drinking','머그컵으로 차를 마시는 손님','drink','pastry'],
 ['cafe-snack','샌드위치 간식을 먹는 손님','snack','plate'],
 ['restaurant-menu','메뉴판을 고르는 손님','menu','plate']
])define(id,name+' · 식탁 좌석',food,'FB HT RS','식당 · 카페 좌석',name,api=>dining(api,'customer',{action,meal,style:'cafe'}));
define('restaurant-couple','마주 앉아 식사하는 손님 2명',food,'FB HT','레스토랑 · 두 사람 식사','밥·샐러드와 서로 다른 수저 동작',api=>diningPair(api,['customer','customer']));
define('cafe-chat','음료와 메뉴를 보는 손님 2명',food,'FB HT RS','카페 · 대화와 휴식','한 사람은 머그컵을 마시고 다른 사람은 메뉴 선택',api=>diningPair(api,['customer','customer'],['pastry','plate'],['drink','menu']));
define('cafeteria-line','급식 트레이를 든 이용객 · 배식대',food,'FB OF ED','구내식당 · 배식','밥·반찬·컵이 실린 식판을 들고 배식대 옆에 서기',api=>{api.object('counter',{x:-.8,z:.6,w:.9});api.person('customer',{x:.15,action:'meal-tray'});api.prop('lunchtray',{x:-.8,y:1.055,z:.6});});
define('restaurant-family','함께 식사하는 이용객 3명 · 가족 테이블',food,'FB HT RS','식당 · 함께 식사','성인 두 명과 작은 체형 이용객의 식사·음료·간식',api=>{api.object('table',{w:1.8,d:.9});for(const [x,z,angle,action,scale]of [[-.45,-.78,0,'eat',1],[.45,-.78,0,'drink',1],[0,.78,Math.PI,'snack',.85]]){api.object('chair',{x,z,angle,style:'wood'});api.person('customer',{x,z,angle,pose:'sit',action,scale,y:scale<1?.076:0});api.prop('meal',{x,y:.747,z:z<0?-.19:.19,scale:.8});}});
// Education: meals, art, reading assistance and supervised experiments.
define('school-lunch','급식 먹는 학생 · 식판과 책가방',education,'ED','학교 급식실','숟가락으로 급식을 먹는 학생과 의자 옆 책가방',api=>{dining(api,'student',{meal:'lunchtray'});api.prop('schoolbag',{x:-.46,z:-.13});});
define('school-lunch-pair','급식 먹는 학생 2명 · 식당 테이블',education,'ED','학교 급식실','숟가락과 젓가락을 쓰는 학생들이 마주 앉은 구성',api=>diningPair(api,['student','student'],['lunchtray','lunchtray']));
define('teacher-lunch','점심식사하는 선생님 · 교직원 식당',education,'ED','교직원 식당','안경과 목걸이 명찰의 교사가 식판으로 점심식사',api=>dining(api,'teacher',{meal:'lunchtray'}));
define('school-break-snack','간식 먹는 학생 · 휴게 벤치',education,'ED','학교 휴게 공간','책가방과 벤치에 앉아 샌드위치를 먹는 학생',api=>{api.object('bench');api.person('student',{pose:'sit',action:'snack',x:-.25});api.prop('schoolbag',{x:.4,y:.5});});
define('student-drawing','그림 그리는 어린 학생 · 미술 책상',education,'ED','미술 교실','작은 체형 학생이 팔레트와 종이 앞에서 색칠',api=>{api.object('chair',{style:'wood'});api.object('desk',{z:.62,w:.9});api.person('student',{pose:'sit',action:'write',scale:.85,y:.076});api.prop('paper',{y:.747,z:.6});api.prop('paintset',{x:.27,y:.747,z:.7,scale:.65});});
define('librarian-books','사서 · 도서 카트 정리',education,'ED PB','도서관 · 도서 정리','안경·조끼·목걸이 명찰과 책이 실린 수동 도서 카트',api=>{api.object('trolley',{z:.67});api.person('librarian',{action:'push'});api.prop('bookstack',{x:-.13,y:.685,z:.67});api.prop('bookstack',{x:.14,y:.275,z:.67});});
define('librarian-reading','사서와 학생 · 함께 책 읽기',education,'ED PB','도서관 · 독서 지도','사서가 어린 학생 옆에 앉아 교재를 설명',api=>{api.object('table',{z:.65,w:1.7});for(const [x,role,scale,action]of [[-.43,'librarian',1,'consult'],[.43,'student',.85,'read']]){api.object('chair',{x,style:'wood'});api.person(role,{x,pose:'sit',action,scale,y:scale<1?.076:0});}api.prop('bookstack',{x:-.55,y:.747,z:.72});api.prop('paper',{x:.35,y:.747,z:.65});});
define('science-teacher-demo','연구원과 학생 · 실험 수업',education,'ED OE','과학 실험 교실','보호 안경·실험 가운의 강사가 유리기구를 설명',api=>{api.object('workbench',{z:.67,w:1.55});api.person('researcher',{x:-.45,action:'present'});api.person('student',{x:.65,z:-.1,action:'inspect',glasses:true});api.prop('labglass',{y:.905,z:.67});});
// Care and healthcare: dining assistance, staff breaks and new professional uniforms.
define('patient-meal','환자 · 식탁에서 식사',medical,'MD','병원 · 식사 공간','줄무늬 환자복과 손목 띠의 환자가 밥과 반찬 식사',api=>dining(api,'patient'));
define('care-meal','환자와 돌봄 담당자 · 식사 보조',medical,'MD','요양 · 식사 보조','환자는 식사하고 돌봄 담당자는 옆에서 식판 준비',api=>{dining(api,'patient',{meal:'lunchtray'});api.person('caregiver',{x:.98,z:.25,angle:-Math.PI/2,action:'meal-tray'});});
define('nurse-breaktea','간호사 · 휴게실에서 차 마시기',medical,'MD','의료진 휴게실','스크럽과 의료 캡의 간호사가 휴게 테이블에서 음료',api=>dining(api,'nurse',{action:'drink',meal:'pastry'}));
define('doctor-breaklunch','의사 · 직원 식당 점심식사',medical,'MD','의료진 식당','흰 진료복·청진기·안경의 의사가 식판으로 식사',api=>dining(api,'doctor',{meal:'lunchtray'}));
define('researcher-bench','연구원 · 비전원 실험대',medical,'MD MF ED','연구 실험실','보호 안경·장갑·실험 가운과 유리기구·기록지',api=>{api.object('workbench',{z:.65,w:1.45});api.person('researcher',{action:'inspect'});api.prop('labglass',{x:.12,y:.905,z:.65});api.prop('paper',{x:-.4,y:.905,z:.63});});
define('pharmacist-counter','약사 · 조제 안내 카운터',medical,'MD RT','약국 · 조제 안내','녹색 표식 가운·안경·명찰의 약사와 약품 모형',api=>{api.object('counter',{z:.65,w:1.45});api.person('pharmacist',{action:'inspect'});api.prop('medicines',{y:1.055,z:.65});});
define('pharmacist-consult','약사와 이용객 · 복약 상담',medical,'MD RT','약국 · 복약 상담','약사와 착석 이용객이 약품 모형을 두고 대화',api=>{api.object('table',{w:1.25,d:.75});api.object('chair',{z:-.67});api.object('chair',{z:.67,angle:Math.PI});api.person('pharmacist',{z:-.67,pose:'sit',action:'consult'});api.person('customer',{z:.67,angle:Math.PI,pose:'sit',action:'listen'});api.prop('medicines',{y:.747});});
define('dentist-visit','치과 의료진과 환자 · 도구 설명',medical,'MD','치과 · 진료 상담','의료 마스크와 스크럽의 의료진이 착석 환자에게 설명',api=>{api.object('chair',{x:.5,angle:-Math.PI/2});api.person('patient',{x:.5,angle:-Math.PI/2,pose:'sit'});api.person('dentist',{x:-.5,angle:Math.PI/2,action:'consult'});api.object('trolley',{x:-.7,z:.9});api.prop('toolset',{x:-.7,y:.685,z:.9,scale:.7});});
// Office meals and relaxation, always with a visible seat, table or supporting prop.
define('office-lunch','회사원 · 도시락 식사',office,'OF OE','사내 식당','재킷과 넥타이의 회사원이 식판으로 식사',api=>dining(api,'office',{meal:'lunchtray'}));
define('office-breaktea','회사원 · 머그컵 휴식',office,'OF FN','오피스 휴게실','업무복 직원이 컵을 입에 들고 쉬는 좌석',api=>dining(api,'office',{action:'drink',meal:'pastry'}));
define('office-lunchpair','직원 2명 · 점심식사와 대화',office,'OF MF OE','구내식당','서로 다른 업무복·머리 모양 직원이 마주 앉아 식사',api=>diningPair(api,['office','office'],['meal','pasta']));
define('office-stretch','직원 · 책상 옆 기지개',office,'OF','업무 중 휴식','팔을 위로 올려 스트레칭하는 직원과 업무 책상',api=>{api.object('desk',{x:-.72,z:.65,w:1.05});api.object('chair',{x:-.72});api.person('office',{x:.48,action:'stretch'});api.prop('paper',{x:-.72,y:.747,z:.65});});
define('office-cafe-meeting','직원 2명 · 라운지 미팅',office,'OF FN','오피스 라운지','메뉴를 든 직원과 컵을 마시는 직원의 비공식 대화',api=>diningPair(api,['office','office'],['plate','pastry'],['menu','drink']));
define('designer-drawing','디자이너 · 소재와 도면 스케치',office,'ID RS OF','공간 디자인 작업실','안경·조끼·명찰과 도면·샘플·색채 도구',api=>{api.object('desk',{z:.65,w:1.35});api.object('chair',{style:'wood'});api.person('designer',{pose:'sit',action:'write'});api.prop('paper',{y:.747,z:.57});api.prop('paintset',{x:.38,y:.747,z:.73,scale:.7});api.prop('samples',{x:-.4,y:.747,z:.8,scale:.6});});
// Hotel scenes include real luggage geometry rather than relabelled shipping cartons.
define('hotel-breakfast','투숙객 · 호텔 조식',hotel,'HT','호텔 조식당','토스트와 달걀·음료가 놓인 아침식사 좌석',api=>dining(api,'customer',{meal:'breakfast'}));
define('hotel-roomtea','투숙객 · 소파에서 차와 독서',hotel,'HT RS','객실 · 라운지 휴식','소파에 앉아 머그컵을 마시는 투숙객과 책·가방',api=>{api.object('sofa');api.person('customer',{pose:'sit',action:'drink',x:-.28});api.object('table',{z:.8,w:1.2,d:.5,h:.55});api.prop('bookstack',{x:.28,y:.557,z:.8});api.prop('totebag',{x:.45,y:.497});});
define('concierge-directions','컨시어지와 투숙객 · 지도와 캐리어',hotel,'HT TP','호텔 · 관광 안내','벨 캡과 넥타이의 컨시어지가 여행객에게 지도 설명',api=>{api.object('lectern',{x:-.5,z:.65,h:.95});api.person('concierge',{x:-.5,action:'present'});api.person('customer',{x:.68,z:.05,angle:-.7,action:'menu'});api.prop('map',{x:-.5,y:.955,z:.65});api.prop('suitcase',{x:1.15,z:.05});});
define('hotel-bellluggage','벨 직원 · 캐리어 수하물 카트',hotel,'HT','호텔 수하물 이동','벨 캡의 직원이 캐리어가 실린 수동 카트를 밀기',api=>{api.object('trolley',{z:.67});api.person('concierge',{action:'push'});api.prop('suitcase',{y:.279,z:.67,scale:.8});});
define('hotel-flower-arrange','공간 관리 직원 · 꽃 장식 준비',hotel,'HT ID','호텔 로비 장식','앞치마 직원이 수동 작업대에서 화병과 꽃을 준비',api=>{api.object('workbench',{z:.65,w:1.3});api.person('housekeeper',{action:'inspect'});api.prop('flowers',{x:.25,y:.905,z:.65});api.prop('linen',{x:-.25,y:.905,z:.64});});
define('hotel-loungepair','투숙객 2명 · 라운지 휴식',hotel,'HT','호텔 라운지','소파에 나란히 앉아 책과 머그컵으로 쉬는 이용객',api=>{api.object('sofa');api.person('customer',{x:-.4,pose:'sit',action:'read'});api.person('customer',{x:.4,pose:'sit',action:'drink'});api.object('table',{z:.82,w:1.15,d:.5,h:.55});api.prop('flowers',{y:.556,z:.82,scale:.65});});
// Retail and cooking crafts do not embed electronic appliances or Samsung products.
define('baker-knead','제빵사 · 반죽하는 작업대',retail,'RT FB HT','베이커리 · 제빵 작업','베이커 모자와 앞치마의 제빵사가 두 손으로 반죽',api=>{api.object('workbench',{z:.65,w:1.4});api.person('baker',{action:'knead'});api.prop('breadboard',{y:.905,z:.6});api.prop('bowl',{x:.45,y:.905,z:.7,scale:.75});});
define('baker-display','제빵사 · 빵 진열과 안내',retail,'RT FB','베이커리 매장','베이커 모자·포켓 앞치마와 진열된 빵·트레이',api=>{api.object('counter',{z:.65,w:1.45});api.person('baker',{action:'present'});api.prop('breadboard',{x:-.28,y:1.055,z:.65});api.prop('pastry',{x:.35,y:1.055,z:.65});});
define('chef-stir','조리사 · 볼에서 재료 섞기',retail,'FB HT ED','조리 시연 · 쿠킹 클래스','높은 조리 모자와 앞치마의 조리사가 볼을 젓기',api=>{api.object('workbench',{z:.65,w:1.3});api.person('chef',{action:'stir'});api.prop('bowl',{y:.905,z:.6});api.prop('cuttingboard',{x:.4,y:.905,z:.7,scale:.7});});
define('retailer-giftwrap','매장 직원 · 선물 포장',retail,'RT SV','매장 · 포장 공간','명찰과 앞치마의 직원이 상자와 포장지를 준비',api=>{api.object('workbench',{z:.65,w:1.2});api.person('retailer',{action:'knead'});api.prop('box',{x:.25,y:.905,z:.7,scale:.5});api.prop('paper',{x:-.2,y:.905,z:.55});});
define('retail-tasting','매장 직원과 고객 · 시식 안내',retail,'RT FB SV','식품 매장 · 시식','직원은 트레이를 들고 고객은 간식을 먹는 장면',api=>{api.object('counter',{x:-.6,z:.7,w:1.05});api.person('retailer',{x:-.5,action:'serve'});api.person('shopper',{x:.65,action:'snack'});api.prop('pastry',{x:-.6,y:1.055,z:.7});});
define('shopper-breaktea','쇼핑 고객 · 휴게 좌석과 음료',retail,'RT SV','쇼핑몰 휴게 공간','가방을 옆에 둔 쇼핑객이 음료를 마시는 좌석',api=>{dining(api,'shopper',{action:'drink',meal:'pastry'});api.prop('totebag',{x:-.45,z:-.12});});
// Manufacturing and logistics: goggles, gloves and belts remain clear through pose changes.
define('mechanic-bench','정비사 · 수공구 작업대',industry,'MF OE PB','시설 정비실','보호 안경·장갑·공구 벨트의 정비사가 공구 확인',api=>{api.object('workbench',{z:.65,w:1.4});api.person('mechanic',{action:'inspect'});api.prop('toolset',{y:.905,z:.65});});
define('mechanic-instruct','정비사와 작업자 · 공구 교육',industry,'MF OE','현장 · 정비 교육','작업복 정비사와 안전모 작업자가 수공구를 확인',api=>{api.object('workbench',{z:.7,w:1.6});api.person('mechanic',{x:-.48,action:'present'});api.person('worker',{x:.58,action:'inspect'});api.prop('toolset',{y:.905,z:.7});});
define('warehouse-lunch','현장 작업자 · 구내식당 식사',industry,'MF OE','공장 구내식당','안전모·반사 조끼·보호 안경의 작업자가 식판으로 식사',api=>dining(api,'worker',{meal:'lunchtray'}));
define('worker-breakwater','현장 작업자 · 벤치에서 음료 휴식',industry,'MF OE AD','현장 휴게실','안전모와 작업 조끼의 직원이 벤치에 앉아 컵으로 음료',api=>{api.object('bench');api.person('worker',{pose:'sit',action:'drink',x:-.25});api.object('table',{x:.85,z:.3,w:.4,d:.4,h:.6});});
define('courier-packing','물류 직원 · 포장대와 배송 가방',industry,'MF SV','물류 포장 작업','챙 모자·반사 작업 조끼와 포장대·상자',api=>{api.object('workbench',{z:.65,w:1.25});api.person('courier',{action:'knead'});api.prop('box',{x:.15,y:.905,z:.65,scale:.7});api.prop('totebag',{x:-.65,z:.2});});
define('cleaner-breaktea','환경 정비 직원 · 휴게 식탁',industry,'MF PB HT OF','직원 휴게실','작업 모자·포켓 작업복의 정비 직원이 차를 마시며 휴식',api=>dining(api,'cleaner',{action:'drink',meal:'pastry'}));
// Public and finance spaces show actual reading, paperwork, travel and meal use.
define('library-readerbench','도서관 이용객 · 벤치 독서',publicWork,'PB ED','공공 도서관','책이 놓인 벤치에서 안경을 쓰고 독서하는 이용객',api=>{api.object('bench');api.person('customer',{pose:'sit',action:'read',x:-.28,glasses:true});api.prop('bookstack',{x:.42,y:.5});api.prop('totebag',{x:.78});});
define('public-formhelper','민원 직원과 이용객 · 작성 도움',publicWork,'PB FN','민원 서식 작성대','목걸이 명찰의 직원이 착석 이용객의 서류 작성을 안내',api=>{api.object('desk',{z:.65,w:1.25});api.object('chair');api.person('customer',{pose:'sit',action:'write'});api.person('clerk',{x:.92,z:.38,angle:-Math.PI/2,action:'consult'});api.prop('paper',{y:.747,z:.6});});
define('transit-travelerbench','여행객 · 캐리어 옆 대기 독서',publicWork,'PB TP HT','교통 · 여행 대기실','캐리어와 토트백을 둔 여행객이 벤치에 앉아 책 읽기',api=>{api.object('bench');api.person('customer',{x:-.25,pose:'sit',action:'read'});api.prop('suitcase',{x:.83,z:.1});api.prop('totebag',{x:.4,y:.5});});
define('banker-breaktea','금융 직원 · 휴게실 음료',publicWork,'FN','금융 직원 휴게실','재킷·넥타이·안경의 금융 직원이 컵으로 차를 마시기',api=>dining(api,'banker',{action:'drink',meal:'pastry'}));
define('security-breakwater','안전 안내 직원 · 교대 휴식',publicWork,'PB VN','직원 교대 휴게 공간','제복 모자와 명찰을 단 안내 직원이 벤치에서 음료',api=>{api.object('bench');api.person('security',{pose:'sit',action:'drink'});api.prop('totebag',{x:.5,y:.5});});
define('public-canteen','공공시설 이용객 · 구내식당 식사',publicWork,'PB FN','공공시설 식당','식판과 밥그릇을 앞에 둔 이용객의 젓가락 식사',api=>dining(api,'customer',{action:'chopsticks',meal:'lunchtray'}));
// Arts, gardening and outdoor rest add recognizable character without powered products.
define('artist-easel','미술 강사 · 이젤과 팔레트',culture,'ED TP VN','미술 공방','베레모·물감 앞치마·귀의 연필과 그림 이젤',api=>{api.object('easel',{x:.5,z:-.35,angle:Math.PI});api.person('artist',{x:-.5,action:'present'});api.object('table',{x:-.4,z:.7,w:.9,d:.5});api.prop('paintset',{x:-.4,y:.747,z:.7});});
define('artist-class','미술 강사와 학생 · 그림 지도',culture,'ED TP','문화센터 미술 수업','베레모 강사가 작은 체형 학생의 그림 그리기를 안내',api=>{api.object('desk',{z:.65,w:1.15});api.object('chair',{style:'wood'});api.person('student',{pose:'sit',action:'write',scale:.85,y:.076});api.person('artist',{x:.95,z:.25,angle:-Math.PI/2,action:'consult'});api.prop('paper',{y:.747,z:.6});api.prop('paintset',{x:.35,y:.747,z:.7,scale:.7});});
define('gardener-potting','정원 관리사 · 분갈이 작업',culture,'TP HT RS ID','정원 · 원예 공방','넓은 챙 모자·작업 장갑·도구 벨트와 화분 작업대',api=>{api.object('workbench',{z:.65,w:1.35});api.person('gardener',{action:'knead'});api.prop('plant',{x:.3,y:.905,z:.7,scale:.6});api.prop('toolset',{x:-.3,y:.905,z:.65,scale:.7});});
define('gardener-watering','정원 관리사 · 화분 물주기',culture,'TP HT RS AD','정원 · 야외 테라스','넓은 챙 모자와 장갑의 관리사가 물뿌리개를 기울여 화분 관리',api=>{api.object('bench',{z:-.65});api.person('gardener',{action:'water',x:-.35});api.prop('plant',{x:.35,z:.65});api.prop('plant',{x:.65,z:.2,scale:.75});});
define('trainer-restdrink','운동 지도자 · 벤치에서 수분 휴식',culture,'HT VN RS','피트니스 휴게 공간','헤어밴드·호루라기·손목시계의 지도자가 음료로 휴식',api=>{api.object('bench');api.person('trainer',{pose:'sit',action:'drink',variant:0});api.object('mat',{x:.9,z:.25});api.prop('dumbbell',{x:.4,y:.545});});
define('outdoor-picnic','야외 이용객 2명 · 피크닉 식사',culture,'TP PB RS AD','공원 · 피크닉','샌드위치와 음료를 든 이용객이 목재 식탁에 마주 앉기',api=>{diningPair(api,['customer','customer'],['breakfast','salad'],['snack','drink']);api.prop('basket',{x:.95,z:.1});});

export const PEOPLE_SCENES=data;
export const PEOPLE_RECIPES=Object.fromEntries(data.map(asset=>[asset.recipe,asset.parts]));
export const PEOPLE_CATEGORIES=[...new Set(data.map(asset=>asset.category))];
export {transform as transformPeopleParts};
