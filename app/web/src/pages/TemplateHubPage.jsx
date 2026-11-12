import React, { useState, useEffect, useMemo, useRef } from 'react';
import { requireLogin } from '../api/session.js';
import { loadUi, saveUi } from '../repositories/proposals.js';
import { Icon } from '../components/common.jsx';
import { PARTS } from '../domain/proposals/parts.js';
import { LAYOUTS, INDUSTRIES, SOLUTIONS, P } from '../services/catalog.js';
import { SCENARIOS } from '../domain/templates/scenarios.js';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { useCatalogSearch } from '../hooks/useCatalogSearch.js';
import { CatalogSearchBar, CatalogSearchStatus } from '../components/catalog-search.jsx';
import { FilterBar, FilterPopup, FStep, FChip, FAll, FProducts, idList } from '../components/filterpop.jsx';
import { Thumb } from '../components/Thumbs.jsx';
import { useDetailPeek } from '../components/reference-detail.jsx';
import { PART_GROUPS, GROUP_OF, NO_FILTER, pass, activeFilters, LayoutFilterPopup } from '../components/layout-library.jsx';
import { TemplateLibrary, TemplateIcon, loadLib } from './LibraryPage.jsx';
import { ScenarioView, ScenarioFilter, passS, activeBs, loadBs, BS_NO_FILTER, BS_QUICK } from './ScenariosPage.jsx';

/* =========================================================
   템플릿 라이브러리 — 샘플 버티컬 시나리오 (a whole proposal) and PPT 레이아웃 시트 (one sheet) in one sidebar page.
   One search box looks through both; the scope buttons under it pick what is shown — 전체 · 시나리오 N · 시트 N
   (the numbers follow the search and the filters). The scope is part of the route ({ name: 'library', scope: 'sc' | 'sh' },
   the old 'scenarios' route = 시나리오), so browser Back / Forward walk through it.
   전체, before a search: the 요구사항 타입 cards (시나리오로 시작) and one card per 목차 구분 (필요한 한 장 찾기 —
   a card opens 시트 with that 구분 as its filter). 전체, a search: scenarios first (2 per line, the first few), then sheets
   (the first few), each with '모두 보기' → that scope. 시나리오 / 시트 = the two former pages' lists (ScenarioView ·
   TemplateLibrary embed); their details are unchanged.
   Filters: 업종 · 솔루션 · 제품 mean the same on both sides and are kept the same on both; 요구사항 · 전략 · 결말 only
   narrow scenarios, 목차 유형 · 이미지 칸 · 필요한 정보 · 원본 장표 only sheets. The popup follows the scope
   (전체 = the shared steps). State is saved where the two pages kept it (ui.lib · ui.bs).
   AI search runs only for what is on screen; a scope opened later catches up with the submitted request.
   ========================================================= */

const SHARED = ['ind', 'sol', 'prod']; // filters both halves understand — always the same on both sides
const HUB_UNIT = { noun: '시나리오 · 시트', n: '개' };
const SC_LIMIT = 4; // 전체 search: scenarios shown before '모두 보기' (two rows of two)
const SH_LIMIT = 6; // 전체 search: sheets shown before '모두 보기' (two rows of three)
const HUB_QUICK = ['메뉴보드', '호텔 객실', '경쟁사 비교', '도입 효과', '에너지 절감', '설치 일정'];
const PLACEHOLDER = {
  all: '고객 상황이나 필요한 장면을 적어 보세요 · 예) 호텔 객실 TV 교체, 경쟁사 비교',
  sc: '고객 상황 · 제품 · 솔루션으로 찾아 보세요 · 예) 메뉴보드 파일럿, 호텔 객실 TV',
  sh: '찾는 장면을 적어 보세요 · 예) 경쟁사와 비교하는 표, 매장 하루 동선',
};
const scopeOf = (route) => (route.name === 'scenarios' ? 'sc' : route.scope === 'sc' || route.scope === 'sh' ? route.scope : 'all');
/** filter keys the other side shares — only the ones that changed, '솔루션 전용 제외' (sheets only) dropped */
const sharedPatch = (before, after) => {
  const out = {};
  for (const k of SHARED) if (after[k] !== undefined && after[k] !== before[k]) out[k] = k === 'sol' && after[k] === '_none' ? '' : after[k];
  return out;
};

/* ---------- 전체 범위의 필터: 업종 · 솔루션 · 제품 — 숫자는 남는 시나리오 + 시트 수 ---------- */
let usedProd = null;
const usedProducts = () => usedProd || (usedProd = [...new Set([...SCENARIOS.flatMap((s) => s.products), ...LAYOUTS.flatMap((l) => l.prods || [])])].filter((id) => P[id]));
function HubFilter({ lf, bf, scBase, shBase, onApply, onClose }) {
  const peek = useDetailPeek(null);
  const [init] = useState(() => ({ ind: lf.ind || '', sol: lf.sol && lf.sol !== '_none' ? lf.sol : bf.sol || '', prod: lf.prod || '' }));
  const [d, setD] = useState(init);
  const put = (patch) => setD((x) => ({ ...x, ...patch }));
  const scPool = (skip) => scBase.filter((s) => passS(s, { ...bf, ...d }, skip));
  const shPool = (skip) => shBase.filter((l) => pass(l, { ...lf, ...d }, skip));
  const n = scPool().length + shPool().length;
  const indSc = scPool('ind'), indSh = shPool('ind');
  const indN = {}; for (const x of [...indSc, ...indSh]) { const k = x.ind || '_gen'; indN[k] = (indN[k] || 0) + 1; }
  const indAll = indSc.filter((s) => s.ind).length + indSh.filter((l) => l.ind).length;
  const solSc = scPool('sol'), solSh = shPool('sol');
  const solN = {};
  for (const s of solSc) for (const id of new Set(s.solutions)) solN[id] = (solN[id] || 0) + 1;
  for (const l of solSh) for (const id of new Set([l.sol, ...(l.sols || [])].filter(Boolean))) solN[id] = (solN[id] || 0) + 1;
  const prodN = {};
  for (const s of scPool('prod')) for (const id of new Set(s.products)) prodN[id] = (prodN[id] || 0) + 1;
  for (const l of shPool('prod')) for (const id of new Set(l.prods || [])) prodN[id] = (prodN[id] || 0) + 1;
  const chip = (key, val, label, cnt, pre) => {
    const sel = d[key] === val;
    return <FChip key={key + ':' + val} on={sel} n={cnt} pre={pre} peek={key === 'sol' ? peek : null} r={key === 'sol' ? 'solution:' + val : null} onClick={() => put({ [key]: sel ? '' : val })}>{label}</FChip>;
  };
  const solCats = [...new Set(SOLUTIONS.filter((x) => solN[x.id] || d.sol === x.id).map((x) => x.cat))];
  return (
    <FilterPopup unit={HUB_UNIT} n={n} canReset={SHARED.some((k) => d[k])} onReset={() => setD({ ind: '', sol: '', prod: '' })} onApply={() => onApply(sharedPatch(init, d))} onClose={onClose}>
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
        <FProducts ids={idList(d.prod)} counts={prodN} used={usedProducts()} unit={HUB_UNIT} peek={peek} onChange={(ids) => put({ prod: ids.join(',') })} />
      </FStep>
      {peek.node}
    </FilterPopup>
  );
}

/* ---------- 전체, before a search: one card per 목차 구분 — three of its sheets, how many, its 목차 유형 ---------- */
function SheetGroupCard({ g, items, onOpen }) {
  const byPart = {}; for (const l of items) (byPart[l.p] = byPart[l.p] || []).push(l);
  const parts = g.parts.filter((p) => byPart[p] && PARTS[p]);
  const thumbs = parts.slice(0, 3).map((p) => byPart[p][0]);
  for (const l of items) { if (thumbs.length >= 3) break; if (!thumbs.includes(l)) thumbs.push(l); }
  return (
    <button type="button" className={'hub-gc h-' + g.hue} onClick={onOpen} aria-label={g.label + ' 시트 ' + items.length + '장 보기'} data-grp={g.k}>
      <span className="hub-gc-th" aria-hidden="true">{thumbs.map((l) => <span key={l.f} className="hub-gc-s"><FitSlide f={l.f} lazy /></span>)}</span>
      <span className="hub-gc-h"><b className="hub-gc-t">{g.label}</b><span className="hub-gc-n"><b className="num">{items.length}</b>장</span></span>
      <span className="hub-gc-ps" aria-hidden="true">
        {parts.slice(0, 4).map((p) => <span key={p} className="hub-gc-p">{PARTS[p].label}<span className="num">{byPart[p].length}</span></span>)}
        {parts.length > 4 ? <span className="hub-gc-p more">+{parts.length - 4}</span> : null}
      </span>
    </button>
  );
}

/* =========================================================
   Page
   ========================================================= */
export function TemplateHub({ go, route }) {
  const scope = scopeOf(route);
  const [lf, setLf] = useState(() => { // sheet filters + the search text (ui.lib, as before)
    const x = loadLib(); const bq = (loadUi().bs || {}).q;
    if (typeof bq === 'string' && bq && (!x.q || scope === 'sc')) x.q = bq;
    return x;
  });
  const [bf, setBf] = useState(loadBs); // scenario filters (ui.bs, as before)
  const [fpop, setFpop] = useState(false);
  const [aiQ, setAiQ] = useState(''); // the last AI request — a scope opened later searches it too
  const scroller = useRef(null);
  const q = lf.q;
  const setQ = (v) => setLf((x) => ({ ...x, q: v }));
  useEffect(() => { saveUi({ ...loadUi(), lib: lf, bs: { ...bf, q: lf.q } }); }, [lf, bf]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [scope]);
  const setScope = (s) => { if (s !== scope) { setFpop(false); go({ name: 'library', ...(s === 'all' ? {} : { scope: s }) }); } };

  const scActive = activeBs(bf), shActive = activeFilters(lf);
  const ssearch = useCatalogSearch('scenarios', q, { filters: scActive.map((x) => x.label), allowedIds: SCENARIOS.filter((s) => passS(s, bf)).map((s) => s.id) });
  const lsearch = useCatalogSearch('layouts', q, { filters: shActive.map((x) => x.label), allowedIds: LAYOUTS.filter((l) => pass(l, lf)).map((l) => l.f), scope: 'library' });
  const ai = ssearch.aiEnabled;
  const shown = scope === 'sc' ? [ssearch] : scope === 'sh' ? [lsearch] : [ssearch, lsearch];
  const lagging = (k) => !!(ai && aiQ && k.query !== aiQ); // opened after the request, about to catch up
  // one search box over both: AI requests go only to what is on screen
  const search = {
    aiEnabled: ai,
    setAIEnabled: (v) => { setAiQ(''); ssearch.setAIEnabled(v); lsearch.setAIEnabled(v); },
    clear: () => { setAiQ(''); ssearch.clear(); lsearch.clear(); },
    submit: (text) => {
      const v = (text ?? q).trim();
      if (!ai || !v || !requireLogin()) return;
      shown.forEach((k) => k.submit(v)); setAiQ(v);
    },
    busy: shown.some((k) => k.busy || lagging(k)),
    message: (shown.find((k) => k.busy) || {}).message || (shown.some(lagging) ? '고객 상황에 맞는 자료를 찾고 있어요…' : ''),
    error: (shown.find((k) => k.error) || {}).error || '',
    retry: () => shown.filter((k) => k.error).forEach((k) => k.retry()),
  };
  useEffect(() => { if (!q.trim()) setAiQ(''); }, [q.trim() === '']);
  useEffect(() => { // a scope opened after an AI request searches the same request
    if (!ai || !aiQ) return;
    if (scope !== 'sh' && ssearch.query !== aiQ) ssearch.submit(aiQ);
    if (scope !== 'sc' && lsearch.query !== aiQ) lsearch.submit(aiQ);
  }, [scope, ai, aiQ]);

  const scQ = ssearch.query, shQ = lsearch.query;
  const scHits = ssearch.hits;
  const scHitOf = useMemo(() => Object.fromEntries((scHits || []).map((r) => [r.id, r])), [scHits]);
  const scBase = scQ ? (scHits || []).map((r) => r.item) : SCENARIOS;
  const shBase = shQ ? (lsearch.hits || []).map((r) => r.item) : LAYOUTS;
  const scList = scBase.filter((s) => passS(s, bf));
  const shList = shBase.filter((l) => pass(l, lf));
  const ready = (k) => !k.busy && !k.error && !lagging(k);
  const nSc = ready(ssearch) ? scList.length : null;
  const nSh = ready(lsearch) ? shList.length : null;
  const shSearch = { ...lsearch, submit: search.submit }; // the sheet list's own retry chips go through the one search box
  const searching = scope === 'sc' ? !!scQ : scope === 'sh' ? !!shQ : !!(scQ || shQ);

  // filters — 업종 · 솔루션 · 제품 are applied to both sides
  const applySc = (d) => { const p = sharedPatch(bf, d); setBf((x) => ({ ...x, ...d })); setLf((x) => ({ ...x, ...p })); };
  const applySh = (d) => { const p = sharedPatch(lf, d); setLf((x) => ({ ...x, ...d })); setBf((x) => ({ ...x, ...p })); };
  const applyAll = (p) => { setLf((x) => ({ ...x, ...p })); setBf((x) => ({ ...x, ...p })); };
  const active = scope === 'sc' ? scActive : scope === 'sh' ? shActive : [
    ...shActive.filter((a) => SHARED.includes(a.k)),
    ...scActive.filter((a) => !SHARED.includes(a.k)).map((a) => ({ ...a, k: 'sc:' + a.k })),
    ...shActive.filter((a) => !SHARED.includes(a.k)).map((a) => ({ ...a, k: 'sh:' + a.k })),
  ];
  const remove = (a) => {
    const key = a.k.replace(/^s[ch]:/, '');
    if (SHARED.includes(key)) { setLf((x) => ({ ...x, [key]: '' })); setBf((x) => ({ ...x, [key]: '' })); return; }
    if (a.k.startsWith('sc:') || scope === 'sc') setBf((x) => ({ ...x, ...a.clear })); else setLf((x) => ({ ...x, ...a.clear }));
  };
  const clearAll = () => {
    const none = { ind: '', sol: '', prod: '' };
    setBf((x) => ({ ...x, ...(scope === 'sh' ? none : BS_NO_FILTER) }));
    setLf((x) => ({ ...x, ...(scope === 'sc' ? none : NO_FILTER) }));
  };
  const quick = (t) => { setQ(t); if (ai) search.submit(t); };
  const openGroup = (k) => { setLf((x) => ({ ...x, grp: k, part: '' })); setScope('sh'); };

  const busy = search.busy, failed = !!search.error;
  const scView = (extra) => <ScenarioView go={go} list={scList} query={scQ} ai={ai} hitOf={scHitOf} mark={bf} {...extra} />;
  const more = (n, unit, s) => n > (s === 'sc' ? SC_LIMIT : SH_LIMIT) && <button type="button" className="hub-more" onClick={() => setScope(s)}>{n}{unit} 모두 보기<Icon name="chev" size={15} stroke={2.4} /></button>;
  const byGroup = {}; if (scope === 'all' && !searching) for (const l of shList) { const g = GROUP_OF[l.p]; if (g) (byGroup[g] = byGroup[g] || []).push(l); }

  return (
    <div className="tl hub" id="tl-scroll" ref={scroller} data-library-scope="catalog" data-hub-scope={scope}>
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
              <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>전체{searching && nSc != null && nSh != null ? <span className="num">{nSc + nSh}</span> : null}</button>
              <button type="button" aria-pressed={scope === 'sc'} onClick={() => setScope('sc')}><Icon name="route" size={15} />시나리오{nSc != null ? <span className="num">{nSc}</span> : null}</button>
              <button type="button" aria-pressed={scope === 'sh'} onClick={() => setScope('sh')}><TemplateIcon size={15} />시트{nSh != null ? <span className="num">{nSh}</span> : null}</button>
            </div>
            <FilterBar active={active} onOpen={() => setFpop(true)} onRemove={remove} onClearAll={clearAll} />
          </div>
        </div>

        <CatalogSearchStatus search={search} />

        {scope === 'all' && !searching && (
          <div className="hub-body">
            {scList.length > 0 && (
              <section className="hub-sec" aria-labelledby="hub-sc">
                <div className="hub-sec-h"><h2 id="hub-sc">시나리오로 시작</h2><span className="hub-sec-n"><b className="num">{scList.length}</b>개</span></div>
                {scView({ query: '' })}
              </section>
            )}
            {shList.length > 0 && (
              <section className="hub-sec" aria-labelledby="hub-sh">
                <div className="hub-sec-h"><h2 id="hub-sh">필요한 한 장 찾기</h2><span className="hub-sec-n"><b className="num">{shList.length}</b>장</span>
                  <button type="button" className="hub-more" onClick={() => setScope('sh')}>{shList.length}장 모두 보기<Icon name="chev" size={15} stroke={2.4} /></button></div>
                <div className="hub-gc-grid" role="group" aria-label="목차 구분별 시트">
                  {PART_GROUPS.filter((g) => byGroup[g.k]).map((g) => <SheetGroupCard key={g.k} g={g} items={byGroup[g.k]} onOpen={() => openGroup(g.k)} />)}
                </div>
              </section>
            )}
            {!scList.length && !shList.length && (
              <div className="tl-empty"><b>조건에 맞는 시나리오 · 시트가 없어요</b><span>필터를 하나씩 풀어 보세요.</span><button className="btn btn-sm" onClick={clearAll}>필터 모두 지우기</button></div>
            )}
          </div>
        )}

        {scope === 'all' && searching && !busy && !failed && (
          <div className="hub-body">
            {scList.length > 0 && (
              <section className="hub-sec" aria-labelledby="hub-sc">
                <div className="hub-sec-h"><h2 id="hub-sc">시나리오</h2><span className="hub-sec-n"><b className="num">{scList.length}</b>개</span>{more(scList.length, '개', 'sc')}</div>
                {scView({ limit: SC_LIMIT })}
              </section>
            )}
            {shList.length > 0 && (
              <section className="hub-sec" aria-labelledby="hub-sh">
                <div className="hub-sec-h"><h2 id="hub-sh">시트</h2><span className="hub-sec-n"><b className="num">{shList.length}</b>장</span>{more(shList.length, '장', 'sh')}</div>
                <TemplateLibrary go={go} embed={{ f: lf, setF: setLf, search: shSearch, limit: SH_LIMIT }} />
              </section>
            )}
            {!scList.length && !shList.length && (
              <div className="tl-empty">
                <b>“{scQ || shQ}”와 맞는 시나리오 · 시트가 없어요</b>
                <span>{active.length ? '필터를 풀거나 ' : ''}다른 표현으로 적어 보세요.</span>
                <div className="chips" style={{ justifyContent: 'center' }}>{HUB_QUICK.map((t) => <button key={t} className="qchip" onClick={() => quick(t)}>{t}</button>)}</div>
              </div>
            )}
          </div>
        )}

        {scope === 'sc' && (
          <div className="hub-body" aria-busy={busy}>
            {!busy && !failed && scList.length > 0 && scView({})}
            {!busy && !failed && scQ && !scList.length && (
              <div className="tl-empty">
                <b>“{scQ}”와 맞는 시나리오가 없어요</b>
                <span>{scActive.length ? '필터를 풀거나 ' : ''}다른 표현으로 적어 보세요.</span>
                <div className="chips" style={{ justifyContent: 'center' }}>{BS_QUICK.map((t) => <button key={t} className="qchip" onClick={() => quick(t)}>{t}</button>)}</div>
              </div>
            )}
            {!scQ && !scList.length && (
              <div className="tl-empty"><b>조건에 맞는 시나리오가 없어요</b><span>필터를 하나씩 풀어 보세요.</span><button className="btn btn-sm" onClick={clearAll}>필터 모두 지우기</button></div>
            )}
          </div>
        )}

        {scope === 'sh' && !lagging(lsearch) && <TemplateLibrary go={go} embed={{ f: lf, setF: setLf, search: shSearch }} />}
      </div>

      {fpop && scope === 'sc' && <ScenarioFilter f={bf} base={ssearch.busy || ssearch.error ? SCENARIOS : scBase} onApply={(d) => { applySc(d); setFpop(false); }} onClose={() => setFpop(false)} />}
      {fpop && scope === 'sh' && <LayoutFilterPopup f={lf} base={lsearch.busy || lsearch.error ? LAYOUTS : shBase} onApply={(d) => { applySh(d); setFpop(false); }} onClose={() => setFpop(false)} />}
      {fpop && scope === 'all' && <HubFilter lf={lf} bf={bf} scBase={ssearch.busy || ssearch.error ? SCENARIOS : scBase} shBase={lsearch.busy || lsearch.error ? LAYOUTS : shBase} onApply={(p) => { applyAll(p); setFpop(false); }} onClose={() => setFpop(false)} />}
    </div>
  );
}
