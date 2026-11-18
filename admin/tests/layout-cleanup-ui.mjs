// Run against admin/tests/fixtures/layout_cleanup_server.py.
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const out = path.resolve('admin/runtime/evidence/layout-cleanup'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1050 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: 'layout-cleanup-isolated-password' } });
  assert.equal(login.status(), 200);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/admin/layout-library');
  await page.locator('.ll-card').first().waitFor();
  const query = page.getByLabel('레이아웃 검색', { exact: true });
  await query.fill('L_C01');
  const cover = page.locator('.ll-card[data-layout="L_C01"]'); await cover.waitFor();
  assert.equal(await cover.locator('.ll-card-delete').count(), 0);
  await query.fill('L_VS_DSS_FB');
  const extra = page.locator('.ll-card[data-layout="L_VS_DSS_FB"]'); await extra.waitFor();
  assert.equal(await extra.locator('.ll-card-delete').count(), 0);
  await extra.locator('.ll-card-open').click();
  const detail = page.getByRole('dialog').filter({ has: page.locator('.ll-detail') });
  await detail.locator('.ll-detail').waitFor();
  assert.equal(await detail.getByRole('button', { name: '수정 반영', exact: true }).isDisabled(), true);
  await page.waitForFunction(() => {
    const doc = document.querySelector('.ll-canvas iframe')?.contentDocument;
    const images = [...(doc?.querySelectorAll('img') || [])];
    return images.length && images.every(i => i.complete && i.naturalWidth > 0);
  });
  await page.screenshot({ path: path.join(out, 'protected-composition.png'), fullPage: true });
  await detail.getByRole('button', { name: '닫기', exact: true }).last().click();
  await query.fill('L_MI01');
  await page.getByText('조건에 맞는 레이아웃이 없습니다', { exact: true }).waitFor();
  await page.getByRole('tab', { name: /^삭제됨/ }).click();
  const removed = page.locator('.ll-card[data-layout="L_MI01"]'); await removed.waitFor();
  assert.equal(await removed.locator('.ll-card-delete').count(), 0);
  await query.fill(''); await page.getByRole('tab', { name: /^사용 중/ }).click();
  await page.locator('.ll-card').first().waitFor();
  await page.screenshot({ path: path.join(out, 'library.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('✓ protected delete controls, composition preview/images, archived layout visibility, no browser errors');
} finally { await browser.close(); }
