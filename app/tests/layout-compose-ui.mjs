// Storyboard '레이아웃 구성' 흐름 — 모델 · 서버 없이 화면 계약만 검사한다(API는 여기서 흉내 낸다). 관리자 운영 값은 지금 실제 값과 같게(기본 제안 · 상세 제안만 추천 사용).
//   (사용자 지시 2026-11-16) 구성 데이터는 관리자 추천 구성 그대로 · 카드에 설명 줄 없음 · '전체 구성 보기' 버튼 없음(버블을 누르면 전체 구성) ·
//   '구성 생성하기' → 매칭 확인 → 기본 · 상세 2개 — DSS 에 따라 공간별 제안 · 솔루션 제안 · 구독 상품 제안 · 서비스만 들어가고 빠진다(카드는 매칭을 바꾸면 바로 바뀐다) ·
//   '제품 · 솔루션 · 서비스' 버블(서비스 = 서비스 분류 솔루션 + 구독) · '추가' 버블은 구성 뒤에만(AI로 나머지 구성 없음) → 11개 파트 팝업(설명 · 줄을 누르면 펼쳐져 장 + 아래로 상세 · 큰 추가 / 추가됨 · DSS 잠금 → 먼저 추가) ·
//   목차 버블 끌어서 옮기기(제품 스펙은 맨 끝) · 목차 지우기는 확인 팝업 뒤.
// 실행: CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node app/tests/layout-compose-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'app/tests/output'); fs.mkdirSync(out, { recursive: true });
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const fn = { mode: 'real', ready: true, effective: 'llm' };
// 관리자 운영 값 — 2026-11-16 실제 값(app/data/runtime/layout_presets.json): 기본 제안 · 상세 제안만 추천 사용
const OLD = ['std', 'stdx', 'space', 'spacex', 'pain', 'build', 'prod', 'subs'];
const presets = { v: 1, rev: 1, fixed: 'basic', order: ['basic', 'detail', ...OLD], items: Object.fromEntries(OLD.map((id) => [id, { enabled: false }])), parts: {}, templates: {} };
const bootstrap = { catalog: read('catalog'), products: read('products_db'), images: read('images'), subscriptions: read('subscriptions'), layout_presets: presets,
  capabilities: { provider: { available: true }, knowledge: { available: true }, functions: { storyboard: fn, requirements: fn, layout: fn, rfp: fn, review: fn } },
  user: { username: 'layout-compose-test', auth_enabled: false } };
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const errors = []; const pass = (m) => console.log('PASS', m);
const flowNames = (card) => card.locator('.tocmf-i .node-name').evaluateAll((els) => els.map((e) => e.textContent.replace(/​/g, '').replace(/ /g, ' ').trim()));
let browser;

// ---- 흉내 낸 서버 상태
const llm = { calls: [], hold: null, release: null };
const jobs = []; // 제출된 자동 구성 작업 { id, body, polls, script, released }
const layoutsOf = (part) => part.exemplar.slice(0, 2).map((x) => ({ f: x.f, status: 'done', ov: { t: { ...x.t }, img: { ...x.img } } }));
function scriptFor(body, first) {
  const parts = body.parts; const body0 = parts.filter((x) => !x.deck);
  if (!first) { // 목차 추가 — 바로 끝
    return [{ status: 'done', events: body0.map((x, i) => ({ seq: 1 + i, type: 'part', id: x.id, status: 'done', layouts: layoutsOf(x) })),
      result: { step: 'auto', thesis: '', app_parts: parts.map((x) => ({ id: x.id, deck: !!x.deck, layouts: layoutsOf(x) })), failed: [], llm: { calls_ok: 1, effective: 'llm', model: 'test' } } }];
  }
  const last = body0[body0.length - 1];
  return [
    { status: 'running', events: [{ seq: 1, type: 'plan', plan: { thesis: '본사에서 한 번에 바꾸는 메뉴보드', parts: body0.map((x) => ({ id: x.id, message: x.name + '의 핵심 메시지', points: [], products: [], solutions: [], cases: [], spaces: [] })) } }] },
    { status: 'running', events: [{ seq: 2, type: 'part', id: body0[0].id, status: 'started' }, { seq: 3, type: 'part', id: body0[0].id, status: 'done', layouts: layoutsOf(body0[0]) }] },
    { status: 'running', hold: true, events: [] },
    { status: 'done', events: [...body0.slice(1, -1).map((x, i) => ({ seq: 4 + i, type: 'part', id: x.id, status: 'done', layouts: layoutsOf(x) })), { seq: 40, type: 'part', id: last.id, status: 'error', message: '모델 응답을 받지 못했어요.' }],
      result: { step: 'auto', thesis: '본사에서 한 번에 바꾸는 메뉴보드', app_parts: parts.filter((x) => x.id !== last.id).map((x) => ({ id: x.id, deck: !!x.deck, layouts: layoutsOf(x) })), failed: [last.id], llm: { calls_ok: 9, effective: 'llm', model: 'test' } } },
  ];
}

try {
  await server.listen();
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
  await context.route((url) => !['localhost', '127.0.0.1'].includes(url.hostname), (route) => route.abort());
  await context.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: bootstrap });
    if (url.pathname === '/api/poc/capabilities') return route.fulfill({ json: bootstrap.capabilities });
    if (url.pathname === '/api/llm') {
      const body = req.postDataJSON(); llm.calls.push(body);
      if (llm.hold && /업종 목록/.test(body.prompt || '')) await llm.hold;
      return route.fulfill({ json: { mode: 'real', data: { vertical: 'fb_qsr' } } });
    }
    if (url.pathname === '/api/jobs' && req.method() === 'POST') {
      const body = req.postDataJSON();
      if (body.kind !== 'compose' || body.step !== 'auto') return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
      const id = 'job-auto-' + (jobs.length + 1);
      jobs.push({ id, body, polls: 0, script: scriptFor(body, jobs.length === 0), released: false });
      return route.fulfill({ status: 202, json: { id, kind: 'compose', title: '레이아웃 자동 구성', status: 'queued', events: [], next_seq: 0 } });
    }
    const m = /^\/api\/jobs\/([^/]+)$/.exec(url.pathname);
    const job = m && jobs.find((j) => j.id === m[1]);
    if (job && req.method() === 'GET') {
      const since = Number(url.searchParams.get('since') || 0);
      let i = Math.min(job.polls, job.script.length - 1);
      if (job.script[i].hold && !job.released) i = Math.max(0, i - 1); else job.polls += 1;
      const upto = job.script.slice(0, i + 1);
      const events = upto.flatMap((s) => s.events).filter((e) => e.seq > since);
      const cur = job.script[i];
      return route.fulfill({ json: { id: job.id, kind: 'compose', status: cur.status, events, next_seq: Math.max(since, ...upto.flatMap((s) => s.events.map((e) => e.seq)), 0), result: cur.result || null, llm: cur.result ? cur.result.llm : null } });
    }
    return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.locator('.home').waitFor();
  await page.locator('.home-actions .start').click();
  await page.locator('.start-node').waitFor();

  // ---- 요구사항 저장(저장소에 직접): 요약은 아직 진행 중
  const pid = await page.evaluate(async () => {
    const repo = await import('/src/repositories/proposals.js');
    const dom = await import('/src/domain/proposals/requirement-summary.js');
    const sig = await import('/src/components/ctxconfirm.jsx');
    const p = repo.getProposals()[0];
    repo.update(p.id, (d) => {
      d.title = 'A 커피 디지털 메뉴보드'; d.customer = 'A 커피';
      d.req.free = [{ t: '전국 320개 매장 메뉴판을 디지털 메뉴보드로 바꾸고 본사에서 한 번에 콘텐츠를 바꾸고 싶다.' }];
      d.reqSaved = sig.reqSig(d); d.stage = 'match';
    });
    const q = repo.getProposal(p.id);
    repo.update(p.id, (d) => { d.requirementSummary = { sourceKey: dom.requirementSourceKey(q), status: 'pending' }; }, { touch: false });
    return p.id;
  });
  await page.keyboard.press('Escape');
  await page.locator('.match-node').waitFor(); await page.locator('.layout-node').waitFor();
  assert.equal((await page.locator('.match-node > .node-name').innerText()).trim(), '제품 · 솔루션 · 서비스', '매칭 버블 이름');
  assert.deepEqual(await page.locator('.match-node .dss-sec').evaluateAll((els) => els.map((e) => e.dataset.ctx)), ['products', 'solutions', 'services'], '매칭 카드 칸: 제품 · 솔루션 · 서비스(연결한 사례가 없으면 사례 칸 없음)');
  const genBtn = page.locator('.layout-node').getByRole('button', { name: '구성 생성하기' });
  await genBtn.waitFor();
  const bubbleAt = () => page.locator('.layout-node > .node-top .node, .match-node > .node-top .node, .start-node > .node-top .node').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }));
  const bubbles0 = await bubbleAt(); // 결과 상자가 넓어져도 버블 자리는 그대로여야 한다
  assert.ok(await genBtn.isDisabled(), '요약이 끝나기 전에는 구성 생성하기가 꺼져 있어야 함');
  assert.equal(await page.locator('.layout-node .lyt-area').count(), 0, '만들기 전에는 버튼만');
  assert.equal(await page.locator('.board .lyt-all-btn').count(), 0, '전체 구성 보기 버튼은 없어야 함');
  assert.equal(await page.locator('.board .end-node').count(), 0, '구성을 고르기 전에는 목차 직접 추가 버블이 없어야 함');
  await page.locator('.layout-node .lock-tip').hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#lyt-rec-hint')).opacity === '1');
  assert.match(await page.locator('#lyt-rec-hint').innerText(), /요약이 끝나면 구성을 생성할 수 있어요/);
  await page.mouse.move(5, 5);
  pass('요구사항 저장 → 제품 · 솔루션 · 서비스 버블 + 레이아웃 구성 버블 · 구성 생성하기는 요약 전 꺼짐(말풍선) · 전체 구성 보기 버튼 · 목차 직접 추가 없음');

  // ---- 버블을 누르면 전체 구성 = 관리자가 켜 둔 구성(기본 제안 · 상세 제안) · 설명 줄 없음 · 관리자 파트 이름
  await page.locator('.layout-node > .node-top .node').click();
  const allDlg = page.getByRole('dialog').filter({ hasText: '전체 구성 보기' }).last();
  await allDlg.locator('.lyt-all .lyt-card').first().waitFor();
  assert.deepEqual(await allDlg.locator('.lyt-card').evaluateAll((els) => els.map((e) => e.dataset.tpl)), ['basic', 'detail'], '전체 구성은 관리자가 켜 둔 구성');
  assert.equal(await allDlg.locator('.lyt-card-d, .lyt-tag').count(), 0, '구성 카드에 설명 줄 · 꼬리표가 없어야 함');
  assert.deepEqual(await flowNames(allDlg.locator('.lyt-card[data-tpl="basic"]')), ['제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '서비스 제안', '유관 사례'], '기본 제안 = 관리자 구성 · 관리자 파트 이름 · 제품 스펙 버블은 그리지 않음');
  // 팝업에서도 버블 간격은 카드마다 같고, hover 목록은 팝업 위에 뜬다
  const allGaps = await allDlg.locator('.lyt-card').evaluateAll((cards) => cards.map((c) => { const xs = [...c.querySelectorAll('.tocmf-i .node')].map((n) => n.getBoundingClientRect().left); return xs.slice(1).map((x, i) => Math.round(x - xs[i])); }).flat());
  assert.equal(new Set(allGaps).size, 1, '전체 구성 보기 버블 간격: ' + allGaps.join(','));
  await allDlg.locator('.lyt-card[data-tpl="detail"] .tocmf-i[data-toc="why"] .node').hover();
  await page.locator('.lyt-peek[data-toc="why"]').waitFor();
  assert.ok(await page.evaluate(() => { const r = document.querySelector('.lyt-peek').getBoundingClientRect(); return !!document.elementFromPoint(r.left + r.width / 2, r.top + 30)?.closest('.lyt-peek'); }), 'hover 목록은 팝업 위에');
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, 'layout-compose-1b-all-hover.png') });
  await page.mouse.move(5, 5); await page.locator('.lyt-peek').waitFor({ state: 'detached' });
  await page.keyboard.press('Escape'); await allDlg.waitFor({ state: 'detached' });
  assert.equal(llm.calls.length, 0);
  pass('버블 → 전체 구성(관리자 구성 2개 · 관리자 파트 이름 · 설명 없음)');

  // ---- 요약 완료 → 버튼 켜짐(스스로 만들지 않음) → 매칭 확인 → 기본 · 상세 2개(DSS 없음 → DSS 파트 모두 빠짐)
  await page.evaluate(async (id) => {
    const repo = await import('/src/repositories/proposals.js'); const dom = await import('/src/domain/proposals/requirement-summary.js');
    const p = repo.getProposal(id); const key = dom.requirementSourceKey(p);
    const it = (text) => ({ text, kind: 'fact', refs: [] });
    const summary = Object.fromEntries(dom.SUMMARY_SECTIONS.map(([k]) => [k, []]));
    Object.assign(summary, { overview: it('전국 매장 메뉴판을 디지털로 바꾸고 본사에서 일괄 운영하려는 제안'), goals: [it('메뉴 교체 시간 단축')], requirements: [it('본사 일괄 콘텐츠 배포')], strategy: [it('운영비 절감')] });
    repo.update(id, (d) => { d.requirementSummary = { sourceKey: key, status: 'ready', result: { source_key: key, sources: [], summary, llm: { effective: 'llm' } } }; }, { touch: false });
  }, pid);
  await page.waitForFunction(() => { const b = document.querySelector('.layout-node .lyt-rec-btn'); return !!b && !b.disabled; });
  await page.waitForTimeout(800);
  assert.equal(llm.calls.length, 0, '버튼을 누르기 전에는 모델을 부르지 않음');
  await genBtn.click();
  const ask = page.getByRole('dialog').filter({ hasText: '서비스 매칭을 마쳤나요' });
  await ask.waitFor();
  assert.match((await ask.innerText()).replace(/\s+/g, ' '), /제품 0.*솔루션 0.*서비스 0/, '확인 팝업은 제품 · 솔루션 · 서비스 수');
  await ask.getByRole('button', { name: '매칭 더 하기' }).click(); await ask.waitFor({ state: 'detached' });
  await page.locator('.mt-live-pop').waitFor();
  await page.keyboard.press('Escape'); await page.locator('.mt-live-pop').waitFor({ state: 'detached' });
  llm.hold = new Promise((resolve) => { llm.release = resolve; });
  await genBtn.click(); await ask.waitFor();
  await ask.getByRole('button', { name: '구성 생성하기' }).click(); await ask.waitFor({ state: 'detached' });
  const area = page.locator('.layout-node .lyt-area');
  await page.waitForFunction(() => document.querySelectorAll('.layout-node .lyt-area .lyt-card.sk').length === 2);
  await page.screenshot({ path: path.join(out, 'layout-compose-1-generating.png') });
  llm.release(); llm.hold = null;
  await page.waitForFunction(() => document.querySelectorAll('.layout-node .lyt-area .lyt-card:not(.sk)').length === 2, null, { timeout: 8000 });
  assert.deepEqual(await area.locator('.lyt-card').evaluateAll((els) => els.map((e) => e.dataset.tpl)), ['basic~space.sol.svc-sac.svc-mobile.svc-sub', 'detail'], 'DSS 가 없으면 DSS 파트가 모두 빠진 기본 · 상세(상세 제안에는 DSS 파트가 없다 — 고객/공간 시나리오, 2026-11-17)');
  assert.equal(await area.locator('.lyt-card-d').count(), 0, '추천 구성 카드에 설명 줄이 없어야 함');
  assert.deepEqual((await area.locator('.lyt-card-h b').allInnerTexts()).map((x) => x.trim()), ['기본 제안', '상세 제안']);
  assert.deepEqual(await flowNames(area.locator('.lyt-card').nth(0)), ['제안 개요', '가치 제안 (VP)', '유관 사례']);
  assert.deepEqual(await flowNames(area.locator('.lyt-card').nth(1)), ['제안 개요', '시장 분석 (MI)', '가치 제안 (VP)', '고객/공간 시나리오', '유관 사례', 'Why Samsung']); // 상세 제안 = 고객/공간 시나리오(DSS 파트 아님)
  assert.equal(llm.calls.length, 1); assert.match(llm.calls[0].prompt, /업종 목록/); assert.doesNotMatch(llm.calls[0].prompt, /구성 목록/, '모델은 구성을 고르지 않고 업종만');
  assert.match(await area.locator('.lyt-area-v').innerText(), /QSR|프랜차이즈|외식/);
  const saved = await page.evaluate(async (id) => (await import('/src/repositories/proposals.js')).getProposal(id).layoutRec, pid);
  assert.equal(saved.v, 2); assert.equal(saved.vertical, 'fb_qsr');
  await page.screenshot({ path: path.join(out, 'layout-compose-2-generated.png') });
  pass('요약 완료 → 구성 생성하기 → 매칭 확인 → 기본 · 상세 2개(DSS 파트 없음) · 설명 줄 없음 · 모델은 업종만');

  // ---- DSS 를 연결하면 카드가 바로 바뀐다(모델을 다시 부르지 않음): 제품 → 공간별 제안 · 솔루션 → 솔루션 제안 · 서비스 → 서비스 · 구독 → 구독 상품 제안
  const ids = await page.evaluate(async () => {
    const cat = await import('/src/services/catalog.js');
    return { sol: Object.values(cat.S).find((s) => s.cat !== '서비스').id, svc: Object.values(cat.S).find((s) => s.cat === '서비스').id, sub: cat.SUBSCRIPTIONS[0].id };
  });
  const link = (refs) => page.evaluate(async (rs) => { const r = await import('/src/components/requirements.jsx'); const repo = await import('/src/repositories/proposals.js'); const id = repo.getProposals()[0].id; rs.forEach((x) => r.addRef(id, x)); }, refs);
  const unlink = (refs) => page.evaluate(async (rs) => { const r = await import('/src/components/requirements.jsx'); const repo = await import('/src/repositories/proposals.js'); const id = repo.getProposals()[0].id; rs.forEach((x) => r.removeRef(id, x)); }, refs);
  await link(['product:qm55c', 'solution:' + ids.sol, 'solution:' + ids.svc, 'subscription:' + ids.sub]);
  await page.waitForFunction(() => document.querySelector('.layout-node .lyt-area .lyt-card[data-tpl="basic"]'));
  assert.deepEqual(await flowNames(area.locator('.lyt-card[data-tpl="basic"]')), ['제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '서비스 제안', '유관 사례'], 'DSS 를 다 고르면 관리자 기본 제안 그대로(제품 스펙 버블만 그리지 않음)');
  assert.equal((await flowNames(area.locator('.lyt-card[data-tpl="detail"]'))).length, 6); // 상세 제안 7파트(고객/공간 시나리오) − 제품 스펙(그리지 않음)
  // ---- 결과 상자(사용자 지시 2026-11-16): '추천 구성' 글 없음 · 버블 자리 그대로 · 상자만 오른쪽으로 넓어져 상세 제안이 한 줄 · 큰 버블 · 같은 간격 · 버블마다 다른 색(흐름 순서) · hover 에 레이아웃 구성
  assert.doesNotMatch(await area.innerText(), /추천 구성/, "'추천 구성' 글은 없어야 함");
  assert.deepEqual(await bubbleAt(), bubbles0, '버블 자리는 그대로');
  const geo = await page.evaluate(() => {
    const col = document.querySelector('.layout-node').getBoundingClientRect(); const box = document.querySelector('.layout-node .lyt-area').getBoundingClientRect();
    const cards = [...document.querySelectorAll('.layout-node .lyt-area .lyt-card')].map((c) => [...c.querySelectorAll('.tocmf-i .node')].map((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top, w: r.width, bg: getComputedStyle(n).backgroundColor, key: n.closest('.tocmf-i').dataset.toc }; }));
    const zoom = parseFloat(getComputedStyle(document.querySelector('.board')).zoom) || 1;
    return { col: { l: col.left, w: col.width }, box: { l: box.left, r: box.right, w: box.width }, cards, zoom };
  });
  assert.ok(Math.abs(geo.box.l - geo.col.l) < 1 && geo.box.w > geo.col.w + 100, '상자는 칸 왼쪽에서 오른쪽으로 넓어짐: ' + JSON.stringify([geo.col, geo.box]));
  const detailRow = geo.cards[1];
  assert.equal(new Set(detailRow.map((b) => Math.round(b.y))).size, 1, '상세 제안 버블은 한 줄');
  assert.ok(detailRow[detailRow.length - 1].x + detailRow[0].w / 2 < geo.box.r, '상세 제안이 상자 안에 다 들어감');
  assert.ok(Math.abs(detailRow[0].w / geo.zoom - 40) < 0.5, '버블 40px: ' + detailRow[0].w);
  // 오른쪽 끝은 늘 내용보다 조금 더 — 끝까지 굴리면 결과 상자 오른쪽에 빈 자리(너무 넓지 않게)
  const tail = await page.evaluate(() => { const c = document.querySelector('.canvas'); c.scrollLeft = c.scrollWidth; const r = document.querySelector('.layout-node .lyt-area').getBoundingClientRect(); const cr = c.getBoundingClientRect(); const gap = cr.right - r.right; c.scrollLeft = 0; return { gap, scrolls: c.scrollWidth > c.clientWidth }; });
  // 구성이 짧아 캔버스가 굴러가지 않으면(2026-11-17 상세 제안 7파트) 빈 자리 상한은 없다
  assert.ok(tail.gap >= 150 && (!tail.scrolls || tail.gap <= 320), '끝까지 굴린 뒤 오른쪽 빈 자리: ' + JSON.stringify(tail));
  const gaps = geo.cards.flatMap((row) => row.slice(1).map((b, i) => Math.round(b.x - row[i].x)));
  assert.equal(new Set(gaps).size, 1, '버블 간격은 모든 구성에서 같음: ' + gaps.join(','));
  const colors = await page.evaluate(async () => (await import('/src/domain/templates/part_colors.js')).PART_COLORS);
  const rgbOf = (hex) => 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
  for (const row of geo.cards) {
    assert.equal(new Set(row.map((b) => b.bg)).size, row.length, '한 구성 안 버블 색은 모두 다름: ' + row.map((b) => b.bg).join(' '));
    for (const b of row) assert.equal(b.bg, rgbOf(colors[b.key]), b.key + ' 파트 색');
  }
  // hover — 버블이 커지고 그 목차의 레이아웃 구성이 아래에 뜬다(반복 장은 접는다) · 다른 버블로 옮기면 바뀌고 · 벗어나면 닫힘
  const basicCard = area.locator('.lyt-card[data-tpl="basic"]');
  await basicCard.locator('.tocmf-i[data-toc="space"] .node').hover();
  const peek = page.locator('.lyt-peek'); await peek.waitFor();
  assert.equal(await peek.getAttribute('data-toc'), 'space');
  assert.match(await peek.locator('header').innerText(), /제품 제안/);
  await page.waitForFunction(() => /matrix\(1\.1/.test(getComputedStyle(document.querySelector('.lyt-card[data-tpl="basic"] .tocmf-i.peeking .node')).transform));
  const sheets = Number((await peek.locator('.lyt-peek-n').innerText()).replace(/\D/g, ''));
  const rows = await peek.locator('.lyt-peek-list > li[data-layout]').evaluateAll((els) => els.map((e) => ({ f: e.dataset.layout, rep: (e.querySelector('.lyt-peek-rep') || {}).textContent || '', th: !!e.querySelector('.lyt-peek-th .slide, .lyt-peek-th > div > *') })));
  assert.ok(rows.length > 0 && rows.every((r) => r.th), '장 썸네일 목록: ' + JSON.stringify(rows));
  assert.ok(rows.length <= sheets, '반복 장은 접어 보임');
  if (rows.length < sheets) assert.ok(rows.some((r) => /마다 × \d|× \d/.test(r.rep)), '접은 장에는 「…마다 × n」');
  const pb = await peek.boundingBox(); const nb = await basicCard.locator('.tocmf-i[data-toc="space"]').boundingBox();
  assert.ok(pb.y >= nb.y + nb.height - 1, '버블 아래에 뜸');
  await page.screenshot({ path: path.join(out, 'layout-compose-2b-hover.png') });
  assert.equal(await basicCard.locator('.tocmf-i.peeking').evaluate((e) => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)', 'hover 칸에 바탕 없음');
  await basicCard.locator('.tocmf-i[data-toc="needs"] .node').hover(); // 옆 버블로 옮기면 그 목차로
  await page.waitForFunction(() => document.querySelector('.lyt-peek')?.dataset.toc === 'needs');
  await page.mouse.move(5, 5); await peek.waitFor({ state: 'detached' }); // 벗어나면 닫힘
  await area.locator('.lyt-card[data-tpl="detail"] .tocmf-i[data-toc="ua"] .node').hover();
  await page.waitForFunction(() => document.querySelector('.lyt-peek')?.dataset.toc === 'ua');
  await page.mouse.move(5, 5); await peek.waitFor({ state: 'detached' });
  pass("결과 상자: '추천 구성' 글 없음 · 버블 자리 그대로 · 상자만 넓어져 상세 제안 한 줄 · 40px 버블 · 같은 간격 · 파트마다 다른 색 · hover 레이아웃 구성(커짐 · 접기)");
  // 매칭 카드: 서비스 칸 = 서비스 분류 솔루션 + 구독, 솔루션 칸에는 서비스가 없다
  assert.equal(await page.locator('.match-node .dss-sec.service .dss-chip').count(), 2, '서비스 칸에 서비스 · 구독');
  assert.equal(await page.locator('.match-node .dss-sec.solution .dss-chip').count(), 1, '솔루션 칸에는 서비스가 없음');
  await page.locator('.match-node').screenshot({ path: path.join(out, 'layout-compose-3-match-card.png') });
  await unlink(['subscription:' + ids.sub, 'solution:' + ids.svc]);
  await page.waitForFunction(() => document.querySelector('.layout-node .lyt-area .lyt-card[data-tpl="basic~svc-sac.svc-mobile.svc-sub"]'));
  assert.deepEqual(await flowNames(area.locator('.lyt-card').nth(0)), ['제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '유관 사례']);
  assert.equal(llm.calls.length, 1, '매칭을 바꿔도 모델을 다시 부르지 않음');
  pass('DSS 연결에 따라 제품 제안 · 솔루션 제안 · 서비스 제안(갈래: 케어 · 구독)이 들고 남 · 서비스 칸 = 서비스 + 구독');

  // ---- 매칭 팝업: 최상위 폴더 제품 · 솔루션 · 서비스 · 사례, 서비스 폴더에 서비스 분류 솔루션 + 구독
  await page.locator('.match-node .dss-sec.service .dss-h').click();
  const mt = page.locator('.mt-live-pop'); await mt.waitFor();
  assert.deepEqual((await mt.locator('.ex-nd.top .ex-nl').allInnerTexts()).map((x) => x.trim()), ['제품', '솔루션', '서비스', '사례']);
  assert.match(await mt.locator('.ex-crumb b').first().innerText(), /전체 서비스/);
  assert.deepEqual((await mt.locator('.ex-list .ex-sh').allInnerTexts()).map((x) => x.replace(/\d+$/, '').trim()), ['서비스', 'B2B 삼성 AI 구독'], '서비스 폴더 = 서비스 · B2B 삼성 AI 구독 묶음');
  const svcRows = await mt.locator('.ex-list .ex-row').evaluateAll((els) => els.map((e) => e.querySelector('[data-catalog-ref]')?.dataset.catalogRef || ''));
  assert.ok(svcRows.some((r) => r.startsWith('subscription:')) && svcRows.some((r) => r.startsWith('solution:')), '서비스 폴더 = 서비스 분류 솔루션 + 구독: ' + svcRows.join(','));
  await mt.locator('.ex-list .ex-row').filter({ has: page.locator('[data-catalog-ref="subscription:' + ids.sub + '"]') }).first().click();
  await page.waitForFunction((sid) => !!document.querySelector('.match-node .dss-sec.service [data-ref="subscription:' + sid + '"]'), ids.sub);
  await page.screenshot({ path: path.join(out, 'layout-compose-3b-services-folder.png') });
  await page.keyboard.press('Escape'); await mt.waitFor({ state: 'detached' });
  await unlink(['subscription:' + ids.sub]);
  pass('매칭 팝업 서비스 폴더(서비스 + 구독)에서 누르면 바로 연결 · 서비스 칸에 보임');

  // ---- 구성 고르기(사용자 지시 2026-11-16): 카드 전체 클릭 · '>' 없음 → '샘플 보기'만 상세(시작 버튼 없음) · 기본 · 상세는 고르는 버튼 ·
  //      상자 아래 '제안서 작성하기'(고른 게 없으면 꺼짐 + 말풍선) → 확인 → 레이아웃 구성 버블이 빠지고 자동 구성
  assert.equal(await area.locator('.lyt-go').count(), 0, "'>' 표시 없음");
  await area.locator('.lyt-card').nth(0).getByRole('button', { name: /샘플 보기/ }).click();
  const detail = page.locator('.modal.tocd'); await detail.waitFor();
  await detail.locator('.tocv-th').first().waitFor({ timeout: 15000 });
  assert.deepEqual((await detail.locator('.tocd-flow .tocmf-i .node-name').allInnerTexts()).map((x) => x.trim()), ['제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '유관 사례', '제품 스펙']);
  assert.equal(await detail.getByRole('button', { name: /이 구성으로 시작|제안서 작성하기/ }).count(), 0, '샘플 팝업에는 시작 버튼이 없음');
  await page.screenshot({ path: path.join(out, 'layout-compose-2d-sample.png') });
  await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' });
  assert.equal(await area.locator('.lyt-card.on').count(), 0, '샘플을 봐도 고르지는 않음');
  const writeBtn = page.locator('.layout-node').getByRole('button', { name: '제안서 작성하기' });
  assert.ok(await writeBtn.isDisabled(), '고른 구성이 없으면 제안서 작성하기 꺼짐');
  await page.locator('.layout-node .lock-tip').last().hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#lyt-start-hint')).opacity === '1');
  assert.match(await page.locator('#lyt-start-hint').innerText(), /기본 제안 · 상세 제안 중 하나를 선택하세요/);
  // 버블을 눌러도 · 카드 아무 곳을 눌러도 고른다(하나만)
  await area.locator('.lyt-card').nth(1).locator('.tocmf-i').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.layout-node .lyt-card.on').length === 1 && document.querySelectorAll('.layout-node .lyt-card')[1].classList.contains('on'));
  await area.locator('.lyt-card').nth(0).locator('.lyt-hit').click({ position: { x: 300, y: 14 } });
  await page.waitForFunction(() => document.querySelectorAll('.layout-node .lyt-card.on').length === 1 && document.querySelectorAll('.layout-node .lyt-card')[0].classList.contains('on'));
  assert.deepEqual(await area.locator('[role="radio"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-checked'))), ['true', 'false']);
  assert.ok(await writeBtn.isEnabled(), '고르면 켜짐');
  const box = await area.boundingBox(); const wb = await writeBtn.boundingBox();
  assert.ok(wb.y >= box.y + box.height, "'제안서 작성하기'는 결과 상자 아래(바깥)");
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(out, 'layout-compose-2e-picked.png') });
  await writeBtn.click();
  const start = page.getByRole('dialog').filter({ hasText: '구성으로 진행할까요' }); await start.waitFor();
  assert.match(await start.locator('.modal-title, h2, header').first().innerText(), /‘기본 제안’ 구성으로 진행할까요\?/);
  assert.doesNotMatch(await start.innerText(), /매칭/, '확인 팝업은 매칭이 아니라 구성을 묻는다');
  assert.deepEqual(await flowNames(start.locator('.lyt-go-flow')), ['제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '유관 사례'], '고른 구성의 목차 흐름');
  await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, 'layout-compose-2g-confirm.png') });
  await start.getByRole('button', { name: '제안서 작성하기' }).click();
  await page.locator('.board .col').first().waitFor();
  await page.locator('.layout-node').waitFor({ state: 'detached' });
  // 공간별 제안이 있으면 작업을 올리기 전에 공간 구성을 먼저 준비한다(조감도는 기다리지 않음) — 올라갈 때까지 기다린다
  for (let i = 0; i < 100 && !jobs.length; i++) await page.waitForTimeout(100);
  assert.equal(jobs.length, 1); assert.equal(jobs[0].body.template.id, 'basic~svc-sac.svc-mobile.svc-sub');
  assert.deepEqual(jobs[0].body.parts.filter((x) => !x.deck).map((x) => x.toc), ['overview', 'needs', 'space', 'sol', 'case', 'pspec']);
  assert.deepEqual((await page.locator('.board .col .node-name').allInnerTexts()).map((x) => x.trim()), ['제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '유관 사례', '제품 스펙'], 'Storyboard 목차 버블 = 관리자 파트 이름 · 제품 스펙은 맨 끝에 놓임');
  // 서비스를 뺀 구성의 솔루션 파트에는 서비스 장(삼성케어플러스)이 다시 들어가지 않는다
  assert.ok(jobs[0].body.parts.find((x) => x.toc === 'sol').exemplar.every((e) => !/^L_VS_SOL_SVC/.test(e.f)), '서비스를 뺀 구성의 솔루션 견본에 서비스 장이 없어야 함');
  assert.equal(await page.locator('.board .end-node, .board .conn-plus').count(), 0, '자동 구성 중에는 목차 직접 추가가 없어야 함');
  // 레이아웃 구성 버블이 빠졌으니 진행 · 멈추기는 작업 카드에서
  // 작업 알림(알림 칸 · 상단 바 작업 상태 자리 어디에 그리든 같은 알림)에 '레이아웃 자동 구성'이 멈추기와 함께 뜬다
  const jobNotice = () => page.evaluate(async () => (await import('/src/services/notifications.js')).notificationSnapshot()
    .filter((n) => /레이아웃 자동 구성/.test(String(n.message || '') + String(n.title || ''))).map((n) => ({ kind: n.kind, act: n.slotAction && n.slotAction.label })));
  await page.waitForFunction(async () => (await import('/src/services/notifications.js')).notificationSnapshot().some((n) => /레이아웃 자동 구성/.test(String(n.message || '') + String(n.title || ''))));
  assert.deepEqual(await jobNotice(), [{ kind: 'progress', act: '멈추기' }], '도는 동안 멈추기');
  const conns = await page.locator('.board > .conn').count();
  assert.equal(conns, 1 + 6, '연결선: 요구사항 → 매칭 하나 + 목차 6개 앞(레이아웃 구성 버블 연결선 없음)');
  await page.screenshot({ path: path.join(out, 'layout-compose-2f-started.png') });
  pass("구성 고르기 → '샘플 보기'(시작 버튼 없음) · 고르는 버튼 · '제안서 작성하기'(고르기 전 꺼짐 + 말풍선) → 확인 → 버블 빠지고 자동 구성 · 작업 카드에 멈추기");

  jobs[0].released = true;
  await page.waitForFunction(() => document.querySelector('.board .lay-failed'), null, { timeout: 20000 });
  while (await page.locator('.feedback-popups .feedback-close').count()) await page.locator('.feedback-popups .feedback-close').first().click();
  const endNode = page.locator('.board .end-node');
  await endNode.waitFor();
  assert.equal((await endNode.locator('.node-name').innerText()).trim(), '추가', "끝 버블 이름은 '추가'(사용자 지시 2026-11-17)");
  assert.equal(await endNode.getByRole('button', { name: /AI로 나머지 구성/ }).count(), 0, 'AI로 나머지 구성 버튼은 없어야 함');
  assert.equal(await endNode.locator('.story-empty-hint').count(), 0, '끝 버블에 레이아웃 장 수가 없어야 함');
  assert.equal(await page.locator('.layout-node').count(), 0, '실패한 목차가 있어도 레이아웃 구성 버블은 다시 나오지 않음');
  assert.equal(await page.locator('.board .lay-failed').getByRole('button', { name: '다시 구성' }).count(), 1, '실패한 목차는 그 열에서 다시 구성');
  await page.waitForFunction(async () => !(await import('/src/services/notifications.js')).notificationSnapshot().some((n) => /레이아웃 자동 구성/.test(String(n.message || '') + String(n.title || ''))), null, { timeout: 8000 });
  pass("구성이 끝나면 '추가' 버블(AI로 나머지 구성 · 장 수 없음) · 실패한 목차는 그 열의 다시 구성 · 끝난 작업 카드는 치움");

  // ---- 목차 추가 팝업: 관리자 파트 10개 · 설명 · 이미 있는 것은 추가됨 · DSS 없는 파트는 먼저 추가하라고
  await endNode.locator('.end-plus').click();
  const add = page.locator('.modal.part-add'); await add.waitFor();
  assert.deepEqual(await add.locator('.pa-row').evaluateAll((els) => els.map((e) => e.dataset.part)), ['overview', 'ua', 'needs', 'space', 'value', 'sol', 'pspec', 'svc', 'case', 'why'], '관리자 전체 파트 10개 · 목록 순서(구독 상품 제안은 서비스 제안의 갈래)');
  assert.deepEqual((await add.locator('.pa-tx b').allInnerTexts()).map((x) => x.trim()), ['제안 개요', '시장 분석 (MI)', '가치 제안 (VP)', '제품 제안', '고객/공간 시나리오', '솔루션 제안', '제품 스펙', '서비스 제안', '유관 사례', 'Why Samsung']);
  assert.equal(await add.locator('.pa-d').count(), 10, '파트마다 설명 한 줄');
  assert.deepEqual(await add.locator('.pa-row.added').evaluateAll((els) => els.map((e) => e.dataset.part)), ['overview', 'needs', 'space', 'sol', 'pspec', 'case']);
  assert.deepEqual(await add.locator('.pa-row.lack').evaluateAll((els) => els.map((e) => e.dataset.part)), ['svc'], '케어 서비스 · 구독이 없으면 서비스 제안은 고를 수 없음');
  // 추가 · 추가됨은 크게(같은 크기) · 더보기 버튼은 없다
  assert.equal(await add.locator('.pa-more').count(), 0, '더보기 버튼은 없어야 함');
  const sizeOf = (el) => { const c = getComputedStyle(el); return { h: el.getBoundingClientRect().height, f: parseFloat(c.fontSize), t: el.innerText.trim() }; };
  const addSize = await add.locator('.pa-row[data-part="why"] .pa-add').evaluate(sizeOf);
  const doneSize = await add.locator('.pa-row[data-part="overview"] .pa-add').evaluate(sizeOf);
  assert.ok(addSize.t === '추가' && addSize.h >= 40 && addSize.f >= 15, '추가 버튼은 크게: ' + JSON.stringify(addSize));
  assert.ok(doneSize.t === '추가됨' && doneSize.h === addSize.h && doneSize.f === addSize.f, '추가됨도 같은 크기: ' + JSON.stringify(doneSize));
  // 줄을 누르면 펼쳐져 이 업종 덱의 그 파트 장이 크게 보인다 · 다시 누르면 접힌다
  const whyHead = add.locator('.pa-row[data-part="why"] .pa-head');
  await whyHead.click();
  assert.equal(await whyHead.getAttribute('aria-expanded'), 'true');
  await add.locator('.pa-row[data-part="why"] .pa-sheet .slide').first().waitFor({ timeout: 15000 });
  assert.ok(await add.locator('.pa-row[data-part="why"] .pa-sheet').count() >= 3, 'Why Samsung 장이 보여야 함');
  const sheetW = (await add.locator('.pa-row[data-part="why"] .pa-sheet-s').first().boundingBox()).width;
  assert.ok(sheetW >= 240, '펼친 장은 크게(240px 이상): ' + sheetW);
  assert.equal(jobs.length, 1, '줄을 누르는 것만으로는 추가하지 않음');
  // 펼친 줄은 팝업 위쪽으로 올라간다 → 장에 마우스를 대면 그 장 아래로 상세
  await page.waitForTimeout(700);
  const oneSheet = add.locator('.pa-row[data-part="why"] .pa-sheet').nth(1);
  await oneSheet.hover();
  const hov = page.locator('.hovercard.pa-hover'); await hov.waitFor();
  await hov.locator('.slide').waitFor();
  const sb = await oneSheet.locator('.pa-sheet-s').boundingBox(); const hb = await hov.boundingBox();
  assert.ok(hb.y >= sb.y + sb.height - 1, '상세는 장 아래에: ' + JSON.stringify({ sb, hb }));
  assert.ok(hb.width >= 600, '상세는 크게: ' + hb.width);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, 'layout-compose-4-part-add.png') });
  await page.mouse.move(5, 5); await hov.waitFor({ state: 'detached' });
  await whyHead.click();
  assert.equal(await add.locator('.pa-row[data-part="why"] .pa-sheet').count(), 0, '다시 누르면 접힘');
  // 서비스 — 먼저 추가하라고 → '서비스 추가'는 매칭 팝업의 서비스 폴더로
  assert.equal((await add.locator('.pa-row[data-part="svc"] .pa-add').innerText()).trim(), '서비스 필요');
  await add.locator('.pa-row[data-part="svc"] .pa-add').click();
  const lackNote = add.locator('.pa-row[data-part="svc"] .pa-lack'); await lackNote.waitFor();
  assert.match(await lackNote.innerText(), /서비스가 없어요 · 먼저 서비스를 추가해 주세요/);
  assert.equal(jobs.length, 1, 'DSS 가 없으면 추가하지 않음');
  await lackNote.getByRole('button', { name: '서비스 추가' }).click();
  await add.waitFor({ state: 'detached' });
  await page.locator('.mt-live-pop').waitFor();
  assert.match(await page.locator('.mt-live-pop .ex-crumb b').first().innerText(), /전체 서비스/);
  await page.keyboard.press('Escape'); await page.locator('.mt-live-pop').waitFor({ state: 'detached' });
  pass('목차 추가 팝업: 관리자 파트 10개 · 설명 · 큰 추가 / 추가됨 · 줄을 누르면 펼쳐져 큰 장 + 아래로 상세 · DSS 없으면 먼저 추가(매칭 서비스 폴더)');

  // ---- Why Samsung 추가 → 제품 스펙 앞에 놓이고 그 목차만 자동 구성
  await endNode.locator('.end-plus').click(); await add.waitFor();
  await add.locator('.pa-row[data-part="why"] .pa-add').click();
  await add.waitFor({ state: 'detached' });
  await page.waitForFunction(() => [...document.querySelectorAll('.board .col .node-name')].some((e) => e.textContent.trim() === 'Why Samsung'));
  assert.equal(jobs.length, 2); assert.deepEqual(jobs[1].body.parts.map((x) => x.toc), ['why'], '추가한 목차만 자동 구성');
  assert.ok(jobs[1].body.parts[0].exemplar.length >= 3 && jobs[1].body.parts[0].exemplar.every((e) => /^L_VS_(DIV|WHY|END)/.test(e.f)), 'Why Samsung 견본 장: ' + jobs[1].body.parts[0].exemplar.map((e) => e.f).join(','));
  const names = async () => (await page.locator('.board .col .node-name').allInnerTexts()).map((x) => x.trim());
  assert.deepEqual(await names(), ['제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '유관 사례', 'Why Samsung', '제품 스펙'], '추가한 목차는 제품 스펙 앞(제품 스펙은 맨 끝)');
  await page.waitForFunction(() => { const c = [...document.querySelectorAll('.board .col')].find((x) => x.querySelector('.node-name').textContent.trim() === 'Why Samsung'); return c && c.querySelectorAll('.lcard').length > 0; }, null, { timeout: 15000 });
  pass('Why Samsung 추가 → 제품 스펙 앞 · 그 목차만 구성');

  // ---- 끌어서 옮기기: Why Samsung → 맨 앞 · 제품 스펙은 끌 수 없고 맨 끝 그대로
  while (await page.locator('.feedback-popups .feedback-close').count()) await page.locator('.feedback-popups .feedback-close').first().click();
  const colOf = (name) => page.locator('.board .col').filter({ has: page.locator('.node-name', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) }).first();
  assert.equal(await colOf('제품 스펙').locator('.node').getAttribute('draggable'), null, '제품 스펙 버블은 끌 수 없음');
  assert.equal(await colOf('Why Samsung').locator('.node').getAttribute('draggable'), 'true');
  // 실제 마우스로 끌면 브라우저가 dragstart 를 낸다(아래 한 번은 제자리에 놓기) — 옮기는 자리는 드래그 이벤트를 직접 보내 확인한다(가로로 긴 캔버스에서 Playwright dragTo 는 끌기를 시작하지 못한다)
  await page.evaluate(() => { window.__dnd = []; document.addEventListener('dragstart', (e) => window.__dnd.push(e.target.className), true); });
  const bb = await colOf('Why Samsung').locator('.node').boundingBox();
  await page.mouse.move(bb.x + 38, bb.y + 38); await page.mouse.down(); await page.mouse.move(bb.x + 52, bb.y + 40, { steps: 5 }); await page.mouse.up();
  assert.ok((await page.evaluate(() => window.__dnd)).some((c) => /movable/.test(c)), '버블을 마우스로 끌면 끌기가 시작돼야 함');
  // name 목차를 to 목차의 왼쪽(before) · 오른쪽 절반에 놓는다
  const movePartTo = (name, to, side) => page.evaluate(([a, b, side]) => {
    const col = (n) => [...document.querySelectorAll('.board .col')].find((c) => c.querySelector('.node-name').textContent.trim() === n);
    const src = col(a).querySelector('.node'); const tgt = col(b); const r = tgt.getBoundingClientRect();
    const dt = new DataTransfer(); const at = { clientX: side === 'left' ? r.left + 10 : r.right - 10, clientY: r.top + 40, bubbles: true, cancelable: true, dataTransfer: dt };
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return new Promise((ok) => setTimeout(() => { tgt.dispatchEvent(new DragEvent('dragover', at)); setTimeout(() => { tgt.dispatchEvent(new DragEvent('drop', at)); src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); ok(); }, 50); }, 50));
  }, [name, to, side]);
  await movePartTo('Why Samsung', '제안 개요', 'left');
  await page.waitForFunction(() => document.querySelector('.board .col .node-name').textContent.trim() === 'Why Samsung');
  assert.deepEqual(await names(), ['Why Samsung', '제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '유관 사례', '제품 스펙']);
  // 제품 스펙 뒤(맨 끝)로 끌어도 제품 스펙 앞에 놓인다
  await movePartTo('제안 개요', '제품 스펙', 'right');
  await page.waitForFunction(() => [...document.querySelectorAll('.board .col .node-name')].map((e) => e.textContent.trim())[5] === '제안 개요');
  assert.deepEqual(await names(), ['Why Samsung', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '유관 사례', '제안 개요', '제품 스펙'], '제품 스펙은 맨 끝에 남음');
  await page.screenshot({ path: path.join(out, 'layout-compose-5-moved.png') });
  pass('목차 버블 끌어서 옮기기 · 제품 스펙은 맨 끝 고정');

  // ---- 지우기: 확인 팝업 — 취소하면 그대로, 확인하면 지움
  const why = colOf('Why Samsung');
  await why.hover();
  await why.locator('.part-del').click();
  const del = page.getByRole('dialog').filter({ hasText: '목차를 지울까요?' }); await del.waitFor();
  assert.match(await del.innerText(), /‘Why Samsung’ 목차와 레이아웃 \d+장을 Storyboard에서 지워요/);
  await del.getByRole('button', { name: '취소' }).click(); await del.waitFor({ state: 'detached' });
  assert.equal(await colOf('Why Samsung').count(), 1, '취소하면 그대로');
  await why.hover(); await why.locator('.part-del').click(); await del.waitFor();
  await del.getByRole('button', { name: '목차 지우기' }).click(); await del.waitFor({ state: 'detached' });
  await page.waitForFunction(() => ![...document.querySelectorAll('.board .col .node-name')].some((e) => e.textContent.trim() === 'Why Samsung'));
  assert.equal((await names()).length, 6);
  pass('목차 지우기는 확인 팝업 뒤에만');

  assert.deepEqual(errors, [], '페이지 오류: ' + errors.join(' | '));
  console.log('ALL PASS');
} finally {
  if (browser) await browser.close();
  await server.close();
}
