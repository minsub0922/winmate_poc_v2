# app/api/poc — PoC 기반 기능 백엔드

`poc/test` 의 원본 모듈을 **수정 없이** 실제 경로에서 import 해 RFP 정리 · Layout Agent · RAG 검색 · 제안서 검토 · Storyboard 이어 쓰기 · 범용 `/api/llm` 을 제공합니다. 원본 디렉터리에는 아무것도 쓰지 않습니다(`sys.dont_write_bytecode`, testbench 미사용, 캐시는 기본 꺼짐 · 켜면 `app/data/runtime` 만).

## 통합 구조

```python
from app.api.poc.routes import router as poc_router, initialize as poc_initialize, capabilities as poc_capabilities

app.include_router(poc_router)
# lifespan 안에서
poc_initialize()                      # 설정 · Gemini provider 확인(없으면 PocStartupError) · import 점검 · KB 검증 · 카드/인덱스 백그라운드 준비
# /api/bootstrap 이나 /api/health 에 poc_capabilities() 를 넣을지는 통합하는 쪽에서 결정
```

KB 스냅샷은 서버 시작 전에 한 번 만듭니다(카탈로그 · 템플릿이 바뀔 때마다 다시):

```bash
node app/scripts/export_agent_data.mjs        # → app/data/runtime/kb/* (manifest 는 마지막에 씀)
```

## 설정 (엄격한 실제 실행 — 상세 계약은 `STRICT.md`)

모든 AI 기능은 서버 Gemini 로만 실행합니다. 더미 모드 · 기능별 스위치 · `offline` · `llm:false` · 규칙 대체 결과가 없습니다.

| 키 | 값 | 설명 |
|---|---|---|
| `WINMATE_MODE` · `WINMATE_<FUNC>_MODE` | (무시) | 예전 설정. `real` 이 아닌 값은 따르지 않고 `settings.legacy_ignored` · `warnings` 와 시작 로그에 표시 |
| `GEMINI_API_KEY` | **필수** | 없으면 `initialize()` 가 `PocStartupError`, 모든 AI 요청은 503 `no_api_key` |
| `GEMINI_MODEL` · `GEMINI_QUICK_MODEL` · `GEMINI_BASE_URL` | | 서버 전용. 응답 · 로그 · 예외 문자열에 넣지 않음. 검색 rerank 는 quick 모델 |
| `WINMATE_GEMINI_TIMEOUT` · `WINMATE_GEMINI_RPM` | 120 · 30 | |
| `WINMATE_LLM_CACHE` · `WINMATE_KB_CACHE` | `off`(기본) | 켜면 `app/data/runtime/{llm-cache,kb/layout_cards.*.jsonl}` |
| `WINMATE_ENV_FILES` | `app/.env,poc/.env`(기본) · `none` | 읽을 .env 목록. 우선순위 os.environ > app/.env > poc/.env. `os.environ` 에 복사하지 않음 |

- 요청의 `offline`(false 외) · `llm`(true 외) · `mode`(real 외, storyboard 의 continue/redesign 제외)는 422 `unsupported_option`.
- Gemini 단계가 provider 재시도 후에도 실패하면 작업은 `status:'error'`, `error:{code, message, step, retryable, provider_code, detail}` 로 끝납니다. 동기 엔드포인트는 4xx/5xx(429 · 502 · 503 · 504 · 422). 규칙 결과로 성공 처리하지 않습니다.

모든 결과의 `llm` 블록: `requested:'real'` · `effective:'llm'` · `strict:true` · `llm_used` · `calls_ok` · `calls_failed` · `calls_rejected` · `steps{단계: 횟수}` · `tokens` · `fallbacks:[]` · `model`. `calls_ok` 는 **실제로 성공한 Gemini 호출 수**입니다.

## 엔드포인트

| | |
|---|---|
| `GET /api/poc/capabilities` | 기능별 `effective`(`llm` · `unavailable`) · 준비 상태 · KB 검증 결과 · 개수 · 경고 · provider 사용량 · 검색 캐시 통계(비밀 없음) |
| `POST /api/jobs` | `{kind:'rfp', text, condition?, max_chars?, title?}` · `{kind:'layout', input: ProposalInput, interactive?, answers?, force_level?, max_slides?, include_html?}` · `{kind:'storyboard', proposal, mode?:'continue'\|'redesign', strategy?, temperature?, seed?}` · `{kind:'review', doc \| proposal, context?, budget?, min_k?}` → 202 작업 스냅샷 (키 없음 503 · 예전 옵션 422) |
| `GET /api/jobs/{id}?since=N` | 폴링. `events`(seq > N), `next_seq`, `first_seq`, `truncated`, `status`, `waiting`, `partial`, `result`, `error`, `llm` |
| `GET /api/jobs/{id}/events` | SSE. `event: text|state|result`, `id: seq`, `?since=N` 또는 `Last-Event-ID` 로 이어 받기 |
| `POST /api/jobs/{id}/answer` | `{answers:{질문 id: 값}, use_defaults?:true}` — 질문 id 검증, 값은 문자열 · 숫자(2000자 이하). waiting 이 아니면 409 |
| `POST /api/jobs/{id}/cancel` | 단계 사이에서 멈춤. queued · waiting 은 즉시 cancelled |
| `POST /api/layouts/search` | `{q, part?, industry?, products?, solutions?, strategy?, k?, level?}` — BM25 + TF-IDF + PoC 메타 적합도로 후보를 뽑고 상위 20개를 Gemini 가 재정렬(`engine:'bm25+tfidf+gemini'`). 정확한 코드 일치는 맨 앞 고정. 같은 요청은 TTL 캐시 · 동시 요청 합치기 |
| `POST /api/llm` | `{feature, kind:'json'\|'text', prompt \| turns, model_tier?, images?, stream?, schema?}` — JSON 또는 SSE(`requestCompletion` 프로토콜: 누적 `{type:'text',text}` → `{type:'result',data\|text}` 또는 `{type:'error',code,message,retryable}`). `feature` 필수. `schema` 는 `responseSchema` 로 보내고 서버에서 결과를 검증. 키 없음 503, 시작 전 실패는 HTTP 오류 |

작업은 서버 스레드가 소유하므로 탭을 옮겨도 계속됩니다. 메모리 보관(재시작하면 사라짐), 종료된 작업만 오래된 순으로 정리, 24시간 넘게 답을 기다린 작업은 `cancelled(expired)` 로 닫습니다.

## 설계 메모

- **Provider 일원화**: `provider.GeminiProvider` 하나가 RFP · score · storyboard · layout · `/api/llm` 의 모든 Gemini 호출을 처리. 키는 `x-goog-api-key` 헤더로만. PoC 세 백엔드의 재시도 규칙(429/5xx 백오프, 400+schema → 스키마 없이 재시도, MAX_TOKENS/반복 폭주 → 온도 0.6 → 0.9, JSON 파싱 1회 재시도, thought 파트 무시)을 합침.
- **PoC 계약 유지 · 엄격 실패**(`backends.py`): RFP `complete(stage, system, user, meta)` · `rp.SCHEMAS[stage]` · 상한 2048/8192/12288(single 32768) · 온도 0.1 · `rp.CallLog`; score 위치 인자 schema · 온도 0.0 · 8192 · `CallLog.tag`; storyboard 키워드 전용 `schema/temperature/seed/max_tokens`. 실패는 PoC `BackendError` 가 아니라 `jobs.ModelFailure` 로 올려 PoC 의 규칙 대체(`RulesBackend._consolidate` · 라우터 `_route_rules` · `rules-fallback` 점수 · `rules_plan`)에 닿지 않습니다. `RulesBackend`/`OfflineBackend` 는 만들지 않습니다. Layout 은 `LLM('offline')` 으로 만든 뒤 provider 파사드를 붙이고, `structured()` 를 덮어써 구조화 출력 → JSON 재질문(둘 다 실제 호출) 후 실패하면 None 대신 예외를 올립니다.
- **출력 검증**: review 채점은 요청한 기준 id 가 모두 1~3점인지, 라우팅은 relevance/priority 가 정수인지 PoC 가 읽기 전에 확인하고 1회 다시 묻습니다. 끝난 뒤 `route.mode`/`scores[].mode` 가 모두 `llm` 이어야 합니다. RFP 는 `consolidate_fallback`, Storyboard 는 `out.llm`, Layout 은 `analysis.llm` 으로 실제 호출을 확인합니다.
- **정본 KB**(`knowledge.py`): `CanonicalLayoutKB(winmate_layout.kb.KB)` · `CanonicalStoryKB(sbagent.kb.KB)` — 명시적 `__init__`, `html/cards/standard_scenarios/std_rules` 재정의, 카드는 `metadata.build_cards(kb)`. PoC 모듈 전역 `SRC/DATA` 는 건드리지 않음. Layout `P` = 1,068개 전체, Analyzer 가 쓰는 `products` = 큐레이션 40 + 요청에서 선택한 제품(일반 제품명 오탐 방지). Storyboard 는 1,068개 전체. 숨김 업종 표지는 HTML · `hidden_layouts` 에만(추천 후보에서 제외 — PoC 의미 유지).
- **런타임 고정**(이 프로세스만): `winmate_layout.config` 를 import 하는 동안 dotenv 를 no-op 으로 바꾸고(PoC .env 미로딩), 이후 `GEMINI_API_KEY=''`, `LLM_MODE='offline'`, `DENSE_MODE='tfidf'`, `CACHE_DIR=app/data/runtime/cache/layout` 으로 고정 → PoC 코드가 직접 Gemini · 임베딩을 부르지 않음.

## 제한 사항 · 남겨 둔 원본 문제 (원본은 수정하지 않음)

1. **RFP 파일 추출은 브라우저 몫**: 서버는 텍스트만 받습니다. PoC 분할기는 마크다운 제목 · 표에 맞춰져 있어 PDF 평문은 길이 기준으로만 잘립니다. HWP 미지원. Tavily `enrich` 미지원(422).
2. **Layout Agent**: copilot(deepagents)은 이번 범위 밖(`AppLayoutLLM.chat_model` 은 provider 의 LangChain 모델을 돌려줄 준비만 됨). 그래프 체크포인트는 메모리(`InMemorySaver`) — 재시작하면 waiting 작업을 이어 갈 수 없습니다. 레이아웃 노드는 병렬이라 한 노드가 실패하면 그 시점에 작업 전체가 error 로 끝납니다(이미 끝난 병렬 노드의 호출은 `llm.calls_ok` 에 남음). 후보 밖 f 를 고른 LLM 선택은 PoC 검증대로 무시됩니다(규칙 대체가 아니라 후보 검증).
3. **review(doc.units)**: 업로드 문서는 앱 렌더링 측정값이 없습니다 — 넘침 · 빈 이미지 칸 · 단계 정보가 없고 파트는 제목으로 추정(`parts.js` NAME_RULES 이식). PDF/DOCX/TXT 는 위치가 근사(읽기 순서)라 `conversion.unreliable_criteria` 에 표시합니다. 앱 덱을 정확히 평가하려면 `tools/export_entry.jsx:readSheet` 같은 DOM 측정기를 웹에 옮겨 `proposal.sheets` 로 보내야 합니다. 평가 기준은 PoC `criteria.json`/`taxonomy.json`(앱 `criteria.js` 와 다를 수 있음).
4. **Storyboard**: PoC `design()` 은 `options.mode` 를 쓰지 않음 → `redesign` 은 어댑터가 덱 외 파트를 비워서 구현. 결과는 스트리밍이 아니라 한 번에 돌아옵니다(현재 `aiStoryboard` 의 점진 표시와 다름).
5. **시뮬레이션**: 대화형 고객 턴은 앱 엔진이 `/api/llm` 으로 처리합니다. `sim_eval`(Node 배치)은 노출하지 않습니다 — Gemini 주소가 하드코딩돼 이 provider 로 묶을 수 없음.
6. **원본 의심 버그(그대로)**: `review.spec_mismatches` 가 DB 사양 "43형" 표기를 못 잡음 · `llm._extract_json` 이 JSON 뒤 텍스트에 약함 · `rfp_pipeline.GeminiBackend` 캐시 키에 온도/스키마 없음(이 서버는 그 백엔드를 쓰지 않음) · testbench `answer` 경쟁 조건(이 서버는 잠금으로 막음) · `sim._spawn` SIGINT 종료 코드 처리 · `export_entry.jsx`/`sync_source.py` 가 옛 루트 `src/` 를 참조.
7. **자동 제품 탐지 범위**: Layout 추천을 40개 큐레이션 + 선택한 DB 제품으로 제한합니다. 일반 DB 제품명 오탐을 줄이기 위한 기준이며 전체 자동 추천으로 확대하려면 별도 평가가 필요합니다(capabilities.notes 에 공개).
8. **SSE 연결 끊김**: `/api/llm` 스트림은 클라이언트가 끊어도 진행 중인 상류 요청을 즉시 중단하지 못할 수 있습니다(다음 청크에서 종료).
9. **KB 신선도**: `manifest.inputs` 해시와 현재 원천 파일이 다르면 `capabilities.knowledge.warnings` 에 표시만 합니다(자동 재생성 없음).

10. **검색 rerank 범위**: 상위 20개만 Gemini 가 재정렬합니다(`k` 가 20보다 크면 나머지는 검색 순서). rerank 는 동기 POST 라 요청 중 취소는 클라이언트 연결 종료로만 가능하고, 진행 중인 상류 호출은 끝까지 갑니다. 캐시는 프로세스 메모리(재시작하면 사라짐).
11. **스트림 + schema**: 스트리밍도 `schema` 를 provider 에 넘기고 최종 텍스트를 서버에서 schema 로 검증합니다. 프레임을 보낸 뒤라 다시 묻지 않고 `{type:'error'}` 로 끝냅니다(비스트리밍만 1회 재질문).
12. **엄격 실패의 비용**: Storyboard 수리(repair) 호출 실패 · review 의 기준 누락(재질문 후)도 작업 실패로 처리합니다 — 규칙 점수/초안을 성공으로 내보내지 않기 위한 의도된 동작입니다.

## 테스트

테스트 · 실제 호출 검증은 부모 작업이 담당합니다(기능별 실제 Gemini 10건 이상). `provider.set_provider_override(fake)` 로 provider 를 바꾸거나 `initialize(require_provider=False)` 로 시작 검사를 끌 수 있습니다. 네트워크 없는 단위 테스트는 더 이상 규칙 결과를 기대할 수 없습니다 — 가짜 provider 응답이나 503/422/ModelFailure 경로를 검증하세요.

13. `max_slides`는 원본 PoC의 장수 목표입니다. 필수 요구 연결 파트·표지·마무리가 우선해 목표를 초과할 수 있습니다. 어댑터는 결과를 자르지 않고 warnings와 진행 로그에 실제 장수를 알립니다.
