"""사내(in-house) 모델 연결 계약 — git 에 올라가는 코드와 사내망에만 있는 구현의 경계.

사내망에서는 git push 가 안 되고 사내 API 자료도 밖으로 못 나간다. 그래서 사내 API 에 맞춘 코드는 git 이 무시하는 폴더에만 두고,
git 쪽 코드는 아래의 **파일 이름 · 클래스 이름 · 메서드 · 입력과 출력 형식**만 알고 그 클래스를 불러 쓴다::

    app/api/llm/inhouse/gauss.py   class GaussLLM(InhouseLLM)           사내 LLM — WINMATE_LLM_PROVIDER=internal
    app/api/llm/inhouse/clef.py    class ClefDecision(InhouseDecision)  사내 Decision 모델 — Decision 순서의 「inhouse」

* 폴더는 ``WINMATE_INHOUSE_DIR`` 로 바꿀 수 있다(저장소 루트 기준 상대 경로 또는 절대 경로). 같은 폴더의 다른 파일은 상대 import 로
  함께 쓸 수 있다(``from . import common`` — 폴더 전체가 패키지 ``winmate_inhouse`` 로 올라간다).
* 서버는 설정을 읽을 때(시작할 때) 파일 → 클래스 → 계약 검사 → 필수 키(``REQUIRED_ENV``) 순서로 확인하고, 모두 통과하면 그 연결을 쓴다.
  하나라도 없으면 기존 동작 그대로다(사내 LLM 은 chat-completions 호환 전송, Decision 은 TypeSafe · 로컬 Clef).
* 클래스는 아래 입력을 받아 아래 출력을 만든다. 사내 API 가 요구하는 헤더 · 본문 · 응답 형식 · 스트림 형식 · 검색 · SSH 터널 같은 것은
  모두 클래스 안에서 알아서 맞춘다.
* git 쪽 코드가 맡는 것: 공용 요청 큐(분당 42회 · 동시 요청 수), 재시도(429 · 5xx · 연결 실패), 제한 시간, 취소, 다른 연결로의 대체(fallback),
  사용량 기록(관리자 사용량 · Langfuse), 응답 캐시, JSON 해석 · 검증, 키 가리기, 관리자 Provider 탭(켜기/끄기 · 대표 · 점검 · 실험).

작성 안내 · 이전 방법 · 확인 명령은 ``app/api/llm/inhouse/README.md``. 계약 확인::

    app/.venv/bin/python -m app.api.llm.inhouse_bridge check           # 파일 · 클래스 · 키 · 요청 모양 (네트워크 없음)
    app/.venv/bin/python -m app.api.llm.inhouse_bridge check --live    # 실제 호출까지 (텍스트 · JSON · 이미지 · 스트림 · 검색 · Decision)
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, FrozenSet, List, Mapping, Optional, Tuple

# ---------------------------------------------------------------- 고정 이름 (바꾸지 않는다)
DIR_ENV = 'WINMATE_INHOUSE_DIR'
DEFAULT_DIR = 'app/api/llm/inhouse'
PACKAGE = 'winmate_inhouse'
LLM_FILE, LLM_CLASS = 'gauss.py', 'GaussLLM'
DECISION_FILE, DECISION_CLASS = 'clef.py', 'ClefDecision'
# 클래스에 넘기는 설정 키: 이 접두사로 시작하는 키 전부 + 클래스가 REQUIRED_ENV · OPTIONAL_ENV 로 밝힌 키.
# 우선순위는 앱과 같다: 관리자 화면에서 바꾼 값 > 실행 환경(셸) > 루트 .env
ENV_PREFIXES = ('INTERNAL_', 'GAUSS_', 'CLEF_', 'INHOUSE_')

CAPABILITIES = ('text', 'json', 'image', 'stream', 'search')
FINISH = ('stop', 'length', 'safety')
QUESTION_TYPES = ('choice', 'score', 'noul')
# InhouseError.code — git 쪽이 재시도 · 대체 · 사용자 메시지를 이 값으로 정한다.
ERROR_CODES = ('auth_failed', 'rate_limited', 'upstream_unavailable', 'timeout', 'network', 'bad_request', 'model_not_found',
               'unsupported_capability', 'invalid_output', 'blocked', 'upstream_error')
# 같은 요청을 잠시 뒤 다시 보내면 될 수 있는 오류(git 쪽이 재시도한다)
RETRYABLE = frozenset({'rate_limited', 'upstream_unavailable', 'timeout', 'network'})


class InhouseError(Exception):
    """사내 API 의 실패를 git 쪽에 알리는 오류. ``code`` 는 :data:`ERROR_CODES` 중 하나, ``message`` 는 사용자에게 보여도 되는 문장
    (키 · 토큰 값은 넣지 않는다 — 넣어도 git 쪽이 한 번 더 가린다), ``status`` 는 알면 HTTP 상태."""

    def __init__(self, code: str, message: str = '', status: Optional[int] = None) -> None:
        self.code = code if code in ERROR_CODES else 'upstream_error'
        self.message = str(message or '')[:500]
        self.status = status
        super().__init__(f'{self.code}: {self.message}' if self.message else self.code)


# ---------------------------------------------------------------- 공통 입력 · 출력
@dataclass(frozen=True)
class InhouseContext:
    """클래스 생성자가 받는 것. ``env`` 는 읽기 전용 설정 값(:data:`ENV_PREFIXES` 키 + 클래스가 밝힌 키, 빈 값 제외)."""
    env: Mapping[str, str]
    root: Path              # 저장소 루트
    runtime: Path           # app/data/runtime (git 제외 — 캐시 · 토큰 같은 실행 중 파일)
    admin_runtime: Path     # admin/runtime 또는 WINMATE_ADMIN_DATA (git 제외 — 관리자 설정, 예: clef_remote.json)

    def get(self, key: str, default: str = '') -> str:
        value = self.env.get(key)
        return str(value) if value not in (None, '') else default


@dataclass(frozen=True)
class HttpCall:
    """보낼 HTTP 요청 하나. ``json`` 이 있으면 UTF-8 JSON 본문(Content-Type 자동), 없으면 ``data`` 를 그대로 보낸다(GET 이면 둘 다 None).
    주소는 https, 또는 이 서버 · 사내망(사설 IP · 점 없는 호스트 · .internal 등) 주소의 http 만 보낸다. 다른 사내 도메인을 http 로
    써야 하면 그 호스트 이름을 ``INHOUSE_HTTP_HOSTS``(쉼표)에 적는다."""
    url: str
    headers: Mapping[str, str] = field(default_factory=dict)
    json: Any = None
    data: Optional[bytes] = None
    method: str = 'POST'


@dataclass(frozen=True)
class ProbeResult:
    """상태 점검 결과. ``ok`` 가 False 면 ``detail`` 에 이유. ``models`` 는 서버가 알려 준 모델 ID(있으면)."""
    ok: bool
    detail: str = ''
    models: Tuple[str, ...] = ()


# ---------------------------------------------------------------- LLM
@dataclass(frozen=True)
class Part:
    """메시지의 한 조각: 글(``kind='text'``) 또는 이미지(``kind='image'``, ``mime`` + base64 ``data``, data: 접두사 없음)."""
    kind: str
    text: str = ''
    mime: str = ''
    data: str = ''


@dataclass(frozen=True)
class Message:
    role: str                       # 'user' | 'assistant'
    parts: Tuple[Part, ...]

    @property
    def text(self) -> str:
        return ''.join(p.text for p in self.parts if p.kind == 'text')

    @property
    def images(self) -> Tuple[Part, ...]:
        return tuple(p for p in self.parts if p.kind == 'image')


@dataclass(frozen=True)
class LLMCall:
    """앱의 LLM 호출 하나(텍스트 · JSON · 이미지 · 스트림 공통 입력).

    * ``model`` — 쓸 모델 ID. 기본 · 빠른 · 이미지 모델(INTERNAL_LLM_MODEL · _QUICK_MODEL · _VISION_MODEL) 중 이미 골라진 값.
    * ``system`` — 시스템 지시(없으면 ''). ``messages`` — 대화(마지막은 보통 user). 이미지는 user 메시지의 ``Part(kind='image')``.
    * ``json_mode`` — 출력이 JSON 값 하나여야 한다. ``schema`` — 호출자가 가진 JSON Schema(표준 형식 · 소문자 type), 없으면 None.
      사내 API 에 JSON 모드가 없으면 :func:`json_instruction` 을 시스템 지시에 덧붙인다. 출력 해석 · 검증은 git 쪽이 한다(코드 블록 · 앞뒤 글 허용).
    * ``stream`` — True 면 스트림 요청을 만든다(:meth:`InhouseLLM.parse_stream` 이 한 줄씩 읽는다).
    """
    model: str
    system: str
    messages: Tuple[Message, ...]
    temperature: float = 0.2
    max_output_tokens: int = 8192
    json_mode: bool = False
    schema: Optional[dict] = None
    seed: Optional[int] = None
    stream: bool = False

    @property
    def has_images(self) -> bool:
        return any(m.images for m in self.messages)

    def prompt_text(self) -> str:
        """프롬프트를 글 하나로 받는 API 용: 시스템 지시와 대화를 이어 붙인 글(이미지는 빠짐)."""
        rows = [self.system] if self.system else []
        rows += [('[assistant] ' if m.role == 'assistant' else '') + m.text for m in self.messages]
        return '\n\n'.join(r for r in rows if r)


@dataclass(frozen=True)
class LLMReply:
    """스트림이 아닌 응답 하나. ``finish``: 'stop' 정상 · 'length' 출력 한도에서 잘림 · 'safety' 차단."""
    text: str
    finish: str = 'stop'
    input_tokens: int = 0
    output_tokens: int = 0
    model: str = ''


@dataclass(frozen=True)
class LLMDelta:
    """스트림의 한 사건. ``text`` 는 **이번에 새로 온 글만**(누적 아님). 마지막 사건에 ``finish`` · 토큰 수를 넣는다(알면)."""
    text: str = ''
    finish: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None


@dataclass(frozen=True)
class SearchHit:
    """웹(또는 사내) 검색 결과 하나. 시장조사 · 시뮬레이션 근거는 이 주소의 원문을 서버가 다시 읽어 확인한다."""
    title: str
    url: str
    snippet: str = ''
    published: str = ''


class InhouseLLM:
    """사내 LLM 연결. ``gauss.py`` 의 ``class GaussLLM(InhouseLLM)`` 이 이 메서드들을 채운다.

    git 쪽은 :meth:`build` 가 만든 요청을 공용 큐로 보내고, 받은 응답을 :meth:`parse` (스트림이면 줄마다 :meth:`parse_stream`)로 읽는다.
    재시도 · 제한 시간 · 취소 · 대체 · 사용량 기록은 git 쪽이 하므로 클래스 안에서 HTTP 를 직접 보내지 않는다.
    """

    #: 이 키들이 모두 값이 있어야 연결을 쓴다(없으면 관리자 Provider 탭에 빠진 키로 보인다).
    REQUIRED_ENV: Tuple[str, ...] = ('INTERNAL_LLM_API_KEY', 'INTERNAL_LLM_BASE_URL', 'INTERNAL_LLM_MODEL')
    #: 접두사(:data:`ENV_PREFIXES`) 밖의 키를 더 읽을 때 이름을 적는다.
    OPTIONAL_ENV: Tuple[str, ...] = ()
    #: 지원하는 기능(:data:`CAPABILITIES`).
    #:   'json'   — ``json_mode`` 를 클래스가 직접 처리한다(사내 API 의 JSON 모드 등). 없으면 git 쪽이 :func:`json_instruction` 을
    #:              시스템 지시 끝에 덧붙여 보낸다(출력 해석 · 검증은 어느 쪽이든 git 쪽).
    #:   'image'  — 이미지 입력. 없으면 이미지가 든 호출은 unsupported_capability(대체 연결이 켜져 있으면 그쪽이 답한다).
    #:   'stream' — 스트림. 없으면 스트림 호출도 한 번에 받아 한 번에 돌려준다(화면은 그대로 동작).
    #:   'search' — 웹(사내) 검색. 없으면 시장조사 · 시뮬레이션의 '모델 검색' 수단에서 빠진다.
    CAPABILITIES: FrozenSet[str] = frozenset({'text'})
    #: INTERNAL_LLM_MODEL 이 비었을 때 쓸 모델 ID(모델 ID 가 필요 없는 API 면 아무 이름)
    DEFAULT_MODEL: str = ''

    def __init__(self, ctx: InhouseContext) -> None:
        self.ctx = ctx
        self.env = ctx.env

    # ---- 반드시 구현
    def build(self, call: LLMCall) -> HttpCall:
        """``call`` → 사내 API 요청. ``call.stream`` 이 True 면 스트림 요청."""
        raise NotImplementedError

    def parse(self, status: int, body: Any) -> LLMReply:
        """성공 응답(2xx) → :class:`LLMReply`. ``body`` 는 JSON 이면 해석한 값, 아니면 글(str).
        200 인데 본문이 오류면 :class:`InhouseError` 를 던진다(재시도할 만한 오류면 :data:`RETRYABLE` 코드)."""
        raise NotImplementedError

    # ---- CAPABILITIES 에 'stream' 이 있으면
    def parse_stream(self, line: str) -> Optional[LLMDelta]:
        """스트림 응답의 한 줄(앞뒤 공백 제거됨, 빈 줄은 오지 않음) → :class:`LLMDelta`, 글이 아닌 줄(이벤트 이름 · 주석 · [DONE])이면 None.
        줄 안의 오류는 :class:`InhouseError`."""
        raise NotImplementedError

    # ---- CAPABILITIES 에 'search' 가 있으면
    def build_search(self, query: str, limit: int) -> HttpCall:
        """검색 → 사내 검색 요청(결과 ``limit`` 개 이내). ``query`` 는 앱이 넘긴 검색 요청 글에서 뽑은 검색어(300자 이내):
        '검색어:' 로 시작하는 줄이 있으면 그 줄의 내용, 없으면 줄들을 ' / ' 로 이은 것. 여러 검색어가 ' / ' 로 이어져 올 수 있다."""
        raise NotImplementedError

    def parse_search(self, status: int, body: Any) -> List[SearchHit]:
        raise NotImplementedError

    # ---- 고쳐 써도 되는 기본 동작
    def error(self, status: int, body: str) -> Optional[InhouseError]:
        """오류 응답(4xx · 5xx)의 본문 → 오류. None 이면 git 쪽이 상태 코드로 정한다(401/403 인증 · 404 모델 · 429/5xx 재시도)."""
        return None

    def probe(self) -> Optional[HttpCall]:
        """관리자 점검용 요청(토큰을 쓰지 않는 상태 · 모델 목록 API). None 이면 최소 생성 호출로 확인한다."""
        return None

    def check_probe(self, status: int, body: Any) -> ProbeResult:
        """:meth:`probe` 응답(2xx) → 결과. 기본은 응답이 오면 정상."""
        return ProbeResult(True, '서버가 응답했습니다.')

    def opener(self) -> Optional[Callable[..., Any]]:
        """``urllib.request.urlopen(request, timeout=…)`` 과 같은 모양의 함수. 사내 인증서 · 프록시 우회가 필요할 때만 돌려준다."""
        return None

    def secrets(self) -> Tuple[str, ...]:
        """로그 · 오류에서 가릴 값. 기본은 이름에 KEY · TOKEN · SECRET · PASSWORD 가 든 설정 값 전부."""
        return secret_values(self.env)


# ---------------------------------------------------------------- Decision (System One 형식)
@dataclass(frozen=True)
class ClefTrainingRequest:
    job_id: str
    model: str


@dataclass(frozen=True)
class ClefTrainingResponse:
    endpoint: str


@dataclass(frozen=True)
class DecisionTarget:
    """Decision 서버(모델) 하나. 켜진(``enabled``) 것 중 앞의 것이 먼저 답하고, 답하지 못하면 다음 것이 답한다.

    * ``max_tokens`` — 요청 하나(state + 질문들)의 추정 토큰 한도. 넘으면 git 쪽이 질문을 나눠 여러 번 보낸다.
    * ``parallel`` — 이 서버가 동시에 받는 요청 수(GPU 하나면 1). git 쪽이 이 수를 넘지 않게 줄 세운다.
    """
    id: str
    model: str
    label: str = ''
    enabled: bool = True
    max_tokens: int = 15_000
    parallel: int = 1


@dataclass(frozen=True)
class DecisionCall:
    """질문 묶음 하나. ``state`` 는 글 또는 JSON 값, ``questions`` 는 System One 질문 ``{id: {type, instructions, criteria}}``:

    * choice — ``criteria`` = {보기 키: 설명} → 답 ``{type: 'choice', choice: 보기 키, probabilities: {보기 키: 확률}, confidence}``
    * score  — ``criteria`` = [0단계 설명, 1단계 설명, …] → 답 ``{type: 'score', score: 기대 단계(실수), probabilities: {'0': 확률, …}, confidence}``
    * noul   — 예/아니오 문장 → 답 ``{type: 'noul', noul: 예일 확률(0~1)}``

    ``timeout`` 은 이 호출에 남은 초(안에서 재시도하면 그 시간까지 포함), ``cancel()`` 이 True 면 멈춘다(None 일 수 있음).
    """
    target: str
    model: str
    state: Any
    questions: Mapping[str, dict]
    timeout: float
    cancel: Optional[Callable[[], bool]] = None


@dataclass(frozen=True)
class DecisionReply:
    answers: Mapping[str, dict]
    model: str = ''
    input_tokens: int = 0
    output_tokens: int = 0


class InhouseDecision:
    """사내 Decision 모델 연결. ``clef.py`` 의 ``class ClefDecision(InhouseDecision)`` 이 이 메서드들을 채운다.

    Decision 은 서버 주소 · 터널 · 프록시 같은 전송까지 클래스가 맡는다(:meth:`answer` 가 직접 보낸다). git 쪽은 질문 검사,
    한도에 맞춘 질문 나누기, 서버별 동시 요청 수, 답 형식 검사, 다음 서버 · 다음 Decision 연결로의 대체, 사용량 기록을 맡는다.
    """

    REQUIRED_ENV: Tuple[str, ...] = ()
    OPTIONAL_ENV: Tuple[str, ...] = ()
    #: 세 가지 모두 답해야 한다(앱의 판단 작업이 셋을 다 쓴다). 서버에 없는 유형은 클래스 안에서 바꿔 묻는다(예: score → choice).
    QUESTION_TYPES: Tuple[str, ...] = QUESTION_TYPES
    #: 요청 하나의 제한 시간(초, 클래스 안 재시도 포함). 앱 설정 WINMATE_DECISION_TIMEOUT 보다 크면 이 값을 쓴다.
    TIMEOUT: int = 120

    def __init__(self, ctx: InhouseContext) -> None:
        self.ctx = ctx
        self.env = ctx.env

    async def train(self, request: ClefTrainingRequest) -> ClefTrainingResponse:
        """Optional training job. Await the System One endpoint for request.model (up to 30 minutes)."""
        raise NotImplementedError

    def targets(self) -> List[DecisionTarget]:
        """쓸 수 있는 서버(모델) 목록, 앞의 것이 먼저. 설정 파일을 읽어도 된다(호출마다 불릴 수 있으니 가볍게)."""
        raise NotImplementedError

    def answer(self, call: DecisionCall) -> DecisionReply:
        """``call.target`` 서버에 질문을 보내 답을 받는다. 실패는 :class:`InhouseError`."""
        raise NotImplementedError

    def probe(self, target: str) -> Optional[ProbeResult]:
        """관리자 점검(토큰을 쓰지 않는 상태 확인 — 예: 터널을 연 뒤 /health). None 이면 git 쪽이 짧은 질문 하나로 확인한다."""
        return None

    def secrets(self) -> Tuple[str, ...]:
        return secret_values(self.env)


# ---------------------------------------------------------------- 도우미
def secret_values(env: Mapping[str, str]) -> Tuple[str, ...]:
    marks = ('KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'PASSWD')
    return tuple(str(v) for k, v in env.items() if v and any(m in k.upper() for m in marks))


def json_instruction(schema: Optional[dict]) -> str:
    """JSON 모드가 없는 API 용 지시문(시스템 지시 끝에 덧붙인다)."""
    text = 'Return exactly one valid JSON value and nothing else.'
    if schema:
        text += ' Follow this JSON Schema: ' + json.dumps(schema, ensure_ascii=False)
    return text
