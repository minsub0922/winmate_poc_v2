// 레이아웃 관리 상세 — 시트의 이미지 칸을 누르면 그 옆 팝업: 지금 이미지 · 관련 이미지 · 검색 · 원래 이미지 · AI 작성/잠금 → 수정 반영으로 저장.
// Run only against an isolated server (temporary WINMATE_LAYOUT_LIBRARY / WINMATE_LAYOUT_FLOWS / WINMATE_ADMIN_DATA / WINMATE_AUTH_DIR):
// WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8824 node admin/tests/layout-images-ui.mjs
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8824';
const F = process.env.LAYOUT || 'L_VP_H';
const out = path.resolve('admin/runtime/evidence/layout-images'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const errors = [];
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!' } });
  assert.equal(login.status(), 200, await login.text());
  const itemOf = async () => (await (await context.request.get(base + '/admin/api/layout-library')).json()).items.find(i => i.f === F);
  const edits = async () => (await (await context.request.get(`${base}/admin/api/layout-library/${F}`)).json()).edits;
  assert.ok(!(await itemOf()).edited, 'start from an unedited layout (fresh WINMATE_LAYOUT_LIBRARY)');
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/admin/layout-library');
  await page.getByLabel('레이아웃 검색', { exact: true }).fill(F);
  await page.locator(`.ll-card[data-layout="${F}"] .ll-card-open`).click();
  const detail = page.locator('section.modal').filter({ has: page.locator('.ll-detail') });
  await page.waitForFunction(() => document.querySelector('.ll-canvas iframe')?.contentDocument?.querySelector('[data-admin-slot^="img:"]'));
  await page.waitForTimeout(300);
  // 시트 안 이미지의 화면 위치 · 지금 src
  const imageAt = () => page.evaluate(() => {
    const fr = document.querySelector('.ll-canvas iframe'), r = fr.getBoundingClientRect(), s = r.width / 1280;
    const el = fr.contentDocument.querySelector('[data-admin-slot^="img:"]'), b = el.getBoundingClientRect();
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    return { x: r.left + (b.left + b.width / 2) * s, y: r.top + (b.top + b.height / 2) * s, right: r.left + b.right * s, id: el.dataset.adminSlot.slice(4), src: img?.getAttribute('src') || '' };
  });
  const before = await imageAt();
  await page.mouse.move(before.x, before.y); await page.waitForTimeout(150);
  await page.mouse.click(before.x, before.y);
  const pop = page.locator('.li-pop');
  await pop.waitFor();
  assert.equal(await pop.locator('strong').first().innerText(), `이미지 ${before.id}`);
  await pop.locator('.li-item').first().waitFor();
  const pb = await pop.boundingBox();
  assert.ok(pb.x >= before.right - 1 || pb.x + pb.width <= before.x, 'the popup sits beside the image, not over it');
  assert.ok(await pop.locator('.li-item').count() >= 8);
  assert.match(await pop.locator('.li-count').innerText(), /^관련 [\d,]+$/);
  assert.ok(await pop.locator('.li-item .li-why').count() > 0, 'related images say why');
  assert.equal(await pop.locator('.li-item img').first().evaluate(img => img.complete ? img.naturalWidth > 0 : new Promise(ok => img.onload = () => ok(img.naturalWidth > 0))), true, 'thumbnails load');
  await shot(page, '1-related');

  // 고르면 시트에 바로 · 수정 반영 전
  const pick = pop.locator('.li-item').nth(1), picked = await pick.getAttribute('title');
  await pick.click();
  await page.waitForFunction(old => document.querySelector('.ll-canvas iframe')?.contentDocument?.querySelector('[data-admin-slot^="img:"] img, img[data-admin-slot^="img:"]')?.getAttribute('src') !== old, before.src);
  assert.equal(await pop.locator('.li-item.on').count(), 1);
  assert.match(await detail.locator('.ll-save-state').innerText(), /반영하지 않은 수정/);
  assert.equal(await detail.locator('.error-box').count(), 0);
  assert.ok(picked);
  await shot(page, '2-picked');
  // 원래 이미지로 → 수정 없음
  await pop.getByRole('button', { name: '원래 이미지' }).click();
  await page.waitForFunction(() => !document.querySelector('.ll-save-state')?.textContent.includes('반영하지 않은'));
  // 검색
  await pop.getByLabel('이미지 검색').fill('메뉴보드');
  await page.waitForFunction(() => /^검색 [1-9]/.test(document.querySelector('.li-count')?.textContent || ''));
  const found = pop.locator('.li-item').first(), src = await found.evaluate(b => decodeURIComponent(new URL(b.querySelector('img').src).searchParams.get('src')));
  assert.match(await found.getAttribute('title'), /메뉴보드/);
  await found.click();
  // AI 잠금 — 바꾼 이미지가 제안서에서도 그대로
  await pop.getByRole('button', { name: 'AI 잠금' }).click();
  assert.equal(await pop.getByRole('button', { name: 'AI 잠금' }).getAttribute('aria-pressed'), 'true');
  await shot(page, '3-search-locked');
  // 텍스트를 누르면 닫힘, Esc 도
  await page.keyboard.press('Escape');
  await pop.waitFor({ state: 'detached' });
  assert.equal(await detail.count(), 1, 'Escape closes only the image popup');

  await detail.getByRole('button', { name: '수정 반영', exact: true }).click();
  await page.getByRole('dialog', { name: '레이아웃 수정을 반영할까요?' }).getByRole('button', { name: '수정 반영' }).click();
  await page.waitForFunction(() => document.querySelector('.ll-save-state')?.textContent.startsWith('반영'));
  const saved = await edits();
  assert.equal(saved.img[before.id], src);
  assert.equal(saved.modes.img[before.id], 'fixed');
  assert.ok((await itemOf()).edited);
  assert.deepEqual(errors, []);
  console.log('layout-images-ui: ok');
} finally {
  await browser.close();
}
