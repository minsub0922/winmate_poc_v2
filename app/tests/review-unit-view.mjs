// Review 장별 보기: the hover enlargement never covers the sheet it describes, and the sheet popup
// shows every sheet as a thumbnail strip under the enlarged one, scrolls only its notes, and lets
// the sheet/notes split be dragged with a short bar between them.
// Real repository initialization and native rendering; never invokes a model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const bundle = read('app/web/src/domain/review/linked-review-examples.json');
const boot = { catalog: read('app/data/catalog.json'), products: read('app/data/products_db.json'), images: read('app/data/images.json'), capabilities: null, user: { username: 'admin', auth_enabled: true } };
const out = path.join(root, 'app/tests/output/review-unit-view'); fs.mkdirSync(out, { recursive: true });
const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const passed = [], errors = []; let browser, page;
const pass = s => { passed.push(s); console.log('PASS ' + s); };
const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
async function contextFor() {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (u.pathname === '/api/auth/status') return route.fulfill({ json: { enabled: false, configured: true, authenticated: true } });
    if (u.pathname.startsWith('/api/product-packs/')) return route.fulfill({ json: read('reference/live/img/prod/d00.json') });
    if (u.pathname === '/api/storyboards') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: { code: 'unit_view_test_no_model' } });
  });
  await context.route(url => ['/img/', '/lib/', '/fonts/'].some(p => url.pathname.startsWith(p)), route => {
    const u = new URL(route.request().url()), rel = decodeURIComponent(u.pathname).slice(1);
    const file = path.join(root, u.pathname.startsWith('/fonts/') ? 'app/web/public' : 'app/data/static', rel);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
  });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  await context.addInitScript(() => {
    if (!localStorage.getItem('unit-view-test-initialized')) {
      localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'reviews' } }));
      localStorage.setItem('unit-view-test-initialized', '1');
    }
  });
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + vite.httpServer.address().port);
  await page.getByRole('heading', { name: '제안서 검토', exact: true }).waitFor();
  return context;
}
const box = sel => page.locator(sel).first().boundingBox();
// Put the top of the sheet rail at viewport y.
const railAt = y => page.locator('.rv-slide-rail').evaluate((el, y) => {
  let pane = el.parentElement;
  while (pane && !(/auto|scroll/.test(getComputedStyle(pane).overflowY) && pane.scrollHeight > pane.clientHeight)) pane = pane.parentElement;
  (pane || document.scrollingElement).scrollBy({ top: el.getBoundingClientRect().top - y, behavior: 'instant' });
}, y);
async function hoverCard(i) {
  const card = page.locator('.rv-slide-card').nth(i);
  await card.hover();
  const hover = page.locator('.rv-slide-hover'); await hover.waitFor(); await page.waitForTimeout(250);
  const width = await page.evaluate(() => document.documentElement.clientWidth), height = await page.evaluate(() => document.documentElement.clientHeight);
  const c = await card.locator('.rv-original-preview').boundingBox(), h = await hover.boundingBox(), rail = await box('.rv-slide-rail');
  assert.ok(!overlap(await card.boundingBox(), h), `hover covers sheet ${i + 1}`);
  assert.ok(inside(h, { x: 0, y: 0, width, height }), `hover leaves the viewport for sheet ${i + 1}`);
  const zoom = await hover.locator('.rv-slide-hover-stage').boundingBox();
  return { c, h, rail, zoom, heading: await hover.locator('.rv-slide-hover-heading>b').innerText(), railClear: !overlap(rail, h) };
}
const leave = async () => { await page.mouse.move(2, 2); await page.locator('.rv-slide-hover').waitFor({ state: 'detached' }); };
const dialog = () => page.locator('.rv-page-dialog');
const notesWidth = async () => (await box('.rv-page-score-column')).width;
async function popupState() {
  return dialog().evaluate(body => {
    const r = el => el.getBoundingClientRect().toJSON(), notes = body.querySelector('.rv-page-score-column'), strip = body.querySelector('.rv-filmstrip ol');
    const current = strip.querySelector('[aria-current="true"]');
    return { body: r(body), bodyScrolls: body.scrollHeight > body.clientHeight + 1, stage: r(body.querySelector('.rv-page-stage')), film: r(body.querySelector('.rv-filmstrip')),
      strip: r(strip), current: current && { n: current.querySelector('.rv-filmstrip-number').textContent.trim(), rect: r(current) }, thumbs: strip.querySelectorAll('button').length,
      notes: r(notes), notesOverflow: getComputedStyle(notes).overflowY, notesScroll: [notes.scrollHeight, notes.clientHeight, notes.scrollTop],
      title: body.closest('.modal').querySelector('.mhead h2').textContent };
  });
}
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const context = await contextFor();
  await page.waitForFunction(() => document.querySelectorAll('.rvh-thumbs .slide').length === 9);
  const e = bundle.examples[0];
  await page.getByRole('button', { name: e.review.title + ' 평가 열기', exact: true }).click();
  await page.locator('.rv-slide-card').first().waitFor();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  const sheets = await page.locator('.rv-slide-card').count();
  assert.ok(sheets > 10, 'the example deck has its sheets');

  // Hover: above or below the whole rail when that leaves a larger sheet than the card, else beside the card.
  for (const [y, side] of [[560, 'above'], [90, 'below']]) {
    // Opening the server details below the deck gives the page room to scroll the rail up.
    if (side === 'below') await page.locator('.rv-server-details>summary').click();
    await railAt(y);
    const at = (await box('.rv-slide-rail')).y;
    assert.ok(Math.abs(at - y) <= 12, `rail scrolled to ${y} (at ${at})`);
    for (const i of [0, 1, 2]) {
      const s = await hoverCard(i);
      assert.ok(s.railClear, `hover keeps the sheet rail clear (rail at ${y}, sheet ${i + 1})`);
      assert.ok(side === 'above' ? s.h.y + s.h.height <= s.rail.y : s.h.y >= s.rail.y + s.rail.height, `hover sits ${side} the rail`);
      assert.ok(s.zoom.width > s.c.width, 'the hover enlarges the sheet');
      if (i === 1 && y === 560) await page.screenshot({ animations: 'disabled', path: path.join(out, 'hover-1500.png') });
      await leave();
    }
  }
  // The pointer can move straight along the rail: the next card's hover replaces this one.
  await page.locator('.rv-server-details>summary').click();
  await railAt(560);
  await hoverCard(0);
  const next = await page.locator('.rv-slide-card').nth(1).boundingBox();
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2, { steps: 12 }); await page.waitForTimeout(300);
  assert.match(await page.locator('.rv-slide-hover .rv-slide-hover-heading>b').innerText(), /^2장 · /);
  await leave();
  pass('Desktop: the hover enlargement sits above or below the sheet rail, never over the sheets, and follows the pointer along the rail');
  await page.setViewportSize({ width: 1100, height: 800 }); await railAt(330);
  for (const i of [0, 1, 2]) { await hoverCard(i); await leave(); }
  await page.setViewportSize({ width: 1500, height: 1050 });
  pass('Short windows: without room above or below the rail, the hover goes beside the sheet instead of over it');

  // Clicking the sheet itself opens the popup (the hover no longer sits under the pointer).
  await railAt(560);
  await page.locator('.rv-slide-card').nth(1).click();
  await dialog().waitFor(); await page.waitForTimeout(400);
  let s = await popupState();
  assert.match(s.title, /^2장 · /);
  assert.equal(s.thumbs, sheets, 'one thumbnail per sheet');
  assert.equal(s.current.n, '2');
  assert.ok(s.film.y >= s.stage.y + s.stage.height - 1 && s.film.y - (s.stage.y + s.stage.height) <= 24, 'thumbnail strip sits right under the sheet');
  assert.ok(inside(s.stage, s.body) && inside(s.film, s.body), 'sheet and strip are fully shown');
  assert.ok(!s.bodyScrolls, 'the popup body does not scroll');
  assert.ok(s.stage.width > 900, 'the sheet keeps a large view');
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'popup-1500.png') });
  await page.locator('.rv-filmstrip').getByRole('button', { name: /^9장 / }).click(); await page.waitForTimeout(500);
  s = await popupState();
  assert.match(s.title, /^9장 · /); assert.equal(s.current.n, '9');
  assert.ok(s.current.rect.x >= s.strip.x - 1 && s.current.rect.x + s.current.rect.width <= s.strip.x + s.strip.width + 1, 'current thumbnail is in view');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500);
  s = await popupState();
  assert.match(s.title, /^10장 · /); assert.equal(s.current.n, '10');
  assert.ok(s.current.rect.x + s.current.rect.width <= s.strip.x + s.strip.width + 1, 'strip follows keyboard paging');
  pass('The popup shows every sheet as a thumbnail strip right under the enlarged sheet; clicking or arrow keys move through it');

  await page.locator('.rv-filmstrip').getByRole('button', { name: /^9장 / }).click(); await page.waitForTimeout(400);
  s = await popupState();
  assert.equal(s.notesOverflow, 'auto');
  assert.ok(s.notesScroll[0] > s.notesScroll[1], 'sheet 9 has more notes than fit');
  const before = s.stage;
  await page.mouse.move(s.notes.x + s.notes.width / 2, s.notes.y + s.notes.height / 2); await page.mouse.wheel(0, 500); await page.waitForTimeout(400);
  s = await popupState();
  assert.ok(s.notesScroll[2] > 0, 'notes scrolled'); assert.ok(!s.bodyScrolls);
  assert.deepEqual([s.stage.x, s.stage.y, s.stage.width], [before.x, before.y, before.width], 'the sheet stays put while the notes scroll');
  pass('Only the notes column scrolls; the sheet and thumbnail strip stay in place');

  const bar = page.getByRole('separator', { name: '장표와 설명 너비 조절' });
  const grip = await bar.locator('span').boundingBox();
  assert.ok(grip.height <= 64 && grip.height < s.notes.height / 4, 'the divider shows a short bar');
  const startNotes = await notesWidth(), startStage = s.stage.width;
  assert.ok(Math.abs(startNotes - 380) <= 2, 'notes start at 380px');
  const b = await bar.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 200, b.y + b.height / 2, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(300);
  assert.ok(Math.abs(await notesWidth() - (startNotes + 200)) <= 3, 'dragging left widens the notes');
  assert.ok((await popupState()).stage.width < startStage - 150, 'and narrows the sheet');
  assert.ok(!(await popupState()).bodyScrolls);
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'popup-dragged.png') });
  await bar.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  assert.ok(Math.abs(await notesWidth() - (startNotes + 176)) <= 3, 'ArrowRight on the bar narrows the notes by 24px');
  assert.match((await popupState()).title, /^9장 · /, 'arrow keys on the bar do not change the sheet');
  await page.keyboard.press('End'); await page.waitForTimeout(150);
  assert.ok(Math.abs(await notesWidth() - 280) <= 2, 'notes keep at least 280px');
  await page.keyboard.press('Home'); await page.waitForTimeout(150);
  s = await popupState();
  assert.ok(s.stage.width >= 355, 'the sheet keeps at least 360px');
  const moved = await bar.boundingBox();
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2); await page.mouse.down();
  await page.mouse.move(1500, moved.y + moved.height / 2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
  assert.ok(Math.abs(await notesWidth() - 280) <= 2, 'dragging past the edge stops at the minimum');
  await bar.dblclick(); await page.waitForTimeout(200);
  assert.ok(Math.abs(await notesWidth() - 380) <= 2, 'double-click restores the starting width');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => localStorage.getItem('winmate.review.unitNotesWidth')), '428');
  await page.keyboard.press('Escape'); await dialog().waitFor({ state: 'detached' });
  await page.locator('.rv-slide-card').nth(3).click(); await dialog().waitFor(); await page.waitForTimeout(300);
  assert.ok(Math.abs(await notesWidth() - 428) <= 2, 'the chosen width is kept for the next popup');
  pass('A short bar between sheet and notes resizes them by mouse or keyboard, within limits, and the width is remembered');

  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  s = await popupState();
  assert.equal(await bar.isVisible(), false, 'no divider when stacked');
  assert.ok(s.film.y >= s.stage.y + s.stage.height - 1 && s.notes.y >= s.film.y + s.film.height - 1, 'phone: sheet, strip, then notes');
  assert.ok(!s.bodyScrolls && s.notesScroll[0] > s.notesScroll[1], 'phone: only the notes scroll');
  assert.ok(s.current.rect.x >= s.strip.x - 1 && s.current.rect.x + s.current.rect.width <= s.strip.x + s.strip.width + 1, 'phone: current thumbnail in view');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'popup-390.png') });
  pass('Phones stack sheet, strip and notes; only the notes scroll');

  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(300);
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'popup-dark.png') });
  await context.close();
  assert.deepEqual(errors, []);
} catch (error) {
  await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  errors.push(error.stack || error.message); console.error(error); process.exitCode = 1;
} finally {
  await browser?.close(); await vite.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed, errors }, null, 2));
}
