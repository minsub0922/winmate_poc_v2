import { fetchResource } from '../../api/client.js';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import { addNativePlan } from '../spatial/slide-binding.js';
import { layoutHtml, L } from '../../services/catalog.js';
import { applyOverrides } from './Slide.jsx';
import { loadBg } from '../../services/packs.js';
import { fillReady } from '../../services/fill.js';
import { PARTS } from '../proposals/parts.js';
import { renderBackgroundCanvas, readBackgroundEffects } from '../../services/background-effects.js';

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

// PowerPoint가 못 읽는 형식(AVIF · WebP — 솔루션 · 유관사례 이미지 묶음)은 JPEG(투명하면 PNG)로 바꿔 넣는다
const REENCODE = /^image\/(avif|webp)/i;
async function reencode(b) {
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  let alpha = false;
  try { const d = g.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 61) if (d[i] < 250) { alpha = true; break; } } catch (e) { /* tainted — keep jpeg */ }
  return c.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.92);
}
async function toDataUrl(src) {
  if (!src) return null;
  if (src.startsWith('data:') && !/^data:image\/(avif|webp)/i.test(src)) return src;
  try {
    const r = await fetchResource(src); const b = await r.blob();
    if (REENCODE.test(b.type || '')) return await reencode(b);
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
  } catch (e) { return null; }
}
// one deck uses one background — fetch it once
const BG_CACHE = new Map();
async function bgDataUrl(src, color = '#ffffff', effects) {
  const key = JSON.stringify([src, color, effects]);
  if (!BG_CACHE.has(key)) BG_CACHE.set(key, (async () => {
    // PowerPoint stretches a native background image. Crop to the slide's 16:9
    // aspect and apply the same photo-only effects as the editor preview.
    try {
      const canvas = await renderBackgroundCanvas(src, effects, { color });
      return canvas.toDataURL('image/jpeg', .94);
    } catch (error) { if (effects) throw error; return toDataUrl(src); }
  })());
  const d = await BG_CACHE.get(key);
  if (!d) BG_CACHE.delete(key); // try again next time
  return d;
}
async function svgToPng(svg, w, h, untransformed = false, viewBox = null) {
  const clone = svg.cloneNode(true);
  // A slide SVG is absolutely positioned on the HTML canvas. Those offsets
  // must not survive inside its standalone image: they can move the entire
  // drawing outside the raster viewport and produce a transparent PNG.
  for (const key of ['position','left','top','right','bottom','margin']) clone.style.removeProperty(key);
  clone.style.width = w + 'px'; clone.style.height = h + 'px';
  if (untransformed) clone.style.transform = ''; // a rotated / flipped drawing goes in upright; the slide rotates it
  if (viewBox) clone.setAttribute('viewBox', viewBox.join(' ')); // a line drawn past its box (arrowheads · thick strokes) — the whole drawing
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
function fontFace(cs, mapFont, keep) {
  const fam = cs.fontFamily || '';
  if (/manrope/i.test(fam)) return 'Manrope';
  if (keep) { const first = fam.split(',')[0].trim().replace(/^['"]|['"]$/g, ''); if (first && !/^(sans-serif|serif|system-ui)$/i.test(first)) return first; } // a My template from PPTX keeps the deck's own font
  return mapFont;
}
const SIMPLE = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'SUP', 'SUB', 'SMALL']);
function runsOf(el, base, mapFont, keep) {
  const runs = [];
  const push = (text, cs) => {
    if (!text) return;
    const col = parseColor(cs.color);
    runs.push({ text, options: { color: col ? col.hex : '121417', bold: (parseInt(cs.fontWeight) || 400) >= 600, fontSize: Math.max(5, parseFloat(cs.fontSize) * 0.75), fontFace: fontFace(cs, mapFont, keep) } });
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
  // ov.bg → the slide's own background picture (Format › Background), so it can't be moved by accident
  const bgSrc = root.getAttribute('data-bg');
  const effects = root.hasAttribute('data-bg-effects') ? readBackgroundEffects(root) : undefined;
  const bgData = bgSrc ? await bgDataUrl(bgSrc, getComputedStyle(root).backgroundColor, effects) : null;
  if (bgData) s.background = { data: bgData, path: /png/i.test(bgData.slice(0, 30)) ? 'bg.png' : 'bg.jpg' };
  else s.background = { color: 'FFFFFF' };
  const R = root.getBoundingClientRect();
  const box = (r) => ({ x: (r.left - R.left) * PX, y: (r.top - R.top) * PX, w: Math.max(0.01, r.width * PX), h: Math.max(0.01, r.height * PX) });
  const els = [root, ...root.querySelectorAll('*')];
  const textDone = new Set();
  const keep = root.hasAttribute('data-keep-font');
  // a converted PPTX (My 템플릿) keeps rotated · flipped shapes: the upright box + rotate / flipH (other layouts are drawn axis-aligned)
  const myRoot = root.hasAttribute('data-my');
  const turn = (el) => {
    if (!myRoot) return null;
    let a = 0, fh = false;
    for (let e = el; e && e !== root; e = e.parentElement) {
      const tf = getComputedStyle(e).transform;
      if (!tf || tf === 'none') continue;
      const m = new DOMMatrix(tf);
      if (m.a * m.d - m.b * m.c < 0) { fh = !fh; a += Math.atan2(-m.b, -m.a) * 180 / Math.PI; } else a += Math.atan2(m.b, m.a) * 180 / Math.PI;
    }
    a = ((a % 360) + 360) % 360; if (a > 359.5 || a < 0.5) a = 0;
    if (!a && !fh) return null;
    const w0 = el.offsetWidth != null ? el.offsetWidth : el.clientWidth || (el.parentElement ? el.parentElement.offsetWidth : 0);
    const h0 = el.offsetHeight != null ? el.offsetHeight : el.clientHeight || (el.parentElement ? el.parentElement.offsetHeight : 0);
    return { a, fh, w0, h0 };
  };
  const tbox = (r, t) => { const cx = r.left + r.width / 2 - R.left, cy = r.top + r.height / 2 - R.top; return { x: (cx - t.w0 / 2) * PX, y: (cy - t.h0 / 2) * PX, w: Math.max(0.01, t.w0 * PX), h: Math.max(0.01, t.h0 * PX), rotate: t.a || undefined, flipH: t.fh || undefined }; };
  for (const el of els) {
    if (el.closest('[data-desc-table]') && !el.hasAttribute('data-desc-table')) continue;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.right < R.left || r.left > R.right || r.bottom < R.top || r.top > R.bottom) continue;
    const b = box(r);
    const tag = el.tagName.toLowerCase();
    if (el.hasAttribute('data-desc-table')) {
      const def=JSON.parse(el.getAttribute('data-desc-table'));
      const rows=def.rows.map(()=>[]);
      for(const cell of el.querySelectorAll('[data-desc-row]')){
        const css=getComputedStyle(cell),col=parseColor(css.color);
        rows[Number(cell.dataset.descRow)].push({text:cell.innerText,options:{
          colspan:Number(cell.dataset.descColspan)||1,rowspan:Number(cell.dataset.descRowspan)||1,
          fontFace:fontFace(css,opts.font,keep),fontSize:parseFloat(css.fontSize)*.75,bold:Number(css.fontWeight)>=600,
          color:col?.hex||'121417',align:css.textAlign==='center'?'center':css.textAlign==='right'?'right':'left',valign:'mid',margin:0,
          fill:parseColor(css.backgroundColor)?.hex||'FFFFFF',border:{type:'solid',color:parseColor(css.borderTopColor)?.hex||'E2E5EA',pt:.5},
        }});
      }
      const columnScale=r.width/def.cols.reduce((a,v)=>a+v,0),rowScale=r.height/def.rows.reduce((a,v)=>a+v,0);
      s.addTable(rows,{...b,colW:def.cols.map(v=>v*columnScale*PX),rowH:def.rows.map(v=>v*rowScale*PX),margin:0,autoPage:false,verbose:false,
        fontFace:opts.font,fontSize:12,color:'121417',border:{type:'solid',color:'D6E3FE',pt:.5}});
      continue;
    }
    if(el.hasAttribute('data-desc-native-shape')){
      const kind=el.getAttribute('data-desc-native-shape'),fill=parseColor(cs.backgroundColor),line=parseColor(cs.borderTopColor),bw=parseFloat(cs.borderTopWidth)||0;
      const shape=kind==='ellipse'?pptx.ShapeType.ellipse:kind==='roundRect'?pptx.ShapeType.roundRect:pptx.ShapeType.rect;
      const options={...b,fill:fill?{color:fill.hex,transparency:tr(fill.a)}:{type:'none'},line:bw&&line?{color:line.hex,width:bw*.75,transparency:tr(line.a)}:{type:'none'}};
      if(kind==='roundRect')options.rectRadius=parseFloat(cs.borderTopLeftRadius)*PX;
      if(fill||bw)s.addShape(shape,options);
      continue;
    }
    if (el.hasAttribute('data-spatial-connector')) {
      const c = JSON.parse(el.getAttribute('data-spatial-connector'));
      s.addShape(pptx.ShapeType.line, { x: Math.min(c.x1,c.x2)*PX, y: Math.min(c.y1,c.y2)*PX, w: Math.abs(c.x2-c.x1)*PX, h: Math.abs(c.y2-c.y1)*PX,
        flipV: c.y2<c.y1, line:{color:'446F96',width:1.1}, objectName:'spatial-connector:'+c.roomId });
      continue;
    }
    if (el.hasAttribute('data-spatial-plan') && root.__spatialBinding) {
      addNativePlan(s,root.__spatialBinding,{x:r.left-R.left,y:r.top-R.top,w:r.width,h:r.height},pptx.ShapeType);continue;
    }
    if (tag === 'svg') {
      if (r.width < 1 || r.height < 1) continue;
      const t = turn(el);
      if (myRoot && !t && !el.getAttribute('viewBox')) { // a thin line: its box is 1px, the stroke and arrowheads reach outside it
        let bb = null; try { bb = el.getBBox(); } catch (e) {}
        if (bb) {
          const pad = 4 + Math.max(0, ...Array.from(el.querySelectorAll('[stroke-width]')).map((x) => parseFloat(x.getAttribute('stroke-width')) || 0));
          const vx = Math.min(0, bb.x) - pad, vy = Math.min(0, bb.y) - pad, vw = Math.max(r.width, bb.x + bb.width) + pad - vx, vh = Math.max(r.height, bb.y + bb.height) + pad - vy;
          const png = await svgToPng(el, vw, vh, false, [vx, vy, vw, vh]);
          if (png) s.addImage({ data: png, x: (r.left - R.left + vx) * PX, y: (r.top - R.top + vy) * PX, w: vw * PX, h: vh * PX });
          continue;
        }
      }
      if (t && t.w0 >= 1 && t.h0 >= 1) { const png = await svgToPng(el, t.w0, t.h0, true); if (png) s.addImage({ data: png, ...tbox(r, t) }); continue; }
      const png = await svgToPng(el, r.width, r.height);
      if (png) s.addImage({ data: png, ...b });
      continue;
    }
    if (tag === 'img') {
      const d = await toDataUrl(el.currentSrc || el.getAttribute('src'));
      const circle = el.closest('[data-layout-shape="circle"]'), circleBox = circle?.getBoundingClientRect();
      const rounding = !!circleBox && Math.abs(circleBox.width-r.width)<1.5 && Math.abs(circleBox.height-r.height)<1.5 && Math.abs(r.width-r.height)<1.5;
      const t = d ? turn(el) : null;
      if (t) { const tb = tbox(r, t); s.addImage({ data: d, ...tb, sizing: { type: 'cover', w: tb.w, h: tb.h } }); continue; }
      if (d) {
        const fit = cs.objectFit === 'contain' ? 'contain' : 'cover';
        const nw = el.naturalWidth || 1, nh = el.naturalHeight || 1;
        if (fit === 'contain') {
          const k = Math.min(r.width / nw, r.height / nh); const w = nw * k, h = nh * k;
          s.addImage({ data: d, x: b.x + (r.width - w) / 2 * PX, y: b.y + (r.height - h) / 2 * PX, w: w * PX, h: h * PX });
        } else s.addImage({ data: d, ...b, rounding, sizing: { type: 'cover', w: b.w, h: b.h } });
      }
      continue;
    }
    // box: fill + borders (a root painted over by the background picture keeps no fill of its own)
    const bg = el === root && bgData ? null : parseColor(cs.backgroundColor);
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map((k) => ({ w: parseFloat(cs['border' + k + 'Width']) || 0, st: cs['border' + k + 'Style'], c: parseColor(cs['border' + k + 'Color']) }));
    const uniform = bw.every((x) => x.w === bw[0].w && x.st === bw[0].st && (x.c && bw[0].c ? x.c.hex === bw[0].c.hex : x.c === bw[0].c)) && bw[0].w > 0 && bw[0].st !== 'none' && bw[0].c;
    const radius = cs.borderTopLeftRadius.trim().split(/\s+/);
    const radiusPx = (value, axis) => (parseFloat(value) || 0) * (value?.endsWith('%') ? axis / 100 : 1);
    const rx = radiusPx(radius[0], r.width), ry = radiusPx(radius[1] || radius[0], r.height);
    const rad = Math.min(rx, ry);
    const rotated = cs.transform && cs.transform !== 'none';
    if (rotated && r.height > 0 && (el.offsetHeight <= 3)) {
      // rotated thin line (map connectors)
      const m = new DOMMatrix(cs.transform); const down = m.b >= 0;
      const lc = bw[0].c || bg || { hex: '1428A0', a: 1 };
      s.addShape(pptx.ShapeType.line, { x: b.x, y: b.y, w: b.w, h: b.h, flipV: !down, line: { color: lc.hex, width: Math.max(0.75, (bw[0].w || el.offsetHeight || 1) * 0.75), dashType: bw[0].st === 'dashed' ? 'dash' : 'solid' } });
    } else if (bg || uniform) {
      const isCircle = rx >= r.width / 2 - 0.5 && ry >= r.height / 2 - 0.5 && Math.abs(r.width - r.height) < 1.5;
      const shape = isCircle ? pptx.ShapeType.ellipse : rad > 0.5 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
      const tt = turn(el);
      const o = tt ? tbox(r, tt) : { ...b };
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
        s.addText([{ text: c.data.replace(/\s+/g, ' ').trim(), options: { color: col ? col.hex : '121417', bold: (parseInt(cs.fontWeight) || 400) >= 600, fontSize: Math.max(5, parseFloat(cs.fontSize) * 0.75), fontFace: fontFace(cs, opts.font, keep) } }],
          { x: (l0 - R.left) * PX, y: (t0 - R.top) * PX, w: Math.max(0.05, (r0 - l0) * 1.06 * PX), h: Math.max(0.05, (b0 - t0) * PX), margin: 0, valign: 'top', wrap: ml, fit: 'none', isTextBox: true });
      }
    }
    // text
    if (!el.hasAttribute('data-tb') || textDone.has(el)) continue;
    textDone.add(el);
    const runs = runsOf(el, cs, opts.font, keep);
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
    const tt = turn(el);
    if (tt) { // rotated text: its upright block (one line stays one line)
      const one = el.offsetHeight < (parseFloat(cs.lineHeight) || fs * 1.3) * 1.5;
      const tb = tbox(r, { ...tt, fh: false, w0: tt.w0 * (one ? 1.15 : 1) });
      s.addText(runs, { ...tb, margin: 0, valign: 'top', align, wrap: !one, fit: 'none', isTextBox: true, lineSpacing: lh && !isNaN(lh) ? lh * 0.75 : undefined, charSpacing: parseFloat(cs.letterSpacing) ? parseFloat(cs.letterSpacing) * 0.75 : undefined });
      continue;
    }
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
 * Export slides: [{f, ov, part, name}] → Blob (.pptx)
 */
export async function exportPptx(slides, { title = 'Winmate 제안서', font = 'Noto Sans KR', onProgress } = {}) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title; pptx.company = 'Samsung Electronics'; pptx.author = 'Winmate';
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px;overflow:hidden;pointer-events:none;';
  document.body.appendChild(host);
  try {
    for (let i = 0; i < slides.length; i++) {
      const sl = slides[i];
      if (sl.ov && sl.ov.bg && sl.ov.bg.src) await loadBg(sl.ov.bg.src); // background photo ready before the slide is read
      host.innerHTML = layoutHtml(sl.f);
      const root = host.firstElementChild;
      applyOverrides(root, sl.ov, i + 1);
      await fillReady(root); // the layout's own sample photos (packed)
      // wait for images in this slide
      await Promise.all(Array.from(root.querySelectorAll('img')).map((im) => (im.complete ? 1 : new Promise((r) => { im.onload = im.onerror = r; }))));
      const s = await addSlide(pptx, root, { font });
      const meta = L[sl.f];
      const sourceNotes = sl.ov?.notes != null ? [String(sl.ov.notes)] : [...root.querySelectorAll('[data-proposal-note]')].map(el => el.textContent.trim()).filter(Boolean);
      s.addNotes(`${sl.part ? '[' + sl.part + '] ' : ''}${meta ? meta.name : ''}${meta && meta.when ? ' — ' + meta.when : ''}${sourceNotes.length ? '\n\n[제품 사양 · 지원 조건 원문]\n' + sourceNotes.join('\n\n') : ''}`);
      onProgress && onProgress(i + 1, slides.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    const blob = await pptx.write({ outputType: 'blob' });
    const spatial = slides.map((sl,i)=>sl.ov?.spatial ? {slide:i+1,...sl.ov.spatial} : null).filter(Boolean);
    if (!spatial.length) return blob;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.file('ppt/embeddings/winmate-spatial.json',JSON.stringify({version:1,scenes:spatial}));
    const types = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml',types.replace('</Types>','<Default Extension="json" ContentType="application/json"/></Types>'));
    return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',compression:'DEFLATE'});
  } finally { host.remove(); }
}
export { PARTS };
