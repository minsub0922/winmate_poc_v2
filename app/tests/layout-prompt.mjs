// Real Gemini planning, suggestions, approved count reflow and measured position edits.
import assert from 'node:assert/strict';
import { decodeActionOutput } from '../web/src/services/layout-actions.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const geometryOnly = process.argv.includes('--geometry-only');
const output = path.join(root, 'app/tests/output', geometryOnly ? 'layout-actions-geometry' : 'layout-actions'); await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'winmate-layout-prompt-'));
const port = 8798; process.env.WINMATE_API_PORT = String(port); process.env.WINMATE_WEB_PORT = '5198';
const api = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/layout-reflow-server.py'], { cwd: root,
  env: { ...process.env, WINMATE_AUTH_DIR: path.join(temp, 'auth'), WINMATE_STORYBOARD_DIR: path.join(temp, 'shares'), WINMATE_LLM_CACHE: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; api.stdout.on('data', b => { logs += b; }); api.stderr.on('data', b => { logs += b; });
const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 5198, strictPort: true, hmr: false, fs: { allow: [path.join(root, 'app/web'), output] } } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const calls = [], errors = [], checks = []; let browser, page;
const pass = s => { checks.push(s); console.log('PASS', s); };
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/auth/status`)).ok) break; } catch {} if (api.exitCode != null) throw Error(logs.slice(-1000)); await sleep(500); }
  await vite.listen(); const base = 'http://127.0.0.1:5198'; browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { username: 'layout-reflow-test', password: 'layout-reflow-test-synthetic-password' } })).status(), 200);
  page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.text().startsWith('PHASE:')) console.log(m.text()); });
  page.on('response', async response => { if (!response.url().endsWith('/api/llm')) return; try { const json = await response.json(); const prompt = response.request().postDataJSON()?.prompt || '', stage = prompt.startsWith('단계 1:') ? 'extract' : prompt.startsWith('단계 2:') ? 'compile' : 'other'; const decoded = json.data && stage !== 'other' ? decodeActionOutput(json.data, stage === 'extract' ? 'actions' : 'operations') : json.data; calls.push({ stage, status: response.status(), model: json.model, usage: json.usage, code: json.code, reason: json.reason, detail: json.detail, wireData: stage === 'other' ? undefined : json.data, data: decoded }); console.log('LLM', response.status(), json.model || json.code); } catch {} });
  await page.goto(base); await page.locator('.home').waitFor();
  const entry = await (await fetch(base + '/src/main.jsx')).text();
  const reactUrl = entry.match(/from ["']([^"']*deps\/react\.js[^"']*)/)[1], domUrl = entry.match(/from ["']([^"']*deps\/react-dom_client\.js[^"']*)/)[1];
  await page.evaluate(async ({ reactUrl, domUrl }) => {
    const React = (await import(reactUrl)).default, dom = await import(domUrl), { LayoutEditor } = await import('/src/components/mytpl.jsx');
    const { loadLayoutHtml } = await import('/src/services/catalog.js'); await loadLayoutHtml();
    document.querySelector('.app').style.display = 'none'; const host = document.createElement('div'); document.body.appendChild(host);
    window.__agentRoot = (dom.createRoot || dom.default.createRoot)(host); window.__saved = null;
    window.__agentRoot.render(React.createElement(LayoutEditor, { f: 'L_AIS_02', context: { partName: '개요', industry: 'retail', requirements: '고객 요구: 매장별 디지털 메뉴보드 운영을 통합하고 제안서 개요를 빠르게 파악할 수 있도록 사진 중심으로 구성' }, onClose: () => {}, onSaved: (meta, keep) => { window.__saved = { meta, keep }; } }));
  }, { reactUrl, domUrl });
  const editor = page.locator('.myed'), canvas = page.locator('.ed-host > div');
  const signature = () => canvas.evaluate(async el => (await import('/src/services/layout-prompt.js')).layoutFingerprint(el));
  await editor.waitFor(); await page.evaluate(() => { let last = ''; window.__progress = setInterval(() => { const text = document.querySelector('.ed-agent-progress')?.textContent || ''; if (text && text !== last) console.log('PHASE:' + text); last = text; }, 1000); }); await page.waitForFunction(() => document.querySelector('.ed-agent-units')?.textContent.includes('사진 카드 6개'));
  const geometry = await page.evaluate(async () => {
    const { applyLayoutPatches, applyLayoutOperations, layoutFingerprint } = await import('/src/services/layout-prompt.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px';
    host.innerHTML = `<div style="position:relative;width:1280px;height:720px"><div style="position:absolute;right:80px;top:180px;width:160px;height:80px;box-sizing:content-box;padding:10px;border:2px solid black"><span data-tb="0">오른쪽 고정</span></div><div style="position:absolute;left:400px;top:350px;width:400px;height:120px;display:flex;justify-content:center;align-items:center"><div style="width:160px;height:80px;flex-shrink:0"><span data-tb="1">가운데 요소</span></div></div><div data-tb="2" style="position:absolute;left:100px;top:60px;width:300px;height:50px;font-size:20px"><span style="font-size:20px;color:#111111">제목</span></div></div>`;
    document.body.appendChild(host); const root = host.firstElementChild;
    try {
      const p = { evidence: { nodes: [{ id: 'a', path: [0, 0], framePath: [0] }, { id: 'b', path: [1, 0, 0], framePath: [1, 0] }, { id: 'c', path: [2], framePath: [2] }] }, patches: [{ id: 'a', w: 210, h: 110 }, { id: 'b', w: 200, h: 100 }, { id: 'c', x: 124, y: 68, fontSize: 24, color: '#1428a0', align: 'right' }] };
      const leftBefore = [root.children[0], root.children[1].firstElementChild].map(el => el.getBoundingClientRect().x);
      const quality = applyLayoutPatches({ root }, p);
      const leftAfter = [root.children[0], root.children[1].firstElementChild].map(el => el.getBoundingClientRect().x);
      if (leftAfter.some((x, i) => Math.abs(x - leftBefore[i]) > 1)) throw Error('Resize unexpectedly moved an anchored/centered frame');
      if (root.children[2].offsetLeft !== 124 || root.children[2].offsetTop !== 68) throw Error('Property panel X/Y must match approved native anchors');
      const run = getComputedStyle(root.children[2].firstElementChild); if (parseFloat(run.fontSize) !== 24 || run.color !== 'rgb(20, 40, 160)') throw Error('Native text runs must inherit approved type size/color');
      root.setAttribute('data-bg', 'data:image/jpeg;base64,AA'); root.setAttribute('data-bg-source', 'original-photo'); root.setAttribute('data-bg-effects', '{"blur":4}');
      const fp = layoutFingerprint(root); root.style.backgroundImage = 'url("blob:derived-background-preview")'; root.setAttribute('data-bg-rendered', 'blob:derived-background-preview'); root.setAttribute('data-bg-rendered-effects', 'derived');
      if (fp !== layoutFingerprint(root)) throw Error('Derived background preview must not invalidate the plan');
      root.setAttribute('data-bg-effects', '{"blur":8}'); if (fp === layoutFingerprint(root)) throw Error('Actual background effects change must invalidate the plan');
      const nested = document.createElement('div'); nested.style.cssText = 'width:1280px;height:720px;position:relative'; nested.innerHTML = '<div style="position:absolute;left:64px;top:60px;width:500px;height:90px"><div data-tb="0"><span style="font-size:40px;font-weight:700;color:rgb(20,40,160)">원문</span></div><div data-tb="1">보호 문구</div></div>'; host.appendChild(nested);
      const ev = { nodes: [{ id: 't0', type: 'text', x: 64, y: 60, w: 500, h: 90, path: [0,0], framePath: [0] }, { id: 't1', type: 'text', x: 64, y: 60, w: 500, h: 90, path: [0,1], framePath: [0] }], imageOptions: [] };
      await applyLayoutOperations({ root: nested }, ev, [{ actionId: 'a1', type: 'replace_text', target: 't0', values: { text: '새 문구' } }]);
      const formatted = getComputedStyle(nested.querySelector('[data-tb="0"] span')); if (parseFloat(formatted.fontSize) !== 40 || formatted.fontWeight !== '700' || formatted.color !== 'rgb(20, 40, 160)') throw Error('Text replacement lost native formatting');
      let rejected = false; try { await applyLayoutOperations({ root: nested }, ev, [{ actionId: 'a1', type: 'move', target: 't0', values: { dx: 20 } }]); } catch { rejected = true; }
      if (!rejected) throw Error('Moving a shared frame must not move an unapproved sibling');
      nested.remove();
      const bare = document.createElement('img'); bare.setAttribute('data-img', '55'); bare.setAttribute('srcset', '/img/km24c-front.png 1x'); bare.style.cssText = 'position:absolute;left:900px;top:180px;width:160px;height:80px'; root.appendChild(bare);
      const barePath = [...root.children].indexOf(bare), size = bare.getBoundingClientRect();
      await applyLayoutOperations({ root }, { nodes: [{ id: 'i0', type: 'image', path: [barePath], framePath: [barePath] }], imageOptions: [{ id: 'known', pid: 'qm55c.front', src: '/img/qm55c-front.png', kind: 'cut', label: '제품 컷' }] }, [{ actionId: 'a1', type: 'replace_image', target: 'i0', values: { imageId: 'known', fit: 'contain' } }]);
      if (bare.hasAttribute('srcset') || !bare.currentSrc.endsWith('/img/qm55c-front.png')) throw Error('Replacement must use the approved asset pixels');
      if (bare.getBoundingClientRect().width !== size.width || bare.getBoundingClientRect().height !== size.height) throw Error('Bare image replacement changed geometry'); bare.remove();
      return { pass: quality.pass, leftBefore, leftAfter, nativeTitleX: root.children[2].offsetLeft, nativeTitleY: root.children[2].offsetTop, backgroundFingerprint: true, preservesTextFormatting: true, protectsUnapprovedSiblings: true, preservesBareImageSize: true };
    } finally { host.remove(); }
  });
  await fs.writeFile(path.join(output, 'geometry.json'), JSON.stringify(geometry, null, 2));
  pass('Local geometry: bordered/right-anchored and flex-centered resizing keeps position; native X/Y and derived background fingerprint stay consistent');

  if (!geometryOnly) {
  await page.locator('.ed-agent-prompts > button').nth(2).waitFor({ timeout: 100000 });
  assert.equal(await page.locator('.ed-agent-prompts > button').count(), 3);
  const bubbles = await page.locator('.ed-agent-prompts > button').allTextContents();
  const suggestionCall = calls.find(c => c.data?.prompts?.[0]?.kind); assert.deepEqual(suggestionCall.data.prompts.map(p => p.kind), ['count', 'position', 'hierarchy']); assert.notEqual(suggestionCall.data.prompts[0].count, 6);
  assert(bubbles.some(s => /카드|사진/.test(s))); assert.equal(await page.locator('.ed-panel .ed-agent').count(), 0);
  assert.equal(await page.getByRole('button', { name: '레이아웃 개선하기', exact: true }).count(), 0); assert.equal(await page.getByLabel('변경할 개수', { exact: true }).count(), 0);
  const placement = await page.locator('.ed-agent').evaluate(el => ({ y: el.getBoundingClientRect().top, end: document.querySelector('.ed-fit').getBoundingClientRect().bottom, right: el.getBoundingClientRect().right, viewport: innerWidth })); assert(placement.y >= placement.end - 1 && placement.right <= placement.viewport);
  await page.locator('.ed-agent-prompts > button').first().click(); assert.equal(await page.getByLabel('레이아웃 수정 요청').inputValue(), bubbles[0]);
  pass('Actual-context suggestions: exactly 3 bubbles under the slide, fill editable composer; old sidebar controls removed');
  await page.screenshot({ path: path.join(output, 'suggestions.png') });
  const before = await signature();
  const submit = async prompt => { await page.getByLabel('레이아웃 수정 요청').fill(prompt); await page.getByRole('button', { name: '요청하기', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false' && document.querySelector('.ed-action-popover, .ed-agent [role=alert]'), null, { timeout: 100000 }); assert.equal(await page.getByRole('button', { name: '승인', exact: true }).count(), 1, await page.locator('.ed-agent').innerText()); };
  const countPrompt = '사진 카드가 현재 6개인 개요 페이지입니다. 사진 카드를 4개로 바꾸고 빈 공간을 균형 있게 채워 주세요.';
  await submit(countPrompt); assert.equal(await signature(), before);
  const countPlan = calls.filter(c => c.stage === 'extract').at(-1).data;
  assert(!('message' in countPlan) && !('changes' in countPlan)); assert.equal(countPlan.status, 'ready'); assert.equal(countPlan.actions[0].type, 'reflow'); assert.equal(countPlan.actions[0].values.count, 4);
  assert.equal(calls.filter(c => c.stage === 'compile').length, 0);
  assert.equal(await page.locator('.ed-agent-message').count(), 0);
  const popupPosition = await page.locator('.ed-action-popover').evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, inputTop: document.querySelector('.ed-agent-form').getBoundingClientRect().top })); assert(popupPosition.bottom <= popupPosition.inputTop && popupPosition.inputTop - popupPosition.bottom < 20);

  await page.screenshot({ path: path.join(output, 'count-plan-before-approval.png') });
  await page.keyboard.press('Escape'); assert.equal(await signature(), before); assert.equal(await page.locator('.ed-action-popover').count(), 0); assert(await editor.isVisible());
  pass('Real agent explains 6→4 plan; no live mutation before approval or after Cancel');
  await submit(countPrompt); await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false', null, { timeout: 300000 });
  const err = await page.locator('.ed-agent [role="alert"]').allTextContents(); assert.deepEqual(err, [], err.join('\n'));
  assert.equal(await canvas.getAttribute('data-repeat-count'), '4'); assert.equal(await canvas.locator('[data-reflow-card]').count(), 4);
  await page.screenshot({ path: path.join(output, 'count-applied.png') });
  await fs.writeFile(path.join(output, 'count-audit.json'), await canvas.getAttribute('data-reflow-report') || '{}');
  assert(calls.some(c => c.stage === 'compile' && c.data?.operations?.length));
  const countHtml = await canvas.evaluate(el => el.outerHTML); await fs.writeFile(path.join(output, 'photo-four.html'), countHtml);
  await page.getByRole('button', { name: '되돌리기', exact: true }).click(); assert.equal(await signature(), before);
  await page.getByRole('button', { name: '다시 하기', exact: true }).click(); assert.equal(await canvas.getAttribute('data-repeat-count'), '4');
  pass('Approved real Gemini reflow changes photo cards 6→4; undo/redo preserve the exact original');
  // Plan against actual current title; controlled patch and model quality review are both real calls.
  const title = await canvas.evaluate(root => {
    const r = root.getBoundingClientRect(), s = r.width / 1280;
    const el = [...root.querySelectorAll('[data-tb]')].filter(el => { const b = el.getBoundingClientRect(); return (b.y - r.y) / s < 130 && !el.querySelector('[data-tb]'); }).sort((a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize))[0];
    window.__titleSlot = el.getAttribute('data-tb'); const b = el.getBoundingClientRect(); return { text: el.textContent, x: (b.x - r.x) / s, y: (b.y - r.y) / s };
  });
  const patchBefore = await signature();
  await submit(`큰 제목 '${title.text}'만 현재 위치에서 오른쪽으로 24px, 아래로 8px 옮겨 주세요. 다른 요소와 글·사진은 그대로 유지해 주세요.`);
  assert.equal(await signature(), patchBefore);
  await page.screenshot({ path: path.join(output, 'position-plan.png') });
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false', null, { timeout: 180000 });
  assert.deepEqual(await page.locator('.ed-agent [role="alert"]').allTextContents(), []);
  const moved = await canvas.evaluate(root => { const r = root.getBoundingClientRect(), s = r.width / 1280, b = root.querySelector(`[data-tb="${window.__titleSlot}"]`).getBoundingClientRect(); return { x: (b.x - r.x) / s, y: (b.y - r.y) / s }; });
  assert(Math.abs(moved.x - title.x - 24) < 1 && Math.abs(moved.y - title.y - 8) < 1, JSON.stringify({ title, moved }));
  await page.screenshot({ path: path.join(output, 'position-applied.png') });
  const patchHtml = await canvas.evaluate(el => el.outerHTML); await fs.writeFile(path.join(output, 'position-applied.html'), patchHtml);
  await page.getByRole('button', { name: '되돌리기', exact: true }).click(); assert.equal(await signature(), patchBefore);
  await page.getByRole('button', { name: '다시 하기', exact: true }).click();
  pass('Approved title position moves exactly +24/+8 px after the SECOND LLM compiles approved actions; one undo restores prior layout');
  const beforeAdd = await signature();
  await submit(`오른쪽 상단 X=900, Y=64, 너비=280, 높이=44에 '시범 매장 검토' 글 상자를 글자 크기 20px로 추가하고, 큰 제목 '${title.text}'를 '도입 개요'로 수정해 주세요.`);
  assert.equal(await signature(), beforeAdd);
  const addPlan = calls.filter(c => c.stage === 'extract').at(-1).data;
  assert(addPlan.actions.some(a => a.type === 'add_text')); assert(addPlan.actions.some(a => a.type === 'replace_text'));
  await page.screenshot({ path: path.join(output, 'add-text-confirmation.png') });
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false', null, { timeout: 180000 });
  assert.deepEqual(await page.locator('.ed-agent [role="alert"]').allTextContents(), []);
  assert(await canvas.getByText('시범 매장 검토', { exact: true }).count()); assert(await canvas.getByText('도입 개요', { exact: true }).count());
  const addAudit = JSON.parse(await canvas.getAttribute('data-layout-agent')); assert.equal(addAudit.version, 2); assert.equal(addAudit.approvedActions.length, 2); assert.equal(addAudit.operations.length, 2);
  await fs.writeFile(path.join(output, 'two-stage-actions.json'), JSON.stringify(addAudit, null, 2));
  await page.screenshot({ path: path.join(output, 'add-text-applied.png') });
  await page.getByRole('button', { name: '되돌리기', exact: true }).click(); assert.equal(await signature(), beforeAdd);
  pass('Real structured add_text + replace_text popup → approved SECOND LLM → native editable text added/updated atomically; undo restores both');
  await submit('첫 번째 카드의 사진을 카페 카운터 위 메뉴보드와 좌석이 있는 사진으로 교체해 주세요.');
  const imagePlan = calls.filter(c => c.stage === 'extract').at(-1).data; assert.equal(imagePlan.actions[0].type, 'replace_image');
  assert.equal(await page.locator('.ed-action-image').count(), 1); await page.screenshot({ path: path.join(output, 'replace-image-confirmation.png') });
  const imageBefore = await signature(); await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false', null, { timeout: 180000 });
  assert.deepEqual(await page.locator('.ed-agent [role="alert"]').allTextContents(), []);
  const imageAudit = JSON.parse(await canvas.getAttribute('data-layout-agent')); const imageOp = imageAudit.operations.find(op => op.type === 'replace_image'); assert(imageOp);
  assert.equal(await canvas.locator(`[data-pid="${imageOp.values.imageId}"]`).count(), 1);
  await page.getByRole('button', { name: '되돌리기', exact: true }).click(); assert.equal(await signature(), imageBefore);
  pass('Real image replacement action previews an actual approved asset and SECOND LLM swaps only that image');
  const beforeImageAdd = await signature();
  await submit('오른쪽 상단 X=900, Y=64, 너비=200, 높이=64에 카페 메뉴보드 사진을 하나 추가해 주세요.');
  assert(calls.filter(c => c.stage === 'extract').at(-1).data.actions.some(a => a.type === 'add_image'));
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false', null, { timeout: 180000 });
  assert.deepEqual(await page.locator('.ed-agent [role="alert"]').allTextContents(), []);
  assert.equal(await canvas.locator('[data-img]').count(), 5);
  await submit("방금 추가한 오른쪽 상단 사진의 너비를 180px, 높이를 60px로 바꾸고, 'CONTENTS' 글자 색을 #0b6e64로 수정해 주세요.");
  const stylePlan = calls.filter(c => c.stage === 'extract').at(-1).data; assert(stylePlan.actions.some(a => a.type === 'resize')); assert(stylePlan.actions.some(a => a.type === 'style'));
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false', null, { timeout: 180000 });
  assert.deepEqual(await page.locator('.ed-agent [role="alert"]').allTextContents(), []);
  const actualStyle = await canvas.evaluate(root => {
    const r = root.getBoundingClientRect(), s = r.width / 1280, title = [...root.querySelectorAll('[data-tb]')].find(el => el.textContent === 'CONTENTS');
    const photo = [...root.querySelectorAll('[data-img]')].find(el => Math.abs((el.getBoundingClientRect().x - r.x) / s - 900) < 1), b = photo?.getBoundingClientRect();
    return { color: getComputedStyle(title).color, w: b?.width / s, h: b?.height / s };
  }); assert.equal(actualStyle.color, 'rgb(11, 110, 100)'); assert(Math.abs(actualStyle.w - 180) < 1 && Math.abs(actualStyle.h - 60) < 1);
  await page.getByRole('button', { name: '되돌리기', exact: true }).click();
  await submit('오른쪽 상단 X=900, Y=64에 추가한 사진 하나만 삭제해 주세요. 기존 카드 사진은 유지해 주세요.');
  assert.equal(calls.filter(c => c.stage === 'extract').at(-1).data.actions[0].type, 'remove');
  await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false', null, { timeout: 180000 });
  assert.deepEqual(await page.locator('.ed-agent [role="alert"]').allTextContents(), []); assert.equal(await canvas.locator('[data-img]').count(), 4);
  await page.getByRole('button', { name: '되돌리기', exact: true }).click(); await page.getByRole('button', { name: '되돌리기', exact: true }).click(); assert.equal(await signature(), beforeImageAdd);
  pass('Actual add_image, resize, style and remove actions execute only after approval and second-model compilation; undo restores the original');
  // An existing pending plan becomes stale if any untracked fixed label/shape changes.
  await submit(`큰 제목 '${title.text}'만 왼쪽으로 10px 옮겨 주세요.`);
  await canvas.evaluate(root => { const el = root.querySelector('[data-tb]'); el.style.letterSpacing = '1.1px'; });
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '승인', exact: true }).scrollIntoViewIfNeeded();
  const reachablePopup = await page.getByRole('button', { name: '승인', exact: true }).evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }); assert(reachablePopup);
  await page.screenshot({ path: path.join(output, 'mobile-confirmation.png') }); await page.setViewportSize({ width: 1500, height: 1050 });
  const stale = await signature(); await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /바뀌었어요/ }).waitFor(); assert.equal(await signature(), stale);
  assert.equal(await page.getByRole('button', { name: '승인', exact: true }).count(), 0);
  pass('Stale plan cannot overwrite a newer manual edit');
  // Failure and interruption use negative transport fixtures, never a fake positive AI result.
  await context.route('**/api/llm', route => route.fulfill({ status: 503, json: { code: 'upstream_error', detail: 'test-negative: provider offline' } }));
  const failureBefore = await signature(); await page.getByLabel('레이아웃 수정 요청').fill('제목을 오른쪽으로 4px 옮겨 주세요.'); await page.getByRole('button', { name: '요청하기', exact: true }).click();
  await page.locator('.ed-agent [role="alert"]').waitFor(); assert.equal(await signature(), failureBefore);
  assert.match(await page.getByLabel('레이아웃 수정 요청').inputValue(), /오른쪽/);
  await context.unroute('**/api/llm');
  pass('API failure preserves layout and draft prompt, with a visible retryable error');
  let releaseHeld;
  const held = new Promise(r => { releaseHeld = r; });
  await context.route('**/api/llm', async route => { await held; try { await route.abort(); } catch {} });
  const cancelledBefore = await signature();
  await page.getByRole('button', { name: '요청하기', exact: true }).click();
  await page.getByRole('button', { name: '작업 취소', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false');
  assert.equal(await signature(), cancelledBefore); assert.equal(await page.getByRole('button', { name: '승인', exact: true }).count(), 0);
  releaseHeld(); await context.unroute('**/api/llm');
  pass('In-flight cancellation aborts planning and never creates an approved change');
  await submit('큰 제목만 오른쪽으로 4px 이동해 주세요.');
  let releaseCompile; const heldCompile = new Promise(r => { releaseCompile = r; });
  await context.route('**/api/llm', async route => { await heldCompile; try { await route.abort(); } catch {} });
  const compileCancelledBefore = await signature(); await page.getByRole('button', { name: '승인', exact: true }).click();
  await page.getByRole('button', { name: '작업 취소', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.ed-agent')?.getAttribute('aria-busy') === 'false');
  assert.equal(await signature(), compileCancelledBefore); releaseCompile(); await context.unroute('**/api/llm');
  pass('Cancellation during the second LLM compilation preserves the live layout');
  await page.getByRole('button', { name: '새 My 템플릿으로 저장', exact: true }).click(); await page.waitForFunction(() => window.__saved);
  const saved = await page.evaluate(async () => { const { rawHtml } = await import('/src/repositories/templates.js'); return { ...window.__saved, html: rawHtml(window.__saved.meta.f) }; });
  assert.equal(saved.meta.pc, 0); assert.equal(saved.meta.repeat.count, 4); assert(saved.html.includes('data-layout-agent'));
  await fs.writeFile(path.join(output, 'saved.json'), JSON.stringify(saved, null, 2));
  pass('Count and position variant saves as a separate My layout with photo count 4 and pc=0');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('레이아웃 수정 요청').scrollIntoViewIfNeeded();
  const reachable = await page.getByLabel('레이아웃 수정 요청').evaluate(el => { const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top === el; }); assert(reachable, 'Mobile composer must receive pointer input above other panels');
  await page.screenshot({ path: path.join(output, 'mobile.png') });
  assert(await page.getByLabel('레이아웃 수정 요청').isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  pass('Mobile composer remains reachable without horizontal overflow');
  const planningCases = await page.evaluate(async () => {
    const { L, layoutHtml } = await import('/src/services/catalog.js');
    const { planLayoutEdit, layoutFingerprint } = await import('/src/services/layout-prompt.js');
    const { fillReady } = await import('/src/services/fill.js');
    const results = [];
    for (const [f, prompt, expectedLabel, count] of [
      ['L_PH_P3_A', '제품을 3개에서 5개로 늘리고 영역을 균형 있게 채워 주세요.', '제품', 5],
      ['L_PH_AIS_25', '처리 단계만 3개에서 4개로 늘려 주세요. 데이터 카드 4개는 그대로 두세요.', '처리 단계', 4],
    ]) {
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px'; host.innerHTML = layoutHtml(f); document.body.appendChild(host);
      try { const root = host.firstElementChild; await fillReady(root); const before = layoutFingerprint(root); const plan = await planLayoutEdit(root, { meta: L[f], prompt });
        const action = plan.actions.find(a => a.type === 'reflow'); results.push({ f, type: action?.type, count: action?.values.count, expectedCount: count, label: plan.evidence.targets[action?.values.target]?.label, expectedLabel, unchanged: before === layoutFingerprint(root), actions: plan.actions });
      } finally { host.remove(); }
    }
    return results;
  });
  for (const c of planningCases) { assert.equal(c.type, 'reflow', JSON.stringify(c)); assert.equal(c.count, c.expectedCount); assert.equal(c.label, c.expectedLabel); assert(c.unchanged); }
  await fs.writeFile(path.join(output, 'planning-cases.json'), JSON.stringify(planningCases, null, 2));
  pass('Real model selects actual product units (3→5) and the correct target among data4/flow3 (flow→4)');
  }
  assert.deepEqual(errors, []);
} catch (error) { if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); await fs.writeFile(path.join(output, 'failure.txt'), await page.locator('body').innerText()).catch(() => {}); } console.error(error.message); throw error; }
finally {
  await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ generatedAt: new Date().toISOString(), real: !geometryOnly, checks, calls, errors }, null, 2));
  await browser?.close(); await vite.close(); api.kill('SIGTERM'); if (api.exitCode == null) await new Promise(r => api.once('exit', r)); await fs.rm(temp, { recursive: true, force: true });
}
