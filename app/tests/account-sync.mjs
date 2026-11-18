// Browser account sync ↔ real account-data API (isolated SQLite). Two "browsers" are two storages against one server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { configureStorage } = await import('../web/src/repositories/browser.js');
const { setTransport } = await import('../web/src/api/client.js');
const sync = await import('../web/src/repositories/account-sync.js');

const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'winmate-account-sync-'));
const server = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', path.join(root, 'app/tests/fixtures/account_data_server.py'), String(port), path.join(folder, 'account.sqlite')], { stdio: ['ignore', 'inherit', 'inherit'] });
const origin = `http://127.0.0.1:${port}`;
let offline = false;
setTransport((input, options) => offline ? Promise.reject(new TypeError('network down')) : fetch(new URL(input, origin), options));
for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/health')).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
test.after(() => { server.kill(); fs.rmSync(folder, { recursive: true, force: true }); });

const USER = { username: 'local-dev', auth_enabled: true, guest: false };
function browser() {
  const data = new Map();
  return { data, local: { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) }, open: () => { throw new Error('no idb'); } };
}
/** One page load: hydrate, then a repository registers its in-memory list (like proposals.js does). */
async function load(b, collection = 'proposals', isReplaceable) {
  configureStorage(b); sync.__resetAccountSync();
  await sync.hydrateAccountData(USER, { timeout: 5000 });
  const repo = { list: JSON.parse(b.local.getItem(sync.COLLECTIONS[collection].key) || '[]'), applied: [] };
  sync.registerCollection(collection, {
    list: () => repo.list,
    isReplaceable,
    apply(records, removed) {
      repo.applied.push({ records: records.map(r => r.id), removed });
      const gone = new Set(removed), incoming = new Map(records.map(r => [r.id, r]));
      repo.list = repo.list.filter(r => !gone.has(r.id)).map(r => incoming.get(r.id) || r);
      for (const r of records) if (!repo.list.some(x => x.id === r.id)) repo.list.push(r);
    },
  });
  await sync.accountSyncReady();
  await sync.flushAccountSync();
  return repo;
}
const manifest = async (collection = 'proposals') => (await (await fetch(`${origin}/api/account-data/${collection}`)).json()).items;
const record = async (id, collection = 'proposals') => (await (await fetch(`${origin}/api/account-data/${collection}/fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) })).json()).items[0];
const proposal = (id, title, updatedAt) => ({ id, title, updatedAt, parts: [] });

test('legacy browser records move to the account once; a second browser receives them', async () => {
  const first = browser();
  first.local.setItem('winmate.v2.proposals', JSON.stringify([proposal('p1', '첫 제안서', 1000), proposal('p2', '둘째', 900)]));
  await load(first);
  const items = await manifest();
  assert.deepEqual(items.map(i => [i.id, i.revision]), [['p1', 1], ['p2', 1]]);
  assert.equal((await record('p1')).data.title, '첫 제안서');
  const meta = sync.readMeta('proposals', first.local);
  assert.equal(meta.owner, 'local-dev'); assert.equal(meta.records.p1[0], 1);

  const second = browser();
  const repo = await load(second);
  assert.deepEqual(repo.list.map(p => p.id), ['p1', 'p2']);           // hydrated before the repository read it
  assert.equal(sync.accountSyncStatus().hydrated, true);
  // Reload of the first browser pushes nothing (hashes match).
  await load(first);
  assert.deepEqual((await manifest()).map(i => i.revision), [1, 1]);
});

test('an edit in one browser reaches another; the newer concurrent edit wins', async () => {
  const a = browser(), b = browser();
  const repoA = await load(a);
  await load(b);
  // Browser A edits p1 at t=2000 and pushes.
  configureStorage(a); sync.__resetAccountSync();
  await sync.hydrateAccountData(USER);
  const memA = JSON.parse(a.local.getItem('winmate.v2.proposals'));
  memA[0] = proposal('p1', 'A 수정', 2000);
  sync.registerCollection('proposals', { list: () => memA, apply() {} });
  await new Promise(r => setTimeout(r, 0)); await sync.flushAccountSync();
  assert.equal((await record('p1')).data.title, 'A 수정');
  // Browser B (stale cache) edits p1 at t=1500: older than A → conflict → B adopts A's copy.
  configureStorage(b); sync.__resetAccountSync();
  const staleB = JSON.parse(b.local.getItem('winmate.v2.proposals'));
  staleB[0] = proposal('p1', 'B 오래된 수정', 1500);
  b.local.setItem('winmate.v2.proposals', JSON.stringify(staleB));
  const repoB = await load(b);
  assert.equal(repoB.list.find(p => p.id === 'p1').title, 'A 수정');
  assert.equal((await record('p1')).data.title, 'A 수정');
  // A newer edit from B (t=3000) wins over A's.
  repoB.list = repoB.list.map(p => p.id === 'p1' ? proposal('p1', 'B 최신 수정', 3000) : p);
  await sync.flushAccountSync();
  assert.equal((await record('p1')).data.title, 'B 최신 수정');
  void repoA;
});

test('deletion propagates and is never resurrected by an unsynced copy (seeded sample)', async () => {
  const a = browser();
  const repo = await load(a);
  repo.list = repo.list.filter(p => p.id !== 'p2');
  await sync.flushAccountSync();
  assert.equal((await record('p2')).deleted, true);
  // A brand-new browser that seeds the same deterministic ID before syncing never brings it back.
  const fresh = browser();
  fresh.local.setItem('winmate.v2.proposals', JSON.stringify([proposal('p2', '시드된 샘플', 5000)]));
  const repoFresh = await load(fresh);
  assert.equal(repoFresh.list.some(p => p.id === 'p2'), false);
  assert.equal((await record('p2')).deleted, true);
});

test('quota thinning never deletes on the server; the cache is restored from the account', async () => {
  const a = browser();
  const repo = await load(a);
  const kept = repo.list.map(p => p.id);
  assert(kept.includes('p1'));
  // localStorage lost p1 (quota), but the sync index still knows it.
  a.local.setItem('winmate.v2.proposals', '[]');
  const reloaded = await load(a);
  assert.deepEqual(reloaded.list.map(p => p.id).sort(), kept.sort());
  assert.equal((await record('p1')).deleted, false);
});

// 2026-11-18 pn63a3to (Safari): the proposals cache (4 MB+) no longer fit the browser quota, so every write failed and the
// browser kept an old copy under an up-to-date sync index. Each reload opened that old copy and the Storyboard re-filled
// every sheet the copy lacked. The reload must open on the account's record instead.
test('a cache write that failed leaves an older copy: the reload opens on the account record, not on it', async () => {
  const a = browser();
  const repo = await load(a);
  repo.list = [...repo.list, proposal('p9', '첫 판', 7000)];
  await sync.flushAccountSync();
  const oldCache = JSON.stringify(repo.list);
  repo.list = repo.list.map(p => p.id === 'p9' ? proposal('p9', '둘째 판', 8000) : p);
  await sync.flushAccountSync();
  assert.equal((await record('p9')).data.title, '둘째 판');
  // The write of the second version failed (quota): the cache still holds the first one, the index the second.
  a.local.setItem('winmate.v2.proposals', oldCache);
  const write = a.local.setItem;
  a.local.setItem = (k, v) => { if (k === 'winmate.v2.proposals') throw new Error('QuotaExceededError'); write(k, v); };
  configureStorage(a); sync.__resetAccountSync();
  await sync.hydrateAccountData(USER, { timeout: 5000 });
  assert.deepEqual(sync.accountSyncStatus().waitedFor, ['proposals'], 'the app waits for the server instead of opening the old copy');
  const reloaded = { list: JSON.parse(a.local.getItem('winmate.v2.proposals')) };
  sync.registerCollection('proposals', { list: () => reloaded.list, apply(records) { const by = new Map(records.map(r => [r.id, r])); reloaded.list = reloaded.list.map(r => by.get(r.id) || r); } });
  await sync.accountSyncReady();
  assert.equal(sync.accountSyncSettled(), true);
  assert.equal(reloaded.list.find(p => p.id === 'p9').title, '둘째 판', 'the account record replaces the old copy before anything reads it');
  await sync.flushAccountSync();
  assert.equal((await record('p9')).data.title, '둘째 판', 'the old copy is never sent back');
  a.local.setItem = write;
});

test('a deletion queued while offline survives a reload and is sent later', async () => {
  const a = browser();
  const repo = await load(a);
  await (await fetch(`${origin}/api/account-data/proposals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: 'p3', data: proposal('p3', '셋째', 4000), base_revision: 0, updated_at: 4000 }] }) })).json();
  const withP3 = await load(a);
  assert(withP3.list.some(p => p.id === 'p3'));
  offline = true;
  withP3.list = withP3.list.filter(p => p.id !== 'p3');
  await sync.flushAccountSync();                       // fails, but the deletion is queued in the index
  assert.deepEqual(sync.readMeta('proposals', a.local).pending, ['p3']);
  offline = false;
  a.local.setItem('winmate.v2.proposals', JSON.stringify(withP3.list));
  const after = await load(a);
  assert.equal(after.list.some(p => p.id === 'p3'), false);
  assert.equal((await record('p3')).deleted, true);
  assert.deepEqual(sync.readMeta('proposals', a.local).pending, []);
  void repo;
});

test('replacing a blank just before reload preserves a concurrent edit even when tabs share a sync index', async () => {
  const a = browser(), isBlank = row => row.title === '새 제안서';
  const repo = await load(a, 'proposals', isBlank);
  const blanks = ['concurrent-edit', 'automatic-link'].map(id => proposal(id, '새 제안서', 9000));
  repo.list.push(...blanks);
  await sync.flushAccountSync();
  const index = sync.syncIndex('proposals');
  const newer = [{ ...blanks[0], title: '다른 탭의 작업' }, { ...blanks[1], _share: { revision: 1 } }];
  for (const row of newer) {
    const response = await sync.writeRecords('proposals', { items: [{ id: row.id, data: row, base_revision: index.records[row.id][0], updated_at: row.updatedAt }] });
    index.records[row.id] = [response.applied[0].revision, sync.recordHash(row)];
  }
  // Another tab wrote the new revisions into shared localStorage; this tab still has the original blanks.
  sync.saveSyncIndex('proposals', index);
  for (const blank of blanks) {
    repo.list = repo.list.filter(row => row.id !== blank.id);
    sync.noteChange('proposals', blank.id, blank);
  }
  a.local.setItem('winmate.v2.proposals', JSON.stringify(repo.list));
  const fresh = await load(a, 'proposals', isBlank);
  assert.equal(fresh.list.find(row => row.id === blanks[0].id)?.title, '다른 탭의 작업');
  assert.deepEqual((await record(blanks[0].id)).data, newer[0]);
  assert.equal((await record(blanks[1].id)).deleted, true);
  assert.deepEqual(sync.readMeta('proposals', a.local).pending, []);
});

test('documents and blobs round-trip; guests and anonymous sessions never sync', async () => {
  configureStorage(browser()); sync.__resetAccountSync();
  assert.equal((await sync.hydrateAccountData({ guest: true, username: null })).active, false);
  assert.equal(await sync.putDocument('attachment-sources', 'f1', { text: 'x' }), false);
  await sync.hydrateAccountData(USER);
  assert.equal(await sync.putDocument('attachment-sources', 'f1', { text: '첨부 전체 원문' }), true);
  assert.equal(await sync.putDocument('attachment-sources', 'f1', { text: '수정된 원문' }), true);
  assert.deepEqual(await sync.getDocument('attachment-sources', 'f1'), { text: '수정된 원문' });
  assert((await sync.documentIds('attachment-sources')).has('f1'));
  const png = sync.dataUrlBlob('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
  assert.deepEqual(await sync.missingBlobs(['uimg1']), ['uimg1']);
  assert.equal(await sync.putBlob('uimg1', png), true);
  assert.deepEqual(await sync.missingBlobs(['uimg1']), []);
  const served = await fetch(origin + sync.blobUrl('uimg1'));
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await served.arrayBuffer()).length, png.size);
  await sync.deleteDocument('attachment-sources', 'f1');
  assert.equal(await sync.getDocument('attachment-sources', 'f1'), null);
});

test('pure planning: pending deletions are not refetched, unknown revisions are', () => {
  const meta = { records: { a: [1, 'h'], b: [1, 'h'] }, pending: ['b'] };
  const plan = sync.planReconcile([{ id: 'a' }], meta, [{ id: 'a', revision: 2 }, { id: 'b', revision: 1 }, { id: 'c', revision: 1 }, { id: 'd', revision: 3, deleted: true }], r => r.id);
  assert.deepEqual(plan, { fetch: ['a', 'c'], drop: [] });
  assert.equal(sync.hashText('같은 내용'), sync.hashText('같은 내용'));
  assert.notEqual(sync.hashText('a'), sync.hashText('b'));
});
