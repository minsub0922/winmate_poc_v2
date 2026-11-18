// 제안서에 연결한 DSS(제품 · 솔루션 · 서비스) — Storyboard '제품 · 솔루션 · 서비스' 버블이 보여 주고, 구성 생성 · 목차 추가가 이것으로 파트를 넣고 뺀다.
//   서비스 = 솔루션 카탈로그의 '서비스' 분류(케어 · 유지관리 서비스 · 콘텐츠 제작 지원 — p.ctx.solutions 에 그대로 연결) + 구독(B2B 삼성 AI 구독 레지스트리 — p.ctx.subscriptions).
//   (사용자 지시 2026-11-16: "서비스 항목에 솔루션 하위의 서비스 항목들이랑 구독이 들어가야해")
import { P, S, SUB, dssKindOf } from './catalog.js';
import { DSS_PARTS, DSS_LABEL, BRANCH, SERVICE_BRANCHES } from '../domain/templates/part_catalog.js';

export const SERVICE_CAT = '서비스';
/** 솔루션 카탈로그에서 서비스로 묶는 항목인가 */
export const isServiceSolution = (id) => !!S[id] && S[id].cat === SERVICE_CAT;
/** 연결한 DSS — { products, solutions(서비스 뺀 솔루션), services(서비스 분류 솔루션), subscriptions } (카탈로그에 있는 id 만).
 *  제품 DB 행의 종류(dssKind — 수집한 뒤 LLM 이 판정)를 따른다: 지난 제안서가 제품으로 고른 행이 솔루션 · 서비스 · 구독이면 그 종류로
 *  (앱 솔루션의 판매 단위인 행은 그 솔루션으로) — 저장된 ctx 는 그대로 두고 보이는 곳 · 파트 판단만 나눈다. */
export function dssOf(p) {
  const c = (p && p.ctx) || {};
  const prods = (c.products || []).filter((id) => P[id]);
  const moved = prods.filter((id) => dssKindOf(P[id]) !== 'device').map((id) => (P[id].dssSame && S[P[id].dssSame] ? P[id].dssSame : id)).filter((id) => S[id]);
  const sols = [...new Set([...(c.solutions || []).filter((id) => S[id]), ...moved])];
  return {
    products: prods.filter((id) => dssKindOf(P[id]) === 'device'),
    solutions: sols.filter((id) => !isServiceSolution(id)),
    services: sols.filter(isServiceSolution),
    subscriptions: (c.subscriptions || []).filter((id) => SUB[id]),
  };
}
// 서비스 제안의 갈래(사용자 지시 2026-11-17 — 구독 상품 제안은 서비스 제안 아래로, 고른 서비스에 따라 흐름이 나뉜다):
//   구독(B2B 삼성 AI 구독)을 고르면 → 구독 흐름. 케어 서비스(서비스 분류에서 케어 · 유지관리 · A/S · 보증)를 고르면 → 삼성케어플러스 장 —
//   고른 제품에 공조(시스템에어컨 · 공조 · 히트펌프)가 있으면 SAC, 갤럭시 스마트폰 · 탭이 있으면 비즈니스, 둘 다 있거나 둘 다 없으면 두 장 모두.
//   (콘텐츠 제작 지원처럼 맞는 장이 없는 서비스는 갈래를 열지 않는다)
const CARE = /케어|유지|A\/S|보증/;
const AC = /시스템에어컨|공조|히트펌프/;
const MOBILE = /갤럭시 (스마트폰|탭)/;
/** 지금 고른 DSS 로 여는 서비스 제안 갈래 — Set('sac' | 'mobile' | 'sub') */
export function serviceBranches(p) {
  const d = dssOf(p); const on = new Set();
  if (d.subscriptions.length) on.add('sub');
  if (d.services.some((id) => CARE.test(`${S[id].name} ${(S[id].kw || []).join(' ')}`))) {
    const cats = d.products.map((id) => String(P[id].cat || ''));
    const ac = cats.some((c) => AC.test(c)); const mob = cats.some((c) => MOBILE.test(c));
    if (ac || !mob) on.add('sac');
    if (mob || !ac) on.add('mobile');
  }
  return on;
}
/** 연결한 것이 없는 DSS 종류 — Set('products' | 'solutions' | 'services' | 'subscriptions') + 열지 않는 서비스 제안 갈래('svc-sac' · 'svc-mobile' · 'svc-sub') */
export function dssLacking(p) {
  const d = dssOf(p);
  const out = new Set(Object.keys(d).filter((k) => !d[k].length));
  const on = serviceBranches(p);
  for (const b of SERVICE_BRANCHES) if (!on.has(b.id)) out.add(BRANCH + b.id);
  return out;
}
/** 이 파트에 필요한 DSS 가 없으면 { kind, label } — 없어도 되는 파트 · 있으면 null. 서비스 제안은 갈래가 하나도 없을 때(케어 서비스도 구독도 고르지 않음) */
export function dssLack(p, key) {
  if (key === 'svc') return serviceBranches(p).size ? null : { kind: 'services', label: DSS_LABEL.services };
  const kind = DSS_PARTS[key];
  if (!kind || dssOf(p)[kind].length) return null;
  return { kind, label: DSS_LABEL[kind] };
}
/** 매칭 팝업에서 그 종류를 여는 폴더 — 서비스 · 구독은 '서비스' 폴더 */
export const dssFolder = (kind) => (kind === 'products' ? 'products' : kind === 'solutions' ? 'solutions' : 'services');
