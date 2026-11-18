// End-to-end: browser-only records move to the account, another browser sees them, server-side changes reach an open
// cache, and 3D 조감도 cards use server-rendered previews. Runs against an app you started (isolated runtime advised):
//   WINMATE_TEST_URL=http://127.0.0.1:8796 WINMATE_TEST_PASSWORD=… [CHROME=/path/to/chrome] node app/tests/account-data-e2e.mjs
// Start that server with WINMATE_ENV_FILES=none (no model key) so no background feature makes a real LLM request.
import fs from 'node:fs';
import path from 'node:path';
import { launch, origin, output, assert, showSidebar } from './helpers.mjs';

const password = process.env.WINMATE_TEST_PASSWORD;
if (!password) { console.log('SKIP account-data-e2e: set WINMATE_TEST_PASSWORD'); process.exit(0); }
const out = path.join(output, 'account-data-e2e'); fs.mkdirSync(out, { recursive: true });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const stamp = Date.now().toString(36);
const legacyId = 'pe2e' + stamp, title = '이전 브라우저 제안서 ' + stamp;
const checks = [], timings = {};
const pass = name => { checks.push(name); console.log('PASS ' + name); };
const browser = await launch();

async function session() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const login = await context.request.post(origin + '/api/auth/login', { data: { username: 'admin', password } });
  assert(login.ok(), 'login failed ' + login.status());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  return { context, page, errors };
}
const api = (context, url, options) => context.request.fetch(origin + url, options).then(r => r.json());
const ready = page => page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'), null, { timeout: 60000 });
async function eventually(fn, message, timeout = 20000) {
  const end = Date.now() + timeout; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (error) { last = error; } await new Promise(r => setTimeout(r, 300)); }
  throw new Error(message + ' (' + (last?.message || last) + ')');
}

try {
  // 1. A browser that only has local history (the pre-migration state).
  const first = await session();
  await first.page.goto(origin + '/tokens.css');
  await first.page.evaluate(async ({ legacyId, title, PNG }) => {
    localStorage.setItem('winmate.v2.proposals', JSON.stringify([{ id: legacyId, title, customer: '이전 고객', ind: null, createdAt: Date.now(), updatedAt: Date.now(), stage: 'req', reqTab: 'free',
      req: { free: [], form: { project: title, customer: '', target: '', keymen: [], note: '' }, files: [] }, ctx: { products: [], solutions: [], cases: [] }, parts: [], exportedAt: null, cover: 'u:uimg' + legacyId }]));
    localStorage.setItem('winmate.v2.favs', JSON.stringify([{ id: 'vfav' + legacyId, f: 'L_AIS_02', ov: null, filled: false, name: '찜한 레이아웃', from: 'e2e', at: Date.now() }]));
    localStorage.setItem('winmate.v2.simPersonas', JSON.stringify([{ key: 'cp' + legacyId, custom: true, level: 2, gender: 'F', name: '이전 고객 프로필', age: 41, role: '구매팀장', career: '', traits: [], quote: '', style: '', face: '', look: { hair: 1 }, createdAt: 1, updatedAt: 1 }]));
    await new Promise((resolve, reject) => { const r = indexedDB.open('winmate-v2', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onerror = () => reject(r.error);
      r.onsuccess = () => { const tx = r.result.transaction('img', 'readwrite'); tx.objectStore('img').put(PNG, 'uimg' + legacyId); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }; });
  }, { legacyId, title, PNG });
  let started = Date.now();
  await first.page.goto(origin + '/'); await ready(first.page);
  timings.firstLoadMs = Date.now() - started;
  await eventually(async () => (await api(first.context, '/api/account-data/proposals')).items.some(i => i.id === legacyId), 'legacy proposal not uploaded');
  const stored = (await api(first.context, '/api/account-data/proposals/fetch', { method: 'POST', data: { ids: [legacyId] } })).items[0];
  assert(stored.data.title === title && stored.data.customer === '이전 고객' && stored.data.createdAt > 0, 'proposal content changed in migration');
  pass('browser-only proposal moved to the account unchanged');
  await eventually(async () => (await api(first.context, '/api/account-data/favorites')).items.some(i => i.id === 'vfav' + legacyId && !i.deleted), 'favorite not uploaded');
  await eventually(async () => (await api(first.context, '/api/account-data/personas')).items.some(i => i.id === 'cp' + legacyId), 'persona not uploaded');
  pass('favorites and customer personas moved');
  await eventually(async () => (await first.context.request.get(origin + '/api/account-data/blobs/uimg' + legacyId)).ok(), 'uploaded image not moved');
  pass('IndexedDB upload image moved to account files');

  // 2. A second browser with an empty cache sees the same history on its first screen.
  const second = await session();
  started = Date.now();
  await second.page.goto(origin + '/'); await ready(second.page);
  timings.secondBrowserFirstLoadMs = Date.now() - started;
  const cached = await second.page.evaluate(id => JSON.parse(localStorage.getItem('winmate.v2.proposals') || '[]').find(p => p.id === id), legacyId);
  assert(cached && cached.title === title, 'second browser did not receive the proposal before rendering');
  assert(await second.page.evaluate(id => JSON.parse(localStorage.getItem('winmate.v2.favs') || '[]').some(f => f.id === id), 'vfav' + legacyId), 'favorite missing in second browser');
  pass('second browser renders the account history from its first load');

  // 3. A change made elsewhere reaches a browser whose cache is already primed, and the stale in-memory copy never
  //    overwrites it. (History proposals are also shared Storyboards, whose own document wins when opened — so this
  //    uses a customer persona, which only the account stores.)
  const personaId = 'cp' + legacyId;
  const current = (await api(first.context, '/api/account-data/personas')).items.find(i => i.id === personaId);
  const original = (await api(first.context, '/api/account-data/personas/fetch', { method: 'POST', data: { ids: [personaId] } })).items[0].data;
  const renamed = { ...original, name: '다른 기기 수정', updatedAt: Date.now() + 1000 };
  const write = await api(first.context, '/api/account-data/personas', { method: 'POST', data: { items: [{ id: personaId, data: renamed, base_revision: current.revision, updated_at: renamed.updatedAt }] } });
  assert(write.applied.length === 1, 'server edit failed');
  started = Date.now();
  await first.page.reload(); await ready(first.page);
  timings.primedReloadMs = Date.now() - started;
  await eventually(() => first.page.evaluate(id => JSON.parse(localStorage.getItem('winmate.v2.simPersonas') || '[]').some(p => p.key === id && p.name === '다른 기기 수정'), personaId), 'remote edit not applied');
  await first.page.waitForTimeout(3000);   // longer than the push debounce: a stale memory copy would be pushed by now
  const after = (await api(first.context, '/api/account-data/personas')).items.find(i => i.id === personaId);
  assert(after.revision === write.applied[0].revision, 'the newer server copy was overwritten by a stale browser copy');
  pass('edit from another device appears in an already open cache');
  const del = await api(first.context, '/api/account-data/favorites', { method: 'POST', data: { deletes: [{ id: 'vfav' + legacyId, base_revision: 1 }] } });
  assert(del.applied.length === 1, 'server delete failed');
  await first.page.reload(); await ready(first.page);
  await eventually(() => first.page.evaluate(id => !JSON.parse(localStorage.getItem('winmate.v2.favs') || '[]').some(f => f.id === id), 'vfav' + legacyId), 'remote deletion not applied');
  await first.page.waitForTimeout(2500);
  assert((await api(first.context, '/api/account-data/favorites')).items.find(i => i.id === 'vfav' + legacyId).deleted, 'deleted favorite was resurrected');
  pass('deletion elsewhere removes the cached record and is not resurrected');

  // 4. 건물 조감도: a building that only existed in this browser's IndexedDB moves to the account.
  const buildingId = 'bld-e2e-' + stamp, buildingTitle = '이전 브라우저 건물 ' + stamp;
  await first.page.evaluate(async ({ buildingId, buildingTitle }) => {
    await new Promise((resolve, reject) => { const r = indexedDB.open('winmate-building', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('b', { keyPath: 'id' }); d.createObjectStore('thumb'); d.createObjectStore('meta'); };
      r.onerror = () => reject(r.error);
      r.onsuccess = () => { const tx = r.result.transaction('b', 'readwrite'); tx.objectStore('b').put({ id: buildingId, title: buildingTitle, industries: ['OF'],
        floors: [{ key: buildingId + '-f0', tpl: 'of-full-standard', fv: 0 }], view: { mode: 'exterior' }, camera: { azimuth: 40, elevation: 22, zoom: 1 }, createdAt: Date.now(), updatedAt: Date.now() });
        tx.oncomplete = () => { r.result.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; });
  }, { buildingId, buildingTitle });
  const openBuildings = async page => {
    await page.goto(origin + '/'); await ready(page); await showSidebar(page);
    // 건물은 사이드바 「조감도」의 통합 목록에 공간 조감도와 함께 나온다
    await page.locator('.sidebar .sb-spatial').click(); await page.mouse.move(page.viewportSize().width - 3, 2);
    await page.locator('.be-home .sp-history[aria-busy=false] .sp-map-card').first().waitFor({ timeout: 60000 });
  };
  const buildingCard = page => page.locator('.be-building-card', { hasText: buildingTitle });
  await openBuildings(first.page);
  await eventually(async () => (await api(first.context, '/api/account-data/buildings')).items.some(i => i.id === buildingId && !i.deleted), 'building not moved to the account');
  pass('browser-only building moved to the account');
  await openBuildings(second.page);
  await eventually(async () => (await buildingCard(second.page).count()) === 1, 'second browser does not list the building');
  pass('second browser lists the account building');
  await buildingCard(second.page).locator('.sp-history-delete').click();
  await second.page.getByRole('button', { name: '삭제', exact: true }).last().click();
  await eventually(async () => (await api(second.context, '/api/account-data/buildings')).items.find(i => i.id === buildingId)?.deleted, 'building deletion not sent');
  await openBuildings(first.page);
  await eventually(async () => (await buildingCard(first.page).count()) === 0, 'deleted building still listed in the first browser');
  pass('building deletion reaches the other browser');

  // 5. 3D 조감도 template cards come from the server renderer.
  const { page } = second;
  await page.goto(origin + '/spatial'); await page.locator('.sp-home-launches').waitFor({ timeout: 60000 });
  // 업종 템플릿은 시작 팝업에서 업종을 고른 뒤 「업종 템플릿에서 시작」 드롭다운에 있다 — 항목마다 3D 조감도 그림이 바로 뜬다
  await page.getByRole('button', { name: /조감도 스튜디오 시작/ }).click();
  const maps = page.getByRole('dialog', { name: '조감도 스튜디오 시작', exact: true }); await maps.waitFor();
  await maps.getByRole('group', { name: '업종 선택' }).getByRole('button').first().click();
  started = Date.now();
  await maps.getByRole('button', { name: /업종 템플릿에서 시작/ }).click();
  const card = page.locator('.be-template-menu .be-template-item').first(); await card.waitFor();
  const src = await eventually(() => card.locator('.be-template-thumb[data-view="3d"] img').evaluateAll(list => list[0] && list[0].complete && list[0].naturalWidth > 0 && list[0].getAttribute('src').includes('/preview.webp') ? list[0].getAttribute('src') : null), '3D preview did not come from the server', 60000);
  timings.templatePreviewColdMs = Date.now() - started;
  assert(/^\/api\/spatial\/templates\/[^/]+\/preview\.webp\?rev=[a-f0-9]{8}$/.test(src), 'unexpected preview url ' + src);
  const response = await second.context.request.get(origin + src);
  assert(response.headers()['content-type'] === 'image/webp' && response.headers()['cache-control'].includes('immutable'), 'preview is not an immutable webp');
  started = Date.now(); await second.context.request.get(origin + src); timings.templatePreviewWarmMs = Date.now() - started;
  const status = await api(second.context, '/api/spatial/previews/status');
  assert(status.previews.rendered >= 1 && status.previews.unavailable === 0, 'renderer did not render');
  pass('3D template preview is server-rendered, cached and immutable');
  assert(!await page.evaluate(() => [...document.querySelectorAll('.be-template-item img')].some(img => img.src.startsWith('data:image/png'))), 'browser still rendered a PNG');
  pass('no template card was rendered with WebGL in the browser');

  await page.screenshot({ path: path.join(out, 'spatial-templates.png') });
  assert(first.errors.length === 0 && second.errors.length === 0, 'page errors: ' + [...first.errors, ...second.errors].join(' | '));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ok: true, checks, timings }, null, 2));
  console.log(JSON.stringify(timings));
} catch (error) {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ok: false, checks, timings, error: String(error?.stack || error) }, null, 2));
  throw error;
} finally { await browser.close(); }
