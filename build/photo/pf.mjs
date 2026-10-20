// photo fraction for every layout (old + new): share of the slide covered by image slots / photos
import { chromium } from 'playwright';
import fs from 'fs';
import zlib from 'zlib';
const H = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('data/layouts.b64', 'utf8').trim(), 'base64')).toString('utf8'));
Object.assign(H, JSON.parse(fs.readFileSync('build/photo/new_layouts.json', 'utf8')));
const exe = process.env.CHROME; const b = await chromium.launch(exe ? { executablePath: exe } : {});
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
await pg.setContent('<div id=h></div>');
const out = {};
for (const [f, html] of Object.entries(H)) {
  out[f] = await pg.evaluate((html) => {
    const h = document.getElementById('h'); h.innerHTML = html; const root = h.firstElementChild;
    const G = 8, gw = 160, gh = 90; const grid = new Uint8Array(gw * gh); const rb = root.getBoundingClientRect();
    const mark = (r) => { const x0 = Math.max(0, Math.floor((r.left - rb.left) / G)), x1 = Math.min(gw, Math.ceil((r.right - rb.left) / G)), y0 = Math.max(0, Math.floor((r.top - rb.top) / G)), y1 = Math.min(gh, Math.ceil((r.bottom - rb.top) / G)); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[y * gw + x] = 1; };
    for (const e of root.querySelectorAll('[data-img], img')) { const r = e.getBoundingClientRect(); if (r.width * r.height > 900) mark(r); }
    for (const e of root.querySelectorAll('div,span')) {
      if (e.closest('[data-img]')) continue;
      const own = Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('').trim();
      const r = e.getBoundingClientRect();
      if (own && own.length < 40 && /사진|이미지|조감도|렌더|컷|전경|PHOTO|IMAGE/i.test(own) && r.width > 120 && r.height > 80) mark(r);
    }
    let n = 0; for (const v of grid) n += v; return Math.round(n / (gw * gh) * 100) / 100;
  }, html);
}
fs.writeFileSync('build/photo/pf.json', JSON.stringify(out));
await b.close();
const nw = Object.keys(JSON.parse(fs.readFileSync('build/photo/new_layouts.json', 'utf8')));
console.log(nw.map((f) => f + ' ' + out[f]).join('\n'));
