"""Integration façade: ``initialize()``, ``capabilities()`` and job dispatch used by ``routes.py``."""
from __future__ import annotations

import logging
import threading
from typing import Any, Dict, Optional

from . import imports, knowledge
from .adapters import layout as layout_adapter
from .adapters import review as review_adapter
from .adapters import rfp as rfp_adapter
from .adapters import storyboard as storyboard_adapter
from .adapters.common import Prepared, dummy_response
from .jobs import KINDS, BadRequest, Conflict, Job, JobManager
from .provider import get_provider, provider_usage
from .settings import FUNCTIONS, Settings, get_settings

log = logging.getLogger('winmate.poc')
JOBS = JobManager()
_ADAPTERS = {'rfp': rfp_adapter, 'layout': layout_adapter, 'storyboard': storyboard_adapter, 'review': review_adapter}
_DUMMY_MESSAGES = {
    'rfp': 'RFP 정리 백엔드가 더미 모드입니다. 앱 기본 규칙(heuristicExtract)을 쓰세요.',
    'layout': 'Layout Agent 백엔드가 더미 모드입니다.',
    'storyboard': 'Storyboard 백엔드가 더미 모드입니다. 앱 기본 규칙(fallbackStoryboard)을 쓰세요.',
    'review': '제안서 검토 백엔드가 더미 모드입니다. 앱 규칙 점검을 쓰세요.',
}
_STATE: Dict[str, Any] = {'initialized': False, 'warm': 'idle', 'warm_error': None, 'import_errors': {}}
_LOCK = threading.Lock()


def initialize(warm: bool = True) -> dict:
    """Call from the app lifespan. Reads settings (runtime only), checks imports and the KB snapshot.

    ``warm=True`` builds layout cards + the TF-IDF index in a background thread so the first job does
    not pay for it. Never raises for missing optional parts — see ``capabilities()``.
    """
    settings = get_settings()
    imports.ensure_paths()
    errors: Dict[str, str] = {}
    for name, loader in (('rfp', imports.rfp), ('layout', imports.layout), ('storyboard', imports.story), ('review', imports.score)):
        try:
            loader()
        except imports.PocImportError as exc:
            errors[name] = str(exc)[:400]
    _STATE['import_errors'] = errors
    _STATE['initialized'] = True
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
    """Secret-free description of what each function will actually do right now."""
    settings = get_settings()
    provider, reason = get_provider(settings)
    kb = knowledge.status()
    errs = _STATE.get('import_errors') or {}
    functions = {}
    for name in FUNCTIONS:
        mode = settings.function_mode(name)
        needs_kb = name in ('layout', 'search', 'review', 'storyboard')
        import_error = errs.get('review' if name == 'review' else ('layout' if name == 'search' else name))
        ready = (not needs_kb or kb.get('available')) and not import_error
        if mode != 'real':
            effective = 'dummy'
        elif not ready:
            effective = 'unavailable'
        elif name == 'search':
            effective = 'rules'
        elif provider is not None:
            effective = 'llm' if name in ('llm', 'part', 'fill', 'simulation') else 'llm_with_rule_fallback'
        else:
            effective = 'unavailable' if name in ('llm', 'part', 'fill', 'simulation') else 'rules'
        functions[name] = {'mode': mode, 'effective': effective, 'ready': bool(ready), 'needs_kb': needs_kb,
                           'provider_reason': None if provider is not None or name == 'search' else reason,
                           'import_error': import_error, 'offline_override': name in KINDS or name == 'search'}
    return {
        'initialized': _STATE['initialized'], 'settings': settings.public(), 'provider': {'name': 'gemini', 'available': provider is not None,
                                                                                          'reason': reason or None, 'usage': provider_usage()},
        'functions': functions, 'knowledge': kb, 'warm': _STATE['warm'], 'warm_error': _STATE['warm_error'],
        'jobs': {'kinds': list(KINDS), 'recent': JOBS.recent(10), 'persistence': 'memory'},
        'notes': list(kb.get('notes') or knowledge.NOTES) + [
            'offline=true 요청은 기능 모드와 키에 관계없이 실제 PoC 규칙만 실행합니다(외부 호출 없음).',
            '모든 결과의 llm.effective 는 실제로 성공한 모델 호출로만 정합니다(llm · mixed · rules).',
            '제한 사항: app/api/poc/NOTES.md',
        ],
    }


def submit(body: Any) -> tuple[int, dict]:
    if not isinstance(body, dict):
        raise BadRequest('요청 본문은 JSON 객체여야 합니다.')
    kind = body.get('kind')
    if kind not in _ADAPTERS:
        raise BadRequest(f'kind 는 {", ".join(KINDS)} 중 하나여야 합니다.')
    settings = get_settings()
    prepared: Prepared = _ADAPTERS[kind].prepare(body, settings)
    if not prepared.plan.run:
        return 200, dummy_response(kind, prepared.plan, _DUMMY_MESSAGES[kind])
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
