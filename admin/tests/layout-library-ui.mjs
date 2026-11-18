// Destructive UI checks must run against an isolated server with temporary
// WINMATE_LAYOUT_LIBRARY / WINMATE_ADMIN_DATA / WINMATE_AUTH_DIR files.
// WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8799 node admin/tests/layout-library-ui.mjs
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const out = path.resolve('admin/runtime/evidence/layout-library'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const errors = [];
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!' } });
  assert.equal(login.status(), 200, await login.text());
  const app = await context.newPage();
  app.on('pageerror', e => errors.push('app: ' + e.message));
  await app.goto(base + '/');
  await app.locator('.sb-tpl').click();
  await app.locator('.hub-scope').getByRole('button', { name: /^시트/ }).click();
  await app.locator('#tl-q').fill('L_C01');
  await app.locator('.tl-card[data-f="L_C01"]').waitFor();
  const originalTitle = await app.locator('.tl-card[data-f="L_C01"] .tl-name').innerText();
  console.log('app opened before edits');

  page = await context.newPage();
  page.on('pageerror', e => errors.push('admin: ' + e.message));
  await page.goto(base + '/admin/layout-library');
  await page.getByRole('heading', { name: '레이아웃 관리', exact: true }).waitFor();
  await page.locator('.ll-card').first().waitFor();
  await page.screenshot({ path: path.join(out, 'library.png'), fullPage: true });
  assert.equal(await page.locator('.ll-card').count(), 24);
  await page.getByRole('tab', { name: /^내용 후보/ }).click();
  await page.locator('.ll-card').first().waitFor();
  await page.getByRole('tab', { name: /^이전 · 숨김/ }).click();
  await page.locator('.ll-card').first().waitFor();
  await page.getByRole('tab', { name: /^사용 중/ }).click();
  await page.getByLabel('레이아웃 검색', { exact: true }).fill('L_C01');
  const card = page.locator('.ll-card[data-layout="L_C01"]');
  await card.waitFor();
  assert.equal(await page.locator('.ll-card').count(), 1);
  await card.hover();
  await page.locator('.ll-hover iframe').waitFor();
  assert.equal(await page.locator('.ll-hover').innerText(), '');
  assert.equal(await card.locator('.ll-card-delete').count(), 0); // composition cover is protected
  await page.screenshot({ path: path.join(out, 'hover.png') });
  console.log('inventory, filters and hover passed');
  const protectedDelete = await context.request.delete(base + '/admin/api/layout-library/L_C01', { data: { rev: 0, confirmed: true } });
  assert.equal(protectedDelete.status(), 409);
  let confirmation;

  await card.locator('.ll-card-open').click();
  const detail = page.getByRole('dialog').filter({ has: page.locator('.ll-detail') });
  await detail.locator('.ll-detail').waitFor();
  assert.equal(await detail.getByRole('button', { name: '수정 반영', exact: true }).isDisabled(), true);
  await detail.locator('.ll-ex-button').click();
  const examples = page.locator('.ll-ex-pop');
  await examples.locator('iframe').waitFor();
  await page.waitForFunction(() => {
    const imgs = [...document.querySelector('.ll-ex-pop iframe').contentDocument.querySelectorAll('img')];
    return imgs.length > 0 && imgs.every(im => im.complete && im.naturalWidth > 0);
  });
  assert.ok(await examples.getByLabel('활용 예시 선택').locator('option').count() > 2);
  assert.ok(await examples.locator('iframe').evaluate(el => el.contentDocument.body.innerText.trim().length > 15));
  const options = await examples.getByLabel('활용 예시 선택').locator('option').evaluateAll(ns => ns.map(n => n.value));
  await examples.getByLabel('활용 예시 선택').selectOption(options[1]);
  await page.waitForTimeout(250);
  await examples.locator('iframe').waitFor();
  await page.screenshot({ path: path.join(out, 'example.png') });
  await detail.locator('.ll-ex-button').click();
  await examples.waitFor({ state: 'detached' });
  console.log('actual scenario examples passed');

  await detail.getByLabel('레이아웃 이름', { exact: true }).fill('저장 전 변경');
  await page.keyboard.press('Escape');
  const discard = page.getByRole('dialog', { name: '수정 내용을 닫을까요?' });
  await discard.waitFor();
  await discard.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(await detail.count(), 1);
  await detail.getByLabel('레이아웃 이름', { exact: true }).fill(originalTitle);

  // 시트 영역: 마우스를 올린 영역 위 버튼으로 고정한다(고정 = AI가 채우지 않음)
  const editor = page.frameLocator('iframe[title="레이아웃 편집 시트"]');
  const pin = async key => {
    await page.waitForFunction(k => document.querySelector('.lr-lockbtn')?.dataset.slot === k, key);
    const lock = detail.locator(`.lr-lockbtn[data-slot="${key}"]`);
    if (await lock.getAttribute('aria-pressed') !== 'true') await lock.click();
    assert.equal(await lock.getAttribute('aria-pressed'), 'true');
  };
  // 시트 iframe 안에는 리스너가 없다(Safari) — 마우스는 덮개가 받으므로 화면 좌표로 움직인다
  const at = async selector => page.evaluate(sel => {
    const fr = document.querySelector('iframe[title="레이아웃 편집 시트"]'), fb = fr.getBoundingClientRect(), scale = fb.width / 1280;
    const b = fr.contentDocument.querySelector(sel).getBoundingClientRect();
    return { x: fb.left + (b.left + b.width / 2) * scale, y: fb.top + (b.top + b.height / 2) * scale };
  }, selector);
  let p = await at('[data-img="0"]');
  await page.mouse.move(p.x, p.y);
  await pin('img:0');
  p = await at('[data-tb="3"]');
  await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y, { clickCount: 3 });
  await page.keyboard.type('관리 화면에서 직접 고친 제안 제목');
  assert.equal((await editor.locator('[data-tb="3"]').innerText()).trim(), '관리 화면에서 직접 고친 제안 제목');
  await page.mouse.move(p.x, p.y);
  await pin('t:3');
  await detail.getByLabel('레이아웃 이름', { exact: true }).fill('라이브 동기화 검증 표지');
  await page.screenshot({ path: path.join(out, 'editor.png') });
  assert.equal(await detail.getByRole('button', { name: '수정 반영', exact: true }).isEnabled(), true);
  await detail.getByRole('button', { name: '수정 반영', exact: true }).click();
  confirmation = page.getByRole('dialog', { name: '레이아웃 수정을 반영할까요?' });
  await confirmation.waitFor();
  assert.equal((await (await context.request.get(base + '/api/layout-library')).json()).rev, 0);
  await page.keyboard.press('Escape'); // only the confirmation closes
  assert.equal(await detail.count(), 1);
  assert.equal(await confirmation.count(), 0);
  await detail.getByRole('button', { name: '수정 반영', exact: true }).click();
  await confirmation.getByRole('button', { name: '수정 반영', exact: true }).click();
  await page.getByText('레이아웃 수정을 반영했습니다.', { exact: true }).waitFor();
  const snapshot = await (await context.request.get(base + '/api/bootstrap')).json();
  console.log('edit and save confirmations passed');
  assert.equal(snapshot.layout_library.items.L_C01.t['3'], '관리 화면에서 직접 고친 제안 제목');
  assert.equal(snapshot.layout_library.items.L_C01.modes.t['3'], 'fixed');
  assert.equal(snapshot.layout_library.items.L_C01.modes.img['0'], 'fixed');
  assert.equal(await detail.getByRole('button', { name: '수정 반영', exact: true }).isDisabled(), true);

  // The app tab was opened before the save. It must update without a reload.
  await app.bringToFront();
  await app.locator('.tl-card[data-f="L_C01"] .tl-name', { hasText: '라이브 동기화 검증 표지' }).waitFor({ timeout: 12000 });
  assert.notEqual(await app.locator('.tl-card[data-f="L_C01"] .tl-name').innerText(), originalTitle);
  await app.locator('.tl-card[data-f="L_C01"] [data-tb="3"]').filter({ hasText: '관리 화면에서 직접 고친 제안 제목' }).waitFor({ timeout: 12000 });
  assert.equal(await app.locator('.tl-card[data-f="L_C01"] [data-tb="3"]').getAttribute('data-fix'), 'fixed');
  await app.screenshot({ path: path.join(out, 'app-synced.png') });

  await page.bringToFront();
  await detail.getByRole('button', { name: '닫기', exact: true }).last().click();
  // An unprotected sheet still supports deletion and live app synchronization.
  await page.getByLabel('레이아웃 검색', { exact: true }).fill('L_US_C');
  await app.locator('#tl-q').fill('L_US_C');
  const removable = page.locator('.ll-card[data-layout="L_US_C"]');
  await removable.locator('.ll-card-delete').click();
  confirmation = page.getByRole('dialog', { name: '레이아웃을 삭제할까요?' });
  await confirmation.getByRole('button', { name: '삭제', exact: true }).click();
  await page.getByText('레이아웃을 삭제했습니다.', { exact: true }).waitFor();
  await removable.waitFor({ state: 'detached' });
  await app.bringToFront();
  await app.locator('.tl-card[data-f="L_US_C"]').waitFor({ state: 'detached', timeout: 12000 });
  const deletedDetail = await (await context.request.get(base + '/admin/api/layout-library/L_US_C')).json();
  assert.ok(deletedDetail.layout.removed && deletedDetail.html);

  await page.bringToFront();
  await page.getByLabel('레이아웃 검색', { exact: true }).fill('');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('✓ layout library: browsing, hover, examples, inline edits, confirmations, live app sync, deletion and mobile');
} catch (error) {
  if (page) await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally { await browser.close(); }
