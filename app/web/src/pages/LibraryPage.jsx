import { requireLogin } from '../api/session.js';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { loadUi, saveUi } from '../repositories/proposals.js';
import { Icon, toast, partHue } from '../components/common.jsx';
import { PARTS } from '../domain/proposals/parts.js';
import { LAYOUTS, L, IND, S } from '../services/catalog.js';
import { useCatalogSearch } from '../hooks/useCatalogSearch.js';
import { AI_SEARCH_TOP } from '../services/catalog-search.js';
import { CatalogSearchBar, CatalogSearchStatus, SearchSnippet, snippetText } from '../components/catalog-search.jsx';
import { FitSlide, useWidth } from '../domain/slides/Slide.jsx';
import { DECK, TemplateDetail } from '../components/tplkit.jsx';
import { Thumb } from '../components/Thumbs.jsx';
import { usePickPeek } from '../components/pickpeek.jsx';
import { FilterBar, idList } from '../components/filterpop.jsx';
import { MyUpload, MySections, myGroups, ImportDialog, MyDetail, LayoutEditor, srcLabel, FavSections, favOrder } from '../components/mytpl.jsx';
import { useFavs, liveFavs } from '../repositories/favorites.js';
import { useMy, deleteTemplates } from '../repositories/templates.js';
import { FavButton } from '../components/fav.jsx';
import { PART_GROUPS, GROUP_OF, GROUP_OF_G, PART_ORDER, NO_FILTER, pass, activeFilters, LayoutFilterPopup as FilterPopup, LayoutSections } from '../components/layout-library.jsx';

/* =========================================================
   PPT layout template library — every layout grouped by part type
   (구분 → 파트 유형), search, one filter popup, preview.
   Every layout is shown at once (no "더보기"); sections sit indented
   under their 구분, hover a card for its detail.
   Filters live in one popup that reads top to bottom
   (파트 유형 → 업종 → 솔루션 → 제품 → 이미지 칸 → 필요한 정보 → 원본 장표);
   제품은 디렉토리 탐색기 팝업(ctxexplorer filter 모드 · 폴더 · 검색)에서 여러 개 — 그중 하나라도 든 레이아웃;
   what's on shows as removable chips under the search box.
   The bar · popup · steps · chips are the shared filter UI (filterpop.jsx) — Best Scenario uses the same.
   My is a separate sidebar page: own templates, PPTX upload, file groups and favourites;
   a library layout's detail opens '수정하기' (layout editor → a new My template).
   ========================================================= */

const DEFAULT = { q: '', ...NO_FILTER, my: false, myTab: 'tpl' };
const prodIds = idList;
/** saved state from before the filter popup (by · tab: 구분 tab or 원본 장표 tab) → today's fields */
function fromSaved(u) {
  const x = { ...DEFAULT };
  for (const k of Object.keys(DEFAULT)) if (typeof u[k] === typeof DEFAULT[k]) x[k] = u[k];
  if (u.tab && u.tab !== 'all' && !u.grp && !u.deck) { if (u.by === 'deck') x.deck = DECK[u.tab] ? u.tab : ''; else x.grp = GROUP_OF_G[u.tab] ? u.tab : ''; }
  if (x.part && !PARTS[x.part]) x.part = '';
  if (x.part) x.grp = '';
  x.prod = prodIds(x.prod).join(',');
  return x;
}
const QUICK = ['경쟁사 비교표', '매장 하루 동선', '도입 효과 KPI', '설치 일정', '조감도', '스펙 비교'];

/* ---------- small sidebar icon (2×2 slide grid) ---------- */
export function TemplateIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="8" height="6.5" rx="1.2" /><rect x="13" y="4" width="8" height="6.5" rx="1.2" /><rect x="3" y="13.5" width="8" height="6.5" rx="1.2" /><rect x="13" y="13.5" width="8" height="6.5" rx="1.2" />
    </svg>
  );
}

/* =========================================================
   Page
   ========================================================= */
export function LayoutLibrary({ go }) {
  return <TemplateLibrary go={go} />;
}

/** Shared library UI; each page fixes its scope and owns its search/filter state. */
export function TemplateLibrary({ go, personal = false, favorites = false, saved = [] }) {
  const storageKey = favorites ? 'favoritesLibrary' : personal ? 'myLibrary' : 'lib';
  const [f, setF] = useState(() => {
    const ui = loadUi();
    const legacy = ui.myLibrary || (ui.lib?.my ? ui.lib : {});
    const previous = favorites ? ui.favoritesLibrary || (legacy.myTab === 'fav' ? legacy : {})
      : personal ? legacy.myTab === 'fav' ? {} : legacy : ui.lib || {};
    return { ...fromSaved(previous), my: personal || favorites, myTab: favorites ? 'fav' : 'tpl' };
  });
  const [open, setOpen] = useState(null); // index into `flat`
  const [fpop, setFpop] = useState(false);
  const [imp, setImp] = useState(null); // PPTX being imported into My
  const [edit, setEdit] = useState(null); // { f, ov } open in the editor
  const [favOpen, setFavOpen] = useState(null); // index into favShown
  const favAll = liveFavs(useFavs());
  const [fresh, setFresh] = useState(() => Array.isArray(saved) && saved.length ? new Set(saved) : null); // just-saved My templates (highlighted once)
  const freshT = useRef(null);
  const myAll = useMy();
  const hc = usePickPeek();
  const gridRef = useRef(null);
  const gw = useWidth(gridRef, 1000);
  useEffect(() => { saveUi({ ...loadUi(), [storageKey]: f }); }, [f, storageKey]);
  const savedKey = JSON.stringify(Array.isArray(saved) ? saved : []);
  useEffect(() => {
    const ids = JSON.parse(savedKey);
    if (ids.length) { setFresh(new Set(ids)); freshT.current = setTimeout(() => setFresh(null), 2600); }
    else setFresh(null);
    return () => clearTimeout(freshT.current);
  }, [savedKey]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const favMode = favorites;
  const searchItems = f.my ? favMode ? favAll.map(x => ({ ...L[x.f], searchId: x.id,
    searchExtra: [x.name, x.from, ...Object.values(x.ov?.t || {})].filter(Boolean).join(' '),
  })) : myAll : undefined;
  const search = useCatalogSearch('layouts', f.q, {
    filters: activeFilters(f).map(x => x.label),
    allowedIds: (searchItems || LAYOUTS).filter(l => pass(l, f)).map(l => l.searchId || l.f),
    scope: favMode ? 'favorites' : f.my ? 'My' : 'library',
  }, searchItems);
  const q = search.query;
  const hits = useMemo(() => (search.hits || []).map(r => ({ ...r, l: r.item })), [search.hits]);
  // My: the person's own templates — searched by name · text · file
  const myBase = q ? hits.map(r => r.l) : myAll;
  // Favourites page: (값 있는 장 first, then 빈 레이아웃), searched by name · where it came from · text
  const favBase = q ? hits.map(r => favAll.find(x => x.id === r.id)).filter(Boolean) : favOrder(favAll);
  const base = favMode ? favBase.map((x) => L[x.f]) : f.my ? myBase : q ? hits.map((r) => r.l) : LAYOUTS;
  const hitOf = useMemo(() => (hits ? Object.fromEntries(hits.map((r) => [r.l.f, r])) : {}), [hits]);

  const favShown = favMode ? favBase.filter((x) => pass(L[x.f], f)) : [];
  const list = favMode ? favShown.map((x) => L[x.f]) : base.filter((l) => pass(l, f));

  // sections — part types under their 구분 (분석 · 이해 …); a search is one flat list
  const myG = f.my && !favMode ? myGroups(list) : null;
  let sections;
  if (favMode) sections = [];
  else if (f.my && !(q && search.aiEnabled)) sections = myG.map((g) => ({ key: g.key, items: g.items }));
  else if (q && search.aiEnabled) sections = [
    { key: '_ai_top', title: 'AI 추천 Top ' + Math.min(AI_SEARCH_TOP, list.length), items: list.slice(0, AI_SEARCH_TOP) },
    { key: '_ai_rest', title: '나머지 검색 결과', items: list.slice(AI_SEARCH_TOP) },
  ];
  else if (q) sections = [{ key: '_hits', items: list }];
  else {
    const m = {}; for (const l of list) (m[l.p] = m[l.p] || []).push(l);
    sections = PART_ORDER.filter((p) => m[p]).map((p) => ({ key: p, part: p, items: m[p] }));
  }
  const flat = sections.flatMap((s) => s.items);
  const cols = gw < 520 ? 2 : 3; // layouts always in 3 columns (2 on narrow phones)
  const groups = q ? [{ key: '_hits', flat: true, sections }]
    : PART_GROUPS.map((g) => ({ key: g.k, label: g.label, hue: g.hue, desc: g.parts.filter((p) => PARTS[p]).map((p) => PARTS[p].label).join(' · '), sections: sections.filter((x) => GROUP_OF[x.part] === g.k) }));
  const shownGroups = groups.map((g) => ({ ...g, sections: g.sections.filter((x) => x.items.length) })).filter((g) => g.sections.length);

  const active = activeFilters(f);
  const scopeName = [favMode ? '찜' : personal ? 'My' : '', q && '“' + q + '”', ...active.map((a) => a.short)].filter(Boolean).join(' · ');
  const browseLibrary = () => { hc.hide(); go({ name: 'library' }); };
  const openEditor = (layout, ov = null) => { if (!requireLogin()) return; hc.hide(); setOpen(null); setFavOpen(null); setEdit({ f: layout.f, ov }); };
  const onSavedMy = (metas, msg, reveal = false) => {
    setImp(null); setEdit(null); setOpen(null); setFavOpen(null);
    toast(msg);
    if (!personal) return;
    if (reveal) set({ ...NO_FILTER, q: '', myTab: 'tpl' });
    setFresh(new Set(metas.map(m => m.f)));
    clearTimeout(freshT.current); freshT.current = setTimeout(() => setFresh(null), 2600);
  };

  const card = (l) => {
    const h = hitOf[l.f];
    const i = flat.indexOf(l);
    return (
      <button key={l.f + (l.my ? ':' + l.my.up : '')} className={'tl-card' + (fresh && fresh.has(l.f) ? ' my-fresh' : '')} data-f={l.f} onClick={() => { hc.hide(); setOpen(i); }} aria-label={l.name + ' 크게 보기'}
        onMouseEnter={(e) => hc.show(l, e.currentTarget, { snip: snippetText(h?.snip), aiWhy: h?.aiWhy })} onMouseLeave={hc.hide} onFocus={(e) => hc.show(l, e.currentTarget, { snip: snippetText(h?.snip), aiWhy: h?.aiWhy })} onBlur={hc.hide}>
        <div className="tl-thumb"><FitSlide f={l.f} lazy /><FavButton f={l.f} from={l.my ? 'My 템플릿' : 'PPT 레이아웃 템플릿'} /></div>
        <div className="tl-info">
          <div className="tl-name"><b>{l.name}</b></div>
          <p className="tl-when">{l.my ? srcLabel(l) : l.when || l.g}</p>
          {h && h.snip ? <p className="tl-snip"><SearchSnippet snippet={h.snip} /></p> : null}
          {h?.aiWhy && <p className="catalog-ai-reason">{h.aiWhy}</p>}
          <div className="tl-tags">
            {(q || l.my) && PARTS[l.p] ? <span className={'tag pt ' + partHue(l.p)}>{PARTS[l.p].label}</span> : null}
            {l.my ? <span className="tag my-tag">{l.my.kind === 'pptx' ? 'PPTX' : l.my.kind === 'spatial' ? '조감도' : '고친 레이아웃'}</span> : null}
            {l.ind && IND[l.ind] ? <span className="tag">{IND[l.ind].name}</span> : null}
            {l.sol && S[l.sol] ? <span className="tag tl-sol" title={S[l.sol].name + ' · ' + S[l.sol].cat}><Thumb r={'solution:' + l.sol} mini className="tl-sol-th" />{S[l.sol].name}</span> : null}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className={'tl' + (personal ? ' my-library' : favorites ? ' favorites-library' : '')} id="tl-scroll" data-library-scope={favorites ? 'favorites' : personal ? 'my' : 'catalog'}>
      <div className="tl-in" ref={gridRef}>
        <header className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">WINMATE · {favorites ? '나의 찜 목록' : personal ? '나의 라이브러리' : '템플릿 라이브러리'}</span>
            <h1>{favorites ? '찜 목록' : personal ? 'My 템플릿' : 'PPT 레이아웃 템플릿'}</h1>
          </div>
        </header>

        <div className="tl-tools tl-tools-f">
          <div className="tl-row">
            <CatalogSearchBar id="tl-q" label="레이아웃 검색" value={f.q} onChange={q => set({ q })} search={search}
              placeholder={favMode ? '찜한 레이아웃을 이름 · 글자 · 출처로 찾기' : personal ? '내 템플릿을 이름 · 글자 · 파일 이름으로 찾기' : '찾는 장면을 적어 보세요 · 예) 경쟁사와 비교하는 표, 매장 하루 동선'} />
          </div>
          <FilterBar active={active} onOpen={() => { hc.hide(); setFpop(true); }} onRemove={(a) => set(a.clear)} onClearAll={() => set(NO_FILTER)} />
        </div>

        <CatalogSearchStatus search={search} />
        <div className="tl-sum">
          <span><b className="num">{list.length}</b>장{scopeName ? <span className="muted"> · {scopeName}</span> : null}{q && !f.my ? <span className="faint"> · {search.aiEnabled ? 'AI 추천 먼저' : '관련도순'}</span> : null}</span>
        </div>
        {favMode && !favAll.length && (
          <div className="tl-empty my-fav-empty"><b>아직 찜한 레이아웃이 없어요</b><span>레이아웃 카드 · 상세, Best Scenario 장표, 제안서의 장 어디서든 ♡를 누르면 여기에 모여요. 값이 채워진 장은 그 값 그대로, 빈 레이아웃은 따로 모아요.</span></div>
        )}
        {!search.busy && !search.error && favMode && !list.length && favAll.length > 0 && (
          <div className="tl-empty"><b>조건에 맞는 찜이 없어요</b><span>검색어나 필터를 풀어 보세요.</span><button className="btn btn-sm" onClick={() => set({ ...NO_FILTER, q: '' })}>검색 · 필터 지우기</button></div>
        )}
        {f.my && !favMode && <MyUpload empty={!myAll.length} onFile={(file) => { if (!requireLogin()) return; hc.hide(); setImp(file); }} onBrowse={browseLibrary} />}
        {!search.busy && !search.error && f.my && !favMode && !list.length && myAll.length > 0 && (
          <div className="tl-empty"><b>조건에 맞는 My 템플릿이 없어요</b><span>검색어나 필터를 풀어 보세요.</span><button className="btn btn-sm" onClick={() => set({ ...NO_FILTER, q: '' })}>검색 · 필터 지우기</button></div>
        )}
        {!search.busy && !search.error && q && !list.length && !f.my && (
          <div className="tl-empty">
            <b>“{q}”와 맞는 레이아웃이 없어요</b>
            <span>다른 표현으로 적거나 필터를 풀어 보세요.</span>
            <div className="chips" style={{ justifyContent: 'center' }}>{QUICK.map((t) => <button key={t} className="qchip" onClick={() => { set({ q: t }); if (search.aiEnabled) search.submit(t); }}>{t}</button>)}</div>
          </div>
        )}
        {!q && !list.length && !f.my && (
          <div className="tl-empty"><b>조건에 맞는 레이아웃이 없어요</b><span>필터를 하나씩 풀어 보세요.</span><button className="btn btn-sm" onClick={() => set(NO_FILTER)}>필터 모두 지우기</button></div>
        )}

        {!search.busy && !search.error && (favMode ? <div>{q && search.aiEnabled ? <>
          <h3 className="catalog-ai-section">AI 추천 Top {Math.min(AI_SEARCH_TOP, favShown.length)}</h3>
          <FavSections favs={favShown.slice(0, AI_SEARCH_TOP)} cols={cols} hc={hc} onOpen={i => { const sorted = favOrder(favShown.slice(0, AI_SEARCH_TOP)); setFavOpen(favShown.findIndex(x => x.id === sorted[i].id)); }} />
          {favShown.length > AI_SEARCH_TOP && <><h3 className="catalog-ai-section">나머지 검색 결과</h3><FavSections favs={favShown.slice(AI_SEARCH_TOP)} cols={cols} hc={hc} onOpen={i => { const sorted = favOrder(favShown.slice(AI_SEARCH_TOP)); setFavOpen(favShown.findIndex(x => x.id === sorted[i].id)); }} /></>}
        </> : <FavSections favs={favShown} cols={cols} hc={hc} onOpen={i => { const sorted = favOrder(favShown); setFavOpen(favShown.findIndex(x => x.id === sorted[i].id)); }} />}</div> : f.my && !(q && search.aiEnabled) ? <div><MySections groups={myG} cols={cols} card={card} onDeleteGroup={async (g) => { if (!requireLogin()) return; await deleteTemplates(g.items.map((l) => l.f)); toast(g.file + '에서 가져온 ' + g.items.length + '장을 지웠어요'); }} /></div> : (
        <LayoutSections groups={shownGroups} card={card} cols={cols} query={q} />))}
      </div>
      {hc.node}
      {open != null && flat[open] && !favMode && (f.my
        ? <MyDetail list={flat} index={open} onNav={setOpen} onClose={() => setOpen(null)} onEdit={openEditor} />
        : <TemplateDetail list={flat} index={open} onNav={setOpen} onClose={() => setOpen(null)} onEdit={openEditor} />)}
      {favMode && favOpen != null && favShown[favOpen] && <TemplateDetail list={favShown.map((x) => L[x.f])} ovs={favShown.map((x) => x.ov)} index={favOpen} onNav={setFavOpen} onClose={() => setFavOpen(null)}
        notes={favShown.map((x) => (x.filled ? '값이 채워진 장' : '빈 레이아웃') + (x.from ? ' · ' + x.from : ''))} noteLabel="찜" favFrom={(favShown[favOpen] || {}).from}
        onEdit={openEditor} />}
      {imp && <ImportDialog file={imp} onClose={() => setImp(null)} onSaved={(metas) => onSavedMy(metas, metas.length + '장을 My 템플릿으로 저장했어요', true)} />}
      {edit && <LayoutEditor f={edit.f} ov={edit.ov || null} onClose={() => setEdit(null)} onSaved={m => onSavedMy([m], 'My 템플릿에 저장했어요')} />}
      {fpop && <FilterPopup f={f} base={search.busy || search.error ? searchItems || LAYOUTS : base} onApply={(x) => { set(x); setFpop(false); }} onClose={() => setFpop(false)} />}
    </div>
  );
}
