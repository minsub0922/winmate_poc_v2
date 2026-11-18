"""사내 모델 연결의 git 쪽 — :mod:`inhouse_contract` 의 클래스를 찾아 불러오고 앱에 잇는다.

* **찾기 · 불러오기**: ``WINMATE_INHOUSE_DIR``(기본 ``app/api/llm/inhouse``)의 ``gauss.py`` · ``clef.py`` 를 패키지 ``winmate_inhouse`` 로
  불러와 클래스 · 계약을 검사한다. 파일이 바뀌면 다음 확인 때 다시 불러온다(실행 중인 요청은 이전 것을 마저 쓴다).
* **LLM**: :class:`InhouseLLMAdapter` 가 ``internal`` 프로필의 어댑터가 된다(``adapters.create_adapter``). HTTP · 큐 · 재시도 ·
  사용량 기록은 :class:`~app.api.llm.provider.LLMProvider` 가 그대로 한다.
* **Decision**: :class:`InhouseDecisionClient` 가 Decision 순서의 ``inhouse`` 칸이 된다(``decision.get_decision``).
* **관리자**: :func:`llm_status` · :func:`decision_status` · :func:`probe_llm` · :func:`probe_decision` (admin/providers.py).
* **확인 명령**: ``python -m app.api.llm.inhouse_bridge check [--live]``.

사내 클래스가 없으면 이 모듈은 아무것도 바꾸지 않는다(기존 연결 그대로).
"""
from __future__ import annotations

import argparse
import base64
import dataclasses
import hashlib
import importlib
import json
import os
import re
import sys
import threading
import time
import types
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from . import inhouse_contract as c
from .. import telemetry

ROOT = Path(__file__).resolve().parents[3]
SEARCH_LIMIT = 8
PROBE_TIMEOUT = 8
_FINISH = {'stop': 'STOP', 'length': 'MAX_TOKENS', 'safety': 'SAFETY'}
# InhouseError.code → LLMProvider 오류 코드(같은 이름) / Decision 클라이언트 오류 코드
_DECISION_CODES = {'auth_failed': 'auth_failed', 'rate_limited': 'rate_limited', 'upstream_unavailable': 'upstream_error',
                   'timeout': 'upstream_timeout', 'network': 'upstream_error', 'model_not_found': 'upstream_error',
                   'upstream_error': 'upstream_error', 'invalid_output': 'invalid_output', 'bad_request': 'bad_request',
                   'unsupported_capability': 'bad_request', 'blocked': 'bad_request'}


# ---------------------------------------------------------------- 상태
@dataclass(frozen=True)
class Status:
    kind: str                           # 'llm' | 'decision'
    file: str                           # 저장소 기준 경로(또는 절대 경로)
    cls: str
    present: bool = False               # 파일이 있다
    loaded: bool = False                # 불러왔고 계약 검사를 통과했다
    ready: bool = False                 # 필수 키까지 있다(Decision 은 켜진 대상도 하나 이상)
    missing: Tuple[str, ...] = ()       # 빠진 설정 키 이름(값은 아님)
    error: str = ''                     # 불러오기 · 계약 · 생성 오류(키는 가림)
    capabilities: Tuple[str, ...] = ()
    targets: Tuple[dict, ...] = ()
    default_model: str = ''
    fingerprint: str = ''               # 파일 · 설정이 바뀌면 달라진다(설정 캐시 · 연결 다시 만들기)

    def view(self) -> dict:
        return {'kind': self.kind, 'file': self.file, 'class': self.cls, 'present': self.present, 'loaded': self.loaded,
                'ready': self.ready, 'missing': list(self.missing), 'error': self.error or None,
                'capabilities': list(self.capabilities), 'targets': [dict(t) for t in self.targets],
                'default_model': self.default_model or None}

    @property
    def problems(self) -> List[str]:
        """관리자 카드의 '빠진 것' 목록: 파일 · 클래스 오류 또는 빠진 키."""
        if not self.present:
            return [f'{self.file} · class {self.cls}']
        if self.error:
            return [f'{self.cls}: {self.error}'[:200]]
        if self.missing:
            return list(self.missing)
        if self.kind == 'decision' and not any(t.get('enabled') for t in self.targets):
            return [f'{self.cls}.targets() 에 켜진 대상 없음']
        return []


def _short(exc: BaseException, secrets: Sequence[str] = ()) -> str:
    from .provider import redact
    return redact(f'{type(exc).__name__}: {exc}', secrets)[:300]


def directory(environ: Optional[Mapping[str, str]] = None) -> Path:
    """The folder of the in-house classes: the given environment, then the process environment (a location of this process,
    also when a caller passes its own settings mapping — tests point it at their fixtures), then the root .env."""
    raw = ''
    for source in (environ or {}, os.environ):
        raw = str(source.get(c.DIR_ENV) or '').strip()
        if raw:
            break
    if not raw:
        from .. import runtime_env  # .env files as the given environment says (WINMATE_ENV_FILES=none → none)
        raw = str(runtime_env.env_values(environ, None).get(c.DIR_ENV) or '').strip()
    path = Path(raw).expanduser() if raw else Path(c.DEFAULT_DIR)
    return (path if path.is_absolute() else ROOT / path).resolve()


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


# ---------------------------------------------------------------- 불러오기
_LOCK = threading.RLock()
_LOADED: Dict[str, Any] = {'sig': None, 'classes': {}}
_INSTANCES: Dict[Tuple[str, str], Tuple[Any, Optional[str]]] = {}


def _signature(folder: Path) -> Tuple:
    try:
        files = sorted(folder.rglob('*.py'))
    except OSError:
        return (str(folder),)
    rows = []
    for f in files:
        if '__pycache__' in f.parts:
            continue
        try:
            st = f.stat()
            rows.append((str(f.relative_to(folder)), st.st_mtime_ns, st.st_size))
        except OSError:
            continue
    return (str(folder), tuple(rows))


def _reset_package(folder: Path) -> None:
    for name in [n for n in sys.modules if n == c.PACKAGE or n.startswith(c.PACKAGE + '.')]:
        sys.modules.pop(name, None)
    importlib.invalidate_caches()
    package = types.ModuleType(c.PACKAGE)
    package.__path__ = [str(folder)]  # type: ignore[attr-defined]
    package.__package__ = c.PACKAGE
    package.__file__ = None
    sys.modules[c.PACKAGE] = package
    _INSTANCES.clear()


def _overridden(cls: type, base: type, name: str) -> bool:
    return getattr(cls, name, None) is not getattr(base, name, None)


def _validate(kind: str, cls: Any) -> str:
    if kind == 'llm':
        if not (isinstance(cls, type) and issubclass(cls, c.InhouseLLM)):
            return f'{c.LLM_CLASS} 은 inhouse_contract.InhouseLLM 을 상속해야 합니다.'
        need = ['build', 'parse']
        caps = set(getattr(cls, 'CAPABILITIES', ()) or ())
        unknown = caps - set(c.CAPABILITIES)
        if unknown:
            return 'CAPABILITIES 에 모르는 값: ' + ', '.join(sorted(unknown))
        if 'stream' in caps:
            need.append('parse_stream')
        if 'search' in caps:
            need += ['build_search', 'parse_search']
        lacking = [n for n in need if not _overridden(cls, c.InhouseLLM, n)]
        if lacking:
            return '구현하지 않은 메서드: ' + ', '.join(lacking)
    else:
        if not (isinstance(cls, type) and issubclass(cls, c.InhouseDecision)):
            return f'{c.DECISION_CLASS} 은 inhouse_contract.InhouseDecision 을 상속해야 합니다.'
        lacking = [n for n in ('targets', 'answer') if not _overridden(cls, c.InhouseDecision, n)]
        if lacking:
            return '구현하지 않은 메서드: ' + ', '.join(lacking)
        types_ = set(getattr(cls, 'QUESTION_TYPES', ()) or ())
        if not set(c.QUESTION_TYPES) <= types_:
            return 'QUESTION_TYPES 는 choice · score · noul 을 모두 답해야 합니다(없는 유형은 클래스 안에서 바꿔 묻기).'
    for name in ('REQUIRED_ENV', 'OPTIONAL_ENV'):
        value = getattr(cls, name, ())
        if not isinstance(value, (tuple, list)) or not all(isinstance(k, str) for k in value):
            return f'{name} 는 설정 키 이름(문자열)의 tuple 이어야 합니다.'
    return ''


def _load_class(kind: str, folder: Path) -> Tuple[Optional[type], str, bool]:
    """(class, error, present)"""
    filename, classname = (c.LLM_FILE, c.LLM_CLASS) if kind == 'llm' else (c.DECISION_FILE, c.DECISION_CLASS)
    path = folder / filename
    if not path.is_file():
        return None, '', False
    sig = _signature(folder)
    with _LOCK:
        if _LOADED['sig'] != sig:
            _reset_package(folder)
            _LOADED['sig'], _LOADED['classes'] = sig, {}
        cached = _LOADED['classes'].get(kind)
        if cached is not None:
            return cached
        try:
            module = importlib.import_module(f'{c.PACKAGE}.{Path(filename).stem}')
            cls = getattr(module, classname, None)
            error = f'{_rel(path)} 에 class {classname} 가 없습니다.' if cls is None else _validate(kind, cls)
        except BaseException as exc:  # noqa: BLE001 — 사내 코드의 어떤 오류도 서버를 멈추지 않는다
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            # no class yet to name its keys: hide every secret-looking value the in-house classes could read
            values = _env_values(None, None)
            cls, error = None, '불러오기 실패 — ' + _short(exc, c.secret_values({k: v for k, v in values.items() if k.startswith(c.ENV_PREFIXES)}))
        result = (cls if not error else None, error, True)
        _LOADED['classes'][kind] = result
        return result


# ---------------------------------------------------------------- 설정 값
def _env_values(environ: Optional[Mapping[str, str]], files: Optional[Sequence[str]]) -> Dict[str, str]:
    """settings 와 같은 순서: 관리자 화면 값(environ 을 따로 주지 않았을 때만) > 실행 환경 > 루트 .env"""
    from .. import runtime_env
    merged = dict(runtime_env.env_values(environ, files))
    if environ is None:
        try:
            from ..poc import settings as cfg
            merged.update(cfg.overrides())
        except Exception:  # noqa: BLE001
            pass
    return merged


def context(cls: type, environ: Optional[Mapping[str, str]] = None, files: Optional[Sequence[str]] = None) -> c.InhouseContext:
    values = _env_values(environ, files)
    named = set(getattr(cls, 'REQUIRED_ENV', ())) | set(getattr(cls, 'OPTIONAL_ENV', ()))
    env = {k: str(v).strip() for k, v in values.items()
           if (k.startswith(c.ENV_PREFIXES) or k in named) and str(v or '').strip()}
    admin = values.get('WINMATE_ADMIN_DATA') or ''
    admin_runtime = Path(admin).expanduser() if admin else ROOT / 'admin' / 'runtime'
    return c.InhouseContext(env=types.MappingProxyType(env), root=ROOT, runtime=ROOT / 'app' / 'data' / 'runtime',
                            admin_runtime=(admin_runtime if admin_runtime.is_absolute() else ROOT / admin_runtime))


def _instance(kind: str, cls: type, ctx: c.InhouseContext) -> Tuple[Any, str]:
    key = (kind, hashlib.sha256(json.dumps([id(cls), sorted(ctx.env.items()), str(ctx.admin_runtime)]).encode()).hexdigest())
    with _LOCK:
        cached = _INSTANCES.get(key)
        if cached is None:
            try:
                cached = (cls(ctx), '')
            except BaseException as exc:  # noqa: BLE001
                if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                    raise
                cached = (None, '생성 실패 — ' + _short(exc, c.secret_values(ctx.env)))
            if len(_INSTANCES) > 32:
                _INSTANCES.clear()
            _INSTANCES[key] = cached
        return cached


def _target_view(t: Any) -> dict:
    return {'id': str(t.id), 'model': str(t.model), 'label': str(getattr(t, 'label', '') or t.id), 'enabled': bool(t.enabled),
            'max_tokens': int(getattr(t, 'max_tokens', 15_000) or 15_000), 'parallel': max(1, int(getattr(t, 'parallel', 1) or 1))}


def _resolve(kind: str, environ=None, files=None) -> Tuple[Any, Status]:
    folder = directory(environ)
    filename, classname = (c.LLM_FILE, c.LLM_CLASS) if kind == 'llm' else (c.DECISION_FILE, c.DECISION_CLASS)
    where = _rel(folder / filename)
    cls, error, present = _load_class(kind, folder)
    if not present:
        return None, Status(kind, where, classname)
    sig = _LOADED['sig']
    if cls is None:
        return None, Status(kind, where, classname, present=True, error=error,
                            fingerprint=hashlib.sha1(repr((sig, error)).encode()).hexdigest()[:16])
    ctx = context(cls, environ, files)
    missing = tuple(k for k in cls.REQUIRED_ENV if not ctx.env.get(k))
    if kind == 'llm' and not (ctx.env.get('INTERNAL_LLM_MODEL') or getattr(cls, 'DEFAULT_MODEL', '')) and 'INTERNAL_LLM_MODEL' not in missing:
        missing += ('INTERNAL_LLM_MODEL',)  # every call names a model: the setting, or the class's DEFAULT_MODEL
    impl, error = _instance(kind, cls, ctx)
    caps = tuple(sorted(getattr(cls, 'CAPABILITIES', ()) or ())) if kind == 'llm' else ()
    targets: Tuple[dict, ...] = ()
    if impl is not None and kind == 'decision':
        try:
            targets = tuple(_target_view(t) for t in impl.targets())
        except Exception as exc:  # noqa: BLE001
            error = 'targets() 실패 — ' + _short(exc, impl.secrets())
    default_model = str(getattr(cls, 'DEFAULT_MODEL', '') or '') if kind == 'llm' else next((t['model'] for t in targets if t['enabled']), '')
    ready = impl is not None and not error and not missing and (kind == 'llm' or any(t['enabled'] for t in targets))
    env_hash = hashlib.sha256(json.dumps(sorted(ctx.env.items())).encode()).hexdigest()[:12]
    fingerprint = hashlib.sha1(repr((sig, env_hash, ready, targets)).encode()).hexdigest()[:16]
    return (impl if ready else None), Status(kind, where, classname, present=True, loaded=True, ready=ready, missing=missing,
                                             error=error, capabilities=caps, targets=targets, default_model=default_model,
                                             fingerprint=fingerprint)


def llm(environ=None, files=None) -> Tuple[Optional[c.InhouseLLM], Status]:
    return _resolve('llm', environ, files)


def decision(environ=None, files=None) -> Tuple[Optional[c.InhouseDecision], Status]:
    return _resolve('decision', environ, files)


def training_adapter() -> Optional[c.InhouseDecision]:
    """Load the CLEF adapter even before it has a serving target."""
    cls, _, _ = _load_class('decision', directory())
    if cls is None:
        return None
    ctx = context(cls)
    if any(not ctx.env.get(key) for key in cls.REQUIRED_ENV):
        return None
    impl, _ = _instance('decision', cls, ctx)
    return impl


def llm_status(environ=None, files=None) -> Status:
    return llm(environ, files)[1]


def decision_status(environ=None, files=None) -> Status:
    return decision(environ, files)[1]


# ---------------------------------------------------------------- 오류 변환
def _provider_error(exc: BaseException, secrets: Sequence[str], *, stage: str) -> Exception:
    from .provider import ProviderError, RetryableProviderError, redact
    if isinstance(exc, ProviderError):
        return exc
    if isinstance(exc, c.InhouseError):
        message = redact(exc.message or exc.code, secrets)
        cls = RetryableProviderError if exc.code in c.RETRYABLE else ProviderError
        return cls(exc.code, message, exc.status)
    if isinstance(exc, NotImplementedError):
        return ProviderError('unsupported_capability', '사내 모델 연결이 이 기능을 구현하지 않았습니다.')
    if stage == 'build':
        return ProviderError('bad_request', '사내 모델 요청을 만들지 못했습니다 — ' + _short(exc, secrets))
    return ProviderError('invalid_output', '사내 모델 응답을 읽지 못했습니다 — ' + _short(exc, secrets))


def _call(fn: Callable[[], Any], secrets: Sequence[str], *, stage: str) -> Any:
    try:
        return fn()
    except BaseException as exc:  # noqa: BLE001
        if isinstance(exc, (KeyboardInterrupt, SystemExit)):
            raise
        raise _provider_error(exc, secrets, stage=stage) from None


def http_hosts(env: Mapping[str, str]) -> Tuple[str, ...]:
    """``INHOUSE_HTTP_HOSTS``: https 가 아닌데도 보내도 되는 사내 도메인 호스트 이름(쉼표)."""
    return tuple(h.strip().lower() for h in str(env.get('INHOUSE_HTTP_HOSTS') or '').split(',') if h.strip())


def http_request(http: c.HttpCall, extra_hosts: Sequence[str] = ()) -> urllib.request.Request:
    if not isinstance(http, c.HttpCall):
        raise TypeError('HttpCall 을 돌려줘야 합니다.')
    headers = {str(k): str(v) for k, v in (http.headers or {}).items()}
    data = http.data
    if http.json is not None:
        data = json.dumps(http.json, ensure_ascii=False).encode('utf-8')
        if not any(k.lower() == 'content-type' for k in headers):
            headers['Content-Type'] = 'application/json'
    from urllib.parse import urlsplit
    from ..poc.settings import allowed_endpoint
    parts = urlsplit(str(http.url or ''))
    listed = parts.scheme == 'http' and (parts.hostname or '').lower() in extra_hosts and not (parts.username or parts.password)
    if not (allowed_endpoint(http.url) or listed):
        raise ValueError('주소는 https, 또는 이 서버 · 사내망 주소의 http 여야 합니다(주소에 인증 정보 금지 · 다른 사내 도메인은 INHOUSE_HTTP_HOSTS).')
    return urllib.request.Request(http.url, data=data, method=(http.method or 'POST').upper(), headers=headers)


def decode(raw: bytes) -> Any:
    text = raw.decode('utf-8', 'replace') if isinstance(raw, (bytes, bytearray)) else str(raw)
    try:
        return json.loads(text)
    except ValueError:
        return text


# ---------------------------------------------------------------- LLM 어댑터 (LLMProvider 가 쓴다)
def _to_call(value: Any, stream: bool) -> c.LLMCall:
    from .adapters import json_schema
    messages = []
    for message in value.messages:
        parts = tuple(c.Part('text', text=b['text']) if b['type'] == 'text' else c.Part('image', mime=b['mime_type'], data=b['data'])
                      for b in message['content'])
        messages.append(c.Message('assistant' if message['role'] == 'assistant' else 'user', parts))
    return c.LLMCall(model=value.model, system=value.system or '', messages=tuple(messages), temperature=float(value.temperature),
                     max_output_tokens=int(value.max_output_tokens), json_mode=bool(value.json_mode),
                     schema=json_schema(value.schema) if value.schema else None, seed=value.seed, stream=stream)


def search_query(text: str) -> str:
    """검색 요청 글 → 검색어: '검색어:' 줄이 있으면 그 내용, 없으면 줄들을 ' / ' 로 이은 것(300자 이내)."""
    lines = [l.strip() for l in str(text or '').splitlines() if l.strip()]
    marked = [l.split(':', 1)[1].strip() for l in lines if re.match(r'^검색어\s*:', l)]
    return (marked[0] if marked else ' / '.join(lines))[:300]


def _usage(input_tokens, output_tokens) -> Optional[dict]:
    if input_tokens is None and output_tokens is None:
        return None
    a, b = int(input_tokens or 0), int(output_tokens or 0)
    return {'promptTokenCount': a, 'candidatesTokenCount': b, 'totalTokenCount': a + b}


def reply_envelope(reply: c.LLMReply) -> dict:
    if not isinstance(reply, c.LLMReply):
        raise TypeError('parse() 는 LLMReply 를 돌려줘야 합니다.')
    out = {'candidates': [{'content': {'parts': [{'text': str(reply.text or '')}]}, 'finishReason': _FINISH.get(reply.finish, 'STOP')}]}
    usage = _usage(reply.input_tokens, reply.output_tokens)
    if usage:
        out['usageMetadata'] = usage
    if reply.model:
        out['modelVersion'] = str(reply.model)
    return out


def delta_envelope(delta: c.LLMDelta) -> dict:
    if not isinstance(delta, c.LLMDelta):
        raise TypeError('parse_stream() 은 LLMDelta 또는 None 을 돌려줘야 합니다.')
    candidate: dict = {'content': {'parts': [{'text': str(delta.text or '')}]}}
    if delta.finish:
        candidate['finishReason'] = _FINISH.get(delta.finish, 'STOP')
    out = {'candidates': [candidate]}
    usage = _usage(delta.input_tokens, delta.output_tokens)
    if usage:
        out['usageMetadata'] = usage
    return out


def search_envelope(query: str, hits: Sequence[c.SearchHit]) -> dict:
    """사내 검색 결과 → Gemini grounding 과 같은 모양(시장조사 · 시뮬레이션이 이 모양을 읽는다)."""
    rows = [h for h in (hits or []) if isinstance(h, c.SearchHit) and re.match(r'^https?://', str(h.url or ''))][:SEARCH_LIMIT]
    chunks = [{'web': {'uri': h.url, 'title': h.title or h.url}} for h in rows]
    supports = [{'segment': {'text': h.snippet}, 'groundingChunkIndices': [i]} for i, h in enumerate(rows) if h.snippet]
    text = '\n'.join(f'- {h.title or h.url}: {h.snippet}'.rstrip(': ') for h in rows) or '검색 결과가 없습니다.'
    return {'candidates': [{'content': {'parts': [{'text': text}]}, 'finishReason': 'STOP',
                            'groundingMetadata': {'webSearchQueries': [query] if query else [], 'groundingChunks': chunks,
                                                  'groundingSupports': supports}}]}


class InhouseLLMAdapter:
    """``internal`` 프로필 어댑터 — 사내 클래스가 만든 요청을 LLMProvider 가 공용 큐로 보낸다."""
    name = 'internal'

    def __init__(self, settings: Any, impl: Optional[c.InhouseLLM], status: Status) -> None:
        self.impl, self.status = impl, status
        self.ready = bool(impl is not None and status.ready)
        self.capabilities = frozenset(status.capabilities)
        self.streams = 'stream' in self.capabilities
        self.default_model = status.default_model
        secrets: Tuple[str, ...] = ()
        opener = None
        if impl is not None:
            try:
                secrets = tuple(s for s in impl.secrets() if s)
            except Exception:  # noqa: BLE001
                secrets = c.secret_values(impl.env)
            try:
                opener = impl.opener()
            except Exception:  # noqa: BLE001
                opener = None
        self.secrets = secrets
        self.urlopen = opener
        self.hosts = http_hosts(impl.env) if impl is not None else ()

    def _need(self):
        if self.impl is None:
            from .provider import ProviderError
            raise ProviderError('no_api_key', '사내 LLM 연결(GaussLLM)이 준비되지 않았습니다: ' + ' · '.join(self.status.problems))
        return self.impl

    def request(self, value: Any, *, stream: bool = False) -> urllib.request.Request:
        from .provider import ProviderError
        impl = self._need()
        if value.web_search:
            if 'search' not in self.capabilities:
                raise ProviderError('unsupported_capability', '이 사내 모델 연결은 웹 검색을 지원하지 않습니다.')
            text = '\n'.join(b.get('text', '') for m in value.messages if m['role'] == 'user' for b in m['content'] if b['type'] == 'text')
            query = search_query(text)
            req = _call(lambda: http_request(impl.build_search(query, SEARCH_LIMIT), self.hosts), self.secrets, stage='build')
            req.winmate_kind = ('search', query)  # type: ignore[attr-defined]
            return req
        call = _to_call(value, stream)
        if call.has_images and 'image' not in self.capabilities:
            raise ProviderError('unsupported_capability', '이 사내 모델 연결은 이미지 입력을 지원하지 않습니다.')
        if call.json_mode and 'json' not in self.capabilities:
            call = dataclasses.replace(call, system='\n\n'.join(x for x in (call.system, c.json_instruction(call.schema)) if x))
        req = _call(lambda: http_request(impl.build(call), self.hosts), self.secrets, stage='build')
        req.winmate_kind = ('stream' if stream else 'generate', '')  # type: ignore[attr-defined]
        return req

    def response_bytes(self, raw: bytes, request: Any = None, status: int = 200) -> dict:
        impl = self._need()
        body = decode(raw)
        kind = getattr(request, 'winmate_kind', None) or ('generate', '')
        if kind[0] == 'search':
            hits = _call(lambda: impl.parse_search(status, body), self.secrets, stage='parse')
            return search_envelope(kind[1], list(hits or []))
        reply = _call(lambda: impl.parse(status, body), self.secrets, stage='parse')
        return _call(lambda: reply_envelope(reply), self.secrets, stage='parse')

    def response(self, value: dict) -> dict:
        impl = self._need()
        reply = _call(lambda: impl.parse(200, value), self.secrets, stage='parse')
        return _call(lambda: reply_envelope(reply), self.secrets, stage='parse')

    def stream_chunk(self, value: dict) -> dict:  # LLMProvider 는 stream_line 을 먼저 쓴다 — 호환용
        return value

    def stream_line(self, line: str) -> Optional[dict]:
        impl = self._need()
        delta = _call(lambda: impl.parse_stream(line), self.secrets, stage='parse')
        return None if delta is None else _call(lambda: delta_envelope(delta), self.secrets, stage='parse')

    def error_message(self, status: int, text: str) -> Optional[str]:
        if self.impl is None:
            return None
        try:
            err = self.impl.error(status, text)
        except Exception:  # noqa: BLE001
            return None
        if isinstance(err, c.InhouseError):
            from .provider import redact
            return redact(err.message or err.code, self.secrets)
        return None


def llm_adapter(settings: Any) -> Optional[InhouseLLMAdapter]:
    """``internal`` 프로필에 쓸 사내 어댑터 — 사내 클래스 파일이 없으면 None(기존 chat-completions 전송)."""
    impl, status = llm()
    return InhouseLLMAdapter(settings, impl, status) if status.present else None


def probe_llm(settings: Any) -> dict:
    """관리자 점검: 사내 클래스의 :meth:`probe` 요청(토큰 없음), 없으면 최소 생성 호출(사내 서버라 허용)."""
    impl, status = llm()
    if impl is None:
        return {'status': 'down', 'detail': '사내 LLM 연결이 준비되지 않았습니다: ' + ' · '.join(status.problems)}
    secrets = c.secret_values(impl.env)
    http = _call(impl.probe, secrets, stage='build')
    if http is None:
        from .provider import LLMProvider
        provider = LLMProvider(dataclasses.replace(settings, llm_cache=False))
        result = provider.generate_text(stage='admin:provider-probe', user='ping', max_output_tokens=16, max_attempts=1, temperature=0)
        return {'status': 'ok', 'detail': '상태 API 가 없어 최소 호출로 응답을 확인했습니다.', 'models': [result.model] if result.model else []}
    status_code, body = send(http, timeout=PROBE_TIMEOUT, opener=impl.opener(), hosts=http_hosts(impl.env))
    result = _call(lambda: impl.check_probe(status_code, body), secrets, stage='parse')
    return {'status': 'ok' if result.ok else 'degraded', 'detail': result.detail or ('서버가 응답했습니다.' if result.ok else '확인 필요'),
            **({'models': [str(m) for m in result.models][:40]} if result.models else {})}


def send(http: c.HttpCall, *, timeout: float, opener: Optional[Callable[..., Any]] = None, hosts: Sequence[str] = ()) -> Tuple[int, Any]:
    """요청 하나를 바로 보낸다(점검 · 확인 명령용 — 앱의 호출은 LLMProvider 의 큐를 거친다). HTTPError 는 그대로 올린다."""
    open_ = opener or urllib.request.urlopen
    with open_(http_request(http, hosts), timeout=timeout) as response:
        return int(getattr(response, 'status', 200) or 200), decode(response.read(4_000_000))


# ---------------------------------------------------------------- Decision 클라이언트 (decision.get_decision 이 쓴다)
_SEMAPHORES: Dict[str, Tuple[int, threading.BoundedSemaphore]] = {}
_SEM_LOCK = threading.Lock()


def _semaphore(target_id: str, parallel: int) -> threading.BoundedSemaphore:
    with _SEM_LOCK:
        held = _SEMAPHORES.get(target_id)
        if held is None or held[0] != parallel:
            held = _SEMAPHORES[target_id] = (parallel, threading.BoundedSemaphore(max(1, parallel)))
        return held[1]


class InhouseDecisionClient:
    """Decision 순서의 ``inhouse`` 칸 — :class:`~app.api.llm.decision.TypeSafeDecision` 과 같은 모양(ask · answer · model · available ·
    fallbacks · limits)."""
    name = 'inhouse'
    family = 'inhouse'
    base = ''

    def __init__(self, settings: Any, impl: Optional[c.InhouseDecision] = None, status: Optional[Status] = None, *, service: bool = False) -> None:
        from .decision import LIMITS, Limits
        if status is None:
            impl, status = decision()
        self._settings = settings
        self.impl, self.status = impl, status
        self._key = 'inhouse' if impl is not None and status.ready else ''
        self.targets = [t for t in status.targets if t['enabled']] if self._key else []
        if service and getattr(settings, 'single_decision', False):
            selected = settings.inhouse_target
            self.targets = [t for t in self.targets if not selected or t['id'] == selected][:1]
        self.model = self.targets[0]['model'] if self.targets else (status.default_model or '')
        self.timeout = max(int(getattr(settings, 'decision_timeout', 30) or 30), int(getattr(impl, 'TIMEOUT', 0) or 0))
        first = self.targets[0] if self.targets else None
        self.limits = Limits(first['max_tokens'], first['max_tokens'], first['parallel']) if first else LIMITS['clef']
        self.fallbacks: List[Any] = []

    @property
    def available(self) -> bool:
        return bool(self._key and self.targets)

    def ask(self, *, stage: str, state: Any, questions: Mapping[str, dict], cancel=None):
        from .decision import FALLBACK_CODES
        from .provider import ProviderError
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

    def answer(self, *, stage: str, state: Any, questions: Mapping[str, dict], cancel=None, model: Optional[str] = None,
               target: Optional[str] = None):
        """켜진 대상을 앞에서부터: 답하지 못하면(연결 · 시간 초과 · 인증 · 5xx/429) 다음 대상이 같은 질문에 답한다."""
        from .decision import FALLBACK_CODES, QUESTION_TYPES
        from .provider import ProviderError
        if not self.available:
            raise ProviderError('no_api_key', '사내 Decision 연결(ClefDecision)이 준비되지 않았습니다: ' + ' · '.join(self.status.problems))
        if not questions:
            raise ValueError('질문이 없습니다.')
        for qid, q in questions.items():
            if not isinstance(q, dict) or q.get('type') not in QUESTION_TYPES:
                raise ValueError(f'{qid}: 지원하지 않는 질문 유형 {q.get("type") if isinstance(q, dict) else q!r}')
        order = [t for t in self.targets if target in (None, t['id'])]
        if not order:
            raise ProviderError('bad_request', f'켜진 대상에 {target!r} 이 없습니다.')
        last: Optional[ProviderError] = None
        for t in order:
            try:
                return self._target(t, stage, state, questions, cancel, model)
            except ProviderError as exc:
                if exc.code not in FALLBACK_CODES:
                    raise
                last = exc
        raise last  # type: ignore[misc]

    def _target(self, t: dict, stage, state, questions, cancel, model):
        from .decision import DecisionResult, plan_batches
        batches = plan_batches(state, questions, t['max_tokens'], t['max_tokens'])
        if len(batches) == 1:
            return self._ask_one(t, stage, state, batches[0], cancel, model)
        started = time.time()
        ctx = telemetry.current()

        def one(batch):
            with telemetry.scope(**ctx):
                return self._ask_one(t, stage, state, batch, cancel, model)
        with ThreadPoolExecutor(max_workers=min(t['parallel'], len(batches))) as pool:
            parts = list(pool.map(one, batches))
        answers: Dict[str, dict] = {}
        for part in parts:
            answers.update(part.answers)
        return DecisionResult(answers=answers, model=parts[0].model, ms=int((time.time() - started) * 1000),
                              input_tokens=sum(p.input_tokens for p in parts), output_tokens=sum(p.output_tokens for p in parts),
                              attempts=max(p.attempts for p in parts))

    def _ask_one(self, t: dict, stage: str, state: Any, questions: Mapping[str, dict], cancel, model: Optional[str]):
        from .decision import DecisionResult, TypeSafeDecision
        from .provider import ProviderError, redact
        model = model or t['model']
        started = time.time()
        deadline = started + self.timeout
        context_ = telemetry.current()
        span = uuid.uuid4().hex[:16]
        secrets = self.impl.secrets() if self.impl is not None else ()
        meta = {'provider': self.name, 'target': t['id']}
        with telemetry.scope(trace_id=context_.get('trace_id') or uuid.uuid4().hex, parent_id=context_.get('span_id'), span_id=span,
                             stage=stage, feature=context_.get('feature') or stage.split(':')[0]):
            telemetry.emit('llm.logical', started=started, status='running', model=model, metadata=meta)
            gate = _semaphore(t['id'], t['parallel'])
            try:
                while not gate.acquire(timeout=0.1):  # 이 서버가 받는 동시 요청 수를 넘지 않게 줄을 선다
                    if cancel and cancel():
                        raise ProviderError('cancelled', '취소했어요.')
                    if time.time() >= deadline:
                        raise ProviderError('upstream_timeout', '사내 Decision 서버의 차례를 기다리다 시간이 지났습니다.')
                try:
                    call = c.DecisionCall(target=t['id'], model=model, state=state, questions=dict(questions),
                                          timeout=max(1.0, deadline - time.time()), cancel=cancel)
                    reply = self.impl.answer(call)  # type: ignore[union-attr]
                except c.InhouseError as exc:
                    raise ProviderError(_DECISION_CODES.get(exc.code, 'upstream_error'), redact(exc.message or exc.code, secrets), exc.status) from None
                except ProviderError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    raise ProviderError('upstream_error', '사내 Decision 오류 — ' + _short(exc, secrets)) from None
                finally:
                    gate.release()
                if not isinstance(reply, c.DecisionReply):
                    raise ProviderError('invalid_output', 'answer() 는 DecisionReply 를 돌려줘야 합니다.')
                answers = TypeSafeDecision._validate({'answers': dict(reply.answers or {})}, questions)
            except Exception as exc:
                telemetry.emit('llm.logical', started=started, ended=time.time(), status='error', code=getattr(exc, 'code', type(exc).__name__),
                               message=str(exc), model=model, metadata=meta)
                raise
            result = DecisionResult(answers=answers, model=str(reply.model or model), ms=int((time.time() - started) * 1000),
                                    input_tokens=int(reply.input_tokens or 0), output_tokens=int(reply.output_tokens or 0), attempts=1)
            telemetry.emit('llm.logical', started=started, ended=time.time(), status='ok', model=result.model,
                           metadata={**meta, 'questions': len(questions)})
            telemetry.emit('llm.usage', parent_id=span, started=started, ended=time.time(), model=result.model, status='ok',
                           usage={'promptTokenCount': result.input_tokens, 'candidatesTokenCount': result.output_tokens,
                                  'totalTokenCount': result.input_tokens + result.output_tokens},
                           metadata={'transport': 'decision', **meta, 'questions': len(questions)},
                           **telemetry.content({'model': model, 'state': state, 'questions': dict(questions)}, {'answers': answers}))
            return result


def decision_client(settings: Any) -> InhouseDecisionClient:
    return InhouseDecisionClient(settings)


def probe_decision(settings: Any, target: Optional[str] = None) -> dict:
    """관리자 점검: 사내 클래스의 :meth:`probe` (토큰 없음), 없으면 짧은 질문 하나."""
    client = InhouseDecisionClient(settings)
    if not client.available:
        return {'status': 'down', 'detail': '사내 Decision 연결이 준비되지 않았습니다: ' + ' · '.join(client.status.problems)}
    t = next((x for x in client.targets if target in (None, x['id'])), None)
    if t is None:
        return {'status': 'down', 'detail': '선택한 사내 CLEF 대상이 비활성 상태입니다.'}
    impl = client.impl
    secrets = impl.secrets()
    try:
        result = impl.probe(t['id'])
    except c.InhouseError as exc:
        from .provider import redact
        return {'status': 'down', 'detail': redact(exc.message or exc.code, secrets)}
    if result is None:
        from .decision import noul
        client.answer(stage='admin:provider-probe', state='ping', questions={'q': noul('이 글은 한 단어다.')}, target=t['id'])
        return {'status': 'ok', 'detail': f"상태 API 가 없어 질문 하나로 응답을 확인했습니다({t['label']}).", 'models': [t['model']]}
    return {'status': 'ok' if result.ok else 'degraded', 'detail': result.detail or ('서버가 응답했습니다.' if result.ok else '확인 필요'),
            **({'models': [str(m) for m in result.models][:40]} if result.models else {'models': [t['model']]})}


# ---------------------------------------------------------------- 확인 명령 (사내망 코드 에이전트용)
_PNG = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mO4IydHEmIY1TCqYfhqAACaMxgQdrf9VwAAAABJRU5ErkJggg=='  # 16×16 red, checked decodable


def _line(ok: Optional[bool], title: str, detail: str = '') -> None:
    mark = {True: 'PASS', False: 'FAIL', None: 'SKIP'}[ok]
    print(f'  {mark:4}  {title}' + (f' — {detail}' if detail else ''))


def _check_shape(impl: c.InhouseLLM, status: Status) -> List[bool]:
    results = []
    samples = [('텍스트', c.LLMCall(model=status.default_model or impl.env.get('INTERNAL_LLM_MODEL', 'model'), system='한국어로 답하세요.',
                                     messages=(c.Message('user', (c.Part('text', text='안녕하세요'),)),)))]
    samples.append(('JSON', dataclasses.replace(samples[0][1], json_mode=True, schema={'type': 'object', 'properties': {'ok': {'type': 'boolean'}}})))
    if 'image' in status.capabilities:
        samples.append(('이미지', dataclasses.replace(samples[0][1], messages=(c.Message('user', (c.Part('text', text='이 그림의 색은?'),
                                                                                              c.Part('image', mime='image/png', data=_PNG))),))))
    if 'stream' in status.capabilities:
        samples.append(('스트림', dataclasses.replace(samples[0][1], stream=True)))
    for title, call in samples:
        try:
            req = http_request(impl.build(call), http_hosts(impl.env))
            _line(True, f'build({title})', f'{req.get_method()} {req.full_url.split("?")[0]}')
            results.append(True)
        except Exception as exc:  # noqa: BLE001
            _line(False, f'build({title})', _short(exc, impl.secrets()))
            results.append(False)
    if 'search' in status.capabilities:
        try:
            req = http_request(impl.build_search('스마트 오피스 시장 규모 2025', SEARCH_LIMIT), http_hosts(impl.env))
            _line(True, 'build_search', f'{req.get_method()} {req.full_url.split("?")[0]}')
            results.append(True)
        except Exception as exc:  # noqa: BLE001
            _line(False, 'build_search', _short(exc, impl.secrets()))
            results.append(False)
    return results


def _live_llm(status: Status) -> List[bool]:
    from ..poc.settings import provider_settings
    from .provider import LLMProvider, ProviderError
    settings = dataclasses.replace(provider_settings('internal'), llm_cache=False)
    provider = LLMProvider(settings)
    results = []

    def run(title, fn, check):
        started = time.time()
        try:
            value = fn()
            ok, detail = check(value)
            _line(ok, title, f'{detail} · {int((time.time() - started) * 1000)}ms')
            results.append(ok)
        except ProviderError as exc:
            _line(False, title, f'{exc.code}: {exc.message}')
            results.append(False)
        except Exception as exc:  # noqa: BLE001
            _line(False, title, _short(exc, provider.adapter.secrets))
            results.append(False)

    run('generate_text', lambda: provider.generate_text(stage='inhouse:check', user="'연결 확인'이라고만 답하세요.", max_output_tokens=64, max_attempts=1),
        lambda r: (bool(r.text.strip()), f'{r.text.strip()[:40]!r} · 토큰 {r.prompt_tokens}/{r.output_tokens}'))
    run('generate_json', lambda: provider.generate_json(stage='inhouse:check', system='JSON 하나로만 답하세요.', user='{"ok": true} 를 그대로 돌려주세요.',
                                                       schema={'type': 'OBJECT', 'properties': {'ok': {'type': 'BOOLEAN'}}}, max_output_tokens=64, max_attempts=2),
        lambda r: (isinstance(r.data, dict), f'{r.data!r}'[:60]))
    if 'image' in status.capabilities:
        run('이미지 입력', lambda: provider.generate_text(stage='inhouse:check', user='이 그림을 한 단어로 설명하세요.', images=['data:image/png;base64,' + _PNG],
                                                       model=provider.model_for('vision'), max_output_tokens=64, max_attempts=1),
            lambda r: (bool(r.text.strip()), f'{r.text.strip()[:40]!r}'))
    else:
        _line(None, '이미지 입력', "CAPABILITIES 에 'image' 없음 — 이미지가 든 호출은 대체 연결 또는 unsupported_capability")
    run('stream_text', lambda: list(provider.stream_text(stage='inhouse:check', user='하나, 둘, 셋을 한 줄에 쓰세요.', max_output_tokens=64, max_attempts=1)),
        lambda chunks: (bool(chunks) and bool(chunks[-1].strip()), f'조각 {len(chunks)}개 · {chunks[-1][:40]!r}' if chunks else '빈 스트림'))
    if 'search' in status.capabilities:
        run('search_web', lambda: provider.search_web(stage='inhouse:check', query='검색어: 스마트 오피스 시장 규모'),
            lambda r: (bool((r.grounding or {}).get('groundingChunks')), f"출처 {len((r.grounding or {}).get('groundingChunks') or [])}개"))
    else:
        _line(None, 'search_web', "CAPABILITIES 에 'search' 없음 — 시장조사는 근거 DB · 사이트 검색만 쓴다")
    return results


def _live_decision() -> List[bool]:
    from ..poc.settings import get_settings
    from .decision import choice, noul, score
    from .provider import ProviderError
    client = InhouseDecisionClient(get_settings())
    results = []
    questions = {'pick': choice('고객이 가장 중요하게 보는 것은?', {'price': '초기 도입 비용 절감', 'performance': '최고 성능'}),
                 'fit': score('요청과의 관련도', ['관계없음', '약함', '적합', '매우 적합']),
                 'sensitive': noul('고객은 가격에 민감하다.')}
    for t in client.targets:
        started = time.time()
        try:
            r = client.answer(stage='inhouse:check', state='고객은 초기 도입 비용 절감을 최우선으로 요청했다.', questions=questions, target=t['id'])
            _line(True, f"answer({t['id']})", f"pick={r.answers['pick']['choice']} · fit={r.answers['fit'].get('score')} · "
                                             f"sensitive={r.answers['sensitive']['noul']:.2f} · {int((time.time() - started) * 1000)}ms")
            results.append(True)
        except (ProviderError, ValueError) as exc:
            _line(False, f"answer({t['id']})", str(exc)[:200])
            results.append(False)
    return results


def check(live: bool = False) -> int:
    folder = directory()
    print(f'사내 연결 폴더: {_rel(folder)}  ({c.DIR_ENV} 로 바꿀 수 있음)')
    results: List[bool] = []
    for kind in ('llm', 'decision'):
        impl, status = _resolve(kind)
        title = f'{status.cls} ({status.file})'
        print(f'\n[{kind}] {title}')
        if not status.present:
            _line(None, '파일 없음', '이 연결은 쓰지 않습니다(기존 연결 그대로)')
            continue
        _line(status.loaded and not status.error, '불러오기 · 계약 검사', status.error)
        results.append(status.loaded and not status.error)
        if status.missing:
            _line(False, '필수 설정 키', '빠짐: ' + ', '.join(status.missing))
            results.append(False)
        elif status.loaded:
            _line(True, '필수 설정 키')
        if kind == 'llm':
            print('        기능: ' + (', '.join(status.capabilities) or '-'))
            if impl is not None:
                results += _check_shape(impl, status)
                if live:
                    results += _live_llm(status)
        else:
            for t in status.targets:
                print(f"        대상 {t['id']}: {t['model']} · {'켜짐' if t['enabled'] else '꺼짐'} · 요청당 {t['max_tokens']} 토큰 · 동시 {t['parallel']}")
            if status.loaded and not status.error:
                ok = any(t['enabled'] for t in status.targets)
                _line(ok, '켜진 대상', '' if ok else 'targets() 에 enabled=True 인 대상이 없습니다')
                results.append(ok)
            if impl is not None and live:
                results += _live_decision()
    if not live:
        print('\n실제 호출까지 확인하려면 --live')
    failed = results.count(False)
    print(f'\n결과: 통과 {results.count(True)} · 실패 {failed}')
    return 1 if failed else 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog='python -m app.api.llm.inhouse_bridge', description='사내 모델 연결(GaussLLM · ClefDecision) 확인')
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('check', help='파일 · 클래스 · 키 · 요청 모양 확인')
    p.add_argument('--live', action='store_true', help='실제 호출까지(텍스트 · JSON · 이미지 · 스트림 · 검색 · Decision)')
    args = parser.parse_args(argv)
    sys.dont_write_bytecode = True
    return check(live=args.live)


if __name__ == '__main__':
    raise SystemExit(main())
