// Runtime edits; one server document is used by the admin, the app and the agents.
import { parseLayout, attr } from './layout_cleanup.js';
import { offSet } from '../../api/resource-switches.js';
let snapshot = { v: 1, rev: 0, items: {} };
let groups = {};
const listeners = new Set();
export const layoutLibrary = () => snapshot;
export const layoutLibraryEntry = f => snapshot.items?.[f] || {};
export const registerLibraryGroups = value => { groups = value; };
// 관리자 데이터 소스에서 끈 레이아웃도 삭제한 장과 같은 길로 목록 · 검색 · 추천에서 빠진다
export const layoutDeleted = f => !!(layoutLibraryEntry(f).deleted || layoutLibraryEntry(groups[f]).deleted || offSet('layout').has(f) || (groups[f] && offSet('layout').has(groups[f])));
export function configureLayoutLibrary(value) {
  value ||= { v: 1, rev: 0, items: {} };
  if (JSON.stringify(value) === JSON.stringify(snapshot)) return false;
  snapshot = value;
  for (const fn of listeners) fn(value);
  return true;
}
export const onLayoutLibrary = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function applyLibraryHtml(f, html) {
  const entry = layoutLibraryEntry(f);
  // 관리자가 고른 디자인(디자인 코드를 고쳐 올린 결과본)이 이 장의 틀을 바꾼다 — 칸 번호 · 개수는 같다(app/api/layout_library.design_check)
  if (typeof entry.design?.html === 'string' && entry.design.html) html = entry.design.html;
  if (!html || !Object.keys(entry).length) return html;
  const edits = [];
  for (const n of parseLayout(html).nodes) {
    const kind = n.img != null ? 'img' : n.tb != null ? 't' : null, i = n.img ?? n.tb;
    if (!kind) continue;
    let tag = n.tag;
    let mode = entry.modes?.[kind]?.[i];
    if (entry.fill === 'fixed') mode = attr(n.attrs, 'data-fix') === 'section' ? 'section' : 'fixed';
    if (mode != null) {
      tag = tag.replace(/\sdata-fix="[^"]*"/g, '');
      if (mode !== 'ai') tag = tag.slice(0, -1) + ` data-fix="${mode}">`;
    }
    if (kind === 't' && Object.hasOwn(entry.t || {}, i)) edits.push([n.openEnd, n.closeStart, esc(entry.t[i]).replace(/\n/g, '<br>')]);
    if (kind === 'img' && entry.img?.[i]) {
      const value = entry.img[i], attrs = ` src="${esc(value)}"${/\.json#\d+$/.test(value) ? ` data-fill="${esc(value)}"` : ''}`;
      if (n.name === 'img') tag = tag.replace(/\s(?:src|data-fill|data-pid)="[^"]*"/g, '').slice(0, -1) + attrs + '>';
      else {
        tag = tag.replace(/\s(?:data-fill|data-pid)="[^"]*"/g, '');
        let inner = html.slice(n.openEnd, n.closeStart).replace(/\s(?:src|data-fill|data-pid)="[^"]*"/g, '').replace(/<img\b/, '<img' + attrs);
        if (!inner.includes('<img')) inner = `<img${attrs} style="width:100%;height:100%;object-fit:contain">`;
        edits.push([n.openEnd, n.closeStart, inner]);
      }
    }
    if (tag !== n.tag) edits.push([n.start, n.openEnd, tag]);
  }
  edits.sort((a, b) => b[0] - a[0]);
  for (const [start, end, value] of edits) html = html.slice(0, start) + value + html.slice(end);
  return html;
}
