// 제품 DB(samsung.com/business 전 제품 카드 + e-카탈로그 전용 제품)가 제품 탐색기에 다 뜨는지(카탈로그 전용 · 큐레이션의 실제 사진 포함):
// 전체 개수 · 제품군 폴더 · 사이트 분류 폴더 · 썸네일 묶음 사진 · 모델코드 검색(옵션 모델 포함) · hover 상세(모델 · 사양 · 특장점 · 카탈로그) ·
// 연결 → 매칭 카드 · 큐레이션 항목(QM43C)에 붙은 사이트 옵션 · 다크 · 모바일
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = process.env.WM_ROOT || path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const PDB = JSON.parse(fs.readFileSync(path.resolve(here, '../data/products_db.json'), 'utf8'));
const CAT = JSON.parse(fs.readFileSync(path.resolve(here, '../data/catalog.json'), 'utf8'));
const TOTAL = CAT.products.length + PDB.products.length;
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8799);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
async function run(name, opts, fn) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
  await page.goto('http://localhost:8799/'); await page.waitForSelector('.home');
  await fn(page); await ctx.close();
}
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, n + '.png') }));
async function openExplorer(page) {
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card');
  await page.click('.mt-pop .cc-sec.product .cc-addcard'); await page.waitForSelector('.mt-ex .ex-row');
  await page.mouse.move(4, 896); await page.waitForTimeout(250); await page.click('.mt-ex .ex-nd:has-text("전체 제품")'); await page.waitForTimeout(400);
}
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await openExplorer(page);
  const n = await page.$eval('.mt-ex .ex-nd:has-text("전체 제품") .ex-cnt', (e) => +e.textContent);
  ok(n === TOTAL, '전체 제품 ' + n + ' (= 큐레이션 ' + CAT.products.length + ' + 제품 DB ' + PDB.products.length + ')');
  const rows = await page.$$eval('.mt-ex .ex-list .ex-row.products', (e) => e.length);
  ok(rows === TOTAL, '전체 폴더에 행 ' + rows + '개가 다 그려짐');
  const fams = await page.$$eval('.mt-ex .ex-nav .ex-nd', (e) => e.map((x) => x.querySelector('.ex-nl').textContent + ' ' + x.querySelector('.ex-cnt').textContent));
  console.log('  폴더:', fams.slice(0, 12).join(' | '));
  for (const f of ['디스플레이', '공조 · 에어컨', '모바일 · PC', '프린팅', '주방 · 리빙 가전']) ok(fams.some((x) => x.startsWith(f + ' ')), '제품군 폴더 ' + f);
  // first rows get their photo from the packs
  await page.waitForFunction(() => document.querySelectorAll('.mt-ex .ex-row .thumb.cut img[src^="blob:"]').length >= 5, null, { timeout: 15000 }).catch(() => {});
  const pics = await page.$$eval('.mt-ex .ex-row .thumb img', (e) => e.filter((x) => x.complete && x.naturalWidth > 0).length);
  ok(pics >= 5, '화면의 행에 실제 제품 사진 ' + pics + '장');
  await shot(page, 'pdb-all');
  // open the display family → LCD signage folder
  await page.mouse.move(4, 896); await page.waitForTimeout(250); await page.click('.mt-ex .ex-nav .ex-nd:has-text("디스플레이")'); await page.waitForTimeout(250);
  const lcd = await page.$('.mt-ex .ex-nav .ex-nd:has-text("스마트 LCD 사이니지")');
  ok(!!lcd, '사이트 분류 폴더 · 스마트 LCD 사이니지');
  if (lcd) { await lcd.click(); await page.waitForTimeout(400); }
  const lcdRows = await page.$$eval('.mt-ex .ex-list .ex-row.products .ex-nm b', (e) => e.map((x) => x.textContent));
  ok(lcdRows.length >= 30, 'LCD 사이니지 ' + lcdRows.length + '개: ' + lcdRows.slice(0, 5).join(', '));
  await page.waitForTimeout(1200);
  await shot(page, 'pdb-lcd');
  // search an option model of a site card (not its default model)
  await page.fill('#ex-q-in', 'LH75QMCEBGCXKR'); await page.waitForTimeout(300);
  const hit = await page.$$eval('.mt-ex .ex-list .ex-row.products .ex-nm b', (e) => e.map((x) => x.textContent));
  ok(hit.length >= 1, '옵션 모델코드 검색 LH75QMCEBGCXKR → ' + hit.join(', '));
  await page.fill('#ex-q-in', '비즈니스TV'); await page.waitForTimeout(300);
  const hit2 = await page.$$eval('.mt-ex .ex-list .ex-row.products .ex-nm b', (e) => e.map((x) => x.textContent));
  ok(hit2.length >= 1, '사이트 제품명 검색 비즈니스TV → ' + hit2.join(', '));
  // hover → product DB detail
  await page.hover('.mt-ex .ex-list .ex-row.products >> nth=0'); await page.waitForSelector('.dpk .dpk-card', { timeout: 5000 });
  await page.waitForSelector('.dpk .dpk-spec', { timeout: 8000 }).catch(() => {});
  const det = await page.evaluate(() => ({ spec: document.querySelectorAll('.dpk .dpk-spec tr').length, feats: document.querySelectorAll('.dpk .dpk-feats li').length, models: document.querySelectorAll('.dpk .dpk-mdl').length, link: !!document.querySelector('.dpk .dpk-srcs a[href*="samsung.com"]'), gal: document.querySelectorAll('.dpk .dpk-main img').length }));
  ok(det.spec >= 5 && det.feats >= 1 && det.link, 'hover 상세: 사양 ' + det.spec + '행 · 특장점 ' + det.feats + ' · 모델 ' + det.models + ' · samsung.com 링크 · 사진 ' + det.gal);
  await shot(page, 'pdb-peek');
  await page.mouse.move(5, 5); await page.waitForTimeout(400);
  // link it
  await page.click('.mt-ex .ex-list .ex-row.products:not(.dis) >> nth=0'); await page.click('.mt-ex .bp-f .btn-primary'); await page.waitForTimeout(300);
  const cards = await page.$$eval('.mt-pop .cc-sec.product .cc-card .cc-name', (e) => e.map((x) => x.textContent));
  ok(cards.some((c) => /비즈니스TV/.test(c)), '연결한 사이트 제품이 매칭 카드에: ' + cards.join(', '));
  // catalog-only products, if any
  const nCat = PDB.products.filter((p) => p.src === 'catalog').length;
  if (nCat) {
    await page.click('.mt-pop .cc-sec.product .cc-addcard'); await page.waitForSelector('.mt-ex .ex-row');
    await page.mouse.move(4, 896); await page.waitForTimeout(250); await page.click('.mt-ex .ex-nd:has-text("전체 제품")'); await page.waitForTimeout(300);
    const badges = await page.$$eval('.mt-ex .ex-src', (e) => e.length);
    ok(badges === nCat, '카탈로그 전용 표시 ' + badges + '개 (= ' + nCat + ')');
    // 사진이 있는 제품 수(데이터) · 조명 폴더(카탈로그 전용이 대부분)에 뜬 카탈로그 사진(흰 칸 썸네일)
    const withPh = PDB.products.filter((p) => p.th).length, curPh = CAT.products.filter((c) => (PDB.curated[c.id] || {}).th || (PDB.curated[c.id] || {}).img || c.img).length;
    ok(withPh >= PDB.products.length - 10 && curPh >= CAT.products.length - 1, '사진 있는 제품 ' + withPh + '/' + PDB.products.length + ' · 큐레이션 ' + curPh + '/' + CAT.products.length);
    await page.mouse.move(4, 896); await page.waitForTimeout(250); await page.click('.mt-ex .ex-nav .ex-nd:has-text("조명")'); await page.waitForTimeout(300);
    await page.$eval('.mt-ex .ex-list .ex-row:has(.ex-src)', (e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(300);
    await page.waitForFunction(() => document.querySelectorAll('.mt-ex .ex-list .ex-row .thumb.cut.white img[src^="blob:"]').length >= 3, null, { timeout: 15000 }).catch(() => {});
    const wcat = await page.$$eval('.mt-ex .ex-list .ex-row .thumb.cut.white img', (e) => e.filter((x) => x.complete && x.naturalWidth > 0).length);
    ok(wcat >= 3, '조명 폴더 카탈로그 전용 행에 카탈로그 제품 사진 ' + wcat + '장');
    await page.mouse.move(5, 5); await shot(page, 'pdb-catalog-rows');
    const c0 = PDB.products.find((p) => p.src === 'catalog' && (p.models || []).length);
    if (c0) {
      await page.fill('#ex-q-in', c0.models[0]); await page.waitForTimeout(300);
      ok((await page.$$('.mt-ex .ex-row.products')).length >= 1, '카탈로그 전용 제품 모델 검색 ' + c0.models[0]);
      await page.hover('.mt-ex .ex-list .ex-row.products >> nth=0'); await page.waitForSelector('.dpk .dpk-card', { timeout: 5000 });
      await page.waitForTimeout(900);
      ok(await page.$('.dpk .dpk-ecat a[href*="aiibook"]'), '카탈로그 전용 상세에 e-카탈로그 쪽 링크');
      // 카탈로그에서 자른 실제 제품 사진: 갤러리 첫 장 + 출처(e-카탈로그 「…」 N쪽)
      if (c0.th) {
        await page.waitForSelector('.dpk .dpk-main img[src^="blob:"]', { timeout: 8000 }).catch(() => {});
        const g = await page.evaluate(() => ({ img: !!document.querySelector('.dpk .dpk-main img[src^="blob:"]'), cap: (document.querySelector('.dpk .dpk-cap') || {}).textContent || '' }));
        ok(g.img && /e-카탈로그 「/.test(g.cap), '카탈로그 전용 상세에 카탈로그 제품 사진 · 출처: ' + g.cap.slice(0, 70));
      }
      await shot(page, 'pdb-catalog-peek');
      await page.mouse.move(5, 5); await page.waitForTimeout(300);
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }
});
// curated QM43C carries the site card's options · detail
await run('curated', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await openExplorer(page);
  await page.fill('#ex-q-in', 'QM43C'); await page.waitForTimeout(300);
  await page.hover('.mt-ex .ex-list .ex-row.products >> nth=0'); await page.waitForSelector('.dpk .dpk-card');
  await page.waitForSelector('.dpk .dpk-mdl', { timeout: 8000 }).catch(() => {});
  const m = await page.$$eval('.dpk .dpk-mdl b', (e) => e.map((x) => x.textContent));
  ok(m.includes('LH43QMCEBGCXKR'), '큐레이션 QM43C 상세에 사이트 옵션 모델 ' + m.length + '개');
});
await run('dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }, async (page) => {
  await openExplorer(page);
  await page.waitForTimeout(1500);
  await shot(page, 'pdb-all-dark');
  await page.hover('.mt-ex .ex-list .ex-row.products >> nth=60'); await page.waitForSelector('.dpk .dpk-card');
  await page.waitForTimeout(1200);
  await shot(page, 'pdb-peek-dark');
});
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (page) => {
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()).catch(() => {});
  await page.waitForTimeout(800);
  if (!(await page.$('[data-ctx="products"]'))) { ok(true, 'mobile: (no storyboard entry)'); return; }
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card');
  await page.click('.mt-pop .cc-sec.product .cc-addcard'); await page.waitForSelector('.mt-ex .ex-row');
  await page.waitForTimeout(800);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(ov <= 0, 'mobile: 탐색기 가로 넘침 없음 (' + ov + ')');
  await shot(page, 'pdb-mobile');
});
await browser.close(); srv.close();
if (errs.length) { console.log(errs.join('\n')); process.exit(1); } else console.log('all ok');
