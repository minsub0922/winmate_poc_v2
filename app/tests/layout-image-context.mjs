// Picture slots are filled for the words next to them (services/layout-context.js · services/images.js).
// No network and no live model: /api/llm is answered by a scripted reply that also records what the model was shown.
//   node app/tests/layout-image-context.mjs        (CHROME=<path> to use a system browser)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'image-context-test', auth_enabled: false } };
const out = path.join(root, 'app/tests/output/layout-image-context'); fs.mkdirSync(out, { recursive: true });
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const results = [], errors = [], calls = [];
let browser, page, script = null;
const pass = name => { results.push(name); console.log('PASS ' + name); };
try {
  await server.listen();
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname.startsWith('/api/product-packs/')) return route.fulfill({ path: path.join(root, 'reference/live/img/prod/d00.json') });
    if (url.pathname === '/api/llm') {
      const body = route.request().postDataJSON();
      const input = JSON.parse(body.prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]); calls.push(input);
      return route.fulfill({ json: { mode: 'real', data: script(input) } });
    }
    return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  await context.route('**/img/**', route => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.join(root, rel.startsWith('img/lib/') ? rel : 'app/data/static/' + rel);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
  });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(30000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'));

  // ---- 1. a slot's neighbourhood comes from the drawn page ----
  const geometry = await page.evaluate(async () => {
    const { registerLayout, loadLayoutHtml } = await import('/src/services/catalog.js'); await loadLayoutHtml();
    const { readSlotContexts } = await import('/src/services/layout-context.js');
    const meta = (f, name) => ({ f, c: 'PH', name, p: 'products', req: [], prods: [], sols: [], when: '검증' });
    const card = (n, img, a, b) => `<div style="display:flex;flex-direction:column;gap:8px;min-width:0"><div data-img="${img}" data-kind="space" style="height:200px"><img src="img/ph/fb-counter-menu.jpg" alt="예시 ${n}" style="width:100%;height:100%;object-fit:cover"></div><div data-tb="${a}" style="font-size:20px">카드 ${n} 이름</div><div data-tb="${b}" style="font-size:16px">카드 ${n} 설명</div></div>`;
    registerLayout(meta('L_TEST_SLOT_CARDS', '카드 검증'), `<div style="width:1280px;height:720px;position:relative;background:#fff;font-family:sans-serif"><div data-tb="0" data-type-role="title" style="position:absolute;left:64px;top:50px;font-size:32px">세 공간을 한 장에</div><div style="position:absolute;left:64px;top:160px;width:1152px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px">${card(1, 0, 1, 2)}${card(2, 1, 3, 4)}${card(3, 2, 5, 6)}</div></div>`);
    const photo = (i, x) => `<div data-img="${i}" data-kind="space" style="position:absolute;left:${x}px;top:210px;width:350px;height:200px"><img src="img/ph/fb-counter-menu.jpg" alt="" style="width:100%;height:100%"></div>`;
    const caption = (i, x, text) => `<div data-tb="${i}" style="position:absolute;left:${x}px;top:424px;width:350px;font-size:18px">${text}</div>`;
    registerLayout(meta('L_TEST_SLOT_FLAT', '평면 검증'), `<div style="width:1280px;height:720px;position:relative;background:#fff;font-family:sans-serif"><div data-tb="0" style="position:absolute;left:64px;top:50px;font-size:32px">매장의 하루</div><div data-tb="1" style="position:absolute;left:64px;top:170px;width:1152px;font-size:16px">오픈부터 마감까지 세 장면</div>${photo(0, 64)}${photo(1, 465)}${photo(2, 866)}${caption(2, 64, '오픈 · 카운터 메뉴보드')}${caption(3, 465, '점심 · 키오스크 주문')}${caption(4, 866, '마감 · 냉난방 자동 종료')}</div>`);
    const cards = readSlotContexts('L_TEST_SLOT_CARDS', { t: { 3: '객실 TV 웰컴 화면' }, img: {} }), flat = readSlotContexts('L_TEST_SLOT_FLAT');
    return { cards, flat, leftover: document.querySelectorAll('[aria-hidden="true"][style*="-30000px"]').length };
  });
  assert.equal(geometry.cards.title, '세 공간을 한 장에');
  assert.deepEqual(geometry.cards.slots.map(s => s.near), [['카드 1 이름', '카드 1 설명'], ['객실 TV 웰컴 화면', '카드 2 설명'], ['카드 3 이름', '카드 3 설명']]);
  assert.deepEqual(geometry.flat.slots.map(s => s.near), [['오픈 · 카운터 메뉴보드'], ['점심 · 키오스크 주문'], ['마감 · 냉난방 자동 종료']]);
  assert.equal(geometry.leftover, 0);
  pass('Each picture slot reads its own card or the caption closest to it — current text, not the sheet title or a heading that spans every picture');

  // ---- 2. what the words ask for ----
  const targets = await page.evaluate(async () => {
    const { slotTarget, venuesIn, familiesIn, linkedSolutionsIn, linkedProductsIn } = await import('/src/services/images.js');
    const ctx = { products: ['qm55c', 'oh55a', 'kiosk', 'ac360'], solutions: ['magicinfo', 'stpro', 'smartthings'], cases: [], ind: 'FB', venues: ['카페'] };
    return { model: slotTarget({ kind: 'cut', fix: 'product', near: '키오스크 · KM24C · 24" 세로형 터치' }, ctx).products,
      outdoor: linkedProductsIn('옥외형 사이니지 OH55A-S 55"', ctx.products), label: slotTarget({ kind: 'cut', fix: 'product', near: '키오스크' }, ctx).implied,
      wide: slotTarget({ kind: 'cut', fix: 'product', near: '세로형 터치 · 결제 연동', wide: '주문은 화면으로 · KM24C · 세로형 터치 · 결제 연동' }, ctx).products,
      solutions: [linkedSolutionsIn('SmartThings Pro로 냉난방을 예약합니다', ctx.solutions), linkedSolutionsIn('매직인포로 메뉴를 원격 배포', ctx.solutions), linkedSolutionsIn('스마트 사이니지', ctx.solutions)],
      families: [familiesIn('무풍 에어컨으로 조용한 객실'), familiesIn('메뉴보드 가격을 본사에서')],
      venues: [venuesIn('대형마트·SSM AI 마트 제안서'), venuesIn('스마트 사이니지와 스마트폰'), venuesIn('스터디 카페 천장의 360 카세트'), venuesIn('백화점 1층 명품관')],
      scene: slotTarget({ kind: 'space', near: '2F 레스토랑 · 조식 혼잡도 안내' }, { ...ctx, ind: 'HT', venues: ['호텔'] }).venues };
  });
  assert.deepEqual(targets.model, ['kiosk']); assert.deepEqual(targets.outdoor, ['oh55a']); assert.deepEqual(targets.label, ['kiosk']); assert.deepEqual(targets.wide, ['kiosk']);
  assert.deepEqual(targets.solutions, [['stpro'], ['magicinfo'], []]);
  assert.deepEqual(targets.families, [['공조 · 에어컨'], ['디스플레이']]);
  assert.deepEqual(targets.venues, [['마트'], [], ['무인 매장'], ['백화점']]);
  assert.deepEqual(targets.scene, ['호텔', '레스토랑']);
  pass('The words next to a slot name its product (model, product label, or the one product of the sheet), solution, product family and kind of place');

  // ---- 3. candidates already satisfy the slot ----
  const ranked = await page.evaluate(async () => {
    const { P, S, C } = await import('/src/services/catalog.js');
    const { loadImageLibrary, imagePool } = await import('/src/services/image-library.js');
    const { slotCandidates, slotImageIssue, showsUnlinkedProduct } = await import('/src/services/images.js');
    const library = await loadImageLibrary();
    const ctx = { products: ['qm55c', 'oh55a', 'kiosk', 'ac360'], solutions: ['magicinfo', 'stpro'], cases: ['3727', '2979'], ind: 'FB', venues: ['카페'] };
    const pool = imagePool(ctx, library, { industry: 'FB' });
    const list = (slot, c = ctx, n = 8) => slotCandidates(pool, slot, c, n).map(v => v.im);
    const brief = im => ({ src: im.src, desc: im.desc, model: im.model || '', group: im.group, products: im.products || [], solutions: im.solutions || [], cases: im.cases || [] });
    const kiosk = list({ kind: 'cut', fix: 'product', near: '키오스크 · KM24C' }), outdoor = list({ kind: 'cut', fix: 'product', near: 'OH55A-S 옥외형 사이니지' });
    const menu = list({ kind: 'space', near: '메뉴보드 가격을 본사에서 한 번에 바꿉니다 · QM55C' }), cooling = list({ kind: 'space', near: '360 카세트로 매장 전체를 고르게 냉방' });
    const everything = [kiosk, outdoor, menu, cooling].flat();
    const caseName = C['3727'].cust, cases = list({ kind: 'space', fix: 'case', near: caseName + ' 도입 사례' });
    const solution = list({ kind: 'ui', fix: 'solution', near: 'MagicINFO 원격 배포' });
    const mart = { products: ['qm55c'], solutions: ['magicinfo'], cases: [], ind: 'RT', venues: ['마트'] };
    const martPool = imagePool(mart, library, { industry: 'RT' }), martList = slotCandidates(martPool, { kind: 'space', near: '매장 입구 프로모션 사이니지' }, mart, 12).map(v => v.im);
    const department = { src: 'test/department.jpg', desc: '백화점 1층 명품관 전경', group: 'case', products: [] }, hotel = { src: 'test/hotel.jpg', desc: '객실 창가의 침대와 소파', group: 'case', products: [] };
    const cassette = pool.find(im => (im.products || []).includes('ac360') && im.group !== 'cut');
    const first = menu[0], reused = slotCandidates(pool, { kind: 'space', near: '메뉴보드 가격을 본사에서 한 번에 바꿉니다 · QM55C' }, { ...ctx, used: new Set([first.src]) }, 8).map(v => v.im);
    return { kiosk: kiosk.map(brief), outdoor: outdoor.map(brief), menu: menu.map(brief), cooling: cooling.map(brief), cases: cases.map(brief), solution: solution.map(brief), solutionWith: S.magicinfo.with,
      unlinked: everything.filter(im => showsUnlinkedProduct(im, ctx.products, pool)).length, martList: martList.map(brief),
      issues: { department: slotImageIssue(department, { kind: 'space', near: '매장 입구' }, mart), hotel: slotImageIssue(hotel, { kind: 'space', near: '매장 입구' }, mart),
        neutral: slotImageIssue({ src: 'test/store.jpg', desc: '조명 밝은 매장 내부와 진열 테이블', group: 'case', products: [] }, { kind: 'space', near: '매장 입구' }, mart),
        family: slotImageIssue(cassette, { kind: 'space', near: '메뉴보드 가격을 본사에서 바꿉니다' }, ctx), otherProduct: slotImageIssue(cassette, { kind: 'space', near: 'QM55C 카운터 메뉴보드' }, ctx),
        cut: slotImageIssue(pool.find(im => (im.products || []).includes('oh55a') && im.group === 'cut'), { kind: 'cut', fix: 'product', near: 'KM24C 키오스크' }, ctx),
        ok: slotImageIssue(pool.find(im => (im.products || []).includes('kiosk') && im.group === 'cut'), { kind: 'cut', fix: 'product', near: 'KM24C 키오스크' }, ctx) },
      first: first.src, reusedFirst: reused[0]?.src, reusedHas: reused.some(im => im.src === first.src) };
  });
  assert.ok(ranked.kiosk.length > 0 && ranked.kiosk.every(im => im.products.includes('kiosk') && im.group === 'cut'), JSON.stringify(ranked.kiosk));
  assert.ok(ranked.outdoor.length > 0 && ranked.outdoor.every(im => im.products.includes('oh55a')));
  assert.ok(ranked.menu.length > 0 && ranked.menu.every(im => !im.products.length || im.products.includes('qm55c')), JSON.stringify(ranked.menu));
  assert.ok(ranked.menu.every(im => !/카세트|에어컨/.test(im.desc)), 'no air conditioner beside a signage caption');
  assert.ok(ranked.cooling.length > 0 && ranked.cooling.slice(0, 2).every(im => /카세트|에어컨/.test(im.desc)), JSON.stringify(ranked.cooling));
  assert.ok(ranked.cooling.every(im => !/사이니지|메뉴보드|키오스크/.test(im.desc) && im.group !== 'ui'), 'no signage or screen capture beside an air-conditioning caption');
  assert.ok(ranked.cases.length > 0 && ranked.cases.every(im => im.cases.includes('3727')));
  assert.ok(ranked.solution.length > 0 && ranked.solution.every(im => im.solutions.includes('magicinfo') || /magicinfo|매직인포/i.test(im.desc + ' ' + im.model) || im.products.some(id => ranked.solutionWith.includes(id))), JSON.stringify(ranked.solution));
  assert.equal(ranked.unlinked, 0);
  assert.ok(ranked.martList.every(im => !/백화점|명품관|호텔|객실|병원|강의실|카페/.test(im.desc)), JSON.stringify(ranked.martList.map(im => im.desc)));
  assert.equal(ranked.issues.department, '고객 업종 · 업태와 다른 공간 사진'); assert.equal(ranked.issues.hotel, '고객 업종 · 업태와 다른 공간 사진'); assert.equal(ranked.issues.neutral, '');
  assert.equal(ranked.issues.family, '옆 글과 다른 제품군 사진'); assert.equal(ranked.issues.otherProduct, '옆 글의 제품과 다른 제품 사진');
  assert.equal(ranked.issues.cut, '옆 글의 제품과 다른 사진'); assert.equal(ranked.issues.ok, '');
  assert.notEqual(ranked.reusedFirst, ranked.first);
  pass('Candidates are filtered before the model sees them: the named product, solution and case only; no unlinked product, other product family or other industry venue; pictures already in the deck rank lower');

  // ---- 4. texts first, pictures second, then a check ----
  const run = async (setup) => page.evaluate(async (setup) => {
    const { registerLayout } = await import('/src/services/catalog.js');
    const { personalizeLayout } = await import('/src/services/layout-context.js');
    const { loadImageLibrary, imagePool } = await import('/src/services/image-library.js');
    const f = 'L_TEST_SLOT_FILL';
    const card = (name, img) => `<div style="display:flex;flex-direction:column;gap:8px;min-width:0"><div style="position:relative;height:260px"><div data-img="${img + 1}" data-kind="insitu" style="height:260px"><img src="img/ph/fb-counter-menu.jpg" alt="카운터 메뉴보드 정면 (말리커피 강남점)" style="width:100%;height:100%;object-fit:cover"></div><div data-img="${img}" data-kind="cut" data-fix="product" data-pid="oh55a.front" style="position:absolute;right:8px;bottom:8px;width:120px;height:90px"><img src="img/bs/p-oh55a-s.png" alt="OH55A-S 옥외 화면" style="width:100%;height:100%;object-fit:contain"></div></div><div data-tb="${name}" data-fix="product" style="font-size:22px">OH55A-S</div><div data-tb="${name + 1}" style="font-size:16px">옥외 고휘도 화면</div></div>`;
    registerLayout({ f, c: 'PH', name: '제품 2 · 컷 + 설치 장면', p: 'products', req: [], prods: [], sols: [], when: '검증' },
      `<div style="width:1280px;height:720px;position:relative;background:#fff;font-family:sans-serif"><div data-tb="0" data-type-role="title" style="position:absolute;left:64px;top:50px;font-size:32px">예시 고객의 제품</div><div style="position:absolute;left:64px;top:150px;width:1152px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">${card(1, 0)}${card(3, 2)}</div></div>`);
    const pool = imagePool({ products: ['qm55c', 'kiosk'] }, await loadImageLibrary());
    const scene = pool.find(im => (im.products || []).includes('qm55c') && im.group !== 'cut' && im.src !== 'img/ph/fb-counter-menu.jpg');
    const x = { uid: 'slot-fill', f, status: 'empty', ov: { t: {}, img: setup.manual ? { 1: { src: scene.src, name: scene.desc, products: ['qm55c'], selectedBy: 'user' } } : {} }, ev: setup.manual ? { i1: { by: 'user', src: [] } } : {} };
    const other = { uid: 'other-sheet', f, status: 'done', ov: { t: {}, img: setup.deck ? { 1: { src: setup.deck, name: '다른 장의 사진' } } : {} } };
    const part = { id: 'slot-part', type: 'products', name: '제품 구성', items: ['메뉴보드', '키오스크'], layouts: [x, other] };
    const p = { id: 'not-in-store', title: '카페 메뉴보드 제안', customer: '검증 커피', ind: 'FB', req: { free: [{ t: '카페 매장의 메뉴보드와 키오스크를 제안합니다.' }], form: { keymen: [] }, files: [] }, ctx: { products: ['qm55c', 'kiosk'], solutions: [], cases: [] }, parts: [part] };
    const result = await personalizeLayout(p, part, x);
    return { ov: result.ov, ev: result.ev, missing: result.missing, manual: x.ov.img[1] || null };
  }, setup);
  const texts = { 0: '제품 구성', 1: 'QM55C', 2: '카운터 메뉴보드', 3: 'KM24C', 4: '주문 키오스크' };
  const reply = images => input => ({ blocks: input.blocks.map(b => ({ i: b.i, action: texts[b.i] ? 'replace' : 'keep', s: texts[b.i] || b.current, src: [], reason: 'test-only text' })), images: images(input), replacements: [], missing: [] });
  calls.length = 0;
  script = reply(input => input.images.map(im => im.i === 2 ? { i: 2, action: 'keep', n: 0, reason: 'test-only wrong keep' } : im.i === 3 ? { i: 3, action: 'clear', n: -1, reason: 'test-only no scene' } : { i: im.i, action: 'replace', n: 0, reason: 'test-only first candidate' }));
  let filled = await run({});
  const [textCall, imageCall] = calls;
  assert.equal(calls.length, 2); assert.ok(textCall.blocks.length > 0); assert.equal(textCall.images.length, 0);
  assert.equal(imageCall.blocks.length, 0); assert.deepEqual(imageCall.images.map(im => im.i).sort(), [0, 1, 2, 3]);
  const shown = Object.fromEntries(imageCall.images.map(im => [im.i, im]));
  assert.ok(shown[0].near.includes('QM55C') && shown[1].near.includes('QM55C') && !shown[0].near.includes('KM24C') && !shown[0].near.includes('OH55A'), shown[0].near);
  assert.ok(shown[2].near.includes('KM24C') && shown[3].near.includes('주문 키오스크') && !shown[2].near.includes('QM55C'), shown[2].near);
  assert.ok(shown[0].candidates.length > 0 && shown[0].candidates.every(c => c.products.includes('qm55c')));
  assert.ok(shown[2].candidates.length > 0 && shown[2].candidates.every(c => c.products.includes('kiosk')));
  assert.ok(shown[1].candidates.every(c => !c.products.length || c.products.includes('qm55c')));
  assert.equal(shown[0].current.keep, false); assert.equal(shown[2].current.keep, false);
  assert.ok(imageCall.context.includes('(QM55C,') && !JSON.stringify(imageCall).includes('"sources"'));
  pass('Pictures are chosen in a second call, each slot shown with the text just written for its own card and candidates of that card’s product only');
  assert.ok(filled.ov.img[0].products.includes('qm55c'));
  assert.ok(filled.ov.img[2].products.includes('kiosk'), JSON.stringify(filled.ov.img[2])); assert.equal(filled.ev.i2.kept, false); assert.match(filled.ev.i2.reason, /현재 사진/);
  assert.equal(filled.ov.img[3].hidden, true); assert.ok(filled.missing.some(m => /^이미지 4: .*주문 키오스크/.test(m)), JSON.stringify(filled.missing));
  assert.ok(!filled.missing.some(m => m.includes('현재 선택한 제품과 다른 이미지')), JSON.stringify(filled.missing));
  pass('A kept picture that contradicts its neighbourhood is re-picked for the assigned product; an unresolved slot is cleared with a note that names it');

  calls.length = 0;
  script = reply(input => input.images.map(im => ({ i: im.i, action: 'replace', n: 0, reason: 'test-only first candidate' })));
  filled = await run({ manual: true });
  assert.ok(!calls[1].images.some(im => im.i === 1)); assert.deepEqual(filled.ov.img[1], filled.manual); assert.equal(filled.ov.img[1].selectedBy, 'user'); assert.equal(filled.ev.i1.by, 'user');
  pass('An explicit picture choice is neither sent to the model nor changed');

  // the same scene for both cards: the second is re-picked or cleared; a picture another sheet of the proposal shows is not offered at all
  calls.length = 0;
  let sharedScene = '';
  script = reply(input => input.images.map(im => {
    if (im.i === 1 || im.i === 3) { const n = Math.max(0, im.candidates.findIndex(c => c.description === sharedScene)); sharedScene = sharedScene || im.candidates[n]?.description || ''; return { i: im.i, action: 'replace', n, reason: 'test-only same scene' }; }
    return { i: im.i, action: 'replace', n: 0, reason: 'test-only first candidate' };
  }));
  script = (inner => input => inner({ ...input, images: input.images.map(im => im.i === 3 ? { ...im, candidates: im.candidates } : im) }))(script);
  filled = await run({});
  const scenes = [filled.ov.img[1], filled.ov.img[3]];
  assert.ok(scenes[0].src && (scenes[1].hidden || scenes[1].src !== scenes[0].src), JSON.stringify(scenes));
  const usedSrc = scenes[0].src;
  calls.length = 0; script = reply(input => input.images.map(im => ({ i: im.i, action: 'replace', n: 0, reason: 'test-only first candidate' })));
  const again = await run({ deck: usedSrc });
  const offered = calls[1].images.flatMap(im => im.candidates);
  assert.ok(!offered.some(c => c.description === scenes[0].name), 'a picture already on another sheet is not offered to the model');
  assert.ok(Object.values(again.ov.img).every(v => !v || v.src !== usedSrc), 'nor shown again: ' + JSON.stringify(again.ov.img));
  pass('One picture is not used twice on a sheet, and a picture already on another sheet of the proposal is neither offered nor used');

  // the same photo under two addresses (pjevige1, 2026-11-16: 민원실 · 대합실 sheets — a case media photo and its re-crop in a scenario fill pack)
  const identity = await page.evaluate(async () => {
    const { pictureId, samePicture } = await import('/src/services/picture-identity.js');
    const { deckImageUse, boardPictures } = await import('/src/services/layout-context.js');
    const a = 'img/media/g1.json#274', b = 'img/fill/r9-bs11.json#0';
    const sheet = (uid, src) => ({ uid, f: 'L_VS_SPACE', status: 'done', ov: { t: {}, img: { 1: { src, name: uid } } } });
    const p = { parts: [{ id: 'kept', layouts: [sheet('one', a)] }, { id: 'rebuilt', layouts: [sheet('two', 'img/media/g1.json#269')] }] };
    return { same: samePicture(a, b), slash: pictureId('/' + b) === pictureId(a), other: samePicture(a, 'img/media/g1.json#269'),
      used: deckImageUse(p, p.parts[1].layouts[0]).has(pictureId(b)), board: boardPictures(p, ['rebuilt']) };
  });
  assert.ok(identity.same && identity.slash, 'the two addresses are one picture');
  assert.equal(identity.other, false);
  assert.ok(identity.used, 'a sheet showing the re-crop counts the case photo as used');
  assert.deepEqual(identity.board, [identity.board[0]]); assert.ok(identity.board[0] && !identity.board.includes('img/media/g1.json#269'), JSON.stringify(identity.board));
  pass('The same photo under another address is the same picture — on the sheet, in the deck, and in the board pictures a recomposition must not repeat');

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ passed: results, pageErrors: errors }, null, 2));
} catch (error) { console.error('Page errors:', errors); throw error; }
finally { await browser?.close(); await server.close(); }
