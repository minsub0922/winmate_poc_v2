import React, { useState, useMemo, useRef, useEffect } from 'react';
import { loadUi, saveUi } from '../repositories/proposals.js';
import { Icon, Modal, toast, partHue } from '../components/common.jsx';
import { PARTS, REQ_LABEL } from '../domain/proposals/parts.js';
import { LAYOUTS, ALL_LAYOUTS, L, IND, INDUSTRIES, S, SOLUTIONS, P, isPhotoFirst } from '../services/catalog.js';
import { searchLayouts } from '../services/search.js';
import { FitSlide, useWidth } from '../domain/slides/Slide.jsx';
import { exportPptx } from '../domain/slides/export-pptx.js';
import { DECKS, DECK, TemplateDetail, saveBlob, safeName, slidesOf } from '../components/tplkit.jsx';
import { Thumb } from '../components/Thumbs.jsx';
import { usePickPeek } from '../components/pickpeek.jsx';
import { FilterBar, FilterPopup as FilterFrame, FStep, FChip, FAll, FProducts, idList, LAYOUT_UNIT } from '../components/filterpop.jsx';
import { MyToggle, MyUpload, MySections, myGroups, ImportDialog, MyDetail, LayoutEditor, srcLabel, FavSections, favOrder } from '../components/mytpl.jsx';
import { useFavs, liveFavs } from '../repositories/favorites.js';
import { useMy, deleteTemplates } from '../repositories/templates.js';
import { FavButton } from '../components/fav.jsx';

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
   My (button next to '필터', mytpl.jsx): only the person's own templates — PPTX upload first, then one group per file;
   a library layout's detail has '고쳐서 My에 저장' (layout editor → a new My template).
   ========================================================= */

// 구분 1 — Storyboard part types, grouped the way a proposal flows.
const PART_GROUPS = [
  { k: 'analysis', label: '분석 · 이해', hue: 'blue', parts: ['overview', 'requirements', 'market', 'customer', 'user', 'competition', 'insight'] },
  { k: 'value', label: '과제 · 가치', hue: 'violet', parts: ['challenge', 'value', 'effect'] },
  { k: 'space', label: '공간 · 제품', hue: 'teal', parts: ['dss', 'products', 'bom', 'scenario', 'birdseye', 'spec'] },
  { k: 'proof', label: '솔루션 · 근거', hue: 'amber', parts: ['solution', 'case', 'why'] },
  { k: 'exec', label: '실행 · 비용', hue: 'green', parts: ['execution', 'cost'] },
  { k: 'frame', label: '표지 · 마무리', hue: 'slate', parts: ['cover', 'closing', 'appendix'] },
];
const GROUP_OF = {}; PART_GROUPS.forEach((g) => g.parts.forEach((p) => { GROUP_OF[p] = g.k; }));
const GROUP_OF_G = Object.fromEntries(PART_GROUPS.map((g) => [g.k, g]));
const PART_ORDER = PART_GROUPS.flatMap((g) => g.parts);


const IMG_OPTS = [['', '이미지 칸 전체'], ['ph', '사진 중심 (사진 30% 이상)'], ['0', '텍스트만 (이미지 없음)'], ['1', '이미지 1–3칸'], ['4', '이미지 4칸 이상']];
const REQ_KEYS = Object.keys(REQ_LABEL).filter((k) => LAYOUTS.some((l) => (l.req || []).includes(k)));
const DEFAULT = { q: '', grp: '', part: '', ind: '', sol: '', prod: '', img: '', req: '', deck: '', my: false, myTab: 'tpl' };
const FKEYS = ['grp', 'part', 'ind', 'sol', 'prod', 'img', 'req', 'deck'];
/** products filter — comma-joined ids (any of them) */
const prodIds = idList;
/** products that appear in any layout — the only ones worth filtering by */
const USED_PROD = [...new Set(LAYOUTS.flatMap((l) => l.prods || []))].filter((id) => P[id]);
const NO_FILTER = Object.fromEntries(FKEYS.map((k) => [k, '']));
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

function pass(l, f, skip) {
  if (skip !== 'part') { if (f.part && l.p !== f.part) return false; if (!f.part && f.grp && GROUP_OF[l.p] !== f.grp) return false; }
  if (skip !== 'deck' && f.deck && l.c !== f.deck) return false;
  if (skip !== 'prod' && f.prod) { const ids = prodIds(f.prod); if (ids.length && !(l.prods || []).some((id) => ids.includes(id))) return false; }
  if (skip !== 'ind' && f.ind) {
    if (f.ind === '_gen') { if (l.ind) return false; } else if (f.ind === '_ind') { if (!l.ind) return false; } else if (l.ind !== f.ind) return false;
  }
  if (skip !== 'sol' && f.sol) {
    if (f.sol === '_none') { if (l.sol) return false; } else if (l.sol !== f.sol && !(l.sols || []).includes(f.sol)) return false;
  }
  if (skip !== 'img' && f.img) {
    if (f.img === '0' && l.nI !== 0) return false;
    if (f.img === '1' && !(l.nI >= 1 && l.nI <= 3)) return false;
    if (f.img === '4' && l.nI < 4) return false;
    if (f.img === 'ph' && !isPhotoFirst(l)) return false;
  }
  if (skip !== 'req' && f.req && !(l.req || []).includes(f.req)) return false;
  return true;
}
const countBy = (list, key) => { const m = {}; for (const l of list) { const k = key(l); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };

/* ---------- small sidebar icon (2×2 slide grid) ---------- */
export function TemplateIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="8" height="6.5" rx="1.2" /><rect x="13" y="4" width="8" height="6.5" rx="1.2" /><rect x="3" y="13.5" width="8" height="6.5" rx="1.2" /><rect x="13" y="13.5" width="8" height="6.5" rx="1.2" />
    </svg>
  );
}

const MAX_EXPORT = 120;

/* =========================================================
   Page
   ========================================================= */
export function LayoutLibrary({ go }) {
  const [f, setF] = useState(() => fromSaved(loadUi().lib || {}));
  const [open, setOpen] = useState(null); // index into `flat`
  const [exp, setExp] = useState(false);
  const [fpop, setFpop] = useState(false);
  const [imp, setImp] = useState(null); // PPTX being imported into My
  const [edit, setEdit] = useState(null); // { f, ov } open in the editor
  const [favOpen, setFavOpen] = useState(null); // index into favShown
  const favAll = liveFavs(useFavs());
  const [fresh, setFresh] = useState(null); // just-saved My templates (highlighted once)
  const freshT = useRef(null);
  const myAll = useMy();
  const hc = usePickPeek();
  const gridRef = useRef(null);
  const gw = useWidth(gridRef, 1000);
  useEffect(() => { saveUi({ ...loadUi(), lib: f }); }, [f]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const reset = () => setF({ ...DEFAULT });

  const q = f.q.trim();
  const hits = useMemo(() => {
    if (!q || f.my) return null;
    const all = searchLayouts(q, {}, { limit: LAYOUTS.length });
    const top = all.length ? all[0].score : 0;
    const res = all.filter((r) => r.score >= top * 0.3); // keep the clearly relevant part of the ranking
    const lq = q.toLowerCase();
    const isQ = (l) => l.code.toLowerCase() === lq || l.f.toLowerCase() === lq || l.name.toLowerCase() === lq;
    const exact = LAYOUTS.filter(isQ);
    const m = new Map();
    for (const l of exact) m.set(l.f, { l, why: ['코드 · 이름 일치'], snip: '' });
    for (const l of ALL_LAYOUTS) if (l.retired && isQ(l) && L[l.retired]) m.set(l.retired, { l: L[l.retired], why: ['‘' + l.name + '’(' + l.code + ')을 대체한 사진 중심 버전'], snip: '' }); // 라이브러리에서 뺀 코드로 찾으면
    for (const r of res) if (!m.has(r.l.f)) m.set(r.l.f, r);
    return [...m.values()];
  }, [q, f.my]);
  // My: the person's own templates — searched by name · text · file
  const myBase = useMemo(() => {
    if (!q) return myAll;
    const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
    return myAll.filter((l) => { const t = (l.name + ' ' + (l.txt || '') + ' ' + (l.my.file || '') + ' ' + (PARTS[l.p] ? PARTS[l.p].label : '')).toLowerCase(); return ws.every((w) => t.includes(w)); });
  }, [q, f.my, myAll]);
  // My › 찜: favourites (값 있는 장 first, then 빈 레이아웃), searched by name · where it came from · text
  const favMode = f.my && f.myTab === 'fav';
  const favBase = useMemo(() => {
    const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (x) => { if (!ws.length) return true; const l = L[x.f]; const t = (x.name + ' ' + (x.from || '') + ' ' + (l ? (l.txt || '') + ' ' + (PARTS[l.p] ? PARTS[l.p].label : '') : '') + ' ' + JSON.stringify((x.ov && x.ov.t) || {})).toLowerCase(); return ws.every((w) => t.includes(w)); };
    return favOrder(favAll.filter(hit));
  }, [q, favAll]);
  const base = favMode ? favBase.map((x) => L[x.f]) : f.my ? myBase : hits ? hits.map((r) => r.l) : LAYOUTS;
  const hitOf = useMemo(() => (hits ? Object.fromEntries(hits.map((r) => [r.l.f, r])) : {}), [hits]);

  const favShown = favMode ? favBase.filter((x) => pass(L[x.f], f)) : [];
  const list = favMode ? favShown.map((x) => L[x.f]) : base.filter((l) => pass(l, f));

  // sections — part types under their 구분 (분석 · 이해 …); a search is one flat list
  const myG = f.my && !favMode ? myGroups(list) : null;
  let sections;
  if (favMode) sections = [];
  else if (f.my) sections = myG.map((g) => ({ key: g.key, items: g.items }));
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
  const scopeName = [f.my && (favMode ? 'My › 찜' : 'My'), q && '“' + q + '”', ...active.map((a) => a.short)].filter(Boolean).join(' · ');
  const toggleMy = () => { hc.hide(); setOpen(null); set({ my: !f.my }); const m = document.getElementById('tl-scroll'); if (m) m.scrollTop = 0; };
  const onSavedMy = (metas, msg) => {
    setImp(null); setEdit(null); setOpen(null);
    setFresh(new Set(metas.map((m) => m.f)));
    if (!f.my || f.myTab === 'fav') set({ my: true, myTab: 'tpl' });
    toast(msg);
    clearTimeout(freshT.current); freshT.current = setTimeout(() => setFresh(null), 2600);
  };

  const card = (l) => {
    const h = hitOf[l.f];
    const i = flat.indexOf(l);
    return (
      <button key={l.f + (l.my ? ':' + l.my.up : '')} className={'tl-card' + (fresh && fresh.has(l.f) ? ' my-fresh' : '')} data-f={l.f} onClick={() => { hc.hide(); setOpen(i); }} aria-label={l.name + ' 크게 보기'}
        onMouseEnter={(e) => hc.show(l, e.currentTarget, { snip: h && h.snip })} onMouseLeave={hc.hide} onFocus={(e) => hc.show(l, e.currentTarget, { snip: h && h.snip })} onBlur={hc.hide}>
        <div className="tl-thumb"><FitSlide f={l.f} lazy /><FavButton f={l.f} from={l.my ? 'My 템플릿' : 'PPT 레이아웃 템플릿'} /></div>
        <div className="tl-info">
          <div className="tl-name"><b>{l.name}</b></div>
          <p className="tl-when">{l.my ? srcLabel(l) : l.when || l.g}</p>
          {h && h.snip ? <p className="tl-snip">{h.snip}</p> : null}
          <div className="tl-tags">
            {(q || l.my) && PARTS[l.p] ? <span className={'tag pt ' + partHue(l.p)}>{PARTS[l.p].label}</span> : null}
            {l.my ? <span className="tag my-tag">{l.my.kind === 'pptx' ? 'PPTX' : '고친 레이아웃'}</span> : null}
            {l.ind && IND[l.ind] ? <span className="tag">{IND[l.ind].name}</span> : null}
            {l.sol && S[l.sol] ? <span className="tag tl-sol" title={S[l.sol].name + ' · ' + S[l.sol].cat}><Thumb r={'solution:' + l.sol} mini className="tl-sol-th" />{S[l.sol].name}</span> : null}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="tl" id="tl-scroll">
      <div className="tl-in">
        <header className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">WINMATE · 템플릿 라이브러리</span>
            <h1>PPT 레이아웃 템플릿</h1>
          </div>
        </header>

        <div className="tl-tools tl-tools-f">
          <div className="tl-row">
            <form className="tl-search" role="search" onSubmit={(e) => e.preventDefault()}>
              <Icon name="search" size={19} />
              <label className="sr" htmlFor="tl-q">레이아웃 검색</label>
              <input id="tl-q" className="input" value={f.q} placeholder={f.my ? '내 템플릿을 이름 · 글자 · 파일 이름으로 찾기' : '찾는 장면을 적어 보세요 · 예) 경쟁사와 비교하는 표, 매장 하루 동선'} onChange={(e) => set({ q: e.target.value })} />
              {f.q && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="검색어 지우기" onClick={() => set({ q: '' })}><Icon name="x" size={14} /></button>}
            </form>
          </div>
          <FilterBar active={active} onOpen={() => { hc.hide(); setFpop(true); }} onRemove={(a) => set(a.clear)} onClearAll={() => set(NO_FILTER)}
            extra={<MyToggle on={f.my} n={myAll.length + favAll.length} onClick={toggleMy} />} />
        </div>

        <div className="tl-sum">
          <span><b className="num">{list.length}</b>장{scopeName ? <span className="muted"> · {scopeName}</span> : null}{q && !f.my ? <span className="faint"> · 관련도순</span> : null}</span>
          <span className="sp" />
          {list.length > MAX_EXPORT && <span className="faint tl-cap">{MAX_EXPORT}장 이하로 좁히면 한 파일로 받을 수 있어요</span>}
          <button className="btn btn-sm" disabled={!list.length || list.length > MAX_EXPORT} onClick={() => setExp(true)}>
            <Icon name="download" size={14} />이 목록 PPTX로 받기
          </button>
        </div>
        {f.my && (
          <div className="seg my-tabs" role="group" aria-label="My 보기">
            <button aria-pressed={!favMode} onClick={() => { hc.hide(); set({ myTab: 'tpl' }); }}><span>내 템플릿</span><span className="num">{myAll.length}</span></button>
            <button aria-pressed={favMode} onClick={() => { hc.hide(); set({ myTab: 'fav' }); }}><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z" fill="currentColor" /></svg><span>찜</span><span className="num">{favAll.length}</span></button>
          </div>
        )}
        {favMode && !favAll.length && (
          <div className="tl-empty my-fav-empty"><b>아직 찜한 레이아웃이 없어요</b><span>레이아웃 카드 · 상세, Best Scenario 장표, 제안서의 장 어디서든 ♡를 누르면 여기에 모여요. 값이 채워진 장은 그 값 그대로, 빈 레이아웃은 따로 모아요.</span></div>
        )}
        {favMode && !list.length && favAll.length > 0 && (
          <div className="tl-empty"><b>조건에 맞는 찜이 없어요</b><span>검색어나 필터를 풀어 보세요.</span><button className="btn btn-sm" onClick={() => set({ ...NO_FILTER, q: '' })}>검색 · 필터 지우기</button></div>
        )}
        {f.my && !favMode && <MyUpload empty={!myAll.length} onFile={(file) => { hc.hide(); setImp(file); }} onBrowse={toggleMy} />}
        {f.my && !favMode && !list.length && myAll.length > 0 && (
          <div className="tl-empty"><b>조건에 맞는 My 템플릿이 없어요</b><span>검색어나 필터를 풀어 보세요.</span><button className="btn btn-sm" onClick={() => set({ ...NO_FILTER, q: '' })}>검색 · 필터 지우기</button></div>
        )}
        {q && !list.length && !f.my && (
          <div className="tl-empty">
            <b>“{q}”와 맞는 레이아웃이 없어요</b>
            <span>다른 표현으로 적거나 필터를 풀어 보세요.</span>
            <div className="chips" style={{ justifyContent: 'center' }}>{QUICK.map((t) => <button key={t} className="qchip" onClick={() => set({ q: t })}>{t}</button>)}</div>
          </div>
        )}
        {!q && !list.length && !f.my && (
          <div className="tl-empty"><b>조건에 맞는 레이아웃이 없어요</b><span>필터를 하나씩 풀어 보세요.</span><button className="btn btn-sm" onClick={() => set(NO_FILTER)}>필터 모두 지우기</button></div>
        )}

        {favMode ? <div ref={gridRef}><FavSections favs={favShown} cols={cols} hc={hc} onOpen={setFavOpen} /></div> : f.my ? <div ref={gridRef}><MySections groups={myG} cols={cols} card={card} onDeleteGroup={async (g) => { await deleteTemplates(g.items.map((l) => l.f)); toast(g.file + '에서 가져온 ' + g.items.length + '장을 지웠어요'); }} /></div> : (
        <div ref={gridRef} className="tl-sections">
          {shownGroups.map((g) => (
            <section key={g.key} className={'tl-grp' + (g.hue ? ' h-' + g.hue : '')} aria-label={g.label || '검색 결과'}>
              {!g.flat && (
                <div className="tl-grp-h">
                  <i className="dot" /><h2>{g.label}</h2><span className="num">{g.sections.reduce((n, x) => n + x.items.length, 0)}</span>
                  {g.desc ? <p>{g.desc}</p> : null}
                </div>
              )}
              <div className={'tl-grp-in' + (g.flat ? ' flat' : '')}>
                {g.sections.map((s) => {
                  const pt = s.part ? PARTS[s.part] : null;
                  return (
                    <section key={s.key} className="tl-sec" aria-label={pt ? pt.label : s.title || '검색 결과'}>
                      {s.key !== '_hits' && (
                        <div className="tl-sec-h">
                          {pt ? <span className={'tl-ic ' + partHue(s.part)}><Icon name={pt.icon} size={15} /></span> : null}
                          <div className="tl-sec-t">
                            <h3>{pt ? pt.label : s.title} <span className="num">{s.items.length}</span></h3>
                            {(pt ? pt.desc : s.sub) ? <p>{pt ? pt.desc : s.sub}</p> : null}
                          </div>
                        </div>
                      )}
                      {q && <div className="tl-hint"><Icon name="info" size={13} />레이아웃 이름 · 용도 · 예시 문구 · 업종 · 솔루션에서 찾았어요. 필터로 더 좁힐 수 있어요.</div>}
                      <div className="tl-grid" style={{ gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))' }}>{s.items.map(card)}</div>
                    </section>
                  );
                })}
              </div>
            </section>
          ))}
        </div>)}
      </div>
      {hc.node}
      {open != null && flat[open] && !favMode && (f.my
        ? <MyDetail list={flat} index={open} onNav={setOpen} onClose={() => setOpen(null)} onEdit={(l) => setEdit({ f: l.f })} />
        : <TemplateDetail list={flat} index={open} onNav={setOpen} onClose={() => setOpen(null)} onEdit={(l) => setEdit({ f: l.f })} />)}
      {favMode && favOpen != null && favShown[favOpen] && <TemplateDetail list={favShown.map((x) => L[x.f])} ovs={favShown.map((x) => x.ov)} index={favOpen} onNav={setFavOpen} onClose={() => setFavOpen(null)}
        notes={favShown.map((x) => (x.filled ? '값이 채워진 장' : '빈 레이아웃') + (x.from ? ' · ' + x.from : ''))} noteLabel="찜" favFrom={(favShown[favOpen] || {}).from}
        onEdit={() => { const x = favShown[favOpen]; setFavOpen(null); setEdit({ f: x.f, ov: x.ov }); }} />}
      {imp && <ImportDialog file={imp} onClose={() => setImp(null)} onSaved={(metas) => onSavedMy(metas, metas.length + '장을 My 템플릿으로 저장했어요')} />}
      {edit && <LayoutEditor f={edit.f} ov={edit.ov || null} onClose={() => setEdit(null)} onSaved={(m, kept) => onSavedMy([m], kept ? '‘' + m.name + '’을 고쳐 저장했어요' : '‘' + m.name + '’을 My 템플릿으로 저장했어요')} />}
      {fpop && <FilterPopup f={f} base={base} onApply={(x) => { set(x); setFpop(false); }} onClose={() => setFpop(false)} />}
      {exp && <ExportList list={list} slides={favMode ? favShown.map((x) => ({ f: x.f, ov: x.ov || { t: {}, img: {} }, part: L[x.f] && PARTS[L[x.f].p] ? PARTS[L[x.f].p].label : '' })) : null} scope={scopeName} onClose={() => setExp(false)} />}
    </div>
  );
}

/* =========================================================
   Filters — what's on (chips under the search) and the popup
   ========================================================= */
const IMG_LABEL = Object.fromEntries(IMG_OPTS);
/** active filters as chips: { k, head, value, short, label, clear } */
function activeFilters(f) {
  const out = [];
  const add = (k, head, value, clear) => out.push({ k, head, value, short: value, label: head + ' ' + value, clear });
  if (f.part && PARTS[f.part]) add('part', '파트', PARTS[f.part].label, { part: '', grp: '' });
  else if (f.grp && GROUP_OF_G[f.grp]) add('grp', '파트', GROUP_OF_G[f.grp].label + ' 전체', { grp: '' });
  if (f.ind) add('ind', '업종', f.ind === '_gen' ? '범용' : f.ind === '_ind' ? '업종 맞춤 전체' : (IND[f.ind] ? IND[f.ind].name : f.ind), { ind: '' });
  if (f.sol) add('sol', '솔루션', f.sol === '_none' ? '솔루션 전용 제외' : (S[f.sol] ? S[f.sol].name : f.sol), { sol: '' });
  if (f.prod) { const ids = prodIds(f.prod); if (ids.length) add('prod', '제품', P[ids[0]].model + (ids.length > 1 ? ' 외 ' + (ids.length - 1) : ''), { prod: '' }); }
  if (f.img) add('img', '이미지', IMG_LABEL[f.img] || f.img, { img: '' });
  if (f.req) add('req', '필요한 정보', REQ_LABEL[f.req] || f.req, { req: '' });
  if (f.deck) add('deck', '원본 장표', DECK[f.deck] ? DECK[f.deck].label : f.deck, { deck: '' });
  return out;
}

/** One popup, read top to bottom: 파트 유형 → 업종 → 솔루션 → 제품 → 이미지 칸 → 필요한 정보 → 원본 장표.
 *  Every choice shows how many layouts stay with the other choices kept; nothing applies until "N장 보기". */
function FilterPopup({ f, base, onApply, onClose }) {
  const [d, setD] = useState(() => ({ ...NO_FILTER, ...Object.fromEntries(FKEYS.map((k) => [k, f[k]])) }));
  const put = (patch) => setD((x) => ({ ...x, ...patch }));
  const n = base.filter((l) => pass(l, d)).length;
  const pool = (skip) => base.filter((l) => pass(l, d, skip));
  const partPool = pool('part');
  const partN = countBy(partPool, (l) => l.p);
  const grpN = countBy(partPool, (l) => GROUP_OF[l.p]);
  const indPool = pool('ind');
  const indN = countBy(indPool, (l) => l.ind || '_gen');
  const indAll = indPool.filter((l) => l.ind).length;
  const solPool = pool('sol');
  const solN = {}; for (const l of solPool) { new Set([l.sol, ...(l.sols || [])].filter(Boolean)).forEach((id) => { solN[id] = (solN[id] || 0) + 1; }); if (!l.sol) solN._none = (solN._none || 0) + 1; }
  const imgPool = pool('img');
  const imgN = { ph: imgPool.filter(isPhotoFirst).length, 0: imgPool.filter((l) => l.nI === 0).length, 1: imgPool.filter((l) => l.nI >= 1 && l.nI <= 3).length, 4: imgPool.filter((l) => l.nI >= 4).length };
  const reqN = {}; for (const l of pool('req')) for (const r of l.req || []) reqN[r] = (reqN[r] || 0) + 1;
  const deckN = countBy(pool('deck'), (l) => l.c);
  const prodN = {}; for (const l of pool('prod')) for (const id of new Set(l.prods || [])) prodN[id] = (prodN[id] || 0) + 1;
  const on = activeFilters(d).length;

  // one chip: selected = pressed; pressing it again goes back to 전체
  const chip = (key, val, label, cnt, extra = {}) => {
    const sel = d[key] === val;
    return <FChip key={key + ':' + val} on={sel} n={cnt} cls={extra.cls} pre={extra.pre} onClick={() => put(sel ? { [key]: '' } : { [key]: val, ...(extra.also || {}) })}>{label}</FChip>;
  };
  const all = (key, cnt, also = {}) => <FAll on={!d[key] && Object.keys(also).every((k) => !d[k])} n={cnt} onClick={() => put({ [key]: '', ...also })} />;
  const solCats = [...new Set(SOLUTIONS.filter((x) => solN[x.id] || d.sol === x.id).map((x) => x.cat))];

  return (
    <FilterFrame unit={LAYOUT_UNIT} n={n} canReset={on} onReset={() => setD({ ...NO_FILTER })} onApply={() => onApply(d)} onClose={onClose}>
      <FStep no={1} title="파트 유형" hint="구분 이름을 누르면 그 구분 전체">
        <div className="tlf-parts">
          <div className="tlf-prow">{all('part', partPool.length, { grp: '' })}</div>
          {PART_GROUPS.map((g) => (
            <div key={g.k} className={'tlf-prow h-' + g.hue}>
              <button className="tlf-grp" aria-pressed={!d.part && d.grp === g.k} disabled={!grpN[g.k] && d.grp !== g.k}
                onClick={() => put(!d.part && d.grp === g.k ? { grp: '' } : { grp: g.k, part: '' })}>
                <i className="dot" />{g.label}<span className="num">{grpN[g.k] || 0}</span>
              </button>
              <div className="tlf-chips">
                {g.parts.filter((p) => PARTS[p]).map((p) => chip('part', p, PARTS[p].label, partN[p], { also: { grp: '' } }))}
              </div>
            </div>
          ))}
        </div>
      </FStep>
      <FStep no={2} title="업종">
        <div className="tlf-chips">
          {all('ind', indPool.length)}
          {chip('ind', '_gen', '범용', indN._gen)}
          {chip('ind', '_ind', '업종 맞춤 전체', indAll)}
        </div>
        <div className="tlf-chips">{INDUSTRIES.map((i) => chip('ind', i.code, i.name, indN[i.code]))}</div>
      </FStep>
      <FStep no={3} title="솔루션" hint="그 솔루션이 들어간 레이아웃">
        <div className="tlf-chips">
          {all('sol', solPool.length)}
          {chip('sol', '_none', '솔루션 전용 제외', solN._none)}
        </div>
        {solCats.map((c) => (
          <div key={c} className="tlf-sub"><span className="tlf-cat">{c}</span>
            <div className="tlf-chips">{SOLUTIONS.filter((x) => x.cat === c && (solN[x.id] || d.sol === x.id)).map((x) => chip('sol', x.id, x.name, solN[x.id], { pre: <Thumb r={'solution:' + x.id} mini className="tlf-th" /> }))}</div>
          </div>
        ))}
      </FStep>
      <FStep no={4} title="제품" hint="고른 제품 중 하나라도 들어간 레이아웃">
        <FProducts ids={prodIds(d.prod)} counts={prodN} used={USED_PROD} unit={LAYOUT_UNIT} onChange={(ids) => put({ prod: ids.join(',') })} />
      </FStep>
      <FStep no={5} title="이미지 칸">
        <div className="tlf-chips">
          {all('img', imgPool.length)}
          {IMG_OPTS.filter(([k]) => k).map(([k, t]) => chip('img', k, t, imgN[k]))}
        </div>
      </FStep>
      <FStep no={6} title="필요한 정보" hint="이 정보가 있어야 채울 수 있는 레이아웃">
        <div className="tlf-chips">
          {all('req', pool('req').length)}
          {REQ_KEYS.map((k) => chip('req', k, REQ_LABEL[k], reqN[k]))}
        </div>
      </FStep>
      <FStep no={7} title="원본 장표">
        <div className="tlf-chips">
          {all('deck', pool('deck').length)}
          {DECKS.map((x) => chip('deck', x.k, x.label, deckN[x.k]))}
        </div>
      </FStep>
    </FilterFrame>
  );
}

/* =========================================================
   Export the filtered list as one PPTX
   ========================================================= */
function ExportList({ list, slides = null, scope, onClose }) {
  const [name, setName] = useState(safeName('Winmate 레이아웃 템플릿' + (scope ? ' · ' + scope.replace(/[“”]/g, '') : '')));
  const [st, setSt] = useState(null); // {n,total} | {err}
  const busy = st && st.total != null;
  const run = async () => {
    setSt({ n: 0, total: list.length });
    try {
      const blob = await exportPptx(slides || slidesOf(list), { title: name, onProgress: (n, total) => setSt({ n, total }) });
      const r = await saveBlob(blob, safeName(name) + '.pptx');
      if (r.ok) { toast(safeName(name) + '.pptx 저장했어요'); onClose(); } else setSt({ err: r.err });
    } catch (e) { console.error(e); setSt({ err: '만드는 중 문제가 생겼어요: ' + (e && e.message ? e.message : e) }); }
  };
  return (
    <Modal size="narrow" onClose={busy ? () => {} : onClose} title="이 목록 PPTX로 받기" sub="지금 보이는 레이아웃을 예시 문구 그대로 한 파일에 담아요. 글자는 텍스트 상자로 들어가 바로 고칠 수 있어요."
      footer={<>
        <span className="note num">{list.length}장 · 16:9</span>
        <span className="sp" />
        <button className="btn" disabled={busy} onClick={onClose}>닫기</button>
        <button className="btn btn-primary" disabled={busy || !list.length} onClick={run}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX 만들기'}</button>
      </>}>
      <div className="field"><label htmlFor="tl-ex-name">파일 이름</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: "var(--space-6px)" }}><input id="tl-ex-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /><span className="faint num">.pptx</span></div>
      </div>
      {busy && (
        <div className="field" aria-live="polite">
          <div className="progress"><i style={{ width: Math.round((st.n / Math.max(1, st.total)) * 100) + '%' }} /></div>
          <span className="faint num" style={{ fontSize: "var(--text-12px)" }}>{st.n} / {st.total}장 변환</span>
        </div>
      )}
      {st && st.err && <div className="hint" style={{ color: 'var(--warn)' }}><Icon name="alert" size={14} />{st.err}</div>}
    </Modal>
  );
}
