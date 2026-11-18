import { useEffect, useMemo, useState } from 'react';
import { fetchResource } from '../api/client.js';
import { IMAGE_DB, P, S, C } from './catalog.js';
import { mediaPhotos } from './media.js';
import { registerRanges } from './packs.js';
import { offSet } from '../api/resource-switches.js';
import PROPOSAL_PHOTOS from '../domain/templates/proposal_photo_assets.json' with { type: 'json' };
import ACCOUNT_PHOTOS from '../domain/templates/account_photo_assets.json' with { type: 'json' };

// Where a venue photo was taken, as an industry code (catalog INDUSTRIES). Catalog photos carry it in their id
// ('ph.<업종>-…'), proposal · account photos in their asset record, case photos through the case.
const PHOTO_IND = new Map([...PROPOSAL_PHOTOS, ...ACCOUNT_PHOTOS].map(v => [v.pid, v.ind || '']));
const PID_IND = { fb: 'FB', rt: 'RT', sv: 'SV', ht: 'HT', tp: 'TP', vn: 'VN', ad: 'AD', of: 'OF', rs: 'RS', id: 'ID', ed: 'ED', pb: 'PB', md: 'MD', mf: 'MF', fn: 'FN', oe: 'OE' };
export const imageIndustry = im => im?.ind || PHOTO_IND.get(im?.pid) || PID_IND[/^ph\.([a-z]{2})-/.exec(im?.pid || '')?.[1]] || C[im?.cases?.[0]]?.ind || '';

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
    // 관리자가 끈 사진은 고르는 목록에서 뺀다(이미 장에 넣은 사진은 그대로 그린다)
    library = data.images.filter(o => !offSet('image').has(o.i)).map(o => ({ pid: o.i, src: o.a, products: o.p || [], models: o.m || [],
      model: (o.p || []).map(id => P[id]?.model).filter(Boolean).join(' · '),
      desc: o.d || o.t, title: o.t, note: o.c, spaces: o.sp || [], page: o.pg, orig: o.u,
      group: o.k === 'cut' || o.k === 'detail' ? 'cut' : o.k === 'screen' || o.k === 'diagram' ? 'ui' : 'life',
      shot: o.k, groupName: LABEL[o.k] || '제품 이미지', w: o.w, h: o.h }));
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
/** `industry`: also offer the photos of every case in that industry (venue scenes for the customer's own kind of place). */
export function imagePool(context = {}, extra = [], { allMedia = false, industry = '' } = {}) {
  const cases = allMedia ? Object.keys(C) : [...new Set([...(context.cases || []).map(String), ...(industry ? Object.keys(C).filter(id => C[id].ind === industry) : [])])];
  const images = [...IMAGE_DB.map(im => ({ ...im, ind: imageIndustry(im), products: Object.values(P).filter(p => p.img === im.pid || p.model?.toUpperCase() === im.model?.toUpperCase()).map(p => p.id) })),
    ...extra, ...productImages(context.products || []),
    ...(allMedia ? Object.keys(S) : context.solutions || []).flatMap(id => mediaPhotos('solution', id, S[id]?.name).map(im => ({ ...im, solutions: [id] }))),
    ...cases.flatMap(id => mediaPhotos('case', id, C[id]?.cust).map(im => ({ ...im, cases: [String(id)], ind: C[id]?.ind || '' })))];
  const by = new Map();
  const disabled = offSet('image');
  for (const im of images) if (im.src && !disabled.has('composer/' + im.src)) {
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
