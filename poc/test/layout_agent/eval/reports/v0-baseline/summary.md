# Eval · v0-baseline

- LLM: offline  · 호출 0 (실패 0) · 6.1s
- **overall 0.788** · minimal 0.913 · ambiguous 0.630 · complex 0.820

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| fill_clean | 0.033 | 1.0 |
| key_trace | 0.550 | 1.5 |
| conflicts | 0.667 | 0.5 |
| scenario | 0.767 | 2.0 |
| violations | 0.767 | 1.0 |
| dims | 0.767 | 1.0 |
| key_detect | 0.812 | 1.0 |
| key_reflect | 0.812 | 1.5 |
| facts | 0.825 | 1.0 |
| flow | 0.826 | 0.5 |
| level | 0.833 | 2.0 |
| must_parts | 0.878 | 1.5 |
| layouts_any | 0.975 | 1.0 |
| industry | 1.000 | 1.0 |
| layout_part | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |
| must_cov | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| eval | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C01_L1 | minimal | 0.995 | flow=0.89 | 시나리오 STD-FB |
| C01_L2 | ambiguous | 0.876 | flow=0.77, key_trace=0.50, fill_clean=0.00 | 시나리오 bs01; 요구 미반영 [['경험']] |
| C01_L3 | complex | 0.707 | scenario=0.00, must_parts=0.67, flow=0.75, key_trace=0.25, key_reflect=0.75, fill_clean=0.00 | 전략 compete; 빠진 파트 ['value']; 요구 미반영 [['당일', '반영'], ['가격', '불일치'], ['전력', '절감'], ['렌탈']] |
| C02_L1 | minimal | 0.903 | flow=0.88, fill_clean=0.00 | 시나리오 STD-OF |
| C02_L2 | ambiguous | 0.858 | flow=0.73, violations=0.00, fill_clean=0.00 | 시나리오 bs02 |
| C02_L3 | complex | 0.807 | flow=0.82, key_trace=0.25, key_reflect=0.75, facts=0.50, fill_clean=0.00, dims=0.33 | 전략 space; 수치 미사용 ['22']; 요구 미반영 [['20%'], ['BMS'], ['회의실']] |
| C03_L1 | minimal | 0.904 | flow=0.89, fill_clean=0.00 | 시나리오 STD-HT |
| C03_L2 | ambiguous | 0.389 | level=0.00, scenario=0.00, must_parts=0.50, flow=0.89, key_detect=0.50, key_trace=0.00, key_reflect=0.50, fill_clean=0.00 | 시나리오 STD-HT; 빠진 파트 ['challenge']; 요구 미반영 [['불만'], ['교체']] |
| C03_L3 | complex | 0.824 | flow=0.85, violations=0.00, key_trace=0.50, fill_clean=0.00, dims=0.67 | 전략 pain; 요구 미반영 [['영업', '유지'], ['소음']] |
| C04_L1 | minimal | 0.903 | flow=0.88, fill_clean=0.00 | 시나리오 STD-FN |
| C04_L2 | ambiguous | 0.819 | must_parts=0.00, flow=0.56, fill_clean=0.00 | 시나리오 bs17; 빠진 파트 ['value'] |
| C04_L3 | complex | 0.855 | flow=0.80, violations=0.00, key_trace=0.75, fill_clean=0.00, conflicts=0.00 | 전략 rfp; 요구 미반영 [['어댑터']] |
| C05_L1 | minimal | 0.903 | flow=0.88, fill_clean=0.00 | 시나리오 STD-ED |
| C05_L2 | ambiguous | 0.585 | level=0.00, scenario=0.00, must_parts=0.50, flow=0.88, fill_clean=0.00 | 시나리오 STD-ED; 빠진 파트 ['scenario'] |
| C05_L3 | complex | 0.750 | scenario=0.00, flow=0.85, key_trace=0.50, fill_clean=0.00, dims=0.33 | 전략 roi; 요구 미반영 [['LMS'], ['12월']] |
| C06_L1 | minimal | 0.903 | flow=0.88, fill_clean=0.00 | 시나리오 STD-MF |
| C06_L2 | ambiguous | 0.853 | flow=0.58, violations=0.00, fill_clean=0.00 | 시나리오 bs14 |
| C06_L3 | complex | 0.922 | flow=0.70, key_trace=0.75, fill_clean=0.00 | 전략 land; 요구 미반영 [['WMS']] |
| C07_L1 | minimal | 0.904 | flow=0.89, fill_clean=0.00 | 시나리오 STD-RT |
| C07_L2 | ambiguous | 0.353 | level=0.00, scenario=0.00, flow=0.89, key_detect=0.00, key_trace=0.00, key_reflect=0.00, fill_clean=0.00 | 시나리오 STD-RT; 요구 미반영 [['타사']] |
| C07_L3 | complex | 0.797 | flow=0.83, layouts_any=0.50, violations=0.00, key_trace=0.75, key_reflect=0.75, facts=0.50, fill_clean=0.00, dims=0.67 | 전략 rfp; 기대 장표 없음 ['why']; 수치 미사용 ['450']; 요구 미반영 [['TCO'], ['야간']] |
| C08_L1 | minimal | 0.904 | flow=0.89, fill_clean=0.00 | 시나리오 STD-RS |
| C08_L2 | ambiguous | 0.460 | level=0.00, scenario=0.00, flow=0.89, key_detect=0.00, key_trace=0.00, fill_clean=0.00 | 시나리오 STD-RS; 요구 미반영 [['차별화']] |
| C08_L3 | complex | 0.844 | must_parts=0.67, flow=0.83, key_trace=0.25, fill_clean=0.00, dims=0.67 | 전략 value; 빠진 파트 ['cost']; 요구 미반영 [['매립'], ['월패드'], ['단가']] |
| C09_L1 | minimal | 0.903 | flow=0.88, fill_clean=0.00 | 시나리오 STD-SV |
| C09_L2 | ambiguous | 0.863 | flow=0.88, violations=0.00, fill_clean=0.00 | 시나리오 bs13 |
| C09_L3 | complex | 0.844 | flow=0.90, violations=0.00, key_trace=0.75, key_reflect=0.75, facts=0.75, fill_clean=0.00 | 전략 roi; 수치 미사용 ['85']; 요구 미반영 [['입퇴실']] |
| C10_L1 | minimal | 0.904 | flow=0.89, fill_clean=0.00 | 시나리오 STD-MD |
| C10_L2 | ambiguous | 0.246 | level=0.00, scenario=0.00, must_parts=0.00, flow=0.89, key_detect=0.00, key_trace=0.00, key_reflect=0.00, fill_clean=0.00 | 시나리오 STD-MD; 빠진 파트 ['execution']; 요구 미반영 [['파일럿']] |
| C10_L3 | complex | 0.849 | flow=0.70, key_detect=0.75, key_trace=0.75, key_reflect=0.75, facts=0.50, fill_clean=0.00 | 전략 land; 수치 미사용 ['30']; 요구 미반영 [['30%']] |
