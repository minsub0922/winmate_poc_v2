// '공간 구성' 팝업(선택 기능) — 매칭 카드 오른쪽(bubblepop.jsx beside), 매칭 카드 아래 '공간 구성' 버튼으로 연다.
//   1 업종 확인   고객 요구사항 · 연결된 제품 · 솔루션 · 사례로 추론한 업종(버티컬)이 맞는지 묻고, 바로 확인하거나 목록에서 고친다.
//   2 공간 후보   직접 입력한 공간 버블로 구성하거나, 확정 업종의 공간(vertical_space_product.json) 중 연결된 제품 · 솔루션이 들어가는 공간으로 만든 후보 3개(후보마다 공간 1~6개).
//   3 제품 배치   고른 공간마다 제품을 추론해 넣는다. 카드(이미지 + 이름 · hover 상세)는 끌어 다른 공간으로 옮기고,
//                 … 메뉴로 다른 공간에 복사한다. 공간은 ×로 빼거나(제품은 미배치로) '공간 추가'로 넣는다. 공간마다 테두리 색이 다르고, 넣고 빼도 남은 공간의 색은 그대로다.
//   저장 → 구성을 저장하고 '3D 조감도를 만들까요?' — 만들면 팝업을 모두 닫고 조감도를 바로 만든다(ProposalPage onBirdseye). 아니면 저장만.
// 단계는 이 탭에서 기억해 두어(services/space-plan.js drafts) 닫았다 열어도 이어진다. 저장된 구성이 있으면 3단계에서 연다.
import React, { useEffect, useRef, useState } from 'react';
import { Icon, toast } from './common.jsx';
import { uid } from '../repositories/proposals.js';
import { BubblePopup } from './bubblepop.jsx';
import { Thumb } from './Thumbs.jsx';
import { useDetailPeek } from './reference-detail.jsx';
import { P } from '../services/catalog.js';
import { groupLabel, moveProduct, copyProduct, spacePool, spaceFit, withColors, addSpace, removeSpace, SPACE_COLORS, MIN_SPACES, MAX_SPACES } from '../domain/proposals/space-plan.js';
import { loadSpaceData, inferVertical, inferCandidates, inferMapping, savePlan, spaceErrorText, getSpaceDraft, setSpaceDraft, setSpaceBusy, linkedDss, newSpace, birdseyeOf } from '../services/space-plan.js';

const STEPS = [['industry', '업종 확인'], ['candidates', '공간 후보'], ['mapping', '제품 배치']];

function initial(p) {
  const draft = getSpaceDraft(p.id);
  if (draft) return draft;
  const plan = p.spacePlan;
  if (plan && plan.vertical && Array.isArray(plan.spaces) && plan.spaces.length) {
    return { step: 'mapping', vertical: plan.vertical.id, guess: null, cands: null,
      cand: { id: 'saved', title: plan.title, summary: plan.summary, spaces: plan.spaces.map((s) => s.id), customSpaces: plan.spaces.filter((s) => s.id.startsWith('custom-space-')).map((s) => ({ id: s.id, name: s.name, products: [] })) },
      customSpaces: plan.spaces.filter((s) => s.id.startsWith('custom-space-')).map((s) => ({ id: s.id, name: s.name, products: [] })),
      spaces: withColors(plan.spaces.map((s) => ({ ...s, products: [...(s.products || [])] }))) };
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
  if (busy || (!g && !err)) return <Loading text="고객 요구사항과 연결한 제품 · 솔루션 · 사례로 업종을 추론하고 있어요" rows={2} />;
  if (err || !g) {
    return <ErrorBox text={err || '업종을 추론하지 못했어요.'} onRetry={onRetry}><button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>목록에서 직접 고르기</button></ErrorBox>;
  }
  return (
    <div className="spl-ind">
      <div className="spl-guess">
        <span className="spl-lbl">{st.guess.current ? '지금 업종' : '요구사항 · 연결 항목으로 추론한 업종'}</span>
        <b className="spl-vname">{g.name}</b>
        <span className="spl-vmeta">{groupLabel(idx, g.group)} · {g.size_segment}</span>
        {st.guess.reason && <p className="spl-reason"><Icon name="sparkle" size={12} />{st.guess.reason}</p>}
        {st.guess.current && <button type="button" className="spl-link spl-reinfer" onClick={onRetry}><Icon name="sparkle" size={12} />요구사항 · 연결 항목으로 다시 추론</button>}
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
const spaceKeyword = (text) => text.replace(/\s/g, '').toLowerCase();
function CustomCandidate({ st, keywords, onChange, onPick }) {
  const [error, setError] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef(null);
  const spaces = st.customSpaces || [];
  const text = st.customInput || '';
  const full = spaces.length >= MAX_SPACES;
  const query = spaceKeyword(text);
  const entered = new Set(spaces.map((s) => spaceKeyword(s.name)));
  const suggestions = query && !full ? keywords.filter((name) => spaceKeyword(name).includes(query) && !entered.has(spaceKeyword(name)))
    .sort((a, b) => Number(!spaceKeyword(a).startsWith(query)) - Number(!spaceKeyword(b).startsWith(query))).slice(0, 8) : [];
  const showSuggestions = suggestOpen && suggestions.length > 0;
  const add = (value = text) => {
    const name = value.replace(/\s+/g, ' ').trim();
    if (!name || full) return;
    if (spaces.some((s) => spaceKeyword(s.name) === spaceKeyword(name))) {
      setError('이미 추가한 공간이에요.'); return;
    }
    onChange({ customSpaces: [...spaces, { id: uid('custom-space-'), name, products: [] }], customInput: '' });
    setError(''); setActive(-1); setSuggestOpen(false); input.current?.focus();
  };
  const keyDown = (e) => {
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length) {
      e.preventDefault(); setSuggestOpen(true);
      setActive((i) => e.key === 'ArrowDown' ? (i + 1) % suggestions.length : (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape' && showSuggestions) {
      e.preventDefault(); e.stopPropagation(); setSuggestOpen(false); setActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault(); add(showSuggestions && active >= 0 ? suggestions[active] : text);
    }
  };
  return (
    <section className="spl-custom" aria-labelledby="spl-custom-title">
      <div className="spl-custom-h"><b id="spl-custom-title">직접 구성</b><span className="num">{spaces.length} / {MAX_SPACES}</span></div>
      {showSuggestions && <div id="spl-custom-suggestions" className="spl-custom-suggestions" role="listbox" aria-label="공간 자동완성">
        {suggestions.map((name, i) => <button key={name} id={'spl-custom-suggestion-' + i} type="button" role="option" tabIndex={-1}
          aria-selected={active === i} onMouseDown={(e) => e.preventDefault()} onClick={() => add(name)}>{name}</button>)}
      </div>}
      <div className="spl-custom-input">
        <label className="sr" htmlFor="spl-custom-name">직접 구성할 공간 이름</label>
        <input ref={input} id="spl-custom-name" role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? 'spl-custom-suggestions' : undefined} aria-activedescendant={showSuggestions && active >= 0 ? 'spl-custom-suggestion-' + active : undefined} value={text} maxLength={80} disabled={full} autoComplete="off" enterKeyHint="done"
          placeholder={full ? '공간을 모두 추가했어요' : '예: 로비, 고객 체험존, 상담실'} aria-describedby="spl-custom-error"
          onChange={(e) => { onChange({ customInput: e.target.value }); setError(''); setActive(-1); setSuggestOpen(true); }}
          onFocus={() => setSuggestOpen(true)} onBlur={() => setActive(-1)} onKeyDown={keyDown} />
        <button type="button" className="btn btn-sm" disabled={full || !text.trim()} onClick={() => add()}><Icon name="plus" size={13} />추가</button>
      </div>
      <span id="spl-custom-error" className="spl-custom-error" role="status">{error}</span>
      {spaces.length > 0 && <div className="spl-custom-bubbles" role="list" aria-label="직접 구성한 공간">
        {spaces.map((space, i) => <span key={space.id} role="listitem" className={'spl-chip spl-c' + (i % SPACE_COLORS)}>
          <i className="spl-dot" aria-hidden="true" /><span>{space.name}</span>
          <button type="button" aria-label={space.name + ' 버블 삭제'} onClick={() => { onChange({ customSpaces: spaces.filter((s) => s.id !== space.id) }); setError(''); }}><Icon name="x" size={12} /></button>
        </span>)}
      </div>}
      <button type="button" className="btn btn-primary btn-sm spl-custom-next" disabled={!spaces.length}
        onClick={() => onPick({ id: 'custom', title: '직접 구성', summary: '', spaces: spaces.map((s) => s.id), customSpaces: spaces })}>
        이 구성으로 제품 배치<Icon name="chev" size={13} />
      </button>
    </section>
  );
}
function CandidateStep({ idx, st, nProducts, busy, err, onRetry, onPick, onCustomChange }) {
  const pool = spacePool(idx, st.vertical);
  const names = new Map(pool.map((s) => [s.id, s.name]));
  const keywords = [...new Map([...pool, ...idx.spaces.values()].map((s) => [spaceKeyword(s.name), s.name])).values()];
  return (
    <div className="spl-cands">
      <CustomCandidate st={st} keywords={keywords} onChange={onCustomChange} onPick={onPick} />
      {busy || (!st.cands && !err) ? <Loading text="연결한 제품 · 솔루션이 들어가는 공간으로 후보 3개를 만들고 있어요" rows={3} />
        : err || !st.cands ? <ErrorBox text={err || '후보를 만들지 못했어요.'} onRetry={onRetry} />
        : <div className="spl-cands" role="list">
          {st.cands.map((c, i) => (
            <button key={c.id} type="button" role="listitem" className={'spl-cand' + (st.cand && st.cand.id === c.id ? ' on' : '')} onClick={() => onPick(c)}>
              <span className="spl-cand-h"><em className="num">후보 {i + 1}</em><b>{c.title}</b><span className="spl-cand-n num">공간 {c.spaces.length}</span><Icon name="chev" size={14} className="spl-cand-go" /></span>
              {c.summary && <span className="spl-cand-s">{c.summary}</span>}
              <span className="spl-cand-sp">{c.spaces.map((id, k) => <span key={id} className={'spl-chip spl-c' + (k % SPACE_COLORS)}><i className="spl-dot" />{names.get(id) || id}</span>)}</span>
              <span className="spl-cand-fit num"><Icon name="product" size={12} />선택 제품 {c.fit}/{nProducts}개{c.sols ? ' · 솔루션 ' + c.sols + '개' : ''}가 이 공간들에 들어가요</span>
            </button>
          ))}
          {st.candNote && <p className="spl-hint">{st.candNote}</p>}
        </div>}
    </div>
  );
}

// ---------- 3. 배치 ----------
function CopyMenu({ spaces, from, id, onCopy, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) (ref.current.querySelector('button:not(:disabled)') || ref.current).focus(); }, []);
  return (
    <div ref={ref} className="spl-menu" role="menu" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) onClose(); }} onClick={(e) => e.stopPropagation()}>
      <span className="spl-menu-h">복사할 공간</span>
      {!spaces.some((s) => s.id !== from) && <span className="spl-menu-h">다른 공간을 추가해 주세요</span>}
      {spaces.filter((s) => s.id !== from).map((s) => (
        <button key={s.id} type="button" role="menuitem" className={'spl-c' + s.color} disabled={s.products.includes(id)} onClick={() => onCopy(s.id)}><i className="spl-dot" />{s.name}에 복사하기{s.products.includes(id) ? ' (이미 배치됨)' : ''}</button>
      ))}
    </div>
  );
}
function SpaceCard({ id, from, peek, drag, setDrag, spaces, onCopy }) {
  const x = P[id]; const r = 'product:' + id;
  const [menu, setMenu] = useState(false);
  if (!x) return null;
  return (
    <div className={'spl-card' + (drag && drag.pid === id && drag.from === from ? ' dragging' : '') + (menu ? ' menu' : '')} draggable data-ref={r}
      onDragStart={(e) => { e.stopPropagation(); setMenu(false); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r); peek.hide(); setDrag({ pid: id, from }); }}
      onDragEnd={() => setDrag(null)}
      tabIndex={0} role="button" aria-label={x.name + ' · 끌어서 다른 공간으로 옮기기 · Enter로 복사 메뉴 열기'}
      onMouseEnter={(e) => { if (!drag) peek.show(r, e.currentTarget); }} onMouseLeave={peek.hide}
      onFocus={(e) => { if (e.target === e.currentTarget && e.currentTarget.matches(':focus-visible')) peek.show(r, e.currentTarget, true); }}
      onBlur={(e) => { if (e.target === e.currentTarget) peek.hide(e); }}
      onKeyDown={(e) => { if (menu && e.key === 'Escape') { e.stopPropagation(); setMenu(false); return; } if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); peek.hide(); setMenu(true); } }}>
      <Thumb r={r} />
      <span className="spl-cname" title={x.name}>{x.name}</span>
      <button type="button" className="spl-mv" draggable={false} onClick={(e) => { e.stopPropagation(); peek.hide(); setMenu((v) => !v); }} aria-label={x.name + ' 복사 메뉴'} aria-haspopup="menu" aria-expanded={menu} title="다른 공간에 복사하기"><Icon name="dots" size={14} stroke={2.6} /></button>
      {menu && <CopyMenu spaces={spaces} from={from} id={id} onClose={() => setMenu(false)} onCopy={(to) => { setMenu(false); onCopy(id, to); }} />}
    </div>
  );
}
/** 공간 추가 — 직접 입력하거나 이 업종(과 같은 그룹)의 남은 공간에서 고른다. */
function AddSpace({ options, spaces, full, onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const ref = useRef(null);
  useEffect(() => { if (open) ref.current?.querySelector('input')?.focus(); }, [open]);
  const addCustom = () => {
    const name = text.replace(/\s+/g, ' ').trim();
    if (!name || full) return;
    if (spaces.some((s) => spaceKeyword(s.name) === spaceKeyword(name))) {
      setError('이미 추가한 공간이에요.'); return;
    }
    onAdd({ id: uid('custom-space-'), name, products: [] });
    setText(''); setError('');
    ref.current?.querySelector('input')?.focus();
  };
  if (full) return <section className="spl-space add full" aria-label="공간 추가"><span className="spl-add-full">공간은 {MAX_SPACES}개까지 둘 수 있어요</span></section>;
  return (
    <section ref={ref} className={'spl-space add' + (open ? ' open' : '')} aria-label="공간 추가" onKeyDown={(e) => { if (open && e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
      <button type="button" className="spl-add-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name={open ? 'x' : 'plus'} size={14} stroke={2.4} />{open ? '닫기' : '공간 추가'}</button>
      {open && <>
        <div className="spl-add-custom">
          <label htmlFor="spl-add-name">직접 입력</label>
          <div className="spl-custom-input">
            <input id="spl-add-name" aria-label="추가할 공간 이름" aria-describedby="spl-add-help spl-add-error" value={text} maxLength={80} autoComplete="off" enterKeyHint="done" placeholder="공간 이름"
              onChange={(e) => { setText(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) { e.preventDefault(); addCustom(); } }} />
            <button type="button" className="btn btn-sm" disabled={!text.trim()} onClick={addCustom} aria-label="입력한 공간 추가"><Icon name="plus" size={13} />추가</button>
          </div>
          <span id="spl-add-help" className="spl-hint">Enter로 추가한 뒤 제품을 끌어다 놓으세요.</span>
          <span id="spl-add-error" className="spl-custom-error" role="status">{error}</span>
        </div>
        {options.length > 0 && <div className="spl-add-list" role="list" aria-label="추가할 공간">
          {options.map((o) => (
            <button key={o.id} type="button" role="listitem" className={'spl-add-opt' + (o.n ? ' fit' : '')} onClick={() => { setOpen(false); onAdd(o); }}>
              <b>{o.name}</b>
              <span>{o.n ? o.hint : '연결한 제품 · 솔루션과 맞는 제품군이 없어요'}{o.aux ? ' · ' + o.from : ''}</span>
            </button>
          ))}
        </div>}
      </>}
    </section>
  );
}
function MappingStep({ idx, p, st, busy, err, onRetry, onMove, onCopy, onRemove, onAdd, peek }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(undefined);
  if (busy || (!st.spaces && !err)) return <Loading text="공간마다 선택 제품을 배치하고 있어요" rows={3} />;
  if (err || !st.spaces) return <ErrorBox text={err || '제품을 배치하지 못했어요.'} onRetry={onRetry} />;
  const linked = p.ctx.products.filter((id) => P[id]);
  const has = new Set(linked);
  const spaces = withColors(st.spaces).map((s) => ({ ...s, products: s.products.filter((id) => has.has(id)) }));
  const placed = new Set(spaces.flatMap((s) => s.products));
  const rest = linked.filter((id) => !placed.has(id));
  const dss = linkedDss(p);
  const chosen = new Set(spaces.map((s) => s.id));
  const options = spacePool(idx, st.vertical).filter((s) => !chosen.has(s.id)).map((s) => {
    const f = spaceFit(s, dss);
    const hint = [f.products.length ? '제품 ' + f.products.length + '개' : '', f.solutions.length ? '솔루션 ' + f.solutions.length + '개' : ''].filter(Boolean).join(' · ') + '가 들어가요';
    return { ...s, n: f.products.length + f.solutions.length, hint, from: idx.byId.get(s.vertical).name };
  }).sort((a, b) => (b.n ? 1 : 0) - (a.n ? 1 : 0) || (a.aux ? 1 : 0) - (b.aux ? 1 : 0) || b.n - a.n);
  const zone = (key) => ({
    onDragOver: (e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(undefined); },
    onDrop: (e) => { e.preventDefault(); if (drag) onMove(drag.pid, drag.from, key); setDrag(null); setOver(undefined); },
  });
  const card = (id, s) => <SpaceCard key={(s ? s.id : '-') + ':' + id} id={id} from={s ? s.id : null} peek={peek} drag={drag} setDrag={setDrag} spaces={spaces} onCopy={onCopy} />;
  const removable = spaces.length > MIN_SPACES;
  return (
    <div className={'spl-board' + (drag ? ' dragging' : '')}>
      {spaces.map((s) => (
        <section key={s.id} className={'spl-space spl-c' + s.color + (drag && over === s.id ? ' over' : '')} data-space={s.id} aria-label={s.name + ' · 제품 ' + s.products.length + '개'} {...zone(s.id)}>
          <header className="spl-space-h"><i className="spl-dot" aria-hidden="true" /><b title={s.name}>{s.name}</b><span className="num">{s.products.length}</span>
            <button type="button" className="spl-space-x" disabled={!removable} onClick={() => { peek.hide(); onRemove(s); }} aria-label={s.name + ' 공간 빼기'}
              title={removable ? '이 공간 빼기 · 제품은 미배치로 가요' : '공간은 하나 이상 있어야 해요'}><Icon name="x" size={11} stroke={3} /></button>
          </header>
          {s.note && <p className="spl-note">{s.note}</p>}
          <div className="spl-cards">{s.products.map((id) => card(id, s))}{!s.products.length && <span className="spl-drop">여기로 끌어다 놓으세요</span>}</div>
        </section>
      ))}
      <section className={'spl-space rest' + (drag && over === null ? ' over' : '')} data-space="" aria-label={'미배치 · 제품 ' + rest.length + '개'} {...zone(null)}>
        <header className="spl-space-h"><i className="spl-dot" aria-hidden="true" /><b>미배치</b><span className="num">{rest.length}</span></header>
        <div className="spl-cards">{rest.map((id) => card(id, null))}{!rest.length && <span className="spl-drop">모든 제품을 배치했어요</span>}</div>
      </section>
      <AddSpace options={options} spaces={spaces} full={spaces.length >= MAX_SPACES} onAdd={onAdd} />
    </div>
  );
}

// ---------- 조감도 질문 ----------
/** 저장한 뒤 묻는다 — 만들기: 3D 조감도를 바로 만든다 · 저장만: 닫는다(Esc도 저장만). fresh: 지금 구성으로 만든 조감도가 이미 있다. */
function AskBirdseye({ nSpaces, nProducts, fresh, onLater, onMake }) {
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.querySelector('.btn-primary') && ref.current.querySelector('.btn-primary').focus(); }, []);
  return (
    <div className="spl-ask" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onLater(); } }}>
      <div ref={ref} className="spl-ask-card" role="alertdialog" aria-modal="true" aria-labelledby="spl-ask-h" aria-describedby="spl-ask-d">
        <span className="spl-ask-ic" aria-hidden="true"><Icon name="cube" size={22} /></span>
        <h3 id="spl-ask-h">{fresh ? '3D 조감도를 다시 만들까요?' : '3D 조감도를 만들까요?'}</h3>
        <p id="spl-ask-d">공간 구성을 저장했어요. 공간 {nSpaces}개 · 제품 {nProducts}개 배치로 3D 조감도를 {fresh ? '다시 ' : '바로 '}만들 수 있어요{fresh ? '(지금 구성으로 만든 조감도가 이미 있어요)' : ''}. 만든 조감도는 Storyboard의 조감도 레이아웃에 자동으로 들어가요.</p>
        <div className="spl-row">
          <button type="button" className="btn" onClick={onLater}>저장만 하기</button>
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
  const saved = useRef(false);
  useEffect(() => { if (!saved.current) setSpaceDraft(p.id, st); }, [st]);
  // 추론하는 동안 매칭 버블 테두리에 진행 표시(match-area.jsx .node.is-busy)
  useEffect(() => { setSpaceBusy(p.id, !!busy); return () => setSpaceBusy(p.id, false); }, [busy]);
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
    if (r.ok) onOk(r); else setErr({ kind, text: spaceErrorText(r), summary: /^summary_/.test(r.err || '') });
  };
  // 요약 실패로 멈춘 단계를 다시 시도하면 요약부터 다시 만든다(services/space-plan.js prepared)
  const retry = (kind) => !!err && err.kind === kind && !!err.summary;
  const guess = () => run('industry', (signal) => inferVertical(pRef.current, idx, { signal, retry: retry('industry') }), (r) => setSt((s) => ({ ...s, guess: { id: r.vertical, reason: r.reason, alternatives: r.alternatives } })));
  // 후보는 지금 연결된 제품 · 솔루션으로 만든다 — 연결이 바뀌면 후보를 다시 만든다
  const dssSig = p.ctx.products.join(',') + '|' + p.ctx.solutions.join(',');
  const cands = () => run('candidates', (signal) => inferCandidates(pRef.current, idx, st.vertical, { signal, retry: retry('candidates') }), (r) => setSt((s) => ({ ...s, cands: r.candidates, candNote: r.note, candSig: dssSig })));
  // 배치: 처음에는 고른 후보의 공간, 그 뒤(공간을 빼거나 더한 뒤 '다시 배치')에는 지금 공간에 — 공간의 색은 그대로 둔다
  const mapping = () => {
    const now = st.spaces;
    const cand = now ? { ...st.cand, spaces: now.map((x) => x.id), customSpaces: now.filter((x) => x.id.startsWith('custom-space-')).map((x) => ({ id: x.id, name: x.name, products: [] })) } : st.cand;
    const color = new Map((now || []).map((x) => [x.id, x.color]));
    const again = retry('mapping');
    return run('mapping', (signal) => inferMapping(pRef.current, idx, st.vertical, cand, { signal, retry: again }), (r) => setSt((s) => ({ ...s, spaces: withColors(r.spaces.map((x) => (color.has(x.id) ? { ...x, color: color.get(x.id) } : x))) })));
  };
  // each step asks the model once when it opens without an answer (a failure waits for 다시 시도)
  useEffect(() => {
    if (!idx || busy || (err && err.kind === st.step)) return;
    if (st.step === 'industry' && !st.guess) guess();
    else if (st.step === 'candidates' && (!st.cands || (st.candSig != null && st.candSig !== dssSig))) cands();
    else if (st.step === 'mapping' && !st.spaces && st.cand) mapping();
  }, [idx, st.step, !!st.guess, !!st.cands, !!st.spaces, busy, err, dssSig]);
  const to = (step, patch = {}) => { if (ctrl.current) ctrl.current.abort(); setBusy(''); setErr(null); setSt((s) => ({ ...s, ...patch, step })); };
  const confirmVertical = (id) => to('candidates', st.vertical === id && st.cands ? { vertical: id } : { vertical: id, cands: null, cand: null, spaces: null });
  const pickCand = (c) => to('mapping', st.cand && st.cand.id === c.id && String(st.cand.spaces) === String(c.spaces) && st.spaces ? {} : { cand: c, spaces: null });
  const back = st.step === 'candidates' ? { label: '업종 확인으로 돌아가기', onClick: () => to('industry', st.guess ? {} : { guess: { id: st.vertical, reason: '', alternatives: [], current: true } }) }
    : st.step === 'mapping' ? { label: '공간 후보로 돌아가기', onClick: () => to('candidates') } : null;
  const onCopy = (pid, toId) => setSt((s) => ({ ...s, spaces: copyProduct(s.spaces, pid, toId) }));
  const onMove = (pid, from, toId) => setSt((s) => ({ ...s, spaces: moveProduct(s.spaces, pid, from, toId) }));
  const onRemove = (space) => {
    const at = st.spaces.findIndex((x) => x.id === space.id);
    setSt((s) => ({ ...s, spaces: removeSpace(s.spaces, space.id) }));
    const back = () => setSt((s) => (s.spaces && !s.spaces.some((x) => x.id === space.id) && s.spaces.length < MAX_SPACES
      ? { ...s, spaces: withColors([...s.spaces.slice(0, at), st.spaces[at], ...s.spaces.slice(at)]) } : s));
    toast(space.name + ' 공간을 뺐어요 · 제품은 미배치로 옮겼어요', '', { actionLabel: '되돌리기', onAction: back });
  };
  const onAdd = (space) => setSt((s) => ({ ...s, spaces: addSpace(s.spaces, newSpace(pRef.current, space, s.spaces)) }));
  const linked = new Set(p.ctx.products);
  const nPlaced = st.spaces ? new Set(st.spaces.flatMap((s) => s.products.filter((id) => linked.has(id)))).size : 0;
  const vertical = idx && st.vertical && idx.byId.get(st.vertical);
  // 저장 → 바로 저장하고 조감도를 만들지 묻는다
  const save = () => {
    if (!savePlan(p.id, { vertical, candidate: st.cand || {}, spaces: withColors(st.spaces) })) { toast('공간 구성을 저장하지 못했어요', 'warn'); return; }
    saved.current = true; setSpaceDraft(p.id, null);
    peek.hide(); setAsk(true);
  };
  const later = () => { toast('공간 구성을 저장했어요 · 매칭 카드의 제품이 공간별로 묶였어요'); onClose(); };
  const make = () => { onBirdseye(); };
  const be = ask ? birdseyeOf(p) : null;
  const busyErr = (kind) => (err && err.kind === kind ? err.text : '');
  const stepNo = STEPS.findIndex(([k]) => k === st.step);
  return (
    <BubblePopup cls="spl" anchor=".match-node .node" beside=".match-node .match-card" fill icon={<Icon name="map" size={17} />} title="공간 구성" onClose={() => { peek.hide(); onClose(); }}
      back={back} onEsc={ask ? later : undefined} bodyClass="spl-body"
      sub={<span className="bp-sub spl-steps">{STEPS.map(([k, label], i) => <span key={k} className={i === stepNo ? 'on' : i < stepNo ? 'done' : ''}><em className="num">{i + 1}</em>{label}</span>)}</span>}
      footer={st.step === 'mapping' ? <>
        <span className="sp" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy || !st.cand} onClick={mapping} title="고른 공간에 제품을 다시 추론해 배치해요"><Icon name="refresh" size={13} />다시 배치</button>
        <button type="button" className="btn btn-primary spl-save" disabled={!!busy || !st.spaces || !nPlaced} onClick={save} title={!nPlaced ? '제품을 한 개 이상 공간에 배치해 주세요' : '저장하고 3D 조감도를 만들지 정해요'}><Icon name="check" size={15} />저장</button>
      </> : st.step === 'candidates' ? <>
        <span className="sp" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={cands}><Icon name="refresh" size={13} />후보 다시 추론</button>
      </> : null}>
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
        : st.step === 'candidates' ? <CandidateStep idx={idx} st={st} nProducts={p.ctx.products.length} busy={busy === 'candidates'} err={busyErr('candidates')} onRetry={cands} onPick={pickCand} onCustomChange={(patch) => setSt((s) => ({ ...s, ...patch }))} />
        : <MappingStep idx={idx} p={p} st={st} busy={busy === 'mapping'} err={busyErr('mapping')} onRetry={mapping} onMove={onMove} onCopy={onCopy} onRemove={onRemove} onAdd={onAdd} peek={peek} />}
      {ask && <AskBirdseye nSpaces={st.spaces.length} nProducts={nPlaced} fresh={!!be && be.status === 'done' && !be.stale && !be.foreign} onLater={later} onMake={make} />}
      {peek.node}
    </BubblePopup>
  );
}
