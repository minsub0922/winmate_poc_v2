// Real layout detail and catalog, deterministic public-link metadata, no model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'sheet-sources-test', auth_enabled: false } };
const f = boot.catalog.layouts.find(l => l.p === 'products').f;
const fixture = { id: 'sources-test', title: '참고 자료 검증', customer: '검증 고객', ind: 'FB', stage: 'story', reqTab: 'free', createdAt: 1, updatedAt: 1,
  req: { free: [{ t: '자유형식 고객 요구사항 원문' }], form: { project: '자료 검증', customer: '검증 고객', target: '운영팀', note: '제작자 메모 원문', keymen: [{ id: 'keyman', name: '운영 책임자', weight: 100, reqs: [[{ t: '키맨 요구사항 전체 원문' }]] }] },
    files: [{ id: 'file', name: '고객자료.pdf', type: 'pdf', size: 2048, memo: '첨부파일 메모 원문', text: '첨부파일 본문\n' + '본문 줄\n'.repeat(300) + '본문 마지막 줄' }] },
  ctx: { products: ['qm55c', 'oh55a'], solutions: [], cases: ['1490'] },
  parts: [{ id: 'part', name: '제품 제안', type: 'products', done: true, items: [], layouts: ['first', 'second'].map(uid => ({ uid, f, status: 'partial', ov: { t: {}, img: {} } })) }] };
const output = path.join(root, 'app/tests/output/sheet-sources'); fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const checks = [], errors = [], waiting = []; const pass = text => { checks.push(text); console.log('PASS', text); };
let browser, page, metadataReleased = false;
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  await context.route('https://api.microlink.io/**', async route => {
    if (!metadataReleased) await new Promise(resolve => waiting.push(resolve));
    return route.fulfill({ json: { status: 'success', data: { title: '검증용 웹 소스 제목', publisher: '검증 기관', description: '링크에서 읽은 상세 메타데이터 설명',
      logo: { url: 'http://127.0.0.1:' + server.httpServer.address().port + '/__source-icon.svg' },
      image: { url: 'http://127.0.0.1:' + server.httpServer.address().port + '/img/cover/GEN.jpg' } } } });
  });
  await context.route('**/__source-icon.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#1428a0"/><path d="M8 10h16M8 16h16M8 22h10" stroke="white" stroke-width="3"/></svg>' }));
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname.startsWith('/api/product-packs/')) return route.fulfill({ path: path.join(root, 'reference/live/img/prod/d00.json') });
    return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  await context.route('**/img/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const filename = [path.join(root, relative), path.join(root, 'reference/live', relative), path.join(root, 'app/data/static', relative)].find(filename => fs.existsSync(filename));
    return filename ? route.fulfill({ path: filename }) : route.abort();
  });
  await context.addInitScript(p => { if (localStorage.getItem('__sheetSourcesSeeded')) return;
    localStorage.setItem('winmate.v2.proposals', JSON.stringify([p])); localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'proposal', id: p.id } })); localStorage.setItem('__sheetSourcesSeeded', '1');
    localStorage.setItem('wm-linkmeta-v1', JSON.stringify({ 'https://kosis.kr': { title: '이전 썸네일 메타데이터', img: '/obsolete-thumbnail.jpg', done: true, src: 'web' } }));
  }, fixture);
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.locator('[data-layout-uid="first"]').click(); await page.locator('.modal.sheet .detail').waitFor();
  const original = await page.evaluate(async () => (await import('/src/repositories/proposals.js')).getProposal('sources-test'));
  const panel = page.locator('.detail-right');
  assert(await panel.locator('.sheet-web-loading').count() > 0);
  metadataReleased = true; while (waiting.length) waiting.shift()();
  const products = panel.locator('.sheet-source-grid.product .sheet-source-card');
  assert.equal(await products.count(), 2);
  const positions = await products.evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
  assert.equal(positions[0].y, positions[1].y); assert(positions[0].right < positions[1].left);
  assert.equal(await panel.locator('.km-spec, .km-list, .cs-proof, .reqq, .fsrc').count(), 0);
  assert(await products.first().locator('.sheet-source-photo').evaluate(el => el.clientHeight > 100));
  await products.first().locator('[data-image-state="loaded"]').waitFor();
  await products.first().hover(); await page.locator('.dpk').waitFor();
  assert((await page.locator('.dpk').innerText()).includes('QM55C'));
  const hoverSpecs = page.locator('.dpk .dpk-spec-section'); await hoverSpecs.locator('table').waitFor();
  assert(await hoverSpecs.locator('td').allTextContents().then(values => values.includes('138.7 cm')));
  assert.equal(await page.locator('.dpk .dpk-scroll').evaluate(el => el.lastElementChild.classList.contains('dpk-spec-section')), true);
  const hoverBounds = await page.locator('.dpk').boundingBox();
  assert(hoverBounds.height <= 480.1, JSON.stringify({ bounds: hoverBounds, style: await page.locator('.dpk').getAttribute('style') }));
  await page.locator('.dpk .dpk-scroll').hover();
  assert(await page.locator('.dpk .dpk-scroll').evaluate(el => el.scrollHeight > el.clientHeight));
  await page.locator('.dpk .dpk-scroll').evaluate(el => { el.scrollTop = 200; });
  assert(await page.locator('.dpk').isVisible());
  await hoverSpecs.scrollIntoViewIfNeeded(); assert.equal(await hoverSpecs.locator('tr').count(), 10);
  await hoverSpecs.getByRole('button', { name: /행 더 보기$/ }).click(); assert.equal(await hoverSpecs.locator('tr').count(), 46);
  await hoverSpecs.getByRole('button', { name: '스펙 접기', exact: true }).click(); assert.equal(await hoverSpecs.locator('tr').count(), 10);
  await page.screenshot({ path: output + '/product-specs-hover.png', animations: 'disabled' });
  await page.keyboard.press('Escape'); await page.locator('.dpk').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.modal.sheet').count(), 1);
  pass('products use two image-led columns with only names/categories, and hover exposes full details');
  pass('Hover specs are the final section, show real selected-model values and expand/collapse without hiding the parent layout');

  await products.first().click(); const productDetail = page.getByRole('dialog').filter({ has: page.locator('.reference-detail-body') }); await productDetail.waitFor();
  assert.equal(await page.getByRole('dialog').count(), 2);
  assert(await productDetail.locator('.dpk-card').isVisible());
  assert(await productDetail.getByRole('heading', { name: '이 장에 넣을 이미지', exact: true }).isVisible());
  const popupSpecs = productDetail.locator('.dpk-spec-section'); await popupSpecs.locator('table').waitFor();
  assert.equal(await productDetail.locator('.dpk-scroll').evaluate(el => el.lastElementChild.classList.contains('dpk-spec-section')), true);
  assert(await productDetail.locator('.sheet-source-images').evaluate(el => !!(el.compareDocumentPosition(el.parentElement.querySelector('.dpk-spec-section')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  await popupSpecs.scrollIntoViewIfNeeded(); await popupSpecs.getByRole('button', { name: /행 더 보기$/ }).click(); assert.equal(await popupSpecs.locator('tr').count(), 46);
  await page.screenshot({ path: output + '/product-specs-popup.png', animations: 'disabled' });
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape'); await productDetail.waitFor({ state: 'detached' });
  assert.equal(await page.locator('.modal.sheet').count(), 1);
  assert((await page.locator('.modal.sheet .mhead').innerText()).includes(boot.catalog.layouts.find(l => l.f === f).name));
  pass('click opens a persistent product detail; Escape closes only the nested popup and arrows preserve the selected sheet');
  pass('Click-popup specs stay after reference details and insertable images, and the complete table is readable');

  const cases = panel.locator('.sheet-source-grid.case .sheet-source-card'); await cases.first().scrollIntoViewIfNeeded();
  const casePositions = await cases.evaluateAll(cards => cards.slice(0, 2).map(card => card.getBoundingClientRect().toJSON()));
  assert.equal(casePositions[0].y, casePositions[1].y); assert(casePositions[0].right < casePositions[1].left);
  assert.match(await panel.locator('.evsec').first().getByRole('heading').innerText(), /^제품\s*2$/);
  assert.equal(await cases.first().locator('.sheet-source-caption > span').count(), 0);
  await cases.first().hover(); await page.locator('.dpk').waitFor(); await page.keyboard.press('Escape');
  await cases.first().click(); assert.equal(await page.getByRole('dialog').count(), 2); await page.keyboard.press('Escape');
  pass('case tiles show the case name and a large image, with hover and click details');

  await panel.getByRole('button', { name: '고객 자료 보기', exact: true }).hover(); const customer = page.getByRole('dialog', { name: '고객 자료', exact: true });
  await customer.waitFor(); const text = await customer.innerText();
  for (const expected of ['자유형식 고객 요구사항 원문', '키맨 요구사항 전체 원문', '제작자 메모 원문', '고객자료.pdf', '첨부파일 메모 원문', '본문 마지막 줄']) assert(text.includes(expected), expected);
  assert.equal(await page.locator('.modal').count(), 1);
  assert((await customer.boundingBox()).height <= 520);
  await customer.locator('.sheet-customer-hover-body').hover();
  await customer.locator('.sheet-customer-hover-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
  assert(await customer.isVisible());
  await page.screenshot({ path: output + '/customer.png', animations: 'disabled' }); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.modal.sheet').count(), 1);
  pass('customer materials open on hover, allow pointer entry and scrolling, and preserve complete requirements, notes and attachments');

  await page.waitForFunction(() => !document.querySelector('.sheet-web-loading'));
  const web = panel.locator('.sheet-web-link'); await web.first().scrollIntoViewIfNeeded();
  await web.first().locator('[data-image-state="loaded"]').waitFor();
  assert((await web.first().innerText()).includes('검증용 웹 소스 제목'));
  assert(!(await web.first().innerText()).includes('검증 기관'));
  const address = new URL(await web.first().getAttribute('href'));
  assert.equal(await web.first().locator('.sheet-web-caption > span').innerText(), address.hostname.replace(/^www\./, '') + address.pathname.replace(/\/$/, ''));
  assert.equal(await web.first().locator('.sheet-web-caption > *').count(), 2);
  assert.equal(await web.first().locator('.wk, .sheet-web-photo').count(), 0);
  assert((await web.first().locator('img').getAttribute('data-image-source')).endsWith('/__source-icon.svg'));
  await page.evaluate(async () => (await import('/src/services/links.js')).linkTags.resolve('https://kosis.kr', { icon: true }));
  const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('wm-linkmeta-v1')));
  assert(cache['https://kosis.kr'].icon.endsWith('/__source-icon.svg'));
  const webPositions = await web.evaluateAll(cards => cards.slice(0, 2).map(card => card.getBoundingClientRect().toJSON()));
  assert.equal(webPositions[0].y, webPositions[1].y); assert(webPositions[0].right < webPositions[1].left);
  assert(webPositions[0].height <= 52);
  await web.first().hover(); const webPreview = page.getByRole('tooltip').filter({ has: page.locator('.sheet-web-preview-body') }); await webPreview.waitFor();
  assert((await webPreview.innerText()).includes('링크에서 읽은 상세 메타데이터 설명'));
  assert.equal(await webPreview.locator('img, .sheet-web-photo, .sheet-web-icon').count(), 0);
  assert.equal(await webPreview.getByRole('link', { name: '웹 소스 열기', exact: true }).getAttribute('href'), await web.first().getAttribute('href'));
  await webPreview.hover(); await page.waitForTimeout(220); assert(await webPreview.isVisible());
  const bounds = await webPreview.boundingBox(); assert(bounds.x >= 12 && bounds.x + bounds.width <= 1488 && bounds.y >= 12 && bounds.y + bounds.height <= 988);
  await page.screenshot({ path: output + '/web-hover.png', animations: 'disabled' }); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.modal.sheet').count(), 1);
  pass('web links use metadata icons and title/address only in two compact columns; old caches refresh icons and hover details contain no images');

  const after = await page.evaluate(async () => (await import('/src/repositories/proposals.js')).getProposal('sources-test'));
  assert.deepEqual(after, original); pass('browsing every reference preserves the proposal and its evidence');
  await products.first().scrollIntoViewIfNeeded(); await page.mouse.move(1, 1); await page.screenshot({ path: output + '/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await products.first().scrollIntoViewIfNeeded();
  assert.equal(await products.evaluateAll(cards => cards[0].getBoundingClientRect().y === cards[1].getBoundingClientRect().y), true);
  assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await products.first().click(); await productDetail.waitFor(); const mobileBounds = await productDetail.boundingBox(); assert(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 390);
  await popupSpecs.scrollIntoViewIfNeeded(); assert(await popupSpecs.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: output + '/mobile.png' }); await page.keyboard.press('Escape');
  assert.equal(await page.locator('.modal.sheet').count(), 1); pass('small screens retain both product columns and bounded click details');
  await web.first().scrollIntoViewIfNeeded(); await page.mouse.move(1, 1);
  assert(await web.evaluateAll(links => links[0].getBoundingClientRect().y === links[1].getBoundingClientRect().y));
  assert(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: output + '/web-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { DetailCard } = await import('/src/components/peek.jsx');
    const host = document.createElement('div'); host.id = 'spec-qa-host'; host.style.cssText = 'position:fixed;inset:20px;z-index:160;background:var(--surface);overflow:auto'; document.body.appendChild(host);
    const root = createRoot(host); window.renderSpecCheck = id => root.render(React.createElement(DetailCard, { key:id, r:'product:' + id })); window.renderSpecCheck('qm65c');
  });
  const specCheck = page.locator('#spec-qa-host .dpk-spec-section'); await specCheck.locator('table').waitFor();
  assert((await specCheck.innerText()).includes('65"')); assert(!(await specCheck.innerText()).includes('138.7 cm')); assert.equal(await specCheck.locator('tr').count(), 1);
  assert((await specCheck.innerText()).includes('선택 모델 요약'));
  await page.evaluate(() => window.renderSpecCheck('hoteltv')); await page.locator('#spec-qa-host .dpk-model').getByText('HG55BU', { exact:true }).waitFor();
  assert((await specCheck.innerText()).includes('LYNK Cloud 연동')); assert.equal(await specCheck.locator('tr').count(), 1);
  pass('A 65-inch variant never displays the 55-inch PDP specs, and curated products without detail packs still show verified summary specs');
  assert.deepEqual(errors, []); fs.writeFileSync(output + '/report.json', JSON.stringify({ checks, errors }, null, 2));
  fs.rmSync(output + '/failure.png', { force: true });
  console.log(`${checks.length}/${checks.length} sheet source checks passed`);
} catch (error) {
  await page?.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error;
} finally {
  while (waiting.length) waiting.shift()(); await browser?.close(); await server.close();
}
