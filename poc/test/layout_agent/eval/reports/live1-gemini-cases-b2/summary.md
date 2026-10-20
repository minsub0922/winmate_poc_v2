# Eval · live-gemini-cases-b2

- LLM: gemini gemini-3.1-flash-lite · 호출 170 (실패 0) · 126.1s
- **overall 0.969** · minimal 0.978 · ambiguous 0.942 · complex 0.987

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| key_trace | 0.812 | 1.5 |
| flow | 0.826 | 0.5 |
| key_reflect | 0.875 | 1.5 |
| stray | 0.914 | 1.0 |
| layout_part | 0.987 | 1.0 |
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
| facts | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| conflicts | 1.000 | 0.5 |
| questions | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C03_L1 | minimal | 0.962 | flow=0.89, stray=0.56 | 시나리오 STD-HT |
| C03_L2 | ambiguous | 0.943 | flow=0.82, layout_part=0.92, key_reflect=0.50 | 시나리오 bs07; 요구 미반영 [['불만']] |
| C03_L3 | complex | 0.979 | flow=0.85, key_trace=0.75 | 전략 pain; 요구 미반영 [['체크인']] |
| C04_L1 | minimal | 0.995 | flow=0.88 | 시나리오 STD-FN |
| C04_L2 | ambiguous | 0.941 | flow=0.60, key_trace=0.50 | 시나리오 bs17; 요구 미반영 [['창구']] |
| C04_L3 | complex | 0.995 | flow=0.93, stray=0.93 | 전략 rfp |
