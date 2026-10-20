import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { keywordSearch, searchFields, queryWords, retrieveDocuments } from '../web/src/services/keyword-search.js';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = require('esbuild');
const root = fileURLToPath(new URL('../web/src/', import.meta.url));
const fixture = {
 'catalog.js': `export const LAYOUTS=Array.from({length:80},(_,i)=>({f:'layout_'+i,code:'C'+i,name:'비용 검토 '+i,when:'투자 회수와 비용 비교',p:'cost',ind:null,prods:[],sols:[],req:[],txt:'파일럿 예산 비용'}));export const ALL_LAYOUTS=LAYOUTS;export const IND={},IND_KW={},P={},S={},C={};`,
 'parts.js': `export const PARTS={cost:{label:'비용'}},REQ_LABEL={};`,
 'scenarios.js': `export const SCENARIOS=Array.from({length:15},(_,i)=>({id:'scenario_'+i,title:'비용 검토 '+i,short:'투자 회수',req:'new',strategy:'value',ending:'pilot',audience:{lead:'대표',others:[]},objections:[],flow:[],signals:['비용 비교'],criteria:[],kpis:[],products:[],solutions:[],cases:[]}));export const REQ_TYPES={new:{label:'신규'}},STRATEGIES={value:{label:'가치',desc:'비용 투자'}},ENDINGS={pilot:'파일럿'};export const slidesOfScenario=()=>[];`,
};
const built = await build({ stdin: { contents: `export * from './services/catalog-search.js';export {setTransport} from './api/client.js';`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm',
 plugins: [{ name: 'catalog-fixtures', setup(b) {
  b.onResolve({ filter: /\/(catalog|parts|scenarios)\.js$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: fixture[args.path] }));
 } }],
});
const service = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const doc = (id, fields) => ({ id, item: { id }, fields: searchFields(fields) });
const response = data => Response.json({ mode: 'real', data });
function modelTransport({ queries = ['비용 투자 회수'], rank, calls = [] } = {}) {
 let step = 0;
 service.setTransport(async (_url, init) => {
  const body = JSON.parse(init.body); calls.push(body);
  if (step++ === 0) return response({ queries });
  const spec = body.response_schema.properties.order;
  return response({ order: rank ? rank(spec) : spec.items.properties.id.enum.slice(0, spec.minItems).reverse().map(id => ({ id, reason: '고객의 투자 비용 검토에 맞는 자료' })) });
 });
 return calls;
}

test('Best Scenario tokenization handles Korean particles, punctuation, Latin models and numbers', () => {
 assert.deepEqual(queryWords('호텔에서, QM55C! 호텔에서 55'), ['호텔', 'qm55c', '55']);
 assert.equal(keywordSearch('', []), null);
});
test('field weighting, AND matching and closest-word fallback are shared by both catalogs', () => {
 const docs = [doc('title', [['제목', ['메뉴보드 원격'], 6]]), doc('body', [['예시 문구', ['메뉴보드 원격'], 1]]), doc('partial', [['제목', ['메뉴보드'], 6]])];
 assert.deepEqual(keywordSearch('메뉴보드 원격', docs).map(x => x.id), ['title', 'body']);
 assert.deepEqual(keywordSearch('메뉴보드 원격 알수없는말', docs).map(x => x.id), ['title', 'body', 'partial']);
});
test('Hangul bigram fallback and matched excerpts retain Best Scenario behavior', () => {
 const docs = [doc('x', [['솔루션', ['중앙통합관리'], 4]])];
 const result = keywordSearch('통합관리', docs);
 assert.equal(result[0].snip.mid, '통합관리'); assert.equal(result[0].why[0], '솔루션');
 assert(keywordSearch('통합관리를', docs)?.length);
 assert.equal(keywordSearch('zzzz', docs).length, 0);
});
test('BM25 plus TF-IDF retrieves relevant actual document fields', () => {
 const docs = [doc('cost', [['제목', ['투자 회수 비용 비교'], 6]]), doc('space', [['제목', ['호텔 객실 공간'], 6]])];
 const result = retrieveDocuments('투자 비용', docs);
 assert.equal(result[0].id, 'cost'); assert(result[0].bm25 > 0 && result[0].cosine > 0);
 assert.deepEqual(retrieveDocuments('zzzz', docs), []);
});
test('AI reranks exactly ten, keeps all remaining keyword and RAG results without duplicates', async () => {
 const calls = modelTransport(); const phases = [];
 const out = await service.searchCatalogAI('layouts', '비용', { onProgress: x => phases.push(x) });
 assert.equal(calls.length, 2); assert.equal(out.length, 80); assert.equal(new Set(out.map(x => x.id)).size, 80);
 assert.equal(out.filter(x => x.ai).length, 10); assert(out.slice(0, 10).every(x => x.aiWhy && x.rank));
 assert(out.slice(10).every(x => !x.ai)); assert.equal(phases.length, 3);
 assert.equal(calls[1].response_schema.properties.order.minItems, 10);
});
test('context expansion finds catalog content even without literal input-word matches', async () => {
 assert.equal(service.searchCatalogKeywords('layouts', '이사회에서돈걱정').length, 0);
 modelTransport(); const out = await service.searchCatalogAI('layouts', '이사회에서돈걱정');
 assert(out.length > 10); assert(out[0].item.name.includes('비용'));
});
test('Best Scenario uses the same RAG/rerank and preserves its remaining scenarios', async () => {
 modelTransport(); const out = await service.searchCatalogAI('scenarios', '비용');
 assert.equal(out.length, 15); assert.equal(out.filter(x => x.ai).length, 10);
 assert(out.every(x => x.id.startsWith('scenario_')));
});
test('filters restrict candidate IDs before ranking, and fewer than ten returns actual count', async () => {
 const calls = modelTransport(); const allowedIds = ['layout_2', 'layout_3', 'layout_4'];
 const out = await service.searchCatalogAI('layouts', '비용', { context: { allowedIds, filters: ['예산'] } });
 assert.equal(out.length, 3); assert(out.every(x => allowedIds.includes(x.id)));
 assert.equal(calls[1].response_schema.properties.order.minItems, 3);
});
test('invalid or repeated model IDs fail after a bounded repair, never become AI results', async () => {
 const calls = modelTransport({ rank: spec => Array.from({ length: spec.minItems }, () => ({ id: 'invented', reason: 'invalid' })) });
 await assert.rejects(service.searchCatalogAI('layouts', '비용'), { code: 'invalid_output' });
 assert.equal(calls.length, 3);
});
test('aborted searches never call the model; missing matches do not invent catalog items', async () => {
 const calls = modelTransport({ queries: ['zzzz'] }); const c = new AbortController(); c.abort();
 await assert.rejects(service.searchCatalogAI('layouts', '비용', { signal: c.signal }), { name: 'AbortError' });
 assert.equal(calls.length, 0); assert.deepEqual(await service.searchCatalogAI('layouts', 'zzzz'), []); assert.equal(calls.length, 1);
});
