// 「레이아웃 구성 관리」 전체 파트 팝업의 흐름 표시(admin/web/src/part-flows.js) — 모든 구성 × 업종 덱을 조립해 잰 값이 운영 규칙과 맞는가.
//   node admin/tests/part-flows.mjs
// 규칙(2026-11-16 사용자): Why Samsung 은 완전 고정 · 3 value props(AI {업종} · Value Props)와 공간별 제품은 순서가 정해져 있고,
// 공간별 제품은 제품 수에 따라 장 수만 달라지고 구성은 고정이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(root + 'app/web/package.json');
const { build } = require('esbuild');
const entry = `export * as toc from './app/web/src/domain/templates/toc_templates.js';
export { FILLS, FILL_CUSTOMER } from './app/web/src/domain/templates/scenario_fills.js';
export { default as SWAPS } from './app/web/src/domain/templates/scenario_image_swaps.json';
export * from './admin/web/src/part-flows.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.toc.loadTocContent();
const flows = M.partFlows(M.toc, { FILLS: M.FILLS, FILL_CUSTOMER: M.FILL_CUSTOMER, SWAPS: M.SWAPS });
const P = Object.fromEntries(flows.map(p => [p.key, p]));
const fams = key => P[key].slots.map(x => x.fam);

test('모든 목차(파트)가 한 장씩 — 구성에 쓰이는 목차 전부', () => {
  const used = Object.keys(M.toc.TOCS).filter(k => M.toc.TOC_TEMPLATES.some(t => t.tocs.includes(k)));
  assert.deepEqual(flows.map(p => p.key), used);
  for (const p of flows) assert.ok(M.KIND[p.kind], p.key + ' ' + p.kind);
});

test('Why Samsung — 완전 고정(장 · 순서 · 내용) · 겹침 방지로 사진만 바뀐 업종은 따로 센다', () => {
  assert.equal(P.why.kind, 'fixed');
  assert.deepEqual(fams('why'), ['L_VS_DIV', 'L_VS_WHY_1', 'L_VS_WHY_2', 'L_VS_WHY_3', 'L_VS_WHY_4', 'L_VS_WHY_5', 'L_VS_END']);
  assert.equal(P.why.tpls.length, M.toc.TOC_TEMPLATES.filter(t => t.tocs.includes('why')).length);
  assert.ok(P.why.swapped >= 0 && P.why.swapped < 44);
  // 사진 교체를 되돌리지 않으면 완전 고정이 아니게 된다(교체가 있을 때) — 되돌리기가 실제로 일한다
  const raw = M.partFlows(M.toc, { FILLS: M.FILLS, FILL_CUSTOMER: M.FILL_CUSTOMER }).find(p => p.key === 'why');
  if (P.why.swapped) assert.equal(raw.kind, 'flow');
});

test('3 value props — AI {업종}: 간지 → 니즈 매트릭스 → 핵심 제안 1 → 2 → 3 — 순서 고정', () => {
  assert.equal(P.needs.kind, 'flow');
  assert.deepEqual(fams('needs'), ['L_VS_DIV', 'L_VS_NEEDS', 'L_VS_CORE_1', 'L_VS_CORE_2', 'L_VS_CORE_3']);
  assert.deepEqual(P.needs.slots.map(x => x.step), [1, 2, 3, 4, 5]);
  assert.equal(P.vp, undefined); // 제품 제안서의 Value Props 는 목록에서 뺐고(2026-11-16) 구성에서도 빠졌다 — 제품 제안서도 이 파트(AI {업종})를 쓴다
  assert.ok(P.needs.tpls.includes('prod'));
});

test('공간별 제품 — 제품 수만큼 장 수만 달라지고 구성 · 순서는 고정', () => {
  assert.equal(P.space.kind, 'repeat');
  assert.deepEqual(fams('space'), ['L_VS_DIV', 'L_VS_BIRD', 'L_VS_SPACE', 'L_VS_MAP']);
  const sp = P.space.slots[2];
  assert.equal(sp.by, '제품 수');
  assert.ok(sp.n.min >= 1 && sp.n.max > sp.n.min, JSON.stringify(sp.n));
  for (const x of [P.space.slots[0], P.space.slots[1], P.space.slots[3]]) assert.deepEqual(x.n, { min: 1, max: 1 });
  assert.ok(P.space.slots[1].fs.length > 1, '조감도는 공간 수에 맞춘 모양 여럿');
  assert.equal(P.sol.kind, 'repeat');
  assert.equal(P.sol.slots[1].by, '솔루션 수');
});

test('흐름이 구성마다 다른 파트 — 당사의 이해(구성마다 고른 장) · 정해진 흐름 없는 파트(Value Prop 상세)는 구성에서 빠졌다', () => {
  assert.equal(P.ua.kind, 'template');
  assert.ok(P.ua.slots.every(x => x.step === 0));
  assert.equal(P.vpd, undefined);
  assert.ok(flows.every(p => p.kind !== 'free'));
});

test('묶음 — 칸 수만 다른 장은 한 자리(간지 R1–R6 · 조감도 · Map · 핵심 기술 · 수량표)', () => {
  assert.equal(M.familyOf('L_VS_DIV_R6'), 'L_VS_DIV');
  assert.equal(M.familyOf('L_VS_BIRD_B10'), 'L_VS_BIRD');
  assert.equal(M.familyOf('L_VS_CORE_2'), 'L_VS_CORE_2'); // 핵심 제안 1 · 2 · 3 은 서로 다른 자리
  assert.equal(M.familyOf('L_VS_WHY_3'), 'L_VS_WHY_3');
  for (const x of P.space.slots) assert.deepEqual(x.fs, [...x.fs].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), x.fam); // 같은 묶음 안은 칸 수 차례
});

/* ---------- 전체 파트 목록(카탈로그) — 사용자 지시 2026-11-16. 처음에는 목록만 정리했고, 이어서 추천 구성도 이 목록의 파트만으로 다시 짰다(app/tests/toc-templates.mjs) ---------- */
const C = M.curateParts(flows);
const Q = Object.fromEntries(C.parts.map(p => [p.key, p]));

test('목록 1 — 뺀 목차 13개는 목록에도, 추천 구성에도 없다(구성을 목록의 파트만으로 다시 짰다)', () => {
  const gone = ['summary', 'effect', 'pilot', 'plan', 'rfp', 'spec', 'bom', 'vp', 'vpd', 'subone', 'subsol', 'tech', 'cost']; // tech(업종 핵심 기술) · cost(비용 · 구매)는 뒤이어 뺐다
  assert.deepEqual([...M.PART_CATALOG.hidden].sort(), [...gone, 'subx'].sort()); // subx: 구독 상품 제안은 서비스 제안의 갈래로(2026-11-17)
  for (const k of gone) { assert.equal(Q[k], undefined, k); assert.equal(P[k], undefined, k + ' 구성에서 쓰지 않는다'); }
  // 구성이 쓰는데 목록에 없는 목차 — 구독 상품 제안(구독 제안서 · 표준 + 구독 변형이 아직 쓴다 — 둘 다 추천에서 꺼 둔 구성)
  assert.deepEqual(C.hidden.map(x => [x.key, x.tpls]), [['subx', ['subs', 'stdsub']]]);
  for (const t of M.toc.TOC_TEMPLATES) for (const k of t.tocs) assert.ok(!gone.includes(k), `${t.id} uses ${k}`);
  // 목록 = 구성이 쓰는 파트(10종)
  assert.deepEqual(C.parts.map(p => p.key), ['overview', 'ua', 'needs', 'space', 'value', 'sol', 'case', 'why', 'pspec', 'svc']); // 유관사례(pcase)는 쓰는 구성이 없어 목록에서 빠졌다 — 제품 제안서 = 표준 제안서에서 Overview · 업종 솔루션 · 도입사례만 뺀 것(2026-11-16)
  assert.equal(P.pcase, undefined);
  assert.deepEqual(C.parts.map(p => p.toc), flows.map(p => p.key).filter(k => k !== 'subx'));
  assert.equal(M.catalogSize(M.toc), C.parts.length);
});

test('목록 — 파트 이름(사용자 지시 2026-11-16 · 11-17): 제안 개요 · 시장 분석 (MI) · 가치 제안 (VP) · 제품 제안 · 고객/공간 시나리오 · 솔루션 제안 · 제품 스펙 · 서비스 제안 · 유관 사례', () => {
  const want = { overview: '제안 개요', ua: '시장 분석 (MI)', needs: '가치 제안 (VP)', space: '제품 제안', value: '고객/공간 시나리오', sol: '솔루션 제안', pspec: '제품 스펙', svc: '서비스 제안', case: '유관 사례' };
  for (const [k, name] of Object.entries(want)) assert.equal(Q[k].title, name, k);
  // 이름을 정하지 않은 파트는 앱의 목차 이름 그대로(화면이 tocName 으로 채운다)
  for (const k of ['why']) assert.equal(Q[k].title, '', k);
  // 앱의 목차 이름(실제 덱)은 아직 옛 이름이다
  assert.deepEqual(['overview', 'ua', 'needs', 'value', 'sol', 'pspec', 'case'].map(k => Q[k].name), ['Overview', '당사의 이해', 'AI {업종}', '공간별 가치 제안', '{업종} 솔루션', 'Spec', '도입사례']);
});

test("목록 2 — 'AI {업종}'은 '가치 제안 (VP)'", () => {
  assert.equal(Q.needs.title, '가치 제안 (VP)');
  assert.deepEqual(Q.needs.slots.map(x => x.fam), ['L_VS_DIV', 'L_VS_NEEDS', 'L_VS_CORE_1', 'L_VS_CORE_2', 'L_VS_CORE_3']);
  assert.equal(Q.needs.kind, 'flow');
});

test('목록 3 — 사례 장은 장 수를 한정하지 않는다', () => {
  for (const k of ['case']) { // 유관사례(pcase)는 쓰는 구성이 없어 목록에서 빠졌다 — 제품 제안서 = 표준 제안서에서 Overview · 업종 솔루션 · 도입사례만 뺀 것(2026-11-16)
    const s = Q[k].slots.find(x => x.fam === 'L_VS_CASE');
    assert.deepEqual(s.n, { min: 1, max: null }, k);
    assert.equal(s.by, '사례 수');
    assert.equal(Q[k].kind, 'repeat');
    assert.deepEqual(Q[k].sheets, { min: 2, max: null });
  }
});

test('목록 4 — 서비스 제안(2026-11-17): 고른 서비스에 따라 갈래 — 삼성케어플러스 SAC · 비즈니스 · 구독 상품(고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제)', () => {
  const s = Q.svc;
  for (const k of ['subs', 'subpkg', 'subcare', 'subterm', 'subx', 'subscription']) assert.equal(Q[k], undefined, k);
  assert.equal(s.toc, 'svc'); assert.equal(s.title, '서비스 제안'); assert.equal(s.kind, 'branch');
  assert.deepEqual(s.tpls, ['basic']); // 상세 제안은 서비스 제안 대신 고객/공간 시나리오
  assert.deepEqual(s.slots.map(x => x.fam), ['L_VS_DIV', 'L_TOC_SVC_SAC', 'L_TOC_SVC_MOBILE', 'L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_COMPARE', 'L_SUB_PKG', 'L_SUB_CARE4', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3']);
  assert.deepEqual(s.slots.slice(1).map(x => x.role), ['삼성케어플러스 SAC', '삼성케어플러스 비즈니스', '고민', '효과', '비교', '제품 묶음', '케어 1', '케어 2', '구독 조건', '결제']);
  assert.deepEqual(s.slots.map(x => x.branch), [null, 'sac', 'mobile', 'sub', 'sub', 'sub', 'sub', 'sub', 'sub', 'sub', 'sub']);
  assert.deepEqual(s.branches.map(b => [b.id, b.label, b.steps]), [['sac', '삼성케어플러스 SAC', [2]], ['mobile', '삼성케어플러스 비즈니스', [3]], ['sub', '구독 상품 제안', [4, 5, 6, 7, 8, 9, 10, 11]]]);
  assert.deepEqual(s.sheets, { min: 2, max: 11 }, '갈래 하나(케어 한 장)부터 셋 모두까지');
  assert.deepEqual(s.slots.filter(x => x.zero).map(x => x.fam), ['L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3']); // 숫자 00 · 직접 입력(케어 2 · 구독 조건 · 결제)
  for (const f of ['L_SUB_ITEMS', 'L_SUB_CAREOPT', 'L_SUB_PROMO', 'L_SUB_FLOW', 'L_SUB_ONE']) assert.ok(!s.slots.some(x => x.fs.includes(f)), f);
  assert.deepEqual(s.slots.filter(x => x.photos).map(x => [x.fam, x.photos]), [['L_SUB_VALUE3', { 1: { from: 'L_SUB_IND4', index: 3 } }], ['L_SUB_PKG', { 0: { from: 'L_SUB_IND4', index: 2 } }]]);
  assert.ok(M.ORDERED.has('branch') && M.KIND.branch.label);
});

test('목록 — 고객/공간 시나리오(2026-11-17 · 2차): 간지 → 조감도 → 활용 맵(공간 2–10곳 시트) → 공간별 시나리오(공간 3곳 · 2곳 시트) — 실제 덱도 이 장', () => {
  const s = Q.value;
  assert.deepEqual(s.tpls.includes('detail'), true);
  assert.deepEqual(s.slots.map(x => x.fam), ['L_VS_DIV', 'L_VS_BIRD', 'L_TOC_SCN_MAP', 'L_TOC_SCN_S']);
  const map = s.slots[2]; const one = s.slots[3];
  assert.ok(map.routed && one.routed && s.scenario && !s.routed, '실제 덱 반영 전 표시는 붙지 않는다');
  assert.deepEqual(map.variants.map(v => v.f), ['L_TOC_SCN_MAP2', 'L_TOC_SCN_MAP3', 'L_TOC_SCN_MAP4', 'L_TOC_SCN_MAP5', 'L_TOC_SCN_MAP6', 'L_TOC_SCN_MAP7', 'L_TOC_SCN_MAP8', 'L_TOC_SCN_MAP9', 'L_TOC_SCN_MAP10']);
  assert.deepEqual(one.variants.map(v => v.f), ['L_TOC_SCN_S3', 'L_TOC_SCN_S2']); // 한 공간만 쓰는 장은 없다
  assert.ok([...map.variants, ...one.variants].every(v => v.live), '실제 덱이 쓰는 시트');
  assert.equal(one.by, '묶음의 공간 수'); assert.equal(one.times, '공간 묶음 수'); assert.equal(one.n.min, 1); assert.equal(one.n.max, 4); // 업종 공간 3–10곳 → 장 1–4(10곳 = 3 + 3 + 2 + 2)
  assert.deepEqual(map.route.rows.map(r => [r.n, r.sheets]), [[1, 0], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 2], [12, 2]]);
  assert.deepEqual(one.route.rows.map(r => r.label), ['없음', '2', '3', '2 + 2', '3 + 2', '3 + 3', '3 + 2 + 2', '3 + 3 + 2', '3 + 3 + 3', '3 + 3 + 2 + 2']);
  for (const v of [...map.variants, ...one.variants]) assert.ok(M.toc.TOCS && v.f, v.f);
});

test('목록 — 손대지 않은 파트는 잰 값 그대로', () => {
  for (const k of ['value', 'sol', 'why']) { // overview(업종별 고정 시트) · ua(업종 묶음별) · pspec(사양 줄 수 시트)는 정의가 얹혀 빠졌다
    assert.equal(Q[k].kind, P[k].kind, k);
    assert.deepEqual(Q[k].slots.map(x => [x.fam, x.n.min, x.n.max]), P[k].slots.map(x => [x.fam, x.n.min, x.n.max]), k);
  }
  assert.equal(Q.why.kind, 'fixed');
  // 당사의 이해 — 목록에서는 업종 묶음마다 항목 · 장이 다른 파트(sector). 장은 화면이 고른 묶음의 것으로 바꾼다(admin/tests/ua-sectors.mjs). 잰 값은 그대로 '구성마다 다름'
  assert.equal(Q.ua.kind, 'sector'); assert.ok(Q.ua.sector); assert.equal(P.ua.kind, 'template');
});

/* ---------- 공간별 제안 — 제품 수에 따라 「공간별 대표 제품」 시트를 골라 쓴다 (사용자 지시 2026-11-16) ----------
   3개 이하 한 장에 제품 하나 · 4개 2/2 · 5개 3/2 · 6개 3/3 · 7개 4/3 · 8개 4/4 · 그 이상은 조감도도 나눠서 다시 시작.
   목록은 라우팅과 상관없이 시트 4종(제품 1 · 2 · 3 · 4개 장)을 모두 보여 준다. 잰 흐름(P)은 그대로 — 실제 덱은 아직 제품마다 한 장. */
test('목록 5 — 공간별 대표 제품: 시트 4종 · 제품 수 → 장 나눔 · 8개를 넘으면 조감도부터 다시', () => {
  const s = Q.space;
  assert.equal(s.routed, true);
  assert.equal(s.kind, 'repeat');
  assert.deepEqual(s.slots.map(x => x.fam), ['L_VS_DIV', 'L_VS_BIRD', 'L_VS_SPACE', 'L_VS_MAP']); // 자리 · 순서는 잰 값 그대로
  assert.deepEqual(s.slots.map(x => x.step), [1, 2, 3, 4]);
  const sp = s.slots[2];
  assert.equal(sp.routed, true);
  assert.equal(sp.f, 'L_VS_SPACE'); // 잰 장은 그대로 둔다(실제 덱의 장)
  assert.deepEqual(sp.products, P.space.slots[2].n); // 덱에서 잰 제품 수
  assert.deepEqual(sp.variants.map(v => [v.f, v.per]), [['L_VS_SPACE_1', 1], ['L_VS_SPACE_2', 2], ['L_VS_SPACE_3', 3], ['L_VS_SPACE_4', 4]]);
  assert.deepEqual(sp.variants.map(v => v.used), [[1, 2, 3], [4, 5], [5, 6, 7], [7, 8]]);
  assert.match(sp.variants[0].when, /제품 3개 이하 — 제품마다 한 장/);
  assert.equal(sp.variants[1].when, '제품 4개(2/2) · 5개(3/2)');
  assert.equal(sp.variants[2].when, '제품 5개(3/2) · 6개(3/3) · 7개(4/3)');
  assert.equal(sp.variants[3].when, '제품 7개(4/3) · 8개(4/4)');
  assert.match(sp.variants[0].holds, /key message · 특징 2 · 주요 스펙/);
  assert.match(sp.variants[1].holds, /특징 2 · 스펙 3.*key message 없음/);
  for (const v of sp.variants.slice(2)) { assert.match(v.holds, /특징 2까지만/); assert.doesNotMatch(v.holds, /스펙/); }
  for (const v of sp.variants) assert.equal(M.familyOf(v.f), 'L_VS_SPACE');
  // 나눔 표
  assert.deepEqual(s.route.map(r => [r.n, r.label]), [[1, '1'], [2, '1/1'], [3, '1/1/1'], [4, '2/2'], [5, '3/2'], [6, '3/3'], [7, '4/3'], [8, '4/4'], [9, '3/2 + 2/2'], [10, '3/2 + 3/2']]);
  assert.deepEqual(s.route.map(r => r.birds), [1, 1, 1, 1, 1, 1, 1, 1, 2, 2]);
  assert.deepEqual(M.spaceRouteTable(), s.route);
  assert.deepEqual(sp.route.rows, s.route); assert.equal(sp.route.title, '제품 수 → 장 나눔'); assert.match(sp.route.more, /9개부터는 조감도도 나눠 다시 시작/);
  assert.deepEqual(sp.variants.map(v => [v.badge, v.name, v.live]), [['제품 1개', '제품 1개 장', false], ['제품 2개', '제품 2개 장', false], ['제품 3개', '제품 3개 장', false], ['제품 4개', '제품 4개 장', false]]);
  // 덱에서 잰 제품 수(3–10) 범위에서 — 제품 장 2–4장 · 조감도 1–2장 · Map 1–2장 · 파트 5–9장(9 · 10개는 묶음 둘: 간지 + [조감도 + 제품 장 2 + Map] × 2)
  if (sp.products.min === 3 && sp.products.max === 10) {
    assert.deepEqual(sp.n, { min: 2, max: 4 });
    assert.deepEqual(s.slots[1].n, { min: 1, max: 2 });
    assert.deepEqual(s.slots[3].n, { min: 1, max: 2 });
    assert.deepEqual(s.sheets, { min: 5, max: 9 });
  }
  assert.equal(s.slots[1].split, 8);
  assert.match(s.slots[1].count, /8개를 넘으면 묶음마다 1장/);
  // 잰 흐름은 건드리지 않는다
  assert.equal(P.space.routed, undefined);
  assert.equal(P.space.slots[2].variants, undefined);
  // Value Prop 상세의 공간별 제품 장(다른 파트)은 그대로
  assert.equal(P.vpd, undefined); // Value Prop 상세(공간별 제품 장을 쓰던 다른 파트)는 구성에서 빠졌다 — 공간별 대표 제품 장을 쓰는 파트는 공간별 제안뿐
});

/* ---------- 내용 고정은 장마다 (사용자 지시 2026-11-16: "파트 내에서 부분적으로 내용이 고정된 경우도 시트에 표식 · 다른 파트도 마찬가지") ---------- */
test('내용 고정은 장마다 — 파트가 완전 고정이 아니어도 내용이 같은 장은 고정으로 잰다', () => {
  // 잰 값: Why Samsung 의 장 전부(간지 제외), 구독의 비교 · 케어 1 · 케어 2 …
  assert.deepEqual(P.why.slots.map(x => x.fixed), [false, true, true, true, true, true, true]);
  assert.equal(P.subx.kind, 'flow');
  // 구독 솔루션 — 비교 · 케어 1 · 케어 2(숫자를 00 으로 둔 뒤로 모든 업종이 같다)는 잰 값으로 고정. 구독 조건은 사진, 결제는 납부안 순서가 업종마다 달라 잰 값으로는 고정이 아니다
  assert.deepEqual(P.subx.slots.map(x => [x.fam, x.fixed]), [['L_VS_DIV', false], ['L_SUB_PAIN', false], ['L_SUB_VALUE3', false], ['L_SUB_COMPARE', true], ['L_SUB_PKG', false],
    ['L_SUB_CARE4', true], ['L_SUB_BLUEPASS', true], ['L_SUB_TERMS', false], ['L_SUB_PAY3', false]]);
  for (const k of ['needs', 'space', 'sol', 'case', 'overview', 'ua', 'pspec']) assert.ok(P[k].slots.every(x => !x.fixed), k);
  // 완전 고정 = 간지를 뺀 모든 장이 고정이고 장 수가 같다
  for (const p of flows) assert.equal(p.kind === 'fixed', p.slots.every(x => x.n.min === x.n.max) && p.slots.filter(x => x.fam !== 'L_VS_DIV').every(x => x.fixed) && new Set(['fixed', 'flow', 'repeat']).has(p.kind), p.key);
});

test('목록 — 서비스 제안의 구독 갈래: 비교 · 케어 1 · 케어 2 · 구독 조건 · 결제는 내용 고정(숫자 00 인 장은 전체 내용도 고정), 다른 파트도 같은 규칙', () => {
  const s = Q.svc;
  assert.equal(s.kind, 'branch'); // 파트는 완전 고정이 아니다 — 고민 · 효과 · 제품 묶음은 업종마다 바뀐다
  assert.deepEqual(s.slots.filter(x => x.fixed).map(x => [x.role, x.fixedBy]), [['삼성케어플러스 SAC', 'measured'], ['삼성케어플러스 비즈니스', 'measured'], ['비교', 'measured'], ['케어 1', 'measured'], ['케어 2', 'measured'], ['구독 조건', 'defined'], ['결제', 'defined']]);
  assert.ok(s.slots.filter(x => x.zero).every(x => x.fixed), '숫자 00 인 장은 내용 고정');
  assert.deepEqual(s.slots.filter(x => !x.fixed).map(x => x.role || x.fam), ['L_VS_DIV', '고민', '효과', '제품 묶음']);
  assert.equal(M.PART_CATALOG.sheets.subx.find(x => x.role === '비교').fixed, true);
  // 지금 목록에서 고정 장이 있는 파트는 Why Samsung(전부)과 서비스 제안(삼성케어플러스 두 장 + 구독 갈래의 일부)
  assert.deepEqual(C.parts.filter(p => p.slots.some(x => x.fixed)).map(p => p.key), ['why', 'svc']);
  assert.deepEqual(Q.svc.slots.map(x => [x.fam, !!x.fixed]), [['L_VS_DIV', false], ['L_TOC_SVC_SAC', true], ['L_TOC_SVC_MOBILE', true], ['L_SUB_PAIN', false], ['L_SUB_VALUE3', false], ['L_SUB_COMPARE', true],
    ['L_SUB_PKG', false], ['L_SUB_CARE4', true], ['L_SUB_BLUEPASS', true], ['L_SUB_TERMS', true], ['L_SUB_PAY3', true]]);
});

/* ---------- 공간별 제안 — 업종 Map 도 공간 수에 맞는 시트를 골라 쓴다 (사용자 지시 2026-11-16) ----------
   공간 2곳부터만 다루고 2곳에서 최대 8곳까지: 시트 7종(L_VS_MAP_2 … 8). 1곳이면 Map 을 두지 않고, 8곳을 넘으면 조감도 묶음마다 한 장.
   목록은 어느 시트를 쓰든 7종을 모두 보여 준다. 잰 흐름(P)은 그대로 — 실제 덱은 공간 3~10곳에 L_VS_MAP_3 … 10 한 장. */
test('목록 6 — 업종 Map: 공간 2~8곳 시트 7종 · 공간 수 → Map 시트 · 1곳은 없음 · 8곳을 넘으면 묶음마다 한 장', () => {
  const s = Q.space; const mp = s.slots[3];
  assert.equal(mp.fam, 'L_VS_MAP');
  assert.equal(mp.routed, true);
  assert.equal(mp.by, '공간 수');
  assert.equal(M.familyOf(mp.f), 'L_VS_MAP'); // 잰 장은 그대로 둔다
  assert.deepEqual(mp.fs, P.space.slots[3].fs);
  assert.deepEqual(mp.variants.map(v => [v.f, v.per]), [2, 3, 4, 5, 6, 7, 8].map(n => ['L_VS_MAP_' + n, n]));
  assert.deepEqual(mp.variants.map(v => v.rows), [[2], [3], [4], [3, 2], [3, 3], [4, 3], [4, 4]]); // 4곳 이하는 한 줄, 5곳부터 두 줄
  assert.deepEqual(mp.variants.map(v => v.used), [[2], [3], [4], [5], [6], [7], [8]]);
  assert.deepEqual(mp.variants.map(v => v.badge), ['공간 2곳', '공간 3곳', '공간 4곳', '공간 5곳', '공간 6곳', '공간 7곳', '공간 8곳']);
  for (const v of mp.variants.slice(0, 3)) assert.match(v.holds, /^한 줄 \d칸 — .*하는 일/);
  for (const v of mp.variants.slice(3)) { assert.match(v.holds, /^두 줄 \d \+ \d칸/); assert.doesNotMatch(v.holds, /하는 일/); }
  // 공간마다 제품을 하나 이상 — 제품 수에 따라 카드 크기 · 배치가 달라지는 장(사용자 지시 2026-11-16). 칸 하나에 놓는 카드 수 상한이 시트마다 정해진다
  assert.deepEqual(mp.variants.map(v => [v.cap.min, v.cap.max]), [[9, 9], [9, 9], [8, 8], [6, 9], [6, 6], [4, 6], [4, 4]]);
  assert.match(mp.variants[0].holds, /칸마다 제품 카드 최대 9개/); assert.match(mp.variants[3].holds, /칸마다 제품 카드 최대 6–9개/); assert.match(mp.variants[6].holds, /칸마다 제품 카드 최대 4개/);
  for (const v of mp.variants) { assert.match(v.cards, /제품 수에 따라 크기 · 배치가 달라짐/); assert.match(v.cards, /넘치면 '외 N종'/); }
  // 지금 덱의 Map(공간마다 대표 제품 컷 하나 + 제품 목록 글)과는 다른 장이다 — 모두 반영 전
  assert.ok(mp.variants.every(v => v.live === false && /반영 전/.test(v.deck)));
  assert.equal(M.familyOf('L_VS_MAP_5_4-2-3x-1-2'), 'L_VS_MAP'); // 조립한 장 이름(칸마다 카드 수)도 같은 자리
  // 공간 수 → Map 시트 표
  assert.deepEqual(mp.route.rows, M.spaceMapTable());
  assert.deepEqual(mp.route.rows.map(r => [r.n, r.label, r.sheets]), [[1, '없음', 0], [2, '2', 1], [3, '3', 1], [4, '4', 1], [5, '3/2', 1], [6, '3/3', 1], [7, '4/3', 1], [8, '4/4', 1], [9, '3/2 + 4', 2], [10, '3/2 + 3/2', 2]]);
  assert.deepEqual(mp.route.rows.map(r => r.pers), [[], [2], [3], [4], [5], [6], [7], [8], [5, 4], [5]]);
  assert.equal(mp.route.title, '공간 수 → Map 시트');
  assert.match(mp.route.more, /9곳부터는 조감도 묶음마다 한 장 · 1곳은 Map 없음/);
  assert.match(mp.count, /8곳을 넘으면 묶음마다 1장/);
  // 잰 흐름은 건드리지 않는다
  assert.equal(P.space.slots[3].routed, undefined);
  assert.deepEqual(P.space.slots[3].n, { min: 1, max: 1 });
});

/* ---------- 제품 스펙(Spec) — 제품마다 한 장 · 사양 줄 수에 맞는 시트 · 대표 스펙 3칸 없음 (사용자 지시 2026-11-16) ---------- */
const SPEC = await (async () => {
  const b = await build({ stdin: { contents: `export * from './app/web/src/domain/templates/spec_sheet_plan.js';\nexport { default as SHEETS } from './admin/web/src/spec-sheets.json';`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
  return import('data:text/javascript;base64,' + Buffer.from(b.outputFiles[0].text).toString('base64'));
})();

test('제품 스펙 규칙 — 사양 줄 수 → 시트(12 · 24 · 36줄) · 열 나눔 · 36줄을 넘으면 36줄만 · 장 수 = 간지 + 제품 수', () => {
  assert.deepEqual(SPEC.SPEC_SHEET.map(t => [t.cap, t.cols, t.per]), [[12, 1, 12], [24, 2, 12], [36, 2, 18]]);
  for (const t of SPEC.SPEC_SHEET) assert.equal(t.cols * t.per, t.cap);
  assert.equal(SPEC.SPEC_MAX, 36);
  const pick = n => SPEC.specSheetFor(n);
  assert.equal(pick(1).f, 'L_TOC_PSPEC_R12'); assert.equal(pick(12).f, 'L_TOC_PSPEC_R12');
  assert.equal(pick(13).f, 'L_TOC_PSPEC_R24'); assert.equal(pick(24).f, 'L_TOC_PSPEC_R24');
  assert.equal(pick(25).f, 'L_TOC_PSPEC_R36'); assert.equal(pick(36).f, 'L_TOC_PSPEC_R36');
  assert.deepEqual([pick(36).shown, pick(36).cut], [36, 0]);
  assert.deepEqual([pick(103).f, pick(103).shown, pick(103).cut], ['L_TOC_PSPEC_R36', 36, 67]); // 장을 늘리지 않는다
  assert.throws(() => pick(0), RangeError);
  assert.deepEqual(SPEC.specColumns(10), [10]); assert.deepEqual(SPEC.specColumns(19), [10, 9]); assert.deepEqual(SPEC.specColumns(34), [17, 17]); assert.deepEqual(SPEC.specColumns(50), [18, 18]);
  for (let n = 1; n <= 60; n++) { const c = SPEC.specColumns(n); const t = pick(n); assert.equal(c.reduce((a, b) => a + b, 0), t.shown); assert.ok(c.every(x => x <= t.per), n + ''); }
  assert.deepEqual(SPEC.specSheetRanges().map(t => [t.from, t.to]), [[1, 12], [13, 24], [25, 36]]);
  assert.deepEqual([SPEC.specPartSheets(1), SPEC.specPartSheets(5)], [2, 6]);
});

test('제품 스펙 시트(spec-sheets.json) — 규칙과 같은 3종 · 대표 스펙 칸(kv · kl) 없음 · 예시 사양이 그 시트의 줄 수 범위 · 줄 수만큼 칸', () => {
  const sheets = SPEC.SHEETS.sheets;
  assert.deepEqual(sheets.map(x => [x.f, x.per, x.cols]), SPEC.SPEC_SHEET.map(t => [SPEC.specSheetId(t.cap), t.cap, t.cols]));
  for (const x of sheets) {
    const names = Object.keys(x.slots.t);
    assert.ok(!names.some(n => /^k[vl]\d$/.test(n)), x.f + ' 대표 스펙 칸이 없어야 한다: ' + names.join());
    assert.equal(SPEC.specSheetFor(x.rows).f, x.f, x.f + ' 예시 ' + x.rows + '줄');
    assert.equal(names.filter(n => /^sl\d+$/.test(n)).length, x.rows); assert.equal(names.filter(n => /^sv\d+$/.test(n)).length, x.rows);
    for (const n of ['eb', 'title', 'nm', 'md', 'foot', 'conf']) assert.ok(names.includes(n), x.f + ' ' + n);
    assert.deepEqual(Object.keys(x.slots.img), ['img']);
    assert.match(x.html, /^<!doctype html>/); assert.doesNotMatch(x.html, /<script|src="(?!@img\d+@)/);
  }
  assert.ok(new Set(sheets.map(x => x.rows)).size === 3); // 줄 수가 서로 다른 실제 제품 셋
});

test('목록 — Spec: 간지 → Spec × 제품 수(장 수 제한 없음) · 사양 줄 수에 따라 시트 3종 · 실제 덱 반영 전', () => {
  const p = Q.pspec;
  assert.equal(p.kind, 'repeat'); assert.equal(p.spec, true);
  assert.doesNotMatch(p.goal, /핵심 숫자/); assert.match(p.goal, /제품마다 한 장/);
  assert.deepEqual(p.sheets, { min: 2, max: null });
  assert.deepEqual(p.slots.map(x => x.fam), ['L_VS_DIV', 'L_TOC_PSPEC']);
  const s = p.slots[1];
  assert.equal(s.routed, true); assert.equal(s.sheetsOf, 'spec');
  assert.deepEqual([s.times, s.by], ['제품 수', '사양 줄 수']);
  assert.deepEqual(s.n, { min: 1, max: null });
  assert.deepEqual(s.variants.map(v => [v.f, v.per, v.name, v.when, v.live]), [['L_TOC_PSPEC_R12', 12, '1열', '사양 1–12줄', false], ['L_TOC_PSPEC_R24', 24, '2열', '사양 13–24줄', false], ['L_TOC_PSPEC_R36', 36, '2열 · 촘촘하게', '사양 25–36줄', false]]);
  assert.ok(s.variants.every(v => /대표 스펙 칸 없음/.test(v.holds)));
  assert.deepEqual(s.route.rows.map(r => [r.n, r.label, r.pers]), [['1–12', '1열', [12]], ['13–24', '2열', [24]], ['25–36', '2열 · 촘촘하게', [36]]]);
  assert.match(s.route.more, /36줄을 넘으면/);
  assert.equal(P.pspec.kind, 'flow'); // 잰 값(지금 덱)은 숫자 3 + 사양 8줄 한 장
});
