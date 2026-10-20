// Best Scenario 21개를 앱 코드로 그려서 평가용 JSON으로 내보낸다.
//   node poc/test/proposal_score/tools/export_best_scenarios.mjs [--out poc/test/proposal_score/data/best_scenarios.json]
// 필요: winmatev2 루트의 node_modules (esbuild · react · react-dom · playwright) — `npm install` 한 번.
// Chromium 은 PLAYWRIGHT_BROWSERS_PATH 또는 playwright 기본 위치에서 찾고, CHROMIUM_PATH 로 직접 지정할 수도 있다.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const args = process.argv.slice(2);
const outPath = path.resolve(args[args.indexOf('--out') + 1] && args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(HERE, '..', 'data', 'best_scenarios.json'));
const { chromium } = await import(path.join(ROOT, 'node_modules/playwright/index.mjs'));

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'wm-export-'));
const res = await build({
  entryPoints: [path.join(HERE, 'export_entry.jsx')], bundle: true, write: false, format: 'iife', platform: 'browser', target: ['chrome110'],
  minify: false, jsx: 'automatic', loader: { '.json': 'json' }, define: { 'process.env.NODE_ENV': '"production"', global: 'window' },
  external: ['fs', 'https', 'image-size', 'node:fs', 'node:https'], logLevel: 'warning', nodePaths: [path.join(ROOT, 'node_modules')],
});
const b64 = fs.readFileSync(path.join(ROOT, 'data/layouts.b64'), 'utf8').trim();
fs.writeFileSync(path.join(tmp, 'bundle.js'), res.outputFiles[0].text);
// 'Noto Sans KR' 은 설치된 Noto Sans CJK KR 로 대신 (글자 폭 · 넘침 측정용)
fs.writeFileSync(path.join(tmp, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR'),local('Noto Sans KR'),local('NotoSansKR-Regular'),local('Apple SD Gothic Neo');font-weight:100 900}
body{margin:0} #stage{position:absolute;left:0;top:0;width:1280px;height:720px;overflow:visible}
</style></head><body><div id="stage"></div><script id="wm-layouts" type="application/octet-stream">${b64}</script><script src="bundle.js"></script></body></html>`);

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u === '/' ? path.join(tmp, 'index.html') : u === '/bundle.js' ? path.join(tmp, 'bundle.js') : path.join(ROOT, u);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' }); r.end(b); });
}).listen(0);
const port = srv.address().port;
const launch = { args: ['--no-sandbox'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => typeof window.__export === 'function');
await page.evaluate(() => document.fonts.ready);
const data = await page.evaluate(() => window.__export());
await browser.close(); srv.close();
fs.rmSync(tmp, { recursive: true, force: true });

const doc = { version: 1, exported_at: new Date().toISOString(), source: 'winmatev2 src/scenarios.js · scenario_fills.js (앱 applyOverrides 로 렌더링)', page_errors: errs.slice(0, 5), scenarios: data };
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(doc, null, 1));
const nSheets = data.reduce((a, s) => a + s.sheets.length, 0);
console.log(`exported ${data.length} scenarios · ${nSheets} sheets → ${path.relative(process.cwd(), outPath)}${errs.length ? ' · page errors ' + errs.length : ''}`);
for (const s of data) if (s.app_error) console.log('  ', s.id, 'app profile error:', s.app_error.split('\n')[0]);
