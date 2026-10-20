# Eval · live-gemini-cases-b1

- LLM: gemini gemini-3.1-flash-lite · 호출 178 (실패 0) · 152.0s
- **overall 0.984** · minimal 0.987 · ambiguous 0.990 · complex 0.974

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.812 | 0.5 |
| key_trace | 0.875 | 1.5 |
| layout_part | 0.965 | 1.0 |
| stray | 0.989 | 1.0 |
| fill_clean | 0.990 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| must_parts | 1.000 | 1.5 |
| layouts_any | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_reflect | 1.000 | 1.5 |
| facts | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |
| priority | 1.000 | 1.0 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C01_L1 | minimal | 0.988 | flow=0.89, layout_part=0.90 | 시나리오 STD-FB |
| C01_L2 | ambiguous | 0.989 | flow=0.77, fill_clean=0.94 | 시나리오 bs01 |
| C01_L3 | complex | 0.976 | flow=0.85, key_trace=0.75 | 전략 value; 요구 미반영 [['가격', '불일치']] |
| C02_L1 | minimal | 0.987 | flow=0.88, layout_part=0.89 | 시나리오 STD-OF |
| C02_L2 | ambiguous | 0.992 | flow=0.73 | 시나리오 bs02 |
| C02_L3 | complex | 0.973 | flow=0.77, key_trace=0.75, stray=0.93 | 전략 value; 요구 미반영 [['회의실']] |
