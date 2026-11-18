// DSS 종류(제품 DB 행 dssKind — proddb/build/dss/classify.py 가 수집한 뒤 LLM 으로 판정)를 앱이 나눠 쓰는지:
// 새로 고르는 제품 목록에는 제품만, 솔루션 · 서비스 · 구독 행은 솔루션 · 서비스 폴더(솔루션 카탈로그 모양)로, 앱 솔루션의 판매 단위인 행은 그 솔루션으로.
// 지난 제안서가 제품으로 고른 행도 보이는 곳 · 파트 판단에서는 그 종류로. 실제 데이터의 스냅샷에 종류만 붙여 돈다(파일은 안 바꾼다).
//   node app/tests/dss-kinds.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { configureBootstrap } from '../web/src/api/bootstrap.js';
const read = (n) => JSON.parse(fs.readFileSync(new URL('../data/' + n + '.json', import.meta.url)));
const products = read('products_db');
const byName = (re) => products.products.find((p) => re.test(p.name) && !p.deprecated && !p.supersededBy);
const magic = byName(/^MagicINFO/), wash = byName(/^전문세척$/), boiler = byName(/히트펌프 보일러/), sub = { ...byName(/^유지보수$/) };
assert.ok(magic && wash && boiler && sub.id, '스냅샷에 쓸 행이 있다');
const kinds = { [magic.id]: ['solution', 'magicinfo'], [wash.id]: ['service'], [boiler.id]: ['device'], [sub.id]: ['subscription'] };
const rows = products.products.map((p) => (kinds[p.id] ? { ...p, dssKind: kinds[p.id][0], ...(kinds[p.id][1] ? { dssSame: kinds[p.id][1] } : {}) } : p));
configureBootstrap({ catalog: read('catalog'), images: read('images'), products: { ...products, products: rows } });

const { P, S, PRODUCTS, ACTIVE_PRODUCTS, SOLUTIONS, ROW_SOLUTIONS, dssKindOf, refInfo } = await import('../web/src/services/catalog.js');
const { dssOf, isServiceSolution } = await import('../web/src/services/dss.js');

// 제품 목록(새로 고르는 곳) — 제품만. 행은 P · PRODUCTS 에 남아 지난 제안서를 그린다
const active = new Set(ACTIVE_PRODUCTS.map((p) => p.id));
assert.ok(active.has(boiler.id) && !active.has(magic.id) && !active.has(wash.id) && !active.has(sub.id), '제품 목록에는 제품만');
assert.ok(P[magic.id] && P[wash.id] && PRODUCTS.length === products.counts.total, '행은 지우지 않는다');
assert.equal(dssKindOf(P[boiler.id]), 'device'); assert.equal(dssKindOf({}), 'device', '종류가 없으면 제품(판정 전 데이터)');

// 솔루션 · 서비스 폴더 — 솔루션 카탈로그 모양. 앱 솔루션의 판매 단위(dssSame)는 목록에서 빠지고 그 솔루션이 대표한다
const sols = new Set(SOLUTIONS.map((s) => s.id));
assert.ok(sols.has(wash.id) && sols.has(sub.id) && !sols.has(magic.id) && sols.has('magicinfo'));
assert.ok(S[magic.id] && S[wash.id].row && S[wash.id].cat === '서비스' && isServiceSolution(wash.id) && isServiceSolution(sub.id));
assert.equal(S[sub.id].dssLabel, '구독'); assert.equal(S[wash.id].dssLabel, '서비스');
assert.ok(ROW_SOLUTIONS.every((s) => Array.isArray(s.kw) && Array.isArray(s.with) && typeof s.desc === 'string'), '솔루션 목록이 쓰는 필드');
assert.deepEqual(refInfo('solution:' + wash.id), { type: 'solution', id: wash.id, label: wash.name, sub: '서비스', short: wash.name });

// 지난 제안서가 제품으로 고른 행 → 보이는 곳 · 파트 판단에서는 그 종류로(앱 솔루션의 판매 단위면 그 솔루션)
const d = dssOf({ ctx: { products: ['qm55c', boiler.id, magic.id, wash.id], solutions: ['vxt'], subscriptions: [] } });
assert.deepEqual(d.products, ['qm55c', boiler.id]);
assert.deepEqual(d.solutions, ['vxt', 'magicinfo']);
assert.deepEqual(d.services, [wash.id]);
// 새로 고른 솔루션 · 서비스 행은 ctx.solutions 에 — 그대로 그 종류
assert.deepEqual(dssOf({ ctx: { products: [], solutions: [wash.id, sub.id] } }).services, [wash.id, sub.id]);
console.log('dss-kinds: ok', { active: ACTIVE_PRODUCTS.length, rowSolutions: ROW_SOLUTIONS.length });
