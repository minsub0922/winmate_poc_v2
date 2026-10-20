// 사진 중심 레이아웃(L_PH_*): 템플릿 페이지 탭 · 사진 중심 필터 · 사진 로드 · PPTX · 레이아웃 추가 팝업 추천(사진 버전) ·
// 업종 사진 버전(L_PH_SS_xx_B) · 다크 · 모바일. ‘사진 중심’ · ‘사진 버전 있음’ 태그와 상세의 같은 맥락(사진 · 텍스트 버전) 행은 화면에 안 보임
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa');
fs.mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8771);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const missing = new Set();
const mk = async (opts) => {
  const ctx = await browser.newContext({ acceptDownloads: true, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('response', (r) => { if (r.status() === 404 && /\/img\/(ph|bs\/p-)/.test(r.url())) missing.add(r.url()); });
  return { ctx, page };
};
const shot = async (page, n) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(shots, 'photo-' + n + '.png') }); };

{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:8771/');
  await page.waitForSelector('.sb-tpl', { timeout: 30000 });
  await page.click('.sb-tpl');
  await page.waitForSelector('.tl-card');
  // deck tab
  await page.click('.tl-by button:has-text("원본 장표별")');
  await page.click('.tl-tab:has-text("06 사진 중심")');
  await page.waitForTimeout(1500);
  const n = +(await page.locator('.tl-sum b').innerText());
  ok(n === 332, '06 사진 중심 탭 332장 (' + n + ')');
  ok((await page.locator('.tl-card .tag.ph, .tl-card .tag.twin').count()) === 0, '카드에 사진 중심 · 사진 버전 표시 없음');
  await shot(page, '01-deck');
  // every card photo loaded
  ok((await page.locator('.tl-more').count()) === 0, '더보기 없이 한 번에 모두 보임');
  for (let y = 0; y < 30; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
  const broken = await page.$$eval('.tl-card img', (ims) => ims.filter((i) => i.complete && !i.naturalWidth).map((i) => i.getAttribute('src')));
  ok(broken.length === 0, '카드 사진 모두 로드 (' + broken.slice(0, 3).join(', ') + ')');
  // 고객사 이해 파트: 사진 중심이 텍스트보다 많아야 함 (업종 16 + 범용)
  await page.click('.tl-by button:has-text("파트 유형별")');
  await page.click('.tl-tab:has-text("분석 · 이해")');
  await page.click('.qchip:has-text("고객사 이해")');
  await page.waitForTimeout(600);
  const custAll = +(await page.locator('.tl-sum b').innerText());
  await page.selectOption('#tl-img', 'ph');
  await page.waitForTimeout(600);
  const custPh = +(await page.locator('.tl-sum b').innerText());
  ok(custPh >= 25 && custPh * 2 > custAll, '고객사 이해 사진 중심 ' + custPh + ' / ' + custAll);
  await shot(page, '01b-customer');
  await page.selectOption('#tl-img', '');
  await page.click('.tl-by button:has-text("원본 장표별")');
  // photo-first filter on all
  await page.click('.tl-tab:has-text("전체")');
  await page.selectOption('#tl-img', 'ph');
  await page.waitForTimeout(600);
  console.log('사진 중심 필터', await page.locator('.tl-sum').innerText());
  await page.selectOption('#tl-img', '');
  // text layout → twin
  await page.click('.tl-by button:has-text("파트 유형별")');
  await page.fill('#tl-q', 'MS-A');
  await page.waitForTimeout(600);
  await page.locator('.tl-card').first().click();
  await page.waitForSelector('.tl-detail');
  ok((await page.locator('.tl-twin, .tag.twin').count()) === 0 && !/사진 중심 버전|텍스트 버전/.test(await page.locator('.tl-detail').innerText()), '상세에 사진 · 텍스트 버전 행 없음');
  await shot(page, '02-detail');
  await page.keyboard.press('Escape');
  // 업종 사진 버전: 대표 공간 네 장면 (L_SS_HT_B → L_PH_SS_HT_B)
  await page.fill('#tl-q', 'PH-SS-HT-B');
  await page.waitForTimeout(600);
  ok(await page.locator('.tl-card').count() >= 1, '업종 사진 버전 검색 (PH-SS-HT-B)');
  await page.locator('.tl-card').first().click(); await page.waitForSelector('.tl-detail');
  ok(!/텍스트 버전|사진 중심 버전/.test(await page.locator('.tl-detail').innerText()), '업종 사진 버전 상세에 같은 맥락 행 없음');
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.click('.mfoot .btn-primary');
  const d = await dl; const p = path.join(shots, 'photo-single.pptx'); await d.saveAs(p);
  ok(fs.statSync(p).size > 100000, '사진 레이아웃 PPTX 받기 (' + fs.statSync(p).size + ' bytes)');
  await shot(page, '02b-industry');
  await page.keyboard.press('Escape');
  // 목차(텍스트) → 원본 장표의 사진 목차(C10)
  await page.fill('#tl-q', '목차');
  await page.waitForTimeout(600);
  ok((await page.locator('.tl-card:has-text("사진 버전 있음")').count()) === 0 && (await page.locator('.tl-card').count()) >= 1, '목차 카드에 사진 버전 있음 표시 없음');
  await page.fill('#tl-q', '');
  await ctx.close();
}
// 사진 중심 버전이 내용을 빠짐없이 담아 라이브러리에서 뺀 텍스트 레이아웃 (data.js RETIRED)
const RETIRED_NAMES = ['전략 목표 → 과제 트리', 'SWOT', 'KPI 벤치마크', '페르소나 3', '가치 기둥 · 3개', 'KPI 전 → 후', '이미지 중심 (3열)', '이미지 중심 (5열)', '스펙 비교 (VS)', '구성 3안 (기본 · 권장 · 확장)', '사용자별 접점', '기존 장비 → 교체 매핑'];
{ // library: retired text layouts are gone, their codes lead to the photo version
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:8771/'); await page.waitForSelector('.sb-tpl', { timeout: 30000 });
  await page.click('.sb-tpl'); await page.waitForSelector('.tl-card');
  const n = await page.textContent('h1 .num');
  ok(n.trim() === '518', '템플릿 수 518 (754 − 대체 236) — ' + n);
  const names = async () => page.$$eval('.tl-card .tl-name', (e) => e.map((x) => x.textContent.trim()));
  await page.fill('#tl-q', 'SWOT'); await page.waitForTimeout(700);
  const sw = await names();
  ok(sw.includes('SWOT · 사분면 현장 사진') && !sw.includes('SWOT'), 'SWOT 검색은 사진 버전만: ' + sw.slice(0, 3).join(' / '));
  await page.fill('#tl-q', 'L_P5A'); await page.waitForTimeout(700);
  const p5 = await names();
  ok(p5[0] === '제품 5 · 설치 장면 5열', '뺀 코드(L_P5A)로 찾으면 대체한 사진 버전: ' + p5[0]);
  await page.fill('#tl-q', 'L_MI_FB_C'); await page.waitForTimeout(700);
  const jc = await names();
  ok(jc[0] === '외식 · 카페 · 고객 여정 · 사진', '4차: 뺀 고객 여정(L_MI_FB_C) → 사진 버전: ' + jc[0]);
  await page.fill('#tl-q', 'L_VC_64'); await page.waitForTimeout(700);
  const vc = await names();
  ok(vc[0] === '공간 × 솔루션 · 사진 행', '4차: 뺀 공간 × 솔루션(L_VC_64) → 사진 행: ' + vc[0]);
  await page.fill('#tl-q', 'PH-MI-FB-C'); await page.waitForTimeout(700);
  await page.locator('.tl-card').first().click(); await page.waitForSelector('.tl-detail'); await page.waitForTimeout(2200);
  const r4 = await page.evaluate(() => { const im = [...document.querySelectorAll('.tl-detail img[data-fill^="img/fill/r4-"], .tl-detail img[data-fill]')]; return { n: im.length, ok: im.filter((i) => i.src.startsWith('blob:') && i.complete && i.naturalWidth > 4).length }; });
  ok(r4.n >= 2 && r4.ok === r4.n, `4차 업종 사진 레이아웃(PH-MI-FB-C) 묶음 사진 ${r4.ok}/${r4.n}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.fill('#tl-q', ''); await page.waitForTimeout(300);
  await page.click('.tl-by button:has-text("파트 유형별")'); await page.click('.tl-tab:has-text("분석 · 이해")'); await page.waitForTimeout(400);
  const all = await names();
  ok(!all.some((t) => RETIRED_NAMES.includes(t)), '분석 · 이해 탭에 대체한 텍스트 장 없음 (' + all.length + ')');
  await ctx.close();
}
{ // picker: photo versions are recommended
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:8771/'); await page.waitForSelector('.home');
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.click('.col .btn-primary:has-text("PPT 레이아웃 추가") >> nth=0'); await page.waitForSelector('.pk-rec .pcard'); await page.waitForTimeout(600);
  const rec = await page.$$eval('.pk-rec .pcard', (es) => es.map((e) => e.querySelector('.nm').textContent + ' · ' + (/^L_PH_/.test(e.dataset.f || '') ? 1 : 0)));
  console.log('추천', rec);
  ok(!rec.some((x) => RETIRED_NAMES.includes(x.replace(/ · \d+$/, ''))), '추천에 사진 버전으로 대체한 텍스트 장 없음');
  ok(rec.some((x) => x.endsWith(' · 1')), '추천에 사진 중심 레이아웃');
  ok((await page.locator('.pk-rec .pcard .tag.ph').count()) === 0, '추천 카드에 사진 중심 태그 없음');
  await page.hover('.pk-rec .pcard[data-f^="L_PH_"]'); await page.waitForSelector('.pk-peek'); await page.waitForTimeout(400);
  const dts = await page.$$eval('.pp-meta dt', (e) => e.map((x) => x.textContent));
  const whys = await page.$$eval('.pk-peek .why', (e) => e.map((x) => x.textContent));
  ok(!dts.some((t) => /텍스트 버전|사진 중심 버전/.test(t)) && !whys.some((w) => /사진 중심|사진 버전/.test(w)), 'hover에 같은 맥락 행 · 사진 중심 이유 없음: ' + dts.join(' · '));
  await shot(page, '03-picker');
  await ctx.close();
}
{ // dark + mobile
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  await page.goto('http://localhost:8771/'); await page.waitForSelector('.sb-tpl', { timeout: 30000 });
  await page.click('.sb-tpl'); await page.waitForSelector('.tl-card');
  await page.click('.tl-by button:has-text("원본 장표별")'); await page.click('.tl-tab:has-text("06 사진 중심")'); await page.waitForTimeout(1200);
  await shot(page, '04-dark');
  await ctx.close();
}
{
  const { ctx, page } = await mk({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8771/'); await page.waitForSelector('.mob-top', { timeout: 30000 });
  await page.click('.mob-top .btn'); await page.waitForTimeout(300); await page.click('.sb-tpl'); await page.waitForSelector('.tl-card');
  await page.click('.tl-by button:has-text("원본 장표별")'); await page.click('.tl-tab:has-text("06 사진 중심")'); await page.waitForTimeout(1000);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(over <= 0, 'mobile: no horizontal overflow (' + over + ')');
  await page.locator('.tl-card').first().click(); await page.waitForSelector('.tl-detail'); await page.waitForTimeout(600);
  await shot(page, '05-mobile-detail');
  await ctx.close();
}
ok(missing.size === 0, '사진 · 제품 컷 404 없음 ' + [...missing].slice(0, 3).join(', '));
console.log(errs.length ? errs : 'all ok');
await browser.close(); srv.close();
