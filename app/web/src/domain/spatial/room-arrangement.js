// 공간 배치(칸) — 공간들은 행 · 열 칸에 놓인다. 기본은 공간 수에 따른 격자(왼쪽 위부터 차례로)이고,
// 공간을 끌어 빈 칸에 놓으면 그 공간의 칸(room.cell = { row, col })을 기억해 다시 만들 때도 그 자리에 둔다.
//   예) 한 줄에 셋 [A B C] 에서 C 를 A 아래 빈 칸으로 → [A B] / [C]
// 칸 사이 간격은 장면과 같다: 옆 0.22m(벽), 앞뒤 1.8m(복도).
import { roomGridColumns } from './template-composition.js';

export const ROOM_GAP = { x: .22, z: 1.8 };
const valid = (cell) => cell && Number.isInteger(cell.row) && Number.isInteger(cell.col);
const key = (cell) => cell.row + ':' + cell.col;

/** 빈 행 · 열을 없애고 0부터 다시 센다 */
export function normalizeCells(cells) {
  const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b), cols = [...new Set(cells.map((c) => c.col))].sort((a, b) => a - b);
  return cells.map((c) => ({ row: rows.indexOf(c.row), col: cols.indexOf(c.col) }));
}
export const defaultCells = (count) => { const cols = roomGridColumns(count); return Array.from({ length: count }, (_, i) => ({ row: Math.floor(i / cols), col: i % cols })); };
export const sameCells = (a, b) => a.length === b.length && a.every((c, i) => c.row === b[i].row && c.col === b[i].col);

/** 입력 공간들(room.cell 이 있을 수도 없을 수도)의 칸 — 칸이 없는 공간은 왼쪽 위부터 첫 빈 칸에 */
export function studioRoomCells(rooms) {
  if (!rooms.some((r) => valid(r.cell))) return defaultCells(rooms.length);
  const taken = new Set(), cells = rooms.map((r) => { if (!valid(r.cell) || taken.has(key(r.cell))) return null; taken.add(key(r.cell)); return { row: r.cell.row, col: r.cell.col }; });
  const placed = cells.filter(Boolean), minRow = Math.min(...placed.map((c) => c.row)), minCol = Math.min(...placed.map((c) => c.col));
  const cols = Math.max(roomGridColumns(rooms.length), Math.max(...placed.map((c) => c.col)) - minCol + 1);
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) continue;
    for (let n = 0; ; n++) { const cell = { row: minRow + Math.floor(n / cols), col: minCol + n % cols }; if (!taken.has(key(cell))) { taken.add(key(cell)); cells[i] = cell; break; } }
  }
  return normalizeCells(cells);
}

/** 장면의 공간들이 지금 놓인 칸 (scene.rooms 순서) — 기억해 둔 칸이 없으면 좌표에서 읽는다 */
export function sceneRoomCells(scene) {
  const rooms = scene.rooms;
  if (rooms.every((r) => valid(r.cell)) && new Set(rooms.map((r) => key(r.cell))).size === rooms.length) return normalizeCells(rooms.map((r) => r.cell));
  const band = (values) => { const sorted = [...values].sort((a, b) => a - b), starts = []; for (const v of sorted) if (!starts.length || v - starts.at(-1) > .5) starts.push(v); return (v) => starts.findLastIndex((s) => v >= s - .001); };
  // 줄은 z 로, 줄 안의 칸은 왼쪽부터 차례로 (줄마다 공간 너비가 달라 열이 어긋난 장면도 있다)
  const row = band(rooms.map((r) => r.z));
  const cells = rooms.map((r) => ({ row: row(r.z), col: rooms.filter((o) => row(o.z) === row(r.z) && o.x < r.x - .001).length }));
  return new Set(cells.map(key)).size === rooms.length ? normalizeCells(cells) : defaultCells(rooms.length);
}

/** 공간 하나를 칸(target)으로 — 다른 공간이 있는 칸이면 둘의 자리를 바꾼다. 달라지지 않으면 null. */
export function placeRoomCell(cells, index, target) {
  if (!valid(target) || !cells[index]) return null;
  const next = cells.map((c) => ({ ...c })), other = next.findIndex((c, i) => i !== index && c.row === target.row && c.col === target.col);
  if (other >= 0) next[other] = { ...cells[index] };
  next[index] = { row: target.row, col: target.col };
  const result = normalizeCells(next);
  return sameCells(result, normalizeCells(cells)) ? null : result;
}

/**
 * 공간을 끌어 놓을 수 있는 빈 칸들 — 지금 공간과 위 · 아래 · 옆으로 맞닿은 빈 칸(바깥쪽 한 줄 포함).
 * @returns [{ row, col, x, z }] x · z 는 그 칸 가운데의 장면 좌표(m)
 */
export function roomDropSlots(scene) {
  const rooms = scene.rooms; if (rooms.length < 2) return [];
  const cells = sceneRoomCells(scene), taken = new Set(cells.map(key));
  const rows = Math.max(...cells.map((c) => c.row)) + 1, cols = Math.max(...cells.map((c) => c.col)) + 1;
  const span = (count, at, start, size) => Array.from({ length: count }, (_, n) => { const own = rooms.filter((_, i) => cells[i][at] === n); return { start: Math.min(...own.map((r) => r[start])), size: Math.max(...own.map((r) => r[size])) }; });
  const colSpan = span(cols, 'col', 'x', 'width'), rowSpan = span(rows, 'row', 'z', 'depth');
  const centre = (spans, n, gap) => n < 0 ? spans[0].start - gap - spans[0].size / 2 : n >= spans.length ? spans.at(-1).start + spans.at(-1).size + gap + spans.at(-1).size / 2 : spans[n].start + spans[n].size / 2;
  const slots = [];
  for (let row = -1; row <= rows; row++) for (let col = -1; col <= cols; col++) {
    if (taken.has(key({ row, col })) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => taken.has(key({ row: row + dr, col: col + dc })))) continue;
    slots.push({ row, col, x: centre(colSpan, col, ROOM_GAP.x), z: centre(rowSpan, row, ROOM_GAP.z) });
  }
  return slots;
}
