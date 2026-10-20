# Eval · eval1018-c2

- LLM: gemini gemini-3.1-flash-lite · 호출 170 (실패 0) · 130.7s
- **overall 0.991** · minimal 0.987 · ambiguous 0.991 · complex 0.993

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.813 | 0.5 |
| stray | 0.970 | 1.0 |
| layout_part | 0.972 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| must_parts | 1.000 | 1.5 |
| layouts_any | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| fill_clean | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_trace | 1.000 | 1.5 |
| key_reflect | 1.000 | 1.5 |
| facts | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| conflicts | 1.000 | 0.5 |
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C03_L1 | minimal | 0.980 | flow=0.89, layout_part=0.90, stray=0.89 | 시나리오 STD-HT |
| C03_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs07 |
| C03_L3 | complex | 0.991 | flow=0.77, layout_part=0.93 | 전략 pain |
| C04_L1 | minimal | 0.995 | flow=0.88 | 시나리오 STD-FN |
| C04_L2 | ambiguous | 0.988 | flow=0.60 | 시나리오 bs17 |
| C04_L3 | complex | 0.995 | flow=0.93, stray=0.93 | 전략 rfp |
