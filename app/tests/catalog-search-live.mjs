// Explicit real-model smoke; requires a running API (default: isolated API on :8799).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
process.env.WINMATE_TEST_URL ||= 'http://127.0.0.1:8799';
process.env.WINMATE_STRICT_VITE_PORT ||= '5196';
const { startVite, launch, login } = await import('./fixtures/strict/harness.mjs');
let vite, browser;
const output = 'app/tests/output/catalog-search';
await fs.mkdir(output, { recursive: true });
try {
 vite = await startVite(); browser = await launch();
 const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } }); await login(context, vite.url);
 const page = await context.newPage(); page.setDefaultTimeout(90000);
 const errors = [], requests = [], rows = [];
 page.on('pageerror', e => errors.push(e.message));
 page.on('request', r => { if (r.url().endsWith('/api/llm')) { const b = r.postDataJSON(); requests.push({ kind: b.kind, feature: b.feature, promptChars: b.prompt?.length }); } });
 await page.goto(vite.url); await page.locator('.home').waitFor();
 for (const name of ['library', 'scenarios']) {
  await page.evaluate(async name => {
   const { saveUi, loadUi } = await import('/src/repositories/proposals.js');
   saveUi({ ...loadUi(), route: { name }, [name === 'library' ? 'lib' : 'bs']: { q: '' } }); await new Promise(r => setTimeout(r, 350));
  }, name);
  await page.reload(); const input = page.locator(name === 'library' ? '#tl-q' : '#bs-q'); await input.waitFor();
  await page.mouse.move(1496, 2); await page.waitForTimeout(350);
  const toggle = page.getByRole('button', { name: 'AI 검색', exact: true });
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false'); await toggle.click();
  const before = requests.length;
  await input.fill('전국 프랜차이즈 매장의 메뉴와 가격을 본사에서 원격으로 변경하고 운영 비용을 줄이려 합니다. 파일럿과 투자 회수 근거를 설명할 자료를 찾아 주세요.');
  await page.waitForTimeout(350); assert.equal(requests.length, before);
  if (name === 'library') await page.getByRole('button', { name: '검색 보내기', exact: true }).click(); else await input.press('Enter');
  await page.locator('.feedback-popup.progress').waitFor(); await page.screenshot({ path: output + '/' + name + '-loading.png' });
  await page.waitForFunction(() => !document.querySelector('.feedback-popup.progress'), null, { timeout: 120000 });
  const error = page.locator('.feedback-popup.error'); if (await error.count()) throw Error(await error.innerText());
  const top = page.getByRole('region', { name: 'AI 추천 Top 10', exact: true }); await top.waitFor();
  const card = name === 'library' ? '.tl-card' : '.bsl';
  assert.equal(await top.locator(card).count(), 10);
  const rest = page.getByRole('region', { name: '나머지 검색 결과', exact: true }); assert(await rest.locator(card).count() > 0);
  if (name === 'library') assert.equal(await top.locator('.tl-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3);
  await page.mouse.move(1496, 2); await page.screenshot({ path: output + '/' + name + '-live.png' });
  rows.push({ name, top: 10, remaining: await rest.locator(card).count(), modelCalls: requests.length - before,
   first: await top.locator(name === 'library' ? '.tl-name b' : '.bsl-t').first().innerText() });
  console.log('PASS', rows.at(-1));
  const after = requests.length;
  await input.fill('고친 검색 문장은 아직 보내지 않았습니다'); await page.waitForTimeout(350);
  assert.equal(requests.length, after); assert.equal(await top.count(), 1);
 }
 assert.deepEqual(errors, []);
 await fs.writeFile(output + '/live-report.json', JSON.stringify({ rows, requests, errors }, null, 2));
} finally { await browser?.close(); await vite?.close(); }
