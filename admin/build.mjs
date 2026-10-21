import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../app/web/node_modules/esbuild/lib/main.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.resolve(here, process.env.WINMATE_ADMIN_BUILD_OUT || 'web/dist');
fs.mkdirSync(out, { recursive: true });
await build({ entryPoints: [path.join(here, 'web/src/main.jsx')], bundle: true, minify: true, sourcemap: true,
  outfile: path.join(out, 'app.js'), jsx: 'automatic', target: ['chrome110', 'safari16'],
  nodePaths: [path.join(root, 'app/web/node_modules')], define: { 'process.env.NODE_ENV': '"production"' } });
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html lang="ko"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><title>Winmate · Admin</title><link rel="stylesheet" href="/fonts/fonts.css"/><link rel="stylesheet" href="/admin/static/app.css"/></head><body><div id="root"></div><script type="module" src="/admin/static/app.js"></script></body></html>`);
console.log('Admin build → admin/web/dist (production entrypoint is unchanged)');
