// Account records live on the server (app/api/account_data.py); this browser keeps localStorage/IndexedDB only as a
// cache, so screens render instantly and keep working while a request is in flight.
//
//   hydrateAccountData()  before the app modules load: fills the local cache from the server (first visit on a browser
//                         waits up to a few seconds; a primed cache never blocks), and finds local-only legacy records.
//   registerCollection()  each repository hands over its in-memory list and an apply() for server changes.
//   noteChange()          called from a repository's persist(); pushes changed records (debounced, in order).
//
// Change detection compares each in-memory record with the hash of the last version the server accepted (stored in
// winmate.v2.sync.<collection>). A record removed from localStorage by quota thinning is therefore never deleted on
// the server; only a record that disappears from the repository's memory in this session is. Deletions are queued in
// the same metadata before any request, so a reload cannot lose them. Conflicts: a deletion made elsewhere wins over a
// never-synced local copy; otherwise the newer updatedAt wins (the other copy is replaced, not merged).
import { browserStorage } from './browser.js';
import { recordJson } from './record-json.js';
import { fetchResource } from '../api/client.js';
import { inspecting, withInspect } from '../api/inspect.js';

export const COLLECTIONS = {
  proposals: { key: 'winmate.v2.proposals', id: 'id', time: r => r.updatedAt || r.createdAt || 0 },
  reviews: { key: 'winmate.v2.reviews', id: 'id', time: r => r.updatedAt || r.finishedAt || r.createdAt || r.at || 0 },
  simulations: { key: 'winmate.v2.sims', id: 'id', time: r => r.updatedAt || r.createdAt || 0 },
  personas: { key: 'winmate.v2.simPersonas', id: 'key', time: r => r.updatedAt || r.createdAt || 0 },
  favorites: { key: 'winmate.v2.favs', id: 'id', time: r => r.at || 0 },
};
const META = 'winmate.v2.sync.';
const BASE = '/api/account-data/';
const RID = /^[A-Za-z0-9_.:@-]{1,200}$/;
const MAX_BATCH = 200, MAX_BATCH_BYTES = 24 * 1024 * 1024;

let account = null;          // username when sync is active
const registry = new Map();  // collection → { list, apply, seen:Set, timer, flight, again }
const status = { hydrated: false, error: '', pushed: 0, conflicts: 0 };
export const accountSyncStatus = () => ({ ...status, account });
// Operations/tests: window.__winmateAccountSync() shows hydration time, failures and pushes (no record contents).
if (typeof window !== 'undefined') window.__winmateAccountSync = accountSyncStatus;

/** Stable 53-bit string hash (cyrb53); enough to detect edits, not a security boundary. */
export function hashText(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) { const ch = text.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// Repositories are copy-on-write: an unchanged record keeps its object identity, so its hash is reused and a push
// serializes only the records that actually changed (a deck with large 3D snapshots costs nothing while unchanged).
const hashes = new WeakMap();
const hashOf = record => {
  if (!record || typeof record !== 'object') return hashText(JSON.stringify(record));
  let hash = hashes.get(record);
  if (!hash) { hash = hashText(recordJson(record)); hashes.set(record, hash); }
  return hash;
};

export function readMeta(collection, storage = browserStorage) {
  try {
    const value = JSON.parse(storage.getItem(META + collection) || 'null');
    if (value && value.v === 1 && value.records && typeof value.records === 'object') return { pending: [], ...value };
  } catch { /* A damaged cache index only causes a full comparison. */ }
  return { v: 1, owner: null, records: {}, pending: [] };
}
function writeMeta(collection, meta, storage = browserStorage) {
  try { storage.setItem(META + collection, JSON.stringify(meta)); } catch { /* Index retried on the next change. */ }
}
function readList(collection, storage = browserStorage) {
  try { const value = JSON.parse(storage.getItem(COLLECTIONS[collection].key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

async function api(path, { method = 'GET', body } = {}) {
  const response = await fetchResource(BASE + path, method === 'GET' ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(typeof detail.detail === 'string' ? detail.detail : detail.detail?.message || `동기화 실패 (${response.status})`);
    error.status = response.status; throw error;
  }
  return response.json();
}
async function manifest(collection) {
  const items = []; let after = '';
  do {
    const page = await api(collection + (after ? '?after=' + encodeURIComponent(after) : ''));
    if (account && page.owner !== account) { const error = new Error('로그인 계정이 바뀌었습니다. 새로고침해 주세요.'); error.status = 409; throw error; }
    items.push(...page.items); after = page.next;
  } while (after);
  return items;
}
export async function fetchRecords(collection, ids) {
  const out = new Map(); let rest = [...ids];
  while (rest.length) {
    const batch = rest.slice(0, 200); rest = rest.slice(200);
    const page = await api(collection + '/fetch', { method: 'POST', body: { ids: batch } });
    for (const item of page.items) out.set(item.id, item);
    if (page.remaining?.length) rest = [...page.remaining, ...rest];
  }
  return out;
}

/**
 * Pure reconciliation of a local cache with the server manifest (unit-tested in app/tests/account-sync.mjs).
 * Returns the server records to fetch and the local IDs to drop; everything else is decided after fetching.
 */
export function planReconcile(local, meta, items, idOf) {
  const localById = new Map(local.map(r => [idOf(r), r]));
  const pending = new Set(meta.pending || []);
  const fetch = [], drop = [];
  for (const item of items) {
    const known = meta.records[item.id];
    if (pending.has(item.id)) continue;                      // our queued deletion is sent after the app starts
    if (item.deleted) { if (localById.has(item.id)) drop.push(item.id); continue; }
    // The cached copy must be the version this browser last synced. A cache write that failed (browser quota — Safari
    // keeps only ~5 MB) leaves an older copy under an up-to-date index; read the server's record instead of trusting it.
    if (!localById.has(item.id) || !known || known[0] !== item.revision || cacheDiffers(localById.get(item.id), known)) fetch.push(item.id);
  }
  return { fetch, drop };
}
const cacheDiffers = (record, known) => !!known?.[1] && hashOf(record) !== known[1];
/** This browser's cache is not what it last synced (missing or older copies of records the index knows). */
export function cacheBehind(local, meta, idOf) {
  const byId = new Map(local.map(r => [idOf(r), r]));
  return Object.entries(meta.records || {}).some(([id, known]) => !byId.has(id) || cacheDiffers(byId.get(id), known));
}

/** Merge fetched server records into the local list (newest first). Local edits made since the last sync win when newer. */
export function mergeRecords(collection, local, meta, fetched, drop) {
  const { id: field, time } = COLLECTIONS[collection];
  const byId = new Map(local.map(record => [record?.[field], record]));
  const adopted = [], dropped = new Set();
  for (const id of drop) { if (byId.delete(id)) dropped.add(id); delete meta.records[id]; }
  for (const [id, item] of fetched) {
    if (item.missing) continue;
    if (item.deleted) { if (byId.delete(id)) dropped.add(id); delete meta.records[id]; continue; }
    const mine = byId.get(id), known = meta.records[id];
    const dirty = mine && (!known || hashOf(mine) !== known[1]);
    if (dirty && time(mine) > (item.updated_at || time(item.data))) { meta.records[id] = [item.revision, known?.[1] || '']; continue; }
    byId.set(id, item.data); meta.records[id] = [item.revision, hashOf(item.data)]; adopted.push(item.data);
  }
  const list = [...byId.values()];
  const changed = adopted.length > 0 || dropped.size > 0;
  if (changed) list.sort((a, b) => time(b) - time(a));
  return { list, changed, adopted, dropped };
}

async function reconcile(collection, storage = browserStorage, cached = null) {
  const meta = readMeta(collection, storage);
  if (meta.owner !== account) { meta.owner = account; meta.records = {}; meta.pending = []; delete meta.replacements; }
  const local = cached || readList(collection, storage), idOf = r => r?.[COLLECTIONS[collection].id];
  const items = await manifest(collection);
  const { fetch, drop } = planReconcile(local.filter(r => r && RID.test(String(idOf(r) || ''))), meta, items, idOf);
  const fetched = fetch.length ? await fetchRecords(collection, fetch) : new Map();
  const merged = mergeRecords(collection, local, meta, fetched, drop);
  // Records the server no longer knows (a restored server) lose their stale index and are uploaded again.
  const server = new Set(items.map(item => item.id));
  for (const id of Object.keys(meta.records)) if (!server.has(id)) delete meta.records[id];
  if (merged.changed) { try { storage.setItem(COLLECTIONS[collection].key, JSON.stringify(merged.list)); } catch { /* Memory keeps them. */ } }
  writeMeta(collection, meta, storage);
  reconciled.set(collection, { adopted: merged.adopted, dropped: merged.dropped });
  return merged;
}

/** Fill the local cache before the repositories read it. A primed cache does not wait for the network. */
export async function hydrateAccountData(user, { timeout = 5000 } = {}) {
  account = user && !user.guest && user.auth_enabled !== false && user.username ? user.username : null;
  if (!account) return { active: false };
  const names = Object.keys(COLLECTIONS);
  const unprimed = names.filter(name => readMeta(name).owner !== account);
  // A cache that is not what this browser last synced is not shown at all: the screens open on the server's records
  // (otherwise a Storyboard opened from an old copy reads every sheet the copy lacks as newly added and fills it again).
  const cached = new Map(names.map(name => [name, readList(name)]));
  const behind = names.filter(name => !unprimed.includes(name) && cacheBehind(cached.get(name), readMeta(name), r => r?.[COLLECTIONS[name].id]));
  const started = Date.now();
  settled = false;
  const work = Promise.allSettled(names.map(name => reconcile(name, browserStorage, cached.get(name)))).then(results => {
    const failed = results.map((result, i) => result.status === 'rejected' ? names[i] + ': ' + (result.reason?.message || result.reason) : null).filter(Boolean);
    if (failed.length) status.error = failed.join(' · ');
    status.hydrated = !failed.length;
    status.hydrationMs = Date.now() - started;
  }).finally(() => { settled = true; });
  status.waitedFor = [...unprimed, ...behind];
  hydration = work;
  if (unprimed.length || behind.length) await Promise.race([work, new Promise(resolve => setTimeout(resolve, timeout))]);
  return { active: true, waited: unprimed.length > 0 || behind.length > 0 };
}
let hydration = Promise.resolve(), settled = true;
/** Resolves when background hydration (and the repositories' apply of its result) has finished. */
export const accountSyncReady = () => hydration.then(() => new Promise(resolve => setTimeout(resolve, 0)));
/** The server's records have reached the repositories (or no account sync runs) — a copy in memory is now the account's. */
export const accountSyncSettled = () => settled;

/** Repositories register once their module state exists. apply(records, removedIds) replaces records in memory. */
export function registerCollection(collection, { list, apply, isReplaceable }) {
  if (!COLLECTIONS[collection]) throw new Error('unknown collection ' + collection);
  const entry = { list, apply, isReplaceable, seen: new Set(list().map(r => r?.[COLLECTIONS[collection].id])), timer: null, flight: null, again: false };
  registry.set(collection, entry);
  if (!account) return;
  // Background hydration (primed cache) may bring records from other browsers: apply them to the live state.
  hydration.then(() => { applyServerList(collection); noteChange(collection); });
}
/** Apply what background hydration took from the server to a repository that already rendered its cache. */
function applyServerList(collection) {
  const entry = registry.get(collection), result = reconciled.get(collection);
  if (!entry || !result) return;
  reconciled.delete(collection);
  const { id: field, time } = COLLECTIONS[collection];
  const memory = new Map(entry.list().map(r => [r?.[field], r]));
  // An edit made in this tab after the page opened (newer than the server copy) is kept and pushed instead.
  const incoming = result.adopted.filter(r => { const mine = memory.get(r[field]); return !mine || (hashOf(mine) !== hashOf(r) && time(r) >= time(mine)); });
  const removed = [...result.dropped].filter(id => memory.has(id));
  if (incoming.length || removed.length) entry.apply(incoming, removed);
  for (const r of incoming) entry.seen.add(r[field]);
  for (const id of removed) entry.seen.delete(id);
}
const reconciled = new Map(); // collection → { adopted, dropped } from hydration, until the repository registers

export function noteChange(collection, removedId, replacedRecord) {
  const entry = registry.get(collection);
  if (!account || !entry || inspecting()) return; // 관리자 열람: 읽기 전용 — 이 탭의 변경은 계정에 보내지 않는다
  if (removedId) {
    // A reload can happen before the debounced push. Keep the deletion intent
    // alongside the last accepted revision so a concurrent remote edit still wins.
    const meta = readMeta(collection);
    if (meta.owner === account) {
      if (!meta.pending.includes(removedId)) meta.pending.push(removedId);
      // The sync index is shared by tabs. Only use a revision that represents
      // the blank we inspected, even if another tab saves an edit before push.
      if (replacedRecord) (meta.replacements ??= {})[removedId] = hashOf(replacedRecord);
      writeMeta(collection, meta);
    }
  }
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => void push(collection), 1200);
}
/** Push now (used before navigation-sensitive steps and by tests). */
export async function flushAccountSync() {
  for (const [collection, entry] of registry) { clearTimeout(entry.timer); await push(collection); }
}

async function push(collection) {
  const entry = registry.get(collection);
  if (!account || !entry || inspecting()) return;
  if (entry.flight) { entry.again = true; return entry.flight; }
  entry.flight = (async () => {
    try { await pushOnce(collection, entry); }
    catch (error) { status.error = error.message; if (error.status !== 401 && error.status !== 409) entry.timer = setTimeout(() => void push(collection), 15000); }
    finally { entry.flight = null; }
    if (entry.again) { entry.again = false; await push(collection); }
  })();
  return entry.flight;
}

async function pushOnce(collection, entry) {
  const { id: field, time } = COLLECTIONS[collection];
  const meta = readMeta(collection);
  if (meta.owner !== account) { meta.owner = account; meta.records = {}; meta.pending = []; delete meta.replacements; }
  const records = entry.list().filter(r => r && RID.test(String(r[field] || '')));
  const present = new Set(records.map(r => r[field]));
  // Deletions: seen in this session and now gone. Queue first, then send.
  for (const id of entry.seen) if (!present.has(id) && meta.records[id] && !meta.pending.includes(id)) meta.pending.push(id);
  for (const id of present) entry.seen.add(id);
  for (const id of [...entry.seen]) if (!present.has(id)) entry.seen.delete(id);
  meta.pending = meta.pending.filter(id => !present.has(id) || meta.replacements?.[id]);
  writeMeta(collection, meta);
  const upserts = [];
  for (const record of records) {
    if (meta.replacements?.[record[field]] && entry.isReplaceable?.(record)) continue;
    const hash = hashOf(record), known = meta.records[record[field]];
    if (known && known[1] === hash) continue;
    upserts.push({ record, hash, bytes: recordJson(record).length * 2, item: { id: record[field], data: record, base_revision: known?.[0] || 0, updated_at: time(record) } });
  }
  const deletes = meta.pending.filter(id => !present.has(id)).map(id => {
    const known = meta.records[id], expected = meta.replacements?.[id];
    return { id, base_revision: !expected || expected === known?.[1] ? known?.[0] || 0 : 0 };
  });
  if (!upserts.length && !deletes.length) return;
  const sent = new Map(upserts.map(u => [u.item.id, u]));
  for (const batch of batches(upserts, deletes)) {
    const result = await api(collection, { method: 'POST', body: batch });
    const next = readMeta(collection);
    next.owner = account;
    for (const applied of result.applied) {
      if (applied.deleted) { delete next.records[applied.id]; delete next.replacements?.[applied.id]; next.pending = next.pending.filter(id => id !== applied.id); continue; }
      next.records[applied.id] = [applied.revision, sent.get(applied.id)?.hash || ''];
      status.pushed++;
    }
    writeMeta(collection, next);
    if (result.conflicts?.length) await resolveConflicts(collection, entry, result.conflicts, sent);
  }
}
function* batches(upserts, deletes) {
  let items = [], bytes = 0;
  for (const u of upserts) {
    if (items.length && (items.length >= MAX_BATCH || bytes + u.bytes > MAX_BATCH_BYTES)) { yield { items }; items = []; bytes = 0; }
    items.push(u.item); bytes += u.bytes;
  }
  if (items.length || deletes.length) yield { items, deletes: deletes.slice(0, MAX_BATCH) };
}

async function resolveConflicts(collection, entry, conflicts, sent) {
  const { id: field, time } = COLLECTIONS[collection];
  const meta = readMeta(collection), adopt = [], remove = [], retry = [];
  status.conflicts += conflicts.length;
  for (const conflict of conflicts) {
    const mine = sent.get(conflict.id)?.record;
    if (conflict.missing) { delete meta.records[conflict.id]; if (mine) retry.push({ id: conflict.id, data: mine, base_revision: 0, updated_at: time(mine) }); else meta.pending = meta.pending.filter(id => id !== conflict.id); continue; }
    if (conflict.deleted) { delete meta.records[conflict.id]; delete meta.replacements?.[conflict.id]; meta.pending = meta.pending.filter(id => id !== conflict.id); remove.push(conflict.id); continue; }
    if (!mine) { // our deletion raced an edit elsewhere: the edited record comes back
      const hash = hashOf(conflict.data);
      meta.records[conflict.id] = [conflict.revision, hash];
      // An automatic link can have arrived after the click. Retry against the
      // returned revision only if this newer record is itself still replaceable.
      if (meta.replacements?.[conflict.id] && entry.isReplaceable?.(conflict.data)) {
        meta.replacements[conflict.id] = hash;
        entry.again = true;
        continue;
      }
      delete meta.replacements?.[conflict.id];
      meta.pending = meta.pending.filter(id => id !== conflict.id);
      adopt.push(conflict.data); continue;
    }
    if (time(mine) > (conflict.updated_at || 0)) retry.push({ id: conflict.id, data: mine, base_revision: conflict.revision, updated_at: time(mine) });
    else { meta.records[conflict.id] = [conflict.revision, hashOf(conflict.data)]; adopt.push(conflict.data); }
  }
  writeMeta(collection, meta);
  if (adopt.length || remove.length) entry.apply(adopt, remove);
  for (const record of adopt) entry.seen.add(record[field]);
  for (const id of remove) entry.seen.delete(id);
  if (retry.length) {
    const result = await api(collection, { method: 'POST', body: { items: retry } });
    const next = readMeta(collection);
    for (const applied of result.applied) next.records[applied.id] = [applied.revision, hashOf(retry.find(r => r.id === applied.id).data)];
    writeMeta(collection, next);
  }
}

// ---------------------------------------------------------------- single documents and binary files
// Keyed documents (parsed review documents, full attachment text) and blobs (uploaded images) are written explicitly.
export const accountSyncActive = () => !!account;
const docRevisions = new Map();
export async function putDocument(collection, id, data) {
  if (!account || inspecting() || !RID.test(id)) return false;
  const key = collection + '\n' + id;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await api(collection, { method: 'POST', body: { items: [{ id, data, base_revision: docRevisions.get(key) || 0, updated_at: Date.now() }] } });
    if (result.applied.length) { docRevisions.set(key, result.applied[0].revision); return true; }
    docRevisions.set(key, result.conflicts[0]?.revision || 0); // last write wins for a document
  }
  return false;
}
export async function getDocument(collection, id) {
  if (!account || !RID.test(id)) return null;
  const item = (await fetchRecords(collection, [id])).get(id);
  if (!item || item.missing || item.deleted) return null;
  docRevisions.set(collection + '\n' + id, item.revision);
  return item.data;
}
export async function deleteDocument(collection, id) {
  if (!account || inspecting() || !RID.test(id)) return;
  const key = collection + '\n' + id;
  let base = docRevisions.get(key);
  if (base == null) base = (await fetchRecords(collection, [id])).get(id)?.revision || 0;
  const result = await api(collection, { method: 'POST', body: { deletes: [{ id, base_revision: base }] } });
  if (result.conflicts?.length) await api(collection, { method: 'POST', body: { deletes: [{ id, base_revision: result.conflicts[0].revision }] } });
  docRevisions.delete(key);
}
export const listManifest = collection => manifest(collection);
export const writeRecords = (collection, body) => inspecting() ? Promise.resolve({ applied: [], conflicts: [], skipped: [] }) : api(collection, { method: 'POST', body });
export const recordHash = hashOf;
export function syncIndex(collection) { const meta = readMeta(collection); if (meta.owner !== account) Object.assign(meta, { owner: account, records: {}, pending: [], replacements: {} }); return meta; }
export const saveSyncIndex = (collection, meta) => writeMeta(collection, meta);
export async function documentIds(collection) {
  if (!account) return new Set();
  return new Set((await manifest(collection)).filter(item => !item.deleted).map(item => item.id));
}
export const blobUrl = id => withInspect(BASE + 'blobs/' + encodeURIComponent(id));
export async function putBlob(id, blob) {
  if (!account || inspecting() || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) return false;
  const response = await fetchResource(blobUrl(id), { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  if (!response.ok) throw new Error('파일을 서버에 저장하지 못했어요 (' + response.status + ')');
  return true;
}
export async function missingBlobs(ids) {
  if (!account || !ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 1000) out.push(...(await api('blobs/missing', { method: 'POST', body: { ids: ids.slice(i, i + 1000) } })).missing);
  return out;
}
export function dataUrlBlob(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!match) return null;
  const bytes = match[2] ? Uint8Array.from(atob(match[3]), c => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(match[3]));
  return new Blob([bytes], { type: match[1] });
}

/** Test hook: reset module state and point the engine at an account without hydration. */
export function __resetAccountSync(user = null) {
  account = user; registry.clear(); reconciled.clear(); docRevisions.clear(); hydration = Promise.resolve(); settled = true;
  Object.assign(status, { hydrated: false, error: '', pushed: 0, conflicts: 0 });
}
