// 사진 속 정확한 제품 — 앱이 직접 고르거나 점검하는 공간 사진 칸(services/picture-items.js · images.js slotImageIssue · layout-context.js).
// 사용자 지시 2026-11-18: 공간 이미지는 정확한 품목이 든 사진 — 같은 세탁기여도 다른 세탁기면 에러, 제품이 없는 공간 사진은 상관없다.
// No network and no model: /api/picture-items answers a small table in the server's form (app/api/poc/picture_items.py).
//   CHROME=<path to Chrome> node app/tests/space-photo-items.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'space-photo-items-test', auth_enabled: false } };
// [shows, items, families] — i: the items · n: no product · u: a product nobody can name
const TABLE = { version: 7, keys: { laundry: ['WF18A9100KV'], sg_wash_b: ['WF18A9100KV'] }, images: {
  'img/t/own.jpg': ['i', ['qm55c'], ['display']], 'img/t/other.jpg': ['i', ['qm65c'], ['display']], 'img/t/unknown.jpg': ['u', [], ['display']],
  'img/t/empty.jpg': ['n', [], []], 'img/t/phones.jpg': ['u', [], ['mobile']], 'img/t/own-and-ac.jpg': ['i', ['qm55c'], ['display', 'hvac']],
  'img/t/dss-washer.jpg': ['i', ['sg_wash_b'], ['appliance']], 'img/t/washer-a.jpg': ['i', ['sg_wash_a'], ['appliance']] } };
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const results = [], errors = [];
let browser, asked = 0;
const pass = name => { results.push(name); console.log('PASS ' + name); };
try {
  await server.listen();
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname === '/api/picture-items') { asked++; return route.fulfill({ json: TABLE }); }
    return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(30000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'));

  // ---- 1. the rule, as the server's (composer.pictures.item_reject) ----
  const rule = await page.evaluate(async () => {
    const m = await import('/src/services/picture-items.js');
    await m.loadPictureItems();
    const s = src => m.spacePhotoIssue(src, ['qm55c']);
    return { own: s('img/t/own.jpg'), other: s('img/t/other.jpg'), unknown: s('img/t/unknown.jpg'), empty: s('img/t/empty.jpg'), phones: s('img/t/phones.jpg'),
      extra: s('img/t/own-and-ac.jpg'), extraOk: m.spacePhotoIssue('img/t/own-and-ac.jpg', ['qm55c', 'ac360']), uploaded: s('data:image/png;base64,AAAA'),
      sameWasher: m.spacePhotoIssue('img/t/dss-washer.jpg', ['laundry']), otherWasher: m.spacePhotoIssue('img/t/washer-a.jpg', ['laundry']),
      leading: s('/img/t/other.jpg'), sceneOther: m.sceneItemIssue('img/t/other.jpg', ['qm55c']), sceneUnknown: m.sceneItemIssue('img/t/unknown.jpg', ['qm55c']) };
  });
  assert.equal(rule.own, ''); assert.equal(rule.empty, '', 'a space photo with no product is fine'); assert.equal(rule.phones, '', "a phone in a guest's hand is not the space's item");
  assert.equal(rule.other, '공간 사진: 이 공간의 제품과 다른 이미지'); assert.equal(rule.unknown, '공간 사진: 어떤 제품인지 확인되지 않은 사진');
  assert.equal(rule.extra, '공간 사진: 이 공간에 없는 제품이 함께 보여요'); assert.equal(rule.extraOk, '');
  assert.equal(rule.uploaded, '', "a person's own upload is not judged by the library table");
  assert.equal(rule.sameWasher, '', 'the same washer in the other catalog (same own model code)'); assert.equal(rule.otherWasher, '공간 사진: 이 공간의 제품과 다른 이미지');
  assert.equal(rule.leading, rule.other, "'/img/…' and 'img/…' are one address");
  assert.equal(rule.sceneOther, '선택하지 않은 제품 사진'); assert.equal(rule.sceneUnknown, '');
  pass('A space frame takes a photo with no product or with its own item — never another item (another washer) or a product nobody can name');

  // ---- 2. the frame's own space: the space the server left on the sheet ----
  const spaces = await page.evaluate(async () => {
    const { slotSpaceItems } = await import('/src/services/picture-items.js');
    const p = { ctx: { products: ['qm55c', 'kiosk', 'ac360'] }, spacePlan: { spaces: [{ id: 's1', products: ['qm55c', 'kiosk'] }, { id: 's2', products: ['ac360'] }, { id: 's3', products: [] }] } };
    const x = { agent: { bind: { space: 's1', products: ['qm55c', 'kiosk'] }, img: { 2: { kind: 'space', space: 's2' } } } };
    return { frame: slotSpaceItems(p, x, 2), sheet: slotSpaceItems(p, x, 0), empty: slotSpaceItems(p, { agent: { bind: { space: 's3' } } }, 0), none: slotSpaceItems(p, {}, 0) };
  });
  assert.deepEqual(spaces.frame, ['ac360']); assert.deepEqual(spaces.sheet, ['qm55c', 'kiosk']);
  assert.deepEqual(spaces.empty, ['qm55c', 'kiosk', 'ac360'], "a space without products: the proposal's"); assert.deepEqual(spaces.none, ['qm55c', 'kiosk', 'ac360']);
  pass("Each space frame is judged with its own space's products (journey · scenario sheets show several spaces)");

  // ---- 3. the app's own picture choice and its review use the rule ----
  const pick = await page.evaluate(async () => {
    const { slotImageIssue, slotCandidates } = await import('/src/services/images.js');
    const ctx = { products: ['qm55c', 'kiosk'], spaceItems: ['qm55c'], solutions: [], cases: [], ind: 'FB', venues: ['카페'] };
    const im = (name, desc) => ({ src: 'img/t/' + name + '.jpg', pid: name, desc, group: 'life', products: [] });
    const pool = [im('own', '카페 카운터 메뉴보드'), im('other', '카페 카운터 메뉴보드'), im('unknown', '카페 카운터 메뉴보드'), im('empty', '카페 카운터 좌석')];
    const slot = { kind: 'space', near: '카페 카운터 메뉴보드' };
    return { issues: pool.map(x => slotImageIssue(x, slot, ctx)), list: slotCandidates(pool, slot, ctx, 8).map(c => c.im.pid),
      chapter: slotImageIssue(pool[1], { kind: 'photo', near: '카페 카운터 메뉴보드' }, ctx) };
  });
  assert.ok(!/^공간 사진/.test(pick.issues[0]), pick.issues[0]); assert.ok(!/^공간 사진/.test(pick.issues[3]), pick.issues[3]);
  assert.equal(pick.issues[1], '공간 사진: 이 공간의 제품과 다른 이미지'); assert.equal(pick.issues[2], '공간 사진: 어떤 제품인지 확인되지 않은 사진');
  assert.ok(!pick.list.includes('other') && !pick.list.includes('unknown'), pick.list.join());
  assert.equal(pick.chapter, '선택하지 않은 제품 사진');
  pass('The candidates the app offers a space frame leave out other items and unnamed products; another photo frame refuses a known unselected item');

  // ---- 4. the sheet review flags a space photo of another item (and export stops on it, like other different-product pictures) ----
  const review = await page.evaluate(async () => {
    const { registerLayout } = await import('/src/services/catalog.js');
    const { inspectLayoutContext } = await import('/src/services/layout-context.js');
    registerLayout({ f: 'L_TEST_SPACE_ITEMS', c: 'PH', name: '공간 사진 검증', p: 'space', req: [], prods: [], sols: [], when: '검증' },
      '<div style="width:1280px;height:720px;position:relative;background:#fff"><div data-tb="0" style="position:absolute;left:64px;top:50px;font-size:32px">카운터</div>'
      + '<div data-img="0" data-kind="space" style="position:absolute;left:64px;top:160px;width:500px;height:400px"><img src="img/ph/fb-counter-menu.jpg" alt=""></div></div>');
    const p = { id: 'pt', customer: 'A 커피', ind: 'FB', parts: [], ctx: { products: ['qm55c'], solutions: [], cases: [] }, spacePlan: { spaces: [{ id: 's1', name: '카운터', products: ['qm55c'] }] } };
    const sheet = src => ({ uid: 'u1', f: 'L_TEST_SPACE_ITEMS', status: 'done', ov: { t: {}, img: { 0: { src } } }, agent: { bind: { space: 's1' }, img: { 0: { kind: 'space', space: 's1' } } } });
    return { other: inspectLayoutContext(p, sheet('img/t/other.jpg')), own: inspectLayoutContext(p, sheet('img/t/own.jpg')), empty: inspectLayoutContext(p, sheet('img/t/empty.jpg')) };
  });
  assert.ok(review.other.includes('공간 사진: 이 공간의 제품과 다른 이미지'), review.other.join(' | '));
  assert.ok(review.other.some(issue => /선택하지 않은 제품|다른 이미지/.test(issue)), 'the export gate (viewer.jsx) stops on it');
  assert.ok(!review.own.some(issue => /^공간 사진/.test(issue)), review.own.join(' | ')); assert.ok(!review.empty.some(issue => /^공간 사진/.test(issue)), review.empty.join(' | '));
  pass('The sheet review flags a space photo of another item; its own item or no product passes');
  assert.equal(asked, 1, 'the table is asked once per page');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
console.log(`\n${results.length} passed`);
