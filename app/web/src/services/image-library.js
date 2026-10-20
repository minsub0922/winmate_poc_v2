import { useEffect, useMemo, useState } from 'react';
import { fetchResource } from '../api/client.js';
import { IMAGE_DB, P, S, C } from './catalog.js';
import { mediaPhotos } from './media.js';
import { registerRanges } from './packs.js';

const LABEL = { cut: '제품 컷', detail: '제품 디테일', scene: '설치 장면', screen: '대표 화면', diagram: '구성도' };
let library, pending;
export async function loadImageLibrary() {
  if (library) return library;
  if (!pending) pending = Promise.all([
    fetchResource('/img/lib/index.json'),
    fetchResource('/img/lib/ranges.json').then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(async ([r, ranges]) => {
    if (!r.ok) throw new Error('제품 이미지 라이브러리를 불러오지 못했어요.');
    if (ranges?.packs) registerRanges(ranges.packs);
    const data = await r.json();
    library = data.images.map(o => ({ pid: o.i, src: o.a, products: o.p || [], models: o.m || [],
      model: (o.p || []).map(id => P[id]?.model).filter(Boolean).join(' · '),
      desc: o.d || o.t, title: o.t, note: o.c, spaces: o.sp || [], page: o.pg, orig: o.u,
      group: o.k === 'cut' || o.k === 'detail' ? 'cut' : o.k === 'screen' || o.k === 'diagram' ? 'ui' : 'life',
      groupName: LABEL[o.k] || '제품 이미지', w: o.w, h: o.h }));
    return library;
  }).finally(() => { pending = null; });
  return pending;
}
export function productImages(ids = []) {
  return ids.flatMap(id => {
    const p = P[id]; if (!p) return [];
    return (p.gal || (p.th ? [p.th] : [])).map((src, i) => ({ pid: src, src, products: [id], model: p.model,
      desc: p.galAlt?.[i] || p.name, group: p.galKind?.[i] === 'scene' ? 'life' : p.galKind?.[i] === 'diagram' ? 'ui' : 'cut',
      groupName: '제품 이미지', note: p.galSrc?.[i] || p.name }));
  });
}
export function imagePool(context = {}, extra = [], { allMedia = false } = {}) {
  const images = [...IMAGE_DB.map(im => ({ ...im, products: Object.values(P).filter(p => p.img === im.pid || p.model?.toUpperCase() === im.model?.toUpperCase()).map(p => p.id) })),
    ...extra, ...productImages(context.products || []),
    ...(allMedia ? Object.keys(S) : context.solutions || []).flatMap(id => mediaPhotos('solution', id, S[id]?.name).map(im => ({ ...im, solutions: [id] }))),
    ...(allMedia ? Object.keys(C) : context.cases || []).flatMap(id => mediaPhotos('case', id, C[id]?.cust).map(im => ({ ...im, cases: [String(id)] })))];
  const by = new Map();
  for (const im of images) if (im.src) {
    const prev = by.get(im.src);
    by.set(im.src, prev ? { ...prev, ...im, products: [...new Set([...(prev.products || []), ...(im.products || [])])] } : im);
  }
  return [...by.values()];
}
export function useImageLibrary(context = {}) {
  const [state, setState] = useState(() => ({ images: library || [], loading: !library, error: '' }));
  useEffect(() => {
    let live = true;
    loadImageLibrary().then(images => { if (live) setState({ images, loading: false, error: '' }); }, e => { if (live) setState({ images: [], loading: false, error: e.message }); });
    return () => { live = false; };
  }, []);
  const key = JSON.stringify(context);
  const images = useMemo(() => imagePool(context, state.images, { allMedia: true }), [state.images, key]);
  return { ...state, images };
}
