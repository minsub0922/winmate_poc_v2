// 데이터 소스 — 점검 버튼 없음 · 카드 통째로 눌러 소스 팝업 → 썸네일 격자 · 출처 바로 열기 · 앱 사용 on/off(앱 bootstrap 까지)
// → 자원 상세(아래 팝업 안쪽) → 출처의 카탈로그 쪽을 PDF 보기 팝업으로(펼침 PDF 면 쪽/2+1). 글 잘림 검사 포함.
// Run only against an isolated server (temporary WINMATE_RESOURCE_SWITCHES / WINMATE_ADMIN_DATA / WINMATE_AUTH_DIR …):
// WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8961 node admin/tests/source-browser-ui.mjs   (PDF 단계는 e-카탈로그 사이트에 연결된다)
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8961';
const out = path.resolve('admin/runtime/evidence/source-browser'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const errors = [];
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
const audit = page => page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('.sb-browser *, .sb-detail *, .sb-pdf-bar *, .sb-source-card *')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible') bad.push('clipped: ' + el.textContent.slice(0, 40));
    if (cs.whiteSpace === 'nowrap' && el.getClientRects().length > 1) bad.push('broken line: ' + el.textContent.slice(0, 40));
  }
  return bad;
});
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 980 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!' } });
  assert.equal(login.status(), 200, await login.text());
  const offNow = async () => (await (await context.request.get(base + '/api/bootstrap')).json()).resource_switches;
  assert.deepEqual((await offNow()).off, {}, 'start with nothing off (fresh WINMATE_RESOURCE_SWITCHES)');
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

  // 1) 카드: 점검 · 상세 보기 버튼이 없고, 카드 전체가 눌린다
  await page.goto(base + '/admin/sources');
  const card = page.locator('.sb-source-card', { hasText: 'Samsung Business' });
  await card.waitFor();
  assert.equal(await page.getByRole('button', { name: /점검하기|상세 보기|최신성 점검/ }).count(), 0, 'no check / detail buttons on the data source page');
  assert.equal(await page.locator('.info-strip').count(), 0);
  const host = card.locator('a.sb-origin.link');
  assert.equal(await host.getAttribute('target'), '_blank');
  await page.waitForFunction(() => [...document.querySelectorAll('.sb-mosaic img')].some(i => i.complete && i.naturalWidth > 0));
  assert.deepEqual(await audit(page), []);
  await card.click({ position: { x: 200, y: 60 } });

  // 2) 소스 팝업: 썸네일 격자 · 종류 · 출처
  const pop = page.locator('section.modal').filter({ has: page.locator('.sb-browser') });
  await pop.locator('.sb-card').first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.sb-card .sb-thumb img')].filter(i => i.complete && i.naturalWidth > 0).length >= 8, null, { timeout: 30000 });
  assert.ok(await pop.locator('.sb-card').count() >= 40, 'many resources at once');
  assert.match(await pop.locator('.sb-kinds').innerText(), /제품/);
  const first = pop.locator('.sb-card').first();
  const link = first.locator('a.sb-origin.link');
  assert.match(await link.getAttribute('href'), /^https:\/\/www\.samsung\.com\//);
  assert.equal(await link.getAttribute('target'), '_blank');
  await pop.locator('.sb-size button').nth(2).click();
  const large = await first.boundingBox();
  await pop.locator('.sb-size button').nth(0).click();
  assert.ok((await first.boundingBox()).width < large.width, 'thumbnail size control');
  await pop.locator('.sb-size button').nth(1).click();
  assert.deepEqual(await audit(page), []);
  await page.screenshot({ path: path.join(out, 'browser.png') });

  // 3) 앱 사용 끄기 → 앱 bootstrap 에 실리고, 꺼짐 거르기에 나온다 → 다시 켠다
  const title = await first.locator('.sb-meta strong').innerText();
  await first.locator('.sb-switch .toggle').click();
  await first.locator('.sb-off-tag').waitFor();
  const ref = (await offNow()).off.product?.[0];
  assert.ok(ref, 'bootstrap carries the product that was switched off');
  await pop.getByRole('radio', { name: /꺼짐/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sb-card').length === 1);
  assert.equal(await pop.locator('.sb-card .sb-meta strong').innerText(), title);
  await pop.getByRole('radio', { name: '전체' }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('.sb-card').length > 1);

  // 4) 자원 상세 — 아래 팝업 안쪽 · 출처 목록 · 사용 기록 · 다시 켜기
  await pop.locator('.sb-card').first().click();
  const detail = page.locator('section.modal').filter({ has: page.locator('.sb-detail') });
  await detail.locator('.sb-origins').waitFor();
  assert.ok(inside(await detail.boundingBox(), await pop.boundingBox()), 'detail sits inside the source popup');
  assert.match(await detail.locator('.sb-use').innerText(), /꺼짐 · .*admin/);
  assert.ok(await detail.locator('a.sb-origin-row[target=_blank]').count() >= 1);
  await detail.locator('.sb-use .toggle').click();
  await detail.locator('.sb-use:not(.off)').waitFor();
  assert.deepEqual((await offNow()).off, {});
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(t => document.querySelector('.sb-detail')?.closest('.modal').querySelector('h2')?.textContent !== t, title);
  await page.keyboard.press('Escape');
  await detail.waitFor({ state: 'detached' });
  assert.equal(await pop.count(), 1, 'Escape closes only the top popup');

  // 5) 카탈로그 쪽 출처 → PDF 보기(쪽 이동)
  if (process.env.SKIP_PDF !== '1') {
    await page.keyboard.press('Escape');
    await page.locator('.sb-source-card', { hasText: 'e-Catalog' }).click();
    const cat = page.locator('section.modal').filter({ has: page.locator('.sb-browser') });
    await cat.locator('.sb-kinds button', { hasText: '제품' }).click();
    const chip = cat.locator('.sb-card .sb-origin.pdf').first();
    const wanted = Number((await chip.innerText()).match(/(\d+)쪽/)[1]);
    await chip.click();
    const viewer = page.locator('section.modal').filter({ has: page.locator('.sb-pdf') });
    await viewer.locator('.sb-pdf-stage canvas').waitFor({ timeout: 60000 });
    await page.waitForFunction(() => { const c = document.querySelector('.sb-pdf-stage canvas'); if (!c || !c.width) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4000) if (d[i] < 200) return true; return false; }, null, { timeout: 60000 });
    const shown = Number(await viewer.locator('.sb-pdf-nav input').inputValue()), total = Number((await viewer.locator('.sb-pdf-nav').innerText()).match(/\/\s*([\d,]+)/)[1].replace(/,/g, ''));
    assert.ok(shown === wanted || shown === Math.floor(wanted / 2) + 1, `catalog page ${wanted} → PDF page ${shown} of ${total}`);
    assert.ok(inside(await viewer.boundingBox(), await cat.boundingBox()));
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(n => Number(document.querySelector('.sb-pdf-nav input').value) === n, shown + 1);
    await page.screenshot({ path: path.join(out, 'pdf.png') });
    await viewer.getByRole('radio', { name: '쪽 이미지' }).click();
    await viewer.locator('.sb-pdf-stage img').waitFor();
    assert.equal(Number(await viewer.locator('.sb-pdf-nav input').inputValue()), wanted, 'page images use catalog page numbers');
  }
  assert.deepEqual(errors, []);
  console.log('source-browser-ui: ok');
} finally {
  await browser.close();
}
