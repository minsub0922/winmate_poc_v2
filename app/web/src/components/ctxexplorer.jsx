// Full-list explorer for 제품 · 솔루션 · 유관사례. Opened from the 제품 · 솔루션 매칭 popup (ctxconfirm.jsx) — there it is drawn in that
// same bubble popup (frame) with a ← back to 매칭 — and from the layout detail (product swap) as a modal.
// Directory-explorer layout (web-app home common component): search → breadcrumb → folder tree | item list → selection tray.
// The '추천' folder shows the recommendations as a grid of large image cards; other folders show rows.
// Click an item to select it, then '연결' links every selected item at once.
// filter mode (PPT 레이아웃 템플릿 · Best Scenario 필터, filterpop.jsx): no proposal — pick products to filter by; each row shows how many
// layouts (or scenarios — filter.noun / filter.unit) it is in.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Icon, Modal, toast } from './common.jsx';
import { PRODUCTS, SOLUTIONS, CASES, INDUSTRIES, IND, P, PRODUCT_DB } from '../services/catalog.js';
import { useDetailPeek } from './peek.jsx';
import { recommendContext } from '../services/search.js';
import { Thumb } from './Thumbs.jsx';
import { addRef } from './requirements.jsx';

const TYPE = { products: 'product', solutions: 'solution', cases: 'case' };
const LABEL = { products: '제품', solutions: '솔루션', cases: '유관사례' };
// folder families → categories (anything new in the catalog lands in '기타')
// 제품은 제품 DB가 정한 제품군(fam) › 사이트 분류(sc) — 순서도 제품 DB(famOrder · catOrder, samsung.com/business 목록 순서)
const FAM = {
  products: PRODUCT_DB.famOrder.map((f) => [f, PRODUCT_DB.catOrder]),
  solutions: [
    ['사이니지 · 객실 TV', ['사이니지 CMS (설치형)', '사이니지 CMS (클라우드)', '호텔 객실 TV 플랫폼']],
    ['IoT · 공조 · 에너지', ['다지점 IoT · 에너지', 'IoT 플랫폼', '빌딩 관리 (공조 중심)', '개별 + 중앙 공조', '시스템에어컨 제어', '냉장 · 냉동 + 공조 통합']],
    ['모바일 · 보안', ['모바일 기기 관리 · 보안', '바코드 스캔', '모바일 PC 환경']],
    ['서비스 · 파트너', ['서비스', '파트너 솔루션']],
  ],
};
const ETC = '기타';
export const REC_MAX = 40;
const indShort = (code) => (IND[code] ? IND[code].name.split(' · ')[0] : '');
const more = (arr, n) => { const a = (arr || []).filter(Boolean); return a.length > n ? a.slice(0, n).join(' · ') + ' +' + (a.length - n) : a.join(' · '); };
const ym = (d) => (d ? d.slice(0, 7).replace('-', '.') : '');

// ---------- items (static catalog → normalised once) ----------
const famOf = (kind, cat) => { const f = (FAM[kind] || []).find(([, cats]) => cats.includes(cat)); return f ? f[0] : ETC; };
const catRank = (kind, cat) => { if (kind === 'products') { const i = PRODUCT_DB.catOrder.indexOf(cat); return i < 0 ? 999 : i; } for (const [, cats] of FAM[kind] || []) { const i = cats.indexOf(cat); if (i >= 0) return i; } return 99; };
const srcRank = (x) => (x.cur ? 0 : x.src === 'catalog' ? 2 : 1); // 큐레이션 → 사이트 → 카탈로그 전용
const CACHE = {};
function itemsOf(kind) {
  if (CACHE[kind]) return CACHE[kind];
  let list;
  if (kind === 'products') {
    list = PRODUCTS.map((x) => ({ kind, ref: 'product:' + x.id, id: x.id, name: x.name, code: x.model, f: x.fam || ETC, c: x.sc || x.cat, ind: x.ind, x,
      hay: [x.name, x.model, x.cat, x.sc, x.spec, x.opt, ...x.kw, ...x.spaces, ...(x.models || [])].join(' ').toLowerCase() }));
    list.sort((a, b) => catRank(kind, a.c) - catRank(kind, b.c) || srcRank(a.x) - srcRank(b.x));
  } else if (kind === 'solutions') {
    list = SOLUTIONS.map((x) => ({ kind, ref: 'solution:' + x.id, id: x.id, name: x.name, code: x.cat, f: famOf(kind, x.cat), c: x.cat, ind: x.ind, x,
      hay: [x.name, x.cat, x.desc, ...x.kw].join(' ').toLowerCase() }));
  } else {
    list = [...CASES].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map((x) => ({ kind, ref: 'case:' + x.id, id: String(x.id), name: x.cust, code: x.sub || x.title,
      f: x.ind && IND[x.ind] ? x.ind : '_', c: (x.prod || [])[0] || ETC, ind: x.ind ? [x.ind] : [], x,
      hay: [x.cust, x.title, x.sub, x.indRaw, x.ind && IND[x.ind] ? IND[x.ind].name : '', ...(x.prod || []), ...(x.offer || []), ...(x.space || []), ...(x.needs || [])].join(' ').toLowerCase() }));
  }
  CACHE[kind] = list;
  return list;
}
const famLabel = (kind, f) => (kind === 'cases' ? (f === '_' ? '업종 미분류' : IND[f] ? IND[f].name : f) : f);
function famOrder(kind) { return kind === 'cases' ? [...INDUSTRIES.map((i) => i.code), '_'] : [...(FAM[kind] || []).map(([f]) => f), ETC]; }

/** folder tree: root 'all' → families 'f:<fam>' → categories 'c:<fam>/<cat>' */
function buildTree(kind, items) {
  const fams = new Map();
  for (const it of items) {
    if (!fams.has(it.f)) fams.set(it.f, new Map());
    const cats = fams.get(it.f);
    if (!cats.has(it.c)) cats.set(it.c, []);
    cats.get(it.c).push(it);
  }
  const order = famOrder(kind);
  const rank = (f) => { const i = order.indexOf(f); return i < 0 ? 98 : i; };
  return [...fams.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([f, cats]) => {
    const cs = [...cats.entries()].sort((a, b) => (kind === 'cases' ? b[1].length - a[1].length : catRank(kind, a[0]) - catRank(kind, b[0])));
    return { key: 'f:' + f, f, label: famLabel(kind, f), count: cs.reduce((n, [, l]) => n + l.length, 0),
      cats: cs.map(([c, l]) => ({ key: 'c:' + f + '/' + c, f, c, label: c, count: l.length, items: l })) };
  });
}

const Folder = ({ open }) => (
  <svg className="ex-fold" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d={open ? 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3 19z M3 19l2.6-7.6A2 2 0 0 1 7.5 10H21l-2.6 7.6A2 2 0 0 1 16.5 19z' : 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'} /></svg>
);

// ---------- one item ----------
function StateTag({ st, n, fu }) {
  const u = fu ? fu.unit : '장';
  if (st === 'fsel') return <span className="ex-st sel"><Icon name="check" size={12} stroke={2.8} />선택 · <span className="num">{n}</span>{u}</span>;
  if (st === 'fpick') return <span className="ex-st add"><span className="num">{n}</span>{u}</span>;
  if (st === 'fnone') return <span className="ex-st none">0{u}</span>;
  if (st === 'cur') return <span className="ex-st linked"><Icon name="check" size={12} stroke={2.8} />지금 제품</span>;
  if (st === 'swap') return <span className="ex-st add"><Icon name="swap" size={12} stroke={2.4} />바꾸기</span>;
  if (st === 'linked') return <span className="ex-st linked"><Icon name="check" size={12} stroke={2.8} />연결됨</span>;
  if (st === 'sel') return <span className="ex-st sel"><Icon name="check" size={12} stroke={2.8} />선택</span>;
  return <span className="ex-st add"><Icon name="plus" size={12} stroke={2.8} />추가</span>;
}
function Row({ it, st, n, fu, onToggle, ind, peek }) {
  const x = it.x;
  const dis = st === 'linked' || st === 'cur' || st === 'fnone';
  const on = st === 'sel' || st === 'fsel';
  const common = { type: 'button', className: 'ex-row ' + it.kind + (on ? ' on' : '') + (dis ? ' dis' : ''), onClick: dis ? undefined : () => onToggle(it.ref), 'aria-pressed': on, 'aria-disabled': dis || undefined,
    title: dis ? (st === 'cur' ? '지금 쓰고 있는 제품이에요' : st === 'fnone' ? '지금 고른 조건에서는 이 제품이 든 ' + (fu ? fu.noun : '레이아웃') + (fu && fu.noun === '시나리오' ? '가' : '이') + ' 없어요' : '이미 연결된 항목이에요') : undefined };
  const fit = ind && it.ind.includes(ind);
  if (it.kind === 'products') {
    const hov = peek ? { onMouseEnter: (e) => peek.show(it.ref, e.currentTarget), onMouseLeave: peek.hide, onFocus: (e) => { if (e.currentTarget.matches(':focus-visible')) peek.show(it.ref, e.currentTarget, true); }, onBlur: peek.hide, onMouseDown: () => peek.hide() } : {};
    return (
      <button {...common} {...hov} aria-label={it.name + (n != null && fu ? ' · ' + fu.noun + ' ' + n + fu.unit : '') + (dis ? (st === 'fnone' ? '' : ' · 연결됨') : on ? ' · 선택됨' : ' · 고르기')}>
        <Thumb r={it.ref} />
        <span className="ex-nm"><b title={it.name}>{x.src === 'catalog' && <span className="ex-src" title={'e-카탈로그에만 나오는 제품 · samsung.com/business 목록에는 없음'}>카탈로그</span>}{it.name}</b><span className="num" title={(x.models || []).join(', ')}>{x.model}{x.nm > 1 ? ' 외 ' + (x.nm - 1) : ''} · {x.opt || x.cat || x.sc}</span></span>
        <span className="ex-c num">{x.spec}</span>
        <span className="ex-c">{more(x.spaces, 3)}</span>
        <span className="ex-c">{fit ? <span className="ex-fit">{indShort(ind)} 맞춤</span> : more(x.ind.map(indShort), 2)}</span>
        <StateTag st={st} n={n} fu={fu} />
      </button>
    );
  }
  if (it.kind === 'solutions') {
    const prods = (x.with || []).map((id) => P[id] && P[id].model).filter(Boolean);
    return (
      <button {...common} aria-label={it.name + (dis ? ' · 연결됨' : st === 'sel' ? ' · 선택됨' : ' · 고르기')}>
        <Thumb r={it.ref} />
        <span className="ex-nm"><b>{it.name}</b><span>{x.desc}</span></span>
        <span className="ex-c"><span className="ex-k">분류</span>{x.cat}</span>
        <span className="ex-c num"><span className="ex-k">함께 쓰는 제품</span>{more(prods, 3) || '—'}</span>
        <StateTag st={st} />
      </button>
    );
  }
  const res = (x.proof || [])[0] || (x.needs || [])[0] || '';
  return (
    <div className={common.className + ' ex-case'}>
      <button type="button" className="ex-hit" onClick={common.onClick} aria-pressed={common['aria-pressed']} aria-disabled={common['aria-disabled']} title={common.title} aria-label={x.cust + (dis ? ' · 연결됨' : st === 'sel' ? ' · 선택됨' : ' · 고르기')} />
      <Thumb r={it.ref} />
      <span className="ex-nm">
        <span className="ex-ch"><span className="ex-tag">{x.ind && IND[x.ind] ? indShort(x.ind) : x.indRaw || '사례'}</span><b>{x.cust}</b><span className="num faint">{ym(x.date)}</span></span>
        <span className="ex-ttl">{x.sub || x.title}</span>
        {res && <span className="ex-res">{res}</span>}
        <span className="ex-chips">{[...(x.space || []).slice(0, 2), ...(x.offer || []).slice(0, 1)].map((s, i) => <span key={i}>{s}</span>)}</span>
      </span>
      <span className="ex-side">
        <StateTag st={st} />
        {x.url && <a className="ex-link" href={x.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>원문<Icon name="ext" size={11} /></a>}
      </span>
    </div>
  );
}
function RecTile({ rec, it, st, n, fu, onToggle }) {
  const dis = st === 'linked' || st === 'cur' || st === 'fnone';
  const x = it && it.x;
  const meta = !x ? '' : it.kind === 'products' ? x.spec : it.kind === 'solutions' ? x.desc : [x.ind && IND[x.ind] ? indShort(x.ind) : x.indRaw, ym(x.date)].filter(Boolean).join(' · ');
  return (
    <button type="button" className={'ex-tile ' + (it ? it.kind : '') + (st === 'sel' || st === 'fsel' ? ' on' : '') + (dis ? ' dis' : '')} onClick={dis ? undefined : () => onToggle(rec.ref)} aria-pressed={st === 'sel' || st === 'fsel'} aria-disabled={dis || undefined}
      aria-label={rec.label + ' · ' + rec.why + (dis ? (st === 'fnone' ? '' : ' · 연결됨') : st === 'sel' || st === 'fsel' ? ' · 선택됨' : ' · 고르기')}>
      <span className="ex-tm"><Thumb r={rec.ref} /><StateTag st={st} n={n} fu={fu} /></span>
      <span className="ex-tb">
        <b title={rec.label}>{rec.label}</b>
        <span className="ex-tsub">{rec.sub}</span>
        {meta && <span className="ex-tmeta">{meta}</span>}
        <span className="ex-why"><Icon name="sparkle" size={11} />{rec.why}</span>
      </span>
    </button>
  );
}

const HEAD = {
  products: ['', '모델', '사양', '주요 공간', '업종', ''],
  solutions: ['', '솔루션', '분류', '연동', ''],
};

/** kind: 'products' | 'solutions' | 'cases' · start: 'rec' | 'all' | a folder key
 *  pick: { current: 'product:qm55c', onPick(ref) } — pick one item to replace `current` (layout detail) instead of linking many
 *  filter: { selected: [ref], counts: { ref: n }, only: [ref], onApply([ref]), noun?, unit? } — no proposal: choose items to filter layouts by
 *    (only = items that appear in any layout; counts = layouts left per item with the other filters kept;
 *     noun · unit = what is counted — '레이아웃' · '장' by default, Best Scenario passes '시나리오' · '개') */
export function ContextExplorer({ p, kind, start = 'all', ind, onClose, pick = null, filter = null, frame = null, closeLabel = '닫기' }) {
  const t = TYPE[kind], label = LABEL[kind];
  const [q, setQ] = useState('');
  const [fit, setFit] = useState(false);
  const [cur, setCur] = useState(start);
  const [open, setOpen] = useState(() => new Set(String(start).startsWith('f:') ? [start] : []));
  const [sel, setSel] = useState(() => new Set(filter ? filter.selected || [] : []));
  const listRef = useRef(null);
  const peek = useDetailPeek(p, { delay: 420 });
  const linked = new Set(p ? p.ctx[kind].map((id) => t + ':' + id) : []);
  const catalog = itemsOf(kind);
  const all = useMemo(() => (filter ? catalog.filter((it) => filter.only.includes(it.ref)) : catalog), [catalog, filter && filter.only.join()]);
  const byRef = useMemo(() => new Map(catalog.map((it) => [it.ref, it])), [catalog]);
  const pool = fit && ind ? all.filter((it) => it.ind.includes(ind)) : all;
  const tree = useMemo(() => buildTree(kind, pool), [kind, pool.length, fit]);
  const cnt = (r) => (filter ? filter.counts[r] || 0 : undefined);
  const fu = filter ? { noun: filter.noun || '레이아웃', unit: filter.unit || '장' } : null;
  // filter mode: '많이 쓰인 제품' — the items the most layouts carry (with the other filters kept)
  const recs = useMemo(() => (filter
    ? all.filter((it) => cnt(it.ref) || sel.has(it.ref)).sort((a, b) => cnt(b.ref) - cnt(a.ref)).slice(0, 12)
      .map((it) => ({ ref: it.ref, label: it.name, sub: it.code + ' · ' + it.c, why: fu.noun + ' ' + cnt(it.ref) + fu.unit + '에 나와요' }))
    : recommendContext(p, ind, kind, REC_MAX)), [p, ind, kind, all]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [cur, q, fit]);

  const toggle = (r) => setSel((s) => { if (pick) return s.has(r) ? new Set() : new Set([r]); const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  const stOf = (r) => (filter ? (sel.has(r) ? 'fsel' : cnt(r) ? 'fpick' : 'fnone')
    : pick ? (r === pick.current ? 'cur' : sel.has(r) ? 'sel' : 'swap') : linked.has(r) ? 'linked' : sel.has(r) ? 'sel' : 'add');
  const go = (key) => {
    setQ('');
    if (key.startsWith('f:')) setOpen((o) => { const n = new Set(o); if (cur === key && n.has(key)) n.delete(key); else n.add(key); return n; });
    if (key.startsWith('c:')) { const f = 'f:' + key.slice(2).split('/')[0]; setOpen((o) => new Set(o).add(f)); }
    setCur(key);
  };

  // what the right pane shows
  const query = q.trim().toLowerCase();
  let crumbs = [], sections = [], mode = 'rows';
  if (query) {
    const words = query.split(/\s+/);
    const hit = pool.filter((it) => words.every((w) => it.hay.includes(w)));
    crumbs = [{ label: '검색 · “' + q.trim() + '”' }];
    sections = [{ items: hit }];
  } else if (cur === 'rec') {
    mode = 'rec';
    crumbs = [{ label: filter ? '많이 쓰인 ' + label : '추천 ' + label }];
  } else {
    crumbs = [{ key: 'all', label: '전체' }];
    const fam = cur.startsWith('f:') || cur.startsWith('c:') ? tree.find((fm) => fm.f === cur.slice(2).split('/')[0]) : null;
    if (cur === 'all' || !fam) {
      sections = tree.map((fm) => ({ label: fm.label, key: fm.key, items: fm.cats.flatMap((c) => c.items) }));
    } else {
      crumbs.push({ key: fam.key, label: fam.label });
      const cat = cur.startsWith('c:') ? fam.cats.find((c) => c.key === cur) : null;
      if (cat) { crumbs.push({ label: cat.label }); sections = [{ items: cat.items }]; }
      else sections = fam.cats.map((c) => ({ label: c.label, key: c.key, items: c.items }));
    }
  }
  const shown = mode === 'rec' ? recs.length : sections.reduce((n, s) => n + s.items.length, 0);
  const commit = () => {
    if (filter) { filter.onApply([...sel]); onClose(); return; }
    if (pick) { const r = [...sel][0]; if (r) pick.onPick(r); onClose(); return; }
    const refs = [...sel].filter((r) => !linked.has(r));
    refs.forEach((r) => addRef(p.id, r));
    toast(refs.length === 1 ? (byRef.get(refs[0]) || {}).name + ' 연결했어요' : label + ' ' + refs.length + '개를 연결했어요');
    onClose();
  };
  const selList = [...sel];

  const navBtn = (key, depth, lab, count, opts = {}) => (
    <button key={key} type="button" className={'ex-nd' + (cur === key && !query ? ' on' : '') + (opts.rec ? ' rec' : '')} style={{ paddingLeft: 8 + depth * 14 }} onClick={() => go(key)}
      aria-current={cur === key && !query ? 'true' : undefined} aria-expanded={opts.fold != null ? opts.fold : undefined}>
      {opts.fold != null ? <Icon name={opts.fold ? 'chevD' : 'chev'} size={11} stroke={2.6} /> : <span className="ex-sp" />}
      {opts.rec ? <Icon name="sparkle" size={14} /> : <Folder open={cur === key || !!opts.fold} />}
      <span className="ex-nl">{lab}</span><span className="ex-cnt num">{count}</span>
    </button>
  );

  const parts = {
    title: filter ? label + '으로 거르기' : pick ? label + ' 바꾸기' : frame ? (cur === 'rec' && !query ? '추천 ' + label : label + ' 추가') : label + ' 탐색',
    sub: filter ? '폴더를 눌러 찾거나 검색해서 고르세요. 여러 개 고르면 그중 하나라도 들어간 ' + fu.noun + (fu.noun === '시나리오' ? '를' : '을') + ' 보여 줘요. 숫자는 지금 고른 다른 조건에서 그 ' + label + '이 든 ' + fu.noun + ' 수예요.' : pick ? '바꿀 ' + label + '을 하나 고른 다음 ‘바꾸기’를 누르세요. 요소의 모델명 · 이름 · 사양 · 이미지가 함께 바뀌어요.' : frame ? '폴더를 눌러 찾고, 항목을 골라 ‘연결’을 누르세요' : '폴더를 눌러 찾고, 항목을 눌러 고른 다음 ‘연결’을 누르세요. 이미 연결된 항목은 ‘연결됨’으로 보여요.',
    footer: (<>
        <span className="ex-tray-n num">선택 {sel.size}</span>
        <div className="ex-tray" aria-label="고른 항목">
          {selList.length ? selList.map((r) => { const it = byRef.get(r); return <span key={r} className="ex-pick" title={it ? it.name : r}><Thumb r={r} mini className="ex-pick-th" /><span className="ex-pick-t">{it ? (kind === 'products' ? it.code : it.name) : r}</span><button type="button" onClick={() => toggle(r)} aria-label={(it ? it.name : r) + ' 선택 해제'}><Icon name="x" size={11} stroke={2.6} /></button></span>; })
            : <span className="faint">항목을 눌러 고르세요</span>}
        </div>
        <button className="btn" onClick={onClose}>{closeLabel}</button>
        {filter ? <button className="btn btn-primary ex-apply" disabled={!sel.size && !(filter.selected || []).length} onClick={commit}><Icon name="funnel" size={15} />{sel.size ? sel.size + '개로 거르기' : (filter.selected || []).length ? label + ' 필터 빼기' : '거르기'}</button>
          : pick ? <button className="btn btn-primary" disabled={!sel.size} onClick={commit}><Icon name="swap" size={15} />{sel.size ? (byRef.get([...sel][0]) || {}).code + '로 바꾸기' : '바꾸기'}</button>
          : <button className="btn btn-primary" disabled={!sel.size} onClick={commit}><Icon name="link" size={15} />{sel.size ? sel.size + '개 연결' : '연결'}</button>}
      </>),
    body: (<>
      <div className="ex-bar">
        <div className="ex-q">
          <Icon name="search" size={15} />
          <label htmlFor="ex-q-in" className="sr">{label} 검색</label>
          <input id="ex-q-in" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
            placeholder={kind === 'products' ? '제품명 · 모델명 · 공간으로 검색' : kind === 'solutions' ? '솔루션명 · 해결 과제로 검색 (예: 원격 콘텐츠 관리)' : '고객사 · 공간 · 니즈로 검색 (예: 메뉴보드)'} />
          {q && <button type="button" className="ex-qx" onClick={() => setQ('')} aria-label="검색어 지우기"><Icon name="x" size={13} /></button>}
        </div>
        {ind && kind !== 'cases' && <button type="button" className={'ex-chip' + (fit ? ' on' : '')} aria-pressed={fit} onClick={() => setFit(!fit)}>{fit && <Icon name="check" size={12} stroke={2.8} />}{indShort(ind)} 맞춤만</button>}
        {kind === 'cases' && <span className="ex-hint">삼성 도입사례 {all.length}건 · 최신순</span>}
      </div>
      <div className="ex-crumb">
        <nav aria-label="경로">{crumbs.map((c, i) => <React.Fragment key={i}>{i > 0 && <Icon name="chev" size={11} />}{c.key && i < crumbs.length - 1 ? <button type="button" onClick={() => go(c.key)}>{c.label}</button> : <b>{c.label}</b>}</React.Fragment>)}</nav>
        <span className="num">{shown}개</span>
      </div>
      <div className="ex-body">
        <nav className="ex-nav" aria-label={label + ' 폴더'}>
          {navBtn('rec', 0, filter ? '많이 쓰인 ' + label : '추천', recs.length, { rec: true })}
          <i className="ex-div" />
          {navBtn('all', 0, '전체 ' + label, pool.length)}
          {tree.map((fm) => {
            const isOpen = open.has(fm.key) || cur.startsWith('c:' + fm.f + '/');
            const leafOnly = fm.cats.length === 1 && fm.cats[0].label === fm.label;
            return (
              <React.Fragment key={fm.key}>
                {navBtn(fm.key, 1, fm.label, fm.count, { fold: leafOnly ? undefined : isOpen })}
                {isOpen && !leafOnly && fm.cats.map((c) => navBtn(c.key, 2, c.label, c.count))}
              </React.Fragment>
            );
          })}
        </nav>
        <div className="ex-list" ref={listRef}>
          {mode === 'rec' ? (
            recs.length ? (
              <div className="ex-tiles">{recs.map((rec) => <RecTile key={rec.ref} rec={rec} it={byRef.get(rec.ref)} st={stOf(rec.ref)} n={cnt(rec.ref)} fu={fu} onToggle={toggle} />)}</div>
            ) : <div className="ex-empty"><Icon name="sparkle" size={18} />추천할 {label}{kind === 'cases' ? '가' : '이'} 아직 없어요. 업종을 정하거나 요구사항을 더 쓰면 추천이 생겨요.</div>
          ) : shown === 0 ? (
            <div className="ex-empty"><Icon name="search" size={18} />{query ? '찾는 ' + label + '이 없어요. 다른 말로 검색해 보세요.' : '이 폴더에는 항목이 없어요.'}</div>
          ) : (
            <>
              {HEAD[kind] && <div className={'ex-head ' + kind} aria-hidden="true">{HEAD[kind].map((h, i) => <span key={i}>{h}</span>)}</div>}
              {sections.map((s, i) => s.items.length > 0 && (
                <section key={s.key || i} className="ex-sec" aria-label={s.label || label}>
                  {s.label && <h4 className="ex-sh">{s.key ? <button type="button" onClick={() => go(s.key)}><Folder />{s.label}</button> : s.label}<span className="num">{s.items.length}</span></h4>}
                  {s.items.map((it) => <Row key={it.ref} it={it} st={stOf(it.ref)} n={cnt(it.ref)} fu={fu} onToggle={toggle} ind={ind} peek={kind === 'products' ? peek : null} />)}
                </section>
              ))}
            </>
          )}
        </div>
      </div>
      {peek.node}
    </>),
  };
  if (frame) return frame(parts);
  return (
    <Modal size="xwide ex-modal" bodyClass="mbody ex-mbody" onClose={onClose} title={parts.title} sub={parts.sub} footer={parts.footer}>
      {parts.body}
    </Modal>
  );
}

/** how many items the catalog has for a kind (for the add card) */
export const totalOf = (kind) => itemsOf(kind).length;
/** folder key holding a catalog item (e.g. 'c:디스플레이/LCD 사이니지') — opens the explorer next to similar items */
export function folderOf(kind, id) { const it = itemsOf(kind).find((x) => x.id === id); return it ? 'c:' + it.f + '/' + it.c : 'all'; }
export const startFor = (kind, ind) => (kind === 'cases' && ind && IND[ind] ? 'f:' + ind : 'all');
