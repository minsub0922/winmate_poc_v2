import { Icon } from '../../../components/common/Icon.jsx';
import { INDUSTRIES, SOLUTIONS, DECKS } from '../../../lib/catalog.js';
import { PARTS, REQ_LABEL } from '../../../lib/parts.js';
import { PART_GROUPS, IMG_OPTS, REQ_KEYS } from '../constants.js';

/**
 * 상단 도구 줄(스크롤해도 위에 붙어 있음): 검색 · 구분 기준 · 구분 탭 · 파트 유형 칩 · 필터 4개.
 *   f 필터 상태 · set(patch) 상태 바꾸기 · reset() 초기화 · counts facetCounts() 결과 · showReset 초기화 버튼 표시
 */
export function LibraryToolbar({ f, set, reset, counts, showReset }) {
  const { tabCounts, tabTotal, partCounts, indCounts, solCounts, imgCounts, reqCounts, nInd } = counts;
  const tabs = f.by === 'part'
    ? PART_GROUPS.map((g) => ({ k: g.k, label: g.label, hue: g.hue }))
    : DECKS.map((d) => ({ k: d.k, label: d.label, title: d.full }));
  const curGroup = f.by === 'part' && f.tab !== 'all' ? PART_GROUPS.find((g) => g.k === f.tab) : null;

  return (
    <div className="tl-tools">
      <div className="tl-row">
        <form className="tl-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <Icon name="search" size={16} />
          <label className="sr" htmlFor="tl-q">레이아웃 검색</label>
          <input id="tl-q" className="input" value={f.q} placeholder="찾는 장면을 적어 보세요 · 예) 경쟁사와 비교하는 표, 매장 하루 동선" onChange={(e) => set({ q: e.target.value })} />
          {f.q && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="검색어 지우기" onClick={() => set({ q: '' })}><Icon name="x" size={14} /></button>}
        </form>
        <div className="seg tl-by" role="group" aria-label="구분 기준">
          <button aria-pressed={f.by === 'part'} onClick={() => set({ by: 'part', tab: 'all', part: '' })}>파트 유형별</button>
          <button aria-pressed={f.by === 'deck'} onClick={() => set({ by: 'deck', tab: 'all', part: '' })}>원본 장표별</button>
        </div>
      </div>

      <div className="tl-tabs" role="tablist" aria-label="구분">
        <button role="tab" aria-selected={f.tab === 'all'} className="tl-tab" onClick={() => set({ tab: 'all', part: '' })}>전체 <span className="num">{tabTotal}</span></button>
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={f.tab === t.k} title={t.title} className={'tl-tab' + (t.hue ? ' h-' + t.hue : '')} disabled={!tabCounts[t.k] && f.tab !== t.k} onClick={() => set({ tab: t.k, part: '' })}>
            {t.hue && <i className="dot" />}{t.label} <span className="num">{tabCounts[t.k] || 0}</span>
          </button>
        ))}
      </div>

      {curGroup && (
        <div className="tl-subs" aria-label={curGroup.label + ' 파트 유형'}>
          <button className="qchip" aria-pressed={!f.part} onClick={() => set({ part: '' })}>{curGroup.label} 전체</button>
          {curGroup.parts.map((p) => (
            <button key={p} className="qchip" aria-pressed={f.part === p} disabled={!partCounts[p]} onClick={() => set({ part: f.part === p ? '' : p })}>{PARTS[p].label} <span className="num">{partCounts[p] || 0}</span></button>
          ))}
        </div>
      )}

      <div className="tl-filters">
        <label className="sr" htmlFor="tl-ind">업종</label>
        <select id="tl-ind" className={'select tl-sel' + (f.ind ? ' on' : '')} value={f.ind} onChange={(e) => set({ ind: e.target.value })}>
          <option value="">업종 전체</option>
          <option value="_gen">범용 ({indCounts._gen || 0})</option>
          <option value="_ind">업종 맞춤 전체 ({nInd})</option>
          <optgroup label="업종">
            {INDUSTRIES.map((i) => <option key={i.code} value={i.code} disabled={!indCounts[i.code]}>{i.name} ({indCounts[i.code] || 0})</option>)}
          </optgroup>
        </select>
        <label className="sr" htmlFor="tl-sol">솔루션</label>
        <select id="tl-sol" className={'select tl-sel' + (f.sol ? ' on' : '')} value={f.sol} onChange={(e) => set({ sol: e.target.value })}>
          <option value="">솔루션 전체</option>
          <option value="_none">솔루션 전용 제외 ({solCounts._none || 0})</option>
          <optgroup label="이 솔루션이 들어간 레이아웃">
            {SOLUTIONS.filter((s) => solCounts[s.id]).map((s) => <option key={s.id} value={s.id}>{s.name} ({solCounts[s.id]})</option>)}
          </optgroup>
        </select>
        <label className="sr" htmlFor="tl-img">이미지 칸</label>
        <select id="tl-img" className={'select tl-sel' + (f.img ? ' on' : '')} value={f.img} onChange={(e) => set({ img: e.target.value })}>
          {IMG_OPTS.map(([k, t]) => <option key={k} value={k}>{t}{k ? ' (' + (imgCounts[k] || 0) + ')' : ''}</option>)}
        </select>
        <label className="sr" htmlFor="tl-req">필요한 정보</label>
        <select id="tl-req" className={'select tl-sel' + (f.req ? ' on' : '')} value={f.req} onChange={(e) => set({ req: e.target.value })}>
          <option value="">필요한 정보 전체</option>
          {REQ_KEYS.map((k) => <option key={k} value={k} disabled={!reqCounts[k]}>{REQ_LABEL[k]} 필요 ({reqCounts[k] || 0})</option>)}
        </select>
        {showReset && <button className="btn btn-ghost btn-sm" onClick={reset}><Icon name="refresh" size={13} />초기화</button>}
      </div>
    </div>
  );
}
