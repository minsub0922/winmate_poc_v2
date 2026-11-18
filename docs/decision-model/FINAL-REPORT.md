# 판단형 작업 모델 비교 — 최종 보고서

- 작성일: 2026-11-13
- 대상: winmatev2 앱의 판단형 작업 5개(search.rerank · catalog.rank · review.route · layout.pick · layout.best_pick)
- 결과 원본: `docs/decision-model/results/final/`
  - `final.json`: 모든 분기를 합친 결과
  - `tables.md`: 표
  - `per-tc.md`: TC별 결과
  - 분기별 JSON · 로그, `kb-manifest.json`(평가에 쓴 KB 버전), `run.sh`(재현)
- 1차 보고서(`REPORT.md`, gemma vs Jev)는 그때의 기록으로 남긴다. 그 뒤 KB가 바뀌어 TC 입력 60개 중 36개가 달라졌다. 그래서 이 보고서는 모든 모델을 같은 새 입력으로 다시 돌린 결과다.

비교한 모델:

| 구분 | 모델 | 연결 | 비고 |
|---|---|---|---|
| LLM (앱 기본) | `qwen/qwen3.6-35b-a3b` | OpenRouter, 생각(thinking) 끔 | 이번에 기본 LLM으로 바꿈 |
| LLM (참고) | `qwen/qwen3.6-35b-a3b` | OpenRouter, 생각 켬 | search.rerank만 측정 |
| LLM (이전 기본) | `gemma-4-31b-it` | Gemini API(`gemini` 프로필) | 입력 토큰 분당 16,000 한도 |
| Decision | `jev-1.14.0` | TypeSafe System One API | 앱의 Decision 분기 기본 |
| Decision (로컬) | `clef-flash` 4-bit MLX | 이 Mac의 `clef-flash/` 서버(같은 System One API) | Mac mini M6 · 24GB |
| 기준선 | 규칙 엔진(모델 없음) | – | 검색 점수 · 규칙 점수 순서 그대로 |

## 1. 요약

**LLM API 여러 개 연결**
- LLM 연결을 프로필 방식으로 바꿨다. OpenRouter · Gemini · 사내 LLM · OpenAI 호환 프로필을 루트 `.env`에 함께 적어 두고, `WINMATE_LLM_PROVIDER`로 앱이 쓸 것을 고른다.
- 기본은 OpenRouter `qwen/qwen3.6-35b-a3b`이고, 이 컴퓨터의 `.env`도 그렇게 바꿨다.
- 프로필마다 키 · 모델 · 주소가 따로라서, 바꿔도 다른 API의 키가 섞여 나가지 않는다.
- 코드에서는 `get_provider_for(name)`로 기본 외의 프로필을 함께 쓸 수 있다. 평가에서 Qwen과 gemma를 동시에 돌린 방식이다.

**정답 기준 성능 (TC 10개씩, 모든 모델 같은 입력)**
- **Jev가 5개 작업 중 4개에서 가장 높았다.**
  - search.rerank: MRR 0.64
  - catalog.rank: MRR 0.93
  - catalog.rank 축소 입력: MRR 0.93
  - layout.best_pick: top-1 정답률 90% (Clef와 같음)
- layout.pick은 Qwen 63%, Jev 62%로 사실상 같았다.
- review.route는 모든 모델이 TC마다 같은 결과였다.
- Qwen(생각 끔)은 gemma보다 같거나 조금 높았다. 특히 gemma가 분당 한도 때문에 전혀 실행하지 못하는 카탈로그 AI 검색 전체 입력(약 5만 토큰)을 Qwen은 처리했다(10개 중 9개 성공).
- Clef는 후보 내용 차이가 큰 작업에서는 Jev 수준이었다.
  - 카탈로그 축소 입력: MRR 0.90
  - best_pick: 90%
- 반면 비슷한 레이아웃끼리 고르는 작업에서는 크게 낮았다.
  - search.rerank: MRR 0.29
  - layout.pick: 43%

**속도 (평균)**
- Jev: 0.23~0.68초
- Qwen: 2.7~15.4초
- gemma: 6.9~48.8초
- Clef: 2.0~63초. 이 Mac에서 한 번에 한 요청만 처리하고, 입력 길이에 거의 비례해 느려진다.
- 즉 Jev는 Qwen보다 10~24배, Qwen은 gemma보다 2.3~4.8배 빨랐다.

**비용 (60 TC 전체, 정가 기준)**
- Qwen: $0.106
- Jev: $0.046
- Clef: $0 (로컬)
- gemma: 따로 계산하지 않았다.

**Qwen 생각(thinking) 켬**
- search.rerank 10개 중 4개만 성공했다. 나머지 6개는 생각 토큰이 작업의 출력 한도(2,048)를 먼저 써서 실패했다.
- 평균 36초 걸렸다.
- 성공한 4개는 생각 끔과 결과가 같았다.
- 그래서 기본은 생각 끔(`OPENROUTER_REASONING=off`)으로 두었다.

**저장한 설정**
- 판단형 5개 작업: Jev 키가 있으므로 `WINMATE_DECISION=auto`에 따라 Jev가 처리한다.
- 그 밖의 모든 LLM 작업(생성형 포함): Qwen3.6(OpenRouter)이 처리한다.

## 2. 이번에 바꾼 것

### 2.1 LLM API 프로필 (여러 API를 함께 설정)

| 프로필 | `.env` 키 | 기본 모델 · 주소 | 비고 |
|---|---|---|---|
| `openrouter` (기본) | `OPENROUTER_API_KEY` · `OPENROUTER_MODEL` · `_QUICK_MODEL` · `_VISION_MODEL` · `_BASE_URL` · `OPENROUTER_REASONING` | `qwen/qwen3.6-35b-a3b` · `https://openrouter.ai/api/v1` | 텍스트 · 이미지 입력(같은 모델). 공통 `WINMATE_LLM_*` 값으로 넘어가지 않음 |
| `gemini` | `GEMINI_API_KEY` · `GEMINI_MODEL` … | `.env`: gemma-4-31b-it | 실제 Google 검색 근거(시뮬레이션 스킬)는 이 프로필만 지원 |
| `internal` | `INTERNAL_LLM_*` | – | 사내 LLM |
| `openai` | 공통 `WINMATE_LLM_*` | – | chat-completions 호환 게이트웨이 |

구현:
- `app/api/poc/settings.py`
  - 프로필별로 값을 읽는 `profile(name)`을 두었다.
  - 기본 프로필은 `openrouter`다.
  - `OPENROUTER_REASONING` 값은 off · on · low · medium · high이고, 기본 off다.
  - 기본 외의 프로필은 `provider_settings(name)`으로 연다.
  - `key_name(provider)`는 메시지에 쓸 키 이름만 돌려준다(값은 아님).
  - `public()['providers']`에 프로필별 모델과 키 설정 여부를 보여 준다. 키 값은 넣지 않는다.
- `app/api/llm/adapters.py`
  - `OpenRouterAdapter`를 추가했다(chat-completions + `reasoning` + `x-title`).
  - OpenAI 어댑터는 `body()` / `headers()`로 나눠 하위 어댑터가 덧붙일 수 있게 했다.
- `app/api/poc/provider.py`: `get_provider_for(name, settings)`를 추가했다. 이름별로 인스턴스를 만들고, 모든 인스턴스가 같은 요청 큐 한도를 공유한다.
- `app/scripts/preflight.py`: 키 안내에 프로필별 키 이름을 쓴다.
- 확인한 것:
  - 앱 provider를 통해 OpenRouter JSON 호출(0.9초)과 이미지 입력 호출(1.1초)이 실제로 동작했다.
  - gemini 프로필을 동시에 열 수 있었다.
- 그대로 둔 것: 웹 검색 근거(`search_web`)는 OpenRouter에서 지원하지 않는다. 사내 LLM과 같은 방식으로 `unsupported_capability` 오류를 낸다(지어낸 검색 결과 없음). 이 기능이 필요하면 `WINMATE_LLM_PROVIDER=gemini`로 바꾼다.

### 2.2 Decision 클라이언트의 모델별 한도 (Clef 지원)

- 모델 이름이 `clef`로 시작하면 클라이언트가 Clef 한도를 쓴다(`app/api/llm/decision.py` `LIMITS`).
  - 요청당 16,384 토큰이라, 추정 15k 토큰마다 요청을 나눈다.
  - GPU가 한 번에 한 요청만 처리하므로 순차 전송한다.
  - `truncate:false`를 붙여, 길이를 넘으면 조용히 잘리지 않고 413으로 거절되게 한다.
- `TYPESAFE_BASE_URL`은 이 서버의 루프백 주소(127.0.0.1)에 한해 http를 허용한다.
- Jev 한도(요청당 64k · 질문당 32k, 병렬 4)는 그대로다.

### 2.3 평가 도구 (`app/tests/decision_eval.py`)

- **분기:** `llm`, `llm_think`, `gemma`, `decision`, `decision_raw`, `clef`, `clef_raw`
- **중단·재개:** TC마다 저장한다. `--resume`과 `--budget`(초)으로 끊어 돌리고 이어 간다.
- **입력 확인:** `--combine`이 각 TC 입력의 지문(전체 입력 해시)이 모든 실행에서 같은지 확인하고 합친다.
- **`_raw` 비교:** 같은 모델의 답을 재사용해, 검색 점수 결합만 뺀 순서를 계산한다. Clef는 같은 요청에 확률까지 같은 답을 낸다(반복 요청 |Δp| = 0 확인).

## 3. 평가 방법

- **같은 입력**
  - TC 입력(검색 후보 풀 · 카탈로그 후보 · 규칙 분석 · 후보 카드)은 오프라인 규칙으로 만들었다.
  - 평가 도중 다른 프로세스가 KB 스냅샷(`app/data/runtime/kb`)을 다시 만들었다(16:13). 그래서 그 시점의 코드와 KB를 APFS 복제로 고정한 사본(16:25:54)에서 모든 분기를 다시 돌렸다.
  - 60개 TC 모두 지문이 같은 것을 합치는 단계에서 확인했다.
  - 섞인 입력으로 돌았던 앞선 시도는 `results/discarded-mixed-kb/`에 남기고 결과에서 뺐다.
  - KB 버전: `kb-manifest.json`(generated_at 2026-11-13T07:13:39Z, Best Scenario 116개).
- **실행 경로:** 모든 분기가 앱의 실제 작업 함수를 지난다(LLM 분기는 앱 provider · 큐 · 재질문 포함, Decision 분기는 실제 API · 로컬 서버).
- **측정:** 작업 함수 호출 앞뒤 벽시계 시간(ms)과 모델이 돌려준 토큰.
- **gemma 페이싱:** gemma는 분당 16k 한도에 걸리지 않게 TC 사이에 쉬었다. 쉰 시간은 지연에 넣지 않았다.
- **정답:** 저장소에 이미 있는 라벨만 썼다. 새로 만든 라벨은 없다.
  - search.rerank · layout.pick: layout eval `gold.layouts_any`
  - catalog.rank · layout.best_pick: `gold.scenario_any`
  - review.route: 교란 테스트 `PERTURB[kind].targets`
  - TC 구성은 `REPORT.md` 4장과 같다.
- **정답 유효성:** 새 KB에서도 정답이 모든 TC의 후보 안에 있었다.
  - search 10/10
  - catalog 10/10
  - layout.pick 채점 슬라이드 20장
  - best_pick 후보 상위 5 안에 10/10

## 4. 결과

### 4.1 성능 (TC 10개씩)

| 작업 | 지표 | Qwen3.6 (기본 LLM) | gemma-4-31b | Jev | Clef | 규칙 기준선 |
|---|---|---|---|---|---|---|
| search.rerank | MRR | 0.55 | 0.46 | **0.64** | 0.29 | 0.60 |
| catalog.rank | MRR | 0.80 (9/10 성공) | 실패 0/10 (분당 한도) | **0.93** | 0.70 | 0.74 |
| catalog.rank:compact (보조) | MRR | 0.78 | 0.76 (8/10 성공) | **0.93** | 0.90 | 0.74 |
| review.route | 목표 기준 재현율 | 25% | 31% (8/10 성공) | 25% | 25% | 25% |
| layout.pick | 정답 레이아웃 일치율(TC 평균) | 63% | 58% | 62% | 43% | **77%** |
| layout.best_pick | top-1 정답률 | 80% | 80% | **90%** | **90%** | 80% |

세부 지표:

| 작업 | 지표 | Qwen3.6 | gemma-4 | Jev | Clef | 규칙 |
|---|---|---|---|---|---|---|
| search.rerank | 1위 정답 · 3위 안 정답 | 4 · 6 /10 | 3 · 5 /10 | 5 · 7 /10 | 1 · 2 /10 | 5 · 6 /10 |
| catalog.rank | 1위 정답 | 6/9 | – | 9/10 | 4/10 | 6/10 |
| catalog.rank:compact | 1위 정답 | 6/10 | 5/8 | 9/10 | 8/10 | 6/10 |
| layout.pick | 정답 슬라이드(전체 20장) | 13 | 12 | 11 | 8 | 15 |
| layout.best_pick | top-3 안 정답 | 10/10 | 10/10 | 9/10 | 10/10 | 10/10 |

review.route는 이 정답으로 모델을 구분하지 못한다:
- 모든 모델이 TC 10개 모두에서 서로 같은 재현율을 냈다(TC별 우열 0 / 10 / 0).
- gemma의 31%는 시간 초과된 2개 TC를 뺀 평균이다. 그 2개는 다른 모든 모델도 0%였다.
- 선택한 기준 집합의 일치율(Jaccard)은 모델 쌍마다 57~67%로, 고른 기준 자체는 꽤 다르다.

검색 점수를 뺀 Decision 모델 단독 순서(비교용, 같은 답 재사용):

| 작업 | Jev | Jev만 | Clef | Clef만 |
|---|---|---|---|---|
| search.rerank (MRR) | 0.64 | 0.45 | 0.29 | 0.23 |
| catalog.rank (MRR) | 0.93 | 0.93 | 0.70 | 0.48 |
| catalog.rank:compact (MRR) | 0.93 | 0.88 | 0.90 | 0.77 |
| layout.best_pick (top-1) | 90% | 80% | 90% | 90% |

### 4.2 TC별 우열 (둘 다 성공한 TC, 주 지표 기준)

| 작업 | Jev 대 Qwen | Clef 대 Qwen | Jev 대 Clef | gemma 대 Qwen |
|---|---|---|---|---|
| search.rerank | 5 / 4 / 1 | 2 / 1 / 7 | 9 / 0 / 1 | 2 / 5 / 3 |
| catalog.rank | 2 / 7 / 0 (n=9) | 2 / 5 / 2 (n=9) | 5 / 4 / 1 | – |
| catalog.rank:compact | 3 / 7 / 0 | 3 / 7 / 0 | 1 / 8 / 1 | 2 / 5 / 1 (n=8) |
| review.route | 0 / 10 / 0 | 0 / 10 / 0 | 0 / 10 / 0 | 0 / 8 / 0 (n=8) |
| layout.pick | 3 / 3 / 4 | 1 / 4 / 5 | 4 / 5 / 1 | 1 / 7 / 2 |
| layout.best_pick | 1 / 9 / 0 | 1 / 9 / 0 | 0 / 10 / 0 | 1 / 8 / 1 |

(앞 모델 우세 / 같음 / 뒤 모델 우세. 1위 결과 일치율은 `results/final/tables.md`.)

### 4.3 속도 (TC당 평균 · 중앙값 · 최대, 초)

| 작업 | Qwen3.6 | gemma-4 | Jev | Clef |
|---|---|---|---|---|
| search.rerank | 4.5 · 2.9 · 13.1 | 21.8 · 17.3 · 47.5 | 0.23 · 0.22 · 0.29 | 6.3 · 6.0 · 9.4 |
| catalog.rank | 8.7 · 8.7 · 11.4 | – (실패) | 0.42 · 0.39 · 0.55 | 63.2 · 59.2 · 99.2 |
| catalog.rank:compact | 6.4 · 6.4 · 9.8 | 16.0 · 15.8 · 19.9 | 0.55 · 0.44 · 1.08 | 13.1 · 11.4 · 20.2 |
| review.route | 15.4 · 14.3 · 24.3 | 48.8 · 45.0 · 64.4 | 0.68 · 0.46 · 2.44 | 14.4 · 14.3 · 15.6 |
| layout.pick | 7.8 · 5.9 · 19.5 | 18.0 · 17.6 · 22.3 | 0.32 · 0.21 · 1.25 | 7.4 · 7.2 · 10.1 |
| layout.best_pick | 2.7 · 2.8 · 4.1 | 6.9 · 7.3 · 7.9 | 0.25 · 0.25 · 0.29 | 1.95 · 1.91 · 2.29 |

- Qwen 생각 켬은 search.rerank 성공 4개 기준 평균 36.4초였다.
- Clef catalog.rank는 TC당 입력이 약 5만 토큰이다. 클라이언트가 보수적인 추정(1.2자/토큰)으로 15k씩 6~7개 요청으로 나눠 순차 처리한다.
- Clef 지연은 같은 Mac의 다른 앱이 스왑을 약 22GB 쓰는 상태에서 잰 값이다. 모델 카드의 M5 Max 수치(1k 토큰 0.31초)보다 3배쯤 느리다.

### 4.4 토큰 · 비용 (10 TC 합계, 정가 기준)

| 작업 | Qwen3.6 입력/출력 · 비용 | gemma-4 입력/출력 | Jev 입력 · 비용 | Clef 입력 |
|---|---|---|---|---|
| search.rerank | 24k / 4.6k · $0.0066 | 28k / 7.3k | 64k · $0.0027 | 56k |
| catalog.rank | 481k / 5.9k · $0.0534 | 0 (429) | 686k · $0.0288 | 509k |
| catalog.rank:compact | 46k / 5.5k · $0.0096 | 39k / 4.1k | 95k · $0.0040 | 77k |
| review.route | 88k / 14.9k · $0.0222 | 80k / 13.9k | 137k · $0.0058 | 120k |
| layout.pick | 53k / 6.8k · $0.0114 | 53k / 6.0k | 84k · $0.0035 | 58k |
| layout.best_pick | 8k / 2.1k · $0.0027 | 7k / 2.0k | 20k · $0.0008 | 16k |
| **합계** | **$0.106** | – | **$0.046** | 로컬 |

가격 기준:
- Qwen: OpenRouter 정가(입력 $0.10, 출력 $0.90 / 1M)로 계산했다. 실제 청구는 연결된 업스트림에 따라 다를 수 있다.
- Jev: 입력만 과금($0.042/1M)이고 출력은 무료다.

### 4.5 실패

| 모델 | 실패 | 원인 |
|---|---|---|
| Qwen3.6 (생각 끔) | catalog.rank 1개 (C06_L2) | 두 번 물었지만 두 번 다 형식 검증 실패(후보 id 개수 · 중복). 규칙으로 대신 채우지 않고 실패로 셌다 |
| Qwen3.6 (생각 켬) | search.rerank 6개 | 생각 토큰이 출력 한도 2,048을 먼저 소진(`max_tokens`) |
| gemma-4 | catalog.rank 10개, compact 2개, review.route 2개 | 분당 입력 16k 한도(429). compact 1개는 요청 거부(400). review 2개는 한도 대기로 시간 초과 |
| Jev · Clef | 없음 | – |

## 5. 판단과 권장 설정

| 작업 | Jev 키가 있을 때 (현재 저장) | Jev가 없을 때 | 로컬 Clef만 쓸 때 |
|---|---|---|---|
| search.rerank | Jev (0.64, Qwen보다 20배 빠름) | Qwen | LLM 유지 (Clef 0.29) |
| catalog.rank | Jev (0.93) | Qwen (gemma는 입력 크기 때문에 실행 불가) | LLM 유지 (Clef 63초/요청, 대화형 검색엔 느림) |
| review.route | Jev (결과 같고 22배 빠름) | Qwen | Clef 가능 (결과 같음, 14초) |
| layout.pick | Jev (Qwen과 같은 수준, 24배 빠름) | Qwen | LLM 유지 (Clef 43%) |
| layout.best_pick | Jev (90%) | Qwen | Clef 가능 (90%, 2초) |

- 저장한 설정:
  - `.env`: `WINMATE_LLM_PROVIDER=openrouter`, `OPENROUTER_MODEL=qwen/qwen3.6-35b-a3b`, `OPENROUTER_REASONING=off`
  - Decision: `WINMATE_DECISION=auto` + Jev 키
- Clef로 Decision 모델을 바꾸려면 다음처럼 설정한다. 그러면 search.rerank · catalog.rank · layout.pick은 Qwen으로 간다.

  ```dotenv
  TYPESAFE_BASE_URL=http://127.0.0.1:8790/v1
  TYPESAFE_MODEL=clef-flash
  TYPESAFE_API_KEY=local
  WINMATE_DECISION_TIMEOUT=120
  WINMATE_DECISION_TASKS=review.route,layout.best_pick
  ```

- gemma → Qwen 전환:
  - 판단형 작업에서 Qwen은 gemma와 같거나 낫고, 2.3~4.8배 빠르다.
  - 분당 16k 한도가 없어 큰 입력(카탈로그 검색 약 5만 토큰)을 처리한다.

## 6. 알게 된 점과 한계

1. **평가 범위.** 기본 LLM을 Qwen으로 바꾸면 앱의 모든 LLM 기능이 Qwen을 쓴다(RFP 추출 · 스토리보드 · 장표 문구 · 상세 채점 · 시뮬레이션 · 이미지 판독).
   - 이번 평가는 판단형 5개 작업만 쟀다.
   - 생성형 기능은 연결(텍스트 · 이미지)이 동작하는 것까지만 확인했고 품질은 재지 않았다.
   - 실제 Google 검색 근거가 필요한 시뮬레이션 스킬은 OpenRouter에서 지원되지 않는다는 오류로 끝난다.
2. **동시 작업과 고정 사본.**
   - 평가 중 다른 프로세스가 같은 작업 트리에서 다음 일을 하고 있었다:
     - git stash · pull · 병합
     - KB 재생성
     - 웹 빌드
   - 숫자는 16:25:54 시점의 코드 · KB 고정 사본 기준이다. 그 시점에 커밋되지 않은 다른 작업도 이 사본에 포함됐다.
   - 이후 저장소가 바뀌면 입력도 달라질 수 있다. 재현할 때는 `results/final/run.sh` 설명대로 사본을 고정하거나, 합치기 단계의 지문 검사로 확인한다.
3. **규칙 기준선이 높은 작업이 있다**(layout.pick 77%, search.rerank 0.60).
   - 정답 라벨이 표준 · Best 시나리오의 장표 배치와 같은 출처라 규칙 엔진에 유리하다.
   - 모델끼리 비교하는 데는 공정하다. 하지만 "모델이 규칙보다 낫다 · 못하다"의 근거로 쓰면 안 된다.
4. **표본이 작다.** 작업당 TC 10개, 모델마다 1회 실행이다.
   - TC 1~2개 차이(예: layout.pick Qwen 63% 대 Jev 62%, best_pick 80% 대 90%)는 우연 범위 안이다.
   - OpenRouter는 요청마다 다른 업스트림(DekaLLM · CoreWeave 등)으로 보내므로, 지연과 결과가 실행마다 흔들릴 수 있다.
5. **Clef의 약점은 비슷한 후보끼리의 구분이다.**
   - 레이아웃 재정렬과 슬라이드별 선택처럼 후보 카드 설명이 비슷한 작업에서 낮았다.
   - 검색 점수를 더해도 회복되지 않았다(0.23 → 0.29).
   - 후보 내용이 뚜렷이 다른 시나리오 선택(카탈로그 축소 · best_pick)에서는 Jev와 비슷했다.
   - 9B · 4-bit · 16k 컨텍스트 모델이라 질문을 6~7개 요청으로 나누는 것도 영향을 줄 수 있다.
6. **Qwen 생각 켬**을 쓰려면 작업별 출력 한도(예: search.rerank 2,048)와 시간 한도(60초)를 올려야 한다. 이번에는 바꾸지 않았다.
7. **gemma 비용**은 계산하지 않았다(Gemini API의 gemma 과금 기준을 확인하지 못함). gemma 실패는 모델 품질이 아니라 API 한도 때문이다.

## 7. 테스트 · 재현

- 단위 테스트
  - `pytest app/tests`: 443 통과, 5 건너뜀.
    - 새로 넣은 테스트: 프로필 분리 · 기본 openrouter · 키 비노출 · reasoning 값 · `get_provider_for`(`test_llm_service.py`), Clef 한도 · 순차 · `truncate:false`(`test_decision_tasks.py`)
  - 프런트 `catalog-search.mjs`: 10 통과.
  - `admin/tests`: 79 통과, 4 실패. `test_normal_startup_only_mounts_opted_in_local_admin`이 실패하는데, 병합으로 바뀐 `app/start.sh`가 `app/scripts/ports.sh`를 읽는 반면 테스트용 가짜 프로젝트는 그 파일을 복사하지 않기 때문이다. 이번 변경과 무관하다.
- 실측 재현: `bash docs/decision-model/results/final/run.sh`
  - 네 실행(OpenRouter · gemma · Jev+Clef · Qwen 생각 켬)을 병렬로 돌린다. 각 실행은 7분마다 끊고 이어 간다. 끝까지 약 50분(gemma 페이싱).
  - 그다음 `app/.venv/bin/python -B app/tests/decision_eval.py --combine … --out final.json`으로 합치고, `--report final.json`으로 표만 다시 만든다.

## 8. 변경 파일 (이번 라운드)

| 파일 | 내용 |
|---|---|
| `app/api/poc/settings.py` | LLM API 프로필, 기본 `openrouter`, `OPENROUTER_*`, `provider_settings` · `key_name`, capabilities의 `providers` · `reasoning`, Decision 주소 루프백 http |
| `app/api/llm/adapters.py` | `OpenRouterAdapter`, OpenAI 어댑터 `body()` · `headers()` 분리 |
| `app/api/poc/provider.py` | `get_provider_for(name, settings)` |
| `app/api/llm/decision.py` | 모델별 한도 `LIMITS`(Jev · Clef), `truncate:false`, 순차 전송 |
| `app/scripts/preflight.py` | 프로필별 키 이름 안내 |
| `app/tests/test_llm_service.py`, `app/tests/test_decision_tasks.py` | 프로필 · OpenRouter · Clef 테스트 |
| `app/tests/decision_eval.py` | 다중 모델 분기, 재개 · 예산, 입력 지문, 합치기, 모델 이름 표 |
| `.env.example`, `.env` | OpenRouter 프로필(기본), Clef 예시. `.env`는 선택 값 · 모델 · reasoning 줄만 바꿈(키 값은 그대로) |
| `app/README.md`, `admin/README.md`, `BOOTSTRAP.md`, `app/api/poc/NOTES.md` | 기본 제공자 · 프로필 설명 |
| `docs/decision-model/FINAL-REPORT.md`, `results/final/` | 이 보고서와 결과 |

## 부록 A. TC별 결과

`results/final/per-tc.md`. 눈에 띄는 TC:

| 작업 | TC | Qwen3.6 | gemma-4 | Jev | Clef | 규칙 | 메모 |
|---|---|---|---|---|---|---|---|
| search.rerank | C02_L1:products | 11위 | 11위 | 3위 | 10위 | 8위 | Jev만 정답을 상위로 |
| search.rerank | C07_L3:why | 12위 | 11위 | 6위 | 14위 | 11위 | 모두 낮음 |
| search.rerank | C08_L1:value | 2위 | 4위 | 6위 | 1위 | 4위 | Clef 유일한 1위 |
| catalog.rank | C06_L2 | 실패(형식) | 실패(한도) | – | – | – | Qwen 재질문 후에도 형식 오류 |

## 부록 B. 1차 결과와의 관계

- 1차(`REPORT.md`)와 그 뒤의 Clef 중간 측정은 병합 전 데이터(Best Scenario 85개)로 쟀다.
- 이번은 병합 후 데이터(116개)로 쟀고, TC 입력 60개 중 36개가 달라 숫자를 직접 비교할 수 없다.
- 1차 수치(참고):

| 모델 | search.rerank | catalog.rank | compact | layout.pick | best_pick |
|---|---|---|---|---|---|
| gemma | 0.46 | 실패 | 0.90 | 62% | 80% |
| Jev | 0.58 | 0.95 | 0.95 | 68% | 80% |
| 규칙 | 0.62 | 0.87 | 0.87 | 77% | 90% |

- Clef 중간값: search 0.42, catalog 1.00, compact 0.85, review 25%.
- 모델 간 순서(Jev ≥ LLM, gemma는 큰 입력 실패, Clef는 시나리오 선택에 강하고 레이아웃 구분에 약함)는 두 번 모두 같았다.
