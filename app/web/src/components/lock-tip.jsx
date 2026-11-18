// 꺼진 버튼의 이유 — 마우스를 대거나(키보드는 Tab으로 감싼 칸에 오면) 버튼 위 · 아래에 짧은 말풍선이 뜬다.
// 꺼진 버튼은 마우스 이벤트를 받지 않으므로 감싼 칸이 받는다. 이유가 없으면(버튼이 켜져 있으면) 말풍선은 비어 있고 뜨지 않는다.
//   <LockTip lock={요약 전이면 '…'} id="…" block up><button disabled={!!lock}>…</button></LockTip>
//   block: 칸을 가로로 채움 · up: 말풍선을 버튼 위에(모달 아래쪽 버튼)
import React from 'react';
import '../styles/lock-tip.css';

export function LockTip({ lock = '', id, block = false, up = false, children }) {
  const on = !!lock;
  return (
    <span className={'lock-tip' + (on ? ' locked' : '') + (block ? ' block' : '') + (up ? ' up' : '')} tabIndex={on ? 0 : undefined}
      aria-describedby={on ? id : undefined}>
      {children}
      <span className="lock-tip-msg" id={id} role="tooltip">{lock}</span>
    </span>
  );
}
