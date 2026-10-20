// PPTX → Winmate 템플릿 복원 정확도: LibreOffice 렌더(기준)와 변환 결과(Chromium)를 장마다 나란히 놓고 차이를 잰다.
// node build/my/fidelity.mjs <out dir> <a.pptx> [b.pptx …]   → <out>/<파일>-<n>.png (왼쪽 기준 | 오른쪽 변환) · report.json
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const [outDir, ...files] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const js = (await build({ stdin: { contents: "import { convertPptx } from './src/my/pptx2html.js'; window.convertPptx = convertPptx;", resolveDir: path.resolve(here, '../..'), loader: 'js' }, bundle: true, write: false, format: 'iife', logLevel: 'error' })).outputFiles[0].text;
const page0 = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#888}#stage{width:1280px;height:720px;position:relative;overflow:hidden;background:#fff}</style><div id="stage"></div><script>${js.replace(/<\/script/g, '<\\/script')}</script>`;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(page0); }
  const f = files.find((x) => '/f/' + path.basename(x) === u);
  if (!f) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
}).listen(0);
const PORT = srv.address().port;
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:' + PORT + '/');
const report = [];
const tmp = path.join(outDir, '_ref'); fs.mkdirSync(tmp, { recursive: true });
for (const f of files) {
  const base = path.basename(f).replace(/\.pptx$/i, '');
  // reference
  let refs = [];
  try {
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tmp, f], { stdio: 'ignore', timeout: 180000 });
    const pdf = path.join(tmp, path.basename(f).replace(/\.pptx$/i, '.pdf'));
    execFileSync('pdftoppm', ['-png', '-scale-to-x', '1280', '-scale-to-y', '-1', pdf, path.join(tmp, base)], { stdio: 'ignore' });
    refs = fs.readdirSync(tmp).filter((x) => x.startsWith(base + '-') && x.endsWith('.png')).sort((a, b) => Number(a.match(/-(\d+)\.png$/)[1]) - Number(b.match(/-(\d+)\.png$/)[1])).map((x) => path.join(tmp, x));
  } catch (e) { console.log('ref failed', base, e.message); }
  const t0 = Date.now();
  const info = await page.evaluate(async (url) => {
    const buf = await (await fetch(url)).arrayBuffer();
    const r = await window.convertPptx(buf);
    const urls = {}; for (const [k, b] of r.images) urls[k] = URL.createObjectURL(b);
    window.__R = { r, urls };
    return { n: r.slides.length, warnings: r.warnings, mode: r.mode, ratio: r.ratio, slides: r.slides.map((s) => ({ title: s.title, nT: s.nT, nI: s.nI, pf: s.pf, len: s.html.length })) };
  }, '/f/' + path.basename(f));
  const ms = Date.now() - t0;
  console.log(base, info.n + '장', ms + 'ms', info.warnings.join(' | '));
  for (let i = 0; i < info.n; i++) {
    await page.evaluate(async (i) => {
      const { r, urls } = window.__R;
      const st = document.getElementById('stage');
      st.innerHTML = r.slides[i].html.replace(/wmimg:([\w-]+)/g, (m, t) => urls[t] || m);
      await Promise.all(Array.from(st.querySelectorAll('img')).map((im) => (im.complete ? 1 : new Promise((res) => { im.onload = im.onerror = res; }))));
      await document.fonts.ready;
    }, i);
    await page.waitForTimeout(60);
    const ours = await page.locator('#stage').screenshot();
    const out = path.join(outDir, base + '-' + (i + 1) + '.png');
    let diff = null;
    if (refs[i]) {
      // the slide's own area (a 4:3 deck sits in the middle of the 16:9 canvas)
      const cw = Math.round(Math.min(1280, 720 * info.ratio)), chh = Math.round(Math.min(720, 1280 / info.ratio));
      const area = { left: Math.round((1280 - cw) / 2), top: Math.round((720 - chh) / 2), width: cw, height: chh };
      const refC = await sharp(refs[i]).resize(cw, chh, { fit: 'fill' }).png().toBuffer();
      const ref = await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#808080' } }).composite([{ input: refC, left: area.left, top: area.top }]).png().toBuffer();
      const a = await sharp(refC).resize(320, Math.round(320 * chh / cw), { fit: 'fill' }).greyscale().blur(1.2).raw().toBuffer();
      const b = await sharp(ours).extract(area).resize(320, Math.round(320 * chh / cw), { fit: 'fill' }).greyscale().blur(1.2).raw().toBuffer();
      let s = 0; for (let j = 0; j < a.length; j++) s += Math.abs(a[j] - b[j]);
      diff = Math.round((s / a.length) * 100) / 100;
      await sharp({ create: { width: 2580, height: 720, channels: 3, background: '#222' } }).composite([{ input: ref, left: 0, top: 0 }, { input: ours, left: 1300, top: 0 }]).png().toFile(out);
    } else fs.writeFileSync(out, ours);
    report.push({ file: base, n: i + 1, diff, ...info.slides[i] });
  }
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
console.log(report.map((r) => r.file + ' #' + r.n + ' diff=' + r.diff + ' T' + r.nT + ' I' + r.nI + ' «' + (r.title || '').slice(0, 30) + '»').join('\n'));
if (errs.length) console.log('ERRORS', errs.slice(0, 10));
await browser.close(); srv.close();
