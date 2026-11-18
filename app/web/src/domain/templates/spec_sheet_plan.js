// 제품 스펙(Spec) — 제품마다 사양 줄 수가 다르다 (사용자 지시 2026-11-16).
//   · 장은 제품마다 한 장 — 파트의 장 수 = 간지 + 제품 수
//   · 위쪽 대표 스펙 3칸(숫자 3)은 없다 — 사양 표가 그 자리부터 쓴다
//   · 사양 줄 수에 맞는 시트를 고른다: 12줄까지 1열 · 24줄까지 2열 · 36줄까지 2열(촘촘하게)
//   · 36줄을 넘는 제품은 우선순위가 높은 36줄만 싣는다 — 장을 늘리지 않는다(장 수는 제품 수 그대로)
// 화면 없이 계산만 한다. 지금은 관리자 '전체 파트' 목록(admin/web/src/part-flows.js)이 쓴다 —
//   실제 덱(제품 제안서의 Spec)은 아직 L_TOC_PSPEC(숫자 3 + 사양 8줄 고정)이다.
// 장: L_TOC_PSPEC_R12 · R24 · R36 (build/toc/gen_spec_sheets.py — 같은 값을 쓴다. 바꾸면 그 스크립트를 다시 돌린다)
export const SPEC_SHEET = [
  { cap: 12, cols: 1, per: 12 },
  { cap: 24, cols: 2, per: 12 },
  { cap: 36, cols: 2, per: 18 },
]; // cap: 한 장에 싣는 사양 줄 수 · cols: 열 수 · per: 한 열의 줄 수
export const SPEC_MAX = SPEC_SHEET[SPEC_SHEET.length - 1].cap;
export const specSheetId = (cap) => 'L_TOC_PSPEC_R' + cap;

/** 사양 n줄 → 쓰는 시트 — { f, cap, cols, per, shown(싣는 줄 수), cut(싣지 못하는 줄 수) } */
export function specSheetFor(n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('사양 줄 수는 1 이상이어야 합니다: ' + n);
  const tier = SPEC_SHEET.find((t) => n <= t.cap) || SPEC_SHEET[SPEC_SHEET.length - 1];
  return { f: specSheetId(tier.cap), ...tier, shown: Math.min(n, tier.cap), cut: Math.max(0, n - tier.cap) };
}

/** 한 장에 싣는 사양 n줄을 열마다 몇 줄씩 — 1열은 [n], 2열은 왼쪽이 크거나 같게 고르게 나눈다: 19 → [10, 9] */
export function specColumns(n) {
  const s = specSheetFor(n);
  return s.cols === 1 ? [s.shown] : [Math.ceil(s.shown / 2), Math.floor(s.shown / 2)];
}

/** 시트마다 맡는 사양 줄 수 범위 — [{ f, cap, cols, per, from, to }] : 1–12 · 13–24 · 25–36 */
export function specSheetRanges() {
  return SPEC_SHEET.map((t, i) => ({ f: specSheetId(t.cap), ...t, from: i ? SPEC_SHEET[i - 1].cap + 1 : 1, to: t.cap }));
}

/** 제품 n개일 때 파트의 장 수 — 간지 1 + 제품마다 한 장 */
export const specPartSheets = (n) => 1 + Math.max(0, n);
