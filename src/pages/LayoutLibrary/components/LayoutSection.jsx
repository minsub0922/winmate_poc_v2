import { Icon } from '../../../components/common/Icon.jsx';
import { DECK } from '../../../lib/catalog.js';
import { PARTS, partHue } from '../../../lib/parts.js';

/**
 * 섹션 하나 — 머리말(파트 유형 아이콘 또는 원본 장표 번호) + 카드 격자 + 더 보기/접기.
 *   s         buildSections() 의 섹션        cols  격자 열 수       cap  접혀 있을 때 보일 카드 수
 *   expanded  더 보기를 눌렀는지              renderCard(l) 카드 그리기
 */
export function LayoutSection({ s, cols, cap, expanded, onToggle, searching, renderCard }) {
  const shown = expanded ? s.items : s.items.slice(0, cap);
  const pt = s.part ? PARTS[s.part] : null;
  return (
    <section className="tl-sec" aria-label={pt ? pt.label : s.title || '검색 결과'}>
      {s.key !== '_hits' && (
        <div className="tl-sec-h">
          {pt ? <span className={'tl-ic ' + partHue(s.part)}><Icon name={pt.icon} size={15} /></span> : <span className="tl-deck num">{DECK[s.deck] ? DECK[s.deck].label.split(' ')[0] : s.deck}</span>}
          <div className="tl-sec-t">
            <h2>{pt ? pt.label : s.title} <span className="num">{s.items.length}</span></h2>
            <p>{pt ? pt.desc : (DECK[s.deck] ? DECK[s.deck].label + ' · ' : '') + (s.sub || '')}</p>
          </div>
        </div>
      )}
      {searching && <div className="tl-hint"><Icon name="info" size={13} />레이아웃 이름 · 용도 · 예시 문구 · 업종 · 솔루션에서 찾았어요. 위 구분과 필터로 더 좁힐 수 있어요.</div>}
      <div className="tl-grid" style={{ gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))' }}>{shown.map(renderCard)}</div>
      {shown.length < s.items.length && <button className="btn btn-ghost btn-sm tl-more" onClick={() => onToggle(true)}>{s.items.length - shown.length}장 더 보기 <Icon name="chevD" size={14} /></button>}
      {expanded && s.items.length > cap && <button className="btn btn-ghost btn-sm tl-more" onClick={() => onToggle(false)}>접기 <Icon name="chevU" size={14} /></button>}
    </section>
  );
}
