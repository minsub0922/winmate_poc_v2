// Hover detail interactions (제품 · 솔루션 매칭 popup cards): stays open while the pointer is on it, thumbnails switch the big image, leaving closes it; dark; small window.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const PORT = 8971 + Math.floor(Math.random() * 100);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } const ct = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
async function run(name, opts, fn) { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); await page.goto('http://localhost:' + PORT + '/'); await page.waitForSelector('.home'); await fn(page); await ctx.close(); }
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'tp-' + n + '.png') }));
async function story(page) {
  await page.click('.sb-item:has-text("커피")'); await page.waitForSelector('.topbar'); await page.waitForTimeout(700);
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card'); await page.mouse.move(5, 5); await page.waitForTimeout(300);
}
// 제품 · 솔루션 매칭 popup (beside the bubble): linked cards per kind
const CARD = (k = 'product', n = 0) => '.mt-pop .cc-sec.' + k + ' .cc-card >> nth=' + n;
const center = async (page, sel) => { const b = await (await page.$(sel)).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await story(page);
  const [tx, ty] = await center(page, CARD());
  await page.mouse.move(tx, ty); await page.waitForSelector('.dpk'); ok(true, 'hover opens the detail');
  const before = await page.$eval('.dpk-main img', (e) => e.getAttribute('src'));
  // move onto the card through the gap
  const [px, py] = await center(page, '.dpk-th >> nth=2');
  await page.mouse.move(px, py, { steps: 8 }); await page.waitForTimeout(400);
  ok(!!(await page.$('.dpk')), 'card stays open while the pointer moves onto it');
  const after = await page.$eval('.dpk-main img', (e) => e.getAttribute('src'));
  ok(before !== after, 'hovering a thumbnail switches the big image: ' + before + ' → ' + after);
  await page.hover('.dpk-main'); await page.click('.dpk-nav.next'); await page.waitForTimeout(150);
  ok((await page.$eval('.dpk-badge b', (e) => e.textContent)).startsWith('4/'), 'next button steps the gallery: ' + await page.$eval('.dpk-badge b', (e) => e.textContent));
  ok((await page.$$('.dpk-case[href]')).length >= 1, 'case rows link to the original');
  await shot(page, '01-on-card');
  await page.mouse.move(1430, 890, { steps: 4 }); await page.waitForTimeout(500);
  ok(!(await page.$('.dpk')), 'leaving the card closes it');
  // Escape closes the detail but not the popup
  await page.mouse.move(tx, ty); await page.waitForSelector('.dpk'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.$('.dpk')) && !!(await page.$('.mt-pop')), 'Escape closes only the detail');
  // switch tile → card follows
  await page.mouse.move(5, 5); await page.mouse.move(tx, ty); await page.waitForSelector('.dpk'); const n1 = await page.$eval('.dpk-card', (e) => e.getAttribute('aria-label'));
  const [ux, uy] = await center(page, CARD('product', 1)); await page.mouse.move(ux, uy, { steps: 3 }); await page.waitForTimeout(600);
  const n2 = await page.$eval('.dpk-card', (e) => e.getAttribute('aria-label')).catch(() => '');
  ok(n2 && n1 !== n2, 'moving to another card swaps the detail: ' + n1 + ' → ' + n2);
  // solution / case sections
  for (const k of ['solution', 'case']) {
    await page.mouse.move(5, 5); await page.waitForTimeout(400);
    await page.$eval('.mt-pop .cc-sec.' + k, (e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
    await page.hover(CARD(k)); await page.waitForSelector('.dpk'); await shot(page, '02-' + k);
    const box = await page.$eval('.dpk', (e) => e.getBoundingClientRect().toJSON()); ok(box.bottom <= 900 && box.top >= 0, k + ' detail fits the window (h ' + Math.round(box.height) + ')');
    await page.mouse.move(5, 5); await page.waitForTimeout(400);
  }
});
await run('small', { viewport: { width: 1180, height: 680 } }, async (page) => {
  await story(page); await page.mouse.move(5, 5); await page.waitForTimeout(400); // the popup opens under the pointer — start from a clear spot
  await page.hover(CARD()); await page.waitForSelector('.dpk'); await page.waitForTimeout(300);
  const b = await page.$eval('.dpk', (e) => e.getBoundingClientRect().toJSON());
  ok(b.top >= 0 && b.bottom <= 680 && b.left >= 0 && b.right <= 1180, 'small window: card inside the viewport ' + JSON.stringify([Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]));
  await shot(page, '03-small');
  // scroll inside the card does not close it
  await page.mouse.move(b.left + 300, b.top + b.height - 40); await page.mouse.wheel(0, 200); await page.waitForTimeout(300);
  ok(!!(await page.$('.dpk')), 'scrolling inside the card keeps it open');
});
await run('dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, async (page) => {
  await story(page); await page.$eval('.mt-pop .cc-sec.case', (e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
  await page.hover(CARD('case')); await page.waitForSelector('.dpk'); await shot(page, '04-dark-case');
  await page.mouse.move(5, 5); await page.waitForTimeout(300); await page.$eval('.mt-pop .cc-sec.product', (e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200);
  await page.hover(CARD()); await page.waitForSelector('.dpk'); await shot(page, '05-dark-product');
});
await run('req', { viewport: { width: 1440, height: 900 } }, async (page) => {
  // matching popup of a proposal that already has linked items: storyboard → 고객 요구사항 팝업 → 저장 → 매칭 팝업
  await page.click('.sb-item:has-text("커피")'); await page.waitForSelector('.topbar'); await page.waitForTimeout(600);
  await page.click('.start-card'); await page.waitForSelector('.rq-pop');
  await page.click('.rq-f .btn:has-text("저장")'); await page.waitForSelector('.mt-pop .cc-top'); await page.waitForTimeout(300);
  for (const k of ['product', 'solution', 'case']) {
    const card = '.cc-sec.' + k + ' .cc-card >> nth=0';
    if (!(await page.$('.cc-sec.' + k + ' .cc-card'))) { errs.push('FAIL no linked ' + k); continue; }
    await page.mouse.move(5, 5); await page.waitForTimeout(250);
    await page.hover(card); await page.waitForSelector('.dpk'); await shot(page, '06-req-' + k);
    const [rx, ry] = await center(page, card); const [dx, dy] = await center(page, '.dpk-main');
    await page.mouse.move(rx, ry); await page.mouse.move(dx, dy, { steps: 8 }); await page.waitForTimeout(400);
    ok(!!(await page.$('.dpk')), 'matching popup ' + k + ': card stays open on the way in');
  }
});
console.log(errs.length ? errs : 'all ok'); await browser.close(); srv.close();
