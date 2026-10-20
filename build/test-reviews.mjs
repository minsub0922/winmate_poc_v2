// 제안서 검토: sidebar button → history page (3 example reviews) → report → back; seeds stay deleted.
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8841);
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const shot = async (n) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(shots, 'reviews-' + n + '.png') }); console.log('shot', n); };
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

await page.goto('http://localhost:8841/'); await page.waitForSelector('.sidebar'); await page.waitForTimeout(600);
const sb = await page.evaluate(() => { const b = document.querySelector('.sb-rv'); const lab = document.querySelector('.sb-label'); return { text: b && b.innerText.replace(/\s+/g, ' '), above: !!(b && lab && b.nextElementSibling === lab) }; });
ok(sb.text && sb.text.includes('제안서 검토') && !sb.text.includes('내역') && sb.text.includes('3') && sb.above, 'sidebar button sits right above the proposal history: ' + JSON.stringify(sb));
ok(await page.locator('.sidebar .rvh-item, .sidebar .rv-hist').count() === 0, 'sidebar shows no review list');
await page.click('.sb-rv'); await page.waitForSelector('.rvh-list');
const cards = await page.$$eval('.rvh-card', (els) => els.map((e) => ({ t: e.querySelector('.rvh-t b').textContent, score: e.querySelector('.rvh-score b') && e.querySelector('.rvh-score b').textContent, tags: Array.from(e.querySelectorAll('.rvh-tags .tag')).map((x) => x.textContent), demo: !!e.querySelector('.rvh-demo') })));
console.log(JSON.stringify(cards, null, 0));
const inds = new Set(cards.map((c) => c.tags[0])), strats = new Set(cards.map((c) => c.tags[1]));
ok(cards.length === 3 && cards.every((c) => c.demo) && inds.size === 3 && strats.size === 3, 'three example reviews with different industries and strategies');
ok(await page.getAttribute('.sb-rv', 'aria-current') === 'page', 'sidebar button marked current');
await shot('01-list');
await page.click('.rvh-card >> nth=2'); await page.waitForSelector('.rv-report');
const rep = await page.evaluate(() => ({ note: document.querySelector('.rv-note') && document.querySelector('.rv-note').textContent, score: document.querySelector('.rv-ring-n b').textContent, units: document.querySelectorAll('.rv-unit').length, wires: document.querySelectorAll('.rv-unit .rv-wire, .rv-unit svg, .rv-unit-pv > div').length, prio: document.querySelectorAll('.rv-prio li').length }));
ok(rep.note.includes('예시 평가') && rep.units > 0 && rep.prio > 0, 'example report opens with a demo note: ' + JSON.stringify(rep));
await shot('02-report');
await page.click('.rv-unit >> nth=1'); await page.waitForTimeout(400); await shot('03-unit'); await page.keyboard.press('Escape');
await page.click('.rv-crumb button:has-text("제안서 검토")'); await page.waitForSelector('.rvh-list');
ok(true, 'crumb goes back to the history page');
// home entry → page
await page.click('.sb-brand'); await page.waitForSelector('.rv-entry');
await page.click('.rv-hist-btn'); await page.waitForSelector('.rvh-list'); ok(true, 'home 평가 내역 opens the page');
// delete one example → stays deleted after reload
await page.locator('.rvh-del').first().click(); await page.click('.rv-hist-del .btn-danger'); await page.waitForTimeout(500);
ok(await page.locator('.rvh-card').count() === 2, 'deleted one');
await page.reload(); await page.waitForSelector('.rvh-list'); await page.waitForTimeout(400);
ok(await page.locator('.rvh-card').count() === 2, 'route + deletion survive reload (examples are not re-added)');
// new review from the page
await page.setInputFiles('.rvh-cta input[type=file]', { name: 'review_sample.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: fs.readFileSync(path.join(here, 'fixtures/review_sample.pptx')) });
await page.waitForSelector('.rv'); await page.waitForSelector('.rv-report', { timeout: 120000 });
await page.click('.sb-rv'); await page.waitForSelector('.rvh-list');
ok(await page.locator('.rvh-card').count() === 3 && (await page.textContent('.rvh-card >> nth=0')).includes('review_sample'), 'new review lands on top of the list');
// mobile + dark
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); await shot('04-mobile');
ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'no horizontal overflow on phone');
await page.setViewportSize({ width: 1280, height: 860 }); await page.emulateMedia({ colorScheme: 'dark' }); await shot('05-dark');
console.log('errs', errs); if (errs.length) process.exitCode = 1;
await browser.close(); srv.close();
