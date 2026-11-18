// Presentation only: admin supplies sandboxed sheets; the app supplies Slide.
import React from 'react';
import { createPortal } from 'react-dom';
import { countVariantLabel } from '../domain/templates/layout_count_groups.js';
import '../styles/layout-count-group.css';

export function CountGroupBadge({ layout }) {
  if (!layout.countVariants || layout.countVariants.length < 2) return null;
  return <span className="count-group-badge" title={layout.countVariants.map(countVariantLabel).join(' · ')} aria-label={`수량별 버전 ${layout.countVariants.length}종`}><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 3h12v12M3 5h12v12H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>{layout.countVariants.length}종</span>;
}

export function CountGroupOptions({ layout, render, onSelect, actionLabel = '선택', actions }) {
  return <div className="count-group-options">{layout.countVariants.map(member => <div key={member.f} className="count-group-option" data-count-layout={member.f}>
    <button type="button" className="count-option-preview" disabled={!onSelect} aria-label={countVariantLabel(member) + ' ' + actionLabel} onClick={() => onSelect?.(member)}>{render(member)}<span className="count-option-label">{countVariantLabel(member)}<small>{member.code || member.f}</small></span></button>
    {actions?.(member)}
  </div>)}</div>;
}

export function CountGroupPeek({ layout, rect, render, onSelect, onEnter, onLeave, actionLabel }) {
  const rightSpace = innerWidth - rect.right - 28, leftSpace = rect.left - 28;
  const beside = Math.max(rightSpace, leftSpace) >= 360;
  const width = Math.min(780, beside ? Math.max(rightSpace, leftSpace) : innerWidth - 32);
  const cols = Math.min(layout.countVariants.length, width >= 620 ? 3 : 2);
  const below = innerHeight - rect.bottom >= rect.top;
  const maxHeight = beside ? innerHeight - 32 : Math.max(160, below ? innerHeight - rect.bottom - 28 : rect.top - 28);
  const estimatedHeight = Math.min(maxHeight, 50 + Math.ceil(layout.countVariants.length / cols) * ((width - 36) / cols * 9 / 16 + 52));
  const left = beside ? rightSpace >= leftSpace ? rect.right + 12 : rect.left - width - 12 : Math.max(16, Math.min(rect.left, innerWidth - width - 16));
  const top = beside ? Math.max(16, Math.min(rect.top - 12, innerHeight - estimatedHeight - 16)) : below ? rect.bottom + 12 : Math.max(16, rect.top - estimatedHeight - 12);
  return createPortal(<section className="count-variant-peek" role="region" aria-label="수량별 레이아웃 미리보기" onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ left, top, width, '--count-cols': cols, maxHeight }}>
    <header><strong>{layout.name}</strong><CountGroupBadge layout={layout}/></header>
    <CountGroupOptions layout={layout} render={render} onSelect={onSelect} actionLabel={actionLabel}/>
  </section>, document.body);
}
