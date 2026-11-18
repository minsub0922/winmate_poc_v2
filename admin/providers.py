"""Provider tab — every model connection the server knows (LLM profiles and decision models).

* **Registry**: the LLM API profiles of ``app/api/poc/settings.py`` plus the decision slots (``TYPESAFE_*`` and the local
  Clef server, ``clef-flash/``). *Active* is what the app uses now, per role in order: the first is 대표 (it answers),
  the rest answer when it fails to (``WINMATE_LLM_FALLBACK`` / ``WINMATE_DECISION_ORDER``). ``.env`` picks it at start;
  the tab turns providers on / off and picks 대표 without a restart (at least one LLM; no decision model → the LLM
  decides). The choice lives in the admin store (``provider_active``) and reaches the app through the override layer.
* **State**: every active provider is probed on a schedule — 08:00 to 22:00 (Asia/Seoul) at every :00 and :30
  (``WINMATE_PROVIDER_CHECK_INTERVAL`` changes the step, ``off`` stops it); outside those hours nothing is probed and a
  missed slot is caught up only until the next one. External APIs get calls that cost no tokens (model list · model
  info · OpenRouter credits); only in-house / self-hosted servers may fall back to a 1-token call when they have no
  list API. Each card shows the last check; the last real call (usage tracing) stays in its hover.
* **Endpoint edits**: an in-house serving address / model id can be changed and re-connected without a restart. The
  values live in the admin store and sit above ``.env`` (``settings.set_overrides``); credentials are never edited,
  shown or stored here.
* **Experiments**: one input, any registered provider (optionally another model id), one real call each.
"""
from __future__ import annotations

import dataclasses
import json
import os
import re
import socket
import threading
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api import runtime_env, telemetry
from app.api.llm.decision import TypeSafeDecision, family
from app.api.llm.provider import DEFAULT_BASE as GEMINI_BASE, GeminiProvider, LLMProvider, ProviderError, parse_json, redact
from app.api.poc import settings as cfg

from .config import ROOT
from .provider_samples import samples
from .store import now

DEFAULT_INTERVAL = 1800          # user 2026-11-18: active providers every 30 minutes …
WINDOW = (8, 22)                 # … from 08:00 to 22:00 only (the 22:00 slot is the last)
TZ = ZoneInfo('Asia/Seoul')
PROBE_TIMEOUT = 8
HISTORY = 24
LLM_NAMES = {'openrouter': 'OpenRouter', 'gemini': 'Gemini', 'internal': '사내 LLM', 'openai': 'OpenAI 호환 API'}
# .env keys of each profile: (credential, endpoint, model)
LLM_KEYS = {'openrouter': ('OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_MODEL'),
            'gemini': ('GEMINI_API_KEY', 'GEMINI_BASE_URL', 'GEMINI_MODEL'),
            'internal': ('INTERNAL_LLM_API_KEY', 'INTERNAL_LLM_BASE_URL', 'INTERNAL_LLM_MODEL')}
GENERIC_KEYS = ('WINMATE_LLM_API_KEY', 'WINMATE_LLM_BASE_URL', 'WINMATE_LLM_MODEL')
# Endpoint edits that reach the running app: provider id → (endpoint key, model key). ``decision.clef`` reaches it through
# WINMATE_CLEF_BASE_URL / WINMATE_CLEF_MODEL, which :meth:`Providers.apply` always sets from :meth:`Providers._clef`.
OVERRIDE_KEYS = {'llm.internal': ('INTERNAL_LLM_BASE_URL', 'INTERNAL_LLM_MODEL'),
                 'llm.openai': ('WINMATE_LLM_BASE_URL', 'WINMATE_LLM_MODEL'),
                 'decision.main': ('TYPESAFE_BASE_URL', 'TYPESAFE_MODEL')}
LLM_MODEL = re.compile(r'[A-Za-z0-9][\w./:@+\-]{0,119}')
DECISION_MODEL = re.compile(r'[a-z0-9][a-z0-9.\-]{1,60}')
STATUS_NAMES = {'ok': '정상', 'degraded': '확인 필요', 'down': '응답 없음'}


def _day(t: datetime, hour: int) -> datetime:
    return t.replace(hour=hour, minute=0, second=0, microsecond=0)


def due_slot(ts: float, interval: int, window=WINDOW) -> Optional[float]:
    """the scheduled check time a probe must be newer than: the latest slot (08:00, 08:30 … 22:00) at or before ``ts``,
    while it is the current one — None before 08:00 and from the slot after 22:00 on (a restart at 23:00 checks nothing)"""
    t = datetime.fromtimestamp(ts, TZ)
    start, end = _day(t, window[0]), _day(t, window[1])
    if t < start:
        return None
    slot = start + timedelta(seconds=int((min(t, end) - start).total_seconds() // interval) * interval)
    return slot.timestamp() if (t - slot).total_seconds() < interval else None


def next_slot(ts: float, interval: int, window=WINDOW) -> float:
    t = datetime.fromtimestamp(ts, TZ)
    start, end = _day(t, window[0]), _day(t, window[1])
    if t < start:
        return start.timestamp()
    slot = start + timedelta(seconds=(int((t - start).total_seconds() // interval) + 1) * interval)
    return slot.timestamp() if slot <= end else (start + timedelta(days=1)).timestamp()


class ProviderInputError(Exception):
    def __init__(self, message: str, status: int = 422) -> None:
        self.status = status
        super().__init__(message)


def clean_endpoint(value: str, role: str) -> str:
    """A pasted address → the base the adapters expect (no trailing slash, no call path, no query, no credentials)."""
    url = (value or '').strip()
    if not url or len(url) > 300 or any(c.isspace() for c in url):
        raise ProviderInputError('주소를 확인해 주세요. 예: http://10.0.0.12:8000/v1')
    try:
        parts = urlsplit(url)
    except ValueError:
        raise ProviderInputError('주소 형식이 올바르지 않습니다.') from None
    if parts.query or parts.fragment or parts.username or parts.password:
        raise ProviderInputError('주소에는 인증 정보나 ?, # 뒤의 값을 넣지 않습니다. 키는 서버의 .env에만 둡니다.')
    url = url.rstrip('/')
    for tail in (('/systemone', '/health') if role == 'decision' else ('/chat/completions', '/completions', '/models')):
        if url.endswith(tail):
            url = url[:-len(tail)].rstrip('/')
    if not cfg.allowed_endpoint(url):
        raise ProviderInputError('https 주소이거나, 이 서버 · 사내망 주소(10.x · 172.16~31.x · 192.168.x · 내부 호스트 이름)의 http 주소여야 합니다.')
    return url


def same_endpoint(a: str, b: str) -> bool:
    def norm(url: str):
        parts = urlsplit((url or '').rstrip('/'))
        host = '127.0.0.1' if parts.hostname in cfg.LOOPBACK else parts.hostname
        return parts.scheme, host, parts.port, parts.path.rstrip('/')
    return bool(a and b) and norm(a) == norm(b)


def _env_file(path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    try:
        for line in path.read_text(encoding='utf-8').splitlines():
            match = re.match(r'^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#]*)"?', line)
            if match:
                out[match.group(1)] = match.group(2).strip()
    except (OSError, UnicodeDecodeError):
        pass
    return out


def clef_defaults(root=ROOT) -> Dict[str, Any]:
    """The local Clef server of this checkout: address from the root port settings, model name from ``clef-flash/``."""
    directory = root / 'clef-flash'
    try:
        host, port = runtime_env.port_value('CLEF_HOST'), runtime_env.port_value('CLEF_PORT')
    except RuntimeError:
        host, port = '127.0.0.1', '8790'
    if host in ('0.0.0.0', '::', ''):
        host = '127.0.0.1'
    values = {**_env_file(directory / 'config.env'), **_env_file(directory / 'config.local.env')}
    env = runtime_env.env_values()  # an address / model set for the app's clef slot wins over this checkout's server
    return {'base_url': str(env.get('WINMATE_CLEF_BASE_URL') or f'http://{host}:{port}/v1').rstrip('/'),
            'model': str(env.get('WINMATE_CLEF_MODEL') or values.get('CLEF_NAME') or 'clef-flash'),
            'installed': (directory / 'serve.sh').is_file() or bool(env.get('WINMATE_CLEF_BASE_URL'))}


def _reason(exc: BaseException) -> str:
    inner = getattr(exc, 'reason', exc)
    if isinstance(inner, (socket.timeout, TimeoutError)) or 'timed out' in str(inner).lower():
        return f'{PROBE_TIMEOUT}초 안에 응답이 없습니다.'
    if isinstance(inner, ConnectionRefusedError):
        return '연결이 거부되었습니다 — 서버가 꺼져 있거나 포트가 다릅니다.'
    if isinstance(inner, socket.gaierror):
        return '호스트 이름을 찾지 못했습니다.'
    return f'연결하지 못했습니다 ({type(inner).__name__}).'


class Providers:
    def __init__(self, store, operations=None, opener: Optional[Callable[..., Any]] = None, root=ROOT) -> None:
        self.store = store
        self.operations = operations
        self.open = opener or urllib.request.urlopen
        self.root = root
        self.interval = DEFAULT_INTERVAL
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.thread: Optional[threading.Thread] = None
        self._llm: Dict[str, Any] = {}

    # ------------------------------------------------------------ endpoint edits (admin store → settings override layer)
    def saved(self) -> Dict[str, dict]:
        value = self.store.setting('provider_endpoints', {})
        return value if isinstance(value, dict) else {}

    def _endpoint_env(self) -> Dict[str, str]:
        env: Dict[str, str] = {}
        for pid, value in self.saved().items():
            keys = OVERRIDE_KEYS.get(pid)
            if keys and isinstance(value, dict):
                for key, field in zip(keys, ('base_url', 'model')):
                    if value.get(field):
                        env[key] = value[field]
        return env

    def switches(self) -> Dict[str, List[str]]:
        """Admin activation: ``{'llm': [profile, …], 'decision': [slot, …]}`` in order — the first is the one the app uses
        (대표), the rest answer when it fails to. A role missing here follows ``.env``."""
        value = self.store.setting('provider_active', {})
        value = value if isinstance(value, dict) else {}
        out: Dict[str, List[str]] = {}
        llm, decision = value.get('llm'), value.get('decision')
        llm = [llm] if isinstance(llm, str) else llm  # first shape (2026-11-18 00:45): one profile, 'main' | 'clef' | 'off'
        decision = ([] if decision == 'off' else [decision]) if isinstance(decision, str) else decision
        if isinstance(llm, list) and [n for n in llm if n in cfg.PROVIDERS]:
            out['llm'] = [n for n in dict.fromkeys(llm) if n in cfg.PROVIDERS]
        if isinstance(decision, list):
            out['decision'] = [x for x in dict.fromkeys(decision) if x in cfg.DECISION_SLOTS]
        return out

    def _switch_env(self) -> Dict[str, str]:
        switch = self.switches()
        clef = self._clef()
        env = {'WINMATE_CLEF_BASE_URL': clef['base_url'], 'WINMATE_CLEF_MODEL': clef['model']}
        if 'llm' in switch:
            env['WINMATE_LLM_PROVIDER'] = switch['llm'][0]
            env['WINMATE_LLM_FALLBACK'] = ','.join(switch['llm'][1:]) or 'none'
        if 'decision' in switch:
            if switch['decision']:
                env.update({'WINMATE_DECISION': 'auto', 'WINMATE_DECISION_ORDER': ','.join(switch['decision'])})
            else:
                env['WINMATE_DECISION'] = 'off'
        return env

    def apply(self) -> None:
        """Push the saved endpoint edits and activation above ``.env`` and rebuild the settings (the app picks a new
        provider up lazily)."""
        cfg.set_overrides({**self._endpoint_env(), **self._switch_env()})
        cfg.reload_settings()

    @staticmethod
    def on(settings) -> Dict[str, List[str]]:
        """What ``settings`` uses, in order: LLM profiles (대표 + fallbacks with a key) and usable decision slots."""
        llm = [settings.provider] + [n for n, *rest in settings.llm_fallbacks if rest[-1]]
        usable = {slot for slot, _, _, key in settings.decision_slots if key}
        decision = [x for x in settings.decision_order if x in usable] if settings.decision_mode != 'off' else []
        return {'llm': llm, 'decision': decision}

    # ------------------------------------------------------------ registry
    def _llm_settings(self, name: str, current=None):
        current = current or cfg.get_settings()
        return current if name == current.provider else cfg.provider_settings(name)

    def _decision_settings(self, pid: str, current=None, base: Optional[str] = None, model: Optional[str] = None):
        """A settings object whose decision fields point at ``pid`` (what :class:`TypeSafeDecision` reads)."""
        current = current or cfg.get_settings()
        if pid == 'decision.clef':
            clef = self._clef()
            slot = (clef['base_url'], clef['model'], 'local')
        else:
            slot = current.decision_slot('main')
        out = dataclasses.replace(current, decision_base_url=base or slot[0], decision_model=model or slot[1], _decision_key=slot[2])
        if family(out.decision_model) == 'clef' and out.decision_timeout < 120:  # one request at a time on the local GPU
            out = dataclasses.replace(out, decision_timeout=120)
        return out

    def _clef(self) -> Dict[str, Any]:
        clef = clef_defaults(self.root)
        edit = self.saved().get('decision.clef') or {}
        return {**clef, **{k: edit[k] for k in ('base_url', 'model') if edit.get(k)}, 'edited': bool(edit)}

    def entries(self, usage: bool = True) -> List[dict]:
        current = cfg.get_settings()
        saved = self.saved()
        switch = self.switches()
        on = self.on(current)
        statuses = self.store.setting('provider_status', {}) or {}
        out: List[dict] = []

        def add(pid, role, name, base, model, *, key, missing, profile, note='', extra=None):
            rank = on[role].index(key) if key in on[role] else None  # 0 = 대표, 1… = fallback order
            host = urlsplit(base).hostname if base else None
            scope = 'internal' if profile == 'internal' or cfg.private_host(host) else 'external'
            registered = not missing
            editable = pid in ('llm.internal', 'llm.openai', 'decision.clef') or (pid == 'decision.main' and scope == 'internal')
            status = statuses.get(pid)
            if status and (status.get('endpoint') != base or status.get('model') != model):
                status = None  # the address or model changed since that probe
            edit = saved.get(pid) if isinstance(saved.get(pid), dict) else None
            active = rank is not None
            out.append({'id': pid, 'role': role, 'name': name, 'profile': profile, 'base_url': base, 'host': host, 'model': model,
                        'scope': scope, 'registered': registered, 'active': active, 'primary': rank == 0, 'rank': rank,
                        'missing': missing, 'editable': editable,
                        'checkable': registered, 'monitored': registered and active,
                        'status': status, 'edit': edit, 'note': note, 'switched': role in switch, **(extra or {})})

        names = list(cfg.PROVIDERS) + ([current.provider] if current.provider not in cfg.PROVIDERS else [])
        for name in names:
            s = self._llm_settings(name, current)
            base = s.base_url or (GEMINI_BASE if name == 'gemini' else '')
            keys = LLM_KEYS.get(name, GENERIC_KEYS)
            missing = [key for key, present in zip(keys, (s.has_key, bool(base), bool(s.model))) if not present]
            extra = {'quick_model': s.quick_model, 'vision_model': s.vision_model, 'key_source': s.key_source or None,
                     'timeout_s': s.timeout, 'reasoning': s.reasoning or None}
            if saved.get('llm.' + name):
                plain = cfg.load_settings(os.environ, provider=name)  # an explicit environ skips the admin layer
                extra['env'] = {'base_url': plain.base_url, 'model': plain.model}
            out_name = LLM_NAMES.get(name, name)
            add('llm.' + name, 'llm', out_name, base, s.model, key=name, missing=missing, profile=name, extra=extra)

        clef = self._clef()
        main_base, main_model, main_key = current.decision_slot('main')
        tasks = {task: current.decision_enabled(task) for task in cfg.DECISION_TASKS}
        primary = on['decision'][0] if on['decision'] else None
        main_is_clef = same_endpoint(main_base, clef['base_url'])
        main_host = urlsplit(main_base).hostname or ''
        main_name = 'TypeSafe Jev' if main_host.endswith('typesafe.ai') else 'Clef (로컬 서빙)' if family(main_model) == 'clef' else 'Decision 모델'
        extra = {'timeout_s': current.decision_timeout, 'mode': current.decision_mode, **({'tasks': tasks} if primary == 'main' else {})}
        if saved.get('decision.main'):
            plain = cfg.load_settings(os.environ)
            extra['env'] = {'base_url': plain.decision_slot('main')[0], 'model': plain.decision_slot('main')[1]}
        add('decision.main', 'decision', main_name, main_base, main_model, key='main',
            missing=[] if main_key else ['TYPESAFE_API_KEY'], profile=family(main_model),
            note='' if on['decision'] else '판단형 작업도 LLM이 처리합니다.', extra=extra)
        if not main_is_clef:
            defaults = clef_defaults(self.root)
            add('decision.clef', 'decision', 'Clef (로컬 서빙)', clef['base_url'], clef['model'], key='clef',
                missing=[] if clef['installed'] or clef['edited'] else ['clef-flash 설치 (bash clef-flash/install.sh)'], profile='clef',
                note='같은 System One API를 쓰는 자체 서빙 Decision 모델입니다. 인증 없이 연결합니다.',
                extra={'timeout_s': 120, **({'tasks': tasks} if primary == 'clef' else {}),
                       **({'env': {'base_url': defaults['base_url'], 'model': defaults['model']}} if clef['edited'] else {})})
        if usage:
            calls = self._usage({m for e in out for m in (e['model'], e.get('quick_model'), e.get('vision_model')) if m})
            for entry in out:
                rows = [calls[m] for m in {entry['model'], entry.get('quick_model'), entry.get('vision_model')} if m in calls]
                if rows:
                    last = max(rows, key=lambda r: r['at'])
                    entry['last_call'] = {**last, 'calls_24h': sum(r['calls_24h'] for r in rows), 'errors_24h': sum(r['errors_24h'] for r in rows)}
                else:
                    entry['last_call'] = None
        return out

    def entry(self, pid: str) -> dict:
        for item in self.entries(usage=False):
            if item['id'] == pid:
                return item
        raise ProviderInputError('등록된 Provider가 아닙니다.', 404)

    def _usage(self, models) -> Dict[str, dict]:
        """Last real call per model from usage tracing (no network): time, result, and the last 24 hours' counts."""
        if not self.operations or not models:
            return {}
        models = sorted(models)
        day, week = time.time() - 86400, time.time() - 7 * 86400
        marks = ','.join('?' * len(models))
        try:
            with self.operations.db() as db:
                rows = db.execute(f'''SELECT model, max(started) at, status, code, duration_ms,
                    sum(started>?) calls_24h, sum(CASE WHEN started>? AND status NOT IN ('ok','cancelled') THEN 1 ELSE 0 END) errors_24h
                    FROM spans WHERE kind='llm.usage' AND started>? AND model IN ({marks}) GROUP BY model''', (day, day, week, *models)).fetchall()
        except Exception:  # tracing is optional; the tab works without it
            return {}
        return {r['model']: {'at': r['at'], 'status': r['status'], 'code': r['code'], 'ms': r['duration_ms'],
                             'calls_24h': r['calls_24h'] or 0, 'errors_24h': r['errors_24h'] or 0} for r in rows}

    def view(self) -> dict:
        nxt = next_slot(time.time(), self.interval) if self.interval else None
        return {'providers': self.entries(), 'interval_s': self.interval, 'monitoring': self.interval > 0,
                'schedule': {'from': f'{WINDOW[0]:02d}:00', 'to': f'{WINDOW[1]:02d}:00', 'every_min': self.interval // 60,
                             'next': datetime.fromtimestamp(nxt, TZ).isoformat() if nxt else None},
                'samples': samples(), 'status_names': STATUS_NAMES}

    # ------------------------------------------------------------ probes (no tokens; in-house / self-hosted only)
    def _get(self, url: str, headers: Dict[str, str]):
        with self.open(urllib.request.Request(url, headers=headers, method='GET'), timeout=PROBE_TIMEOUT) as response:
            raw = response.read(2_000_000)
        try:
            return json.loads(raw.decode('utf-8'))
        except ValueError:
            return None

    def _post(self, url: str, headers: Dict[str, str], body: dict):
        request = urllib.request.Request(url, data=json.dumps(body, ensure_ascii=False).encode('utf-8'), method='POST',
                                         headers={'content-type': 'application/json', **headers})
        with self.open(request, timeout=max(PROBE_TIMEOUT, 20)) as response:
            response.read(200_000)

    def _probe_llm(self, profile: str, key: str, base: str, model: str, spend: bool = True) -> dict:
        if profile == 'gemini':
            self._get(f'{base}/models/{model}', {'x-goog-api-key': key})
            return {'status': 'ok', 'detail': '모델 정보를 확인했습니다.'}
        auth = {'authorization': 'Bearer ' + key} if key else {}
        if urlsplit(base).hostname == 'openrouter.ai':
            return self._probe_openrouter(auth, base, model)
        try:
            data = self._get(base + '/models', auth)
        except urllib.error.HTTPError as exc:
            if exc.code not in (404, 405, 501):
                raise
            if not spend:   # an external API is never asked for a paid generation
                exc.close()
                return {'status': 'degraded', 'detail': '모델 목록 API가 없어 토큰 없이 확인하지 못했습니다(HTTP %d).' % exc.code}
            # A gateway without a model list: one minimal generation (1 output token) on the self-hosted server.
            self._post(base + '/chat/completions', auth, {'model': model, 'messages': [{'role': 'user', 'content': 'ping'}], 'max_tokens': 1, 'stream': False})
            return {'status': 'ok', 'detail': '모델 목록 API가 없어 최소 호출(출력 1토큰)로 응답을 확인했습니다.'}
        rows = data.get('data') if isinstance(data, dict) else data
        ids = [str(r.get('id')) for r in rows if isinstance(r, dict) and r.get('id')] if isinstance(rows, list) else []
        if ids and model not in ids:
            return {'status': 'degraded', 'detail': f'서버는 응답하지만 모델 ID 「{model}」이 목록에 없습니다.', 'models': ids[:40]}
        return {'status': 'ok', 'detail': '서버 응답과 모델 ID를 확인했습니다.' if ids else '서버가 응답했습니다(모델 목록은 비어 있음).', 'models': ids[:40]}

    def _probe_openrouter(self, auth: Dict[str, str], base: str, model: str) -> dict:
        """OpenRouter, no tokens: the key's credits (/credits, else /key) and the model's endpoints"""
        try:
            data = (self._get(base + '/credits', auth) or {}).get('data') or {}
            left = float(data['total_credits']) - float(data['total_usage']) if 'total_credits' in data else None
        except urllib.error.HTTPError as exc:
            if exc.code in (401,):
                raise
            exc.close()
            data = (self._get(base + '/key', auth) or {}).get('data') or {}
            left = data.get('limit_remaining')
        try:
            self._get(f'{base}/models/{model}/endpoints', {})
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            exc.close()
            return {'status': 'down', 'detail': f'OpenRouter에 모델 ID 「{model}」이 없습니다.'}
        if left is not None and float(left) <= 0:
            return {'status': 'down', 'detail': '크레딧이 남지 않았습니다(OpenRouter).', 'credits': round(float(left), 2)}
        return {'status': 'ok', 'detail': '키 · 모델을 확인했습니다' + (f' · 남은 크레딧 ${float(left):.2f}' if left is not None else '') + '.',
                **({'credits': round(float(left), 2)} if left is not None else {})}

    def _probe_decision(self, key: str, base: str, model: str, spend: bool = True) -> dict:
        root = base[:-3].rstrip('/') if base.endswith('/v1') else base
        auth = {'authorization': 'Bearer ' + key}
        try:
            data = self._get(root + '/health', {})
        except urllib.error.HTTPError as exc:
            if exc.code not in (401, 403, 404, 405):
                raise
            exc.close()
            # no health API (TypeSafe): the model list with the key costs nothing
            try:
                listed = self._get(base + '/models', auth)
            except urllib.error.HTTPError as again:
                if again.code not in (404, 405) or not spend:
                    raise
                again.close()
                self._post(base + '/systemone', auth,
                           {'model': model, 'state': {'text': 'ping'}, 'questions': {'q': {'type': 'noul', 'instructions': '이 글은 한 단어다.'}}})
                return {'status': 'ok', 'detail': '상태 API가 없어 질문 하나로 응답을 확인했습니다.'}
            rows = (listed.get('data') or listed.get('models')) if isinstance(listed, dict) else listed   # TypeSafe: {models: [{name, …}]}
            ids = [str((r.get('id') or r.get('name')) if isinstance(r, dict) else r) for r in rows] if isinstance(rows, list) else []
            # the list names only the moving ids (jev-latest · jev-preview); a pinned version of a listed family (jev-1.14.0) is fine
            pinned = model not in ids and any(i.split('-')[0] == model.split('-')[0] for i in ids)
            if ids and model not in ids and not pinned:
                return {'status': 'degraded', 'detail': f'키는 맞지만 모델 「{model}」이 목록에 없습니다.', 'models': ids[:40]}
            return {'status': 'ok', 'detail': (f"키를 확인했습니다(목록: {' · '.join(ids[:4])}, 설정은 버전 고정)." if pinned else
                                               '키 · 모델 목록을 확인했습니다.' if ids else '키를 확인했습니다(모델 목록 형식을 읽지 못함).'),
                    **({'models': ids[:40]} if ids else {})}
        served = data.get('model') if isinstance(data, dict) else None
        if isinstance(data, dict) and data.get('status') not in (None, 'ok'):
            return {'status': 'degraded', 'detail': f"서버 상태: {str(data.get('status'))[:60]}"}
        if served and served != model:
            return {'status': 'degraded', 'detail': f'서버가 올린 모델은 「{served}」입니다(설정: {model}).', 'models': [str(served)]}
        return {'status': 'ok', 'detail': '서버 상태와 모델을 확인했습니다.', **({'models': [str(served)]} if served else {})}

    def probe(self, entry: dict, base: Optional[str] = None, model: Optional[str] = None) -> dict:
        """One probe of ``entry`` (optionally against a candidate address / model that is not saved yet)."""
        base = (base or entry['base_url'] or '').rstrip('/')
        model = model or entry['model']
        current = cfg.get_settings()
        if entry['role'] == 'llm':
            key = self._llm_settings(entry['profile'], current).api_key()
        else:
            key = self._decision_settings(entry['id'], current).decision_key()
        started = time.time()
        try:
            spend = entry['scope'] == 'internal'   # an external API is checked only with calls that cost nothing
            result = (self._probe_llm(entry['profile'], key, base, model, spend) if entry['role'] == 'llm'
                      else self._probe_decision(key, base, model, spend))
        except urllib.error.HTTPError as exc:
            exc.close()
            detail = ('인증 키가 거절되었습니다' if exc.code in (401, 403) else '주소 또는 모델을 찾지 못했습니다' if exc.code == 404 else '서버가 오류를 돌려줬습니다')
            result = {'status': 'down' if exc.code in (401, 403, 404) or exc.code >= 500 else 'degraded', 'detail': f'{detail} (HTTP {exc.code}).', 'http': exc.code}
        except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
            result = {'status': 'down', 'detail': _reason(exc)}
        except Exception as exc:  # noqa: BLE001 — a probe never raises into the scheduler or the request
            result = {'status': 'down', 'detail': redact(f'점검 중 오류: {type(exc).__name__}', (key,))}
        ts = time.time()
        return {**result, 'ms': int((ts - started) * 1000), 'checked_at': now(), 'ts': ts, 'endpoint': base, 'model': model}

    def check(self, pid: str, base: Optional[str] = None, model: Optional[str] = None, actor: str = 'admin') -> dict:
        """Probe now. With a candidate address / model nothing is recorded (a connection test before saving)."""
        entry = self.entry(pid)
        candidate = bool(base or model)
        if candidate:
            if not entry['editable']:
                raise ProviderInputError('이 Provider의 주소는 여기서 바꾸지 않습니다. .env에서 설정합니다.')
            base = clean_endpoint(base, entry['role']) if base else None
            model = self._model(entry, model) if model else None
            host = urlsplit(base or entry['base_url'] or '').hostname
            if entry['profile'] != 'internal' and not cfg.private_host(host):
                raise ProviderInputError('외부 API 주소는 점검하지 않습니다. 저장한 뒤 실험으로 확인해 주세요.')
            if not (base or entry['base_url']):
                raise ProviderInputError('주소를 입력해 주세요.')
            return self.probe(entry, base, model)
        if not entry['registered']:
            raise ProviderInputError('아직 연결 정보가 없습니다: ' + ', '.join(entry['missing']))
        return self._record(pid, self.probe(entry), actor)

    def _record(self, pid: str, result: dict, actor: str) -> dict:
        with self.lock:
            statuses = self.store.setting('provider_status', {}) or {}
            before = statuses.get(pid) or {}
            same = before.get('status') == result['status'] and before.get('endpoint') == result['endpoint']
            history = (before.get('history') or [] if before.get('endpoint') == result['endpoint'] else [])
            record = {**result, 'since': before.get('since') if same and before.get('since') else result['checked_at'],
                      'last_ok': result['checked_at'] if result['status'] == 'ok' else before.get('last_ok') if before.get('endpoint') == result['endpoint'] else None,
                      'history': (history + [{'at': result['checked_at'], 'status': result['status'], 'ms': result['ms']}])[-HISTORY:]}
            statuses[pid] = record
            self.store.set_setting('provider_status', statuses)
        if not same:
            self.store.event('provider.status', pid, {'status': result['status'], 'detail': result.get('detail'), 'endpoint': result['endpoint'],
                                                      'previous': before.get('status')}, actor)
        return record

    # ------------------------------------------------------------ edit + re-connect
    @staticmethod
    def _model(entry: dict, value: str) -> str:
        model = (value or '').strip()
        pattern = DECISION_MODEL if entry['role'] == 'decision' else LLM_MODEL
        if not pattern.fullmatch(model):
            raise ProviderInputError('모델 ID 형식이 올바르지 않습니다.' + (' (소문자 · 숫자 · 점 · 하이픈)' if entry['role'] == 'decision' else ''))
        return model

    def connect(self, pid: str, base_url: str, model: str, actor: str = 'admin') -> dict:
        """Save a changed address / model id, apply it to the running app, and probe the new connection."""
        entry = self.entry(pid)
        if not entry['editable']:
            raise ProviderInputError('이 Provider의 주소는 여기서 바꾸지 않습니다. .env에서 설정합니다.')
        value = {'base_url': clean_endpoint(base_url, entry['role']), 'model': self._model(entry, model), 'saved_at': now(), 'by': actor}
        with self.lock:
            saved = self.saved()
            saved[pid] = value
            self.store.set_setting('provider_endpoints', saved)
        self.apply()
        self.store.event('provider.endpoint', pid, {'base_url': value['base_url'], 'model': value['model'],
                                                    'previous': {'base_url': entry['base_url'], 'model': entry['model']}}, actor)
        entry = self.entry(pid)
        check = self._record(pid, self.probe(entry), actor) if entry['checkable'] else None
        return {'provider': self.entry(pid), 'check': check}

    def reset(self, pid: str, actor: str = 'admin') -> dict:
        """Drop the saved edit: the connection follows ``.env`` (or the Clef defaults) again."""
        with self.lock:
            saved = self.saved()
            removed = saved.pop(pid, None)
            self.store.set_setting('provider_endpoints', saved)
        self.apply()
        if removed:
            self.store.event('provider.endpoint.reset', pid, {'removed': {k: removed.get(k) for k in ('base_url', 'model')}}, actor)
        entry = self.entry(pid)
        check = self._record(pid, self.probe(entry), actor) if entry['checkable'] else None
        return {'provider': self.entry(pid), 'check': check}

    # ------------------------------------------------------------ activation (no restart): on / off and 대표 per role
    @staticmethod
    def _key(entry: dict) -> str:
        return entry['profile'] if entry['role'] == 'llm' else entry['id'].split('.', 1)[1]

    def _set(self, role: str, names: List[str], pid: str, action: str, actor: str) -> dict:
        before = self.on(cfg.get_settings())[role]
        with self.lock:
            stored = self.switches()
            if names == self.on(cfg.load_settings(os.environ))[role]:  # an explicit environ skips the admin layer: .env alone
                stored.pop(role, None)
            else:
                stored[role] = names
            self.store.set_setting('provider_active', stored)
        self.apply()
        self.store.event('provider.' + action, pid, {'role': role, 'order': names, 'previous': before}, actor)
        entry = self.entry(pid)
        check = self._record(pid, self.probe(entry), actor) if action != 'deactivate' and entry['checkable'] else None
        return {'provider': entry, 'check': check}

    def _usable(self, pid: str) -> dict:
        entry = self.entry(pid)
        if not entry['registered']:
            raise ProviderInputError('연결 정보가 없어 켤 수 없습니다: ' + ' · '.join(entry['missing']))
        if entry['role'] == 'llm' and entry['profile'] not in cfg.PROVIDERS:
            raise ProviderInputError('이 LLM은 여기서 켤 수 없습니다. .env에서 설정합니다.')
        return entry

    def activate(self, pid: str, actor: str = 'admin') -> dict:
        """Turn ``pid`` on: it joins its role after the ones already on (the first one on a role becomes 대표)."""
        entry = self._usable(pid)
        names = self.on(cfg.get_settings())[entry['role']]
        if self._key(entry) in names:
            return {'provider': entry, 'check': None}
        return self._set(entry['role'], names + [self._key(entry)], pid, 'activate', actor)

    def deactivate(self, pid: str, actor: str = 'admin') -> dict:
        """Turn ``pid`` off; if it was 대표, the next one on takes over. The LLM is never left empty; with no decision
        model on, its tasks go to the LLM."""
        entry = self.entry(pid)
        names = self.on(cfg.get_settings())[entry['role']]
        key = self._key(entry)
        if key not in names:
            return {'provider': entry, 'check': None}
        if entry['role'] == 'llm' and names == [key]:
            raise ProviderInputError('LLM은 하나는 켜져 있어야 합니다. 다른 LLM을 먼저 켜 주세요.')
        return self._set(entry['role'], [n for n in names if n != key], pid, 'deactivate', actor)

    def make_primary(self, pid: str, actor: str = 'admin') -> dict:
        """``pid`` becomes 대표 of its role (turned on if it was off); the others stay on as fallbacks, in order."""
        entry = self._usable(pid)
        names = self.on(cfg.get_settings())[entry['role']]
        key = self._key(entry)
        if names[:1] == [key]:
            return {'provider': entry, 'check': None}
        return self._set(entry['role'], [key] + [n for n in names if n != key], pid, 'primary', actor)

    # ------------------------------------------------------------ experiments (one real call per target)
    def _provider(self, name: str, settings):
        with self.lock:
            cached = self._llm.get(name)
            if cached is None or cached[0] != settings or cached[1]._key != settings.api_key():
                cached = self._llm[name] = (settings, GeminiProvider(settings) if name == 'gemini' else LLMProvider(settings))
            return cached[1]

    def run(self, pid: str, *, model: Optional[str] = None, system: str = '', user: str = '', json_mode: bool = False,
            temperature: float = 0.2, max_tokens: int = 1024, state: Any = None, questions: Optional[dict] = None) -> dict:
        entry = self.entry(pid)
        if not entry['registered']:
            raise ProviderInputError('아직 연결 정보가 없습니다: ' + ', '.join(entry['missing']))
        model = self._model(entry, model) if model and model.strip() else entry['model']
        base = {'id': pid, 'name': entry['name'], 'role': entry['role'], 'model': model, 'host': entry['host']}
        started = time.time()

        def failed(code: str, message: str, status: Optional[int] = None) -> dict:
            return {**base, 'ok': False, 'ms': int((time.time() - started) * 1000), 'error': {'code': code, 'message': message, 'status': status}}

        with telemetry.scope(feature='admin.providers'):
            if entry['role'] == 'llm':
                if not str(user or '').strip():
                    raise ProviderInputError('입력 프롬프트가 비어 있습니다.')
                # No response cache and no hidden retries: the latency is one real call.
                settings = dataclasses.replace(self._llm_settings(entry['profile']), llm_cache=False)
                try:
                    result = self._provider(entry['profile'], settings).generate_text(
                        stage='admin:provider-test', system=system or '', user=user, temperature=temperature,
                        max_output_tokens=max_tokens, json_mode=json_mode, model=model, max_attempts=1)
                except ProviderError as exc:
                    hint = ' — 생각 단계가 있는 모델은 출력 토큰을 더 씁니다. 최대 출력 토큰을 늘려 다시 실행해 보세요.' if exc.code == 'max_tokens' else ''
                    return failed(exc.code, exc.message + hint, exc.status)
                out = {**base, 'ok': True, 'ms': result.ms, 'text': result.text, 'input_tokens': result.prompt_tokens,
                       'output_tokens': result.output_tokens, 'model': result.model or model}
                if json_mode:
                    try:
                        out['json'] = parse_json(result.text)
                        out['json_valid'] = True
                    except ValueError:
                        out['json_valid'] = False
                if result.output_tokens and result.ms:
                    out['tokens_per_s'] = round(result.output_tokens / (result.ms / 1000), 1)
                return out
            if not isinstance(questions, dict) or not questions:
                raise ProviderInputError('questions는 {질문 ID: {type, instructions, criteria}} 형태여야 합니다.')
            if state is None:
                raise ProviderInputError('state가 비어 있습니다.')
            try:
                result = TypeSafeDecision(self._decision_settings(pid, model=model)).ask(stage='admin:provider-test', state=state, questions=questions)
            except ProviderError as exc:
                return failed(exc.code, exc.message, exc.status)
            except (ValueError, TypeError, AttributeError) as exc:
                return failed('bad_request', str(exc)[:300])
            return {**base, 'ok': True, 'ms': result.ms, 'answers': result.answers, 'input_tokens': result.input_tokens,
                    'output_tokens': result.output_tokens, 'model': result.model or model}

    # ------------------------------------------------------------ timer
    def start(self) -> None:
        self.apply()
        raw = str(runtime_env.env_values().get('WINMATE_PROVIDER_CHECK_INTERVAL', '')).strip().lower()
        self.interval = 0 if raw in ('0', 'off', 'false', 'no') else runtime_env.parse_int(raw, DEFAULT_INTERVAL, 60, 86400)
        if self.interval and self.thread is None:
            self.stop.clear()
            self.thread = threading.Thread(target=self._loop, daemon=True, name='winmate-provider-check')
            self.thread.start()

    def close(self) -> None:
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=2)
            self.thread = None

    def _loop(self) -> None:
        delay = 5
        while not self.stop.wait(delay):
            delay = 30
            try:
                self.sweep()
            except Exception:  # noqa: BLE001 — the timer survives a broken store or settings file
                pass

    def sweep(self, force: bool = False, at: Optional[float] = None) -> List[str]:
        """Probe every active provider whose last probe is older than the current slot (08:00 … 22:00, every interval)."""
        done: List[str] = []
        due = due_slot(time.time() if at is None else at, self.interval) if self.interval else None
        if due is None and not force:
            return done
        for entry in self.entries(usage=False):
            if not entry['monitored'] or self.stop.is_set():
                continue
            status = entry['status']
            if force or not status or float(status.get('ts') or 0) < due:
                self._record(entry['id'], self.probe(entry), 'scheduler')
                done.append(entry['id'])
        return done


# ---------------------------------------------------------------- API
class Candidate(BaseModel):
    base_url: Optional[str] = Field(default=None, max_length=300)
    model: Optional[str] = Field(default=None, max_length=120)


class Endpoint(BaseModel):
    base_url: str = Field(min_length=1, max_length=300)
    model: str = Field(min_length=1, max_length=120)


class RunInput(BaseModel):
    target: str = Field(min_length=1, max_length=60)
    model: Optional[str] = Field(default=None, max_length=120)
    system: str = Field(default='', max_length=20000)
    user: str = Field(default='', max_length=120000)
    json_mode: bool = False
    temperature: float = Field(default=0.2, ge=0, le=2)
    max_tokens: int = Field(default=1024, ge=1, le=8192)
    state: Any = None
    questions: Optional[dict] = None


def provider_router(get: Callable[[], Providers]) -> APIRouter:
    router = APIRouter()

    def actor() -> str:
        return telemetry.current().get('username') or 'admin'

    def guarded(fn):
        try:
            return fn()
        except ProviderInputError as exc:
            raise HTTPException(exc.status, str(exc)) from None

    @router.get('/api/providers')
    def listing():
        return get().view()

    @router.post('/api/providers/run')
    def run(body: RunInput):
        if len(json.dumps([body.state, body.questions], ensure_ascii=False)) > 200_000:
            raise HTTPException(413, '입력이 너무 큽니다.')
        return guarded(lambda: get().run(body.target, model=body.model, system=body.system, user=body.user, json_mode=body.json_mode,
                                         temperature=body.temperature, max_tokens=body.max_tokens, state=body.state, questions=body.questions))

    @router.post('/api/providers/{pid}/check')
    def check(pid: str, body: Optional[Candidate] = None):
        body = body or Candidate()
        return guarded(lambda: get().check(pid, body.base_url, body.model, actor()))

    @router.put('/api/providers/{pid}/endpoint')
    def connect(pid: str, body: Endpoint):
        return guarded(lambda: get().connect(pid, body.base_url, body.model, actor()))

    @router.post('/api/providers/{pid}/activate')
    def activate(pid: str):
        return guarded(lambda: get().activate(pid, actor()))

    @router.post('/api/providers/{pid}/deactivate')
    def deactivate(pid: str):
        return guarded(lambda: get().deactivate(pid, actor()))

    @router.post('/api/providers/{pid}/primary')
    def primary(pid: str):
        return guarded(lambda: get().make_primary(pid, actor()))

    @router.delete('/api/providers/{pid}/endpoint')
    def reset(pid: str):
        return guarded(lambda: get().reset(pid, actor()))

    return router
