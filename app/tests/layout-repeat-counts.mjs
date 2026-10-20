// Current catalog DOM audit. Positive AI generation is exercised separately with layout-reflow.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), output = path.join(root, 'app/tests/output/layout-counts');
await fs.mkdir(output, { recursive: true });
const read = async name => JSON.parse(await fs.readFile(path.join(root, 'app/data', name + '.json'), 'utf8'));
const snapshot = { catalog: await read('catalog'), images: await read('images'), products: await read('products_db'), user: { username: 'repeat-audit', auth_enabled: false }, capabilities: null };
const cacheDir = path.join(output, 'vite-cache');
const server = await createServer({ root: path.join(root, 'app/web'), cacheDir, configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [path.join(root, 'app/web'), cacheDir] } } });
let browser;
try {
 await server.listen(); const base = 'http://127.0.0.1:' + server.httpServer.address().port;
 browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
 await context.route(u => u.pathname.startsWith('/api/'), route => route.fulfill(new URL(route.request().url()).pathname === '/api/bootstrap' ? { json: snapshot } : { status: 503, json: { detail: 'Counting audit does not call AI' } }));
 await context.route('**/img/**', route => route.abort());
 const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto(base); await page.locator('.home').waitFor();
 await page.evaluate(async () => { await (await import('/src/services/catalog.js')).loadLayoutHtml(); await document.fonts.ready; });
 const selected = process.argv.slice(2).filter(a => !a.startsWith('--'));
 const report = await page.evaluate(async selected => {
  const { ALL_LAYOUTS, L, layoutHtml } = await import('/src/services/catalog.js');
  const { detectLayoutRepeats } = await import('/src/services/layout-repeat.js');
  document.querySelector('.app').style.display = 'none';
  const host = document.createElement('div'); host.id = 'count-lab'; host.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;background:white'; document.body.appendChild(host);
  const rows = [], canonical = new Set(ALL_LAYOUTS.map(l => l.f));
  for (const meta of selected.length ? selected.map(f => L[f]) : Object.values(L)) {
   if (!meta) throw Error('Unknown layout'); host.innerHTML = layoutHtml(meta.f); if (!host.firstElementChild) throw Error(meta.f + ' has no HTML');
   const before = host.firstElementChild.outerHTML, result = detectLayoutRepeats(host.firstElementChild, meta);
   if (before !== host.firstElementChild.outerHTML) throw Error(meta.f + ' counter mutated original');
   rows.push({ f: meta.f, name: meta.name, p: meta.p, pc: meta.pc, hidden: !canonical.has(meta.f), retired: !!meta.retired, ...result });
  }
  return rows;
 }, selected);
 await fs.writeFile(path.join(output, 'catalog-audit.json'), JSON.stringify(report, null, 2));
 const samples = ['L_AIS_02','L_PH_OV_A','L_PH_OV_I','L_PH_OV_K','L_CL_D','L_PH_P3_A','L_PH_P5_A','L_PH_P2_C','L_P3B','L_PH_OV_E','L_PH_OV_F','L_PH_OV_D'];
 for (const r of report.filter(r => selected.length || samples.includes(r.f))) console.log(JSON.stringify({ f: r.f, name: r.name, status: r.status, targets: r.targets.map(t => ({ count: t.count, unit: t.unit, label: t.label, score: +t.score.toFixed(2), region: t.region, title: t.title })) }));
 console.log(JSON.stringify({ total: report.length, active: report.filter(r => !r.retired && !r.hidden).length, hidden: report.filter(r => r.hidden).length, ready: report.filter(r => r.status === 'ready').length, none: report.filter(r => r.status === 'none').length, errors }));
 const expected = { L_VC_32: 3, L_VC_42: 4, L_AIS_02: 6, L_PH_OV_I: 6, L_PH_OV_K: 8, L_CL_D: 6, L_PH_P3_A: 3, L_PH_P5_A: 5, L_PH_P2_C: 2, L_P3B: 3, L_PH_OV_E: 4, L_PH_OV_F: 5, L_PH_OV_D: 4, L_PH_CP_R: 3, L_PH_AIS_25: 4, L_AIS_27: 4, L_AIS_33: 3, L_AIS_11: 6, L_PH_AIS_35: 4, L_PH_CH_I: 4, L_PH_SO_B: 3, L_SOL_07: 3, L_SOL_08: 4, L_SOL_09: 6 };
 for (const [f, n] of Object.entries(expected)) { const row = report.find(r => r.f === f); if (row) assert.equal(row.primary?.count, n, f + ' semantic repeat count'); }
 if (process.argv.includes('--ui')) {
  const entry = await (await fetch(base + '/src/main.jsx')).text();
  const reactUrl = entry.match(/from ["']([^"']*deps\/react\.js[^"']*)/)[1], domUrl = entry.match(/from ["']([^"']*deps\/react-dom_client\.js[^"']*)/)[1];
  const mount = async f => page.evaluate(async ({ f, reactUrl, domUrl }) => {
    const React = (await import(reactUrl)).default, dom = await import(domUrl), { LayoutEditor } = await import('/src/components/mytpl.jsx');
    document.getElementById('count-lab')?.remove();
    if (!window.__counterMount) { const host = document.createElement('div'); document.body.appendChild(host); window.__counterMount = (dom.createRoot || dom.default.createRoot)(host); }
    window.__counterSaved = null;
    window.__counterMount.render(React.createElement(LayoutEditor, { key: f, f, onClose: () => {}, onSaved: (meta, keep) => { window.__counterSaved = { meta, keep }; window.__counterMount.render(null); } }));
  }, { f, reactUrl, domUrl });
  const ids = await page.evaluate(async () => {
    const { L, registerLayout, layoutHtml } = await import('/src/services/catalog.js');
    const { myMeta, newF, saveTemplates } = await import('/src/repositories/templates.js');
    registerLayout({ ...L.L_AIS_02, f: 'L_COUNT_OV6', p: 'overview', pc: 3 }, layoutHtml('L_AIS_02'));
    registerLayout({ ...L.L_AIS_02, f: 'L_MY_COUNT_IMPORT', name: '가져온 페이지', p: 'overview', pc: 0, my: { kind: 'pptx' } }, '<div data-my="1" style="width:1280px;height:720px;position:relative">' + Array.from({ length: 4 }, (_, i) => `<div style="position:absolute;left:${i % 2 ? 656 : 64}px;top:${i < 2 ? 70 : 380}px;width:500px;height:240px;border:1px solid #ddd"><div data-img="${i}" style="width:100%;height:100px"></div><div data-tb="${i * 2}" style="font-size:18px">항목 ${i + 1}</div><div data-tb="${i * 2 + 1}" style="font-size:13px">설명</div></div>`).join('') + '</div>');
    registerLayout({ f: 'L_COUNT_UNKNOWN', name: '비정형 개요', p: 'overview', pc: 0 }, '<div style="width:1280px;height:720px;position:relative"><div data-tb="0" style="position:absolute;left:64px;top:45px;font-size:30px">개요</div><div data-tb="1" style="position:absolute;left:64px;top:160px;width:350px;height:80px">서로 다른 구조의 설명</div><div data-tb="2" style="position:absolute;left:650px;top:380px;width:500px;height:150px">서로 다른 구조의 설명</div></div>');
    const wrapper = document.createElement('div'); wrapper.innerHTML = layoutHtml('L_AIS_02'); const root = wrapper.firstElementChild;
    [...root.querySelectorAll('[data-img]')].forEach((el, i) => el.parentElement.setAttribute('data-reflow-card', String(i)));
    root.setAttribute('data-repeat-count', '999'); root.setAttribute('data-repeat-unit', 'card'); root.setAttribute('data-repeat-label', '사진 카드');
    const meta = myMeta({ f: newF(), name: '내 사진 카드', p: 'overview', kind: 'edit', nT: 36, nI: 6 });
    await saveTemplates([{ meta, html: root.outerHTML }]); window.__counterPrior = root.outerHTML;
    return { custom: 'L_COUNT_OV6', my: meta.f };
  });
  const unitText = page.locator('.ed-agent-units');
  const expectUnits = async text => { await page.waitForFunction(text => document.querySelector('.ed-agent-units')?.textContent.includes(text), text); };
  await mount(ids.custom); await expectUnits('사진 카드 6개');
  await page.getByLabel('레이아웃 수정 요청').fill('사진 카드를 4개로 바꿔 주세요.');
  await page.setViewportSize({ width: 1100, height: 900 });
  assert.equal(await page.getByLabel('레이아웃 수정 요청').inputValue(), '사진 카드를 4개로 바꿔 주세요.');
  await page.screenshot({ path: path.join(output, 'overview-photo-six.png') });
  await page.setViewportSize({ width: 1500, height: 1000 });
  for (const [f, n, label] of [['L_MY_COUNT_IMPORT', 4, '사진 카드'], ['L_PH_P3_A', 3, '제품'], ['L_PH_OV_D', 4, '지표'], ['L_PH_OV_F', 5, '사진 카드'], ['L_AIS_02', 6, '사진 카드'], ['L_PH_AIS_25', 4, '데이터 카드']]) {
    await mount(f); await expectUnits(label + ' ' + n + '개');
  }
  assert.match(await unitText.innerText(), /처리 단계 3개/);
  await mount(ids.my); await expectUnits('사진 카드 6개');
  await page.locator('.ed-host [data-reflow-card]').last().evaluate(el => { el.style.display = 'none'; }); await expectUnits('사진 카드 5개');
  await page.locator('.ed-host [data-reflow-card]').last().evaluate(el => { el.style.display = ''; }); await expectUnits('사진 카드 6개');
  await page.locator('.ed-host [data-reflow-card]').last().evaluate(el => el.remove()); await expectUnits('사진 카드 5개');
  await page.getByRole('button', { name: '새 My 템플릿으로 저장', exact: true }).click(); await page.waitForFunction(() => window.__counterSaved);
  const saved = await page.evaluate(async f => ({ ...window.__counterSaved, prior: (await import('/src/repositories/templates.js')).rawHtml(f), expectedPrior: window.__counterPrior }), ids.my);
  assert.equal(saved.meta.repeat.count, 5); assert.equal(saved.meta.pc, 0); assert.equal(saved.keep, false); assert.notEqual(saved.meta.f, ids.my); assert.equal(saved.prior, saved.expectedPrior);
  await fs.writeFile(path.join(output, 'ui-save.json'), JSON.stringify(saved, null, 2));
  await mount(saved.meta.f); await expectUnits('사진 카드 5개');
  await mount('L_COUNT_UNKNOWN'); await page.getByLabel('레이아웃 수정 요청').waitFor(); assert.equal(await page.getByLabel('변경할 개수', { exact: true }).count(), 0);
  const before = await page.locator('.ed-host > div').evaluate(el => el.outerHTML);
  await page.getByLabel('레이아웃 수정 요청').fill('반복 항목을 4개로 바꿔 주세요.'); await page.getByRole('button', { name: '요청하기', exact: true }).click(); await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.ed-host > div').evaluate(el => el.outerHTML), before); assert.equal(await page.getByRole('button', { name: '승인', exact: true }).count(), 0);
  console.log('PASS real editor: correct actual counts and multiple units in agent context; prompt survives zoom; stale My count999 resolves6, hide5/show6/delete5; new My saves5/pc0; unknown/error never guesses3');
 }
 assert.deepEqual(errors, []);
} finally { await browser?.close(); await server.close(); }
