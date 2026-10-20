import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localProxyOrigin } from './dev-proxy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const api = `http://127.0.0.1:${process.env.WINMATE_API_PORT || 8788}`;
export default defineConfig({
  plugins: [react(), {
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
