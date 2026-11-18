// Production chunks, real catalog/layouts and isolated storage. No model requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), web = path.join(root, 'app/web');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const out = path.join(root, 'app/tests/output/tab-loading'); fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'winmate-tab-loading-'));
const dist = process.env.WINMATE_TABS_DIST || path.join(temp, 'dist');
const bootstrap = { catalog: read('app/data/catalog.json'), products: read('app/data/products_db.json'), images: read('app/data/images.json'), capabilities: null, user: { username: 'tabs-test', auth_enabled: false } };
const library = read('app/data/spatial/library.json');
let server, browser, page;
const passed = [], errors = [], requests = [];
const pass = text => { passed.push(text); console.log('PASS ' + text); };
try {
  if (!process.env.WINMATE_TABS_DIST) await build({ root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } });
  server = await preview({ root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'error', build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0, strictPort: false } });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/api/bootstrap') return route.fulfill({ json: bootstrap });
    if (p.startsWith('/api/spatial/library')) return route.fulfill({ json: library });
    if (p === '/api/spatial/history') return route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 8 } });
    if (p === '/api/storyboards') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: { code: 'tab_loading_test_no_model' } });
  });
  await context.route(url => ['/img/', '/lib/', '/fonts/'].some(p => url.pathname.startsWith(p)), route => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.join(root, p.startsWith('fonts/') ? 'app/web/public' : 'app/data/static', p);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(new URL(r.url()).pathname));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.locator('.home').waitFor();
  assert.equal(requests.some(p => /sample-review-data|SimulationPage-|ReviewPage-|parse-document-|pptx2html-|pptxgen\.es-/.test(p)), false);
  pass('member home omits admin archives, simulation/review screens, document parser and PPTX generator');
  // Exercise the browser Back/Forward route handler in the compiled application.
  const navigate = async (name, selector) => {
    await page.evaluate(name => {
      const state = { winmateRoute: { name } };
      history.pushState(state, '', '/'); window.dispatchEvent(new PopStateEvent('popstate', { state }));
    }, name);
    await page.locator(selector).waitFor();
    assert.equal(await page.locator('.feedback-popup').filter({ hasText: '화면을 표시하지 못했어요' }).count(), 0);
    pass(name + ': production route loads');
  };
  for (const [name, selector] of [['library', '.hub'], ['my', '[data-library-scope="my"]'], ['favorites', '[data-library-scope="favorites"]'], ['toc', '.tocp'], ['reviews', '.rvh-title-row'], ['sim', '.simset'], ['spatial', '.be-home'], ['building', '.be-home']]) await navigate(name, selector);
  assert(requests.some(p => /SimulationPage-/.test(p))); assert(requests.some(p => /ReviewPage-/.test(p)));
  assert.equal(requests.some(p => /sample-review-data|parse-document-|pptx2html-|pptxgen\.es-/.test(p)), false);
  pass('tabs load their screen chunks while unused parsers/exporters and admin data remain deferred');
  await page.locator('.sb-new').click(); await page.locator('.pr-title input').waitFor();
  await page.locator('.pr-title input').fill('탭 정합성 확인'); await page.locator('.pr-title input').blur();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('winmate.v2.proposals') || '[]').some(p => p.title === '탭 정합성 확인'));
  await page.reload(); await page.locator('.pr-title input').waitFor();
  assert.equal(await page.locator('.pr-title input').inputValue(), '탭 정합성 확인');
  pass('new proposal route and its title survive reload in the compiled application');
  await page.setViewportSize({ width: 390, height: 850 });
  await navigate('my', '[data-library-scope="my"]');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(out, 'mobile-my.png') });
  assert.deepEqual(errors, []);
} catch (error) {
  await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); throw error;
} finally {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed, errors, requestedScripts: requests.filter(p => p.endsWith('.js')) }, null, 2));
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
