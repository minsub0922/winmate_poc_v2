import React, { useState } from 'react';
import { Icon, Modal } from './common.jsx';
import { P } from '../services/catalog.js';
import { Thumb } from './Thumbs.jsx';
import { ContextExplorer } from './ctxexplorer.jsx';
import { tagHoverProps } from './tagcard.jsx';

/* =========================================================
   Shared filter UI — PPT 레이아웃 템플릿 · Best Scenario use the same pieces, so both pages look and behave alike:
   FilterBar   검색창 아래 '필터' 버튼 + 오른쪽에 적용한 필터 칩(× 로 하나씩 빼기 · 모두 지우기)
   FilterPopup 필터 팝업 하나 — 위에서 아래로 단계(FStep), 칩마다 남는 수, ‘N장 보기’ / ‘N개 보기’를 눌러야 적용
   FStep · FChip · FAll   단계 · 칩 · ‘전체’ 칩
   FProducts   고른 제품 칩 + ‘제품 찾기’ → 디렉토리 탐색기 팝업(ctxexplorer filter 모드) + 많이 쓰인 제품
   unit = { noun: '레이아웃', n: '장' } | { noun: '시나리오', n: '개' } — 숫자 옆 단위와 안내 문구
   ========================================================= */

export const LAYOUT_UNIT = { noun: '레이아웃', n: '장' };
export const SCENARIO_UNIT = { noun: '시나리오', n: '개' };

/** comma-joined product ids → the ones that exist (a filter can hold several — any of them) */
export const idList = (v) => String(v || '').split(',').filter((id) => P[id]);

/** '필터' button + the active filters as removable chips (sits under the search box)
 *  active: [{ k, head, value, label }] · extra: a button right after '필터' (PPT 레이아웃 템플릿: My) */
export function FilterBar({ active, onOpen, onRemove, onClearAll, extra = null }) {
  return (
    <div className="tl-frow">
      <button className={'btn tl-fbtn' + (active.length ? ' on' : '')} onClick={onOpen} aria-haspopup="dialog">
        <Icon name="sliders" size={15} />필터{active.length ? <span className="tl-fn num">{active.length}</span> : null}
      </button>
      {extra}
      {active.length > 0 && (
        <div className="tl-on" aria-label="적용한 필터">
          {active.map((a) => (
            <button key={a.k} className="tl-onchip" onClick={() => onRemove(a)} aria-label={a.label + ' 필터 빼기'}>
              <span className="k">{a.head}</span><b>{a.value}</b><Icon name="x" size={12} />
            </button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={onClearAll}>모두 지우기</button>
        </div>
      )}
    </div>
  );
}

/** the popup frame — title, how to read it, steps (children), 모두 지우기 · 닫기 · N장 보기 */
export function FilterPopup({ unit = LAYOUT_UNIT, n, canReset, onReset, onApply, onClose, children }) {
  return (
    <Modal size="tlf" title="필터" sub={'위에서부터 차례로 골라 보세요. 숫자는 다른 조건을 그대로 둘 때 남는 ' + unit.noun + ' 수예요.'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" disabled={!canReset} onClick={onReset}><Icon name="refresh" size={14} />모두 지우기</button>
        <span className="sp" />
        <button className="btn" onClick={onClose}>닫기</button>
        <button className="btn btn-primary tlf-go" data-autofocus disabled={!n} onClick={onApply}><b className="num">{n}</b>{unit.n} 보기</button>
      </>}>
      {children}
    </Modal>
  );
}

/** one step: number · title · hint, then its chips */
export function FStep({ no, title, hint, children }) {
  return (
    <section className="tlf-step">
      <div className="tlf-h"><span className="tlf-no num">{no}</span><h3>{title}</h3>{hint ? <span className="tlf-hint">{hint}</span> : null}</div>
      <div className="tlf-body">{children}</div>
    </section>
  );
}

/** one choice: pressed = selected; with nothing left (n = 0) it can't be picked unless it already is */
export function FChip({ on, n, onClick, pre, cls, title, children, peek, r }) {
  return (
    <button className={'tlf-chip' + (cls ? ' ' + cls : '')} aria-pressed={on} disabled={!n && !on} title={peek && r ? undefined : title}
      {...tagHoverProps(r ? peek : null, r)} onClick={() => { peek?.hide(); onClick(); }}>
      {pre}{children}<span className="num">{n || 0}</span>
    </button>
  );
}

/** '전체' — clears that step */
export function FAll({ on, n, onClick }) {
  return <button className="tlf-chip all" aria-pressed={on} onClick={onClick}>전체<span className="num">{n}</span></button>;
}

/** 제품 step body — chosen products (× to drop), '제품 찾기' (folders · search popup), the most used ones as quick chips
 *  ids: chosen · counts: { id: n left } · used: ids worth offering (they appear somewhere) */
export function FProducts({ ids, counts, used, unit = LAYOUT_UNIT, onChange, peek }) {
  const [ex, setEx] = useState(false);
  const top = used.filter((id) => counts[id] && !ids.includes(id)).sort((a, b) => counts[b] - counts[a]).slice(0, 6);
  return (
    <>
      <div className="tlf-chips">
        {ids.map((id) => (
          <span key={id} className="tlf-prod on" tabIndex={peek ? 0 : undefined} {...tagHoverProps(peek, 'product:' + id)}><Thumb r={'product:' + id} mini className="tlf-th" /><b>{P[id].model}</b><span className="faint">{P[id].cat}</span><span className="num">{counts[id] || 0}</span>
            <button type="button" onClick={() => { peek?.hide(); onChange(ids.filter((x) => x !== id)); }} aria-label={P[id].model + ' 빼기'}><Icon name="x" size={12} /></button></span>
        ))}
        <button type="button" className="tlf-chip tlf-find" onClick={() => { peek?.hide(); setEx(true); }}><Icon name="search" size={13} />{ids.length ? '제품 더 찾기' : '제품 찾기'}<span className="faint">폴더 · 검색</span></button>
      </div>
      {top.length > 0 && (
        <div className="tlf-sub"><span className="tlf-cat">많이 쓰인 제품</span>
          <div className="tlf-chips">{top.map((id) => (
            <button key={id} type="button" className="tlf-chip" {...tagHoverProps(peek, 'product:' + id)} onClick={() => { peek?.hide(); onChange([...ids, id]); }}><Thumb r={'product:' + id} mini className="tlf-th" />{P[id].model}<span className="num">{counts[id]}</span></button>
          ))}</div>
        </div>
      )}
      {ex && <ContextExplorer p={null} kind="products" start="all" filter={{ selected: ids.map((id) => 'product:' + id), only: used.map((id) => 'product:' + id), noun: unit.noun, unit: unit.n,
        counts: Object.fromEntries(Object.entries(counts).map(([id, n]) => ['product:' + id, n])), onApply: (refs) => onChange(refs.map((r) => r.split(':')[1])) }} onClose={() => setEx(false)} />}
    </>
  );
}
