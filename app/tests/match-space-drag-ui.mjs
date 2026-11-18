// 매칭 카드(제품 · 솔루션 · 서비스 버블 아래)의 공간 묶음 — 제품을 끌어다 놓아 다른 공간 · 미배치로 옮기고 공간 안 순서를 바꾼다
// (사용자 지시 2026-11-17 "선택된 제품이 공간 구성이 되어있으면, 드래그앤 드랍으로 제품 위치를 자유롭게"). 놓는 즉시 p.spacePlan 에 저장,
// 공간 구성 팝업이 열려 있으면 끌 수 없다. 격리 서버(임시 계정 · 임시 계정 자료) · 모델 호출 없음.
// CHROME=<Chrome 실행 파일> node app/tests/match-space-drag-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'winmate-match-drag-'));
const output = path.join(root, 'app/tests/output/match-space-drag'); fs.mkdirSync(output, { recursive: true });
const apiPort = process.env.MATCH_DRAG_API_PORT || '15474', webPort = process.env.MATCH_DRAG_WEB_PORT || '15475', base = 'http://127.0.0.1:' + webPort;
process.env.WINMATE_API_PORT = apiPort; process.env.WINMATE_WEB_PORT = webPort;
// 계정 자료도 임시 파일로 — 실제 app/data/runtime/account_data.sqlite 에 쓰지 않는다
const api = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/spatial/server.py'], { cwd: root, env: { ...process.env, WINMATE_AUTH_DIR: path.join(temporary, 'auth'), WINMATE_ACCOUNT_DATA_DB: path.join(temporary, 'account_data.sqlite'), WINMATE_SPATIAL_DB: path.join(temporary, 'spatial.sqlite'), WINMATE_STORYBOARD_DIR: path.join(temporary, 'storyboards') } });
let apiLog = ''; api.stdout.on('data', (v) => apiLog += v); api.stderr.on('data', (v) => apiLog += v);
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), logLevel: 'error', server: { host: '127.0.0.1', port: Number(webPort), strictPort: true, hmr: false, watch: null } });
let browser, page; const checks = [], errors = [];
const pass = (m) => { checks.push(m); console.log('PASS ' + m); };
const shot = (name) => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
const PID = 'match-drag-ui';
try {
  let ready = false; for (let attempt = 0; attempt < 150; attempt++) {
    if (api.exitCode != null) throw new Error(apiLog);
    try { await fetch('http://127.0.0.1:' + apiPort + '/api/health'); ready = true; break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  } assert(ready, 'isolated API ready');
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
  const context = await browser.newContext({ viewport: { width: 1560, height: 1080 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: 'spatial-isolated-test-password' } })).status(), 200);
  const noSummary = async (route) => { const response = await route.fetch(); const json = await response.json(); const caps = json.capabilities || json; if (caps && caps.functions) delete caps.functions.requirements; return route.fulfill({ response, json }); };
  await context.route((url) => ['/api/bootstrap', '/api/poc/capabilities'].includes(url.pathname), noSummary);
  await context.route((url) => url.pathname === '/api/llm', (route) => route.fulfill({ status: 503, json: { detail: 'no model expected here' } }));
  await context.route((url) => url.pathname === '/api/jobs', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { detail: 'no job expected here' } }) : route.continue()));
  await context.addInitScript(() => { if (!localStorage.getItem('match-drag-seeded')) { localStorage.setItem('match-drag-seeded', '1'); localStorage.setItem('winmate.v2.proposals', '[]'); localStorage.setItem('winmate.v2.seedv', 'admin-samples-1'); localStorage.setItem('winmate.v2.review-example-proposals.seedv', 'skip-match-drag'); } });
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/spatial'); await page.locator('.sp-home-launches').waitFor({ timeout: 120000 });
  const route = await page.evaluate(async (PID) => {
    const { historyPath } = await import('/src/services/shared-path.js');
    const req = { free: [{ t: '전국 매장의 메뉴판을 디지털 메뉴보드로 바꾸려 합니다.' }], form: { project: '', customer: '', target: '', keymen: [], note: '' }, files: [] };
    const space = (id, name, color, products) => ({ id, name, kind: 'retail', note: '', color, products });
    const p = { id: PID, title: '끌어 놓기 검증', customer: 'A 커피', ind: 'FB', createdAt: 1, updatedAt: 2, stage: 'story', reqTab: 'free', req,
      ctx: { products: ['qm55c', 'kiosk', 'oh55a', 'ac360'], solutions: ['magicinfo'], cases: [] }, parts: [],
      spacePlan: { v: 1, vertical: { id: 'fb_qsr', name: '패스트푸드', group: 'FB' }, title: '직접 구성', summary: '', at: 1,
        spaces: [space('sa', '주문 카운터', 0, ['qm55c', 'kiosk']), space('sb', '드라이브스루', 1, ['oh55a']), space('sc', '주방', 2, [])] } };
    localStorage.setItem('winmate.v2.proposals', JSON.stringify([p]));
    return historyPath(PID);
  }, PID);
  const proposal = () => page.evaluate(async (id) => structuredClone((await import('/src/repositories/proposals.js')).getProposal(id)), PID);
  const spaces = async () => Object.fromEntries((await proposal()).spacePlan.spaces.map((s) => [s.id, s.products]));
  const shown = () => page.locator('.match-card .dss-grp').evaluateAll((list) => list.map((g) => [g.dataset.space, [...g.querySelectorAll('.dss-prod')].map((x) => x.dataset.ref.slice(8))]));
  const card = page.locator('.match-card'), grp = (id) => card.locator('.dss-grp[data-space="' + id + '"]'), prod = (g, id) => grp(g).locator('.dss-prod[data-ref="product:' + id + '"]');

  await page.goto(base + route); await card.waitFor({ timeout: 120000 });
  assert.deepEqual(await shown(), [['sa', ['qm55c', 'kiosk']], ['sb', ['oh55a']], ['sc', []], ['', ['ac360']]]);
  assert.equal(await card.locator('.dss-prod.movable[draggable="true"]').count(), 4, 'every product in a space group (and 미배치) can be dragged');
  await shot('1-grouped');

  // 다른 공간으로 — 묶음 빈 곳(머리줄)에 놓으면 끝에
  await prod('sa', 'kiosk').dragTo(grp('sb').locator('.dss-grp-h'));
  await page.waitForFunction(() => !!document.querySelector('.match-card .dss-grp[data-space="sb"] .dss-prod[data-ref="product:kiosk"]'));
  assert.deepEqual(await spaces(), { sa: ['qm55c'], sb: ['oh55a', 'kiosk'], sc: [] });
  // 비어 있는 공간으로
  await prod('sb', 'oh55a').dragTo(grp('sc'));
  await page.waitForFunction(() => !!document.querySelector('.match-card .dss-grp[data-space="sc"] .dss-prod[data-ref="product:oh55a"]'));
  assert.deepEqual(await spaces(), { sa: ['qm55c'], sb: ['kiosk'], sc: ['oh55a'] });
  pass('dragging a product onto another space group moves it there (at the end), including into an empty space; saved at once');

  // 다른 공간의 제품 위에 놓으면 그 앞 · 같은 공간 안 순서 바꾸기
  await prod('sb', 'kiosk').dragTo(prod('sa', 'qm55c'));
  await page.waitForFunction(() => !!document.querySelector('.match-card .dss-grp[data-space="sa"] .dss-prod[data-ref="product:kiosk"]'));
  assert.deepEqual((await spaces()).sa, ['kiosk', 'qm55c'], 'dropped on a product → before it');
  await prod('sa', 'qm55c').dragTo(prod('sa', 'kiosk'));
  await page.waitForFunction(async (id) => (await import('/src/repositories/proposals.js')).getProposal(id).spacePlan.spaces[0].products[0] === 'qm55c', PID);
  assert.deepEqual(await shown(), [['sa', ['qm55c', 'kiosk']], ['sb', []], ['sc', ['oh55a']], ['', ['ac360']]]);
  pass('dropping on a product puts it before that product — across spaces and within a space');

  // 미배치에서 공간으로 → 미배치 묶음이 사라진다 · 공간에서 미배치로 → 끄는 동안 미배치 묶음이 나타난다
  await prod('', 'ac360').dragTo(grp('sb').locator('.dss-grp-h'));
  await page.waitForFunction(() => !document.querySelector('.match-card .dss-grp.rest'));
  assert.deepEqual((await spaces()).sb, ['ac360']);
  const from = await prod('sb', 'ac360').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 });
  await card.locator('.dss-grp.rest').waitFor(); await shot('2-dragging-rest-appears');
  const rest = await card.locator('.dss-grp.rest').boundingBox();
  await page.mouse.move(rest.x + rest.width / 2, rest.y + rest.height / 2, { steps: 8 });
  await page.mouse.move(rest.x + rest.width / 2 + 4, rest.y + rest.height / 2, { steps: 2 });
  await card.locator('.dss-grp.rest.over').waitFor({ timeout: 5000 }); // 놓을 묶음이 밝아진다
  await page.mouse.up();
  await page.waitForFunction(() => !!document.querySelector('.match-card .dss-grp.rest .dss-prod[data-ref="product:ac360"]'));
  assert.deepEqual(await spaces(), { sa: ['qm55c', 'kiosk'], sb: [], sc: ['oh55a'] });
  pass('미배치 works both ways — its group appears while dragging out of a space and goes away when everything is placed');

  // 같은 제품을 여러 공간에 둔 경우 — 끈 쪽만 옮기고 다른 공간의 것은 그대로 · 이미 있는 공간에는 두 번 넣지 않는다
  await page.evaluate(async (id) => (await import('/src/repositories/proposals.js')).update(id, (d) => { d.spacePlan.spaces[2].products.push('qm55c'); }), PID);
  await prod('sc', 'qm55c').waitFor();
  await prod('sc', 'qm55c').dragTo(grp('sa').locator('.dss-grp-h'));
  await page.waitForFunction(() => !document.querySelector('.match-card .dss-grp[data-space="sc"] .dss-prod[data-ref="product:qm55c"]'));
  assert.deepEqual(await spaces(), { sa: ['kiosk', 'qm55c'], sb: [], sc: ['oh55a'] });
  pass('a product placed in several spaces: only the dragged copy moves, and a space never holds it twice');

  // 공간 구성 팝업이 열려 있으면 끌 수 없다
  await page.locator('#dss-space').click(); await page.locator('#spl-pop').waitFor();
  assert.equal(await card.locator('.dss-prod[draggable="true"]').count(), 0, 'no drag while the 공간 구성 popup is open');
  await page.locator('#spl-pop .bp-x').click(); await page.locator('#spl-pop').waitFor({ state: 'hidden' });
  assert.equal(await card.locator('.dss-prod[draggable="true"]').count(), 4);
  await shot('3-final');
  pass('dragging is off while the 공간 구성 popup is open');

  // 공간 구성이 없으면 끌 수 없다
  await page.evaluate(async (id) => (await import('/src/repositories/proposals.js')).update(id, (d) => { delete d.spacePlan; }), PID);
  await page.waitForFunction(() => !document.querySelector('.match-card .dss-grp'));
  assert.equal(await card.locator('.dss-prod[draggable="true"]').count(), 0);
  pass('without a 공간 구성 the product grid is not draggable');

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: true, checks, errors }, null, 2));
  console.log('match space drag ui ok ·', checks.length, 'checks');
} catch (error) { await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: false, checks, errors, error: String(error.stack || error) }, null, 2)); throw error; }
finally { await browser?.close(); await server.close(); api.kill('SIGTERM'); await new Promise((resolve) => (api.exitCode != null ? resolve() : api.once('close', resolve))); fs.rmSync(temporary, { recursive: true, force: true }); }
