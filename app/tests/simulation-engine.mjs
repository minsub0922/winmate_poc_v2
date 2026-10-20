// Focused engine contracts. Catalog/storage/search are isolated fixtures; engine,
// profile, scoring/segments, runtime and SSE transport are the real modules.
// Run from the repository root: node --test app/tests/simulation-engine.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createReplyStream, withAbort } from '../web/src/domain/simulation/reply-stream.js';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = require('esbuild');
const source = fileURLToPath(new URL('../web/src/', import.meta.url));
const fixtures = {
  'catalog.js': `export const P={panel:{name:'테스트 사이니지',model:'DISPLAY55',cat:'사이니지',spec:'55인치 500nit',spaces:[],ind:[]}}, S={cms:{name:'MagicINFO',cat:'CMS',desc:'본사에서 원격으로 메뉴를 일괄 배포하고 예약 관리',with:['panel']}}, C={}, IND={};`,
  'proposals.js': `export const getProposal=()=>null; export const seg=(...xs)=>xs.map(t=>({t})); export const segRefs=xs=>(xs||[]).filter(x=>x.ref).map(x=>x.ref); export const segPlain=(xs,label)=>Array.isArray(xs)?xs.map(x=>x.t??('@'+(label?label(x.ref):x.ref))).join(''):String(xs||'');`,
  'search.js': `export const recommendContext=()=>[]; export const reqText=()=>''; export const inferIndustry=()=>null; export const toks=t=>String(t||'').split(/\\s+/);`,
  'scenarios.js': `export const SCENARIOS=[],SC={},REQ_TYPES={},STRATEGIES={},STAGES={};`,
  'scenario_fills.js': `export const FILL_CUSTOMER={};`,
  'ai.js': `export {getSample} from ${JSON.stringify(source + 'platform/runtime.js')};`,
};
const bundled = await build({
  stdin: { contents: `export * from './domain/simulation/engine.js'; export {setTransport} from './api/client.js';`, resolveDir: source },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'simulation-fixtures', setup(b) {
    b.onResolve({ filter: /\/(catalog|proposals|search|scenarios|scenario_fills|ai)\.js$/ }, (args) => ({ path: args.path.split('/').pop(), namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: fixtures[args.path], resolveDir: source }));
  } }],
});
const { customerTurn, normalize, visibleReply, turnErrorText, debrief, completeSuggestions, setTransport, RECOMMENDATION_CONFIDENCE_THRESHOLD } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = (data) => 'data: ' + JSON.stringify(data) + '\n\n';
const sse = (...events) => new Response(events.map(frame).join(''), { headers: { 'content-type': 'text/event-stream' } });
const goodConfidence = { score: 90, requirementsClear: true, grounded: true, concrete: true, reason: '메뉴 일괄 변경 요구에 MagicINFO의 원격 배포 기능을 적용함' };
const suggestion = (extra = {}) => ({ title: '통합 운영 제안', text: '@solution:cms를 활용해 본사에서 매장의 메뉴를 일괄 배포하고 예약 관리합니다.', crit: ['PR4'], confidence: { ...goodConfidence }, ...extra });
const evaluation = (extra = {}) => ({ satisfaction: 45, scores: {}, suggest: [suggestion(), suggestion({ title: '일정 확인', text: '매장의 운영 시간과 교체 가능한 일정을 알려 주시겠어요?' }), suggestion({ title: '검증 기준 확인', text: '본사 메뉴 배포가 잘되는지 어떤 기준으로 확인하면 좋을까요?' })], ...extra });
const answer = (text, ev = evaluation()) => text + '\n<<<EVAL>>>\n' + JSON.stringify(ev);
function sim() {
  return { level: 2, status: 'active', setup: { title: '매장 운영', req: [{ t: '20대의 메뉴를 본사에서 일괄 변경하고 영업 중 중단 없이 관리해야 합니다.' }], refs: { products: ['panel'], solutions: ['cms'], cases: [] } },
    profile: { name: '김고객', company: '고객사', role: '운영책임자', interests: ['메뉴 일괄 배포'], concerns: [], ask: '파일럿 승인' },
    msgs: [], cur: { satisfaction: 45, trust: 40, interest: 50, scores: null, notes: {}, stage: 'open' } };
}
function normalized(item, setup = sim()) { return normalize(setup, evaluation({ suggest: [item] }), true).suggest[0]; }

test('buffered reply drains smoothly, deduplicates and emits complete graphemes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const out = [], text = '한글 👨‍👩‍👧‍👦 👍🏽 e\u0301 답변입니다. '.repeat(8);
  const stream = createReplyStream({ onText: (x) => out.push(x) });
  t.after(() => stream.stop());
  stream.push(text); stream.push(text);
  const done = stream.finish(text);
  assert.equal(out.length, 0);
  for (let i = 0; i < 100; i++) t.mock.timers.tick(32);
  await done;
  assert.ok(out.length > 3 && out.length <= 40);
  assert.equal(out.at(-1), text);
  const boundaries = new Set(Array.from(new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text), (x) => x.index + x.segment.length));
  for (const x of out) { assert.ok(text.startsWith(x)); assert.ok(boundaries.has(x.length)); }
  assert.equal(new Set(out).size, out.length);
  const count = out.length; stream.push('늦은 콜백'); t.mock.timers.tick(5000); assert.equal(out.length, count);
});

test('idle identical snapshots do not reschedule or emit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const out = [], stream = createReplyStream({ onText: (x) => out.push(x) });
  t.after(() => stream.stop());
  stream.push('가나다라'); t.mock.timers.tick(32); t.mock.timers.tick(32);
  for (let i = 0; i < 500; i++) stream.push('가나다라');
  t.mock.timers.tick(5000); await stream.finish('가나다라');
  assert.deepEqual(out, ['가나', '가나다라']);
});

test('stop cancels timers and an in-progress drain', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController(), out = [];
  const stream = createReplyStream({ signal: controller.signal, onText: (x) => out.push(x) });
  const done = stream.finish('긴 고객 대사를 중지합니다.');
  t.mock.timers.tick(32); const shown = stream.text; controller.abort();
  await assert.rejects(done, { name: 'AbortError' });
  t.mock.timers.tick(5000); assert.deepEqual(out, [shown]);
  stream.push('취소 후'); assert.equal(stream.text, shown);
});

test('provider corrections finish exactly and callback errors do not escape a timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const out = [], stream = createReplyStream({ onText: (x) => out.push(x) });
  stream.push('이전 답변'); t.mock.timers.tick(32);
  const done = stream.finish('수정된 답변');
  for (let i = 0; i < 10; i++) t.mock.timers.tick(32);
  await done; assert.equal(out.at(-1), '수정된 답변');
  const broken = createReplyStream({ onText: () => { throw new Error('callback failed'); } });
  const failed = broken.finish('대사'); t.mock.timers.tick(32);
  await assert.rejects(failed, /callback failed/);
});

test('withAbort stops ignored adapters promptly and observes late failures', async () => {
  const controller = new AbortController(); let lateReject;
  const done = withAbort(() => new Promise((_, reject) => { lateReject = reject; }), controller.signal);
  await Promise.resolve(); controller.abort();
  await assert.rejects(done, { name: 'AbortError' });
  lateReject(new Error('late failure')); await wait(0);
  let called = false;
  await assert.rejects(withAbort(() => { called = true; }, controller.signal), { name: 'AbortError' });
  assert.equal(called, false);
});

test('every split of supported delimiters and reordered evaluation JSON stays hidden', () => {
  for (const delimiter of ['<<<EVAL>>>', '<< EVAL >>', '[EVAL]', '[ EVAL ]']) {
    const raw = '안녕하세요.\n' + delimiter + '\n' + JSON.stringify(evaluation());
    for (let n = '안녕하세요.'.length; n <= raw.length; n++) assert.equal(visibleReply(raw.slice(0, n)), '안녕하세요.', raw.slice(0, n));
  }
  for (const first of ['trust', 'suggest', 'scores', 'satisfaction']) {
    const raw = '대사입니다.\n```json\n' + JSON.stringify({ [first]: 1, ...evaluation() });
    for (let n = '대사입니다.'.length; n <= raw.length; n++) assert.equal(visibleReply(raw.slice(0, n)), '대사입니다.', raw.slice(0, n));
  }
  assert.equal(visibleReply('김[고객](영업): 반갑습니다.', '김[고객](영업)'), '반갑습니다.');
  assert.equal(visibleReply('사용할 @solution:cms'), '사용할 MagicINFO');
  assert.equal(visibleReply('사용할 @solu'), '사용할');
});

test('buffered SSE and final-only JSON both animate before customerTurn resolves', async () => {
  const text = '반갑습니다. 본사에서 매장 메뉴를 일괄 변경하는 방법과 운영 중단을 줄일 근거가 궁금합니다.';
  const full = answer(text);
  for (const mode of ['sse', 'json']) {
    let request; const out = [], times = [];
    setTransport(async (_, options) => {
      request = JSON.parse(options.body);
      if (mode === 'json') return Response.json({ mode: 'real', text: full });
      const chunks = Array.from(full, (_, i) => ({ type: 'text', text: full.slice(0, i + 1) }));
      return sse(...chunks, { type: 'result', mode: 'real', text: full });
    });
    const result = await customerTurn(sim(), { onText: (x) => { out.push(x); times.push(performance.now()); } });
    assert.equal(result.text, text); assert.equal(result.retried, false);
    assert.ok(out.length > 5 && out.length <= 40); assert.equal(out.at(-1), text);
    assert.equal(new Set(out).size, out.length);
    for (const value of out) assert.ok(text.startsWith(value));
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 20);
    assert.match(request.turns[0].content, /confidence/);
    assert.match(request.turns[0].content, /동의를 구함/);
    assert.match(request.turns[0].content, /85/);
    assert.equal(result.ev.suggest[0].confident, true);
  }
});

test('Stop during buffered pacing returns exactly the visible prefix and no late frames', async () => {
  const controller = new AbortController(), out = [], text = '이 고객 대사는 한 번에 수신되지만 화면에는 조금씩 전달되어야 합니다.';
  setTransport(async () => Response.json({ mode: 'real', text: answer(text) }));
  await assert.rejects(customerTurn(sim(), { signal: controller.signal, onText: (x) => { out.push(x); controller.abort(); } }), (e) => e.code === 'cancelled' && e.text === out[0] && e.text.length < text.length);
  await wait(80); assert.equal(out.length, 1);
});

test('Stop before sampling makes no request, ignored fetch is promptly cancelled', async () => {
  let calls = 0; const pre = new AbortController(); pre.abort();
  setTransport(async () => { calls++; return new Promise(() => {}); });
  await assert.rejects(customerTurn(sim(), { signal: pre.signal }), (e) => e.code === 'cancelled' && e.text === '');
  assert.equal(calls, 0);
  const controller = new AbortController();
  const done = customerTurn(sim(), { signal: controller.signal });
  await wait(0); controller.abort();
  await assert.rejects(done, (e) => e.code === 'cancelled'); assert.equal(calls, 1);
});

test('evaluation retry carries confidence schema and Stop preserves already delivered text', async () => {
  let calls = 0, retryBody; const text = '본사 통합 관리 방식이 궁금합니다.';
  setTransport(async (_, options) => {
    calls++; const body = JSON.parse(options.body);
    if (calls === 1) return Response.json({ mode: 'real', text });
    retryBody = body; return Response.json({ mode: 'real', data: evaluation() });
  });
  const result = await customerTurn(sim());
  assert.equal(result.text, text); assert.equal(result.retried, true); assert.equal(calls, 2);
  assert.deepEqual(retryBody.response_schema.properties.suggest.items.properties.confidence.required, ['score', 'requirementsClear', 'grounded', 'concrete', 'reason']);
  const controller = new AbortController(); calls = 0;
  setTransport(async () => {
    if (++calls === 1) return Response.json({ mode: 'real', text });
    controller.abort(); return new Promise(() => {});
  });
  await assert.rejects(customerTurn(sim(), { signal: controller.signal }), (e) => e.code === 'cancelled' && e.text === text);
});

test('provider errors never expose diagnostics and failed streams stop queued text', async () => {
  for (const code of ['upstream_error', 'no_api_key', 'rate_limited', 'unavailable', 'network']) assert.doesNotMatch(turnErrorText({ code, message: 'Gemini secret diagnostics' }), /gemini|secret/i);
  const out = [];
  setTransport(async () => sse({ type: 'text', text: '대기 중인 고객 대사' }, { type: 'error', code: 'upstream_error', message: 'Gemini diagnostics' }));
  await assert.rejects(customerTurn(sim(), { onText: (x) => out.push(x) }), (e) => e.code === 'upstream_error' && !/gemini/i.test(e.message));
  await wait(80); assert.deepEqual(out, []);
  setTransport(async () => Response.json({ code: 'bad_request', message: 'Gemini diagnostics' }, { status: 502 }));
  await assert.rejects(debrief(sim()), (e) => !/gemini/i.test(e.message));
});

test('confidence requires a real model score, all checks, evidence and the exact threshold', () => {
  assert.equal(RECOMMENDATION_CONFIDENCE_THRESHOLD, 85);
  for (const score of [0, 84, 84.9, 85, 90, 100, -1, 101, NaN, Infinity, '95', null, undefined]) {
    const item = normalized(suggestion({ confidence: { ...goodConfidence, score } }));
    assert.equal(item.confident, typeof score === 'number' && Number.isFinite(score) && score >= 85 && score <= 100, String(score));
  }
  for (const field of ['requirementsClear', 'grounded', 'concrete']) for (const value of [false, 'true', 1, null]) {
    assert.equal(normalized(suggestion({ confidence: { ...goodConfidence, [field]: value } })).confident, false);
  }
  for (const confidence of [undefined, null, {}, [], { score: 99 }, { ...goodConfidence, reason: '' }, { ...goodConfidence, reason: '고객에게 잘 맞음' }]) assert.equal(normalized(suggestion({ confidence })).confident, false);
});

test('live generic acknowledgment scoring 95 is vetoed without changing the model score', () => {
  const text = '본부장님, 반갑습니다. 300개 매장의 메뉴와 가격을 실시간으로 일괄 제어하지 못해 겪으시는 운영 비효율이 얼마나 크실지 공감합니다. 말씀하신 현장의 DT 매장 집객 문제까지 포함해, 본사에서 전체 매장을 통합 관리할 수 있는 구체적인 솔루션부터 말씀드려도 될까요?';
  const setup = sim(); setup.setup.req[0].t = '300개 매장의 메뉴와 가격 일괄 제어가 필요합니다.';
  const item = normalized(suggestion({ text, confidence: { ...goodConfidence, score: 95, reason: '고객의 니즈를 재확인하고 해결책 제시를 위한 동의를 구함' } }), setup);
  assert.equal(item.confidence.score, 95); assert.equal(item.confidence.concrete, true); assert.equal(item.confident, false);
  assert.equal(normalized(suggestion({ text, confidence: { ...goodConfidence, score: 95, reason: '300개 매장의 메뉴와 가격 일괄 제어가 필요하다는 고객 제약에 공감하고 동의를 구함' } }), setup).confident, false);
  const onlyQuestion = normalized(suggestion({ text: 'MagicINFO로 본사에서 메뉴를 일괄 배포하는 방식을 설명드려도 될까요?' }));
  assert.equal(onlyQuestion.confident, false);
  assert.equal(normalized(suggestion({ text: '@solution:cms로 본사에서 메뉴를 일괄 배포합니다. 운영 방식을 설명드려도 될까요?' })).confident, true);
});

test('concrete plans can cite a confirmed customer constraint without product tokens', () => {
  const item = normalized(suggestion({ text: '영업 중 중단 없이 관리해야 한다는 조건에 맞춰 영업 종료 후 구역별로 교체하고 기존 장비를 유지하는 방식을 제안합니다.', confidence: { ...goodConfidence, reason: '고객이 확인한 영업 중 중단 없이 관리해야 한다는 조건에 맞춘 구역별 교체' } }));
  assert.equal(item.confident, true);
});

test('grounding rejects invented numbers/references and accepts supplied catalog facts', () => {
  const raw = evaluation({ suggest: [suggestion({ text: '운영비를 99% 절감합니다.' }), suggestion({ text: '@solution:invented로 운영합니다.' }), suggestion({ text: '@product:panel의 55인치 500nit 사양을 활용해 메뉴를 표시합니다.', confidence: { ...goodConfidence, reason: 'DISPLAY55의 55인치 500nit 사양을 활용함' } })] });
  const result = normalize(sim(), raw, true);
  assert.equal(result.omittedSuggestions, 2); assert.equal(result.suggest.length, 1); assert.equal(result.suggest[0].confident, true);
  const setup = sim(); setup.setup.req[0].t += '120%라는 내부 목표는 확정되지 않았습니다.';
  assert.equal(normalize(setup, evaluation({ suggest: [suggestion({ text: '20%를 절감합니다.' })] }), true).suggest.length, 0);
});

test('placeholders, promises, truncated answers and old payloads never fabricate certainty', () => {
  for (const text of ['@solution:cms로 [00]개 매장의 메뉴를 배포합니다.', '자료를 준비하겠습니다.', '@solution:cms로 메뉴를 배포합니다. '.repeat(30)]) assert.equal(normalized(suggestion({ text })).confident, false);
  const old = normalized(suggestion({ confidence: undefined }));
  assert.equal(old.confident, false); assert.equal(old.confidence.score, null); assert.equal(old.kind, 'ai');
  assert.deepEqual(old.crit, ['PR4']); assert.ok(old.segs.some((s) => s.ref === 'solution:cms'));
  assert.deepEqual(JSON.parse(JSON.stringify(normalized(suggestion()))).confidence, goodConfidence);
});

test('a filtered-out answer is regenerated by AI so a successful turn contains exactly three', async () => {
  const originals = evaluation().suggest.slice(0, 2);
  let calls = 0, repair;
  setTransport(async (_url, init) => {
    calls++;
    if (calls === 1) return Response.json({ mode: 'real', text: answer('메뉴를 일괄 배포할 수 있나요?', evaluation({ suggest: [...originals, suggestion({ text: '비용을 99% 절감합니다.' })] })) });
    repair = JSON.parse(init.body);
    return Response.json({ mode: 'real', data: { suggest: [suggestion({ title: '검증 기준', text: '일괄 배포가 끝난 뒤 매장별 반영 여부를 확인하는 방식을 제안합니다.' })] } });
  });
  const result = await customerTurn(sim());
  assert.equal(calls, 2); assert.equal(result.ev.suggest.length, 3);
  assert.equal(result.ev.suggest[0].title, originals[0].title);
  assert.equal(result.ev.suggest[1].title, originals[1].title);
  assert.equal(result.text, '메뉴를 일괄 배포할 수 있나요?');
  assert.equal(result.ev.omittedSuggestions, 1);
  assert.equal(repair.response_schema.properties.suggest.minItems, 1);
  assert.equal(repair.response_schema.properties.suggest.maxItems, 1);
  assert(repair.prompt.includes('이미 채택한 추천 답변'));
  assert(!result.ev.suggest.some(s => JSON.stringify(s.segs).includes('99%')));
});

test('missing-answer repair skips duplicates and unsupported claims, keeps existing answers', async () => {
  const setup = sim();
  const accepted = normalize(setup, evaluation(), true).suggest.slice(0, 2);
  let calls = 0;
  setTransport(async () => {
    calls++;
    return Response.json({ mode: 'real', data: { suggest: calls === 1
      ? [evaluation().suggest[0], suggestion({ text: '비용을 99% 절감합니다.' })]
      : [evaluation().suggest[2]] } });
  });
  const complete = await completeSuggestions(setup, '메뉴 배포 방식을 설명해 주세요.', accepted);
  assert.equal(calls, 2); assert.equal(complete.length, 3);
  assert.equal(complete[0], accepted[0]); assert.equal(complete[1], accepted[1]);
  await completeSuggestions(setup, '', complete); assert.equal(calls, 2);
});

test('repair attempts are bounded and never fill missing slots with fabricated answers', async () => {
  let calls = 0;
  setTransport(async () => { calls++; return Response.json({ mode: 'real', data: { suggest: [] } }); });
  await assert.rejects(completeSuggestions(sim(), '운영 방식을 알려 주세요.', []), { code: 'invalid_suggestions' });
  assert.equal(calls, 2);
  const c = new AbortController(); c.abort();
  await assert.rejects(completeSuggestions(sim(), '', [], { signal: c.signal }), { name: 'AbortError' });
  assert.equal(calls, 2);
});
