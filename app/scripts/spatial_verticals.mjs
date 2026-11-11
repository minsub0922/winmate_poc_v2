// Vertical-taxonomy templates for the spatial library.
// Every vertical of app/data/vertical_space_product.json gets full maps (its zones) and one
// single-space map per space. A space carries the Samsung product categories of the taxonomy:
// each category is placed as a representative catalogue product, linked to plant equipment
// elsewhere, or recorded as a non-physical solution. Placement never scales product sizes.
import {createScene} from '../web/src/domain/spatial/scene.js';
import {peopleInScene} from '../web/src/domain/spatial/people-placement-geometry.js';
import {SPACE_EQUIPMENT_VERSION,SPACE_PROFILES,WORK_MONITOR,STUDENT_TABLET} from '../web/src/domain/spatial/space-equipment.js';
import {TEMPLATE_COMPOSITION_VERSION,TEMPLATE_ROOM,templateDimensions} from '../web/src/domain/spatial/template-composition.js';

export const VERTICAL_TEMPLATE_PREFIX='v-';
const VARIANTS=['compact','standard','spacious'];
// Profiles whose desks always carry one work screen each (also asserted by the spatial tests).
const WORKSTATIONS=new Set(['office','operations','administration','bank','nursing','computerlab','laboratory']);
const LEARNING=new Set(['classroom','digitalclass','homestudy']);
const RESIDENTIAL=new Set(['bedroom','homebedroom','living','dorm','ward']);
const SMALL_FRIDGE=new Set(['bedroom','dorm','homebedroom','ward','lounge','living','consultation','office']);
const WORK_LIGHT=new Set([...WORKSTATIONS,'meeting','classroom','digitalclass','study','library','focus']);

export const CATEGORY_SHORT={
  sac_l_in:'대형건물용 실내기',sac_l_out:'대형건물용 실외기',sac_sm:'중소건물용 실내외기',sac_res:'주거용 실내외기',sac_ehs:'EHS 바닥난방·급탕',sac_vent:'환기 솔루션',sac_ctr:'중앙공조',sac_cold:'콜드체인',
  ref_home:'가정용 냉장고',ref_comm:'업소용 냉장고',ref_bi:'빌트인 냉장고',kimchi:'김치냉장고',dish:'식기세척기',range:'전기레인지',mw:'전자레인지',oven:'오븐',water:'정수기',hood:'후드',kit_acc:'주방가전 액세서리',
  wash:'세탁기',dry:'건조기',laundry_b2b:'상업용 세탁기·건조기',airdresser:'에어드레서',shoe:'슈드레서',ac:'에어컨',air:'공기청정기',vac:'청소기',light:'LED 조명',
  lcd_std:'LCD 사이니지',btv:'비즈니스TV',vwall:'비디오월',lcd_out:'실외용 사이니지',lcd_win:'창문형 사이니지',iwb:'전자칠판',epaper:'E Paper',spatial:'스페이셜 사이니지',led_in:'실내용 LED',led_out:'실외용 LED',
  htv:'호텔TV',tv:'TV',harman:'하만 프로 오디오',phone:'스마트폰',tab:'태블릿',watch:'워치',buds:'버즈',ring:'링',xr:'XR',mob_acc:'모바일 액세서리',
  dmfp:'디지털 복합기',mfp:'프린터·복합기',supply:'소모품',nb:'노트북',cb:'크롬북',desk:'데스크탑',mon:'모니터',
  g_kiosk:'키오스크',g_cinema:'시네마 LED',g_storage:'메모리·스토리지',g_network:'네트워크',g_medical:'의료기기',g_rugged:'러기드 단말',
  s_stp:'SmartThings Pro',s_biot:'b.IoT',s_dms:'DMS 2.5',s_touch:'터치 중앙제어기',s_wifi:'Wi-Fi KIT',s_vxt:'VXT CMS',s_magic:'MagicINFO',s_lynk:'LYNK Cloud',s_knox:'Knox',s_health:'삼성헬스',s_safety:'안전관리 솔루션',s_class:'갤럭시 클래스룸',s_counthru:'CounThru',s_secuthru:'SecuThru',
};

const placed=(productId,reason)=>({productId,reason});
const linked=reason=>({status:'linked',reason});
const logical=reason=>({status:'logical',reason});
// Category → representative catalogue product for the space context.
const PRODUCTS={
  sac_l_in:()=>placed('sg_g000180586','대형건물용 실내기 냉난방'),
  sac_l_out:c=>c.plant?placed('dvms2','대형건물용 실외기'):linked('실외기는 옥상·기계실에 설치해 이 공간 실내기와 연결'),
  sac_sm:()=>placed('sg_g000181660','중소건물용 실내기 냉난방'),
  sac_res:()=>placed('sg_g000182305','주거용 시스템에어컨 냉난방'),
  sac_ehs:c=>c.plant?placed('ehs','히트펌프 보일러 바닥난방 · 급탕'):linked('히트펌프 보일러는 기계실·실외기실에 설치'),
  sac_vent:()=>placed('erv','전열교환 환기 · 실내 공기질'),
  sac_ctr:c=>c.plant?placed('dvmchiller','중앙공조 열원 (DVM 칠러)'):placed('sg_g000182551','중앙공조 실내기 냉난방'),
  sac_cold:c=>c.plant||c.cold?placed('sg_g000182050','콜드체인 콘덴싱 유닛 · 저온 유지'):linked('콘덴싱 유닛은 후방·옥외에 설치해 냉장 진열·저장과 연결'),
  ref_home:c=>placed(SMALL_FRIDGE.has(c.profile)?'sg_g000181263':'sg_g000183669','냉장 보관'),
  ref_comm:()=>placed('sg_g000179612','업소용 냉장 · 냉동 보관'),
  ref_bi:()=>placed('bi_fridge','빌트인 냉장 보관'),
  kimchi:()=>placed('sg_g000183394','김치 · 식재료 저장'),
  dish:()=>placed('bi_dish','식기 세척'),
  range:()=>placed('bi_induction','인덕션 조리'),
  mw:()=>placed('sg_g000180569','간편 조리 · 데우기'),
  oven:()=>placed('sg_g000181005','오븐 조리 · 베이킹'),
  water:()=>placed('sg_g000184129','정수 · 음용수'),
  hood:()=>placed('sg_g000181584','조리 배기'),
  kit_acc:()=>placed('sg_g000180991','주방가전 연결 수납'),
  wash:()=>placed('sg_g000183794','세탁'),
  dry:()=>placed('sg_g000183792','건조'),
  laundry_b2b:()=>placed('laundry','상업용 세탁 · 건조'),
  airdresser:()=>placed('airdresser','의류 관리'),
  shoe:()=>logical('슈드레서는 제품 DB에 3D 형상이 아직 없음'),
  ac:()=>placed('sg_g000183564','스탠드 에어컨 냉난방'),
  air:()=>placed('purifier','공기청정'),
  vac:()=>placed('sg_g000184239','바닥 자동 청소'),
  light:c=>placed(RESIDENTIAL.has(c.profile)?'sg_g000179162':WORK_LIGHT.has(c.profile)?'ec_93_029':'ec_93_032','LED 조명'),
  lcd_std:()=>placed('qm55c','안내 · 프로모션 사이니지'),
  btv:()=>placed('sg_g000184171','비즈니스TV 안내 화면'),
  vwall:()=>placed('vm55b','비디오월 대형 화면'),
  lcd_out:()=>placed('oh55a','실외 안내 · 광고 화면'),
  lcd_win:()=>placed('window','창문형 거리 홍보 화면'),
  iwb:()=>placed('flip','전자칠판 협업 · 발표 화면'),
  epaper:()=>placed('epaper','저전력 전자종이 안내'),
  spatial:()=>placed('sg_g000184074','스페이셜 사이니지 입체 연출'),
  led_in:c=>placed(['theatre','immersive'].includes(c.profile)&&!c.categories.has('g_cinema')?'thewall':'led_indoor','실내 LED 대형 화면'),
  led_out:()=>placed('led_outdoor','실외 LED 전광판'),
  htv:()=>placed('hoteltv','호텔TV 객실 정보 · 시청'),
  tv:()=>placed('sg_g000183752','TV 시청 · 안내'),
  harman:()=>placed('harman','하만 프로 오디오 음향'),
  phone:()=>placed('sg_g000184040','업무 · 고객 응대 스마트폰'),
  tab:()=>placed('tabs11','태블릿 업무 · 안내'),
  watch:()=>placed('watch','워치 알림 · 건강 · 안전'),
  buds:()=>placed('sg_g000184029','버즈 음성 안내 · 통화'),
  ring:()=>logical('갤럭시 링은 제품 DB에 3D 형상이 아직 없음'),
  xr:()=>placed('sg_g000183990','XR 체험 · 교육'),
  mob_acc:()=>placed('sg_g000183692','모바일 액세서리'),
  dmfp:()=>placed('sg_g000181555','디지털 복합기 출력'),
  mfp:()=>placed('sg_g000183233','프린터 · 복합기 출력'),
  supply:()=>logical('출력 소모품은 복합기 운영 구성품'),
  nb:()=>placed('book','노트북 업무'),
  cb:()=>placed('sg_g000183997','크롬북 학습'),
  desk:c=>placed(WORKSTATIONS.has(c.profile)?'sg_g000183896':'sg_g000183100','데스크탑 업무'),
  mon:()=>placed('smartmonitor','모니터 업무 · 안내 화면'),
  g_kiosk:()=>placed('kiosk','키오스크 주문 · 결제 · 발권'),
  g_cinema:()=>placed('onyx','시네마 LED 상영'),
  g_rugged:c=>placed(c.used.has('xcover7')?'tabactive5':'xcover7','러기드 단말 현장 업무'),
  g_medical:()=>logical('의료기기는 삼성메디슨 별도 판매 · 3D 형상 없음'),
  g_storage:()=>logical('메모리 · 스토리지는 장비 내장 부품'),
  g_network:()=>logical('네트워크 장비는 글로벌 사이트 제품 · 3D 형상 없음'),
  s_dms:()=>placed('sg_g000183000','DMS 2.5 통합관리 컨트롤러'),
  s_touch:()=>placed('sg_g000183001','터치 중앙제어기'),
  s_wifi:()=>placed('sg_g000183002','Wi-Fi KIT 원격 제어'),
};
const SOFTWARE=id=>logical(`${CATEGORY_SHORT[id]||id} 소프트웨어 솔루션 · 물리 배치 없음`);

// Profile requirements keep furniture, dressing and quality rules consistent.
function requirements(profile,categories){
  const out=[];
  if(WORKSTATIONS.has(profile))out.push({category:'mon',item:{productId:WORK_MONITOR,reason:'업무석마다 업무 화면',quantity:'workstations'}});
  if(profile==='operations')out.push({category:'lcd_std',item:{productId:'qm65c',reason:'운영 현황 공용 화면',quantity:1}});
  if(['classroom','digitalclass'].includes(profile))out.push({category:'iwb',item:{productId:'flip',reason:'수업 화면 (전자칠판)',quantity:1}});
  if(LEARNING.has(profile))out.push({category:'tab',item:{productId:STUDENT_TABLET,reason:'학생 자리별 디지털 교재',quantity:'students'}},{category:'air',item:{productId:'purifier',reason:'학습 공간 공기 관리',quantity:1}});
  if(profile==='kitchen')out.push({category:'range',item:{productId:'bi_induction',reason:'인덕션 조리',quantity:1}});
  return out;
}

export function verticalRoom(space,config,assets){
  const profile=config.profile,base=SPACE_PROFILES[profile];
  if(!base)throw new Error('Unknown space profile '+profile+' for '+space.id);
  const categories=new Set(space.products),ctx={profile,plant:profile==='mechanical',cold:['coldstore','warehouse'].includes(profile),categories,used:new Set()};
  const equipment=[],coverage=new Map(),add=(category,entry)=>{
    if(equipment.some(e=>e.productId===entry.productId)){if(category&&!coverage.has(category))coverage.set(category,{status:'placed',productId:entry.productId,reason:entry.reason});return;}
    if(!assets['product:'+entry.productId]?.physical)throw new Error('Vertical product is not a physical catalogue object: '+entry.productId);
    equipment.push(entry);ctx.used.add(entry.productId);
    if(category&&!coverage.has(category))coverage.set(category,{status:'placed',productId:entry.productId,reason:entry.reason});
  };
  const required=requirements(profile,categories);
  for(const {category,item} of required)add(categories.has(category)?category:null,{...item});
  const classroom=base.kind==='classroom';
  for(const category of space.products){
    if(coverage.has(category))continue;
    const pick=PRODUCTS[category]?.(ctx)||(category.startsWith('s_')?SOFTWARE(category):logical('대표 제품 미지정'));
    if(!pick.productId){coverage.set(category,pick);continue;}
    if(classroom&&assets['product:'+pick.productId].kind==='display'){coverage.set(category,{status:'omitted',productId:pick.productId,reason:'교실 화면은 전자칠판 1대로 통일'});continue;}
    add(category,{productId:pick.productId,reason:pick.reason,quantity:1});
  }
  return {room:{key:space.id,spaceId:space.id,name:space.name,kind:base.kind,purpose:'',productsText:space.products.map(id=>CATEGORY_SHORT[id]||id).join(' · '),
    spaceProfile:profile,equipmentPolicyVersion:SPACE_EQUIPMENT_VERSION,...(config.capacity??base.capacity?{capacity:config.capacity??base.capacity}:{}),
    sourceProductIds:[],equipment,productIds:equipment.map(e=>e.productId)},
    coverage:space.products.map(category=>({category,...coverage.get(category)})),required:new Set(required.map(r=>r.item.productId))};
}

const template=(id,name,industry,vertical,scope,variant,rooms,style,source)=>({id,name,industry,vertical,scope,variant,rooms,...templateDimensions(rooms.length),
  compositionVersion:TEMPLATE_COMPOSITION_VERSION,roomReference:TEMPLATE_ROOM,style,source});

// Drop a non-required product only when the room cannot hold it in every size variant.
function fitRoom(entry,industry,style,library,assets){
  const omitted=[];
  for(let attempt=0;attempt<12;attempt++){
    const failures=[];
    for(const variant of VARIANTS){
      const probe=template('probe-'+entry.room.key+'-'+variant,entry.room.name,industry,null,'single',variant,[entry.room],style,null);
      try{
        const scene=createScene({templateId:probe.id},{...library,templates:[probe]});
        if(!peopleInScene(scene,assets).length)failures.push({variant,error:'사람 연출을 배치하지 못했습니다'});
      }catch(error){failures.push({variant,error:error.message});}
    }
    if(!failures.length)return omitted;
    const message=failures.map(f=>f.error).join(' | ');
    const culprit=[...entry.room.equipment].reverse().find(e=>!entry.required.has(e.productId)&&message.includes(assets['product:'+e.productId].name));
    if(!culprit)throw new Error(`${entry.room.key} ${entry.room.name}: ${message}`);
    entry.room.equipment=entry.room.equipment.filter(e=>e!==culprit);entry.room.productIds=entry.room.equipment.map(e=>e.productId);
    for(const c of entry.coverage)if(c.status==='placed'&&c.productId===culprit.productId)Object.assign(c,{status:'omitted',reason:'개념 배치 공간 부족 — 개별 공간 크기를 키우면 추가 가능'});
    omitted.push(culprit.productId);
  }
  throw new Error('Too many placement retries for '+entry.room.key);
}

export function buildVerticalTemplates({taxonomy,solutions,layouts,library,styleFor}){
  const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
  const solutionBySpace=new Map(solutions.verticals.flatMap(v=>v.spaces.map(s=>[s.id,s.solutions])));
  const layoutById=new Map(layouts.verticals.map(v=>[v.id,v]));
  const industries=Object.entries(layouts.groups).map(([code,group])=>({code,name:group.name}));
  const templates=[],verticals=[];
  for(const vertical of taxonomy.verticals){
    const layout=layoutById.get(vertical.id);if(!layout)throw new Error('Missing vertical layout '+vertical.id);
    const industry=vertical.group,style=layout.style||layouts.groups[industry]?.style||styleFor(industry);
    const rooms=new Map(),spaces=[];
    for(const space of vertical.spaces){
      const config=layout.spaces[space.id];if(!config)throw new Error('Missing space profile '+space.id);
      const entry=verticalRoom(space,config,assets);
      fitRoom(entry,industry,style,library,assets);
      rooms.set(space.id,entry.room);
      spaces.push({id:space.id,name:space.name,profile:config.profile,categories:space.products,coverage:entry.coverage,
        solutions:(solutionBySpace.get(space.id)||[]).map(s=>({id:s.solution,name:s.solution_name,scenario:s.scenario}))});
    }
    const source=extra=>({type:'vertical-taxonomy',verticalId:vertical.id,taxonomyVersion:taxonomy.meta.version,...extra,note:'삼성 B2B 버티컬 · 공간 · 제품군 분류 기반 개념 구성 · 실측 도면 아님'});
    for(const zone of layout.zones){
      const name=layout.zones.length===1?`${layout.label} · 전체 맵`:`${layout.label} · ${zone.name}`;
      for(const variant of VARIANTS)templates.push(template(`${VERTICAL_TEMPLATE_PREFIX}${vertical.id}-${zone.key}-${variant}`,name,industry,vertical.id,'full',variant,zone.spaces.map(id=>structuredClone(rooms.get(id))),style,source({zone:zone.key})));
    }
    for(const space of vertical.spaces)for(const variant of VARIANTS)
      templates.push(template(`${VERTICAL_TEMPLATE_PREFIX}${space.id}-${variant}`,`${layout.label} · ${space.name}`,industry,vertical.id,'single',variant,[structuredClone(rooms.get(space.id))],style,source({spaceId:space.id})));
    verticals.push({id:vertical.id,name:vertical.name,label:layout.label,group:industry,sizeSegment:vertical.size_segment,sizeCriteria:vertical.size_criteria,size:layout.size,
      zones:layout.zones.map(z=>({key:z.key,name:z.name,spaces:z.spaces})),spaces});
  }
  return {industries,templates,verticals,productCategories:CATEGORY_SHORT};
}
