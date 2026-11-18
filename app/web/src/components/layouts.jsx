import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { update, uid } from '../repositories/proposals.js';
import { Icon, Modal, toast, partHue } from './common.jsx';
import { PARTS, classifyPart } from '../domain/proposals/parts.js';
import { L, LAYOUTS, IND, isCoverSheet, libraryOf, variantFor } from '../services/catalog.js';
import { recommendForPart, reqText, inferIndustry } from '../services/search.js';
import { startBrief } from '../services/layout-brief.js';
import { useCatalogSearch } from '../hooks/useCatalogSearch.js';
import { AI_SEARCH_TOP } from '../services/catalog-search.js';
import { CatalogSearchBar, CatalogSearchStatus, SearchSnippet, snippetText } from './catalog-search.jsx';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { usePickPeek, CardMeta } from './pickpeek.jsx';
import { useMy } from '../repositories/templates.js';
import { FavButton } from './fav.jsx';
import { useFavs, liveFavs } from '../repositories/favorites.js';
import { FilterBar } from './filterpop.jsx';
import { PART_GROUPS, NO_FILTER, pass, activeFilters, LayoutFilterPopup, LayoutSections } from './layout-library.jsx';
import { requirementContextText } from '../domain/proposals/requirement-summary.js';
import { CountGroupBadge } from './layout-count-group.jsx';
import { CountGroupChoice } from './layout-count-choices.jsx';
import { filterCountLayouts } from '../domain/templates/layout_count_groups.js';
export { LayoutDetail } from './detail.jsx';
export { ImagePicker } from './imagepick.jsx';

const ctxFor = (p) => ({ ind: p.ind || inferIndustry(reqText(p)), products: p.ctx.products, solutions: p.ctx.solutions, cases: p.ctx.cases, usedLayouts: p.parts.flatMap(s => s.layouts.map(x => x.f)), req: reqText(p) });

// Picker cards use the library presentation and keep the Storyboard selection behavior.
function PCard({ l, rank, why = [], snip, nAdded, onAdd, onCountPick, hc, aiWhy }) {
  const peek = (e) => hc.show(l, e.currentTarget, { why, aiWhy, rank, snip: snippetText(snip), onCountPick, countAction: '추가' });
  return (
    <div className={'tl-card pcard' + (nAdded ? ' sel' : '')} data-f={l.f} data-count-group={l.countGroup?.id} role="button" tabIndex={0}
      onClick={onAdd} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd(); } }}
      onMouseEnter={peek} onMouseLeave={hc.hide} onFocus={peek} onBlur={hc.hide}
      aria-label={l.name + (l.countVariants ? ' · 수량별 ' + l.countVariants.length + '종 중 선택해 추가' : ' 추가') + (nAdded ? ' · 이 목차에 ' + nAdded + '장 있음' : '')}>
      {rank != null && <span className="rank">{rank}</span>}
      <span className="pc-check" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
      <div className="tl-thumb"><FitSlide f={l.f} lazy /><CountGroupBadge layout={l}/>{!l.countVariants && <FavButton f={l.f} from="PPT 레이아웃 추가" />}</div>
      <div className="tl-info">
        <div className="tl-name pc-name"><b className="nm" title={l.name}>{l.name}</b>{nAdded ? <span className="pc-added" title="이 목차에 이미 있어요 · 누르면 한 장 더 넣어요"><Icon name="check" size={11} stroke={3} />추가됨{nAdded > 1 ? ' ×' + nAdded : ''}</span> : null}</div>
        <p className="tl-when">{l.when || l.g}</p>
        {snip && <p className="tl-snip"><SearchSnippet snippet={snip} /></p>}
        {aiWhy && <p className="catalog-ai-reason">{aiWhy}</p>}
        <CardMeta l={l} />
      </div>
    </div>
  );
}

function FavoritesPopover({ anchor, onClose, children, count }) {
  const panel = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const top = rect.bottom + 8;
      const width = Math.min(760, window.innerWidth - 24);
      setPosition({ top, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), width,
        maxHeight: Math.max(0, window.innerHeight - top - 12) });
    };
    const outside = e => {
      if (!panel.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose();
    };
    const escape = e => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation(); onClose(); anchor.current?.focus();
    };
    const follow = e => { if (!panel.current?.contains(e.target)) place(); };
    place();
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', follow, true);
    };
  }, [anchor, onClose]);
  useEffect(() => { if (position) panel.current?.focus({ preventScroll: true }); }, [!!position]);
  return position && createPortal(
    <div ref={panel} id="pk-favorites" className="pk-fav-pop" role="dialog" aria-labelledby="pk-fav-h" tabIndex={-1} style={position}>
      <div className="pk-fav-head">
        <h3 id="pk-fav-h">찜 목록 <span className="num">{count}</span></h3>
        <button className="btn btn-ghost btn-icon" aria-label="찜 목록 닫기" onClick={() => { onClose(); anchor.current?.focus(); }}><Icon name="x" size={16} /></button>
      </div>
      <div className="pk-fav-body">{children}</div>
    </div>, document.body);
}

export function LayoutPicker({ p, partId, mode = 'rec', onClose }) {
  const part = p.parts.find((s) => s.id === partId);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(() => ({ ...NO_FILTER }));
  const [filterOpen, setFilterOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [countChoice, setCountChoice] = useState(null);
  const favoriteButton = useRef(null);
  const peek = usePickPeek();
  // 이 창의 큰 미리보기는 모두 아직 이 제안서 값이 아닌 견본(레이아웃 원본 · 다른 제안서에서 찜한 값) — '샘플 자료' 띠
  const showSample = useCallback((l, el, extra) => peek.show(l, el, { ...(extra || {}), sample: true }), [peek.show]);
  const hc = { ...peek, show: showSample };
  const closeFavorites = useCallback(() => { setFavoritesOpen(false); hc.hide(); }, [hc.hide]);
  const my = useMy(); // 사이드바 My 템플릿 페이지에 저장한 레이아웃
  const favs = liveFavs(useFavs()); // 찜 — a filled one goes in with its values
  const [favAdded, setFavAdded] = useState({});
  const ctx = useMemo(() => ctxFor(p), [p.id, p.ctx, p.req, p.ind, p.parts]);
  const type = part ? part.type || classifyPart(part.name) : null;
  // one row of the 3-column grid — 미리 정한 유형의 목차면 그 목차에 속하는 레이아웃을 먼저 (search.js recommendForPart)
  const rec = useMemo(() => (part ? recommendForPart(part, ctx, 3) : []), [partId, part, ctx]);
  const catalogSearch = useCatalogSearch('layouts', q, {
    part: part?.name || '', industry: IND[ctx.ind]?.name || '',
    customerRequirements: [requirementContextText(p, 'matching'), reqText(p)].filter(Boolean).join('\n').slice(0, 12000),
    filters: activeFilters(filters).map(x => x.label),
    allowedIds: LAYOUTS.filter(l => pass(l, filters)).map(l => l.f),
  });
  const ran = catalogSearch.query;
  const found = useMemo(() => (catalogSearch.hits || []).map(r => ({ ...r, l: r.item })), [catalogSearch.hits]);
  useEffect(() => {
    hc.hide();
    const el = document.getElementById('pk-q'); const body = el && el.closest('.mbody');
    if (body) body.scrollTop = 0;
  }, [ran, filters]);
  if (!part) return null;

  // 표지 sheets live in the hidden deck part (data.js normalizeCovers) — count and deselect them there
  const deck = p.parts.find((s) => s.deck);
  const deckCovers = deck ? deck.layouts.filter((x) => isCoverSheet(x.f)) : [];
  const counts = {}; for (const x of [...part.layouts, ...deckCovers]) { const k = libraryOf(x.f); counts[k] = (counts[k] || 0) + 1; } // 업종 후보 장은 그 레이아웃으로 센다
  // 카드를 누르면 이 목차에 그 레이아웃을 한 장 넣고 팝업을 닫는다 — 이미 있는 레이아웃도 한 장 더 넣는다(빼기는 Storyboard 카드의 ×).
  // 넣은 장은 바로 채우지 않는다: 이 장에 들어갈 제품 · 솔루션 · 개략 내용을 먼저 추론하고 사람이 확인하면 채운다 (layout-brief.js)
  const add = (l) => {
    hc.hide();
    // 업종 후보가 있는 레이아웃은 이 제안서 업종의 후보로 넣는다 (catalog.js variantFor)
    update(p.id, (d) => { const s = d.parts.find((x) => x.id === partId); if (!s) return; const x = { uid: uid('l'), f: variantFor(l.f, ctx.ind), status: 'empty', ov: { t: {}, img: {} } }; s.layouts.push(x); startBrief(d, s, x); });
    if (isCoverSheet(l.f)) toast('표지는 Storyboard에 두지 않고 PPT 레이아웃 패널의 첫 장으로 보여 드려요');
    onClose();
  };
  const card = (r) => <PCard key={r.l.f} l={r.l} rank={r.rank} why={r.why} snip={r.snip} aiWhy={r.aiWhy} nAdded={(r.l.countVariants || [r.l]).reduce((n, l) => n + (counts[l.f] || 0), 0)} hc={hc} onCountPick={add} onAdd={() => { if (r.l.countVariants) { peek.dismiss(); setCountChoice(r.l); } else add(r.l); }} />;

  const active = activeFilters(filters);
  const base = ran ? found.map(r => r.l) : LAYOUTS;
  const list = filterCountLayouts(base, l => pass(l, filters));
  const hitOf = Object.fromEntries(found.map(r => [r.l.f, r]));
  const libraryCard = l => {
    const h = hitOf[l.f];
    const rank = ran && catalogSearch.aiEnabled ? list.indexOf(l) + 1 : null;
    return card({ l, why: h?.why, snip: h?.snip, aiWhy: h?.aiWhy, rank: rank && rank <= AI_SEARCH_TOP ? rank : null });
  };
  const groups = ran ? [{ key: '_hits', flat: true, sections: catalogSearch.aiEnabled ? [
    { key: '_ai_top', title: 'AI 추천 Top ' + Math.min(AI_SEARCH_TOP, list.length), items: list.slice(0, AI_SEARCH_TOP) },
    { key: '_ai_rest', title: '나머지 검색 결과', items: list.slice(AI_SEARCH_TOP) },
  ].filter(s => s.items.length) : [{ key: '_hits', items: list }] }] : PART_GROUPS.map(g => ({
    key: g.k, label: g.label, hue: g.hue,
    desc: g.parts.filter(k => PARTS[k]).map(k => PARTS[k].label).join(' · '),
    sections: g.parts.map(k => ({ key: k, part: k, items: list.filter(l => l.p === k) })).filter(s => s.items.length),
  })).filter(g => g.sections.length);
  const ptLabel = type && PARTS[type] ? PARTS[type].label : '목차';
  // My: this part's type first; a search keeps the ones whose name · text match
  const myShown = (() => {
    if (!my.length) return [];
    if (ran) { const ws = ran.toLowerCase().split(/\s+/).filter(Boolean); return my.filter(l => pass(l, filters)).filter((l) => { const t = (l.name + ' ' + (l.txt || '') + ' ' + (l.my.file || '')).toLowerCase(); return ws.every((w) => t.includes(w)); }); }
    return my.filter(l => pass(l, filters)).sort((a, b) => (b.p === type) - (a.p === type));
  })();
  const favShown = [...favs.filter(x => x.filled), ...favs.filter(x => !x.filled)];
  const addFav = (x) => {
    hc.hide();
    update(p.id, (d) => { const s = d.parts.find((z) => z.id === partId); if (!s) return; const y = { uid: uid('l'), f: x.f, status: x.filled ? 'partial' : 'empty', ov: x.ov ? JSON.parse(JSON.stringify({ t: {}, img: {}, ...x.ov })) : { t: {}, img: {} } }; s.layouts.push(y); startBrief(d, s, y); });
    setFavAdded((m) => ({ ...m, [x.id]: (m[x.id] || 0) + 1 }));
    toast('‘' + x.name + '’' + (x.filled ? '(값 있음)' : '') + '을 넣었어요');
    closeFavorites(); onClose();
  };
  const favSec = favShown.length ? (
      <div className="pk-grid">{favShown.map((x) => {
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
  ) : <div className="tl-empty"><b>아직 찜한 레이아웃이 없어요</b></div>;
  const mySec = myShown.length ? (
    <section className="pk-my" aria-labelledby="pk-my-h">
      <div className="pk-sec-h">
        <h3 id="pk-my-h"><Icon name="user" size={15} />My 템플릿 <span className="num">{myShown.length}</span></h3>
        <span className="rag-note">{ran ? '이름 · 글자가 맞는 내 템플릿' : 'My 템플릿 페이지에 저장한 것'}</span>
      </div>
      <div className="pk-grid pk-3">{myShown.map((l) => card({ l }))}</div>
    </section>
  ) : null;
  return (
    <Modal size="xwide" onClose={onClose} bodyClass="mbody pk-library"
      title={<span className="pk-title">PPT 레이아웃 추가 <span className={'tag pt ' + partHue(type)}>{part.name || ptLabel}</span></span>}
      headerActions={<button ref={favoriteButton} className={'btn btn-sm pk-fav-toggle' + (favoritesOpen ? ' on' : '')} aria-haspopup="dialog" aria-expanded={favoritesOpen} aria-controls={favoritesOpen ? 'pk-favorites' : undefined}
        onClick={() => { hc.hide(); setFavoritesOpen(value => !value); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        찜 목록 <span className="num">{favs.length}</span>
      </button>}
      footer={<>
        <span className="note">이 목차 레이아웃 <b className="num">{part.layouts.length}</b>장</span>
        <span className="sp" />
        <button className="btn" onClick={onClose}>닫기</button>
      </>}>
      <div className="pk-searchbar tl-tools-f">
        <CatalogSearchBar id="pk-q" label="레이아웃 검색" value={q} onChange={setQ} search={catalogSearch} autoFocus={mode === 'search'}
          placeholder="찾는 장면을 적어 보세요 · 예) 경쟁사와 비교하는 표, 매장 하루 동선" />
        <FilterBar active={active} onOpen={() => { closeFavorites(); setFilterOpen(true); }}
          onRemove={a => setFilters(f => ({ ...f, ...a.clear }))} onClearAll={() => setFilters({ ...NO_FILTER })} />
      </div>
      {!ran && <section className="pk-rec" aria-labelledby="pk-rec-h">
        <div className="pk-sec-h"><h3 id="pk-rec-h"><Icon name="sparkle" size={15} />추천 <span className="num">{rec.length}</span></h3></div>
        {rec.length ? <div className="pk-grid pk-3">{rec.map((r, i) => card({ l: r.l, why: r.why, rank: i + 1 }))}</div>
          : <div className="pk-empty">목차 이름이나 내용을 채우면 추천이 더 정확해져요.</div>}
      </section>}
      <section className="pk-all" aria-labelledby="pk-all-h">
        <div className="pk-sec-h"><h3 id="pk-all-h">{ran ? '검색 결과' : '전체 레이아웃'} <span className="num faint">{list.length}</span></h3>
          {ran && <span className="rag-note">“{ran}” · {catalogSearch.aiEnabled ? 'AI 추천 먼저' : '관련도순'}</span>}
        </div>
        <CatalogSearchStatus search={catalogSearch} />
        {!catalogSearch.busy && !catalogSearch.error && <>
          {mySec}
          {list.length ? <LayoutSections groups={groups} card={libraryCard} query={ran} /> : <div className="tl-empty">
            <b>{ran ? '“' + ran + '”와 맞는 레이아웃이 없어요' : '조건에 맞는 레이아웃이 없어요'}</b>
            <span>검색어나 필터를 풀어 보세요.</span>
            <button className="btn btn-sm" onClick={() => { setQ(''); catalogSearch.clear(); setFilters({ ...NO_FILTER }); }}>검색 · 필터 지우기</button>
          </div>}
        </>}
      </section>
      {favoritesOpen && <FavoritesPopover anchor={favoriteButton} onClose={closeFavorites} count={favShown.length}>{favSec}</FavoritesPopover>}
      {filterOpen && <LayoutFilterPopup f={filters} base={catalogSearch.busy || catalogSearch.error ? LAYOUTS : base}
        onApply={f => { setFilters(f); setFilterOpen(false); }} onClose={() => setFilterOpen(false)} />}
      {hc.node}
      {countChoice && <CountGroupChoice layout={countChoice} onClose={() => setCountChoice(null)} onSelect={add} actionLabel="추가"/>}
    </Modal>
  );
}
