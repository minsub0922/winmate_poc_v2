// Strict deterministic functional contracts in a real browser — no model calls, no production dummy switches.
//
//   group 'catalog'        10 mixed catalog data-contract cases (solutions · cases · industries · scenarios · layouts)
//   group 'pptx'           10 render → real PPTX export → zip inspection → import-restore cases, all different layouts
//   group 'pptx-negative'  malformed / non-PPTX inputs to the import module (counted separately, minimum 5)
//   group 'repository'     browser repositories + backup/restore (segments, links, Blob IDB templates, review doc, sims,
//                          favourites, export format, import validation, additive restore, separate-origin restore)
//
// Needs the API/app server (WINMATE_TEST_URL, default http://127.0.0.1:8788; an isolated WINMATE_AUTH=off server is simplest,
// otherwise WINMATE_TEST_PASSWORD). A Vite dev server is started in-process on WINMATE_STRICT_VITE_PORT (5199) unless
// WINMATE_VITE_URL is given, so /src modules are imported into the running app (same module instances).
//
//   node app/tests/functional-contracts.mjs                     # all groups
//   node app/tests/functional-contracts.mjs pptx repository     # selected groups
//
// Reports: app/tests/output/strict/<group>.json. Exit code 1 when any case fails or a group is under its minimum.
import fs from 'node:fs';
import path from 'node:path';
import {
  launch, startVite, isolatedContext, openApp, waitApp, suite, ok, eq, CheckFailed, fixtures, inspectPptx, runsOf,
  readIdb, localJson, otherOrigin, outDir, JSZip, sleep, login, injectHelpers,
} from './fixtures/strict/harness.mjs';

const FILE = 'app/tests/functional-contracts.mjs';
const GROUPS = ['catalog', 'pptx', 'pptx-negative', 'repository'];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : GROUPS;
for (const g of wanted) if (!GROUPS.includes(g)) { console.error('unknown group ' + g + ' — available: ' + GROUPS.join(', ')); process.exit(2); }

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const pptxDir = path.join(outDir, 'pptx'); fs.mkdirSync(pptxDir, { recursive: true });

let vite = null, browser = null, globalSetupError = '';
try { vite = await startVite(); browser = await launch(); } catch (e) { globalSetupError = e.message; }

const contexts = [];
async function fresh(base = vite.url) {
  const context = await isolatedContext(browser, base);
  contexts.push(context);
  const page = await openApp(context, base);
  return { context, page };
}
async function closeAll() { while (contexts.length) await contexts.pop().close().catch(() => {}); }
const blockedTotals = () => contexts.reduce((a, c) => a.concat(c.strictBlocked || []), []);
const reports = [];

// ====================================================================== catalog
if (wanted.includes('catalog')) {
  const cat = suite('catalog', FILE);
  let page = null, setupError = globalSetupError;
  if (!setupError) try { ({ page } = await fresh()); } catch (e) { setupError = e.message; }
  const inPage = (fn, arg) => page.evaluate(fn, arg);

  cat.case('C01', 'collection sizes: 17 solutions · 218 cases · 82 scenarios · 596 active layouts · 1068 products', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js'); const s = await import('/src/domain/templates/scenarios.js');
      const b = (await import('/src/api/bootstrap.js')).getBootstrap();
      return { solutions: c.SOLUTIONS.length, cases: c.CASES.length, scenarios: s.SCENARIOS.length, active: c.LAYOUTS.length, all: c.ALL_LAYOUTS.length,
        products: c.PRODUCTS.length, industries: c.INDUSTRIES.length,
        boot: { solutions: b.catalog.solutions.length, cases: b.catalog.cases.length, industries: b.catalog.industries.length } };
    });
    Object.assign(d, r);
    eq(r.solutions, 17, 'solutions'); eq(r.cases, 218, 'cases'); eq(r.scenarios, 82, 'Best Scenarios'); eq(r.active, 596, 'active layouts'); eq(r.products, 1068, 'products');
    eq(r.boot.solutions, r.solutions, 'bootstrap solutions'); eq(r.boot.cases, r.cases, 'bootstrap cases'); eq(r.boot.industries, r.industries, 'bootstrap industries');
    ok(r.industries > 0 && r.all > r.active, 'industries present and retired layouts excluded from the active list');
  });

  cat.case('C02', 'identifiers are unique per collection and refInfo round-trips the first 10 of each', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js'); const s = await import('/src/domain/templates/scenarios.js');
      const dup = (xs) => { const seen = new Set(), out = []; for (const x of xs) { if (seen.has(x)) out.push(x); seen.add(x); } return out; };
      const round = (type, ids) => ids.slice(0, 10).filter((id) => { const i = c.refInfo(type + ':' + id); return !i || i.id !== String(id) || i.type !== type; });
      return {
        dups: { solutions: dup(c.SOLUTIONS.map((x) => x.id)), cases: dup(c.CASES.map((x) => String(x.id))), products: dup(c.PRODUCTS.map((x) => x.id)),
          layouts: dup(c.ALL_LAYOUTS.map((x) => x.f)), scenarios: dup(s.SCENARIOS.map((x) => x.id)), industries: dup(c.INDUSTRIES.map((x) => x.code)) },
        badRefs: { product: round('product', c.PRODUCTS.map((x) => x.id)), solution: round('solution', c.SOLUTIONS.map((x) => x.id)), case: round('case', c.CASES.map((x) => String(x.id))) },
        unknownRef: c.refInfo('product:not-a-product'),
      };
    });
    Object.assign(d, r);
    for (const [k, v] of Object.entries(r.dups)) eq(v, [], 'duplicate ' + k + ' ids');
    for (const [k, v] of Object.entries(r.badRefs)) eq(v, [], 'refInfo round trip for ' + k);
    ok(r.unknownRef==null,'unknown ref resolves to an absent value');
  });

  cat.case('C03', 'solutions: first 10 by id carry name/cat/keywords and resolvable industry, product and image refs', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js');
      const imgs = new Set(c.IMAGE_DB.map((x) => x.pid));
      const check = (s) => {
        const p = [];
        if (!s.name) p.push('name'); if (!s.cat) p.push('cat'); if (!Array.isArray(s.kw) || !s.kw.length) p.push('kw');
        for (const i of s.ind || []) if (!c.IND[i]) p.push('ind:' + i);
        for (const w of s.with || []) if (!c.P[w]) p.push('with:' + w);
        if (s.img && !imgs.has(s.img)) p.push('img:' + s.img);
        const info = c.refInfo('solution:' + s.id); if (!info || info.label !== s.name) p.push('refInfo');
        return p;
      };
      const list = [...c.SOLUTIONS].sort((a, b) => a.id.localeCompare(b.id));
      return { first10: list.slice(0, 10).map((s) => ({ id: s.id, problems: check(s) })), others: list.slice(10).map((s) => ({ id: s.id, problems: check(s) })).filter((x) => x.problems.length) };
    });
    d.first10 = r.first10.map((x) => x.id);
    eq(r.first10.length, 10, 'solutions checked');
    eq(r.first10.filter((x) => x.problems.length), [], 'problems in the first 10 solutions');
    eq(r.others, [], 'problems in the remaining solutions');
  });

  cat.case('C04', 'cases: newest 10 have customer, title, ISO date, https url and a known industry; all industries known', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js');
      const check = (x) => {
        const p = [];
        if (!x.cust) p.push('cust'); if (!x.title) p.push('title');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') || Number.isNaN(Date.parse(x.date))) p.push('date:' + x.date);
        if (!/^https:\/\//.test(x.url || '')) p.push('url');
        if (x.ind!=null && !c.IND[x.ind]) p.push('ind:' + x.ind);
        const info = c.refInfo('case:' + x.id); if (!info || info.label !== x.cust) p.push('refInfo');
        return p;
      };
      const newest = [...c.CASES].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(a.id) - Number(b.id)).slice(0, 10);
      return { newest: newest.map((x) => ({ id: x.id, date: x.date, problems: check(x) })), unknownInd: c.CASES.filter((x) => x.ind!=null && !c.IND[x.ind]).map((x) => [x.id, x.ind]),
        badDates: c.CASES.filter((x) => x.date && !/^\d{4}-\d{2}-\d{2}$/.test(x.date)).map((x) => x.id) };
    });
    d.newest = r.newest.map((x) => x.id);
    eq(r.newest.length, 10, 'cases checked');
    eq(r.newest.filter((x) => x.problems.length), [], 'problems in the newest 10 cases');
    eq(r.unknownInd, [], 'cases with an unknown industry');
    eq(r.badDates, [], 'cases with malformed dates');
  });

  cat.case('C05', 'industries: unique codes and names; every industry referenced by data exists', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js'); const s = await import('/src/domain/templates/scenarios.js');
      const refs = new Map();
      const add = (code, from) => { if (code && !c.IND[code]) refs.set(code, (refs.get(code) || []).concat(from).slice(0, 3)); };
      for (const x of c.SOLUTIONS) for (const i of x.ind || []) add(i, 'solution:' + x.id);
      for (const x of s.SCENARIOS) add(x.ind, 'scenario:' + x.id);
      for (const x of c.PRODUCTS) for (const i of x.ind || []) add(i, 'product:' + x.id);
      return { codes: c.INDUSTRIES.map((x) => x.code), unnamed: c.INDUSTRIES.filter((x) => !x.name).map((x) => x.code), unknown: [...refs.entries()],
        badCounts: c.INDUSTRIES.filter((x) => x.cases != null && !(Number.isInteger(x.cases) && x.cases >= 0)).map((x) => x.code) };
    });
    d.codes = r.codes;
    eq(new Set(r.codes).size, r.codes.length, 'unique industry codes');
    eq(r.unnamed, [], 'industries without a name');
    eq(r.unknown, [], 'references to unknown industries');
    eq(r.badCounts, [], 'industries with a malformed case count');
  });

  cat.case('C06', 'Best Scenarios: requirement type, strategy, ending, industry and stage keys are known values', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js'); const s = await import('/src/domain/templates/scenarios.js');
      return s.SCENARIOS.map((x) => {
        const p = [];
        if (!s.REQ_TYPES[x.req]) p.push('req:' + x.req); if (!s.STRATEGIES[x.strategy]) p.push('strategy:' + x.strategy);
        if (!s.ENDINGS[x.ending]) p.push('ending:' + x.ending); if (x.ind && !c.IND[x.ind]) p.push('ind:' + x.ind);
        if (!x.title || !Array.isArray(x.flow) || !x.flow.length) p.push('title/flow');
        for (const g of x.flow || []) if (!s.STAGES[g.key]) p.push('stage:' + g.key);
        if (s.slidesOfScenario(x).length < 3) p.push('slides<3');
        return { id: x.id, problems: p };
      });
    });
    d.checked = r.length;
    eq(r.length, 82, 'scenarios checked');
    eq(r.filter((x) => x.problems.length), [], 'scenario enum problems');
  });

  cat.case('C07', 'Best Scenarios: every slide layout, product, solution and case reference resolves', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js'); const s = await import('/src/domain/templates/scenarios.js');
      const out = []; let slides = 0;
      for (const x of s.SCENARIOS) {
        const p = [];
        for (const sl of s.slidesOfScenario(x)) { slides++; if (!c.L[sl.f]) p.push('layout:' + sl.f); else if (!c.layoutHtml(sl.f)) p.push('html:' + sl.f); }
        for (const id of x.products || []) if (!c.P[id]) p.push('product:' + id);
        for (const id of x.solutions || []) if (!c.S[id]) p.push('solution:' + id);
        for (const id of x.cases || []) if (!c.C[String(id)]) p.push('case:' + id);
        if (p.length) out.push({ id: x.id, problems: p.slice(0, 8) });
      }
      return { slides, problems: out };
    });
    d.slides = r.slides;
    ok(r.slides >= 22 * 3, 'scenario slides counted');
    eq(r.problems, [], 'unresolved scenario references');
  });

  cat.case('C08', 'layouts: unique f, known canvas and part, retired layouts point at active replacements', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js'); const parts = (await import('/src/domain/proposals/parts.js')).PARTS;
      const bad = [];
      for (const l of c.LAYOUTS) {
        if (!c.CANVAS[l.c]) bad.push(l.f + ' canvas ' + l.c);
        if (l.p && !parts[l.p]) bad.push(l.f + ' part ' + l.p);
        if (!l.name) bad.push(l.f + ' name');
      }
      const retired = Object.entries(c.RETIRED).filter(([f]) => c.L[f]).map(([f, to]) => ({ f, to, ok: !!c.L[to] && !c.L[to].retired && c.LAYOUTS.includes(c.L[to]) && !c.LAYOUTS.includes(c.L[f]) }));
      return { bad, retired: retired.filter((x) => !x.ok), retiredCount: retired.length, noPart: c.LAYOUTS.filter((l) => !l.p).length };
    });
    Object.assign(d, { retiredCount: r.retiredCount, noPart: r.noPart });
    eq(r.bad, [], 'layout metadata problems');
    eq(r.retired, [], 'retired layouts without an active replacement');
    ok(r.retiredCount > 0, 'retired mapping is exercised');
  });

  cat.case('C09', 'layout HTML: 10 layouts from different canvases render at 1280×720 with unique text-block indexes', async (d) => {
    const picks = await inPage((n) => window.__strict.pickLayouts(n), 10);
    eq(picks.length, 10, 'layouts picked');
    d.layouts = picks.map((l) => l.f + ' (' + l.c + '/' + l.p + ')');
    ok(new Set(picks.map((l) => l.c)).size >= 5, 'at least five canvases represented');
    for (const l of picks) {
      const shown = await inPage(([f]) => window.__strict.render(f, { t: {}, img: {} }), [l.f]);
      ok(shown.ok, l.f + ': ' + shown.reason);
      ok(Math.abs(shown.w - 1280) < 1 && Math.abs(shown.h - 720) < 1, `${l.f} rendered ${shown.w}×${shown.h}`);
      eq(new Set(shown.tbIndexes).size, shown.tbIndexes.length, l.f + ' unique data-tb indexes');
      ok(shown.tbIndexes.every((i) => /^\d+$/.test(i)), l.f + ' numeric data-tb indexes');
      ok(shown.texts.filter(Boolean).length >= 2, l.f + ' has readable text blocks');
    }
  });

  cat.case('C10', 'layout references: products, solutions, industries and photo/text twins resolve for all active layouts', async (d) => {
    const r = await inPage(async () => {
      const c = await import('/src/services/catalog.js');
      const bad = [];
      for (const l of c.LAYOUTS) {
        for (const id of Array.isArray(l.prods) ? l.prods : []) if (!c.P[id]) bad.push(l.f + ' product ' + id);
        for (const id of Array.isArray(l.sols) ? l.sols : []) if (!c.S[id]) bad.push(l.f + ' solution ' + id);
        if (l.ind && !c.IND[l.ind]) bad.push(l.f + ' industry ' + l.ind);
        for (const f of l.pv || []) if (!c.L[f]) bad.push(l.f + ' twin ' + f);
      }
      for (const [f, list] of Object.entries(c.PHOTO_OF)) for (const x of list) if (!c.L[x]) bad.push(f + ' photo twin ' + x);
      const withRefs = c.LAYOUTS.filter((l) => (l.prods || []).length || (l.sols || []).length).length;
      return { bad: bad.slice(0, 30), nBad: bad.length, withRefs };
    });
    d.withRefs = r.withRefs; d.nBad = r.nBad;
    ok(r.withRefs > 0, 'some layouts reference products or solutions');
    eq(r.bad, [], 'unresolved layout references');
  });

  reports.push(await cat.run(setupError));
  await closeAll();
}

// ====================================================================== pptx
const pptxState = { firstB64: null, imageCases: 0, bgCases: 0, layouts: [] };
if (wanted.includes('pptx') || wanted.includes('pptx-negative')) {
  let page = null, setupError = globalSetupError, picks = [], meta = {};
  if (!setupError) try {
    ({ page } = await fresh());
    picks = await page.evaluate((n) => window.__strict.pickLayouts(n), 11);
    ok(picks.length === 11, `need 11 distinct usable layouts, found ${picks.length}`);
    for (const l of picks) {
      const shown = await page.evaluate(([f]) => window.__strict.render(f, { t: {}, img: {} }), [l.f]);
      meta[l.f] = { slot: (shown.slots || []).find((s) => s.w >= 24 && s.h >= 24) || null };
    }
  } catch (e) { setupError = e.message; }
  const colors = fixtures.pngColors;

  async function roundtrip(n, layout, { html = false, bg = false } = {}, d) {
    const id = String(n).padStart(2, '0');
    const blocks = await page.evaluate((f) => window.__strict.visibleBlocks(f), layout.f);
    ok(blocks.length >= 2, layout.f + ' has fewer than two visible text blocks');
    const sorted = [...blocks].sort((a, b) => b.fs - a.fs || a.i - b.i);
    const A = sorted[0], B = sorted.find((b) => b.i !== A.i);
    const mA = `WMSTRICT${id}A`, mB = `WMSTRICT${id}B`;
    const ov = { t: { [A.i]: mA + ' 제목 교체', [B.i]: html ? { html: `<b>${mB}</b> 굵게 본문` } : mB + ' 본문 교체' }, img: {} };
    let png = null, bgPng = null;
    const slot = meta[layout.f] && meta[layout.f].slot;
    if (slot) {
      png = await page.evaluate(([c, l]) => window.__strict.makePng(c, 64, 36, l), [colors[n % colors.length], id]);
      ov.img[slot.i] = { src: png.dataUrl, name: 'strict ' + id };
      pptxState.imageCases++;
    }
    if (bg) {
      bgPng = await page.evaluate(([c]) => window.__strict.makePng(c, 128, 72, 'BG'), [colors[(n + 5) % colors.length]]);
      ov.bg = { src: bgPng.dataUrl, theme: 'strict' };
    }
    const shown = await page.evaluate(([f, ov, n]) => window.__strict.render(f, ov, n), [layout.f, ov, n]);
    ok(shown.ok, shown.reason);
    ok(Math.abs(shown.w - 1280) < 1 && Math.abs(shown.h - 720) < 1, `rendered ${shown.w}×${shown.h}, expected 1280×720`);
    ok(shown.allText.includes(mA) && shown.allText.includes(mB), 'text overrides rendered in the 1280×720 HTML');
    const exp = await page.evaluate(([slides]) => window.__strict.exportDeck(slides, { title: 'WMSTRICT PPTX' }), [[{ f: layout.f, ov, part: layout.p, name: layout.name }]]);
    fs.writeFileSync(path.join(pptxDir, `P${id}-${layout.f}.pptx`), Buffer.from(exp.b64, 'base64'));
    const z = await inspectPptx(exp.b64);
    eq(z.slides.length, 1, 'exported slide count');
    ok(/<p:sldSz\b[^>]*cx="12192000"[^>]*cy="6858000"/.test(z.presentation), 'wide 16:9 slide size in presentation.xml');
    ok(/presentationml\.slide\+xml/.test(z.contentTypes), 'slide content type registered');
    const runs = runsOf(z.slides[0]);
    const rA = runs.find((r) => r.text.includes(mA)), rB = runs.find((r) => r.text.includes(mB));
    ok(rA, mA + ' is not an editable text run'); ok(rB, mB + ' is not an editable text run');
    if (html) ok(rB.bold, 'inline <b> override exported as a bold run');
    ok(z.notes.some((x) => x.includes(xmlEscape(layout.name))), 'speaker notes carry the layout name');
    if (png) ok(z.media.some((m) => m.sha === png.sha), 'override picture embedded byte-for-byte');
    if (bg && shown.bg) {
      // Background export now crops and applies the preview effects before JPEG
      // encoding, so the source PNG is intentionally not embedded byte-for-byte.
      const expectedBg = await page.evaluate(async ([f, ov]) => {
        const { renderBackgroundCanvas, readBackgroundEffects } = await import('/src/services/background-effects.js');
        const { layoutHtml } = await import('/src/services/catalog.js');
        const { applyOverrides } = await import('/src/domain/slides/Slide.jsx');
        const host = document.createElement('div'); host.innerHTML = layoutHtml(f); document.body.appendChild(host);
        try {
          const root = host.firstElementChild; applyOverrides(root, ov);
          const canvas = await renderBackgroundCanvas(root.getAttribute('data-bg'), root.hasAttribute('data-bg-effects') ? readBackgroundEffects(root) : undefined, { color: getComputedStyle(root).backgroundColor });
          const bytes = await (await fetch(canvas.toDataURL('image/jpeg', .94))).arrayBuffer();
          return window.__strict.sha256(bytes);
        } finally { host.remove(); }
      }, [layout.f, ov]);
      ok(/<p:bg>[\s\S]*?<a:blipFill\b/.test(z.slides[0]), 'photo exported as a native slide background');
      ok(z.media.some((m) => m.sha === expectedBg), 'processed preview background picture embedded');
      pptxState.bgCases++;
    }
    const imp = await page.evaluate(([b64]) => window.__strict.importBytes(b64), [exp.b64]);
    eq(imp.mode, 'slides', 'import mode'); eq(imp.slides.length, 1, 'imported slide count');
    eq(imp.size, { w: 12192000, h: 6858000 }, 'imported slide size');
    ok(imp.slides[0].text.includes(mA) && imp.slides[0].text.includes(mB), 'import restored both override texts');
    ok(imp.slides[0].my, 'imported HTML is a My (data-my) layout');
    if (png) ok(imp.images.length >= 1 && imp.slides[0].tokens >= 1, 'import restored pictures as tokens + blobs');
    pptxState.layouts.push(layout.f);
    Object.assign(d, { layout: layout.f, canvas: layout.c, part: layout.p, html, picture: !!png, background: bg ? shown.bg : undefined,
      runs: runs.length, media: z.media.length, bytes: z.bytes, importedNT: imp.slides[0].nT, importedNI: imp.slides[0].nI, warnings: imp.warnings });
    return exp.b64;
  }

  if (wanted.includes('pptx')) {
    const px = suite('pptx', FILE);
    const plan = [[1, {}], [2, { html: true }], [3, {}], [4, { bg: true }], [5, { html: true }], [6, { bg: true }], [7, {}], [8, { html: true, bg: true }]];
    for (const [n, opts] of plan) {
      px.case('X' + String(n).padStart(2, '0'), `layout #${n} (${opts.html ? 'inline-bold override' : 'text override'}${opts.bg ? ' + background' : ''}): render → export → zip → import`, async (d) => {
        const b64 = await roundtrip(n, picks[n - 1], opts, d);
        if (n === 1) pptxState.firstB64 = b64;
      });
    }
    px.case('X09', 'three more layouts as one deck: slide count, order and per-slide text survive export and import', async (d) => {
      const deck = picks.slice(8, 11);
      eq(deck.length, 3, 'deck layouts');
      const slides = [];
      for (const [k, l] of deck.entries()) {
        const blocks = await page.evaluate((f) => window.__strict.visibleBlocks(f), l.f);
        const top = [...blocks].sort((a, b) => b.fs - a.fs || a.i - b.i)[0];
        slides.push({ f: l.f, ov: { t: { [top.i]: `WMSTRICT09S${k + 1} 덱 ${k + 1}` }, img: {} }, part: l.p, name: l.name });
      }
      const exp = await page.evaluate(([s]) => window.__strict.exportDeck(s, { title: 'WMSTRICT deck' }), [slides]);
      fs.writeFileSync(path.join(pptxDir, 'X09-deck.pptx'), Buffer.from(exp.b64, 'base64'));
      const z = await inspectPptx(exp.b64);
      eq(z.slides.length, 3, 'exported slides');
      eq(z.notes.length, 3, 'notes per slide');
      for (let k = 0; k < 3; k++) ok(runsOf(z.slides[k]).some((r) => r.text.includes(`WMSTRICT09S${k + 1}`)), `slide ${k + 1} carries its own text`);
      const imp = await page.evaluate(([b64]) => window.__strict.importBytes(b64), [exp.b64]);
      eq(imp.slides.map((s) => s.n), [1, 2, 3], 'imported slide order');
      for (let k = 0; k < 3; k++) ok(imp.slides[k].text.includes(`WMSTRICT09S${k + 1}`), `imported slide ${k + 1} text`);
      deck.forEach((l) => pptxState.layouts.push(l.f));
      ok(pptxState.imageCases >= 2, `override pictures exercised in at least two layouts (got ${pptxState.imageCases})`);
      Object.assign(d, { layouts: deck.map((l) => l.f), bytes: z.bytes, imageCases: pptxState.imageCases, bgCases: pptxState.bgCases });
    });
    px.case('X10', 'My template from an imported PPTX: register → render 1280×720 → re-export → import keeps the text', async (d) => {
      let src = pptxState.firstB64;
      if (!src) {
        const blocks = await page.evaluate((f) => window.__strict.visibleBlocks(f), picks[0].f);
        const top = [...blocks].sort((a, b) => b.fs - a.fs || a.i - b.i)[0];
        src = (await page.evaluate(([s]) => window.__strict.exportDeck(s), [[{ f: picks[0].f, ov: { t: { [top.i]: 'WMSTRICT01A 제목 교체' }, img: {} } }]])).b64;
      }
      const f = 'L_MY_strict_x10';
      const reg = await page.evaluate(([b64, f]) => window.__strict.registerFromPptx(b64, f), [src, f]);
      ok(reg.text.includes('WMSTRICT01A'), 'converted template holds the source text');
      const shown = await page.evaluate(([f]) => window.__strict.render(f, { t: {}, img: {} }), [f]);
      ok(shown.my, 'rendered root is a converted (data-my) layout');
      ok(Math.abs(shown.w - 1280) < 1 && Math.abs(shown.h - 720) < 1, `My template rendered ${shown.w}×${shown.h}`);
      const exp = await page.evaluate(([f]) => window.__strict.exportDeck([{ f, ov: { t: {}, img: {} } }]), [f]);
      fs.writeFileSync(path.join(pptxDir, 'X10-my-template.pptx'), Buffer.from(exp.b64, 'base64'));
      const z = await inspectPptx(exp.b64);
      eq(z.slides.length, 1, 're-exported slides');
      ok(runsOf(z.slides[0]).some((r) => r.text.includes('WMSTRICT01A')), 'source text is still an editable run after the second export');
      const imp = await page.evaluate(([b64]) => window.__strict.importBytes(b64), [exp.b64]);
      ok(imp.slides[0].text.includes('WMSTRICT01A'), 'second import keeps the text');
      if (reg.images) ok(z.media.length >= 1 && imp.images.length >= 1, 'pictures survive the second round trip');
      pptxState.layouts.push(f);
      ok(new Set(pptxState.layouts).size >= 10, `ten distinct layouts across the group (got ${new Set(pptxState.layouts).size})`);
      Object.assign(d, { pictures: reg.images, media: z.media.length, distinctLayouts: [...new Set(pptxState.layouts)] });
    });
    reports.push(await px.run(setupError));
  }

  if (wanted.includes('pptx-negative')) {
    const neg = suite('pptx-negative', FILE);
    const expectRejected = async (b64, d) => {
      const r = await page.evaluate(([b]) => window.__strict.importError(b), [b64]);
      d.result = r;
      ok(!r.ok, 'malformed input was accepted as a deck');
      ok(r.message && r.message.length > 3, 'rejection carries a message');
      eq(await page.evaluate(() => window.__strict.layoutCount()), 596, 'app catalog intact after the rejection');
    };
    neg.case('N01', 'plain text renamed .pptx is rejected', async (d) => expectRejected(Buffer.from('this is not a presentation, just text').toString('base64'), d));
    neg.case('N02', 'empty file is rejected', async (d) => expectRejected('', d));
    neg.case('N03', 'zip without ppt/presentation.xml is rejected', async (d) => {
      const zip = new JSZip(); zip.file('hello.txt', 'strict'); zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
      await expectRejected((await zip.generateAsync({ type: 'nodebuffer' })).toString('base64'), d);
      ok(/PPTX/.test(d.result.message), 'message names PPTX');
    });
    neg.case('N04', 'Word document package (.docx parts) is rejected', async (d) => {
      const zip = new JSZip();
      zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
      zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>strict</w:t></w:r></w:p></w:body></w:document>');
      await expectRejected((await zip.generateAsync({ type: 'nodebuffer' })).toString('base64'), d);
    });
    neg.case('N05', 'truncated real export (first 55% of the bytes) is rejected', async (d) => {
      let src = pptxState.firstB64;
      if (!src) src = (await page.evaluate(([s]) => window.__strict.exportDeck(s), [[{ f: picks[0].f, ov: { t: {}, img: {} } }]])).b64;
      const bytes = Buffer.from(src, 'base64');
      await expectRejected(bytes.subarray(0, Math.floor(bytes.length * 0.55)).toString('base64'), d);
    });
    neg.case('N06','HTML with executable markup renamed pptx never executes',async d=>{
      await expectRejected(Buffer.from('<html><script>window.__strictInjected=true</script></html>').toString('base64'),d);
      ok(!(await page.evaluate(()=>window.__strictInjected)),'input markup was not executed');
    });
    neg.case('N07','PDF signature renamed pptx is rejected',async d=>expectRejected(Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF').toString('base64'),d));
    neg.case('N08','JSON document renamed pptx is rejected',async d=>expectRejected(Buffer.from(JSON.stringify({slides:[{text:'not a PowerPoint archive'}]})).toString('base64'),d));
    neg.case('N09','empty ZIP package is rejected',async d=>expectRejected((await new JSZip().generateAsync({type:'nodebuffer'})).toString('base64'),d));
    neg.case('N10','legacy binary PowerPoint signature is rejected',async d=>expectRejected(Buffer.from([0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1,...new Array(128).fill(0)]).toString('base64'),d));
    reports.push(await neg.run(setupError));
  }
  await closeAll();
}

// ====================================================================== repository + backup
if (wanted.includes('repository')) {
  const repo = suite('repository', FILE);
  const setupError = globalSetupError;
  const proposalFixture = fixtures.requirementSegments;

  async function createProposal(page, patch) {
    return page.evaluate(async (patch) => {
      const m = await import('/src/repositories/proposals.js');
      const id = m.createProposal();
      m.update(id, (d) => { Object.assign(d, structuredClone(patch)); });
      await new Promise((r) => setTimeout(r, 450));
      return id;
    }, patch);
  }
  const exportBackupJson = (page) => page.evaluate(async () => JSON.stringify(await (await import('/src/repositories/backup.js')).exportBackup()));
  const importBackupJson = (page, json) => page.evaluate(async (json) => {
    try { return { ok: true, result: await (await import('/src/repositories/backup.js')).importBackup(JSON.parse(json)) }; } catch (e) { return { ok: false, message: String(e.message || e) }; }
  }, json);
  async function saveTemplate(page, f, name, color, text) {
    return page.evaluate(async ([f, name, color, text]) => {
      const t = await import('/src/repositories/templates.js');
      const png = await window.__strict.makePng(color, 80, 45, name.slice(-3));
      const id = await t.storeImage(await (await fetch(png.dataUrl)).blob());
      const html = `<div data-my="pptx" style="width:1280px;height:720px;position:relative;background:#ffffff"><div data-tb="0" style="position:absolute;left:80px;top:60px;font-size:40px">${text}</div><img src="wmimg:${id}" style="position:absolute;left:600px;top:200px;width:400px;height:225px"></div>`;
      await t.saveTemplates([{ meta: t.myMeta({ f, name, text, nT: 1, nI: 1 }), html }]);
      return { f, id, sha: png.sha };
    }, [f, name, color, text]);
  }

  repo.case('R01', 'proposal text segments (@ref · link · plain) persist exactly and render as text', async (d) => {
    const { page } = await fresh();
    const id = await createProposal(page, { title: 'WMSTRICT R01', req: { free: proposalFixture, form: { project: '', customer: '', target: '', keymen: [], note: '' }, files: [] } });
    const stored = await localJson(page, 'winmate.v2.proposals');
    const saved = (stored || []).find((p) => p.id === id);
    ok(saved, 'proposal persisted to winmate.v2.proposals');
    eq(saved.req.free, proposalFixture, 'segments round-trip unchanged');
    eq(saved.title, 'WMSTRICT R01', 'title');
    const r = await page.evaluate(async (segs) => {
      const m = await import('/src/repositories/proposals.js'); const { linkTags } = await import('/src/services/links.js');
      return { refs: m.segRefs(segs), plain: m.segPlain(segs), text: linkTags.text(segs) };
    }, proposalFixture);
    eq(r.refs, ['product:qm55c', 'solution:magicinfo'], 'segRefs');
    ok(r.plain.includes('@product:qm55c') && r.plain.includes('https://www.samsung.com/sec/business/smart-signage/qmc-series/') && r.plain.endsWith('WMSTRICT-R01 끝.'), 'segPlain keeps refs, link text and order');
    ok((r.text.match(/@/g) || []).length === 2 && !r.text.includes('product:') && r.text.includes('qmc-series'), 'linkTags.text shows short @labels and the link URL');
    d.text = r.text.slice(0, 160);
  });

  repo.case('R02', 'link metadata: product URL maps to its product, others infer title/site, cache persists', async (d) => {
    const { page, context } = await fresh();
    const r = await page.evaluate(async () => {
      const { linkTags } = await import('/src/services/links.js'); const c = await import('/src/services/catalog.js');
      const prod = c.P.qm55c;
      const m1 = await linkTags.resolve(prod.url);
      const m2 = await linkTags.resolve('https://www.youtube.com/watch?v=WMSTRICT01a');
      const m3 = await linkTags.resolve('https://example.org/search?q=WMSTRICT');
      const chip = linkTags.chip(prod.url);
      return { name: prod.name, url: prod.url, m1, m2, m3, cache: Object.keys(JSON.parse(localStorage.getItem('wm-linkmeta-v1') || '{}')), chip: { link: chip.dataset.link, lref: chip.dataset.lref || '', label: chip.getAttribute('aria-label') } };
    });
    Object.assign(d, { m1: r.m1, m2: r.m2, m3: r.m3, cache: r.cache });
    ok(r.url && r.url.startsWith('https://'), 'qm55c has a product URL');
    eq([r.m1.ref, r.m1.title, r.m1.site], ['product:qm55c', r.name, 'Samsung'], 'product link metadata');
    eq([r.m2.title, r.m2.site, r.m2.img], ['YouTube 영상', 'YouTube', 'https://i.ytimg.com/vi/WMSTRICT01a/mqdefault.jpg'], 'YouTube link metadata');
    eq([r.m3.title, r.m3.site], ['검색 · WMSTRICT', 'example.org'], 'search link metadata');
    ok(r.cache.length >= 3, 'wm-linkmeta-v1 cache persisted');
    eq([r.chip.link, r.chip.lref], [r.url, 'product:qm55c'], 'chip carries the link and product ref');
    ok(context.strictBlocked.every((b) => b.kind === 'external'), 'only external metadata lookups were blocked');
  });

  repo.case('R03', 'My template: Blob picture + template in IndexedDB, registered as a layout, survives reload', async (d) => {
    const { page } = await fresh();
    const t = await saveTemplate(page, 'L_MY_strict_r03', 'WMSTRICT R03', '#1428A0', 'WMSTRICT-R03 제목');
    const live = await page.evaluate(async (f) => { const m = await import('/src/repositories/templates.js'); const c = await import('/src/services/catalog.js'); return { listed: m.myList().some((x) => x.f === f), registered: !!c.L[f], resolved: c.layoutHtml(f).includes('blob:'), raw: m.rawHtml(f) }; }, t.f);
    ok(live.listed && live.registered && live.resolved, 'template listed, registered and drawn with a blob URL');
    ok(live.raw.includes('wmimg:' + t.id) && !live.raw.includes('blob:'), 'stored HTML keeps the picture token, not a blob URL');
    const tpl = (await readIdb(page, 'winmate-my', 'tpl')).find((r) => r.key === t.f);
    const img = (await readIdb(page, 'winmate-my', 'img')).find((r) => r.key === t.id);
    ok(tpl, 'tpl record in winmate-my'); eq(tpl.value.imgs, [t.id], 'tpl.imgs lists its picture');
    ok(img && img.blob, 'picture stored as a Blob'); eq([img.blob.type, img.blob.sha], ['image/png', t.sha], 'Blob type and bytes');
    await page.reload(); await waitApp(page); await injectHelpers(page);
    const after = await page.evaluate(async (f) => { const m = await import('/src/repositories/templates.js'); const c = await import('/src/services/catalog.js'); return { listed: m.myList().some((x) => x.f === f), name: (c.L[f] || {}).name, resolved: c.layoutHtml(f).includes('blob:') }; }, t.f);
    eq(after, { listed: true, name: 'WMSTRICT R03', resolved: true }, 'after reload');
    d.template = t;
  });

  repo.case('R04', 'My template delete removes only pictures no other template uses', async (d) => {
    const { page } = await fresh();
    const ids = await page.evaluate(async () => {
      const t = await import('/src/repositories/templates.js');
      const blob = async (c) => (await fetch((await window.__strict.makePng(c, 16, 9)).dataUrl)).blob();
      const shared = await t.storeImage(await blob('#00A651')); const own = await t.storeImage(await blob('#F39800'));
      const h = (txt, list) => `<div style="width:1280px;height:720px;position:relative"><div data-tb="0">${txt}</div>${list.map((i) => `<img src="wmimg:${i}">`).join('')}</div>`;
      await t.saveTemplates([{ meta: t.myMeta({ f: 'L_MY_strict_r04a', name: 'R04 A' }), html: h('A', [shared, own]) }, { meta: t.myMeta({ f: 'L_MY_strict_r04b', name: 'R04 B' }), html: h('B', [shared]) }]);
      return { shared, own };
    });
    const keys = async (store) => (await readIdb(page, 'winmate-my', store)).map((r) => r.key);
    ok((await keys('img')).includes(ids.shared) && (await keys('img')).includes(ids.own), 'both pictures stored');
    await page.evaluate(async () => (await import('/src/repositories/templates.js')).deleteTemplates(['L_MY_strict_r04a']));
    let img = await keys('img');
    ok(img.includes(ids.shared), 'shared picture kept while another template uses it');
    ok(!img.includes(ids.own), 'own picture deleted with its template');
    eq((await keys('tpl')).filter((k) => k.startsWith('L_MY_strict_r04')), ['L_MY_strict_r04b'], 'remaining templates');
    await page.evaluate(async () => (await import('/src/repositories/templates.js')).deleteTemplates(['L_MY_strict_r04b']));
    img = await keys('img');
    ok(!img.includes(ids.shared), 'shared picture deleted with the last user');
    eq(await page.evaluate(async () => { const c = await import('/src/services/catalog.js'); return [!!c.L.L_MY_strict_r04a, !!c.L.L_MY_strict_r04b]; }), [false, false], 'unregistered from the layout map');
    d.ids = ids;
  });

  repo.case('R05', 'review document with a nested Blob thumbnail survives backup into another context', async (d) => {
    const { page: a } = await fresh();
    const put = await a.evaluate(async (doc) => {
      const png = await window.__strict.makePng('#7B2D8E', 32, 18, 'R05');
      const full = structuredClone(doc); full.units[0].thumb = await (await fetch(png.dataUrl)).blob();
      await new Promise((res, rej) => {
        const rq = indexedDB.open('winmate-v2-review', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('docs');
        rq.onerror = () => rej(rq.error);
        rq.onsuccess = () => { const tx = rq.result.transaction('docs', 'readwrite'); tx.objectStore('docs').put(full, 'r_strict_r05'); tx.oncomplete = () => { rq.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
      });
      const loaded = await (await import('/src/repositories/reviews.js')).loadDoc('r_strict_r05');
      return { sha: png.sha, units: loaded && loaded.units.length, thumb: loaded && loaded.units[0].thumb instanceof Blob };
    }, fixtures.reviewDoc);
    eq([put.units, put.thumb], [2, true], 'loadDoc reads the stored document');
    const json = await exportBackupJson(a);
    const backup = JSON.parse(json);
    const row = (backup.databases['winmate-v2-review'].docs || []).find((r) => r.key === 'r_strict_r05');
    ok(row, 'document included in the backup');
    eq(row.value.units[0].thumb.__wmType, 'Blob', 'nested Blob encoded');
    const { page: b } = await fresh();
    const imp = await importBackupJson(b, json);
    ok(imp.ok, 'import failed: ' + imp.message);
    const got = await b.evaluate(async () => {
      const doc = await (await import('/src/repositories/reviews.js')).loadDoc('r_strict_r05');
      const t = doc && doc.units[0].thumb;
      return { units: doc && doc.units.map((u) => u.title), text: doc && doc.units[0].text, sha: t instanceof Blob ? await window.__strict.sha256(await t.arrayBuffer()) : null, type: t && t.type };
    });
    eq(got, { units: ['WMSTRICT 검토 표지', '도입 효과'], text: fixtures.reviewDoc.units[0].text, sha: put.sha, type: 'image/png' }, 'restored document');
    d.import = imp.result;
  });

  repo.case('R06', 'simulations: new/put/patch/delete persist newest first and keep at most 15', async (d) => {
    const { page } = await fresh();
    const r = await page.evaluate(async (setup) => {
      const s = await import('/src/repositories/simulations.js'); const { LV } = await import('/src/domain/simulation/profile.js');
      const first = s.newSim(setup, 2);
      s.putSim(first);
      const ids = [first.id];
      for (let i = 0; i < 17; i++) { const x = s.newSim({ ...setup, customer: setup.customer + ' ' + i }, (i % 3) + 1); x.updatedAt += i + 1; s.putSim(x); ids.push(x.id); }
      const target = ids[ids.length - 2];
      s.patchSim(target, (x) => { x.cur.why = 'WMSTRICT-R06 패치'; });
      s.deleteSim(ids[ids.length - 3]);
      await new Promise((res) => setTimeout(res, 450));
      const stored = JSON.parse(localStorage.getItem('winmate.v2.sims') || '[]');
      return { first: { company: first.profile.company, level: first.level, start: first.cur.satisfaction, expected: LV[2].start, msgs: first.msgs.length, status: first.status }, ids, target,
        stored: stored.map((x) => ({ id: x.id, why: x.cur && x.cur.why })) };
    }, fixtures.simulationSetup);
    eq([r.first.company, r.first.level, r.first.start, r.first.msgs, r.first.status], [fixtures.simulationSetup.customer, 2, r.first.expected, 0, 'active'], 'new simulation record');
    ok(r.stored.length <= 15, `persisted ${r.stored.length} simulations, limit is 15`);
    eq(r.stored.length, 15, 'persisted the newest 15');
    eq(r.stored[0].id, r.ids[r.ids.length - 1], 'newest first');
    ok(!r.stored.some((x) => x.id === r.ids[r.ids.length - 3]), 'deleted simulation stays deleted');
    eq((r.stored.find((x) => x.id === r.target) || {}).why, 'WMSTRICT-R06 패치', 'patched field persisted');
    ok(!r.stored.some((x) => x.id === r.ids[0]), 'oldest simulation dropped beyond the limit');
    d.persisted = r.stored.length;
  });

  repo.case('R07', 'favourites: empty and filled variants of one layout are distinct, toggle removes only the target', async (d) => {
    const { page } = await fresh();
    const r = await page.evaluate(async () => {
      const fv = await import('/src/repositories/favorites.js'); const c = await import('/src/services/catalog.js');
      const f = c.LAYOUTS[0].f;
      const filled = { t: { 0: 'WMSTRICT-R07' }, img: {} };
      const a = fv.toggleFav(f, null, 'strict'); const b = fv.toggleFav(f, filled, 'strict');
      const found = [fv.favOf(f, null) && fv.favOf(f, null).id, fv.favOf(f, filled) && fv.favOf(f, filled).id, fv.favOf(f, { t: { 0: 'other' } })];
      const emptyOv = fv.hasValues({ t: {}, img: {} });
      const removed = fv.toggleFav(f, { t: {}, img: {} });
      const stored = JSON.parse(localStorage.getItem('winmate.v2.favs') || '[]');
      const live = fv.liveFavs([...stored, { id: 'gone', f: 'L_NOT_A_LAYOUT' }]).map((x) => x.id);
      return { f, a, b, found, emptyOv, removed, stored, live };
    });
    ok(r.a && !r.a.filled && r.b && r.b.filled && r.a.id !== r.b.id, 'two distinct favourites for one layout');
    eq(r.found, [r.a.id, r.b.id, null], 'favOf matches by layout + values');
    eq(r.emptyOv, false, 'empty overrides carry no values');
    eq(r.removed, null, 'toggling the empty variant removes it');
    eq(r.stored.map((x) => x.id), [r.b.id], 'only the filled favourite remains persisted');
    eq(r.stored[0].ov, { t: { 0: 'WMSTRICT-R07' } }, 'stored values exclude empty parts');
    eq(r.live, [r.b.id], 'favourites of unknown layouts are hidden');
    d.layout = r.f;
  });

  repo.case('R08', 'backup export: versioned format, whitelisted keys only, every database/store, typed values encoded', async (d) => {
    const { page } = await fresh();
    await createProposal(page, { title: 'WMSTRICT R08' });
    await saveTemplate(page, 'L_MY_strict_r08', 'WMSTRICT R08', '#E4007F', 'WMSTRICT-R08');
    await page.evaluate(async () => {
      localStorage.setItem('other.app.key', 'must-not-export');
      const fv = await import('/src/repositories/favorites.js'); const c = await import('/src/services/catalog.js'); fv.toggleFav(c.LAYOUTS[1].f, null, 'strict');
      await new Promise((res, rej) => { const rq = indexedDB.open('winmate-v2', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('img'); rq.onerror = () => rej(rq.error);
        rq.onsuccess = () => { const tx = rq.result.transaction('img', 'readwrite'); tx.objectStore('img').put(new Uint8Array([1, 2, 3, 250]), 'u_strict_bytes'); tx.oncomplete = () => { rq.result.close(); res(); }; tx.onerror = () => rej(tx.error); }; });
    });
    const backup = JSON.parse(await exportBackupJson(page));
    eq([backup.format, backup.version], ['winmate-browser-v1', 1], 'format/version');
    ok(!Number.isNaN(Date.parse(backup.createdAt)), 'createdAt timestamp');
    const keys = Object.keys(backup.local);
    ok(!keys.includes('other.app.key'), 'foreign localStorage key exported');
    ok(keys.every((k) => k.startsWith('winmate.v2.') || k === 'wm-linkmeta-v1'), 'only whitelisted keys');
    ok(keys.includes('winmate.v2.proposals') && keys.includes('winmate.v2.favs'), 'proposal and favourite keys exported');
    eq(Object.keys(backup.databases).sort(), ['winmate-my', 'winmate-requirements', 'winmate-v2', 'winmate-v2-review'], 'databases');
    eq(Object.keys(backup.databases['winmate-my']).sort(), ['img', 'tpl'], 'winmate-my stores');
    ok(backup.databases['winmate-my'].img.some((r) => r.value.__wmType === 'Blob' && r.value.data.startsWith('data:image/png;base64,')), 'Blob encoded as a data URL');
    const bytes = backup.databases['winmate-v2'].img.find((r) => r.key === 'u_strict_bytes');
    eq(bytes && bytes.value, { __wmType: 'Uint8Array', data: Buffer.from([1, 2, 3, 250]).toString('base64') }, 'typed array encoded');
    ok(!JSON.stringify(backup).includes('must-not-export'), 'foreign value absent everywhere');
    d.local = keys;
  });

  repo.case('R09', 'backup import rejects malformed input before writing anything', async (d) => {
    const { page } = await fresh();
    await saveTemplate(page, 'L_MY_strict_r09', 'WMSTRICT R09', '#00A651', 'WMSTRICT-R09');
    await page.evaluate(() => localStorage.setItem('winmate.v2.favs', '[{"id":"sentinel","f":"L_MI01","ov":null}]'));
    const bad = {
      format: { format: 'other', version: 1 },
      version: { format: 'winmate-browser-v1', version: 2 },
      foreignKey: { format: 'winmate-browser-v1', version: 1, local: { 'winmate.v2.favs': '[]', 'evil.key': 'x' } },
      nonString: { format: 'winmate-browser-v1', version: 1, local: { 'winmate.v2.favs': 123 } },
      unknownDb: { format: 'winmate-browser-v1', version: 1, local: { 'winmate.v2.favs': '[]' }, databases: { 'unknown-db': {} } },
      unknownStore: { format: 'winmate-browser-v1', version: 1, databases: { 'winmate-my': { nope: [] } } },
      corrupt: { format: 'winmate-browser-v1', version: 1, local: { 'winmate.v2.favs': '[]' }, databases: { 'winmate-my': { tpl: [{ key: 'L_MY_ok', value: { f: 'L_MY_ok', meta: {}, html: '' } }, { key: null, value: { f: 'L_MY_bad' } }] } } },
    };
    const results = {};
    for (const [name, value] of Object.entries(bad)) results[name] = await importBackupJson(page, JSON.stringify(value));
    d.results = results;
    for (const [name, r] of Object.entries(results)) ok(!r.ok && r.message, name + ' was accepted');
    eq(await page.evaluate(() => localStorage.getItem('winmate.v2.favs')), '[{"id":"sentinel","f":"L_MI01","ov":null}]', 'localStorage untouched after rejected imports');
    eq((await readIdb(page, 'winmate-my', 'tpl')).map((r) => r.key).sort(), ['L_MY_strict_r09'], 'IndexedDB untouched after rejected imports');
  });

  repo.case('R10', 'restore is additive for IndexedDB: existing templates and pictures stay next to imported ones', async (d) => {
    const { page: source } = await fresh();
    const b = await saveTemplate(source, 'L_MY_strict_r10b', 'WMSTRICT R10 B', '#0099CC', 'WMSTRICT-R10B');
    const json = await exportBackupJson(source);
    const { page: target } = await fresh();
    const a = await saveTemplate(target, 'L_MY_strict_r10a', 'WMSTRICT R10 A', '#C8102E', 'WMSTRICT-R10A');
    const imp = await importBackupJson(target, json);
    ok(imp.ok, 'import failed: ' + imp.message);
    const tpl = (await readIdb(target, 'winmate-my', 'tpl')).map((r) => r.key);
    const img = await readIdb(target, 'winmate-my', 'img');
    ok(tpl.includes(a.f) && tpl.includes(b.f), 'both templates present');
    ok(img.some((r) => r.key === a.id && r.blob.sha === a.sha) && img.some((r) => r.key === b.id && r.blob.sha === b.sha), 'both pictures present byte-for-byte');
    d.result = imp.result;
  });

  repo.case('R11', 'restore is additive for proposals: existing local proposals are not deleted', async (d) => {
    const { page: source } = await fresh();
    const y = await createProposal(source, { title: 'WMSTRICT R11 가져올 제안서' });
    const json = await exportBackupJson(source);
    const { page: target } = await fresh();
    const x = await createProposal(target, { title: 'WMSTRICT R11 기존 제안서' });
    const imp = await importBackupJson(target, json);
    ok(imp.ok, 'import failed: ' + imp.message);
    const ids = ((await localJson(target, 'winmate.v2.proposals')) || []).map((p) => p.id);
    d.ids = { existing: x, imported: y, stored: ids.length };
    ok(ids.includes(y), 'imported proposal present');
    ok(ids.includes(x), 'existing proposal was deleted by the restore (README: other existing items are kept)');
  });

  repo.case('R12', 'separate-origin restore: proposal, favourite and My template with picture appear on the other origin', async (d) => {
    const { page: a } = await fresh(vite.url);
    await createProposal(a, { title: 'WMSTRICT R12 제안서', customer: 'R12 고객' });
    const t = await saveTemplate(a, 'L_MY_strict_r12', 'WMSTRICT R12', '#2E7D32', 'WMSTRICT-R12 제목');
    await a.evaluate(async () => { const fv = await import('/src/repositories/favorites.js'); fv.toggleFav('L_MY_strict_r12', null, 'strict'); });
    const json = await exportBackupJson(a);
    const base = otherOrigin(vite.url);
    ok(new URL(base).host !== new URL(vite.url).host, 'a different origin is used');
    const context = await isolatedContext(browser, base); contexts.push(context);
    const b = await openApp(context, base);
    eq(await localJson(b, 'winmate.v2.favs'), null, 'other origin starts without favourites');
    const imp = await importBackupJson(b, json);
    ok(imp.ok, 'import failed: ' + imp.message);
    await b.reload(); await waitApp(b);
    const sidebar = await b.locator('.sb-list .sb-item').allInnerTexts();
    ok(sidebar.some((x) => x.includes('WMSTRICT R12 제안서')), 'restored proposal listed in the sidebar');
    const img = (await readIdb(b, 'winmate-my', 'img')).find((r) => r.key === t.id);
    ok(img && img.blob.sha === t.sha, 'picture restored byte-for-byte');
    const my = await b.evaluate(async (f) => { const m = await import('/src/repositories/templates.js'); const c = await import('/src/services/catalog.js'); const fv = await import('/src/repositories/favorites.js');
      return { listed: m.myList().some((x) => x.f === f), resolved: c.layoutHtml(f).includes('blob:'), text: c.layoutHtml(f).includes('WMSTRICT-R12 제목'), favs: fv.favList().map((x) => x.f) }; }, t.f);
    eq(my, { listed: true, resolved: true, text: true, favs: ['L_MY_strict_r12'] }, 'restored template and favourite');
    d.origins = [vite.url, base];
  });

  repo.case('R13', 'link metadata cache keeps distinct entries for URLs that differ only in their query', async (d) => {
    const { page } = await fresh();
    const r = await page.evaluate(async () => {
      const { linkTags } = await import('/src/services/links.js');
      const a = await linkTags.resolve('https://www.youtube.com/watch?v=WMSTRICTaaa');
      const b = await linkTags.resolve('https://www.youtube.com/watch?v=WMSTRICTbbb');
      const s1 = await linkTags.resolve('https://example.org/search?q=first');
      const s2 = await linkTags.resolve('https://example.org/search?q=second');
      return { a: a.img, b: b.img, s1: s1.title, s2: s2.title };
    });
    Object.assign(d, r);
    ok(r.a.includes('WMSTRICTaaa'), 'first video thumbnail');
    ok(r.b.includes('WMSTRICTbbb'), 'second video got the first video\'s cached thumbnail');
    eq([r.s1, r.s2], ['검색 · first', '검색 · second'], 'search links keep their own query titles');
  });

  reports.push(await repo.run(setupError, () => ({ blocked: blockedTotals().slice(0, 50) })));
  await closeAll();
}

await browser?.close().catch(() => {});
await vite?.close().catch(() => {});
if (!reports.length || reports.some((r) => !r.meetsMinimum)) process.exitCode = 1;
