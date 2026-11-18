// 관리자 데이터 소스에서 끈 자원 (app/api/resource_switches.py → /api/bootstrap resource_switches, api/bootstrap.js 가 넣는다).
// 끈 자원은 새로 고르는 목록 · 검색 · 추천 · 사진 고르기에서 빠지고, 이미 만든 제안서가 id 로 찾을 때는 그대로 찾는다.
// 의존 없는 모듈 — 도메인 모듈(시나리오 · 레이아웃)도 노드 스크립트 · 테스트에서 그대로 읽힌다(부트스트랩 전에는 아무것도 끄지 않음).
const EMPTY = new Set();
let off = {};
const sets = new Map();
export function configureResourceSwitches(value) { off = (value && value.off) || {}; sets.clear(); }
export function offSet(kind) {
  if (!sets.has(kind)) sets.set(kind, off[kind]?.length ? new Set(off[kind]) : EMPTY);
  return sets.get(kind);
}
