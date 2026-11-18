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
  await server.listen(); browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
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
  const ids = new Set([first.route.id]);
  const browserEntries = await page.evaluate(() => history.length);
  for (let i = 0; i < 4; i++) {
    await start();
    const { proposals, route } = await snapshot();
    assert.deepEqual(proposals.map(p => p.id), [route.id]);
    assert(!ids.has(route.id)); ids.add(route.id);
    assert.equal(new URL(page.url()).pathname, '/storyboard/' + route.id);
  }
  assert.equal(await page.locator('.sb-list .sb-item').count(), 1);
  assert.equal(await page.evaluate(() => history.length), browserEntries);
  pass('repeated starts create fresh IDs and replace both the previous blank history entry and its browser URL');

  await page.locator('.sidebar').hover({ position: { x: 20, y: 20 } });
  await page.locator('.sb-brand').click(); await page.locator('.home').waitFor();
  await page.locator('.home-actions .start').click(); await page.locator('#free-ed').waitFor();
  const fromHome = await snapshot();
  assert(!ids.has(fromHome.route.id)); assert.equal(fromHome.proposals.length, 1);
  await page.reload(); await page.locator('#free-ed').waitFor();
  assert.deepEqual((await snapshot()).proposals.map(p => p.id), [fromHome.route.id]);
  await start();
  const reopened = await snapshot();
  assert.notEqual(reopened.route.id, fromHome.route.id); assert.equal(reopened.proposals.length, 1);
  pass('home replaces the latest blank after leaving it, and reloading retains only the replacement');

  await page.getByRole('dialog', { name: '고객 요구사항', exact: true }).getByRole('button', { name: '고객 요구사항 닫기', exact: true }).click();
  await page.locator('#free-ed').waitFor({ state: 'detached' }); await start();
  const writingId = (await snapshot()).route.id;
  assert.notEqual(writingId, reopened.route.id);
  pass('the replacement opens its own requirements editor');

  await page.locator('#free-ed').fill('전국 매장의 메뉴판을 원격 관리하고 싶습니다.');
  await start(); const typed = await snapshot();
  assert.deepEqual(typed.proposals.map(p => p.id), [typed.route.id, writingId]);
  assert.equal((await page.locator('#free-ed').innerText()).trim(), '');
  assert.deepEqual(typed.proposals[1].req.free, []);
  await page.locator('.sidebar').hover({ position: { x: 20, y: 20 } });
  await page.locator('[data-proposal-id="' + writingId + '"] .sb-item').click();
  assert((await page.locator('#free-ed').innerText()).includes('원격 관리'));
  pass('unsaved input belongs to the original proposal and remains editable when returning to it');

  await page.getByRole('dialog', { name: '고객 요구사항', exact: true }).getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('#free-ed').waitFor({ state: 'detached' });
  await page.waitForFunction(async () => { const p = (await import('/src/repositories/proposals.js')).getProposals()[0]; return p.requirementSummary && p.requirementSummary.status !== 'pending'; });
  const entered = (await snapshot()).proposals[0];
  assert.deepEqual(entered.req.free, [{ t: '전국 매장의 메뉴판을 원격 관리하고 싶습니다.' }]); assert.equal(entered.stage, 'match');
  await start(); const next = await snapshot();
  assert.equal(next.proposals.length, 3); assert.notEqual(next.route.id, entered.id);
  assert.deepEqual(next.proposals.find(p => p.id === entered.id), entered);
  assert.equal((await page.locator('#free-ed').innerText()).trim(), '', 'the new entry starts with an empty draft');
  await start(); assert.equal((await snapshot()).proposals.length, 3);
  pass('saved requirements survive while the next empty draft remains a single entry');

  const withFile = (await snapshot()).route.id;
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'waiting.txt') {
        File.prototype.arrayBuffer = original;
        await new Promise(resolve => { window.finishAttachment = resolve; });
      }
      return original.call(this);
    };
  });
  await page.locator('.req-files input[type=file]').setInputFiles({ name: 'waiting.txt', mimeType: 'text/plain', buffer: Buffer.from('첨부 테스트') });
  await page.waitForFunction(() => !!window.finishAttachment);
  await start(); assert((await snapshot()).proposals.some(p => p.id === withFile));
  await page.evaluate(() => window.finishAttachment());
  await page.locator('.sidebar').hover({ position: { x: 20, y: 20 } });
  await page.locator('[data-proposal-id="' + withFile + '"] .sb-item').click();
  await page.waitForFunction(() => document.querySelector('#free-ed')?.innerText.includes('첨부 테스트'));
  pass('an attachment still being read completes in the original proposal after starting another');

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
      spacePlan: p => { p.spacePlan = { spaces: [{ name: '상담실' }] }; },
      scenario: p => { p.scenario = 'example'; },
      foreignShare: p => { p._share = { isOwner: false, permission: 'view', revision: 1 }; },
      editableShare: p => { p._share = { isOwner: true, permission: 'edit', revision: 2 }; },
    };
    const results = [];
    for (const [name, mutate] of Object.entries(mutations)) {
      clear(); const id = repo.createProposal(); repo.update(id, mutate, { touch: false });
      const before = JSON.stringify(repo.getProposal(id)); const fresh = repo.createProposal();
      results.push({ name, safe: fresh !== id && repo.getProposals().length === 2 && JSON.stringify(repo.getProposal(id)) === before });
    }
    clear(); const empty = repo.createProposal();
    repo.update(empty, p => { p.reqTab = 'form'; p.req.free = [{ t: '\n  ' }]; }, { touch: false });
    results.push({ name: 'tabs and whitespace stay empty', safe: repo.createProposal() !== empty && !repo.getProposal(empty) && repo.getProposals().length === 1 });
    clear(); const original = repo.createProposal(), document = structuredClone(repo.getProposal(original));
    const snapshot = { document, sourceId: original, token: 'x'.repeat(43), isOwner: true, canEdit: true, permission: 'view', revision: 1 };
    repo.sharedProposal(snapshot, original);
    const replacement = repo.createProposal();
    repo.sharedProposal(snapshot, original);  // a poll already in flight when the user clicked
    results.push({ name: 'automatic owner links and late snapshots do not duplicate a blank history', safe: replacement !== original && !repo.getProposal(original) && repo.getProposals().length === 1 && repo.getProposals()[0].id === replacement });
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
