// Real HTTP/auth/SQLite + two independent servers/browser contexts. No LLM calls or production data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'winmate-my-account-'));
const ports = [18883, 18884], origins = ports.map(port => 'http://127.0.0.1:' + port);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const output = path.join(root, 'app/tests/output/my-account-templates');
await fs.mkdir(output, { recursive: true });
let logs = '', browser;
const processes = ports.map((port, i) => {
  const child = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/template_account_server.py'], {
    cwd: root, env: { ...process.env, WINMATE_API_PORT: String(port), WINMATE_AUTH_DIR: path.join(temp, 'auth-' + i),
      WINMATE_TEMPLATE_DB: path.join(temp, 'operations.sqlite'), WINMATE_SPATIAL_DB: path.join(temp, 'spatial-' + i + '.sqlite'),
      WINMATE_STORYBOARD_DIR: path.join(temp, 'storyboards-' + i) }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.on('data', data => { logs += data; }); return child;
});
const errors = [], checks = [];
const pass = text => { checks.push(text); console.log('PASS', text); };
try {
  for (const origin of origins) for (let i = 0; ; i++) {
    try { if ((await fetch(origin + '/api/auth/status')).ok) break; } catch {}
    if (i > 200 || processes.some(child => child.exitCode !== null)) throw new Error('Fixture unavailable: ' + logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = async origin => {
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
    assert.equal((await ctx.request.post(origin + '/api/auth/login', { data: { username: 'admin', password: 'isolated-template-password' } })).status(), 200);
    await ctx.route('**/api/llm', route => route.fulfill({ status: 503, json: { code: 'test_no_model' } }));
    return ctx;
  };
  const openMy = async (ctx, origin) => {
    const page = await ctx.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await page.locator('.app[data-app-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'My 템플릿', exact: true }).click();
    await page.getByRole('textbox', { name: '레이아웃 검색', exact: true }).click();
    return page;
  };
  const first = await context(origins[0]);
  const seed = await first.newPage(); await seed.goto(origins[0] + '/api/auth/status');
  await seed.evaluate(async png => {
    const blob = await (await fetch(png)).blob();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('winmate-my', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('tpl', { keyPath: 'f' }); request.result.createObjectStore('img'); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['tpl', 'img'], 'readwrite');
        tx.objectStore('img').put(blob, 'legacyPhoto');
        const meta = { f: 'L_MY_account_fixture', c: 'MY', name: '계정 이관 확인', p: 'overview', req: [], prods: [], sols: [], nT: 1, nI: 1,
          my: { kind: 'edit', from: 'L_AIS_02', at: Date.now(), up: Date.now() } };
        tx.objectStore('tpl').put({ f: meta.f, meta, imgs: ['legacyPhoto'], html: '<div style="position:relative;width:1280px;height:720px;background:#fff"><div data-tb="0" style="position:absolute;left:64px;top:64px;font-size:32px">계정 이관 확인</div><div data-img="0" style="position:absolute;left:64px;top:180px;width:400px;height:300px"><img src="wmimg:legacyPhoto" style="width:100%;height:100%"></div><img src="/img/ph/fb-counter-menu.jpg" style="position:absolute;left:600px;top:180px;width:400px;height:300px"></div>' });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
  }, png);
  await seed.close();
  const page1 = await openMy(first, origins[0]);
  await page1.getByRole('button', { name: '계정 이관 확인 크게 보기', exact: true }).waitFor();
  const manifest = await (await first.request.get(origins[0] + '/api/my-templates')).json();
  assert.equal(manifest.owner, 'admin'); assert.equal(manifest.items.length, 1);
  assert.equal((await first.request.get(origins[0] + '/api/my-templates/images/legacyPhoto')).status(), 200);
  const portable = await (await first.request.get(origins[0] + '/api/my-templates/L_MY_account_fixture')).json();
  assert.equal(portable.imgs.length, 2); assert(!portable.html.includes('/img/ph/'));
  pass('legacy IndexedDB layout and image migrate to the authenticated admin account DB');

  const second = await context(origins[1]);
  await second.route('**/img/**', route => route.abort());
  const page2 = await openMy(second, origins[1]);
  await page2.getByRole('button', { name: '계정 이관 확인 크게 보기', exact: true }).waitFor();
  await page2.waitForFunction(() => [...document.querySelectorAll('[data-library-scope="my"] img')].some(image => image.complete && image.naturalWidth > 20 && image.src.includes('/api/my-templates/images/')));
  assert.equal((await (await second.request.get(origins[1] + '/api/my-templates')).json()).store_id, manifest.store_id);
  pass('fresh browser on a second server/origin restores the same template and actual image from SQLite');

  await page2.getByRole('button', { name: '계정 이관 확인 크게 보기', exact: true }).click();
  await page2.getByRole('textbox', { name: '이름', exact: true }).fill('다른 서버에서 수정한 이름');
  await page2.getByRole('textbox', { name: '이름', exact: true }).press('Enter');
  await page2.getByRole('heading', { name: '다른 서버에서 수정한 이름', exact: true }).waitFor();
  await page2.getByRole('button', { name: '닫기', exact: true }).click();
  await first.route('**/api/my-templates/L_MY_account_fixture', route => route.fulfill({ status: 503, json: { detail: 'fixture read unavailable' } }));
  await page1.reload(); await page1.locator('.app[data-app-ready="true"]').waitFor();
  await page1.getByRole('button', { name: '계정 이관 확인 크게 보기', exact: true }).click();
  await page1.getByRole('textbox', { name: '이름', exact: true }).fill('오래된 캐시에서 덮어쓰기');
  await page1.getByRole('textbox', { name: '이름', exact: true }).press('Enter');
  await page1.getByText(/템플릿 정보를 저장하지 못했어요: 다른 화면에서 템플릿이 변경됐어요/).waitFor();
  await first.unroute('**/api/my-templates/L_MY_account_fixture');
  await page1.reload(); await page1.locator('.app[data-app-ready="true"]').waitFor();
  await page1.getByRole('button', { name: '다른 서버에서 수정한 이름 크게 보기', exact: true }).waitFor();
  assert.equal((await (await first.request.get(origins[0] + '/api/my-templates/L_MY_account_fixture')).json()).revision, 2);
  await page1.screenshot({ path: path.join(output, 'restored-on-first-server.png') });
  pass('metadata edits on the second server replace stale cache on the first without creating duplicates');
  pass('a failed refresh never gives stale cached content permission to overwrite a newer server revision');

  await second.route('**/api/my-templates', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, json: { detail: 'fixture unavailable' } }) : route.continue());
  await page2.getByRole('button', { name: '다른 서버에서 수정한 이름 크게 보기', exact: true }).click();
  await page2.getByRole('textbox', { name: '이름', exact: true }).fill('실패한 저장');
  await page2.getByRole('textbox', { name: '이름', exact: true }).press('Enter');
  await page2.getByText('템플릿 정보를 저장하지 못했어요: fixture unavailable', { exact: true }).waitFor();
  assert.equal(await page2.getByRole('textbox', { name: '이름', exact: true }).inputValue(), '다른 서버에서 수정한 이름');
  assert.equal((await (await first.request.get(origins[0] + '/api/my-templates/L_MY_account_fixture')).json()).revision, 2);
  await second.unroute('**/api/my-templates');
  pass('failed server save leaves account metadata and visible name unchanged');

  const deletion = await second.request.post(origins[1] + '/api/my-templates/delete', { data: { items: [{ f: 'L_MY_account_fixture', base_revision: 2 }] } });
  assert.equal(deletion.status(), 200);
  await page1.reload(); await page1.locator('.app[data-app-ready="true"]').waitFor();
  assert.equal(await page1.locator('.tl-card[data-f="L_MY_account_fixture"]').count(), 0);
  assert((await (await first.request.get(origins[0] + '/api/my-templates')).json()).items[0].deleted);
  pass('deletion from another server clears stale browser cache and is never reimported');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser?.close();
  for (const child of processes) child.kill('SIGTERM');
  await Promise.all(processes.map(child => child.exitCode !== null ? undefined : new Promise(resolve => child.once('exit', resolve))));
  await fs.rm(temp, { recursive: true, force: true });
}
