// Isolated browser storage: recommendations exclude used templates; manual selection remains available.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'isolated-test', auth_enabled: false } };
const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
let browser;
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => route.fulfill(new URL(route.request().url()).pathname === '/api/bootstrap' ? { json: boot } : { status: 503, json: { code: 'isolated_no_model' } }));
  await context.route('**/img/**', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => console.error('Browser error:', error.message));
  await page.goto('http://127.0.0.1:' + vite.httpServer.address().port);
  try { await page.locator('.app').waitFor(); } catch (error) { console.error((await page.locator('body').innerText()).slice(0, 2000)); throw error; }
  const fixture = await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const repo = await import('/src/repositories/proposals.js');
    const { LayoutPicker } = await import('/src/components/layouts.jsx');
    const { recommendLayouts } = await import('/src/services/search.js');
    const target = { id: 'target', type: 'value', name: '교육 운영 가치', items: ['수업 준비와 시설 운영 개선'], layouts: [] };
    const used = recommendLayouts(target, {}, 1)[0].l.f;
    if (recommendLayouts(target, { usedLayouts: [used] }, 20).some(r => r.l.f === used)) throw Error('Used layout was recommended');
    const id = repo.createProposal();
    repo.update(id, p => { p.parts = [{ id: 'existing', type: 'value', name: '기존 가치', items: [], layouts: [{ uid: 'manual-one', f: used, status: 'empty', ov: { t: {}, img: {} } }] }, target]; });
    const host = document.createElement('div'); document.body.appendChild(host);
    function Harness() { const p = repo.useStore(s => s.proposals.find(p => p.id === id)); return React.createElement(LayoutPicker, { p, partId: 'target', onClose: () => {} }); }
    createRoot(host).render(React.createElement(Harness));
    return { id, used };
  });
  await page.locator('.pk-rec .pcard').first().waitFor();
  assert.equal(await page.locator(`.pk-rec .pcard[data-f="${fixture.used}"]`).count(), 0);
  const manual = page.locator(`.pk-all .pcard[data-f="${fixture.used}"]`);
  assert.equal(await manual.count(), 1);
  await manual.click();
  await page.waitForFunction(({ id, used }) => JSON.parse(localStorage.getItem('winmate.v2.proposals')).find(p => p.id === id)?.parts.find(p => p.id === 'target')?.layouts.some(x => x.f === used), fixture);
  assert.equal(await page.locator(`.pk-rec .pcard[data-f="${fixture.used}"]`).count(), 0);
  assert.equal(await manual.getAttribute('aria-pressed'), 'true');
  const fresh = await page.locator('.pk-rec .pcard').first().getAttribute('data-f');
  await page.locator('.pk-rec .pcard').first().click();
  await page.locator(`.pk-all .pcard[data-f="${fresh}"]`).waitFor();
  assert.equal(await page.locator(`.pk-rec .pcard[data-f="${fresh}"]`).count(), 0);
  assert.equal(await page.locator(`.pk-all .pcard[data-f="${fresh}"]`).getAttribute('aria-pressed'), 'true');
  console.log('PASS recommendations omit layouts used anywhere in the deck; the same layout can still be added manually to another part.');
} finally { await browser?.close(); await vite.close(); }
