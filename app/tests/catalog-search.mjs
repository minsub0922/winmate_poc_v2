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
const built = await build({ stdin: { contents: `export * from './services/catalog-search.js';export {setTransport} from './api/client.js';export {configureLayoutLibrary} from './domain/templates/layout_library.js';`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'esm',
 plugins: [{ name: 'catalog-fixtures', setup(b) {
  b.onResolve({ filter: /\/(catalog|parts|scenarios)\.js$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: fixture[args.path] }));
 } }],
});
const service = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const doc = (id, fields) => ({ id, item: { id }, fields: searchFields(fields) });
const response = data => Response.json({ mode: 'real', data });
// Intent expansion stays a browser LLM call (/api/llm); ranking is the server task catalog.rank (/api/catalog/rank).
function modelTransport({ queries = ['비용 투자 회수'], rank, calls = [] } = {}) {
 service.setTransport(async (url, init) => {
  const body = JSON.parse(init.body); calls.push({ url: String(url), ...body });
  if (!String(url).includes('/api/catalog/rank')) return response({ queries });
  return response({ order: rank ? rank(body) : body.candidates.map(c => c.id).slice(0, body.count).reverse().map(id => ({ id, reason: '고객의 투자 비용 검토에 맞는 자료' })) });
 });
 return calls;
}

test('샘플 버티컬 시나리오 tokenization handles Korean particles, punctuation, Latin models and numbers', () => {
 assert.deepEqual(queryWords('호텔에서, QM55C! 호텔에서 55'), ['호텔', 'qm55c', '55']);
 assert.equal(keywordSearch('', []), null);
});
test('field weighting, AND matching and closest-word fallback are shared by both catalogs', () => {
 const docs = [doc('title', [['제목', ['메뉴보드 원격'], 6]]), doc('body', [['예시 문구', ['메뉴보드 원격'], 1]]), doc('partial', [['제목', ['메뉴보드'], 6]])];
 assert.deepEqual(keywordSearch('메뉴보드 원격', docs).map(x => x.id), ['title', 'body']);
 assert.deepEqual(keywordSearch('메뉴보드 원격 알수없는말', docs).map(x => x.id), ['title', 'body', 'partial']);
});
test('Hangul bigram fallback and matched excerpts retain 샘플 버티컬 시나리오 behavior', () => {
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
 assert(calls[1].url.endsWith('/api/catalog/rank')); assert.equal(calls[1].count, 10); assert.equal(calls[1].kind, 'layouts');
 assert(calls[1].candidates.every(c => c.id && Array.isArray(c.fields) && c.fields.every(f => f.length === 2)));
});
test('context expansion finds catalog content even without literal input-word matches', async () => {
 assert.equal(service.searchCatalogKeywords('layouts', '이사회에서돈걱정').length, 0);
 modelTransport(); const out = await service.searchCatalogAI('layouts', '이사회에서돈걱정');
 assert(out.length > 10); assert(out[0].item.name.includes('비용'));
});
test('샘플 버티컬 시나리오 uses the same RAG/rerank and preserves its remaining scenarios', async () => {
 modelTransport(); const out = await service.searchCatalogAI('scenarios', '비용');
 assert.equal(out.length, 15); assert.equal(out.filter(x => x.ai).length, 10);
 assert(out.every(x => x.id.startsWith('scenario_')));
});
test('filters restrict candidate IDs before ranking, and fewer than ten returns actual count', async () => {
 const calls = modelTransport(); const allowedIds = ['layout_2', 'layout_3', 'layout_4'];
 const out = await service.searchCatalogAI('layouts', '비용', { context: { allowedIds, filters: ['예산'] } });
 assert.equal(out.length, 3); assert(out.every(x => allowedIds.includes(x.id)));
 assert.equal(calls[1].count, 3); assert.deepEqual(calls[1].candidates.map(c => c.id).sort(), allowedIds);
});
test('invalid or repeated ranking IDs from the server task are rejected, never become AI results', async () => {
 const calls = modelTransport({ rank: body => Array.from({ length: body.count }, () => ({ id: 'invented', reason: 'invalid' })) });
 await assert.rejects(service.searchCatalogAI('layouts', '비용'), { code: 'invalid_output' });
 assert.equal(calls.length, 2);
});
test('aborted searches never call the model; missing matches do not invent catalog items', async () => {
 const calls = modelTransport({ queries: ['zzzz'] }); const c = new AbortController(); c.abort();
 await assert.rejects(service.searchCatalogAI('layouts', '비용', { signal: c.signal }), { name: 'AbortError' });
 assert.equal(calls.length, 0); assert.deepEqual(await service.searchCatalogAI('layouts', 'zzzz'), []); assert.equal(calls.length, 1);
});

// Explicit lists back My/favourites and must invalidate alongside the admin catalog.
test('cached catalog documents follow replaced lists and library revisions', () => {
 const defaults = service.catalogDocuments('layouts');
 const items = defaults.slice(0, 4).map(d => ({ ...d.item }));
 const first = service.catalogDocuments('layouts', items);
 assert.equal(service.catalogDocuments('layouts', items), first);
 const updated = items.map((item, i) => i ? item : { ...item, name: '갱신된 제품 근거' });
 const second = service.catalogDocuments('layouts', updated);
 assert.notEqual(second, first);
 assert.equal(service.searchCatalogKeywords('layouts', '갱신된 제품', updated)[0].id, items[0].f);
 items[0].name = '관리자 변경 근거';
 const scenarios = service.catalogDocuments('scenarios');
 service.configureLayoutLibrary({ v: 1, rev: 100, items: {} });
 assert.notEqual(service.catalogDocuments('scenarios'), scenarios);
 assert.notEqual(service.catalogDocuments('layouts'), defaults);
 assert.notEqual(service.catalogDocuments('layouts', items), first);
 assert.equal(service.searchCatalogKeywords('layouts', '관리자 변경', items)[0].id, items[0].f);
});

test('cached corpus keeps exact ranks/scores and recomputes statistics for a filtered list', () => {
 const docs = [doc('a', [['제목', ['메뉴보드 원격 운영 운영'], 6]]), doc('b', [['제목', ['원격 운영 비용'], 6]]), doc('c', [['제목', ['객실 에너지 절감'], 6]])];
 for (const query of ['원격 운영', '에너지', '메뉴보드 비용']) {
   const fresh = retrieveDocuments(query, structuredClone(docs));
   assert.deepEqual(retrieveDocuments(query, docs), fresh);
   assert.deepEqual(retrieveDocuments(query, docs), fresh);
   const subset = docs.slice(1);
   assert.deepEqual(retrieveDocuments(query, subset), retrieveDocuments(query, structuredClone(subset)));
 }
});
