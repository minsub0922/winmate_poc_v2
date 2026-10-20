// Shared structured contract. Model responses contain actions/operations, never a chat answer.
const string = { type: 'STRING' };
export const ACTION_TYPES = ['move', 'resize', 'style', 'replace_text', 'add_text', 'add_image', 'replace_image', 'remove', 'reflow'];
const VALUES = {
  move: ['x', 'y', 'dx', 'dy'], resize: ['w', 'h'], style: ['fontSize', 'color', 'align'], replace_text: ['text'],
  add_text: ['text', 'x', 'y', 'w', 'h', 'fontSize', 'color', 'align'], add_image: ['imageId', 'fit', 'x', 'y', 'w', 'h'],
  replace_image: ['imageId', 'fit'], remove: [], reflow: ['target', 'count', 'columns', 'rows', 'gap'],
};
const numeric = new Set(['x', 'y', 'dx', 'dy', 'w', 'h', 'fontSize', 'target', 'count', 'columns', 'rows', 'gap']);
// A compact key/value wire format is accepted by the configured model. Numeric values are decoded locally.
// The API schema fixes structure; local validators enforce operation enums, bounds, limits and approval scope.
const VALUE_KEYS = [...new Set(Object.values(VALUES).flat())];
const valuesSchema = { type: 'ARRAY', maxItems: 12, items: { type: 'OBJECT', properties: { key: { type: 'STRING', enum: VALUE_KEYS }, value: string }, required: ['key', 'value'] } };
export function decodeActionOutput(output, field = 'actions') {
  if (!output || !Array.isArray(output[field])) throw new Error('구조화된 작업 목록이 필요합니다.');
  return { ...output, [field]: output[field].map(action => {
    if (!Array.isArray(action.values) || action.values.length > 12) throw new Error('values는 key/value 목록이어야 합니다.');
    const values = Object.create(null);
    for (const entry of action.values) {
      if (!entry || !VALUE_KEYS.includes(entry.key) || typeof entry.value !== 'string' || entry.key in values) throw new Error('중복 없는 허용된 key/value만 사용하세요.');
      if (numeric.has(entry.key)) {
        if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(entry.value.trim())) throw new Error('숫자 값에는 단위 없이 숫자만 사용하세요.');
        values[entry.key] = Number(entry.value);
      } else values[entry.key] = entry.key === 'color' ? entry.value.toLowerCase() : entry.value;
    }
    return { ...action, values };
  }) };
}
const typeSchema = { type: 'STRING', enum: ACTION_TYPES };
const compactSchema = value => Array.isArray(value) ? value.map(compactSchema) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => !['enum', 'maxItems', 'minItems'].includes(k)).map(([k, v]) => [k, compactSchema(v)])) : value;
export const actionPlanSchema = compactSchema({ type: 'OBJECT', properties: {
  status: { type: 'STRING', enum: ['ready', 'needs_input', 'unsupported'] },
  actions: { type: 'ARRAY', maxItems: 24, items: { type: 'OBJECT', properties: { type: typeSchema, targets: { type: 'ARRAY', items: string }, values: valuesSchema }, required: ['type', 'targets', 'values'] } },
  issues: { type: 'ARRAY', maxItems: 4, items: { type: 'OBJECT', properties: { code: { type: 'STRING', enum: ['target_missing', 'asset_missing', 'unsupported', 'split_reflow'] }, reference: string }, required: ['code', 'reference'] } },
}, required: ['status', 'actions', 'issues'] });
export const executionSchema = compactSchema({ type: 'OBJECT', properties: {
  operations: { type: 'ARRAY', maxItems: 100, items: { type: 'OBJECT', properties: { actionId: string, type: typeSchema, target: string, values: valuesSchema }, required: ['actionId', 'type', 'target', 'values'] } },
}, required: ['operations'] });
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const ownKeys = (object, allowed) => Object.keys(object).every(k => allowed.includes(k));
const same = (a, b) => a === b;
function valuesValid(type, v, evidence, execution = false) {
  if (!plain(v) || !ownKeys(v, VALUES[type])) return '허용된 작업 속성만 사용하세요.';
  if (Object.entries(v).some(([k, x]) => numeric.has(k) && !Number.isFinite(x))) return '위치·크기·개수는 유한한 숫자여야 합니다.';
  if (v.w !== undefined && v.w < 16 || v.h !== undefined && v.h < 12 || v.fontSize !== undefined && (v.fontSize < 10 || v.fontSize > 120)) return '읽을 수 있는 영역·글자 크기를 사용하세요.';
  if (v.color !== undefined && !/^#[\da-f]{6}$/i.test(v.color) || v.align !== undefined && !['left', 'center', 'right'].includes(v.align) || v.fit !== undefined && !['cover', 'contain'].includes(v.fit)) return '색/정렬/맞춤 값이 잘못되었습니다.';
  if (['replace_text', 'add_text'].includes(type) && (typeof v.text !== 'string' || !v.text.trim() || v.text.length > 2000)) return '추가/수정할 실제 문구가 필요합니다.';
  if (['add_image', 'replace_image'].includes(type) && !evidence.imageOptions?.some(im => im.id === v.imageId)) return '이미지는 제공된 실제 imageOptions ID만 선택하세요.';
  if (type === 'move' && (!['x', 'y', 'dx', 'dy'].some(k => v[k] !== undefined) || v.x !== undefined && v.dx !== undefined || v.y !== undefined && v.dy !== undefined)) return '이동할 축의 좌표 또는 이동량을 하나씩 명시하세요.';
  if (type === 'resize' && v.w === undefined && v.h === undefined || type === 'style' && !Object.keys(v).length) return '실제 변경할 크기/스타일이 필요합니다.';
  if (type === 'reflow' && (!Number.isInteger(v.target) || (!evidence.targets[v.target] && !(v.target === -1 && evidence.discovery === 'needs-analysis')) || !Number.isInteger(v.count) || v.count < 1 || v.count > 16 || ['columns', 'rows'].some(k => v[k] !== undefined && (!Number.isInteger(v[k]) || v[k] < 1 || v[k] > 16)) || v.gap !== undefined && (v.gap < 0 || v.gap > 80))) return '실제 반복 영역과 1~16의 목표 개수/행열을 명시하세요.';
  if (type.startsWith('add_') && execution && !['x', 'y', 'w', 'h'].every(k => Number.isFinite(v[k]))) return '추가 요소는 실행 시 전체 좌표·크기가 필요합니다.';
  if (v.x !== undefined && (v.x < 0 || v.x >= 1280) || v.y !== undefined && (v.y < 0 || v.y >= 720) || v.w > 1280 || v.h > 720 || v.x !== undefined && v.w !== undefined && v.x + v.w > 1281 || v.y !== undefined && v.h !== undefined && v.y + v.h > 721) return '1280×720 영역 안에서 배치하세요.';
  return true;
}
export function validateActionPlan(plan, evidence) {
  if (!plain(plan) || !ownKeys(plan, ['status', 'actions', 'issues']) || !['ready', 'needs_input', 'unsupported'].includes(plan.status) || !Array.isArray(plan.actions) || !Array.isArray(plan.issues)) return 'status/actions/issues만 포함한 구조화된 출력이 필요합니다. 답변 문장은 반환하지 마세요.';
  if (plan.status !== 'ready') return plan.actions.length === 0 && plan.issues.length > 0 && plan.issues.length <= 4 && plan.issues.every(i => ['target_missing', 'asset_missing', 'unsupported', 'split_reflow'].includes(i.code) && typeof i.reference === 'string' && i.reference.length <= 120) || '실행할 수 없으면 actions=[]와 구조화된 issue가 필요합니다.';
  if (!plan.actions.length || plan.actions.length > 24 || plan.issues.length) return '실행 가능한 1~24개 action과 빈 issues가 필요합니다.';
  let reflow = null; const writes = new Set();
  for (const a of plan.actions) {
    if (!plain(a) || !ownKeys(a, ['id', 'type', 'targets', 'values']) || !ACTION_TYPES.includes(a.type) || !Array.isArray(a.targets) || new Set(a.targets).size !== a.targets.length) return '허용된 action type과 중복 없는 targets가 필요합니다.';
    const valid = valuesValid(a.type, a.values, evidence); if (valid !== true) return valid;
    const adds = a.type.startsWith('add_') || a.type === 'reflow';
    if (adds ? a.targets.length : !a.targets.length) return '추가/재배치는 targets=[], 나머지는 실제 요소 targets를 명시하세요.';
    if (a.type === 'reflow') { if (reflow) return '반복 영역 재배치는 한 번에 한 영역만 요청하세요.'; reflow = a; }
    for (const id of a.targets) {
      const n = evidence.nodes.find(n => n.id === id); if (!n) return `${id}: 현재 요소 ID만 사용하세요.`;
      if (['replace_text', 'style'].includes(a.type) && n.type !== 'text' || a.type === 'replace_image' && n.type !== 'image') return '문구/글 스타일은 text, 이미지 교체는 image 대상으로 지정하세요.';
      const keys = a.type === 'remove' ? ['remove'] : a.type === 'move' ? Object.keys(a.values).map(k => ['dx', 'dy'].includes(k) ? k.slice(1) : k) : Object.keys(a.values);
      for (const k of keys) { const key = `${id}:${k}`; if (writes.has(key) || writes.has(`${id}:remove`)) return '같은 요소의 같은 속성을 중복 수정하지 마세요.'; writes.add(key); }
      if (a.type === 'remove' && [...writes].some(k => k.startsWith(id + ':') && k !== `${id}:remove`)) return '삭제하는 요소를 동시에 수정하지 마세요.';
    }
  }
  if (reflow) {
    const r = evidence.targets[reflow.values.target]?.region;
    if (!r) return plan.actions.length === 1 || '미확인 반복 영역은 먼저 단독으로 분석하세요.';
    const inside = n => n.x < r.x + r.w && n.x + n.w > r.x && n.y < r.y + r.h && n.y + n.h > r.y;
    if (plan.actions.some(a => a !== reflow && a.targets.some(id => { const n = evidence.nodes.find(n => n.id === id), v = a.values; return inside(n) || inside({ ...n, ...(['move', 'resize'].includes(a.type) ? v : {}), x: v.x ?? n.x + (v.dx || 0), y: v.y ?? n.y + (v.dy || 0) }); }))) return '재배치될 반복 영역 안의 개별 수정은 재배치 후 별도 요청하세요. split_reflow issue를 사용하세요.';
    if (plan.actions.some(a => a.type.startsWith('add_') && (!['x', 'y', 'w', 'h'].every(k => Number.isFinite(a.values[k])) || inside(a.values)))) return '재배치와 함께 추가하는 요소는 반복 영역 밖의 정확한 위치가 필요합니다.';
  }
  return true;
}
export function validateExecution(result, approved, evidence) {
  if (!plain(result) || !ownKeys(result, ['operations']) || !Array.isArray(result.operations)) return 'operations만 포함한 구조화된 출력이 필요합니다.';
  const expected = approved.flatMap(a => (a.targets.length ? a.targets : ['']).map(target => `${a.id}:${target}`));
  const seen = new Set();
  for (const op of result.operations) {
    if (!plain(op) || !ownKeys(op, ['actionId', 'type', 'target', 'values'])) return '허용된 실행 필드만 사용하세요.';
    const action = approved.find(a => a.id === op.actionId), key = `${op.actionId}:${op.target}`;
    if (!action || action.type !== op.type || !expected.includes(key) || seen.has(key)) return '승인된 action의 타입·대상을 정확히 한 번씩 실행하세요.';
    seen.add(key); const valid = valuesValid(op.type, op.values, evidence, true); if (valid !== true) return valid;
    for (const [k, value] of Object.entries(action.values)) if (!same(op.values[k], value)) return `승인된 ${action.id}.${k} 값은 바꿀 수 없습니다.`;
    const optional = op.type.startsWith('add_') ? ['x', 'y', 'w', 'h'] : [];
    if (Object.keys(op.values).some(k => !(k in action.values) && !optional.includes(k))) return '승인하지 않은 변경 속성을 추가하지 마세요.';
  }
  return seen.size === expected.length || '승인한 모든 작업을 빠짐없이 실행하세요.';
}
export const ACTION_LABELS = { move: '이동', resize: '크기 변경', style: '스타일 수정', replace_text: '문구 수정', add_text: '글 상자 추가', add_image: '이미지 추가', replace_image: '이미지 교체', remove: '삭제', reflow: '반복 영역 재배치' };
export function actionView(action, evidence) {
  const v = action.values, nodes = action.targets.map(id => evidence.nodes.find(n => n.id === id));
  const target = action.type === 'reflow' ? evidence.targets[v.target]?.label : nodes.map(n => n?.text || n?.hint || '이미지').join(' · ');
  const rows = [];
  const add = (label, value) => rows.push({ label, value });
  if (action.type === 'move') { if (v.dx !== undefined) add('가로 이동', `${v.dx > 0 ? '+' : ''}${v.dx}px`); if (v.dy !== undefined) add('세로 이동', `${v.dy > 0 ? '+' : ''}${v.dy}px`); if (v.x !== undefined) add('X', `${nodes.length === 1 ? nodes[0].x + ' → ' : ''}${v.x}px`); if (v.y !== undefined) add('Y', `${nodes.length === 1 ? nodes[0].y + ' → ' : ''}${v.y}px`); }
  if (action.type === 'reflow') { add('개수', `${evidence.targets[v.target].count} → ${v.count}개`); add('배치', [v.rows && v.rows + '행', v.columns && v.columns + '열', v.gap !== undefined && '간격 ' + v.gap + 'px'].filter(Boolean).join(' · ') || '개수에 맞게 영역 재구성'); }
  if (v.text !== undefined) { if (action.type === 'replace_text') add('기존 문구', nodes.map(n => n.text).join(' · ')); add('새 문구', v.text); }
  for (const [key, label] of [['w', '너비'], ['h', '높이'], ['fontSize', '글자 크기'], ['color', '색상'], ['align', '정렬']]) if (v[key] !== undefined) add(label, key === 'align' ? { left: '왼쪽', center: '가운데', right: '오른쪽' }[v[key]] : v[key] + (numeric.has(key) ? 'px' : ''));
  if (action.type.startsWith('add_')) add('위치', [v.x !== undefined ? `X ${v.x}` : 'X 자동 배치', v.y !== undefined ? `Y ${v.y}` : 'Y 자동 배치'].join(' · '));
  if (v.fit) add('맞춤', v.fit === 'contain' ? '전체 이미지 표시' : '영역 채우기');
  if (action.type === 'remove') add('삭제 대상', target);
  const asset = evidence.imageOptions?.find(im => im.id === v.imageId); if (asset) add('새 이미지', asset.label);
  return { title: ACTION_LABELS[action.type], target, rows, asset };
}

/** Enforce approved row/column/gap values on the actual model-designed card boxes. */
export function validateReflowGrid(plan, constraints = {}) {
  const rows = [];
  for (const card of [...plan.cards].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)) {
    let row = rows.find(r => Math.abs(r[0].box.y - card.box.y) <= 2); if (!row) rows.push(row = []); row.push(card);
  }
  if (constraints.rows !== undefined && rows.length !== constraints.rows) return `승인한 ${constraints.rows}행을 지키세요. 현재 ${rows.length}행입니다.`;
  const columns = Math.max(0, ...rows.map(r => r.length));
  if (constraints.columns !== undefined && columns !== constraints.columns) return `승인한 ${constraints.columns}열을 지키세요. 현재 ${columns}열입니다.`;
  if (constraints.gap !== undefined) {
    const gaps = [];
    for (const row of rows) { row.sort((a, b) => a.box.x - b.box.x); for (let i = 1; i < row.length; i++) gaps.push(row[i].box.x - row[i - 1].box.x - row[i - 1].box.w); }
    for (let i = 1; i < rows.length; i++) gaps.push(Math.min(...rows[i].map(c => c.box.y)) - Math.max(...rows[i - 1].map(c => c.box.y + c.box.h)));
    if (gaps.some(gap => Math.abs(gap - constraints.gap) > 1)) return `승인한 카드 간격 ${constraints.gap}px를 가로/세로 모두 지키세요. 현재 간격: ${gaps.map(n => +n.toFixed(1)).join(', ')}`;
  }
  return true;
}
