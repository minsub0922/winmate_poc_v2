// 제품 · 솔루션 매칭 popup — beside the Storyboard 매칭 bubble (bubblepop.jsx). Opens when the requirements are saved and
// when the bubble is clicked: industry (pick or type your own) + per kind: linked 제품 · 솔루션 · 유관사례 as image tiles
// (사진 + 이름 + 태그 한 줄 — 사양 · 공간 · 연동 · 성과는 hover · 클릭 · 포커스로 여는 상세에서), then a '+ 추가' tile
// (→ full list in a directory explorer) and a '추천' tile with a few thumbnails (→ all recommendations), in the same grid.
// 저장 closes it; at the matching stage it also starts the parts (첫 번째 파트 appears).
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { update } from '../repositories/proposals.js';
import { DeleteButton, Icon, toast } from './common.jsx';
import { BubblePopup } from './bubblepop.jsx';
import { INDUSTRIES, IND, refInfo } from '../services/catalog.js';
import { inferIndustry, recommendContext, reqText } from '../services/search.js';
import { Thumb } from './Thumbs.jsx';
import { KIND, RefCard, metaOf, shortOf } from './refcard.jsx';
import { useDetailPeek } from './reference-detail.jsx';
import { removeRef } from './requirements.jsx';
import { ContextExplorer, totalOf, startFor, REC_MAX } from './ctxexplorer.jsx';
import { HistoryReuse } from './history-reuse.jsx';

// ---------- saved state ----------
const hashStr = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + s.length; };
/** Fingerprint of the requirements (자유형식 · 입력 폼 · 첨부) — what 저장 in the requirements popup records. */
export function reqSig(p) {
  const files = (p.req.files || []).map((f) => [f.name, f.size, f.memo || '']);
  return hashStr(JSON.stringify([p.req.free, p.req.form, files]));
}
// saved before the matching popup split off: the fingerprint also covered industry + linked context
const legacySig = (p) => { const files = (p.req.files || []).map((f) => [f.name, f.size, f.memo || '']); return hashStr(JSON.stringify([p.req.free, p.req.form, files, p.ind || null, p.indName || '', p.ctx])); };
export const isReqSaved = (p) => !!p.reqSaved && (p.reqSaved === reqSig(p) || p.reqSaved === legacySig(p));
export function industryLabel(p) {
  if (p.indName) return p.indName;
  return p.ind && IND[p.ind] ? IND[p.ind].name : '';
}

// ---------- industry: pick from the list or type your own ----------
function IndustryCombo({ p }) {
  const guess = inferIndustry(reqText(p));
  const cur = industryLabel(p);
  const [q, setQ] = useState(cur);
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  useEffect(() => { setQ(industryLabel(p)); }, [p.ind, p.indName]);
  const n = q.trim().toLowerCase();
  const list = INDUSTRIES.filter((i) => !n || n === cur.toLowerCase() || i.name.toLowerCase().replace(/\s/g, '').includes(n.replace(/\s/g, '')) || (i.samples || []).some((s) => s.toLowerCase().includes(n)));
  const pick = (code) => { update(p.id, (d) => { d.ind = code; d.indName = null; }); setOpen(false); setAct(-1); };
  const commit = () => {
    const t = q.trim();
    if (!t) { update(p.id, (d) => { d.ind = null; d.indName = null; }); return; }
    if (t === cur) return;
    const exact = INDUSTRIES.find((i) => i.name === t || i.name.replace(/\s/g, '') === t.replace(/\s/g, ''));
    if (exact) { pick(exact.code); return; }
    update(p.id, (d) => { d.indName = t; d.ind = inferIndustry(t) || null; });
  };
  const note = p.indName
    ? (p.ind && IND[p.ind] ? '직접 입력 · 추천은 ‘' + IND[p.ind].name + '’ 기준으로 해요' : '직접 입력 · 맞는 업종 분류가 없어 요구사항 내용으로 추천해요')
    : p.ind ? '이 업종에 맞춘 레이아웃 · 제품 · 사례를 먼저 추천해요' : guess ? '비워 두면 요구사항에서 추론한 ‘' + IND[guess].name + '’로 추천해요' : '업종을 정하면 추천이 더 정확해져요';
  return (
    <div className="cc-ind">
      <label className="lbl" htmlFor="cc-ind-in">업종</label>
      <div className="cc-combo">
        <Icon name="building" size={15} />
        <input id="cc-ind-in" className="input" value={q} autoComplete="off" role="combobox" aria-expanded={open && list.length > 0} aria-controls="cc-ind-list"
          placeholder={guess ? '자동 · ' + IND[guess].name + ' (선택하거나 직접 입력)' : '업종 선택 또는 직접 입력'}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); commit(); }, 140)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAct((a) => Math.min(list.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(-1, a - 1)); }
            else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (open && act >= 0 && list[act]) pick(list[act].code); else { commit(); setOpen(false); } }
            else if (e.key === 'Escape' && open) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); }
          }} />
        {(p.ind || p.indName) && <DeleteButton type="button" className="cc-x" aria-label="업종 지우기" onClick={() => { update(p.id, (d) => { d.ind = null; d.indName = null; }); setQ(''); }}><Icon name="x" size={13} /></DeleteButton>}
        {open && list.length > 0 && (
          <div className="cc-list" id="cc-ind-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
            {list.map((i, k) => (
              <button key={i.code} type="button" role="option" aria-selected={k === act || p.ind === i.code} className={k === act ? 'act' : ''} onClick={() => pick(i.code)} onMouseEnter={() => setAct(k)}>
                <span>{i.name}</span><span className="faint num">사례 {i.cases}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="cc-note">{note}</span>
      {!p.ind && !p.indName && guess && <button type="button" className="cc-guess" onClick={() => pick(guess)}><Icon name="sparkle" size={12} />추론 · {IND[guess].name} 적용</button>}
    </div>
  );
}

// ---------- cards ----------
/** Linked item = image tile: photo + name + one line (제품 · 솔루션: 분류 · 유관사례: 한 줄 요약 — 업종은 대개 같아 구분이 안 돼서).
 *  Just enough to tell them apart — 사양 · 공간 · 연동 · 성과 are in the detail (hover, click or focus · peek.jsx). × unlinks. */
function LinkedCard({ r, p, onRemove, peek }) {
  const info = refInfo(r); const m = metaOf(r, p);
  if (!info || !m) return null;
  const tag = (m.type === 'case' ? m.sub : m.tag) || m.tag || '';
  const own = (e) => e.target === e.currentTarget;
  return (
    <article className={'cc-card ' + m.type} tabIndex={0} aria-label={info.label + (tag ? ' · ' + tag : '') + ' · 상세 보기'}
      onMouseEnter={(e) => peek.show(r, e.currentTarget)} onMouseLeave={peek.hide}
      {...peek.detailProps(r)}
      onFocus={(e) => { if (own(e) && e.currentTarget.matches(':focus-visible')) peek.show(r, e.currentTarget, true); }}
      onBlur={(e) => { if (own(e)) peek.hide(e); }}>
      <Thumb r={r} />
      <b className="cc-name" title={info.label}>{info.label}</b>
      {tag && <span className="cc-tag" title={tag}>{tag}</span>}
      <DeleteButton type="button" className="cc-rm" onClick={(e) => { e.stopPropagation(); peek.hide(); onRemove(r); }} aria-label={info.label + ' 연결 해제'} title="연결 해제"><Icon name="x" size={13} stroke={2.4} /></DeleteButton>
    </article>
  );
}
/** '+ 추가' — opens the full list (directory explorer) */
function AddCard({ kind, t, label, onOpen }) {
  return (
    <button type="button" className={'cc-addcard ' + t} onClick={onOpen} aria-label={label + ' 추가 — 전체 목록 열기'}>
      <span className="cc-plus"><Icon name="plus" size={22} stroke={2.4} /></span>
      <span className="cc-at"><b>{label} 추가</b><span className="num">전체 {totalOf(kind)}개</span></span>
    </button>
  );
}
/** '추천' — a few recommendation thumbnails; opens every recommendation */
function RecCard({ recs, t, label, onOpen }) {
  const pics = recs.slice(0, 4);
  return (
    <button type="button" className={'cc-reccard ' + t + (recs.length ? '' : ' none')} onClick={onOpen}
      title={recs.length ? recs.slice(0, 6).map((r) => shortOf(r.ref) || r.label).join(' · ') + (recs.length > 6 ? ' 외' : '') : undefined}
      aria-label={recs.length ? '추천 ' + label + ' ' + recs.length + '개 전체 보기' : '추천 ' + label + ' 없음 — 추천 목록 열기'}>
      <span className="cc-rc-h"><Icon name="sparkle" size={12} />추천 {label}</span>
      {recs.length ? (
        <span className="cc-rc-pics" aria-hidden="true">
          {pics.map((r, i) => <span key={r.ref} className="cc-rc-pic"><Thumb r={r.ref} />{i === 3 && recs.length > 4 && <span className="cc-rc-more num">+{recs.length - 3}</span>}</span>)}
          {Array.from({ length: Math.max(0, 4 - pics.length) }, (_, i) => <span key={'e' + i} className="cc-rc-pic blank" />)}
        </span>
      ) : <span className="cc-rc-none">업종 · 요구사항을 채우면 추천돼요</span>}
      <span className="cc-rc-go num">{recs.length ? '전체 ' + recs.length + '개' : '추천 보기'}<Icon name="chev" size={11} stroke={2.6} /></span>
    </button>
  );
}

function Section({ p, kind, ind, peek, onExplore }) {
  const [, t, label] = KIND.find((x) => x[0] === kind);
  const list = p.ctx[kind];
  const recs = recommendContext(p, ind, kind, REC_MAX);
  return (
    <section className={'cc-sec ' + t} aria-labelledby={'cc-h-' + kind}>
      <h3 className="cc-h" id={'cc-h-' + kind}><Icon name={t} size={15} />{label}<b className="num">{list.length}</b></h3>
      <div className={'cc-grid ' + t}>
        {list.map((id) => { const r = t + ':' + id; return <LinkedCard key={r} r={r} p={p} peek={peek} onRemove={(x) => { removeRef(p.id, x); toast(refInfo(x).label + ' 연결을 해제했어요'); }} />; })}
        <AddCard kind={kind} t={t} label={label} onOpen={() => { peek.hide(); onExplore(kind, startFor(kind, ind)); }} />
        <RecCard recs={recs} t={t} label={label} onOpen={() => { peek.hide(); onExplore(kind, 'rec'); }} />
      </div>
    </section>
  );
}

/** 제품 · 솔루션 매칭 popup. focus: a kind to bring into view ('products' | 'solutions' | 'cases'). */
export function MatchPopup({ p, focus: focus0, onClose, onSaved }) {
  const peek = useDetailPeek(p);
  // '+ 추가' · '추천' open the explorer in this same popup (← back to 매칭), not a modal
  const [ex, setEx] = useState(null); // { kind, start }
  const [back, setBack] = useState(null); // { k, n } — coming back from the explorer: bring that kind into view
  const focus = back && (!focus0 || back.n > focus0.n) ? back : focus0;
  const body = useRef(null);
  const ind = p.ind || inferIndustry(reqText(p));
  const atMatch = !p.parts.length && p.stage !== 'story';
  useEffect(() => {
    if (ex || !focus || !focus.k) return undefined;
    // after the popup is placed (it is sized only then), bring that kind's section into view
    const t = setTimeout(() => {
      const b = body.current; const el = b && b.querySelector('#cc-h-' + focus.k); if (!el) return;
      const sec = el.closest('.cc-sec'); b.scrollTo({ top: Math.max(0, b.scrollTop + sec.getBoundingClientRect().top - b.getBoundingClientRect().top - 12), behavior: 'smooth' });
      sec.classList.remove('flash'); void sec.offsetWidth; sec.classList.add('flash');
    }, 90);
    return () => clearTimeout(t);
  }, [ex, focus && focus.k, focus && focus.n]);
  const close = () => { peek.hide(); onClose(); };
  const toMatch = () => { setBack({ k: ex.kind, n: Date.now() }); setEx(null); };
  if (ex) {
    const [, t, label] = KIND.find((x) => x[0] === ex.kind);
    return (
      <ContextExplorer key={ex.kind + ex.start} p={p} kind={ex.kind} start={ex.start} ind={ind} onClose={toMatch} closeLabel="뒤로"
        frame={(v) => (
          <BubblePopup cls="mt" extra={'mt-ex ' + t} fill anchor=".match-node .node" icon={<Icon name={t} size={17} />} title={v.title}
            sub={<span className="bp-sub"><span>{v.sub}</span></span>}
            back={{ label: '제품 · 솔루션 매칭으로 돌아가기', onClick: toMatch }} onEsc={toMatch} onClose={close} closeLabel={label + ' 추가 닫기'}
            bodyClass="ex-pbody" footerClass="ex-pf" footer={v.footer}>
            {v.body}
          </BubblePopup>
        )} />
    );
  }
  const save = () => {
    peek.hide();
    // 매칭 단계 → 저장하면 파트가 시작됨(첫 번째 파트 버블 · 후보)
    update(p.id, (d) => { d.stage = 'story'; });
    toast(atMatch ? '저장했어요 · 이제 첫 번째 파트를 골라 주세요' : '제품 · 솔루션 매칭을 저장했어요');
    onSaved(atMatch);
  };
  return (
    <BubblePopup cls="mt" anchor=".match-node .node" icon={<Icon name="link" size={17} />} title="제품 · 솔루션 매칭" onClose={close} bodyRef={body}
      sub={<span className="bp-sub num">{KIND.map(([k, , l]) => <span key={k}>{l} <b>{p.ctx[k].length}</b></span>)}</span>}
      footer={<>
        <span className="bp-note">{atMatch ? '저장하면 파트 구성을 시작해요' : '연결을 바꾸면 파트 추천 · 레이아웃 추천 · AI 채우기에 바로 반영돼요'}</span>
        <span className="sp" />
        <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} />저장</button>
      </>}>
      <HistoryReuse p={p} kind="ctx" />
      <p className="bp-intro">업종과 연결된 제품 · 솔루션 · 유관사례가 Storyboard 추천 · 레이아웃 추천 · AI 채우기의 근거가 돼요. ‘+ 추가’는 전체 목록, ‘추천’은 추천 목록을 이 팝업 안에서 열어요.</p>
      <div className="cc-top">
        <IndustryCombo p={p} />
      </div>
      {KIND.map(([k]) => <Section key={k} p={p} kind={k} ind={ind} peek={peek} onExplore={(kind, start) => setEx({ kind, start })} />)}
      {peek.node}
    </BubblePopup>
  );
}
