// 레이아웃 상세 — 시트의 이미지 칸을 누르면 그 옆에 뜨는 팝업: 지금 이미지 · 관련 이미지(사진 라이브러리, admin/layout_images.py) · 검색.
//   고르면 시트에 바로 보이고(draft-preview) 상세의 '수정 반영'으로 저장된다. 목록은 팝업을 연 때의 이미지 기준이라 골라도 자리가 섞이지 않는다.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, number } from './api';
import { Button, ErrorBox } from './components';
import { Glyph, LOCK, UNLOCK } from './layout-regions.jsx';
import './layout-images.css';

const enc = encodeURIComponent;
const X = 'M6 6l12 12M18 6 6 18', SEARCH = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4', BACK = 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3';
const W = 600, GAP = 12;
export const imageUrl = (f, src) => `/admin/api/layout-library/${enc(f)}/images/file?src=${enc(src)}`;
const blank = src => !src || src.startsWith('data:');

export function ImagePicker({ f, slot, src, original, ratio, rect, readOnly, fixed, onFixed, onPick, close }) {
  const ref = useRef(null), [anchor] = useState(src);
  const [q, setQ] = useState(''), [query, setQuery] = useState(''), [list, setList] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [place, setPlace] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const asked = useRef('');
  async function load(offset = 0) {
    const q = query; asked.current = q;
    setBusy(true); setError('');
    try {
      const r = await api(`/layout-library/${enc(f)}/images/${enc(slot.id)}?src=${enc(anchor || '')}&ratio=${ratio ? ratio.toFixed(3) : 0}&q=${enc(q)}&offset=${offset}`);
      if (asked.current !== q) return;   // 그 사이 검색어가 바뀜
      setList(prev => offset && prev ? { ...r, q, items: [...prev.items, ...r.items] } : { ...r, q });
    } catch (e) { if (asked.current === q) setError(e.message); } finally { if (asked.current === q) setBusy(false); }
  }
  useEffect(() => { load(0); }, [query]);
  useEffect(() => {
    const down = e => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.lr-hit, .lr-lockbtn')) close(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
    document.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, []);
  // 이미지 오른쪽(자리가 없으면 왼쪽)에, 화면 안으로
  useLayoutEffect(() => {
    const h = ref.current.offsetHeight, w = Math.min(W, innerWidth - 16);
    const left = rect.right + GAP + w <= innerWidth - 8 ? rect.right + GAP : rect.left - GAP - w >= 8 ? rect.left - GAP - w : Math.max(8, innerWidth - w - 8);
    setPlace({ left, top: Math.max(8, Math.min(rect.top, innerHeight - h - 8)), width: w });
  }, [rect.top, rect.left, !!list]);
  const cur = list?.current, changed = src !== original;
  return <div ref={ref} className="li-pop" role="dialog" aria-label={`이미지 ${slot.id}`} style={place || { left: -9999, top: 0, width: W }}>
    <header>
      <span className="li-now">{blank(src) ? <i/> : <img src={imageUrl(f, src)} alt=""/>}</span>
      <div><strong>이미지 {slot.id}</strong><small title={cur?.desc}>{src === anchor ? cur?.desc || slot.label : list?.items.find(x => x.src === src)?.desc || src}</small></div>
      {!readOnly && <div className="li-mode" role="group" aria-label="AI 채움">
        <button type="button" aria-pressed={!fixed} onClick={() => fixed && onFixed(false)}><Glyph d={UNLOCK} size={11}/>AI 작성</button>
        <button type="button" aria-pressed={fixed} onClick={() => !fixed && onFixed(true)}><Glyph d={LOCK} size={11}/>AI 잠금</button></div>}
      <button type="button" className="li-x" aria-label="이미지 팝업 닫기" onClick={close}><Glyph d={X} size={13}/></button>
    </header>
    {cur && src === anchor && (cur.kind || cur.industries.length || cur.spaces.length || cur.w) && <p className="li-meta">
      {[cur.kind, ...cur.industries.slice(0, 1), ...cur.spaces.slice(0, 1), cur.w && `${cur.w}×${cur.h}`].filter(Boolean).map((x, k) => <span key={k}>{x}</span>)}</p>}
    <div className="li-bar">
      <label className="li-search"><Glyph d={SEARCH} size={13}/><input aria-label="이미지 검색" placeholder="이미지 검색" value={q} onChange={e => setQ(e.target.value)}/></label>
      <span className="li-count">{list?.q ? '검색' : '관련'} {number(list?.total || 0)}</span>
      {changed && !readOnly && <Button onClick={() => onPick(original)}><Glyph d={BACK} size={12}/>원래 이미지</Button>}
    </div>
    {error && <ErrorBox error={error} retry={() => load(0)}/>}
    <div className="li-grid" aria-busy={busy}>
      {(list?.items || []).map(x => <button key={x.src} type="button" className={'li-item' + (x.src === src ? ' on' : '')} disabled={readOnly} aria-pressed={x.src === src}
        title={[x.desc, x.cust, x.why.join(' · ')].filter(Boolean).join('\n')} aria-label={x.desc || x.src} onClick={() => onPick(x.src)}>
        <img src={imageUrl(f, x.src)} alt="" loading="lazy"/>
        {x.why[0] && <span className="li-why">{x.why[0]}</span>}
      </button>)}
      {list && !list.items.length && !busy && <p className="li-empty">{list.q ? '찾은 이미지 없음' : '관련 이미지 없음'}</p>}
    </div>
    {list && list.items.length < list.total && <div className="li-more"><Button busy={busy} onClick={() => load(list.items.length)}>더 보기</Button></div>}
  </div>;
}
