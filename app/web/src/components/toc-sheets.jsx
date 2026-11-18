import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, partHue } from './common.jsx';
import { partIcon } from './parteditor.jsx';
import { useFitWidth } from './sheetview.jsx';
import { Slide } from '../domain/slides/Slide.jsx';
import { SC, slidesOfScenario } from '../domain/templates/scenarios.js';
import { ovOf, partTypeOf } from '../domain/templates/scenario_storyboard.js';
import { TOCS, tocName, ensureTocScenario, tocVerticals } from '../domain/templates/toc_templates.js';
import '../styles/toc-sheets.css';

/* =========================================================
   구성 하나의 대표 샘플 덱을 시트로만 본다 — /?toc=<구성 id>&embed=sheets
   관리자 「레이아웃 구성 관리」 구성 상세 팝업이 iframe 으로 연다.
   왼쪽: 전체 장 썸네일 세로 목록(장마다 그 장이 속한 파트 아이콘) · 오른쪽: 큰 장 · ← → (↑ ↓) 로 넘긴다.
   부모 창이 { type: 'winmate:sheets-step', d: ±1 } 를 보내면 넘기고, 덱을 고르면 { type: 'winmate:sheets', … } 를 알린다.
   ========================================================= */
export const DEMO_V = 'fb_qsr'; // 목차 템플릿 화면과 같은 대표 업종
const isDeck = (g) => !!g.deck || g.key === 'open';
const stageLabel = (name) => String(name || '').replace(/^(목차 · )?\d{2}\s+/, '');
const typesOf = (t) => t.tocs.map((k) => (TOCS[k] ? TOCS[k].type : 'free')).join();

/** 이 구성의 대표 샘플 덱 — 반드시 구성과 같은 파트 구성(파트 유형 · 순서)인 덱만.
 *  1) 연결된 기존 샘플 버티컬 시나리오 중 파트 구성이 꼭 같은 첫 덱 → 2) 없으면 이 구성으로 조립한 대표 업종 덱(구성 그대로 조립되므로 늘 같다) */
export function representativeDeck(t) {
  const want = typesOf(t);
  for (const id of t.related || []) {
    const s = SC[id]; if (!s || s.toc) continue;
    const body = s.flow.filter((g) => !isDeck(g));
    if (body.length && body.map((g) => partTypeOf(g, s.id)).join() === want) return { kind: 'rel', id };
  }
  return { kind: 'ind', id: DEMO_V };
}
/** 고른 덱의 시나리오 — 대표 업종 덱을 못 만들면 다른 업종 차례로 */
function deckFor(t, sel) {
  if (sel.kind === 'rel') return { sel, s: SC[sel.id] || null };
  let s = ensureTocScenario(t.id, sel.id);
  if (s) return { sel, s };
  for (const v of tocVerticals()) { s = ensureTocScenario(t.id, v.id); if (s) return { sel: { kind: 'ind', id: v.id }, s }; }
  return { sel, s: null };
}

export function TocSheets({ t, ready, start = null }) {
  const { sel, s } = useMemo(() => (ready ? deckFor(t, start || representativeDeck(t)) : { sel: null, s: null }), [ready, t.id]);
  const v = sel && sel.kind === 'ind' ? tocVerticals().find((x) => x.id === sel.id) : null;
  // 장마다 그 장이 속한 파트 — 표지 · 목차는 '표지' 파트, 나머지는 구성의 목차 순서대로
  const items = useMemo(() => {
    if (!s) return [];
    const out = []; let no = 0; let k = 0;
    for (const g of s.flow) {
      let part;
      if (isDeck(g)) part = { type: 'cover', name: g.slides.length > 1 ? '표지 · 목차' : '표지', no: 0 };
      else {
        no += 1;
        const key = sel.kind === 'ind' ? t.tocs[no - 1] : null;
        part = key && TOCS[key] ? { type: TOCS[key].type, name: tocName(key, v ? v.short : null), no } : { type: partTypeOf(g, s.id), name: stageLabel(g.name), no };
      }
      for (const x of g.slides) { out.push({ f: x.f, ov: ovOf(s.id, k, x.f), role: x.role, page: k + 1, part }); k += 1; }
    }
    return out;
  }, [s && s.id]);
  const [ci, setCi] = useState(0);
  const cur = items[Math.min(ci, items.length - 1)] || null;
  const step = (d) => setCi((i) => Math.max(0, Math.min(items.length - 1, i + d)));
  const stepRef = useRef(step); stepRef.current = step;
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); stepRef.current(1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); stepRef.current(-1); }
    };
    const onMsg = (e) => { if (e.origin === window.location.origin && e.data && e.data.type === 'winmate:sheets-step') stepRef.current(e.data.d > 0 ? 1 : -1); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMsg);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('message', onMsg); };
  }, []);
  useEffect(() => { // 부모 창(관리자)에 어떤 덱을 보여 주는지 알린다
    if (!s || window.parent === window) return;
    window.parent.postMessage({ type: 'winmate:sheets', toc: t.id, id: s.id, kind: sel.kind, vid: sel.kind === 'ind' ? sel.id : null, title: s.title, vertical: v ? v.nm : '', total: items.length }, window.location.origin);
  }, [s && s.id]);
  const rail = useRef(null);
  useEffect(() => { // 고른 장이 목록 안에 보이게 — 목록만 굴린다
    const r = rail.current; const el = r && r.querySelector('[aria-current="true"]'); if (!el) return;
    const rr = r.getBoundingClientRect(); const e = el.getBoundingClientRect();
    if (e.top < rr.top) r.scrollTop -= rr.top - e.top + 8; else if (e.bottom > rr.bottom) r.scrollTop += e.bottom - rr.bottom + 8;
  }, [ci, s && s.id]);
  const fit = useRef(null);
  const bw = useFitWidth(fit, 16 / 9);
  if (ready && !s) return <div className="tsx"><p className="tsx-empty">이 구성의 샘플 덱을 만들지 못했어요.</p></div>;
  return (
    <div className="tsx" aria-label={(s ? s.title : t.name) + ' 시트'}>
      <nav className="tsx-rail" ref={rail} aria-label="장 목록">
        {!s && <p className="faint tsx-wait">장을 불러오는 중…</p>}
        {items.map((x, i) => {
          const first = i === 0 || items[i - 1].part !== x.part;
          return (
            <button key={i} type="button" className={'vthumb tsx-th' + (first ? ' first' : '')} aria-current={cur === x} onClick={() => setCi(i)}
              aria-label={`${x.page}쪽 · ${x.part.name} · ${x.role}`} title={x.part.name}>
              <Slide f={x.f} ov={x.ov} width={188} lazy pageNo={x.page} />
              <span className={'tsx-pi ' + partHue(x.part.type)} aria-hidden="true"><Icon name={partIcon({ type: x.part.type, name: x.part.name })} size={13} stroke={2.2} /></span>
              <span className="no">{x.page}</span>
            </button>
          );
        })}
      </nav>
      <div className="tsx-stage">
        <div className={'vinfo tsx-info ' + (cur ? partHue(cur.part.type) : 'h-slate')}>
          {cur && <span className="pt"><Icon name={partIcon({ type: cur.part.type, name: cur.part.name })} size={13} stroke={2.2} />{cur.part.no ? String(cur.part.no).padStart(2, '0') + ' ' : ''}{cur.part.name}</span>}
          {cur && <span className="nm">{cur.role}</span>}
        </div>
        <div className="tsx-fit" ref={fit}>
          {cur && bw > 0 && <Slide key={(s ? s.id : '') + ':' + ci} f={cur.f} ov={cur.ov} pageNo={cur.page} width={bw} />}
        </div>
        <div className="vnav tsx-nav">
          <button className="btn btn-sm btn-icon" disabled={ci <= 0} onClick={() => step(-1)} aria-label="이전 장"><Icon name="chevL" size={15} /></button>
          <span className="num tsx-pg">{cur ? `${cur.page} / ${items.length}` : '–'}</span>
          <button className="btn btn-sm btn-icon" disabled={ci >= items.length - 1} onClick={() => step(1)} aria-label="다음 장"><Icon name="chev" size={15} /></button>
        </div>
      </div>
    </div>
  );
}
