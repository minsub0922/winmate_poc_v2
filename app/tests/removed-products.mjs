// 지운 제품(DSS 삭제 — products_db.json removed)을 앱이 견디는지: 행이 없어도 저장된 제안서의 연결 제품을 대체 제품으로 잇고,
// 장의 글에 남은 모델코드는 내보낼 때 확인 대상으로 잡는다. 실제 데이터에서 판매 종료 표시 제품 하나를 '지운 것처럼' 바꾼 스냅샷으로 돈다(파일은 안 바꾼다).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { configureBootstrap } from '../web/src/api/bootstrap.js';
const read = n => JSON.parse(fs.readFileSync(new URL('../data/' + n + '.json', import.meta.url)));
const products = read('products_db');
const row = products.products.find(p => p.deprecated && p.deprecated.replacedBy) || products.products.find(p => (p.models || []).length);
const replacement = row.deprecated?.replacedBy || products.products.find(p => p.id !== row.id && !p.deprecated).id;
const tombstone = { id: row.id, name: row.name, model: row.model, models: row.models || [], photos: [row.th, ...(row.gal || [])].filter(Boolean), replacedBy: replacement, at: '2026-11-15T09:00:00+09:00', reason: 'test' };
configureBootstrap({ catalog: read('catalog'), images: read('images'),
  products: { ...products, products: products.products.filter(p => p.id !== row.id), removed: [...(products.removed || []), tombstone] } });

const { P, PRODUCTS, ACTIVE_PRODUCTS, REMOVED, REMOVED_PRODUCTS } = await import('../web/src/services/catalog.js');
const { migrateRemovedProducts, replacementId } = await import('../web/src/domain/products/removed.js');
const { deprecatedInDeck, deprecatedLine, replacementOf, DEPRECATED_PRODUCTS } = await import('../web/src/domain/products/deprecation.js');

assert.equal(P[row.id], undefined, '지운 제품은 P 에 없다');
assert.ok(!PRODUCTS.some(p => p.id === row.id) && !ACTIVE_PRODUCTS.some(p => p.id === row.id));
assert.equal(REMOVED[row.id].replacedBy, replacement); assert.ok(REMOVED_PRODUCTS.length >= 1);
assert.equal(replacementId(row.id), replacement);

// 저장된 제안서: 연결된 지운 제품 → 대체 제품(이미 있으면 겹치지 않게), 바꾼 기록을 남긴다
const proposal = { ctx: { products: ['qm55c', row.id, replacement], solutions: [], cases: [] } };
assert.equal(migrateRemovedProducts(proposal), true);
assert.deepEqual(proposal.ctx.products, ['qm55c', replacement]);
assert.deepEqual(proposal.removedProducts.map(x => [x.id, x.replacedBy]), [[row.id, replacement]]);
assert.equal(migrateRemovedProducts(proposal), false, '두 번째에는 바꿀 것이 없다');
assert.equal(migrateRemovedProducts({ ctx: { products: ['qm55c'] } }), false);

// 내보내기 확인: 연결 제품에서 바뀐 기록 + 장의 글에 남은 모델코드
const gone = DEPRECATED_PRODUCTS.find(p => p.id === row.id);
assert.ok(gone && gone.removed);
assert.equal(replacementOf(gone)?.id, replacement);
const linked = deprecatedInDeck(proposal, []);
assert.equal(linked.length, 1); assert.equal(linked[0].p.id, row.id); assert.equal(linked[0].replacement.id, replacement);
const model = [row.model, ...(row.models || [])].find(m => String(m || '').replace(/[^A-Za-z0-9]/g, '').length >= 5);
if (model && !PRODUCTS.some(p => !p.deprecated && [p.model, ...(p.models || [])].includes(model))) {
  const inText = deprecatedInDeck({ ctx: { products: [] } }, [{ x: { f: 'L_NO_SUCH_LAYOUT', ov: { t: { 1: `설치 모델 ${model} 기준` } } }, n: 3 }]);
  assert.equal(inText.length, 1); assert.deepEqual(inText[0].where, ['3쪽']);
  assert.match(deprecatedLine(inText[0]), /3쪽/);
}
assert.deepEqual(deprecatedInDeck({ ctx: { products: ['qm55c'] } }, [{ x: { f: 'L_NO_SUCH_LAYOUT', ov: { t: { 1: '아무 제품 이야기도 없는 글' } } } }]).filter(h => h.p.id === row.id), []);
console.log('PASS removed products: tombstone resolves to replacement, saved proposal links migrate, export check finds leftovers (' + row.id + ' → ' + replacement + ')');
