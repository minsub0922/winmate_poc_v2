// 솔루션 · 유관사례 실제 이미지 — 각 항목의 연관 리소스(samsung.com 도입사례 원문 · 리포트 PDF · 영상,
// 솔루션 공식 페이지 · 업종 페이지 · 해외 삼성 비즈니스 페이지, 삼성 e-카탈로그)에서 모은 사진 · 화면 · 구성도.
// 원문이 사진과 글을 한 이미지에 섞어 둔 곳은 사진 부분만 잘라 씀. 출처 대장: src/media_sources.md · 다시 만들기: build/media/README.md
// data/media.json(번들에 들어가므로 짧게) = { P: [묶음 주소 …], L: { 묶음 번호: [첫 data URL 시작 위치, 각 data URL 길이 …] }, case: { id: item }, sol: { id: item } },
//   item = { th: 카드 썸네일 코드, g: [[이미지 코드, 종류 한 글자, 설명, w, h, 원본("^번호|나머지" = 사전 D 앞부분 + 나머지, e-카탈로그는 비움), 출처 쪽 번호, e-카탈로그 표시?]], pages: [출처 쪽 주소] }
//   이미지 코드 = 묶음 번호 × 10000 + 묶음 안 번호 → "img/media/g1.json#37"
// 이미지는 AVIF data URL 묶음(img/media/t.json 카드 썸네일 · g0~g2.json 갤러리)에 있고, 묶음 안 바이트 범위로 한 장씩 받는다(bgpack.js).
import MEDIA from '../../../data/media.json' with { type: 'json' };
import { registerRanges } from './packs.js';
import { C } from './catalog.js';

const addrOf = (code) => MEDIA.P[Math.floor(code / 10000)] + '#' + (code % 10000);
{
  const r = {};
  for (const [pi, l] of Object.entries(MEDIA.L)) { const out = []; let s = l[0]; for (let k = 1; k < l.length; k++) { out.push([s, s + l[k]]); s += l[k] + 3; } r[MEDIA.P[pi]] = out; }
  registerRanges(r);
}

export const MEDIA_KIND = { scene: '현장 사진', people: '사용 장면', exterior: '외관', product: '제품', screen: '솔루션 화면', diagram: '구성도', kv: '대표 이미지' };
const KC = { s: 'scene', p: 'people', e: 'exterior', c: 'product', u: 'screen', d: 'diagram', k: 'kv' };
/** 원본 이미지 주소: "^<36진수>|나머지" = 앞부분 사전 D + 나머지, e-카탈로그는 쪽 주소에서 쪽 이미지 주소로 */
function origOf(o, page) {
  if (!o) {
    const e = /aiibook\.net.*[?&]start=(\d+).*[?&]Dir=(\d+)/.exec(page || '');
    return e ? `https://samsung.aiibook.net/b2b/catImage/${e[2]}/${String(e[1]).padStart(3, '0')}.jpg` : '';
  }
  if (o[0] === '^') { const j = o.indexOf('|'); return (MEDIA.D[parseInt(o.slice(1, j), 36)] || '') + o.slice(j + 1); }
  return o;
}
const bucket = (type) => (type === 'solution' ? MEDIA.sol : type === 'case' ? MEDIA.case : null);
const HOST = 'https://images.samsung.com/';
const orig = (o) => (!o ? '' : o.startsWith('~/') ? HOST + o.slice(2) : o);
/** where a picture came from, in words */
function sourceNote(type, page, ecat) {
  if (ecat) return '삼성 e-카탈로그 · ' + ecat;
  if (/insights\/case-study|\.pdf(\?|$)/.test(page)) return '삼성 고객 도입사례 원문';
  if (/samsung\.com\/sec\/business\/[a-z-]+\/?$/.test(page) && type === 'solution') return '삼성 비즈니스 업종 페이지';
  if (/samsung\.com\/(us|uk|in)\//.test(page)) return '해외 삼성 비즈니스 페이지';
  if (/vxt\.samsung\.com|samsungknox\.com/.test(page)) return '솔루션 공식 사이트';
  return type === 'solution' ? '솔루션 공식 페이지' : '삼성 고객 도입사례 원문';
}

/** the media record of a solution / case, or null */
export function mediaOf(type, id) {
  const b = bucket(type);
  const m = (b && b[String(id)]) || null;
  if (m && m.id == null) m.id = id;
  return m;
}
/** packed address of the representative thumbnail (cards · tiles), or null */
export function mediaThumb(type, id) {
  const m = mediaOf(type, id);
  return m ? addrOf(m.th) : null;
}
/** number of matched images */
export function mediaCount(type, id) {
  const m = mediaOf(type, id);
  return m ? m.g.length : 0;
}
function one(type, m, e, name) {
  const [code, kc, desc, w, h, o0, pi, ecat] = e;
  const src = addrOf(code), kind = KC[kc] || kc;
  const sol = type === 'solution';
  const page = (m.pages || (type === 'case' && C[m.id] && C[m.id].url ? [C[m.id].url] : []))[pi || 0] || '';
  const o = origOf(o0, page);
  return {
    pid: src, src, desc: desc || name, mk: kind, kind: MEDIA_KIND[kind] || '사진', w, h, fmt: 'AVIF',
    group: sol ? (kind === 'screen' || kind === 'diagram' ? 'ui' : 'life') : 'case',
    groupName: sol ? '솔루션 이미지' : '도입사례 사진', model: name,
    cut: kind === 'product', white: kind === 'product', orig: orig(o) || page, page, note: sourceNote(type, page, ecat),
  };
}
/** every matched image, gallery order (representative first, then the source's own order) — src is a packed address (PImg / slides take it as is) */
export function mediaPhotos(type, id, name = '') {
  const m = mediaOf(type, id);
  if (!m) return [];
  return m.g.map((e) => one(type, m, e, name));
}
/** the representative image only, from the small thumbnail pack (cheap to show next to other items) */
export function mediaCover(type, id, name = '', note = '') {
  const m = mediaOf(type, id);
  if (!m || !m.g[0]) return null;
  return { ...one(type, m, m.g[0], name), pid: addrOf(m.th), src: addrOf(m.th), w: 0, h: 0, ...(note ? { note } : {}) };
}
export const MEDIA_INFO = { generated: MEDIA.generated, counts: MEDIA.counts };
