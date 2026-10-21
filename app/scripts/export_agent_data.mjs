#!/usr/bin/env node
// Canonical app-side knowledge snapshot for the PoC agents → app/data/runtime/kb (only).
//
//   node app/scripts/export_agent_data.mjs [--out app/data/runtime/kb] [--allow-count-drift]
//        [--expect-total 837] [--expect-active 596] [--expect-products 1068] [--expect-scenarios 82]
//
// Sources (read-only):
//   app/data/{catalog.json, images.json, products_db.json, layouts.b64}
//   app/web/src/services/catalog.js   (ALL_LAYOUTS · LAYOUTS · L incl. hidden industry covers · RETIRED · PRODUCTS · P)
//   app/web/src/domain/templates/{covers,photo_layouts,std_layouts,retired,scenarios}.js · domain/proposals/parts.js
//   poc/test/layout_agent/data/standard_scenarios.json (copied, never modified)
//   app/web/src/domain/review/schema.json (current review rubric, score definitions, routing responsibilities)
//
// services/catalog.js reads getBootstrap() at module top level, so the bundle starts with a primer module
// that calls configureBootstrap() with the same snapshot /api/bootstrap serves (catalog · images · products_db).
// The temporary bundle lives under <out>/.build and is removed afterwards. The old PoC sync scripts are not used.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const APP = path.join(ROOT, 'app');
const WEB = path.join(APP, 'web');
const SRC = path.join(WEB, 'src');
const DATA = path.join(APP, 'data');
const RUNTIME = path.join(DATA, 'runtime');
const POC = path.join(ROOT, 'poc', 'test');

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt; };
const flag = (name) => argv.includes('--' + name);
const OUT = path.resolve(ROOT, arg('out', path.join(RUNTIME, 'kb')));
const EXPECT = {
  layouts_total: Number(arg('expect-total', 837)), layouts_active: Number(arg('expect-active', 596)),
  products: Number(arg('expect-products', 1068)), curated_products: 40, scenarios: Number(arg('expect-scenarios', 82)),
};
const LAYOUT_KEYS = ['f', 'c', 'code', 'name', 'when', 'g', 'p', 'p2', 'ind', 'sol', 'pc', 'req', 'prods', 'sols', 'phs', 'ph', 'hl', 'txt', 'eb', 'foot', 'sample'];
const PRODUCT_KEYS = ['id', 'name', 'model', 'cat', 'spec', 'spaces', 'ind', 'kw'];

const posix = (p) => p.split(path.sep).join('/');
const rel = (p) => posix(path.relative(ROOT, p));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const die = (msg) => { console.error('✗ ' + msg); process.exit(1); };

if (OUT !== path.join(RUNTIME, 'kb') && !OUT.startsWith(RUNTIME + path.sep)) die(`--out 는 ${rel(RUNTIME)} 아래여야 합니다: ${rel(OUT)}`);

const INPUTS = {
  catalog: path.join(DATA, 'catalog.json'), images: path.join(DATA, 'images.json'), products: path.join(DATA, 'products_db.json'),
  media: path.join(DATA, 'media.json'),
  layouts: path.join(DATA, 'layouts.b64'),
  catalogJs: path.join(SRC, 'services', 'catalog.js'), bootstrapJs: path.join(SRC, 'api', 'bootstrap.js'), clientJs: path.join(SRC, 'api', 'client.js'),
  covers: path.join(SRC, 'domain', 'templates', 'covers.js'), photo: path.join(SRC, 'domain', 'templates', 'photo_layouts.js'),
  std: path.join(SRC, 'domain', 'templates', 'std_layouts.js'), retired: path.join(SRC, 'domain', 'templates', 'retired.js'),
  spatial: path.join(SRC, 'domain', 'templates', 'spatial-layouts.js'),
  verticalScenarios: path.join(SRC, 'domain', 'templates', 'vertical_scenarios.json'),
  proposalBriefs: path.join(DATA, 'vertical_proposal_briefs.json'),
  proposalBuilder: path.join(ROOT, 'app', 'scripts', 'rebuild_vertical_proposals.py'),
  proposalContent: path.join(ROOT, 'app', 'scripts', 'proposal_content.py'),
  proposalVisuals: path.join(ROOT, 'app', 'scripts', 'proposal_visuals.py'),
  proposalPhotos: path.join(SRC, 'domain', 'templates', 'proposal_photo_assets.json'),
  verticalBriefs: path.join(ROOT, 'app', 'scripts', 'vertical_briefs.py'),
  priorRevisions: path.join(SRC, 'domain', 'templates', 'prior_proposal_revisions.json'),
  migrationData: path.join(SRC, 'domain', 'templates', 'removed_layout_migrations.json'),
  descriptionScenarios: path.join(SRC, 'domain', 'templates', 'description_standard_scenarios.json'),
  scenarioFills: path.join(SRC, 'domain', 'templates', 'scenario_fills.js'),
  scenarioStory: path.join(SRC, 'domain', 'templates', 'scenario_story.js'),
  scenarioBackgrounds: path.join(SRC, 'domain', 'templates', 'scenario_bg.json'),
  scenarios: path.join(SRC, 'domain', 'templates', 'scenarios.js'), parts: path.join(SRC, 'domain', 'proposals', 'parts.js'),
  standard: path.join(POC, 'layout_agent', 'data', 'standard_scenarios.json'),
  reviewSchema: path.join(SRC, 'domain', 'review', 'schema.json'),
};
const detailDirectory = path.join(DATA, 'product-details');
if (fs.existsSync(detailDirectory)) for (const file of fs.readdirSync(detailDirectory).filter(name => /^d\d\d\.json$/.test(name)).sort()) INPUTS['specs_' + file.slice(0, -5)] = path.join(detailDirectory, file);
for (const [k, p] of Object.entries(INPUTS)) if (!fs.existsSync(p)) die(`입력 파일이 없습니다 (${k}): ${rel(p)}`);

let esbuild;
try { esbuild = createRequire(path.join(WEB, 'package.json'))('esbuild'); } catch (e) { die('app/web 에 esbuild 가 없습니다 — npm --prefix app/web ci'); }

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { die(`JSON 을 읽지 못했습니다: ${rel(p)} (${e.message})`); } };
const bootstrap = { catalog: readJson(INPUTS.catalog), images: readJson(INPUTS.images), products: readJson(INPUTS.products) };
if (!Array.isArray(bootstrap.products.products) || typeof bootstrap.products.curated !== 'object') die('products_db.json 형식이 다릅니다(products · curated)');
for (const k of ['layouts', 'products', 'industries', 'solutions', 'cases', 'indKw']) if (!(k in bootstrap.catalog)) die(`catalog.json 에 ${k} 가 없습니다`);
const curatedIds = bootstrap.catalog.products.map((p) => p.id);

// Product reviews can be published independently while another task edits
// layout modules. Keep the last validated layout snapshot and its source hashes.
const readReviewedSpecs = () => {
  const result = {};
  for (const [key, file] of Object.entries(INPUTS)) if (key.startsWith('specs_')) for (const [id, detail] of Object.entries(readJson(file).items)) {
    if (detail.specProductId !== id) continue;
    result[id] = Object.fromEntries(Object.entries(detail).filter(([name]) => name === 'specs' || name.startsWith('spec')));
  }
  return result;
};
if (flag('products-only')) {
  const catalogFile = path.join(OUT, 'catalog.json'), manifestFile = path.join(OUT, 'manifest.json');
  if (!fs.existsSync(catalogFile) || !fs.existsSync(manifestFile)) die('--products-only 는 검증된 기존 KB 스냅샷이 필요합니다.');
  const snapshot = readJson(catalogFile), manifest = readJson(manifestFile);
  if (manifest.outputs?.['catalog.json']?.sha256 !== sha256(fs.readFileSync(catalogFile))) die('기존 KB catalog.json 해시가 맞지 않습니다.');
  const products = [...bootstrap.catalog.products.map(p => ({ ...p, ...bootstrap.products.curated[p.id], cur: true })), ...bootstrap.products.products];
  const previousIds = new Set(snapshot.products.map(p => p.id));
  if (products.length !== EXPECT.products || new Set(products.map(p => p.id)).size !== products.length || products.some(p => !previousIds.has(p.id)) || previousIds.size !== products.length) die('--products-only 는 제품 추가·삭제를 허용하지 않습니다.');
  const specs = readReviewedSpecs();
  if (Object.keys(specs).some(id => !previousIds.has(id))) die('검토 사양에 알 수 없는 제품이 있습니다.');
  snapshot.products = products.map(p => specs[p.id] ? { ...p, ...specs[p.id] } : p);
  const content = Buffer.from(JSON.stringify(snapshot));
  manifest.outputs['catalog.json'] = { size: content.length, sha256: sha256(content) };
  for (const [key, file] of Object.entries(INPUTS)) if (key === 'products' || key.startsWith('specs_')) {
    const input = fs.readFileSync(file); manifest.inputs[rel(file)] = { size: input.length, sha256: sha256(input) };
  }
  manifest.products_generated_at = new Date().toISOString();
  manifest.product_spec_count = Object.keys(specs).length;
  const temporary = catalogFile + '.specs-' + process.pid;
  fs.writeFileSync(temporary, content); fs.renameSync(temporary, catalogFile);
  const manifestTemporary = manifestFile + '.specs-' + process.pid;
  fs.writeFileSync(manifestTemporary, JSON.stringify(manifest)); fs.renameSync(manifestTemporary, manifestFile);
  console.log(`✓ 제품 KB 갱신 — ${products.length}개 · 검토 사양 ${Object.keys(specs).length}개`);
  process.exit(0);
}

// ---------------------------------------------------------------- bundle the real app modules
const spec = (p) => JSON.stringify(posix(p));
const entry = `import 'wm-agent-primer';
import * as catalog from ${spec(INPUTS.catalogJs)};
import { COVERS } from ${spec(INPUTS.covers)};
import { PHOTO_META, PHOTO_HTML } from ${spec(INPUTS.photo)};
import { STD_META, STD_HTML } from ${spec(INPUTS.std)};
import { SPATIAL_META, SPATIAL_HTML } from ${spec(INPUTS.spatial)};
import { RETIRED_R4 } from ${spec(INPUTS.retired)};
import * as parts from ${spec(INPUTS.parts)};
import * as scenarios from ${spec(INPUTS.scenarios)};
export { catalog, COVERS, PHOTO_META, PHOTO_HTML, STD_META, STD_HTML, SPATIAL_META, SPATIAL_HTML, RETIRED_R4, parts, scenarios };
`;
const primer = {
  name: 'wm-agent-primer',
  setup(b) {
    b.onResolve({ filter: /^wm-agent-primer$/ }, () => ({ path: 'primer', namespace: 'wm-agent' }));
    b.onLoad({ filter: /.*/, namespace: 'wm-agent' }, () => ({
      contents: `import { configureBootstrap } from ${spec(INPUTS.bootstrapJs)};
const boot = globalThis.__WM_AGENT_EXPORT_BOOTSTRAP__;
if (!boot) throw new Error('export bootstrap snapshot missing');
configureBootstrap(boot);`,
      resolveDir: SRC, loader: 'js',
    }));
  },
};
const built = await esbuild.build({
  stdin: { contents: entry, resolveDir: SRC, sourcefile: 'agent-export-entry.js', loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', target: 'node18', write: false, logLevel: 'warning', plugins: [primer],
});
const buildDir = path.join(OUT, '.build');
fs.mkdirSync(buildDir, { recursive: true });
const bundleFile = path.join(buildDir, `agent-export-${process.pid}-${crypto.randomBytes(4).toString('hex')}.mjs`);
fs.writeFileSync(bundleFile, built.outputFiles[0].text);
let mod;
try {
  globalThis.__WM_AGENT_EXPORT_BOOTSTRAP__ = bootstrap;
  mod = await import(pathToFileURL(bundleFile).href);
} finally {
  fs.rmSync(bundleFile, { force: true });
  try { fs.rmdirSync(buildDir); } catch (e) { /* other files present */ }
  delete globalThis.__WM_AGENT_EXPORT_BOOTSTRAP__;
}

// ---------------------------------------------------------------- canonical data
const C = mod.catalog;
const ALL = C.ALL_LAYOUTS, ACTIVE = C.LAYOUTS, L = C.L, RETIRED = C.RETIRED, PRODUCTS = C.PRODUCTS, P = C.P;
const allSet = new Set(ALL.map((l) => l.f));
const hidden = Object.fromEntries(Object.keys(L).filter((f) => !allSet.has(f)).map((f) => [f, L[f]]));
const html = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(INPUTS.layouts, 'utf8').trim(), 'base64')).toString('utf8'));
Object.assign(html, mod.COVERS, mod.PHOTO_HTML, mod.STD_HTML, mod.SPATIAL_HTML);
const partsOut = { PARTS: mod.parts.PARTS, NEXT: mod.parts.NEXT, RELATED: mod.parts.RELATED, REQ_LABEL: mod.parts.REQ_LABEL };
const S = mod.scenarios;
const scenariosOut = { REQ_TYPES: S.REQ_TYPES, REQ_ORDER: S.REQ_ORDER, STRATEGIES: S.STRATEGIES, ENDINGS: S.ENDINGS, STAGES: S.STAGES, SCENARIOS: S.SCENARIOS };
const standard = readJson(INPUTS.standard);
const reviewSchema = readJson(INPUTS.reviewSchema);
const criteria = { ...reviewSchema, source: rel(INPUTS.reviewSchema) };
const rubrics = { version: reviewSchema.version, scoring: reviewSchema.scoring, scale: reviewSchema.scale, criteria: Object.fromEntries(criteria.criteria.map(c => [c.id, Object.fromEntries(['r1','r2','r3','gate','scope','concepts','checkpoints'].map(k => [k,c[k]]))])) };
const idsFor = cat => criteria.criteria.filter(c => c.cat === cat).map(c => c.id);
const fine = reviewSchema.communities.map(g => ({ id: g.id, parent: 'C_' + g.cat, criteria: g.criteria, name: g.name,
  summary: g.criteria.map(id => criteria.criteria.find(c => c.id === id).desc).join(' '),
  when_relevant: reviewSchema.cats.find(c => c.id === g.cat).desc, evidence: '실제 제안서의 본문·표·도형·제공된 화면으로 확인하며 같은 문제는 담당 기준에서 한 번만 채점한다.',
  keywords: [...new Set(g.criteria.flatMap(id => criteria.criteria.find(c => c.id === id).concepts))] }));
const coarse = reviewSchema.cats.map(c => ({ id: 'C_' + c.id, children: fine.filter(f => f.parent === 'C_' + c.id).map(f => f.id), criteria: idsFor(c.id), name: c.name, summary: c.desc, when_relevant: c.desc, evidence: '해당 기준에 지정된 실제 장표 근거', keywords: fine.filter(f => f.parent === 'C_' + c.id).flatMap(f => f.keywords) }));
const taxonomy = { version: reviewSchema.version, source: rel(INPUTS.reviewSchema), summarized_by: 'curated rubric responsibilities',
  root: { id: 'R', children: coarse.map(c => c.id), criteria: criteria.criteria.map(c => c.id), name: '제안서 검토', summary: reviewSchema.policies.join(' '), when_relevant: '고객 제출 제안서 검토', evidence: '제공된 제안서와 고객 요구사항', keywords: reviewSchema.cats.map(c => c.name) }, fine, coarse,
  stats: { criteria: criteria.criteria.length, fine: fine.length, coarse: coarse.length } };


// ---------------------------------------------------------------- assertions
const errors = [], warnings = [];
const counts = {
  layouts_total: ALL.length, layouts_active: ACTIVE.length, hidden_layouts: Object.keys(hidden).length, html: Object.keys(html).length,
  products: PRODUCTS.length, product_map: Object.keys(P).length, curated_products: curatedIds.length, scenarios: S.SCENARIOS.length,
  retired: Object.keys(RETIRED).length, industries: bootstrap.catalog.industries.length, solutions: bootstrap.catalog.solutions.length, cases: bootstrap.catalog.cases.length,
};
for (const [k, v] of Object.entries(EXPECT)) if (counts[k] !== v) (flag('allow-count-drift') ? warnings : errors).push(`${k}: ${counts[k]} (기대 ${v})`);
if (counts.product_map !== counts.products) errors.push(`제품 id 중복: P ${counts.product_map} / 목록 ${counts.products}`);
if (allSet.size !== ALL.length) errors.push('레이아웃 f 중복');
const noHtml = [...allSet, ...Object.keys(hidden)].filter((f) => typeof html[f] !== 'string' || !html[f]);
if (noHtml.length) errors.push(`HTML 없는 레이아웃 ${noHtml.length}개: ${noHtml.slice(0, 8).join(', ')}`);
const missingLayoutKeys = [...new Set(ALL.flatMap((l) => LAYOUT_KEYS.filter((k) => !(k in l))))];
if (missingLayoutKeys.length) errors.push('레이아웃 메타 필수 필드 없음: ' + missingLayoutKeys.join(', '));
const missingProductKeys = [...new Set(PRODUCTS.flatMap((p) => PRODUCT_KEYS.filter((k) => !(k in p))))];
if (missingProductKeys.length) errors.push('제품 필수 필드 없음: ' + missingProductKeys.join(', '));
const badRetired = Object.entries(RETIRED).filter(([a, t]) => allSet.has(a) && (!allSet.has(t) || L[t].retired)).map(([a, t]) => `${a}→${t}`);
if (badRetired.length) errors.push('retired 대상(사진 버전)이 없거나 그 자체가 retired: ' + badRetired.slice(0, 8).join(', '));
const unusedRetired = Object.keys(RETIRED).filter((a) => !allSet.has(a));
if (unusedRetired.length) warnings.push('레지스트리에 없는 retired 원본(앱도 무시): ' + unusedRetired.slice(0, 8).join(', '));
const scMissing = [...new Set(S.SCENARIOS.flatMap((s) => (s.flow || []).flatMap((g) => (g.slides || []).map((x) => x.f))).filter((f) => !L[f]))];
if (scMissing.length) errors.push('시나리오가 가리키는 레이아웃이 없음: ' + scMissing.slice(0, 8).join(', '));
const refs = new Set();
(function walk(x) { if (typeof x === 'string') { if (/^L_[A-Za-z0-9_]+$/.test(x)) refs.add(x); } else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') Object.values(x).forEach(walk); })(standard);
const stdMissing = [...refs].filter((f) => !allSet.has(f));
if (stdMissing.length) errors.push('standard_scenarios 가 가리키는 레이아웃이 없음: ' + stdMissing.slice(0, 8).join(', '));
const critIds = new Set(criteria.criteria.map((c) => c.id));
const fineIds = new Set(taxonomy.fine.flatMap((f) => f.criteria));
const notInTax = [...critIds].filter((i) => !fineIds.has(i)), notInCrit = [...fineIds].filter((i) => !critIds.has(i));
if (notInTax.length || notInCrit.length) errors.push(`criteria ↔ taxonomy 불일치: taxonomy 에 없음 ${notInTax.join(',') || '-'} · criteria 에 없음 ${notInCrit.join(',') || '-'}`);
if (errors.length) die('정본 KB 검증 실패\n  - ' + errors.join('\n  - '));

// ---------------------------------------------------------------- write (manifest last; removed first so a partial export is detectable)
fs.mkdirSync(path.join(OUT, 'score'), { recursive: true });
fs.rmSync(path.join(OUT, 'manifest.json'), { force: true });
const outputs = {};
const write = (name, data) => {
  const file = path.join(OUT, name);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
  outputs[name] = { size: data.length, sha256: sha256(data) };
};
const json = (v) => Buffer.from(JSON.stringify(v));
const reviewedSpecs = readReviewedSpecs();
write('catalog.json', json({
  layouts: ALL, industries: bootstrap.catalog.industries, products: PRODUCTS.map(p => reviewedSpecs[p.id] ? { ...p, ...reviewedSpecs[p.id] } : p), solutions: bootstrap.catalog.solutions,
  cases: bootstrap.catalog.cases, indKw: bootstrap.catalog.indKw, curated_product_ids: curatedIds,
}));
write('hidden_layouts.json', json(hidden));
write('retired.json', json(RETIRED));
write('layout_html.json.gz', zlib.gzipSync(Buffer.from(JSON.stringify(html)), { level: 9 }));
write('parts.json', json(partsOut));
write('best_scenarios.json', json(scenariosOut));
const scenarioPhotos = readJson(INPUTS.proposalPhotos);
const exportedImages = readJson(INPUTS.images);
for (const photo of scenarioPhotos) exportedImages.pids[photo.pid] = {file:photo.src,src:'case',model:photo.model,desc:photo.desc,w:photo.w,h:photo.h,page:photo.page,owner:photo.owner};
write('images.json', Buffer.from(JSON.stringify(exportedImages)));
write('standard_scenarios.json', fs.readFileSync(INPUTS.standard));
write('score/criteria.json', json(criteria));
write('score/rubrics.json', json(rubrics));
write('score/taxonomy.json', json(taxonomy));
const inputs = Object.fromEntries(Object.values(INPUTS).map((p) => { const b = fs.readFileSync(p); return [rel(p), { size: b.length, sha256: sha256(b) }]; }));
const manifest = {
  version: 1, review_criteria: { version: criteria.version, categories: criteria.cats.length, criteria: criteria.criteria.length }, generated_at: new Date().toISOString(), generator: 'app/scripts/export_agent_data.mjs', node: process.version, esbuild: esbuild.version,
  counts, expected: EXPECT, warnings, inputs, outputs,
  notes: [
    'layouts = catalog.json + PHOTO_META + STD_META (services/catalog.js ALL_LAYOUTS), retired from services/catalog.js RETIRED',
    'hidden_layouts = services/catalog.js L entries outside ALL_LAYOUTS (industry covers L_IND_*)',
    'products = services/catalog.js PRODUCTS (curated 40 merged with products_db curated fields + products_db rows)',
    'standard_scenarios copied verbatim from poc/test; score criteria, rubrics and curated routing taxonomy derived from app/web/src/domain/review/schema.json',
  ],
};
write('manifest.json', json(manifest));
console.log(`✓ ${rel(OUT)} — layouts ${counts.layouts_total} (active ${counts.layouts_active}, hidden ${counts.hidden_layouts}) · html ${counts.html} · products ${counts.products} (curated ${counts.curated_products}) · scenarios ${counts.scenarios}`);
for (const w of warnings) console.log('  ! ' + w);
