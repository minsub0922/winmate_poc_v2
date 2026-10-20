# Eval · v14-legacy-cases

- LLM: offline  · 호출 0 (실패 0) · 6.9s
- **overall 0.992** · minimal 0.993 · ambiguous 0.991 · complex 0.992

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.820 | 0.5 |
| fill_clean | 0.983 | 1.0 |
| key_trace | 0.988 | 1.5 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| must_parts | 1.000 | 1.5 |
| layout_part | 1.000 | 1.0 |
| layouts_any | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_reflect | 1.000 | 1.5 |
| facts | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |
| must_cov | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| conflicts | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C01_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-FB |
| C01_L2 | ambiguous | 0.992 | flow=0.77 | 시나리오 bs01 |
| C01_L3 | complex | 0.974 | flow=0.85, key_trace=0.75 | 전략 roi; 요구 미반영 [['렌탈']] |
| C02_L1 | minimal | 0.994 | flow=0.88 | 시나리오 STD-OF |
| C02_L2 | ambiguous | 0.991 | flow=0.73 | 시나리오 bs02 |
| C02_L3 | complex | 0.994 | flow=0.75 | 전략 space |
| C03_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-HT |
| C03_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs07 |
| C03_L3 | complex | 0.996 | flow=0.85 | 전략 space |
| C04_L1 | minimal | 0.994 | flow=0.88 | 시나리오 STD-FN |
| C04_L2 | ambiguous | 0.987 | flow=0.60 | 시나리오 bs17 |
| C04_L3 | complex | 1.000 |  | 전략 rfp |
| C05_L1 | minimal | 0.994 | flow=0.88 | 시나리오 STD-ED |
| C05_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs03 |
| C05_L3 | complex | 0.997 | flow=0.88 | 전략 rfp |
| C06_L1 | minimal | 0.994 | flow=0.88 | 시나리오 STD-MF |
| C06_L2 | ambiguous | 0.987 | flow=0.61 | 시나리오 bs14 |
| C06_L3 | complex | 0.993 | flow=0.71 | 전략 land |
| C07_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-RT |
| C07_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs10 |
| C07_L3 | complex | 0.995 | flow=0.92, fill_clean=0.93 | 전략 rfp |
| C08_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-RS |
| C08_L2 | ambiguous | 0.988 | flow=0.80, fill_clean=0.92 | 시나리오 bs04 |
| C08_L3 | complex | 0.992 | flow=0.69 | 전략 value |
| C09_L1 | minimal | 0.974 | flow=0.88, fill_clean=0.78 | 시나리오 STD-SV |
| C09_L2 | ambiguous | 0.996 | flow=0.89 | 시나리오 bs13 |
| C09_L3 | complex | 0.988 | flow=0.83, fill_clean=0.86 | 전략 roi |
| C10_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-MD |
| C10_L2 | ambiguous | 0.990 | flow=0.70 | 시나리오 bs08 |
| C10_L3 | complex | 0.993 | flow=0.75 | 전략 land |
