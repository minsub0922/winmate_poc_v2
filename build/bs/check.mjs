// 시나리오 한 벌 검사 — node build/bs/check.mjs <bsNN> [--shots] [--only k,k]
// 채운 값: build/bs/out/<bsNN>.json 의 { "<k>": { f, t, img, r } } (없는 장은 원래 FILLS) · 계획: build/bs/plan.json
// 검사: 글 넘침 · 칸 밖 · 겹침(레이아웃 예시 값에서도 생기는 것은 빼고) · 빈 사진 칸 · 자리표시([00] 등) 남음 · 다른 고객 이름 · 덱 안 같은 사진 두 번 · 해상도 부족
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const args = process.argv.slice(2);
const sid = args[0]; const shots = args.includes('--shots');
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null;
const D = JSON.parse(fs.readFileSync(path.join(root, 'build/bs/data.json'), 'utf8'));
const PLAN = JSON.parse(fs.readFileSync(path.join(root, 'build/bs/plan.json'), 'utf8'));
const outF = path.join(root, 'build/bs/out', sid + '.json');
const OUT = fs.existsSync(outF) ? JSON.parse(fs.readFileSync(outF, 'utf8')) : {};
// agent-added photos → dist/img/bsn
const nd = path.join(root, 'build/bs/newimg');
if (fs.existsSync(nd)) { fs.mkdirSync(path.join(dist, 'img/bsn'), { recursive: true }); for (const f of fs.readdirSync(nd)) if (/\.(jpg|png)$/.test(f)) fs.copyFileSync(path.join(nd, f), path.join(dist, 'img/bsn', f)); }
const sc = D.scenarios.find((s) => s.id === sid); if (!sc) { console.log('no scenario', sid); process.exit(1); }
const cust = D.customer[sid];
const plan = PLAN[sid];
const slides = sc.slides.map((x, k) => {
  const o = OUT[k] || OUT[String(k)];
  const p = plan[k];
  if (o) return { k, f: o.f, ov: { t: o.t || {}, img: o.img || {}, ...(o.r ? { r: o.r } : {}) }, changed: true, want: p.to, role: x.role };
  const fl = D.fills[sid][k];
  return { k, f: x.f, ov: { t: fl.t || {}, img: fl.img || {}, ...(fl.r ? { r: fl.r } : {}) }, changed: false, want: p.to, role: x.role };
});
const srv = http.createServer((q, r) => {
  const f = path.join(dist, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const ct = f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.png') ? 'image/png' : 'image/jpeg'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => srv.listen(0, ok));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${srv.address().port}/_h.html`);
await page.waitForFunction(() => window.H);
await page.addScriptTag({ path: path.join(root, 'build/bs/measure.js') });
await page.evaluate(() => window.H.loadLayoutHtml());
const render = async (f, ov, k, bg) => page.evaluate(async ({ f, ov, k, bg }) => {
  const H = window.H; const stage = document.getElementById('stage'); stage.innerHTML = H.layoutHtml(f);
  const r = stage.firstElementChild; if (!r) return null;
  H.applyOverrides(r, ov, k == null ? null : k + 1); await H.fillReady(r);
  if (bg) { const b = H.bgOfSlide(bg, k); if (b) { await H.loadBg(b.src); H.applyOverrides(r, { bg: b }, k + 1); } }
  await Promise.all(Array.from(r.querySelectorAll('img')).map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; setTimeout(ok, 5000); })));
  await document.fonts.ready; await new Promise((ok) => setTimeout(ok, 40));
  return window.MEASURE(r);
}, { f, ov, k, bg });
const FOREIGN = /(?<![A-Za-z가-힣])([A-Z]) (커피|호텔|빌딩|리테일|대학교|은행|요양병원|제조|경기장|미디어|체인|테마파크|건설|지자체|백화점|비즈니스|병원|통신사|스터디카페|쇼핑몰|공단|스크린골프|마트|베이커리|그룹|교통공사|리조트|프랜차이즈|아울렛|면세점|물류|공항|카페)(?![가-힣])/g;
const PH = /\[[^\[\]\n]{0,16}\]|\[0|0\]|〇〇|○○|XX|xx(?![a-z])/;
const baseCache = {};
const report = []; const used = {};
let nErr = 0, nWarn = 0;
for (const s of slides) {
  if (onlyArg && !onlyArg.includes(s.k)) continue;
  if (!baseCache[s.f]) baseCache[s.f] = await render(s.f, {}, null, null);
  const base = baseCache[s.f];
  const m = await render(s.f, s.ov, s.k, sid);
  const errs = [], warns = [];
  if (!m) { errs.push('레이아웃 없음 ' + s.f); report.push({ k: s.k, f: s.f, errs, warns }); nErr++; continue; }
  if (s.want && s.changed && s.f !== s.want) warns.push(`계획한 레이아웃(${s.want})과 다름`);
  const LEAD = ['L_PH_SD_G', 'L_PH_QA_A', 'L_PH_AIS_08', 'L_PH_AIS_25', 'L_PH_AIS_26', 'L_PH_AIS_35'];
  if (s.want && !s.changed) { if (LEAD.includes(s.want)) warns.push('리드가 처리할 장 (' + s.want + ') — 신경 쓰지 않아도 됨'); else errs.push(`아직 안 바꿈 → ${s.want}`); }
  const bk = new Set(base.issues.map((x) => x.type + ':' + x.tb));
  for (const x of m.issues) if (!bk.has(x.type + ':' + x.tb)) errs.push({ slide: '슬라이드 밖', clip: '칸에서 잘림', escape: '카드 밖으로 넘침', overlap: '글 겹침' }[x.type] + ' t' + x.tb);
  const baseTexts = {}; for (const t of base.texts) if (t.tb != null) baseTexts[t.tb] = (baseTexts[t.tb] || '') + t.t;
  const nowTexts = {}; for (const t of m.texts) if (t.tb != null) nowTexts[t.tb] = (nowTexts[t.tb] || '') + t.t;
  for (const t of m.texts) {
    const hits = [...t.t.matchAll(FOREIGN)].map((x) => x[0]).filter((x) => x !== cust);
    if (hits.length) errs.push(`다른 고객 이름 "${hits[0]}"` + (t.tb != null ? ` t${t.tb}` : ' (고정 글 → r 로 치환)'));
    if (PH.test(t.t)) errs.push(`자리표시 남음 "${t.t.slice(0, 24)}"` + (t.tb != null ? ` t${t.tb}` : ' (고정 글 → r)'));
  }
  if (s.changed) {
    const same = Object.keys(nowTexts).filter((i) => nowTexts[i] === baseTexts[i] && /\d|[A-Z] [가-힣]/.test(nowTexts[i]) && !/^(CONFIDENTIAL|고객사 로고|\d{1,2}$|0\d$)/.test(nowTexts[i]));
    if (same.length) warns.push('예시 글 그대로(확인): ' + same.slice(0, 8).map((i) => `t${i} "${nowTexts[i].slice(0, 18)}"`).join(', '));
  }
  for (const z of m.slots) {
    if (!z.filled) errs.push(`빈 사진 칸 img${z.i} (${z.w}×${z.h})`);
    else if (z.fit === 'cover' && z.nw && (z.nw < z.w * 0.6 || z.nh < z.h * 0.6)) warns.push(`해상도 부족 img${z.i} (${z.nw}×${z.nh} → ${z.w}×${z.h})`);
    if (z.white && !/\/p-|cut\.json/.test(z.src)) warns.push(`흰 여백 의심 img${z.i} (${z.white}) ${z.src.slice(0, 40)}`);
    if (z.src) (used[z.src] = used[z.src] || []).push(s.k + ':img' + z.i);
  }
  for (const p of m.pics) if (!p.ok && !/^data:image\/svg/.test(p.src)) errs.push('그림이 안 뜸 ' + p.src.slice(0, 40));
  nErr += errs.length; nWarn += warns.length;
  report.push({ k: s.k, f: s.f, changed: s.changed, errs, warns, nImg: m.slots.length });
  if (shots) { fs.mkdirSync(path.join(root, 'build/bs/check', sid), { recursive: true }); await page.screenshot({ path: path.join(root, 'build/bs/check', sid, String(s.k).padStart(2, '0') + '.jpg'), type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: 1280, height: 720 } }); }
}
const dup = Object.entries(used).filter(([src, a]) => a.length > 1 && !/\/p-|cut\.json|wordmark|bs\d\d-\d+-\d\.png/.test(src) && new Set(a.map((x) => x.split(':')[0])).size > 1);
console.log(`# ${sid} ${cust} — 오류 ${nErr} · 확인 ${nWarn}` + (dup.length ? ` · 같은 사진 여러 장 ${dup.length}` : ''));
for (const r of report) {
  if (!r.errs.length && !r.warns.length) { console.log(`${r.k} ${r.f} ok`); continue; }
  console.log(`${r.k} ${r.f}${r.changed ? '' : ' (원래 값)'}`);
  for (const e of r.errs) console.log('  ✗ ' + e);
  for (const w of r.warns) console.log('  · ' + w);
}
for (const [src, a] of dup) console.log(`  ↻ 같은 사진: ${src} — ${a.join(', ')}`);
fs.mkdirSync(path.join(root, 'build/bs/check'), { recursive: true });
fs.writeFileSync(path.join(root, 'build/bs/check', sid + '.json'), JSON.stringify({ report, dup }, null, 1));
await browser.close(); srv.close();
if (shots) {
  const { execSync } = await import('node:child_process');
  execSync(`python3 ${path.join(root, 'build/bs/sheet2.py')} ${sid}`, { stdio: 'inherit', cwd: root });
}
