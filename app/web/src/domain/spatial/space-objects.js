// Original, unpowered furnishings and props. All recipe coordinates are metres.
const B=(x,y,z,w,h,d,material='wood',extra={})=>({shape:'box',position:[x,y,z],size:[w,h,d],material,...extra});
const C=(x,y,z,r,h,material='metal',extra={})=>({shape:'cylinder',position:[x,y,z],size:[r,h,r],material,...extra});
const S=(x,y,z,rx,ry,rz,material)=>({shape:'sphere',position:[x,y,z],size:[rx,ry,rz],material});
const data=[];
function add(id,name,kind,category,industries,spaces,description,parts,extra={}){
 data.push({id:'furniture:'+id,name,kind,category,industries:industries.split(' '),spaces:spaces.split('|'),description,parts,recipe:'space-'+id,size:[1,1,1],compositionSpace:'metres',
  physical:true,powered:false,dimensionSource:'designed',license:'CC0-1.0',frontAxis:[0,0,1],keywords:[name,...spaces.split('|'),'공간 소품','공용 가구'],...extra});
}
function garment(x,top,z,color,length=.8){
 return [B(x,top-length/2,z,.31,length,.1,color,{cornerRadius:.025}),B(x-.195,top-.18,z,.12,.42,.1,color,{rotate:[0,0,-.2]}),B(x+.195,top-.18,z,.12,.42,.1,color,{rotate:[0,0,.2]}),
  B(x,top-.02,z+.06,.1,.055,.02,'linen'),B(x,top-length/2,z+.057,.01,length*.84,.012,'silver'),
  B(x-.08,top+.045,z,.18,.012,.018,'wood',{rotate:[0,0,.35]}),B(x+.08,top+.045,z,.18,.012,.018,'wood',{rotate:[0,0,-.35]}),C(x,top+.1,z,.006,.065,'metal')].map(p=>({...p,objectType:'clothing'}));
}
function folded(x,y,z,color){return [B(x,y,z,.35,.065,.28,color,{cornerRadius:.016}),B(x,y+.04,z,.28,.02,.24,'linen')].map(p=>({...p,objectType:'folded-clothes'}));}
add('wardrobe-clothes','옷이 걸린 장롱','cabinet','수납 · 진열 · 운반','FB HT RS ID RT','겉옷 케어존|드레스룸|객실','반쪽 미닫이문과 열린 수납부 안에 외투·옷걸이·접은 옷이 보이는 장롱',[
 B(0,.06,0,1.6,.12,.65),B(-.78,1.03,0,.04,1.94,.65),B(.78,1.03,0,.04,1.94,.65),B(0,1.98,0,1.6,.04,.65),B(0,1.03,-.3075,1.52,1.9,.035),B(0,.35,0,1.52,.035,.6),
 B(-.52,1.05,.33,.5,1.82,.035,'body'),B(-.33,1.08,.355,.018,.2,.025,'metal'),C(.2,1.76,-.04,.012,1.05,'metal',{rotate:[0,0,Math.PI/2]}),
 ...garment(.02,1.65,.02,'#687e96',.95),...garment(.48,1.65,.02,'#b89a76',.8),...folded(.4,.18,.03,'#9d8190'),...folded(.4,.27,.03,'#839a8a'),
]);
add('coat-rack-loaded','외투와 옷걸이가 있는 행거','shelf','수납 · 진열 · 운반','FB HT RS ID RT','겉옷 케어존|드레스룸|매장','높은 수평 봉에 색과 길이가 다른 외투 세 벌을 걸어 둔 비전동 행거',[
 ...[-.68,.68].flatMap(x=>[B(x,.035,0,.07,.07,.62,'metal'),B(x,.9,0,.035,1.75,.035,'metal')]),C(0,1.77,0,.017,1.4,'metal',{rotate:[0,0,Math.PI/2]}),
 ...garment(-.46,1.64,.04,'#5c7184',.95),...garment(0,1.64,.04,'#a98570',.75),...garment(.46,1.64,.04,'#88998a',.87),
]);
function barbell(y=1.2,z=0,length=1.85,radius=.18){
 return [C(0,y,z,.014,length,'silver',{rotate:[0,0,Math.PI/2]}),...[-1,1].flatMap(side=>[C(side*(length/2-.17),y,z,radius,.055,'#29353c',{rotate:[0,0,Math.PI/2]}),C(side*(length/2-.095),y,z,radius*.8,.04,'#414f56',{rotate:[0,0,Math.PI/2]})])].map(p=>({...p,objectType:'barbell'}));
}
function dumbbell(x,y,z,size=.09){
 return [C(x,y,z,.012,.24,'silver',{rotate:[0,0,Math.PI/2]}),...[-.105,.105].map(dx=>C(x+dx,y,z,size,.065,'#303d45',{rotate:[0,0,Math.PI/2]}))].map(p=>({...p,objectType:'dumbbell'}));
}
add('gym-power-rack','바벨과 원판을 갖춘 파워 랙','fitness-equipment','운동 · 재활 기구','HT VN OF RS','헬스장|체력단련실|피트니스','네 기둥·안전 받침·풀업 봉과 바벨·원판으로 구분되는 비전동 중량 운동 랙',[
 ...[-.76,.76].flatMap(x=>[-.53,.53].map(z=>B(x,1.075,z,.055,2.15,.055,'#485861'))),
 ...[-.53,.53].map(z=>B(0,2.12,z,1.57,.055,.055,'#485861')),...[-.76,.76].flatMap(x=>[B(x,.06,0,.12,.12,1.25,'#485861'),B(x,.8,0,.045,.045,1.1,'silver')]),
 C(0,2.19,.52,.016,1.48,'black',{rotate:[0,0,Math.PI/2]}),...barbell(1.24,.5,1.95,.19),
]);
add('gym-dumbbell-rack','아령이 놓인 2단 덤벨 랙','shelf','운동 · 재활 기구','HT VN OF RS','헬스장|체력단련실|피트니스','두 층의 받침 위에 크기가 다른 아령을 나란히 놓은 비전동 수납 랙',[
 ...[-.68,.68].map(x=>B(x,.42,0,.06,.84,.5,'#4c5b63')),...[.36,.78].map(y=>B(0,y,0,1.55,.035,.5,'#4c5b63')),
 ...[.47,.89].flatMap(y=>[-.54,-.18,.18,.54].flatMap((x,i)=>dumbbell(x,y,0,.075+i*.008))),
]);
add('gym-bench-press','바벨 벤치프레스와 원판','bench','운동 · 재활 기구','HT VN OF RS','헬스장|체력단련실|피트니스','쿠션 운동 벤치와 바벨 지지대·원판이 함께 있는 비전동 운동 기구',[
 B(0,.48,.08,.48,.12,1.45,'#566b78'),...[-.48,.48].map(z=>B(0,.22,z,.12,.44,.1,'metal')),
 ...[-.58,.58].map(x=>B(x,.58,-.52,.055,1.16,.055,'metal')),...barbell(1.14,-.52,1.9,.18),
],{supportSurfaceHeight:.54});
add('gym-barbell','운동용 바벨과 원판','accessory','운동 · 재활 기구','HT VN OF RS','헬스장|홈짐','긴 봉 양쪽에 원판이 끼워진 비전동 프리 웨이트',barbell(.18,0,1.85,.18));
add('rehab-parallel-bars','보행 재활 평행봉','fitness-equipment','운동 · 재활 기구','MD HT PB','재활치료실|보행 훈련','낮은 바닥 프레임과 양옆 손잡이를 갖춘 비전동 보행 훈련 기구',[
 ...[-.42,.42].flatMap(x=>[-.73,.73].map(z=>B(x,.48,z,.035,.96,.035,'silver'))),...[-.42,.42].map(x=>B(x,.98,0,.055,.055,1.9,'wood')),B(0,.035,0,1.05,.07,2.0,'#79938d'),
]);
add('rehab-light-weights','재활용 가벼운 아령 정리대','shelf','운동 · 재활 기구','MD HT PB','재활치료실|운동 프로그램실','낮은 선반 위에 작은 크기의 아령을 정리한 비전동 운동 도구',[
 B(0,.5,0,1.05,.035,.45,'wood'),...[-.43,.43].map(x=>B(x,.25,0,.055,.5,.38,'metal')),...[-.32,0,.32].flatMap(x=>dumbbell(x,.585,0,.06)),
]);
function shelf(parts=[],width=1.2,height=1.8,depth=.38){
 return [B(-width/2+.02,height/2,0,.04,height,depth),B(width/2-.02,height/2,0,.04,height,depth),B(0,height/2,-depth/2+.012,width,height,.024),...[.08,.5,.92,1.34,1.76].filter(y=>y<height).map(y=>B(0,y,0,width-.07,.035,depth)),...parts];
}
add('bookshelf-filled','책이 꽂힌 도서관 서가','shelf','수납 · 진열 · 운반','ED PB SV','도서관|열람실|스터디룸','층별로 책등·색·높이가 다른 책을 꽂은 서가',shelf([.1,.52,.94,1.36].flatMap((y,row)=>Array.from({length:10},(_,i)=>B(-.49+i*.105,y+.15+(i%3)*.012,.025,.07,.29+(i%3)*.025,.25,['#5e7e89','#a97a60','#84926b','#9a8297','#c2a15e'][(i+row)%5],{objectType:'book'})))));
add('retail-shelf-filled','상품이 진열된 매장 선반','shelf','수납 · 진열 · 운반','RT SV ID','매장|쇼룸|기념품점','전동 기기 없이 의류·상자·생활용품이 진열된 개방 선반',shelf([.1,.52,.94,1.36].flatMap((y,row)=>[-.36,0,.36].flatMap((x,i)=>row%2?folded(x,y+.04,.01,['#9c7f86','#7c969a','#b5a07e'][i]):[B(x,y+.12,0,.25,.23,.26,['#b69c78','#759399','#a791a1'][i],{objectType:'merchandise'})]))));
const produce=(x,y,z)=>[S(x-.08,y,z,.07,.065,.065,'#bb6c49'),S(x+.06,y,z,.075,.065,.065,'#d7a84f'),S(x,y+.04,z-.07,.08,.06,.09,'#72915a')].map(p=>({...p,objectType:'food'}));
add('food-stock-shelf','식재료가 담긴 보관 선반','rack','수납 · 진열 · 운반','FB HT MF','냉장 보관|식재료 창고|주방','비전동 선반에 식재료 상자와 채소·과일을 보관한 구성',shelf([.1,.52,.94,1.36].flatMap(y=>[-.32,.32].flatMap(x=>[B(x,y+.04,0,.46,.065,.32,'wood'),B(x-.22,y+.13,0,.025,.18,.32,'wood'),B(x+.22,y+.13,0,.025,.18,.32,'wood'),...produce(x,y+.13,0)]))));
add('laundry-basket-filled','세탁물이 담긴 바구니','decor','패브릭 · 생활 장식','HT RS ID MD','세탁실|드레스룸|리넨실','열린 수납 바구니 안에 접은 수건과 세탁물을 담은 구성',[
 B(0,.025,0,.48,.05,.4,'wood'),...[-.23,.23].map(x=>B(x,.22,0,.025,.42,.4,'wood')),...[-.19,.19].map(z=>B(0,.22,z,.46,.42,.025,'wood')),...folded(0,.27,0,'#a8bcc0'),...folded(.01,.36,.01,'#ddd7c7'),
],{placement:{mode:'floor'}});
add('carton-pallet','상자가 적재된 운반 팔레트','rack','수납 · 진열 · 운반','MF SV OE','창고|출하장|현장','목재 받침 위에 크기가 다른 봉인 상자를 올린 비전동 적재물',[
 ...[-.38,-.19,0,.19,.38].map(x=>B(x,.09,0,.17,.06,.7)),B(-.32,.035,0,.1,.07,.7),B(.32,.035,0,.1,.07,.7),
 ...[-.24,.24].flatMap(x=>[B(x,.33,0,.44,.42,.55,'#b4956d',{objectType:'carton'}),B(x,.545,0,.045,.01,.55,'#e0d3ad')]),B(0,.73,0,.5,.36,.44,'#bfa17a',{objectType:'carton'}),B(0,.915,0,.04,.01,.44,'#e0d3ad'),
]);
const surface=(id,name,industries,description,parts,supports=['counter','island','table','roundtable','coffeetable'])=>add(id,name,'decor','음식 · 조리 소품',industries,'주방|다이닝|식당',description,parts,{placement:{mode:'surface',supports,surfaceGap:.004}});
surface('food-prep-board','채소와 칼이 놓인 도마','FB HT RS ID','도마 위의 당근·토마토·채소와 비전동 조리 도구',[
 B(0,.012,0,.62,.024,.38,'wood'),...produce(-.12,.08,.02),...[-.02,.04,.1].map(x=>C(x,.042,.08,.035,.024,'#ce9258')),
 B(.18,.038,-.04,.16,.012,.035,'silver'),B(.28,.038,-.04,.09,.016,.04,'#46565d'),
],['counter','island','table']);
surface('food-stew-pot','요리가 담긴 냄비','FB HT RS ID','열원이 없는 냄비 안에 국물·채소·건더기를 표현한 조리 소품',[
 C(0,.055,0,.135,.11,'silver'),C(0,.115,0,.137,.012,'silver'),C(0,.123,0,.124,.008,'#b58a50',{objectType:'food'}),...[-.17,.17].map(x=>B(x,.075,0,.1,.035,.07,'black')),
 ...[[-.05,.04],[.05,.04],[.025,-.06]].map(([x,z])=>C(x,.137,z,.018,.015,'#ce8a4f',{objectType:'food'})),
 ...[[-.04,-.04],[.065,-.025]].map(([x,z])=>B(x,.14,z,.035,.02,.03,'#e5d5ad',{objectType:'food'})),
 ...[[-.075,0],[.01,.055],[.02,-.04]].map(([x,z])=>S(x,.14,z,.025,.01,.018,'#6e905c')),
],['induction','counter','island']);
surface('food-plated-meal','음식이 담긴 식사 접시','FB HT RS ID MD','접시 위에 밥·채소·메인 요리를 함께 담은 식사 소품',[
 C(0,.012,0,.16,.024,'body'),C(0,.026,0,.14,.01,'linen'),S(-.06,.055,-.02,.065,.026,.065,'#eee2c7'),S(.065,.052,.025,.06,.026,.05,'#a7794f'),S(.05,.052,-.07,.055,.026,.035,'#729457'),
]);
surface('food-produce-basket','채소와 과일이 담긴 바구니','FB HT RS ID','작은 비전동 바구니 안에 조리 전 식재료를 담은 소품',[
 B(0,.02,0,.46,.04,.32,'wood'),...[-.22,.22].map(x=>B(x,.11,0,.025,.22,.32,'wood')),...[-.15,.15].map(z=>B(0,.11,z,.44,.22,.025,'wood')),...produce(-.1,.12,0),...produce(.1,.13,.02),
],['counter','island','table','cabinet']);

const aliases={
 'wardrobe-clothes':['장농','장롱','옷장','옷','코트'], 'coat-rack-loaded':['행거','옷걸이','외투','재킷'],
 'gym-power-rack':['렉','랙','파워랙','스쿼트랙','바벨'], 'gym-dumbbell-rack':['아령','덤벨','웨이트'], 'gym-bench-press':['바벨','원판','벤치프레스'],
 'food-prep-board':['요리','음식','식재료','조리'], 'food-stew-pot':['요리','음식','조리','스튜'], 'food-plated-meal':['요리','음식','식사'],
};
for(const asset of data)asset.keywords.push(...(aliases[asset.id.slice(10)]||[]));
export const SPACE_ASSETS=data;
export const SPACE_RECIPES=Object.fromEntries(data.map(a=>[a.recipe,a.parts]));
