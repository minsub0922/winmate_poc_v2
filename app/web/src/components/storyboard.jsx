import React, { useState, useRef, useEffect, useMemo } from 'react';
import { update, uid, segPlain } from '../repositories/proposals.js';
import { Icon, RefChip, toast, partHue, useHoverCard } from './common.jsx';
import { PARTS, NEXT, classifyPart, splitFree, partText, effectiveType } from '../domain/proposals/parts.js';
import { IND, L, LAYOUTS, refInfo, isCoverSheet, isCoverOnlyPart, storyParts } from '../services/catalog.js';
import { reqText, inferIndustry } from '../services/search.js';
import { aiStoryboard } from '../services/ai.js';
import { Slide } from '../domain/slides/Slide.jsx';
import { refsOf } from './requirements.jsx';
import { KIND, shortOf } from './refcard.jsx';
import { partIcon } from './parteditor.jsx';
import { Thumb } from './Thumbs.jsx';
import { LayoutPicker, LayoutDetail } from './layouts.jsx';
import { tagMeta } from './tagcard.jsx';
import { FavButton } from './fav.jsx';
import { planFor } from '../services/poc-client.js';
import { startCompose, composeKind, applyComposePending, discardComposePending } from '../services/poc-workflows.js';
import { isTerminal, hideJob } from '../repositories/jobs.js';
import { AgentJobControl, useOwnerJobs, useAdopt } from './AgentJobControl.jsx';

export const ctxOf = (p) => ({ ind: p.ind || inferIndustry(reqText(p)), products: p.ctx.products, solutions: p.ctx.solutions, cases: p.ctx.cases });
const FLOW = ['market', 'customer', 'user', 'competition', 'insight', 'challenge', 'value', 'effect', 'dss', 'products', 'scenario', 'birdseye', 'solution', 'case', 'why', 'spec', 'bom', 'execution', 'cost', 'closing', 'appendix', 'overview', 'requirements']; // no 'cover' — 표지 is not a Storyboard part
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
    const kw = !!(KW[t] && KW[t].test(text));
    if (kw) s += 2.2;
    if (used.has(t)) s -= 6;
    if (ind && LAYOUTS.some((l) => l.p === t && l.ind === ind)) s += 1;
    return { type: t, s, kw, why: kw ? ['요구사항에 관련 언급'] : [] };
  }).sort((a, b) => b.s - a.s).slice(0, n);
}

// ---------- AI로 나머지 구성 ----------
// No popup: the AI designs only the parts that come after the bubbles already on the board. While it works, three
// shimmer bubbles stand where the new parts will go; each part is added as a real bubble the moment the streamed answer
// completes it (ai.js aiStoryboard → onPart), and the shimmer trail moves on behind it until the answer is done.
const GHOSTS = 3;
const ADD_GAP = 160; // ms between two bubbles when several are ready at once (fallback · a burst in the stream)
// With the PoC backend configured (WINMATE_STORYBOARD_MODE / WINMATE_LAYOUT_MODE = real and a server key), the same button
// starts a server job instead: an empty Storyboard → Layout Agent, parts already on the board → Storyboard continuation.
// The job keeps running when the proposal is left (AgentDock follows it); dummy mode and no key keep the flow below.
function useAiCompose(p) {
  const [st, setSt] = useState(null); // while running: { n: parts added, fresh: ids added in this run }
  const [submitting, setSubmitting] = useState(false);
  const run = useRef(null);
  const jobs = useOwnerJobs('proposal', p.id, 'compose');
  const jobBusy = jobs.some((r) => !isTerminal(r.status));
  // leaving the proposal (or the screen) stops the AI; parts already written still land in that proposal
  useEffect(() => () => { if (run.current) run.current.end(true); setSt(null); }, [p.id]);
  const start = () => {
    if (run.current || submitting || jobBusy) return;
    const plan = planFor(composeKind(p));
    if (!plan.job) {
      if (!plan.quiet && plan.note) toast(plan.note);
      startClassic();
      return;
    }
    setSubmitting(true);
    startCompose(p).then((r) => {
      setSubmitting(false);
      if (r.mode === 'job') { toast(plan.offline ? '서버 PoC 규칙(오프라인)으로 구성을 시작했어요' : '서버에서 구성을 시작했어요 · 다른 화면으로 가도 계속돼요'); return; }
      toast((r.error || (r.plan && r.plan.note) || '서버 작업을 시작하지 못했어요') + ' · 기본 흐름으로 구성해요', 'warn');
      startClassic();
    }, (e) => { setSubmitting(false); toast('서버 작업을 시작하지 못했어요 · 기본 흐름으로 구성해요', 'warn'); console.error(e); startClassic(); });
  };
  const startClassic = () => {
    if (run.current) return;
    const pid = p.id;
    const ctl = new AbortController();
    const q = []; const fresh = [];
    let timer = null, res = null, closed = false;
    const add = (x) => {
      const part = { id: uid('s'), type: x.type, name: x.name, items: x.items, form: 'list', text: '', done: x.items.length > 0, layouts: [] };
      update(pid, (d) => { d.parts.push(part); d.stage = 'story'; });
      fresh.push(part.id);
      setSt({ n: fresh.length, fresh: new Set(fresh) });
    };
    const end = (quiet) => {
      if (closed) return; closed = true;
      clearTimeout(timer); while (q.length) add(q.shift()); // parts that are already written always land on the board
      run.current = null;
      setSt(null);
      if (quiet) return;
      const n = fresh.length;
      if (res && res.stopped) toast(n ? '멈췄어요 · 파트 ' + n + '개를 넣었어요' : 'AI 구성을 멈췄어요');
      else if (!n) toast('더 이어 갈 파트를 찾지 못했어요', 'warn');
      else if (res && !res.ai) toast('AI에 연결하지 못해 기본 흐름으로 파트 ' + n + '개를 이어 넣었어요');
      else toast('AI가 파트 ' + n + '개를 이어 넣었어요');
    };
    const step = () => { timer = null; const x = q.shift(); if (x) { add(x); timer = setTimeout(step, ADD_GAP); } else if (res) end(); };
    run.current = { end: (quiet) => { ctl.abort(); end(quiet); }, stop: () => { ctl.abort(); } };
    setSt({ n: 0, fresh: new Set() });
    aiStoryboard(p, { signal: ctl.signal, onPart: (x) => { if (closed || ctl.signal.aborted) return; q.push(x); if (!timer) step(); } })
      .then((r) => { res = r; if (!timer) step(); }, () => { res = { stopped: ctl.signal.aborted }; if (!timer) step(); });
  };
  const stop = () => { if (run.current) run.current.stop(); };
  return { busy: !!st, n: st ? st.n : 0, fresh: st ? st.fresh : null, start, stop, jobBusy: jobBusy || submitting, submitting };
}

/** Starts following a job recorded in the proposal that this browser does not follow yet (cleared storage, other tab). */
function AdoptJob({ id, purpose, pid, kind }) {
  useAdopt(id, { purpose, owner: { type: 'proposal', id: pid }, title: purpose === 'rfp' ? 'RFP 요구사항 정리' : kind === 'storyboard' ? 'Storyboard 이어서 구성' : 'Layout Agent · 제안서 구성', meta: { kind } });
  return null;
}
const SHOW_DONE_MS = 10 * 60e3; // a finished job card stays a while (with its real mode) unless closed

/** Server jobs of this proposal — progress, questions, cancel, held-back results. Rendered only once a job exists. */
function AgentDock({ p, reqOpen, onReq }) {
  const jobs = useOwnerJobs('proposal', p.id);
  const recorded = p.agent && p.agent.jobs ? Object.entries(p.agent.jobs).filter(([, v]) => v && !v.final) : [];
  const rfp = p.agent && p.agent.rfpPending;
  const now = Date.now();
  const shown = jobs.filter((r) => !r.hidden && (!isTerminal(r.status) || r.outcome === 'pending' || (r.finishedAt && now - r.finishedAt < SHOW_DONE_MS) || (rfp && rfp.jobId === r.id)));
  const rfpCard = rfp && !shown.some((r) => r.id === rfp.jobId);
  if (!recorded.length && !shown.length && !rfpCard) return null;
  const rfpAsk = (
    <div className="ajc-pend">
      <span>{rfp && rfp.source === 'classic' ? (rfp.reason || '기본 규칙으로 읽은 요구사항이 있어요.') : `첨부에서 읽은 요구사항 ${rfp && rfp.choices ? rfp.choices.length : 0}건이 확인을 기다려요.`}</span>
      {!reqOpen && <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={onReq}><Icon name="clip" size={13} />고객 요구사항에서 확인</button></div>}
    </div>
  );
  return (
    <div className="agent-dock" onClick={(e) => e.stopPropagation()}>
      {recorded.map(([id, v]) => <AdoptJob key={id} id={id} purpose={v.purpose} kind={v.kind} pid={p.id} />)}
      {rfpCard && <section className="ajc compact" aria-label="첨부에서 읽은 요구사항">{rfpAsk}</section>}
      {shown.map((r) => (
        <AgentJobControl key={r.id} id={r.id} compact onClose={() => hideJob(r.id)}>
          {r.purpose === 'compose' && r.outcome === 'pending' && (
            <div className="ajc-pend">
              <span>작업하는 동안 Storyboard가 바뀌어 결과(파트 {(r.result && r.result.parts ? r.result.parts.length : 0)}개)를 자동으로 넣지 않았어요.</span>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => discardComposePending(r.id)}>버리기</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => applyComposePending(r.id)}>지금 파트 뒤에 붙이기</button>
              </div>
            </div>
          )}
          {r.purpose === 'rfp' && rfp && rfp.jobId === r.id && rfpAsk}
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
          <div className="ghost-note">
            <span role="status" aria-live="polite"><span className="spin" />{n ? '파트 ' + n + '개 넣음 · ' : ''}다음 파트를 쓰는 중</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onStop}><Icon name="x" size={13} />멈추기</button>
          </div>
        )}
      </div>
    </React.Fragment>
  ));
}

// ---------- canvas ----------
function StatusBadge({ s }) {
  if (s === 'done') return <span className="stbadge done"><Icon name="check" size={11} stroke={3} />입력 완료</span>;
  if (s === 'partial') return null;
  return <span className="stbadge empty">빈 레이아웃</span>;
}

function CandCard({ p, afterIndex, onPick, onCustom, title, sub }) {
  const list = candidates(p, afterIndex);
  return (
    <div className="cand-card" onClick={(e) => e.stopPropagation()}>
      <h3>{title}</h3>{sub && <p>{sub}</p>}
      {list.map((c) => (
        <button key={c.type} className={'cand ' + partHue(c.type)} onClick={() => onPick(c.type)}>
          <span className="ci"><Icon name={PARTS[c.type].icon} size={16} /></span>
          <span className="cand-t"><b>{PARTS[c.type].label}{c.kw && <em className="cand-kw">요구사항 언급</em>}</b><span className="cand-d">{PARTS[c.type].about}</span></span>
        </button>
      ))}
      <button type="button" className="cand cand-direct" onClick={onCustom}>
        <span className="ci"><Icon name="edit" size={16} /></span>
        <span className="cand-t"><b>직접 입력</b><span className="cand-d">목록에 없는 주제는 직접 이름을 붙여요. 적은 이름이 곧 파트 유형이 돼요</span></span>
      </button>
    </div>
  );
}

/** 고객 요구사항 다음 버블 — 연결된 제품 · 솔루션 · 유관사례. 누르면 버블 오른쪽에 매칭 팝업(ctxconfirm.jsx MatchPopup · 보기 · 추가 · 삭제). */
// bubble: images only, one row each — products 4 columns, solutions 2, cases 1 (same tile height, widths follow the column count)
const MATCH_COLS = { products: 3, solutions: 2, cases: 1 };
/** one tile in the bubble — image + name + one line of metadata, always visible */
function MatchPic({ r, more }) {
  const m = tagMeta(r); if (!m) return null;
  const sub = m.type === 'product' ? (P_SPEC(m) || m.kind) : m.type === 'solution' ? m.kind : m.line;
  return (
    <span className={'mpc ' + m.type} title={m.name + ' · ' + m.line}>
      <span className="mpc-m"><Thumb r={r} mini className="mpic" />{more > 0 && <span className="mpc-more num">+{more}</span>}</span>
      <span className="mcap"><b>{m.short}</b><span className={m.type === 'product' ? 'num' : ''}>{sub}</span>{m.type === 'case' && m.facts[1] && m.facts[1][0] === '성과' ? <em>{m.facts[1][1]}</em> : null}</span>
    </span>
  );
}
const P_SPEC = (m) => { const f = m.facts.find(([k]) => k === '사양'); return f ? f[1].split(' · ').slice(0, 2).join(' · ') : ''; };
function MatchNode({ p, isOpen, onOpen, readOnly = false }) {
  const total = KIND.reduce((a, [k]) => a + p.ctx[k].length, 0);
  const go = (k) => onOpen(k || null);
  return (
    <div className={'match-node' + (isOpen ? ' on' : '')}>
      <div className="node-top">
        <button className="node" onClick={() => go()} aria-expanded={isOpen} aria-controls="mt-pop" aria-label={'제품 · 솔루션 매칭 ' + (isOpen ? '닫기' : '열기') + ' · 연결 ' + total + '개'}>
          <Icon name="link" size={28} />
          <span className="order">{total}</span>
        </button>
      </div>
      <button className="node-name" onClick={() => go()} aria-expanded={isOpen} aria-controls="mt-pop">제품 · 솔루션 매칭</button>
      <div className="match-card">
        {KIND.map(([k, t, label]) => {
          const refs = p.ctx[k].map((id) => t + ':' + id);
          const cols = MATCH_COLS[k]; const shown = refs.slice(0, cols);
          return (
            <button key={k} className={'mrow ' + t} data-ctx={k} onClick={() => go(k)} aria-label={label + ' ' + refs.length + '개 · ' + shown.map(shortOf).join(', ') + (readOnly ? ' · 보기' : ' · 보기 · 추가 · 삭제')}>
              <span className="mk"><Icon name={t} size={13} />{label}<b className="num">{refs.length}</b></span>
              {!refs.length ? (
                readOnly ? <span className="mnone">없음</span> : <span className="mnone"><Icon name="plus" size={12} stroke={2.4} />추가</span>
              ) : (
                <span className={'mpics c' + cols}>{shown.map((r, i) => <MatchPic key={r} r={r} more={i === shown.length - 1 && refs.length > cols ? refs.length - cols : 0} />)}</span>
              )}
            </button>
          );
        })}
        <span className="match-foot">{readOnly ? '눌러서 보기' : '눌러서 보기 · 추가 · 삭제'}</span>
      </div>
    </div>
  );
}

// stage: 'req' → 고객 요구사항 버블만 · 'match' → + 제품 · 솔루션 매칭 버블 · 'story' → + 파트(store.js stageOf)
// readOnly: Best Scenario 상세 보기(scenarios.jsx ScenarioStoryboard) — 같은 버블 · 레이아웃 카드를 보기만 한다. 파트 넣기(+) · 끌어서 옮기기 ·
// PPT 레이아웃 추가 · AI로 나머지 구성 · 다음 파트가 없고, 버블 · 카드를 누르면 open 이 보기 전용 팝업을 띄운다. activePart = 팝업이 열린 파트 id.
export function StoryCanvas({ p, open, stage = 'story', pop = null, onReq, onMatch, viewerOpen, onOpenViewer, pageOf, readOnly = false, activePart = null, children }) {
  const reqOpen = !!pop && pop.t === 'req';
  const story = stage === 'story';
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(null); // {pid, before}
  const hc = useHoverCard();
  const ai = useAiCompose(p);
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
  const addPart = (type, at) => {
    const id = uid('s');
    const free = type === 'free';
    const part = { id, type: type || null, name: type && !free ? PARTS[type].label : '', items: type ? PARTS[type].items.slice() : [], form: free ? 'free' : 'list', text: '', done: false, layouts: [] };
    update(p.id, (d) => { const i = at == null ? d.parts.length : at; d.parts.splice(i, 0, part); });
    open({ type: 'part', partId: id, isNew: true });
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
  let order = 0;
  return (
    <div className={'canvas-wrap' + (readOnly ? ' ro' : '')}>
    <div className="canvas" ref={canvasRef}>
      <div className="board" style={{ zoom }}>
        {/* trigger node: requirements — 누르면 버블 오른쪽에 고객 요구사항 팝업(requirements.jsx ReqPopup).
            요구사항을 저장하기 전(stage 'req')에는 이 버블 하나만 둔다. */}
        <div className={'start-node' + (reqOpen ? ' on' : '')}>
          <div className="node-top"><button className="node" onClick={onReq} aria-expanded={reqOpen} aria-controls="rq-pop" aria-label={reqOpen ? '고객 요구사항 닫기' : '고객 요구사항 열기'}><Icon name="clip" size={28} /></button></div>
          <button className="node-name" onClick={onReq} aria-expanded={reqOpen} aria-controls="rq-pop">고객 요구사항</button>
          <button className="start-card" onClick={onReq} aria-expanded={reqOpen} aria-controls="rq-pop" aria-label={'고객 요구사항 열기 · ' + (p.customer || '고객사 미정')}>
            <b>{p.customer || '고객사 미정'}</b>
            <span>{p.ind && IND[p.ind] ? IND[p.ind].name : '업종 자동 추론'}</span>
          </button>
        </div>
        {stage !== 'req' && <>
        <div className="conn" />
        <MatchNode p={p} isOpen={!!pop && pop.t === 'match'} onOpen={onMatch} readOnly={readOnly} />
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
          return (
            <React.Fragment key={s.id}>
              <div className={'conn' + (isNew ? ' conn-new' : '')}>{!readOnly && <button className="conn-plus" aria-label={no + '번째 자리에 파트 넣기'} title="여기에 새 파트 넣기" onClick={(e) => { e.stopPropagation(); addPart(null, i); }}><Icon name="plus" size={14} stroke={2.4} /></button>}
              </div>
              <div className={'col ' + hue + (isNew ? ' col-new' : '') + (activePart === s.id ? ' on' : '')} data-pid={s.id}>
                <div className="node-top">
                  <button className={'node ' + (s.done ? 'done' : 'draft')} onClick={() => open({ type: 'part', partId: s.id })} aria-label={s.name + (readOnly ? ' 파트 보기' : ' 파트 편집')} aria-expanded={readOnly ? activePart === s.id : undefined}>
                    <Icon name={partIcon(s)} size={28} />
                    <span className="order">{no}</span>
                  </button>
                </div>
                <button className="node-name" onClick={() => open({ type: 'part', partId: s.id })}>{s.name || '이름 없는 파트'}</button>
                <div className="laystack" onDragOver={(e) => { if (drag) { e.preventDefault(); if (!drop || drop.pid !== s.id) setDrop({ pid: s.id, before: null }); } }} onDrop={(e) => { e.preventDefault(); doDrop(s.id, drop && drop.pid === s.id ? drop.before : null); }}>
                  {vis.map((x) => {
                    const l = L[x.f];
                    return (
                      <React.Fragment key={x.uid}>
                        {drop && drop.pid === s.id && drop.before === x.uid && <div className="dropline" />}
                        <div className={'lcard st-' + (readOnly ? 'view' : x.status) + (drag === x.uid ? ' dragging' : '')} draggable={!readOnly}
                          onDragStart={(e) => { if (readOnly) return; setDrag(x.uid); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.uid); hc.hide(); }}
                          onDragEnd={() => { setDrag(null); setDrop(null); }}
                          onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const before = e.clientY < r.top + r.height / 2 ? x.uid : (vis[vis.indexOf(x) + 1] || {}).uid || null; setDrop({ pid: s.id, before }); }}
                          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); doDrop(s.id, drop && drop.pid === s.id ? drop.before : x.uid); }}
                          onClick={() => open({ type: 'detail', partId: s.id, uid: x.uid })}
                          onMouseEnter={(e) => !drag && hc.show(l, e.currentTarget)} onMouseLeave={hc.hide}
                          role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') open({ type: 'detail', partId: s.id, uid: x.uid }); }} aria-label={l.name + ' 열기'}>
                          <Slide f={x.f} ov={x.ov} width={322} lazy pageNo={pageOf(x.uid)} />
                          <FavButton f={x.f} ov={x.ov} from={(readOnly ? 'Best Scenario · ' : '제안서 · ') + (p.title || '')} />
                          {!readOnly && <span className="grip" title="끌어서 순서 바꾸기"><Icon name="grip" size={14} stroke={3} /></span>}
                          <span className="pg">{pageOf(x.uid)}</span>
                          <div className="lcard-meta"><span className="nm">{l.name}</span>{!readOnly && <StatusBadge s={x.status} />}</div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {drop && drop.pid === s.id && drop.before === null && <div className="dropline" />}
                  {drag && <div className={'dropend' + (drop && drop.pid === s.id && drop.before === null ? ' over' : '')} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrop({ pid: s.id, before: null }); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); doDrop(s.id, null); }} />}
                </div>
                {!readOnly && <div className="col-actions">
                  <button className="btn btn-primary btn-sm" disabled={!s.done} onClick={() => open({ type: 'picker', partId: s.id, mode: 'rec' })} title={s.done ? '파트에 맞는 레이아웃 추천 보기' : '파트 내용을 작성 완료하면 추천을 받을 수 있어요'}><Icon name="plus" size={14} stroke={2.4} />PPT 레이아웃 추가</button>
                </div>}
                {!readOnly && !s.done && <span className="lock-note">파트 내용을 <b>작성 완료</b>하면 추천을 받을 수 있어요</span>}
              </div>
            </React.Fragment>
          );
        })}
        {story && !readOnly && ai.busy && <GhostParts n={ai.n} onStop={ai.stop} />}
        {story && !readOnly && !ai.busy && <>
        <div className="conn" />
        <div className={'end-node' + (nParts ? '' : ' first')}>
          {nParts === 0 ? (
            <>
              <div className="node-top"><button className="end-plus pulse" aria-label="첫 번째 파트 직접 만들기" onClick={(e) => { e.stopPropagation(); addPart(null); }}><Icon name="plus" size={30} stroke={2} /></button></div>
              <span className="node-name" style={{ color: 'var(--accent)' }}>첫 번째 파트</span>
              <CandCard p={p} afterIndex={-1} title="첫 번째 파트를 골라 주세요" sub="요구사항 맥락으로 고른 후보예요. 고르면 이름과 내용이 미리 채워져요." onPick={(t) => addPart(t)} onCustom={() => addPart(null)} />
              {ai.jobBusy ? <button className="btn btn-ghost btn-sm end-ai" disabled><span className="spin" />{ai.submitting ? '서버에 요청하는 중' : '서버에서 구성하는 중'}</button>
                : <button className="btn btn-ghost btn-sm end-ai" onClick={ai.start}><Icon name="sparkle" size={13} />AI로 나머지 구성</button>}
            </>
          ) : (
            <>
              <div className="node-top"><button className="end-plus pulse" aria-label="다음 파트 추가" onClick={(e) => { e.stopPropagation(); addPart(null); }}><Icon name="plus" size={30} stroke={2} /></button></div>
              <span className="node-name" style={{ color: 'var(--accent)' }}>다음 파트</span>
              <span className="story-empty-hint">{nLay ? '레이아웃 ' + nLay + '장 · 끌어서 순서를 바꿀 수 있어요' : '각 파트에 PPT 레이아웃을 추가해 보세요'}</span>
              {ai.jobBusy ? <button className="btn btn-ghost btn-sm end-ai" disabled><span className="spin" />{ai.submitting ? '서버에 요청하는 중' : '서버에서 구성하는 중'}</button>
                : <button className="btn btn-ghost btn-sm end-ai" onClick={ai.start}><Icon name="sparkle" size={13} />AI로 나머지 구성</button>}
            </>
          )}
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
      {!readOnly && <AgentDock p={p} reqOpen={reqOpen} onReq={onReq} />}
      {children}
    </div>
  );
}
