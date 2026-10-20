"""Same caller contract through different model adapters and a real shared broker."""
import concurrent.futures
import io
import json
import urllib.error

import pytest
from pydantic import BaseModel

from app.api.llm.adapters import OpenAIAdapter, json_schema
from app.api.llm.contracts import ModelProvider
from app.api.llm.provider import GeminiProvider, LLMProvider, ProviderError
from app.api.llm.queue import CallQueue, SQLiteBroker
from app.api.poc import provider as legacy
from app.api.poc.settings import load_settings


def config(vendor='gemini', **values):
    return load_settings({'WINMATE_LLM_PROVIDER': vendor, 'WINMATE_LLM_API_KEY': 'test-secret-1234567890',
                          'WINMATE_LLM_MODEL': 'contract-model', 'WINMATE_LLM_BASE_URL': 'https://example.test/v1',
                          **values}, [])


def wire(vendor, text, *, stream=False, finish=None):
    if vendor == 'gemini':
        value = {'candidates': [{'content': {'parts': [{'text': text}]}, 'finishReason': finish or 'STOP'}],
                 'usageMetadata': {'promptTokenCount': 7, 'candidatesTokenCount': 3}}
    else:
        value = {'choices': [{'delta' if stream else 'message': {'content': text}, 'finish_reason': finish or 'stop'}],
                 'usage': {'prompt_tokens': 7, 'completion_tokens': 3}}
    return value


def make_provider(tmp_path, vendor='gemini', fetch=None, *, settings=None, window=60):
    settings = settings or config(vendor)
    queue = CallQueue(SQLiteBroker(tmp_path/'queue.sqlite', window=window), concurrency=settings.concurrency,
                      rpm=settings.rpm, timeout=.2)
    return LLMProvider(settings, urlopen=fetch, queue=queue)


@pytest.mark.parametrize('vendor', ['gemini', 'internal', 'openai'])
def test_same_input_output_and_usage_for_both_adapters(tmp_path, vendor):
    seen = []
    def fetch(request, **kwargs):
        seen.append(request)
        return io.BytesIO(json.dumps(wire(vendor, '{"ok":true}')).encode())
    provider = make_provider(tmp_path, vendor, fetch)
    schema = {'type': 'OBJECT', 'properties': {'ok': {'type': 'BOOLEAN'}}, 'required': ['ok']}
    result = provider.generate_json(stage='contract', system='system rule',
                                    turns=[{'role': 'user', 'content': 'first'}, {'role': 'assistant', 'content': 'reply'},
                                           {'role': 'user', 'content': 'question'}],
                                    images=['data:image/png;base64,AA=='], schema=schema, seed=5)
    assert isinstance(provider, ModelProvider)
    assert isinstance(result, legacy.GenerationResult)
    assert result.data == {'ok': True} and result.text == '{"ok":true}'
    assert (result.prompt_tokens, result.output_tokens, result.attempts, result.cached) == (7, 3, 1, False)
    body = json.loads(seen[0].data)
    assert body.get('seed', body.get('generationConfig', {}).get('seed')) == 5
    assert 'test-secret' not in seen[0].full_url
    assert provider.queue.snapshot()['starts_last_minute'] == 1
    assert schema['type'] == 'OBJECT'
    if vendor == 'gemini':
        assert body['contents'][1]['role'] == 'model'
        assert body['contents'][-1]['parts'][-1]['inline_data']['mime_type'] == 'image/png'
    else:
        assert seen[0].full_url.endswith('/chat/completions')
        assert body['messages'][-2]['role'] == 'assistant'
        assert body['messages'][-1]['content'][-1]['image_url']['url'].startswith('data:image/png')
        assert body['response_format'] == {'type': 'json_object'}
        assert 'JSON Schema' in body['messages'][0]['content']
        assert sum(m['role'] == 'system' for m in body['messages']) == 1


@pytest.mark.parametrize('vendor', ['gemini', 'internal', 'openai'])
def test_cumulative_stream_and_callback_contract_and_partial_close(tmp_path, vendor):
    opened = []
    def fetch(*args, **kwargs):
        raw = io.BytesIO(('\n\n'.join('data: '+json.dumps(wire(vendor, part, stream=True)) for part in ['hello', ' world'])+'\n\ndata: [DONE]\n\n').encode())
        opened.append(raw)
        return raw
    provider = make_provider(tmp_path, vendor, fetch)
    results = []
    assert list(provider.stream_text(stage='stream', user='prompt', on_result=results.append)) == ['hello', 'hello world']
    assert len(results) == 1 and results[0].text == 'hello world' and results[0].prompt_tokens == 7
    iterator = provider.stream_text(stage='partial', user='prompt')
    assert next(iterator) == 'hello'
    assert provider.queue.snapshot()['active'] == 1
    iterator.close()
    assert all(raw.closed for raw in opened)
    assert provider.queue.snapshot()['active'] == 0
    assert provider.ledger.view()['active_requests'] == 0


@pytest.mark.parametrize('vendor', ['gemini', 'internal', 'openai'])
def test_retry_counts_every_upstream_attempt_and_cache_counts_none(tmp_path, vendor):
    calls = []
    def fetch(request, **kwargs):
        calls.append(request)
        if len(calls) == 1:
            raise urllib.error.HTTPError(request.full_url, 429, 'quota', {'Retry-After': '0'}, io.BytesIO(b'quota'))
        return io.BytesIO(json.dumps(wire(vendor, '{"ok":true}')).encode())
    provider = make_provider(tmp_path, vendor, fetch, window=60)
    provider.cache_dir = tmp_path/'cache'
    first = provider.generate_json(stage='retry', user='prompt')
    second = provider.generate_json(stage='retry', user='prompt')
    assert first.attempts == 2 and second.cached
    assert len(calls) == 2 and provider.queue.snapshot()['starts_last_minute'] == 2
    assert provider.queue.snapshot()['active'] == 0


def test_provider_instances_and_model_tiers_share_exactly_42_admissions(tmp_path):
    calls = []
    def fetch(request, **kwargs):
        calls.append(request)
        return io.BytesIO(json.dumps(wire('gemini', 'ok')).encode())
    providers = [make_provider(tmp_path, fetch=fetch, window=60) for _ in range(3)]
    for provider in providers: provider.queue.timeout = 3
    def complete(i):
        try:
            providers[i % 3].generate_text(stage='shared', user='prompt', model=f'tier-{i%3}', max_attempts=1)
            return True
        except ProviderError as exc:
            assert exc.code == 'timeout'
            return False
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(complete, range(54)))
    assert sum(results) == len(calls) == 42
    assert providers[0].queue.snapshot()['active'] == 0


def test_queue_wait_does_not_consume_network_response_budget(tmp_path):
    seen = []
    def fetch(request, **kwargs):
        seen.append(kwargs['timeout'])
        return io.BytesIO(json.dumps(wire('gemini', 'ok')).encode())
    provider = make_provider(tmp_path, fetch=fetch, window=.12, settings=config(WINMATE_LLM_RPM='1'))
    provider.timeout = .06
    assert provider.generate_text(stage='first', user='prompt').text == 'ok'
    assert provider.generate_text(stage='waiting', user='prompt').text == 'ok'
    assert len(seen) == 2 and min(seen) > .04


def test_openai_refusal_truncation_and_unsupported_search_fail_explicitly(tmp_path):
    def fetch(request, **kwargs):
        return io.BytesIO(json.dumps(wire('openai', 'partial', finish='length')).encode())
    provider = make_provider(tmp_path, 'openai', fetch)
    with pytest.raises(ProviderError, match='max_tokens'):
        provider.generate_text(stage='truncated', user='prompt', max_attempts=1)
    with pytest.raises(ProviderError, match='unsupported_capability'):
        provider.search_web(stage='search', query='products')
    assert provider.queue.snapshot()['starts_last_minute'] == 1
    assert OpenAIAdapter(config('openai')).response({'choices': [{'message': {'refusal': 'refused'}}]})['candidates'][0]['finishReason'] == 'SAFETY'


def test_default_internal_never_uses_legacy_gemini_credentials(monkeypatch):
    monkeypatch.setattr(legacy, '_OVERRIDE', {})
    settings = load_settings({'GEMINI_API_KEY': 'gemini-test-secret',
                              'GEMINI_MODEL': 'gemini-test-model',
                              'GEMINI_BASE_URL': 'https://gemini.example/v1'}, [])
    assert settings.provider == 'internal'
    assert not settings.has_key
    assert settings.model == settings.quick_model == settings.vision_model == settings.base_url == ''
    assert legacy.get_provider(settings) == (None, 'no_api_key')


@pytest.mark.parametrize('vendor', ['internal', 'gemini'])
def test_env_switch_keeps_provider_credentials_models_and_endpoints_separate(vendor, tmp_path):
    env = tmp_path / 'profiles.env'
    values = {
        'WINMATE_LLM_PROVIDER': 'internal',
        'INTERNAL_LLM_API_KEY': 'internal-test-secret',
        'INTERNAL_LLM_MODEL': 'internal-model',
        'INTERNAL_LLM_QUICK_MODEL': 'internal-quick',
        'INTERNAL_LLM_VISION_MODEL': 'internal-vision',
        'INTERNAL_LLM_BASE_URL': 'https://internal.example/v1',
        'GEMINI_API_KEY': 'gemini-test-secret',
        'GEMINI_MODEL': 'gemini-model',
        'GEMINI_QUICK_MODEL': 'gemini-quick',
        'GEMINI_VISION_MODEL': 'gemini-vision',
        'GEMINI_BASE_URL': 'https://gemini.example/v1',
        'WINMATE_LLM_API_KEY': 'shared-test-secret',
        'WINMATE_LLM_MODEL': 'shared-model',
        'WINMATE_LLM_BASE_URL': 'https://shared.example/v1',
    }
    env.write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
    settings = load_settings({'WINMATE_LLM_PROVIDER': vendor}, [str(env)])
    assert settings.provider == vendor
    assert settings.api_key() == vendor + '-test-secret'
    assert settings.model == vendor + '-model'
    assert settings.quick_model == vendor + '-quick'
    assert settings.vision_model == vendor + '-vision'
    assert settings.base_url == 'https://' + vendor + '.example/v1'
    assert settings.key_source == str(env)
    assert all(secret not in str(settings.public()) + repr(settings)
               for secret in ['internal-test-secret', 'gemini-test-secret', 'shared-test-secret'])


def test_settings_enforce_hard_cap_and_preserve_legacy_defaults():
    for value in ['0', '-1', '43', '120', '10000', 'invalid']:
        assert 1 <= config(WINMATE_LLM_RPM=value).rpm <= 42
    assert load_settings({}, []).rpm == 42
    assert load_settings({'WINMATE_GEMINI_RPM': '120'}, []).rpm == 42
    settings = load_settings({'WINMATE_LLM_PROVIDER': 'openai', 'WINMATE_LLM_MODEL': 'internal',
                              'WINMATE_LLM_BASE_URL': 'https://internal.example/v1',
                              'WINMATE_LLM_API_KEY': 'internal-secret', 'GEMINI_API_KEY': 'google-secret',
                              'GEMINI_VISION_MODEL': 'gemini-vision'}, [])
    assert settings.api_key() == 'internal-secret'
    assert settings.model == settings.quick_model == settings.vision_model == 'internal'
    assert 'internal-secret' not in str(settings.public()) + repr(settings)
    assert 'google-secret' not in str(settings.public()) + repr(settings)


def test_json_schema_compatibility_and_opt_in_native_schema(tmp_path):
    source = {'type': 'OBJECT', 'properties': {'n': {'type': 'INTEGER', 'nullable': True}}, 'required': ['n']}
    assert json_schema(source)['properties']['n']['type'] == ['integer', 'null']
    seen = []
    def fetch(request, **kwargs):
        seen.append(json.loads(request.data))
        return io.BytesIO(json.dumps(wire('openai', '{"n":1}')).encode())
    provider = make_provider(tmp_path, 'openai', fetch, settings=config('openai', WINMATE_LLM_SCHEMA_MODE='json_schema'))
    assert provider.generate_json(stage='schema', user='prompt', schema=source).data == {'n': 1}
    assert seen[0]['response_format']['json_schema']['schema']['type'] == 'object'


def test_openai_usage_is_not_fabricated_and_preserves_billing_fields():
    adapter = OpenAIAdapter(config('openai'))
    assert 'usageMetadata' not in adapter.response({'choices': []})
    assert 'usageMetadata' not in adapter.stream_chunk({'choices': [], 'usage': None})
    value = adapter.response({'choices': [], 'usage': {'prompt_tokens': 10, 'completion_tokens': 4,
                             'total_tokens': 14, 'prompt_tokens_details': {'cached_tokens': 3},
                             'completion_tokens_details': {'reasoning_tokens': 2}}})
    assert value['usageMetadata'] == {'promptTokenCount': 10, 'candidatesTokenCount': 4,
                                      'totalTokenCount': 14, 'cachedContentTokenCount': 3, 'thoughtsTokenCount': 2}


def test_langchain_facade_uses_the_same_queue_for_sync_async_and_structured(tmp_path):
    def fetch(request, **kwargs):
        return io.BytesIO(json.dumps(wire('gemini', '{"ok":true}')).encode())
    provider = make_provider(tmp_path, fetch=fetch, window=60)
    class Output(BaseModel):
        ok: bool
    chat = provider.chat_model()
    assert chat.invoke('question').content == '{"ok":true}'
    import asyncio
    assert asyncio.run(chat.ainvoke('question')).content == '{"ok":true}'
    assert chat.with_structured_output(Output).invoke('question').ok is True
    assert provider.queue.snapshot()['starts_last_minute'] == 3
    with pytest.raises(ProviderError, match='unsupported_capability'): chat.bind_tools([])


def test_langchain_stream_stop_split_across_chunks_closes_the_lease(tmp_path):
    def fetch(*args, **kwargs):
        chunks = [wire('gemini', piece, stream=True) for piece in ['hello EN', 'D after stop']]
        return io.BytesIO(('\n'.join('data: '+json.dumps(c) for c in chunks)+'\n').encode())
    provider = make_provider(tmp_path, fetch=fetch)
    assert ''.join(chunk.content for chunk in provider.chat_model().stream('prompt', stop=['END'])) == 'hello '
    assert provider.queue.snapshot()['active'] == 0


def test_legacy_imports_keep_result_and_error_identity():
    assert legacy.ProviderError is ProviderError
    assert legacy.GeminiProvider is GeminiProvider


def test_invalid_gateway_and_adapter_request_fail_with_stable_errors(tmp_path):
    settings = load_settings({'WINMATE_LLM_PROVIDER': 'openai', 'WINMATE_LLM_API_KEY': 'secret',
                              'WINMATE_LLM_MODEL': 'internal'}, [])
    provider = make_provider(tmp_path, 'openai', settings=settings)
    with pytest.raises(ProviderError, match='no_api_key'):
        list(provider.stream_text(stage='unconfigured', user='prompt'))
    provider = make_provider(tmp_path)
    def fail(*args, **kwargs): raise ValueError('sensitive gateway details')
    provider.adapter.request = fail
    with pytest.raises(ProviderError, match='bad_request') as exc:
        provider.generate_json(stage='invalid-request', user='prompt')
    assert 'sensitive' not in str(exc.value)
    assert provider.queue.snapshot()['starts_last_minute'] == 0


def test_factory_switches_models_without_changing_consumers_and_custom_adapters_work(tmp_path, monkeypatch):
    from app.api.llm import get_provider
    from app.api.llm import adapters
    monkeypatch.setattr(legacy, '_PROVIDER', None)
    monkeypatch.setattr(legacy, '_OVERRIDE', {})
    monkeypatch.setattr(adapters, '_FACTORIES', dict(adapters._FACTORIES))
    gemini, reason = get_provider(config())
    assert reason == '' and gemini.name == 'gemini'
    internal, reason = get_provider(config('openai'))
    assert reason == '' and internal.name == 'openai' and internal is not gemini
    class InternalAdapter(OpenAIAdapter):
        name = 'internal'
    adapters.register_adapter('internal', InternalAdapter)
    custom, reason = get_provider(config('internal'))
    assert reason == '' and isinstance(custom, ModelProvider) and custom.name == 'internal'


def test_search_cache_cannot_reuse_another_provider_or_endpoint(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from app.api.poc.adapters import search
    current = [make_provider(tmp_path)]
    computed = []
    monkeypatch.setattr(search, 'CACHE', search.SearchCache())
    monkeypatch.setattr(search, 'resolve_mode', lambda *a: SimpleNamespace(provider=current[0]))
    monkeypatch.setattr(search.knowledge, 'layout_assets', lambda *a: (SimpleNamespace(PARTS={}, IND={}, STRATEGIES={}, P={}, S={}), None))
    monkeypatch.setattr(search.knowledge, 'bundle', lambda: SimpleNamespace(manifest={'generated_at': 'fixed'}))
    def run(*args):
        computed.append(1)
        return {'rerank': {}, 'llm': {}}
    monkeypatch.setattr(search, '_run', run)
    settings = config()
    assert search.search({'q': 'query'}, settings)['rerank']['cache'] == 'miss'
    assert search.search({'q': 'query'}, settings)['rerank']['cache'] != 'miss'
    current[0] = make_provider(tmp_path, 'openai')  # Same model name and URL.
    assert search.search({'q': 'query'}, settings)['rerank']['cache'] == 'miss'
    current[0].base = 'https://another-endpoint.test/v1'
    assert search.search({'q': 'query'}, settings)['rerank']['cache'] == 'miss'
    assert len(computed) == 3


def test_internal_model_keeps_layout_online_and_structured_output(tmp_path):
    from app.api.poc.backends import ModeTracker, make_layout_llm
    provider = make_provider(tmp_path, 'openai', lambda *a, **k: io.BytesIO(json.dumps(wire('openai', '{"ok":true}')).encode()))
    class Output(BaseModel):
        ok: bool
    tracker = ModeTracker(provider=provider)
    llm = make_layout_llm(provider, tracker)
    assert llm.online and llm.mode == 'openai'
    assert llm.structured(Output, 'system', 'prompt', tag='contract').ok is True
    assert tracker.ok == 1 and tracker.provider_name == 'openai'


@pytest.mark.parametrize('vendor', ['gemini', 'internal', 'openai'])
def test_http_and_sse_shapes_are_unchanged_when_switching_models(tmp_path, monkeypatch, vendor):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.poc import settings as cfg
    from app.api.poc.routes import router
    def fetch(request, **kwargs):
        body = json.loads(request.data)
        streaming = 'streamGenerateContent' in request.full_url or body.get('stream')
        value = wire(vendor, '{"ok":true}', stream=streaming)
        return io.BytesIO(('data: '+json.dumps(value)+'\n\n').encode() if streaming else json.dumps(value).encode())
    provider = make_provider(tmp_path, vendor, fetch)
    monkeypatch.setattr(cfg, '_SETTINGS', provider._settings)
    monkeypatch.setattr(legacy, '_OVERRIDE', {'provider': provider})
    app = FastAPI(); app.include_router(router)
    with TestClient(app) as client:
        response = client.post('/api/llm', json={'kind': 'json', 'feature': 'llm', 'prompt': 'test'})
        assert response.status_code == 200
        assert set(response.json()) == {'mode', 'feature', 'data', 'model', 'usage', 'schema_validated'}
        assert response.json()['data'] == {'ok': True}
        response = client.post('/api/llm', json={'kind': 'json', 'feature': 'llm', 'prompt': 'test', 'stream': True})
        frames = [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')]
        assert response.status_code == 200 and [f['type'] for f in frames] == ['text', 'result']
        assert frames[0] == {'type': 'text', 'text': '{"ok":true}'}
        assert frames[-1]['data'] == {'ok': True}
