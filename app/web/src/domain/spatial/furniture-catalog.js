// Original, non-electronic furnishing concepts, in metres. No manufacturer models.
// Semantic kinds stay compatible with seating, collision and support policies.
const box=(x,y,z,w,h,d,material='wood',extra={})=>({shape:'box',position:[x,y,z],size:[w,h,d],material,...extra});
const cyl=(x,y,z,r,h,material='metal',extra={})=>({shape:'cylinder',position:[x,y,z],size:[r,h,r],material,...extra});
const feet=(top=.44,material='wood',spread=.4)=>[-spread,spread].flatMap(x=>[-.36,.36].map(z=>box(x,top/2,z,.055,top,.055,material)));
const rail=(x,y,z,w,d,material='metal')=>box(x,y,z,w,.035,d,material);
function chair({arms=false,base='four',back='panel',material='fabric',level=.46,head=false,footrest=false}={}){
  const out=[box(0,level,0,.88,.12,.8,material)];
  if(back==='slats'){
    out.push(box(-.39,.74,-.36,.06,.5,.06,'wood'),box(.39,.74,-.36,.06,.5,.06,'wood'));
    for(const x of [-.26,-.13,0,.13,.26])out.push(box(x,.77,-.36,.055,.34,.045,'wood'));
  }else if(back==='mesh'){
    out.push(box(0,.75,-.36,.85,.43,.045,'grille'),box(-.43,.75,-.36,.035,.46,.07,'black'),box(.43,.75,-.36,.035,.46,.07,'black'));
  }else if(back==='tub'){
    out.push(box(0,.77,-.36,.86,.42,.18,material),box(-.4,.64,-.02,.16,.34,.65,material),box(.4,.64,-.02,.16,.34,.65,material));
  }else if(back==='cross'){
    out.push(box(-.39,.75,-.36,.06,.48,.06,'wood'),box(.39,.75,-.36,.06,.48,.06,'wood'),box(0,.77,-.36,.85,.065,.06,'wood',{rotate:[0,0,.45]}),box(0,.77,-.36,.85,.065,.06,'wood',{rotate:[0,0,-.45]}));
  }else if(back!=='none')out.push(box(0,head?.69:.76,-.36,.88,head?.41:.43,.13,material));
  if(head)out.push(box(0,.94,-.35,.6,.12,.17,material));
  if(base==='spider'||base==='pedestal'){
    out.push(cyl(0,level/2,0,.035,level,'metal'));
    if(base==='pedestal')out.push(cyl(0,.035,0,.4,.05,'metal'));
    else for(let i=0;i<5;i++){const a=i*Math.PI*2/5;out.push(box(Math.sin(a)*.2,.065,Math.cos(a)*.2,.06,.04,.43,'metal',{rotate:[0,a,0]}),cyl(Math.sin(a)*.39,.04,Math.cos(a)*.39,.045,.04,'black'));}
  }else if(base==='sled'||base==='cantilever'){
    for(const x of [-.39,.39])out.push(box(x,.025,0,.045,.05,.9,'metal'),box(x,level/2,base==='sled'?-.33:.32,.045,level,.045,'metal'));
    if(base==='sled')out.push(rail(0,.03,.36,.83,.05));
    else out.push(rail(0,level,-.25,.84,.05));
  }else if(base==='folding'){
    for(const x of [-.38,.38])for(const angle of [-.55,.55])out.push(box(x,level/2,0,.045,level*1.15,.045,'metal',{rotate:[angle,0,0]}));
  }else out.push(...feet(level-.06,material==='wood'?'wood':'metal'));
  if(arms&&back!=='tub')for(const x of [-.45,.45])out.push(box(x,.59,0,.04,.2,.04,'metal'),box(x,.69,0,.09,.055,.66,material));
  if(footrest)out.push(rail(0,.23,.3,.78,.06),...[-.36,.36].map(x=>rail(x,.23,0,.05,.65)));
  return out;
}
function sofa({seats=2,arms=true,back='low',chaise=false}={}){
  const out=[box(0,.22,0,.96,.32,.9,'fabric'),box(0,back==='high'?.7:.65,-.37,.96,back==='high'?.57:.42,.2,'fabric'),...feet(.1,'metal')];
  for(let i=0;i<seats;i++)out.push(box((i-(seats-1)/2)*.82/seats,.43,.03,.79/seats,.16,.71,'cushion'));
  if(arms)for(const x of [-.46,.46])out.push(box(x,.5,0,.08,.47,.9,'fabric'));
  if(chaise)out.push(box(.24,.29,.3,.44,.38,.38,'fabric'));
  return out;
}
function bench({back=false,arms=false,beam=false,seats=3}={}){
  const out=beam?[rail(0,.42,0,.97,.09),...[-.36,.36].map(x=>box(x,.22,0,.05,.44,.08,'metal')),rail(-.36,.035,0,.1,.7),rail(.36,.035,0,.1,.7)]:[...feet(.46,'metal')];
  for(let i=0;i<seats;i++){
    const x=(i-(seats-1)/2)*.95/seats;
    out.push(box(x,.49,0,.9/seats,.1,.83,beam?'metal':'wood'));
    if(back)out.push(box(x,.76,-.36,.9/seats,.42,.08,beam?'body':'wood'));
  }
  if(arms)for(const x of [-.48,.48])out.push(box(x,.62,.02,.045,.28,.06,'metal'),rail(x,.76,.02,.06,.75));
  return out;
}
function table({shape='rect',base='four',partition=false,tilt=false,drawers=false}={}){
  const out=[];
  if(shape==='round')out.push(cyl(0,.94,0,.49,.08,'wood'));
  else if(shape==='L')out.push(box(-.14,.94,-.2,.72,.08,.55,'wood'),box(.34,.94,.14,.3,.08,.95,'wood'));
  else if(shape==='hex'){
    out.push(box(0,.94,0,.72,.08,.9,'wood'),box(0,.94,0,.72,.08,.9,'wood',{rotate:[0,Math.PI/3,0]}),box(0,.94,0,.72,.08,.9,'wood',{rotate:[0,-Math.PI/3,0]}));
  }else out.push(box(0,.94,0,.98,.08,.96,'wood',tilt?{rotate:[-.16,0,0]}:{}));
  if(base==='pedestal')out.push(cyl(0,.46,0,.035,.9),cyl(0,.035,0,.34,.05));
  else if(base==='trestle')for(const x of [-.34,.34])out.push(box(x,.46,0,.045,.9,.045,'metal'),box(x,.04,0,.09,.06,.85,'metal'));
  else if(base==='panel')for(const x of [-.42,.42])out.push(box(x,.46,0,.04,.9,.85,'wood'));
  else out.push(...feet(.9,'metal'));
  if(partition)out.push(box(0,.77,-.45,.97,.44,.035,'fabric'),box(-.47,.77,0,.035,.44,.94,'fabric'),box(.47,.77,0,.035,.44,.94,'fabric'));
  if(drawers)for(let i=0;i<3;i++)out.push(box(.32,.3+i*.2,0,.26,.18,.75,'body'),rail(.32,.3+i*.2,.39,.12,.02));
  return out;
}
function storage({rows=4,columns=1,open=false,glass=false,wheels=false,back=true}={}){
  const out=[box(-.475,.5,0,.05,1,.94,'wood'),box(.475,.5,0,.05,1,.94,'wood'),box(0,.97,0,.95,.05,.94,'wood'),box(0,.03,0,.95,.05,.94,'wood')];
  if(back)out.push(box(0,.5,-.46,.95,.95,.035,'wood'));
  for(let i=1;i<rows;i++)out.push(box(0,i/rows,0,.94,.025,.9,'wood'));
  for(let i=1;i<columns;i++)out.push(box(-.47+i*.94/columns,.5,0,.025,.95,.9,'wood'));
  if(!open)for(let c=0;c<columns;c++)for(let r=0;r<rows;r++)out.push(box(-.47+(c+.5)*.94/columns,(r+.5)/rows,.475,.9/columns,.93/rows,.03,glass?'glass':'body'),box(-.47+(c+.5)*.94/columns,(r+.5)/rows,.5,.08,.015,.02,'metal'));
  if(wheels)for(const x of [-.4,.4])for(const z of [-.36,.36])out.push(cyl(x,.035,z,.045,.05,'black'));
  return out;
}
function bed({single=false,bunks=false,canopy=false,care=false}={}){
  const out=[box(0,.23,0,.98,.25,.95,'wood'),box(0,.43,0,.94,.18,.89,'linen'),box(0,.55,.15,.94,.04,.58,'cushion'),box(0,.62,-.46,1,.7,.06,'fabric'),...feet(.13,'wood')];
  for(const x of single?[0]:[-.23,.23])out.push(box(x,.57,-.31,single?.72:.4,.08,.2,'linen'));
  if(care)for(const x of [-.48,.48])out.push(box(x,.62,0,.035,.04,.7,'metal'),box(x,.53,-.28,.025,.2,.025,'metal'),box(x,.53,.28,.025,.2,.025,'metal'));
  if(bunks){out.push(box(0,.76,0,.96,.04,.92,'wood'),box(0,.82,0,.9,.08,.9,'linen'));for(const x of [-.47,.47])for(const z of [-.46,.46])out.push(box(x,.5,z,.05,1,.05,'wood'));out.push(box(.46,.92,0,.035,.04,.8,'wood'));}
  if(canopy)for(const x of [-.47,.47])for(const z of [-.46,.46])out.push(box(x,.52,z,.035,.96,.035,'wood'));
  return out;
}
const sectors={OF:['오피스','사무실','업무'],FB:['외식','카페','식음','레스토랑'],HT:['호텔','리조트','숙박'],ED:['교육','학교','캠퍼스'],MD:['의료','병원','요양'],FN:['금융','은행','상담'],RT:['리테일','매장','판매'],SV:['생활 편의','무인 매장'],PB:['공공','교통','민원'],VN:['공연장','영화관','경기장'],TP:['관광','전시','테마파크'],MF:['제조','물류','공장'],RS:['주거','아파트','주택'],ID:['인테리어','가구'],AD:['광고','야외'],OE:['파트너','현장']};
const variants=[];
function add(id,name,kind,size,category,industries,spaces,description,parts,extra={}){
  variants.push({id:'furniture:'+id,name,kind,size,recipe:'furniture-'+id,parts,category,industries:industries.split(' '),spaces:spaces.split('|'),description,
    keywords:[...new Set(industries.split(' ').flatMap(code=>sectors[code]||[]))],frontAxis:[0,0,1],physical:true,powered:false,license:'CC0-1.0',dimensionSource:'designed',...extra});
}
const seat=(id,name,size,inds,spaces,desc,options={},extra={})=>add(id,name,options.base==='spider'?'taskchair':options.level>.6?'stool':'chair',size,'의자 · 좌석',inds,spaces,desc,chair(options),extra);
// Distinct frames, backs, arms and bases, rather than model-number or colour variants.
seat('office-mesh','메시 사무용 의자',[.62,1.05,.62],'OF FN','업무 공간|개인 좌석','통기형 등판·팔걸이·오발 캐스터 베이스의 업무 의자',{base:'spider',back:'mesh',arms:true});
seat('executive-chair','임원 하이백 의자',[.7,1.22,.7],'OF FN','임원실|대표실|VIP 상담실','헤드레스트와 높은 쿠션 등판을 갖춘 업무 의자',{base:'spider',arms:true,head:true});
seat('meeting-sled','회의실 슬레드 체어',[.5,.86,.54],'OF FN HT','미팅룸|회의실|상담실','바닥을 잇는 슬레드 프레임과 얇은 등판의 협업 좌석',{base:'sled'},{autoPlacement:{base:'chair',industries:['OF'],roomKinds:['meeting']}});
seat('visitor-cantilever','방문객 캔틸레버 의자',[.56,.9,.57],'OF FN PB','접견실|상담실|민원 상담','앞쪽 프레임만으로 좌판을 지지하는 팔걸이 방문객 의자',{base:'cantilever',arms:true});
seat('training-stack','교육장 적층 의자',[.48,.83,.52],'OF ED PB','교육장|세미나실|다목적실','팔걸이가 없는 가벼운 금속 프레임의 적층 좌석',{base:'four',material:'body'});
seat('folding-event','행사용 접이식 의자',[.46,.8,.5],'VN TP PB ED','행사장|세미나|전시 대기','교차 다리와 얇은 좌판을 가진 이동·보관용 접이 좌석',{base:'folding',material:'wood'});
seat('drafting-chair','작업대용 높은 의자',[.58,1.18,.58],'MF OF','설계 작업대|검사대|제도실','높은 좌판과 발 지지대를 갖춘 비전동 작업 의자',{base:'spider',level:.65,footrest:true});
seat('industrial-chair','현장 작업용 의자',[.52,.88,.52],'MF OE','작업실|검사실|현장 사무실','세척하기 쉬운 단순 좌판과 금속 다리의 작업 의자',{material:'body',back:'panel'});
seat('cafe-bentwood','카페 곡목 체어',[.48,.84,.52],'FB HT RS','카페|베이커리|라운지','세로 살 등받이와 원목 다리를 가진 카페 좌석',{material:'wood',back:'slats'},{autoPlacement:{base:'chair',industries:['FB'],roomKinds:['dining','lounge']}});
seat('cafe-metal','카페 메탈 체어',[.45,.82,.5],'FB RT','카페|푸드코트|캐주얼 다이닝','얇은 금속 프레임과 교차형 등받이의 캐주얼 좌석',{material:'metal',back:'cross'});
seat('dining-upholstered','레스토랑 패브릭 체어',[.53,.9,.57],'FB HT ID','레스토랑|다이닝|식당','쿠션 좌판과 감싼 등받이를 가진 식사 좌석',{material:'fabric',back:'tub'},{autoPlacement:{base:'chair',industries:['HT'],roomKinds:['dining']}});
seat('dining-arm','다이닝 암체어',[.58,.86,.58],'RS ID HT','다이닝룸|가족 식당','양쪽 팔걸이와 낮은 패브릭 등판의 주거용 식사 의자',{arms:true},{autoPlacement:{base:'chair',industries:['RS','ID'],roomKinds:['dining','kitchen']}});
seat('banquet-chair','호텔 연회 체어',[.49,.94,.54],'HT VN','연회장|볼룸|웨딩홀','높고 좁은 쿠션 등판과 독립 다리의 연회장 좌석',{material:'cushion'},{autoPlacement:{base:'chair',industries:['HT'],roomKinds:['meeting','theatre']}});
seat('bar-backrest','등받이 바 체어',[.46,1.08,.46],'FB HT RS','바|키친 아일랜드|카페 카운터','높은 좌판·낮은 등받이·발 지지대가 있는 바 좌석',{level:.67,footrest:true,material:'wood'},{autoPlacement:{base:'stool',industries:['FB','HT']}});
seat('bar-pedestal','페데스탈 바 스툴',[.45,.78,.45],'FB HT','바 카운터|카페','원형 받침대와 등받이 없는 높은 좌판의 비전동 스툴',{base:'pedestal',level:.89,back:'none',footrest:true});
seat('outdoor-bistro','테라스 비스트로 체어',[.48,.84,.52],'FB HT TP','테라스|야외 카페|정원','얇은 접이 프레임과 목재 등판을 갖춘 야외 식사 좌석',{base:'folding',material:'wood'});
seat('school-chair','학생용 교실 의자',[.44,.78,.47],'ED','교실|학습실|학교','작은 좌판과 독립 금속 다리의 학생용 좌석',{material:'wood'},{autoPlacement:{base:'chair',industries:['ED'],roomKinds:['classroom']}});
seat('kids-chair','유아용 낮은 의자',[.34,.56,.36],'ED TP MD','유치원|어린이집|키즈존','낮은 좌판과 짧은 원목 다리의 어린이 좌석',{material:'#d8a95e'});
seat('library-chair','도서관 열람 의자',[.48,.84,.52],'ED PB','도서관|열람실|스터디','팔걸이 없는 목재 등판과 패브릭 좌판의 열람 좌석',{base:'sled',material:'wood'});
seat('lecture-chair','강의실 암체어',[.54,.9,.56],'ED OF','강의실|연수원|세미나실','팔걸이가 있는 고정형 강의·토론용 의자',{base:'sled',arms:true});
seat('medical-visitor','진료실 방문객 의자',[.52,.88,.54],'MD','진료실|의료 상담|병실','팔걸이와 단순한 닦음형 좌판을 갖춘 진료 방문객 좌석',{arms:true,material:'body'},{autoPlacement:{base:'chair',industries:['MD']}});
seat('care-highback','요양용 하이백 암체어',[.64,1.12,.66],'MD','요양실|보호자실|케어 라운지','높은 등판과 두꺼운 팔걸이의 비전동 휴식 좌석',{arms:true,head:true});
seat('clinic-stool','진찰용 회전 스툴',[.45,.58,.45],'MD','진찰실|처치실|의료 작업실','등받이 없는 낮은 회전 좌판과 캐스터 베이스',{base:'spider',back:'none',level:.8,material:'body'});
seat('care-saddle','의료 작업용 등받이 스툴',[.46,.82,.46],'MD','간호 작업실|검사실','작은 등판과 이동식 베이스의 작업 좌석',{base:'spider',material:'body'});
seat('bank-consult','금융 상담 체어',[.52,.9,.54],'FN','은행 상담실|보험 상담실|금융 창구','정돈된 쿠션 등판과 슬레드 베이스의 고객 상담 좌석',{base:'sled',arms:true},{autoPlacement:{base:'chair',industries:['FN']}});
seat('bank-teller','창구 직원용 의자',[.58,1.02,.58],'FN PB','은행 창구|민원 접수','메시 등판과 이동식 베이스의 창구 업무 좌석',{base:'spider',back:'mesh'});
seat('retail-fitting','피팅룸 보조 체어',[.47,.78,.49],'RT ID','피팅룸|쇼룸|상담 존','낮은 곡면형 등받이와 목재 다리의 매장 보조 좌석',{back:'tub',material:'cushion'},{autoPlacement:{base:'chair',industries:['RT','SV']}});
seat('public-visitor','민원 상담 의자',[.48,.84,.52],'PB OE','민원실|공공 상담|접수 창구','얇은 팔걸이 없는 좌판과 금속 다리의 상담용 좌석',{base:'sled',material:'body'},{autoPlacement:{base:'chair',industries:['PB','OE']}});
seat('auditorium-chair','공연장 고정 좌석',[.55,1,.66],'VN ED PB','공연장|강당|대강의실','두꺼운 등판·팔걸이·바닥 고정 베이스의 관람 좌석',{base:'pedestal',arms:true,head:true},{autoPlacement:{base:'chair',industries:['VN','TP','AD'],roomKinds:['theatre']}});
seat('cinema-recliner','시네마 수동 리클라이너',[.88,1.08,.95],'VN HT','영화관|시네마|상영실','넓은 쿠션과 깊은 좌판의 비전동 관람용 리클라이너',{back:'tub',arms:true,head:true});
seat('stadium-seat','경기장 독립 관람석',[.49,.82,.55],'VN TP','경기장|관중석|체육관','성형 좌판과 바닥 고정 받침을 가진 관람 좌석',{base:'pedestal',material:'#637f98'});
seat('vip-lounge-chair','VIP 라운지 암체어',[.72,.92,.72],'HT FN VN','VIP 라운지|귀빈실|응접실','넓은 감싸는 등판과 낮은 쿠션 좌판의 휴식 의자',{back:'tub',base:'pedestal'});
// Multi-seat and soft seating.
for(const [id,name,size,inds,spaces,desc,options,kind] of [
  ['waiting-beam','공공 대기용 연결 의자',[1.8,.82,.6],'PB MD SV','대합실|대기실|민원실','세 좌석을 하나의 금속 빔에 고정한 연결 대기석',{beam:true,back:true},'bench'],
  ['waiting-arm-beam','병원 팔걸이 연결 대기석',[1.9,.88,.65],'MD','병원 로비|외래 대기실','독립 좌판과 양끝 팔걸이를 가진 연결 대기석',{beam:true,back:true,arms:true},'bench'],
  ['park-bench','공원 등받이 벤치',[1.8,.85,.58],'PB TP HT AD','공원|광장|산책로','목재 좌판·등받이와 양끝 팔걸이를 갖춘 야외 벤치',{back:true,arms:true},'bench'],
  ['gym-bench','탈의실 벤치',[1.5,.43,.42],'HT VN ED','탈의실|체육관|피트니스','등받이 없는 좁고 긴 목재 착석 벤치',{},'bench'],
  ['sofa-single','라운지 1인 소파',[.85,.86,.85],'OF HT FN','휴게실|라운지|응접','단독 쿠션과 넓은 팔걸이를 가진 1인 휴식 소파',{seats:1},'sofa'],
  ['sofa-three','호텔 3인 소파',[2.3,.88,.9],'HT FN','호텔 로비|VIP 라운지','세 개의 독립 좌방석과 일자 등판을 갖춘 로비 소파',{seats:3},'sofa'],
  ['sofa-modular','모듈형 라운지 소파',[1.65,.79,.84],'OF RT TP','협업 라운지|전시 휴게','팔걸이를 없앤 낮은 독립 모듈 소파',{seats:2,arms:false},'sofa'],
  ['sofa-highback','하이백 집중 소파',[1.8,1.35,.88],'OF ED','집중 라운지|도서관|휴게실','시선을 가리는 높은 등판과 양옆 팔걸이의 휴식 모듈',{seats:2,back:'high'},'sofa'],
  ['sofa-chaise','주거용 카우치 소파',[2.4,.84,1.5],'RS ID','거실|패밀리룸','한쪽에 긴 휴식 좌판을 둔 비전동 카우치 소파',{seats:3,chaise:true},'sofa'],
  ['sofa-booth','카페 부스 소파',[1.8,1.2,.64],'FB HT','카페 부스|레스토랑 벽면','높은 등판과 얕은 좌판을 갖춘 벽면용 부스 소파',{seats:3,arms:false,back:'high'},'sofa'],
  ['sofa-care','케어 라운지 소파',[1.65,.98,.8],'MD','요양 라운지|보호자 휴게','단단한 좌판과 높인 팔걸이를 가진 비전동 케어 소파',{seats:2,back:'high'},'sofa'],
])add(id,name,kind,size,kind==='bench'?'벤치 · 연결 좌석':'소파 · 라운지',''+inds,spaces,desc,kind==='bench'?bench(options):sofa(options));
// Desks and tables, without integrated electronics or powered lifting mechanisms.
for(const [id,name,kind,size,inds,spaces,desc,options] of [
 ['desk-compact','소형 개인 업무 데스크','desk',[1.2,.74,.6],'OF RS','개인 업무|홈오피스','작은 면적의 독립 업무용 직사각형 책상',{}],
 ['desk-executive','임원용 서랍 데스크','desk',[1.8,.75,.8],'OF FN','임원실|대표실','측면 서랍과 넓은 상판을 가진 비전동 업무 책상',{drawers:true}],
 ['desk-return','L자 코너 데스크','desk',[1.8,.75,1.5],'OF MF','관제실|설계실|코너 업무석','별도 작업 면을 갖춘 L자 형태의 코너 책상',{shape:'L'}],
 ['desk-carrel','도서관 개인 열람대','desk',[.95,1.2,.7],'ED PB','도서관|열람실|스터디','정면과 양옆에 칸막이를 갖춘 비전동 개인 열람대',{partition:true}],
 ['desk-student','학생용 1인 책상','desk',[.7,.72,.5],'ED','교실|학습실','얇은 상판과 독립 금속 다리의 1인 학습 책상',{}],
 ['desk-kids','유아용 낮은 책상','desk',[.9,.52,.55],'ED TP','유치원|어린이집|키즈존','낮은 상판 높이의 어린이 활동용 테이블',{}],
 ['desk-drafting','제도용 경사 작업대','desk',[1.2,.9,.8],'OF ED MF','제도실|설계실|미술실','상판이 기울어진 비전동 도면·미술 작업대',{tilt:true,base:'trestle'}],
 ['desk-reception-small','소형 안내 데스크','reception',[1.4,1.05,.65],'PB RT SV','안내실|매장 입구','작은 면적의 독립형 안내 카운터',{base:'panel'}],
 ['table-cafe-two','카페 2인 사각 테이블','table',[.7,.73,.7],'FB HT','카페|베이커리','작은 정사각 상판과 중앙 받침의 2인 테이블',{base:'pedestal'}],
 ['table-cafe-round','카페 소형 원형 테이블','roundtable',[.65,.73,.65],'FB HT','카페|라운지','작은 원형 상판과 원판 받침의 카페 테이블',{shape:'round',base:'pedestal'}],
 ['table-dining-four','레스토랑 4인 테이블','table',[1.35,.75,.8],'FB HT RS','레스토랑|식당|다이닝','독립 다리 네 개와 넓은 사각 상판의 식사 테이블',{}],
 ['table-family-six','주거용 6인 식탁','table',[1.8,.75,.9],'RS ID','가족 식당|다이닝룸','양쪽 패널 다리로 지지하는 긴 가족 식탁',{base:'panel'}],
 ['table-bar-high','바 높이 스탠딩 테이블','table',[1.4,1.05,.55],'FB OF HT','바|휴게 라운지','높고 좁은 상판과 T자 다리의 비전동 스탠딩 테이블',{base:'trestle'}],
 ['table-collaboration','협업용 대형 테이블','conference',[3.2,.75,1.2],'OF ED','프로젝트실|협업 공간','양쪽에서 공동 작업하는 넓은 상판의 협업 테이블',{base:'trestle'}],
 ['table-huddle','소규모 미팅 테이블','table',[1.6,.74,.8],'OF FN','허들룸|소회의실','4인 이하 협업에 맞춘 짧은 직사각 테이블',{base:'trestle'}],
 ['table-training-fold','교육장 접이 테이블','table',[1.8,.73,.45],'ED OF PB','교육장|세미나실','얕은 상판과 T자 받침의 이동식 교육 테이블',{base:'trestle'}],
 ['table-kids-round','어린이 원형 활동 테이블','roundtable',[1,.52,1],'ED TP','유아 교실|어린이 체험','낮은 원형 상판을 가진 공동 활동 테이블',{shape:'round'}],
 ['table-lab','실험실 작업 테이블','table',[1.8,.9,.8],'ED MF','실험실|실습실','높은 작업 상판과 수직 패널 받침의 비전동 실습대',{base:'panel'}],
 ['table-exam','진료실 상담 테이블','desk',[1.4,.74,.7],'MD','진료실|의료 상담','측면 수납을 포함한 간단한 비전동 진료 상담 책상',{drawers:true}],
 ['table-bedside','침상 옆 보조 테이블','coffeetable',[.48,.62,.4],'MD HT','병실|객실','작은 상판과 얕은 높이를 가진 침상 옆 가구',{}],
 ['table-hotel-luggage','호텔 수하물 선반','bench',[.9,.5,.5],'HT','객실|호텔 현관','수하물을 올려두는 낮은 비전동 선반',{base:'panel'}],
 ['table-sofa-round','라운지 원형 낮은 테이블','coffeetable',[.75,.4,.75],'HT OF FN','라운지|응접실','낮은 원형 상판과 중앙 받침을 가진 대화용 테이블',{shape:'round',base:'pedestal'}],
 ['table-side','소형 사이드 테이블','coffeetable',[.45,.52,.45],'RS HT OF','거실|라운지|객실','작은 사각 상판과 금속 다리의 이동 보조 테이블',{}],
 ['table-nesting','겹침형 소파 테이블','coffeetable',[1,.44,.65],'RS ID','거실|패밀리룸','두 높이의 상판을 포개어 배치한 소파 테이블',{base:'panel'}],
 ['table-outdoor','야외 피크닉 테이블','table',[1.8,.76,.9],'TP PB HT','정원|공원|테라스','두꺼운 목재 상판과 패널 다리의 야외 식탁',{base:'panel'}],
 ['table-workbench','공장 작업 벤치','desk',[1.8,.85,.75],'MF OE','작업장|정비실|포장실','금속 다리와 하부 수납을 갖춘 비전동 작업대',{drawers:true}],
 ['table-packing','물류 포장 작업대','desk',[2,.9,.85],'MF SV','포장실|출하실','길고 넓은 작업 상판과 패널 다리의 포장대',{base:'panel'}],
])add(id,name,kind,size,'책상 · 테이블',inds,spaces,desc,table(options));
// Shelving, cabinets, merchandising and simple carts. No refrigerators or displays.
for(const [id,name,kind,size,inds,spaces,desc,options] of [
 ['shelf-library','도서관 개방형 서가','shelf',[1.2,1.8,.35],'ED PB','도서관|자료실','수평 선반이 드러나는 개방형 목재 서가',{rows:5,open:true}],
 ['shelf-kids','유아용 낮은 책장','shelf',[1.05,.85,.32],'ED TP','유아 교실|키즈존','어린이가 닿기 쉬운 낮은 개방 서가',{rows:3,columns:3,open:true}],
 ['shelf-magazine','잡지 진열 선반','shelf',[.85,1.25,.32],'HT PB FB','로비|대기실|카페','전면이 열린 낮은 자료·잡지 진열 선반',{rows:3,open:true}],
 ['shelf-retail','매장 상품 진열 선반','shelf',[1.1,1.65,.42],'RT SV','매장|편의점|판매 존','상품을 층별로 보여주는 개방형 다단 선반',{rows:5,open:true}],
 ['cabinet-showcase','비냉장 유리 진열장','cabinet',[1.2,1.1,.5],'RT TP','쇼룸|전시실|상점','조명·냉각 장치가 없는 유리 전면 상품 진열장',{rows:2,columns:2,glass:true}],
 ['cabinet-bakery','비냉장 베이커리 진열장','cabinet',[1.4,1.2,.55],'FB','베이커리|카페','냉장·가열 장치 없는 유리 전면 제과 진열 가구',{rows:3,columns:2,glass:true}],
 ['cabinet-office-low','사무실 낮은 수납장','cabinet',[1.2,.75,.45],'OF FN','업무 공간|회의실','상판을 보조 면으로 쓰는 낮은 문 달린 수납장',{rows:1,columns:3}],
 ['cabinet-files','문서 보관 캐비닛','cabinet',[.9,1.8,.45],'OF PB FN','기록실|행정실|은행','문과 칸막이로 구분한 세로형 문서 수납장',{rows:3,columns:2}],
 ['cabinet-medical','의료 소모품 수납장','cabinet',[.9,1.8,.45],'MD','처치실|간호 작업실','전기·냉장 기능 없는 소모품 정리용 수납 가구',{rows:4,columns:2}],
 ['cabinet-bedside','병실 침상 옆 수납장','cabinet',[.48,.75,.45],'MD','병실|요양실','환자 침상 옆에 두는 작은 서랍형 수납 가구',{rows:3}],
 ['cabinet-hotel','호텔 객실 수납 콘솔','cabinet',[1.5,.8,.45],'HT','객실|호텔 라운지','객실 물품을 보관하는 낮은 수납 콘솔',{rows:1,columns:3}],
 ['cabinet-shoes','현관 신발장','cabinet',[1.2,1.8,.35],'RS ID ED','현관|기숙사|학교','얕은 깊이의 다단 신발 수납장',{rows:6,columns:3}],
 ['cabinet-kitchen','주방 비전동 수납장','cabinet',[1.2,.9,.6],'RS ID FB','주방|탕비실','조리 기기를 포함하지 않는 하부 수납 가구',{rows:1,columns:3}],
 ['locker-office','오피스 개인 사물함','locker',[1.2,1.6,.45],'OF ED','공유오피스|학습실','개인 물품을 나눠 넣는 다칸 문 달린 사물함',{rows:4,columns:4}],
 ['locker-changing','탈의실 세로 락커','locker',[1.2,1.8,.5],'VN HT MF','탈의실|피트니스|직원 공간','옷을 보관하는 긴 세로 칸의 락커',{rows:1,columns:4}],
 ['locker-children','어린이 가방 사물함','locker',[1.1,.95,.35],'ED TP','유치원|어린이집','가방을 넣는 낮은 개방형 다칸 가구',{rows:2,columns:4,open:true}],
 ['rack-light','경량 물류 선반','rack',[1.5,1.8,.6],'MF SV','창고|재고실','얕은 층별 보관 면을 가진 개방형 창고 선반',{rows:5,open:true,back:false}],
 ['rack-warehouse','중량 보관 랙','rack',[2.4,2.6,1.1],'MF','물류 창고|출하실','폭과 깊이가 큰 비전동 다단 보관 랙',{rows:3,open:true,back:false}],
 ['cart-library','도서 반납 운반 카트','shelf',[.85,.95,.4],'ED PB','도서관|자료실','캐스터와 세 개 층을 갖춘 수동 도서 운반 카트',{rows:3,open:true,wheels:true}],
 ['cart-service','호텔 서비스 트롤리','shelf',[.8,.9,.45],'HT FB','객실 서비스|연회장','개방 선반과 캐스터의 비전동 서비스 카트',{rows:2,open:true,wheels:true}],
 ['cart-medical','의료 소모품 운반 카트','cabinet',[.65,.9,.45],'MD','처치실|병동','서랍과 캐스터를 가진 비전동 물품 운반 가구',{rows:4,wheels:true}],
 ['cart-cleaning','청소 물품 정리 카트','shelf',[.95,1.05,.5],'HT PB MF','관리실|복도|객실 관리','용품을 나눠 보관하는 수동 이동식 정리 가구',{rows:3,columns:2,open:true,wheels:true}],
])add(id,name,kind,size,'수납 · 진열 · 운반',inds,spaces,desc,storage(options));
for(const [id,name,size,inds,spaces,desc,options] of [
 ['bed-single','기숙사 싱글 침대',[1,.9,2.05],'ED HT RS','기숙사|생활관|1인 객실','독립 헤드보드와 한 개의 베개를 가진 싱글 침대',{single:true}],
 ['bed-twin','호텔 트윈용 싱글 베드',[1.1,1,2.05],'HT','트윈 객실|숙박실','패브릭 헤드보드와 낮은 침대틀의 객실용 싱글 베드',{single:true}],
 ['bed-king','호텔 킹 베드',[1.9,1.05,2.15],'HT RS','스위트 객실|침실','넓은 헤드보드와 두 개의 베개를 갖춘 대형 침대',{}],
 ['bed-bunk','생활관 이층 침대',[1.05,1.8,2.1],'ED HT','생활관|기숙사|호스텔','위아래 침상과 상단 난간을 갖춘 비전동 이층 침대',{single:true,bunks:true}],
 ['bed-care','요양용 수동 침상',[1.05,1.05,2.12],'MD','요양실|병실','측면 안전 난간을 가진 전동 장치 없는 개념 침상',{single:true,care:true}],
 ['bed-day','휴게용 데이베드',[.9,.82,1.9],'HT OF MD','휴게실|보호자 공간','좁은 침상과 한쪽 등받이를 가진 비전동 휴식 가구',{single:true}],
])add(id,name,'bed',size,'침대 · 휴식 가구',inds,spaces,desc,bed(options));
// Space-defining non-powered fixtures and manual accessories.
const fixtures=[
 ['partition-low','낮은 업무 파티션','partition',[1.2,1.2,.35],'OF FN','업무 공간|창구','발 받침을 가진 낮은 패브릭 칸막이',[box(0,.56,0,.97,.87,.08,'fabric'),...[-.4,.4].map(x=>box(x,.04,0,.07,.06,.95,'metal'))]],
 ['partition-acoustic','높은 흡음 칸막이','partition',[1.2,1.8,.4],'OF ED HT','집중실|회의실|연회장','큰 패브릭 패널과 독립 받침을 가진 비전동 칸막이',[box(0,.54,0,.95,.9,.1,'fabric'),...[-.4,.4].map(x=>box(x,.035,0,.08,.06,.95,'metal'))]],
 ['partition-care','병상 가림 스크린','partition',[1.8,1.7,.45],'MD','병실|처치실','세 패널로 나뉜 비전동 프라이버시 가림막',[-.33,0,.33].map(x=>box(x,.53,0,.31,.9,.04,'linen')).concat([rail(0,.08,0,.97,.95)])],
 ['partition-retail','매장 구획 프레임','partition',[1.5,1.8,.4],'RT TP','전시실|팝업 매장','빈 개구부를 가진 독립형 목재 구획 프레임',[box(-.46,.5,0,.06,1,.15),box(.46,.5,0,.06,1,.15),box(0,.96,0,.95,.05,.15),rail(0,.03,0,.98,.95,'wood')]],
 ['rail-clothes','의류 매장 행거','shelf',[1.2,1.6,.5],'RT ID','의류 매장|피팅룸','전기·관리 기능 없는 수평 옷걸이 봉과 받침',[box(-.46,.5,0,.035,.95,.06,'metal'),box(.46,.5,0,.035,.95,.06,'metal'),rail(0,.95,0,.94,.05),rail(-.46,.04,0,.1,.9),rail(.46,.04,0,.1,.9)]],
 ['stand-coat','수동 코트 행거','accessory',[.55,1.7,.55],'OF HT RS','현관|회의실|객실','중앙 봉과 여러 걸이를 가진 비전동 외투 걸이',[cyl(0,.5,0,.025,.95,'wood'),cyl(0,.025,0,.4,.04),...[-.32,.32].flatMap(x=>[box(x,.86,0,.05,.04,.6,'wood'),box(0,.73,x,.6,.04,.05,'wood')])]],
 ['stand-iv','수액용 수동 거치대','accessory',[.5,1.8,.5],'MD','병실|처치실','주입 장치를 포함하지 않는 수동 봉·후크 거치대',[cyl(0,.5,0,.018,.96),rail(0,.94,0,.65,.03),rail(0,.035,0,.85,.06),rail(0,.035,0,.06,.85)]],
 ['wheelchair-manual','수동 휠체어','chair',[.68,.95,1],'MD PB','병원|요양원|공공 대기','전기 구동 없는 이동 보조용 좌석',[...chair({arms:true,back:'panel'}),...[-.46,.46].map(x=>cyl(x,.3,-.15,.29,.045,'black',{rotate:[0,0,Math.PI/2]})),box(0,.08,.42,.62,.04,.15,'metal')]],
 ['queue-post','벨트형 대기열 차단봉','bollard',[.35,1,.35],'PB FN TP VN','접수|매표|민원 창구','수동 벨트 헤드와 원형 바닥 받침의 대기열 구획봉',[cyl(0,.5,0,.045,.92),cyl(0,.035,0,.45,.05),box(0,.94,0,.2,.1,.22,'black')]],
 ['queue-rail','대기열 고정 난간','partition',[1.5,.95,.2],'PB VN TP','매표|입장 대기|공연장','수평 가로대와 두 기둥의 비전동 동선 난간',[...[-.43,.43].map(x=>box(x,.5,0,.045,.95,.08,'metal')),rail(0,.9,0,.9,.08),rail(0,.42,0,.9,.06)]],
 ['display-plinth','전시용 독립 좌대','stage',[.65,.9,.65],'TP RT ID','전시실|쇼룸|작품 전시','모니터 장착 기능이 없는 작품·상품 전시용 단순 좌대',[box(0,.5,0,.94,.95,.94,'body')]],
 ['display-tier','상품 단차 진열대','shelf',[1.2,.8,.8],'RT TP','쇼룸|팝업 매장','두 단 높이의 비냉장·비전동 상품 진열 가구',[box(-.24,.25,0,.48,.5,.92,'wood'),box(.24,.48,0,.48,.95,.92,'wood')]],
 ['retail-mannequin','의류 전시용 마네킹','accessory',[.5,1.7,.5],'RT','의류 매장|쇼윈도','화면과 센서가 없는 의복 전시용 인체 개념 형상',[box(0,.63,0,.65,.33,.35,'body'),cyl(0,.88,0,.14,.14,'body'),box(-.15,.28,0,.15,.53,.18,'body'),box(.15,.28,0,.15,.53,.18,'body'),rail(0,.025,0,.9,.9)]],
 ['pallet-wood','물류용 목재 팔레트','rack',[1.1,.15,1.1],'MF','창고|출하실|적재 존','운반 장비를 포함하지 않는 비전동 목재 적재 받침',[-.4,-.2,0,.2,.4].map(x=>box(x,.8,0,.15,.25,.96,'wood')).concat([box(-.34,.35,0,.12,.65,.9),box(.34,.35,0,.12,.65,.9)])],
 ['cart-flatbed','수동 평판 운반차','accessory',[.65,.9,1],'MF SV HT','창고|배송 대기|객실 관리','평판과 밀대 손잡이를 가진 비전동 운반차',[box(0,.16,0,.94,.08,.92,'metal'),box(-.4,.6,-.4,.04,.75,.04,'metal'),box(.4,.6,-.4,.04,.75,.04,'metal'),rail(0,.96,-.4,.83,.05),...[-.4,.4].flatMap(x=>[-.36,.36].map(z=>cyl(x,.06,z,.07,.05,'black')))]],
 ['lectern-wood','비전동 강연대','reception',[.65,1.1,.5],'ED VN PB','강당|강의실|공연장','마이크·화면을 포함하지 않는 경사 상판 강연 가구',[box(0,.43,0,.75,.83,.72,'wood'),box(0,.92,0,.98,.08,.95,'wood',{rotate:[-.13,0,0]})]],
 ['whiteboard-plain','비전원 수업용 보드','whiteboard',[1.6,1.7,.4],'ED OF','교실|회의실','삼성 전자칠판과 구분되는 비전자 필기 판넬',[box(0,.6,0,.94,.76,.04,'body'),...[-.4,.4].map(x=>box(x,.28,0,.03,.56,.05,'metal')),rail(0,.03,0,.95,.9)]],
 ['planter-divider','식재형 공간 구획 화분','plant',[1.2,1.1,.4],'OF FB HT','라운지|카페|로비','긴 화분 상자와 식재 기둥으로 공간을 나누는 장식 가구',[box(0,.24,0,.97,.48,.88,'pot'),...[-.32,0,.32].map(x=>box(x,.7,0,.22,.54,.38,'leaf'))]],
 ['planter-tall','대형 로비 화분','plant',[.65,1.7,.65],'HT OF PB','로비|안내 홀|대기실','높은 화분과 여러 줄기의 실내 식재 장식',[cyl(0,.2,0,.3,.38,'pot'),...[-.2,0,.2].map(x=>box(x,.67,0,.18,.6,.35,'leaf'))]],
 ['waste-sort','3구 분리수거 가구','wastebin',[1.05,.82,.4],'OF PB MF SV','복도|휴게실|공공 공간','세 개 투입 구획과 문을 가진 비전동 폐기물 분류 가구',[box(0,.47,0,.95,.9,.94,'body'),...[-.31,0,.31].map(x=>box(x,.94,0,.25,.04,.55,'black'))]],
];
for(const [id,name,kind,size,inds,spaces,desc,parts] of fixtures)add(id,name,kind,size,'공간 구획 · 비품',inds,spaces,desc,parts);

export const FURNITURE_VARIANTS=variants;
export const FURNITURE_RECIPES=Object.fromEntries(variants.map(a=>[a.recipe,a.parts]));
export const FURNITURE_CATEGORIES=['의자 · 좌석','벤치 · 연결 좌석','소파 · 라운지','책상 · 테이블','수납 · 진열 · 운반','침대 · 휴식 가구','공간 구획 · 비품'];
const hidden=new Set(['floorlamp','pendant','displaystand']);
export function describeLegacyFurniture(asset){
  const category=['chair','taskchair','stool'].includes(asset.kind)?'의자 · 좌석':asset.kind==='sofa'?'소파 · 라운지':asset.kind==='bench'?'벤치 · 연결 좌석': ['desk','table','roundtable','conference','coffeetable'].includes(asset.kind)?'책상 · 테이블':['bed','hospitalbed'].includes(asset.kind)?'침대 · 휴식 가구':['shelf','cabinet','rack','locker'].includes(asset.kind)?'수납 · 진열 · 운반':'공간 구획 · 비품';
  return {...asset,name:asset.kind==='whiteboard'?'이동식 비전원 보드':asset.name,category,description:'여러 업종에서 공통으로 쓰는 '+asset.name,spaces:[],keywords:['공용 가구'],powered:false,...(hidden.has(asset.kind)?{catalogVisible:false,catalogNote:'삼성 조명·디스플레이 전용 액세서리는 제품 DB에서 선택'}:{})};
}
export function contextFurniture(base,room,industry,assets){
  const text=room.name+' '+room.purpose;
  if(base==='chair'&&industry==='ED'&&/유아|유치원|어린이|키즈/.test(text))return assets['furniture:kids-chair']?.id||'furniture:'+base;
  if(base==='chair'&&industry==='VN'&&/영화|시네마/.test(text))return assets['furniture:cinema-recliner']?.id||'furniture:'+base;
  if(base==='chair'&&industry==='VN'&&/경기|관중|체육/.test(text))return assets['furniture:stadium-seat']?.id||'furniture:'+base;
  if(base==='bench'&&room.kind==='outdoor')return assets['furniture:park-bench']?.id||'furniture:'+base;
  for(const variant of FURNITURE_VARIANTS){
    const asset=assets[variant.id],rule=asset?.autoPlacement;
    if(rule?.base===base&&(!rule.industries||rule.industries.includes(industry))&&(!rule.roomKinds||rule.roomKinds.includes(room.kind)))return asset.id;
  }
  return 'furniture:'+base;
}
