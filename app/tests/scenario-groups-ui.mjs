// 샘플 버티컬 시나리오 — before a search the page is a grid of 요구사항 타입 cards (symbol · name · sample count · description).
// A card opens its samples in a popup (버티컬 표준제안서: sections by industry; other types: one list in industry order),
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
    await page.reload(); await page.locator('#tl-q').waitFor(); await page.mouse.move(page.viewportSize().width - 3, 2);
  };
  const cards = () => page.locator('.bsg-card');
  const listDialog = () => page.locator('.modal.bsx-modal');
  const listLayout = () => listDialog().locator('.bsx-item').evaluateAll(rows => {
    const bounds = rows.map(row => row.getBoundingClientRect());
    return {
      aligned: bounds.every((row, i) => row.left === bounds[0].left && row.right === bounds[0].right && (!i || row.top >= bounds[i - 1].bottom)),
      fits: bounds.every(row => row.right <= innerWidth),
      title: getComputedStyle(rows[0].querySelector('.bsx-title')).fontSize,
      heading: getComputedStyle(rows[0].closest('.modal').querySelector('.mhead h2')).fontSize,
    };
  });

  // 1. before a search — one card per type, in REQ_ORDER, with symbol · name · count · description, and no rows
  await toPage(); await cards().first().waitFor();
  const shown = await cards().evaluateAll(cs => cs.map(c => ({ req: c.dataset.req, name: c.querySelector('.bsg-t').innerText, n: c.querySelector('.bsg-n b').innerText, desc: c.querySelector('.bsg-d').innerText,
    icon: c.querySelector('.bsg-ic svg path').getAttribute('d'), label: c.getAttribute('aria-label'), tag: c.tagName })));
  assert.deepEqual(shown.map(c => c.req), ['brief', 'std', 'compete', 'ops', 'subs', 'scale', 'new', 'renew']);
  assert.equal(shown.find(c => c.req === 'std').name, '버티컬 표준제안서');
  assert.equal(shown.find(c => c.req === 'subs').name, '서비스 제안');
  const dots = 'M5 12h.01 M12 12h.01 M19 12h.01'; // Icon's fallback for an unknown name
  for (const c of shown) {
    const t = data.types[c.req];
    assert.equal(c.tag, 'BUTTON'); assert.equal(c.name, t.label); assert.equal(c.desc, t.desc); assert.equal(Number(c.n), count(c.req));
    assert.ok(t.icon && c.icon && c.icon !== dots, c.req + ' has its own symbol'); assert.equal(c.label, t.label + ' 샘플 ' + c.n + '개 목록 열기');
  }
  assert.equal(new Set(shown.map(c => c.icon)).size, shown.length, 'every type has a different symbol');
  assert.equal(shown.reduce((a, c) => a + Number(c.n), 0), data.all.length);
  assert.equal(await page.locator('.bsk').count(), 0);
  pass('before a search: ' + shown.length + ' type cards (symbol · name · sample count · description), ' + data.all.length + ' samples, no rows');

  const firstRow = await cards().evaluateAll(cs => { const top = cs[0].getBoundingClientRect().top; return cs.filter(c => Math.abs(c.getBoundingClientRect().top - top) < 2).length; });
  assert.equal(firstRow, 4); await page.screenshot({ path: path.join(output, 'grid-1440.png') });
  pass('desktop grid holds at most four cards per line');

  // 2. 버티컬 표준제안서 — sectioned by industry, the find box narrows it, an item opens its Storyboard
  await page.locator('.bsg-card[data-req="std"]').click(); await listDialog().waitFor();
  assert.equal(await listDialog().locator('.mhead h2').innerText(), '버티컬 표준제안서');
  assert.equal(await listDialog().locator('.bsx-item').count(), count('std'));
  assert.ok(await listDialog().locator('.bsx-grp h3').count() > 1); assert.equal(await listDialog().locator('.bsx-eb').count(), 0);
  await listDialog().getByRole('searchbox', { name: '버티컬 표준제안서 찾기', exact: true }).fill('병원');
  const hospital = await listDialog().locator('.bsx-item').count(); assert.ok(hospital > 0 && hospital < count('std'));
  await page.screenshot({ path: path.join(output, 'popup-std.png') });
  await listDialog().getByRole('searchbox', { name: '버티컬 표준제안서 찾기', exact: true }).fill('');
  await listDialog().getByRole('button', { name: '닫기', exact: true }).first().click(); await listDialog().waitFor({ state: 'detached' });
  pass('버티컬 표준제안서 popup: ' + count('std') + ' decks by industry, find box narrows to ' + hospital);

  // 3. another type — one list in industry order with the industry above each title; an item opens its Storyboard
  await page.locator('.bsg-card[data-req="new"]').click(); await listDialog().waitFor();
  assert.equal(await listDialog().locator('.mhead h2').innerText(), data.types.new.label);
  assert.equal(await listDialog().getByRole('list').first().getByRole('listitem').count(), count('new'));
  assert.deepEqual(await listLayout(), { aligned: true, fits: true, title: '22px', heading: '24px' });
  const items = await listDialog().locator('.bsx-item').evaluateAll(xs => xs.map(x => ({ title: x.querySelector('.bsx-meta b').innerText, eb: x.querySelector('.bsx-eb')?.innerText })));
  assert.equal(items.length, count('new')); assert.ok(items.every(x => x.eb));
  const ranks = items.map(x => { const s = data.all.find(s => s.title === x.title); return data.rank[s.ind] ?? 99; });
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'industry order');
  await page.screenshot({ path: path.join(output, 'popup-new.png') });
  await listDialog().locator('.bsx-item').first().click(); const board = page.locator('.modal.sbv'); await board.waitFor();
  assert.ok((await board.innerText()).includes(items[0].title));
  // 시트가 먼저 — 왼쪽 세로 썸네일 · 오른쪽 큰 시트. Storyboard는 상단 탭으로 보고, 탭을 바꿔도 팝업 크기는 그대로다.
  assert.equal(await board.getByRole('tab', { name: '시트', exact: true }).getAttribute('aria-selected'), 'true'); assert.equal(await board.locator('.node').count(), 0);
  assert.ok(await board.locator('.sbs-th').count() > 1); await board.locator('.sbs-sheet .slide').waitFor();
  const lay = await board.evaluate(el => { const r = x => el.querySelector(x).getBoundingClientRect(); const a = r('.sbs-rail'), m = r('.sbs-sheet'), f = r('.sbs-fit'); return { left: a.right <= m.left, big: m.width > a.width * 3, inside: m.width <= f.width + 1 && m.height <= f.height + 1 }; });
  assert.deepEqual(lay, { left: true, big: true, inside: true }); await page.screenshot({ path: path.join(output, 'detail-sheet.png') });
  for (const gone of ['.sbv-thesis', '.sbv-ro', '.sbv-bar .tag']) assert.equal(await board.locator(gone).count(), 0, gone + ' is removed');
  const size = () => board.evaluate(el => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }); const sheetSize = await size();
  await board.locator('.sbs-th').nth(1).click(); assert.equal(await board.locator('.sbs-th[aria-current="true"]').count(), 1); assert.equal(await board.locator('.sbs-th').nth(1).getAttribute('aria-current'), 'true');
  // 시트는 좌우로 넘긴다 — 양옆 화살표 · ← → 키 · 옆으로 밀기. 첫 장 · 끝 장에서는 그쪽 화살표가 꺼진다.
  const at = () => board.locator('.sbs-th').evaluateAll(ts => ts.findIndex(t => t.getAttribute('aria-current') === 'true'));
  const prev = board.getByRole('button', { name: '이전 장', exact: true }), next = board.getByRole('button', { name: '다음 장', exact: true });
  const sides = await board.evaluate(el => { const r = x => x.getBoundingClientRect(); const [a, z] = [...el.querySelectorAll('.sbs-nav')].map(r); const m = r(el.querySelector('.sbs-sheet')); return a.right <= m.left && m.right <= z.left; });
  assert.ok(sides, 'the arrows sit left and right of the sheet');
  await next.click(); assert.equal(await at(), 2); await prev.click(); await prev.click(); assert.equal(await at(), 0); assert.ok(await prev.isDisabled());
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); assert.equal(await at(), 2); await page.keyboard.press('ArrowLeft'); assert.equal(await at(), 1);
  const box = await board.locator('.sbs-sheet').boundingBox(); const midY = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * .7, midY); await page.mouse.down(); await page.mouse.move(box.x + box.width * .3, midY, { steps: 6 }); await page.mouse.up();
  assert.equal(await at(), 2, 'a swipe to the left turns to the next sheet'); assert.equal(await page.locator('.modal.sheet').count(), 0, 'a swipe is not a zoom click');
  await board.locator('.sbs-sheet').click(); await page.locator('.modal.sheet').waitFor(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape'); await page.locator('.modal.sheet').waitFor({ state: 'detached' });
  assert.equal(await at(), 3, 'the 시트 tab stays on the sheet last seen in the big popup');
  await board.locator('.sbs-th').last().click(); assert.ok(await next.isDisabled()); await page.screenshot({ path: path.join(output, 'detail-sheet-last.png') }); await board.locator('.sbs-th').nth(1).click();
  await board.getByRole('tab', { name: 'Storyboard', exact: true }).click(); await board.locator('.node').first().waitFor();
  assert.ok(await board.locator('.node').count() > 0); assert.deepEqual(await size(), sheetSize, 'the popup keeps its size across tabs'); await page.screenshot({ path: path.join(output, 'detail-storyboard.png') });
  await board.getByRole('button', { name: '닫기', exact: true }).first().click(); await board.waitFor({ state: 'detached' });
  assert.equal(await listDialog().locator('.mhead h2').innerText(), data.types.new.label, 'the list stays open under the Storyboard');
  await page.keyboard.press('Escape'); await listDialog().waitFor({ state: 'detached' });
  pass('other types: one list in industry order (' + items.length + '), item → read-only Storyboard, list stays underneath');

  // 4. keyboard — a card is a button
  await page.locator('.bsg-card[data-req="compete"]').focus(); await page.keyboard.press('Enter'); await listDialog().waitFor();
  assert.equal(await listDialog().locator('.bsx-item').count(), count('compete')); await page.keyboard.press('Escape'); await listDialog().waitFor({ state: 'detached' });
  pass('Enter on a focused card opens its list, Escape closes it');

  // 5. filters apply before a search — counts follow, empty types drop out, the popup holds only the filtered samples
  await toPage({ ind: 'HT' }); await cards().first().waitFor();
  const filtered = await cards().evaluateAll(cs => cs.map(c => [c.dataset.req, Number(c.querySelector('.bsg-n b').innerText)]));
  assert.deepEqual(filtered, data.order.map(k => [k, count(k, 'HT')]).filter(x => x[1]));
  await page.locator('.bsg-card[data-req="' + filtered[0][0] + '"]').click(); await listDialog().waitFor();
  assert.equal(await listDialog().locator('.bsx-item').count(), filtered[0][1]); await page.keyboard.press('Escape');
  pass('업종 filter (호텔): ' + filtered.map(x => x.join(' ')).join(' · '));

  // 6. a search shows scenario cards (two per line, no 상세 보기 button — the card opens the Storyboard) instead of the type cards;
  //    clearing it brings the type cards back
  await toPage({}); await cards().first().waitFor();
  await page.locator('#tl-q').fill('메뉴보드'); await page.locator('.bsk').first().waitFor();
  assert.equal(await cards().count(), 0);
  const hits = await page.locator('.bsk').evaluateAll(cs => ({ n: cs.length, lefts: new Set(cs.map(c => Math.round(c.getBoundingClientRect().left))).size, text: cs.map(c => c.innerText).join(' ') }));
  assert.ok(hits.n > 1); assert.equal(hits.lefts, 2); assert.ok(!hits.text.includes('상세 보기'));
  const first = page.locator('.bsk').first(); const title = await first.getAttribute('aria-label');
  await first.click({ position: { x: 24, y: 24 } }); await page.locator('.modal.sbv').waitFor();
  assert.ok((await page.locator('.modal.sbv').innerText()).includes(title)); await page.keyboard.press('Escape'); await page.locator('.modal.sbv').waitFor({ state: 'detached' });
  await page.locator('#tl-q').fill(''); await cards().first().waitFor(); assert.equal(await page.locator('.bsk').count(), 0);
  pass('a search shows scenario cards two per line and a card opens its Storyboard; clearing it shows the type cards again');

  // 7. phone — one card per line, nothing wider than the screen; dark theme keeps the type colours
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  const phone = await cards().evaluateAll(cs => ({ lefts: new Set(cs.map(c => Math.round(c.getBoundingClientRect().left))).size, over: document.documentElement.scrollWidth > innerWidth }));
  assert.equal(phone.lefts, 1); assert.equal(phone.over, false); await page.screenshot({ path: path.join(output, 'grid-390.png') });
  await page.locator('.bsg-card[data-req="ops"]').click(); await listDialog().waitFor();
  assert.deepEqual(await listLayout(), { aligned: true, fits: true, title: '18px', heading: '20px' });
  await page.screenshot({ path: path.join(output, 'popup-ops-390.png') }); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(200);
  const dark = await page.locator('.bsg-card[data-req="ops"] .bsg-ic').evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  assert.notEqual(dark[0], dark[1]); await page.screenshot({ path: path.join(output, 'grid-1440-dark.png') });
  pass('phone: one card per line without overflow; dark theme keeps the symbol tint');

  // 8. 홈 — 샘플 버티컬 시나리오는 어디서 눌러도 상세 팝업(시트 먼저)으로 뜬다: 샘플 구역의 카드도, 히스토리에 넣어 둔 [샘플] 카드도.
  //    [샘플] 카드는 이미 히스토리에 있는 복사본이라 팝업의 주 버튼이 그 제안서를 연다. 다른 제안서 카드는 그대로 제안서로 간다.
  await page.emulateMedia({ colorScheme: 'light' });
  const home = async (user) => {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await c.route(u => !['localhost', '127.0.0.1'].includes(u.hostname), route => route.abort());
    await c.route(u => u.pathname.startsWith('/api/'), route => new URL(route.request().url()).pathname === '/api/bootstrap'
      ? route.fulfill({ json: { ...boot, user } }) : route.fulfill({ status: 503, json: { code: 'test_no_api' } }));
    const pg = await c.newPage(); pg.setDefaultTimeout(20000); pg.on('pageerror', e => errors.push(e.message));
    await pg.goto(url); await pg.locator('.home[data-home-ready="true"]').waitFor(); return pg;
  };
  const sheetFirst = async (pg) => {
    const m = pg.locator('.modal.sbv'); await m.waitFor(); await m.locator('.sbs-sheet .slide').waitFor();
    assert.equal(await m.getByRole('tab', { name: '시트', exact: true }).getAttribute('aria-selected'), 'true'); assert.equal(new URL(pg.url()).pathname, '/'); return m;
  };
  const guest = await home(boot.user);
  await guest.locator('section[aria-label="샘플 버티컬 시나리오"] .hcard').first().click();
  assert.equal(await (await sheetFirst(guest)).getByRole('button', { name: '활용하기', exact: true }).count(), 1); await guest.context().close();
  const admin = await home({ username: 'admin', auth_enabled: true, sample_history: { version: 1, scenarios: ['bs01', 'bs03'] } });
  const seeded = admin.locator('.home .hcard', { hasText: '[샘플]' }); assert.equal(await seeded.count(), 2);
  await seeded.first().click(); const own = await sheetFirst(admin);
  assert.ok((await seeded.first().innerText()).includes(await own.locator('.mhead h2').innerText()));
  assert.equal(await own.getByRole('button', { name: '활용하기', exact: true }).count(), 0);
  await own.getByRole('button', { name: '내 제안서 열기', exact: true }).click(); await admin.waitForURL(u => u.pathname.startsWith('/storyboard/admin-sample-'));
  await own.waitFor({ state: 'detached' }); await admin.context().close();
  pass('home: a sample card and a [샘플] history card both open the detail popup on 시트; the history copy opens from the popup');

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: true, checks, errors }, null, 2));
} finally { await browser?.close(); await server.close(); }
