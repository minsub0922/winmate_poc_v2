// Requirements: no separate screen — a new proposal opens the Storyboard with only the 고객 요구사항 bubble and its popup open to the right;
// 저장 closes it, adds the 제품 · 솔루션 매칭 bubble and opens the matching popup beside it (industry pick-or-type, image cards, + card →
// directory explorer, 추천 card → all recommendations); 저장 there starts the parts (첫 번째 파트). Bubble clicks toggle their popups.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8809);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
async function run(name, opts, fn) { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); await page.goto('http://localhost:8809/'); await page.waitForSelector('.home'); await fn(page); await ctx.close(); }
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'req-' + n + '.png') }));
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await page.click('.sb-new'); await page.waitForSelector('.rq-pop'); await page.waitForTimeout(400);
  ok(!(await page.$('.stepper')), 'no 고객 요구사항 — Storyboard stepper');
  ok(!(await page.$('.req')) && !!(await page.$('.canvas')), 'new proposal opens on the Storyboard, no separate requirements screen');
  ok((await page.$$('.start-node')).length === 1 && !(await page.$('.match-node')) && !(await page.$('.end-node')) && !(await page.$('.col')), 'only the 고객 요구사항 bubble on the canvas');
  const g = await page.evaluate(() => { const n = document.querySelector('.start-node .node').getBoundingClientRect(); const q = document.querySelector('.rq-pop').getBoundingClientRect(); return { nr: n.right, ql: q.left, nc: n.top + n.height / 2, qt: q.top, qb: q.bottom, arrow: document.querySelector('.rq-pop').classList.contains('arrow') }; });
  ok(g.ql > g.nr && g.ql - g.nr < 40 && g.nc > g.qt && g.nc < g.qb && g.arrow, 'popup sits right of the bubble with its arrow at the bubble: ' + JSON.stringify(g));
  ok((await page.$eval('.start-node .node', (e) => e.getAttribute('aria-expanded'))) === 'true', 'bubble shows it is open');
  await page.click('#free-ed'); await page.keyboard.type('전국 320개 카페 매장 메뉴판을 디지털 메뉴보드로 바꾸고 본사에서 한 번에 관리하고 싶다. 드라이브스루 매장도 있다.', { delay: 5 });
  await page.waitForTimeout(300); await shot(page, '01-screen');
  ok((await page.$$eval('.rq-f button', (e) => e.map((x) => x.textContent.trim()))).join() === '저장', 'requirements popup has only 저장 (no 제품 · 솔루션 매칭으로)');
  await page.click('.rq-f .btn-primary'); await page.waitForSelector('.mt-pop .cc-top'); await page.waitForTimeout(300);
  ok(!(await page.$('.rq-pop')) && !(await page.$('.mback')), '저장 closes the requirements popup at once — no modal');
  ok(!!(await page.$('.match-node')) && !(await page.$('.end-node')), '저장 adds the 제품 · 솔루션 매칭 bubble (parts not yet)');
  const gm = await page.evaluate(() => { const n = document.querySelector('.match-node .node').getBoundingClientRect(); const nm = document.querySelector('.match-node .node-name').getBoundingClientRect(); const q = document.querySelector('.mt-pop').getBoundingClientRect(); return { nr: Math.max(n.right, nm.right), ql: q.left, nc: n.top + n.height / 2, qt: q.top, qb: q.bottom, arrow: document.querySelector('.mt-pop').classList.contains('arrow') }; });
  ok(gm.ql > gm.nr && gm.ql - gm.nr < 40 && gm.nc > gm.qt && gm.nc < gm.qb && gm.arrow, 'matching popup sits right of its bubble: ' + JSON.stringify(gm));
  ok((await page.$eval('.match-node .node', (e) => e.getAttribute('aria-expanded'))) === 'true', 'matching bubble shows it is open');
  await shot(page, '02-popup');
  // industry: pick from list
  await page.click('#cc-ind-in'); await page.fill('#cc-ind-in', '카페'); await page.waitForTimeout(200);
  const opts = await page.$$eval('.cc-list button', (e) => e.map((x) => x.textContent)); ok(opts.length >= 1, 'industry options filter: ' + opts.slice(0, 3).join(' / '));
  await page.click('.cc-list button >> nth=0'); await page.waitForTimeout(250);
  ok((await page.inputValue('#cc-ind-in')).includes('카페'), 'industry picked: ' + await page.inputValue('#cc-ind-in'));
  ok(!(await page.$('.cc-find')) && !(await page.$('.cc-top .addref')), 'no 제품 · 솔루션 · 유관사례 search box');
  ok(!(await page.$('.cc-empty')), 'no “nothing linked” area');
  for (const k of ['product', 'solution', 'case']) ok(!!(await page.$('.cc-sec.' + k + ' .cc-addcard')) && !!(await page.$('.cc-sec.' + k + ' .cc-addcard + .cc-reccard')), k + ': + card with the recommendation card to its right');
  const nPics = (await page.$$('.cc-sec.product .cc-reccard .cc-rc-pic .thumb')).length; ok(nPics >= 3, 'recommendation card shows thumbnails: ' + nPics);
  // recommendation card → all recommendations, big images
  await page.click('.cc-sec.product .cc-reccard'); await page.waitForSelector('.mt-ex .ex-tiles');
  ok(!(await page.$('.mback')) && !!(await page.$('.mt-ex.arrow .bp-back')), '추천 opens inside the matching popup beside the bubble (no modal), with ← back');
  ok((await page.$eval('.mt-ex .bp-t h2', (e) => e.textContent)) === '추천 제품', 'popup title: 추천 제품');
  const nTiles = (await page.$$('.ex-tile')).length; ok(nTiles >= 10, 'all product recommendations: ' + nTiles);
  const tw = await page.$eval('.ex-tile .thumb', (e) => e.getBoundingClientRect().width); ok(tw >= 150, 'recommendation images are large: ' + Math.round(tw) + 'px');
  ok((await page.$eval('.ex-nd.on', (e) => e.textContent)).includes('추천'), 'opens on the 추천 folder');
  await shot(page, '03-rec');
  const first = await page.$eval('.ex-tile >> nth=0', (e) => e.querySelector('b').textContent);
  await page.click('.ex-tile >> nth=0'); await page.click('.ex-tile >> nth=1'); await page.waitForTimeout(150);
  ok((await page.$$('.ex-pick')).length === 2, 'two picked in the tray');
  await page.click('.ex-tile >> nth=1'); ok((await page.$$('.ex-pick')).length === 1, 'click again unpicks');
  await page.click('.mt-ex .bp-f .btn-primary'); await page.waitForTimeout(300);
  ok(!(await page.$('.mt-ex')) && !!(await page.$('.mt-pop .cc-top')), 'after 연결 the popup is back on 매칭');
  const linked = await page.$$eval('.cc-sec.product .cc-card .cc-name', (e) => e.map((x) => x.textContent)); ok(linked.length === 1 && linked[0] === first, 'linked: ' + linked.join(','));
  // + card → directory explorer (products)
  await page.click('.cc-sec.product .cc-addcard'); await page.waitForSelector('.mt-ex .ex-nav');
  ok((await page.$eval('.mt-ex .bp-t h2', (e) => e.textContent)) === '제품 추가', 'popup title: 제품 추가');
  const fams = await page.$$eval('.ex-nav .ex-nd', (e) => e.map((x) => x.querySelector('.ex-nl').textContent)); ok(fams.includes('디스플레이') && fams.includes('공조 · 에어컨'), 'folder tree: ' + fams.slice(0, 6).join(' / '));
  ok((await page.$$('.ex-row.products')).length >= 30, 'all products listed: ' + (await page.$$('.ex-row.products')).length);
  ok((await page.$$('.ex-row.products.dis')).length === 1, 'the linked product shows 연결됨');
  await page.click('.ex-nd:has-text("디스플레이")'); await page.waitForTimeout(150);
  await page.click('.ex-nd:has-text("LCD 사이니지")'); await page.waitForTimeout(150);
  const crumb = await page.$eval('.ex-crumb nav', (e) => e.textContent); ok(crumb.includes('디스플레이') && crumb.includes('LCD 사이니지'), 'breadcrumb: ' + crumb);
  await shot(page, '04-explorer');
  const lcd = (await page.$$('.ex-row.products')).length;
  await page.fill('#ex-q-in', '키오스크'); await page.waitForTimeout(150);
  ok((await page.$$('.ex-row.products')).length >= 1 && (await page.$$('.ex-row.products')).length < lcd + 5, 'search inside the explorer: ' + (await page.$$('.ex-row.products')).length);
  await page.click('.ex-row.products:not(.dis) >> nth=0'); await page.click('.mt-ex .bp-f .btn-primary'); await page.waitForTimeout(250);
  ok((await page.$$('.cc-sec.product .cc-card')).length === 2, 'explorer pick linked');
  // solutions + cases explorers
  await page.click('.cc-sec.solution .cc-addcard'); await page.waitForSelector('.ex-row.solutions');
  ok((await page.$$('.ex-row.solutions')).length >= 15, 'all solutions: ' + (await page.$$('.ex-row.solutions')).length); await shot(page, '05-solutions');
  await page.click('.ex-row.solutions >> nth=0'); await page.click('.mt-ex .bp-f .btn-primary'); await page.waitForTimeout(200);
  await page.click('.cc-sec.case .cc-addcard'); await page.waitForSelector('.ex-row.ex-case');
  ok((await page.$eval('.ex-nd.on', (e) => e.textContent)).includes('외식'), 'cases open on the proposal industry: ' + await page.$eval('.ex-nd.on', (e) => e.textContent));
  await shot(page, '06-cases');
  await page.click('.ex-row.ex-case .ex-hit >> nth=0'); await page.click('.mt-ex .bp-f .btn-primary'); await page.waitForTimeout(200);
  await page.click('.cc-sec.case .cc-reccard'); await page.waitForSelector('.ex-tiles'); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!(await page.$('.mt-ex')) && !!(await page.$('.mt-pop .cc-top')), 'Escape in the explorer goes back to 매칭');
  await page.mouse.move(5, 5); await shot(page, '07-linked');
  // custom industry
  await page.fill('#cc-ind-in', '반려동물 용품 매장'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  ok((await page.$eval('.cc-note', (e) => e.textContent)).includes('직접 입력'), 'typed industry kept: ' + await page.$eval('.cc-note', (e) => e.textContent));
  await page.click('.mt-f .btn-primary'); await page.waitForTimeout(400);
  ok(!(await page.$('.mt-pop')) && !!(await page.$('.end-node .cand-card')), '저장 in the matching popup closes it and starts the parts (첫 번째 파트 + candidates)');
  await shot(page, '07b-story');
  // matching bubble toggles its popup; a row opens it at that kind
  await page.click('.match-node .node'); await page.waitForSelector('.mt-pop'); await page.click('.match-node .node'); await page.waitForTimeout(200);
  ok(!(await page.$('.mt-pop')), 'matching bubble toggles its popup');
  await page.click('[data-ctx="cases"]'); await page.waitForSelector('.mt-pop'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => { const b = document.querySelector('.mt-body'); const h = document.querySelector('#cc-h-cases').getBoundingClientRect(); const r = b.getBoundingClientRect(); return h.top >= r.top - 2 && h.bottom <= r.bottom && (b.scrollTop > 0 || b.scrollHeight <= b.clientHeight); }), 'a row of the bubble opens the popup at that kind');
  // reopen requirements from the summary card → 저장됨, only one popup at a time, Esc closes it
  await page.click('.start-card'); await page.waitForSelector('.rq-pop');
  ok(!(await page.$('.mt-pop')), 'one bubble popup at a time');
  ok((await page.$eval('.req-saved', (e) => e.textContent)).includes('저장됨'), 'shows 저장됨');
  await page.focus('.rq-pop .tab >> nth=0'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.$('.rq-pop')), 'Escape closes the popup');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('.start-node .node')), 'focus returns to the bubble');
  await page.click('.start-node .node'); await page.waitForSelector('.rq-pop'); await page.click('.rq-x'); await page.waitForTimeout(200);
  ok(!(await page.$('.rq-pop')), '× closes the popup');
  // change something → 저장 → requirements popup closes, matching popup opens → 저장 closes it (parts stay)
  await page.click('.start-node .node'); await page.waitForSelector('.rq-pop');
  await page.click('[role=tab]:has-text("자유형식")'); await page.click('#free-ed'); await page.keyboard.press('End'); await page.keyboard.type(' 키오스크도 검토.', { delay: 5 }); await page.waitForTimeout(200);
  ok(!(await page.$eval('.req-saved', (e) => e.textContent)).includes('저장됨'), 'edit marks it unsaved');
  await page.click('.rq-f .btn-primary:has-text("저장")'); await page.waitForSelector('.mt-pop');
  ok(!(await page.$('.rq-pop')), '저장 → requirements popup closes, matching popup opens');
  await page.click('.mt-f .btn-primary'); await page.waitForTimeout(300);
  ok(!(await page.$('.mt-pop')) && !(await page.$('.rq-pop')) && !!(await page.$('.end-node')), 'saved, both popups closed, parts unchanged');
  await page.click('.start-node .node'); await page.waitForSelector('.rq-pop');
  ok((await page.$eval('.req-saved', (e) => e.textContent)).includes('저장됨'), 'reopened: 저장됨');
  // a proposal still at the requirements stage opens the same way (bubble + popup)
  await page.click('.sb-item:has-text("흑백프린터")'); await page.waitForSelector('.rq-pop'); await page.waitForTimeout(300);
  ok(!(await page.$('.match-node')) && (await page.$$('.km')).length >= 1, 'RFP proposal at the requirements stage: bubble + popup with its form');
  await shot(page, '07c-rfp');
});
await run('dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }, async (page) => {
  await page.click('.sb-new'); await page.waitForSelector('.rq-pop'); await page.click('#free-ed'); await page.keyboard.type('호텔 객실 TV 교체와 로비 사이니지', { delay: 5 });
  await shot(page, '08a-dark-popup');
  await page.click('.rq-f .btn-primary'); await page.waitForSelector('.mt-pop .cc-top'); await page.mouse.move(5, 5); await shot(page, '08-dark');
  await page.click('.cc-sec.product .cc-reccard'); await page.waitForSelector('.ex-tiles'); await page.click('.ex-tile >> nth=0'); await shot(page, '09-dark-rec');
  await page.click('.ex-nd:has-text("전체 제품")'); await page.waitForTimeout(150); await shot(page, '10-dark-explorer');
});
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page) => {
  await page.click('.hcard >> nth=0');
  await page.waitForSelector('.rq-pop.sheet'); await shot(page, '11-mobile');
  ok(await page.evaluate(() => { const b = document.querySelector('.rq-body'); return b.scrollWidth <= b.clientWidth + 1; }), 'mobile: requirements sheet has no horizontal overflow');
  await page.click('.rq-f .btn-primary'); await page.waitForSelector('.mt-pop.sheet .cc-top'); await shot(page, '12-mobile-popup');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile: no horizontal overflow');
  await page.click('.cc-sec.product .cc-addcard'); await page.waitForSelector('.ex-row'); await shot(page, '13-mobile-explorer');
  ok(await page.evaluate(() => { const m = document.querySelector('.mt-ex .ex-list'); return m.scrollWidth <= m.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth; }), 'mobile explorer: no horizontal overflow');
  await page.click('.ex-nd.rec'); await page.waitForSelector('.ex-tiles'); await shot(page, '14-mobile-rec');
});
console.log(errs.length ? errs : 'all good'); await browser.close(); srv.close();
