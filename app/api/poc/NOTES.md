# app/api/poc — PoC 기반 기능 백엔드

`poc/test` 의 원본 모듈을 **수정 없이** 실제 경로에서 import 해 RFP 정리 · Layout Agent · RAG 검색 · 제안서 검토 · Storyboard 이어 쓰기 · 범용 `/api/llm` 을 제공합니다. 원본 디렉터리에는 아무것도 쓰지 않습니다(`sys.dont_write_bytecode`, testbench 미사용, 캐시는 기본 꺼짐 · 켜면 `app/data/runtime` 만).

## 통합 구조

```python
from app.api.poc.routes import router as poc_router, initialize as poc_initialize, capabilities as poc_capabilities

app.include_router(poc_router)        # 기존 main.py 의 더미 POST /api/llm 보다 먼저 등록하거나, 기존 라우트를 지우세요
# lifespan 안에서
poc_initialize()                      # 설정(런타임) · import 점검 · KB 검증 · 카드/인덱스 백그라운드 준비
# /api/bootstrap 이나 /api/health 에 poc_capabilities() 를 넣을지는 통합하는 쪽에서 결정
```

KB 스냅샷은 서버 시작 전에 한 번 만듭니다(카탈로그 · 템플릿이 바뀔 때마다 다시):

```bash
node app/scripts/export_agent_data.mjs        # → app/data/runtime/kb/* (manifest 는 마지막에 씀)
```

## 플래그

| 키 | 값 | 설명 |
|---|---|---|
| `WINMATE_MODE` | `dummy`(기본) · `real` | 전체 기본값 |
| `WINMATE_RFP_MODE` · `WINMATE_LAYOUT_MODE` · `WINMATE_SEARCH_MODE` · `WINMATE_REVIEW_MODE` · `WINMATE_STORYBOARD_MODE` · `WINMATE_PART_MODE` · `WINMATE_FILL_MODE` · `WINMATE_SIMULATION_MODE` · `WINMATE_LLM_MODE` | `dummy` · `real` | 기능별 덮어쓰기 |
| `GEMINI_API_KEY` · `GEMINI_MODEL` · `GEMINI_QUICK_MODEL` · `GEMINI_BASE_URL` | | 서버 전용. 응답 · 로그 · 예외 문자열에 넣지 않음 |
| `WINMATE_GEMINI_TIMEOUT` · `WINMATE_GEMINI_RPM` | 120 · 30 | |
| `WINMATE_LLM_CACHE` · `WINMATE_KB_CACHE` | `off`(기본) | 켜면 `app/data/runtime/{llm-cache,kb/layout_cards.*.jsonl}` |
| `WINMATE_ENV_FILES` | `app/.env,poc/.env`(기본) · `none` | 읽을 .env 목록. 우선순위 os.environ > app/.env > poc/.env. `os.environ` 에 복사하지 않음 |

- `dummy`: 작업을 만들지 않고 `{mode:'dummy', error:'unavailable', ...}`(HTTP 200)를 돌려줍니다 → 프런트가 기존 규칙으로 처리.
- `real`: PoC 파이프라인을 실행. 키가 있으면 Gemini + 단계별 규칙 대체, 없으면 규칙만(`llm.reason = 'no_api_key'`).
- 요청에 `offline: true` 를 주면 기능 모드 · 키와 관계없이 **실제 PoC 규칙**만 실행합니다(외부 호출 없음). 테스트용.
- 요청에 `llm: false` 를 주면 real 모드에서도 규칙만.

모든 결과의 `llm` 블록: `requested`(real · offline) · `effective`(`llm` · `mixed` · `rules`) · `llm_used` · `calls_ok` · `calls_failed` · `fallbacks[{step, fallback, code, message}]` · `reason` · `model`(성공 호출이 있을 때만). `effective` 는 **실제로 성공한 모델 호출**로만 정합니다.

## 엔드포인트

| | |
|---|---|
| `GET /api/poc/capabilities` | 기능별 모드 · 실제 동작 · KB 검증 결과 · 개수 · 경고 · provider 사용량(비밀 없음) |
| `POST /api/jobs` | `{kind:'rfp', text, condition?, max_chars?, title?}` · `{kind:'layout', input: ProposalInput, interactive?, answers?, force_level?, max_slides?, include_html?}` · `{kind:'storyboard', proposal, mode?:'continue'\|'redesign', strategy?, temperature?, seed?}` · `{kind:'review', doc \| proposal, context?, budget?, min_k?}` + 공통 `offline?`, `llm?` → 202 작업 스냅샷 |
| `GET /api/jobs/{id}?since=N` | 폴링. `events`(seq > N), `next_seq`, `first_seq`, `truncated`, `status`, `waiting`, `partial`, `result`, `error`, `llm` |
| `GET /api/jobs/{id}/events` | SSE. `event: text|state|result`, `id: seq`, `?since=N` 또는 `Last-Event-ID` 로 이어 받기 |
| `POST /api/jobs/{id}/answer` | `{answers:{질문 id: 값}, use_defaults?:true}` — 질문 id 검증, 값은 문자열 · 숫자(2000자 이하). waiting 이 아니면 409 |
| `POST /api/jobs/{id}/cancel` | 단계 사이에서 멈춤. queued · waiting 은 즉시 cancelled |
| `POST /api/layouts/search` | `{q, part?, industry?, products?, solutions?, strategy?, k?, level?}` — BM25 + TF-IDF + PoC 메타 적합도(결정론, 키 불필요) |
| `POST /api/llm` | `{kind:'json'\|'text', prompt \| turns, model_tier?, images?, stream?}` — JSON 또는 SSE(`requestCompletion` 프로토콜: 누적 `{type:'text',text}` → `{type:'result',data\|text}` 또는 `{type:'error',code,message}`). 프런트 sample 어댑터는 `stream:true`로 누적 텍스트와 최종 결과를 받습니다. 더미·연결 불가는 JSON으로 응답합니다 |

작업은 서버 스레드가 소유하므로 탭을 옮겨도 계속됩니다. 메모리 보관(재시작하면 사라짐), 종료된 작업만 오래된 순으로 정리, 24시간 넘게 답을 기다린 작업은 `cancelled(expired)` 로 닫습니다.

## 설계 메모

- **Provider 일원화**: `provider.GeminiProvider` 하나가 RFP · score · storyboard · layout · `/api/llm` 의 모든 Gemini 호출을 처리. 키는 `x-goog-api-key` 헤더로만. PoC 세 백엔드의 재시도 규칙(429/5xx 백오프, 400+schema → 스키마 없이 재시도, MAX_TOKENS/반복 폭주 → 온도 0.6 → 0.9, JSON 파싱 1회 재시도, thought 파트 무시)을 합침.
- **PoC 계약 유지**(`backends.py`): RFP `complete(stage, system, user, meta)` · `rp.SCHEMAS[stage]` · 상한 2048/8192/12288(single 32768) · 온도 0.1 · `rp.CallLog`; score 위치 인자 schema · 온도 0.0 · 8192 · `CallLog.tag`; storyboard 키워드 전용 `schema/temperature/seed/max_tokens`; 각 모듈 고유 `BackendError` 로 변환. Layout 은 `LLM('offline')` 으로 만든 뒤 provider 위의 LangChain 모양 파사드를 붙여 PoC `structured()`(구조화 출력 → JSON 텍스트 대체 → None → 규칙, `trace`)를 그대로 씀.
- **RFP 대체**: profile · extract · gapfill 실패는 그 단계만 `rp.RulesBackend` 로 대체(기록). consolidate 실패는 `rp.BackendError` 로 올려 PoC 자체의 규칙 통합(`stats.consolidate_fallback`)을 씀.
- **정본 KB**(`knowledge.py`): `CanonicalLayoutKB(winmate_layout.kb.KB)` · `CanonicalStoryKB(sbagent.kb.KB)` — 명시적 `__init__`, `html/cards/standard_scenarios/std_rules` 재정의, 카드는 `metadata.build_cards(kb)`. PoC 모듈 전역 `SRC/DATA` 는 건드리지 않음. Layout `P` = 1,068개 전체, Analyzer 가 쓰는 `products` = 큐레이션 40 + 요청에서 선택한 제품(일반 제품명 오탐 방지). Storyboard 는 1,068개 전체. 숨김 업종 표지는 HTML · `hidden_layouts` 에만(추천 후보에서 제외 — PoC 의미 유지).
- **런타임 고정**(이 프로세스만): `winmate_layout.config` 를 import 하는 동안 dotenv 를 no-op 으로 바꾸고(PoC .env 미로딩), 이후 `GEMINI_API_KEY=''`, `LLM_MODE='offline'`, `DENSE_MODE='tfidf'`, `CACHE_DIR=app/data/runtime/cache/layout` 으로 고정 → PoC 코드가 직접 Gemini · 임베딩을 부르지 않음.

## 제한 사항 · 남겨 둔 원본 문제 (원본은 수정하지 않음)

1. **RFP 파일 추출은 브라우저 몫**: 서버는 텍스트만 받습니다. PoC 분할기는 마크다운 제목 · 표에 맞춰져 있어 PDF 평문은 길이 기준으로만 잘립니다. HWP 미지원. Tavily `enrich` 미지원(422).
2. **Layout Agent**: copilot(deepagents)은 이번 범위 밖(`AppLayoutLLM.chat_model` 은 provider 의 LangChain 모델을 돌려줄 준비만 됨). 그래프 체크포인트는 메모리(`InMemorySaver`) — 재시작하면 waiting 작업을 이어 갈 수 없습니다. 레이아웃 노드는 병렬이라 실패한 LLM 단계만 규칙으로 대체되고 `effective='mixed'` 로 표시됩니다.
3. **review(doc.units)**: 업로드 문서는 앱 렌더링 측정값이 없습니다 — 넘침 · 빈 이미지 칸 · 단계 정보가 없고 파트는 제목으로 추정(`parts.js` NAME_RULES 이식). PDF/DOCX/TXT 는 위치가 근사(읽기 순서)라 `conversion.unreliable_criteria` 에 표시합니다. 앱 덱을 정확히 평가하려면 `tools/export_entry.jsx:readSheet` 같은 DOM 측정기를 웹에 옮겨 `proposal.sheets` 로 보내야 합니다. 평가 기준은 PoC `criteria.json`/`taxonomy.json`(앱 `criteria.js` 와 다를 수 있음).
4. **Storyboard**: PoC `design()` 은 `options.mode` 를 쓰지 않음 → `redesign` 은 어댑터가 덱 외 파트를 비워서 구현. 결과는 스트리밍이 아니라 한 번에 돌아옵니다(현재 `aiStoryboard` 의 점진 표시와 다름).
5. **시뮬레이션**: 대화형 고객 턴은 앱 엔진이 `/api/llm` 으로 처리합니다. `sim_eval`(Node 배치)은 노출하지 않습니다 — Gemini 주소가 하드코딩돼 이 provider 로 묶을 수 없음.
6. **원본 의심 버그(그대로)**: `review.spec_mismatches` 가 DB 사양 "43형" 표기를 못 잡음 · `llm._extract_json` 이 JSON 뒤 텍스트에 약함 · `rfp_pipeline.GeminiBackend` 캐시 키에 온도/스키마 없음(이 서버는 그 백엔드를 쓰지 않음) · testbench `answer` 경쟁 조건(이 서버는 잠금으로 막음) · `sim._spawn` SIGINT 종료 코드 처리 · `export_entry.jsx`/`sync_source.py` 가 옛 루트 `src/` 를 참조.
7. **자동 제품 탐지 범위**: Layout 추천을 40개 큐레이션 + 선택한 DB 제품으로 제한합니다. 일반 DB 제품명 오탐을 줄이기 위한 기준이며 전체 자동 추천으로 확대하려면 별도 평가가 필요합니다(capabilities.notes 에 공개).
8. **SSE 연결 끊김**: `/api/llm` 스트림은 클라이언트가 끊어도 진행 중인 상류 요청을 즉시 중단하지 못할 수 있습니다(다음 청크에서 종료).
9. **KB 신선도**: `manifest.inputs` 해시와 현재 원천 파일이 다르면 `capabilities.knowledge.warnings` 에 표시만 합니다(자동 재생성 없음).

## 테스트

```bash
node app/scripts/export_agent_data.mjs
python -B -m pytest app/tests/test_poc_adapters.py -q        # 또는 python -B -m unittest app.tests.test_poc_adapters -v
```

네트워크 차단(socket patch) 상태에서 실행되며, `WINMATE_ENV_FILES=none` 으로 .env 를 읽지 않습니다. 마지막 테스트가 `poc/` 트리(크기 · mtime)가 바뀌지 않았는지 확인합니다.

선택: 실제 모델 smoke(직접 실행, 비용 발생) — `WINMATE_MODE=real` + 키를 둔 뒤 `/api/llm`(json 1회), RFP 짧은 텍스트 1건, Layout `max_slides=3` 1건, review 1건, storyboard 1건 정도로 `llm.effective == 'llm'|'mixed'` 와 토큰 수를 확인하세요.

10. `max_slides`는 원본 PoC의 장수 목표입니다. 필수 요구 연결 파트·표지·마무리가 우선해 목표를 초과할 수 있습니다. 어댑터는 결과를 자르지 않고 warnings와 진행 로그에 실제 장수를 알립니다.
