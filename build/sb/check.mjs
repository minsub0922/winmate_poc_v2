// Storyboard 재구성 검사 — node build/sb/check.mjs [bsNN …]  (dist/_h.html 하네스 필요: node build/bs/mkharness.mjs)
// 장마다: 글 넘침 · 칸 밖 · 겹침(레이아웃 예시 값에서도 생기는 것 제외) · 빈 사진 칸 · 자리표시 · 다른 고객 이름 · 해상도 부족
// 덱마다: 같은 사진 두 번(제품 컷 · 워드마크 · 목차 썸네일 제외) · 장 머리말 번호가 파트 순서와 맞는지
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const only = process.argv.slice(2);
const srv = http.createServer((q, r) => { const f = path.join(dist, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.png') ? 'image/png' : 'image/jpeg' }); fs.createReadStream(f).pipe(r); });
await new Promise((ok) => srv.listen(0, ok));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${srv.address().port}/_h.html`); await page.waitForFunction(() => window.H);
await page.addScriptTag({ path: path.join(root, 'build/bs/measure.js') });
await page.evaluate(() => window.H.loadLayoutHtml());
const FOREIGN = /(?<![A-Za-z가-힣])([A-Z]) (커피|호텔|빌딩|리테일|대학교|은행|요양병원|제조|경기장|미디어|체인|테마파크|건설|지자체|백화점|비즈니스|병원|통신사|스터디카페|쇼핑몰|공단|스크린골프|마트|베이커리|그룹|교통공사|리조트|프랜차이즈|아울렛|면세점|물류|공항|카페)(?![가-힣])/g;
const PH = /\[[^\[\]\n]{0,16}\]|〇〇|○○|XX/;
const ids = await page.evaluate(() => window.H.SCENARIOS.map((s) => s.id));
let total = 0;
const base = {};
for (const sid of ids) {
  if (only.length && !only.includes(sid)) continue;
  const info = await page.evaluate((sid) => { const H = window.H; const s = H.SCENARIOS.find((x) => x.id === sid); return { cust: H.FILL_CUSTOMER[sid], slides: H.slidesOfScenario(s).map((x) => ({ f: x.f, stage: x.stage.name, stageIdx: s.flow.indexOf(x.stage) })), flowCover: s.flow.map((g) => g.slides.every((y) => /^표지/.test((H.L[y.f] || {}).name || '') && (H.L[y.f] || {}).p === 'cover')) }; }, sid);
  const used = {}; const out = [];
  for (const [k, x] of info.slides.entries()) {
    const render = (ov, kk) => page.evaluate(async ({ f, ov, kk, sid }) => {
      const H = window.H; const st = document.getElementById('stage'); st.innerHTML = H.layoutHtml(f); const r = st.firstElementChild; if (!r) return null;
      H.applyOverrides(r, ov || H.fillOf(sid, kk, f), kk == null ? null : kk + 1); await H.fillReady(r);
      if (kk != null) { const b = H.bgOfSlide(sid, kk); if (b) { await H.loadBg(b.src); H.applyOverrides(r, { bg: b }, kk + 1); } }
      await Promise.all(Array.from(r.querySelectorAll('img')).map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; setTimeout(ok, 4000); })));
      await new Promise((ok) => setTimeout(ok, 30));
      return window.MEASURE(r);
    }, { f: x.f, ov, kk, sid });
    if (!base[x.f]) base[x.f] = await render({ t: {}, img: {} }, null);
    const m = await render(null, k);
    const errs = [];
    const bk = new Set(base[x.f].issues.map((z) => z.type + ':' + z.tb));
    for (const z of m.issues) if (!bk.has(z.type + ':' + z.tb)) errs.push({ slide: '슬라이드 밖', clip: '칸에서 잘림', escape: '카드 밖으로 넘침', overlap: '글 겹침' }[z.type] + ' t' + z.tb);
    for (const t of m.texts) {
      const hits = [...t.t.matchAll(FOREIGN)].map((y) => y[0]).filter((y) => y !== info.cust);
      if (hits.length) errs.push(`다른 고객 이름 "${hits[0]}" ${t.tb != null ? 't' + t.tb : '(고정 글)'}`);
      if (PH.test(t.t)) errs.push(`자리표시 "${t.t.slice(0, 24)}"`);
    }
    for (const z of m.slots) {
      if (!z.filled) errs.push(`빈 사진 칸 img${z.i}`);
      else if (z.fit === 'cover' && z.nw && (z.nw < z.w * 0.6 || z.nh < z.h * 0.6)) errs.push(`해상도 부족 img${z.i} (${z.nw}×${z.nh} → ${z.w}×${z.h})`);
      if (z.src && x.f !== 'L_C10') (used[z.src] = used[z.src] || []).push(k);
    }
    // eyebrow chapter number = visible part order
    const eb = m.texts.find((t) => /^\d{2} · /.test(t.t));
    const ch = info.flowCover.slice(0, x.stageIdx + 1).filter((c) => !c).length;
    if (eb && !['bs11', 'bs21'].includes(sid) && +eb.t.slice(0, 2) !== ch) errs.push(`머리말 번호 ${eb.t.slice(0, 2)} ≠ 파트 ${ch}`);
    if (errs.length) out.push(`  ${k} ${x.f} [${x.stage}] ` + errs.join(' · '));
    total += errs.length;
  }
  const dup = Object.entries(used).filter(([src, a]) => new Set(a).size > 1 && !/\/p-|cut\.json|wordmark|\.png$|ais-a\.json#6/.test(src));
  for (const [src, a] of dup) { out.push(`  ↻ ${src} — 장 ${[...new Set(a)].join(', ')}`); total++; }
  console.log(`# ${sid} ${info.cust} ${info.slides.length}장` + (out.length ? '\n' + out.join('\n') : ' ok'));
}
console.log('TOTAL', total);
await browser.close(); srv.close();
