// Real sharing HTTP + multiple isolated browsers. Own server, credentials and SQLite; no model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'winmate-sharing-'));
const port = process.env.WINMATE_SHARING_TEST_PORT || '8796';
process.env.WINMATE_TEST_URL = `http://127.0.0.1:${port}`;
process.env.WINMATE_STRICT_VITE_PORT = process.env.WINMATE_SHARING_WEB_PORT || '5198';
const server = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/sharing_server.py'], {
  cwd: root, env: { ...process.env, WINMATE_API_PORT: port, WINMATE_AUTH_DIR: path.join(temp, 'auth'), WINMATE_STORYBOARD_DIR: path.join(temp, 'shares') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = ''; server.stdout.on('data', x => { logs += x; }); server.stderr.on('data', x => { logs += x; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { startVite, launch } = await import('./fixtures/strict/harness.mjs');
let vite, browser;
const checks = [];
const pageErrors = [];
const until = async (fn, label, timeout = 18000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await sleep(100); }
  throw new Error('Timed out: ' + label);
};
const history = page => page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.proposals') || '[]'));
const sharedState = page => page.evaluate(async () => {
  const token = /^\/s\/([A-Za-z0-9_-]{32,64})/.exec(location.pathname)?.[1];
  return token ? (await import('/src/services/sharing.js')).connectShared(token).state : null;
});
const sync = page => until(async () => (await sharedState(page))?.status === 'synced', 'saved shared changes');
const registerPage = page => page.on('pageerror', error => pageErrors.push(error.message));
try {
  await until(async () => { try { return (await fetch(process.env.WINMATE_TEST_URL + '/api/auth/status')).ok; } catch { return false; } }, 'isolated server ready', 60000);
  vite = await startVite(); browser = await launch();
  const ownerContext = await browser.newContext({ viewport: { width: 1500, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const guestContext = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const readerContext = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const login = await ownerContext.request.post(vite.url + '/api/auth/login', { data: { username: 'sharing-owner', password: 'sharing-browser-test-password' } });
  assert.equal(login.status(), 200);
  const owner = await ownerContext.newPage(); registerPage(owner);
  await owner.goto(vite.url); await owner.locator('.home').waitFor();
  const seeded = await owner.evaluate(async () => {
    const repo = await import('/src/repositories/proposals.js');
    const { SC } = await import('/src/domain/templates/scenarios.js');
    const { storyboardOf } = await import('/src/domain/templates/scenario_storyboard.js');
    const source = storyboardOf(SC.bs03); source.title = 'History source'; source.req.free = [{ t: 'REUSED CUSTOMER REQUIREMENTS' }];
    const sourceId = repo.cloneProposal(source);
    const target = storyboardOf(SC.bs01); target.title = 'Owner board';
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0fkAAAAASUVORK5CYII=';
    const upload = await repo.putImage(pixel);
    target.parts.flatMap(p => p.layouts).find(x => x.f === 'L_PH_ES_A').ov.img[0] = { src: upload, fit: 'contain', name: 'Shared upload' };
    const templates = await import('/src/repositories/templates.js');
    const image = await templates.storeImage(pixel);
    const f = templates.newF();
    await templates.saveTemplates([{ meta: templates.myMeta({ f, name: 'Shared custom', p: 'overview', nT: 1, nI: 1 }), html: `<div style="width:1280px;height:720px;background:white"><h1 class="shared-custom-label" data-tb="0">CUSTOM SHARED LAYOUT</h1><div data-img="0" style="width:400px;height:300px"><img src="wmimg:${image}" style="width:100%;height:100%"></div></div>` }]);
    target.parts.find(p => !p.deck).layouts.push({ uid: repo.uid('l'), f, status: 'done', ov: { t: {}, img: {} } });
    const id = repo.cloneProposal(target); repo.saveUi({ route: { name: 'proposal', id } });
    await new Promise(r => setTimeout(r, 350)); return { id, sourceId, ctx: source.ctx, partCount: target.parts.length, custom: f };
  });
  await owner.reload(); await owner.locator('#pr-title').waitFor();
  await until(async () => /^\/s\/[^/]+$/.test(new URL(owner.url()).pathname), 'share URL created on entry');
  const url = owner.url();
  const token = new URL(url).pathname.split('/').at(-1);
  assert.equal(new URL(owner.url()).pathname, '/s/' + token);
  checks.push('Storyboard entry creates a stable direct URL');

  await owner.locator('.start-node .node').click();
  await owner.locator('#rq-pop').getByRole('button', { name: '이전 히스토리에서 불러오기' }).click();
  let reuse = owner.getByRole('dialog', { name: '이전 고객 요구사항 재사용', exact: true });
  await reuse.waitFor(); await reuse.getByRole('button').filter({ hasText: 'History source' }).click();
  assert.ok((await reuse.locator('.reuse-preview').innerText()).includes('REUSED CUSTOMER REQUIREMENTS'));
  await reuse.getByRole('button', { name: '이 내역 불러오기', exact: true }).click();
  await until(async () => (await history(owner)).find(x => x.id === seeded.id)?.req.free[0]?.t === 'REUSED CUSTOMER REQUIREMENTS', 'requirements reused');
  await owner.locator('#rq-pop .bp-x').click();
  await owner.locator('.match-node .node').click();
  await owner.locator('#mt-pop').getByRole('button', { name: '이전 히스토리에서 불러오기' }).click();
  reuse = owner.getByRole('dialog', { name: '이전 제품 · 솔루션 매칭 재사용', exact: true });
  await reuse.getByRole('button').filter({ hasText: 'History source' }).click();
  await reuse.getByRole('button', { name: '이 내역 불러오기', exact: true }).click();
  await owner.locator('#mt-pop .bp-x').click(); await sync(owner);
  let target = (await history(owner)).find(x => x.id === seeded.id);
  assert.deepEqual(target.ctx, seeded.ctx); assert.equal(target.parts.length, seeded.partCount);
  checks.push('requirements and product selection reuse only the selected bubble');

  await owner.getByRole('button', { name: '공유', exact: true }).click();
  const shareDialog = owner.getByRole('dialog', { name: 'Storyboard 공유', exact: true }); await shareDialog.waitFor();
  assert.equal(await owner.evaluate(() => navigator.clipboard.readText()), url);
  assert.equal(await shareDialog.getByRole('combobox', { name: '링크 접근 권한' }).inputValue(), 'view');
  await shareDialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  checks.push('share copies the link and defaults to read-only');

  const guest = await guestContext.newPage(); registerPage(guest);
  const reader = await readerContext.newPage(); registerPage(reader);
  await guest.goto(url); await guest.locator('#pr-title').waitFor();
  assert.equal(await guest.locator('#pr-title').getAttribute('readonly'), '');
  await sleep(400); assert.equal((await history(guest)).length, 0);
  await guest.locator('.start-node .node').click();
  assert.ok((await guest.locator('#rq-pop').innerText()).includes('REUSED CUSTOMER REQUIREMENTS'));
  assert.equal(await guest.locator('#free-ed').count(), 0); await guest.locator('#rq-pop .bp-x').click();
  checks.push('link-only read access has no editing controls or history entry');
  await guest.getByRole('button', { name: 'Shared custom 열기', exact: true }).click();
  await guest.locator('.modal.sheet .shared-custom-label').waitFor();
  await guest.locator('.modal.sheet .sv-stage [data-img] img').evaluate(img => img.decode());
  assert.equal(await guest.locator('.modal.sheet .sv-stage [data-img] img').evaluate(img => img.naturalWidth), 1);
  await guest.locator('.modal.sheet .mfoot').getByRole('button', { name: '닫기', exact: true }).click();
  const assets = await (await ownerContext.request.get(vite.url + '/api/storyboards/' + token)).json();
  assert.ok(assets.document.sharedTemplates.find(t => t.meta.f === seeded.custom).html.includes('data:image/png'));
  assert.ok(assets.document.parts.flatMap(p => p.layouts).find(x => x.f === 'L_PH_ES_A').ov.img[0].src.startsWith('data:image/png'));
  checks.push('uploaded images and My layouts render in another browser');

  await owner.getByRole('button', { name: '공유', exact: true }).click();
  await shareDialog.getByRole('combobox', { name: '링크 접근 권한' }).selectOption('edit');
  await shareDialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await until(async () => await guest.locator('#pr-title').getAttribute('readonly') === null, 'live edit permission');
  assert.equal((await history(guest)).length, 0);
  await guest.evaluate(async () => {
    const repo = await import('/src/repositories/proposals.js');
    const token = window.location.pathname.split('/').at(-1);
    repo.update('shared-' + token, d => { d.exportedAt = Date.now(); });
  });
  await sync(guest); assert.equal((await history(guest)).length, 0, 'export metadata alone does not add a shared history entry');
  await guest.locator('#pr-title').fill('Guest changed'); await sync(guest);
  await until(async () => await owner.locator('#pr-title').inputValue() === 'Guest changed', 'guest edit reaches owner');
  await until(async () => (await history(guest)).length === 1, 'guest history appears after saved edit');
  assert.equal((await history(guest))[0]._share.token, token);
  checks.push('live permission upgrade and guest edit sync, with history on first saved edit');

  await reader.goto(url); await reader.locator('#pr-title').waitFor(); await sleep(400);
  assert.equal((await history(reader)).length, 0);
  await owner.locator('.start-node .node').click();
  await owner.locator('#rq-pop [role="tab"]').filter({ hasText: '자유형식' }).click();
  await Promise.all([owner.locator('#free-ed').fill('OWNER CONCURRENT REQUIREMENT'), guest.locator('#pr-title').fill('Concurrent title')]);
  await sync(owner); await sync(guest);
  await until(async () => await owner.locator('#pr-title').inputValue() === 'Concurrent title', 'concurrent title reaches owner');
  const remote = await (await ownerContext.request.get(vite.url + '/api/storyboards/' + token)).json();
  assert.equal(remote.document.title, 'Concurrent title'); assert.equal(remote.document.req.free[0].t, 'OWNER CONCURRENT REQUIREMENT');
  await owner.locator('#rq-pop .bp-x').click();
  checks.push('concurrent changes to different fields merge');

  await guest.evaluate(async token => {
    const session = (await import('/src/services/sharing.js')).connectShared(token);
    await session.refresh(); clearInterval(session.interval); session.interval = null;
  }, token);
  await owner.locator('#pr-title').fill('Server wins'); await sync(owner);
  await guest.locator('#pr-title').fill('Local conflict');
  await until(async () => (await sharedState(guest))?.status === 'conflict', 'same-field conflict shown');
  assert.equal(await guest.locator('#pr-title').inputValue(), 'Local conflict');
  assert.equal(await owner.locator('#pr-title').inputValue(), 'Server wins');
  await guest.getByRole('button', { name: '공유', exact: true }).click();
  const conflictDialog = guest.getByRole('dialog', { name: 'Storyboard 공유', exact: true });
  await conflictDialog.getByRole('button', { name: '내 변경 반영', exact: true }).click(); await sync(guest);
  await conflictDialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await until(async () => await owner.locator('#pr-title').inputValue() === 'Local conflict', 'explicit conflict resolution');
  await guest.evaluate(async token => { const session = (await import('/src/services/sharing.js')).connectShared(token); session.interval = setInterval(() => session.refresh(), 1500); }, token);
  checks.push('same-field conflicts preserve local edits and require explicit resolution');

  await owner.getByRole('button', { name: '공유', exact: true }).click();
  await shareDialog.getByRole('combobox', { name: '링크 접근 권한' }).selectOption('view');
  await shareDialog.getByRole('button', { name: '닫기', exact: true }).last().click();
  await until(async () => await guest.locator('#pr-title').getAttribute('readonly') === '', 'revoked edit permission');
  assert.equal((await readerContext.request.patch(vite.url + '/api/storyboards/' + token, { data: { operations: [{ path: ['title'], exists: true, before: 'Local conflict', value: 'Forbidden' }] } })).status(), 403);
  await guest.reload(); await guest.locator('#pr-title').waitFor(); assert.equal((await history(guest)).length, 1);
  await reader.getByRole('button', { name: '공유', exact: true }).click();
  assert.equal(await reader.getByRole('combobox', { name: '링크 접근 권한' }).count(), 0);
  await reader.getByRole('dialog', { name: 'Storyboard 공유', exact: true }).getByRole('button', { name: '닫기', exact: true }).last().click();
  checks.push('revocation affects already-open editors and is enforced by the server');

  for (const page of [owner, guest, reader]) assert.equal(await page.getByRole('button', { name: '이 스토리보드 활용하기', exact: true }).count(), 0);
  assert.equal((await history(reader)).length, 0);
  checks.push('owner, editor and reader omit the removed reuse action; viewing stays out of history');

  const productionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const production = await productionContext.newPage(); registerPage(production);
  await production.goto(process.env.WINMATE_TEST_URL + '/s/' + token);
  await production.locator('#pr-title').waitFor();
  assert.equal(await production.locator('#pr-title').inputValue(), 'Local conflict');
  assert.equal((await history(production)).length, 0);
  assert.equal(await production.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await production.getByRole('button', { name: '공유', exact: true }).click();
  assert.equal(await production.getByRole('dialog', { name: 'Storyboard 공유', exact: true }).getByRole('combobox').count(), 0);
  checks.push('built production share URL opens without login and fits mobile');

  const failureContext = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await failureContext.request.post(vite.url + '/api/auth/login', { data: { username: 'sharing-owner', password: 'sharing-browser-test-password' } });
  const failure = await failureContext.newPage(); registerPage(failure);
  const unavailable = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: '공유 서버 연결을 확인해 주세요.' }) });
  await failure.route(url => url.pathname === '/api/storyboards', unavailable);
  await failure.goto(vite.url); await failure.locator('.home').waitFor();
  await failure.evaluate(async () => {
    const repo = await import('/src/repositories/proposals.js');
    repo.saveUi({ route: { name: 'proposal', id: repo.createProposal() } });
    await new Promise(r => setTimeout(r, 350));
  });
  await failure.reload(); await failure.locator('#pr-title').waitFor();
  const control = failure.locator('.storyboard-share-control');
  const shareButton = control.getByRole('button', { name: '공유', exact: true });
  await until(async () => (await control.getAttribute('title'))?.includes('공유 서버 연결을 확인해 주세요.'), 'connection error in button hover');
  assert.ok(await shareButton.isDisabled());
  assert.equal(await control.locator('.share-alert').count(), 1);
  assert.equal(await failure.locator('.storyboard-sharing-status').count(), 0);
  assert.equal(await failure.getByRole('button', { name: '다시 연결', exact: true }).count(), 0);
  await control.hover(); assert.ok(await control.evaluate(el => el.matches(':hover')));
  await control.focus(); assert.equal(await control.evaluate(el => el === document.activeElement), true);
  await failure.screenshot({ path: path.join(root, 'app/tests/output/sharing/connection-error.png') });
  await failure.unrouteAll();
  await failure.evaluate(() => window.dispatchEvent(new Event('online')));
  await until(async () => await shareButton.isEnabled(), 'sharing automatically recovers');
  assert.equal(await control.locator('.share-alert').count(), 0);
  await until(async () => /^\/s\/[^/]+$/.test(new URL(failure.url()).pathname), 'recovered link in address bar');
  const connectedToken = new URL(failure.url()).pathname.split('/').at(-1);
  await failure.route(url => url.pathname === '/api/storyboards/' + connectedToken, unavailable);
  await until(async () => await shareButton.isDisabled(), 'existing link disabled after disconnection');
  assert.ok((await control.getAttribute('title')).includes('연결 확인 필요'));
  assert.equal(await control.locator('.share-alert').count(), 1);
  await failure.unrouteAll(); await failure.evaluate(() => window.dispatchEvent(new Event('online')));
  await until(async () => await shareButton.isEnabled(), 'existing link recovers');
  checks.push('connection errors appear only on disabled share button hover; initial and existing links recover');

  const out = path.join(root, 'app/tests/output/sharing'); await fs.mkdir(out, { recursive: true });
  await owner.screenshot({ path: path.join(out, 'owner.png') });
  await guest.screenshot({ path: path.join(out, 'read-only.png') });
  await reader.screenshot({ path: path.join(out, 'independent-copy.png') });
  await production.screenshot({ path: path.join(out, 'mobile.png') });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ result: 'PASS', checks, screenshots: out }, null, 2));
  await ownerContext.close(); await guestContext.close(); await readerContext.close();
  await productionContext.close();
  await failureContext.close();
} catch (error) {
  if (browser) for (const context of browser.contexts()) for (const page of context.pages()) {
    const debug = await page.evaluate(async () => {
      const token = window.location.pathname.split('/').at(-1);
      const session = (await import('/src/services/sharing.js')).connectShared(token);
      const { documentChanges } = await import('/src/services/share-patch.js');
      return { url: location.href, state: { status: session.state.status, error: session.state.error, revision: session.state.snapshot?.revision }, pending: session.base && session.desired ? documentChanges(session.base, session.desired) : [] };
    }).catch(() => null);
    if (debug) console.error(JSON.stringify(debug));
  }
  console.error(logs.slice(-2500)); throw error;
} finally {
  await browser?.close(); await vite?.close(); server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve)); await fs.rm(temp, { recursive: true, force: true });
}
