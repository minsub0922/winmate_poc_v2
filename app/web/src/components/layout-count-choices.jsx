import React from 'react';
import { Modal } from './common.jsx';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { CountGroupOptions } from './layout-count-group.jsx';
export function CountGroupChoice({ layout, onSelect, onClose, actionLabel = '선택' }) {
  return <Modal title={layout.name + ' · 수량별 버전 ' + layout.countVariants.length + '종'} onClose={onClose} size="wide">
    <div className="count-choice"><p>필요한 항목 수의 시트를 선택하세요.</p><CountGroupOptions layout={layout} render={l => <FitSlide f={l.f}/>} onSelect={onSelect} actionLabel={actionLabel}/></div>
  </Modal>;
}
