// Existing-history backfill uses the real stores/job lifecycle with isolated transport fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { requirementSources, requirementSourceKey, SUMMARY_SECTIONS } from '../web/src/domain/proposals/requirement-summary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
const caps = { provider: { available: true }, functions: { requirements: { mode: 'real', ready: true, effective: 'llm' } } };
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: caps, user: { username: 'history-test', auth_enabled: false } };
const llm = { effective: 'llm', model: 'isolated-protocol-fixture', calls_ok: 1 };
const make = (id, text) => ({ id, title: id, customer: text ? '검증 고객' : '', createdAt: 1, updatedAt: 2, stage: 'req', req: { free: text ? [{ t: text }] : [], form: { keymen: [] }, files: [] }, ctx: { products: [], solutions: [], cases: [] }, parts: [] });
const result = body => {
  const source = body.sources.find(s => s.kind === 'customer') || body.sources[0];
  const point = { text: source.text, kind: 'fact', refs: [{ source_id: source.id, quote: source.text }] };
  return { version: 1, source_key: body.source_key, llm, sources: body.sources.map(({ id, label, kind }) => ({ id, label, kind })), coverage: { complete: true }, summary: { overview: point, ...Object.fromEntries(SUMMARY_SECTIONS.map(([key]) => [key, key === 'requirements' ? [point] : []])) } };
};
const proposals = [make('cached', '기존 요약을 재사용합니다.'), make('failed', '오류 기록의 요약을 다시 만듭니다.'), make('missing', '아직 요약이 없는 기록을 정리합니다.'), make('empty', '')];
proposals[0].requirementSummary = { status: 'ready', sourceKey: requirementSourceKey(proposals[0]), result: result({ source_key: requirementSourceKey(proposals[0]), sources: requirementSources(proposals[0]) }) };
proposals[1].requirementSummary = { status: 'error', sourceKey: requirementSourceKey(proposals[1]), error: 'previous unavailable' };
const requests = [], jobs = new Map(); let active = 0, peak = 0, browser;
const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(proposals => {
    if (!localStorage.getItem('history-test-initialized')) { localStorage.setItem('winmate.v2.proposals', JSON.stringify(proposals)); localStorage.setItem('history-test-initialized', '1'); }
  }, proposals);
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname === '/api/poc/capabilities') return route.fulfill({ json: caps });
    if (url.pathname === '/api/jobs' && request.method() === 'POST') {
      const body = request.postDataJSON(), id = 'history-summary-' + requests.length; requests.push(body); active++; peak = Math.max(peak, active);
      jobs.set(id, { body, completed: false });
      return route.fulfill({ json: { id, kind: 'requirements', status: 'queued', events: [], next_seq: 0 } });
    }
    if (url.pathname.startsWith('/api/jobs/')) {
      const id = url.pathname.split('/').at(-1), job = jobs.get(id);
      if (job) { if (!job.completed) { job.completed = true; active--; } return route.fulfill({ json: { id, kind: 'requirements', status: 'done', llm, result: result(job.body), events: [], next_seq: 0 } }); }
    }
    return route.fulfill({ status: 503, json: { code: 'isolated_no_other_api' } });
  });
  await context.route(url => url.pathname.startsWith('/img/'), route => route.abort());
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:' + vite.httpServer.address().port); await page.locator('.app').waitFor();
  const report = await page.evaluate(async () => (await import('/src/services/requirement-summary.js')).backfillRequirementSummaries());
  assert.equal(report.total, 3); assert.equal(report.results.filter(r => r.status === 'generated').length, 2); assert.equal(report.results.filter(r => r.status === 'reused').length, 1);
  assert.equal(requests.length, 2); assert(peak <= 2);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('winmate.v2.proposals')).filter(p => p.id !== 'empty').every(p => p.requirementSummary?.status === 'ready'));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.proposals')));
  for (const original of proposals) { const p = saved.find(p => p.id === original.id); assert.deepEqual(p.req, original.req); assert.deepEqual(p.parts, original.parts); assert.equal(p.updatedAt, original.updatedAt); }
  assert.equal(saved.find(p => p.id === 'empty').requirementSummary, undefined);
  await page.reload(); await page.locator('.app').waitFor();
  const again = await page.evaluate(async () => (await import('/src/services/requirement-summary.js')).backfillRequirementSummaries());
  assert(again.results.every(r => r.status === 'reused')); assert.equal(requests.length, 2);
  console.log('PASS existing histories are backfilled with two bounded workers; ready summaries are reused, errors recover, originals/order stay unchanged, and reload does not regenerate.');
} finally { await browser?.close(); await vite.close(); }
