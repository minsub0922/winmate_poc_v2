# Storyboard 에이전트 평가 · smoke3

- 백엔드 `gemini` · 모델 `gemini-3.1-flash-lite` · LLM 조건 반복 1회 · 과제 4개 · 12초
- LLM 호출 7회(캐시 0) · 실패 0 · 입력 37,666 / 출력 10,794 토큰

## 처음부터(정답 14)

| 조건 | type_f1 | order_lcs | group_cov | len_diff | fact_recall | strategy_acc | req_cov | req_cov_w | req_lex | sel_cov | stray | unsup_num | copy_rate | foreign | valid | n_parts | n |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **에이전트 · LLM** | 0.583 | 0.500 | 1.000 | 0.500 | 0.586 | 1.000 | 0.882 | 0.887 | 0.608 | 0.583 | 0 | 0 | 0.039 | 0 | 1.000 | 6.500 | 2 |

## 이어서(정답 14 · 뒤쪽 파트와 비교)

| 조건 | type_f1 | order_lcs | group_cov | len_diff | fact_recall | strategy_acc | req_cov | req_cov_w | req_lex | sel_cov | stray | unsup_num | copy_rate | foreign | valid | keep_ok | n_parts | n |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **에이전트 · LLM** | 0.250 | 0.250 | 0.667 | 0 | 0.444 | 0.000 | 1.000 | 1.000 | 0.750 | 0.400 | 0 | 0 | 0.059 | 0 | 1.000 | 1.000 | 8 | 1 |

## 정답 없음 · 처음부터(요구 단계 8)

| 조건 | req_cov | req_cov_w | req_lex | sel_cov | stray | unsup_num | copy_rate | foreign | valid | n_parts | n |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **에이전트 · LLM** | 0.364 | 0.364 | 0.030 | 1.000 | 0 | 0 | 0.029 | 0 | 1.000 | 7 | 1 |
