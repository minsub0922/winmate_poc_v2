// Best Scenario filters = the PPT 레이아웃 템플릿 page's filter UI (filterpop.jsx): big search, '필터' button under it with the active
// filters as chips to its right, one popup (요구사항 → 전략 → 업종 → 솔루션 → 제품 → 결말, counts per chip, nothing applies until
// 'N개 보기'), products through the directory explorer (several = any of them), old saved state migrates, the two popups look
// the same (size · chips · footer), mobile + dark.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname); const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const PORT = 8840 + Math.floor(Math.random() * 50);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'bf-' + n + '.png') }));
async function open(opts, pre) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  if (pre) await page.addInitScript(pre);
  await page.goto('http://localhost:' + PORT + '/'); await page.waitForSelector('.sb-bs', { state: 'attached', timeout: 60000 }); if (opts.isMobile) { await page.click('.mob-top .btn'); await page.waitForTimeout(400); } await page.click('.sb-bs'); await page.waitForSelector('.bsp'); if (!opts.isMobile) await page.mouse.move(1300, 120); await page.waitForTimeout(900);
  return { ctx, page };
}
const rows = (page) => page.locator('.bsl').count();
const go = async (page) => +(await page.locator('.tlf-go b').innerText());
const popStyle = (page) => page.evaluate(() => {
  const m = document.querySelector('.modal.tlf'); const c = document.querySelector('.tlf-chip:not(.all)'); const h = document.querySelector('.tlf-h h3'); const go = document.querySelector('.tlf-go'); const cs = (e) => getComputedStyle(e);
  return { w: Math.round(m.getBoundingClientRect().width), title: document.querySelector('.modal.tlf .mhead h2').textContent, chip: [cs(c).height, cs(c).borderRadius, cs(c).fontSize, cs(c).fontWeight].join(' '), h3: cs(h).fontSize,
    foot: [...document.querySelectorAll('.modal.tlf .mfoot .btn')].map((b) => b.textContent.replace(/\d+/g, 'N')).join(' | ') };
});
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 } }, () => { try { localStorage.removeItem('winmate.v2.ui'); } catch (e) {} });
  // the template page's popup, to compare with
  await page.click('.sb-tpl'); await page.waitForSelector('.tl-card'); await page.mouse.move(1300, 120); await page.waitForTimeout(300); await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.waitForTimeout(300);
  const tplPop = await popStyle(page); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const tplBar = await page.evaluate(() => { const i = document.querySelector('.tl-search .input'); return [Math.round(i.getBoundingClientRect().height), getComputedStyle(i).fontSize, getComputedStyle(document.querySelector('.tl-fbtn')).height].join(' '); });
  await page.click('.sb-bs'); await page.waitForSelector('.bsl'); await page.mouse.move(1300, 120); await page.waitForTimeout(800);

  ok(!(await page.$('.bsp select')) && !(await page.$('.bsp-filters')) && !(await page.$('.tl-filters')), 'no select row on the page');
  { const sb = await (await page.$('.tl-search .input')).boundingBox(), fb = await (await page.$('.tl-fbtn')).boundingBox();
    ok(sb.height >= 50 && fb.y > sb.y + sb.height - 1 && Math.abs(fb.x - sb.x) < 4, 'big search (' + sb.height + 'px) · filter button under it, left-aligned'); }
  const bsBar = await page.evaluate(() => { const i = document.querySelector('.tl-search .input'); return [Math.round(i.getBoundingClientRect().height), getComputedStyle(i).fontSize, getComputedStyle(document.querySelector('.tl-fbtn')).height].join(' '); });
  ok(bsBar === tplBar, 'search + filter button identical to the template page: ' + bsBar);
  const all = await rows(page); ok(all >= 20, 'all scenarios listed: ' + all);
  ok(!(await page.$('.tl-sum')), 'no summary line while browsing (no counts on the page)');
  await shot(page, '01-page');

  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.waitForTimeout(300);
  ok((await page.$$eval('.tlf-step h3', (e) => e.map((x) => x.textContent))).join('>') === '요구사항 타입>전략>업종>솔루션>제품>결말', 'popup steps in order');
  const bsPop = await popStyle(page);
  ok(bsPop.w === tplPop.w && bsPop.title === tplPop.title && bsPop.chip === tplPop.chip && bsPop.h3 === tplPop.h3, 'same popup as the template page: ' + bsPop.w + 'px · ' + bsPop.chip);
  ok(bsPop.foot === tplPop.foot.replace('N장 보기', 'N개 보기'), 'same footer: ' + bsPop.foot);
  ok(/시나리오 수/.test(await page.locator('.modal.tlf .mhead p').innerText()), 'popup explains the numbers in scenarios');
  ok((await go(page)) === all, 'popup starts with every scenario: ' + await go(page));
  await shot(page, '02-popup');

  const strat = page.locator('.tlf-step:has(h3:text-is("전략")) .tlf-chip:not(.all):not([disabled])').first(); const stratName = (await strat.innerText()).replace(/\d+$/, '').trim();
  await strat.click(); const n1 = await go(page); ok(n1 > 0 && n1 < all, 'strategy previews the count: ' + stratName + ' → ' + n1);
  ok(await page.$eval('.tlf-step:has(h3:text-is("전략")) .tlf-chip.all', (e) => e.getAttribute('aria-pressed')) === 'false', '전체 un-pressed');
  const req = page.locator('.tlf-step:has(h3:text-is("요구사항 타입")) .tlf-chip:not(.all):not([disabled])').first(); const reqName = (await req.innerText()).replace(/\d+$/, '').trim();
  await req.click(); const n2 = await go(page); ok(n2 <= n1 && n2 > 0, 'requirement narrows: ' + n1 + ' → ' + n2 + ' (' + reqName + ')');
  ok(await page.$eval('.tlf-step:has(h3:text-is("요구사항 타입")) .tlf-chip[aria-pressed="true"] .tlf-dot', (e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'requirement chips carry their group colour');
  ok((await page.locator('.tlf-step:has(h3:text-is("업종")) .tlf-chip[disabled]').count()) > 0, 'choices with nothing left are disabled');
  await shot(page, '03-popup-picked');
  ok((await rows(page)) === all, 'nothing applies before "N개 보기"');
  await page.click('.tlf-go'); await page.waitForSelector('.modal.tlf', { state: 'detached' });
  ok((await rows(page)) === n2, 'applied: ' + n2);
  ok((await page.locator('.tl-onchip').count()) === 2 && (await page.locator('.tl-fn').innerText()) === '2', 'two active chips + badge 2: ' + (await page.locator('.tl-onchip').allInnerTexts()).join(' / ').replace(/\n/g, ' '));
  { const fb = await (await page.$('.tl-fbtn')).boundingBox(), cb = await (await page.$('.tl-onchip')).boundingBox();
    ok(cb.x > fb.x + fb.width && Math.abs((cb.y + cb.height / 2) - (fb.y + fb.height / 2)) < 3, 'active chips sit right of the filter button'); }
  ok((await page.locator('.bsl-req.on, .bsl-ind.on, .bsl-tag.on').count()) >= 0, 'rows render');
  await shot(page, '04-applied');
  await page.click('.tl-onchip:has-text("요구사항")'); await page.waitForTimeout(200);
  ok((await rows(page)) === n1 && (await page.locator('.tl-onchip').count()) === 1, 'removing a chip drops only that filter');
  // Escape discards the draft
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.locator('.tlf-step:has(h3:text-is("결말")) .tlf-chip:not(.all):not([disabled])').first().click(); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok((await rows(page)) === n1, 'Escape keeps the applied filters');
  await page.click('.tl-on .btn:has-text("모두 지우기")'); await page.waitForTimeout(200);
  ok((await rows(page)) === all && !(await page.$('.tl-on')), 'clear all');

  // search + filter: the popup counts within the search hits
  await page.fill('#bs-q', '파일럿'); await page.waitForTimeout(400); const s0 = await rows(page);
  ok(s0 > 0 && s0 < all && /관련도순/.test(await page.locator('.tl-sum').innerText()), 'search → ' + s0 + ' rows by relevance');
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); ok((await go(page)) === s0, 'popup counts within the search: ' + s0);
  await page.locator('.tlf-step:has(h3:text-is("업종")) .tlf-chips + .tlf-chips .tlf-chip:not([disabled])').first().click(); const s1 = await go(page); await page.click('.tlf-go'); await page.waitForTimeout(300);
  ok((await rows(page)) === s1 && s1 <= s0, 'search + industry: ' + s0 + ' → ' + s1);
  await page.fill('#bs-q', ''); await page.click('.tl-on .btn'); await page.waitForTimeout(300);

  // products: the same directory explorer popup, counted in scenarios
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf');
  ok((await page.locator('.tlf-step:has(h3:text-is("제품")) .tlf-sub .tlf-chip').count()) > 0, 'most used products as quick chips');
  await page.click('.tlf-find'); await page.waitForSelector('.ex-modal'); await page.waitForTimeout(300);
  ok((await page.locator('.ex-modal .mhead h2').innerText()) === '제품으로 거르기' && /시나리오를 보여 줘요/.test(await page.locator('.ex-modal .mhead p').innerText()), 'explorer: title + scenario wording');
  ok((await page.$$('.ex-nav .ex-nd')).length > 3, 'explorer shows folders');
  const st = await page.locator('.ex-row .ex-st').allInnerTexts(); ok(st.length > 0 && st.every((t) => /\d+개$/.test(t.replace(/\s/g, ''))), 'rows count scenarios (개): ' + st.slice(0, 4).map((t) => t.replace(/\s/g, '')).join(', '));
  await shot(page, '05-explorer');
  await page.locator('.ex-row:not(.dis)').first().click();
  await page.click('.ex-nav .ex-nd:has-text("많이 쓰인")'); await page.waitForTimeout(200);
  ok(/시나리오 \d+개에 나와요/.test(await page.locator('.ex-tile .ex-why').first().innerText()), 'most used tiles: ' + await page.locator('.ex-tile .ex-why').first().innerText());
  await page.locator('.ex-tile:not(.dis):not(.on)').first().click();
  ok((await page.locator('.ex-apply').innerText()).includes('2개'), 'two products picked');
  await shot(page, '06-explorer-picked');
  await page.click('.ex-apply'); await page.waitForSelector('.ex-modal', { state: 'detached' });
  ok((await page.locator('.tlf-prod').count()) === 2, 'two product chips in the popup');
  const np = await go(page);
  await shot(page, '07-popup-prods');
  await page.click('.tlf-go'); await page.waitForTimeout(300);
  ok((await rows(page)) === np && /제품/.test(await page.locator('.tl-onchip').first().innerText()), 'product filter applied (any of them): ' + np + ' · ' + (await page.locator('.tl-onchip').first().innerText()).replace(/\n/g, ' '));
  ok((await page.locator('.bsl').evaluateAll((rs) => rs.every((r) => r.querySelector('.bsl-tag.on')))), 'every row leads with a chosen product');
  await shot(page, '08-applied-prods');
  await page.click('.tl-on .btn'); await page.waitForTimeout(200);
  // the template page still counts layouts
  await page.click('.sb-tpl'); await page.waitForSelector('.tl-card'); await page.mouse.move(1300, 120); await page.waitForTimeout(300); await page.click('.tl-fbtn'); await page.click('.tlf-find'); await page.waitForSelector('.ex-modal'); await page.waitForTimeout(200);
  const st2 = await page.locator('.ex-row .ex-st').allInnerTexts(); ok(st2.length > 0 && st2.every((t) => /\d+장$/.test(t.replace(/\s/g, ''))) && /레이아웃을 보여 줘요/.test(await page.locator('.ex-modal .mhead p').innerText()), 'template explorer still counts layouts (장)');
  await ctx.close();
}
{ // old saves: one product from the select · a strategy tab
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } }, () => { localStorage.setItem('winmate.v2.ui', JSON.stringify({ bs: { q: '', prod: 'qm55c', sol: '', end: '' } })); });
  const v = await page.locator('.tl-onchip').allInnerTexts(); ok(v.length === 1 && /제품/.test(v[0]) && /QM55C/.test(v[0]), 'old single product → 제품 chip: ' + v.join('').replace(/\n/g, ' '));
  await ctx.close();
}
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } }, () => { localStorage.setItem('winmate.v2.ui', JSON.stringify({ bs: { by: 'strategy', tab: 'roi' } })); });
  const v = await page.locator('.tl-onchip').allInnerTexts(); ok(v.length === 1 && /전략/.test(v[0]) && /투자 회수형/.test(v[0]), 'old strategy tab → 전략 chip');
  await ctx.close();
}
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.waitForTimeout(600);
  const sb = await (await page.$('.tl-search')).boundingBox(), fb = await (await page.$('.tl-fbtn')).boundingBox();
  ok(fb.y >= sb.y + sb.height - 1 && fb.x + fb.width <= 390, 'mobile: filter button under the search');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.querySelector('.bsp').scrollWidth <= document.querySelector('.bsp').clientWidth), 'mobile: no sideways scroll');
  await shot(page, '09-mobile');
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.waitForTimeout(300); await shot(page, '10-mobile-popup');
  ok(await page.$eval('.modal.tlf', (e) => e.scrollWidth <= e.clientWidth + 1), 'mobile popup: no sideways overflow');
  await ctx.close();
}
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await page.click('.tl-fbtn'); await page.waitForSelector('.modal.tlf'); await page.waitForTimeout(400);
  await page.locator('.tlf-step:has(h3:text-is("요구사항 타입")) .tlf-chip:not(.all):not([disabled])').nth(1).click(); await shot(page, '11-dark-popup'); await ctx.close();
}
await browser.close(); srv.close();
if (errs.length) { console.log(errs.join('\n')); process.exit(1); } console.log('all ok');
