// 레이아웃 그대로(예시 값) 찍기 — node build/bs/gallery.mjs <out dir> f1 f2 …  (또는 @file 로 목록)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
let [out, ...fs_] = process.argv.slice(2);
if (fs_.length === 1 && fs_[0].startsWith('@')) fs_ = fs.readFileSync(fs_[0].slice(1), 'utf8').split(/\s+/).filter(Boolean);
const srv = http.createServer((q, r) => {
  const f = path.join(dist, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const ct = f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.png') ? 'image/png' : 'image/jpeg'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => srv.listen(0, ok));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${srv.address().port}/_h.html`);
await page.waitForFunction(() => window.H);
await page.evaluate(() => window.H.loadLayoutHtml());
if (process.env.EXTRA) { const X = JSON.parse(fs.readFileSync(process.env.EXTRA, 'utf8')); await page.evaluate((X) => window.H.loadLayoutHtml().then((h) => Object.assign(h, X)), X); }
fs.mkdirSync(out, { recursive: true });
for (const f of fs_) {
  const ok = await page.evaluate(async (f) => {
    const H = window.H; const stage = document.getElementById('stage'); stage.innerHTML = H.layoutHtml(f);
    const r = stage.firstElementChild; if (!r) return false; H.applyOverrides(r, {}, null); await H.fillReady(r);
    await Promise.all(Array.from(r.querySelectorAll('img')).map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; setTimeout(ok, 4000); })));
    return true;
  }, f);
  if (ok) await page.screenshot({ path: path.join(out, `${f}.jpg`), type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 1280, height: 720 } });
  else console.log('missing', f);
}
await browser.close(); srv.close();
