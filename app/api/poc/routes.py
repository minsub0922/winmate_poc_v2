"""FastAPI router for the PoC-backed functions — strict real-only (include it from app/api/main.py).

    from app.api.poc.routes import router as poc_router, initialize as poc_initialize, capabilities as poc_capabilities
    app.include_router(poc_router)
    # in lifespan: poc_initialize()   — raises PocStartupError when the server has no Gemini provider

Endpoints
    GET  /api/poc/capabilities
    POST /api/jobs                      {kind: rfp|layout|storyboard|review, ...}  → 202 job snapshot
    GET  /api/jobs                      recent jobs
    GET  /api/jobs/{id}?since=N         poll (events with seq > N)
    GET  /api/jobs/{id}/events          SSE (event: text|state|result), resumes from ?since=N or Last-Event-ID
    POST /api/jobs/{id}/answer          {answers: {question_id: value}, use_defaults?: bool}  → 409 unless waiting
    POST /api/jobs/{id}/cancel
    POST /api/layouts/search            {q, part, industry, products, solutions, strategy, k, level}  BM25+TF-IDF → Gemini rerank
    POST /api/llm                       generic sample adapter (JSON or SSE), {feature, kind, prompt|turns, schema?}

Errors (JSON ``{detail, code, ...}``): 422 validation / ``unsupported_option`` (offline · llm:false · mode≠real),
503 ``no_api_key`` / KB missing, 404, 409, and model failures with their typed status (429 · 502 · 503 · 504 ·
422) plus ``{step, retryable}``. There is no dummy 200 response.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, AsyncIterator, Iterator

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from . import service
from .adapters import llm as llm_adapter
from .adapters import search as search_adapter
from .jobs import BadRequest, Conflict, ModelFailure, NotFound, Unavailable
from .provider import redact
from .service import capabilities, initialize
from .settings import get_settings

router = APIRouter()
__all__ = ['router', 'initialize', 'capabilities']
SSE_HEADERS = {'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive'}


def _error(status: int, code: str, message: str, **extra: Any) -> JSONResponse:
    message = redact(message)[:600]
    return JSONResponse({'detail': message, 'code': code, 'error': code, 'message': message, 'mode': 'real', **extra}, status_code=status)


def _guard(fn, *args: Any) -> Any:
    try:
        return fn(*args)
    except BadRequest as exc:
        return _error(422, exc.code, str(exc))
    except NotFound:
        return _error(404, 'not_found', '작업을 찾지 못했습니다.')
    except Conflict as exc:
        return _error(409, 'conflict', str(exc))
    except Unavailable as exc:
        return _error(503, exc.code, str(exc), retryable=exc.code in ('search_busy',))
    except ModelFailure as exc:
        return _error(exc.status, exc.code, exc.message, step=exc.step or None, retryable=exc.retryable, provider_code=exc.provider_code,
                      reason=exc.detail or None)
    except Exception as exc:  # noqa: BLE001 — never leak internals/secrets
        code = getattr(exc, 'code', None) or 'internal_error'
        return _error(503 if code in ('kb_missing', 'kb_invalid') else 500, str(code), f'{type(exc).__name__}: {exc}')


def _sse(payload: dict, event: str | None = None, eid: int | None = None) -> bytes:
    head = (f'id: {eid}\n' if eid is not None else '') + (f'event: {event}\n' if event else '')
    return (head + 'data: ' + json.dumps(payload, ensure_ascii=False) + '\n\n').encode('utf-8')


@router.get('/api/poc/capabilities')
def get_capabilities():
    return _guard(capabilities)


@router.post('/api/jobs')
def post_job(body: Any = Body(...)):
    def run():
        status, payload = service.submit(body)
        return JSONResponse(payload, status_code=status)
    return _guard(run)


@router.get('/api/jobs')
def list_jobs(n: int = Query(30, ge=1, le=100)):
    return {'jobs': service.JOBS.recent(n)}


@router.get('/api/jobs/{job_id}')
def get_job(job_id: str, since: int = Query(0, ge=0)):
    return _guard(lambda: service.get_job(job_id).snapshot(since))


@router.post('/api/jobs/{job_id}/answer')
def answer_job(job_id: str, body: Any = Body(...)):
    return _guard(service.answer, job_id, body)


@router.post('/api/jobs/{job_id}/retry')
def retry_job(job_id: str):
    return _guard(service.retry, job_id)


@router.post('/api/jobs/{job_id}/cancel')
def cancel_job(job_id: str):
    return _guard(service.cancel, job_id)


@router.get('/api/jobs/{job_id}/events')
async def job_events(job_id: str, request: Request, since: int = Query(0, ge=0)):
    try:
        job = service.get_job(job_id)
    except NotFound:
        return _error(404, 'not_found', '작업을 찾지 못했습니다.')
    last_id = request.headers.get('last-event-id')
    if last_id and last_id.isdigit():
        since = max(since, int(last_id))

    async def gen() -> AsyncIterator[bytes]:
        cursor = since
        snap = job.snapshot(cursor, include_result=False)
        if snap['truncated']:
            yield _sse({'type': 'state', 'status': job.status, 'truncated': True, 'first_seq': snap['first_seq']}, 'state')
        last_beat = time.time()
        while True:
            events, last, _ = job.events_since(cursor)
            for ev in events:
                cursor = ev['seq']
                yield _sse(ev, ev['type'], ev['seq'])
            if job.terminal and cursor >= job.last_seq:
                return
            if await request.is_disconnected():
                return
            if time.time() - last_beat > 15:
                last_beat = time.time()
                yield b': keep-alive\n\n'
            await asyncio.sleep(0.25)

    return StreamingResponse(gen(), media_type='text/event-stream', headers=SSE_HEADERS)


@router.post('/api/layouts/search')
def layouts_search(body: Any = Body(...)):
    def run():
        if not isinstance(body, dict):
            raise BadRequest('요청 본문은 JSON 객체여야 합니다.')
        return search_adapter.search(body, get_settings())
    return _guard(run)


@router.post('/api/llm')
def llm(request: Request, body: Any = Body(...)):
    def run():
        req, provider = llm_adapter.parse(body, get_settings())
        wants_stream = body.get('stream') is True or 'text/event-stream' in (request.headers.get('accept') or '')
        if not wants_stream:
            return llm_adapter.complete(req, provider)
        events = llm_adapter.open_stream(req, provider)  # first chunk already received — start errors are HTTP errors

        def frames() -> Iterator[bytes]:
            for ev in events:
                yield _sse(ev)
        return StreamingResponse(frames(), media_type='text/event-stream', headers=SSE_HEADERS)
    return _guard(run)
