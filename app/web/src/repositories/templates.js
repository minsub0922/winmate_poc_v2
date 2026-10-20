import { fetchResource, requestJson, postJson } from '../api/client.js';
import { getBootstrap } from '../api/bootstrap.js';
import { openDatabase } from './browser.js';
import { synchronizeTemplate } from '../services/telemetry.js';
import { notify } from '../services/notifications.js';
import { loadBg } from '../services/packs.js';
import { legacySrc } from '../domain/templates/legacy_img.js';
// Authenticated My templates live in the account DB; IndexedDB is a cache and legacy import source.
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
const BLOBS = new Map(); // new images waiting to be saved with their template
const REVISIONS = new Map();
const REMOTE_IMAGES = new Set();
let storeId = '', writeQueue = Promise.resolve();
function account() { try { const user = getBootstrap().user; return user?.template_sync && user.username && !user.guest ? user.username : null; } catch { return null; } }
export const myAccountStorage = () => !!account();
const imagePath = id => '/api/my-templates/images/' + encodeURIComponent(id);
const queued = fn => { const result = writeQueue.then(fn); writeQueue = result.catch(() => {}); return result; };
const subs = new Set();
let ok = true; // false: no IndexedDB here — kept for this visit only
const emit = () => { LIST = [...LIST].sort((a, b) => (b.my.up || 0) - (a.my.up || 0)); for (const f of subs) f(); };
export const useMy = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => LIST);
export const myList = () => LIST;
export const myPersistent = () => ok || myAccountStorage();
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

const asDataUrl = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('템플릿 이미지를 읽지 못했어요.')); reader.readAsDataURL(blob); });
/** Keep library pictures too: a template can move to a server without the original image packs. */
async function packPictures(row, sources = new Map()) {
  const host = document.createElement('template'); host.innerHTML = row.html;
  let changed = false;
  const packed = async source => {
    if (!source || source === BLANK || source.startsWith('wmimg:') || source.startsWith('#')) return source;
    if (!sources.has(source)) sources.set(source, (async () => {
      const candidate = legacySrc(source.replace(/^\/(?=img\/)/, ''));
      const address = await loadBg(/^(img|lib|assets)\//.test(candidate) ? '/' + candidate : candidate);
      if (!address) throw new Error('템플릿 사진을 읽지 못했어요: ' + source);
      const response = await fetchResource(address);
      if (!response.ok) throw new Error('템플릿 사진을 읽지 못했어요: ' + source);
      const blob = await response.blob();
      const hash = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('') : newImgId();
      const id = 'asset_' + hash;
      BLOBS.set(id, blob);
      if (!URLS.has(id)) URLS.set(id, URL.createObjectURL(blob));
      return 'wmimg:' + id;
    })());
    return sources.get(source);
  };
  for (const image of host.content.querySelectorAll('img')) {
    const source = image.getAttribute('data-fill') || image.getAttribute('src');
    const next = await packed(source);
    if (next !== source || image.hasAttribute('data-fill') && next?.startsWith('wmimg:')) {
      image.setAttribute('src', next); image.removeAttribute('data-fill'); image.removeAttribute('srcset'); image.removeAttribute('sizes'); changed = true;
    }
  }
  for (const element of host.content.querySelectorAll('[style],[data-bg],[data-bg-rendered],[data-bg-wait]')) {
    for (const attr of ['data-bg', 'data-bg-rendered', 'data-bg-wait']) {
      const source = element.getAttribute(attr);
      if (!source) continue;
      const next = await packed(source);
      if (next !== source) { element.setAttribute(attr, next); changed = true; }
    }
    const style = element.getAttribute('style') || ''; let nextStyle = style;
    for (const match of style.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)) {
      const next = await packed(match[2]);
      if (next !== match[2]) nextStyle = nextStyle.replace(match[0], 'url("' + next + '")');
    }
    if (nextStyle !== style) { element.setAttribute('style', nextStyle); changed = true; }
  }
  return changed ? { ...row, html: host.innerHTML, imgs: tokensOf(host.innerHTML) } : row;
}
async function remoteImages(rows) {
  const images = {};
  for (const id of new Set(rows.flatMap(row => tokensOf(row.html)))) {
    if (REMOTE_IMAGES.has(id)) continue;
    let blob = BLOBS.get(id);
    const url = URLS.get(id);
    if (!blob && url?.startsWith('blob:')) { const response = await fetchResource(url); if (!response.ok) throw new Error('템플릿 이미지를 읽지 못했어요.'); blob = await response.blob(); }
    if (blob) images[id] = await asDataUrl(blob);
  }
  return images;
}
async function remoteList() {
  const items = []; let after = '';
  do {
    const page = await requestJson('/api/my-templates' + (after ? '?after=' + encodeURIComponent(after) : ''));
    if (page.owner !== account()) throw new Error('로그인 계정이 바뀌었습니다. 새로고침해 주세요.');
    if (storeId && storeId !== page.store_id) REMOTE_IMAGES.clear();
    storeId = page.store_id; items.push(...page.items); after = page.next;
  } while (after);
  return items;
}
async function loadAccount(local) {
  let manifest = await remoteList();
  const known = new Set(manifest.map(row => row.f));
  const sources = new Map();
  // Never upload cached server records over a newer edit or a deletion from another browser.
  const legacy = local.filter(row => !known.has(row.f) && (!row.account || row.account.owner === account() && row.account.store !== storeId));
  for (const original of legacy) { const row = await packPictures(original, sources); await postJson('/api/my-templates', { mode: 'migrate', items: [row], images: await remoteImages([row]) }); }
  if (legacy.length) manifest = await remoteList();
  const cached = new Map(local.map(row => [row.f, row]));
  const records = [], revisions = new Map();
  for (const entry of manifest) {
    revisions.set(entry.f, entry.revision);
    if (entry.deleted) continue;
    const old = cached.get(entry.f);
    let row = old?.account?.store === storeId && old.account.owner === account() && old.account.revision === entry.revision
      ? old : await requestJson('/api/my-templates/' + encodeURIComponent(entry.f));
    const portable = await packPictures(row, sources);
    let revision = row.revision || row.account?.revision || entry.revision;
    if (portable !== row) {
      const response = await postJson('/api/my-templates', { items: [{ ...portable, base_revision: revision }], images: await remoteImages([portable]) });
      row = portable; revision = response.items[0].revision;
    }
    revisions.set(row.f, revision);
    row.revision = revision;
    row.account = { owner: account(), store: storeId, revision };
    for (const id of tokensOf(row.html)) { URLS.set(id, imagePath(id)); BLOBS.delete(id); REMOTE_IMAGES.add(id); }
    records.push(row);
  }
  if (ok) {
    try {
      await run('tpl', 'readwrite', st => { for (const row of local) st.delete(row.f); for (const row of records) st.put(row); });
    } catch { notify('계정에는 저장됐지만 브라우저 캐시를 갱신하지 못했어요.', 'warn'); }
  }
  REVISIONS.clear(); for (const [f, revision] of revisions) REVISIONS.set(f, revision);
  return records;
}

/** Import legacy browser templates once, then load the account's authoritative records and images. */
export async function loadMy() {
  const d = await db();
  if (!d) ok = false;
  let recs = [];
  try {
    if (d) {
      const imgs = await new Promise((res, rej) => { const out = []; const tx = d.transaction('img', 'readonly'); const rq = tx.objectStore('img').openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); }; rq.onerror = () => rej(rq.error); });
      for (const [id, b] of imgs) if (b instanceof Blob && !URLS.has(id)) URLS.set(id, URL.createObjectURL(b));
      recs = (await run('tpl', 'readonly', st => st.getAll())) || [];
    }
  } catch (e) { console.warn('My 템플릿을 읽지 못했어요', e); }
  if (account()) {
    REVISIONS.clear(); for (const row of recs) if (row.account?.owner === account()) REVISIONS.set(row.f, row.account.revision);
    try { recs = await loadAccount(recs); }
    catch (error) { notify('계정 My 템플릿을 불러오지 못했어요. ' + error.message, 'error', { id: 'my-account-load' }); }
  }
  const remaining = new Set(recs.map(row => row.f));
  for (const meta of LIST) if (!remaining.has(meta.f)) { RAW.delete(meta.f); unregisterLayout(meta.f); }
  LIST = [];
  for (const r of recs) { if (!r?.meta) continue; register(r); LIST.push(r.meta); synchronizeTemplate(r.f, r); }
  emit();
}

/** store pictures (id → Blob) — their blob urls are ready right away */
export async function putImages(map) {
  for (const [id, b] of map) { BLOBS.set(id, b); if (!URLS.has(id)) URLS.set(id, URL.createObjectURL(b)); }
  if (!ok) return;
  try { await run('img', 'readwrite', (st) => { for (const [id, b] of map) st.put(b, id); }); }
  catch (error) { if (!account()) throw error; }
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
export const saveTemplates = recs => queued(() => saveRows(recs));
async function saveRows(recs) {
  const now = Date.now();
  let rows = recs.map((r) => ({ f: r.meta.f, meta: { ...r.meta, my: { ...r.meta.my, up: now, at: r.meta.my.at || now } }, html: r.html, imgs: tokensOf(r.html) }));
  if (account()) {
    const sources = new Map(); const portable = [];
    for (const row of rows) portable.push(await packPictures(row, sources));
    rows = portable;
    // Save images and layouts in one server transaction. A failed request never reports a local-only success.
    const response = await postJson('/api/my-templates', { items: rows.map(row => ({ ...row, base_revision: REVISIONS.get(row.f) || 0 })), images: await remoteImages(rows) });
    const versions = new Map(response.items.map(item => [item.f, item.revision]));
    storeId = response.store_id;
    for (const row of rows) {
      const revision = versions.get(row.f);
      REVISIONS.set(row.f, revision);
      row.account = { owner: account(), store: storeId, revision };
      for (const id of tokensOf(row.html)) { REMOTE_IMAGES.add(id); BLOBS.delete(id); }
    }
  }
  if (ok) {
    try { await run('tpl', 'readwrite', st => { for (const r of rows) st.put(r); }); }
    catch (error) { if (!account()) throw error; notify('계정에는 저장됐지만 브라우저 캐시를 갱신하지 못했어요.', 'warn'); }
  }
  for (const r of rows) { register(r); const i = LIST.findIndex((m) => m.f === r.f); if (i >= 0) LIST[i] = r.meta; else LIST.push(r.meta); }
  emit();
  for(const row of rows)synchronizeTemplate(row.f,row);
  return rows.map((r) => r.meta);
}
/** change name · part type … without touching the drawing */
export async function updateMeta(f, patch) {
  return queued(async () => {
    const m = LIST.find((x) => x.f === f); if (!m) return;
    const meta = { ...m, ...patch, my: { ...m.my, ...(patch.my || {}) } };
    await saveRows([{ meta, html: RAW.get(f) }]);
  });
}
/** delete templates and the pictures no other template uses */
export const deleteTemplates = fs => queued(() => deleteRows(fs));
async function deleteRows(fs) {
  if (account()) await postJson('/api/my-templates/delete', { items: fs.map(f => ({ f, base_revision: REVISIONS.get(f) || 0 })) });
  const gone = new Set(fs);
  const keep = new Set(); for (const [f, h] of RAW) if (!gone.has(f)) for (const t of tokensOf(h)) keep.add(t);
  const drop = []; for (const f of fs) for (const t of tokensOf(RAW.get(f))) if (!keep.has(t)) drop.push(t);
  if (ok) {
    try {
      await run('tpl', 'readwrite', (st) => { for (const f of fs) st.delete(f); });
      await run('img', 'readwrite', (st) => { for (const id of drop) st.delete(id); });
    } catch (error) { if (!account()) throw error; notify('계정에서 삭제했지만 브라우저 캐시를 갱신하지 못했어요.', 'warn'); }
  }
  for (const id of drop) { const u = URLS.get(id); if (u?.startsWith('blob:')) URL.revokeObjectURL(u); URLS.delete(id); BLOBS.delete(id); }
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
