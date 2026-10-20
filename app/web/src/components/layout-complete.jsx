import React from 'react';
import { getProposal, update } from '../repositories/proposals.js';
import { layoutCanComplete, layoutIsComplete } from '../services/layout-context.js';
import { Icon, toast } from './common.jsx';
import '../styles/layout-complete.css';

/** Completion belongs to the specific sheet instance, beside its favourite action. */
export function LayoutCompleteButton({ p, x, onHover }) {
  const complete = layoutIsComplete(p, x);
  const available = layoutCanComplete(p, x);
  const act = event => {
    event.preventDefault(); event.stopPropagation(); onHover?.();
    const current = getProposal(p.id);
    const sheet = current?.parts.flatMap(part => part.layouts).find(item => item.uid === x.uid);
    if (!sheet || !layoutCanComplete(current, sheet)) return;
    const done = !layoutIsComplete(current, sheet);
    const changed = update(p.id, draft => {
      const target = draft.parts.flatMap(part => part.layouts).find(item => item.uid === x.uid);
      if (target) target.status = done ? 'done'
        : Object.keys(target.ov?.t || {}).length || Object.keys(target.ov?.img || {}).length ? 'partial' : 'empty';
    });
    if (changed) toast(done ? '작업완료로 표시했어요' : '작업완료를 해제했어요');
  };
  return <button type="button" className={'layout-complete' + (complete ? ' on' : '')}
    draggable={false} disabled={!available} aria-pressed={complete}
    aria-label={complete ? '작업완료 취소' : '작업완료'} title={complete ? '작업완료 취소' : '작업완료'}
    onClick={act} onMouseEnter={onHover} onFocus={onHover}
    onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}
    onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}
    onKeyDown={event => event.stopPropagation()}>
    <Icon name="check" size={16} stroke={2.8} />
  </button>;
}
