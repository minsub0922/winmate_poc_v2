# Eval · v2

- LLM: offline  · 호출 0 (실패 0) · 8.0s
- **overall 0.980** · minimal 0.993 · ambiguous 0.989 · complex 0.958

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.829 | 0.5 |
| dims | 0.900 | 1.0 |
| layouts_any | 0.925 | 1.0 |
| key_trace | 0.925 | 1.5 |
| fill_clean | 0.942 | 1.0 |
| must_parts | 0.967 | 1.5 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| layout_part | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| key_reflect | 1.000 | 1.5 |
| facts | 1.000 | 1.0 |
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
| C01_L3 | complex | 0.996 | flow=0.86 | 전략 pain |
| C02_L1 | minimal | 0.994 | flow=0.88 | 시나리오 STD-OF |
| C02_L2 | ambiguous | 0.991 | flow=0.73 | 시나리오 bs02 |
| C02_L3 | complex | 0.960 | flow=0.86, key_trace=0.75, dims=0.67 | 전략 value; 요구 미반영 [['회의실']] |
| C03_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-HT |
| C03_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs07 |
| C03_L3 | complex | 0.943 | must_parts=0.67, flow=0.85, key_trace=0.75, fill_clean=0.93 | 전략 space; 빠진 파트 ['products']; 요구 미반영 [['소음']] |
| C04_L1 | minimal | 0.994 | flow=0.88 | 시나리오 STD-FN |
| C04_L2 | ambiguous | 0.987 | flow=0.60 | 시나리오 bs17 |
| C04_L3 | complex | 0.993 | flow=0.81, fill_clean=0.94 | 전략 rfp |
| C05_L1 | minimal | 0.994 | flow=0.88 | 시나리오 STD-ED |
| C05_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs03 |
| C05_L3 | complex | 0.994 | flow=0.87, fill_clean=0.94 | 전략 rfp |
| C06_L1 | minimal | 0.994 | flow=0.88 | 시나리오 STD-MF |
| C06_L2 | ambiguous | 0.987 | flow=0.61 | 시나리오 bs14 |
| C06_L3 | complex | 0.975 | flow=0.83, fill_clean=0.93, dims=0.67 | 전략 land |
| C07_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-RT |
| C07_L2 | ambiguous | 0.994 | flow=0.82 | 시나리오 bs10 |
| C07_L3 | complex | 0.993 | flow=0.86, fill_clean=0.93 | 전략 rfp |
| C08_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-RS |
| C08_L2 | ambiguous | 0.988 | flow=0.80, fill_clean=0.92 | 시나리오 bs04 |
| C08_L3 | complex | 0.912 | must_parts=0.67, flow=0.83, layouts_any=0.00, fill_clean=0.87 | 전략 value; 빠진 파트 ['products']; 기대 장표 없음 ['products'] |
| C09_L1 | minimal | 0.974 | flow=0.88, fill_clean=0.78 | 시나리오 STD-SV |
| C09_L2 | ambiguous | 0.970 | flow=0.89, fill_clean=0.60 | 시나리오 bs13 |
| C09_L3 | complex | 0.844 | must_parts=0.67, flow=0.91, layouts_any=0.50, key_trace=0.25, fill_clean=0.47, dims=0.67 | 전략 roi; 빠진 파트 ['effect']; 기대 장표 없음 ['effect']; 요구 미반영 [['18개월'], ['파일럿'], ['입퇴실']] |
| C10_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-MD |
| C10_L2 | ambiguous | 0.990 | flow=0.70 | 시나리오 bs08 |
| C10_L3 | complex | 0.970 | flow=0.83, key_trace=0.75, fill_clean=0.93 | 전략 land; 요구 미반영 [['30%']] |
