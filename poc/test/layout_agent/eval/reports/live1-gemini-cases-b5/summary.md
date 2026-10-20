# Eval · live-gemini-cases-b5

- LLM: gemini gemini-3.1-flash-lite · 호출 168 (실패 0) · 124.9s
- **overall 0.971** · minimal 0.975 · ambiguous 0.984 · complex 0.956

## 지표 평균

| 지표 | 평균 | 가중치 |
|---|---|---|
| flow | 0.849 | 0.5 |
| stray | 0.857 | 1.0 |
| key_trace | 0.938 | 1.5 |
| key_reflect | 0.938 | 1.5 |
| must_parts | 0.944 | 1.5 |
| fill_clean | 0.958 | 1.0 |
| layout_part | 0.971 | 1.0 |
| level | 1.000 | 2.0 |
| industry | 1.000 | 1.0 |
| scenario | 1.000 | 2.0 |
| layouts_any | 1.000 | 1.0 |
| violations | 1.000 | 1.0 |
| must_cov | 1.000 | 1.0 |
| scenario_top3 | 1.000 | 1.0 |
| key_detect | 1.000 | 1.0 |
| facts | 1.000 | 1.0 |
| priority | 1.000 | 1.0 |
| dims | 1.000 | 1.0 |
| questions | 1.000 | 0.5 |

## TC

| TC | 맥락 | 점수 | 1 미만 지표 | 비고 |
|---|---|---|---|---|
| C09_L1 | minimal | 0.987 | flow=0.88, fill_clean=0.89 | 시나리오 STD-SV |
| C09_L2 | ambiguous | 0.997 | flow=0.89 | 시나리오 bs13 |
| C09_L3 | complex | 0.982 | flow=0.83, fill_clean=0.86, stray=0.85 | 전략 roi |
| C10_L1 | minimal | 0.962 | flow=0.89, layout_part=0.90, stray=0.67 | 시나리오 STD-MD |
| C10_L2 | ambiguous | 0.971 | flow=0.70, layout_part=0.92, stray=0.77 | 시나리오 bs08 |
| C10_L3 | complex | 0.930 | must_parts=0.67, flow=0.91, key_trace=0.75, key_reflect=0.75, stray=0.86 | 전략 roi; 빠진 파트 ['effect']; 요구 미반영 [['이사회'], ['내부망']] |
