// dist/_h.html — 하네스 페이지(앱 CSS · 레이아웃 묶음 + harness.jsx)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const res = await build({ entryPoints: [path.join(root, 'build/bs/harness.jsx')], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.json': 'json' }, define: { 'process.env.NODE_ENV': '"production"', global: 'window' }, external: ['fs', 'https', 'image-size', 'node:fs', 'node:https'], logLevel: 'warning', minify: true });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const b64 = fs.readFileSync(path.join(root, 'data/layouts.b64'), 'utf8').trim();
fs.mkdirSync(path.join(root,'dist/_fonts'),{recursive:true}); for (const w of [500,600,700,800]) fs.copyFileSync(path.join(root,`build/bs/fonts/manrope-latin-${w}-normal.woff2`), path.join(root,`dist/_fonts/m${w}.woff2`));
const font = [500,600,700,800].map((w)=>`@font-face{font-family:'Manrope';src:url(_fonts/m${w}.woff2);font-weight:${w}}`).join('') + `@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR'),local('Noto Sans KR');font-weight:400}@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR Medium'),local('Noto Sans CJK KR');font-weight:500}@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR Bold'),local('Noto Sans CJK KR');font-weight:600 900}`;
const HOUT = path.join(root, process.env.HOUT || 'dist/_h.html');
fs.writeFileSync(HOUT + '.tmp', `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}${font} #stage{width:1280px;height:720px;position:relative;overflow:hidden}</style></head><body><div id="stage"></div><script id="wm-layouts" type="application/octet-stream">${b64}</script><script>${js}</script></body></html>`);
fs.renameSync(HOUT + '.tmp', HOUT);
console.log('harness ok', (js.length / 1024 | 0) + 'KB');
