import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = process.argv[2] || '/home/claude/wm/dist'; const out = process.argv[3] || '/home/claude/ana/shots';
const names = process.argv.slice(4);
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'preview.html'; if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } const ct = f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'image/jpeg'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, ok));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${srv.address().port}/preview.html`);
await page.waitForTimeout(2500);
await page.screenshot({ path: out + '/home.png' });
for (const n of names) {
  await page.evaluate((n) => { localStorage.setItem('winmate.v2.ui', JSON.stringify({})); }, n); const el = page.locator('main >> text=' + n).first(); await el.scrollIntoViewIfNeeded(); await el.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: out + '/' + n.replace(/\s/g, '_') + '.png' });
}
await browser.close(); srv.close();
