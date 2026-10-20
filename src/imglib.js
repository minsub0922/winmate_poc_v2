// 제품 이미지 라이브러리 — 제품마다 정확히 연결된 관련 이미지(samsung.com 상품 카드 · 상세페이지 특장점 · 고객 도입사례 · e-카탈로그 쪽에서 자른 사진).
// 색인 img/lib/index.json(proddb/build/pack_imglib.py)은 처음 쓸 때 한 번 받고, 사진은 묶음 주소("img/lib/p03.json#12", bgpack.js 와 같은 형식).
// 항목: i id · k 종류(cut 제품 컷 · scene 설치 장면 · detail 기능 디테일 · ui 화면 · diagram 구성 그림) · s 출처 · p 제품 id들 · t 제품명 · d 설명 · c 맥락(특장점 제목 · 카탈로그 쪽 · 사례)
//       sp 공간 · m 모델코드 · u 원본 주소 · pg 카탈로그 쪽 키 · cs 사례 고객 · a 묶음 주소 · w/h
import { useEffect, useState } from 'react';

let LIB = null;
let LOADING = null;
const BY = new Map(); // product id → images (종류 순)

export const LIB_KIND = { cut: '제품 컷', scene: '설치 장면', detail: '기능 디테일', ui: '화면', diagram: '구성 그림' };
const SRC = { site_card: 'samsung.com 상품 이미지', site_pdp: 'samsung.com 상세페이지', case: '고객 도입사례', ecat: 'e-카탈로그', app: 'Winmate 이미지 라이브러리' };
const KORD = { cut: 0, scene: 1, detail: 2, ui: 3, diagram: 4 };

/** 출처 한 줄 — "samsung.com 상세페이지 · 특장점 제목" · "고객 도입사례 · 고객명" · "e-카탈로그 「…」 N쪽" */
export function libSource(im) {
  if (im.s === 'ecat') return im.c || SRC.ecat;
  if (im.s === 'case') return SRC.case + (im.cs ? ' · ' + im.cs : '');
  if (im.s === 'site_pdp') return SRC.site_pdp + (im.c ? ' · ' + im.c : '');
  return SRC[im.s] || '';
}

export function loadLib() {
  if (LIB) return Promise.resolve(LIB);
  if (!LOADING) {
    LOADING = fetch('img/lib/index.json').then((r) => (r.ok ? r.json() : { images: [] })).then((j) => {
      LIB = j.images || [];
      for (const im of LIB) for (const p of im.p) { if (!BY.has(p)) BY.set(p, []); BY.get(p).push(im); }
      for (const list of BY.values()) list.sort((a, b) => (KORD[a.k] ?? 9) - (KORD[b.k] ?? 9));
      return LIB;
    }).catch((e) => { console.warn('이미지 라이브러리 색인을 못 받았어요', e); LOADING = null; return []; });
  }
  return LOADING;
}

/** images linked to a product (empty until the index is in) */
export function libFor(id) { return BY.get(id) || []; }

/** hook: the product's library images */
export function useLibFor(id) {
  const [list, setList] = useState(() => (LIB ? libFor(id) : []));
  useEffect(() => {
    let live = true;
    if (LIB) { setList(libFor(id)); return undefined; }
    loadLib().then(() => { if (live) setList(libFor(id)); });
    return () => { live = false; };
  }, [id]);
  return list;
}

/** hook: the whole index once loaded (null while loading) */
export function useLib() {
  const [v, setV] = useState(LIB);
  useEffect(() => { let live = true; if (!LIB) loadLib().then((l) => { if (live) setV(l); }); return () => { live = false; }; }, []);
  return v;
}

const norm = (s) => String(s || '').toLowerCase();
/** search: 검색어(제품명 · 모델 · 설명 · 공간 · 출처) + 연결 제품 · 모델 가중치. kinds = 고를 종류 목록(없으면 전체) */
export function searchLib(lib, q, { ids = [], models = [], kinds = null, limit = 60 } = {}) {
  if (!lib) return [];
  const words = norm(q).split(/\s+/).filter((w) => w.length > 0);
  const M = models.map((m) => String(m).toUpperCase());
  const out = [];
  for (const im of lib) {
    if (kinds && !kinds.includes(im.k)) continue;
    let s = 0;
    if (ids.length && im.p.some((p) => ids.includes(p))) s += 6;
    if (M.length && (im.m || []).some((m) => M.some((x) => m.toUpperCase().startsWith(x) || x.startsWith(m.toUpperCase())))) s += 3;
    if (words.length) {
      const hay = norm([im.t, im.d, im.c, (im.sp || []).join(' '), (im.m || []).join(' '), im.cs, LIB_KIND[im.k]].join(' '));
      const hit = words.filter((w) => hay.includes(w)).length;
      if (!hit) continue;
      s += hit * 2 + (hit === words.length ? 2 : 0);
    } else if (!s) continue;
    if (im.k === 'scene') s += 0.4;
    out.push({ im, s });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.im);
}
