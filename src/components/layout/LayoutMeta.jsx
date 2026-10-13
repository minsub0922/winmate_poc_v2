import { PARTS, REQ_LABEL, partHue } from '../../lib/parts.js';
import { IND, S, P, CANVAS } from '../../lib/catalog.js';
import { ProductChip } from './ProductChip.jsx';

/** 레이아웃 메타데이터 표 — 파트 유형 · 언제 쓰나 · 묶음 · 업종/솔루션 · 필요한 정보 · 예시 제품 · 원본 장표. */
export function LayoutMeta({ l, compact = false }) {
  if (!l) return null;
  const pt = PARTS[l.p];
  const prods = (l.prods || []).filter((id) => P[id]);
  return (
    <dl className="meta-grid">
      <dt>파트 유형</dt>
      <dd><span className={'tag pt ' + partHue(l.p)}>{pt ? pt.label : l.p}</span>{l.p2 && PARTS[l.p2] ? <span className="tag" style={{ marginLeft: 4 }}>{PARTS[l.p2].label}</span> : null}</dd>
      <dt>언제 쓰나</dt><dd>{l.when || l.g}</dd>
      {!compact && <><dt>묶음</dt><dd>{l.g}</dd></>}
      <dt>업종 · 솔루션</dt><dd>{l.ind && IND[l.ind] ? IND[l.ind].name : '범용'}{l.sol && S[l.sol] ? ' · ' + S[l.sol].name + ' 전용' : ''}</dd>
      <dt>필요한 정보</dt><dd><div className="tagrow">{(l.req || []).map((r) => <span key={r} className="tag rq">{REQ_LABEL[r] || r}</span>)}</div></dd>
      {!compact && prods.length ? <><dt>예시 제품</dt><dd><div className="tagchips">{prods.map((id) => <ProductChip key={id} id={id} />)}</div></dd></> : null}
      {!compact && <><dt>원본</dt><dd><a href={CANVAS[l.c] ? CANVAS[l.c].url : '#'} target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>{CANVAS[l.c] ? CANVAS[l.c].name : l.c}</a></dd></>}
    </dl>
  );
}
