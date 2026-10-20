// PPTX → My 템플릿 → (Winmate PPTX 내보내기) → PPTX: 원본과 내보낸 파일을 LibreOffice로 그려 나란히 둔다
// node build/my/roundtrip.mjs <out dir> <a.pptx> …
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const here = path.dirname(new URL(import.meta.url).pathname);
const [outDir, ...files] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const js = (await build({ stdin: { contents: `
import { convertPptx } from './src/my/pptx2html.js'; import { registerLayout } from './src/data.js'; import { exportPptx } from './src/pptx.js';
window.roundtrip = async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const r = await convertPptx(bin.buffer); const urls = {}; for (const [k, b] of r.images) urls[k] = URL.createObjectURL(b);
  r.slides.forEach((s, i) => registerLayout({ f: 'L_MY_rt' + i, name: s.title || 'p' + i, p: '' }, s.html.replace(/wmimg:([\\w-]+)/g, (m, t) => urls[t] || m)));
  const blob = await exportPptx(r.slides.map((s, i) => ({ f: 'L_MY_rt' + i, ov: { t: {}, img: {} } })));
  const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s);
};`, resolveDir: path.resolve(here, '../..'), loader: 'js' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.json': 'json' }, define: { 'process.env.NODE_ENV': '"production"', global: 'window' }, external: ['fs', 'https', 'image-size', 'node:fs', 'node:https'], logLevel: 'error' })).outputFiles[0].text;
const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-')).map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome').find((f) => fs.existsSync(f));
const browser = await chromium.launch({ executablePath: exe }); const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>'); await page.addScriptTag({ content: js });
const render = (f, tag) => { const d = path.join(outDir, '_' + tag); fs.mkdirSync(d, { recursive: true }); execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', d, f], { stdio: 'ignore', timeout: 180000 }); const pdf = path.join(d, path.basename(f).replace(/\.pptx$/i, '.pdf')); const base = path.join(d, 'p'); execFileSync('pdftoppm', ['-png', '-scale-to-x', '1280', '-scale-to-y', '-1', pdf, base]); return fs.readdirSync(d).filter((x) => /^p-\d+\.png$/.test(x)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]).map((x) => path.join(d, x)); };
for (const f of files) {
  const name = path.basename(f).replace(/\.pptx$/i, '');
  const b64 = await page.evaluate((b) => window.roundtrip(b), fs.readFileSync(f).toString('base64'));
  const outP = path.join(outDir, name + '.export.pptx'); fs.writeFileSync(outP, Buffer.from(b64, 'base64'));
  const A = render(f, name + '-orig'), B = render(outP, name + '-exp');
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const a = await sharp(A[i]).resize(1280, 720, { fit: 'contain', background: '#808080' }).png().toBuffer(), b = await sharp(B[i]).resize(1280, 720, { fit: 'contain', background: '#808080' }).png().toBuffer();
    await sharp({ create: { width: 2580, height: 720, channels: 3, background: '#222' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 1300, top: 0 }]).png().toFile(path.join(outDir, name + '-' + (i + 1) + '.png'));
  }
  console.log(name, A.length, B.length);
}
await browser.close();
