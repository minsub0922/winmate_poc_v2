// Popover beside a Storyboard bubble (고객 요구사항 · 제품 · 솔루션 매칭).
// Rendered as a child of .canvas-wrap and placed against it: to the right of the anchor bubble, with an arrow at the
// bubble's centre, following it when the canvas scrolls or zooms; on a narrow canvas (PPT 레이아웃 panel open, mobile)
// it becomes a sheet over the canvas. cls names the popup for its own parts: `${cls}-pop`, `${cls}-body`, `${cls}-f`, `${cls}-x`.
import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Icon } from './common.jsx';

const POP_W = 760, POP_MIN = 480, POP_GAP = 18, POP_EDGE = 12;

function placeBeside(el, anchor) {
  const wrap = el && el.parentElement; if (!wrap) return null;
  const a = wrap.querySelector(anchor);
  const W = wrap.getBoundingClientRect();
  if (!a || W.width < 640) return { sheet: true };
  const B = a.getBoundingClientRect();
  // clear the bubble and its name (the name can be wider than the circle)
  const lab = a.closest('.start-node, .match-node');
  const nm = lab && lab.querySelector('.node-name');
  const bubbleRight = Math.max(B.right, nm ? nm.getBoundingClientRect().right : 0) - W.left;
  let left = Math.max(POP_EDGE, bubbleRight + POP_GAP);
  let width = Math.min(POP_W, W.width - left - POP_EDGE);
  if (width < POP_MIN) { width = Math.min(POP_MIN, W.width - POP_EDGE * 2); left = Math.max(POP_EDGE, W.width - POP_EDGE - width); }
  const top = Math.min(Math.max(POP_EDGE, B.top - W.top - 6), Math.max(POP_EDGE, W.height - 320));
  const height = W.height - top - POP_EDGE;
  const ay = B.top + B.height / 2 - W.top - top;
  const arrow = left >= bubbleRight + 4 && ay > 22 && ay < height - 22;
  return { left, top, width, height, ay, arrow };
}

// back: { label, onClick } — a ← button before the icon (a view opened from inside the popup, e.g. 추가 · 추천 탐색)
// fill: take the full height beside the bubble (lists that scroll inside) · onEsc: what Esc does (default: close)
export function BubblePopup({ cls, extra = '', anchor, icon, title, sub, status, closeLabel, onClose, onEsc, back, fill = false, footer, footerClass = '', bodyClass = '', bodyRef, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const wrap = el.parentElement; const canvas = wrap && wrap.querySelector('.canvas');
    let raf = 0;
    const place = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setPos(placeBeside(el, anchor))); };
    setPos(placeBeside(el, anchor));
    const ro = new ResizeObserver(place); ro.observe(wrap);
    const board = canvas && canvas.querySelector('.board'); if (board) ro.observe(board);
    canvas && canvas.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); canvas && canvas.removeEventListener('scroll', place); window.removeEventListener('resize', place); };
  }, [anchor]);
  // take focus when it opens (or switches view) so Esc and Tab work from inside it
  // (once placed — it is hidden until then and could not take focus)
  const placed = !!pos;
  useEffect(() => { const el = ref.current; if (placed && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true }); }, [placed]);
  // sized to its content, never past the bottom of the canvas
  const style = !pos ? { visibility: 'hidden' } : pos.sheet ? null : { left: pos.left, top: pos.top, width: pos.width, [fill ? 'height' : 'maxHeight']: pos.height, '--ay': pos.ay + 'px' };
  const hid = cls + '-pop-h';
  return (
    <section ref={ref} id={cls + '-pop'} className={'bpop ' + cls + '-pop' + (extra ? ' ' + extra : '') + (pos && pos.sheet ? ' sheet' : '') + (pos && pos.arrow ? ' arrow' : '')} style={style} role="dialog" aria-labelledby={hid} tabIndex={-1}
      onKeyDown={(e) => {
        // Esc closes the popup — not while a mention menu / combobox inside handles it, and never for portaled modals
        if (e.key !== 'Escape' || !e.currentTarget.contains(e.target) || e.target.isContentEditable || e.defaultPrevented) return;
        e.stopPropagation();
        if (onEsc) { onEsc(); return; }
        onClose(); const b = document.querySelector(anchor); b && b.focus({ preventScroll: true });
      }}>
      <header className={'bp-h' + (back ? ' has-back' : '')}>
        {back && <button type="button" className="btn btn-ghost btn-icon btn-sm bp-back" onClick={back.onClick} aria-label={back.label} title={back.label}><Icon name="chevL" size={17} stroke={2.4} /></button>}
        <span className="bp-ic" aria-hidden="true">{icon}</span>
        <div className="bp-t"><h2 id={hid}>{title}</h2>{sub}</div>
        {status}
        <button type="button" className={'btn btn-ghost btn-icon btn-sm bp-x ' + cls + '-x'} onClick={onClose} aria-label={closeLabel || title + ' 닫기'} title="닫기"><Icon name="x" size={16} /></button>
      </header>
      <div ref={bodyRef} className={'bp-body ' + cls + '-body' + (bodyClass ? ' ' + bodyClass : '')}>{children}</div>
      {footer && <footer className={'bp-f ' + cls + '-f' + (footerClass ? ' ' + footerClass : '')}>{footer}</footer>}
    </section>
  );
}
