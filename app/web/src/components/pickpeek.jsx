// Layout hover detail (big slide on top, full metadata below) placed beside the hovered card, never over it —
// used by the layout picker, the PPT 레이아웃 템플릿 page and Best Scenario (sheets with filled values: extra.ov · extra.scene).
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon, partHue } from './common.jsx';
import { PARTS, REQ_LABEL } from '../domain/proposals/parts.js';
import { IND, P, S } from '../services/catalog.js';
import { Slide } from '../domain/slides/Slide.jsx';
import { TagChip } from './tagcard.jsx';

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
    return () => { clearTimeout(t.current); window.removeEventListener('scroll', onScroll, { capture: true }); };
  }, []);
  return { show, hide, node: pk ? <PickPeek key={'peek-' + pk.k} {...pk} /> : null };
}

const PEEK_MAX = 920, PEEK_MIN = 300, GAP = 12, EDGE = 12, PAD = 36; // PAD = side padding + card and slide borders

/** Detail card: big slide on top, metadata under it — about two picker columns wide, so it reads as a detail view.
 *  Goes beside the hovered card (the roomier side), or above / below it when neither side has room — never on top of the card. */
function PickPeek({ l, r, extra }) {
  const ref = useRef(null);
  const vw = window.innerWidth, vh = window.innerHeight;
  const roomR = vw - r.right - GAP - EDGE, roomL = r.left - GAP - EDGE;
  const room = Math.max(roomR, roomL);
  const beside = room >= PEEK_MIN;
  const want = Math.min(PEEK_MAX, Math.round(r.width * 2 + 14)); // two cards + the gap between them
  const W0 = beside ? Math.min(want, room) : Math.min(want, vw - 2 * EDGE);
  const [W, setW] = useState(W0);
  const [fit, setFit] = useState(0); // shrink passes so far
  const left = beside ? (roomR >= roomL ? r.right + GAP : r.left - GAP - W) : Math.max(EDGE, Math.min(r.left + r.width / 2 - W / 2, vw - W - EDGE));
  const slideW = W - PAD;
  const [top, setTop] = useState(-9999);
  const [maxH, setMaxH] = useState(null);
  useLayoutEffect(() => {
    const h = ref.current ? ref.current.offsetHeight : 600;
    const avail = vh - 2 * EDGE;
    if (beside) {
      // taller than the window → narrow the whole card (slide shrinks with it) until it fits
      if (h > avail && fit < 3 && W > PEEK_MIN) { setW(Math.max(PEEK_MIN, Math.floor(W - (h - avail) * 16 / 9) - 4)); setFit(fit + 1); return; }
      setTop(Math.max(EDGE, Math.min(r.top + r.height / 2 - h / 2, vh - h - EDGE)));
    } else {
      // above or below the card; cut to the room there rather than cover the card
      const below = vh - r.bottom - GAP - EDGE, above = r.top - GAP - EDGE;
      const down = below >= h || below >= above;
      const hh = Math.min(h, down ? below : above);
      setMaxH(hh < h ? hh : null);
      setTop(down ? r.bottom + GAP : r.top - GAP - hh);
    }
  }, [l.f, W]);

  const pt = PARTS[l.p];
  const msg = msgOf(l);
  const req = l.req || [];
  const prods = (l.prods || []).filter((id) => P[id]);
  const sols = (l.sols || []).filter((id) => S[id]);
  const why = [...(extra.aiWhy ? [extra.aiWhy] : []), ...shownWhy(extra.why)];
  const ov = extra.ov || null; const sc = extra.scene || null; // a filled Best Scenario sheet: show its values, not the template's sample text
  return createPortal(
    <div ref={ref} className={'pk-peek' + (maxH ? ' cut' : '')} style={{ left, top, width: W, maxHeight: maxH || undefined }} role="tooltip">
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
