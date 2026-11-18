// 「전체 파트」 팝업 왼쪽 파트 목록(part-rail.jsx) — 격리 admin 서버에서 실행한다. 읽기만 한다.
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8799 [WINMATE_ADMIN_TEST_PASSWORD=…] [WINMATE_ADMIN_TEST_OUT=…] node admin/tests/part-rail-ui.mjs
//   ① 목록 = 카드 순서 그대로(버블 + 이름) ② 누르면 그 카드 머리가 거르기 줄 바로 아래로 · 표시가 옮겨 감 ③ 굴리면 표시가 따라감 ④ 거르기를 따라감
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const password = process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!';
const out = path.resolve(process.env.WINMATE_ADMIN_TEST_OUT || 'admin/runtime/evidence/part-rail'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const r = await ctx.request.post(base + '/api/auth/login', { data: { username: 'admin', password } }); assert.equal(r.status(), 200);
const page = await ctx.newPage(); const errs=[]; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '/admin/layouts'); await page.locator('.lp-row').first().waitFor({ timeout: 30000 });
await page.getByRole('button', { name: '전체 파트 확인하기' }).click();
const d = page.getByRole('dialog', { name: '전체 파트' }); await d.locator('.lpx-card').first().waitFor({ timeout: 60000 });
const cards = await d.locator('.lpx-card').evaluateAll(e => e.map(x => x.dataset.part));
const rail = await d.locator('.lpr-item').evaluateAll(e => e.map(x => x.dataset.part));
assert.deepEqual(rail, cards); console.log('rail', rail.length, 'items', (await d.locator('.lpr-name').allTextContents()).join(' | '));
await page.waitForTimeout(800); await page.screenshot({ path: out + '/rail-top.png' });
for (const i of [rail.length - 3, 2]) {
  const key = rail[i]; await d.locator(`.lpr-item[data-part="${key}"]`).click(); await page.waitForTimeout(1300);
  const g = await page.evaluate(k => { const c=document.querySelector(`.lpx-card[data-part="${k}"]`).getBoundingClientRect(); const b=document.querySelector('.lpx-bar').getBoundingClientRect(); const rl=document.querySelector('.lpr').getBoundingClientRect(); return { gap: Math.round(c.top - b.bottom), on: document.querySelector('.lpr-item.on')?.dataset.part, railTop: Math.round(rl.top - b.bottom) }; }, key);
  console.log(key, g); assert.equal(g.on, key); assert.ok(g.gap >= 0 && g.gap <= 20, 'card head just under the bar');
  await page.screenshot({ path: out + `/rail-${i}.png` });
}
// manual scroll updates the marker
await page.evaluate(() => { const b=document.querySelector('.modal-body'); b.scrollTop = b.scrollHeight; }); await page.waitForTimeout(400);
assert.equal(await d.locator('.lpr-item.on').getAttribute('data-part'), rail.at(-1));
// filter chip -> rail follows
await d.locator('.lpx-chip').nth(1).click(); await page.waitForTimeout(300);
assert.equal(await d.locator('.lpr-item').count(), await d.locator('.lpx-card').count());
assert.deepEqual(errs, []);
console.log('ok   part rail');
await browser.close();
