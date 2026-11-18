import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRecord } from '../web/src/repositories/record-update.js';
import { recordJson, recordsJson } from '../web/src/repositories/record-json.js';

test('simulation progress preserves conversation/evidence and the previous snapshot', () => {
  const before = { updatedAt: 1, msgs: [{ id: 'm', segs: [{ t: '고객 요구' }], materials: [{ text: '근거'.repeat(10000) }] }], cur: { scores: { value: 4 }, suggest: [] }, skillRuns: [{ id: 'run', stages: {}, progress: '시작' }] };
  const original = structuredClone(before), saved = recordJson(before);
  const after = changeRecord(before, s => { s.skillRuns[0].progress = '분석 중'; s.skillRuns[0].stages.research = 'done'; }, { touch: true, now: () => 2 });
  assert.deepEqual(before, original);
  assert.equal(after.msgs, before.msgs); assert.equal(after.cur, before.cur);
  assert.notEqual(after.skillRuns[0], before.skillRuns[0]);
  assert.equal(after.updatedAt, 2); assert.equal(recordJson(before), saved);
  assert.deepEqual(JSON.parse(recordsJson([before, after])), [before, after]);
});

test('nested review edits and deletions cannot mutate cached earlier results', () => {
  const before = { id: 'review', settings: { previewProposalId: 'source' }, results: { a: { score: 50, checkpoints: [{ reason: 'old' }] } }, units: [{ text: '원문' }] };
  const saved = recordJson(before);
  const after = changeRecord(before, r => { r.results.a.checkpoints[0].reason = 'new'; delete r.settings.previewProposalId; });
  assert.equal(before.results.a.checkpoints[0].reason, 'old');
  assert.equal(before.settings.previewProposalId, 'source');
  assert.equal(after.units, before.units); assert.equal(recordJson(before), saved);
  assert.equal(JSON.parse(recordJson(after)).results.a.checkpoints[0].reason, 'new');
  assert.equal('updatedAt' in after, false);
});

test('no-op callbacks preserve identity, time and persistence fingerprint', () => {
  const before = { updatedAt: 1, status: 'done', nested: { value: 3 } };
  const saved = recordJson(before);
  assert.equal(changeRecord(before, s => { s.status = 'done'; s.nested.value = 3; }, { touch: true }), before);
  assert.equal(recordJson(before), saved);
});

test('editing the last answer preserves its version history and other turns', () => {
  const before = { msgs: [{ segs: [{ t: '첫 질문' }] }, { segs: [{ t: '이전 답변' }], materials: [{ title: '출처' }] }] };
  const next = changeRecord(before, s => {
    const last = s.msgs.at(-1);
    last.previousVersions = [{ segs: last.segs, materials: last.materials }];
    last.segs = structuredClone([{ t: '수정한 답변' }]);
    delete last.materials;
  });
  assert.equal(next.msgs[0], before.msgs[0]);
  assert.deepEqual(next.msgs[1].previousVersions, [{ segs: [{ t: '이전 답변' }], materials: [{ title: '출처' }] }]);
  assert.equal(before.msgs[1].segs[0].t, '이전 답변');
});
