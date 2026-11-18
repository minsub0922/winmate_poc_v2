"""Server-side settings for the PoC adapters.

Values are read only when :func:`get_settings` is first called at server runtime (never at import).
Precedence: process environment > .env. With .env.inhouse installed, that shared profile and
.env.example supply the remaining values, in that order. Each file is parsed
locally; nothing is copied into ``os.environ``. ``WINMATE_ENV_FILES`` overrides the file list for tests
(comma separated, relative to the repository root) and ``none`` disables file reading entirely.

Strict real-only runtime: every function always runs against the shared model provider. There is no
dummy mode and no per-function switch. ``Settings.mode`` / ``Settings.functions`` keep their read-only
shape (``'real'`` everywhere) for compatibility. Legacy ``WINMATE_MODE`` / ``WINMATE_<FUNC>_MODE`` values
other than ``real`` are **not honored**: they are listed in ``legacy_ignored`` and reported as warnings.

Keys — LLM API profiles. Several profiles can sit side by side in .env, each with its own key / models / endpoint;
WINMATE_LLM_PROVIDER picks the one the app uses and :func:`provider_settings` opens any other one by name.
  WINMATE_LLM_PROVIDER         openrouter (default) | gemini | internal | openai | registered adapter
  WINMATE_LLM_FALLBACK         optional comma list of other profiles tried in order when the chosen one fails to answer
                               (no response · timeout · auth / model / 5xx / 429) — never on a bad request or bad output
  OPENROUTER_API_KEY           OpenRouter credential (server only)
  OPENROUTER_MODEL             default qwen/qwen3.6-35b-a3b (text + image input); _QUICK_MODEL · _VISION_MODEL default to it
  OPENROUTER_BASE_URL          default https://openrouter.ai/api/v1
  OPENROUTER_REASONING         off (default) | on | low | medium | high — the model's thinking step
  INTERNAL_LLM_API_KEY         internal model credential (server only)
  INTERNAL_LLM_MODEL           internal model identifier
  INTERNAL_LLM_BASE_URL        internal model endpoint (https, or plain http on a loopback / private-network host)
  GEMINI_API_KEY               Gemini credential when explicitly selected
  GEMINI_MODEL                 default model (gemini-3.1-flash-lite)
  GEMINI_QUICK_MODEL           model for model_tier=quick (default: GEMINI_MODEL)
  GEMINI_BASE_URL              https endpoint override (an internal gateway, for example)
  WINMATE_GEMINI_TIMEOUT       seconds per operation including retries, excluding queue wait (default 60)
  WINMATE_GEMINI_RPM           legacy alias, clamped to 1–42 (default 42)
  WINMATE_LLM_CACHE            on | off (default off) — response cache under app/data/runtime only
  WINMATE_KB_CACHE             on | off (default off) — layout card cache under app/data/runtime only
  TYPESAFE_API_KEY             decision model (TypeSafe Jev) credential (server only)
  TYPESAFE_BASE_URL            https endpoint (default https://api.typesafe.ai/v1; /systemone is appended), or a local
                               Clef server on this host (http://127.0.0.1:8790/v1, clef-flash/ — no auth, any non-empty key)
                               or on the private network (plain http is allowed only for loopback / private hosts)
  TYPESAFE_MODEL               decision model id (default jev-1.14.0 — pinned, thresholds are tuned to it; clef-* → Clef limits)
  WINMATE_DECISION             auto (default: decision model when the key is set) | off (always the LLM)
  WINMATE_DECISION_ORDER       decision slots in order: main (TYPESAFE_*, default), clef (the local Clef server) and / or
                               inhouse (the in-house ClefDecision class); the first usable one answers, the rest are tried
                               when it fails to answer
  WINMATE_CLEF_BASE_URL        the clef slot's address (default http://127.0.0.1:8790/v1; no credential)
  WINMATE_CLEF_MODEL           the clef slot's model id (default clef-flash)
  WINMATE_INHOUSE_DIR          folder of the git-ignored in-house classes (default app/api/llm/inhouse): gauss.py · class
                               GaussLLM serves the internal profile, clef.py · class ClefDecision the inhouse decision slot,
                               each once its file, class and REQUIRED_ENV keys are all present (contract: app/api/llm/inhouse_contract.py)
  WINMATE_DECISION_TASKS       optional comma list limiting which DECISION_TASKS use the decision model
  WINMATE_DECISION_TIMEOUT     seconds per decision request including retries (default 30)

Provider-specific INTERNAL_LLM_* / GEMINI_* settings take precedence over shared WINMATE_LLM_* aliases. OPENROUTER_* never
falls back to the shared aliases (a key set for another gateway is never sent to OpenRouter).
The queue is shared by every model/feature. RPM cannot exceed 42 or be disabled.
See .env.example (repository root) and app/README.md for SQLite/Redis and internal model setup.
"""
from __future__ import annotations

import ipaddress
import os
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, Mapping, Optional, Tuple
from urllib.parse import urlsplit

from .. import runtime_env
from .imports import ROOT, RUNTIME_DIR

FUNCTIONS = ('rfp', 'requirements', 'layout', 'search', 'rerank', 'review', 'storyboard', 'part', 'fill', 'simulation', 'llm')
MODES = ('real',)
DEFAULT_PROVIDER = 'openrouter'
DEFAULT_MODEL = 'gemini-3.1-flash-lite'
DEFAULT_VISION_MODEL = 'gemini-3.8-flash'
DEFAULT_OPENROUTER_MODEL = 'qwen/qwen3.6-35b-a3b'
DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
# LLM API profiles the settings know how to read (registered adapters use the shared WINMATE_LLM_* keys).
PROVIDERS = ('openrouter', 'gemini', 'internal', 'openai')
_PREFIX = {'internal': 'INTERNAL_LLM_', 'openrouter': 'OPENROUTER_'}
_DEFAULT_MODELS = {'gemini': DEFAULT_MODEL, 'openrouter': DEFAULT_OPENROUTER_MODEL}
_DEFAULT_BASES = {'openrouter': DEFAULT_OPENROUTER_BASE_URL}
REASONING = ('off', 'on', 'low', 'medium', 'high')
# Decision-shaped tasks that branch between the LLM and the decision model (same task input/output either way).
# layout.cells · layout.verify · layout.pictures · layout.review: the decision-capable steps inside a layout's flow (app/api/poc/layout_decide.py)
# layout.final: the last step of every flow — the ReAct final check's reading of the sheet (app/api/poc/layout_final.py)
DECISION_TASKS = ('search.rerank', 'catalog.rank', 'review.route', 'layout.pick', 'layout.best_pick', 'spatial.command',
                  'layout.cells', 'layout.verify', 'layout.pictures', 'layout.review', 'layout.final')
DEFAULT_DECISION_MODEL = 'jev-1.14.0'
DEFAULT_DECISION_BASE_URL = 'https://api.typesafe.ai/v1'
DECISION_SLOTS = ('main', 'clef', 'inhouse')
DEFAULT_CLEF_BASE_URL = 'http://127.0.0.1:8790/v1'
DEFAULT_CLEF_MODEL = 'clef-flash'
_NONE = ('none', 'off', '-')  # an explicit empty list (the admin layer cannot carry an empty value)
LOOPBACK = ('127.0.0.1', 'localhost', '::1')  # a local decision server (Clef, clef_mlx.py serve) may use plain http
_ENV_LINE = re.compile(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
_KEYS = ('WINMATE_MODE', *(f'WINMATE_{f.upper()}_MODE' for f in FUNCTIONS), 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_QUICK_MODEL',
         'GEMINI_VISION_MODEL', 'GEMINI_BASE_URL', 'WINMATE_GEMINI_TIMEOUT', 'WINMATE_GEMINI_RPM', 'WINMATE_GEMINI_CONCURRENCY', 'WINMATE_LLM_CACHE', 'WINMATE_KB_CACHE',
         'WINMATE_LLM_PROVIDER', 'WINMATE_LLM_API_KEY', 'WINMATE_LLM_MODEL', 'WINMATE_LLM_QUICK_MODEL', 'WINMATE_LLM_VISION_MODEL',
         'WINMATE_LLM_BASE_URL', 'WINMATE_LLM_TIMEOUT', 'WINMATE_LLM_RPM', 'WINMATE_LLM_CONCURRENCY', 'WINMATE_LLM_QUEUE_BACKEND',
         'WINMATE_LLM_QUEUE_DB', 'WINMATE_LLM_REDIS_URL', 'WINMATE_LLM_QUEUE_NAMESPACE', 'WINMATE_LLM_QUEUE_TIMEOUT', 'WINMATE_LLM_SCHEMA_MODE',
         'INTERNAL_LLM_API_KEY', 'INTERNAL_LLM_MODEL', 'INTERNAL_LLM_QUICK_MODEL', 'INTERNAL_LLM_VISION_MODEL', 'INTERNAL_LLM_BASE_URL',
         'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_QUICK_MODEL', 'OPENROUTER_VISION_MODEL', 'OPENROUTER_BASE_URL',
         'OPENROUTER_REASONING',
         'TYPESAFE_API_KEY', 'TYPESAFE_BASE_URL', 'TYPESAFE_MODEL', 'WINMATE_DECISION', 'WINMATE_DECISION_TASKS', 'WINMATE_DECISION_TIMEOUT',
         'WINMATE_LLM_FALLBACK', 'WINMATE_DECISION_ORDER', 'WINMATE_CLEF_BASE_URL', 'WINMATE_CLEF_MODEL')


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


# Hosts that count as this company's own network: plain http is allowed there (in-house / self-hosted serving).
_INTERNAL_SUFFIXES = ('.local', '.internal', '.lan', '.intranet', '.corp', '.home.arpa')


def private_host(host: Optional[str]) -> bool:
    """Loopback, a private / link-local IP literal, a single-label intranet name, or an internal-only DNS suffix."""
    host = (host or '').strip().strip('[]').lower().rstrip('.')
    if not host:
        return False
    if host in LOOPBACK:
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        if not re.fullmatch(r'[a-z0-9]([a-z0-9\-.]{0,251}[a-z0-9])?', host) or re.fullmatch(r'[0-9.]+', host):
            return False
        return '.' not in host or host.endswith(_INTERNAL_SUFFIXES)
    return ip.is_loopback or ip.is_private or ip.is_link_local


def allowed_endpoint(url: str) -> bool:
    """https anywhere; plain http only inside the company's own network (:func:`private_host`). No credentials in the URL."""
    try:
        parts = urlsplit(url or '')
        host = parts.hostname
    except ValueError:
        return False
    if not host or parts.username or parts.password:
        return False
    return parts.scheme == 'https' or (parts.scheme == 'http' and private_host(host))


# Admin-set values (the Provider tab: a changed in-house serving endpoint). Highest precedence at server runtime only —
# an explicit ``environ`` (tests, tools) never sees them.
_OVERRIDES: Dict[str, str] = {}


def set_overrides(values: Optional[Mapping[str, str]] = None) -> None:
    """Replace the admin override layer (``None`` / empty clears it). Call :func:`reload_settings` afterwards."""
    _OVERRIDES.clear()
    _OVERRIDES.update({k: str(v) for k, v in (values or {}).items() if k in _KEYS and str(v).strip()})


def overrides() -> Dict[str, str]:
    return dict(_OVERRIDES)


def key_name(provider: str) -> str:
    """The .env key that holds the credential of an LLM API profile (for messages; never the value)."""
    return {'gemini': 'GEMINI_API_KEY', 'internal': 'INTERNAL_LLM_API_KEY', 'openrouter': 'OPENROUTER_API_KEY'}.get(provider, 'WINMATE_LLM_API_KEY')


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
    key_source: str = ''                 # label only: environ | .env | ''
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
    decision_mode: str = 'auto'          # auto | off
    decision_model: str = DEFAULT_DECISION_MODEL
    decision_base_url: str = DEFAULT_DECISION_BASE_URL
    decision_timeout: int = 30
    decision_tasks: Tuple[str, ...] = DECISION_TASKS
    _decision_key: str = field(default='', repr=False, compare=False)
    reasoning: str = ''                  # OpenRouter thinking step: '' (model default) | off | on | low | medium | high
    providers: Tuple[Tuple[str, str, bool], ...] = ()  # (profile, model, key configured) for every known LLM API profile
    llm_fallbacks: Tuple[Tuple[str, str, str, str, str, bool], ...] = ()  # (profile, base, model, quick, vision, key configured)
    decision_order: Tuple[str, ...] = ('main',)
    decision_slots: Tuple[Tuple[str, str, str, bool], ...] = ()  # (slot, base, model, key configured) for main and clef
    decision_fallbacks: Tuple[Tuple[str, str, str], ...] = ()  # (slot, base, model) tried after the first usable slot
    _decision_slot_keys: Tuple[Tuple[str, str], ...] = field(default=(), repr=False, compare=False)
    decision_primary: str = 'main'       # the slot that answers first (main | clef | inhouse)
    # In-house classes (app/api/llm/inhouse_bridge.py): '' no file · 'ready' · 'missing' (required keys) · 'error' (load / contract)
    inhouse_llm: str = ''
    inhouse_decision: str = ''
    inhouse_fingerprint: str = ''        # changes with their files / settings, so cached providers are rebuilt

    def decision_slot(self, slot: str) -> Tuple[str, str, str]:
        """(base, model, credential) of a decision slot — for the decision client only."""
        base, model = next(((b, m) for s, b, m, _ in self.decision_slots if s == slot), ('', ''))
        return base, model, dict(self._decision_slot_keys).get(slot, '')

    @property
    def has_decision_key(self) -> bool:
        return bool(self._decision_key)

    def decision_key(self) -> str:
        """The decision-model credential, for the decision client only. Never put this into responses or logs."""
        return self._decision_key

    def decision_enabled(self, task: str) -> bool:
        """Does ``task`` take the decision-model branch? (key present, not switched off, task selected)."""
        return self.has_decision_key and self.decision_mode != 'off' and task in self.decision_tasks

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
                'legacy_ignored': list(self.legacy_ignored), 'warnings': list(self.warnings), 'reasoning': self.reasoning or None,
                'providers': [{'name': n, 'model': m, 'api_key_configured': k, 'selected': n == self.provider} for n, m, k in self.providers],
                'fallbacks': [n for n, *_ in self.llm_fallbacks],
                'inhouse': {'llm': self.inhouse_llm or None, 'decision': self.inhouse_decision or None},
                'decision': {'provider': 'inhouse' if self.decision_primary == 'inhouse' else 'clef-local' if self.decision_model.startswith('clef') else 'typesafe',
                             'model': self.decision_model, 'endpoint_host': urlsplit(self.decision_base_url).hostname if self.decision_base_url else None,
                             'mode': self.decision_mode, 'api_key_configured': self.has_decision_key, 'timeout_s': self.decision_timeout,
                             'fallbacks': [x for x, *_ in self.decision_fallbacks],
                             'tasks': {t: ('decision' if self.decision_enabled(t) else 'llm') for t in DECISION_TASKS}}}

    def __repr__(self) -> str:  # never include the credential
        return f'Settings(mode={self.mode!r}, functions={self.functions!r}, model={self.model!r}, api_key_configured={self.has_key})'


def load_settings(environ: Optional[Mapping[str, str]] = None, env_files: Optional[Iterable[str]] = None,
                  provider: Optional[str] = None) -> Settings:
    """``provider`` opens a named LLM API profile instead of ``WINMATE_LLM_PROVIDER`` (see :func:`provider_settings`)."""
    admin = dict(_OVERRIDES) if environ is None else {}
    explicit = environ is not None
    environ = os.environ if environ is None else environ
    explicit_files = tuple(env_files) if env_files is not None else None
    if explicit_files is None:
        raw = environ.get('WINMATE_ENV_FILES')
        if raw is not None:
            env_files = () if raw.strip().lower() in ('', 'none', 'off') else tuple(x.strip() for x in raw.split(',') if x.strip())
        else:
            env_files = runtime_env.default_env_files()
    else:
        env_files = explicit_files
    layers: list[tuple[str, Mapping[str, str]]] = ([('admin', admin)] if admin else []) + [('environ', environ)]
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
    provider = (provider or get('WINMATE_LLM_PROVIDER')[0]).lower() or DEFAULT_PROVIDER

    def profile(name: str) -> dict:
        """One LLM API profile; profiles never share credentials, models or endpoints."""
        def pick(generic: str, legacy: str = '') -> tuple[str, str]:
            specific = legacy if name == 'gemini' else generic.replace('WINMATE_LLM_', _PREFIX[name], 1) if name in _PREFIX else ''
            value = get(specific) if specific else ('', '')
            if name == 'openrouter':
                return value
            return value if value[0] else get(generic)
        key, source = pick('WINMATE_LLM_API_KEY', 'GEMINI_API_KEY')
        model = pick('WINMATE_LLM_MODEL', 'GEMINI_MODEL')[0] or _DEFAULT_MODELS.get(name, '')
        return {'key': key, 'source': source, 'model': model, 'quick': pick('WINMATE_LLM_QUICK_MODEL', 'GEMINI_QUICK_MODEL')[0] or model,
                'vision': pick('WINMATE_LLM_VISION_MODEL', 'GEMINI_VISION_MODEL')[0] or (DEFAULT_VISION_MODEL if name == 'gemini' else model),
                'base': pick('WINMATE_LLM_BASE_URL', 'GEMINI_BASE_URL')[0] or _DEFAULT_BASES.get(name, '')}

    chosen = profile(provider)
    key, key_source, model, quick, base = chosen['key'], chosen['source'], chosen['model'], chosen['quick'], chosen['base']
    # In-house classes (git-ignored app/api/llm/inhouse/*): with its file present the internal profile is the GaussLLM class
    # and its readiness is the class's own (file · class · contract · REQUIRED_ENV), not this module's key/base checks.
    inhouse_llm, inhouse_decision = _inhouse(environ if explicit else None, explicit_files)
    internal_inhouse = inhouse_llm.present
    if provider == 'internal' and internal_inhouse:
        if not inhouse_llm.ready:
            warnings.append(f'사내 LLM({inhouse_llm.cls})이 준비되지 않았습니다: ' + ' · '.join(inhouse_llm.problems))
    elif not key:
        warnings.append(f'AI 인증 키({key_name(provider)})가 없습니다 — 모든 AI 기능이 503(no_api_key)으로 거절됩니다.')
    if base and not allowed_endpoint(base):
        warnings.append('AI 서버 주소는 https 주소(또는 로컬 · 사내망 주소의 http)만 허용해 기본 주소를 씁니다.')
        base = _DEFAULT_BASES.get(provider, '')
    if provider != 'gemini' and (not base or not model) and not (provider == 'internal' and internal_inhouse):
        warnings.append('선택한 모델의 API 주소와 모델 ID가 필요합니다. internal은 INTERNAL_LLM_BASE_URL · INTERNAL_LLM_MODEL을 설정하세요.')
    if not explicit and env_files == runtime_env.default_env_files():
        legacy_files = [rel for rel in ('app/.env', 'poc/.env') if (ROOT / rel).is_file()]
        if legacy_files:
            warnings.append(' · '.join(legacy_files) + ' 는 더 이상 읽지 않습니다 — 값을 저장소 루트의 .env 로 옮기세요.')

    def configured(name: str, p: dict) -> bool:
        return inhouse_llm.ready if name == 'internal' and internal_inhouse else bool(p['key'])
    reasoning = ''
    if provider == 'openrouter':
        reasoning = get('OPENROUTER_REASONING')[0].lower() or 'off'
        if reasoning not in REASONING:
            warnings.append('OPENROUTER_REASONING은 off · on · low · medium · high 중 하나여야 해 off를 씁니다.')
            reasoning = 'off'
    profiles = tuple((n, (p := profile(n))['model'], configured(n, p)) for n in PROVIDERS)

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
    decision_mode = get('WINMATE_DECISION')[0].lower() or 'auto'
    if decision_mode not in ('auto', 'off'):
        warnings.append('WINMATE_DECISION은 auto 또는 off여야 해 auto를 씁니다.')
        decision_mode = 'auto'
    decision_base = (get('TYPESAFE_BASE_URL')[0] or DEFAULT_DECISION_BASE_URL).rstrip('/')
    if not allowed_endpoint(decision_base):
        warnings.append('Decision 모델 주소는 https 주소(또는 로컬 · 사내망 Clef 서버의 http)만 허용해 기본 주소를 씁니다.')
        decision_base = DEFAULT_DECISION_BASE_URL
    decision_model = get('TYPESAFE_MODEL')[0] or DEFAULT_DECISION_MODEL
    if not re.fullmatch(r'[a-z0-9][a-z0-9.\-]{1,60}', decision_model):
        warnings.append('TYPESAFE_MODEL 형식이 올바르지 않아 기본 모델을 씁니다.')
        decision_model = DEFAULT_DECISION_MODEL
    clef_base = (get('WINMATE_CLEF_BASE_URL')[0] or DEFAULT_CLEF_BASE_URL).rstrip('/')
    if not allowed_endpoint(clef_base):
        warnings.append('WINMATE_CLEF_BASE_URL은 https 주소(또는 로컬 · 사내망의 http)만 허용해 기본 주소를 씁니다.')
        clef_base = DEFAULT_CLEF_BASE_URL
    clef_model = get('WINMATE_CLEF_MODEL')[0] or DEFAULT_CLEF_MODEL
    if not re.fullmatch(r'[a-z0-9][a-z0-9.\-]{1,60}', clef_model):
        warnings.append('WINMATE_CLEF_MODEL 형식이 올바르지 않아 기본 모델을 씁니다.')
        clef_model = DEFAULT_CLEF_MODEL
    slots = {'main': (decision_base, decision_model, get('TYPESAFE_API_KEY')[0]), 'clef': (clef_base, clef_model, 'local'),
             # the in-house ClefDecision class: no address of its own (the class reaches its servers); usable once ready
             'inhouse': ('', inhouse_decision.default_model, 'inhouse' if inhouse_decision.ready else '')}
    raw_order = get('WINMATE_DECISION_ORDER')[0].lower()
    order_items = [x.strip() for x in raw_order.split(',') if x.strip()] if raw_order not in _NONE else []
    if any(x not in DECISION_SLOTS for x in order_items):
        warnings.append('WINMATE_DECISION_ORDER는 ' + ' · '.join(DECISION_SLOTS) + '만 받습니다.')
    if 'inhouse' in order_items and inhouse_decision.present and not inhouse_decision.ready:
        warnings.append(f'사내 Decision({inhouse_decision.cls})이 준비되지 않았습니다: ' + ' · '.join(inhouse_decision.problems))
    decision_order = tuple(dict.fromkeys(x for x in order_items if x in DECISION_SLOTS)) or ('main',)
    usable = [x for x in decision_order if slots[x][2]]
    first = usable[0] if usable else decision_order[0]
    raw_fallback = get('WINMATE_LLM_FALLBACK')[0].lower()
    fallback_items = [x.strip() for x in raw_fallback.split(',') if x.strip()] if raw_fallback not in _NONE else []
    if any(x not in PROVIDERS for x in fallback_items):
        warnings.append('WINMATE_LLM_FALLBACK은 ' + ' · '.join(PROVIDERS) + '만 받습니다.')
    llm_fallbacks = tuple((n, (p := profile(n))['base'], p['model'], p['quick'], p['vision'], configured(n, p))
                          for n in dict.fromkeys(fallback_items) if n in PROVIDERS and n != provider)
    raw_tasks = [x.strip() for x in get('WINMATE_DECISION_TASKS')[0].split(',') if x.strip()]
    unknown_tasks = [x for x in raw_tasks if x not in DECISION_TASKS]
    if unknown_tasks:
        warnings.append('WINMATE_DECISION_TASKS의 알 수 없는 작업을 무시합니다: ' + ', '.join(unknown_tasks[:5]))
    decision_tasks = tuple(x for x in DECISION_TASKS if x in raw_tasks) if raw_tasks else DECISION_TASKS
    return Settings(mode='real', functions=functions, model=model, quick_model=quick, base_url=base.rstrip('/'),
                    timeout=compatible_number('WINMATE_LLM_TIMEOUT', 'WINMATE_GEMINI_TIMEOUT', 60, 5, 600),
                    rpm=compatible_number('WINMATE_LLM_RPM', 'WINMATE_GEMINI_RPM', 42, 1, 42),
                    concurrency=compatible_number('WINMATE_LLM_CONCURRENCY', 'WINMATE_GEMINI_CONCURRENCY', 4, 1, 16),
                    llm_cache=_flag(get('WINMATE_LLM_CACHE')[0]), kb_cache=_flag(get('WINMATE_KB_CACHE')[0]),
                    vision_model=chosen['vision'],
                    key_source=key_source if key else '', warnings=tuple(warnings), legacy_ignored=tuple(legacy), _api_key=key,
                    provider=provider, queue_backend=queue_backend, queue_db=Path(get('WINMATE_LLM_QUEUE_DB')[0] or RUNTIME_DIR / 'llm-queue.sqlite').expanduser().resolve(),
                    queue_redis_url=redis_url, queue_namespace=namespace, queue_timeout=number('WINMATE_LLM_QUEUE_TIMEOUT', 600, 1, 86400),
                    schema_mode=schema_mode, decision_mode=decision_mode, decision_model=slots[first][1], decision_base_url=slots[first][0],
                    decision_timeout=number('WINMATE_DECISION_TIMEOUT', 30, 3, 300), decision_tasks=decision_tasks,
                    _decision_key=slots[first][2], reasoning=reasoning, providers=profiles, llm_fallbacks=llm_fallbacks,
                    decision_order=decision_order, decision_slots=tuple((x, slots[x][0], slots[x][1], bool(slots[x][2])) for x in DECISION_SLOTS),
                    decision_fallbacks=tuple((x, slots[x][0], slots[x][1]) for x in usable[1:]),
                    _decision_slot_keys=tuple((x, slots[x][2]) for x in DECISION_SLOTS), decision_primary=first,
                    inhouse_llm=_inhouse_state(inhouse_llm), inhouse_decision=_inhouse_state(inhouse_decision),
                    inhouse_fingerprint=f'{inhouse_llm.fingerprint}:{inhouse_decision.fingerprint}')


class _Absent:
    """In-house status when the bridge itself cannot be read (never breaks settings)."""
    present = ready = False
    cls = ''
    default_model = fingerprint = ''
    problems: list = []


def _inhouse(environ: Optional[Mapping[str, str]], env_files: Optional[Tuple[str, ...]]):
    """(llm status, decision status) of the git-ignored in-house classes (app/api/llm/inhouse_bridge.py)."""
    try:
        from ..llm import inhouse_bridge
        return inhouse_bridge.llm_status(environ, env_files), inhouse_bridge.decision_status(environ, env_files)
    except Exception:  # noqa: BLE001 — a broken bridge must never stop the server
        return _Absent(), _Absent()


def _inhouse_state(status) -> str:
    if not status.present:
        return ''
    return 'ready' if status.ready else 'missing' if getattr(status, 'missing', ()) and not getattr(status, 'error', '') else 'error'


def provider_settings(name: str, environ: Optional[Mapping[str, str]] = None, env_files: Optional[Iterable[str]] = None) -> Settings:
    """Settings of a named LLM API profile (e.g. ``gemini`` next to the default ``openrouter``) from the same sources."""
    return load_settings(environ, env_files, provider=name)


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
