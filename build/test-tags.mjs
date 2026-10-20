// Tagged 제품 · 솔루션 · 유관사례 always show a thumbnail + metadata: requirements (자유형식 @태그 · 태그 카드 · 키맨 줄 태그),
// @ 검색 메뉴, 고객 요구사항 팝업(버블 오른쪽), Storyboard 매칭 버블 · 매칭 팝업, 레이아웃 상세 참고 자료, 레이아웃 추가 미리보기, Best Scenario, 템플릿, 검토 프로필 · 다크 · 모바일
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const PORT = 9071 + Math.floor(Math.random() * 200);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } const ct = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
async function run(name, opts, fn) { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); await page.goto('http://localhost:' + PORT + '/'); await page.waitForSelector('.home', { timeout: 30000 }); await fn(page); await ctx.close(); }
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'tag-' + n + '.png') }));
const noPeek = async (page) => { await page.mouse.move(1, 1); await page.waitForTimeout(450); if (await page.$('.dpk')) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };
const coffee = async (page) => { await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.topbar'); await page.waitForTimeout(700); };
const toReq = async (page) => { await page.click('.start-node .node'); await page.waitForSelector('.rq-pop'); await page.mouse.move(5, 5); await page.waitForTimeout(300); };

await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await coffee(page);
  // ---- Storyboard 매칭 버블: every tile has name + metadata
  const caps = await page.$$eval('.match-card .mpc', (e) => e.map((x) => [x.querySelector('.mcap b').textContent, x.querySelector('.mcap span').textContent]));
  ok(caps.length === 6 && caps.every(([a, b]) => a && b), 'bubble tiles show name + metadata: ' + caps.map((c) => c.join(' / ')).join(' | '));
  ok((await page.$$('.match-card .mpc .thumb')).length === 6, 'bubble tiles keep their thumbnails');
  ok(!!(await page.$('.mpc-more')), 'bubble shows +N when more are linked');
  await shot(page, '01-bubble');
  // ---- 고객 요구사항: 버블을 누르면 오른쪽에 팝업 (별도 화면 · 읽기 전용 요구서 없음)
  await page.click('.start-node .node'); await page.waitForSelector('.rq-pop'); await page.waitForTimeout(300);
  const pb = await page.$eval('.rq-pop', (e) => e.getBoundingClientRect().left); const nb = await page.$eval('.start-node .node', (e) => e.getBoundingClientRect().right);
  ok(pb > nb, 'popup opens to the right of the bubble (' + Math.round(nb) + ' → ' + Math.round(pb) + ')');
  ok(!(await page.$('.req')) && !(await page.$('.rqv-body')), 'no separate requirements screen or read-only view');
  await shot(page, '02-reqpop');
  await page.click('[role=tab]:has-text("자유형식")'); await page.waitForTimeout(250);
  const edChips = await page.$$eval('#free-ed .mention.has-th', (e) => e.map((x) => !!x.querySelector('.thumb')));
  ok(edChips.length === 4 && edChips.every(Boolean), 'editor @tags have thumbnails');
  ok((await page.$$('.req-tags .tagc')).length === 4, 'tag cards under the editor: 4');
  ok((await page.$$('.req-tags .tg-st.on')).length === 4, 'all four show 연결');
  // @ menu with thumbnails + metadata
  await page.click('#free-ed'); await page.keyboard.press('End'); await page.keyboard.press('Control+End');
  await page.keyboard.type(' 로비에는 @QM6', { delay: 20 }); await page.waitForSelector('.mmenu .mopt');
  const mo = await page.$$eval('.mmenu .mopt', (e) => e.map((x) => ({ th: !!x.querySelector('.mo-th .thumb'), l: x.querySelector('.l').textContent, s: x.querySelector('.s').textContent })));
  ok(mo.length >= 1 && mo.every((o) => o.th && o.s), '@ menu options show thumbnail + metadata: ' + mo.map((o) => o.l + ' · ' + o.s).join(' | '));
  await shot(page, '05-menu');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok((await page.$$('.req-tags .tagc')).length === 5, 'picking adds a tag card (5)');
  const last = await page.$eval('.req-tags .tagc:last-child .tg-name', (e) => e.textContent); ok(/QM65C/.test(last), 'new card: ' + last);
  await page.hover('#free-ed .mention.has-th >> nth=0'); await page.waitForSelector('.dpk', { timeout: 3000 }); ok(true, 'hover on an editor @tag opens the detail');
  await page.mouse.move(5, 5); await page.waitForTimeout(400);
  await shot(page, '06-req-free');
  // 저장 → matching popup beside its bubble; unlink there → back in the requirements the card says 연결 안 됨 with a 연결 button
  await page.click('.rq-f .btn:has-text("저장")'); await page.waitForSelector('.mt-pop .cc-top');
  await page.hover('.mt-pop .cc-sec.product .cc-card >> nth=0'); await page.click('.mt-pop .cc-sec.product .cc-card >> nth=0 >> .cc-rm'); await page.waitForTimeout(200);
  await noPeek(page); await page.click('.mt-x'); await page.waitForTimeout(300);
  await toReq(page); await page.click('[role=tab]:has-text("자유형식")'); await page.waitForTimeout(250);
  ok((await page.$$('.req-tags .tagc.off')).length === 1, 'unlinked tag is marked');
  await shot(page, '07-unlinked');
  await page.click('.req-tags .tagc.off .tg-link'); await page.waitForTimeout(250);
  ok((await page.$$('.req-tags .tagc.off')).length === 0, '연결 relinks it');
  // 입력 폼: tag in a keyman line → small cards under that line
  await page.click('[role=tab]:has-text("입력 폼")'); await page.waitForTimeout(250);
  const line = page.locator('.km-req .me-area').first(); await line.click(); await page.keyboard.press('End');
  await page.keyboard.type(' @magic', { delay: 20 }); await page.waitForSelector('.mmenu .mopt'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const sm = await page.$$eval('.km-tags .tagc.sm', (e) => e.map((x) => x.querySelector('.tg-name').textContent + ' / ' + x.querySelector('.tg-line').textContent));
  ok(sm.length === 1 && /MagicINFO/.test(sm[0]), 'keyman line tag card: ' + sm.join(', '));
  ok(!!(await page.$('.km-req .mention.has-th .thumb')), 'keyman line @tag has a thumbnail');
  await page.locator('.km-tags').first().scrollIntoViewIfNeeded(); await shot(page, '08-req-form');
  // ---- 매칭 팝업: linked items are image tiles (사진 + 이름 + 한 줄), no metadata rows — those are in the detail
  await page.click('.rq-f .btn-primary'); await page.waitForSelector('.mt-pop .cc-card'); await page.waitForTimeout(300);
  ok(!(await page.$('.rq-pop')), '저장 in the requirements popup closes it and opens the matching popup');
  const tf = await page.$$eval('.mt-pop .cc-sec.product .cc-card', (e) => e.map((x) => !!x.querySelector('.thumb') && !!x.querySelector('.cc-name') && !!x.querySelector('.cc-tag') && !x.querySelector('.cc-meta, dl')));
  ok(tf.length >= 4 && tf.every(Boolean), 'linked cards are image tiles: thumbnail + name + one tag line, no metadata rows: ' + tf.length);
  await noPeek(page); await shot(page, '09-ctx');
  await page.click('.mt-f .btn-primary'); await page.waitForTimeout(300);
  ok(!(await page.$('.mt-pop')), '저장 in the matching popup closes it');
  // ---- layout detail 참고 자료: products / cases with thumbnails
  await page.click('.lcard >> nth=0'); await page.waitForSelector('.evp-head'); await page.waitForTimeout(600);
  const nCs = await page.$$eval('.csrc', (e) => e.map((x) => !!x.querySelector('.thumb'))); ok(nCs.length >= 1 && nCs.every(Boolean), 'case / solution sources have thumbnails: ' + nCs.length);
  ok(!!(await page.$('.km-head .thumb.km-th')), 'product key messages use a bigger thumbnail');
  await page.click('.ic-toggle'); await page.waitForTimeout(250);
  const pc = await page.$$eval('.prodpick .tagchip', (e) => e.map((x) => !!x.querySelector('.thumb'))); ok(pc.length === 0 || pc.every(Boolean), 'AI fill product picks are thumbnail chips: ' + pc.length);
  await shot(page, '10-detail');
  await page.mouse.move(5, 5); await page.click('.modal .mhead .x'); await page.waitForTimeout(300);
  // a product layout: select a card → catalog evidence rows carry a thumbnail + metadata line
  await page.locator('.col:has(.node-name:has-text("공간별 제품")) .lcard').first().click(); await page.waitForSelector('.detail .slide-units [data-unit]'); await page.waitForTimeout(500);
  const units = await page.$$eval('.detail .slide-units [data-unit]', (e) => e.map((x) => x.getAttribute('data-unit')));
  let evTh = 0;
  for (const u of units.filter((x) => x.startsWith('t')).slice(0, 8)) {
    await page.click('.detail [data-unit="' + u + '"]', { position: { x: 6, y: 6 } }); await page.waitForTimeout(250);
    evTh = (await page.$$('.evpanel .evrow .ev-th .thumb')).length; if (evTh) break;
  }
  ok(evTh >= 1, 'evidence rows for 제품 · 솔루션 · 사례 show thumbnails: ' + evTh);
  if (evTh) { await page.locator('.evpanel .evrow:has(.ev-th)').first().scrollIntoViewIfNeeded(); await shot(page, '10b-evidence'); }
  await page.mouse.move(5, 5); await page.click('.modal .mhead .x'); await page.waitForTimeout(300);
  // ---- layout picker preview: 예시 제품 / 관련 솔루션 as chips
  await page.click('.col .btn-primary:has-text("PPT 레이아웃 추가") >> nth=0'); await page.waitForSelector('.pcard'); await page.waitForTimeout(500);
  let found = false;
  for (let i = 0; i < 10 && !found; i++) { const c = page.locator('.pcard').nth(i); if (!(await c.count())) break; await c.hover(); await page.waitForTimeout(700); if (await page.$('.pk-peek .tagchip')) found = true; else { await page.mouse.move(5, 5); await page.waitForTimeout(200); } }
  ok(found, 'layout preview shows 예시 제품 / 관련 솔루션 as thumbnail chips');
  if (found) await shot(page, '11-pickpeek');
});

await run('pages', { viewport: { width: 1440, height: 900 } }, async (page) => {
  // Best Scenario 상세 보기 → 제품 · 솔루션 매칭 버블(보기 전용) → linked products / solutions / cases as tag cards
  await page.click('.sb-bs'); await page.waitForSelector('.bsl'); await page.waitForTimeout(800);
  await page.click('.bsl:has-text("F&B 프랜차이즈") .bsl-more'); await page.waitForSelector('.modal.sbv .col', { timeout: 15000 }); await page.waitForTimeout(500);
  await page.click('.modal.sbv .match-node .node'); await page.waitForSelector('.mt-pop.ro'); await page.waitForTimeout(500);
  const bc = await page.$$eval('.mt-pop.ro .tagc', (e) => e.map((x) => !!x.querySelector('.thumb') && x.innerText.trim().length > 0));
  ok(bc.length >= 2 && bc.every(Boolean), 'scenario links are thumbnail cards with metadata: ' + bc.length);
  await shot(page, '12-scenario');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // 템플릿: solution tag thumbnail
  await page.click('.sb-tpl'); await page.waitForSelector('.tl-card'); await page.waitForTimeout(600);
  await page.fill('#tl-q', 'MagicINFO 소개'); await page.waitForTimeout(700);
  ok((await page.$$('.tl-sol .thumb')).length >= 1, 'template cards: solution tag has a thumbnail: ' + (await page.$$('.tl-sol .thumb')).length);
  await page.locator('.tl-sol').first().scrollIntoViewIfNeeded(); await shot(page, '12b-library');
  // 제안서 검토 프로필
  await page.click('.sb-rv'); await page.waitForSelector('.rvh-list'); await page.click('.rvh-card >> nth=0'); await page.waitForSelector('.rv-report'); await page.waitForTimeout(400);
  const rp = await page.$$eval('.rv-prof .tagchip', (e) => e.length); ok(rp >= 1, 'review profile products are thumbnail chips: ' + rp);
  await page.locator('.rv-prof').scrollIntoViewIfNeeded(); await shot(page, '13-review');
});

await run('dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, async (page) => {
  await coffee(page); await shot(page, '14-dark-bubble');
  await page.click('.start-node .node'); await page.waitForSelector('.rq-pop'); await page.mouse.move(5, 5); await page.click('[role=tab]:has-text("자유형식")'); await page.waitForTimeout(300); await shot(page, '15-dark-reqpop');
  await page.locator('.req-tags').scrollIntoViewIfNeeded(); await shot(page, '16-dark-req');
});

await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (page) => {
  await page.click('.mob-top .btn'); await page.waitForTimeout(300); await coffee(page);
  await page.click('.start-node .node'); await page.waitForSelector('.rq-pop.sheet'); await page.waitForTimeout(300);
  const ow = await page.evaluate(() => { const b = document.querySelector('.rq-body'); return b.scrollWidth - b.clientWidth; }); ok(ow <= 1, 'mobile: requirements popup has no horizontal scroll (' + ow + ')');
  await page.mouse.move(5, 5); await page.click('[role=tab]:has-text("자유형식")'); await page.waitForTimeout(300);
  const ow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); ok(ow2 <= 1, 'mobile: requirements screen has no horizontal scroll (' + ow2 + ')');
  await page.locator('.req-tags').scrollIntoViewIfNeeded(); await noPeek(page); await shot(page, '18-mobile-req');
  await noPeek(page); await page.click('[role=tab]:has-text("입력 폼")'); await page.waitForTimeout(300);
  await page.locator('.km-req .me-area').first().click(); await page.keyboard.press('End'); await page.keyboard.type(' @360', { delay: 30 }); await page.waitForSelector('.mmenu .mopt'); await shot(page, '19-mobile-menu');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300); await noPeek(page); await page.locator('.km-tags').first().scrollIntoViewIfNeeded(); await noPeek(page); await shot(page, '20-mobile-form');
});

await browser.close(); srv.close();
if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
console.log('all ok');
