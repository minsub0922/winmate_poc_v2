// 「전체 파트」 팝업 — 파트 카드에 기승전결 색을 입힌다(자리 · 색 정의는 part-arc.js).
//   카드: 왼쪽 띠 · 테두리 · 파트 버블 · 유형 표식이 그 파트의 색, 버블 귀퉁이에 자리 표식(기 · 승 · 전 · 결) 한 글자.
import React from 'react';
import { partArc } from './part-arc.js';
import './part-arc.css';

export { partArc };
/** 카드에 주는 색 값 — 파트 유형의 색(--hc · --hb) 자리를 그 파트의 기승전결 색으로 */
export const arcStyle = arc => ({ '--hc': arc.color, '--hb': arc.soft, '--arc': arc.color, '--arc-line': arc.line });
/** 파트 버블 귀퉁이의 자리 표식 */
export function ArcMark({ arc }) {
  return <span className="lpx-arc" title={arc.stage.hint}>{arc.stage.mark}</span>;
}
