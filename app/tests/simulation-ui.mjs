// Isolated real UI/data regression. Model calls return errors; no generated success responses.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'winmate-simulation-'));
const port = process.env.WINMATE_SIM_TEST_PORT || '8797';
process.env.WINMATE_TEST_URL = `http://127.0.0.1:${port}`;
process.env.WINMATE_STRICT_VITE_PORT = process.env.WINMATE_SIM_WEB_PORT || '5197';
const server = spawn('app/.venv/bin/python', ['-B', 'app/tests/fixtures/sharing_server.py'], {
  env: { ...process.env, WINMATE_API_PORT: port, WINMATE_AUTH_DIR: path.join(temp, 'auth'), WINMATE_STORYBOARD_DIR: path.join(temp, 'shares') }, stdio: ['ignore', 'ignore', 'pipe'],
});
let logs = ''; server.stderr.on('data', x => { logs += x; });
const { startVite, launch } = await import('./fixtures/strict/harness.mjs');
const checks = [], errors = [];
const output = 'app/tests/output/simulation';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let vite, browser;
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(process.env.WINMATE_TEST_URL + '/api/auth/status')).ok) break; } catch {}
    if (n > 200 || server.exitCode !== null) throw Error('Isolated server unavailable: ' + logs);
    await sleep(100);
  }
  vite = await startVite(); browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.route('**/api/llm', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'upstream_unavailable', detail: 'AI 연결을 확인해 주세요.' }) }));
  const login = await context.request.post(vite.url + '/api/auth/login', { data: { username: 'sharing-owner', password: 'sharing-browser-test-password' } });
  assert.equal(login.status(), 200);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(vite.url); await page.locator('.home').waitFor();
  await page.evaluate(async () => {
    const { setupFromScenario } = await import('/src/domain/simulation/profile.js');
    const repo = await import('/src/repositories/simulations.js');
    const { saveUi } = await import('/src/repositories/proposals.js');
    const sim = repo.newSim(setupFromScenario('bs01'), 2);
    const confidence = { score: 90, requirementsClear: true, grounded: true, concrete: true, reason: '본사 메뉴 통합 관리 요구에 MagicINFO의 원격 배포 기능을 연결합니다.' };
    sim.msgs = [{ id: 'customer', who: 'cust', text: '본사에서 매장 메뉴를 한 번에 바꾸는 방법을 알고 싶습니다.', ev: { satisfaction: 45, delta: 0 } }];
    sim.cur.suggest = [
      { title: '통합 관리 제안', segs: [{ t: '본사에서 ' }, { ref: 'solution:magicinfo' }, { t: '로 매장 메뉴를 원격으로 일괄 배포하여 고객의 운영 요구를 해결합니다.' }], confident: true, confidence },
      { title: '도입 조건 확인', segs: [{ t: '매장별 네트워크와 운영 시간부터 함께 확인해 볼까요?' }], confident: false, confidence: { ...confidence, score: 84 } },
      { title: '이전 추천', segs: [{ t: '운영 현황과 기존 장비 구성을 확인하겠습니다.' }] },
    ];
    sim.cur.src = 'ai'; repo.putSim(sim); window.__simTestId = sim.id;
    saveUi({ route: { name: 'sim', id: sim.id } }); await new Promise(r => setTimeout(r, 350));
  });
  await page.reload(); await page.locator('.sim').waitFor();
  await page.evaluate(() => { window.__simTestId = JSON.parse(localStorage.getItem('winmate.v2.sims'))[0].id; });
  const cards = await page.locator('.sim-sug').evaluateAll(els => els.map(el => ({ font: parseFloat(getComputedStyle(el.querySelector('.sim-sug-t')).fontSize), height: el.clientHeight, lines: getComputedStyle(el.querySelector('.sim-sug-t')).whiteSpace, textHeight: el.querySelector('.sim-sug-t').clientHeight, stripe: getComputedStyle(el, '::before').content })));
  assert.equal(cards.length, 3); assert(cards.every(c => c.font >= 14 && c.lines === 'nowrap' && c.textHeight <= 28 && c.stripe === 'none'));
  assert.equal(await page.locator('.sim-sug.is-confident').count(), 1);
  checks.push('three readable single-line suggestions, no left stripe, only qualified answer highlighted');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.sim-sug.is-confident').evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('highlight respects reduced motion');
  await page.evaluate(async () => {
    const { patchSim, getSim } = await import('/src/repositories/simulations.js');
    window.__completeSuggestions = getSim(window.__simTestId).cur.suggest;
    patchSim(window.__simTestId, x => { x.cur.suggest = x.cur.suggest.slice(0, 2); });
  });
  await page.getByRole('button', { name: /추천 답변 다시 받기/ }).waitFor();
  assert.equal(await page.locator('.sim-sug').count(), 3);
  assert.equal(await page.locator('.sim-sug-go').count(), 2);
  await page.evaluate(async () => {
    const { patchSim } = await import('/src/repositories/simulations.js');
    patchSim(window.__simTestId, x => { x.cur.suggest = window.__completeSuggestions; });
  });
  await page.waitForFunction(() => document.querySelectorAll('.sim-sug-go').length === 3);
  checks.push('incomplete saved suggestions are repaired with an explicit retry slot on model failure');
  assert.match(await page.locator('#sim-mention-hint').innerText(), /@.*제품.*솔루션.*유관사례/);
  assert.equal(await page.locator('#sim-ed').getAttribute('aria-describedby'), 'sim-mention-hint');
  await page.locator('#sim-ed').fill('@'); await page.getByRole('listbox', { name: '제품 · 솔루션 · 유관사례 · 스킬 찾기' }).waitFor();
  assert.deepEqual(await page.locator('.mmenu-tabs button').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-label'))),['제품','솔루션','유관사례','스킬']);
  assert.equal(await page.locator('.mmenu-tabs button[aria-pressed=true]').innerText(),'제품');
  for (const label of ['제품', '솔루션', '유관사례','스킬']) assert((await page.locator('.mmenu').innerText()).includes(label));
  await page.locator('#sim-ed').press('Escape'); await page.locator('#sim-ed').fill('');
  checks.push('@ menu starts with products, removes All and exposes the skills tab');
  const thumb = await page.locator('.ssc').first().evaluate(el => [el.clientWidth, el.querySelector('.ssc-th').clientWidth]);
  assert(Math.abs(thumb[0] - thumb[1]) <= 2);
  await page.locator('.ssc').first().click(); await page.locator('.modal.sbv .story').waitFor();
  assert.equal(await page.locator('.modal.sbv').getByRole('button', { name: '전체 PPT 보기', exact: true }).count(), 1);
  await page.locator('.modal.sbv').getByRole('button', { name: '닫기', exact: true }).last().click();
  checks.push('full-width thumbnail opens shared Best Scenario Storyboard');
  for (const [score, expression] of [[39, 'stern'], [40, 'flat'], [60, 'happy']]) {
    await page.evaluate(async score => { const { patchSim } = await import('/src/repositories/simulations.js'); patchSim(window.__simTestId, x => { x.cur.satisfaction = score; x.cur.mood = '불만'; }); }, score);
    await page.waitForFunction(expression => ['.sim-head .portrait', '.sim-person .portrait'].every(q => document.querySelector(q)?.dataset.expression === expression), expression);
  }
  checks.push('header and profile expression follow satisfaction at all three boundaries');
  const ranks = await page.evaluate(async () => {
    const { SCENARIOS } = await import('/src/domain/templates/scenarios.js');
    const { similarScenarios } = await import('/src/domain/simulation/score.js');
    const { getSim, patchSim } = await import('/src/repositories/simulations.js');
    const chosen = [SCENARIOS.find(s => s.req === 'compete'), SCENARIOS.find(s => s.req === 'scale')];
    return chosen.map(source => {
      patchSim(window.__simTestId, sim => { sim.msgs[0].text = [source.title, source.situation, source.thesis, ...source.signals].join(' '); });
      return similarScenarios(getSim(window.__simTestId)).map(x => ({ id: x.s.id, title: x.s.title, why: x.why }));
    });
  });
  assert.notDeepEqual(ranks[0], ranks[1]);
  await page.waitForFunction(title => document.querySelector('.ssc-t b')?.textContent === title, ranks[1][0].title);
  checks.push('reference ranking and UI refresh when same-count conversation content changes');
  await fs.mkdir(output, { recursive: true }); await page.mouse.move(2, 2);
  await page.screenshot({ path: path.join(output, 'desktop-regression.png') });
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(400);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert(await page.locator('.sim-panel').evaluate(el => el.getBoundingClientRect().left > innerWidth));
  assert(await page.locator('#sim-ed').isVisible());
  await page.screenshot({ path: path.join(output, 'mobile-regression.png') });
  await page.locator('.sim-sug-b').first().click(); assert((await page.locator('#sim-ed').innerText()).length > 10);
  checks.push('mobile layout has no overflow and selecting a suggestion fills the editor');
  await page.locator('.sim-send[aria-label="보내기"]').click(); await page.locator('.feedback-popup.error').waitFor();
  const last = await page.evaluate(async () => (await import('/src/repositories/simulations.js')).getSim(window.__simTestId).msgs.at(-1));
  assert.equal(last.who, 'me'); assert(last.segs.length > 0);
  checks.push('model error keeps the submitted message and offers retry');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'ui-report.json'), JSON.stringify({ checks, ranks, errors }, null, 2));
  checks.forEach(c => console.log('PASS', c)); console.log(`${checks.length}/${checks.length} simulation UI cases passed`);
} finally {
  await browser?.close(); await vite?.close(); server.kill('SIGTERM');
  if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
