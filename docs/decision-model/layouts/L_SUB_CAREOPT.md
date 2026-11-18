# L_SUB_CAREOPT · 관리 옵션 비교 · 무상수리 vs 방문케어

- 종류: static · 흐름: collect → bind → lock → final
- 이 레이아웃은 모델 단계가 없거나 실행되지 않았습니다.

## 최종 점검 · ReAct (2026-11-18)

- 흐름의 마지막 단계 `final`(모든 흐름에 고정) — 관찰(코드) → 판단(Decision `layout.final`, 없으면 LLM `auto_final_check` + 도구 item · image · template) → 고침 → 다시 관찰, 최대 3회.
- 이 레이아웃의 원래 내용(맞는 장)에서 찾은 것: 코드 0건 · Decision 0건 · Decision 1회 274ms · 점검이 바꾼 칸 0개 · LLM 호출 0회
