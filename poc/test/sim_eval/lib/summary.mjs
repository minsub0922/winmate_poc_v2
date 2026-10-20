// 실행 폴더(runs/<id>) → 세션별 · 전체 지표. report.mjs 와 테스트 벤치가 함께 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../engine/index.mjs';
import { CHECKS } from './checks.mjs';
import { JUDGE_DIMS } from './judge.mjs';

export function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}
const mean = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = mean(xs), my = mean(ys); let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : null;
}

export function sessionSummary(events, meta = {}) {
  const start = events.find((e) => e.type === 'start') || {};
  const turns = events.filter((e) => e.type === 'turn');
  const end = events.find((e) => e.type === 'end') || null;
  const judge = events.find((e) => e.type === 'judge') || null;
  const errors = events.filter((e) => e.type === 'error');
  const seller = turns.filter((t) => t.n > 0);
  const checks = {};
  for (const t of turns) for (const c of t.checks || []) { const k = c.id; checks[k] = checks[k] || { n: 0, level: c.level, turns: [] }; checks[k].n++; checks[k].turns.push(t.n); if (c.level === 'fail') checks[k].level = 'fail'; }
  const ai = turns.filter((t) => t.customer && t.customer.ai && !t.customer.note).length;
  const fin = turns.length ? turns[turns.length - 1].ev : null;
  // 엔진 AI 점수 vs 규칙 점수(같은 발화) — 턴 평균 절대 차이
  const ruleGap = mean(seller.filter((t) => t.rule && t.rule.scores && t.ev.scores).map((t) => mean(E.SIM_CRIT.map((id) => Math.abs((t.ev.scores[id] ?? 0) - (t.rule.scores[id] ?? 0))))));
  // 스토리라인 단계(영업이 의도한 단계) vs 엔진이 본 대화 단계
  const st = seller.filter((t) => t.seller && t.seller.simStage);
  const stageAgree = st.length ? pct(st.filter((t) => t.seller.simStage === t.ev.stage || (t.seller.simStage === 'proof' && t.ev.stage === 'objection')).length, st.length) : null;
  // 심사 기준 점수 vs 엔진 최종 점수
  let calib = null;
  if (judge && judge.criteria && fin && fin.scores) {
    const ids = E.SIM_CRIT.filter((id) => judge.criteria[id] != null && fin.scores[id] != null);
    const diffs = ids.map((id) => fin.scores[id] - judge.criteria[id]);
    calib = { mae: r1(mean(diffs.map(Math.abs))), bias: r1(mean(diffs)), r: (() => { const v = pearson(ids.map((id) => fin.scores[id]), ids.map((id) => judge.criteria[id])); return v == null ? null : Math.round(v * 100) / 100; })(), per: Object.fromEntries(ids.map((id) => [id, { engine: fin.scores[id], judge: judge.criteria[id] }])) };
  }
  const jq = judge && judge.criteria ? E.aggregate(judge.criteria).total : null;
  return {
    id: meta.id || start.sid, pid: start.pid, level: start.level, levelName: start.levelName, mode: start.mode, modeLabel: start.modeLabel,
    customer: start.customer, person: start.person, ind: start.ind, indName: start.indName, scenario: start.scenario, scenarioTitle: start.scenarioTitle, reqTitle: start.reqTitle, ask: start.ask,
    win: start.win, lose: start.lose, startSat: start.start,
    status: end ? end.status : (meta.status || 'running'), turns: seller.length,
    satisfaction: fin ? fin.satisfaction : null, quality: fin ? fin.quality : null, cats: fin ? fin.cats : null, scores: fin ? fin.scores : null,
    trend: turns.map((t) => ({ n: t.n, sat: t.ev.satisfaction, q: t.ev.quality, rq: t.rule ? t.rule.quality : null, stage: t.ev.stage, story: t.seller ? t.seller.simStage : null, rv: t.ev.revealed, rs: t.ev.resolved, end: t.ev.end })),
    concerns: end ? end.concerns : (turns.length ? turns[turns.length - 1].concerns : []),
    aiRate: pct(ai, turns.length), aiTurns: ai, nTurns: turns.length,
    avgCustMs: Math.round(mean(turns.map((t) => t.customer && t.customer.ms).filter(Boolean)) || 0), avgReplyChars: Math.round(mean(turns.map((t) => t.customer && t.customer.chars)) || 0),
    avgSellerChars: Math.round(mean(seller.map((t) => t.seller && t.seller.text.length)) || 0),
    checks, ruleGap: r1(ruleGap), stageAgree, calib, judge, judgeQuality: jq, errors: errors.map((e) => `${e.where}: ${e.msg}`), debrief: end ? end.debrief : null,
  };
}

export function runSummary(dir) {
  const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
  const sessions = run.sessions.map((m) => sessionSummary(readJsonl(path.join(dir, 'sessions', m.id + '.jsonl')), m));
  return {
    run: { id: run.id, tag: run.tag, created: run.created, finished: run.finished, status: run.status, models: run.models, turns: run.turns, personaLevel: run.personaLevel, engine: run.engine, llm: run.llm, note: run.note || '' },
    ...aggregateSessions(sessions),
  };
}

/** 세션 요약 목록 → 전체 지표 (여러 실행을 합쳐 비교할 때도 쓴다) */
export function aggregateSessions(sessions) {
  const done = sessions.filter((s) => ['won', 'lost', 'ended'].includes(s.status));
  const by = (key) => { const g = {}; for (const s of done) (g[s[key]] = g[s[key]] || []).push(s); return g; };
  const groupStats = (list) => ({
    n: list.length, won: list.filter((s) => s.status === 'won').length, lost: list.filter((s) => s.status === 'lost').length, ended: list.filter((s) => s.status === 'ended').length,
    winRate: pct(list.filter((s) => s.status === 'won').length, list.length), quality: r1(mean(list.map((s) => s.quality))), satisfaction: r1(mean(list.map((s) => s.satisfaction))),
    turns: r1(mean(list.map((s) => s.turns))), judgeQuality: r1(mean(list.map((s) => s.judgeQuality))), sellerQ: r1(mean(list.map((s) => s.judge && s.judge.seller_quality))),
  });
  const modes = Object.fromEntries(Object.entries(by('mode')).map(([k, v]) => [k, groupStats(v)]));
  const main = done.filter((s) => s.mode === 'scenario');
  const levels = {}; for (const lv of [1, 2, 3]) levels[lv] = groupStats(main.filter((s) => s.level === lv));
  const checks = {};
  for (const s of sessions) for (const [k, v] of Object.entries(s.checks)) { checks[k] = checks[k] || { id: k, label: CHECKS[k], n: 0, sessions: 0, level: v.level }; checks[k].n += v.n; checks[k].sessions++; if (v.level === 'fail') checks[k].level = 'fail'; }
  const allTurns = sessions.reduce((a, s) => a + s.nTurns, 0);
  const judged = sessions.filter((s) => s.judge);
  const judgeDims = Object.fromEntries(Object.keys(JUDGE_DIMS).map((k) => [k, r1(mean(judged.map((s) => s.judge.scores[k])))]));
  const outcomeAgree = judged.length ? pct(judged.filter((s) => (s.judge.expected_outcome === 'win') === (s.status === 'won') && (s.judge.expected_outcome === 'lose') === (s.status === 'lost')).length, judged.length) : null;
  const issues = judged.flatMap((s) => s.judge.issues.map((x) => ({ ...x, session: s.id, pid: s.pid, level: s.level, mode: s.mode })));
  const critBias = {};
  for (const id of E.SIM_CRIT) {
    const d = judged.filter((s) => s.calib && s.calib.per[id]).map((s) => s.calib.per[id].engine - s.calib.per[id].judge);
    critBias[id] = { name: E.critName(id), bias: r1(mean(d)), mae: r1(mean(d.map(Math.abs))), n: d.length };
  }
  return {
    totals: {
      sessions: sessions.length, done: done.length, turns: allTurns, aiRate: pct(sessions.reduce((a, s) => a + s.aiTurns, 0), allTurns),
      avgCustMs: Math.round(mean(sessions.map((s) => s.avgCustMs).filter(Boolean)) || 0), avgReplyChars: Math.round(mean(sessions.map((s) => s.avgReplyChars)) || 0),
      ruleGap: r1(mean(sessions.map((s) => s.ruleGap))), stageAgree: r1(mean(sessions.map((s) => s.stageAgree))),
      calibMae: r1(mean(judged.map((s) => s.calib && s.calib.mae))), calibBias: r1(mean(judged.map((s) => s.calib && s.calib.bias))), outcomeAgree,
      judgeAvg: (() => { const v = Object.values(judgeDims).filter((x) => x != null); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; })(),
      ungrounded: sessions.reduce((a, s) => a + ((s.checks.ungrounded_high || {}).n || 0), 0),
      discrimination: modes.scenario && modes.weak ? { quality: r1(modes.scenario.quality - modes.weak.quality), satisfaction: r1(modes.scenario.satisfaction - modes.weak.satisfaction), judgeQuality: r1((modes.scenario.judgeQuality ?? 0) - (modes.weak.judgeQuality ?? 0)) } : null,
    },
    modes, levels, checks: Object.values(checks).sort((a, b) => (a.level === b.level ? b.n - a.n : a.level === 'fail' ? -1 : 1)), judgeDims, critBias, issues, sessions,
  };
}
