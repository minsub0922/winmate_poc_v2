import { Immer } from 'immer';

// Preserve untouched sheets (including large spatial snapshots) by identity.
// The repository owns mutable JSON; freezing all loaded history would be a breaking change.
const { produce } = new Immer({ autoFreeze: false });
export function changeProposal(original, edit, { normalize, backgrounds, mark, touch = true, now = Date.now } = {}) {
  const changed = produce(original, draft => { edit(draft); });
  if (changed === original) return original;
  const contextChanged = ['title', 'customer', 'ind', 'req', 'ctx'].some(key => changed[key] !== original[key])
    || changed.spacePlan?.spaces !== original.spacePlan?.spaces || changed.spacePlan?.scope !== original.spacePlan?.scope;
  const contentChanged = changed.parts !== original.parts;
  const bgChanged = changed.bg !== original.bg;
  const normalized = produce(changed, draft => {
    if (contentChanged) normalize?.(draft);
    if (contentChanged || bgChanged) backgrounds?.(draft);
  });
  return produce(normalized, draft => {
    if (contentChanged || contextChanged || bgChanged) {
      const before = new Map(original.parts.map(part => [part.id, part]));
      const untouched = contextChanged || bgChanged ? new Set() : new Set(normalized.parts.filter(part => part === before.get(part.id)).map(part => part.id));
      mark?.(draft, original, { untouched });
    }
    if (touch) draft.updatedAt = now();
  });
}
