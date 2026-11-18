// 건물 조감도 ↔ account (collection "buildings"). The building module (src/building, bundled like the artifact) keeps its
// own IndexedDB `winmate-building`; inside the app it calls window.__wmBldStoreHook, implemented here:
//   ready(open)  once per page: reconcile the account with that IndexedDB (server records win; local-only records of
//                this account — or the browser's pre-account history on its first sync — are uploaded)
//   put(b)       push one building (debounced per building, revision-checked; newer updatedAt wins a conflict)
//   remove(id)   delete it in the account (tombstone)
// The IndexedDB is not per account, so on an account switch it is refilled with that account's buildings.
import { accountSyncActive, fetchRecords, listManifest, writeRecords, recordHash, syncIndex, saveSyncIndex } from '../repositories/account-sync.js';

const COLLECTION = 'buildings';
const RID = /^[A-Za-z0-9_.:@-]{1,200}$/;
const timers = new Map();
let readiness = null, database = null, changed = () => {}, queue = Promise.resolve();

function request(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out?.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('aborted'));
  });
}

async function reconcile(open) {
  const db = await open(); if (!db) return;
  database = db;
  const meta = syncIndex(COLLECTION);
  const firstSync = !Object.keys(meta.records).length && !meta.synced;
  const local = (await request(db, 'b', 'readonly', s => s.getAll())) || [];
  const items = await listManifest(COLLECTION);
  const server = new Map(items.map(item => [item.id, item]));
  const fetch = items.filter(item => !item.deleted && (!meta.records[item.id] || meta.records[item.id][0] !== item.revision || !local.some(b => b.id === item.id))).map(item => item.id);
  const fetched = fetch.length ? await fetchRecords(COLLECTION, fetch) : new Map();
  const keep = [], uploads = [];
  for (const b of local) {
    if (!b || !RID.test(String(b.id || ''))) continue;
    const item = server.get(b.id), known = meta.records[b.id];
    if (item?.deleted) { delete meta.records[b.id]; continue; }                      // deleted elsewhere
    if (item) {
      const remote = fetched.get(b.id);
      const dirty = !known || recordHash(b) !== known[1];
      if (remote && !remote.missing && !(dirty && (b.updatedAt || 0) > (remote.updated_at || 0))) { keep.push(remote.data); meta.records[b.id] = [remote.revision, recordHash(remote.data)]; continue; }
      if (dirty) uploads.push({ id: b.id, data: b, base_revision: item.revision, updated_at: b.updatedAt || 0 });
      keep.push(b); continue;
    }
    // Not in the account: upload this account's own unsynced work, the seeded examples (a deletion elsewhere is a
    // tombstone above, so they never come back), or the whole browser history on its first sync.
    if (firstSync || b.example || (meta.mine || []).includes(b.id)) { uploads.push({ id: b.id, data: b, base_revision: 0, updated_at: b.updatedAt || 0 }); keep.push(b); }
  }
  for (const [id, item] of fetched) if (!item.missing && !item.deleted && !keep.some(b => b.id === id)) { keep.push(item.data); meta.records[id] = [item.revision, recordHash(item.data)]; }
  // Edits made in this tab while the account was being read stay (newer updatedAt, or not yet in the account).
  const latest = new Map(((await request(db, 'b', 'readonly', s => s.getAll())) || []).map(b => [b.id, b]));
  const result = new Map(keep.map(b => [b.id, b]));
  for (const [id, b] of latest) {
    const chosen = result.get(id);
    if (chosen ? (b.updatedAt || 0) > (chosen.updatedAt || 0) : !local.some(x => x.id === id)) result.set(id, b);
  }
  await request(db, 'b', 'readwrite', s => { s.clear(); for (const b of result.values()) s.put(b); });
  meta.synced = true; meta.mine = [];
  saveSyncIndex(COLLECTION, meta);
  for (const item of uploads) await send(item);
}

async function send(item) {
  const result = await writeRecords(COLLECTION, { items: [item] });
  const meta = syncIndex(COLLECTION);
  if (result.applied.length) { meta.records[item.id] = [result.applied[0].revision, recordHash(item.data)]; meta.mine = (meta.mine || []).filter(id => id !== item.id); saveSyncIndex(COLLECTION, meta); return; }
  const conflict = result.conflicts[0];
  if (!conflict) return;
  if (conflict.deleted || conflict.missing) { delete meta.records[item.id]; saveSyncIndex(COLLECTION, meta); if (conflict.missing) await send({ ...item, base_revision: 0 }); return; }
  if ((item.updated_at || 0) > (conflict.updated_at || 0)) { await send({ ...item, base_revision: conflict.revision }); return; }
  // The account copy is newer: show it.
  meta.records[item.id] = [conflict.revision, recordHash(conflict.data)]; saveSyncIndex(COLLECTION, meta);
  if (database) { await request(database, 'b', 'readwrite', s => s.put(conflict.data)).catch(() => {}); changed(); }
}

const enqueue = work => { queue = queue.then(work).catch(error => console.warn('건물 기록을 계정에 저장하지 못했어요', error)); return queue; };

export const buildingSync = {
  ready(open, notify) {
    if (typeof notify === 'function') changed = notify;
    if (!accountSyncActive()) return Promise.resolve();
    readiness ||= enqueue(() => reconcile(open)).then(() => changed());
    // A slow network never holds the building list: show the cache, then redraw when the account answered.
    return Promise.race([readiness, new Promise(resolve => setTimeout(resolve, 2500))]);
  },
  put(b) {
    if (!accountSyncActive() || !RID.test(String(b?.id || ''))) return;
    const meta = syncIndex(COLLECTION);
    if (!meta.records[b.id] && !(meta.mine || []).includes(b.id)) { meta.mine = [...(meta.mine || []), b.id]; saveSyncIndex(COLLECTION, meta); }
    clearTimeout(timers.get(b.id));
    const snapshot = structuredClone(b);
    timers.set(b.id, setTimeout(() => { timers.delete(b.id); enqueue(() => {
      const known = syncIndex(COLLECTION).records[snapshot.id];
      if (known && known[1] === recordHash(snapshot)) return;
      return send({ id: snapshot.id, data: snapshot, base_revision: known?.[0] || 0, updated_at: snapshot.updatedAt || 0 });
    }); }, 800));
  },
  remove(id) {
    if (!accountSyncActive() || !RID.test(String(id || ''))) return;
    clearTimeout(timers.get(id)); timers.delete(id);
    enqueue(async () => {
      const meta = syncIndex(COLLECTION);
      const result = await writeRecords(COLLECTION, { deletes: [{ id, base_revision: meta.records[id]?.[0] || 0 }] });
      if (result.conflicts?.length) await writeRecords(COLLECTION, { deletes: [{ id, base_revision: result.conflicts[0].revision }] });
      delete meta.records[id]; meta.mine = (meta.mine || []).filter(x => x !== id); saveSyncIndex(COLLECTION, meta);
    });
  },
  /** Tests: wait for queued work. */
  idle: () => queue,
};
