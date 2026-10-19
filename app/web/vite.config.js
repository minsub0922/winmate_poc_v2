import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    proxy: Object.fromEntries(['/api', '/img', '/lib'].map(prefix => [prefix, { target: api }])),
    fs: { allow: [path.resolve(here, '..')] },
  },
  build: {
    target: ['chrome110', 'safari16', 'firefox115'],
    chunkSizeWarningLimit: 7000,
    rollupOptions: { input: { app: path.join(here, 'index.html'), migration: path.join(here, 'migration.html') } },
  },
  define: { global: 'window' },
});
