// 레이아웃 DOM → 편집 가능한 PPTX. 화면에 그린 1280×720 레이아웃을 그대로 측정해서
// 상자 · 테두리 · 선은 도형으로, 글자는 텍스트 상자로, <img> · <svg> 는 그림으로 옮긴다(13.333in × 7.5in, LAYOUT_WIDE).
// 원본 Winmate 앱 src/pptx.js 와 같은 변환 규칙.
import { L } from '../../lib/catalog.js';
import { layoutHtml } from '../../lib/layoutHtml.js';
import { PARTS } from '../../lib/parts.js';
import { applyOverrides } from '../../components/slide/overrides.js';

const PX = 1 / 96; // 1280px = 13.333in (LAYOUT_WIDE)
function parseColor(c) {
  if (!c) return null;
  const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
  const a = p.length > 3 ? p[3] : 1;
  if (a === 0) return null;
  const hex = p.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { hex, a };
}
const tr = (a) => Math.round((1 - a) * 100);

async function toDataUrl(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return src;
  try {
    const r = await fetch(src); const b = await r.blob();
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch (e) { return null; }
}
async function svgToPng(svg, w, h) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w); clone.setAttribute('height', h);
  const cs = getComputedStyle(svg);
  if (!clone.getAttribute('color')) clone.setAttribute('color', cs.color);
  const xml = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  return await new Promise((res) => {
    const img = new Image();
    img.onload = () => { try { const c = document.createElement('canvas'); const k = 2; c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k)); const g = c.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0, w, h); res(c.toDataURL('image/png')); } catch (e) { res(null); } };
    img.onerror = () => res(null);
    img.src = url;
  });
}
function fontFace(cs, mapFont) {
  const fam = cs.fontFamily || '';
  if (/manrope/i.test(fam)) return 'Manrope';
  return mapFont;
}
const SIMPLE = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'SUP', 'SUB', 'SMALL']);
function runsOf(el, base, mapFont) {
  const runs = [];
  const push = (text, cs) => {
    if (!text) return;
    const col = parseColor(cs.color);
    runs.push({ text, options: { color: col ? col.hex : '121417', bold: (parseInt(cs.fontWeight) || 400) >= 600, fontSize: Math.max(5, parseFloat(cs.fontSize) * 0.75), fontFace: fontFace(cs, mapFont) } });
  };
  const walk = (n, cs) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) push(c.data.replace(/\s+/g, ' '), cs);
      else if (c.nodeType === 1 && c.tagName === 'BR') runs.push({ text: '', options: { breakLine: true } });
      else if (c.nodeType === 1 && SIMPLE.has(c.tagName)) walk(c, getComputedStyle(c));
    }
  };
  walk(el, base);
  if (runs.length) { runs[0].text = runs[0].text.replace(/^\s+/, ''); const l = runs[runs.length - 1]; l.text = l.text.replace(/\s+$/, ''); }
  return runs.filter((r) => r.text !== '' || (r.options && r.options.breakLine));
}

async function addSlide(pptx, root, opts) {
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  const R = root.getBoundingClientRect();
  const box = (r) => ({ x: (r.left - R.left) * PX, y: (r.top - R.top) * PX, w: Math.max(0.01, r.width * PX), h: Math.max(0.01, r.height * PX) });
  const els = [root, ...root.querySelectorAll('*')];
  const textDone = new Set();
  for (const el of els) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.right < R.left || r.left > R.right || r.bottom < R.top || r.top > R.bottom) continue;
    const b = box(r);
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg') {
      if (r.width < 1 || r.height < 1) continue;
      const png = await svgToPng(el, r.width, r.height);
      if (png) s.addImage({ data: png, ...b });
      continue;
    }
    if (tag === 'img') {
      const d = await toDataUrl(el.currentSrc || el.getAttribute('src'));
      if (d) {
        const fit = cs.objectFit === 'contain' ? 'contain' : 'cover';
        const nw = el.naturalWidth || 1, nh = el.naturalHeight || 1;
        if (fit === 'contain') {
          const k = Math.min(r.width / nw, r.height / nh); const w = nw * k, h = nh * k;
          s.addImage({ data: d, x: b.x + (r.width - w) / 2 * PX, y: b.y + (r.height - h) / 2 * PX, w: w * PX, h: h * PX });
        } else s.addImage({ data: d, ...b, sizing: { type: 'cover', w: b.w, h: b.h } });
      }
      continue;
    }
    // box: fill + borders
    const bg = parseColor(cs.backgroundColor);
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map((k) => ({ w: parseFloat(cs['border' + k + 'Width']) || 0, st: cs['border' + k + 'Style'], c: parseColor(cs['border' + k + 'Color']) }));
    const uniform = bw.every((x) => x.w === bw[0].w && x.st === bw[0].st && (x.c && bw[0].c ? x.c.hex === bw[0].c.hex : x.c === bw[0].c)) && bw[0].w > 0 && bw[0].st !== 'none' && bw[0].c;
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const rotated = cs.transform && cs.transform !== 'none';
    if (rotated && r.height > 0 && (el.offsetHeight <= 3)) {
      // rotated thin line (map connectors)
      const m = new DOMMatrix(cs.transform); const down = m.b >= 0;
      const lc = bw[0].c || bg || { hex: '1428A0', a: 1 };
      s.addShape(pptx.ShapeType.line, { x: b.x, y: b.y, w: b.w, h: b.h, flipV: !down, line: { color: lc.hex, width: Math.max(0.75, (bw[0].w || el.offsetHeight || 1) * 0.75), dashType: bw[0].st === 'dashed' ? 'dash' : 'solid' } });
    } else if (bg || uniform) {
      const isCircle = rad >= Math.min(r.width, r.height) / 2 - 0.5 && Math.abs(r.width - r.height) < 1.5;
      const shape = isCircle ? pptx.ShapeType.ellipse : rad > 0.5 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
      const o = { ...b };
      if (bg) o.fill = { color: bg.hex, transparency: tr(bg.a) }; else o.fill = { type: 'none' };
      if (uniform) o.line = { color: bw[0].c.hex, width: Math.max(0.5, bw[0].w * 0.75), dashType: bw[0].st === 'dashed' ? 'dash' : bw[0].st === 'dotted' ? 'sysDot' : 'solid', transparency: tr(bw[0].c.a) };
      else o.line = { type: 'none' };
      if (shape === pptx.ShapeType.roundRect) o.rectRadius = Math.min(rad, Math.min(r.width, r.height) / 2) * PX;
      if (r.width >= 0.5 && r.height >= 0.5) s.addShape(shape, o);
    }
    if (!uniform) {
      // individual side borders as lines (separators, dashed guides)
      const sides = [['Top', b.x, b.y, b.w, 0], ['Bottom', b.x, b.y + b.h, b.w, 0], ['Left', b.x, b.y, 0, b.h], ['Right', b.x + b.w, b.y, 0, b.h]];
      for (const [k, x, y, w, h] of sides) {
        const bd = bw[['Top', 'Right', 'Bottom', 'Left'].indexOf(k)];
        if (bd.w > 0 && bd.st !== 'none' && bd.c) s.addShape(pptx.ShapeType.line, { x, y, w: Math.max(w, 0.0001), h: Math.max(h, 0.0001), line: { color: bd.c.hex, width: Math.max(0.5, bd.w * 0.75), dashType: bd.st === 'dashed' ? 'dash' : 'solid', transparency: tr(bd.c.a) } });
      }
    }
    // loose text nodes in mixed-content elements (badge + label etc.)
    if (!el.hasAttribute('data-tb') && !el.closest('[data-tb]')) {
      for (const c of el.childNodes) {
        if (c.nodeType !== 3 || !c.data.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(c);
        const rs = Array.from(rg.getClientRects()).filter((q) => q.width > 0 && q.height > 0);
        if (!rs.length) continue;
        const l0 = Math.min(...rs.map((q) => q.left)), t0 = Math.min(...rs.map((q) => q.top)), r0 = Math.max(...rs.map((q) => q.right)), b0 = Math.max(...rs.map((q) => q.bottom));
        const col = parseColor(cs.color);
        const ml = new Set(rs.map((q) => Math.round(q.top))).size > 1;
        s.addText([{ text: c.data.replace(/\s+/g, ' ').trim(), options: { color: col ? col.hex : '121417', bold: (parseInt(cs.fontWeight) || 400) >= 600, fontSize: Math.max(5, parseFloat(cs.fontSize) * 0.75), fontFace: fontFace(cs, opts.font) } }],
          { x: (l0 - R.left) * PX, y: (t0 - R.top) * PX, w: Math.max(0.05, (r0 - l0) * 1.06 * PX), h: Math.max(0.05, (b0 - t0) * PX), margin: 0, valign: 'top', wrap: ml, fit: 'none', isTextBox: true });
      }
    }
    // text
    if (!el.hasAttribute('data-tb') || textDone.has(el)) continue;
    textDone.add(el);
    const runs = runsOf(el, cs, opts.font);
    if (!runs.length) continue;
    const range = document.createRange(); range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((q) => q.width > 0 && q.height > 0);
    if (!rects.length) continue;
    const L0 = Math.min(...rects.map((q) => q.left)), T0 = Math.min(...rects.map((q) => q.top)), R0 = Math.max(...rects.map((q) => q.right)), B0 = Math.max(...rects.map((q) => q.bottom));
    const lines = new Set(rects.map((q) => Math.round(q.top))).size;
    const multi = lines > 1;
    const align = /center/.test(cs.textAlign) ? 'center' : /right|end/.test(cs.textAlign) ? 'right' : 'left';
    const fs = parseFloat(cs.fontSize);
    const lh = parseFloat(cs.lineHeight);
    let x, w;
    if (multi) { x = r.left + parseFloat(cs.paddingLeft); w = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }
    else { const pad = Math.max(6, (R0 - L0) * 0.06); w = R0 - L0 + pad; x = align === 'center' ? L0 - pad / 2 : align === 'right' ? L0 - pad : L0; }
    const vert = /vertical/.test(cs.writingMode);
    s.addText(runs, {
      x: (x - R.left) * PX, y: (T0 - R.top) * PX, w: Math.max(0.05, w * PX), h: Math.max(0.05, (B0 - T0) * PX),
      margin: 0, valign: 'top', align: multi ? align : align, wrap: multi, fit: 'none', isTextBox: true,
      lineSpacing: lh && !isNaN(lh) && multi ? lh * 0.75 : undefined,
      charSpacing: parseFloat(cs.letterSpacing) ? parseFloat(cs.letterSpacing) * 0.75 : undefined,
      vert: vert ? 'eaVert' : undefined,
    });
  }
  return s;
}

/**
 * 슬라이드 목록 → .pptx Blob
 * @param {{f: string, ov?: object, part?: string}[]} slides  f 레이아웃 id · ov 덮어쓸 값 · part 발표자 노트에 붙일 파트 이름
 * @param {{title?: string, font?: string, onProgress?: (n: number, total: number) => void}} opts
 */
export async function exportPptx(slides, { title = 'Winmate 제안서', font = 'Noto Sans KR', onProgress } = {}) {
  const { default: PptxGenJS } = await import('pptxgenjs'); // 처음 내보낼 때만 받는다(약 400KB)
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title; pptx.company = 'Samsung Electronics'; pptx.author = 'Winmate';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px;overflow:hidden;pointer-events:none;';
  document.body.appendChild(host);
  try {
    for (let i = 0; i < slides.length; i++) {
      const sl = slides[i];
      host.innerHTML = layoutHtml(sl.f);
      const root = host.firstElementChild;
      applyOverrides(root, sl.ov, i + 1);
      // wait for images in this slide
      await Promise.all(Array.from(root.querySelectorAll('img')).map((im) => (im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; }))));
      const s = await addSlide(pptx, root, { font });
      const meta = L[sl.f];
      s.addNotes(`${sl.part ? '[' + sl.part + '] ' : ''}${meta ? meta.name : ''}${meta && meta.when ? ' — ' + meta.when : ''}`);
      onProgress && onProgress(i + 1, slides.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    const blob = await pptx.write({ outputType: 'blob' });
    return blob;
  } finally { host.remove(); }
}

/** 카탈로그 레이아웃 목록 → exportPptx 입력(예시 문구 그대로, 발표자 노트에 파트 이름). */
export const slidesOf = (list) => list.map((l) => ({ f: l.f, ov: { t: {}, img: {} }, part: PARTS[l.p] ? PARTS[l.p].label : '' }));
