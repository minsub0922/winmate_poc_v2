// 제품 · 솔루션 매칭 팝업 이미지 타일: 타일 = 사진 + 이름 + 한 줄(메타 줄 없음) · 클릭 / 키보드 포커스 → 상세 · Esc · × 는 hover 때만(터치는 항상) · 해제 ·
// 모바일 열 수 · 가로 스크롤 없음 · 솔루션 / 유관사례 / 상세 / 다크 / 모바일 스크린샷 → build/qa/tiles-*.png
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8799);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
async function go(name, opts, fn) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await page.goto('http://localhost:8799/'); await page.waitForSelector('.home');
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card'); await page.waitForTimeout(1000);
  await fn(page); await ctx.close();
}
const scrollTo = (page, k) => page.evaluate((k) => { const b = document.querySelector('.mt-body'); const h = document.querySelector('#cc-h-' + k); b.scrollTop += h.getBoundingClientRect().top - b.getBoundingClientRect().top - 8; }, k);
await go('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  // no detail text on tiles
  const info = await page.$$eval('.mt-pop .cc-card', (e) => e.map((x) => ({ th: !!x.querySelector('.thumb'), nm: x.querySelector('.cc-name').textContent, tg: (x.querySelector('.cc-tag') || {}).textContent || '', meta: !!x.querySelector('.cc-meta, dl, .cc-sub') })));
  console.log(info.map((x) => x.nm + ' / ' + x.tg).join('\n'));
  ok(info.length > 0 && info.every((x) => x.th && x.nm && !x.meta), 'every tile = image + name (+ tag), no metadata rows');
  await scrollTo(page, 'solutions'); await page.waitForTimeout(500); await page.mouse.move(5, 5); await page.screenshot({ path: path.join(shots, 'tiles-desk-sol.png') });
  await scrollTo(page, 'cases'); await page.waitForTimeout(500); await page.screenshot({ path: path.join(shots, 'tiles-desk-cases.png') });
  // click a case tile → detail right away
  await page.click('.mt-pop .cc-sec.case .cc-card >> nth=0', { position: { x: 40, y: 40 } }); await page.waitForSelector('.dpk .dpk-card', { timeout: 3000 }); ok(true, 'click opens the detail');
  await page.screenshot({ path: path.join(shots, 'tiles-desk-peek.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); ok(!(await page.$('.dpk')), 'Esc closes the detail'); ok(!!(await page.$('.mt-pop')), '…and the popup stays');
  // keyboard: Tab to a tile → detail
  await page.focus('.mt-pop .cc-sec.product .cc-card >> nth=0'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
  ok(!!(await page.$('.dpk')), 'keyboard focus on a tile opens the detail');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // × is hidden until hover, then removes
  const n0 = (await page.$$('.mt-pop .cc-sec.product .cc-card')).length;
  const op0 = await page.$eval('.mt-pop .cc-sec.product .cc-card >> nth=1', (e) => getComputedStyle(e.querySelector('.cc-rm')).opacity);
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  const opIdle = await page.$eval('.mt-pop .cc-sec.product .cc-card:nth-child(2) .cc-rm', (e) => getComputedStyle(e).opacity);
  await page.hover('.mt-pop .cc-sec.product .cc-card >> nth=1'); await page.waitForTimeout(200);
  const opHov = await page.$eval('.mt-pop .cc-sec.product .cc-card:nth-child(2) .cc-rm', (e) => getComputedStyle(e).opacity);
  ok(opIdle === '0' && opHov === '1', '× shows on hover only: ' + opIdle + ' → ' + opHov);
  await page.click('.mt-pop .cc-sec.product .cc-card >> nth=1 >> .cc-rm'); await page.waitForTimeout(250);
  ok((await page.$$('.mt-pop .cc-sec.product .cc-card')).length === n0 - 1, '× unlinks');
});
await go('dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, async (page) => { await page.mouse.move(5, 5); await page.screenshot({ path: path.join(shots, 'tiles-dark.png') }); await scrollTo(page, 'cases'); await page.waitForTimeout(400); await page.screenshot({ path: path.join(shots, 'tiles-dark-cases.png') }); });
await go('mob', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (page) => {
  await page.screenshot({ path: path.join(shots, 'tiles-mob.png') });
  const op = await page.$eval('.mt-pop .cc-card .cc-rm', (e) => getComputedStyle(e).opacity); ok(op === '1', 'touch: × always visible');
  const cols = await page.$$eval('.mt-pop .cc-grid', (g) => g.map((x) => getComputedStyle(x).gridTemplateColumns.split(' ').length)); ok(cols[0] >= 3, 'mobile columns ' + cols.join('/'));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth); ok(sw <= 390, 'no horizontal scroll: ' + sw);
  await scrollTo(page, 'cases'); await page.waitForTimeout(400); await page.screenshot({ path: path.join(shots, 'tiles-mob-cases.png') });
});
console.log(errs.length ? errs.join('\n') : 'all ok');
await browser.close(); srv.close();
