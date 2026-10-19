"""Single Gemini provider for every PoC adapter and the generic ``/api/llm`` endpoint.

* REST ``generateContent`` / ``streamGenerateContent?alt=sse``; the credential travels only in the
  ``x-goog-api-key`` header, never in a URL, a response, a log line or an exception message.
* Retry rules merged from the three PoC backends (``rfp_pipeline.GeminiBackend``,
  ``proposal_score.llm.GeminiBackend``, ``sbagent.llm.GeminiBackend``): 429/5xx backoff, 400+schema →
  retry without ``responseSchema``, MAX_TOKENS / repetition → temperature 0.6 → 0.9, JSON parse
  failure retried once, ``thought`` parts ignored.
* Thread-safe requests-per-minute gate (LangGraph runs layout nodes in parallel).
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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Sequence, Tuple

from .settings import Settings

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
    for i in range(0, len(text) - unit, max(1, len(text) // 50)):
        frag = text[i:i + unit]
        if frag.strip() and '"' not in frag and text.count(frag) >= times:
            return True
    return False


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


class Ledger:
    """Process-wide usage counters (no prompts, no secrets)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.calls = 0
        self.ok = 0
        self.failed = 0
        self.cached = 0
        self.prompt_tokens = 0
        self.output_tokens = 0
        self.errors: Dict[str, int] = {}

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
                    'prompt_tokens': self.prompt_tokens, 'output_tokens': self.output_tokens, 'errors': dict(self.errors)}


# ---------------------------------------------------------------- provider
class GeminiProvider:
    name = 'gemini'

    def __init__(self, settings: Settings, urlopen: Optional[Callable[..., Any]] = None) -> None:
        self._key = settings.api_key()
        self.model = settings.model
        self.quick_model = settings.quick_model
        self.base = (settings.base_url or DEFAULT_BASE).rstrip('/')
        self.timeout = settings.timeout
        self.min_gap = 60.0 / settings.rpm if settings.rpm else 0.0
        self.cache_dir: Optional[Path] = settings.cache_dir if settings.llm_cache else None
        self._urlopen = urlopen or urllib.request.urlopen
        self._rate = threading.Lock()
        self._next = 0.0
        self._chat_lock = threading.Lock()
        self._chats: Dict[float, Any] = {}
        self.ledger = Ledger()

    def __repr__(self) -> str:
        return f'GeminiProvider(model={self.model!r}, available={self.available})'

    @property
    def available(self) -> bool:
        return bool(self._key)

    def model_for(self, tier: Optional[str]) -> str:
        return self.quick_model if (tier or '').lower() in ('quick', 'fast', 'small') else self.model

    def safe(self, text: Any) -> str:
        return redact(text, (self._key,))

    # ------------------------------------------------------------ transport
    def _headers(self) -> dict:
        return {'content-type': 'application/json', 'x-goog-api-key': self._key}

    def _wait_turn(self, cancel: CancelCheck) -> None:
        with self._rate:
            now = time.time()
            t = max(now, self._next)
            self._next = t + self.min_gap
        self._sleep(t - now, cancel)

    @staticmethod
    def _sleep(seconds: float, cancel: CancelCheck) -> None:
        end = time.time() + max(0.0, seconds)
        while True:
            if cancel and cancel():
                raise ProviderError('cancelled', '작업이 취소되었습니다.')
            left = end - time.time()
            if left <= 0:
                return
            time.sleep(min(0.25, left))

    def _error_detail(self, exc: urllib.error.HTTPError) -> str:
        try:
            raw = exc.read().decode('utf-8', 'replace')[:600]
        except Exception:  # noqa: BLE001
            raw = ''
        try:
            msg = json.loads(raw).get('error', {}).get('message', raw)
        except (ValueError, AttributeError):
            msg = raw
        return self.safe(msg)[:400]

    def _post(self, model: str, body: dict) -> dict:
        if not self._key:
            raise ProviderError('no_api_key', 'GEMINI_API_KEY 가 서버에 설정되어 있지 않습니다.')
        req = urllib.request.Request(f'{self.base}/models/{model}:generateContent', data=json.dumps(body).encode('utf-8'),
                                     method='POST', headers=self._headers())
        with self._urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))

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
            tmp = path.with_suffix('.tmp')
            tmp.write_text(json.dumps(rec, ensure_ascii=False), encoding='utf-8')
            tmp.replace(path)
        except OSError:
            pass

    # ------------------------------------------------------------ core
    def _generate(self, *, stage: str, system: str, contents: List[dict], gen: dict, model: str, json_expected: bool,
                  cancel: CancelCheck, max_attempts: int) -> GenerationResult:
        cache_path = self._cache_path({'model': model, 'stage': stage, 'system': system, 'contents': contents, 'gen': gen})
        rec = self._cache_get(cache_path)
        if rec is not None:
            result = GenerationResult(rec.get('data'), rec.get('text', ''), model, rec.get('prompt_tokens', 0), rec.get('output_tokens', 0), 0, True)
            self.ledger.record(True, result)
            return result
        gen = dict(gen)
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
            if system:
                body['systemInstruction'] = {'parts': [{'text': system}]}
            try:
                self._wait_turn(cancel)
                res = self._post(model, body)
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
                    try:
                        self._sleep(min(60, 3 * 2 ** (attempt - 1)), cancel)
                    except ProviderError as stop:
                        last = stop
                        break
                    continue
                code = {400: 'bad_request', 401: 'auth_failed', 403: 'auth_failed', 404: 'model_not_found'}.get(exc.code, 'http_error')
                last = ProviderError(code, f'HTTP {exc.code}: {detail}', exc.code)
                break
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
                last = ProviderError('network', f'{type(exc).__name__}: {self.safe(exc)}')
                try:
                    self._sleep(min(20, 2 ** (attempt - 1)), cancel)
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
                                      int((time.time() - t0) * 1000), False, attempt, schema_dropped)
            self._cache_put(cache_path, {'stage': stage, 'model': model, 'data': data, 'text': text,
                                         'prompt_tokens': result.prompt_tokens, 'output_tokens': result.output_tokens})
            self.ledger.record(True, result)
            return result
        self.ledger.record(False, code=last.code)
        raise last

    # ------------------------------------------------------------ public API
    def generate_json(self, *, stage: str, system: str = '', user: Optional[str] = None, schema: Optional[dict] = None,
                      temperature: float = 0.2, max_output_tokens: int = 8192, seed: Optional[int] = None, model: Optional[str] = None,
                      turns: Optional[Sequence[Any]] = None, images: Optional[Sequence[Any]] = None, cancel: CancelCheck = None,
                      max_attempts: int = 6) -> GenerationResult:
        sys_text, contents = self._contents(system, user, turns, images)
        gen: Dict[str, Any] = {'temperature': float(temperature), 'responseMimeType': 'application/json', 'maxOutputTokens': int(max_output_tokens)}
        if schema:
            gen['responseSchema'] = schema
        if seed is not None:
            gen['seed'] = int(seed)
        return self._generate(stage=stage, system=sys_text, contents=contents, gen=gen, model=model or self.model,
                              json_expected=True, cancel=cancel, max_attempts=max_attempts)

    def generate_text(self, *, stage: str, system: str = '', user: Optional[str] = None, turns: Optional[Sequence[Any]] = None,
                      temperature: float = 0.4, max_output_tokens: int = 8192, json_mode: bool = False, model: Optional[str] = None,
                      images: Optional[Sequence[Any]] = None, cancel: CancelCheck = None, max_attempts: int = 4) -> GenerationResult:
        sys_text, contents = self._contents(system, user, turns, images)
        gen: Dict[str, Any] = {'temperature': float(temperature), 'maxOutputTokens': int(max_output_tokens)}
        if json_mode:
            gen['responseMimeType'] = 'application/json'
        return self._generate(stage=stage, system=sys_text, contents=contents, gen=gen, model=model or self.model,
                              json_expected=False, cancel=cancel, max_attempts=max_attempts)

    def stream_text(self, *, stage: str, system: str = '', user: Optional[str] = None, turns: Optional[Sequence[Any]] = None,
                    temperature: float = 0.4, max_output_tokens: int = 8192, json_mode: bool = False, model: Optional[str] = None,
                    images: Optional[Sequence[Any]] = None, cancel: CancelCheck = None, max_attempts: int = 3) -> Iterator[str]:
        """Yields the cumulative text after every streamed chunk. Retries only before the first chunk."""
        if not self._key:
            raise ProviderError('no_api_key', 'GEMINI_API_KEY 가 서버에 설정되어 있지 않습니다.')
        sys_text, contents = self._contents(system, user, turns, images)
        gen: Dict[str, Any] = {'temperature': float(temperature), 'maxOutputTokens': int(max_output_tokens)}
        if json_mode:
            gen['responseMimeType'] = 'application/json'
        body: Dict[str, Any] = {'contents': contents, 'generationConfig': gen}
        if sys_text:
            body['systemInstruction'] = {'parts': [{'text': sys_text}]}
        model = model or self.model
        req = urllib.request.Request(f'{self.base}/models/{model}:streamGenerateContent?alt=sse', data=json.dumps(body).encode('utf-8'),
                                     method='POST', headers=self._headers())
        resp = None
        last = ProviderError('upstream_error', '응답이 없습니다.')
        for attempt in range(1, max(1, max_attempts) + 1):
            try:
                self._wait_turn(cancel)
                resp = self._urlopen(req, timeout=self.timeout)
                break
            except urllib.error.HTTPError as exc:
                detail = self._error_detail(exc)
                if exc.code in (429, 500, 502, 503, 504) and attempt < max_attempts:
                    last = ProviderError('rate_limited' if exc.code == 429 else 'upstream_unavailable', f'HTTP {exc.code}: {detail}', exc.code)
                    self._sleep(min(30, 3 * 2 ** (attempt - 1)), cancel)
                    continue
                code = {400: 'bad_request', 401: 'auth_failed', 403: 'auth_failed', 404: 'model_not_found', 429: 'rate_limited'}.get(exc.code, 'http_error')
                last = ProviderError(code, f'HTTP {exc.code}: {detail}', exc.code)
                break
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
                last = ProviderError('network', f'{type(exc).__name__}: {self.safe(exc)}')
                if attempt < max_attempts:
                    self._sleep(min(10, 2 ** (attempt - 1)), cancel)
        if resp is None:
            self.ledger.record(False, code=last.code)
            raise last
        acc, t0, usage = '', time.time(), {}
        try:
            with resp:
                for raw in resp:
                    if cancel and cancel():
                        raise ProviderError('cancelled', '작업이 취소되었습니다.')
                    line = raw.decode('utf-8', 'replace').strip() if isinstance(raw, bytes) else str(raw).strip()
                    if not line.startswith('data:'):
                        continue
                    try:
                        chunk = json.loads(line[5:].strip())
                    except ValueError:
                        continue
                    if (chunk.get('promptFeedback') or {}).get('blockReason'):
                        raise ProviderError('blocked', f"blockReason={chunk['promptFeedback']['blockReason']}")
                    usage = chunk.get('usageMetadata') or usage
                    cand = (chunk.get('candidates') or [{}])[0] or {}
                    piece = ''.join(p.get('text', '') for p in (cand.get('content') or {}).get('parts', []) or [] if isinstance(p, dict) and not p.get('thought'))
                    if piece:
                        acc += piece
                        yield acc
        except ProviderError as exc:
            self.ledger.record(False, code=exc.code)
            raise
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            self.ledger.record(False, code='network')
            raise ProviderError('network', f'스트림이 끊겼습니다: {type(exc).__name__}') from None
        if not acc:
            self.ledger.record(False, code='empty')
            raise ProviderError('empty', '빈 응답')
        self.ledger.record(True, GenerationResult(None, acc, model, int(usage.get('promptTokenCount') or 0),
                                                  int(usage.get('candidatesTokenCount') or 0), int((time.time() - t0) * 1000)))

    def structured(self, schema_cls: Any, system: str, user: str, *, stage: str, temperature: float = 0.2,
                   max_output_tokens: int = 8192, cancel: CancelCheck = None) -> Any:
        """Pydantic model output; raises ProviderError / pydantic.ValidationError."""
        res = self.generate_json(stage=stage, system=system, user=user, schema=gemini_schema_from_model(schema_cls),
                                 temperature=temperature, max_output_tokens=max_output_tokens, cancel=cancel)
        return schema_cls.model_validate(res.data)

    def chat_model(self, temperature: float = 0.2) -> Any:
        """LangChain chat model for a future tool-calling copilot (deepagents). None if unavailable."""
        if not self._key:
            return None
        with self._chat_lock:
            if temperature not in self._chats:
                try:
                    from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore
                except Exception:  # noqa: BLE001
                    return None
                self._chats[temperature] = ChatGoogleGenerativeAI(model=self.model, api_key=self._key, temperature=temperature,
                                                                  max_retries=2, timeout=self.timeout)
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


# ---------------------------------------------------------------- process-wide instance
_LOCK = threading.Lock()
_PROVIDER: Optional[GeminiProvider] = None
_OVERRIDE: Dict[str, Any] = {}


def get_provider(settings: Settings) -> Tuple[Optional[Any], str]:
    """(provider, reason). ``provider`` is None when no credential is configured (no network then)."""
    global _PROVIDER
    if 'provider' in _OVERRIDE:
        p = _OVERRIDE['provider']
        return (p, '') if p is not None and getattr(p, 'available', False) else (None, _OVERRIDE.get('reason') or 'provider_disabled')
    if not settings.has_key:
        return None, 'no_api_key'
    with _LOCK:
        if _PROVIDER is None or _PROVIDER._key != settings.api_key() or _PROVIDER.model != settings.model:
            _PROVIDER = GeminiProvider(settings)
        return _PROVIDER, ''


def set_provider_override(provider: Any = None, reason: str = '', clear: bool = False) -> None:
    """Test hook: force a provider (or none) for every adapter. ``clear=True`` restores normal resolution."""
    if clear:
        _OVERRIDE.clear()
    else:
        _OVERRIDE['provider'] = provider
        _OVERRIDE['reason'] = reason


def provider_usage() -> Optional[dict]:
    return _PROVIDER.ledger.view() if _PROVIDER is not None else None
