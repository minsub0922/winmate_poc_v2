// 새 레이아웃 사진 비율(pf) — pf.mjs 와 같은 계산. node build/bs/pf_new.mjs → build/bs/new_pf.json
import { chromium } from 'playwright';
import fs from 'fs';
const H = JSON.parse(fs.readFileSync('build/bs/new_layouts.json', 'utf8'));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
await pg.setContent('<div id=h></div>');
const out = {};
for (const [f, html] of Object.entries(H)) {
  out[f] = await pg.evaluate((html) => {
    const h = document.getElementById('h'); h.innerHTML = html; const root = h.firstElementChild;
    const G = 8, gw = 160, gh = 90; const grid = new Uint8Array(gw * gh); const rb = root.getBoundingClientRect();
    const mark = (r) => { const x0 = Math.max(0, Math.floor((r.left - rb.left) / G)), x1 = Math.min(gw, Math.ceil((r.right - rb.left) / G)), y0 = Math.max(0, Math.floor((r.top - rb.top) / G)), y1 = Math.min(gh, Math.ceil((r.bottom - rb.top) / G)); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[y * gw + x] = 1; };
    for (const e of root.querySelectorAll('[data-img], img')) { const r = e.getBoundingClientRect(); if (r.width * r.height > 900) mark(r); }
    let n = 0; for (const v of grid) n += v; return Math.round(n / (gw * gh) * 100) / 100;
  }, html);
}
fs.writeFileSync('build/bs/new_pf.json', JSON.stringify(out)); console.log(out);
await b.close();
