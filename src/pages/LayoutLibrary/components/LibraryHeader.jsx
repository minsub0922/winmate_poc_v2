import { LAYOUTS } from '../../../lib/catalog.js';

export function LibraryHeader() {
  return (
    <header className="tl-head">
      <div className="tl-title">
        <span className="eyebrow">WINMATE · 템플릿 라이브러리</span>
        <h1>PPT 레이아웃 템플릿 <span className="num">{LAYOUTS.length}</span></h1>
        <p>제안서에 쓰는 PPT 레이아웃을 모두 모았어요. 구분별로 둘러보거나 검색 · 필터로 좁혀 보세요. 누르면 크게 보고 PPTX로 받을 수 있어요.</p>
      </div>
    </header>
  );
}
