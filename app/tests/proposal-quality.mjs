import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityTextKey, qualityIssues } from '../web/src/domain/slides/quality.js';
import { separateSites, siteRoomId } from '../web/src/domain/proposals/site-concepts.js';
import { proposalContextKey } from '../web/src/domain/slides/context-policy.js';

test('saved proof becomes stale after any text change but not an object key reordering', () => {
  const t = { 2: '냉방 8.30 kW', 1: 'AP083BNPPBH6' };
  const x = { ov: { t }, quality: { status: 'ready', textKey: qualityTextKey(t), issues: [] } };
  assert.deepEqual(qualityIssues(x), []);
  x.ov.t = { 1: t[1], 2: t[2] };
  assert.deepEqual(qualityIssues(x), []);
  x.ov.t[1] = '키오스크';
  assert.equal(qualityIssues(x).length, 1);
});

test('DT and street store concepts are independent sites; internal spaces are rooms', () => {
  assert.equal(separateSites({ spaces: [{ name: 'DT 매장' }, { name: '가두 매장' }] }), true);
  assert.equal(separateSites({ spaces: [{ name: '카운터' }, { name: '객석' }] }), false);
  assert.equal(separateSites({ scope: 'rooms', spaces: [{ name: 'DT 매장' }, { name: '가두 매장' }] }), false);
  assert.notEqual(siteRoomId('custom-space-dt매장', 0), siteRoomId('custom-space-dt매장', 1));
});

test('space identity/product mapping changes invalidate context but rendering metadata does not', () => {
  const p = { spacePlan: { spaces: [{ id: 's', name: 'DT 매장', products: ['qm55c'] }] } };
  const key = proposalContextKey(p);
  p.spacePlan.birdseye = { status: 'done', image: 'render.jpg' };
  assert.equal(proposalContextKey(p), key);
  p.spacePlan.spaces[0].products.push('led');
  assert.notEqual(proposalContextKey(p), key);
});
