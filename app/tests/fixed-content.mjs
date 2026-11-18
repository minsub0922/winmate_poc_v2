// 내용 고정 — 관리자 「전체 파트」의 고정 규칙이 실제 제안서에서도 지켜지는지(사용자 지시 2026-11-17: "고정 = AI가 채우지 않는다 · 사람 편집은 가능")
//   node --test app/tests/fixed-content.mjs
// 목록 app/web/src/domain/templates/fixed_content.json 을 앱(장마다 채우기 · 직접 넣은 장의 방향 추론 · 요소별 AI 채우기)과
// 레이아웃 자동 구성(composer auto.py — app/tests/test_compose_auto.py FixedContentTest)이 함께 쓴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { markLayoutChanges, isFixedContentLayout, queueLayout } from '../web/src/domain/slides/context-policy.js';
import { isFixedSheet, FIXED_PARTS } from '../web/src/domain/templates/fixed_content.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('관리자 「전체 파트」의 고정 — 완전 고정 · 업종별 고정 파트와 자물쇠 장은 모두 이 목록에 있다', async () => {
  const require = createRequire(root + 'app/web/package.json');
  const { build } = require('esbuild');
  const entry = `export * as toc from './app/web/src/domain/templates/toc_templates.js';
export { FILLS, FILL_CUSTOMER } from './app/web/src/domain/templates/scenario_fills.js';
export { default as SWAPS } from './app/web/src/domain/templates/scenario_image_swaps.json';
export * from './admin/web/src/part-flows.js';`;
  const built = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
  const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  await M.toc.loadTocContent();
  const C = M.curateParts(M.partFlows(M.toc, { FILLS: M.FILLS, FILL_CUSTOMER: M.FILL_CUSTOMER, SWAPS: M.SWAPS }));
  const toc = (p) => (M.PART_CATALOG.keys && Object.entries(M.PART_CATALOG.keys).find(([, v]) => v === p.key)?.[0]) || p.key;
  // 서비스 제안(2026-11-17 — 고른 서비스에 따라 갈래, kind 'branch')도 통째로 템플릿 그대로 쓰는 파트다(삼성케어플러스 장 · 구독 장)
  const whole = (p) => p.kind === 'fixed' || p.kind === 'industry' || p.kind === 'branch';
  const fixedParts = C.parts.filter(whole).map(toc);
  assert.deepEqual(fixedParts.sort(), [...FIXED_PARTS].sort(), '완전 고정 · 업종별 고정 · 서비스 갈래 파트 = 내용 고정 파트');
  const locked = C.parts.flatMap((p) => (p.slots || []).filter((s) => s.fixed).map((s) => s.f));
  assert.ok(locked.length >= 10, locked.join(' '));
  for (const f of locked) assert.ok(isFixedSheet(f), f + ' — 관리자 목록에 자물쇠가 있는 장은 fixed_content.json 에도');
  // 업종별 고정 파트(제안 개요)의 내용 장도
  for (const p of C.parts.filter((x) => x.kind === 'industry')) for (const s of p.slots || []) if (!/^L_VS_DIV_R\d$/.test(s.f)) assert.ok(isFixedSheet(s.f), s.f);
  // 자물쇠가 없는 장은 AI가 쓴다
  for (const p of C.parts.filter((x) => !whole(x))) {
    for (const s of p.slots || []) if (!s.fixed) assert.equal(isFixedSheet(s.f), false, p.key + ' ' + s.f + ' 은 자물쇠가 없다');
  }
});

const sheet = (f, extra = {}) => ({ uid: 'u-' + f, f, ov: { t: {}, img: {} }, ...extra });
const proposal = (parts) => ({ id: 'p1', req: '카페 매장 메뉴보드', ctx: { products: ['qm55c'], solutions: [], cases: [] }, parts });

test('제안서 — 내용 고정 장은 넣어도 · 맥락이 바뀌어도 채우기 대기로 가지 않는다(그대로 두기) · 고정이 아닌 장은 채운다', () => {
  const ov = { id: 'a', type: 'overview', name: '제안 개요', agent: { toc: 'overview' }, layouts: [sheet('L_VS_DIV_R1'), sheet('L_VS_DSS')] };
  const sub = { id: 'b', type: 'solution', name: '구독 상품 제안', agent: { toc: 'subx' }, layouts: ['L_SUB_PAIN', 'L_SUB_COMPARE', 'L_SUB_PKG4', 'L_SUB_CARE4', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3'].map((f) => sheet(f)) };
  const svc = { id: 'c', type: 'solution', name: '서비스', agent: { toc: 'svc' }, layouts: [sheet('L_TOC_SVC_SAC'), sheet('L_TOC_SVC_MOBILE')] };
  const free = { id: 'd', type: 'free', name: '직접 넣은 목차', layouts: [sheet('L_VS_DSS'), sheet('L_VS_NEEDS')] };
  const d = proposal([ov, sub, svc, free]);
  markLayoutChanges(d, null);
  const phase = (part) => part.layouts.map((x) => [x.f, x.adaptation.phase]);
  assert.deepEqual(phase(ov), [['L_VS_DIV_R1', 'retained'], ['L_VS_DSS', 'retained']], '제안 개요는 파트 전체가 고정');
  assert.deepEqual(phase(sub), [['L_SUB_PAIN', 'queued'], ['L_SUB_COMPARE', 'retained'], ['L_SUB_PKG4', 'queued'], ['L_SUB_CARE4', 'retained'], ['L_SUB_BLUEPASS', 'retained'], ['L_SUB_TERMS', 'retained'], ['L_SUB_PAY3', 'retained']], '구독은 자물쇠 장만');
  assert.deepEqual(phase(svc), [['L_TOC_SVC_SAC', 'retained'], ['L_TOC_SVC_MOBILE', 'retained']]);
  assert.deepEqual(phase(free), [['L_VS_DSS', 'retained'], ['L_VS_NEEDS', 'queued']], '개요 DSS 장은 어느 목차에 넣어도 고정');
  // 사람이 고친 내용은 그대로 — 고쳐도 AI가 다시 쓰지 않는다
  const before = structuredClone(d);
  d.parts[0].layouts[1].ov.t['4'] = '사람이 고친 문구';
  d.req = '바뀐 요구사항';
  markLayoutChanges(d, before);
  assert.equal(d.parts[0].layouts[1].ov.t['4'], '사람이 고친 문구');
  assert.equal(d.parts[0].layouts[1].adaptation.phase, 'retained');
  assert.equal(d.parts[0].layouts[1].adaptation.origin, 'fixed');
  // 다시 시도 · 방향 확인으로 채우기에 넘겨도 고정 장은 그대로
  const x = sheet('L_SUB_TERMS'); queueLayout(x, 'k', 'brief');
  assert.equal(x.adaptation.phase, 'retained');
  assert.equal(isFixedContentLayout(sheet('L_VS_NEEDS'), ov), true, '고정 파트에 사람이 넣은 장도 AI가 쓰지 않는다');
  assert.equal(isFixedContentLayout(sheet('L_VS_NEEDS'), sub), false);
});
