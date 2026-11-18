// 레이아웃 상세의 시트 — 평소엔 아무 표시 없이 그대로 보이고, 글은 클릭해서 바로 고친다.
//   마우스를 올린 영역이 곧 '지금 영역': 테두리가 바로 켜지고 영역 안 오른쪽 위에 작은 자물쇠 버튼 하나가 붙는다
//   (풀린 자물쇠 = AI 가 채움 · 잠긴 자물쇠 = AI 자동 채움 잠금, 누르면 바뀜 · 마우스를 대면 바로 힌트). 영역이 작으면 오른쪽 위 바깥.
//   마우스를 옮기면 영역도 따라 바뀐다. 다른 영역으로는 잠깐(0.1초) 머물러야, 빈 곳으로는 0.22초 뒤에 바뀌어서
//   자물쇠로 옮겨 가는 동안 지나는 곳 때문에 버튼이 사라지지 않는다. 버튼 위에서는 그 영역을 그대로 잡는다.
//   마우스가 시트 밖이면 글을 고치는 중인 영역(초점)에 붙는다. AI 잠금 영역은 주황. '영역 보기'를 켜면 모든 영역이 함께 보인다.
//
//   시트는 스크립트를 막은 sandbox iframe 이다. Safari(WebKit)는 이런 iframe 문서에 붙인 이벤트 리스너를 아예 부르지 않으므로
//   (Chrome 은 부른다) 마우스 · 클릭 · 글 변경을 모두 부모 쪽에서 처리한다 — iframe 안에는 리스너를 하나도 두지 않는다:
//   · 투명한 덮개(lr-hit)가 마우스를 받고, 잰 영역 상자로 그 자리의 영역을 찾는다(겹치면 더 작은 = 안쪽 영역).
//   · 글 영역을 누르면 그 자리로 커서를 옮겨 편집을 시작한다(끌면 선택 · 두 번 = 단어 · 세 번 = 칸 전체). 타자는 iframe 이 그대로 받는다.
//   · 바뀐 글은 부모가 만든 MutationObserver 로 읽는다.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './layout-flow.css';

export const LOCK = 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3';
export const UNLOCK = 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.7-1.4';
export const SPARK = 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z';
export const FIXED_MODES = ['fixed', 'section', 'pick'];
export const slotKey = s => s.kind + ':' + s.id;
export function Glyph({ d, size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>;
}

const CSS = `[data-admin-slot]{cursor:pointer;outline:3px solid transparent;outline-offset:2px}
[data-admin-slot][contenteditable=true]{white-space:pre-wrap}
body[data-admin-show=true] [data-admin-slot]{outline:2px dashed rgba(37,99,235,.6)}
body[data-admin-show=true] [data-admin-slot][data-admin-fixed=true]{outline:2px dashed rgba(217,119,6,.85);box-shadow:inset 0 0 0 2000px rgba(245,158,11,.06)}
[contenteditable=true]:focus{outline:3px solid rgba(37,99,235,.55)!important;outline-offset:2px}
[data-admin-fixed=true][contenteditable=true]:focus{outline-color:rgba(217,119,6,.6)!important}
[data-admin-hover=true]{outline:3px solid #2563eb!important;outline-offset:2px;box-shadow:inset 0 0 0 2000px rgba(37,99,235,.12)!important}
[data-admin-hover=true][data-admin-fixed=true]{outline-color:#d97706!important;box-shadow:inset 0 0 0 2000px rgba(245,158,11,.16)!important}`;

const query = (doc, s) => doc.querySelector(s.kind === 't' ? `[data-tb="${s.id}"]:not([data-img])` : `[data-img="${s.id}"]`);
const flat = v => String(v ?? '').replace(/\s+/g, ' ').trim();

const BTN = 20, M = 3, SWITCH_MS = 100, LEAVE_MS = 220;

/** slots: base_slots · fixedOf(slot) → bool · textOf(slot) → current text · onSet(slot, fixed) · onImage(slot, rect, ratio) — 이미지 영역을 누름(null = 다른 곳) */
export function RegionSheet({ html, title, slots, fixedOf, textOf, onText, onSet, onImage, showAll, disabled, children }) {
  const host = useRef(null), frame = useRef(null), latest = useRef(null), raf = useRef(0), cur = useRef(null), pend = useRef({ key: undefined, timer: 0 });
  const observer = useRef(null), drag = useRef(null);
  const [width, setWidth] = useState(0), [loaded, setLoaded] = useState(0), [boxes, setBoxes] = useState({});
  const [hover, setHover] = useState(null), [focus, setFocus] = useState(null), [tip, setTip] = useState(false);
  latest.current = { slots, onText, disabled, boxes };
  const scale = width / 1280;
  // 지금 영역을 바꾸는 예약: 같은 곳으로 다시 예약하면 처음 시간을 지킨다(움직이는 동안 미뤄지지 않게)
  const hold = () => { clearTimeout(pend.current.timer); pend.current = { key: undefined, timer: 0 }; };
  const go = key => { hold(); cur.current = key; setHover(key); };
  const want = (key, ms) => {
    if (key === cur.current) return hold();
    if (pend.current.key === key) return;
    hold();
    if (!ms) return go(key);
    pend.current = { key, timer: setTimeout(() => go(key), ms) };
  };
  const release = () => want(null, LEAVE_MS);
  useEffect(() => {
    const resize = new ResizeObserver(es => setWidth(es[0].contentRect.width)); resize.observe(host.current);
    // 초점이 부모 화면의 다른 곳(이름 칸 · 버튼 …)으로 가면 고치던 영역을 놓는다
    const away = e => { if (e.target !== frame.current) setFocus(null); };
    document.addEventListener('focusin', away);
    return () => { resize.disconnect(); cancelAnimationFrame(raf.current); clearTimeout(pend.current.timer); document.removeEventListener('focusin', away); };
  }, []);
  const measure = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const doc = frame.current?.contentDocument; if (!doc?.body) return;
      const next = {};
      for (const s of latest.current.slots || []) {
        const el = query(doc, s); if (!el) continue;
        const b = el.getBoundingClientRect(); if (!b.width && !b.height) continue;
        next[slotKey(s)] = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
      }
      setBoxes(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    });
  };
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const style = doc.createElement('style'); style.textContent = CSS; doc.head.appendChild(style);
    // 글이 바뀌면(타자 · 붙여넣기 · 지우기) 그 칸의 글을 읽는다 — 부모가 만든 관찰자라 Safari 에서도 불린다
    const mo = new MutationObserver(records => {
      const changed = new Set();
      for (const r of records) {
        const node = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        const tb = node?.closest?.('[data-tb]');
        if (tb && !tb.hasAttribute('data-img')) changed.add(tb);
      }
      for (const tb of changed) latest.current.onText(tb.getAttribute('data-tb'), tb.innerText);
      if (changed.size) measure();
    });
    mo.observe(doc.body, { subtree: true, childList: true, characterData: true });
    observer.current = mo;
    return () => { style.remove(); mo.disconnect(); observer.current = null; };
  }, [loaded]);
  // 지금 영역 = 마우스가 올라간 영역, 없으면 고치는 중인 글 영역
  const active = disabled ? null : hover ?? focus;
  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    doc.body.dataset.adminShow = String(!!showAll);
    for (const s of slots || []) {
      const el = query(doc, s); if (!el) continue;
      const k = slotKey(s);
      el.dataset.adminSlot = k; el.dataset.adminFixed = String(!!fixedOf(s)); el.dataset.adminHover = String(active === k);
      el.title = '';
      if (s.kind === 't') {
        el.contentEditable = disabled ? 'false' : 'true'; el.spellcheck = false;
        const value = textOf(s);
        if (el !== doc.activeElement && flat(el.innerText) !== flat(value)) el.textContent = value;
      }
    }
    observer.current?.takeRecords(); // 위에서 직접 바꾼 글은 '고친 글'이 아니다
    measure();
  });
  useEffect(measure, [width, loaded]);

  // ---- 덮개: 그 자리의 영역 찾기(pointer 이벤트 — 버튼줄의 pointerenter 와 순서가 맞는다) · 누르면 편집 시작(mousedown — pointerdown 은 누른 횟수 detail 이 늘 0)
  const point = e => { const r = host.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; };
  const hit = p => {
    let best = null, area = Infinity;
    for (const [k, b] of Object.entries(latest.current.boxes)) {
      if (p.x < b.x || p.y < b.y || p.x > b.x + b.w || p.y > b.y + b.h) continue;
      if (b.w * b.h <= area) { best = k; area = b.w * b.h; }
    }
    return best;
  };
  const caret = (doc, p) => {
    if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(p.x, p.y);
    const at = doc.caretPositionFromPoint?.(p.x, p.y); if (!at) return null;
    const r = doc.createRange(); r.setStart(at.offsetNode, at.offset); r.collapse(true); return r;
  };
  const elementOf = k => { const doc = frame.current?.contentDocument, s = k && (slots || []).find(x => slotKey(x) === k); return doc && s ? query(doc, s) : null; };
  function down(e) {
    if (disabled || e.button !== 0) return;
    const doc = frame.current?.contentDocument, p = point(e), k = hit(p), el = elementOf(k);
    if (!doc) return;
    go(k);
    if (!el || !k.startsWith('t:')) {
      doc.activeElement?.blur?.(); setFocus(null);
      // 이미지 영역 → 그 이미지의 화면 위치 · 칸 비율과 함께 알린다(관련 이미지 팝업)
      const b = k?.startsWith('img:') && latest.current.boxes[k], r = host.current.getBoundingClientRect();
      onImage?.(b ? slotBy(k) : null, b && { left: r.left + b.x * scale, top: r.top + b.y * scale, right: r.left + (b.x + b.w) * scale, bottom: r.top + (b.y + b.h) * scale }, b && b.h ? b.w / b.h : 0);
      return;
    }
    onImage?.(null);
    e.preventDefault();
    el.focus({ preventScroll: true });
    const sel = doc.getSelection(), r = caret(doc, p);
    if (e.detail >= 3) { const all = doc.createRange(); all.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(all); }
    else if (r && el.contains(r.startContainer)) {
      sel.removeAllRanges(); sel.addRange(r);
      if (e.detail === 2 && sel.modify) { sel.modify('move', 'backward', 'word'); sel.modify('extend', 'forward', 'word'); }
      else {
        // 끌어서 선택 — 시트 밖으로 나가도 이어지게 부모 창에서 받는다
        drag.current = { el, node: r.startContainer, offset: r.startOffset };
        const stop = () => { drag.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop); };
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', stop);
      }
    } else { const end = doc.createRange(); end.selectNodeContents(el); end.collapse(false); sel.removeAllRanges(); sel.addRange(end); }
    setFocus(k);
  }
  function move(e) {
    const d = drag.current;
    if (d) {
      const doc = frame.current?.contentDocument, r = doc && caret(doc, point(e));
      if (r && d.el.contains(r.startContainer)) doc.getSelection().setBaseAndExtent(d.node, d.offset, r.startContainer, r.startOffset);
      return;
    }
    if (disabled) return;
    const k = hit(point(e));
    want(k, !k ? LEAVE_MS : cur.current ? SWITCH_MS : 0);
  }
  const hov = hover && (slots || []).find(s => slotKey(s) === hover);

  const slotBy = k => (slots || []).find(s => slotKey(s) === k);
  const act = active && slotBy(active), box = act && boxes[active];
  const visible = (slots || []).filter(s => fixedOf(s) && boxes[slotKey(s)] && showAll && active !== slotKey(s));
  // 자물쇠: 영역 안 오른쪽 위(여백 3px). 영역이 버튼보다 작으면 오른쪽 위 모서리 바깥(시트 밖이면 왼쪽 바깥)
  const lockAt = b => {
    const x = b.x * scale, y = b.y * scale, w = b.w * scale, h = b.h * scale;
    if (w >= BTN * 2 + M * 2 && h >= BTN + M * 2) return { left: x + w - BTN - M, top: y + M };
    return { left: x + w + M + BTN <= width ? x + w + M : Math.max(0, x - BTN - M), top: Math.max(0, y + Math.min(0, (h - BTN) / 2)) };
  };
  const locked = act && !!fixedOf(act), at = box && lockAt(box), hint = locked ? 'AI 자동 채움 잠금 풀기' : 'AI 자동 채움 잠그기';
  useEffect(() => setTip(false), [active]);
  return <div className="ll-sheet lr-sheet" ref={host}>
    {html && width > 0 ? <iframe ref={frame} title={title} sandbox="allow-same-origin" referrerPolicy="no-referrer" tabIndex={-1} srcDoc={html} onLoad={() => setLoaded(v => v + 1)} style={{ transform: `scale(${scale})` }}/> : <span className="ll-sheet-wait"/>}
    <div className="lr-hit" aria-hidden="true" style={{ cursor: disabled || !hov ? 'default' : hov.kind === 't' ? 'text' : 'pointer' }}
      onMouseDown={down} onPointerMove={e => { if (!drag.current) move(e); }} onPointerLeave={() => { if (!drag.current) release(); }}/>
    <div className="lr-overlay">
      {visible.map(s => { const b = boxes[slotKey(s)]; return <span key={slotKey(s)} className="lr-lock" style={{ left: (b.x + b.w) * scale - 8, top: b.y * scale - 9 }} aria-hidden="true"><Glyph d={LOCK} size={9}/></span>; })}
      {act && at && <button type="button" className={'lr-lockbtn' + (locked ? ' on' : '')} data-slot={active} aria-pressed={locked} aria-label={hint} style={at}
        onPointerEnter={() => { hold(); setTip(true); }} onPointerLeave={() => { release(); setTip(false); }} onFocus={() => setTip(true)} onBlur={() => setTip(false)}
        onMouseDown={e => e.preventDefault()} onClick={() => onSet(act, !locked)}><Glyph d={locked ? LOCK : UNLOCK} size={12}/></button>}
      {act && at && tip && <span className="lr-tip" role="tooltip" style={{ left: at.left + BTN, top: at.top >= 28 ? at.top - 26 : at.top + BTN + 5 }}>{hint}</span>}
    </div>
    {children}
  </div>;
}
