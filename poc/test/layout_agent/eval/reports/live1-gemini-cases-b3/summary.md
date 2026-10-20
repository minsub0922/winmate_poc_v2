# Eval · live-gemini-cases-b3

- LLM: gemini gemini-3.1-flash-lite · 호출 184 (실패 0) · 137.7s
- **overall 0.972** · minimal 0.982 · ambiguous 0.987 · complex 0.947

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.806 | 0.5 |
| scenario | 0.833 | 2.0 |
| layout_part | 0.944 | 1.0 |
| stray | 0.969 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
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
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C05_L1 | minimal | 0.987 | flow=0.88, layout_part=0.89 | 시나리오 STD-ED |
| C05_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs03 |
| C05_L3 | complex | 0.899 | scenario=0.00, flow=0.87, layout_part=0.95 | 전략 roi |
| C06_L1 | minimal | 0.977 | flow=0.88, layout_part=0.89, stray=0.88 | 시나리오 STD-MF |
| C06_L2 | ambiguous | 0.980 | flow=0.61, layout_part=0.94, stray=0.94 | 시나리오 bs14 |
| C06_L3 | complex | 0.995 | flow=0.79 | 전략 value |
