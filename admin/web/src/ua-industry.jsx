// 「전체 파트」 팝업 — 업종 묶음마다 항목 · 장이 다른 파트 (당사의 이해)
//   파트 이름 오른쪽 드롭다운으로 업종 묶음을 고르면 그 묶음의 이해 항목(간지 + 항목마다 새 장)으로 카드가 통째로 바뀐다.
//   자료 · 규칙은 ua-sectors.js, 장은 ua-catalog.json(build/toc/gen_ua_catalog.py) — 화면 번들에 함께 실려 있어 서버에 다시 묻지 않는다.
//   드롭다운 · 묶음 한 줄의 모양은 Overview 의 업종 드롭다운(overview-industry.css .lpx-ind)과 같다 — 클래스는 따로 둔다(.lpx-sector · .lpx-sector-note): 두 파트의 규칙 · 검사가 서로 얽히지 않게.
import React, { useEffect, useMemo, useState } from 'react';
import { addLocalPreviews } from './local-previews.js';
import { sectorBook, withSector } from './ua-sectors.js';
import './ua-industry.css';

export { withSector };

let book = null; let pending = null;
export function loadSectorBook() {
  if (!pending) {
    pending = import('./ua-catalog.json', { with: { type: 'json' } }).then(m => { book = sectorBook(m.default || m); return book; });
    pending.catch(() => { pending = null; });
  }
  return pending;
}
// 새 장(L_TOC_UA_*)의 미리보기는 서버가 아니라 여기서 준다 — 장표 틀(LayoutFrame) · 크게 보기 · 사진 겹침 점검이 그대로 쓴다
addLocalPreviews(f => (book ? book.preview(f) : null));

/**
 * 업종 묶음마다 항목이 다른 파트(part.sector)의 상태 — { book, id, pick(id), names } · 그런 파트가 아니면 null (자료를 받는 중이면 book 이 null)
 *   names: 업종 id → 이름(묶음에 든 세부 업종을 보여 줄 때)
 */
export function useSector(K, part) {
  const on = !!(part && part.sector);
  const [data, setData] = useState(book);
  const [id, setId] = useState('');
  useEffect(() => {
    if (!on || data) return undefined;
    let alive = true;
    loadSectorBook().then(b => alive && setData(b), () => {});
    return () => { alive = false; };
  }, [on, data]);
  const names = useMemo(() => (on ? Object.fromEntries(K.toc.tocVerticals().map(v => [v.id, v.nm])) : {}), [K, on]);
  return useMemo(() => (on ? { book: data, id: (data && (data.byId[id] ? id : data.clusters[0] && data.clusters[0].id)) || '', pick: setId, names } : null), [on, data, id, names]);
}

/** 파트 이름 오른쪽 — 업종 묶음 드롭다운 */
export function SectorSelect({ state, partName }) {
  if (!state.book) return null;
  return <label className="lpx-sector">
    <span>업종</span>
    <select value={state.id} aria-label={partName + ' 업종 선택'} onChange={e => state.pick(e.target.value)}>
      {state.book.clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  </label>;
}
/** 고른 묶음 한 줄 — 그 묶음에 드는 세부 업종 이름과 장 수(이해 항목 · 경쟁 우위)만(설명 글은 두지 않는다 — 사용자 지시 2026-11-16 "불필요한 부연설명 다 지워") */
export function SectorNote({ part }) {
  const c = part.cluster;
  if (!c) return null;
  return <p className="lpx-sector-note" data-sector={c.id}>
    <b>{c.name}</b>
    <span>{c.verticals.map(v => v.nm).join(' · ')}</span>
    <i>이해 항목 {part.slots.filter(x => x.sector && x.group !== 'compete').length} · 경쟁 우위 {part.slots.filter(x => x.group === 'compete').length}</i>
  </p>;
}
