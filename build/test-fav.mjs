// 찜 (My › 찜): 어느 PPT 레이아웃 뷰에서나 ♡ — 템플릿 카드 · 상세, Best Scenario 장표 · 상세, 제안서 Storyboard 장 · 상세 · 레이아웃 패널, 레이아웃 추가 팝업.
// 같은 레이아웃이라도 값이 채워진 장과 빈 레이아웃은 따로 찜 · My › 찜에서 ‘값이 채워진 장’ / ‘빈 레이아웃’으로 나눠 보임 ·
// 찜한 값 그대로 제안서에 넣기 · 찜한 장을 고쳐 My 템플릿으로 저장(값이 들어간 채로) · 찜 풀기 · 새로고침 뒤 유지 · 모바일
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0);
const URL0 = 'http://localhost:' + srv.address().port + '/';
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const shot = (page, n) => page.waitForTimeout(350).then(() => page.screenshot({ path: path.join(shots, 'fav-' + n + '.png') }));
const favs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.favs') || '[]'));
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|Failed to load resource/.test(m.text())) errs.push(m.text()); });
const side = async (sel) => { await page.click(sel); await page.mouse.move(900, 700); await page.waitForTimeout(500); };
await page.goto(URL0); await page.waitForSelector('.sb-tpl', { state: 'attached', timeout: 60000 });

// ---- Best Scenario sheet (filled) ----
await side('.sb-bs'); await page.waitForSelector('.bsl-sheet');
const sheet = page.locator('.bsl-sheet').first();
await sheet.hover(); await page.waitForTimeout(200);
const fbF = await sheet.locator('.fav-btn').getAttribute('data-fav');
await sheet.locator('.fav-btn').click(); await page.waitForTimeout(300);
ok(!(await page.$('.modal')), 'heart inside a sheet card does not open the sheet');
let fv = await favs(page);
ok(fv.length === 1 && fv[0].f === fbF && fv[0].filled && /^Best Scenario · /.test(fv[0].from), 'Best Scenario sheet saved as a filled favourite: ' + fbF);
ok(await sheet.locator('.fav-btn').getAttribute('aria-pressed') === 'true', 'heart stays on');
// the same sheet in its detail: already on
await sheet.click(); await page.waitForSelector('.tl-detail');
ok(await page.locator('.mfoot .fav-btn').getAttribute('aria-pressed') === 'true', 'detail of the same filled sheet shows 찜함');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

// ---- the same layout, empty, from the template library ----
await side('.sb-tpl'); await page.waitForSelector('.tl-card');
await page.fill('#tl-q', fbF); await page.waitForTimeout(500);
const card = page.locator('.tl-card[data-f="' + fbF + '"]').first();
ok(await card.count() > 0, 'library finds ' + fbF);
ok(await card.locator('.fav-btn').getAttribute('aria-pressed') === 'false', 'the empty layout is a different favourite (not on yet)');
await card.hover(); await card.locator('.fav-btn').click(); await page.waitForTimeout(300);
ok(!(await page.$('.modal')), 'heart on a library card does not open the detail');
fv = await favs(page);
ok(fv.length === 2 && fv.filter((x) => x.f === fbF).length === 2 && fv.some((x) => x.f === fbF && !x.filled && !x.ov), 'same layout twice: filled + empty');
// another layout from its detail
await page.fill('#tl-q', ''); await page.waitForTimeout(400);
await page.click('.tl-card >> nth=3'); await page.waitForSelector('.tl-detail');
await page.click('.mfoot .fav-btn'); await page.waitForTimeout(200);
ok(await page.locator('.mfoot .fav-btn').getAttribute('aria-pressed') === 'true' && (await favs(page)).length === 3, 'detail ♡ adds');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await shot(page, '01-library');

// ---- proposal: Storyboard card · detail · panel ----
await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(600);
const filledCard = page.locator('.lcard.st-partial, .lcard.st-done').first(); // 2026-10-19: A 커피 opens on a done part
await filledCard.scrollIntoViewIfNeeded(); await filledCard.hover(); await page.waitForTimeout(200);
const pF = await filledCard.locator('.fav-btn').getAttribute('data-fav');
await filledCard.locator('.fav-btn').click(); await page.waitForTimeout(300);
ok(!(await page.$('.modal')), 'heart on a Storyboard card does not open it');
fv = await favs(page);
const pFav = fv.find((x) => x.f === pF && /^제안서 · /.test(x.from));
ok(pFav && pFav.filled, 'proposal sheet with values → filled favourite (' + pF + ')');
await filledCard.click(); await page.waitForSelector('.detail-right');
ok(await page.locator('.mfoot .fav-btn').getAttribute('aria-pressed') === 'true', 'Storyboard detail shows 찜함');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
// picker: 찜 section, add the filled one with its values
await page.click('.col .btn-primary:has-text("PPT 레이아웃 추가") >> nth=0'); await page.waitForSelector('.pk-fav'); await page.waitForTimeout(500);
const order = await page.$$eval('.mbody > section', (es) => es.map((e) => e.className.split(' ').pop()));
ok(order.indexOf('pk-fav') > order.indexOf('pk-rec') && order.indexOf('pk-fav') < order.indexOf('pk-all'), 'picker: 찜 section between 추천 and 전체 (' + order.join(',') + ')');
const fcards = await page.$$eval('.pk-fav .pcard', (es) => es.map((e) => e.querySelector('.fav-tag').textContent));
ok(fcards.length === 4 && fcards.slice(0, 2).every((t) => t === '값 있음') && fcards.slice(2).every((t) => t === '빈 레이아웃'), 'picker 찜: filled first, then empty: ' + fcards.join(','));
const n0 = +(await page.$eval('.mfoot .note b', (e) => e.textContent));
const bsCard = page.locator('.pk-fav .pcard[data-f="' + fbF + '"]').first();
await bsCard.click(); await page.waitForTimeout(300);

await shot(page, '02-picker');
await page.click('.modal:has(#pk-q) .mfoot .btn:last-child'); await page.waitForSelector('#pk-q', { state: 'detached' }); await page.waitForTimeout(500);
const added = await page.evaluate((f) => { const ps = JSON.parse(localStorage.getItem('winmate.v2.proposals')); const p = ps.find((x) => /커피/.test(x.title)); const xs = p.parts.flatMap((s) => s.layouts).filter((x) => x.f === f); return xs.map((x) => ({ st: x.status, nt: Object.keys((x.ov && x.ov.t) || {}).length, ni: Object.keys((x.ov && x.ov.img) || {}).length })); }, fbF);
ok(added.length >= 1 && added.some((x) => x.st === 'partial' && x.nt + x.ni > 0), 'it went in with the favourite’s values: ' + JSON.stringify(added));
// layout panel (viewer)
const vbtn = page.locator('button:has-text("PPT 레이아웃")').first();
if (await vbtn.count()) { await vbtn.click().catch(() => {}); await page.waitForTimeout(500); }
if (await page.$('.vinfo')) ok(!!(await page.$('.vinfo .fav-btn')), 'PPT 레이아웃 panel has ♡');

// ---- My › 찜 ----
await side('.sb-tpl'); await page.waitForSelector('.tl-mybtn');
if (await page.$eval('.tl-mybtn', (e) => e.getAttribute('aria-pressed')) !== 'true') await page.click('.tl-mybtn');
await page.click('.my-tabs button:has-text("찜")'); await page.waitForSelector('.fav-secs');
const heads = await page.$$eval('.fav-grp .tl-grp-h h2', (e) => e.map((x) => x.textContent));
ok(heads.join('|') === '값이 채워진 장|빈 레이아웃', 'My › 찜 groups: ' + heads.join(' | '));
const both = await page.$$eval('.fav-card[data-f="' + fbF + '"]', (es) => es.map((e) => ({ filled: e.classList.contains('filled'), text: e.querySelector('.slide-inner') ? e.querySelector('.slide-inner').textContent.replace(/\s+/g, ' ').slice(0, 400) : '' })));
ok(both.length === 2 && both[0].filled && !both[1].filled, 'same layout in both groups');
await page.waitForTimeout(800);
const both2 = await page.$$eval('.fav-card[data-f="' + fbF + '"] .slide-inner', (es) => es.map((e) => e.textContent.replace(/\s+/g, ' ')));
ok(both2.length === 2 && both2[0] !== both2[1], 'the filled one shows its own values, the empty one the layout’s sample text');
ok((await page.locator('.tl-sum').innerText()).includes('My › 찜'), 'summary says My › 찜');
await page.mouse.move(5, 5); await shot(page, '03-my-fav');
// open the filled favourite → edit with values → save as My template
await page.click('.fav-card.filled[data-f="' + fbF + '"]'); await page.waitForSelector('.tl-detail');
ok(/값이 채워진 장/.test(await page.locator('.tl-detail').innerText()), 'detail says it is a filled sheet');
await page.click('.mfoot .tl-edit'); await page.waitForSelector('.ed-box'); await page.waitForTimeout(800);
const edTxt = await page.$eval('.ed-host', (e) => e.textContent.replace(/\s+/g, ' '));
ok(edTxt.replace(/\s/g, '').slice(0, 120) === both2[0].replace(/\s/g, '').slice(0, 120), 'editor starts with the favourite’s values');
await page.click('.modal:has(.myed) .mfoot .btn-primary'); await page.waitForSelector('.ed-box', { state: 'detached' }); await page.waitForTimeout(500);
ok(await page.$eval('.my-tabs button:first-child', (e) => e.getAttribute('aria-pressed')) === 'true' && (await page.$$('.my-grp .tl-card')).length === 1, 'saved as a My template (내 템플릿 tab)');
// unfavourite from My › 찜
await page.click('.my-tabs button:has-text("찜")'); await page.waitForSelector('.fav-secs');
const nFav = (await page.$$('.fav-card')).length;
await page.locator('.fav-card.empty').first().hover(); await page.locator('.fav-card.empty .fav-btn').first().click(); await page.waitForTimeout(300);
ok((await page.$$('.fav-card')).length === nFav - 1, '♡ again removes it from 찜');
// persists
await page.reload(); await page.waitForSelector('.tl-mybtn'); await page.waitForTimeout(800);
ok((await page.$$('.fav-card')).length === nFav - 1, 'after reload: still there');
await ctx.close();

// ---- mobile: hearts visible without hover ----
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const mp = await m.newPage();
await mp.goto(URL0); await mp.waitForSelector('.sb-tpl', { state: 'attached', timeout: 60000 }); await mp.click('.mob-top .btn'); await mp.waitForTimeout(300); await mp.click('.sb-tpl'); await mp.waitForSelector('.tl-card');
ok(await mp.$eval('.tl-card .fav-btn', (e) => getComputedStyle(e).opacity === '1'), 'touch: heart always visible');
await mp.tap('.tl-card .fav-btn'); await mp.waitForTimeout(300);
ok(!(await mp.$('.modal')) && (await mp.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.favs') || '[]').length)) === 1, 'touch: tap the heart → 찜, card not opened');
await mp.screenshot({ path: path.join(shots, 'fav-04-mobile.png') });
await m.close();
console.log(errs.length ? '\n' + errs.join('\n') : '\nall ok');
await browser.close(); srv.close();
process.exit(errs.length ? 1 : 0);
