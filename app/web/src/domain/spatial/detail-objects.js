// Original generic dressing assets. Sizes are design choices, not manufacturer specifications.
const b=(x,y,z,w,h,d,material='body',extra={})=>({shape:'box',position:[x,y,z],size:[w,h,d],material,...extra});
const c=(x,y,z,r,h,material='body',extra={})=>({shape:'cylinder',position:[x,y,z],size:[r,h,r],material,...extra});
const s=(x,y,z,rx,ry,rz,material='fabric')=>({shape:'sphere',position:[x,y,z],size:[rx,ry,rz],material});
const surfaceKinds=['coffeetable','roundtable','table','desk','conference','counter','island','reception','cabinet','tray'];
const sectors={OF:'오피스 사무실 업무',FB:'카페 식당 외식 레스토랑',HT:'호텔 객실 숙박',ED:'학교 교실 교육 도서관',MD:'의료 병원 요양',FN:'금융 은행 상담',RT:'리테일 매장 쇼룸',PB:'공공 민원 대기',RS:'주거 거실 침실',ID:'인테리어 주방 다이닝',TP:'전시 체험 관광 키즈',VN:'공연 영화관 경기장',MF:'제조 공장 물류',SV:'생활 편의 무인',AD:'야외 광고',OE:'파트너 현장'};
const items=[];
function add(id,name,size,category,industries,spaces,description,parts,{mode='surface',supports=surfaceKinds,...extra}={}){
  items.push({id:'furniture:'+id,name,kind:mode==='floor-overlay'?'rug':'decor',size,recipe:'detail-'+id,parts,category,industries:industries.split(' '),spaces:spaces.split('|'),description,
    keywords:['소품','디테일',...industries.split(' ').flatMap(i=>(sectors[i]||'').split(' '))],frontAxis:[0,0,1],physical:true,powered:false,license:'CC0-1.0',dimensionSource:'designed',
    placement:{mode,...(mode==='surface'?{supports,surfaceGap:.004}:{}),...(mode==='floor-overlay'?{floorOffset:.025}:{})},...extra});
}
// Open vessels use separate walls and a bottom, so the top is visibly hollow.
function ring({radius=.43,y=.55,height=.82,thickness=.035,material='body',cx=0,segments=24}={}){
  return Array.from({length:segments},(_,i)=>{const a=i*2*Math.PI/segments;return b(cx+Math.cos(a)*radius,y,Math.sin(a)*radius,thickness,height,2*radius*Math.sin(Math.PI/segments)*1.06,material,{rotate:[0,-a,0]});});
}
const lathe=(profile,material='body',x=0)=>({shape:'lathe',profile,position:[x,0,0],size:[1,1,1],material});
function cup({handle=true,material='body',lid=false,shape='straight'}={}){
  const cx=handle?-.09:0,r=handle?.32:.43,bottom=shape==='tea'?r*.58:r*.88;
  const out=[lathe([[0,0],[bottom,0],[bottom+.015,.045],[r,.92],[r-.035,.92],[r-.035,.1],[0,.1],[0,0]],material,cx)];
  if(handle)out.push({shape:'torus',position:[.31,.5,0],size:[.17,.26,.045],material});
  if(lid)out.push(c(cx,.95,0,r+.03,.04,'wood'));
  return out;
}
function glassStem(){
  return [c(0,.02,0,.32,.035,'glass'),c(0,.23,0,.026,.43,'glass'),lathe([[.02,.4],[.12,.44],[.27,.54],[.39,.7],[.43,.85],[.39,.98],[.37,.98],[.41,.85],[.37,.7],[.25,.55],[.1,.46],[.02,.44]],'glass')];
}
function plate({deep=false,material='body'}={}){
  return [lathe(deep?[[0,0],[.28,0],[.32,.06],[.48,.93],[.46,1],[.43,.91],[.28,.15],[0,.15],[0,0]]:[[0,0],[.37,0],[.49,.66],[.49,.9],[.45,.94],[.36,.26],[0,.26],[0,0]],material)];
}
function rug({shape='rect',pattern='border',material='rug',fringe=false}={}){
  const out=shape==='rect'?[b(0,.35,0,.98,.65,.98,material)]:[c(0,.35,0,.49,.65,material)];
  if(pattern==='border'){
    if(shape==='rect')out.push(b(0,.74,-.44,.9,.08,.025,'linen'),b(0,.74,.44,.9,.08,.025,'linen'),b(-.44,.74,0,.025,.08,.9,'linen'),b(.44,.74,0,.025,.08,.9,'linen'));
    else for(let i=0;i<48;i++){const a=i*Math.PI/24;out.push(b(Math.cos(a)*.43,.74,Math.sin(a)*.43,.02,.08,.06,'linen',{rotate:[0,-a,0]}));}
  }else if(pattern==='stripe')for(let i=0;i<7;i++)out.push(b(-.39+i*.13,.74,0,.055,.08,.9,i%2?'fabric':'cushion'));
  else if(pattern==='checker')for(let x=0;x<5;x++)for(let z=0;z<5;z++)if((x+z)%2===0)out.push(b(-.36+x*.18,.74,-.36+z*.18,.17,.08,.17,'cushion'));
  else if(pattern==='dots')for(const [x,z]of [[-.25,-.24],[.22,-.18],[-.22,.22],[.23,.25],[0,0]])out.push(c(x,.74,z,.075,.08,'cushion'));
  else if(pattern==='lines')for(let i=0;i<11;i++)out.push(b(-.43+i*.086,.74,0,.025,.08,.9,'grille'));
  if(fringe)for(const z of [-.49,.49])for(let i=0;i<20;i++)out.push(b(-.45+i*.047,.38,z,.016,.2,.065,'linen'));
  return out;
}
// Floor coverings have independent shapes, textures and use-specific footprints.
for(const [id,name,size,inds,spaces,options]of [
 ['rug-wool','직사각 울 러그',[2.4,.015,1.7],'RS HT OF','거실|객실|라운지',{fringe:true}],
 ['rug-round','원형 라운지 러그',[1.8,.014,1.8],'HT OF FN','라운지|응접실',{shape:'round'}],
 ['rug-oval','타원형 소파 러그',[2.5,.015,1.5],'RS ID HT','거실|객실',{shape:'oval'}],
 ['rug-jute','원형 내추럴 라탄 러그',[1.6,.012,1.6],'FB RS HT','카페|휴게실',{shape:'round',material:'wood'}],
 ['rug-shag','두꺼운 침실 러그',[2,.03,1.5],'RS HT','침실|객실',{pattern:'stripe',material:'linen'}],
 ['rug-runner','복도 러너 러그',[.8,.012,2.8],'HT RS OF','복도|현관',{fringe:true}],
 ['rug-bedside','침대 옆 소형 러그',[.65,.012,1.3],'HT RS MD','침실|객실|요양실',{pattern:'stripe'}],
 ['mat-entry','현관 코이어 매트',[.9,.018,.6],'PB OF HT RT','현관|출입구',{pattern:'lines',material:'wood'}],
 ['mat-ribbed','출입구 골 매트',[1.2,.012,.8],'PB RT MF SV','현관|매장 입구|공장 출입',{pattern:'lines',material:'black'}],
 ['mat-kitchen','주방 작업 매트',[1.2,.012,.45],'FB RS ID','주방|탕비실',{pattern:'lines'}],
 ['mat-bath','욕실 발 매트',[.7,.012,.45],'HT RS MD','욕실|객실',{pattern:'stripe',material:'linen'}],
 ['mat-kids','키즈존 체크 놀이 매트',[2,.025,2],'ED TP MD','키즈존|유아 교실',{pattern:'checker',material:'#b7c7a5'}],
 ['mat-play-round','어린이 원형 놀이 러그',[1.5,.018,1.5],'ED TP','어린이집|키즈존',{shape:'round',pattern:'dots',material:'#d8b784'}],
 ['mat-yoga','요가 운동 매트',[.65,.01,1.8],'HT RS VN','피트니스|요가실',{pattern:'none',material:'#829b94'}],
 ['rug-picnic','야외 피크닉 매트',[1.7,.008,1.4],'TP PB HT AD','야외|테라스|공원',{pattern:'checker'}],
 ['mat-chair','의자 아래 보호 매트',[1.2,.005,1.3],'OF ED FN','업무 공간|열람실',{pattern:'none',material:'glass'}],
 ['rug-dining','다이닝 대형 러그',[2.8,.012,2],'RS HT ID','다이닝룸|식당',{pattern:'stripe'}],
 ['rug-accent','소형 포인트 러그',[.9,.014,.9],'RT FB HT','쇼룸|카페|객실',{shape:'round',pattern:'dots'}],
])add(id,name,size,'러그 · 바닥 매트',inds,spaces,'가구 아래에 겹쳐 놓을 수 있는 '+name,rug(options),{mode:'floor-overlay'});
// Cups, dishes and dining dressing: no appliance or powered-product duplicates.
for(const [id,name,size,options]of [
 ['cup-mug','세라믹 머그컵',[.115,.1,.085],{}],
 ['cup-espresso','에스프레소 잔',[.085,.06,.065],{}],
 ['cup-tea','찻잔',[.115,.065,.09],{shape:'tea'}],
 ['cup-tumbler','유리 텀블러',[.075,.13,.075],{handle:false,material:'glass'}],
 ['cup-water','물 유리컵',[.08,.095,.08],{handle:false,material:'glass'}],
 ['cup-lid','뚜껑 있는 찻잔',[.11,.105,.085],{lid:true}],
 ['cup-paper','테이크아웃 종이컵',[.085,.12,.085],{handle:false,material:'paper'}],
 ['cup-travel','비전동 휴대용 컵',[.085,.18,.085],{handle:false,lid:true,material:'metal'}],
])add(id,name,size,'컵 · 식기 · 테이블 소품','FB HT OF RS FN ED','카페|식당|회의실|업무 데스크|라운지','상판 위에 올리는 비전동 '+name,cup(options));
add('glass-wine','와인 잔',[.085,.21,.085],'컵 · 식기 · 테이블 소품','FB HT RS','레스토랑|연회장|다이닝','유리 받침·스템·빈 볼을 갖춘 잔',glassStem());
for(const [id,name,size,deep]of [
 ['dish-dinner','디너 접시',[.26,.018,.26],false],['dish-side','사이드 접시',[.17,.015,.17],false],['dish-saucer','찻잔 받침 접시',[.15,.015,.15],false],
 ['dish-bowl','식사용 볼',[.16,.075,.16],true],['dish-soup','수프 볼',[.18,.055,.18],true],['dish-small','소스 종지',[.085,.03,.085],true],
])add(id,name,size,'컵 · 식기 · 테이블 소품','FB HT RS ID','식당|주방|객실|다이닝','빈 안쪽과 테두리를 구분한 '+name,plate({deep}));
add('tray-round','원형 서빙 트레이',[.32,.025,.32],'컵 · 식기 · 테이블 소품','FB HT OF','카페|객실|라운지','컵·식기를 올려놓을 수 있는 원형 받침',plate({material:'wood'}),{supportSurface:'tray'});
add('tray-rect','사각 서빙 트레이',[.38,.035,.27],'컵 · 식기 · 테이블 소품','HT FB MD','객실|식당|요양실','테두리가 솟은 목재 사각 받침',[b(0,.15,0,.98,.25,.98,'wood'),b(-.47,.55,0,.06,.8,.97,'wood'),b(.47,.55,0,.06,.8,.97,'wood'),b(0,.55,-.47,.94,.8,.06,'wood'),b(0,.55,.47,.94,.8,.06,'wood')],{supportSurface:'tray'});
add('cutlery-set','커트러리 세트',[.1,.015,.23],'컵 · 식기 · 테이블 소품','FB HT RS','식당|연회장|다이닝','포크·나이프·스푼의 비전동 식기 소품',[b(-.32,.4,0,.055,.15,.9,'silver'),...[-.41,-.35,-.29,-.23].map(x=>b(x,.4,-.34,.025,.15,.24,'silver')),b(0,.4,0,.08,.18,.92,'silver'),b(.32,.4,.1,.055,.15,.68,'silver'),s(.32,.4,-.28,.12,.15,.18,'silver')]);
add('napkin-folded','접은 테이블 냅킨',[.18,.012,.18],'컵 · 식기 · 테이블 소품','FB HT RS','식당|연회장','얇게 접어 놓은 패브릭 냅킨',[b(0,.25,0,.98,.4,.98,'linen'),b(.04,.66,0,.88,.35,.93,'linen')]);
add('napkin-holder','냅킨 홀더',[.13,.09,.08],'컵 · 식기 · 테이블 소품','FB HT','카페|식당','종이 냅킨을 세운 비전동 홀더',[b(0,.08,0,.98,.12,.98,'wood'),b(-.44,.44,0,.08,.7,.9,'wood'),b(.44,.44,0,.08,.7,.9,'wood'),...[-.3,-.15,0,.15,.3].map(x=>b(x,.55,0,.09,.88,.82,'paper'))]);
add('condiment-set','소금·후추통 세트',[.12,.09,.06],'컵 · 식기 · 테이블 소품','FB HT RS','식당|주방','두 개의 작은 비전동 조미료 용기',[c(-.26,.43,0,.2,.8,'body'),c(.26,.43,0,.2,.8,'black'),c(-.26,.91,0,.2,.1,'silver'),c(.26,.91,0,.2,.1,'silver')]);
add('menu-paper','종이 메뉴 스탠드',[.14,.2,.06],'컵 · 식기 · 테이블 소품','FB HT RT','카페|식당|매장','화면·전자 기능이 없는 종이 메뉴 받침',[b(0,.02,0,.95,.04,.95,'wood'),b(0,.53,0,.92,.94,.05,'paper')]);
add('water-pitcher','수동 물 피처',[.15,.24,.12],'컵 · 식기 · 테이블 소품','FB HT OF','식당|회의실|카페','열선 없는 빈 유리 물병',cup({material:'glass'}));
add('teapot-manual','비전동 티포트',[.21,.13,.14],'컵 · 식기 · 테이블 소품','FB HT RS','카페|다이닝|객실','가열 장치 없이 차를 따르는 용기',[c(0,.43,0,.32,.75,'body'),c(0,.83,0,.31,.06,'wood'),c(0,.92,0,.07,.1,'wood'),b(-.35,.59,0,.29,.11,.12,'body',{rotate:[0,0,-.3]}),...cup().filter(p=>p.position[0]>.25)]);
// Books, stationery, table plants and analogue accessories.
const books=(open=false)=>open?[b(-.25,.28,0,.48,.45,.96,'paper',{rotate:[0,0,-.1]}),b(.25,.28,0,.48,.45,.96,'paper',{rotate:[0,0,.1]}),b(0,.14,0,.98,.12,.98,'wood')]:[b(0,.47,0,.94,.73,.94,'paper'),b(0,.06,0,1,.08,1,'fabric'),b(0,.89,0,1,.08,1,'fabric'),b(-.48,.47,0,.04,.82,1,'fabric')];
for(const [id,name,size,open]of [['book-closed','닫힌 책',[.18,.025,.25],false],['book-open','펼친 책',[.38,.025,.25],true],['notebook','업무용 노트',[.15,.015,.21],false],['catalog-paper','종이 브로슈어',[.21,.008,.3],false]])add(id,name,size,'책 · 문구 · 데스크 소품','OF ED HT PB FN RT','업무 데스크|열람실|객실|상담실','책상이나 테이블 위의 '+name,books(open));
add('book-stack','책 세 권 묶음',[.22,.085,.28],'책 · 문구 · 데스크 소품','ED OF RS','도서관|데스크|거실','표지 방향이 서로 다른 작은 책 더미',[b(0,.15,0,.95,.25,.96,'fabric'),b(.03,.46,.02,.92,.25,.9,'linen',{rotate:[0,.08,0]}),b(-.03,.78,0,.9,.25,.95,'wood',{rotate:[0,-.05,0]})]);
add('pen-cup','펜꽂이',[.08,.15,.08],'책 · 문구 · 데스크 소품','OF ED FN PB','업무 데스크|교실|상담실','속이 빈 용기에 펜을 꽂은 소품',[c(0,.05,0,.39,.07,'wood'),...ring({radius:.4,y:.3,height:.52,material:'wood'}),...[-.22,0,.22].map((x,i)=>b(x,.7,0,.035,.6,.035,i%2?'black':'wood',{rotate:[0,0,(i-1)*.1]}))]);
add('pencil-pair','연필 두 자루',[.04,.009,.18],'책 · 문구 · 데스크 소품','ED OF','교실|작업 데스크','책상에 눕혀 놓는 두 자루의 연필',[b(-.2,.5,0,.15,.5,.98,'wood'),b(.2,.5,0,.15,.5,.98,'black')]);
add('paper-tray','문서 트레이',[.25,.055,.34],'책 · 문구 · 데스크 소품','OF PB FN MF','업무 공간|민원실|현장 사무실','낮은 테두리와 종이 묶음의 정리함',[b(0,.06,0,.98,.1,.98,'metal'),b(-.46,.5,0,.05,.95,.96,'metal'),b(.46,.5,0,.05,.95,.96,'metal'),b(0,.24,0,.8,.2,.8,'paper')]);
add('business-card','명함 꽂이',[.1,.06,.07],'책 · 문구 · 데스크 소품','FN OF RT HT','상담실|접수대|리셉션','명함을 세워 놓는 작은 비전동 받침',[b(0,.08,0,.98,.12,.98,'wood'),b(0,.5,0,.85,.88,.08,'paper')]);
add('desk-calendar','종이 탁상 달력',[.18,.16,.08],'책 · 문구 · 데스크 소품','OF FN PB','업무 데스크|상담실','전자 화면 없는 종이 삼각 달력',[b(0,.05,0,.98,.08,.98,'wood'),b(0,.53,-.15,.95,.9,.04,'paper',{rotate:[.3,0,0]}),b(0,.53,.15,.95,.9,.04,'paper',{rotate:[-.3,0,0]})]);
add('desk-clock-analogue','아날로그 탁상 시계',[.12,.13,.055],'책 · 문구 · 데스크 소품','OF HT RS','업무 데스크|객실','화면 없는 바늘형 개념 시계',[c(0,.52,0,.46,.15,'wood',{rotate:[Math.PI/2,0,0]}),b(0,.58,.11,.035,.34,.015,'black'),b(.1,.52,.11,.22,.035,.015,'black'),b(0,.05,0,.7,.08,.85,'wood')]);
add('letter-box','우편·서류 정리함',[.23,.12,.14],'책 · 문구 · 데스크 소품','OF PB FN','접수대|업무 공간','세 칸으로 문서를 나누는 수동 정리함',[b(0,.08,0,.96,.12,.96,'wood'),...[-.46,0,.46].map(x=>b(x,.5,0,.04,.95,.9,'wood')),b(0,.52,-.44,.95,.92,.04,'wood')]);
add('glasses-case','안경 케이스',[.16,.04,.065],'책 · 문구 · 데스크 소품','OF HT MD RS','데스크|객실|요양실','손바닥 크기의 닫힌 소품 케이스',[b(0,.5,0,.96,.9,.94,'fabric')]);
add('nameplate','비전원 데스크 명패',[.22,.07,.06],'책 · 문구 · 데스크 소품','FN OF PB','상담 창구|민원실|업무 데스크','전자 디스플레이가 아닌 탁상 명패',[b(0,.05,0,.98,.08,.98,'wood'),b(0,.55,0,.94,.9,.08,'metal',{rotate:[-.2,0,0]})]);
// Soft furnishings and decorative accessories.
for(const [id,name,size,round,material]of [
 ['cushion-square','사각 소파 쿠션',[.45,.14,.45],false,'cushion'],['cushion-round','원형 소파 쿠션',[.4,.13,.4],true,'fabric'],['pillow-bed','침대 베개',[.65,.15,.43],false,'linen'],['cushion-bolster','원통형 휴식 쿠션',[.55,.16,.16],true,'linen'],
])add(id,name,size,'패브릭 · 생활 장식','RS HT OF MD','소파|침실|객실|케어 라운지','좌판이나 침상 위에 놓는 '+name,round?[s(0,.5,0,.49,.48,.49,material)]:[b(0,.5,0,.98,.92,.98,material,{cornerRadius:.22})],{supports:['sofa','bed','hospitalbed','chair','bench'],placement:{mode:'surface',supports:['sofa','bed','hospitalbed','chair','bench'],surfaceGap:.004,surfaceHeights:{sofa:.51,bed:.52,hospitalbed:.47,chair:.5,bench:1}}});
add('throw-folded','접은 소파 블랭킷',[.65,.045,.85],'패브릭 · 생활 장식','RS HT OF','소파|객실|라운지','두 겹으로 접은 휴식용 패브릭',[b(0,.24,0,.98,.4,.98,'fabric'),b(.02,.69,.01,.94,.4,.95,'cushion')],{placement:{mode:'surface',supports:['sofa','bed','bench'],surfaceGap:.004,surfaceHeights:{sofa:.51,bed:.52,bench:1}}});
add('towels-folded','접은 수건 묶음',[.3,.075,.22],'패브릭 · 생활 장식','HT MD RS','객실|욕실|케어 공간','세 겹으로 쌓은 흰 수건',[b(0,.16,0,.98,.28,.98,'linen'),b(.02,.48,0,.94,.28,.95,'linen'),b(0,.8,0,.9,.28,.93,'linen')]);
add('tissue-box','각티슈 케이스',[.23,.12,.13],'패브릭 · 생활 장식','OF HT MD FN RS','데스크|객실|접수대','종이 한 장이 나온 비전동 티슈 케이스',[b(0,.35,0,.96,.64,.96,'wood'),b(0,.8,0,.45,.38,.06,'paper',{rotate:[.2,0,.1]})]);
add('photo-frame','탁상 사진 액자',[.16,.2,.075],'패브릭 · 생활 장식','RS HT OF','객실|거실|데스크','전기 디지털 액자가 아닌 작은 종이 사진 프레임',[b(0,.52,0,.98,.96,.08,'wood'),b(0,.52,.05,.8,.77,.015,'paper'),b(0,.25,-.2,.06,.5,.06,'wood',{rotate:[-.4,0,0]})]);
add('vase-small','소형 꽃병',[.095,.18,.095],'패브릭 · 생활 장식','HT FB FN RS','라운지|식당|상담실','빈 입구가 있는 비전동 테이블 꽃병',[c(0,.05,0,.33,.08,'body'),...ring({radius:.36,y:.4,height:.7}),...ring({radius:.23,y:.88,height:.2})]);
add('plant-succulent','탁상 다육 화분',[.12,.15,.12],'패브릭 · 생활 장식','OF FB HT RS','데스크|카페|객실','작은 화분과 두꺼운 잎의 탁상 식재',[c(0,.2,0,.35,.37,'pot'),s(0,.55,0,.17,.28,.17,'leaf'),...[-.23,.23].map(x=>s(x,.55,0,.18,.13,.18,'leaf'))]);
add('plant-mini','소형 탁상 화분',[.2,.3,.2],'패브릭 · 생활 장식','OF FN HT PB','업무 데스크|상담실|접수대','큰 수목과 구분되는 작은 탁상 식재',[c(0,.2,0,.32,.38,'pot'),b(0,.53,0,.025,.55,.025,'wood'),s(-.16,.65,0,.22,.22,.17,'leaf'),s(.15,.78,0,.25,.21,.17,'leaf')]);
add('basket-small','소형 라탄 수납 바구니',[.27,.18,.22],'패브릭 · 생활 장식','HT RS MD','객실|욕실|요양실','상판용 작은 입구 열린 수납 바구니',[b(0,.05,0,.96,.08,.96,'wood'),...[-.46,.46].map(x=>b(x,.5,0,.055,.93,.94,'wood')),...[-.46,.46].map(z=>b(0,.5,z,.93,.93,.055,'wood'))]);
add('basket-floor','바닥 수납 바구니',[.4,.42,.35],'패브릭 · 생활 장식','RS HT MD ED','거실|객실|교실','바닥에 놓는 열린 생활용 수납 바구니',[b(0,.05,0,.96,.08,.96,'wood'),...[-.46,.46].map(x=>b(x,.5,0,.055,.93,.94,'wood')),...[-.46,.46].map(z=>b(0,.5,z,.93,.93,.055,'wood'))],{mode:'floor'});
add('umbrella-basket','우산 보관 바구니',[.3,.55,.3],'패브릭 · 생활 장식','OF PB HT RT','현관|로비|매장 입구','화면이나 건조 기능 없는 비전동 우산 보관함',[c(0,.035,0,.4,.05,'metal'),...ring({radius:.42,y:.5,height:.94,material:'metal'})],{mode:'floor'});
add('vase-floor','바닥용 긴 장식 화병',[.28,.7,.28],'패브릭 · 생활 장식','HT RS ID TP','객실|로비|쇼룸','키가 큰 입구 열린 장식 화병',[c(0,.03,0,.34,.04,'body'),...ring({radius:.36,y:.4,height:.72}),...ring({radius:.2,y:.86,height:.25})],{mode:'floor'});
add('doorstop','바닥 도어 스토퍼',[.1,.045,.08],'패브릭 · 생활 장식','OF HT RS PB','현관|객실|회의실','바닥 가까이 두는 작은 비전동 도어 고정 소품',[b(0,.5,0,.98,.9,.95,'black',{rotate:[0,0,.1]})],{mode:'floor'});
add('floor-cushion','좌식 바닥 방석',[.55,.08,.55],'패브릭 · 생활 장식','RS FB ED TP','좌식 카페|키즈존|휴게실','바닥에 놓는 넓고 낮은 패브릭 방석',[b(0,.5,0,.98,.9,.98,'cushion')],{mode:'floor'});

export const DETAIL_ASSETS=items;
export const DETAIL_RECIPES=Object.fromEntries(items.map(a=>[a.recipe,a.parts]));
export const DETAIL_CATEGORIES=[...new Set(items.map(a=>a.category))];
