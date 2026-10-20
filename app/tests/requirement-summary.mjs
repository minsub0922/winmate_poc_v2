import test from 'node:test';
import assert from 'node:assert/strict';
import { requirementSources, requirementSourceKey, currentRequirementSummary, savedRequirementSummary, requirementContext, requirementContextText, SUMMARY_SECTIONS, sourceDigest } from '../web/src/domain/proposals/requirement-summary.js';

const proposal = () => ({ id: 'proposal', title: '새 제안서', customer: 'A 커피', ind: 'FB', req: { free: [{ t: '매장 320곳을 본사에서 관리합니다.' }], form: { project: '메뉴보드 전환', keymen: [{ id: 'owner', name: '운영본부장', weight: 80, reqs: [[{ t: '11월에 시범 설치합니다.' }]] }], note: '단계 확산을 제안하고 싶습니다.' }, files: [] } });
const point = text => ({ text, kind: 'fact', refs: [{ source_id: 'free', quote: '매장 320곳' }] });
function ready(p) {
  const source_key = requirementSourceKey(p);
  p.requirementSummary = { sourceKey: source_key, status: 'ready', result: { version: 1, source_key, llm: { effective: 'llm' }, sources: requirementSources(p), coverage: { complete: true }, summary: { overview: point('본사 통합 관리'), ...Object.fromEntries(SUMMARY_SECTIONS.map(([key]) => [key, [point(key)]])) } } };
  return p;
}
test('all input channels retain distinct source identities and author ownership', () => {
  const p = proposal(); p.req.files = [{ id: 'file', name: '원문.txt', text: '첨부 원문', memo: '참고할 내용', extractedChars: 5 }];
  const rows = requirementSources(p);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.equal(rows.find(row => row.id === 'author-note').kind, 'author');
  assert.equal(rows.find(row => row.id === 'file-note-file').kind, 'author');
  assert(rows.some(row => row.text.includes('11월')));
  assert(rows.some(row => row.text.includes('80%')));
});
test('an untouched empty form never triggers a fabricated summary', () => {
  const p = { req: { free: [], form: { keymen: [{ name: '', weight: 100, reqs: [[]] }] }, files: [] } };
  assert.deepEqual(requirementSources(p), []);
});
test('input edits invalidate context immediately; title or layout edits do not', () => {
  const p = ready(proposal()), key = requirementSourceKey(p);
  p.title = '변경한 제목'; p.parts = [{ layouts: [{ f: 'new' }] }];
  assert.equal(requirementSourceKey(p), key); assert(currentRequirementSummary(p));
  p.req.form.note += ' 추가 의견';
  assert.equal(currentRequirementSummary(p), null); assert.equal(requirementContext(p), null); assert.equal(requirementContextText(p), '');
});
test('each downstream purpose gets relevant sections and keeps evidence and original priority', () => {
  const p = ready(proposal());
  assert('decision_criteria' in requirementContext(p, 'review').sections);
  assert(!('strategy' in requirementContext(p, 'matching').sections));
  assert('strategy' in requirementContext(p, 'fill').sections);
  assert(requirementContextText(p, 'fill').includes('원문 우선'));
  assert(requirementContextText(p, 'fill').includes('매장 320곳'));
});
test('changed requirements keep the previous summary visible without reusing it as current context', () => {
  const p = ready(proposal()), original = structuredClone(p.req), result = p.requirementSummary.result;
  p.req.free = [{ t: '매장 500곳을 관리합니다.' }];
  assert.equal(savedRequirementSummary(p), result);
  assert.notEqual(result.source_key, requirementSourceKey(p));
  assert.equal(currentRequirementSummary(p), null);
  assert.equal(requirementContext(p), null);
  p.requirementSummary = { ...p.requirementSummary, status: 'pending', sourceKey: requirementSourceKey(p) };
  assert.equal(savedRequirementSummary(p), result);
  assert.equal(currentRequirementSummary(p), null);
  p.requirementSummary.status = 'error';
  assert.equal(savedRequirementSummary(p), result);
  p.req = original; p.requirementSummary.status = 'ready'; p.requirementSummary.sourceKey = result.source_key;
  assert.equal(currentRequirementSummary(p), result);
});
test('long original fingerprints survive reload and never reduce the full summary to an excerpt', () => {
  const p = proposal(), full = '가'.repeat(25000) + '후반부의 필수 요구';
  p.req.files = [{ id: 'long', name: '긴 원문.txt', text: full.slice(0, 20000), sourceKey: sourceDigest(full), extractedChars: full.length }];
  const key = requirementSourceKey(p);
  const sources = requirementSources(p, () => full);
  assert.equal(sources.find(s => s.file_id === 'long').partial, false);
  assert(sources.find(s => s.file_id === 'long').text.endsWith('후반부의 필수 요구'));
  assert.equal(requirementSourceKey(structuredClone(p)), key);
  p.req.files[0].sourceKey = sourceDigest(full + '변경');
  assert.notEqual(requirementSourceKey(p), key);
});
test('a partial or unreadable attachment is never silently advertised as complete', () => {
  const p = proposal();p.req.files = [{ id: 'old', name: '이전 원문', text: '발췌', extractedChars: 30000 }];
  assert.equal(requirementSources(p).find(s => s.file_id === 'old').partial, true);
  const key = requirementSourceKey(p);p.req.files.push({ id: 'unsupported', name: '미지원.hwp', size: 50, readError: '미지원 형식' });
  assert.notEqual(requirementSourceKey(p), key);
});
test('task context retrieves the relevant original window beyond the stored attachment excerpt', () => {
  const p = proposal(), quote = '후반 필수 요구는 전력 15% 절감입니다.', full = '공통 배경. '.repeat(4000) + quote;
  p.req.files = [{ id: 'long', name: '원문', text: full.slice(0, 20000), sourceKey: sourceDigest(full), extractedChars: full.length }];
  ready(p);
  p.requirementSummary.result.summary.requirements = [{ text: quote, kind: 'fact', refs: [{ source_id: 'file-long', quote }] }];
  const context = requirementContext(p, 'layout', requirementSources(p, () => full));
  const original = context.originals.find(source => source.source_id === 'file-long');
  assert(original.text.includes(quote));assert(original.excerpt);assert.equal(original.partial, false);
  assert(context.originals.reduce((n, source) => n + source.text.length, 0) <= 8000);
});
