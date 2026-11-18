// 「전체 파트」 팝업 — 왼쪽 파트 목록(썸네일 목록처럼 버블 + 이름만, 사용자 지시 2026-11-17).
//   누르면 오른쪽의 그 파트 카드로 굴러 가고, 굴리는 동안 지금 보고 있는 파트를 표시한다.
import React, { useEffect, useRef, useState } from 'react';
import { PartIcon } from './layouts.jsx';
import { partArc, tint } from './part-arc.js';
import './part-rail.css';

/** 카드와 같은 이름 · 아이콘 · 색(PartCard 와 같은 규칙) */
function look(K, p) {
  const part = K.PARTS[p.type] || K.PARTS.free;
  const arc = partArc(p.key);
  return {
    title: p.title || K.toc.tocName(p.key, null),
    icon: p.look ? p.look.icon : part.icon,
    color: p.look ? p.look.color : arc.color,
    soft: p.look ? tint(p.look.color, 0.9) : arc.soft,
  };
}

/** 위 거르기 줄(늘 맨 위에 붙어 있음)의 아래 끝 — 없으면 팝업 본문 위 끝 */
const barBottom = (el, box) => { const bar = el.querySelector('.lpx-bar'); return bar ? bar.getBoundingClientRect().bottom : box.getBoundingClientRect().top; };
const cardOf = (root, key) => root && root.querySelector(`.lpx-card[data-part="${CSS.escape(key)}"]`);

// parts: 오른쪽에 보이는 카드 순서 그대로 · root: 카드를 담은 요소(.lpx)
export function PartRail({ K, parts, root }) {
  const [on, setOn] = useState(parts[0] ? parts[0].key : null);
  const lock = useRef(0); // 눌러서 굴러 가는 동안은 표시를 고정 — 지나가는 카드로 깜빡이지 않게
  const [fit, setFit] = useState(null); // { top, max } — 위 거르기 줄 바로 아래에 붙고, 팝업 본문 높이 안에서만 스스로 굴러 간다
  useEffect(() => {
    const el = root.current; const box = el && el.closest('.modal-body'); const bar = el && el.querySelector('.lpx-bar');
    if (!box || !bar) return undefined;
    const pad = parseFloat(getComputedStyle(box).paddingTop) || 0;
    const measure = () => setFit({ top: bar.offsetHeight - pad + 14, max: box.clientHeight - bar.offsetHeight - 28 });
    measure();
    const ro = new ResizeObserver(measure); ro.observe(bar); ro.observe(box);
    return () => ro.disconnect();
  }, [root]);
  useEffect(() => {
    const el = root.current; const box = el && el.closest('.modal-body');
    if (!box) return undefined;
    const spy = () => {
      if (Date.now() < lock.current) return;
      const top = barBottom(el, box) + 24;
      let cur = parts[0] && parts[0].key;
      for (const p of parts) { const c = cardOf(el, p.key); if (c && c.getBoundingClientRect().top <= top) cur = p.key; }
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2 && parts.length) cur = parts[parts.length - 1].key; // 맨 끝까지 내리면 마지막 파트
      setOn(cur);
    };
    spy();
    box.addEventListener('scroll', spy, { passive: true });
    return () => box.removeEventListener('scroll', spy);
  }, [parts, root]);
  const go = key => {
    const el = root.current; const c = cardOf(el, key); const box = el && el.closest('.modal-body');
    if (!c || !box) return;
    setOn(key); lock.current = Date.now() + 800;
    box.scrollTo({ top: box.scrollTop + c.getBoundingClientRect().top - barBottom(el, box) - 12, behavior: 'smooth' }); // 카드 머리가 거르기 줄 바로 아래에 오게
  };
  return <nav className="lpr" aria-label="파트 목록" style={fit ? { top: fit.top, maxHeight: fit.max } : undefined}>
    <ol>{parts.map(p => {
      const l = look(K, p);
      return <li key={p.key}>
        <button type="button" className={'lpr-item' + (on === p.key ? ' on' : '')} aria-current={on === p.key ? 'true' : undefined} data-part={p.key} onClick={() => go(p.key)} title={l.title} style={{ '--c': l.color, '--cs': l.soft }}>
          <span className="lpr-node"><PartIcon name={l.icon} size={15}/></span>
          <span className="lpr-name">{l.title}</span>
        </button>
      </li>;
    })}</ol>
  </nav>;
}
