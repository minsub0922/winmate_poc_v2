import {FeedbackPopup} from './feedback-popup.jsx';
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './common.jsx';
import { criteriaForReview, band } from '../domain/review/criteria.js';
import { criterionShortNames } from '../domain/review/criteria-short.js';
import { Slide } from '../domain/slides/Slide.jsx';
import { useStore } from '../repositories/proposals.js';
import { proposalReviewUnits, reviewProposalId } from '../domain/review/linked-slides.js';

export function useReviewDeck(review, doc) {
  const id = reviewProposalId(review);
  const proposal = useStore(s => id ? s.proposals.find(p => p.id === id) || s.shared?.[id] || null : null);
  const units = useMemo(() => proposal ? proposalReviewUnits(proposal) : review.units || [], [proposal, review.units]);
  const scoredSource = doc?.source?.type === 'proposal' ? doc.source.id : review.settings?.linkedId;
  const scoreSourceMatches = !proposal || !scoredSource || proposal.id === scoredSource;
  return { proposal, proposalId: id, units, doc, scoreSourceMatches };
}

const HIDDEN = { left: 12, top: 12, visibility: 'hidden' };

// Hover cards also open on keyboard focus and tap. The pointer can move into the card.
// A card never covers what it describes: it goes beside its anchor, or, with `keepClear`
// (a selector of an ancestor such as the sheet rail), above or below that whole row so the
// pointer can keep moving along it. `fitWidth(height)` caps the width a given height can use.
export function ReviewHover({ label, children, content, className = '', panelClassName = '', onActivate, as = 'button', outsideChart = false, preferredSide = 'right', keepClear, fitWidth, ...props }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(HIDDEN);
  const anchor = useRef(null), panel = useRef(null), timer = useRef(null);
  const natural = useRef(null), constrained = useRef(false), fit = useRef(fitWidth);
  fit.current = fitWidth;
  const id = useId();
  const chartOf = () => outsideChart ? anchor.current?.closest('.rv-radar') : null;
  const show = () => {
    clearTimeout(timer.current);
    document.dispatchEvent(new CustomEvent('winmate-review-hover-open', { detail: id }));
    setOpen(true);
  };
  const hide = event => {
    if (outsideChart && (anchor.current?.contains(document.activeElement) || panel.current?.contains(document.activeElement))) return;
    if (outsideChart && (chartOf()?.contains(event?.relatedTarget) || panel.current?.contains(event?.relatedTarget))) return;
    clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 160);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // Each opening is measured afresh at the card's own CSS size.
  useLayoutEffect(() => { if (!open) { natural.current = null; constrained.current = false; setPosition(HIDDEN); } }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!anchor.current || !panel.current) return;
      const a = anchor.current.getBoundingClientRect(), b = panel.current.getBoundingClientRect();
      const chart = chartOf();
      if (chart) {
        const c = chart.getBoundingClientRect(), edge = 12, gap = 12;
        const space = { left: c.left - edge - gap, right: window.innerWidth - edge - gap - c.right };
        const other = preferredSide === 'right' ? 'left' : 'right';
        const side = space[preferredSide] >= 280 ? preferredSide : space[other] >= 280 ? other : null;
        if (side) {
          const width = Math.min(420, space[side]);
          setPosition({ inline: false, left: side === 'right' ? c.right + gap : c.left - gap - width,
            top: Math.max(edge, Math.min(a.top + a.height / 2 - b.height / 2, window.innerHeight - b.height - edge)),
            width, maxHeight: Math.min(640, window.innerHeight - edge * 2), visibility: 'visible' });
        } else {
          // A narrow viewport cannot fit a useful overlay beside the chart. Reserve
          // actual document space below it so the chart is never covered.
          setPosition({ inline: true, position: 'relative', left: 0, top: 0, width: '100%', maxHeight: Math.min(480, window.innerHeight * .6), visibility: 'visible' });
        }
        return;
      }
      const edge = 12, gap = 10, W = document.documentElement.clientWidth, H = document.documentElement.clientHeight;
      // Natural size: what the card takes before this code narrows or shortens it.
      if (!constrained.current || !natural.current) natural.current = { w: b.width, h: b.height };
      const nat = natural.current;
      const room = (r, s) => s === 'below' ? { w: W - 2 * edge, h: H - edge - gap - r.bottom } : s === 'above' ? { w: W - 2 * edge, h: r.top - gap - edge }
        : s === 'right' ? { w: W - edge - gap - r.right, h: H - 2 * edge } : { w: r.left - gap - edge, h: H - 2 * edge };
      const option = (r, s) => { const space = room(r, s); return { r, s, space, w: Math.max(0, Math.min(nat.w, space.w, fit.current ? fit.current(space.h) : Infinity)), h: Math.max(0, Math.min(nat.h, space.h)) }; };
      const area = o => o.w * o.h;
      let pick = null;
      const row = keepClear && anchor.current.closest(keepClear)?.getBoundingClientRect();
      if (row) {
        const best = ['below', 'above'].map(s => option(row, s)).sort((x, y) => area(y) - area(x))[0];
        if (best.w >= Math.min(nat.w, Math.max(320, a.width))) pick = best;
      }
      if (!pick) {
        const all = ['below', 'above', 'right', 'left'].map(s => option(a, s));
        pick = all.find(o => o.w >= nat.w - .5 && o.space.h >= nat.h - .5)
          || all.filter(o => o.w >= 240 && o.h >= 120).sort((x, y) => area(y) - area(x))[0]
          || all.sort((x, y) => y.space.h - x.space.h)[0];
      }
      const width = pick.w < nat.w - .5 ? Math.floor(pick.w) : undefined;
      constrained.current = width != null || pick.space.h < nat.h - .5;
      const pw = width ?? nat.w, ph = Math.min(b.height, pick.space.h);
      const next = { width, maxHeight: pick.space.h < nat.h - .5 ? Math.max(120, Math.floor(pick.space.h)) : undefined, visibility: 'visible' };
      if (pick.s === 'below' || pick.s === 'above') {
        next.left = Math.max(edge, Math.min(a.left + a.width / 2 - pw / 2, W - edge - pw));
        if (pick.s === 'below') next.top = pick.r.bottom + gap;
        else { next.top = 'auto'; next.bottom = H - pick.r.top + gap; }
      } else {
        next.left = pick.s === 'right' ? pick.r.right + gap : pick.r.left - gap - pw;
        next.top = Math.max(edge, Math.min(a.top + a.height / 2 - ph / 2, H - edge - ph));
      }
      setPosition(next);
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(panel.current);
    const chart = chartOf();
    if (chart) observer.observe(chart);
    const activate = e => { if (e.detail !== id) { clearTimeout(timer.current); setOpen(false); } };
    document.addEventListener('winmate-review-hover-open', activate);
    chart?.addEventListener('mouseleave', hide);
    const key = e => { if (e.key === 'Escape') { clearTimeout(timer.current); setOpen(false); } };
    const outside = e => { if (!anchor.current?.contains(e.target) && !panel.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true); document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    return () => { observer.disconnect(); document.removeEventListener('winmate-review-hover-open', activate); chart?.removeEventListener('mouseleave', hide); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [open, outsideChart, preferredSide, keepClear, position.inline]);
  const blur = e => { if (!panel.current?.contains(e.relatedTarget) && !anchor.current?.contains(e.relatedTarget)) hide(); };
  const { inline, ...panelStyle } = position;
  const host = inline ? anchor.current?.closest('.rv-score-cat')?.querySelector('.rv-radar-detail-slot') : null;
  return <>
    {React.createElement(as, {
      ...props, ref: anchor, className, ...(as === 'button' ? { type: 'button' } : { role: 'button', tabIndex: 0 }),
      'aria-label': label, 'aria-expanded': open, 'aria-controls': open ? id : undefined,
      onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: blur,
      onClick: onActivate ? () => { clearTimeout(timer.current); setOpen(false); onActivate(); } : show,
      onKeyDown: e => { if (as !== 'button' && ['Enter', ' '].includes(e.key)) { e.preventDefault(); show(); } },
    }, children)}
    {open && createPortal(<div id={id} ref={panel} className={'rv-hover ' + panelClassName + (outsideChart ? ' rv-hover-outside' : '') + (inline ? ' rv-hover-inline' : '')} role="region" aria-label={label + ' 상세'} style={panelStyle}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={blur}>{content}</div>, host || document.body)}
  </>;
}

export function CriterionDetail({ criterion, selected, result, ul, onUnit }) {
  const x = result;
  return <div className="rv-criterion-detail">
    <div className="rv-hover-head"><span className="rv-eyebrow">{criterion.id} · 중요도 {criterion.w}</span><strong className={'rv-point-score b-' + band(x?.score).k}>{x?.score == null ? '미평가' : x.score + '점'}</strong></div>
    <h4>{criterion.name}</h4><p className="muted">{criterion.desc}</p>
    {x ? <><div><b>평가 근거</b><p>{x.reason || '기록된 설명이 없습니다.'}</p></div>
      {x.checkpoints?.length > 0 && <CheckpointScores points={x.checkpoints} />}
      {x.fix && <div className="rv-hover-fix"><b>고칠 방법</b><p>{x.fix}</p></div>}
      {(x.evidence || []).map((e, i) => <div className="rv-hover-evidence" key={i}><button type="button" className="rv-uchip" onClick={() => onUnit(e.unit)}>{e.unit}{ul}</button><span>“{e.quote}”</span></div>)}
      {(x.notes || []).length > 0 && <ul>{x.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </> : <p>{selected?.why || '이 제안서에 적용하지 않은 기준입니다.'}</p>}
    {selected?.why && x && <small className="faint">적용 이유 · {selected.why}</small>}
  </div>;
}

const LEVEL_NAMES = ['미충족', '언급', '구체화', '근거 충족', '교차 검증'];
export function CheckpointScores({ points }) {
  return <ul className="rv-checkpoint-scores">{points.map(p => <li key={p.id}>
    <header><b>{p.name}</b><span className={'num b-' + band(p.points ?? p.level * 25).k}>{p.level}/4 · {p.points ?? p.level * 25}점</span></header>
    <small>{p.level_name || LEVEL_NAMES[p.level]} · {p.reason}</small>
    {p.verification && <p className="rv-checkpoint-verification">확인: {p.verification}</p>}
  </li>)}</ul>;
}

export function ReviewSlideScores({ review, n, compact = false, sourceMatches = true }) {
  const { CR } = criteriaForReview(review);
  const items = sourceMatches ? Object.entries(review.results || {}).filter(([id, x]) => CR[id] && x.score != null && (x.evidence?.some(e => e.unit === n) || x.checkpoints?.some(p => p.evidence?.some(e => e.unit === n)))).sort((a, b) => a[1].score - b[1].score) : [];
  const geo = sourceMatches ? (review.geom || []).filter(g => g.u === n) : [];
  return <section className={'rv-slide-scores' + (compact ? ' compact' : '')} aria-label={`${n}장 연결 세부 평가 점수`}>
    <header><h3>세부 평가 점수</h3><span>{items.length}개 연결 항목</span></header>
    <p className="rv-slide-score-note">{sourceMatches ? '이 장이 근거로 연결된 평가 시점의 항목입니다. 항목 점수는 제안서 전체 평가 점수입니다.' : '현재 연결된 제안서가 평가 원본과 달라 장별 점수 연결을 표시하지 않습니다.'}</p>
    {items.map(([id, x]) => {
      const points = x.checkpoints?.filter(p => p.evidence?.some(e => e.unit === n)) || [];
      return <article className="rv-slide-score-item" key={id}>
        <header><h4>{CR[id].name}</h4><strong className={'num b-' + band(x.score).k}>{x.score}<small>/100</small></strong></header>
        {points.length ? <CheckpointScores points={points} /> : <p>{x.reason}</p>}
        {!compact && <>{(x.evidence || []).filter(e => e.unit === n).map((e, i) => <blockquote key={i}>“{e.quote}”</blockquote>)}{x.fix && <p className="rv-page-fix">{x.fix}</p>}</>}
      </article>;
    })}
    {!items.length && sourceMatches && <p className="muted rv-slide-score-empty">이 장에 연결된 평가 근거가 없습니다.</p>}
    {geo.length > 0 && <div className="rv-slide-measurements"><b>화면 측정 참고</b><ul>{geo.map((g, i) => <li key={i}>{g.note}</li>)}</ul></div>}
  </section>;
}

const points = list => list.map(p => p.join(',')).join(' ');
// Axis labels are short criterion names (criteria-short.js); the hover card keeps the full name.
const LABEL = { font: 14, line: 17, gap: 9, edge: 4, minRadius: 34, maxRadius: 116 };
let textCanvas;
const textWidth = (text, family) => {
  textCanvas ||= document.createElement('canvas').getContext('2d');
  if (!textCanvas) return [...text].reduce((n, c) => n + (c.charCodeAt(0) < 256 ? .62 : 1.02), 0) * LABEL.font;
  textCanvas.font = `800 ${LABEL.font}px ${family}`; // hover weight, so the label never grows past its box
  return textCanvas.measureText(text).width;
};
// One line, or two balanced lines split at a space or after a middle dot.
const twoLines = text => {
  const parts = text.split(/(?<=·)|\s+/).filter(Boolean);
  if (parts.length < 2) return [text];
  let best = null;
  for (let i = 1; i < parts.length; i++) {
    const a = parts.slice(0, i).join(' ').replaceAll('· ', '·'), b = parts.slice(i).join(' ').replaceAll('· ', '·');
    const size = s => [...s.replace(/[\s·]/g, '')].length, worst = Math.max(size(a), size(b));
    if (Math.min(size(a), size(b)) < 2) continue; // never strand one character on a line
    if (!best || worst < best.worst) best = { lines: [a, b], worst };
  }
  return best ? best.lines : [text];
};
const axis = (i, n) => { const a = i / n * Math.PI * 2 - Math.PI / 2; return { ux: Math.cos(a), uy: Math.sin(a) }; };
// Side labels sit beside their vertex; top and bottom labels sit centred above or below it.
const side = ux => ux > .2 ? 'start' : ux < -.2 ? 'end' : 'middle';
// Label box around its anchor point (x, y) = vertex pushed out by the label gap.
const labelBox = (ux, uy, x, y, w, h) => {
  const anchor = side(ux), x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const y0 = anchor !== 'middle' ? y - h / 2 : uy < 0 ? y - h : y;
  return { x0, x1: x0 + w, y0, y1: y0 + h };
};
// Shared geometry for every category chart of one rubric, so radii and heights match across the row.
// Tries one-line labels and labels wrapped beside their vertex, and keeps whichever fits a larger chart.
function radarGeometry(sets, width, family) {
  const half = width / 2 - LABEL.edge;
  const fit = wrap => {
    const boxes = sets.map(labels => labels.map((text, i) => {
      const { ux } = axis(i, labels.length), lines = wrap && side(ux) !== 'middle' ? twoLines(text) : [text];
      return { w: Math.max(...lines.map(l => textWidth(l, family))) + 2, h: lines.length * LABEL.line };
    }));
    let radius = Math.min(LABEL.maxRadius, half - 6);
    for (const set of boxes) set.forEach((box, i) => {
      const { ux } = axis(i, set.length), abs = Math.abs(ux);
      const room = side(ux) === 'middle' ? half - box.w / 2 : half - box.w;
      if (abs > .001) radius = Math.min(radius, room / abs - LABEL.gap);
    });
    radius = Math.max(LABEL.minRadius, radius);
    let top = radius + 8, bottom = radius + 8, clear = true;
    for (const set of boxes) {
      const rects = set.map((box, i) => {
        const { ux, uy } = axis(i, set.length), d = radius + LABEL.gap;
        const r = labelBox(ux, uy, ux * d, uy * d, box.w, box.h);
        top = Math.max(top, -r.y0); bottom = Math.max(bottom, r.y1);
        return r;
      });
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -2) clear = false;
      }
    }
    return { wrap, radius, clear, top: top + LABEL.edge, height: top + bottom + LABEL.edge * 2 };
  };
  const single = fit(false), wrapped = fit(true);
  return wrapped.clear && (!single.clear || wrapped.radius > single.radius + 6) ? wrapped : single;
}
function useRadarFrame() {
  const frame = useRef(null), [width, setWidth] = useState(0), [family, setFamily] = useState(''), [fonts, setFonts] = useState(0);
  useLayoutEffect(() => {
    const measure = () => { if (frame.current?.clientWidth) setWidth(frame.current.clientWidth); };
    setFamily(getComputedStyle(frame.current).fontFamily || 'sans-serif');
    const ro = new ResizeObserver(measure); ro.observe(frame.current); measure();
    // Web fonts change label widths once they load.
    let live = true; document.fonts?.ready.then(() => { if (live) setFonts(n => n + 1); });
    return () => { live = false; ro.disconnect(); };
  }, []);
  return [frame, width, family, fonts];
}
function ReviewRadarPlot({ criteria, short, sets, results, detail, category }) {
  const [frame, width, family, fonts] = useRadarFrame();
  const geometry = useMemo(() => width && family ? radarGeometry(sets, width, family) : null, [sets, width, family, fonts]);
  if (!geometry) return <div ref={frame} className="rv-radar-frame" />;
  const { radius, top: cy, height, wrap } = geometry, cx = width / 2, n = criteria.length;
  const at = (i, r) => { const { ux, uy } = axis(i, n); return [cx + ux * r, cy + uy * r]; };
  const scoreAt = (i, score) => at(i, Math.max(0, Math.min(100, score)) / 100 * radius);
  const plotted = criteria.map((c, i) => results[c.id]?.score == null ? null : scoreAt(i, results[c.id].score)).filter(Boolean);
  return <div ref={frame} className="rv-radar-frame"><svg className="rv-radar" viewBox={`0 0 ${width} ${height}`} style={{ height }} role="group" aria-label={category.name + ' 기준별 스파이더 차트'}>
    {[25, 50, 75, 100].map(v => <polygon key={v} className="rv-radar-ring" points={points(criteria.map((_, i) => at(i, v / 100 * radius)))} />)}
    {criteria.map((c, i) => { const p = at(i, radius); return <line className="rv-radar-axis" key={c.id} x1={cx} y1={cy} x2={p[0]} y2={p[1]} />; })}
    {plotted.length >= 3 ? <polygon className="rv-radar-value" points={points(plotted)} /> : plotted.length === 2 ? <polyline className="rv-radar-value" fill="none" points={points(plotted)} /> : null}
    {(radius >= 70 ? [25, 50] : [50]).map(v => <text key={v} className="rv-radar-tick" x={cx + 4} y={cy - v / 100 * radius - 3}>{v}</text>)}
    {criteria.map((c, i) => {
      const value = results[c.id]?.score, p = value == null ? at(i, radius) : scoreAt(i, value);
      const { ux, uy } = axis(i, n), anchor = side(ux), [lx, ly] = at(i, radius + LABEL.gap);
      const lines = wrap && anchor !== 'middle' ? twoLines(short[c.id]) : [short[c.id]];
      const topY = labelBox(ux, uy, lx, ly, 0, lines.length * LABEL.line).y0;
      return <ReviewHover key={c.id} as="g" outsideChart preferredSide={ux < -.2 ? 'left' : 'right'} label={`${c.name} ${value == null ? '미평가' : value + '점'}`} className={'rv-radar-target' + (value == null ? ' unscored' : '')} content={detail(c)}>
        <circle cx={p[0]} cy={p[1]} r="12" fill="transparent" /><circle className="rv-radar-dot" cx={p[0]} cy={p[1]} r="4" />
        <text textAnchor={anchor} dominantBaseline="central" className="rv-radar-label">{lines.map((line, k) => <tspan key={k} x={lx} y={topY + LABEL.line * (k + .5)}>{line}</tspan>)}</text>
      </ReviewHover>;
    })}
  </svg></div>;
}
// Category scores of the overview, each with the spider chart of its criteria below it.
export function ReviewCategoryScores({ review, scores, onUnit }) {
  const { CATS, CRITERIA } = criteriaForReview(review);
  const results = review.results || {};
  const short = useMemo(() => criterionShortNames(CRITERIA), [CRITERIA]);
  const sets = useMemo(() => CATS.map(cat => CRITERIA.filter(c => c.cat === cat.id).map(c => short[c.id])), [CATS, CRITERIA, short]);
  return <>
    <dl className="rv-score-summary" aria-label="영역별 점수와 기준별 평가" style={{ '--review-columns': Math.min(4, CATS.length) }}>{CATS.map(cat => {
      const criteria = CRITERIA.filter(c => c.cat === cat.id), score = scores[cat.id];
      const assessed = criteria.filter(c => results[c.id]?.score != null).length;
      const detail = c => <CriterionDetail criterion={c} selected={review.sel.find(s => s.id === c.id)} result={results[c.id]} ul={review.unitLabel || '장'} onUnit={onUnit} />;
      return <div className="rv-score-cat" key={cat.id}>
        <dt><Icon name={cat.icon} size={14} /><span>{cat.name}</span></dt>
        <dd className={'rv-score-value b-' + band(score).k}><b className="num">{score ?? '—'}</b><small>{score == null ? '미평가' : '/ 100'}</small><span className="rv-score-assessed">{assessed}/{criteria.length}개 기준 평가</span></dd>
        <dd className="rv-score-chart"><ReviewRadarPlot criteria={criteria} short={short} sets={sets} results={results} detail={detail} category={cat} /><div className="rv-radar-detail-slot" /></dd>
      </div>;
    })}</dl>
    <p className="rv-chart-note">바깥쪽일수록 높은 점수입니다. 꼭짓점에 마우스를 올리면 기준 전체 이름과 근거를 볼 수 있고, 빈 점은 미평가 기준으로 0점으로 계산하지 않습니다.</p>
  </>;
}

export function useReviewAssets(doc) {
  const [assets, setAssets] = useState({ source: null, images: {}, pages: {} });
  useEffect(() => {
    const urls = [], images = {}, pages = {};
    const make = blob => { const url = URL.createObjectURL(blob); urls.push(url); return url; };
    for (const im of doc?.previewImages || []) if (im.blob instanceof Blob) images[im.id] = make(im.blob);
    for (const im of doc?.images || []) if (im.blob instanceof Blob) pages[im.n] = make(im.blob);
    setAssets({ source: doc, images, pages });
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [doc]);
  return assets.source === doc ? assets : { images: {}, pages: {} };
}

// Width ÷ height of how ReviewPreview shows a unit.
export function previewAspect(doc, unit, assets) {
  const layout = unit?.layout, image = !layout && (assets.pages[unit?.n] || unit?.thumb), html = !layout && unit?.previewHtml;
  return layout || (html && !image) ? 16 / 9 : doc?.aspect || 16 / 9;
}

export function ReviewPreview({ doc, unit, assets, title }) {
  const ref = useRef(null), [width, setWidth] = useState(0);
  useLayoutEffect(() => { if (!ref.current) return; const measure = () => setWidth(ref.current.clientWidth); const ro = new ResizeObserver(measure); ro.observe(ref.current); measure(); return () => ro.disconnect(); }, []);
  const layout = unit?.layout;
  const image = !layout && (assets.pages[unit?.n] || unit?.thumb);
  const html = !layout && unit?.previewHtml;
  // The page is laid out once at 1280×720 and the frame itself is scaled, so resizing
  // (a dragged divider, a narrower window) does not reload the document.
  const source = useMemo(() => {
    if (!html) return '';
    const body = html.replace(/wmimg:([\w-]+)/g, (m, id) => assets.images[id] || '');
    return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${location.origin}/fonts/fonts.css"><style>html,body{margin:0;padding:0;overflow:hidden;background:white;color-scheme:light}*{box-sizing:border-box}.review-canvas{width:1280px;height:720px}</style></head><body><div class="review-canvas">${body}</div></body></html>`;
  }, [html, assets.images]);
  return <div ref={ref} className="rv-original-preview" style={{ aspectRatio: String(previewAspect(doc, unit, assets)) }}>
    {layout ? width > 0 && <Slide f={layout.f} ov={layout.ov} width={width} pageNo={layout.pageNo} lazy />
      : image ? <img src={image} alt={title} loading="lazy" /> : html ? width > 0 && <iframe title={title} srcDoc={source} sandbox="allow-same-origin" loading="lazy" tabIndex={-1} style={{ width: 1280, height: 720, transform: `scale(${width / 1280})`, transformOrigin: '0 0' }} />
      : doc?.slides === false && unit?.text ? <pre className="rv-original-text">{unit.text}</pre>
      : <span className="rv-original-missing"><Icon name="file" size={24} /><b>원본 화면이 저장되지 않았어요</b><span>{unit?.text ? '원본을 연결하면 실제 장표를 볼 수 있어요' : '원본 PPTX 또는 PDF를 연결해 주세요'}</span></span>}
  </div>;
}

export function ReviewSlides({ review, doc, deck, assets, perUnit, onUnit, onAttach, attaching, onLink }) {
  const rail = useRef(null), file = useRef(null);
  const proposals = useStore(s => s.proposals);
  const ul = deck.proposal ? '장' : review.unitLabel || '장';
  const units = deck.units;
  const visual = !deck.proposal && ['pptx', 'pdf'].includes(review.kind);
  const missing = visual && (!doc || units.some(u => { const d = doc.units?.find(x => x.n === u.n); return !d?.previewHtml && !d?.thumb && !assets.pages[u.n]; }));
  const scroll = direction => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * .8, behavior: 'smooth' });
  return <section className="rv-card rv-deck" aria-label={ul + '별 보기'}>
    <div className="rv-card-h"><div><span className="rv-eyebrow">PROPOSAL</span><h3>{ul}별 보기 <span className="rv-count num">{units.length}</span></h3></div><div className="rv-deck-actions">
      {proposals.length > 0 && <label className="rv-deck-link"><span>연결 제안서</span><select className="select" aria-label="장표를 보여줄 제안서" value={deck.proposal?.id || ''} onChange={e => onLink(e.target.value)}>
        <option value="" disabled>제안서 선택</option>
        {deck.proposal && !proposals.some(p => p.id === deck.proposal.id) && <option value={deck.proposal.id}>{deck.proposal.title}</option>}
        {proposals.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select></label>}
      {visual && <button type="button" className="btn btn-sm btn-ghost" disabled={attaching} onClick={() => file.current.click()}><Icon name="clip" size={14} />{attaching ? '화면 연결 중…' : missing ? '원본 연결' : '원본 다시 연결'}</button>}
      <button type="button" className="btn btn-sm btn-icon" aria-label="장표 목록 이전" onClick={() => scroll(-1)}><Icon name="chevL" size={16} /></button><button type="button" className="btn btn-sm btn-icon" aria-label="장표 목록 다음" onClick={() => scroll(1)}><Icon name="chev" size={16} /></button>
      <input ref={file} type="file" accept=".pptx,.pdf" hidden multiple onChange={e => { if (e.target.files.length) onAttach(Array.from(e.target.files)); e.target.value = ''; }} />
    </div></div>
    <div ref={rail} className="rv-slide-rail" role="region" aria-label="모든 장표 가로 목록" tabIndex={0}>
      {units.map(u => { const shown = deck.proposal ? u : doc?.units?.find(d => d.n === u.n), aspect = previewAspect(doc, shown, assets);
        // The enlarged sheet keeps about 210px of the card for its heading and scores.
        return <ReviewHover key={u.n} className={'rv-slide-card' + (u.hidden ? ' is-hidden' : '')} onActivate={() => onUnit(u.n)} label={`${u.n}${ul} ${u.title || '제목 없음'} 보기`} panelClassName="rv-slide-hover"
        keepClear=".rv-slide-rail" fitWidth={h => (h - 210) * aspect + 32} content={<>
        <div className="rv-slide-hover-heading"><b>{u.n}{ul} · {u.title || '제목 없음'}</b><span>클릭하면 상세 보기</span></div>
        <button type="button" className="rv-slide-hover-stage" onClick={() => onUnit(u.n)} aria-label={`${u.n}${ul} 확대 장표 상세 열기`}><ReviewPreview doc={doc} unit={shown} assets={assets} title={`${u.n}${ul} 원본 레이아웃 hover 확대`} /></button>
        <ReviewSlideScores review={review} n={u.n} compact sourceMatches={deck.scoreSourceMatches} />
      </>}>
        <ReviewPreview doc={doc} unit={shown} assets={assets} title={`${u.n}${ul} ${deck.proposal ? '제안서 레이아웃' : '원본 장표'}`} />
        <span className="rv-slide-caption"><span className="rv-slide-number num">{u.n}</span><span>{u.title || '제목 없음'}{u.hidden && <small> · 숨김 장</small>}</span><span className="rv-slide-issues">{perUnit[u.n]?.size ? `보완 ${perUnit[u.n].size}` : '확인'}</span></span>
      </ReviewHover>; })}
    </div>
    <div className="rv-deck-note">{deck.proposal && <span>{deck.proposal.title} · 현재 저장된 레이아웃</span>}
      {deck.proposalId && !deck.proposal && <span>연결된 제안서를 찾지 못했어요. 다른 제안서를 선택해 주세요.</span>}
      {!units.length && deck.proposal && <span>이 제안서에 저장된 레이아웃이 없어요.</span>}
      {missing && <span>{proposals.length ? '제안서를 선택하면 저장된 레이아웃을 바로 볼 수 있어요.' : '이전 기록의 원본 화면은 같은 PPTX 또는 PDF를 연결하면 복원됩니다.'}</span>}
      {!deck.proposal && review.pairWarn && <span>{review.pairWarn}</span>}<FeedbackPopup message={!deck.proposal?doc?.previewError:""}/>{!deck.proposal && doc?.previewWarnings?.length > 0 && <span>{doc.previewWarnings.join(' · ')}</span>}</div>
  </section>;
}

// Every sheet as a thumbnail under the enlarged one; the current sheet is kept in view.
export function ReviewFilmstrip({ deck, doc, assets, ul, current, onPick }) {
  const strip = useRef(null), first = useRef(true);
  const center = smooth => {
    const s = strip.current, el = s?.querySelector('[aria-current="true"]');
    if (el) s.scrollTo({ left: Math.max(0, el.offsetLeft - (s.clientWidth - el.offsetWidth) / 2), behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
  };
  useLayoutEffect(() => { center(!first.current); first.current = false; }, [current]);
  useEffect(() => { const ro = new ResizeObserver(() => center(false)); ro.observe(strip.current); return () => ro.disconnect(); }, []);
  return <nav className="rv-filmstrip" aria-label={`전체 ${ul} 목록`}>
    <ol ref={strip}>{deck.units.map(u => { const shown = deck.proposal ? u : doc?.units?.find(d => d.n === u.n);
      return <li key={u.n}>
        <button type="button" aria-current={u.n === current ? 'true' : undefined} aria-label={`${u.n}${ul} ${u.title || '제목 없음'}`} title={`${u.n}${ul} · ${u.title || '제목 없음'}`}
          style={{ '--rv-aspect': previewAspect(doc, shown, assets) }} onClick={() => onPick(u.n)}>
          <ReviewPreview doc={doc} unit={shown} assets={assets} title="" />
          <span className="rv-filmstrip-number num">{u.n}</span>
        </button>
      </li>; })}</ol>
  </nav>;
}

// Sheet | short bar | notes. Dragging the bar (or arrow keys on it) shares the width;
// the choice is kept for this browser only.
const NOTES_KEY = 'winmate.review.unitNotesWidth', NOTES = { min: 280, initial: 380, sheet: 360, bar: 24, step: 24 };
const savedNotes = () => { try { const v = Number(localStorage.getItem(NOTES_KEY)); return v >= NOTES.min ? v : NOTES.initial; } catch { return NOTES.initial; } };
export function ReviewSplitView({ sheet, notes, notesLabel }) {
  const box = useRef(null), drag = useRef(null), latest = useRef(0);
  const notesId = useId();
  const [width, setWidth] = useState(savedNotes), [total, setTotal] = useState(0), [dragging, setDragging] = useState(false);
  useLayoutEffect(() => { const el = box.current; const ro = new ResizeObserver(() => setTotal(el.clientWidth)); ro.observe(el); setTotal(el.clientWidth); return () => ro.disconnect(); }, []);
  const max = Math.max(NOTES.min, total - NOTES.sheet - NOTES.bar);
  const clamp = v => Math.round(Math.min(max, Math.max(NOTES.min, v)));
  const shown = total ? clamp(width) : width;
  latest.current = shown;
  const save = v => { try { localStorage.setItem(NOTES_KEY, String(v)); } catch { /* private window: keep it for this view only */ } };
  const set = v => { const next = clamp(v); setWidth(next); save(next); };
  const start = e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus({ preventScroll: true }); drag.current = { x: e.clientX, w: shown }; setDragging(true); };
  const move = e => { if (drag.current) setWidth(clamp(drag.current.w + drag.current.x - e.clientX)); };
  const end = () => { if (!drag.current) return; drag.current = null; setDragging(false); save(latest.current); };
  const key = e => {
    const step = e.shiftKey ? NOTES.step * 4 : NOTES.step;
    const next = { ArrowLeft: shown + step, ArrowRight: shown - step, Home: max, End: NOTES.min }[e.key];
    if (next == null) return;
    e.preventDefault(); e.stopPropagation(); set(next);
  };
  return <div ref={box} className={'rv-page-columns' + (dragging ? ' is-resizing' : '')} style={{ '--rv-notes-width': shown + 'px' }}>
    {sheet}
    <div className="rv-page-splitter" role="separator" aria-orientation="vertical" aria-label="장표와 설명 너비 조절" aria-controls={notesId}
      aria-valuenow={shown} aria-valuemin={NOTES.min} aria-valuemax={max} aria-valuetext={`설명 너비 ${shown}px`} tabIndex={0}
      title="끌어서 장표와 설명 너비 조절 · 두 번 누르면 처음 너비" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onLostPointerCapture={end} onKeyDown={key} onDoubleClick={() => set(NOTES.initial)}><span /></div>
    <aside id={notesId} className="rv-page-score-column" aria-label={notesLabel} tabIndex={0}>{notes}</aside>
  </div>;
}
