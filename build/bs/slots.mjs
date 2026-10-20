// 레이아웃 칸 목록 — node build/bs/slots.mjs [--json out.json] f1 f2 …  (@file 가능)
// 글 칸(data-tb): 번호 · 예시 글 · 위치 · 크기 · 글자 크기 · 줄 수 한도(대략) · 한 줄 글자 수(대략)
// 사진 칸(data-img): 번호 · 위치 · 크기 · 설명(hint) · 기본 사진(주소) · 칸 안 구조(사진만 / 캡션 등 함께)
// 고정 글(편집 칸이 아닌 글) 중 예시 고객 이름 · [자리표시]가 든 것 — r(치환)로 바꿔야 하는 것
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
let args = process.argv.slice(2); let jsonOut = null;
if (args[0] === '--json') { jsonOut = args[1]; args = args.slice(2); }
if (args.length === 1 && args[0].startsWith('@')) args = fs.readFileSync(args[0].slice(1), 'utf8').split(/\s+/).filter(Boolean);
const srv = http.createServer((q, r) => {
  const f = path.join(dist, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const ct = f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.png') ? 'image/png' : 'image/jpeg'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => srv.listen(0, ok));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${srv.address().port}/_h.html`);
await page.waitForFunction(() => window.H);
await page.evaluate(() => window.H.loadLayoutHtml());
if (process.env.EXTRA) { const X = JSON.parse(fs.readFileSync(process.env.EXTRA, 'utf8')); await page.evaluate((X) => window.H.loadLayoutHtml().then((h) => Object.assign(h, X)), X); }
const all = {};
for (const f of args) {
  const r = await page.evaluate((f) => {
    const H = window.H; const stage = document.getElementById('stage'); stage.innerHTML = H.layoutHtml(f);
    const root = stage.firstElementChild; if (!root) return null;
    H.applyOverrides(root, {}, null);
    const rb = root.getBoundingClientRect();
    const rel = (q) => ({ x: Math.round(q.left - rb.left), y: Math.round(q.top - rb.top), w: Math.round(q.width), h: Math.round(q.height) });
    const tbs = Array.from(root.querySelectorAll('[data-tb]')).map((e) => {
      const cs = getComputedStyle(e); const fs = parseFloat(cs.fontSize); const lh = cs.lineHeight === 'normal' ? fs * 1.45 : parseFloat(cs.lineHeight);
      const q = rel(e.getBoundingClientRect());
      const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' ? +cs.webkitLineClamp : null;
      const nowrap = cs.whiteSpace === 'nowrap';
      // lines it holds now
      const rng = document.createRange(); rng.selectNodeContents(e); const lines = new Set(Array.from(rng.getClientRects()).map((r) => Math.round(r.top))).size;
      const fixedW = /(^|;)\s*width:/.test(e.getAttribute('style') || '');
      return { i: +e.getAttribute('data-tb'), text: e.textContent.replace(/\s+/g, ' ').trim(), ...q, fs, lh: Math.round(lh * 10) / 10, lines, clamp, nowrap, bold: +cs.fontWeight >= 600, color: cs.color, cpl: Math.max(1, Math.floor(q.w / (fs * 0.98))), fixedW, html: e.children.length > 0 && Array.from(e.children).some((c) => c.tagName === 'BR') };
    });
    const imgs = Array.from(root.querySelectorAll('[data-img]')).map((e) => {
      const im = e.tagName === 'IMG' ? e : e.querySelector('img');
      const extra = e.tagName === 'IMG' ? 0 : Array.from(e.querySelectorAll('*')).filter((x) => x !== im && x.textContent.trim()).length;
      return { i: e.getAttribute('data-img'), ...rel(e.getBoundingClientRect()), hint: e.getAttribute('data-hint') || '', kind: e.getAttribute('data-kind') || '', pid: e.getAttribute('data-pid') || (im && im.getAttribute('data-pid')) || '', src: im ? (im.getAttribute('data-fill') || im.getAttribute('src') || '') : '', fit: im ? im.style.objectFit : '', pos: im ? im.style.objectPosition : '', wrapper: e.tagName !== 'IMG', withText: extra };
    });
    // fixed text (not in data-tb) — for r replacements
    const fixed = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; const t = n.nodeValue.trim(); if (!t || n.parentElement.closest('[data-tb]')) continue; fixed.push(t); }
    return { f, name: (H.L[f] || {}).name, tbs, imgs, fixed };
  }, f);
  all[f] = r;
  if (!jsonOut) {
    if (!r) { console.log('## ' + f + ' — 없음'); continue; }
    console.log(`\n## ${f} · ${r.name}`);
    console.log('글 칸: i | 예시 글 | x,y w×h | 글자px | 지금 줄 | 한 줄 글자(대략) | 비고');
    for (const t of r.tbs) console.log(`t${t.i} | ${t.text.slice(0, 70)} | ${t.x},${t.y} ${t.w}×${t.h} | ${t.fs} | ${t.lines}${t.clamp ? ' (최대 ' + t.clamp + '줄)' : ''} | ~${t.cpl} | ${t.nowrap ? '한 줄 고정 ' : ''}${t.bold ? '굵게' : ''}${t.html ? ' <br> 있음' : ''}`);
    console.log('사진 칸: i | x,y w×h | 설명 | 기본 사진 | 구조');
    for (const m of r.imgs) console.log(`img${m.i} | ${m.x},${m.y} ${m.w}×${m.h} | ${m.hint.slice(0, 50)} | ${m.src.slice(0, 60)} | ${m.wrapper ? (m.withText ? '칸 안에 글 있음 → keep:true' : '틀 + 사진') : '사진 자체'}`);
    if (r.fixed.length) console.log('고정 글: ' + r.fixed.join(' ¦ ').slice(0, 600));
  }
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(all));
await browser.close(); srv.close();
