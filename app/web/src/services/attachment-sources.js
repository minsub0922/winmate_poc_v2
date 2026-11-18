import { openDatabase } from '../repositories/browser.js';
import { accountSyncActive, putDocument, getDocument, documentIds } from '../repositories/account-sync.js';
// Full extracted text of an attachment. The account keeps it (collection attachment-sources); IndexedDB and memory
// are caches, so another browser of the same account can still cite and summarize the whole source.
const cache = new Map();
let database;
function db() {
  if (!database) database = new Promise(resolve => {
    try { const request = openDatabase('winmate-requirements', 1); request.onupgradeneeded = () => request.result.createObjectStore('sources'); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); }
    catch { resolve(null); }
  });
  return database;
}
async function cacheLocally(id, text) {
  try {
    const database = await db();
    if (database) await new Promise(resolve => { const tx = database.transaction('sources', 'readwrite'); tx.objectStore('sources').put(text, id); tx.oncomplete = tx.onerror = tx.onabort = resolve; });
  } catch { /* The current session still holds the whole source. */ }
}
export async function saveAttachmentSource(id, text) {
  cache.set(id, text);
  await cacheLocally(id, text);
  if (accountSyncActive()) putDocument('attachment-sources', id, { text }).catch(error => console.warn('첨부 원문을 계정에 저장하지 못했어요', error));
}
export async function loadAttachmentSource(file) {
  if (cache.has(file.id)) return cache.get(file.id);
  try {
    const database = await db();
    if (database) {
      const value = await new Promise(resolve => { const request = database.transaction('sources').objectStore('sources').get(file.id); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); });
      if (typeof value === 'string') { cache.set(file.id, value); return value; }
    }
  } catch { /* Fall through to the account copy. */ }
  try {
    const remote = await getDocument('attachment-sources', file.id);
    if (typeof remote?.text === 'string') { cache.set(file.id, remote.text); void cacheLocally(file.id, remote.text); return remote.text; }
  } catch { /* A saved excerpt remains available and is explicitly marked as partial. */ }
  return file.text || '';
}
export const cachedAttachmentSource = file => cache.get(file.id) ?? file.text ?? '';
export async function hydrateAttachmentSources(p) { await Promise.all((p.req?.files || []).map(loadAttachmentSource)); }
/** Move full texts that only exist in this browser to the account (background, once per visit). */
export async function migrateAttachmentSources() {
  if (!accountSyncActive()) return 0;
  const database = await db(); if (!database) return 0;
  const entries = await new Promise(resolve => {
    const out = []; const request = database.transaction('sources').objectStore('sources').openCursor();
    request.onsuccess = () => { const cursor = request.result; if (cursor) { out.push([cursor.key, cursor.value]); cursor.continue(); } else resolve(out); };
    request.onerror = () => resolve(out);
  });
  if (!entries.length) return 0;
  const remote = await documentIds('attachment-sources');
  let moved = 0;
  for (const [id, text] of entries) if (typeof id === 'string' && typeof text === 'string' && !remote.has(id)) { await putDocument('attachment-sources', id, { text }); moved++; }
  return moved;
}
