// Layout hover detail (big slide on top, full metadata below) placed beside the hovered card, never over it —
// used by the layout picker, the PPT 레이아웃 템플릿 page and Best Scenario (sheets with filled values: extra.ov · extra.scene).
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon, partHue } from './common.jsx';
import { PARTS, REQ_LABEL } from '../domain/proposals/parts.js';
import { IND, P, S } from '../services/catalog.js';
import { Slide } from '../domain/slides/Slide.jsx';
import { TagChip } from './tagcard.jsx';
import { layoutPeekPlacement } from '../services/layout-peek-placement.js';

const indShort = (code) => (IND[code] ? IND[code].name.split(' · ')[0] : '');
/** the one-line message a layout argues, when its group says it (“…”) */
export const msgOf = (l) => { const m = /“([^”]+)”/.exec(l.g || ''); return m ? m[1] : ''; };

/** Key tags on a picker card — part type · industry · solution (the second part type and everything else is in the hover) */
export function CardMeta({ l }) {
  const pt = PARTS[l.p];
  return (
    <div className="pc-meta">
      <div className="pc-tags">
        {pt && <span className={'tag pt ' + partHue(l.p)}>{pt.label}</span>}
        <span className="tag">{l.ind && IND[l.ind] ? indShort(l.ind) + ' 맞춤' : '범용'}</span>
        {l.sol && S[l.sol] && <span className="tag">{S[l.sol].name} 전용</span>}
      </div>
    </div>
  );
}

/** match reasons worth showing — photo-version markers (사진 중심 · …의 사진 버전) stay out of the UI */
export const shownWhy = (why) => (why || []).filter((w) => w !== '사진 중심' && !/사진 (중심 )?버전/.test(w));

/** Large hover preview (show(l, el, { why, aiWhy, rank, snip, ov, scene: { page, stage, role } })) — hides on any scroll */
export function usePickPeek() {
  const [pk, setPk] = useState(null);
  const t = useRef(null);
  const seq = useRef(0); // a new card per hover — the same layout can sit on several cards (Best Scenario)
  const show = useCallback((l, el, extra) => {
    clearTimeout(t.current);
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return; // touch: a tap selects, no preview
    t.current = setTimeout(() => setPk({ l, r: el.getBoundingClientRect(), extra: extra || {}, k: ++seq.current }), 380);
  }, []);
  const hide = useCallback(() => { clearTimeout(t.current); setPk(null); }, []);
  useEffect(() => {
    const onScroll = () => { clearTimeout(t.current); setPk(null); }; // the card moved — a peek placed for the old spot would cover the page
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);
    return () => { clearTimeout(t.current); window.removeEventListener('scroll', onScroll, { capture: true }); window.removeEventListener('resize', onScroll); };
  }, []);
  return { show, hide, node: pk ? <PickPeek key={'peek-' + pk.k} {...pk} /> : null };
}

/** A wide, shallow region uses a slide beside its metadata; tall regions stack them. */
function PickPeek({ l, r, extra }) {
  const ref = useRef(null);
  const vw = window.innerWidth, vh = window.innerHeight;
  const [contentSize, setContentSize] = useState({ headerHeight: 90, metadataHeight: 200 });
  const placement = layoutPeekPlacement(r, { width: vw, height: vh }, contentSize);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const headerHeight = Math.ceil(ref.current.querySelector('.pp-head').getBoundingClientRect().height);
    const metadataHeight = Math.ceil(ref.current.querySelector('.pp-meta').scrollHeight);
    setContentSize(previous => Math.abs(previous.headerHeight - headerHeight) > 1 || Math.abs(previous.metadataHeight - metadataHeight) > 1
      ? { headerHeight, metadataHeight } : previous);
  }, [l.f, placement?.width, placement?.height, placement?.layout]);
  if (!placement) return null;
  const { left, top, width: W, height, slideWidth: slideW, layout, metadataWidth, cut } = placement;

  const pt = PARTS[l.p];
  const msg = msgOf(l);
  const req = l.req || [];
  const prods = (l.prods || []).filter((id) => P[id]);
  const sols = (l.sols || []).filter((id) => S[id]);
  const why = [...(extra.aiWhy ? [extra.aiWhy] : []), ...shownWhy(extra.why)];
  const ov = extra.ov || null; const sc = extra.scene || null; // a filled Best Scenario sheet: show its values, not the template's sample text
  return createPortal(
    <div ref={ref} className={'pk-peek' + (layout === 'wide' ? ' wide' : '') + (cut ? ' cut' : '')}
      data-placement={placement.side} style={{ left, top, width: W, height, '--peek-meta-width': metadataWidth ? metadataWidth + 'px' : undefined }} role="tooltip">
      <div className="pp-head">
        <div className="pp-tags">
          {extra.rank != null && <span className="pp-rank num">추천 {extra.rank}</span>}
          {sc && <span className="pp-rank num">{sc.page}장{sc.stage ? ' · ' + sc.stage : ''}</span>}
          {pt && <span className={'tag pt ' + partHue(l.p)}>{pt.label}</span>}
          {l.p2 && PARTS[l.p2] && <span className="tag">{PARTS[l.p2].label}</span>}
          <span className="tag">{l.ind && IND[l.ind] ? IND[l.ind].name + ' 맞춤' : '범용 · 모든 업종'}</span>
          {l.sol && S[l.sol] && <span className="tag">{S[l.sol].name} 전용</span>}
        </div>
        <b className="pp-name">{l.name}</b>
        {l.when && <span className="pp-when"><Icon name="info" size={13} />언제 쓰나 · {l.when}</span>}
      </div>
      <div className="pp-body">
        <div className="pp-slide"><Slide f={l.f} ov={ov || undefined} pageNo={ov && sc ? sc.page : undefined} width={slideW} /></div>
        <dl className="pp-meta">
          {sc && sc.role && <><dt>이 시나리오에서</dt><dd className="pp-msg">{sc.role}</dd></>}
          {msg && <><dt>핵심 메시지</dt><dd className={sc ? '' : 'pp-msg'}>“{msg}”</dd></>}
          {l.hl && !ov && <><dt>예시 제목</dt><dd>{l.hl}</dd></>}
          {l.sub && !ov && <><dt>부제</dt><dd>{l.sub}</dd></>}
          {req.length > 0 && <><dt>필요한 정보</dt><dd><div className="tagrow">{req.map((x) => <span key={x} className="tag rq">{REQ_LABEL[x] || x}</span>)}</div></dd></>}
          {prods.length > 0 && <><dt>예시 제품</dt><dd><div className="tagchips">{prods.map((id) => <TagChip key={id} r={'product:' + id} label={P[id].model} />)}</div></dd></>}
          {sols.length > 0 && <><dt>관련 솔루션</dt><dd><div className="tagchips">{sols.map((id) => <TagChip key={id} r={'solution:' + id} />)}</div></dd></>}
          {(l.sample || l.foot) && !ov && <><dt>예시 고객</dt><dd>{[l.sample, l.foot && l.foot !== l.sample ? l.foot : ''].filter(Boolean).join(' — ')}</dd></>}
          {why.length > 0 && <><dt>추천 이유</dt><dd><div className="tagrow">{why.slice(0, 5).map((w, i) => <span key={i} className={'why' + (i === 0 && extra.aiWhy ? ' ai' : '')}>{w}</span>)}</div></dd></>}
          {extra.snip && <><dt>검색 일치</dt><dd className="faint">{extra.snip}</dd></>}
        </dl>
      </div>
    </div>, document.body);
}
