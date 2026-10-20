# Eval · live-gemini-cases-b5

- LLM: gemini gemini-3.1-flash-lite · 호출 166 (실패 0) · 137.7s
- **overall 0.983** · minimal 0.987 · ambiguous 0.991 · complex 0.969

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.851 | 0.5 |
| layouts_any | 0.875 | 1.0 |
| must_parts | 0.944 | 1.5 |
| layout_part | 0.959 | 1.0 |
| fill_clean | 0.969 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
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
| questions | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C09_L1 | minimal | 0.987 | flow=0.88, fill_clean=0.89 | 시나리오 STD-SV |
| C09_L2 | ambiguous | 0.997 | flow=0.89 | 시나리오 bs13 |
| C09_L3 | complex | 0.945 | must_parts=0.67, flow=0.91, layouts_any=0.50, fill_clean=0.92 | 전략 roi; 빠진 파트 ['effect']; 기대 장표 없음 ['effect'] |
| C10_L1 | minimal | 0.988 | flow=0.89, layout_part=0.90 | 시나리오 STD-MD |
| C10_L2 | ambiguous | 0.986 | flow=0.70, layout_part=0.92 | 시나리오 bs08 |
| C10_L3 | complex | 0.993 | flow=0.85, layout_part=0.93 | 전략 roi |
