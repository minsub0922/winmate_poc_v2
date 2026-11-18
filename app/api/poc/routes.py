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
    POST /api/catalog/rank              task catalog.rank {kind, query, filters, candidates, count} → {data: {order}}
                                        (decision model when configured, else LLM — same output)
    POST /api/research/trend-sheets     {spec, want, avoid?} → 업종 트렌드 장을 실제 웹 검색 · 원문 대조로 검증한 근거로 구성 (market_research.py)
    POST /api/research/market           {spec} → 검증된 시장 근거 목록 (자유 서술형 시장 장의 근거 풀)

Errors (JSON ``{detail, code, ...}``): 422 validation / ``unsupported_option`` (offline · llm:false · mode≠real),
503 ``no_api_key`` / KB missing, 404, 409, and model failures with their typed status (429 · 502 · 503 · 504 ·
422) plus ``{step, retryable}``. There is no dummy 200 response.
"""
from __future__ import annotations

import asyncio
import json
import time
import threading
from typing import Any, AsyncIterator, Iterator

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from . import service
from .adapters import llm as llm_adapter
from .adapters import search as search_adapter
from .adapters import catalog_rank as catalog_rank_adapter
from . import market_research
from .jobs import BadRequest, Conflict, ModelFailure, NotFound, Unavailable
from .provider import redact
from .service import capabilities, initialize
from .settings import get_settings
from .. import telemetry

router = APIRouter()
__all__ = ['router', 'initialize', 'capabilities']
SSE_HEADERS = {'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', 'Connection': 'keep-alive'}
_SKILL_TASKS = set()


@router.post('/api/simulation/skills/run')
async def run_simulation_skill(request: Request, body: Any = Body(...)):
    from .adapters import simulation_skills
    from .strict import require_provider
    validated = _guard(lambda: (simulation_skills.validate(body), require_provider(get_settings(), 'simulation')))
    if isinstance(validated, JSONResponse):
        return validated
    payload, _provider = validated
    loop = asyncio.get_running_loop()
    queue = asyncio.Queue()
    cancelled = threading.Event()
    def emit(event):
        if not loop.is_closed():
            try: loop.call_soon_threadsafe(queue.put_nowait, event)
            except RuntimeError: pass
    def work():
        try:
            result = simulation_skills.run(payload, get_settings(), products=request.app.state.products,
                cancel=cancelled.is_set, on_progress=lambda message: emit({'type':'progress','message':message}), on_event=emit)
            if not cancelled.is_set(): emit({'type':'result','mode':'real','data':result})
        except ModelFailure as exc:
            telemetry.emit('application.error',status='error',feature='simulation',stage='simulation.skills',code=exc.code,message=str(exc),stack=telemetry.stack(exc))
            emit({'type':'error',**exc.public()})
        except Unavailable as exc:
            telemetry.emit('application.error',status='error',feature='simulation',stage='simulation.skills',code=exc.code,message=str(exc),stack=telemetry.stack(exc))
            emit({'type':'error','code':exc.code,'message':str(exc)})
        except Exception as exc:
            telemetry.emit('application.error',status='error',feature='simulation',stage='simulation.skills',code=getattr(exc,'code','upstream_error'),message=str(exc),stack=telemetry.stack(exc))
            emit({'type':'error','code':getattr(exc,'code','upstream_error'),'message':redact(str(exc))[:500]})
    task = asyncio.create_task(asyncio.to_thread(work))
    _SKILL_TASKS.add(task)
    task.add_done_callback(_SKILL_TASKS.discard)
    async def events():
        try:
            while True:
                if await request.is_disconnected(): break
                try: event = await asyncio.wait_for(queue.get(), timeout=1)
                except asyncio.TimeoutError:
                    yield b': waiting\n\n'
                    continue
                yield _sse(event)
                if event['type'] in ('result','error'): break
        finally:
            cancelled.set()
    return StreamingResponse(events(), media_type='text/event-stream', headers=SSE_HEADERS)


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


def _research_spec(body: Any) -> dict:
    """validated, size-capped research request (업종 · 요구사항 · 연결 품목 — the customer name is only used to scrub the public search queries)."""
    if not isinstance(body, dict) or not isinstance(body.get('spec'), dict):
        raise BadRequest('spec(업종 · 요구사항) 객체가 필요합니다.')
    raw = body['spec']
    text = lambda k, n: str(raw.get(k) or '')[:n] if isinstance(raw.get(k), (str, int)) else ''  # noqa: E731
    names = lambda k, n: [str(x)[:100] for x in (raw.get(k) or []) if isinstance(x, str) and x.strip()][:n] if isinstance(raw.get(k), list) else []  # noqa: E731
    hints = []
    for h in (raw.get('hints') or [])[:8] if isinstance(raw.get('hints'), list) else []:
        if isinstance(h, dict):
            hints.append({'kind': str(h.get('kind') or '')[:12], 'title': str(h.get('title') or '')[:120],
                          'labels': [str(x)[:60] for x in (h.get('labels') or []) if isinstance(x, str)][:10] if isinstance(h.get('labels'), list) else []})
    spec = {'industry': text('industry', 80), 'industry_short': text('industry_short', 20), 'ind': text('ind', 8), 'customer': text('customer', 80), 'title': text('title', 120),
            'requirement': text('requirement', 2500), 'products': names('products', 8), 'solutions': names('solutions', 6), 'hints': hints, 'today': text('today', 10)}
    if not spec['industry'] and not spec['requirement']:
        raise BadRequest('업종이나 요구사항이 있어야 시장 자료를 조사할 수 있습니다.')
    return spec


@router.post('/api/research/trend-sheets')
def research_trend_sheets(body: Any = Body(...)):
    """업종 트렌드 장을 실제 웹 검색으로 검증한 근거로 구성한다 — {spec, want: [line|share|stat|key], avoid?, fresh?} →
    {ok, sheets: [{kind, was, filled, why, v, ev, notes}], research}. 근거가 없으면 200 + filled:false(값을 지어내지 않는다)."""
    def run():
        from .strict import require_provider
        spec = _research_spec(body)
        want = [k for k in (body.get('want') or []) if k in market_research.KINDS][:4] if isinstance(body.get('want'), list) else []
        if not want:
            raise BadRequest('want 는 line · share · stat · key 중 1~4개여야 합니다.')
        avoid = [k for k in (body.get('avoid') or []) if k in market_research.KINDS] if isinstance(body.get('avoid'), list) else []
        provider = require_provider(get_settings(), 'fill')
        return market_research.trend_sheets(spec, want, provider, fresh=body.get('fresh') is True, avoid=avoid)
    return _guard(run)


@router.post('/api/research/market')
def research_market(body: Any = Body(...)):
    """검증된 시장 근거 목록(자유 서술형 시장 장의 근거 풀) — {spec, fresh?} → {ok, sources: [{title, url, body, sub, kind}], research, message?}."""
    def run():
        from .strict import require_provider
        spec = _research_spec(body)
        provider = require_provider(get_settings(), 'fill')
        pack = market_research.collect(spec, provider, fresh=body.get('fresh') is True)
        return {'ok': bool(pack.get('ok')), 'sources': market_research.source_pool(pack), 'research': market_research.research_meta(pack),
                'message': '' if pack.get('ok') else pack.get('message') or ''}
    return _guard(run)


@router.get('/api/research/status')
def research_status():
    """시장조사의 검색 수단과 근거 DB 상태 — {on, engines, store: {searches, docs, evidence, reused, engines: [출처별 성공 · 0건 · 실패]}}. 고객 정보는 들어 있지 않다."""
    def run():
        cfg = market_research.settings()
        store = market_research.store_of(cfg)
        stats = store.stats() if store is not None else None
        if isinstance(stats, dict):
            stats.pop('path', None)
        return {'on': cfg['on'], 'engines': list(cfg['engines']), 'reuse_days': cfg['reuse'] // 86400, 'store': stats}
    return _guard(run)


@router.post('/api/catalog/rank')
def catalog_rank(body: Any = Body(...)):
    return _guard(lambda: catalog_rank_adapter.handle(body, get_settings()))


@router.post('/api/llm')
def llm(request: Request, body: Any = Body(...)):
    def run():
        req, provider = llm_adapter.parse(body, get_settings())
        wants_stream = body.get('stream') is True or 'text/event-stream' in (request.headers.get('accept') or '')
        if not wants_stream:
            # A step of resumable browser work (장 채우기): the answer is recorded on the server under its key, so the
            # same step asked again after a reload — or after leaving the app — is answered without asking the model again.
            step_key = body.get('step_key')
            if service.STEPS.valid(step_key):
                return service.STEPS.run(str(telemetry.current().get('username') or ''), step_key, lambda: llm_adapter.complete(req, provider))
            return llm_adapter.complete(req, provider)
        events = llm_adapter.open_stream(req, provider)  # first chunk already received — start errors are HTTP errors

        def frames() -> Iterator[bytes]:
            for ev in events:
                yield _sse(ev)
        return StreamingResponse(frames(), media_type='text/event-stream', headers=SSE_HEADERS)
    return _guard(run)
