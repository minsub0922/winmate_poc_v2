// 레이아웃 구성의 운영 값(관리자 「레이아웃 구성 관리」 → /api/bootstrap 의 layout_presets)이 Storyboard 구성에 반영되는지 —
// 모델 · 서버 없이 화면 계약만 검사한다(API는 여기서 흉내 낸다).
//   (2026-11-16) '구성 생성하기'는 관리자가 켜 둔 구성을 운영 값의 순서로 · 고친 이름으로 보여 주고, DSS 가 없으면 DSS 파트만 뺀다(파트가 4개보다 적어지면 그 구성 그대로) ·
//   끈 구성은 생성 · 전체 구성 보기에서 빠짐 · 운영 값의 rev 가 생성 키에 들어간다(값이 바뀌면 '다시 생성' 안내).
// 실행: CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node app/tests/layout-presets-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const fn = { mode: 'real', ready: true, effective: 'llm' };
const presets = { v: 1, rev: 4, fixed: 'stdx', order: ['space', 'stdx', 'std', 'spacex', 'pain', 'build', 'prod', 'subs', 'roi'], // roi: 은퇴한 구성 — 순서에 남아 있어도 건너뛴다
  items: { pain: { enabled: false }, space: { name: '공간 가치형 제안서 (여정)', hint: '공간과 동선으로 경험을 보여 줘야 할 때' }, roi: { name: '은퇴한 구성' }, ghost: { enabled: false } } }; // ghost: 앱에 없는 구성 — 건너뛴다
const bootstrap = { catalog: read('catalog'), products: read('products_db'), images: read('images'), layout_presets: presets,
  capabilities: { provider: { available: true }, knowledge: { available: true }, functions: { storyboard: fn, requirements: fn, layout: fn, rfp: fn, review: fn } },
  user: { username: 'layout-presets-test', auth_enabled: false } };
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const errors = []; const pass = (m) => console.log('PASS', m);
const llm = { calls: [] };
let browser;

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
      llm.calls.push(req.postDataJSON());
      return route.fulfill({ json: { mode: 'real', data: { vertical: 'fb_qsr' } } });
    }
    return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.locator('.home').waitFor();
  await page.locator('.home-actions .start').click();
  await page.locator('.start-node').waitFor();

  // ---- 요구사항 저장 + 요약 완료(저장소에 직접 만든다) → 버블 아래 추천 4칸
  const pid = await page.evaluate(async () => {
    const repo = await import('/src/repositories/proposals.js');
    const dom = await import('/src/domain/proposals/requirement-summary.js');
    const sig = await import('/src/components/ctxconfirm.jsx');
    const p = repo.getProposals()[0];
    repo.update(p.id, (d) => {
      d.title = 'A 커피 디지털 메뉴보드'; d.customer = 'A 커피';
      d.req.free = [{ t: '전국 320개 매장 메뉴판을 디지털 메뉴보드로 바꾸고 본사에서 한 번에 콘텐츠를 바꾸고 싶다. 운영비 절감 효과를 숫자로 보고 싶다.' }];
      d.reqSaved = sig.reqSig(d); d.stage = 'match';
    });
    const q = repo.getProposal(p.id); const key = dom.requirementSourceKey(q);
    const it = (text) => ({ text, kind: 'fact', refs: [] });
    const summary = Object.fromEntries(dom.SUMMARY_SECTIONS.map(([k]) => [k, []]));
    Object.assign(summary, { overview: it('전국 매장 메뉴판을 디지털로 바꾸고 본사에서 일괄 운영하려는 제안'), goals: [it('메뉴 교체 시간 단축')], requirements: [it('본사 일괄 콘텐츠 배포')], strategy: [it('운영비 절감 수치 중심 제안')] });
    repo.update(p.id, (d) => { d.requirementSummary = { sourceKey: key, status: 'ready', result: { source_key: key, sources: [], summary, llm: { effective: 'llm' } } }; }, { touch: false });
    return p.id;
  });
  await page.keyboard.press('Escape');
  const node = page.locator('.layout-node');
  await node.locator('.lyt-rec-btn').waitFor();
  await page.waitForFunction(() => !document.querySelector('.layout-node .lyt-rec-btn').disabled);
  assert.equal(llm.calls.length, 0, '버튼을 누르기 전에 모델을 부름');
  await node.getByRole('button', { name: '구성 생성하기' }).click();
  const ask = page.getByRole('dialog').filter({ hasText: '매칭을 마쳤나요' });
  await ask.getByRole('button', { name: '구성 생성하기' }).click();
  await ask.waitFor({ state: 'detached' });
  const area = page.locator('.layout-node .lyt-area');
  await page.waitForFunction(() => document.querySelectorAll('.layout-node .lyt-area .lyt-card').length > 0 && !document.querySelector('.layout-node .lyt-area .lyt-card.sk'), null, { timeout: 15000 });
  // 켜 둔 구성 — 운영 값 순서(space · stdx · std · spacex · build · prod · subs) 뒤에 순서를 정하지 않은 기본 제안 · 상세 제안. pain 은 꺼짐.
  //   DSS 가 없으니 DSS 파트를 뺀 변형 — 파트가 4개보다 적어지는 구축형 · 제품 제안서는 그 구성 그대로
  assert.deepEqual(await area.locator('.lyt-card').evaluateAll((els) => els.map((e) => e.dataset.tpl)),
    ['space~sol', 'stdx~space.sol', 'std~space.sol', 'spacex~sol', 'build', 'prod', 'subs~space.subx', 'basic~space.sol.subx.svc', 'detail~space.sol.subx.svc']);
  assert.match(await area.locator('.lyt-card[data-tpl="space~sol"]').innerText(), /공간 가치형 제안서 \(여정\)/, '고친 이름이 변형 구성에도 보여야 함');
  assert.equal(await area.locator('.lyt-card-d, .lyt-tag').count(), 0, '설명 줄 · 꼬리표 없음');
  assert.equal(llm.calls.length, 1); assert.doesNotMatch(llm.calls[0].prompt, /구성 목록/, '모델은 업종만 고른다');
  const rec = await page.evaluate(async (id) => (await import('/src/repositories/proposals.js')).getProposal(id).layoutRec, pid);
  assert.ok(JSON.parse(rec.key).includes('presets:4'), '생성 키에 운영 값 rev 가 없음: ' + rec.key);
  pass('구성 생성 — 켜 둔 구성 · 운영 값 순서 · 고친 이름 · DSS 파트만 뺀 변형 · rev 가 키에');

  // ---- 전체 구성 보기(버블): 끈 구성 없이, 운영 값의 순서로(변형 아님 · 관리자 구성 그대로)
  await page.locator('.layout-node > .node-top .node').click();
  const all = page.getByRole('dialog').filter({ hasText: '전체 구성 보기' }).last();
  await all.locator('.lyt-all .lyt-card').first().waitFor();
  const shown = await all.locator('.lyt-all .lyt-card').evaluateAll((els) => els.map((e) => e.dataset.tpl));
  assert.deepEqual(shown, ['space', 'stdx', 'std', 'spacex', 'build', 'prod', 'subs', 'basic', 'detail']); // 은퇴한 구성(투자 효과형 · 경쟁 비교형 · 요구사항 대응형 · 구독 전환)은 없다
  assert.match(await all.innerText(), /제안서 구성 9종/);
  pass('전체 구성 보기에 끈 구성이 없고 순서가 운영 값을 따른다');

  if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
  console.log('ALL PASS');
} finally {
  if (browser) await browser.close();
  await server.close();
}
