// Layout template library: no page header, no 파트 유형별/원본 장표별 toggle, one filter popup (steps top → bottom),
// active filters as removable chips, old saved state migrates, mobile + dark.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname); const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const PORT = 8790 + Math.floor(Math.random() * 50);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'lf-' + n + '.png') }));
async function open(opts, pre) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  if (pre) await page.addInitScript(pre);
  await page.goto('http://localhost:' + PORT + '/'); await page.waitForSelector('.sb-tpl', { state: 'attached', timeout: 60000 }); if (opts.isMobile) { await page.click('.mob-top .btn'); await page.waitForTimeout(400); } await page.click('.sb-tpl'); await page.waitForSelector('.tl-card'); if (!opts.isMobile) await page.mouse.move(900, 600); await page.waitForTimeout(900);
  return { ctx, page };
}
const total = async (page) => +(await page.locator('.tl-sum b').first().innerText());
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 } }, () => { try { localStorage.removeItem('winmate.v2.ui'); } catch (e) {} });
  ok((await page.locator('.tl-title h1').innerText()).trim() === 'PPT 레이아웃 템플릿' && !(await page.$('.tl-title h1 .num')) && !(await page.$('.tl-title p')), 'header kept · no count · no description');
  { const sb = await (await page.$('.tl-search .input')).boundingBox(), fb = await (await page.$('.tl-fbtn')).boundingBox();
    ok(sb.height >= 50 && fb.y > sb.y + sb.height - 1 && Math.abs(fb.x - sb.x) < 4, 'big search (' + sb.height + 'px) · filter button under it, left-aligned'); }
  ok(!(await page.$('.tl-by')) && !(await page.$('.tl-tabs')) && !(await page.$('.tl-subs')) && !(await page.$('.tl-filters')), 'no 파트 유형별/원본 장표별 toggle, tabs, sub chips or select row');
  const all = await total(page); ok(all > 400, 'all layouts listed: ' + all);
  await shot(page, '01-default');
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf');
  ok((await page.$$eval('.tlf-step h3', (e) => e.map((x) => x.textContent))).join('>') === '파트 유형>업종>솔루션>제품>이미지 칸>필요한 정보>원본 장표', 'popup steps in order');
  await shot(page, '02-popup');
  await page.click('.tlf-grp:has-text("공간 · 제품")');
  const n1 = +(await page.locator('.tlf-go b').innerText()); ok(n1 > 0 && n1 < all, 'group choice previews the count: ' + n1);
  await page.click('.tlf-chip:has-text("공간 시나리오")');
  ok(await page.$eval('.tlf-grp:has-text("공간 · 제품")', (e) => e.getAttribute('aria-pressed')) === 'false', 'a part type replaces its group');
  const n2 = +(await page.locator('.tlf-go b').innerText());
  const ind = page.locator('.tlf-step:has(h3:text-is("업종")) .tlf-chip:not([disabled])').nth(3); const indName = (await ind.innerText()).replace(/\d+$/, '').trim(); await ind.click();
  const n3 = +(await page.locator('.tlf-go b').innerText()); ok(n3 <= n2, 'industry narrows: ' + n2 + ' → ' + n3 + ' (' + indName + ')');
  await shot(page, '03-popup-picked');
  ok((await total(page)) === all, 'nothing applies before "N장 보기"');
  await page.click('.tlf-go'); await page.waitForSelector('.modal.tlf', { state: 'detached' });
  ok((await total(page)) === n3, 'applied: ' + n3);
  ok((await page.locator('.tl-onchip').count()) === 2 && (await page.locator('.tl-fn').innerText()) === '2', 'two active chips + badge 2');
  { const fb = await (await page.$('.tl-fbtn')).boundingBox(), cb = await (await page.$('.tl-onchip')).boundingBox();
    ok(cb.x > fb.x + fb.width && Math.abs((cb.y + cb.height / 2) - (fb.y + fb.height / 2)) < 3, 'active chips sit right of the filter button'); }
  await shot(page, '04-applied');
  await page.click('.tl-onchip:has-text("업종")'); await page.waitForTimeout(200);
  ok((await total(page)) === n2 && (await page.locator('.tl-onchip').count()) === 1, 'removing a chip drops only that filter');
  // Escape discards the draft
  await page.click('.tl-fbtn'); await page.click('.tlf-chip:has-text("텍스트만")'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok((await total(page)) === n2, 'Escape keeps the applied filters');
  await page.click('.tl-on .btn:has-text("모두 지우기")'); await page.waitForTimeout(200);
  ok((await total(page)) === all && !(await page.$('.tl-on')), 'clear all');
  // search + filter
  await page.fill('#tl-q', '경쟁사 비교'); await page.waitForTimeout(400); const s0 = await total(page);
  await page.click('.tl-fbtn'); await page.click('.tlf-step:has(h3:text-is("원본 장표")) .tlf-chip:not([disabled]) >> nth=1'); await page.click('.tlf-go'); await page.waitForTimeout(300);
  ok((await total(page)) <= s0, 'search + deck filter: ' + s0 + ' → ' + await total(page));
  // products: directory explorer popup (folders · search), several products = any of them
  await page.fill('#tl-q', ''); await page.click('.tl-on .btn'); await page.waitForTimeout(300);
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf');
  await page.click('.tlf-find'); await page.waitForSelector('.ex-modal');
  ok((await page.$$('.ex-nav .ex-nd')).length > 3, 'explorer shows folders');
  await shot(page, '08-explorer');
  await page.click('.ex-nav .ex-nd:has-text("디스플레이")'); await page.waitForTimeout(200);
  const rows = await page.locator('.ex-row:not(.dis)').count(); ok(rows > 0, 'display folder rows: ' + rows);
  await page.fill('#ex-q-in', 'QM55C'); await page.waitForTimeout(200);
  ok((await page.locator('.ex-row').count()) >= 1, 'explorer search finds QM55C');
  await page.locator('.ex-row:not(.dis)').first().click();
  await page.fill('#ex-q-in', ''); await page.click('.ex-nav .ex-nd:has-text("많이 쓰인")'); await page.waitForTimeout(200);
  await page.locator('.ex-tile:not(.dis):not(.on)').first().click();
  await shot(page, '09-explorer-picked');
  ok((await page.locator('.ex-apply').innerText()).includes('2개'), 'two products picked');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!!(await page.$('.modal.tlf')) && !(await page.$('.ex-modal')) && !(await page.$('.tlf-prod')), 'Escape closes only the explorer, nothing picked');
  await page.click('.tlf-find'); await page.waitForSelector('.ex-modal'); await page.fill('#ex-q-in', 'QM55C'); await page.waitForTimeout(200); await page.locator('.ex-row:not(.dis)').first().click();
  await page.click('.ex-nav .ex-nd:has-text("많이 쓰인")'); await page.locator('.ex-tile:not(.dis):not(.on)').first().click();
  await page.click('.ex-apply'); await page.waitForSelector('.ex-modal', { state: 'detached' });
  ok((await page.locator('.tlf-prod').count()) === 2, 'two product chips in the popup');
  const np = +(await page.locator('.tlf-go b').innerText());
  await shot(page, '10-popup-prods');
  await page.click('.tlf-go'); await page.waitForTimeout(300);
  ok((await total(page)) === np && /제품/.test(await page.locator('.tl-onchip').first().innerText()), 'product filter applied: ' + np + ' · ' + await page.locator('.tl-onchip').first().innerText());
  const okAll = await page.evaluate(() => [...document.querySelectorAll('.tl-card')].length); ok(okAll === np, 'cards = count');
  await shot(page, '11-applied-prods');
  await page.click('.tl-on .btn'); await page.waitForTimeout(200);
  // hover still works
  
  const c = await (await page.$('.tl-card')).boundingBox(); await page.mouse.move(c.x + c.width / 2, c.y + c.height / 3); await page.waitForSelector('.pk-peek'); ok(true, 'hover detail opens');
  await ctx.close();
}
{ // old saved state (by deck + tab) migrates to the 원본 장표 filter
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } }, () => { localStorage.setItem('winmate.v2.ui', JSON.stringify({ lib: { q: '', by: 'deck', tab: 'PH', part: '', ind: '', sol: '', img: '', req: '' } })); });
  const v = await page.locator('.tl-onchip').allInnerTexts(); ok(v.length === 1 && /원본 장표/.test(v[0]) && /사진 중심/.test(v[0]), 'old deck tab → 원본 장표 chip: ' + v);
  await ctx.close();
}
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.waitForTimeout(600);
  const sb = await (await page.$('.tl-search')).boundingBox(), fb = await (await page.$('.tl-fbtn')).boundingBox();
  ok(fb.y >= sb.y + sb.height - 1 && fb.x + fb.width <= 390, 'mobile: filter button under the search');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('.tl').scrollWidth <= document.querySelector('.tl').clientWidth), 'mobile: no sideways scroll');
  await shot(page, '05-mobile');
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await shot(page, '06-mobile-popup');
  ok(await page.$eval('.modal.tlf', (e) => e.scrollWidth <= e.clientWidth + 1), 'mobile popup: no sideways overflow');
  await ctx.close();
}
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await page.click('.tl-fbtn'); await page.click('.tlf-grp:has-text("분석 · 이해")'); await shot(page, '07-dark-popup'); await ctx.close();
}
await browser.close(); srv.close();
if (errs.length) { console.log(errs.join('\n')); process.exit(1); } console.log('all ok');
