// 레이아웃 구성 관리 — Storyboard '레이아웃 구성'이 추천하는 구성(목차 템플릿)을 본다 · 운영 값을 바꾼다.
//   구성의 구조(목차 흐름 · 장 · 업종별 시나리오)는 앱과 같은 모듈(app/web/src/domain/templates/toc_templates.js)에서 바로 읽는다 —
//   화면에 보이는 순서 · 꺼짐 · 기본 구성은 앱이 쓰는 applyTocPresets 로 계산한 값 그대로다.
//   바꿀 수 있는 값: 사용(켜기 · 끄기) · 순서 · 기본 구성(추천 첫 칸) · 이름 · 설명 · 맞는 상황(추천 모델에게 주는 문구) · 연결 샘플 시나리오.
//   저장하면 서버(app/api/layout_presets.py)에 남고, 앱은 다음에 열릴 때 /api/bootstrap 으로 받아 반영한다. 목차 · 장 구조는 여기서 바꾸지 않는다.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, date, number } from './api';
import { Icon } from './icons';
import { Button, IconButton, Modal, Empty, Loading, ErrorBox, Toggle } from './components';
import { useApp } from './context';
import { AllParts, AllPartsButton } from './layout-parts.jsx';
import { localPreview } from './local-previews.js';
import { PART_CATALOG } from './part-flows.js';
import { AddCompositionButton, CompositionBuilder } from './layout-builder.jsx';
import { PART_ICON_PATHS, lookStyle } from '../../../app/web/src/domain/templates/part_looks.js';
import { partLook } from '../../../app/web/src/domain/templates/part_colors.js';
import { representFlow } from '../../../app/web/src/domain/templates/represent_flow.js';
import { newCustomId } from '../../../app/web/src/domain/templates/custom_compositions.js';
import './layouts.css';

const DEMO_V = 'fb_qsr'; // 앱의 목차 템플릿 화면과 같은 대표 업종
const TEXT_FIELDS = ['name', 'desc'];
const text = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stageLabel = name => String(name || '').replace(/^(목차 · )?\d{2}\s+/, '');
const pad = n => String(n).padStart(2, '0');
/** 파트 이름 — 업종을 골랐으면 그 업종의 목차 이름(AI 퀵서비스), 고르지 않았으면 전체 파트 목록의 이름(3 Value Props · 고객사의 이해 …: 추천 구성과 전체 파트가 같은 이름으로 보이게) */
// 관리자 화면은 목록 이름(PART_CATALOG.names)을 먼저 쓴다 — 업종을 골라도 같은 이름. 목록 이름이 없는 목차만 앱의 목차 이름({업종}은 고른 업종)
const partName = (K, key, short = null) => PART_CATALOG.names[key] || K.toc.tocName(key, short);

/* ---------- 앱 모듈(구성 · 시나리오 · 목차 유형) — 이 탭을 열 때만 받는다 ---------- */
let kitPromise = null;
function loadKit() {
  if (!kitPromise) {
    kitPromise = Promise.all([
      import('../../../app/web/src/domain/templates/toc_templates.js'),
      import('../../../app/web/src/domain/templates/scenarios.js'),
      import('../../../app/web/src/domain/proposals/parts.js'),
    ]).then(async ([toc, scenarios, parts]) => {
      await toc.loadTocContent();
      // 조립한 시나리오(toc_…)가 레지스트리에 올라가기 전에 — 연결할 수 있는 기존 샘플 목록
      const samples = Object.values(scenarios.SC).filter(s => !s.toc && !/^toc_/.test(s.id));
      return { toc, SC: scenarios.SC, PARTS: parts.PARTS, samples };
    });
    kitPromise.catch(() => { kitPromise = null; });
  }
  return kitPromise;
}

/* ---------- 운영 값(초안) ↔ 저장 형식 ---------- */
const pure = p => ({ fixed: (p && p.fixed) || null, order: [...((p && p.order) || [])], items: structuredClone((p && p.items) || {}),
  parts: structuredClone((p && p.parts) || {}), templates: structuredClone((p && p.templates) || {}) });
/** 직접 만든 파트 · 구성(「구성 추가하기」) — 서버가 돌려주는 모양 그대로(키 순서까지 — 바꾼 값 비교) */
const cleanParts = parts => Object.fromEntries(Object.entries(parts || {}).map(([k, d]) => [k, { name: text(d.name), color: d.color, icon: d.icon, ...(d.type ? { type: d.type } : {}),
  sheets: (d.sheets || []).map(x => ({ f: x.f, label: text(x.label) })) }]));
const cleanTemplates = tpls => Object.fromEntries(Object.entries(tpls || {}).map(([id, t]) => {
  const out = { name: text(t.name) || '새 구성', tocs: [...(t.tocs || [])] };
  for (const k of ['desc', 'hint']) { const v = text(t[k]); if (v) out[k] = v; }
  if (Array.isArray(t.related)) out.related = [...new Set(t.related)];
  return [id, out];
}));
/** 저장할 값 — 코드 기본값과 같은 것은 남기지 않는다 */
function normalize(draft, K) {
  const { toc } = K; const defs = toc.tocTemplateDefaults();
  const items = {};
  for (const d of defs) {
    const o = draft.items[d.id]; if (!o) continue;
    const T = toc.TPL[d.id]; const out = {};
    if (o.enabled === false && !T.base) out.enabled = false;
    for (const k of TEXT_FIELDS) { const v = text(o[k]); if (v && v !== d[k]) out[k] = v; }
    const hint = text(o.hint); if (hint && hint !== toc.defaultTemplateHint(T)) out.hint = hint;
    if (Array.isArray(o.related) && !same(o.related, d.related)) out.related = o.related;
    if (Object.keys(out).length) items[d.id] = out;
  }
  // 직접 만든 구성 — 글 · 흐름은 구성 정의(templates)에, 끄기만 items 에
  const customIds = Object.keys(draft.templates || {});
  for (const id of customIds) { const o = draft.items[id]; if (o && o.enabled === false) items[id] = { enabled: false }; }
  const base = [...defs.filter(d => !toc.TPL[d.id].base).map(d => d.id), ...customIds];
  const listed = (draft.order || []).filter(id => base.includes(id));
  const order = [...listed, ...base.filter(id => !listed.includes(id))];
  const fixed = draft.fixed && draft.fixed !== 'std' && base.includes(draft.fixed) && draft.fixed !== 'prod' && !(items[draft.fixed] && items[draft.fixed].enabled === false) ? draft.fixed : null;
  return { fixed, order: same(order, base) ? [] : order, items, parts: cleanParts(draft.parts), templates: cleanTemplates(draft.templates) };
}
/** 화면에 그릴 값 — 앱과 같은 함수로 덮은 결과 */
function buildView(K, draft) {
  const { toc } = K;
  const state = toc.applyTocPresets({ ...normalize(draft, K), rev: 0 });
  const defs = Object.fromEntries(toc.tocTemplateDefaults().map(d => [d.id, d]));
  const list = toc.TOC_TEMPLATES.map(t => {
    const d = defs[t.id] || { id: t.id, name: t.name, desc: t.desc, related: t.related || [] }; // 직접 만든 구성은 정의가 곧 값
    return { id: t.id, name: t.name, desc: t.desc, hint: toc.templateHint(t), defaultHint: toc.defaultTemplateHint(t), related: [...(t.related || [])],
      off: !!t.off, base: t.base || null, hue: t.hue || 'slate', tocs: t.tocs, fixed: t.id === state.fixed, canFix: toc.canBeFixedTemplate(t), defaults: d, custom: !!t.custom,
      edited: t.custom ? { name: false, desc: false, hint: false, related: false }
        : { name: t.name !== d.name, desc: t.desc !== d.desc, hint: !!t.hint, related: !same(t.related || [], d.related || []) } };
  });
  const main = list.filter(x => !x.base);
  const defaultOrder = [...Object.values(defs).filter(d => !toc.TPL[d.id].base).sort((a, b) => a.index - b.index).map(d => d.id),
    ...Object.keys(draft.templates || {}).filter(id => toc.TPL[id] && toc.TPL[id].custom)];
  return { fixed: state.fixed, list, main, variants: list.filter(x => x.base), orderEdited: !same(main.map(x => x.id), defaultOrder) };
}
const editedCount = x => Object.values(x.edited).filter(Boolean).length;

/* ---------- 덱(구성 × 업종) — 목차마다 장 ---------- */
function deckOf(K, tid, vid) {
  let s = null;
  try { s = K.toc.ensureTocScenario(tid, vid); } catch (e) { console.error(e); }
  if (!s) return null;
  const T = K.toc.TPL[tid]; let no = 0;
  const groups = s.flow.map(g => {
    const front = !!g.deck || g.key === 'open';
    const key = front ? null : T.tocs[no]; if (!front) no += 1;
    const toc = key && K.toc.TOCS[key];
    return { front, no: front ? 0 : no, key, name: front ? '표지 · 목차' : stageLabel(g.name), type: toc ? toc.type : null, goal: front ? '제안 전체를 먼저 보여 준다' : (toc && toc.goal) || g.goal || '',
      slides: g.slides.map(x => ({ f: x.f, role: x.role })) };
  });
  return { id: s.id, title: s.title, groups, total: groups.reduce((a, g) => a + g.slides.length, 0) };
}
/** 모든 업종에서 이 구성의 목차마다 쓰는 레이아웃(겹치지 않게) — 업종마다 공간 · 여정 · 솔루션 수에 따라 쓰는 장이 다르다 */
function unionOf(K, tid) {
  const T = K.toc.TPL[tid]; const verts = K.toc.tocVerticals();
  const parts = [{ front: true, no: 0, name: '표지 · 목차', goal: '제안 전체를 먼저 보여 준다', type: null, map: new Map() },
    ...T.tocs.map((key, i) => ({ no: i + 1, key, name: partName(K, key), type: K.toc.TOCS[key].type, goal: K.toc.TOCS[key].goal, map: new Map() }))];
  let built = 0;
  for (const v of verts) {
    const d = deckOf(K, tid, v.id); if (!d) continue;
    built += 1;
    for (const g of d.groups) {
      const P = parts[g.front ? 0 : g.no]; if (!P) continue;
      const here = new Set();
      for (const x of g.slides) {
        const e = P.map.get(x.f) || { f: x.f, verts: 0 };
        if (!here.has(x.f)) { e.verts += 1; here.add(x.f); }
        P.map.set(x.f, e);
      }
    }
  }
  return { verts: built, groups: parts.map(({ map, ...p }) => ({ ...p, slides: [...map.values()] })) };
}

/* ---------- 레이아웃 장표 미리보기 (스크립트 없는 HTML · sandbox iframe) ---------- */
const previews = new Map(); // 'f|thumb' → Promise<html>
window.addEventListener('admin:layout-library', () => { previews.clear(); metaPromise = null; });
export const previewOf = (f, thumb) => {
  const key = f + (thumb ? '|t' : '');
  if (!previews.has(key)) {
    const local = localPreview(f, thumb); // 화면 번들에 실린 시트(업종별 고정 시트 …)는 서버에 묻지 않는다
    const p = api('/layout-presets/layouts/' + encodeURIComponent(f) + '/preview' + (thumb ? '?thumb=1' : '')).then(r => r.html).catch(error => { if (local) return local; throw error; });
    p.catch(() => previews.delete(key));
    previews.set(key, p);
  }
  return previews.get(key);
};
// patch: 미리보기 HTML 을 그리기 전에 고치는 함수(전체 파트 목록의 '숫자 00' 장) — 늘 같은 함수를 넘긴다
export function LayoutFrame({ f, title, thumb = true, patch = null, documentHtml = null }) {
  const [libraryRevision, setLibraryRevision] = useState(0);
  useEffect(() => { const changed = e => setLibraryRevision(e.detail); window.addEventListener('admin:layout-library', changed); return () => window.removeEventListener('admin:layout-library', changed); }, []);
  const host = useRef(null);
  const [width, setWidth] = useState(0);
  const [seen, setSeen] = useState(false);
  const [state, setState] = useState({ html: '', error: false });
  useEffect(() => {
    const el = host.current; if (!el) return undefined;
    const resize = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    resize.observe(el);
    const view = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setSeen(true); view.disconnect(); } }, { rootMargin: '300px' });
    view.observe(el);
    return () => { resize.disconnect(); view.disconnect(); };
  }, []);
  useEffect(() => {
    if (!seen || documentHtml !== null) return undefined;
    let alive = true;
    setState({ html: '', error: false });
    previewOf(f, thumb).then(html => alive && setState({ html, error: false }), () => alive && setState({ html: '', error: true }));
    return () => { alive = false; };
  }, [seen, f, thumb, libraryRevision, documentHtml]);
  const html = useMemo(() => documentHtml ?? (state.html && patch ? patch(state.html) : state.html), [state.html, patch, documentHtml]);
  return <span className="lp-frame" ref={host}>
    {html && width > 0 ? <iframe title={title} tabIndex={-1} sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={html} style={{ transform: `scale(${width / 1280})` }}/>
      : state.error ? <span className="lp-frame-note"><Icon name="alert" size={14}/>미리보기 없음</span> : <span className="lp-frame-wait" aria-hidden="true"/>}
  </span>;
}

/** 화면 위에 띄우는 보기(장표 크게 보기 · 샘플 시나리오) — Esc 는 이 보기만 닫는다 */
export function Overlay({ label, close, children, className = '' }) {
  const box = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    box.current && box.current.focus();
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('keydown', key, true); before && before.isConnected && before.focus(); };
  }, []);
  return createPortal(<div className={'lp-overlay ' + className} onMouseDown={e => e.target === e.currentTarget && close()}>
    <section className="lp-overlay-box" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label}>{children}</section>
  </div>, document.body);
}

/* ---------- 목차 흐름 — Storyboard 목차 버블처럼: 파트 아이콘을 채운 원 + 아래에 이름, 버블 사이 점선 ---------- */
// 파트 아이콘(PARTS[type].icon)의 모양 — 앱 components/common.jsx 의 PATHS 에서 파트 아이콘만 옮겨 왔다(앱 Icon 은 앱 데이터를 함께 불러와 여기서 쓰지 않는다)
const PART_PATHS = {
  clip: 'M9 4h6v3H9z M7 5.5H5V21h14V5.5h-2 M8.5 12h7 M8.5 16h5',
  "p-check": 'M10 6h10 M10 12h10 M10 18h10 M3.5 6l1.5 1.5L7.5 5 M3.5 12l1.5 1.5L7.5 11 M3.5 18l1.5 1.5L7.5 17',
  "p-market": 'M4 20v-5 M9 20v-8 M14 20v-6 M19 20v-9 M3 20h18 M4 10l5-4 4 3 7-6 M16 3h4v4',
  building: 'M5 21V4h10v17 M15 9h4v12 M8 8h4 M8 12h4 M8 16h4 M3 21h18',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21c.8-4 3.6-6 7-6s6.2 2 7 6 M16 4a4 4 0 0 1 0 7 M18 15c2 .6 3.4 2.6 4 6',
  "p-scale": 'M12 4v16 M8 20h8 M5 7h14 M5 7l-3 6h6z M19 7l-3 6h6z',
  "p-bulb": 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  gem: 'M6 4h12l3 5-9 11L3 9z M3 9h18 M9.5 9L12 20l2.5-11',
  trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  monitor: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  "p-boxes": 'M3 13h8v8H3z M13 13h8v8h-8z M8 3h8v8H8z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  "p-trophy": 'M8 4h8v6a4 4 0 0 1-8 0z M8 6H5v1a3 3 0 0 0 3 3 M16 6h3v1a3 3 0 0 1-3 3 M12 14v4 M8 21h8 M9.5 18h5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  "p-ruler": 'M4 17L17 4l3 3L7 20z M8.5 12.5l1.5 1.5 M11 10l1.5 1.5 M13.5 7.5l1.5 1.5',
  calendar: 'M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9.5c0-1.4 1.3-2 3-2s3 .7 3 2-1.5 1.8-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.6 3-2 M12 6v1.5 M12 16.5V18',
  "p-subs": 'M17 2l4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 M7 22l-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3',
  "p-cover": 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3 M9 7h6 M9 10h4',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  "p-clip": 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7',
  edit: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
};
export function PartIcon({ name, size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PART_PATHS[name] || PART_ICON_PATHS[name] || PART_PATHS.edit}/></svg>;
}
// peek: 목록 카드에서만 — { tid, onOpen }. 버블(+ 이름)에 마우스를 대면 그 목차에 속하는 레이아웃 목록이 뜬다(PartPeek) · 누르면 상세를 연다.
function Flow({ K, tocs, short = null, size = '', peek = null }) {
  const [on, setOn] = useState(null); // { i, el }
  const timer = useRef(0);
  const later = (fn, ms) => { clearTimeout(timer.current); timer.current = setTimeout(fn, ms); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const hold = () => clearTimeout(timer.current);
  const leave = () => later(() => setOn(null), 160);
  return <ol className={'lp-flow ' + size + (peek ? ' peek' : '')} aria-label="목차 흐름">{tocs.map((key, i) => {
    const toc = K.toc.TOCS[key]; const part = K.PARTS[toc.type] || K.PARTS.free;
    const hover = peek ? { onMouseEnter: e => { const el = e.currentTarget; later(() => setOn({ i, el }), on ? 0 : 110); }, onMouseLeave: leave, onClick: peek.onOpen } : {};
    return <li key={key + i} className={'lp-pf h-' + (part.hue || 'slate') + (on && on.i === i ? ' on' : '')} style={lookStyle(partLook(key, toc.look))} title={peek ? undefined : toc.goal} data-toc={key} {...hover}>
      <span className="lp-pf-node"><PartIcon name={toc.look ? toc.look.icon : part.icon}/></span>
      <span className="lp-pf-name">{partName(K, key, short)}</span>
    </li>;
  })}{peek && on && <PartPeek K={K} tid={peek.tid} no={on.i + 1} anchor={on.el} onEnter={hold} onLeave={leave} close={() => setOn(null)}/>}</ol>;
}

/* ---------- 버블 hover — 그 목차의 대표 흐름 하나(대표 업종 덱 한 벌) ----------
   공간 · 여정 · 솔루션 · 사례 수만큼 늘어나는 장은 한 칸으로 접고 「공간마다 × n」만 붙인다(사용자 지시 2026-11-16 — 모든 업종의 변형을 다 늘어놓으면 복잡하다).
   업종마다 다른 변형(조감도 · Map 의 공간 수 등)은 상세 '목차 · 레이아웃'에서 본다. */
//   접는 규칙(REPEAT · representFlow)은 Storyboard 추천 구성 버블 hover 와 같이 쓴다 — app/web/src/domain/templates/represent_flow.js
export { representFlow };
const reps = new Map(); // 구성 id → { vert, groups } (구성 구조는 운영 값과 상관없이 같다)
function repDeck(K, tid) {
  const ck = tid + '|' + (K.toc.TPL[tid].sig || ''); // 직접 만든 구성은 정의가 바뀌면 다시
  if (reps.has(ck)) return reps.get(ck);
  const verts = K.toc.tocVerticals();
  let d = null; let vert = null;
  for (const v of [verts.find(o => o.id === DEMO_V), ...verts].filter(Boolean)) { d = deckOf(K, tid, v.id); if (d) { vert = v; break; } }
  const out = d ? { vert, groups: d.groups } : null;
  reps.set(ck, out);
  return out;
}
let metaPromise = null; // 레이아웃 이름 · 코드 · 쓰는 상황
const layoutMeta = () => {
  if (!metaPromise) { metaPromise = api('/layout-presets/layouts').then(r => r.items || {}); metaPromise.catch(() => { metaPromise = null; }); }
  return metaPromise;
};
const PEEK_W = 460;
function PartPeek({ K, tid, no, anchor, onEnter, onLeave, close }) {
  const box = useRef(null);
  const [meta, setMeta] = useState({});
  useEffect(() => { let alive = true; const load = () => layoutMeta().then(m => alive && setMeta(m), () => {}); load(); window.addEventListener('admin:layout-library', load); return () => { alive = false; window.removeEventListener('admin:layout-library', load); }; }, []);
  const rep = useMemo(() => repDeck(K, tid), [K, tid]);
  const g = rep && rep.groups.find(x => x.no === no);
  const key = K.toc.TPL[tid].tocs[no - 1];
  const part = K.PARTS[K.toc.TOCS[key].type] || K.PARTS.free;
  // 바깥(페이지)이 굴러가면 닫는다 — 목록 안을 굴리는 것은 그대로
  useEffect(() => {
    const onScroll = e => { if (!(box.current && box.current.contains(e.target))) close(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close); };
  }, []);
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  const below = vh - r.bottom - 16, above = r.top - 16;
  const down = below >= 320 || below >= above;
  const width = Math.min(PEEK_W, vw - 24);
  const left = Math.max(12, Math.min(vw - width - 12, r.left + r.width / 2 - width / 2));
  const style = { left, width, maxHeight: Math.min(560, down ? below : above), ...(down ? { top: r.bottom + 8 } : { bottom: vh - r.top + 8 }) };
  const flow = g ? representFlow(g.slides) : [];
  const look = K.toc.TOCS[key].look;
  return createPortal(<div ref={box} className={'lp-peek h-' + (part.hue || 'slate')} style={{ ...style, ...lookStyle(partLook(key, look)) }} role="dialog" aria-label={partName(K, key) + ' 대표 흐름'} onMouseEnter={onEnter} onMouseLeave={onLeave}>
    <header><span className="lp-pf-node"><PartIcon name={look ? look.icon : part.icon}/></span><div><b>{pad(no)} {partName(K, key)}</b><small>대표 흐름{rep ? ' · ' + rep.vert.nm : ''}{K.toc.TOCS[key].goal ? ' · ' + K.toc.TOCS[key].goal : ''}</small></div></header>
    <ol className="lp-peek-list">{flow.map((x, i) => {
      const m = meta[x.f] || {};
      return <li key={x.f + i} data-layout={x.f}><LayoutFrame f={x.f} title={m.name || x.f}/><div><b>{m.name || x.f}</b><small>{m.code || x.f}</small>{x.unit ? <em className="lp-peek-rep">{x.unit} × {x.n}</em> : x.n > 1 ? <em className="lp-peek-rep">× {x.n}</em> : null}</div></li>;
    })}{!flow.length && <li className="lp-none">이 목차에 쓰이는 레이아웃이 없습니다.</li>}</ol>
  </div>, document.body);
}

/* ---------- 버블 사이 간격은 목록 전체에서 하나 ----------
   사용자 지시(2026-11-17): "추천 구성 아이템 ui 에서 버블간 간격은 일정해야해. 그래서 여러개고 적고를 한눈에 볼 수 있게".
   칸 폭(--lp-slot) = min(112px, 가장 좁은 줄의 흐름 폭 ÷ 목록에서 가장 긴 구성의 파트 수) — 추천 구성 · 자동 변형 두 목록이 같은 값을 쓴다.
   줄마다 흐름 폭이 다르다(변형 줄은 스위치 · 버튼 칸이 없고, 직접 만든 구성은 버튼이 다르다) — 그래서 CSS 비율이 아니라 가장 좁은 줄을 재서 정한다.
   짧은 구성은 왼쪽부터 놓여 끝나는 자리로 길이가 바로 보인다. 상세 팝업 머리의 흐름(.sm)은 한 구성만 보여 주므로 예전처럼 늘어난다. */
const SLOT_MAX = 112; const SLOT_MIN = 48;
function useEvenSlots(ref, maxN, dep) {
  useLayoutEffect(() => {
    const root = ref.current; if (!root || !maxN) return undefined;
    const flows = () => [...root.querySelectorAll('.lp-rows .lp-flow')];
    const measure = () => {
      const ws = flows().map(f => f.clientWidth).filter(w => w > 0);
      if (!ws.length) return;
      root.style.setProperty('--lp-slot', Math.max(SLOT_MIN, Math.min(SLOT_MAX, Math.floor(Math.min(...ws) / maxN))) + 'px');
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure); // 흐름 폭은 줄이 정한다(버블 폭이 바뀌어도 흐름 폭은 그대로) — 되먹임이 없다
    flows().forEach(f => ro.observe(f));
    return () => ro.disconnect();
  }, [ref, maxN, dep]);
}

/* ---------- 목록의 한 줄 ---------- */
function Row({ K, x, index, count, layouts, onMove, onToggle, onFix, onOpen, onEdit, onDelete }) {
  const edited = editedCount(x);
  return <article className={'lp-row h-' + x.hue + (x.off ? ' off' : '')} data-template={x.id}>
    <button type="button" className="lp-row-hit" onClick={onOpen} aria-label={x.name + ' 상세 보기'}/>
    {onMove && <div className="lp-order"><button type="button" aria-label={x.name + ' 위로'} disabled={index === 0} onClick={() => onMove(-1)}><Icon name="down" size={14} style={{ transform: 'rotate(180deg)' }}/></button><span>{pad(index + 1)}</span><button type="button" aria-label={x.name + ' 아래로'} disabled={index === count - 1} onClick={() => onMove(1)}><Icon name="down" size={14}/></button></div>}
    <div className="lp-row-main">
      <header><h3>{x.name}</h3>{x.custom && <em className="lp-tag custom">직접 만듦</em>}{x.fixed && <em className="lp-tag fixed">기본 구성</em>}{x.off && <em className="lp-tag off">꺼짐</em>}{edited > 0 && <em className="lp-tag edited">글 · 샘플 수정 {edited}</em>}</header>
      <p className="lp-desc">{x.desc}</p>
      <Flow K={K} tocs={x.tocs} peek={{ tid: x.id, onOpen }}/>
      <p className="lp-meta"><span>목차 <b>{x.tocs.length}</b></span><span>레이아웃 <b>{layouts == null ? '–' : number(layouts)}</b>장 <small>대표 업종 기준</small></span><span>연결 샘플 <b>{x.related.filter(id => K.SC[id]).length}</b></span><span className="lp-hint" title="추천 모델에게 주는 '맞는 상황'">{x.hint}</span></p>
    </div>
    {(onToggle || onFix) && <div className="lp-row-act">
      {onToggle && <label className="lp-switch"><span>{x.off ? '추천 안 함' : '추천에 사용'}</span><Toggle checked={!x.off} disabled={x.fixed && !x.off} label={x.name + ' 사용'} onChange={onToggle}/></label>}
      {onFix && !x.fixed && <Button variant="ghost" disabled={!x.canFix} title={x.id === 'prod' ? '제품 제안서는 제품만 있고 솔루션이 없는 제안에서만 첫 칸에 쓰입니다' : x.off ? '꺼진 구성은 기본으로 쓸 수 없습니다' : undefined} onClick={onFix}>기본으로</Button>}
      {(onEdit || onDelete) && <div className="lp-row-own">{onEdit && <Button variant="ghost" onClick={onEdit}>고치기</Button>}{onDelete && <Button variant="ghost" disabled={x.fixed} onClick={onDelete}>지우기</Button>}</div>}
    </div>}
  </article>;
}

/* ---------- 상세: 설정 ---------- */
function SettingsTab({ x, raw, limits, edit, onToggle, onFix }) {
  const field = (key, label, note, multi) => {
    const value = raw[key] != null ? raw[key] : key === 'hint' ? '' : x.defaults[key];
    const fallback = key === 'hint' ? x.defaultHint : x.defaults[key];
    const changed = x.edited[key];
    const props = { id: 'lp-f-' + key, value, maxLength: limits[key], placeholder: fallback, onChange: e => edit({ [key]: e.target.value }) };
    return <div className="lp-field" key={key}>
      <label htmlFor={'lp-f-' + key}>{label}{changed && <em className="lp-tag edited">수정됨</em>}</label>
      {multi ? <textarea rows={key === 'desc' ? 3 : 2} {...props}/> : <input type="text" {...props}/>}
      <p>{note}{changed && <button type="button" className="text-button" onClick={() => edit({ [key]: undefined })}>기본값으로</button>}</p>
    </div>;
  };
  return <div className="lp-settings">
    {!x.base && <div className="lp-set-row">
      <div><strong>추천에 사용</strong><p>{x.fixed ? '기본 구성은 끌 수 없습니다. 다른 구성을 기본으로 정한 뒤 꺼 주세요.' : '끄면 Storyboard의 추천 구성 · 전체 구성 보기 · 목차 템플릿 목록에서 빠집니다. 이미 이 구성으로 만든 제안서는 그대로입니다.'}</p></div>
      <Toggle checked={!x.off} disabled={x.fixed && !x.off} label={x.name + ' 사용'} onChange={onToggle}/>
    </div>}
    {!x.base && <div className="lp-set-row">
      <div><strong>기본 구성</strong><p>{x.fixed ? '추천 구성의 첫 칸에 늘 놓이는 구성입니다. (제품만 있고 솔루션이 없는 제안은 제품 제안서가 첫 칸에 놓입니다)' : x.id === 'prod' ? '제품 제안서는 제품만 있고 솔루션이 없는 제안에서만 첫 칸에 놓입니다.' : '추천 구성의 첫 칸에 늘 놓이는 구성으로 정합니다.'}</p></div>
      {x.fixed ? <em className="lp-tag fixed">기본 구성</em> : <Button disabled={!x.canFix} onClick={onFix}>기본으로 정하기</Button>}
    </div>}
    {x.base && <p className="lp-note"><Icon name="info" size={14}/>이 구성은 「{x.baseName}」에 ‘구독 상품 제안’ 파트만 더한 변형입니다. 고객 요구에 구독 · 렌탈 · 월 납부가 있으면 자동으로 쓰이므로 따로 끄거나 순서를 바꾸지 않습니다 — 「{x.baseName}」을 끄면 함께 빠집니다.</p>}
    {field('name', '이름', '추천 카드와 전체 구성 보기에 보이는 이름입니다.')}
    {field('desc', '설명', '카드 설명이자, 추천 모델이 구성을 고를 때 읽는 설명입니다.', true)}
    {!x.base && field('hint', '맞는 상황', '추천 모델에게 주는 문구입니다. 비워 두면 기본 문구를 씁니다.', true)}
  </div>;
}

/* ---------- 상세: 목차 · 레이아웃 ---------- */
function PartsTab({ K, x, meta, zoom }) {
  const verts = useMemo(() => K.toc.tocVerticals(), [K]);
  const [vid, setVid] = useState('');
  const v = verts.find(o => o.id === vid) || null;
  const data = useMemo(() => (vid ? deckOf(K, x.id, vid) : unionOf(K, x.id)), [K, x.id, vid]);
  const groups = useMemo(() => verts.reduce((m, o) => m.set(o.gn, [...(m.get(o.gn) || []), o]), new Map()), [verts]);
  if (!data) return <Empty icon="alert" title="이 업종의 덱을 만들지 못했습니다">다른 업종을 골라 주세요.</Empty>;
  const total = data.groups.reduce((a, g) => a + g.slides.length, 0);
  return <div className="lp-parts">
    <div className="lp-parts-bar">
      <label>업종<select value={vid} onChange={e => setVid(e.target.value)}>
        <option value="">모든 업종 — 목차마다 쓰이는 레이아웃</option>
        {[...groups].map(([name, list]) => <optgroup key={name} label={name}>{list.map(o => <option key={o.id} value={o.id}>{o.nm}</option>)}</optgroup>)}
      </select></label>
      <p>{vid ? <>「{v ? v.nm : vid}」 덱의 순서 그대로 · 장 <b>{number(total)}</b>장</> : <>업종 {data.verts}곳의 덱에서 모은 레이아웃 <b>{number(total)}</b>종 · 업종마다 공간 · 여정 · 솔루션 수에 따라 쓰는 장이 달라요</>}</p>
    </div>
    {data.groups.map(g => {
      const part = g.type && K.PARTS[g.type];
      return <section key={g.no} className={'lp-part h-' + ((part && part.hue) || 'slate')} data-part={g.key || 'front'}>
        <header><span className="lp-part-no">{g.front ? '앞장' : pad(g.no)}</span><div><h4>{g.front ? g.name : g.key ? partName(K, g.key, v ? v.short : null) : g.name}{part && <em>{part.label}</em>}</h4><p>{g.goal}</p></div><span className="count-label">{g.slides.length}</span></header>
        <ol className="lp-layouts">{g.slides.map((s, i) => {
          const m = meta[s.f] || {};
          return <li key={s.f + i}><button type="button" className="lp-layout" onClick={() => zoom({ f: s.f, role: s.role || '', part: g.name })} aria-label={(m.name || s.f) + ' 크게 보기'}>
            <LayoutFrame f={s.f} title={m.name || s.f}/>
            <span className="lp-layout-t"><b>{m.name || s.f}</b><small>{m.code || s.f}{vid ? (s.role ? ' · ' + s.role : '') : ` · 업종 ${s.verts}/${data.verts}`}</small></span>
          </button></li>;
        })}</ol>
      </section>;
    })}
  </div>;
}

/* ---------- 상세: 샘플 시나리오 ---------- */
function SamplesTab({ K, x, edit, view }) {
  const verts = useMemo(() => K.toc.tocVerticals(), [K]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const n = q.replace(/\s/g, '').toLowerCase();
  const hit = s => !n || s.replace(/\s/g, '').toLowerCase().includes(n);
  const related = x.related.map(id => ({ id, s: K.SC[id] || null }));
  const candidates = adding ? K.samples.filter(s => !x.related.includes(s.id) && hit(s.title + s.id)).slice(0, 40) : [];
  const info = s => `목차 ${s.flow.filter(g => !(g.deck || g.key === 'open')).length}개 · 장 ${s.flow.reduce((a, g) => a + g.slides.length, 0)}장`;
  const setRelated = list => edit({ related: same(list, x.defaults.related) ? undefined : list });
  const groups = verts.filter(o => hit([o.nm, o.full, o.gn, o.ai].join(' '))).reduce((m, o) => m.set(o.gn, [...(m.get(o.gn) || []), o]), new Map());
  return <div className="lp-samples">
    <section>
      <div className="lp-sec-h"><div><h4>연결된 기존 샘플 <span className="count-label">{related.length}</span></h4><p>이 구성을 뽑아낸 샘플 버티컬 시나리오입니다. 앱의 목차 템플릿 상세에서 업종과 함께 고를 수 있어요.</p></div>
        <div className="button-row">{x.edited.related && <button type="button" className="text-button" onClick={() => edit({ related: undefined })}>기본값으로</button>}<Button icon={adding ? 'close' : 'plus'} onClick={() => { setAdding(v => !v); setQ(''); }}>{adding ? '추가 닫기' : '샘플 연결'}</Button></div></div>
      {adding && <div className="lp-add">
        <label className="search-field"><Icon name="search" size={16}/><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="샘플 이름 · id 로 찾기" aria-label="연결할 샘플 찾기"/></label>
        <ul className="lp-list">{candidates.map(s => <li key={s.id}><div><strong>{s.title}</strong><small>{s.id} · {info(s)}</small></div><div className="button-row"><Button variant="ghost" onClick={() => view({ kind: 'rel', id: s.id, title: s.title })}>보기</Button><Button icon="plus" onClick={() => setRelated([...x.related, s.id])}>연결</Button></div></li>)}
          {!candidates.length && <li className="lp-none">찾는 샘플이 없습니다.</li>}</ul>
      </div>}
      {related.length ? <ul className="lp-list">{related.map(({ id, s }) => <li key={id} data-sample={id}>
        <div><strong>{s ? s.title : id}</strong><small>{s ? id + ' · ' + info(s) : '앱에 없는 샘플입니다 — 연결을 풀어 주세요.'}</small></div>
        <div className="button-row">{s && <Button icon="play" onClick={() => view({ kind: 'rel', id, title: s.title })}>보기</Button>}<Button variant="ghost" onClick={() => setRelated(x.related.filter(o => o !== id))}>연결 해제</Button></div>
      </li>)}</ul> : !adding && <p className="lp-none">연결된 기존 샘플이 없습니다.</p>}
    </section>
    <section>
      <div className="lp-sec-h"><div><h4>업종별 시나리오 <span className="count-label">{verts.length}</span></h4><p>이 구성으로 조립한 업종별 덱입니다. 같은 구성이면 장은 같고 업종마다 내용과 장 수만 달라요.</p></div>
        {!adding && <label className="search-field"><Icon name="search" size={16}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="업종으로 찾기" aria-label="업종 찾기"/></label>}</div>
      {[...groups].map(([name, list]) => <div key={name} className="lp-vgroup"><h5>{name}</h5><div className="lp-vgrid">{list.map(o => <button key={o.id} type="button" className="lp-vert" data-vertical={o.id} onClick={() => view({ kind: 'ind', id: o.id, title: o.nm })}>
        <strong>{o.nm}</strong><small>{x.id === 'prod' ? o.prod : `${o.ai} · 공간 ${o.nSp}`}</small><Icon name="play" size={12}/></button>)}</div></div>)}
      {!groups.size && <p className="lp-none">찾는 업종이 없습니다.</p>}
    </section>
  </div>;
}

/* ---------- 상세: 시트 — 대표 샘플 덱을 앱 그대로 (왼쪽 썸네일 · 오른쪽 큰 장 · ← →) ----------
   앱의 /?toc=<구성>&embed=sheets 를 iframe 으로 연다. 덱은 앱이 고른다: 연결된 기존 샘플 버티컬 시나리오 중 이 구성과 파트 구성(유형 · 순서)이
   꼭 같은 첫 덱, 없으면 이 구성으로 조립한 대표 업종 덱(app/web/src/components/toc-sheets.jsx representativeDeck). 연결 샘플은 저장된 값 기준이다.
   ← → 는 포커스가 이 창에 있어도 iframe 에 넘겨 장을 넘긴다. */
function SheetsTab({ x }) {
  const frame = useRef(null);
  const [info, setInfo] = useState(null);
  const src = '/?' + new URLSearchParams({ toc: x.id, embed: 'sheets' });
  useEffect(() => {
    const send = d => { const w = frame.current && frame.current.contentWindow; if (w) w.postMessage({ type: 'winmate:sheets-step', d }, window.location.origin); };
    const onKey = e => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tg = e.target;
      if (tg && (/^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName) || tg.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); send(1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); send(-1); }
    };
    const onMsg = e => { if (e.origin === window.location.origin && frame.current && e.source === frame.current.contentWindow && e.data && e.data.type === 'winmate:sheets') setInfo(e.data); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMsg);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('message', onMsg); };
  }, []);
  return <div className="lp-sheets">
    <div className="lp-sheets-bar">
      <p>{info ? <><b>{info.title}</b><span>{info.kind === 'rel' ? '연결된 샘플 버티컬 시나리오' : '이 구성으로 조립한 대표 업종 시나리오'} · 장 {number(info.total)}장 · ← → 로 넘기기</span></> : <span>대표 샘플 시나리오를 불러오는 중…</span>}</p>
      <a className="button" href={'/?' + new URLSearchParams({ toc: x.id, ...(info ? (info.kind === 'rel' ? { sample: info.id } : { v: info.vid }) : {}) })} target="_blank" rel="noreferrer"><Icon name="external" size={15}/>앱에서 열기</a>
    </div>
    <iframe ref={frame} title={x.name + ' 대표 샘플 시트'} src={src}/>
  </div>;
}

/* ---------- 상세 팝업 ---------- */
function Detail({ K, x, raw, limits, edit, onToggle, onFix, close, dirty, initialTab, unsaved = false, onEditFlow = null }) {
  const [tab, setTab] = useState(initialTab || (unsaved ? 'parts' : 'sheets')); // 저장 전의 직접 만든 구성은 앱이 아직 모른다 — 시트(앱 화면)는 저장한 뒤에
  const [zoomed, setZoomed] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [meta, setMeta] = useState({});
  useEffect(() => { let alive = true; const load = () => layoutMeta().then(m => alive && setMeta(m), () => {}); load(); window.addEventListener('admin:layout-library', load); return () => { alive = false; window.removeEventListener('admin:layout-library', load); }; }, []);
  const link = (o, embed) => '/?' + new URLSearchParams({ toc: x.id, [o.kind === 'rel' ? 'sample' : 'v']: o.id, ...(embed ? { embed: '1' } : {}) });
  const m = zoomed ? meta[zoomed.f] || {} : {};
  return <Modal wide close={close} title={<span className="lp-detail-t">{x.name}{x.fixed && <em className="lp-tag fixed">기본 구성</em>}{x.off && <em className="lp-tag off">꺼짐</em>}</span>} subtitle={x.desc}
    footer={<><span className="quiet"><Icon name="info" size={14}/>{dirty ? '바꾼 값은 목록의 ‘저장’을 눌러야 앱에 반영됩니다.' : x.custom ? '직접 만든 구성' : '목차 · 장 구조는 코드에서 정해집니다. 여기서는 운영 값만 바꿉니다.'}</span>
      <div className="button-row">{onEditFlow && <Button onClick={onEditFlow}>구성 고치기</Button>}<Button onClick={close}>닫기</Button></div></>}>
    <div className="lp-detail">
      <Flow K={K} tocs={x.tocs} size="sm"/>
      <div className="tabs" role="tablist">{[['sheets', '시트'], ['parts', '목차 · 레이아웃'], ['samples', '샘플 시나리오'], ['settings', '설정']].filter(([id]) => !(unsaved && id === 'sheets')).map(([id, name]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{name}</button>)}</div>
      {tab === 'sheets' && <SheetsTab x={x}/>}
      {tab === 'parts' && <PartsTab K={K} x={x} meta={meta} zoom={setZoomed}/>}
      {tab === 'samples' && <SamplesTab K={K} x={x} edit={edit} view={setViewing}/>}
      {tab === 'settings' && <SettingsTab x={x} raw={raw} limits={limits} edit={edit} onToggle={onToggle} onFix={onFix}/>}
    </div>
    {zoomed && <Overlay label={(m.name || zoomed.f) + ' 장표 미리보기'} close={() => setZoomed(null)} className="lp-zoom">
      <header><div><h3>{m.name || zoomed.f}</h3><p>{[m.code || zoomed.f, zoomed.part, zoomed.role].filter(Boolean).join(' · ')}</p></div><IconButton icon="close" label="미리보기 닫기" onClick={() => setZoomed(null)}/></header>
      <div className="lp-zoom-stage"><LayoutFrame f={zoomed.f} title={m.name || zoomed.f} thumb={false}/></div>
      {m.when && <p className="lp-zoom-when"><Icon name="info" size={14}/>{m.when}</p>}
    </Overlay>}
    {viewing && <Overlay label={viewing.title + ' 샘플 시나리오'} close={() => setViewing(null)} className="lp-viewer">
      <header><div><h3>{viewing.title}</h3><p>{x.name} · {viewing.kind === 'rel' ? '기존 샘플' : '업종별 시나리오'} · 앱의 목차 템플릿 화면 그대로 봅니다</p></div>
        <div className="button-row"><a className="button" href={link(viewing, false)} target="_blank" rel="noreferrer"><Icon name="external" size={15}/>앱에서 열기</a><IconButton icon="close" label="샘플 시나리오 닫기" onClick={() => setViewing(null)}/></div></header>
      <iframe title={viewing.title + ' 샘플 시나리오'} src={link(viewing, true)}/>
    </Overlay>}
  </Modal>;
}

/* ---------- 화면 ---------- */
export function LayoutsPage() {
  const { notify } = useApp();
  const [K, setK] = useState(null);
  const [server, setServer] = useState(null); // { presets, limits }
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // { id, tab }
  const [confirm, setConfirm] = useState(false);
  const [allParts, setAllParts] = useState(false); // '전체 파트 확인하기' 팝업
  const [builder, setBuilder] = useState(null); // 구성 추가하기 · 고치기 — { id: null(새 구성) | 'ct_…' }
  useEffect(() => {
    let alive = true;
    setError('');
    Promise.all([loadKit(), api('/layout-presets')]).then(([kit, data]) => { if (!alive) return; setK(kit); setServer(data); setDraft(pure(data.presets)); },
      e => alive && setError(e && e.message ? e.message : '레이아웃 구성을 불러오지 못했습니다.'));
    return () => { alive = false; };
  }, [attempt]);
  const view = useMemo(() => (K && draft ? buildView(K, draft) : null), [K, draft]);
  const dirty = !!(K && draft && server) && !same(normalize(draft, K), normalize(pure(server.presets), K));
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // 목록의 '레이아웃 n장' — 대표 업종 덱의 장 수(구조는 운영 값과 상관없이 같다)
  const sizes = useMemo(() => { if (!K || !view) return {}; const out = {}; for (const t of K.toc.TOC_TEMPLATES) { const d = deckOf(K, t.id, DEMO_V); out[t.id] = d ? d.total : null; } return out; }, [K, view]); // 직접 만든 구성이 바뀌면 다시
  const pageRef = useRef(null);
  useEvenSlots(pageRef, view ? Math.max(0, ...[...view.main, ...view.variants].map(x => x.tocs.length)) : 0, view);
  if (error) return <ErrorBox error={error} retry={() => setAttempt(n => n + 1)}/>;
  if (!view) return <Loading/>;

  const edit = (id, patch) => setDraft(d => ({ ...d, items: { ...d.items, [id]: { ...d.items[id], ...patch } } }));
  const toggle = (id, on) => edit(id, { enabled: on ? undefined : false });
  const fix = id => setDraft(d => ({ ...d, fixed: id }));
  // 직접 만든 구성 · 파트 — 초안에 넣고, '저장'을 누르면 앱에 반영된다
  const editTemplate = (id, patch) => setDraft(d => ({ ...d, templates: { ...d.templates, [id]: { ...d.templates[id], ...patch } } }));
  const savePart = (key, def) => {
    const id = key || newCustomId('cp_', k => !!(draft.parts || {})[k] || !!K.toc.TOCS[k]);
    setDraft(d => ({ ...d, parts: { ...d.parts, [id]: def } }));
    return id;
  };
  const deletePart = key => setDraft(d => { const parts = { ...d.parts }; delete parts[key]; return { ...d, parts }; });
  const usedBy = (key, except) => Object.entries(draft.templates || {}).filter(([id, t]) => id !== except && (t.tocs || []).includes(key)).map(([, t]) => t.name);
  const finishBuilder = def => {
    const id = builder.id || newCustomId('ct_', k => !!(draft.templates || {})[k] || !!K.toc.TPL[k]);
    setDraft(d => ({ ...d, templates: { ...d.templates, [id]: { ...(d.templates[id] || {}), ...def } } }));
    notify(builder.id ? '구성을 고쳤습니다. 저장하면 앱에 반영됩니다.' : '구성을 추가했습니다. 저장하면 앱에 반영됩니다.');
    setBuilder(null);
  };
  const deleteTemplate = id => setDraft(d => {
    const templates = { ...d.templates }; delete templates[id];
    const items = { ...d.items }; delete items[id];
    return { ...d, templates, items, order: (d.order || []).filter(x => x !== id), fixed: d.fixed === id ? null : d.fixed };
  });
  const move = (id, dir) => setDraft(d => {
    const ids = view.main.map(x => x.id); const i = ids.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return d;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return { ...d, order: ids };
  });
  async function save() {
    setBusy(true);
    try {
      const data = await api('/layout-presets', { method: 'PUT', body: JSON.stringify(normalize(draft, K)) });
      setServer(s => ({ ...s, presets: data.presets })); setDraft(pure(data.presets));
      notify('레이아웃 구성을 저장했습니다. 사용자가 앱을 새로 열면 반영됩니다.');
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    try {
      const data = await api('/layout-presets', { method: 'DELETE' });
      setServer(s => ({ ...s, presets: data.presets })); setDraft(pure(data.presets)); setConfirm(false);
      notify('모든 구성을 코드 기본값으로 되돌렸습니다.');
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  }
  const saved = server.presets;
  const savedView = normalize(pure(saved), K);
  const customized = !!(savedView.fixed || savedView.order.length || Object.keys(savedView.items).length || Object.keys(savedView.templates).length || Object.keys(savedView.parts).length);
  const fixed = view.list.find(x => x.fixed);
  const off = view.main.filter(x => x.off).length;
  const current = open && view.list.find(x => x.id === open.id);
  return <div className="lp-page" ref={pageRef}>
    <section className="panel lp-status">
      <div className="lp-status-main"><span className="lp-status-icon"><Icon name="route" size={22}/></span><div>
        <h2>추천에 쓰는 구성 {view.main.length - off}종{off > 0 && <span> · 꺼짐 {off}</span>}</h2>
        <p>기본 구성 <b>{fixed ? fixed.name : '–'}</b> · {saved.updated_at ? `마지막 변경 ${date(saved.updated_at, true)} · ${saved.updated_by || 'admin'}` : '아직 바꾼 값이 없습니다 — 코드 기본값 그대로'}</p>
      </div></div>
      <div className="button-row">
        {dirty && <span className="lp-dirty" role="status"><i/>저장하지 않은 변경</span>}
        <Button variant="ghost" disabled={busy || (!customized && !dirty)} onClick={() => setConfirm(true)}>기본값으로 되돌리기</Button>
        <Button disabled={busy || !dirty} onClick={() => setDraft(pure(saved))}>변경 취소</Button>
        <Button variant="primary" icon="check" busy={busy} disabled={!dirty} onClick={save}>저장</Button>
      </div>
    </section>
    <AllPartsButton K={K} onOpen={() => setAllParts(true)}/>
    <section className="section-block">
      <div className="section-heading"><div><h2>추천 구성 <span className="count-label">{view.main.length}</span>{view.orderEdited && <em className="lp-tag edited">순서 바꿈</em>}</h2><p>Storyboard ‘레이아웃 구성’의 추천 구성 · 전체 구성 보기에 이 순서로 나옵니다. 첫 칸은 기본 구성, 나머지 세 칸은 모델이 켜진 구성 중에서 고릅니다.</p></div>
        <AddCompositionButton onClick={() => setBuilder({ id: null })}/></div>
      <div className="lp-rows">{view.main.map((x, i) => <Row key={x.id} K={K} x={x} index={i} count={view.main.length} layouts={sizes[x.id]}
        onMove={dir => move(x.id, dir)} onToggle={on => toggle(x.id, on)} onFix={() => fix(x.id)} onOpen={() => setOpen({ id: x.id })}
        {...(x.custom ? { onEdit: () => setBuilder({ id: x.id }), onDelete: () => deleteTemplate(x.id) } : {})}/>)}</div>
    </section>
    {view.variants.length > 0 && <section className="section-block">
      <div className="section-heading"><div><h2>자동으로 쓰이는 변형 <span className="count-label">{view.variants.length}</span></h2><p>다른 구성에 ‘구독 상품 제안’ 파트만 더한 구성입니다. 고객 요구에 구독 · 렌탈 · 월 납부가 있으면 자동으로 쓰이며, 글과 연결 샘플만 바꿀 수 있습니다.</p></div></div>
      <div className="lp-rows">{view.variants.map((x, i) => <Row key={x.id} K={K} x={x} index={i} count={view.variants.length} layouts={sizes[x.id]} onOpen={() => setOpen({ id: x.id })}/>)}</div>
    </section>}
    <div className="info-strip"><Icon name="info" size={17}/><p>여기서 바꾼 값은 관리 DB가 아니라 실제 앱에 반영됩니다. 저장한 뒤 사용자가 앱을 새로 열면 적용되고, 이미 받은 추천은 다시 받습니다. 목차 흐름과 장 구조는 코드(목차 템플릿)에서 정해집니다.</p></div>
    {current && <Detail key={current.id} K={K} x={{ ...current, baseName: current.base ? (view.list.find(o => o.id === current.base) || {}).name : '' }} raw={(current.custom ? draft.templates[current.id] : draft.items[current.id]) || {}} limits={server.limits} dirty={dirty} initialTab={open.tab}
      edit={patch => (current.custom ? editTemplate(current.id, patch) : edit(current.id, patch))} onToggle={on => toggle(current.id, on)} onFix={() => fix(current.id)} close={() => setOpen(null)}
      unsaved={current.custom && !(saved.templates || {})[current.id]} onEditFlow={current.custom ? () => { setOpen(null); setBuilder({ id: current.id }); } : null}/>}
    {builder && <CompositionBuilder K={K} parts={draft.parts || {}} initial={builder.id ? { id: builder.id, ...draft.templates[builder.id] } : null}
      takenNames={view.list.filter(x => x.id !== builder.id).map(x => x.name)} usedBy={key => usedBy(key, builder.id)}
      onSavePart={savePart} onDeletePart={deletePart} onDone={finishBuilder} close={() => setBuilder(null)}/>}
    {allParts && <AllParts K={K} close={() => setAllParts(false)}/>}
    {confirm && <Modal title="기본값으로 되돌릴까요?" subtitle="끈 구성 · 순서 · 기본 구성 · 고친 글 · 연결 샘플을 모두 코드에 적힌 값으로 되돌리고, 직접 만든 구성 · 파트를 지웁니다." close={() => setConfirm(false)}
      footer={<><span className="quiet"><Icon name="info" size={14}/>되돌린 값도 사용자가 앱을 새로 열면 반영됩니다.</span><div className="button-row"><Button onClick={() => setConfirm(false)}>취소</Button><Button variant="danger" busy={busy} onClick={reset}>기본값으로 되돌리기</Button></div></>}>
      <p className="lp-confirm">저장하지 않은 변경도 함께 사라집니다. 되돌린 뒤에는 다시 설정해야 합니다.</p>
    </Modal>}
  </div>;
}
