// New-part flow shots: canvas, + click, editor, type popover, name suggestions
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist'); const shots = path.resolve(here, 'qa'); fs.mkdirSync(shots, { recursive: true });
const tag = process.env.TAG || 'p';
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html')); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8805);
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
const shot = async (n) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(shots, tag + '-' + n + '.png') }); console.log('shot', n); };
await page.goto('http://localhost:8805/'); await page.waitForSelector('.home');
await page.click('.sb-item:has-text("커피")'); await page.waitForSelector('.canvas'); await page.waitForTimeout(700);
await shot('01-canvas');
await page.click('.end-plus'); await page.waitForTimeout(400);
await shot('02-after-plus');
if (process.env.STEPS) for (const st of process.env.STEPS.split('|')) { const [act, sel, val] = st.split('~'); if (act === 'click') await page.click(sel); if (act === 'fill') await page.fill(sel, val); if (act === 'type') await page.type(sel, val, { delay: 40 }); if (act === 'key') await page.keyboard.press(sel); if (act === 'shot') await shot(sel); await page.waitForTimeout(250); }
console.log('errs', errs); await browser.close(); srv.close();
