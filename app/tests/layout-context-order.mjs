// "Has this sheet been edited?" must not depend on the order in which an object's keys happen to be stored.
// A shared Storyboard comes back from the server (app/api/storyboards.py patches key by key: keys it already has keep their place,
// new ones go last) with the same content in another key order. Reading that as an edit queued the sheet for another AI review,
// whose result differed in key order again — an endless loop of model calls that also kept PPTX export blocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutContentKey, layoutContextKey, markLayoutChanges } from '../web/src/domain/slides/context-policy.js';

const proposal = () => {
  const p = { title: '제안', customer: '검증 고객', ind: null, req: { free: [] }, ctx: { products: ['qm55c'], solutions: [], cases: [] },
    parts: [{ id: 'part', type: 'overview', name: '개요', items: [], layouts: [] }] };
  p.parts[0].layouts.push({ uid: 'sheet', f: 'template', status: 'partial',
    ov: { t: { 1: '메뉴보드 6대 설치', 3: 'QM55C' }, img: { 4: { src: 'img/a.jpg', name: '설치 장면', pid: 'a', products: ['qm55c'], fit: 'cover', keep: true } }, r: [['원문', '바꾼 문구']], bg: { src: 'img/bg.jpg', theme: 'cafe' } },
    ev: { t1: { by: 'ai', at: 1, src: [{ k: 'req', title: '요구사항', sub: '매장 3곳', by: 'ai' }], kept: false, reason: '수량 반영' }, t3: { by: 'ai', at: 1, src: [], kept: true, reason: '모델명 일치' }, i4: { by: 'ai', kept: true, at: 1, reason: '설치 장면 유지', src: [] } },
    adaptation: { version: 3, origin: 'context', phase: 'review', request: 'r1', queuedAt: 1, missing: ['예산'] } });
  p.parts[0].layouts[0].adaptation.key = p.parts[0].layouts[0].adaptation.appliedKey = layoutContextKey(p, p.parts[0]);
  return p;
};
// The same values, every object's keys in the opposite order — what a key-by-key patched copy can look like.
const reordered = value => Array.isArray(value) ? value.map(reordered)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reordered(value[key])])) : value;
// What installing a shared copy does: the document comes from the server, the sheet's adaptation from the local copy.
const installed = (local, change = () => {}) => {
  const copy = structuredClone(local);
  for (const part of copy.parts) for (const x of part.layouts) { const { adaptation, uid, ...content } = x; Object.assign(x, { uid, ...reordered(content), adaptation }); for (const key of Object.keys(x)) if (!(key in content) && key !== 'uid' && key !== 'adaptation') delete x[key]; }
  change(copy.parts[0].layouts[0]);
  return copy;
};
const sheet = p => p.parts[0].layouts[0];

test('the fixture really differs in key order only', () => {
  const local = proposal(), remote = installed(local);
  assert.notEqual(JSON.stringify(sheet(local).ov), JSON.stringify(sheet(remote).ov));
  assert.notEqual(JSON.stringify(sheet(local).ev), JSON.stringify(sheet(remote).ev));
  assert.deepEqual(sheet(remote).ov, sheet(local).ov);
  assert.deepEqual(sheet(remote).ev, sheet(local).ev);
});

test('the same content in another key order has the same content key', () => {
  const local = proposal(), remote = installed(local);
  assert.equal(layoutContentKey(sheet(remote)), layoutContentKey(sheet(local)));
});

test('a copy that differs only in key order is not an edit — the settled sheet is not queued again', () => {
  const local = proposal(), remote = installed(local);
  markLayoutChanges(remote, local);
  assert.equal(sheet(remote).adaptation.phase, 'review');
  assert.equal(sheet(remote).adaptation.request, 'r1');
  assert.equal(sheet(remote).status, 'partial');
});

test('a changed text is still an edit: the sheet is queued for review', () => {
  const local = proposal(), remote = installed(local, x => { x.ov.t[1] = '다른 문구'; });
  assert.notEqual(layoutContentKey(sheet(remote)), layoutContentKey(sheet(local)));
  markLayoutChanges(remote, local);
  assert.equal(sheet(remote).adaptation.phase, 'queued');
  assert.equal(sheet(remote).adaptation.origin, 'context');
});

test('an array keeps its order: reordered replacements are a different content', () => {
  const local = proposal(), remote = installed(local, x => { x.ov.r = [['다른 원문', '문구'], ...x.ov.r]; });
  const swapped = installed(local, x => { x.ov.r = [...x.ov.r].reverse().concat([['추가', '문구']]).reverse(); });
  assert.notEqual(layoutContentKey(sheet(remote)), layoutContentKey(sheet(local)));
  assert.notEqual(layoutContentKey(sheet(swapped)), layoutContentKey(sheet(local)));
});

test('a picture-only change stays a direct edit, not a request to rewrite the sheet', () => {
  const local = proposal(), remote = installed(local, x => { x.ov.img[4] = { src: 'img/b.jpg', name: '다른 사진', selectedBy: 'user' }; x.ev.i4 = { by: 'user', at: 2, src: [] }; });
  markLayoutChanges(remote, local);
  assert.equal(sheet(remote).adaptation.phase, 'review');
});
