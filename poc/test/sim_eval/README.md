# 제안 시뮬레이션 실성능 검증 (sim_eval)

앱의 **제안 시뮬레이션**(src/sim)이 실제 LLM 으로 돌 때 고객 역할 · 턴별 평가가 제대로 되는지 검증합니다.
150명 페르소나 중 서로 다른 10명을 골라 Best Scenario 를 스토리라인으로 삼고, 영업 담당자 역할도 LLM 이 맡아 최대 14턴 미팅을 진행합니다. 턴마다 만족도 · 13개 기준 점수 · 드러난/해소된 우려를 기록하고, 세션이 끝나면 다른 모델이 대화 전체를 독립 심사합니다.

- 엔진은 앱 src/sim 을 그대로 묶어 씁니다(`engine/winmate_sim.mjs`). 앱과 같은 프롬프트 · 같은 판정 코드입니다. 앱의 `window.claude` 호출 자리만 Gemini 로 바꿨습니다.
- 턴이 끝날 때마다 `runs/<id>/sessions/<세션>.jsonl` 에 한 줄씩 기록합니다. 테스트 벤치의 **제안 시뮬레이션 · 실성능 검증** 탭이 이 파일을 1.5초마다 읽어 실시간으로 보여 줍니다.
- 2026-10-18 검증 결과: `reports/20261018.html` (수정 전 · 후 비교, 판단이 필요한 것 포함)

## 준비

- Node 18 이상. 설치할 패키지는 없습니다.
- `poc/.env` 에 `GEMINI_API_KEY` (선택: `GEMINI_MODEL`, `SIM_CUSTOMER_MODEL`, `SIM_SELLER_MODEL`, `SIM_JUDGE_MODEL`). 키 값은 출력하지 않습니다.

| 역할 | 기본 모델 | 하는 일 |
|---|---|---|
| 고객 · 평가 | `gemini-3.1-flash-lite` | 앱 엔진의 `customerTurn` — 고객 대사와 턴 평가(JSON)를 한 번에 |
| 영업 담당자 | `gemini-3.5-flash` | Best Scenario 스토리라인을 따라 말함 (`lib/seller.mjs`) |
| 독립 심사 | `gemini-3.1-pro-preview` | 끝난 대화를 읽고 7항목(1~5) · 13기준(0~100) · 기대 결과 |

## 실행

```bash
cd poc/test/sim_eval
node run.mjs                                    # 10명 × 스토리라인 담당자 + 대조군(미숙 3 · 추천 답변 3)
node run.mjs --modes scenario,expert --tag t1   # 숙련 담당자까지 26세션
node run.mjs --only ps01,ps12 --controls none   # 일부만
node run.mjs --resume t1-20261018-2006          # 끊긴 실행 이어서 (턴 단위로 저장돼 있음)
node run.mjs --engine baseline --tag before     # 수정 전 엔진으로 같은 실험
node run.mjs --persona-level                    # 페르소나 고유 난이도 값(관계 · 예산 · 성향 · 말투)을 엔진에 전달
node run.mjs --offline                          # LLM 없이 규칙 엔진 + 앱 추천 답변 (배선 점검용)
node lib/report.mjs runs/<id>                   # 요약 · 리포트 다시 만들기
node compare.mjs reports/20261018.notes.json    # 수정 전 · 후 비교 페이지 다시 만들기
```

그 밖의 옵션: `--set 파일` · `--turns 14` · `--concurrency 4` · `--no-judge` · `--deadline 초`(이 시간이 지나면 진행 중인 턴을 마치고 저장 후 멈춤). Ctrl+C 도 같은 방식으로 멈춥니다.

### 영업 담당자 유형

| 유형 | 설명 |
|---|---|
| `scenario` 스토리라인 담당자 | Best Scenario 단계(오프닝 → 니즈 → 제안 → 근거 → 이의 → 클로징)를 따라 말함 |
| `expert` 숙련 담당자 | 스토리라인 + 우려마다 구체적 수치 · 사례 · 일정으로 답함 |
| `weak` 미숙한 담당자(대조) | 과장 · 일반론 · 서두름 — 엔진이 못하는 영업을 가려내는지 |
| `suggest` 추천 답변만(대조) | 앱이 주는 첫 번째 추천 답변을 그대로 보냄 |

## 고객 10명 (`sets/diverse10.json`)

`node select.mjs` 가 150명(`data/personas150.json`, 프로젝트 문서 sim-personas.json 사본)에서 업종 · Best Scenario 가 겹치지 않고, 난이도 3 · 4 · 3명, 성별 5 · 5, 요구 유형이 고루 섞이도록 고릅니다(시드 고정). 고객마다 업종 · 요구 유형 · 전략 · 제품이 가장 잘 맞는 Best Scenario 를 스토리라인으로 붙입니다.

## 기록 (`runs/<id>/`)

| 파일 | 내용 |
|---|---|
| `run.json` | 실행 설정 · 세션별 진행 상황(실시간) |
| `sessions/<세션>.jsonl` | `start` → `turn`(영업 대사 · 고객 대사 · 만족도 · 13기준 점수 · 우려 · 추천 답변 · 규칙 점수 · 자동 점검 · LLM 원문) → `end`(앱 총평) → `judge` |
| `sessions/<세션>.state.json` | 이어 돌리기용 상태 |
| `summary.json` · `report.md` · `report.html` | 실행 요약 · 리포트 |
| `calls.jsonl` | LLM 호출 기록(모델 · 시간 · 토큰) |

### 자동 점검 (`lib/checks.mjs`)

평가 JSON 깨짐 · 대사에 메타 정보 · 대사 길이 · 만족도 급변 · 한 턴에 우려 여러 개 · 근거 없는 고득점(말하지 않은 사례 · 수치 · 제품) · 우려가 남았는데 성공 · 결정 요청 없이 성공 · 응답 지연 · 반복 등 18가지를 턴마다 봅니다.

## 2026-10-18 실행 기록

| 실행 | 엔진 | 비고 |
|---|---|---|
| `baseline-20261018-1939` · `baseline-expert-20261018-2009` | 수정 전 | 비교 기준(합쳐서 26세션) |
| `fixed-20261018-1946` | 1차 수정 | |
| `fixed2-20261018-1952` | 1차 수정 | 엔진 파일이 늦게 반영돼 1차를 다시 돈 실행 — 실행 간 편차 확인용 |
| `fixed3-20261018-1958` | 3차(중단) | 성공 조건을 너무 엄격하게 잡아 결론 없이 맴돌아 중단 |
| `fixed4-20261018-2002` | 4차 | |
| `fixed5-20261018-2006` | **최종** | 비교 대상 |
| `fixed5-plv-20261018-2019` | 최종 + 페르소나 값 | 스토리라인 담당자 10세션 |
| `probe-20261018-1936` | 수정 전 | 배선 점검용 1세션 |

엔진 변경 내용: `engine/engine.diff` (수정 전 원본은 `engine/src-before/engine.js`). 되돌리려면 원본을 `src/sim/engine.js` 로 복사하고 앱을 다시 빌드합니다.

## 엔진 다시 묶기

```bash
node scripts/build_engine.mjs                                   # 지금 src/sim → engine/winmate_sim.mjs
node scripts/build_engine.mjs --src <다른 winmatev2 경로> --out engine/winmate_sim.baseline.mjs --label "수정 전"
```

esbuild 가 필요합니다(앱 루트의 node_modules). `src/ai.js` 는 `scripts/sample_shim.mjs` 로 바꿔 끼우고, 시뮬레이션과 관계없는 레이아웃 모듈은 비워서 묶습니다.
