// Completion controls stay removed from saved Storyboards and the PPT viewer; loading and sheet actions remain available.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const bootstrap = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null,
  user: { username: 'completion-test', auth_enabled: false } };
const output = path.join(root, 'app/tests/output/layout-complete'); fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const checks = [], errors = []; const pass = name => { checks.push(name); console.log('PASS', name); };
let browser, page;
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await context.route(url => url.pathname.startsWith('/api/'), route => new URL(route.request().url()).pathname === '/api/bootstrap'
    ? route.fulfill({ json: bootstrap }) : route.fulfill({ status: 503, json: { code: 'test_no_api' } }));
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port); await page.locator('.home').waitFor();
  await page.evaluate(async () => {
    const { myMeta, saveTemplates } = await import('/src/repositories/templates.js');
    const { saveUi } = await import('/src/repositories/proposals.js');
    const html = '<div style="position:relative;width:1280px;height:720px;background:#f1f8f5"><div data-tb="0" style="position:absolute;left:80px;top:80px;font-size:42px;color:#123e2b">작업완료 검증용 장표</div></div>';
    await saveTemplates(['L_MY_WORK_TEST', 'L_MY_WORK_COVER'].map((f, i) => ({ meta: myMeta({ f, name: i ? '표지 · 작업완료 검증' : '작업완료 검증', p: i ? 'cover' : 'overview', kind: 'edit', nT: 1 }), html })));
    const sheet = (uid, f = 'L_MY_WORK_TEST', extra = {}) => ({ uid, f, status: 'partial', ov: { t: {}, img: {} }, ev: {},
      adaptation: { version: 3, phase: 'ready', missing: [], ...extra } });
    const proposal = { id: 'work-test', title: '작업완료 검증 제안서', customer: '검증 고객', ind: null, stage: 'story', createdAt: 1, updatedAt: 1,
      reqTab: 'free', req: { free: [{ t: '검증용 요구사항' }], form: { project: '', customer: '', target: '', keymen: [], note: '' }, files: [] },
      ctx: { products: [], solutions: [], cases: [] }, parts: [
        { id: 'cover', deck: true, name: '표지', type: 'cover', done: true, items: [], layouts: [{ ...sheet('cover', 'L_MY_WORK_COVER'), status: 'done' }] },
        { id: 'part', name: '제안 개요', type: 'overview', done: true, items: [], layouts: [{ ...sheet('first'), status: 'done' }, sheet('second'), sheet('review', undefined, { phase: 'retained', needsReview: true })] },
      ] };
    localStorage.setItem('winmate.v2.proposals', JSON.stringify([proposal]));
    saveUi({ route: { name: 'proposal', id: proposal.id }, viewer: false });
  });
  await page.reload();
  const card = uid => page.locator(`[data-layout-uid="${uid}"]`);
  const state = () => page.evaluate(async () => (await import('/src/repositories/proposals.js')).getProposal('work-test'));
  const closeDetail = () => page.locator('.modal.sheet').getByRole('button', { name: '닫기', exact: true }).last().click();
  const noCompletion = async scope => {
    assert.equal(await scope.locator('.layout-complete, .lcard.st-done, .vslide.st-done, .vthumb.st-done, .lcard .stbadge.done, .viewer .stbadge.done, .vthumb .ok').count(), 0);
    assert.equal(await scope.getByRole('button', { name: /^(작업완료|작업완료 취소)$/ }).count(), 0);
  };
  await card('first').waitFor();
  const before = await state();
  await card('first').hover();
  await noCompletion(page);
  // Move the pointer off the cards so hover styling does not affect the comparison.
  await page.mouse.move(1400, 30);
  const restingBorders = await Promise.all(['first', 'second', 'review'].map(uid => card(uid).evaluate(el => {
    const style = getComputedStyle(el); return [style.borderTopColor, style.borderTopWidth];
  })));
  assert.deepEqual(restingBorders[0], restingBorders[1]);
  assert.deepEqual(restingBorders[0], restingBorders[2]);
  assert(!(await page.locator('.lay-toggle').innerText()).includes('완료'));
  assert.equal(await page.locator('.lay-toggle .lt-bar').count(), 0);
  await card('first').screenshot({ path: output + '/completed.png' });
  pass('saved completed, partial and review sheets share the same border and have no completion controls or progress marks');

  await page.reload(); await card('first').waitFor(); await noCompletion(page);
  await card('first').hover(); await card('first').locator('.fav-btn').click();
  assert.equal(await card('first').locator('.fav-btn').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await card('first').click({ position: { x: 140, y: 90 } }); await page.locator('.modal.sheet .detail').waitFor();
  assert.equal(await page.locator('.modal.sheet .done-toggle').count(), 0);
  assert(await page.getByRole('button', { name: '수정하기', exact: true }).isVisible()); await closeDetail();
  assert.deepEqual((await state()).parts, before.parts);
  pass('refresh, favourites and opening sheet details preserve saved sheet content and status');

  await page.locator('.lay-toggle').click(); await page.locator('.viewer').waitFor();
  await page.locator('.vstrip .vthumb').first().click(); await page.locator('.vslide').hover();
  await noCompletion(page.locator('.viewer'));
  assert(!(await page.locator('.viewer .cnt').innerText()).includes('완료'));
  assert(await page.locator('.vslide .fav-btn').isVisible());
  await page.screenshot({ path: output + '/viewer.png' });
  pass('PPT viewer cover, main slide and thumbnails have no completion marks or count');
  await page.locator('.lay-toggle').click();

  await page.evaluate(async () => {
    const { update } = await import('/src/repositories/proposals.js');
    update('work-test', draft => { draft.parts[1].layouts[1].adaptation.phase = 'running'; });
  });
  await card('second').locator('.context-slide.shimmer').waitFor(); // 채우는 중에는 저장된 내용이 있어도 shimmer 만(글 · 별표 없음 — 2026-11-17)
  assert.equal(await card('second').getByText('맥락에 맞게 채우는 중').count(), 0);
  await noCompletion(page);
  await page.evaluate(async () => {
    const { update } = await import('/src/repositories/proposals.js');
    update('work-test', draft => { draft.parts[1].layouts[1].adaptation.phase = 'ready'; });
  });
  await card('second').locator('.context-slide.shimmer').waitFor({ state: 'detached' });
  assert(await card('second').locator('.slide').isVisible());
  pass('a sheet being filled shows a shimmer (no badge · no icon) until sheet generation finishes, then its sheet');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    storageState: await context.storageState({ indexedDB: true }), reducedMotion: 'reduce' });
  await mobileContext.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await mobileContext.route(url => url.pathname.startsWith('/api/'), route => new URL(route.request().url()).pathname === '/api/bootstrap'
    ? route.fulfill({ json: bootstrap }) : route.fulfill({ status: 503, json: { code: 'test_no_api' } }));
  const mobile = await mobileContext.newPage(); mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(page.url()); await mobile.locator('[data-layout-uid="second"]').waitFor();
  await noCompletion(mobile);
  await mobileContext.close(); pass('touch screens also have no completion controls');

  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { StoryCanvas } = await import('/src/components/storyboard.jsx'); const { getProposal } = await import('/src/repositories/proposals.js');
    const host = document.createElement('div'); document.body.append(host); document.querySelector('.app').style.display = 'none';
    createRoot(host).render(React.createElement(StoryCanvas, { p: getProposal('work-test'), readOnly: true, pageOf: () => 1, open: () => {} }));
  });
  await page.locator('.canvas-wrap.ro').waitFor(); await noCompletion(page.locator('.canvas-wrap.ro'));
  assert.deepEqual(errors, []); pass('read-only Storyboards have no completion marks and no browser errors');
  fs.writeFileSync(output + '/report.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length}/${checks.length} layout completion checks passed`);
} finally {
  await browser?.close(); await server.close();
}
