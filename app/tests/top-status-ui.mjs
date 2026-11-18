// Storyboard 작업 상태 — 진행 · 실패 · 완료 알림은 오른쪽 아래 팝업이 아니라 상단 바 가운데 한 줄(테두리 없음)에 뜬다.
//   가장 급한 일 하나 + 나머지 개수 · 누르면 펼친 목록(서버 작업 카드 · 장 채우기 묶음) · 단추(멈추기 · 다시 시도) ·
//   상태가 나타나도 제목 · 오른쪽 버튼은 움직이지 않는다 · 상단 바를 덮는 모달(시트 상세)은 머리줄 가운데로 옮겨 오고,
//   덮지 않는 모달 위로는 어둡게 가려지지 않고 누를 수 있다 · 글은 줄바꿈 · 잘림 없이 한 줄(좁으면 말줄임 → 짧은 말 → 아이콘) ·
//   다른 화면은 예전처럼 오른쪽 아래 팝업. 모델 · 서버 없이 화면 계약만.
// 실행: CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node app/tests/top-status-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'app/tests/output/top-status'); fs.mkdirSync(out, { recursive: true });
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'top-status-test', auth_enabled: false } };
const fs1 = boot.catalog.layouts.filter((l) => l.p === 'products').map((l) => l.f);
const lay = (uid, i, extra) => ({ uid, f: fs1[i % fs1.length], status: 'empty', ov: { t: {}, img: {} }, ...extra });
const run = { version: 3, origin: 'compose', phase: 'running', key: 'k', request: 'r' };
const base = (id, title, parts) => ({ id, title, customer: '검증 고객', ind: 'FB', stage: 'story', reqTab: 'free', createdAt: 1, updatedAt: 1,
  req: { free: [{ t: '매장 메뉴보드를 본사에서 한 번에 바꾸고 싶다' }], form: {}, files: [] }, ctx: { products: ['qm55c'], solutions: [], cases: [] }, parts });
const busy = base('busy', '작업 상태 검증 — 프랜차이즈 매장 메뉴보드 통합 관리', [
  { id: 'part1', name: '제품 제안', type: 'products', done: true, items: [], layouts: [lay('a1', 0, { adaptation: run }), lay('a2', 1, { adaptation: { ...run, phase: 'queued' } })] },
  { id: 'part2', name: '도입 효과', type: 'effect', done: true, items: [], layouts: [lay('b1', 2, { adaptation: { ...run, phase: 'briefing' } })] },
]);
const quiet = base('quiet', '조용한 제안서', [{ id: 'q1', name: '제품 제안', type: 'products', done: true, items: [], layouts: [lay('q1a', 0, { status: 'done', ov: { t: { 0: '채운 제목' }, img: {} } })] }]);
const failed = base('failed', '실패 표시 검증', [{ id: 'f1', name: '제품 제안', type: 'products', done: true, items: [], layouts: [lay('f1a', 0, { adaptation: { ...run, phase: 'error', error: 'AI 요청 실패 (503)' } })] }]);
const job = { id: 'job-la-1', purpose: 'layout-auto', owner: { type: 'proposal', id: 'busy' }, title: '레이아웃 자동 구성', status: 'running', since: 0, events: [], createdAt: Date.now() };
const STEP = '2/5 목차 · 도입 효과에 맞는 레이아웃을 고르는 중';

const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const errors = []; const pass = (m) => console.log('PASS', m);
let browser;
// 글 깨짐 검사: 보이는 글이 (1) 말줄임 없이 잘렸거나 (2) 단어 가운데서 줄이 바뀌었는지 — 장(.slide) 안 글은 제외
const audit = (sel) => {
  const outs = [];
  for (const rootEl of document.querySelectorAll(sel)) {
    const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = n.nodeValue; const el = n.parentElement; if (!t.trim() || !el || el.closest('.slide, .sr')) continue;
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (r.width < 1 || cs.display === 'none' || cs.visibility === 'hidden') continue;
      for (let a = el, d = 0; a && d < 4; a = a.parentElement, d++) {
        const s = getComputedStyle(a);
        if (/hidden|clip/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 1 && s.textOverflow !== 'ellipsis') { outs.push('clip ' + a.className + ' ' + t.trim()); break; }
        if (/hidden|clip/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 4) { outs.push('clip-y ' + a.className + ' ' + t.trim()); break; }
        if (s.display !== 'inline') break;
      }
      if (/nowrap|^pre$/.test(cs.whiteSpace)) continue;
      const range = document.createRange(); let prev = null;
      for (let i = 0; i < t.length; i++) {
        if (/\s/.test(t[i])) continue; range.setStart(n, i); range.setEnd(n, i + 1); const rs = range.getClientRects(); if (!rs.length) continue;
        const top = Math.round(rs[0].top);
        if (prev !== null && top > prev + 2 && !/[\s·,(/-]$/.test(t.slice(0, i)) && !/^[()]/.test(t[i]) && !/\)$/.test(t.slice(0, i))) { outs.push('mid-word ' + t.slice(Math.max(0, i - 6), i) + '⏎' + t.slice(i, i + 6)); break; }
        prev = top;
      }
    }
  }
  return outs;
};
try {
  await server.listen();
  const url = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const cancels = [];
  const open = async (w, h, id) => {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await context.route((u) => !['127.0.0.1', 'localhost'].includes(u.hostname), (r) => r.abort());
    await context.route((u) => u.pathname.startsWith('/api/'), (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/bootstrap') return r.fulfill({ json: boot });
      if (u.pathname === '/api/jobs/job-la-1/cancel') { cancels.push(1); return r.fulfill({ json: { ok: true, status: 'running' } }); }
      if (u.pathname === '/api/jobs/job-la-1') return r.fulfill({ json: { id: 'job-la-1', status: 'running', next_seq: 3, events: [{ seq: 1, t: 0.4, type: 'state', status: 'running' }, { seq: 2, t: 3.1, type: 'text', message: STEP }] } });
      return new Promise(() => {}); // 장 채우기 요청은 답하지 않는다 — 계속 진행 중
    });
    await context.addInitScript(([list, j, pid]) => { if (sessionStorage.getItem('__seeded')) return;
      localStorage.setItem('winmate.v2.proposals', JSON.stringify(list)); localStorage.setItem('winmate.v2.jobs', JSON.stringify([j]));
      localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'proposal', id: pid } })); sessionStorage.setItem('__seeded', '1'); }, [[busy, quiet, failed], job, id]);
    const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message)); page.setDefaultTimeout(20000);
    await page.goto(url); await page.locator('.pr-top').waitFor({ timeout: 60000 });
    return { context, page };
  };
  const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  // 테두리 없는 UI — 도는 아이콘(.ts-spin 은 고리 모양 아이콘)은 상자가 아니라 빼고 본다
  const noBorder = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((el) => !el.matches('.ts-spin, .ajc .spin')).filter((el) => { const c = getComputedStyle(el); return ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(c['border' + k + 'Width']) > 0 && c['border' + k + 'Style'] !== 'none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(c['border' + k + 'Color'])); }).map((el) => el.className), sel);

  // 1) 작업 중인 Storyboard — 오른쪽 아래 팝업 없음 · 상단 바 가운데 한 줄
  for (const [w, h] of [[1680, 1000], [1280, 800]]) {
    const { context, page } = await open(w, h, 'busy');
    const bar = page.locator('.pr-top .ts-bar');
    await bar.filter({ hasText: STEP }).waitFor();
    await page.locator('[data-layout-uid="b1"]').waitFor(); await page.waitForTimeout(800);
    assert.equal(await page.locator('.feedback-popups, .feedback-popup').count(), 0, '오른쪽 아래 알림 팝업이 없어야 함');
    assert.match(await bar.innerText(), /레이아웃 자동 구성/); assert.match(await bar.innerText(), /\+2/);
    const b = await rect(page, '.pr-top .ts-bar'), top = await rect(page, '.pr-top');
    assert.ok(Math.abs(b.x + b.w / 2 - (top.x + top.w / 2)) <= 3, '상단 바 가운데 ' + JSON.stringify({ b, top }));
    assert.ok(b.h <= 34 && b.y >= top.y && b.y + b.h <= top.y + top.h, '한 줄 · 상단 바 안');
    assert.deepEqual(await noBorder(page, '.ts-bar, .ts-bar *'), [], '테두리 없는 UI');
    assert.deepEqual(await page.evaluate(audit, '.pr-top'), [], '상단 바 글 깨짐');
    // 제목은 다 보이고(잘리지 않음) 지금 단계는 남는 자리만큼
    assert.equal(await page.locator('.pr-top .ts-head').evaluate((el) => el.scrollWidth <= el.clientWidth), true, '제목은 잘리지 않음');
    await page.screenshot({ path: path.join(out, `busy-${w}.png`) });

    // 펼친 목록: 서버 작업 카드 · 장 채우기 묶음(장마다가 아니라 한 줄) · 테두리 없음 · 글 깨짐 없음
    await page.locator('.pr-top .ts-text').click(); const panel = page.locator('.ts-panel'); await panel.waitFor(); await page.waitForTimeout(250);
    assert.equal(await panel.locator('.ts-row').count(), 3);
    assert.equal(await panel.locator('.ts-card .ajc').count(), 1);
    assert.equal(await panel.locator('.ts-row', { hasText: '레이아웃 2장 채우는 중' }).count(), 1);
    assert.equal(await panel.locator('.ts-row', { hasText: '1장에 넣을 내용 추론 중' }).count(), 1);
    assert.match(await panel.locator('.ajc-s').innerText(), new RegExp(STEP), '카드 안 지금 단계는 자르지 않고 다 보임');
    assert.deepEqual(await noBorder(page, '.ts-panel, .ts-row, .ts-row > *, .ts-card > .ajc'), []);
    assert.deepEqual(await page.evaluate(audit, '.ts-panel'), [], '펼친 목록 글 깨짐');
    const pr = await rect(page, '.ts-panel'); assert.ok(pr.x >= 0 && pr.x + pr.w <= w && pr.y > b.y + b.h - 1);
    await page.screenshot({ path: path.join(out, `panel-${w}.png`) });
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' });

    // 멈추기 — 서버 작업 취소 요청
    const before = cancels.length;
    await bar.getByRole('button', { name: '멈추기', exact: true }).click();
    await page.waitForTimeout(400);
    assert.equal(cancels.length, before + 1, '멈추기 = 작업 취소 요청');

    // 상단 바를 덮는 시트 상세 → 그 머리줄 가운데로 옮겨 오고, 닫으면 돌아간다
    await page.locator('[data-layout-uid="a1"]').click(); const sheet = page.locator('.modal.sheet'); await sheet.waitFor(); await page.waitForTimeout(700);
    await sheet.locator('.mhead .ts-bar').filter({ hasText: '레이아웃 자동 구성' }).waitFor();
    assert.equal(await page.locator('.pr-top .ts-bar').count(), 0, '덮인 상단 바에는 없음');
    const mh = await rect(page, '.modal.sheet .mhead'), mb = await rect(page, '.modal.sheet .mhead .ts-bar');
    assert.ok(mb.y >= mh.y && mb.y + mb.h <= mh.y + mh.h, '머리줄 안');
    assert.deepEqual(await page.evaluate(audit, '.modal.sheet .mhead'), [], '머리줄 글 깨짐');
    await page.screenshot({ path: path.join(out, `sheet-${w}.png`) });
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    await page.locator('.pr-top .ts-bar').waitFor();
    pass(`${w}px — 오른쪽 아래 팝업 없음 · 상단 가운데 한 줄 · +개수 · 펼친 목록(작업 카드 · 장 묶음) · 멈추기 · 시트 상세 머리줄로 이동 · 테두리 · 글 깨짐 없음`);
    await context.close();
  }

  // 2) 조용한 화면: 상태가 나타났다 사라져도 제목 · 오른쪽 버튼 자리는 그대로 · 긴 글은 말줄임(한 줄) · 덮지 않는 모달 위에서도 누를 수 있다
  {
    const { context, page } = await open(1280, 800, 'quiet');
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.pr-top .ts-bar').count(), 0);
    const t0 = await rect(page, '#pr-title'), r0 = await rect(page, '.pr-top .top-right'), top0 = await rect(page, '.pr-top');
    await page.evaluate(async () => { const { notify } = await import('/src/services/notifications.js'); window.__n = notify('아주 긴 진행 안내 문장이 상단 바 가운데 자리보다 길어도 줄이 바뀌거나 칸 밖으로 넘치지 않고 한 줄 말줄임으로 남아야 해요 · 단계 설명까지 길게 붙여 봅니다', 'progress', { duration: 0 }); });
    const bar = page.locator('.pr-top .ts-bar'); await bar.waitFor();
    assert.deepEqual([await rect(page, '#pr-title'), await rect(page, '.pr-top .top-right'), await rect(page, '.pr-top')], [t0, r0, top0], '상태가 나타나도 다른 것은 움직이지 않음');
    const cell = await rect(page, '.pr-top .pr-status'), b = await rect(page, '.pr-top .ts-bar');
    assert.ok(b.x >= cell.x - 1 && b.x + b.w <= cell.x + cell.w + 1 && b.h <= 34, '가운데 칸 안 한 줄 ' + JSON.stringify({ cell, b }));
    assert.equal(await page.locator('.pr-top .ts-head').evaluate((el) => getComputedStyle(el).textOverflow), 'ellipsis');
    assert.deepEqual(await page.evaluate(audit, '.pr-top'), []);
    await page.evaluate(async () => { const { notify } = await import('/src/services/notifications.js'); notify('목차를 지웠어요'); });
    await bar.filter({ hasText: '목차를 지웠어요' }).waitFor(); // 방금 알림은 진행 중보다 앞
    await page.evaluate(async () => { const { dismissNotification, notificationSnapshot } = await import('/src/services/notifications.js'); notificationSnapshot().forEach((n) => dismissNotification(n.id)); });
    await bar.waitFor({ state: 'detached' });
    assert.deepEqual([await rect(page, '#pr-title'), await rect(page, '.pr-top .top-right')], [t0, r0], '사라져도 그대로');
    // 덮지 않는 모달(PPTX 내보내기) 위: 상태 줄은 가려지지 않고 눌린다 (지우기 확인처럼 모든 것 위에 뜨는 확인 창은 예외)
    await page.evaluate(async () => { const { notify } = await import('/src/services/notifications.js'); notify('레이아웃을 채우는 중', 'progress', { id: 'p1', duration: 0, actionLabel: '작업 취소', onAction: () => { window.__cancelled = 1; } }); });
    await page.locator('.lay-toggle').click(); await page.getByRole('button', { name: /PPTX 내보내기/ }).first().click();
    const dialog = page.locator('.mback .modal.narrow'); await dialog.waitFor(); await page.waitForTimeout(400);
    assert.equal(await dialog.locator('.top-status').count(), 0, '상단 바를 덮지 않는 모달은 제 자리를 열지 않음');
    const hit = await page.evaluate(() => { const b = document.querySelector('.pr-top .ts-bar'); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + 20, r.y + r.height / 2); return !!(e && e.closest('.ts-bar')); });
    assert.equal(hit, true, '모달 뒤 어두운 막 위로 상태 줄이 보이고 눌림');
    await page.locator('.pr-top .ts-bar').getByRole('button', { name: '작업 취소' }).click();
    assert.equal(await page.evaluate(() => window.__cancelled), 1);
    await page.screenshot({ path: path.join(out, 'over-modal.png') });
    assert.equal(await dialog.isVisible(), true, '상태 줄을 눌러도 모달은 닫히지 않음');
    pass('상태가 나타났다 사라져도 상단 바 다른 것은 그대로 · 긴 글 한 줄 말줄임 · 방금 알림이 진행보다 앞 · 덮지 않는 모달 위에서 보이고 눌림');
    await context.close();
  }

  // 3) 실패한 장: 빨간 ! · '레이아웃 1장을 채우지 못했어요 · 이유' · 다시 시도 · 닫기
  {
    const { context, page } = await open(1680, 1000, 'failed');
    const bar = page.locator('.pr-top .ts-bar'); await bar.filter({ hasText: '레이아웃 1장을 채우지 못했어요' }).waitFor();
    assert.match(await bar.innerText(), /AI 요청 실패 \(503\)/);
    assert.equal(await bar.getAttribute('role'), 'alert');
    await bar.getByRole('button', { name: '다시 시도', exact: true }).waitFor();
    assert.equal(await page.locator('.feedback-popup').count(), 0);
    await page.screenshot({ path: path.join(out, 'failed.png') });
    await bar.getByRole('button', { name: '알림 닫기' }).click(); await bar.waitFor({ state: 'detached' });
    pass('실패는 상단 줄에 빨간 표시 · 이유 · 다시 시도 · 닫기');
    // 다른 화면은 예전처럼 오른쪽 아래 팝업
    await page.evaluate(async () => { const { saveUi, loadUi } = await import('/src/repositories/proposals.js'); saveUi({ ...loadUi(), route: { name: 'home' } }); history.replaceState(null, '', '/'); });
    await page.reload(); await page.waitForTimeout(1200);
    assert.equal(await page.locator('.pr-top').count(), 0);
    await page.evaluate(async () => { const { notify } = await import('/src/services/notifications.js'); notify('다른 화면 알림', 'error'); });
    await page.locator('.feedback-popups .feedback-popup', { hasText: '다른 화면 알림' }).waitFor();
    pass('Storyboard 밖 화면은 그대로 오른쪽 아래 팝업');
    await context.close();
  }

  // 4) 좁은 화면: 둘째 줄 왼쪽 · 아주 좁으면 아이콘 · 개수만 · 화면 밖으로 넘치지 않음 · 펼친 목록은 화면 안
  for (const [w, h] of [[900, 900], [600, 900], [390, 844]]) {
    const { context, page } = await open(w, h, 'busy');
    const bar = page.locator('.pr-top .ts-bar'); await bar.waitFor(); await page.locator('[data-layout-uid="b1"]').waitFor(); await page.waitForTimeout(800);
    const b = await rect(page, '.pr-top .ts-bar'), right = await rect(page, '.pr-top .top-right'), title = await rect(page, '#pr-title');
    assert.ok(b.y >= title.y + title.h - 1, '제목 아래 줄'); assert.ok(b.x + b.w <= right.x + 1, '오른쪽 버튼과 겹치지 않음 ' + JSON.stringify({ b, right }));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(await page.evaluate(audit, '.pr-top'), [], `${w}px 상단 바 글 깨짐`);
    if (w === 390) assert.equal(await page.locator('.pr-top .ts-full').isVisible(), false, '아주 좁으면 글 대신 아이콘 · 개수');
    await page.locator('.pr-top .ts-text').click(); await page.locator('.ts-panel').waitFor(); await page.waitForTimeout(250);
    const pr = await rect(page, '.ts-panel'); assert.ok(pr.x >= 0 && pr.x + pr.w <= w, '펼친 목록은 화면 안');
    assert.deepEqual(await page.evaluate(audit, '.ts-panel'), [], `${w}px 펼친 목록 글 깨짐`);
    await page.screenshot({ path: path.join(out, `narrow-${w}.png`) });
    await context.close();
  }
  pass('900 · 600 · 390px — 제목 아래 줄 · 버튼과 겹치지 않음 · 넘침 없음 · 아주 좁으면 아이콘 · 개수 · 펼친 목록 화면 안');

  assert.deepEqual(errors, []);
} finally {
  if (browser) await browser.close();
  await server.close();
}
