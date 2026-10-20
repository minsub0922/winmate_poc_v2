// Real catalog/components/packs and image decoding, with controlled HTTP delays/failures. No model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = async name => JSON.parse(await fs.readFile(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: await read('catalog'), products: await read('products_db'), images: await read('images'), capabilities: null, user: { username: 'image-state-test', auth_enabled: false } };
const photo = await fs.readFile(path.join(root, 'app/data/static/img/qm55c-persp.png'));
const dataURL = 'data:image/png;base64,' + photo.toString('base64');
const output = path.join(root, 'app/tests/output/image-states'); await fs.mkdir(output, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false }, optimizeDeps: { include: ['react', 'react-dom/client'] } });
let browser, page; const checks = [], errors = [], pending = new Map(), released = new Set(), requested = [];
const pass = name => { checks.push(name); console.log('PASS', name); };
const release = name => { released.add(name); for (const resolve of pending.get(name) || []) resolve(); pending.delete(name); };
try {
 await server.listen(); const url = `http://127.0.0.1:${server.httpServer.address().port}`;
 browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
 await context.route(u => u.pathname.startsWith('/api/'), route => {
  const p = new URL(route.request().url()).pathname;
  if (p === '/api/bootstrap') return route.fulfill({ json: boot });
  if (p === '/api/auth/status') return route.fulfill({ json: { enabled: false, authenticated: true } });
  return route.fulfill({ status: 503, json: { code: 'image_test_no_model' } });
 });
 await context.route('**/img/**', async route => {
  const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
  const file = path.join(root, relative.startsWith('img/lib/') ? '' : 'app/data/static', relative);
  try {
   const content = await fs.readFile(file), range = route.request().headers().range?.match(/bytes=(\d+)-(\d+)/);
   if (range) return route.fulfill({ status: 206, body: content.subarray(Number(range[1]), Number(range[2]) + 1), headers: { 'Content-Type': 'text/plain', 'Content-Range': `bytes ${range[1]}-${range[2]}/${content.length}` } });
   return route.fulfill({ path: file });
  } catch { return route.fulfill({ status: 404 }); }
 });
 await context.route('**/__image-test__/**', async route => {
  const name = new URL(route.request().url()).pathname.split('/').at(-1); requested.push(name);
  if (/slow|delayed/.test(name) && !released.has(name)) await new Promise(resolve => pending.set(name, [...(pending.get(name) || []), resolve]));
  if (name.includes('missing') || name.includes('failed')) return route.fulfill({ status: 404, body: 'missing' }).catch(() => {});
  if (name.includes('corrupt')) return route.fulfill({ contentType: 'image/png', body: 'invalid image bytes' }).catch(() => {});
  return route.fulfill(name.endsWith('.json') ? { json: { images: [dataURL] } } : { contentType: 'image/png', body: photo }).catch(() => {});
 });
 page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
 await page.goto(url); await page.locator('.home').waitFor();
 await page.evaluate(async () => {
  window.ImageReact = (await import('/node_modules/.vite/deps/react.js')).default;
  const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  window.ImageParts = await import('/src/services/products.js');
  window.ImageTags = await import('/src/components/tagcard.jsx');
  window.ImageThumbs = await import('/src/components/Thumbs.jsx');
  const { P, S } = await import('/src/services/catalog.js');
  P['state-product'] = { ...P.qm55c, id: 'state-product', model: 'STATE-PANEL', name: '로딩 검사 제품', img: null, d: null, cur: false, th: '/__image-test__/product-delayed.json#0', gal: ['/__image-test__/gallery-delayed.json#0', '/__image-test__/gallery-ready.json#0'], models: [], kw: [], cs: [] };
  S['state-solution'] = { ...S.magicinfo, id: 'state-solution', name: '이미지 누락 솔루션', img: null, with: ['qm55c'], kw: [] };
  document.getElementById('root').style.display = 'none';
  const host = document.createElement('div'); host.id = 'image-test-root'; host.style.cssText = 'position:fixed;inset:0;z-index:1;padding:24px;background:var(--surface);overflow:auto'; document.body.appendChild(host);
  window.imageTestRoot = createRoot(host);
  window.renderImageTests = cases => window.imageTestRoot.render(window.ImageReact.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 20 } }, cases.map(c => window.ImageReact.createElement('div', { key: c.id, 'data-test': c.id, style: { width: 260, minHeight: 160 } },
   c.kind === 'thumb' ? window.ImageReact.createElement(window.ImageThumbs.Thumb, { r: c.ref }) : window.ImageReact.createElement(window.ImageParts.PImg, { src: c.src, alt: c.id, loading: c.loading || 'eager', style: { width: 240, height: 150 } })))));
 });
 const render = cases => page.evaluate(cases => window.renderImageTests(cases), cases);
 const frame = id => page.locator(`[data-test="${id}"] .image-state`).first();
 const state = async (id, value) => page.waitForFunction(({ id, value }) => document.querySelector(`[data-test="${id}"] .image-state`)?.dataset.imageState === value, { id, value });
 await render([{ id: 'direct', src: '/__image-test__/direct-delayed.png' }]); await state('direct', 'loading');
 const rect = await frame('direct').boundingBox();
 assert.equal(await frame('direct').locator('.image-state-shimmer').isVisible(), true);
 assert.equal(await frame('direct').locator('img').evaluate(el => getComputedStyle(el).opacity), '0');
 assert.equal(await frame('direct').locator('.image-state-shimmer').evaluate(el => getComputedStyle(el, '::after').animationName), 'imageShimmer');
 await page.screenshot({ path: path.join(output, 'loading.png') }); release('direct-delayed.png'); await state('direct', 'loaded');
 assert(await frame('direct').locator('img').evaluate(el => el.naturalWidth > 100));
 assert.deepEqual(await frame('direct').boundingBox(), rect); assert.equal(await frame('direct').getAttribute('aria-busy'), 'false');
 pass('direct image starts with shimmer and reveals real decoded pixels without layout shift');
 await render([{ id: 'packed', src: '/__image-test__/pack-delayed.json#0' }]); await state('packed', 'loading');
 release('pack-delayed.json'); await state('packed', 'loaded');
 assert((await frame('packed').locator('img').getAttribute('src')).startsWith('blob:'));
 pass('packed image keeps shimmer until both download and browser decoding finish');
 await render([{ id: 'missing', src: '/__image-test__/missing.png' }, { id: 'corrupt', src: '/__image-test__/corrupt.png' }, { id: 'empty', src: '' }, { id: 'failed-pack', src: '/__image-test__/failed.json#0' }, { id: 'missing-entry', src: '/__image-test__/pack-ready.json#9' }]);
 for (const id of ['missing', 'corrupt', 'empty', 'failed-pack', 'missing-entry']) {
  await state(id, 'error'); assert.equal(await frame(id).locator('.image-state-shimmer').isVisible(), false);
  assert.equal(await frame(id).locator('.image-state-error').isVisible(), true);
  assert.match(await frame(id).locator('.image-state-error').innerText(), /이미지 로드 오류/);
 }
 await page.screenshot({ path: path.join(output, 'errors.png') });
 pass('404, corrupt bytes, missing URL, failed pack and missing pack entry show explicit errors');
 await render([{ id: 'switch', src: '/__image-test__/old-slow.png' }]); await state('switch', 'loading');
 await render([{ id: 'switch', src: '/__image-test__/new-ready.png' }]); await state('switch', 'loaded');
 release('old-slow.png'); await page.waitForTimeout(80);
 assert((await frame('switch').locator('img').getAttribute('src')).endsWith('new-ready.png'));
 await render([{ id: 'switch', src: '/__image-test__/second-delayed.png' }]); await state('switch', 'loading'); release('second-delayed.png'); await state('switch', 'loaded');
 pass('changing source resets shimmer and late old requests cannot overwrite the selected image');
 await render([{ id: 'thumb', kind: 'thumb', ref: 'product:state-product' }, { id: 'solution', kind: 'thumb', ref: 'solution:magicinfo' }]);
 await state('thumb', 'loading'); assert.equal(await page.locator('[data-test="thumb"] .thumb > svg').count(), 0);
 release('product-delayed.json'); await state('thumb', 'loaded'); await state('solution', 'loaded');
 pass('product and solution thumbnails use real photos and no illustration placeholders');
 await page.evaluate(() => {
  const host = document.createElement('span'); host.id = 'static-image-chip'; host.className = 'mention has-th'; host.style.cssText = 'display:inline-flex;padding:10px';
  host.innerHTML = window.ImageTags.mentionThumbHtml('product:state-product'); document.getElementById('image-test-root').appendChild(host);
 });
 await page.waitForFunction(() => document.querySelector('#static-image-chip .image-state')?.dataset.imageState === 'loaded');
 assert(await page.locator('#static-image-chip img').evaluate(el => el.naturalWidth > 0));
 pass('plain HTML @-tag thumbnails hydrate cached packed photos through the same lifecycle');
 await page.evaluate(async () => {
  const { imageMarkup } = await import('/src/services/image-state.js'); const { linkTags } = await import('/src/services/links.js');
  const host = document.createElement('span'); host.id = 'link-image-chip'; host.appendChild(linkTags.chip('https://example.test/product', { title: 'Product link', img: '/__image-test__/link-ready.png' }));
  document.getElementById('image-test-root').appendChild(host);
 });
 await page.waitForFunction(() => document.querySelector('#link-image-chip .image-state')?.dataset.imageState === 'loaded');
 pass('plain HTML URL preview thumbnails also replace shimmer with real images');
 await page.evaluate(async () => {
  const { useDetailPeek } = await import('/src/components/peek.jsx');
  function Preview() { const peek = useDetailPeek(null); window.__imagePreview = peek; return window.ImageReact.createElement(window.ImageReact.Fragment, null, window.ImageReact.createElement('button', { id: 'preview-anchor', onClick: e => peek.show('product:state-product', e.currentTarget, true) }, '제품 이미지 상세'), peek.node); }
  window.imageTestRoot.render(window.ImageReact.createElement(Preview));
 });
 await page.locator('#preview-anchor').click(); await page.locator('.dpk-main .image-state[data-image-state="loading"]').waitFor();
 await page.locator('.dpk-th').nth(1).locator('.image-state[data-image-state="loaded"]').waitFor();
 assert.equal(await page.locator('.dpk .ill').count(), 0);
 await page.locator('.dpk-th').nth(1).click(); await page.locator('.dpk-main .image-state[data-image-state="loaded"]').waitFor();
 release('gallery-delayed.json'); await page.waitForTimeout(80);
 assert((await page.locator('.dpk-main img').getAttribute('data-image-source')).includes('gallery-ready.json'));
 pass('gallery entries remain visible while loading independently and late images do not change selection');
 await page.evaluate(() => window.__imagePreview.show('solution:state-solution', document.getElementById('preview-anchor'), true));
 await page.locator('.dpk-main .image-state[data-image-state="error"]').waitFor();
 assert.equal(await page.locator('.dpk .ill').count(), 0);
 pass('solution gallery with no primary image displays a load error, not mock artwork or another product');
 await page.evaluate(() => window.__imagePreview.hide());
 await render([{ id: 'motion', src: '/__image-test__/motion-delayed.png' }]); await state('motion', 'loading');
 await page.emulateMedia({ reducedMotion: 'reduce' });
 assert.equal(await frame('motion').locator('.image-state-shimmer').evaluate(el => getComputedStyle(el, '::after').animationName), 'none');
 await page.emulateMedia({ reducedMotion: 'no-preference' }); release('motion-delayed.png'); await state('motion', 'loaded');
 pass('shimmer respects reduced motion preferences');
 await render([{ id: 'cached', src: '/__image-test__/pack-ready.json#0' }]); await state('cached', 'loaded');
 pass('already cached packed images resolve without a permanent loading state');
 await page.clock.install();
 await render([{ id: 'timeout', src: '/__image-test__/timeout-delayed.png' }]); await state('timeout', 'loading');
 await page.clock.fastForward(30010); await state('timeout', 'error');
 assert.equal(await frame('timeout').getAttribute('title'), '이미지 로드 오류');
 release('timeout-delayed.png'); await state('timeout', 'loaded');
 assert(await frame('timeout').locator('img').evaluate(el => el.naturalWidth > 100));
 await page.screenshot({ path: path.join(output, 'loaded.png') });
 pass('a stalled image stops shimmering, and real pixels arriving later can still recover');
 assert.deepEqual(errors, []);
 await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, errors, requested }, null, 2));
 console.log(checks.length + '/' + checks.length + ' image state cases passed');
} catch (error) {
 if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
 throw error;
} finally {
 for (const name of [...pending.keys()]) release(name);
 await browser?.close(); await server.close();
}
