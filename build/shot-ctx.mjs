import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa');
const PORT = 8771 + Math.floor(Math.random() * 100);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } const ct = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const W = +(process.env.W || 1440), H = +(process.env.H || 900), tag = process.env.TAG || 'a', dark = process.env.DARK === '1';
const page = await (await browser.newContext({ viewport: { width: W, height: H }, colorScheme: dark ? 'dark' : 'light' })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
const shot = async (n, sel) => { await page.waitForTimeout(400); const p = path.join(shots, tag + '-' + n + '.png'); if (sel) await (await page.$(sel)).screenshot({ path: p }); else await page.screenshot({ path: p }); console.log('shot', n); };
await page.goto('http://localhost:' + PORT + '/'); await page.waitForSelector('.home');
const seed = process.env.SEED || '커피';
await page.click('.sb-item:has-text("' + seed + '")').catch(async () => { await page.click('.sb-item >> nth=0'); });
await page.waitForSelector('.topbar'); await page.waitForTimeout(800);
if (await page.$('.rq-pop')) { await page.click('.rq-f .btn-primary'); await page.waitForTimeout(400); const go = await page.$('.modal button:has-text("저장하고 다음으로")'); if (go) await go.click(); await page.waitForTimeout(600); }
await shot('01-story');
const steps = (process.env.STEPS || 'products,solutions,cases').split(',');
for (const k of steps) {
  const label = { products: '제품', solutions: '솔루션', cases: '유관사례' }[k];
  const btn = await page.$('[data-ctx="' + k + '"]') || await page.$('.ctxbtn:has-text("' + label + '")');
  if (!btn) { console.log('no btn', k); continue; }
  await btn.click(); await page.waitForTimeout(500);
  await shot('02-' + k);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
}
console.log('errs', errs); await browser.close(); srv.close();
