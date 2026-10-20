// 제품 이미지 라이브러리(img/lib): 색인 · 묶음 데이터 점검 + 제품 hover 상세에 관련 이미지 · 이미지 넣기(라이브러리 전체)에서 검색 · 넣기
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = process.env.WM_ROOT || path.resolve(here, '../dist');  // WM_ROOT = 다른 배포본(예: 공개본에 패치한 것)을 같은 폴더 구조로
const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
// ── data ──
const IDX = JSON.parse(fs.readFileSync(path.join(root, 'img/lib/index.json'), 'utf8')).images;
const PDB = JSON.parse(fs.readFileSync(path.resolve(here, '../data/products_db.json'), 'utf8'));
const CAT = JSON.parse(fs.readFileSync(path.resolve(here, '../data/catalog.json'), 'utf8'));
const ids = new Set([...PDB.products.map((p) => p.id), ...CAT.products.map((c) => c.id)]);
const KINDS = new Set(['cut', 'scene', 'detail', 'ui', 'diagram']);
ok(IDX.length > 1000, '색인 이미지 ' + IDX.length + '장');
ok(IDX.every((im) => im.p.length && im.p.every((p) => ids.has(p))), '모든 이미지가 앱 제품에 연결(없는 제품 id 없음)');
ok(IDX.every((im) => KINDS.has(im.k)), '종류는 cut · scene · detail · ui · diagram 만');
const packs = new Set(IDX.map((im) => im.a.split('#')[0]));
ok([...packs].every((f) => fs.existsSync(path.join(root, f))), '묶음 파일 ' + packs.size + '개 모두 있음');
const per = {}; for (const im of IDX) for (const p of im.p) per[p] = (per[p] || 0) + 1;
console.log('  제품당 이미지: 연결된 제품 ' + Object.keys(per).length + ' / ' + ids.size + ' · 종류 ' + JSON.stringify(IDX.reduce((a, im) => (a[im.k] = (a[im.k] || 0) + 1, a), {})) + ' · 출처 ' + JSON.stringify(IDX.reduce((a, im) => (a[im.s] = (a[im.s] || 0) + 1, a), {})));
// a site product with scenes from several sources
const rich = PDB.products.filter((p) => p.src === 'site').map((p) => ({ p, n: IDX.filter((im) => im.p.includes(p.id) && im.k !== 'cut').length })).sort((a, b) => b.n - a.n)[0].p;

const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/json' }); fs.createReadStream(f).pipe(r); }).listen(8796);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
async function run(name, opts, fn) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  await page.goto('http://localhost:8796/'); await page.waitForSelector('.home'); await fn(page); await ctx.close();
}
const shot = (page, n) => page.waitForTimeout(400).then(() => page.screenshot({ path: path.join(shots, 'imglib-' + n + '.png') }));
for (const scheme of ['light', 'dark']) {
  await run('peek-' + scheme, { viewport: { width: 1440, height: 900 }, colorScheme: scheme }, async (page) => {
    await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
    await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card');
    await page.click('.mt-pop .cc-sec.product .cc-addcard'); await page.waitForSelector('.mt-ex .ex-row');
    await page.mouse.move(4, 896); await page.waitForTimeout(400);  // 버튼 자리에 남은 마우스가 연 hover 상세를 닫음
    await page.fill('#ex-q-in', rich.model);
    await page.waitForFunction((m) => { const r = document.querySelector('.mt-ex .ex-row.products'); return r && r.textContent.includes(m); }, rich.model, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.hover('.mt-ex .ex-row.products >> nth=0'); await page.waitForSelector('.dpk .dpk-card');
    ok((await page.$eval('.dpk .dpk-card', (e) => e.textContent)).includes(rich.model), scheme + ': hover 상세가 찾은 제품(' + rich.model + ')');
    await page.waitForFunction(() => document.querySelectorAll('.dpk .dpk-strip .dpk-th').length >= 6, null, { timeout: 25000 }).catch(() => {});
    const n = await page.$$eval('.dpk .dpk-strip .dpk-th', (e) => e.length);
    ok(n >= 6, scheme + ': ' + rich.name + ' hover 갤러리 ' + n + '장(상품 카드 + 관련 이미지)');
    // step to a library image and read its caption
    const caps = [];
    for (let k = 0; k < Math.min(n, 14); k++) { await page.hover('.dpk .dpk-strip .dpk-th >> nth=' + k); caps.push(await page.$eval('.dpk .dpk-cap', (e) => e.textContent)); }
    ok(caps.some((c) => /상세페이지|도입사례|e-카탈로그/.test(c)), scheme + ': 관련 이미지 출처 표시 — ' + (caps.find((c) => /상세페이지|도입사례|e-카탈로그/.test(c)) || '').slice(0, 80));
    ok(caps.every((c) => !/undefined|null|NaN/.test(c)), scheme + ': 설명 줄에 빈 값(undefined) 없음');
    await shot(page, 'peek-' + scheme);
  });
}
await run('picker', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.click('.lcard >> nth=0'); // 2026-10-19: A 커피 첫 장(사진 트렌드 카드) await page.waitForSelector('.detail .slide-units [data-unit]'); await page.waitForTimeout(400);
  await page.click('.detail [data-img] >> nth=0'); await page.waitForSelector('.imgpop');
  await page.click('.imgpop button:has-text("라이브러리 전체")'); await page.waitForSelector('.imgrid');
  await page.waitForSelector('.pk-libh', { timeout: 15000 }).catch(() => {});
  ok(await page.isVisible('.pk-libh'), '이미지 넣기에 제품 이미지 라이브러리 칸');
  await page.fill('#im-q', '매장'); await page.waitForTimeout(600);
  const nLib = await page.$$eval('.pk-libh + .imgrid .imgopt', (e) => e.length);
  ok(nLib >= 3, '“매장” 검색 → 라이브러리 ' + nLib + '장');
  await page.waitForFunction(() => document.querySelectorAll('.pk-libh + .imgrid .imgopt img[src^="blob:"]').length >= 2, null, { timeout: 25000 }).catch(() => {});
  ok((await page.$$('.pk-libh + .imgrid .imgopt img[src^="blob:"]')).length >= 2, '라이브러리 사진이 묶음에서 뜸');
  await shot(page, 'picker');
  await page.click('.pk-libh + .imgrid .imgopt >> nth=0'); await page.waitForTimeout(800);
  const src = await page.$eval('.detail [data-img] img, .detail img[data-fill]', (e) => e.getAttribute('data-fill') || e.getAttribute('src')).catch(() => '');
  ok(/img\/lib\/p\d+\.json#\d+/.test(src || ''), '고른 사진이 장에 들어감(묶음 주소 ' + src + ')');
  ok(await page.isVisible('.evsec:has(h4:has-text("이미지 출처")) .evrow:has-text("제품 이미지 라이브러리")'), '이미지 출처에 라이브러리 · 원 출처 기록');
  await shot(page, 'picked');
});
await browser.close(); srv.close();
if (errs.length) { console.log(errs.join('\n')); process.exit(1); } else console.log('all ok');
