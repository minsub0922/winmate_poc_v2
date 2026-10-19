"""Server-side settings for the PoC adapters.

Values are read only when :func:`get_settings` is first called at server runtime (never at import).
Precedence for every key: ``os.environ`` > ``app/.env`` > ``poc/.env``. ``.env`` files are parsed
locally; nothing is copied into ``os.environ``. ``WINMATE_ENV_FILES`` overrides the file list
(comma separated, relative to the repository root) and ``none`` disables file reading entirely.

Flags
  WINMATE_MODE                 dummy | real  (default dummy)
  WINMATE_<FUNC>_MODE          dummy | real  (default: WINMATE_MODE) for RFP, LAYOUT, SEARCH,
                               REVIEW, STORYBOARD, LLM
  GEMINI_API_KEY               server-only credential (never returned or logged)
  GEMINI_MODEL                 default model (gemini-3.1-flash-lite)
  GEMINI_QUICK_MODEL           model for model_tier=quick (default: GEMINI_MODEL)
  GEMINI_BASE_URL              https endpoint override (an internal gateway, for example)
  WINMATE_GEMINI_TIMEOUT       seconds per request (default 120)
  WINMATE_GEMINI_RPM           requests per minute gate (default 30)
  WINMATE_LLM_CACHE            on | off (default off) — response cache under app/data/runtime only
  WINMATE_KB_CACHE             on | off (default off) — layout card cache under app/data/runtime only
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

FUNCTIONS = ('rfp', 'layout', 'search', 'review', 'storyboard', 'part', 'fill', 'simulation', 'llm')
MODES = ('dummy', 'real')
DEFAULT_MODEL = 'gemini-3.1-flash-lite'
DEFAULT_ENV_FILES = ('app/.env', 'poc/.env')
_ENV_LINE = re.compile(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
_KEYS = ('WINMATE_MODE', *(f'WINMATE_{f.upper()}_MODE' for f in FUNCTIONS), 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_QUICK_MODEL',
         'GEMINI_BASE_URL', 'WINMATE_GEMINI_TIMEOUT', 'WINMATE_GEMINI_RPM', 'WINMATE_LLM_CACHE', 'WINMATE_KB_CACHE')


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
    _api_key: str = field(default='', repr=False, compare=False)

    @property
    def has_key(self) -> bool:
        return bool(self._api_key)

    def api_key(self) -> str:
        """The credential, for the provider only. Never put this into responses or logs."""
        return self._api_key

    def function_mode(self, name: str) -> str:
        return self.functions.get(name, self.mode)

    @property
    def cache_dir(self) -> Path:
        return RUNTIME_DIR / 'llm-cache'

    def public(self) -> dict:
        host = urlsplit(self.base_url).hostname if self.base_url else 'generativelanguage.googleapis.com'
        return {'mode': self.mode, 'functions': dict(self.functions), 'model': self.model, 'quick_model': self.quick_model,
                'endpoint_host': host, 'timeout_s': self.timeout, 'rpm': self.rpm, 'llm_cache': self.llm_cache, 'kb_cache': self.kb_cache,
                'api_key_configured': self.has_key, 'api_key_source': self.key_source or None, 'warnings': list(self.warnings)}

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
    mode, _ = get('WINMATE_MODE')
    mode = mode.lower() or 'dummy'
    if mode not in MODES:
        warnings.append(f'WINMATE_MODE={mode!r} 는 알 수 없는 값이라 dummy 로 처리합니다.')
        mode = 'dummy'
    functions = {}
    for name in FUNCTIONS:
        value, _ = get(f'WINMATE_{name.upper()}_MODE')
        value = value.lower()
        if value and value not in MODES:
            warnings.append(f'WINMATE_{name.upper()}_MODE={value!r} 는 알 수 없는 값이라 dummy 로 처리합니다.')
            value = 'dummy'
        functions[name] = value or mode
    key, key_source = get('GEMINI_API_KEY')
    model = get('GEMINI_MODEL')[0] or DEFAULT_MODEL
    quick = get('GEMINI_QUICK_MODEL')[0] or model
    base, _ = get('GEMINI_BASE_URL')
    if base and not (base.startswith('https://') or base.startswith('http://127.0.0.1') or base.startswith('http://localhost')):
        warnings.append('GEMINI_BASE_URL 은 https 주소(또는 로컬 게이트웨이)만 허용해 기본 주소를 씁니다.')
        base = ''

    def number(key: str, default: int, lo: int, hi: int) -> int:
        value, _ = get(key)
        try:
            return max(lo, min(hi, int(value))) if value else default
        except ValueError:
            warnings.append(f'{key} 값이 숫자가 아니라 기본값 {default} 을 씁니다.')
            return default

    return Settings(mode=mode, functions=functions, model=model, quick_model=quick, base_url=base.rstrip('/'),
                    timeout=number('WINMATE_GEMINI_TIMEOUT', 120, 5, 600), rpm=number('WINMATE_GEMINI_RPM', 30, 0, 1000),
                    llm_cache=_flag(get('WINMATE_LLM_CACHE')[0]), kb_cache=_flag(get('WINMATE_KB_CACHE')[0]),
                    key_source=key_source if key else '', warnings=tuple(warnings), _api_key=key)


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
