import { openDatabase } from '../repositories/browser.js';
const cache = new Map();
let database;
function db() {
  if (!database) database = new Promise(resolve => {
    try { const request = openDatabase('winmate-requirements', 1); request.onupgradeneeded = () => request.result.createObjectStore('sources'); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); }
    catch { resolve(null); }
  });
  return database;
}
export async function saveAttachmentSource(id, text) {
  cache.set(id, text);
  try {
    const database = await db();
    if (database) await new Promise(resolve => { const tx = database.transaction('sources', 'readwrite'); tx.objectStore('sources').put(text, id); tx.oncomplete = tx.onerror = tx.onabort = resolve; });
  } catch { /* The current session still holds the whole source. */ }
}
export async function loadAttachmentSource(file) {
  if (cache.has(file.id)) return cache.get(file.id);
  try {
    const database = await db();
    if (database) {
      const value = await new Promise(resolve => { const request = database.transaction('sources').objectStore('sources').get(file.id); request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); });
      if (typeof value === 'string') { cache.set(file.id, value); return value; }
    }
  } catch { /* A saved excerpt remains available and is explicitly marked as partial. */ }
  return file.text || '';
}
export const cachedAttachmentSource = file => cache.get(file.id) ?? file.text ?? '';
export async function hydrateAttachmentSources(p) { await Promise.all((p.req?.files || []).map(loadAttachmentSource)); }
