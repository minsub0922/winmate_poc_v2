import { requireLogin } from '../api/session.js';
import { browserStorage } from './browser.js';
// 직접 만든 고객 프로필 (localStorage). 기본 6명(PERSONAS)은 고칠 수 없고, 고쳐서 '새 프로필로 저장'하면 여기 들어온다.
import { useSyncExternalStore } from 'react';
import { uid } from './proposals.js';

const KEY = 'winmate.v2.simPersonas';
const MAX = 40;

function load() {
  try { const v = JSON.parse(browserStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => x && x.key && x.look && x.name) : []; } catch (e) { return []; }
}
let state = { list: load() };
const subs = new Set();
function save() { try { browserStorage.setItem(KEY, JSON.stringify(state.list.slice(0, MAX))); } catch (e) {} }
function emit() { for (const f of subs) f(); }
export function usePersonas() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state.list);
}
export const getPersona = (key) => state.list.find((p) => p.key === key) || null;

const clean = (d) => ({
  key: d.key, custom: true, level: [1, 2, 3].includes(d.level) ? d.level : 2, gender: d.gender === 'F' ? 'F' : 'M',
  name: String(d.name || '').trim().slice(0, 20), age: Math.max(25, Math.min(75, Number(d.age) || 45)),
  role: String(d.role || '').trim().slice(0, 30), career: String(d.career || '').trim().slice(0, 60),
  traits: (d.traits || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 4).map((t) => t.slice(0, 14)),
  quote: String(d.quote || '').trim().slice(0, 120), style: String(d.style || '').trim().slice(0, 120),
  face: d.face || '', look: { ...d.look },
  createdAt: d.createdAt || Date.now(), updatedAt: Date.now(),
});

/** 새 프로필로 저장 → 저장된 프로필 */
export function addPersona(d) {
  const p = clean({ ...d, key: uid('cp'), createdAt: 0 });
  state = { list: [p, ...state.list].slice(0, MAX) }; save(); emit();
  return p;
}
/** 직접 만든 프로필 덮어쓰기 */
export function updatePersona(key, d) {
  const i = state.list.findIndex((p) => p.key === key); if (i < 0) return addPersona(d);
  const p = clean({ ...state.list[i], ...d, key });
  const list = state.list.slice(); list[i] = p; state = { list }; save(); emit();
  return p;
}
export function deletePersona(key) { if (!requireLogin()) return false; state = { list: state.list.filter((p) => p.key !== key) }; save(); emit(); }
