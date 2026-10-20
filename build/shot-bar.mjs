// Storyboard context bar: shots (desktop · hover peek · viewer open · dark · mobile) + click opens the popup
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8803);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const errs = [];
async function run(name, opts, fn) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(name + ' console: ' + m.text()); });
  await page.goto('http://localhost:8803/'); await page.waitForSelector('.home'); await fn(page); await ctx.close();
}
const shot = (page, n, clip) => page.waitForTimeout(350).then(() => page.screenshot({ path: path.join(shots, 'bar-' + n + '.png'), clip }));
await run('desk', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await page.click('.sb-item:has-text("커피")'); await page.waitForSelector('.ctxbar'); await page.waitForTimeout(600);
  await shot(page, '01-story');
  await page.hover('.cb-item >> nth=0'); await page.waitForSelector('.cb-peek'); await shot(page, '02-peek');
  await page.hover('.cb-group.case .cb-item >> nth=0'); await page.waitForTimeout(500); await shot(page, '03-peek-case');
  await page.mouse.move(700, 600);
  await page.click('.cb-group.solution .cb-item >> nth=0'); await page.waitForSelector('.ctx-tabs');
  console.log('popup tab', await page.$eval('.ctx-tab[aria-selected="true"]', (e) => e.textContent));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('.btn:has-text("레이아웃")'); await page.waitForTimeout(600); await shot(page, '04-viewer');
  console.log('bar items', await page.$$eval('.cb-item', (e) => e.map((x) => x.textContent)));
  await page.click('.sb-item:has-text("호텔")'); await page.waitForTimeout(600);
  if (!(await page.$('.ctxbar'))) { await page.click('.rq-f .btn-primary'); await page.waitForTimeout(400); const go = await page.$('.modal button:has-text("저장하고 다음으로")'); if (go) await go.click(); await page.waitForTimeout(600); }
  await shot(page, '05-hotel', { x: 252, y: 0, width: 1188, height: 180 });
});
await run('dark', { viewport: { width: 1280, height: 820 }, colorScheme: 'dark' }, async (page) => {
  await page.click('.sb-item:has-text("용산")'); await page.waitForSelector('.ctxbar'); await page.waitForTimeout(600);
  await page.hover('.cb-group.product .cb-item >> nth=0'); await page.waitForSelector('.cb-peek'); await shot(page, '06-dark');
});
await run('mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async (page) => {
  await page.click('.hcard:has-text("A 커피")').catch((e) => console.log('nav', e.message)); await page.waitForTimeout(900);
  if (!(await page.$('.ctxbar'))) { await page.click('.rq-f .btn-primary'); await page.waitForTimeout(400); const go = await page.$('.modal button:has-text("저장하고 다음으로")'); if (go) await go.click(); await page.waitForTimeout(600); }
  await shot(page, '07-mobile');
  console.log('mobile overflow', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
});
console.log('errs', errs); await browser.close(); srv.close();
