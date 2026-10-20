// 빈 이미지 칸의 실제 크기와 뒤 배경(밝음 · 어두움)을 잰다 → build/fill/measure.json
// node build/fill/measure.mjs   (채우기 전 원본 build/fill/layouts_orig.b64 를 잰다)
import { chromium } from 'playwright';
import fs from 'fs';
import zlib from 'zlib';
const H = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('build/fill/layouts_orig.b64', 'utf8').trim(), 'base64')).toString('utf8'));
const exe = process.env.CHROME; const b = await chromium.launch(exe ? { executablePath: exe } : {});
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
await pg.setContent('<div id=h></div>');
const out = {};
for (const [f, html] of Object.entries(H)) {
  const r = await pg.evaluate((html) => {
    const h = document.getElementById('h'); h.innerHTML = html; const root = h.firstElementChild;
    const lum = (c) => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); if (!m) return null; if (m[4] != null && +m[4] < 0.5) return null; return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255; };
    const res = {};
    for (const e of root.querySelectorAll('[data-img]')) {
      if (e.getAttribute('data-pid') || e.querySelector('img')) continue;
      const rc = e.getBoundingClientRect();
      let vx0 = rc.left, vy0 = rc.top, vx1 = rc.right, vy1 = rc.bottom, q = e.parentElement;
      while (q && q !== h) { if (getComputedStyle(q).overflow !== 'visible') { const qr = q.getBoundingClientRect(); vx0 = Math.max(vx0, qr.left); vy0 = Math.max(vy0, qr.top); vx1 = Math.min(vx1, qr.right); vy1 = Math.min(vy1, qr.bottom); } q = q.parentElement; }
      const vis = Math.max(0, vx1 - vx0) * Math.max(0, vy1 - vy0) / Math.max(1, rc.width * rc.height);
      let bg = null, p = e.parentElement;
      while (p && bg == null) { const cs = getComputedStyle(p); bg = lum(cs.backgroundColor); if (bg == null && /url\(|gradient/.test(cs.backgroundImage)) bg = 0.3; p = p.parentElement; }
      const st = e.getAttribute('style') || '';
      const fit = (st.match(/object-fit:\s*(\w+)/) || [])[1] || '';
      const pos = (st.match(/object-position:\s*([^;]+)/) || [])[1] || '';
      const br = getComputedStyle(e).borderRadius;
      res[e.getAttribute('data-img')] = { w: Math.round(rc.width), h: Math.round(rc.height), vw: Math.round(Math.max(0, vx1 - vx0)), vh: Math.round(Math.max(0, vy1 - vy0)), vis: Math.round(vis * 100) / 100, bg: bg == null ? 1 : Math.round(bg * 100) / 100, fit, pos: pos.trim(), br };
    }
    // 사진 자리로 그린 글 상자('t<n>') · 번호 없는 고정 상자('s:<글자>')
    const PIC = /사진|이미지|조감도|렌더|전경|확대 컷|PHOTO|IMAGE/i;
    const geo = (e) => { const rc = e.getBoundingClientRect(); let bg = null, p = e.parentElement; while (p && bg == null) { bg = lum(getComputedStyle(p).backgroundColor); p = p.parentElement; } return { w: Math.round(rc.width), h: Math.round(rc.height), vw: Math.round(rc.width), vh: Math.round(rc.height), vis: 1, bg: bg == null ? 1 : Math.round(bg * 100) / 100, own: lum(getComputedStyle(e).backgroundColor), fit: '', pos: '', br: getComputedStyle(e).borderRadius }; };
    for (const e of root.querySelectorAll('[data-tb]')) {
      const t = e.textContent.replace(/\s+/g, ' ').trim();
      if (t && t.length <= 50 && PIC.test(t)) res['t' + e.getAttribute('data-tb')] = geo(e);
    }
    for (const e of root.querySelectorAll('div,span')) {
      if (e.closest('[data-tb],[data-img]')) continue;
      const own = Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('').trim();
      if (own && own.length <= 50 && PIC.test(own)) res['s:' + own] = geo(e);
    }
    // 제품을 검은 사각형으로만 그린 자리 'd<k>' (문서 순서) — patch.mjs 와 같은 규칙
    const rgb = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/); return m && (m[4] == null || +m[4] > 0.6) ? [+m[1], +m[2], +m[3]] : null; };
    let dk = 0;
    for (const e of root.querySelectorAll('div,span')) {
      if (e.closest('[data-img]')) continue;
      const c = rgb(getComputedStyle(e).backgroundColor); if (!c) continue;
      const rc = e.getBoundingClientRect(); const t = e.textContent.replace(/\s+/g, ' ').trim();
      if ((c[0] + c[1] + c[2]) / 3 < 70 && !t && e.children.length <= 2 && rc.width >= 12 && rc.height >= 18 && rc.width <= 320 && rc.height <= 320) res['d' + (dk++)] = geo(e);
    }
    return res;
  }, html);
  if (Object.keys(r).length) out[f] = r;
}
fs.writeFileSync('build/fill/measure.json', JSON.stringify(out));
await b.close();
console.log(Object.keys(out).length, 'layouts');
