// Storyboard part taxonomy — every layout's metadata `p` points to one of these keys.
// about: what the part is for, shown wherever a part is picked (첫 번째 파트 후보 · 파트 팝업 추천 · 이름 자동완성 · 전체 보기);
// desc: short keyword line used by search / AI prompts.
export const PARTS = {
  overview: { label: '제안 개요', hue: 'blue', icon: 'clip', about: '결정권자가 한 장으로 제안 전체를 보도록 핵심 메시지 · 범위 · 효과를 요약해요', desc: '결정권자가 먼저 보는 요약 · 범위 · 전제', items: ['제안 핵심 한 줄', '도입 범위와 전제 조건', '기대 효과 요약'] },
  requirements: { label: '고객 요구 이해', hue: 'blue', icon: 'p-check', about: 'RFP · 키맨별 요구를 정리하고 항목마다 어떻게 대응할지 보여 줘요', desc: '키맨별 요구와 대응 계획', items: ['키맨별 핵심 요구', '요구사항 대응 방향', '평가 항목 대응'] },
  market: { label: '시장 · 전략', hue: 'blue', icon: 'p-market', about: '시장 규모 · 성장 · 트렌드로 왜 지금 바꿔야 하는지 제안의 배경을 세워요', desc: '시장 규모 · 성장 · 산업 트렌드', items: ['시장 규모와 성장률', '업계 트렌드', '고객 전략과의 연결'] },
  customer: { label: '고객사 이해', hue: 'blue', icon: 'building', about: '고객 사업 현황과 운영 구조 속 문제를 짚어 고객을 이해했음을 보여 줘요', desc: '고객 비즈니스 · 운영 구조 · 과제', items: ['고객사 사업 현황', '운영 흐름 속 문제', '경영 목표와 실행 과제'] },
  user: { label: '사용자 · 이해관계자', hue: 'blue', icon: 'users', about: '손님 · 직원 · 관리자의 이용 여정과 불편을 짚어 누구를 위한 제안인지 보여 줘요', desc: '손님 · 직원 · 관리자의 여정과 니즈', items: ['주요 사용자 유형', '이용 동선 속 불편', '이해관계자별 니즈'] },
  competition: { label: '경쟁사 분석', hue: 'blue', icon: 'p-scale', about: '경쟁 공급사를 같은 기준으로 비교하고 포지셔닝을 정리해 선택 근거를 줘요', desc: '공급사 비교 · 포지셔닝 · 점유율', items: ['주요 경쟁 공급사', '비교 기준', '시장 포지셔닝'] },
  insight: { label: '시사점 · 제안 방향', hue: 'blue', icon: 'p-bulb', about: '앞의 분석에서 찾은 핵심을 시사점으로 묶어 제안 방향 한 줄로 좁혀요', desc: '분석을 제안 방향 하나로 좁히기', items: ['핵심 발견', '시사점', '제안 방향 한 줄'] },
  challenge: { label: '고객 과제', hue: 'violet', icon: 'alert', about: '고객이 지금 겪는 문제와 그 비용 · 원인을 짚어 바꿔야 할 이유를 분명히 해요', desc: '지금 겪는 문제와 그 비용', items: ['문제와 영향', '근본 원인', '바라는 모습'] },
  value: { label: 'Value Propositions', hue: 'violet', icon: 'gem', about: '과제에 대한 답으로 핵심 가치와 그 가치를 만드는 제품 · 솔루션을 짝지어 보여 줘요', desc: '우리가 주는 가치와 그것을 만드는 제품 · 솔루션', items: ['핵심 가치 1', '핵심 가치 2', '핵심 가치 3'] },
  effect: { label: '기대 효과', hue: 'violet', icon: 'trend', about: '도입 전후 KPI · 투자 회수 기간 · 정성 효과로 고객이 얻을 결과를 보여 줘요', desc: 'KPI 전후 · 투자 회수 · 정성 효과', items: ['개선 KPI', '투자 회수 기간', '정성 효과'] },
  dss: { label: 'DSS · 공간 맵', hue: 'teal', icon: 'map', about: '대상 공간을 지도로 펼쳐 공간마다 들어갈 제품 · 솔루션을 한눈에 매칭해요', desc: '공간별 제품 · 솔루션 매칭', items: ['대상 공간 목록', '공간별 제품 매칭', '공간별 솔루션'] },
  products: { label: '공간별 제품', hue: 'teal', icon: 'monitor', about: '공간마다 놓일 주력 제품을 핵심 사양 · 설치 방식과 함께 소개해요', desc: '공간에 놓일 제품 소개', items: ['공간별 주력 제품', '제품별 핵심 사양', '설치 방식'] },
  bom: { label: '구성 · 수량', hue: 'teal', icon: 'p-boxes', about: '전체 구성과 공간별 · 단계별 수량을 정리해 견적 · 일정 논의의 기준을 만들어요', desc: '무엇을 몇 대 · 단계별 물량', items: ['전체 구성표', '공간 유형별 수량', '단계별 도입 물량'] },
  scenario: { label: '공간 시나리오', hue: 'teal', icon: 'route', about: '손님 · 직원의 하루 동선을 따라 제품 · 솔루션이 실제로 쓰이는 장면을 보여 줘요', desc: '공간별 이용 장면 · 하루 동선 · 운영 모드', items: ['공간 맵', '대표 공간 장면', '하루 · 동선 시나리오'] },
  birdseye: { label: '조감도 · 공간 시안', hue: 'teal', icon: 'cube', about: '도입 후 완성될 공간을 조감도 · 시안으로 미리 보여 주고 존별 포인트를 짚어요', desc: '완성된 공간 미리 보기 · 존별 포인트', items: ['전경 조감도', '존별 포인트', '도입 전후 비교'] },
  solution: { label: '솔루션 제안', hue: 'amber', icon: 'layers', about: '관제 · CMS · IoT 솔루션이 어떻게 돌아가는지 구성도와 운영 시나리오로 설명해요', desc: '솔루션 소개 · 구성도 · 운영 시나리오', items: ['솔루션 소개', '시스템 구성도', '운영 시나리오'] },
  case: { label: '유관 사례', hue: 'amber', icon: 'p-trophy', about: '비슷한 업종 · 규모 고객의 도입 성과로 제안 효과에 믿음을 더해요', desc: '비슷한 고객의 도입 성과', items: ['대표 사례 상세', '사례 모음'] },
  why: { label: 'Why Samsung', hue: 'amber', icon: 'shield', about: '경쟁 비교 · 삼성의 강점과 근거 · 지원 체계로 삼성을 골라야 할 이유를 정리해요', desc: '경쟁 비교 · 삼성 강점 · 지원 체계', items: ['경쟁 비교', '삼성 강점과 근거', '도입 후 지원 체계'] },
  spec: { label: '제품 스펙', hue: 'teal', icon: 'p-ruler', about: '제안 제품의 사양 비교와 치수 · 인증 정보를 정리해 기술 검토를 도와요', desc: '사양 비교 · 상세 사양 · 인증', items: ['제품별 사양 비교', '설치 · 치수 정보'] },
  execution: { label: '실행 계획', hue: 'green', icon: 'calendar', about: '추진 체계 · 설치 일정 · 파일럿과 확산 · 교육과 유지보수로 실행 계획을 보여 줘요', desc: '추진 체계 · 일정 · 파일럿 · 교육 · 유지보수', items: ['추진 체계', '설치 일정', '파일럿과 확산', '유지보수'] },
  cost: { label: '비용 · 구매', hue: 'green', icon: 'coin', about: '구매 방식을 비교하고 5년 총소유비용을 정리해 예산 판단을 도와요', desc: '구매 방식 · 총소유비용', items: ['구매 방식 비교', '5년 총소유비용'] },
  cover: { label: '표지 · 목차', hue: 'slate', icon: 'p-cover', about: '제안서의 첫인상인 표지와 전체 흐름을 보여 주는 목차 · 섹션 간지예요', desc: '표지 · 목차 · 섹션 간지', items: ['표지', '목차'] },
  closing: { label: '마무리 · 다음 단계', hue: 'slate', icon: 'flag', about: '제안을 다시 정리하고 다음 할 일 · 결정 요청 · 연락처로 다음 행동을 이끌어요', desc: '다음 단계 · 결정 요청 · 연락처', items: ['다음 2주 할 일', '결정 요청', '담당자 연락처'] },
  appendix: { label: '부록', hue: 'slate', icon: 'p-clip', about: '예상 질문과 답 · 수치 출처 · 용어처럼 본문 밖 참고 자료를 모아요', desc: '예상 질문 · 출처 · 용어', items: ['예상 질문', '출처', '용어'] },
  free: { label: '자유 주제', hue: 'slate', icon: 'edit', about: '정해진 유형에 없는 주제를 직접 이름 붙여 만들어요 · 이름과 내용으로 레이아웃을 찾아요', desc: '정해진 유형 없이 직접 정한 주제 (위 유형에 맞지 않을 때)', items: [], free: true },
};

// What usually comes next — drives the "다음 파트" candidates.
export const NEXT = {
  _start: ['market', 'customer', 'value', 'competition', 'overview', 'requirements'],
  overview: ['requirements', 'market', 'customer', 'value'],
  requirements: ['market', 'customer', 'challenge', 'value'],
  market: ['customer', 'competition', 'insight', 'user'],
  customer: ['challenge', 'user', 'value', 'competition'],
  user: ['challenge', 'value', 'insight', 'scenario'],
  competition: ['insight', 'why', 'value'],
  insight: ['value', 'challenge', 'dss'],
  challenge: ['value', 'solution', 'effect'],
  value: ['dss', 'products', 'scenario', 'effect', 'solution'],
  effect: ['dss', 'case', 'why', 'cost'],
  dss: ['products', 'scenario', 'bom', 'birdseye'],
  products: ['scenario', 'spec', 'bom', 'why'],
  bom: ['cost', 'execution', 'spec'],
  scenario: ['why', 'case', 'solution', 'birdseye'],
  birdseye: ['scenario', 'products', 'why'],
  solution: ['scenario', 'case', 'why'],
  case: ['why', 'execution', 'closing'],
  why: ['execution', 'cost', 'closing', 'case'],
  spec: ['bom', 'cost', 'why'],
  execution: ['cost', 'closing', 'appendix'],
  cost: ['closing', 'execution', 'appendix'],
  cover: ['overview', 'market', 'customer'],
  closing: ['appendix'],
  appendix: [],
  free: ['market', 'customer', 'value', 'scenario', 'why', 'execution'],
};

export const RELATED = {
  market: ['insight', 'customer'], customer: ['user', 'challenge', 'market'], user: ['customer', 'scenario'], competition: ['why', 'market'],
  insight: ['market', 'value'], challenge: ['customer', 'value'], value: ['effect', 'challenge', 'solution'], effect: ['value', 'cost'],
  dss: ['products', 'bom', 'scenario'], products: ['dss', 'spec', 'bom'], bom: ['products', 'cost'], scenario: ['dss', 'birdseye', 'solution'],
  birdseye: ['scenario', 'dss'], solution: ['scenario', 'value'], case: ['why'], why: ['competition', 'case'], spec: ['products', 'bom'],
  execution: ['cost', 'closing'], cost: ['execution', 'effect'], overview: ['requirements', 'insight'], requirements: ['overview', 'customer'],
  cover: [], closing: ['execution'], appendix: [], free: [],
};

// Keyword → part type, used to classify a typed part name.
const NAME_RULES = [
  ['competition', /경쟁/], ['why', /why|삼성|강점|지원 체계/i], ['market', /시장|트렌드|\bmi\b|market/i], ['customer', /고객사|비즈니스|운영 과제|사업 현황/],
  ['user', /사용자|이해관계자|여정|페르소나|손님/], ['insight', /시사점|제안 방향|인사이트/], ['challenge', /과제|문제|페인|pain|이슈/i],
  ['effect', /효과|roi|kpi|회수|절감/i], ['value', /가치|value|vp|키 ?메시지|key message/i], ['dss', /dss|공간 맵|공간별 제품 매칭|매칭/i],
  ['bom', /수량|구성표|물량|bom/i], ['products', /제품|라인업|공간별 제품/], ['scenario', /시나리오|동선|하루|장면/],
  ['birdseye', /조감도|시안|도면|렌더|평면/], ['solution', /솔루션|구성도|시스템|플랫폼/], ['case', /사례|레퍼런스|reference/i],
  ['spec', /스펙|사양|spec/i], ['execution', /실행|일정|로드맵|설치|교육|유지보수|파일럿|추진/], ['cost', /비용|가격|tco|구매|견적/i],
  ['cover', /표지|목차|간지/], ['closing', /마무리|다음 단계|결정 요청|연락처/], ['appendix', /부록|출처|용어|q&a|예상 질문/i],
  ['overview', /요약|개요|summary/i], ['requirements', /요구|rfp/i],
];
export function classifyPart(name) {
  const s = String(name || '').trim();
  for (const [k, re] of NAME_RULES) if (re.test(s)) return k;
  return null;
}

export const REQ_LABEL = {
  customer: '고객사', project: '프로젝트', industry: '업종', spaces: '공간', products: '제품 목록', solutions: '솔루션', cases: '유관 사례',
  kpis: '핵심 수치 · KPI', competitors: '경쟁사', timeline: '일정 · 단계', users: '사용자 유형', challenges: '고객 과제', values: '핵심 가치',
  costs: '비용 항목', contacts: '연락처', sources: '출처', images: '이미지', quantities: '수량', keymen: '키맨',
};

/** Full content of a part — free-form text or list items joined. */
export function partText(part) {
  if (!part) return '';
  if (part.form === 'free' && part.text && part.text.trim()) return part.text.trim();
  return (part.items || []).join('\n');
}
/** Free-form text → content items (lines, bullets, or sentences). */
export function splitFree(text) {
  const lines = String(text || '').split(/\n+/).map((x) => x.replace(/^\s*(?:[-•·*▪◦]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const out = lines.length > 1 ? lines : lines.length ? lines[0].split(/(?<=[.!?。])\s+/).map((x) => x.trim()).filter(Boolean) : [];
  return out.slice(0, 12);
}
/** Type used for flow + recommendation. A free topic borrows a soft hint from its name / text. */
export function effectiveType(part) {
  if (!part) return null;
  if (part.type && part.type !== 'free') return part.type;
  return classifyPart(part.name) || (part.type === 'free' ? classifyPart(partText(part)) : null);
}
