# Eval · holdout-v9

- LLM: offline  · 호출 0 (실패 0) · 2.6s
- **overall 0.874** · minimal 0.989 · ambiguous 0.727 · complex 0.906

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| scenario_top3 | 0.500 | 1.0 |
| scenario | 0.667 | 2.0 |
| key_trace | 0.667 | 1.5 |
| layouts_any | 0.750 | 1.0 |
| key_detect | 0.750 | 1.0 |
| key_reflect | 0.750 | 1.5 |
| industry | 0.833 | 1.0 |
| flow | 0.834 | 0.5 |
| fill_clean | 0.982 | 1.0 |
| level | 1.000 | 2.0 |
| must_parts | 1.000 | 1.5 |
| layout_part | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
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
| H03 | ambiguous | 0.464 | industry=0.00, scenario=0.00, scenario_top3=0.00, flow=0.91, key_detect=0.00, key_trace=0.00, key_reflect=0.00 | 시나리오 bs05; 요구 미반영 [['관람객']] |
| H04 | ambiguous | 0.990 | flow=0.70 | 시나리오 bs20 |
| H05 | complex | 0.841 | scenario=0.00, flow=0.79, layouts_any=0.00 | 전략 pain; 기대 장표 없음 ['execution'] |
| H06 | complex | 0.971 | flow=0.86, key_trace=0.67 | 전략 rfp; 요구 미반영 [['다국어']] |
