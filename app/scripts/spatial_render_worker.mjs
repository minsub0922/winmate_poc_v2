#!/usr/bin/env node
// Server-side 3D 조감도 preview renderer. app/api/spatial_previews.py starts one worker and speaks JSON lines:
//   stdin   {"id":"r1","revision":"733e40b9","scene":{…},"width":960,"height":615,"quality":86}
//   stdout  {"ready":true,"pages":2}  then per request  {"id":"r1","ok":true,"webp":"<base64>","ms":812} | {"id":"r1","ok":false,"error":"…"}
// One headless Chromium with N pages (WINMATE_SPATIAL_RENDER_CONCURRENCY). Pages run an esbuild bundle of the same
// render-three.js the editor uses, at the editor's capture size (1600×1025), and sharp downsizes to WebP — the pipeline
// of the stored example thumbnails (build_spatial_previews.mjs). Library JSON and static assets come from disk through
// request interception, so the worker needs no API session, port or network access.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'app/web');
const require = createRequire(path.join(web, 'package.json'));
const { chromium } = await import(pathToFileURL(path.join(web, 'node_modules/playwright/index.mjs')).href);
const esbuild = require('esbuild');
const sharp = require('sharp');

// Secure context is required by the shared editor's crypto.randomUUID (new rooms).
const ORIGIN = 'https://winmate-spatial-render.local';
const PAGES = Math.max(1, Math.min(8, Number(process.env.WINMATE_SPATIAL_RENDER_CONCURRENCY || 2)));
const TIMEOUT = Math.max(5, Number(process.env.WINMATE_SPATIAL_RENDER_TIMEOUT || 60)) * 1000;
const RECYCLE = 40; // reload a page after this many renders so WebGL contexts and textures never accumulate
const STATIC = [path.join(web, 'dist'), path.join(web, 'public')];
const SPATIAL = path.join(root, 'app/data/spatial');
const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const log = (...args) => process.stderr.write('[spatial-render] ' + args.join(' ') + '\n');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');

const bundle = (await esbuild.build({
  absWorkingDir: web, entryPoints: ['src/render/spatial-preview-entry.js'], bundle: true, format: 'esm', target: 'es2020',
  minify: true, write: false, logLevel: 'warning', legalComments: 'none',
})).outputFiles[0].text;
const html = '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fonts/fonts.css"><body style="margin:0;background:#f3f5f3;font-family:\'Noto Sans KR\',\'Apple SD Gothic Neo\',\'Malgun Gothic\',system-ui,sans-serif"><script type="module" src="/render.js"></script>';
const currentRevision = () => JSON.parse(fs.readFileSync(path.join(SPATIAL, 'library.json'), 'utf8')).sourceHash;
let current = currentRevision();

function libraryFile(revision) {
  if (!/^[a-f0-9]{8}$/.test(revision)) return null;
  const versioned = path.join(SPATIAL, 'versions', revision + '.json');
  if (fs.existsSync(versioned)) return versioned;
  // Never serve a newly rebuilt library under this worker's previous revision.
  current = currentRevision();
  return revision === current ? path.join(SPATIAL, 'library.json') : null;
}
function staticFile(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  for (const base of STATIC) {
    const file = path.resolve(base, '.' + decoded);
    if (!file.startsWith(base + path.sep)) return null;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}
async function route(route) {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.abort();
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
  if (url.pathname === '/render.js') return route.fulfill({ contentType: 'text/javascript', body: bundle });
  const library = url.pathname.match(/^\/__spatial\/library\/([a-f0-9]{8})\.json$/);
  const file = library ? libraryFile(library[1]) : staticFile(url.pathname);
  if (!file) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ contentType: TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(file), headers: { 'Cache-Control': 'max-age=31536000' } });
}

// Browser: WINMATE_SPATIAL_RENDER_CHROME (or the tests' CHROME) → Playwright's pinned Chromium → an installed Chrome.
function executable() {
  const configured = process.env.WINMATE_SPATIAL_RENDER_CHROME || process.env.CHROME;
  if (configured) return configured;
  try { if (fs.existsSync(chromium.executablePath())) return undefined; } catch { /* Not installed for this Playwright version. */ }
  return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .find(file => fs.existsSync(file));
}
const browser = await chromium.launch({ headless: true, executablePath: executable(), args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--mute-audio'] });
browser.on('disconnected', () => { log('browser disconnected'); process.exit(3); });
const context = await browser.newContext({ viewport: { width: 1600, height: 1025 }, deviceScaleFactor: 1 });
await context.route('**/*', route);

async function openPage() {
  const page = await context.newPage();
  page.on('pageerror', error => log('page error:', error.message));
  await page.goto(ORIGIN + '/');
  await page.waitForFunction(() => window.__winmateSpatialReady === true, null, { timeout: 30000 });
  return { page, renders: 0, busy: false };
}
const pool = await Promise.all(Array.from({ length: PAGES }, openPage));
const waiting = [];
const free = () => pool.find(slot => !slot.busy);

async function render(slot, request) {
  const started = Date.now();
  let timeout;
  const withTimeout = promise => Promise.race([promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('render timeout')), TIMEOUT); })]);
  try {
    if (['compute','snapshot','building'].includes(request.operation)) {
      const result = await withTimeout(slot.page.evaluate(req => req.operation === 'compute'
        ? window.__winmateSpatialCompute(req) : req.operation === 'building' ? window.__winmateBuildingSnapshot(req) : window.__winmateSpatialSnapshot(req), request));
      send({ id: request.id, ok: true, result, ms: Date.now() - started });
    } else {
    const png = await withTimeout(slot.page.evaluate(req => window.__winmateSpatialPreview(req), { scene: request.scene, revision: request.revision, width: 1600, height: 1025 }));
    const width = Math.max(160, Math.min(1600, Number(request.width) || 960)), height = Math.max(100, Math.min(1025, Number(request.height) || 615));
    const webp = await sharp(Buffer.from(String(png).split(',')[1], 'base64')).resize(width, height).webp({ quality: Math.max(40, Math.min(95, Number(request.quality) || 86)) }).toBuffer();
    send({ id: request.id, ok: true, webp: webp.toString('base64'), ms: Date.now() - started });
    }
    slot.renders += 1;
  } catch (error) {
    send({ id: request.id, ok: false, code: request.operation === 'compute' && !/timeout|closed|crash/i.test(error?.message || '') ? 'invalid_input' : 'renderer_unavailable', error: String(error?.message || error).slice(0, 500), ms: Date.now() - started });
    slot.renders = RECYCLE; // a failed or stuck page is replaced
  } finally { clearTimeout(timeout); }
  if (slot.renders >= RECYCLE) {
    const old = slot.page;
    try { const next = await openPage(); slot.page = next.page; slot.renders = 0; } catch (error) { log('page recycle failed:', error.message); process.exit(4); }
    old.close().catch(() => {});
  }
}
function pump() {
  while (waiting.length) {
    const slot = free();
    if (!slot) return;
    const request = waiting.shift();
    slot.busy = true;
    render(slot, request).finally(() => { slot.busy = false; pump(); });
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', line => {
  if (!line.trim()) return;
  let request;
  try { request = JSON.parse(line); } catch { log('invalid request line'); return; }
  if (!request?.id || (!request.scene && !['compute','building'].includes(request.operation)) || !request.revision) { send({ id: request?.id || '', ok: false, error: 'invalid request' }); return; }
  waiting.push(request); pump();
});
lines.on('close', async () => { await browser.close().catch(() => {}); process.exit(0); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await browser.close().catch(() => {}); process.exit(0); });
send({ ready: true, pages: PAGES, revision: current });
log('ready with', PAGES, 'pages');
