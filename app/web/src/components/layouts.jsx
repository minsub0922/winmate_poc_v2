import React, { useState, useMemo, useRef, useEffect } from 'react';
import { update, uid } from '../repositories/proposals.js';
import { Icon, Modal, toast, partHue } from './common.jsx';
import { PARTS, classifyPart, effectiveType } from '../domain/proposals/parts.js';
import { L, LAYOUTS, IND, isPhotoFirst, isCoverSheet } from '../services/catalog.js';
import { recommendLayouts, reqText, inferIndustry } from '../services/search.js';
import { aiRerank, aiErrorText } from '../services/ai.js';
import { useLayoutSearch } from '../hooks/useLayoutSearch.js';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { usePickPeek, CardMeta } from './pickpeek.jsx';
import { useMy } from '../repositories/templates.js';
import { FavButton } from './fav.jsx';
import { useFavs, liveFavs } from '../repositories/favorites.js';
export { LayoutDetail } from './detail.jsx';
export { ImagePicker } from './imagepick.jsx';

const ctxFor = (p) => ({ ind: p.ind || inferIndustry(reqText(p)), products: p.ctx.products, solutions: p.ctx.solutions, cases: p.ctx.cases });

/* =========================================================
   Layout picker — recommended 3 + everything else by part type · RAG search (3 columns, no layout codes)
   A card shows the slide, its title and its key tags only — when to use it, match reasons and search snippets
   are left to the hover detail.
   ========================================================= */
function PCard({ l, rank, why = [], snip, nAdded, onAdd, hc, aiWhy }) {
  const peek = (e) => hc.show(l, e.currentTarget, { why, aiWhy, rank, snip });
  return (
    <div className={'pcard' + (nAdded ? ' sel' : '')} data-f={l.f} role="button" tabIndex={0} aria-pressed={!!nAdded}
      onClick={onAdd} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(); } }}
      onMouseEnter={peek} onMouseLeave={hc.hide} onFocus={peek} onBlur={hc.hide}
      aria-label={l.name + (nAdded ? ' 선택됨, 누르면 선택 해제' : ' 선택')}>
      {rank != null && <span className="rank">{rank}</span>}
      <span className="pc-check" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
      <FitSlide f={l.f} lazy />
      <FavButton f={l.f} from="PPT 레이아웃 추가" />
      <div className="pc-name"><span className="nm" title={l.name}>{l.name}</span>{nAdded ? <span className="pc-added"><Icon name="check" size={11} stroke={3} />선택됨{nAdded > 1 ? ' ×' + nAdded : ''}</span> : null}</div>
      <CardMeta l={l} />
    </div>
  );
}

const QUICK = ['경쟁사 비교표', '공간 맵 · 존 구성', '도입 일정 · 로드맵', '도입 효과 KPI', '제품 스펙 비교', '설치 사례 사진'];

export function LayoutPicker({ p, partId, mode = 'rec', onClose }) {
  const part = p.parts.find((s) => s.id === partId);
  const [q, setQ] = useState('');
  const [ran, setRan] = useState('');
  const [scope, setScope] = useState('all');
  const [ai, setAi] = useState(null);
  const ctl = useRef(null);
  const hc = usePickPeek();
  const my = useMy(); // My 템플릿 (PPT 레이아웃 템플릿 › My)
  const favs = liveFavs(useFavs()); // 찜 — a filled one goes in with its values
  const [favAdded, setFavAdded] = useState({});
  const ctx = useMemo(() => ctxFor(p), [p.id]);
  const type = part ? part.type || classifyPart(part.name) : null;
  const hintType = part ? effectiveType(part) : null;
  const browseType = type === 'free' ? hintType : type;
  const rec = useMemo(() => (part ? recommendLayouts(part, ctx, 3) : []), [partId]); // one row of the 3-column grid
  const remoteSearch = useLayoutSearch(ran, { ...ctx, part: browseType || '' });
  // search results are the server RAG ranking only — while it runs or after it fails the list is empty (no stale results)
  const found = useMemo(() => (ran && remoteSearch.items) || [], [ran, remoteSearch.items]);
  // Everything not in the top 3, grouped by part type — this part's type first; inside a group: industry match → generic → other industries.
  const groups = useMemo(() => {
    const inRec = new Set(rec.map((r) => r.l.f));
    const by = {};
    for (const l of LAYOUTS) { if (inRec.has(l.f)) continue; const k = l.p || '_etc'; (by[k] = by[k] || []).push(l); }
    const indRank = (l) => (ctx.ind ? (l.ind === ctx.ind ? 0 : l.ind ? 2 : 1) : l.ind ? 1 : 0);
    let keys = Object.keys(PARTS).filter((k) => by[k] && by[k].length);
    for (const k of Object.keys(by)) if (!PARTS[k]) keys.push(k);
    if (browseType && keys.includes(browseType)) keys = [browseType, ...keys.filter((k) => k !== browseType)];
    return keys.map((k) => ({ k, label: PARTS[k] ? PARTS[k].label : '기타', items: by[k].map((l, i) => [l, i]).sort((a, b) => indRank(a[0]) - indRank(b[0]) || (isPhotoFirst(b[0]) - isPhotoFirst(a[0])) || a[1] - b[1]).map((x) => x[0]) }));
  }, [partId, ctx.ind]);
  useEffect(() => () => ctl.current && ctl.current.abort(), []);
  // Search as you type (debounced). Clearing the box goes back to 추천 + 전체.
  useEffect(() => {
    const t = q.trim();
    if (t === ran) return;
    const h = setTimeout(() => { setRan(t); setAi(null); setScope('all'); if (ctl.current) ctl.current.abort(); }, t ? 250 : 0);
    return () => clearTimeout(h);
  }, [q]);
  useEffect(() => {
    hc.hide();
    const el = document.getElementById('pk-q'); const body = el && el.closest('.mbody');
    if (body) body.scrollTop = 0;
  }, [ran]);
  if (!part) return null;

  // 표지 sheets live in the hidden deck part (data.js normalizeCovers) — count and deselect them there
  const deck = p.parts.find((s) => s.deck);
  const deckCovers = deck ? deck.layouts.filter((x) => isCoverSheet(x.f)) : [];
  const counts = {}; for (const x of [...part.layouts, ...deckCovers]) counts[x.f] = (counts[x.f] || 0) + 1;
  // Cards toggle: press to select (adds to this part), press again to deselect (removes the latest untouched copy).
  const add = (l) => {
    hc.hide();
    if (!counts[l.f]) {
      update(p.id, (d) => { const s = d.parts.find((x) => x.id === partId); if (s) s.layouts.push({ uid: uid('l'), f: l.f, status: 'empty', ov: { t: {}, img: {} } }); });
      if (isCoverSheet(l.f)) toast('표지는 Storyboard에 두지 않고 PPT 레이아웃 패널의 첫 장으로 보여 드려요');
      return;
    }
    const cov = isCoverSheet(l.f) && deck;
    const pool = cov ? deck.layouts : part.layouts;
    const from = cov ? deck.id : partId;
    let target = null;
    for (let k = pool.length - 1; k >= 0; k--) {
      const x = pool[k];
      if (x.f === l.f && (x.status || 'empty') === 'empty' && !Object.keys((x.ov && x.ov.t) || {}).length && !Object.keys((x.ov && x.ov.img) || {}).length) { target = x.uid; break; }
    }
    if (!target) { toast('‘' + l.name + '’은 내용을 채운 레이아웃이라 여기서는 빼지 않았어요. ' + (isCoverSheet(l.f) ? 'PPT 레이아웃 패널에서 열어 빼 주세요' : 'Storyboard에서 빼 주세요'), 'warn'); return; }
    update(p.id, (d) => { const s = d.parts.find((x) => x.id === from); if (!s) return; const i = s.layouts.findIndex((x) => x.uid === target); if (i >= 0) s.layouts.splice(i, 1); });
  };
  const run = (text) => { const t = (text != null ? text : q).trim(); setQ(t); setRan(t); setAi(null); if (ctl.current) ctl.current.abort(); };
  const clear = () => { setQ(''); setRan(''); setAi(null); setScope('all'); if (ctl.current) ctl.current.abort(); };
  const rerank = async () => {
    ctl.current = new AbortController();
    setAi({ busy: true });
    const r = await aiRerank(ran + (part ? ' (파트: ' + part.name + ')' : ''), found, { signal: ctl.current.signal });
    if (r.ai && r.order.length) { setAi({ order: r.order }); toast('AI가 ' + r.order.length + '개를 다시 골랐어요'); }
    else if (r.err === 'cancelled') setAi(null);
    else { setAi(null); toast(aiErrorText(r.err) + ' 서버 검색 순위는 그대로예요.', 'warn'); }
  };
  const jump = (k) => { const el = document.getElementById('pk-g-' + k); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  const card = (r) => <PCard key={r.l.f} l={r.l} rank={r.rank} why={r.why} snip={r.snip} aiWhy={r.aiWhy} nAdded={counts[r.l.f]} hc={hc} onAdd={() => add(r.l)} />;

  let list = [];
  if (ran) {
    if (ai && ai.order) {
      const byF = Object.fromEntries(found.map((r) => [r.l.f, r]));
      list = ai.order.map((o, i) => ({ l: L[o.f], why: (byF[o.f] || {}).why || [], aiWhy: o.why, rank: i + 1, snip: (byF[o.f] || {}).snip }));
    } else list = found.map((r, i) => ({ l: r.l, why: r.why, snip: r.snip, rank: i + 1 }));
    if (scope === 'type' && browseType) list = list.filter((r) => r.l.p === browseType || r.l.p2 === browseType);
    if (scope === 'ind') list = list.filter((r) => !r.l.ind || r.l.ind === ctx.ind);
  }
  const ptLabel = type && PARTS[type] ? PARTS[type].label : '파트';
  // My: this part's type first; a search keeps the ones whose name · text match
  const myShown = (() => {
    if (!my.length) return [];
    if (ran) { const ws = ran.toLowerCase().split(/\s+/).filter(Boolean); return my.filter((l) => { const t = (l.name + ' ' + (l.txt || '') + ' ' + (l.my.file || '')).toLowerCase(); return ws.every((w) => t.includes(w)); }); }
    return [...my].sort((a, b) => (b.p === browseType) - (a.p === browseType));
  })();
  const favShown = (() => {
    const order = (a) => [...a.filter((x) => x.filled), ...a.filter((x) => !x.filled)];
    if (!ran) return order(favs);
    const ws = ran.toLowerCase().split(/\s+/).filter(Boolean);
    return order(favs.filter((x) => { const l = L[x.f]; const t = (x.name + ' ' + (x.from || '') + ' ' + (l ? l.txt || '' : '') + ' ' + JSON.stringify((x.ov && x.ov.t) || {})).toLowerCase(); return ws.every((w) => t.includes(w)); }));
  })();
  const addFav = (x) => {
    hc.hide();
    update(p.id, (d) => { const s = d.parts.find((z) => z.id === partId); if (s) s.layouts.push({ uid: uid('l'), f: x.f, status: x.filled ? 'partial' : 'empty', ov: x.ov ? JSON.parse(JSON.stringify({ t: {}, img: {}, ...x.ov })) : { t: {}, img: {} } }); });
    setFavAdded((m) => ({ ...m, [x.id]: (m[x.id] || 0) + 1 }));
    toast(x.filled ? '‘' + x.name + '’을 찜한 값 그대로 넣었어요' : '‘' + x.name + '’(빈 레이아웃)을 넣었어요');
  };
  const favSec = favShown.length ? (
    <section className="pk-my pk-fav" aria-labelledby="pk-fav-h">
      <div className="pk-sec-h">
        <h3 id="pk-fav-h"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z" fill="currentColor" /></svg>찜 <span className="num">{favShown.length}</span></h3>
        <span className="rag-note">값이 채워진 장은 그 값 그대로 들어가요 · 누를 때마다 한 장씩 추가</span>
      </div>
      <div className="pk-grid pk-3">{favShown.map((x) => {
        const l = L[x.f];
        return (
          <div key={x.id} className={'pcard pk-favcard' + (favAdded[x.id] ? ' sel' : '')} data-f={x.f} role="button" tabIndex={0} onClick={() => addFav(x)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addFav(x); } }}
            onMouseEnter={(e) => hc.show(l, e.currentTarget, x.ov ? { ov: x.ov } : {})} onMouseLeave={hc.hide} aria-label={x.name + (x.filled ? ' (값 있음)' : ' (빈 레이아웃)') + ' 넣기'}>
            <span className="pc-check" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
            <FitSlide f={x.f} ov={x.ov || undefined} lazy />
            <FavButton f={x.f} ov={x.ov} from={x.from} />
            <div className="pc-name"><span className="nm" title={x.name}>{l ? l.name : x.name}</span>{favAdded[x.id] ? <span className="pc-added"><Icon name="check" size={11} stroke={3} />넣음{favAdded[x.id] > 1 ? ' ×' + favAdded[x.id] : ''}</span> : null}</div>
            <div className="pc-meta"><div className="pc-tags"><span className={'tag fav-tag' + (x.filled ? ' filled' : '')}>{x.filled ? '값 있음' : '빈 레이아웃'}</span>{x.from ? <span className="tag" title={x.from}>{x.from.length > 22 ? x.from.slice(0, 21) + '…' : x.from}</span> : null}</div></div>
          </div>
        );
      })}</div>
    </section>
  ) : null;
  const mySec = myShown.length ? (
    <section className="pk-my" aria-labelledby="pk-my-h">
      <div className="pk-sec-h">
        <h3 id="pk-my-h"><Icon name="user" size={15} />My 템플릿 <span className="num">{myShown.length}</span></h3>
        <span className="rag-note">{ran ? '이름 · 글자가 맞는 내 템플릿' : 'PPT 레이아웃 템플릿 › My에 저장한 것'}</span>
      </div>
      <div className="pk-grid pk-3">{myShown.map((l) => card({ l }))}</div>
    </section>
  ) : null;
  const nAll = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <Modal size="xwide" onClose={onClose}
      title={<span style={{ display: 'flex', alignItems: 'center', gap: "var(--space-8px)", flexWrap: 'wrap' }}>PPT 레이아웃 추가 <span className={'tag pt ' + partHue(type)} style={{ fontSize: "var(--text-12-5px)" }}>{part.name || ptLabel}</span></span>}
      sub="추천을 먼저, 그 아래에 나머지 전체를 파트 유형별로 보여 드려요. 검색어를 넣으면 검색 결과만 보여요. 카드를 누르면 선택, 다시 누르면 선택 해제 · 마우스를 올리면 상세 정보."
      footer={<>
        <span className="note">이 파트에 레이아웃 <b className="num">{part.layouts.length}</b>장 선택됨 · 고르지 않고 넘어가도 돼요</span>
        <span className="sp" />
        <button className={part.layouts.length ? 'btn btn-primary' : 'btn'} onClick={onClose}>{part.layouts.length ? '완료' : '건너뛰기'}</button>
      </>}>
      <form className="pk-searchbar" onSubmit={(e) => { e.preventDefault(); run(); }} role="search">
        {remoteSearch.message && !remoteSearch.error && <p className="muted" role="status">{remoteSearch.busy && <span className="spin" />}{remoteSearch.message}</p>}
        {remoteSearch.error && <p className="muted" role="alert"><Icon name="alert" size={13} />{remoteSearch.error} <button type="button" className="btn btn-ghost btn-sm" onClick={remoteSearch.retry}><Icon name="refresh" size={13} />다시 시도</button></p>}
        <label className="sr" htmlFor="pk-q">레이아웃 검색</label>
        <div className="pk-q">
          <Icon name="search" size={16} />
          <input id="pk-q" data-autofocus={mode === 'search' ? true : undefined} className="input" value={q} autoComplete="off" placeholder="레이아웃 검색 (RAG) — 예) 경쟁사와 비교하는 표, 매장 하루 동선, 에너지 절감 효과"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); clear(); } }} />
          {q && <button type="button" className="pk-clear" aria-label="검색어 지우기" onClick={clear}><Icon name="x" size={14} /></button>}
        </div>
      </form>
      {!q && mode === 'search' && (
        <div className="chips">
          <span className="faint" style={{ fontSize: "var(--text-12px)", alignSelf: 'center' }}>예시</span>
          {[...part.items.slice(0, 3), ...QUICK].slice(0, 7).map((t) => <button key={t} type="button" className="qchip" onClick={() => run(t)}>{t}</button>)}
        </div>
      )}
      {ran ? <>
        <div className="pk-bar">
          <span className="rag-note"><Icon name="search" size={14} />검색 결과 <b className="num" style={{ color: 'var(--ink)' }}>{list.length}</b>개 · “{ran}”{ai && ai.order ? ' · AI 재정렬' : ''}</span>
          <span style={{ flex: 1 }} />
          <div className="seg" role="group" aria-label="범위">
            <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>전체</button>
            {browseType && <button type="button" aria-pressed={scope === 'type'} onClick={() => setScope('type')}>{PARTS[browseType].label}만</button>}
            {ctx.ind && <button type="button" aria-pressed={scope === 'ind'} onClick={() => setScope('ind')}>업종 맞춤</button>}
          </div>
          <button type="button" className="btn btn-soft btn-sm" disabled={!found.length || (ai && ai.busy)} onClick={rerank}>{ai && ai.busy ? <span className="spin" /> : <Icon name="sparkle" size={13} />}AI로 다시 고르기</button>
        </div>
        {mySec}
        {favSec}
        {list.length ? <div className="pk-grid pk-3">{list.map(card)}</div>
          : remoteSearch.busy ? <div className="pk-empty"><span className="spin" />서버에서 “{ran}”를 찾는 중이에요.</div>
          : remoteSearch.error ? <div className="pk-empty">검색 결과를 받지 못했어요. 위의 다시 시도를 눌러 주세요.</div>
          : <div className="pk-empty">“{ran}”와 맞는 레이아웃이 없어요. 다른 표현으로 찾거나 범위를 ‘전체’로 바꿔 보세요.</div>}
      </> : <>
        <section className="pk-rec" aria-labelledby="pk-rec-h">
          <div className="pk-sec-h">
            <h3 id="pk-rec-h"><Icon name="sparkle" size={15} />추천 <span className="num">{rec.length}</span></h3>
          </div>
          {rec.length ? <div className="pk-grid pk-3">{rec.map((r, i) => card({ l: r.l, why: r.why, rank: i + 1 }))}</div> : <div className="pk-empty">파트 이름이나 내용을 채우면 추천이 더 정확해져요.</div>}
        </section>
        {mySec}
        {favSec}
        <section className="pk-all" aria-labelledby="pk-all-h">
          <div className="pk-sec-h">
            <h3 id="pk-all-h">전체 레이아웃 <span className="num faint">{nAll}</span></h3>
            <span className="rag-note">{'추천에 나온 것을 뺀 나머지 · 파트 유형별' + (ctx.ind && IND[ctx.ind] ? ' · ' + IND[ctx.ind].name + ' 맞춤 먼저' : '')}</span>
          </div>
          <nav className="pk-jump" aria-label="그룹 바로가기">
            {groups.map((g) => <button key={g.k} type="button" className={'qchip' + (g.k === browseType ? ' cur' : '')} onClick={() => jump(g.k)}>{g.label} <span className="num">{g.items.length}</span></button>)}
          </nav>
          {groups.map((g) => (
            <div key={g.k} className="pk-group" id={'pk-g-' + g.k}>
              <h4 className="pk-gh"><span className={'tag pt ' + partHue(g.k)}>{g.label}</span><span className="num faint">{g.items.length}장</span>{g.k === browseType && <span className="pk-cur">이 파트 유형</span>}</h4>
              <div className="pk-grid pk-3">{g.items.map((l) => card({ l }))}</div>
            </div>
          ))}
        </section>
      </>}
      {hc.node}
    </Modal>
  );
}
