"""Strict deterministic API contracts — group 1 (product DB) and group 6 (job semantics).

No model is called here. Sockets are blocked for the whole run; the in-process FastAPI TestClient needs none.
Auth is disabled on the in-process app for the run and restored afterwards (the auth suite is test_auth.py).
Provider settings are reloaded with ``WINMATE_ENV_FILES=none`` and no key, so no credential file is read.
A fake provider is used in exactly one case (J12) and only to check the *error* contract of ``/api/llm``.

Run from the repository root:
    app/.venv/bin/python -B app/tests/strict_contracts.py              # products + jobs
    app/.venv/bin/python -B app/tests/strict_contracts.py products     # one group

Each group writes ``app/tests/output/strict/<group>.json`` ({group, counts, cases[]}); exit code 1 on any failure.
Every case is reported as pass or fail — nothing is skipped. A missing interface is a failure that says so.
"""
from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
import traceback
import urllib.parse
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.dont_write_bytecode = True
OUT = ROOT / 'app/tests/output/strict'
MIN_CASES = 10
FAKE_KEY = 'AIzaSySTRICTFAKEKEY00000000000000000000'
TOTAL_PRODUCTS = 1068
CURATED = 40


def scrub_provider_env() -> None:
    """No .env files, no key, no mode switches. Auth variables are left alone."""
    os.environ['WINMATE_ENV_FILES'] = 'none'
    for key in list(os.environ):
        if key.startswith('GEMINI_') or key == 'WINMATE_MODE' or (key.startswith('WINMATE_') and key.endswith('_MODE')) \
                or key in ('WINMATE_LLM_CACHE', 'WINMATE_KB_CACHE') or key.startswith('WINMATE_GEMINI_'):
            os.environ.pop(key, None)


scrub_provider_env()

_REAL_CONNECT = socket.socket.connect
_REAL_CREATE = socket.create_connection


def _no_network(*args, **kwargs):
    raise AssertionError('network access attempted in a deterministic contract test')


# ---------------------------------------------------------------- tiny case runner
CASES: dict[str, list[tuple[str, str, object]]] = {}


def case(group: str, cid: str, title: str):
    def deco(fn):
        CASES.setdefault(group, []).append((cid, title, fn))
        return fn
    return deco


class CheckFailed(AssertionError):
    pass


def ok(condition, message: str) -> None:
    if not condition:
        raise CheckFailed(message)


def eq(actual, expected, message: str) -> None:
    if actual != expected:
        raise CheckFailed(f'{message}: expected {expected!r}, got {actual!r}')


def wait_until(predicate, timeout: float = 10.0, step: float = 0.01, what: str = 'condition'):
    end = time.time() + timeout
    while time.time() < end:
        value = predicate()
        if value:
            return value
        time.sleep(step)
    raise CheckFailed(f'timed out after {timeout}s waiting for {what}')


def run_group(group: str, ctx) -> dict:
    results = []
    for cid, title, fn in CASES[group]:
        details: dict = {}
        t0 = time.perf_counter()
        try:
            if ctx.setup_error:
                raise CheckFailed('unsupported: setup failed — ' + ctx.setup_error)
            fn(ctx, details)
            status, error = 'pass', None
        except CheckFailed as exc:
            status, error = 'fail', str(exc)
        except Exception as exc:  # recorded as a failure with its traceback — never skipped
            status, error = 'fail', f'{type(exc).__name__}: {exc}\n' + ''.join(traceback.format_exc(limit=6))
        results.append({'id': cid, 'title': title, 'status': status, 'ms': round((time.perf_counter() - t0) * 1000), 'details': details, 'error': error})
        print(('PASS ' if status == 'pass' else 'FAIL ') + f'{group}/{cid} {title}' + ('' if status == 'pass' else f'\n     {error.splitlines()[0]}'))
    passed = sum(1 for r in results if r['status'] == 'pass')
    report = {
        'group': group, 'suite': 'app/tests/strict_contracts.py', 'kind': 'deterministic', 'live_llm': False,
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'counts': {'total': len(results), 'passed': passed, 'failed': len(results) - passed, 'minimum': MIN_CASES},
        'meetsMinimum': len(results) >= MIN_CASES and passed == len(results),
        'cases': results,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'{group}.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


class Context:
    def __init__(self) -> None:
        self.setup_error = ''
        self.client = None
        self._cm = None
        self._auth_previous = None
        self.app = None
        self.all_products: list = []

    def __enter__(self):
        try:
            from fastapi.testclient import TestClient
            from app.api.main import app
            self.app = app
            self._auth_previous = app.state.auth.reconfigure(replace(app.state.auth.config, enabled=False))
            import app.api.main as main_module
            from app.api.poc import service
            # Only the lifecycle provider check is omitted in this network-blocked, non-AI suite.
            # Endpoint key/error policy remains active and is exercised in J12–J14.
            previous_initializer=main_module.initialize_poc
            main_module.initialize_poc=lambda:service.initialize(require_provider=False)
            self._cm = TestClient(app)
            try:self.client = self._cm.__enter__()
            finally:main_module.initialize_poc=previous_initializer
            response = self.client.get('/api/products')
            ok(response.status_code == 200, f'/api/products returned {response.status_code}')
            self.all_products = response.json()['items']
        except Exception as exc:  # every case then fails with this reason
            self.setup_error = f'{type(exc).__name__}: {exc}'
        return self

    def __exit__(self, *exc):
        if self._cm is not None:
            self._cm.__exit__(None, None, None)
        if self.app is not None and self._auth_previous is not None:
            self.app.state.auth.reconfigure(self._auth_previous)
        return False


def products_by_id(ctx) -> dict:
    return {p['id']: p for p in ctx.all_products}


def pack_ref(ref: str) -> tuple[str, int]:
    url, k = ref.split('#')
    return url, int(k)


# ================================================================ group 1 · products
@case('products', 'P01', 'count is 1068 across list, health and bootstrap')
def p01(ctx, d):
    items = ctx.all_products
    body = ctx.client.get('/api/products').json()
    d['items'] = len(items)
    eq(len(items), TOTAL_PRODUCTS, 'list length')
    eq(body['total'], TOTAL_PRODUCTS, 'total field')
    health = ctx.client.get('/api/health').json()
    eq(health['products'], TOTAL_PRODUCTS, '/api/health products')
    boot = ctx.client.get('/api/bootstrap').json()
    curated = boot['catalog']['products']
    database = boot['products']['products']
    d['curated'], d['database'] = len(curated), len(database)
    eq(len(curated), CURATED, 'curated catalog products')
    eq(len(curated) + len(database), TOTAL_PRODUCTS, 'bootstrap curated + database products')


@case('products', 'P02', 'order: 40 curated first in catalog order, stable positions, unique ids')
def p02(ctx, d):
    items = ctx.all_products
    ids = [p['id'] for p in items]
    eq(len(set(ids)), len(ids), 'unique product ids')
    catalog_ids = [p['id'] for p in ctx.client.get('/api/bootstrap').json()['catalog']['products']]
    eq(ids[:CURATED], catalog_ids, 'curated block order')
    ok(all(p.get('cur') is True for p in items[:CURATED]), 'first 40 carry cur=true')
    ok(not any(p.get('cur') for p in items[CURATED:]), 'database products do not carry cur')
    again = [p['id'] for p in ctx.client.get('/api/products').json()['items']]
    eq(again, ids, 'second call order')
    d['first'], d['last'] = ids[0], ids[-1]


@case('products', 'P03', 'detail by id equals the list row (curated + database samples, encoded ids)')
def p03(ctx, d):
    items = ctx.all_products
    sample = items[:10] + items[CURATED::max(1, (TOTAL_PRODUCTS - CURATED) // 10)][:10]
    for p in sample:
        response = ctx.client.get('/api/products/' + urllib.parse.quote(p['id'], safe=''))
        eq(response.status_code, 200, f'detail status for {p["id"]}')
        eq(response.json(), p, f'detail payload for {p["id"]}')
    d['checked'] = [p['id'] for p in sample]
    eq(len(set(d['checked'])), 20, 'distinct samples')


@case('products', 'P04', 'search q matches model, lower-case model and Korean category text')
def p04(ctx, d):
    for q, must in (('QM55C', 'qm55c'), ('qm55c', 'qm55c'), ('사이니지', None)):
        found = ctx.client.get('/api/products', params={'q': q}).json()['items']
        d[q] = len(found)
        ok(found, f'q={q!r} found nothing')
        ok(len(found) < TOTAL_PRODUCTS, f'q={q!r} returned the whole catalog')
        for p in found:
            ok(q.lower() in json.dumps(p, ensure_ascii=False).lower(), f'q={q!r} returned non-matching {p["id"]}')
        if must:
            ok(any(p['id'] == must for p in found), f'q={q!r} misses {must}')
    expected = [p['id'] for p in ctx.all_products if 'qm55c' in json.dumps(p, ensure_ascii=False).lower()]
    eq([p['id'] for p in ctx.client.get('/api/products', params={'q': 'QM55C'}).json()['items']], expected, 'search keeps catalog order')


@case('products', 'P05', 'limit/offset windows tile the full list without gaps or duplicates')
def p05(ctx, d):
    ids = [p['id'] for p in ctx.all_products]
    pages, offset, limit = [], 0, 97
    while offset < TOTAL_PRODUCTS:
        chunk = ctx.client.get('/api/products', params={'offset': offset, 'limit': limit}).json()['items']
        ok(len(chunk) == min(limit, TOTAL_PRODUCTS - offset), f'page at {offset} has {len(chunk)} items')
        pages.extend(p['id'] for p in chunk)
        offset += limit
    eq(pages, ids, 'concatenated pages')
    eq(ctx.client.get('/api/products', params={'offset': TOTAL_PRODUCTS, 'limit': 5}).json()['items'], [], 'offset past the end')
    q_all = [p['id'] for p in ctx.client.get('/api/products', params={'q': 'QM'}).json()['items']]
    q_pages = [p['id'] for i in range(0, len(q_all), 3) for p in ctx.client.get('/api/products', params={'q': 'QM', 'offset': i, 'limit': 3}).json()['items']]
    eq(q_pages, q_all, 'search pages tile the search result')
    d['pages'], d['searchItems'] = (TOTAL_PRODUCTS + limit - 1) // limit, len(q_all)


@case('products', 'P06', 'search total reports the filtered count, not the catalog size')
def p06(ctx, d):
    body = ctx.client.get('/api/products', params={'q': 'QM55C', 'limit': 2}).json()
    full = ctx.client.get('/api/products', params={'q': 'QM55C'}).json()['items']
    d['total'], d['matched'] = body.get('total'), len(full)
    eq(body.get('total'), len(full), 'total for a filtered, paginated query')


@case('products', 'P07', 'offset without limit is honoured')
def p07(ctx, d):
    tail = ctx.client.get('/api/products', params={'offset': TOTAL_PRODUCTS - 8}).json()['items']
    d['returned'] = len(tail)
    eq([p['id'] for p in tail], [p['id'] for p in ctx.all_products[-8:]], 'offset-only window')


@case('products', 'P08', 'guards: invalid paging is 422, unknown ids/packs are 404, traversal is not 500')
def p08(ctx, d):
    statuses = {}
    for params in ({'limit': 0}, {'limit': TOTAL_PRODUCTS + 1}, {'offset': -1}, {'limit': 'ten'}, {'offset': 'x'}):
        r = ctx.client.get('/api/products', params=params)
        statuses[json.dumps(params)] = r.status_code
        eq(r.status_code, 422, f'paging guard {params}')
    for path, code in (('/api/products/not-a-product', 404), ('/api/products/' + urllib.parse.quote('../../etc/passwd', safe=''), 404),
                       ('/api/products/' + urllib.parse.quote("qm55c' OR '1'='1", safe=''), 404), ('/api/product-packs/9999', 404),
                       ('/api/product-packs/abc', 422)):
        r = ctx.client.get(path)
        statuses[path] = r.status_code
        eq(r.status_code, code, f'status for {path}')
        ok(r.headers.get('content-type', '').startswith('application/json'), f'{path} answers JSON')
    ok(ctx.client.get('/api/products/not-a-product').json().get('detail'), '404 carries a readable detail')
    d['statuses'] = statuses


@case('products', 'P09', 'LIKE wildcards in q are literal characters')
def p09(ctx, d):
    for q in ('%', '_'):
        found = ctx.client.get('/api/products', params={'q': q}).json()['items']
        literal = [p['id'] for p in ctx.all_products if q in p['name'] or q in (p.get('model') or '') or q in json.dumps(p, ensure_ascii=False)]
        d[q] = {'returned': len(found), 'literal': len(literal)}
        eq([p['id'] for p in found], literal, f'q={q!r} must match only products containing it literally')


@case('products', 'P10', 'identity/spec fields are well-typed for every product')
def p10(ctx, d):
    bad = []
    for p in ctx.all_products:
        if not isinstance(p.get('id'), str) or not p['id'].strip() or p['id'] != p['id'].strip():
            bad.append((p.get('id'), 'id'))
        if not isinstance(p.get('name'), str) or not p['name'].strip():
            bad.append((p.get('id'), 'name'))
        if not isinstance(p.get('model', ''), str):
            bad.append((p['id'], 'model'))
        if not isinstance(p.get('cat', ''), str) or not str(p.get('cat', '')).strip():
            bad.append((p['id'], 'cat'))
        if p.get('url') and not str(p['url']).startswith('https://'):
            bad.append((p['id'], 'url'))
        for key in ('ind', 'kw', 'spaces', 'models'):
            if key in p and not isinstance(p[key], list):
                bad.append((p['id'], key))
    d['checked'], d['bad'] = len(ctx.all_products), bad[:20]
    eq(bad, [], 'malformed product fields')
    models = [p['model'] for p in ctx.all_products if p.get('model')]
    d['withModel'] = len(models)
    ok(len(models) >= TOTAL_PRODUCTS * 0.9, 'model codes present on at least 90% of products')


@case('products', 'P11', 'thumbnail and gallery pack references resolve to images (10 distinct packs)')
def p11(ctx, d):
    refs, seen = [], set()
    for p in ctx.all_products:
        for ref in [p.get('th')] + list(p.get('gal') or []):
            if isinstance(ref, str) and '#' in ref and ref.endswith(tuple('0123456789')):
                url = pack_ref(ref)[0]
                if url not in seen:
                    seen.add(url)
                    refs.append((p['id'], ref))
        if len(refs) >= 10:
            break
    eq(len(refs), 10, 'distinct image packs found')
    cache, checked = {}, []
    for pid, ref in refs:
        url, k = pack_ref(ref)
        if url not in cache:
            r = ctx.client.get('/' + url)
            eq(r.status_code, 200, f'pack {url}')
            cache[url] = r.json().get('images') or []
        images = cache[url]
        ok(k < len(images), f'{pid}: {ref} index beyond pack size {len(images)}')
        ok(str(images[k]).startswith('data:image/'), f'{pid}: {ref} is not an image data URL')
        checked.append(ref)
    d['refs'] = checked


@case('products', 'P12', 'ten products resolve their references across the four published detail packs')
def p12(ctx, d):
    picks=[p for p in ctx.all_products if isinstance(p.get('d'),int)][:10]
    eq(len(picks),10,'ten distinct products with details')
    seen={p['d']for p in picks}
    missing = []
    for p in picks:
        r = ctx.client.get(f'/api/product-packs/{p["d"]}')
        eq(r.status_code, 200, f'pack {p["d"]}')
        items = r.json()['items']
        if p['id'] not in items:
            missing.append((p['id'], p['d']))
    d['packs'] = sorted(seen)
    eq(missing, [], 'products absent from their own detail pack')


# ================================================================ group 6 · jobs
def jobs_api():
    from app.api.poc import jobs as jobs_module
    return jobs_module


def manager(**kw):
    return jobs_api().JobManager(**kw)


def seqs(job) -> list:
    return [e['seq'] for e in job.events_since(0)[0]]


def states(job) -> list:
    return [e['status'] for e in job.events_since(0)[0] if e['type'] == 'state']


@case('jobs', 'J01', 'queue: one worker runs jobs strictly one after another')
def j01(ctx, d):
    m = manager(workers=1)
    gate, calls = threading.Event(), []
    a = m.submit('rfp', 'A', {}, lambda j: (calls.append('A'), gate.wait(5), {'n': 'A'})[2])
    wait_until(lambda: a.status == 'running', what='A running')
    b = m.submit('rfp', 'B', {}, lambda j: (calls.append('B'), {'n': 'B'})[1])
    time.sleep(0.15)
    eq(b.status, 'queued', 'B waits for the only worker')
    eq(calls, ['A'], 'B not started while A runs')
    gate.set()
    wait_until(lambda: b.status == 'done', what='B done')
    eq(calls, ['A', 'B'], 'execution order')
    ok(b.started >= a.finished, 'B started after A finished')
    eq(states(b), ['queued', 'running', 'done'], 'B state events')
    eq(b.result, {'n': 'B'}, 'B result')
    d['states'] = states(b)


@case('jobs', 'J02', 'cancel while queued: function never runs, job ends cancelled')
def j02(ctx, d):
    m = manager(workers=1)
    gate, calls = threading.Event(), []
    a = m.submit('rfp', 'A', {}, lambda j: (gate.wait(5), {'ok': 1})[1])
    wait_until(lambda: a.status == 'running', what='A running')
    b = m.submit('rfp', 'B', {}, lambda j: calls.append('B') or {'ok': 2})
    m.cancel(b.id)
    gate.set()
    wait_until(lambda: b.status == 'cancelled', what='B cancelled')
    eq(calls, [], 'cancelled queued job function calls')
    eq(b.error['code'], 'cancelled', 'error code')
    eq(b.result, None, 'no result')
    eq(b.snapshot()['result'], None, 'snapshot result')
    d['error'] = b.error


@case('jobs', 'J03', 'cancel while running is cooperative and leaves a warning event')
def j03(ctx, d):
    m = manager(workers=1)
    steps = []

    def fn(job):
        for i in range(500):
            steps.append(i)
            job.check_cancel()
            time.sleep(0.01)
        return {'finished': True}
    job = m.submit('rfp', 'loop', {}, fn)
    wait_until(lambda: len(steps) > 3, what='loop started')
    m.cancel(job.id)
    wait_until(lambda: job.status == 'cancelled', what='cancelled')
    ok(len(steps) < 500, 'loop stopped early')
    texts = [e for e in job.events_since(0)[0] if e['type'] == 'text']
    ok(any(e.get('level') == 'warn' for e in texts), 'cancel request logged as warning')
    eq(job.result, None, 'no result after cancel')
    d['steps'] = len(steps)


@case('jobs', 'J04', 'waiting → validated resume → duplicate answer conflict → done')
def j04(ctx, d):
    J = jobs_api()
    m = manager(workers=2)
    gate = threading.Event()
    job = m.submit('layout', 'w', {}, lambda j: J.Waiting({'questions': [{'id': 'q1'}]}, {'partial': True}))
    wait_until(lambda: job.status == 'waiting', what='waiting')
    eq(job.snapshot()['waiting'], {'questions': [{'id': 'q1'}]}, 'waiting payload')
    eq(job.snapshot()['partial'], {'partial': True}, 'partial payload')

    def reject(j):
        raise J.BadRequest('bad answer', 'invalid_answer')
    try:
        m.resume(job.id, lambda j: {'never': True}, before=reject)
        raise CheckFailed('validation error was swallowed')
    except J.BadRequest:
        pass
    eq(job.status, 'waiting', 'still waiting after rejected answer')
    ok(not job.busy, 'not busy after rejected answer')
    m.resume(job.id, lambda j: (gate.wait(5), {'answered': 1})[1])
    try:
        m.resume(job.id, lambda j: {'answered': 2})
        raise CheckFailed('duplicate answer accepted')
    except J.Conflict:
        pass
    gate.set()
    wait_until(lambda: job.status == 'done', what='done')
    eq(job.result, {'answered': 1}, 'first answer wins')
    try:
        m.resume(job.id, lambda j: {'answered': 3})
        raise CheckFailed('answer accepted on a done job')
    except J.Conflict:
        pass
    d['states'] = states(job)


@case('jobs', 'J05', 'cancel a waiting job: immediate, clears waiting, later answers conflict')
def j05(ctx, d):
    J = jobs_api()
    m = manager()
    job = m.submit('layout', 'w', {}, lambda j: J.Waiting({'questions': []}, {'p': 1}))
    wait_until(lambda: job.status == 'waiting', what='waiting')
    m.cancel(job.id)
    eq(job.status, 'cancelled', 'status right after cancel')
    eq(job.waiting, None, 'waiting cleared')
    snap = job.snapshot()
    eq((snap['waiting'], snap['partial'], snap['result']), (None, None, None), 'snapshot payloads')
    try:
        m.resume(job.id, lambda j: {})
        raise CheckFailed('answer accepted after cancel')
    except J.Conflict:
        pass
    eq(states(job)[-1], 'cancelled', 'last state event')


@case('jobs', 'J06', 'event cursor: since filter, next_seq, bounded buffer truncation')
def j06(ctx, d):
    m = manager(max_events=5)

    def fn(job):
        for i in range(20):
            job.log(f'line {i}')
        return {'lines': 20}
    job = m.submit('rfp', 'log', {}, fn)
    wait_until(lambda: job.status == 'done' and job.last_seq >= 24, what='done')
    full = job.snapshot(0)
    eq(full['next_seq'], job.last_seq, 'next_seq')
    eq([e['seq'] for e in full['events']], list(range(job.last_seq - 4, job.last_seq + 1)), 'retained window')
    eq(full['first_seq'], job.last_seq - 4, 'first retained seq')
    ok(full['truncated'] is True, 'client at 0 is told it fell behind')
    tail = job.snapshot(job.last_seq - 2)
    eq([e['seq'] for e in tail['events']], [job.last_seq - 1, job.last_seq], 'since filter')
    ok(tail['truncated'] is False, 'caught-up client is not truncated')
    eq(job.snapshot(job.last_seq)['events'], [], 'nothing after the last seq')
    eq(full['events'][-1]['type'], 'result', 'result is the final event')
    d['last_seq'] = job.last_seq


@case('jobs', 'J07', 'waiting longer than the TTL is closed as expired on housekeeping')
def j07(ctx, d):
    J = jobs_api()
    m = manager(waiting_ttl=0.05)
    job = m.submit('layout', 'w', {}, lambda j: J.Waiting({'questions': []}))
    wait_until(lambda: job.status == 'waiting', what='waiting')
    time.sleep(0.12)
    m.submit('rfp', 'trigger', {}, lambda j: {'ok': True})
    eq(job.status, 'cancelled', 'expired job status')
    eq(job.error['code'], 'expired', 'expired code')
    try:
        m.resume(job.id, lambda j: {})
        raise CheckFailed('expired job resumed')
    except J.Conflict:
        pass


@case('jobs', 'J08', 'failures become error state with stable code and redacted message')
def j08(ctx, d):
    from app.api.poc.provider import ProviderError
    def raising(exc):
        def fn(job):
            raise exc
        return fn
    m = manager()
    a = m.submit('rfp', 'provider', {}, raising(ProviderError('upstream_unavailable', f'HTTP 503 key={FAKE_KEY} {FAKE_KEY}')))
    b = m.submit('rfp', 'value', {}, raising(ValueError('boom')))
    wait_until(lambda: a.terminal and b.terminal, what='both terminal')
    eq((a.status, a.error['code']), ('error', 'upstream_unavailable'), 'provider error')
    eq((b.status, b.error['code']), ('error', 'ValueError'), 'generic error')
    blob = json.dumps(a.snapshot(0), ensure_ascii=False)
    ok(FAKE_KEY not in blob, 'credential leaked into the snapshot')
    eq(a.result, None, 'no result on error')
    d['errors'] = [a.error, b.error]


@case('jobs', 'J09', 'retention evicts the oldest terminal jobs and never a waiting one')
def j09(ctx, d):
    J = jobs_api()
    m = manager(max_jobs=2)
    waiting = m.submit('layout', 'w', {}, lambda j: J.Waiting({'questions': []}))
    wait_until(lambda: waiting.status == 'waiting', what='waiting')
    done = []
    for i in range(3):
        job = m.submit('rfp', f'd{i}', {}, lambda j: {'ok': True})
        wait_until(lambda: job.status == 'done', what=f'd{i} done')
        done.append(job)
        time.sleep(0.01)
    trigger=m.submit('rfp', 'trigger', {}, lambda j: {'ok': True})
    wait_until(lambda:trigger.status=='done',what='trigger completion')
    m.get(waiting.id)
    for old in done:
        try:
            m.get(old.id)
            raise CheckFailed(f'oldest terminal job {old.title} kept beyond max_jobs')
        except J.NotFound:
            pass
    m.get(trigger.id)
    ids = [j['id'] for j in m.recent(10)]
    ok(waiting.id in ids, 'waiting job listed')
    ok(len(ids)<=2,'hard job admission limit respected')
    d['retained'] = len(ids)


@case('jobs', 'J10', 'HTTP error contract: malformed bodies 422, unknown jobs 404 everywhere')
def j10(ctx, d):
    c = ctx.client
    codes = {}
    r = c.post('/api/jobs', json=['not', 'an', 'object'])
    codes['non-object'] = r.status_code
    eq(r.status_code, 422, 'non-object body')
    ok(r.json().get('code'), 'non-object body carries a code')
    r = c.post('/api/jobs', json={'kind': 'no-such-kind'})
    codes['unknown-kind'] = r.status_code
    eq(r.status_code, 422, 'unknown kind')
    for method, path in (('get', '/api/jobs/doesnotexist'), ('post', '/api/jobs/doesnotexist/cancel'), ('post', '/api/jobs/doesnotexist/answer'),
                         ('get', '/api/jobs/doesnotexist/events')):
        r = c.post(path, json={'answers': {}}) if method == 'post' else c.get(path)
        codes[path] = r.status_code
        eq(r.status_code, 404, f'{method.upper()} {path}')
        eq(r.json().get('code'), 'not_found', f'{path} code')
    for n in (0, 101):
        eq(c.get('/api/jobs', params={'n': n}).status_code, 422, f'n={n}')
    eq(c.get('/api/jobs/doesnotexist', params={'since': -1}).status_code, 422, 'negative since')
    d['codes'] = codes


@case('jobs', 'J11', 'HTTP cursor, SSE resume, answer conflict and terminal cancel on a server-owned job')
def j11(ctx, d):
    from app.api.poc import service
    jobs = getattr(service, 'JOBS', None)
    ok(jobs is not None, 'unsupported: service.JOBS job manager is not exposed')

    def fn(job):
        for i in range(3):
            job.log(f'step {i}')
        return {'steps': 3}
    job = jobs.submit('rfp', 'strict-http', {'probe': True}, fn)
    wait_until(lambda: job.status == 'done', what='done')
    c = ctx.client
    snap = c.get(f'/api/jobs/{job.id}').json()
    eq(snap['status'], 'done', 'polled status')
    eq(snap['result'], {'steps': 3}, 'polled result')
    since = snap['events'][2]['seq']
    later = c.get(f'/api/jobs/{job.id}', params={'since': since}).json()
    ok(all(e['seq'] > since for e in later['events']), 'since filter over HTTP')
    eq(later['next_seq'], snap['next_seq'], 'next_seq over HTTP')
    frames = []
    with c.stream('GET', f'/api/jobs/{job.id}/events', headers={'Last-Event-ID': str(since)}) as response:
        eq(response.status_code, 200, 'SSE status')
        ok(response.headers['content-type'].startswith('text/event-stream'), 'SSE content type')
        current = {}
        for line in response.iter_lines():
            if line.startswith('id: '):
                if 'data' in current:
                    frames.append(current)
                    current = {}
                current['id'] = int(line[4:])
            elif line.startswith('event: '):
                current['event'] = line[7:]
            elif line.startswith('data: '):
                current['data'] = json.loads(line[6:])
            elif line == '' and current:
                frames.append(current)
                current = {}
        if current:
            frames.append(current)
        frames = [f for f in frames if 'id' in f]
    ids = [f['id'] for f in frames]
    ok(ids and ids[0] == since + 1, f'SSE resumes after Last-Event-ID (got {ids[:3]})')
    eq(ids, sorted(set(ids)), 'SSE ids strictly increasing')
    eq(frames[-1]['event'], 'result', 'SSE ends with the result')
    eq(frames[-1]['data']['result'], {'steps': 3}, 'SSE result payload')
    r = c.post(f'/api/jobs/{job.id}/answer', json={'answers': {}})
    eq(r.status_code, 409, 'answer to a non-interactive job')
    r = c.post(f'/api/jobs/{job.id}/cancel')
    eq(r.status_code, 200, 'cancel on a done job')
    eq(r.json()['status'], 'done', 'cancel does not rewrite a terminal job')
    listed = c.get('/api/jobs').json()['jobs']
    mine = next((x for x in listed if x['id'] == job.id), None)
    ok(mine is not None, 'job listed in /api/jobs')
    ok('params' not in mine and 'result' not in mine, 'job list is brief')
    d['sse_ids'] = ids


class FailingProvider:
    """Error-contract only: every call fails like an upstream 503. Never used to model success."""
    name, model, available = 'strict-failing', 'strict-failing-model', True

    def model_for(self, tier):
        return self.model

    def _fail(self, **kw):
        from app.api.poc.provider import ProviderError
        raise ProviderError('upstream_unavailable', 'HTTP 503: service unavailable')

    generate_json = generate_text = _fail

    def stream_text(self, **kw):
        self._fail()
        yield ''

    def chat_model(self, temperature=0.2):
        return None


def reset_provider():
    from app.api.poc import provider as prov
    from app.api.poc import settings as cfg
    scrub_provider_env()
    if hasattr(prov, 'set_provider_override'):
        prov.set_provider_override(clear=True)
    cfg.reload_settings()


@case('jobs', 'J12', 'failing provider never yields a success payload from /api/llm (error contract)')
def j12(ctx, d):
    from app.api.poc import provider as prov
    ok(hasattr(prov, 'set_provider_override'), 'unsupported: provider.set_provider_override test hook is missing')
    reset_provider()
    prov.set_provider_override(FailingProvider())
    try:
        out = {}
        for kind in ('json', 'text'):
            r = ctx.client.post('/api/llm', json={'feature':'llm','kind': kind, 'prompt': 'strict contract'})
            body = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
            out[kind] = {'status': r.status_code, 'keys': sorted(body)}
            ok('data' not in body and 'text' not in body, f'{kind}: success payload returned by a failing provider')
            eq(r.status_code,503,f'{kind}: provider unavailable must return503')
            eq(body.get('code'),'upstream_unavailable',f'{kind}: correct provider error')
        r = ctx.client.post('/api/llm', json={'feature':'llm','kind': 'json', 'prompt': 'strict contract', 'stream': True})
        frames = [json.loads(line[6:]) for line in r.text.splitlines() if line.startswith('data: ')]
        out['stream'] = {'status': r.status_code, 'types': [f.get('type') for f in frames]}
        ok(not any(f.get('type') == 'result' for f in frames), 'stream produced a result frame from a failing provider')
        ok(r.status_code >= 400 or any(f.get('type') == 'error' for f in frames) or 'error' in r.text, 'stream failure not signalled')
        d.update(out)
    finally:
        reset_provider()


@case('jobs', 'J13', 'missing key: model endpoints answer a clear 503, never a rule/dummy success')
def j13(ctx, d):
    reset_provider()
    r = ctx.client.post('/api/llm', json={'feature':'llm','kind': 'json', 'prompt': 'strict contract'})
    body = r.json()
    d['llm'] = {'status': r.status_code, 'body': body}
    ok('data' not in body and 'text' not in body, 'payload returned without a key')
    eq(r.status_code, 503, '/api/llm without a key')
    ok(body.get('code') or body.get('error'), '503 carries a machine-readable code')
    ok(FAKE_KEY not in r.text, 'no credential echo')
    before = {j['id'] for j in ctx.client.get('/api/jobs').json()['jobs']}
    r = ctx.client.post('/api/jobs', json={'kind': 'rfp', 'text': '전국 매장 메뉴보드 교체 요구사항입니다. ' * 4})
    d['rfp'] = {'status': r.status_code}
    if r.status_code in (200, 202) and isinstance(r.json(), dict) and r.json().get('id'):
        ctx.client.post(f'/api/jobs/{r.json()["id"]}/cancel')
    eq(r.status_code, 503, 'RFP job without a key')
    after = {j['id'] for j in ctx.client.get('/api/jobs').json()['jobs']}
    eq(after - before, set(), 'no job created without a key')


@case('jobs', 'J14', 'offline switch is rejected instead of running a substitute path')
def j14(ctx, d):
    reset_provider()
    before = {j['id'] for j in ctx.client.get('/api/jobs').json()['jobs']}
    r = ctx.client.post('/api/jobs', json={'kind': 'rfp', 'text': '객실 300실 TV 교체와 로비 사이니지 신설 요청입니다. ' * 4, 'offline': True})
    d['status'] = r.status_code
    if r.status_code in (200, 202) and isinstance(r.json(), dict) and r.json().get('id'):
        ctx.client.post(f'/api/jobs/{r.json()["id"]}/cancel')
    ok(400 <= r.status_code < 500, f'offline=true must be rejected with 4xx, got {r.status_code}')
    after = {j['id'] for j in ctx.client.get('/api/jobs').json()['jobs']}
    eq(after - before, set(), 'no job created for a rejected switch')


# ---------------------------------------------------------------- main
def main(argv: list[str]) -> int:
    groups = argv or ['products', 'jobs']
    unknown = [g for g in groups if g not in CASES]
    if unknown:
        print('unknown group(s): ' + ', '.join(unknown) + ' — available: ' + ', '.join(CASES))
        return 2
    socket.socket.connect = _no_network          # type: ignore[assignment]
    socket.create_connection = _no_network       # type: ignore[assignment]
    reports = []
    try:
        with Context() as ctx:
            for group in groups:
                reports.append(run_group(group, ctx))
    finally:
        socket.socket.connect = _REAL_CONNECT     # type: ignore[assignment]
        socket.create_connection = _REAL_CREATE   # type: ignore[assignment]
        try:
            reset_provider()
        except Exception:  # restoring the provider hook must not hide the report
            pass
    for r in reports:
        c = r['counts']
        print(f"{r['group']}: {c['passed']}/{c['total']} passed (minimum {c['minimum']})")
    return 0 if all(r['meetsMinimum'] for r in reports) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
