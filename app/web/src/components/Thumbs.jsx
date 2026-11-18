// Real catalog thumbnails. Loading and failures use the shared image state, never mock artwork.
import React from 'react';
import IMAGES from '../../../data/images.json' with { type: 'json' };
import { P, S, C, SUB } from '../services/catalog.js';
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

// 구독 — 패키지는 제 사진, 나머지는 유형마다 구독 장의 기본 사진(app/web/public/assets/subs)
const SUB_PHOTO = { program: 'kv-grid', care: 'val-dorm', 'care-option': 'care-2', promotion: 'kv-grid', payment: 'val-office' };
const subPhoto = (id) => { const x = SUB[id]; if (!x) return null; const src = x.photo || (SUB_PHOTO[x.type] ? '/assets/subs/' + SUB_PHOTO[x.type] + '.webp' : null); return src ? { src, cut: false, white: false, desc: x.name } : null; };
export function Thumb({ r, mini = false, className = '' }) {
  const [type, id] = String(r).split(':');
  const photo = type === 'subscription' ? subPhoto(id) : photoOf(type, id);
  const product = type === 'product' ? P[id] : type === 'solution' && S[id] && S[id].row ? P[id] : null;   // (제품 DB 의 솔루션 · 서비스 행 — 그 행의 사진)
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
