"""Queued LLM service for every PoC adapter and the generic ``/api/llm`` endpoint.

* Vendor wire formats live in adapters. Credentials travel only in HTTP headers,
  never in a URL, a response, a log line or an exception message.
* Retry rules merged from the three PoC backends (``rfp_pipeline.GeminiBackend``,
  ``proposal_score.llm.GeminiBackend``, ``sbagent.llm.GeminiBackend``): 429/5xx backoff, 400+schema →
  retry without ``responseSchema``, MAX_TOKENS / repetition → temperature 0.6 → 0.9, JSON parse
  failure retried once, ``thought`` parts ignored.
* Shared FIFO broker: at most 42 upstream attempts in any rolling 60 seconds.
* Response cache is OFF by default; when enabled it lives under ``app/data/runtime/llm-cache`` and
  stores only the model output (no prompt metadata, so no raw customer document).
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Sequence, Tuple, TYPE_CHECKING

from .. import telemetry
from .adapters import GeminiAdapter, ModelRequest, create_adapter
from .queue import QueueError, create_queue

if TYPE_CHECKING:
    from ..poc.settings import Settings

DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta'
IMAGE_TYPES = ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
_SECRET_PATTERNS = (
    (re.compile(r'AIza[0-9A-Za-z_\-]{20,}'), '[redacted]'),
    (re.compile(r'(?i)\b(api[_-]?key|x-goog-api-key|key|token|authorization)(\s*[=:]\s*)("?)[^\s&"\',}]+'), r'\1\2\3[redacted]'),
)
CancelCheck = Optional[Callable[[], bool]]


def redact(text: Any, secrets: Sequence[str] = ()) -> str:
    out = str(text)
    for secret in secrets:
        if secret and len(secret) >= 6:
            out = out.replace(secret, '[redacted]')
    for pattern, repl in _SECRET_PATTERNS:
        out = pattern.sub(repl, out)
    return out


class ProviderError(Exception):
    """Secret-safe provider failure. ``code`` is stable for clients; ``message`` is already redacted."""

    def __init__(self, code: str, message: str = '', status: Optional[int] = None) -> None:
        self.code = code
        self.message = redact(message)[:500]
        self.status = status
        super().__init__(f'{code}: {self.message}' if self.message else code)


@dataclass
class GenerationResult:
    data: Any
    text: str
    model: str
    prompt_tokens: int = 0
    output_tokens: int = 0
    ms: int = 0
    cached: bool = False
    attempts: int = 1
    schema_dropped: bool = False
    grounding: Optional[dict] = None


# ---------------------------------------------------------------- helpers shared with adapters/tests
def parse_json(text: str) -> Any:
    text = (text or '').strip()
    m = re.search(r'```(?:json)?\s*(.*?)```', text, re.S)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except ValueError:
        pass
    starts = [i for i in (text.find('{'), text.find('[')) if i >= 0]
    if not starts:
        raise ValueError('JSON 없음')
    s = min(starts)
    for end in range(len(text), s, -1):
        if text[end - 1] in '}]':
            try:
                return json.loads(text[s:end])
            except ValueError:
                continue
    raise ValueError('JSON 해석 실패')


def degenerate(text: str, unit: int = 40, times: int = 6) -> bool:
    """Same 40-char fragment repeated 6+ times inside a string value (runaway small-model JSON)."""
    if len(text) < unit * times:
        return False
    def repeated(value: str) -> bool:
        for i in range(0, len(value) - unit, max(1, len(value) // 50)):
            frag = value[i:i + unit]
            if sum(c.isalnum() for c in frag) >= 8 and value.count(frag) >= times:
                return True
        return False

    def values(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, list):
            for child in value:
                yield from values(child)
        elif isinstance(value, dict):
            for child in value.values():
                yield from values(child)

    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        if text.lstrip().startswith(('{', '[')):
            # Incomplete JSON can still contain a runaway string. Structure,
            # indentation and repeated short values in different rows are normal.
            strings = re.findall(r'"((?:[^"\\]|\\.)*)"', text)
            tail = re.search(r':\s*"((?:[^"\\]|\\.)*)$', text)
            if tail:
                strings.append(tail.group(1))
            return any(repeated(value) for value in strings)
        return repeated(text)
    return any(repeated(value) for value in values(parsed))


def gemini_schema_from_model(model_cls: Any) -> dict:
    """Pydantic v2 model → Gemini ``responseSchema`` (OpenAPI subset: inline $ref, nullable, enum)."""
    root = model_cls.model_json_schema()
    defs = root.get('$defs', {})

    def conv(node: dict, depth: int = 0) -> dict:
        if depth > 12:
            return {'type': 'STRING'}
        if '$ref' in node:
            return conv(defs[node['$ref'].split('/')[-1]], depth + 1)
        desc = node.get('description')
        if 'anyOf' in node or 'oneOf' in node:
            opts = node.get('anyOf') or node.get('oneOf')
            real = [o for o in opts if o.get('type') != 'null']
            out = conv(real[0], depth + 1) if len(real) == 1 else {'type': 'STRING'}
            if len(real) != len(opts):
                out['nullable'] = True
        elif 'enum' in node or 'const' in node:
            values = node.get('enum') if 'enum' in node else [node['const']]
            out = {'type': 'STRING', 'enum': [str(v) for v in values if v is not None]}
        else:
            t = node.get('type')
            if t == 'object':
                props = {k: conv(v, depth + 1) for k, v in (node.get('properties') or {}).items()}
                out = {'type': 'OBJECT', 'properties': props} if props else {'type': 'STRING'}
                req = [r for r in node.get('required', []) if r in props]
                if req:
                    out['required'] = req
            elif t == 'array':
                out = {'type': 'ARRAY', 'items': conv(node.get('items') or {'type': 'string'}, depth + 1)}
            elif t in ('string', 'integer', 'number', 'boolean'):
                out = {'type': t.upper()}
            else:
                out = {'type': 'STRING'}
        if desc and 'description' not in out:
            out['description'] = str(desc)[:300]
        return out

    return conv(root)


def image_parts(images: Optional[Sequence[Any]]) -> List[dict]:
    out: List[dict] = []
    for im in list(images or [])[:4]:
        mime, data = '', ''
        if isinstance(im, str) and im.startswith('data:') and ',' in im:
            head, data = im.split(',', 1)
            mime = head[5:].split(';')[0]
        elif isinstance(im, dict):
            src = im.get('source') if isinstance(im.get('source'), dict) else {}
            data = im.get('data') or im.get('base64') or src.get('data') or ''
            mime = im.get('mediaType') or im.get('media_type') or im.get('mime_type') or im.get('mimeType') or src.get('media_type') or ''
        if mime not in IMAGE_TYPES or not isinstance(data, str) or not data:
            raise ProviderError('bad_request', '지원하지 않는 이미지 형식입니다(png · jpeg · webp · gif base64).')
        if len(data) > 7_000_000:
            raise ProviderError('bad_request', '이미지가 너무 큽니다(5MB 이하).')
        try:
            base64.b64decode(data, validate=True)
        except ValueError:
            raise ProviderError('bad_request', '이미지 base64 를 읽을 수 없습니다.') from None
        out.append({'inline_data': {'mime_type': mime, 'data': data}})
    return out


def turns_to_contents(turns: Sequence[Any]) -> Tuple[str, List[dict]]:
    system: List[str] = []
    contents: List[dict] = []
    for turn in turns:
        if isinstance(turn, str):
            role, content = 'user', turn
        elif isinstance(turn, dict):
            role, content = str(turn.get('role') or 'user'), turn.get('content', turn.get('text', ''))
        else:
            raise ProviderError('bad_request', 'turns 항목은 문자열 또는 {role, content} 여야 합니다.')
        if isinstance(content, list):
            text = ''.join(str(b.get('text', '')) for b in content if isinstance(b, dict) and b.get('type', 'text') == 'text')
        else:
            text = str(content or '')
        if role == 'system':
            system.append(text)
            continue
        contents.append({'role': 'model' if role in ('assistant', 'model') else 'user', 'parts': [{'text': text}]})
    if not contents:
        raise ProviderError('bad_request', '대화 내용이 비어 있습니다.')
    return '\n'.join(system), contents


class _ResponseLease:
    """Own the network slot until a response/stream is closed, including exceptional exits."""
    def __init__(self, response, release):
        self.response, self.release = response, release
    def __enter__(self):
        return self
    def __iter__(self):
        return iter(self.response)
    def read(self, *args):
        return self.response.read(*args)
    def __exit__(self, *args):
        try:
            self.response.close()
        finally:
            self.release()


class Ledger:
    """Process-wide usage counters (no prompts, no secrets)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.calls = 0
        self.active = self.peak = self.requests = 0
        self.ok = 0
        self.failed = 0
        self.cached = 0
        self.prompt_tokens = 0
        self.output_tokens = 0
        self.errors: Dict[str, int] = {}

    def begin_request(self):
        with self._lock:
            self.active += 1
            self.requests += 1
            self.peak = max(self.peak, self.active)

    def end_request(self):
        with self._lock:
            self.active -= 1

    def record(self, ok: bool, result: Optional[GenerationResult] = None, code: str = '') -> None:
        with self._lock:
            self.calls += 1
            if ok and result is not None:
                self.ok += 1
                self.cached += int(result.cached)
                self.prompt_tokens += result.prompt_tokens
                self.output_tokens += result.output_tokens
            else:
                self.failed += 1
                self.errors[code or 'error'] = self.errors.get(code or 'error', 0) + 1

    def view(self) -> dict:
        with self._lock:
            return {'calls': self.calls, 'ok': self.ok, 'failed': self.failed, 'cached': self.cached,
                    'prompt_tokens': self.prompt_tokens, 'output_tokens': self.output_tokens, 'errors': dict(self.errors),
                    'requests': self.requests, 'active_requests': self.active, 'peak_requests': self.peak}


@dataclass
class _Deadline:
    seconds: float
    at: float = field(init=False)

    def __post_init__(self):
        self.at = time.monotonic() + self.seconds


# ---------------------------------------------------------------- provider
class LLMProvider:
    def __init__(self, settings: Settings, urlopen: Optional[Callable[..., Any]] = None, *, adapter=None, queue=None) -> None:
        self._settings = settings
        self.adapter = adapter or create_adapter(settings)
        self.name = self.adapter.name
        self.queue = queue if queue is not None else create_queue(settings)
        self._key = settings.api_key()
        self.model = settings.model
        self.quick_model = settings.quick_model
        self.vision_model = getattr(settings, 'vision_model', settings.model)
        self.base = (settings.base_url or DEFAULT_BASE).rstrip('/')
        self.timeout = settings.timeout
        self.cache_dir: Optional[Path] = settings.cache_dir if settings.llm_cache else None
        self._urlopen = urlopen or urllib.request.urlopen
        self.concurrency = settings.concurrency
        self._slots = threading.BoundedSemaphore(self.concurrency)
        self._chat_lock = threading.Lock()
        self._chats: Dict[float, Any] = {}
        self.ledger = Ledger()

    def __repr__(self) -> str:
        return f'LLMProvider(provider={self.name!r}, model={self.model!r}, available={self.available})'

    @property
    def available(self) -> bool:
        return bool(self._key and self.model and (self.name == 'gemini' or self._settings.base_url))

    def model_for(self, tier: Optional[str]) -> str:
        name=(tier or '').lower()
        return self.vision_model if name == 'vision' else self.quick_model if name in ('quick', 'fast', 'small') else self.model

    def safe(self, text: Any) -> str:
        return redact(text, (self._key,))

    # ------------------------------------------------------------ transport
    @staticmethod
    def _sleep(seconds: float, cancel: CancelCheck) -> None:
        end = time.monotonic() + max(0.0, seconds)
        while True:
            if cancel and cancel():
                raise ProviderError('cancelled', '작업이 취소되었습니다.')
            left = end - time.monotonic()
            if left <= 0:
                return
            time.sleep(min(0.25, left))

    def _error_detail(self, exc: urllib.error.HTTPError) -> str:
        try:
            raw = exc.read().decode('utf-8', 'replace')[:600]
        except Exception:  # noqa: BLE001
            raw = ''
        finally:
            exc.close()
        try:
            msg = json.loads(raw).get('error', {}).get('message', raw)
        except (ValueError, AttributeError):
            msg = raw
        return self.safe(msg)[:400]

    def _open(self, request, cancel=None, deadline=None):
        # Queue waiting has its own budget; it must not consume model response time.
        deadline = deadline if deadline is not None else _Deadline(self.timeout)
        if deadline.at <= time.monotonic():
            raise ProviderError('timeout', 'AI 요청 시간이 한도를 넘었습니다.')
        waiting = time.monotonic()
        queue_end = waiting + min(self._settings.queue_timeout, self.queue.timeout)
        while not self._slots.acquire(timeout=.05):
            if cancel and cancel():
                raise ProviderError('cancelled', '대기 중인 요청을 취소했습니다.')
            if time.monotonic() >= queue_end:
                raise ProviderError('timeout', 'AI 요청 대기 시간이 한도를 넘었습니다.')
        ticket = None
        active = False
        try:
            ticket = self.queue.acquire(cancel, timeout=max(0, queue_end-time.monotonic()))
            deadline.at += time.monotonic() - waiting
            if cancel and cancel():
                raise ProviderError('cancelled', '요청을 취소했습니다.')
            remaining = deadline.at-time.monotonic()
            if remaining <= 0:
                raise ProviderError('timeout', 'AI 요청 시간이 한도를 넘었습니다.')
            self.ledger.begin_request()
            active = True
            response = self._urlopen(request, timeout=min(self.timeout, remaining))
        except BaseException as exc:
            if active: self.ledger.end_request()
            if ticket: self.queue.release(ticket)
            self._slots.release()
            if isinstance(exc, QueueError):
                message = {'cancelled': '작업이 취소되었습니다.', 'timeout': 'AI 요청 대기 시간이 한도를 넘었습니다.'}.get(exc.code, 'AI 요청 큐에 연결하지 못했습니다.')
                raise ProviderError(exc.code, message) from None
            raise
        def release():
            self.ledger.end_request()
            self.queue.release(ticket)
            self._slots.release()
        return _ResponseLease(response, release)

    @telemetry.network
    def _post(self, model: str, body: dict, cancel=None, deadline=None) -> dict:
        if not self.available:
            raise ProviderError('no_api_key', 'AI 인증 키 또는 모델 연결이 서버에 설정되어 있지 않습니다.')
        req = self._request(model, body)
        with self._open(req, cancel, deadline) as resp:
            return self.adapter.response(json.loads(resp.read().decode('utf-8')))

    def _request(self, model, body, *, stream=False):
        try:
            return self.adapter.request(ModelRequest.from_envelope(model, body), stream=stream)
        except ProviderError:
            raise
        except Exception:
            raise ProviderError('bad_request', 'AI 모델 요청 형식을 구성하지 못했습니다.') from None

    # ------------------------------------------------------------ cache (opt-in, app/data/runtime only)
    def _cache_path(self, payload: dict) -> Optional[Path]:
        if not self.cache_dir:
            return None
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()[:32]
        return self.cache_dir / f'{digest}.json'

    def _cache_get(self, path: Optional[Path]) -> Optional[dict]:
        if path is None or not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return None

    def _cache_put(self, path: Optional[Path], rec: dict) -> None:
        if path is None:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix('.' + uuid.uuid4().hex + '.tmp')
            tmp.write_text(json.dumps(rec, ensure_ascii=False), encoding='utf-8')
            tmp.replace(path)
        except OSError:
            pass

    # ------------------------------------------------------------ core
    @telemetry.generation
    def _generate(self, *, stage: str, system: str, contents: List[dict], gen: dict, model: str, json_expected: bool,
                  cancel: CancelCheck, max_attempts: int, cache_allowed: bool = True, tools: Optional[List[dict]] = None) -> GenerationResult:
        payload = {'provider': self.name, 'endpoint': self.base, 'model': model, 'stage': stage, 'system': system, 'contents': contents, 'gen': gen}
        if tools:
            payload['tools'] = tools
        cache_path = self._cache_path(payload) if cache_allowed else None
        rec = self._cache_get(cache_path)
        if rec is not None:
            result = GenerationResult(rec.get('data'), rec.get('text', ''), model, rec.get('prompt_tokens', 0), rec.get('output_tokens', 0), 0, True)
            self.ledger.record(True, result)
            return result
        gen = dict(gen)
        deadline=_Deadline(self.timeout)
        t0 = time.time()
        last = ProviderError('upstream_error', '응답이 없습니다.')
        parse_fail = empty = 0
        schema_dropped = False
        attempt = 0
        for attempt in range(1, max(1, max_attempts) + 1):
            if cancel and cancel():
                last = ProviderError('cancelled', '작업이 취소되었습니다.')
                break
            body: Dict[str, Any] = {'contents': contents, 'generationConfig': gen}
            if tools:
                body['tools'] = tools
            if system:
                body['systemInstruction'] = {'parts': [{'text': system}]}
            try:
                res = self._post(model, body, cancel,deadline)
            except ProviderError as exc:
                last = exc
                break
            except urllib.error.HTTPError as exc:
                detail = self._error_detail(exc)
                if exc.code == 400 and 'schema' in detail.lower() and 'responseSchema' in gen:
                    gen.pop('responseSchema')
                    schema_dropped = True
                    last = ProviderError('schema_rejected', f'HTTP 400: {detail}', 400)
                    continue
                if exc.code in (429, 500, 502, 503, 504):
                    last = ProviderError('rate_limited' if exc.code == 429 else 'upstream_unavailable', f'HTTP {exc.code}: {detail}', exc.code)
                    if attempt >= max_attempts:
                        break
                    try:
                        retry_after = (exc.headers or {}).get('Retry-After', '')
                        delay = min(30.0, float(retry_after)) if str(retry_after).replace('.', '', 1).isdigit() else min(20, 2 ** (attempt - 1))
                        self._sleep(min(delay,max(0,deadline.at-time.monotonic())), cancel)
                    except ProviderError as stop:
                        last = stop
                        break
                    continue
                code = {400: 'bad_request', 401: 'auth_failed', 403: 'auth_failed', 404: 'model_not_found'}.get(exc.code, 'http_error')
                last = ProviderError(code, f'HTTP {exc.code}: {detail}', exc.code)
                break
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
                last = ProviderError('network', f'{type(exc).__name__}: {self.safe(exc)}')
                if attempt >= max_attempts:
                    break
                try:
                    self._sleep(min(10, 2 ** (attempt - 1),max(0,deadline.at-time.monotonic())), cancel)
                except ProviderError as stop:
                    last = stop
                    break
                continue
            block = (res.get('promptFeedback') or {}).get('blockReason')
            if block:
                last = ProviderError('blocked', f'blockReason={block}')
                break
            cand = (res.get('candidates') or [{}])[0] or {}
            finish = cand.get('finishReason')
            text = ''.join(p.get('text', '') for p in (cand.get('content') or {}).get('parts', []) or [] if isinstance(p, dict) and not p.get('thought'))
            if finish == 'MAX_TOKENS' or degenerate(text):
                last = ProviderError('max_tokens', '출력 한도 초과' + (' · 반복 폭주' if degenerate(text) else ''))
                if float(gen.get('temperature', 0)) < 0.85:
                    gen['temperature'] = 0.6 if float(gen.get('temperature', 0)) < 0.5 else 0.9
                    continue
                break
            if not text:
                if finish in ('SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'):
                    last = ProviderError('blocked', f'finishReason={finish}')
                    break
                empty += 1
                last = ProviderError('empty', f'빈 응답(finishReason={finish})')
                if empty >= 2:
                    break
                continue
            data: Any = None
            if json_expected:
                try:
                    data = parse_json(text)
                except ValueError as exc:
                    parse_fail += 1
                    last = ProviderError('invalid_json', f'JSON 해석 실패: {exc}')
                    if parse_fail >= 2:
                        break
                    continue
            um = res.get('usageMetadata') or {}
            result = GenerationResult(data, text, model, int(um.get('promptTokenCount') or 0), int(um.get('candidatesTokenCount') or 0),
                                      int((time.time() - t0) * 1000), False, attempt, schema_dropped, cand.get('groundingMetadata'))
            self._cache_put(cache_path, {'stage': stage, 'model': model, 'data': data, 'text': text,
                                         'prompt_tokens': result.prompt_tokens, 'output_tokens': result.output_tokens})
            self.ledger.record(True, result)
            return result
        self.ledger.record(False, code=last.code)
        raise last

    # ------------------------------------------------------------ public API
    def search_web(self, *, stage: str, query: str, cancel: CancelCheck = None) -> GenerationResult:
        """Real Google Search grounding, with source metadata; no response-cache substitution."""
        system, contents = self._contents('공개된 웹 자료를 실제 Google 검색으로 조사하세요. 제조사 공식 제품·기술·사례 자료를 우선하고, 확인되지 않은 사양·가격·우열은 만들지 마세요. 핵심 사실과 비교 조건을 한국어로 간결하게 정리하고 출처로 뒷받침하세요.', query, None, None)
        return self._generate(stage=stage, system=system, contents=contents,
                              gen={'temperature': .2, 'maxOutputTokens': 4096}, model=self.model,
                              json_expected=False, cancel=cancel, max_attempts=2,
                              cache_allowed=False, tools=[{'google_search': {}}])

    def generate_json(self, *, stage: str, system: str = '', user: Optional[str] = None, schema: Optional[dict] = None,
                      temperature: float = 0.2, max_output_tokens: int = 8192, seed: Optional[int] = None, model: Optional[str] = None,
                      turns: Optional[Sequence[Any]] = None, images: Optional[Sequence[Any]] = None, cancel: CancelCheck = None,
                      max_attempts: int = 3, cache_allowed: bool = True) -> GenerationResult:
        sys_text, contents = self._contents(system, user, turns, images)
        gen: Dict[str, Any] = {'temperature': float(temperature), 'responseMimeType': 'application/json', 'maxOutputTokens': int(max_output_tokens)}
        if schema:
            gen['responseSchema'] = schema
        if seed is not None:
            gen['seed'] = int(seed)
        return self._generate(stage=stage, system=sys_text, contents=contents, gen=gen, model=model or self.model,
                              json_expected=True, cancel=cancel, max_attempts=max_attempts, cache_allowed=cache_allowed)

    def generate_text(self, *, stage: str, system: str = '', user: Optional[str] = None, turns: Optional[Sequence[Any]] = None,
                      temperature: float = 0.4, max_output_tokens: int = 8192, json_mode: bool = False, model: Optional[str] = None,
                      images: Optional[Sequence[Any]] = None, cancel: CancelCheck = None, max_attempts: int = 3) -> GenerationResult:
        sys_text, contents = self._contents(system, user, turns, images)
        gen: Dict[str, Any] = {'temperature': float(temperature), 'maxOutputTokens': int(max_output_tokens)}
        if json_mode:
            gen['responseMimeType'] = 'application/json'
        return self._generate(stage=stage, system=sys_text, contents=contents, gen=gen, model=model or self.model,
                              json_expected=False, cancel=cancel, max_attempts=max_attempts)

    @telemetry.streaming
    def stream_text(self, *, stage: str, system: str = '', user: Optional[str] = None, turns: Optional[Sequence[Any]] = None,
                    temperature: float = 0.4, max_output_tokens: int = 8192, json_mode: bool = False, model: Optional[str] = None,
                    images: Optional[Sequence[Any]] = None, cancel: CancelCheck = None, max_attempts: int = 3, schema: Optional[dict] = None, on_result: Optional[Callable] = None) -> Iterator[str]:
        """Yields the cumulative text after every streamed chunk. Retries only before the first chunk."""
        if not self.available:
            raise ProviderError('no_api_key', 'AI 인증 키가 서버에 설정되어 있지 않습니다.')
        sys_text, contents = self._contents(system, user, turns, images)
        gen: Dict[str, Any] = {'temperature': float(temperature), 'maxOutputTokens': int(max_output_tokens)}
        if json_mode:
            gen['responseMimeType'] = 'application/json'
            if schema:
                gen['responseSchema'] = schema
        body: Dict[str, Any] = {'contents': contents, 'generationConfig': gen}
        if sys_text:
            body['systemInstruction'] = {'parts': [{'text': sys_text}]}
        model = model or self.model
        req = self._request(model, body, stream=True)
        deadline=_Deadline(self.timeout)
        resp = None
        last = ProviderError('upstream_error', '응답이 없습니다.')
        for attempt in range(1, max(1, max_attempts) + 1):
            attempt_started=time.time()
            try:
                resp = self._open(req, cancel,deadline)
                break
            except ProviderError as exc:
                telemetry.emit('llm.usage',span_id=uuid.uuid4().hex[:16],parent_id=telemetry.current().get('span_id'),started=attempt_started,ended=time.time(),model=model,status='error',code=exc.code,usage=None,metadata={'transport':'stream','attempt':attempt})
                last=exc
                break
            except urllib.error.HTTPError as exc:
                telemetry.emit('llm.usage',span_id=uuid.uuid4().hex[:16],parent_id=telemetry.current().get('span_id'),started=attempt_started,ended=time.time(),model=model,status='error',code='http_'+str(exc.code),usage=None,metadata={'transport':'stream','attempt':attempt})
                detail = self._error_detail(exc)
                if exc.code in (429, 500, 502, 503, 504) and attempt < max_attempts:
                    last = ProviderError('rate_limited' if exc.code == 429 else 'upstream_unavailable', f'HTTP {exc.code}: {detail}', exc.code)
                    self._sleep(min(20, 2 ** (attempt - 1),max(0,deadline.at-time.monotonic())), cancel)
                    continue
                code = {400: 'bad_request', 401: 'auth_failed', 403: 'auth_failed', 404: 'model_not_found', 429: 'rate_limited'}.get(exc.code, 'http_error')
                last = ProviderError(code, f'HTTP {exc.code}: {detail}', exc.code)
                break
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
                telemetry.emit('llm.usage',span_id=uuid.uuid4().hex[:16],parent_id=telemetry.current().get('span_id'),started=attempt_started,ended=time.time(),model=model,status='error',code='network',usage=None,metadata={'transport':'stream','attempt':attempt})
                last = ProviderError('network', f'{type(exc).__name__}: {self.safe(exc)}')
                if attempt < max_attempts:
                    self._sleep(min(10, 2 ** (attempt - 1),max(0,deadline.at-time.monotonic())), cancel)
        if resp is None:
            self.ledger.record(False, code=last.code)
            raise last
        acc, t0, usage = '', time.time(), {}
        try:
            with resp:
                for raw in resp:
                    if time.monotonic()>=deadline.at:raise ProviderError('timeout','AI 스트림 응답 시간이 한도를 넘었습니다.')
                    if cancel and cancel():
                        raise ProviderError('cancelled', '작업이 취소되었습니다.')
                    line = raw.decode('utf-8', 'replace').strip() if isinstance(raw, bytes) else str(raw).strip()
                    if not line.startswith('data:'):
                        continue
                    try:
                        chunk = self.adapter.stream_chunk(json.loads(line[5:].strip()))
                    except ValueError:
                        continue
                    usage = chunk.get('usageMetadata') or usage
                    if (chunk.get('promptFeedback') or {}).get('blockReason'):
                        raise ProviderError('blocked', f"blockReason={chunk['promptFeedback']['blockReason']}")
                    cand = (chunk.get('candidates') or [{}])[0] or {}
                    finish = cand.get('finishReason')
                    if finish == 'MAX_TOKENS':
                        raise ProviderError('max_tokens', '모델 출력 한도를 초과해 응답이 잘렸습니다.')
                    if finish in ('SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'):
                        raise ProviderError('blocked', f'finishReason={finish}')
                    piece = ''.join(p.get('text', '') for p in (cand.get('content') or {}).get('parts', []) or [] if isinstance(p, dict) and not p.get('thought'))
                    if piece:
                        acc += piece
                        yield acc
        except ProviderError as exc:
            telemetry.emit('llm.usage',span_id=uuid.uuid4().hex[:16],parent_id=telemetry.current().get('span_id'),started=attempt_started,ended=time.time(),model=model,status='error',code=exc.code,message=str(exc),usage=usage or None,metadata={'transport':'stream'})
            self.ledger.record(False, code=exc.code)
            raise
        except GeneratorExit:
            telemetry.emit('llm.usage',span_id=uuid.uuid4().hex[:16],parent_id=telemetry.current().get('span_id'),started=attempt_started,ended=time.time(),model=model,status='cancelled',code='stream_closed',usage=usage or None,metadata={'transport':'stream'})
            raise
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            telemetry.emit('llm.usage',span_id=uuid.uuid4().hex[:16],parent_id=telemetry.current().get('span_id'),started=attempt_started,ended=time.time(),model=model,status='error',code='network',usage=usage or None,metadata={'transport':'stream'})
            self.ledger.record(False, code='network')
            raise ProviderError('network', f'스트림이 끊겼습니다: {type(exc).__name__}') from None
        telemetry.emit('llm.usage',span_id=uuid.uuid4().hex[:16],parent_id=telemetry.current().get('span_id'),started=attempt_started,ended=time.time(),model=model,status='ok' if acc else 'error',code='' if acc else 'empty',usage=usage or None,metadata={'transport':'stream'})
        if not acc:
            self.ledger.record(False, code='empty')
            raise ProviderError('empty', '빈 응답')
        result = GenerationResult(None, acc, model, int(usage.get('promptTokenCount') or 0),
                                  int(usage.get('candidatesTokenCount') or 0), int((time.time() - t0) * 1000))
        self.ledger.record(True, result)
        if on_result: on_result(result)

    def structured(self, schema_cls: Any, system: str, user: str, *, stage: str, temperature: float = 0.2,
                   max_output_tokens: int = 8192, cancel: CancelCheck = None) -> Any:
        """Pydantic model output; raises ProviderError / pydantic.ValidationError."""
        res = self.generate_json(stage=stage, system=system, user=user, schema=gemini_schema_from_model(schema_cls),
                                 temperature=temperature, max_output_tokens=max_output_tokens, cancel=cancel)
        return schema_cls.model_validate(res.data)

    def chat_model(self, temperature: float = 0.2) -> Any:
        """LangChain facade; never exposes a vendor SDK that bypasses the queue."""
        if not self.available:
            return None
        from .chat import queued_chat_model
        with self._chat_lock:
            if temperature not in self._chats:
                self._chats[temperature] = queued_chat_model(self, temperature)
            return self._chats[temperature]

    @staticmethod
    def _contents(system: str, user: Optional[str], turns: Optional[Sequence[Any]], images: Optional[Sequence[Any]]) -> Tuple[str, List[dict]]:
        if turns:
            sys2, contents = turns_to_contents(turns)
            system = '\n'.join(x for x in (system, sys2) if x)
        else:
            if user is None or not str(user).strip():
                raise ProviderError('bad_request', '프롬프트가 비어 있습니다.')
            contents = [{'role': 'user', 'parts': [{'text': str(user)}]}]
        parts = image_parts(images)
        if parts:
            target = next((c for c in reversed(contents) if c['role'] == 'user'), None)
            if target is None:
                contents.append({'role': 'user', 'parts': []})
                target = contents[-1]
            target['parts'] = list(target['parts']) + parts
        return system, contents


class GeminiProvider(LLMProvider):
    """Compatibility constructor. New code resolves the provider through get_provider."""
    def __init__(self, settings: Settings, urlopen=None, *, queue=None):
        super().__init__(settings, urlopen, adapter=GeminiAdapter(settings), queue=queue)
