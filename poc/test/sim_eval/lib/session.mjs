// 세션 하나 = 페르소나 1명 × 난이도 × 영업 담당자 유형. 턴마다 이벤트를 JSONL 로 흘려 실시간으로 볼 수 있게 한다.
// 턴이 끝날 때마다 상태(<id>.state.json)를 저장해, 실행이 끊겨도 --resume 으로 이어서 돈다.
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import * as E from '../engine/index.mjs';
import { buildSim, applyTurn, personaById } from './persona.mjs';
import { sellerTurn, MODES } from './seller.mjs';
import { checkTurn, storyToSimStage } from './checks.mjs';
import { judgeSession } from './judge.mjs';
import { engineSample } from './llm.mjs';

const ctx = new AsyncLocalStorage();
let installed;
/** 엔진의 getSample() 자리에 고객 LLM 을 꽂는다. 동시에 도는 세션마다 원문을 따로 받도록 AsyncLocalStorage 로 나눈다. */
export function installEngineLLM(llm) {
  if (installed === llm) return;
  installed = llm;
  E.setSample(llm ? engineSample(llm, (raw) => { const s = ctx.getStore(); if (s) s.raw.push(raw); }) : null);
}

const round = (v) => (v == null ? null : Math.round(v));
function evView(ev, sim) {
  const agg = E.aggregate(ev.scores || sim.cur.scores);
  return {
    satisfaction: ev.satisfaction, delta: ev.delta || 0, trust: round(ev.trust), interest: round(ev.interest), mood: ev.mood, why: ev.why || '', stage: ev.stage, end: ev.end || null,
    revealed: ev.revealedNow || [], resolved: ev.resolvedNow || [],
    quality: agg.total, cats: Object.fromEntries(agg.cats.map((c) => [c.id, c.v])),
    scores: ev.scores || sim.cur.scores || null, notes: ev.scores ? ev.notes : sim.cur.notes,
  };
}

function save(file, st) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(st)); fs.renameSync(tmp, file); }

/**
 * @param {object} o
 * @param {{pid:string, level:number, sid:string}} o.item
 * @param {'scenario'|'weak'|'suggest'} o.mode
 * @param {{seller:any, judge:any}} o.llms
 * @param {string} o.file       이벤트 JSONL
 * @param {string} o.stateFile  이어 돌리기용 상태
 * @param {number|{at:number}} [o.deadline] 이 시각(ms)이 지나면 새 턴을 시작하지 않고 멈춘다(paused)
 */
export async function runSession({ item, mode = 'scenario', maxTurns = 14, llms, file, stateFile, sessionId, personaLevel = false, onProgress, judge = true, deadline = Infinity }) {
  const over = (margin = 0) => Date.now() > (deadline && typeof deadline === 'object' ? deadline.at : deadline) - margin; // deadline: 숫자 또는 { at } (중지 신호로 바뀜)
  let st = null;
  if (stateFile && fs.existsSync(stateFile)) { try { st = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { st = null; } }
  if (st) fs.writeFileSync(file, st.events.map((e) => JSON.stringify(e)).join('\n') + (st.events.length ? '\n' : '')); // 끊긴 자리와 맞춘다
  const write = (ev) => { const e = { ...ev, sid: sessionId, t: Math.round((Date.now() - st.t0) / 100) / 10 }; st.events.push(e); fs.appendFileSync(file, JSON.stringify(e) + '\n'); };
  const persist = () => stateFile && save(stateFile, st);
  const L = E.LV[item.level];
  if (!st) {
    const sim = buildSim(item.pid, item.level, item.sid, { personaLevel });
    const p = personaById(item.pid);
    const s = item.sid ? E.SC[item.sid] : null;
    st = { t0: Date.now(), phase: 'turns', sim, events: [], rec: { sessionId, pid: item.pid, level: item.level, sid: item.sid, mode, modeLabel: MODES[mode], scenarioTitle: s ? `${s.id} ${s.title}` : '-', turns: [], status: 'active' } };
    fs.writeFileSync(file, '');
    write({
      type: 'start', pid: item.pid, level: item.level, levelName: L.name, mode, modeLabel: MODES[mode], scenario: item.sid, scenarioTitle: st.rec.scenarioTitle,
      customer: p.customer, person: `${p.person.name} · ${p.person.role}`, gender: p.person.gender, ind: p.ind, indName: E.IND[p.ind] ? E.IND[p.ind].name : p.ind,
      reqTitle: p.req.title, ask: sim.profile.ask, win: L.win, lose: L.lose, start: L.start, concerns: sim.profile.concerns.map((c) => ({ id: c.id, text: c.text })), maxTurns, personaLevel,
    });
    persist();
  }
  const { sim, rec } = st;
  onProgress && onProgress({ status: 'running' });
  const paused = () => { persist(); onProgress && onProgress({ status: 'paused' }); return { ...rec, paused: true }; };

  if (st.phase === 'turns') {
    for (let n = rec.turns.length; n <= maxTurns; n++) {
      if (over()) return paused();
      let seller = null;
      if (n > 0) {
        let last;
        for (let k = 0; k < 2 && !seller; k++) {
          try { seller = await sellerTurn(llms.seller, sim, { mode, maxTurns }); } catch (e) { last = e; }
        }
        if (!seller) { rec.status = 'error'; write({ type: 'error', where: 'seller', msg: String(last && last.message) }); break; }
        sim.msgs.push({ id: 'm' + sim.msgs.length, who: 'me', segs: seller.segs, ts: Date.now() });
      }
      const before = structuredClone(sim);
      const shadow = n > 0 ? E.ruleScores(sim) : { scores: null };
      const store = { raw: [] };
      let r;
      try {
        r = await ctx.run(store, () => E.customerTurn(sim, {}));
      } catch (e) {
        rec.status = 'error'; write({ type: 'error', where: 'customer', msg: String(e && e.message) }); break;
      }
      const raw = store.raw.find((x) => x.kind === 'turn') || null;
      const checks = checkTurn(before, r, raw, n === 0);
      applyTurn(sim, r);
      const turn = {
        type: 'turn', n,
        seller: seller ? { text: seller.text, story: seller.stage, simStage: storyToSimStage(seller.stage), move: seller.move, ms: seller.ms, source: seller.source } : null,
        customer: { text: r.text, ai: !!r.ai, note: r.note || null, chars: r.text.length, ms: raw ? raw.ms : 0 },
        ev: evView(r.ev, sim),
        concerns: sim.profile.concerns.map((c) => ({ id: c.id, short: c.short, revealed: !!c.revealed, resolved: !!c.resolved, at: c.at })),
        suggest: (r.ev.suggest || []).map((x) => ({ title: x.title, text: E.msgPlain({ who: 'me', segs: x.segs }), crit: x.crit, kind: x.kind })),
        rule: n > 0 ? { quality: E.aggregate(shadow.scores).total, scores: shadow.scores } : null,
        checks, usage: raw ? raw.usage : null, status: sim.status,
        raw: raw ? String(raw.text).slice(-4000) : null, // 엔진 LLM 원문(대사 + 평가 JSON) — 평가 근거 점검용
      };
      rec.turns.push(turn);
      write(turn);
      persist();
      onProgress && onProgress({ turn: n, satisfaction: turn.ev.satisfaction, quality: turn.ev.quality });
      if (sim.status !== 'active') break;
    }
    if (rec.status === 'active') rec.status = sim.status === 'active' ? 'ended' : sim.status; // ended = 턴을 다 써도 결론 없음
    st.phase = 'debrief'; persist();
  }
  if (st.phase === 'debrief') {
    if (over()) return paused();
    let deb = null;
    try { const store = { raw: [] }; deb = await ctx.run(store, () => E.debrief({ ...sim, status: rec.status })); } catch (e) { deb = { error: String(e.message) }; }
    const fin = rec.turns.length ? rec.turns[rec.turns.length - 1].ev : null;
    rec.end = {
      type: 'end', status: rec.status, turns: Math.max(0, rec.turns.length - 1), satisfaction: fin && fin.satisfaction, quality: fin && fin.quality,
      concerns: sim.profile.concerns.map((c) => ({ id: c.id, text: c.text, revealed: !!c.revealed, resolved: !!c.resolved, at: c.at })), debrief: deb, ms: Date.now() - st.t0,
    };
    write(rec.end);
    st.phase = judge && llms.judge && rec.turns.length > 1 ? 'judge' : 'done'; persist();
    onProgress && onProgress({ status: st.phase === 'judge' ? 'judging' : rec.status, turn: rec.end.turns, satisfaction: rec.end.satisfaction, quality: rec.end.quality });
  }
  if (st.phase === 'judge') {
    if (over(45000)) return paused(); // 심사는 오래 걸려 여유가 있을 때만
    try { const j = await judgeSession(llms.judge, rec); write({ type: 'judge', ...j }); rec.judge = j; } catch (e) { write({ type: 'error', where: 'judge', msg: String(e.message) }); }
    st.phase = 'done'; persist();
  }
  onProgress && onProgress({ status: rec.status, turn: rec.end ? rec.end.turns : 0, satisfaction: rec.end && rec.end.satisfaction, quality: rec.end && rec.end.quality });
  return rec;
}
