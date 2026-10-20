# Winmate v2 · Layout Agent (PoC)

고객 요구사항 → **① 요구사항 분석 → ② layout 설계(RAG · 우선순위) → ③ layout 별 실제 값 입력** 을 LangGraph 로 잇는 테스트 프로젝트.
winmatev2 본 앱의 storyboard 파트 24종 · 레이아웃 446개 · Best Scenario 20개 · 제품/솔루션/사례 카탈로그를 그대로 쓰고,
결과는 앱 제안서 모델(`parts[].layouts[].ov.t`)과 같은 모양의 JSON 으로 내보낸다.

## 빠른 시작 (Mac)

```bash
cd poc/test/layout_agent
uv venv --python 3.12 && source .venv/bin/activate      # deepagents 는 3.11+ (본 흐름은 3.10 도 됨)
uv pip install -r requirements.txt
# 키는 가까운 .env 를 읽는다 — 보통 poc/.env (GEMINI_API_KEY · GEMINI_MODEL). 키 값은 출력하지 않는다

python -m winmate_layout run --case eval/cases/C01_L1.json            # ① 요구 거의 없음 → 표준 제안서
python -m winmate_layout run --case eval/cases/C03_L2.json            # ② 모호 → Best Practice
python -m winmate_layout run --case eval/cases/C04_L3.json --ask      # ③ 복잡(실제 RFP) → 분해 · 질문에 답하며 진행
python -m winmate_layout interview --case eval/cases/C04_L3.json      # ③ deepagents 전략 코파일럿과 대화(Gemini 필요)
open outputs/C04_L3/preview.html
```

`--llm offline` 이면 Gemini 없이 결정론 규칙만으로 돈다(기본 `auto` = 키가 있으면 Gemini).

## 흐름 (LangGraph)

```
ingest → analyze ─┬─ minimal   → match_standard ─────────────────────────────┐
                  ├─ ambiguous → match_best ─────────────────────────────────┤
                  └─ complex   → decompose → strategy_interview (interrupt) ─┤
                                                                             ▼
          plan(요구↔파트 연결 · 우선순위 · items · 장수 컷) → design_part × N (Send) → assemble
          → fill_slide × M (Send) → review ─┬→ finalize
                                            └→ revise(필수 요구가 빠졌으면 대응 파트 추가, 1회) → design_part …
```

| 노드 | 하는 일 | 코드 |
|---|---|---|
| analyze | 원자 요구 추출(키맨 · 자유형식 · 첨부 원문 · 제작자 의견), 18개 분류 → 10개 기준, must/should/could, 수치 사실, 업종 · 요구 타입 · 전략 단서, **맥락 3분기 판정** | `analysis.py` |
| match_standard | 업종 → `STD-업종` 표준 제안서. 고른 제품 수 · 솔루션 · 사례 수로 장표 규칙을 해석 | `scenarios.py` |
| match_best | 20개 Best Scenario 점수(업종 · 요구 타입 · 전략 · 제품/솔루션 겹침 · 상황 유사도) → 상위 3 → 고객 업종 · 솔루션 · 제품 수로 장표 치환 | `scenarios.py` |
| decompose | 기준별 그룹 · 평가 구조(배점 · BMT · 최저가) · 충돌 · 빈 정보 · 전략 후보 3 · 질문 | `decompose.py` |
| strategy_interview | `interrupt()` 로 멈추고 사용자 답을 받음 → 전략 · 결말 · 분량 · 앞에 둘 키맨 반영. **충돌 선택지마다 다른 대응 장표**(예: 가격 vs 규격 — 규격 100% 충족 → SC-B + 원가 최소 구성 BM-A / TCO 강조 → CO-B / 대안 사양 → SC-E). **빈 정보에 값을 답하면** 요구(I01…) · 수치 근거로 추가, LLM 질문 답도 요구로 기록 | `graph.py` · `strategy.py` |
| plan | 요구 ↔ 파트 연결(추적성), 요구가 모두 다른 파트로 가 비어 버린 기준별 파트 제거, 연관 우선순위, 파트 내용(items)에 고객 요구 표현 반영, 장수 예산 컷 | `storyboard.py` |
| design_part | 파트 · 슬라이드마다 RAG + 메타데이터 적합도 점수 → (Gemini) 상위 6 후보를 메타데이터와 함께 보여 주고 재선택 — 고른 장표에 점수 가산, 후보 밖 id 는 무시 | `layout_design.py` · `retrieval.py` |
| fill_slide | 칸 역할별 값 입력 · 표 장표 전용 채우기(RM-A/B/C · SC-B · SE-A · BM-A 구성표 · SM-B 공간×제품 · VP-D 이해관계자) · 정량 효과(“응답 시간 30% 감소” → ▼ 30%) · 요구 닻(부제) · 검증 | `fill.py` · `tables.py` |
| review | 요구 반영률(제출 절차 제외) · 필수 요구 누락 · 흐름 · 업종/솔루션 일관성 · 중복 · 채우기 품질 · **규격 불일치**(예: 27인치 RFP 에 32" 제품) · 제출 체크리스트 | `review.py` |

### 요구사항 맥락 3분기

| 맥락 | 판정 신호(규칙 → Gemini 보정, 평가 구조 · 빈 입력은 규칙 우선) | 추천 로직 |
|---|---|---|
| ① 거의 없음 | 키맨 · 첨부 없음, 서술형 목표 문장 0, 요구 ≤ 2 | **표준 제안서 시나리오**(`data/standard_scenarios.json`, 업종 16 + 공통 1): 표지 → (업종 이해) → 제품 · 솔루션별 가치 VP → 솔루션 → 공간별 제품 → 유관 사례 → Why Samsung → 지원 체계 → 마무리. 전략이 아니라 **업종**으로만 구분(VP-U 업종판 · P-R 유닛 패키지 · RV-A 분양 포인트 · P-L LED 구성 …) |
| ② 모호 | 목표 · 고민 문장은 있으나 키맨 · 수치 · 평가 구조가 흐림 | **Best Practice 시나리오** 전체 구성. 다른 업종 시나리오를 빌리면 그 업종 고유 표현은 걷어내고, 가치 제안 파트가 없으면 넣음 |
| ③ 복잡 | 평가 · 입찰 신호, 첨부 원문, 요구 ≥ 8 / 키맨 2+ 와 요구 5+ / 필수 4+ | **분해 → 기준별 정리 → 사용자와 전략 수립**. 열기(표지 · 사업 이해/요약) → 요구 이해(RM-A 키맨 · RM-C 평가 배점 · RM-B 전수 대응표) → 전략 서사(고른 전략의 대표 시나리오에서 맥락 · 문제 · 가치 · 장면) → 기준별 대응 파트 → 전략 필수 장표 → 결정 요청 |

### 연관 우선순위
- 요구 점수 = must 3 / should 2 / could 1 × (1 + 키맨 가중치%) + 평가 항목 +1 + 측정 가능 +0.3 (제작자 의견은 필수로 올리지 않고 ×0.7)
- 입찰 절차 · 제출 조건(참가의향서 · 인감 · 보증금 · 청렴 · 추첨 · 무효 사유 …)은 could 로 두고 **요구 전수 대응표(RM-B)에만** 연결 — 가치 · 키맨 · 비교 장표에는 싣지 않고, 반영률 분모에서 빼서 "제출 체크리스트"로 따로 보여 준다. 연락처 · 담당자 줄은 요구가 아니다.
- 파트 점수 = 0.6 × (연결 요구 점수 합 / 최대) + 0.4 × 구조 중요도(핵심 1.0 · 선택 0.4) → 순위 · `priority_reason`
- 키맨 우선 답을 받으면 그 키맨 요구 ×1.3. 장수 예산을 넘으면 우선순위 낮은 선택 파트 → 여러 장짜리 파트 순으로 줄임
- 파트 간 연관 = `parts.js RELATED` 로 이어진 파트(미리보기에 표시)

## 레이아웃 메타데이터 (RAG)

`python scripts/build_metadata.py` → `data/layout_cards.jsonl` (446) · `data/layout_cards_summary.csv`

| 필드 | 내용 |
|---|---|
| part · part2 · ind · sol · pc | 원천 메타(파트 유형 · 업종 전용 · 솔루션 전용 · 제품 수) |
| slots.texts | data-tb 칸마다 역할(eyebrow · headline · subhead · kpi · title · body · caption · tag · footer · fixed) · 글자 수 상한 · 자리표시 여부 |
| slots.images · groups | 이미지 칸(종류 · 힌트), 반복 카드/행 구조 → **capacity**(몇 항목을 담는 장표인가) |
| visual | kpi · table · comparison · map · flow · photo · diagram · matrix · cards · message · qna · image_heavy |
| strategy_fit · req_type_fit · level_fit | 7개 전략 · 6개 요구 타입 · 3개 맥락 적합 — 코드 규칙 + Best Scenario 사용 이력 |
| usage | Best Scenario 에서 맡은 역할 문장(“메뉴 교체 다섯 단계 속 병목 — 9일이 걸리는 이유”) |
| data_needs | 채우는 데 필요한 정보(필수 · 핵심) — 없으면 감점, Gemini 에도 `missing` 으로 전달 |
| audience | exec · working · mixed |
| static_text · static_ind | **data-tb 밖 편집 불가 문구**와 그 업종 — 다른 업종 고객에게 감점, 검토 리포트에 표시 |
| embed_text | 위 정보를 묶은 자연어 설명(dense 검색용) |

검색 = BM25(한글 바이그램, 앱 search.js 와 같은 토크나이저 · 유의어) 0.55 + dense(TF-IDF char n-gram, `WINMATE_DENSE=gemini` 면 Gemini 임베딩) 0.45.
선택 = 검색 관련도 × 4 + 파트 유형 · 시나리오 시드 · 업종 전용/표준 · 솔루션 · 제품 수 · 정보 준비도 · 전략/요구 타입/맥락 적합 · 요구 표현 일치 − 중복 (식은 `layout_design.py` 머리말).
업종이 다른 업종 전용 장표, 연결 안 된 솔루션 전용 장표는 후보에서 제외.

## 값 입력 원칙
- **아는 것만 정확히, 모르는 것은 자리표시** — 고객명(조사 교정) · 프로젝트 · 제품명/사양 · 사례 · 요구 · 키맨 · 평가 배점은 넣고, 대응 방안 · 충족 여부 · 성과 수치는 `[대응 방안]` · `[00]%` 로 둔다.
- 원문 · 카탈로그에 없는 숫자는 쓰지 않는다(LLM 이 쓴 칸은 거부하고 규칙 결과 유지). 샘플 문구에 남은 샘플 숫자도 `[00]` 으로.
- 편집 가능한 칸(data-tb)에서는 샘플 고객(A 커피 · T 은행 …) · 다른 업종 표현 · 카탈로그 밖/연결 안 된 제품명 · 솔루션명(같은 역할의 연결 솔루션으로만 교체)을 남기지 않는다. **단, data-tb 밖 고정 문구(280개 레이아웃)는 바꿀 수 없다** — 검토 리포트에 표시.
- 슬라이드가 답하는 고객 요구가 화면에 하나도 안 보이면 부제(subhead)에 요구 원문을 싣는다(요구 닻).
- Gemini 가 켜지면 같은 칸 목록 + 확인된 정보로 문장을 다시 쓰고, 근거 없는 숫자 · 샘플 고객명 · 다른 업종 표현 · 카탈로그 밖 제품이 남은 칸은 받지 않는다.
- 같은 입력이면 실행마다 같은 결과(집합 순서에 기대지 않음 — `PYTHONHASHSEED` 를 바꿔도 42 TC 결과 동일).

## 평가

```bash
python eval/make_cases.py                                   # TC 생성(cases 30 · holdout 6 · holdout2 6)
python eval/run_eval.py --llm offline --name myrun --render # → eval/reports/myrun/summary.md · metrics.json · cases/*/preview.html
python eval/run_eval.py --llm gemini  --name live-v1        # Gemini 로 같은 평가
pytest -q                                                   # 49개 회귀 테스트(LLM 병합 경로는 가짜 모델로)
python eval/run_eval.py --llm gemini --only C01_,C02_ --name live-b1   # Gemini 는 TC 몇 개씩 나눠 돌리고
python eval/merge_reports.py --out live-cases live-b1 live-b2 ...     # 하나의 리포트로 합칠 수 있다
WINMATE_METRICS=legacy python eval/run_eval.py ...          # v13 까지의 느슨한 지표 정의로 채점(비교용)
```

- **TC = 10 case × 3 복잡도**: 업종 10종(FB · OF · HT · FN · ED · MF · RT · RS · SV · MD), 전략 7종 모두 포함. C04_L3 은 실제 신한은행 모니터 980대 RFP 원문.
- gold: 맥락 · 업종 · 시나리오(①표준 id ②Best id ③전략) · 필수 파트 · 기대 장표 · 핵심 요구(키워드 · 답해야 할 파트) · 사용해야 할 원문 수치 · (③) 기준 · 충돌 · 질문 수 · 평가 구조
- 지표: 맥락/업종/시나리오 정확도, 필수 파트, 흐름, 우선순위, 장표 유형 일치, 기대 장표, 위반(타 업종 · 미연결 솔루션 · 중복), 핵심 요구 추출 · 연결 · **슬라이드 글자에 반영**, 필수 요구 커버, 원문 수치 사용, 채우기 청결, **stray(독립 검사 — 최종 화면에 고르지 않은 제품 · 솔루션 이름이 없는가)**, (③) 기준 · 충돌 · 질문 · 평가 구조
- 주의: flow · layout_part · violations · fill_clean 은 파이프라인 자체 검사 결과를 그대로 쓴다(스스로 채점). 그래서 v14 에 독립 검사(stray)를 더하고 반영 · 수치 지표를 슬라이드 글자만 보도록 엄격하게 바꿨다. 지표가 못 잡는 값 입력 품질은 미리보기를 눈으로 본다.
- 결과(v14 엄격 지표):

  | 백엔드 | cases (30) | holdout (6) | holdout2 (6) | 비고 |
  |---|---|---|---|---|
  | 오프라인(결정론) | 0.989 | 0.994 | 0.991 | 예전 지표로는 0.992 · 0.994 · 0.994 |
  | Gemini live1 | 0.968 | 0.971 | 0.968 | 첫 live 실행 — LLM 병합 경로 약점 발견 |
  | **Gemini live2** | **0.988** | **0.991** | **0.986** | 병합 보강 후 · 1,190회 호출 실패 0 · TC 당 약 24초 |

  블라인드로 볼 수 있는 수치는 holdout2 **첫 실행 0.968**(오프라인, ③ 0.920) 하나뿐이다 — 그 뒤 수치는 그 세트를 보고 고친 결과. Gemini 결과는 실행마다 조금씩 다르다. 반복별 변경은 [`eval/ITERATIONS.md`](eval/ITERATIONS.md).

미리보기로 결과를 바로 보려면: `eval/reports/live-gemini-cases/cases/C04_L3/preview.html`(Gemini) · `eval/reports/final-cases/cases/C04_L3/preview.html`(오프라인). 다시 그리기만 할 때는 `python eval/rerender.py <리포트 이름>` (LLM 호출 없음).

## 출력
- `preview.html` — 맥락 판정 · 검토 이슈 · 제출 체크리스트 · 시나리오 후보 · (③) 분해/질문/답 · 요구→파트 추적표 · storyboard 우선순위 · 채운 슬라이드 미리보기(대안 장표 · 채운 칸 수 · 자리표시 수)
- `proposal.app.json` — winmatev2 `store.js` 제안서 모양(파트 · 레이아웃 f · `ov.t` 텍스트 · `ov.img`) — 앱 localStorage 에 넣어 바로 편집 · PPTX 내보내기
- `report.md`(storyboard · 검토 이슈 · 전략 인터뷰 결과 · 제출 체크리스트) · `state.json`

## 파일
```
winmate_layout/  analysis · scenarios · decompose · strategy · storyboard · retrieval · layout_design · fill · tables · review · graph
                 strategy_agent(deepagents) · llm(Gemini/offline) · metadata · slots · kb · render · schemas · text · __main__(CLI)
scripts/         sync_source.py(winmatev2 → data/source) · build_metadata.py · build_standard_scenarios.py
data/            source/(catalog · layout_html.json.gz · parts · best_scenarios · images) · layout_cards.jsonl · standard_scenarios.json
eval/            make_cases.py · cases/ · holdout/ · holdout2/ · metrics.py · run_eval.py · ITERATIONS.md · reports/
tests/           test_pipeline.py · test_llm_paths.py
```
본 앱(winmatev2 루트는 img/ · src/ 가 있는 가장 가까운 상위 폴더로 찾는다) 데이터가 바뀌면 `python scripts/sync_source.py && python scripts/build_metadata.py && python scripts/build_standard_scenarios.py`.

## 한계
- Gemini 경로는 42 TC 전부와 deepagents 전략 코파일럿 대화(스크립트 3턴)를 실제로 돌려 확인했다. 단 TC 는 이 프로젝트를 만들면서 쓴 것이라, 실제 고객 RFP 로 더 돌려 봐야 한다.
- 규칙 기반 값 입력은 서술 문장을 새로 쓰지 않는다(자리표시) — 문장 품질은 Gemini 채우기 몫.
- 원본 레이아웃 280개에 data-tb 밖 샘플 문구가 있어 어떤 방식으로도 바뀌지 않는다(원본 보완 필요).
- 오프라인 값 입력은 표 · 숫자 · 요구 원문은 채우지만 효과 수치의 '지금 / 도입 후' 값, 대응 방안 문장은 자리표시로 남긴다.
- C04_L3(신한은행 27인치 RFP) TC 의 제품은 카탈로그에 27인치 모니터가 없어 S32DM80(32")이다 — 검토가 high 이슈로 알린다(실제 제안이면 모델 확인 필요).
- 미리보기의 제품 사진은 `winmatev2/img/` 를 상대 경로로 읽는다.
