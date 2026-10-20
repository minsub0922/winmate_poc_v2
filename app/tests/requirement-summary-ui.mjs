// Isolated protocol fixtures test lifecycle and UI. Model quality is checked separately with real Gemini.
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
let browser, next = 0, slow = false;
const llm = { effective: 'llm', llm_used: true, model: 'isolated-protocol-fixture', calls_ok: 1 };
function result(body) {
  const source = body.sources.find(s => s.kind === 'attachment') || body.sources.find(s => s.kind === 'customer') || body.sources[0];
  const quote = source.text.slice(-Math.min(130, source.text.length));
  const point = (text = quote, kind = 'fact') => ({ text, kind, refs: [{ source_id: source.id, quote, start: source.text.indexOf(quote), end: source.text.length }] });
  const summary = { overview: point(), ...Object.fromEntries(['background', 'goals', 'requirements', 'constraints', 'stakeholders', 'decision_criteria', 'risks', 'questions', 'strategy'].map(k => [k, []])) };
  summary.goals = [point()]; summary.requirements = [point()]; summary.strategy = [point('원문을 기준으로 시범 도입의 판단 조건을 제안합니다.', 'inference')];
  return { version: 1, source_key: body.source_key, summary, sources: body.sources.map(({ id, label, kind, partial }) => ({ id, label, kind, partial })), coverage: { complete: true }, llm };
}
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(url => url.pathname.startsWith('/api/'), async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname === '/api/poc/capabilities') return route.fulfill({ json: caps });
    if (url.pathname === '/api/jobs' && request.method() === 'POST') {
      const body = request.postDataJSON(); requests.push(body);
      const id = 'summary-test-' + ++next, job = { id, kind: body.kind, title: '요약 테스트', status: 'queued', events: [], next_seq: 0 };
      jobs.set(id, { job, body, available: Date.now() + (slow ? 4500 : 300) });
      return route.fulfill({ json: job });
    }
    if (url.pathname.startsWith('/api/jobs/')) {
      if (url.pathname.endsWith('/cancel')) return route.fulfill({ status: 503, json: { code: 'test_cancel_race' } });
      const data = jobs.get(url.pathname.split('/').at(-1));
      if (!data) return route.fulfill({ status: 404, json: { code: 'not_found' } });
      return route.fulfill({ json: data.body.kind === 'requirements' && Date.now() >= data.available
        ? { ...data.job, status: 'done', llm, result: result(data.body) } : { ...data.job, status: 'running' } });
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
  for (const history of histories) {
    await page.goto(base + '/storyboard/' + history.id);
    await page.getByRole('region', { name: '고객 요구사항 요약', exact: true }).waitFor();
    await page.waitForTimeout(1800);
    assert.equal(requests.length, 0, 'Opening a saved Storyboard must not submit AI jobs, including history backfill');
  }
  await page.reload();
  await page.getByRole('button', { name: '고객 요구사항 다시 요약', exact: true }).waitFor();
  await page.waitForTimeout(1800);
  assert.equal(requests.length, 0, 'Reloading a Storyboard with stale summary must not submit AI jobs');
  console.log('PASS opening and reloading saved Storyboards with missing/stale summaries submits no AI jobs.');
  await page.getByRole('button', { name: '새 제안서 시작', exact: true }).click();
  const input = page.getByRole('textbox', { name: '자유형식 요구사항', exact: true }); await input.waitFor();
  slow = true;
  await input.fill('전국 320개 매장의 메뉴를 본사에서 일괄 변경합니다. 11월 시범 설치 후 확대합니다.');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const card = page.getByRole('region', { name: '고객 요구사항 요약', exact: true });
  await card.getByText('요약 중', { exact: true }).waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('winmate.v2.proposals') || '[]').some(p => p.requirementSummary?.jobId));
  await page.reload();
  await card.getByText('AI · 원문 연결', { exact: true }).waitFor();
  slow = false;
  assert.equal(requests.filter(r => r.kind === 'requirements').length, 1);
  assert((await card.innerText()).includes('320'));
  await card.getByRole('button', { name: /원문 보기/ }).first().click();
  const sourceDialog = page.getByRole('dialog', { name: /요구사항 원문/ }); await sourceDialog.waitFor();
  assert((await sourceDialog.locator('mark').innerText()).includes('320'));
  await sourceDialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  const id = await page.evaluate(async () => (await import('/src/repositories/proposals.js')).getProposals()[0].id);
  await page.screenshot({ path: path.join(out, 'summary-card.png'), animations: 'disabled' });
  await page.reload(); await card.getByText('AI · 원문 연결', { exact: true }).waitFor();
  assert.equal(requests.filter(r => r.kind === 'requirements').length, 1);
  console.log('PASS save starts the real job protocol immediately; source highlighting works; reload reuses the saved context.');

  const summarize = card.getByRole('button', { name: '고객 요구사항 다시 요약', exact: true });
  const confirmation = page.getByRole('dialog', { name: '고객 요구사항을 다시 요약할까요?', exact: true });
  const count = () => requests.filter(r => r.kind === 'requirements').length;
  const changeRequirements = text => page.evaluate(async ({ id, text }) => {
    const repo = await import('/src/repositories/proposals.js'); repo.update(id, p => { p.req.free = [{ t: text }]; });
  }, { id, text });
  assert(await summarize.isDisabled(), 'Unchanged requirements cannot be summarized again');
  await page.evaluate(async id => (await import('/src/repositories/proposals.js')).update(id, p => { p.title = '제목만 수정'; }), id);
  assert(await summarize.isDisabled(), 'Changing only the proposal title does not enable resummarizing');
  await changeRequirements('매장 400곳의 원격 메뉴를 관리합니다.');
  await card.getByText('요구사항 변경', { exact: true }).waitFor();
  assert(await summarize.isEnabled());
  await page.waitForTimeout(1800);
  assert.equal(count(), 1, 'Editing requirements does not automatically regenerate an existing summary');
  assert((await card.innerText()).includes('320'), 'The previous summary stays visible until replaced');
  const blocked = await page.evaluate(async id => {
    const { getProposal } = await import('/src/repositories/proposals.js');
    try { await (await import('/src/services/requirement-summary.js')).withRequirementSummary(getProposal(id)); }
    catch (error) { return error.code; }
  }, id);
  assert.equal(blocked, 'summary_confirmation_required');
  await summarize.click(); await confirmation.waitFor();
  await page.waitForTimeout(1400); assert.equal(count(), 1, 'Opening confirmation cannot submit an AI job');
  await confirmation.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(count(), 1); assert(await summarize.isEnabled());
  await summarize.click(); await confirmation.waitFor(); await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'detached' }); assert.equal(count(), 1);
  await changeRequirements('전국 320개 매장의 메뉴를 본사에서 일괄 변경합니다. 11월 시범 설치 후 확대합니다.');
  await card.getByText('AI · 원문 연결', { exact: true }).waitFor();
  assert(await summarize.isDisabled(), 'Reverting to the summarized input disables the button again');
  await changeRequirements('매장 400곳의 원격 메뉴를 관리합니다.');
  await summarize.click(); await confirmation.waitFor();
  await changeRequirements('매장 450곳의 원격 메뉴를 관리합니다.');
  await confirmation.waitFor({ state: 'detached' }); assert.equal(count(), 1);
  console.log('PASS resummarizing requires changed inputs and confirmation; cancellation, Escape and changed confirmation inputs submit no AI job.');

  slow = true;
  await changeRequirements('매장 400곳의 원격 메뉴를 관리합니다.');
  await summarize.click(); await confirmation.waitFor();
  await confirmation.getByRole('button', { name: '요약 시작', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.rq-summary-state')?.textContent === '요약 중');
  assert(await summarize.isDisabled(), 'A pending summary cannot be submitted twice');
  await page.waitForTimeout(1400);
  assert.equal(count(), 2);
  slow = false;
  await changeRequirements('매장 500곳의 원격 메뉴를 관리합니다.');
  await summarize.click(); await confirmation.waitFor();
  await confirmation.getByRole('button', { name: '요약 시작', exact: true }).click();
  await card.getByText('AI · 원문 연결', { exact: true }).waitFor();
  assert.equal(count(), 3); assert(await summarize.isDisabled());
  assert((await card.innerText()).includes('500'));
  await page.waitForTimeout(5000);
  assert((await card.innerText()).includes('500')); assert(!(await card.innerText()).includes('400'));
  console.log('PASS confirmation submits exactly one new summary; late results cannot overwrite newer inputs and completion disables the button.');

  await page.evaluate(async id => { const repo = await import('/src/repositories/proposals.js'); await (await import('/src/services/poc-workflows.js')).startCompose(repo.getProposal(id)); }, id);
  const compose = requests.findLast(r => r.kind === 'layout');
  assert(compose.requirement_context.sections.strategy); assert(compose.input.free_text.includes('500'));
  assert(compose.requirement_context.overview.text.includes('500'));
  assert(compose.requirement_context.originals.some(source => source.text.includes('500')));
  console.log('PASS automatic composition receives the current structured summary plus the unchanged original requirements.');

  const tail = '문서 후반의 필수 요구: 냉난방 전력 15% 절감을 실측으로 확인합니다.';
  await page.evaluate(async ({ id, tail }) => {
    const { readAttachments } = await import('/src/services/attachments.js');
    const [file] = await readAttachments([new File(['도입 배경을 확인합니다. '.repeat(3000) + tail], '긴 요구사항.txt', { type: 'text/plain' })], { full: true });
    delete file.fullText;
    (await import('/src/repositories/proposals.js')).update(id, p => { p.req.files = [file]; });
  }, { id, tail });
  await summarize.click(); await confirmation.waitFor();
  await confirmation.getByRole('button', { name: '요약 시작', exact: true }).click();
  await card.getByText('AI · 원문 연결', { exact: true }).waitFor();
  await page.waitForFunction(tail => document.querySelector('.rq-summary-overview')?.textContent.includes(tail), tail);
  const full = requests.findLast(r => r.kind === 'requirements').sources.find(s => s.kind === 'attachment');
  assert(full.text.length > 20000); assert(full.text.endsWith(tail)); assert.equal(full.partial, false);
  await page.reload(); await card.getByText('AI · 원문 연결', { exact: true }).waitFor();
  await card.getByRole('button', { name: /원문 보기 · 긴 요구사항/ }).first().click();
  const longDialog = page.getByRole('dialog', { name: /긴 요구사항/ }); await longDialog.waitFor();
  assert((await longDialog.locator('pre').innerText()).endsWith(tail));
  assert((await longDialog.locator('mark').innerText()).includes(tail));
  const task = await page.evaluate(async id => (await import('/src/services/requirement-summary.js')).taskRequirementContext((await import('/src/repositories/proposals.js')).getProposal(id), 'fill'), id);
  assert(task.originals.some(source => source.text.includes(tail)));
  await longDialog.screenshot({ path: path.join(out, 'long-original.png'), animations: 'disabled' });
  console.log('PASS full attachment text, including its final requirements, survives reload in IndexedDB and remains directly referenceable.');
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await vite.close(); }
