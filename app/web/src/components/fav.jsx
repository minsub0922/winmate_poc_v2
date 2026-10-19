import React from 'react';
import { toast } from './common.jsx';
import { useFavs, favOf, toggleFav } from '../repositories/favorites.js';

/** 찜 heart — works on any layout view. ov: the sheet's values (a filled sheet and the empty layout are different favourites).
 *  Sits inside clickable cards, so it never lets the press through to the card. */
export function FavButton({ f, ov = null, from = '', className = '', label = false }) {
  useFavs();
  const on = !!favOf(f, ov);
  const act = (e) => {
    e.preventDefault(); e.stopPropagation();
    const x = toggleFav(f, ov, from);
    toast(x ? (x.filled ? '값이 채워진 장으로 찜했어요 · My › 찜' : '빈 레이아웃으로 찜했어요 · My › 찜') : '찜을 풀었어요');
  };
  const stop = (e) => e.stopPropagation();
  const tip = on ? '찜 풀기' : '찜하기';
  return (
    <span role="button" tabIndex={0} className={'fav-btn' + (on ? ' on' : '') + (label ? ' lbl' : '') + (className ? ' ' + className : '')} aria-pressed={on} aria-label={tip} title={tip}
      data-fav={f}
      onClick={act} onPointerDown={stop} onMouseDown={stop} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') act(e); else stop(e); }}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      {label ? <span>{on ? '찜함' : '찜'}</span> : null}
    </span>
  );
}
