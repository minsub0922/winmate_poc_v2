import { requireLogin } from '../api/session.js';
import { browserStorage, openDatabase } from './browser.js';
import { useSyncExternalStore } from 'react';
import { changeProposal } from './proposal-update.js';
import { readRequirementDraft, discardRequirementDraft } from './requirement-drafts.js';
import { recordsJson } from './record-json.js';
import { normalizeCovers, isCoverSheet } from '../services/catalog.js';
import { bgUrl } from '../services/packs.js';
import { legacySrc } from '../domain/templates/legacy_img.js';
import { getBootstrap } from '../api/bootstrap.js';
import { mergeSampleHistory } from './sample-history.js';
import { mergeReviewExampleProposals } from './sample-reviews.js';
import { refreshProposalCover } from '../domain/templates/refresh_proposal_cover.js';
import { scenarioStoryboard } from '../domain/templates/scenario_storyboard.js';
import { markLayoutChanges, retainHistoryLayouts } from '../domain/slides/context-policy.js';
import { forgetHistory, historyRemoved, restoreHistory } from './history-preferences.js';
import { historyId, historyPath, sharedIdentity, sharedToken } from '../services/shared-path.js';
import { migrateRemovedLayouts } from '../domain/templates/migrate_removed_layouts.js';
import { fillSpacePhotos } from '../domain/templates/migrate_space_sheet.js';
import { migrateRemovedProducts } from '../domain/products/removed.js';
import { registerCollection, noteChange, accountSyncActive, blobUrl, putBlob, missingBlobs, dataUrlBlob } from './account-sync.js';

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
  if (!browserStorage.accountHistory) return [];
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
  const proposals = migrateCovers(mergeReviewExampleProposals(merged, user, browserStorage, refreshProposalCover));
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
    if (migrateRemovedLayouts(p, {pid:()=>uid('s'),kid:()=>uid('k'),lid:()=>uid('l')})) n++;
    if (fillSpacePhotos(p)) n++; // 공간별 제안 장의 새 공간 사진 칸(사진 1)
    if (migrateRemovedProducts(p)) n++; // 지운 제품(DSS 삭제)이 연결돼 있으면 대체 제품으로
    if (normalizeCovers(p, true)) n++;
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
function writeCache() {
  clearTimeout(saveT);
  saveT = null;
  try { browserStorage.setItem(KEY, recordsJson(state.proposals)); }
  catch (e) {
    // A stale copy left after a quota failure would open instead of the account's records.
    if (accountSyncActive()) { try { browserStorage.removeItem(KEY); } catch { /* nothing more to free */ } }
  }
}
function persist(removedId, replacedRecord) {
  clearTimeout(saveT);
  saveT = setTimeout(writeCache, 250);
  noteChange('proposals', removedId, replacedRecord);
}
window.addEventListener('pagehide', () => { if (saveT !== null) writeCache(); });
function emit() { for (const f of subs) f(); }
// The account copy on the server is authoritative; records changed in another browser arrive here.
registerCollection('proposals', {
  list: () => state.proposals,
  isReplaceable: isEmptyDraft,
  apply(records, removed) {
    // Sync fingerprints refer to received records. Migration must create a new record identity.
    records = records.map(p => { const next = {...p,ctx:{...p.ctx}}; return migrateRemovedProducts(next) ? next : p; });
    const gone = new Set(removed), incoming = new Map(records.map(p => [p.id, p])), previous = new Map(state.proposals.map(p => [p.id, p]));
    const proposals = state.proposals.filter(p => !gone.has(p.id)).map(p => incoming.get(p.id) || p);
    for (const p of records) {
      if (!previous.has(p.id)) proposals.push(p);
      // A revision conflict can return work saved elsewhere during replacement.
      if (historyRemoved(p.id, p._share?.token) && !isEmptyDraft(p)) restoreHistory(p.id, p._share?.token);
    }
    proposals.sort((a, b) => b.updatedAt - a.updatedAt);
    const shared = { ...state.shared };
    for (const id of gone) {
      const token = (previous.get(id) || shared[id])?._share?.token;
      if (!historyRemoved(id, token)) forgetHistory(id, token);
      delete shared[id];
    }
    state = { proposals, shared }; persist(); emit();
    for (const p of records) for (const fn of changes) fn(p, previous.get(p.id) || null, { remote: true });
  },
});
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
  let migratedId = 0;
  migrateRemovedLayouts(proposal, {pid:()=>id+'-mp'+migratedId++,kid:()=>id+'-mk'+migratedId++,lid:()=>id+'-ml'+migratedId++});
  fillSpacePhotos(proposal);
  migrateRemovedProducts(proposal);
  const removed = historyRemoved(id, snapshot.token);
  const history = !removed && (state.proposals.some(p => p.id === id) || snapshot.isOwner || snapshot.hasEdited);
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
  const shared = { ...state.shared };
  // A late poll for a discarded draft must not put it back in the repository.
  // Opening its existing link explicitly can still display the shared document.
  if (!removed || historyId() === id || sharedToken() === snapshot.token) shared[id] = proposal;
  else delete shared[id];
  state = { proposals, shared };
  if (history) persist();
  emit();
  if (snapshot.isOwner) for (const fn of changes) fn(proposal, previous, { remote: true });
  return proposal;
}
// IDs, timestamps and editor preferences are assigned even to never-edited records.
// Check every other field for content, including fields added by newer editors.
const draftMetadata = new Set(['id', 'endPath', 'createdAt', 'updatedAt', 'reqTab', 'title', 'stage', '_share', 'req']);
function hasInput(value) {
  if (typeof value === 'string') return value.trim() !== '';
  if (value && typeof value === 'object') return Object.values(value).some(hasInput);
  return value != null && value !== false;
}
function isEmptyDraft(p) {
  if (!p || p.parts?.length || (p.stage && p.stage !== 'req')
    || (hasInput(p.title) && String(p.title).trim() !== '새 제안서')) return false;
  // Opening one's own proposal automatically creates a read-only link at revision 1.
  const share = p._share;
  if (share && !(share.isOwner === true && share.permission === 'view' && share.revision === 1)) return false;
  if (Object.entries(p).some(([key, value]) => !draftMetadata.has(key) && hasInput(value))) return false;

  const { form, files, ...requirements } = p.req || {};
  const { keymen, ...fields } = form || {};
  if (files?.length || hasInput(requirements) || hasInput(fields) || keymen?.length > 1) return false;
  if (keymen != null && (!Array.isArray(keymen) || keymen.some(person => !person || typeof person !== 'object'))) return false;
  if (keymen?.some(({ id, weight, reqs, ...person }) => hasInput(person) || (weight != null && Number(weight) !== 100)
    || reqs?.length > 1 || hasInput(reqs))) return false;

  const draft = readRequirementDraft(p.id);
  return !draft || !(draft.reading || draft.files.length || hasInput(draft.customer) || hasInput(draft.free) || hasInput(draft.meta));
}

function withoutHistoryEntry(proposal) {
  const { id } = proposal;
  forgetHistory(id, proposal._share?.token);
  discardRequirementDraft(id);
  const shared = { ...state.shared };
  delete shared[id];
  return { proposals: state.proposals.filter(p => p.id !== id), shared };
}

export function createProposal() {
  if (!requireLogin()) return null;
  const latest = state.proposals[0];
  const replaced = isEmptyDraft(latest) ? latest : null;
  const p = emptyProposal();
  const kept = replaced ? withoutHistoryEntry(replaced) : state;
  state = { ...kept, proposals: [p, ...kept.proposals] };
  persist(replaced?.id, replaced);
  emit();
  return p.id;
}
export function deleteProposal(id) { if (!requireLogin()) return false;
  const proposal = getProposal(id);
  if (!proposal) return false;
  state = withoutHistoryEntry(proposal);
  persist(id); emit();
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
/** 배경 테마(p.bg, 샘플 버티컬 시나리오에서 시작한 제안서) — 모든 장에 배경이 있고, 장마다 다른 사진.
 *  배경이 없는 장(새로 넣은 장 · 배경이 지워진 장)에는 테마 사진 중 아직 안 쓴 것을, 다 쓰면 가장 덜 쓴 것을 깐다. */
function syncBg(d) {
  const pool = d && d.bg ? (d.bg.pool || (d.bg.src ? [d.bg.src] : [])) : [];
  if (!pool.length) return;
  const all = (d.parts || []).flatMap((s) => s.layouts || []);
  const used = new Map(pool.map((x) => [x, 0]));
  for (const x of all) { const src = x.ov && x.ov.bg && x.ov.bg.src; if (src && used.has(src)) used.set(src, used.get(src) + 1); }
  for (const x of all) {
    if(d.coverRevision&&isCoverSheet(x.f))continue;
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
  const draft = changeProposal(original, fn, { normalize: normalizeCovers, backgrounds: syncBg, mark: markLayoutChanges, touch, now });
  if (draft === original) return true;
  if (touch && original._share) restoreHistory(id, original._share.token);
  const list = state.proposals.slice(); if (i >= 0) list[i] = draft;
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  state = { proposals: list, shared: original._share ? { ...state.shared, [id]: draft } : state.shared };
  if (i >= 0) persist();
  emit();
  for (const fn of changes) fn(draft, original);
  return true;
}

/** Storyboard stage — 'req': 고객 요구사항 버블만 · 'match': 요구사항 저장 → 제품 · 솔루션 매칭 버블 · 'story': 매칭 저장 → 목차 */
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
// Uploads are stored in the account on the server (blobs); IndexedDB/memory keep a copy for instant display.
// Uploads run one at a time in the background; anything not confirmed is retried by loadImages() on the next visit.
let uploads = Promise.resolve();
function uploadImage(id, dataUrl) {
  const blob = dataUrlBlob(dataUrl);
  if (!blob || !accountSyncActive()) return uploads;
  uploads = uploads.then(() => putBlob(id, blob)).catch(error => console.warn('업로드 이미지를 서버에 저장하지 못했어요', error));
  return uploads;
}
export async function putImage(dataUrl) {
  const id = uid('u');
  IMG_CACHE.set(id, dataUrl);
  try { const db = await idb(); if (db) db.transaction('img', 'readwrite').objectStore('img').put(dataUrl, id); } catch (e) {}
  void uploadImage(id, dataUrl);
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
  // One-time (then incremental) move of this browser's uploads to the account; never blocks the first render.
  if (accountSyncActive() && IMG_CACHE.size) void missingBlobs([...IMG_CACHE.keys()].filter(id => /^[A-Za-z0-9_.:-]{1,200}$/.test(id)))
    .then(ids => { for (const id of ids) void uploadImage(id, IMG_CACHE.get(id)); }).catch(() => {});
}
export const imageUploads = () => uploads;
export function resolveImg(src) {
  if (!src) return '';
  src = legacySrc(src); // an old img/bs path now packed (legacy_img.js)
  if (src.startsWith('u:')) return IMG_CACHE.get(src.slice(2)) || (accountSyncActive() ? blobUrl(src.slice(2)) : '');
  if (/\.json#\d+$/.test(src)) return bgUrl(src) || ''; // a packed picture (img/fill/*.json#k) — its blob url once the pack is in
  return src;
}
