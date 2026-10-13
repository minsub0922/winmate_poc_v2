import { useEffect, useRef, useState } from 'react';
import { useWidth } from '../../components/slide/useWidth.js';
import { loadUi, saveUi } from '../../lib/uiPrefs.js';
import { DEFAULT_FILTER } from './constants.js';
import { pass, facetCounts, buildSections, scopeName, activeFilterCount } from './filtering.js';
import { useLayoutSearch } from './useLayoutSearch.js';
import { LibraryHeader } from './components/LibraryHeader.jsx';
import { LibraryToolbar } from './components/LibraryToolbar.jsx';
import { ResultSummary, EmptyState } from './components/ResultSummary.jsx';
import { LayoutSection } from './components/LayoutSection.jsx';
import { LayoutCard } from './components/LayoutCard.jsx';
import { TemplateDetailModal } from './components/TemplateDetailModal.jsx';
import { ExportListModal } from './components/ExportListModal.jsx';
import './LayoutLibraryPage.css';

/**
 * PPT 레이아웃 템플릿 라이브러리
 *   - 구분 1(파트 유형별 6묶음) / 구분 2(원본 장표별) 로 둘러보기
 *   - 자유 문장 검색(lib/search.js BM25) + 업종 · 솔루션 · 이미지 칸 · 필요한 정보 필터 (개수는 필터마다 따로 계산)
 *   - 카드를 누르면 크게 보기(← → 로 넘기기) · 한 장 또는 지금 목록 전체(최대 120장)를 PPTX로 받기
 *   - 필터 상태는 브라우저에 기억(lib/uiPrefs.js)
 */
export function LayoutLibraryPage() {
  const [f, setF] = useState(() => ({ ...DEFAULT_FILTER, ...(loadUi().lib || {}) }));
  const [open, setOpen] = useState(null); // 크게 보기: flat 목록의 위치
  const [more, setMore] = useState({}); // 섹션 키 → 더 보기 펼침
  const [exp, setExp] = useState(false); // 목록 PPTX 받기 대화상자
  const gridRef = useRef(null);
  const gw = useWidth(gridRef, 1000);
  useEffect(() => { saveUi({ ...loadUi(), lib: f }); }, [f]);
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setMore({}); };
  const reset = () => { setF((x) => ({ ...DEFAULT_FILTER, by: x.by })); setMore({}); };

  const q = f.q.trim();
  const { base, hitOf } = useLayoutSearch(q);
  const list = base.filter((l) => pass(l, f));
  const counts = facetCounts(base, f);
  const sections = buildSections(list, f, q);
  const flat = sections.flatMap((s) => s.items);
  const cols = gw < 520 ? 2 : 3; // 넓은 화면 3열, 좁은 폰 2열
  const cap = sections.length > 1 ? cols * 2 : Infinity; // 섹션이 여럿이면 처음엔 두 줄만
  const scope = scopeName(f, q);

  return (
    <div className="tl" id="tl-scroll">
      <div className="tl-in">
        <LibraryHeader />
        <LibraryToolbar f={f} set={set} reset={reset} counts={counts} showReset={activeFilterCount(f) > 0 || !!q} />
        <ResultSummary count={list.length} scope={scope} searching={!!q} onExport={() => setExp(true)} />
        {!list.length && <EmptyState q={q} onQuery={(t) => set({ q: t })} onReset={reset} />}

        <div ref={gridRef} className="tl-sections">
          {sections.filter((s) => s.items.length).map((s) => (
            <LayoutSection key={s.key} s={s} cols={cols} cap={cap} searching={!!q}
              expanded={!!more[s.key]} onToggle={(v) => setMore((m) => ({ ...m, [s.key]: v }))}
              renderCard={(l) => <LayoutCard key={l.f} l={l} hit={hitOf[l.f]} showPart={!!q || f.by !== 'part'} onOpen={() => setOpen(flat.indexOf(l))} />} />
          ))}
        </div>
      </div>
      {open != null && flat[open] && <TemplateDetailModal list={flat} index={open} onNav={setOpen} onClose={() => setOpen(null)} />}
      {exp && <ExportListModal list={list} scope={scope} onClose={() => setExp(false)} />}
    </div>
  );
}
