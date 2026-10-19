import { fetchResource } from '../api/client.js';
import { openDatabase } from './browser.js';
// My 템플릿 — the person's own layouts (PPTX they uploaded, layouts they edited), kept in this browser (IndexedDB 'winmate-my').
//   tpl: { f, meta, html, imgs[] } — html keeps pictures as "wmimg:<id>"     img: <id> → Blob
// At start every template is registered into data.js (L + layout HTML) with its pictures as blob URLs,
// so a proposal, the detail popup, PPTX export … draw it like any other layout.
import { useSyncExternalStore } from 'react';
import { registerLayout, unregisterLayout } from '../services/catalog.js';

const DBN = 'winmate-my';
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = openDatabase(DBN, 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('tpl')) d.createObjectStore('tpl', { keyPath: 'f' }); if (!d.objectStoreNames.contains('img')) d.createObjectStore('img'); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
function run(store, mode, fn) {
  return db().then((d) => new Promise((res, rej) => {
    if (!d) { res(null); return; }
    const tx = d.transaction(store, mode); const st = tx.objectStore(store);
    let out = null; const r = fn(st); if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
    tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('저장하지 못했어요'));
  }));
}

let LIST = []; // metas, newest first
const RAW = new Map(); // f → stored html (tokens)
const URLS = new Map(); // image id → blob url
const subs = new Set();
let ok = true; // false: no IndexedDB here — kept for this visit only
const emit = () => { LIST = [...LIST].sort((a, b) => (b.my.up || 0) - (a.my.up || 0)); for (const f of subs) f(); };
export const useMy = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => LIST);
export const myList = () => LIST;
export const myPersistent = () => ok;
export const isMy = (f) => /^L_MY_/.test(String(f || ''));
export const newF = () => 'L_MY_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const newImgId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const resolve = (html) => String(html || '').replace(/wmimg:([\w-]+)/g, (m, id) => URLS.get(id) || BLANK);
/** live html (blob urls of this visit) → the stored form */
export function tokenize(html) { let s = String(html || ''); for (const [id, u] of URLS) if (s.includes(u)) s = s.split(u).join('wmimg:' + id); return s; }
export const rawHtml = (f) => RAW.get(f) || '';
export const imgUrl = (id) => URLS.get(id) || '';
const tokensOf = (html) => [...new Set(Array.from(String(html || '').matchAll(/wmimg:([\w-]+)/g), (m) => m[1]))];

function register(rec) { RAW.set(rec.f, rec.html); registerLayout(rec.meta, resolve(rec.html)); }
/** draw a page before it is saved (the import review) — not stored, not listed */
export function previewRegister(meta, html) { registerLayout(meta, resolve(html)); }

/** read every template and picture, register them (app start) */
export async function loadMy() {
  const d = await db();
  if (!d) { ok = false; return; }
  try {
    const imgs = await new Promise((res) => { const out = []; const tx = d.transaction('img', 'readonly'); const rq = tx.objectStore('img').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); }; rq.onerror = () => res(out); });
    for (const [id, b] of imgs) if (b instanceof Blob && !URLS.has(id)) URLS.set(id, URL.createObjectURL(b));
    const recs = (await run('tpl', 'readonly', (st) => st.getAll())) || [];
    LIST = [];
    for (const r of recs) { if (!r || !r.meta) continue; register(r); LIST.push(r.meta); }
    emit();
  } catch (e) { console.warn('My 템플릿을 읽지 못했어요', e); }
}

/** store pictures (id → Blob) — their blob urls are ready right away */
export async function putImages(map) {
  for (const [id, b] of map) if (!URLS.has(id)) URLS.set(id, URL.createObjectURL(b));
  if (!ok) return;
  await run('img', 'readwrite', (st) => { for (const [id, b] of map) st.put(b, id); });
}
/** a picture from anywhere (blob · data url · url) → its id in the store */
export async function storeImage(src) {
  let blob = src instanceof Blob ? src : null;
  if (!blob) { const r = await fetchResource(src); blob = await r.blob(); }
  const id = newImgId();
  await putImages(new Map([[id, blob]]));
  return id;
}

/** save templates: [{ meta, html (with wmimg tokens) }] — new or overwriting the same f */
export async function saveTemplates(recs) {
  const now = Date.now();
  const rows = recs.map((r) => ({ f: r.meta.f, meta: { ...r.meta, my: { ...r.meta.my, up: now, at: r.meta.my.at || now } }, html: r.html, imgs: tokensOf(r.html) }));
  if (ok) await run('tpl', 'readwrite', (st) => { for (const r of rows) st.put(r); });
  for (const r of rows) { register(r); const i = LIST.findIndex((m) => m.f === r.f); if (i >= 0) LIST[i] = r.meta; else LIST.push(r.meta); }
  emit();
  return rows.map((r) => r.meta);
}
/** change name · part type … without touching the drawing */
export async function updateMeta(f, patch) {
  const m = LIST.find((x) => x.f === f); if (!m) return;
  const meta = { ...m, ...patch, my: { ...m.my, ...(patch.my || {}) } };
  await saveTemplates([{ meta, html: RAW.get(f) }]);
}
/** delete templates and the pictures no other template uses */
export async function deleteTemplates(fs) {
  const gone = new Set(fs);
  const keep = new Set(); for (const [f, h] of RAW) if (!gone.has(f)) for (const t of tokensOf(h)) keep.add(t);
  const drop = []; for (const f of fs) for (const t of tokensOf(RAW.get(f))) if (!keep.has(t)) drop.push(t);
  if (ok) {
    await run('tpl', 'readwrite', (st) => { for (const f of fs) st.delete(f); });
    await run('img', 'readwrite', (st) => { for (const id of drop) st.delete(id); });
  }
  for (const id of drop) { const u = URLS.get(id); if (u) URL.revokeObjectURL(u); URLS.delete(id); }
  for (const f of fs) { RAW.delete(f); unregisterLayout(f); }
  LIST = LIST.filter((m) => !gone.has(m.f));
  emit();
}
/** pictures a converted deck brought that none of the saved pages uses (pages left out) — drop them */
export async function dropImages(ids) {
  const used = new Set(); for (const h of RAW.values()) for (const t of tokensOf(h)) used.add(t);
  const drop = ids.filter((id) => !used.has(id));
  if (!drop.length) return;
  if (ok) await run('img', 'readwrite', (st) => { for (const id of drop) st.delete(id); });
  for (const id of drop) { const u = URLS.get(id); if (u) URL.revokeObjectURL(u); URLS.delete(id); }
}

/** a template's metadata in the shape every layout has (data.js L) + its own record (my) */
export function myMeta({ f, name, p = '', when = '', kind = 'pptx', file = '', page = 0, from = '', batch = '', text = '', title = '', nT = 0, nI = 0, pf = 0, at = 0 }) {
  return {
    f, c: 'MY', code: 'MY', name: name || title || '내 템플릿', when, g: kind === 'pptx' ? '내가 올린 PPTX' : '내가 고친 레이아웃', p: p || '', p2: null, ind: null, sol: null,
    req: [], ik: [], ih: [], ph: 0, phs: [], pc: 0, prods: [], sols: [], nT, nI, pf, txt: [name, text].filter(Boolean).join(' ').slice(0, 4000), hl: title,
    my: { kind, file, page, from, batch, at: at || Date.now(), up: Date.now() },
  };
}

/** what a drawn layout holds — text blocks, image slots, title, picture share (for metadata after an edit) */
export function measure(root) {
  const blocks = Array.from(root.querySelectorAll('[data-tb]')).map((e) => ({ s: e.textContent.replace(/\s+/g, ' ').trim(), fs: parseFloat(getComputedStyle(e).fontSize) || 0, y: e.getBoundingClientRect().top })).filter((b) => b.s);
  const R = root.getBoundingClientRect(); const k = R.width ? 1280 / R.width : 1;
  let area = 0; for (const im of root.querySelectorAll('[data-img], img')) { if (im.tagName === 'IMG' && im.closest('[data-img]')) continue; const r = im.getBoundingClientRect(); area += (r.width * k) * (r.height * k); }
  const wordy = (b) => b.s.length >= 4 && /[가-힣A-Za-z]{2}/.test(b.s);
  const top = [...blocks].filter((b) => (b.y - R.top) * k < 720 * 0.3 && wordy(b)).sort((a, b) => b.fs - a.fs || a.y - b.y)[0] || blocks.find(wordy) || blocks[0];
  return { text: blocks.map((b) => b.s).join(' '), nT: blocks.length, nI: root.querySelectorAll('[data-img]').length, title: top ? top.s.slice(0, 60) : '', pf: Math.min(1, Math.round((area / (1280 * 720)) * 100) / 100) };
}
