// 레이아웃 관리 상세 — 디자인 코드 Export → (code agent 수정) → Upload → 지금 디자인과 나란히 비교(같은 크기 · 같은 칸 함께 표시 · 겹쳐 보기)
// → 적용 · 기본 디자인으로 되돌리기. 비교 팝업은 상세 팝업 상자 안쪽(더 작게 · 덮지 않게).
// Run only against an isolated server (temporary WINMATE_LAYOUT_LIBRARY / WINMATE_LAYOUT_FLOWS / WINMATE_ADMIN_DATA / WINMATE_AUTH_DIR):
// WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8813 node admin/tests/layout-design-ui.mjs
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8813';
const F = process.env.LAYOUT || 'L_TOC_PILOT';
const out = path.resolve('admin/runtime/evidence/layout-design'); fs.mkdirSync(out, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'winmate-design-'));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const errors = [];
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
const inside = (a, b) => a.x >= b.x + 8 && a.y >= b.y + 8 && a.x + a.width <= b.x + b.width - 8 && a.y + a.height <= b.y + b.height - 8;
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password: process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!' } });
  assert.equal(login.status(), 200, await login.text());
  const detailOf = async () => (await context.request.get(`${base}/admin/api/layout-library/${F}`)).json();
  assert.equal((await detailOf()).design, null, 'start without an adopted design (fresh WINMATE_LAYOUT_LIBRARY)');
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(base + '/admin/layout-library');
  await page.getByLabel('레이아웃 검색', { exact: true }).fill(F);
  await page.locator(`.ll-card[data-layout="${F}"] .ll-card-open`).click();
  const detail = page.locator('section.modal').filter({ has: page.locator('.ll-detail') });
  await detail.locator('.lf-node').first().waitFor();
  const tools = detail.locator('.ll-sheet-tools');

  // Export: 시트 디자인 코드(.html) 내려받기
  const [download] = await Promise.all([page.waitForEvent('download'), tools.getByRole('button', { name: 'Export' }).click()]);
  assert.equal(download.suggestedFilename(), `${F}.design.html`);
  const exported = fs.readFileSync(await download.path(), 'utf8');
  assert.ok(exported.includes(`data-winmate-sheet="${F}"`) && exported.includes('Code agent:'));

  // code agent 가 고친 결과본 → Upload → 비교 팝업
  const good = path.join(tmp, 'redesign.html'), bad = path.join(tmp, 'broken.html');
  fs.writeFileSync(good, exported.replace('background: #f5f6f8', 'background: #e8efff').replace('font-size: 30px', 'font-size: 36px'));
  fs.writeFileSync(bad, exported.replace('data-tb="3"', 'data-tb="77"').replace('data-tb="1">', 'data-tb="1" onclick="x()">'));
  await tools.getByLabel('디자인 코드 파일').setInputFiles(good);
  const compare = page.locator('section.modal').filter({ has: page.locator('.ld-compare') });
  await compare.locator('.ld-pair iframe').nth(1).waitFor();
  await page.waitForTimeout(300);
  // 팝업 깊이: 비교 팝업은 상세 팝업 상자 안쪽에만 — 더 작고, 상세 팝업 가장자리가 보인다
  const db = await detail.boundingBox(), cb = await compare.boundingBox();
  assert.ok(inside(cb, db), `compare ${JSON.stringify(cb)} sits inside detail ${JSON.stringify(db)}`);
  assert.ok(cb.width < db.width && cb.height < db.height);
  // 두 시트를 같은 크기로 나란히
  const [left, right] = [await compare.locator('.ld-pair .ld-sheet').nth(0).boundingBox(), await compare.locator('.ld-pair .ld-sheet').nth(1).boundingBox()];
  assert.ok(Math.abs(left.width - right.width) < 1 && Math.abs(left.y - right.y) < 1 && right.x > left.x + left.width, 'two sheets side by side, same size');
  assert.ok(left.width > 480, 'sheets are large enough to judge: ' + left.width);
  assert.match(await compare.locator('.ld-fact.ok').innerText(), /칸 그대로 · 글 17 · 그림 0/);
  const frameHtml = k => compare.locator('.ld-pair iframe').nth(k).evaluate(el => el.contentDocument.body.innerHTML);
  assert.ok((await frameHtml(1)).includes('#e8efff') && !(await frameHtml(0)).includes('#e8efff'));
  // 한쪽 영역에 마우스를 올리면 다른 쪽의 같은 칸도 함께 표시
  const spot = await compare.locator('.ld-pair iframe').nth(0).evaluate(el => {
    const fb = el.getBoundingClientRect(), s = fb.width / 1280, b = el.contentDocument.querySelector('[data-tb="1"]').getBoundingClientRect();
    return { x: fb.left + (b.left + b.width / 2) * s, y: fb.top + (b.top + b.height / 2) * s };
  });
  await page.mouse.move(spot.x, spot.y);
  await page.waitForFunction(() => [...document.querySelectorAll('.ld-pair iframe')].every(f => f.contentDocument.querySelector('[data-tb="1"]')?.dataset.ldHot === 'true'));
  assert.equal(await compare.locator('.ld-hot').innerText(), '글 1');
  await compare.getByRole('switch', { name: '칸 보기' }).click();
  await shot(page, '1-compare');
  // 겹쳐 보기: 손잡이로 경계를 옮긴다
  await compare.getByRole('button', { name: '겹쳐 보기' }).click();
  const handle = compare.getByRole('slider', { name: '겹쳐 보기 경계' });
  const hb = await handle.boundingBox(), wb = await compare.locator('.ld-wipe').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(wb.x + wb.width * .8, hb.y + hb.height / 2, { steps: 5 }); await page.mouse.up();
  assert.ok(Number(await handle.getAttribute('aria-valuenow')) > 70);
  assert.match(await compare.locator('.ld-wipe-top .ld-sheet').getAttribute('style'), /inset\(0px 2\d(\.\d+)?% 0px 0px\)|inset\(0 2\d/);
  await shot(page, '2-wipe');

  // 잘못된 파일: 이유를 보여 주고 적용할 수 없다
  assert.equal(await compare.getByRole('button', { name: '다른 파일' }).count(), 1);
  await tools.getByLabel('디자인 코드 파일').setInputFiles(bad);
  await compare.locator('.ld-problems').waitFor();
  const reasons = await compare.locator('.ld-problems li').allInnerTexts();
  assert.ok(reasons.some(r => r.includes('없어진 칸: 글 3')) && reasons.some(r => r.includes('onclick=')), reasons.join(' | '));
  assert.equal(await compare.getByRole('button', { name: '올린 디자인 적용' }).count(), 0);
  await shot(page, '3-rejected');

  // 다시 좋은 파일 → 적용
  await tools.getByLabel('디자인 코드 파일').setInputFiles(good);
  await compare.locator('.ld-wipe iframe').nth(1).waitFor();   // 고른 비교 방식은 다시 올려도 그대로
  await compare.getByRole('button', { name: '나란히' }).click();
  await compare.locator('.ld-pair iframe').nth(1).waitFor();
  await compare.getByRole('button', { name: '올린 디자인 적용' }).click();
  await compare.waitFor({ state: 'detached' });
  await tools.locator('.ld-mark').waitFor();
  const adopted = await detailOf();
  assert.ok(adopted.design?.version && adopted.html.includes('#e8efff'));
  assert.ok((await (await context.request.get(base + '/api/layout-library')).json()).items[F].design.html.includes('#e8efff'), 'the app document carries the design');
  assert.ok((await detail.locator('.ll-canvas iframe').evaluate(el => el.contentDocument.body.innerHTML)).includes('#e8efff'));
  // 올린 디자인 위에서도 영역 hover · 잠금 버튼
  const region = await detail.locator('.ll-canvas iframe').evaluate(el => {
    const fb = el.getBoundingClientRect(), s = fb.width / 1280, b = el.contentDocument.querySelector('[data-tb="1"]').getBoundingClientRect();
    return { x: fb.left + (b.left + b.width / 2) * s, y: fb.top + (b.top + b.height / 2) * s };
  });
  await page.mouse.move(region.x, region.y);
  await page.waitForFunction(() => document.querySelector('.lr-lockbtn')?.dataset.slot === 't:1');
  await shot(page, '4-adopted');

  // 기본 디자인으로 되돌리기 — 확인 창도 상세 팝업 안쪽
  await page.mouse.move(2, 2);
  await tools.getByRole('button', { name: '기본 디자인으로 되돌리기' }).click();
  const confirm = page.getByRole('dialog', { name: '기본 디자인으로 되돌릴까요?' });
  await confirm.waitFor();
  assert.ok(inside(await confirm.boundingBox(), await detail.boundingBox()));
  await confirm.getByRole('button', { name: '되돌리기' }).click();
  await tools.locator('.ld-mark').waitFor({ state: 'detached' });
  assert.equal((await detailOf()).design, null);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log('layout-design-ui: ok');
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
