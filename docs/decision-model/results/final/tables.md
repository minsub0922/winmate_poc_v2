| 작업 | 지표 | qwen3.6-35b-a3b (생각 끔) | qwen3.6-35b-a3b (생각 켬) | gemma-4-31b-it | jev-1.14.0 | clef-flash | jev-1.14.0만(사전 점수 제외) | clef-flash만(사전 점수 제외) | 규칙 기준선 |
|---|---|---|---|---|---|---|---|---|---|
| search.rerank | MRR | 0.55 | 0.80 (4/10 성공) | 0.46 | 0.64 | 0.29 | 0.45 | 0.23 | 0.60 |
| catalog.rank | MRR | 0.80 (9/10 성공) | – | 실패 (0/10 성공) | 0.93 | 0.70 | 0.93 | 0.48 | 0.74 |
| catalog.rank:compact | MRR | 0.78 | – | 0.76 (8/10 성공) | 0.93 | 0.90 | 0.88 | 0.77 | 0.74 |
| review.route | 목표 기준 재현율 | 25% | – | 31% (8/10 성공) | 25% | 25% | – | – | 25% |
| layout.pick | 정답 레이아웃 일치율 | 63% | – | 58% | 62% | 43% | – | – | 77% |
| layout.best_pick | top-1 정답률 | 80% | – | 80% | 90% | 90% | 80% | 90% | 80% |

| 작업 | jev-1.14.0 대 qwen3.6-35b-a3b (생각 끔): 우세 / 같음 / 열세 (둘 다 성공 TC) · 1위 일치 | clef-flash 대 qwen3.6-35b-a3b (생각 끔): 우세 / 같음 / 열세 (둘 다 성공 TC) · 1위 일치 | jev-1.14.0 대 clef-flash: 우세 / 같음 / 열세 (둘 다 성공 TC) · 1위 일치 | qwen3.6-35b-a3b (생각 켬) 대 qwen3.6-35b-a3b (생각 끔): 우세 / 같음 / 열세 (둘 다 성공 TC) · 1위 일치 | gemma-4-31b-it 대 qwen3.6-35b-a3b (생각 끔): 우세 / 같음 / 열세 (둘 다 성공 TC) · 1위 일치 |
|---|---|---|---|---|---|
| search.rerank | 5 / 4 / 1 (n=10) · 50% | 2 / 1 / 7 (n=10) · 10% | 9 / 0 / 1 (n=10) · 10% | 0 / 4 / 0 (n=4) · 75% | 2 / 5 / 3 (n=10) · 50% |
| catalog.rank | 2 / 7 / 0 (n=9) · 78% | 2 / 5 / 2 (n=9) · 56% | 5 / 4 / 1 (n=10) · 50% | – | – |
| catalog.rank:compact | 3 / 7 / 0 (n=10) · 60% | 3 / 7 / 0 (n=10) · 70% | 1 / 8 / 1 (n=10) · 90% | – | 2 / 5 / 1 (n=8) · 62% |
| review.route | 0 / 10 / 0 (n=10) · 58% | 0 / 10 / 0 (n=10) · 61% | 0 / 10 / 0 (n=10) · 67% | – | 0 / 8 / 0 (n=8) · 57% |
| layout.pick | 3 / 3 / 4 (n=10) · 51% | 1 / 4 / 5 (n=10) · 54% | 4 / 5 / 1 (n=10) · 77% | – | 1 / 7 / 2 (n=10) · 70% |
| layout.best_pick | 1 / 9 / 0 (n=10) · 90% | 1 / 9 / 0 (n=10) · 90% | 0 / 10 / 0 (n=10) · 100% | – | 1 / 8 / 1 (n=10) · 70% |

| 작업 | qwen3.6-35b-a3b (생각 끔) 평균 · 중앙값 · 최대 (ms) | qwen3.6-35b-a3b (생각 켬) 평균 · 중앙값 · 최대 (ms) | gemma-4-31b-it 평균 · 중앙값 · 최대 (ms) | jev-1.14.0 평균 · 중앙값 · 최대 (ms) | clef-flash 평균 · 중앙값 · 최대 (ms) |
|---|---|---|---|---|---|
| search.rerank | 4546 · 2900 · 13092 | 36445 · 44164 · 53978 | 21844 · 17307 · 47493 | 230 · 216 · 285 | 6305 · 5991 · 9375 |
| catalog.rank | 8696 · 8713 · 11413 | – | – | 418 · 386 · 552 | 63163 · 59238 · 99194 |
| catalog.rank:compact | 6429 · 6388 · 9800 | – | 16040 · 15835 · 19926 | 550 · 440 · 1077 | 13066 · 11374 · 20220 |
| review.route | 15380 · 14268 · 24265 | – | 48798 · 44992 · 64355 | 684 · 458 · 2442 | 14439 · 14296 · 15608 |
| layout.pick | 7820 · 5920 · 19532 | – | 18030 · 17614 · 22287 | 324 · 214 · 1249 | 7417 · 7175 · 10083 |
| layout.best_pick | 2651 · 2768 · 4145 | – | 6870 · 7271 · 7871 | 252 · 248 · 289 | 1953 · 1911 · 2292 |

| 작업 | qwen3.6-35b-a3b (생각 끔) 호출 · 입력/출력 토큰 · 비용 | qwen3.6-35b-a3b (생각 켬) 호출 · 입력/출력 토큰 · 비용 | gemma-4-31b-it 호출 · 입력/출력 토큰 · 비용 | jev-1.14.0 호출 · 입력/출력 토큰 · 비용 | clef-flash 호출 · 입력/출력 토큰 · 비용 |
|---|---|---|---|---|---|
| search.rerank | 10 · 24,217/4,588 · $0.0066 | 4 · 9,829/2,710 · $0.0034 | 12 · 28,003/7,251 · – | 10 · 63,721/2,940 · $0.0027 | 10 · 55,750/0 · $0.0000 |
| catalog.rank | 11 · 480,550/5,908 · $0.0534 | – | 0 · 0/0 · – | 10 · 686,216/7,480 · $0.0288 | 10 · 508,784/0 · $0.0000 |
| catalog.rank:compact | 10 · 46,342/5,483 · $0.0096 | – | 8 · 39,124/4,078 · – | 10 · 94,984/2,940 · $0.0040 | 10 · 77,175/0 · $0.0000 |
| review.route | 20 · 88,178/14,907 · $0.0222 | – | 18 · 80,312/13,851 · – | 20 · 137,409/5,200 · $0.0058 | 20 · 119,925/0 · $0.0000 |
| layout.pick | 10 · 52,616/6,831 · $0.0114 | – | 10 · 53,290/6,039 · – | 10 · 83,649/6,750 · $0.0035 | 10 · 58,410/0 · $0.0000 |
| layout.best_pick | 10 · 8,276/2,127 · $0.0027 | – | 10 · 7,451/2,042 · – | 10 · 19,526/740 · $0.0008 | 10 · 15,802/0 · $0.0000 |

| 작업 | 분기 | 성공 TC | 세부 지표 평균 | 실패 사유 |
|---|---|---|---|---|
| search.rerank | 규칙 기준선 | 10/10 | gold_rank 3.50, hit1 0.50, hit3 0.60, mrr 0.60 |  |
| search.rerank | qwen3.6-35b-a3b (생각 끔) | 10/10 | gold_rank 4.20, hit1 0.40, hit3 0.60, mrr 0.55 |  |
| search.rerank | qwen3.6-35b-a3b (생각 켬) | 4/10 | gold_rank 2.00, hit1 0.75, hit3 0.75, mrr 0.80 | ModelFailure: max_tokens: 모델 출력이 한도를 넘었습니다. 입력을 줄이거나 다시 시도하세요. |
| search.rerank | gemma-4-31b-it | 10/10 | gold_rank 4.50, hit1 0.30, hit3 0.50, mrr 0.46 |  |
| search.rerank | jev-1.14.0 | 10/10 | gold_rank 2.60, hit1 0.50, hit3 0.70, mrr 0.64 |  |
| search.rerank | jev-1.14.0만(사전 점수 제외) | 10/10 | gold_rank 3.70, hit1 0.20, hit3 0.50, mrr 0.45 |  |
| search.rerank | clef-flash | 10/10 | gold_rank 5.90, hit1 0.10, hit3 0.20, mrr 0.29 |  |
| search.rerank | clef-flash만(사전 점수 제외) | 10/10 | gold_rank 6.10, hit1 0.00, hit3 0.20, mrr 0.23 |  |
| catalog.rank | 규칙 기준선 | 10/10 | gold_rank 2.10, hit1 0.60, hit3 0.80, mrr 0.74 |  |
| catalog.rank | qwen3.6-35b-a3b (생각 끔) | 9/10 | gold_rank 1.56, hit1 0.67, hit3 1.00, mrr 0.80 | ModelFailure: invalid_output: 모델 응답이 요구한 형식 · 후보 목록에 맞지 않았습니다. 다시 시도하세요. |
| catalog.rank | gemma-4-31b-it | 0/10 |  | ModelFailure: rate_limited: AI 요청 한도에 걸려 재시도 후에도 실패했습니다. 잠시 뒤 다시 시도하세요. |
| catalog.rank | jev-1.14.0 | 10/10 | gold_rank 1.20, hit1 0.90, hit3 1.00, mrr 0.93 |  |
| catalog.rank | jev-1.14.0만(사전 점수 제외) | 10/10 | gold_rank 1.20, hit1 0.90, hit3 1.00, mrr 0.93 |  |
| catalog.rank | clef-flash | 10/10 | gold_rank 1.60, hit1 0.40, hit3 1.00, mrr 0.70 |  |
| catalog.rank | clef-flash만(사전 점수 제외) | 10/10 | gold_rank 2.50, hit1 0.10, hit3 0.80, mrr 0.48 |  |
| catalog.rank:compact | 규칙 기준선 | 10/10 | gold_rank 2.10, hit1 0.60, hit3 0.80, mrr 0.74 |  |
| catalog.rank:compact | qwen3.6-35b-a3b (생각 끔) | 10/10 | gold_rank 1.50, hit1 0.60, hit3 1.00, mrr 0.78 |  |
| catalog.rank:compact | gemma-4-31b-it | 8/10 | gold_rank 1.75, hit1 0.62, hit3 0.88, mrr 0.76 | ModelFailure: bad_request: AI 서비스가 요청 형식을 거부했습니다. 입력 크기 · 이미지 형식을 확인하세요.; ModelFailure: rate_limited: AI 요청 한도에 걸려 재시도 후에도 실패했습니다. 잠시 뒤 다시 시도하세요. |
| catalog.rank:compact | jev-1.14.0 | 10/10 | gold_rank 1.20, hit1 0.90, hit3 1.00, mrr 0.93 |  |
| catalog.rank:compact | jev-1.14.0만(사전 점수 제외) | 10/10 | gold_rank 1.30, hit1 0.80, hit3 1.00, mrr 0.88 |  |
| catalog.rank:compact | clef-flash | 10/10 | gold_rank 1.20, hit1 0.80, hit3 1.00, mrr 0.90 |  |
| catalog.rank:compact | clef-flash만(사전 점수 제외) | 10/10 | gold_rank 1.70, hit1 0.60, hit3 0.90, mrr 0.77 |  |
| review.route | 규칙 기준선 | 10/10 | n_selected 8.00, target_recall 0.25 |  |
| review.route | qwen3.6-35b-a3b (생각 끔) | 10/10 | n_selected 10.00, target_recall 0.25 |  |
| review.route | gemma-4-31b-it | 8/10 | n_selected 11.12, target_recall 0.31 | ModelFailure: timeout: AI 요청 대기 또는 응답 시간이 한도를 넘었습니다. 잠시 뒤 다시 시도하세요. |
| review.route | jev-1.14.0 | 10/10 | n_selected 12.00, target_recall 0.25 |  |
| review.route | clef-flash | 10/10 | n_selected 11.50, target_recall 0.25 |  |
| layout.pick | 규칙 기준선 | 10/10 | acc 0.77, evaluable 2.00, hits 1.50 |  |
| layout.pick | qwen3.6-35b-a3b (생각 끔) | 10/10 | acc 0.63, evaluable 2.00, hits 1.30 |  |
| layout.pick | gemma-4-31b-it | 10/10 | acc 0.58, evaluable 2.00, hits 1.20 |  |
| layout.pick | jev-1.14.0 | 10/10 | acc 0.62, evaluable 2.00, hits 1.10 |  |
| layout.pick | clef-flash | 10/10 | acc 0.43, evaluable 2.00, hits 0.80 |  |
| layout.best_pick | 규칙 기준선 | 10/10 | top1 0.80, top3 1.00 |  |
| layout.best_pick | qwen3.6-35b-a3b (생각 끔) | 10/10 | top1 0.80, top3 1.00 |  |
| layout.best_pick | gemma-4-31b-it | 10/10 | top1 0.80, top3 1.00 |  |
| layout.best_pick | jev-1.14.0 | 10/10 | top1 0.90, top3 0.90 |  |
| layout.best_pick | jev-1.14.0만(사전 점수 제외) | 10/10 | top1 0.80, top3 0.90 |  |
| layout.best_pick | clef-flash | 10/10 | top1 0.90, top3 1.00 |  |
| layout.best_pick | clef-flash만(사전 점수 제외) | 10/10 | top1 0.90, top3 1.00 |  |
