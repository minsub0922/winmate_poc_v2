import React from 'react';
import { Icon } from './common.jsx';
import { partIcon } from './parteditor.jsx';

/** Storyboard 목차 버블 — 유형 아이콘 원 + 순서 + 이름 (색은 감싸는 .col의 h-<hue>).
 *  Storyboard와 목차 템플릿 화면이 이 하나를 함께 써서 목차 UI가 항상 같은 모양으로 유지된다.
 *  onClick이 없으면 누를 수 없는 표시용(span)으로 그린다. */
export function PartBubble({ part, no, onClick, label, expanded, name }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <>
      <div className="node-top" aria-hidden={onClick ? undefined : true}>
        <Tag className={'node ' + (part.done ? 'done' : 'draft')} onClick={onClick} aria-label={onClick ? label : undefined} aria-expanded={expanded}>
          <Icon name={partIcon(part)} size={28} />
          <span className="order">{no}</span>
        </Tag>
      </div>
      <Tag className="node-name" onClick={onClick}>{name ?? (part.name || '이름 없는 목차')}</Tag>
    </>
  );
}
