// Source review on an isolated admin. Run against a server with the usual test credentials.
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const browser = await chromium.launch({ headless:true, ...(process.env.CHROME ? {executablePath:process.env.CHROME} : {}) });
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const res = await context.request.post(base + '/api/auth/login', {data:{username:'admin',password:process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!'}});
  assert.equal(res.status(),200);
  const page = await context.newPage(), errors = [];
  page.on('pageerror',e => errors.push(e.message));
  await page.goto(base + '/admin/dss');
  await page.waitForURL('**/admin/sources');
  const cards = page.locator('.sb-review-button');
  assert.equal(await cards.first().waitFor().then(() => cards.count()),3);
  assert.equal(await page.locator('nav [href$="/assets"],nav [href$="/dss"]').count(),0);
  for (const card of await cards.all()) {
    await card.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button',{name:'지금 점검'}).waitFor();
    await dialog.getByRole('tab',{name:'처리 이력'}).click();
    await dialog.getByRole('tab',{name:'검토할 변경'}).click();
    assert.ok(await dialog.getByRole('button',{name:'선택한 변경 처리'}).isDisabled());
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(base + '/admin/assets');
  await page.waitForURL('**/admin/sources');
  await cards.last().click();
  await page.getByRole('tab',{name:'처리 이력'}).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors,[]);
  console.log('Source review cards, removed routes, history and mobile passed.');
} finally { await browser.close(); }
