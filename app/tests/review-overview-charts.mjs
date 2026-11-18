// Review overview: category scores carry their criteria spider charts (4 → 2 → 1 columns),
// axis labels are short unique names with the full name on hover, and "먼저 고칠 것" follows the overview.
// Real repository initialization and native rendering; never invokes a model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const bundle = read('app/web/src/domain/review/linked-review-examples.json');
const previous = read('app/web/src/domain/review/linked-review-examples-v2.json');
const legacy = read('app/web/src/domain/review/sample-reviews.json');
const boot = { catalog: read('app/data/catalog.json'), products: read('app/data/products_db.json'), images: read('app/data/images.json'), capabilities: null, user: { username: 'admin', auth_enabled: true } };
const out = path.join(root, 'app/tests/output/review-overview-charts'); fs.mkdirSync(out, { recursive: true });
const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const passed = [], errors = []; let browser, page;
const pass = s => { passed.push(s); console.log('PASS ' + s); };
const overlap = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
async function contextFor(seed = {}) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (u.pathname === '/api/auth/status') return route.fulfill({ json: { enabled: false, configured: true, authenticated: true } });
    if (u.pathname.startsWith('/api/product-packs/')) return route.fulfill({ json: read('reference/live/img/prod/d00.json') });
    if (u.pathname === '/api/storyboards') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: { code: 'overview_chart_test_no_model' } });
  });
  await context.route(url => ['/img/', '/lib/', '/fonts/'].some(p => url.pathname.startsWith(p)), route => {
    const u = new URL(route.request().url()), rel = decodeURIComponent(u.pathname).slice(1);
    const file = path.join(root, u.pathname.startsWith('/fonts/') ? 'app/web/public' : 'app/data/static', rel);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
  });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  await context.addInitScript(seed => {
    if (!localStorage.getItem('overview-test-initialized')) {
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'reviews' } }));
      localStorage.setItem('overview-test-initialized', '1');
    }
  }, seed);
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + vite.httpServer.address().port);
  await page.getByRole('heading', { name: '제안서 검토', exact: true }).waitFor();
  return context;
}
async function openReview(title) {
  await page.getByRole('button', { name: title + ' 평가 열기', exact: true }).click();
  await page.locator('.rv-overview .rv-radar').first().waitFor();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
}
// Short label, full name and geometry of every axis label on the page.
const chartState = () => page.locator('.rv-radar').evaluateAll(plots => plots.map(svg => {
  const box = svg.getBoundingClientRect(), scale = svg.getScreenCTM().a;
  const labels = [...svg.querySelectorAll('.rv-radar-target')].map(g => {
    const el = g.querySelector('.rv-radar-label'), r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, font: parseFloat(getComputedStyle(el).fontSize) * scale, name: [...el.querySelectorAll('tspan')].map(t => t.textContent).join(' ').replaceAll('· ', '·'), full: g.getAttribute('aria-label') };
  });
  const collisions = [];
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (Math.min(labels[i].right, labels[j].right) - Math.max(labels[i].left, labels[j].left) > 2 && Math.min(labels[i].bottom, labels[j].bottom) - Math.max(labels[i].top, labels[j].top) > 2) collisions.push([labels[i].name, labels[j].name]);
  const cell = svg.closest('.rv-score-cat'), value = cell?.querySelector('.rv-score-value').getBoundingClientRect();
  return { labels, collisions, height: box.height, left: Math.round(box.left), top: Math.round(box.top), belowScore: !!value && box.top >= value.bottom - 1,
    clipped: labels.filter(l => l.left < box.left - 2 || l.right > box.right + 2 || l.top < box.top - 2 || l.bottom > box.bottom + 2).map(l => l.name) };
}));
async function checkCharts(width, expectedColumns, cats) {
  await page.setViewportSize({ width, height: 1050 }); await page.waitForTimeout(250);
  const plots = await chartState();
  assert.equal(plots.length, cats, 'one chart per category at ' + width);
  assert.ok(plots.every(p => p.belowScore), 'each chart sits below its category score at ' + width);
  assert.equal(new Set(plots.map(p => p.left)).size, expectedColumns, `${expectedColumns} columns at ${width}px`);
  assert.equal(new Set(plots.map(p => Math.round(p.height))).size, 1, 'charts of one rubric share one size at ' + width);
  for (const plot of plots) {
    assert.ok(Math.min(...plot.labels.map(l => l.font)) >= 13.8, 'chart label too small at ' + width);
    assert.deepEqual(plot.clipped, [], 'clipped chart label at ' + width);
    assert.deepEqual(plot.collisions, [], 'overlapping chart labels at ' + width);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'page overflow at ' + width);
  return plots;
}
async function checkHover(width, inline) {
  const charts = await page.locator('.rv-radar').all();
  for (const chart of charts) {
    const target = chart.locator('.rv-radar-target').last();
    await page.evaluate(() => document.activeElement?.blur()); await target.scrollIntoViewIfNeeded(); await target.focus();
    const card = page.locator('.rv-hover-outside'); await card.waitFor();
    const full = (await target.getAttribute('aria-label')).replace(/ (미평가|[\d.]+점)$/, '');
    assert.equal(await card.locator('h4').innerText(), full, 'hover shows the full criterion name');
    const a = await chart.boundingBox(), b = await card.boundingBox();
    assert.ok(!overlap(a, b), 'hover covers its chart at ' + width);
    assert.ok(b.x >= 0 && b.x + b.width <= width + 1, 'hover leaves the viewport at ' + width);
    if (inline) assert.equal(await card.locator('xpath=..').getAttribute('class'), 'rv-radar-detail-slot');
    if (chart === charts[0]) await page.screenshot({ animations: 'disabled', path: path.join(out, `hover-${width}.png`) });
    await page.keyboard.press('Escape'); await card.waitFor({ state: 'detached' });
  }
}
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  let context = await contextFor();
  await page.waitForFunction(() => document.querySelectorAll('.rvh-thumbs .slide').length === 9);
  const e = bundle.examples[0];
  await openReview(e.review.title);
  const order = await page.locator('.rv-report').evaluate(el => [...el.children].map(c => c.classList.contains('rv-overview') ? 'overview' : c.classList.contains('rv-priorities') ? 'priorities' : c.classList.contains('rv-deck') ? 'deck' : c.className).filter(Boolean));
  assert.deepEqual(order.slice(0, 3), ['overview', 'priorities', 'deck']);
  assert.equal(await page.locator('.rv-radar-section').count(), 0);
  assert.equal(await page.getByRole('heading', { name: '기준별 평가', exact: true }).count(), 0);
  pass('The separate 기준별 평가 section is gone and 먼저 고칠 것 follows the 종합평 directly');
  assert.equal(await page.locator('.rv-overview .rv-score-cat').count(), 4);
  assert.equal(await page.locator('.rv-overview .rv-score-cat .rv-radar').count(), 4);
  assert.equal(await page.locator('.rv-radar-target').count(), 24);
  const scores = await page.locator('.rv-score-value>b').allInnerTexts();
  assert.deepEqual(scores, ['CU', 'PR', 'VS', 'DQ'].map(id => String(e.review.agg.cats[id] ?? '—')));
  pass('Each of the four category scores in the overview carries its own six-criterion spider chart');
  const desktop = await checkCharts(1500, 4, 4);
  const labels = desktop.flatMap(p => p.labels);
  assert.equal(new Set(labels.map(l => l.name)).size, 24, 'short labels are unique');
  for (const l of labels) {
    const full = l.full.replace(/ (미평가|[\d.]+점)$/, '');
    assert.ok(l.name.length < full.length || l.name === full, 'label is shorter than ' + full);
    for (const word of l.name.split(/[\s·]+/)) assert.ok(full.includes(word), `${l.name} → ${full}`);
  }
  await page.locator('.rv-overview').screenshot({ animations: 'disabled', path: path.join(out, 'overview-1500.png') });
  pass('Desktop: four columns, unique short axis labels taken from the full names, ≥14px, no clipping or overlap');
  await checkHover(1500, false);
  pass('Hovering or focusing a vertex shows the full criterion name beside the chart without covering it');
  for (const [width, columns] of [[1100, 2], [900, 2], [390, 1]]) {
    await checkCharts(width, columns, 4);
    await page.locator('.rv-overview').screenshot({ animations: 'disabled', path: path.join(out, `overview-${width}.png`) });
    await checkHover(width, width === 390);
  }
  pass('Narrower windows switch to two columns (one on phones) with readable labels and hover details');
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(150);
  await page.locator('.rv-overview').screenshot({ animations: 'disabled', path: path.join(out, 'overview-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await context.close();

  const prior = structuredClone(previous.examples); prior[0].review.title += ' 사용자 수정';
  context = await contextFor({ 'winmate.v2.reviews': prior.map(x => x.review), 'winmate.v2.proposals': prior.map(x => x.proposal), 'winmate.v2.reviews.seedv': 'admin-linked-review-examples-2' });
  await openReview(prior[0].review.title);
  assert.equal(await page.locator('.rv-overview .rv-score-cat').count(), 5);
  assert.equal(await page.locator('.rv-radar-target').count(), 26);
  await checkCharts(1500, 4, 5); await checkCharts(900, 2, 5);
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.locator('.rv-overview').screenshot({ animations: 'disabled', path: path.join(out, 'overview-v2.png') });
  await context.close();
  context = await contextFor({ 'winmate.v2.reviews': legacy.reviews.map(r => ({ ...r, title: r.title + ' 기존 기록' })), 'winmate.v2.reviews.seedv': `admin-linked-review-examples-${bundle.version}` });
  await openReview(legacy.reviews.find(r => r.id === 'r_demo_c').title + ' 기존 기록');
  assert.equal(await page.locator('.rv-overview .rv-score-cat').count(), 7);
  await checkCharts(1500, 4, 7); await checkCharts(900, 2, 7); await checkCharts(390, 1, 7);
  await page.setViewportSize({ width: 1500, height: 1050 });
  await page.locator('.rv-overview').screenshot({ animations: 'disabled', path: path.join(out, 'overview-v1.png') });
  await context.close();
  pass('Older 5-area and 7-area rubrics (up to 10 criteria per chart) lay out without clipping or overlapping labels');
  assert.deepEqual(errors, []);
} catch (error) {
  await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
  errors.push(error.stack || error.message); console.error(error); process.exitCode = 1;
} finally {
  await browser?.close(); await vite.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed, errors }, null, 2));
}
