import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadUi, saveUi } from '../repositories/proposals.js';
import { Icon } from '../components/common.jsx';
import { PARTS } from '../domain/proposals/parts.js';
import { LAYOUTS, INDUSTRIES, SOLUTIONS, P } from '../services/catalog.js';
import { SCENARIOS } from '../domain/templates/scenarios.js';
import { useCatalogSearch } from '../hooks/useCatalogSearch.js';
import { layoutLibrary } from '../domain/templates/layout_library.js';
import { filterCountLayouts } from '../domain/templates/layout_count_groups.js';
import { CatalogSearchBar, CatalogSearchStatus } from '../components/catalog-search.jsx';
import { searchCatalogKeywords } from '../services/catalog-search.js';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { Thumb } from '../components/Thumbs.jsx';
import { useDetailPeek } from '../components/reference-detail.jsx';
import { FilterBar, FilterPopup, FStep, FChip, FAll, FProducts, idList } from '../components/filterpop.jsx';
import { PART_GROUPS, GROUP_OF, NO_FILTER, pass, activeFilters, LayoutFilterPopup } from '../components/layout-library.jsx';
import { TemplateLibrary, TemplateIcon, fromSaved } from './LibraryPage.jsx';
import { ScenarioList, ScenarioFilter, loadBs, passS, activeBs, BS_NO_FILTER, BS_QUICK, USED_PROD as SC_PROD } from './ScenariosPage.jsx';
import '../styles/hub.css';

/* =========================================================
   템플릿 라이브러리 — 시나리오와 시트를 한 검색창 아래에 (sidebar: one entry; route library · scope sc | sh, scenarios → sc).
   전체: 시나리오로 시작 (요구사항 타입 카드) + 필요한 한 장 찾기 (목차 구분 카드) · a search shows both, a few of each.
   시나리오 · 시트: one half in full (ScenariosPage.jsx ScenarioList · LibraryPage.jsx TemplateLibrary embedded).
   Each half keeps its own filters (bs · lib in the saved UI); 업종 · 솔루션 · 제품 are shared, so a choice made in one follows
   into the other, and the 전체 filter popup sets just those three.
   ========================================================= */
const SHARED = ['ind', 'sol', 'prod'];
const HUB_UNIT = { noun: '시나리오 · 시트', n: '개' };
const SC_LIMIT = 4, SH_LIMIT = 6;
const HUB_QUICK = ['메뉴보드', '호텔 객실', '경쟁사 비교', '도입 효과', '에너지 절감', '설치 일정'];
const PLACEHOLDER = {
  all: '고객 상황이나 필요한 장면을 적어 보세요 · 예) 호텔 객실 TV 교체, 경쟁사 비교',
  sc: '고객 상황 · 제품 · 솔루션으로 찾아 보세요 · 예) 메뉴보드 파일럿, 호텔 객실 TV',
  sh: '찾는 장면을 적어 보세요 · 예) 경쟁사와 비교하는 표, 매장 하루 동선',
};
export const hubScope = (route) => (route.name === 'scenarios' ? 'sc' : route.scope === 'sc' || route.scope === 'sh' ? route.scope : 'all');
/** the shared keys of `next` that differ from `prev` (a sheet-only "솔루션 전용 제외" means no solution filter for scenarios) */
const sharedChange = (prev, next) => {
  const out = {};
  for (const k of SHARED) if (next[k] !== undefined && next[k] !== prev[k]) out[k] = k === 'sol' && next[k] === '_none' ? '' : next[k];
  return out;
};
/** products used by any scenario or sheet — the only ones worth filtering by */
let usedProd = null;
const hubProducts = () => usedProd || (usedProd = [...new Set([...SC_PROD, ...LAYOUTS.flatMap((l) => l.prods || [])])].filter((id) => P[id]));
const tally = (list, keys) => { const m = {}; for (const x of list) for (const k of new Set([].concat(keys(x)).filter((v) => v != null && v !== ''))) m[k] = (m[k] || 0) + 1; return m; };

/** 전체 filter popup — 업종 → 솔루션 → 제품, counted over scenarios and sheets together */
function HubFilter({ lf, bf, scBase, shBase, onApply, onClose }) {
  const peek = useDetailPeek(null);
  const [start] = useState(() => ({ ind: lf.ind || '', sol: lf.sol && lf.sol !== '_none' ? lf.sol : bf.sol || '', prod: lf.prod || '' }));
  const [d, setD] = useState(start);
  const put = (patch) => setD((x) => ({ ...x, ...patch }));
  const scPool = (skip) => scBase.filter((s) => passS(s, { ...bf, ...d }, skip));
  const shPool = (skip) => filterCountLayouts(shBase, l => pass(l, { ...lf, ...d }, skip));
  const n = scPool().length + shPool().length;
  const indSc = scPool('ind'), indSh = shPool('ind');
  const indN = tally([...indSc, ...indSh], (x) => x.ind || '_gen');
  const indAll = indSc.filter((s) => s.ind).length + indSh.filter((l) => l.ind).length;
  const solSc = scPool('sol'), solSh = shPool('sol');
  const solN = {};
  for (const [k, v] of Object.entries(tally(solSc, (s) => s.solutions))) solN[k] = (solN[k] || 0) + v;
  for (const [k, v] of Object.entries(tally(solSh, (l) => [l.sol, ...(l.sols || [])]))) solN[k] = (solN[k] || 0) + v;
  const prodN = {};
  for (const [k, v] of Object.entries(tally(scPool('prod'), (s) => s.products))) prodN[k] = (prodN[k] || 0) + v;
  for (const [k, v] of Object.entries(tally(shPool('prod'), (l) => l.prods || []))) prodN[k] = (prodN[k] || 0) + v;
  const chip = (key, val, label, cnt, pre) => {
    const on = d[key] === val;
    return <FChip key={key + ':' + val} on={on} n={cnt} pre={pre} peek={key === 'sol' ? peek : null} r={key === 'sol' ? 'solution:' + val : null} onClick={() => put({ [key]: on ? '' : val })}>{label}</FChip>;
  };
  const solCats = [...new Set(SOLUTIONS.filter((x) => solN[x.id] || d.sol === x.id).map((x) => x.cat))];
  return (
    <FilterPopup unit={HUB_UNIT} n={n} canReset={SHARED.some((k) => d[k])} onReset={() => setD({ ind: '', sol: '', prod: '' })} onApply={() => onApply(sharedChange(start, d))} onClose={onClose}>
      <FStep no={1} title="업종">
        <div className="tlf-chips">
          <FAll on={!d.ind} n={indSc.length + indSh.length} onClick={() => put({ ind: '' })} />
          {chip('ind', '_gen', '범용', indN._gen)}
          {chip('ind', '_ind', '업종 맞춤 전체', indAll)}
        </div>
        <div className="tlf-chips">{INDUSTRIES.map((i) => chip('ind', i.code, i.name, indN[i.code]))}</div>
      </FStep>
      <FStep no={2} title="솔루션">
        <div className="tlf-chips"><FAll on={!d.sol} n={solSc.length + solSh.length} onClick={() => put({ sol: '' })} /></div>
        {solCats.map((c) => (
          <div key={c} className="tlf-sub"><span className="tlf-cat">{c}</span>
            <div className="tlf-chips">{SOLUTIONS.filter((x) => x.cat === c && (solN[x.id] || d.sol === x.id)).map((x) => chip('sol', x.id, x.name, solN[x.id], <Thumb r={'solution:' + x.id} mini className="tlf-th" />))}</div>
          </div>
        ))}
      </FStep>
      <FStep no={3} title="제품" hint="고른 제품 중 하나라도 들어간 것">
        <FProducts ids={idList(d.prod)} counts={prodN} used={hubProducts()} unit={HUB_UNIT} peek={peek} onChange={(ids) => put({ prod: ids.join(',') })} />
      </FStep>
      {peek.node}
    </FilterPopup>
  );
}

/** 전체, before a search — one card per 목차 구분: three of its sheets on the 구분 colour, name · count, its 목차 유형 */
function GroupCard({ g, items, onOpen }) {
  const byPart = {};
  for (const l of items) (byPart[l.p] = byPart[l.p] || []).push(l);
  const parts = g.parts.filter((p) => byPart[p] && PARTS[p]);
  const shown = parts.slice(0, 3).map((p) => byPart[p][0]);
  for (const l of items) { if (shown.length >= 3) break; if (!shown.includes(l)) shown.push(l); }
  return (
    <button type="button" className={'hub-gc h-' + g.hue} onClick={onOpen} aria-label={g.label + ' 시트 ' + items.length + '종 보기'} data-grp={g.k}>
      <span className="hub-gc-th" aria-hidden="true">{shown.map((l) => <span key={l.f} className="hub-gc-s"><FitSlide f={l.f} lazy /></span>)}</span>
      <span className="hub-gc-h"><b className="hub-gc-t">{g.label}</b><span className="hub-gc-n"><b className="num">{items.length}</b>종</span></span>
      <span className="hub-gc-ps" aria-hidden="true">
        {parts.slice(0, 4).map((p) => <span key={p} className="hub-gc-p">{PARTS[p].label}<span className="num">{byPart[p].length}</span></span>)}
        {parts.length > 4 ? <span className="hub-gc-p more">+{parts.length - 4}</span> : null}
      </span>
    </button>
  );
}

export function LibraryHub({ go, route }) {
  const libraryRevision = layoutLibrary().rev;
  const scope = hubScope(route);
  const [lf, setLf] = useState(() => {
    const ui = loadUi(), x = { ...fromSaved(ui.lib || {}), my: false, myTab: 'tpl' }, bq = (ui.bs || {}).q;
    if (typeof bq === 'string' && bq && (!x.q || scope === 'sc')) x.q = bq;
    return x;
  });
  const [bf, setBf] = useState(loadBs);
  const [fpop, setFpop] = useState(false);
  const root = useRef(null);
  const q = lf.q;
  const setQ = (value) => setLf((x) => ({ ...x, q: value }));
  useEffect(() => { saveUi({ ...loadUi(), lib: lf, bs: { ...bf, q: lf.q } }); }, [lf, bf]);
  useEffect(() => { root.current?.scrollTo?.({ top: 0 }); }, [scope]);
  const toScope = (s) => { if (s !== scope) { setFpop(false); go({ name: 'library', ...(s === 'all' ? {} : { scope: s }) }); } };

  // one search box over both halves — AI search (opt-in) runs for the halves on screen
  const scAsk = useCatalogSearch('scenarios', q, { filters: activeBs(bf).map((x) => x.label), allowedIds: SCENARIOS.filter((s) => passS(s, bf)).map((s) => s.id) });
  const shAsk = useCatalogSearch('layouts', q, { filters: activeFilters(lf).map((x) => x.label), allowedIds: LAYOUTS.filter((l) => pass(l, lf)).map((l) => l.f), scope: 'library' });
  // AI 검색 on and a question typed but not asked yet: the keyword hits as lists meanwhile — a search never shows the 묶음 cards.
  // Enter swaps them for the AI ranking.
  const draft = q.trim();
  const typed = scAsk.aiEnabled && !!draft && !scAsk.query;
  const scKw = useMemo(() => (typed ? searchCatalogKeywords('scenarios', draft) : null), [typed, draft]);
  const shKw = useMemo(() => (typed ? searchCatalogKeywords('layouts', draft) : null), [typed, draft, libraryRevision]);
  const scSearch = typed ? { ...scAsk, aiEnabled: false, query: draft, hits: scKw } : scAsk;
  const shSearch = typed ? { ...shAsk, aiEnabled: false, query: draft, hits: shKw } : shAsk;
  const live = scope === 'sc' ? [scSearch] : scope === 'sh' ? [shSearch] : [scSearch, shSearch];
  const search = {
    aiEnabled: scAsk.aiEnabled,
    setAIEnabled: (on) => { scAsk.setAIEnabled(on); shAsk.setAIEnabled(on); },
    submit: (text) => live.forEach((x) => x.submit(text)),
    clear: () => { scAsk.clear(); shAsk.clear(); },
    busy: live.some((x) => x.busy),
    message: live.map((x) => x.message).find(Boolean) || '',
    error: live.map((x) => x.error).find(Boolean) || '',
    retry: () => live.forEach((x) => x.error && x.retry()),
  };
  // AI on and a question already asked: a half that comes on screen asks it too
  useEffect(() => { if (scAsk.aiEnabled && q.trim()) live.forEach((x) => { if (x.query !== q.trim()) x.submit(q); }); }, [scope]);
  const query = scope === 'sh' ? shSearch.query : scope === 'sc' ? scSearch.query : scSearch.query || shSearch.query;
  const searching = !!query;

  const scHits = scSearch.hits;
  const scBase = scSearch.query ? (scHits || []).map((r) => r.item) : SCENARIOS;
  const scList = scBase.filter((s) => passS(s, bf));
  const scHitOf = useMemo(() => Object.fromEntries((scHits || []).map((r) => [r.id, r])), [scHits]);
  const shBase = shSearch.query ? (shSearch.hits || []).map((r) => r.item) : LAYOUTS;
  const shList = filterCountLayouts(shBase, l => pass(l, lf));

  // filters: each half its own, the shared three kept in step
  const applySc = (x) => { const shared = sharedChange(bf, x); setBf((v) => ({ ...v, ...x })); setLf((v) => ({ ...v, ...shared })); };
  const applySh = (x) => { const shared = sharedChange(lf, x); setLf((v) => ({ ...v, ...x })); setBf((v) => ({ ...v, ...shared })); };
  const applyAll = (x) => { setLf((v) => ({ ...v, ...x })); setBf((v) => ({ ...v, ...x })); };
  const scChips = activeBs(bf), shChips = activeFilters(lf);
  const active = scope === 'sc' ? scChips : scope === 'sh' ? shChips
    : [...shChips.filter((a) => SHARED.includes(a.k)), ...scChips.filter((a) => !SHARED.includes(a.k)).map((a) => ({ ...a, k: 'sc:' + a.k })),
      ...shChips.filter((a) => !SHARED.includes(a.k)).map((a) => ({ ...a, k: 'sh:' + a.k }))];
  const removeChip = (a) => {
    const key = a.k.replace(/^s[ch]:/, '');
    if (SHARED.includes(key)) { setLf((v) => ({ ...v, [key]: '' })); setBf((v) => ({ ...v, [key]: '' })); return; }
    if (a.k.startsWith('sc:') || scope === 'sc') setBf((v) => ({ ...v, ...a.clear })); else setLf((v) => ({ ...v, ...a.clear }));
  };
  const clearAll = () => {
    const none = { ind: '', sol: '', prod: '' };
    setBf((v) => ({ ...v, ...(scope === 'sh' ? none : BS_NO_FILTER) }));
    setLf((v) => ({ ...v, ...(scope === 'sc' ? none : NO_FILTER) }));
  };
  const openGroup = (k) => { setLf((v) => ({ ...v, grp: k, part: '', my: false })); toScope('sh'); };
  const more = (n, unit, s) => n > (s === 'sc' ? SC_LIMIT : SH_LIMIT) && (
    <button type="button" className="hub-more" onClick={() => toScope(s)}>{n}{unit} 모두 보기<Icon name="chev" size={15} stroke={2.4} /></button>
  );
  const byGroup = {};
  if (scope === 'all' && !searching) for (const l of shList) { const g = GROUP_OF[l.p]; if (g) (byGroup[g] = byGroup[g] || []).push(l); }
  const ready = !search.busy && !search.error;
  const scenarios = (props) => <ScenarioList go={go} list={scList} query={scSearch.query} mark={bf} hitOf={scHitOf} {...props} />;
  const sheets = (limit = 0) => <TemplateLibrary go={go} hub={{ f: lf, setF: setLf, search: shSearch, setQ, limit }} />;
  const nothing = (label, quick, chips) => (
    <div className="tl-empty">
      <b>“{query}”와 맞는 {label}가 없어요</b>
      <span>{chips ? '필터를 풀거나 ' : ''}다른 표현으로 적어 보세요.</span>
      <div className="chips" style={{ justifyContent: 'center' }}>{quick.map((t) => <button key={t} className="qchip" onClick={() => { setQ(t); if (search.aiEnabled) search.submit(t); }}>{t}</button>)}</div>
    </div>
  );
  const unfiltered = (label) => (
    <div className="tl-empty"><b>조건에 맞는 {label}가 없어요</b><span>필터를 하나씩 풀어 보세요.</span><button className="btn btn-sm" onClick={clearAll}>필터 모두 지우기</button></div>
  );

  return (
    <div className="tl hub" id="tl-scroll" ref={root} data-hub-scope={scope} data-library-scope="catalog">
      <div className="tl-in">
        <header className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">WINMATE · 템플릿 라이브러리</span>
            <h1>템플릿 라이브러리</h1>
          </div>
        </header>

        <div className="tl-tools tl-tools-f">
          <div className="tl-row">
            <CatalogSearchBar id="tl-q" label="템플릿 검색" value={q} onChange={setQ} search={search} placeholder={PLACEHOLDER[scope]} />
          </div>
          <div className="hub-bar">
            <div className="hub-scope" role="group" aria-label="보기 범위">
              <button type="button" aria-pressed={scope === 'all'} onClick={() => toScope('all')}>전체{searching && ready ? <span className="num">{scList.length + shList.length}</span> : null}</button>
              <button type="button" aria-pressed={scope === 'sc'} onClick={() => toScope('sc')}><Icon name="route" size={15} />시나리오<span className="num">{scList.length}</span></button>
              <button type="button" aria-pressed={scope === 'sh'} onClick={() => toScope('sh')}><TemplateIcon size={15} />시트<span className="num">{shList.length}</span></button>
            </div>
            <FilterBar active={active} onOpen={() => setFpop(true)} onRemove={removeChip} onClearAll={clearAll} />
          </div>
        </div>

        <CatalogSearchStatus search={search} />

        {ready && scope === 'all' && !searching && (
          <div className="hub-body">
            {scList.length > 0 && (
              <section className="hub-sec" aria-labelledby="hub-sc">
                <div className="hub-sec-h"><h2 id="hub-sc">시나리오로 시작</h2><span className="hub-sec-n"><b className="num">{scList.length}</b>개</span></div>
                {scenarios({ query: '' })}
              </section>
            )}
            {shList.length > 0 && (
              <section className="hub-sec" aria-labelledby="hub-sh">
                <div className="hub-sec-h">
                  <h2 id="hub-sh">필요한 한 장 찾기</h2><span className="hub-sec-n"><b className="num">{shList.length}</b>종</span>
                  <button type="button" className="hub-more" onClick={() => toScope('sh')}>{shList.length}종 모두 보기<Icon name="chev" size={15} stroke={2.4} /></button>
                </div>
                <div className="hub-gc-grid" role="group" aria-label="목차 구분별 시트">
                  {PART_GROUPS.filter((g) => byGroup[g.k]).map((g) => <GroupCard key={g.k} g={g} items={byGroup[g.k]} onOpen={() => openGroup(g.k)} />)}
                </div>
              </section>
            )}
            {!scList.length && !shList.length && unfiltered('시나리오 · 시트')}
          </div>
        )}

        {ready && scope === 'all' && searching && (
          <div className="hub-body">
            {scList.length > 0 && (
              <section className="hub-sec" aria-labelledby="hub-sc">
                <div className="hub-sec-h"><h2 id="hub-sc">시나리오</h2><span className="hub-sec-n"><b className="num">{scList.length}</b>개</span>{more(scList.length, '개', 'sc')}</div>
                {scenarios({ limit: SC_LIMIT })}
              </section>
            )}
            {shList.length > 0 && (
              <section className="hub-sec" aria-labelledby="hub-sh">
                <div className="hub-sec-h"><h2 id="hub-sh">시트</h2><span className="hub-sec-n"><b className="num">{shList.length}</b>종</span>{more(shList.length, '종', 'sh')}</div>
                {sheets(SH_LIMIT)}
              </section>
            )}
            {!scList.length && !shList.length && nothing('시나리오 · 시트', HUB_QUICK, active.length)}
          </div>
        )}

        {ready && scope === 'sc' && (
          <div className="hub-body">
            {scList.length > 0 && scenarios({})}
            {searching && !scList.length && nothing('시나리오', BS_QUICK, scChips.length)}
            {!searching && !scList.length && unfiltered('시나리오')}
          </div>
        )}

        {scope === 'sh' && sheets()}
      </div>

      {fpop && scope === 'sc' && <ScenarioFilter f={bf} base={search.busy || search.error ? SCENARIOS : scBase} onApply={(x) => { applySc(x); setFpop(false); }} onClose={() => setFpop(false)} />}
      {fpop && scope === 'sh' && <LayoutFilterPopup f={lf} base={search.busy || search.error ? LAYOUTS : shBase} onApply={(x) => { applySh(x); setFpop(false); }} onClose={() => setFpop(false)} />}
      {fpop && scope === 'all' && <HubFilter lf={lf} bf={bf} scBase={search.busy || search.error ? SCENARIOS : scBase} shBase={search.busy || search.error ? LAYOUTS : shBase} onApply={(x) => { applyAll(x); setFpop(false); }} onClose={() => setFpop(false)} />}
    </div>
  );
}
