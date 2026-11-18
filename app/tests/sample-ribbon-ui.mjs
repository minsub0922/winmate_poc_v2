// Storyboard '샘플 자료' 띠 — 아직 이 제안서 값이 아닌 장(레이아웃 견본 · 방향 확인을 기다리는 장)에만, 채운 장에는 없다.
//   시트 상세 · 카드 위 큰 미리보기 · 레이아웃 전체 보기(찜 버튼은 띠를 피해 왼쪽) · 넣을 내용 확인 팝업 · 레이아웃 추가 미리보기.
//   (추천 구성 상세의 띠 · 업종 선택 자리는 layout-compose-ui.mjs) 모델 · 서버 없이 화면 계약만.
// 실행: CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node app/tests/sample-ribbon-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'app/tests/output/sample-ribbon'); fs.mkdirSync(out, { recursive: true });
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'sample-ribbon-test', auth_enabled: false } };
const f = boot.catalog.layouts.find((l) => l.p === 'products').f;
const lay = (uid, extra) => ({ uid, f, status: 'empty', ov: { t: {}, img: {} }, ...extra });
const fixture = { id: 'ribbon-test', title: '샘플 띠 검증', customer: '검증 고객', ind: 'FB', stage: 'story', reqTab: 'free', createdAt: 1, updatedAt: 1,
  req: { free: [{ t: '매장 메뉴보드를 본사에서 한 번에 바꾸고 싶다' }], form: {}, files: [] },
  ctx: { products: ['qm55c'], solutions: [], cases: [] },
  parts: [{ id: 'part', name: '제품 제안', type: 'products', done: true, items: [], layouts: [
    lay('empty1'),
    lay('done1', { status: 'done', ov: { t: { 0: '이 고객 값으로 채운 제목' }, img: {} } }),
    lay('brief1', { adaptation: { version: 3, origin: 'manual', phase: 'brief', key: 'k', request: 'r' }, brief: { segs: [{ t: '메뉴보드 원격 관리' }], at: 1 } }),
    lay('ready1', { status: 'done', ov: { t: { 0: '자동 구성으로 채운 제목' }, img: {} }, adaptation: { version: 3, origin: 'compose', phase: 'ready', key: 'k', appliedKey: 'k' } }),
  ] }] };
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const errors = []; const pass = (m) => console.log('PASS', m);
let browser;
try {
  await server.listen();
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (r) => r.abort());
  await context.route((url) => url.pathname.startsWith('/api/'), (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/bootstrap') return r.fulfill({ json: boot });
    return r.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  await context.addInitScript((p) => { if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('winmate.v2.proposals', JSON.stringify([p])); localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'proposal', id: p.id } })); localStorage.setItem('__seeded', '1'); }, fixture);
  const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message)); page.setDefaultTimeout(20000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.locator('[data-layout-uid="empty1"]').waitFor();
  const st = await page.evaluate(async () => (await import('/src/repositories/proposals.js')).getProposal('ribbon-test').parts[0].layouts.map((x) => [x.uid, x.status, x.adaptation && x.adaptation.phase]));
  assert.deepEqual(st.map((x) => x[0]), ['empty1', 'done1', 'brief1', 'ready1']);

  // 1) 시트 상세
  const sheet = page.locator('.modal.sheet');
  await page.locator('[data-layout-uid="empty1"]').click(); await sheet.locator('.sv-fit .slide').first().waitFor();
  assert.equal(await sheet.locator('.sv-fit .sample-ribbon').innerText(), '샘플 자료');
  const box = await sheet.locator('.sv-fit .slide').first().boundingBox(); const rb = await sheet.locator('.sv-fit .sample-ribbon').boundingBox();
  assert.ok(Math.abs(box.x + box.width - (rb.x + rb.width)) <= 2 && Math.abs(box.y - rb.y) <= 2, '띠는 장의 오른쪽 위 모서리에 붙어야 함 ' + JSON.stringify({ box, rb }));
  await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, 'detail-empty.png') });
  // 띠는 마우스를 받지 않는다 — 띠 아래 칸을 누를 수 있다
  assert.equal(await sheet.locator('.sv-fit .sample-ribbon').evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
  await page.keyboard.press('ArrowRight'); // 다음 장(done1)
  await page.waitForTimeout(400);
  assert.equal(await sheet.locator('.sv-fit .sample-ribbon').count(), 0, '채운 장에는 띠가 없어야 함');
  pass('시트 상세 — 견본 장에만 띠, 장 오른쪽 위 모서리, 마우스 통과');
  await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });

  // 2) 카드 위 큰 미리보기
  await page.locator('[data-layout-uid="empty1"]').hover(); await page.locator('.hovercard').waitFor();
  assert.equal(await page.locator('.hovercard .sample-ribbon').count(), 1);
  await page.screenshot({ path: path.join(out, 'hover-empty.png') });
  await page.mouse.move(5, 5); await page.locator('.hovercard').waitFor({ state: 'detached' });
  await page.locator('[data-layout-uid="ready1"]').hover(); await page.locator('.hovercard').waitFor();
  assert.equal(await page.locator('.hovercard .sample-ribbon').count(), 0);
  await page.mouse.move(5, 5);
  pass('카드 미리보기 — 견본 장에만 띠');

  // 3) 레이아웃 전체 보기
  await page.locator('.lay-toggle').click(); await page.locator('.vslide').waitFor();
  await page.locator('.vstrip .vthumb').first().waitFor();
  const thumbs = page.locator('.vstrip .vthumb');
  const n = await thumbs.count(); const seen = [];
  for (let i = 0; i < n; i++) { await thumbs.nth(i).click(); await page.waitForTimeout(150); seen.push(await page.locator('.vslide .sample-ribbon').count()); }
  assert.deepEqual(seen, [1, 0, 1, 0], '전체 보기 — 견본 장(빈 장 · 방향 확인 대기)에만 띠');
  await thumbs.nth(seen.indexOf(1)).click();
  await page.locator('.vslide').hover(); await page.waitForTimeout(300);
  const fav = await page.locator('.vslide > .fav-btn').boundingBox(); const vs = await page.locator('.vslide').boundingBox();
  assert.ok(fav.x < vs.x + vs.width / 2, '띠가 있는 장의 찜 버튼은 왼쪽 위로');
  await page.screenshot({ path: path.join(out, 'viewer-empty.png') });
  await page.locator('.lay-toggle').click();
  pass('레이아웃 전체 보기 — 견본 장에만 띠 · 찜 버튼은 띠를 피함');

  // 4) 넣을 내용 확인 팝업
  await page.locator('[data-layout-uid="brief1"]').click(); const lb = page.locator('.modal.lb-modal'); await lb.waitFor();
  assert.equal(await lb.locator('.lb-thumb .sample-ribbon').count(), 1);
  await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, 'brief.png') });
  await lb.getByRole('button', { name: '나중에' }).click(); await lb.waitFor({ state: 'detached' });
  pass('넣을 내용 확인 — 아직 채우기 전 장에 띠');

  // 5) 레이아웃 추가 — 마우스를 댄 카드의 큰 미리보기
  await page.getByRole('button', { name: 'PPT 레이아웃 추가' }).first().click();
  const card = page.locator('.pcard').first(); await card.waitFor(); await card.hover();
  await page.locator('.pk-peek').waitFor();
  assert.equal(await page.locator('.pk-peek .pp-slide .sample-ribbon').count(), 1);
  await page.screenshot({ path: path.join(out, 'picker-peek.png') });
  pass('레이아웃 추가 미리보기 — 띠');
  assert.deepEqual(errors, []);
  console.log('ALL OK');
} finally { if (browser) await browser.close(); await server.close(); }
