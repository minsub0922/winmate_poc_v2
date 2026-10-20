// Best Scenario 전 장 검토 — node build/bs/audit.mjs [out.json] [shots dir] [bsNN …]
// 장마다: 레이아웃 메타(사진 비율 pf · 사진 버전 twins) + 실제로 그린 결과(채워진 사진 면적 · 빈 사진 칸 · 글자 넘침) + 스크린샷
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const [outJson = 'build/bs/audit.json', shotDir = '', ...only] = process.argv.slice(2);
const srv = http.createServer((q, r) => {
  const f = path.join(dist, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const ct = f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.png') ? 'image/png' : 'image/jpeg'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${port}/_h.html`);
await page.waitForFunction(() => window.H);
await page.evaluate(() => window.H.loadLayoutHtml());
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const list = await page.evaluate((only) => window.H.SCENARIOS.filter((s) => !only.length || only.includes(s.id)).map((s) => ({ id: s.id, n: window.H.slidesOfScenario(s).length, ind: s.ind, title: s.title })), only);
const out = [];
for (const sc of list) {
  for (let k = 0; k < sc.n; k++) {
    const r = await page.evaluate(async ({ id, k }) => {
      const H = window.H; const s = H.SCENARIOS.find((x) => x.id === id); const x = H.slidesOfScenario(s)[k];
      const f = x.f; const l = H.L[f] || {};
      const fill = H.FILLS[id] && H.FILLS[id][k];
      const ov = H.fillOf(id, k, f); const bg = H.bgOfSlide(id, k); if (bg) ov.bg = bg;
      const stage = document.getElementById('stage'); stage.innerHTML = H.layoutHtml(f);
      const rootEl = stage.firstElementChild;
      if (!rootEl) return { f, missing: true };
      H.applyOverrides(rootEl, ov, k + 1);
      await H.fillReady(rootEl);
      if (bg) { await H.loadBg(bg.src); H.applyOverrides(rootEl, { bg }, k + 1); }
      await Promise.all(Array.from(rootEl.querySelectorAll('img')).map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; setTimeout(ok, 4000); })));
      await new Promise((ok) => setTimeout(ok, 60));
      const rb = rootEl.getBoundingClientRect();
      const G = 8, gw = 160, gh = 90; const grid = new Uint8Array(gw * gh);
      const mark = (q) => { const x0 = Math.max(0, Math.floor((q.left - rb.left) / G)), x1 = Math.min(gw, Math.ceil((q.right - rb.left) / G)), y0 = Math.max(0, Math.floor((q.top - rb.top) / G)), y1 = Math.min(gh, Math.ceil((q.bottom - rb.top) / G)); for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) grid[y * gw + xx] = 1; };
      const visible = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
      const realImg = (im) => im.naturalWidth > 4 && !/^data:image\/gif/.test(im.getAttribute('src') || '') && !/\.svg/.test(im.getAttribute('src') || '');
      const imgs = Array.from(rootEl.querySelectorAll('img'));
      let photoN = 0;
      for (const im of imgs) { const q = im.getBoundingClientRect(); if (q.width * q.height > 900 && realImg(im) && visible(im)) { mark(q); photoN++; } }
      // background-image photos the layout itself draws (not the scenario bg theme on the root)
      for (const e of rootEl.querySelectorAll('div')) { const st = e.getAttribute('style') || ''; if (/url\(/.test(st) && !/data:image\/svg/.test(st)) { const q = e.getBoundingClientRect(); if (q.width * q.height > 900) { mark(q); photoN++; } } }
      if (!bg && /url\(/.test(rootEl.getAttribute('style') || '')) mark(rb);
      let nf = 0; for (const v of grid) nf += v; const pfReal = Math.round(nf / (gw * gh) * 100) / 100;
      // image slots
      const slots = Array.from(rootEl.querySelectorAll('[data-img]')).map((e) => {
        const im = e.tagName === 'IMG' ? e : e.querySelector('img');
        const q = e.getBoundingClientRect();
        return { i: e.getAttribute('data-img'), w: Math.round(q.width), h: Math.round(q.height), filled: !!(im && realImg(im)), hint: (e.getAttribute('data-hint') || e.getAttribute('alt') || (e.querySelector('span') || {}).textContent || '').slice(0, 40), kind: e.getAttribute('data-kind') || '', fill: !!(im && im.getAttribute('data-fill')) };
      }).filter((z) => z.w * z.h > 400);
      // unfilled picture placeholders drawn as text boxes
      const ph = [];
      for (const e of rootEl.querySelectorAll('div,span')) {
        if (e.closest('[data-img]')) continue;
        if (e.querySelector('img')) continue;
        const own = Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('').trim();
        const q = e.getBoundingClientRect();
        if (own && own.length < 40 && /사진|이미지|조감도|렌더|컷|전경|PHOTO|IMAGE|로고/i.test(own) && q.width > 100 && q.height > 60 && visible(e)) ph.push({ text: own, w: Math.round(q.width), h: Math.round(q.height), tb: e.getAttribute('data-tb') || (e.closest('[data-tb]') || { getAttribute: () => '' }).getAttribute('data-tb') });
      }
      // text overflow
      const over = [];
      for (const e of rootEl.querySelectorAll('[data-tb]')) {
        if (!visible(e) || !e.textContent.trim()) continue;
        const sw = e.scrollWidth - e.clientWidth, sh = e.scrollHeight - e.clientHeight;
        const q = e.getBoundingClientRect();
        const outside = q.right > rb.right + 1 || q.bottom > rb.bottom + 1;
        if (sw > 1 || sh > 1 || outside) over.push({ tb: e.getAttribute('data-tb'), sw, sh, t: e.textContent.trim().slice(0, 30) });
      }
      const tbs = rootEl.querySelectorAll('[data-tb]').length;
      const tw = H.twinsOf(l);
      return {
        f, name: l.name, p: l.p, p2: l.p2, c: l.c, pf: l.pf, ind: l.ind || null, retired: H.RETIRED[f] || null, photoFirst: H.isPhotoFirst(l),
        twins: tw.photo.map((y) => ({ f: y.f, name: y.name, pf: y.pf, ind: y.ind || null })),
        fillF: fill ? fill.f : null, fillMatch: !!fill && fill.f === f, nT: Object.keys(ov.t || {}).length, nImg: Object.keys(ov.img || {}).length, tbs,
        imgKeys: Object.keys(ov.img || {}), bg: !!bg, pfReal, photoN, slots, ph, over, role: x.role, stage: x.stage.key,
      };
    }, { id: sc.id, k });
    r.id = sc.id; r.k = k;
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `${sc.id}-${String(k).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 70, clip: { x: 0, y: 0, width: 1280, height: 720 } });
    out.push(r);
  }
  console.log(sc.id, sc.n);
}
fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
await browser.close(); srv.close();
