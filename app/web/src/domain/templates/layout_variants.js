// 같은 레이아웃 · 다른 내용 (2026-11-12)
// 구조가 완전히 같고 내용만 다른 장(주로 업종판)은 레이아웃 하나(대표 장)만 남기고, 나머지는 그 레이아웃에 넣을 내용 후보로 둔다.
//
//  - 레이아웃 HTML을 '틀'과 '내용 조각'으로 나눈다. 내용 조각 = 칸(data-tb) 글 · 태그 사이 글 · 사진 칸과 <img> 태그 ·
//    차트 도형 좌표. 틀이 같으면 같은 레이아웃이다(칸 글의 크기 · 색, 사진 칸의 종류 · 여백처럼 내용에 따라 바뀌는 값은 틀에서 뺀다).
//  - 후보(업종판)는 대표 장의 틀에 자기 내용 조각만 끼워 그린다 — 원래 장과 글자 하나까지 같다(생성기가 확인).
//  - layout_variants.json (app/scripts/layout_variants.mjs가 만든다): 묶음 · 후보 키(업종) · 후보마다 대표 장과 다른 내용 조각.
//
// 칸 번호는 묶음 안에서 같다 — 저장된 제안서 · 시나리오가 쓰는 후보 장 id(L_PH_MI_HT_C …)는 그대로 그려진다.
import { parseLayout, textOf } from './layout_cleanup.js';

const TAG = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;
const ID_ATTRS = /\s(?:src|alt|data-pid|data-fill|data-hint|data-products|data-name|data-kind|data-slot|data-fix|data-type-role)="[^"]*"/g;
const TB_STYLE = new Set(['font-size', 'color', 'background', 'background-color']);
const IMG_STYLE = new Set(['padding', 'background', 'background-color', 'background-image', 'object-fit', 'object-position']);
const SVG_DATA = new Set(['polyline', 'polygon', 'circle', 'rect', 'line', 'path', 'ellipse', 'text']);

function normTag(tag, styles) {
  let t = tag.replace(ID_ATTRS, '');
  if (styles) t = t.replace(/\sstyle="([^"]*)"/, (m, s) => {
    const keep = s.split(';').map((d) => d.trim()).filter((d) => d && !styles.has(d.slice(0, d.indexOf(':')).trim().toLowerCase()));
    return keep.length ? ` style="${keep.join('; ')}"` : '';
  });
  return t;
}

/**
 * Cut a layout into its frame and its content pieces.
 * → { skel, holes: [[a, b, kind, slot]] } — skel is the frame used to compare layouts; holes are the content ranges in
 * document order (kind: 'g' text between tags · 't' a slot's inner HTML · 'tag' a tag whose attributes carry content).
 */
export function layoutHoles(html) {
  const { nodes } = parseLayout(html);
  const tbAt = new Map(), imgAt = new Map();
  const slotOf = (n) => { for (let p = n; p && p.attrs != null; p = p.parent) if (p.img != null) return 'i' + p.img; return null; };
  for (const n of nodes) {
    if (n.tb != null) tbAt.set(n.start, n);
    else if (n.img != null || n.name === 'img') imgAt.set(n.start, slotOf(n));
  }
  const holes = [];
  let skel = '', prev = 0, skipUntil = -1, m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    const s = m.index, e = TAG.lastIndex;
    if (s < skipUntil) continue; // inside a slot — its inner HTML is one piece
    holes.push([prev, s, 'g', null]); skel += '\u0001';
    const name = m[2].toLowerCase();
    const tb = !m[1] && tbAt.get(s);
    if (tb) {
      holes.push([s, e, 'tag', 't' + tb.tb]); skel += normTag(m[0], TB_STYLE);
      holes.push([e, tb.closeStart, 't', tb.tb]); skel += '\u0002';
      skipUntil = tb.closeStart; prev = tb.closeStart;
      TAG.lastIndex = tb.closeStart;
      continue;
    }
    if (!m[1] && imgAt.has(s)) { holes.push([s, e, 'tag', imgAt.get(s)]); skel += normTag(m[0], IMG_STYLE); }
    else if (!m[1] && SVG_DATA.has(name)) { holes.push([s, e, 'tag', null]); skel += m[0].replace(/="[-\d.,\s]+"/g, '="#"'); }
    else skel += m[0];
    prev = e;
  }
  holes.push([prev, html.length, 'g', null]); skel += '\u0001';
  return { skel, holes };
}

/** the content pieces of a layout, in order */
export const holeValues = (html, cut = layoutHoles(html)) => cut.holes.map(([a, b]) => html.slice(a, b));

/** draw a candidate: the representative layout's frame with the candidate's pieces (sparse: { index: value }) */
export function fillHoles(html, pieces, cut = layoutHoles(html)) {
  if (!pieces) return html;
  let out = '', at = 0;
  cut.holes.forEach(([a, b], k) => {
    if (pieces[k] == null) return;
    out += html.slice(at, a) + pieces[k]; at = b;
  });
  return out + html.slice(at);
}

/** pieces of `html` that differ from the representative's (both cut with layoutHoles, same frame) */
export function diffPieces(baseHtml, html) {
  const A = layoutHoles(baseHtml), B = layoutHoles(html);
  if (A.skel !== B.skel) return null;
  const a = holeValues(baseHtml, A), b = holeValues(html, B), out = {};
  b.forEach((v, k) => { if (v !== a[k]) out[k] = v; });
  return out;
}

/** a layout's slot contents — { t: { slot: text }, img: { slot: picture } } (the candidate pool shows these) */
export function slotContents(html) {
  const { nodes } = parseLayout(html);
  const t = {}, img = {};
  const src = (n) => { const m = / (?:data-fill|src)="([^"]*)"/.exec(n.tag); return m ? m[1] : ''; };
  for (const n of nodes) {
    if (n.tb != null && t[n.tb] == null) t[n.tb] = textOf(html, n);
    if (n.img != null && img[n.img] == null) {
      const im = n.name === 'img' ? n : nodes.find((c) => c.name === 'img' && c.start > n.start && c.end <= n.end);
      img[n.img] = im ? src(im) : '';
    }
  }
  return { t, img };
}
