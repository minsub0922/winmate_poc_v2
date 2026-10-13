import { P } from '../../lib/catalog.js';
import { Thumb } from '../thumb/Thumb.jsx';

const bits = (s, n) => String(s || '').split(' · ').filter(Boolean).slice(0, n).join(' · ');

/** 제품 칩 — 썸네일 + 모델명 + 사양 두 가지. (원본 앱 tagcard.jsx TagChip 의 제품 모양) */
export function ProductChip({ id }) {
  const x = P[id];
  if (!x) return null;
  const line = bits(x.spec, 2);
  return (
    <span className="tagchip product" title={x.name + ' · ' + [x.model, line].filter(Boolean).join(' · ')}>
      <Thumb r={'product:' + id} mini className="tgc-th" />
      <span className="tgc-t"><b>{x.model}</b><span className="num">{line}</span></span>
    </span>
  );
}
