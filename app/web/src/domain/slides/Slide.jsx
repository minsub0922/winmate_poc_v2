import React, { useLayoutEffect, useRef, useEffect, useState } from 'react';
import { layoutHtml } from '../../services/catalog.js';
import { resolveImg } from '../../repositories/proposals.js';
import { markUnits } from './evidence.js';
import { bgUrl, loadBg } from '../../services/packs.js';
import { hydrateFill } from '../../services/fill.js';
import { legacySrc } from '../templates/legacy_img.js';
import { applySpatialBinding } from '../spatial/slide-binding.js';

const ALLOWED_TAGS = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'BR', 'SUP', 'SUB', 'SMALL']);
export function sanitizeInline(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 1) {
        if (!ALLOWED_TAGS.has(c.tagName)) { c.replaceWith(document.createTextNode(c.textContent)); continue; }
        for (const a of Array.from(c.attributes)) if (a.name !== 'style') c.removeAttribute(a.name);
        walk(c);
      } else if (c.nodeType !== 3) c.remove();
    }
  };
  walk(t.content);
  return t.innerHTML;
}

/** Fixed (non-editable) element whose own text is exactly `label` — a picture placeholder box. */
function fixedBox(root, label) {
  // a box the layout already filled with a sample photo keeps its label as data-label
  for (const e of root.querySelectorAll('[data-label]')) if (!e.hasAttribute('data-tb') && e.getAttribute('data-label') === label) return e;
  for (const e of root.querySelectorAll('div, span')) {
    if (e.closest('[data-tb],[data-img]')) continue;
    const own = Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('').trim();
    if (own === label) return e;
  }
  return null;
}

/** layout root painted dark (#rrggbb with low luminance) */
function darkRoot(root) {
  const m = /background(?:-color)?:\s*#([0-9a-f]{6})/i.exec(root.getAttribute('style') || '');
  if (!m) return false;
  const n = parseInt(m[1], 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.35;
}

function paintBg(root, url) {
  root.style.backgroundImage = `url("${url}")`;
  root.style.backgroundSize = 'cover';
  root.style.backgroundPosition = 'center';
  root.setAttribute('data-bg', url);
}

const PACKED = /\.json#\d+$/;
const withLegacy = (v) => { const s = legacySrc(v.src); return s === v.src ? v : { ...v, src: s }; };
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Apply text/image overrides to a mounted slide root. */
export function applyOverrides(root, ov, pageNo) {
  if (!root) return;
  if (ov?.notes != null) root.querySelectorAll('[data-proposal-note="source"]').forEach(el => { el.textContent = String(ov.notes); });
  hydrateFill(root); // sample photos the layout carries in packs (img/fill/*.json)
  const t = (ov && ov.t) || {};
  for (const [i, v] of Object.entries(t)) {
    const el = root.querySelector(`[data-tb="${i}"]`);
    if (!el || v == null) continue;
    if (typeof v === 'object' && v.html != null) el.innerHTML = sanitizeInline(v.html);
    else el.textContent = String(v);
  }
  const im = (ov && ov.img) || {};
  for (const [i, v0] of Object.entries(im)) {
    const v = v0 && withLegacy(v0); // an old img/bs path now packed (legacy_img.js) → its pack address
    // "t<n>": a text block the layout drew as a picture area (cover photo, aerial view …)
    // "s:<text>": a fixed picture placeholder found by its label (layouts without an image slot there)
    const el = /^t\d+$/.test(i) ? root.querySelector(`[data-tb="${i.slice(1)}"]`)
      : i.startsWith('s:') ? fixedBox(root, i.slice(2))
      : root.querySelector(`[data-img="${i}"]`);
    // a packed picture ("img/fill/<묶음>.json#k") goes in as data-fill — hydrateFill below loads it like the layout's own
    if (v?.hidden && el) {
      el.replaceChildren(); el.removeAttribute('src'); el.removeAttribute('data-fill');
      if (el.tagName !== 'IMG') { el.textContent = v.name || '이미지 확인 필요'; el.style.fontSize = '14px'; }
      continue;
    }
    const packed = !!(v && PACKED.test(v.src || ''));
    const src = v && (packed ? (bgUrl(v.src) || BLANK) : resolveImg(v.src));
    if (!el || !src) continue;
    const identity = node => {
      if (v.pid) node.setAttribute('data-pid', v.pid); else node.removeAttribute('data-pid');
      if (v.products?.length) node.setAttribute('data-products', v.products.join(',')); else node.removeAttribute('data-products');
      if (v.name && node.hasAttribute('data-img')) node.setAttribute('data-hint', v.name);
    };
    const put = (im) => { im.setAttribute('src', src); if (packed) im.setAttribute('data-fill', v.src); else im.removeAttribute('data-fill'); identity(im); if (v.name) im.alt = v.name; };
    identity(el);
    if (el.tagName === 'IMG') { put(el); el.style.objectFit = v.fit || 'cover'; continue; }
    // keep: swap only the picture inside the slot — the slot's padding · background · badge and the crop stay as the layout drew them
    const own = v.keep ? el.querySelector('img') : null;
    if (own) { put(own); if (v.name) own.alt = v.name; if (v.fit) own.style.objectFit = v.fit; if (v.pos) own.style.objectPosition = v.pos; continue; }
    el.innerHTML = '';
    el.style.padding = '0px';
    el.style.background = 'transparent';
    if (!/^\d+$/.test(i)) el.style.overflow = 'hidden';
    const img = document.createElement('img');
    put(img); img.alt = v.name || '';
    img.setAttribute('style', `display:block;width:100%;height:100%;object-fit:${v.fit || 'cover'};${v.pos ? 'object-position:' + v.pos + ';' : ''}`);
    el.appendChild(img);
  }
  if (Object.keys(im).length) hydrateFill(root); // packed pictures the overrides just placed
  // bg: { src } — a background photo behind the whole layout (the layout itself stays as it is).
  // embedded: the layout editor already saved this background in its own HTML.
  // Light layouts only: a dark layout (full-bleed photo cover …) already is its own background.
  const bg = ov && ov.bg;
  if (bg && bg.src && !bg.embedded && !darkRoot(root)) {
    // full-slide inner panels with a flat colour would hide it — let them through
    for (const e of root.querySelectorAll('div')) {
      const st = e.getAttribute('style') || '';
      if (/(^|;)\s*width:\s*1280px/.test(st) && /(^|;)\s*height:\s*720px/.test(st) && /background(-color)?:\s*#/.test(st) && !/url\(/.test(st)) e.style.backgroundColor = 'transparent';
    }
    const src = resolveImg(bg.src) || bg.src;
    const now = bgUrl(src);
    if (now) paintBg(root, now);
    else { // its photo pack is still on the way — paint it as soon as it arrives (if this slide is still showing it)
      root.setAttribute('data-bg-wait', src);
      loadBg(src).then((u) => { if (u && root.getAttribute('data-bg-wait') === src) { root.removeAttribute('data-bg-wait'); paintBg(root, u); } });
    }
  }
  // r: [[from, to]] — replace words in the layout's fixed text (outside editable blocks)
  const rep = (ov && ov.r) || null;
  if (rep && rep.length) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      if (n.parentElement && n.parentElement.closest('[data-tb]')) continue;
      let s = n.nodeValue; for (const [a, b] of rep) if (a) s = s.split(a).join(b);
      if (s !== n.nodeValue) n.nodeValue = s;
    }
  }
  applySpatialBinding(root, ov?.spatial, ov?.t);
  if (pageNo != null) {
    root.querySelectorAll('[data-tb]').forEach((e) => {
      if (/^CONFIDENTIAL · \d+$/.test(e.textContent.trim())) e.textContent = 'CONFIDENTIAL · ' + pageNo;
      else if (e.hasAttribute('data-pgno') && /^\d+$/.test(e.textContent.trim())) e.textContent = String(pageNo); // bare page number (공유오피스 Lite 양식)
    });
  }
}

/** Read text blocks (index + current text) from a layout with overrides applied. */
export function readBlocks(f, ov, includeEmpty = false) {
  const host = document.createElement('div');
  host.innerHTML = layoutHtml(f);
  const root = host.firstElementChild;
  applyOverrides(root, ov);
  return Array.from(root.querySelectorAll('[data-tb]')).map((e) => ({ i: Number(e.getAttribute('data-tb')), s: e.textContent.replace(/\s+/g, ' ').trim(), fs: parseFloat((e.getAttribute('style') || '').match(/font-size:\s*([\d.]+)px/)?.[1] || '0') })).filter((b) => includeEmpty || b.s);
}
export function readImageSlots(f, ov) {
  const host = document.createElement('div');
  host.innerHTML = layoutHtml(f);
  if (ov) applyOverrides(host.firstElementChild, ov);
  const boxOf = el => {
    let x = 0, y = 0;
    for (let node = el; node && node !== host.firstElementChild; node = node.parentElement) {
      x += parseFloat(node.style?.left) || 0; y += parseFloat(node.style?.top) || 0;
    }
    return { x, y, w: parseFloat(el.style?.width) || parseFloat(el.parentElement?.style?.width) || 0, h: parseFloat(el.style?.height) || 24 };
  };
  const itemText = el => {
    let text = '';
    for (let parent = el.parentElement; parent && parent !== host.firstElementChild; parent = parent.parentElement) {
      const labels = [...parent.querySelectorAll('[data-tb]')];
      if (labels.length > 16 || parent.querySelectorAll('[data-img]').length > 4) break;
      if (labels.length) text = labels.map(label => label.textContent.trim()).filter(Boolean).join(' · ');
    }
    if (text) return text;
    // Standard PPT imports often put the whole slide in one flat absolute layer.
    // Use the clicked picture's row, not the slide title, other rows or footnotes.
    const image = boxOf(el);
    return [...host.querySelectorAll('[data-tb]')].map(label => ({ label, box: boxOf(label) }))
      .filter(({ box }) => box.y >= image.y - 40 && box.y <= image.y + image.h + 40)
      .sort((a, b) => {
        const distance = box => Math.abs(box.y - image.y) + Math.max(0, image.x - box.x - box.w, box.x - image.x - image.w) * 0.3;
        return distance(a.box) - distance(b.box);
      }).slice(0, 16).map(({ label }) => label.textContent.trim()).filter(Boolean).join(' · ');
  };
  return Array.from(host.querySelectorAll('[data-img]')).map((e) => ({
    i: Number(e.getAttribute('data-img')), kind: e.getAttribute('data-kind') || '', hint: e.getAttribute('data-hint') || e.getAttribute('alt') || (e.querySelector('span') ? e.querySelector('span').textContent : ''),
    pid: e.getAttribute('data-pid') || '',
    src: (e.matches('img') ? e : e.querySelector('img'))?.getAttribute('data-fill') || (e.matches('img') ? e : e.querySelector('img'))?.getAttribute('src') || '',
    name: (e.matches('img') ? e : e.querySelector('img'))?.getAttribute('alt') || '',
    products: (e.getAttribute('data-products') || '').split(',').filter(Boolean),
    itemText: itemText(e),
  }));
}

/**
 * Renders one 1280×720 layout scaled to `width`.
 * editable: text blocks become editable in place; image slots become clickable / droppable.
 */
export function Slide({ f, ov, width = 320, pageNo, editable = false, onText, onImage, onImageDrop, onSpatial, className = '', lazy = false, focusImg = null, selUnit = null, hiUnits = null, onSelect }) {
  const inner = useRef(null);
  const box = useRef(null);
  const [visible, setVisible] = useState(!lazy);
  const scale = width / 1280;
  useEffect(() => {
    if (!lazy || visible) return;
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);
  const ovKey = JSON.stringify(ov || {});
  useLayoutEffect(() => {
    const el = inner.current; if (!el || !visible) return;
    el.innerHTML = layoutHtml(f);
    applyOverrides(el.firstElementChild, ov, pageNo);
    if (editable) {
      el.querySelectorAll('[data-tb]').forEach((t) => { t.setAttribute('tabindex', '0'); t.setAttribute('title', '클릭해서 수정'); });
      el.querySelectorAll('[data-img]').forEach((t) => { t.setAttribute('tabindex', '0'); t.setAttribute('title', onSelect ? '클릭해서 다른 이미지로 바꾸기 · 파일을 끌어다 놓아도 돼요' : '클릭해서 이미지 넣기 · 파일을 끌어다 놓아도 돼요'); });
      if(onSpatial)el.querySelectorAll('[data-spatial-slot],[data-kind="aerial"]').forEach(slot=>{slot.title='클릭해서 저장한 조감도 레이아웃 고르기';slot.setAttribute('data-spatial-picker','true');});
      if (onSelect) markUnits(el.firstElementChild);
    }
    if (focusImg != null) { const t = el.querySelector(`[data-img="${focusImg}"]`); if (t) t.classList.add('wm-focus'); }
  }, [f, ovKey, pageNo, editable, visible, focusImg]);
  // selection / highlight marks only — never re-render the slide (an inline edit may be open)
  const hiKey = (hiUnits || []).join(',');
  useLayoutEffect(() => {
    const el = inner.current; if (!el || !visible || !onSelect) return;
    el.querySelectorAll('.wm-sel, .wm-hi').forEach((n) => n.classList.remove('wm-sel', 'wm-hi'));
    if (selUnit) { const n = el.querySelector(`[data-unit="${selUnit}"]`); if (n) n.classList.add('wm-sel'); }
    for (const k of hiUnits || []) { const n = el.querySelector(`[data-unit="${k}"]`); if (n) n.classList.add('wm-hi'); }
  }, [selUnit, hiKey, f, ovKey, visible, editable]);

  const onClick = (e) => {
    if (!editable) return;
    const img = e.target.closest('[data-img]');
    if(img&&onSpatial&&img.matches('[data-spatial-slot],[data-kind="aerial"]')){
      e.preventDefault();if(onSelect)onSelect('i'+img.getAttribute('data-img'));onSpatial(Number(img.getAttribute('data-img')),img);return;
    }
    if (img?.hasAttribute('data-spatial-slot') && ov?.spatial) {
      e.preventDefault(); if (onSelect) onSelect('i' + img.getAttribute('data-img')); return;
    }
    if (img && onImage) { e.preventDefault(); if (onSelect) onSelect('i' + img.getAttribute('data-img')); onImage(Number(img.getAttribute('data-img')), img); return; }
    const tb = e.target.closest('[data-tb]');
    if (onSelect) { const u = e.target.closest('[data-unit]'); onSelect(u ? u.getAttribute('data-unit') : null); }
    if (tb && tb.contentEditable !== 'true') {
      tb.contentEditable = 'true'; tb.focus();
      const range = document.createRange(); range.selectNodeContents(tb); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      const before = tb.innerHTML;
      const keys = (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); tb.innerHTML = before; tb.blur(); }
        else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); tb.blur(); }
      };
      const done = () => {
        tb.contentEditable = 'false';
        tb.removeEventListener('blur', done);
        tb.removeEventListener('keydown', keys);
        if (tb.innerHTML === before) return;
        const hasEl = Array.from(tb.children).some((c) => c.tagName !== 'BR');
        onText && onText(Number(tb.getAttribute('data-tb')), hasEl ? { html: sanitizeInline(tb.innerHTML) } : tb.innerText.replace(/\n$/, ''));
      };
      tb.addEventListener('blur', done);
      tb.addEventListener('keydown', keys);
    }
  };
  const onKey = (e) => {
    if (!editable || e.key !== 'Enter' || e.defaultPrevented) return;
    const img = e.target.closest && e.target.closest('[data-img]');
    if(img&&onSpatial&&img.matches('[data-spatial-slot],[data-kind="aerial"]')){e.preventDefault();if(onSelect)onSelect('i'+img.getAttribute('data-img'));onSpatial(Number(img.getAttribute('data-img')),img);return;}
    if (img && onImage) { e.preventDefault(); if (onSelect) onSelect('i' + img.getAttribute('data-img')); onImage(Number(img.getAttribute('data-img')), img); return; }
    const tb = e.target.closest && e.target.closest('[data-tb]');
    if (tb && tb.contentEditable !== 'true') { e.preventDefault(); onClick({ target: tb, preventDefault() {} }); }
  };
  const onFocus = (e) => {
    if (!editable || !onSelect || !e.target.closest) return;
    const u = e.target.closest('[data-unit]');
    if (u && e.target.matches('[data-tb],[data-img]')) onSelect(u.getAttribute('data-unit'));
  };
  const onDragOver = (e) => { if (!editable) return; const img = e.target.closest('[data-img]'); if (img && e.dataTransfer.types.includes('Files')) { e.preventDefault(); img.classList.add('wm-drop'); } };
  const onDragLeave = (e) => { const img = e.target.closest && e.target.closest('[data-img]'); if (img) img.classList.remove('wm-drop'); };
  const onDrop = (e) => {
    if (!editable) return;
    const img = e.target.closest('[data-img]');
    if (img && e.dataTransfer.files && e.dataTransfer.files[0]) { e.preventDefault(); img.classList.remove('wm-drop'); onImageDrop && onImageDrop(Number(img.getAttribute('data-img')), e.dataTransfer.files[0]); }
  };
  return (
    <div ref={box} className={'slide ' + (editable ? 'slide-edit ' : '') + className} style={{ width, height: Math.round(width * 9 / 16) }}
      onClick={onClick} onKeyDown={onKey} onFocus={onFocus} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {visible ? <div ref={inner} className={'slide-inner' + (onSelect && editable ? ' slide-units' : '')} style={{ transform: `scale(${scale})`, '--k': scale }} /> : <div className="slide-wait" />}
    </div>
  );
}

/** Measure available width for a fit-to-container slide. */
export function useWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return w;
}

/** Slide that fills its container width. */
export function FitSlide({ max = 4000, ...props }) {
  const ref = useRef(null);
  const w = useWidth(ref, 300);
  return <div ref={ref} style={{ width: '100%' }}>{w > 0 && <Slide {...props} width={Math.min(max, w)} />}</div>;
}
