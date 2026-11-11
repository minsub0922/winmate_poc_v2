// '공간 구성' 팝업 — 매칭 카드 오른쪽(bubblepop.jsx beside), 매칭 카드 아래 '공간 구성' 버튼으로 연다.
//   1 업종 확인   고객 요구사항으로 추론한 업종(버티컬)이 맞는지 묻고, 바로 확인하거나 목록에서 고친다.
//   2 공간 후보   확정 업종 · 요구사항 · 선택 제품으로 vertical_space_product.json 의 공간을 추려 후보 3개를 보여 준다.
//   3 제품 배치   고른 후보의 공간마다 제품을 추론해 넣고, 카드(이미지 + 이름 · hover 상세)를 끌어 다른 공간으로 옮긴다.
//   완료 → '공간 조감도를 만들까요?' — 만들면 팝업을 모두 닫고 '공간 구성' 버튼이 '조감도 생성 중'이 된다(ProposalPage onBirdseye).
// 단계는 이 탭에서 기억해 두어(services/space-plan.js drafts) 닫았다 열어도 이어진다. 저장된 구성이 있으면 3단계에서 연다.
import React, { useEffect, useRef, useState } from 'react';
import { Icon, toast } from './common.jsx';
import { BubblePopup } from './bubblepop.jsx';
import { Thumb } from './Thumbs.jsx';
import { useDetailPeek } from './reference-detail.jsx';
import { P } from '../services/catalog.js';
import { groupLabel, moveProduct, spacePool, SPACE_COLORS } from '../domain/proposals/space-plan.js';
import { loadSpaceData, inferVertical, inferCandidates, inferMapping, savePlan, spaceErrorText, getSpaceDraft, setSpaceDraft } from '../services/space-plan.js';

const STEPS = [['industry', '업종 확인'], ['candidates', '공간 후보'], ['mapping', '제품 배치']];

function initial(p) {
  const draft = getSpaceDraft(p.id);
  if (draft) return draft;
  const plan = p.spacePlan;
  if (plan && plan.vertical && Array.isArray(plan.spaces) && plan.spaces.length) {
    return { step: 'mapping', vertical: plan.vertical.id, guess: null, cands: null,
      cand: { id: 'saved', title: plan.title, summary: plan.summary, spaces: plan.spaces.map((s) => s.id) },
      spaces: plan.spaces.map((s) => ({ ...s, products: [...(s.products || [])] })) };
  }
  return { step: 'industry', vertical: null, guess: null, cands: null, cand: null, spaces: null };
}

function Loading({ text, rows = 1 }) {
  return (
    <div className="spl-loading" role="status">
      <span className="spl-load-t"><span className="spin" aria-hidden="true" />{text}</span>
      {Array.from({ length: rows }, (_, i) => <span key={i} className="spl-shim shimmer" aria-hidden="true" />)}
    </div>
  );
}
function ErrorBox({ text, onRetry, children }) {
  return (
    <div className="spl-err" role="alert">
      <span><Icon name="alert" size={14} />{text}</span>
      <div className="spl-row">{children}{onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}><Icon name="refresh" size={13} />다시 시도</button>}</div>
    </div>
  );
}

// ---------- 1. 업종 ----------
function VerticalPicker({ idx, current, guess, onPick, onCancel }) {
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase().replace(/\s/g, '');
  const list = idx.verticals.filter((v) => !n || [v.name, v.groupName, v.size_segment, v.size_criteria, ...v.spaces.map((s) => s.name)].join(' ').toLowerCase().replace(/\s/g, '').includes(n));
  const groups = [];
  for (const v of list) { const g = groups.find((x) => x[0] === v.group); if (g) g[1].push(v); else groups.push([v.group, [v]]); }
  return (
    <div className="spl-pick">
      <div className="spl-pick-q">
        <Icon name="search" size={14} />
        <label className="sr" htmlFor="spl-pick-in">업종 검색</label>
        <input id="spl-pick-in" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="업종 · 규모 · 공간으로 찾기 (예: 병원, 호텔, 카페)" autoComplete="off" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>닫기</button>
      </div>
      <div className="spl-pick-list" role="listbox" aria-label="업종 목록">
        {groups.length ? groups.map(([g, vs]) => (
          <div key={g} className="spl-pick-g" role="group" aria-label={groupLabel(idx, g)}>
            <span className="spl-pick-gh">{groupLabel(idx, g)}</span>
            {vs.map((v) => (
              <button key={v.id} type="button" role="option" aria-selected={v.id === current} className={'spl-pick-v' + (v.id === current ? ' on' : '')} onClick={() => onPick(v.id)}>
                <b>{v.name}</b><span>{v.size_segment}</span>{v.id === guess && <em>추론</em>}
              </button>
            ))}
          </div>
        )) : <p className="spl-empty">찾는 업종이 없어요. 다른 말로 찾아보세요.</p>}
      </div>
    </div>
  );
}
function IndustryStep({ idx, st, busy, err, onRetry, onConfirm }) {
  const [picking, setPicking] = useState(false);
  const g = st.guess && idx.byId.get(st.guess.id);
  const pick = (id) => { setPicking(false); onConfirm(id); };
  if (picking) return <VerticalPicker idx={idx} current={st.vertical || (g && g.id)} guess={g && !st.guess.current ? g.id : null} onPick={pick} onCancel={() => setPicking(false)} />;
  if (busy || (!g && !err)) return <Loading text="고객 요구사항으로 업종을 추론하고 있어요" rows={2} />;
  if (err || !g) {
    return <ErrorBox text={err || '업종을 추론하지 못했어요.'} onRetry={onRetry}><button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>목록에서 직접 고르기</button></ErrorBox>;
  }
  return (
    <div className="spl-ind">
      <div className="spl-guess">
        <span className="spl-lbl">{st.guess.current ? '지금 업종' : '고객 요구사항으로 추론한 업종'}</span>
        <b className="spl-vname">{g.name}</b>
        <span className="spl-vmeta">{groupLabel(idx, g.group)} · {g.size_segment}</span>
        {st.guess.reason && <p className="spl-reason"><Icon name="sparkle" size={12} />{st.guess.reason}</p>}
        {st.guess.current && <button type="button" className="spl-link spl-reinfer" onClick={onRetry}><Icon name="sparkle" size={12} />고객 요구사항으로 다시 추론</button>}
        <span className="spl-vspaces">{g.spaces.map((s) => <span key={s.id}>{s.name}</span>)}</span>
      </div>
      <p className="spl-q">이 업종이 맞나요?</p>
      <div className="spl-row">
        <button type="button" className="btn" onClick={() => setPicking(true)}><Icon name="edit" size={14} />다른 업종 고르기</button>
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(g.id)}><Icon name="check" size={15} />네, 맞아요</button>
      </div>
      {st.guess.alternatives && st.guess.alternatives.length > 0 && (
        <div className="spl-alts"><span>혹시 이 업종인가요?</span>{st.guess.alternatives.map((id) => idx.byId.get(id) && <button key={id} type="button" className="spl-alt" onClick={() => onConfirm(id)}>{idx.byId.get(id).name}</button>)}</div>
      )}
    </div>
  );
}

// ---------- 2. 후보 ----------
function CandidateStep({ idx, st, nProducts, busy, err, onRetry, onPick }) {
  if (busy || (!st.cands && !err)) return <Loading text="업종 공간에서 공간 구성 후보 3개를 추리고 있어요" rows={3} />;
  if (err || !st.cands) return <ErrorBox text={err || '후보를 만들지 못했어요.'} onRetry={onRetry} />;
  const names = new Map(spacePool(idx, st.vertical).map((s) => [s.id, s.name]));
  return (
    <div className="spl-cands" role="list">
      {st.cands.map((c, i) => (
        <button key={c.id} type="button" role="listitem" className={'spl-cand' + (st.cand && st.cand.id === c.id ? ' on' : '')} onClick={() => onPick(c)}>
          <span className="spl-cand-h"><em className="num">후보 {i + 1}</em><b>{c.title}</b><Icon name="chev" size={14} className="spl-cand-go" /></span>
          {c.summary && <span className="spl-cand-s">{c.summary}</span>}
          <span className="spl-cand-sp">{c.spaces.map((id, k) => <span key={id} className={'spl-chip spl-c' + (k % SPACE_COLORS)}><i className="spl-dot" />{names.get(id) || id}</span>)}</span>
          <span className="spl-cand-fit num"><Icon name="product" size={12} />선택 제품 {c.fit}/{nProducts}개가 이 공간들의 제품군과 맞아요</span>
        </button>
      ))}
    </div>
  );
}

// ---------- 3. 배치 ----------
function MoveMenu({ spaces, from, onMove, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.querySelector('button') && ref.current.querySelector('button').focus(); }, []);
  return (
    <div ref={ref} className="spl-menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) onClose(); }} onClick={(e) => e.stopPropagation()}>
      <span className="spl-menu-h">옮길 공간</span>
      {spaces.filter((s) => s.id !== from).map((s) => (
        <button key={s.id} type="button" role="menuitem" className={'spl-c' + s.color} onClick={() => onMove(s.id)}><i className="spl-dot" />{s.name}</button>
      ))}
      {from != null && <button type="button" role="menuitem" className="rest" onClick={() => onMove(null)}><i className="spl-dot" />미배치로 빼기</button>}
    </div>
  );
}
function SpaceCard({ id, from, peek, drag, setDrag, spaces, onMove }) {
  const x = P[id]; const r = 'product:' + id;
  const [menu, setMenu] = useState(false);
  if (!x) return null;
  return (
    <div className={'spl-card' + (drag && drag.pid === id && drag.from === from ? ' dragging' : '') + (menu ? ' menu' : '')} draggable data-ref={r}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r); peek.hide(); setDrag({ pid: id, from }); }}
      onDragEnd={() => setDrag(null)}
      tabIndex={0} role="button" aria-label={x.name + ' · 끌어서 다른 공간으로 옮기기 · Enter로 옮길 공간 고르기'}
      onMouseEnter={(e) => { if (!drag) peek.show(r, e.currentTarget); }} onMouseLeave={peek.hide}
      onFocus={(e) => { if (e.target === e.currentTarget && e.currentTarget.matches(':focus-visible')) peek.show(r, e.currentTarget, true); }}
      onBlur={(e) => { if (e.target === e.currentTarget) peek.hide(e); }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); peek.hide(); setMenu(true); } }}>
      <Thumb r={r} />
      <span className="spl-cname" title={x.name}>{x.name}</span>
      <button type="button" className="spl-mv" draggable={false} onClick={(e) => { e.stopPropagation(); peek.hide(); setMenu((v) => !v); }} aria-label={x.name + ' 옮기기'} aria-haspopup="menu" aria-expanded={menu} title="다른 공간으로 옮기기"><Icon name="dots" size={14} stroke={2.6} /></button>
      {menu && <MoveMenu spaces={spaces} from={from} onClose={() => setMenu(false)} onMove={(to) => { setMenu(false); onMove(id, from, to); }} />}
    </div>
  );
}
function MappingStep({ idx, p, st, busy, err, onRetry, onMove, peek }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(undefined);
  if (busy || (!st.spaces && !err)) return <Loading text="공간마다 선택 제품을 배치하고 있어요" rows={3} />;
  if (err || !st.spaces) return <ErrorBox text={err || '제품을 배치하지 못했어요.'} onRetry={onRetry} />;
  const linked = p.ctx.products.filter((id) => P[id]);
  const has = new Set(linked);
  const spaces = st.spaces.map((s, i) => ({ ...s, color: i % SPACE_COLORS, products: s.products.filter((id) => has.has(id)) }));
  const placed = new Set(spaces.flatMap((s) => s.products));
  const rest = linked.filter((id) => !placed.has(id));
  const zone = (key) => ({
    onDragOver: (e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(undefined); },
    onDrop: (e) => { e.preventDefault(); if (drag) onMove(drag.pid, drag.from, key); setDrag(null); setOver(undefined); },
  });
  const card = (id, s) => <SpaceCard key={(s ? s.id : '-') + ':' + id} id={id} from={s ? s.id : null} peek={peek} drag={drag} setDrag={setDrag} spaces={spaces} onMove={onMove} />;
  return (
    <div className={'spl-board' + (drag ? ' dragging' : '')}>
      {spaces.map((s) => (
        <section key={s.id} className={'spl-space spl-c' + s.color + (over === s.id ? ' over' : '')} data-space={s.id} aria-label={s.name + ' · 제품 ' + s.products.length + '개'} {...zone(s.id)}>
          <header className="spl-space-h"><i className="spl-dot" aria-hidden="true" /><b>{s.name}</b><span className="num">{s.products.length}</span></header>
          {s.note && <p className="spl-note">{s.note}</p>}
          <div className="spl-cards">{s.products.map((id) => card(id, s))}{!s.products.length && <span className="spl-drop">여기로 끌어다 놓으세요</span>}</div>
        </section>
      ))}
      <section className={'spl-space rest' + (over === null ? ' over' : '')} data-space="" aria-label={'미배치 · 제품 ' + rest.length + '개'} {...zone(null)}>
        <header className="spl-space-h"><i className="spl-dot" aria-hidden="true" /><b>미배치</b><span className="num">{rest.length}</span></header>
        <div className="spl-cards">{rest.map((id) => card(id, null))}{!rest.length && <span className="spl-drop">모든 제품을 배치했어요</span>}</div>
      </section>
    </div>
  );
}

// ---------- 조감도 질문 ----------
function AskBirdseye({ nSpaces, nProducts, onLater, onMake, onBack }) {
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.querySelector('.btn-primary') && ref.current.querySelector('.btn-primary').focus(); }, []);
  return (
    <div className="spl-ask" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onBack(); } }}>
      <div ref={ref} className="spl-ask-card" role="alertdialog" aria-modal="true" aria-labelledby="spl-ask-h" aria-describedby="spl-ask-d">
        <span className="spl-ask-ic" aria-hidden="true"><Icon name="cube" size={22} /></span>
        <h3 id="spl-ask-h">공간 조감도를 만들까요?</h3>
        <p id="spl-ask-d">공간 {nSpaces}개 · 제품 {nProducts}개 배치로 3D 공간 조감도를 만들어요. 시간이 조금 걸려서 팝업을 닫고 ‘공간 구성’ 버튼에서 진행 상황을 보여 드려요.</p>
        <div className="spl-row">
          <button type="button" className="btn" onClick={onLater}>나중에</button>
          <button type="button" className="btn btn-primary" onClick={onMake}><Icon name="cube" size={15} />조감도 만들기</button>
        </div>
      </div>
    </div>
  );
}

export function SpacePlanPopup({ p, onClose, onBirdseye }) {
  const pRef = useRef(p); pRef.current = p;
  const [idx, setIdx] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [st, setSt] = useState(() => initial(p));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState(null); // { kind, text }
  const [ask, setAsk] = useState(false);
  const ctrl = useRef(null);
  const peek = useDetailPeek(p);
  useEffect(() => { setSpaceDraft(p.id, st); }, [st]);
  useEffect(() => {
    let alive = true;
    loadSpaceData().then((x) => { if (alive) setIdx(x); }, (e) => { if (alive) setLoadErr(e.message || '공간 자료를 불러오지 못했어요.'); });
    return () => { alive = false; ctrl.current && ctrl.current.abort(); };
  }, []);
  // a saved vertical that the data no longer has → start over from 업종
  useEffect(() => { if (idx && st.vertical && !idx.byId.has(st.vertical)) setSt({ step: 'industry', vertical: null, guess: null, cands: null, cand: null, spaces: null }); }, [idx]);
  const run = async (kind, call, onOk) => {
    if (ctrl.current) ctrl.current.abort();
    const c = new AbortController(); ctrl.current = c;
    setBusy(kind); setErr(null);
    const r = await call(c.signal);
    if (c.signal.aborted) return;
    setBusy('');
    if (r.ok) onOk(r); else setErr({ kind, text: spaceErrorText(r) });
  };
  const guess = () => run('industry', (signal) => inferVertical(pRef.current, idx, { signal }), (r) => setSt((s) => ({ ...s, guess: { id: r.vertical, reason: r.reason, alternatives: r.alternatives } })));
  const cands = () => run('candidates', (signal) => inferCandidates(pRef.current, idx, st.vertical, { signal }), (r) => setSt((s) => ({ ...s, cands: r.candidates })));
  const mapping = () => run('mapping', (signal) => inferMapping(pRef.current, idx, st.vertical, st.cand, { signal }), (r) => setSt((s) => ({ ...s, spaces: r.spaces })));
  // each step asks the model once when it opens without an answer (a failure waits for 다시 시도)
  useEffect(() => {
    if (!idx || busy || (err && err.kind === st.step)) return;
    if (st.step === 'industry' && !st.guess) guess();
    else if (st.step === 'candidates' && !st.cands) cands();
    else if (st.step === 'mapping' && !st.spaces && st.cand) mapping();
  }, [idx, st.step, !!st.guess, !!st.cands, !!st.spaces, busy, err]);
  const to = (step, patch = {}) => { if (ctrl.current) ctrl.current.abort(); setBusy(''); setErr(null); setSt((s) => ({ ...s, ...patch, step })); };
  const confirmVertical = (id) => to('candidates', st.vertical === id && st.cands ? { vertical: id } : { vertical: id, cands: null, cand: null, spaces: null });
  const pickCand = (c) => to('mapping', st.cand && st.cand.id === c.id && st.spaces ? {} : { cand: c, spaces: null });
  const back = st.step === 'candidates' ? { label: '업종 확인으로 돌아가기', onClick: () => to('industry', st.guess ? {} : { guess: { id: st.vertical, reason: '', alternatives: [], current: true } }) }
    : st.step === 'mapping' ? { label: '공간 후보로 돌아가기', onClick: () => to('candidates') } : null;
  const onMove = (pid, from, toId) => setSt((s) => ({ ...s, spaces: moveProduct(s.spaces, pid, from, toId) }));
  const linked = new Set(p.ctx.products);
  const nPlaced = st.spaces ? new Set(st.spaces.flatMap((s) => s.products.filter((id) => linked.has(id)))).size : 0;
  const vertical = idx && st.vertical && idx.byId.get(st.vertical);
  const store = () => {
    savePlan(p.id, { vertical, candidate: st.cand || {}, spaces: st.spaces });
    setSpaceDraft(p.id, null);
  };
  const later = () => { store(); toast('공간 구성을 저장했어요 · 매칭 카드의 제품이 공간별로 묶였어요'); onClose(); };
  const make = () => { store(); onBirdseye(); };
  const busyErr = (kind) => (err && err.kind === kind ? err.text : '');
  const stepNo = STEPS.findIndex(([k]) => k === st.step);
  return (
    <BubblePopup cls="spl" anchor=".match-node .node" beside=".match-node .match-card" fill icon={<Icon name="map" size={17} />} title="공간 구성" onClose={() => { peek.hide(); onClose(); }}
      back={back} onEsc={ask ? () => setAsk(false) : undefined} bodyClass="spl-body"
      sub={<span className="bp-sub spl-steps">{STEPS.map(([k, label], i) => <span key={k} className={i === stepNo ? 'on' : i < stepNo ? 'done' : ''}><em className="num">{i + 1}</em>{label}</span>)}</span>}
      footer={st.step === 'mapping' ? <>
        <span className="bp-note">카드를 끌어다 놓거나 ⋯ 버튼으로 다른 공간에 옮길 수 있어요 · 마우스를 올리면 상세</span>
        <span className="sp" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || !st.cand} onClick={mapping} title="고른 공간에 제품을 다시 추론해 배치해요"><Icon name="refresh" size={13} />다시 배치</button>
        <button type="button" className="btn btn-primary" disabled={!!busy || !st.spaces || !nPlaced} onClick={() => setAsk(true)} title={!nPlaced ? '제품을 한 개 이상 공간에 배치해 주세요' : undefined}><Icon name="check" size={15} />완료</button>
      </> : st.step === 'candidates' ? <>
        <span className="bp-note">후보를 고르면 공간마다 선택 제품을 배치해 드려요</span>
        <span className="sp" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={cands}><Icon name="refresh" size={13} />후보 다시 추론</button>
      </> : <><span className="bp-note">업종을 확정하면 그 업종의 공간에서 구성 후보를 추려요</span></>}>
      {(st.step !== 'industry' && vertical) && (
        <div className="spl-ctx">
          <span className="spl-ctx-v"><Icon name="building" size={13} /><b>{vertical.name}</b></span>
          {st.step === 'mapping' && st.cand && st.cand.title && <span className="spl-ctx-c"><Icon name="map" size={13} />{st.cand.title}</span>}
          <button type="button" className="spl-link" onClick={() => to('industry', { guess: { id: st.vertical, reason: '', alternatives: [], current: true } })}>업종 바꾸기</button>
        </div>
      )}
      {loadErr ? <ErrorBox text={loadErr} />
        : !idx ? <Loading text="업종 · 공간 자료를 불러오고 있어요" />
        : st.step === 'industry' ? <IndustryStep idx={idx} st={st} busy={busy === 'industry'} err={busyErr('industry')} onRetry={guess} onConfirm={confirmVertical} />
        : st.step === 'candidates' ? <CandidateStep idx={idx} st={st} nProducts={p.ctx.products.length} busy={busy === 'candidates'} err={busyErr('candidates')} onRetry={cands} onPick={pickCand} />
        : <MappingStep idx={idx} p={p} st={st} busy={busy === 'mapping'} err={busyErr('mapping')} onRetry={mapping} onMove={onMove} peek={peek} />}
      {ask && <AskBirdseye nSpaces={st.spaces.length} nProducts={nPlaced} onBack={() => setAsk(false)} onLater={later} onMake={make} />}
      {peek.node}
    </BubblePopup>
  );
}
