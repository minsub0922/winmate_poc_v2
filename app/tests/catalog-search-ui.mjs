// Real app/catalog, isolated browser/storage; held model requests fail explicitly.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'winmate-catalog-search-'));
const port = process.env.WINMATE_SEARCH_TEST_PORT || '8795';
process.env.WINMATE_TEST_URL = `http://127.0.0.1:${port}`;
process.env.WINMATE_STRICT_VITE_PORT = process.env.WINMATE_SEARCH_WEB_PORT || '5195';
const server = spawn('app/.venv/bin/python', ['-B', 'app/tests/fixtures/sharing_server.py'], { env: { ...process.env, WINMATE_API_PORT: port, WINMATE_AUTH_DIR: path.join(temp, 'auth'), WINMATE_STORYBOARD_DIR: path.join(temp, 'shares') }, stdio: ['ignore', 'ignore', 'pipe'] });
let logs = ''; server.stderr.on('data', data => { logs += data; });
const { startVite, launch } = await import('./fixtures/strict/harness.mjs');
let vite, browser;
const checks = [], errors = [], output = 'app/tests/output/catalog-search';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const gates = [];
try {
 for (let i = 0; ; i++) {
  try { if ((await fetch(process.env.WINMATE_TEST_URL + '/api/auth/status')).ok) break; } catch {}
  if (i > 200 || server.exitCode !== null) throw Error('Server unavailable: ' + logs); await sleep(100);
 }
 vite = await startVite(); browser = await launch();
 const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
 assert.equal((await context.request.post(vite.url + '/api/auth/login', { data: { username: 'sharing-owner', password: 'sharing-browser-test-password' } })).status(), 200);
 const requests = []; let hold = true;
 await context.route('**/api/llm', async route => {
  requests.push(route.request().postDataJSON());
  if (hold) await new Promise(resolve => gates.push(resolve));
  await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'upstream_unavailable', detail: 'AI unavailable in deterministic test' }) }).catch(() => {});
 });
 const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
 let oldRemote = 0; page.on('request', r => { if (r.url().includes('/api/layouts/search')) oldRemote++; });
 await page.goto(vite.url); await page.locator('.home').waitFor();
 const open = async name => {
  await page.evaluate(async name => { const { saveUi, loadUi } = await import('/src/repositories/proposals.js'); saveUi({ ...loadUi(), route: { name } }); await new Promise(r => setTimeout(r, 350)); }, name);
  await page.reload(); await page.locator(name === 'library' ? '#tl-q' : '#bs-q').waitFor();
  await page.mouse.move(page.viewportSize().width - 4, 2); await sleep(300);
 };
 for (const name of ['library', 'scenarios']) {
  hold = true; await open(name);
  const input = page.locator(name === 'library' ? '#tl-q' : '#bs-q');
  const toggle = page.getByRole('button', { name: 'AI 검색', exact: true });
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  const placeholder = await input.getAttribute('placeholder');
  const tooltip = page.locator('#' + (name === 'library' ? 'tl-q' : 'bs-q') + '-ai-description');
  assert.equal(await tooltip.isVisible(), false);
  assert.equal(await page.locator('.catalog-search-input > svg').count(), 0);
  await toggle.hover(); await tooltip.waitFor({ state: 'visible' });
  assert.match(await tooltip.innerText(), /보내기.*Enter/);
  await page.mouse.move(page.viewportSize().width - 4, 2); await tooltip.waitFor({ state: 'hidden' });
  await fs.mkdir(output, { recursive: true });
  await page.locator('.catalog-search').screenshot({ path: path.join(output, name + '-search-off.png') });
  const before = requests.length;
  await input.fill(name === 'library' ? '도입 효과' : '메뉴보드');
  await page.waitForFunction(name => document.querySelectorAll(name === 'library' ? '.tl-card' : '.bsl').length > 0, name);
  await input.press('Enter'); await sleep(400); assert.equal(requests.length, before); assert.equal(oldRemote, 0);
  checks.push(name + ': instant keyword search and Enter make zero model calls');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(await input.getAttribute('placeholder'), placeholder);
  assert.equal(await page.locator('.catalog-search-hint').count(), 0);
  await input.click(); await tooltip.waitFor({ state: 'hidden' });
  await page.locator('.catalog-search').screenshot({ path: path.join(output, name + '-search-on.png') });
  await input.fill('여러 매장의 메뉴를 본사에서 바꾸고 비용을 줄이고 싶어요'); await sleep(400);
  assert.equal(requests.length, before);
  const geometry = await toggle.evaluate(el => {
   const button = el.getBoundingClientRect(), form = el.closest('form').getBoundingClientRect();
   return { left: button.left, top: button.top, right: button.right, bottom: button.bottom, form: { left: form.left, top: form.top, right: form.right, bottom: form.bottom }, input: el.closest('form').querySelector('input').getBoundingClientRect().left };
  });
  assert(geometry.left > geometry.form.left && geometry.top > geometry.form.top && geometry.bottom < geometry.form.bottom && geometry.right <= geometry.input);
  checks.push(name + ': prominent AI toggle sits inside search box, explains on hover, no icon or extra hint');
  if (name === 'library') await page.getByRole('button', { name: '검색 보내기', exact: true }).click(); else await input.press('Enter');
  await page.locator('.feedback-popup.progress').waitFor();
  assert.equal(await page.locator(name === 'library' ? '.tl-card' : '.bsl').count(), 0);
  assert.equal(requests.length, before + 1);
  await input.fill('수정한 다른 고객 상황'); await sleep(300); assert.equal(requests.length, before + 1);
  assert.equal(await page.locator('.catalog-search-hint').count(), 0);
  checks.push(name + ': loading uses a popup; editing during search does not submit');
  hold = false; gates.splice(0).forEach(resolve => resolve());
  await page.locator('.feedback-popup.error').waitFor();
  assert.equal(await input.inputValue(), '수정한 다른 고객 상황');
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector('.feedback-popup.error'));
  assert.equal(requests.length, before + 2);
  checks.push(name + ': failure preserves input, retry repeats the submitted query');
  hold = true; await input.press('Enter'); await page.locator('.feedback-popup.progress').waitFor();
  await toggle.click();
  await input.fill(name === 'library' ? '도입 효과' : '메뉴보드');
  hold = false; gates.splice(0).forEach(resolve => resolve()); await sleep(300);
  assert.equal(await page.locator('.catalog-search-status').count(), 0);
  assert(await page.locator(name === 'library' ? '.tl-card' : '.bsl').count() > 0);
  checks.push(name + ': switching AI off cancels old results and resumes keyword search');
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  await toggle.click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert(await page.getByRole('button', { name: '검색 보내기', exact: true }).isVisible());
  await fs.mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, name + '-mobile.png') });
  await page.setViewportSize({ width: 1500, height: 1000 }); await sleep(300);
  await page.reload(); await input.waitFor(); await page.mouse.move(page.viewportSize().width - 4, 2); await sleep(300); assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  checks.push(name + ': mobile controls fit and AI mode defaults off on reload');
 }
 await page.evaluate(async () => {
  const React = (await import('/node_modules/.vite/deps/react.js')).default; const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const { LayoutPicker } = await import('/src/components/layouts.jsx');
  const { scenarioStoryboard } = await import('/src/domain/templates/scenario_storyboard.js');
  const proposal = scenarioStoryboard('bs01'); const part = proposal.parts.find(p => !p.deck);
  const host = document.createElement('div'); document.body.appendChild(host);
  window.__searchPickerRoot = createRoot(host);
  window.__searchPickerRoot.render(React.createElement(LayoutPicker, { p: proposal, partId: part.id, onClose: () => {} }));
 });
 const picker = page.locator('.modal.xwide'); await picker.locator('#pk-q').waitFor();
 const pickerToggle = picker.getByRole('button', { name: 'AI 검색', exact: true });
 const beforePicker = requests.length;
 assert.equal(await pickerToggle.getAttribute('aria-pressed'), 'false');
 await picker.locator('#pk-q').fill('설치');
 await page.waitForFunction(() => document.querySelectorAll('.modal.xwide .pcard').length > 0);
 await sleep(300); assert.equal(requests.length, beforePicker);
 checks.push('proposal layout picker uses the same instant keyword search without AI requests');
 await pickerToggle.click(); hold = true;
 await picker.locator('#pk-q').fill('운영 비용을 줄일 자료'); await sleep(300); assert.equal(requests.length, beforePicker);
 await picker.locator('#pk-q').press('Enter'); await page.locator('.feedback-popup.progress').waitFor();
 assert.equal(requests.length, beforePicker + 1);
 hold = false; gates.splice(0).forEach(resolve => resolve());
 await page.locator('.feedback-popup.error').waitFor();
 checks.push('proposal layout picker waits for Enter and displays result loading and retry');
 await page.evaluate(() => window.__searchPickerRoot.unmount());
 assert.deepEqual(errors, []); assert.equal(oldRemote, 0);
 await fs.writeFile(path.join(output, 'ui-report.json'), JSON.stringify({ checks, errors, modelRequests: requests.length }, null, 2));
 checks.forEach(check => console.log('PASS', check)); console.log(checks.length + '/' + checks.length + ' catalog search UI cases passed');
} finally {
 gates.splice(0).forEach(resolve => resolve()); await browser?.close(); await vite?.close(); server.kill('SIGTERM');
 if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
 await fs.rm(temp, { recursive: true, force: true });
}
