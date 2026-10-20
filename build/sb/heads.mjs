// per slide: headline (largest text near top) + eyebrow + all text → rv/heads.json
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '/home/claude/bs'; const dist = path.join(root, 'dist');
const srv = http.createServer((q, r) => { const f = path.join(dist, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.png') ? 'image/png' : 'image/jpeg' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, ok));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${srv.address().port}/_h.html`); await page.waitForFunction(() => window.H); await page.evaluate(() => window.H.loadLayoutHtml());
const only = process.argv.slice(2);
const out = await page.evaluate((only) => {
  const H = window.H; const res = {};
  for (const s of H.SCENARIOS) {
    if (only.length && !only.includes(s.id)) continue;
    res[s.id] = H.slidesOfScenario(s).map((x, k) => {
      const ov = H.fillOf(s.id, k, x.f);
      const st = document.getElementById('stage'); st.innerHTML = H.layoutHtml(x.f); const r = st.firstElementChild; if (!r) return { f: x.f, k };
      H.applyOverrides(r, ov, k + 1);
      const rb = r.getBoundingClientRect();
      const tbs = Array.from(r.querySelectorAll('[data-tb]')).map((e) => { const q = e.getBoundingClientRect(); return { i: e.getAttribute('data-tb'), t: e.textContent.replace(/\s+/g, ' ').trim(), fs: parseFloat(getComputedStyle(e).fontSize), y: q.top - rb.top, x: q.left - rb.left }; }).filter((z) => z.t);
      const top = tbs.filter((z) => z.y < 260 && z.t.length > 6);
      const hl = top.sort((a, b) => b.fs - a.fs)[0] || null;
      const eb = tbs.filter((z) => z.y < 120 && z.fs <= 15 && /·|[A-Z]{3,}/.test(z.t))[0] || null;
      return { k, f: x.f, stage: x.stage.name, role: x.role, hl: hl && hl.t, hlI: hl && hl.i, eb: eb && eb.t, ebI: eb && eb.i, txt: tbs.map((z) => z.t).join(' | ').slice(0, 600) };
    });
  }
  return res;
}, only);
fs.writeFileSync('/home/claude/rv/heads.json', JSON.stringify(out, null, 1));
for (const [id, a] of Object.entries(out)) { console.log('==', id); for (const z of a) console.log(z.k, z.f, '[' + z.stage + ']', '•', z.hl, ' ‹' + (z.eb || '') + '›'); }
await browser.close(); srv.close();
