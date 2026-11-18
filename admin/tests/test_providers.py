"""Provider tab: registry, probes, endpoint edits and experiments.

Everything runs against a small in-process HTTP server that stands in for an in-house serving endpoint (OpenAI-style
``/v1/models`` · ``/v1/chat/completions`` and the System One ``/health`` · ``/v1/systemone``). No external API is called:
the external hosts (OpenRouter · Gemini · TypeSafe) answer from :class:`External`, which records every request.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import asyncio
import io
import json
import os
import threading
import time
from types import SimpleNamespace
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
import pytest

from admin import server
from admin.operations import Operations
from admin.providers import Providers, ProviderInputError, clean_endpoint, same_endpoint
from admin.store import Store
from app.api.auth import Auth, AuthConfig
from app.api.poc import settings as cfg

SECRET = 'sk-internal-secret-value-123456'


class Serving:
    """A fake self-hosted model server. ``models`` / ``fail`` / ``delay`` change its behaviour per test."""

    def __init__(self):
        self.models = ['in-house-32b']
        self.name = 'clef-flash'
        self.fail = 0
        self.delay = 0.0
        self.has_models = True
        self.invalid_answers = False
        self.requests = []
        self.closed = False
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def reply(self, status, value):
                raw = json.dumps(value).encode()
                self.send_response(status)
                self.send_header('content-type', 'application/json')
                self.send_header('content-length', str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_GET(self):
                outer.requests.append(('GET', self.path, self.headers.get('authorization')))
                if outer.fail:
                    return self.reply(outer.fail, {'error': {'message': 'broken'}})
                if self.path == '/v1/models' and outer.has_models:
                    return self.reply(200, {'data': [{'id': m} for m in outer.models]})
                if self.path == '/health':
                    return self.reply(200, {'status': 'ok', 'model': outer.name})
                self.reply(404, {'error': {'message': 'not found'}})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}')
                outer.requests.append(('POST', self.path, self.headers.get('authorization'), body))
                time.sleep(outer.delay)
                if outer.fail:
                    return self.reply(outer.fail, {'error': {'message': 'broken'}})
                if self.path == '/v1/chat/completions':
                    text = '{"answer": "ok"}' if body.get('response_format') else f"echo:{body['model']}"
                    return self.reply(200, {'choices': [{'message': {'content': text}, 'finish_reason': 'stop'}],
                                            'usage': {'prompt_tokens': 11, 'completion_tokens': 7, 'total_tokens': 18}})
                if self.path == '/v1/systemone':
                    answers = {}
                    for qid, q in body['questions'].items():
                        if q['type'] == 'noul':
                            answers[qid] = {'type': 'noul', 'noul': 0.9, 'confidence': 0.9}
                        elif q['type'] == 'choice':
                            first = next(iter(q['criteria']))
                            answers[qid] = {'type': 'choice', 'choice': first, 'confidence': 0.8, 'probabilities': {k: (0.8 if k == first else 0.1) for k in q['criteria']}}
                        else:
                            answers[qid] = {'type': 'score', 'score': 2.0, 'confidence': 0.7, 'probabilities': {'2': 1.0}}
                    return self.reply(200, {'model': body['model'], 'answers': {} if outer.invalid_answers else answers, 'usage': {'input_tokens': 42, 'output_tokens': 0}})
                self.reply(404, {'error': {'message': 'not found'}})

        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.port = self.httpd.server_address[1]
        self.base = f'http://127.0.0.1:{self.port}/v1'
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        if not self.closed:
            self.closed = True
            self.httpd.shutdown()
            self.httpd.server_close()


@pytest.fixture
def serving():
    s = Serving()
    yield s
    s.close()


@pytest.fixture
def second():
    s = Serving()
    yield s
    s.close()


@pytest.fixture
def env(tmp_path, monkeypatch, serving):
    """Model settings from the process environment only: OpenRouter active, Gemini + in-house + Clef connected."""
    for key in list(os.environ):
        if key.startswith(('WINMATE_LLM', 'WINMATE_GEMINI', 'OPENROUTER_', 'INTERNAL_LLM_', 'GEMINI_', 'TYPESAFE_', 'WINMATE_DECISION', 'CLEF_', 'WINMATE_PROVIDER')):
            monkeypatch.delenv(key)
    monkeypatch.setattr(cfg, '_SETTINGS', None)
    values = {'WINMATE_ENV_FILES': 'none', 'WINMATE_LLM_QUEUE_DB': str(tmp_path / 'queue.sqlite'), 'WINMATE_LLM_PROVIDER': 'openrouter',
              'OPENROUTER_API_KEY': 'sk-or-external-secret-000000', 'GEMINI_API_KEY': 'AIzaExternalSecret0000000000000', 'GEMINI_MODEL': 'gemma-test',
              'INTERNAL_LLM_API_KEY': SECRET, 'INTERNAL_LLM_BASE_URL': serving.base, 'INTERNAL_LLM_MODEL': 'in-house-32b',
              'TYPESAFE_API_KEY': 'apikey-external-secret-000000', 'CLEF_HOST': '127.0.0.1', 'CLEF_PORT': str(serving.port)}
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    cfg.set_overrides({})
    yield monkeypatch
    cfg.set_overrides({})


class External:
    """stands in for the external APIs (loopback goes to the real opener): token-free endpoints only, every request kept"""

    def __init__(self):
        self.requests, self.credits = [], 25.0

    def __call__(self, request, timeout=None):
        url = urlsplit(request.full_url)
        if url.hostname in ('127.0.0.1', 'localhost', '::1') or url.hostname.startswith('192.168.'):
            return urllib.request.urlopen(request, timeout=timeout)
        headers = {k.lower(): v for k, v in request.header_items()}
        self.requests.append((request.get_method(), url.hostname, url.path, headers.get('authorization') or headers.get('x-goog-api-key')))
        routes = {('openrouter.ai', '/api/v1/credits'): {'data': {'total_credits': 25.0, 'total_usage': 25.0 - self.credits}},
                  ('openrouter.ai', '/api/v1/models/qwen/qwen3.6-35b-a3b/endpoints'): {'data': {'endpoints': []}},
                  ('api.typesafe.ai', '/v1/models'): {'models': [{'name': 'jev-latest'}, {'name': 'jev-preview'}]}}
        hit = routes.get((url.hostname, url.path))
        if hit is None and url.hostname == 'generativelanguage.googleapis.com' and url.path.startswith('/v1beta/models/'):
            hit = {'name': url.path.rsplit('/', 1)[1]}
        if hit is None or request.get_method() != 'GET':
            raise urllib.error.HTTPError(request.full_url, 404, 'not found', {}, io.BytesIO(b'{}'))
        return io.BytesIO(json.dumps(hit).encode())


@pytest.fixture
def external():
    return External()


@pytest.fixture
def providers(tmp_path, env, external):
    root = tmp_path / 'checkout'
    (root / 'clef-flash').mkdir(parents=True)
    (root / 'clef-flash' / 'serve.sh').write_text('#!/bin/sh\n')
    (root / 'clef-flash' / 'config.env').write_text('CLEF_NAME="clef-flash"    # 응답의 model 값\n')
    return Providers(Store(tmp_path / 'state'), Operations(tmp_path / 'ops'), opener=external, root=root)


def by_id(providers):
    return {e['id']: e for e in providers.entries()}


# ---------------------------------------------------------------- settings rules
def test_plain_http_is_only_for_the_private_network():
    for host in ('127.0.0.1', '10.2.3.4', '172.20.1.1', '192.168.0.9', 'gpu-node-01', 'llm.corp', 'serving.svc.cluster.local', '::1'):
        assert cfg.private_host(host), host
    for host in ('8.8.8.8', 'api.openai.com', 'localhost.evil.com', '1.2.3', ''):
        assert not cfg.private_host(host), host
    assert cfg.allowed_endpoint('http://10.0.0.1:8000/v1') and cfg.allowed_endpoint('https://api.example.com/v1')
    assert not cfg.allowed_endpoint('http://api.example.com/v1')
    assert not cfg.allowed_endpoint('http://user:pw@10.0.0.1/v1')
    private = cfg.load_settings({'WINMATE_ENV_FILES': 'none', 'WINMATE_LLM_PROVIDER': 'internal', 'INTERNAL_LLM_API_KEY': 'k' * 12,
                                 'INTERNAL_LLM_MODEL': 'm', 'INTERNAL_LLM_BASE_URL': 'http://10.20.30.40:8000/v1'})
    assert private.base_url == 'http://10.20.30.40:8000/v1' and not any('주소' in w for w in private.warnings)
    public = cfg.load_settings({'WINMATE_ENV_FILES': 'none', 'WINMATE_LLM_PROVIDER': 'internal', 'INTERNAL_LLM_API_KEY': 'k' * 12,
                                'INTERNAL_LLM_MODEL': 'm', 'INTERNAL_LLM_BASE_URL': 'http://llm.example.com/v1'})
    assert public.base_url == '' and any('https' in w for w in public.warnings)
    clef = cfg.load_settings({'WINMATE_ENV_FILES': 'none', 'TYPESAFE_API_KEY': 'local', 'TYPESAFE_BASE_URL': 'http://192.168.10.7:8790/v1', 'TYPESAFE_MODEL': 'clef-flash'})
    assert clef.decision_base_url == 'http://192.168.10.7:8790/v1'


def test_admin_override_layer_is_runtime_only(env):
    cfg.set_overrides({'INTERNAL_LLM_BASE_URL': 'http://10.9.9.9:8000/v1', 'NOT_A_SETTING': 'x'})
    assert cfg.overrides() == {'INTERNAL_LLM_BASE_URL': 'http://10.9.9.9:8000/v1'}
    assert cfg.load_settings(provider='internal').base_url == 'http://10.9.9.9:8000/v1'
    assert cfg.load_settings(os.environ, provider='internal').base_url != 'http://10.9.9.9:8000/v1'  # explicit environ: no admin layer


def test_endpoint_cleanup():
    assert clean_endpoint(' http://10.0.0.5:8000/v1/chat/completions ', 'llm') == 'http://10.0.0.5:8000/v1'
    assert clean_endpoint('http://127.0.0.1:8790/v1/systemone/', 'decision') == 'http://127.0.0.1:8790/v1'
    for bad in ('http://example.com/v1', 'ftp://10.0.0.1/v1', 'http://key@10.0.0.1/v1', 'http://10.0.0.1/v1?key=1', '', 'http://10.0.0.1/ v1'):
        with pytest.raises(ProviderInputError):
            clean_endpoint(bad, 'llm')
    assert same_endpoint('http://localhost:8790/v1', 'http://127.0.0.1:8790/v1/') and not same_endpoint('http://127.0.0.1:8790/v1', 'http://127.0.0.1:8791/v1')


# ---------------------------------------------------------------- registry
def test_registry_lists_every_connection_and_keeps_activation(providers, serving):
    items = by_id(providers)
    assert [i for i, e in items.items() if e['active']] == ['llm.openrouter', 'decision.main']
    assert items['llm.openrouter']['scope'] == 'external' and items['llm.openrouter']['checkable'] and items['llm.openrouter']['monitored']
    assert items['llm.gemini']['registered'] and not items['llm.gemini']['active'] and items['llm.gemini']['scope'] == 'external'
    internal = items['llm.internal']
    assert internal['registered'] and internal['scope'] == 'internal' and internal['checkable'] and internal['editable'] and not internal['monitored']
    assert items['llm.openai']['missing'] == ['WINMATE_LLM_API_KEY', 'WINMATE_LLM_BASE_URL', 'WINMATE_LLM_MODEL'] and not items['llm.openai']['registered']
    main, clef = items['decision.main'], items['decision.clef']
    assert main['name'] == 'TypeSafe Jev' and main['scope'] == 'external' and not main['editable'] and all(main['tasks'].values())
    assert clef['registered'] and not clef['active'] and clef['scope'] == 'internal' and clef['base_url'] == serving.base and clef['model'] == 'clef-flash'
    text = json.dumps(providers.view(), ensure_ascii=False)
    for secret in (SECRET, 'sk-or-external-secret-000000', 'AIzaExternalSecret0000000000000', 'apikey-external-secret-000000'):
        assert secret not in text


def test_clef_as_the_active_decision_model_is_one_entry(providers, env, serving):
    env.setenv('TYPESAFE_API_KEY', 'local')
    env.setenv('TYPESAFE_BASE_URL', f'http://localhost:{serving.port}/v1')
    env.setenv('TYPESAFE_MODEL', 'clef-flash')
    cfg.reload_settings()
    items = by_id(providers)
    assert 'decision.clef' not in items
    main = items['decision.main']
    assert main['name'] == 'Clef (로컬 서빙)' and main['active'] and main['monitored'] and main['editable']


def test_last_real_call_comes_from_usage_tracing(providers):
    with providers.operations.db() as db:
        for i, (status, age) in enumerate((('ok', 7200), ('error', 600), ('ok', 30))):
            db.execute("INSERT INTO spans(id,trace_id,username,kind,started,duration_ms,status,model) VALUES (?,?,?,?,?,?,?,?)",
                       (f's{i}', 't', 'admin', 'llm.usage', time.time() - age, 900 + i, status, 'qwen/qwen3.6-35b-a3b'))
    last = by_id(providers)['llm.openrouter']['last_call']
    assert last['status'] == 'ok' and last['ms'] == 902 and last['calls_24h'] == 3 and last['errors_24h'] == 1
    assert by_id(providers)['llm.gemini']['last_call'] is None


# ---------------------------------------------------------------- probes
def test_probe_states_and_history(providers, serving):
    ok = providers.check('llm.internal')
    assert ok['status'] == 'ok' and ok['models'] == ['in-house-32b'] and ok['ms'] >= 0
    assert serving.requests[-1] == ('GET', '/v1/models', 'Bearer ' + SECRET)
    serving.models = ['another-model']
    missing = providers.check('llm.internal')
    assert missing['status'] == 'degraded' and missing['models'] == ['another-model'] and missing['last_ok'] == ok['checked_at']
    serving.fail = 503
    down = providers.check('llm.internal')
    assert down['status'] == 'down' and down['http'] == 503 and [h['status'] for h in down['history']] == ['ok', 'degraded', 'down']
    assert by_id(providers)['llm.internal']['status']['status'] == 'down'
    events = providers.store.rows("SELECT * FROM events WHERE action='provider.status' ORDER BY id")
    assert [json.loads(e['detail'])['status'] for e in events] == ['ok', 'degraded', 'down']
    serving.fail = 401
    assert '인증' in providers.check('llm.internal')['detail']


def test_probe_without_a_model_list_uses_one_minimal_call(providers, serving):
    serving.has_models = False
    result = providers.check('llm.internal')
    assert result['status'] == 'ok' and '최소 호출' in result['detail']
    method, path, _, body = serving.requests[-1]
    assert (method, path) == ('POST', '/v1/chat/completions') and body['max_tokens'] == 1


def test_probe_reports_a_dead_server(providers, serving):
    serving.close()
    result = providers.check('llm.internal')
    assert result['status'] == 'down' and '연결' in result['detail']


def test_clef_probe_and_external_apis_cost_nothing(providers, serving, external):
    assert providers.check('decision.clef')['status'] == 'ok'
    assert serving.requests[-1][:2] == ('GET', '/health')
    serving.name = 'clef-pro'
    assert providers.check('decision.clef')['status'] == 'degraded'
    before = len(serving.requests)
    # external APIs: only free GETs — OpenRouter credits + the model's endpoints, Gemini model info, TypeSafe model list
    router = providers.check('llm.openrouter')
    assert router['status'] == 'ok' and router['credits'] == 25.0 and '남은 크레딧 $25.00' in router['detail']
    assert providers.check('llm.gemini')['status'] == 'ok'
    typesafe = providers.check('decision.main')   # jev-1.14.0 is a pinned version of the listed jev family
    assert typesafe['status'] == 'ok' and 'jev-latest' in typesafe['models']
    assert {m for m, *_ in external.requests} == {'GET'}, 'an external API is never asked for a generation'
    keys = {'openrouter.ai': 'Bearer sk-or-external-secret-000000', 'generativelanguage.googleapis.com': 'AIzaExternalSecret0000000000000',
            'api.typesafe.ai': 'Bearer apikey-external-secret-000000'}
    assert all(auth in (None, keys[host]) for _, host, _, auth in external.requests), 'each key goes only to its own host'
    external.credits = 0
    assert providers.check('llm.openrouter')['status'] == 'down'
    assert by_id(providers)['llm.openrouter']['status']['detail'].startswith('크레딧이 남지 않았습니다')
    with pytest.raises(ProviderInputError):
        providers.check('llm.openai')  # not connected
    with pytest.raises(ProviderInputError):
        providers.check('llm.nope')
    assert len(serving.requests) == before


def test_timer_checks_active_providers_every_half_hour_from_8_to_22(providers, env, serving, external, monkeypatch):
    import admin.providers as pv
    clock = [0.0]
    monkeypatch.setattr(pv, 'time', SimpleNamespace(time=lambda: clock[0]))
    day = datetime.now(ZoneInfo('Asia/Seoul')).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    at = lambda h, m=0: clock.__setitem__(0, (day + timedelta(hours=h, minutes=m)).timestamp())  # noqa: E731
    at(7, 59)
    assert providers.sweep() == [] and not external.requests        # before 08:00 nothing
    at(8, 0)
    assert providers.sweep() == ['llm.openrouter', 'decision.main']  # the active ones (external too), not inactive Gemini · Clef
    at(8, 20)
    assert providers.sweep() == []                                    # the 08:00 slot is done
    env.setenv('WINMATE_LLM_PROVIDER', 'internal')
    cfg.reload_settings()
    assert providers.sweep() == ['llm.internal']                      # just turned on: checked in the current slot
    at(8, 30)
    assert providers.sweep() == ['llm.internal', 'decision.main']
    at(22, 0)
    assert len(providers.sweep()) == 2                                # 22:00 is the last slot
    at(22, 31)
    assert providers.sweep() == []                                    # after it nothing until 08:00
    view = providers.view()
    assert view['schedule'] == {'from': '08:00', 'to': '22:00', 'every_min': 30, 'next': (day + timedelta(days=1, hours=8)).isoformat()}
    status = by_id(providers)['decision.main']['status']
    assert status['checked_at'] and [h['status'] for h in status['history']] == ['ok', 'ok', 'ok']


# ---------------------------------------------------------------- edit + re-connect
def test_edit_endpoint_reconnects_the_running_app(providers, env, serving, second):
    env.setenv('WINMATE_LLM_PROVIDER', 'internal')
    cfg.reload_settings()
    assert cfg.get_settings().base_url == serving.base
    second.models = ['in-house-64b']
    test = providers.check('llm.internal', second.base + '/chat/completions', 'in-house-64b')  # a test before saving
    assert test['status'] == 'ok' and cfg.get_settings().base_url == serving.base and not providers.saved()
    result = providers.connect('llm.internal', second.base, 'in-house-64b', actor='tester')
    assert result['check']['status'] == 'ok' and result['provider']['base_url'] == second.base
    assert result['provider']['env'] == {'base_url': serving.base, 'model': 'in-house-32b'}
    live = cfg.get_settings()
    assert (live.base_url, live.model, live.quick_model, live.api_key()) == (second.base, 'in-house-64b', 'in-house-64b', SECRET)
    # A second Providers on the same store (a restart) applies the saved edit again.
    cfg.set_overrides({})
    cfg.reload_settings()
    Providers(providers.store, root=providers.root).apply()
    assert cfg.get_settings().base_url == second.base
    event = providers.store.one("SELECT * FROM events WHERE action='provider.endpoint'")
    assert event['actor'] == 'tester' and SECRET not in event['detail']
    back = providers.reset('llm.internal')
    assert back['provider']['base_url'] == serving.base and back['provider']['edit'] is None and cfg.get_settings().model == 'in-house-32b'


def test_on_off_and_primary_without_restart(providers, env, serving):
    def state(role):
        items = [e for e in providers.entries(usage=False) if e['role'] == role and e['active']]
        return [e['id'] for e in sorted(items, key=lambda e: e['rank'])]
    # LLM: several on, the first is 대표; it is never left empty
    with pytest.raises(ProviderInputError):
        providers.deactivate('llm.openrouter')
    with pytest.raises(ProviderInputError):
        providers.activate('llm.openai')  # not connected
    result = providers.activate('llm.internal', 'tester')
    assert result['check']['status'] == 'ok' and result['provider']['rank'] == 1 and not result['provider']['primary']
    s = cfg.get_settings()
    assert state('llm') == ['llm.openrouter', 'llm.internal'] and s.provider == 'openrouter' and [n for n, *_ in s.llm_fallbacks] == ['internal']
    assert providers.store.one("SELECT actor FROM events WHERE action='provider.activate'")['actor'] == 'tester'
    providers.make_primary('llm.gemini')  # off → on and 대표 at once; the others stay on behind it
    assert state('llm') == ['llm.gemini', 'llm.openrouter', 'llm.internal'] and cfg.get_settings().provider == 'gemini'
    providers.deactivate('llm.gemini')  # 대표 off → the next one takes over
    assert state('llm') == ['llm.openrouter', 'llm.internal'] and cfg.get_settings().provider == 'openrouter'
    # Decision toggles replace the single service selection.
    providers.activate('decision.clef')
    s = cfg.get_settings()
    assert state('decision') == ['decision.clef'] and not s.decision_fallbacks
    assert 'tasks' in by_id(providers)['decision.clef'] and 'tasks' not in by_id(providers)['decision.main']
    providers.make_primary('decision.clef')
    s = cfg.get_settings()
    assert s.decision_base_url == serving.base and s.decision_model == 'clef-flash' and s.decision_key() == 'local'
    assert not s.decision_fallbacks and s.decision_slot('main')[2] == 'apikey-external-secret-000000'
    assert providers._decision_settings('decision.main').decision_base_url == 'https://api.typesafe.ai/v1'  # experiments still reach TypeSafe
    assert 'apikey-external-secret-000000' not in json.dumps(providers.view())
    providers.deactivate('decision.clef')
    providers.deactivate('decision.main')
    assert state('decision') == [] and not cfg.get_settings().decision_enabled('layout.pick')
    assert by_id(providers)['decision.main']['note'] == '판단형 작업도 LLM이 처리합니다.'
    # back to what .env picks → no switch stored
    providers.activate('decision.main')
    providers.deactivate('llm.internal')
    assert providers.store.setting('provider_active', {}) == {} and state('llm') == ['llm.openrouter'] and state('decision') == ['decision.main']
    # the choice survives a restart (start → apply), and the first stored shape still reads
    providers.make_primary('llm.gemini')
    cfg.set_overrides({})
    cfg.reload_settings()
    Providers(providers.store, root=providers.root).apply()
    assert cfg.get_settings().provider == 'gemini'
    providers.store.set_setting('provider_active', {'llm': 'internal', 'decision': 'off'})
    providers.apply()
    assert state('llm') == ['llm.internal'] and state('decision') == []


def test_app_falls_back_to_the_next_llm_and_decision_model(env, serving, second):
    """The running app's own clients: 대표 fails to answer → the next one on answers; a bad request is never re-sent."""
    from app.api.llm.decision import get_decision
    from app.api.poc.provider import get_provider
    env.setenv('WINMATE_LLM_PROVIDER', 'internal')
    env.setenv('INTERNAL_LLM_BASE_URL', second.base)
    env.setenv('WINMATE_LLM_FALLBACK', 'openai')
    for key, value in (('WINMATE_LLM_API_KEY', 'local-key-000000'), ('WINMATE_LLM_BASE_URL', serving.base), ('WINMATE_LLM_MODEL', 'in-house-32b')):
        env.setenv(key, value)
    env.setenv('TYPESAFE_BASE_URL', second.base)
    env.setenv('WINMATE_DECISION_ORDER', 'main,clef')
    env.setenv('WINMATE_CLEF_BASE_URL', serving.base)
    second.fail = 401
    settings = cfg.reload_settings()
    provider, _ = get_provider(settings)
    assert [p.name for p in provider.fallbacks] and provider.model == 'in-house-32b'
    text = provider.generate_text(stage='test:fallback', user='안녕하세요', max_attempts=1)
    assert text.text == 'echo:in-house-32b' and any(r[1] == '/v1/chat/completions' for r in second.requests)
    assert provider.generate_json(stage='test:fallback', user='json', max_attempts=1).data == {'answer': 'ok'}
    answered = get_decision(settings, 'layout.pick').ask(stage='test:fallback', state={'a': 1}, questions={'q': {'type': 'noul', 'instructions': 'x'}})
    assert answered.model == 'clef-flash' and answered.answers['q']['noul'] == 0.9
    second.fail = 400  # a bad request is the same everywhere: no second call
    before = len(serving.requests)
    with pytest.raises(Exception) as caught:
        provider.generate_text(stage='test:fallback', user='안녕하세요', max_attempts=1)
    assert getattr(caught.value, 'code', '') == 'bad_request' and len(serving.requests) == before


def test_edit_rules(providers, second):
    for pid in ('llm.openrouter', 'llm.gemini', 'decision.main'):
        with pytest.raises(ProviderInputError, match='.env'):
            providers.connect(pid, second.base, 'model-x')
    with pytest.raises(ProviderInputError):
        providers.connect('llm.internal', 'http://llm.example.com/v1', 'm')
    with pytest.raises(ProviderInputError):
        providers.connect('llm.internal', second.base, 'bad model id')
    with pytest.raises(ProviderInputError, match='외부 API'):
        providers.check('decision.clef', 'https://api.example.com/v1')
    moved = providers.connect('decision.clef', second.base, 'clef-flash')
    assert moved['check']['status'] == 'ok' and moved['provider']['base_url'] == second.base and second.requests[-1][1] == '/health'
    assert cfg.overrides() == {'WINMATE_CLEF_BASE_URL': second.base, 'WINMATE_CLEF_MODEL': 'clef-flash'}  # the app's clef slot follows it


# ---------------------------------------------------------------- experiments
def test_llm_experiment_and_parallel_targets(providers, serving):
    serving.models += ['in-house-8b']
    serving.delay = 0.3
    targets = [('llm.internal', None), ('llm.internal', 'in-house-8b')]
    started = time.time()
    with ThreadPoolExecutor(2) as pool:
        text, small = pool.map(lambda t: providers.run(t[0], model=t[1], system='s', user='hello', max_tokens=32), targets)
    assert time.time() - started < 0.58  # the two calls overlap
    assert text['ok'] and text['text'] == 'echo:in-house-32b' and small['text'] == 'echo:in-house-8b'
    assert text['ms'] >= 300 and (text['input_tokens'], text['output_tokens']) == (11, 7) and text['tokens_per_s'] > 0
    serving.delay = 0
    structured = providers.run('llm.internal', user='json please', json_mode=True)
    assert structured['json_valid'] and structured['json'] == {'answer': 'ok'}
    serving.fail = 500
    failed = providers.run('llm.internal', user='hello')
    assert not failed['ok'] and failed['error']['code'] == 'upstream_unavailable' and failed['ms'] >= 0
    assert len([r for r in serving.requests if r[0] == 'POST']) == 4  # one real call each, no hidden retries
    with pytest.raises(ProviderInputError):
        providers.run('llm.internal', user='  ')
    with pytest.raises(ProviderInputError):
        providers.run('llm.openai', user='hello')  # not connected


def test_decision_experiment(providers, serving):
    questions = {'yes': {'type': 'noul', 'instructions': '참이다.'}, 'pick': {'type': 'choice', 'instructions': '고른다.', 'criteria': {'a': 'A', 'b': 'B'}}}
    result = providers.run('decision.clef', state={'text': '상태'}, questions=questions)
    assert result['ok'] and result['answers']['pick']['choice'] == 'a' and result['input_tokens'] == 42 and result['model'] == 'clef-flash'
    body = serving.requests[-1][3]
    assert body['truncate'] is False and body['model'] == 'clef-flash'  # Clef limits apply to the Clef target
    bad = providers.run('decision.clef', state={}, questions={'q': {'type': 'essay'}})
    assert not bad['ok'] and bad['error']['code'] == 'bad_request'
    with pytest.raises(ProviderInputError):
        providers.run('decision.clef', state={}, questions={})


def test_samples_are_runnable_shapes(providers):
    from app.api.llm.decision import QUESTION_TYPES, plan_batches
    view = providers.view()
    assert len(view['samples']['llm']) >= 6 and len(view['samples']['decision']) >= 4
    for sample in view['samples']['llm']:
        assert sample['user'].strip() and sample['title'] and 1 <= sample['max_tokens'] <= 8192
    for sample in view['samples']['decision']:
        assert sample['task'] in cfg.DECISION_TASKS and all(q['type'] in QUESTION_TYPES for q in sample['questions'].values())
        assert len(plan_batches(sample['state'], sample['questions'], 15_000, 15_000)) == 1  # fits one Clef request


# ---------------------------------------------------------------- API
@pytest.fixture
def client(tmp_path, monkeypatch, providers):
    auth = Auth(AuthConfig(auth_dir=tmp_path / 'auth'))
    auth.set_credentials('admin', 'isolated-test-password')
    monkeypatch.setattr(server, 'providers', providers)
    monkeypatch.setattr(server.winmate.state, 'auth', auth)
    token, _ = auth.issue_token()
    with TestClient(server.api) as c:
        yield c, auth, token


def test_api_requires_admin_and_round_trips(client, serving, second):
    c, auth, token = client
    assert c.get('/api/providers').status_code == 401
    c.cookies.set(auth.config.cookie_name, token)
    view = c.get('/api/providers').json()
    assert {p['id'] for p in view['providers']} == {'llm.openrouter', 'llm.gemini', 'llm.internal', 'llm.openai', 'decision.main', 'decision.clef',
                                                   'decision.inhouse'}  # the in-house class card (not installed here → not registered)
    assert not next(p for p in view['providers'] if p['id'] == 'decision.inhouse')['registered']
    assert view['interval_s'] == 1800 and SECRET not in json.dumps(view)
    assert c.post('/api/providers/llm.internal/check').json()['status'] == 'ok'
    assert c.post('/api/providers/llm.openrouter/check').json()['status'] == 'ok'   # external: free calls (fake External)
    assert c.post('/api/providers/llm.nope/check').status_code == 404
    assert c.post('/api/providers/llm.internal/check', json={'base_url': second.base, 'model': 'in-house-32b'}).json()['status'] == 'ok'
    saved = c.put('/api/providers/llm.internal/endpoint', json={'base_url': second.base, 'model': 'in-house-32b'})
    assert saved.status_code == 200 and saved.json()['provider']['edit']['base_url'] == second.base
    assert c.put('/api/providers/llm.gemini/endpoint', json={'base_url': second.base, 'model': 'x'}).status_code == 422
    ran = c.post('/api/providers/run', json={'target': 'llm.internal', 'user': '안녕하세요', 'max_tokens': 16}).json()
    assert ran['ok'] and ran['text'] == 'echo:in-house-32b' and second.requests[-1][1] == '/v1/chat/completions'
    decided = c.post('/api/providers/run', json={'target': 'decision.clef', 'state': {'a': 1}, 'questions': {'q': {'type': 'noul', 'instructions': 'x'}}}).json()
    assert decided['ok'] and decided['answers']['q']['noul'] == 0.9
    assert c.post('/api/providers/run', json={'target': 'llm.internal', 'user': ''}).status_code == 422
    assert c.delete('/api/providers/llm.internal/endpoint').json()['provider']['base_url'] == serving.base
    assert c.post('/api/providers/decision.main/deactivate').json()['provider']['active'] is False
    assert c.post('/api/providers/llm.openrouter/deactivate').status_code == 422
    assert c.post('/api/providers/decision.clef/activate').json()['provider']['primary'] is True
    assert c.post('/api/providers/decision.main/primary').json()['provider']['primary'] is True
    assert c.post('/api/providers/llm.openai/primary').status_code == 422


def test_add_clef_validates_and_selects_one_endpoint(client, providers, serving, second):
    from app.api.llm.decision import get_decision
    c, auth, token = client
    c.cookies.set(auth.config.cookie_name, token)
    def add(server):
        return c.post('/api/providers/clef', json={'base_url': server.base + '/systemone', 'model': 'clef-trained'})
    first = add(serving).json()
    assert first['registered'] and not first['active'] and first['status']['status'] == 'ok'
    assert add(serving).json()['id'] == first['id']
    second.invalid_answers = True
    assert add(second).status_code == 422 and len(providers.clefs()) == 1
    second.invalid_answers = False
    other = add(second).json()
    assert other['id'] != first['id']
    assert cfg.get_settings().decision_primary == 'main'
    providers.activate(first['id'])
    second.invalid_answers = True
    with pytest.raises(ProviderInputError):
        providers.activate(other['id'])
    assert cfg.get_settings().decision_base_url == serving.base
    second.invalid_answers = False
    providers.activate(other['id'])
    cfg.set_overrides({})
    Providers(providers.store, root=providers.root).apply()
    live = get_decision(cfg.get_settings(), 'layout.pick')
    assert live.base == second.base and not live.fallbacks and live.family == 'clef'
    before = len(serving.requests)
    answer = live.ask(stage='test:selected', state='x', questions={'q': {'type': 'noul', 'instructions': 'y'}})
    assert answer.model == 'clef-trained' and len(serving.requests) == before
    assert [p['id'] for p in providers.entries(False) if p['role'] == 'decision' and p['active']] == [other['id']]


def test_async_training_endpoint_and_timeout(client, providers, second, monkeypatch):
    from admin import providers as module
    from app.api.llm.inhouse_contract import ClefTrainingResponse
    c, auth, token = client
    c.cookies.set(auth.config.cookie_name, token)
    release = threading.Event()
    async def train(request):
        assert request.model == 'clef-trained' and request.job_id
        while not release.is_set():
            await asyncio.sleep(0.01)
        return ClefTrainingResponse(endpoint=second.base)

    def start():
        r = c.post('/api/providers/clef/training', json={'model': 'clef-trained'})
        assert r.status_code == 202
        return '/api/providers/clef/training/' + r.json()['id']

    def finished(url):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            result = c.get(url).json()
            if result['status'] != 'running':
                return result
            time.sleep(0.01)
        pytest.fail('training did not finish')

    assert '연동' in finished(start())['detail']
    monkeypatch.setattr(module.inhouse_bridge, 'training_adapter', lambda: SimpleNamespace(train=train))
    url = start()
    assert c.get(url).json()['status'] == 'running' and not providers.clefs()
    release.set()
    job = finished(url)
    assert job['status'] == 'succeeded' and providers.entry(job['provider_id'])['status']['status'] == 'ok'
    assert cfg.get_settings().decision_primary == 'main'
    release.clear()
    monkeypatch.setattr(module, 'TRAINING_TIMEOUT', 0.05)
    result = finished(start())
    assert result['status'] == 'failed' and '30분' in result['detail']
    assert len(providers.clefs()) == 1
