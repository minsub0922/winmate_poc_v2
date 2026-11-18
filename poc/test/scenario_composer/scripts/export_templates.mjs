// 목차 템플릿 × 업종(버티컬) 시나리오를 앱과 같은 코드(toc_templates.js ensureTocScenario)로 조립해 내보낸다.
//   node scripts/export_templates.mjs <out.json> [tid:vid,tid:vid,… | all]
// 출력: { templates:[{id,name,desc,tocs}], verticals:[{id,nm,full,g,cust,ai,short,ind}], tocs:{key:{name,type,goal}},
//         decks:[{ tid, vid, sid, title, customer, ind, products, solutions, cases, thesis,
//                  parts:[{ toc, type, name, goal, items, deck, exemplar:[{f, role, t, img}] }] }], layout_ids:[…] }
// 'all' 은 장(레이아웃) id 전수 조사용 — 모든 템플릿 × 모든 업종.
import fs from 'node:fs';
import { TOC_TEMPLATES, TOCS, TPL, tocName, useTocContent, ensureTocScenario, tocVerticals } from '../../../../app/web/src/domain/templates/toc_templates.js';
import { FILLS, FILL_CUSTOMER } from '../../../../app/web/src/domain/templates/scenario_fills.js';
import { STORY } from '../../../../app/web/src/domain/templates/scenario_story.js';

const content = JSON.parse(fs.readFileSync(new URL('../../../../app/web/src/domain/templates/toc_content.json', import.meta.url), 'utf8'));
useTocContent(content);
const out = process.argv[2];
const want = process.argv[3] || 'all';
const verticals = tocVerticals();
const pairs = want === 'all'
  ? TOC_TEMPLATES.flatMap((t) => verticals.map((v) => [t.id, v.id]))
  : want.split(',').map((x) => x.split(':'));
const decks = []; const ids = new Set(); const errors = [];
for (const [tid, vid] of pairs) {
  let s = null;
  try { s = ensureTocScenario(tid, vid); } catch (e) { errors.push({ tid, vid, error: String(e && e.message || e) }); continue; }
  if (!s) { errors.push({ tid, vid, error: 'no scenario' }); continue; }
  const T = TPL[tid]; const fills = FILLS[s.id] || []; const st = STORY[s.id] || { parts: {} };
  let k = 0; let ti = 0;
  const parts = s.flow.map((g, gi) => {
    const deck = !!g.deck || (gi === 0 && /표지/.test(g.name));
    const toc = deck ? null : T.tocs[ti++] || null;
    const exemplar = g.slides.map((x) => { const o = fills[k++] || {}; ids.add(x.f); return { f: x.f, role: x.role, t: o.t || {}, img: o.img || {} }; });
    const sp = st.parts && st.parts[g.name];
    return { toc, type: deck ? 'cover' : (toc && TOCS[toc] ? TOCS[toc].type : (sp && sp.type) || 'free'), name: deck ? '표지' : g.name.replace(/^(목차 · )?\d+\s+/, ''), goal: g.goal || '',
      items: (sp && sp.items) || g.slides.map((x) => x.role.split(' — ')[0]), deck, exemplar };
  });
  if (want === 'all') { decks.push({ tid, vid, sid: s.id, n: fills.length, f: parts.flatMap((p) => p.exemplar.map((x) => x.f)) }); continue; }
  decks.push({ tid, vid, sid: s.id, title: s.title, customer: FILL_CUSTOMER[s.id] || '', ind: s.ind || null, products: s.products || [], solutions: s.solutions || [],
    cases: (s.cases || []).map(String), thesis: s.thesis || '', situation: s.situation || '', parts });
}
const tocs = Object.fromEntries(Object.entries(TOCS).map(([k, v]) => [k, { name: v.name, type: v.type, goal: v.goal }]));
fs.writeFileSync(out, JSON.stringify({
  templates: TOC_TEMPLATES.map((t) => ({ id: t.id, name: t.name, desc: t.desc, tocs: t.tocs, deck: t.deck })), verticals, tocs, decks,
  layout_ids: [...ids].sort(), errors,
}));
console.log('ok', decks.length, 'decks', ids.size, 'layout ids', errors.length, 'errors');
