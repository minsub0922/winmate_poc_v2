// 제품 · 솔루션 · 서비스 버블 + 공간 구성(선택 기능) — 격리 서버(조감도 히스토리는 임시 폴더) + 모델 답은 고정값.
//   버블: 숫자 없음 · 작업 중 테두리 고리 · 이름. 공간 구성: 제품 1개 이상일 때 켜짐 → 1 업종(요구사항 + DSS) → 2 후보 3개(모델이 규칙을
//   어겨도 DSS가 들어가는 공간만 · 1~6개 · 서로 다름) → 3 제품 배치(공간 × · 추가 · 색 유지 · 끌어 옮기기 · 복사) → 저장 → 조감도 여부 →
//   3D 조감도 생성 → Storyboard 조감도 레이아웃에 자동으로 들어감(이미 있던 장 · 나중에 넣은 장 · 사람이 고른 그림은 그대로).
// CHROME=<Chrome 실행 파일> node app/tests/space-plan-ui.mjs   (CHROME이 없으면 Playwright Chromium)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'winmate-space-plan-'));
const output = path.join(root, 'app/tests/output/space-plan'); fs.mkdirSync(output, { recursive: true });
const apiPort = process.env.SPACE_PLAN_API_PORT || '15464', webPort = process.env.SPACE_PLAN_WEB_PORT || '15465', base = 'http://127.0.0.1:' + webPort;
process.env.WINMATE_API_PORT = apiPort; process.env.WINMATE_WEB_PORT = webPort;
// 계정 자료(WINMATE_ACCOUNT_DATA_DB)도 반드시 임시 파일로 — 이 값을 주지 않으면 격리 서버가 실제 app/data/runtime/account_data.sqlite(관리자 계정의 제안서)에 쓴다
const api = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/spatial/server.py'], { cwd: root, env: { ...process.env, WINMATE_AUTH_DIR: path.join(temporary, 'auth'), WINMATE_ACCOUNT_DATA_DB: path.join(temporary, 'account_data.sqlite'), WINMATE_SPATIAL_DB: path.join(temporary, 'spatial.sqlite'), WINMATE_STORYBOARD_DIR: path.join(temporary, 'storyboards') } });
let apiLog = ''; api.stdout.on('data', (v) => apiLog += v); api.stderr.on('data', (v) => apiLog += v);
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), logLevel: 'error', optimizeDeps: { include: ['three', 'three/addons/controls/OrbitControls.js', 'three/addons/geometries/RoundedBoxGeometry.js', 'three/addons/exporters/GLTFExporter.js'] }, server: { host: '127.0.0.1', port: Number(webPort), strictPort: true, hmr: false, watch: null } });
let browser, page; const checks = [], errors = [], prompts = { vertical: [], candidates: [], mapping: [], other: [] };
const pass = (m) => { checks.push(m); console.log('PASS ' + m); };
const shot = (name) => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
// 모델 답 — 후보는 일부러 규칙을 어긴다: 목록에 없는 공간 · DSS가 안 들어가는 공간(fb_qsr_s6) · 8개 넘게 · 같은 조합 두 번
const answer = (prompt) => {
  if (prompt.includes('업종(버티컬)을 업종 목록에서 하나 고르세요')) { prompts.vertical.push(prompt); return { vertical: 'fb_qsr', reason: '전국 다점포 매장의 메뉴판을 디지털 메뉴보드로 바꾸려는 프랜차이즈입니다.', alternatives: ['fb_cafe', 'nope'] }; }
  if (prompt.includes('공간 구성 후보 3개를 만드세요')) {
    prompts.candidates.push(prompt);
    const ids = [...prompt.matchAll(/^(fb_[a-z]+_s\d+) \| /gm)].map((m) => m[1]);
    return { candidates: [
      { title: '핵심 주문 동선', summary: '주문 카운터에 집중한 구성', spaces: ['fb_qsr_s2', 'fb_qsr_s6', 'zzz'] },
      { title: '표준 매장', summary: '매장 전체를 담은 구성', spaces: ['fb_qsr_s6', ...ids] },
      { title: '확장 매장', summary: '같은 조합을 한 번 더', spaces: ['fb_qsr_s2', 'fb_qsr_s6'] },
    ] };
  }
  if (prompt.includes('확정한 공간마다 선택한 제품을 배치하세요')) { prompts.mapping.push(prompt);
    const custom = [...prompt.matchAll(/^(custom-space-[a-z0-9]+) \| /gm)].map((m) => m[1]);
    if (custom.length) return { spaces: custom.map((id, i) => ({ id, kind: i ? 'meeting' : 'reception', products: i ? ['kiosk'] : ['qm55c'], note: '' })), unplaced: ['oh55a', 'ac360'] };
    return { spaces: [{ id: 'fb_qsr_s2', kind: 'retail', products: ['qm55c', 'kiosk'], note: '주문 카운터 위 메뉴보드와 키오스크로 주문을 받습니다.' }], unplaced: [] }; }
  prompts.other.push(prompt.slice(0, 160) + ' … ' + prompt.slice(-200)); return null;
};
try {
  let ready = false; for (let attempt = 0; attempt < 150; attempt++) {
    if (api.exitCode != null) throw new Error(apiLog);
    try { await fetch('http://127.0.0.1:' + apiPort + '/api/health'); ready = true; break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  } assert(ready, 'isolated API ready');
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'], ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
  const context = await browser.newContext({ viewport: { width: 1560, height: 1080 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: 'spatial-isolated-test-password' } })).status(), 200);
  // 요구사항 요약 작업은 이 검사의 대상이 아니다 — 서버가 요약 기능을 알리지 않게 해서 원문으로 추론하게 한다
  const noSummary = async (route) => { const response = await route.fetch(); const json = await response.json(); const caps = json.capabilities || json; if (caps && caps.functions) delete caps.functions.requirements; return route.fulfill({ response, json }); };
  await context.route((url) => ['/api/bootstrap', '/api/poc/capabilities'].includes(url.pathname), noSummary);
  let delay = 0;
  await context.route((url) => url.pathname === '/api/llm', async (route) => {
    const body = route.request().postDataJSON(); const data = answer(String(body.prompt || ''));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    return data ? route.fulfill({ json: { mode: 'real', data } }) : route.fulfill({ status: 503, json: { detail: 'no model expected here' } });
  });
  await context.route((url) => url.pathname === '/api/jobs', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { detail: 'no job expected here' } }) : route.continue()));
  await context.addInitScript(() => { if (!localStorage.getItem('space-plan-seeded')) { localStorage.setItem('space-plan-seeded', '1'); localStorage.setItem('winmate.v2.proposals', '[]'); localStorage.setItem('winmate.v2.seedv', 'admin-samples-1'); localStorage.setItem('winmate.v2.review-example-proposals.seedv', 'skip-space-plan'); } });
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/spatial'); await page.locator('.sp-home-launches').waitFor({ timeout: 120000 });
  const routes = await page.evaluate(async () => {
    const { layoutContextKey } = await import('/src/domain/slides/context-policy.js'), { historyPath } = await import('/src/services/shared-path.js');
    const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eef3ff"/></svg>');
    const req = (text) => ({ free: [{ t: text }], form: { project: '', customer: '', target: '', keymen: [], note: '' }, files: [] });
    const p = { id: 'space-plan-ui', title: '공간 구성 검증', customer: 'A 커피', ind: 'FB', createdAt: 1, updatedAt: 2, stage: 'story', reqTab: 'free', req: req('전국 320개 매장의 메뉴판을 디지털 메뉴보드로 바꾸고 드라이브스루에는 옥외 메뉴보드를 두려 합니다.'),
      ctx: { products: ['qm55c', 'kiosk', 'oh55a', 'ac360'], solutions: ['magicinfo', 'stpro'], cases: ['1490'] },
      parts: [{ id: 'part', name: '공간 제안', type: 'scenario', items: [], done: true, layouts: [
        { uid: 'bird3d', f: 'L_SPATIAL_3D', status: 'done', ov: { t: {}, img: {} } },
        { uid: 'legend', f: 'L_VS_BIRD_S4', status: 'done', ov: { t: {}, img: {} } },
        { uid: 'picked', f: 'L_VS_BIRD_S4', status: 'done', ov: { t: {}, img: { 0: { src: photo, name: '직접 고른 사진', selectedBy: 'user' } } }, ev: { i0: { by: 'user', at: 1, src: [] } } },
        { uid: 'sheet', f: 'L_VS_SPACE', status: 'done', ov: { t: {}, img: {} } },
      ] }] };
    for (const x of p.parts[0].layouts) x.adaptation = { version: 3, phase: 'retained', origin: 'history', key: layoutContextKey(p, p.parts[0]) };
    const empty = { id: 'space-plan-empty', title: '제품 없는 제안', customer: 'B사', ind: null, createdAt: 1, updatedAt: 1, stage: 'match', reqTab: 'free', req: req('매장 디스플레이 제안을 요청합니다.'), ctx: { products: [], solutions: ['magicinfo'], cases: [] }, parts: [] };
    localStorage.setItem('winmate.v2.proposals', JSON.stringify([p, empty]));
    return { main: historyPath(p.id), empty: historyPath(empty.id) };
  });
  const proposal = (id = 'space-plan-ui') => page.evaluate(async (id) => structuredClone((await import('/src/repositories/proposals.js')).getProposal(id)), id);
  const sheet = async (uid) => (await proposal()).parts[0].layouts.find((x) => x.uid === uid);
  const pop = page.locator('#spl-pop'), node = page.locator('.match-node .node'), button = page.locator('#dss-space');

  // ---------- 제품이 없으면 꺼져 있다 · 매칭 저장은 단계를 바꾸지 않는다 ----------
  await page.goto(base + routes.empty); await page.locator('.match-node').waitFor({ timeout: 120000 });
  assert.equal(await page.locator('.match-node .order').count(), 0); assert.equal(await page.locator('.match-node .node-name').innerText(), '제품 · 솔루션 · 서비스');
  assert.match(await node.getAttribute('aria-label'), /^제품 · 솔루션 · 서비스 /);
  assert.equal(await button.isDisabled(), true); await page.locator('.dss-lock').waitFor();
  if (!await page.locator('#mt-pop').count()) await node.click();
  const match = page.getByRole('dialog', { name: '제품 · 솔루션 · 서비스', exact: true }); await match.waitFor();
  assert.match(await match.locator('.bp-f').innerText(), /누르는 즉시 왼쪽 매칭 카드에 반영돼요/); assert.doesNotMatch(await match.innerText(), /첫 번째 목차/);
  await match.getByRole('button', { name: '저장', exact: true }).click(); await match.waitFor({ state: 'hidden' });
  assert.equal((await proposal('space-plan-empty')).stage, 'match');
  await page.evaluate(async () => (await import('/src/repositories/proposals.js')).update('space-plan-empty', (d) => { d.ctx.products.push('qm55c'); }));
  await page.waitForFunction(() => !document.querySelector('#dss-space').disabled); assert.equal(await page.locator('.dss-lock').count(), 0);
  pass('the bubble has no number and the new name; 공간 구성 turns on with the first linked product; saving the matching popup only closes it');

  // ---------- 1 업종: 요구사항 + 연결된 제품 · 솔루션 · 사례 ----------
  await page.goto(base + routes.main); await page.locator('.match-node').waitFor({ timeout: 120000 });
  assert.equal(await page.locator('.match-node .node.is-busy').count(), 0);
  delay = 1200; await button.click(); await pop.waitFor();
  await page.locator('.match-node .node.is-busy').waitFor(); assert.equal(await node.getAttribute('aria-busy'), 'true');
  await pop.locator('.spl-guess').waitFor(); delay = 0;
  await page.locator('.match-node .node.is-busy').waitFor({ state: 'detached' });
  assert.match(await pop.locator('.spl-vname').innerText(), /외식 프랜차이즈/);
  const vp = prompts.vertical[0];
  for (const text of ['스마트 사이니지 QM55C', '삼성 키오스크 KM24C', '360 카세트', 'MagicINFO', 'SmartThings Pro', '--- 연결된 제품 ---', '--- 유관 사례 ---', '디지털 메뉴보드로 바꾸고']) assert.ok(vp.includes(text), 'industry prompt carries ' + text);
  await shot('1-industry');
  pass('step 1 infers the industry from the requirements and the linked products, solutions and cases; the bubble shows the progress ring meanwhile');

  // ---------- 2 후보: 모델이 어겨도 규칙대로 ----------
  await pop.getByRole('button', { name: '네, 맞아요' }).click(); await pop.locator('.spl-cand').nth(2).waitFor();
  const fit = await page.evaluate(async () => { const SP = await import('/src/services/space-plan.js'), { getProposal } = await import('/src/repositories/proposals.js'); const idx = await SP.loadSpaceData(); return SP.fitPool(getProposal('space-plan-ui'), idx, 'fb_qsr').map((s) => s.name); });
  assert.ok(fit.length >= 6 && !fit.includes('본사 교육장·R&D 테스트키친'));
  const cands = await pop.locator('.spl-cand').evaluateAll((list) => list.map((c) => [...c.querySelectorAll('.spl-chip')].map((x) => x.textContent.trim())));
  assert.equal(cands.length, 3);
  for (const chips of cands) { assert.ok(chips.length >= 1 && chips.length <= 6, 'candidate has 1–6 spaces: ' + chips.length); for (const name of chips) assert.ok(fit.includes(name), name + ' holds a linked item'); }
  assert.equal(new Set(cands.map((c) => [...c].sort().join('|'))).size, 3, 'three different sets');
  assert.deepEqual(cands[0], ['주문 카운터·디지털 메뉴보드']); assert.equal(cands[1].length, 6);
  for (const row of fit) assert.ok(prompts.candidates[0].includes('| ' + row + ' |'), 'the model sees ' + row);
  assert.ok(!prompts.candidates[0].includes('| 본사 교육장·R&D 테스트키친 |'), 'spaces that hold nothing linked are not offered');
  await shot('2-candidates');
  pass('step 2 shows exactly 3 different candidates of 1–6 spaces, all of which hold a linked product or solution, even when the model breaks the rules');

  // ---------- 직접 구성: Enter 버블 · 한글 조합 · 초안 · 제품 배치 · 저장 ----------
  const customInput = pop.getByRole('combobox', { name: '직접 구성할 공간 이름' });
  const bubbles = pop.getByRole('list', { name: '직접 구성한 공간' }).getByRole('listitem');
  const customNext = pop.getByRole('button', { name: '이 구성으로 제품 배치' });
  assert(await customNext.isDisabled());
  assert.equal(await pop.getByText('공간 이름을 하나씩 적고 Enter를 누르면 버블로 추가돼요.', { exact: true }).count(), 0);
  assert.equal(await pop.getByText('연결한 제품 · 솔루션이 하나 이상 들어가는 공간만 담았어요. 고른 뒤에도 공간을 빼거나 더할 수 있어요.', { exact: true }).count(), 0);
  const autocomplete = pop.getByRole('listbox', { name: '공간 자동완성' });
  assert.equal(await autocomplete.count(), 0);
  await customInput.fill('카운터'); await autocomplete.waitFor();
  const inputBox = await customInput.boundingBox(), suggestionsBox = await autocomplete.boundingBox();
  assert(suggestionsBox.y + suggestionsBox.height <= inputBox.y, 'suggestions appear above the input');
  const optionsText = await autocomplete.getByRole('option').allTextContents();
  assert(optionsText.every((name) => name.includes('카운터'))); assert.equal(new Set(optionsText).size, optionsText.length);
  await shot('2-autocomplete');
  const choice = '주문 카운터·디지털 메뉴보드';
  await autocomplete.getByRole('option', { name: choice, exact: true }).click();
  assert.equal(await customInput.inputValue(), ''); assert.equal(await bubbles.count(), 1);
  await customInput.fill('카운터');
  assert.equal(await autocomplete.getByRole('option', { name: choice, exact: true }).count(), 0, 'chosen keywords are excluded');
  await pop.getByRole('button', { name: choice + ' 버블 삭제', exact: true }).click();
  await customInput.fill('객석'); await autocomplete.waitFor();
  const keyboardChoice = await autocomplete.getByRole('option').first().innerText();
  await customInput.press('ArrowDown'); await customInput.press('Enter');
  assert.equal(await bubbles.count(), 1);
  await pop.getByRole('button', { name: keyboardChoice + ' 버블 삭제', exact: true }).click();
  await customInput.fill('카운터'); await autocomplete.waitFor(); await customInput.press('Escape');
  assert.equal(await autocomplete.count(), 0); assert(await pop.isVisible());
  await customInput.fill('목록에없는나만의공간'); assert.equal(await autocomplete.count(), 0);
  await customInput.fill('');
  pass('typing immediately shows matching unique space keywords above the input; click or arrows/Enter adds a bubble, Escape dismisses, and the two help texts are removed');

  await customInput.fill('   '); await customInput.press('Enter'); assert.equal(await bubbles.count(), 0);
  await customInput.fill('고객 체험존');
  await customInput.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  assert.equal(await bubbles.count(), 0, 'IME confirmation is not an add action');
  await customInput.press('Enter'); assert.equal(await bubbles.count(), 1); assert.equal(await customInput.inputValue(), '');
  await customInput.fill('고객체험존'); await customInput.press('Enter');
  assert.equal(await bubbles.count(), 1); await pop.getByText('이미 추가한 공간이에요.', { exact: true }).waitFor();
  for (const name of ['상담실', '로비', '교육실', '회의실', '창고']) { await customInput.fill(name); await customInput.press('Enter'); }
  assert.equal(await bubbles.count(), 6); assert(await customInput.isDisabled());
  for (const name of ['로비', '교육실', '회의실', '창고']) await pop.getByRole('button', { name: name + ' 버블 삭제', exact: true }).click();
  assert.equal(await bubbles.count(), 2); assert(await customInput.isEnabled());
  await customInput.fill('작성 중인 공간');
  await pop.getByRole('button', { name: '공간 구성 닫기', exact: true }).click(); await button.click();
  assert.equal(await bubbles.count(), 2); assert.equal(await customInput.inputValue(), '작성 중인 공간');
  await customInput.fill('');
  await shot('2-custom-candidates');
  // 추천 후보 추론을 기다리지 않고도 직접 구성으로 이동한다.
  delay = 1200; await pop.getByRole('button', { name: '후보 다시 추론' }).click();
  await pop.locator('.spl-loading').waitFor(); assert(await customNext.isEnabled());
  await customNext.click(); delay = 0; await pop.locator('.spl-board').waitFor();
  const customNames = () => pop.locator('.spl-space[data-space]:not(.rest) .spl-space-h b').allTextContents();
  assert.deepEqual(await customNames(), ['고객 체험존', '상담실']);
  assert(prompts.mapping.at(-1).includes('고객 체험존') && prompts.mapping.at(-1).includes('상담실'));
  assert(prompts.mapping.at(-1).includes('직접 입력 · 이름과 요구사항으로 판단'));
  // 제품 배치 단계에서도 공간을 직접 추가하고 제품을 옮길 수 있다.
  await pop.locator('.spl-add-btn').click();
  const addInput = pop.getByRole('textbox', { name: '추가할 공간 이름', exact: true });
  assert(await addInput.evaluate((el) => el === document.activeElement));
  await addInput.fill('   '); await addInput.press('Enter'); assert.equal((await customNames()).length, 2);
  await addInput.fill('고객체험존'); await addInput.press('Enter');
  assert.equal((await customNames()).length, 2); await pop.locator('#spl-add-error').getByText('이미 추가한 공간이에요.', { exact: true }).waitFor();
  await addInput.fill('제품 상담부스');
  await addInput.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  assert.equal((await customNames()).length, 2);
  await addInput.press('Enter'); assert.equal(await addInput.inputValue(), '');
  assert.deepEqual(await customNames(), ['고객 체험존', '상담실', '제품 상담부스']);
  const addedSpace = pop.locator('.spl-space[data-space]').filter({ has: page.locator('.spl-space-h b', { hasText: '제품 상담부스' }) });
  assert.equal(await addedSpace.locator('.spl-card').count(), 0);
  await pop.locator('.spl-space.rest .spl-card[data-ref="product:oh55a"]').dragTo(addedSpace);
  assert.equal(await addedSpace.locator('.spl-card[data-ref="product:oh55a"]').count(), 1);
  await addInput.fill('임시 공간'); await pop.getByRole('button', { name: '입력한 공간 추가', exact: true }).click();
  assert.equal((await customNames()).length, 4);
  await pop.getByRole('button', { name: '임시 공간 공간 빼기', exact: true }).click();
  await shot('3-custom-added-space');
  pass('product placement adds typed spaces by Enter or button, prevents blank and duplicate names and IME adds, and accepts dragged products');
  await pop.locator('.bp-f').getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '저장만 하기' }).click(); await pop.waitFor({ state: 'hidden' });
  assert.equal((await proposal()).spacePlan.title, '직접 구성');
  assert((await proposal()).spacePlan.spaces.find((s) => s.name === '제품 상담부스').products.includes('oh55a'));
  assert.deepEqual((await proposal()).spacePlan.spaces.map((s) => s.name), ['고객 체험존', '상담실', '제품 상담부스']);
  await button.click(); await pop.locator('.spl-board').waitFor();
  await pop.getByRole('button', { name: '다시 배치', exact: true }).click();
  await pop.locator('.spl-board').waitFor(); assert.deepEqual(await customNames(), ['고객 체험존', '상담실', '제품 상담부스']);
  await pop.getByRole('button', { name: '공간 후보로 돌아가기' }).click();
  assert.equal(await bubbles.count(), 3);
  await pop.locator('.spl-cand').nth(2).waitFor();
  pass('direct composition adds Enter bubbles with IME and duplicate protection, supports removal and drafts, works during inference, and survives mapping, saving and reopening');

  // ---------- 3 배치: 자동 배치 · × · 추가 · 색 · 끌어 옮기기 ----------
  await pop.locator('.spl-cand').first().click(); await pop.locator('.spl-board').waitFor();
  const board = () => pop.locator('.spl-board').evaluate((b) => [...b.querySelectorAll('.spl-space[data-space]')].map((s) => ({ id: s.dataset.space, name: s.querySelector('.spl-space-h b').textContent, color: (/spl-c(\d)/.exec(s.className) || [])[1] ?? null, border: getComputedStyle(s).borderTopColor, products: [...s.querySelectorAll('.spl-card')].map((c) => c.dataset.ref.split(':')[1]) })));
  let b = await board();
  assert.deepEqual(b.map((s) => [s.id, s.products]), [['fb_qsr_s2', ['qm55c', 'kiosk']], ['', ['oh55a', 'ac360']]]);
  assert.equal(await pop.locator('.spl-space-x').first().isDisabled(), true, 'the only space cannot be removed');
  const add = async (name) => { await pop.locator('.spl-add-btn').click(); await pop.locator('.spl-add-opt').filter({ hasText: name }).first().click(); };
  await pop.locator('.spl-add-btn').click();
  const options = await pop.locator('.spl-add-opt').evaluateAll((list) => list.map((o) => [o.querySelector('b').textContent, o.classList.contains('fit'), o.querySelector('span').textContent]));
  assert.ok(options.length > 6); assert.ok(options[0][1] && /들어가요/.test(options[0][2])); assert.ok(options.some((o) => o[0] === '본사 교육장·R&D 테스트키친' && !o[1] && /맞는 제품군이 없어요/.test(o[2])));
  assert.ok(options.findIndex((o) => !o[1]) > options.findLastIndex((o) => o[1]), 'spaces that fit come first');
  await shot('3-add-space');
  await pop.locator('.spl-add-opt').filter({ hasText: '매장 입구·쇼윈도' }).first().click();
  await add('객석(식음 공간)');
  b = await board();
  assert.deepEqual(b.map((s) => [s.name, s.color, s.products]), [['주문 카운터·디지털 메뉴보드', '0', ['qm55c', 'kiosk']], ['매장 입구·쇼윈도', '1', ['oh55a']], ['객석(식음 공간)', '2', ['ac360']], ['미배치', null, []]]);
  assert.equal(new Set(b.slice(0, 3).map((s) => s.border)).size, 3, 'each space has its own border colour');
  const kept = Object.fromEntries(b.map((s) => [s.name, s.border]));
  await pop.getByRole('button', { name: '매장 입구·쇼윈도 공간 빼기' }).click();
  b = await board();
  assert.deepEqual(b.map((s) => [s.name, s.color, s.products]), [['주문 카운터·디지털 메뉴보드', '0', ['qm55c', 'kiosk']], ['객석(식음 공간)', '2', ['ac360']], ['미배치', null, ['oh55a']]]);
  for (const s of b) assert.equal(s.border, kept[s.name], s.name + ' keeps its colour');
  await add('주방(BOH)');
  b = await board(); assert.deepEqual(b.map((s) => [s.name, s.color]), [['주문 카운터·디지털 메뉴보드', '0'], ['객석(식음 공간)', '2'], ['주방(BOH)', '1'], ['미배치', null]]);
  // 끌어 옮기기: 미배치의 옥외 사이니지 → 주방, 그리고 카운터에 복사한 뒤 원본을 미배치로
  await pop.locator('.spl-space.rest .spl-card[data-ref="product:oh55a"]').dragTo(pop.locator('.spl-space[data-space="fb_qsr_s4"]'));
  b = await board(); assert.ok(b.find((s) => s.id === 'fb_qsr_s4').products.includes('oh55a')); assert.deepEqual(b.at(-1).products, []);
  const card = pop.locator('.spl-space[data-space="fb_qsr_s4"] .spl-card[data-ref="product:oh55a"]'); await card.focus(); await card.press('Enter');
  assert.equal(await pop.getByRole('menuitem', { name: /미배치로 빼기|옮기기/ }).count(), 0);
  await pop.getByRole('menuitem', { name: '주문 카운터·디지털 메뉴보드에 복사하기' }).click();
  b = await board(); assert.ok(b[0].products.includes('oh55a')); assert.ok(b.find((s) => s.id === 'fb_qsr_s4').products.includes('oh55a'), 'copy retains the source');
  await card.locator('.spl-mv').click();
  assert.equal(await pop.getByRole('menuitem', { name: '주문 카운터·디지털 메뉴보드에 복사하기 (이미 배치됨)', exact: true }).isDisabled(), true);
  await pop.locator('.spl-menu').press('Escape');
  await card.dragTo(pop.locator('.spl-space.rest'));
  b = await board(); assert.ok(b[0].products.includes('oh55a')); assert.ok(!b.find((s) => s.id === 'fb_qsr_s4').products.includes('oh55a'));
  // 같은 제품이 다른 공간에 남아 있으면 미배치에는 나타나지 않는다.
  assert.deepEqual(b.at(-1).products, []);
  b = await board(); assert.deepEqual(b[0].products, ['qm55c', 'kiosk', 'oh55a']); assert.ok(!b.find((s) => s.id === 'fb_qsr_s4').products.includes('oh55a'));
  for (const name of ['매장 입구·쇼윈도', '점주 사무·관리 공간']) await add(name);
  await pop.locator('.spl-add-btn').click(); await pop.locator('.spl-add-opt').first().click();
  b = await board(); assert.equal(b.length - 1, 6); assert.equal(new Set(b.slice(0, 6).map((s) => s.border)).size, 6);
  await pop.locator('.spl-add-full').waitFor(); assert.equal(await pop.locator('.spl-add-btn').count(), 0);
  await shot('3-six-spaces');
  await pop.locator('.spl-space-x').nth(5).click(); await pop.locator('.spl-add-btn').waitFor();
  pass('step 3 places products automatically; spaces are removed with × (products go to 미배치) and added from the industry (1–6), colours stay put; products move by drag; the menu only copies, retains the source and prevents duplicates');

  // ---------- 저장 → 조감도 여부 ----------
  const footSave = pop.locator('.bp-f').getByRole('button', { name: '저장', exact: true }); await footSave.click();
  const ask = page.getByRole('alertdialog'); await ask.waitFor();
  assert.match(await ask.innerText(), /3D 조감도를 만들까요\?/); await shot('4-ask');
  let saved = (await proposal()).spacePlan;
  assert.equal(saved.vertical.id, 'fb_qsr'); assert.equal(saved.spaces.length, 5); assert.deepEqual(Object.keys(saved.spaces[0]).sort(), ['color', 'id', 'kind', 'name', 'note', 'products']);
  assert.equal(new Set(saved.spaces.map((s) => s.color)).size, 5); assert.equal(saved.birdseye, undefined);
  await ask.getByRole('button', { name: '저장만 하기' }).click(); await pop.waitFor({ state: 'hidden' });
  assert.equal((await proposal()).spacePlan.birdseye, undefined, 'declining only saves');
  const groups = await page.locator('.match-card .dss-grp').evaluateAll((list) => list.map((g) => [g.dataset.space, getComputedStyle(g).borderTopColor]));
  assert.deepEqual(groups.map((g) => g[0]), saved.spaces.map((s) => s.id)); assert.equal(new Set(groups.map((g) => g[1])).size, 5);
  assert.match(await button.innerText(), /공간 5/);
  await shot('5-card-grouped');
  pass('저장 stores the plan and asks about the 조감도; declining just saves and the card groups products per space in the same colours');


  // ---------- 승인 → 3D 조감도 → 조감도 레이아웃에 자동으로 ----------
  await button.click(); await pop.locator('.spl-board').waitFor();
  assert.deepEqual((await board()).slice(0, 5).map((s) => [s.id, Number(s.color)]), saved.spaces.map((s) => [s.id, s.color]), 'a saved plan reopens at step 3 with its colours');
  await footSave.click(); await ask.waitFor(); await ask.getByRole('button', { name: '조감도 만들기' }).click(); await pop.waitFor({ state: 'hidden' });
  await page.locator('#dss-space.busy').waitFor(); await page.locator('.match-node .node.is-busy').waitFor();
  await page.locator('.dss-be').waitFor({ timeout: 240000 });
  const be = (await proposal()).spacePlan.birdseye;
  assert.equal(be.status, 'done'); assert.ok(be.historyId); assert.match(be.image, /^data:image\/jpeg/); assert.equal(be.rooms, 5);
  await page.waitForFunction(async () => { const p = (await import('/src/repositories/proposals.js')).getProposal('space-plan-ui'); return !!p.parts[0].layouts.find((x) => x.uid === 'bird3d').ov.spatial && !!p.parts[0].layouts.find((x) => x.uid === 'legend').ov.img[0]; }, null, { timeout: 120000 });
  await page.locator('.match-node .node.is-busy').waitFor({ state: 'detached', timeout: 120000 });
  const bird = await sheet('bird3d'), legend = await sheet('legend'), picked = await sheet('picked');
  assert.equal(bird.ov.spatial.view, '3d'); assert.match(bird.ov.spatial.image, /^data:image\/jpeg/); assert.equal(bird.ov.spatial.scene.rooms.length, 5); assert.equal(bird.birdseye, be.historyId); assert.equal(bird.adaptation.origin, 'spatial');
  assert.deepEqual(bird.ov.spatial.scene.rooms.map((r) => r.name), saved.spaces.map((s) => s.name));
  assert.match(legend.ov.img[0].src, /^(u:|data:image\/jpeg)/); // 올린 그림(u:) — 히스토리 동기화가 문서에 담으면 data URL assert.equal(legend.ov.img[0].birdseye, be.historyId); assert.equal(legend.ev.i0.by, 'rule');
  assert.equal(picked.ov.img[0].selectedBy, 'user'); assert.equal(picked.ov.img[0].name, '직접 고른 사진'); assert.equal(picked.ev.i0.by, 'user');
  assert.deepEqual((await sheet('sheet')).ov.img, {});
  pass('approving starts the 3D 조감도 at once; when it finishes the 조감도 layouts already on the Storyboard get it — a picture the person chose is left alone');

  // 나중에 넣은 조감도 레이아웃(레이아웃 고르기 · 자동 구성)도 받는다 — 그림 칸(L_VS_BIRD_*)은 위 'legend'가, 글 채우기(모델)는 다른 검사가 본다
  await page.evaluate(async () => (await import('/src/repositories/proposals.js')).update('space-plan-ui', (d) => { d.parts[0].layouts.push({ uid: 'later2d', f: 'L_SPATIAL_2D', status: 'empty', ov: { t: {}, img: {} } }, { uid: 'later3d', f: 'L_SPATIAL_3D', status: 'empty', ov: { t: {}, img: {} } }); }));
  await page.waitForFunction(async () => { const p = (await import('/src/repositories/proposals.js')).getProposal('space-plan-ui'); const f = (uid) => p.parts[0].layouts.find((x) => x.uid === uid); return !!f('later2d').ov.spatial && !!f('later3d').ov.spatial; }, null, { timeout: 120000 });
  const later = await sheet('later3d');
  assert.equal((await sheet('later2d')).ov.spatial.view, '2d'); assert.equal(later.ov.spatial.view, '3d'); assert.equal(later.birdseye, be.historyId); assert.equal(later.status, 'done'); assert.equal(later.adaptation.origin, 'spatial');
  assert.equal(await page.evaluate(async () => (await import('/src/services/space-plan.js')).mapBirdseyeLayouts('space-plan-ui')), 0, 'nothing left to fill');
  assert.equal(await page.evaluate(async () => (await import('/src/services/space-plan.js')).mapBirdseyeLayouts('no-such-proposal')), 0);
  await page.locator('[data-layout-uid="bird3d"]').click(); const detail = page.locator('.modal.sheet').filter({ has: page.locator('.detail') });
  await detail.locator('[data-spatial-slot] img').waitFor(); await detail.locator('[data-spatial-slot] img').evaluate((image) => image.decode()); await shot('6-birdseye-layout');
  await detail.locator('.mfoot').getByRole('button', { name: '닫기', exact: true }).click();
  pass('a 조감도 layout added later is filled automatically, and mapBirdseyeLayouts is idempotent');

  assert.deepEqual(errors, []); assert.deepEqual(prompts.other, [], 'no other model call');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: true, checks, errors }, null, 2));
  console.log('space plan ui ok ·', checks.length, 'checks');
} catch (error) { await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: false, checks, errors, prompts: prompts.other, error: String(error.stack || error) }, null, 2)); throw error; }
finally { await browser?.close(); await server.close(); api.kill('SIGTERM'); await new Promise((resolve) => (api.exitCode != null ? resolve() : api.once('close', resolve))); fs.rmSync(temporary, { recursive: true, force: true }); }
