# 사내 모델 연결 — GaussLLM · ClefDecision

이 폴더는 **사내망에서만 있는 코드**의 자리다. git 은 이 README 말고는 이 폴더를 무시한다(`.gitignore`).
사내망에서는 push 가 안 되므로, 사내 API 규격이 든 코드는 여기에만 두고 **git 이 추적하는 파일은 고치지 않는다** — 그래야 `git pull` 이 늘 충돌 없이 된다.

| 파일 | 클래스 | 하는 일 | 앱에서 쓰는 곳 |
|---|---|---|---|
| `gauss.py` | `GaussLLM(InhouseLLM)` | 사내 LLM(Gauss) 요청 만들기 · 응답 읽기 | `WINMATE_LLM_PROVIDER=internal`, 관리자 Provider 탭 「사내 LLM」 |
| `clef.py` | `ClefDecision(InhouseDecision)` | 사내 Decision(CLEF) 서버 목록 · 질문 보내기 | Decision 순서 칸 `inhouse`, 관리자 Provider 탭 「CLEF (사내)」 |

- 계약(입력 · 출력 · 메서드 이름): [`app/api/llm/inhouse_contract.py`](../inhouse_contract.py). 두 클래스는 거기의 기반 클래스를 상속한다.
- 서버는 설정을 읽을 때 **파일 → 클래스 → 계약 검사 → 필수 키(`REQUIRED_ENV`)** 순서로 확인하고, 모두 있으면 그 연결을 쓴다. 없으면 기존 동작 그대로다.
- 같은 폴더의 다른 파일(예: `common.py`, `clef_remote.py`)은 상대 import 로 쓴다: `from . import common`. 폴더 전체가 패키지 `winmate_inhouse` 로 올라간다.
- 폴더를 옮기려면 루트 `.env` 에 `WINMATE_INHOUSE_DIR=<경로>`.

## 사내망 코드 에이전트 작업 규칙

1. **이 폴더 밖의 git 추적 파일은 고치지 않는다.** 필요한 것은 이 폴더의 파일, 루트 `.env`(git 제외), `admin/runtime/`(git 제외)로 해결한다.
2. 파일 · 클래스 이름은 위 표 그대로. 메서드 이름 · 입력 · 출력은 계약 파일 그대로 — 사내 API 에 맞추는 일은 **클래스 안에서** 한다.
3. 키 · 토큰 값은 코드에 쓰지 않는다. 루트 `.env` 에 둔다. `INTERNAL_` · `GAUSS_` · `CLEF_` · `INHOUSE_` 로 시작하는 키는 모두 `self.ctx.env` 로 들어온다(다른 이름이면 `OPTIONAL_ENV` 에 적는다).
4. 클래스 안에서 HTTP 를 직접 보내지 않는다(GaussLLM). 요청은 `build()` 가 만들고, 보내기 · 공용 큐(분당 42회) · 재시도 · 제한 시간 · 취소 · 대체 · 사용량 기록은 git 쪽이 한다. ClefDecision 은 터널 · 프록시 때문에 `answer()` 가 직접 보낸다.
5. 다 만들면 확인 명령이 모두 PASS 여야 한다:
   ```bash
   app/.venv/bin/python -m app.api.llm.inhouse_bridge check          # 파일 · 클래스 · 키 · 요청 모양 (네트워크 없음)
   app/.venv/bin/python -m app.api.llm.inhouse_bridge check --live   # 실제 호출: 텍스트 · JSON · 이미지 · 스트림 · 검색 · Decision
   ```
6. 그다음 `make restart`, 관리자 `/admin` → Provider 탭에서 「사내 LLM」 · 「CLEF (사내)」 를 켜고 **대표로**. 카드의 「지금 점검」 · 실험으로 한 번 더 확인한다.
   (`.env` 로 정해 두려면: `WINMATE_LLM_PROVIDER=internal`, `WINMATE_DECISION_ORDER=inhouse`)

## 이미 원격에서 추적 파일을 고쳐 둔 경우 (옮기는 순서)

예: `app/api/llm/adapters.py` 의 `InternalAdapter` 에 Gauss 규격을 넣었고, `app/api/poc/settings.py` 에 `internal_client_key` 등을 더했고, `admin/clef_remote.py` · `admin/clef_route.py` 로 CLEF 를 부르는 경우.

1. **백업**: `git diff > ~/inhouse-before.patch`, 새로 만든 파일(`admin/clef_remote.py` 등)과 `app/.env` · `poc/.env` 를 따로 복사해 둔다. 로컬 커밋이 있으면 `git branch backup/inhouse` 로 남긴다.
2. **Gauss**: `InternalAdapter` 의 요청 · 응답 · 스트림 코드를 `gauss.py` 의 `GaussLLM.build` · `parse` · `parse_stream` 으로 옮긴다. 헤더(`x-openapi-token` · `x-generative-ai-client` 등) · 경로(`/openapi/chat/v1/messages` 등) · 사용자 이메일은 모두 이 클래스 안으로. settings 에 더했던 값은 `self.ctx.get('INTERNAL_LLM_CLIENT_KEY')` 처럼 읽는다. 사내 검색이 있으면 `build_search` · `parse_search` 와 `CAPABILITIES` 의 `'search'`.
3. **CLEF**: `clef_remote.py` · `clef_route.py` 를 **이 폴더로 옮기고**(상대 import), `ClefDecision.targets` · `answer` · `probe` 에서 쓴다. 관리자 설정 경로는 그대로 — `self.ctx.admin_runtime / 'clef_remote.json'`.
4. **추적 파일을 원래대로**: 고쳤던 추적 파일을 `git checkout -- <파일>` 로 되돌리고(백업 확인 후), `admin/` 에 남은 새 파일은 지운다(이제 이 폴더에 있다). 그리고 `git pull`.
5. **설정 파일**: 이제 저장소 루트의 `.env` 하나만 읽는다. `app/.env` · `poc/.env` 의 값을 루트 `.env` 로 옮긴다(둘이 남아 있으면 서버가 경고한다).
6. 확인 명령 `check --live` → `make restart` → 관리자 Provider 탭.

## 계약 요약

### GaussLLM (`InhouseLLM`)

| 무엇 | 형식 |
|---|---|
| 생성자 | `__init__(self, ctx)` — `ctx.env`(설정 값) · `ctx.root` · `ctx.runtime`(app/data/runtime) · `ctx.admin_runtime`(admin/runtime) |
| `REQUIRED_ENV` | 모두 값이 있어야 쓰는 키(기본 `INTERNAL_LLM_API_KEY` · `INTERNAL_LLM_BASE_URL` · `INTERNAL_LLM_MODEL`) |
| `CAPABILITIES` | `'text'` 외에 되는 것만: `'json'`(JSON 모드를 직접 처리 — 없으면 git 쪽이 JSON 지시문을 덧붙임) · `'image'` · `'stream'` · `'search'` |
| `build(call: LLMCall) -> HttpCall` | `call.model` · `call.system` · `call.messages`(user/assistant, 글 `Part('text')` · 이미지 `Part('image', mime, base64)`) · `temperature` · `max_output_tokens` · `json_mode` · `schema` · `seed` · `stream` → 요청(주소 · 헤더 · JSON 본문) |
| `parse(status, body) -> LLMReply` | 2xx 응답(`body` 는 JSON 이면 dict/list, 아니면 str) → `text` · `finish`('stop' · 'length' · 'safety') · 토큰 수 · 모델. 200 인데 오류 본문이면 `InhouseError` |
| `parse_stream(line) -> LLMDelta \| None` | 스트림 한 줄 → **새로 온 글만**(누적 아님), 마지막 줄에 `finish` · 토큰 수. 글이 아닌 줄은 None |
| `build_search(query, limit)` · `parse_search(status, body) -> [SearchHit]` | 검색어(300자 이내, ' / ' 로 여러 개일 수 있음) → 결과(제목 · 주소 · 요약) |
| `error(status, body) -> InhouseError \| None` | (선택) 4xx · 5xx 본문의 사내 오류를 사용자 문장으로 |
| `probe() -> HttpCall \| None` · `check_probe(status, body) -> ProbeResult` | (선택) 토큰을 쓰지 않는 점검 요청. None 이면 최소 생성 호출로 점검 |
| `opener()` | (선택) 사내 인증서 · 프록시 우회가 필요할 때 `urlopen(request, timeout=…)` 모양의 함수 |

오류는 `InhouseError(code, message)` — `code` 는 `auth_failed` · `rate_limited` · `upstream_unavailable` · `timeout` · `network` · `bad_request` · `model_not_found` · `unsupported_capability` · `invalid_output` · `blocked` · `upstream_error`. 앞의 넷(`rate_limited` · `upstream_unavailable` · `timeout` · `network`)은 git 쪽이 다시 보낸다. HTTP 4xx/5xx 는 `build` 가 신경 쓰지 않아도 상태 코드로 처리된다(401/403 인증 · 404 모델 · 429/5xx 재시도).

### ClefDecision (`InhouseDecision`)

| 무엇 | 형식 |
|---|---|
| `targets() -> [DecisionTarget]` | 서버(모델) 목록 — `id` · `model` · `label` · `enabled` · `max_tokens`(요청 하나 추정 토큰 한도) · `parallel`(동시 요청 수). 켜진 것 중 앞의 것이 먼저 답한다 |
| `async train(request: ClefTrainingRequest) -> ClefTrainingResponse` | 선택 구현. 관리자가 CLEF 추가에서 training job을 선택하면 `request.job_id`와 `request.model`을 받는다. 학습 및 서빙이 준비되면 `ClefTrainingResponse(endpoint=...)`를 반환한다. 관리자는 최대 30분을 기다린 뒤 받은 주소로 System One 샘플을 검증한다. |
| `answer(call: DecisionCall) -> DecisionReply` | `call.target` 서버에 `{model, state, questions}` 를 보내고 `answers` · 토큰 수를 돌려준다. `call.timeout` 초 안에, `call.cancel()` 이면 멈춤 |
| `probe(target) -> ProbeResult \| None` | (선택) 토큰 없는 점검(터널 → /health 등). None 이면 짧은 질문 하나로 점검 |
| `QUESTION_TYPES` | choice · score · noul 모두 — 서버에 없는 유형은 클래스 안에서 바꿔 묻고 그 유형의 답 모양으로 돌려준다 |
| `TIMEOUT` | 요청 하나의 제한 시간(기본 120초, `WINMATE_DECISION_TIMEOUT` 보다 크면 이 값) |

질문 · 답 형식은 System One(TypeSafe · Clef 와 같음): choice → `{type, choice, probabilities, confidence}`, score → `{type, score, probabilities, confidence}`, noul → `{type, noul}`. git 쪽이 질문을 한도에 맞게 나누고, 서버별 동시 요청 수를 지키고, 답 형식을 검사하고, 답하지 못하면 다음 서버 → 다음 Decision 칸으로 넘긴다.

## 뼈대

```python
# gauss.py
from app.api.llm.inhouse_contract import InhouseError, InhouseLLM, HttpCall, LLMCall, LLMDelta, LLMReply


class GaussLLM(InhouseLLM):
    REQUIRED_ENV = ('INTERNAL_LLM_API_KEY', 'INTERNAL_LLM_CLIENT_KEY', 'INTERNAL_LLM_BASE_URL', 'INTERNAL_LLM_MODEL')
    CAPABILITIES = frozenset({'text', 'stream'})        # 실제로 되는 것만

    def build(self, call: LLMCall) -> HttpCall:
        base = self.ctx.get('INTERNAL_LLM_BASE_URL').rstrip('/')
        headers = {...}                                  # 사내 규격의 인증 헤더 — 값은 self.ctx.get(...)
        body = {...}                                     # call.model · call.system · call.messages · call.max_output_tokens · call.stream …
        return HttpCall(url=base + '/...', headers=headers, json=body)

    def parse(self, status, body) -> LLMReply:
        ...                                              # 사내 응답 → 글 · 끝난 이유 · 토큰 수
        return LLMReply(text=..., finish='stop', input_tokens=..., output_tokens=...)

    def parse_stream(self, line: str):
        ...                                              # 한 줄 → LLMDelta(새 글) 또는 None
```

```python
# clef.py
import json

from app.api.llm.inhouse_contract import DecisionReply, DecisionTarget, InhouseDecision, InhouseError


class ClefDecision(InhouseDecision):
    def targets(self):
        saved = json.loads((self.ctx.admin_runtime / 'clef_remote.json').read_text(encoding='utf-8'))
        ...                                              # 켜진 provider → DecisionTarget(id, model, label, enabled, max_tokens, parallel)

    def answer(self, call) -> DecisionReply:
        ...                                              # 터널 준비 → 프록시 없이 POST …/v1/systemone {model, state, questions}
        return DecisionReply(answers=data['answers'], model=data.get('model', call.model), input_tokens=..., output_tokens=...)
```

동작하는 예(가짜 규격 — 구조만 참고, 실제 Gauss · CLEF 규격이 아니다): `app/tests/fixtures/inhouse/gauss.py` · `clef.py`, 시험 `app/tests/test_inhouse.py`.

## 자주 걸리는 것

- **키를 못 찾는다** — 루트 `.env` 인지(이제 `app/.env` 는 읽지 않음), 이름이 접두사로 시작하는지 또는 `OPTIONAL_ENV` 에 있는지. 관리자 Provider 탭 카드에 빠진 키 이름이 보인다.
- **http 주소가 거절된다** — https, 또는 사설 IP · 점 없는 호스트 · `.internal` 같은 사내 이름만 http 를 허용한다. 다른 사내 도메인은 `.env` 의 `INHOUSE_HTTP_HOSTS=호스트1,호스트2`.
- **사내 인증서 오류** — `opener()` 에서 `ssl.create_default_context(cafile=...)` 를 쓴 opener 를 돌려준다.
- **이미지 · 스트림 · 검색이 안 되는 모델** — `CAPABILITIES` 에서 빼면 된다. 이미지 호출은 켜 둔 다른 LLM 이 받거나(없으면 오류), 스트림은 한 번에 받아 보여 주고, 검색은 다른 검색 수단만 쓴다.
- **클래스를 고쳤는데 그대로다** — 서버가 연결을 다시 만들 때(설정을 다시 읽을 때 · 재시작) 새 코드가 쓰인다. `make restart`.
