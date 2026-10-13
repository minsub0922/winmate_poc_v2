// Storyboard 파트 유형 — 레이아웃 메타데이터 `p` 는 이 키 중 하나를 가리킨다(구분 1).
// hue: 화면 색 묶음(styles/tokens.css 의 --h-<hue>), icon: components/common/Icon.jsx 아이콘 이름
export const PARTS = {
  overview: { label: '제안 개요', hue: 'blue', icon: 'clip', desc: '결정권자가 먼저 보는 요약 · 범위 · 전제' },
  requirements: { label: '고객 요구 이해', hue: 'blue', icon: 'p-check', desc: '키맨별 요구와 대응 계획' },
  market: { label: '시장 · 전략', hue: 'blue', icon: 'p-market', desc: '시장 규모 · 성장 · 산업 트렌드' },
  customer: { label: '고객사 이해', hue: 'blue', icon: 'building', desc: '고객 비즈니스 · 운영 구조 · 과제' },
  user: { label: '사용자 · 이해관계자', hue: 'blue', icon: 'users', desc: '손님 · 직원 · 관리자의 여정과 니즈' },
  competition: { label: '경쟁사 분석', hue: 'blue', icon: 'p-scale', desc: '공급사 비교 · 포지셔닝 · 점유율' },
  insight: { label: '시사점 · 제안 방향', hue: 'blue', icon: 'p-bulb', desc: '분석을 제안 방향 하나로 좁히기' },
  challenge: { label: '고객 과제', hue: 'violet', icon: 'alert', desc: '지금 겪는 문제와 그 비용' },
  value: { label: 'Value Propositions', hue: 'violet', icon: 'gem', desc: '우리가 주는 가치와 그것을 만드는 제품 · 솔루션' },
  effect: { label: '기대 효과', hue: 'violet', icon: 'trend', desc: 'KPI 전후 · 투자 회수 · 정성 효과' },
  dss: { label: 'DSS · 공간 맵', hue: 'teal', icon: 'map', desc: '공간별 제품 · 솔루션 매칭' },
  products: { label: '공간별 제품', hue: 'teal', icon: 'monitor', desc: '공간에 놓일 제품 소개' },
  bom: { label: '구성 · 수량', hue: 'teal', icon: 'p-boxes', desc: '무엇을 몇 대 · 단계별 물량' },
  scenario: { label: '공간 시나리오', hue: 'teal', icon: 'route', desc: '공간별 이용 장면 · 하루 동선 · 운영 모드' },
  birdseye: { label: '조감도 · 공간 시안', hue: 'teal', icon: 'cube', desc: '완성된 공간 미리 보기 · 존별 포인트' },
  solution: { label: '솔루션 제안', hue: 'amber', icon: 'layers', desc: '솔루션 소개 · 구성도 · 운영 시나리오' },
  case: { label: '유관 사례', hue: 'amber', icon: 'p-trophy', desc: '비슷한 고객의 도입 성과' },
  why: { label: 'Why Samsung', hue: 'amber', icon: 'shield', desc: '경쟁 비교 · 삼성 강점 · 지원 체계' },
  spec: { label: '제품 스펙', hue: 'teal', icon: 'p-ruler', desc: '사양 비교 · 상세 사양 · 인증' },
  execution: { label: '실행 계획', hue: 'green', icon: 'calendar', desc: '추진 체계 · 일정 · 파일럿 · 교육 · 유지보수' },
  cost: { label: '비용 · 구매', hue: 'green', icon: 'coin', desc: '구매 방식 · 총소유비용' },
  cover: { label: '표지 · 목차', hue: 'slate', icon: 'p-cover', desc: '표지 · 목차 · 섹션 간지' },
  closing: { label: '마무리 · 다음 단계', hue: 'slate', icon: 'flag', desc: '다음 단계 · 결정 요청 · 연락처' },
  appendix: { label: '부록', hue: 'slate', icon: 'p-clip', desc: '예상 질문 · 출처 · 용어' },
};

/** 레이아웃을 채우는 데 필요한 정보(메타데이터 `req`) */
export const REQ_LABEL = {
  customer: '고객사', project: '프로젝트', industry: '업종', spaces: '공간', products: '제품 목록', solutions: '솔루션', cases: '유관 사례',
  kpis: '핵심 수치 · KPI', competitors: '경쟁사', timeline: '일정 · 단계', users: '사용자 유형', challenges: '고객 과제', values: '핵심 가치',
  costs: '비용 항목', contacts: '연락처', sources: '출처', images: '이미지', quantities: '수량', keymen: '키맨',
};

/** 색 묶음 클래스 — .h-blue 등이 --hc(글자) · --hb(배경)를 정한다. */
export function partHue(type) {
  return 'h-' + ((PARTS[type] && PARTS[type].hue) || 'slate');
}

// 검색어 → 파트 유형 (검색 순위에 가산점)
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
