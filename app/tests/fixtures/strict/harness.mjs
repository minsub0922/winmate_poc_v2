// Shared, test-only harness for app/tests/functional-contracts.mjs and app/tests/real-functional-e2e.mjs.
//
// Environment
//   WINMATE_TEST_URL           running API/app server (default http://127.0.0.1:8788). Must be loopback for the in-process Vite.
//   WINMATE_VITE_URL           use an already running Vite dev server instead of starting one in-process.
//   WINMATE_STRICT_VITE_PORT   port for the in-process Vite dev server (default 5199).
//   WINMATE_TEST_PASSWORD      needed only when the server runs with login on (WINMATE_TEST_USER, default admin).
//   CHROME                     alternative Chromium executable (same as the existing suites).
//
// Pages are served by Vite so /src modules can be imported into the running app (same module instances).
// Every browser context blocks: non-loopback hosts (abort) and model endpoints POST /api/llm, POST /api/jobs and
// job answers (503 strict_model_blocked). Blocked requests are counted in each report — deterministic suites never reach a model.
import { chromium } from '../../../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const webDir = path.join(root, 'app/web');
export const apiOrigin = (process.env.WINMATE_TEST_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
export const outDir = path.join(root, 'app/tests/output/strict');
export const fixtureDir = path.join(root, 'app/tests/fixtures/strict');
fs.mkdirSync(outDir, { recursive: true });
const require = createRequire(path.join(webDir, 'package.json'));
export const JSZip = require('jszip');
export const MIN_CASES = 10;

export const launch = () => chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
export const fixtures = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'deterministic-fixtures.json'), 'utf8'));
const PAGE_HELPERS = fs.readFileSync(path.join(fixtureDir, 'page-helpers.js'), 'utf8');

export class CheckFailed extends Error {}
export const ok = (condition, message) => { if (!condition) throw new CheckFailed(message); };
export const eq = (actual, expected, message) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new CheckFailed(`${message}: expected ${e}, got ${a}`);
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Vite dev server for /src imports — in-process unless WINMATE_VITE_URL points at one. */
export async function startVite() {
  if (process.env.WINMATE_VITE_URL) return { url: process.env.WINMATE_VITE_URL.replace(/\/$/, ''), close: async () => {}, spawned: false };
  const api = new URL(apiOrigin);
  if (!['127.0.0.1', 'localhost'].includes(api.hostname)) throw new CheckFailed('unsupported: the in-process Vite proxy targets 127.0.0.1 only — set WINMATE_VITE_URL for ' + apiOrigin);
  const port = Number(process.env.WINMATE_STRICT_VITE_PORT || 5199);
  process.env.WINMATE_API_PORT = api.port || '80';
  process.env.WINMATE_WEB_PORT = String(port); // vite.config.js reads it for the loopback Origin rewrite
  const { createServer } = await import(pathToFileURL(path.join(webDir, 'node_modules/vite/dist/node/index.js')).href);
  const server = await createServer({
    configFile: path.join(webDir, 'vite.config.js'), root: webDir, logLevel: 'warn', clearScreen: false,
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'jszip', 'pptxgenjs'] },
  });
  await server.listen();
  return { url: `http://127.0.0.1:${port}`, close: () => server.close(), spawned: true };
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const MODEL_PATH = (p) => p === '/api/llm' || p === '/api/layouts/search' || p === '/api/jobs' || /^\/api\/jobs\/[^/]+\/answer$/.test(p);

/** Isolated context: own storage, external hosts aborted, model endpoints blocked, logged in when the server needs it. */
export async function isolatedContext(browser, base, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true, ...options });
  const blocked = [];
  await context.route((u) => !LOOPBACK.has(u.hostname), (route) => { blocked.push({ kind: 'external', url: route.request().url().slice(0, 160) }); return route.abort(); });
  await context.route((u) => LOOPBACK.has(u.hostname) && MODEL_PATH(u.pathname), (route) => {
    if (route.request().method() === 'GET') return route.continue();
    blocked.push({ kind: 'model', method: route.request().method(), url: route.request().url().slice(0, 160) });
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'deterministic strict test: model calls are blocked', code: 'strict_model_blocked' }) });
  });
  context.strictBlocked = blocked;
  await login(context, base);
  return context;
}

export async function login(context, base) {
  const response = await context.request.get(base + '/api/auth/status');
  ok(response.ok(), `auth status ${response.status()} from ${base}`);
  const status = await response.json();
  if (!status.enabled || status.authenticated) return status;
  const password = process.env.WINMATE_TEST_PASSWORD;
  if (!password) throw new CheckFailed('unsupported: server login is on — set WINMATE_TEST_PASSWORD (WINMATE_TEST_USER) or run an isolated server with WINMATE_AUTH=off');
  const r = await context.request.post(base + '/api/auth/login', { data: { username: process.env.WINMATE_TEST_USER || 'admin', password } });
  ok(r.ok(), `login failed with ${r.status()}`);
  return { ...status, authenticated: true };
}

/** Open the app and wait until it has booted (bootstrap + layout HTML + My templates). */
export async function openApp(context, base, { helpers = true } = {}) {
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.strictErrors = [];
  page.on('pageerror', (e) => page.strictErrors.push(String(e.message).slice(0, 300)));
  await page.goto(base + '/');
  await waitApp(page);
  if (helpers) await injectHelpers(page);
  return page;
}

export async function waitApp(page) {
  await page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'), null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

export async function injectHelpers(page) {
  await page.addScriptTag({ type: 'module', content: PAGE_HELPERS });
  try { await page.waitForFunction(() => window.__strictReady === true, null, { timeout: 60000 }); } catch (e) {
    throw new CheckFailed('unsupported: /src modules could not be imported into the page (is this a Vite dev server?) ' + page.strictErrors.join(' | '));
  }
}

/** The same origin under a different host name — a separate browser storage origin. */
export const otherOrigin = (base) => base.includes('127.0.0.1') ? base.replace('127.0.0.1', 'localhost') : base.replace('localhost', '127.0.0.1');

/** Case runner: unique ids, pass/fail only, per-case details, one JSON report per group. */
export function suite(group, file, { minimum = MIN_CASES } = {}) {
  const cases = [];
  const api = {
    group, cases,
    case(id, title, fn) { ok(!cases.some((c) => c.id === id), 'duplicate case id ' + id); cases.push({ id, title, fn }); },
    async run(setupError = '', extra = {}) {
      const results = [];
      for (const c of cases) {
        const details = {};
        const t0 = Date.now();
        let status = 'pass', error = null;
        try {
          if (setupError) throw new CheckFailed('unsupported: setup failed — ' + setupError);
          await c.fn(details);
        } catch (e) {
          status = 'fail';
          error = e instanceof CheckFailed ? e.message : `${e && e.name}: ${e && e.message}\n${String(e && e.stack).split('\n').slice(1, 6).join('\n')}`;
        }
        results.push({ id: c.id, title: c.title, status, ms: Date.now() - t0, details, error });
        console.log((status === 'pass' ? 'PASS ' : 'FAIL ') + `${group}/${c.id} ${c.title}` + (error ? '\n     ' + error.split('\n')[0] : ''));
      }
      return writeReport(group, file, results, typeof extra === 'function' ? extra() : extra, minimum);
    },
  };
  return api;
}

export function writeReport(group, file, results, extra = {}, minimum = MIN_CASES) {
  const passed = results.filter((r) => r.status === 'pass').length;
  const report = {
    group, suite: file, kind: 'deterministic', live_llm: false, generatedAt: new Date().toISOString(),
    counts: { total: results.length, passed, failed: results.length - passed, minimum },
    meetsMinimum: results.length >= minimum && passed === results.length,
    ...extra, cases: results,
  };
  fs.writeFileSync(path.join(outDir, group + '.json'), JSON.stringify(report, null, 2));
  console.log(`${group}: ${passed}/${results.length} passed (minimum ${minimum})`);
  return report;
}

/** Read every record of an IndexedDB store directly (bypasses the repositories under test). */
export const readIdb = (page, db, store) => page.evaluate(([db, store]) => new Promise(async (resolve, reject) => {
  // never create a missing database here: an empty v1 database would stop the app's own upgrade from creating its stores
  if (!(await indexedDB.databases()).some((x) => x.name === db)) { resolve([]); return; }
  const rq = indexedDB.open(db);
  rq.onerror = () => reject(rq.error);
  rq.onsuccess = () => {
    const d = rq.result;
    if (!d.objectStoreNames.contains(store)) { d.close(); resolve([]); return; }
    const out = []; const tx = d.transaction(store, 'readonly'); const c = tx.objectStore(store).openCursor();
    c.onsuccess = async () => { const cur = c.result; if (cur) { out.push({ key: cur.key, value: cur.value }); cur.continue(); } };
    tx.oncomplete = async () => {
      d.close();
      const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
      const view = [];
      for (const r of out) {
        const v = r.value;
        if (v instanceof Blob) view.push({ key: r.key, blob: { type: v.type, size: v.size, sha: hex(await crypto.subtle.digest('SHA-256', await v.arrayBuffer())) } });
        else view.push({ key: r.key, value: JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Blob ? { __blob: x.type, size: x.size } : x))) });
      }
      resolve(view);
    };
    tx.onerror = () => reject(tx.error);
  };
}), [db, store]);

export const localJson = (page, key) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), key);

/** Unzip a PPTX (base64 or Buffer) into the parts the suites inspect. */
export async function inspectPptx(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'base64');
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const slideNames = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const slides = [];
  for (const n of slideNames) slides.push(await zip.file(n).async('string'));
  const notes = [];
  for (const n of names.filter((x) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(x)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0])) notes.push(await zip.file(n).async('string'));
  const media = [];
  const { createHash } = await import('node:crypto');
  for (const n of names.filter((x) => x.startsWith('ppt/media/'))) {
    const bytes = await zip.file(n).async('nodebuffer');
    media.push({ name: n, size: bytes.length, sha: createHash('sha256').update(bytes).digest('hex') });
  }
  const presentation = zip.file('ppt/presentation.xml') ? await zip.file('ppt/presentation.xml').async('string') : '';
  const contentTypes = zip.file('[Content_Types].xml') ? await zip.file('[Content_Types].xml').async('string') : '';
  return { names, slides, notes, media, presentation, contentTypes, bytes: buf.length };
}

/** Text runs of one slide XML: [{text, bold}] (editable <a:t> runs). */
export function runsOf(xml) {
  const out = [];
  for (const m of xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
    const t = (m[1].match(/<a:t>([\s\S]*?)<\/a:t>/) || [])[1];
    if (t == null) continue;
    const rpr = (m[1].match(/<a:rPr\b[^>]*>/) || [''])[0];
    out.push({ text: t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'), bold: /\bb="1"/.test(rpr) });
  }
  return out;
}
