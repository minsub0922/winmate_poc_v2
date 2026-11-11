import fs from 'node:fs';
import { SCENARIOS, REQ_TYPES, STRATEGIES, ENDINGS, STAGES } from '../../../../app/web/src/domain/templates/scenarios.js';
import { FILLS, FILL_CUSTOMER } from '../../../../app/web/src/domain/templates/scenario_fills.js';
import { STORY } from '../../../../app/web/src/domain/templates/scenario_story.js';
import { SCENARIO_BG } from '../../../../app/web/src/domain/templates/scenario_bg.js';
const out = [];
for (const s of SCENARIOS) {
  const fills = FILLS[s.id] || [];
  let k = 0;
  const flow = s.flow.map((g) => ({ key: g.key, name: g.name, goal: g.goal,
    slides: g.slides.map((x) => { const fl = fills[k]; const rec = { k, f: x.f, role: x.role, fill: fl && fl.f === x.f ? { t: fl.t || {}, img: fl.img || {}, r: fl.r || null, notes: fl.notes ?? null } : null, fillMismatch: fl && fl.f !== x.f ? fl.f : null }; k++; return rec; }) }));
  const { flow: _f, preview: _p, ...meta } = s;
  out.push({ ...meta, customer: FILL_CUSTOMER[s.id] || '', story: STORY[s.id] || null, flow, bg: SCENARIO_BG[s.id] || null, nFills: fills.length });
}
const OUT = process.argv[2] || new URL('../data/scenarios_full.json', import.meta.url);
fs.writeFileSync(OUT, JSON.stringify({ REQ_TYPES, STRATEGIES, ENDINGS, STAGES, scenarios: out }));
console.log('ok', out.length, out.reduce((a, s) => a + s.flow.reduce((b, g) => b + g.slides.length, 0), 0));
