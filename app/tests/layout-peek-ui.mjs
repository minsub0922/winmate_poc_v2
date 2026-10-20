// Four real library surfaces share the same placement, while keeping their own values.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'layout-peek-test', auth_enabled: false } };
const output = path.join(root, 'app/tests/output/layout-peek'); fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const checks = [], errors = [], positions = []; const pass = text => { checks.push(text); console.log('PASS', text); };
let browser, page;
try {
  await server.listen(); browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce' });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await context.route(url => url.pathname.startsWith('/api/'), route => new URL(route.request().url()).pathname === '/api/bootstrap'
    ? route.fulfill({ json: boot }) : route.fulfill({ status: 503, json: { code: 'test_no_api' } }));
  await context.route('**/img/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const filename = [path.join(root, relative), path.join(root, 'reference/live', relative), path.join(root, 'app/data/static', relative)].find(filename => fs.existsSync(filename));
    return filename ? route.fulfill({ path: filename }) : route.abort();
  });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(12000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port); await page.locator('.home').waitFor();
  await page.evaluate(async () => {
    const { myMeta, saveTemplates } = await import('/src/repositories/templates.js'); const { toggleFav } = await import('/src/repositories/favorites.js');
    const { loadUi, saveUi } = await import('/src/repositories/proposals.js');
    const items = Array.from({ length: 3 }, (_, i) => ({ meta: myMeta({ f: 'L_MY_PEEK_' + i, name: '가운데 미리보기 ' + (i + 1), p: 'overview', kind: 'edit', batch: 'peek', nT: 1 }),
      html: '<div style="position:relative;width:1280px;height:720px;background:#eef3ff"><h1 data-tb="0" style="position:absolute;left:100px;top:100px;font-size:48px">저장된 장표 ' + (i + 1) + '</h1></div>' }));
    await saveTemplates(items);
    for (const item of items) toggleFav(item.meta.f, { t: { 0: '찜에 저장한 실제 내용' }, img: {} }, '미리보기 검증');
    saveUi({ ...loadUi(), route: { name: 'library' } });
  });
  await page.reload(); await page.locator('[data-library-scope="catalog"]').waitFor();
  const navigate = async selector => {
    await page.locator('.sidebar').hover({ position: { x: 20, y: 20 } }); await page.locator(selector).click();
    await page.mouse.move(page.viewportSize().width - 2, 2); await page.waitForTimeout(260);
  };
  const inspect = async (label, target, expectBroad = true) => {
    await target.scrollIntoViewIfNeeded(); await page.mouse.move(1, 1); await page.waitForTimeout(160); await target.hover({ position: { x: 80, y: 80 } });
    const popup = page.locator('.pk-peek'); await popup.waitFor(); await page.waitForTimeout(100);
    const measurement = await popup.evaluate((element, label) => ({ label, side: element.dataset.placement, mode: element.classList.contains('wide') ? 'wide' : 'stacked',
      box: element.getBoundingClientRect().toJSON(), slide: element.querySelector('.pp-slide').getBoundingClientRect().toJSON(),
      viewport: { width: innerWidth, height: innerHeight } }), label);
    const anchor = await target.boundingBox(), { box, slide, viewport } = measurement;
    assert(box.x >= 11 && box.y >= 11 && box.right <= viewport.width - 11 && box.bottom <= viewport.height - 11, JSON.stringify(measurement));
    assert(box.right <= anchor.x - 11 || box.x >= anchor.x + anchor.width + 11 || box.bottom <= anchor.y - 11 || box.y >= anchor.y + anchor.height + 11, 'preview covers anchor: ' + label);
    assert(slide.x >= box.x && slide.right <= box.right + 1 && slide.y >= box.y && slide.bottom <= box.bottom + 1, 'slide is clipped: ' + JSON.stringify(measurement));
    const sideWidth = Math.max(anchor.x - 24, viewport.width - anchor.x - anchor.width - 24);
    if (expectBroad) assert(box.width > sideWidth, 'middle preview is still restricted to a narrow side: ' + JSON.stringify({ measurement, anchor, sideWidth }));
    await page.screenshot({ path: output + '/' + label + '.png', animations: 'disabled' }); positions.push(measurement);
    await page.mouse.move(1, 1); await popup.waitFor({ state: 'detached' });
    pass(label + ': full slide stays inside a larger preview without covering the hovered card');
  };
  await inspect('catalog-middle', page.locator('.tl-grid .tl-card').nth(1));
  await navigate('.sb-my'); await page.locator('[data-library-scope="my"]').waitFor(); await inspect('my-middle', page.locator('.tl-card').nth(1));
  await navigate('.sb-fav'); await page.locator('[data-library-scope="favorites"]').waitFor();
  await inspect('favorites-middle', page.locator('.fav-card').nth(1));
  await page.locator('.fav-card').nth(1).hover(); await page.locator('.pk-peek').waitFor(); assert((await page.locator('.pk-peek .pp-slide').innerText()).includes('찜에 저장한 실제 내용'));
  await page.mouse.move(1, 1); await page.locator('.pk-peek').waitFor({ state: 'detached' });
  await navigate('.sb-bs'); await page.locator('.bsl-sheet').first().waitFor(); await inspect('best-scenario-middle', page.locator('.bsl').first().locator('.bsl-sheet').nth(1));
  await navigate('.sb-tpl');
  for (const width of [1100, 820]) {
    await page.setViewportSize({ width, height: width === 820 ? 620 : 740 }); await inspect('catalog-' + width, page.locator('.tl-grid .tl-card').nth(1), false);
  }
  await page.locator('.tl-grid .tl-card').nth(1).hover(); await page.locator('.pk-peek').waitFor(); await page.setViewportSize({ width: 1000, height: 740 });
  await page.locator('.pk-peek').waitFor({ state: 'detached' }); pass('resize discards a preview whose anchor geometry is stale');
  assert.deepEqual(errors, []); fs.writeFileSync(output + '/report.json', JSON.stringify({ checks, positions, errors }, null, 2));
  fs.rmSync(output + '/failure.png', { force: true });
  console.log(`${checks.length}/${checks.length} layout peek UI checks passed`);
} catch (error) { await page?.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error; }
finally { await browser?.close(); await server.close(); }
