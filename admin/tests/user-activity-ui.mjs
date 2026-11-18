// 사용자 관리 → 활동 내역 → '열기' (웹앱 새 탭 · 그 사용자로 · 읽기 전용). Run against an isolated instance
// (WINMATE_ADMIN_TEST_URL, admin password 'Admin-local-test-2026!'); it creates one throwaway member account.
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8796';
const out = path.resolve('admin/runtime/evidence/user-activity'); fs.mkdirSync(out, { recursive: true });
const member = 'qa_view_' + Date.now().toString(36), password = 'Shared-initial-2026!';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
const results = [], errors = [];
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' });
const login = async (ctx, username, pass) => { const r = await ctx.request.post(base + '/api/auth/login', { data: { username, password: pass }, headers: { Origin: base } }); assert.equal(r.status(), 200, await r.text()); };
async function eventually(fn, ms = 30000) { const start = Date.now(); let last; while (Date.now() - start < ms) { try { last = await fn(); if (last) return last; } catch { /* retry */ } await new Promise(r => setTimeout(r, 300)); } throw Error('Condition did not become true: ' + last); }
try {
  const admin = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  await login(admin, 'admin', 'Admin-local-test-2026!');
  const created = await admin.request.post(base + '/admin/api/users', { data: { usernames: member, password, display_name: '열람 확인' }, headers: { Origin: base } });
  assert.equal(created.status(), 200, await created.text());

  // The member makes a proposal in the real app; it reaches the account store on its own.
  const work = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await login(work, member, password);
  const app = await work.newPage(); app.on('pageerror', e => errors.push('member:' + e.message));
  await app.goto(base + '/'); await app.waitForSelector('[data-app-ready="true"]', { timeout: 60000 });
  await app.locator('.sb-new').click();
  const proposal = await eventually(async () => { const m = await (await work.request.get(base + '/api/account-data/proposals')).json(); return m.items.find(i => !i.deleted)?.id; });
  results.push('A member proposal reaches the account store');

  const page = await admin.newPage(); page.on('pageerror', e => errors.push('admin:' + e.message));
  await page.goto(base + '/admin/users');
  await page.getByRole('textbox', { name: '사용자 검색' }).fill(member);
  // The whole row opens the user, not only the name or the chevron.
  await page.locator('.um-row', { hasText: member }).locator('td').nth(4).click();
  assert.equal(await page.locator('.um-tabs [aria-selected=true]').innerText(), '활동 내역');
  assert.equal((await page.locator('.um-tabs [role=tab]').allInnerTexts()).at(-1), '사용자 정보');
  const card = page.locator('.um-card', { hasText: '제안서' }).first();
  await eventually(async () => (await card.locator('.um-card-value').innerText()).startsWith('1'));
  for (const label of ['LLM 입력 · 출력', '제안 시뮬레이션', '조감도', '제안서 검토', '로그인']) await page.locator('.um-card', { hasText: label }).first().waitFor();
  const row = page.locator('.um-record-table tbody tr').first();
  await row.waitFor(); assert.match(await row.innerText(), /제안서/);
  await shot(page, 'activity');
  results.push('Row click opens 활동 내역 first: period totals, chart and the record list (사용자 정보 last)');

  const [inspect] = await Promise.all([admin.waitForEvent('page'), row.locator('.um-open').click()]);
  const writes = [];
  inspect.on('request', r => { if (r.url().includes('/api/') && !['GET', 'HEAD'].includes(r.method())) writes.push(r.method() + ' ' + new URL(r.url()).pathname); });
  inspect.on('pageerror', e => errors.push('inspect:' + e.message));
  await inspect.waitForSelector('[data-app-ready="true"]', { timeout: 60000 });
  await inspect.locator('.inspect-bar').waitFor();
  assert.equal(new URL(inspect.url()).pathname, '/storyboard/' + proposal);
  assert.equal(new URL(inspect.url()).hash, '', 'the token leaves the address bar');
  const user = await inspect.evaluate(async () => (await (await fetch('/api/bootstrap')).json()).user);
  assert.equal(user.username, member); assert.equal(user.inspect.by, 'admin');
  const attempt = await inspect.evaluate(async () => { const r = await fetch('/api/account-data/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 'x', data: { t: 1 } }] }) }); return [r.status, (await r.json()).code]; });
  assert.deepEqual(attempt, [403, 'inspect_read_only']);
  await inspect.waitForTimeout(3000);
  assert.ok(writes.every(w => /\/fetch$|\/blobs\/missing$/.test(w)), 'only read-only POSTs leave an inspection tab: ' + writes.join(', '));
  assert.deepEqual(await inspect.evaluate(name => Object.keys(localStorage).filter(k => k.includes(name)), member), [], "the member's records stay out of this browser's storage");
  await inspect.hover('.inspect-tag'); await shot(inspect, 'inspect-tab');
  results.push('열기 opens the record in the webapp as that user, read-only, in a new tab');

  const own = await admin.newPage(); await own.goto(base + '/'); await own.waitForSelector('[data-app-ready="true"]', { timeout: 60000 });
  assert.equal(await own.evaluate(async () => (await (await fetch('/api/bootstrap')).json()).user.username), 'admin');
  assert.equal(await own.locator('.inspect-bar').count(), 0);
  results.push("The admin's other tabs stay the admin's own");

  await page.setViewportSize({ width: 390, height: 844 }); await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.body.scrollWidth > innerWidth), false);
  results.push('Users page has no horizontal document overflow on mobile');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
  await browser.close();
}
