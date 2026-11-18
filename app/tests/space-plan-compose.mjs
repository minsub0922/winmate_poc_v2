// 공간 구성 · 조감도 — 레이아웃 자동 구성과 조감도 장이 같은 공간 구성을 쓰는지 (사용자 지시 2026-11-17, 제안서 pn63a3to)
//   "유저가 DSS 단계에서 조감도를 뽑았으면 그걸 활용하고 그렇지 않으면 즉각 생성 … 공간을 선택하지 않은 경우 업종을 기반으로 … 조감도를 먼저 생성하고
//    그 내용에 맞게 뒤에 공간별 제품 제안 부분도 맞게 … 공간의 갯수와 그 공간에서의 제품 갯수가 다 맞아야."
// 모델 · 3D 렌더 없이 검사한다: 업종 기준 자동 구성의 후보 고르기, 조감도를 바로 만들지 판단, 조감도 장(업종 견본 장면이 붙은 범례 장)을 다시 채울 칸으로 보는지,
// 놓을 3D 제품이 없어도 공간만으로 조감도 입력을 만드는지, 장면의 방 순서 = 공간 구성 순서(범례 N번 = 핀 N번).
// node --test app/tests/space-plan-compose.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';

const root = new URL('../', import.meta.url);
const read = (name) => JSON.parse(fs.readFileSync(new URL('data/' + name, root), 'utf8'));
const D = await import('../web/src/domain/proposals/space-plan.js');
const { SPATIAL_HTML } = await import('../web/src/domain/templates/spatial-layouts.js');
const { VSTD_HTML } = await import('../web/src/domain/templates/vertical_std_layouts.js');
const { birdseyeFrame, birdseyeSheetInfo, centerGeometry } = await import('../web/src/domain/spatial/birdseye-sheet.js');
const layouts = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(new URL('data/layouts.b64', root), 'utf8').trim(), 'base64')));
const htmlOf = (f) => SPATIAL_HTML[f] || VSTD_HTML[f] || layouts[f] || '';

test('업종 기준 자동 구성은 연결 제품이 가장 많이 들어가는 후보, 같으면 표준 → 핵심', () => {
  const c = (id, fit, n = 2) => ({ id, title: id, fit, spaces: Array.from({ length: n }, (_, i) => id + i) });
  assert.equal(D.pickCandidate([c('core', 2), c('std', 2), c('wide', 2)]).id, 'std');
  assert.equal(D.pickCandidate([c('core', 3), c('std', 2), c('wide', 3)]).id, 'core');
  assert.equal(D.pickCandidate([c('core', 1), c('std', 1), c('wide', 3)]).id, 'wide');
  assert.equal(D.pickCandidate([c('only', 1)]).id, 'only', '후보가 하나뿐이면 그것');
  assert.equal(D.pickCandidate([c('empty', 5, 0), c('one', 1)]).id, 'one', '공간이 없는 후보는 고르지 않는다');
  assert.equal(D.pickCandidate([]), null); assert.equal(D.pickCandidate(null), null);
});

const plan = (extra = {}) => ({ v: 1, vertical: { id: 'fb_cafe', name: '카페', group: 'FB' }, title: '', summary: '',
  spaces: [{ id: 'fb_cafe_s2', name: 'DT 매장', kind: 'lounge', products: ['qm55c'] }, { id: 'fb_qsr_s1', name: '가두 매장', kind: 'reception', products: ['qm55c'] }], at: 1, ...extra });
const proposal = (sp, extra = {}) => ({ id: 'p1', ctx: { products: ['qm55c'], solutions: [], cases: [] }, spacePlan: sp, parts: [], ...extra });

test('조감도를 바로 만드는 때 — 없음 · 실패 · 중단 · 구성이 바뀜 · 채울 수 없는 다른 계정의 조감도', () => {
  const sig = D.planSig(plan(), ['qm55c']);
  const done = (b) => proposal(plan({ birdseye: { status: 'done', historyId: 'h1', by: 'admin', sig, ...b } }));
  assert.equal(D.birdseyeNeeded(proposal(plan()), { me: 'admin' }), true, 'DSS 단계에서 조감도를 만들지 않았다');
  assert.equal(D.birdseyeNeeded(done(), { me: 'admin' }), false, 'DSS 단계에서 만든 조감도를 그대로 쓴다');
  assert.equal(D.birdseyeNeeded(done({ status: 'error', historyId: undefined }), { me: 'admin' }), true);
  assert.equal(D.birdseyeNeeded(done({ status: 'running', historyId: undefined }), { me: 'admin' }), true, '저장은 running 인데 이 탭에서 돌지 않음 = 중단');
  assert.equal(D.birdseyeNeeded(done({ status: 'running' }), { me: 'admin', running: true }), false, '이 탭에서 만드는 중');
  assert.equal(D.birdseyeNeeded(done({ sig: '["other"]' }), { me: 'admin' }), true, '만든 뒤 공간 구성이 바뀌었다');
  assert.equal(D.birdseyeNeeded(done({ by: 'kim' }), { me: 'admin' }), true, '다른 계정의 조감도는 이 계정이 열 수 없다');
  assert.equal(D.birdseyeNeeded(proposal(plan()), { me: 'admin', sheets: false }), false, '받을 조감도 장이 없으면 만들지 않는다');
  assert.equal(D.birdseyeNeeded(proposal(null), { me: 'admin' }), false, '공간 구성이 없다');
  assert.equal(D.birdseyeNeeded(proposal(plan({ spaces: [] })), { me: 'admin' }), false);
  assert.equal(D.birdseyeNeeded(proposal(plan(), { _share: { canEdit: false } }), { me: 'admin' }), false, '고칠 수 없는 공유 제안서');
});

test('조감도 장 — 업종 견본 장면이 붙은 범례 장(pn63a3to)과 그림만 받은 범례 장도 다시 채운다, 사람이 고른 그림은 그대로', () => {
  assert.deepEqual(D.birdseyeSlotsOf('L_VS_BIRD_S3', htmlOf), { spatial: false, images: [0] });
  const sheet = (uid, f, extra = {}) => ({ uid, f, status: 'done', ov: { t: {}, img: {} }, ...extra });
  const scene = (documentId) => ({ version: 1, view: '3d', scene: { source: { documentId } } });
  const p = { parts: [{ id: 's1', layouts: [
    // pn63a3to: 업종 견본 그림 + 시트 팝업에서 돌려 보고 저장한 업종 견본 장면(documentId 'vstd') — 이 제안서의 공간이 아니다
    sheet('template', 'L_VS_BIRD_S3', { ov: { t: {}, img: { 0: { src: 'data:image/png;base64,AAAA', fit: 'contain', keep: true } }, spatial: scene('vstd') } }),
    // 예전 방식으로 그림만 넣은 장(번호 핀 좌표 없음)
    sheet('pictureOnly', 'L_VS_BIRD_S3', { ov: { t: {}, img: { 0: { src: 'u:a', birdseye: 'h1' } } } }),
    // 이 조감도를 그림 · 장면 모두 받은 장, 사람이 그 장면을 돌려 보고 저장한 장 — 다 채웠다
    sheet('filled', 'L_VS_BIRD_S3', { birdseye: 'h1', ov: { t: {}, img: { 0: { src: 'u:b', birdseye: 'h1' } }, spatial: scene('sb-p1') } }),
    sheet('rotated', 'L_VS_BIRD_S3', { ov: { t: {}, img: { 0: { src: 'u:c', birdseye: 'h1' } }, spatial: scene('sb-p1') } }),
    // 업종 견본 장면은 남았는데 그림만 이 조감도로 바뀐 장 — 핀이 견본 공간을 가리킨다
    sheet('staleScene', 'L_VS_BIRD_S3', { ov: { t: {}, img: { 0: { src: 'u:d', birdseye: 'h1' } }, spatial: scene('vstd') } }),
    sheet('picked', 'L_VS_BIRD_S3', { ov: { t: {}, img: { 0: { src: 'u:x', selectedBy: 'user' } }, spatial: scene('vstd') } }),
    sheet('space', 'L_VS_SPACE'),
  ] }] };
  assert.deepEqual(D.birdseyeSlots(p, 'h1', htmlOf).map((x) => x.uid), ['template', 'pictureOnly', 'staleScene']);
  assert.deepEqual(D.birdseyeSlots(p, null, htmlOf).map((x) => x.uid), ['template', 'pictureOnly', 'filled', 'rotated', 'staleScene'],
    '조감도가 아직 없으면(null) 사람이 고르지 않은 조감도 칸이 모두 받을 칸 — 바로 만들지 판단할 때 쓴다');
});

test('범례 줄이 장면의 방보다 많아도 가운데 형태의 버블 수와 점 수가 같다', () => {
  const info = birdseyeSheetInfo('L_VS_BIRD_S3');
  const ov = { spatial: { version: 1, view: '3d', scene: { rooms: [{ id: 'r1' }, { id: 'r2' }] }, roomIds: ['r1', 'r2'],
    anchors: { width: 1280, height: 820, rooms: { r1: { x: 300, y: 300 }, r2: { x: 900, y: 500 } } } } };
  const frame = birdseyeFrame(info, ov);
  assert.equal(frame.points.length, 3);
  assert.deepEqual(frame.points.map((pt) => pt.visible), [true, true, false]);
  const geo = centerGeometry(frame, 3);
  assert.equal(geo.bubbles.filter(Boolean).length, 3);
});

// 3D 렌더 없이 서비스의 입력 만들기만 — 브라우저 전역을 흉내 내고 앱 자료로 부트스트랩한다
async function service() {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 };
  globalThis.window ||= globalThis; globalThis.addEventListener ||= () => {}; globalThis.removeEventListener ||= () => {};
  globalThis.localStorage ||= storage; globalThis.sessionStorage ||= storage;
  const { configureBootstrap } = await import('../web/src/api/bootstrap.js');
  configureBootstrap({ catalog: read('catalog.json'), images: read('images.json'), products: read('products_db.json'), subscriptions: read('subscriptions.json') });
  return import('../web/src/services/space-plan.js');
}

test('놓을 3D 제품이 없어도 자동 생성은 공간만으로 조감도를 만든다 · 방 순서 = 공간 구성 순서', async () => {
  const S = await service();
  const { createSceneFromForm } = await import('../web/src/domain/spatial/studio-form.js');
  const library = read('spatial/library.json');
  const physical = new Set(library.assets.filter((a) => a.productId && a.physical).map((a) => a.productId));
  const soft = read('products_db.json').products.find((x) => !physical.has(x.id));
  assert.ok(soft, '3D 형상이 없는 제품이 자료에 있다');
  const p = { id: 'p1', customer: 'A 커피', title: 'A 커피 · 기본 제안서', ind: 'FB', ctx: { products: [soft.id], solutions: [], cases: [] },
    spacePlan: plan({ spaces: [{ id: 'a', name: 'DT 매장', kind: 'lounge', products: [soft.id] }, { id: 'b', name: '가두 매장', kind: 'reception', products: [soft.id] }] }) };
  assert.throws(() => S.birdseyeForm(p, library), /놓을 수 있는 제품이 없어요/, 'DSS 공간 구성 팝업에서 직접 누를 때는 그대로 알린다');
  const { form, placed, skipped } = S.birdseyeForm(p, library, { allowEmpty: true });
  assert.equal(placed, 0); assert.deepEqual(skipped, [soft.id]);
  assert.deepEqual(form.rooms.map((r) => r.name), ['DT 매장', '가두 매장']);
  const scene = createSceneFromForm(form, library, { documentId: 'sb-p1' });
  assert.deepEqual(scene.rooms.map((r) => r.name), ['DT 매장', '가두 매장'], '장면의 N번째 방 = 공간 구성 N번째 공간 = 범례 N번');
  // 3D 제품이 있는 공간 구성 — pn63a3to 와 같은 두 공간 · 같은 제품
  const real = { ...p, ctx: { products: ['qm55c'], solutions: [], cases: [] }, spacePlan: plan() };
  const r = S.birdseyeForm(real, library);
  assert.equal(r.placed, 1); assert.deepEqual(r.form.rooms.map((x) => x.products.map((q) => q.productId)), [['qm55c'], ['qm55c']], '두 공간 모두 그 공간의 제품을 둔다');
  assert.equal(typeof S.ensureComposeSpaces, 'function'); assert.equal(typeof S.ensureBirdseye, 'function'); assert.equal(typeof S.autoBirdseye, 'function');
});
