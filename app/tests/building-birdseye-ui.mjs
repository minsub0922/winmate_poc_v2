// 건물 조감도(라이브 아티팩트 Version 136과 같은 동작) — 실행 중인 앱(WINMATE_TEST_URL, 기본 8788)에서 검사한다.
// 사이드바 → 목록(예시 2개) → 캠퍼스 복합관 → 외관 보기에서 외벽 클릭 = 외벽 고르기 팝업(층 카드 없음) ·
// 외벽 바꾸기(시점 그대로 · 저장) · 같은 업종 일괄 · Esc · 층 이름 = 층 카드(외벽 칸 없음) · 띠 외벽 버튼(키보드) ·
// 빈 곳 클릭 닫힘 · 펼쳐 보기 클릭 = 층 보기 · HTML 추출 · 건물 템플릿 먼저 → 빈 층 → 공간 채우기 · 층 추가(모양 유지) · 모바일 시트.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { origin, output as outRoot, showSidebar } from './helpers.mjs';

const output = path.join(outRoot, 'building-birdseye'); fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [], pass = (s) => { checks.push(s); console.log('PASS ' + s); };
const LONG = 180000;

const anchorOf = (page, n) => page.evaluate((n) => {
  const el = [...document.querySelectorAll('.bd-floor-label')].find((x) => x.querySelector('b').textContent === n + 'F');
  if (!el) return null; const r = el.getBoundingClientRect();
  return { x: el.classList.contains('is-in') ? r.left - 12 : r.right + 12, y: r.top + r.height / 2, right: r.right };
}, n);
const cursorAt = async (page, x, y) => {
  await page.mouse.move(x - 2, y); await page.waitForTimeout(160);
  await page.mouse.move(x, y); await page.waitForTimeout(220);
  return page.evaluate(() => document.querySelector('.bd-render-host canvas').style.cursor);
};
const pop = (page) => page.evaluate(() => {
  const p = document.querySelector('.bd-fv-pop');
  return { open: !p.hidden, sheet: p.classList.contains('is-sheet'), head: p.hidden ? '' : p.querySelector('.bd-fv-pop-head').innerText.replace(/\s+/g, ' '),
    pressed: p.querySelector('.bd-fv-opt[aria-pressed=true]')?.innerText.replace(/\s+/g, ' ') || null, all: p.querySelector('.bd-fv-all')?.innerText || null,
    card: !document.querySelector('.bd-floor-card').hidden, cardFv: document.querySelectorAll('.bd-floor-card .bd-fv').length, active: document.activeElement?.className || '' };
});
const saved = (page) => page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('winmate-building'); q.onsuccess = () => r(q.result); });
  const b = await new Promise((r) => { const q = d.transaction('b').objectStore('b').get('bld-example-campus'); q.onsuccess = () => r(q.result); }); d.close();
  return b.floors.map((f) => f.fv).join(',');
});
const labels = (page) => page.evaluate(() => [...document.querySelectorAll('.bd-floor-label')].map((x) => { const r = x.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top); }).join(' '));

async function openCampus(page, mobile = false) {
  await page.goto(origin + '/'); await page.waitForFunction(() => document.querySelector('.app')?.dataset.appReady === 'true', null, { timeout: LONG });
  await showSidebar(page);
  await page.locator('.sidebar .sb-bld').click();
  if (!mobile) await page.mouse.move(page.viewportSize().width - 3, 2);
  await page.locator('.bd-card', { hasText: '캠퍼스 복합관' }).locator('.bd-card-open').click({ timeout: LONG });
  await page.locator('.bd-workspace').waitFor({ timeout: LONG });
  await page.waitForFunction(() => !document.querySelector('.bd-render-state'), null, { timeout: LONG });
  await page.waitForTimeout(4000);
}

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(LONG);
  page.on('pageerror', (e) => errors.push(e.message));
  await openCampus(page);
  assert.equal(await page.locator('.sidebar .sb-bld[aria-current=page]').count(), 1);
  assert.equal(await page.locator('#wm-bld-js').count(), 1);
  pass('sidebar 건물 조감도 opens the history list and the campus example studio');

  const cv = await page.evaluate(() => { const r = document.querySelector('.bd-render-host canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  assert.equal(await cursorAt(page, cv.x + 30, cv.y + 30), '');
  const a = await anchorOf(page, 3); let wall = null;
  for (const [dx, dy] of [[30, 0], [45, 4], [20, -4], [60, 8], [30, 8]]) if (await cursorAt(page, a.x + dx, a.y + dy) === 'pointer') { wall = [a.x + dx, a.y + dy]; break; }
  assert(wall, '3F facade point with pointer cursor');
  const before = await labels(page);
  await page.mouse.click(...wall); await page.locator('.bd-fv-pop:not([hidden])').waitFor();
  let st = await pop(page);
  assert.match(st.head, /^3F 외벽/); assert.equal(st.card, false); assert.equal(st.pressed, '붉은 벽돌 캠퍼스');
  await page.screenshot({ path: output + '/facade-popup.png' });
  pass('exterior facade click opens the facade popup only (no floor card), with a pointer cursor over walls');

  await page.locator('.bd-fv-pop .bd-fv-opt').nth(1).click(); await page.waitForTimeout(2500);
  st = await pop(page);
  assert.equal(st.open, true); assert.equal(st.pressed, '컬러 패널 스쿨'); assert.equal(st.all, '같은 업종 1개 층에도 적용');
  await page.waitForTimeout(800); assert.equal(await saved(page), '2,2,1,0'); assert.equal(await labels(page), before);
  await page.locator('.bd-fv-all').click(); await page.waitForTimeout(2500);
  assert.equal(await saved(page), '2,2,1,1'); assert.equal((await pop(page)).all, null);
  await page.screenshot({ path: output + '/facade-changed.png' });
  pass('choosing a facade rebuilds only the walls, keeps the camera, saves, and applies to the same industry');

  await page.keyboard.press('Escape'); await page.waitForTimeout(400); assert.equal((await pop(page)).open, false);
  await page.locator('.bd-floor-label', { hasText: '3F' }).click(); await page.waitForTimeout(3000);
  st = await pop(page); assert.equal(st.card, true); assert.equal(st.cardFv, 0); assert.equal(st.open, false);
  await page.screenshot({ path: output + '/floor-card.png' });
  pass('Esc closes; floor label shows the floor card without facade options');

  await page.locator('.bd-floor-chip.is-on .bd-fv-act').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  st = await pop(page); assert.equal(st.open, true); assert.equal(st.active, 'bd-fv-opt');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  st = await pop(page); assert.equal(st.open, false); assert.match(st.active, /bd-fv-act/);
  await page.locator('.bd-floor-chip.is-on .bd-fv-act').click(); await page.waitForTimeout(600);
  await page.mouse.click(cv.x + 30, cv.y + 30); await page.waitForTimeout(800); assert.equal((await pop(page)).open, false);
  pass('strip facade button opens the same popup by keyboard, Esc returns focus, empty click closes');

  await page.locator('.bd-strip-all').click(); await page.waitForTimeout(1500);
  await page.locator('.bd-view-switch button', { hasText: '펼쳐 보기' }).click(); await page.waitForTimeout(3000);
  assert.equal(await cursorAt(page, cv.x + cv.w / 2, cv.y + cv.h / 2), '');
  await page.mouse.click(cv.x + cv.w / 2, cv.y + cv.h / 2); await page.waitForTimeout(3000);
  st = await pop(page); assert.equal(st.open, false); assert.equal(st.card, true);
  pass('spread view keeps click-to-floor and never opens the facade popup');

  await page.locator('.bd-dl-btn').click();
  const download = page.waitForEvent('download');
  await page.locator('.bd-menu [role=menuitem]', { hasText: 'HTML 추출' }).click();
  const file = await download; const htmlPath = path.join(output, 'export.html'); await file.saveAs(htmlPath);
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert(html.includes('<title>캠퍼스 복합관 · 건물 조감도</title>')); assert(html.length > 600000); assert(html.includes('m.viewer(a,c)'));
  pass('HTML 추출 saves the standalone 3D viewer');

  // 건물 템플릿 먼저 → 층마다 공간은 빈 채로 스튜디오 → 공간 채우기 · 층 추가(맨 위층과 같은 크기 · 외벽)
  const latest = () => page.evaluate(async () => {
    const d = await new Promise((r) => { const q = indexedDB.open('winmate-building'); q.onsuccess = () => r(q.result); });
    const all = await new Promise((r) => { const q = d.transaction('b').objectStore('b').getAll(); q.onsuccess = () => r(q.result); }); d.close();
    return all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  });
  await page.locator('.bd-back').click(); await page.locator('.bd-launch').click(); await page.locator('.bd-pick-modal').waitFor();
  assert.equal(await page.locator('.bd-pick-modal .bd-tabs').count(), 0);
  assert.equal(await page.locator('.bd-pick-modal .bd-pre').count(), 54);
  assert.equal(await page.locator('.bd-pick-modal .bd-tpl-meta', { hasText: /\d+층/ }).count(), 0);
  await page.locator('.bd-pre', { hasText: '블루 글라스 오피스' }).click(); await page.locator('.mfoot .btn-primary').click();
  await page.locator('.bd-workspace').waitFor(); await page.waitForFunction(() => !document.querySelector('.bd-render-state'), null, { timeout: LONG }); await page.waitForTimeout(3000);
  assert.deepEqual((await page.locator('.bd-floor-pick').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')), ['1F 빈 층', '2F 빈 층', '3F 빈 층', '4F 빈 층']);
  let bld = await latest();
  assert(bld.floors.every((f) => f.tpl === null && f.shell.ind === 'OF'));
  await page.screenshot({ path: output + '/template-empty.png' });
  pass('start = building template only (no floor counts); studio opens with the template shape and empty floors');

  await page.locator('.bd-floor-pick', { hasText: '1F' }).click(); await page.locator('.bd-fc-fill').click(); await page.locator('.bd-pick-modal').waitFor();
  assert.equal((await page.locator('.bd-pick-size').innerText()).trim(), '24×15m');
  const sizes = new Set((await page.locator('.bd-pick-modal .bd-tpl:not([hidden]) .bd-tpl-meta').allInnerTexts()).map((t) => t.split(' · ').pop()));
  assert.deepEqual([...sizes], ['24×15m']);
  await page.locator('.bd-pick-modal .bd-tpl:not([hidden])').first().click(); await page.locator('.mfoot .btn-primary').click(); await page.waitForTimeout(2500);
  assert.equal(await page.locator('.bd-fc-acts').count(), 1);
  pass('empty floor offers only spaces that fit its footprint and fills the floor');

  await page.locator('.bd-strip-all').click(); await page.waitForTimeout(1200);
  await page.locator('.bd-floor-add').click(); await page.locator('.bd-pick-modal').waitFor();
  await page.locator('.bd-pick-modal .bd-chip', { hasText: '전체' }).click(); await page.locator('.bd-pick-modal .bd-chip', { hasText: '외식' }).click();
  await page.locator('.bd-pick-modal .bd-tpl:not([hidden])').first().click(); await page.locator('.mfoot .btn-primary').click(); await page.waitForTimeout(2500);
  await page.locator('.bd-floor-add').click(); await page.locator('.bd-pick-blank').click(); await page.waitForTimeout(2500);
  bld = await latest();
  assert.equal(bld.floors.length, 6);
  const top = bld.floors[3].shell;
  for (const f of bld.floors.slice(4)) { assert.deepEqual(f.shell, top); assert.equal(f.fv, bld.floors[3].fv); }
  assert.equal(bld.floors[5].tpl, null);
  await page.locator('.bd-strip-all').click(); await page.waitForTimeout(1500);
  await page.screenshot({ path: output + '/template-added.png' });
  pass('added floors (another industry or empty) keep the top floor footprint and facade');

  // 층 간판 = 넣은 공간(외식 층은 외식 간판, 빈 층은 간판 없음) · 간판을 누르면 이름 바꾸기
  const signsOf = (i) => page.evaluate((i) => {
    const st = document.querySelector('.bd-render-host').__stage, c = st.renderer.domElement.getBoundingClientRect();
    const d = st.camera.position.clone().sub(st.controls.target); d.y = 0; d.normalize();
    const out = [];
    for (const s of st.floors[i].sides) if (s.group.visible && s.n.dot(d) > 0.2) s.group.traverse((o) => {
      if (!o.userData.sign) return;
      o.geometry.computeBoundingBox(); o.updateWorldMatrix(true, false);
      const v = o.geometry.boundingBox.getCenter(d.clone()).applyMatrix4(o.matrixWorld), p = st.project(v.x, v.y, v.z);
      out.push({ x: c.left + p.x, y: c.top + p.y });
    });
    return out;
  }, i);
  assert.equal((await signsOf(5)).length, 0);
  const cafe = await signsOf(4);
  assert(cafe.length > 0);
  await page.mouse.click(cafe[0].x, cafe[0].y); await page.locator('.bd-name-input').waitFor();
  assert.equal(await page.locator('.bd-name-input').inputValue(), '카페 · 레스토랑');
  await page.keyboard.type('스타벅스 리저브'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  assert.equal((await page.locator('.bd-floor-pick').nth(4).innerText()).replace(/\s+/g, ' '), '5F 스타벅스 리저브');
  assert.equal((await latest()).floors[4].name, '스타벅스 리저브');
  await page.screenshot({ path: output + '/sign-renamed.png' });
  pass('floor signs follow the inserted space (none on empty floors) and clicking a sign renames the floor');
  await context.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage(); m.setDefaultTimeout(LONG); m.on('pageerror', (e) => errors.push(e.message));
  await openCampus(m, true);
  const b = await anchorOf(m, 2); let opened = false;
  for (const dx of [140, 170, 200, 230]) {
    const x = b.x + dx, y = b.y + 0.3 * dx;
    if (await m.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [x, y]) !== 'CANVAS') continue;
    await m.touchscreen.tap(x, y); await m.waitForTimeout(2000);
    const s = await pop(m); if (s.open) { assert.equal(s.sheet, true); opened = true; break; }
  }
  assert(opened, 'mobile facade tap opens a sheet');
  await m.screenshot({ path: output + '/mobile-sheet.png' });
  pass('mobile facade tap opens the facade sheet');
  await mobile.close();

  assert.deepEqual(errors, []);
  fs.writeFileSync(output + '/report.json', JSON.stringify({ ok: true, checks, errors }, null, 2));
} catch (error) {
  fs.writeFileSync(output + '/report.json', JSON.stringify({ ok: false, checks, errors, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
