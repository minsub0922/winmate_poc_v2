# Eval · eval1018-c4

- LLM: gemini gemini-3.1-flash-lite · 호출 168 (실패 0) · 122.7s
- **overall 0.977** · minimal 0.950 · ambiguous 0.990 · complex 0.992

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| layouts_any | 0.750 | 1.0 |
| flow | 0.839 | 0.5 |
| layout_part | 0.943 | 1.0 |
| fill_clean | 0.976 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| must_parts | 1.000 | 1.5 |
| violations | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| stray | 1.000 | 1.0 |
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
| C07_L1 | minimal | 0.950 | flow=0.89, layout_part=0.90, layouts_any=0.50 | 시나리오 STD-RT; 기대 장표 없음 ['products'] |
| C07_L2 | ambiguous | 0.995 | flow=0.82 | 시나리오 bs10 |
| C07_L3 | complex | 0.998 | flow=0.92 | 전략 rfp |
| C08_L1 | minimal | 0.950 | flow=0.89, layout_part=0.90, layouts_any=0.50 | 시나리오 STD-RS; 기대 장표 없음 ['products'] |
| C08_L2 | ambiguous | 0.985 | flow=0.80, layout_part=0.92, fill_clean=0.92 | 시나리오 bs04 |
| C08_L3 | complex | 0.987 | flow=0.71, layout_part=0.93, fill_clean=0.93 | 전략 value |
