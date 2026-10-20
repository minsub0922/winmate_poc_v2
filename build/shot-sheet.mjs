// dev helper: the shared sheet popup on every page — template · Best Scenario · Storyboard (editing) · 제안서 검토
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const out = path.resolve(here, 'qa'); fs.mkdirSync(out, { recursive: true });
const tag = process.argv[2] || 'sv';
const vps = (process.argv[3] || '1440x900').split(',');
const scheme = process.argv[4] || 'light';
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(8783);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const errs = [];
const geom = (page) => page.evaluate(() => {
  const m = document.querySelector('.modal.sheet'); const s = m && m.querySelector('.sv-fit > *'); const pn = m && m.querySelector('.sv-panel');
  if (!m) return 'no sheet modal';
  const r = (e) => { const b = e.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); };
  return 'modal ' + r(m) + ' · sheet ' + (s ? r(s) : '-') + ' · panel ' + (pn ? r(pn) : '-') + ' · body ' + m.querySelector('.sv').className;
});
for (const vp of vps) {
  const [W, H] = vp.split('x').map(Number); const mobile = W < 700;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: scheme, ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) errs.push(m.text()); });
  const shot = async (n) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, tag + '-' + W + '-' + n + '.png') }); };
  const nav = async (sel) => { await page.evaluate((s) => document.querySelector(s).click(), sel); };
  await page.goto('http://localhost:8783/'); await page.waitForSelector(mobile ? '.mob-top' : '.sb-tpl', { timeout: 30000 });
  // 1 template
  await nav('.sb-tpl'); await page.waitForSelector('.tl-card'); await page.waitForTimeout(600);
  await page.locator('.tl-card').nth(1).click(); await page.waitForSelector('.modal.sheet'); await page.mouse.move(5, 5);
  console.log(vp, 'template ', await geom(page)); await shot('1-template');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300); console.log(vp, '  → after ArrowRight', await page.locator('.modal.sheet .sv-nav .note').innerText().catch(() => '-'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // 2 Best Scenario sheet
  await nav('.sb-bs'); await page.waitForSelector('.bsl'); await page.waitForTimeout(600);
  await page.locator('.bsl').first().locator('.bsl-sheet').nth(1).click(); await page.waitForSelector('.modal.sheet');
  console.log(vp, 'scenario ', await geom(page)); await shot('2-scenario');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // 3 Storyboard (editing)
  await page.evaluate(() => [...document.querySelectorAll('.sb-item')].find((e) => e.textContent.includes('커피')).click()); await page.waitForSelector('.canvas', { timeout: 20000 }); await page.waitForTimeout(800);
  await page.locator('.lcard').first().click(); await page.waitForSelector('.modal.sheet .slide-units [data-unit]', { timeout: 20000 }); await page.waitForTimeout(500);
  console.log(vp, 'storyboard', await geom(page)); await shot('3-storyboard');
  const u = page.locator('.modal.sheet .slide-units [data-unit]').nth(2); await u.click({ position: { x: 4, y: 4 } }).catch(() => {}); await page.waitForTimeout(400);
  await shot('3b-storyboard-unit');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // 4 제안서 검토
  await nav('.sb-rv'); await page.waitForSelector('.rvh-list'); await page.locator('.rvh-card').nth(2).click(); await page.waitForSelector('.rv-report'); await page.waitForTimeout(500);
  await page.locator('.rv-unit').nth(1).click(); await page.waitForSelector('.modal.sheet'); 
  console.log(vp, 'review    ', await geom(page)); await shot('4-review');
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300); console.log(vp, '  → after ArrowRight', await page.locator('.modal.sheet .sv-nav .note').innerText().catch(() => '-'));
  await ctx.close();
}
console.log('errors', errs.length ? errs : 'none');
await browser.close(); srv.close();
