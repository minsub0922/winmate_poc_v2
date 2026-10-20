import { requireLogin } from '../api/session.js';
import { browserStorage } from './browser.js';
// B2B 전략 시뮬레이션 기록 (localStorage). 최근 15개까지.
import { useSyncExternalStore } from 'react';
import { uid } from './proposals.js';
import { LV, buildProfile, personaForLevel } from '../domain/simulation/profile.js';

const KEY = 'winmate.v2.sims';
const MAX = 15;

function load() {
  let list = [];
  try { const v = JSON.parse(browserStorage.getItem(KEY) || '[]'); if (Array.isArray(v)) list = v.filter((x) => x && x.id && x.profile).map(s => ({ ...s, ...(s.skillRuns ? { skillRuns:(Array.isArray(s.skillRuns) ? s.skillRuns : []).filter(run=>run&&typeof run==='object').map(run => run.status === 'running' ? { ...run,status:'interrupted',error:'페이지를 다시 열어 스킬 실행이 중단됐어요. 현재 맥락으로 다시 실행할 수 있어요.' } : run) } : {}) })); } catch (e) {}
  return list;
}
let state = { sims: load() };
const subs = new Set();
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    let list = state.sims.slice(0, MAX);
    for (let k = 0; k < 5; k++) {
      try { browserStorage.setItem(KEY, JSON.stringify(list)); return; } catch (e) { list = list.slice(0, Math.max(1, list.length - 3)); }
    }
  }, 250);
}
function emit() { for (const f of subs) f(); }
export function useSims(sel) {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(state));
}
export function getSim(id) { return state.sims.find((s) => s.id === id) || null; }
export function putSim(s) { state = { sims: [s, ...state.sims.filter((x) => x.id !== s.id)].slice(0, MAX + 3) }; persist(); emit(); return s; }
export function patchSim(id, fn) {
  const i = state.sims.findIndex((s) => s.id === id); if (i < 0) return null;
  const d = structuredClone(state.sims[i]); fn(d); d.updatedAt = Date.now();
  const list = state.sims.slice(); list[i] = d; state = { sims: list }; persist(); emit();
  return d;
}
export function deleteSim(id) { if (!requireLogin()) return false; state = { sims: state.sims.filter((s) => s.id !== id) }; persist(); emit(); }

/** persona: 기본 인물(PERSONAS) 또는 직접 만든 프로필. 없으면 setup.gender로 기본 인물 */
export function newSim(setup, level, persona) {
  const L = LV[level];
  const id = uid('sim');
  const profile = buildProfile(setup, level, setup.gender, persona ? personaForLevel(persona, level) : undefined);
  const t = Date.now();
  return {
    id, createdAt: t, updatedAt: t, status: 'active', level, setup: structuredClone(setup), profile,
    msgs: [],
    trend: [{ v: L.start }],
    // starting meters come from the difficulty level (setup values, not an evaluation); scores stay empty until the AI scores a turn
    cur: { satisfaction: L.start, trust: L.meters.trust * 18, interest: 50, mood: L.start >= 60 ? '호의' : L.start >= 40 ? '중립' : '의심', why: '', stage: 'open', scores: null, notes: {}, suggest: [], src: 'none', evalAt: 0 },
    debrief: null, debriefError: null, turnError: null,
  };
}
