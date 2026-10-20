// Real catalog thumbnails. Loading and failures use the shared image state, never mock artwork.
import React from 'react';
import IMAGES from '../../../data/images.json' with { type: 'json' };
import { P, S, C } from '../services/catalog.js';
import { PImg } from '../services/products.js';
import { mediaThumb } from '../services/media.js';

const PIDS = IMAGES.pids;
const CASE_IMG = { 1490: 'case.mcd.menuboard' };

export function photoOf(type, id) {
  const pid = type === 'product' ? P[id] && P[id].img : type === 'solution' ? S[id] && S[id].img : type === 'case' ? CASE_IMG[id] : null;
  const v = pid && PIDS[pid];
  if (!v) return null;
  return { src: v.file, cut: v.kind === 'cut', white: v.kind === 'cut' && /\.jpe?g$/i.test(v.file), desc: v.desc };
}

export function Thumb({ r, mini = false, className = '' }) {
  const [type, id] = String(r).split(':');
  const photo = photoOf(type, id);
  const product = type === 'product' ? P[id] : null;
  const source = photo?.src || product?.th || product?.gal?.[0] || ((type === 'solution' || type === 'case') ? mediaThumb(type, id) : null);
  const kind = photo ? photo.cut ? 'cut' : 'photo' : product ? product.thK === 's' ? 'photo' : 'cut' : 'photo';
  const name = photo?.desc || product?.name || S[id]?.name || C[id]?.cust || '';
  const cls = ['thumb', type, mini ? 'mini' : '', kind, photo?.white || product?.thK === 'w' ? 'white' : '', className].filter(Boolean).join(' ');
  return <div className={cls} data-catalog-ref={r}><PImg key={source || r} src={source} alt={name} loading="lazy" draggable={false} compact={mini} /></div>;
}

/** Up to three overlapping mini thumbnails (top-bar context buttons). */
export function ThumbStack({ refs, max = 3 }) {
  const list = refs.slice(0, max);
  if (!list.length) return null;
  return <span className="tstack" aria-hidden="true">{list.map(r => <Thumb key={r} r={r} mini />)}</span>;
}
