// 페르소나 150(50명 × 난이도 3) → 앱 시뮬레이션 세션(sim) 으로.
// 매핑은 claude/sim-personas.md 의 '앱 연동 시 매핑'을 그대로 따른다:
//   company=customer · role=person.role · career=careerBase+careerTail · interests=req.criteria · concerns=levels[n].concerns
//   ask=levels[n].ask · kpis=req.kpis · 요구사항 텍스트=req.situation + signals
// 난이도별 관계 · 인식 · 경쟁 · 예산 · 말투는 앱 엔진이 LV(공통 3단계)에서 가져간다 — 페르소나 고유 값은 엔진이 아직 읽지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.mjs';
import * as E from '../engine/index.mjs';

export const PERSONA_FILE = path.join(ROOT, 'data', 'personas150.json');
let _db = null;
export function personaDb() {
  if (!_db) _db = JSON.parse(fs.readFileSync(PERSONA_FILE, 'utf8'));
  return _db;
}
export const personaById = (id) => personaDb().personas.find((p) => p.id === id);

// ---- profile.js 의 내부 도우미와 같은 규칙 (export 되지 않아 그대로 옮김)
const KW_STOP = new Set(['있다', '없다', '하다', '되다', '그리고', '그래서', '어떻게', '너무', '정말']);
export function kwOf(text) {
  const words = String(text || '').match(/[A-Za-z][A-Za-z0-9+.-]*|[가-힣]{2,}/g) || [];
  const out = [];
  for (let w of words) {
    w = w.replace(/(은|는|이|가|을|를|에|의|도|로|으로|에서|부터|까지|하고|하는|하면|한다|해서|했다|된다|되는|인가|인지|지만|으면)$/, '');
    if (w.length >= 2 && !KW_STOP.has(w) && !out.includes(w)) out.push(w);
  }
  return out.slice(0, 10);
}
function speakRef(q) {
  const t = String(q || '').trim().replace(/[.?!]+$/, '');
  if (/다$/.test(t)) return t + '는 점';
  if (/[나까지]$/.test(t)) return t + ' 하는 부분';
  return t + ' 부분';
}
function speak(q) {
  const t = String(q || '').trim().replace(/[.?!]+$/, '');
  if (/다$/.test(t)) return t + '는 점이 걱정입니다';
  if (/[나까지]$/.test(t)) return t + ' 하는 부분이 걱정입니다';
  return t + ' 부분이 걱정입니다';
}

/** 페르소나 고유 난이도 값(관계 · 경쟁 · 예산 …) — 엔진 개선(lvOverride) 실험 때만 쓴다 */
export function personaLevelInfo(p, level) {
  const v = p.levels[String(level)];
  return { relation: v.relation, perception: v.perception, competition: v.competition, budget: v.budget, style: v.decision, tone: v.tone, opening: v.opening, win: v.win };
}

/**
 * @param {string} pid  ps01 …
 * @param {1|2|3} level
 * @param {string} sid  매칭한 Best Scenario id (스토리라인 · 참고 사례)
 * @param {{personaLevel?:boolean}} [opt] personaLevel=true 면 페르소나 고유 난이도 값을 profile.lv 로 실어 보낸다(엔진이 읽을 때만 효과)
 */
export function buildSim(pid, level, sid, opt = {}) {
  const p = personaById(pid);
  if (!p) throw new Error('페르소나 없음: ' + pid);
  const v = p.levels[String(level)];
  const L = E.LV[level];
  const s = sid ? E.SC[sid] : null;
  const sig = (p.req.signals || []).map((x) => x.replace(/[“”"]/g, '')).slice(0, 3);
  const text = p.req.situation + (sig.length ? '\n고객의 말: ' + sig.map((x) => '“' + x + '”').join(' ') : '');
  const cases = [...new Set([p.case && E.C[p.case.id] ? String(p.case.id) : null, ...(s ? s.cases.map(String) : [])].filter(Boolean))];
  const setup = {
    source: 'persona', sid: sid || null, pid: null, persona: pid,
    customer: p.customer, ind: p.ind || '', role: p.person.role,
    req: E.seg(text), interests: (p.req.criteria || []).slice(0, 4),
    refs: { products: [...(p.req.products || [])], solutions: [...(p.req.solutions || [])], cases },
    title: p.req.title, gender: p.person.gender,
  };
  const concerns = (v.concerns || []).map((c, i) => ({
    id: 'c' + (i + 1), key: 'obj' + i, text: c.text, short: c.text.length > 16 ? c.text.slice(0, 15) + '…' : c.text,
    ref: speakRef(c.text), say: speak(c.text), kw: kwOf(c.text + ' ' + (c.answer || '')), kwq: kwOf(c.text), answer: c.answer || '',
    revealed: false, resolved: false, at: null,
  }));
  const profile = {
    name: p.person.name, gender: p.person.gender, age: p.person.age,
    career: [p.person.careerBase, v.careerTail].filter(Boolean).join(' · '),
    traits: v.traits || [], quote: v.quote || '', style: v.style || '', key: pid + '-' + level,
    role: p.person.role, company: p.customer, ind: p.ind || '', level,
    interests: setup.interests, concerns, ask: v.ask, next: s ? s.next || [] : [], kpis: p.req.kpis || [],
    ...(opt.personaLevel ? { lv: personaLevelInfo(p, level) } : {}),
  };
  const t = Date.now();
  return {
    id: 'sim-' + pid + '-L' + level, createdAt: t, updatedAt: t, status: 'active', level, setup, profile,
    msgs: [], trend: [{ v: L.start }],
    cur: { satisfaction: L.start, trust: L.meters.trust * 18, interest: 50, mood: L.start >= 60 ? '호의' : L.start >= 40 ? '중립' : '의심', why: '', stage: 'open', scores: null, notes: {}, suggest: [], src: 'rule', evalAt: 0 },
    aiOff: false, debrief: null,
  };
}

/** ui/sim.jsx applyTurn 과 같은 규칙으로 한 턴을 반영한다 (앱 화면과 똑같이 상태가 쌓이도록) */
export function applyTurn(d, r) {
  const ev = r.ev;
  d.msgs.push({ id: 'c' + d.msgs.length, who: 'cust', text: r.text, ts: Date.now(), ev: { satisfaction: ev.satisfaction, delta: ev.delta || 0, why: ev.why || '', mood: ev.mood, stage: ev.stage, revealed: ev.revealedNow || [], resolved: ev.resolvedNow || [], ai: !!r.ai } });
  if (ev.concerns) d.profile.concerns = ev.concerns.map((c) => ({ ...c }));
  d.cur = { ...d.cur, satisfaction: ev.satisfaction, trust: ev.trust, interest: ev.interest, mood: ev.mood, why: ev.why || '', stage: ev.stage, scores: ev.scores || d.cur.scores, notes: ev.scores ? ev.notes : d.cur.notes, suggest: ev.suggest || [], src: r.ai ? 'ai' : 'rule', evalAt: d.msgs.length };
  d.trend.push({ v: ev.satisfaction });
  if (ev.end === 'win') d.status = 'won';
  else if (ev.end === 'lose') d.status = 'lost';
  if (r.note === 'off') d.aiOff = true;
}

/** 페르소나 카드(리포트 · 심사용) — 숨은 우려와 정답 포함 */
export function personaCard(pid, level) {
  const p = personaById(pid); const v = p.levels[String(level)];
  return {
    id: pid, level, levelName: E.LV[level].name, ind: p.ind, indName: E.IND[p.ind] ? E.IND[p.ind].name : p.ind, customer: p.customer, orgType: p.orgType, scale: p.scale,
    person: `${p.person.name}(${p.person.age}) · ${p.person.role}`, gender: p.person.gender, reqTitle: p.req.title, reqType: p.req.type,
    situation: p.req.situation, pains: p.req.pains, goals: p.req.goals, constraints: p.req.constraints, criteria: p.req.criteria,
    relation: v.relation, perception: v.perception, competition: v.competition, budget: v.budget, decision: v.decision, tone: v.tone,
    traits: v.traits, quote: v.quote, concerns: v.concerns, ask: v.ask, win: v.win, caseCust: p.case && p.case.cust,
  };
}
