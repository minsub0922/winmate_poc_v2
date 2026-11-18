// 라이브러리에서 아예 삭제한 레이아웃 — 대체 장 없이 뺐다.
//   2026-11-16: 구축 · 운영 단계(시범 실행 계획) · 파일럿 → 확산(단계별 합의) · 마무리 · 다음 단계(다음 협의)
// 고르기 · 검색 · 추천 · 개수와 샘플 버티컬 시나리오에서 모두 빠진다. 장 HTML은 남겨 두어, 이미 저장된 제안서에 들어 있는 장만 그대로 그려진다.
// 이 장을 사진 버전으로 삼던 예전 글 레이아웃(retired.js: L_C13 · L_PL_A · L_SV_A)도 대체할 장이 없어져 함께 삭제된 것으로 본다.
// services/catalog.js가 l.removed = true · l.retired = 'removed'로 표시한다. 생성 스크립트(rebuild_vertical_best.py · rebuild_account_scenarios.py)도 이 장을 쓰지 않는다.
export const REMOVED_LAYOUTS = ['L_PH_IP_A', 'L_PH_PL_A', 'L_PH_C13'];
