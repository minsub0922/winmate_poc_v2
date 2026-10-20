import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PImg } from '../services/products.js';

/** Image alternatives share a hover preview without changing the selected image. */
export function useImagePeek() {
  const [peek, setPeek] = useState(null);
  const timer = useRef(null);
  const hide = useCallback(() => { clearTimeout(timer.current); setPeek(null); }, []);
  const show = useCallback((image, anchor) => {
    clearTimeout(timer.current);
    setPeek(null);
    if (window.matchMedia('(hover: none)').matches) return;
    timer.current = setTimeout(() => {
      if (!anchor.isConnected) return;
      const panel = anchor.closest('.imgpop, .modal');
      setPeek({ image, card: anchor.getBoundingClientRect(), panel: (panel || anchor).getBoundingClientRect() });
    }, 180);
  }, []);
  useEffect(() => {
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [hide]);
  return {
    bind: (image) => ({ onMouseEnter: (e) => show(image, e.currentTarget), onMouseLeave: hide, onMouseDown: hide }),
    node: peek ? <ImagePeek {...peek} /> : null,
  };
}

function ImagePeek({ image, card, panel }) {
  const ref = useRef(null);
  const [top, setTop] = useState(-9999);
  const edge = 12, gap = 12, vw = window.innerWidth, vh = window.innerHeight;
  const room = (r) => ({ right: vw - r.right - gap - edge, left: r.left - gap - edge });
  let anchor = panel;
  let space = room(anchor);
  // A full library can fill the window; use the hovered card's side in that case.
  if (Math.max(space.right, space.left) < 240) { anchor = card; space = room(anchor); }
  const beside = Math.max(space.right, space.left) >= 240;
  const width = Math.min(420, beside ? Math.max(space.right, space.left) : vw - edge * 2);
  const left = beside ? (space.right >= space.left ? anchor.right + gap : anchor.left - gap - width)
    : Math.max(edge, Math.min(card.left, vw - width - edge));
  const below = vh - card.bottom - gap - edge, above = card.top - gap - edge;
  const down = below >= above;
  const maxHeight = beside ? vh - edge * 2 : Math.max(0, down ? below : above);
  const photoSize = Math.max(0, Math.min(width - 2, maxHeight - 90));
  useLayoutEffect(() => {
    const height = ref.current.offsetHeight;
    setTop(beside ? Math.max(edge, Math.min(card.top + card.height / 2 - height / 2, vh - height - edge))
      : down ? card.bottom + gap : card.top - gap - height);
  }, [image, card, width, beside, down, vh]);
  return createPortal(
    <div ref={ref} className="image-peek" role="tooltip" aria-label="이미지 확대 미리보기" style={{ left, top, width, maxHeight }}>
      <div className="image-peek-photo" style={{ width: photoSize, height: photoSize }}>
        <PImg key={image.src} src={image.src} alt={image.desc} />
      </div>
      <div className="image-peek-caption"><b>{image.desc}</b><span>{[image.groupName, image.model].filter(Boolean).join(' · ')}</span></div>
    </div>, document.body);
}
