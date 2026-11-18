import React from 'react';
import { Icon } from './common.jsx';
import { partIcon } from './parteditor.jsx';

/** Storyboard 목차 버블 — 유형 아이콘 원 + 순서 + 이름 (색은 감싸는 .col의 h-<hue>).
 *  Storyboard와 목차 템플릿 화면이 이 하나를 함께 써서 목차 UI가 항상 같은 모양으로 유지된다.
 *  onClick이 없으면 누를 수 없는 표시용(span)으로 그린다. no가 없으면 순서 숫자를 그리지 않는다(Storyboard는 숫자 없이).
 *  busy: 이 목차에서 작업이 진행 중 — 버블 테두리에 도는 고리(.node.is-busy). */
export function PartBubble({ part, no = null, onClick, label, expanded, name, busy = false, dragProps = null }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <>
      <div className="node-top" aria-hidden={onClick ? undefined : true}>
        {/* dragProps: Storyboard 목차 버블을 끌어서 옮길 때(draggable · onDragStart · onDragEnd · title) */}
        <Tag className={'node ' + (part.done ? 'done' : 'draft') + (busy ? ' is-busy' : '') + (dragProps ? ' movable' : '')} aria-busy={busy || undefined} onClick={onClick} aria-label={onClick ? label : undefined} aria-expanded={expanded} {...(dragProps || {})}>
          <Icon name={(part.look && part.look.icon) || partIcon(part)} size={28} />
          {no != null && <span className="order">{no}</span>}
        </Tag>
      </div>
      <Tag className="node-name" onClick={onClick}>{name ?? (part.name || '이름 없는 목차')}</Tag>
    </>
  );
}
