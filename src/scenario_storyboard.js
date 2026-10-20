// Best Scenario · Storyboard — 시나리오 하나를 제안서(Storyboard)와 같은 모양으로 만든다.
// 상세 보기의 읽기 전용 Storyboard 버블(scenarios.jsx ScenarioStoryboard)과 ‘활용하기’로 만드는 내 제안서가 같은 값을 쓴다.
//   고객 요구사항 버블 = req(자유형식 · 입력 폼: 키맨별 요구) · 제품 · 솔루션 매칭 버블 = ctx · 파트 버블 = flow 의 단계(단계 하나 = 버블 하나)
//   레이아웃 = 단계의 장 + 채운 값(scenario_fills.js) + 배경 테마(scenario_bg.js). 표지만 든 단계는 숨은 표지 파트(data.js normalizeCovers).
// 키맨 · 파트 유형 · 내용은 scenario_story.js(STORY). 거기에 없는 시나리오는 flow · audience · criteria 로 만든다.
import { SC, STRATEGIES } from './scenarios.js';
import { fillOf, FILL_CUSTOMER } from './scenario_fills.js';
import { bgOfSlide, bgTheme } from './scenario_bg.js';
import { STORY } from './scenario_story.js';
import { PARTS } from './parts.js';
import { L, normalizeCovers } from './data.js';

/** a slide's values in this scenario — scenarios with a background theme give every slide its own photo */
export const ovOf = (id, k, f) => { const ov = fillOf(id, k, f); const bg = bgOfSlide(id, k); return bg ? { ...ov, bg } : ov; };

/** a stage's part type — STORY first, else the type most of its layouts are made for */
export function partTypeOf(stage, sid) {
  const st = sid && STORY[sid] && STORY[sid].parts[stage.name];
  if (st && PARTS[st.type]) return st.type;
  const c = {};
  for (const x of stage.slides) { const l = L[x.f]; if (l) c[l.p] = (c[l.p] || 0) + 1; }
  const first = L[stage.slides[0].f];
  let best = first ? first.p : 'free'; let n = 0;
  for (const [k, v] of Object.entries(c)) if (v > n) { best = k; n = v; }
  return PARTS[best] ? best : 'free';
}
const itemsOf = (stage, sid) => {
  const st = sid && STORY[sid] && STORY[sid].parts[stage.name];
  return st && st.items && st.items.length ? st.items.slice() : stage.slides.map((x) => x.role.split(' — ')[0]);
};
/** 키맨별 요구 — STORY, else the audience with the scenario's decision criteria spread over them */
function keymenOf(s) {
  const st = STORY[s.id];
  if (st && st.keymen && st.keymen.length) return st.keymen.map(([name, weight, reqs]) => ({ name, weight, reqs }));
  const who = [s.audience.lead, ...s.audience.others].slice(0, 4);
  const w = who.length === 1 ? [100] : who.map((_, i) => (i === 0 ? 40 : Math.round(60 / (who.length - 1))));
  return who.map((name, i) => ({ name, weight: w[i], reqs: s.criteria.filter((_, j) => j % who.length === i) }));
}

/** the scenario as a proposal: { title, customer, ind, req, ctx, parts, bg, scenario }.
 *  mk = { pid, sid, lid } id makers — stable ids for the read-only view, fresh ones (store.js uid) for 활용하기. */
export function storyboardOf(s, mk) {
  const id = mk || { pid: (i) => s.id + '-p' + i, kid: (i) => s.id + '-k' + i, lid: (k) => s.id + '-l' + k };
  const strat = STRATEGIES[s.strategy];
  const t = (x) => [{ t: x }];
  let k = 0;
  const parts = s.flow.map((g, i) => ({
    id: id.pid(i), type: partTypeOf(g, s.id), name: g.name, goal: g.goal, items: itemsOf(g, s.id), form: 'list', text: '', done: true,
    layouts: g.slides.map((x) => {
      const ov = ovOf(s.id, k, x.f); const n = Object.keys(ov.t).length + Object.keys(ov.img).length;
      return { uid: id.lid(k++), f: x.f, status: n ? 'done' : 'empty', ov };
    }),
  }));
  const st = STORY[s.id];
  const p = {
    title: s.title, customer: FILL_CUSTOMER[s.id] || '', ind: s.ind || null, stage: 'story', reqTab: 'form', scenario: s.id,
    req: {
      free: t(s.situation + '\n\n[Best Scenario · ' + s.title + '] 전략: ' + strat.label + ' — ' + s.thesis + '\n결말: ' + s.ask),
      form: {
        project: s.title, customer: FILL_CUSTOMER[s.id] || '', target: s.audience.lead,
        keymen: keymenOf(s).map((m, i) => ({ id: id.kid(i), name: m.name, weight: m.weight, reqs: m.reqs.map(t) })),
        note: (st && st.note) || s.thesis,
      },
      files: [],
    },
    ctx: { products: [...s.products], solutions: [...s.solutions], cases: [...s.cases] },
    parts,
  };
  const bg = bgTheme(s.id); if (bg) p.bg = bg;
  normalizeCovers(p); // 표지 → the hidden deck part (no bubble), like every proposal
  return p;
}

/** read-only Storyboard of scenario id (cached — the view only reads it) */
const CACHE = {};
export function scenarioStoryboard(sid) {
  if (!CACHE[sid] && SC[sid]) CACHE[sid] = { id: 'bs-view-' + sid, createdAt: 0, updatedAt: 0, exportedAt: null, ...storyboardOf(SC[sid]) };
  return CACHE[sid] || null;
}
/** slide k of the scenario ↔ layout uid in the read-only view */
export const viewUid = (sid, k) => sid + '-l' + k;
export const slideOfUid = (sid, u) => { const m = new RegExp('^' + sid + '-l(\\d+)$').exec(u || ''); return m ? +m[1] : -1; };
