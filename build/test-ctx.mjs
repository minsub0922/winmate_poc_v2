// 제품 · 솔루션 매칭 popup beside the Storyboard bubble: rows open it at a kind, hover detail, remove, add from 추천 / 전체 목록,
// bubble counts follow, Esc closes; a seed at the requirements stage goes 저장 → matching popup; dark + mobile shots
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8797);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
async function run(name, opts, fn) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
  await page.goto('http://localhost:8797/'); await page.waitForSelector('.home');
  await fn(page); await ctx.close();
}
const shot = (page, n) => page.waitForTimeout(350).then(() => page.screenshot({ path: path.join(shots, n + '.png') }));
const count = (page, k) => page.$eval('[data-ctx="' + k + '"] .mk b', (e) => +e.textContent);
const cards = (page, k) => page.$$eval('.mt-pop .cc-sec.' + k + ' .cc-card .cc-name', (e) => e.map((x) => x.textContent));
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  const p0 = await count(page, 'products');
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card'); await page.waitForTimeout(300);
  ok(!(await page.$('.mback')), 'the bubble opens a popup beside it, not a modal');
  ok((await cards(page, 'product')).length === p0, 'linked products as cards: ' + p0);
  // hover a linked card → detail
  await page.hover('.mt-pop .cc-sec.product .cc-card >> nth=0'); await page.waitForSelector('.dpk .dpk-card'); ok(true, 'hover opens the detail: ' + await page.$eval('.dpk .dpk-card', (e) => e.getAttribute('aria-label')));
  await shot(page, 'd-peek');
  await page.mouse.move(5, 5); await page.waitForTimeout(400);
  // remove the first → the bubble count follows
  const first = (await cards(page, 'product'))[0];
  await page.hover('.mt-pop .cc-sec.product .cc-card >> nth=0'); await page.click('.mt-pop .cc-sec.product .cc-card >> nth=0 >> .cc-rm'); await page.waitForTimeout(250);
  ok((await cards(page, 'product')).length === p0 - 1 && (await count(page, 'products')) === p0 - 1, 'removed ' + first + ' → bubble shows ' + (p0 - 1));
  // add from 추천 → explorer at the recommendations
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  await page.click('.mt-pop .cc-sec.product .cc-reccard'); await page.waitForSelector('.mt-ex .ex-tiles');
  await page.click('.ex-tile >> nth=0'); await page.click('.mt-ex .bp-f .btn-primary'); await page.waitForTimeout(250);
  ok((await count(page, 'products')) === p0, 'a recommendation linked: ' + (await cards(page, 'product')).slice(-1)[0]);
  // add from the full list with search
  await page.click('.mt-pop .cc-sec.product .cc-addcard'); await page.waitForSelector('.mt-ex .ex-row');
  await page.fill('#ex-q-in', 'VM55'); await page.waitForTimeout(250);
  await page.click('.ex-row.products:not(.dis) >> nth=0'); await page.click('.mt-ex .bp-f .btn-primary'); await page.waitForTimeout(250);
  ok((await cards(page, 'product')).some((n) => /VM55/.test(n)), 'searched product linked: ' + (await cards(page, 'product')).join(', '));
  ok(await page.$eval('.match-node .match-card', (e) => getComputedStyle(e).visibility === 'hidden'), 'while open, only the bubble shows (card hidden)');
  await page.focus('.mt-pop .cc-sec.case .cc-addcard'); await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  ok(!(await page.$('.mt-pop')), 'Escape closes the popup');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('.match-node .node')), 'focus returns to the matching bubble');
  // rows open the popup at their kind
  await page.click('[data-ctx="cases"]'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => { const b = document.querySelector('.mt-body'); const h = document.querySelector('#cc-h-cases').getBoundingClientRect(); const r = b.getBoundingClientRect(); return h.top >= r.top - 2 && h.bottom <= r.bottom && (b.scrollTop > 0 || b.scrollHeight <= b.clientHeight); }), 'cases row → popup scrolled to 유관사례');
  await shot(page, 'd-cases');
  await page.click('.mt-x'); await page.waitForTimeout(200);
  console.log('bubble counts', await count(page, 'products'), await count(page, 'solutions'), await count(page, 'cases'));
  await page.screenshot({ path: path.join(shots, 'd-topbar.png'), clip: { x: 252, y: 0, width: 1188, height: 200 } });
  // a seed at the requirements stage: 저장 → matching bubble + popup (empty sections)
  await page.locator('.sb-item:has-text("호텔")').first().evaluate((e) => e.click()); await page.waitForTimeout(600);
  if (await page.$('.rq-pop')) { await page.click('.rq-f .btn-primary'); await page.waitForTimeout(400); }
  if (!(await page.$('.mt-pop'))) await page.click('[data-ctx="cases"]');
  await page.waitForSelector('.mt-pop .cc-top');
  await shot(page, 'd-empty');
});
await run('dark', { viewport: { width: 1280, height: 860 }, colorScheme: 'dark' }, async (page) => {
  await page.locator('.sb-item:has-text("용산")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card');
  await page.mouse.move(5, 5); await shot(page, 'd-dark-products');
  await page.click('.mt-x'); await page.click('[data-ctx="cases"]'); await page.waitForTimeout(800); await shot(page, 'd-dark-cases');
});
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page) => {
  await page.click('.sb-toggle, .menu-btn, [aria-label*="메뉴"]').catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()).catch(async () => { console.log('no sb item visible'); });
  await page.waitForTimeout(800);
  await shot(page, 'd-m-story');
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop.sheet .cc-card');
  await shot(page, 'd-m-products');
  await page.evaluate(() => { const b = document.querySelector('.mt-body'); b.scrollTop = b.scrollHeight; }); await shot(page, 'd-m-products-2');
  const ov = await page.evaluate(() => { const b = document.querySelector('.mt-body'); return Math.max(document.documentElement.scrollWidth - window.innerWidth, b.scrollWidth - b.clientWidth); });
  ok(ov <= 1, 'mobile: matching sheet has no horizontal overflow (' + ov + ')');
});
console.log(errs.length ? errs : 'all ok'); await browser.close(); srv.close();
