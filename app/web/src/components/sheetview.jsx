// 시트(장표 한 장) 상세 팝업 — 모든 화면이 같은 틀 하나를 쓴다.
//   왼쪽: 큰 장표 — 팝업 안에서 가로 · 세로 모두 맞춰 들어가는 가장 큰 크기(기본 16:9)
//   오른쪽: 화면마다 다른 패널 (템플릿 · Best Scenario = 메타데이터 / Storyboard = 편집 · 근거 / 제안서 검토 = 짚은 문제)
//   아래: 이전 · 다음(← → 키) + 화면마다 다른 버튼
// 쓰는 곳: tplkit.jsx TemplateDetail(PPT 레이아웃 템플릿 · Best Scenario) · detail.jsx LayoutDetail(Storyboard) · review.jsx UnitModal(제안서 검토)
import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { Icon, Modal } from './common.jsx';

/** the biggest width that fits the stage box at this aspect (w / h). With no fixed height (phones: stacked) it is the box width. */
function useFitWidth(ref, aspect) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const byH = r.height > 60 ? r.height * aspect : Infinity;
      setW(Math.max(0, Math.floor(Math.min(r.width, byH))));
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);
  return w;
}

/**
 * @param stage   (width) => node — the sheet at the given pixel width (Slide, image …)
 * @param panel   right panel
 * @param index · total · onNav(i)  page position; ← → keys and the footer arrows move through it
 * @param footerStart · actions     extra footer buttons (left of the arrows · right end)
 * @param stageTop  node above the sheet (e.g. editing hints)
 * @param stageActions  persistent top-right controls for the layout preview
 * @param bodyClass · stageClass · panelClass  page hooks for styles and tests
 */
export function SheetView({ title, sub, onClose, stage, stageTop = null, stageActions = null, aspect = 16 / 9, panel, panelRef, index = 0, total = 1, onNav, footerStart = null, actions = null,
  bodyClass = '', stageClass = '', panelClass = '', onStageMouseDown, children }) {
  const fitRef = useRef(null);
  const w = useFitWidth(fitRef, aspect || 16 / 9);
  const can = (d) => !!onNav && index + d >= 0 && index + d < total;
  const go = (d) => { if (can(d)) onNav(index + d); };
  const goRef = useRef(go); goRef.current = go;
  useEffect(() => {
    if (!onNav) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return; // typing in the sheet or the panel
      if (e.key === 'ArrowLeft') { e.preventDefault(); goRef.current(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goRef.current(1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [!!onNav]);
  return (
    <Modal size="sheet" onClose={onClose} title={title} sub={sub} bodyClass={('sv ' + bodyClass).trim()}
      footer={<>
        {footerStart}
        {onNav && total > 1 ? (
          <div className="sv-nav">
            <button className="btn btn-sm btn-icon" disabled={!can(-1)} onClick={() => go(-1)} aria-label="이전 장"><Icon name="chevL" size={15} /></button>
            <span className="note num">{index + 1} / {total}</span>
            <button className="btn btn-sm btn-icon" disabled={!can(1)} onClick={() => go(1)} aria-label="다음 장"><Icon name="chev" size={15} /></button>
            <span className="sv-keys">← → 키로 넘겨 보기</span>
          </div>
        ) : null}
        <span className="sp" />
        {actions && <div className="sv-footer-actions">{actions}</div>}
      </>}>
      <div className={('sv-stage ' + stageClass).trim()} onMouseDown={onStageMouseDown}>
        {(stageTop || stageActions) && <div className="sv-stage-toolbar">
          {stageTop && <div className="sv-stage-hint">{stageTop}</div>}
          {stageActions && <div className="sv-stage-actions" role="toolbar" aria-label="레이아웃 작업">{stageActions}</div>}
        </div>}
        <div ref={fitRef} className="sv-fit">{w > 0 ? stage(w) : null}</div>
      </div>
      <div ref={panelRef} className={('sv-panel ' + panelClass).trim()}>{panel}</div>
      {children}
    </Modal>
  );
}
