// 공간 배치(칸) — 공간을 끌어 빈 칸에 놓아 배치 자체를 바꾼다 (web/src/domain/spatial/room-arrangement.js · room-ops.js moveRoom)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultCells, normalizeCells, placeRoomCell, roomDropSlots, sceneRoomCells, studioRoomCells } from '../web/src/domain/spatial/room-arrangement.js';
import { addRoom, moveRoom, removeRoom, swapRooms } from '../web/src/domain/spatial/room-ops.js';
import { packStudioRooms, studioFormFromScene } from '../web/src/domain/spatial/studio-form.js';
import { validateScene } from '../web/src/domain/spatial/scene.js';

const library = JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json', import.meta.url)));
const cellsOf = (list) => list.map((c) => c.row + ':' + c.col).join(' ');

// 기본 배치는 예전과 같다 (칸을 기억한 공간이 없을 때)
const sized = (n) => Array.from({ length: n }, () => ({ kind: 'lounge', width: 7.2, depth: 6.3 }));
assert.equal(cellsOf(studioRoomCells(sized(3))), cellsOf(defaultCells(3)));
assert.deepEqual(packStudioRooms(sized(3)).rectangles.map((r) => [r.x, r.z]), [[0, 0], [7.42, 0], [14.84, 0]]);
// 한 줄에 셋 → 셋째를 첫째 아래로
const moved = placeRoomCell(defaultCells(3), 2, { row: 1, col: 0 });
assert.equal(cellsOf(moved), '0:0 0:1 1:0');
const packed = packStudioRooms(sized(3).map((r, i) => ({ ...r, cell: moved[i] })));
assert.deepEqual(packed.rectangles.map((r) => [r.x, r.z]), [[0, 0], [7.42, 0], [0, 8.1]]); assert(Math.abs(packed.width - 14.62) < 1e-9 && Math.abs(packed.depth - 14.4) < 1e-9);
// 바깥쪽 칸(-1) · 빈 줄은 정리된다 · 다른 공간이 있는 칸이면 맞바꾼다 · 달라지지 않으면 null
assert.equal(cellsOf(placeRoomCell(defaultCells(3), 2, { row: -1, col: 1 })), '1:0 1:1 0:1');
assert.equal(cellsOf(placeRoomCell(defaultCells(3), 0, { row: 0, col: 2 })), '0:2 0:1 0:0');
assert.equal(placeRoomCell(defaultCells(2), 0, { row: 0, col: -1 }), null);
assert.equal(cellsOf(normalizeCells([{ row: 3, col: 5 }, { row: 7, col: 5 }])), '0:0 1:0');
// 칸이 없는 새 공간은 첫 빈 칸에
assert.equal(cellsOf(studioRoomCells([{ cell: { row: 0, col: 0 } }, { cell: { row: 0, col: 1 } }, { cell: { row: 1, col: 0 } }, {}])), '0:0 0:1 1:0 1:1');

// 실제 장면: 표준 제안서 조감도 36종 — 공간 하나를 빈 칸으로 옮겨도 오브젝트가 그대로 따라가고 장면이 유효하다
const dir = new URL('../web/public/assets/vertical-std/', import.meta.url);
let scenes = 0, relaid = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.scene.json'))) {
  const scene = JSON.parse(fs.readFileSync(new URL(file, dir))), before = sceneRoomCells(scene);
  assert.equal(cellsOf(before), cellsOf(defaultCells(scene.rooms.length)), file + ' 좌표에서 읽은 칸 = 기본 격자');
  const slots = roomDropSlots(scene); assert(slots.length >= 4, file);
  for (const slot of slots) assert(!before.some((c) => c.row === slot.row && c.col === slot.col));
  const last = scene.rooms.at(-1), below = slots.filter((s) => s.col === 0).sort((a, b) => b.row - a.row)[0];
  const result = moveRoom({ scene, form: { title: scene.title } }, last.id, below, library); relaid += result.relaid.length;
  const next = result.scene, room = next.rooms.find((r) => r.id === last.id);
  assert.deepEqual(next.rooms.map((r) => r.id), scene.rooms.map((r) => r.id), '공간 순서(번호)는 그대로');
  assert.equal(room.x, 0); assert(room.z > Math.max(...next.rooms.filter((r) => r !== room).map((r) => r.z)), file + ' 맨 아래 줄');
  assert.deepEqual(validateScene(next, library).errors, []);
  assert.equal(next.objects.filter((o) => o.roomId === last.id).length, scene.objects.filter((o) => o.roomId === last.id).length);
  assert.equal(cellsOf(sceneRoomCells(next)), cellsOf(placeRoomCell(before, scene.rooms.length - 1, below)));
  // 기억한 칸은 다시 만들어도 남는다: 공간 추가 · 삭제 · 자리 바꾸기
  assert(studioFormFromScene(next).rooms.every((r) => r.cell));
  const swapped = swapRooms({ scene: next, form: { title: scene.title } }, scene.rooms[0].id, last.id, library).scene;
  assert.equal(swapped.rooms.find((r) => r.id === scene.rooms[0].id).z, room.z); assert.equal(swapped.rooms.find((r) => r.id === last.id).z, 0);
  if (scenes < 4) {
    const added = addRoom({ scene: next, form: { title: scene.title } }, { kind: 'lounge' }, library);
    assert.equal(added.scene.rooms.find((r) => r.id === last.id).x, 0); assert.deepEqual(validateScene(added.scene, library).errors, []);
    const removed = removeRoom({ scene: next, form: { title: scene.title } }, scene.rooms[0].id, library).scene;
    assert.deepEqual(validateScene(removed, library).errors, []); assert.equal(removed.rooms.length, scene.rooms.length - 1);
    // 처음 배치로 되돌리면 칸을 기억하지 않는다
    const home = sceneRoomCells(next), back = defaultCells(scene.rooms.length).at(-1), slot = { row: home[home.length - 1].row - 1, col: back.col };
    const again = moveRoom({ scene: next, form: { title: scene.title } }, last.id, home.some((c) => c.row === back.row && c.col === back.col) ? slot : back, library).scene;
    if (cellsOf(sceneRoomCells(again)) === cellsOf(defaultCells(scene.rooms.length))) assert(again.rooms.every((r) => !r.cell));
  }
  scenes++;
}
assert.equal(scenes, 36);
console.log('PASS room arrangement: default grid unchanged, a room moves to an empty cell (new row), outer cells, swaps, kept cells across add · remove · swap, 36 real scenes stay valid (relaid ' + relaid + ')');
