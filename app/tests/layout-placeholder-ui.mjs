// 자리표시([00] · [확인 필요] …)는 제안서에 남기지 않는다 — 실제 채우기 흐름(layout-context.js)에서 확인한다. 모델 답은 정해 둔 값이다.
//   1. 열어 본 제안서의 장에 자리표시가 있으면(자동 구성이 쓴 장 · 예전에 저장한 장 포함) 다시 채우기가 걸린다. 열지 않은 제안서는 건드리지 않는다.
//   2. 문장 칸은 수치 자리만 빠진다('월 전기료 [00]% 절감' → '월 전기료 절감') — 레이아웃은 그대로다.
//   3. 숫자만 들어가는 칸을 채우지 못하면 그 장의 레이아웃이 숫자가 필요 없는 레이아웃으로 바뀐다(머리말 · 바닥글 · 쪽 번호는 옮겨 온다).
//   4. 근거가 있어 숫자가 모두 채워지면 레이아웃은 바뀌지 않는다.
//   5. 바꿀 레이아웃이 이미 덱에 있으면 그 칸(과 딸린 단위 칸)을 비운다.
//   6. 채우기가 실패해도 자리표시는 남지 않는다.
//   CHROME 없이: node --import <시스템 Chrome preload> app/tests/layout-placeholder-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: json('catalog'), products: json('products_db'), images: json('images'), capabilities: null, user: { username: 'placeholder-test', auth_enabled: false } };
const details = JSON.parse(fs.readFileSync(path.join(root, 'reference/live/img/prod/d00.json'), 'utf8'));
const out = path.join(root, 'app/tests/output/layout-placeholder'); fs.mkdirSync(out, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), cacheDir: path.join(root, '.wm_tmp/vite-layout-placeholder'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const results = [], errors = []; let browser, page;
const pass = name => { results.push(name); console.log('PASS ' + name); };

// 모델 대역: 글 — 칸마다 texts에 적힌 값(없으면 지금 글 그대로 = "채울 근거가 없다"), 사진 — 후보가 있으면 첫 후보, 없으면 비움.
// 새로 바뀐 레이아웃(REWRITE)은 견본 글(다른 업종 · 다른 제품)을 이 고객의 글로 모두 바꿔 쓴다 — 실제 모델이 하는 일이다.
let texts = {}, fail = false, calls = [];
const REWRITE = /Value Props|고객 과제/;
const textAnswer = input => ({ blocks: input.blocks.map(b => {
  if (REWRITE.test(input.layout?.name || '')) return { i: b.i, action: 'replace', s: ('무인 매장 공조 자동화').slice(0, Math.max(4, b.max - 1)), src: [], reason: 'test fixture' };
  return { i: b.i, action: texts[b.current] === undefined ? 'keep' : 'replace', s: texts[b.current] ?? b.current, src: [], reason: 'test fixture' };
}), images: [], replacements: [], missing: [] });
const imageAnswer = input => ({ blocks: [], images: input.images.map(im => ({ i: im.i, action: im.candidates.length ? 'replace' : 'clear', n: 0, reason: 'test fixture' })), replacements: [], missing: [] });

// 자동 구성이 쓴 장(실제 제안서 pkk8lwx2의 글) — 목차 템플릿 '투자 회수형'
const FOOT = 'J 스크린골프 · 다점포 무인 매장 에너지 절감 · 공조 자동화';
const SHEETS = {
  summary: { f: 'L_TOC_SUMMARY', t: { 0: '01 · 제안 요약', 1: '무인 매장의 에너지 낭비와 운영 부담', 3: '빈 타석 냉난방', 4: '공조 자동 정지', 5: '점주 운영 부담', 7: '기존 설비 활용', 8: '원격 자동 관리', 9: '다점포 통합 제어',
    11: '월 전기료 [00]% 절감', 12: '방문 횟수 [00]% 절감', 13: '장애 대응 [00]% 개선', 15: '직영 3개 매장 착수', 17: FOOT, 18: 'CONFIDENTIAL · 4' } },
  profile: { f: 'L_TOC_UAPROF', t: { 0: '02 · 당사의 이해 · 고객사 분석', 1: 'J 스크린골프, 지금 이런 규모로 움직입니다', 2: '운영 매장', 3: '140', 4: '개', 5: '일일 이용객', 6: '[00]', 7: '명', 8: '매장당 근무 인원', 9: '[00]', 10: '명',
    11: '월 전기료', 12: '[00]', 13: '만 원', 15: FOOT, 16: 'CONFIDENTIAL · 6' } },
  kpi: { f: 'L_TOC_KPI', t: { 0: '04 · 기대 효과', 1: '월 전기료 절감액과 투자 회수 기간', 2: '월 전기료 절감액', 7: '도입 후 · 만 원', 8: '방문 점검 횟수', 13: '도입 후 · 회', 14: '원격 제어 대응 시간', 19: '도입 후 · 시간',
    20: '점주 관리 시간', 25: '도입 후 · 시간', 27: FOOT, 28: 'CONFIDENTIAL · 11' } },
  cost: { f: 'L_TOC_TCO', t: { 0: '05 · 비용 · 구매', 6: '직영 매장', 11: '초기 비용이 부담될 때', 16: '가맹 · 빠른 확산', 22: FOOT, 23: 'CONFIDENTIAL · 13' } },
};
const PH = /\[\s*(?:[0-9][0-9.,/ ]*|확인 필요[^\]]*|N)?\s*\]/;

try {
  await server.listen(); browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname.startsWith('/api/product-packs/')) return route.fulfill({ json: details });
    if (url.pathname === '/api/llm') {
      const body = route.request().postDataJSON(), prompt = body.prompt || '';
      const kind = prompt.includes('선택된 레이아웃 한 장') ? 'text' : prompt.includes('사진 칸을 채웁니다') ? 'image' : '';
      if (!kind || fail) return route.fulfill({ status: 503, json: { code: 'unavailable', message: 'test: model unavailable' } });
      const input = JSON.parse(prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]);
      calls.push({ kind, layout: input.layout?.name || input.sheet?.layout, rules: prompt.split('<<<DATA\n')[0] });
      try { return await route.fulfill({ json: { mode: 'real', data: kind === 'text' ? textAnswer(input) : imageAnswer(input) } }); } catch { return; }
    }
    return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  await context.route('**/img/**', route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.join(root, rel.startsWith('img/lib/') ? rel : 'app/data/static/' + rel);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
  });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(30000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port); await page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'));

  /** 자동 구성이 끝난 제안서를 만든다(장은 origin 'compose' · phase 'ready') — 아직 열지는 않는다 */
  const make = (names, extra = [], saved = false) => page.evaluate(async ({ names, extra, SHEETS, saved }) => {
    const repo = await import('/src/repositories/proposals.js'); window.__repo = repo;
    const id = repo.createProposal();
    repo.update(id, p => {
      p.title = '다점포 무인 매장 에너지 절감 · 공조 자동화'; p.customer = 'J 스크린골프'; p.ind = 'SV'; p.stage = 'story';
      p.req.free = [{ t: '스크린골프 무인 매장 140곳을 운영한다. 빈 타석에도 공조가 돌아 전기료가 오른다. 직영 3개 매장에서 4주 실측 파일럿을 한다.' }];
      p.ctx.products = ['ac360']; p.ctx.solutions = ['sac'];
      // saved: 아직 이 고객에 맞게 쓴 적 없는 장(새로 넣은 장처럼 일반 채우기를 거친다) · 아니면 자동 구성이 이미 쓴 장
      const sheet = (uid, f, t) => ({ uid, f, status: 'done', ov: { t: { ...t }, img: {} }, adaptation: saved ? { version: 3, origin: 'history', phase: 'retained' } : { version: 3, origin: 'compose', phase: 'ready' } });
      p.parts = [{ id: 'part-a', name: '당사의 이해', type: 'customer', items: [], done: true, layouts: [...names.map(n => sheet(n, SHEETS[n].f, SHEETS[n].t)), ...extra.map(([uid, f]) => sheet(uid, f, {}))] }];
    });
    return id;
  }, { names, extra, SHEETS, saved });
  const open = id => page.evaluate(async id => { const { ensureLayoutContext } = await import('/src/services/layout-context.js'); ensureLayoutContext(window.__repo.getProposal(id)); }, id);
  const sheets = id => page.evaluate(async id => {
    const { layoutHtml } = await import('/src/services/catalog.js'), { applyOverrides } = await import('/src/domain/slides/Slide.jsx'), { TOC_SLOTS } = await import('/src/domain/templates/toc_layouts.js');
    return Object.fromEntries(window.__repo.getProposal(id).parts[0].layouts.map(x => {
      const host = document.createElement('div'); host.innerHTML = layoutHtml(x.f); applyOverrides(host.firstElementChild, x.ov);
      const cells = Object.fromEntries([...host.querySelectorAll('[data-tb]')].map(e => [e.getAttribute('data-tb'), e.textContent.replace(/\s+/g, ' ').trim()]));
      return [x.uid, { f: x.f, status: x.status, phase: x.adaptation?.phase, origin: x.adaptation?.origin, swappedFrom: x.adaptation?.swappedFrom || null, missing: x.adaptation?.missing || [], error: x.adaptation?.error || '', text: host.textContent, cells,
        named: Object.fromEntries(Object.entries(TOC_SLOTS[x.f]?.t || {}).map(([name, i]) => [name, x.ov?.t?.[i]])) }];   // 이름 붙은 칸의 값(바닥글 · 쪽 번호 칸은 화면에서 지워지지만 값은 장에 남는다)
    }));
  }, id);
  const settled = async (id, timeout = 90000) => {
    await page.waitForFunction(id => { const p = window.__repo.getProposal(id); return p.parts[0].layouts.every(x => !['queued', 'running'].includes(x.adaptation?.phase)); }, id, { timeout, polling: 250 });
    await page.waitForTimeout(700);   // 다시 걸리는 장이 없는지
    await page.waitForFunction(id => window.__repo.getProposal(id).parts[0].layouts.every(x => !['queued', 'running'].includes(x.adaptation?.phase)), id, { timeout, polling: 250 });
    return sheets(id);
  };

  // ---- 1. 열기 전에는 그대로, 열면 자리표시가 있는 장만 다시 채우기가 걸린다 ----
  const first = await make(['summary', 'profile', 'kpi', 'cost'], [['plain', 'L_TOC_TECH1']]);
  await page.waitForTimeout(900);
  let before = await sheets(first);
  assert(Object.values(before).every(x => x.phase === 'ready' && x.origin === 'compose'), 'a proposal that was not opened is left alone');
  assert(PH.test(before.summary.text) && PH.test(before.profile.text) && PH.test(before.kpi.text) && PH.test(before.cost.text), 'the fixture carries placeholders');
  assert.equal(PH.test(before.plain.text), false);
  texts = {}; calls = [];
  await open(first);
  let after = await settled(first);
  await page.screenshot({ path: path.join(out, 'resolved.png') });
  for (const [uid, x] of Object.entries(after)) assert.equal(PH.test(x.text), false, `${uid} (${x.f}) still shows a placeholder: ${(x.text.match(PH) || [])[0]}`);
  assert.equal(after.plain.origin, 'compose', 'a sheet without placeholders is not filled again'); assert.equal(after.plain.phase, 'ready');
  for (const uid of ['summary', 'profile', 'kpi', 'cost']) assert.equal(after[uid].origin, 'placeholder', uid);
  pass('opening a proposal sends its sheets with placeholders — and only those — through the fill again; none is left afterwards');

  // ---- 2. 문장 칸: 수치 자리만 빠지고 레이아웃은 그대로 ----
  assert.equal(after.summary.f, 'L_TOC_SUMMARY');
  assert.deepEqual([after.summary.cells[11], after.summary.cells[12], after.summary.cells[13]], ['월 전기료 절감', '방문 횟수 절감', '장애 대응 개선']);
  assert.equal(after.summary.cells[15], '직영 3개 매장 착수', 'a cell with a real figure is untouched');
  assert.equal(after.cost.f, 'L_TOC_TCO', 'the cost sheet has no stand-in — it keeps its layout');
  // 금액이 빠지면 항목 이름만 남는 칸('일시 구매 [00]' → 위 칸과 같은 '일시 구매')은 비우고, 값이 모두 빈 줄의 이름표('5년 총소유비용')도 비운다
  assert.deepEqual([after.cost.cells[17], after.cost.cells[18], after.cost.cells[19], after.cost.cells[20]], ['', '', '', '']);
  assert.equal(after.cost.cells[2], '일시 구매', 'the option title itself stays');
  assert(after.cost.missing.some(m => /비웠어요/.test(m)) && after.cost.phase === 'review');
  // 이미 이 고객에 맞게 쓴 장은 다시 쓰지 않는다 — 나머지 칸은 글자 하나 바뀌지 않고, 이 장들 때문에 모델을 부르지도 않는다
  for (const i of [1, 3, 4, 5, 7, 8, 9]) assert.equal(after.summary.cells[i], SHEETS.summary.t[i], 'summary cell ' + i);
  assert.equal(calls.some(c => /제안 요약|구매 방식/.test(c.layout || '')), false, 'no model call for a sheet that only needed its figures taken out: ' + calls.map(c => c.layout).join(', '));
  pass('a phrase keeps its meaning without the missing figure; the layout and every other cell stay, with no model call');

  // ---- 3. 숫자만 들어가는 칸을 못 채운 장: 레이아웃을 바꾼다 ----
  assert.equal(after.profile.f, 'L_TOC_UAPAIN', 'customer figures → customer challenges'); assert.equal(after.profile.swappedFrom, 'L_TOC_UAPROF');
  assert.equal(after.profile.cells[0], '02 · 당사의 이해 · 고객사 분석', 'the eyebrow moves to the new layout');
  assert.deepEqual([after.profile.named.foot, after.profile.named.conf], [FOOT, 'CONFIDENTIAL · 6'], 'footer and page number move to the new layout');
  assert.equal(after.kpi.f, 'L_TOC_VP3', 'before/after figures → value cards'); assert.equal(after.kpi.swappedFrom, 'L_TOC_KPI');
  assert.equal(after.kpi.cells[0], '04 · 기대 효과'); assert.deepEqual([after.kpi.named.foot, after.kpi.named.conf], [FOOT, 'CONFIDENTIAL · 11']);
  assert(['ready', 'review'].includes(after.profile.phase) && ['ready', 'review'].includes(after.kpi.phase));
  assert(calls.some(c => c.kind === 'text' && /고객 과제/.test(c.layout || '')), 'the new layout is filled for this customer by the model');
  pass('a sheet whose figure-only cells cannot be filled changes to a layout that needs no figures, keeping its eyebrow, footer and page number');

  // ---- 4. 근거가 있어 숫자를 모두 채우면 레이아웃은 그대로 ----
  const second = await make(['profile'], [], true);
  texts = { '[00]': '3' };   // 요구사항에 있는 숫자(직영 3개 매장) — 뜻이 맞는지는 이 테스트가 보는 것이 아니다
  await open(second); after = await settled(second);
  assert.equal(after.profile.f, 'L_TOC_UAPROF', 'every figure was filled from the requirement — the layout stays'); assert.equal(after.profile.swappedFrom, null);
  assert.equal(PH.test(after.profile.text), false);
  assert.equal(after.profile.origin, 'added', 'the ordinary fill of a new sheet');
  pass('a sheet that goes through the ordinary fill and gets every figure from the evidence keeps its layout');

  // ---- 5. 바꿀 레이아웃이 이미 덱에 있다: 그 칸과 단위 칸을 비운다 ----
  const third = await make(['profile'], [['taken', 'L_TOC_UAPAIN']]);
  texts = {}; await open(third); after = await settled(third);
  assert.equal(after.profile.f, 'L_TOC_UAPROF', 'the stand-in is already in the deck');
  assert.equal(PH.test(after.profile.text), false);
  assert.deepEqual([after.profile.cells[3], after.profile.cells[4]], ['140', '개'], 'a filled figure and its unit stay');
  assert.deepEqual([after.profile.cells[6], after.profile.cells[7], after.profile.cells[9], after.profile.cells[10], after.profile.cells[12], after.profile.cells[13]], ['', '', '', '', '', ''], 'an unfilled figure and its unit are emptied');
  assert(after.profile.missing.some(m => /비웠어요/.test(m)), 'the user is told which cells were emptied: ' + JSON.stringify(after.profile.missing));
  assert.equal(after.profile.phase, 'review');
  pass('with no layout to change to, the figure cell and its unit are emptied and the sheet asks for a check');

  // ---- 6. 채우기가 실패해도 자리표시는 남지 않는다 ----
  fail = true;
  const fourth = await make(['summary', 'profile']); await open(fourth); after = await settled(fourth);
  for (const [uid, x] of Object.entries(after)) assert.equal(PH.test(x.text), false, `${uid} still shows a placeholder when the model is down`);
  assert.equal(after.summary.cells[11], '월 전기료 절감'); assert.equal(after.profile.f, 'L_TOC_UAPROF', 'no layout change without the model'); assert.equal(after.profile.cells[6], '');
  const fifth = await make(['summary', 'profile'], [], true); await open(fifth); after = await settled(fifth);
  for (const [uid, x] of Object.entries(after)) { assert.equal(PH.test(x.text), false, `${uid} still shows a placeholder after a failed fill`); assert.equal(x.phase, 'error', uid); }
  assert.equal(after.summary.cells[11], '월 전기료 절감'); assert.equal(after.profile.f, 'L_TOC_UAPROF');
  fail = false;
  pass('with the model down the placeholders are still removed (figures only, no layout change); a sheet whose fill failed shows the error for a retry');

  // ---- 7. 열어 둔 제안서에 자동 구성 결과가 새로 들어와도(목차별로 끝나는 대로 들어온다) 자리표시가 있는 장은 바로 정리된다 ----
  const sixth = await make([], [['plain', 'L_TOC_TECH1']]); texts = {}; calls = [];
  await open(sixth); await page.waitForTimeout(600);
  await page.evaluate(({ id, SHEETS }) => window.__repo.update(id, p => {
    p.parts.push({ id: 'part-b', name: '제안 요약', type: 'overview', items: [], done: true,
      layouts: [{ uid: 'late', f: SHEETS.summary.f, status: 'done', ov: { t: { ...SHEETS.summary.t }, img: {} }, adaptation: { version: 3, origin: 'compose', phase: 'ready' } }] });
  }), { id: sixth, SHEETS });
  await page.waitForFunction(id => { const x = window.__repo.getProposal(id).parts[1].layouts[0]; return x.adaptation?.origin === 'placeholder' && !['queued', 'running'].includes(x.adaptation.phase); }, sixth, { timeout: 60000, polling: 250 });
  const late = await page.evaluate(id => window.__repo.getProposal(id).parts[1].layouts[0], sixth);
  assert.deepEqual([late.ov.t[11], late.ov.t[12], late.ov.t[13]], ['월 전기료 절감', '방문 횟수 절감', '장애 대응 개선']); assert.equal(late.f, 'L_TOC_SUMMARY'); assert.equal(calls.length, 0);
  pass('a compose result that arrives while the proposal is open is cleaned at once');

  assert.deepEqual(errors, [], errors.join(' | '));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ok: true, results }, null, 2));
  console.log(`${results.length}/${results.length} layout placeholder checks passed`);
} catch (error) {
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ok: false, results, errors, error: String(error?.stack || error) }, null, 2));
  throw error;
} finally { await browser?.close(); await server.close(); }
