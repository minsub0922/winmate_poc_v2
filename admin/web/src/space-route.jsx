// 「전체 파트」 팝업 — 제품(공간) 수에 따라 시트를 골라 쓰는 장: 공간별 제안의 「공간별 대표 제품」 · 「업종 Map」 (사용자 지시 2026-11-16)
//   공간별 대표 제품: 제품 1 · 2 · 3 · 4개 장을 제품 수에 맞춰 나눠 쓴다(3개 이하 한 장씩 · 4개 2/2 · 5개 3/2 · 6개 3/3 · 7개 4/3 · 8개 4/4 · 그 이상은 조감도부터 다시).
//   업종 Map: 공간 2~8곳 시트 7종 가운데 공간 수에 맞는 한 장(1곳은 없음 · 8곳을 넘으면 조감도 묶음마다 한 장).
//             공간마다 제품을 하나 이상 놓는다 — 제품 수에 따라 카드 크기 · 배치가 달라지므로 장은 앱 모듈(space_map_sheet.js)이 예시 자료로 여기서 조립한다.
//   어느 시트를 쓰든 목록에는 시트를 모두 보여 준다 — 표(제품 수 → 장 나눔 · 공간 수 → Map 시트)와 함께. 풀어 쓴 설명 문장은 두지 않는다.
//   규칙: app/web/src/domain/templates/space_sheet_plan.js · 목록 정의: part-flows.js(PART_CATALOG.routed → routePart)
//   시트(예시를 채운 제품 장 4종 · Map 예시 자료 7종): space-sheets.json — app/scripts/vertical_standard/space_sheets.py 가 만든다. 레이아웃 라이브러리 · 실제 덱에는 아직 없다(실제 덱 반영 전).
//   layout-parts.jsx 는 이 장의 자리에 <RoutedSheets> 를 그린다. 상세(마우스를 대면) · 크게 보기는 여기서 따로 띄운다.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { IconButton } from './components';
import { Overlay } from './layouts.jsx';
import { spaceMapSheet } from '../../../app/web/src/domain/templates/space_map_sheet.js';
import './space-route.css';

const pad = n => String(n).padStart(2, '0');

/* ---------- 시트 (예시를 채운 HTML · 사진은 한 번만 담고 장마다 끼운다) ---------- */
let sheetsPromise = null;
const DOC = html => '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">'
  + '<style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}*{box-sizing:border-box}</style></head><body>' + html + '</body></html>';
/** f → { f, code, name, when, per, html } — 제품 장은 만들어 둔 HTML, Map(공간 n곳)은 예시 자료(공간마다 제품 여러 개)로 조립한다: { …, sheet(조립한 장 이름), cells } */
export function loadSpaceSheets() {
  if (!sheetsPromise) {
    sheetsPromise = import('./space-sheets.json', { with: { type: 'json' } }).then(m => {
      const d = m.default || m; const images = d.images || {};
      const fill = html => html.replace(/@img\d+@/g, k => images[k] || '');
      const out = Object.fromEntries((d.sheets || []).map(s => [s.f, { f: s.f, code: s.code, name: s.name, when: s.when, per: s.per, html: fill(s.html) }]));
      for (const ex of d.maps || []) {
        const sh = spaceMapSheet({ title: ex.title, foot: ex.foot, page: ex.page,
          spaces: ex.spaces.map(sp => ({ name: sp.name, note: sp.note, products: sp.products.map(x => ({ name: x.name, src: images[x.img] || '' })) })) });
        const f = 'L_VS_MAP_' + ex.n;
        out[f] = { f, code: 'VS-MAP-' + ex.n, name: `업종 Map · 공간 ${ex.n}곳 × 제품`, when: '', per: ex.n, html: DOC(sh.html), sheet: sh.f, cells: sh.cells };
      }
      return out;
    });
    sheetsPromise.catch(() => { sheetsPromise = null; });
  }
  return sheetsPromise;
}
// load: 시트 자료를 주는 함수(f → 시트) — 기본은 공간별 제안의 시트. 다른 파트(제품 스펙 — spec-route.js)는 제 자료를 넘긴다
function useSpaceSheets(load = loadSpaceSheets) {
  const [sheets, setSheets] = useState(null);
  useEffect(() => { let alive = true; load().then(x => alive && setSheets(x), () => alive && setSheets({})); return () => { alive = false; }; }, [load]);
  return sheets;
}

/** 주어진 장 HTML 을 그대로 그리는 미리보기(스크립트 없는 sandbox iframe) — 화면 가까이 온 뒤에 그린다 */
export function HtmlFrame({ html, title }) {
  const host = useRef(null);
  const [width, setWidth] = useState(0);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = host.current; if (!el) return undefined;
    const resize = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    resize.observe(el);
    const view = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setSeen(true); view.disconnect(); } }, { rootMargin: '300px' });
    view.observe(el);
    return () => { resize.disconnect(); view.disconnect(); };
  }, []);
  return <span className="lp-frame" ref={host}>
    {html && seen && width > 0 ? <iframe title={title} tabIndex={-1} sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={html} style={{ transform: `scale(${width / 1280})` }}/>
      : html === '' ? <span className="lp-frame-note"><Icon name="alert" size={14}/>미리보기 없음</span> : <span className="lp-frame-wait" aria-hidden="true"/>}
  </span>;
}

/* ---------- 표: 제품 수 → 장 나눔 · 공간 수 → Map 시트 ---------- */
// route: { title, unit, rows: [{ n, label, sheets, birds, pers }], more } — on: 마우스를 댄 시트(per)를 쓰는 줄을 켠다. 묶음이 여럿인 줄(birds > 1)은 보라, 장이 없는 줄(sheets 0)은 흐리게
function RouteTable({ route, on }) {
  return <div className="lpx-route" role="list" aria-label={route.title}>
    <span className="lpx-route-h">{route.title}</span>
    {route.rows.map(r => <span key={r.n} role="listitem" className={'lpx-route-c' + (r.birds > 1 ? ' split' : '') + (r.sheets === 0 ? ' none' : '') + (on && r.pers.includes(on) && r.birds === 1 ? ' on' : '')} data-n={r.n}
      title={r.sheets === 0 ? `${r.n}${route.unit} — 장 없음` : r.birds > 1 ? `${r.n}${route.unit} — 조감도 묶음 ${r.birds}개 (${r.label})` : `${r.n}${route.unit} — ${r.sheets}장 (${r.label})`}><b>{r.n}<u>{route.unit}</u></b><i>{r.label}</i></span>)}
    {route.more && <span className="lpx-route-more">{route.more}</span>}
  </div>;
}

/* ---------- 상세(마우스를 대면) ---------- */
function Pop({ at, children }) {
  const box = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const W = el.offsetWidth; const H = el.offsetHeight; const gap = 12; const vw = window.innerWidth; const vh = window.innerHeight;
    let left = at.right + gap;
    if (left + W > vw - 8) left = at.left - gap - W;
    if (left < 8) left = Math.max(8, Math.min(vw - W - 8, at.left + at.width / 2 - W / 2));
    let top = at.top + at.height / 2 - H / 2;
    top = Math.max(8, Math.min(vh - H - 8, top));
    setPos({ left, top });
  }, [at]);
  return createPortal(<div ref={box} className="lpx-pop" role="tooltip" id="lpx-pop" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}>{children}</div>, document.body);
}
function VariantDetail({ K, slot, v, sheet, total }) {
  const tpl = id => (K.toc.TPL[id] ? K.toc.TPL[id].name : id);
  return <div className="lpx-detail">
    <HtmlFrame html={sheet ? sheet.html : ''} title={v.title}/>
    <div className="lpx-detail-h"><b>{v.title}</b><small>{sheet ? sheet.code : v.f}</small></div>
    <dl>
      <div><dt>자리</dt><dd>{slot.step}번째 / {total}칸 — 늘 이 자리</dd></div>
      <div><dt>쓰는 때</dt><dd>{v.when || v.badge + '일 때'}</dd></div>
      <div><dt>한 장에</dt><dd>{v.badge} — {v.holds}</dd></div>
      {v.cards && <div><dt>제품 카드</dt><dd>{v.cards}</dd></div>}
      <div><dt>실제 덱</dt><dd>{v.deck}</dd></div>
      <div><dt>쓰는 구성</dt><dd>{slot.tpls.map(tpl).join(' · ')}</dd></div>
    </dl>
    {sheet && sheet.when && <p className="lpx-when">{sheet.when}</p>}
  </div>;
}

/* ---------- 시트 한 종 ---------- */
function Variant({ slot, v, sheet, hover, zoom }) {
  const ref = useRef(null);
  const t = useRef(0);
  const show = delay => { clearTimeout(t.current); t.current = setTimeout(() => ref.current && hover({ v, at: ref.current.getBoundingClientRect() }), delay); };
  const hide = () => { clearTimeout(t.current); hover(null); };
  useEffect(() => () => clearTimeout(t.current), []);
  return <li className="lpx-sheet lpx-variant" data-layout={v.f} data-step={slot.step} data-per={v.per}>
    <button type="button" ref={ref} onMouseEnter={() => show(140)} onMouseLeave={hide} onFocus={() => show(0)} onBlur={hide} onClick={() => { hide(); zoom(v); }}
      aria-label={`${slot.step}번째 장 · ${v.title}${v.when ? ' · ' + v.when : ''} — 크게 보기`} aria-describedby="lpx-pop">
      <span className="lpx-frame-wrap">
        <HtmlFrame html={sheet === undefined ? null : sheet ? sheet.html : ''} title={v.title}/>
        <span className="lpx-step">{pad(slot.step)}</span>
        <span className="lpx-per">{v.badge}</span>
      </span>
      <span className="lpx-cap"><b title={v.title}>{v.name}</b>{v.when && <small>{v.when}</small>}<small className="lpx-holds">{v.holds}</small></span>
    </button>
  </li>;
}

/** 파트 카드의 장 목록 안 — 이 장의 자리에 시트 n종을 한 줄로(줄 전체 차지). p: 이름을 붙인 파트(withNames), slot: 그 장 */
export function RoutedSheets({ K, p, slot, total, load = loadSpaceSheets }) {
  const sheets = useSpaceSheets(load);
  const [tip, setTip] = useState(null);
  const [zoomed, setZoomed] = useState(null);
  const box = useRef(null);
  const variants = slot.variants.map(v => ({ ...v, title: `${slot.label} · ${v.name}` }));
  useEffect(() => { // 팝업 본문을 굴리면 떠 있는 상세는 닫는다(자리가 어긋나므로)
    const el = box.current && box.current.closest('.modal-body'); if (!el) return undefined;
    const off = () => setTip(null);
    el.addEventListener('scroll', off, { passive: true });
    return () => el.removeEventListener('scroll', off);
  }, []);
  const sheetOf = v => (sheets ? sheets[v.f] || null : undefined);
  const zs = zoomed && sheetOf(zoomed);
  return <li className="lpx-routed" ref={box} data-layout={slot.fam} data-step={slot.step}>
    <div className="lpx-routed-h">
      <span className="lpx-routed-step">{pad(slot.step)}</span>
      <b>{slot.label}</b>
      <em>시트 {variants.length}종</em>
    </div>
    <RouteTable route={slot.route} on={tip ? tip.v.per : 0}/>
    <ol className="lpx-routed-list">{variants.map(v => <Variant key={v.f} slot={slot} v={v} sheet={sheetOf(v)} hover={setTip} zoom={setZoomed}/>)}</ol>
    {tip && <Pop at={tip.at}><VariantDetail K={K} slot={slot} v={tip.v} sheet={sheetOf(tip.v) || null} total={total}/></Pop>}
    {zoomed && <Overlay label={zoomed.title + ' 장표 미리보기'} close={() => setZoomed(null)} className="lp-zoom">
      <header><div><h3>{zoomed.title}</h3><p>{[zs ? zs.code : zoomed.f, p.title || p.name, zoomed.when || zoomed.badge, zoomed.live ? '' : '실제 덱 반영 전'].filter(Boolean).join(' · ')}</p></div><IconButton icon="close" label="미리보기 닫기" onClick={() => setZoomed(null)}/></header>
      <div className="lp-zoom-stage"><HtmlFrame html={zs === undefined ? null : zs ? zs.html : ''} title={zoomed.title}/></div>
      {zs && zs.when && <p className="lp-zoom-when"><Icon name="info" size={14}/>{zs.when}</p>}
    </Overlay>}
  </li>;
}
