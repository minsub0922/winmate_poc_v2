import { fetchResource } from '../api/client.js';
// 제품 DB 묶음 — 상세(img/prod/dNN.json: 옵션 모델 · 스펙 · 특장점 · 카탈로그 등장)와 사진(img/prod/tNN.json 썸네일 · gNN.json 갤러리).
// 탐색기에 600개가 넘는 제품이 한 번에 뜨므로 사진은 화면에 보이는 행의 묶음만, 상세는 hover 상세를 처음 열 때 받는다.
// 사진 묶음 주소("img/prod/t03.json#12")와 받기 · 캐시는 배경 사진 묶음(bgpack.js)과 같다.
import { createElement, useEffect, useRef, useState } from 'react';
import { bgUrl, loadBg } from './packs.js';
import { P } from './catalog.js';
import { manageImage, packedImage, IMAGE_ERROR_PATH } from './image-state.js';
import '../styles/image-state.css';

const DETAIL = new Map(); // pack no → Promise<{ id: detail }>
const packUrl = (n) => `/api/product-packs/${n}`;
function loadPack(n) {
  if (!DETAIL.has(n)) {
    DETAIL.set(n, fetchResource(packUrl(n)).then((r) => { if (!r.ok) throw new Error('제품 상세 묶음을 못 받았어요: ' + packUrl(n)); return r.json(); })
      .then((j) => j.items || {}).catch((e) => { DETAIL.delete(n); throw e; }));
  }
  return DETAIL.get(n);
}
/** product id → its detail (or null when the product has none) */
export async function loadProductDetail(id) {
  const p = P[id];
  if (!p || p.d == null) return null;
  try { const items = await loadPack(p.d); return items[id] || null; } catch (e) { console.warn(e); return null; }
}
/** hook: { detail, loading } for a product id */
export function useProductDetail(id) {
  const [st, setSt] = useState(() => ({ id, detail: null, loading: !!(P[id] && P[id].d != null) }));
  useEffect(() => {
    let live = true;
    const p = P[id];
    if (!p || p.d == null) { setSt({ id, detail: null, loading: false }); return undefined; }
    setSt({ id, detail: null, loading: true });
    loadProductDetail(id).then((d) => { if (live) setSt({ id, detail: d, loading: false }); });
    return () => { live = false; };
  }, [id]);
  return st.id === id ? st : { id, detail: null, loading: true };
}

/** a packed picture address → url once loaded. lazy: wait until the element is near the viewport. */
export function usePacked(addr, lazy = true) {
  const [url, setUrl] = useState(() => (addr ? bgUrl(addr) : null));
  const ref = useRef(null);
  useEffect(() => {
    if (!addr) { setUrl(null); return undefined; }
    const now = bgUrl(addr);
    if (now) { setUrl(now); return undefined; }
    setUrl(null);
    let live = true, io = null;
    const go = () => loadBg(addr).then((u) => { if (live) setUrl(u); });
    const el = ref.current;
    if (lazy && el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); io = null; go(); } }, { rootMargin: '240px' });
      io.observe(el);
    } else go();
    return () => { live = false; if (io) io.disconnect(); };
  }, [addr, lazy]);
  return [url, ref];
}

/** e-카탈로그 쪽 바로가기(뷰어가 그 쪽을 펴서 엶) */
export const ecatUrl = (dir, page) => `https://samsung.aiibook.net/b2b/access/ecatalogt.php?catimage=&start=${page || 1}&callmode=&eclang=ko&Dir=${dir}`;

/** Real image with shimmer → decoded image, or an explicit load-error state. */
export function PImg({ src, className = '', style, compact = false, ...rest }) {
  const image = useRef(null);
  const source = String(src || '');
  useEffect(() => manageImage(image.current), [source]);
  const frameStyle = {};
  for (const key of ['width', 'height', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight', 'borderRadius', 'flexShrink', 'flexGrow', 'flexBasis', 'aspectRatio']) {
    if (style?.[key] != null) frameStyle[key] = style[key];
  }
  if (rest.width != null && frameStyle.width == null) frameStyle.width = rest.width;
  if (rest.height != null && frameStyle.height == null) frameStyle.height = rest.height;
  return createElement('span', { key: source, className: 'image-state' + (compact ? ' compact' : '') + (className ? ' ' + className : ''), style: frameStyle, 'data-image-state': 'loading', 'aria-busy': true },
    createElement('img', { ...rest, style, ref: image, src: packedImage(source) ? undefined : source || undefined, 'data-image-source': source }),
    createElement('span', { className: 'image-state-shimmer', 'aria-hidden': true }),
    createElement('span', { className: 'image-state-error', role: 'img', 'aria-label': (rest.alt ? rest.alt + ' · ' : '') + '이미지 로드 오류' },
      createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        createElement('path', { d: IMAGE_ERROR_PATH })),
      createElement('span', null, '이미지 로드 오류')));
}
