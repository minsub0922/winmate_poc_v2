# L_SUB_PKG3 · 업종 구독 패키지 상세 · 사진 + 품목 3

- 종류: static · 흐름: collect → bind → lock → final
- 이 레이아웃은 모델 단계가 없거나 실행되지 않았습니다.

## 최종 점검 · ReAct (2026-11-18)

- 흐름의 마지막 단계 `final`(모든 흐름에 고정) — 관찰(코드) → 판단(Decision `layout.final`, 없으면 LLM `auto_final_check` + 도구 item · image · template) → 고침 → 다시 관찰, 최대 3회.
- 이 레이아웃의 원래 내용(맞는 장)에서 찾은 것: 코드 0건 · Decision 0건 · Decision 1회 432ms · 점검이 바꾼 칸 0개 · LLM 호출 0회
