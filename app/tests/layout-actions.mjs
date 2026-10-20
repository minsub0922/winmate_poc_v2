import assert from 'node:assert/strict';
import test from 'node:test';
import { validateActionPlan, validateExecution, actionView, decodeActionOutput, validateReflowGrid } from '../web/src/services/layout-actions.js';
const evidence = { nodes: [{ id: 't1', type: 'text', text: '목차', x: 64, y: 66, w: 1060, h: 42 }, { id: 'i0', type: 'image', hint: '사진', x: 64, y: 160, w: 300, h: 180 }], targets: [{ label: '사진 카드', count: 6, region: { x: 64, y: 150, w: 1152, h: 480 } }], imageOptions: [{ id: 'cafe', src: '/img/cafe.jpg', label: '카페 메뉴보드' }] };
const plan = actions => ({ status: 'ready', actions, issues: [] });
test('action-only plan rejects a chat answer and arbitrary fields', () => {
  assert.equal(validateActionPlan(plan([{ type: 'move', targets: ['t1'], values: { dx: 24, dy: 8 } }]), evidence), true);
  assert.notEqual(validateActionPlan({ ...plan([]), message: '답변입니다.' }, evidence), true);
  assert.notEqual(validateActionPlan(plan([{ type: 'move', targets: ['t1'], values: { dx: 24, html: '<script/>' } }]), evidence), true);
  assert.notEqual(validateActionPlan(plan([{ type: 'move', targets: ['unknown'], values: { dx: 24 } }]), evidence), true);
});
test('approval compiler preserves the exact target, operation and approved values', () => {
  const actions = [{ id: 'a1', type: 'move', targets: ['t1'], values: { dx: 24, dy: 8 } }];
  const op = { actionId: 'a1', type: 'move', target: 't1', values: { dx: 24, dy: 8 } };
  assert.equal(validateExecution({ operations: [op] }, actions, evidence), true);
  for (const changed of [{ ...op, target: 'i0' }, { ...op, type: 'remove' }, { ...op, values: { dx: 25, dy: 8 } }, { ...op, values: { dx: 24.001, dy: 8 } }, { ...op, values: { dx: 24, dy: 8, w: 500 } }]) assert.notEqual(validateExecution({ operations: [changed] }, actions, evidence), true);
  assert.notEqual(validateExecution({ operations: [] }, actions, evidence), true);
  assert.notEqual(validateExecution({ operations: [op, op] }, actions, evidence), true);
});
test('only additional placement geometry can be decided after add-text approval', () => {
  const actions = [{ id: 'a1', type: 'add_text', targets: [], values: { text: '파일럿 검토', fontSize: 20 } }];
  const op = { actionId: 'a1', type: 'add_text', target: '', values: { text: '파일럿 검토', fontSize: 20, x: 900, y: 64, w: 280, h: 44 } };
  assert.equal(validateExecution({ operations: [op] }, actions, evidence), true);
  assert.notEqual(validateExecution({ operations: [{ ...op, values: { ...op.values, text: '다른 문구' } }] }, actions, evidence), true);
  assert.notEqual(validateExecution({ operations: [{ ...op, values: { ...op.values, x: 1200 } }] }, actions, evidence), true);
});
test('image replacement is bound to the available approved asset', () => {
  assert.equal(validateActionPlan(plan([{ type: 'replace_image', targets: ['i0'], values: { imageId: 'cafe' } }]), evidence), true);
  assert.notEqual(validateActionPlan(plan([{ type: 'replace_image', targets: ['i0'], values: { imageId: 'https://untrusted.example/picture' } }]), evidence), true);
  const p = plan([{ type: 'replace_text', targets: ['t1'], values: { text: '도입 개요' } }]);
  assert.equal(actionView(p.actions[0], evidence).rows[0].value, '목차');
  assert.equal(actionView(p.actions[0], evidence).rows[1].value, '도입 개요');
});
test('multiple independent actions allowed; conflicting edits or unapproved reflow scope rejected', () => {
  assert.equal(validateActionPlan(plan([{ type: 'move', targets: ['t1'], values: { dx: 10 } }, { type: 'replace_text', targets: ['t1'], values: { text: '도입 개요' } }, { type: 'add_text', targets: [], values: { text: '안내' } }]), evidence), true);
  assert.notEqual(validateActionPlan(plan([{ type: 'remove', targets: ['t1'], values: {} }, { type: 'replace_text', targets: ['t1'], values: { text: '안내' } }]), evidence), true);
  assert.notEqual(validateActionPlan(plan([{ type: 'reflow', targets: [], values: { target: 0, count: 4 } }, { type: 'move', targets: ['i0'], values: { dx: 10 } }]), evidence), true);
});

test('wire decoder rejects duplicate keys/units and decodes exact numeric action values', () => {
  const raw = { status: 'ready', actions: [{ type: 'move', targets: ['t1'], values: [{ key: 'dx', value: '24' }] }], issues: [] };
  assert.equal(decodeActionOutput(raw).actions[0].values.dx, 24);
  assert.throws(() => decodeActionOutput({ ...raw, actions: [{ ...raw.actions[0], values: [{ key: 'dx', value: '24px' }] }] }));
  assert.throws(() => decodeActionOutput({ ...raw, actions: [{ ...raw.actions[0], values: [{ key: 'dx', value: '24' }, { key: 'dx', value: '25' }] }] }));
});
test('second model may fill placement but cannot introduce unapproved styling', () => {
  const actions = [{ id: 'a1', type: 'add_text', targets: [], values: { text: '안내' } }];
  const op = { actionId: 'a1', type: 'add_text', target: '', values: { text: '안내', x: 900, y: 64, w: 280, h: 44, color: '#ff0000' } };
  assert.notEqual(validateExecution({ operations: [op] }, actions, evidence), true);
  assert.match(actionView({ type: 'add_text', targets: [], values: { text: '안내', x: 900 } }, evidence).rows.find(r => r.label === '위치').value, /X 900/);
});
test('reflow rejects outside elements moved into the approved repeat area', () => {
  assert.notEqual(validateActionPlan(plan([{ type: 'reflow', targets: [], values: { target: 0, count: 4 } }, { type: 'move', targets: ['t1'], values: { y: 200 } }]), evidence), true);
});
test('approved reflow rows, columns, gap are verified from actual designed boxes', () => {
  const p = { cards: [{ box: { x: 64, y: 160, w: 300, h: 200 } }, { box: { x: 380, y: 160, w: 300, h: 200 } }, { box: { x: 64, y: 376, w: 300, h: 200 } }, { box: { x: 380, y: 376, w: 300, h: 200 } }] };
  assert.equal(validateReflowGrid(p, { rows: 2, columns: 2, gap: 16 }), true);
  for (const constraints of [{ rows: 1 }, { columns: 4 }, { gap: 8 }]) assert.notEqual(validateReflowGrid(p, constraints), true);
});
