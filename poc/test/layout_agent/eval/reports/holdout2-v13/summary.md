# Eval · holdout2-v13

- LLM: offline  · 호출 0 (실패 0) · 2.6s
- **overall 0.968** · minimal 0.994 · ambiguous 0.989 · complex 0.920

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| conflicts | 0.000 | 0.5 |
| key_trace | 0.750 | 1.5 |
| dims | 0.833 | 1.0 |
| flow | 0.840 | 0.5 |
| must_parts | 0.917 | 1.5 |
| fill_clean | 0.988 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| layout_part | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_reflect | 1.000 | 1.5 |
| layouts_any | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| facts | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| K01 | minimal | 0.994 | flow=0.88 | 시나리오 STD-ID |
| K02 | minimal | 0.994 | flow=0.88 | 시나리오 STD-VN |
| K03 | ambiguous | 0.997 | flow=0.91 | 시나리오 bs05 |
| K04 | ambiguous | 0.982 | flow=0.64, fill_clean=0.93 | 시나리오 bs09 |
| K05 | complex | 0.868 | must_parts=0.50, flow=0.90, key_trace=0.00, dims=0.67 | 전략 rfp; 빠진 파트 ['cost']; 요구 미반영 [['최소 보장'], ['휘도']] |
| K06 | complex | 0.971 | flow=0.85, conflicts=0.00 | 전략 value |
