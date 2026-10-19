"""Integration façade: ``initialize()``, ``capabilities()`` and job dispatch used by ``routes.py`` — strict real-only."""
from __future__ import annotations

import logging
from datetime import datetime,timezone
import threading
from typing import Any, Dict

from . import imports, knowledge
from .adapters import layout as layout_adapter
from .adapters import review as review_adapter
from .adapters import rfp as rfp_adapter
from .adapters import search as search_adapter
from .adapters import storyboard as storyboard_adapter
from .adapters.common import Prepared
from .jobs import KINDS, BadRequest, Conflict, Job, JobManager
from .provider import get_provider, provider_usage, ProviderError
from .settings import FUNCTIONS, Settings, get_settings
from .strict import FAILURES, STRICT_POLICY

log = logging.getLogger('winmate.poc')
JOBS = JobManager()
_ADAPTERS = {'rfp': rfp_adapter, 'layout': layout_adapter, 'storyboard': storyboard_adapter, 'review': review_adapter}
_NEEDS_KB = ('layout', 'search', 'rerank', 'review', 'storyboard')
_IMPORT_OF = {'rfp': 'rfp', 'layout': 'layout', 'search': 'layout', 'rerank': 'layout', 'review': 'review', 'storyboard': 'storyboard'}
_ENGINE = {'search': 'bm25+tfidf+gemini', 'rerank': 'gemini', 'rfp': 'gemini', 'layout': 'gemini', 'review': 'gemini', 'storyboard': 'gemini'}
_STATE: Dict[str, Any] = {'initialized': False, 'warm': 'idle', 'warm_error': None, 'import_errors': {}}
_LOCK = threading.Lock()


class PocStartupError(RuntimeError):
    """Raised by :func:`initialize` when the strict runtime cannot serve AI features (no Gemini provider)."""

    def __init__(self, message: str, code: str = 'no_api_key') -> None:
        super().__init__(message)
        self.code = code


def initialize(warm: bool = True, require_provider: bool = True) -> dict:
    """Call from the app lifespan. Reads settings (runtime only), checks the provider, imports and the KB snapshot.

    Strict: with ``require_provider=True`` (default) a missing Gemini provider raises :class:`PocStartupError`
    so the server fails at startup instead of serving AI endpoints that can only answer 503. Legacy dummy
    settings are logged as ignored. ``warm=True`` builds layout cards + the TF-IDF index in the background.
    """
    settings = get_settings()
    for warning in settings.warnings:
        log.warning('PoC settings: %s', warning)
    provider, reason = get_provider(settings)
    if provider is None and require_provider:
        raise PocStartupError(FAILURES.get(reason, FAILURES['no_api_key'])[2] + ' (strict real-only runtime — 서버를 시작하지 않습니다)',
                              reason or 'no_api_key')
    _STATE['connection']=None
    if require_provider:
        try:
            probe=provider.generate_json(stage='startup:connection',user='Return JSON with connected true.',schema={'type':'OBJECT','properties':{'connected':{'type':'BOOLEAN'}},'required':['connected']},max_output_tokens=1024,max_attempts=2,cache_allowed=False)
            if not isinstance(probe.data,dict) or probe.data.get('connected') is not True:
                raise PocStartupError('Gemini 연결 확인 응답 형식이 올바르지 않습니다.','invalid_output')
            _STATE['connection']={'verified':True,'model':probe.model,'ms':probe.ms,'checked_at':datetime.now(timezone.utc).isoformat()}
        except ProviderError as exc:
            raise PocStartupError('Gemini 실제 연결 확인 실패: '+exc.code+' — 서버 키·모델·네트워크를 확인하세요.',exc.code) from None
    imports.ensure_paths()
    errors: Dict[str, str] = {}
    for name, loader in (('rfp', imports.rfp), ('layout', imports.layout), ('storyboard', imports.story), ('review', imports.score)):
        try:
            loader()
        except imports.PocImportError as exc:
            errors[name] = str(exc)[:400]
    _STATE['import_errors'] = errors
    _STATE['initialized'] = True
    for name, err in errors.items():
        log.error('PoC import failed (%s): %s', name, err)
    kb_ok = knowledge.status().get('available')
    if warm and kb_ok and 'layout' not in errors:
        with _LOCK:
            if _STATE['warm'] == 'idle':
                _STATE['warm'] = 'running'
                threading.Thread(target=_warm, args=(settings,), name='winmate-kb-warm', daemon=True).start()
    return capabilities()


def _warm(settings: Settings) -> None:
    try:
        knowledge.layout_assets(settings.kb_cache)
        knowledge.story_kb()
        knowledge.score_assets()
        _STATE['warm'] = 'ready'
    except Exception as exc:  # noqa: BLE001
        _STATE['warm'], _STATE['warm_error'] = 'error', f'{type(exc).__name__}: {exc}'[:400]
        log.warning('PoC KB warm-up failed: %s', _STATE['warm_error'])


def capabilities() -> dict:
    """Secret-free description of what each function can do right now (Gemini available / unavailable)."""
    settings = get_settings()
    provider, reason = get_provider(settings)
    kb = knowledge.status()
    errs = _STATE.get('import_errors') or {}
    functions = {}
    for name in FUNCTIONS:
        needs_kb = name in _NEEDS_KB
        import_error = errs.get(_IMPORT_OF.get(name, ''), None)
        kb_ready = (not needs_kb or bool(kb.get('available'))) and not import_error
        ready = kb_ready and provider is not None
        if provider is None:
            why = reason or 'no_api_key'
        elif import_error:
            why = 'import_error'
        elif not kb_ready:
            why = kb.get('code') or 'kb_missing'
        else:
            why = None
        functions[name] = {'mode': 'real', 'effective': 'llm' if ready else 'unavailable', 'ready': bool(ready), 'needs_kb': needs_kb,
                           'needs_provider': True, 'engine': _ENGINE.get(name, 'gemini'), 'unavailable_reason': why,
                           'provider_reason': None if provider is not None else (reason or 'no_api_key'), 'import_error': import_error,
                           'offline_override': False, 'rule_fallback': False}
    return {
        'initialized': _STATE['initialized'], 'connection':_STATE.get('connection'), 'policy': dict(STRICT_POLICY), 'settings': settings.public(),
        'provider': {'name': 'gemini', 'available': provider is not None, 'reason': None if provider is not None else (reason or 'no_api_key'),
                     'model': getattr(provider, 'model', None) if provider is not None else settings.model,
                     'quick_model': getattr(provider, 'quick_model', None) if provider is not None else settings.quick_model,
                     'usage': provider_usage()},
        'functions': functions, 'knowledge': kb, 'warm': _STATE['warm'], 'warm_error': _STATE['warm_error'],
        'jobs': {'kinds': list(KINDS), 'recent': JOBS.recent(10), 'persistence': 'memory'},
        'search_cache': search_adapter.CACHE.stats(),
        'notes': list(kb.get('notes') or knowledge.NOTES) + [
            '엄격한 실제 실행: 모든 AI 기능은 서버 Gemini 로만 실행하며 규칙 대체 · 더미 · offline 요청이 없습니다.',
            '모든 결과의 llm.effective 는 실제로 성공한 Gemini 호출이 있을 때만 llm 입니다. 모델 단계가 실패하면 작업은 error 로 끝납니다.',
            '계약 · 제한 사항: app/api/poc/STRICT.md · NOTES.md',
        ],
    }


def submit(body: Any) -> tuple[int, dict]:
    if not isinstance(body, dict):
        raise BadRequest('요청 본문은 JSON 객체여야 합니다.')
    kind = body.get('kind')
    if kind not in _ADAPTERS:
        raise BadRequest(f'kind 는 {", ".join(KINDS)} 중 하나여야 합니다.')
    settings = get_settings()
    prepared: Prepared = _ADAPTERS[kind].prepare(body, settings)  # raises 422 / 503 before any job exists
    job = JOBS.submit(kind, prepared.title, prepared.params, prepared.fn)
    return 202, job.snapshot(0)


def answer(job_id: str, body: Any) -> dict:
    if not isinstance(body, dict):
        raise BadRequest('요청 본문은 JSON 객체여야 합니다.')
    job = JOBS.get(job_id)
    if job.kind != 'layout':
        raise Conflict('이 작업은 답을 받지 않습니다.')
    JOBS.resume(job_id, layout_adapter.resume_fn, before=lambda j: layout_adapter.validate_answers(j, body))
    return job.snapshot(job.last_seq)


def cancel(job_id: str) -> dict:
    return JOBS.cancel(job_id).snapshot(0, include_result=False)


def get_job(job_id: str, since: int = 0) -> Job:
    return JOBS.get(job_id)


def retry(job_id: str) -> dict:
    from .strict import require_provider
    job=JOBS.get(job_id)
    require_provider(get_settings(),job.kind)
    return JOBS.retry(job_id).snapshot(0)
