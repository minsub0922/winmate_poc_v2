// Layout detail: right panel = sheet references (nothing selected) / unit evidence (selected) · image popover · AI fill scopes
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8811);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
// fixture: the A 커피 example as it was before the history rework (its 핵심 수치 4 · 제품 3 sheets are what this test drives) — planted once per tab
const A_FIX = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures/seed_v3_sample.json'), 'utf8')).find((p) => p.id === 'p_seed_acoffee');
const PLANT = `if (!sessionStorage.getItem('fx')) { localStorage.setItem('winmate.v2.proposals', ${JSON.stringify(JSON.stringify([A_FIX]))}); localStorage.setItem('winmate.v2.seedv', '4'); sessionStorage.setItem('fx', '1'); }`;
async function run(name, opts, fn) { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); await page.addInitScript(PLANT); page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); page.on('response', (r) => { if (r.status() >= 400) errs.push(name + ' http ' + r.status() + ' ' + r.url()); }); await page.goto('http://localhost:8811/'); await page.waitForSelector('.home'); await fn(page); await ctx.close(); }
const shot = (page, n) => page.waitForTimeout(350).then(() => page.screenshot({ path: path.join(shots, 'detail-' + n + '.png') }));
const openDetail = async (page, code) => {
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.click(`.lcard:has(.nm:text-is("${code}"))`); await page.waitForSelector('.detail .slide-units [data-unit]'); await page.waitForTimeout(400);
};
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await openDetail(page, '핵심 수치 4');
  ok(!(await page.$('.detail-right .seg[role="tablist"]')), 'no 상세 정보 / AI 채우기 tabs');
  ok(await page.isVisible('.evp-head h3:text("이 장 참고 자료")'), 'nothing selected → sheet references');
  const secs = await page.$$eval('.evsec h4 span:first-of-type', (e) => e.map((x) => x.textContent));
  ok(secs[0] === '웹 소스', 'market sheet lists web sources first: ' + secs.join(' · '));
  ok((await page.$$('.wsrc')).length >= 4, 'web sources listed (' + (await page.$$('.wsrc')).length + ')');
  ok(await page.$eval('.wsrc', (a) => a.target === '_blank' && /^https:/.test(a.href)), 'web source opens in a new tab');
  ok(await page.isVisible('.fillcard .btn-primary:has-text("AI로 채우기")'), 'AI fill (all empty units) button');
  const units = await page.$$eval('.detail .slide-units [data-unit]', (e) => e.map((x) => x.getAttribute('data-unit')));
  console.log('units', units.join(' '));
  await shot(page, '01-sheet-market');
  // hover the fill card → empty units highlighted on the slide
  await page.hover('.fillcard .fc-row'); await page.waitForTimeout(200);
  ok((await page.$$('.detail .wm-hi')).length >= 3, 'hovering the counter highlights empty units (' + (await page.$$('.detail .wm-hi')).length + ')');
  await shot(page, '02-hi');
  await page.mouse.move(5, 5);
  // select the 2nd KPI card (edited in the seed: 62%)
  await page.click('.detail [data-tb="7"]'); await page.waitForTimeout(250);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150); // leave the inline edit
  ok(await page.$eval('.detail [data-unit="t6-7-8"]', (e) => e.classList.contains('wm-sel')), 'click selects the whole KPI card (t6-7-8)');
  ok(await page.isVisible('.unitcard .ukind:has-text("수치 카드")'), 'unit panel shows unit kind');
  ok(await page.isVisible('.ustate.s-user'), 'seeded edit shows 직접 입력 state');
  ok(await page.isVisible('.evsec h4:has-text("사용된 근거")'), 'evidence section');
  const hasWeb = await page.isVisible('.evsec h4:has-text("확인할 웹 소스")'); ok(hasWeb, 'numeric unit suggests web sources to verify');
  await shot(page, '03-unit-kpi');
  // add a suggested source as evidence
  const before = (await page.$$('.evsec:has(h4:has-text("사용된 근거")) .evrow')).length;
  await page.click('.evsec:has(h4:has-text("확인할 웹 소스")) .evrow .btn:has-text("근거로") >> nth=0'); await page.waitForTimeout(250);
  ok((await page.$$('.evsec:has(h4:has-text("사용된 근거")) .evrow')).length === before + 1, 'add suggestion → listed under 사용된 근거');
  // add a manual link
  await page.fill('#ev-url', 'https://www.example.org/report-2025'); await page.fill('#ev-title', '외식업 경기 동향'); await page.click('.addlink .btn:has-text("추가")'); await page.waitForTimeout(250);
  const evs = await page.$$eval('.evsec:has(h4:has-text("사용된 근거")) .evrow', (e) => e.map((x) => x.textContent));
  ok(evs.some((t) => t.includes('외식업 경기 동향')), 'manual link added as evidence: ' + evs.join(' | '));
  await shot(page, '04-unit-evidence');
  // remove one
  const n1 = (await page.$$('.evsec:has(h4:has-text("사용된 근거")) .evrow')).length;
  await page.click('.evsec:has(h4:has-text("사용된 근거")) .evrow >> nth=0 >> button[aria-label$="근거에서 빼기"]'); await page.waitForTimeout(200);
  ok((await page.$$('.evsec:has(h4:has-text("사용된 근거")) .evrow')).length === n1 - 1, 'remove evidence');
  // Esc deselects (modal stays open)
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(await page.isVisible('.evp-head h3:text("이 장 참고 자료")') && await page.isVisible('.detail'), 'Esc clears the selection, popup stays');
  // click the blank slide area → nothing selected
  await page.click('.detail [data-tb="1"]'); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok(await page.isVisible('.unitcard .ukind:has-text("제목")'), 'title unit');
  await page.mouse.click(...(await page.$eval('.detail-left', (e) => { const r = e.getBoundingClientRect(); return [r.left + 8, r.bottom - 8]; }))); await page.waitForTimeout(150);
  ok(await page.isVisible('.evp-head h3:text("이 장 참고 자료")'), 'click outside the slide clears the selection');
  // inline edit inside a unit keeps it selected and marks it 직접 입력
  await page.click('.detail [data-tb="12"]'); await page.waitForTimeout(150);
  ok(await page.isVisible('.ustate.s-empty'), 'untouched KPI card = 예시 그대로');
  await page.keyboard.press('Control+A'); await page.keyboard.type('18%'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(await page.$eval('.detail [data-unit="t12-13-14"]', (e) => e.classList.contains('wm-sel') && e.textContent.includes('18%')), 'edit committed, unit still selected');
  ok(await page.isVisible('.ustate.s-user'), 'edited unit → 직접 입력');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  // AI fill: one unit (AI unavailable in test → rule fallback, still goes through review)
  await page.click('.detail [data-unit="t3-4-5"]', { position: { x: 6, y: 6 } }); await page.waitForTimeout(150);
  await page.click('.evpanel .btn-primary:has-text("이 요소만 AI로 채우기")'); await page.waitForSelector('.fillflow'); await page.waitForTimeout(800);
  ok(await page.isVisible('.fillflow h3:text("AI 채우기 결과")'), 'unit AI fill → review');
  await shot(page, '05-fill-unit');
  await page.click('.fillflow .btn:has-text("취소")'); await page.waitForTimeout(150);
  // AI fill all
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('.fillcard .btn-primary'); await page.waitForSelector('.fillflow'); await page.waitForTimeout(800);
  ok(await page.isVisible('.fillflow p:has-text("빈 요소")'), 'sheet AI fill scope = empty units');
  await shot(page, '06-fill-all');
  const apply = await page.$('.fillflow .btn-primary:not([disabled])'); if (apply) { await apply.click(); await page.waitForTimeout(300); }
  // go to products sheet (next layouts) — image popover
  await page.click('.mhead .x'); await page.waitForTimeout(300);
  await page.click('.lcard:has(.nm:text-is("제품 3 · 컷 + 설치 장면"))'); await page.waitForSelector('.detail .slide-units [data-unit]'); await page.waitForTimeout(400);
  const secs2 = await page.$$eval('.evsec h4 span:first-of-type', (e) => e.map((x) => x.textContent));
  ok(secs2[0] === '제품 키 메시지 · 이미지', 'product sheet lists product key messages first: ' + secs2.join(' · '));
  ok((await page.$$('.kmsg')).length >= 1 && (await page.$$('.km-img')).length >= 1, 'key messages + product images');
  await shot(page, '07-sheet-products');
  // a unit with a product → product row in the evidence → explorer in replace mode → swap
  await page.locator('.detail [data-tb]:has-text("QM55C")').last().click(); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(await page.isVisible('.prodrow:has-text("QM55C")'), 'card with QM55C shows the product in its evidence');
  await shot(page, '07b-unit-product');
  await page.click('.prodrow:has-text("QM55C")'); await page.waitForSelector('.ex-modal'); await page.waitForTimeout(300);
  ok(await page.isVisible('.ex-modal h2:text("제품 바꾸기")'), 'product explorer opens in replace mode');
  ok(await page.isVisible('.ex-modal .ex-row.dis:has-text("QM55C")'), 'current product marked 지금 제품');
  await shot(page, '07c-explorer');
  await page.fill('#ex-q-in', 'QM85C'); await page.waitForTimeout(200);
  await page.click('.ex-modal .ex-row:has-text("QM85C")'); await page.waitForTimeout(150);
  ok(await page.isVisible('.ex-modal .mfoot .btn-primary:has-text("QM85C로 바꾸기")'), 'single pick → 바꾸기 button');
  await page.click('.ex-modal .mfoot .btn-primary'); await page.waitForTimeout(400);
  ok(!(await page.$('.ex-modal')), 'explorer closes after swap');
  const cardText = await page.$eval('.detail .wm-sel', (e) => e.textContent);
  ok(/QM85C/.test(cardText) && !/QM55C/.test(cardText), 'card text swapped to QM85C: ' + cardText.replace(/\s+/g, ' ').slice(0, 80));
  ok(await page.isVisible('.prodrow:has-text("QM85C")'), 'evidence now shows QM85C');
  await shot(page, '07d-swapped');
  await page.click('.mhead .x'); await page.waitForTimeout(300);
  await page.click('.lcard:has(.nm:has-text("가치 기둥 × 제품"))'); await page.waitForSelector('.detail .slide-units [data-unit]'); await page.waitForTimeout(400);
  const img = await page.$('.detail [data-img]');
  if (img) {
    await img.click(); await page.waitForSelector('.imgpop'); await page.waitForTimeout(250);
    ok((await page.$$('.imgpop .ip-opt')).length >= 4, 'image click → popover with alternatives');
    const fits = await page.$eval('.imgpop', (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }); ok(fits, 'popover fits the viewport');
    ok(await page.isVisible('.unitcard .ukind:has-text("이미지")'), 'image unit selected in the panel');
    await shot(page, '08-imgpop');
    await page.click('.imgpop .ip-opt >> nth=1'); await page.waitForTimeout(300);
    ok(!(await page.$('.imgpop')), 'pick closes popover');
    ok(await page.isVisible('.evsec:has(h4:has-text("이미지 출처")) .evrow'), 'image source recorded as evidence');
    await shot(page, '09-img-picked');
    // Esc on popover closes only the popover
    await img.click().catch(() => {}); await page.click('.detail [data-img] >> nth=0'); await page.waitForSelector('.imgpop'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    ok(!(await page.$('.imgpop')) && await page.isVisible('.detail'), 'Esc closes popover only');
  } else ok(false, 'P3-A has an image slot');
});
await run('tall', { viewport: { width: 1920, height: 1080 } }, async (page) => {
  await openDetail(page, '핵심 수치 4');
  const fits = await page.evaluate(() => { const m = document.querySelector('.modal').getBoundingClientRect(); return [...document.querySelectorAll('.modal .mfoot .btn, .modal .mfoot .done-toggle')].every((b) => { const r = b.getBoundingClientRect(); return r.bottom <= m.bottom && r.bottom <= innerHeight; }); });
  ok(fits, '1920×1080: footer buttons fully visible');
  ok(!(await page.$('.detail-stats')), 'nothing under the slide');
  await shot(page, '15-tall');
});
await run('dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }, async (page) => {
  await openDetail(page, '핵심 수치 4'); await shot(page, '10-dark-sheet');
  await page.click('.detail [data-tb="4"]'); await page.keyboard.press('Escape'); await shot(page, '11-dark-unit');
});
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page) => {
  await page.click('.hcard:has-text("A 커피")'); await page.waitForSelector('.canvas'); await page.waitForTimeout(400);
  await page.click('.lcard:has(.nm:text-is("핵심 수치 4"))'); await page.waitForSelector('.detail .slide-units [data-unit]'); await page.waitForTimeout(400);
  await shot(page, '12-mobile');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile: no horizontal overflow');
});
console.log(errs.length ? errs : 'all good'); await browser.close(); srv.close();
