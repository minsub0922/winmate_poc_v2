import {FeedbackPopup} from './feedback-popup.jsx';
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './common.jsx';
import { criteriaForReview, band } from '../domain/review/criteria.js';
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

// Hover cards also open on keyboard focus and tap. The pointer can move into the card.
export function ReviewHover({ label, children, content, className = '', panelClassName = '', onActivate, as = 'button', outsideChart = false, preferredSide = 'right', ...props }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, visibility: 'hidden' });
  const anchor = useRef(null), panel = useRef(null), timer = useRef(null);
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
      const left = Math.max(12, Math.min(a.left + a.width / 2 - b.width / 2, window.innerWidth - b.width - 12));
      const top = a.bottom + b.height + 12 < window.innerHeight ? a.bottom + 8 : Math.max(12, a.top - b.height - 8);
      setPosition({ left, top, visibility: 'visible' });
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
  }, [open, outsideChart, preferredSide, position.inline]);
  const blur = e => { if (!panel.current?.contains(e.relatedTarget) && !anchor.current?.contains(e.relatedTarget)) hide(); };
  const { inline, ...panelStyle } = position;
  const host = inline ? anchor.current?.closest('.rv-radar-card')?.querySelector('.rv-radar-detail-slot') : null;
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

const polar = (i, n, radius, cx, cy) => { const a = i / n * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]; };
const points = list => list.map(p => p.join(',')).join(' ');
const labelLines = (text, limit) => {
  const weight = c => c.charCodeAt(0) < 256 ? .55 : 1;
  const width = s => [...s].reduce((n, c) => n + weight(c), 0);
  const words = [];
  for (const word of text.replaceAll('·', ' · ').split(/\s+/)) {
    let part = '';
    for (const c of word) {
      if (part && width(part + c) > limit) { words.push(part); part = ''; }
      part += c;
    }
    if (part) words.push(part);
  }
  const lines = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && width(lines[last] + ' ' + word) <= limit) lines[last] += ' ' + word;
    else lines.push(word);
  }
  return lines;
};
function ReviewRadarPlot({ criteria, results, detail, category }) {
  const frame = useRef(null), [width, setWidth] = useState(400);
  useLayoutEffect(() => {
    const measure = () => { if (frame.current?.clientWidth) setWidth(frame.current.clientWidth); };
    const ro = new ResizeObserver(measure); ro.observe(frame.current); measure(); return () => ro.disconnect();
  }, []);
  // Match SVG units to CSS pixels so a 14px label stays readable on phones too.
  const compact = width < 360, space = Math.max(0, Math.min(1, (width - 300) / 120));
  const radius = Math.max(32, Math.min(160, width / 2 - (80 + space * 32)));
  const labelRadius = radius + 42 + space * 12, labelYRadius = labelRadius + 48 - space * 40;
  const lineHeight = compact ? 1.2 : 1.3;
  const labels = criteria.map(c => labelLines(c.name, compact ? 4 : 6));
  // Reserve real text height for long criterion names above/below the six-axis chart.
  const edgePadding = Math.max(50, Math.max(...labels.map(lines => lines.length)) * 14 * lineHeight / 2 + 20);
  const height = Math.max(340, labelYRadius * 2 + edgePadding * 2), cx = width / 2, cy = height / 2;
  const at = (i, r) => polar(i, criteria.length, r, cx, cy);
  const plotted = criteria.map((c, i) => results[c.id]?.score == null ? null : at(i, Math.max(0, Math.min(100, results[c.id].score)) / 100 * radius)).filter(Boolean);
  return <div ref={frame} className="rv-radar-frame"><svg className="rv-radar" viewBox={`0 0 ${width} ${height}`} style={{ height }} role="group" aria-label={category.name + ' 기준별 스파이더 차트'}>
    {[25, 50, 75, 100].map(v => <polygon key={v} className="rv-radar-ring" points={points(criteria.map((_, i) => at(i, v / 100 * radius)))} />)}
    {criteria.map((c, i) => { const p = at(i, radius); return <line className="rv-radar-axis" key={c.id} x1={cx} y1={cy} x2={p[0]} y2={p[1]} />; })}
    {plotted.length >= 3 ? <polygon className="rv-radar-value" points={points(plotted)} /> : plotted.length === 2 ? <polyline className="rv-radar-value" fill="none" points={points(plotted)} /> : null}
    {[25, 50, 75, 100].filter(v => radius >= 46 || v % 50 === 0).map(v => <text key={v} className="rv-radar-tick" x={cx + 5} y={cy - v / 100 * radius - 4}>{v}</text>)}
    {criteria.map((c, i) => {
      const value = results[c.id]?.score, p = at(i, value == null ? radius : Math.max(0, Math.min(100, value)) / 100 * radius);
      const label = at(i, labelRadius), a = i / criteria.length * Math.PI * 2 - Math.PI / 2;
      label[1] = cy + Math.sin(a) * labelYRadius;
      const lines = labels[i];
      return <ReviewHover key={c.id} as="g" outsideChart preferredSide={i > criteria.length / 2 ? 'left' : 'right'} label={`${c.name} ${value == null ? '미평가' : value + '점'}`} className={'rv-radar-target' + (value == null ? ' unscored' : '')} content={detail(c)}>
        <circle cx={p[0]} cy={p[1]} r="12" fill="transparent" /><circle className="rv-radar-dot" cx={p[0]} cy={p[1]} r="4" />
        <text x={label[0]} y={label[1]} textAnchor="middle" className="rv-radar-label">{lines.map((line, n) => <tspan key={n} x={label[0]} dy={n === 0 ? `${-(lines.length - 1) * lineHeight / 2}em` : `${lineHeight}em`}>{line}</tspan>)}</text>
      </ReviewHover>;
    })}
  </svg></div>;
}
export function ReviewRadar({ review, onUnit }) {
  const { CATS, CRITERIA } = criteriaForReview(review);
  const results = review.results || {};
  return <section className="rv-card rv-radar-section" aria-label="기준별 평가">
    <div className="rv-card-h"><div><span className="rv-eyebrow">EVALUATION</span><h3>기준별 평가</h3></div><span className="faint">기준 이름이나 점에 마우스를 올리면 설명과 근거를 볼 수 있어요</span></div>
    <div className="rv-radar-grid">{CATS.map(cat => {
      const criteria = CRITERIA.filter(c => c.cat === cat.id);
      const assessed = criteria.filter(c => results[c.id]?.score != null);
      const detail = c => <CriterionDetail criterion={c} selected={review.sel.find(s => s.id === c.id)} result={results[c.id]} ul={review.unitLabel || '장'} onUnit={onUnit} />;
      return <article className="rv-radar-card" key={cat.id}>
        <header><div><Icon name={cat.icon} size={17} /><h4>{cat.name}</h4></div><span className="faint">{assessed.length}/{criteria.length}개 평가</span></header>
        <ReviewRadarPlot criteria={criteria} results={results} detail={detail} category={cat} />
        <div className="rv-radar-detail-slot" />
      </article>;
    })}</div>
    <p className="rv-chart-note">바깥쪽일수록 높은 점수입니다. 빈 점은 미평가 기준이며, 0점으로 계산하지 않습니다.</p>
  </section>;
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

export function ReviewPreview({ doc, unit, assets, title }) {
  const ref = useRef(null), [width, setWidth] = useState(0);
  useLayoutEffect(() => { if (!ref.current) return; const measure = () => setWidth(ref.current.clientWidth); const ro = new ResizeObserver(measure); ro.observe(ref.current); measure(); return () => ro.disconnect(); }, []);
  const layout = unit?.layout;
  const image = !layout && (assets.pages[unit?.n] || unit?.thumb);
  const html = !layout && unit?.previewHtml;
  const source = useMemo(() => {
    if (!html || !width) return '';
    const body = html.replace(/wmimg:([\w-]+)/g, (m, id) => assets.images[id] || '');
    return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${location.origin}/fonts/fonts.css"><style>html,body{margin:0;padding:0;overflow:hidden;background:white;color-scheme:light}*{box-sizing:border-box}.review-canvas{width:1280px;height:720px;transform:scale(${width / 1280});transform-origin:0 0}</style></head><body><div class="review-canvas">${body}</div></body></html>`;
  }, [html, width, assets.images]);
  return <div ref={ref} className="rv-original-preview" style={{ aspectRatio: layout || (html && !image) ? '16 / 9' : String(doc?.aspect || 16 / 9) }}>
    {layout ? width > 0 && <Slide f={layout.f} ov={layout.ov} width={width} pageNo={layout.pageNo} lazy />
      : image ? <img src={image} alt={title} loading="lazy" /> : html ? width > 0 && <iframe title={title} srcDoc={source} sandbox="allow-same-origin" loading="lazy" tabIndex={-1} />
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
      {units.map(u => <ReviewHover key={u.n} className={'rv-slide-card' + (u.hidden ? ' is-hidden' : '')} onActivate={() => onUnit(u.n)} label={`${u.n}${ul} ${u.title || '제목 없음'} 보기`} panelClassName="rv-slide-hover" content={<>
        <div className="rv-slide-hover-heading"><b>{u.n}{ul} · {u.title || '제목 없음'}</b><span>클릭하면 상세 보기</span></div>
        <button type="button" className="rv-slide-hover-stage" onClick={() => onUnit(u.n)} aria-label={`${u.n}${ul} 확대 장표 상세 열기`}><ReviewPreview doc={doc} unit={deck.proposal ? u : doc?.units?.find(d => d.n === u.n)} assets={assets} title={`${u.n}${ul} 원본 레이아웃 hover 확대`} /></button>
        <ReviewSlideScores review={review} n={u.n} compact sourceMatches={deck.scoreSourceMatches} />
      </>}>
        <ReviewPreview doc={doc} unit={deck.proposal ? u : doc?.units?.find(d => d.n === u.n)} assets={assets} title={`${u.n}${ul} ${deck.proposal ? '제안서 레이아웃' : '원본 장표'}`} />
        <span className="rv-slide-caption"><span className="rv-slide-number num">{u.n}</span><span>{u.title || '제목 없음'}{u.hidden && <small> · 숨김 장</small>}</span><span className="rv-slide-issues">{perUnit[u.n]?.size ? `보완 ${perUnit[u.n].size}` : '확인'}</span></span>
      </ReviewHover>)}
    </div>
    <div className="rv-deck-note"><span>{deck.proposal ? `${deck.proposal.title} · 현재 저장된 레이아웃` : '가로로 넘겨 모든 ' + ul + '을 확인하세요'} · 장표를 누르면 크게 볼 수 있어요</span>
      {deck.proposalId && !deck.proposal && <span>연결된 제안서를 찾지 못했어요. 다른 제안서를 선택해 주세요.</span>}
      {!units.length && deck.proposal && <span>이 제안서에 저장된 레이아웃이 없어요.</span>}
      {missing && <span>{proposals.length ? '제안서를 선택하면 저장된 레이아웃을 바로 볼 수 있어요.' : '이전 기록의 원본 화면은 같은 PPTX 또는 PDF를 연결하면 복원됩니다.'}</span>}
      {!deck.proposal && review.pairWarn && <span>{review.pairWarn}</span>}<FeedbackPopup message={!deck.proposal?doc?.previewError:""}/>{!deck.proposal && doc?.previewWarnings?.length > 0 && <span>{doc.previewWarnings.join(' · ')}</span>}</div>
  </section>;
}
