# Eval · live-gemini-holdout2

- LLM: gemini gemini-3.1-flash-lite · 호출 160 (실패 0) · 135.2s
- **overall 0.968** · minimal 0.990 · ambiguous 0.991 · complex 0.924

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| key_trace | 0.792 | 1.5 |
| industry | 0.833 | 1.0 |
| flow | 0.852 | 0.5 |
| must_parts | 0.917 | 1.5 |
| layout_part | 0.955 | 1.0 |
| level | 1.000 | 2.0 |
| scenario | 1.000 | 2.0 |
| violations | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| fill_clean | 1.000 | 1.0 |
| stray | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
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
| K01 | minimal | 0.986 | flow=0.88, layout_part=0.89 | 시나리오 STD-ID |
| K02 | minimal | 0.995 | flow=0.88 | 시나리오 STD-VN |
| K03 | ambiguous | 0.993 | flow=0.91, layout_part=0.93 | 시나리오 bs05 |
| K04 | ambiguous | 0.989 | flow=0.64 | 시나리오 bs09 |
| K05 | complex | 0.874 | industry=0.00, must_parts=0.50, flow=0.90, layout_part=0.91, key_trace=0.50 | 전략 rfp; 빠진 파트 ['cost']; 요구 미반영 [['최소 보장']] |
| K06 | complex | 0.974 | flow=0.92, key_trace=0.67 | 전략 roi; 요구 미반영 [['30%']] |
