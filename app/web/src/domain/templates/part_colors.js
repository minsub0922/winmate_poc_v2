// 파트 색 — 목차(파트)마다 하나. 한 구성 안의 버블끼리 최대한 다르고, 제안 흐름 앞에서 뒤로 갈수록 색이 차례로 흐른다
// (사용자 지시 2026-11-16: "각 버블의 색상이 … 최대한 달라야해 … admin 에도 … 앞쪽에 오는 애 부터 뒤로 갈수록의 그 색상 효과").
//   흐름: 차분한 회색 · 보라(여는 이야기) → 파랑 → 청록 → 초록(전개) → 금색 → 주황 → 빨강(전환 · 증명) → 삼성 남색(결론).
//   흰 아이콘이 보이는 짙기(명암비 3 이상) · 이웃한 파트끼리 CIEDE2000 15 이상. 기승전결 자리는 관리자 admin/web/src/part-arc.js 가 정한다(색은 여기서).
// 쓰는 곳: Storyboard 추천 구성 버블 · 구성 상세 흐름(services/layout-compose.js flowOf · pages/TocTemplatesPage.jsx) · 관리자 추천 구성 목록 · 구성 만들기 · 「전체 파트」 팝업.
// 관리자가 직접 만든 파트(cp_)는 제 색(look)을 쓰고, 여기 없는 옛 목차는 유형 색(partHue) 그대로다.
export const PART_COLORS = {
  overview: '#707780', // 제안 개요
  ua: '#7660b4', // 시장 분석 (MI)
  needs: '#1d86c8', // 가치 제안 (VP)
  space: '#0e9aa7', // 공간별 제안
  value: '#0d7a62', // 고객/공간 시나리오 — 짙은 청록(옆 공간별 제안 · 솔루션 제안과 헷갈리지 않게)
  sol: '#4a9c2c', // 솔루션 제안
  pspec: '#868f14', // 제품 스펙 — 늘 맨 끝(Storyboard 추천 구성에서는 보이지 않는다)
  subx: '#b88600', // 구독 상품 제안
  svc: '#dd6a12', // 서비스
  case: '#cd3d33', // 유관 사례
  pcase: '#b8336a', // (쓰는 구성 없음)
  why: '#1428a0', // Why Samsung
};
/** 목차 key → 색(없으면 null) */
export const partColor = (key) => PART_COLORS[key] || null;
/** 버블에 입힐 look — 직접 만든 파트는 제 look, 아니면 파트 색({ color }), 둘 다 없으면 undefined(유형 색) */
export const partLook = (key, look) => look || (PART_COLORS[key] ? { color: PART_COLORS[key] } : undefined);
