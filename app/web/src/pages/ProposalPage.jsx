import React, { useState, useMemo, useEffect } from 'react';
import { update, loadUi, saveUi, getProposal, stageOf } from '../repositories/proposals.js';
import { Icon, toast } from '../components/common.jsx';
import { L, isCoverSheet } from '../services/catalog.js';
import { ReqPopup } from '../components/requirements.jsx';
import { StoryCanvas } from '../components/storyboard.jsx';
import { SpatialStudioPopup } from '../components/spatial-studio-popup.jsx';
import { MatchPopup } from '../components/ctxconfirm.jsx';
import { SpacePlanPopup } from '../components/space-plan.jsx';
import { LayoutChooser } from '../components/layout-compose.jsx';
import { startBirdseye, ensureBirdseye } from '../services/space-plan.js';
import { PartEditor } from '../components/parteditor.jsx';
import { PartAddPopup } from '../components/part-add.jsx';
import { LayoutPicker, LayoutDetail } from '../components/layouts.jsx';
import { Viewer, ExportModal, flatSlides } from '../components/viewer.jsx';
import { useStoryboardSharing, StoryboardSharing } from '../components/storyboard-sharing.jsx';
import { ReqView, MatchView, PartView } from './ScenariosPage.jsx';
import { TemplateDetail } from '../components/tplkit.jsx';
import { ensureLayoutContext } from '../services/layout-context.js';
import { resumeRequirementSummaryJob } from '../services/requirement-summary.js';
import { useWorkContext } from '../services/customer-voice-context.js';
import { StatusSlot } from '../components/feedback-popup.jsx';

export function ProposalScreen({ p, go }) {
  const sharing = useStoryboardSharing(p);
  useEffect(() => { ensureLayoutContext(p); }, [p.id]);
  const readOnly = !!p._share && !(sharing.snapshot?.canEdit ?? p._share.canEdit);
  useEffect(() => { if (!readOnly) resumeRequirementSummaryJob(p); }, [p.id, p.requirementSummary, readOnly]);
  // 조감도 장은 있는데 조감도가 없거나 공간 구성과 다르면 열 때 바로 만든다 · 있으면 아직 받지 못한 조감도 장에 넣는다(services/space-plan.js)
  useEffect(() => { if (!readOnly) ensureBirdseye(p.id); }, [p.id, readOnly]);
  const [modal, setModal] = useState(null);
  const ui0 = useMemo(() => loadUi(), []);
  const [viewer, setViewerRaw] = useState(!!ui0.viewer);
  const [cur, setCur] = useState(null);
  const setViewer = (v) => { setViewerRaw(v); saveUi({ ...loadUi(), viewer: v }); };
  const slides = flatSlides(p);
  const pages = useMemo(() => Object.fromEntries(slides.map((z) => [z.x.uid, z.n])), [slides.map((z) => z.x.uid).join()]);
  const pageOf = (u) => pages[u] || '';
  const open = (d) => { if (d.type === 'detail') setCur(d.uid); setModal(d); };
  const close = () => setModal(null);
  // one screen: Storyboard, built up in steps (store.js stageOf). A new proposal shows only the 고객 요구사항 bubble with its
  // popup open; 저장 there adds the 제품 · 솔루션 · 서비스 bubble and the 레이아웃 구성 bubble at once (요약은 뒤에서 계속).
  // 레이아웃 구성에서 구성(목차 템플릿)을 고르면 목차 버블이 놓이고 목차별 레이아웃 자동 구성이 시작된다.
  // One bubble popup at a time: pop = { t: 'req' } | { t: 'match', k, n } (k = kind to bring into view) | { t: 'space' } (공간 구성)
  // | { t: 'layout', tpl, n } (구성 고르기 모달 — tpl: 버블 카드에서 누른 구성의 상세, 없으면 전체 구성 보기).
  const stage = stageOf(p);
  const story = stage === 'story';
  const [pop, setPop] = useState(() => (stage === 'req' ? { t: 'req' } : null));
  const [studio, setStudio] = useState(null); // 매칭 카드의 3D 조감도를 눌러 연 조감도 스튜디오 팝업(spatial history id)
  useWorkContext('proposal', () => ({ id: p.id, stage, state: p, viewer, currentSheet: cur, modal, bubble: pop, readOnly }));
  useEffect(() => { if (readOnly) setModal(null); }, [readOnly]);
  const onReq = () => setPop((v) => (v && v.t === 'req' ? null : { t: 'req' }));
  const onMatch = (k) => setPop((v) => (v && v.t === 'match' && !k ? null : { t: 'match', k, n: Date.now() }));
  const onSpace = () => setPop((v) => (v && v.t === 'space' ? null : { t: 'space' }));
  const onLayout = (tpl) => setPop({ t: 'layout', tpl: typeof tpl === 'string' ? tpl : null, n: Date.now() });
  const reveal = (sel) => setTimeout(() => { const e = document.querySelector(sel); e && e.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }, 80);
  // 고객 요구사항 저장 → 팝업을 닫고 새로 생긴 매칭 · 레이아웃 구성 버블이 보이게
  const reqSaved = () => { setPop(null); reveal('.layout-node .lyt-under'); };
  // 구성을 고름 → 모달을 닫고 첫 목차 버블이 보이게
  const layoutApplied = () => { setPop(null); reveal('.board .col'); };
  // 조감도 만들기를 고르면 팝업을 모두 닫고, '공간 구성' 버튼이 '조감도 생성 중'을 보여 준다
  const onBirdseye = () => { setPop(null); setModal(null); void startBirdseye(p.id); };
  // PPT 레이아웃 opens on the 표지 (page 1 — the Storyboard does not show it); the 표지 note on the Storyboard opens that sheet
  const openViewer = (u) => { const c = slides.find((z) => isCoverSheet(z.x.f)); if (u || c) setCur(u || c.x.uid); setViewer(true); };

  const part = modal && modal.partId ? p.parts.find((s) => s.id === modal.partId) : null;
  return (
    <>
      <header className="topbar pr-top">
        <div className="pr-title">
          <label className="sr" htmlFor="pr-title">제안서 이름</label>
          <input id="pr-title" className="title-in" value={p.title} title={p.title} readOnly={readOnly} onChange={(e) => update(p.id, (d) => { d.title = e.target.value; })} onBlur={(e) => { if (!readOnly && !e.target.value.trim()) update(p.id, (d) => { d.title = '새 제안서'; }); }} />
        </div>
        {/* 작업 상태 — 이 화면의 진행 · 실패 · 완료 알림은 오른쪽 아래 팝업 대신 여기(가운데) 한 줄로 뜬다 */}
        <div className="pr-status"><StatusSlot root /></div>
          <div className="top-right">
            <StoryboardSharing p={p} sharing={sharing} go={go} />
            {story && (
            <button className="lay-toggle" aria-pressed={viewer} onClick={() => (viewer ? setViewer(false) : openViewer())} title={viewer ? 'PPT 레이아웃 패널 접기' : 'PPT 레이아웃 전체 보기 · PPTX 내보내기'}>
              <span className="lt-ic"><Icon name={viewer ? 'panelOff' : 'panel'} size={18} /></span>
              <span className="lt-t">
                <b>PPT 레이아웃</b>
                <span className="lt-sub num">{slides.length ? <>{slides.length}장</> : '아직 넣은 레이아웃이 없어요'}</span>
              </span>
              <Icon name={viewer ? 'chev' : 'chevL'} size={16} className="lt-chev" />
            </button>
            )}
          </div>
      </header>
      <div className="story">
        <StoryCanvas p={p} open={open} stage={stage} pop={pop} onReq={onReq} onMatch={onMatch} onSpace={onSpace} onLayout={onLayout} onOpenSpatial={(id) => setStudio(id)} readOnly={readOnly} activePart={readOnly && part ? part.id : null} viewerOpen={viewer} onOpenViewer={openViewer} pageOf={pageOf}>
          {pop && pop.t === 'req' && (readOnly ? <ReqView p={p} onClose={() => setPop(null)} /> : <ReqPopup p={p} onClose={() => setPop(null)} onSaved={reqSaved} />)}
          {pop && pop.t === 'match' && (readOnly ? <MatchView p={p} onClose={() => setPop(null)} /> : <MatchPopup p={p} focus={pop.k ? { k: pop.k, n: pop.n } : null} onClose={() => setPop(null)} onSaved={() => setPop(null)} />)}
          {pop && pop.t === 'space' && !readOnly && <SpacePlanPopup p={p} onClose={() => setPop(null)} onBirdseye={onBirdseye} />}
          {pop && pop.t === 'layout' && !readOnly && <LayoutChooser key={pop.n} p={p} tpl={pop.tpl} onClose={() => setPop(null)} onMatch={() => setPop({ t: 'match', n: Date.now() })} onApplied={layoutApplied} />}
          {readOnly && modal?.type === 'part' && part && <PartView p={p} part={part} pages={pages} onClose={close} onSheet={uid => { const s = p.parts.find(s => s.layouts.some(x => x.uid === uid)); open({ type: 'detail', partId: s.id, uid }); }} />}
        </StoryCanvas>
        {story && viewer && <Viewer p={p} readOnly={readOnly} cur={cur} setCur={setCur} onClose={() => setViewer(false)} onEdit={(partId, uid) => open({ type: 'detail', partId, uid })} onExport={() => open({ type: 'export' })} />}
      </div>
      {studio && !readOnly && <SpatialStudioPopup id={studio} onClose={() => setStudio(null)} go={go} />}
      {readOnly && modal?.type === 'detail' && <TemplateDetail list={slides.map(z => L[z.x.f])} ovs={slides.map(z => z.x.ov)} index={Math.max(0, slides.findIndex(z => z.x.uid === modal.uid))} onNav={i => open({ type: 'detail', partId: slides[i].s.id, uid: slides[i].x.uid })} onClose={close} />}
      {!readOnly && modal && modal.type === 'part' && part && <PartEditor key={part.id} p={p} part={part} isNew={modal.isNew} onClose={() => {
        // a brand-new part closed without a name or content is dropped
        if (modal.isNew) { const s = (getProposal(p.id) || p).parts.find((x) => x.id === part.id); if (s && !s.name.trim() && !s.items.length && !(s.text || '').trim()) update(p.id, (d) => { d.parts = d.parts.filter((x) => x.id !== part.id); }); }
        close();
      }} />}
      {/* 목차 추가 — 관리자 「전체 파트」 11개 중에서 고른다. DSS 가 없어 못 고르는 파트의 '추가'는 매칭 팝업을 그 폴더로 연다 */}
      {!readOnly && modal && modal.type === 'part-add' && <PartAddPopup p={p} at={modal.at} onClose={(id) => { close(); if (id) reveal('.board .col[data-pid="' + id + '"]'); }} onMatch={(k) => setPop({ t: 'match', k, n: Date.now() })} />}
      {!readOnly && modal && modal.type === 'picker' && part && <LayoutPicker p={p} partId={part.id} mode={modal.mode} onClose={close} />}
      {!readOnly && modal && modal.type === 'detail' && part && <LayoutDetail p={p} partId={part.id} uid={modal.uid} onClose={close} open={open} pageNo={pageOf(modal.uid)} />}
      {!readOnly && modal && modal.type === 'export' && <ExportModal p={p} onClose={close} />}
    </>
  );
}
