// 히스토리 케이스 한 벌 검사 — node build/hist/check.mjs <id> [--shots] [--only 3,7]
// 입력: build/hist/out/<id>.json  { deck:[slide], parts:[{act,type,name,items,layouts:[slide]}] } · slide = { f, status, t, img, r }
// 검사: 파트 구조(장 2~3 · 기승전결 순서) · 레이아웃 있음 · RETIRED 아님 · 글 넘침/잘림/겹침 · 빈 사진 칸 · 자리표시 · 다른 고객 이름 ·
//       done 장: 모든 의미 단위 입력(예시 그대로 0) · 예시 글 그대로 남은 칸 · partial/empty 상태 맞음 · 덱 안 같은 사진 · 해상도 · 대장 밖 숫자(확인)
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const args = process.argv.slice(2);
const id = args[0]; const shots = args.includes('--shots');
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',').map(Number) : null;
const OUT = JSON.parse(fs.readFileSync(path.join(root, 'build/hist/out', id + '.json'), 'utf8'));
const LED = JSON.parse(fs.readFileSync(path.join(root, 'build/hist/ledger', id + '.json'), 'utf8'));
const LAY = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, 'build/hist/layouts.json'), 'utf8')).map((l) => [l.f, l]));
const cust = LED.customer;
const allowed = new Set(LED.nums);
for (const x of OUT.ledger || []) for (const m of String(x.n).matchAll(/\d[\d,]*(?:\.\d+)?/g)) { const v = m[0].replace(/,/g, ''); allowed.add(v); allowed.add(v.replace(/^0+(?=\d)/, '')); }
// agent-added photos → dist/img/hist
const nd = path.join(root, 'build/hist/newimg');
if (fs.existsSync(nd)) { fs.mkdirSync(path.join(dist, 'img/hist'), { recursive: true }); for (const f of fs.readdirSync(nd)) if (/\.(jpg|png)$/.test(f)) fs.copyFileSync(path.join(nd, f), path.join(dist, 'img/hist', f)); }
const slides = [];
(OUT.deck || []).forEach((x, j) => slides.push({ ...x, where: 'deck' + j, part: '표지(deck)' }));
const errsTop = [];
const ACTS = ['기', '승', '전', '결'];
let lastAct = 0;
(OUT.parts || []).forEach((s, pi) => {
  const n = (s.layouts || []).length;
  if (n < 2 || n > 3) errsTop.push(`파트 ${pi + 1} "${s.name}" 장 ${n}개 (2~3장이어야 함)`);
  const a = ACTS.indexOf(s.act); if (a < 0) errsTop.push(`파트 ${pi + 1} act 없음/틀림 "${s.act}"`); else { if (a < lastAct) errsTop.push(`파트 ${pi + 1} "${s.name}" ${s.act} — 기승전결 순서가 거꾸로`); lastAct = Math.max(lastAct, a); }
  if (!s.items || !s.items.length) errsTop.push(`파트 ${pi + 1} items 없음`);
  (s.layouts || []).forEach((x, j) => slides.push({ ...x, where: `${pi + 1}.${j + 1}`, part: s.name, ptype: s.type }));
});
slides.forEach((s, k) => { s.k = k; });
const srv = http.createServer((q, r) => {
  const f = path.join(dist, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const ct = f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.png') ? 'image/png' : 'image/jpeg'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => srv.listen(0, ok));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`http://localhost:${srv.address().port}/_h.html`);
await page.waitForFunction(() => window.H);
await page.addScriptTag({ path: path.join(root, 'build/bs/measure.js') });
await page.evaluate(() => window.H.loadLayoutHtml());
const render = async (f, ov, pageNo) => page.evaluate(async ({ f, ov, pageNo }) => {
  const H = window.H; const stage = document.getElementById('stage'); const html = H.layoutHtml(f); if (!html) return null;
  // units on a clean copy (app: readUnits)
  const host = document.createElement('div'); host.innerHTML = html; const units = H.markUnits(host.firstElementChild).filter((u) => !u.fixed);
  const sample = {}; host.querySelectorAll('[data-tb]').forEach((e) => { sample[e.getAttribute('data-tb')] = e.textContent.replace(/\s+/g, ' ').trim(); });
  stage.innerHTML = html; const r = stage.firstElementChild;
  H.applyOverrides(r, ov, pageNo); await H.fillReady(r);
  await Promise.all(Array.from(r.querySelectorAll('img')).map((im) => im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; setTimeout(ok, 5000); })));
  await document.fonts.ready; await new Promise((ok) => setTimeout(ok, 40));
  const m = window.MEASURE(r);
  // perceptual hash (dHash 8×8, luminance) of each slot photo — the same photo from another pack · a gray copy is the same photo
  const hashes = Array.from(r.querySelectorAll('[data-img]')).map((e) => {
    const im = e.tagName === 'IMG' ? e : e.querySelector('img');
    if (!im || im.naturalWidth < 5 || /^data:image\/gif/.test(im.getAttribute('src') || '')) return null;
    try {
      const c = document.createElement('canvas'); c.width = 9; c.height = 8; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 9, 8);
      const d = x.getImageData(0, 0, 9, 8).data; let bits = '';
      for (let y = 0; y < 8; y++) for (let k = 0; k < 8; k++) { const a = (y * 9 + k) * 4, b = a + 4; bits += (d[a] * 0.3 + d[a + 1] * 0.59 + d[a + 2] * 0.11) > (d[b] * 0.3 + d[b + 1] * 0.59 + d[b + 2] * 0.11) ? '1' : '0'; }
      return { i: e.getAttribute('data-img'), h: bits, fit: getComputedStyle(im).objectFit };
    } catch (err) { return null; }
  }).filter(Boolean);
  return { ...m, hashes, units: units.map((u) => ({ key: u.key, ft: u.ft, imgs: u.imgs, isImg: u.isImg })), sample };
}, { f, ov, pageNo });
const FOREIGN = /(?<![A-Za-z가-힣])([A-Z]) ?(커피|호텔|빌딩|리테일|대학교|은행|요양병원|제조|경기장|미디어|체인|테마파크|건설|지자체|백화점|비즈니스|병원|통신사|스터디카페|쇼핑몰|공단|스크린골프|마트|베이커리|그룹|교통공사|리조트|프랜차이즈|아울렛|면세점|물류|공항|카페|로지스|버거|오피스|증권|키친|구단|패션|교육지원청|자산운용|시)(?![가-힣])/g;
const PH = /\[[^\[\]\n]{0,16}\]|\[0|0\]|〇〇|○○|XX|xx(?![a-z])|\[N\]|\bN\s?(개|곳|명|일|분|건)/;
const NUMX = /(?<![A-Za-z\d])\d[\d,]*(?:\.\d+)?/g;
const STRUCT = /^(0?\d|[1-9]\d?)$/; // 1~2자리 번호 · 단계
const used = {}; const HASHES = []; const report = []; let nErr = errsTop.length, nWarn = 0; const unknownNums = {};
const baseCache = {};
let pageNo = 0;
for (const s of slides) {
  pageNo++;
  if (onlyArg && !onlyArg.includes(s.k)) continue;
  const errs = [], warns = [];
  const L = LAY[s.f];
  if (!L) { errs.push('없는 레이아웃 ' + s.f); report.push({ s, errs, warns }); nErr++; continue; }
  if (L.retired) errs.push(`RETIRED 레이아웃 → ${L.retired} 로`);
  if (s.ptype && L.p !== s.ptype && L.p2 !== s.ptype) warns.push(`레이아웃 파트(${L.p}) ≠ 파트 유형(${s.ptype})`);
  if (!['done', 'partial', 'empty'].includes(s.status)) errs.push('status 틀림 ' + s.status);
  const ov = { t: s.t || {}, img: s.img || {}, ...(s.r && s.r.length ? { r: s.r } : {}) };
  if (!baseCache[s.f]) baseCache[s.f] = await render(s.f, {}, null);
  const base = baseCache[s.f];
  const m = await render(s.f, ov, pageNo);
  if (!m) { errs.push('렌더 실패'); report.push({ s, errs, warns }); nErr++; continue; }
  for (const i of Object.keys(ov.t)) if (!(i in m.sample)) errs.push(`없는 글 칸 t${i}`);
  // units touched
  const touched = (u) => u.isImg ? !!ov.img[u.imgs[0]] : u.ft.some((i) => ov.t[i] != null);
  const nu = m.units.length, nt = m.units.filter(touched).length;
  if (s.status === 'done' && nt < nu) errs.push(`done 인데 예시 그대로인 단위 ${nu - nt}개: ` + m.units.filter((u) => !touched(u)).map((u) => u.key).join(' '));
  if (s.status === 'empty' && (Object.keys(ov.t).length || Object.keys(ov.img).length)) errs.push('empty 인데 값이 있음');
  if (s.status === 'partial' && nt === 0) errs.push(`partial 인데 입력 단위 0/${nu}`);
  if (s.status === 'partial' && nt === nu) {
    // 모든 단위를 채운 '작성 중' 장은 남은 확인 항목이 글에 드러나야 함
    const all = Object.values(ov.t).map((v) => (typeof v === 'object' ? String(v.html || '') : String(v))).join(' ');
    if (/확인|실사 후|미정|작성|협의|^—$|—/.test(all)) warns.push(`partial · 모든 단위 입력 (확인 항목 표기 있음)`);
    else errs.push(`partial 인데 입력 단위 ${nt}/${nu} — 남은 확인 항목 표기 없음`);
  }
  if (s.status !== 'empty') {
    const bk = new Set(base.issues.map((x) => x.type + ':' + x.tb));
    for (const x of m.issues) if (!bk.has(x.type + ':' + x.tb)) errs.push({ slide: '슬라이드 밖', clip: '칸에서 잘림', escape: '카드 밖으로 넘침', overlap: '글 겹침' }[x.type] + ' t' + x.tb);
    // text of filled slots
    for (const [i, v] of Object.entries(ov.t)) {
      const txt = typeof v === 'object' ? String(v.html || '').replace(/<[^>]+>/g, '') : String(v);
      const hits = [...txt.matchAll(FOREIGN)].map((x) => x[0]).filter((x) => x !== cust && !cust.startsWith(x));
      if (hits.length) errs.push(`다른 고객 이름 "${hits[0]}" t${i}`);
      if (PH.test(txt)) errs.push(`자리표시 t${i} "${txt.slice(0, 30)}"`);
      for (const mm of txt.matchAll(NUMX)) {
        const raw = mm[0].replace(/[,.]$/, ''); const v2 = raw.replace(/,/g, '');
        if (STRUCT.test(v2)) continue;
        if (!allowed.has(v2) && !allowed.has(v2.replace(/^0+(?=\d)/, ''))) { (unknownNums[v2] = unknownNums[v2] || []).push(s.where + ':t' + i); }
      }
      if (/!|혁신적|획기적|최고의|완벽/.test(txt)) warns.push(`과장 · 느낌표 t${i} "${txt.slice(0, 24)}"`);
    }
    // sample text left (done: every non-fixed slot that still shows template text with digits/placeholder/other names)
    if (s.status === 'done') {
      const left = Object.keys(m.sample).filter((i) => ov.t[i] == null && m.sample[i] && !/^(CONFIDENTIAL · \d+|고객사 로고|LOGO|제안사 로고)$/.test(m.sample[i]) && (PH.test(m.sample[i]) || FOREIGN.test(m.sample[i]) || /\d/.test(m.sample[i]) || m.sample[i].length > 14));
      FOREIGN.lastIndex = 0;
      if (left.length) errs.push('예시 글 그대로 남은 칸: ' + left.slice(0, 10).map((i) => `t${i} "${m.sample[i].slice(0, 16)}"`).join(', '));
    }
    // fixed text with placeholders / other names (needs r)
    for (const t of m.texts) if (t.tb == null) { const hits = [...t.t.matchAll(FOREIGN)].map((x) => x[0]).filter((x) => x !== cust); if (hits.length || PH.test(t.t)) errs.push(`고정 글 "${t.t.slice(0, 24)}" → r 로 치환`); }
    for (const z of m.slots) {
      if (!z.filled) errs.push(`빈 사진 칸 img${z.i} (${z.w}×${z.h})`);
      else if (z.fit === 'cover' && z.nw && (z.nw < z.w * 0.6 || z.nh < z.h * 0.6)) warns.push(`해상도 부족 img${z.i} (${z.nw}×${z.nh} → ${z.w}×${z.h})`);
      if (z.white && !/\/p-|cut\.json|-front|-persp|prod\//.test(z.src)) warns.push(`흰 여백 의심 img${z.i} ${z.src.slice(0, 40)}`);
      if (z.src && ov.img[z.i]) (used[z.src] = used[z.src] || []).push(s.where + ':img' + z.i);
    }
    for (const p of m.pics) if (!p.ok && !/^data:image\/svg/.test(p.src)) errs.push('그림이 안 뜸 ' + p.src.slice(0, 40));
    for (const hh of m.hashes || []) { const v = ov.img[hh.i]; if (v && v.src && hh.fit !== 'contain' && !/\/p-|cut\.json|-front\.png|-persp\.png|prod\//.test(v.src)) HASHES.push({ where: s.where + ':img' + hh.i, src: v.src, h: hh.h }); }
    for (const [i, v] of Object.entries(ov.img)) if (v && v.src && !/^img\//.test(v.src)) errs.push(`사진 주소 형식 img${i} ${v.src.slice(0, 30)}`);
  }
  nErr += errs.length; nWarn += warns.length;
  report.push({ s, errs, warns });
  if (shots) { fs.mkdirSync(path.join(root, 'build/hist/check', id), { recursive: true }); await page.screenshot({ path: path.join(root, 'build/hist/check', id, String(s.k).padStart(2, '0') + '.jpg'), type: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: 1280, height: 720 } }); }
}
const dup = Object.entries(used).filter(([src, a]) => a.length > 1 && !/\/p-|cut\.json|-front\.png|-persp\.png|wordmark|prod\//.test(src));
// same photo under different addresses (another pack, a gray / brightened copy): Hamming distance of dHash ≤ 6
const ham = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
for (let a = 0; a < HASHES.length; a++) for (let b = a + 1; b < HASHES.length; b++) {
  const A = HASHES[a], B = HASHES[b]; if (A.src === B.src) continue;
  if (ham(A.h, B.h) <= 6) dup.push([`${A.src} ≈ ${B.src} (비슷한 사진)`, [A.where, B.where]]);
}
console.log(`# ${id} ${cust} — 파트 ${(OUT.parts || []).length} · 장 ${slides.length} — 오류 ${nErr + dup.length} · 확인 ${nWarn}`);
for (const e of errsTop) console.log('  ✗ ' + e);
for (const r of report) {
  const tag = `${r.s.k} [${r.s.where}] ${r.s.f} ${r.s.status} · ${r.s.part}`;
  if (!r.errs.length && !r.warns.length) { console.log(tag + ' ok'); continue; }
  console.log(tag);
  for (const e of r.errs) console.log('  ✗ ' + e);
  for (const w of r.warns) console.log('  · ' + w);
}
for (const [src, a] of dup) console.log(`  ✗ 같은 사진 여러 번: ${src} — ${a.join(', ')}`);
const un = Object.entries(unknownNums);
if (un.length) { console.log('  ? 대장 밖 숫자(근거 확인 → 빼거나 ledger 에 출처 추가):'); for (const [n, w] of un) console.log(`     ${n} — ${w.slice(0, 6).join(', ')}`); }
fs.mkdirSync(path.join(root, 'build/hist/check'), { recursive: true });
fs.writeFileSync(path.join(root, 'build/hist/check', id + '.json'), JSON.stringify({ errs: nErr + dup.length, warns: nWarn, unknown: unknownNums, report: report.map((r) => ({ k: r.s.k, where: r.s.where, f: r.s.f, status: r.s.status, errs: r.errs, warns: r.warns })) }, null, 1));
await browser.close(); srv.close();
if (shots) {
  const { execSync } = await import('node:child_process');
  execSync(`python3 ${path.join(root, 'build/hist/sheet.py')} ${id}`, { stdio: 'inherit', cwd: root });
}
