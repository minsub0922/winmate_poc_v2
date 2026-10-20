import { browserStorage, openDatabase } from './browser.js';
import { useSyncExternalStore } from 'react';
import { normalizeCovers } from '../services/catalog.js';
import { bgUrl } from '../services/packs.js';
import { legacySrc } from '../domain/templates/legacy_img.js';
import { getBootstrap } from '../api/bootstrap.js';
import { mergeSampleHistory } from './sample-history.js';
import { scenarioStoryboard } from '../domain/templates/scenario_storyboard.js';

const KEY = 'winmate.v2.proposals';
const UKEY = 'winmate.v2.ui';
export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 9);
const now = () => Date.now();

// segments helpers: [{t:'text'} | {ref:'product:qm55c'}]
export const seg = (...xs) => xs.map((x) => (typeof x === 'string' ? (x.startsWith('@') ? { ref: x.slice(1) } : { t: x }) : x));
export const segRefs = (segs) => (segs || []).filter((s) => s.ref).map((s) => s.ref);
export const segPlain = (segs, label) => (Array.isArray(segs) ? segs.map((s) => (s.t != null ? s.t : '@' + (label ? label(s.ref) : s.ref))).join('') : String(segs || ''));

function emptyProposal() {
  return {
    id: uid('p'), title: '새 제안서', customer: '', ind: null, createdAt: now(), updatedAt: now(), stage: 'req', reqTab: 'free',
    req: { free: [], form: { project: '', customer: '', target: '', keymen: [{ id: uid('k'), name: '', weight: 100, reqs: [[]] }], note: '' }, files: [] },
    ctx: { products: [], solutions: [], cases: [] }, parts: [], exportedAt: null,
  };
}

// ---------- persistence ----------
// Only the explicitly configured admin account receives requested sample copies, once per browser.
// The same storage key and proposal format preserve existing history and backups.
function load() {
  let list = [];
  try {
    const raw = browserStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (!Array.isArray(v)) return [];
      list = migrateCovers(v.filter((p) => p && p.id));
    }
  } catch (e) { return []; }
  const user = getBootstrap().user;
  const merged = mergeSampleHistory(list, user, browserStorage, scenarioStoryboard);
  return merged;
}
// saved history: every 표지 (and any ‘표지’ part) moves into the hidden deck part — no 표지 bubble on any Storyboard, the 표지
// stays as the first page of the PPT 레이아웃 panel (data.js normalizeCovers). Saved back once when something moved.
function migrateCovers(list) {
  let n = 0;
  for (const p of list) if (normalizeCovers(p, true)) n++;
  if (n) { try { browserStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  return list;
}
let state = { proposals: load() };
const subs = new Set();
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { browserStorage.setItem(KEY, JSON.stringify(state.proposals)); } catch (e) {} }, 250);
}
function emit() { for (const f of subs) f(); }
export function useStore(sel) {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(state));
}
export function getProposal(id) { return state.proposals.find((p) => p.id === id); }
export function createProposal() {
  const p = emptyProposal();
  state = { proposals: [p, ...state.proposals] }; persist(); emit();
  return p.id;
}
export function deleteProposal(id) { state = { proposals: state.proposals.filter((p) => p.id !== id) }; persist(); emit(); }
/** Remove one selected instance, preserving its part and other copies of the same template. */
export function removeLayout(id, layoutUid) {
  const proposal = getProposal(id);
  if (!proposal?.parts.some(part => part.layouts.some(layout => layout.uid === layoutUid))) return false;
  let removed = false;
  update(id, draft => {
    for (const part of draft.parts) {
      const index = part.layouts.findIndex(layout => layout.uid === layoutUid);
      if (index >= 0) { part.layouts.splice(index, 1); removed = true; break; }
    }
  });
  return removed;
}
/** Best 제안서 열기 — 원본은 그대로 두고 복사본을 내 제안서로 만든다 */
export function cloneProposal(src) {
  const t = structuredClone(src);
  t.id = uid('p'); t.createdAt = t.updatedAt = now();
  normalizeCovers(t, true);
  state = { proposals: [t, ...state.proposals] }; persist(); emit();
  return t.id;
}
/** 배경 테마(p.bg, Best Scenario에서 시작한 제안서) — 모든 장에 배경이 있고, 장마다 다른 사진.
 *  배경이 없는 장(새로 넣은 장 · 배경이 지워진 장)에는 테마 사진 중 아직 안 쓴 것을, 다 쓰면 가장 덜 쓴 것을 깐다. */
function syncBg(d) {
  const pool = d && d.bg ? (d.bg.pool || (d.bg.src ? [d.bg.src] : [])) : [];
  if (!pool.length) return;
  const all = (d.parts || []).flatMap((s) => s.layouts || []);
  const used = new Map(pool.map((x) => [x, 0]));
  for (const x of all) { const src = x.ov && x.ov.bg && x.ov.bg.src; if (src && used.has(src)) used.set(src, used.get(src) + 1); }
  for (const x of all) {
    x.ov = x.ov || { t: {}, img: {} };
    if (x.ov.bg && x.ov.bg.src) continue;
    let pick = pool[0];
    for (const src of pool) if (used.get(src) < used.get(pick)) pick = src;
    used.set(pick, used.get(pick) + 1);
    x.ov.bg = { src: pick, theme: d.bg.theme || '' };
  }
}
/** update(id, draft => {...}) — copy-on-write */
export function update(id, fn, { touch = true } = {}) {
  const i = state.proposals.findIndex((p) => p.id === id);
  if (i < 0) return;
  const draft = structuredClone(state.proposals[i]);
  fn(draft);
  normalizeCovers(draft); // a 표지 added anywhere goes to the deck part — never a Storyboard bubble
  syncBg(draft);
  if (touch) draft.updatedAt = now();
  const list = state.proposals.slice(); list[i] = draft;
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  state = { proposals: list }; persist(); emit();
}

/** Storyboard stage — 'req': 고객 요구사항 버블만 · 'match': 요구사항 저장 → 제품 · 솔루션 매칭 버블 · 'story': 매칭 저장 → 파트 */
export function stageOf(p) { return p.parts.length || p.stage === 'story' ? 'story' : p.stage === 'match' ? 'match' : 'req'; }
export function proposalStep(p) {
  if (p.exportedAt) return { n: 4, label: '내보내기 완료' };
  const nl = p.parts.reduce((a, s) => a + s.layouts.length, 0);
  if (nl) return { n: 3, label: '레이아웃 채우기' };
  if (p.parts.length) return { n: 2, label: 'Storyboard 구성' };
  return { n: 1, label: '고객 요구사항' };
}

// small UI prefs
export function loadUi() { try { return JSON.parse(browserStorage.getItem(UKEY) || '{}'); } catch (e) { return {}; } }
export function saveUi(v) { try { browserStorage.setItem(UKEY, JSON.stringify(v)); } catch (e) {} }

// ---------- uploaded images (IndexedDB, best-effort) ----------
const IMG_CACHE = new Map();
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = openDatabase('winmate-v2', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('img');
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
export async function putImage(dataUrl) {
  const id = uid('u');
  IMG_CACHE.set(id, dataUrl);
  try { const db = await idb(); if (db) db.transaction('img', 'readwrite').objectStore('img').put(dataUrl, id); } catch (e) {}
  return 'u:' + id;
}
export async function loadImages() {
  try {
    const db = await idb(); if (!db) return;
    await new Promise((res) => {
      const tx = db.transaction('img', 'readonly'); const st = tx.objectStore('img');
      const rq = st.openCursor();
      rq.onsuccess = () => { const c = rq.result; if (c) { IMG_CACHE.set(c.key, c.value); c.continue(); } else res(); };
      rq.onerror = () => res();
    });
  } catch (e) {}
}
export function resolveImg(src) {
  if (!src) return '';
  src = legacySrc(src); // an old img/bs path now packed (legacy_img.js)
  if (src.startsWith('u:')) return IMG_CACHE.get(src.slice(2)) || '';
  if (/\.json#\d+$/.test(src)) return bgUrl(src) || ''; // a packed picture (img/fill/*.json#k) — its blob url once the pack is in
  return src;
}
