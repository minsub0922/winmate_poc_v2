// 「전체 파트」 팝업 — 제품 스펙(Spec)의 새 장: 사양 줄 수에 맞춘 시트 3종(L_TOC_PSPEC_R12 · R24 · R36)의 미리보기 자료.
//   사용자 지시(2026-11-16): 제품마다 사양 줄 수가 다르다 → 줄 수에 맞는 시트를 골라 쓴다 · 장은 제품마다 한 장 · 위쪽 대표 스펙 3칸은 없앤다.
//   규칙: app/web/src/domain/templates/spec_sheet_plan.js · 목록 정의: part-flows.js(PART_CATALOG.spec → specPart)
//   시트(실제 제품 사양을 채운 예시): spec-sheets.json — build/toc/gen_spec_sheets.py 가 만든다. 레이아웃 라이브러리 · 실제 덱에는 아직 없다(실제 덱 반영 전).
//   그리는 것은 '시트 여러 종' 표시(space-route.jsx RoutedSheets)를 그대로 쓴다 — 여기서는 자료만 준다.
let pending = null;
/** f → { f, code, name, when, per, html } (space-route.jsx loadSpaceSheets 와 같은 모양) */
export function loadSpecSheets() {
  if (!pending) {
    pending = import('./spec-sheets.json', { with: { type: 'json' } }).then(m => {
      const d = m.default || m; const images = d.images || {};
      const fill = html => html.replace(/@img\d+@/g, k => images[k] || '');
      return Object.fromEntries((d.sheets || []).map(s => [s.f, { f: s.f, code: s.code, name: s.name, when: s.when, per: s.per, html: fill(s.html) }]));
    });
    pending.catch(() => { pending = null; });
  }
  return pending;
}
