// 파트 버블 hover 의 대표 흐름 — 그 목차의 장을 덱 순서대로, 공간 · 여정 · 솔루션 · 사례 수만큼 늘어나는 장은 한 칸으로 접고 「공간마다 × n」만 붙인다
// (사용자 지시 2026-11-16 — 모든 변형을 다 늘어놓으면 복잡하다). 관리자 「레이아웃 구성 관리」 추천 구성 버블(admin/web/src/layouts.jsx PartPeek)과
// Storyboard 추천 구성 버블(components/layout-compose.jsx)이 함께 쓴다. 새로 늘어나는 장 묶음은 REPEAT 에 더한다.
// L_TOC_SCN_S<m>: 고객/공간 시나리오의 공간별 시나리오(2026-11-17 2차 — 공간 3곳씩 한 장, 3곳 · 2곳 시트가 섞여도 한 칸으로 접는다)
export const REPEAT = [[/^L_VS_SPACE$/, '공간마다'], [/^L_TOC_SCN_S\d$/, '공간 3곳씩'], [/^L_TOC_JOURNEY/, '여정마다'], [/^L_VS_SOL_/, '솔루션마다'], [/^L_VS_CASE$/, '사례마다']];
export const repeatOf = (f) => { const r = REPEAT.find(([re]) => re.test(f)); return r ? r[1] : null; };
/** 덱 한 목차의 장([{ f, … }]) → 대표 흐름 [{ f, unit, n, first }] — 이어지는 같은 반복 장(같은 레이아웃 · 같은 반복 묶음)은 첫 장 하나로 접고 n 을 센다. first: 접은 첫 장(원래 항목) */
export function representFlow(slides) {
  const out = [];
  for (const x of slides) {
    const unit = repeatOf(x.f); const last = out[out.length - 1];
    if (last && (unit ? last.unit === unit : last.f === x.f)) { last.n += 1; continue; }
    out.push({ f: x.f, unit, n: 1, first: x });
  }
  return out;
}
