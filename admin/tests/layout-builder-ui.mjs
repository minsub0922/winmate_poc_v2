// 「레이아웃 구성 관리」 → 추천 구성 → 구성 추가하기 (사용자 지시 2026-11-16) — 격리 서버에서 실행한다(운영 값을 실제로 저장한다).
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8811 [CHROME=…] node admin/tests/layout-builder-ui.mjs
//   서버: WINMATE_LAYOUT_PRESETS · WINMATE_ADMIN_DATA · WINMATE_AUTH_DIR 를 임시 경로로, 앱 iframe 을 보려면 WINMATE_WEB_DIST 에 이 작업트리의 vite 빌드.
//   흐름: 파트를 누르면 흐름에 바로 · 다시 누르면 빠짐 · 끌어서 순서 · Spec 은 골라 넣고 넣으면 맨 끝 · 큰 버블(이름 아래) · 빼기는 마우스를 대면 오른쪽 위 →
//         새 파트(구성 만들기보다 작은 팝업: 이름 · 색 · 아이콘 · 레이아웃 탐색 팝업의 검색 · 필터 · 마우스를 대면 상세 · 누를 때마다 더하고 열어 둔다) →
//         만든 파트가 바로 목록에 · 흐름에 자동으로 → 구성 추가 → 저장 → 앱 bootstrap · 앱 화면 · 전체 파트 팝업 → 고치기 · 지우기. 끝나면 기본값으로 되돌린다.
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8811';
const password = process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!';
const out = path.resolve(process.env.WINMATE_ADMIN_TEST_OUT || 'admin/runtime/evidence/layout-builder'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const results = [], errors = [];
let page, context;
const step = async (name, run) => { try { await run(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ' — ' + String(e.message).split('\n')[0]]); await page?.screenshot({ path: path.join(out, 'fail-' + results.length + '.png') }).catch(() => {}); } };
const flowKeys = () => page.locator('.lb-flow .lb-fi[data-toc]').evaluateAll(xs => xs.map(x => x.dataset.toc));
try {
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password } });
  assert.equal(login.status(), 200, await login.text());
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const presets = async () => (await (await context.request.get(base + '/admin/api/layout-presets')).json()).presets;
  assert.equal((await context.request.delete(base + '/admin/api/layout-presets', { headers: { Origin: base } })).status(), 200);
  await page.goto(base + '/admin/layouts');
  await page.locator('.lp-row').first().waitFor({ timeout: 30000 });
  const modal = page.locator('.modal').filter({ has: page.getByRole('heading', { name: /새 구성 만들기|구성 고치기/ }) });
  let tid = '', pid = '';

  await step('추천 구성 헤더 오른쪽 끝에 「구성 추가하기」', async () => {
    const head = page.locator('.section-heading').filter({ has: page.getByRole('heading', { name: /^추천 구성/ }) });
    const btn = head.getByRole('button', { name: '구성 추가하기' });
    await btn.waitFor();
    const [h, b] = [await head.boundingBox(), await btn.boundingBox()];
    assert.ok(Math.abs(h.x + h.width - (b.x + b.width)) < 4, '오른쪽 끝');
    await btn.click();
    await modal.waitFor();
    assert.deepEqual(await flowKeys(), []); // 빈 흐름에서 시작 — Spec 도 고정으로 들어가지 않는다
    await modal.locator('.lb-flow .lb-fi.ghost').waitFor();
    // 만든 파트가 전체 파트 위 · '새 파트 만들기' 버튼은 없다(새 파트 타일로)
    const [mine, all] = [await modal.locator('.lb-tiles[data-sec="custom"]').boundingBox(), await modal.locator('.lb-tiles[data-sec="code"]').boundingBox()];
    assert.ok(mine.y < all.y, '만든 파트가 위');
    assert.equal(await modal.getByRole('button', { name: '새 파트 만들기' }).count(), 0);
    await modal.locator('.lb-tiles[data-sec="custom"] .lb-tile.new').getByRole('button', { name: '새 파트' }).waitFor();
    // 전체 파트 — 코드 구성이 쓰는 목록 파트(전체 파트 확인하기 버튼의 수와 같다)
    const listed = Number((await page.locator('.lpx-open p').innerText()).match(/파트 (\d+)종/)[1]);
    assert.equal(await modal.locator('.lb-tiles[data-sec="code"] .lb-tile').count(), listed);
    for (const k of ['overview', 'ua', 'needs', 'space', 'value', 'sol', 'case', 'why', 'pspec', 'svc']) await modal.locator(`.lb-tile[data-part="${k}"]`).waitFor();
    assert.equal(await modal.locator('.lb-tile[data-part="subx"]').count(), 0); // 구독 상품 제안은 서비스 제안의 갈래(2026-11-17)
    assert.equal(await modal.getByRole('button', { name: '구성 추가', exact: true }).isDisabled(), true);
  });

  await step('기존 파트를 누르면 흐름에 바로 들어가고, 다시 누르면 빠진다 · Spec 은 골라 넣고 넣으면 맨 끝', async () => {
    const tile = k => modal.locator(`.lb-tile[data-part="${k}"] .lb-tile-hit`);
    await tile('pspec').click(); // Spec 을 먼저 넣어도
    for (const k of ['overview', 'needs', 'why']) await tile(k).click();
    assert.deepEqual(await flowKeys(), ['overview', 'needs', 'why', 'pspec']); // 다른 파트는 그 앞에
    assert.equal(await tile('needs').getAttribute('aria-pressed'), 'true');
    assert.equal(await modal.locator('.lb-tile-no').count(), 0); // 번호 없음 — 고른 파트는 체크
    assert.equal(await modal.locator('.lb-tile.on .lb-tile-on').count(), 4);
    await tile('needs').click();
    assert.deepEqual(await flowKeys(), ['overview', 'why', 'pspec']);
    await modal.getByText('파트 3', { exact: false }).first().waitFor();
    // 흐름 — 큰 버블 · 이름은 버블 아래 · 번호 없음
    const fi = modal.locator('.lb-fi[data-toc="overview"]');
    const [b, n] = [await fi.locator('.lb-node').boundingBox(), await fi.locator('.lb-fi-name').boundingBox()];
    assert.ok(b.width >= 56 && b.height >= 56, '버블 ' + b.width);
    assert.ok(n.y >= b.y + b.height - 1, '이름은 버블 아래');
    assert.ok(!/\b0\d\b/.test(await modal.locator('.lb-flow').innerText()), '번호 없음');
  });

  await step('끌어서 흐름 순서를 바꾸고, 파트 카드를 흐름의 원하는 자리에 끌어 넣는다 · Spec 뒤로는 못 간다 · 빼기는 버블에 마우스를 대면 오른쪽 위', async () => {
    const fi = k => modal.locator(`.lb-fi[data-toc="${k}"]`);
    await fi('why').dragTo(fi('overview'), { targetPosition: { x: 4, y: 30 } });
    assert.deepEqual(await flowKeys(), ['why', 'overview', 'pspec']);
    await modal.locator('.lb-tile[data-part="space"] .lb-tile-hit').dragTo(fi('overview'), { targetPosition: { x: 4, y: 30 } });
    assert.deepEqual(await flowKeys(), ['why', 'space', 'overview', 'pspec']);
    const spec = await fi('pspec').boundingBox();
    await fi('why').dragTo(fi('pspec'), { targetPosition: { x: spec.width - 3, y: 30 } }); // Spec 뒤에 놓아도 Spec 앞
    assert.deepEqual(await flowKeys(), ['space', 'overview', 'why', 'pspec']);
    await fi('overview').focus(); await page.keyboard.press('ArrowLeft'); // 키보드로도 옮긴다
    assert.deepEqual(await flowKeys(), ['overview', 'space', 'why', 'pspec']);
    await page.mouse.move(5, 5);
    const x = fi('why').locator('.lb-fi-x');
    assert.equal(await x.evaluate(el => getComputedStyle(el).opacity), '0'); // 평소에는 안 보인다
    await fi('why').locator('.lb-node').hover();
    await page.waitForFunction(el => getComputedStyle(el).opacity === '1', await x.elementHandle());
    const [nb, xb] = [await fi('why').locator('.lb-node').boundingBox(), await x.boundingBox()];
    assert.ok(xb.x + xb.width / 2 > nb.x + nb.width / 2 && xb.y + xb.height / 2 < nb.y + nb.height / 2, '오른쪽 위');
    await page.screenshot({ path: path.join(out, 'builder-flow.png') });
    // Spec 도 뺄 수 있다
    await fi('pspec').locator('.lb-node').hover(); await fi('pspec').locator('.lb-fi-x').click();
    assert.deepEqual(await flowKeys(), ['overview', 'space', 'why']);
  });

  await step('새 파트 만들기 — 이름 · 색 · 아이콘 · 레이아웃(추가 버튼의 작은 팝업: 검색 · 필터)', async () => {
    await modal.locator('.lb-tile.new').getByRole('button', { name: '새 파트' }).click();
    const box = page.locator('.lb-creator-overlay .lp-overlay-box');
    await box.waitFor();
    assert.ok((await box.boundingBox()).width < (await modal.boundingBox()).width - 100, '새 파트 만들기 팝업이 구성 만들기보다 작다');
    assert.equal(await box.locator('.lb-swatch').count(), 54);
    assert.ok(await box.locator('.lb-icon').count() >= 60);
    await box.getByLabel('파트 이름').fill('매장 운영');
    await box.getByRole('radio', { name: '청록 · 진하게' }).click();
    await box.getByLabel('아이콘 찾기').fill('매장');
    await box.getByRole('radio', { name: '매장', exact: true }).click();
    await box.getByLabel('아이콘 찾기').fill('');
    assert.equal(await box.getByRole('button', { name: '파트 만들기', exact: true }).isDisabled(), true); // 레이아웃이 없으면 못 만든다
    // 레이아웃 추가 팝업 — 검색
    await box.getByRole('button', { name: '레이아웃 추가' }).click();
    const picker = page.locator('.lb-picker');
    await picker.waitFor();
    await picker.locator('.lb-card').first().waitFor({ timeout: 20000 });
    const total = Number((await picker.locator('.lb-picker-n b').innerText()).replace(/,/g, ''));
    assert.ok(total > 300, '전체 ' + total);
    await picker.getByLabel('레이아웃 찾기').fill('대표 공간 장면');
    await picker.locator('.lb-card[data-f="L_SS_FB_B"]').waitFor();
    const found = Number(await picker.locator('.lb-picker-n b').innerText());
    assert.ok(found > 0 && found < total);
    // 필터 — 목차 유형 · 업종
    await picker.getByLabel('업종').selectOption('FB');
    await picker.locator('.lb-card[data-f="L_SS_FB_B"]').waitFor();
    assert.ok(Number(await picker.locator('.lb-picker-n b').innerText()) <= found);
    // 마우스를 대면 상세(큰 미리보기 · 쓰는 상황 · 업종)가 카드 옆에 — 카드를 가리지 않는다
    const card = picker.locator('.lb-card[data-f="L_SS_FB_B"]');
    await card.hover();
    const hover = page.locator('.lb-hover[data-f="L_SS_FB_B"]');
    await hover.waitFor();
    await hover.locator('.lp-frame iframe').waitFor({ timeout: 20000 });
    assert.match(await hover.innerText(), /언제 쓰나/);
    assert.match(await hover.innerText(), /외식/);
    const [cb, hb] = [await card.boundingBox(), await hover.boundingBox()];
    assert.ok(hb.width > cb.width * 1.6, '크게');
    assert.ok(hb.x >= cb.x + cb.width || hb.x + hb.width <= cb.x, '카드 옆');
    await page.screenshot({ path: path.join(out, 'picker-hover.png') });
    await card.click(); // 누르면 바로 더하고 팝업은 열려 있다
    await picker.locator('.lb-card.used[data-f="L_SS_FB_B"]').getByText('추가됨').waitFor();
    assert.equal(await picker.isVisible(), true);
    assert.deepEqual(await box.locator('.lb-sheet[data-f]').evaluateAll(xs => xs.map(x => x.dataset.f)), ['L_SS_FB_B']);
    await page.screenshot({ path: path.join(out, 'picker-search.png') });
    // 두 번째 — 같은 팝업에서 목차 유형 필터로
    await picker.getByLabel('업종').selectOption('');
    await picker.getByLabel('레이아웃 찾기').fill('');
    await picker.getByRole('button', { name: /^공간 · 제품/ }).click();
    await picker.getByRole('button', { name: /^공간별 제품/ }).click();
    await picker.locator('.lb-card[data-f="L_P1A"]').waitFor();
    const kinds = await picker.locator('.lb-card small').allInnerTexts();
    assert.ok(kinds.length && kinds.every(t => t.includes('공간별 제품')), kinds.slice(0, 3).join(' / '));
    await page.screenshot({ path: path.join(out, 'picker-filter.png') });
    await picker.locator('.lb-card[data-f="L_P1A"]').click();
    await picker.locator('.lb-picker-h').getByText('추가 2', { exact: false }).waitFor();
    // Esc 는 레이아웃 추가 팝업만 닫는다
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });
    await box.waitFor();
    // 레이아웃 순서 — 끌어서
    const sheets = () => box.locator('.lb-sheet[data-f]').evaluateAll(xs => xs.map(x => x.dataset.f));
    assert.deepEqual(await sheets(), ['L_SS_FB_B', 'L_P1A']);
    await box.locator('.lb-sheet[data-f="L_P1A"]').dragTo(box.locator('.lb-sheet[data-f="L_SS_FB_B"]'), { targetPosition: { x: 4, y: 30 } });
    assert.deepEqual(await sheets(), ['L_P1A', 'L_SS_FB_B']);
    await box.locator('.lb-sheet.locked').getByText('간지').waitFor(); // 간지는 늘 첫 장
    await page.screenshot({ path: path.join(out, 'part-creator.png') });
    await box.getByRole('button', { name: '파트 만들기', exact: true }).click();
    await box.waitFor({ state: 'detached' });
  });

  await step('만든 파트는 바로 파트 목록에 · 지금 흐름에 자동으로(끝에)', async () => {
    const tile = modal.locator('.lb-tile.custom').first();
    await tile.waitFor();
    pid = await tile.getAttribute('data-part');
    assert.match(pid, /^cp_[a-z0-9]+$/);
    assert.deepEqual(await flowKeys(), ['overview', 'space', 'why', pid]);
    const bg = await modal.locator(`.lb-fi[data-toc="${pid}"] .lb-node`).evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(bg, 'rgb(11, 96, 90)'); // 청록 · 진하게 #0b605a
  });

  await step('구성 추가 → 추천 구성 목록에(직접 만듦) · 버블은 고른 색 · 아이콘', async () => {
    await modal.getByLabel('구성 이름').fill('매장 운영형 제안서');
    assert.equal(await modal.getByLabel('구성 배지').count(), 0); // 배지 항목은 없앴다(2026-11-16)
    await modal.getByLabel('구성 설명').fill('매장 운영 파트로 현장 운영을 먼저 보여 주는 구성');
    await page.screenshot({ path: path.join(out, 'builder-ready.png') });
    await modal.getByRole('button', { name: '구성 추가', exact: true }).click();
    await modal.waitFor({ state: 'detached' });
    const row = page.locator('.lp-row').filter({ hasText: '매장 운영형 제안서' });
    await row.waitFor();
    tid = await row.getAttribute('data-template');
    assert.match(tid, /^ct_[a-z0-9]+$/);
    await row.getByText('직접 만듦').waitFor();
    assert.equal(await page.locator('.lp-badge').count(), 0); // 목록 어디에도 배지가 없다
    assert.deepEqual(await row.locator('.lp-pf-name').allInnerTexts(), ['제안 개요', '제품 제안', 'Why Samsung', '매장 운영']); // Spec 없는 구성 · 공간별 제안의 목록 이름은 제품 제안(2026-11-17)
    assert.equal(await row.locator(`.lp-pf[data-toc="${pid}"] .lp-pf-node`).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(11, 96, 90)');
    assert.match(await row.locator('.lp-meta').innerText(), /레이아웃 \d+장/);
    await page.locator('.lp-dirty').waitFor(); // 저장 전
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'list-row.png') });
  });

  await step('저장 → 운영 값 · 앱 bootstrap 에 실린다', async () => {
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByText('레이아웃 구성을 저장했습니다.', { exact: false }).waitFor();
    const p = await presets();
    assert.deepEqual(p.templates[tid].tocs, ['overview', 'space', 'why', pid]);
    assert.equal('badge' in p.templates[tid], false);
    assert.equal(p.templates[tid].desc, '매장 운영 파트로 현장 운영을 먼저 보여 주는 구성');
    assert.deepEqual(p.parts[pid], { name: '매장 운영', color: '#0b605a', icon: 'pi-store', type: 'products', sheets: [{ f: 'L_P1A', label: '제품 이미지 중심 (히어로)' }, { f: 'L_SS_FB_B', label: '외식 · 카페 프랜차이즈 · 대표 공간 장면' }] });
    const boot = await (await context.request.get(base + '/api/bootstrap')).json();
    assert.deepEqual(boot.layout_presets.templates[tid].tocs, p.templates[tid].tocs);
    assert.equal(await page.locator('.lp-dirty').count(), 0);
  });

  await step('상세 — 목차 · 레이아웃에 만든 파트의 간지 + 고른 레이아웃 · 시트(앱 화면)도 열린다', async () => {
    const h3 = page.locator(`.lp-row[data-template="${tid}"] h3`); await h3.scrollIntoViewIfNeeded();
    const hb = await h3.boundingBox(); await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2); // 카드 글 위를 눌러도(덮은 버튼이 받는다) 열린다
    const d = page.locator('.modal').filter({ hasText: '매장 운영형 제안서' });
    await d.getByRole('tab', { name: '목차 · 레이아웃' }).click();
    const part = d.locator(`.lp-part[data-part="${pid}"]`);
    await part.waitFor();
    const codes = await part.locator('.lp-layout small').allInnerTexts();
    assert.ok(codes.some(t => /VS-DIV|DIV/.test(t)), codes.join(' / '));
    assert.ok(codes.some(t => t.includes('P1A') || t.includes('P1-A')), codes.join(' / '));
    await d.getByRole('tab', { name: '시트' }).click();
    const info = d.locator('.lp-sheets-bar b');
    await info.waitFor({ timeout: 40000 });
    assert.match(await info.innerText(), /매장 운영형 제안서/);
    await page.screenshot({ path: path.join(out, 'detail-sheets.png') });
    await d.locator('.modal-footer').getByRole('button', { name: '닫기', exact: true }).click();
    await d.waitFor({ state: 'detached' });
  });

  await step('앱 — 저장한 구성으로 덱을 조립한다(목차 템플릿 시트 보기)', async () => {
    const app = await context.newPage();
    app.on('pageerror', e => errors.push('app: ' + e.message));
    await app.goto(base + '/?' + new URLSearchParams({ toc: tid, embed: 'sheets' }));
    assert.ok(tid);
    await app.waitForFunction(() => document.body.innerText.includes('매장 운영형 제안서') && document.body.innerText.includes('매장 운영'), null, { timeout: 40000 });
    await app.screenshot({ path: path.join(out, 'app-sheets.png') });
    await app.close();
  });

  await step('전체 파트 확인하기 — 구성에 쓰인 만든 파트가 제 색 · 아이콘으로 올라온다', async () => {
    await page.getByRole('button', { name: /전체 파트 확인하기/ }).click();
    const card = page.locator(`.lpx-card[data-part="${pid}"]`);
    await card.waitFor({ timeout: 60000 });
    assert.notEqual(await card.getAttribute('data-kind'), 'fixed'); // 견본 그대로라도 '완전 고정'이 아니다
    assert.equal(await card.locator('.lpx-node').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(11, 96, 90)');
    await page.keyboard.press('Escape');
    await card.waitFor({ state: 'detached' });
  });

  await step('고치기 — 같은 팝업에서 흐름을 바꾸고 적용', async () => {
    const row = page.locator(`.lp-row[data-template="${tid}"]`);
    await row.getByRole('button', { name: '고치기' }).click();
    await modal.waitFor();
    assert.equal(await modal.getByLabel('구성 이름').inputValue(), '매장 운영형 제안서');
    await modal.locator('.lb-fi[data-toc="space"] .lb-node').hover();
    await modal.locator('.lb-fi[data-toc="space"]').getByRole('button', { name: /빼기/ }).click();
    assert.deepEqual(await flowKeys(), ['overview', 'why', pid]);
    // 다른 구성이 쓰지 않으면 만든 파트를 지울 수 있다 — 쓰는 중인 이 구성의 흐름에서도 빠진다
    await modal.locator(`.lb-tile[data-part="${pid}"]`).getByRole('button', { name: /지우기/ }).click();
    assert.deepEqual(await flowKeys(), ['overview', 'why']);
    assert.equal(await modal.getByRole('button', { name: '고친 구성 적용' }).isDisabled(), true); // 2개 — 4개 이상
    await modal.getByRole('button', { name: '취소' }).click();
    await modal.waitFor({ state: 'detached' });
    // 취소하면 초안은 그대로(파트 지우기는 초안에 바로 들어간다 — 변경 취소로 되돌린다)
    await page.getByRole('button', { name: '변경 취소' }).click();
    assert.deepEqual(await row.locator('.lp-pf').evaluateAll(xs => xs.map(x => x.dataset.toc)), ['overview', 'space', 'why', pid]);
  });

  await step('기본 구성으로 정하고 지우기 → 저장', async () => {
    const row = page.locator(`.lp-row[data-template="${tid}"]`);
    await row.getByRole('button', { name: '기본으로' }).click();
    await row.getByText('기본 구성', { exact: true }).waitFor();
    assert.equal(await row.getByRole('button', { name: '지우기' }).isDisabled(), true); // 기본 구성은 지우지 못한다
    await page.locator(`.lp-row[data-template="std"]`).getByRole('button', { name: '기본으로' }).click();
    await row.getByRole('button', { name: '지우기' }).click();
    await row.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await page.getByText('레이아웃 구성을 저장했습니다.', { exact: false }).waitFor();
    const p = await presets();
    assert.deepEqual(p.templates, {});
    assert.ok(p.parts[pid], '구성을 지워도 만든 파트는 남는다(다음 구성에서 다시 쓴다)');
  });
  assert.deepEqual(errors, []);
} finally {
  await context?.request.delete(base + '/admin/api/layout-presets', { headers: { Origin: base } }).catch(() => {});
  await browser.close();
}
for (const [s, n] of results) console.log(s.padEnd(4), n);
if (errors.length) console.log('page errors:', errors);
process.exitCode = results.some(([s]) => s !== 'ok') || errors.length ? 1 : 0;
