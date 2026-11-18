// 레이아웃 관리 상세 · 흐름 — 요소별 작성(fan-out → 요소 → fan-in): 니즈 장은 요소 나누기 · 요소별 작성 · 모으기로 그리고,
// 요소 상자를 누르면 그 요소의 칸 · 담당 · 이 요소 지시 팝업, 요소별 작성 단계에서 '한 번에 쓰기' ↔ '요소별로 나눠 쓰기'.
// Run only against an isolated server (temporary WINMATE_LAYOUT_LIBRARY / WINMATE_LAYOUT_FLOWS / WINMATE_ADMIN_DATA / WINMATE_AUTH_DIR):
// WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8813 node admin/tests/layout-fanout-ui.mjs
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8813';
const F = 'L_VS_NEEDS';
const out = path.resolve('admin/runtime/evidence/layout-fanout'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const errors = [];
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!' } });
  assert.equal(login.status(), 200, await login.text());
  const flowOf = async () => (await (await context.request.get(`${base}/admin/api/layout-library/${F}/flow`)).json());
  const start = await flowOf();
  if (start.edited) await context.request.delete(`${base}/admin/api/layout-library/${F}/flow`, { data: { rev: start.rev, confirmed: true } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/admin/layout-library');
  await page.getByRole('heading', { name: '레이아웃 관리', exact: true }).waitFor();
  await page.getByLabel('레이아웃 검색', { exact: true }).fill(F);
  await page.locator(`.ll-card[data-layout="${F}"] .ll-card-open`).click();
  const detail = page.locator('section.modal').filter({ has: page.locator('.ll-detail') });
  await detail.locator('.lf-node').first().waitFor();

  // 흐름: 요소 나누기 → 요소별 작성(요소 Q1 · Q2 · Q3 상자, 요구) → 모으기 · 제목, '문구 작성' 단계는 없다
  const names = await detail.locator('.lf-node strong').allInnerTexts();
  assert.ok(names.indexOf('요소 나누기') < names.indexOf('요소별 작성') && names.indexOf('요소별 작성') < names.indexOf('모으기 · 제목'), names.join(' / '));
  assert.ok(!names.includes('문구 작성'));
  const units = detail.locator('.lf-unit');
  assert.equal(await units.count(), 3);
  assert.deepEqual(await units.locator('b').allInnerTexts(), ['Q1', 'Q2', 'Q3']);
  assert.ok((await units.locator('small').allInnerTexts()).every(t => t === '요구'));
  const el = detail.locator('.lf-node', { hasText: '요소별 작성' });
  assert.match(await el.locator('small').innerText(), /요소 3 · 동시/);
  const elBox = await el.boundingBox(), uBox = await units.nth(1).boundingBox();
  assert.ok(uBox.y > elBox.y + elBox.height - 2 && uBox.x >= elBox.x - 6 && uBox.x + uBox.width <= elBox.x + elBox.width + 6, 'element boxes sit under their step');
  await shot(page, '0-fan');

  // 요소 상자 → 그 요소 팝업(칸 · 담당 · 이 요소 지시) — 왼쪽에 붙는다
  await units.nth(1).click();
  const pop = page.locator('.lf-pop');
  await pop.getByText('요소 Q2', { exact: true }).waitFor();
  assert.match(await pop.locator('.lf-facts').innerText(), /14 · 15 · 17 · 18 · 19/);
  assert.ok((await pop.boundingBox()).x + (await pop.boundingBox()).width <= uBox.x + 2, 'popup left of the element box');
  await pop.getByLabel('이 요소 지시').fill('Q2 는 시설팀이 말하듯 씁니다.');
  await shot(page, '1-unit');
  await pop.getByRole('button', { name: '저장' }).click();
  await pop.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelectorAll('.lf-unit.own').length === 1);
  let flow = await flowOf();
  assert.ok(flow.edited);
  assert.deepEqual(flow.flow.nodes.find(n => n.module === 'element').units, [{ id: 'q2', prompt: 'Q2 는 시설팀이 말하듯 씁니다.' }]);

  // 요소 나누기 단계: 요소 목록 · 장 전체 칸
  await detail.locator('.lf-node', { hasText: '요소 나누기' }).click();
  await pop.locator('.lf-units').waitFor();
  assert.equal(await pop.locator('.lf-units li').count(), 4);
  assert.match(await pop.locator('.lf-logic').innerText(), /layout_elements\.plan_for/);
  await page.keyboard.press('Escape');

  // 한 번에 쓰기 ↔ 요소별로 나눠 쓰기
  await el.click();
  await pop.getByRole('button', { name: '한 번에 쓰기' }).click();
  await pop.waitFor({ state: 'detached' });
  await detail.locator('.lf-node', { hasText: '문구 작성' }).waitFor();
  assert.equal(await units.count(), 0);
  flow = await flowOf();
  assert.ok(flow.flow.nodes.some(n => n.module === 'write') && !flow.flow.nodes.some(n => ['split', 'element', 'merge'].includes(n.module)));
  await shot(page, '2-one-call');
  await detail.locator('.lf-node', { hasText: '문구 작성' }).click();
  await pop.getByRole('button', { name: '요소별로 나눠 쓰기' }).click();
  await pop.waitFor({ state: 'detached' });
  await units.first().waitFor();
  assert.equal(await units.count(), 3);
  assert.ok(!(await detail.locator('.lf-node strong').allInnerTexts()).includes('문구 작성'));
  // '+ 단계' 에는 요소별 작성 단계 · 문구 작성이 따로 나오지 않는다
  const options = await detail.locator('.lf-add-step option').allInnerTexts();
  assert.ok(!options.some(o => ['문구 작성', '요소 나누기', '요소별 작성', '모으기 · 제목'].includes(o)), options.join(' / '));
  // back to the base split: the same as the base definition, so no edit is kept (the '기본값' button goes away)
  assert.equal((await flowOf()).edited, false);
  assert.equal(await detail.locator('.lf-reset').count(), 0);
  await shot(page, '3-reset');
  assert.deepEqual(errors, []);
  console.log('layout-fanout-ui ok');
} finally {
  await browser.close();
}
