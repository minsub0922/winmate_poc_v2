import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutContextChanged, layoutContextKey, markLayoutChanges, queueLayout } from '../web/src/domain/slides/context-policy.js';

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
  p.parts[0].items = ['새로운 파트 내용']; markLayoutChanges(p, original);
  assert.equal(changed(p), true);
  const intermediate = structuredClone(p);
  p.parts[0].items = []; markLayoutChanges(p, intermediate);
  assert.equal(changed(p), false);
});
