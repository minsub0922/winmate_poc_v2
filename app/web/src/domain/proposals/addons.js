// 요구사항에 따라 다른 목차 구성에 더하는 목차(add-on) — 지금은 '구독 솔루션 제안' 하나.
// 규칙(요구 신호 · 목차 틀 · 들어갈 자리)은 구독 레지스트리의 addon 에서 온다(app/data/subscriptions.json ← proddb/subs/mapping.json):
// 앱은 bootstrap(catalog.js SUBSCRIPTION_DB.addon) 또는 목차 내용(toc_content.json subs.addon)으로 받고, 서버는
// app/api/poc/subscription_addon.py 가 같은 규칙을 쓴다. 이 파일은 규칙을 인자로 받는 순수 함수만 둔다(가져오기 순환 없음).

const COMPILED = new WeakMap();
function compile(rules) {
  if (!rules) return null;
  let c = COMPILED.get(rules);
  if (!c) {
    const re = (xs) => (xs || []).map((x) => new RegExp(x, 'gi'));
    c = { strong: re(rules.strong), weak: re(rules.weak), negative: re(rules.negative) };
    COMPILED.set(rules, c);
  }
  return c;
}
const hits = (list, text) => {
  const out = [];
  for (const re of list) { re.lastIndex = 0; for (const m of text.matchAll(re)) { const w = m[0].trim(); if (w && !out.includes(w)) out.push(w); } }
  return out;
};

/** 고객 요구 문장에서 구독 요구를 찾는다 — { need, strong, weak, negative }. strong 하나 이상 또는 weak 둘 이상, negative 없을 때 need. */
export function subscriptionNeed(text, rules) {
  const c = compile(rules); const t = String(text || '');
  if (!c || !t.trim()) return { need: false, strong: [], weak: [], negative: [] };
  const strong = hits(c.strong, t), weak = hits(c.weak, t), negative = hits(c.negative, t);
  return { need: !negative.length && (strong.length >= 1 || weak.length >= 2), strong, weak, negative };
}

/** 요구 신호를 한 줄로 — '요구사항: 렌탈 · 초기 비용' (목차 내용 첫 줄 · 로그용) */
export const needLine = (need) => (need && need.need ? '요구사항: ' + [...need.strong, ...need.weak].slice(0, 4).join(' · ') : '');

/** 더할 목차 — { type, name, items } (items 첫 줄은 왜 더했는지) */
export function addonPart(rules, need) {
  const p = rules && rules.part; if (!p) return null;
  const why = needLine(need);
  return { type: p.type, name: p.name, items: [...(why ? [why] : []), ...p.items].slice(0, 5) };
}

/** 목차 목록에서 더할 자리 — 마지막 '비용 · 구매' 바로 뒤, 없으면 첫 실행 · 사례 · Why · 마무리 · 부록 앞, 없으면 끝. 표지(deck) 앞에는 넣지 않는다. */
export function addonIndex(list, rules, typeOf = (x) => x.type) {
  const place = (rules && rules.place) || { after: ['cost'], before: ['execution', 'case', 'why', 'closing', 'appendix'] };
  const types = list.map(typeOf);
  const after = types.reduce((k, t, i) => (place.after.includes(t) ? i : k), -1);
  if (after >= 0) return after + 1;
  const firstBody = list.findIndex((x) => !x || !x.deck);
  const before = types.findIndex((t, i) => i >= Math.max(0, firstBody) && place.before.includes(t));
  return before >= 0 ? before : list.length;
}

/** 이미 구독 목차가 있는지 — 있으면 더하지 않는다 */
export const hasSubscriptionPart = (list, rules, typeOf = (x) => x.type) => list.some((x) => typeOf(x) === ((rules && rules.part && rules.part.type) || 'subscription'));
