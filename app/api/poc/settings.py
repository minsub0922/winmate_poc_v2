"""Server-side settings for the PoC adapters.

Values are read only when :func:`get_settings` is first called at server runtime (never at import).
Precedence for every key: ``os.environ`` > ``app/.env`` > ``poc/.env``. ``.env`` files are parsed
locally; nothing is copied into ``os.environ``. ``WINMATE_ENV_FILES`` overrides the file list
(comma separated, relative to the repository root) and ``none`` disables file reading entirely.

Strict real-only runtime: every function always runs against the shared model provider. There is no
dummy mode and no per-function switch. ``Settings.mode`` / ``Settings.functions`` keep their read-only
shape (``'real'`` everywhere) for compatibility. Legacy ``WINMATE_MODE`` / ``WINMATE_<FUNC>_MODE`` values
other than ``real`` are **not honored**: they are listed in ``legacy_ignored`` and reported as warnings.

Keys
  WINMATE_LLM_PROVIDER         internal (default) | gemini | registered adapter
  INTERNAL_LLM_API_KEY         internal model credential (server only)
  INTERNAL_LLM_MODEL           internal model identifier
  INTERNAL_LLM_BASE_URL        internal model endpoint
  GEMINI_API_KEY               Gemini credential when explicitly selected
  GEMINI_MODEL                 default model (gemini-3.1-flash-lite)
  GEMINI_QUICK_MODEL           model for model_tier=quick (default: GEMINI_MODEL)
  GEMINI_BASE_URL              https endpoint override (an internal gateway, for example)
  WINMATE_GEMINI_TIMEOUT       seconds per operation including retries, excluding queue wait (default 60)
  WINMATE_GEMINI_RPM           legacy alias, clamped to 1–42 (default 42)
  WINMATE_LLM_CACHE            on | off (default off) — response cache under app/data/runtime only
  WINMATE_KB_CACHE             on | off (default off) — layout card cache under app/data/runtime only

Provider-specific INTERNAL_LLM_* / GEMINI_* settings take precedence over shared WINMATE_LLM_* aliases.
The queue is shared by every model/feature. RPM cannot exceed 42 or be disabled.
See app/.env.example and app/README.md for SQLite/Redis and internal model setup.
"""
from __future__ import annotations

import os
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, Mapping, Optional, Tuple
from urllib.parse import urlsplit

from .imports import ROOT, RUNTIME_DIR

FUNCTIONS = ('rfp', 'requirements', 'layout', 'search', 'rerank', 'review', 'storyboard', 'part', 'fill', 'simulation', 'llm')
MODES = ('real',)
DEFAULT_PROVIDER = 'internal'
DEFAULT_MODEL = 'gemini-3.1-flash-lite'
DEFAULT_VISION_MODEL = 'gemini-3.8-flash'
DEFAULT_ENV_FILES = ('app/.env', 'poc/.env')
_ENV_LINE = re.compile(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
_KEYS = ('WINMATE_MODE', *(f'WINMATE_{f.upper()}_MODE' for f in FUNCTIONS), 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_QUICK_MODEL',
         'GEMINI_VISION_MODEL', 'GEMINI_BASE_URL', 'WINMATE_GEMINI_TIMEOUT', 'WINMATE_GEMINI_RPM', 'WINMATE_GEMINI_CONCURRENCY', 'WINMATE_LLM_CACHE', 'WINMATE_KB_CACHE',
         'WINMATE_LLM_PROVIDER', 'WINMATE_LLM_API_KEY', 'WINMATE_LLM_MODEL', 'WINMATE_LLM_QUICK_MODEL', 'WINMATE_LLM_VISION_MODEL',
         'WINMATE_LLM_BASE_URL', 'WINMATE_LLM_TIMEOUT', 'WINMATE_LLM_RPM', 'WINMATE_LLM_CONCURRENCY', 'WINMATE_LLM_QUEUE_BACKEND',
         'WINMATE_LLM_QUEUE_DB', 'WINMATE_LLM_REDIS_URL', 'WINMATE_LLM_QUEUE_NAMESPACE', 'WINMATE_LLM_QUEUE_TIMEOUT', 'WINMATE_LLM_SCHEMA_MODE',
         'INTERNAL_LLM_API_KEY', 'INTERNAL_LLM_MODEL', 'INTERNAL_LLM_QUICK_MODEL', 'INTERNAL_LLM_VISION_MODEL', 'INTERNAL_LLM_BASE_URL')


def parse_env_file(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeDecodeError):
        return out
    for line in lines:
        if line.lstrip().startswith('#'):
            continue
        m = _ENV_LINE.match(line)
        if m and m.group(1) in _KEYS:
            value = m.group(2)
            if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
                value = value[1:-1]
            elif ' #' in value:
                value = value.split(' #', 1)[0].rstrip()
            out[m.group(1)] = value
    return out


def _flag(value: Optional[str]) -> bool:
    return str(value or '').strip().lower() in ('1', 'on', 'true', 'yes')


@dataclass(frozen=True)
class Settings:
    mode: str
    functions: Dict[str, str]
    model: str
    quick_model: str
    base_url: str
    timeout: int
    rpm: int
    llm_cache: bool
    kb_cache: bool
    key_source: str = ''                 # label only: environ | app/.env | poc/.env | ''
    warnings: Tuple[str, ...] = ()
    legacy_ignored: Tuple[str, ...] = ()  # legacy mode keys that were set to something other than 'real' (ignored)
    vision_model: str = DEFAULT_VISION_MODEL
    _api_key: str = field(default='', repr=False, compare=False)
    provider: str = DEFAULT_PROVIDER
    concurrency: int = 4
    queue_backend: str = 'sqlite'
    queue_db: Path = field(default_factory=lambda: RUNTIME_DIR / 'llm-queue.sqlite')
    queue_redis_url: str = field(default='', repr=False)
    queue_namespace: str = 'winmate-llm'
    queue_timeout: int = 600
    schema_mode: str = 'json_object'

    @property
    def has_key(self) -> bool:
        return bool(self._api_key)

    def api_key(self) -> str:
        """The credential, for the provider only. Never put this into responses or logs."""
        return self._api_key

    def function_mode(self, name: str) -> str:
        """Always ``'real'`` (read-only compatibility shape; legacy dummy config is not honored)."""
        return 'real'

    @property
    def cache_dir(self) -> Path:
        return RUNTIME_DIR / 'llm-cache'

    def public(self) -> dict:
        host = urlsplit(self.base_url).hostname if self.base_url else ('generativelanguage.googleapis.com' if self.provider == 'gemini' else None)
        return {'mode': 'real', 'function_mode': 'always_real', 'functions': {f: 'real' for f in FUNCTIONS}, 'model': self.model,
                'quick_model': self.quick_model, 'vision_model': self.vision_model, 'endpoint_host': host, 'timeout_s': self.timeout, 'rpm': self.rpm, 'llm_cache': self.llm_cache,
                'provider': self.provider, 'queue_backend': self.queue_backend, 'queue_timeout_s': self.queue_timeout, 'concurrency': self.concurrency,
                'kb_cache': self.kb_cache, 'api_key_configured': self.has_key, 'api_key_source': self.key_source or None,
                'legacy_ignored': list(self.legacy_ignored), 'warnings': list(self.warnings)}

    def __repr__(self) -> str:  # never include the credential
        return f'Settings(mode={self.mode!r}, functions={self.functions!r}, model={self.model!r}, api_key_configured={self.has_key})'


def load_settings(environ: Optional[Mapping[str, str]] = None, env_files: Optional[Iterable[str]] = None) -> Settings:
    environ = os.environ if environ is None else environ
    if env_files is None:
        raw = environ.get('WINMATE_ENV_FILES')
        if raw is not None:
            env_files = () if raw.strip().lower() in ('', 'none', 'off') else tuple(x.strip() for x in raw.split(',') if x.strip())
        else:
            env_files = DEFAULT_ENV_FILES
    layers: list[tuple[str, Mapping[str, str]]] = [('environ', environ)]
    for rel in env_files:
        path = (ROOT / rel).resolve()
        if path.is_file():
            layers.append((rel, parse_env_file(path)))

    def get(key: str) -> tuple[str, str]:
        for label, layer in layers:
            value = layer.get(key)
            if value is not None and str(value).strip() != '':
                return str(value).strip(), label
        return '', ''

    warnings: list[str] = []
    legacy: list[str] = []
    for legacy_key in ('WINMATE_MODE', *(f'WINMATE_{f.upper()}_MODE' for f in FUNCTIONS)):
        value, source = get(legacy_key)
        if value and value.lower() != 'real':
            legacy.append(legacy_key)
            warnings.append(f'{legacy_key}={value.lower()[:20]!r} ({source}) 는 더 이상 지원하지 않아 무시합니다 — 서버는 항상 실제 AI로만 실행합니다.')
    functions = {name: 'real' for name in FUNCTIONS}
    provider = get('WINMATE_LLM_PROVIDER')[0].lower() or DEFAULT_PROVIDER

    def model_setting(generic: str, legacy: str = '') -> tuple[str, str]:
        # Keep both provider profiles in one .env without sharing credentials/models.
        if provider == 'gemini':
            specific = legacy
        elif provider == 'internal':
            specific = generic.replace('WINMATE_LLM_', 'INTERNAL_LLM_', 1)
        else:
            specific = ''
        value = get(specific) if specific else ('', '')
        return value if value[0] else get(generic)

    key, key_source = model_setting('WINMATE_LLM_API_KEY', 'GEMINI_API_KEY')
    if not key:
        warnings.append('AI 인증 키가 없습니다 — 모든 AI 기능이 503(no_api_key)으로 거절됩니다.')
    model = model_setting('WINMATE_LLM_MODEL', 'GEMINI_MODEL')[0] or (DEFAULT_MODEL if provider == 'gemini' else '')
    quick = model_setting('WINMATE_LLM_QUICK_MODEL', 'GEMINI_QUICK_MODEL')[0] or model
    base, _ = model_setting('WINMATE_LLM_BASE_URL', 'GEMINI_BASE_URL')
    if base and not (base.startswith('https://') or base.startswith('http://127.0.0.1') or base.startswith('http://localhost')):
        warnings.append('AI 서버 주소는 https 주소(또는 로컬 게이트웨이)만 허용해 기본 주소를 씁니다.')
        base = ''
    if provider != 'gemini' and (not base or not model):
        warnings.append('선택한 모델의 API 주소와 모델 ID가 필요합니다. internal은 INTERNAL_LLM_BASE_URL · INTERNAL_LLM_MODEL을 설정하세요.')

    def number(key: str, default: int, lo: int, hi: int) -> int:
        value, _ = get(key)
        try:
            return max(lo, min(hi, int(value))) if value else default
        except ValueError:
            warnings.append(f'서버의 숫자 설정이 올바르지 않아 기본값 {default} 을 씁니다.')
            return default

    def compatible_number(generic, legacy, default, lo, hi):
        return number(generic if get(generic)[0] else legacy, default, lo, hi)

    queue_backend = get('WINMATE_LLM_QUEUE_BACKEND')[0].lower() or 'sqlite'
    if queue_backend not in ('sqlite', 'redis'):
        raise ValueError('WINMATE_LLM_QUEUE_BACKEND는 sqlite 또는 redis여야 합니다.')
    redis_url = get('WINMATE_LLM_REDIS_URL')[0]
    if queue_backend == 'redis' and not redis_url:
        raise ValueError('Redis 큐에는 WINMATE_LLM_REDIS_URL이 필요합니다.')
    namespace = get('WINMATE_LLM_QUEUE_NAMESPACE')[0] or 'winmate-llm'
    if not re.fullmatch(r'[a-zA-Z0-9_.:-]{1,100}', namespace):
        raise ValueError('LLM 큐 namespace 형식이 올바르지 않습니다.')
    schema_mode = get('WINMATE_LLM_SCHEMA_MODE')[0] or 'json_object'
    if schema_mode not in ('json_object', 'json_schema'):
        raise ValueError('WINMATE_LLM_SCHEMA_MODE는 json_object 또는 json_schema여야 합니다.')
    return Settings(mode='real', functions=functions, model=model, quick_model=quick, base_url=base.rstrip('/'),
                    timeout=compatible_number('WINMATE_LLM_TIMEOUT', 'WINMATE_GEMINI_TIMEOUT', 60, 5, 600),
                    rpm=compatible_number('WINMATE_LLM_RPM', 'WINMATE_GEMINI_RPM', 42, 1, 42),
                    concurrency=compatible_number('WINMATE_LLM_CONCURRENCY', 'WINMATE_GEMINI_CONCURRENCY', 4, 1, 16),
                    llm_cache=_flag(get('WINMATE_LLM_CACHE')[0]), kb_cache=_flag(get('WINMATE_KB_CACHE')[0]),
                    vision_model=model_setting('WINMATE_LLM_VISION_MODEL', 'GEMINI_VISION_MODEL')[0] or (DEFAULT_VISION_MODEL if provider == 'gemini' else model),
                    key_source=key_source if key else '', warnings=tuple(warnings), legacy_ignored=tuple(legacy), _api_key=key,
                    provider=provider, queue_backend=queue_backend, queue_db=Path(get('WINMATE_LLM_QUEUE_DB')[0] or RUNTIME_DIR / 'llm-queue.sqlite').expanduser().resolve(),
                    queue_redis_url=redis_url, queue_namespace=namespace, queue_timeout=number('WINMATE_LLM_QUEUE_TIMEOUT', 600, 1, 86400),
                    schema_mode=schema_mode)


_LOCK = threading.Lock()
_SETTINGS: Optional[Settings] = None


def get_settings() -> Settings:
    global _SETTINGS
    with _LOCK:
        if _SETTINGS is None:
            _SETTINGS = load_settings()
        return _SETTINGS


def reload_settings(environ: Optional[Mapping[str, str]] = None, env_files: Optional[Iterable[str]] = None) -> Settings:
    global _SETTINGS
    with _LOCK:
        _SETTINGS = load_settings(environ, env_files)
        return _SETTINGS
