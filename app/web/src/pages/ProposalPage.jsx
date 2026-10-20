import React, { useState, useMemo, useEffect } from 'react';
import { update, loadUi, saveUi, getProposal, stageOf } from '../repositories/proposals.js';
import { Icon, toast } from '../components/common.jsx';
import { L, isCoverSheet } from '../services/catalog.js';
import { ReqPopup } from '../components/requirements.jsx';
import { StoryCanvas } from '../components/storyboard.jsx';
import { MatchPopup } from '../components/ctxconfirm.jsx';
import { PartEditor } from '../components/parteditor.jsx';
import { LayoutPicker, LayoutDetail } from '../components/layouts.jsx';
import { Viewer, ExportModal, flatSlides } from '../components/viewer.jsx';
import { useStoryboardSharing, StoryboardSharing } from '../components/storyboard-sharing.jsx';
import { ReqView, MatchView, PartView } from './ScenariosPage.jsx';
import { TemplateDetail } from '../components/tplkit.jsx';
import { ensureLayoutContext, layoutIsComplete } from '../services/layout-context.js';
import { resumeRequirementSummaryJob } from '../services/requirement-summary.js';
import { useWorkContext } from '../services/customer-voice-context.js';

export function ProposalScreen({ p, go }) {
  const sharing = useStoryboardSharing(p);
  useEffect(() => { ensureLayoutContext(p); }, [p.id]);
  const readOnly = !!p._share && !(sharing.snapshot?.canEdit ?? p._share.canEdit);
  useEffect(() => { if (!readOnly) resumeRequirementSummaryJob(p); }, [p.id, p.requirementSummary, readOnly]);
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
  // popup open; 저장 there adds the 제품 · 솔루션 매칭 bubble and opens its popup; 저장 there starts the parts.
  // One bubble popup at a time: pop = { t: 'req' } | { t: 'match', k, n } (k = kind to bring into view).
  const stage = stageOf(p);
  const story = stage === 'story';
  const [pop, setPop] = useState(() => (stage === 'req' ? { t: 'req' } : stage === 'match' ? { t: 'match' } : null));
  useWorkContext('proposal', () => ({ id: p.id, stage, state: p, viewer, currentSheet: cur, modal, bubble: pop, readOnly }));
  useEffect(() => { if (readOnly) setModal(null); }, [readOnly]);
  const nDone = slides.filter((z) => layoutIsComplete(p, z.x)).length;
  const onReq = () => setPop((v) => (v && v.t === 'req' ? null : { t: 'req' }));
  const onMatch = (k) => setPop((v) => (v && v.t === 'match' && !k ? null : { t: 'match', k, n: Date.now() }));
  // PPT 레이아웃 opens on the 표지 (page 1 — the Storyboard does not show it); the 표지 note on the Storyboard opens that sheet
  const openViewer = (u) => { const c = slides.find((z) => isCoverSheet(z.x.f)); if (u || c) setCur(u || c.x.uid); setViewer(true); };
  const partsStarted = () => { setPop(null); setTimeout(() => { const e = document.querySelector('.end-node .end-plus'); e && e.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }, 60); };

  const part = modal && modal.partId ? p.parts.find((s) => s.id === modal.partId) : null;
  return (
    <>
      <header className="topbar">
        <label className="sr" htmlFor="pr-title">제안서 이름</label>
        <input id="pr-title" className="title-in" value={p.title} readOnly={readOnly} onChange={(e) => update(p.id, (d) => { d.title = e.target.value; })} onBlur={(e) => { if (!readOnly && !e.target.value.trim()) update(p.id, (d) => { d.title = '새 제안서'; }); }} />
          <div className="top-right">
            <StoryboardSharing p={p} sharing={sharing} go={go} />
            {story && (
            <button className="lay-toggle" aria-pressed={viewer} onClick={() => (viewer ? setViewer(false) : openViewer())} title={viewer ? 'PPT 레이아웃 패널 접기' : 'PPT 레이아웃 전체 보기 · PPTX 내보내기'}>
              <span className="lt-ic"><Icon name={viewer ? 'panelOff' : 'panel'} size={18} /></span>
              <span className="lt-t">
                <b>PPT 레이아웃</b>
                <span className="lt-sub num">{slides.length ? <>{slides.length}장 · 완료 {nDone}</> : '아직 넣은 레이아웃이 없어요'}</span>
              </span>
              {slides.length > 0 && <span className="lt-bar" aria-hidden="true"><i style={{ width: Math.round((nDone / slides.length) * 100) + '%' }} /></span>}
              <Icon name={viewer ? 'chev' : 'chevL'} size={16} className="lt-chev" />
            </button>
            )}
          </div>
      </header>
      <div className="story">
        <StoryCanvas p={p} open={open} stage={stage} pop={pop} onReq={onReq} onMatch={onMatch} readOnly={readOnly} activePart={readOnly && part ? part.id : null} viewerOpen={viewer} onOpenViewer={openViewer} pageOf={pageOf}>
          {pop && pop.t === 'req' && (readOnly ? <ReqView p={p} onClose={() => setPop(null)} /> : <ReqPopup p={p} onClose={() => setPop(null)} onSaved={() => setPop({ t: 'match' })} />)}
          {pop && pop.t === 'match' && (readOnly ? <MatchView p={p} onClose={() => setPop(null)} /> : <MatchPopup p={p} focus={pop.k ? { k: pop.k, n: pop.n } : null} onClose={() => setPop(null)} onSaved={(started) => (started ? partsStarted() : setPop(null))} />)}
          {readOnly && modal?.type === 'part' && part && <PartView p={p} part={part} pages={pages} onClose={close} onSheet={uid => { const s = p.parts.find(s => s.layouts.some(x => x.uid === uid)); open({ type: 'detail', partId: s.id, uid }); }} />}
        </StoryCanvas>
        {story && viewer && <Viewer p={p} readOnly={readOnly} cur={cur} setCur={setCur} onClose={() => setViewer(false)} onEdit={(partId, uid) => open({ type: 'detail', partId, uid })} onExport={() => open({ type: 'export' })} />}
      </div>
      {readOnly && modal?.type === 'detail' && <TemplateDetail list={slides.map(z => L[z.x.f])} ovs={slides.map(z => z.x.ov)} index={Math.max(0, slides.findIndex(z => z.x.uid === modal.uid))} onNav={i => open({ type: 'detail', partId: slides[i].s.id, uid: slides[i].x.uid })} onClose={close} />}
      {!readOnly && modal && modal.type === 'part' && part && <PartEditor key={part.id} p={p} part={part} isNew={modal.isNew} onClose={() => {
        // a brand-new part closed without a name or content is dropped
        if (modal.isNew) { const s = (getProposal(p.id) || p).parts.find((x) => x.id === part.id); if (s && !s.name.trim() && !s.items.length && !(s.text || '').trim()) update(p.id, (d) => { d.parts = d.parts.filter((x) => x.id !== part.id); }); }
        close();
      }} />}
      {!readOnly && modal && modal.type === 'picker' && part && <LayoutPicker p={p} partId={part.id} mode={modal.mode} onClose={close} />}
      {!readOnly && modal && modal.type === 'detail' && part && <LayoutDetail p={p} partId={part.id} uid={modal.uid} onClose={close} open={open} pageNo={pageOf(modal.uid)} />}
      {!readOnly && modal && modal.type === 'export' && <ExportModal p={p} onClose={close} />}
    </>
  );
}
