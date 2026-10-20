import test from 'node:test';
import assert from 'node:assert/strict';
import { repeatedAutoLayouts, usedLayoutIds } from '../web/src/services/layout-usage.js';
import { reviewAppendixLayouts } from '../web/src/domain/review/example-layouts.js';

const proposal = { customer: 'E 대학교', parts: [{ layouts: [{ f: 'cover', ov: { img: { 0: { src: 'campus.jpg' } } } }, { f: 'manual' }, { f: 'manual' }] }] };
test('manual repeats remain available while automatic results cannot repeat existing or new layouts', () => {
  assert.deepEqual([...usedLayoutIds(proposal)], ['cover', 'manual']);
  assert.deepEqual(repeatedAutoLayouts([{ layouts: [{ f: 'manual' }, { f: 'new' }, { f: 'new' }] }], proposal), ['manual', 'new']);
  assert.equal(proposal.parts[0].layouts.length, 3);
  assert.deepEqual(repeatedAutoLayouts([{ layouts: [{ f: 'new' }, { f: 'other' }] }], proposal), []);
});
test('appendices use four distinct layouts and retain every original sentence', () => {
  const cards = Array.from({ length: 4 }, (_, i) => [`검증 항목 ${i}`, `고객 요구 ${i}를 확인합니다. 시범 범위와 예산 조건을 지키고 실제 검증 후 확정합니다.`]);
  const result = reviewAppendixLayouts(proposal, ['고객·판단', '실행', '투자', '출처'].map(label => [label, cards]));
  assert.equal(new Set(result.map(x => x.f)).size, 4);
  const slots = [ [[11,12,13],[19,20,21],[27,28,29],[35,36,37]], [[9,11,13],[16,18,20],[23,25,27],[30,32,34]], [[7,8],[15,16],[23,24],[31,32]], [[7,10,13],[16,19,24],[27,30,33],[36,41,44]] ];
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  for (let section = 0; section < result.length; section++) for (let i = 0; i < cards.length; i++) {
    const actual = slots[section][i].map(key => result[section].ov.t[key]).join(' ');
    assert.equal(normalize(actual), normalize(cards[i][1]));
  }
});
