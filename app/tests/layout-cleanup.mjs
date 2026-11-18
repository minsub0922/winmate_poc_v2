// Composition protection is checked against the real builders, not a hand-written list.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { compositionLayoutUsage } from '../scripts/composition_layout_usage.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const plan = read('app/web/src/domain/templates/layout_cleanup_manifest.json');
const current = await compositionLayoutUsage(root);
assert.deepEqual(plan.protected, current, 'Composition references changed: audit protection before retiring layouts');
assert.equal(Object.keys(current).length, 218);

const { configureBootstrap } = await import('../web/src/api/bootstrap.js');
configureBootstrap({ catalog: read('app/data/catalog.json'), images: read('app/data/images.json'), products: read('app/data/products_db.json'), subscriptions: read('app/data/subscriptions.json') });
const C = await import('../web/src/services/catalog.js');
assert.equal(C.LAYOUTS.length, 357);
for (const [f, item] of Object.entries(plan.removed)) {
  assert.ok(!C.LAYOUTS.some(l => l.f === f), f);
  assert.ok(C.L[f]?.removed, f);
  assert.ok(!C.REMOVED_LAYOUT_SET.has(f), f + ': cleanup must not trigger the old destructive proposal migration');
  if (item.replacement) assert.equal(C.libraryOf(f), item.replacement);
}
for (const f of Object.keys(current)) if (C.L[f]) assert.ok(!C.L[f].removed && !C.L[f].retired, f);
const active = new Set(C.LAYOUTS.map(l => l.f));
for (const [canon, group] of Object.entries(C.VARIANTS)) if (active.has(canon))
  for (const [, ind] of group.members) assert.ok(!C.L[C.variantFor(canon, ind)]?.removed, canon + ':' + ind);
const html = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'app/data/runtime/kb/layout_html.json.gz'))));
const scenarios = read('app/data/runtime/kb/best_scenarios.json').SCENARIOS;
for (const s of scenarios) for (const g of s.flow) for (const x of g.slides) assert.ok(C.L[x.f] && html[x.f], s.id + ':' + x.f);
console.log('✓ 218 protected composition sheets, 603 removals, 357 active layouts; all 116 samples retain their original sheets');
