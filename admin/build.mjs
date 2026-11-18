import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../app/web/node_modules/esbuild/lib/main.js';
import '../app/scripts/build_building_catalog.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.resolve(here, process.env.WINMATE_ADMIN_BUILD_OUT || 'web/dist');
fs.mkdirSync(out, { recursive: true });
// 화면마다 따로 받는 큰 모듈(레이아웃 구성 관리가 읽는 앱의 목차 템플릿 · 시나리오)은 chunks/ 로 나눈다 — 이전 빌드의 조각은 지운다.
fs.rmSync(path.join(out, 'chunks'), { recursive: true, force: true });
await build({ entryPoints: { app: path.join(here, 'web/src/main.jsx') }, bundle: true, minify: true, sourcemap: true,
  outdir: out, format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]', jsx: 'automatic', target: ['chrome110', 'safari16'],
  loader: { '.b64': 'text' }, nodePaths: [path.join(root, 'app/web/node_modules')], define: { 'process.env.NODE_ENV': '"production"' } });
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><title>Winmate · Admin</title><link rel="stylesheet" href="/fonts/fonts.css"/><link rel="stylesheet" href="/admin/static/app.css"/></head><body><div id="root"></div><script type="module" src="/admin/static/app.js"></script></body></html>`);
console.log('Admin build → admin/web/dist (production entrypoint is unchanged)');
