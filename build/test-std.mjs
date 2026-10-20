// 표준 제안서(bs21 · L_AIS_*) — Best Scenario 첫 그룹 · 37장 팝업 · 시트 사진 묶음 · PPTX · 제안서 시작 · 템플릿 원본 장표 ST
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200); fs.createReadStream(f).pipe(r);
}).listen(8770);
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const errs = [];
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://localhost:8770/'); await page.waitForSelector('.sb-bs', { timeout: 30000 }); await page.click('.sb-bs'); await page.waitForSelector('.bsl');
await page.mouse.move(1430, 890); await page.waitForTimeout(2500);
const first = await page.evaluate(() => { const g = document.querySelector('.bsp-group'); return [g.getAttribute('aria-label'), g.querySelectorAll('.bsl').length, g.querySelector('.bsl-t').innerText]; });
console.log('first group', first);
const imgs = await page.evaluate(() => [...document.querySelector('.bsl').querySelectorAll('img[data-fill]')].map((i) => i.src.startsWith('blob:') && i.naturalWidth > 0));
console.log('row sheet pack images loaded', imgs.length, imgs.every(Boolean));
await page.screenshot({ path: path.join(shots, 'std-01-row.png') });
await page.click('.bsl .bsl-more'); await page.waitForSelector('.modal.sbv .col'); await page.waitForTimeout(3000);
console.log('storyboard parts · layouts', await page.evaluate(() => [document.querySelectorAll('.modal.sbv .col').length, document.querySelectorAll('.modal.sbv .lcard').length]));
await page.screenshot({ path: path.join(shots, 'std-02-layouts.png') });
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('.modal button:has-text("PPTX로 받기")')]);
const p = path.join(shots, 'bs21.pptx'); await dl.saveAs(p); console.log('pptx', fs.statSync(p).size);
await page.click('.modal button:has-text("활용하기")'); await page.waitForSelector('.modal.narrow'); await page.click('.modal.narrow .mfoot .btn-primary');
await page.waitForSelector('.canvas', { timeout: 20000 }); await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(shots, 'std-03-proposal.png') });
const store = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => /winmate/.test(x) && /prop|v2$/.test(x)); return Object.keys(localStorage); });
console.log('ls keys', store.slice(0, 8));
// template page: 원본 장표 ST count
await page.goto('http://localhost:8770/'); await page.waitForSelector('.sb-bs'); 
console.log('errors', errs.length ? errs.slice(0, 5) : 'none');
await browser.close(); srv.close();
