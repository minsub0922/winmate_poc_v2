// 「소스 점검 · 업데이트」 화면 — 격리 서버(별도 WINMATE_ADMIN_DATA · WINMATE_AUTH_DIR)에서 실행한다.
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8799 WINMATE_ADMIN_TEST_PASSWORD=… [CHROME=…] node admin/tests/dss-ui.mjs
// 점검 · 업데이트 · 삭제를 실제로 실행하지 않는다(버튼 상태 · 확인 창 · OAuth 시작까지만). 에이전트 CLI 가 없으면 연결 단계는 건너뛴다.
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const password = process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!';
const out = path.resolve('admin/runtime/evidence/dss'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const results = [], errors = [];
let current;
const step = async (name, run) => { try { await run(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ' — ' + String(e.message).split('\n')[0]]); await current?.keyboard.press('Escape').catch(() => {}); } };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password } });
  assert.equal(login.status(), 200, await login.text());
  const page = current = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const data = async p => (await context.request.get(base + '/admin/api' + p)).json();
  await page.goto(base + '/admin/dss');
  await page.getByRole('heading', { name: '소스 점검 · 업데이트', exact: true }).waitFor();
  await page.locator('.dss-channel').first().waitFor();
  const overview = await data('/dss');

  await step('채널 카드 4개 · 최근 점검 상태', async () => {
    assert.equal(await page.locator('.dss-channel').count(), 4);
    for (const c of overview.channels) {
      const card = page.locator('.dss-channel', { hasText: c.name });
      await card.getByText(c.latest ? c.latest.summary : '점검 결과가 없습니다.', { exact: true }).waitFor();
    }
    await page.screenshot({ path: path.join(out, 'page.png'), fullPage: true });
  });

  await step('자동 점검 일정: 시각 저장 · 끄기 · 켜기', async () => {
    const time = page.getByLabel('자동 점검 시각');
    assert.equal(await time.inputValue(), overview.schedule.time);
    await time.fill('07:30'); await time.blur();
    await page.getByText('자동 점검 설정을 저장했습니다.').waitFor();
    assert.equal((await data('/dss')).schedule.time, '07:30');
    await page.getByRole('switch', { name: '매일 자동 점검' }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="자동 점검 시각"]').disabled);
    assert.equal((await data('/dss')).schedule.enabled, false);
    await page.getByRole('switch', { name: '매일 자동 점검' }).click();
    await page.waitForFunction(() => !document.querySelector('[aria-label="자동 점검 시각"]').disabled);
    await time.fill(overview.schedule.time); await time.blur();
    await page.waitForTimeout(600);
    assert.deepEqual((({ enabled, time }) => ({ enabled, time }))((await data('/dss')).schedule), { enabled: true, time: overview.schedule.time });
  });

  const checked = overview.channels.find(c => c.latest);
  if (checked) await step('변경 내용 창', async () => {
    await page.locator('.dss-channel', { hasText: checked.name }).getByRole('button', { name: '변경 내용' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: checked.name, exact: true }).waitFor();
    await dialog.getByText(checked.latest.summary, { exact: true }).waitFor();
    assert.equal(await page.locator('.dss-changes > div').count(), Math.min(200, checked.latest.changes.length));
    await page.screenshot({ path: path.join(out, 'changes.png') });
    await page.keyboard.press('Escape');
  });

  const agents = (await data('/dss/agent')).providers;
  await step('에이전트 연결 전에는 업데이트 · 연관 글 정리를 실행할 수 없다', async () => {
    if (agents.some(a => a.connected)) return;
    for (const button of await page.locator('.dss-channel').getByRole('button', { name: '업데이트' }).all()) assert.equal(await button.isDisabled(), true);
    const r = await context.request.post(base + '/admin/api/dss/update', { data: { channel: 'ecat' }, headers: { origin: base } });
    assert.equal(r.status(), 422);
  });

  const installed = agents.find(a => a.installed && !a.connected);
  if (installed) await step(`OAuth 연결 시작: ${installed.name} — 인증 주소가 뜨고, 닫으면 세션이 취소된다`, async () => {
    await page.locator('.dss-agent', { hasText: installed.name }).getByRole('button', { name: 'OAuth 연결' }).click();
    const link = page.getByRole('link', { name: '인증 페이지 열기' });
    await link.waitFor({ timeout: 40000 });
    assert.match(await link.getAttribute('href'), /^https:\/\//);
    if (installed.id === 'claude') assert.equal(await page.getByLabel('인증 코드').count(), 1); else await page.locator('.dss-device-code').waitFor();
    await page.screenshot({ path: path.join(out, 'login-' + installed.id + '.png') });
    await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).last().click();  // 알림의 '알림 닫기'와 섞이지 않게 창 안에서 찾는다
    let left;
    for (let i = 0; i < 20; i++) { left = (await data('/dss/agent')).providers.find(a => a.id === installed.id).login; if (!left) break; await page.waitForTimeout(250); }
    assert.equal(left, undefined, '닫은 뒤에도 연결 세션이 남아 있음: ' + JSON.stringify(left));
  });

  const candidates = (await data('/dss/deletions')).candidates || [];
  await step(`삭제 후보 ${candidates.length}개 · 확인 전에는 삭제를 실행할 수 없다`, async () => {
    assert.equal(await page.locator('.dss-table tbody tr').count(), candidates.length);
    const free = candidates.filter(c => !(c.blocked || []).length);
    if (!free.length) return;
    await page.locator('.dss-table tbody tr', { hasText: free[0].id }).first().locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: '선택 1개 삭제' }).click();
    await page.getByRole('heading', { name: '1개 항목 삭제' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '삭제 실행' }).isDisabled(), true);
    await page.getByLabel(/삭제를 확인했습니다/).check();
    assert.equal(await page.getByRole('button', { name: '삭제 실행' }).isDisabled(), false);
    await page.screenshot({ path: path.join(out, 'delete-confirm.png') });
    await page.getByRole('button', { name: '취소' }).click();
    const r = await context.request.post(base + '/admin/api/dss/deletions', { data: { ids: [free[0].key] }, headers: { origin: base } });
    assert.equal(r.status(), 422);  // 확인 없이 보낸 요청
    assert.equal((await data('/dss/deletions')).candidates.length, candidates.length);
  });

  await step('모바일 폭에서 가로 넘침 없음', async () => {
    await page.setViewportSize({ width: 390, height: 900 }); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
  });
  await step('페이지 오류 없음', async () => assert.deepEqual(errors, []));
} finally { await browser.close(); }
for (const [state, name] of results) console.log(state.padEnd(4), name);
fs.writeFileSync(path.join(out, 'ui-results.json'), JSON.stringify({ at: new Date().toISOString(), base, results }, null, 1));
process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);
