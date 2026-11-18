# Decision 모델 분기 작업 보고서

> 1차 보고서(병합 전 데이터, gemma vs Jev). 최종 비교(Qwen3.6 · gemma-4 · Jev · Clef, 같은 새 입력)는 [`FINAL-REPORT.md`](FINAL-REPORT.md).

- 작성일: 2026-11-13
- 대상: winmatev2 앱의 LLM 작업 중 판단형 작업
- 비교 모델
  - LLM: `gemma-4-31b-it` (Gemini API, 기본·quick 모델 동일)
  - Decision 모델: TypeSafe System One `jev-1.14.0`
- 결과 원본: `docs/decision-model/results/20261113-120254.json` (표 `tables.md`, TC별 `per-tc.md`, 실행 로그 `run.log`)

## 1. 요약

- LLM 작업 전체를 조사해 판단형 작업 5개를 골랐다. 각 작업 안에 LLM 분기와 Decision 분기를 두었다.
  - search.rerank · catalog.rank · review.route · layout.pick · layout.best_pick
  - 판단형 작업은 정해진 후보 안에서 고르거나, 순위를 매기거나, 0~3 단계 등급을 매기는 일이다.
- 분기 기준은 루트 `.env`의 `TYPESAFE_API_KEY`다. 키가 있으면 Decision 분기, 없거나 `WINMATE_DECISION=off`면 LLM 분기로 간다.
- 작업 단위 입력과 결과 형식은 두 분기가 같다.
  - 결과는 같은 검증 함수(`validate_order`, pydantic 스키마, `L1/L2_SCHEMA` 모양)를 통과한다.
  - 이후 처리(점수 반영 · 조립 · `_finalize`)도 그대로 쓴다.
- TC 10개씩 두 분기를 같은 입력으로 돌렸다.
  - Decision 분기는 모든 작업에서 31~111배 빨랐다. 요청당 0.2~0.6초, LLM은 4~59초였다.
  - 정답 기준 성능은 Decision 분기가 LLM 분기와 같거나 높았다.
    - search.rerank: MRR 0.58 대 0.46
    - catalog.rank(축소 입력): MRR 0.95 대 0.90
    - layout.pick: 68% 대 62%
    - layout.best_pick: 80% 대 80%
    - review.route: 두 분기가 모두 성공한 8개 TC에서 31% 대 31%, TC별 결과도 8개 모두 같음
- 현재 LLM(gemma-4-31b-it)은 입력 토큰 분당 한도가 16,000이다.
  - 카탈로그 AI 검색(catalog.rank)의 실제 입력은 45~60k 토큰이라 LLM 분기는 10개 중 0개 성공했다(429 한도 초과). 앱에서도 같은 이유로 실패하는 상태다.
  - Decision 분기는 요청을 나눠 10개 모두 처리했다(MRR 0.95).
  - review.route도 LLM 분기는 한도 대기로 2개가 시간 초과됐다.
- 분기는 기본값 `WINMATE_DECISION=auto`로 저장했다. 키가 있으면 5개 작업 모두 Decision 모델로 처리한다.

## 2. 설정 (`.env.example`)

```dotenv
# ================================================================ Decision 모델 (app — TypeSafe Jev, System One API)
TYPESAFE_API_KEY=
TYPESAFE_BASE_URL=https://api.typesafe.ai/v1        # /systemone 이 붙는다
TYPESAFE_MODEL=jev-1.14.0                           # 버전 고정(jev-latest 는 새 버전이 나오면 바뀜)
WINMATE_DECISION=auto                               # auto: 키 있으면 Decision | off: 항상 LLM
WINMATE_DECISION_TASKS=                             # 비우면 대상 작업 전부, 예: search.rerank,layout.pick
WINMATE_DECISION_TIMEOUT=30                         # 요청당 초(재시도 포함)
```

- 루트 `.env`에는 등록된 키에 `TYPESAFE_BASE_URL` · `TYPESAFE_MODEL` · `WINMATE_DECISION=auto`를 더했다.
- `GET /api/poc/capabilities`의 `settings.decision`에 작업별 분기가 보인다(`{"search.rerank": "decision", …}`). 키 값은 응답·로그에 넣지 않는다.

Jev 1.14 사양(docs.typesafe.ai 기준):
- 질문 유형: choice(후보 1~255개 → 선택 · 확률 · 확신도), score(1~10단계 → 확률 가중 단계 · 확신도), noul(예/아니오 확률), box
- 한도: 요청당 64k 토큰, 질문당 32k 토큰
- 가격: 입력 $0.042/1M 토큰, 출력 무료

## 3. 대상 작업 리스트업

### 3.1 Decision 모델로 대체한 작업 (분기 5개)

| 작업 | 위치 | 하는 일 | 입력 | 결과(두 분기 공통) | LLM 분기 | Decision 분기 |
|---|---|---|---|---|---|---|
| search.rerank | `app/api/poc/adapters/search.py` `_rerank` | 레이아웃 검색 결과 상위 20개 재정렬 | 검색 요청(검색어 · 파트 · 업종 · 전략 · 맥락 · 제품) + 후보 카드 20개 | `[(f, why)]` — 후보 id만, 중복 없음, 1개 이상(`validate_order`) | `order:[{f,why}]` JSON, 재질문 1회 | 후보마다 score(관련도 0~3) 1회 요청 → 기대 관련도 + 검색 점수 사전(0~1단계) 순, 관련도 1.5 미만은 목록 제외(최소 1개). why = "관련도 2.4/3 · 확신 45%" |
| catalog.rank | `app/api/poc/adapters/catalog_rank.py` (`POST /api/catalog/rank`, 새로 만듦) | 카탈로그 AI 검색(레이아웃 · Best Scenario) 상위 N | 요청 문장 · 필터 · 후보 ≤50(필드 목록) · N | `{order:[{id,reason}]}` — 정확히 N개, 서로 다른 후보 id, 사유 있음 | 프런트가 쓰던 프롬프트 · 스키마를 서버로 옮김, 재질문 1회 | 후보마다 score → 기대 관련도 + 검색 순서 사전, 상위 N. 64k를 넘으면 요청을 나눠 병렬 전송 |
| review.route | `poc/test/proposal_score/router.py` `_route_llm` | 제안서 평가 기준 라우팅(L1 묶음 관련도 → L2 묶음 관련도 · 기준 우선순위) | 덱 브리프 · 위험 신호 · 묶음/기준 설명 | L1 `{communities:[{id,relevance,reason}]}`, L2 `{communities, criteria:[{id,priority,reason}]}` → 같은 `_finalize` | L1 · L2 각 1회 | L1 · L2 각 1회, 묶음 · 기준마다 score(0~3, SYS_ROUTE 정의 문장). LLM 지시의 규칙을 코드로: [규칙 통과] 기준 ≤1, 우선순위 2~3 은 예산 이하(위험 신호 기준 우선) |
| layout.pick | `poc/test/layout_agent/winmate_layout/layout_design.py` `llm_pick_batch` · `llm_pick` | 덱의 슬라이드마다 레이아웃 1 + 대안 2 선택 | 슬라이드(파트 · 역할 · 내용 · 연결 요구) + 후보 카드 ≤5 | `LLMLayoutPicks` / `LLMLayoutPick` | 덱 전체 1회 | 슬라이드마다 choice(후보 f → 카드) 1회 요청. primary 는 확신 높은 슬라이드부터 덱 안 중복 없이 배정(앱이 LLM 에 붙이는 "primary 한 번만" 규칙), 대안 = 다음 확률 2개 |
| layout.best_pick | `poc/test/layout_agent/winmate_layout/scenarios.py` `match_best` | Best Practice 시나리오 상위 5 중 순서(상위 3 사용) | 고객 요구 요약 · 업종 · 원문 4,000자 + 후보 카드(fit/avoid · 규칙 점수) | `LLMScenarioPick(order, reasons)` | 1회 | 후보마다 score(적합도 0~3) → 기대 적합도 + 규칙 점수 사전 순 |

공통 구조:
- `app/api/llm/decision.py`
  - `TypeSafeDecision` 클라이언트: 재시도(429 · 5xx · retry-after), 답 형식 검증, 텔레메트리, 64k 초과 시 요청 분할
  - `get_decision(settings, task)`: 분기 선택
  - 답을 읽는 함수
- `app/api/poc/backends.py` `JobDecision`
  - 작업(job)에 묶인 클라이언트. 취소를 따른다.
  - 호출을 LLM 호출과 같은 `ModeTracker` 단계로 기록한다(`review:route_l1` 등). 그래서 기존 엄격 검사가 그대로 통과한다.
  - 실패는 LLM과 같은 `ModelFailure`로 바꾼다. 규칙 대체는 없다.
- PoC 모듈(`router.py` · `winmate_layout`)은 앱을 import 하지 않는다. `backend.decision` / `llm.decisions`에 붙은 객체의 `ask(stage, state, questions)`만 쓴다.
- 프런트 `catalog-search.js`
  - 순위 단계만 서버 작업 `/api/catalog/rank`로 옮겼다.
  - 의도 확장(검색어 생성)은 생성형 작업이라 LLM 그대로다.
  - 서버 결과를 기존과 같은 규칙으로 다시 검증한다.

"각 모델의 특성은 살리되 작업 결과는 같게" 한 방식:
- Decision 모델은 글을 쓰지 않고 확률로 답한다.
- 그래서 사유 칸(why · reason)은 관련도 · 확신도 · 확률로 채웠다. 예: "관련도 2.4/3 · 확신 45%", "Decision 모델 · 적합 확률 87%".
- 순위 작업은 Decision 모델의 절대 관련도(0~3단계)에 LLM도 참고용으로 보던 검색·규칙 점수를 0~1단계 크기로 더했다(`dm.blend`, `PRIOR_WEIGHT=1.0`).
  - 관련도가 1단계 이상 차이 나면 Decision 모델 판단이 순서를 정한다.
  - 거의 같으면 검색 순서를 따른다.
  - 사전 점수를 뺀 Decision만 순서는 비교용(ablation)으로 함께 측정했다(5.1 표).

### 3.2 대체하지 않은 작업과 이유

| 작업(stage) | 이유 |
|---|---|
| rfp:profile · extract · gapfill · consolidate | 요구사항 원문 추출 · 요약 · 병합(생성형) |
| requirements:summary | 요구사항 전략 요약문(생성형) |
| storyboard:design · repair, 프런트 storyboard · part | 파트 이름 · 내용 문장 생성 |
| layout:analyze (`LLMAnalysis`) | 업종 · 요구 타입 · 전략 · 맥락 수준은 판단형이다. 하지만 같은 결과에 놓친 요구 · 목표 · 요약 같은 생성 칸이 함께 있어, 작업 단위 출력을 Decision 모델만으로 같게 만들 수 없다(혼합형). 분류 칸만 나누는 혼합 분기는 후속 후보다. |
| layout:decompose | 충돌 · 빈 정보 · 질문 문장 생성(전략 순위만 판단형) |
| layout:fill, 프런트 fill | 장표 문구 재작성 |
| review:score_detail | 체크포인트 0~4단계는 판단형이다. 하지만 단계 1 이상에 근거 원문 ID와 사유 · 검증 · 개선 문장이 필수라 출력이 같을 수 없다. |
| review:visual · spatial:* · guide:chat · simulation(대화 · 코칭 · 스킬) · admin engine | 이미지 관찰 · 공간 계획 · 대화 · 웹 검색 · 문서 추출(생성형) |
| startup:connection | 연결 확인용 호출 |
| 프런트 `aiRerank`(services/ai.js) | 호출하는 곳이 없음(사용되지 않는 코드) |

## 4. 평가 방법

- 같은 입력: TC 입력(검색 후보 풀 · 규칙 분석 · 후보 카드)은 오프라인(결정론)으로 한 번 만들고, 두 분기에 그대로 넣었다.
- 실행 경로: LLM 분기는 앱 provider(`gemma-4-31b-it`, 큐 · 재질문 포함), Decision 분기는 실제 Jev API.
- 측정: 작업 함수 호출 앞뒤의 벽시계 시간(ms), 모델이 돌려준 토큰.
- 페이싱: LLM 쪽은 분당 입력 16k 토큰 한도에 걸리지 않도록 TC 사이에 쉬었다(쉰 시간은 지연에 넣지 않음).
- 정답: 저장소에 이미 있는 라벨만 썼다(새로 만든 라벨 없음).

| 작업 | TC 10개 | 정답(출처) | 주 지표 |
|---|---|---|---|
| search.rerank | layout eval 케이스 10개 × 파트 1개(C01·02·03·05·08 L1, C04·06·07·09·10 L3), 검색어 = "케이스 제목 + 파트 이름 + 장표" | `gold.layouts_any[파트]` (`poc/test/layout_agent/eval/cases`) | 최종 순서의 MRR(+ hit@1 · hit@3) |
| catalog.rank | L2 케이스 10개, 요청 = 고객 원문 앞 300자, 후보 = Best Scenario 85개 중 TF-IDF 상위 50(브라우저 검색 풀 대신), 프런트와 같은 필드 · 550자 제한, N=10 | `gold.scenario_any` | MRR |
| catalog.rank:compact (보조) | 위와 같은 요청 · 정답, 후보 상위 20 · 필드 7개 × 110자(LLM 분당 한도 안에 들어가는 크기) | 같음 | MRR |
| review.route | 제안서 bs10 · bs01 × 교란 5종(wrong_customer · placeholders · no_proof · number_conflict · strip_images), 앱 기본 예산 12 · 최소 10 | `PERTURB[kind].targets` — 교란이 망가뜨린 기준(`poc/test/proposal_score/pipeline.py`) | 목표 기준이 선택에 들어간 비율 |
| layout.pick | L1 케이스 10개, 오프라인 그래프 실행에서 잡은 슬라이드별 후보 | 파트 유형별 `gold.layouts_any`, 정답이 후보 상위 5 안에 있는 슬라이드만 채점(TC당 1~3장) | 정답 레이아웃 일치율 |
| layout.best_pick | L2 케이스 10개, 오프라인 분석으로 만든 상위 5 후보 | `gold.scenario_any` | top-1 정답률(+ top-3) |

## 5. 결과

### 5.1 성능 (TC 10개, 분기별)

| 작업 | 지표 | LLM | Decision | Decision만(사전 점수 제외) | 규칙 기준선(모델 없음) | TC별 Decision 우세 / 같음 / LLM 우세 | 두 분기 결과 일치 |
|---|---|---|---|---|---|---|---|
| search.rerank | MRR | 0.46 | **0.58** | 0.49 | 0.62 | 6 / 2 / 2 | 1위 일치 50% |
| catalog.rank | MRR | 실패 0/10 (429 분당 한도) | **0.95** (10/10) | 0.95 | 0.87 | – | – |
| catalog.rank:compact | MRR | 0.90 | **0.95** | 0.95 | 0.87 | 1 / 9 / 0 | 1위 일치 90% |
| review.route | 목표 기준 재현율 | 31% (8/10 성공, 2개 시간 초과) | 25% (10/10) · 같은 8개 TC 31% | – | 25% | 0 / 8 / 0 | 선택 기준 Jaccard 59% |
| layout.pick | 정답 레이아웃 일치율 | 62% | **68%** | – | 77% | 2 / 6 / 2 | primary 일치 55% |
| layout.best_pick | top-1 정답률 | 80% | 80% | 70% | 90% | 1 / 8 / 1 | 1위 일치 80% |

세부 지표 평균:

| 작업 | 분기 | 성공 TC | 지표 |
|---|---|---|---|
| search.rerank | LLM | 10/10 | 정답 평균 순위 3.9, hit@1 30%, hit@3 50%, MRR 0.46 |
| search.rerank | Decision | 10/10 | 정답 평균 순위 2.8, hit@1 40%, hit@3 70%, MRR 0.58 |
| search.rerank | 규칙 기준선 | 10/10 | 정답 평균 순위 3.4, hit@1 50%, hit@3 60%, MRR 0.62 |
| catalog.rank | Decision | 10/10 | 정답 평균 순위 1.1, hit@1 90%, hit@3 100% |
| catalog.rank:compact | LLM | 10/10 | 정답 평균 순위 1.2, hit@1 80%, hit@3 100% |
| catalog.rank:compact | Decision | 10/10 | 정답 평균 순위 1.1, hit@1 90%, hit@3 100% |
| review.route | LLM | 8/10 | 선택 기준 수 평균 11.1, 재현율 31% |
| review.route | Decision | 10/10 | 선택 기준 수 12.0, 재현율 25%(LLM 성공 8개 기준 31%), L1 관련도 LLM과 평균 차 0.38단계 · 정확히 같음 62% |
| layout.pick | LLM / Decision / 규칙 | 10/10 | 채점 슬라이드 20장 중 정답 13 / 13 / 15 (TC 평균 62% / 68% / 77%) |
| layout.best_pick | LLM / Decision / 규칙 | 10/10 | top-3 정답 100% / 90% / 100% |

### 5.2 속도 · 비용

| 작업 | LLM 평균 · 중앙값 · 최대 (ms) | Decision 평균 · 중앙값 · 최대 (ms) | 속도 배수(평균) | LLM 호출 · 입력/출력 토큰(10 TC) | Decision 요청 · 입력 토큰(10 TC) | Decision 비용(10 TC) |
|---|---|---|---|---|---|---|
| search.rerank | 15,966 · 18,150 · 21,483 | 226 · 211 · 360 | 70.5× | 10 · 23,859 / 5,364 | 10 · 64,331 | $0.0027 |
| catalog.rank | – (실패) | 373 · 340 · 583 | – | 0 (429) | 10(TC마다 2개로 분할) · 565,446 | $0.0237 |
| catalog.rank:compact | 14,645 · 14,481 · 16,593 | 234 · 229 · 294 | 62.7× | 10 · 43,463 / 4,843 | 10 · 90,563 | $0.0038 |
| review.route | 48,038 · 45,192 · 59,159 | 431 · 432 · 450 | 111.4× | 18 · 80,312 / 13,851 | 20 · 137,409 | $0.0058 |
| layout.pick | 18,981 · 18,262 · 22,242 | 228 · 219 · 292 | 83.2× | 10 · 53,859 / 6,316 | 10 · 84,368 | $0.0035 |
| layout.best_pick | 6,823 · 6,630 · 8,791 | 218 · 214 · 246 | 31.3× | 10 · 7,103 / 2,044 | 10 · 19,156 | $0.0008 |

- LLM 지연에는 응답 생성 시간과 앱 큐 대기가 들어 있다. 분당 한도에 걸린 TC는 실패로 셌고 평균에서 뺐다.
- Decision 분기의 입력 토큰이 LLM보다 많은 작업이 있다(질문마다 후보 카드 · 단계 정의를 넣기 때문). 출력은 무료다.

### 5.3 review.route 1차 → 2차 (수정 1건)

- 1차 실행에서 Decision 분기 재현율은 20%였고, LLM 우세 TC가 1개 있었다(bs01:wrong_customer).
- 원인
  - Decision 모델이 우선순위 2~3을 24개 기준에 주었다.
  - 그래서 LLM 지시의 "우선순위 2~3은 예산 이하" 규칙을 코드로 적용할 때 기대값이 낮은 쪽부터 1로 내렸다.
  - 이때 위험 신호가 있는 CU1까지 1로 내려갔다.
  - 그러면 `_finalize`의 "예산이 차도 위험 기준이 밀려나지 않게" 보호가 무력해진다.
- 수정: 예산 제한에서 위험 신호 기준이 먼저 자리를 잡게 했다(`router.py` `_decide_l2`, 테스트 `test_review_route_budget_cap_never_demotes_risk_criteria`).
- 재실행: LLM 분기 코드는 바뀌지 않았으므로 Decision 분기만 다시 돌렸다. 1차 결과는 결과 JSON의 `decision_v1`에 남겼다.
- 2차 결과: 두 분기가 모두 성공한 8개 TC에서 LLM과 TC별로 모두 같다(31% 대 31%).

## 6. 판단 — 결과가 같은가, 분기를 둘 것인가

| 작업 | 판단 | 근거 |
|---|---|---|
| search.rerank | 대체 (기본 Decision) | 정답 기준 Decision ≥ LLM. MRR 0.58 대 0.46, TC 6:2. 1위 일치는 50%로, LLM 쪽 출력도 실행마다 흔들린다(사전 점검 때 C01은 LLM 1위, 본 실행 4위). 70배 빠름. |
| catalog.rank | 대체 (기본 Decision) | 실제 입력 크기에서 LLM은 분당 한도로 실행이 안 된다. 축소 입력에서는 9/10 TC가 같고 1개는 Decision이 정답을 1위로 올림. |
| review.route | 대체 (기본 Decision) | 수정 후 8/8 TC 재현율 동일, L1 관련도 평균 0.38단계 차이. LLM 쪽은 한도 대기로 2/10 시간 초과, Decision은 0.43초. |
| layout.pick | 대체 (기본 Decision) | 일치율 68% 대 62%(같은 13/20장), TC 2:6:2. primary 일치 55%는 정답이 여럿이거나 후보가 비슷한 장표가 많아서다. |
| layout.best_pick | 대체 (기본 Decision) | top-1 80% 대 80%, 1위 일치 80%. top-3은 90% 대 100%(C04 하나). |

- 저장한 설정은 `WINMATE_DECISION=auto`다. 5개 작업 모두 키가 있으면 Decision 모델, 없으면 LLM이다.
- 작업별로 되돌리려면 `WINMATE_DECISION_TASKS`에서 그 작업을 빼면 된다.

## 7. 알게 된 점과 한계

1. **LLM 분당 한도.** gemma-4-31b-it(Gemini API Tier 2)는 입력 토큰이 분당 16,000이다(429 메시지 `generate_content_paid_tier_2_input_token_count, limit: 16000`).
   - 카탈로그 AI 검색의 순위 요청은 이 한도를 혼자 넘어, LLM 경로는 항상 실패한다.
   - 여러 사용자가 동시에 쓰면 다른 작업도 한도 대기에 걸린다(review.route 2건 시간 초과).
   - Decision 분기는 이 작업들을 LLM 한도에서 빼낸다.
2. **규칙 기준선이 가장 높은 작업이 있다**(search.rerank 0.62, layout.pick 77%, best_pick 90%).
   - 이 정답 라벨(`layouts_any` · `scenario_any`)은 표준 · Best 시나리오가 그 자리에 둔 장표와 같은 출처라, 그 시드를 점수에 넣는 규칙 엔진에 유리하다.
   - 두 모델 분기를 서로 비교하는 데는 공정하지만, "모델이 규칙보다 낫다"는 근거로 쓰면 안 된다. 사람이 고른 정답으로 다시 재면 결론이 달라질 수 있다.
3. **사전 점수 결합의 효과.** 사전 점수를 뺀 Decision만 순서는 search.rerank MRR 0.49, best_pick 70%로 결합본(0.58, 80%)보다 낮았다.
   - Decision 모델의 관련도는 1.0~2.4 사이로 좁게 몰리고 확신도가 0.2~0.45로 낮았다. 후보가 비슷한 레이아웃 재정렬은 Decision 모델 단독으로는 변별이 약하다.
   - catalog.rank는 결합과 무관하게 같았다(후보 내용 차이가 커서 관련도만으로 갈림).
4. **표본이 작다.** 작업당 TC 10개, LLM은 1회 실행이다. TC 1~2개 차이는 우연 범위 안이다. 결론은 "같은 수준 이상이고 훨씬 빠르다"까지만 말할 수 있다.
5. **사유 문구가 다르다.** LLM은 문장 사유, Decision은 관련도 · 확신도 수치다. 형식(문자열 · 길이 · 필수 여부)은 같지만 화면의 "AI · …" 문구 내용은 달라진다.
6. **catalog.rank 평가 풀.** 브라우저의 검색 풀 대신 TF-IDF 상위 50을 썼다. 정답이 10개 TC 모두 풀 안에 있었다.

## 8. 테스트 · 재현

- 단위 테스트: `app/tests/test_decision_tasks.py` 13개. 키 없는 가짜 모델로 확인한다.
  - 분기 선택
  - HTTP 클라이언트(요청 모양 · 재시도 · 인증 실패 · 형식 오류 · 키 비노출)
  - 요청 분할
  - 작업별 두 분기 출력 동일성
  - 덱 내 primary 중복 없음, 위험 기준 보호
- 전체 테스트 결과
  - `pytest app/tests`: 371 통과(4 건너뜀)
  - `proposal_score` unittest: 20 통과
  - 프런트 `catalog-search.mjs`: 10 통과(순위 단계 서버 이전에 맞춰 수정)
- 실측 재현
  - `app/.venv/bin/python -B app/tests/decision_eval.py` — 전체, 약 46분(LLM 분당 한도 페이싱 포함)
  - `… --tasks review.route --only decision --merge <결과.json>` — 한 분기만 다시
  - `… --report <결과.json>` — 표만

## 9. 변경 파일

| 파일 | 내용 |
|---|---|
| `.env.example`, `.env` | Decision 모델 구역(키 · 주소 · 모델 · auto/off · 작업 선택 · 제한 시간) |
| `app/api/poc/settings.py` | `TYPESAFE_*` · `WINMATE_DECISION*` 읽기, `DECISION_TASKS`, `decision_enabled(task)`, capabilities 표시 |
| `app/api/llm/decision.py` (새 파일) | System One 클라이언트, 요청 분할, 답 읽기, 사전 점수 결합, 분기 선택 |
| `app/api/poc/backends.py` | `JobDecision`(작업 기록 · 취소 · 오류 변환), score/layout 백엔드에 Decision 연결 |
| `app/api/poc/adapters/search.py` | search.rerank 분기 |
| `app/api/poc/adapters/catalog_rank.py` (새 파일), `routes.py` | catalog.rank 서버 작업과 `POST /api/catalog/rank` |
| `app/web/src/services/catalog-search.js`, `app/tests/catalog-search.mjs` | 순위 단계를 서버 작업으로 |
| `app/api/poc/adapters/review.py`, `layout.py` | 작업별 Decision 클라이언트 전달 |
| `poc/test/proposal_score/router.py` | review.route 분기(L1 · L2) |
| `poc/test/layout_agent/winmate_layout/decision.py` (새 파일), `layout_design.py`, `scenarios.py` | layout.pick · layout.best_pick 분기 |
| `app/tests/test_decision_tasks.py`, `app/tests/decision_eval.py` (새 파일) | 단위 테스트, 실측 평가 |
| `app/README.md`, `app/api/poc/NOTES.md`, `BOOTSTRAP.md` | 설정 · 분기 설명 |
| `docs/decision-model/` | 이 보고서와 결과(JSON · 표 · TC별 · 로그) |

## 부록 — TC별 결과

TC별 표는 `docs/decision-model/results/per-tc.md`. 주요 TC는 아래와 같다.

| 작업 | TC | LLM | Decision | 메모 |
|---|---|---|---|---|
| search.rerank | C02_L1:products | 정답 11위 | 정답 3위 | 규칙 10위 |
| search.rerank | C04_L3:requirements | 1위 | 4위 | Decision 열세 |
| search.rerank | C09_L3:cost | 3위 | 1위 | |
| catalog.rank:compact | C05_L2 | 2위 | 1위 | 나머지 9개 동일 |
| review.route | bs10:placeholders · number_conflict | 시간 초과(분당 한도 대기) | 0% | 목표(WR1 · MK4)는 규칙 기준선도 못 고름. 위생 · 수치 기준은 위험 신호가 없으면 규칙 점검으로 넘기는 설계라 세 방식 모두 낮다 |
| layout.pick | C06_L1 | 0/1 | 1/1 | |
| layout.pick | C03_L1 · C07_L1 | 2/3 · 3/3 | 1/3 · 2/3 | Decision 열세 |
| layout.best_pick | C01_L2 | O | X (top-3 O) | |
| layout.best_pick | C05_L2 | X | O | |
| layout.best_pick | C04_L2 | X (top-3 O) | X (top-3 X) | |
