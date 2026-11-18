// Isolated protocol fixtures test lifecycle and UI. Model quality is checked separately with real Gemini.
// The requirements popup keeps a draft: nothing is saved or summarised while writing. 저장 commits it; the first save
// starts the summary in the background, later saves only turn 다시 요약 on (re-summarising is the person's choice).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
const caps = { provider: { available: true }, functions: Object.fromEntries(['requirements', 'layout', 'storyboard'].map(k => [k, { mode: 'real', ready: true, effective: 'llm' }])) };
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: caps, user: { username: 'summary-ui-test', auth_enabled: false } };
const out = path.join(root, 'app/tests/output/requirement-summary'); fs.mkdirSync(out, { recursive: true });
const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const jobs = new Map(), requests = [], errors = [];
let browser, next = 0, slow = false, fail = false;
const llm = { effective: 'llm', llm_used: true, model: 'isolated-protocol-fixture', calls_ok: 1 };
function result(body) {
  const source = body.sources.find(s => s.kind === 'attachment') || body.sources.find(s => s.kind === 'customer') || body.sources[0];
  const quote = source.text.slice(-Math.min(130, source.text.length));
  const point = (text = quote, kind = 'fact') => ({ text, kind, refs: [{ source_id: source.id, quote, start: source.text.indexOf(quote), end: source.text.length }] });
  const summary = { overview: point(), ...Object.fromEntries(['background', 'goals', 'requirements', 'constraints', 'stakeholders', 'decision_criteria', 'risks', 'questions', 'strategy'].map(k => [k, []])) };
  summary.goals = [point('목표 A · ' + quote), point('목표 B')]; summary.requirements = [point('핵심 요구 A'), point('핵심 요구 B', 'question')]; summary.background = [point('배경은 카드에 없음')];
  summary.strategy = [point('원문을 기준으로 시범 도입의 판단 조건을 제안합니다.', 'inference')];
  return { version: 1, source_key: body.source_key, summary, sources: body.sources.map(({ id, label, kind, partial }) => ({ id, label, kind, partial })), coverage: { complete: true }, llm };
}
try {
  await vite.listen(); browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname === '/api/poc/capabilities') return route.fulfill({ json: caps });
    if (url.pathname === '/api/jobs' && request.method() === 'POST') {
      const body = request.postDataJSON(); requests.push(body);
      const id = 'summary-test-' + ++next, job = { id, kind: body.kind, title: '요약 테스트', status: 'queued', events: [], next_seq: 0 };
      jobs.set(id, { job, body, fail, available: Date.now() + (slow ? 4500 : 300) });
      return route.fulfill({ json: job });
    }
    if (url.pathname.startsWith('/api/jobs/')) {
      if (url.pathname.endsWith('/cancel')) return route.fulfill({ status: 503, json: { code: 'test_cancel_race' } });
      const data = jobs.get(url.pathname.split('/').at(-1));
      if (!data) return route.fulfill({ status: 404, json: { code: 'not_found' } });
      if (data.body.kind !== 'requirements' || Date.now() < data.available) return route.fulfill({ json: { ...data.job, status: 'running' } });
      return route.fulfill({ json: data.fail ? { ...data.job, status: 'error', error: { code: 'provider_error', message: '모델 호출이 실패했어요.' } } : { ...data.job, status: 'done', llm, result: result(data.body) } });
    }
    return route.fulfill({ status: 503, json: { code: 'isolated_no_other_api' } });
  });
  await context.route(url => url.pathname.startsWith('/img/'), route => route.abort());
  const histories = ['entry-missing', 'entry-stale'].map(id => ({
    id, title: id, customer: '저장된 고객', createdAt: 1, updatedAt: 2, stage: 'story',
    req: { free: [{ t: '저장된 매장 운영 요구사항입니다.' }], form: { keymen: [] }, files: [] },
    ctx: { products: [], solutions: [], cases: [] }, parts: [],
    ...(id === 'entry-stale' ? { requirementSummary: { sourceKey: 'old-input', status: 'ready',
      result: result({ source_key: 'old-input', sources: [{ id: 'free', kind: 'customer', label: '자유형식 요구사항', text: '이전 요구사항' }] }),
    } } : {}),
  }));
  await context.addInitScript(histories => {
    if (!localStorage.getItem('summary-entry-initialized')) {
      localStorage.setItem('winmate.v2.proposals', JSON.stringify(histories));
      localStorage.setItem('summary-entry-initialized', '1');
    }
  }, histories);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const base = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const card = page.getByRole('region', { name: '고객 요구사항 요약', exact: true });
  const summarize = card.getByRole('button', { name: '고객 요구사항 다시 요약', exact: true });
  const popup = page.getByRole('dialog', { name: '고객 요구사항', exact: true });
  const editor = page.getByRole('textbox', { name: '자유형식 요구사항', exact: true });
  const count = () => requests.filter(r => r.kind === 'requirements').length;
  const service = fn => page.evaluate(async fn => {
    const s = await import('/src/services/requirement-summary.js'), repo = await import('/src/repositories/proposals.js');
    return new Function('s', 'repo', 'return (' + fn + ')(s, repo)')(s, repo);
  }, fn.toString());
  const openPopup = async () => { await page.locator('.start-node .node').click(); await editor.waitFor(); };
  const save = async () => { await popup.getByRole('button', { name: '저장', exact: true }).click(); await editor.waitFor({ state: 'detached' }); };
  const append = async text => { await openPopup(); await editor.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type(text); };

  for (const history of histories) {
    await page.goto(base + '/storyboard/' + history.id);
    await page.locator('.start-node .node').waitFor();
    if (history.requirementSummary) await card.waitFor();
    else assert.equal(await card.count(), 0, 'A board with no summary has no summary card');
    await page.waitForTimeout(1800);
    assert.equal(requests.length, 0, 'Opening a saved Storyboard must not submit AI jobs, including history backfill');
  }
  await page.reload();
  await summarize.waitFor(); assert(await summarize.isEnabled(), 'A summary of older input can be remade');
  await page.waitForTimeout(1800);
  assert.equal(requests.length, 0, 'Reloading a Storyboard with stale summary must not submit AI jobs');
  assert.deepEqual(await service((s, repo) => { const p = repo.getProposal('entry-stale'); return [s.requirementSummaryBusy(p), s.requirementSummaryDone(p)]; }), [false, true], 'a finished summary of older input still counts as done');
  assert.deepEqual(await service((s, repo) => { const p = repo.getProposal('entry-missing'); return [s.requirementSummaryBusy(p), s.requirementSummaryDone(p)]; }), [false, false]);
  console.log('PASS opening and reloading saved Storyboards with missing/stale summaries submits no AI jobs.');

  await page.getByRole('button', { name: '새 제안서 시작', exact: true }).click(); await editor.waitFor();
  assert.equal(await card.count(), 0, 'A new proposal has no summary card before its first save');
  assert.equal(await popup.locator('[role=tab], .req-saved, #f-project').count(), 0, 'free-form only: no tabs, form or saved-state label');
  assert.deepEqual(await popup.locator('.bp-h').evaluate(h => [...h.children].slice(-2).map(c => c.className.split(' ')[0])), ['bp-actions', 'btn'], '이전 불러오기 sits immediately left of ×');
  await editor.click();
  await page.keyboard.type('전국 320개 매장의 메뉴를 본사에서 일괄 변경합니다. 11월 시범 설치 후 확대합니다. @QM55');
  await page.locator('.mmenu .mopt').first().waitFor(); await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  let state = await service((s, repo) => { const p = repo.getProposals()[0]; return { free: p.req.free, products: p.ctx.products, saved: !!p.reqSaved, summary: p.requirementSummary || null, stage: p.stage }; });
  assert.deepEqual(state, { free: [], products: [], saved: false, summary: null, stage: 'req' }, 'Typing and tagging change the draft only');
  assert.equal(count(), 0, 'Typing never starts a summary');
  await popup.getByRole('button', { name: '고객 요구사항 닫기', exact: true }).click(); await editor.waitFor({ state: 'detached' });
  await openPopup(); assert((await editor.innerText()).includes('320개'), 'Closing by accident keeps the draft');
  console.log('PASS writing in the popup neither saves nor summarises; the draft survives close and reopen.');

  slow = true;
  await save();
  await card.getByText('요약 중', { exact: true }).waitFor();
  state = await service((s, repo) => { const p = repo.getProposals()[0]; return { products: p.ctx.products, saved: !!p.reqSaved, stage: p.stage, busy: s.requirementSummaryBusy(p), done: s.requirementSummaryDone(p), text: p.req.free.map(x => x.t || '@').join('') }; });
  assert.deepEqual([state.products, state.saved, state.stage, state.busy, state.done], [['qm55c'], true, 'match', true, false], '저장 commits, links the tagged product and starts the first summary');
  assert(state.text.includes('320개') && state.text.includes('@'));
  await page.locator('.match-node .node').first().click({ trial: true }); // the board stays usable while the summary runs
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('winmate.v2.proposals') || '[]').some(p => p.requirementSummary?.jobId));
  await page.reload();
  await card.getByText('목표', { exact: true }).waitFor();
  slow = false;
  assert.equal(count(), 1);
  const text = await card.innerText();
  assert(text.includes('320'));
  assert(text.indexOf('목표') < text.indexOf('핵심 요구') && text.indexOf('핵심 요구') < text.indexOf('제안 방향'), '개요, then 목표 · 핵심 요구 · 제안 방향');
  assert(text.includes('목표 B') && text.includes('핵심 요구 B') && text.includes('시범 도입의 판단 조건'), 'every item of the three sections is listed');
  assert(!text.includes('배경은 카드에 없음'), 'only the three sections are shown');
  assert.equal(await card.locator('details, .rq-summary-refs').count(), 0);
  const id = await service((s, repo) => repo.getProposals()[0].id);
  await page.screenshot({ path: path.join(out, 'summary-card.png'), animations: 'disabled' });
  await page.reload(); await card.getByText('목표', { exact: true }).waitFor();
  assert.equal(count(), 1);
  assert(await summarize.isDisabled(), 'Unchanged requirements cannot be summarized again');
  console.log('PASS the first save starts exactly one background summary; the card lists 개요 · 목표 · 핵심 요구 · 제안 방향; reload reuses it.');

  await card.getByText('목표 B', { exact: true }).click(); await editor.waitFor();
  await popup.getByRole('button', { name: '고객 요구사항 닫기', exact: true }).click(); await editor.waitFor({ state: 'detached' });
  await service((s, repo) => repo.update(repo.getProposals()[0].id, p => { p.title = '제목만 수정'; }));
  assert(await summarize.isDisabled(), 'Changing only the proposal title does not enable resummarizing');
  await append(' 매장은 400곳으로 늘어납니다.');
  await page.waitForTimeout(1500);
  assert(await summarize.isDisabled(), 'An unsaved draft changes nothing on the board');
  await save();
  await page.waitForTimeout(1800);
  assert.equal(count(), 1, 'Saving changed requirements does not regenerate an existing summary');
  assert(await summarize.isEnabled(), 'Changed requirements enable 다시 요약');
  assert((await card.innerText()).includes('320'), 'The previous summary stays visible until replaced');
  const stale = await page.evaluate(async id => {
    const { getProposal } = await import('/src/repositories/proposals.js'), s = await import('/src/services/requirement-summary.js');
    try { const p = await s.withRequirementSummary(getProposal(id)); return { id: p.id, stale: s.taskRequirementContext(p, 'strategy').stale, done: s.requirementSummaryDone(p), busy: s.requirementSummaryBusy(p) }; }
    catch (error) { return { error: error.code }; }
  }, id);
  assert.deepEqual(stale, { id, stale: true, done: true, busy: false }, 'A summary of older input no longer blocks tasks; it is handed over marked stale');
  assert.equal(count(), 1, 'Tasks do not regenerate the summary either');
  console.log('PASS later saves only enable 다시 요약; tasks proceed with the existing summary marked stale.');

  slow = true;
  await summarize.click();
  await page.waitForFunction(() => document.querySelector('.rq-summary-state')?.textContent === '요약 중');
  assert.equal(await editor.count(), 0, '다시 요약 does not open the requirements popup');
  assert(await summarize.isDisabled(), 'A pending summary cannot be submitted twice');
  await page.waitForTimeout(1400);
  assert.equal(count(), 2);
  slow = false;
  await append(' 최종 500곳입니다.'); await save();   // newer input while the slow summary is still running
  await summarize.click();
  await page.waitForFunction(() => !document.querySelector('.rq-summary-card.is-pending') && document.querySelector('.rq-summary-overview')?.textContent.includes('500'));
  assert.equal(count(), 3); assert(await summarize.isDisabled());
  await page.waitForTimeout(5000);
  assert((await card.innerText()).includes('500'), 'A late result of older input cannot overwrite the newer summary');
  console.log('PASS 다시 요약 submits exactly one new summary; late results cannot overwrite newer inputs and completion disables the button.');

  fail = true;
  await append(' 예산은 미정입니다.'); await save();
  await summarize.click(); await card.getByRole('alert').waitFor();
  assert((await card.getByRole('alert').innerText()).includes('실패'));
  assert((await card.innerText()).includes('500'), 'The last good summary stays under the error');
  assert(await summarize.isEnabled(), 'A failed summary can be retried');
  fail = false;
  await summarize.click();
  await page.waitForFunction(() => !document.querySelector('.rq-summary-error') && !document.querySelector('.rq-summary-card.is-pending') && document.querySelector('.rq-summary-overview')?.textContent.includes('미정'));
  console.log('PASS a failed summary shows its error on the card and retries from the same button.');

  const composed = await page.evaluate(async id => {
    const repo = await import('/src/repositories/proposals.js'), s = await import('/src/services/requirement-summary.js');
    const started = await (await import('/src/services/poc-workflows.js')).startCompose(repo.getProposal(id));
    return { mode: started.mode, error: started.error, context: s.taskRequirementContext(repo.getProposal(id), 'layout') };
  }, id);
  assert.equal(composed.mode, 'job', 'Composition is not held back by the summary: ' + composed.error);
  assert(requests.at(-1).proposal.req.free.some(seg => (seg.t || '').includes('500')), 'Composition gets the unchanged original requirements');
  assert(composed.context.sections.strategy); assert(composed.context.overview.text.includes('미정')); assert.equal(composed.context.stale, undefined);
  assert(composed.context.originals.some(source => source.text.includes('500')));
  console.log('PASS automatic composition starts with the current structured summary plus the unchanged original requirements.');

  // Attach a long text: its start goes into the free-form text, the rest stays with the file — the summary reads both.
  const tail = '문서 후반의 필수 요구: 냉난방 전력 15% 절감을 실측으로 확인합니다.';
  await openPopup();
  await popup.locator('input[type=file]').setInputFiles({ name: '긴 요구사항.txt', mimeType: 'text/plain', buffer: Buffer.from('도입 배경을 확인합니다.\n'.repeat(6000) + tail) });
  await popup.locator('.fchip').waitFor();
  assert((await popup.locator('.req-file-note').innerText()).includes('앞'), 'A long attachment says in the popup that only its start is in the text');
  await save();
  await summarize.click();
  await page.waitForFunction(tail => document.querySelector('.rq-summary-overview')?.textContent.includes(tail), tail);
  const sent = requests.findLast(r => r.kind === 'requirements');
  const rest = sent.sources.find(s => s.kind === 'attachment'), free = sent.sources.find(s => s.id === 'free');
  assert(rest.label.endsWith('이어지는 원문') && rest.text.endsWith(tail) && rest.partial === false, 'The part that did not fit reaches the summary in full');
  assert(free.text.includes('[첨부] 긴 요구사항.txt') && free.text.length + rest.text.length > 6000 * 13, 'Nothing of the attachment is dropped');
  assert.deepEqual(sent.missing_sources, []);
  await page.reload(); await card.getByText('목표', { exact: true }).waitFor();
  const task = await page.evaluate(async id => {
    const s = await import('/src/services/requirement-summary.js'), { getProposal } = await import('/src/repositories/proposals.js');
    return s.taskRequirementContext(await s.withRequirementSummary(getProposal(id)), 'fill'); // tasks load the stored originals this way
  }, id);
  assert(task.originals.some(source => source.text.includes(tail)), 'The stored rest survives reload and stays referenceable');
  console.log('PASS a long attachment is split between the free-form text and its stored rest; the summary reads all of it after reload too.');

  await page.goto(base + '/storyboard/entry-missing');
  await openPopup();
  fail = true;
  await save();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('winmate.v2.proposals')).some(p => p.id === 'entry-missing' && p.requirementSummary?.status === 'error'));
  await card.waitFor({ state: 'detached' });
  fail = false;
  await openPopup(); await save();
  await card.getByText('목표', { exact: true }).waitFor();
  console.log('PASS a failed first summary leaves the card hidden; saving again retries and shows the completed summary.');
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await vite.close(); }
