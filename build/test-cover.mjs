// 표지 lives in the PPT 레이아웃 panel, not on the Storyboard: a Best Scenario proposal's 표지 card is not in its column,
// page numbers start the deck with it (column shows 2쪽 first), PPT 레이아웃 opens on it (label 표지, own first thumbnail group),
// the detail's 이전 / 다음 follow page order, no 표지 bubble at all (history cases' ‘표지’ part, 열기 once its other sheet
// is gone, old saved history migrated on load — data in the hidden deck part), adding a 표지 from PPT 레이아웃 추가 keeps it
// off the Storyboard · dark · mobile
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8836);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
async function run(name, opts, fn) { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); await page.goto('http://localhost:8836/'); await page.waitForSelector('.home'); await fn(page); await ctx.close(); }
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'cover-' + n + '.png') }));
const COVER = /^표지 [A-E]/;
// Best Scenario ‘F&B 프랜차이즈’ → 활용하기 (its Storyboard: 표지 D alone in a hidden part, then 제안 개요 = 목차 + 제안 요약)
const startScenario = async (page) => {
  await page.locator('.sidebar .sb-bs').first().evaluate((e) => e.click()); await page.waitForTimeout(1000);
  await page.click('.bsl:has-text("F&B 프랜차이즈") .bsl-more'); await page.waitForSelector('.modal.sbv .col'); await page.waitForTimeout(500);
  await page.click('.mfoot button:has-text("활용하기")'); await page.waitForSelector('.modal.narrow'); await page.click('.modal.narrow .mfoot .btn-primary');
  await page.waitForSelector('.story .canvas-wrap:not(.ro)'); await page.waitForTimeout(900);
  await page.mouse.move(5, 5);
};
const colNames = (page, i) => page.$$eval('.col', (cs, i) => [...cs[i].querySelectorAll('.lcard .nm')].map((e) => e.textContent), i);
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await startScenario(page);
  const all = await page.$$eval('.lcard .nm', (es) => es.map((e) => e.textContent));
  ok(all.length > 0 && !all.some((n) => COVER.test(n)), 'no 표지 card on the Storyboard (' + all.length + ' cards)');
  const first = await colNames(page, 0); ok(first.length === 2 && /목차/.test(first[0]) && /요약/.test(first[1]), '제안 개요 column: ' + first.join(', '));
  ok((await page.locator('.col >> nth=0').locator('.lcard .pg').first().innerText()) === '2', 'its first card is page 2 — the 표지 is page 1');
  const names0 = await page.$$eval('.col .node-name', (es) => es.map((e) => e.textContent));
  ok(names0[0] === '제안 개요' && !names0.includes('표지'), 'no 표지 bubble — the first bubble is 제안 개요 (' + names0[0] + ')');
  await shot(page, '01-storyboard');
  // PPT 레이아웃 → opens on the 표지
  await page.click('.lay-toggle'); await page.waitForSelector('.viewer .vslide'); await page.waitForTimeout(500);
  ok((await page.locator('.vinfo .pt').innerText()) === '표지' && COVER.test(await page.locator('.vinfo .nm').innerText()), 'panel opens on the 표지: ' + (await page.locator('.vinfo .nm').innerText()));
  ok(/^1 \//.test(await page.locator('.vhead .cnt').innerText()), 'as page 1 (' + (await page.locator('.vhead .cnt').innerText()) + ')');
  const g0 = await page.locator('.vgroup >> nth=0'); ok((await g0.locator('.gl').innerText()) === '표지' && (await g0.locator('.vthumb').count()) === 1, 'first thumbnail group is 표지');
  ok((await page.locator('.vgroup >> nth=1').locator('.gl').innerText()) === '제안 개요', 'then the part groups');
  await shot(page, '02-panel');
  // detail from the panel: 표지 · 전체 1쪽, 다음 → page 2
  await page.click('.viewer .vslide'); await page.waitForSelector('.modal'); await page.waitForTimeout(500);
  const sub = await page.locator('.modal .msub, .modal .mhead p, .modal header p').first().innerText().catch(() => '');
  ok(/^표지 · 전체 1쪽/.test(sub.trim()), 'detail sub: ' + sub.trim().slice(0, 40));
  await page.click('.modal button[aria-label="다음 장"]'); await page.waitForTimeout(500);
  const sub2 = await page.locator('.modal .msub, .modal .mhead p, .modal header p').first().innerText().catch(() => '');
  ok(/열기 · 1번째 장 · 전체 2쪽/.test(sub2), 'next = page 2: ' + sub2.trim().slice(0, 40));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // close the panel, move to another sheet, reopen → back on the 표지
  await page.click('.lay-toggle'); await page.waitForTimeout(200);
  await page.locator('.col >> nth=1').locator('.lcard').first().click(); await page.waitForSelector('.modal'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('.lay-toggle'); await page.waitForSelector('.viewer .vslide'); await page.waitForTimeout(300);
  ok((await page.locator('.vinfo .pt').innerText()) === '표지', 'reopening PPT 레이아웃 goes back to the 표지');
  await page.click('.lay-toggle'); await page.waitForTimeout(200);
  // 열기 left holding only its 표지 → the bubble goes; the 표지 stays page 1 in the panel
  const nCols = await page.locator('.col').count();
  await page.locator('.col >> nth=0').locator('.lcard').first().click(); await page.waitForSelector('.modal'); await page.waitForTimeout(300);
  await page.click('.modal button:has-text("선택 해제")'); await page.waitForTimeout(400);
  if (await page.$('.modal')) await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // its 표지 already sits in the hidden 표지 part, so 열기 is just an empty part now (like any part whose sheets were removed)
  const names1 = await page.$$eval('.col .node-name', (es) => es.map((e) => e.textContent));
  ok((await page.locator('.col').count()) === nCols && (await colNames(page, 0)).length === 0 && !names1.some((n) => /표지/.test(n)), '열기 is an empty part, still no 표지 bubble: ' + names1.slice(0, 3).join(' · '));
  ok(!(await page.$$eval('.lcard .nm', (es) => es.some((e) => /^표지/.test(e.textContent)))), 'no 표지 card either');
  await shot(page, '03-no-bubble');
  await page.click('.lay-toggle'); await page.waitForSelector('.viewer .vslide'); await page.waitForTimeout(300);
  ok((await page.locator('.vinfo .pt').innerText()) === '표지' && (await page.locator('.vgroup >> nth=0').locator('.gl').innerText()) === '표지', 'panel still opens on the 표지');
  await page.click('.lay-toggle'); await page.waitForTimeout(200);
  // adding a 표지 from PPT 레이아웃 추가 keeps it off the Storyboard
  await page.locator('.col >> nth=1').locator('.btn-primary:has-text("PPT 레이아웃 추가")').click(); await page.waitForSelector('.pk-rec .pcard'); await page.waitForTimeout(400);
  await page.fill('#pk-q', '표지'); await page.waitForTimeout(700);
  const ci = await page.$$eval('.pk-grid .pcard', (es) => es.findIndex((e) => /^표지 [A-E]/.test(e.querySelector('.nm').textContent) && !e.classList.contains('sel')));
  const before = (await colNames(page, 1)).length;
  await page.click('.pk-grid .pcard >> nth=' + ci); await page.waitForTimeout(400);
  const t = await page.locator('.toast').last().innerText().catch(() => ''); ok(/PPT 레이아웃 패널의 첫 장/.test(t), 'toast: ' + t);
  await page.click('.mfoot .btn-primary'); await page.waitForTimeout(400);
  ok((await colNames(page, 1)).length === before, 'added 표지 is not in the column');
  ok(+((await page.locator('.lay-toggle .lt-sub').innerText()).match(/\d+/) || [0])[0] > 0, 'deck count includes it: ' + (await page.locator('.lay-toggle .lt-sub').innerText()));
});
await run('history', { viewport: { width: 1440, height: 900 } }, async (page) => {
  // history case with a ‘표지’ part (표지 C) → no 표지 bubble, numbering starts at the next part, sidebar flow skips it too
  const item = page.locator('.sb-item:has-text("M 버거")').first();
  const flow = await item.locator('.sb-flow').getAttribute('aria-label'); ok(!/표지/.test(flow), 'sidebar flow without 표지: ' + flow.slice(0, 60));
  await item.evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(700); await page.mouse.move(5, 5);
  const names = await page.$$eval('.col .node-name', (es) => es.map((e) => e.textContent));
  ok(names.length > 0 && !names.some((n) => /표지/.test(n)), 'no 표지 bubble: ' + names.join(' · '));
  ok((await page.locator('.col >> nth=0').locator('.order').innerText()) === '1', 'first bubble is 1');
  ok(!(await page.$$eval('.lcard .nm', (es) => es.some((e) => /^표지 [A-E]/.test(e.textContent)))), 'no 표지 card');
  await shot(page, '06-history');
  await page.click('.lay-toggle'); await page.waitForSelector('.viewer .vslide'); await page.waitForTimeout(400);
  ok((await page.locator('.vinfo .pt').innerText()) === '표지' && COVER.test(await page.locator('.vinfo .nm').innerText()), 'PPT 레이아웃 shows it: ' + (await page.locator('.vinfo .nm').innerText()));
  await shot(page, '07-history-panel');
});
await run('legacy', { viewport: { width: 1440, height: 900 } }, async (page) => {
  // saved history from before: a ‘표지’ part (표지 C + 목차), an empty ‘표지 · 목차’ part, ‘열기’ holding only 표지 A, an old
  // 업종 기본 표지 (L_IND_FB) → after reload no 표지 bubble anywhere, all of it in the PPT 레이아웃 panel
  // save the seeds once (rename a proposal) so there is a stored history to plant the old data into
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('#pr-title');
  await page.fill('#pr-title', 'A 커피 · 전국 매장 디지털 메뉴보드 전환 '); await page.locator('#pr-title').blur(); await page.waitForTimeout(500);
  await page.evaluate(() => {
    const K = 'winmate.v2.proposals'; const list = JSON.parse(localStorage.getItem(K) || '[]');
    const L = (f, n) => ({ uid: 'lg' + n, f, status: 'empty', ov: { t: {}, img: {} } });
    const P = (id, type, name, lays) => ({ id, type, name, items: [], form: 'list', text: '', done: true, layouts: lays });
    const base = list.find((p) => /커피/.test(p.title));
    const t = JSON.parse(JSON.stringify(base)); t.id = 'p_legacy'; t.title = '옛 히스토리 · 표지 파트'; t.updatedAt = Date.now() + 1e6;
    t.parts = [P('s1', 'cover', '표지', [L('L_C03', 1), L('L_C04', 2)]), P('s2', 'cover', '표지 · 목차', []), P('s3', 'market', '열기', [L('L_C01', 3)]), P('s4', null, '시장 · 전략', [L('L_IND_FB', 4), L('L_MI01', 5)]), ...t.parts.filter((s) => !s.deck)]; // the seed's own 표지 left out — only the old parts carry 표지
    localStorage.setItem(K, JSON.stringify([t, ...list]));
  });
  await page.reload(); await page.waitForSelector('.sidebar .sb-item'); await page.waitForTimeout(400);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.proposals')).find((p) => p.id === 'p_legacy').parts.map((s) => (s.deck ? 'DECK:' : '') + s.name + '[' + s.layouts.map((x) => x.f).join(',') + ']'));
  ok(/^DECK:표지\[L_C03,L_C01,L_IND_FB,L_C04\]$/.test(saved[0]) && !saved.slice(1).some((x) => /표지|^열기/.test(x)), 'saved data migrated: ' + saved.slice(0, 3).join(' · '));
  await page.locator('.sb-item:has-text("옛 히스토리")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(700); await page.mouse.move(5, 5);
  const names = await page.$$eval('.col .node-name', (es) => es.map((e) => e.textContent));
  ok(!names.some((n) => /표지|열기/.test(n)) && names[0] === '시장 · 전략', 'no 표지 bubble from the old history: ' + names.slice(0, 3).join(' · '));
  ok(!(await page.$$eval('.lcard .nm', (es) => es.some((e) => /^표지/.test(e.textContent)))), 'no 표지 card');
  await shot(page, '08-legacy');
  await page.click('.lay-toggle'); await page.waitForSelector('.viewer .vslide'); await page.waitForTimeout(300);
  const g0 = page.locator('.vgroup >> nth=0');
  ok((await g0.locator('.gl').innerText()) === '표지' && (await g0.locator('.vthumb').count()) === 4, 'panel: 표지 group first with its 4 sheets (3 표지 + 목차)');
  ok((await page.locator('.vinfo .pt').innerText()) === '표지', 'panel opens on the 표지');
  await shot(page, '09-legacy-panel');
  // a 표지 added later still goes to the 표지 group, never a bubble
  await page.click('.lay-toggle'); await page.waitForTimeout(200);
  await page.locator('.col >> nth=0').locator('.btn-primary:has-text("PPT 레이아웃 추가")').click(); await page.waitForSelector('.pk-rec .pcard'); await page.waitForTimeout(300);
  await page.fill('#pk-q', '표지'); await page.waitForTimeout(700);
  const sel = await page.$$eval('.pk-grid .pcard', (es) => es.filter((e) => /^표지 [A-E]/.test(e.querySelector('.nm').textContent)).map((e) => e.classList.contains('sel')));
  ok(sel.some(Boolean), 'picker marks 표지 already in the deck as 선택됨');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
});
await run('seed', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }, async (page) => {
  // a proposal with no 표지 (용산 AI Ready 오피스 — 작성 초기, 표지는 아직) keeps its order and opens where it was
  const E1 = JSON.parse(fs.readFileSync(path.resolve(here, '../src/seeds_parts.json'), 'utf8')).p_seed_eoffice.filter((s) => !s.deck)[0].name;
  await page.locator('.sb-item:has-text("용산")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(600);
  ok((await page.locator('.col >> nth=0').locator('.node-name').innerText()) === E1, 'seed without 표지: bubbles unchanged (' + E1 + ')');
  await page.click('.lay-toggle'); await page.waitForSelector('.viewer .vslide'); await page.waitForTimeout(300);
  ok((await page.locator('.vgroup >> nth=0').locator('.gl').innerText()) !== '표지', 'no 표지 group when the deck has none');
  await shot(page, '04-dark-seed');
});
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page) => {
  await startScenario(page);
  ok(!(await page.$$eval('.lcard .nm', (es) => es.some((e) => /^표지 [A-E]/.test(e.textContent)))), 'mobile: no 표지 card');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile: no horizontal overflow');
  await shot(page, '05-mobile');
});
console.log(errs.length ? errs : 'all good'); await browser.close(); srv.close();
