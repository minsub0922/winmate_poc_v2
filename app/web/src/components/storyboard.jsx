import {FeedbackPopup} from './feedback-popup.jsx';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { update, uid, segPlain } from '../repositories/proposals.js';
import { Icon, RefChip, toast, partHue, useHoverCard, confirmDelete } from './common.jsx';
import { PARTS, NEXT, classifyPart, splitFree, partText, effectiveType } from '../domain/proposals/parts.js';
import { IND, L, LAYOUTS, refInfo, isCoverSheet, isCoverOnlyPart, storyParts, indsOf, SUBSCRIPTION_DB } from '../services/catalog.js';
import { subscriptionNeed } from '../domain/proposals/addons.js';
import { reqText, inferIndustry } from '../services/search.js';
import { Slide } from '../domain/slides/Slide.jsx';
import { refsOf } from './requirements.jsx';
import { PartBubble } from './part-bubble.jsx';
import { LayoutPicker, LayoutDetail } from './layouts.jsx';
import { FavButton } from './fav.jsx';
import { startCompose, applyComposePending, discardComposePending, retryProposalJob, startScenarioLayouts, emptyParts } from '../services/poc-workflows.js';
import { isTerminal, hideJob } from '../repositories/jobs.js';
import { AgentJobControl, useOwnerJobs, useAdopt } from './AgentJobControl.jsx';
import { useLayoutRemoval } from './layout-removal.jsx';
import { ContextSlide } from './context-slide.jsx';
import { contextPending, hasSavedLayoutContent, briefRunning, briefWaiting, sheetShowsSample } from '../domain/slides/context-policy.js';
import { SampleMark } from './sample-ribbon.jsx';
import { LayoutBriefPopup } from './layout-brief.jsx';
import { RequirementSummaryCard } from './requirement-summary.jsx';
import { MatchArea } from './match-area.jsx';
import { LayoutNode, LayoutFollow, layoutPlaced } from './layout-compose.jsx';
import { partStatus, partNote, retryParts, useTemplateSlides, summaryPending, layoutBusy, removePart, movePart, canMovePart } from '../services/layout-compose.js';
import '../styles/part-add.css';

export const ctxOf = (p) => ({ ind: p.ind || inferIndustry(reqText(p)), products: p.ctx.products, solutions: p.ctx.solutions, cases: p.ctx.cases });
const FLOW = ['market', 'customer', 'user', 'competition', 'insight', 'challenge', 'value', 'effect', 'dss', 'products', 'scenario', 'birdseye', 'solution', 'case', 'why', 'spec', 'bom', 'execution', 'cost', 'subscription', 'closing', 'appendix', 'overview', 'requirements']; // no 'cover' — 표지 is not a Storyboard part
const KW = { competition: /경쟁|타사|비교/, market: /시장|트렌드/, cost: /비용|예산|가격|TCO/i, execution: /일정|설치|공사|유지보수|교육|파일럿|단계/, effect: /절감|%|효과|ROI/i, scenario: /동선|공간|체험|시나리오/, solution: /관제|플랫폼|연동|원격|CMS/i, case: /사례|레퍼런스/, why: /신뢰|안정|지원|A\/S/ };

export function candidates(p, afterIndex, n = 5) {
  const prev = afterIndex >= 0 ? p.parts[afterIndex] : null;
  const prevType = prev ? (effectiveType(prev) || '_start') : '_start';
  const nexts = NEXT[prevType] || NEXT._start;
  const used = new Set(p.parts.map((s) => s.type));
  const text = reqText(p);
  const ind = p.ind || inferIndustry(text);
  // score: flow after the previous part · mentioned in the requirements · not used yet · industry layouts exist.
  // What a candidate shows is the part's own description (PARTS[t].about) — kw marks a requirements mention.
  return FLOW.map((t) => {
    let s = 0;
    const ni = nexts.indexOf(t);
    if (ni >= 0) s += 10 - ni * 1.4;
    // 구독: 구독 레지스트리 규칙으로 판정(서버 목차 추천 · 이어 구성과 같은 규칙) — 요구가 분명하면 흐름 자리와 관계없이 앞에
    const need = t === 'subscription' && subscriptionNeed(text, SUBSCRIPTION_DB.addon).need;
    const kw = need || !!(KW[t] && KW[t].test(text));
    if (kw) s += need ? 6 : 2.2;
    if (used.has(t)) s -= 6;
    if (ind && LAYOUTS.some((l) => l.p === t && indsOf(l).includes(ind))) s += 1;
    return { type: t, s, kw, why: kw ? ['요구사항에 관련 언급'] : [] };
  }).sort((a, b) => b.s - a.s).slice(0, n);
}

// ---------- AI로 나머지 구성 ----------
// The button starts a server job: an empty Storyboard → Layout Agent, parts already on the board → Storyboard continuation.
// The job keeps running when the proposal is left (AgentDock follows it, with 진행 보기 · 멈추기 · 다시 시도). When the
// server cannot run it (not ready · no key · submit failed) the board stays as it is and the reason is shown; pressing the
// button again is the retry.
const GHOSTS = 3;
const STORY_SLIDE_WIDTH = 321; // 336px column, minus card padding and borders.
function useAiCompose(p) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const jobs = useOwnerJobs('proposal', p.id).filter((r) => ['compose', 'scenario-parts', 'scenario-layouts'].includes(r.purpose));
  const jobBusy = jobs.some((r) => !isTerminal(r.status));
  useEffect(() => { setErr(''); }, [p.id]);
  const start = () => {
    if (submitting || jobBusy) return;
    setSubmitting(true); setErr('');
    startCompose(p).then((r) => {
      setSubmitting(false);
      if (r.mode === 'job') { toast('서버에서 구성을 시작했어요 · 다른 화면으로 가도 계속돼요'); return; }
      const msg = r.error || '서버 작업을 시작하지 못했어요.';
      setErr(msg); toast(msg + ' · 다시 시도할 수 있어요', 'warn');
    }, (e) => { setSubmitting(false); console.error(e); setErr('서버 작업을 시작하지 못했어요.'); toast('서버 작업을 시작하지 못했어요 · 다시 시도할 수 있어요', 'warn'); });
  };
  // 장표 자동 완성 — 레이아웃이 빈 목차마다 출처 샘플 버티컬 시나리오 모듈의 장표를 옮기고 문구 · 사진을 채운다
  const complete = () => {
    if (submitting || jobBusy) return;
    setSubmitting(true); setErr('');
    startScenarioLayouts(p).then((r) => {
      setSubmitting(false);
      if (r.mode === 'job') { toast('서버에서 장표를 구성하고 있어요 · 다른 화면으로 가도 계속돼요'); return; }
      const msg = r.error || '서버 작업을 시작하지 못했어요.';
      setErr(msg); toast(msg + ' · 다시 시도할 수 있어요', 'warn');
    }, (e) => { setSubmitting(false); console.error(e); setErr('서버 작업을 시작하지 못했어요.'); });
  };
  return { busy: false, n: 0, fresh: null, start, complete, stop: () => {}, jobBusy: jobBusy || submitting, submitting, err };
}

/** Starts following a job recorded in the proposal that this browser does not follow yet (cleared storage, other tab). */
function AdoptJob({ id, purpose, pid, kind }) {
  useAdopt(id, { purpose, owner: { type: 'proposal', id: pid }, title: purpose === 'rfp' ? 'RFP 요구사항 정리' : purpose === 'scenario-parts' ? '샘플 버티컬 시나리오 목차 추천' : purpose === 'scenario-layouts' ? '샘플 버티컬 시나리오 장표 완성' : kind === 'storyboard' ? 'Storyboard 이어서 구성' : 'Layout Agent · 제안서 구성', meta: { kind } });
  return null;
}
const SHOW_DONE_MS = 10 * 60e3; // a finished job card stays a while (with its real mode) unless closed

/** Server jobs of this proposal — progress, questions, cancel, held-back results. Rendered only once a job exists. */
function AgentDock({ p }) {
  // 요약은 버블(고리)이 보여 준다. 레이아웃 자동 구성은 시작하면 레이아웃 구성 버블이 빠지므로 도는 동안만 여기서(진행 보기 · 멈추기) — 끝난 결과는 목차 열이 보여 준다
  const jobs = useOwnerJobs('proposal', p.id).filter(r => r.purpose !== 'requirements-summary' && (r.purpose !== 'layout-auto' || !isTerminal(r.status)));
  const recorded = p.agent && p.agent.jobs ? Object.entries(p.agent.jobs).filter(([, v]) => v && !v.final && v.purpose !== 'layout-auto') : [];
  const now = Date.now();
  const shown = jobs.filter((r) => !r.hidden && (!isTerminal(r.status) || ['error','lost','cancelled'].includes(r.status) || r.outcome === 'pending' || (r.finishedAt && now - r.finishedAt < SHOW_DONE_MS)));
  if (!recorded.length && !shown.length) return null;
  return (
    <div className="agent-dock" onClick={(e) => e.stopPropagation()}>
      {recorded.map(([id, v]) => <AdoptJob key={id} id={id} purpose={v.purpose} kind={v.kind} pid={p.id} />)}
      {shown.map((r) => (
        <AgentJobControl key={r.id} id={r.id} compact onClose={() => hideJob(r.id)}
          onRetry={['rfp', 'compose', 'scenario-parts', 'scenario-layouts'].includes(r.purpose) ? async () => { const out = await retryProposalJob(r); if (out.ok) { hideJob(r.id); toast('다시 시작했어요'); } else toast(out.message, 'warn'); } : undefined}>
          {r.purpose === 'compose' && r.outcome === 'pending' && (
            <div className="ajc-pend">
              <span>작업하는 동안 Storyboard가 바뀌어 결과(목차 {(r.result && r.result.parts ? r.result.parts.length : 0)}개)를 자동으로 넣지 않았어요.</span>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => discardComposePending(r.id)}>버리기</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => applyComposePending(r.id)}>지금 목차 뒤에 붙이기</button>
              </div>
            </div>
          )}
        </AgentJobControl>
      ))}
    </div>
  );
}

/** Shimmer bubbles where the next parts go — the first one carries the status and 멈추기. */
function GhostParts({ n, onStop }) {
  return Array.from({ length: GHOSTS }, (_, i) => (
    <React.Fragment key={i}>
      <div className={'conn ghost-conn g' + i} aria-hidden="true" />
      <div className={'col ghost g' + i} aria-hidden={i > 0 ? 'true' : undefined}>
        <div className="node-top"><span className="node ghost-node shimmer">{i === 0 && <Icon name="sparkle" size={24} />}</span></div>
        <span className="ghost-bar ghost-name shimmer" />
        <span className="ghost-bar ghost-btn shimmer" />
        {i === 0 && (
          <FeedbackPopup message={(n?n+"개 목차 추가 · ":"")+"다음 목차를 쓰는 중…"} kind="progress" actionLabel="작업 취소" onAction={onStop}/>
        )}
      </div>
    </React.Fragment>
  ));
}

// ---------- canvas ----------
// 고객 요구사항 다음 버블 — 제품 · 솔루션 · 서비스 + 매칭 카드 + '공간 구성' (match-area.jsx MatchArea), 그다음 레이아웃 구성(layout-compose.jsx LayoutNode)

// stage: 'req' → 고객 요구사항 버블만 · 'match' → + 매칭 버블 + 레이아웃 구성 버블(요구사항 저장 뒤) · 'story' → + 목차(store.js stageOf)
// 목차 직접 추가(끝의 + 버블 · 버블 사이 +)는 구성을 고른 뒤(목차가 있고 자동 구성이 돌지 않을 때)만 보인다 — 누르면 관리자 「전체 파트」 11개 중에서 고르는
// 목차 추가 팝업(part-add.jsx). 목차 버블은 끌어서 다른 버블 사이로 옮기고(제품 스펙은 맨 끝 고정), 버블의 ×로 지운다(늘 확인 팝업 뒤에).
// (사용자 지시 2026-11-16)
// 버블에는 순서 숫자를 두지 않는다. 버블에서 작업이 진행 중이면 테두리에 도는 고리(.node.is-busy)로 알린다.
// readOnly: 샘플 버티컬 시나리오 상세 보기(scenarios.jsx ScenarioStoryboard) — 같은 버블 · 레이아웃 카드를 보기만 한다. 목차 넣기(+) · 끌어서 옮기기 ·
// PPT 레이아웃 추가 · AI로 나머지 구성 · 다음 목차가 없고, 버블 · 카드를 누르면 open 이 보기 전용 팝업을 띄운다. activePart = 팝업이 열린 목차 id.
// onSpace: '공간 구성' 팝업 열기 · 닫기 · onOpenSpatial(historyId): 만든 공간 조감도 열기
export function StoryCanvas({ p, open, stage = 'story', pop = null, onReq, onMatch, onSpace, onLayout, onOpenSpatial, viewerOpen, onOpenViewer, pageOf, readOnly = false, activePart = null, children }) {
  const reqOpen = !!pop && pop.t === 'req';
  const reqBusy = !readOnly && summaryPending(p); // 제안 전략 요약 중 — 버블 테두리에 고리
  const sidePop = !!pop && (pop.t === 'match' || pop.t === 'space'); // popups beside the 매칭 카드 — the board gets room to their right (레이아웃 구성은 모달)
  const story = stage === 'story';
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(null); // {pid, before}
  // 카드 위에 뜨는 큰 미리보기 — 카드에 들어 있는 장(채운 글 · 사진 · 쪽 번호)을 그대로 크게 그린다. 띄워 둔 사이 내용이 바뀌어도 지금 값으로.
  const hc0 = useHoverCard();
  const hoverSlide = (uid, width) => {
    for (const s of p.parts) {
      const x = s.layouts.find((y) => y.uid === uid);
      if (!x) continue;
      // 카드(ContextSlide)와 같은 기준: 채우는 중이면 shimmer, 실패했고 저장된 내용이 없으면 자리표시, 아니면 같은 f · ov · 쪽 번호의 장
      const waiting = !readOnly && (contextPending(x) || briefRunning(x) || (x.adaptation && x.adaptation.phase === 'error' && !hasSavedLayoutContent(x)));
      if (waiting) return <div className="context-slide shimmer" style={{ width, aspectRatio: '16 / 9' }} aria-hidden="true" />;
      const sheet = <Slide f={x.f} ov={x.ov} width={width} pageNo={pageOf(x.uid)} />;
      return !readOnly && sheetShowsSample(x) ? <SampleMark>{sheet}</SampleMark> : sheet; // 아직 이 제안서 값이 아닌 장 — '샘플 자료' 띠
    }
    return null;
  };
  const hoverSlideRef = useRef(hoverSlide); hoverSlideRef.current = hoverSlide;
  const hc = { ...hc0, show: (l, el, o) => hc0.show(l, el, o && o.uid ? { render: (width) => hoverSlideRef.current(o.uid, width) } : o) };
  const ai = useAiCompose(p);
  const removal = useLayoutRemoval(p.id);
  // 직접 넣은 장의 방향 확인 — 추론을 마친 장(briefWaiting)은 카드 가운데 '!' 버튼 · 카드를 누르면 확인 팝업 (layout-brief.jsx)
  const [briefUid, setBriefUid] = useState(null);
  const openBrief = (u) => { hc.hide(); setBriefUid(u); };
  const briefing = [], waitingBrief = [];
  if (!readOnly) for (const s of p.parts) for (const x of s.layouts) { if (briefRunning(x)) briefing.push(x.uid); else if (briefWaiting(x)) waitingBrief.push(x); }
  // 이 화면에서 추론이 끝난 장 — 한 번 알린다(새로 고친 뒤 이미 기다리던 장은 알리지 않는다)
  const wasBriefing = useRef(new Set());
  const [briefDone, setBriefDone] = useState(null);
  const briefKey = briefing.join(',') + '|' + waitingBrief.map((x) => x.uid).join(',');
  useEffect(() => {
    const done = waitingBrief.find((x) => wasBriefing.current.has(x.uid));
    if (done) setBriefDone(done.uid);
    wasBriefing.current = new Set(briefing);
  }, [briefKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const doneBrief = briefDone && waitingBrief.find((x) => x.uid === briefDone);
  const canvasRef = useRef(null);
  // keep the newest bubble and the shimmer trail in view: bring the first shimmer bubble to a bit past the middle
  // (on a narrow canvas, wherever it fits whole)
  useEffect(() => {
    if (!ai.busy) return;
    const c = canvasRef.current; const g = c && c.querySelector('.col.ghost');
    if (!g) return;
    const cr = c.getBoundingClientRect(); const gr = g.getBoundingClientRect();
    const dx = gr.left - (cr.left + Math.max(0, Math.min(cr.width * 0.55, cr.width - gr.width - 16)));
    if (dx > 0) c.scrollBy({ left: dx, behavior: 'smooth' });
  }, [ai.busy, ai.n]);
  // 목차 추가 — 관리자 파트 11개 중에서 고르는 팝업(ProposalPage 가 띄운다). at: p.parts 의 자리(없으면 끝)
  const addPart = (type, at) => open({ type: 'part-add', at: at == null ? null : at });
  // 목차 버블 끌어서 옮기기 — pdrag: 끄는 목차 id · pdrop: 그 앞에 놓을 목차 id('' = 맨 끝)
  const [pdrag, setPdrag] = useState(null);
  const [pdrop, setPdrop] = useState(null);
  const bodyIds = storyParts(p).map((s) => s.id);
  const overCol = (e, sid) => {
    if (!pdrag) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    const i = bodyIds.indexOf(sid);
    const before = e.clientX < r.left + r.width / 2 ? sid : (bodyIds[i + 1] || '');
    if (pdrop !== before) setPdrop(before);
  };
  const endPartDrag = () => { setPdrag(null); setPdrop(null); };
  const dropPart = (e) => {
    if (!pdrag) return;
    e.preventDefault();
    const from = pdrag; const before = pdrop;
    endPartDrag();
    if (before == null || before === from) return;
    const i = bodyIds.indexOf(from);
    if (before === (bodyIds[i + 1] || '')) return; // 제자리
    movePart(p.id, from, before || null);
  };
  const askRemove = async (s, n) => {
    const ok = await confirmDelete({ title: '목차를 지울까요?', message: `‘${s.name || '이름 없는 목차'}’ 목차${n ? `와 레이아웃 ${n}장` : ''}을 Storyboard에서 지워요.`, confirmLabel: '목차 지우기' });
    if (!ok) return;
    removePart(p.id, s.id);
    toast('목차를 지웠어요');
  };
  const doDrop = (pid, before) => {
    const u = drag; setDrag(null); setDrop(null);
    if (!u) return;
    update(p.id, (d) => {
      let item = null;
      for (const s of d.parts) { const i = s.layouts.findIndex((x) => x.uid === u); if (i >= 0) { item = s.layouts.splice(i, 1)[0]; break; } }
      if (!item) return;
      const tgt = d.parts.find((s) => s.id === pid); if (!tgt) return;
      const bi = before ? tgt.layouts.findIndex((x) => x.uid === before) : -1;
      if (bi >= 0) tgt.layouts.splice(bi, 0, item); else tgt.layouts.push(item);
    });
  };
  const nLay = p.parts.reduce((a, s) => a + s.layouts.length, 0);
  const nParts = storyParts(p).length; // bubbles on the board (a 표지-only part has none)
  const canAdd = !readOnly && nParts > 0 && !layoutBusy(p); // 목차 직접 추가 — 구성을 고른 뒤, 자동 구성이 끝났을 때
  let order = 0;
  return (
    <div className={'canvas-wrap' + (readOnly ? ' ro' : '') + (sidePop ? ' side-pop' : '')}>
    <div className="canvas" ref={canvasRef}>
      <div className="board" style={{ zoom }}>
        {/* trigger node: requirements — 누르면 버블 오른쪽에 고객 요구사항 팝업(requirements.jsx ReqPopup).
            요구사항을 저장하기 전(stage 'req')에는 이 버블 하나만 둔다. */}
        <div className={'start-node' + (reqOpen ? ' on' : '')}>
          <div className="node-top"><button className={'node' + (reqBusy ? ' is-busy' : '')} onClick={onReq} aria-busy={reqBusy || undefined} aria-expanded={reqOpen} aria-controls="rq-pop" aria-label={(reqOpen ? '고객 요구사항 닫기' : '고객 요구사항 열기') + (reqBusy ? ' · 요약하는 중' : '')}><Icon name="clip" size={28} /></button></div>
          <button className="node-name" onClick={onReq} aria-expanded={reqOpen} aria-controls="rq-pop">고객 요구사항</button>
          {/* 버블 아래에는 요약만 둔다 — 요약이든 버블이든 누르면 고객 요구사항 팝업 */}
          <RequirementSummaryCard p={p} onOpenReq={onReq} readOnly={readOnly} />
        </div>
        {stage !== 'req' && <>
        <div className="conn" />
        <MatchArea p={p} isOpen={!!pop && pop.t === 'match'} onOpen={onMatch} readOnly={readOnly} spaceOpen={!!pop && pop.t === 'space'} onSpace={onSpace} onOpenSpatial={onOpenSpatial} />
        {/* 레이아웃 구성 버블 — 고객 요구사항을 저장하면 매칭 버블과 함께 생긴다. 구성을 골라 '제안서 작성하기'로 목차가 놓이면
            버블과 연결선을 바로 치운다(사용자 지시 2026-11-16) — 매칭 다음에 바로 목차 버블이 오고, 진행 · 멈추기는 작업 카드(AgentDock), 실패한 목차는 그 열의 '다시 구성'.
            진행 중인 자동 구성을 이어서 따라가는 것은 LayoutFollow(버블이 없어도) */}
        {!readOnly && <LayoutFollow p={p} />}
        {!readOnly && !layoutPlaced(p) && <>
          <div className="conn" />
          <LayoutNode p={p} isOpen={!!pop && pop.t === 'layout'} onOpen={onLayout} onMatch={() => { if (!(pop && pop.t === 'match')) onMatch(); }} />
        </>}
        </>}
        {story && p.parts.map((s, i) => {
          // 표지 is not on the Storyboard: it lives in the hidden deck part (data.js normalizeCovers) — no bubble, no card;
          // the PPT 레이아웃 panel shows it as the deck's first page (data.js deckOrder)
          if (s.deck || isCoverOnlyPart(s)) return null;
          const no = ++order;
          const type = s.type || classifyPart(s.name);
          const hue = partHue(type);
          const vis = s.layouts.filter((x) => L[x.f] && !isCoverSheet(x.f));
          const isNew = !!(ai.fresh && ai.fresh.has(s.id)); // just added by AI로 나머지 구성 — rises in where the shimmer was
          const auto = readOnly ? null : partStatus(p, s.id); // 레이아웃 자동 구성 상태 — queued · running · done · error
          const composing = (auto === 'queued' || auto === 'running') && !vis.length;
          const failed = auto === 'error' && !vis.length;
          const skipped = auto === 'empty' && !vis.length; // 연결한 항목으로 채울 장이 없어 서버가 비워 둔 목차
          return (
            <React.Fragment key={s.id}>
              <div className={'conn' + (isNew ? ' conn-new' : '') + (pdrag && pdrop === s.id ? ' pdrop' : '')} onDragOver={(e) => { if (pdrag) { e.preventDefault(); if (pdrop !== s.id) setPdrop(s.id); } }} onDrop={dropPart}>{canAdd && !pdrag && <button className="conn-plus" aria-label={no + '번째 자리에 목차 넣기'} title="여기에 새 목차 넣기" onClick={(e) => { e.stopPropagation(); addPart(null, i); }}><Icon name="plus" size={14} stroke={2.4} /></button>}
              </div>
              <div className={'col ' + hue + (isNew ? ' col-new' : '') + (activePart === s.id ? ' on' : '') + (pdrag === s.id ? ' pdragging' : '')} data-pid={s.id}
                onDragOver={(e) => overCol(e, s.id)} onDrop={dropPart}>
                <PartBubble part={s} busy={composing} onClick={() => open({ type: 'part', partId: s.id })} label={s.name + (readOnly ? ' 목차 보기' : ' 목차 편집') + (composing ? ' · 레이아웃 구성 중' : '')} expanded={readOnly ? activePart === s.id : undefined}
                  dragProps={readOnly || !canMovePart(s) ? null : {
                    draggable: true, title: '끌어서 목차 순서 바꾸기',
                    onDragStart: (e) => { setPdrag(s.id); setPdrop(null); hc.hide(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'part:' + s.id); },
                    onDragEnd: endPartDrag,
                  }} />
                {!readOnly && <button type="button" className="part-del" aria-label={(s.name || '이름 없는 목차') + ' 목차 지우기'} title="목차 지우기" onClick={(e) => { e.stopPropagation(); askRemove(s, vis.length); }}><Icon name="x" size={12} stroke={2.6} /></button>}
                <div className="laystack" onDragOver={(e) => { if (drag) { e.preventDefault(); if (!drop || drop.pid !== s.id) setDrop({ pid: s.id, before: null }); } }} onDrop={(e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); doDrop(s.id, drop && drop.pid === s.id ? drop.before : null); }}>
                  {vis.map((x) => {
                    const l = L[x.f];
                    return (
                      <React.Fragment key={x.uid}>
                        {drop && drop.pid === s.id && drop.before === x.uid && <div className="dropline" />}
                        <div className={'lcard' + (drag === x.uid ? ' dragging' : '') + (!readOnly && briefWaiting(x) ? ' brief-wait' : '')} draggable={!readOnly} data-layout-uid={x.uid}
                          onDragStart={(e) => { if (readOnly) return; setDrag(x.uid); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.uid); hc.hide(); }}
                          onDragEnd={() => { setDrag(null); setDrop(null); }}
                          onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const before = e.clientY < r.top + r.height / 2 ? x.uid : (vis[vis.indexOf(x) + 1] || {}).uid || null; setDrop({ pid: s.id, before }); }}
                          onDrop={(e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); doDrop(s.id, drop && drop.pid === s.id ? drop.before : x.uid); }}
                          onClick={() => (!readOnly && briefWaiting(x) ? openBrief(x.uid) : open({ type: 'detail', partId: s.id, uid: x.uid }))}
                          onMouseEnter={(e) => !drag && hc.show(l, e.currentTarget, { uid: x.uid })} onMouseLeave={hc.hide}
                          role="button" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (!readOnly && briefWaiting(x)) openBrief(x.uid); else open({ type: 'detail', partId: s.id, uid: x.uid }); } }} aria-label={l.name + (!readOnly && briefWaiting(x) ? ' — 넣을 내용 확인' : ' 열기')}>
                          {readOnly ? <Slide f={x.f} ov={x.ov} width={STORY_SLIDE_WIDTH} lazy pageNo={pageOf(x.uid)} /> : <ContextSlide p={p} x={x} width={STORY_SLIDE_WIDTH} lazy pageNo={pageOf(x.uid)} />}
                          {!readOnly && briefWaiting(x) && <button type="button" className="brief-mark" draggable={false} style={{ top: 'calc(var(--space-6px) + ' + (STORY_SLIDE_WIDTH * 9 / 32) + 'px)' }}
                            aria-label={l.name + ' — 이 장에 넣을 내용 확인하기'} title="이 장에 넣을 내용을 확인하고 채우기를 진행해요"
                            onPointerDown={(e) => e.stopPropagation()} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }} onMouseEnter={hc.hide}
                            onKeyDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openBrief(x.uid); }}><span aria-hidden="true">!</span></button>}
                          <FavButton f={x.f} ov={x.ov} from={(readOnly ? '샘플 버티컬 시나리오 · ' : '제안서 · ') + (p.title || '')} />
                          {!readOnly && <button type="button" className="layout-remove" draggable={false} aria-label={l.name + ' 선택 해제'} title="레이아웃 선택 해제"
                            onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }} onMouseEnter={hc.hide} onFocus={hc.hide}
                            onKeyDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.focus({ preventScroll:true }); hc.hide(); removal.request(x.uid); }}><Icon name="x" size={15} /></button>}
                          {!readOnly && <span className="grip" title="끌어서 순서 바꾸기"><Icon name="grip" size={14} stroke={3} /></span>}
                          <span className="pg">{pageOf(x.uid)}</span>
                          <div className="lcard-meta"><span className="nm">{l.name}</span>{!readOnly && briefWaiting(x) && <span className="stbadge brief">확인 필요</span>}</div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {composing && (
                    <div className={'lay-pending ' + (auto === 'running' ? 'running' : 'queued')} role="status">
                      <span className="lay-pending-t"><span className="spin" aria-hidden="true" />{auto === 'running' ? '레이아웃을 구성하고 내용을 채우는 중…' : '전체 흐름을 잡는 중 · 곧 구성해요'}</span>
                      {/* 장이 들어올 자리 — 장 모양의 shimmer(제목 · 사진 · 글줄) 두 장, 뒤 장은 흐리게 */}
                      {[0, 1].map((k) => (
                        <span key={k} className={'lay-pending-card' + (k ? ' next' : '')} aria-hidden="true">
                          <span className="lp-slide"><i className="lp-t shimmer" /><i className="lp-s shimmer" /><span className="lp-b"><i className="lp-img shimmer" /><span className="lp-lines"><i className="shimmer" /><i className="shimmer" /><i className="shimmer" /></span></span></span>
                          <i className="lp-name shimmer" />
                        </span>
                      ))}
                    </div>
                  )}
                  {skipped && (
                    <div className="lay-failed lay-skipped" role="note">
                      <span><Icon name="info" size={13} />{partNote(p, s.id)}</span>
                      <div className="row">
                        {s.agent && s.agent.source === 'template' && <button type="button" className="btn btn-sm" onClick={async () => { if (!(await useTemplateSlides(p.id, s.id))) toast('구성의 장을 불러오지 못했어요', 'warn'); }} title="구성 견본의 장을 그대로 넣고 직접 고쳐요">견본 장 넣기</button>}
                      </div>
                    </div>
                  )}
                  {failed && (
                    <div className="lay-failed" role="alert">
                      <span><Icon name="alert" size={13} />{partNote(p, s.id) || '이 목차의 레이아웃을 구성하지 못했어요.'}</span>
                      <div className="row">
                        <button type="button" className="btn btn-sm btn-primary" onClick={async () => { const r = await retryParts(p.id, [s.id]); if (!r.ok) toast(r.message, 'warn'); }}><Icon name="refresh" size={13} />다시 구성</button>
                        {s.agent && s.agent.source === 'template' && <button type="button" className="btn btn-sm" onClick={async () => { if (!(await useTemplateSlides(p.id, s.id))) toast('구성의 장을 불러오지 못했어요', 'warn'); }} title="구성 견본의 장을 그대로 넣고 직접 고쳐요">견본 장 넣기</button>}
                      </div>
                    </div>
                  )}
                  {drop && drop.pid === s.id && drop.before === null && <div className="dropline" />}
                  {drag && <div className={'dropend' + (drop && drop.pid === s.id && drop.before === null ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrop({ pid: s.id, before: null }); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); doDrop(s.id, null); }} />}
                </div>
                {!readOnly && !composing && <div className="col-actions">
                  <button className="btn btn-primary btn-sm" disabled={!s.done} onClick={() => open({ type: 'picker', partId: s.id, mode: 'rec' })} title={s.done ? '목차에 맞는 레이아웃 추천 보기' : '목차 내용을 작성 완료하면 추천을 받을 수 있어요'}><Icon name="plus" size={14} stroke={2.4} />PPT 레이아웃 추가</button>
                </div>}
                {!readOnly && !composing && !s.done && <span className="lock-note">목차 내용을 <b>작성 완료</b>하면 추천을 받을 수 있어요</span>}
              </div>
            </React.Fragment>
          );
        })}
        {story && !readOnly && ai.busy && <GhostParts n={ai.n} onStop={ai.stop} />}
        {/* 목차 추가('추가' 버블) — 구성을 고르고 레이아웃 자동 구성이 끝난 뒤에만(그 전에는 레이아웃 구성 버블에서 구성부터 고른다) */}
        {stage !== 'req' && canAdd && !ai.busy && <>
        <div className={'conn' + (pdrag && pdrop === '' ? ' pdrop' : '')} onDragOver={(e) => { if (pdrag) { e.preventDefault(); if (pdrop !== '') setPdrop(''); } }} onDrop={dropPart} />
        <div className="end-node">
          <>
              <div className="node-top"><button className="end-plus" aria-label="목차 추가" aria-haspopup="dialog" onClick={(e) => { e.stopPropagation(); addPart(null); }}><Icon name="plus" size={30} stroke={2} /></button></div>
              <span className="node-name end-manual">추가</span>
              {/* 'AI로 나머지 구성'은 없앴다(사용자 지시 2026-11-17) — 목차는 관리자 파트에서만 고른다. 빈 목차의 장표 자동 완성은 그대로 */}
              {!ai.jobBusy && !layoutBusy(p) && emptyParts(p).length > 0 && <button className="btn btn-primary btn-sm end-ai" onClick={ai.complete} title="레이아웃이 빈 목차마다 샘플 버티컬 시나리오 장표를 옮기고 문구 · 사진을 채워요"><Icon name="sparkle" size={13} />{'장표 자동 완성 · 목차 ' + emptyParts(p).length + '개'}</button>}
              {ai.jobBusy && <button className="btn btn-ghost btn-sm end-ai" disabled><span className="spin" />{ai.submitting ? '서버에 요청하는 중' : '서버에서 구성하는 중'}</button>}
              <FeedbackPopup message={!ai.jobBusy?ai.err:""}/>
          </>
        </div>
        </>}
      </div>
    </div>
      <div className="zoombar" onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost btn-sm btn-icon" aria-label="축소" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}><Icon name="minus" size={14} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="btn btn-ghost btn-sm btn-icon" aria-label="확대" onClick={() => setZoom((z) => Math.min(1.4, +(z + 0.1).toFixed(2)))}><Icon name="plus" size={14} /></button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setZoom(1)} aria-label="100%로 되돌리기" title="100%로 되돌리기"><Icon name="fit" size={14} /></button>
      </div>
      {hc.node}
      {removal.confirmation}
      {!readOnly && <FeedbackPopup message={doneBrief ? '‘' + ((L[doneBrief.f] || {}).name || '레이아웃') + '’' : ''} kind="info" title="넣을 내용 추론 완료" actionLabel="확인하기" onAction={() => doneBrief && openBrief(doneBrief.uid)} />}
      {briefUid && <LayoutBriefPopup p={p} uid={briefUid} onClose={() => setBriefUid(null)} />}
      {!readOnly && <AgentDock p={p} />}
      {children}
    </div>
  );
}
