import { Immer } from 'immer';

// Repositories publish immutable record identities, while external JSON stays unfrozen.
// Do not copy document bodies or an entire conversation for a progress-only update.
const { produce } = new Immer({ autoFreeze: false });
export function changeRecord(record, edit, { touch = false, now = Date.now } = {}) {
  const next = produce(record, draft => { edit(draft); });
  if (next === record || !touch) return next;
  return produce(next, draft => { draft.updatedAt = now(); });
}
