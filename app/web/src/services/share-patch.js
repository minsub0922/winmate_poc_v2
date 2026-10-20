const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const identity = x => object(x) ? x.uid || x.id : null;

/** Stable entity paths let edits to different parts/layouts merge across revisions. */
export function documentChanges(before, after, path = []) {
  if (equal(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after) && before.length && before.length === after.length
      && before.every((x, i) => identity(x) && identity(x) === identity(after[i]))
      && new Set(before.map(identity)).size === before.length) {
    return before.flatMap((x, i) => documentChanges(x, after[i], [...path, '@' + identity(x)]));
  }
  if (object(before) && object(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => {
      if (!path.length && ['id', '_share', 'share', 'sample', 'updatedAt', 'exportedAt'].includes(key)) return [];
      if (!(key in after)) return [{ path: [...path, key], exists: true, before: before[key], delete: true }];
      if (!(key in before)) return [{ path: [...path, key], exists: false, value: after[key] }];
      return documentChanges(before[key], after[key], [...path, key]);
    });
  }
  return [{ path, exists: true, before, value: after }];
}

export function applyDocumentChanges(document, operations, { force = false } = {}) {
  const copy = structuredClone(document);
  for (const op of operations) {
    let parent = copy;
    for (const key of op.path.slice(0, -1)) {
      parent = Array.isArray(parent) ? parent.find(x => String(identity(x)) === key.slice(1)) : parent?.[key];
      if (!parent) throw new Error('다른 참여자가 수정한 항목과 변경이 겹칩니다.');
    }
    const key = op.path.at(-1);
    if (!force && ((key in parent) !== op.exists || (op.exists && !equal(parent[key], op.before)))) {
      if ((!op.delete && equal(parent[key], op.value)) || (op.delete && !(key in parent))) continue;
      throw new Error('같은 항목을 다른 참여자가 수정했습니다.');
    }
    if (op.delete) delete parent[key]; else parent[key] = structuredClone(op.value);
  }
  return copy;
}
