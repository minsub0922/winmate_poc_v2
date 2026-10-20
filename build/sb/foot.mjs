// per scenario: footer texts (y>660) of each slide + C13 image info (natural size)
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '/home/claude/bs'; const dist = path.join(root, 'dist');
const srv = http.createServer((q, r) => { const f = path.join(dist, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.png') ? 'image/png' : 'image/jpeg' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, ok));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${srv.address().port}/_h.html`); await page.waitForFunction(() => window.H); await page.evaluate(() => window.H.loadLayoutHtml());
const out = {};
for (const id of await page.evaluate(() => window.H.SCENARIOS.map((s) => s.id))) {
  out[id] = await page.evaluate(async (id) => {
    const H = window.H; const s = H.SCENARIOS.find((x) => x.id === id); const res = [];
    for (const [k, x] of H.slidesOfScenario(s).entries()) {
      const ov = H.fillOf(id, k, x.f); const st = document.getElementById('stage'); st.innerHTML = H.layoutHtml(x.f); const r = st.firstElementChild; if (!r) continue;
      H.applyOverrides(r, ov, k + 1); await H.fillReady(r);
      await Promise.all(Array.from(r.querySelectorAll('img')).map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; setTimeout(ok, 3000); })));
      const rb = r.getBoundingClientRect();
      const foot = Array.from(r.querySelectorAll('[data-tb]')).map((e) => ({ i: e.getAttribute('data-tb'), t: e.textContent.trim(), y: e.getBoundingClientRect().top - rb.top })).filter((z) => z.y > 660 && z.t && !/^CONFIDENTIAL/.test(z.t));
      const imgs = x.f === 'L_PH_C13' || x.f === 'L_C12' ? Array.from(r.querySelectorAll('[data-img] img, img[data-img]')).map((im) => ({ src: im.getAttribute('data-fill') || im.getAttribute('src'), nw: im.naturalWidth, nh: im.naturalHeight })) : [];
      res.push({ k, f: x.f, foot, imgs });
    }
    return res;
  }, id);
}
fs.writeFileSync('/home/claude/rv/foot.json', JSON.stringify(out, null, 1));
for (const [id, a] of Object.entries(out)) {
  const c = {}; for (const z of a) for (const f of z.foot) if (f.t.length > 8) c[f.t] = (c[f.t] || 0) + 1;
  const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const logo = {}; for (const z of a) for (const f of z.foot) if (f.t.length <= 8) logo[f.t] = (logo[f.t] || 0) + 1;
  console.log(id, JSON.stringify(top), JSON.stringify(logo), JSON.stringify(a.filter((z) => z.imgs.length).map((z) => z.imgs)));
}
await browser.close(); srv.close();
