// Storyboard 'PPT 레이아웃 추가' — 고르면 바로 닫힘 · 목차에 속한 레이아웃 먼저 추천 · 같은 레이아웃 다시 넣기 ·
// 직접 넣은 장의 방향 추론(shimmer) → 카드 가운데 '!' → 확인 팝업(@태그 편집칸, 바로 고쳐 쓰기) → 확인하고 진행 → 다시 shimmer · 그 방향으로 채우기.
// Test-only model answers exercise the flow (held until the test releases them), not model quality.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'brief-test', auth_enabled: false } };
const details = path.join(root, 'reference/live/img/prod/d00.json');
const output = path.join(root, 'app/tests/output/layout-brief');
fs.mkdirSync(output, { recursive: true });
const SECOND = boot.catalog.products.find(p => p.id !== 'qm55c' && p.model && /^Q/.test(p.model) && !p.retired)?.id || boot.catalog.products.find(p => p.id !== 'qm55c').id;
const SOLUTION = boot.catalog.solutions[0].id;
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
let browser, page, briefMode = 'normal';
const errors = [], checks = [], briefCalls = [], fillCalls = [], briefHeld = [], fillHeld = [];
const pass = message => { checks.push(message); console.log('PASS ' + message); };
const until = async (fn, label, ms = 20000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out: ' + label); await new Promise(r => setTimeout(r, 40)); } };
const dataOf = prompt => JSON.parse(prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]);
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname.startsWith('/api/product-packs/') && fs.existsSync(details)) return route.fulfill({ path: details });
    if (url.pathname === '/api/llm') {
      const prompt = route.request().postDataJSON().prompt || '';
      if (prompt.includes('이 장에 무엇을 담을지 방향을 잡으세요')) {
        const input = dataOf(prompt); briefCalls.push(input);
        if (briefMode === 'error') return route.fulfill({ status: 503, json: { code: 'unavailable', message: '검증용 추론 실패' } });
        await new Promise(resolve => briefHeld.push(resolve));
        // a product the other sheet of the part does not cover yet, and the solution
        const covered = new Set(input.others.flatMap(o => o.items));
        const product = input.items.find(i => i.kind === '제품' && !covered.has(i.key)) || input.items.find(i => i.kind === '제품');
        const solution = input.items.find(i => i.kind === '솔루션');
        const focus = [product.key, solution.key];
        try { await route.fulfill({ json: { mode: 'real', data: { focus, message: '로비 안내를 한 화면에서 바꾸는 운영', points: ['@' + product.key + ' ' + product.model + '로 로비 안내 화면을 바꿉니다', solution.name + '로 여러 화면의 콘텐츠를 한 번에 관리합니다'] } } }); } catch { /* cancelled */ }
        return;
      }
      fillCalls.push({ prompt, input: dataOf(prompt) });
      await new Promise(resolve => fillHeld.push(resolve));
      try { await route.fulfill({ status: 503, json: { code: 'unavailable', message: '검증용 채우기 중단' } }); } catch { /* cancelled */ }
      return;
    }
    return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  await context.route('**/img/**', route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.join(root, rel.startsWith('img/lib/') ? rel : 'app/data/static/' + rel);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
  });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'));

  // ---- 추천: 미리 정한 유형의 목차는 그 목차에 속하는 레이아웃 먼저 · 그 밖의 목차는 기존 추천 그대로 ----
  const rec = await page.evaluate(async () => {
    const { recommendForPart, recommendLayouts } = await import('/src/services/search.js');
    const { loadLayoutHtml } = await import('/src/services/catalog.js'); await loadLayoutHtml();
    const out = {};
    for (const type of ['value', 'why', 'case', 'products', 'market']) {
      const part = { id: 'x', type, name: '경쟁사 대비 비교와 도입 효과', items: ['타사 비교', '비용 절감 효과'], layouts: [] };
      const own = recommendLayouts(part, {}, Infinity).filter(r => r.l.p === type).length;
      out[type] = { own, picked: recommendForPart(part, {}, 3).map(r => r.l.p), before: recommendLayouts(part, {}, 3).map(r => r.l.p) };
    }
    const free = { id: 'f', type: 'free', name: '경쟁사 대비 비교', items: ['타사 비교'], layouts: [] };
    const none = { id: 'n', type: null, name: '경쟁사 대비 비교', items: ['타사 비교'], layouts: [] };
    const same = (a, b) => JSON.stringify(a.map(r => r.l.f)) === JSON.stringify(b.map(r => r.l.f));
    out.free = same(recommendForPart(free, {}, 3), recommendLayouts(free, {}, 3));
    out.none = same(recommendForPart(none, {}, 3), recommendLayouts(none, {}, 3));
    return out;
  });
  for (const [type, r] of Object.entries(rec)) if (r.picked) {
    assert.deepEqual(r.picked, r.picked.map((p, i) => (i < r.own ? type : p)), type + ': ' + JSON.stringify(r));
  }
  assert(rec.free && rec.none);
  assert(Object.values(rec).some(r => r.before && r.before.some(p => p !== r.picked[0])), 'the part order changes at least one ranking: ' + JSON.stringify(rec));
  pass('recommendations put the layouts of a predefined part first (value · why · case · products · market); free / untyped parts keep the old ranking');

  const fixture = await page.evaluate(async ({ second, solution }) => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const repo = await import('/src/repositories/proposals.js');
    const { StoryCanvas } = await import('/src/components/storyboard.jsx');
    const { LayoutPicker } = await import('/src/components/layouts.jsx');
    const { LAYOUTS, L } = await import('/src/services/catalog.js');
    (await import('/src/services/layout-brief.js')).startLayoutBriefSync();
    (await import('/src/services/layout-context.js')).startLayoutContextSync();
    const other = LAYOUTS.find(l => l.p === 'value' && !l.ind && !l.retired && !l.variantOf).f;
    const id = repo.createProposal(); window.__pid = id; window.__repo = repo;
    repo.update(id, p => {
      p.title = '방향 추론 검증'; p.customer = '검증 고객'; p.stage = 'story';
      p.req.free = [{ t: '본사 로비와 회의실에 안내 화면과 협업 화면을 둡니다. 로비에는 ' }, { ref: 'product:qm55c' }, { t: ' 를 씁니다.' }];
      p.ctx.products = ['qm55c', second]; p.ctx.solutions = [solution];
      p.parts = [{ id: 'target', type: 'value', name: '운영 가치', items: ['안내 화면 운영 개선'], form: 'list', text: '', done: true,
        layouts: [{ uid: 'other', f: other, status: 'done', ov: { t: { 0: 'QM55C 로비 안내 화면' }, img: {} }, adaptation: { version: 3, origin: 'compose', phase: 'ready' } }] }];
    });
    document.getElementById('root').style.display = 'none';
    const host = document.createElement('div'); host.style.cssText = 'height:100vh;display:flex;flex-direction:column'; document.body.appendChild(host);
    function Subject() {
      const p = repo.useStore(s => s.proposals.find(p => p.id === id)); const [opened, setOpened] = React.useState(null);
      return React.createElement(React.Fragment, null,
        React.createElement(StoryCanvas, { p, open: setOpened, stage: 'story', onReq: () => {}, onMatch: () => {}, pageOf: () => 1 }),
        opened?.type === 'picker' && React.createElement(LayoutPicker, { p, partId: opened.partId, mode: opened.mode, onClose: () => setOpened(null) }));
    }
    createRoot(host).render(React.createElement(Subject));
    return { id, other, otherName: L[other].name };
  }, { second: SECOND, solution: SOLUTION });
  const sheets = () => page.evaluate(() => window.__repo.getProposal(window.__pid).parts.find(p => p.id === 'target').layouts.map(x => ({ uid: x.uid, f: x.f, phase: x.adaptation?.phase, brief: x.brief || null })));
  const fresh = async () => (await sheets()).filter(x => x.uid !== 'other');

  // ---- 1 · 2 고르면 바로 닫힘 · 목차 레이아웃 먼저 ----
  const col = page.locator('.col[data-pid="target"]');
  await col.getByRole('button', { name: 'PPT 레이아웃 추가', exact: true }).click();
  const picker = page.locator('.modal.xwide'); await picker.locator('.pk-rec .pcard').first().waitFor();
  const recParts = await picker.locator('.pk-rec .pcard').evaluateAll(es => es.map(e => e.dataset.f));
  const recTypes = await page.evaluate(async fs => { const { L } = await import('/src/services/catalog.js'); return fs.map(f => L[f].p); }, recParts);
  assert.deepEqual(recTypes, recTypes.map(() => 'value'), 'picker recommendations: ' + recTypes);
  const pickedF = recParts[0];
  await picker.locator('.pk-rec .pcard').first().click();
  await picker.waitFor({ state: 'detached' });
  pass('the picker recommends this part’s own layouts and closes the moment one is picked');

  // ---- 4 · 추론 중 shimmer ----
  const added = (await until(async () => (await fresh()).length === 1 && await fresh(), 'added sheet'))[0];
  assert.equal(added.phase, 'briefing');
  const card = page.locator('.lcard[data-layout-uid="' + added.uid + '"]');
  await card.locator('.context-slide.shimmer').waitFor();
  assert.equal(await card.locator('.stbadge').count(), 0, '채우는 중 · 추론 중 글 없이 shimmer 만'); assert.equal(await card.locator('.context-slide svg').count(), 0, '별표 아이콘 없음');
  await page.getByRole('status').filter({ hasText: '넣을 내용을 추론하는 중' }).first().waitFor();
  await until(() => briefCalls.length === 1, 'brief request');
  const input = briefCalls[0];
  const qmKey = input.items.find(i => i.model === 'QM55C')?.key;
  assert(qmKey, 'linked products are the choices: ' + JSON.stringify(input.items));
  assert(input.items.some(i => i.kind === '솔루션'));
  assert.equal(input.others.length, 1); assert.equal(input.others[0].name, fixture.otherName);
  assert(input.others[0].items.includes(qmKey), 'the other sheet of the part covers QM55C: ' + input.others[0].items);
  assert.equal(input.part.name, '운영 가치'); assert(input.layout.name && input.layout.example);
  assert.equal(fillCalls.length, 0, 'no fill before the person confirms');
  await page.screenshot({ path: output + '/1-briefing.png' });
  pass('the added sheet shimmers at once while the model infers its products · solutions · outline from the requirements, the part and the other sheet');

  // ---- 추론 완료 → 카드 가운데 '!' ----
  briefHeld.splice(0).forEach(r => r());
  await card.locator('.brief-mark').waitFor();
  assert.equal((await fresh())[0].phase, 'brief');
  // the model wrote the name again right after a tag, and a linked solution by name only — both become one @tag each
  const segs = (await fresh())[0].brief.segs;
  assert.equal(segs.filter(x => x.ref === 'product:' + SECOND).length, 2, JSON.stringify(segs));
  assert.equal(segs.filter(x => x.ref === 'solution:' + SOLUTION).length, 2, JSON.stringify(segs));
  const afterTag = segs[segs.map(x => x.ref).lastIndexOf('product:' + SECOND) + 1];
  assert.match(afterTag.t, /^로 로비/, JSON.stringify(afterTag));
  await card.locator('.stbadge.brief', { hasText: '확인 필요' }).waitFor();
  await page.getByRole('status').filter({ hasText: '넣을 내용 추론 완료' }).first().waitFor();
  const centre = await card.evaluate(el => { const s = el.firstElementChild.getBoundingClientRect(), b = el.querySelector('.brief-mark').getBoundingClientRect(); return { dx: Math.abs((s.left + s.width / 2) - (b.left + b.width / 2)), dy: Math.abs((s.top + s.height / 2) - (b.top + b.height / 2)) }; });
  assert(centre.dx < 2 && centre.dy < 2, 'the ! sits in the middle of the sheet: ' + JSON.stringify(centre));
  assert.equal(fillCalls.length, 0);
  await page.screenshot({ path: output + '/2-brief-ready.png' });
  pass('when the inference is done the card shows a ! button in the middle of the sheet (and a notice); still nothing is filled');

  // ---- 팝업: @태그 편집칸 · 바로 고쳐 쓰기 · 나중에(초안 남김) ----
  await card.locator('.brief-mark').click();
  const pop = page.locator('.modal.lb-modal'); await pop.waitFor();
  const editor = pop.locator('#lb-ed');
  await editor.locator('.mention[data-ref="product:' + SECOND + '"]').first().waitFor();
  assert(await editor.locator('.mention[data-ref="solution:' + SOLUTION + '"]').count() >= 1);
  assert.match(await editor.innerText(), /핵심 메시지: 로비 안내를 한 화면에서 바꾸는 운영/);
  assert.equal(await editor.getAttribute('contenteditable'), 'true');
  assert.equal(await pop.getByRole('button', { name: /수정/ }).count(), 0, 'no separate edit button');
  assert.equal(await pop.locator('.mbody p').count(), 0, 'no helper sentences around the editor');
  await page.waitForTimeout(400); await page.screenshot({ path: output + '/3-popup.png', animations: 'disabled' });
  await editor.click();
  await editor.evaluate(el => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  await page.keyboard.type(' 직접 고친 메모');
  await pop.getByRole('button', { name: '나중에', exact: true }).click(); await pop.waitFor({ state: 'detached' });
  const draft = (await fresh())[0];
  assert.equal(draft.phase, 'brief'); assert(draft.brief.edited);
  assert(draft.brief.segs.some(s => s.t && s.t.includes('직접 고친 메모')));
  assert(draft.brief.refs.includes('product:' + SECOND));
  pass('the ! opens the inferred direction in an editable @-tag editor (no edit button); closing keeps the edits without filling');

  // ---- 카드를 눌러도 같은 팝업 → 확인하고 진행 → 다시 shimmer · 그 방향으로 채우기 ----
  await card.click({ position: { x: 30, y: 30 } });
  await pop.waitFor(); assert.match(await editor.innerText(), /직접 고친 메모/);
  await pop.getByRole('button', { name: '확인하고 진행', exact: true }).click(); await pop.waitFor({ state: 'detached' });
  await until(async () => ['queued', 'running'].includes((await fresh())[0].phase), 'fill queued');
  await card.locator('.context-slide.shimmer').waitFor();
  assert.equal(await card.locator('.stbadge').count(), 0, '채우는 중 글 없이 shimmer 만');
  assert.equal(await card.locator('.brief-mark').count(), 0);
  await until(() => fillCalls.length >= 1, 'fill request', 30000);
  const fill = fillCalls[0];
  assert(fill.input.direction, 'fill gets the confirmed direction');
  assert.match(fill.input.direction.text, /직접 고친 메모/);
  assert.match(fill.input.direction.text, /핵심 메시지/);
  const secondModel = boot.catalog.products.find(p => p.id === SECOND).model;
  assert(fill.input.direction.focus.some(x => x.includes(secondModel)), JSON.stringify(fill.input.direction.focus));
  assert.match(fill.prompt, /direction은 사람이 확인한 이 장의 방향/);
  assert((await fresh())[0].brief.confirmedAt);
  await page.screenshot({ path: output + '/4-filling.png' });
  fillHeld.splice(0).forEach(r => r());
  await until(async () => (await fresh())[0].phase === 'error', 'fill settled');
  pass('confirming starts the shimmer again and the fill follows the confirmed (edited) direction with its @-tagged items');

  // ---- 3 · 같은 레이아웃 다시 넣기 · 추론 실패 → 다시 추론 ----
  briefMode = 'error';
  await col.getByRole('button', { name: 'PPT 레이아웃 추가', exact: true }).click(); await picker.locator('.pk-rec .pcard').first().waitFor();
  const again = picker.locator('.pk-all .pcard[data-f="' + pickedF + '"]');
  assert.match(await again.innerText(), /추가됨/);
  await again.click(); await picker.waitFor({ state: 'detached' });
  const two = await until(async () => { const xs = await fresh(); return xs.length === 2 && xs; }, 'second copy');
  assert.equal(two.filter(x => x.f === two[0].f).length, 2, 'the same layout twice in one part');
  const card2 = page.locator('.lcard[data-layout-uid="' + two[1].uid + '"]');
  await card2.locator('.brief-mark').waitFor();
  await card2.locator('.brief-mark').click(); await pop.waitFor();
  await pop.locator('.lb-err', { hasText: '내용을 추론하지 못했어요' }).waitFor();
  briefMode = 'normal';
  await pop.getByRole('button', { name: '다시 추론' }).click(); await pop.waitFor({ state: 'detached' });
  await until(async () => (await fresh())[1].phase === 'briefing' || briefHeld.length, 'retry briefing');
  await until(() => briefHeld.length === 1, 'retry request'); briefHeld.splice(0).forEach(r => r());
  await card2.locator('.brief-mark').waitFor();
  assert((await fresh())[1].brief.segs.length > 0);
  pass('the same layout can be added to the part again; a failed inference still shows the !, and its popup retries');

  // ---- 읽기 전용 보드(샘플 버티컬 시나리오 보기)에는 '!' · 확인 배지가 없다 ----
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { StoryCanvas } = await import('/src/components/storyboard.jsx');
    const host = document.createElement('div'); host.id = 'ro-host'; host.style.cssText = 'height:60vh;display:flex;flex-direction:column'; document.body.prepend(host);
    createRoot(host).render(React.createElement(StoryCanvas, { p: window.__repo.getProposal(window.__pid), open: () => {}, stage: 'story', readOnly: true, pageOf: () => 1 }));
  });
  const ro = page.locator('#ro-host .canvas-wrap.ro');
  await ro.locator('.lcard').nth(2).waitFor({ state: 'attached' });
  assert.equal(await ro.locator('.brief-mark, .stbadge.brief, .lcard.brief-wait').count(), 0);
  pass('a read-only board shows the sheets without the ! button or the confirmation badge');

  // ---- 확인 전에는 내보내기가 막힌다 ----
  const blocked = await page.evaluate(async () => { const { briefWaiting } = await import('/src/domain/slides/context-policy.js'); return window.__repo.getProposal(window.__pid).parts[0].layouts.some(briefWaiting); });
  assert(blocked);
  assert.deepEqual(errors, []);
  fs.writeFileSync(output + '/report.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(checks.length + ' layout brief checks passed');
} catch (error) { await page?.screenshot({ path: output + '/failure.png' }).catch(() => {}); throw error; }
finally { await browser?.close(); await server.close(); }
