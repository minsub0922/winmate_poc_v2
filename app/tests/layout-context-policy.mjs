import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutContextChanged, layoutContextKey, markLayoutChanges, queueLayout, isFixedContentLayout, sheetShowsSample } from '../web/src/domain/slides/context-policy.js';

const fixture = () => {
  const p = { title: '제안', customer: '기존 고객', ind: null, req: { free: [] }, ctx: { products: [], solutions: [], cases: [] },
    parts: [{ id: 'part', type: 'overview', name: '개요', items: [], layouts: [] }] };
  p.parts[0].layouts.push({ uid: 'sheet', f: 'template', status: 'partial', ov: { t: {}, img: {} }, ev: {},
    adaptation: { phase: 'retained', key: layoutContextKey(p, p.parts[0]), needsReview: true, missing: ['정보 확인'] } });
  return p;
};
const changed = p => layoutContextChanged(p, p.parts[0], p.parts[0].layouts[0]);

test('missing information, a history review flag and errors alone do not count as a context change', () => {
  const p = fixture();
  assert.equal(changed(p), false);
  p.parts[0].layouts[0].adaptation.phase = 'error';
  assert.equal(changed(p), false);
  delete p.parts[0].layouts[0].adaptation;
  assert.equal(changed(p), false);
});

test('a context change remains detectable through queued work, failure and manual retry', () => {
  const original = fixture(), p = structuredClone(original);
  const baseline = p.parts[0].layouts[0].adaptation.key;
  p.customer = '변경된 고객'; markLayoutChanges(p, original);
  const x = p.parts[0].layouts[0];
  assert.equal(x.adaptation.phase, 'queued');
  assert.equal(x.adaptation.appliedKey, baseline);
  assert.equal(changed(p), true);
  x.adaptation.phase = 'error';
  queueLayout(x, layoutContextKey(p, p.parts[0]), 'retry');
  assert.equal(x.adaptation.appliedKey, baseline);
  assert.equal(changed(p), true);
  x.adaptation = { ...x.adaptation, phase: 'ready', appliedKey: x.adaptation.key };
  assert.equal(changed(p), false);
});

test('editing layout contents alone does not expose the current-context refill button', () => {
  const original = fixture(), p = structuredClone(original);
  p.parts[0].layouts[0].ov.t[0] = '직접 편집'; markLayoutChanges(p, original);
  assert.equal(p.parts[0].layouts[0].adaptation.phase, 'queued');
  assert.equal(changed(p), false);
});

test('part edits count as context changes and reverting to the applied context clears the difference', () => {
  const original = fixture(), p = structuredClone(original);
  p.parts[0].items = ['새로운 목차 내용']; markLayoutChanges(p, original);
  assert.equal(changed(p), true);
  const intermediate = structuredClone(p);
  p.parts[0].items = []; markLayoutChanges(p, intermediate);
  assert.equal(changed(p), false);
});

test('sheets written by automatic deck composition are inserted as final; a later context change re-queues them like any other sheet', () => {
  const original = fixture(), p = structuredClone(original);
  p.parts[0].layouts.push({ uid: 'composed', f: 'template2', status: 'done', ov: { t: { 1: '이 고객에 맞춰 쓴 문구' }, img: {} }, adaptation: { origin: 'compose', phase: 'ready' } });
  p.parts[0].layouts.push({ uid: 'byhand', f: 'template3', status: 'partial', ov: { t: {}, img: {} } });
  markLayoutChanges(p, original);
  const [, composed, byhand] = p.parts[0].layouts;
  assert.equal(composed.adaptation.phase, 'ready');
  assert.equal(composed.adaptation.origin, 'compose');
  assert.equal(composed.adaptation.key, layoutContextKey(p, p.parts[0]));
  assert.equal(composed.status, 'done');
  assert.equal(byhand.adaptation.phase, 'queued'); // a sheet added by hand is still personalised
  const later = structuredClone(p); later.customer = '바뀐 고객'; markLayoutChanges(later, p);
  assert.equal(later.parts[0].layouts[1].adaptation.phase, 'queued');
});

// ---- 내용이 고정인 장: Why Samsung · 도입사례(내용이 들어 있는 장)는 어떤 경우에도 AI 채우기 대기열에 들어가지 않는다
const fixedFixture = () => {
  const p = { title: '제안', customer: '기존 고객', ind: 'HT', req: { free: [] }, ctx: { products: ['qm55c'], solutions: [], cases: [] },
    parts: [{ id: 'why', type: 'why', name: 'Why Samsung', items: [], layouts: [] }, { id: 'case', type: 'case', name: '도입사례', items: [], layouts: [] }] };
  const key = (part) => layoutContextKey(p, part);
  p.parts[0].layouts.push({ uid: 'w1', f: 'L_VS_WHY_1', status: 'done', ov: { t: { 1: 'Samsung Business' }, img: {} }, adaptation: { version: 3, origin: 'compose', phase: 'ready', key: key(p.parts[0]), appliedKey: key(p.parts[0]) } });
  p.parts[0].layouts.push({ uid: 'end', f: 'L_VS_END', status: 'done', ov: { t: {}, img: {} }, adaptation: { version: 3, origin: 'compose', phase: 'ready', key: key(p.parts[0]), appliedKey: key(p.parts[0]) } });
  p.parts[1].layouts.push({ uid: 'c1', f: 'L_VS_CASE', status: 'done', ov: { t: { 1: '인스파이어 엔터테인먼트 리조트', 4: '스마트 LED 사이니지(오로라)' }, img: { 0: { src: 'img/media/g0.json#810' } } },
    adaptation: { version: 3, origin: 'compose', phase: 'ready', key: key(p.parts[1]), appliedKey: key(p.parts[1]) } });
  p.parts[1].layouts.push({ uid: 'x1', f: 'L_VS_SPACE', status: 'done', ov: { t: { 1: '로비' }, img: {} }, adaptation: { version: 3, origin: 'compose', phase: 'ready', key: key(p.parts[1]), appliedKey: key(p.parts[1]) } });
  return p;
};
const sheet = (p, uid) => p.parts.flatMap((s) => s.layouts).find((x) => x.uid === uid);

test('Why Samsung and filled case sheets are fixed content; an empty case layout and other sheets are not', () => {
  assert.equal(isFixedContentLayout({ f: 'L_VS_WHY_3', ov: { t: {} } }), true);
  assert.equal(isFixedContentLayout({ f: 'L_VS_END' }), true);
  assert.equal(isFixedContentLayout({ f: 'L_VS_CASE', ov: { t: { 1: 'A 호텔' } } }), true);
  assert.equal(isFixedContentLayout({ f: 'L_VS_CASE', ov: { t: {} } }), false);
  assert.equal(isFixedContentLayout({ f: 'L_VS_SPACE', ov: { t: { 1: '로비' } } }), false);
});

test('a changed requirement or matching re-queues ordinary sheets but never the fixed ones', () => {
  const original = fixedFixture(), p = structuredClone(original);
  const before = structuredClone(p.parts.flatMap((s) => s.layouts).map((x) => x.ov));
  p.ctx.products.push('hu8000f'); p.customer = '바뀐 고객';
  markLayoutChanges(p, original);
  for (const uid of ['w1', 'end', 'c1']) {
    const x = sheet(p, uid);
    assert.equal(x.adaptation.phase, 'retained', uid + ' is not queued');
    assert.equal(x.adaptation.origin, 'fixed');
    assert.equal(x.status, 'done');
  }
  assert.equal(sheet(p, 'x1').adaptation.phase, 'queued', 'an ordinary sheet follows the new context');
  assert.deepEqual(p.parts.flatMap((s) => s.layouts).map((x) => x.ov), before, 'no content is touched here');
});

test('a fixed sheet that is newly added, or retried by hand, is kept as it is', () => {
  const original = fixedFixture(), p = structuredClone(original);
  p.parts[0].layouts.push({ uid: 'w2', f: 'L_VS_WHY_2', status: 'partial', ov: { t: {}, img: {} } });   // 견본 장 넣기 · 라이브러리에서 추가
  markLayoutChanges(p, original);
  assert.equal(sheet(p, 'w2').adaptation.phase, 'retained');
  assert.equal(sheet(p, 'w2').status, 'done');
  const c = sheet(p, 'c1');
  queueLayout(c, layoutContextKey(p, p.parts[1]), 'retry');
  assert.equal(c.adaptation.phase, 'retained', 'a manual retry does not hand a case sheet to the model');
  assert.equal(c.status, 'done');
});

// ---- 시장조사 근거로 채운 장 (2026-11-15)
test('a composed market sheet that still needs a human check stays as composed — flagged for review, not rewritten', () => {
  const original = fixture(), p = structuredClone(original);
  p.parts[0].layouts.push({ uid: 'trend', f: 'L_TOC_TRSTAT', status: 'partial', ov: { t: { 3: '13.0' }, img: {} }, ev: {},
    adaptation: { origin: 'compose', phase: 'review', missing: ['시장 자료: 기준 연도를 근거에서 확인해 주세요.'] } });
  markLayoutChanges(p, original);
  const x = p.parts[0].layouts[1];
  assert.equal(x.adaptation.phase, 'review');
  assert.equal(x.adaptation.origin, 'compose');
  assert.deepEqual(x.adaptation.missing, ['시장 자료: 기준 연도를 근거에서 확인해 주세요.']);
  assert.equal(x.status, 'partial');
  assert.equal(x.adaptation.appliedKey, layoutContextKey(p, p.parts[0]));
});

test('a trend sheet swapped to the kind its evidence supports is not queued again by the swap itself', () => {
  const original = fixture();
  original.parts[0].layouts[0] = { uid: 'trend', f: 'L_TOC_TRLINE', status: 'partial', ov: { t: {}, img: {} }, ev: {},
    adaptation: { phase: 'running', key: layoutContextKey(original, original.parts[0]), request: 'r1' } };
  const p = structuredClone(original);
  const x = p.parts[0].layouts[0];
  // layout-context.js run(): the research result chose 핵심 지표 instead of 연도별 추이
  x.f = 'L_TOC_TRSTAT'; x.ov = { t: { 3: '13.0' }, img: {} }; x.status = 'done';
  x.adaptation = { ...x.adaptation, phase: 'ready', appliedKey: x.adaptation.key, swappedFrom: 'L_TOC_TRLINE' };
  markLayoutChanges(p, original);
  assert.equal(x.adaptation.phase, 'ready');
  assert.equal(x.status, 'done');
  // a person swapping the layout by hand (no swappedFrom) is still queued
  const q = structuredClone(original); q.parts[0].layouts[0].adaptation.phase = 'ready';
  const r = structuredClone(q); r.parts[0].layouts[0].f = 'L_TOC_TRKEY';
  markLayoutChanges(r, q);
  assert.equal(r.parts[0].layouts[0].adaptation.phase, 'queued');
});

// '샘플 자료' 띠 — 아직 이 제안서 값이 아닌 견본을 보이는 장만 (components/sample-ribbon.jsx)
test('only a sheet still showing sample content counts as a sample', () => {
  const sheet = (extra) => ({ uid: 's', f: 'template', status: 'empty', ov: { t: {}, img: {} }, ...extra });
  const filled = { t: { 0: '이 고객 제목' }, img: {} };
  // 레이아웃 원본 그대로 · 방향 확인을 기다리는 장 · 예전 빈 장
  assert.equal(sheetShowsSample(sheet()), true);
  assert.equal(sheetShowsSample(sheet({ adaptation: { phase: 'brief' } })), true);
  assert.equal(sheetShowsSample(sheet({ adaptation: { phase: 'retained' } })), true);
  // 다른 고객의 값(샘플 시나리오 활용 · 구성 견본)을 든 채 채우기를 기다리는 장
  assert.equal(sheetShowsSample(sheet({ status: 'partial', ov: filled, adaptation: { phase: 'queued' } })), true);
  // 채운 장 · 자동 구성이 채운 장(확인할 것이 남아도) · 한 번 채운 뒤 다시 맞추는 장
  assert.equal(sheetShowsSample(sheet({ status: 'done', ov: filled })), false);
  assert.equal(sheetShowsSample(sheet({ status: 'partial', ov: filled, adaptation: { phase: 'review', missing: ['연도'] } })), false);
  assert.equal(sheetShowsSample(sheet({ status: 'partial', ov: filled, adaptation: { phase: 'queued', appliedKey: 'k' } })), false);
  // 예전에 채워 둔 장(retained + 내용)
  assert.equal(sheetShowsSample(sheet({ status: 'partial', ov: filled, adaptation: { phase: 'retained' } })), false);
  // 채우는 중 · 실패라 장 대신 자리표시가 보이는 장
  assert.equal(sheetShowsSample(sheet({ status: 'partial', adaptation: { phase: 'running' } })), false);
  assert.equal(sheetShowsSample(sheet({ adaptation: { phase: 'briefing' } })), false);
  assert.equal(sheetShowsSample(sheet({ status: 'partial', adaptation: { phase: 'error' } })), false);
  // 내용이 고정인 장 · 조감도 · 내 템플릿
  assert.equal(sheetShowsSample(sheet({ f: 'L_VS_WHY_1' })), false);
  assert.equal(sheetShowsSample(sheet({ ov: { t: {}, img: {}, spatial: { view: '3d' } } })), false);
  assert.equal(sheetShowsSample(sheet({ f: 'L_MY_abc' })), false);
});
