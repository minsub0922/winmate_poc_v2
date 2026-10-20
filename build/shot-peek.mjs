// Hover detail (제품 · 솔루션 · 유관사례) — requirements popup + Storyboard 매칭 popup, light / dark / narrow.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const PORT = 8871 + Math.floor(Math.random() * 100);
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } const ct = f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.png') ? 'image/png' : f.endsWith('.jpg') ? 'image/jpeg' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r); }).listen(PORT);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const tag = process.env.TAG || 'pk';
const errs = []; const ok = (c, m) => { if (!c) errs.push('FAIL ' + m); else console.log('ok', m); };
const PEEK = '.cc-peek, .rc-peek, .dpk';
async function run(name, opts, fn) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
  await page.goto('http://localhost:' + PORT + '/'); await page.waitForSelector('.home'); await fn(page); await ctx.close();
}
const shot = async (page, n) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(shots, tag + '-' + n + '.png') }); console.log('shot', n); };
const peekBox = (page) => page.$eval(PEEK, (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top), b: Math.round(r.bottom), r: Math.round(r.right) }; }).catch(() => null);

async function reqPopup(page) {
  await page.click('.sb-item:has-text("커피")'); await page.waitForSelector('.topbar'); await page.waitForTimeout(600);
  await page.click('.start-card'); await page.waitForSelector('.rq-pop');
  await page.click('.rq-f .btn:has-text("저장")'); await page.waitForSelector('.cc-top'); await page.waitForTimeout(300);
}
async function storyCtx(page, seed) {
  await page.click('.sb-item:has-text("' + seed + '")').catch(async () => { await page.click('.sb-item >> nth=0'); });
  await page.waitForSelector('.topbar'); await page.waitForTimeout(700);
  if (await page.$('.rq-pop')) { await page.click('.rq-f .btn-primary'); await page.waitForTimeout(400); const go = await page.$('.modal button:has-text("저장하고 다음으로")'); if (go) await go.click(); await page.waitForTimeout(600); }
}

await run('req', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await reqPopup(page);
  for (const k of ['product', 'solution', 'case']) {
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    await page.hover('.cc-sec.' + k + ' .cc-card >> nth=0'); await page.waitForSelector(PEEK); await shot(page, 'req-' + k);
    console.log(k, 'box', await peekBox(page));
  }
});
await run('story', { viewport: { width: 1440, height: 900 } }, async (page) => {
  await storyCtx(page, process.env.SEED || '커피');
  for (const k of ['products', 'solutions', 'cases']) {
    const btn = await page.$('[data-ctx="' + k + '"]'); if (!btn) { console.log('no btn', k); continue; }
    await btn.click(); await page.waitForTimeout(500);
    await page.hover('.ctxc .ctile >> nth=0'); await page.waitForSelector(PEEK, { timeout: 3000 }).catch(() => {}); await shot(page, 'story-' + k);
    console.log(k, 'box', await peekBox(page));
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  }
});
console.log('errs', errs); await browser.close(); srv.close();
