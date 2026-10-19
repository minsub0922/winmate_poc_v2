import { browserStorage } from './browser.js';
// B2B 전략 시뮬레이션 기록 (localStorage). 최근 15개까지.
import { useSyncExternalStore } from 'react';
import { uid } from './proposals.js';
import { LV, buildProfile, personaForLevel } from '../domain/simulation/profile.js';

const KEY = 'winmate.v2.sims';
const MAX = 15;
const SEED_KEY = 'winmate.v2.sims.seedv';
const SEEDV = 2; // 2: 인물 프로필(성별 · 얼굴)로 예시를 다시 만듦

function load() {
  let list = [];
  try { const v = JSON.parse(browserStorage.getItem(KEY) || '[]'); if (Array.isArray(v)) list = v.filter((x) => x && x.id && x.profile); } catch (e) {}
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
export function deleteSim(id) { state = { sims: state.sims.filter((s) => s.id !== id) }; persist(); emit(); }

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
    cur: { satisfaction: L.start, trust: L.meters.trust * 18, interest: 50, mood: L.start >= 60 ? '호의' : L.start >= 40 ? '중립' : '의심', why: '', stage: 'open', scores: null, notes: {}, suggest: [], src: 'rule', evalAt: 0 },
    aiOff: false, debrief: null,
  };
}

/** 예시 기록을 한 번만 넣는다 (지우면 다시 생기지 않음). */
export function seedOnce(make) {
  let sv = 0; try { sv = Number(browserStorage.getItem(SEED_KEY) || 0); } catch (e) {}
  if (sv >= SEEDV) return;
  try { browserStorage.setItem(SEED_KEY, String(SEEDV)); } catch (e) {}
  const demos = make();
  const ids = new Set(demos.map((d) => d.id));
  state = { sims: [...state.sims.filter((s) => !ids.has(s.id)), ...demos].sort((a, b) => b.updatedAt - a.updatedAt) }; persist(); emit();
}
