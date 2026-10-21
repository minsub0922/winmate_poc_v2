// Purpose-based concept plans. Product IDs resolve to the existing Samsung DB;
// quantities follow the furniture actually placed, never a sales quota.
export const SPACE_EQUIPMENT_VERSION=1;
export const WORK_MONITOR='sg_g000184177'; // ViewFinity S7 S70H, 27-inch 4K
export const STUDENT_TABLET='sg_g000183689'; // Galaxy Tab S10 FE Wi-Fi
const item=(productId,reason,quantity=1)=>({productId,reason,quantity});
const monitor=item(WORK_MONITOR,'업무석마다 문서·운영 시스템을 사용하는 개인 화면','workstations');
const board=item('qm65c','운영 현황을 함께 확인하는 대형 공용 화면');
const clean=item('purifier','학생·이용자가 오래 머무는 실내의 공기 관리');
const cooling=item('wf1way','실내 사용 시간에 맞춘 냉난방');
const tablet=item(STUDENT_TABLET,'학생 자리별 디지털 교재·학습 활동','students');
const print=item('sg_g000181555','공용 문서 출력');
const flip=item('flip','수업·발표 내용을 함께 보는 전자칠판');
const profiles={
 office:{kind:'office',equipment:[monitor,cooling]},
 operations:{kind:'office',equipment:[monitor,board,cooling]},
 administration:{kind:'office',equipment:[monitor,print,cooling]},
 bank:{kind:'office',equipment:[monitor,item(STUDENT_TABLET,'창구의 전자서식·고객 확인',2),cooling]},
 classroom:{kind:'classroom',equipment:[flip,tablet,clean,cooling]},
 digitalclass:{kind:'classroom',equipment:[flip,tablet,clean,cooling]},
 computerlab:{kind:'study',equipment:[monitor,print,clean,cooling]},
 library:{kind:'study',equipment:[clean,cooling]},
 study:{kind:'study',equipment:[clean,cooling]},
 focus:{kind:'study',capacity:1,equipment:[cooling]},
 homestudy:{kind:'study',capacity:1,equipment:[tablet,clean]},
 clinic:{kind:'medical',equipment:[monitor,item(STUDENT_TABLET,'진료 설명·환자 문진'),cooling]},
 ward:{kind:'medical',equipment:[item('hoteltv','환자 휴식·병동 안내'),clean,cooling]},
 nursing:{kind:'office',capacity:4,equipment:[monitor,cooling]},
 production:{kind:'warehouse',equipment:[item('tabactive5','생산 작업 지시·체크리스트',2)]},
 laboratory:{kind:'warehouse',equipment:[item('tabactive5','검사 결과·실험 기록',2),item(WORK_MONITOR,'검사 결과를 확인하는 분석 작업석','workstations')]},
 warehouse:{kind:'warehouse',equipment:[item('tabactive5','재고·출하 확인'),item('xcover7','현장 바코드·물류 업무')]},
 mechanical:{kind:'utility',equipment:[item('dvms2','별도 설비 구역의 시스템에어컨 실외기')]},
 laundry:{kind:'utility',equipment:[item('laundry','세탁·건조'),item('airdresser','의류 관리')]},
 garment:{kind:'utility',equipment:[item('airdresser','방문객 외투 관리')]},
 dining:{kind:'dining',equipment:[item('qm43c','메뉴·주문 안내'),item(STUDENT_TABLET,'테이블별 주문 단말','tables'),item('ac360','홀 냉난방')]},
 kitchen:{kind:'kitchen',equipment:[item('bi_fridge','식재료 냉장 보관'),item('bi_induction','조리'),item('bi_dish','식기 세척')]},
 coldstore:{kind:'warehouse',equipment:[item('bi_fridge','식재료 냉장 보관')]},
 bedroom:{kind:'bedroom',equipment:[item('hoteltv','객실·침실의 휴식 화면'),cooling]},
 dorm:{kind:'bedroom',equipment:[item(STUDENT_TABLET,'생활관 학습 책상의 디지털 교재'),clean,cooling]},
 homebedroom:{kind:'bedroom',equipment:[item(WORK_MONITOR,'공부방 책상의 학습·업무 화면'),cooling]},
 meeting:{kind:'meeting',equipment:[flip,item('book','회의 자료·발표용 노트북'),cooling]},
 consultation:{kind:'meeting',capacity:4,equipment:[item(STUDENT_TABLET,'고객에게 설명하는 상담 자료'),cooling]},
 reception:{kind:'reception',equipment:[item('qm55c','방문·시설 이용 안내'),item(WORK_MONITOR,'접수·예약 업무'),item(STUDENT_TABLET,'체크인·전자 접수')]},
 selfservice:{kind:'reception',equipment:[item('kiosk','좌석 선택·결제·발권'),item('qm43c','이용 안내')]},
 lounge:{kind:'lounge',equipment:[clean]},
 waiting:{kind:'lounge',equipment:[item('qm55c','대기·운행·이용 안내')]},
 fitness:{kind:'fitness',equipment:[clean,cooling]},
 theatre:{kind:'theatre',equipment:[item('qm65c','무대·발표용 공용 화면'),item('harman','행사·강연 음향')]},
 immersive:{kind:'theatre',equipment:[item('led_indoor','몰입 체험 콘텐츠 화면'),item('harman','체험 음향')]},
 billboard:{kind:'outdoor',equipment:[item('led_outdoor','야외 대형 정보·광고 화면')]},
 outdoorinfo:{kind:'outdoor',equipment:[item('oh55a','야외 방문·길찾기 안내')]},
 outdoor:{kind:'outdoor',equipment:[]},
 field:{kind:'outdoor',equipment:[item('xcover7','작업·안전 점검용 현장 단말')]},
 retail:{kind:'retail',equipment:[item('qm55c','상품·프로모션 안내')]},
 kids:{kind:'lounge',equipment:[clean,item('ac360','실내 놀이 공간 냉난방')]},
 living:{kind:'lounge',equipment:[item('hoteltv','거실의 시청·휴식 화면'),cooling]},
 entry:{kind:'reception',equipment:[]},
};
const assignments={
 FB:['dining','outdoorinfo','reception','kitchen','coldstore','garment','operations'],
 AD:['billboard','billboard','theatre','outdoorinfo','waiting','waiting','operations'],
 OF:['meeting','office','lounge','reception','theatre','mechanical','mechanical'],
 ED:['classroom','digitalclass','computerlab','administration','library','dorm','operations'],
 PB:['operations','outdoorinfo','waiting','administration','library','field','outdoor'],
 RT:['retail','billboard','reception','kitchen','theatre','lounge','operations'],
 FN:['bank','reception','lounge','theatre','reception','waiting','consultation'],
 OE:['reception','homestudy','outdoor','classroom','outdoor','retail','operations'],
 MD:['ward','nursing','fitness','clinic','reception','dining','mechanical'],
 MF:['production','laboratory','meeting','field','warehouse','field','operations'],
 RS:['kitchen','living','homebedroom','laundry','entry','mechanical','retail'],
 ID:['kitchen','consultation','kitchen','living','homebedroom','laundry','operations'],
 SV:['study','selfservice','focus','lounge','administration','field','operations'],
 HT:['bedroom','reception','theatre','dining','fitness','laundry','mechanical'],
 TP:['waiting','selfservice','immersive','theatre','kids','retail','operations'],
 VN:['billboard','operations','theatre','reception','fitness','outdoorinfo','operations'],
};
const cowork={ 'cowork-lobby':'reception','cowork-work':'office','cowork-meet':'meeting','cowork-cafe':'lounge','cowork-project':'meeting','cowork-admin':'operations' };
export function equipSpace(room,industry){
 const index=room.key.endsWith('-hero')?0:Number(room.key.split('-').at(-1));
 const spaceProfile=cowork[room.key]||assignments[industry]?.[index]||Object.keys(profiles).find(k=>profiles[k].kind===room.kind)||'lounge';
 const p=profiles[spaceProfile];
 return {...room,kind:p.kind,spaceProfile,equipmentPolicyVersion:SPACE_EQUIPMENT_VERSION,
  ...(p.capacity?{capacity:p.capacity}:{}),sourceProductIds:[...(room.productIds||[])],
  equipment:structuredClone(p.equipment),productIds:p.equipment.map(e=>e.productId)};
}
export function workstationSupports(scene,room,assets){
 return scene.objects.filter(o=>o.roomId===room.id&&assets[o.assetId]?.kind==='desk'&&o.stationRole!=='teacher');
}
export function equipmentSupports(quantity,scene,room,assets){
 if(['workstations','students'].includes(quantity))return workstationSupports(scene,room,assets);
 if(quantity==='tables')return scene.objects.filter(o=>o.roomId===room.id&&['table','roundtable'].includes(assets[o.assetId]?.kind));
 return null;
}
