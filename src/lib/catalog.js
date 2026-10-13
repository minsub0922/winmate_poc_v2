// 레이아웃 카탈로그 — 레이아웃 메타데이터 · 업종 · 제품 · 솔루션.
// 원본: src/data/catalog.json (scripts/import-layouts.mjs 로 원본 Winmate 앱에서 가져온다)
//
// 레이아웃 한 장의 메타데이터 (catalog.layouts[i])
//   f      레이아웃 id (= src/data/layouts/<f>.html)        c     원본 장표(구분 2): MI · VP · SS · SP · EX · CM
//   code   원본 장표 안의 코드                                 name  레이아웃 이름
//   when   언제 쓰나                                         g     묶음 ("<묶음 이름> — <설명>")
//   p, p2  파트 유형(구분 1, lib/parts.js PARTS 키) · 보조 유형
//   ind    업종 맞춤이면 업종 코드 (없으면 범용)               sol / sols  전용 솔루션 · 들어간 솔루션
//   req    채우는 데 필요한 정보(lib/parts.js REQ_LABEL 키)
//   nT, nI 텍스트 칸 · 이미지 칸 수                            prods 예시 제품 id
//   hl, sub, eb, foot, sample  예시 제목 · 부제 · 아이브로 · 푸터 · 예시 고객       txt  레이아웃 안 전체 텍스트(검색용)
import CATALOG from '../data/catalog.json';

export const LAYOUTS = CATALOG.layouts;
export const L = Object.fromEntries(LAYOUTS.map((l) => [l.f, l]));
export const INDUSTRIES = CATALOG.industries;
export const IND = Object.fromEntries(INDUSTRIES.map((i) => [i.code, i]));
export const PRODUCTS = CATALOG.products;
export const SOLUTIONS = CATALOG.solutions;
export const P = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const S = Object.fromEntries(SOLUTIONS.map((s) => [s.id, s]));

/** 레이아웃을 처음 만든 원본 장표(claude.ai 아티팩트) */
export const CANVAS = {
  MI: { name: 'PPT · 01 MI (업종별)', url: 'https://claude.ai/artifact/XnbECsMCvmCsHTsJtfeQUV' },
  VP: { name: 'PPT · 02 Value Props', url: 'https://claude.ai/artifact/V6bPV1WJhKFyJeHEYjmnhv' },
  SS: { name: 'PPT · 03 공간별 가치 제공 시나리오', url: 'https://claude.ai/artifact/7DyZ4i11yq9sjnBP2ztEtr' },
  SP: { name: 'PPT · 04 공간별 제품 소개', url: 'https://claude.ai/artifact/9mD73MY9hcPFPAavohfA7B' },
  CM: { name: 'PPT · 공통 · 솔루션 전용 · 이미지 중심', url: 'https://claude.ai/artifact/GFCVoigDttt2414bvFWDvv' },
  EX: { name: 'PPT · 05 보강 레이아웃', url: 'https://claude.ai/artifact/MbhEa2JB7ELDFLbRceHHQ4' },
};

/** 구분 2 — 레이아웃이 나온 원본 장표 */
export const DECKS = [
  { k: 'MI', label: '01 MI', full: '시장 · 고객 · 사용자 분석 (업종별)' },
  { k: 'VP', label: '02 Value Props', full: '가치 제안 (업종별)' },
  { k: 'SS', label: '03 공간 시나리오', full: '공간별 가치 제공 시나리오' },
  { k: 'SP', label: '04 공간별 제품', full: '공간별 제품 소개' },
  { k: 'EX', label: '05 보강', full: '시나리오 커버리지 · 보강 레이아웃' },
  { k: 'CM', label: '공통 · 솔루션', full: '표지 · 실행 · 솔루션 전용 · 이미지 중심' },
];
export const DECK = Object.fromEntries(DECKS.map((d) => [d.k, d]));
