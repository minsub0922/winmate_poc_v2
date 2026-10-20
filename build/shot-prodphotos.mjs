// 제품 탐색기 사진 확인용 스크린샷 — 조명 · 오디오 · 공조(카탈로그 전용이 많은 폴더) 밝은/어두운 테마 + 카탈로그 제품 hover 상세
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/json' }); fs.createReadStream(f).pipe(r); }).listen(8798);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme }); const page = await ctx.newPage();
  await page.goto('http://localhost:8798/'); await page.waitForSelector('.home');
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(500);
  await page.click('[data-ctx="products"]'); await page.waitForSelector('.mt-pop .cc-card');
  await page.click('.mt-pop .cc-sec.product .cc-addcard'); await page.waitForSelector('.mt-ex .ex-row');
  for (const q of process.argv.slice(2).length ? process.argv.slice(2) : ['하만', '시스템에어컨 · 제어기', 'LED 조명']) {
    await page.fill('#ex-q-in', q); await page.waitForTimeout(600);
    await page.mouse.move(5, 990); await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(shots, `photos-${scheme}-${q.replace(/[^\w가-힣]+/g, '_')}.png`) });
  }
  await page.hover('.mt-ex .ex-list .ex-row.products >> nth=2'); await page.waitForSelector('.dpk .dpk-card'); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(shots, `photos-${scheme}-peek.png`) });
  await ctx.close();
}
await browser.close(); srv.close();
console.log('shots in', shots);
