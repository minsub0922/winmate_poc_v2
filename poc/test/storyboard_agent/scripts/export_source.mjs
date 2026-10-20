// winmatev2 앱 src → storyboard_agent/data/*.json 스냅샷 (파트 유형 · Best Scenario · 카탈로그 요약 · 히스토리 샘플)
//
//   cd <winmatev2>                       # package.json 이 있는 앱 폴더 (npm install 로 esbuild · react 가 있어야 함)
//   npx esbuild poc/test/storyboard_agent/scripts/export_source.mjs --bundle --platform=node --format=esm \
//     --loader:.js=jsx --outfile=/tmp/sb_export.mjs \
//     --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
//   node /tmp/sb_export.mjs poc/test/storyboard_agent/data
//
// store.js 가 localStorage 를 읽으므로 빈 메모리 저장소를 먼저 둔다.
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
import fs from 'node:fs';
import path from 'node:path';
const store = await import('../../../../src/store.js');
const sc = await import('../../../../src/scenarios.js');
const parts = await import('../../../../src/parts.js');
const data = await import('../../../../src/data.js');
const search = await import('../../../../src/search.js');

const out = process.argv[2] || 'data';
fs.mkdirSync(out, { recursive: true });
const seeds = store.seedProposals().map((p) => ({ ...p, reqText: search.reqText(p) }));
fs.writeFileSync(path.join(out, 'seeds.json'), JSON.stringify(seeds, null, 1));
fs.writeFileSync(path.join(out, 'scenarios.json'), JSON.stringify({ REQ_TYPES: sc.REQ_TYPES, STRATEGIES: sc.STRATEGIES, ENDINGS: sc.ENDINGS, STAGES: sc.STAGES, SCENARIOS: sc.SCENARIOS }, null, 1));
fs.writeFileSync(path.join(out, 'parts.json'), JSON.stringify({ PARTS: parts.PARTS, NEXT: parts.NEXT, RELATED: parts.RELATED, REQ_LABEL: parts.REQ_LABEL }, null, 1));
const lay = Object.values(data.L).map((l) => ({ f: l.f, c: l.c, code: l.code, name: l.name, when: l.when, g: l.g, p: l.p, p2: l.p2, ind: l.ind, sol: l.sol, nI: l.nI }));
fs.writeFileSync(path.join(out, 'catalog_min.json'), JSON.stringify({
  indKw: data.IND_KW, products: data.PRODUCTS, solutions: data.SOLUTIONS, industries: Object.values(data.IND), layouts: lay,
  cases: data.CASES.map((c) => ({ id: c.id, cust: c.cust, ind: c.ind, title: c.title, sub: c.sub, proof: c.proof, prod: c.prod, sol: c.sol, space: c.space })),
}, null, 1));
console.log('seeds', seeds.length, 'scenarios', sc.SCENARIOS.length, 'layouts', lay.length);
