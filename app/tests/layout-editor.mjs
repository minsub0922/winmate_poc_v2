// Real editor/library/Storyboard UI with the app's catalog snapshot. No API server or model calls.
// Run: node app/tests/layout-editor.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import JSZip from '../web/node_modules/jszip/lib/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const web = path.join(root, 'app/web');
const json = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const snapshot = { catalog: json('catalog'), products: json('products_db'), images: json('images'), user: { username: 'editor-test', auth_enabled: false }, capabilities: null };
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const bg = 'img/test-editor-bg.json#0';
const errors = [], results = [];
const output = path.join(root, 'app/tests/output/layout-editor');
fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
let browser, page;
const pass = name => { results.push(name); console.log('PASS ' + name); };
try {
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: snapshot });
    if (url.pathname === '/api/llm') {
      const body = route.request().postDataJSON();
      if (/추천 요청|실행 계획|PPT 편집 결과/.test(body.prompt)) return route.fulfill({ status: 503, json: { code: 'test_no_api', detail: 'Agent live calls are covered in layout-prompt.mjs' } });
      const input = JSON.parse(body.prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]);
      return route.fulfill({ json: { mode: 'real', data: {
        blocks: input.blocks.map(b => ({ i: b.i, action: 'keep', s: b.current, src: [], reason: 'test-only context review of editor fixture' })),
        images: input.images.map(im => ({ i: im.i, action: 'keep', n: -1, reason: 'test-only fixture image is retained' })), replacements: [], missing: []
      } } });
    }
    return route.fulfill({ status: 503, json: { code: 'test_no_api', detail: 'No server/model calls in editor tests' } });
  });
  await context.route('**/img/**', route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    if (rel === 'img/test-editor-bg.json') return route.fulfill({ json: { images: [pixel] } });
    const file = path.resolve(root, rel.startsWith('img/lib/') ? '.' : 'app/data/static', rel);
    if (file.startsWith(root + path.sep) && fs.existsSync(file)) return route.fulfill({ path: file });
    return route.abort();
  });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => console.log('Request failed:', new URL(request.url()).pathname, request.failure()?.errorText));
  page.on('response', response => { if (response.status() >= 400) console.log('HTTP', response.status(), new URL(response.url()).pathname); });
  page.setDefaultTimeout(15000);
  await page.goto(base);
  await page.locator('.app[data-app-ready="true"]').waitFor();
  await page.getByRole('button', { name: /^PPT 레이아웃 템플릿/ }).click();
  await page.locator('.tl-card').first().click();
  const editor = () => page.locator('.modal').filter({ has: page.locator('.myed') });
  const confirm = () => page.getByRole('dialog', { name: '변경 내용을 저장할까요?', exact: true });
  const dismissFeedback = async () => {
    const buttons = page.getByRole('button', { name: '알림 닫기', exact: true });
    // Dismiss expected model-error fixtures by keyboard; fixed guide widgets can overlap notices.
    while (await buttons.count()) { const button = buttons.first(); await button.focus(); await button.press('Enter'); }
  };
  const dismissRecommendation = async () => {
    await page.getByText('추천을 불러오지 못했어요. 직접 요청하거나 다시 불러와 주세요.', { exact: true }).waitFor();
    await dismissFeedback();
  };
  // Expected negative recommendation notices may arrive while a footer control is being clicked.
  const clickFooter = async name => {
    for (let attempt = 0; ; attempt++) {
      await dismissFeedback();
      try { await editor().getByRole('button', { name, exact: true }).last().click({ position: { x: 8, y: 8 }, timeout: 1500 }); return; }
      catch (error) { if (attempt >= 2 || !await page.getByRole('button', { name: '알림 닫기', exact: true }).count()) throw error; }
    }
  };
  const closeEditor = () => clickFooter('닫기');
  const saveEditor = () => clickFooter('저장');
  const editFirstText = async value => {
    const field = editor().locator('.ed-host [data-tb]').first(); await field.dblclick();
    await editor().locator('.ed-host [contenteditable="true"]').fill(value); await page.keyboard.press('Escape');
  };
  const launchEditor = async () => {
    if (!await page.getByRole('button', { name: '수정하기', exact: true }).count()) await page.locator('.tl-card').first().click();
    const previewTools = page.getByRole('toolbar', { name: '레이아웃 작업', exact: true });
    assert(await previewTools.getByRole('button', { name: '수정하기', exact: true }).isVisible());
    assert.equal(await previewTools.locator('.fav-btn.lbl').count(), 1);
    assert.equal(await page.locator('.modal.sheet .mfoot .sv-edit').count(), 0);
    await page.getByRole('button', { name: '수정하기', exact: true }).click();
    await editor().waitFor(); await dismissRecommendation();
    assert.equal(await page.locator('.tl-detail').count(), 0);
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await editor().locator('.ed-save, #ed-name, #ed-part').count(), 0);
  };
  await launchEditor();
  const firstField = editor().locator('.ed-host [data-tb]:visible').first();
  const untouchedHtml = await editor().locator('.ed-host > div').evaluate(el => el.outerHTML);
  await firstField.hover(); await editor().locator('.ed-hover').waitFor();
  assert.match(await editor().locator('.ed-hover').innerText(), /글.*클릭하여 선택/s);
  assert.equal(await editor().locator('.ed-sel').count(), 0); assert.equal(await editor().locator('.ed-h').count(), 0);
  assert.equal(await editor().locator('.ed-host > div').evaluate(el => el.outerHTML), untouchedHtml);
  assert(await editor().getByRole('button', { name: '되돌리기', exact: true }).isDisabled());
  const hoveredBox = await editor().locator('.ed-hover').boundingBox();
  await page.screenshot({ path: path.join(output, 'hover-text.png') });
  await firstField.click(); await editor().locator('.ed-sel').first().waitFor();
  assert.equal(await editor().locator('.ed-hover').count(), 0); assert.equal(await editor().locator('.ed-h').count(), 8);
  const selectedBox = await editor().locator('.ed-sel').first().boundingBox();
  for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(selectedBox[key] - hoveredBox[key]) < 1);
  await page.keyboard.press('Escape'); await editor().locator('.ed-sel').waitFor({ state: 'detached' });
  await firstField.hover(); await editor().locator('.ed-hover').waitFor();
  await editor().locator('.ed-bar').hover(); await editor().locator('.ed-hover').waitFor({ state: 'detached' });
  assert.equal(await editor().locator('.ed-host > div').evaluate(el => el.outerHTML), untouchedHtml);
  pass('Hover previews the actual clickable text frame before selecting; click uses the same bounds and handles; leaving clears hover without dirtying the slide');
  const help = editor().getByRole('button', { name: '고치는 법', exact: true });
  const tip = page.getByRole('tooltip', { name: '레이아웃 수정 방법', exact: true });
  assert.equal(await tip.count(), 0);
  assert.equal(await editor().locator('.ed-keys').count(), 0);
  const position = await help.evaluate(el => { const r = el.getBoundingClientRect(), modal = el.closest('.modal').getBoundingClientRect(); return { right: r.left > modal.left + modal.width * .6, top: r.top < modal.top + 80 }; });
  assert(position.right && position.top);
  await help.hover(); await tip.waitFor();
  assert.equal(await tip.locator('dt').count(), 7);
  assert.match(await tip.innerText(), /이미지 바꾸기/); assert.match(await tip.innerText(), /My 템플릿에 저장/);
  assert.doesNotMatch(await page.locator('body').innerText(), /⌘|Command|커맨드/);
  assert.equal(await page.locator('[title*="⌘"]').count(), 0);
  await page.screenshot({ path: path.join(output, 'editing-help.png') });
  await page.mouse.move(22, 22); await tip.waitFor({ state: 'detached' });
  await help.focus(); await tip.waitFor(); await help.press('Escape'); await tip.waitFor({ state: 'detached' });
  assert(await editor().isVisible());
  await page.setViewportSize({ width: 390, height: 844 });
  await help.click(); await tip.waitFor();
  const mobileTip = await tip.evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
  assert(mobileTip.left >= 10 && mobileTip.right <= mobileTip.width - 10 && mobileTip.bottom <= mobileTip.height - 10);
  await page.screenshot({ path: path.join(output, 'editing-help-mobile.png') });
  await page.setViewportSize({ width: 1500, height: 1000 }); await tip.waitFor({ state: 'detached' });
  pass('Edit replaces the detail popup; top-right hover/focus help is detailed and has no Command labels');
  await closeEditor();
  await editor().waitFor({ state: 'detached' });
  assert.equal(await confirm().count(), 0);
  pass('Untouched editor closes immediately');

  await launchEditor();
  await editFirstText('닫기 검증');
  await closeEditor();
  await confirm().waitFor();
  assert.equal(await editor().locator('.mfoot button').filter({ hasText: /저장하지 않고 닫기|계속 고치기/ }).count(), 0);
  await confirm().getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(await editor().locator('.ed-host [data-tb]').first().innerText(), '닫기 검증');
  await editor().getByRole('button', { name: '닫기', exact: true }).first().click();
  await confirm().waitFor();
  await page.keyboard.press('Escape');
  await confirm().waitFor({ state: 'detached' });
  await editor().getByRole('button', { name: '닫기', exact: true }).first().click();
  await confirm().getByRole('button', { name: '저장 안 함', exact: true }).click();
  await editor().waitFor({ state: 'detached' });
  pass('Footer close and header X ask; Cancel/Escape preserve edits; discard closes only editor');

  await launchEditor();
  await editor().locator('.ed-host [data-tb]').first().click();
  const fontSize = page.getByLabel('글자 크기(px)', { exact: true }); const changedSize = Number(await fontSize.inputValue()) + 2;
  await fontSize.fill(String(changedSize)); await fontSize.press('Escape');
  await confirm().waitFor(); await confirm().getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(await fontSize.inputValue(), String(changedSize));
  await page.locator('.mback').last().click({ position: { x: 3, y: 3 } });
  await confirm().waitFor();
  await confirm().getByRole('button', { name: '저장 안 함', exact: true }).click();
  pass('Element property changes are dirty; Escape and backdrop open save confirmation without a layout-info form');

  await launchEditor();
  const elements=editor().locator('.ed-host [data-tb]'),elementCount=await elements.count();
  await elements.first().click();await page.keyboard.press('Delete');
  const deletion=page.locator('.delete-confirmation');await deletion.waitFor();assert.equal(await elements.count(),elementCount);
  await page.keyboard.press('Escape');await deletion.waitFor({state:'detached'});assert.equal(await elements.count(),elementCount);
  await page.keyboard.press('Delete');await deletion.waitFor();await deletion.getByRole('button',{name:'삭제',exact:true}).click();assert((await elements.count())<elementCount);
  await editor().getByRole('button',{name:'되돌리기',exact:true}).click();assert.equal(await elements.count(),elementCount);
  await editor().getByRole('button',{name:'닫기',exact:true}).last().click();await confirm().waitFor();await confirm().getByRole('button',{name:'저장 안 함',exact:true}).click();
  pass('Keyboard deletion waits for confirmation; Escape preserves the selection, and approved deletion remains undoable');

  await launchEditor();
  await editFirstText('저장 검증');
  await closeEditor();
  await confirm().waitFor();
  await page.evaluate(() => {
    window.__editorTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, ...args) {
      if (this.name === 'winmate-my' && mode === 'readwrite' && String(stores).includes('tpl')) throw new DOMException('test quota', 'QuotaExceededError');
      return window.__editorTransaction.call(this, stores, mode, ...args);
    };
  });
  await confirm().getByRole('button', { name: '저장', exact: true }).click();
  await page.getByText('브라우저 저장 공간이 모자라요.', { exact: false }).waitFor();
  assert.equal(await confirm().count(), 1);
  assert.equal(await editor().locator('.ed-host [data-tb]').first().innerText(), '저장 검증');
  await dismissFeedback();
  await page.evaluate(() => { IDBDatabase.prototype.transaction = window.__editorTransaction; });
  await confirm().getByRole('button', { name: '저장', exact: true }).click();
  await editor().waitFor({ state: 'detached' });
  const savedContent = await page.evaluate(async () => { const repo = await import('/src/repositories/templates.js'); return repo.myList().map(x => repo.rawHtml(x.f)); });
  assert(savedContent.some(html => html.includes('저장 검증')));
  await page.getByRole('heading', { name: 'PPT 레이아웃 템플릿', exact: true }).waitFor();
  assert.equal(await page.locator('[data-library-scope="my"]').count(), 0);
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByText('My 템플릿에 저장했어요', { exact: false }).first().waitFor();
  pass('Save failure preserves edits; Save automatically stores in My and closes with a toast without navigating');

  await page.evaluate(async ({ pixel, bg }) => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const repo = await import('/src/repositories/proposals.js');
    const catalog = await import('/src/services/catalog.js');
    const { LayoutDetail } = await import('/src/components/detail.jsx');
    document.querySelector('.app').style.display = 'none';
    const f = 'L_TEST_EDITOR';
    const html = `<div style="width:1280px;height:720px;position:relative;background:#fff;font-family:sans-serif"><div data-tb="0" style="position:absolute;left:64px;top:64px;width:600px;font-size:30px">원본 제목</div><div data-img="0" data-kind="cut" style="position:absolute;left:64px;top:180px;width:200px;height:200px"><img src="${pixel}" style="width:100%;height:100%;object-fit:contain"></div><div data-sp="hover-shape" style="position:absolute;left:400px;top:180px;width:180px;height:120px"><svg xmlns="http://www.w3.org/2000/svg" width="180" height="120" viewBox="0 0 180 120"><rect width="180" height="120" rx="12" fill="#0b6e64"/></svg></div></div>`;
    catalog.registerLayout({ f, c: 'PH', name: '테스트 레이아웃', p: 'overview', req: [], prods: [], sols: [], ik: ['cut'], ih: [], pc: 1 }, html);
    const id = repo.createProposal();
    repo.update(id, p => {
      p.title = '편집 테스트 제안서'; p.stage = 'story'; p.bg = { theme: 'test', pool: [bg] };
      p.parts = [{ id: 'part-test', type: 'overview', name: '제안 개요', items: [], layouts: [
        { uid: 'sheet-test', f, status: 'done', ov: { t: { 0: '현재 장 제목' }, img: { 0: { src: pixel, name: '현재 이미지', keep: true } }, bg: { src: bg, theme: 'test' } }, ev: { t0: { by: 'ai', src: [] } } },
        { uid: 'sheet-other', f, status: 'empty', ov: { t: {}, img: {} } }
      ] }];
    });
    window.__editorProposal = id;
    window.__editorSource = html;
    const host = document.createElement('div'); document.body.appendChild(host);
    const testRoot = createRoot(host);
    function Subject() {
      const p = repo.useStore(s => s.proposals.find(x => x.id === id));
      return React.createElement(LayoutDetail, { p, partId: 'part-test', uid: 'sheet-test', pageNo: 1, onClose: () => { window.__editorCloseCount = (window.__editorCloseCount || 0) + 1; }, open: () => { window.__behindNavigation = true; } });
    }
    testRoot.render(React.createElement(Subject));
  }, { pixel, bg });
  await page.getByRole('button', { name: '수정하기', exact: true }).click();
  await editor().waitFor(); await dismissRecommendation();
  assert.equal(await page.locator('.detail-left').count(), 0);
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.locator('.ed-host > [data-bg^="blob:"]').waitFor();
  assert.equal(await page.locator('.ed-host [data-tb="0"]').innerText(), '현재 장 제목');
  assert.equal(await page.locator('.ed-host img').first().getAttribute('alt'), '현재 이미지');
  const image = editor().locator('.ed-host [data-img="0"]'), shape = editor().locator('.ed-host [data-sp="hover-shape"] rect');
  const beforeHover = await editor().locator('.ed-host > div').evaluate(el => el.outerHTML);
  await image.hover(); await editor().locator('.ed-hover[data-hover-kind="이미지 칸"]').waitFor();
  assert.equal(await editor().locator('.ed-hover').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await image.dispatchEvent('pointermove', { pointerType: 'touch', buttons: 0 }); await editor().locator('.ed-hover').waitFor({ state: 'detached' });
  await shape.hover(); await editor().locator('.ed-hover[data-hover-kind="도형"]').waitFor();
  await page.screenshot({ path: path.join(output, 'hover-shape.png') });
  await shape.click(); assert.equal(await editor().locator('.ed-h').count(), 8);
  await image.hover(); await editor().locator('.ed-hover[data-hover-kind="이미지 칸"]').waitFor();
  assert.equal(await editor().locator('.ed-h').count(), 8);
  assert.equal(await editor().locator('.ed-host > div').evaluate(el => el.outerHTML), beforeHover);
  await page.screenshot({ path: path.join(output, 'hover-image-with-selection.png') });
  const picture = await image.boundingBox();
  await page.mouse.move(picture.x + picture.width / 2, picture.y + picture.height / 2); await page.mouse.down(); await page.mouse.move(picture.x + picture.width / 2 + 24, picture.y + picture.height / 2 + 12, { steps: 4 });
  assert.equal(await editor().locator('.ed-hover').count(), 0); await page.mouse.up();
  assert((await image.boundingBox()).x > picture.x + 20);
  await editor().getByRole('button', { name: '되돌리기', exact: true }).click();
  await image.click(); const handle = await editor().locator('.ed-h.se').boundingBox(), originalSize = await image.boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 18, handle.y + handle.height / 2 + 12, { steps: 4 });
  assert.equal(await editor().locator('.ed-hover').count(), 0); await page.mouse.up();
  assert((await image.boundingBox()).width > originalSize.width + 12);
  await editor().getByRole('button', { name: '되돌리기', exact: true }).click();
  await editor().locator('.ed-bar').hover();
  pass('Images and nested SVG shapes preview without changing the current selection or slide HTML; touch, dragging and resize handles suppress hover while edits and undo work');
  await page.getByRole('button', { name: '글 상자', exact: true }).click();
  await page.locator('.ed-host [contenteditable="true"]').waitFor();
  await editor().locator('.ed-host [data-img="0"]').hover(); assert.equal(await editor().locator('.ed-hover').count(), 0);
  await page.keyboard.type('추가한 문구');
  await page.keyboard.press('Escape');
  await page.locator('.ed-box').click({ position: { x: 20, y: 20 } });
  await page.getByLabel('배경색 직접 고르기', { exact: true }).fill('#ff0000');
  await closeEditor();
  await confirm().waitFor();
  await page.screenshot({ path: path.join(output, 'save-confirmation.png'), animations: 'disabled' });
  await confirm().getByRole('button', { name: '저장', exact: true }).click();
  await editor().waitFor({ state: 'detached' });
  await page.locator('.detail-left .slide-inner > div').waitFor();
  const state = await page.evaluate(async () => {
    const { getProposal } = await import('/src/repositories/proposals.js');
    const { layoutHtml } = await import('/src/services/catalog.js');
    const p = getProposal(window.__editorProposal), [sheet, other] = p.parts[0].layouts;
    window.__firstEdited = sheet.f;
    return { sheet, other, html: layoutHtml(sheet.f), source: layoutHtml('L_TEST_EDITOR'), original: window.__editorSource, navigated: !!window.__behindNavigation };
  });
  assert.match(state.sheet.f, /^L_MY_/);
  assert.deepEqual(state.sheet.ov.t, {}); assert.deepEqual(state.sheet.ov.img, {}); assert.ok(Object.values(state.sheet.ev).every(e => e.reason?.includes('test-only')));
  assert.equal(state.sheet.ov.bg.embedded, true); assert.equal(state.other.f, 'L_TEST_EDITOR');
  assert.equal(state.source, state.original); assert.equal(state.navigated, false);
  assert.ok(state.html.includes('현재 장 제목') && state.html.includes('추가한 문구'));
  assert.equal(await page.locator('.detail-left .slide-inner > div').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 0, 0)');
  pass('Storyboard uses filled values, saves a copy, applies edited structure/background to this sheet only');

  await page.getByRole('button', { name: '수정하기', exact: true }).click();
  await editor().waitFor(); await dismissRecommendation();
  assert.equal(await page.locator('.ed-host > div').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 0, 0)');
  await editFirstText('현재 장 제목 · 재수정');
  await saveEditor();
  await editor().waitFor({ state: 'detached' });
  const copies = await page.evaluate(async () => {
    const repo = await import('/src/repositories/proposals.js'), tpl = await import('/src/repositories/templates.js');
    return { proposalId: window.__editorProposal, current: repo.getProposal(window.__editorProposal).parts[0].layouts[0].f, first: window.__firstEdited, names: tpl.myList().map(m => m.name) };
  });
  assert.notEqual(copies.current, copies.first);
  assert(copies.names.length >= 3);
  const pptx = await page.evaluate(async () => {
    const { getProposal } = await import('/src/repositories/proposals.js');
    const { exportPptx } = await import('/src/domain/slides/export-pptx.js');
    const sheet = getProposal(window.__editorProposal).parts[0].layouts[0];
    const blob = await exportPptx([sheet], { title: 'Storyboard 편집 검증' });
    return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
  });
  const zip = await JSZip.loadAsync(Buffer.from(pptx, 'base64'));
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.ok(xml.includes('현재 장 제목') && xml.includes('추가한 문구'));
  assert.ok([...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].some(([shape]) =>
    shape.includes('<a:off x="0" y="0"/>') && shape.includes('<a:ext cx="12192000" cy="6858000"/>') && /val="FF0000"/i.test(shape)), 'PPTX has the edited full-slide background fill');
  fs.writeFileSync(path.join(output, 'storyboard-edited.pptx'), Buffer.from(pptx, 'base64'));
  await page.screenshot({ path: path.join(output, 'storyboard-edited.png'), animations: 'disabled' });
  pass('Re-editing a My-based Storyboard sheet preserves its original; PPTX keeps text and edited background');
  await page.waitForFunction(f => JSON.parse(localStorage.getItem('winmate.v2.proposals') || '[]').some(p => p.parts.some(s => s.layouts.some(x => x.f === f))), copies.current);
  await page.reload();
  await page.locator('.app[data-app-ready="true"]').waitFor();
  const restored = await page.evaluate(async ({ f, proposalId }) => {
    const { L, layoutHtml } = await import('/src/services/catalog.js');
    const { getProposal } = await import('/src/repositories/proposals.js');
    return { exists: !!L[f], html: layoutHtml(f), proposal: getProposal(proposalId) };
  }, { f: copies.current, proposalId: copies.proposalId });
  assert.equal(restored.exists, true);
  assert.ok(restored.html.includes('현재 장 제목') && restored.html.includes('추가한 문구') && restored.html.includes('rgb(255, 0, 0)'));
  assert.equal(restored.proposal.parts[0].layouts[0].f, copies.current);
  assert.deepEqual(errors, []);
  pass('Edited template and its baked content survive a full page reload');
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: results, pageErrors: errors }, null, 2));
  fs.rmSync(path.join(output, 'failure.png'), { force: true });
} catch (error) {
  console.error('Page errors:', errors);
  if (page && !page.isClosed()) {
    console.error((await page.locator('body').innerText()).slice(0, 2000));
    await page.screenshot({ path: path.join(output, 'failure.png') });
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
