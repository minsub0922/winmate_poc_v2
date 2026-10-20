// Real catalog, image picker, search and large-pack range responses. No model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root, 'img/lib/index.json')));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'image-pagination-test', auth_enabled: false } };
const source = index.images.find(image => image.p?.includes('qm55c'));
const output = path.join(root, 'app/tests/output/image-pagination'); fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const checks = [], errors = [], transfers = [], files = new Map(); const pass = text => { checks.push(text); console.log('PASS', text); };
let browser, page;
try {
  await server.listen(); browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce' });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await context.route(url => url.pathname.startsWith('/api/'), route => new URL(route.request().url()).pathname === '/api/bootstrap'
    ? route.fulfill({ json: boot }) : route.fulfill({ status: 503, json: { code: 'test_no_api' } }));
  await context.route('**/img/**', route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const filename = [path.join(root, name), path.join(root, 'reference/live', name), path.join(root, 'app/data/static', name)].find(filename => fs.existsSync(filename));
    if (!filename) return route.abort();
    if (/^img\/lib\/p\d+\.json$/.test(name)) {
      const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range || '');
      if (!range) { transfers.push({ name, full: true }); return route.fulfill({ status: 500, body: 'test forbids full image packs' }); }
      if (!files.has(filename)) files.set(filename, fs.readFileSync(filename));
      const bytes = files.get(filename), start = Number(range[1]), end = Number(range[2]);
      const body = bytes.subarray(start, end + 1); transfers.push({ name, bytes: body.length });
      return route.fulfill({ status: 206, contentType: 'text/plain', headers: { 'Content-Range': 'bytes ' + start + '-' + end + '/' + bytes.length }, body });
    }
    return route.fulfill({ path: filename });
  });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port); await page.locator('.home').waitFor();
  await page.evaluate(async source => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { ImagePicker } = await import('/src/components/imagepick.jsx');
    document.querySelector('.app').style.display = 'none'; const host = document.createElement('div'); document.body.appendChild(host);
    createRoot(host).render(React.createElement(ImagePicker, { current: { src: source.a, name: 'QM55C', products: ['qm55c'] }, slot: { kind: 'cut', hint: 'QM55C' },
      models: ['QM55C'], context: { products: ['qm55c'], solutions: [], cases: [] }, onPick: value => { window.__pickedImage = value; }, onClose: () => {} }));
  }, source);
  const picker = page.getByRole('dialog', { name: '이미지 넣기', exact: true }), cards = picker.locator('.imgopt');
  await picker.waitFor();
  await page.waitForFunction(() => !document.querySelector('.image-picker [role="status"]'));
  await page.waitForFunction(() => document.querySelectorAll('.image-picker .imgopt').length === 21);
  assert.equal(await picker.getByRole('group', { name: '이미지 범위', exact: true }).count(), 0);
  assert.equal(await picker.getByRole('group', { name: '분류', exact: true }).count(), 1);
  for (const label of ['전체', '제품 컷', '설치 사례', '공식 연출', '솔루션 화면', '생성 이미지']) assert(await picker.getByRole('button', { name: label, exact: true }).isVisible());
  assert.equal(await picker.locator('.imgrid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 7);
  assert.equal(await picker.locator('h3, h4').count(), 0);
  assert((await cards.first().innerText()).includes('QM55C') || (await cards.first().innerText()).includes('QMC'));
  await page.waitForTimeout(200); assert.equal(await cards.count(), 21);
  await page.screenshot({ path: output + '/initial.png', animations: 'disabled' });
  pass('desktop shows seven columns and 21 initial images, related first, with restored category filters and no scope toggle or section headings');
  const scrollNext = async expected => {
    const body = picker.locator('.mbody');
    const scrollable = await body.evaluate(element => element.scrollHeight > element.clientHeight);
    if (scrollable) await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
    else { await body.hover(); await page.mouse.wheel(0, 600); }
    await page.waitForFunction(expected => document.querySelectorAll('.image-picker .imgopt').length === expected, expected);
    const sources = await cards.evaluateAll(items => items.map(item => item.querySelector('img').getAttribute('data-image-source')));
    assert.equal(new Set(sources).size, sources.length); assert.equal(await cards.count(), expected);
  };
  await scrollNext(42); await scrollNext(63); pass('scroll appends exactly 21 more images each time without duplicate assets');
  await picker.getByRole('button', { name: '설치 사례', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.image-picker .imgopt').length === 21);
  assert((await picker.locator('.imgopt .g').allTextContents()).every(text => /사례|현장/.test(text)));
  assert.equal(await picker.locator('.mbody').evaluate(element => element.scrollTop), 0);
  await picker.getByRole('button', { name: '솔루션 화면', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.image-picker .imgopt').length === 21);
  assert((await picker.locator('.imgopt .g').allTextContents()).every(text => /화면|구성도|솔루션/.test(text)));
  await picker.getByRole('button', { name: '전체', exact: true }).click();
  pass('case and solution filters apply to the full library and restart pagination at 21');
  await picker.locator('#im-q').fill('갤럭시');
  await page.waitForFunction(() => document.querySelectorAll('.image-picker .imgopt').length === 21);
  assert((await cards.first().innerText()).includes('갤럭시'));
  assert.equal(await picker.locator('.mbody').evaluate(element => element.scrollTop), 0);
  await scrollNext(42); pass('search covers the entire library, resets to 21 results and paginates on scroll');
  await picker.locator('#im-q').fill('존재하지않는이미지검증문구'); await picker.getByText('맞는 이미지가 없어요. 파일을 직접 넣어 보세요.', { exact: true }).waitFor();
  assert.equal(await cards.count(), 0); assert.equal(await picker.locator('.image-picker-next').count(), 0);
  await picker.locator('#im-q').fill('QM55C'); await cards.first().waitFor();
  const selected = await cards.first().getAttribute('data-image-id'); await picker.getByRole('button', { name: '전체 보이기', exact: true }).click(); await cards.first().click();
  const picked = await page.evaluate(() => window.__pickedImage); assert.equal(picked.pid, selected); assert.equal(picked.fit, 'contain'); assert.equal(picked.keep, true);
  pass('empty results, image selection and sizing controls remain correct');
  await page.setViewportSize({ width: 390, height: 844 }); await picker.locator('#im-q').fill('갤럭시');
  await page.waitForFunction(() => document.querySelectorAll('.image-picker .imgopt').length === 21);
  assert(await picker.locator('.mbody').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  await page.screenshot({ path: output + '/mobile.png', animations: 'disabled' });
  assert(transfers.length > 0); assert(transfers.every(transfer => !transfer.full), JSON.stringify(transfers));
  assert.deepEqual(errors, []); pass('mobile stays within the screen; large packs are requested only as individual byte ranges');
  fs.writeFileSync(output + '/report.json', JSON.stringify({ checks, errors, transfers }, null, 2)); fs.rmSync(output + '/failure.png', { force: true });
  console.log(`${checks.length}/${checks.length} image pagination checks passed`);
} catch (error) { await page?.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error; }
finally { await browser?.close(); await server.close(); }
