// 목차 템플릿 — 목차(= Storyboard 버블) 흐름이 정해진 제안서 양식과, 업종마다 그 양식으로 조립한 시나리오.
// 표준 제안서는 업종별 표준 제안서 44종(bs_std_<업종>, standard_vertical_scenarios.json)을 그대로 쓴다.
// 다른 템플릿도 표준 제안서와 이름이 같은 목차(Overview · AI {업종} · 공간별 제안 · {업종} 솔루션 · 도입사례 · Why Samsung)는
// 그 업종 표준 제안서의 장(L_VS_*)을 그대로 옮기고 장 번호 · 간지 쪽 · 덱 이름만 바꾼다.
// 표준에 없는 목차(당사의 이해 · 핵심 기술 · 공간별 가치 제안 · 실행 계획 …)는 L_TOC_* 장이고, 모든 목차는 표준과 같은 간지(L_VS_DIV_R*)로 연다.
// 같은 템플릿이면 장(레이아웃)은 같고, 업종마다 내용과 같은 장을 쓰는 횟수만 다르다(공간 수 · 여정 수 · 솔루션 수).
// 추천 구성(TOC_TEMPLATES)은 관리자 「전체 파트」 목록에 있는 파트만 쓴다(사용자 지시 2026-11-16) — Overview · 당사의 이해 · AI {업종}(3 Value Props) · 공간별 제안 ·
//   공간별 가치 제안 · {업종} 솔루션 · 도입사례 · Why Samsung · 유관사례 · Spec · 구독 솔루션.
//   Spec 은 모든 구성의 맨 끝에 고정으로 들어간다(사용자 지시 2026-11-16 — 표준 제안서도). 그래서 표준 제안서도 업종 표준 제안서(bs_std_<업종>)를 그대로 쓰지 않고
//   그 장을 옮겨 조립한다(표지는 그대로 · keepCover). 업종 표준 제안서 44종은 샘플 시나리오로 그대로 남는다.
//   목록에서 뺀 목차(제안 요약 · 기대 효과 · 비용 · 구매 …)와 그 목차로만 서던 구성(투자 효과형 · 경쟁 비교형 · 요구사항 대응형)은 은퇴 — 이미 만든 제안서가 다시 열릴 때만 쓴다(RETIRED_TEMPLATES · TPL).
// 내용: toc_content.json (build/toc/build_content.py — 업종별 과제 · 여정 · 핵심 기술 · 사양 · 구성, 업종 묶음별 당사의 이해 데이터)
// 장: toc_layouts.js (L_TOC_*) — 칸 이름 → 번호는 TOC_SLOTS. 간지 칸 번호는 L_VS_DIV_R<n> 규칙(아래 divider).
import { TOC_SLOTS } from './toc_layouts.js';
import { SUBS_SLOTS, SUBS_HTML } from './subs_layouts.js';
import { SC } from './scenarios.js';
import { FILLS, FILL_CUSTOMER } from './scenario_fills.js';
import { STORY } from './scenario_story.js';
import { subscriptionNeed, addonIndex } from '../proposals/addons.js';
import { applyCustomPresets, customTemplateHint } from './custom_compositions.js';
import { scenarioPlan, SCN } from './scenario_plan.js';
import FEATURE_LABEL from './feature_labels.json' with { type: 'json' };
import { SERVICE_BRANCHES } from './service_branches.js';

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
  // 고객/공간 시나리오(관리자 목록 이름, 2026-11-17 다시 짬) — 조감도 → 활용 맵(솔루션 · 서비스 × 공간) → 공간마다 한 장(그 공간의 제품 + 그 공간에서 쓰는 솔루션 · 서비스). 장 고르기: scenario_plan.js
  value: { name: '공간별 가치 제안', type: 'scenario', goal: '공간마다 놓이는 제품과 그 공간에서 쓰는 솔루션 · 서비스를 보여 주고, 여러 공간이 함께 쓰는 솔루션 · 서비스를 활용 맵으로 묶는다' },
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
  // 구독 솔루션 — 구독을 한 파트로(사용자 지시 2026-11-16): 고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제. 케어 2 · 구독 조건 · 결제의 숫자는 00(작성자가 직접 입력).
  //   구독 구성(구독 제안서 · 구독 전환 제안서)의 파트이자, 요구사항에 따라 다른 구성에 더하는 목차(add-on)다. 아래 구독 목차 여섯은 이 파트로 합쳐져 은퇴(이미 만든 제안서에서만).
  // 서비스(관리자 목록 이름 '서비스 제안') — 솔루션 하위에 있던 서비스 두 가지(삼성케어플러스 SAC · 삼성케어플러스 비즈니스)를 내용이 고정된 장으로(사용자 지시 2026-11-16).
  //   2026-11-17: 구독 상품 제안도 이 파트의 한 갈래 — 고른 서비스에 따라 갈래가 나뉜다(B.svc · SVC_BRANCHES): 케어 서비스 → 삼성케어플러스 SAC · 비즈니스 장, 구독 → 구독 흐름 8장.
  //   유형은 솔루션(파트 유형 표를 늘리지 않는다). 이 파트가 있는 구성에서는 {업종} 솔루션 파트에서 서비스 장을 뺀다(composeDeck · solWithoutServices).
  svc: { name: '서비스', type: 'solution', goal: '고른 서비스에 따라 — 삼성케어플러스 SAC · 비즈니스(고정된 내용)와 B2B 삼성 AI 구독(고민 → 효과 → 비교 → 제품 묶음 → 케어 → 구독 조건 · 결제)을 보여 준다', sub: '설치 뒤까지 삼성이 챙기는 서비스' },
  subx: { name: '구독 솔루션', type: 'subscription', addon: 'sub', goal: '현장의 고민에서 출발해 구독의 효과 · 일시불과의 비교 · 제품 묶음 · 케어 · 구독 조건과 결제까지 한 파트로 보여 준다', sub: '초기 비용은 낮추고, 관리는 삼성이' },
  // (은퇴) 요구사항에 따라 다른 구성에 더하던 목차 — 구독 가치 · 업종 패키지 · 납부 방법(+ 기간 한정 혜택)
  subsol: { name: '구독 솔루션 제안', type: 'subscription', goal: '구독 · 렌탈 · 월 납부 요구에 답해 이 고객의 구독 가치 · 업종 패키지 · 납부 방법을 제안한다', sub: '같은 제품을 구독으로 — 가치 · 패키지 · 납부 방법' },
};
/* ---------------- 요구사항에 따라 더하는 목차 (add-on) ---------------- */
// 고객 요구에 구독 · 렌탈 · 월 납부(또는 초기 비용 · 관리 부담 둘 이상)가 있으면 어느 템플릿에든 '구독 솔루션' 파트만 더한다.
// 자리: 마지막 '비용 · 구매' 바로 뒤, 없으면 첫 실행(파일럿 · 실행 계획) · 사례 · Why Samsung 앞(구독 레지스트리 addon.place). Spec 뒤에는 오지 않는다(specLast).
// 이미 구독 목차가 있는 구성(구독 제안서 · 구독 전환 제안서)에는 더하지 않는다.
export const ADDONS = { sub: { toc: 'subx', label: '구독 솔루션' } };
/** Spec(제품 사양) 파트는 구성의 맨 마지막에만 온다 — 뒤에 다른 목차가 있으면 맨 뒤로 옮긴다 */
export const SPEC_TOC = 'pspec';
export function specLast(tocs) {
  const i = tocs.indexOf(SPEC_TOC);
  return i < 0 || i === tocs.length - 1 ? tocs : [...tocs.slice(0, i), ...tocs.slice(i + 1), SPEC_TOC];
}
const addonRules = () => (CONTENT && CONTENT.subs && CONTENT.subs.addon) || null;
/** 목차 키 목록에 add-on 목차를 알맞은 자리에 — 같은 유형 목차가 이미 있으면 그대로 */
export function withAddons(tocs, addons) {
  const out = [...tocs];
  for (const a of addons || []) {
    // 서비스 제안(svc)이 있으면 구독은 그 파트의 갈래로, 고객/공간 시나리오(value)가 있으면 공간마다 쓰는 서비스 줄로 들어간다(2026-11-17) — 구독 솔루션 파트를 따로 더하지 않는다
    const A = ADDONS[a]; if (!A || out.includes(A.toc) || out.some((k) => TOCS[k].type === TOCS[A.toc].type) || (a === 'sub' && (out.includes('svc') || out.includes('value')))) continue;
    out.splice(addonIndex(out.map((k) => ({ type: TOCS[k].type })), addonRules()), 0, A.toc);
  }
  return specLast(out);
}
/** 고객 요구 문장 → 더할 목차 — 구독 요구가 있으면 ['sub'] (판정은 구독 레지스트리 addon 규칙, 서버와 같음) */
export function addonsForRequirement(text) { return subscriptionNeed(text, addonRules()).need ? ['sub'] : []; }
const VX_STD = ['bs_v_ai_apartment_1', 'bs_v_ai_office_1', 'bs_v_ai_store_1', 'bs_v_entertainment_1', 'bs_v_knowledge_industry_center_1', 'bs_v_senior_town_1', 'bs_v_smart_academy_1', 'bs_v_smart_barracks_1', 'bs_v_smart_factory_1', 'bs_v_smart_finance_1', 'bs_v_smart_home_1', 'bs_v_smart_hospital_1', 'bs_v_smart_hotel_1', 'bs_v_smart_network_1', 'bs_v_smart_office_1', 'bs_v_smart_public_1', 'bs_v_smart_retail_1', 'bs_v_smart_school_1', 'bs_v_smart_transportation_1', 'bs_v_smart_university_1'];
const VX_PAIN = VX_STD.map((x) => x.replace(/_1$/, '_2'));

/* ---------------- 템플릿 ---------------- */
// ua: 당사의 이해에 고르는 장 — 고객사 분석(prof · pain) · 업종 트렌드(line · share · stat · key) · 경쟁 비교(matrix 점수표 · win 차별점 3 · map 포지셔닝)
export const TOC_TEMPLATES = [
  // ── 기본 제안 · 상세 제안 (사용자 지시 2026-11-16) — 추천에 쓰는 구성은 이 둘. 아래 구성들은 운영 값으로 '추천에 사용'을 꺼 두었다(app/data/runtime/layout_presets.json).
  //   when: 추천 모델에게 주는 '맞는 상황' 기본 문구(관리자가 고치면 그 문구)
  { id: 'basic', name: '기본 제안', deck: '기본 제안', hue: 'blue', req: 'std', strategy: 'value', ending: 'workshop',
    // 2026-11-17: 구독 상품 제안은 서비스 제안의 갈래로 들어갔다(구독을 고르면 서비스 제안 안에 구독 흐름)
    desc: '개요 → 가치 제안 → 제품 제안 → 솔루션 제안 → 서비스 제안(케어 · 구독) → 유관 사례 → 제품 스펙 순서의 기본 양식', tocs: ['overview', 'needs', 'space', 'sol', 'svc', 'case', 'pspec'],
    sub: '가치에서 제품 스펙까지 한 흐름으로', when: '처음 만나는 고객 · 폭넓은 소개 — 가치 · 제품 · 솔루션 · 서비스(케어 · 구독) · 사례 · 제품 스펙을 한 흐름으로', related: [] },
  { id: 'detail', name: '상세 제안', deck: '상세 제안', hue: 'violet', req: 'std', strategy: 'value', ending: 'workshop',
    // 2026-11-17(사용자 지시): 상세 제안에는 제품 제안 · 솔루션 제안 · 서비스 제안 대신 고객/공간 시나리오 — 공간마다 제품이 놓이고 솔루션 · 서비스는 여러 공간이 함께 쓴다
    desc: '시장 분석과 고객/공간 시나리오로 짚는 양식 — 개요 → 시장 분석 → 가치 제안 → 고객/공간 시나리오(공간마다 제품 · 솔루션 · 서비스) → 유관 사례 → Why Samsung → 제품 스펙',
    tocs: ['overview', 'ua', 'needs', 'value', 'case', 'why', 'pspec'], ua: ['line', 'share', 'stat', 'key'],
    sub: '시장에서 출발해 제품 스펙까지', when: '시장 근거와 삼성을 골라야 할 이유까지 필요한 제안 — 의사결정자 보고 · 경쟁 · 투자 검토', related: [] },
  { id: 'std', name: '표준 제안서', deck: '표준 제안', hue: 'slate', req: 'std', strategy: 'value', ending: 'workshop',
    keepCover: true, desc: '고객 니즈별 AI 제안 · 공간별 대표 제품 · 솔루션을 표준 순서로 보여 주고 제품 사양으로 닫는 기본 양식', tocs: ['overview', 'needs', 'space', 'sol', 'case', 'why', 'pspec'],
    sub: '업종 표준 구성 그대로', related: [] },
  { id: 'stdx', name: '표준 제안서 확장형', deck: '표준 제안', hue: 'blue', req: 'std', strategy: 'value', ending: 'workshop', keepCover: true,
    desc: '표준 제안서의 Overview 자리에 당사의 이해(고객사 · 트렌드 · 경쟁)를 넣은 양식', tocs: ['ua', 'needs', 'space', 'sol', 'case', 'why', 'pspec'], ua: ['prof', 'line', 'key', 'matrix'],
    sub: '고객을 먼저 이해하고, 공간마다 답합니다', related: ['bs_account_inspire', 'bs_account_episode'] },
  // ── 아래 구성은 「전체 파트」 목록의 파트만으로 다시 짰다(사용자 지시 2026-11-16). 표준 제안서 · 확장형은 그대로.
  { id: 'space', name: '공간 가치형 제안서', deck: '공간 가치 제안', hue: 'teal', req: 'std', strategy: 'space', ending: 'workshop',
    desc: '공간을 이용자 여정으로 엮어 장면마다 쓰이는 솔루션 기능을 보여 주고, 이어서 그 솔루션을 하나씩 풀어 주는 양식', tocs: ['overview', 'value', 'sol', 'case', 'why', 'pspec'],
    sub: '공간마다 이어지는 이용자의 하루', related: [] },
  { id: 'spacex', name: '공간 가치형 제안서 확장형', deck: '공간 가치 제안', hue: 'teal', req: 'std', strategy: 'space', ending: 'workshop',
    desc: '공간 가치형 제안서의 Overview 자리에 당사의 이해를 넣은 양식', tocs: ['ua', 'value', 'sol', 'case', 'why', 'pspec'], ua: ['pain', 'share', 'key', 'map'],
    sub: '업종의 흐름에서 출발한 공간 경험', related: [] },
  { id: 'pain', name: '과제 해결형 제안서', deck: '과제 해결 제안', hue: 'violet', req: 'renew', strategy: 'pain', ending: 'pilot',
    desc: '고객 과제에서 출발해 세 가지 핵심 제안으로 답하고, 그 제안이 공간에서 이어지는 장면으로 보여 주는 양식', tocs: ['ua', 'needs', 'value', 'case', 'why', 'pspec'], ua: ['pain', 'prof'],
    sub: '현장의 과제에서 출발한 해법', related: [] },
  { id: 'build', name: '구축형 제안서', deck: '구축 제안', hue: 'teal', req: 'new', strategy: 'space', ending: 'scope',
    desc: '공간마다 놓일 대표 제품과 함께 쓰는 솔루션으로 구축 범위를 보여 주고, 제품 사양으로 닫는 양식', tocs: ['space', 'sol', 'case', 'why', 'pspec'],
    sub: '공간별 구성부터 제품 사양까지', related: [] },
  // 제품 제안서 = 표준 제안서에서 Overview · {업종} 솔루션 · 도입사례만 뺀 것(사용자 지시 2026-11-16). 제품이 하나 이상이고 솔루션이 없을 때 쓰던 첫 칸(2026-11-16부터 Storyboard 구성 생성은 켜 둔 관리자 구성에서 DSS 파트만 뺀다 — services/layout-compose.js generatedTemplates).
  { id: 'prod', name: '제품 제안서', deck: '제품 제안', hue: 'blue', req: 'new', strategy: 'value', ending: 'pilot',
    desc: '솔루션 없이 제품만 제안할 때 — 표준 제안서에서 Overview · 업종 솔루션 · 도입사례를 뺀 양식(세 가지 핵심 제안 · 공간별 제안 · Why Samsung · 제품 사양)', tocs: ['needs', 'space', 'why', 'pspec'],
    sub: '솔루션 없이, 제품으로 시작하는 변화', related: [] },
  { id: 'subs', name: '구독 제안서', deck: '구독 제안', hue: 'green', req: 'subs', strategy: 'roi', ending: 'budget', kind: 'subs',
    desc: '초기 비용 부담 없이 B2B 삼성 AI 구독으로 도입하자는 양식 — 구독 솔루션(고민 · 효과 · 비교 · 제품 묶음 · 케어 · 조건 · 결제)을 먼저 보여 주고 공간별 제안 · 도입사례로 잇는 양식',
    tocs: ['overview', 'subx', 'space', 'case', 'why', 'pspec'], sub: '초기 비용은 낮추고, 관리는 삼성이', related: [] },
  // 구독 솔루션이 포함된 구성 — 다른 양식에 '구독 솔루션' 파트만 더한 것(base + addons). 요구사항에 따라 어느 양식에든 같은 방식으로 더한다.
  { id: 'stdsub', base: 'std', addons: ['sub'], name: '표준 제안서 + 구독 솔루션', deck: '표준 제안', hue: 'green', req: 'subs', strategy: 'value', ending: 'budget',
    desc: '표준 제안서 순서는 그대로 두고 도입사례 앞에 구독 솔루션 파트를 더한 양식 — 고객이 구독 · 렌탈 · 월 납부를 원하거나 초기 비용 · 관리 부담을 말할 때',
    tocs: withAddons(['overview', 'needs', 'space', 'sol', 'case', 'why', 'pspec'], ['sub']), sub: '업종 표준 구성 + 구독 솔루션', related: [] },
];
// 은퇴한 구성 — 목록에서 뺀 목차(제안 요약 · 기대 효과 · 비용 · 구매 · 파일럿 · 확산 · 요구사항 대응 · 제품 사양 · 구성 · 수량 · 실행 계획 · 구독 한 장 요약)가 뼈대여서 지금 파트로는 나타낼 수 없다.
//   구독 전환 제안서는 한 장 요약이 빠지면 구독 솔루션 + Why Samsung 두 파트뿐이라(목차 장은 4칸부터) 구독 제안서 · 요구사항에 따라 더하는 구독 솔루션 파트로 갈음한다.
//   추천 · 전체 구성 보기 · 목차 템플릿 목록 · 관리자 화면에는 나오지 않는다(TOC_TEMPLATES 에 없다). 이 구성으로 이미 만든 제안서가 구성 이름 · 견본 장을 찾을 때만 쓴다(TPL).
export const RETIRED_TEMPLATES = [
  { id: 'roi', name: '투자 효과형 제안서', deck: '투자 효과 제안', hue: 'green', req: 'ops', strategy: 'roi', ending: 'pilot',
    desc: '현황 숫자 → 핵심 기술 → 기대 효과 → 비용 · 파일럿으로 결정을 쉽게 하는 양식', tocs: ['summary', 'ua', 'tech', 'effect', 'cost', 'pilot', 'why'], ua: ['prof', 'stat'],
    sub: '숫자로 확인하는 도입 효과', related: ['bs01', 'bs13', 'bs16', 'bs17', 'bs19', 'bs20'] },
  { id: 'compete', name: '경쟁 비교형 제안서', deck: '경쟁 비교 제안', hue: 'amber', req: 'compete', strategy: 'compete', ending: 'shortlist',
    desc: '같은 기준으로 공급사를 비교하고 사양 · 비용으로 선택을 굳히는 양식', tocs: ['summary', 'ua', 'needs', 'spec', 'cost', 'case', 'why'], ua: ['matrix', 'win', 'map'],
    sub: '같은 기준으로 비교한 선택', related: ['bs10', 'bs12'] },
  { id: 'rfp', name: '요구사항 대응형 제안서', deck: '요구사항 대응 제안', hue: 'blue', req: 'new', strategy: 'rfp', ending: 'shortlist',
    desc: '평가 항목 순서대로 대응 · 사양 · 수량 · 일정을 빠짐없이 답하는 양식', tocs: ['ua', 'rfp', 'spec', 'bom', 'plan', 'case', 'why'], ua: ['prof', 'key'],
    sub: '요구사항마다 빠짐없이 답합니다', related: ['bs11'] },
  { id: 'roisub', base: 'roi', addons: ['sub'], name: '투자 효과형 + 구독 솔루션', deck: '투자 효과 제안', hue: 'green', req: 'ops', strategy: 'roi', ending: 'budget',
    desc: '기대 효과 · 비용(5년 총소유비용) 다음에 같은 제품을 구독으로 들이는 길(구독 가치 · 업종 패키지 · 납부 방법)을 더한 양식 — 일시불과 구독을 함께 저울질하는 고객',
    tocs: ['summary', 'ua', 'tech', 'effect', 'cost', 'subsol', 'pilot', 'why'], ua: ['prof', 'stat'], sub: '숫자로 확인하는 도입 효과 + 구독 솔루션', related: [] },
  { id: 'subsl', name: '구독 전환 제안서', deck: '구독 전환 제안', hue: 'green', req: 'subs', strategy: 'roi', ending: 'budget', kind: 'subs',
    desc: '제품을 정한 고객에게 같은 제품을 구독으로 들이자고 짧게 제안하는 양식 — 한 장 요약 · 업종 패키지 · 조건 · 결제',
    tocs: ['subone', 'subpkg', 'subterm', 'why'], sub: '같은 제품, 구독으로 가볍게', related: ['bs_sub_fn_bank'] },
].map((t) => ({ ...t, retired: true, off: true, related: [] }));
/** 구성 id → 구성 — 은퇴한 구성도 들어 있다(이미 만든 제안서용). 목록은 TOC_TEMPLATES 를 쓴다 */
export const TPL = Object.fromEntries([...TOC_TEMPLATES, ...RETIRED_TEMPLATES].map((t) => [t.id, t]));
// 다시 짠 구성의 옛 목차 — 예전에 그 구성으로 만든 제안서의 목차(agent.toc)가 지금 구성에 없으면 견본 장을 자리(ti)로 찾지 않는다(services/layout-compose.js)
export const tocInTemplate = (tid, key) => !!(TPL[tid] && key && TPL[tid].tocs.includes(key));
// 구성 규칙 — Spec 은 맨 마지막에만(모듈을 읽을 때 한 번 확인한다: 어기는 구성을 올리면 바로 드러나게)
//   파트는 4–10개(목차 장 L_TOC_INDEX4–10 — 3개 이하면 빈 칸이 남고, 11개부터는 목차 장에 다 실리지 않는다)
//   모든 구성의 끝은 Spec(고정) — 사용자 지시 2026-11-16 "모든 템플릿에 spec 파트는 고정으로 끝에 넣어"
for (const t of TOC_TEMPLATES) {
  if (specLast(t.tocs) !== t.tocs) throw new Error(`목차 템플릿 ${t.id}: Spec 은 구성의 맨 마지막에만 올 수 있습니다 — ${t.tocs.join(' → ')}`);
  if (t.tocs[t.tocs.length - 1] !== SPEC_TOC) throw new Error(`목차 템플릿 ${t.id}: 모든 구성은 Spec 으로 끝납니다 — ${t.tocs.join(' → ')}`);
  if (t.tocs.length < 4) throw new Error(`목차 템플릿 ${t.id}: 파트가 4개보다 적습니다 — ${t.tocs.join(' → ')}`);
  if (t.tocs.length > 10) throw new Error(`목차 템플릿 ${t.id}: 파트가 10개보다 많습니다(목차 장이 10칸까지) — ${t.tocs.join(' → ')}`);
}

/* ---------------- 운영 값 (관리자 「레이아웃 구성 관리」) ---------------- */
// 서버에 저장한 값(app/api/layout_presets.py → /api/bootstrap 의 layout_presets)을 템플릿 위에 덮는다. 구조(tocs · 장)는 바꾸지 않는다.
//   { rev, fixed, order: [id …], items: { id: { enabled, name, desc, hint, related } } }
//   enabled:false → t.off (Storyboard 추천 · 전체 구성 · 목차 템플릿 목록에서 빠진다. 이미 그 구성으로 만든 제안서는 그대로 — TPL 에는 남는다)
//   hint → 추천 모델에게 주는 '맞는 상황' 문구(없으면 req · strategy 로 만든 기본 문구) · fixed → 추천 첫 칸(기본 구성)
// 다른 구성에 add-on 만 더한 변형(base)은 요구사항에 따라 자동으로 쓰이므로 끄거나 순서를 바꾸지 않는다(글 · 샘플만 바꾼다).
const REQ_HINT = { std: '업종 표준 소개 · 폭넓은 제안', renew: '기존 설비 교체 · 현장 과제 해결', new: '신규 구축 · 범위 확정', ops: '운영 효율 · 투자 효과(ROI) 입증', compete: '경쟁사 비교 · 공급사 선정', subs: '구독 · 렌탈 · 월 납부 · 초기 비용 부담' };
const STRATEGY_HINT = { value: '가치 제안', space: '공간 · 동선 중심', pain: '과제 해결', roi: '숫자 · 효과', compete: '비교 우위', rfp: '평가 항목 대응' };
/** 추천 모델에게 주는 '맞는 상황' — 코드 기본값(req · strategy) */
export const defaultTemplateHint = (t) => (t.custom ? customTemplateHint(t) : t.when || [REQ_HINT[t.req], STRATEGY_HINT[t.strategy]].filter(Boolean).join(' · '));
/** 추천 모델에게 주는 '맞는 상황' — 관리자가 쓴 문구가 있으면 그 문구 */
export const templateHint = (t) => t.hint || defaultTemplateHint(t);
const PRESET_DEFAULTS = TOC_TEMPLATES.map((t, index) => ({ t, index, name: t.name, desc: t.desc, related: t.related }));
const presetText = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
let PRESET = { rev: 0, fixed: 'std' };
/** 기본 구성으로 쓸 수 있는가 — 켜져 있고, add-on 변형 · 제품 제안서(제품이 있고 솔루션이 없을 때만 첫 칸)가 아니다 */
export const canBeFixedTemplate = (t) => !!t && !t.base && !t.off && t.id !== 'prod';
/** 운영 값을 템플릿에 덮는다(다시 부르면 코드 기본값에서 새로 덮는다). → { rev, fixed } */
export function applyTocPresets(presets) {
  const P = presets && typeof presets === 'object' ? presets : {};
  const items = P.items && typeof P.items === 'object' ? P.items : {};
  for (const d of PRESET_DEFAULTS) {
    const { t } = d; const o = (items[t.id] && typeof items[t.id] === 'object' && items[t.id]) || {};
    t.name = presetText(o.name) || d.name; t.desc = presetText(o.desc) || d.desc;
    t.related = Array.isArray(o.related) ? o.related.filter((x) => typeof x === 'string') : d.related;
    if (presetText(o.hint)) t.hint = presetText(o.hint); else delete t.hint;
    if (!t.base && o.enabled === false) t.off = true; else delete t.off;
  }
  // 다른 구성에 add-on 만 더한 변형은 따로 끄지 않고 그 구성을 따른다 — 그 구성이 꺼지면 변형도 목록에서 빠진다(2026-11-16: 이전 구성을 모두 끄자 변형만 남았다)
  for (const { t } of PRESET_DEFAULTS) if (t.base && TPL[t.base] && TPL[t.base].off) t.off = true;
  // 직접 만든 파트 · 구성(관리자 「구성 추가하기」 — custom_compositions.js) — 파트는 TOCS 에, 구성은 TPL 에 올리고 코드 구성 뒤(순서를 정했으면 그 자리)에 놓는다
  const custom = applyCustomPresets(P, { TOCS, TPL, SC, FILLS, STORY, FILL_CUSTOMER });
  for (const { t } of custom) { const o = items[t.id]; if (o && typeof o === 'object' && o.enabled === false) t.off = true; else delete t.off; }
  const rank = new Map((Array.isArray(P.order) ? P.order : []).map((id, i) => [id, i]));
  const key = (d) => (d.t.base ? 2e6 + d.index : rank.has(d.t.id) ? rank.get(d.t.id) : 1e6 + d.index);
  TOC_TEMPLATES.splice(0, TOC_TEMPLATES.length, ...[...PRESET_DEFAULTS, ...custom].sort((a, b) => key(a) - key(b)).map((d) => d.t));
  // 기본 구성 — 정한 구성이 없거나 쓸 수 없으면 표준 제안서, 그것도 꺼져 있으면 켜진 첫 구성. 하나도 없으면 표준 제안서를 다시 켠다.
  const fixed = [TPL[P.fixed], TPL.std, ...TOC_TEMPLATES].find(canBeFixedTemplate) || TPL.std;
  delete fixed.off;
  PRESET = { rev: Number.isInteger(P.rev) && P.rev > 0 ? P.rev : 0, fixed: fixed.id };
  return PRESET;
}
/** 지금 적용된 운영 값 — { rev, fixed } */
export const tocPresetState = () => PRESET;
/** 코드에 적힌 기본값(순서 · 이름 · 설명 · 연결 샘플) — 관리자 화면이 바꾼 값과 견준다 */
export const tocTemplateDefaults = () => PRESET_DEFAULTS.map((d) => ({ id: d.t.id, index: d.index, name: d.name, desc: d.desc, related: d.related }));
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
/** 선 아이콘 + 밑줄(배경 없음 — 공간별 시나리오 기능 칸, build/toc/icons/make_line_icons.mjs) */
const LICO = (fid, on = true) => (fid ? `/assets/toc/icons/${fid}.line-${on ? 'on' : 'off'}.png` : BLANK);
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
/* 고객/공간 시나리오 (목록 이름 · 사용자 지시 2026-11-17) — 조감도 → 활용 맵 → 공간별 시나리오(공간 3곳씩 한 장).
   2차 지시(같은 날): 공간 3곳마다 한 장 — 공간 사진에 그 공간 제품을 겹쳐 보이고 · 세 공간을 잇는 통합 시나리오 · 아래 왼쪽 솔루션 · 오른쪽 서비스를 고정으로 두고
   이 장의 공간에서 쓰는 기능만 켠다(on/off). 한 공간만 쓰는 장은 없다(3곳씩 나누고 한 곳만 남지 않게 — 4 → 2 + 2).
   시트는 공간 · 솔루션 수로 고른다(scenario_plan.js). 예시 자료는 업종 공간 자료(toc_content.json 공간마다 pr · us(기능 포함) · ss, 이름 표 sx, 업종 기능 fx).
   이용자 여정 장(L_TOC_JOURNEY*)은 이 파트에서 쓰지 않는다 — 공간별 시나리오가 같은 공간 사진을 쓴다(한 제안서에 같은 사진 한 번). journeySheets 는 남겨 둔다. */
function journeySheets(V, c) {
  return V.jr.map((j) => {
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
    return s;
  });
}
/** 업종 예시 자료 → 시나리오 공간 [{ name, photo, short, products: [{ name, cut, line }], uses: [{ id, scene, features }] }] */
const scnSpaces = (V) => V.sp.map((s) => ({ name: s.n, photo: s.ph, short: s.ss || '', products: (s.pr || []).map(([name, cut, line]) => ({ name, cut, line })),
  uses: (s.us || []).map(([id, scene, features]) => ({ id, scene, features: features || [] })) }));
/** 공간 이름을 제목용으로 짧게 — '주문 카운터·디지털 메뉴보드' → '주문 카운터' · '객석(식음 공간)' → '객석' */
const spShort = (n) => String(n || '').split(/[·(]/)[0].trim() || n;
B.value = (V, G, T, c, D) => {
  const bird = D.st.space.items.find((x) => /^L_VS_BIRD_/.test(x.f));
  const out = [];
  const spaces = scnSpaces(V);
  const plan = scenarioPlan(spaces, (CONTENT && CONTENT.sx) || {}, (id) => (V.fx && V.fx[id]) || []);
  if (bird) out.push({ std: bird, rename: ['공간별 제안', c.name], role: '공간 조감도 · 공간 번호', row: (/_B\d+$/.test(bird.f) ? '건물 조감도' : '공간 조감도') + ` · ${V.sp.length}개 공간`,
    patch: { 2: `${V.sp.length}개 공간 — 공간마다 놓이는 제품과 함께 쓰는 솔루션 · 서비스` } });
  for (const m of plan.maps) {
    const shared = m.rows.filter((r) => r.spaces.length > 1).length;
    const s = sheet(m.f, `활용 맵 · 공간 ${m.spaces.length}곳 × 솔루션 · 서비스 ${m.rows.length}`, '솔루션 · 서비스 활용 맵').t('eb', c.eb('활용 맵'))
      .t('title', shared ? `솔루션 · 서비스 ${shared}가지는 여러 공간에서 함께 씁니다` : '공간마다 쓰는 솔루션 · 서비스');
    m.spaces.forEach((i, j) => s.t('cn' + j, String(i + 1)).t('cs' + j, V.sp[i].n).t('cp' + j, `제품 ${spaces[i].products.length}`));
    for (let r = 0; r < SCN.rows; r++) {
      const x = m.rows[r];
      s.t('rk' + r, x ? x.kind : '').t('rn' + r, x ? x.name : '').t('rt' + r, x ? `${x.count}곳` : '');
      m.spaces.forEach((_, j) => s.t(`rc${r}_${j}`, x && x.cells[j] ? '●' : ''));
    }
    out.push(s);
  }
  for (const p of plan.sets) {
    const names = p.spaces.map((i) => spShort(spaces[i].name));
    const s = sheet(p.f, `공간별 시나리오 ${p.no} · ${names.join(' · ')} — 제품 겹쳐 보기 · 공간마다 시나리오 → · 솔루션 · 서비스 기능 on/off`, '공간별 시나리오')
      .t('eb', c.eb('공간별 시나리오 ' + p.no)).t('title', names.join(' → '));
    p.spaces.forEach((i, j) => {
      s.t('sp' + j, spaces[i].name).t(`sp${j}n`, String(i + 1)).t('sc' + j, spaces[i].short).img('ph' + j, spaces[i].photo);
      for (let k = 0; k < SCN.cuts; k++) { const x = p.cuts[j][k]; s.img(`pc${j}_${k}`, x ? x.cut : null, 'cut').t(`pn${j}_${k}`, x ? x.name : ''); }
    });
    for (let r = 0; r < SCN.useRows; r++) {
      const x = p.use[r];
      s.t('un' + r, x ? x.name : '');
      for (let k = 0; k < SCN.useIcons; k++) { const ic = x && x.icons[k]; s.img(`ui${r}_${k}`, ic ? LICO(ic.f, ic.on) : null, 'icon').t(`ul${r}_${k}`, ic ? FEATURE_LABEL[ic.f] || '' : ''); }
    }
    out.push(s);
  }
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
/* 서비스 제안 — 고른 서비스에 따라 갈래가 나뉜다(사용자 지시 2026-11-17: "구독 상품 제안은 서비스 하위로 넣기. 서비스 2개가 선택에 따라 분류되듯,
   구독 상품 선택시 구독 상품 제안의 흐름이 나오도록").
     sac    삼성케어플러스 SAC — 내용 고정 한 장(build/toc/layouts.py service_sac)
     mobile 삼성케어플러스 비즈니스 — 내용 고정 한 장(service_mobile)
     sub    구독 상품 — 고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제(B.subx 그대로, 숫자 00)
   어느 갈래를 쓸지는 DSS 로 정한 구성 변형이 갖고 있다(part_catalog.js SERVICE_BRANCHES · T.dss.svc — 고르는 규칙은 services/dss.js serviceBranches).
   변형이 아니면(관리자 목록 · 샘플 · 코드 구성) 세 갈래 모두. 케어 갈래가 함께 있으면 구독 장 여덟은 간지에서 한 줄('구독 상품')로 묶는다. */
export const SVC_BRANCHES = SERVICE_BRANCHES.map((b) => b.id);
B.svc = (V, G, T, c, D) => {
  const on = (T.dss && Array.isArray(T.dss.svc) && T.dss.svc.length && T.dss.svc) || SVC_BRANCHES;
  const out = [];
  if (on.includes('sac')) out.push(sheet('L_TOC_SVC_SAC', '삼성케어플러스 SAC — 유지보수 · 전문세척 · 스마트 케어', '삼성케어플러스 SAC').t('eb', c.eb('삼성케어플러스 SAC')));
  if (on.includes('mobile')) out.push(sheet('L_TOC_SVC_MOBILE', '삼성케어플러스 비즈니스 — 보증 · 수리 · 관리', '삼성케어플러스 비즈니스').t('eb', c.eb('삼성케어플러스 비즈니스')));
  if (on.includes('sub')) {
    const sub = B.subx(V, G, T, c, D);
    if (out.length) for (const x of sub) x.row = '구독 상품';
    out.push(...sub);
  }
  return out;
};
// 서비스 파트가 있는 구성 — {업종} 솔루션 파트(표준 장)에서 서비스 장을 뺀다(서비스 파트에 고정 장으로 따로 있다).
//   간지는 남은 솔루션으로 다시 만들고(행 = 솔루션 이름, 넷 이상이면 둘씩 · 'N개 솔루션' 숫자도) 솔루션 장의 눈썹 번호(· 01 …)도 다시 매긴다. 간지 사진은 표준 간지 사진 그대로.
const SERVICE_SHEET = /^L_VS_SOL_SVC/;
function solWithoutServices(D, c) {
  const items = D.st.sol.items; const div = items.find((x) => isDiv(x.f));
  const keep = items.filter((x) => x.f !== 'L_VS_TOC' && !isDiv(x.f) && !SERVICE_SHEET.test(x.f));
  const names = keep.map((x) => String(x.role || '').split(' — ')[0]);
  const pair = keep.length > 3;
  const sheets = keep.map((x, j) => ({ std: x, role: x.role, eb: `${pad(c.no)} · ${c.name} · ${pad(j + 1)}`,
    row: pair ? names.slice(j - (j % 2), j - (j % 2) + 2).join(' · ') : names[j] }));
  const sub0 = div && div.o.t && typeof div.o.t[3] === 'string' ? div.o.t[3] : '';
  return { sheets, divSub: sub0.replace(/\d+개 솔루션/, `${keep.length}개 솔루션`), divPhoto: (div && div.o.img && div.o.img[0] && div.o.img[0].src) || null };
}

/* 구독 솔루션(subx) — 구독을 한 파트로 (사용자 지시 2026-11-16)
   고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제. 그 밖의 구독 장(구독 품목 · 관리 옵션 · 도입 혜택 · 도입 절차 · 한 장 요약)은 쓰지 않는다.
   케어 2 · 구독 조건 · 결제의 숫자는 00 — 계약마다 다른 값이라 제안서 작성자가 직접 넣는다(대괄호 자리표시 [00] 이 아니므로 자리표시 걷어 내기에 걸리지 않는다 — slides/placeholders.js).
   한 파트에 같은 사진을 두 번 쓰지 않는다 — 패키지 사진은 제품 묶음에만, 나머지 사진 칸은 이 업종의 서로 다른 공간 사진(모자라면 구독 기본 사진)으로. */
const NUMBER_TOKEN = /(?<![A-Za-z\d])\d(?:[\d~·.,:–-]*\d)?(?![A-Za-z\d])/g; // 3~6 · 6·12·36 · 48 … (B2B 처럼 낱말 속 숫자는 아니다)
/** 글의 숫자를 00 으로 */
export const zeroText = (v) => String(v).replace(NUMBER_TOKEN, '00');
const ZERO_SKIP = /^(eb|title|foot|conf|logo|no\d+)$/; // 장 번호 눈썹 · 제목 · 꼬리말 · 차례 번호(01–03)는 그대로
const ENTITY = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const SUB_DEFAULTS = {};
/** 구독 장의 칸 번호 → 기본 글(장에 구워 둔 원문 사실) */
function subDefaults(f) {
  if (!SUB_DEFAULTS[f]) {
    const m = {};
    for (const x of String(SUBS_HTML[f] || '').matchAll(/data-tb="(\d+)"[^>]*>([^<]*)</g)) m[x[1]] = x[2].replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITY[e]);
    SUB_DEFAULTS[f] = m;
  }
  return SUB_DEFAULTS[f];
}
/** 장의 숫자를 00 으로 — 채운 칸은 그 값에서, 채우지 않은 칸은 장의 기본 글에서 숫자를 찾아 바꾼다 */
export function zeroSheet(s) {
  const S = SUBS_SLOTS[s.o.f]; const base = subDefaults(s.o.f);
  if (!S) return s;
  for (const [name, i] of Object.entries(S.t)) {
    if (ZERO_SKIP.test(name)) continue;
    const cur = s.o.t[i]; const text = cur == null ? base[i] : (typeof cur === 'string' ? cur : null);
    if (text == null) continue;
    const z = zeroText(text);
    if (z !== text) s.o.t[i] = z;
  }
  return s;
}
// 구독 장이 기본으로 쓰는 사진 — 이 파트 안에서 겹치지 않게 고를 때 견준다
const SUB_PIC = { grid: '/assets/subs/kv-grid.webp', care: ['/assets/subs/care-1.webp', '/assets/subs/care-2.webp', '/assets/subs/care-3.webp', '/assets/subs/care-4.webp'], engineer: '/assets/subs/val-dorm.webp',
  spare: ['/assets/subs/pkg-office.webp', '/assets/subs/pkg-stay.webp', '/assets/subs/pkg-public.webp', '/assets/subs/pkg-medical.webp'] };
B.subx = (V, G, T, c, D) => {
  // 이 파트에 이미 있는 사진(구독 가치의 품목 사진 · 케어 4단계 · 블루패스 엔지니어 · 패키지 사진)을 뺀, 이 업종의 공간 사진부터(간지가 앞쪽 사진을 먼저 쓰므로 뒤에서부터) → 모자라면 구독 기본 사진
  const used = new Set([SUB_PIC.grid, ...SUB_PIC.care, SUB_PIC.engineer, V.sub.ph]);
  const pool = [...new Set([...V.sp.map((x) => x.ph).reverse(), V.cover, ...SUB_PIC.spare].filter(Boolean))];
  const take = () => { const hit = pool.find((x) => !used.has(x)); if (hit) used.add(hit); return hit || null; };
  const put = (s, name) => { const src = take(); return src ? s.img(name, src) : s; }; // 고를 사진이 없으면 장의 기본 사진 그대로
  const pkg = pkgSheet(V, c); pkg.role = `제품 묶음 · ${V.sub.name}`; pkg.row = '제품 묶음';
  const value = put(put(sheet('L_SUB_VALUE3', '효과 · 구독 가치 3(비용 · 관리 · 만족)', '구독 효과').t('eb', c.eb('구독 효과')).t('title', `${D.cust}에 B2B 삼성 AI 구독이 맞는 세 가지 이유`), 'img1'), 'img2');
  const pain = put(sheet('L_SUB_PAIN', '고민 · 현장의 고민 4 → 전문 케어로 해결', '현장의 고민').t('eb', c.eb('현장의 고민')), 'img');
  const terms = put(sheet('L_SUB_TERMS', '구독 조건 · 숫자 00(작성자가 직접 입력)', '구독 조건 · 결제').t('eb', c.eb('구독 조건')), 'img');
  const pay = pay3Sheet(V, c, D) || sheet('L_SUB_PAY3', '맞춤 납부안 3', '납부 방법').t('eb', c.eb('납부 방법'));
  pay.role = '결제 · 납부 방법 3 · 숫자 00(작성자가 직접 입력)'; pay.row = '구독 조건 · 결제';
  return [
    pain, value,
    sheet('L_SUB_COMPARE', '비교 · 일시불 구매 vs 구독 5', '일시불 vs 구독').t('eb', c.eb('구매 방식 비교')),
    pkg,
    sheet('L_SUB_CARE4', '케어 1 · 전문 케어 4단계', '전문 케어').t('eb', c.eb('전문 케어')),
    zeroSheet(sheet('L_SUB_BLUEPASS', '케어 2 · B2B 블루패스 · 숫자 00(작성자가 직접 입력)', '전문 케어').t('eb', c.eb('B2B 블루패스'))),
    zeroSheet(terms), zeroSheet(pay),
  ];
};
const divSub = (key, V, T, D) => {
  if (key === 'pcase') { const n = V.pp.cmatch ? V.pp.nm : V.pp.cfam || '같은 제품군'; return `${n}${josa(n, '을', '를')} 먼저 도입한 고객`; }
  if (key === 'ua') { const g = [...new Set((T.ua || ['prof']).map((k) => UA_GROUP[k]))]; const w = g.join(' · '); return `${w}${ro(w)} 먼저 이해합니다`; }
  if (key === 'tech') return `${V.tech.length}개 솔루션, 키워드 셋으로 보는 ${D.ai}`;
  if (key === 'value') return `${V.sp.length}개 공간 — 공간마다 제품과 솔루션 · 서비스`;
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
const deckName = (T, V, D) => `${D.ai} ${T.deck}서`;
function composeDeck(T, V, G, D) {
  const total = T.tocs.length; const foot = `${D.cust} · ${deckName(T, V, D)}`;
  const plan = T.tocs.map((key, i) => {
    const c = ctxOf(key, i + 1, D);
    // 서비스 파트를 DSS 로 뺀 구성(part_catalog.js 변형 — 고른 서비스가 없음)도 솔루션 파트에 서비스 장을 다시 넣지 않는다
    if (key === 'sol' && (T.tocs.includes('svc') || (T.dss && T.dss.drop.includes('svc'))) && D.st.sol && D.st.sol.items.some((x) => SERVICE_SHEET.test(x.f))) return { c, ...solWithoutServices(D, c) };
    if (TOCS[key].std && D.st[TOCS[key].std]) return { c, std: D.st[TOCS[key].std].items.filter((x) => x.f !== 'L_VS_TOC') };
    return { c, sheets: (B[key] || TOCS[key].build)(V, G, T, c, D) }; // 직접 만든 파트는 제 build(고른 레이아웃을 그 순서대로)
  });
  // 간지 사진 — 표준 목차는 표준 간지 사진, 새 목차는 이 업종 공간 사진 중 덱에서 아직 안 쓴 것
  const used = new Set([D.cover.o.img && D.cover.o.img[0] && D.cover.o.img[0].src]);
  // 표준 목차가 목차 장에 쓰는 사진(표준 목차 장 L_VS_TOC 의 칸)도 미리 넣어 — 새 목차가 같은 사진을 골라 목차 장에 두 번 나오지 않게
  plan.forEach((p) => { if (p.divPhoto) used.add(p.divPhoto); }); // 다시 만든 솔루션 간지 — 표준 간지 사진을 먼저 잡아 둔다
  plan.forEach((p, i) => { if (p.std) { const d = p.std.find((x) => isDiv(x.f)); if (d && d.o.img && d.o.img[0]) used.add(d.o.img[0].src); const ti = D.tocImg(T.tocs[i]); if (ti) used.add(ti); } });
  const pool = [V.cover, ...V.sp.map((x) => x.ph)].filter(Boolean);
  // spare: 공간 사진이 다 쓰였을 때 pool[0](표지 사진)으로 되돌아가기 전에 쓰는 사진 — 목차 장에 같은 사진이 두 번 나오지 않게
  // avoid: 그 파트의 장이 이미 쓰는 사진 — 간지가 제 파트의 사진을 되풀이하지 않게(구독 솔루션)
  const pickPhoto = (pref, spare = [], avoid = null) => {
    const all = [...pref, ...pool, ...spare].filter(Boolean); const free = (x) => !(avoid && avoid.has(x));
    const hit = all.find((x) => !used.has(x) && free(x)) || all.find(free) || pool[0]; used.add(hit); return hit;
  };
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
    // 고객/공간 시나리오 — 공간 사진은 공간마다 한 장이 모두 쓰므로 간지는 표준 제안서 공간별 제안 간지 사진(이 구성에 그 파트가 없을 때)부터
    const pref = c.key === 'value' ? [TOCS.space.std && !T.tocs.includes('space') ? D.divImg('space') : null] : c.key === 'ua' ? [V.cover] : c.key === 'subsol' || c.key === 'subx' ? [] // 구독 솔루션 제안 — 안 쓴 공간 사진, 다 쓰였으면 패키지 사진 · 구독 품목 대표 이미지(spare)
      : c.key === 'vp' ? [sp(P.rep[0]), sp(P.where[0])] : c.key === 'vpd' ? P.where.slice(1).map(sp)
        : c.key === 'pcase' && P.cases[0] ? [P.cases[0].o.img[0] && P.cases[0].o.img[0].src] : c.key === 'pspec' ? P.where.map(sp) : [];
    // 구독 솔루션 — 간지 사진은 이 파트의 장이 쓰는 사진(채운 사진 + 장에 구워 둔 기본 사진: 품목 · 케어 4단계 · 엔지니어)과 겹치지 않게.
    //   서비스 제안에 구독 갈래가 들어 있으면(2026-11-17) 같은 규칙. 고객/공간 시나리오도 제 장이 쓰는 공간 사진을 피한다.
    const sheetPics = () => sheets.flatMap((x) => Object.values((x.o && x.o.img) || {}).map((im) => im && im.src).filter(Boolean));
    const subLike = c.key === 'subx' || (c.key === 'svc' && sheets.some((x) => x.o && /^L_SUB_/.test(x.o.f)));
    const own = subLike ? new Set([SUB_PIC.grid, ...SUB_PIC.care, SUB_PIC.engineer, ...sheetPics()]) : c.key === 'value' ? new Set(sheetPics()) : null;
    const photo = p.divPhoto ? p.divPhoto : subLike ? pickPhoto(tight ? subSpare : [], [...subSpare, ...SUB_PIC.spare], own) : c.key === 'subsol' ? pickPhoto(tight ? subSpare : [], subSpare) : pickPhoto(pref, [], own);
    const items = [divider({ no: c.no, total, title: c.name, sub: p.divSub || divSub(c.key, V, T, D), rows, photo, page: divPage })];
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
  // 직접 만든 구성은 한 줄 소개가 없다 — 앞 파트 이름 셋(Spec 빼고)
  const coverSub = T.custom ? stages.filter((st) => st.c.key !== SPEC_TOC).slice(0, 3).map((st) => st.c.name).join(' · ') : T.sub;
  if (!T.keepCover) cover.t = { ...cover.t, 3: `${D.cust}\n${T.deck}서`, 4: coverSub };
  const idx = sheet('L_TOC_INDEX' + Math.min(10, Math.max(4, total)), '목차 · 목차 ' + total + '개');
  stages.forEach((st, i) => {
    const key = st.c.key; const img = TOCS[key].std ? D.tocImg(key) || st.photo : st.photo;
    idx.t('no' + i, pad(i + 1)).t('nm' + i, st.c.name).img('img' + i, img);
  });
  idx.t('foot', foot).t('conf', 'CONFIDENTIAL · 2');
  return { foot, deck: [{ o: cover, role: '표지' }, { o: idx.o, role: idx.role }], stages };
}

export function tocScenarioId(tid, vid, addons = []) {
  const a = (addons || []).filter((x) => ADDONS[x]);
  return `toc_${tid}${a.map((x) => '+' + x).join('')}__${vid}`; // 표준 제안서도 조립한다(Spec 이 붙어 업종 표준 제안서와 같은 덱이 아니다)
}
/** 템플릿 × 업종 시나리오 — 조립해 시나리오 레지스트리(SC · FILLS · FILL_CUSTOMER · STORY)에 올린다(표준 제안서도 — 표준 장을 옮기고 끝에 Spec).
 *  opts.addons: 더할 목차(['sub'] = 구독 솔루션 제안) — 템플릿에 이미 있거나 같은 유형 목차가 있으면 그 템플릿 그대로.
 *  콘텐츠(loadTocContent)가 먼저 로드돼 있어야 함 */
export function ensureTocScenario(tid, vid, opts = {}) {
  const T0 = TPL[tid]; if (!T0) return null;
  const extra = (opts.addons || []).filter((a) => ADDONS[a] && !(T0.addons || []).includes(a));
  const tocs = extra.length ? withAddons(T0.tocs, extra) : T0.tocs;
  if (extra.length && tocs.length === T0.tocs.length) return ensureTocScenario(tid, vid); // 더할 자리가 없음(이미 구독 목차)
  const named = extra.length && TOC_TEMPLATES.find((t) => t.base === tid && (t.addons || []).join() === [...(T0.addons || []), ...extra].join());
  if (named) return ensureTocScenario(named.id, vid); // 같은 구성의 템플릿이 있으면 그 덱(예: 표준 제안서 + 구독 → 표준 제안서 + 구독 솔루션)
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
    vp: 'value', vpd: 'value', pcase: 'proof', pspec: 'build', subs: 'value', subpkg: 'build', subcare: 'build', subterm: 'plan', subone: 'context', subsol: 'plan', subx: 'value', svc: 'build' };
  stages.forEach(({ c, items }) => {
    const name = `${pad(c.no)} ${c.name}`;
    push(STAGE_KEY[c.key] || TOCS[c.key].stage || 'value', name, TOCS[c.key].goal, items);
    parts[name] = { type: TOCS[c.key].type, items: items.map((x) => x.role) };
  });
  const s0 = D.s; const names = stages.map((x) => x.c.name);
  const needs = D.needs.map((n) => n.v);
  const P = V.pp; const prod = tid === 'prod'; const vpt = P.vps.map((x) => x.t); const sub = T.kind === 'subs';
  const withSub = (T.addons || []).includes('sub') && (T.tocs.includes('subx') || T.tocs.includes('subsol'));
  const subLine = withSub ? ` 고객 요구에 구독 · 렌탈 · 월 납부(초기 비용 · 관리 부담)가 있어, 같은 제품을 B2B 삼성 AI 구독(${V.sub.name})으로 들이는 길을 '구독 솔루션' 파트로 함께 보여 줍니다.` : '';
  const s = {
    ...s0, id, std: false, toc: tid, tocV: vid, req: T.req, strategy: T.strategy, ending: T.ending,
    title: `${D.cust} · ${deckName(T, V, D)}${withSub ? ' · 구독 솔루션 포함' : ''}`, short: names.join(' → '),
    situation: prod ? `${D.cust}에 솔루션 없이 제품을 제안하는 자리입니다. 세 가지 핵심 제안을 먼저 보여 주고, 공간마다 놓일 제품 · Why Samsung · 제품 사양으로 답합니다.`
      : sub ? `${D.cust}에 제품을 일시불 대신 B2B 삼성 AI 구독으로 도입하자고 제안하는 자리입니다. 초기 비용 · 시설 관리 부담을 먼저 짚고, ${V.sub.name}(${V.sub.items.map((x) => x[0]).join(' · ')}) · 케어 · 조건 · 납부 방법으로 답합니다.`
        : `${D.cust}에 ${T.name} 양식으로 제안하는 자리입니다. ${V.pains.map((p) => p[0]).join(' · ')}을(를) 함께 짚고, ${names.slice(1, -1).join(' · ')} 순서로 답합니다.${subLine}`,
    thesis: sub ? `초기 비용은 낮추고, 관리는 삼성이 — ${V.sub.name}` : `${needs.join(' · ')} — ${T.sub}`, logic: names, tone: '한 줄 메시지 · 사진과 아이콘 중심',
    messages: sub ? [T.sub, '월 분할 납부 · 최대 6년 무상 AS · B2B 블루패스', `${V.sub.name} — ${V.sub.title}`]
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
