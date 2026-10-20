// Proposal file → document model for review.
// Units are slides (PPTX), pages (PDF) or sections (DOCX/TXT). Geometry is normalized to 0..1 of the slide.
import JSZip from 'jszip';
import { addPptxPreviews } from './preview.js';

export const ACCEPT = '.pptx,.pdf,.docx,.txt,.md';
export function fileKind(name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (ext === 'pptx') return 'pptx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt' || ext === 'md') return 'txt';
  if (ext === 'ppt' || ext === 'doc' || ext === 'key' || ext === 'hwp') return 'legacy';
  return 'other';
}
export const KIND_LABEL = { pptx: 'PowerPoint', pdf: 'PDF', docx: 'Word', txt: '텍스트' };

const EMU_PT = 12700;
const words = (s) => (String(s || '').match(/\S+/g) || []).length;
const kids = (el, ln) => (el ? Array.from(el.children).filter((c) => c.localName === ln) : []);
const kid = (el, ln) => kids(el, ln)[0] || null;
const desc = (el, ln) => (el ? Array.from(el.getElementsByTagNameNS('*', ln)) : []);
const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

async function zipText(zip, path) { const f = zip.file(path); return f ? f.async('string') : null; }
function relsOf(doc, base) {
  const out = {};
  if (!doc) return out;
  for (const r of desc(doc, 'Relationship')) {
    const t = r.getAttribute('Target') || '';
    out[r.getAttribute('Id')] = { type: (r.getAttribute('Type') || '').split('/').pop(), target: t.startsWith('/') ? t.slice(1) : resolvePath(base, t), external: r.getAttribute('TargetMode') === 'External' };
  }
  return out;
}
function resolvePath(baseFile, rel) {
  const parts = baseFile.split('/'); parts.pop();
  for (const seg of rel.split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
  return parts.join('/');
}
function relsPath(p) { const i = p.lastIndexOf('/'); return p.slice(0, i) + '/_rels/' + p.slice(i + 1) + '.rels'; }

function coreProps(doc) {
  if (!doc) return {};
  const g = (ln) => { const e = desc(doc, ln)[0]; return e ? e.textContent.trim() : ''; };
  return { title: g('title'), subject: g('subject'), creator: g('creator'), lastModifiedBy: g('lastModifiedBy'), keywords: g('keywords'), created: g('created'), modified: g('modified'), description: g('description') };
}
function appProps(doc) {
  if (!doc) return {};
  const g = (ln) => { const e = desc(doc, ln)[0]; return e ? e.textContent.trim() : ''; };
  return { template: g('Template'), company: g('Company'), app: g('Application'), hiddenSlides: num(g('HiddenSlides')), notes: num(g('Notes')) };
}

// ---------------------------------------------------------------- PPTX
function xfrmOf(spPr) {
  const x = kid(spPr, 'xfrm');
  if (!x) return null;
  const off = kid(x, 'off'), ext = kid(x, 'ext');
  if (!off || !ext) return null;
  const r = { x: num(off.getAttribute('x')), y: num(off.getAttribute('y')), w: num(ext.getAttribute('cx')), h: num(ext.getAttribute('cy')), rot: num(x.getAttribute('rot')) / 60000 };
  const co = kid(x, 'chOff'), ce = kid(x, 'chExt');
  if (co && ce) { r.cx = num(co.getAttribute('x')); r.cy = num(co.getAttribute('y')); r.cw = num(ce.getAttribute('cx')) || r.w; r.ch = num(ce.getAttribute('cy')) || r.h; }
  return r;
}
function phOf(el) {
  const nv = Array.from(el.children).find((c) => /^nv/.test(c.localName));
  const nvPr = nv ? kid(nv, 'nvPr') : null;
  const ph = nvPr ? kid(nvPr, 'ph') : null;
  if (!ph) return null;
  return { type: ph.getAttribute('type') || (ph.getAttribute('idx') ? 'body' : 'body'), idx: ph.getAttribute('idx') || '' };
}
function nameOf(el) {
  const nv = Array.from(el.children).find((c) => /^nv/.test(c.localName));
  const c = nv ? kid(nv, 'cNvPr') : null;
  return c ? (c.getAttribute('name') || '') : '';
}
function lvl1Size(lst) {
  const l1 = lst ? kid(lst, 'lvl1pPr') : null; const d = l1 ? kid(l1, 'defRPr') : null;
  return d && d.getAttribute('sz') ? num(d.getAttribute('sz')) / 100 : null;
}
function phIndex(tree) {
  const out = [];
  if (!tree) return out;
  for (const sp of desc(tree, 'sp')) {
    const ph = phOf(sp); if (!ph) continue;
    const spPr = kid(sp, 'spPr'); const tx = kid(sp, 'txBody');
    out.push({ ...ph, xf: xfrmOf(spPr), sz: lvl1Size(tx ? kid(tx, 'lstStyle') : null) });
  }
  return out;
}
function findPh(list, ph) {
  if (!ph || !list) return null;
  const titleish = (t) => t === 'title' || t === 'ctrTitle';
  return (ph.idx && list.find((x) => x.idx === ph.idx)) || list.find((x) => x.type === ph.type) || (titleish(ph.type) && list.find((x) => titleish(x.type))) || null;
}
function themeFonts(doc) {
  if (!doc) return {};
  const maj = desc(doc, 'majorFont')[0], min = desc(doc, 'minorFont')[0];
  const f = (el, ln) => { const e = el ? kid(el, ln) : null; return e ? e.getAttribute('typeface') || '' : ''; };
  return { '+mj-lt': f(maj, 'latin'), '+mj-ea': f(maj, 'ea'), '+mn-lt': f(min, 'latin'), '+mn-ea': f(min, 'ea') };
}

async function parsePptx(buf, onStep) {
  const zip = await JSZip.loadAsync(buf);
  const pres = xml(await zipText(zip, 'ppt/presentation.xml') || '<x/>');
  const presRels = relsOf(xml(await zipText(zip, 'ppt/_rels/presentation.xml.rels') || '<x/>'), 'ppt/presentation.xml');
  const sz = desc(pres, 'sldSz')[0];
  const SW = sz ? num(sz.getAttribute('cx'), 12192000) : 12192000, SH = sz ? num(sz.getAttribute('cy'), 6858000) : 6858000;
  const ids = desc(pres, 'sldId').map((e) => e.getAttribute('r:id') || e.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
  const slidePaths = ids.map((id) => presRels[id] && presRels[id].target).filter(Boolean);
  const theme = themeFonts(xml(await zipText(zip, 'ppt/theme/theme1.xml') || '<x/>'));
  const cache = {};
  async function tpl(path) {
    if (cache[path]) return cache[path];
    const d = xml(await zipText(zip, path) || '<x/>');
    const rels = relsOf(xml(await zipText(zip, relsPath(path)) || '<x/>'), path);
    const tree = desc(d, 'spTree')[0];
    const ts = desc(d, 'txStyles')[0];
    const v = { rels, phs: phIndex(tree), title: ts ? lvl1Size(kid(ts, 'titleStyle')) : null, body: ts ? lvl1Size(kid(ts, 'bodyStyle')) : null, other: ts ? lvl1Size(kid(ts, 'otherStyle')) : null };
    cache[path] = v; return v;
  }
  const units = [];
  const fontsAll = new Map();
  const colorsAll = new Map();
  let commentCount = 0;
  for (const f of Object.keys(zip.files)) {
    if (/^ppt\/comments\/.*\.xml$/.test(f)) { const d = xml(await zipText(zip, f) || '<x/>'); commentCount += desc(d, 'cm').length; }
  }
  for (let si = 0; si < slidePaths.length; si++) {
    const path = slidePaths[si];
    onStep && onStep(si + 1, slidePaths.length);
    const d = xml(await zipText(zip, path) || '<x/>');
    const rels = relsOf(xml(await zipText(zip, relsPath(path)) || '<x/>'), path);
    const layoutRel = Object.values(rels).find((r) => r.type === 'slideLayout');
    const layout = layoutRel ? await tpl(layoutRel.target) : null;
    const masterRel = layout ? Object.values(layout.rels).find((r) => r.type === 'slideMaster') : null;
    const master = masterRel ? await tpl(masterRel.target) : null;
    const root = d.documentElement;
    const hidden = root && root.getAttribute('show') === '0';
    const boxes = [];
    const fonts = new Set();
    const colors = new Set();
    let pageNum = false;
    const walk = (parent, T) => {
      for (const el of Array.from(parent.children)) {
        const ln = el.localName;
        if (ln === 'AlternateContent') { const alt = kid(el, 'Fallback') || kid(el, 'Choice'); if (alt) walk(alt, T); continue; }
        if (ln === 'grpSp') {
          const gx = xfrmOf(kid(el, 'grpSpPr'));
          let NT = T;
          if (gx && gx.cw && gx.ch) {
            const sx = gx.w / gx.cw, sy = gx.h / gx.ch;
            NT = { a: T.a * sx, b: T.a * (gx.x - gx.cx * sx) + T.b, c: T.c * sy, d: T.c * (gx.y - gx.cy * sy) + T.d };
          }
          walk(el, NT);
          continue;
        }
        if (!['sp', 'pic', 'graphicFrame', 'cxnSp'].includes(ln)) continue;
        if (ln === 'cxnSp') continue;
        const ph = phOf(el);
        let xf = ln === 'graphicFrame' ? (() => { const x = kid(el, 'xfrm'); if (!x) return null; const o = kid(x, 'off'), e = kid(x, 'ext'); return o && e ? { x: num(o.getAttribute('x')), y: num(o.getAttribute('y')), w: num(e.getAttribute('cx')), h: num(e.getAttribute('cy')) } : null; })() : xfrmOf(kid(el, 'spPr'));
        const lph = ph && layout ? findPh(layout.phs, ph) : null;
        const mph = ph && master ? findPh(master.phs, ph) : null;
        if (!xf && ph) xf = (lph && lph.xf) || (mph && mph.xf) || null;
        let kind = ln === 'pic' ? 'pic' : 'shape';
        if (ln === 'graphicFrame') {
          const gd = desc(el, 'graphicData')[0]; const uri = gd ? gd.getAttribute('uri') || '' : '';
          kind = /table/.test(uri) ? 'table' : /chart/.test(uri) ? 'chart' : /diagram/.test(uri) ? 'diagram' : 'object';
        }
        // text
        const tx = kid(el, 'txBody');
        const paras = [];
        let minSz = Infinity, maxSz = 0, autofit = null, spAuto = false, chars = 0;
        const defSz = (() => {
          const own = tx ? lvl1Size(kid(tx, 'lstStyle')) : null; if (own) return own;
          if (lph && lph.sz) return lph.sz; if (mph && mph.sz) return mph.sz;
          if (ph && (ph.type === 'title' || ph.type === 'ctrTitle')) return (master && master.title) || 44;
          if (ph && ['body', 'subTitle', 'obj'].includes(ph.type)) return (master && master.body) || 28;
          if (ph) return (master && master.other) || 12;
          return (master && master.other) || 18;
        })();
        let fontScale = 1;
        const sizesIn = [];
        if (tx) {
          const bp = kid(tx, 'bodyPr');
          const na = bp ? kid(bp, 'normAutofit') : null;
          if (na) { fontScale = na.getAttribute('fontScale') ? num(na.getAttribute('fontScale')) / 100000 : 1; autofit = fontScale; }
          spAuto = !!(bp && kid(bp, 'spAutoFit'));
          for (const p of kids(tx, 'p')) {
            let t = '';
            for (const r of Array.from(p.children)) {
              if (r.localName === 'r' || r.localName === 'fld') {
                const tEl = kid(r, 't'); const s = tEl ? tEl.textContent : '';
                if (r.localName === 'fld' && /slidenum/i.test(r.getAttribute('type') || '')) pageNum = true;
                t += s;
                const rPr = kid(r, 'rPr');
                const szv = rPr && rPr.getAttribute('sz') ? num(rPr.getAttribute('sz')) / 100 : defSz;
                if (s.trim()) { const e = szv * fontScale; minSz = Math.min(minSz, e); maxSz = Math.max(maxSz, e); sizesIn.push([e, s.length]); }
                if (rPr) {
                  for (const fl of ['latin', 'ea']) { const fe = kid(rPr, fl); if (fe && fe.getAttribute('typeface')) { let tf = fe.getAttribute('typeface'); tf = theme[tf] || tf; if (tf && !tf.startsWith('+')) fonts.add(tf); } }
                  const sf = kid(rPr, 'solidFill'); const c = sf ? kid(sf, 'srgbClr') : null; if (c) colors.add(c.getAttribute('val').toUpperCase());
                }
              } else if (r.localName === 'br') t += '\n';
            }
            if (t.trim()) { paras.push(t.trim()); chars += t.trim().length; }
          }
        }
        const sf = kid(kid(el, 'spPr'), 'solidFill'); const sc = sf ? kid(sf, 'srgbClr') : null; if (sc) colors.add(sc.getAttribute('val').toUpperCase());
        if (!xf) { if (!paras.length) continue; xf = { x: 0, y: 0, w: SW, h: SH, guessed: true }; }
        const X = T.a * xf.x + T.b, Y = T.c * xf.y + T.d, W = T.a * xf.w, H = T.c * xf.h;
        const text = paras.join('\n');
        if (kind === 'shape' && text) kind = 'text';
        if (kind === 'shape' && !text) {
          // decorative shape: keep only if large (cards, bands) for overlap context
          if ((W * H) / (SW * SH) < 0.01) continue;
        }
        if (ph && /sldNum/.test(ph.type)) pageNum = true;
        boxes.push({
          kind, ph: ph ? ph.type : null, name: nameOf(el), x: X / SW, y: Y / SH, w: W / SW, h: H / SH, wPt: W / EMU_PT, hPt: H / EMU_PT,
          text, chars, paras: paras.map((p) => p.length), min: Number.isFinite(minSz) ? +minSz.toFixed(1) : null, max: maxSz ? +maxSz.toFixed(1) : null,
          sizes: sizesIn, autofit, spAuto, rot: xf.rot || 0, guessed: !!xf.guessed,
        });
      }
    };
    const tree = desc(d, 'spTree')[0];
    if (tree) walk(tree, { a: 1, b: 0, c: 1, d: 0 });
    // notes
    let notes = '';
    const nr = Object.values(rels).find((r) => r.type === 'notesSlide');
    if (nr) {
      const nd = xml(await zipText(zip, nr.target) || '<x/>');
      for (const sp of desc(nd, 'sp')) { const ph = phOf(sp); if (ph && ph.type === 'body') notes += desc(sp, 't').map((t) => t.textContent).join(' ') + '\n'; }
      notes = notes.trim();
    }
    for (const f of fonts) fontsAll.set(f, (fontsAll.get(f) || 0) + 1);
    for (const c of colors) colorsAll.set(c, (colorsAll.get(c) || 0) + 1);
    // reading order: top→bottom, left→right
    const tb = boxes.filter((b) => b.text).sort((a, b) => (Math.abs(a.y - b.y) < 0.03 ? a.x - b.x : a.y - b.y));
    const titleBox = boxes.find((b) => b.ph === 'title' || b.ph === 'ctrTitle') || tb.filter((b) => b.y < 0.3 && !isFooter(b)).sort((a, b) => (b.max || 0) - (a.max || 0))[0];
    const text = tb.filter((b) => !isFooter(b)).map((b) => b.text).join('\n');
    const bodyMin = tb.filter((b) => !isFooter(b) && b.min).reduce((m, b) => Math.min(m, b.min), Infinity);
    units.push({
      n: si + 1, title: titleBox ? titleBox.text.replace(/\s+/g, ' ').slice(0, 120) : '', text, words: words(text), chars: text.replace(/\s/g, '').length,
      boxes, notes, hidden, pageNum: pageNum || tb.some((b) => isFooter(b) && /^\s*\d{1,3}\s*$/.test(b.text)),
      footer: tb.filter(isFooter).map((b) => b.text).join(' · ').slice(0, 120),
      minFont: Number.isFinite(bodyMin) ? bodyMin : null, fonts: Array.from(fonts), colors: Array.from(colors),
      nPic: boxes.filter((b) => b.kind === 'pic').length, nTable: boxes.filter((b) => b.kind === 'table').length, nChart: boxes.filter((b) => b.kind === 'chart' || b.kind === 'diagram').length,
    });
  }
  const core = coreProps(xml(await zipText(zip, 'docProps/core.xml') || '<x/>'));
  const app = appProps(xml(await zipText(zip, 'docProps/app.xml') || '<x/>'));
  return {
    kind: 'pptx', unitLabel: '장', slides: true, aspect: SW / SH, slideWpt: SW / EMU_PT, units,
    meta: { ...core, ...app, comments: commentCount, fonts: Object.fromEntries(fontsAll), colors: Object.fromEntries(colorsAll) },
  };
}
export function isFooter(b) {
  if (!b || !b.text) return false;
  if (b.ph && /sldNum|ftr|dt/.test(b.ph)) return true;
  return b.y > 0.88 && b.h < 0.1 && b.chars < 90;
}

// ---------------------------------------------------------------- PDF (pdf.js loaded on demand from lib/)
let pdfjsP = null;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
}
async function loadPdfjs() {
  if (pdfjsP) return pdfjsP;
  pdfjsP = (async () => {
    const tries = [['lib/pdf.worker.min.js', 'lib/pdf.min.js'], ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js']];
    let lastErr;
    for (const [w, m] of tries) {
      try {
        if (!window.pdfjsWorker) await loadScript(w);
        if (!window.pdfjsLib) await loadScript(m);
        if (window.pdfjsLib) break;
      } catch (e) { lastErr = e; }
    }
    if (!window.pdfjsLib) throw lastErr || new Error('PDF 읽기 도구를 불러오지 못했어요');
    try { await loadScript('lib/pdf-cmaps-ko.js'); } catch (e) {}
    return window.pdfjsLib;
  })();
  pdfjsP.catch(() => { pdfjsP = null; });
  return pdfjsP;
}
class CMapFactory {
  constructor() {}
  async fetch({ name }) {
    const m = window.__WM_CMAPS && window.__WM_CMAPS[name];
    if (!m) throw new Error('cmap ' + name);
    const bin = Uint8Array.from(atob(m), (c) => c.charCodeAt(0));
    return { cMapData: bin, compressionType: 1 };
  }
}

/** Render a PDF page to a JPEG blob of the given width. */
async function renderPage(page, width, quality = 0.82) {
  const v1 = page.getViewport({ scale: 1 });
  const scale = width / v1.width;
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  return { blob, canvas: c };
}
function canvasThumb(canvas, w = 360) {
  const h = Math.round(canvas.height * (w / canvas.width));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(canvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.72);
}

async function parsePdf(buf, onStep, { maxPages = Infinity, renders = true } = {}) {
  const lib = await loadPdfjs();
  const task = lib.getDocument({ data: new Uint8Array(buf), CMapReaderFactory: CMapFactory, cMapPacked: true, useWorkerFetch: false, isEvalSupported: false, disableFontFace: false });
  let pdf;try{pdf=await task.promise;}catch(error){await task.destroy().catch(()=>{});throw error;}
  try {
  const info = (await pdf.getMetadata().catch(() => ({}))).info || {};
  const n = Math.min(pdf.numPages, maxPages);
  const units = [];
  const fontsAll = new Map();
  let aspect = 16 / 9, pageW = 960;
  const images = []; // {n, blob}
  for (let i = 1; i <= n; i++) {
    onStep && onStep(i, n);
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    if (i === 1) { aspect = vp.width / vp.height; pageW = vp.width; }
    const norm = 960 / vp.width; // font sizes as if the page were a 13.33in-wide slide
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => it.str && it.str.trim());
    let nImg = 0;
    const fonts = new Set();
    try {
      const ops = renders ? await page.getOperatorList() : {fnArray:[]};
      for (const fn of ops.fnArray) if (fn === lib.OPS.paintImageXObject || fn === lib.OPS.paintInlineImageXObject || fn === lib.OPS.paintImageMaskXObject) nImg++;
      for (const it of items) {
        try { const fo = page.commonObjs.get(it.fontName); if (fo && fo.name) fonts.add(String(fo.name).replace(/^[A-Z]{6}\+/, '').replace(/[-,](Bold|Regular|Medium|Light|Black|Thin|SemiBold|ExtraBold|Italic|BoldItalic|Heavy|DemiLight)$/i, '')); } catch (e) {}
      }
    } catch (e) {}
    // lines
    const lines = [];
    for (const it of items) {
      const t = it.transform; const size = Math.hypot(t[2], t[3]) * norm; const x = t[4] / vp.width; const y = 1 - t[5] / vp.height;
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - y) < 0.012 && x >= last.x1 - 0.01) { last.s += (x - last.x1 > 0.006 ? ' ' : '') + it.str; last.x1 = x + it.width / vp.width; last.size = Math.max(last.size, size); last.min = Math.min(last.min, size); }
      else lines.push({ s: it.str, x, y, x1: x + it.width / vp.width, size, min: size });
    }
    const body = lines.filter((l) => !(l.y > 0.92 && l.s.length < 60));
    const sizes = lines.map((l) => l.size).sort((a, b) => a - b); const med = sizes[Math.floor(sizes.length / 2)] || 0;
    let top = lines.filter((l) => l.y < 0.35 && l.s.trim().length > 1);
    if (!top.length) top = lines.filter((l) => l.y < 0.65 && l.s.trim().length > 1 && l.size >= med * 1.35);
    const tl = top.sort((a, b) => b.size - a.size)[0];
    const text = body.map((l) => l.s.trim()).filter(Boolean).join('\n');
    const bodyMin = body.filter((l) => l.s.trim().length > 3).reduce((m, l) => Math.min(m, l.min), Infinity);
    const foot = lines.filter((l) => l.y > 0.92 && l.s.length < 60);
    for (const f of fonts) fontsAll.set(f, (fontsAll.get(f) || 0) + 1);
    const u = {
      n: i, title: tl ? tl.s.trim().slice(0, 120) : '', text, words: words(text), chars: text.replace(/\s/g, '').length,
      boxes: [], notes: '', hidden: false, pageNum: foot.some((l) => new RegExp('(^|\\D)' + i + '(\\D|$)').test(l.s)),
      footer: foot.map((l) => l.s).join(' · ').slice(0, 120), minFont: Number.isFinite(bodyMin) ? +bodyMin.toFixed(1) : null,
      fonts: Array.from(fonts), colors: [], nPic: nImg, nTable: 0, nChart: 0, lineSizes: body.map((l) => [+l.size.toFixed(1), l.s.length]),
    };
    if (renders) {
      try {
        const { blob, canvas } = await renderPage(page, 1100);
        u.thumb = canvasThumb(canvas, 360);
        images.push({ n: i, blob });
      } catch (e) {}
    }
    units.push(u);
    page.cleanup();
  }
  return {
    kind: 'pdf', unitLabel: aspect > 1.1 ? '장' : '쪽', slides: aspect > 1.1, aspect, slideWpt: pageW, units, images, truncatedPages: pdf.numPages > n ? pdf.numPages : 0,
    meta: { title: info.Title || '', creator: info.Author || '', app: info.Creator || info.Producer || '', created: info.CreationDate || '', modified: info.ModDate || '', fonts: Object.fromEntries(fontsAll), pages: pdf.numPages },
  };
  } finally {await pdf.destroy();}
}

// ---------------------------------------------------------------- DOCX
async function parseDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const d = xml(await zipText(zip, 'word/document.xml') || '<x/>');
  const bodyEl = desc(d, 'body')[0];
  const units = [];
  let cur = null;
  const push = () => { if (cur && (cur.text.trim() || cur.title)) { cur.text = cur.text.trim(); cur.words = words(cur.text); cur.chars = cur.text.replace(/\s/g, '').length; units.push(cur); } };
  const start = (title) => { push(); cur = { n: units.length + 1, title, text: '', boxes: [], notes: '', hidden: false, pageNum: false, footer: '', minFont: null, fonts: [], colors: [], nPic: 0, nTable: 0, nChart: 0 }; };
  start('');
  const fonts = new Set();
  let minSz = Infinity;
  for (const el of bodyEl ? Array.from(bodyEl.children) : []) {
    if (el.localName === 'tbl') { cur.nTable++; cur.text += desc(el, 'p').map((p) => desc(p, 't').map((t) => t.textContent).join('')).filter(Boolean).join(' | ') + '\n'; continue; }
    if (el.localName !== 'p') continue;
    const pPr = kid(el, 'pPr'); const st = pPr ? kid(pPr, 'pStyle') : null; const sv = st ? st.getAttribute('w:val') || st.getAttributeNS('*', 'val') || '' : '';
    const ol = pPr ? kid(pPr, 'outlineLvl') : null;
    const t = desc(el, 't').map((x) => x.textContent).join('');
    cur.nPic += desc(el, 'drawing').length;
    for (const r of desc(el, 'rPr')) { const s = kid(r, 'sz'); if (s) minSz = Math.min(minSz, num(s.getAttribute('w:val')) / 2); const rf = kid(r, 'rFonts'); if (rf) { const v = rf.getAttribute('w:eastAsia') || rf.getAttribute('w:ascii'); if (v) fonts.add(v); } }
    const isH = /^(Heading|heading|Title|제목)\s?1?$|^Heading1$|^1$/.test(sv) || (ol && ol.getAttribute('w:val') === '0');
    if (isH && t.trim()) { start(t.trim().slice(0, 120)); continue; }
    if (t.trim()) cur.text += t + '\n';
  }
  push();
  // chunk very long single sections
  const out = [];
  for (const u of units) {
    if (u.words <= 450) { out.push(u); continue; }
    const paras = u.text.split('\n'); let buf = [], wc = 0, k = 0;
    for (const p of paras) { buf.push(p); wc += words(p); if (wc > 380) { out.push({ ...u, title: u.title + (k ? ' (계속)' : ''), text: buf.join('\n'), words: wc, chars: buf.join('').replace(/\s/g, '').length }); buf = []; wc = 0; k++; } }
    if (buf.length) out.push({ ...u, title: u.title + (k ? ' (계속)' : ''), text: buf.join('\n'), words: wc, chars: buf.join('').replace(/\s/g, '').length });
  }
  out.forEach((u, i) => { u.n = i + 1; u.minFont = Number.isFinite(minSz) ? minSz : null; u.fonts = Array.from(fonts); });
  const core = coreProps(xml(await zipText(zip, 'docProps/core.xml') || '<x/>'));
  const app = appProps(xml(await zipText(zip, 'docProps/app.xml') || '<x/>'));
  let comments = 0; const cm = await zipText(zip, 'word/comments.xml'); if (cm) comments = desc(xml(cm), 'comment').length;
  return { kind: 'docx', unitLabel: '섹션', slides: false, aspect: 0, units: out, meta: { ...core, ...app, comments, fonts: Object.fromEntries(Array.from(fonts).map((f) => [f, 1])) } };
}

// ---------------------------------------------------------------- TXT / MD
function parseText(s) {
  const lines = String(s).split(/\r?\n/);
  const units = []; let cur = null;
  const start = (title) => { if (cur && cur.text.trim()) units.push(cur); cur = { n: 0, title, text: '', boxes: [], notes: '', hidden: false, pageNum: false, footer: '', minFont: null, fonts: [], colors: [], nPic: 0, nTable: 0, nChart: 0 }; };
  start('');
  for (const l of lines) { const m = l.match(/^#{1,2}\s+(.*)/); if (m) start(m[1].trim()); else cur.text += l + '\n'; }
  if (cur && cur.text.trim()) units.push(cur);
  let out = units;
  if (out.length <= 1 && words(s) > 450) {
    out = []; const paras = String(s).split(/\n\s*\n/); let buf = '';
    for (const p of paras) { buf += p + '\n\n'; if (words(buf) > 300) { out.push({ ...units[0], title: '', text: buf }); buf = ''; } }
    if (buf.trim()) out.push({ ...units[0], title: '', text: buf });
  }
  out.forEach((u, i) => { u.n = i + 1; u.text = u.text.trim(); u.words = words(u.text); u.chars = u.text.replace(/\s/g, '').length; if (!u.title) u.title = (u.text.split('\n')[0] || '').slice(0, 60); });
  return { kind: 'txt', unitLabel: '섹션', slides: false, aspect: 0, units: out, meta: {} };
}

function grams(t) { const s = String(t || '').replace(/\s+/g, ''); const g = new Set(); for (let i = 0; i < s.length - 1 && g.size < 400; i++) g.add(s.slice(i, i + 2)); return g; }
function sim(a, b) { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.min(a.size, b.size); }
function alignByText(slides, pages) {
  const sg = slides.map((u) => grams(u.title + u.text)); const out = []; let ptr = 0;
  for (const p of pages) {
    const pg = grams(p.title + p.text); let best = -1, bj = -1;
    for (let j = ptr; j < Math.min(slides.length, ptr + 4); j++) { const v = sim(pg, sg[j]); if (v > best) { best = v; bj = j; } }
    if (bj >= 0 && best >= 0.3) { out.push(slides[bj]); ptr = bj + 1; } else out.push(null);
  }
  return out;
}

/** Parse one or more files. A PPTX + PDF pair: PPTX structure, PDF page images. */
export async function parseFiles(files, onStep, { textOnly = false } = {}) {
  const list = Array.from(files);
  const by = (k) => list.find((f) => fileKind(f.name) === k);
  const primary = by('pptx') || by('pdf') || by('docx') || by('txt');
  if (!primary) {
    const lg = list.find((f) => fileKind(f.name) === 'legacy');
    throw new Error(lg ? `${lg.name} 형식은 읽을 수 없어요. PPTX · PDF · DOCX로 저장해서 올려 주세요.` : 'PPTX · PDF · DOCX · TXT 파일을 올려 주세요.');
  }
  const kind = fileKind(primary.name);
  const buf = kind === 'txt' ? null : await primary.arrayBuffer();
  let doc;
  if (kind === 'pptx') doc = await parsePptx(buf, (i, n) => onStep && onStep(`${i}/${n}장 구조를 읽는 중`));
  else if (kind === 'pdf') doc = await parsePdf(buf, (i, n) => onStep && onStep(`${i}/${n}쪽 ${textOnly?'본문을 읽는 중':'화면을 그리는 중'}`), {renders:!textOnly,maxPages:textOnly?1000:Infinity});
  else if (kind === 'docx') doc = await parseDocx(buf);
  else doc = parseText(await primary.text());
  doc.files = [{ name: primary.name, size: primary.size, kind }];
  if (kind === 'pptx' && !textOnly) {
    // IndexedDB keeps the full layout, not the measurement wireframe used for scoring.
    try {
      await addPptxPreviews(doc, buf, onStep);
    } catch (error) { doc.previewError = error.message || '원본 화면을 준비하지 못했습니다.'; }
  }
  if(textOnly && doc.truncatedPages)throw new Error('원문이 1,000쪽을 넘습니다. 문서를 나눠 첨부하세요. 일부 본문으로 처리하지 않습니다.');
  const pdfSide = kind === 'pptx' && !textOnly ? by('pdf') : null;
  if (pdfSide) {
    try {
      const pd = await parsePdf(await pdfSide.arrayBuffer(), (i, n) => onStep && onStep(`함께 올린 PDF ${i}/${n}쪽 화면을 그리는 중`));
      // map PDF pages to slides: same count, visible slides only (hidden slides are not exported), or by text
      const vis = doc.units.filter((u) => !u.hidden);
      const map = pd.units.length === doc.units.length ? doc.units : pd.units.length === vis.length ? vis : alignByText(doc.units, pd.units);
      pd.units.forEach((pu, i) => { if (map[i]) map[i].thumb = pu.thumb; });
      doc.images = pd.images.map((im) => { const u = map[im.n - 1]; return u ? { n: u.n, blob: im.blob } : null; }).filter(Boolean);
      doc.files.push({ name: pdfSide.name, size: pdfSide.size, kind: 'pdf', role: 'visual' });
      doc.pairedPdf = true;
    } catch (e) { doc.pairWarn = '함께 올린 PDF는 읽지 못해 구조 점검만 했어요'; }
  }
  if (!doc.units.length || !doc.units.some((u) => u.words > 0)) {
    throw new Error(kind === 'pdf' ? '이 PDF에서 글자를 찾지 못했어요. 스캔본이라면 원본 PPTX를 올려 주세요.' : '파일에서 읽을 글자를 찾지 못했어요.');
  }
  return doc;
}
