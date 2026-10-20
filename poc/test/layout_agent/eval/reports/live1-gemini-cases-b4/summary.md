# Eval · live-gemini-cases-b4

- LLM: gemini gemini-3.1-flash-lite · 호출 176 (실패 0) · 131.2s
- **overall 0.946** · minimal 0.984 · ambiguous 0.945 · complex 0.910

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| key_reflect | 0.750 | 1.5 |
| scenario | 0.833 | 2.0 |
| flow | 0.853 | 0.5 |
| layouts_any | 0.875 | 1.0 |
| must_parts | 0.917 | 1.5 |
| key_trace | 0.938 | 1.5 |
| layout_part | 0.954 | 1.0 |
| fill_clean | 0.976 | 1.0 |
| stray | 0.982 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
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
| C07_L1 | minimal | 0.988 | flow=0.89, layout_part=0.90 | 시나리오 STD-RT |
| C07_L2 | ambiguous | 0.906 | flow=0.82, key_reflect=0.00 | 시나리오 bs10; 요구 미반영 [['타사']] |
| C07_L3 | complex | 0.847 | scenario=0.00, must_parts=0.50, flow=0.93, layouts_any=0.50 | 전략 roi; 빠진 파트 ['why']; 기대 장표 없음 ['why'] |
| C08_L1 | minimal | 0.980 | flow=0.89, layout_part=0.90, stray=0.89 | 시나리오 STD-RS |
| C08_L2 | ambiguous | 0.984 | flow=0.80, layout_part=0.92, fill_clean=0.92 | 시나리오 bs04 |
| C08_L3 | complex | 0.973 | flow=0.79, key_trace=0.75, fill_clean=0.93 | 전략 value; 요구 미반영 [['월패드']] |
