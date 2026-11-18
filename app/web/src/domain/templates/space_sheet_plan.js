// 공간별 제안 — 제품 수에 따라 「공간별 대표 제품」 장을 어떻게 나누는가 (사용자 지시 2026-11-16).
//   3개 이하  제품마다 한 장(제품 1개 장)
//   4개 2/2 · 5개 3/2 · 6개 3/3 · 7개 4/3 · 8개 4/4   두 장으로 나눈다(제품 2 · 3 · 4개 장)
//   9개 이상  조감도도 나눠서 다시 시작 — 공간을 고르게 나눈 묶음마다 [조감도 → 제품 장 … → Map]
// 업종 Map 도 공간 수에 맞는 시트를 골라 쓴다 (사용자 지시 2026-11-16): 공간 2곳부터 8곳까지 — L_VS_MAP_2 … 8.
//   1곳   Map 을 두지 않는다
//   2~8곳 그 수의 시트 한 장 — 4곳 이하는 한 줄, 5곳부터 두 줄(3/2 · 3/3 · 4/3 · 4/4 — 제품 장 나눔과 같은 모양)
//   9곳 이상  조감도 묶음마다 한 장(9 → 5곳 Map + 4곳 Map)
// 공간별 제안에서는 공간 하나에 대표 제품 하나이므로 제품 수와 공간 수가 같다.
// 화면 없이 계산만 한다. 지금은 관리자 '전체 파트' 목록(admin/web/src/part-flows.js)이 쓴다 — 실제 덱(표준 제안서 44종)은 아직 제품마다 한 장이다.
// 장: L_VS_SPACE_1 · 2 · 3 · 4 · L_VS_MAP_2 … 8 (app/scripts/vertical_standard/space_sheets.py)
export const SPACE_SHEET = { single: 3, max: 8, per: 4 }; // 한 장씩 쓰는 제품 수 · 조감도 하나가 맡는 제품 수 · 한 장에 놓는 제품 수
export const spaceSheetId = (per) => 'L_VS_SPACE_' + per;
export const SPACE_MAP = { min: 2, max: 8 }; // Map 한 장이 맡는 공간 수 — 조감도 하나가 맡는 수(SPACE_SHEET.max)와 같은 상한
export const spaceMapId = (n) => 'L_VS_MAP_' + n;

/** Map 한 장의 칸 배치 — 공간 n곳(2~8) → 줄마다 칸 수: 4 → [4] · 5 → [3, 2] · 8 → [4, 4] */
export function spaceMapRows(n) {
  if (!Number.isInteger(n) || n < SPACE_MAP.min || n > SPACE_MAP.max) throw new RangeError('Map 은 공간 ' + SPACE_MAP.min + '~' + SPACE_MAP.max + '곳만 다룹니다: ' + n);
  return n <= SPACE_SHEET.per ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
}

/** 조감도 하나가 맡는 제품 n개(1~8) → 장마다 놓는 제품 수 — 3 → [1, 1, 1] · 5 → [3, 2] · 8 → [4, 4] */
export function spaceSheetSplit(n) {
  if (!Number.isInteger(n) || n < 1 || n > SPACE_SHEET.max) throw new RangeError('제품 수는 1~' + SPACE_SHEET.max + ' 이어야 합니다: ' + n);
  if (n <= SPACE_SHEET.single) return Array(n).fill(1);
  return [Math.ceil(n / 2), Math.floor(n / 2)];
}

/**
 * 제품 n개 → 묶음(조감도 하나 + 제품 장들)
 *   [{ from, to, count, sheets: [{ f, per, from, to }], map }] — from · to 는 제품(= 조감도 번호) 차례, 1부터
 *   map: 그 묶음의 Map 시트(공간 2곳 이상일 때) — 없으면 null
 *   8개를 넘으면 묶음을 늘려 고르게 나눈다(9 → 5 + 4 · 10 → 5 + 5 · 17 → 6 + 6 + 5). 앞 묶음이 크거나 같다.
 */
export function spaceSheetPlan(n) {
  if (!Number.isInteger(n) || n < 1) return [];
  const groups = Math.ceil(n / SPACE_SHEET.max);
  const out = []; let at = 1;
  for (let g = 0; g < groups; g++) {
    const count = Math.floor(n / groups) + (g < n % groups ? 1 : 0);
    let k = at;
    const sheets = spaceSheetSplit(count).map((per) => { const s = { f: spaceSheetId(per), per, from: k, to: k + per - 1 }; k += per; return s; });
    out.push({ from: at, to: at + count - 1, count, sheets, map: count >= SPACE_MAP.min ? spaceMapId(count) : null });
    at += count;
  }
  return out;
}

/** 공간 n곳 → Map 장들 — 묶음마다 한 장: [{ f, spaces, from, to, rows }]. 1곳이면 없다 */
export function spaceMapPlan(n) {
  return spaceSheetPlan(n).filter((g) => g.map).map((g) => ({ f: g.map, spaces: g.count, from: g.from, to: g.to, rows: spaceMapRows(g.count) }));
}

/** 제품(공간) n개일 때 파트의 장 수 — 간지 1 + 묶음마다 [조감도 1 + 제품 장 + Map 1(공간 2곳 이상)] */
export function spacePartSheets(n) {
  const plan = spaceSheetPlan(n);
  return 1 + plan.reduce((a, g) => a + 1 + g.sheets.length + (g.map ? 1 : 0), 0);
}

/** '2/2' · '3/2' · '1/1/1' — 묶음이 여럿이면 ' + ' 로 잇는다('3/2 + 2/2') */
export const spaceSplitLabel = (n) => spaceSheetPlan(n).map((g) => g.sheets.map((s) => s.per).join('/')).join(' + ');

/** Map 칸 배치 이름 — 공간 n곳: '4' · '3/2', 묶음이 여럿이면 '3/2 + 4', 1곳이면 '' */
export const spaceMapLabel = (n) => spaceMapPlan(n).map((m) => m.rows.join('/')).join(' + ');

/** 한 장에 제품 per개를 놓는 시트를 쓰는 제품 수 — 1~max 범위에서. per 2 → [4, 5] */
export function spaceSheetUsedFor(per) {
  const out = [];
  for (let n = 1; n <= SPACE_SHEET.max; n++) if (spaceSheetSplit(n).includes(per)) out.push(n);
  return out;
}
