import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8769);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 1900, height: 900 } })).newPage();
await page.goto('http://localhost:8769/'); await page.waitForSelector('.home');
await page.click('.sb-item:has-text("A 커피")'); await page.waitForSelector('.canvas'); await page.waitForTimeout(1000);
const codes = async () => page.$$eval('.lcard .code', (els) => els.map((e) => e.textContent));
await page.dragAndDrop('.lcard:has(.code:text-is("CB-B"))', '.lcard:has(.code:text-is("VP-F"))', { targetPosition: { x: 40, y: 10 } });
await page.waitForTimeout(400);
console.log('wide cross-part', await codes());
for (let k = 0; k < 4; k++) await page.click('.zoombar button[aria-label="축소"]');
await page.waitForTimeout(300);
{
  const src = await page.locator('.lcard:has(.code:text-is("EF-A"))').boundingBox();
  await page.mouse.move(src.x + 60, src.y + 40); await page.mouse.down();
  const ls = await page.locator('.col:has(.node-name:has-text("공간 시나리오")) .laystack').boundingBox();
  await page.mouse.move(ls.x + 50, ls.y + 6, { steps: 8 });
  await page.waitForTimeout(200);
  const dz = await page.locator('.col:has(.node-name:has-text("공간 시나리오")) .dropend').boundingBox();
  console.log('dropend', dz);
  if (dz) await page.mouse.move(dz.x + 30, dz.y + 15, { steps: 4 });
  await page.mouse.up();
}
await page.waitForTimeout(400);
console.log('to empty part', await codes(), await page.$$eval('.col', (cs) => cs.map((c) => c.querySelectorAll('.lcard').length)));
await browser.close(); srv.close();
