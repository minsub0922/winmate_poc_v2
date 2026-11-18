// 「전체 파트」 팝업 — 파트 카드의 기승전결 색: 파트마다 서로 다른 색, 기 → 승 → 전 → 결 순서로 놓인다.
//   격리 서버(별도 WINMATE_ADMIN_DATA · WINMATE_AUTH_DIR · WINMATE_LAYOUT_PRESETS)에서 실행한다. 읽기만 한다. 모델은 부르지 않는다.
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8799 WINMATE_ADMIN_TEST_PASSWORD=… [CHROME=…] node admin/tests/part-arc-ui.mjs
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const password = process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!';
const out = path.resolve(process.env.WINMATE_ADMIN_TEST_OUT || 'admin/runtime/evidence/part-arc'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const results = [], errors = [];
const step = async (name, run) => { try { await run(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ' — ' + String(e.message).split('\n')[0]]); } };
// 파트 → [자리 표식, 색] (admin/web/src/part-arc.js · 색은 app/web/src/domain/templates/part_colors.js)
const ARC = { overview: ['기', 'rgb(112, 119, 128)'], ua: ['기', 'rgb(118, 96, 180)'], needs: ['승', 'rgb(29, 134, 200)'], space: ['승', 'rgb(14, 154, 167)'], value: ['승', 'rgb(13, 122, 98)'],
  sol: ['승', 'rgb(74, 156, 44)'], pspec: ['승', 'rgb(134, 143, 20)'], svc: ['전', 'rgb(221, 106, 18)'], case: ['전', 'rgb(205, 61, 51)'], why: ['결', 'rgb(20, 40, 160)'] }; // 구독 상품 제안은 2026-11-17 서비스 제안의 갈래로(목록에서 빠짐)
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password } });
  assert.equal(login.status(), 200, await login.text());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/admin/layouts');
  await page.locator('.lp-row').first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: '전체 파트 확인하기' }).click();
  const dialog = page.getByRole('dialog', { name: '전체 파트' });
  await dialog.locator('.lpx-card').first().waitFor({ timeout: 60000 });
  const read = () => dialog.locator('.lpx-card').evaluateAll(els => els.map(e => {
    const node = e.querySelector('.lpx-node'); const chip = e.querySelector('.lpx-title h4 em'); const mark = e.querySelector('.lpx-arc');
    return { key: e.dataset.part, arc: e.dataset.arc, mark: mark ? mark.textContent : '', hint: mark ? mark.title : '', node: getComputedStyle(node).backgroundColor, band: getComputedStyle(e, '::before').backgroundColor,
      bandWidth: getComputedStyle(e, '::before').width, chip: chip ? getComputedStyle(chip).color : '', markColor: mark ? getComputedStyle(mark).color : '', icon: getComputedStyle(node).color };
  }));

  await step('파트마다 서로 다른 색 — 버블 · 왼쪽 띠 · 유형 표식 · 자리 표식이 그 파트의 색', async () => {
    const cards = await read();
    assert.deepEqual(cards.map(c => c.key).sort(), Object.keys(ARC).sort());
    for (const c of cards) {
      const [mark, color] = ARC[c.key];
      assert.equal(c.mark, mark, c.key); assert.equal(c.node, color, c.key + ' 버블'); assert.equal(c.band, color, c.key + ' 띠'); assert.equal(c.chip, color, c.key + ' 유형 표식'); assert.equal(c.markColor, color, c.key + ' 자리 표식');
      assert.equal(c.bandWidth, '5px', c.key); assert.equal(c.icon, 'rgb(255, 255, 255)', c.key);
      assert.ok(c.hint.startsWith(mark === '기' ? '여는 이야기' : mark === '승' ? '전개' : mark === '전' ? '전환' : '결론'), c.key + ' ' + c.hint);
    }
    assert.equal(new Set(cards.map(c => c.node)).size, cards.length, '색이 모두 다르다');
  });

  await step('카드는 기 → 승 → 전 → 결 순서 — 색이 차례로 흐르고 Why Samsung 으로 맺는다', async () => {
    const cards = await read();
    assert.deepEqual(cards.map(c => c.key), Object.keys(ARC));
    assert.deepEqual(cards.map(c => c.mark).join(''), '기기승승승승승전전결'); // 서비스(2026-11-16)는 전 — 구독 다음 // 유관사례는 쓰는 구성이 없어 목록에서 빠졌다(2026-11-16)
    assert.deepEqual(cards.map(c => c.arc), ['gi', 'gi', 'seung', 'seung', 'seung', 'seung', 'seung', 'jeon', 'jeon', 'gyeol']);
    // 자리 표식은 한 글자 — 카드에 풀어 쓴 설명 글은 없다
    assert.equal(await dialog.locator('.lpx-note').count(), 0);
    assert.ok((await dialog.locator('.lpx-arc').allInnerTexts()).every(t => t.length === 1));
  });

  await step('흐름으로 걸러도 순서와 색은 그대로', async () => {
    await dialog.getByRole('button', { name: /^순서 고정 · 장 수만 달라짐/ }).click();
    const cards = await read();
    const all = Object.keys(ARC);
    assert.ok(cards.length >= 3);
    assert.deepEqual(cards.map(c => c.key), all.filter(k => cards.some(c => c.key === k)));
    for (const c of cards) assert.equal(c.node, ARC[c.key][1], c.key);
    await dialog.getByRole('button', { name: /^전체/ }).click();
    assert.equal(await dialog.locator('.lpx-card').count(), all.length);
  });

  await step('화면 — 첫 화면(기)과 마지막(결)', async () => {
    await page.mouse.move(5, 995);
    await dialog.locator('.modal-body').evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'arc-top.png') });
    await dialog.locator('.lpx-card[data-part="why"] header').evaluate(h => h.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'arc-end.png') });
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
