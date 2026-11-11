// 표준 건물 조감도 — 건물 스튜디오 시작 창의 「표준 건물 조감도」 묶음(건물 템플릿 — 샘플 버티컬 시나리오 54 · 버티컬 44 — 과 따로) · 고르면 층마다 공간 · 층 이름이 채워진 채로 열림.
// 앱 서버 없이 Vite + /api/bootstrap 대역으로 검사한다: node app/tests/building-standard-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'app/tests/output/building-standard'); fs.mkdirSync(output, { recursive: true });
const read = (n) => JSON.parse(fs.readFileSync(path.join(root, 'app/data', n + '.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'building-standard-test', auth_enabled: false } };
const LONG = 240000, checks = [], errors = [], pass = (s) => { checks.push(s); console.log('PASS ' + s); };
const { STD_PRESETS } = await import(path.join(root, 'app/web/src/building/presets-standard.js'));
const { PRESETS } = await import(path.join(root, 'app/web/src/building/presets.js'));
// 기본 데이터(bake.b64) 층 수 — 샘플 버티컬 시나리오 206 + 버티컬 94
const BASE_FLOORS = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(root, 'app/web/src/building/bake.b64'), 'utf8').trim(), 'base64')).toString()).tpl.length;

const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.addInitScript(() => { if (!localStorage.getItem('winmate.v2.ui')) localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'building' } })); });
  await context.route((u) => u.pathname.startsWith('/api/'), (r) => r.fulfill(new URL(r.request().url()).pathname === '/api/bootstrap' ? { json: boot } : { status: 503, json: { detail: 'offline test' } }));
  await context.route((u) => u.pathname.startsWith('/img/'), async (r) => {
    const file = path.join(root, 'app/data/static', decodeURIComponent(new URL(r.request().url()).pathname));
    try { await r.fulfill({ path: file }); } catch { await r.abort(); }
  });
  const page = await context.newPage(); page.setDefaultTimeout(LONG);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port + '/');
  await page.locator('.bd-launch').waitFor();

  await page.locator('.bd-launch').click(); await page.locator('.bd-pick-modal').waitFor();
  const head = page.locator('.bd-pick-modal .bd-std-group .bd-group-head');
  assert.equal((await head.innerText()).trim(), '표준 건물 조감도');
  assert.equal(await page.locator('.bd-pick-modal .bd-std').count(), STD_PRESETS.length);
  assert.equal(await page.locator('.bd-pick-modal .bd-pre').count(), PRESETS.length);
  const first = await page.locator('.bd-pick-modal .bd-group').first().getAttribute('aria-label');
  assert.equal(first, '표준 건물 조감도');
  pass(`start dialog lists ${STD_PRESETS.length} standard buildings above the ${PRESETS.length} building templates`);

  await page.locator('.bd-pick-modal .bd-chip', { hasText: '호텔' }).click();
  assert.equal(await page.locator('.bd-pick-modal .bd-std:not([hidden])').count(), STD_PRESETS.filter((p) => p.ind === 'HT').length);
  await page.locator('.bd-pick-modal .bd-chip', { hasText: '외식' }).click(); await page.locator('.bd-pick-modal .bd-chip', { hasText: '호텔' }).click();
  assert.equal(await page.locator('.bd-pick-modal .bd-std-group').isHidden(), true);
  await page.locator('.bd-pick-modal .bd-chip', { hasText: '전체' }).click();
  pass('industry chips filter the standard group and hide it when nothing matches');

  const hotel = STD_PRESETS.find((p) => p.vid === 'ht_large');
  await page.locator('.bd-pick-modal .bd-std', { hasText: hotel.title }).click();
  assert.equal((await page.locator('.bd-pick-sum').innerText()).trim(), hotel.title);
  await page.locator('.mfoot .btn-primary').click();
  await page.locator('.bd-workspace').waitFor();
  await page.waitForFunction(() => !document.querySelector('.bd-render-state'), null, { timeout: LONG }); await page.waitForTimeout(2500);
  const strip = (await page.locator('.bd-floor-pick').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  assert.deepEqual(strip, hotel.floors.map((f, i) => `${i + 1}F ${f.name}`));
  const saved = await page.evaluate(async () => {
    const d = await new Promise((r) => { const q = indexedDB.open('winmate-building'); q.onsuccess = () => r(q.result); });
    const all = await new Promise((r) => { const q = d.transaction('b').objectStore('b').getAll(); q.onsuccess = () => r(q.result); }); d.close();
    return all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  });
  assert.equal(saved.template, hotel.id); assert.equal(saved.title, hotel.title);
  assert.deepEqual(saved.floors.map((f) => [f.tpl, f.name, f.fv]), hotel.floors.map((f) => [f.tpl, f.name, f.fv]));
  await page.screenshot({ path: path.join(output, 'standard-hotel.png') });
  pass('a standard building opens with every floor filled and named (no empty floors)');

  const rooms = await page.evaluate(async () => {
    const D = window.__wmBldMod_.data(), std = D.tpl.filter((t) => t.lay === 'std'); // the same module instance the page mounted
    return { floors: std.length, base: D.tpl.length - std.length, ids: std.flatMap((t) => t.rooms.map((r) => r[0])) };
  });
  assert.equal(rooms.base, BASE_FLOORS); assert.equal(rooms.floors, 26); assert.equal(new Set(rooms.ids).size, rooms.ids.length);
  pass(`standard floors are appended after the ${BASE_FLOORS} base floors and no space repeats`);
  assert.deepEqual(errors, []);
  console.log(`${checks.length}/${checks.length} building-standard checks passed`);
} finally { await browser?.close(); await server.close(); }
