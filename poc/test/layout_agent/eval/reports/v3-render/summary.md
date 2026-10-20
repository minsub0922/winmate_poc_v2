# Eval · v3-render

- LLM: offline  · 호출 0 (실패 0) · 2.4s
- **overall 0.989** · minimal 0.995 · ambiguous 0.994 · complex 0.983

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.841 | 0.5 |
| key_reflect | 0.917 | 1.5 |
| fill_clean | 0.968 | 1.0 |
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
| must_cov | 1.000 | 1.0 |
| facts | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| conflicts | 1.000 | 0.5 |
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C01_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-FB |
| C03_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs07 |
| C04_L3 | complex | 0.975 | flow=0.82, key_reflect=0.75, fill_clean=0.94 | 전략 rfp; 요구 미반영 [['KC']] |
| C09_L3 | complex | 0.992 | flow=0.83, fill_clean=0.93 | 전략 roi |
