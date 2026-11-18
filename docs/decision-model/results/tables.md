| 작업 | 지표 | LLM | Decision | Decision만(사전 점수 제외) | 규칙 기준선 | TC별 Decision 우세 / 같음 / LLM 우세 | 두 분기 일치 |
|---|---|---|---|---|---|---|---|
| search.rerank | MRR | 0.46 | 0.58 | 0.49 | 0.62 | 6 / 2 / 2 | 50% |
| catalog.rank | MRR | – (0/10 성공) | 0.95 | 0.95 | 0.87 | 0 / 0 / 0 | – |
| catalog.rank:compact | MRR | 0.90 | 0.95 | 0.95 | 0.87 | 1 / 9 / 0 | 90% |
| review.route | 목표 기준 재현율 | 31% (8/10 성공) | 25% | – | 25% | 0 / 8 / 0 | 59% |
| layout.pick | 정답 레이아웃 일치율 | 62% | 68% | – | 77% | 2 / 6 / 2 | 55% |
| layout.best_pick | top-1 정답률 | 80% | 80% | 70% | 90% | 1 / 8 / 1 | 80% |

| 작업 | LLM 평균 · 중앙값 · 최대 (ms) | Decision 평균 · 중앙값 · 최대 (ms) | 속도 배수(평균) | LLM 호출 · 재시도 포함 시도 · 입력/출력 토큰 | Decision 요청 · 입력 토큰 | Decision 비용(10 TC) |
|---|---|---|---|---|---|---|
| search.rerank | 15966 · 18150 · 21483 | 226 · 211 · 360 | 70.5× | 10 · 10 · 23,859/5,364 | 10 · 64,331 | $0.0027 |
| catalog.rank | – · – · – | 373 · 340 · 583 | –× | 0 · 0 · 0/0 | 10 · 565,446 | $0.0237 |
| catalog.rank:compact | 14645 · 14481 · 16593 | 234 · 229 · 294 | 62.7× | 10 · 10 · 43,463/4,843 | 10 · 90,563 | $0.0038 |
| review.route | 48038 · 45192 · 59159 | 431 · 432 · 450 | 111.4× | 18 · 18 · 80,312/13,851 | 20 · 137,409 | $0.0058 |
| layout.pick | 18981 · 18262 · 22242 | 228 · 219 · 292 | 83.2× | 10 · 10 · 53,859/6,316 | 10 · 84,368 | $0.0035 |
| layout.best_pick | 6823 · 6630 · 8791 | 218 · 214 · 246 | 31.3× | 10 · 10 · 7,103/2,044 | 10 · 19,156 | $0.0008 |

| 작업 | 분기 | 성공 TC | 세부 지표 평균 |
|---|---|---|---|
| search.rerank | baseline | 10/10 | gold_rank 3.40, hit1 0.50, hit3 0.60, mrr 0.62 |
| search.rerank | llm | 10/10 | gold_rank 3.90, hit1 0.30, hit3 0.50, mrr 0.46 |
| search.rerank | decision | 10/10 | gold_rank 2.80, hit1 0.40, hit3 0.70, mrr 0.58 |
| search.rerank | decision_raw | 10/10 | gold_rank 4.10, hit1 0.30, hit3 0.70, mrr 0.49 |
| catalog.rank | baseline | 10/10 | gold_rank 1.50, hit1 0.80, hit3 0.90, mrr 0.87 |
| catalog.rank | llm | 0/10 |  |
| catalog.rank | decision | 10/10 | gold_rank 1.10, hit1 0.90, hit3 1.00, mrr 0.95 |
| catalog.rank | decision_raw | 10/10 | gold_rank 1.10, hit1 0.90, hit3 1.00, mrr 0.95 |
| catalog.rank:compact | baseline | 10/10 | gold_rank 1.50, hit1 0.80, hit3 0.90, mrr 0.87 |
| catalog.rank:compact | llm | 10/10 | gold_rank 1.20, hit1 0.80, hit3 1.00, mrr 0.90 |
| catalog.rank:compact | decision | 10/10 | gold_rank 1.10, hit1 0.90, hit3 1.00, mrr 0.95 |
| catalog.rank:compact | decision_raw | 10/10 | gold_rank 1.10, hit1 0.90, hit3 1.00, mrr 0.95 |
| review.route | baseline | 10/10 | n_selected 8.00, target_recall 0.25 |
| review.route | llm | 8/10 | n_selected 11.12, target_recall 0.31 |
| review.route | decision | 10/10 | n_selected 12.00, target_recall 0.25 |
| layout.pick | baseline | 10/10 | acc 0.77, evaluable 2.00, hits 1.50 |
| layout.pick | llm | 10/10 | acc 0.62, evaluable 2.00, hits 1.30 |
| layout.pick | decision | 10/10 | acc 0.68, evaluable 2.00, hits 1.30 |
| layout.best_pick | baseline | 10/10 | top1 0.90, top3 1.00 |
| layout.best_pick | llm | 10/10 | top1 0.80, top3 1.00 |
| layout.best_pick | decision | 10/10 | top1 0.80, top3 0.90 |
| layout.best_pick | decision_raw | 10/10 | top1 0.70, top3 0.90 |
