// 화면 설정(검색어 · 구분 · 필터)을 브라우저에 기억해 둔다. 저장이 막힌 환경(시크릿 창 등)에서도 화면은 그대로 동작한다.
const KEY = 'winmate.v2.ui'; // 원본 Winmate 앱과 같은 키 — 같은 출처에서 열면 필터 상태를 이어받는다.

export function loadUi() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
}
export function saveUi(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
}
