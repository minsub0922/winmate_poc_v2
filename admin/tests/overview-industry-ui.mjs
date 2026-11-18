// 「전체 파트」 팝업 — Overview 는 업종별 고정 시트: 파트 이름 오른쪽 업종 드롭다운 → 그 업종의 시트로 바로 바뀐다.
//   격리 서버(별도 WINMATE_ADMIN_DATA · WINMATE_AUTH_DIR · WINMATE_LAYOUT_PRESETS)에서 실행한다. 읽기만 한다. 모델은 부르지 않는다.
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8799 WINMATE_ADMIN_TEST_PASSWORD=… [CHROME=…] node admin/tests/overview-industry-ui.mjs
//   ① 드롭다운이 파트 이름 바로 오른쪽 ② 업종 20곳(세부 업종 44곳이 아니다 — 의료 하나) ③ 고르면 서버에 다시 묻지 않고 그 업종의 시트로
//   ④ 업종마다 레이아웃(칸 수) · 내용이 다르다 ⑤ 내용 고정 표식 · 상세 ⑥ 다른 카드에는 드롭다운이 없다
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const password = process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!';
const out = path.resolve(process.env.WINMATE_ADMIN_TEST_OUT || 'admin/runtime/evidence/overview-industry'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const results = [], errors = [];
const step = async (name, run) => { try { await run(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ' — ' + String(e.message).split('\n')[0]]); } };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password } });
  assert.equal(login.status(), 200, await login.text());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const calls = []; page.on('request', r => { if (/\/admin\/api\//.test(r.url())) calls.push(r.url()); });
  await page.goto(base + '/admin/layouts');
  await page.locator('.lp-row').first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: '전체 파트 확인하기' }).click();
  const dialog = page.getByRole('dialog', { name: '전체 파트' });
  await dialog.locator('.lpx-card').first().waitFor({ timeout: 60000 });
  const card = dialog.locator('.lpx-card[data-part="overview"]');
  const select = card.getByRole('combobox', { name: '제안 개요 업종 선택' });
  const sheet = card.locator('.lpx-sheet').nth(1);
  const frameText = async () => (await sheet.frameLocator('iframe').locator('body').innerText()).replace(/\s+/g, ' ');
  const cuts = () => sheet.frameLocator('iframe').locator('[data-img]').count();
  const away = async () => { await page.mouse.move(5, 995); await page.waitForTimeout(250); };
  await select.waitFor({ timeout: 30000 });

  await step('업종 드롭다운이 파트 이름 바로 오른쪽에 있다 · Overview 카드에만', async () => {
    const title = await card.locator('.lpx-title h4').evaluate(h => { const r = document.createRange(); r.selectNodeContents(h.firstChild); const b = r.getBoundingClientRect(); return { text: h.firstChild.textContent, right: b.right, top: b.top, bottom: b.bottom }; });
    assert.equal(title.text, '제안 개요'); // Overview 의 목록 이름(사용자 지시 2026-11-16)
    const box = await card.locator('.lpx-ind').boundingBox();
    assert.ok(box.x >= title.right && box.x - title.right <= 16, `이름 오른쪽 ${Math.round(box.x - title.right)}px`);
    assert.ok(box.y < title.bottom && box.y + box.height > title.top, '같은 줄');
    assert.equal(await dialog.locator('.lpx-ind').count(), 1);
    assert.equal(await card.getAttribute('data-kind'), 'industry');
    assert.match(await card.locator('.lpx-kind').innerText(), /^업종별 고정$/);
    assert.match(await card.locator('.lpx-title h4').innerText(), /실제 덱 반영 전/);
  });

  await step('업종은 잘게 나누지 않는다 — 20곳(세부 업종 44곳이 아니다): 의료 · 교육 · 오피스', async () => {
    const options = await select.locator('option').allInnerTexts();
    assert.equal(options.length, 20, options.join(' '));
    for (const w of ['외식', '의료', '교육', '오피스', '호텔', '공공']) assert.ok(options.includes(w), w);
    for (const w of ['의원·클리닉', '상급종합·종합병원', '대학 캠퍼스', '중소기업 오피스']) assert.ok(!options.includes(w), w);
    assert.equal(await select.inputValue(), 'FB'); // 처음은 첫 업종
    assert.equal(await sheet.getAttribute('data-layout'), 'L_VS_DSS_FB');
    assert.match(await frameText(), /외식 매장에 필요한 AI, Device · Solution · Service로 한 번에/);
  });

  await step('의료를 고르면 바로 그 시트로 — 서버에 다시 묻지 않는다 · 세부 업종 4곳이 같은 시트', async () => {
    const before = calls.length;
    await select.selectOption({ label: '의료' });
    await sheet.frameLocator('iframe').getByText('병원에 필요한 AI', { exact: false }).waitFor({ timeout: 5000 });
    assert.equal(await sheet.getAttribute('data-layout'), 'L_VS_DSS_MD');
    const text = await frameText();
    for (const w of ['병원 안내 · 업무 솔루션', '삼성헬스', 'DEVICE', 'SOLUTION', 'SERVICE', 'SAMSUNG AI 비즈니스']) assert.ok(text.includes(w), w + ' — ' + text);
    // 솔루션 이름 앞에는 아이콘(솔루션 수만큼), 가운데 도식의 그림 다섯(궤도 · AI 표식 · Device · Solution · Service)
    assert.equal(await sheet.frameLocator('iframe').locator('svg').count(), 5 + 5);
    assert.doesNotMatch(text, /외식 매장|갤럭시 탭 POS/);
    assert.equal(await cuts(), 6);
    const loaded = await sheet.frameLocator('iframe').locator('[data-img] img').evaluateAll(els => els.every(e => e.complete && e.naturalWidth > 0 && e.src.startsWith('data:image/webp')));
    assert.ok(loaded, '제품 컷이 보인다');
    assert.deepEqual(calls.slice(before).filter(u => /L_VS_DSS|overview/i.test(u)), [], '시트를 바꿀 때 그 장을 서버에 묻지 않는다'); // 다른 카드의 미리보기는 그동안에도 받는다
    const note = await card.locator('.lpx-ind-note').innerText();
    for (const w of ['의료', '상급종합', '중소 병원', '의원', '요양', '디바이스 6 · 솔루션 5 · 서비스 3']) assert.ok(note.includes(w), w + ' — ' + note);
    assert.doesNotMatch(note, /같이 씁니다|바뀝니다|써요/, '설명 글 없이 이름과 수만');
    await away(); await card.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' })); await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, 'overview-medical.png') });
  });

  await step('업종마다 레이아웃(칸 수)과 내용이 다르다 — 교육 8 · 8 두 줄 격자, 옥외 광고 3 · 2 한 줄씩, 오피스는 교육과 다르다', async () => {
    const seen = {};
    for (const [label, id, title, devices, solutions] of [['교육', 'ED', '학교에 필요한 AI', 8, 8], ['오피스', 'OF', '오피스에 필요한 AI', 8, 7], ['옥외 광고', 'AD', '옥외 광고에 필요한 AI', 3, 2]]) {
      await select.selectOption({ label });
      await sheet.frameLocator('iframe').getByText(title, { exact: false }).waitFor({ timeout: 5000 });
      assert.equal(await sheet.getAttribute('data-layout'), 'L_VS_DSS_' + id);
      assert.equal(await cuts(), devices, label);
      assert.match(await card.locator('.lpx-ind-note').innerText(), new RegExp(`디바이스 ${devices} · 솔루션 ${solutions} · 서비스 3`));
      assert.match(await sheet.locator('.lpx-cap small').innerText(), new RegExp(`${label} 시트 · 디바이스 ${devices} · 솔루션 ${solutions} · 늘 1장 · 내용 고정`));
      seen[id] = { text: await frameText(), lefts: await sheet.frameLocator('iframe').locator('[data-img]').evaluateAll(els => [...new Set(els.map(e => e.style.left))].length) };
    }
    assert.equal(seen.ED.lefts, 2, '교육 — 디바이스 두 줄 격자'); assert.equal(seen.AD.lefts, 1, '옥외 광고 — 한 줄씩');
    assert.ok(seen.ED.text.includes('갤럭시 클래스룸') && !seen.OF.text.includes('갤럭시 클래스룸'));
    assert.ok(seen.OF.text.includes('회의실 예약 솔루션') && !seen.ED.text.includes('회의실 예약 솔루션'));
    await away(); await card.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' })); await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, 'overview-ooh.png') });
  });

  await step('내용 고정 — 자물쇠 표식 · 순서 줄 · 상세에 업종 · 레이아웃 · 디바이스 · 솔루션 · 서비스', async () => {
    await select.selectOption({ label: '교육' });
    await sheet.frameLocator('iframe').getByText('학교에 필요한 AI', { exact: false }).waitFor({ timeout: 5000 });
    assert.equal(await sheet.locator('.lpx-step.fixed').count(), 1);
    assert.equal(await card.locator('.lpx-sheet').first().locator('.lpx-step.fixed').count(), 0, '간지는 고정 시트가 아니다');
    assert.equal(await dialog.locator('.lpx-note').count(), 0); // 카드에 설명 줄은 두지 않는다 — 종류 표식 · 자물쇠 · 장 표시로만
    assert.doesNotMatch(await card.innerText(), /그대로 써요|고르면 그 업종의 시트로/);
    await sheet.locator('button').hover();
    const pop = page.locator('#lpx-pop');
    await pop.waitFor({ state: 'visible' });
    const text = (await pop.innerText()).replace(/\s+/g, ' ');
    for (const w of ['교육 고정 시트', 'VS-DSS-ED', '세부 업종 3곳 공통', '디바이스 8칸(2열 격자)', '솔루션 8칸(2열 격자)', '갤럭시 클래스룸', '업종 맞춤 컨설팅', '고정 — 업종마다 정해 둔 내용 그대로 · 채우거나 고치지 않음', '업종마다 정해 둔 시트', '채우거나 고치지 않고 그대로 씁니다'])
      assert.ok(text.includes(w), w + ' — ' + text);
    assert.doesNotMatch(text, /업종마다 바뀜|모든 업종 같음/);
    await pop.locator('.lp-frame iframe').waitFor({ timeout: 10000 });
    assert.match((await pop.frameLocator('iframe').locator('body').innerText()).replace(/\s+/g, ' '), /학교에 필요한 AI/);
    await page.screenshot({ path: path.join(out, 'overview-hover.png') });
    await away();
  });

  await step('크게 보기도 고른 업종의 시트 · 흐름 거르기에 「업종별 고정」', async () => {
    await sheet.locator('button').click();
    const zoom = page.getByRole('dialog', { name: /장표 미리보기$/ });
    await zoom.waitFor();
    assert.match(await zoom.locator('header').innerText(), /교육 고정 시트[\s\S]*VS-DSS-ED/);
    assert.match((await zoom.frameLocator('iframe').locator('body').innerText()).replace(/\s+/g, ' '), /학교에 필요한 AI/);
    await page.screenshot({ path: path.join(out, 'overview-zoom.png') });
    await page.keyboard.press('Escape');
    await zoom.waitFor({ state: 'detached' });
    await dialog.getByRole('button', { name: /^업종별 고정/ }).click();
    assert.deepEqual(await dialog.locator('.lpx-card').evaluateAll(els => els.map(e => e.dataset.part)), ['overview']);
    assert.equal(await select.inputValue(), 'ED', '거른 뒤에도 고른 업종 그대로');
    await dialog.getByRole('button', { name: /^전체/ }).click();
    assert.equal(await dialog.locator('.lpx-card[data-part="why"] .lpx-ind').count(), 0);
  });
  assert.deepEqual(errors, []);
} catch (e) {
  results.push(['FAIL', String(e.message).split('\n')[0]]);
} finally {
  await browser.close();
}
for (const [s, n] of results) console.log(s.padEnd(4), n);
if (errors.length) console.log('page errors:', errors);
process.exitCode = results.some(([s]) => s !== 'ok') || errors.length ? 1 : 0;
