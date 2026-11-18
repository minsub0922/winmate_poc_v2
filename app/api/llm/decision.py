"""Decision model client — System One API (TypeSafe *Jev*, or a local *Clef* server with the same API).

The decision model answers typed questions about one ``state`` instead of generating text:

* ``choice``  ``criteria`` = {option: description} (1–255) → ``choice``, ``confidence``, ``probabilities``
* ``score``   ``criteria`` = [level 0, level 1, …] (1–10)  → ``score`` (probability-weighted level), ``confidence``, ``probabilities``
* ``noul``    yes/no statement                              → ``noul`` (probability of yes)

Decision-shaped tasks (``settings.DECISION_TASKS``) branch on :func:`get_decision`: with a configured key the
task asks the decision model, otherwise the same task asks the LLM. Both branches build the **same task output**
(see ``docs/decision-model/REPORT.md``); only the way the answer is obtained differs.

Strict like the LLM provider: no key → no client (the caller takes the LLM branch); a failing request raises
:class:`~app.api.llm.provider.ProviderError` — there is no rule-made fallback. With several slots on (``WINMATE_DECISION_ORDER``)
a slot that fails to answer hands the same questions to the next one, another real model. The key never leaves the server.
The ``inhouse`` slot is the git-ignored in-house class (``app/api/llm/inhouse/clef.py``, :mod:`inhouse_bridge`), same questions
and answers.
"""
from __future__ import annotations

import json
import socket
import threading
from concurrent.futures import ThreadPoolExecutor
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from .. import telemetry
from .provider import GenerationResult, ProviderError

CancelCheck = Optional[Callable[[], bool]]
QUESTION_TYPES = ('choice', 'score', 'noul')
MAX_CHOICES = 255
MAX_LEVELS = 10
RETRY_STATUS = (408, 429, 500, 502, 503, 504, 529)
FALLBACK_CODES = frozenset({'no_api_key', 'auth_failed', 'upstream_error', 'upstream_timeout', 'rate_limited'})
# Jev 1.14 limits: 64k tokens per request (state + all questions), 32k per question (state + one question).
# Korean text measures ≈1.26 characters per token on Jev, 1.45–1.9 on Clef; the estimate below is deliberately conservative.
REQUEST_TOKEN_BUDGET = 48_000
QUESTION_TOKEN_LIMIT = 30_000
CHARS_PER_TOKEN = 1.2
MAX_PARALLEL = 4


@dataclass(frozen=True)
class Limits:
    """Per model family: estimated-token budget of one request and of state + one question, concurrent requests when one
    ask is split, and extra request-body fields."""
    request_budget: int
    question_limit: int
    parallel: int
    extra: Tuple[Tuple[str, Any], ...] = ()


# Clef (local ``clef_mlx.py serve``, e.g. clef-flash 4-bit): 16,384 tokens per request including the schema, one request at
# a time on the GPU (parallel requests only queue). ``truncate: false`` makes an over-length request a 413 instead of a
# silently cut state.
LIMITS = {'jev': Limits(REQUEST_TOKEN_BUDGET, QUESTION_TOKEN_LIMIT, MAX_PARALLEL),
          'clef': Limits(15_000, 15_000, 1, (('truncate', False),))}


def family(model: str) -> str:
    return 'clef' if str(model).startswith('clef') else 'jev'


def estimate_tokens(value: Any) -> int:
    return int(len(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)) / CHARS_PER_TOKEN) + 8


def plan_batches(state: Any, questions: Mapping[str, dict], budget: int = REQUEST_TOKEN_BUDGET,
                 question_limit: int = QUESTION_TOKEN_LIMIT) -> List[Dict[str, dict]]:
    """Split questions into requests that each fit the per-request context (the state is resent with every batch)."""
    base = estimate_tokens(state)
    if base + 64 > question_limit:
        raise ValueError('Decision 모델 state 가 질문당 컨텍스트 한도를 넘습니다.')
    batches: List[Dict[str, dict]] = []
    cur: Dict[str, dict] = {}
    size = base
    for qid, q in questions.items():
        t = estimate_tokens(q)
        if base + t > question_limit:
            raise ValueError(f'{qid}: 질문이 질문당 컨텍스트 한도를 넘습니다.')
        if cur and size + t > budget:
            batches.append(cur)
            cur, size = {}, base
        cur[qid] = q
        size += t
    if cur:
        batches.append(cur)
    return batches


@dataclass
class DecisionResult:
    answers: Dict[str, dict]
    model: str
    ms: int
    input_tokens: int = 0
    output_tokens: int = 0
    attempts: int = 1

    def as_generation(self) -> GenerationResult:
        """Same record shape the LLM branch produces, for :class:`ModeTracker` and usage summaries."""
        return GenerationResult(data=self.answers, text='', model=self.model, prompt_tokens=self.input_tokens,
                                output_tokens=self.output_tokens, ms=self.ms, attempts=self.attempts)


# ---------------------------------------------------------------- question builders (validated before sending)
def choice(instructions: Any, options: Mapping[str, Any]) -> dict:
    if not options or len(options) > MAX_CHOICES:
        raise ValueError(f'choice 옵션은 1~{MAX_CHOICES}개여야 합니다.')
    return {'type': 'choice', 'instructions': instructions, 'criteria': {str(k): v for k, v in options.items()}}


def score(instructions: Any, levels: Sequence[Any]) -> dict:
    if not levels or len(levels) > MAX_LEVELS:
        raise ValueError(f'score 단계는 1~{MAX_LEVELS}개여야 합니다.')
    return {'type': 'score', 'instructions': instructions, 'criteria': list(levels)}


def noul(instructions: Any, true: Any = None, false: Any = None) -> dict:
    q: dict = {'type': 'noul', 'instructions': instructions}
    if true is not None or false is not None:
        q['criteria'] = {k: v for k, v in (('true', true), ('false', false)) if v is not None}
    return q


# ---------------------------------------------------------------- answer readers shared by the task branches
def ranked_choices(answer: dict) -> List[Tuple[str, float]]:
    """Options of a choice answer, most probable first (stable for ties)."""
    probs = answer.get('probabilities') or {}
    order = list(probs)
    return sorted(((k, float(v)) for k, v in probs.items()), key=lambda kv: (-kv[1], order.index(kv[0])))


def expected_level(answer: dict) -> float:
    """Probability-weighted level of a score answer (``score`` from the API, recomputed if missing)."""
    if isinstance(answer.get('score'), (int, float)):
        return float(answer['score'])
    probs = answer.get('probabilities') or {}
    return sum(int(k) * float(v) for k, v in probs.items())


def level(answer: dict, lo: int = 0, hi: Optional[int] = None) -> int:
    """Discrete level for a task field typed as an integer (rounded expected level, clamped)."""
    value = int(round(expected_level(answer)))
    if hi is not None:
        value = min(hi, value)
    return max(lo, value)


def unit(xs: Sequence[float]) -> List[float]:
    """Min-max to 0–1 (all equal → 0)."""
    lo, hi = (min(xs), max(xs)) if xs else (0.0, 0.0)
    return [(x - lo) / (hi - lo) if hi - lo > 1e-9 else 0.0 for x in xs]


# Ranking tasks: the decision model's expected relevance (absolute 0–3 levels) plus the retrieval/rule prior the LLM
# also sees ("rule … 참고용"), min-max scaled so the best-retrieved candidate gets ``PRIOR_WEIGHT`` levels. A relevance
# gap of a level or more overrides retrieval; near-ties keep the retrieval order. 0 = decision model only (ablation).
PRIOR_WEIGHT = 1.0


def blend(model_scores: Sequence[float], prior: Sequence[float], weight: Optional[float] = None) -> List[float]:
    w = PRIOR_WEIGHT if weight is None else weight
    return [float(a) + w * b for a, b in zip(model_scores, unit(list(prior)))]


def confidence(answer: dict) -> float:
    c = answer.get('confidence')
    return float(c) if isinstance(c, (int, float)) else 0.0


# ---------------------------------------------------------------- client
class TypeSafeDecision:
    """Thread-safe, stateless HTTP client for ``POST {base}/systemone`` (limits follow the model family, :data:`LIMITS`)."""

    def __init__(self, settings: Any, opener: Optional[Callable[..., Any]] = None) -> None:
        self._settings = settings
        self._key = settings.decision_key()
        self.model = settings.decision_model
        self.base = settings.decision_base_url.rstrip('/')
        self.timeout = int(settings.decision_timeout)
        self._open = opener or urllib.request.urlopen
        self.family = 'clef' if getattr(settings, 'decision_primary', '').startswith('clef-') else family(self.model)
        self.limits = LIMITS[self.family]
        self.name = 'typesafe' if self.family == 'jev' else 'clef-local'
        self.fallbacks: List['TypeSafeDecision'] = []  # other decision slots, in order (settings WINMATE_DECISION_ORDER)

    @property
    def available(self) -> bool:
        return bool(self._key)

    def ask(self, *, stage: str, state: Any, questions: Mapping[str, dict], cancel: CancelCheck = None) -> DecisionResult:
        """:meth:`answer`, then — when this model fails to answer (no response, timeout, auth, 5xx/429) — the next slot."""
        try:
            return self.answer(stage=stage, state=state, questions=questions, cancel=cancel)
        except ProviderError as exc:
            if exc.code not in FALLBACK_CODES or not self.fallbacks:
                raise
            for other in self.fallbacks:
                try:
                    return other.answer(stage=stage, state=state, questions=questions, cancel=cancel)
                except ProviderError as again:
                    if again.code not in FALLBACK_CODES:
                        raise
            raise exc

    def answer(self, *, stage: str, state: Any, questions: Mapping[str, dict], cancel: CancelCheck = None) -> DecisionResult:
        """Answer every question about ``state``. Every question must come back with an answer of its own type.

        Questions that do not fit one request (:data:`REQUEST_TOKEN_BUDGET`) are split into several requests sent in
        parallel; the merged result is one :class:`DecisionResult` (wall-clock ``ms``, summed tokens).
        """
        if not self._key:
            raise ProviderError('no_api_key', 'Decision 모델 키가 서버에 설정되어 있지 않습니다.')
        if not questions:
            raise ValueError('질문이 없습니다.')
        for qid, q in questions.items():
            if q.get('type') not in QUESTION_TYPES:
                raise ValueError(f'{qid}: 지원하지 않는 질문 유형 {q.get("type")}')
        batches = plan_batches(state, questions, self.limits.request_budget, self.limits.question_limit)
        if len(batches) == 1:
            return self._ask_one(stage, state, batches[0], cancel)
        started = time.time()
        context = telemetry.current()

        def one(batch: Dict[str, dict]) -> DecisionResult:
            with telemetry.scope(**context):
                return self._ask_one(stage, state, batch, cancel)
        with ThreadPoolExecutor(max_workers=min(self.limits.parallel, len(batches))) as pool:
            parts = list(pool.map(one, batches))
        answers: Dict[str, dict] = {}
        for part in parts:
            answers.update(part.answers)
        return DecisionResult(answers=answers, model=parts[0].model, ms=int((time.time() - started) * 1000),
                              input_tokens=sum(x.input_tokens for x in parts), output_tokens=sum(x.output_tokens for x in parts),
                              attempts=max(x.attempts for x in parts))

    def _ask_one(self, stage: str, state: Any, questions: Mapping[str, dict], cancel: CancelCheck) -> DecisionResult:
        body = {'model': self.model, 'state': state, 'questions': dict(questions), **dict(self.limits.extra)}
        started = time.time()
        context = telemetry.current()
        span = uuid.uuid4().hex[:16]
        with telemetry.scope(trace_id=context.get('trace_id') or uuid.uuid4().hex, parent_id=context.get('span_id'), span_id=span,
                             stage=stage, feature=context.get('feature') or stage.split(':')[0]):
            telemetry.emit('llm.logical', started=started, status='running', model=self.model, metadata={'provider': self.name})
            try:
                data, attempts = self._post(body, cancel, started)
                answers = self._validate(data, questions)
            except Exception as exc:
                telemetry.emit('llm.logical', started=started, ended=time.time(), status='error', code=getattr(exc, 'code', type(exc).__name__),
                               message=str(exc), model=self.model, metadata={'provider': self.name})
                raise
            usage = data.get('usage') or {}
            result = DecisionResult(answers=answers, model=str(data.get('model') or self.model), ms=int((time.time() - started) * 1000),
                                    input_tokens=int(usage.get('input_tokens') or 0), output_tokens=int(usage.get('output_tokens') or 0),
                                    attempts=attempts)
            telemetry.emit('llm.logical', started=started, ended=time.time(), status='ok', model=result.model,
                           metadata={'provider': self.name, 'attempts': attempts, 'questions': len(questions)})
            telemetry.emit('llm.usage', parent_id=span, started=started, ended=time.time(), model=result.model, status='ok',
                           usage={'promptTokenCount': result.input_tokens, 'candidatesTokenCount': result.output_tokens,
                                  'totalTokenCount': result.input_tokens + result.output_tokens},
                           metadata={'transport': 'decision', 'provider': self.name, 'questions': len(questions)},
                           **telemetry.content(body, data))
            return result

    def _post(self, body: dict, cancel: CancelCheck, started: float) -> Tuple[dict, int]:
        raw = json.dumps(body, ensure_ascii=False).encode('utf-8')
        deadline = started + self.timeout
        last = ''
        for attempt in range(1, 5):
            if cancel and cancel():
                raise ProviderError('cancelled', '취소했어요.')
            remaining = deadline - time.time()
            if remaining <= 0.5:
                break
            req = urllib.request.Request(f'{self.base}/systemone', data=raw, method='POST',
                                         headers={'Authorization': f'Bearer {self._key}', 'Content-Type': 'application/json'})
            wait = min(8.0, 0.6 * 2 ** (attempt - 1))
            try:
                with self._open(req, timeout=max(1.0, remaining)) as resp:
                    return json.loads(resp.read().decode('utf-8')), attempt
            except urllib.error.HTTPError as exc:
                detail = _detail(exc)
                if exc.code in (401, 403):
                    raise ProviderError('auth_failed', 'Decision 모델 키가 거절되었습니다(엔드포인트와 키 발급처가 같은지 확인).', status=exc.code) from None
                if exc.code in (400, 404, 413, 422):
                    raise ProviderError('bad_request', 'Decision 모델이 요청 형식을 거절했습니다: ' + detail, status=exc.code) from None
                if exc.code not in RETRY_STATUS:
                    raise ProviderError('upstream_error', f'Decision 모델 오류 HTTP {exc.code}', status=exc.code) from None
                last = f'HTTP {exc.code}'
                retry_after = exc.headers.get('retry-after') if exc.headers else None
                try:
                    wait = max(wait, float(retry_after)) if retry_after else wait
                except ValueError:
                    pass
            except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, json.JSONDecodeError) as exc:
                last = type(exc).__name__
            if time.time() + wait >= deadline:
                break
            time.sleep(wait)
        code = 'rate_limited' if last == 'HTTP 429' else 'upstream_timeout' if 'timeout' in last.lower() or not last else 'upstream_error'
        raise ProviderError(code, f'Decision 모델 응답을 받지 못했습니다({last or "시간 초과"}).')

    @staticmethod
    def _validate(data: Any, questions: Mapping[str, dict]) -> Dict[str, dict]:
        answers = data.get('answers') if isinstance(data, dict) else None
        if not isinstance(answers, dict):
            raise ProviderError('invalid_output', 'Decision 모델 응답에 answers가 없습니다.')
        out: Dict[str, dict] = {}
        for qid, q in questions.items():
            a = answers.get(qid)
            kind = q['type']
            ok = isinstance(a, dict) and a.get('type') == kind and (
                (kind == 'choice' and a.get('choice') in q['criteria'] and isinstance(a.get('probabilities'), dict)) or
                (kind == 'score' and isinstance(a.get('probabilities'), dict) and (isinstance(a.get('score'), (int, float)) or a['probabilities'])) or
                (kind == 'noul' and isinstance(a.get('noul'), (int, float))))
            if not ok:
                raise ProviderError('invalid_output', f'Decision 모델 응답에 {qid}({kind}) 답이 없거나 형식이 다릅니다.')
            out[qid] = a
        return out


def _detail(exc: urllib.error.HTTPError) -> str:
    try:
        return exc.read().decode('utf-8', 'replace')[:300]
    except Exception:
        return ''


_LOCK = threading.Lock()
_CLIENT: Optional[TypeSafeDecision] = None
_OVERRIDE: Dict[str, Any] = {}


def get_decision(settings: Any, task: str) -> Optional[TypeSafeDecision]:
    """The decision client when ``task`` takes the decision branch, else ``None`` (→ LLM branch)."""
    if 'client' in _OVERRIDE:
        client = _OVERRIDE['client']
        return client if client is not None and (_OVERRIDE.get('tasks') is None or task in _OVERRIDE['tasks']) else None
    if not settings.decision_enabled(task):
        return None
    global _CLIENT
    with _LOCK:
        if _CLIENT is None or _CLIENT._settings != settings or _CLIENT._key != settings.decision_key():
            _CLIENT = slot_client(settings, getattr(settings, 'decision_primary', 'main'), primary=True)
            _CLIENT.fallbacks = [slot_client(settings, slot) for slot, *_ in getattr(settings, 'decision_fallbacks', ())]
        return _CLIENT


def slot_client(settings: Any, slot: str, primary: bool = False) -> Any:
    """The client of one decision slot: ``inhouse`` = the in-house ClefDecision class (app/api/llm/inhouse_bridge.py),
    main / clef = the System One HTTP client."""
    if slot == 'inhouse':
        from .inhouse_bridge import InhouseDecisionClient
        return InhouseDecisionClient(settings, service=True)
    return TypeSafeDecision(settings if primary else slot_settings(settings, slot))


def slot_settings(settings: Any, slot: str) -> Any:
    """``settings`` with the decision fields of another slot (main = TYPESAFE_*, clef = the local server)."""
    import dataclasses
    base, model, key = settings.decision_slot(slot)
    return dataclasses.replace(settings, decision_base_url=base, decision_model=model, _decision_key=key)


def set_decision_override(client: Any = None, tasks: Optional[Sequence[str]] = None, clear: bool = False) -> None:
    """Tests/evaluation: force a client (or ``None`` = always the LLM branch); ``clear`` restores settings-driven choice."""
    if clear:
        _OVERRIDE.clear()
        return
    _OVERRIDE['client'] = client
    _OVERRIDE['tasks'] = set(tasks) if tasks is not None else None


@dataclass
class BoundDecision:
    """A decision client bound to one job: records every answer like an LLM call and honours cancellation.

    The PoC task modules only see ``ask(stage, state, questions) -> answers`` (duck typed), so they never import the app.
    """
    client: Any
    tracker: Any = None
    cancel: CancelCheck = None
    prefix: str = ''
    calls: List[dict] = field(default_factory=list)

    @property
    def model(self) -> str:
        return getattr(self.client, 'model', 'decision')

    def ask(self, stage: str, state: Any, questions: Mapping[str, dict]) -> Dict[str, dict]:
        step = f'{self.prefix}{stage}'
        try:
            res = self.client.ask(stage=step, state=state, questions=questions, cancel=self.cancel)
        except ProviderError as exc:
            if self.tracker is not None:
                self.tracker.record_fail(step, exc)
            raise
        if self.tracker is not None:
            self.tracker.record_ok(res.as_generation(), step)
        self.calls.append({'step': step, 'model': res.model, 'ms': res.ms, 'input_tokens': res.input_tokens, 'questions': len(questions)})
        return res.answers
