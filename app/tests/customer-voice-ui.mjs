// Real customer popup -> authenticated HTTP -> SQLite -> already-open admin inbox.
// Temporary credentials/databases only. Expected model failures are unrelated to feedback.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'winmate-voice-'));
const port = 18887, origin = 'http://127.0.0.1:' + port;
const output = path.join(root, 'app/tests/output/customer-voice');
await fs.mkdir(output, { recursive: true });
const server = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/customer_voice_server.py'], { cwd: root,
  env: { ...process.env, WINMATE_API_PORT: String(port), WINMATE_ADMIN_DATA: path.join(temp, 'admin'), WINMATE_AUTH_DIR: path.join(temp, 'auth'),
    WINMATE_TEMPLATE_DB: path.join(temp, 'accounts.sqlite'), WINMATE_SPATIAL_DB: path.join(temp, 'spatial.sqlite'), WINMATE_STORYBOARD_DIR: path.join(temp, 'shares') },
  stdio: ['ignore', 'ignore', 'pipe'] });
let logs = '', browser, page; const errors = [], checks = [];
server.stderr.on('data', value => { logs += value; });
const pass = text => { checks.push(text); console.log('PASS', text); };
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(origin + '/api/auth/status')).ok) break; } catch {}
    if (i > 200 || server.exitCode !== null) throw new Error('Fixture unavailable: ' + logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  assert.equal((await context.request.post(origin + '/api/auth/login', { data: { username: 'voice-admin', password: 'voice-browser-test-password' } })).status(), 200);
  await context.route('**/api/llm', route => route.fulfill({ status: 503, json: { detail: 'No model calls in feedback tests' } }));
  const admin = await context.newPage(); admin.on('pageerror', error => errors.push(error.message));
  await admin.goto(origin + '/admin/voice'); await admin.getByRole('heading', { name: '사용자님의 목소리', exact: true }).waitFor();
  await admin.getByRole('heading', { name: '접수된 고객 의견이 없습니다', exact: true }).waitFor();
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.locator('.app[data-app-ready="true"]').waitFor();
  const voice = () => page.getByRole('button', { name: '사용자님의 목소리', exact: true });
  const popup = () => page.getByRole('dialog', { name: '사용자님의 목소리', exact: true });
  const inbox = async () => (await context.request.get(origin + '/api/admin/customer-voice')).json();
  assert(await page.locator('.sb-voice-slot').evaluate(element => element.nextElementSibling.classList.contains('sb-foot')));
  await page.mouse.move(1495, 2);
  await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().width < 100);
  const triggerBounds = await voice().evaluate(element => { const r = element.getBoundingClientRect(), side = document.querySelector('.sidebar').getBoundingClientRect(); return { right: r.right, side: side.right }; });
  assert(triggerBounds.right <= triggerBounds.side, 'collapsed button hit area stays inside the visible sidebar');
  await voice().click(); await popup().waitFor();
  const desktop = await popup().evaluate(element => { const box = element.getBoundingClientRect(), side = document.querySelector('.sidebar').getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, side: side.right, width: innerWidth, height: innerHeight }; });
  assert(desktop.left >= desktop.side + 8 && desktop.right <= desktop.width - 10 && desktop.top >= 10 && desktop.bottom <= desktop.height - 10);
  assert(await popup().getByRole('button', { name: 'Send', exact: true }).isDisabled());
  await popup().getByRole('textbox', { name: '고객 의견', exact: true }).fill('의견을 작성하는 중');
  await page.keyboard.press('Escape'); await popup().waitFor({ state: 'detached' });
  await voice().click(); assert.equal(await popup().getByRole('textbox', { name: '고객 의견', exact: true }).inputValue(), '의견을 작성하는 중');
  assert.equal((await inbox()).total, 0);
  await popup().getByRole('button', { name: '의견 창 닫기', exact: true }).click();
  pass('button sits immediately above profile; right-side popup focuses input, rejects empty send, and preserves drafts on Escape');

  await page.getByRole('button', { name: '새 제안서 시작', exact: true }).click();
  const requirements = page.getByRole('textbox', { name: '자유형식 요구사항', exact: true }); await requirements.waitFor();
  const requirement = '저장 전 고객 요구사항 · 회의실 디스플레이와 키오스크를 제안합니다.\n'.repeat(100);
  await requirements.fill(requirement);
  const proposalId = decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1));
  const scroll = await page.evaluate(() => {
    const elements = [...document.querySelectorAll('.main *,[role="dialog"] *')].filter(element => element.getClientRects().length && element.scrollHeight > element.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(element).overflowY));
    const target = elements.find(element => element.id === 'free-ed') || elements[0];
    if (!target) throw new Error('Expected a scrollable work area'); target.scrollTop = 170; return { top: target.scrollTop };
  });
  assert(scroll.top > 0);
  await voice().click(); await popup().getByRole('textbox', { name: '고객 의견', exact: true }).fill('요구사항을 작성하다 화면이 어긋났습니다. <b>원문 그대로</b>');
  const sent = page.waitForResponse(response => response.url().endsWith('/api/customer-voice') && response.request().method() === 'POST');
  await popup().getByRole('button', { name: 'Send', exact: true }).click(); assert.equal((await sent).status(), 200);
  await popup().waitFor({ state: 'detached' });
  const rows = await inbox(); assert.equal(rows.total, 1); const id = rows.items[0].id;
  const detail = await (await context.request.get(origin + '/api/admin/customer-voice/' + id)).json();
  assert.equal(detail.owner, 'voice-admin'); assert.equal(detail.work_id, proposalId); assert.equal(detail.stage, 'req');
  assert(detail.context.current.scroll.containers.some(item => item.top > 0));
  assert(JSON.stringify(detail.context.current).includes('저장 전 고객 요구사항'));
  assert(detail.context.current.ui.controls.some(field => field.value?.includes('저장 전 고객 요구사항')));
  assert(detail.context.opened && detail.context.current.captured_at);
  pass('Send stores real proposal ID/stage, unsaved requirements, nested scroll position, and both opening/sending snapshots in SQLite');

  await admin.getByRole('button', { name: 'voice-admin 고객 의견 상세', exact: true }).waitFor({ timeout: 12000 });
  await admin.getByRole('button', { name: 'voice-admin 고객 의견 상세', exact: true }).click();
  const adminDialog = admin.getByRole('dialog', { name: '고객 의견 상세', exact: true }); await adminDialog.waitFor();
  assert.equal(await adminDialog.locator('[data-voice-message]').innerText(), detail.message);
  assert.equal(await adminDialog.locator('[data-voice-message] b').count(), 0);
  await adminDialog.getByText('선택 요소 · 열린 팝업 · 저장 전 입력값', { exact: true }).click();
  assert((await adminDialog.innerText()).includes('저장 전 고객 요구사항'));
  await admin.screenshot({ path: path.join(output, 'admin-submitted-context.png') });
  const statusUpdated = admin.waitForResponse(response => response.url().endsWith('/api/admin/customer-voice/' + id) && response.request().method() === 'PATCH');
  await adminDialog.getByRole('combobox', { name: '고객 의견 처리 상태', exact: true }).selectOption('reviewing');
  assert.equal((await statusUpdated).status(), 200);
  await adminDialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await admin.reload(); await admin.getByText('확인 중', { exact: true }).last().waitFor();
  pass('already-open admin inbox auto-refreshes, shows original text safely plus detailed state, and preserves review status after reload');

  await context.route('**/api/customer-voice', route => route.fulfill({ status: 503, json: { detail: '전송 실패 테스트' } }));
  await voice().click(); await popup().getByRole('textbox', { name: '고객 의견', exact: true }).fill('실패한 의견은 유지하고 다시 보냅니다.');
  await popup().getByRole('button', { name: 'Send', exact: true }).click();
  await popup().getByText('전송 실패 테스트', { exact: true }).waitFor();
  assert.equal(await popup().getByRole('textbox', { name: '고객 의견', exact: true }).inputValue(), '실패한 의견은 유지하고 다시 보냅니다.');
  assert.equal((await inbox()).total, 1);
  await context.unroute('**/api/customer-voice');
  await popup().getByRole('button', { name: 'Send', exact: true }).click(); await popup().waitFor({ state: 'detached' });
  assert.equal((await inbox()).total, 2);
  pass('failed send keeps the message and retry persists exactly one feedback record');

  await page.getByRole('button', { name: /^PPT 레이아웃 템플릿/ }).click();
  await page.locator('.tl-card').first().click(); await page.getByRole('button', { name: '수정하기', exact: true }).click();
  const editor = page.locator('.modal').filter({ has: page.locator('.myed') }); await editor.waitFor();
  const title = editor.locator('.ed-host [data-tb]').first(); await title.dblclick();
  await editor.locator('[contenteditable="true"]').fill('저장 전 레이아웃 문구'); await page.keyboard.press('Escape');
  await voice().click(); await popup().waitFor();
  await page.keyboard.press('Escape'); await popup().waitFor({ state: 'detached' }); assert(await editor.isVisible());
  await voice().click(); await popup().getByRole('textbox', { name: '고객 의견', exact: true }).fill('레이아웃 편집 상태에서 보낸 의견입니다.');
  await page.screenshot({ path: path.join(output, 'popup-over-editor.png') });
  await popup().getByRole('button', { name: 'Send', exact: true }).click(); await popup().waitFor({ state: 'detached' });
  assert(await editor.isVisible());
  const edited = (await inbox()).items[0], editedDetail = await (await context.request.get(origin + '/api/admin/customer-voice/' + edited.id)).json();
  assert.equal(editedDetail.work_type, 'layout'); assert(editedDetail.work_id.startsWith('L_'));
  assert(editedDetail.context.current.contexts.layout_editor.dirty);
  assert(editedDetail.context.current.contexts.layout_editor.html.includes('저장 전 레이아웃 문구'));
  assert(editedDetail.context.current.contexts.layout_agent);
  pass('sidebar feedback remains clickable above an editor dialog; Escape preserves work and context includes dirty layout/agent state');

  const mobile = await context.newPage(); mobile.on('pageerror', error => errors.push(error.message));
  await mobile.setViewportSize({ width: 390, height: 844 }); await mobile.goto(origin); await mobile.locator('.app[data-app-ready="true"]').waitFor();
  await mobile.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await mobile.getByRole('button', { name: '사용자님의 목소리', exact: true }).click();
  const mobilePopup = mobile.getByRole('dialog', { name: '사용자님의 목소리', exact: true }); await mobilePopup.waitFor();
  const geometry = await mobilePopup.evaluate(element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom, height: innerHeight, width: innerWidth }; });
  assert(geometry.left >= 10 && geometry.right <= geometry.width - 10 && geometry.bottom <= geometry.height - 10);
  await mobile.screenshot({ path: path.join(output, 'mobile.png') });
  pass('mobile popup stays fully inside the viewport');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) { await page.screenshot({ path: path.join(output, 'failure.png') }); console.error((await page.locator('body').innerText()).slice(-4000)); }
  throw error;
} finally {
  await browser?.close(); server.kill('SIGTERM');
  if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
