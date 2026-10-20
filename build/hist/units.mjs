// 레이아웃 의미 단위(앱 markUnits 와 같은 키) — node build/hist/units.mjs → build/hist/units.json  { f: [{key, ft, imgs, isImg}] }
// 대상: build/hist/out/*.json 에 쓰인 모든 레이아웃
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const fsSet = new Set();
for (const fn of fs.readdirSync(path.join(root, 'build/hist/out'))) {
  if (!fn.endsWith('.json') || fn.startsWith('_')) continue;
  const o = JSON.parse(fs.readFileSync(path.join(root, 'build/hist/out', fn), 'utf8'));
  for (const x of o.deck || []) fsSet.add(x.f);
  for (const s of o.parts || []) for (const x of s.layouts || []) fsSet.add(x.f);
}
const srv = http.createServer((q, r) => { const f = path.join(dist, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, ok));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
await page.goto(`http://localhost:${srv.address().port}/_h.html`);
await page.waitForFunction(() => window.H);
await page.evaluate(() => window.H.loadLayoutHtml());
const out = await page.evaluate((fs_) => {
  const H = window.H; const res = {};
  for (const f of fs_) {
    const host = document.createElement('div'); host.innerHTML = H.layoutHtml(f);
    if (!host.firstElementChild) { res[f] = null; continue; }
    res[f] = H.markUnits(host.firstElementChild).filter((u) => !u.fixed).map((u) => ({ key: u.key, ft: u.ft, imgs: u.imgs, isImg: u.isImg, kind: u.kind && u.kind.name }));
  }
  return res;
}, [...fsSet]);
fs.writeFileSync(path.join(root, 'build/hist/units.json'), JSON.stringify(out));
console.log('units', Object.keys(out).length);
await browser.close(); srv.close();
