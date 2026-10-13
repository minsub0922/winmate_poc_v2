import { Icon } from '../../../components/common/Icon.jsx';
import { MAX_EXPORT, QUICK_QUERIES } from '../constants.js';

/** 결과 개수 · 범위 · '이 목록 PPTX로 받기' */
export function ResultSummary({ count, scope, searching, onExport }) {
  return (
    <div className="tl-sum">
      <span><b className="num">{count}</b>장{scope ? <span className="muted"> · {scope}</span> : null}{searching ? <span className="faint"> · 관련도순</span> : null}</span>
      <span className="sp" />
      {count > MAX_EXPORT && <span className="faint tl-cap">{MAX_EXPORT}장 이하로 좁히면 한 파일로 받을 수 있어요</span>}
      <button className="btn btn-sm" disabled={!count || count > MAX_EXPORT} onClick={onExport}>
        <Icon name="download" size={14} />이 목록 PPTX로 받기
      </button>
    </div>
  );
}

/** 결과가 없을 때 — 검색 중이면 예시 검색어, 아니면 필터 초기화 */
export function EmptyState({ q, onQuery, onReset }) {
  if (q) {
    return (
      <div className="tl-empty">
        <b>“{q}”와 맞는 레이아웃이 없어요</b>
        <span>다른 표현으로 적거나 필터를 풀어 보세요.</span>
        <div className="chips" style={{ justifyContent: 'center' }}>{QUICK_QUERIES.map((t) => <button key={t} className="qchip" onClick={() => onQuery(t)}>{t}</button>)}</div>
      </div>
    );
  }
  return (
    <div className="tl-empty"><b>조건에 맞는 레이아웃이 없어요</b><span>필터를 하나씩 풀어 보세요.</span><button className="btn btn-sm" onClick={onReset}>필터 초기화</button></div>
  );
}
