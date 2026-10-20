// scenarios.js · scenario_fills.js → build/bs/data.json (브리프 · 검사용)
import fs from 'node:fs';
const S = await import('../../src/scenarios.js');
const F = await import('../../src/scenario_fills.js');
const sc = S.SCENARIOS.map((s) => ({ ...s, slides: S.slidesOfScenario(s).map((x) => ({ f: x.f, role: x.role, stage: x.stage.key, stageName: x.stage.name, goal: x.stage.goal })) }));
fs.writeFileSync('build/bs/data.json', JSON.stringify({ scenarios: sc, fills: F.FILLS, customer: F.FILL_CUSTOMER, req: S.REQ_TYPES, strat: S.STRATEGIES, endings: S.ENDINGS }, null, 0));
console.log('ok', sc.length);
