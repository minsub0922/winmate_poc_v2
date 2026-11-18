import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COUNT_GROUPS, countGroupOf, countVariantLabel, groupCountLayouts, groupCountResults, filterCountLayouts, ungroupCountLayouts } from '../web/src/domain/templates/layout_count_groups.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = rel => JSON.parse(fs.readFileSync(root + rel, 'utf8'));
const metas = read('app/data/runtime/kb/catalog.json').layouts;
const active = metas.filter(l => !l.retired && !l.variantOf), byF = Object.fromEntries(metas.map(l => [l.f, l]));
const vp = ['L_VP_F2', 'L_VP_F', 'L_VP_F4'].map(f => byF[f]);

test('VP-F is one visible group with its original 2/3/4-product sheets; all registered members exist', () => {
  const [group] = groupCountLayouts(vp);
  assert.equal(group.f, 'L_VP_F');
  assert.equal(group.name, '가치 기둥 × 제품');
  assert.deepEqual(group.countVariants.map(countVariantLabel), ['제품 2개', '제품 3개', '제품 4개']);
  const ids = COUNT_GROUPS.flatMap(g => g.members.map(([f]) => f));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(byF[id], id);
  assert.equal(new Set(COUNT_GROUPS.map(g => g.id)).size, COUNT_GROUPS.length);
});

test('grouping preserves every physical sheet, its slot policy and content variants', () => {
  const grouped = groupCountLayouts(active);
  assert.ok(grouped.length < active.length - 50);
  const originals = ungroupCountLayouts(grouped);
  assert.deepEqual(originals.map(l => l.f).sort(), active.map(l => l.f).sort());
  assert.ok(originals.every(l => l === byF[l.f]));
  assert.ok(!byF.L_VP_F.countVariants);
  for (const f of ['L_VS_CORE_1', 'L_VS_WHY_1', 'L_C01', 'L_C02', 'L_SUB_PAY3', 'L_SUB_PAY5', 'L_SPATIAL_2D', 'L_SPATIAL_3D']) assert.equal(countGroupOf(f), null, f + ' has different content or presentation');
});

test('filters, a removed size variant and separate admin status buckets stay accurate', () => {
  assert.equal(filterCountLayouts(groupCountLayouts(vp), l => l.f === 'L_VP_F4')[0].f, 'L_VP_F4');
  const remaining = groupCountLayouts(vp.filter(l => l.f !== 'L_VP_F'))[0];
  assert.deepEqual(remaining.countVariants.map(l => l.f), ['L_VP_F2', 'L_VP_F4']);
  const split = groupCountLayouts(vp.map(l => l.f === 'L_VP_F4' ? { ...l, removed: true } : l), { bucket: l => l.removed ? 'deleted' : 'active' });
  assert.equal(split.length, 2);
  assert.equal(split.find(l => l.countVariants).countVariants.length, 2);
  assert.equal(split.find(l => l.removed).f, 'L_VP_F4');
});

test('ranking deduplicates families before limiting, while retaining the best actual variant and score', () => {
  const rows = [{ l: byF.L_VP_F4, score: 10 }, { l: byF.L_VP_F, score: 7 }, { l: byF.L_C01, score: 6 }, { l: byF.L_VP_F2, score: 3 }];
  const grouped = groupCountResults(rows, 'l');
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].l.f, 'L_VP_F4');
  assert.equal(grouped[0].score, 10);
  assert.equal(grouped[0].l.countVariants.length, 3);
});

test('personal templates and filled favourites keep their individual identities', () => {
  const own = vp.map(l => ({ ...l, my: { kind: 'edit' } }));
  assert.equal(groupCountLayouts(own).length, 3);
  const favs = vp.map((l, i) => ({ ...l, searchId: 'fav' + i }));
  assert.equal(groupCountLayouts(favs).length, 3);
});

globalThis.window ??= { location: { pathname: '/', search: '', hash: '' }, addEventListener() {} };
globalThis.location ??= window.location;
const { configureBootstrap } = await import('../web/src/api/bootstrap.js');
configureBootstrap({ catalog: read('app/data/catalog.json'), images: read('app/data/images.json'), products: read('app/data/products_db.json'), subscriptions: read('app/data/subscriptions.json') });
const catalog = await import('../web/src/services/catalog.js');
const search = await import('../web/src/services/catalog-search.js');
const legacy = await import('../web/src/services/search.js');

test('actual library search indexes every member code in one family document, including AI ranking candidates', () => {
  const documents = search.catalogDocuments('layouts');
  const family = documents.filter(d => d.item.countGroup?.id === 'vp-products');
  assert.equal(family.length, 1);
  for (const code of ['VP-F', 'L_VP_F2', 'L_VP_F4']) {
    const hits = search.searchCatalogKeywords('layouts', code);
    assert.equal(hits.filter(h => h.item.countGroup?.id === 'vp-products').length, 1, code);
  }
  assert.equal(documents.length, groupCountLayouts(catalog.LAYOUTS).length);
  assert.equal(search.catalogDocuments('layouts', [catalog.L.L_VP_F4])[0].id, 'L_VP_F4');
});

test('legacy search and recommendations also return at most one card per count family', () => {
  for (const rows of [legacy.searchLayouts('가치 제품', {}, { limit: 1000 }), legacy.recommendLayouts({ type: 'value', name: '가치 제안', items: [], text: '' }, {}, 1000)]) {
    const families = rows.map(r => r.l.countGroup?.id).filter(Boolean);
    assert.equal(families.length, new Set(families).size);
    assert.ok(rows.some(r => r.l.countGroup?.id === 'vp-products'));
  }
});

console.log(`layout count groups: ${COUNT_GROUPS.length} families · ${groupCountLayouts(active).length} cards / ${active.length} physical sheets`);
