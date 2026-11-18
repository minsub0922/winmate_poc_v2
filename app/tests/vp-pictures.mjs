// 가치 제안(VP) 파트의 사진 (사용자 지시 2026-11-17, 제안서 pn63a3to — VP 장의 모든 칸이 QM55C 컷 한 장으로 채워졌다):
//   · 솔루션을 말하는 칸은 그 솔루션의 사진(화면 · 대표 이미지) — 제품 컷이 아니다
//   · 같은 제품을 다시 쓰더라도 다른 사진 — 하나는 제품 컷, 다른 하나는 그 제품이 들어간 다른 사진
//   · 한 장 안에서 같은 사진을 두 번 쓰지 않는다(솔루션 사진도)
//   · VP 파트 안에서는 같은 사진을 두 번 쓰지 않는다 — 제품 컷도 예외가 아니다(다른 파트에서는 제품 컷을 다시 쓸 수 있다)
// 장 · 글은 pn63a3to 의 VP 장 그대로(app/tests/fixtures/vp-pictures.json — 사진은 레이아웃 견본으로 되돌림). 모델은 흉내 낸다: 글은 그대로 두고, 사진은 늘 후보의 첫째를 고른다
// (가장 게으른 모델 — 규칙은 코드가 지켜야 한다). VP 장을 앞에서부터 하나씩 채우고 채운 결과를 파트에 넣는다(실제로도 장마다 따로 채운다).
//   node app/tests/vp-pictures.mjs        (CHROME=<path> to use a system browser)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'app/tests/fixtures/vp-pictures.json'), 'utf8'));
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: null, user: { username: 'vp-pictures-test', auth_enabled: false } };
const server = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const errors = []; const pass = (m) => console.log('PASS', m);
let browser;
try {
  await server.listen();
  browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname.startsWith('/api/product-packs/')) return route.fulfill({ path: path.join(root, 'reference/live/img/prod/d00.json') });
    if (url.pathname === '/api/llm') {
      const body = route.request().postDataJSON();
      const input = JSON.parse(body.prompt.split('<<<DATA\n')[1].split('\nDATA>>>')[0]);
      const data = { blocks: (input.blocks || []).map((b) => ({ i: b.i, action: 'keep', s: b.current, src: [], reason: 'test-only keep' })),
        images: (input.images || []).map((im) => (im.candidates.length ? { i: im.i, action: 'replace', n: 0, reason: 'test-only first candidate' } : { i: im.i, action: im.current ? 'keep' : 'clear', n: -1, reason: 'test-only nothing to pick' })),
        replacements: [], missing: [] };
      return route.fulfill({ json: { mode: 'real', data } });
    }
    return route.fulfill({ status: 503, json: { code: 'test_no_api' } });
  });
  await context.route('**/img/**', (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.join(root, rel.startsWith('img/lib/') ? rel : 'app/data/static/' + rel);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
  });
  await context.route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort());
  const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message)); page.setDefaultTimeout(60000);
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port);
  await page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'));

  const result = await page.evaluate(async (fx) => {
    const { loadLayoutHtml, S } = await import('/src/services/catalog.js'); await loadLayoutHtml();
    const { personalizeLayout, readSlotContexts } = await import('/src/services/layout-context.js');
    const { loadImageLibrary, imagePool } = await import('/src/services/image-library.js');
    const { knownImage } = await import('/src/services/image-identity.js');
    const { pictureId } = await import('/src/services/picture-identity.js');
    const vp = structuredClone(fx.vp), sol = structuredClone(fx.sol);
    const p = { id: 'vp-pictures', title: fx.title, customer: fx.customer, ind: fx.ind, req: fx.req, ctx: fx.ctx, parts: [vp, sol] };
    for (const x of vp.layouts) {
      const r = await personalizeLayout(p, vp, x);
      x.ov = r.ov; x.ev = r.ev;
    }
    const pool = imagePool({ ...fx.ctx }, await loadImageLibrary(), { industry: fx.ind });
    const solName = (id) => S[id].name.toLowerCase();
    return vp.layouts.map((x) => {
      const near = Object.fromEntries(readSlotContexts(x.f, x.ov).slots.map((s) => [s.i, s.near.join(' · ')]));
      return { f: x.f, slots: Object.entries(x.ov.img || {}).map(([i, im]) => {
        const k = im && im.src ? knownImage(im, pool) : null;
        return { i: +i, near: near[i] || '', hidden: !!(im && im.hidden), src: im && im.src, id: im && im.src ? pictureId(im.src) : '', group: (k && k.group) || '', fit: im && im.fit,
          products: (im && im.products && im.products.length ? im.products : (k && k.products) || []),
          solution: !!(im && im.src && ((k && (k.solutions || []).includes('magicinfo')) || [k && k.desc, k && k.model, k && k.title, im.name].join(' ').toLowerCase().includes(solName('magicinfo')))) };
      }) };
    });
  }, fixture);
  fs.mkdirSync(path.join(root, 'app/tests/output'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app/tests/output/vp-pictures.json'), JSON.stringify(result, null, 1));
  const all = result.flatMap((x) => x.slots.map((s) => ({ ...s, f: x.f })));
  const shown = all.filter((s) => !s.hidden && s.src);

  // 1. 솔루션을 말하는 칸(제품 이름 없이 MagicINFO) — MagicINFO 사진, 제품 컷이 아님
  const solSlots = all.filter((s) => /magicinfo/i.test(s.near) && !/QM55C|스마트 사이니지/i.test(s.near));
  assert.ok(solSlots.length >= 2, '이 fixture 에는 솔루션만 말하는 칸이 여럿 있다: ' + JSON.stringify(all.map((s) => [s.f, s.i, s.near])));
  for (const s of solSlots) assert.ok(s.hidden || (s.solution && !s.products.includes('qm55c')), `${s.f} #${s.i} (“${s.near}”): 솔루션 사진이어야 함 — ` + JSON.stringify(s));
  assert.ok(solSlots.some((s) => !s.hidden), '솔루션 칸 중 적어도 하나는 솔루션 사진으로 채워져야 함');
  pass('솔루션을 말하는 칸은 그 솔루션의 사진 — 제품 컷이 아니다');

  // 2. 한 장 안에 같은 사진 두 번 없음
  for (const x of result) { const ids = x.slots.filter((s) => !s.hidden && s.src).map((s) => s.id); assert.equal(new Set(ids).size, ids.length, x.f + ' 한 장에 같은 사진: ' + JSON.stringify(x.slots)); }
  pass('한 장 안에서 같은 사진을 두 번 쓰지 않는다(솔루션 사진도)');

  // 3. VP 파트 안에 같은 사진 두 번 없음 — 제품 컷도
  const ids = shown.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'VP 파트에 같은 사진이 두 번: ' + JSON.stringify(shown.map((s) => [s.f, s.i, s.src])));
  pass('VP 파트 안에서는 같은 사진을 두 번 쓰지 않는다 — 제품 컷도');

  // 4. 같은 제품을 다시 쓰면 다른 사진 — 제품 컷은 한 번, 나머지는 그 제품이 들어간 다른 사진
  const qm = shown.filter((s) => s.products.includes('qm55c'));
  const cuts = qm.filter((s) => s.group === 'cut' || s.fit === 'contain');
  assert.ok(qm.length >= 2, 'QM55C 를 보여 주는 칸이 여럿이어야 함: ' + JSON.stringify(qm));
  assert.ok(cuts.length >= 1 && cuts.length <= 1, 'QM55C 제품 컷은 파트에서 한 번: ' + JSON.stringify(cuts));
  assert.ok(qm.filter((s) => !cuts.includes(s)).every((s) => s.group !== 'cut' && s.fit !== 'contain'), '나머지는 제품이 들어간 다른 사진: ' + JSON.stringify(qm));
  pass('같은 제품을 다시 쓰면 하나는 제품 컷, 다른 칸은 그 제품이 들어간 다른 사진');

  assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
  console.log('ALL PASS');
} finally {
  if (browser) await browser.close();
  await server.close();
}
