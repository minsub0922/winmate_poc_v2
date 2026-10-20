# Eval · live-gemini-cases

- LLM: gemini gemini-3.1-flash-lite · 호출 860 (실패 0) · 714.6s
- **overall 0.988** · minimal 0.988 · ambiguous 0.990 · complex 0.985

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.825 | 0.5 |
| layout_part | 0.962 | 1.0 |
| layouts_any | 0.975 | 1.0 |
| key_trace | 0.975 | 1.5 |
| fill_clean | 0.987 | 1.0 |
| must_parts | 0.989 | 1.5 |
| stray | 0.990 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| violations | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_reflect | 1.000 | 1.5 |
| facts | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |
| priority | 1.000 | 1.0 |
| conflicts | 1.000 | 0.5 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C01_L1 | minimal | 0.988 | flow=0.89, layout_part=0.90 | 시나리오 STD-FB |
| C01_L2 | ambiguous | 0.989 | flow=0.77, fill_clean=0.94 | 시나리오 bs01 |
| C01_L3 | complex | 0.976 | flow=0.85, key_trace=0.75 | 전략 value; 요구 미반영 [['가격', '불일치']] |
| C02_L1 | minimal | 0.987 | flow=0.88, layout_part=0.89 | 시나리오 STD-OF |
| C02_L2 | ambiguous | 0.992 | flow=0.73 | 시나리오 bs02 |
| C02_L3 | complex | 0.973 | flow=0.77, key_trace=0.75, stray=0.93 | 전략 value; 요구 미반영 [['회의실']] |
| C03_L1 | minimal | 0.987 | flow=0.89, stray=0.89 | 시나리오 STD-HT |
| C03_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs07 |
| C03_L3 | complex | 0.997 | flow=0.86 | 전략 pain |
| C04_L1 | minimal | 0.995 | flow=0.88 | 시나리오 STD-FN |
| C04_L2 | ambiguous | 0.988 | flow=0.60 | 시나리오 bs17 |
| C04_L3 | complex | 0.995 | flow=0.93, stray=0.93 | 전략 rfp |
| C05_L1 | minimal | 0.987 | flow=0.88, layout_part=0.89 | 시나리오 STD-ED |
| C05_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs03 |
| C05_L3 | complex | 0.997 | flow=0.88 | 전략 rfp |
| C06_L1 | minimal | 0.987 | flow=0.88, layout_part=0.89 | 시나리오 STD-MF |
| C06_L2 | ambiguous | 0.980 | flow=0.61, layout_part=0.94, stray=0.94 | 시나리오 bs14 |
| C06_L3 | complex | 0.990 | flow=0.71, layout_part=0.93 | 전략 pain |
| C07_L1 | minimal | 0.988 | flow=0.89, layout_part=0.90 | 시나리오 STD-RT |
| C07_L2 | ambiguous | 0.995 | flow=0.82 | 시나리오 bs10 |
| C07_L3 | complex | 0.998 | flow=0.92 | 전략 rfp |
| C08_L1 | minimal | 0.988 | flow=0.89, layout_part=0.90 | 시나리오 STD-RS |
| C08_L2 | ambiguous | 0.985 | flow=0.80, layout_part=0.92, fill_clean=0.92 | 시나리오 bs04 |
| C08_L3 | complex | 0.987 | flow=0.71, layout_part=0.93, fill_clean=0.93 | 전략 value |
| C09_L1 | minimal | 0.987 | flow=0.88, fill_clean=0.89 | 시나리오 STD-SV |
| C09_L2 | ambiguous | 0.997 | flow=0.89 | 시나리오 bs13 |
| C09_L3 | complex | 0.945 | must_parts=0.67, flow=0.91, layouts_any=0.50, fill_clean=0.92 | 전략 roi; 빠진 파트 ['effect']; 기대 장표 없음 ['effect'] |
| C10_L1 | minimal | 0.988 | flow=0.89, layout_part=0.90 | 시나리오 STD-MD |
| C10_L2 | ambiguous | 0.986 | flow=0.70, layout_part=0.92 | 시나리오 bs08 |
| C10_L3 | complex | 0.993 | flow=0.85, layout_part=0.93 | 전략 roi |
