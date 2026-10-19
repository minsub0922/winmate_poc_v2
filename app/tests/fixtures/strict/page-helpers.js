// Test-only page helpers for the strict deterministic suites.
// Injected as an inline <script type="module"> into a page served by the Vite dev server, after the app has booted,
// so every import below resolves to the SAME module instance the running app uses (catalog, repositories, slides).
// Nothing here calls a model or the network beyond the app's own same-origin static/API resources.
import * as catalog from '/src/services/catalog.js';
import { exportPptx } from '/src/domain/slides/export-pptx.js';
import { convertPptx } from '/src/domain/slides/import/pptx2html.js';
import { applyOverrides, readBlocks, readImageSlots } from '/src/domain/slides/Slide.jsx';

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));
async function toB64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** A distinct PNG drawn on a canvas — returned as a data URL plus the SHA-256 of its exact bytes. */
async function makePng(color, w = 64, h = 36, label = '') {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.fillRect(2, 2, Math.max(1, (w / 4) | 0), Math.max(1, (h / 4) | 0));
  if (label) { g.fillStyle = '#000000'; g.font = '10px sans-serif'; g.fillText(label, 4, h - 6); }
  const dataUrl = c.toDataURL('image/png');
  const bytes = fromB64(dataUrl.split(',')[1]);
  return { dataUrl, sha: await sha256(bytes), size: bytes.length };
}

/** Mount a layout at its native 1280×720 size, apply overrides, report what is really on screen. */
async function render(f, ov, pageNo) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-30000px;top:0;width:1280px;height:720px;overflow:hidden;';
  document.body.appendChild(host);
  try {
    host.innerHTML = catalog.layoutHtml(f);
    const root = host.firstElementChild;
    if (!root) return { ok: false, reason: 'no layout html for ' + f };
    applyOverrides(root, ov || { t: {}, img: {} }, pageNo);
    await Promise.all(Array.from(root.querySelectorAll('img')).map((im) => (im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 4000); }))));
    const R = root.getBoundingClientRect();
    const tb = Array.from(root.querySelectorAll('[data-tb]'));
    const slots = Array.from(root.querySelectorAll('[data-img]')).map((e) => { const r = e.getBoundingClientRect(); return { i: e.getAttribute('data-img'), w: Math.round(r.width), h: Math.round(r.height) }; });
    return {
      ok: true, w: R.width, h: R.height, my: root.hasAttribute('data-my'), bg: !!root.getAttribute('data-bg'),
      tbIndexes: tb.map((e) => e.getAttribute('data-tb')),
      texts: tb.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      allText: root.textContent.replace(/\s+/g, ' '),
      imgs: Array.from(root.querySelectorAll('img')).map((im) => ({ src: (im.getAttribute('src') || '').slice(0, 40), loaded: im.complete && im.naturalWidth > 0 })),
      slots,
    };
  } finally { host.remove(); }
}

/** Text blocks that are really painted inside the 1280×720 root (the exporter skips hidden / off-slide ones). */
function visibleBlocks(f, ov) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-30000px;top:0;width:1280px;height:720px;overflow:hidden;';
  document.body.appendChild(host);
  try {
    host.innerHTML = catalog.layoutHtml(f);
    const root = host.firstElementChild;
    if (!root) return [];
    applyOverrides(root, ov || { t: {}, img: {} });
    const R = root.getBoundingClientRect();
    const out = [];
    for (const e of root.querySelectorAll('[data-tb]')) {
      const text = e.textContent.replace(/\s+/g, ' ').trim();
      if (!text || !/^\d+$/.test(e.getAttribute('data-tb'))) continue;
      let hidden = false;
      for (let x = e; x && x !== host; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) { hidden = true; break; } }
      const r = e.getBoundingClientRect();
      if (hidden || r.width < 4 || r.height < 4 || r.left < R.left - 1 || r.top < R.top - 1 || r.right > R.right + 1 || r.bottom > R.bottom + 1) continue;
      out.push({ i: Number(e.getAttribute('data-tb')), s: text, fs: parseFloat(getComputedStyle(e).fontSize) || 0, w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out;
  } finally { host.remove(); }
}

function pickLayouts(count, exclude = []) {
  const usable = (l) => !!catalog.layoutHtml(l.f) && visibleBlocks(l.f).length >= 2;
  const pool = catalog.LAYOUTS.filter((l) => !exclude.includes(l.f));
  const out = []; const seenC = new Set(); const seenKey = new Set();
  for (const l of pool) {
    if (out.length >= count) break;
    if (!seenC.has(l.c) && usable(l)) { seenC.add(l.c); seenKey.add(l.c + '|' + l.p); out.push(l); }
  }
  for (const l of pool) {
    if (out.length >= count) break;
    const key = l.c + '|' + l.p;
    if (!seenKey.has(key) && !out.includes(l) && usable(l)) { seenKey.add(key); out.push(l); }
  }
  return out.map((l) => ({ f: l.f, c: l.c, p: l.p, name: l.name, when: l.when || '' }));
}

async function exportDeck(slides, opts = {}) {
  const blob = await exportPptx(slides, opts);
  return { b64: await toB64(blob), size: blob.size, type: blob.type };
}

async function importBytes(b64, opts = {}) {
  const r = await convertPptx(fromB64(b64).buffer, opts);
  const images = [];
  for (const [k, b] of r.images) images.push({ k, type: b.type, size: b.size });
  return {
    mode: r.mode, size: r.size, warnings: r.warnings, images,
    slides: r.slides.map((s) => ({ n: s.n, title: s.title, text: s.text, nT: s.nT, nI: s.nI, hidden: s.hidden, htmlLength: s.html.length, my: /data-my="pptx"/.test(s.html), tokens: [...new Set(s.html.match(/wmimg:[\w-]+/g) || [])].length })),
  };
}

async function importError(b64) {
  try { const r = await convertPptx(fromB64(b64).buffer); return { ok: true, slides: r.slides.length }; } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}

/** PPTX → converted HTML registered as a layout (the My template path without IndexedDB) */
async function registerFromPptx(b64, f) {
  const r = await convertPptx(fromB64(b64).buffer);
  const urls = {};
  for (const [k, b] of r.images) urls[k] = URL.createObjectURL(b);
  const s = r.slides[0];
  catalog.registerLayout({ f, name: s.title || f, p: '', c: 'MY' }, s.html.replace(/wmimg:([\w-]+)/g, (m, t) => urls[t] || m));
  return { title: s.title, text: s.text, images: r.images.size };
}

window.__strict = {
  makePng, render, pickLayouts, exportDeck, importBytes, importError, registerFromPptx, sha256, toB64,
  blocks: (f, ov) => readBlocks(f, ov || {}),
  visibleBlocks,
  slots: (f) => readImageSlots(f),
  layoutCount: () => catalog.LAYOUTS.length,
};
window.__strictReady = true;
