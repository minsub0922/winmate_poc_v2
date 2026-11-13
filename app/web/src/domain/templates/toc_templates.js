// 목차 템플릿 — 목차(= Storyboard 버블) 흐름이 정해진 제안서 양식과, 업종마다 그 양식으로 조립한 시나리오.
// 표준 제안서는 업종별 표준 제안서 44종(bs_std_<업종>, standard_vertical_scenarios.json)을 그대로 쓴다.
// 다른 템플릿도 표준 제안서와 이름이 같은 목차(Overview · AI {업종} · 공간별 제안 · {업종} 솔루션 · 도입사례 · Why Samsung)는
// 그 업종 표준 제안서의 장(L_VS_*)을 그대로 옮기고 장 번호 · 간지 쪽 · 덱 이름만 바꾼다.
// 표준에 없는 목차(당사의 이해 · 핵심 기술 · 공간별 가치 제안 · 실행 계획 …)는 L_TOC_* 장이고, 모든 목차는 표준과 같은 간지(L_VS_DIV_R*)로 연다.
// 같은 템플릿이면 장(레이아웃)은 같고, 업종마다 내용과 같은 장을 쓰는 횟수만 다르다(공간 수 · 여정 수 · 솔루션 수).
// 내용: toc_content.json (build/toc/build_content.py — 업종별 과제 · 여정 · 핵심 기술 · 사양 · 구성, 업종 묶음별 당사의 이해 데이터)
// 장: toc_layouts.js (L_TOC_*) — 칸 이름 → 번호는 TOC_SLOTS. 간지 칸 번호는 L_VS_DIV_R<n> 규칙(아래 divider).
import { TOC_SLOTS } from './toc_layouts.js';
import { SUBS_SLOTS } from './subs_layouts.js';
import { SC } from './scenarios.js';
import { FILLS, FILL_CUSTOMER } from './scenario_fills.js';
import { STORY } from './scenario_story.js';
import { subscriptionNeed, addonIndex } from '../proposals/addons.js';

// 콘텐츠(toc_content.json, 지연 로딩) — 템플릿 정의(add-on 자리 규칙)보다 먼저 선언
let CONTENT = null; let LOADING = null;

/* ---------------- 목차 (버블 하나 = 목차 하나) ---------------- */
// std: 같은 이름의 표준 제안서 목차 — 그 장을 그대로 옮겨 쓴다.
export const TOCS = {
  overview: { name: 'Overview', type: 'overview', std: 'overview', goal: '삼성 AI 비즈니스를 Device · Solution · Service 한 장으로' },
  ua: { name: '당사의 이해', type: 'customer', goal: '고객사 · 업종 트렌드 · 경쟁 구도를 먼저 짚는다' },
  needs: { name: 'AI {업종}', type: 'value', std: 'needs', goal: '고객 니즈 셋을 삼성 AI 기술과 핵심 제안으로 잇는다' },
  tech: { name: '{업종} 핵심 기술', type: 'solution', goal: '솔루션마다 핵심 키워드 셋으로 기술을 소개한다' },
  space: { name: '공간별 제안', type: 'products', std: 'space', goal: '조감도로 공간을 펼치고 공간마다 놓일 대표 제품을 보여 준다' },
  value: { name: '공간별 가치 제안', type: 'scenario', goal: '공간을 이용자 여정으로 엮고 쓰이는 기능만 켜서 보여 준다' },
  sol: { name: '{업종} 솔루션', type: 'solution', std: 'sol', goal: '솔루션마다 기능 · 적용 공간 · 대표 장면을 보여 준다' },
  case: { name: '도입사례', type: 'case', std: 'case', goal: '같은 업종의 삼성 공식 도입사례로 믿음을 더한다' },
  why: { name: 'Why Samsung', type: 'why', std: 'why', goal: '전문가 · 오퍼링 · 프로세스 · 브랜드로 닫는다' },
  summary: { name: '제안 요약', type: 'overview', goal: '과제 · 제안 · 효과 · 결정 요청을 한 장으로', sub: '과제 · 제안 · 효과 · 결정 요청을 한 장으로 봅니다' },
  effect: { name: '기대 효과', type: 'effect', goal: '도입 전후로 달라지는 숫자를 보여 준다', sub: '도입 전후로 달라지는 숫자를 봅니다' },
  cost: { name: '비용 · 구매', type: 'cost', goal: '구매 방식과 5년 총소유비용을 비교한다', sub: '구매 방식과 5년 총소유비용을 비교합니다' },
  pilot: { name: '파일럿 · 확산', type: 'execution', goal: '작게 검증하고 같은 기준으로 넓힌다', sub: '작게 검증하고 같은 기준으로 넓힙니다' },
  plan: { name: '실행 계획', type: 'execution', goal: '실사부터 확산까지 단계와 일정을 보여 준다', sub: '실사부터 확산까지 단계와 일정을 봅니다' },
  rfp: { name: '요구사항 대응', type: 'requirements', goal: '평가 항목마다 대응과 근거를 붙인다', sub: '평가 항목마다 대응과 근거를 붙입니다' },
  spec: { name: '제품 사양', type: 'spec', goal: '핵심 제품을 사양으로 나란히 비교한다', sub: '핵심 제품을 사양으로 나란히 비교합니다' },
  bom: { name: '구성 · 수량', type: 'bom', goal: '공간마다 놓일 제품과 수량을 한 표로', sub: '공간마다 놓일 제품과 수량을 한 표로 봅니다' },
  vp: { name: 'Value Props', type: 'value', goal: '제품과 함께 쓰는 솔루션이 주는 가치 셋을 먼저 보여 준다', sub: '제품과 솔루션이 함께 만드는 세 가지 가치' },
  vpd: { name: 'Value Prop 상세', type: 'products', goal: '가치마다 제품 · 솔루션이 쓰이는 장면과 기능을 보여 준다', sub: '가치마다 제품 · 솔루션이 쓰이는 장면' },
  pcase: { name: '유관사례', type: 'case', goal: '같은 제품 · 제품군을 먼저 도입한 고객 사례로 믿음을 더한다' },
  pspec: { name: 'Spec', type: 'spec', goal: '제품의 핵심 숫자와 사양을 한 장으로', sub: '핵심 숫자와 사양을 한 장으로' },
  // 구독(B2B 삼성 AI 구독) — 장은 L_SUB_*(subs_layouts.js), 내용은 구독 레지스트리(app/data/subscriptions.json → toc_content.json v.sub · subs)
  subs: { name: 'B2B 삼성 AI 구독', type: 'subscription', goal: '현장의 고민에서 출발해 구독의 세 가지 가치와 일시불과의 차이를 보여 준다', sub: '초기 비용은 낮추고, 관리는 삼성이' },
  subpkg: { name: '{업종} 구독 패키지', type: 'subscription', goal: '이 업종에 맞춘 구독 패키지와 구독할 수 있는 품목을 사진으로 보여 준다' },
  subcare: { name: '구독 케어 · B2B 블루패스', type: 'subscription', goal: '정기 케어 4단계 · B2B 블루패스 · 관리 옵션으로 관리 부담을 덜어 준다', sub: '정기 케어 4단계와 B2B 블루패스' },
  subterm: { name: '구독 조건 · 결제', type: 'subscription', goal: '기간 · 방문 주기 · 대상 · 납부 방법을 정하고 문의로 닫는다', sub: '기간 · 방문 주기 · 대상 · 납부 방법' },
  subone: { name: 'B2B 삼성 AI 구독 요약', type: 'subscription', goal: '구독 가치 · 조건 · 패키지 · 문의처를 한 장으로', sub: '구독 제안을 한 장으로' },
  // 요구사항에 따라 다른 구성에 더하는 목차(add-on) — 구독 가치 · 업종 패키지 · 납부 방법(+ 기간 한정 혜택)
  subsol: { name: '구독 솔루션 제안', type: 'subscription', addon: 'sub', goal: '구독 · 렌탈 · 월 납부 요구에 답해 이 고객의 구독 가치 · 업종 패키지 · 납부 방법을 제안한다', sub: '같은 제품을 구독으로 — 가치 · 패키지 · 납부 방법' },
};
/* ---------------- 요구사항에 따라 더하는 목차 (add-on) ---------------- */
// 고객 요구에 구독 · 렌탈 · 월 납부(또는 초기 비용 · 관리 부담 둘 이상)가 있으면 어느 템플릿에든 '구독 솔루션 제안'만 더한다.
// 자리: 마지막 '비용 · 구매' 바로 뒤, 없으면 첫 실행(파일럿 · 실행 계획) · 사례 · Why Samsung 앞(구독 레지스트리 addon.place).
// 이미 구독 목차가 있는 구성(구독 제안서 · 구독 전환 제안서)에는 더하지 않는다.
export const ADDONS = { sub: { toc: 'subsol', label: '구독 솔루션 제안' } };
const addonRules = () => (CONTENT && CONTENT.subs && CONTENT.subs.addon) || null;
/** 목차 키 목록에 add-on 목차를 알맞은 자리에 — 같은 유형 목차가 이미 있으면 그대로 */
export function withAddons(tocs, addons) {
  const out = [...tocs];
  for (const a of addons || []) {
    const A = ADDONS[a]; if (!A || out.includes(A.toc) || out.some((k) => TOCS[k].type === TOCS[A.toc].type)) continue;
    out.splice(addonIndex(out.map((k) => ({ type: TOCS[k].type })), addonRules()), 0, A.toc);
  }
  return out;
}
/** 고객 요구 문장 → 더할 목차 — 구독 요구가 있으면 ['sub'] (판정은 구독 레지스트리 addon 규칙, 서버와 같음) */
export function addonsForRequirement(text) { return subscriptionNeed(text, addonRules()).need ? ['sub'] : []; }
const VX_STD = ['bs_v_ai_apartment_1', 'bs_v_ai_office_1', 'bs_v_ai_store_1', 'bs_v_entertainment_1', 'bs_v_knowledge_industry_center_1', 'bs_v_senior_town_1', 'bs_v_smart_academy_1', 'bs_v_smart_barracks_1', 'bs_v_smart_factory_1', 'bs_v_smart_finance_1', 'bs_v_smart_home_1', 'bs_v_smart_hospital_1', 'bs_v_smart_hotel_1', 'bs_v_smart_network_1', 'bs_v_smart_office_1', 'bs_v_smart_public_1', 'bs_v_smart_retail_1', 'bs_v_smart_school_1', 'bs_v_smart_transportation_1', 'bs_v_smart_university_1'];
const VX_PAIN = VX_STD.map((x) => x.replace(/_1$/, '_2'));

/* ---------------- 템플릿 ---------------- */
// ua: 당사의 이해에 고르는 장 — 고객사 분석(prof · pain) · 업종 트렌드(line · share · stat · key) · 경쟁 비교(matrix 점수표 · win 차별점 3 · map 포지셔닝)
export const TOC_TEMPLATES = [
  { id: 'std', name: '표준 제안서', badge: '대표 · 업종별 표준 제안서', deck: '표준 제안', hue: 'slate', req: 'std', strategy: 'value', ending: 'workshop',
    desc: '고객 니즈별 AI 제안 · 공간별 대표 제품 · 솔루션을 표준 순서로 보여 주는 기본 양식', tocs: ['overview', 'needs', 'space', 'sol', 'case', 'why'],
    sub: '업종 표준 구성 그대로', related: [] },
  { id: 'stdx', name: '표준 제안서 확장형', badge: '당사의 이해 포함', deck: '표준 제안', hue: 'blue', req: 'std', strategy: 'value', ending: 'workshop', keepCover: true,
    desc: '표준 제안서의 Overview 자리에 당사의 이해(고객사 · 트렌드 · 경쟁)를 넣은 양식', tocs: ['ua', 'needs', 'space', 'sol', 'case', 'why'], ua: ['prof', 'line', 'key', 'matrix'],
    sub: '고객을 먼저 이해하고, 공간마다 답합니다', related: ['bs_account_inspire', 'bs_account_paulbassett', 'bs_account_episode'] },
  { id: 'space', name: '공간 가치형 제안서', badge: '솔루션 1개 이상', deck: '공간 가치 제안', hue: 'teal', req: 'std', strategy: 'space', ending: 'workshop',
    desc: '공간을 이용자 여정으로 엮고, 장마다 쓰이는 솔루션 기능만 켜서 보여 주는 양식', tocs: ['overview', 'tech', 'value', 'case', 'why'],
    sub: '공간마다 이어지는 이용자의 하루', related: VX_STD },
  { id: 'spacex', name: '공간 가치형 제안서 확장형', badge: '당사의 이해 포함', deck: '공간 가치 제안', hue: 'teal', req: 'std', strategy: 'space', ending: 'workshop',
    desc: '공간 가치형 제안서의 Overview 자리에 당사의 이해를 넣은 양식', tocs: ['ua', 'tech', 'value', 'case', 'why'], ua: ['pain', 'share', 'key', 'map'],
    sub: '업종의 흐름에서 출발한 공간 경험', related: ['bs02', 'bs05', 'bs06'] },
  { id: 'pain', name: '과제 해결형 제안서', badge: '기존 샘플에서 추출', deck: '과제 해결 제안', hue: 'violet', req: 'renew', strategy: 'pain', ending: 'pilot',
    desc: '고객 과제에서 출발해 핵심 제안 · 공간 장면 · 실행 계획으로 닫는 양식', tocs: ['ua', 'needs', 'value', 'plan', 'case', 'why'], ua: ['pain', 'prof'],
    sub: '현장의 과제에서 출발한 해법', related: ['bs07', 'bs08', 'bs09', 'bs14', 'bs15', ...VX_PAIN] },
  { id: 'build', name: '구축 실행형 제안서', badge: '기존 샘플에서 추출', deck: '구축 실행 제안', hue: 'teal', req: 'new', strategy: 'space', ending: 'scope',
    desc: '공간별 구성 · 수량 · 사양 · 일정으로 구축 범위를 확정하는 양식', tocs: ['summary', 'space', 'bom', 'spec', 'plan', 'case', 'why'],
    sub: '공간별 구성부터 실행 일정까지', related: ['bs03', 'bs04', 'bs18'] },
  { id: 'roi', name: '투자 효과형 제안서', badge: '기존 샘플에서 추출', deck: '투자 효과 제안', hue: 'green', req: 'ops', strategy: 'roi', ending: 'pilot',
    desc: '현황 숫자 → 핵심 기술 → 기대 효과 → 비용 · 파일럿으로 결정을 쉽게 하는 양식', tocs: ['summary', 'ua', 'tech', 'effect', 'cost', 'pilot', 'why'], ua: ['prof', 'stat'],
    sub: '숫자로 확인하는 도입 효과', related: ['bs01', 'bs13', 'bs16', 'bs17', 'bs19', 'bs20'] },
  { id: 'compete', name: '경쟁 비교형 제안서', badge: '기존 샘플에서 추출', deck: '경쟁 비교 제안', hue: 'amber', req: 'compete', strategy: 'compete', ending: 'shortlist',
    desc: '같은 기준으로 공급사를 비교하고 사양 · 비용으로 선택을 굳히는 양식', tocs: ['summary', 'ua', 'needs', 'spec', 'cost', 'case', 'why'], ua: ['matrix', 'win', 'map'],
    sub: '같은 기준으로 비교한 선택', related: ['bs10', 'bs12'] },
  { id: 'prod', name: '제품 제안서', badge: '제품 1 + 관련 솔루션', deck: '제품 제안', hue: 'blue', req: 'new', strategy: 'value', ending: 'pilot',
    desc: '제품 하나와 함께 쓰는 솔루션으로 가치 셋 · 가치별 상세 · 유관사례 · Spec을 보여 주는 양식', tocs: ['vp', 'vpd', 'pcase', 'pspec'],
    sub: '제품 하나로 시작하는 변화', related: [] },
  { id: 'rfp', name: '요구사항 대응형 제안서', badge: '기존 샘플에서 추출', deck: '요구사항 대응 제안', hue: 'blue', req: 'new', strategy: 'rfp', ending: 'shortlist',
    desc: '평가 항목 순서대로 대응 · 사양 · 수량 · 일정을 빠짐없이 답하는 양식', tocs: ['ua', 'rfp', 'spec', 'bom', 'plan', 'case', 'why'], ua: ['prof', 'key'],
    sub: '요구사항마다 빠짐없이 답합니다', related: ['bs11'] },
  { id: 'subs', name: '구독 제안서', badge: 'B2B 삼성 AI 구독', deck: '구독 제안', hue: 'green', req: 'subs', strategy: 'roi', ending: 'budget', kind: 'subs',
    desc: '초기 비용 부담 없이 B2B 삼성 AI 구독으로 도입하자는 양식 — 구독 가치 · 업종 패키지 · 공간별 제안 · 케어 · 조건 · 결제 순서',
    tocs: ['overview', 'subs', 'subpkg', 'space', 'subcare', 'subterm', 'case', 'why'], sub: '초기 비용은 낮추고, 관리는 삼성이', related: ['bs_sub_ed_univ', 'bs_sub_ht_large', 'bs_sub_md_hospital', 'bs_sub_of_hq'] },
  { id: 'subsl', name: '구독 전환 제안서', badge: '한 장 요약 + 조건', deck: '구독 전환 제안', hue: 'green', req: 'subs', strategy: 'roi', ending: 'budget', kind: 'subs',
    desc: '제품을 정한 고객에게 같은 제품을 구독으로 들이자고 짧게 제안하는 양식 — 한 장 요약 · 업종 패키지 · 조건 · 결제',
    tocs: ['subone', 'subpkg', 'subterm', 'why'], sub: '같은 제품, 구독으로 가볍게', related: ['bs_sub_fn_bank'] },
  // 구독 솔루션이 포함된 구성 — 다른 양식에 '구독 솔루션 제안' 목차만 더한 것(base + addons). 요구사항에 따라 어느 양식에든 같은 방식으로 더한다.
  { id: 'stdsub', base: 'std', addons: ['sub'], name: '표준 제안서 + 구독 솔루션', badge: '표준 제안서에 구독 솔루션 제안', deck: '표준 제안', hue: 'green', req: 'subs', strategy: 'value', ending: 'budget',
    desc: '표준 제안서 순서는 그대로 두고 도입사례 앞에 구독 솔루션 제안(구독 가치 · 업종 패키지 · 납부 방법)을 더한 양식 — 고객이 구독 · 렌탈 · 월 납부를 원하거나 초기 비용 · 관리 부담을 말할 때',
    tocs: withAddons(['overview', 'needs', 'space', 'sol', 'case', 'why'], ['sub']), sub: '업종 표준 구성 + 구독 솔루션 제안', related: ['bs_sub_std_ht_mid', 'bs_sub_std_md_clinic', 'bs_sub_std_of_sme', 'bs_sub_std_pb_agency'] },
  { id: 'roisub', base: 'roi', addons: ['sub'], name: '투자 효과형 + 구독 솔루션', badge: '비용 · 구매 다음에 구독 솔루션', deck: '투자 효과 제안', hue: 'green', req: 'ops', strategy: 'roi', ending: 'budget',
    desc: '기대 효과 · 비용(5년 총소유비용) 다음에 같은 제품을 구독으로 들이는 길(구독 가치 · 업종 패키지 · 납부 방법)을 더한 양식 — 일시불과 구독을 함께 저울질하는 고객',
    tocs: withAddons(['summary', 'ua', 'tech', 'effect', 'cost', 'pilot', 'why'], ['sub']), ua: ['prof', 'stat'], sub: '숫자로 확인하는 도입 효과 + 구독 솔루션', related: [] },
];
export const TPL = Object.fromEntries(TOC_TEMPLATES.map((t) => [t.id, t]));
/** 목차 이름 — {업종}은 그 업종 표준 제안서의 AI 업종 이름(AI 퀵서비스 → 퀵서비스). 업종이 없으면 '업종'. */
export const tocName = (key, short) => TOCS[key].name.replace('{업종}', short || '업종');

/* ---------------- 콘텐츠 (지연 로딩) ---------------- */
/** 스크립트(구독 샘플 시나리오 생성 · 검사)가 JSON 을 직접 읽어 넣을 때 — 앱은 loadTocContent 를 쓴다 */
export function useTocContent(c) { CONTENT = c; LOADING = Promise.resolve(c); return c; }
export function loadTocContent() {
  if (CONTENT) return Promise.resolve(CONTENT);
  if (!LOADING) LOADING = import('./toc_content.json').then((m) => { CONTENT = m.default || m; return CONTENT; });
  return LOADING;
}
export const tocContent = () => CONTENT;

/* ---------------- 업종 표준 제안서 (bs_std_<업종>) ---------------- */
const STD_ID = (vid) => 'bs_std_' + vid;
const STD_STAGE = {
  overview: (g) => /Overview$/.test(g.name), needs: (g) => g.key === 'value', space: (g) => g.key === 'space',
  sol: (g) => g.key === 'build', case: (g) => /도입사례$/.test(g.name), why: (g) => /Why Samsung$/.test(g.name),
};
const STD_TOC_IMG = { overview: 0, needs: 1, space: 2, sol: 3, case: 4, why: 5 }; // L_VS_TOC 사진 카드 순서
const isDiv = (f) => /^L_VS_DIV_R\d$/.test(f);
const DECKS = {};
/** 업종 표준 제안서를 목차 단위로 — { cust, ai, short, foot, needs, cover, st: { overview … why: { g, items: [{ f, role, o, pg }] } } } */
export function stdDeck(vid) {
  if (DECKS[vid]) return DECKS[vid];
  const id = STD_ID(vid); const s = SC[id]; const fills = FILLS[id];
  if (!s || !fills) return null;
  let k = 0;
  const stages = s.flow.map((g) => ({ g, items: g.slides.map((x) => { const o = fills[k]; k += 1; return { f: x.f, role: x.role, o, pg: k }; }) }));
  const st = {};
  for (const [key, ok] of Object.entries(STD_STAGE)) { const hit = stages.find((x) => ok(x.g)); if (hit) st[key] = hit; }
  if (!st.needs || !st.space) return null;
  const ai = st.needs.g.name.replace(/^\d+\s+/, '');
  const nt = (st.needs.items.find((x) => x.f === 'L_VS_NEEDS') || { o: { t: {} } }).o.t; // q · 기술 · 제안 · 장면 2 — 칸 7+7i …
  const toc = (stages.flatMap((x) => x.items).find((x) => x.f === 'L_VS_TOC') || { o: { img: {} } }).o.img || {};
  const D = {
    id, s, st, cust: FILL_CUSTOMER[id] || '', ai, short: ai.replace(/^AI\s+/, ''),
    foot: nt[28] || `${FILL_CUSTOMER[id]} · ${ai} 표준 제안서`,
    needs: [0, 1, 2].map((i) => ({ q: nt[7 + 7 * i], tech: nt[8 + 7 * i], v: nt[10 + 7 * i], c: [nt[11 + 7 * i], nt[12 + 7 * i]] })).filter((n) => n.v),
    cover: stages[0].items[0], tocImg: (key) => { const x = toc[STD_TOC_IMG[key]]; return x && x.src; },
    divImg: (key) => { const d = st[key] && st[key].items.find((x) => isDiv(x.f)); return d && d.o.img && d.o.img[0] ? d.o.img[0].src : null; },
  };
  DECKS[vid] = D;
  return D;
}

/* ---------------- 장 조립 도구 ---------------- */
const ICO = (fid, on = true) => (fid ? `/assets/toc/icons/${fid}.${on ? 'on' : 'off'}.png` : '/assets/toc/icons/blank.png');
const BLANK = '/assets/toc/icons/blank.png';
function sheet(f, role, row) {
  const S = TOC_SLOTS[f] || SUBS_SLOTS[f] || { t: {}, img: {} };
  const o = { f, t: {}, img: {} };
  const api = {
    o, role, row: row || role,
    t(name, v) { const i = S.t[name]; if (i != null && v != null) o.t[i] = typeof v === 'string' && v.includes('<br>') ? { html: v } : v; return api; },
    img(name, src, kind) {
      const i = S.img[name]; if (i == null) return api;
      o.img[i] = src ? { src, fit: kind === 'cut' || kind === 'icon' ? 'contain' : 'cover', keep: true } : { src: BLANK, fit: 'contain', keep: true };
      return api;
    },
  };
  return api;
}
const pad = (n) => String(n).padStart(2, '0');
const hasBatchim = (w) => { const c = (w || '').trim().slice(-1); const code = c.charCodeAt(0) - 0xac00; return code >= 0 && code <= 11171 && code % 28 !== 0; };
const josa = (w, a, b) => (hasBatchim(w) ? a : b);
const ro = (w) => { const c = (w || '').trim().slice(-1); const code = c.charCodeAt(0) - 0xac00; return code >= 0 && code <= 11171 && code % 28 && code % 28 !== 8 ? '으로' : '로'; };
const vName = (V) => V.nm.split(' (')[0];
const pageRange = (a, b) => (a === b ? String(a) : `${a}–${b}`);
/** 표준 장을 이 덱 자리로 — 장 번호(눈썹 · 간지) · 간지 쪽 · 덱 이름 · 쪽 번호만 바꾼다 */
function retag(o0, c) {
  const o = structuredClone(o0); const t = o.t || (o.t = {});
  const dv = /^L_VS_DIV_R(\d)$/.exec(o.f);
  for (const k of Object.keys(t)) {
    let v = t[k]; if (typeof v !== 'string') continue;
    if (dv && k === '1' && /^\d{2} \/ \d{2}$/.test(v)) v = `${pad(c.no)} / ${pad(c.total)}`;
    else if (!dv && k === '0' && /^\d{2} · /.test(v)) { v = pad(c.no) + v.slice(2); if (c.rename) v = v.replace(c.rename[0], c.rename[1]); }
    if (/^CONFIDENTIAL · \d+$/.test(v)) v = 'CONFIDENTIAL · ' + c.page;
    else if (c.foot0 && v.includes(c.foot0)) v = v.split(c.foot0).join(c.foot);
    t[k] = v;
  }
  if (dv) for (let r = 0; r < +dv[1]; r++) { const k = String(7 + 3 * r); if (typeof t[k] === 'string' && /^\d+(–\d+)?$/.test(t[k])) t[k] = t[k].split('–').map((p) => String(+p + c.off)).join('–'); }
  return o;
}
/** 간지 — L_VS_DIV_R<n>: 0 고객사 로고 · 1 장 번호 · 2 제목 · 3 한 줄 · 4 라벨 · 행마다 (5+3r 번호 · 6+3r 항목 · 7+3r 쪽) · 5+3n 쪽 번호 */
function divider({ no, total, title, sub, rows, photo, page }) {
  const n = Math.max(1, Math.min(6, rows.length));
  const t = { 0: '고객사 로고', 1: `${pad(no)} / ${pad(total)}`, 2: title, 3: sub, 4: '이 장에서 다루는 것' };
  rows.slice(0, n).forEach((r, i) => { t[5 + 3 * i] = pad(i + 1); t[6 + 3 * i] = r.label; t[7 + 3 * i] = pageRange(r.from, r.to); });
  t[5 + 3 * n] = 'CONFIDENTIAL · ' + page;
  return { o: { f: 'L_VS_DIV_R' + n, t, img: { 0: { src: photo, fit: 'cover', keep: true, name: title + ' 간지 사진' } } }, role: '간지 · ' + pad(no) + ' ' + title };
}

/* ---------------- 표준에 없는 목차의 장 ---------------- */
// 각 장: { o, role, row } — row는 간지 '이 장에서 다루는 것' 항목(같은 row가 이어지면 한 줄로 묶음). std: 표준 장을 옮겨 쓰는 경우.
const B = {};
B.tech = (V, G, T, c, D) => {
  const n = V.tech.length; const f = 'L_TOC_TECH' + n;
  const s = sheet(f, '핵심 솔루션 · 키워드 3', `핵심 기술 ${n}가지`).t('eb', c.eb())
    .t('title', n > 1 ? `${D.ai}${josa(D.ai, '을', '를')} 움직이는 핵심 기술 ${n}가지` : `${D.ai}${josa(D.ai, '을', '를')} 움직이는 핵심 기술, ${V.tech[0].nm}`);
  V.tech.forEach((x, i) => {
    s.t('nm' + i, x.nm).t('in' + i, x.intro);
    x.kw.forEach(([fid, kw, ln], k) => s.t(`kw${i}_${k}`, kw).t(`kl${i}_${k}`, ln).img(`ki${i}_${k}`, ICO(fid), 'icon'));
  });
  return [s];
};
const jrLabel = (t) => (t.length > 16 && t.includes(', ') ? t.split(', ').pop() : t);
B.value = (V, G, T, c, D) => {
  const bird = D.st.space.items.find((x) => /^L_VS_BIRD_/.test(x.f));
  const out = [];
  if (bird) out.push({ std: bird, rename: ['공간별 제안', c.name], role: '공간 조감도 · 공간 번호', row: (/_B\d+$/.test(bird.f) ? '건물 조감도' : '공간 조감도') + ` · ${V.sp.length}개 공간`,
    patch: { 2: `${V.sp.length}개 공간을 잇는 이용자 여정 ${V.jr.length}가지` } });
  V.jr.forEach((j) => {
    const m = Math.min(3, j.sp.length); const ns = Math.min(2, j.sol.length) || 1;
    const s = sheet(`L_TOC_JOURNEY${m}${ns === 2 ? '' : 'S'}`, j.t, jrLabel(j.t)).t('eb', c.eb()).t('title', j.t);
    j.sp.slice(0, m).forEach((si, i) => { s.t('st' + i, V.sp[si].n).t('st' + i + 'n', String(si + 1)).t('sc' + i, j.scenes[i]).img('ph' + i, V.sp[si].ph); });
    const per = ns === 2 ? 8 : 10;
    j.sol.slice(0, ns).forEach((b, k) => {
      s.t('sn' + k, b.nm).t('sa' + k, b.act);
      const on = new Set(b.on); const pick = [...b.on];
      for (const f of b.all) { if (pick.length >= per) break; if (!on.has(f)) pick.push(f); }
      const order = new Map(b.all.map((f, i) => [f, i]));
      pick.sort((x, y) => (order.get(x) ?? 99) - (order.get(y) ?? 99));
      for (let i = 0; i < per; i++) s.img(`fi${k}_${i}`, pick[i] ? ICO(pick[i], on.has(pick[i])) : null, 'icon');
    });
    out.push(s);
  });
  return out;
};
const UA = {
  prof: (V, G, c, D) => { const [, items] = G.pf; const s = sheet('L_TOC_UAPROF', '고객사 분석 · 현황 지표').t('eb', c.eb('고객사 분석')).t('title', `${D.cust}, 지금 이런 규모로 움직입니다`).img('ph', V.cover);
    items.forEach(([lb, un, ic], i) => s.t('lb' + i, lb).t('vl' + i, '[00]').t('un' + i, un).img('ic' + i, `/assets/toc/icons/ui-${ic}.png`, 'icon')); return s; },
  pain: (V, G, c, D) => { const s = sheet('L_TOC_UAPAIN', '고객사 분석 · 과제 3').t('eb', c.eb('고객사 분석')).t('title', `${D.cust}${josa(D.cust, '이', '가')} 풀어야 할 세 가지 과제`);
    V.pains.forEach(([t, l, ph], i) => s.t('pt' + i, t).t('pl' + i, l).img('ph' + i, ph)); return s; },
  line: (V, G, c) => { const [title, chart, sd] = G.tl; const s = sheet('L_TOC_TRLINE', '업종 트렌드 · 연도별 추이').t('eb', c.eb('업종 트렌드')).t('title', title).t('ct', chart).t('sd', sd);
    for (let k = 0; k < 6; k++) s.t('v' + k, '[00]'); return s; },
  share: (V, G, c) => { const [title, center, labels] = G.ts; const s = sheet('L_TOC_TRSHARE', '업종 트렌드 · 구성비').t('eb', c.eb('업종 트렌드')).t('title', title).t('cl', center);
    labels.forEach((x, k) => s.t('lb' + k, x).t('vl' + k, '[00]%')); return s; },
  stat: (V, G, c) => { const [title, items] = G.tt; const s = sheet('L_TOC_TRSTAT', '업종 트렌드 · 핵심 지표 3').t('eb', c.eb('업종 트렌드')).t('title', title);
    items.forEach(([lb, un], i) => s.t('lb' + i, lb).t('vl' + i, '[00]').t('un' + i, un).img('ph' + i, V.sp[(i + 1) % V.sp.length].ph)); return s; },
  key: (V, G, c) => { const [title, items] = G.tk; const s = sheet('L_TOC_TRKEY', '업종 트렌드 · 키워드 3').t('eb', c.eb('업종 트렌드')).t('title', title);
    items.forEach(([kw, ln], i) => s.t('kw' + i, kw).t('kl' + i, ln).img('ph' + i, V.sp[(i + 2) % V.sp.length].ph)); return s; },
  // 경쟁사 비교 — 경쟁사는 익명(유형만), 점수(●○ 5점)와 경쟁사 메모는 예시 값(build/toc/content_compete.py) · 삼성 칸은 이 업종 대표 제품 · 솔루션
  matrix: (V, G, c) => { const cs = G.cs; const P = V.pp;
    const s = sheet('L_TOC_CPSCORE', '경쟁사 비교 · 기준별 점수').t('eb', c.eb('경쟁사 비교')).t('title', G.cm[0]).img('pc', P.cut, 'cut').t('hsp', P.nm).t('hat', cs.a).t('hbt', cs.b);
    cs.rows.forEach(([cr, ic, sv, [x, y, z], na, nb], r) => s.img('ci' + r, CPI(ic), 'icon').t('cr' + r, cr).t(`s${r}d`, DOTS(x)).t('s' + r, sv)
      .t(`a${r}d`, DOTS(y)).t('a' + r, na).t(`b${r}d`, DOTS(z)).t('b' + r, nb));
    return s.t('st', cpTotal(cs.rows, 0)).t('at', cpTotal(cs.rows, 1)).t('bt', cpTotal(cs.rows, 2)); },
  win: (V, G, c, D) => { const cs = G.cs; const P = V.pp; const k = specKey(P);
    const s = sheet('L_TOC_CPWIN', '경쟁사 비교 · 차별점 3').t('eb', c.eb('경쟁사 비교')).t('title', `${D.cust}${josa(D.cust, '이', '가')} 삼성을 고르는 세 가지 이유`);
    const items = [[String(V.nsol), '개 솔루션 · 한 공급사', cs.win[0], spPhotos(V, 1, [V.cover])[0], 'space', [5, 3, 2]],
      [String(V.sp.length), '개 공간 · 한 번에 제안', cs.win[1], V.cover, 'space', [5, 3, 2]],
      [k ? k.v : '', k ? k.u : '', k ? `${P.nm} ${k.lb}` : P.nm, P.cut, 'cut', [5, 4, 3]]];
    items.forEach(([v, u, tt, ph, kind, dots], i) => { s.t('v' + i, v).t('u' + i, u).t('tt' + i, tt).img('ph' + i, ph, kind);
      ['삼성', '경쟁사 A', '경쟁사 B'].forEach((nm, j) => s.t(`n${i}_${j}`, nm).t(`d${i}_${j}`, DOTS(dots[j]))); });
    return s; },
  map: (V, G, c) => { const [title, ax, ay, pos] = G.cp; const P = V.pp;
    const s = sheet('L_TOC_CPPOS', '경쟁사 비교 · 포지셔닝').t('eb', c.eb('경쟁사 비교')).t('title', title).t('ax', ax).t('ay', ay).img('pc', P.cut, 'cut');
    const ph = spPhotos(V, 3, [V.cover, spPhotos(V, 1, [V.cover])[0]]);
    pos.forEach((x, k) => s.t('st' + k, x).img('ph' + k, ph[k])); return s; },
};
const CPI = (k) => `/assets/toc/icons/cp-${k}.png`;
/** 업종 공간 사진 n장 — 서로 다르고, 가능하면 avoid에 없는 것부터 (모자라면 겹쳐도 채움) */
const spPhotos = (V, n, avoid = []) => { const all = [...new Set(V.sp.map((x) => x.ph).filter(Boolean))]; const out = all.filter((x) => !avoid.includes(x));
  for (const x of all) if (out.length < n && !out.includes(x)) out.push(x); while (out.length < n) out.push(all[out.length % all.length] || V.cover); return out.slice(0, n); };
const DOTS = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
const cpTotal = (rows, i) => String(Math.round((rows.reduce((a, r) => a + r[3][i], 0) / (5 * rows.length)) * 100));
/** 대표 제품의 짧은 핵심 숫자 하나 — '500 nit' → { v: '500', u: 'nit' } (해상도처럼 긴 값은 건너뜀) */
function specKey(P) {
  for (const [v, lb] of P.keys || []) { if (/[x×]/.test(v)) continue; const m = /^([\d.,/:]+)\s*(.*)$/.exec(v); if (m && m[1].length <= 6) return { v: m[1], u: m[2], lb }; }
  const k = (P.keys || [])[0]; return k ? { v: k[0], u: '', lb: k[1] } : null;
}
export const UA_KINDS = { prof: '고객사 분석 · 현황 지표', pain: '고객사 분석 · 과제', line: '업종 트렌드 · 연도별 추이', share: '업종 트렌드 · 구성비', stat: '업종 트렌드 · 핵심 지표', key: '업종 트렌드 · 키워드', matrix: '경쟁사 비교 · 기준별 점수', win: '경쟁사 비교 · 차별점 3', map: '경쟁사 비교 · 포지셔닝' };
const UA_GROUP = { prof: '고객사 분석', pain: '고객사 분석', line: '업종 트렌드', share: '업종 트렌드', stat: '업종 트렌드', key: '업종 트렌드', matrix: '경쟁사 비교', win: '경쟁사 비교', map: '경쟁사 비교' };
B.ua = (V, G, T, c, D) => (T.ua || ['prof']).map((k) => { const s = UA[k](V, G, c, D); s.role = UA_KINDS[k]; s.row = UA_GROUP[k]; return s; });
B.summary = (V, G, T, c, D) => {
  const s = sheet('L_TOC_SUMMARY', '과제 → 제안 → 효과 → 결정 요청', '과제 · 제안 · 효과 · 결정 요청').t('eb', c.eb()).t('title', '과제 · 제안 · 효과 · 결정 요청을 한 장으로');
  V.pains.forEach(([t], j) => s.t('b0_' + j, t));
  D.needs.forEach((n, j) => s.t('b1_' + j, n.v));
  G.kp[1].slice(0, 3).forEach(([lb], j) => s.t('b2_' + j, `${lb} [00]% 개선`));
  s.t('b3_0', G.ask);
  return [s];
};
B.effect = (V, G, T, c) => {
  const s = sheet('L_TOC_KPI', '도입 전후 KPI 4', '도입 전후 KPI').t('eb', c.eb()).t('title', G.kp[0]);
  G.kp[1].forEach(([lb, un], i) => s.t('lb' + i, lb).t('un' + i, '도입 후 · ' + un));
  return [s];
};
B.cost = (V, G, T, c) => {
  const s = sheet('L_TOC_TCO', '구매 방식 3 + 5년 총소유비용', '구매 방식 · 5년 TCO').t('eb', c.eb());
  G.tc.forEach((x, i) => s.t('oc' + i, x));
  return [s];
};
B.pilot = (V, G, T, c) => {
  const [title, steps] = G.pl;
  const s = sheet('L_TOC_PILOT', '파일럿 → 확산 3단계', '파일럿 → 확산 3단계').t('eb', c.eb()).t('title', title);
  steps.forEach(([nm, sc, cr], i) => { s.t('pn' + i, nm).t('ps' + i, sc); cr.forEach((x, j) => s.t(`pc${i}_${j}`, x)); });
  return [s];
};
B.plan = (V, G, T, c) => {
  const [title, stages] = G.rd;
  const s = sheet('L_TOC_ROADMAP', '4단계 실행 일정', '4단계 실행 일정').t('eb', c.eb()).t('title', title);
  stages.forEach(([nm, lines], i) => { s.t('pn' + i, nm); lines.forEach((x, j) => s.t(`pl${i}_${j}`, x)); });
  return [s];
};
B.rfp = (V, G, T, c) => {
  const [title, rows] = G.rf;
  const s = sheet('L_TOC_RFP', '평가 항목 5 대응', '평가 항목별 대응').t('eb', c.eb()).t('title', title);
  rows.forEach(([rq, rs, ev], r) => s.t('rq' + r, rq).t('rs' + r, rs).t('ev' + r, ev));
  return [s];
};
B.spec = (V, G, T, c) => {
  const s = sheet('L_TOC_SPEC', '핵심 제품 3 사양 비교', `핵심 제품 ${V.spec.length}종 사양`).t('eb', c.eb()).t('title', `핵심 제품 ${V.spec.length}가지, 사양으로 비교합니다`);
  V.spec.forEach((x, i) => { s.t('nm' + i, x.nm).t('md' + i, x.md).img('img' + i, x.cut, 'cut'); x.rows.forEach(([lb, vl], j) => s.t(`sl${i}_${j}`, lb).t(`sv${i}_${j}`, vl)); });
  return [s];
};
B.bom = (V, G, T, c) => {
  const n = Math.min(8, Math.max(3, V.bom.rows.length));
  const s = sheet('L_TOC_BOM' + n, `공간 ${n} × 제품 5`, '공간별 구성 · 수량').t('eb', c.eb()).t('title', '공간마다 무엇을 몇 대 놓는지 한 표로 봅니다');
  V.bom.cols.forEach(([nm, cut], j) => s.t('cn' + j, nm).img('ci' + j, cut, 'cut'));
  for (let j = V.bom.cols.length; j < 5; j++) s.t('cn' + j, '').img('ci' + j, null, 'cut');
  V.bom.rows.slice(0, n).forEach(([nm, q], i) => { s.t('rn' + i, nm); for (let j = 0; j < 5; j++) s.t(`q${i}_${j}`, q[j] ?? ''); });
  for (let i = V.bom.rows.length; i < n; i++) { s.t('rn' + i, ''); for (let j = 0; j < 5; j++) s.t(`q${i}_${j}`, ''); }
  return [s];
};
/* 제품 제안서 — 대표 제품 하나(V.pp) + 함께 쓰는 솔루션. Value Props 3: 제품 + 솔루션이 셋이면 하나씩, 적으면 제품에서 여럿, 많으면 둘로 추림(build/toc/product.py) */
const VPN = (P) => P.vps.map((x) => (x.k === 'p' ? P.nm : x.nm));
B.vp = (V, G, T, c) => {
  const P = V.pp;
  const s = sheet('L_TOC_VP3', 'Value Props · 제품 · 솔루션 가치 3', '세 가지 가치').t('eb', c.eb()).t('title', `${P.nm}${josa(P.nm, '이', '가')} 주는 세 가지 가치`);
  P.vps.forEach((x, i) => s.t('src' + i, (x.k === 'p' ? '제품 · ' : '솔루션 · ') + VPN(P)[i]).t('no' + i, pad(i + 1)).t('tt' + i, x.t).t('ln' + i, x.l)
    .img('img' + i, x.img || P.cut, x.k === 'p' ? 'cut' : 'space'));
  return [s];
};
B.vpd = (V, G, T, c, D) => {
  const P = V.pp; const out = []; const spaces = D.st.space.items.filter((x) => x.f === 'L_VS_SPACE');
  let firstP = true;
  P.vps.forEach((x, i) => {
    const row = `${pad(i + 1)} ${x.t}`; const eb = c.eb(pad(i + 1));
    if (x.k === 'p') {
      if (firstP) P.rep.forEach((si) => spaces[si] && out.push({ std: spaces[si], eb, role: `${x.t} — ${V.sp[si] ? V.sp[si].n : '공간'}`, row }));
      else {
        out.push(sheet('L_TOC_PFEAT', `${x.t} — 제품 사진 + 가치 한 줄`, row).t('eb', eb).t('title', x.t).t('no', pad(i + 1)).t('kick', 'Value Prop')
          .t('ln', x.l).t('src', '제품 · ' + P.nm).img('img', P.gal[i] || P.gal[0] || P.cut, 'cut'));
      }
      firstP = false;
      return;
    }
    const it = D.st.sol && D.st.sol.items.find((y) => y.f === x.f);
    if (it) out.push({ std: it, eb, role: `${x.nm} — 기능 · 적용 공간 · 대표 장면`, row });
    if (x.sp.length) {
      const m = Math.min(3, x.sp.length);
      const s = sheet(`L_TOC_JOURNEY${m}S`, `${x.nm} — ${P.nm}${josa(P.nm, '과', '와')} 함께 쓰는 장면`, row).t('eb', eb).t('title', x.l);
      x.sp.slice(0, m).forEach((si, k) => s.t('st' + k, V.sp[si].n).t('st' + k + 'n', String(si + 1)).t('sc' + k, x.scenes[k]).img('ph' + k, V.sp[si].ph));
      s.t('sn0', x.nm).t('sa0', x.t);
      const on = new Set(x.on); const pick = [...x.on];
      for (const f of x.all) { if (pick.length >= 10) break; if (!on.has(f)) pick.push(f); }
      const order = new Map(x.all.map((f, k) => [f, k]));
      pick.sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
      for (let k = 0; k < 10; k++) s.img(`fi0_${k}`, pick[k] ? ICO(pick[k], on.has(pick[k])) : null, 'icon');
      out.push(s);
    }
  });
  return out;
};
B.pcase = (V) => V.pp.cases.map((x) => ({ raw: x.o, role: '유관사례 · ' + x.cust, row: x.row || x.cust }));
B.pspec = (V, G, T, c) => {
  const P = V.pp;
  const s = sheet('L_TOC_PSPEC', 'Spec · 핵심 숫자 3 + 사양 8', '핵심 사양').t('eb', c.eb()).t('title', `${P.nm}, 핵심 사양`).t('nm', P.nm).t('md', P.model || '').img('img', P.cut, 'cut');
  for (let i = 0; i < 3; i++) { const k = P.keys[i]; s.t('kv' + i, k ? k[0] : '').t('kl' + i, k ? k[1] : ''); }
  for (let j = 0; j < 8; j++) { const r = P.specs[j]; s.t('sl' + j, r ? r[0] : '').t('sv' + j, r ? r[1] : ''); }
  return [s];
};
/* 구독(B2B 삼성 AI 구독) — 기본 글은 원문 확인 사실(장 기본값), 업종마다 바꾸는 것은 패키지 · 사진 · 제목 · 납부안 순서뿐. 추론 결제안은 '협의안'. */
const SUBC = () => (CONTENT && CONTENT.subs) || { pay: {}, promo: null };
const subPhoto = (V) => (V.sub && V.sub.ph) || V.cover;
B.subs = (V, G, T, c, D) => [
  sheet('L_SUB_PAIN', '현장의 고민 4 → 전문 케어로 해결', '현장의 고민').t('eb', c.eb('현장의 고민')).img('img', subPhoto(V)),
  sheet('L_SUB_VALUE3', '구독 가치 3 · 비용 · 관리 · 만족', '구독 가치 3').t('eb', c.eb('구독 가치'))
    .t('title', `${D.cust}에 B2B 삼성 AI 구독이 맞는 세 가지 이유`).img('img2', V.cover),
  sheet('L_SUB_COMPARE', '일시불 구매 vs 구독 5', '일시불 vs 구독').t('eb', c.eb('구매 방식 비교')),
];
const pkgSheet = (V, c) => {
  const S = V.sub; const n = S.items.length >= 4 ? 4 : 3;
  const title = S.match === 'derived' ? S.title : `${S.title}, ${S.name}${ro(S.name)}`;
  const s = sheet(`L_SUB_PKG${n}`, `${S.name} · 사진 + 품목 ${n}`, S.name).t('eb', c.eb(S.name)).t('title', title).img('img', S.ph)
    .t('pl', S.place).t('nm', S.name).t('ln', S.line);
  S.items.slice(0, n).forEach(([lb, img, md], k) => s.t('pn' + k, lb).t('pm' + k, md || '').img('p' + k, img, 'cut'));
  return s;
};
B.subpkg = (V, G, T, c) => [pkgSheet(V, c), sheet('L_SUB_ITEMS', '구독 품목 8 · 제품 컷', '구독 품목').t('eb', c.eb('구독 품목'))];
B.subcare = (V, G, T, c) => [
  sheet('L_SUB_CARE4', '전문 케어 4단계', '전문 케어 4단계').t('eb', c.eb('전문 케어')),
  sheet('L_SUB_BLUEPASS', 'B2B 블루패스 · 숫자 3 + 서비스 4', 'B2B 블루패스').t('eb', c.eb()),
  sheet('L_SUB_CAREOPT', '관리 옵션 · 무상수리 vs 방문케어', '관리 옵션').t('eb', c.eb('관리 옵션')),
];
/** 이 고객 납부안 3 — 업종 묶음별 순서(공식 월 구독료 + 추론 협의안). 셋이 안 되면 null */
const pay3Sheet = (V, c, D) => {
  const C0 = SUBC(); const pick = (V.sub.pay || []).map((id) => C0.pay[id]).filter(Boolean).slice(0, 3);
  if (pick.length !== 3) return null;
  const s = sheet('L_SUB_PAY3', '맞춤 납부안 3 · 첫 안 추천', '납부 방법').t('eb', c.eb('납부 방법')).t('title', `${D.cust}에 맞는 구독 납부 방법 세 가지`);
  pick.forEach((p, i) => {
    s.t('pn' + i, p.name).t('pd' + i, p.summary).t('tag' + i, p.basis === 'official' ? '기본 방식' : '협의안').t('pc' + i, (p.confirm || []).slice(0, 2).join(' · '));
    (p.points || []).slice(0, 3).forEach((pt, k) => s.t(`pp${i}_${k}`, pt));
  });
  return s;
};
const promoSheet = (c) => { const C0 = SUBC(); return C0.promo && C0.promo.active ? sheet('L_SUB_PROMO', '도입 혜택 · 기간 한정', '도입 혜택').t('eb', c.eb('도입 혜택')) : null; };
B.subterm = (V, G, T, c, D) => [
  sheet('L_SUB_TERMS', '구독 조건 · 숫자 4 + 대상 · 조건 · 제한', '구독 조건').t('eb', c.eb()).img('img', subPhoto(V)),
  pay3Sheet(V, c, D), promoSheet(c),
  sheet('L_SUB_FLOW', '도입 절차 6 · 문의', '도입 절차 · 문의').t('eb', c.eb('도입 절차')).img('img', V.sp[0] ? V.sp[0].ph : V.cover),
].filter(Boolean);
/** 구독 솔루션 제안(add-on) — 구독 가치 3(이 고객 제목) · 업종 패키지 · 이 고객 납부안 3 (+ 기간 한정 혜택) */
B.subsol = (V, G, T, c, D) => [
  sheet('L_SUB_VALUE3', '구독 가치 3 · 비용 · 관리 · 만족', '구독 가치 3').t('eb', c.eb('구독 가치'))
    .t('title', `${D.cust}에 B2B 삼성 AI 구독이 맞는 세 가지 이유`).img('img2', V.cover),
  pkgSheet(V, c), pay3Sheet(V, c, D), promoSheet(c),
].filter(Boolean);
B.subone = (V, G, T, c) => [sheet('L_SUB_ONE', '구독 한 장 요약', '구독 한 장 요약').t('eb', c.eb())];
const divSub = (key, V, T, D) => {
  if (key === 'pcase') { const n = V.pp.cmatch ? V.pp.nm : V.pp.cfam || '같은 제품군'; return `${n}${josa(n, '을', '를')} 먼저 도입한 고객`; }
  if (key === 'ua') { const g = [...new Set((T.ua || ['prof']).map((k) => UA_GROUP[k]))]; const w = g.join(' · '); return `${w}${ro(w)} 먼저 이해합니다`; }
  if (key === 'tech') return `${V.tech.length}개 솔루션, 키워드 셋으로 보는 ${D.ai}`;
  if (key === 'value') return `${V.sp.length}개 공간을 잇는 이용자 여정 ${V.jr.length}가지`;
  if (key === 'subpkg') return `${V.sub.place} · ${V.sub.items.map((x) => x[0]).join(' · ')}`;
  if (key === 'subsol') return `${V.sub.name} · 케어 포함 · 납부 방법`;
  return TOCS[key].sub || TOCS[key].goal;
};

/* ---------------- 시나리오 조립 ---------------- */
function ctxOf(key, no, D) {
  const name = tocName(key, D.short);
  return { key, no, name, eb: (sub) => `${pad(no)} · ${TOCS[key].eb || name}${sub ? ' · ' + sub : ''}` };
}
/** 역할 이름 속 장 번호를 이 덱의 번호로 — '간지 · 05 도입사례' → '간지 · 04 도입사례' */
const renum = (role, no) => String(role || '').replace(/(^|· |— )\d{2}(?= )/, (m, p) => p + pad(no));
/** 덱 한 벌: 표지 · 목차(숨은 목차) + 목차마다 [간지, 장 …] — 쪽 번호를 매긴 뒤 간지 행 · 표준 장 번호를 맞춘다 */
const CASE_SLOT = { eb: 0, foot: 12, page: 13 }; // L_VS_CASE
const deckName = (T, V, D) => (T.id === 'prod' ? `${V.pp.nm} ${T.deck}서` : `${D.ai} ${T.deck}서`);
function composeDeck(T, V, G, D) {
  const total = T.tocs.length; const foot = `${D.cust} · ${deckName(T, V, D)}`;
  const plan = T.tocs.map((key, i) => {
    const c = ctxOf(key, i + 1, D);
    if (TOCS[key].std && D.st[TOCS[key].std]) return { c, std: D.st[TOCS[key].std].items.filter((x) => x.f !== 'L_VS_TOC') };
    return { c, sheets: B[key](V, G, T, c, D) };
  });
  // 간지 사진 — 표준 목차는 표준 간지 사진, 새 목차는 이 업종 공간 사진 중 덱에서 아직 안 쓴 것
  const used = new Set([D.cover.o.img && D.cover.o.img[0] && D.cover.o.img[0].src]);
  // 표준 목차가 목차 장에 쓰는 사진(표준 목차 장 L_VS_TOC 의 칸)도 미리 넣어 — 새 목차가 같은 사진을 골라 목차 장에 두 번 나오지 않게
  plan.forEach((p, i) => { if (p.std) { const d = p.std.find((x) => isDiv(x.f)); if (d && d.o.img && d.o.img[0]) used.add(d.o.img[0].src); const ti = D.tocImg(T.tocs[i]); if (ti) used.add(ti); } });
  const pool = [V.cover, ...V.sp.map((x) => x.ph)].filter(Boolean);
  // spare: 공간 사진이 다 쓰였을 때 pool[0](표지 사진)으로 되돌아가기 전에 쓰는 사진 — 목차 장에 같은 사진이 두 번 나오지 않게
  const pickPhoto = (pref, spare = []) => { const hit = [...pref, ...pool, ...spare].find((x) => x && !used.has(x)) || pool[0]; used.add(hit); return hit; };
  // 새 목차가 남은 공간 사진보다 많으면 구독 솔루션 제안은 처음부터 패키지 사진 · 구독 품목 대표 이미지를 써서 공간 사진을 다른 목차에 남긴다
  const subSpare = [V.sub && !pool.includes(V.sub.ph) ? V.sub.ph : null, '/assets/subs/kv-grid.webp']; // 패키지 사진이 공간 사진이면(업종 공간 기준 구성) 대표 이미지
  const tight = plan.filter((p) => !p.std).length > new Set(pool.filter((x) => !used.has(x))).size;
  let page = 3; // 1 표지 · 2 목차
  const stages = plan.map((p) => {
    const { c } = p;
    if (p.std) {
      const d = p.std.find((x) => isDiv(x.f)); const off = page - (d ? d.pg : p.std[0].pg);
      const items = p.std.map((x, j) => ({ o: retag(x.o, { no: c.no, total, off, foot0: D.foot, foot, page: page + j }), role: renum(x.role, c.no) }));
      page += items.length;
      return { c, items, photo: D.divImg(TOCS[c.key].std) };
    }
    const divPage = page; page += 1;
    const sheets = p.sheets.map((s) => { const pg = page; page += 1; return { ...s, pg }; });
    const rows = [];
    for (const s of sheets) { const last = rows[rows.length - 1]; if (last && last.label === s.row) last.to = s.pg; else rows.push({ label: s.row, from: s.pg, to: s.pg }); }
    while (rows.length > 6) { const b = rows.pop(); rows[rows.length - 1].to = b.to; }
    const P = V.pp; const sp = (i) => (V.sp[i] ? V.sp[i].ph : null);
    const pref = c.key === 'value' && V.jr[0] ? [sp(V.jr[0].sp[0])] : c.key === 'ua' ? [V.cover] : c.key === 'subsol' ? [] // 구독 솔루션 제안 — 안 쓴 공간 사진, 다 쓰였으면 패키지 사진 · 구독 품목 대표 이미지(spare)
      : c.key === 'vp' ? [sp(P.rep[0]), sp(P.where[0])] : c.key === 'vpd' ? P.where.slice(1).map(sp)
        : c.key === 'pcase' && P.cases[0] ? [P.cases[0].o.img[0] && P.cases[0].o.img[0].src] : c.key === 'pspec' ? P.where.map(sp) : [];
    const photo = c.key === 'subsol' ? pickPhoto(tight ? subSpare : [], subSpare) : pickPhoto(pref);
    const items = [divider({ no: c.no, total, title: c.name, sub: divSub(c.key, V, T, D), rows, photo, page: divPage })];
    for (const s of sheets) {
      if (s.std) {
        const o = retag(s.std.o, { no: c.no, total, off: 0, foot0: D.foot, foot, page: s.pg, rename: s.rename });
        if (s.patch) Object.assign(o.t, s.patch);
        if (s.eb) o.t[0] = s.eb;
        items.push({ o, role: s.role });
      } else if (s.raw) {
        const o = structuredClone(s.raw);
        o.t = { ...o.t, [CASE_SLOT.eb]: c.eb(), [CASE_SLOT.foot]: foot, [CASE_SLOT.page]: 'CONFIDENTIAL · ' + s.pg };
        items.push({ o, role: s.role });
      } else {
        s.t('foot', foot).t('conf', 'CONFIDENTIAL · ' + s.pg);
        items.push({ o: s.o, role: s.role });
      }
    }
    return { c, items, photo };
  });
  // 표지 · 목차 — 표지는 표준 제안서 표지(확장형은 그대로, 나머지는 양식 이름 · 한 줄만 바꿈)
  const cover = structuredClone(D.cover.o);
  const coverSub = T.id === 'prod' ? [...new Set(VPN(V.pp))].join(' · ') : T.sub;
  if (!T.keepCover) cover.t = { ...cover.t, 3: `${D.cust}\n${T.deck}서`, 4: coverSub };
  const idx = sheet('L_TOC_INDEX' + Math.min(8, Math.max(4, total)), '목차 · 목차 ' + total + '개');
  stages.forEach((st, i) => {
    const key = st.c.key; const img = TOCS[key].std ? D.tocImg(key) || st.photo : st.photo;
    idx.t('no' + i, pad(i + 1)).t('nm' + i, st.c.name).img('img' + i, img);
  });
  idx.t('foot', foot).t('conf', 'CONFIDENTIAL · 2');
  return { foot, deck: [{ o: cover, role: '표지' }, { o: idx.o, role: idx.role }], stages };
}

export function tocScenarioId(tid, vid, addons = []) {
  const a = (addons || []).filter((x) => ADDONS[x]);
  return tid === 'std' && !a.length ? STD_ID(vid) : `toc_${tid}${a.map((x) => '+' + x).join('')}__${vid}`;
}
/** 템플릿 × 업종 시나리오 — 표준 제안서는 업종 표준 제안서 그대로, 나머지는 조립해 시나리오 레지스트리(SC · FILLS · FILL_CUSTOMER · STORY)에 올린다.
 *  opts.addons: 더할 목차(['sub'] = 구독 솔루션 제안) — 템플릿에 이미 있거나 같은 유형 목차가 있으면 그 템플릿 그대로.
 *  콘텐츠(loadTocContent)가 먼저 로드돼 있어야 함 */
export function ensureTocScenario(tid, vid, opts = {}) {
  const T0 = TPL[tid]; if (!T0) return null;
  const extra = (opts.addons || []).filter((a) => ADDONS[a] && !(T0.addons || []).includes(a));
  const tocs = extra.length ? withAddons(T0.tocs, extra) : T0.tocs;
  if (extra.length && tocs.length === T0.tocs.length) return ensureTocScenario(tid, vid); // 더할 자리가 없음(이미 구독 목차)
  const named = extra.length && TOC_TEMPLATES.find((t) => t.base === tid && (t.addons || []).join() === [...(T0.addons || []), ...extra].join());
  if (named) return ensureTocScenario(named.id, vid); // 같은 구성의 템플릿이 있으면 그 덱(예: 표준 제안서 + 구독 → 표준 제안서 + 구독 솔루션)
  if (tid === 'std' && !extra.length) return SC[STD_ID(vid)] || null;
  const id = tocScenarioId(tid, vid, extra);
  if (SC[id]) return SC[id];
  const T = extra.length ? { ...T0, tocs, addons: [...(T0.addons || []), ...extra], sub: `${T0.sub} + 구독 솔루션 제안` } : T0;
  const C = CONTENT; const V = C && C.v[vid]; const D = stdDeck(vid);
  if (!C || !V || !D) return null;
  const G = C.g[V.g];
  const { deck, stages } = composeDeck(T, V, G, D);
  const flow = []; const fills = []; const parts = {};
  const push = (key, name, goal, list, extra) => { flow.push({ key, name, goal, slides: list.map((x) => ({ f: x.o.f, role: x.role })), ...extra }); list.forEach((x) => fills.push(x.o)); };
  push('open', '표지', '제안 전체를 먼저 보여 준다', deck, { deck: true });
  const STAGE_KEY = { overview: 'context', ua: 'context', summary: 'context', needs: 'value', tech: 'value', space: 'space', value: 'space', sol: 'build', bom: 'build', spec: 'build', rfp: 'value', effect: 'proof', cost: 'plan', pilot: 'plan', plan: 'plan', case: 'proof', why: 'close',
    vp: 'value', vpd: 'value', pcase: 'proof', pspec: 'build', subs: 'value', subpkg: 'build', subcare: 'build', subterm: 'plan', subone: 'context', subsol: 'plan' };
  stages.forEach(({ c, items }) => {
    const name = `${pad(c.no)} ${c.name}`;
    push(STAGE_KEY[c.key] || 'value', name, TOCS[c.key].goal, items);
    parts[name] = { type: TOCS[c.key].type, items: items.map((x) => x.role) };
  });
  const s0 = D.s; const names = stages.map((x) => x.c.name);
  const needs = D.needs.map((n) => n.v);
  const P = V.pp; const prod = tid === 'prod'; const vpt = P.vps.map((x) => x.t); const sub = T.kind === 'subs';
  const withSub = (T.addons || []).includes('sub') && T.tocs.includes('subsol');
  const subLine = withSub ? ` 고객 요구에 구독 · 렌탈 · 월 납부(초기 비용 · 관리 부담)가 있어, 같은 제품을 B2B 삼성 AI 구독(${V.sub.name})으로 들이는 길을 '구독 솔루션 제안'으로 함께 보여 줍니다.` : '';
  const s = {
    ...s0, id, std: false, toc: tid, tocV: vid, req: T.req, strategy: T.strategy, ending: T.ending,
    title: `${D.cust} · ${deckName(T, V, D)}${withSub ? ' · 구독 솔루션 포함' : ''}`, short: names.join(' → '),
    situation: prod ? `${D.cust}에 ${P.nm}${josa(P.nm, '과', '와')} 함께 쓰는 솔루션을 제안하는 자리입니다. 가치 셋을 먼저 보여 주고 가치마다 장면 · 사례 · 사양으로 뒷받침합니다.`
      : sub ? `${D.cust}에 제품을 일시불 대신 B2B 삼성 AI 구독으로 도입하자고 제안하는 자리입니다. 초기 비용 · 시설 관리 부담을 먼저 짚고, ${V.sub.name}(${V.sub.items.map((x) => x[0]).join(' · ')}) · 케어 · 조건 · 납부 방법으로 답합니다.`
        : `${D.cust}에 ${T.name} 양식으로 제안하는 자리입니다. ${V.pains.map((p) => p[0]).join(' · ')}을(를) 함께 짚고, ${names.slice(1, -1).join(' · ')} 순서로 답합니다.${subLine}`,
    thesis: prod ? `${vpt.join(' · ')} — ${[...new Set(VPN(P))].join(' · ')}` : sub ? `초기 비용은 낮추고, 관리는 삼성이 — ${V.sub.name}` : `${needs.join(' · ')} — ${T.sub}`, logic: names, tone: '한 줄 메시지 · 사진과 아이콘 중심',
    messages: prod ? [vpt.join(' · '), P.nm] : sub ? [T.sub, '월 분할 납부 · 최대 6년 무상 AS · B2B 블루패스', `${V.sub.name} — ${V.sub.title}`]
      : [T.sub, needs.join(' · '), ...(s0.messages || []).slice(2, withSub ? 3 : undefined), ...(withSub ? [`구독 솔루션 — ${V.sub.name} · 월 구독료 + 예산에 맞춘 납부 협의안`] : [])],
    flow, ask: G.ask || s0.ask, kpis: G.kp[1].map((x) => x[0]), fit: T.desc, avoid: s0.avoid || '',
    minutes: Math.max(10, Math.round((fills.length * 1.2) / 5) * 5),
  };
  delete s.preview;
  if (T.addons) s.addons = [...T.addons];
  SC[id] = s; FILLS[id] = fills; FILL_CUSTOMER[id] = D.cust;
  const st0 = STORY[s0.id] || {};
  STORY[id] = { keymen: st0.keymen || [], note: T.desc, parts };
  return s;
}
/** 요구사항에 따라 조립 — 고객 요구 문장에 구독 요구가 있으면 그 템플릿에 '구독 솔루션 제안'만 더한 덱, 없으면 템플릿 그대로 */
export function ensureTocScenarioFor(tid, vid, requirementText) { return ensureTocScenario(tid, vid, { addons: addonsForRequirement(requirementText) }); }
/** 업종 목록 (콘텐츠 순서) — [{ id, nm, g, gn, cust, ai, short, cover, nSp }] */
export function tocVerticals() {
  const C = CONTENT; if (!C) return [];
  return C.order.map((id) => { const v = C.v[id]; const D = stdDeck(id); return { id, nm: vName(v), full: v.nm, g: v.g, gn: v.gn, cust: D ? D.cust : vName(v), ai: D ? D.ai : '', short: D ? D.short : '', cover: v.cover, seg: v.seg, nSp: v.sp.length, prod: v.pp ? v.pp.nm : '' }; });
}
/** 당사의 이해 장 모음 — 한 업종의 고객사 분석 · 트렌드 · 경쟁 비교 장 전부 (데이터 타입별로 미리 만든 장) */
export function tocUaSheets(vid) {
  const C = CONTENT; const V = C && C.v[vid]; const D = stdDeck(vid); if (!V || !D) return [];
  const G = C.g[V.g]; const c = ctxOf('ua', 1, D); const foot = `${D.cust} · ${D.ai} ${TPL.stdx.deck}서`;
  return Object.keys(UA).map((k) => { const s = UA[k](V, G, c, D).t('foot', foot); return { kind: k, label: UA_KINDS[k], f: s.o.f, ov: { t: s.o.t, img: s.o.img } }; });
}
