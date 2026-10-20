// Layout picker (PPT 레이아웃 추가): 3 recommendations in 3 columns, no note beside 추천 3, cards show the slide + title + key tags only
// (no when-to-use line, match reasons or search snippet — recommended, browse and search cards alike), no layout codes,
// large hover detail without 묶음 · 이미지 칸 · 자리표시 예 · 텍스트/사진 버전 · 원본, select / deselect
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8807);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
async function run(name, opts, fn) { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); await page.goto('http://localhost:8807/'); await page.waitForSelector('.home'); await fn(page); await ctx.close(); }
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'pick-' + n + '.png') }));
const openPicker = async (page) => {
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.click('.col .btn-primary:has-text("PPT 레이아웃 추가") >> nth=0'); await page.waitForSelector('.pk-rec .pcard'); await page.waitForTimeout(600);
};
const HIDDEN_ROWS = /^(묶음|이미지 칸|자리표시 예|텍스트 버전|사진 중심 버전|원본)$/;
// a card holds the slide, the title row and the key tags — nothing else
const cardParts = (page, sel) => page.$$eval(sel, (es) => es.map((e) => [...e.children].map((c) => c.className.split(' ')[0]).filter((c) => c && !['rank', 'pc-check', 'fav-btn'].includes(c)).join(',')));
const cleanCards = (rows) => rows.length > 0 && rows.every((r) => r === 'pc-name,pc-meta');
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await openPicker(page);
  ok((await page.$$('.pk-rec .pcard')).length === 3, '3 recommendations');
  const cols = await page.$eval('.pk-rec .pk-grid', (e) => getComputedStyle(e).gridTemplateColumns.split(' ').length); ok(cols === 3, '3 columns (' + cols + ')');
  ok((await page.locator('.pk-rec .pk-sec-h').innerText()).replace(/\s+/g, ' ').trim() === '추천 3', 'nothing beside 추천 3');
  ok((await page.$$('.pcard .code')).length === 0, 'no layout code on cards');
  const rp = await cardParts(page, '.pk-rec .pcard'); ok(cleanCards(rp), 'recommended cards: title + key tags only (' + rp[0] + ')');
  ok((await page.$$('.pcard .pc-when, .pcard .pc-why, .pcard .why, .pcard .pc-snip')).length === 0, 'no when-to-use line, reasons or snippet on any card');
  const tags = await page.$$eval('.pk-rec .pcard', (es) => es.map((e) => e.querySelectorAll('.pc-meta .tag').length)); ok(tags.every((n) => n >= 2 && n <= 3), 'key tags per card: ' + tags.join(','));
  const bp = await cardParts(page, '.pk-group .pcard'); ok(cleanCards(bp), 'browse cards: title + key tags only');
  await shot(page, '01-picker');
  await page.hover('.pk-rec .pcard >> nth=0'); await page.waitForSelector('.pk-peek'); await page.waitForTimeout(300);
  const w = await page.$eval('.pk-peek', (e) => e.getBoundingClientRect().width); const sw = await page.$eval('.pp-slide', (e) => e.getBoundingClientRect().width);
  ok(sw >= 640, 'hover is large: card ' + Math.round(w) + 'px, slide ' + Math.round(sw) + 'px');
  let dts = await page.$$eval('.pp-meta dt', (e) => e.map((x) => x.textContent)); ok(dts.length >= 3 && !dts.some((t) => HIDDEN_ROWS.test(t)), 'hover rows: ' + dts.join(' · '));
  ok(!(await page.$eval('.pk-peek', (e) => /[A-Z]{2,}-[A-Z0-9]/.test(e.querySelector('.pp-name').textContent))), 'no code in hover title');
  const fits = await page.$eval('.pk-peek', (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }); ok(fits, 'hover fits the viewport');
  await shot(page, '02-hover');
  // browse cards: no made-up reason in the hover either
  await page.mouse.move(5, 5); await page.locator('.pk-group .pcard').nth(1).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await page.hover('.pk-group .pcard >> nth=1'); await page.waitForSelector('.pk-peek'); await page.waitForTimeout(300);
  dts = await page.$$eval('.pp-meta dt', (e) => e.map((x) => x.textContent)); ok(!dts.some((t) => HIDDEN_ROWS.test(t) || t === '추천 이유'), 'browse hover rows: ' + dts.join(' · '));
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  await page.evaluate(() => { const b = document.querySelector('.pk-rec'); b && b.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(200);
  // select / deselect
  const n0 = +(await page.$eval('.mfoot .note b', (e) => e.textContent));
  const pick = await page.$$eval('.pk-rec .pcard', (es) => es.findIndex((e) => !e.classList.contains('sel'))); // a card not already in the part
  await page.click('.pk-rec .pcard >> nth=' + pick); await page.waitForTimeout(200);
  ok(+(await page.$eval('.mfoot .note b', (e) => e.textContent)) === n0 + 1 && !!(await page.$('.pk-rec .pcard.sel')), 'click selects (stays open)');
  await page.click('.pk-rec .pcard >> nth=' + pick); await page.waitForTimeout(200);
  ok(+(await page.$eval('.mfoot .note b', (e) => e.textContent)) === n0, 'click again deselects');
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  await page.fill('#pk-q', '경쟁사 비교'); await page.waitForTimeout(700); await shot(page, '03-search');
  const sp = await cardParts(page, '.pk-grid.pk-3 .pcard'); ok(cleanCards(sp), 'search results: ' + sp.length + ' cards, title + key tags only');
  await page.hover('.pk-grid .pcard >> nth=0'); await page.waitForSelector('.pk-peek'); await page.waitForTimeout(300);
  dts = await page.$$eval('.pp-meta dt', (e) => e.map((x) => x.textContent)); ok(!dts.some((t) => HIDDEN_ROWS.test(t)), 'search hover rows: ' + dts.join(' · '));
  await shot(page, '04-search-hover');
});
await run('dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }, async (page) => {
  await openPicker(page); await page.hover('.pk-rec .pcard >> nth=1'); await page.waitForSelector('.pk-peek'); await shot(page, '05-dark');
  const fits = await page.$eval('.pk-peek', (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }); ok(fits, 'dark 1280×800: hover fits');
});
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page) => {
  await openPicker(page); await shot(page, '06-mobile');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile: no horizontal overflow');
  const rp = await cardParts(page, '.pk-rec .pcard'); ok(cleanCards(rp), 'mobile cards: title + key tags only');
});
console.log(errs.length ? errs : 'all good'); await browser.close(); srv.close();
