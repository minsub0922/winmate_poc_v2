// 레이아웃 관리 상세 · 머리 '칸 설계 n/m' 드롭다운 — AI가 쓰는 칸마다 견본 · 역할 · 그대로 · 숫자, 고쳐서 저장하면 흐름 레지스트리에 남는다.
// Run only against an isolated server (temporary WINMATE_LAYOUT_LIBRARY / WINMATE_LAYOUT_FLOWS / WINMATE_ADMIN_DATA / WINMATE_AUTH_DIR):
// WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8813 node admin/tests/layout-cells-ui.mjs
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8813';
const F = 'L_TOC_PILOT';
const out = path.resolve('admin/runtime/evidence/layout-cells'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!' } });
  assert.equal(login.status(), 200, await login.text());
  const flowOf = async () => (await (await context.request.get(`${base}/admin/api/layout-library/${F}/flow`)).json());
  const start = await flowOf();
  assert.ok(start.cells.list.length > 5 && Object.keys(start.cells.base).length > 5, 'the shipped design names the cells');
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/admin/layout-library');
  await page.getByRole('heading', { name: '레이아웃 관리', exact: true }).waitFor();
  await page.getByLabel('레이아웃 검색', { exact: true }).fill(F);
  await page.locator(`.ll-card[data-layout="${F}"] .ll-card-open`).click();
  const detail = page.locator('section.modal').filter({ has: page.locator('.ll-detail') });
  await detail.locator('.lf-node').first().waitFor();
  const button = detail.locator('.modal-actions .lf-in-button', { hasText: '칸 설계' });
  assert.match(await button.innerText(), /칸 설계 \d+\/\d+/);
  await button.click();
  const pop = page.locator('.lf-cells-pop');
  await pop.waitFor();
  const first = pop.locator('.lf-cell').filter({ has: page.locator('code', { hasText: /^3$/ }) });
  const role = first.getByLabel('칸 3 역할');
  assert.ok((await role.inputValue()).length > 2, 'cell 3 shows its designed role');
  await role.fill('1단계 이름 — 실험 단계 이름 2~6자');
  await page.screenshot({ path: path.join(out, 'cells.png') });
  await pop.getByRole('button', { name: '저장' }).click();
  await pop.waitFor({ state: 'detached' });
  let flow = await flowOf();
  assert.equal(flow.cells.cells['3'].role, '1단계 이름 — 실험 단계 이름 2~6자');
  assert.deepEqual(flow.cells.edited, ['3']);
  // back to the design: the edit is dropped
  await button.click();
  await pop.waitFor();
  await pop.locator('.lf-cell').filter({ has: page.locator('code', { hasText: /^3$/ }) }).getByLabel('칸 3 역할').fill(start.cells.base['3'].role);
  await pop.getByRole('button', { name: '저장' }).click();
  await pop.waitFor({ state: 'detached' });
  flow = await flowOf();
  assert.deepEqual(flow.cells.edited, []);
  assert.deepEqual(errors, []);
  console.log('layout-cells-ui ok');
} finally {
  await browser.close();
}
