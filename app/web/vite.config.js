import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localProxyOrigin } from './dev-proxy.js';
import { build as esbuild } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const api = `http://127.0.0.1:${process.env.WINMATE_API_PORT || 8788}`;
// 건물 조감도 모듈 — 라이브 아티팩트와 같은 esbuild 설정(IIFE · __wmBldMod · minify · es2020)으로 src/building을 묶은 원문.
// BuildingPage가 <script id="wm-bld-js">로 넣어 실행하고, 「HTML 추출」이 이 원문을 그대로 담는다.
function buildingModule() {
  const id = 'virtual:wm-building', resolved = '\0' + id;
  return {
    name: 'winmate-building',
    resolveId: (source) => (source === id ? resolved : null),
    async load(source) {
      if (source !== resolved) return null;
      const out = await esbuild({ absWorkingDir: here, entryPoints: ['src/building/index.js'], bundle: true, format: 'iife', globalName: '__wmBldMod', minify: true, charset: 'utf8', target: 'es2020', legalComments: 'none', write: false, metafile: true, logLevel: 'warning' });
      for (const input of Object.keys(out.metafile.inputs)) this.addWatchFile(path.resolve(here, input));
      const js = out.outputFiles[0].text.trim();
      if (js.toLowerCase().includes('</script')) throw new Error('building module contains </script');
      return 'export default ' + JSON.stringify(js) + ';';
    },
  };
}
export default defineConfig({
  plugins: [react(), buildingModule(), {
    name: 'winmate-layout-data',
    transformIndexHtml(html) {
      return html.replace('<!-- layout-data -->', `<script id="wm-layouts" type="application/octet-stream">${fs.readFileSync(path.join(here, '../data/layouts.b64'), 'utf8').trim()}</script>`);
    },
  }],
  server: {
    port: Number(process.env.WINMATE_WEB_PORT || 5173),
    strictPort: true,
    proxy: Object.fromEntries(['/api', '/img', '/lib', '/tokens.css'].map(prefix => [prefix, { target: api, changeOrigin: true, configure(proxy) {
      proxy.on('proxyReq', (outgoing, incoming) => {
        const origin = localProxyOrigin(incoming, api);
        if (origin) outgoing.setHeader('origin', origin);
      });
    } }])),
    fs: { allow: [here] },
  },
  build: {
    // Open tabs can request lazy chunks from their original build hours later.
    // Keep the entire hashed dependency graph when publishing the next build.
    emptyOutDir: false,
    target: ['chrome110', 'safari16', 'firefox115'],
    chunkSizeWarningLimit: 7000,
    rollupOptions: { input: { app: path.join(here, 'index.html'), migration: path.join(here, 'migration.html') } },
  },
  // The GIF decoder runs in a Worker, which has no window object.
  define: { global: 'globalThis' },
});
