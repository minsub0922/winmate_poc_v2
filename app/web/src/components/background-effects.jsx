import React from 'react';
import { DEFAULT_BACKGROUND_EFFECTS } from '../services/background-effects.js';

const PRESETS = [
  ['원본', {}], ['연하게', { opacity: 35 }],
  ['흰색', { overlayColor: '#ffffff', overlayOpacity: 60 }],
  ['검정', { overlayColor: '#000000', overlayOpacity: 45 }],
  ['파랑', { overlayColor: '#1428a0', overlayOpacity: 50 }],
  ['도트', { dots: 100, dotSize: 12 }], ['블러', { blur: 10 }],
];
export function BackgroundEffects({ value, onChange, onStart, onEnd, disabled = false }) {
  const choose = patch => { onStart(); onChange(patch); onEnd(); };
  const range = (key, label, min, max, unit = '%', ariaLabel = label) => <label className="ed-background-strength" key={key}>
    {label}<span className="num">{value[key]}{unit}</span>
    <input type="range" disabled={disabled} min={min} max={max} value={value[key]} aria-label={ariaLabel} onChange={e => onChange({ [key]: Number(e.target.value) })}
      onPointerDown={onStart} onPointerUp={onEnd} onKeyUp={onEnd} onBlur={onEnd} />
  </label>;
  return <div className="ed-background-effects" role="group" aria-label="배경 효과">
    <div className="ed-effects-presets" role="group" aria-label="배경 효과 프리셋">{PRESETS.map(([name, effect]) => {
      const preset = { ...DEFAULT_BACKGROUND_EFFECTS, ...effect };
      const active = Object.entries(preset).every(([key, v]) => value[key] === v);
      return <button key={name} disabled={disabled} aria-pressed={active} className={'btn btn-sm' + (active ? ' on' : '')} onClick={() => choose(preset)}>{name}</button>;
    })}</div>
    {range('opacity', '사진 농도', 0, 100, '%', '배경 사진 농도')}
    {range('blur', '블러', 0, 30, 'px', '배경 블러')}
    <div className="ed-overlay-colors" role="group" aria-label="배경 덮개 색상">
      <span className="ed-lbl">덮을 색</span>
      <button className="btn btn-sm" disabled={disabled} aria-pressed={value.overlayOpacity === 0} onClick={() => choose({ overlayOpacity: 0 })}>없음</button>
      {[['#ffffff', '흰색'], ['#000000', '검은색'], ['#1428a0', '파란색']].map(([color, name]) => <button key={color} disabled={disabled} className={'ed-sw' + (value.overlayColor === color && value.overlayOpacity > 0 ? ' on' : '')} style={{ background: color }} aria-label={name + ' 덮기'} title={name} onClick={() => choose({ overlayColor: color, overlayOpacity: value.overlayOpacity || 45 })} />)}
      <label className="ed-sw ed-sw-custom" title="덮개 색 직접 고르기"><input type="color" disabled={disabled} aria-label="배경 덮개 색 직접 고르기" value={value.overlayColor} onChange={e => onChange({ overlayColor: e.target.value, overlayOpacity: value.overlayOpacity || 45 })} onPointerDown={onStart} onBlur={onEnd} /></label>
    </div>
    {range('overlayOpacity', '색상 덮기', 0, 100, '%', '배경 덮개 투명도')}
    <label className="ed-effects-toggle"><input type="checkbox" disabled={disabled} checked={value.dots > 0} onChange={e => choose({ dots: e.target.checked ? 100 : 0 })} />도트 효과</label>
    {value.dots > 0 && <>{range('dots', '도트 강도', 0, 100)}{range('dotSize', '도트 크기', 4, 32, 'px')}</>}
    <p className="ed-help">효과를 함께 적용할 수 있어요. ‘원본’을 누르면 모든 효과가 초기화돼요.</p>
  </div>;
}
