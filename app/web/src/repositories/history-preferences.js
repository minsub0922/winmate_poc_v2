import { useSyncExternalStore } from 'react';
import { browserStorage } from './browser.js';

const KEY = 'winmate.v2.history-preferences';
const unique = values => [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string'))];
function read() {
  let saved;
  try { saved = JSON.parse(browserStorage.getItem(KEY) || '{}'); } catch { /* Empty preferences. */ }
  return { pinned: unique(saved?.pinned), removed: unique(saved?.removed), removedShares: unique(saved?.removedShares) };
}
let state = read();
const listeners = new Set();
const emit = () => { for (const listener of listeners) listener(); };
function save(next) {
  state = next;
  try { browserStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Keep this session usable. */ }
  emit();
}
export function useHistoryPins() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => state.pinned);
}
export function setHistoryPinned(id, pinned) {
  const rest = state.pinned.filter(value => value !== id);
  save({ ...state, pinned: pinned ? [id, ...rest] : rest });
}
export const historyRemoved = (id, token) => state.removed.includes(id) || !!token && state.removedShares.includes(token);
export function forgetHistory(id, token) {
  save({ ...state, pinned: state.pinned.filter(value => value !== id), removed: unique([...state.removed, id]),
    removedShares: token ? unique([...state.removedShares, token]) : state.removedShares });
}
export function restoreHistory(id, token) {
  if (!historyRemoved(id, token)) return;
  save({ ...state, removed: state.removed.filter(value => value !== id), removedShares: state.removedShares.filter(value => value !== token) });
}
window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) { state = read(); emit(); } });
