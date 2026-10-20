// 150개(50명 × 난이도 3) 중 서로 다른 10개를 고르고, 각자에게 맞는 Best Scenario 를 스토리라인으로 붙인다.
//   node select.mjs [--n 10] [--out sets/diverse10.json]
// 다양성 기준: 업종 10개 모두 다름 · Best Scenario 모두 다름 · 난이도 3/4/3 · 성별 5:5 근처 · 요구 유형(신규 · 교체 · 운영 · 확산 · 경쟁) 고루
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/env.mjs';
import { personaDb } from './lib/persona.mjs';
import * as E from './engine/index.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const N = Number(args.n || 10);
const MIN_MATCH = Number(args.min || 6.5); // 스토리라인이 고객 상황과 충분히 맞을 때만 (업종 + 유형 또는 업종 + 제품 수준)
const OUT = path.resolve(ROOT, args.out || 'sets/diverse10.json');

/** 페르소나 ↔ Best Scenario 맞춤 점수 (근거 포함) */
export function matchScore(p, s) {
  const why = []; let sc = 0;
  if (s.std) sc -= 1.5; // 표준 제안서(37장)는 스토리라인이 아니라 양식 — 뒤로
  if (s.ind && s.ind === p.ind) { sc += 4; why.push('같은 업종'); } else if (!s.ind) { sc += 1; why.push('업종 공통'); }
  if (s.req === p.req.type) { sc += 3; why.push('같은 요구 유형'); }
  if (s.strategy === p.req.strategy) { sc += 1.5; why.push('같은 전략'); }
  const hp = p.req.products.filter((x) => s.products.includes(x)); const hs = p.req.solutions.filter((x) => x !== 'care' && s.solutions.includes(x)); // care(유지보수 서비스)는 어디나 붙어 변별력이 없음
  sc += Math.min(3, hp.length) + 0.8 * Math.min(3, hs.length);
  if (!hp.length && !hs.length) sc -= 2.5; // 제품 · 솔루션이 하나도 겹치지 않으면 스토리라인이 고객 품목과 어긋남
  if (hp.length) why.push('제품 ' + hp.join(','));
  if (hs.length) why.push('솔루션 ' + hs.join(','));
  return { sid: s.id, score: Math.round(sc * 10) / 10, why };
}

export function bestScenarios(p, k = 3) {
  return E.SCENARIOS.map((s) => matchScore(p, s)).sort((a, b) => b.score - a.score).slice(0, k);
}

function rng(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

function select() {
  const P = personaDb().personas;
  const cand = P.map((p) => ({ p, best: bestScenarios(p, 4).filter((b) => b.score >= MIN_MATCH) })).filter((c) => c.best.length);
  // 무작위 탐욕 2,000번 (시드 고정) — 목표: 맞춤 점수 합 + 요구 유형 · 전략 다양성, 성별 차이 · 한 유형 쏠림은 감점. 업종 · 시나리오 중복은 금지.
  const objective = (pk) => {
    const types = new Set(pk.map((x) => x.c.p.req.type)).size;
    const strat = new Set(pk.map((x) => E.SC[x.sc.sid].strategy)).size;
    const f = pk.filter((x) => x.c.p.person.gender === 'F').length;
    const cnt = {}; for (const x of pk) cnt[x.c.p.req.type] = (cnt[x.c.p.req.type] || 0) + 1;
    const over = Object.values(cnt).reduce((a, n) => a + Math.max(0, n - 3), 0); // 한 유형이 3명을 넘지 않게
    return pk.reduce((a, x) => a + x.sc.score, 0) + 4 * types + 1 * strat - 4 * Math.abs(2 * f - pk.length) - 8 * over;
  };
  let best = null; let bestV = -1e9;
  const rand = rng(20261018);
  for (let it = 0; it < 2000; it++) {
    const order = cand.map((c) => ({ c, k: rand() * (0.6 + c.best[0].score / 12) })).sort((a, b) => b.k - a.k).map((x) => x.c);
    const pk = []; const ind = new Set(); const scs = new Set();
    for (const c of order) {
      if (pk.length >= N) break;
      if (ind.has(c.p.ind)) continue;
      const sc = c.best.find((b) => !scs.has(b.sid)); if (!sc) continue;
      pk.push({ c, sc }); ind.add(c.p.ind); scs.add(sc.sid);
    }
    if (pk.length < N) continue;
    const v = objective(pk);
    if (v > bestV) { bestV = v; best = pk; }
  }
  const picked = best;
  // 난이도 배정: id 순서로 2 → 3 → 1 을 돌린다 (3/4/3). 같은 난이도에 요구 유형 · 성별이 섞이도록.
  const order = [...picked].sort((a, b) => a.c.p.id.localeCompare(b.c.p.id));
  const lvOf = {};
  order.forEach((x, i) => { lvOf[x.c.p.id] = [2, 3, 1][i % 3]; });
  return picked.map(({ c, sc }) => {
    const p = c.p; const s = E.SC[sc.sid];
    return {
      pid: p.id, level: lvOf[p.id], sid: sc.sid,
      label: `${p.customer} ${p.person.name} · ${E.LV[lvOf[p.id]].name}`,
      ind: p.ind, indName: E.IND[p.ind] ? E.IND[p.ind].name : p.ind, gender: p.person.gender, reqType: p.req.type,
      scenario: `${sc.sid} ${s.title}`, strategy: s.strategy, match: sc.score, why: sc.why,
    };
  }).sort((a, b) => a.pid.localeCompare(b.pid));
}

if (process.argv[1] && process.argv[1].endsWith('select.mjs')) {
  const items = select();
  const set = { name: path.basename(OUT, '.json'), created: new Date().toISOString(), rule: '업종 · Best Scenario 중복 없음 · 난이도 3/4/3 · 성별 균형 · 요구 유형 고루', items };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(set, null, 1));
  console.table(items.map((x) => ({ pid: x.pid, L: x.level, ind: x.ind, type: x.reqType, g: x.gender, scenario: x.scenario.slice(0, 30), st: x.strategy, match: x.match })));
  console.log('→', path.relative(process.cwd(), OUT));
}
