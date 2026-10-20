// Real background editor, actual assets, IndexedDB and PPTX export. No model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import JSZip from '../web/node_modules/jszip/lib/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'app/web/package.json'));
const sharp = require('sharp');
const read = async p => JSON.parse(await fs.readFile(path.join(root, p), 'utf8'));
const manifest = await read('app/web/src/domain/templates/backgrounds.json');
for (const industry of manifest.industries) assert.ok(manifest.images.filter(im => im.industry === industry.code).length >= 3, industry.code);
for (const im of manifest.images) {
  const full = await sharp(path.join(root, 'app/data/backgrounds', path.basename(im.src))).metadata();
  const thumb = await sharp(path.join(root, 'app/data/backgrounds', path.basename(im.thumb))).metadata();
  assert.equal(full.width, im.w); assert.equal(full.height, im.h);
  assert.equal(thumb.width, 320); assert.equal(thumb.height, 180);
  assert.ok(im.source.file); if (im.source.kind === 'samsung') assert.ok(im.source.page && im.source.original);
}
console.log(`PASS ${manifest.images.length} original photos/thumbnails, 16 industries, source records`);
const bootstrap = { catalog: await read('app/data/catalog.json'), images: await read('app/data/images.json'), products: await read('app/data/products_db.json'), user: { username: 'background-test', auth_enabled: false }, capabilities: null };
const cacheDir = path.join(root, 'app/tests/output/backgrounds/vite-cache');
const server = await createServer({ root: path.join(root, 'app/web'), cacheDir, configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', optimizeDeps: { include: ['react', 'react-dom/client'] }, server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, fs: { allow: [path.join(root, 'app/web'), cacheDir] } } });
let browser, page;
const errors = [];
const output = path.join(root, 'app/tests/output/backgrounds'); await fs.mkdir(output, { recursive: true });
try {
  await server.listen(); const base = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.addInitScript(({ react, dom }) => { window.__backgroundReactModule = react; window.__backgroundDomModule = dom; }, { react: '/@fs' + cacheDir + '/deps/react.js', dom: '/@fs' + cacheDir + '/deps/react-dom_client.js' });
  await context.route(url => url.pathname.startsWith('/api/'), r => r.fulfill(new URL(r.request().url()).pathname === '/api/bootstrap' ? { json: bootstrap } : { status: 503, json: { detail: 'No API/model calls in background UI tests' } }));
  await context.route(url => url.pathname.startsWith('/img/'), async r => {
    const url = new URL(r.request().url());
    const file = url.pathname.startsWith('/img/backgrounds/') ? path.join(root, 'app/data/backgrounds', path.basename(url.pathname)) : path.join(root, 'app/data/static', url.pathname);
    try { await r.fulfill({ path: file }); } catch { await r.abort(); }
  });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(20000);
  await page.goto(base); await page.locator('.home').waitFor();
  const ranks = await page.evaluate(async () => {
    const b = await import('/src/services/backgrounds.js');
    return b.BACKGROUND_INDUSTRIES.map(ind => {
      const groups = b.backgroundGroups({ industry: ind.code, part: 'scenario', text: ind.name });
      return { industry: ind.code, top: groups.recommended[0]?.industry, ids: [...groups.recommended, ...groups.rest].map(x => x.id) };
    });
  });
  for (const rank of ranks) { assert.equal(rank.top, rank.industry); assert.equal(new Set(rank.ids).size, 49); }
  console.log('PASS industry-aware recommendation order and complete, non-duplicated remainder');
  await page.evaluate(async () => {
    const React = (await import(window.__backgroundReactModule)).default;
    const { createRoot } = (await import(window.__backgroundDomModule)).default;
    const { LayoutEditor } = await import('/src/components/mytpl.jsx');
    const { registerLayout } = await import('/src/services/catalog.js');
    const { FitSlide } = await import('/src/domain/slides/Slide.jsx');
    const f = 'L_TEST_BACKGROUND';
    window.__backgroundOriginal = '<div style="position:relative;width:1280px;height:720px;background:#fff;color:#121417;font-family:sans-serif"><div style="position:absolute;inset:0;width:1280px;height:720px;background:#fff"><h1 data-tb="0" style="position:absolute;left:64px;top:64px;font-size:38px">호텔 객실 TV · 투숙 경험 개선</h1><p data-tb="1" style="position:absolute;left:64px;top:180px;font-size:22px">객실과 로비의 디지털 서비스</p><div data-img="0" style="position:absolute;left:880px;top:400px;width:240px;height:160px"><img src="/img/cover/FB.jpg" style="width:100%;height:100%;object-fit:cover" alt="유지할 이미지"></div></div></div>';
    registerLayout({ f, name: '호텔 배경 테스트', p: 'scenario', c: 'CM', ind: 'HT', req: [], prods: [], sols: [], ik: [], ih: [], phs: [] }, window.__backgroundOriginal);
    document.querySelector('.app').style.display = 'none';
    const host = document.createElement('div'); document.body.appendChild(host);
    function Subject() {
      const [saved, setSaved] = React.useState(null);
      return saved ? React.createElement('div', { id: 'background-saved' }, React.createElement(FitSlide, { f: saved.f }))
        : React.createElement(LayoutEditor, { f, context: { industry: 'HT' }, onClose: () => {}, onSaved: meta => { window.__backgroundSaved = meta.f; localStorage.setItem('background-test-layout', meta.f); setSaved(meta); } });
    }
    createRoot(host).render(React.createElement(Subject));
  });
  const editor = page.locator('.modal').filter({ has: page.locator('.myed') }); await editor.waitFor();
  await editor.getByRole('button', { name: '배경 사진 선택', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '배경 사진 선택', exact: true }); await picker.waitFor();
  assert.equal(await picker.locator('.background-option').count(), 49);
  assert.equal(await picker.getByRole('combobox', { name: '배경 사진 업종' }).locator('option').count(), 17);
  assert.equal(await picker.locator('.background-section').first().getAttribute('aria-label'), '현재 시트 추천');
  for (const industry of manifest.industries) {
    await picker.getByRole('combobox', { name: '배경 사진 업종' }).selectOption(industry.code);
    assert.equal(await picker.locator('.background-option').count(), 3);
  }
  await picker.getByRole('combobox', { name: '배경 사진 업종' }).selectOption('');
  await picker.getByRole('textbox', { name: '배경 사진 검색' }).fill('호텔');
  assert.ok(await picker.locator('.background-option').count() >= 3);
  await picker.getByRole('textbox', { name: '배경 사진 검색' }).fill('');
  const photo = picker.locator('[data-background-id="ht-room-tv"]'); await photo.hover();
  await page.getByRole('tooltip', { name: '이미지 확대 미리보기' }).waitFor();
  await page.mouse.move(3, 3); await page.screenshot({ path: path.join(output, 'recommendations.png') });
  await photo.click(); await picker.waitFor({ state: 'detached' });
  const drawn = page.locator('.ed-host > div');
  assert.equal(await drawn.getAttribute('data-bg-id'), 'ht-room-tv');
  assert.ok((await drawn.getAttribute('data-bg')).startsWith('blob:'));
  assert.equal(await drawn.locator('[data-tb="0"]').innerText(), '호텔 객실 TV · 투숙 경험 개선');
  assert.equal(await drawn.locator('[data-img="0"] img').getAttribute('alt'), '유지할 이미지');
  assert.equal(await drawn.locator(':scope > div:not([data-bg-tint])').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await editor.getByRole('button', { name: '되돌리기', exact: true }).click(); assert.equal(await drawn.getAttribute('data-bg'), null);
  await editor.getByRole('button', { name: '다시 하기', exact: true }).click(); assert.equal(await drawn.getAttribute('data-bg-id'), 'ht-room-tv');
  await editor.getByRole('slider', { name: '배경 사진 농도' }).fill('60');
  assert.equal(await drawn.getAttribute('data-bg-strength'), '60');
  await editor.getByLabel('배경색 직접 고르기', { exact: true }).fill('#ffeedd'); assert.equal(await drawn.getAttribute('data-bg'), null);
  await editor.getByRole('button', { name: '되돌리기', exact: true }).click(); assert.equal(await drawn.getAttribute('data-bg-id'), 'ht-room-tv');
  await editor.getByRole('button', { name: '배경 사진 지우기', exact: true }).click(); assert.equal(await drawn.getAttribute('data-bg'), null);
  await editor.getByRole('button', { name: '되돌리기', exact: true }).click(); assert.equal(await drawn.getAttribute('data-bg-id'), 'ht-room-tv');
  await drawn.locator('[data-img="0"] img').evaluate(img => img.decode());
  await editor.locator('.ed-background-thumb').evaluate(img => img.decode());
  assert.ok(await drawn.locator('[data-img="0"] img').isVisible());
  await page.screenshot({ path: path.join(output, 'editor.png') });
  console.log('PASS photo selection, industry/search filters, hover preview, undo/redo, strength, color switching and removal');
  const waitEffects = () => page.waitForFunction(() => {
    const r = document.querySelector('.ed-host > div');
    return r?.getAttribute('data-bg') && r.getAttribute('data-bg-effects') === r.getAttribute('data-bg-rendered-effects');
  });
  const preset = async name => { await editor.getByRole('group', { name: '배경 효과 프리셋' }).getByRole('button', { name, exact: true }).click(); await waitEffects(); };
  const metrics = async () => {
    await waitEffects();
    return page.evaluate(async () => {
      const r = document.querySelector('.ed-host > div');
      const src = r.getAttribute('data-bg-rendered') || r.getAttribute('data-bg');
      const bitmap = await createImageBitmap(await (await fetch(src)).blob());
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d'), k = Math.max(1280 / bitmap.width, 720 / bitmap.height);
      ctx.drawImage(bitmap, (1280 - bitmap.width * k) / 2, (720 - bitmap.height * k) / 2, bitmap.width * k, bitmap.height * k); bitmap.close();
      const p = ctx.getImageData(0, 0, 1280, 720).data, mean = [0, 0, 0]; let count = 0, edge = 0;
      for (let y = 4; y < 716; y += 4) for (let x = 4; x < 1276; x += 4) {
        const i = (y * 1280 + x) * 4;
        for (let c = 0; c < 3; c++) { mean[c] += p[i + c]; edge += Math.abs(p[i + c] - p[i + 4 + c]); }
        count++;
      }
      return { mean: mean.map(x => x / count), edge: edge / count / 3, source: r.getAttribute('data-bg'), effects: JSON.parse(r.getAttribute('data-bg-effects')) };
    });
  };
  await preset('원본'); const originalMetrics = await metrics();
  const foregroundBefore = await drawn.locator('[data-img="0"]').evaluate(el => el.outerHTML);
  await preset('연하게'); const faded = await metrics();
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(faded.mean[i] - (originalMetrics.mean[i] * .35 + 255 * .65)) < 5);
  await preset('흰색'); const white = await metrics();
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(white.mean[i] - (originalMetrics.mean[i] * .4 + 255 * .6)) < 5);
  await preset('검정'); const black = await metrics();
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(black.mean[i] - originalMetrics.mean[i] * .55) < 5);
  await preset('파랑'); const blue = await metrics();
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(blue.mean[i] - (originalMetrics.mean[i] * .5 + [20, 40, 160][i] * .5)) < 5);
  await editor.getByLabel('배경 덮개 색 직접 고르기', { exact: true }).fill('#ff6600');
  await editor.getByRole('slider', { name: '배경 덮개 투명도' }).fill('100'); const orange = await metrics();
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(orange.mean[i] - [255, 102, 0][i]) < 3);
  await preset('블러'); const blurred = await metrics();
  assert.ok(blurred.edge < originalMetrics.edge * .8, `blur reduces image detail: ${blurred.edge} < ${originalMetrics.edge}`);
  await page.evaluate(() => {
    window.__backgroundFilterDescriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'filter');
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { configurable: true, get: () => undefined, set: () => {} });
  });
  try {
    await preset('원본'); await preset('블러');
    const software = await metrics(); assert.ok(software.edge < originalMetrics.edge * .8, 'blur also works when native canvas filters are unavailable');
  } finally {
    await page.evaluate(() => Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', window.__backgroundFilterDescriptor));
  }
  await preset('도트'); const dotted = await metrics();
  assert.ok(dotted.mean.some((v, i) => Math.abs(v - originalMetrics.mean[i]) > 15), 'dot effect changes the actual background pixels');
  await editor.getByRole('slider', { name: '도트 크기' }).fill('24'); await waitEffects();
  const largeDots = await metrics(); assert.notEqual(largeDots.edge, dotted.edge);
  await preset('파랑');
  await editor.getByRole('slider', { name: '배경 사진 농도' }).fill('72');
  await editor.getByRole('slider', { name: '배경 블러' }).fill('6');
  await editor.getByRole('slider', { name: '배경 덮개 투명도' }).fill('25');
  await editor.getByRole('checkbox', { name: '도트 효과', exact: true }).check();
  await editor.getByRole('slider', { name: '도트 강도' }).fill('65');
  await editor.getByRole('slider', { name: '도트 크기' }).fill('14'); await waitEffects();
  const combined = (await metrics()).effects;
  assert.deepEqual(combined, { opacity: 72, blur: 6, overlayColor: '#1428a0', overlayOpacity: 25, dots: 65, dotSize: 14 });
  assert.equal(await drawn.getAttribute('data-bg'), originalMetrics.source, 'effects preserve the original photo');
  assert.equal(await drawn.locator('[data-img="0"]').evaluate(el => el.outerHTML), foregroundBefore, 'foreground picture remains unchanged');
  assert.equal(await drawn.locator('[data-tb="0"]').evaluate(el => getComputedStyle(el).filter), 'none', 'text is never blurred');
  await editor.getByRole('button', { name: '되돌리기', exact: true }).click(); await waitEffects();
  assert.equal(JSON.parse(await drawn.getAttribute('data-bg-effects')).dotSize, 12);
  await editor.getByRole('button', { name: '다시 하기', exact: true }).click(); await waitEffects();
  assert.deepEqual(JSON.parse(await drawn.getAttribute('data-bg-effects')), combined);
  for (const id of ['ht-lobby', 'ht-room-tv']) {
    await editor.getByRole('button', { name: '배경 사진 바꾸기', exact: true }).click(); await picker.waitFor();
    await picker.locator(`[data-background-id="${id}"]`).click(); await picker.waitFor({ state: 'detached' }); await waitEffects();
    assert.deepEqual(JSON.parse(await drawn.getAttribute('data-bg-effects')), combined, 'changing photos keeps effects');
  }
  await editor.getByRole('group', { name: '배경 효과', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'effects.png') });
  console.log('PASS actual fade/white/black/blue/custom-color pixels, blur reduction, dots, combinations, undo/redo and preserved foreground/original');
  await editor.getByRole('button', { name: '저장', exact: true }).click(); await editor.waitFor({ state: 'detached' });
  const exported = await page.evaluate(async () => {
    const { rawHtml } = await import('/src/repositories/templates.js');
    const { layoutHtml } = await import('/src/services/catalog.js');
    const { exportPptx } = await import('/src/domain/slides/export-pptx.js');
    const f = window.__backgroundSaved;
    const { layoutHtml: drawnHtml } = await import('/src/services/catalog.js');
    const holder = document.createElement('div'); holder.innerHTML = drawnHtml(f);
    const savedRoot = holder.firstElementChild;
    const previewBlob = await (await fetch(savedRoot.getAttribute('data-bg-rendered'))).blob();
    const preview = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(previewBlob); });
    const blob = await exportPptx([{ f, ov: { t: {}, img: {} } }], { title: '사진 배경 검증' });
    const pptx = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
    return { f, raw: rawHtml(f), html: layoutHtml(f), original: layoutHtml('L_TEST_BACKGROUND'), source: window.__backgroundOriginal, pptx, preview, effects: JSON.parse(savedRoot.getAttribute('data-bg-effects')) };
  });
  assert.ok(exported.raw.includes('wmimg:')); assert.equal(exported.raw.includes('blob:'), false);
  assert.equal(exported.original, exported.source);
  const zip = await JSZip.loadAsync(Buffer.from(exported.pptx, 'base64'));
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  assert.match(xml, /<p:bg>[\s\S]*?<a:blipFill\b/); assert.ok(xml.includes('호텔 객실 TV'));
  const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
  const bgId = /<p:bg>[\s\S]*?r:embed="([^"]+)"/.exec(xml)[1];
  const target = new RegExp(`Id="${bgId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] || new RegExp(`Target="([^"]+)"[^>]*Id="${bgId}"`).exec(rels)?.[1];
  const bgFile = path.posix.normalize(path.posix.join('ppt/slides', target));
  const bgMeta = await sharp(await zip.file(bgFile).async('nodebuffer')).metadata(); assert.equal(bgMeta.width / bgMeta.height, 16 / 9);
  const exportedPixels = await sharp(await zip.file(bgFile).async('nodebuffer')).raw().toBuffer();
  const previewPixels = await sharp(Buffer.from(exported.preview, 'base64')).raw().toBuffer();
  assert.ok(exportedPixels.equals(previewPixels), 'PPTX background matches the processed preview pixels');
  assert.deepEqual(exported.effects, combined);
  await fs.writeFile(path.join(output, 'background.pptx'), Buffer.from(exported.pptx, 'base64'));
  await page.reload(); await page.locator('.app').waitFor(); await page.waitForFunction(() => !document.querySelector('.boot'));
  const restored = await page.evaluate(async f => {
    const { layoutHtml } = await import('/src/services/catalog.js'); const html = layoutHtml(f);
    const root = document.createElement('div'); root.innerHTML = html;
    const image = new Image(); image.src = root.firstElementChild.getAttribute('data-bg'); await image.decode();
    const preview = new Image(); preview.src = root.firstElementChild.getAttribute('data-bg-rendered'); await preview.decode();
    return { id: root.firstElementChild.getAttribute('data-bg-id'), width: image.naturalWidth, html, previewWidth: preview.naturalWidth, effects: JSON.parse(root.firstElementChild.getAttribute('data-bg-effects')) };
  }, exported.f);
  assert.equal(restored.id, 'ht-room-tv'); assert.ok(restored.width > 0); assert.ok(restored.html.includes('호텔 객실 TV'));
  assert.equal(restored.previewWidth, 1280); assert.deepEqual(restored.effects, combined);
  const portable = await page.evaluate(async f => {
    const { packSharedAssets } = await import('/src/services/shared-assets.js');
    const document = await packSharedAssets({ parts: [{ id: 'part', layouts: [{ uid: 'layout', f }] }] });
    const html = document.sharedTemplates[0].html;
    const holder = window.document.createElement('div'); holder.innerHTML = html;
    const root = holder.firstElementChild;
    return { hasBlob: html.includes('blob:'), original: root.getAttribute('data-bg').startsWith('data:image/'), processed: root.getAttribute('data-bg-rendered').startsWith('data:image/'), effects: JSON.parse(root.getAttribute('data-bg-effects')) };
  }, exported.f);
  assert.equal(portable.hasBlob, false); assert.ok(portable.original && portable.processed); assert.deepEqual(portable.effects, combined);
  await page.evaluate(async f => {
    const React = (await import(window.__backgroundReactModule)).default;
    const { createRoot } = (await import(window.__backgroundDomModule)).default;
    const { LayoutEditor } = await import('/src/components/mytpl.jsx');
    document.querySelector('.app').style.display = 'none';
    const host = document.createElement('div'); document.body.appendChild(host);
    createRoot(host).render(React.createElement(LayoutEditor, { f, onClose: () => {}, onSaved: () => {} }));
  }, exported.f);
  await editor.waitFor(); await waitEffects();
  assert.equal(await editor.getByRole('slider', { name: '배경 블러' }).inputValue(), '6');
  assert.equal(await editor.getByRole('slider', { name: '도트 크기' }).inputValue(), '14');
  await preset('원본');
  const reset = await metrics();
  assert.deepEqual(reset.effects, { opacity: 100, blur: 0, overlayColor: '#ffffff', overlayOpacity: 0, dots: 0, dotSize: 12 });
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(reset.mean[i] - originalMetrics.mean[i]) < 1, 'reset restores the preserved original photograph');
  await editor.getByRole('button', { name: '닫기', exact: true }).last().click();
  await page.getByRole('dialog', { name: '변경 내용을 저장할까요?', exact: true }).getByRole('button', { name: '저장 안 함', exact: true }).click();
  // The fixture's onClose is intentionally inert. Unmount it before the next fixture.
  await page.reload(); await page.waitForFunction(() => document.querySelector('.app') && !document.querySelector('.boot'));
  await page.evaluate(async () => {
    const React = (await import(window.__backgroundReactModule)).default;
    const { createRoot } = (await import(window.__backgroundDomModule)).default;
    const { LayoutEditor } = await import('/src/components/mytpl.jsx');
    const { registerLayout } = await import('/src/services/catalog.js');
    registerLayout({ f: 'L_TEST_FULL_BG', name: '기존 표지', p: 'cover', c: 'CM', ind: 'HT' }, '<div style="width:1280px;height:720px;position:relative;background:#121417;color:white"><img data-img="0" src="/img/cover/HT.jpg" style="position:absolute;inset:0;width:1280px;height:720px;object-fit:cover"><h1 data-tb="0" style="position:absolute;left:60px;top:80px">그대로 유지할 표지 문구</h1></div>');
    document.querySelector('.app').style.display = 'none';
    const host = document.createElement('div'); document.body.appendChild(host);
    createRoot(host).render(React.createElement(LayoutEditor, { f: 'L_TEST_FULL_BG', onClose: () => {}, onSaved: () => {} }));
  });
  await editor.waitFor(); await preset('파랑');
  assert.ok(await drawn.getAttribute('data-bg')); assert.equal(await drawn.locator('img[data-img="0"]').count(), 0);
  assert.equal(await drawn.locator('[data-tb="0"]').innerText(), '그대로 유지할 표지 문구');
  assert.equal(JSON.parse(await drawn.getAttribute('data-bg-effects')).overlayColor, '#1428a0');
  assert.deepEqual(errors, []);
  await fs.rm(path.join(output, 'failure.png'), { force: true });
  console.log('PASS persistent originals/effect settings/processed preview and pixel-identical native 16:9 PPTX background');
  console.log('PASS shared original/processed assets, re-editing, original reset, and direct effects on an existing full-bleed cover');
} catch (error) {
  console.error('Page errors:', errors);
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser?.close(); await server.close(); }
