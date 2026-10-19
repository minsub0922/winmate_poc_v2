// B2B 전략 시뮬레이션 — 제안 품질 집계 · 추천 후보 · 참고할 제안서.
// 품질 기준은 '제안서 검토'의 평가 기준(review/criteria.js)에서 대화로 확인할 수 있는 대표 기준만 골랐다.
// 고객 대사 · 점수 · 추천 답변은 모두 AI(engine.js)가 만든다. 여기는 그 값을 묶어 계산하고 자료 후보를 고르는 일만 한다.
import { CR, CAT, band } from '../review/criteria.js';
import { P, S, C } from '../../services/catalog.js';
import { SCENARIOS, REQ_TYPES, STRATEGIES, STAGES } from '../templates/scenarios.js';
import { toks, recommendContext } from '../../services/search.js';
import { segRefs } from '../../repositories/proposals.js';
import { STAGE_IX, SIM_STAGES, setupText, setupRefs, refName } from './profile.js';

export const SIM_CATS = [
  { id: 'CU', name: '고객 맞춤', icon: 'building', crit: ['CU2', 'CU3', 'CU4'] },
  { id: 'PR', name: '제품 · 솔루션', icon: 'monitor', crit: ['PR3', 'PR4', 'PR6'] },
  { id: 'VS', name: '가치 · 스토리', icon: 'gem', crit: ['VS1', 'VS2', 'VS4', 'VS6'] },
  { id: 'MK', name: '근거 · 신뢰', icon: 'shield', crit: ['VS5', 'MK3', 'WR5'] },
].map((c) => ({ ...c, w: CAT[c.id] ? CAT[c.id].w : 15, desc: CAT[c.id] ? CAT[c.id].desc : '' }));
export const SIM_CRIT = SIM_CATS.flatMap((c) => c.crit);
// 대화에서 이 기준을 보는 방법(검토 기준 설명은 CR[id].desc)
export const CHAT_DESC = {
  CU2: '고객이 말한 요구사항 · 관심사 하나하나에 답했나',
  CU3: '결정권자가 신경 쓰는 비용 · 성과 · 리스크 언어로 말했나',
  CU4: '이 고객의 현재 문제를 구체적으로 짚거나 확인했나',
  PR3: '언급한 제품이 고객의 공간 · 업종 환경에 맞나',
  PR4: '하드웨어가 운영 솔루션 · 서비스로 이어지나',
  PR6: '공간별 구성 · 수량 · 단계가 그려지나',
  VS1: '고객이 얻는 가치가 2~4개로 선명한가',
  VS2: '효과를 전후 수치 · KPI로 말했나',
  VS4: '삼성이어야 하는 이유를 근거와 함께 말했나',
  VS6: '일정 · 파일럿 · 다음 단계가 구체적인가',
  VS5: '비슷한 업종의 도입 사례로 증명했나',
  MK3: '수치마다 기준 · 출처가 있나',
  WR5: '최고 · 최초 · 100% 같은 근거 없는 단정을 피했나',
};
export const critName = (id) => (CR[id] ? CR[id].name : id);

// ---------------------------------------------------------------- text helpers
const plainOf = (segs) => (Array.isArray(segs) ? segs.map((s) => (s.t != null ? s.t : ' ' + refName(s.ref) + ' ')).join('') : String(segs || ''));
export const msgPlain = (m) => (m.who === 'me' ? plainOf(m.segs) : m.text || '');

function sellerRefs(sim) { return [...new Set(sim.msgs.filter((m) => m.who === 'me').flatMap((m) => segRefs(m.segs)))]; }
export function mentionedRefs(sim) { return sellerRefs(sim); }

/** category & total quality from criterion scores (AI scores; weighting only) */
export function aggregate(scores) {
  if (!scores) return { total: null, cats: SIM_CATS.map((c) => ({ ...c, v: null })) };
  const cats = SIM_CATS.map((c) => {
    let s = 0, w = 0;
    for (const id of c.crit) { const v = scores[id]; if (v == null) continue; const wt = CR[id] ? CR[id].w : 1; s += v * wt; w += wt; }
    return { ...c, v: w ? Math.round(s / w) : null };
  });
  let s = 0, w = 0; for (const c of cats) if (c.v != null) { s += c.v * c.w; w += c.w; }
  return { total: w ? Math.round(s / w) : null, cats };
}
export { band };

/** 만족도 값에서 표정 단계 (AI가 mood를 빠뜨렸을 때 그 만족도로 계산) */
export function moodOf(v, L) {
  if (v >= L.win) return '만족';
  if (v >= 60) return '호의';
  if (v >= 40) return '중립';
  if (v >= 25) return '의심';
  return '불만';
}

// ---------------------------------------------------------------- AI에 줄 자료 후보
function pseudoProposal(sim) { return { title: sim.setup.title || '', customer: sim.profile.company, req: { free: sim.setup.req }, ctx: sim.setup.refs, ind: sim.profile.ind }; }
/** 프롬프트에 넣을 후보 제품 · 솔루션 · 사례 (설정 연결 항목 우선 + 업종 · 요구사항 카탈로그 조회) */
export function candidates(sim) {
  const pr = pseudoProposal(sim); const ind = sim.profile.ind || null;
  const base = setupRefs(sim.setup);
  const add = (kind, type) => recommendContext(pr, ind, kind, 6).map((x) => type + ':' + x.id);
  const all = [...base, ...add('products', 'product'), ...add('solutions', 'solution'), ...add('cases', 'case')];
  const uniq = [...new Set(all)];
  return { products: uniq.filter((r) => r.startsWith('product:')).slice(0, 8), solutions: uniq.filter((r) => r.startsWith('solution:')).slice(0, 6), cases: uniq.filter((r) => r.startsWith('case:')).slice(0, 6) };
}
const tokRe = /@(product|solution|case):([A-Za-z0-9_-]+)/g;
/** "@product:qm55c" 토큰이 섞인 문장 → segs */
export function textToSegs(text) {
  const out = []; let i = 0; let m;
  const s = String(text || '');
  tokRe.lastIndex = 0;
  while ((m = tokRe.exec(s))) {
    const [type, id] = [m[1], m[2]];
    const ok = type === 'product' ? P[id] : type === 'solution' ? S[id] : C[id];
    if (m.index > i) out.push({ t: s.slice(i, m.index) });
    if (ok) out.push({ ref: type + ':' + id }); else out.push({ t: m[0].replace(/^@\w+:/, '') });
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push({ t: s.slice(i) });
  for (let j = 1; j < out.length; j++) if (out[j].t != null && out[j - 1].ref) out[j].t = out[j].t.replace(/^ (은|는|이|가|을|를|와|과|으로|로|에서|에|의|도|처럼|까지|부터|만|이면|면|이나|나)(?=[\s,.·)]|$)/, '$1');
  return out.reduce((a, x) => { const l = a[a.length - 1]; if (x.t != null && l && l.t != null) l.t += x.t; else a.push(x); return a; }, []);
}

// ---------------------------------------------------------------- 참고할 기존 제안서 (Best Scenario)
const REQ_HINT = [
  ['renew', ['교체', '리뉴얼', '노후', '바꾸', '업그레이드']], ['compete', ['입찰', '경쟁', '조달', 'RFP', '평가', '공급사', '전환']],
  ['ops', ['운영', '효율', '에너지', '원격', '절감', '자동화']], ['scale', ['파일럿', '확산', '전 지점', '공동 개발']],
  ['new', ['신규', '구축', '신축', '오픈', '처음']], ['brief', ['경영진', '첫 미팅', '투자 심의', '대표']],
];
export function similarScenarios(sim, limit = 3) {
  const pf = sim.profile;
  const convo = [setupText(sim.setup), pf.interests.join(' '), ...sim.msgs.map(msgPlain)].join('\n');
  const ct = new Set(toks(convo));
  const refs = new Set([...setupRefs(sim.setup), ...sellerRefs(sim)]);
  const reqTypes = REQ_HINT.filter(([, ws]) => ws.some((w) => convo.includes(w))).map(([k]) => k);
  if (sim.level === 3 && !reqTypes.includes('compete')) reqTypes.push('compete');
  const open = (sim.profile.concerns || []).filter((c) => c.revealed && !c.resolved);
  const stage = sim.cur.stage || 'open';
  return SCENARIOS.map((s) => {
    let sc = 0; const why = [];
    if (sim.setup.sid === s.id) { sc += 4; why.push('이 요구사항의 원본'); }
    if (pf.ind && s.ind === pf.ind) { sc += 3; why.push('같은 업종'); } else if (!s.ind) sc += 0.6;
    if (reqTypes.includes(s.req)) { sc += 1.6; why.push(REQ_TYPES[s.req].label.split(' · ')[0]); }
    const hitP = s.products.filter((id) => refs.has('product:' + id)); const hitS = s.solutions.filter((id) => refs.has('solution:' + id)); const hitC = s.cases.filter((id) => refs.has('case:' + id));
    sc += hitP.length * 0.9 + hitS.length * 1.1 + hitC.length * 1.4;
    for (const id of hitS.slice(0, 1)) why.push(S[id].name);
    for (const id of hitP.slice(0, 1)) why.push(P[id].model);
    const st = toks([s.title, s.situation, s.signals.join(' '), s.criteria.join(' '), s.kpis.join(' '), s.objections.map((o) => o[0]).join(' ')].join(' '));
    let hit = 0; for (const w of new Set(st)) if (ct.has(w)) hit++;
    sc += Math.min(3, hit * 0.06);
    // 지금 흐름에서 참고할 포인트
    let tip = null;
    for (const c of open) {
      const ck = new Set(toks(c.text + ' ' + c.kw.join(' ')));
      const ob = s.objections.map(([q, a]) => ({ q, a, n: toks(q).filter((w) => ck.has(w)).length })).sort((a, b) => b.n - a.n)[0];
      if (ob && ob.n >= 2) { tip = { kind: 'objection', label: '고객 우려 대응', q: ob.q, a: ob.a }; sc += 1.2; why.push('같은 우려 대응'); break; }
    }
    if (!tip) {
      const keys = SIM_STAGES[STAGE_IX[stage] ?? 0].keys;
      const g = s.flow.find((x) => keys.includes(x.key)) || s.flow[0];
      tip = stage === 'close' ? { kind: 'ask', label: '결말 · 결정 요청', q: s.ask, a: (s.next || []).slice(0, 2).join(' · ') }
        : { kind: 'stage', label: g.name, q: g.goal, a: stage === 'value' || stage === 'open' ? s.thesis : (g.slides[0] && g.slides[0].role) || '' };
    }
    return { s, score: sc, why: [...new Set(why)].slice(0, 3), tip, strat: STRATEGIES[s.strategy] };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}
export { STAGES };
