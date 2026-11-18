// 원문 매칭 — 고객 요구사항을 저장하면 원문에 글로 적힌 제품 · 솔루션 · 공간을 찾아 매칭 카드에 바로 넣는다.
// 격리 서버(계정 자료 · 조감도 히스토리는 임시 폴더) + 모델 답은 고정값.
//   저장 → 매칭 카드에 shimmer와 '매칭 추론 중'만 → 모델명은 바로 · 비슷한 항목은 후보에서 골라 연결 → 공간과 짝지어진 제품은 공간 묶음,
//   나머지는 미배치 · 원문에 없는 답은 버림 · 찾은 것이 없으면 그대로 · 실패하면 카드 아래 '다시 시도' · 사람이 뺀 항목은 다시 넣지 않음 ·
//   추론하는 동안 '구성 생성하기'는 꺼져 있다 · 공간은 원문 이름 그대로, 업종 자료에 없는 공간도 남는다 ·
//   '종류 : 모델 코드 공간 수량' 메모는 모델마다 · 공간마다(모델이 코드를 종류 이름에 뭉쳐 답해도) · 예전 판이 넣은 결과는 새 결과로 바뀐다.
// CHROME=<Chrome 실행 파일> node app/tests/match-extract-ui.mjs   (CHROME이 없으면 Playwright Chromium)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'winmate-match-extract-'));
const output = path.join(root, 'app/tests/output/match-extract'); fs.mkdirSync(output, { recursive: true });
const apiPort = process.env.MATCH_EXTRACT_API_PORT || '15474', webPort = process.env.MATCH_EXTRACT_WEB_PORT || '15475', base = 'http://127.0.0.1:' + webPort;
process.env.WINMATE_API_PORT = apiPort; process.env.WINMATE_WEB_PORT = webPort;
// 계정 자료(WINMATE_ACCOUNT_DATA_DB)도 반드시 임시 파일로 — 이 값을 주지 않으면 격리 서버가 실제 app/data/runtime/account_data.sqlite(관리자 계정의 제안서)에 쓴다
const api = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/spatial/server.py'], { cwd: root, env: { ...process.env, WINMATE_AUTH_DIR: path.join(temporary, 'auth'), WINMATE_ACCOUNT_DATA_DB: path.join(temporary, 'account_data.sqlite'), WINMATE_SPATIAL_DB: path.join(temporary, 'spatial.sqlite'), WINMATE_STORYBOARD_DIR: path.join(temporary, 'storyboards') } });
let apiLog = ''; api.stdout.on('data', (v) => apiLog += v); api.stderr.on('data', (v) => apiLog += v);
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), cacheDir: path.join(temporary, 'vite-cache'), logLevel: 'error', server: { host: '127.0.0.1', port: Number(webPort), strictPort: true, hmr: false } });
let browser, page; const checks = [], errors = [], prompts = { mention: [], pick: [], other: [] };
const pass = (m) => { checks.push(m); console.log('PASS ' + m); };
const shot = (name) => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });

const OFFICE = '본사 1층 로비에 더 월을 설치하고, 회의실마다 전자칠판을 두고 싶습니다. 로비 안내에는 QM55C 사이니지도 씁니다.\n콘텐츠는 매직인포로 원격 관리하고, 직원 휴게실에는 공기청정기가 필요합니다. 태블릿도 몇 대 필요합니다.';
const PLAIN = '매장 운영 인력을 줄이고 고객 응대 품질을 높이고 싶습니다. 예산은 내년 상반기에 확정됩니다.';
const CAFE = '카운터 위에 메뉴보드를 달고 싶습니다.';
// 제안 메모 — 종류 이름 아래에 '모델 코드 + 공간 + 수량'이 나열된 글(들여쓰기 · 빈 줄이 많다)
const MEMO = `파트너사 한빛이엔지에 에어드레서와 공청기를 제안하려고 합니다.- 파트너사 개요


  .사무실 총 면적은 60평 규모로 대표실(5평), 실장실(5평), 회의실(5평), 탕비실(5평), 직원근무공간(40평)으로 구성


- 제안 품목


  .에어드레서 : 점심 식사 이후 외투에 밴 음식 냄새를 처리하고
                      외부 거래선 미팅시 정갈한 인상을 줄 수 있는 솔루션 제시
                      DF90H24R4B 탕비실 1대,  DF18CB8700CRA1 대표실 1대
  .공기청정기 : 겨울철 난방과 외기 온도 하락으로 자연 환기 어려운 환경으로
                      공기청정기를 통한 실내 공기 관리 필요
                      AP90H03193EGD 대표실 1대,실장실용 1대, 


                      AP90H10163EDD 직원사무실 1대`;
// 모델 답(1 추출) — 일부러 원문에 없는 것(키오스크 · VXT · 주차장)과 같은 표현을 두 번 섞는다
let failMention = 0, gate = null;
const mention = (prompt) => {
  if (prompt.includes(PLAIN.slice(0, 20))) return { vertical: 'rt_small', products: [], solutions: [], spaces: [] };
  // 메모: 실제로 받았던 답처럼 코드 넷을 종류 이름 둘에 뭉치고(코드는 alias에), '실장실용 1대'는 공간 관계에서 빠뜨린다
  if (prompt.includes('에어드레서와 공청기를 제안')) return { vertical: 'of_sme', products: [
    { name: '에어드레서', alias: ['DF90H24R4B', 'DF18CB8700CRA1'], spaces: ['탕비실', '대표실'] }, { name: '공기청정기', alias: ['AP90H03193EGD', 'AP90H10163EDD'], spaces: ['대표실', '직원사무실'] },
    { name: '공청기', alias: ['공기청정기'], spaces: [] },
  ], solutions: [], spaces: ['대표실', '실장실', '회의실', '탕비실', '직원근무공간', '직원사무실', '사무실'] };
  if (prompt.includes('카운터 위에 메뉴보드')) return { vertical: 'fb_cafe', products: [{ name: '메뉴보드', alias: ['디지털 메뉴보드'], spaces: ['카운터'] }, ...(prompt.includes('키오스크도') ? [{ name: '키오스크', alias: [], spaces: [] }] : [])], solutions: [], spaces: ['카운터'] };
  return { vertical: 'of_hq', products: [
    { name: '더 월', alias: ['The Wall', 'LED 사이니지'], spaces: ['1층 로비'] }, { name: '전자칠판', alias: [], spaces: ['회의실'] },
    { name: 'QM55C 사이니지', alias: [], spaces: ['로비'] }, { name: '공기청정기', alias: [], spaces: ['직원 휴게실'] }, { name: '태블릿', alias: ['갤럭시 탭'], spaces: [] },
    { name: '키오스크', alias: [], spaces: ['1층 로비'] }, { name: '더월', alias: [], spaces: [] },
    ...(prompt.includes('@') ? [{ name: '@스마트 사이니지 QM65C', alias: [], spaces: ['회의실'] }] : []),
  ], solutions: [{ name: '매직인포', alias: ['MagicINFO'] }, { name: 'VXT', alias: [] }], spaces: ['1층 로비', '회의실', '로비', '직원 휴게실', '주차장'] };
};
// 모델 답(2 고르기) — 프롬프트의 표현 key와 후보를 읽어 답한다. 태블릿은 '맞는 것 없음', 공기청정기에는 후보에 없는 id도 섞는다
const pick = (prompt) => {
  const keys = Object.fromEntries([...prompt.matchAll(/\[([PSR]\d+)\] “([^”]+)”/g)].map((m) => [m[2], m[1]]));
  const spaceId = (re) => (prompt.match(new RegExp('^(\\S+) \\| [^|\\n]*' + re + '[^|\\n]* \\| 주 업종$', 'm')) || [])[1] || '';
  const out = { products: [], solutions: [], spaces: [] };
  const P = { '더 월': ['thewall'], '전자칠판': ['flip'], '공기청정기': ['purifier', 'not-a-product'], '태블릿': [], '메뉴보드': ['qm55c'], '키오스크': ['kiosk'] };
  for (const [name, ids] of Object.entries(P)) if (keys[name] && keys[name][0] === 'P') out.products.push({ key: keys[name], ids });
  if (keys['매직인포']) out.solutions.push({ key: keys['매직인포'], id: 'magicinfo' });
  if (keys['직원 휴게실']) out.spaces.push({ key: keys['직원 휴게실'], id: spaceId('라운지') });
  if (keys['실장실']) out.spaces.push({ key: keys['실장실'], name: '실장실', id: spaceId('대표실') }); // 억지 연결 — 실장실은 대표실이 아니다
  for (const name of ['직원근무공간', '직원사무실']) if (keys[name]) out.spaces.push({ key: keys[name], name, id: spaceId('업무 공간') });
  return out;
};
const answer = (prompt) => {
  if (prompt.includes('고객 요구사항 원문에서 고객이 도입')) { prompts.mention.push(prompt); if (failMention > 0) { failMention--; return null; } return mention(prompt); }
  if (prompt.includes('삼성 카탈로그의 항목과 연결하세요')) { prompts.pick.push(prompt); return pick(prompt); }
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
  // 요약 작업은 이 검사의 대상이 아니다 — 서버가 요약 기능을 알리지 않게 한다(요약이 필요한 장면은 끝난 요약을 미리 넣어 둔다)
  const noSummary = async (route) => { const response = await route.fetch(); const json = await response.json(); const caps = json.capabilities || json; if (caps && caps.functions) delete caps.functions.requirements; return route.fulfill({ response, json }); };
  await context.route((url) => ['/api/bootstrap', '/api/poc/capabilities'].includes(url.pathname), noSummary);
  await context.route((url) => url.pathname === '/api/llm', async (route) => {
    const body = route.request().postDataJSON(); const data = answer(String(body.prompt || ''));
    if (gate) await gate.promise;
    return data ? route.fulfill({ json: { mode: 'real', data } }) : route.fulfill({ status: 503, json: { detail: 'model down (test)' } });
  });
  await context.route((url) => url.pathname === '/api/jobs', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 503, json: { detail: 'no job expected here' } }) : route.continue()));
  await context.addInitScript(() => { if (!localStorage.getItem('match-extract-seeded')) { localStorage.setItem('match-extract-seeded', '1'); localStorage.setItem('winmate.v2.proposals', '[]'); localStorage.setItem('winmate.v2.seedv', 'admin-samples-1'); localStorage.setItem('winmate.v2.review-example-proposals.seedv', 'skip-match-extract'); } });
  page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/spatial'); await page.locator('.sp-home-launches').waitFor({ timeout: 120000 });
  const routes = await page.evaluate(async ({ OFFICE, PLAIN, CAFE, MEMO }) => {
    const { historyPath } = await import('/src/services/shared-path.js');
    const req = (free) => ({ free, form: { project: '', customer: '', target: '', keymen: [], note: '' }, files: [] });
    const item = (text) => ({ text, kind: 'fact', refs: [] });
    const summary = { status: 'ready', sourceKey: 'older', jobId: 'job', result: { source_key: 'older', llm: { effective: 'llm' }, sources: [], coverage: { complete: true },
      summary: { overview: item('본사 로비와 회의실에 디스플레이를 새로 놓으려는 제안입니다.'), background: [], goals: [item('로비 인상 개선')], requirements: [item('회의실 전자칠판')], constraints: [], stakeholders: [], decision_criteria: [], risks: [], questions: [], strategy: [item('공간별 제안')] } } };
    const make = (id, title, free, extra = {}) => ({ id, title, customer: 'B사', ind: null, createdAt: 1, updatedAt: 1, stage: 'req', reqTab: 'free', req: req(free), ctx: { products: [], solutions: [], cases: [] }, parts: [], ...extra });
    const { requirementSourceKey } = await import('/src/domain/proposals/requirement-summary.js');
    // 예전 판(v1)이 같은 원문으로 끝낸 결과 — 종류마다 대표 제품 하나씩만 넣고 공간도 셋뿐이었다. 키오스크는 사람이 직접 연결한 것.
    const memo = make('mx-memo', '제안 메모', [{ t: MEMO }], { stage: 'match', ctx: { products: ['kiosk', 'sg_g000182178', 'sg_g000184126'], solutions: [], cases: [] },
      spacePlan: { v: 1, auto: true, vertical: { id: 'of_sme', name: '중소기업 오피스', group: 'OF' }, title: '원문에서 찾은 공간', summary: '', at: 1, spaces: [
        { id: 'of_sm_s5', name: '대표실', kind: 'lounge', note: '', color: 0, products: ['sg_g000182178', 'sg_g000184126'] }, { id: 'of_sm_s4', name: '탕비실', kind: 'lounge', note: '', color: 1, products: ['sg_g000182178'] },
        { id: 'of_sm_s2', name: '업무 공간', kind: 'office', note: '', color: 2, products: ['sg_g000184126'] }] } });
    memo.matchExtract = { v: 1, sourceKey: requirementSourceKey(memo), status: 'done', at: 1, refs: ['product:sg_g000182178', 'product:sg_g000184126'], last: { products: 2, solutions: 0, spaces: 3, placed: 2 } };
    const list = [
      make('mx-office', '원문 매칭 검증', [{ t: OFFICE + ' ' }, { ref: 'product:qm65c' }, { t: ' 도 회의실에 검토 중입니다.' }]),
      make('mx-plain', '언급 없는 요구사항', [{ t: PLAIN }]),
      make('mx-fail', '실패했다가 다시', [{ t: CAFE }], { stage: 'match', requirementSummary: summary }),
      memo,
    ];
    localStorage.setItem('winmate.v2.proposals', JSON.stringify(list));
    return Object.fromEntries(list.map((p) => [p.id, historyPath(p.id)]));
  }, { OFFICE, PLAIN, CAFE, MEMO });
  const proposal = (id) => page.evaluate(async (id) => structuredClone((await import('/src/repositories/proposals.js')).getProposal(id)), id);
  // 제안서 상태가 조건에 맞을 때까지 — page.waitForFunction 은 async 조건을 기다려 주지 않는다(Promise 는 늘 참)
  const until = async (id, test, timeout = 30000) => { const t0 = Date.now(); for (;;) { const q = await proposal(id); if (test(q)) return q; if (Date.now() - t0 > timeout) throw new Error('timed out waiting for ' + id + ': ' + JSON.stringify(q.matchExtract)); await new Promise((resolve) => setTimeout(resolve, 100)); } };
  const busy = (id) => page.evaluate(async (id) => (await import('/src/services/match-extract.js')).extractBusy(id), id);
  const card = page.locator('.match-node .match-card'), node = page.locator('.match-node .node');
  const reqPop = page.locator('#rq-pop');
  const save = async () => { await reqPop.getByRole('button', { name: '저장', exact: true }).click(); await reqPop.waitFor({ state: 'hidden' }); };
  const hold = () => { let release; const promise = new Promise((resolve) => { release = resolve; }); gate = { promise }; return () => { gate = null; release(); }; };
  const groups = () => page.locator('.match-node .dss-grp').evaluateAll((els) => els.map((el) => [el.querySelector('.dss-grp-n').textContent, [...el.querySelectorAll('.dss-prod')].map((x) => x.dataset.ref.replace('product:', ''))]));

  // ---------- 저장 → '매칭 추론 중'만 → 원문에서 찾은 것이 들어온다 ----------
  await page.goto(base + routes['mx-office']); await reqPop.waitFor({ timeout: 120000 });
  assert.equal(await page.locator('.match-node').count(), 0, 'only the 고객 요구사항 bubble before saving');
  let release = hold();
  await save();
  await page.locator('.match-card.mx-loading').waitFor();
  assert.equal((await card.innerText()).trim(), '매칭 추론 중', 'the card says only this while it runs');
  assert.equal(await card.getAttribute('role'), 'status'); assert.ok(await card.locator('.shimmer').count() >= 6);
  assert.equal(await card.locator('.dss-sec, .dss-prod, .dss-chip').count(), 0, 'not even the tagged product shows yet');
  assert.match(await node.getAttribute('class'), /is-busy/); assert.match(await node.getAttribute('aria-label'), /매칭 추론 중/);
  assert.equal(await page.locator('#dss-space').count(), 0); assert.equal(await busy('mx-office'), true);
  assert.equal((await proposal('mx-office')).matchExtract.status, 'pending');
  assert.deepEqual((await proposal('mx-office')).ctx.products, ['qm65c'], 'the @tag is linked by saving, as before');
  await shot('1-loading');
  release();
  await page.locator('.match-card:not(.mx-loading) .dss-sec').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('.match-node .node.is-busy'));
  let p = await until('mx-office', (q) => q.matchExtract.status === 'done');
  assert.deepEqual(p.ctx.products, ['qm65c', 'thewall', 'flip', 'qm55c', 'purifier'], 'model code at once · similar items from their candidates · nothing that is not in the text (키오스크) · nothing forced (태블릿)');
  assert.deepEqual(p.ctx.solutions, ['magicinfo']); assert.deepEqual(p.ctx.cases, []);
  assert.equal(p.matchExtract.status, 'done'); assert.deepEqual(p.matchExtract.last, { products: 4, solutions: 1, spaces: 3, placed: 5 });
  assert.equal(p.spacePlan.auto, true); assert.equal(p.spacePlan.vertical.id, 'of_hq');
  assert.deepEqual(await groups(), [['1층 로비', ['thewall', 'qm55c']], ['회의실', ['flip', 'qm65c']], ['직원 휴게실', ['purifier']]], 'grouped by the space the text names, under the name the text uses — like a saved 공간 구성');
  assert.deepEqual(p.spacePlan.spaces.map((x) => [x.id, x.kind]), [['of_hq_s1', 'reception'], ['of_sm_s3', 'meeting'], ['of_hq_s6', 'lounge']], '1층 로비 · 로비 are one space; each is tied to the industry space it is like');
  assert.equal(p.matchExtract.v, 2);
  assert.equal(await page.locator('.match-node .dss-grp.rest').count(), 0, 'every product has a space here');
  assert.equal(await page.locator('.match-node .dss-sec.solution .dss-chip').count(), 1);
  assert.match(await page.locator('#dss-space').innerText(), /공간 3/); assert.equal(await page.locator('#dss-space').isDisabled(), false);
  await page.locator('.pr-top .top-status').filter({ hasText: '원문에서 제품 4개 · 솔루션 1개 · 공간 3곳을 찾아 연결했어요' }).waitFor();
  assert.equal(prompts.mention.length, 1); assert.equal(prompts.pick.length, 1);
  assert.ok(prompts.mention[0].includes(OFFICE.split('\n')[1]) && prompts.mention[0].includes('@스마트 사이니지 QM65C') && prompts.mention[0].includes('of_hq | '), 'the whole text, tags by name, and the vertical list');
  const pk = prompts.pick[0];
  assert.ok(/\[P\d+\] “전자칠판”/.test(pk) && /\n {2}flip \| /.test(pk) && /\[R\d+\] “직원 휴게실”/.test(pk), 'asks about the similar ones, with candidates');
  assert.ok(!/“QM55C 사이니지”|“스마트 사이니지 QM65C”|“회의실”|“1층 로비”|“키오스크”|“VXT”|“주차장”/.test(pk), 'model codes · tags · same-name spaces need no question; what is not in the text is never asked');
  await shot('2-linked');
  pass('saving shows only 「매칭 추론 중」 with shimmer, then links what the text names — products grouped by their space');

  // ---------- 같은 요구사항을 다시 저장: 다시 묻지 않는다 · 사람이 뺀 항목은 돌아오지 않는다 ----------
  await page.locator('.start-node .node').click(); await reqPop.waitFor(); await save();
  await page.waitForTimeout(400);
  assert.equal(prompts.mention.length, 1, 'unchanged requirements are not read again'); assert.equal(await page.locator('.match-card.mx-loading').count(), 0);
  await page.evaluate(async () => (await import('/src/components/requirements.jsx')).removeRef('mx-office', 'product:flip'));
  await page.locator('.start-node .node').click(); await reqPop.waitFor();
  await page.locator('.rq-customer').fill('C 전자'); // 요구사항이 바뀌었다(고객사) → 다시 읽는다
  await save();
  await page.waitForFunction(() => document.querySelector('.match-node .node') && !document.querySelector('.match-node .node.is-busy') && !document.querySelector('.match-card.mx-loading'));
  assert.equal(prompts.mention.length, 2);
  p = await until('mx-office', (q) => q.matchExtract.status === 'done' && q.customer === 'C 전자');
  assert.deepEqual(p.ctx.products, ['qm65c', 'thewall', 'qm55c', 'purifier'], 'the product the person unlinked is not linked again');
  assert.deepEqual(p.matchExtract.last, { products: 0, solutions: 0, spaces: 0, placed: 0 });
  assert.deepEqual(await groups(), [['1층 로비', ['thewall', 'qm55c']], ['회의실', ['qm65c']], ['직원 휴게실', ['purifier']]]);
  pass('the same requirements are not read twice; after a change, nothing the person removed comes back and nothing is doubled');

  // ---------- 원문에 언급이 없으면 그대로 ----------
  await page.goto(base + routes['mx-plain']); await reqPop.waitFor({ timeout: 120000 });
  const before = { mention: prompts.mention.length, pick: prompts.pick.length };
  await save();
  await page.locator('.match-node .match-card').waitFor();
  p = await until('mx-plain', (q) => q.matchExtract?.status === 'done');
  assert.deepEqual(p.ctx, { products: [], solutions: [], cases: [] }); assert.equal(p.spacePlan, undefined);
  assert.equal(prompts.mention.length, before.mention + 1); assert.equal(prompts.pick.length, before.pick, 'nothing to link → no second question');
  assert.equal(await page.locator('.match-node .dss-empty').count(), 3); assert.equal(await page.locator('.match-node .mx-err').count(), 0);
  assert.equal(await page.locator('.pr-top .top-status').filter({ hasText: '원문에서' }).count(), 0);
  pass('requirements that name no product, solution or space leave the matching as it is');

  // ---------- 실패 → 카드 아래 다시 시도 · 추론하는 동안 구성 추천은 꺼져 있다 ----------
  await page.goto(base + routes['mx-fail']); await page.locator('.match-node').waitFor({ timeout: 120000 });
  const recButton = page.locator('.lyt-rec-btn'); await recButton.waitFor();
  await page.waitForFunction(() => !document.querySelector('.lyt-rec-btn').disabled);
  failMention = 1; // 서버가 답하지 못함(503) — 한 번 실패하면 그 자리에서 멈춘다
  await page.locator('.start-node .node').click(); await reqPop.waitFor(); await save();
  const err = page.locator('.match-node .mx-err'); await err.waitFor();
  assert.match(await err.innerText(), /다시 시도/); assert.equal((await proposal('mx-fail')).matchExtract.status, 'error');
  assert.equal(await page.locator('.match-card.mx-loading').count(), 0); assert.deepEqual((await proposal('mx-fail')).ctx.products, []);
  await page.locator('.pr-top .top-status').filter({ hasText: '원문에서 제품 · 솔루션 · 공간을 찾지 못했어요' }).waitFor();
  await shot('3-error');
  release = hold();
  await err.getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.locator('.match-card.mx-loading').waitFor(); assert.equal(await err.count(), 0);
  assert.equal(await recButton.isDisabled(), true, '구성 추천 waits for the matching');
  assert.match(await page.locator('#lyt-rec-hint').innerText(), /원문에서 제품 · 솔루션 · 공간을 찾는 중/);
  await shot('4-recommend-locked');
  release();
  await page.waitForFunction(() => !document.querySelector('.match-card.mx-loading') && !document.querySelector('.lyt-rec-btn').disabled);
  p = await until('mx-fail', (q) => q.matchExtract.status === 'done');
  assert.deepEqual(p.ctx.products, ['qm55c']); assert.equal(p.matchExtract.status, 'done'); assert.equal(p.spacePlan.vertical.id, 'fb_cafe');
  assert.deepEqual(await groups(), [['카운터', ['qm55c']]]); assert.equal(await page.locator('.match-node .mx-err').count(), 0);
  assert.doesNotMatch(await page.locator('#lyt-rec-hint').innerText(), /찾는 중/);
  // 원문에 제품이 하나 더 — 공간과 짝지어지지 않은 제품은 미배치
  await page.locator('.start-node .node').click(); await reqPop.waitFor();
  await page.locator('#free-ed').click(); await page.keyboard.press('End'); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.insertText(' 키오스크도 한 대 둡니다.');
  await save();
  await until('mx-fail', (q) => q.matchExtract.status === 'done' && q.ctx.products.length === 2);
  await page.locator('.match-node .dss-grp.rest').waitFor();
  assert.deepEqual(await groups(), [['카운터', ['qm55c']], ['미배치', ['kiosk']]], 'a product the text ties to no space is outside the spaces');
  await shot('5-unplaced');
  pass('a failure leaves a retry under the card; 구성 추천 is off while matching runs; a product without a space is 미배치');

  // ---------- 제안 메모: 모델 코드마다 · 공간마다, 그리고 예전 판의 결과를 바꿔 넣는다 ----------
  await page.goto(base + routes['mx-memo']); await page.locator('.match-node').waitFor({ timeout: 120000 });
  assert.deepEqual(await groups(), [['대표실', ['sg_g000182178', 'sg_g000184126']], ['탕비실', ['sg_g000182178']], ['업무 공간', ['sg_g000184126']], ['미배치', ['kiosk']]], 'what the older rules left: one product per kind, three spaces');
  const calls = { mention: prompts.mention.length, pick: prompts.pick.length };
  await page.locator('.start-node .node').click(); await reqPop.waitFor(); await save(); // 같은 원문 — 예전 판의 결과라 한 번 다시 읽는다
  p = await until('mx-memo', (q) => q.matchExtract.v === 2 && q.matchExtract.status === 'done');
  await page.waitForFunction(() => !document.querySelector('.match-card.mx-loading'));
  assert.equal(prompts.mention.length, calls.mention + 1);
  const memoPrompt = prompts.mention[prompts.mention.length - 1];
  assert.ok(memoPrompt.includes('모델 코드가 적혀 있습니다: DF90H24R4B, DF18CB8700CRA1, AP90H03193EGD, AP90H10163EDD'), 'the codes found by code are handed to the model');
  assert.deepEqual(p.ctx.products, ['kiosk', 'ec_360_059', 'sg_g000182163', 'sg_g000184122', 'sg_g000184124'], 'each model in the text (as written · with a suffix · the nearest of the series) — the two the older rules chose are gone, the one the person linked stays');
  assert.deepEqual(await groups(), [['대표실', ['sg_g000182163', 'sg_g000184122']], ['실장실', ['sg_g000184122']], ['회의실', []], ['탕비실', ['ec_360_059']], ['직원근무공간', ['sg_g000184124']], ['미배치', ['kiosk']]],
    'every space of the text, each model in the space written beside it — also 실장실용 1대, which the model left out');
  assert.deepEqual(p.spacePlan.spaces.map((x) => x.id), ['of_sm_s5', 'custom-space-실장실', 'of_sm_s3', 'of_sm_s4', 'of_sm_s2'], '실장실 is not in the industry data (and is not 대표실) → kept as its own space; 직원근무공간 · 직원사무실 are one');
  assert.equal(p.spacePlan.auto, true); assert.deepEqual(p.matchExtract.last, { products: 4, solutions: 0, spaces: 5, placed: 4 });
  assert.equal(await page.locator('.match-node .dss-grp[data-space="of_sm_s3"] .dss-grp-none').count(), 1, 'a space without a product is shown empty');
  await page.locator('.pr-top .top-status').filter({ hasText: '원문에서 제품 4개 · 공간 5곳을 찾아 연결했어요 · 예전에 넣은 2개는 뺐어요' }).waitFor();
  assert.match(await page.locator('#dss-space').innerText(), /공간 5/);
  const pk2 = prompts.pick.length > calls.pick ? prompts.pick[prompts.pick.length - 1] : '';
  assert.ok(!/“에어드레서”|“공기청정기”|“공청기”|“DF90H24R4B”/.test(pk2), 'the kind names are the models already linked — nothing more is chosen for them');
  await shot('6-memo');
  // 공간 구성 팝업에서도 그대로 — 직접 만든 공간(실장실)도 한 공간이다
  await page.locator('#dss-space').click(); await page.locator('#spl-pop').waitFor();
  await page.locator('#spl-pop .spl-space[data-space="custom-space-실장실"]').waitFor();
  assert.deepEqual(await page.locator('#spl-pop .spl-space[data-space]:not(.rest):not(.add) .spl-space-h b').allInnerTexts(), ['대표실', '실장실', '회의실', '탕비실', '직원근무공간']);
  await shot('7-memo-space-popup');
  pass('a memo of 「kind : code place quantity」 links every model to its own space, keeps every space of the text, and replaces what the older rules had put in');

  assert.deepEqual(errors, []); assert.deepEqual(prompts.other, [], 'no other model call');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: true, checks, errors }, null, 2));
  console.log('match extract ui ok ·', checks.length, 'checks');
} catch (error) { await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: false, checks, errors, prompts: prompts.other, error: String(error.stack || error) }, null, 2)); throw error; }
finally { gate = null; await browser?.close(); await server.close(); api.kill('SIGTERM'); await new Promise((resolve) => (api.exitCode != null ? resolve() : api.once('close', resolve))); fs.rmSync(temporary, { recursive: true, force: true }); }
