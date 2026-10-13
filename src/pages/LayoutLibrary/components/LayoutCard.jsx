import { FitSlide } from '../../../components/slide/Slide.jsx';
import { Thumb } from '../../../components/thumb/Thumb.jsx';
import { IND, S } from '../../../lib/catalog.js';
import { PARTS, partHue } from '../../../lib/parts.js';

/**
 * 레이아웃 카드 — 미리보기(화면 근처에 오면 그림) · 이름 · 언제 쓰나 · (검색 중) 일치한 문구 · 태그.
 *   hit       검색 결과 정보({snip})        showPart  파트 유형 태그를 보일지(검색 중이거나 원본 장표별 보기)
 */
export function LayoutCard({ l, hit, showPart, onOpen }) {
  return (
    <button className="tl-card" onClick={onOpen} aria-label={l.name + ' 크게 보기'}>
      <div className="tl-thumb"><FitSlide f={l.f} lazy /></div>
      <div className="tl-info">
        <div className="tl-name"><b>{l.name}</b></div>
        <p className="tl-when">{l.when || l.g}</p>
        {hit && hit.snip ? <p className="tl-snip">{hit.snip}</p> : null}
        <div className="tl-tags">
          {showPart && PARTS[l.p] ? <span className={'tag pt ' + partHue(l.p)}>{PARTS[l.p].label}</span> : null}
          {l.ind && IND[l.ind] ? <span className="tag">{IND[l.ind].name}</span> : null}
          {l.sol && S[l.sol] ? <span className="tag tl-sol" title={S[l.sol].name + ' · ' + S[l.sol].cat}><Thumb r={'solution:' + l.sol} mini className="tl-sol-th" />{S[l.sol].name}</span> : null}
        </div>
      </div>
    </button>
  );
}
