// Real parsed PPTX/PDF previews and report interactions; API/model calls are blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'app/tests/output/review-report'); fs.mkdirSync(out, { recursive: true });
const json = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json'), 'utf8'));
const boot = { catalog: json('catalog'), products: json('products_db'), images: json('images'), capabilities: null, user: { username: 'admin', auth_enabled: true } };
const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const passed = [], errors = []; let browser, page;
const pass = s => { passed.push(s); console.log('PASS ' + s); };
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 }, colorScheme: 'light' });
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (u.pathname === '/api/auth/status') return route.fulfill({ json: { enabled: false, configured: true, authenticated: true } });
    if (u.pathname.startsWith('/api/product-packs/')) return route.fulfill({ json: JSON.parse(fs.readFileSync(path.join(root, 'reference/live/img/prod/d00.json'), 'utf8')) });
    if (u.pathname === '/api/storyboards') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: { code: 'review_ui_test_no_model' } });
  });
  await context.route(url => ['/img/', '/lib/', '/fonts/'].some(p => url.pathname.startsWith(p)), route => {
    const u = new URL(route.request().url()), rel = decodeURIComponent(u.pathname).slice(1);
    const p = path.join(root, u.pathname.startsWith('/fonts/') ? 'app/web/public' : 'app/data/static', rel);
    return fs.existsSync(p) ? route.fulfill({ path: p }) : route.abort();
  });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  // Explicit legacy fixture: these tests cover reconnecting historical uploads.
  // Fresh paired examples have their own migration/rendering browser suite.
  await context.addInitScript(({reviews,seedVersion}) => {
    if (!localStorage.getItem('winmate.v2.reviews')) {
      localStorage.setItem('winmate.v2.reviews', JSON.stringify(reviews.map(r => ({ ...r, sample: { source: 'example-review', version: 1 } }))));
      localStorage.setItem('winmate.v2.reviews.seedv', `admin-linked-review-examples-${seedVersion}`);
    }
    if (!localStorage.getItem('winmate.v2.ui')) localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'review', id: 'r_demo_c' } }));
  }, {reviews:JSON.parse(fs.readFileSync(path.join(root, 'app/web/src/domain/review/sample-reviews.json'), 'utf8')).reviews,seedVersion:JSON.parse(fs.readFileSync(path.join(root,'app/web/src/domain/review/linked-review-examples.json'),'utf8')).version});
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(20000);
  const base = 'http://127.0.0.1:' + vite.httpServer.address().port;
  await page.goto(base); await page.locator('.rv-overview').waitFor();
  assert.equal(await page.locator('.rv-report > .rv-note').count(), 0);
  assert.ok(await page.locator('.rv-report').evaluate(el => el.firstElementChild.classList.contains('rv-overview')));
  pass('Review details start with the summary and no longer show the two top notice banners');
  assert.equal(await page.locator('.rv-side').count(), 0);
  assert.equal(await page.locator('.rv-score-summary>div').count(), 7);
  assert.equal(await page.locator('.rv-score-summary button,.rv-score-summary a').count(), 0);
  const widths = await page.evaluate(() => ['.rv-overview', '.rv-deck'].map(s => document.querySelector(s).getBoundingClientRect().width));
  assert.ok(Math.abs(widths[0] - widths[1]) < 2); pass('One full-width report column and noninteractive category scores inside the summary');
  await page.getByRole('button', { name: '이렇게 읽었어요', exact: true }).hover();
  await page.getByRole('region', { name: '이렇게 읽었어요 상세', exact: true }).waitFor();
  assert.ok((await page.locator('.rv-hover').innerText()).includes('C 베이커리'));
  await page.locator('.rv-hover').hover(); await page.waitForTimeout(220);
  assert.equal(await page.locator('.rv-hover').count(), 1);
  await page.keyboard.press('Escape'); await page.locator('.rv-hover').waitFor({ state: 'detached' });
  pass('Reading context opens on hover, remains readable under the pointer, and closes on Escape');
  assert.equal(await page.locator('.rv-radar').count(), 7);
  await page.locator('.rv-radar-target:not(.unscored) .rv-radar-dot').first().hover();
  await page.locator('.rv-criterion-detail').waitFor();
  assert.ok((await page.locator('.rv-hover').innerText()).includes('평가 근거'));
  await page.locator('.rv-hover-outside').hover(); await page.waitForTimeout(220);
  assert.equal(await page.locator('.rv-hover-outside').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('.rv-radar-target').first().focus(); await page.locator('.rv-criterion-detail').waitFor();
  await page.keyboard.press('Escape'); pass('Seven criteria radar charts expose score, description, evidence and fixes through hover and keyboard focus');
  assert.equal(await page.locator('.rv-radar-key,.rv-radar-key-item').count(), 0);
  pass('The duplicate score lists below all seven radar charts are removed');
  const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
  const criterionCount = await page.locator('.rv-radar-target').count();
  for (let i = 0; i < criterionCount; i++) {
    const target = page.locator('.rv-radar-target').nth(i);
    await page.evaluate(() => document.activeElement?.blur());
    await target.scrollIntoViewIfNeeded(); await target.focus();
    const card = page.locator('.rv-hover-outside'); await card.waitFor();
    const panelRect = await card.boundingBox();
    const plotRect = await target.evaluate(el => { const r = el.closest('.rv-radar').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    assert.ok(!overlap(panelRect, plotRect), 'hover covers radar criterion ' + i);
    assert.ok(panelRect.x >= 0 && panelRect.x + panelRect.width <= 1501, 'hover outside viewport at criterion ' + i);
    if (i === 0 || i === criterionCount - 1) {
      await page.waitForTimeout(220);
      assert.equal(await card.count(), 1, 'focused criterion keeps its details open');
      await page.screenshot({ path: path.join(out, `radar-hover-${i}.png`), animations: 'disabled' });
    }
    await page.keyboard.press('Escape');
  }
  pass('Every criterion hover stays outside its radar and within the desktop viewport');
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 760 }); await page.mouse.move(width - 4, 20); await page.waitForTimeout(250);
    for (const index of [0, 3, 6]) {
      const chart = page.locator('.rv-radar').nth(index), target = chart.locator('.rv-radar-target').first();
      await page.evaluate(() => document.activeElement?.blur()); await target.scrollIntoViewIfNeeded(); await target.focus();
      const card = page.locator('.rv-hover-outside'); await card.waitFor();
      const panelRect = await card.boundingBox(), plotRect = await chart.boundingBox();
      assert.ok(!overlap(panelRect, plotRect), 'responsive hover overlaps radar at ' + width + 'px');
      assert.ok(panelRect.x >= 0 && panelRect.x + panelRect.width <= width + 1);
      if (width === 390) {
        assert.equal(await card.locator('xpath=..').getAttribute('class'), 'rv-radar-detail-slot');
        assert.ok(panelRect.y >= plotRect.y + plotRect.height, 'phone details must appear after the radar');
      }
      if (index === 0) {
        await card.scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(out, `radar-hover-${width}.png`), animations: 'disabled' });
      }
      await page.keyboard.press('Escape');
    }
  }
  await page.setViewportSize({ width: 1500, height: 1050 });
  pass('Tablet edge charts and phone inline details stay readable without covering the radar');
  const grid = await page.locator('.rv-priority-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.equal(grid, 3); pass('Priorities use a three-column grid on desktop');
  assert.equal(await page.locator('.rv-slide-card').count(), 12);
  assert.equal(await page.locator('.rv-deck .rv-wire').count(), 0);
  assert.equal(await page.locator('.rv-deck .rv-original-missing').count(), 12);
  pass('Historical records explicitly request an original instead of showing an approximate layout');
  await page.getByRole('button', { name: '장표 목록 다음', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.rv-slide-rail').scrollLeft > 200);
  pass('Every slide remains accessible through native horizontal scrolling and navigation arrows');
  const beforeScores = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('winmate.v2.reviews')).find(r => r.id === 'r_demo_c'); return JSON.stringify([r.agg, r.results]); });
  await page.locator('.rv-deck input[type=file]').setInputFiles(path.join(root, 'build/fixtures/review_sample.pptx'));
  await page.waitForFunction(() => document.querySelectorAll('.rv-deck iframe').length === 12, null, { timeout: 90000 });
  const first = page.locator('.rv-deck iframe').first();
  await first.scrollIntoViewIfNeeded();
  await first.contentFrame().locator('[data-my="pptx"]').waitFor();
  assert.ok((await first.contentFrame().locator('body').innerText()).includes('C 베이커리'));
  const render = await first.contentFrame().locator('[data-my="pptx"]').evaluate(el => ({ w: el.style.width, h: el.style.height, shapes: el.querySelectorAll('svg').length, text: el.querySelectorAll('[data-tb]').length }));
  assert.equal(render.w, '1280px'); assert.equal(render.h, '720px'); assert.ok(render.text > 0);
  await page.locator('.rv-body').evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: path.join(out, 'desktop-overview.png') });
  await page.locator('.rv-deck').screenshot({ path: path.join(out, 'original-slides.png') });
  pass('Reconnecting the real source restores all 12 full PPTX layouts at their original canvas coordinates');
  await page.waitForTimeout(450); await page.reload(); await page.locator('.rv-deck iframe').first().waitFor();
  assert.equal(await page.locator('.rv-deck iframe').count(), 12);
  assert.equal(await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('winmate.v2.reviews')).find(r => r.id === 'r_demo_c'); return JSON.stringify([r.agg, r.results]); }), beforeScores);
  pass('Original layouts persist in IndexedDB and survive reload without changing scores');
  await page.locator('.rv-slide-card').first().hover();await page.locator('.rv-slide-hover').waitFor();
  await page.locator('.rv-slide-hover iframe').contentFrame().locator('[data-my="pptx"]').waitFor();
  const hoverLayout=await page.locator('.rv-slide-hover-stage').boundingBox(),hoverScores=await page.locator('.rv-slide-hover .rv-slide-scores').boundingBox(),tile=await page.locator('.rv-slide-card').first().boundingBox();
  assert.ok(hoverLayout.width>tile.width+100);assert.ok(hoverScores.y>=hoverLayout.y+hoverLayout.height);
  await page.locator('.rv-slide-hover-stage').click();await page.locator('.rv-page-dialog').waitFor();
  assert.equal(await page.locator('.rv-slide-hover').count(),0);
  const detailLayout=await page.locator('.rv-page-stage').boundingBox(),detailScores=await page.locator('.rv-page-score-column').boundingBox();
  assert.ok(detailScores.x>=detailLayout.x+detailLayout.width);
  pass('Hover shows the enlarged actual PPTX above evidence-linked scores; clicking opens the original with scores on its right');
  assert.equal(await page.locator('.rv-page-dialog .sv-panel').count(), 0);
  await page.getByRole('button', { name: '다음 장', exact: true }).click();
  await page.getByRole('dialog', { name: /^2장/ }).waitFor(); await page.keyboard.press('ArrowLeft'); await page.getByRole('dialog', { name: /^1장/ }).waitFor();
  await page.screenshot({ path: path.join(out, 'slide-detail.png') });
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).first().click();
  pass('Slide details show the full original with scores to its right and support arrow navigation');
  const formats = await page.evaluate(async ({ pptx, pdf }) => {
    const { parseFiles } = await import('/src/domain/review/parse.js');
    const toFile = (b64, name) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name);
    const p = await parseFiles([toFile(pptx, 'review.pptx')]);
    const d = await parseFiles([toFile(pdf, 'review.pdf')]);
    return { pptx: p.units.length, full: p.units.every(u => u.previewHtml?.includes('data-my="pptx"')), pdf: d.units.length, images: d.images.length };
  }, { pptx: fs.readFileSync(path.join(root, 'build/fixtures/review_sample.pptx')).toString('base64'), pdf: fs.readFileSync(path.join(root, 'app/tests/fixtures/strict/review-source.pdf')).toString('base64') });
  assert.equal(formats.pptx, 12); assert.ok(formats.full); assert.equal(formats.pdf, formats.images); assert.equal(formats.pdf, 12);
  pass('New PPTX reviews retain complete render HTML and PDF reviews retain every actual page image');
  const mismatch = await page.evaluate(async () => {
    const { sameReviewDocument } = await import('/src/domain/review/preview.js');
    return sameReviewDocument({ units: [{ title: '원본 제안서' }] }, { units: [{ text: '다른 제안서' }] });
  }); assert.equal(mismatch, false); pass('Unrelated source documents are rejected when restoring historical previews');
  await page.locator('.rv-radar-card').first().screenshot({ path: path.join(out, 'criteria-radar.png') });
  await page.locator('.rv-priorities').screenshot({ path: path.join(out, 'priority-grid.png') });
  for (const [width, mode] of [[900, 'light'], [390, 'light'], [1500, 'dark']]) {
    await page.setViewportSize({ width, height: 1050 }); await page.emulateMedia({ colorScheme: mode });
    await page.locator('.rv-body').evaluate(el => el.scrollTop = 0); await page.waitForTimeout(120);
    const readable = await page.locator('.rv-radar').evaluateAll(plots => plots.map(svg => {
      const box = svg.getBoundingClientRect(), scale = svg.getScreenCTM().a;
      const labels = [...svg.querySelectorAll('.rv-radar-label')].map(el => ({ ...(() => { const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}; })(), font:parseFloat(getComputedStyle(el).fontSize)*scale, name:el.textContent }));
      const collisions = [];
      for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(Math.min(labels[i].right,labels[j].right)-Math.max(labels[i].left,labels[j].left)>2&&Math.min(labels[i].bottom,labels[j].bottom)-Math.max(labels[i].top,labels[j].top)>2)collisions.push([labels[i].name,labels[j].name]);
      return { minFont:Math.min(...labels.map(x=>x.font)), clipped:labels.filter(x=>x.left<box.left-2||x.right>box.right+2||x.top<box.top-2||x.bottom>box.bottom+2).map(x=>x.name), collisions };
    }));
    for(const plot of readable){assert.ok(plot.minFont >= 13.8, 'chart label too small at '+width);assert.deepEqual(plot.clipped,[], 'clipped chart text at '+width);assert.deepEqual(plot.collisions,[], 'overlapping chart labels at '+width);}
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'viewport overflow ' + width);
    await page.getByRole('button', { name: '이렇게 읽었어요', exact: true }).click(); await page.locator('.rv-hover').waitFor();
    const pos = await page.locator('.rv-hover').boundingBox(); assert.ok(pos.x >= 0 && pos.x + pos.width <= width + 1);
    await page.keyboard.press('Escape'); await page.screenshot({ path: path.join(out, `${width}-${mode}.png`) });
  }
  pass('Tablet, phone and dark theme remain usable with bounded hover cards and no page-wide horizontal overflow');
  pass('Radar labels remain at least 14 actual pixels without clipping or overlap on phone, tablet and desktop');
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.emulateMedia({ colorScheme: 'light' });
  const pictureResult = await page.evaluate(async b64 => {
    const file = new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'different.pptx');
    const { attachReviewPreview, loadDoc } = await import('/src/repositories/reviews.js');
    let message = ''; try { await attachReviewPreview('r_demo_c', [file]); } catch (e) { message = e.message; }
    const existing = await loadDoc('r_demo_c');
    const { parseFiles } = await import('/src/domain/review/parse.js');
    const doc = await parseFiles([file]);
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { ReviewPreview, useReviewAssets } = await import('/src/components/review-report.jsx');
    const host = document.createElement('div'); host.id = 'picture-preview-test'; host.style.cssText = 'position:fixed;left:90px;top:90px;width:900px;z-index:3000'; document.body.appendChild(host);
    const mount = createRoot(host);
    function Subject() { const assets = useReviewAssets(doc); return React.createElement(ReviewPreview, { doc, unit: doc.units.find(u => /wmimg:/.test(u.previewHtml)), assets, title: '실제 이미지 포함 원본' }); }
    mount.render(React.createElement(Subject)); window.__unmountPreview = () => { mount.unmount(); host.remove(); };
    return { message, existingPages: existing.units.length, images: doc.previewImages.length };
  }, fs.readFileSync(path.join(root, 'build/fixtures/my_sample.pptx')).toString('base64'));
  assert.ok(pictureResult.message.includes('장수 또는 본문')); assert.equal(pictureResult.existingPages, 12); assert.ok(pictureResult.images > 0);
  const pictureFrame = page.locator('#picture-preview-test iframe').contentFrame();
  await pictureFrame.locator('img').first().waitFor();
  await page.waitForFunction(() => { const frame = document.querySelector('#picture-preview-test iframe'); return [...(frame?.contentDocument?.images || [])].some(im => im.complete && im.naturalWidth > 0 && im.src.startsWith('blob:')); });
  await page.locator('#picture-preview-test').screenshot({ path: path.join(out, 'embedded-picture.png') });
  await page.evaluate(() => window.__unmountPreview());
  pass('Embedded source pictures decode in the real layout; an unrelated upload cannot replace the stored original');
  // A real 81-page PDF guards against the former 80-page display limit.
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (let i = 0; i < 81; i++) { const id = objects.length + 1; kids.push(`${id} 0 R`); const text = `BT /F1 24 Tf 40 300 Td (Review page ${i + 1}) Tj ET`; objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 640 360] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`, `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`); }
  objects[1] = `<< /Type /Pages /Count 81 /Kids [${kids.join(' ')}] >>`;
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const pages = await page.evaluate(async b64 => { const { parseFiles } = await import('/src/domain/review/parse.js'); const d = await parseFiles([new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], '81-pages.pdf')]); return { units: d.units.length, images: d.images.length }; }, Buffer.from(pdf).toString('base64'));
  assert.deepEqual(pages, { units: 81, images: 81 }); pass('All 81 pages of a long PDF retain their original images instead of truncating at page 80');
  // The history/home uses the same originals as the detail screen.
  await page.locator('.rv-body').evaluate(el => el.scrollTop = 0);
  await page.getByRole('button', { name: '평가 내역', exact: true }).click();
  await page.getByRole('button', { name: '검토 평가 기준 전체 보기', exact: true }).click();
  const criteriaModal = page.getByRole('dialog', { name: '검토 점수 기준', exact: true });
  await criteriaModal.waitFor();
  assert.equal(await criteriaModal.locator('.wm-ci-g').count(), 4);
  assert.equal(await criteriaModal.locator('.wm-ci-c').count(), 24);
  const criterionNames = await criteriaModal.locator('.wm-ci-cn').allInnerTexts();
  assert.ok(criterionNames.some(n => n.includes('근거 데이터의 최신성과 출처 명시')));
  await criteriaModal.locator('.wm-ci-nav button').filter({ hasText: '완성도' }).click();
  assert.equal(await criteriaModal.locator('.wm-ci-g').count(), 1);
  assert.equal(await criteriaModal.locator('.wm-ci-c').count(), 6);
  await page.screenshot({ path: path.join(out, 'current-criteria-home.png') });
  await criteriaModal.getByRole('button', { name: '닫기', exact: true }).first().click();
  pass('Home exclamation button opens all 24 current criteria in four categories with six quality criteria');
  const homeCard = page.getByRole('button', { name: /C 베이커리.*평가 열기/ });
  await homeCard.locator('iframe').first().waitFor();
  assert.equal(await homeCard.locator('iframe').count(), 3);
  await homeCard.locator('iframe').first().scrollIntoViewIfNeeded();
  await homeCard.locator('iframe').first().contentFrame().locator('[data-my="pptx"]').waitFor();
  assert.ok((await homeCard.locator('iframe').first().contentFrame().locator('body').innerText()).includes('C 베이커리'));
  assert.equal(await page.locator('.rvh .rvh-fix,.rvh .rv-wire').count(), 0);
  assert.ok(!(await page.locator('.rvh').innerText()).includes('먼저 고칠'));
  assert.equal(await page.locator('.rvh-th-missing').count(), 6);
  await page.screenshot({ path: path.join(out, 'history-original-layouts.png') });
  pass('Review home renders three real PPTX layouts per card and removes priority text and wireframes');
  const pdfHome = await page.evaluate(async b64 => {
    const { attachReviewPreview } = await import('/src/repositories/reviews.js');
    await attachReviewPreview('r_demo_c', [new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'review.pdf')]);
    return true;
  }, fs.readFileSync(path.join(root, 'app/tests/fixtures/strict/review-source.pdf')).toString('base64'));
  assert.ok(pdfHome);
  await page.waitForFunction(() => [...document.querySelectorAll('.rvh-card')].find(el => el.textContent.includes('C 베이커리'))?.querySelectorAll('.rvh-th img').length === 3);
  assert.equal(await homeCard.locator('iframe').count(), 0);
  const pixels = await homeCard.locator('.rvh-th img').evaluateAll(images => images.every(im => im.src.startsWith('blob:')));
  assert.ok(pixels); pass('History cards refresh immediately after reconnecting an original PDF and display full page images');
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.mouse.move(width - 4, 20);
    await page.waitForTimeout(250);
    await homeCard.scrollIntoViewIfNeeded();
    const clipped = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(clipped, false);
    const bounds = await homeCard.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'history card fits the viewport');
    await page.screenshot({ path: path.join(out, `history-${width}.png`) });
  }
  pass('Real history previews remain visible without horizontal overflow on tablet and phone');
  // Synthetic display fixture only, explicitly marked as an example; no model score is fabricated in the app.
  await page.evaluate(async () => {
    const { CRITERIA } = await import('/src/domain/review/criteria.js');
    const { aggregate } = await import('/src/domain/review/analyze.js');
    const { loadDoc } = await import('/src/repositories/reviews.js');
    const doc = await loadDoc('r_demo_c');
    const list = JSON.parse(localStorage.getItem('winmate.v2.reviews'));
    const r = structuredClone(list.find(x => x.id === 'r_demo_c'));
    r.id = 'r_criteria_protocol'; r.criteriaVersion = 5; r.title = '새 기준 표시 검증 예시'; r.geom = [];
    r.sel = CRITERIA.map(c => ({ id:c.id, applied:true, why:'브라우저 표시 계약 검증용' }));
    r.results = Object.fromEntries(CRITERIA.map(c => [c.id, { score:c.id === 'DQ1' ? 50 : 100, src:'example', reason:'브라우저 표시 계약 검증용 평가 근거', fix:'브라우저 표시 계약 검증용 수정 안내', evidence:[] }]));
    r.agg = aggregate(r.sel, r.results); r.summary = { verdict:'새 기준 표시 검증 예시', summary:'실제 AI 결과가 아닌 브라우저 표시 검사 데이터입니다.', strengths:[] };
    const db = await new Promise((resolve, reject) => { const q = indexedDB.open('winmate-v2-review',1); q.onsuccess=()=>resolve(q.result); q.onerror=reject; });
    await new Promise((resolve, reject) => { const tx=db.transaction('docs','readwrite');tx.objectStore('docs').put(doc,r.id);tx.oncomplete=resolve;tx.onerror=reject; }); db.close();
    localStorage.setItem('winmate.v2.reviews', JSON.stringify([r,...list]));
    localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'review',id:r.id}}));
  });
  await page.setViewportSize({width:1500,height:1050}); await page.reload(); await page.locator('.rv-overview').waitFor();
  assert.equal(await page.locator('.rv-radar').count(),4);
  assert.equal(await page.locator('.rv-radar-target').count(),24);
  assert.equal(await page.locator('.rv-score-summary>div').count(),4);
  assert.equal(await page.locator('.rv-radar-key').count(),0);
  assert.ok(!(await page.locator('.rv-report').innerText()).includes('이전 7개 영역'));
  await page.locator('.rv-radar-card').last().screenshot({path:path.join(out,'current-quality-radar.png')});
  pass('New review reports render four categories and 24 criteria; historical reports and scores retain their original schema');
  // Existing proposal layouts, not files, are the source when a review has a link.
  const linked = await page.evaluate(async () => {
    const { myMeta, saveTemplates } = await import('/src/repositories/templates.js');
    const { putImage } = await import('/src/repositories/proposals.js');
    const green = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#0c866f"/></svg>');
    const image = await putImage(green);
    const cover = 'L_MY_REVIEW_LINK_COVER', body = 'L_MY_REVIEW_LINK_BODY';
    const html = '<div style="width:1280px;height:720px;position:relative;background:#112555;color:white;font-family:sans-serif"><div data-tb="0" style="position:absolute;left:70px;top:75px;font-size:48px">저장된 제목</div><div data-img="0" style="position:absolute;left:70px;top:230px;width:400px;height:240px"></div></div>';
    await saveTemplates([{ meta:myMeta({f:cover,name:'표지 · 연결 검증',p:'cover',kind:'edit'}),html },{ meta:myMeta({f:body,name:'본문 · 연결 검증',p:'products',kind:'edit'}),html }]);
    const make = (uid, text, f = body) => ({ uid, f, status:'done', ov:{ t:{0:text}, img:{0:{src:image,name:'저장된 초록 이미지'}} } });
    const common = { customer:'연결 검증 고객',createdAt:Date.now(),updatedAt:Date.now(),stage:'story',req:{free:[],form:{keymen:[]},files:[]},ctx:{products:[],solutions:[],cases:[]} };
    const first = { ...common,id:'p_review_linked',title:'연결된 실제 제안서',parts:[{id:'body-part',name:'본문',type:'products',layouts:Array.from({length:13},(_,i)=>make('linked-'+i,'연결된 본문 '+(i+1)))},{id:'cover-part',name:'표지',type:'cover',layouts:[make('linked-cover','연결된 제안서 표지',cover)]}] };
    const second = { ...common,id:'p_review_alternative',title:'다른 연결 제안서',parts:[{id:'alternative-part',name:'본문',type:'products',layouts:[make('alternative-sheet','선택한 다른 제안서의 장표')]}] };
    const empty = { ...common,id:'p_review_empty',title:'레이아웃이 없는 제안서',parts:[] };
    localStorage.setItem('winmate.v2.proposals',JSON.stringify([first,second,empty]));
    const list = JSON.parse(localStorage.getItem('winmate.v2.reviews'));
    const review = list.find(r=>r.id==='r_criteria_protocol');review.settings={...review.settings,linkedId:first.id};
    localStorage.setItem('winmate.v2.reviews',JSON.stringify(list));
    return { first:first.id,second:second.id,empty:empty.id,green,scores:JSON.stringify([review.agg,review.results]) };
  });
  await page.reload(); await page.locator('.rv-deck .slide').first().waitFor();
  assert.equal(await page.locator('.rv-slide-card').count(),14);
  assert.equal(await page.locator('.rv-deck .rv-original-preview>img,.rv-deck iframe').count(),0);
  const cover = page.locator('.rv-slide-card').first();
  await cover.locator('.slide-inner [data-tb="0"]').waitFor();
  assert.equal(await cover.locator('[data-tb="0"]').innerText(),'연결된 제안서 표지');
  assert.equal(await cover.locator('img').getAttribute('src'),linked.green);
  assert.equal(await page.getByRole('button',{name:'원본 연결',exact:true}).count(),0);
  pass('A linked proposal takes priority over an uploaded PDF and uses all 14 real layouts in cover-first order');
  // Remove the old upload completely: the link must still work after a reload.
  await page.evaluate(async()=>{const db=await new Promise(resolve=>{const q=indexedDB.open('winmate-v2-review',1);q.onsuccess=()=>resolve(q.result);});await new Promise(resolve=>{const tx=db.transaction('docs','readwrite');tx.objectStore('docs').delete('r_criteria_protocol');tx.oncomplete=resolve;});db.close();});
  await page.reload();await page.locator('.rv-deck .slide').first().waitFor();
  assert.equal(await page.locator('.rv-slide-card').count(),14);
  const last = page.locator('.rv-slide-card').last(); await last.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.querySelectorAll('.rv-deck .slide-inner [data-tb="0"]')].some(el=>el.textContent==='연결된 본문 13'));
  await last.click();await page.getByRole('dialog',{name:/^14장/}).waitFor();
  await page.getByRole('button',{name:'이전 장',exact:true}).click();await page.getByRole('dialog',{name:/^13장/}).waitFor();
  await page.keyboard.press('ArrowRight');await page.getByRole('dialog',{name:/^14장/}).waitFor();
  await page.getByRole('dialog').locator('.slide-inner [data-tb="0"]').waitFor();
  assert.equal(await page.getByRole('dialog').locator('[data-tb="0"]').innerText(),'연결된 본문 13');
  pass('Linked layouts and navigation work without any uploaded document, including pages beyond the old review count');
  await page.evaluate(async()=>{const p=await import('/src/repositories/proposals.js');p.update('p_review_linked',r=>{r.parts.find(s=>s.id==='body-part').layouts[12].ov.t[0]='현재 제안서에서 수정한 문구';});});
  await page.waitForFunction(()=>document.querySelector('.rv-page-dialog [data-tb="0"]')?.textContent==='현재 제안서에서 수정한 문구');
  await page.screenshot({path:path.join(out,'linked-proposal-detail.png')});
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).first().click();
  pass('Read-only review previews reflect the linked proposal’s actual saved text and images immediately');
  await page.getByLabel('장표를 보여줄 제안서',{exact:true}).selectOption(linked.second);
  await page.waitForFunction(()=>document.querySelectorAll('.rv-slide-card').length===1);
  assert.equal(await page.locator('.rv-deck [data-tb="0"]').innerText(),'선택한 다른 제안서의 장표');
  await page.waitForTimeout(450);await page.reload();await page.locator('.rv-deck .slide').waitFor();
  assert.equal(await page.getByLabel('장표를 보여줄 제안서',{exact:true}).inputValue(),linked.second);
  const preserved = await page.evaluate(()=>{const r=JSON.parse(localStorage.getItem('winmate.v2.reviews')).find(r=>r.id==='r_criteria_protocol');return JSON.stringify([r.agg,r.results]);});
  assert.equal(preserved,linked.scores);
  await page.locator('.rv-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'linked-proposal-overview.png')});
  pass('A proposal can be connected directly without reupload or rescoring, and the selected link persists on reload');
  await page.getByRole('button',{name:'평가 내역',exact:true}).click();
  const linkedCard=page.getByRole('button',{name:'새 기준 표시 검증 예시 평가 열기',exact:true});
  await linkedCard.locator('.slide-inner [data-tb="0"]').waitFor();
  assert.equal(await linkedCard.locator('.slide').count(),1);
  assert.equal(await linkedCard.locator('[data-tb="0"]').innerText(),'선택한 다른 제안서의 장표');
  await linkedCard.click();await page.locator('.rv-deck .slide').waitFor();
  pass('Review home thumbnails and detail share the same linked proposal source');
  await page.evaluate(async()=>{const p=await import('/src/repositories/proposals.js');p.deleteProposal('p_review_alternative');});
  await page.getByText('연결된 제안서를 찾지 못했어요. 다른 제안서를 선택해 주세요.',{exact:true}).waitFor();
  await page.getByLabel('장표를 보여줄 제안서',{exact:true}).selectOption(linked.empty);
  await page.getByText('이 제안서에 저장된 레이아웃이 없어요.',{exact:true}).waitFor();
  assert.equal(await page.locator('.rv-slide-card').count(),0);
  pass('Missing or empty linked proposals have explicit recovery states instead of an empty or broken slide viewer');
  assert.deepEqual(errors, []); pass('No browser runtime errors; all model network access is blocked');
} catch (error) {
  await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  if (page && errors.length) fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify(errors, null, 2));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed, errors }, null, 2));
  await browser?.close(); await vite.close();
}
