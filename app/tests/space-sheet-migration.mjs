// 공간별 제안 장(L_VS_SPACE) 저장본 — 새 공간 사진 칸(사진 1)을 같은 공간의 표준 제안서 채움에서 넣고, 사람이 넣은 사진은 그대로 둔다.
// node app/tests/space-sheet-migration.mjs
import assert from 'node:assert/strict';

const { fillSpacePhoto, fillSpacePhotos } = await import('../web/src/domain/templates/migrate_space_sheet.js');
const { FILLS } = await import('../web/src/domain/templates/scenario_fills.js');

const deck = FILLS.bs_std_fb_qsr;
const cur = deck.find((x) => x.f === 'L_VS_SPACE');
assert.ok(cur && cur.img['1']?.src, 'standard deck carries the space photo');

// a copy saved before the change: same text, only the product cut
const old = { f: 'L_VS_SPACE', ov: { t: structuredClone(cur.t), img: { 0: structuredClone(cur.img['0']) } } };
const proposal = { scenario: 'bs_std_fb_qsr', parts: [{ layouts: [{ f: 'L_VS_MAP_6', ov: { t: {}, img: {} } }, old] }] };
assert.equal(fillSpacePhotos(proposal), true);
assert.deepEqual(old.ov.img['1'], cur.img['1']);
assert.deepEqual(old.ov.img['0'], cur.img['0'], 'product cut untouched');
assert.equal(fillSpacePhotos(proposal), false, 'second load changes nothing');

// the person's own photo stays
const mine = { f: 'L_VS_SPACE', ov: { t: { 1: cur.t['1'] }, img: { 1: { src: 'img/ph/mine.jpg' } } } };
assert.equal(fillSpacePhoto(mine), false);
assert.equal(mine.ov.img['1'].src, 'img/ph/mine.jpg');

// other layouts, unknown spaces, empty sheets
assert.equal(fillSpacePhoto({ f: 'L_VS_MAP_6', ov: { t: { 1: cur.t['1'] } } }), false);
assert.equal(fillSpacePhoto({ f: 'L_VS_SPACE', ov: { t: { 1: '없는 공간' } } }), false);
assert.equal(fillSpacePhoto({ f: 'L_VS_SPACE', ov: null }), false);

// a favourite (no scenario, html text) — the same space name in any standard deck
const fav = { f: 'L_VS_SPACE', ov: { t: { 1: { html: cur.t['1'] } }, img: {} } };
assert.equal(fillSpacePhoto(fav), true);
assert.ok(fav.ov.img['1'].src);

// every standard deck: each space sheet finds its own photo by scenario + space name
let n = 0;
for (const [id, list] of Object.entries(FILLS)) {
  if (!id.startsWith('bs_std_')) continue;
  for (const x of list) {
    if (x.f !== 'L_VS_SPACE') continue;
    const page = { f: x.f, ov: { t: structuredClone(x.t), img: { 0: structuredClone(x.img['0']) } } };
    assert.equal(fillSpacePhotos({ scenario: id, parts: [{ layouts: [page] }] }), true, id + ' ' + x.t['1']);
    assert.equal(page.ov.img['1'].src, x.img['1'].src, id + ' ' + x.t['1']);
    n++;
  }
}
assert.equal(n, 234);
console.log('space sheet migration ok ·', n, 'space sheets');
