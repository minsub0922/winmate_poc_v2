# L_VS_DSS_ED · Device · Solution · Service 도식 · 교육

- 종류: dss · 흐름: collect → lock → final
- 이 레이아웃은 모델 단계가 없거나 실행되지 않았습니다.

## 최종 점검 · ReAct (2026-11-18)

- 흐름의 마지막 단계 `final`(모든 흐름에 고정) — 관찰(코드) → 판단(Decision `layout.final`, 없으면 LLM `auto_final_check` + 도구 item · image · template) → 고침 → 다시 관찰, 최대 3회.
- 검증: AI가 쓰는 칸이 없음 — 이 장의 최종 점검은 코드 관찰(같은 사진 · 카드 사진)만 한다.
