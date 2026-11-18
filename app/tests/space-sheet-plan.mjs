// 공간별 제안 — 제품 수에 따라 「공간별 대표 제품」 장을 나누는 규칙(app/web/src/domain/templates/space_sheet_plan.js)
//   node --test app/tests/space-sheet-plan.mjs
// 규칙(2026-11-16 사용자): 제품 3개 이하는 한 장에 제품 하나 · 4개 2/2 · 5개 3/2 · 6개 3/3 · 7개 4/3 · 8개 4/4 · 그 이상은 조감도도 나눠서 다시 시작.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPACE_SHEET, SPACE_MAP, spaceSheetSplit, spaceSheetPlan, spacePartSheets, spaceSplitLabel, spaceSheetUsedFor, spaceSheetId, spaceMapId, spaceMapRows, spaceMapPlan, spaceMapLabel } from '../web/src/domain/templates/space_sheet_plan.js';

test('조감도 하나 — 3개 이하는 제품마다 한 장, 4~8개는 두 장으로', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(spaceSheetSplit), [[1], [1, 1], [1, 1, 1], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4]]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(spaceSplitLabel), ['1', '1/1', '1/1/1', '2/2', '3/2', '3/3', '4/3', '4/4']);
  for (const bad of [0, 9, 2.5, -1]) assert.throws(() => spaceSheetSplit(bad), RangeError);
});

test('8개를 넘으면 조감도부터 다시 — 묶음을 고르게 나누고 묶음마다 같은 규칙', () => {
  assert.equal(spaceSheetPlan(8).length, 1);
  assert.deepEqual(spaceSheetPlan(9).map(g => g.count), [5, 4]);
  assert.deepEqual(spaceSheetPlan(10).map(g => g.count), [5, 5]);
  assert.deepEqual(spaceSheetPlan(16).map(g => g.count), [8, 8]);
  assert.deepEqual(spaceSheetPlan(17).map(g => g.count), [6, 6, 5]);
  assert.equal(spaceSplitLabel(9), '3/2 + 2/2');
  assert.equal(spaceSplitLabel(10), '3/2 + 3/2');
  for (let n = 1; n <= 40; n++) {
    const plan = spaceSheetPlan(n);
    assert.equal(plan.length, Math.ceil(n / SPACE_SHEET.max), 'n=' + n);
    assert.ok(plan.every(g => g.count >= 1 && g.count <= SPACE_SHEET.max));
    assert.ok(plan.every((g, i) => i === 0 || plan[i - 1].count >= g.count), '앞 묶음이 크거나 같다');
    // 제품(= 조감도 번호)이 빠짐없이 차례대로 한 번씩
    const seen = plan.flatMap(g => g.sheets.flatMap(s => Array.from({ length: s.per }, (_, k) => s.from + k)));
    assert.deepEqual(seen, Array.from({ length: n }, (_, k) => k + 1), 'n=' + n);
    for (const g of plan) {
      assert.equal(g.from, g.sheets[0].from); assert.equal(g.to, g.sheets[g.sheets.length - 1].to); assert.equal(g.to - g.from + 1, g.count);
      for (const s of g.sheets) { assert.equal(s.f, spaceSheetId(s.per)); assert.ok(s.per >= 1 && s.per <= SPACE_SHEET.per); assert.equal(s.to - s.from + 1, s.per); }
    }
  }
  assert.deepEqual(spaceSheetPlan(0), []);
});

test('파트 장 수 — 간지 + 묶음마다 [조감도 + 제품 장 + Map(공간 2곳 이상)]', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(spacePartSheets), [3, 5, 6, 5, 5, 5, 5, 5, 9, 9]);
});

// 규칙(2026-11-16 사용자): 업종 Map 도 공간 수에 맞는 시트를 골라 쓴다 — 공간 2곳부터만 다루고 2곳에서 최대 8곳까지.
test('업종 Map — 공간 2~8곳은 그 수의 시트 한 장 · 4곳 이하는 한 줄, 5곳부터 두 줄', () => {
  assert.deepEqual(SPACE_MAP, { min: 2, max: 8 });
  assert.equal(SPACE_MAP.max, SPACE_SHEET.max, 'Map 한 장이 맡는 공간 수 = 조감도 하나가 맡는 수');
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map(spaceMapRows), [[2], [3], [4], [3, 2], [3, 3], [4, 3], [4, 4]]);
  for (const bad of [0, 1, 9, 10, 3.5]) assert.throws(() => spaceMapRows(bad), RangeError);
  for (let n = 2; n <= 8; n++) {
    assert.deepEqual(spaceMapPlan(n), [{ f: spaceMapId(n), spaces: n, from: 1, to: n, rows: spaceMapRows(n) }]);
    assert.equal(spaceMapId(n), 'L_VS_MAP_' + n);
    assert.equal(spaceMapRows(n).reduce((a, b) => a + b, 0), n);
  }
  assert.deepEqual([2, 3, 4, 5, 6, 7, 8].map(spaceMapLabel), ['2', '3', '4', '3/2', '3/3', '4/3', '4/4']);
});

test('업종 Map — 1곳은 두지 않고, 8곳을 넘으면 조감도 묶음마다 한 장', () => {
  assert.deepEqual(spaceMapPlan(1), []);
  assert.equal(spaceMapLabel(1), '');
  assert.equal(spaceSheetPlan(1)[0].map, null);
  assert.deepEqual(spaceMapPlan(9).map(m => [m.f, m.from, m.to]), [['L_VS_MAP_5', 1, 5], ['L_VS_MAP_4', 6, 9]]);
  assert.deepEqual(spaceMapPlan(10).map(m => m.f), ['L_VS_MAP_5', 'L_VS_MAP_5']);
  assert.equal(spaceMapLabel(9), '3/2 + 4');
  for (let n = 2; n <= 40; n++) {
    const plan = spaceSheetPlan(n); const maps = spaceMapPlan(n);
    assert.equal(maps.length, plan.length, 'n=' + n); // 묶음마다 한 장
    assert.ok(maps.every(m => m.spaces >= SPACE_MAP.min && m.spaces <= SPACE_MAP.max), 'n=' + n);
    assert.deepEqual(maps.map(m => [m.from, m.to]), plan.map(g => [g.from, g.to]));
    assert.equal(maps.reduce((a, m) => a + m.spaces, 0), n);
  }
});

test('시트 한 종을 쓰는 제품 수', () => {
  assert.deepEqual(spaceSheetUsedFor(1), [1, 2, 3]);
  assert.deepEqual(spaceSheetUsedFor(2), [4, 5]);
  assert.deepEqual(spaceSheetUsedFor(3), [5, 6, 7]);
  assert.deepEqual(spaceSheetUsedFor(4), [7, 8]);
});
