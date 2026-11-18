// 전체 파트 — 관리자 「레이아웃 구성 관리」의 '전체 파트' 목록(11개)을 Storyboard 가 그대로 쓴다(사용자 지시 2026-11-16:
//   "storyboard 에서 추천 구성 및 전체 구성 데이터를 admin 추천 구성을 기반으로 하도록 해").
//   · 이름: 관리자 목록 이름(admin/web/src/part-flows.js PART_CATALOG.names — app/tests/part-catalog.mjs 가 같은지 확인한다).
//     Storyboard 의 구성 카드 · 목차 버블 · 목차 추가 팝업이 이 이름을 쓴다. 덱 안의 간지 · 목차 장 글은 그대로(toc_templates.js tocName).
//   · 순서: 관리자 목록 순서(기 → 승 → 전 → 결, admin/web/src/part-arc.js PART_ARC).
//   · DSS 파트: 고객에게 고른 DSS 가 없으면 구성에서 빠지고(구성 생성하기) 목차 추가에서도 고를 수 없는 파트 —
//     제품 제안 ← 제품 · 솔루션 제안 ← 솔루션 · 서비스 제안 ← 서비스(케어) 또는 구독.
//   · 서비스 제안의 갈래(사용자 지시 2026-11-17): 구독 상품 제안은 서비스 제안 아래로 들어갔다 — 고른 서비스에 따라 삼성케어플러스 SAC · 비즈니스 장,
//     구독을 고르면 구독 흐름(고민 → … → 결제). 갈래를 뺀 변형 id 는 'svc-<갈래>'(예: basic~sol.svc-mobile.svc-sub), 갈래가 모두 빠지면 파트도 빠진다.
//   · 구성 변형: 관리자 구성(기본 제안 · 상세 제안 …)에서 DSS 파트만 뺀 구성. id 는 '<구성 id>~<뺀 파트>.<뺀 파트>'(예: basic~sol.svc).
//     구성의 나머지(이름 · 표지 · 덱 이름 …)는 관리자 구성을 그대로 따른다(Object.create — 관리자가 이름을 바꾸면 변형도 같이 바뀐다).
//     목차 템플릿 레지스트리(TPL)에 올려 두어 조립(ensureTocScenario) · 이미 그 변형으로 만든 제안서(layoutPlan.tpl)가 그대로 찾는다.
import { TOCS, TPL, TOC_TEMPLATES, tocName, SPEC_TOC } from './toc_templates.js';
import { SERVICE_BRANCHES } from './service_branches.js';

/** 제품 스펙 — 늘 구성의 맨 끝(관리자 규칙). Storyboard 에서 목차를 넣거나 옮겨도 맨 끝에 남는다 */
export const SPEC_KEY = SPEC_TOC;
/** 관리자 목록의 파트 — 목록 순서 */
//   구독 상품 제안(subx)은 2026-11-17 서비스 제안의 갈래로 들어가 목록에서 빠졌다(이미 그 파트를 넣은 제안서는 그대로 열린다)
export const CATALOG_PARTS = ['overview', 'ua', 'needs', 'space', 'value', 'sol', 'pspec', 'svc', 'case', 'why'];
/** 관리자 목록 이름 — 목록에 이름이 따로 없는 파트(Why Samsung)는 목차 이름 그대로. 2026-11-17: 공간별 제안 → 제품 제안 · 서비스 → 서비스 제안 */
export const PART_LABEL = { overview: '제안 개요', ua: '시장 분석 (MI)', needs: '가치 제안 (VP)', space: '제품 제안', value: '고객/공간 시나리오', sol: '솔루션 제안', case: '유관 사례', pspec: '제품 스펙', subx: '구독 상품 제안', svc: '서비스 제안' };
/** 파트 이름 — 관리자 목록 이름, 없으면 목차 이름({업종}은 그 업종 이름) */
export const partLabel = (key, short) => PART_LABEL[key] || (TOCS[key] ? tocName(key, short) : String(key || ''));

/** DSS 에 따라 넣고 빼는 파트 → 그 파트에 있어야 하는 DSS 종류 — 서비스 제안(svc)은 갈래로 정한다(SERVICE_BRANCHES) */
export const DSS_PARTS = { space: 'products', sol: 'solutions', subx: 'subscriptions' };
/** 서비스 제안의 갈래 — service_branches.js(관리자 화면도 같이 읽는다). 순서 = toc_templates.js SVC_BRANCHES. 고르는 규칙: services/dss.js serviceBranches */
export { SERVICE_BRANCHES };
/** 변형 id 에서 갈래를 뺀다는 표시 — 'svc-sac' … (DSS 가 없다는 표시도 같은 이름: services/dss.js dssLacking) */
export const BRANCH = 'svc-';
const BRANCH_IDS = SERVICE_BRANCHES.map((b) => b.id);
/** DSS 종류 이름 */
export const DSS_LABEL = { products: '제품', solutions: '솔루션', subscriptions: '구독', services: '서비스' };

const SEP = '~';
const rank = (k) => { if (k.startsWith(BRANCH)) return 100 + BRANCH_IDS.indexOf(k.slice(BRANCH.length)); const i = CATALOG_PARTS.indexOf(k); return i < 0 ? 99 : i; };
/** 구성 변형 id — 뺀 파트가 없으면 구성 id 그대로 */
export const variantId = (tid, drop) => (drop && drop.length ? tid + SEP + [...new Set(drop)].sort((a, b) => rank(a) - rank(b)).join('.') : tid);
/** 변형 id → { base, drop } (변형이 아니면 null) */
export function parseVariant(id) {
  const s = String(id || ''); const i = s.indexOf(SEP);
  if (i <= 0) return null;
  const drop = s.slice(i + 1).split('.').filter(Boolean);
  return drop.length ? { base: s.slice(0, i), drop } : null;
}
const MIN_PARTS = 4; // 목차 장(L_TOC_INDEX4–10)은 4칸부터
/** 변형을 TPL 에 올린다(이미 있으면 그것) — 만들 수 없으면(구성이 없음 · 파트가 4개보다 적어짐) null.
 *  뺄 것이 이 구성에 없으면 구성 그대로(예: 구독 상품 제안이 서비스 제안으로 들어가기 전에 만든 'basic~subx' — 그 제안서가 다시 열려도 구성을 찾는다) */
export function registerVariant(id) {
  const v = parseVariant(id);
  if (!v) return TPL[id] || null;
  const T0 = TPL[v.base];
  if (!T0 || T0.dss) return null;
  // 서비스 제안 갈래 — 남는 갈래가 없으면 파트도 뺀다
  const off = v.drop.filter((k) => k.startsWith(BRANCH)).map((k) => k.slice(BRANCH.length)).filter((b) => BRANCH_IDS.includes(b));
  const svcOn = T0.tocs.includes('svc') ? BRANCH_IDS.filter((b) => !off.includes(b)) : null;
  const drop = v.drop.filter((k) => !k.startsWith(BRANCH) && T0.tocs.includes(k));
  if (svcOn && !svcOn.length && !drop.includes('svc')) drop.push('svc');
  const tocs = T0.tocs.filter((k) => !drop.includes(k));
  const svc = svcOn && tocs.includes('svc') && svcOn.length < BRANCH_IDS.length ? svcOn : null;
  if (tocs.length === T0.tocs.length && !svc) return T0;
  if (tocs.length < MIN_PARTS) return null;
  const cur = TPL[id];
  if (cur && Object.getPrototypeOf(cur) === T0 && cur.tocs.join() === tocs.join() && String(cur.dss.svc) === String(svc)) return cur;
  const t = Object.create(T0, {
    id: { value: id, enumerable: true },
    tocs: { value: tocs, enumerable: true },
    dss: { value: { base: T0.id, drop, svc }, enumerable: true },
  });
  TPL[id] = t;
  return t;
}
/** 구성 id → 구성 (변형이면 TPL 에 올려서) */
export const tplOf = (id) => (id ? TPL[id] || registerVariant(id) : null) || null;
/** 관리자 구성 t 에서 lacking(없는 DSS 종류 Set)에 해당하는 파트를 뺀 구성 — 뺄 것이 없거나 만들 수 없으면 t 그대로 */
export function dssVariant(t, lacking) {
  if (!t || t.dss) return t;
  const drop = t.tocs.filter((k) => DSS_PARTS[k] && lacking.has(DSS_PARTS[k]));
  if (t.tocs.includes('svc')) for (const b of BRANCH_IDS) if (lacking.has(BRANCH + b)) drop.push(BRANCH + b); // 서비스 제안 — 고르지 않은 갈래
  return (drop.length && registerVariant(variantId(t.id, drop))) || t;
}
/** 지금 구성마다 가능한 변형을 모두 올린다 — 이미 그 변형으로 만든 제안서가 다시 열릴 때 TPL[layoutPlan.tpl] 로 바로 찾게 */
export function registerVariants() {
  for (const t of TOC_TEMPLATES) {
    if (t.base || t.dss) continue;
    const ks = [...t.tocs.filter((k) => DSS_PARTS[k]), ...(t.tocs.includes('svc') ? BRANCH_IDS.map((b) => BRANCH + b) : [])];
    for (let m = 1; m < 1 << ks.length; m++) registerVariant(variantId(t.id, ks.filter((_, i) => m & (1 << i))));
  }
}
registerVariants();

/** Storyboard 파트의 목차 키(구성에서 온 파트 · 목차 추가로 넣은 파트) — 직접 만든 옛 목차는 null */
export const partKey = (part) => (part && part.agent && part.agent.toc) || null;
