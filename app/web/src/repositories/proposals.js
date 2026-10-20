import { requireLogin } from '../api/session.js';
import { browserStorage, openDatabase } from './browser.js';
import { useSyncExternalStore } from 'react';
import { normalizeCovers } from '../services/catalog.js';
import { bgUrl } from '../services/packs.js';
import { legacySrc } from '../domain/templates/legacy_img.js';
import { getBootstrap } from '../api/bootstrap.js';
import { mergeSampleHistory } from './sample-history.js';
import { mergeReviewExampleProposals } from './sample-reviews.js';
import { scenarioStoryboard } from '../domain/templates/scenario_storyboard.js';
import { markLayoutChanges, retainHistoryLayouts } from '../domain/slides/context-policy.js';
import { forgetHistory, historyRemoved, restoreHistory } from './history-preferences.js';
import { historyPath, sharedIdentity } from '../services/shared-path.js';
import { migrateProposalDesign } from '../domain/slides/proposal-design.js';

const KEY = 'winmate.v2.proposals';
const UKEY = 'winmate.v2.ui';
export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 9);
const now = () => Date.now();

// segments helpers: [{t:'text'} | {ref:'product:qm55c'}]
export const seg = (...xs) => xs.map((x) => (typeof x === 'string' ? (x.startsWith('@') ? { ref: x.slice(1) } : { t: x }) : x));
export const segRefs = (segs) => (segs || []).filter((s) => s.ref).map((s) => s.ref);
export const segPlain = (segs, label) => (Array.isArray(segs) ? segs.map((s) => (s.t != null ? s.t : '@' + (label ? label(s.ref) : s.ref))).join('') : String(segs || ''));

function emptyProposal() {
  const id = uid('p');
  return {
    id, endPath: historyPath(id), title: '새 제안서', customer: '', ind: null, createdAt: now(), updatedAt: now(), stage: 'req', reqTab: 'free',
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
  const proposals = migrateCovers(mergeReviewExampleProposals(merged, user, browserStorage));
  let migrated = false;
  for (const p of proposals) {
    const endPath = historyPath(p.id);
    if (p.endPath !== endPath) { p.endPath = endPath; migrated = true; }
    if (/^bs_std_/.test(p.scenario || '') && typeof p.title === 'string') {
      const title = p.title.replace(/\s*— 표준 제안서 \d+장 \(설명 재구성\)$/, ' 표준 제안서');
      if (title !== p.title) {
        if (p.req?.form?.project === p.title) p.req.form.project = title;
        p.title = title; migrated = true;
      }
    }
  }
  if (migrated) { try { browserStorage.setItem(KEY, JSON.stringify(proposals)); } catch { /* Retain the in-memory route. */ } }
  return proposals;
}
// saved history: every 표지 (and any ‘표지’ part) moves into the hidden deck part — no 표지 bubble on any Storyboard, the 표지
// stays as the first page of the PPT 레이아웃 panel (data.js normalizeCovers). Saved back once when something moved.
function migrateCovers(list) {
  let n = 0;
  for (const p of list) {
    if (normalizeCovers(p, true)) n++;
    if (migrateProposalDesign(p)) n++;
    if (retainHistoryLayouts(p)) n++;
  }
  if (n) { try { browserStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  return list;
}
let state = { proposals: load(), shared: {} };
const subs = new Set();
const changes = new Set();
export function onProposalChange(fn) { changes.add(fn); return () => changes.delete(fn); }
let saveT = null;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { browserStorage.setItem(KEY, JSON.stringify(state.proposals)); } catch (e) {} }, 250);
}
function emit() { for (const f of subs) f(); }
export function useStore(sel) {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(state));
}
export function getProposal(id) { return state.proposals.find((p) => p.id === id) || state.shared[id]; }
export const allProposals = () => [...state.proposals, ...Object.values(state.shared).filter(p => !state.proposals.some(x => x.id === p.id))];
export function getProposals() { return state.proposals; }
export function sharedProposal(snapshot, preferredId) {
  const previous = state.proposals.find(p => p._share?.token === snapshot.token)
    || (snapshot.isOwner && state.proposals.find(p => p.id === snapshot.sourceId))
    || Object.values(state.shared).find(p => p._share?.token === snapshot.token);
  const id = preferredId || previous?.id || (snapshot.isOwner && snapshot.sourceId) || 'shared-' + snapshot.token;
  const proposal = { ...structuredClone(snapshot.document), id, endPath: snapshot.isOwner ? historyPath(id) : '/s/' + snapshot.token, exportedAt: previous?.exportedAt || null, _share: {
    ...sharedIdentity(snapshot), isOwner: snapshot.isOwner, canEdit: snapshot.canEdit,
    permission: snapshot.permission, revision: snapshot.revision,
  } };
  if (previous?.sample && snapshot.isOwner) proposal.sample = structuredClone(previous.sample);
  const history = !historyRemoved(id, snapshot.token) && (state.proposals.some(p => p.id === id) || snapshot.isOwner || snapshot.hasEdited);
  const adaptation = new Map((previous?.parts || []).flatMap(s => s.layouts.map(x => [x.uid, x.adaptation])));
  for (const part of proposal.parts) for (const layout of part.layouts) {
    if (adaptation.get(layout.uid)) layout.adaptation = structuredClone(adaptation.get(layout.uid));
  }
  // A snapshot already contains saved sheets. First hydration is a read, not an
  // insertion request; only later changes relative to a known proposal requeue.
  retainHistoryLayouts(proposal);
  if (snapshot.isOwner && previous) markLayoutChanges(proposal, previous);
  const proposals = state.proposals.filter(p => p.id !== id && p._share?.token !== snapshot.token);
  if (history) proposals.push(proposal);
  proposals.sort((a, b) => b.updatedAt - a.updatedAt);
  state = { proposals, shared: { ...state.shared, [id]: proposal } };
  if (history) persist();
  emit();
  if (snapshot.isOwner) for (const fn of changes) fn(proposal, previous, { remote: true });
  return proposal;
}
/** Only a blank draft is reusable; even a title, attachment or linked item is work. */
function isEmptyDraft(p) {
  const text = value => String(value ?? '').trim().length > 0;
  const segments = value => Array.isArray(value)
    ? value.some(s => text(s?.t) || !!s?.ref || !!s?.link)
    : text(value);
  if (!p || p._share || p.sample || p.agent || p.bg || p.exportedAt || p.reqSaved
    || (p.stage && p.stage !== 'req') || (text(p.title) && p.title.trim() !== '새 제안서')
    || text(p.customer) || text(p.ind) || text(p.indName) || p.parts?.length) return false;
  if (Object.values(p.ctx || {}).some(items => items?.length)) return false;
  const req = p.req || {}, form = req.form || {}, keymen = form.keymen || [];
  if (segments(req.free) || req.files?.length
    || ['project', 'customer', 'target', 'note'].some(key => text(form[key]))
    || segments(form.noteSegs) || keymen.length > 1) return false;
  return !keymen.some(k => text(k.name) || (k.weight != null && Number(k.weight) !== 100)
    || k.reqs?.length > 1 || (k.reqs || []).some(segments));
}

export function createProposal() {
  if (!requireLogin()) return null;
  // Match the first (most recent) history entry. Never search older drafts or
  // remove existing history: repeat clicks simply reopen the same blank draft.
  const latest = state.proposals[0];
  if (isEmptyDraft(latest)) return latest.id;
  const p = emptyProposal();
  state = { ...state, proposals: [p, ...state.proposals] }; persist(); emit();
  return p.id;
}
export function deleteProposal(id) { if (!requireLogin()) return false;
  const proposal = getProposal(id);
  if (!proposal) return false;
  forgetHistory(id, proposal._share?.token);
  const shared = { ...state.shared }; delete shared[id];
  state = { ...state, proposals: state.proposals.filter(p => p.id !== id), shared }; persist(); emit();
  return true;
}
/** Remove one selected instance, preserving its part and other copies of the same template. */
export function removeLayout(id, layoutUid) { if (!requireLogin()) return false;
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
  if (!requireLogin()) return null;
  const t = structuredClone(src);
  delete t._share;
  delete t.sample;
  t.id = uid('p'); t.endPath = historyPath(t.id); t.createdAt = t.updatedAt = now(); t.exportedAt = null;
  normalizeCovers(t, true);
  markLayoutChanges(t, null);
  state = { ...state, proposals: [t, ...state.proposals] }; persist(); emit();
  for (const fn of changes) fn(t, null);
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
export function update(id, fn, { touch = true } = {}) { if (!requireLogin()) return false;
  const original = getProposal(id);
  if (!original || (original._share && !original._share.canEdit)) return false;
  const i = state.proposals.findIndex((p) => p.id === id);
  const draft = structuredClone(original);
  fn(draft);
  if (touch && original._share) restoreHistory(id, original._share.token);
  normalizeCovers(draft); // a 표지 added anywhere goes to the deck part — never a Storyboard bubble
  syncBg(draft);
  markLayoutChanges(draft, original);
  if (touch) draft.updatedAt = now();
  const list = state.proposals.slice(); if (i >= 0) list[i] = draft;
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  state = { proposals: list, shared: original._share ? { ...state.shared, [id]: draft } : state.shared };
  if (i >= 0) persist();
  emit();
  for (const fn of changes) fn(draft, original);
  return true;
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
