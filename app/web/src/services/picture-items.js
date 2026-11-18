// 사진 속 정확한 제품(품목) — 사용자 지시 2026-11-18: "공간 이미지의 경우 정확한 품목이 포함된 이미지야. 그래서 세탁기여도 다른 세탁기면
// 가져오면 에러야. … 공간인데 제품이 없을수도 있는데 이러한 경우는 상관없는거야."
// 서버 composer 라이브러리가 사진마다 등록한 표(composer/items.py — 그 사진의 출처가 말하는 정확한 제품 · 제품 없음 · 제품 미확인)를
// GET /api/picture-items 로 읽어, 서버 자동 구성(composer.pictures.item_reject)과 같은 기준으로 앱이 직접 고르거나 점검하는 사진 칸을 본다.
//   공간 사진 칸: 제품이 없는 사진, 또는 그 공간의 제품(같은 행 · 같은 모델 코드의 다른 카탈로그 행)이 든 사진만 — 같은 종류의 다른 제품 · 무엇인지
//                 모르는 제품이 든 사진은 안 된다. 사람 손의 폰 · 태블릿 · 노트북은 그 공간에 그런 제품이 있을 때만 제품으로 본다.
//   그 밖의 사진 칸: 정확한 제품이 확인된 사진이 고객이 고르지 않은 제품이면 안 된다.
// 표가 아직 없으면(받는 중 · 실패) 이 점검은 건너뛴다 — 다른 사진 규칙은 그대로.
import { requestJson } from '../api/client.js';
import { P } from './catalog.js';

const SHOWS = { i: 'item', n: 'none', u: 'unknown' };
const FAMILY = { '디스플레이': 'display', '공조 · 에어컨': 'hvac', '주방 · 리빙 가전': 'appliance', '모바일 · PC': 'mobile' };
let table = null, pending = null, failedAt = 0;

/** the table (once per page; after a failed request, tried again a minute later) */
export function loadPictureItems() {
  if (table) return Promise.resolve(table);
  if (!pending) pending = requestJson('/api/picture-items').then(d => { table = d && d.images ? d : null; pending = null; return table; },
    () => { pending = null; failedAt = Date.now(); return null; });
  return pending;
}
/** tests: put a table in place of the server's */
export function setPictureItems(value) { table = value; }

const norm = src => { const s = String((src && typeof src === 'object' ? src.src : src) || ''); return s.startsWith('/img/') ? s.slice(1) : s; };
/** { shows: 'item' | 'none' | 'unknown', items: [product id], fams: ['display' …] } — null: not a library photo (an uploaded picture) or no table yet */
export function pictureItems(src) {
  if (!table && !pending && Date.now() - failedAt > 60e3) loadPictureItems(); // (a screen that only reviews sheets asks for it on first use)
  const row = table?.images?.[norm(src)];
  return row ? { shows: SHOWS[row[0]] || 'unknown', items: row[1] || [], fams: row[2] || [] } : null;
}
/** the items of `a` that are also in `b` — the same catalog row, or a row of another catalog with the same own model code */
export function sameItems(a = [], b = []) {
  const keys = table?.keys || {};
  return a.filter(x => b.some(y => x === y || (keys[x] || []).some(k => (keys[y] || []).includes(k))));
}
const familyOf = id => FAMILY[P[id]?.fam] || '';

/** why the photo cannot stand in a space frame ('' when it can) — allowed: that space's products (a space without products: the proposal's) */
export function spacePhotoIssue(src, allowed = []) {
  const meta = pictureItems(src);
  if (!meta || meta.shows === 'none') return '';
  const fams = new Set(allowed.map(familyOf).filter(Boolean));
  const installed = meta.fams.filter(f => f !== 'mobile' || fams.has('mobile'));
  if (meta.shows !== 'item') return installed.length ? '공간 사진: 어떤 제품인지 확인되지 않은 사진' : '';
  if (!sameItems(meta.items, allowed).length) return '공간 사진: 이 공간의 제품과 다른 이미지';
  if (fams.size && installed.some(f => !fams.has(f))) return '공간 사진: 이 공간에 없는 제품이 함께 보여요';
  return '';
}
/** any other photo frame: a photo known to show an item the customer did not select */
export function sceneItemIssue(src, linked = []) {
  const meta = pictureItems(src);
  return meta && meta.shows === 'item' && !sameItems(meta.items, linked).length ? '선택하지 않은 제품 사진' : '';
}
/** the products of the space a sheet's photo frame shows — the space the server left on the sheet (agent.img[frame].space · agent.bind.space),
 * that space's products in the space plan (else the sheet's own list); a frame of no known space: the proposal's products */
export function slotSpaceItems(p, x, i) {
  const linked = p?.ctx?.products || [];
  const a = x?.agent || {};
  const sid = a.img?.[i]?.space || a.bind?.space;
  const sp = sid ? (p?.spacePlan?.spaces || []).find(s => s.id === sid) : null;
  const own = (sp?.products || (a.bind?.space === sid ? a.bind?.products : null) || []).filter(id => linked.includes(id));
  return own.length ? own : linked;
}
