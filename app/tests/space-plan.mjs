// 공간 구성(domain/proposals/space-plan.js) — 후보 규칙(DSS가 들어가는 공간만 · 후보마다 1~6개 · 서로 다른 조합), 배치 보정,
// 공간 색(넣고 빼도 그대로), 공간 넣기 · 빼기, 조감도를 받을 Storyboard 칸. 모델 없이 순수 함수만 검사한다.
// node app/tests/space-plan.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';

const D = await import('../web/src/domain/proposals/space-plan.js');
const { SPATIAL_HTML } = await import('../web/src/domain/templates/spatial-layouts.js');
const { VSTD_HTML } = await import('../web/src/domain/templates/vertical_std_layouts.js');
const read = (name) => JSON.parse(fs.readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
const catalog = read('catalog.json');
const idx = D.indexTaxonomy(read('vertical_space_product.json'));
const P = Object.fromEntries([...read('products_db.json').products || [], ...catalog.products].map((x) => [x.id, x]));
const S = Object.fromEntries(catalog.solutions.map((x) => [x.id, x]));
const catsOf = (id) => D.productCats(P[id]);
const solCatsOf = (id) => D.solutionCats(S[id]);
const checks = []; const pass = (s) => { checks.push(s); console.log('PASS ' + s); };

// ---------- 한도 ----------
assert.equal(D.MIN_SPACES, 1); assert.equal(D.MAX_SPACES, 6); assert.ok(D.SPACE_COLORS >= D.MAX_SPACES);
assert.equal(idx.verticals.length, 44);
pass('a plan holds 1 to 6 spaces and every space can have its own colour');

// ---------- 솔루션 → 제품군 ----------
assert.deepEqual(solCatsOf('magicinfo'), ['s_magic']); assert.deepEqual(solCatsOf('vxt'), ['s_vxt']); assert.deepEqual(solCatsOf('stpro'), ['s_stp']);
assert.deepEqual(solCatsOf('lynk'), ['s_lynk']); assert.deepEqual(solCatsOf('knoxsuite'), ['s_knox']); assert.deepEqual(solCatsOf('biot'), ['s_biot']);
assert.deepEqual(solCatsOf('coldchain'), ['sac_cold']); assert.ok(solCatsOf('sac').includes('s_dms'));
for (const id of ['care', 'content', 'partnerapp']) assert.deepEqual(solCatsOf(id), [], id + ' has no category in the data');
for (const s of catalog.solutions) for (const c of solCatsOf(s.id)) assert.ok(idx.cats.has(c), s.id + ' → ' + c + ' is a taxonomy category');
pass('linked solutions map to taxonomy categories only where the data has one');

// ---------- DSS가 들어가는 공간 ----------
const SETS = [
  ['fb_qsr', ['qm55c', 'kiosk', 'oh55a', 'ac360'], ['magicinfo', 'stpro']],
  ['ht_hotel', ['hoteltv', 'qm55c', 'wf1way', 'airdresser'], ['lynk']],
  ['md_general', ['qm55c', 'tabs11', 'purifier', 'dvms2'], ['biot']],
  ['of_hq', ['flip', 'book'], []],
  ['ed_univ', ['flip'], []],
  ['fb_cafe', ['qm55c'], []],
].filter(([v]) => idx.byId.has(v));
assert.ok(SETS.length >= 3, 'the sample verticals exist in the data: ' + idx.verticals.map((v) => v.id).join(' '));
const fitOf = (v, prods, sols) => D.fitSpaces(D.spacePool(idx, v), D.dssCats(prods, sols, catsOf, solCatsOf));
for (const [v, prods, sols] of SETS) {
  const pool = D.spacePool(idx, v), fit = fitOf(v, prods, sols);
  const dss = D.dssCats(prods, sols, catsOf, solCatsOf);
  for (const s of fit) { const f = D.spaceFit(pool.find((x) => x.id === s.id), dss); assert.ok(f.products.length + f.solutions.length > 0); assert.deepEqual(s.fit, f); }
  for (const s of pool) if (!fit.some((x) => x.id === s.id)) { const f = D.spaceFit(s, dss); assert.equal(f.products.length + f.solutions.length, 0, s.name + ' holds nothing linked'); }
  const main = fit.filter((s) => !s.aux).length;
  assert.deepEqual(fit.map((s) => !!s.aux), [...Array(main).fill(false), ...Array(fit.length - main).fill(true)], 'main vertical spaces rank first');
}
pass('the candidate pool is exactly the spaces that hold at least one linked product or solution, main vertical first');

// ---------- 후보: 모델 답을 규칙에 맞춘다 ----------
const rule = (cands, fit, label) => {
  const ok = new Set(fit.map((s) => s.id));
  assert.equal(cands.length, D.candidateCount(fit.length), label + ': count');
  const keys = new Set();
  for (const c of cands) {
    assert.ok(c.spaces.length >= 1 && c.spaces.length <= 6, label + ': 1 to 6 spaces, got ' + c.spaces.length);
    assert.equal(new Set(c.spaces).size, c.spaces.length, label + ': no repeated space');
    for (const id of c.spaces) assert.ok(ok.has(id), label + ': ' + id + ' holds a linked item');
    assert.ok(c.title && typeof c.summary === 'string');
    keys.add([...c.spaces].sort().join('|'));
  }
  assert.equal(keys.size, cands.length, label + ': candidates differ');
};
let combos = 0;
for (const v of idx.verticals) {
  const pool = D.spacePool(idx, v.id);
  for (const [prods, sols] of [[['qm55c'], []], [['qm55c', 'kiosk', 'oh55a', 'ac360'], ['magicinfo', 'stpro']], [['hoteltv', 'airdresser', 'laundry'], ['lynk']], [['tabs11', 'book', 'flip', 'purifier', 'dvms2', 'bi_fridge'], ['knoxsuite', 'biot']], [['onyx'], []], [[], ['care']]]) {
    const fit = fitOf(v.id, prods, sols);
    const ids = fit.map((s) => s.id), all = pool.map((s) => s.id), other = all.filter((id) => !ids.includes(id));
    const answers = [
      { candidates: [] },
      { candidates: [{ title: 'A', summary: '', spaces: all }, { title: 'B', summary: '', spaces: all }, { title: 'C', summary: '', spaces: all }] }, // every space, three times
      { candidates: [{ title: 'A', summary: 's', spaces: [...other, ...ids.slice(0, 1)] }, { title: 'B', summary: 's', spaces: ['nope', ...ids.slice(0, 2)] }, { title: 'C', summary: 's', spaces: other }] },
      { candidates: [{ title: 'A', summary: 's', spaces: ids.slice(0, 1) }, { title: 'B', summary: 's', spaces: ids.slice(0, 1) }, { title: 'C', summary: 's', spaces: ids.slice(0, 1) }] },
      { candidates: [{ title: '', spaces: ids }, null, { title: 'C', spaces: 'x' }] },
    ];
    for (const [k, a] of answers.entries()) { rule(D.repairCandidates(a, fit), fit, v.id + ' #' + k); combos++; }
  }
}
pass('whatever the model answers, ' + combos + ' candidate sets obey: only fitting spaces, 1–6 each, all different (44 verticals × 6 DSS sets × 5 answers)');

{ // a good answer is kept as it is (order too); only broken parts are touched
  const fit = fitOf('fb_qsr', ['qm55c', 'kiosk', 'oh55a', 'ac360'], ['magicinfo', 'stpro']);
  const ids = fit.map((s) => s.id);
  const good = { candidates: [{ title: '핵심', summary: '주문 동선', spaces: [ids[1], ids[0]] }, { title: '표준', summary: '매장', spaces: ids.slice(0, 3) }, { title: '확장', summary: '전체', spaces: ids.slice(0, 5) }] };
  const out = D.repairCandidates(good, fit);
  assert.deepEqual(out.map((c) => c.spaces), good.candidates.map((c) => c.spaces));
  assert.ok(out.every((c) => !c.fixed && !c.rule));
  assert.equal(D.checkCandidates(good, ids), true);
  assert.match(D.checkCandidates({ candidates: good.candidates.slice(0, 2) }, ids), /후보 3개/);
  assert.match(D.checkCandidates({ candidates: [good.candidates[0], good.candidates[1], { title: 'x', summary: '', spaces: ['nope'] }] }, ids), /목록의 id/);
  const dup = D.repairCandidates({ candidates: [good.candidates[1], good.candidates[1], good.candidates[1]] }, fit);
  assert.deepEqual(dup[0].spaces, good.candidates[1].spaces); assert.ok(!dup[0].fixed); assert.ok(dup[1].fixed && dup[2].fixed);
  assert.equal(dup[0].summary, '매장'); assert.match(dup[1].summary, /에 연결한 제품을 담는 구성$/, 'a candidate changed by code gets a factual summary');
  rule(dup, fit, 'duplicates');
  assert.match(D.checkCandidates({ candidates: [good.candidates[0], good.candidates[1], { title: 'title', summary: '확장 구성', spaces: ids }] }, ids), /title/, 'a placeholder is not a name');
  rule(D.repairCandidates({ candidates: [{ title: 'title', summary: '', spaces: ids.slice(0, 2) }, { title: '...', summary: '', spaces: ids.slice(0, 3) }] }, fit), fit, 'placeholders');
}
{ // one fitting space → one candidate of one space; two → three (a, b, a+b); none → nothing
  const one = fitOf('fb_qsr', ['qm55c'], []).filter((s) => !s.aux).slice(0, 1);
  assert.equal(D.candidateCount(0), 0); assert.equal(D.candidateCount(1), 1); assert.equal(D.candidateCount(2), 3);
  const c1 = D.repairCandidates({ candidates: [{ title: 'A', summary: '', spaces: ['x'] }] }, one);
  assert.equal(c1.length, 1); assert.deepEqual(c1[0].spaces, [one[0].id]);
  const two = fitOf('fb_qsr', ['qm55c', 'kiosk', 'oh55a', 'ac360'], []).slice(0, 2);
  rule(D.repairCandidates({ candidates: [] }, two), two, 'two spaces');
  assert.deepEqual(D.repairCandidates({ candidates: [{ title: 'A', summary: '', spaces: ['x'] }] }, []), []);
}
pass('good answers are kept untouched; duplicates are varied; a single fitting space gives a single one-space candidate');

// ---------- 배치 보정 ----------
{
  const pool = new Map(D.spacePool(idx, 'fb_qsr').map((s) => [s.id, s]));
  const prods = ['qm55c', 'kiosk', 'oh55a', 'ac360'];
  const spaces = [{ id: 'fb_qsr_s1', name: 'a', kind: 'retail', note: '', products: [] }, { id: 'fb_qsr_s2', name: 'b', kind: 'retail', note: '', products: ['qm55c', 'kiosk'] }, { id: 'fb_qsr_s3', name: 'c', kind: 'dining', note: '', products: [] }];
  const out = D.completeMapping(spaces, pool, prods, catsOf);
  assert.deepEqual(out[1], spaces[1], 'what the model placed stays');
  assert.deepEqual(out[0].products, ['oh55a'], 'an empty space gets the unplaced products that fit it');
  assert.deepEqual(out[2].products, ['ac360']);
  const again = D.completeMapping([{ ...spaces[0], products: [] }, { ...spaces[1], products: ['qm55c', 'kiosk', 'oh55a', 'ac360'] }], pool, prods, catsOf);
  assert.equal(again[0].products.length, 1, 'when every fitting product is already placed, one of them is shared');
  // 설명: 모델의 혼잣말은 버리고, 채워 넣은 공간의 '제품 없음' 설명도 지운다
  const cleaned = D.cleanMapping({ spaces: [{ id: 'fb_qsr_s1', kind: 'nope', products: [], note: '쇼윈도에는 제품을 두지 않습니다.' }, { id: 'fb_qsr_s2', kind: 'retail', products: ['qm55c', 'qm55c'], note: '// a duplicate id is not allowed in JSON keys' }, { id: 'fb_qsr_s3', kind: 'dining', products: ['ac360'], note: '객석 천장에서 조용하게 냉난방합니다.' }] },
    ['fb_qsr_s1', 'fb_qsr_s2', 'fb_qsr_s3'].map((id) => pool.get(id)), () => 'retail');
  assert.deepEqual(cleaned.map((x) => [x.kind, x.products.length, x.note]), [['retail', 0, '쇼윈도에는 제품을 두지 않습니다.'], ['retail', 1, ''], ['dining', 1, '객석 천장에서 조용하게 냉난방합니다.']]);
  assert.equal(D.completeMapping(cleaned, pool, prods, catsOf)[0].note, '', 'a filled space drops the note that said it was empty');
  for (const bad of ['{"id":1}', 'products 배열은 비워 둡니다', 'no products here', '']) assert.equal(D.cleanNote(bad), '');
}
pass('auto placement leaves no chosen space empty when a linked product fits it');

// ---------- 공간 색 · 넣기 · 빼기 ----------
{
  const sp = (id, color) => ({ id, name: id, kind: 'retail', note: '', products: [], ...(color == null ? {} : { color }) });
  const three = D.withColors([sp('a'), sp('b'), sp('c')]);
  assert.deepEqual(three.map((s) => s.color), [0, 1, 2]);
  const minusB = D.removeSpace(three, 'b');
  assert.deepEqual(minusB.map((s) => [s.id, s.color]), [['a', 0], ['c', 2]], 'removing a space keeps the other colours');
  const plusD = D.addSpace(minusB, sp('d'));
  assert.deepEqual(plusD.map((s) => [s.id, s.color]), [['a', 0], ['c', 2], ['d', 1]], 'a new space takes the free colour');
  assert.equal(new Set(plusD.map((s) => s.color)).size, plusD.length);
  assert.equal(D.removeSpace([sp('a', 0)], 'a').length, 1, 'never below one space');
  let six = [sp('a')]; for (const id of ['b', 'c', 'd', 'e', 'f']) six = D.addSpace(six, sp(id));
  assert.equal(six.length, 6); assert.equal(new Set(six.map((s) => s.color)).size, 6);
  assert.equal(D.addSpace(six, sp('g')), six, 'never above six spaces'); assert.equal(D.addSpace(six, sp('a')), six, 'no space twice');
  assert.deepEqual(D.withColors([sp('a', 3), sp('b', 3), sp('c', 99)]).map((s) => s.color), [3, 0, 1], 'clashing or invalid colours are reassigned');
  // a plan saved before (no colours, up to 8 spaces) still opens with the colours it had
  const old = { v: 1, vertical: { id: 'fb_qsr', name: 'x', group: 'FB' }, title: '', summary: '', spaces: 'abcdefgh'.split('').map((id) => ({ id, name: id, kind: 'retail', note: '', products: id === 'a' ? ['qm55c'] : [] })), at: 1 };
  const g = D.planGroups(old, ['qm55c', 'kiosk']);
  assert.equal(g.groups.length, 8); assert.deepEqual(g.groups.map((x) => x.color), [0, 1, 2, 3, 4, 5, 6, 7]); assert.deepEqual(g.rest, ['kiosk']);
  assert.equal(D.planSig(old, ['qm55c']), D.planSig({ ...old, spaces: D.withColors(old.spaces) }, ['qm55c']), 'colours do not change the plan fingerprint');
  const one = D.planGroups({ ...old, spaces: old.spaces.slice(0, 1) }, ['qm55c']);
  assert.equal(one.groups.length, 1); assert.deepEqual(one.groups[0].products, ['qm55c']);
  assert.deepEqual(D.moveProduct(three, 'qm55c', null, 'a')[0].products, ['qm55c']);
  const original = [{ id: 'a', products: ['qm55c'] }, { id: 'b', products: [] }];
  const copied = D.copyProduct(original, 'qm55c', 'b');
  assert.deepEqual(copied.map((s) => s.products), [['qm55c'], ['qm55c']]);
  assert.deepEqual(original[1].products, []);
  assert.equal(D.copyProduct(copied, 'qm55c', 'b')[1], copied[1], 'no duplicate in a space');
  assert.deepEqual(D.moveProduct(copied, 'qm55c', 'a', null).map((s) => s.products), [[], ['qm55c']]);
}
pass('space colours stay put across remove/add, limits hold (1–6), and plans saved with up to 8 spaces still load');

// ---------- 매칭 카드 끌어 놓기(placeProduct) ----------
{
  const sp = [{ id: 'a', products: ['x', 'y', 'z'] }, { id: 'b', products: ['w'] }, { id: 'c', products: ['x'] }];
  assert.deepEqual(D.placeProduct(sp, 'y', 'a', 'b').map((s) => s.products), [['x', 'z'], ['w', 'y'], ['x']], 'to another space — at the end');
  assert.deepEqual(D.placeProduct(sp, 'y', 'a', 'b', 'w').map((s) => s.products), [['x', 'z'], ['y', 'w'], ['x']], 'before a product');
  assert.deepEqual(D.placeProduct(sp, 'z', 'a', 'a', 'x')[0].products, ['z', 'x', 'y'], 'reorder within a space');
  assert.deepEqual(D.placeProduct(sp, 'x', 'a', 'a', 'z')[0].products, ['y', 'x', 'z']);
  assert.deepEqual(D.placeProduct(sp, 'x', 'a', null).map((s) => s.products), [['y', 'z'], ['w'], ['x']], 'to 미배치 — the copy in another space stays');
  assert.deepEqual(D.placeProduct(sp, 'w', null, 'a', 'y')[0].products, ['x', 'w', 'y', 'z'], 'from 미배치');
  assert.deepEqual(D.placeProduct(sp, 'x', 'c', 'a', 'z').map((s) => s.products), [['y', 'x', 'z'], ['w'], []], 'into a space that already has it — no duplicate');
  const same = D.placeProduct(sp, 'y', 'a', 'a', 'z');
  assert.ok(same.every((s, i) => s === sp[i]), 'dropping in place changes nothing');
  assert.ok(D.placeProduct(sp, 'y', 'a', 'a', 'y').every((s, i) => s === sp[i]), 'dropping on itself changes nothing');
  assert.deepEqual(sp[0].products, ['x', 'y', 'z'], 'input untouched');
}
pass('drag in the matching card: move to another space / 미배치 / before a product, reorder in a space, no duplicates');

// ---------- 조감도를 받을 칸 ----------
{
  const layouts = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(new URL('../data/layouts.b64', import.meta.url), 'utf8').trim(), 'base64')));
  const htmlOf = (f) => SPATIAL_HTML[f] || VSTD_HTML[f] || layouts[f] || '';
  assert.deepEqual(D.birdseyeSlotsOf('L_SPATIAL_3D', htmlOf), { spatial: true, images: [] });
  assert.deepEqual(D.birdseyeSlotsOf('L_VS_BIRD_S4', htmlOf), { spatial: false, images: [0] });
  assert.deepEqual(D.birdseyeSlotsOf('L_BV_D', htmlOf).images, [], 'a four-view tour is not one birdseye picture');
  assert.deepEqual(D.birdseyeSlotsOf('L_VS_SPACE', htmlOf), { spatial: false, images: [] });
  const sheet = (uid, f, extra = {}) => ({ uid, f, status: 'done', ov: { t: {}, img: {} }, ...extra });
  const p = { parts: [{ id: 's1', layouts: [
    sheet('empty3d', 'L_SPATIAL_3D'), sheet('empty2d', 'L_SPATIAL_2D'),
    sheet('hand', 'L_SPATIAL_3D', { ov: { t: {}, img: {}, spatial: { version: 1 } } }),
    sheet('mine', 'L_SPATIAL_3D', { ov: { t: {}, img: {}, spatial: { version: 1 } }, birdseye: 'h1' }),
    sheet('legend', 'L_VS_BIRD_S4'),
    sheet('picked', 'L_VS_BIRD_S4', { ov: { t: {}, img: { 0: { src: 'u:x', selectedBy: 'user' } } } }),
    sheet('byUser', 'L_VS_BIRD_S4', { ov: { t: {}, img: { 0: { src: 'u:y' } } }, ev: { i0: { by: 'user' } } }),
    sheet('byAi', 'L_VS_BIRD_S4', { ov: { t: {}, img: { 0: { src: 'img/x.jpg' } } }, ev: { i0: { by: 'ai' } } }),
    // 범례 조감도 장은 그림과 그 장면(번호 핀 좌표)이 함께 이 조감도의 것일 때 다 채운 장이다 (그림만 받은 장은 space-plan-compose.mjs)
    sheet('done', 'L_VS_BIRD_S4', { ov: { t: {}, img: { 0: { src: 'u:z', birdseye: 'h1' } }, spatial: { version: 1, view: '3d', scene: { source: { documentId: 'sb-p1' } } } }, birdseye: 'h1' }),
    sheet('tour', 'L_BV_D'), sheet('space', 'L_VS_SPACE'), sheet('saved', 'L_MY_ABC'),
  ] }] };
  const now = D.birdseyeSlots(p, 'h1', htmlOf);
  assert.deepEqual(now.map((x) => [x.uid, x.type, x.view ?? x.i]), [['empty3d', 'spatial', '3d'], ['empty2d', 'spatial', '2d'], ['legend', 'image', 0], ['byAi', 'image', 0]]);
  const next = D.birdseyeSlots(p, 'h2', htmlOf).map((x) => x.uid);
  assert.deepEqual(next, ['empty3d', 'empty2d', 'mine', 'legend', 'byAi', 'done'], 'a newer birdseye also replaces what an older one filled — never what a person chose');
  assert.deepEqual(D.birdseyeSlots({ parts: [] }, 'h1', htmlOf), []);
}
pass('birdseye slots: empty 공간 조감도 layouts and single birdseye picture slots; hand-picked pictures and layouts are left alone');

console.log('space plan ok ·', checks.length, 'checks');
