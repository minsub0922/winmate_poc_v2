// Exercise the real store and both creation buttons without calling a model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const bootstrap = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null,
  user: { username: 'new-proposal-test', auth_enabled: false } };
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'),
  logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const checks = [], errors = [];
const pass = message => { checks.push(message); console.log('PASS', message); };
let browser;
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await context.route(url => url.pathname.startsWith('/api/'), route => new URL(route.request().url()).pathname === '/api/bootstrap'
    ? route.fulfill({ json: bootstrap }) : route.fulfill({ status: 503, json: { code: 'test_no_api' } }));
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.locator('.home').waitFor();
  const snapshot = () => page.evaluate(async () => {
    const repo = await import('/src/repositories/proposals.js');
    return { proposals: repo.getProposals(), route: repo.loadUi().route };
  });
  const start = async () => {
    await page.locator('.sidebar').hover({ position: { x: 20, y: 20 } });
    await page.locator('.sb-new').click(); await page.locator('#free-ed').waitFor();
    await page.mouse.move(1480, 2);
  };
  await page.locator('.home-actions .start').click(); await page.locator('#free-ed').waitFor();
  const first = await snapshot(); assert.equal(first.proposals.length, 1);
  for (let i = 0; i < 4; i++) await start();
  assert.deepEqual((await snapshot()).proposals, first.proposals);
  assert.equal(await page.locator('.sb-list .sb-item').count(), 1);
  pass('home and repeated sidebar creation reuse the same blank history entry');

  await page.locator('.sidebar').hover({ position: { x: 20, y: 20 } });
  await page.locator('.sb-home').first().click(); await page.locator('.home').waitFor();
  await page.locator('.home-actions .start').click(); await page.locator('#free-ed').waitFor();
  assert.equal((await snapshot()).route.id, first.route.id);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('winmate.v2.proposals') || '[]').length === 1);
  await page.reload(); await page.locator('#free-ed').waitFor(); await start();
  assert.equal((await snapshot()).route.id, first.route.id);
  pass('blank draft is reused after leaving the page and after refresh');

  // Closing requirements must not leave a reused draft with no input popup.
  await page.getByRole('dialog', { name: '고객 요구사항', exact: true }).getByRole('button', { name: '고객 요구사항 닫기', exact: true }).click();
  await page.locator('#free-ed').waitFor({ state: 'detached' }); await start();
  assert.equal((await snapshot()).route.id, first.route.id);
  pass('starting the reused draft reopens the requirements editor');

  await page.locator('#free-ed').fill('전국 매장의 메뉴판을 원격 관리하고 싶습니다.');
  const entered = (await snapshot()).proposals[0];
  await start(); const next = await snapshot();
  assert.equal(next.proposals.length, 2); assert.notEqual(next.route.id, entered.id);
  assert.deepEqual(next.proposals.find(p => p.id === entered.id), entered);
  await start(); assert.equal((await snapshot()).proposals.length, 2);
  pass('entered requirements survive while the next empty draft remains a single entry');

  const guards = await page.evaluate(async () => {
    const repo = await import('/src/repositories/proposals.js');
    const clear = () => repo.getProposals().slice().forEach(p => repo.deleteProposal(p.id));
    const mutations = {
      title: p => { p.title = '보존할 이름'; }, customer: p => { p.customer = '고객사'; },
      industry: p => { p.ind = 'FB'; }, customIndustry: p => { p.indName = '직접 입력 업종'; },
      mention: p => { p.req.free = [{ ref: 'product:qm55c' }]; },
      link: p => { p.req.free = [{ t: 'https://example.com', link: { title: '참고' } }]; },
      project: p => { p.req.form.project = '프로젝트'; }, formCustomer: p => { p.req.form.customer = '고객'; },
      target: p => { p.req.form.target = '운영팀'; }, note: p => { p.req.form.note = '의견'; },
      noteMention: p => { p.req.form.noteSegs = [{ ref: 'solution:magicinfo' }]; },
      keyman: p => { p.req.form.keymen[0].name = '담당자'; },
      requirement: p => { p.req.form.keymen[0].reqs = [[{ t: '요구사항' }]]; },
      weight: p => { p.req.form.keymen[0].weight = 50; },
      extraKeyman: p => { p.req.form.keymen.push({ id: 'extra', name: '', weight: 0, reqs: [[]] }); },
      extraRequirement: p => { p.req.form.keymen[0].reqs.push([]); },
      attachment: p => { p.req.files.push({ id: 'file', name: '요구사항.pdf' }); },
      product: p => { p.ctx.products.push('qm55c'); }, solution: p => { p.ctx.solutions.push('magicinfo'); },
      case: p => { p.ctx.cases.push('1490'); },
      part: p => { p.parts.push({ id: 'part', name: '구성', items: [], layouts: [] }); },
      saved: p => { p.reqSaved = 'saved'; p.stage = 'match'; },
      exported: p => { p.exportedAt = Date.now(); },
      shared: p => { p._share = { token: 'example', isOwner: true, canEdit: true }; },
      agent: p => { p.agent = { jobs: { test: { purpose: 'rfp' } } }; },
    };
    const results = [];
    for (const [name, mutate] of Object.entries(mutations)) {
      clear(); const id = repo.createProposal(); repo.update(id, mutate, { touch: false });
      const before = JSON.stringify(repo.getProposal(id)); const fresh = repo.createProposal();
      results.push({ name, safe: fresh !== id && repo.getProposals().length === 2 && JSON.stringify(repo.getProposal(id)) === before });
    }
    clear(); const empty = repo.createProposal();
    repo.update(empty, p => { p.reqTab = 'form'; p.req.free = [{ t: '\n  ' }]; }, { touch: false });
    results.push({ name: 'tabs and whitespace stay empty', safe: repo.createProposal() === empty && repo.getProposals().length === 1 });
    clear(); const older = repo.createProposal(); repo.update(older, p => { p.title = '작업 중'; });
    const latest = repo.createProposal();
    repo.update(older, p => { p.title = '최신 작업 중'; p.updatedAt = Date.now() + 1000; }, { touch: false });
    const fresh = repo.createProposal();
    results.push({ name: 'only latest history is considered', safe: fresh !== latest && repo.getProposals().length === 3 });
    return results;
  });
  for (const result of guards) { assert(result.safe, result.name); pass('store: ' + result.name); }
  assert.deepEqual(errors, []);
  console.log(`${checks.length}/${checks.length} new proposal checks passed`);
} finally {
  await browser?.close(); await server.close();
}
