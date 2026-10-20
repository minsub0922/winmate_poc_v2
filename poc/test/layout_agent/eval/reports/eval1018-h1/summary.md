# Eval · eval1018-h1

- LLM: gemini gemini-3.1-flash-lite · 호출 168 (실패 0) · 121.5s
- **overall 0.991** · minimal 0.991 · ambiguous 0.988 · complex 0.995

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.836 | 0.5 |
| layout_part | 0.958 | 1.0 |
| stray | 0.988 | 1.0 |
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
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| H01 | minimal | 0.995 | flow=0.88 | 시나리오 STD-TP |
| H02 | minimal | 0.987 | flow=0.88, layout_part=0.89 | 시나리오 STD-PB |
| H03 | ambiguous | 0.990 | flow=0.82, layout_part=0.93 | 시나리오 bs12 |
| H04 | ambiguous | 0.986 | flow=0.70, layout_part=0.93 | 시나리오 bs20 |
| H05 | complex | 0.996 | flow=0.82 | 전략 value |
| H06 | complex | 0.995 | flow=0.93, stray=0.93 | 전략 rfp |
