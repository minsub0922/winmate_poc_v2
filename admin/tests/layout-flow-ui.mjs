// 레이아웃 관리 상세 — 머리(이름 옆 코드 · 닫기 옆 활용 예시 · 그 오른쪽 입력 드롭다운) · 시트 영역(마우스를 따라 테두리 + AI 작성/AI 잠금 버튼 · 영역 보기)
// · 입력 JSON(기본 접힘 → 드롭다운에서 고쳐서 적용) · 흐름(오른쪽 칸 전체 · 스크롤 없음 · 첫 단계 input(팝업에 같은 JSON) · 단계 왼쪽 팝업에 in/out
// · 로직 DB · 도구 tool calling · LLM | Decision 탭 · 모델 입력: 프롬프트 · 스키마 · question_type) · 홈의 도구 관리.
// Run only against an isolated server (temporary WINMATE_LAYOUT_LIBRARY / WINMATE_LAYOUT_FLOWS / WINMATE_ADMIN_DATA / WINMATE_AUTH_DIR):
// WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8813 node admin/tests/layout-flow-ui.mjs
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8813';
const F = process.env.LAYOUT || 'L_TOC_PILOT';
const out = path.resolve('admin/runtime/evidence/layout-flow'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const errors = [];
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!' } });
  assert.equal(login.status(), 200, await login.text());
  const flowOf = async () => (await (await context.request.get(`${base}/admin/api/layout-library/${F}/flow`)).json());
  assert.equal((await flowOf()).edited, false, 'start from an unedited flow (fresh WINMATE_LAYOUT_FLOWS)');
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/admin/layout-library');
  await page.getByRole('heading', { name: '레이아웃 관리', exact: true }).waitFor();
  await page.getByLabel('레이아웃 검색', { exact: true }).fill(F);
  await page.locator(`.ll-card[data-layout="${F}"] .ll-card-open`).click();
  const detail = page.locator('section.modal').filter({ has: page.locator('.ll-detail') });
  await detail.locator('.lf-node').first().waitFor();

  // 머리: 코드는 이름 오른쪽, 활용 예시 → 입력 → 닫기 순서의 드롭다운 버튼
  assert.equal(await detail.locator('.modal-header .ll-title code').innerText(), F);
  assert.equal(await detail.locator('.modal-header p').count(), 0);
  const ex = detail.locator('.modal-actions .ll-ex-button'), inBtn = detail.locator('.modal-actions .lf-in-button', { hasText: /^입력/ });
  const exBox = await ex.boundingBox(), inBox = await inBtn.boundingBox(), closeBox = await detail.locator('.modal-actions .icon-button').boundingBox();
  assert.ok(exBox.x + exBox.width <= inBox.x && inBox.x + inBox.width <= closeBox.x, 'examples · inputs · close in one row');
  assert.ok([exBox, inBox].every(b => Math.abs(b.y + b.height / 2 - (closeBox.y + closeBox.height / 2)) < 6), 'header buttons share one line');
  // 메타데이터 — 머리의 버튼(입력 오른쪽)을 누르면 팝업: AI 채움 칸 · 사진의 묶음(key 칸 · 같은 항목의 칸 · 사진) · 장 전체
  const metaBtn = detail.locator('.modal-actions .lm-button');
  assert.ok((await metaBtn.boundingBox()).x > inBox.x, 'the metadata button follows the inputs');
  await metaBtn.click();
  const metaPop = page.locator('.lm-pop');
  await metaPop.locator('.lm-group').first().waitFor();
  const api = await (await context.request.get(`${base}/admin/api/layout-library/${F}/meta`)).json();
  assert.equal(await metaPop.locator('.lm-group:not(.frame)').count(), api.groups.length);
  assert.ok(!/QM\d{2}|KM\d{2}|MagicINFO|SmartThings|VXT/.test(JSON.stringify(api)), 'no product code · solution name in the metadata');
  await shot(page, '0-meta');
  await page.keyboard.press('Escape');
  await metaPop.waitFor({ state: 'detached' });
  assert.equal(await detail.count(), 1, 'Escape closes only the metadata popup');
  // 입력은 기본 접힘 — 패널에 입력 칸이 없고 흐름이 오른쪽 칸 전체
  assert.equal(await page.locator('.lf-in-pop').count(), 0);
  assert.equal(await detail.locator('.lf-panel textarea, .lf-panel pre').count(), 0);
  const panelBox = await detail.locator('.lf-panel').boundingBox(), flowBox = await detail.locator('.lf-flow').boundingBox(), canvasBox0 = await detail.locator('.lf-canvas').boundingBox();
  assert.ok(Math.abs(flowBox.y - panelBox.y) < 2 && Math.abs(flowBox.height - panelBox.height) < 2, 'flow fills the right column');
  assert.ok(Math.abs(canvasBox0.height - flowBox.height) < 2 && Math.abs(canvasBox0.width - flowBox.width) < 2, 'canvas fills the flow box');
  await ex.click();
  const exPop = page.locator('.ll-ex-pop');
  await exPop.waitFor();
  await exPop.locator('iframe, .empty').first().waitFor();
  assert.ok((await exPop.boundingBox()).y >= exBox.y + exBox.height);
  await shot(page, '0-examples');
  await page.keyboard.press('Escape');
  await exPop.waitFor({ state: 'detached' });
  assert.equal(await detail.count(), 1, 'Escape closes only the dropdown');

  // 시트: 영역 보기는 시트 오른쪽 위, 기본은 아무 표시 없음
  const canvas = detail.locator('.ll-canvas'), tools = canvas.locator('.ll-sheet-tools');
  const cb = await canvas.boundingBox(), tb = await tools.boundingBox(), sb = await canvas.locator('.lr-sheet').boundingBox();
  assert.ok(cb.x + cb.width - (tb.x + tb.width) < 24 && tb.y + tb.height <= sb.y + 2, 'region controls at the sheet top-right');
  const frame = canvas.locator('iframe');
  await page.waitForFunction(() => document.querySelector('.ll-canvas iframe')?.contentDocument?.querySelector('[data-admin-slot]'));
  await page.mouse.move(2, 2); await page.waitForTimeout(120);
  const inFrame = (fn, arg) => frame.evaluate(fn, arg);
  assert.equal(await inFrame(el => [...el.contentDocument.querySelectorAll('[data-admin-slot]')].filter(n => getComputedStyle(n).outlineColor !== 'rgba(0, 0, 0, 0)').length), 0);
  const target = await inFrame(el => {
    const doc = el.contentDocument, fb = el.getBoundingClientRect(), scale = fb.width / 1280;
    const node = [...doc.querySelectorAll('[data-admin-slot^="t:"]')].find(n => n.dataset.adminFixed === 'false' && n.getBoundingClientRect().width > 80 && n.getBoundingClientRect().top > 60);
    const b = node.getBoundingClientRect();
    return { key: node.dataset.adminSlot, x: fb.left + (b.left + b.width / 2) * scale, y: fb.top + (b.top + b.height / 2) * scale };
  });
  // Safari 는 스크립트를 막은 sandbox iframe 안의 리스너를 부르지 않는다 — 시트 문서에는 리스너가 하나도 없어야 한다
  const cdp = await context.newCDPSession(page);
  const { result: docRef } = await cdp.send('Runtime.evaluate', { expression: "document.querySelector('.ll-canvas iframe').contentDocument" });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: docRef.objectId, depth: -1, pierce: true });
  assert.deepEqual(listeners.map(l => l.type), [], 'no listeners inside the sandboxed sheet');
  // 마우스를 올리면 바로(클릭 없이): 그 영역 테두리 + 영역 안 오른쪽 위 작은 자물쇠(풀림)
  const lockBtn = canvas.locator('.lr-lockbtn'), tip = canvas.locator('.lr-tip');
  assert.equal(await lockBtn.count(), 0);
  await page.mouse.move(target.x, target.y);
  await page.waitForFunction(k => document.querySelector('.ll-canvas iframe').contentDocument.querySelector(`[data-admin-slot="${k}"]`).dataset.adminHover === 'true', target.key);
  assert.equal(await inFrame(el => getComputedStyle(el.contentDocument.querySelector('[data-admin-hover=true]')).outlineWidth), '3px');
  await lockBtn.waitFor();
  assert.equal(await lockBtn.getAttribute('data-slot'), target.key);
  assert.equal(await lockBtn.getAttribute('aria-pressed'), 'false');
  assert.equal(await lockBtn.getAttribute('aria-label'), 'AI 자동 채움 잠그기');
  assert.equal(await lockBtn.innerText(), '', 'icon only');
  // 자리: 영역 안 오른쪽 위, 여백 조금
  const region = await inFrame((el, k) => { const fb = el.getBoundingClientRect(), s = fb.width / 1280, b = el.contentDocument.querySelector(`[data-admin-slot="${k}"]`).getBoundingClientRect(); return { x: fb.left + b.left * s, y: fb.top + b.top * s, w: b.width * s, h: b.height * s }; }, target.key);
  let lb = await lockBtn.boundingBox();
  assert.ok(lb.width <= 22 && lb.height <= 22, 'small button');
  if (region.h >= 26) assert.ok(Math.abs(region.x + region.w - (lb.x + lb.width)) <= 5 && Math.abs(lb.y - region.y) <= 5, `top-right inside ${JSON.stringify(region)} ${JSON.stringify(lb)}`);
  else assert.ok(lb.x >= region.x + region.w - 1 && lb.x - (region.x + region.w) <= 5, 'just outside the top-right of a small region');
  await shot(page, '1-hover');
  // 마우스를 옮기면 영역도 따라 바뀐다
  const other = await inFrame((el, key) => {
    const doc = el.contentDocument, fb = el.getBoundingClientRect(), scale = fb.width / 1280, tb = doc.querySelector(`[data-admin-slot="${key}"]`).getBoundingClientRect();
    const node = [...doc.querySelectorAll('[data-admin-slot]')].find(n => { const b = n.getBoundingClientRect(); return n.dataset.adminSlot !== key && b.width > 60 && b.height > 30 && (b.bottom < tb.top || b.top > tb.bottom) && !n.contains(doc.querySelector(`[data-admin-slot="${key}"]`)); });
    const b = node.getBoundingClientRect();
    return { key: node.dataset.adminSlot, x: fb.left + (b.left + b.width / 2) * scale, y: fb.top + (b.top + b.height / 2) * scale };
  }, target.key);
  await page.mouse.move(other.x, other.y, { steps: 4 });
  await page.waitForFunction(k => document.querySelector('.lr-lockbtn')?.dataset.slot === k, other.key);
  assert.equal(await inFrame(el => el.contentDocument.querySelectorAll('[data-admin-hover=true]').length), 1);
  // 마우스가 시트 밖이면 표시 없음
  await page.mouse.move(2, 2); await lockBtn.waitFor({ state: 'detached' });
  // 영역에서 자물쇠로 옮겨 가도 영역이 그대로 · 마우스를 대면 힌트 · 누르면 잠김(영역 보기 꺼진 채로)
  await page.mouse.move(target.x, target.y);
  await page.waitForFunction(k => document.querySelector('.lr-lockbtn')?.dataset.slot === k, target.key);
  lb = await lockBtn.boundingBox();
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2, { steps: 6 });
  await tip.waitFor();
  assert.equal(await tip.innerText(), 'AI 자동 채움 잠그기');
  await page.waitForTimeout(250);
  assert.equal(await lockBtn.getAttribute('data-slot'), target.key, 'the lock keeps its region while the pointer is on it');
  const count0 = await canvas.locator('.ll-region-count').innerText();
  await shot(page, '1b-hint');
  await lockBtn.click();
  assert.equal(await lockBtn.getAttribute('aria-pressed'), 'true');
  assert.equal(await tip.innerText(), 'AI 자동 채움 잠금 풀기');
  assert.notEqual(await canvas.locator('.ll-region-count').innerText(), count0);
  assert.equal(await inFrame((el, k) => getComputedStyle(el.contentDocument.querySelector(`[data-admin-slot="${k}"]`)).outlineColor, target.key), 'rgb(217, 119, 6)');
  await shot(page, '2-locked');
  // 다시 누르면 풀림 → 한 번 더 잠가 둔다(아래 저장 확인용)
  await lockBtn.click(); assert.equal(await lockBtn.getAttribute('aria-pressed'), 'false');
  await lockBtn.click(); assert.equal(await lockBtn.getAttribute('aria-pressed'), 'true');
  // 글은 클릭해서 바로 고친다 — 마우스가 시트 밖이어도 고치는 영역에 자물쇠가 남는다
  await page.mouse.click(target.x, target.y);
  await page.keyboard.press('End'); await page.keyboard.type(' 수정');
  assert.ok((await inFrame((el, k) => el.contentDocument.querySelector(`[data-admin-slot="${k}"]`).innerText, target.key)).endsWith('수정'));
  await page.mouse.move(2, 2); await page.waitForTimeout(250);
  assert.equal(await lockBtn.getAttribute('data-slot'), target.key);
  await tools.getByRole('switch', { name: '영역 보기' }).click();
  assert.ok(await inFrame(el => [...el.contentDocument.querySelectorAll('[data-admin-slot]')].filter(n => getComputedStyle(n).outlineStyle === 'dashed').length) > 5);
  assert.ok(await canvas.locator('.lr-lock').count() >= 1, '영역 보기: 다른 잠금 영역마다 자물쇠 표식');
  await shot(page, '3-regions');
  await tools.getByRole('switch', { name: '영역 보기' }).click();

  // 입력: 머리의 '입력 n' → 드롭다운 팝업에서 JSON 을 고치고 적용
  const n0 = (await flowOf()).flow.inputs.length;
  assert.equal((await inBtn.innerText()).trim(), `입력 ${n0}`);
  await inBtn.click();
  const json = page.locator('.lf-in-pop');
  await json.waitFor();
  const jb = await json.boundingBox();
  assert.ok(jb.y >= inBox.y + inBox.height && jb.x + jb.width <= closeBox.x + closeBox.width + 14, 'inputs drop down under their button');
  const area = json.getByLabel('입력 JSON');
  const obj = JSON.parse(await area.inputValue());
  assert.equal(Object.keys(obj).length, n0);
  assert.equal((await json.locator('.lf-code pre').innerText()).trim(), (await area.inputValue()).trim(), 'highlighted copy follows the text');
  await shot(page, '3a-inputs');
  await area.fill(JSON.stringify({ ...obj, kpis: { ...obj.kpis, required: 'yes' } }, null, 2));
  await json.getByRole('button', { name: '적용', exact: true }).click();
  assert.match(await json.locator('.lf-json-error').innerText(), /required/);
  // 닫아도 적용 전 글은 남는다
  await page.keyboard.press('Escape');
  await json.waitFor({ state: 'detached' });
  assert.equal(await detail.count(), 1, 'Escape closes only the inputs dropdown');
  await inBtn.locator('.lf-dot').waitFor();
  await inBtn.click();
  assert.match(await area.inputValue(), /"yes"/);
  await area.fill(JSON.stringify({ ...obj, store_kpi: { source: 'kpis', type: 'object[]', required: true } }, null, 2));
  await json.getByRole('button', { name: '적용', exact: true }).click();
  await json.waitFor({ state: 'detached' });
  assert.equal((await inBtn.innerText()).trim(), `입력 ${n0 + 1}`);
  let saved = await flowOf();
  assert.deepEqual(saved.flow.inputs.find(i => i.param === 'store_kpi'), { param: 'store_kpi', source: 'kpis', required: true });
  assert.ok(saved.flow.nodes.find(n => n.module === 'write').reads.includes('store_kpi'));

  // 흐름: 스크롤로는 움직이지 않는다 · 전체가 보이게 맞춤
  const stage = detail.locator('.lf-stage'), cv = detail.locator('.lf-canvas');
  // the flow re-fits after the save — wait until it is still
  for (let last = '', i = 0; i < 20; i++) { await page.waitForTimeout(100); const now = await stage.getAttribute('style'); if (now === last) break; last = now; }
  const st0 = await stage.getAttribute('style'), cvb = await cv.boundingBox(), stb = await stage.boundingBox();
  assert.ok(stb.y >= cvb.y - 1 && stb.y + stb.height <= cvb.y + cvb.height + 1, 'whole flow fits');
  await page.mouse.move(cvb.x + cvb.width / 2, cvb.y + cvb.height / 2);
  await page.mouse.wheel(0, 400); await page.waitForTimeout(120);
  assert.equal(await stage.getAttribute('style'), st0, 'wheel does not scroll the flow');
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -200); await page.keyboard.up('Control'); await page.waitForTimeout(120);
  assert.notEqual(await stage.getAttribute('style'), st0, 'ctrl + wheel zooms');
  await detail.getByRole('button', { name: '화면에 맞추기' }).click();
  await shot(page, '4-flow');

  // 단계 팝업: 누른 단계 왼쪽, 배경 없음 · 프롬프트 · 도구
  const overlays = await page.locator('.modal-overlay').count();
  const writeNode = detail.locator('.lf-node', { hasText: '문구 작성' });
  await writeNode.click();
  const pop = page.locator('.lf-pop');
  await pop.waitFor();
  await page.waitForTimeout(80);
  const pb = await pop.boundingBox(), nb = await writeNode.boundingBox();
  assert.ok(pb.x + pb.width <= nb.x + 1, 'popover sits left of the step');
  assert.equal(await page.locator('.modal-overlay').count(), overlays, 'no extra backdrop');
  assert.match(await pop.getByLabel('프롬프트').inputValue(), /파일럿 · 확산 3단계 계단/);
  assert.ok(await pop.locator('.lf-chip.tool.builtin').count() >= 1, 'built-in lookups are shown as tools');
  assert.ok((await pop.locator('.lf-logic-row code').allInnerTexts()).some(t => t.includes('auto_part_fill')));
  await pop.getByLabel('프롬프트').fill('단계마다 매장 수를 고객 수치로만 씁니다.');
  await pop.getByLabel('도구 붙이기').selectOption('rag_scenarios');
  await shot(page, '5-popover');
  await pop.getByRole('button', { name: '저장', exact: true }).click();
  await pop.waitFor({ state: 'detached' });
  saved = await flowOf();
  const write = saved.flow.nodes.find(n => n.module === 'write');
  assert.equal(write.prompt, '단계마다 매장 수를 고객 수치로만 씁니다.');
  assert.deepEqual(write.tools, ['rag_scenarios']);
  assert.ok((await detail.locator('.lf-toolbox span').allInnerTexts()).includes('rag_scenarios'));

  // 코드 단계: 어느 DB 의 어느 오브젝트
  await detail.locator('.lf-node', { hasText: '입력 정리' }).click();
  await pop.waitFor();
  assert.ok((await pop.locator('.lf-logic-row code').allInnerTexts()).some(t => t.includes('composer/library.json')));
  assert.ok((await pop.locator('.lf-logic-row').allInnerTexts()).some(t => t.includes('products_all')));
  await detail.locator('.lf-node', { hasText: 'AI 잠금 영역 유지' }).click();   // another step replaces the popover
  await page.waitForFunction(() => document.querySelectorAll('.lf-pop').length === 1 && document.querySelector('.lf-pop strong').textContent === 'AI 잠금 영역 유지');
  assert.ok((await pop.locator('.lf-logic-row code').allInnerTexts()).some(t => t.includes('layout_library.json')));
  await shot(page, '6-code-step');
  await page.keyboard.press('Escape');
  await pop.waitFor({ state: 'detached' });
  assert.equal(await detail.count(), 1, 'Escape closes only the popover');

  // 흐름의 첫 단계 = input(그냥 단계 하나) — JSON 은 누르면 팝업에서, 머리 입력 팝업과 같은 JSON
  const card = detail.locator('.lf-input');
  assert.equal(await card.locator('strong').innerText(), 'input');
  assert.equal(await detail.locator('.lf-flow pre, .lf-flow textarea, .lf-io').count(), 0, 'no JSON or in/out on the graph');
  assert.ok((await card.boundingBox()).y < (await detail.locator('.lf-node:not(.lf-input)').first().boundingBox()).y, 'input is the first step');
  await card.click();
  const inPop = page.locator('.lf-in-pop2');
  await inPop.waitFor();
  const cardJson = JSON.parse(await inPop.getByLabel('입력 JSON').inputValue());
  assert.deepEqual(Object.keys(cardJson), saved.flow.inputs.map(i => i.param));
  await inBtn.click();
  await page.locator('.lf-in-pop').first().waitFor();
  assert.deepEqual(JSON.parse(await page.locator('.ll-ex-pop.lf-in-pop').getByLabel('입력 JSON').inputValue()), cardJson, 'the same JSON as the header popup');
  await page.keyboard.press('Escape');
  // in · out 은 단계 팝업에서
  await writeNode.click();
  await pop.locator('.lf-io-block').waitFor();
  assert.match(await pop.locator('.lf-io-side.out').innerText(), /"t"/);
  // 모델 입력 — 저장한 지시가 실제 프롬프트에 들어간다(샘플 입력 · 모델은 부르지 않음)
  await pop.locator('.lf-call', { hasText: 'auto_part_fill' }).first().waitFor({ timeout: 30000 });
  assert.match(await pop.getByLabel('auto_part_fill 프롬프트').first().innerText(), /단계마다 매장 수를 고객 수치로만 씁니다/);
  assert.match(await pop.locator('.lf-call.open').first().innerText(), /schema[\s\S]*"type"/);
  await shot(page, '6b-model-input');
  await page.keyboard.press('Escape');
  await pop.waitFor({ state: 'detached' });
  // Decision 분기는 탭 — 검수: state · question_type · 질문
  await detail.locator('.lf-node', { hasText: '사실 · 요구 검수' }).click();
  await pop.getByRole('tab', { name: /Decision/ }).click();
  await pop.locator('.lf-call', { hasText: 'auto_part_verify' }).first().waitFor({ timeout: 30000 });
  assert.ok(await pop.locator('.lf-q .lf-qtype.choice').count() >= 1);
  assert.match(await pop.locator('.lf-qtypes').innerText(), /choice/);
  await shot(page, '6c-decision-tab');
  await pop.getByRole('tab', { name: 'LLM' }).click();
  await pop.locator('.lf-call', { hasText: 'auto_part_verify' }).first().waitFor();
  await page.keyboard.press('Escape');
  await pop.waitFor({ state: 'detached' });

  // 사용자 정의 단계 + 도구 (tool calling)
  await detail.getByRole('button', { name: '사용자 정의 단계 추가' }).click();
  await pop.waitFor();
  await pop.getByLabel('단계 이름').fill('사례 보강');
  assert.equal(await pop.getByRole('button', { name: '추가', exact: true }).isDisabled(), true);
  await pop.getByLabel('프롬프트').fill('비슷한 사례의 성과로 본문을 보강합니다.');
  await pop.getByLabel('도구 붙이기').selectOption('rag_dss');
  await pop.getByLabel('도구 붙이기').selectOption('web_search');
  await pop.getByRole('button', { name: '추가', exact: true }).click();
  await pop.waitFor({ state: 'detached' });
  saved = await flowOf();
  const agent = saved.flow.nodes.find(n => n.module === 'agent');
  assert.deepEqual([agent.label, agent.tools], ['사례 보강', ['rag_dss', 'web_search']]);
  await detail.locator('.lf-node', { hasText: '사실 · 요구 검수' }).click();
  await pop.getByRole('button', { name: '단계 삭제' }).click();
  await pop.waitFor({ state: 'detached' });
  assert.deepEqual((await flowOf()).flow.nodes.map(n => n.module), ['collect', 'bind', 'write', 'shorten', 'agent', 'lock', 'final']);
  await shot(page, '7-edited');
  // 최종 점검 — every flow's last step (ReAct): it cannot be removed, and its chip never covers the step's words
  const final = detail.locator('.lf-node').last();
  assert.match(await final.innerText(), /최종 점검/);
  assert.equal(await final.locator('.lf-react-chip').innerText(), 'ReAct');
  assert.equal(await detail.locator('.lf-node.react').count(), 2, 'the custom step and the final check run ReAct loops');
  const chip = await final.locator('.lf-react-chip').boundingBox(), words = await final.locator('.lf-node-text small').boundingBox();
  assert.ok(words.x + words.width <= chip.x + 1, 'the step text ends before the ReAct chip');
  await final.click();
  await pop.waitFor();
  assert.equal(await pop.getByRole('button', { name: '단계 삭제' }).count(), 0);
  assert.match(await pop.innerText(), /관찰 → 판단/);
  await shot(page, '7b-final');
  await pop.getByRole('button', { name: '단계 팝업 닫기' }).click();
  await pop.waitFor({ state: 'detached' });

  // 시트 수정 반영 — 잠금은 칸 정책으로 저장된다
  await detail.getByRole('button', { name: '수정 반영', exact: true }).click();
  await page.getByRole('dialog', { name: '레이아웃 수정을 반영할까요?' }).getByRole('button', { name: '수정 반영' }).click();
  await page.waitForFunction(() => document.querySelector('.ll-save-state')?.textContent.startsWith('반영'));
  const item = (await (await context.request.get(base + '/api/layout-library')).json()).items[F];
  const [kind, id] = target.key.split(':');
  assert.equal(item.modes[kind][id], 'fixed');
  assert.ok(item.t[id].endsWith('수정'));
  await detail.getByRole('button', { name: '기본값', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.lf-edited'));
  assert.equal((await flowOf()).edited, false);
  await detail.getByRole('button', { name: '닫기', exact: true }).last().click();

  // 홈: 도구 관리 — 시험 실행 · 새 도구
  await page.getByRole('button', { name: '도구', exact: true }).click();
  const tdlg = page.locator('section.modal').filter({ has: page.locator('.lf-toolsx') });
  await tdlg.locator('.lf-tool-row').first().waitFor();
  assert.ok(await tdlg.locator('.lf-tool-row').count() >= 7);
  await tdlg.getByLabel('시험 질의').fill('노후 중앙공조 냉난방 에너지 절감');
  const rag = tdlg.locator('.lf-tool-row').filter({ has: page.locator('code', { hasText: /^rag_dss$/ }) });
  await rag.getByRole('button', { name: '시험' }).click();
  await rag.locator('.lf-try > div').first().waitFor();
  await shot(page, '8-tools');
  await tdlg.getByLabel('도구 추가').selectOption('rag');
  await tdlg.getByLabel('도구 키').fill('rag_cases');
  await tdlg.getByLabel('rag_cases 이름').fill('RAG · 사례');
  await tdlg.getByLabel('rag_cases 설정').fill('{"collection":"dss","top_k":3,"query":"{industry} 사례"}');
  await tdlg.getByRole('button', { name: '저장', exact: true }).click();
  await page.waitForFunction(async () => (await (await fetch('/admin/api/layout-library/tools')).json()).tools.some(t => t.key === 'rag_cases'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log('layout-flow-ui: ok');
} finally {
  await browser.close();
}
