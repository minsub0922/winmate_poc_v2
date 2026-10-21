import { requireLogin } from '../api/session.js';
import { browserStorage } from './browser.js';
// 찜 — layouts the person marked from any PPT layout view, kept in this browser (localStorage).
// The same layout is two different favourites when one has values (a filled sheet: ov with text · images · replacements ·
// background) and the other is the empty layout: { id, f, ov | null, filled, name, from, at }.
import { useSyncExternalStore } from 'react';
import { L } from '../services/catalog.js';
import { migrateRemovedLayoutItem, isRemovedLayout } from '../domain/templates/migrate_removed_layouts.js';

const KEY = 'winmate.v2.favs';
let LIST = load();
const subs = new Set();
function load() { try { const v = JSON.parse(browserStorage.getItem(KEY) || '[]'); if (!Array.isArray(v)) return []; if (!v.some(x => isRemovedLayout(x.f))) return v; const migrated = v.map(migrateRemovedLayoutItem); browserStorage.setItem(KEY, JSON.stringify(migrated)); return migrated; } catch (e) { return []; } }
function save() { try { browserStorage.setItem(KEY, JSON.stringify(LIST)); } catch (e) {} for (const f of subs) f(); }
export const useFavs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => LIST);
export const favList = () => LIST;

const nonEmpty = (o) => !!o && Object.values(o).some((v) => v != null && v !== '' && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length));
/** does this sheet carry its own values? (text · images · fixed-text replacements · background) */
export function hasValues(ov) {
  if (!ov) return false;
  return nonEmpty(ov.t) || nonEmpty(ov.img) || (Array.isArray(ov.r) && ov.r.length > 0) || !!(ov.bg && ov.bg.src);
}
/** the values that make a filled sheet what it is (status · evidence etc. left out) */
function valuesOf(ov) {
  if (!hasValues(ov)) return null;
  const o = {};
  if (nonEmpty(ov.t)) o.t = ov.t;
  if (nonEmpty(ov.img)) o.img = ov.img;
  if (Array.isArray(ov.r) && ov.r.length) o.r = ov.r;
  if (ov.bg && ov.bg.src) o.bg = { src: ov.bg.src, theme: ov.bg.theme || '' };
  return JSON.parse(JSON.stringify(o));
}
const stable = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}') : JSON.stringify(v));
const sigOf = (f, vals) => f + '|' + (vals ? stable(vals) : '');

export function favOf(f, ov) {
  const s = sigOf(f, valuesOf(ov));
  return LIST.find((x) => sigOf(x.f, x.ov) === s) || null;
}
/** toggle — returns the favourite it added, or null when it took one away */
export function toggleFav(f, ov, from = '') { if (!requireLogin()) return false;
  const cur = favOf(f, ov);
  if (cur) { LIST = LIST.filter((x) => x !== cur); save(); return null; }
  const vals = valuesOf(ov);
  const x = { id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), f, ov: vals, filled: !!vals, name: (L[f] && L[f].name) || f, from, at: Date.now() };
  LIST = [x, ...LIST]; save();
  return x;
}
export function removeFav(id) { if (!requireLogin()) return false; LIST = LIST.filter((x) => x.id !== id); save(); }
/** favourites whose layout no longer exists (a deleted My template) stay hidden */
export const liveFavs = (list) => list.filter((x) => L[x.f]);
