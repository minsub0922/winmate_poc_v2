# Storyboard 에이전트 평가 · smoke2

- 백엔드 `gemini` · 모델 `gemini-3.1-flash-lite` · LLM 조건 반복 1회 · 과제 4개 · 5초
- LLM 호출 8회(캐시 0) · 실패 0 · 입력 40,977 / 출력 2,817 토큰

## 처음부터(정답 14)

| 조건 | type_f1 | order_lcs | group_cov | len_diff | fact_recall | strategy_acc | req_cov | req_cov_w | req_lex | sel_cov | stray | unsup_num | copy_rate | foreign | valid | n_parts | n |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **에이전트 · LLM** | 0.388 | 0.354 | 1.000 | 1.500 | 0.375 | 1.000 | 0.844 | 0.876 | 0.844 | 0.000 | 0 | 0 | 0.189 | 0 | 1.000 | 8.500 | 2 |

## 이어서(정답 14 · 뒤쪽 파트와 비교)

| 조건 | type_f1 | order_lcs | group_cov | len_diff | fact_recall | strategy_acc | req_cov | req_cov_w | req_lex | sel_cov | stray | unsup_num | copy_rate | foreign | valid | keep_ok | n_parts | n |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **에이전트 · LLM** | 0.444 | 0.400 | 0.667 | 1 | 0.222 | 0.000 | 1.000 | 1.000 | 1.000 | 0.800 | 0 | 0 | 0.200 | 0 | 1.000 | 1.000 | 9 | 1 |

## 정답 없음 · 처음부터(요구 단계 8)

| 조건 | req_cov | req_cov_w | req_lex | sel_cov | stray | unsup_num | copy_rate | foreign | valid | n_parts | n |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **에이전트 · LLM** | 0.576 | 0.576 | 0.273 | 0.000 | 0 | 0 | 0.119 | 0 | 1.000 | 9 | 1 |
