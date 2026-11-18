// Provider 탭 — 작은 카드로 전부(역할별 · 켠 것 먼저) · 카드마다 사용 토글 · 역할마다 대표 하나. 재시작 없이 바로 반영.
// Run only against an isolated server with fake credentials (no model is called; WINMATE_ADMIN_DATA temporary):
//   OPENROUTER_API_KEY=sk-fake… GEMINI_API_KEY=fake… TYPESAFE_API_KEY=fake… WINMATE_PROVIDER_CHECK_INTERVAL=off WINMATE_ENV_FILES=none
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8824 node admin/tests/providers-switch-ui.mjs
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8824';
const out = path.resolve('admin/runtime/evidence/providers-switch'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!' } });
  assert.equal(login.status(), 200, await login.text());
  // server truth: ids on, in order (대표 first)
  const on = async role => (await (await context.request.get(base + '/admin/api/providers')).json()).providers
    .filter(p => p.role === role && p.active).sort((a, b) => a.rank - b.rank).map(p => p.id);
  assert.deepEqual([await on('llm'), await on('decision')], [['llm.openrouter'], ['decision.main']], 'fresh isolated state');
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/admin/providers');
  const card = id => page.locator(`.provider-card[data-provider="${id}"]`);
  const shown = role => page.locator('.provider-group').filter({ has: page.locator('h3', { hasText: role === 'llm' ? 'LLM' : 'Decision' }) })
    .locator('.provider-card').evaluateAll(cards => cards.map(c => c.dataset.provider));
  await card('llm.openrouter').waitFor();

  // 전부 보인다: 켠 것 먼저, 작은 카드(한 줄에 여러 개), 등록 팝업 없음
  assert.deepEqual((await shown('llm'))[0], 'llm.openrouter');
  assert.equal((await shown('llm')).length, 4);
  assert.deepEqual(await shown('decision'), ['decision.main', 'decision.clef', 'decision.inhouse']);
  assert.equal(await page.getByRole('button', { name: /등록된 Provider/ }).count(), 0);
  const [a, b] = [await card('llm.openrouter').boundingBox(), await card((await shown('llm'))[1]).boundingBox()];
  assert.ok(Math.abs(a.y - b.y) < 1 && a.width < 360, 'compact cards sit side by side: ' + a.width);
  assert.equal(await card('llm.openrouter').locator('.pc-primary').innerText(), '대표');
  // 마지막 LLM은 끌 수 없고, 연결 정보 없는 것은 켤 수 없다
  assert.ok(await card('llm.openrouter').getByRole('switch').isDisabled());
  assert.ok(await card('llm.openai').getByRole('switch').isDisabled());

  // 토글로 켜기 → 대체 1 · 대표로 → 순서가 바뀐다
  await card('llm.gemini').getByRole('switch').click();
  await card('llm.gemini').locator('.pc-rank', { hasText: '대체 1' }).waitFor();
  assert.deepEqual(await on('llm'), ['llm.openrouter', 'llm.gemini']);
  assert.deepEqual((await shown('llm')).slice(0, 2), ['llm.openrouter', 'llm.gemini']);
  assert.equal(await card('llm.openrouter').getByRole('switch').isDisabled(), false);
  await card('llm.gemini').getByRole('button', { name: '대표로' }).click();
  await card('llm.gemini').locator('.pc-primary').waitFor();
  assert.deepEqual(await on('llm'), ['llm.gemini', 'llm.openrouter']);
  assert.deepEqual((await shown('llm')).slice(0, 2), ['llm.gemini', 'llm.openrouter']);

  const confirmSwitch = () => page.getByRole('dialog').getByRole('button', { name: '전환', exact: true }).click();
  await card('decision.clef').getByRole('switch').click();
  await page.getByRole('dialog').getByRole('button', { name: '취소' }).click();
  assert.deepEqual(await on('decision'), ['decision.main']);
  await card('decision.clef').getByRole('switch').click();
  await confirmSwitch();
  await card('decision.clef').locator('.pc-primary').waitFor();
  assert.deepEqual(await on('decision'), ['decision.clef']);
  await card('decision.clef').getByRole('switch').click();
  await confirmSwitch();
  await page.getByText('모두 꺼짐 · LLM이 판단').waitFor();
  assert.deepEqual(await on('decision'), []);

  if (process.env.WINMATE_CLEF_TEST_ENDPOINT) {
    await page.getByRole('button', { name: 'CLEF 추가' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Endpoint', { exact: true }).fill(process.env.WINMATE_CLEF_TEST_ENDPOINT);
    await dialog.getByRole('button', { name: '샘플 확인 후 연결' }).click();
    const added = page.locator('.provider-card[data-provider^="decision.clef-"]');
    await added.waitFor();
    assert.equal(await added.getByRole('switch').getAttribute('aria-checked'), 'false');
    await added.getByRole('switch').click();
    await confirmSwitch();
    await added.locator('.pc-primary').waitFor();
    assert.deepEqual(await on('decision'), [await added.getAttribute('data-provider')]);
    await page.getByRole('button', { name: 'CLEF 추가' }).click();
    await dialog.getByLabel('연결 방식').selectOption('training');
    await dialog.getByRole('button', { name: 'Training job 시작' }).click();
    await dialog.getByRole('alert').filter({ hasText: '연동이 구성되지 않았습니다' }).waitFor();
    await dialog.getByRole('button', { name: '닫기' }).click();
  }

  // 대표 끄기 → 다음이 대표, 원래대로 돌리기
  await card('llm.gemini').getByRole('switch').click();
  await card('llm.openrouter').locator('.pc-primary').waitFor();
  await card('decision.main').getByRole('switch').click();
  await confirmSwitch();
  await card('decision.main').locator('.pc-primary').waitFor();
  assert.deepEqual([await on('llm'), await on('decision')], [['llm.openrouter'], ['decision.main']]);
  await page.screenshot({ path: path.join(out, '2-back.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log('providers-switch-ui: ok');
} finally {
  await browser.close();
}
