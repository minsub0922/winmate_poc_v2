// Storyboard picker: shared catalog filters, selection, and the anchored full favorites list.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'picker-test', auth_enabled: false } };
const output = path.join(root, 'app/tests/output/layout-picker');
fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
let browser, page;
const errors = [], checks = [];
const pass = message => { checks.push(message); console.log('PASS ' + message); };
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => route.fulfill(new URL(route.request().url()).pathname === '/api/bootstrap' ? { json: boot } : { status: 503, json: { code: 'isolated_no_model' } }));
  await context.route('**/img/**', route => route.abort());
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port); await page.locator('.app').waitFor();
  const fixture = await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const repo = await import('/src/repositories/proposals.js');
    const { LayoutPicker } = await import('/src/components/layouts.jsx');
    const { LAYOUTS } = await import('/src/services/catalog.js');
    const { PARTS } = await import('/src/domain/proposals/parts.js');
    const { toggleFav } = await import('/src/repositories/favorites.js');
    const { searchCatalogKeywords } = await import('/src/services/catalog-search.js');
    for (const l of LAYOUTS.slice(0, 18)) toggleFav(l.f, null, '전체 목록 검증');
    toggleFav(LAYOUTS[0].f, { t: { 0: '찜에 저장한 실제 문구' }, img: {} }, '값 보존 검증');
    const id = repo.createProposal();
    repo.update(id, p => { p.parts = [{ id: 'target', type: 'value', name: '운영 가치', items: ['수업 준비와 운영 개선'], layouts: [] }]; });
    const host = document.createElement('div'); document.body.appendChild(host);
    const pickerRoot = createRoot(host);
    function Harness() { const p = repo.useStore(s => s.proposals.find(p => p.id === id)); return React.createElement(LayoutPicker, { p, partId: 'target', onClose: () => pickerRoot.unmount() }); }
    pickerRoot.render(React.createElement(Harness));
    return { id, total: LAYOUTS.length, valueLabel: PARTS.value.label, valueGeneral: LAYOUTS.filter(l => l.p === 'value' && !l.ind).map(l => l.f), keyword: searchCatalogKeywords('layouts', '설치').map(h => h.item.f), filled: LAYOUTS[0].f };
  });
  const picker = page.locator('.modal.xwide'); await picker.locator('.pk-rec .pcard').first().waitFor();
  assert.equal(await picker.locator('.pk-jump, .seg, .pk-favcard').count(), 0);
  assert.equal(await picker.locator('.pk-all .tl-card').count(), fixture.total);
  assert.equal(await picker.locator('.pk-all .tl-grp-h h2').count(), 6);
  assert(await picker.locator('.pk-all .tl-card .tl-when').first().isVisible());
  await page.screenshot({ path: output + '/desktop.png' });
  pass('full catalog uses library groups, descriptions and cards; inline filter shortcuts are removed');

  const filter = picker.getByRole('button', { name: '필터', exact: true });
  await filter.click(); const popup = page.locator('.modal.tlf');
  assert.equal(await popup.locator('.tlf-step').count(), 7);
  await popup.locator('.tlf-step').first().getByRole('button', { name: new RegExp('^' + fixture.valueLabel + '\\s+\\d+$') }).click();
  await popup.getByRole('button', { name: '닫기', exact: true }).last().click();
  assert.equal(await picker.locator('.tl-onchip').count(), 0);
  await filter.click();
  await popup.locator('.tlf-step').first().getByRole('button', { name: new RegExp('^' + fixture.valueLabel + '\\s+\\d+$') }).click();
  await popup.locator('.tlf-step').nth(1).getByRole('button', { name: /^범용\s+\d+$/ }).click();
  assert.equal(Number(await popup.locator('.tlf-go b').innerText()), fixture.valueGeneral.length);
  await popup.locator('.tlf-go').click();
  assert.deepEqual((await picker.locator('.pk-all .tl-card').evaluateAll(es => es.map(e => e.dataset.f))).sort(), [...fixture.valueGeneral].sort());
  assert.equal(await picker.locator('.tl-onchip').count(), 2);
  await picker.locator('.tl-onchip').first().click(); assert.equal(await picker.locator('.tl-onchip').count(), 1);
  await picker.getByRole('button', { name: '모두 지우기', exact: true }).click();
  assert.equal(await picker.locator('.pk-all .tl-card').count(), fixture.total);
  pass('seven library filters support draft cancel, combined counts, apply, chip removal and reset');

  await picker.locator('#pk-q').fill('설치');
  assert.deepEqual(await picker.locator('.pk-all .tl-card').evaluateAll(es => es.map(e => e.dataset.f)), fixture.keyword);
  const chosen = picker.locator('.pk-all .pcard').first();
  const chosenId = await chosen.getAttribute('data-f'); await chosen.click();
  await page.waitForFunction(f => document.querySelector('.pk-all .pcard[data-f="' + f + '"]')?.getAttribute('aria-pressed') === 'true', chosenId);
  await chosen.press('Enter'); assert.equal(await chosen.getAttribute('aria-pressed'), 'false');
  pass('instant keyword results match the library and support mouse selection and keyboard deselection');

  await picker.locator('#pk-q').fill('결과가없는검색어');
  const favorites = picker.locator('.pk-fav-toggle'); await favorites.click();
  const saved = page.locator('#pk-favorites'); await saved.waitFor();
  assert.equal(await saved.locator('.pk-favcard').count(), 19);
  const anchor = await favorites.boundingBox(), box = await saved.boundingBox();
  assert(Math.abs(box.y - anchor.y - anchor.height - 8) < 2);
  assert(Math.abs(box.x + box.width - anchor.x - anchor.width) < 2);
  assert.equal(await page.locator('.mback').count(), 1);
  assert(await saved.locator('.pk-fav-body').evaluate(e => e.scrollHeight > e.clientHeight));
  await saved.locator('.pk-favcard').last().scrollIntoViewIfNeeded();
  assert(await saved.locator('.pk-favcard').last().isVisible());
  await saved.locator('.pk-fav-body').evaluate(e => { e.scrollTop = 0; });
  await page.screenshot({ path: output + '/favorites.png' });
  await saved.locator('.pk-favcard').first().click();
  const values = await page.evaluate(async id => (await import('/src/repositories/proposals.js')).getProposal(id).parts.find(p => p.id === 'target').layouts.map(l => l.ov?.t?.[0]), fixture.id);
  assert(values.includes('찜에 저장한 실제 문구'));
  await page.keyboard.press('Escape'); await saved.waitFor({ state: 'detached' });
  assert(await picker.isVisible()); assert.equal(await favorites.getAttribute('aria-expanded'), 'false');
  assert(await favorites.evaluate(e => e === document.activeElement));
  await favorites.click(); await picker.locator('#pk-q').click({ position: { x: 10, y: 10 } }); await saved.waitFor({ state: 'detached' });
  pass('favorites opens at the header button, lists all 19 despite search, scrolls, preserves saved values and closes independently');

  await picker.locator('#pk-q').fill('');
  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await favorites.click(); await saved.waitFor();
    const bounds = await saved.boundingBox();
    assert(bounds.x >= 11 && bounds.x + bounds.width <= width - 11 && bounds.y + bounds.height <= 833);
    assert(await saved.locator('.pk-fav-body').evaluate(e => e.scrollWidth <= e.clientWidth));
    assert(await picker.locator('.pk-all .tl-grid').first().evaluate(e => e.scrollWidth <= e.clientWidth));
    const columns = await picker.locator('.pk-all .tl-grid').first().evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width === 390 ? 1 : 2);
    await page.screenshot({ path: output + '/favorites-' + width + '.png' });
    await favorites.click();
  }
  await favorites.click(); await page.setViewportSize({ width: 1000, height: 740 });
  await page.waitForTimeout(100);
  const resizedAnchor = await favorites.boundingBox(), resized = await saved.boundingBox();
  assert(Math.abs(resized.y - resizedAnchor.y - resizedAnchor.height - 8) < 2);
  await saved.getByRole('button', { name: '찜 목록 닫기' }).click();
  pass('mobile grids fit without horizontal overflow and favorites follows its button on resize');
  assert.deepEqual(errors, []);
  fs.writeFileSync(output + '/report.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(checks.length + ' layout picker checks passed');
} catch (error) { await page?.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error; }
finally { await browser?.close(); await server.close(); }
