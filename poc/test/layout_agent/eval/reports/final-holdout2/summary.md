# Eval · final-holdout2

- LLM: offline  · 호출 0 (실패 0) · 1.7s
- **overall 0.991** · minimal 0.994 · ambiguous 0.993 · complex 0.985

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| facts | 0.750 | 1.0 |
| flow | 0.842 | 0.5 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| must_parts | 1.000 | 1.5 |
| layout_part | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| fill_clean | 1.000 | 1.0 |
| stray | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_trace | 1.000 | 1.5 |
| key_reflect | 1.000 | 1.5 |
| layouts_any | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |
| conflicts | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| K01 | minimal | 0.994 | flow=0.88 | 시나리오 STD-ID |
| K02 | minimal | 0.994 | flow=0.88 | 시나리오 STD-VN |
| K03 | ambiguous | 0.997 | flow=0.91 | 시나리오 bs05 |
| K04 | ambiguous | 0.988 | flow=0.64 | 시나리오 bs09 |
| K05 | complex | 0.974 | flow=0.91, facts=0.50 | 전략 rfp; 수치 미사용 ['12'] |
| K06 | complex | 0.996 | flow=0.85 | 전략 value |
