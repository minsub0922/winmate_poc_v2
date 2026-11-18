// 시트(장표 한 장) 상세 팝업 — 모든 화면이 같은 틀 하나를 쓴다.
//   왼쪽: 큰 장표 — 팝업 안에서 가로 · 세로 모두 맞춰 들어가는 가장 큰 크기(기본 16:9)
//   오른쪽: 화면마다 다른 패널 (템플릿 · 샘플 버티컬 시나리오 = 메타데이터 / Storyboard = 편집 · 근거 / 제안서 검토 = 짚은 문제)
//   아래: 이전 · 다음(← → 키) + 화면마다 다른 버튼
//   panelLabel 을 주면 오른쪽 패널은 접힌 채로 열리고, 장표 위 도구줄의 버튼으로 펼친다 (접힌 동안 장표가 전체 너비를 쓴다).
// 쓰는 곳: tplkit.jsx TemplateDetail(PPT 레이아웃 템플릿 · 샘플 버티컬 시나리오) · detail.jsx LayoutDetail(Storyboard) · review.jsx UnitModal(제안서 검토)
import React, { useRef, useState, useLayoutEffect, useEffect, useId } from 'react';
import { Icon, Modal } from './common.jsx';
import { SampleMark } from './sample-ribbon.jsx';

/** the biggest width that fits the stage box at this aspect (w / h). With no fixed height (phones: stacked) it is the box width.
 *  목차 템플릿 상세의 큰 장도 이 계산을 같이 쓴다. */
export function useFitWidth(ref, aspect) {
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
 * @param panelLabel  when set, the right panel starts collapsed and this labelled button (in the top-right controls) expands it
 * @param bodyClass · stageClass · panelClass  page hooks for styles and tests
 * @param sample  true = 이 장은 아직 제안서 값이 아닌 견본 — 오른쪽 위 '샘플 자료' 띠 (sample-ribbon.jsx). 넘기지 않으면(undefined) 장을 감싸지도 않는다
 */
export function SheetView({ title, sub, onClose, stage, stageTop = null, stageActions = null, aspect = 16 / 9, panel, panelRef, index = 0, total = 1, onNav, footerStart = null, actions = null,
  bodyClass = '', stageClass = '', panelClass = '', panelLabel = null, onStageMouseDown, sample, children }) {
  const fitRef = useRef(null);
  const [panelOpen, setPanelOpen] = useState(!panelLabel);
  const panelId = useId();
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
    <Modal size="sheet" onClose={onClose} title={title} sub={sub} bodyClass={('sv ' + bodyClass + (panelOpen ? '' : ' sv-panel-closed')).trim()}
      footer={<>
        {footerStart}
        {onNav && total > 1 ? (
          <div className="sv-nav">
            <button className="btn btn-sm btn-icon" disabled={!can(-1)} onClick={() => go(-1)} aria-label="이전 장"><Icon name="chevL" size={15} /></button>
            <span className="note num">{index + 1} / {total}</span>
            <button className="btn btn-sm btn-icon" disabled={!can(1)} onClick={() => go(1)} aria-label="다음 장"><Icon name="chev" size={15} /></button>
          </div>
        ) : null}
        <span className="sp" />
        {actions && <div className="sv-footer-actions">{actions}</div>}
      </>}>
      <div className={('sv-stage ' + stageClass).trim()} onMouseDown={onStageMouseDown}>
        {(stageTop || stageActions || panelLabel) && <div className="sv-stage-toolbar">
          {stageTop && <div className="sv-stage-hint">{stageTop}</div>}
          {(stageActions || panelLabel) && <div className="sv-stage-actions" role="toolbar" aria-label="레이아웃 작업">
            {stageActions}
            {panelLabel && <button type="button" className={'btn sv-panel-toggle' + (panelOpen ? ' on' : '')} aria-expanded={panelOpen} aria-controls={panelId} onClick={() => setPanelOpen((v) => !v)}>
              <Icon name="info" size={15} />{panelLabel}<Icon name={panelOpen ? 'chevU' : 'chevD'} size={14} />
            </button>}
          </div>}
        </div>}
        <div ref={fitRef} className="sv-fit">{w > 0 ? (sample == null ? stage(w) : <SampleMark on={!!sample}>{stage(w)}</SampleMark>) : null}</div>
      </div>
      <div ref={panelRef} id={panelId} className={('sv-panel ' + panelClass).trim()} hidden={!panelOpen}>{panelOpen ? panel : null}</div>
      {children}
    </Modal>
  );
}
