// 업종 Map — 공간마다 제품을 하나 이상 놓는 장의 조립(app/web/src/domain/templates/space_map_sheet.js)
//   node --test app/tests/space-map-sheet.mjs
// 규칙(2026-11-16 사용자): "이 맵에서 각 공간에 하나 이상의 제품이 들어갈 수 있어. 이를 동적으로 여러 개 놓을 수 있도록 … 그에 따라 각 제품 카드 사이즈와 배치가 달라질 거야."
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_GRID, MAP_CARD, mapCells, arrangeCards, cardCapacity, placeProducts, arrangeLabel, spaceMapPlanOf, spaceMapSheet, spaceMapLayout, mapCardCapacity, cardName } from '../web/src/domain/templates/space_map_sheet.js';
import { spaceMapRows } from '../web/src/domain/templates/space_sheet_plan.js';

const inside = (r, W, H) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5;
const apart = (a, b) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

test('공간 칸 — 공간 2~8곳: 4곳 이하는 한 줄(아래에 하는 일 자리), 5곳부터 두 줄', () => {
  for (let n = 2; n <= 8; n++) {
    const cells = mapCells(n); const rows = spaceMapRows(n);
    assert.equal(cells.length, n);
    assert.deepEqual([...new Set(cells.map(c => c.y))].map(y => cells.filter(c => c.y === y).length), rows);
    for (const c of cells) {
      assert.equal(c.single, rows.length === 1);
      assert.ok(c.x >= MAP_GRID.x && c.x + c.w <= MAP_GRID.x + MAP_GRID.width + 1 && c.y >= MAP_GRID.top && c.y + c.h <= MAP_GRID.bottom);
      const a = c.area; // 제품 자리는 칸 안 — 머리 줄 아래, 한 줄 배치면 '하는 일' 자리 위
      assert.ok(a.x > c.x && a.x + a.w < c.x + c.w && a.y >= c.y + MAP_GRID.head);
      assert.ok(a.y + a.h <= c.y + c.h - MAP_GRID.pad - (c.single ? MAP_GRID.note : 0));
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(apart(cells[i], cells[j]), `n=${n} ${i}×${j}`);
  }
  for (const bad of [1, 9]) assert.throws(() => mapCells(bad), RangeError);
});

test('카드 배치 — 자리 안 · 겹치지 않음 · 같은 크기 · 최소 크기 이상, 덜 찬 마지막 줄은 가운데', () => {
  const areas = new Map();
  for (let n = 2; n <= 8; n++) for (const c of mapCells(n)) areas.set(c.area.w + 'x' + c.area.h, c.area);
  assert.ok(areas.size >= 5);
  for (const { w: W, h: H } of areas.values()) {
    const cap = cardCapacity(W, H);
    assert.ok(cap >= 4 && cap <= MAP_CARD.max, `${W}x${H} cap ${cap}`);
    assert.equal(arrangeCards(cap + 1, W, H) === null || cap === MAP_CARD.max, true);
    for (let k = 1; k <= cap; k++) {
      const L = arrangeCards(k, W, H);
      assert.equal(L.cards.length, k);
      assert.ok(L.cols * L.rows >= k && L.cols * (L.rows - 1) < k, `${W}x${H} k=${k}`);
      assert.ok(L.w >= MAP_CARD.minW && L.h >= MAP_CARD.minH);
      for (const r of L.cards) { assert.ok(inside(r, W, H), `${W}x${H} k=${k}`); assert.deepEqual([r.w, r.h], [L.w, L.h]); }
      for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) assert.ok(apart(L.cards[i], L.cards[j]));
      const last = L.cards.filter(r => r.y === L.cards[k - 1].y);
      const left = last[0].x; const right = W - (last[last.length - 1].x + L.w);
      assert.ok(Math.abs(left - right) <= 2, `${W}x${H} k=${k} 마지막 줄 가운데`); // 꽉 찬 줄이면 0 · 0
    }
  }
  assert.equal(arrangeCards(0, 300, 200), null);
  assert.equal(arrangeCards(1, 50, 50), null); // 최소 크기보다 작은 자리
});

test('카드 크기 · 배치는 제품 수에 따라 달라진다 — 적으면 크게, 많으면 줄 · 열을 늘려 작게', () => {
  const two = mapCells(8)[0].area;   // 공간 8곳 장의 칸(가장 작은 자리)
  assert.deepEqual([1, 2, 3, 4].map(k => arrangeLabel(arrangeCards(k, two.w, two.h), k)), ['1', '2', '2+1', '2×2']);
  const wide = mapCells(5)[3].area;  // 공간 5곳 장 아랫줄(넓은 자리)
  assert.deepEqual([1, 2, 3, 4, 5, 6, 8].map(k => arrangeLabel(arrangeCards(k, wide.w, wide.h), k)), ['1', '2', '3', '4', '5', '3×2', '4×2']);
  const tall = mapCells(4)[0].area;  // 공간 4곳 장(좁고 긴 자리) — 위아래로 쌓는다
  assert.deepEqual([1, 2, 3, 4, 6].map(k => arrangeLabel(arrangeCards(k, tall.w, tall.h), k)), ['1', '1×2', '1×3', '2×2', '2×3']);
  for (const a of [two, wide, tall]) {
    let area = Infinity;
    for (let k = 1; k <= cardCapacity(a.w, a.h); k++) { const L = arrangeCards(k, a.w, a.h); assert.ok(L.w * L.h <= area + 1, `k=${k}`); area = L.w * L.h; } // 제품이 늘수록 카드는 커지지 않는다
  }
  assert.deepEqual([cardName(260)[0], cardName(170)[0], cardName(110)[0]], ['dense', 'label', 'utility']); // 카드가 작아지면 이름 글자도 작게
});

test("넘치면 마지막 자리를 '외 N종'으로 — 놓을 수 있는 만큼만 카드로", () => {
  const a = mapCells(8)[0].area; const cap = cardCapacity(a.w, a.h);
  assert.equal(cap, 4);
  assert.deepEqual(placeProducts(4, a.w, a.h), { shown: 4, more: 0, slots: 4, layout: arrangeCards(4, a.w, a.h) });
  const over = placeProducts(7, a.w, a.h);
  assert.deepEqual([over.shown, over.more, over.slots], [3, 4, 4]); // 3개 + '외 4종'
  assert.equal(over.shown + over.more, 7);
  for (let k = 1; k <= 30; k++) { const p = placeProducts(k, a.w, a.h); assert.equal(p.shown + p.more, k); assert.equal(p.slots, Math.min(k, cap)); assert.equal(p.layout.cards.length, p.slots); }
  assert.deepEqual(mapCardCapacity(8), { min: 4, max: 4 });
  assert.deepEqual(mapCardCapacity(5), { min: 6, max: 9 });
  assert.ok(mapCardCapacity(2).max <= MAP_CARD.max);
});

test('장 조립 — 공간마다 제품 카드: 글 · 그림 칸 수, 장 이름(칸마다 카드 수), 모든 칸이 장 안', () => {
  const spaces = [4, 5, 6, 7, 4, 8].map((k, i) => ({ name: '공간 ' + (i + 1), note: '하는 일', products: Array.from({ length: k }, (_, j) => ({ name: `제품 ${i + 1}-${j + 1}`, src: `img/p${i}-${j}.png` })) }));
  const sh = spaceMapSheet({ title: 'AI 퀵서비스 Map', foot: '외식 프랜차이즈 · AI 퀵서비스 표준 제안서', page: 18, spaces });
  assert.equal(sh.f, 'L_VS_MAP_6_4-5-6-5x-4-5x');
  assert.deepEqual(sh.cells.map(c => [c.shown, c.more]), [[4, 0], [5, 0], [6, 0], [5, 2], [4, 0], [5, 3]]);
  const shown = sh.cells.reduce((a, c) => a + c.shown, 0); const chips = sh.cells.filter(c => c.more).length;
  assert.equal(sh.nI, shown);
  assert.equal(sh.nT, 3 + 6 + shown + chips + 3); // 머리 3 · 공간 이름 6 · 제품 이름 · '외 N종' · 꼬리말 3 (두 줄 배치라 '하는 일' 없음)
  assert.equal((sh.html.match(/data-tb="/g) || []).length, sh.nT);
  assert.equal((sh.html.match(/data-img="/g) || []).length, sh.nI);
  assert.deepEqual(Object.keys(sh.t).map(Number), Array.from({ length: sh.nT }, (_, i) => i));
  assert.deepEqual(Object.keys(sh.img).map(Number), Array.from({ length: sh.nI }, (_, i) => i));
  assert.equal(sh.t[1], 'AI 퀵서비스 Map'); assert.match(sh.t[2], /^6개 공간/); assert.equal(sh.t[sh.nT - 1], 'CONFIDENTIAL · 18');
  assert.ok(Object.values(sh.t).includes('외 2종') && Object.values(sh.t).includes('외 3종'));
  assert.equal(sh.img[0].src, 'img/p0-0.png'); assert.equal(sh.img[0].fit, 'contain');
  assert.equal(sh.img[4].src, 'img/p1-0.png'); // 그림 칸은 공간 → 카드 순서
  assert.ok(!sh.html.includes('p3-5.png') && !sh.html.includes('p3-6.png')); // 넘친 제품은 그리지 않는다
  assert.ok(sh.html.startsWith('<div data-proposal-typography="2" style="width: 1280px; height: 720px;'));
  assert.ok(!/<script|onerror|javascript:/i.test(sh.html));
  // 같은 칸 수 → 같은 장 이름 · 같은 틀
  assert.equal(spaceMapPlanOf([4, 5, 6, 7, 4, 8]).f, sh.f);
  const blank = spaceMapLayout([4, 5, 6, 7, 4, 8]);
  assert.equal(blank.f, sh.f); assert.equal(blank.nT, sh.nT); assert.equal(blank.nI, sh.nI);
  assert.deepEqual(blank.img, {}); // 빈 장은 그림이 없다
  // 한 줄 배치(4곳 이하)는 공간마다 '하는 일' 한 문장까지
  const one = spaceMapSheet({ spaces: [1, 3].map((k, i) => ({ name: 'S' + i, note: '하는 일 ' + i, products: Array.from({ length: k }, () => ({ name: 'P' })) })) });
  assert.equal(one.f, 'L_VS_MAP_2_1-3');
  assert.equal(one.nT, 3 + 2 + 4 + 2 + 3);
  assert.ok(Object.values(one.t).includes('하는 일 1'));
  // 글에 든 꺾쇠 · 따옴표는 글자로
  const esc = spaceMapSheet({ title: '<b>"A&B"</b>', spaces: [{ name: 'x', products: [{ name: '<i>p</i>', src: 'a"b.png' }] }, { name: 'y', products: [{ name: 'q' }] }] });
  assert.ok(esc.html.includes('&lt;b&gt;"A&amp;B"&lt;/b&gt;') && esc.html.includes('&lt;i&gt;p&lt;/i&gt;') && esc.html.includes('src="a&quot;b.png"'));
  for (const bad of [[], [{ name: 'a', products: [{}] }], Array.from({ length: 9 }, () => ({ name: 'a', products: [{}] }))]) assert.throws(() => spaceMapSheet({ spaces: bad }), RangeError);
});

test('어떤 제품 수 조합이든 — 카드 · 글이 제 칸 안에 있다', () => {
  let seed = 7; const rnd = m => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return 1 + (seed % m); };
  for (let round = 0; round < 60; round++) {
    const n = 2 + (round % 7); const counts = Array.from({ length: n }, () => rnd(12));
    const plan = spaceMapPlanOf(counts);
    plan.cells.forEach((c, i) => {
      assert.equal(c.shown + c.more, counts[i]);
      for (const r of c.layout.cards) assert.ok(inside(r, c.area.w, c.area.h), `${plan.f} 칸 ${i}`);
    });
    assert.match(plan.f, new RegExp(`^L_VS_MAP_${n}_(\\d+x?)(-\\d+x?){${n - 1}}$`));
  }
});
