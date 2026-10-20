import {isSpatialLayoutSelection} from '../spatial/storyboard-layout.js';
// Serializable lifecycle shared by every path that inserts or changes a proposal layout.
const digest = value => {
  const text = JSON.stringify(value); let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
export const proposalContextKey = p => digest([p.title, p.customer, p.ind, p.req, p.ctx]);
export const layoutContextKey = (p, part, rootKey = proposalContextKey(p)) => digest([rootKey, part.type, part.name, part.items, part.text]);
/** Compare with the context behind the saved contents, including a queued/failed refresh. */
export function layoutContextChanged(p, part, x) {
  const appliedKey = x?.adaptation?.appliedKey || x?.adaptation?.key;
  return !!appliedKey && appliedKey !== layoutContextKey(p, part);
}
export const layoutContentKey = x => digest([x.f, x.ov, x.ev]);
export const LAYOUT_CONTEXT_VERSION = 3;
// Image overrides and their evidence are direct edits, not a request to rewrite
// the sheet. Keep the full content key above for in-flight result protection.
const layoutNonImageKey = x => digest([x.f, { t: {}, ...x.ov, img: undefined },
  Object.fromEntries(Object.entries(x.ev || {}).filter(([key]) => !/^i\d+$/.test(key)))]);
export const contextPending = x => ['queued', 'running'].includes(x?.adaptation?.phase);
export const hasSavedLayoutContent = x => !!(Object.keys(x?.ov?.t || {}).length || Object.keys(x?.ov?.img || {}).length || Object.keys(x?.ev || {}).length || /^L_MY_/.test(x?.f || '') || x?.status === 'done' || x?.adaptation?.previousStatus === 'done');
export function queueLayout(x, key, origin = 'context') {
  const previousStatus = x.adaptation?.previousStatus || x.status;
  const appliedKey = x.adaptation?.appliedKey || x.adaptation?.key;
  x.adaptation = { ...(appliedKey ? { appliedKey } : {}), version: LAYOUT_CONTEXT_VERSION, origin, previousStatus, phase: 'queued', key, request: Math.random().toString(36).slice(2), queuedAt: Date.now() };
  x.status = 'partial';
}
/** Reading history is not a request to regenerate it. Migrate the old eager sweep
 * without changing saved text, images or evidence, or claiming an AI review. */
export function retainHistoryLayouts(p) {
  let changed = false;
  for (const part of p.parts || []) for (const x of part.layouts || []) {
    const old = x.adaptation;
    if (old?.version === LAYOUT_CONTEXT_VERSION) continue;
    // Version 2 automatically regenerated saved sheets after image edits and
    // initial sharing hydration. Those failed/pending jobs are obsolete; retain
    // their contents for review without treating them as a successful AI fill.
    const obsolete = old?.version === 2 && ['error', 'queued', 'running'].includes(old.phase)
      && hasSavedLayoutContent(x);
    if (old?.version === 2 && !obsolete || old && ['ready', 'review'].includes(old.phase)) {
      x.adaptation = { ...old, version: LAYOUT_CONTEXT_VERSION };
    } else {
      x.adaptation = { version: LAYOUT_CONTEXT_VERSION, origin: 'history', phase: 'retained', key: layoutContextKey(p, part),
        ...(old ? { needsReview: true } : {}), ...(old?.error ? { previousError: old.error } : {}) };
      if (old?.previousStatus) x.status = old.previousStatus;
    }
    changed = true;
  }
  return changed;
}
export function markLayoutChanges(draft, original) {
  const oldRoot = original ? proposalContextKey(original) : '', root = proposalContextKey(draft);
  const before = new Map((original?.parts || []).flatMap(s => { const key = layoutContextKey(original, s, oldRoot); return (s.layouts || []).map(x => [x.uid, { x, key }]); }));
  for (const part of draft.parts || []) for (const x of part.layouts || []) {
    // Explicitly selected aerial layouts keep their authored text and geometry.
    if (x.ov?.spatial||isSpatialLayoutSelection(x)) {
      x.adaptation = { version: LAYOUT_CONTEXT_VERSION, origin: 'spatial', phase: 'retained', key: layoutContextKey(draft, part, root) };
      x.status = 'done';
      continue;
    }
    const old = before.get(x.uid), key = layoutContextKey(draft, part, root);
    const edited = old && ['ready', 'retained', 'review', 'error'].includes(old.x.adaptation?.phase) && x.adaptation?.phase === old.x.adaptation.phase && layoutNonImageKey(old.x) !== layoutNonImageKey(x);
    if (!old || old.x.f !== x.f || old.key !== key || edited) queueLayout(x, key, !old ? 'added' : 'context');
    if (x.adaptation && (!['ready', 'retained'].includes(x.adaptation.phase) || x.adaptation.missing?.length)) x.status = 'partial';
  }
}
