# Eval · eval1018-h2

- LLM: gemini gemini-3.1-flash-lite · 호출 164 (실패 0) · 129.3s
- **overall 0.985** · minimal 0.995 · ambiguous 0.991 · complex 0.970

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.829 | 0.5 |
| industry | 0.833 | 1.0 |
| layout_part | 0.975 | 1.0 |
| level | 1.000 | 2.0 |
| scenario | 1.000 | 2.0 |
| must_parts | 1.000 | 1.5 |
| violations | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| fill_clean | 1.000 | 1.0 |
| stray | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_trace | 1.000 | 1.5 |
| key_reflect | 1.000 | 1.5 |
| layouts_any | 1.000 | 1.0 |
| facts | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |
| conflicts | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| K01 | minimal | 0.995 | flow=0.88 | 시나리오 STD-ID |
| K02 | minimal | 0.995 | flow=0.88 | 시나리오 STD-VN |
| K03 | ambiguous | 0.993 | flow=0.91, layout_part=0.93 | 시나리오 bs05 |
| K04 | ambiguous | 0.989 | flow=0.64 | 시나리오 bs09 |
| K05 | complex | 0.946 | industry=0.00, flow=0.91, layout_part=0.92 | 전략 rfp |
| K06 | complex | 0.995 | flow=0.77 | 전략 value |
