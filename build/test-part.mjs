// Part popup: + opens it directly; name box → full list (empty) or keyword matches (typing); single content box with AI 제안 (loading → popup → 승인 appends); no 작성 중으로 저장
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8806);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const AI_MOCK = () => { window.claude = { use: async (n) => (n === 'sample' ? { json: async () => { await new Promise((r) => setTimeout(r, 900)); return { items: ['메뉴 교체 리드타임 9일 → 1일', '매장별 가격 표기 오류 0건', '본사 일괄 송출로 운영 인력 절감'] }; }, limits: async () => ({}) } : null) }; };
const openSeed = (page, t) => page.locator('.sb-item:has-text("' + t + '")').first().evaluate((e) => e.click());
async function run(name, opts, fn) { const ctx = await browser.newContext(opts); await ctx.addInitScript(AI_MOCK); const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); await page.goto('http://localhost:8806/'); await page.waitForSelector('.home'); await fn(page); await ctx.close(); }
const shot = (page, n) => page.waitForTimeout(300).then(() => page.screenshot({ path: path.join(shots, 'part-' + n + '.png') }));
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await openSeed(page, '커피'); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  const n0 = await page.$$eval('.col .node-name', (e) => e.length);
  await page.click('.end-plus'); await page.waitForSelector('#pe-name');
  ok(!(await page.$('.pop')) && !(await page.$('.cand-card')), 'no candidate popover — new part popup opens directly');
  ok(!(await page.$('.pe-rec')) && !(await page.$('.pe-all-btn')) && !(await page.$('.pe-types-h')), 'no 기존 파트에서 고르기 area');
  ok(!(await page.$('.pe-sugs')), 'list stays closed until the name box is clicked');
  ok(!(await page.$('.mfoot .btn:has-text("작성 중으로 저장")')), 'no 작성 중으로 저장 button');
  const META = /첫 파트로 많이|레이아웃 \d+장|다음 흐름/;
  ok(!(await page.$('.seg')), 'no 항목별 / 자유 양식 option');
  // empty name + click → every existing part, flow picks first, grouped
  await page.click('#pe-name'); await page.waitForSelector('.pe-sugs.all');
  const nAll = (await page.$$('.pe-sugs.all .pe-sug')).length; ok(nAll >= 23, 'empty name → every part type: ' + nAll);
  ok(!(await page.$$eval('.pe-sugs.all .pe-sug', (es) => es.some((e) => /표지/.test(e.textContent)))), 'no 표지 · 목차 part type (표지 lives only in the PPT 레이아웃 panel)');
  const hs = await page.$$eval('.pe-sugs.all .pe-sg', (e) => e.map((x) => x.textContent)); ok(hs.length >= 5 && /이어지기 좋은|첫 파트/.test(hs[0]), 'groups, flow picks first: ' + hs.join(' / '));
  const ad = await page.$$eval('.pe-sugs.all .pe-sug .sd', (e) => e.map((x) => x.textContent)); ok(ad.length === nAll && ad.every((d) => d.length >= 25 && !META.test(d)), 'every part shows what it is for');
  const uniq = new Set(await page.$$eval('.pe-sugs.all .pe-sug b', (e) => e.map((x) => x.textContent))); ok(uniq.size === nAll, 'no duplicates in the full list');
  await shot(page, '01-all');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const first2 = (await page.inputValue('#pe-name')); ok(!!first2 && !(await page.$('.pe-sugs')), 'arrow + Enter picks from the list: ' + first2);
  // typing → keyword matches (same list UI)
  await page.fill('#pe-name', ''); await page.keyboard.type('비용', { delay: 30 }); await page.waitForTimeout(200);
  ok(!(await page.$('.pe-sugs.all')) && !!(await page.$('.pe-sugs')), 'typing switches to keyword matches');
  const sg = await page.$$eval('.pe-sug b', (e) => e.map((x) => x.textContent)); ok(sg.length > 0 && sg.length <= 8 && sg.some((x) => x.includes('비용')), 'name suggestions: ' + sg.join(', '));
  const sd = await page.$$eval('.pe-sug', (e) => e.map((x) => ({ d: (x.querySelector('.sd') || {}).textContent || '', st: x.querySelector('.st').textContent })));
  ok(sd[0].d.length >= 25 && !META.test(sd[0].d), 'suggestion shows what the part is for: ' + sg[0] + ' — ' + sd[0].d);
  ok(sd.every((x) => x.st), 'each suggestion names its part: ' + sd.map((x) => x.st).join(', '));
  await shot(page, '02-typing');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(!!(await page.$('#pe-name')) && !(await page.$('.pe-sugs')), 'Escape closes the list only');
  await page.fill('#pe-name', ''); await page.click('#pe-name'); await page.waitForSelector('.pe-sugs.all');
  await page.click('.pe-sugs.all .pe-sug >> nth=1'); await page.waitForTimeout(150);
  const nm = await page.inputValue('#pe-name'); ok(!!nm && !(await page.$('.pe-sugs')), 'clicking a part in the list fills the name: ' + nm);
  // AI 제안: inside the content box, top-right → spinner → popup → 승인 appends
  const bb = await page.$eval('.pe-ai', (e) => { const a = e.getBoundingClientRect(), t = document.getElementById('pe-text').getBoundingClientRect(); return { inTop: a.top - t.top, inRight: t.right - a.right, label: e.textContent }; });
  ok(bb.inTop >= 0 && bb.inTop < 16 && bb.inRight >= 0 && bb.inRight < 24 && bb.label.includes('AI 제안'), 'AI 제안 sits in the content box top-right: ' + JSON.stringify(bb));
  await page.fill('#pe-text', '기존 내용 한 줄');
  await page.click('.pe-ai'); await page.waitForTimeout(150);
  ok(!!(await page.$('.pe-ai .spin')) && (await page.$eval('.pe-ai', (e) => e.textContent)).includes('제안 중'), 'loading spinner while AI works');
  await shot(page, '03-loading');
  await page.waitForSelector('.pe-prop'); const pl = (await page.$$('.pe-prop li')).length; ok(pl === 3, 'popup shows the suggestion: ' + pl);
  ok((await page.inputValue('#pe-text')) === '기존 내용 한 줄', 'nothing added before 승인');
  await shot(page, '04-popup');
  await page.click('.modal.narrow .btn-primary'); await page.waitForTimeout(250);
  const tx = (await page.inputValue('#pe-text')).split('\n'); ok(!(await page.$('.pe-prop')) && tx[0] === '기존 내용 한 줄' && tx.length === 4, '승인 appends after the current content: ' + tx.join(' | '));
  // Escape on the AI popup closes only that popup
  await page.click('.pe-ai'); await page.waitForTimeout(1200);
  ok(!(await page.$('.pe-prop')), 'nothing new to suggest → no popup (all already there)');
  await page.fill('#pe-text', '다른 내용'); await page.click('.pe-ai'); await page.waitForSelector('.pe-prop');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(!(await page.$('.pe-prop')) && !!(await page.$('#pe-name')) && (await page.inputValue('#pe-text')) === '다른 내용', 'Escape / 닫기 drops the suggestion, popup stays');
  await page.fill('#pe-text', '메뉴 교체 리드타임 9일 → 1일\n매장별 가격 표기 오류 0건');

  await page.click('.mfoot .btn-primary'); await page.waitForTimeout(400);
  const names = await page.$$eval('.col .node-name', (e) => e.map((x) => x.textContent)); ok(names.length === n0 + 1 && names[names.length - 1] === nm, 'part saved at the end: ' + names.slice(-2).join(' / '));
  const pr = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /prop|winmate/i.test(k)) || '{}') || '{}'); return typeof s; });
  // insert between parts via the connector + and close without content: the empty part is dropped
  await page.click('.conn-plus >> nth=0'); await page.waitForSelector('#pe-name');
  await page.click('.mhead .x'); await page.waitForTimeout(300);
  ok((await page.$$eval('.col .node-name', (e) => e.length)) === n0 + 1, 'empty new part is dropped on close');
  await page.evaluate(() => { const c = document.querySelector('.canvas'); c.scrollLeft = c.scrollWidth; }); await shot(page, '02-end');
  ok(!!(await page.$('.end-ai')), 'AI로 나머지 구성 still reachable under 다음 파트');
  // edit an existing list part: items appear as lines
  await page.click('.col .node >> nth=0'); await page.waitForSelector('#pe-text');
  const lines = (await page.inputValue('#pe-text')).split('\n').filter(Boolean).length; ok(lines >= 2, 'existing items load as lines (' + lines + ')');
  await page.click('.mhead .x');
  // first-part candidates on a fresh proposal: what each part is for, no flow / layout-count text
  await page.click('.sb-new'); await page.waitForSelector('.rq-pop'); await page.click('.rq-f .btn-primary'); await page.waitForSelector('.mt-pop'); await page.click('.mt-f .btn-primary'); await page.waitForSelector('.end-node .cand-card');
  const cd = await page.$$eval('.end-node .cand:not(.cand-direct)', (e) => e.map((x) => ({ n: x.querySelector('b').textContent, d: x.querySelector('.cand-d').textContent })));
  ok(cd.length >= 4 && cd.every((c) => c.d.length >= 25 && !META.test(c.d)), '첫 번째 파트 후보 describe the part (no 첫 파트로 많이 써요 · 레이아웃 N장): ' + cd.map((c) => c.n).join(', '));
  await shot(page, '01b-first-part');
});
await run('dark', { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' }, async (page) => {
  await openSeed(page, '용산'); await page.waitForSelector('.canvas'); await page.waitForTimeout(400);
  await page.click('.end-plus'); await page.waitForSelector('#pe-name'); await page.keyboard.type('사례', { delay: 30 }); await page.waitForTimeout(200); await shot(page, '03-dark');
  await page.keyboard.press('Escape'); await page.fill('#pe-name', ''); await page.click('#pe-name'); await shot(page, '04-dark-all');
  await page.keyboard.press('Escape'); await page.click('.pe-ai'); await page.waitForSelector('.pe-prop'); await shot(page, '04b-dark-ai');
});
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page) => {
  await page.click('.hcard:has-text("A 커피")').catch(() => {}); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.evaluate(() => { const c = document.querySelector('.canvas'); c.scrollLeft = c.scrollWidth; }); await page.click('.end-plus'); await page.waitForSelector('#pe-name'); await shot(page, '05-mobile');
  await page.click('#pe-name'); await shot(page, '06-mobile-all');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile: no horizontal overflow');
});
console.log(errs.length ? errs : 'all good'); await browser.close(); srv.close();
