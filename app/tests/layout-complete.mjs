// Real Storyboard, detail and PPT viewer, with deterministic saved sheets and no model calls.
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
        { id: 'cover', deck: true, name: '표지', type: 'cover', done: true, items: [], layouts: [sheet('cover', 'L_MY_WORK_COVER')] },
        { id: 'part', name: '제안 개요', type: 'overview', done: true, items: [], layouts: [sheet('first'), sheet('second'), sheet('review', undefined, { phase: 'retained', needsReview: true })] },
      ] };
    localStorage.setItem('winmate.v2.proposals', JSON.stringify([proposal]));
    saveUi({ route: { name: 'proposal', id: proposal.id }, viewer: false });
  });
  await page.reload();
  const card = uid => page.locator(`[data-layout-uid="${uid}"]`);
  const button = uid => card(uid).locator('.layout-complete');
  const state = () => page.evaluate(async () => (await import('/src/repositories/proposals.js')).getProposal('work-test'));
  const closeDetail = () => page.locator('.modal.sheet').getByRole('button', { name: '닫기', exact: true }).last().click();
  await card('first').waitFor();
  assert.equal(await button('first').evaluate(el => getComputedStyle(el).opacity), '0');
  await card('first').hover(); await button('first').waitFor({ state: 'visible' });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-layout-uid="first"] .layout-complete')).opacity === '1');
  await button('first').hover(); assert.equal(await button('first').getAttribute('title'), '작업완료');
  const geometry = await card('first').evaluate(el => {
    const b = el.querySelector('.layout-complete').getBoundingClientRect(), fav = el.querySelector('.fav-btn').getBoundingClientRect();
    return { adjacent: b.right < fav.left && fav.left - b.right <= 8, sameRow: Math.abs(b.y - fav.y) < 1,
      green: getComputedStyle(el.querySelector('.layout-complete')).color };
  });
  assert(geometry.adjacent && geometry.sameRow); assert.notEqual(geometry.green, 'rgb(0, 0, 0)');
  await card('first').screenshot({ path: output + '/hover.png' });
  pass('green check appears on hover next to favourite, with the 작업완료 tooltip');

  const before = await state(); await button('first').click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await button('first').getAttribute('aria-pressed'), 'true');
  assert.match(await card('first').getAttribute('class'), /st-done/);
  assert.equal(await card('first').locator('.stbadge.done').count(), 0);
  assert(!(await card('first').innerText()).includes('입력 완료'));
  const after = await state();
  assert.deepEqual(after.parts[0], before.parts[0]);
  assert.deepEqual(after.parts[1].layouts.slice(1), before.parts[1].layouts.slice(1));
  assert.deepEqual(after.parts[1].layouts[0], { ...before.parts[1].layouts[0], status: 'done' });
  await page.locator('.topbar').click({ position: { x: 600, y: 20 } }); await page.mouse.move(1400, 30);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-layout-uid="first"] .layout-complete')).opacity === '0');
  await card('first').screenshot({ path: output + '/completed.png' });
  pass('click completes only this instance, leaves content intact, opens no popup and uses only a green border');

  await page.waitForFunction(() => JSON.parse(localStorage.getItem('winmate.v2.proposals'))[0].parts[1].layouts[0].status === 'done');
  await page.reload(); await card('first').waitFor();
  assert.match(await card('first').getAttribute('class'), /st-done/);
  await button('first').focus(); await page.keyboard.press('Enter');
  assert.equal(await button('first').getAttribute('aria-pressed'), 'false');
  await page.keyboard.press('Space'); assert.equal(await button('first').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('dialog').count(), 0);
  pass('completion persists across refresh and keyboard can complete or undo without opening detail');

  assert(await button('review').isDisabled());
  const gates = await page.evaluate(async () => {
    const { getProposal } = await import('/src/repositories/proposals.js'); const { layoutCanComplete } = await import('/src/services/layout-context.js');
    const p = getProposal('work-test'), x = p.parts[1].layouts[0];
    return ['queued', 'running', 'error', 'review'].map(phase => layoutCanComplete(p, { ...x, adaptation: { ...x.adaptation, phase } }))
      .concat(layoutCanComplete(p, { ...x, adaptation: { ...x.adaptation, missing: ['미확인 정보'] } }),
        layoutCanComplete(p, { ...x, ov: { t: { 0: '[확인 필요]' }, img: {} } }));
  });
  assert(gates.every(allowed => !allowed));
  await card('first').click({ position: { x: 140, y: 90 } }); await page.locator('.modal.sheet .detail').waitFor();
  assert.equal(await page.locator('.modal.sheet .done-toggle').count(), 0);
  assert.equal(await page.locator('.modal.sheet').getByText('입력 완료', { exact: true }).count(), 0);
  assert(await page.getByRole('button', { name: '수정하기', exact: true }).isVisible()); await closeDetail();
  pass('detail no longer has completion controls; existing review and missing-information gates still apply');

  await card('first').hover(); await card('first').locator('.fav-btn').click();
  assert.equal(await card('first').locator('.fav-btn').getAttribute('aria-pressed'), 'true');
  assert.equal(await button('first').getAttribute('aria-pressed'), 'true'); assert.equal(await page.getByRole('dialog').count(), 0);
  pass('favourite and completion remain independent');

  await page.locator('.lay-toggle').click(); await page.locator('.viewer').waitFor();
  await page.locator('.vstrip .vthumb').first().click(); await page.locator('.vslide').hover();
  const coverButton = page.locator('.vslide .layout-complete'); assert(await coverButton.isEnabled());
  await coverButton.click(); assert.equal(await coverButton.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.vslide').getAttribute('class'), /st-done/);
  assert.match(await page.locator('.vstrip .vthumb').first().getAttribute('class'), /st-done/);
  await page.waitForFunction(() => {
    const slide = document.querySelector('.vslide.st-done .slide');
    return slide && getComputedStyle(slide).boxShadow.includes(getComputedStyle(slide.closest('.vslide').querySelector('.layout-complete')).borderTopColor);
  });
  assert.equal(await page.locator('.viewer .stbadge.done, .viewer .vthumb .ok').count(), 0);
  assert.equal((await state()).parts[0].layouts[0].status, 'done');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.screenshot({ path: output + '/viewer.png' });
  pass('cover sheets use the same hover action and green completion border in the PPT viewer');

  await page.locator('.lay-toggle').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('winmate.v2.proposals'))[0].parts[0].layouts[0].status === 'done');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    storageState: await context.storageState({ indexedDB: true }), reducedMotion: 'reduce' });
  await mobileContext.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await mobileContext.route(url => url.pathname.startsWith('/api/'), route => new URL(route.request().url()).pathname === '/api/bootstrap'
    ? route.fulfill({ json: bootstrap }) : route.fulfill({ status: 503, json: { code: 'test_no_api' } }));
  const mobile = await mobileContext.newPage(); mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(page.url()); const mobileCard = mobile.locator('[data-layout-uid="second"]'); await mobileCard.waitFor();
  const mobileButton = mobileCard.locator('.layout-complete');
  assert.equal(await mobileButton.evaluate(el => getComputedStyle(el).opacity), '1');
  await mobileButton.tap(); assert.equal(await mobileButton.getAttribute('aria-pressed'), 'true');
  assert.equal(await mobile.getByRole('dialog').count(), 0);
  await mobileCard.screenshot({ path: output + '/mobile.png' });
  await mobileContext.close(); pass('touch screens show the check without hover and tapping toggles only that sheet');

  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { StoryCanvas } = await import('/src/components/storyboard.jsx'); const { getProposal } = await import('/src/repositories/proposals.js');
    const host = document.createElement('div'); document.body.append(host); document.querySelector('.app').style.display = 'none';
    createRoot(host).render(React.createElement(StoryCanvas, { p: getProposal('work-test'), readOnly: true, pageOf: () => 1, open: () => {} }));
  });
  await page.locator('.canvas-wrap.ro').waitFor(); assert.equal(await page.locator('.canvas-wrap.ro .layout-complete').count(), 0);
  assert.deepEqual(errors, []); pass('read-only Storyboards have no completion action');
  fs.writeFileSync(output + '/report.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length}/${checks.length} layout completion checks passed`);
} finally {
  await browser?.close(); await server.close();
}
