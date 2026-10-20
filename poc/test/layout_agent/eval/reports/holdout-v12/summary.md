# Eval · holdout-v12

- LLM: offline  · 호출 0 (실패 0) · 2.3s
- **overall 0.992** · minimal 0.989 · ambiguous 0.992 · complex 0.995

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.812 | 0.5 |
| fill_clean | 0.982 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| must_parts | 1.000 | 1.5 |
| layout_part | 1.000 | 1.0 |
| layouts_any | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_trace | 1.000 | 1.5 |
| key_reflect | 1.000 | 1.5 |
| must_cov | 1.000 | 1.0 |
| facts | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| H01 | minimal | 0.994 | flow=0.88 | 시나리오 STD-TP |
| H02 | minimal | 0.984 | flow=0.88, fill_clean=0.89 | 시나리오 STD-PB |
| H03 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs12 |
| H04 | ambiguous | 0.990 | flow=0.70 | 시나리오 bs20 |
| H05 | complex | 0.994 | flow=0.75 | 전략 land |
| H06 | complex | 0.996 | flow=0.86 | 전략 rfp |
