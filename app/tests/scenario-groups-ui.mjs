// 샘플 버티컬 시나리오 — before a search the page is a grid of 요구사항 타입 cards (symbol · name · sample count · description).
// A card opens its samples in a popup (표준 제안서: sections by industry; other types: one list in industry order),
// an item opens its read-only Storyboard. Filters change the counts; a search shows rows instead of cards.
// node app/tests/scenario-groups-ui.mjs   (Vite in-process, /api stubbed — no server or model needed)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'scenario-groups-test', auth_enabled: false } };
const output = path.join(root, 'app/tests/output/scenario-groups'); fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const checks = [], errors = []; const pass = text => { checks.push(text); console.log('PASS', text); };
let browser;
try {
  await server.listen();
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await context.route(url => url.pathname.startsWith('/api/'), route => new URL(route.request().url()).pathname === '/api/bootstrap'
    ? route.fulfill({ json: boot }) : route.fulfill({ status: 503, json: { code: 'test_no_api' } }));
  await context.route('**/img/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = [path.join(root, relative), path.join(root, 'reference/live', relative), path.join(root, 'app/data/static', relative)].find(f => fs.existsSync(f));
    return file ? route.fulfill({ path: file }) : route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
  const url = 'http://127.0.0.1:' + server.httpServer.address().port;
  await page.goto(url); await page.locator('.home').waitFor();
  const data = await page.evaluate(async () => {
    const { SCENARIOS, REQ_TYPES, REQ_ORDER } = await import('/src/domain/templates/scenarios.js'); const { INDUSTRIES } = await import('/src/services/catalog.js');
    return { order: REQ_ORDER, types: REQ_TYPES, rank: Object.fromEntries(INDUSTRIES.map((x, i) => [x.code, i])), all: SCENARIOS.map(s => ({ id: s.id, req: s.req, ind: s.ind || null, title: s.title })) };
  });
  const count = (k, ind) => data.all.filter(s => s.req === k && (!ind || s.ind === ind)).length;
  const toPage = async (bs) => {
    await page.evaluate(async bs => { const { loadUi, saveUi } = await import('/src/repositories/proposals.js'); saveUi({ ...loadUi(), route: { name: 'scenarios' }, bs }); }, bs || {});
    await page.reload(); await page.locator('#bs-q').waitFor(); await page.mouse.move(page.viewportSize().width - 3, 2);
  };
  const cards = () => page.locator('.bsg-card');
  const listDialog = () => page.getByRole('dialog').last();

  // 1. before a search — one card per type, in REQ_ORDER, with symbol · name · count · description, and no rows
  await toPage(); await cards().first().waitFor();
  const shown = await cards().evaluateAll(cs => cs.map(c => ({ req: c.dataset.req, name: c.querySelector('.bsg-t').innerText, n: c.querySelector('.bsg-n b').innerText, desc: c.querySelector('.bsg-d').innerText,
    icon: c.querySelector('.bsg-ic svg path').getAttribute('d'), label: c.getAttribute('aria-label'), tag: c.tagName })));
  assert.deepEqual(shown.map(c => c.req), data.order);
  const dots = 'M5 12h.01 M12 12h.01 M19 12h.01'; // Icon's fallback for an unknown name
  for (const c of shown) {
    const t = data.types[c.req];
    assert.equal(c.tag, 'BUTTON'); assert.equal(c.name, t.label); assert.equal(c.desc, t.desc); assert.equal(Number(c.n), count(c.req));
    assert.ok(t.icon && c.icon && c.icon !== dots, c.req + ' has its own symbol'); assert.equal(c.label, t.label + ' 샘플 ' + c.n + '개 목록 열기');
  }
  assert.equal(new Set(shown.map(c => c.icon)).size, shown.length, 'every type has a different symbol');
  assert.equal(shown.reduce((a, c) => a + Number(c.n), 0), data.all.length);
  assert.equal(await page.locator('.bsl').count(), 0);
  pass('before a search: ' + shown.length + ' type cards (symbol · name · sample count · description), ' + data.all.length + ' samples, no rows');

  const firstRow = await cards().evaluateAll(cs => { const top = cs[0].getBoundingClientRect().top; return cs.filter(c => Math.abs(c.getBoundingClientRect().top - top) < 2).length; });
  assert.equal(firstRow, 4); await page.screenshot({ path: path.join(output, 'grid-1440.png') });
  pass('desktop grid holds at most four cards per line');

  // 2. 표준 제안서 — sectioned by industry, the find box narrows it, an item opens its Storyboard
  await page.locator('.bsg-card[data-req="std"]').click(); await listDialog().waitFor();
  assert.equal(await listDialog().locator('.mhead h2').innerText(), '표준 제안서');
  assert.equal(await listDialog().locator('.bsx-item').count(), count('std'));
  assert.ok(await listDialog().locator('.bsx-grp h3').count() > 1); assert.equal(await listDialog().locator('.bsx-eb').count(), 0);
  await listDialog().getByRole('searchbox', { name: '표준 제안서 찾기', exact: true }).fill('병원');
  const hospital = await listDialog().locator('.bsx-item').count(); assert.ok(hospital > 0 && hospital < count('std'));
  await page.screenshot({ path: path.join(output, 'popup-std.png') });
  await listDialog().getByRole('searchbox', { name: '표준 제안서 찾기', exact: true }).fill('');
  await listDialog().getByRole('button', { name: '닫기', exact: true }).first().click(); await page.locator('.modal.wide').waitFor({ state: 'detached' });
  pass('표준 제안서 popup: ' + count('std') + ' decks by industry, find box narrows to ' + hospital);

  // 3. another type — one list in industry order with the industry above each title; an item opens its Storyboard
  await page.locator('.bsg-card[data-req="new"]').click(); await listDialog().waitFor();
  assert.equal(await listDialog().locator('.mhead h2').innerText(), data.types.new.label);
  const items = await listDialog().locator('.bsx-item').evaluateAll(xs => xs.map(x => ({ title: x.querySelector('.bsx-meta b').innerText, eb: x.querySelector('.bsx-eb')?.innerText })));
  assert.equal(items.length, count('new')); assert.ok(items.every(x => x.eb));
  const ranks = items.map(x => { const s = data.all.find(s => s.title === x.title); return data.rank[s.ind] ?? 99; });
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'industry order');
  await page.screenshot({ path: path.join(output, 'popup-new.png') });
  await listDialog().locator('.bsx-item').first().click(); const board = page.locator('.modal.sbv'); await board.waitFor();
  assert.ok((await board.innerText()).includes(items[0].title)); assert.ok(await board.locator('.node').count() > 0);
  await board.getByRole('button', { name: '닫기', exact: true }).first().click(); await board.waitFor({ state: 'detached' });
  assert.equal(await listDialog().locator('.mhead h2').innerText(), data.types.new.label, 'the list stays open under the Storyboard');
  await page.keyboard.press('Escape'); await page.locator('.modal.wide').waitFor({ state: 'detached' });
  pass('other types: one list in industry order (' + items.length + '), item → read-only Storyboard, list stays underneath');

  // 4. keyboard — a card is a button
  await page.locator('.bsg-card[data-req="compete"]').focus(); await page.keyboard.press('Enter'); await listDialog().waitFor();
  assert.equal(await listDialog().locator('.bsx-item').count(), count('compete')); await page.keyboard.press('Escape'); await page.locator('.modal.wide').waitFor({ state: 'detached' });
  pass('Enter on a focused card opens its list, Escape closes it');

  // 5. filters apply before a search — counts follow, empty types drop out, the popup holds only the filtered samples
  await toPage({ ind: 'HT' }); await cards().first().waitFor();
  const filtered = await cards().evaluateAll(cs => cs.map(c => [c.dataset.req, Number(c.querySelector('.bsg-n b').innerText)]));
  assert.deepEqual(filtered, data.order.map(k => [k, count(k, 'HT')]).filter(x => x[1]));
  await page.locator('.bsg-card[data-req="' + filtered[0][0] + '"]').click(); await listDialog().waitFor();
  assert.equal(await listDialog().locator('.bsx-item').count(), filtered[0][1]); await page.keyboard.press('Escape');
  pass('업종 filter (호텔): ' + filtered.map(x => x.join(' ')).join(' · '));

  // 6. a search shows rows instead of cards; clearing it brings the cards back
  await toPage({}); await cards().first().waitFor();
  await page.locator('#bs-q').fill('메뉴보드'); await page.locator('.bsl').first().waitFor();
  assert.equal(await cards().count(), 0); assert.ok(await page.locator('.bsl .bsl-sheet').count() > 0);
  await page.locator('#bs-q').fill(''); await cards().first().waitFor(); assert.equal(await page.locator('.bsl').count(), 0);
  pass('a search shows rows; clearing it shows the type cards again');

  // 7. phone — one card per line, nothing wider than the screen; dark theme keeps the type colours
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const phone = await cards().evaluateAll(cs => ({ lefts: new Set(cs.map(c => Math.round(c.getBoundingClientRect().left))).size, over: document.documentElement.scrollWidth > innerWidth }));
  assert.equal(phone.lefts, 1); assert.equal(phone.over, false); await page.screenshot({ path: path.join(output, 'grid-390.png') });
  await page.locator('.bsg-card[data-req="ops"]').click(); await listDialog().waitFor();
  assert.ok(await listDialog().locator('.bsx-item').first().evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  await page.screenshot({ path: path.join(output, 'popup-ops-390.png') }); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(200);
  const dark = await page.locator('.bsg-card[data-req="ops"] .bsg-ic').evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  assert.notEqual(dark[0], dark[1]); await page.screenshot({ path: path.join(output, 'grid-1440-dark.png') });
  pass('phone: one card per line without overflow; dark theme keeps the symbol tint');

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: true, checks, errors }, null, 2));
} finally { await browser?.close(); await server.close(); }
