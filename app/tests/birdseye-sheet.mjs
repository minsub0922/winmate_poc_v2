// 조감도 시트 모델 · 가운데 형태 기하 (web/src/domain/spatial/birdseye-sheet.js)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { birdseyeSheetInfo, birdseyeRows, birdseyeFrame, centerGeometry, centerLink, clampBubble, legendRoomIds, standardSceneUrl, sidePoints, CENTER_STAGE, SIDE_BOX } from '../web/src/domain/spatial/birdseye-sheet.js';

// 대상 판별 · 글 칸 번호
assert.deepEqual(birdseyeSheetInfo('L_SPATIAL_3D'), { kind: 'spatial' });
assert.deepEqual(birdseyeSheetInfo('L_VS_BIRD_S4'), { kind: 'vstd', n: 4 });
assert.deepEqual(birdseyeSheetInfo('L_VS_BIRD_B10'), { kind: 'vstd', n: 10 });
for (const f of ['L_VS_SPACE', 'L_BE02', 'L_MY_ABC', undefined]) assert.equal(birdseyeSheetInfo(f), null);
assert.deepEqual(birdseyeRows({ kind: 'vstd', n: 4 }).map((r) => [r.nameTb, r.descTb]), [[4, 5], [6, 7], [8, 9], [10, 11]]);
assert.equal(birdseyeRows({ kind: 'vstd', n: 10 }).at(-1).descTb, 23);

// 표준 제안서 핀 표: 44종, 공간 조감도 36종은 3D 장면 파일이 있다
const pins = JSON.parse(fs.readFileSync(new URL('../web/src/domain/templates/vertical_std_bird.json', import.meta.url)));
const decks = JSON.parse(fs.readFileSync(new URL('../web/src/domain/templates/standard_vertical_scenarios.json', import.meta.url)));
assert.equal(Object.keys(pins).length, 44); assert.equal(Object.values(pins).filter((p) => p.live).length, 36);
let sheets = 0;
for (const [sid, fill] of Object.entries(decks.fills)) for (const ov of fill) {
  const id = ov.f, info = birdseyeSheetInfo(id); if (!info || !sid.startsWith('bs_std_')) continue;
  sheets++;
  const frame = birdseyeFrame(info, ov), vid = /vertical-std\/(\w+)\.webp/.exec(ov.img[0].src)[1];
  assert(frame && frame.pinned, sid + ' 조감도 좌표');
  assert.equal(pins[vid].points.length, info.n, vid + ' 핀 수 = 범례 공간 수');
  assert(frame.points.every((p) => p.visible && p.x > 0 && p.x < frame.width && p.y > 0 && p.y < frame.height));
  assert.equal(!!standardSceneUrl(ov), id.includes('_BIRD_S'));
  if (standardSceneUrl(ov)) assert(fs.existsSync(new URL('../web/public' + standardSceneUrl(ov), import.meta.url)), vid + ' 장면 파일');
  check(centerGeometry(frame), info.n);
}
assert.equal(sheets, 44);

function check(geo, n) {
  const { bubbles, links, image } = geo, S = CENTER_STAGE;
  assert.equal(bubbles.length, n); assert.equal(links.length, n);
  assert(image.x >= S.x && image.x + image.w <= S.x + S.w + .01 && image.y >= S.y - .01 && image.y + image.h <= S.y + S.h + .01);
  assert(Math.abs(image.x + image.w / 2 - 640) < 1, '조감도는 시트 가운데');
  for (const b of bubbles) assert(b.x >= S.x && b.x + b.w <= S.x + S.w && b.y >= S.y && b.y + b.h <= S.y + S.h, '버블은 무대 안');
  for (const a of bubbles) for (const b of bubbles) if (a !== b) assert(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, '버블끼리 겹치지 않는다');
  assert(Math.abs(bubbles.filter((b) => b.side === 'left').length - bubbles.filter((b) => b.side === 'right').length) <= 1);
  for (const l of links) {
    const [a, b, c, d] = l.path;
    assert(a.y === b.y && b.x === c.x && c.y === d.y, '꺽쇠: 수평 → 수직 → 수평');
    assert.deepEqual(d, l.target);
  }
}

// 왼쪽 공간은 왼쪽 버블 · 보이지 않는 공간은 선 없이 버블만
const frame = { width: 1000, height: 600, points: [{ x: 800, y: 300 }, { x: 200, y: 300 }, { x: 500, y: 100, visible: false }] };
const ov = { spatialFrame: frame };
const live = birdseyeFrame({ kind: 'vstd', n: 3 }, ov), geo = centerGeometry(live);
assert.equal(geo.bubbles[0].side, 'right'); assert.equal(geo.bubbles[1].side, 'left');
assert.equal(geo.links.length, 2); assert(!geo.links.some((l) => l.index === 2)); assert(geo.bubbles[2]);
assert.equal(centerLink(geo.bubbles[2], { x: 1, y: 1, visible: false }), null);
// 좌표가 없으면(그림만 있는 조감도) 가운데 형태를 그리지 않는다
assert.equal(birdseyeFrame({ kind: 'vstd', n: 4 }, { img: { 0: { src: 'wmimg:abc' } } }), null);
assert.equal(birdseyeFrame({ kind: 'spatial' }, {}), null);
// 사용자가 돌린 조감도(ov.spatial · 3D)의 좌표 — 방 순서가 범례 순서
const rooms = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const own = birdseyeFrame({ kind: 'vstd', n: 3 }, { spatial: { version: 1, view: '3d', scene: { rooms }, anchors: { width: 1640, height: 997, rooms: { a: { x: 10, y: 20, visible: true }, b: { x: 30, y: 40, visible: true }, c: { x: 50, y: 60, visible: false } } } } });
assert.equal(own.pinned, false); assert.deepEqual(own.points.map((p) => p.x), [10, 30, 50]); assert.equal(own.points[2].visible, false);
const side = sidePoints({ kind: 'vstd', n: 3 }, own);
assert(side.targets[0].x > SIDE_BOX.vstd.x && side.targets[0].x < SIDE_BOX.vstd.x + SIDE_BOX.vstd.w);
// 끌어 옮긴 버블(ov.spatialBubbles): 그 자리에 그리고, 공간이 있는 쪽 변에서 꺽쇠가 나온다. 나머지 버블은 처음 자리 그대로.
const base = centerGeometry(live), placed = centerGeometry(live, 3, { 0: { x: 300, y: 500 }, 1: { x: -50, y: 9999 }, 2: { x: 'x' } });
assert.deepEqual([placed.bubbles[0].x, placed.bubbles[0].y, placed.bubbles[0].side, placed.bubbles[0].placed], [300, 500, 'left', true]); // 공간(오른쪽 x≈…)보다 왼쪽 → 오른쪽 변에서 나온다
assert.deepEqual(clampBubble({ x: -50, y: 9999 }), { x: CENTER_STAGE.x, y: CENTER_STAGE.y + CENTER_STAGE.h - 96 });
assert.deepEqual([placed.bubbles[1].x, placed.bubbles[1].y], [CENTER_STAGE.x, CENTER_STAGE.y + CENTER_STAGE.h - 96]);
assert.deepEqual([placed.bubbles[2].x, placed.bubbles[2].y], [base.bubbles[2].x, base.bubbles[2].y]); assert(!placed.bubbles[2].placed);
const moved = placed.links.find((l) => l.index === 0), [m0, m1, m2, m3] = moved.path;
assert.equal(m0.x, 300 + 184); assert(m0.y === m1.y && m1.x === m2.x && m2.y === m3.y); assert.deepEqual(m3, base.links.find((l) => l.index === 0).target);
assert.equal(centerGeometry(live, 3, { 0: { x: 1000, y: 200 } }).links.find((l) => l.index === 0).path[0].x, 1000); // 공간보다 오른쪽 → 왼쪽 변
// 공간 자리를 바꾸면 scene.rooms 순서가 바뀐다 — 범례 번호는 저장해 둔 순서(roomIds)를 따라 공간과 함께 간다
assert.deepEqual(legendRoomIds({ rooms }, 3, ['c', 'a', 'b']), ['c', 'a', 'b']);
assert.deepEqual(legendRoomIds({ rooms }, 3, ['c', 'a']), ['a', 'b', 'c']); assert.deepEqual(legendRoomIds({ rooms }, 2, ['c', 'zz', 'a']), ['a', 'b']); assert.deepEqual(legendRoomIds({ rooms }, 3), ['a', 'b', 'c']);
const swapped = birdseyeFrame({ kind: 'vstd', n: 3 }, { spatial: { version: 1, view: '3d', roomIds: ['c', 'a', 'b'], scene: { rooms }, anchors: { width: 100, height: 100, rooms: { a: { x: 10, y: 20 }, b: { x: 30, y: 40 }, c: { x: 50, y: 60 } } } } });
assert.deepEqual(swapped.points.map((p) => p.x), [50, 10, 30]);
console.log('PASS birdseye sheet: kinds, slot numbers, 44 standard pins/scenes, centre geometry bounds, elbow links, hidden rooms, missing coordinates, placed bubbles, legend order after a room swap');
