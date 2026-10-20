// Storyboard detail controls and context-change-only refill; no live model requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'detail-test', auth_enabled: false } };
const output = path.join(root, 'app/tests/output/layout-detail'); fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
let browser, page; const checks = [], errors = [], modelRequests = [];
const pass = text => { checks.push(text); console.log('PASS ' + text); };
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, reducedMotion: 'reduce' });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname === '/api/llm') {
      const body = route.request().postDataJSON();
      if (body.prompt.includes('추천 요청')) return route.fulfill({ status: 503, json: { code: 'isolated_no_model' } });
      const input = JSON.parse(body.prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]); modelRequests.push(input);
      return route.fulfill({ json: { mode: 'real', data: {
        blocks: input.blocks.map(b => ({ i: b.i, action: 'keep', s: b.current, src: [], reason: 'test context review' })),
        images: input.images.map(im => ({ i: im.i, action: 'keep', n: -1, reason: 'test context review' })), replacements: [], missing: [],
      } } });
    }
    return route.fulfill({ status: 503, json: { code: 'isolated_no_model' } });
  });
  await context.route('**/img/**', route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = [path.join(root, relative), path.join(root, 'app/data/static', relative)].find(file => fs.existsSync(file));
    return file ? route.fulfill({ path: file }) : route.abort();
  });
  page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port); await page.locator('.app').waitFor();
  await page.evaluate(async () => {
    const { myMeta, saveTemplates } = await import('/src/repositories/templates.js');
    const { layoutContextKey } = await import('/src/domain/slides/context-policy.js');
    const f = 'L_MY_DETAIL_CONTROLS';
    const photo = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eef3ff"/></svg>');
    const html = '<div style="width:1280px;height:720px;position:relative;background:#fff"><div data-tb="0" style="position:absolute;left:60px;top:70px;font-size:36px">고객 제안 개요</div><div data-tb="1" style="position:absolute;left:60px;top:160px;font-size:24px">운영 목표를 확인합니다</div><div data-img="0" data-kind="scene" data-hint="공간 이미지" style="position:absolute;left:680px;top:180px;width:450px;height:360px"><img src="' + photo + '" alt="공간 이미지" style="width:100%;height:100%;object-fit:contain"/></div></div>';
    await saveTemplates([{ meta: myMeta({ f, name: '상세 버튼 검증', p: 'overview', kind: 'edit', nT: 2, nI: 1 }), html }]);
    const p = { id: 'detail-controls', title: '고객 제안', customer: '현재 고객', ind: null, createdAt: 1, updatedAt: 1, stage: 'story', reqTab: 'free',
      req: { free: [], form: { project: '', customer: '', target: '', keymen: [], note: '' }, files: [] }, ctx: { products: [], solutions: [], cases: [] },
      parts: [{ id: 'part', name: '제안 개요', type: 'overview', items: [], done: true, layouts: [] }] };
    const currentKey = layoutContextKey(p, p.parts[0]);
    const previous = { ...p, customer: '이전 고객' }, previousKey = layoutContextKey(previous, previous.parts[0]);
    p.parts[0].layouts = [
      { uid: 'unchanged', f, status: 'partial', ov: { t: {}, img: {} }, ev: {}, adaptation: { version: 3, phase: 'review', key: currentKey, needsReview: true, missing: ['세부 정보 확인 필요'] } },
      { uid: 'changed', f, status: 'partial', ov: { t: {}, img: {} }, ev: {}, adaptation: { version: 3, phase: 'retained', key: previousKey, needsReview: true } },
    ];
    localStorage.setItem('winmate.v2.proposals', JSON.stringify([p]));
    localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'proposal', id: p.id } }));
  });
  await page.reload(); await page.locator('.app').waitFor();
  await page.evaluate(async () => { window.__detailRepo = await import('/src/repositories/proposals.js'); });
  const modal = page.locator('.modal.sheet'), panel = modal.locator('.detail-right');
  const close = () => modal.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.locator('[data-layout-uid="unchanged"]').click(); await modal.locator('.detail').waitFor();
  assert.equal(await panel.locator('.fillcard, .fc-row, .layout-context-refill').count(), 0);
  assert(!(await panel.innerText()).includes('요소 채움'));
  const toolbar = modal.getByRole('toolbar', { name: '레이아웃 작업', exact: true });
  const editButton = toolbar.getByRole('button', { name: '수정하기', exact: true });
  assert(await editButton.isVisible()); assert.equal(await modal.locator('.mfoot').getByRole('button', { name: '수정하기', exact: true }).count(), 0);
  const toolbarGeometry = await toolbar.evaluate(el => {
    const t = el.getBoundingClientRect(), stage = el.closest('.sv-stage').getBoundingClientRect();
    const edit = el.querySelector('.sv-edit').getBoundingClientRect(), fav = el.querySelector('.fav-btn').getBoundingClientRect();
    return { top: t.top - stage.top, right: stage.right - t.right, height: edit.height, adjacent: Math.abs(edit.right + 8 - fav.left) < 2, primary: el.querySelector('.sv-edit').classList.contains('btn-primary') };
  }); assert(toolbarGeometry.top < 25 && toolbarGeometry.right < 25 && toolbarGeometry.height >= 40 && toolbarGeometry.adjacent && toolbarGeometry.primary);
  const deselect = modal.locator('.mfoot').getByRole('button', { name: '선택 해제', exact: true });
  assert(await deselect.evaluate(el => el.nextElementSibling?.textContent === '닫기'));
  const favorite = toolbar.getByRole('button', { name: '찜하기', exact: true }); await favorite.click(); assert.equal(await toolbar.getByRole('button', { name: '찜 풀기', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.screenshot({ path: output + '/stage-actions-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await toolbar.evaluate(el => { const t = el.getBoundingClientRect(), stage = el.closest('.sv-stage').getBoundingClientRect(); return { right: t.right, width: innerWidth, top: t.top - stage.top, scroll: document.documentElement.scrollWidth }; });
  assert(mobile.right <= mobile.width && mobile.top < 25 && mobile.scroll <= mobile.width + 1); assert(await editButton.isVisible());
  const footerGeometry = await deselect.evaluate(el => { const a = el.getBoundingClientRect(), b = el.nextElementSibling.getBoundingClientRect(); return { sameRow: Math.abs(a.y - b.y) < 2, gap: b.x - a.right, right: b.right, width: innerWidth }; });
  assert(footerGeometry.sameRow && footerGeometry.gap >= 6 && footerGeometry.gap <= 10 && footerGeometry.right <= footerGeometry.width);
  await page.locator('.toast').waitFor({ state: 'detached' });
  await page.screenshot({ path: output + '/stage-actions-mobile.png' }); await page.setViewportSize({ width: 1500, height: 1000 });
  await deselect.click(); const removal = page.getByRole('alertdialog', { name: '레이아웃 선택을 해제할까요?', exact: true }); await removal.waitFor(); await removal.getByRole('button', { name: '취소', exact: true }).click(); assert(await modal.isVisible());
  await editButton.click(); await page.locator('.myed').waitFor(); assert.equal(await page.locator('.detail').count(), 0);
  await page.locator('.modal').filter({ has: page.locator('.myed') }).getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.locator('[data-layout-uid="unchanged"]').click(); await modal.locator('.detail').waitFor();
  pass('Edit and favorite are adjacent at the preview top-right on desktop/mobile; edit is primary and functional; deselect sits beside Close and retains confirmation');
  await modal.locator('.detail-left [data-img="0"]').click();
  const alternatives = page.getByRole('dialog', { name: '대체 이미지 고르기', exact: true }); await alternatives.waitFor();
  await alternatives.getByRole('button', { name: '닫기', exact: true }).click();
  await panel.locator('.unitcard').waitFor();
  assert.equal(await panel.getByRole('button', { name: /대체 이미지|자동으로 고르기|자동 채우기/ }).count(), 0);
  assert.equal(await panel.locator('.btn-primary').count(), 0);
  assert(await panel.getByRole('heading', { name: '이미지 출처', exact: true }).isVisible());
  await page.screenshot({ path: output + '/image-panel.png' });
  await close();
  pass('element-fill section and image footer actions are removed; unchanged context stays hidden despite missing details/history review');

  await page.locator('[data-layout-uid="changed"]').click(); await modal.locator('.detail').waitFor();
  const refill = panel.getByRole('button', { name: '현재 맥락으로 다시 채우기', exact: true }); await refill.waitFor();
  assert(await panel.evaluate(el => el.firstElementChild.classList.contains('layout-context-action')));
  const action = await panel.locator('.layout-context-action').boundingBox(), button = await refill.boundingBox();
  assert(Math.abs(button.width - action.width) < 1);
  const tooltip = panel.getByRole('tooltip'); assert.equal(await tooltip.isVisible(), false);
  await refill.hover(); await tooltip.waitFor({ state: 'visible' });
  const tip = await tooltip.boundingBox(); assert(tip.y >= button.y + button.height);
  assert((await tooltip.innerText()).includes('이전 채움 이후 고객 맥락이 바뀌었어요'));
  await page.screenshot({ path: output + '/refill-hover.png' });
  await page.mouse.move(30, 30); await tooltip.waitFor({ state: 'hidden' });
  await modal.locator('.detail-left [data-img="0"]').click(); await alternatives.waitFor();
  await alternatives.getByRole('button', { name: '닫기', exact: true }).click();
  assert(await refill.isVisible()); assert.equal(await panel.locator('.layout-context-refill').count(), 1);
  await page.keyboard.press('Escape');
  await modal.locator('.detail-left [data-tb="0"]').click(); await panel.locator('.unitcard').waitFor();
  assert(await refill.isVisible()); assert.equal(await panel.locator('.layout-context-refill').count(), 1);
  pass('changed context shows one full-width top button across image/text selections, with details only beneath it on hover');

  await refill.click(); await page.waitForFunction(() => {
    const x = window.__detailRepo.getProposal('detail-controls').parts[0].layouts.find(x => x.uid === 'changed');
    return x.adaptation.phase === 'ready';
  });
  assert.equal(await refill.count(), 0); assert(modelRequests.length > 0);
  const reviewed = await page.evaluate(async () => {
    const p = (await import('/src/repositories/proposals.js')).getProposal('detail-controls');
    const { layoutContextKey } = await import('/src/domain/slides/context-policy.js');
    const x = p.parts[0].layouts.find(x => x.uid === 'changed');
    return x.adaptation.appliedKey === layoutContextKey(p, p.parts[0]);
  });
  assert(reviewed); await close();
  pass('refill reviews every slot through the existing lifecycle and hides the button once the current context is applied');
  assert.deepEqual(errors, []);
  fs.writeFileSync(output + '/report.json', JSON.stringify({ checks, errors, modelRequests: modelRequests.length }, null, 2));
} catch (error) { console.error('Detail state:', await page?.evaluate(() => window.__detailRepo?.getProposal('detail-controls').parts[0].layouts.map(x => x.adaptation)), 'Model requests:', modelRequests.length, 'Errors:', errors); await page?.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error; }
finally { await browser?.close(); await server.close(); }
