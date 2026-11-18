"""사내 모델 연결 통로(app/api/llm/inhouse_bridge.py · inhouse_contract.py).

git 이 무시하는 폴더의 GaussLLM · ClefDecision 이 있으면 앱의 LLM(internal 프로필)과 Decision(inhouse 칸)이 그 클래스를 쓰고,
없으면 아무것도 바뀌지 않는다. 클래스는 app/tests/fixtures/inhouse/* (가짜 규격), 서버는 fixtures/inhouse_fake.py — 밖으로 나가는
네트워크는 없다.
"""
from __future__ import annotations

import json
import os

import pytest

from app.api.llm import decision, inhouse_bridge
from app.api.llm.adapters import InternalAdapter, create_adapter
from app.api.llm.provider import ProviderError
from app.api.poc import provider as poc_provider
from app.api.poc import settings as cfg
from app.tests.fixtures.inhouse_fake import CLIENT, SEARCH_KEY, TOKEN, FakeInhouse, clef_config, install

PNG = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mO4IydHEmIY1TCqYfhqAACaMxgQdrf9VwAAAABJRU5ErkJggg=='
QUESTIONS = {'pick': decision.choice('가장 중요한 것은?', {'price': '초기 비용', 'performance': '성능'}),
             'fit': decision.score('관련도', ['없음', '약함', '적합', '매우 적합']),
             'sensitive': decision.noul('고객은 가격에 민감하다.')}


@pytest.fixture
def fake():
    server = FakeInhouse('clef-test')
    yield server
    server.close()


@pytest.fixture
def other():
    server = FakeInhouse('clef-other')
    yield server
    server.close()


def reset(monkeypatch):
    cfg.set_overrides({})
    monkeypatch.setattr(cfg, '_SETTINGS', None)
    decision.set_decision_override(clear=True)
    monkeypatch.setattr(decision, '_CLIENT', None)
    poc_provider.set_provider_override(clear=True)
    monkeypatch.setattr(poc_provider, '_PROVIDER', None)
    poc_provider._NAMED.clear()


@pytest.fixture
def env(tmp_path, monkeypatch, fake):
    """사내망 checkout 처럼: internal 프로필 + Decision 순서 inhouse, 클래스 · 키 · 관리자 CLEF 설정이 모두 있음."""
    for key in list(os.environ):
        if key.startswith(('WINMATE_LLM', 'WINMATE_GEMINI', 'OPENROUTER_', 'INTERNAL_', 'GEMINI_', 'TYPESAFE_', 'WINMATE_DECISION',
                           'CLEF_', 'INHOUSE_', 'GAUSS_', 'WINMATE_CLEF')):
            monkeypatch.delenv(key)
    admin = tmp_path / 'admin'
    admin.mkdir()
    (admin / 'clef_remote.json').write_text(json.dumps(clef_config(('a', fake, True, 15_000, 1))), encoding='utf-8')
    values = {'WINMATE_ENV_FILES': 'none', 'WINMATE_LLM_QUEUE_DB': str(tmp_path / 'queue.sqlite'), 'WINMATE_LLM_PROVIDER': 'internal',
              'WINMATE_INHOUSE_DIR': str(install(tmp_path / 'inhouse')), 'WINMATE_ADMIN_DATA': str(admin),
              'INTERNAL_LLM_API_KEY': TOKEN, 'INTERNAL_LLM_CLIENT_KEY': CLIENT, 'INTERNAL_LLM_USER_EMAIL': 'tester@example.test',
              'INTERNAL_LLM_BASE_URL': fake.base, 'INTERNAL_LLM_MODEL': 'gauss-test', 'INTERNAL_LLM_VISION_MODEL': 'gauss-vision',
              'INTERNAL_SEARCH_API_KEY': SEARCH_KEY, 'WINMATE_DECISION_ORDER': 'inhouse'}
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    reset(monkeypatch)
    yield monkeypatch
    cfg.set_overrides({})


def provider():
    value, reason = poc_provider.get_provider(cfg.reload_settings())
    assert value is not None, reason
    return value


# ---------------------------------------------------------------- 없으면 그대로 · 있으면 검사
def test_without_the_class_files_nothing_changes(tmp_path, monkeypatch):
    monkeypatch.setenv('WINMATE_INHOUSE_DIR', str(tmp_path / 'nothing-here'))
    reset(monkeypatch)
    status = inhouse_bridge.llm_status()
    assert not status.present and status.problems == [f'{status.file} · class GaussLLM']
    settings = cfg.load_settings({'WINMATE_LLM_PROVIDER': 'internal', 'INTERNAL_LLM_API_KEY': 'k' * 12,
                                  'INTERNAL_LLM_BASE_URL': 'http://10.0.0.5:8000/v1', 'INTERNAL_LLM_MODEL': 'm', 'WINMATE_DECISION_ORDER': 'inhouse,main'}, [])
    assert type(create_adapter(settings)) is InternalAdapter  # the chat-completions transport, as before
    assert settings.inhouse_llm == '' and settings.inhouse_decision == ''
    assert ('inhouse', '', '', False) in settings.decision_slots and settings.decision_primary == 'inhouse'
    assert not settings.decision_enabled('layout.pick')  # no key on main either → the LLM branch


@pytest.mark.parametrize('patch, expected', [
    ({'gauss.py': [('class GaussLLM(InhouseLLM):', 'class OtherName(InhouseLLM):')]}, 'class GaussLLM 가 없습니다'),
    ({'gauss.py': [('class GaussLLM(InhouseLLM):', 'class GaussLLM:')]}, 'InhouseLLM 을 상속해야'),
    ({'gauss.py': [('    def parse(self, status, body):', '    def parse_other(self, status, body):')]}, '구현하지 않은 메서드: parse'),
    ({'gauss.py': [("CAPABILITIES = frozenset({'text', 'json', 'image', 'stream', 'search'})", "CAPABILITIES = frozenset({'text', 'video'})")]},
     'CAPABILITIES 에 모르는 값: video'),
    ({'gauss.py': [('import json\n', 'import json\nraise RuntimeError("boom " + "gauss-token-secret-123456")\n')]}, '불러오기 실패'),
])
def test_contract_problems_are_reported_not_raised(env, tmp_path, patch, expected):
    env.setenv('WINMATE_INHOUSE_DIR', str(install(tmp_path / 'broken', patch=patch)))
    status = inhouse_bridge.llm_status()
    assert status.present and not status.ready and expected in status.error and TOKEN not in status.error
    settings = cfg.reload_settings()  # never raises; the app reports the class as not ready
    assert settings.inhouse_llm == 'error' and any('GaussLLM' in w for w in settings.warnings)
    assert poc_provider.get_provider(settings) == (None, 'provider_disabled')


def test_missing_keys_and_disabled_targets(env, tmp_path):
    env.delenv('INTERNAL_LLM_CLIENT_KEY')
    status = inhouse_bridge.llm_status()
    assert status.loaded and status.missing == ('INTERNAL_LLM_CLIENT_KEY',) and status.problems == ['INTERNAL_LLM_CLIENT_KEY']
    settings = cfg.reload_settings()
    assert settings.inhouse_llm == 'missing' and poc_provider.get_provider(settings) == (None, 'no_api_key')
    admin = tmp_path / 'admin'
    saved = json.loads((admin / 'clef_remote.json').read_text())
    saved['providers'][0]['enabled'] = False
    (admin / 'clef_remote.json').write_text(json.dumps(saved))
    inhouse_bridge._INSTANCES.clear()
    status = inhouse_bridge.decision_status()
    assert not status.ready and status.problems == ['ClefDecision.targets() 에 켜진 대상 없음']
    assert not cfg.reload_settings().decision_enabled('layout.pick')


# ---------------------------------------------------------------- LLM
def test_text_json_images_and_usage_go_through_the_class(env, fake):
    p = provider()
    assert isinstance(p.adapter, inhouse_bridge.InhouseLLMAdapter) and p.available and p.model == 'gauss-test'
    r = p.generate_text(stage='test:inhouse', system='짧게', user='안녕하세요 반가워요')
    assert r.text == 'echo:gauss-test:0:안녕하세요 반가워요' and (r.prompt_tokens, r.output_tokens) == (12, 5)
    _, path, headers, body = fake.posts('/fake-llm/chat')[-1]
    assert headers['x-fake-token'] == TOKEN and headers['x-fake-client'] == CLIENT and headers['x-fake-user'] == 'tester@example.test'
    assert body['prompt']['system'] == '짧게' and body['options']['format'] == 'text' and body['stream'] is False
    r = p.generate_json(stage='test:inhouse', user='json', schema={'type': 'OBJECT', 'properties': {'ok': {'type': 'BOOLEAN'}}})
    assert r.data == {'ok': True}
    assert fake.posts('/fake-llm/chat')[-1][3]['options']['schema'] == {'type': 'object', 'properties': {'ok': {'type': 'boolean'}}}
    r = p.generate_text(stage='test:inhouse', user='그림', images=['data:image/png;base64,' + PNG])
    assert r.text == 'echo:gauss-vision:1:그림'  # images without a model name → the vision model


def test_json_instruction_is_added_when_the_class_has_no_json_mode(env, fake, tmp_path):
    env.setenv('WINMATE_INHOUSE_DIR', str(install(tmp_path / 'nojson', patch={'gauss.py': [
        ("CAPABILITIES = frozenset({'text', 'json', 'image', 'stream', 'search'})", "CAPABILITIES = frozenset({'text', 'image', 'stream'})")]})))
    p = provider()
    p.generate_text(stage='test:inhouse', system='규칙', user='x', json_mode=True)
    assert fake.posts('/fake-llm/chat')[-1][3]['prompt']['system'].startswith('규칙\n\nReturn exactly one valid JSON value')


def test_stream_lines_and_stream_emulation(env, fake, tmp_path):
    chunks = list(provider().stream_text(stage='test:inhouse', user='셋까지'))
    assert chunks == ['하나', '하나 둘', '하나 둘 셋'] and fake.posts('/fake-llm/chat')[-1][3]['stream'] is True
    env.setenv('WINMATE_INHOUSE_DIR', str(install(tmp_path / 'nostream', patch={'gauss.py': [
        ("CAPABILITIES = frozenset({'text', 'json', 'image', 'stream', 'search'})", "CAPABILITIES = frozenset({'text', 'json'})")]})))
    seen = []
    chunks = list(provider().stream_text(stage='test:inhouse', user='셋까지', on_result=seen.append))
    assert chunks == ['echo:gauss-test:0:셋까지'] and seen[0].text == chunks[0]
    assert fake.posts('/fake-llm/chat')[-1][3]['stream'] is False


def test_search_returns_the_grounding_the_research_features_read(env, fake):
    from app.api.poc.adapters.simulation_skills import grounded_material
    from app.api.poc.market_research import web_search_supported
    p = provider()
    assert web_search_supported(p)
    r = p.search_web(stage='test:inhouse', query='한국 공개 자료에서 찾으세요: 시장 규모.\n검색어: 스마트 오피스 / 시장 규모\n연도를 적으세요.')
    method, path, headers, _ = [x for x in fake.requests if x[1].startswith('/fake-search')][-1]
    assert method == 'GET' and headers['x-fake-search'] == SEARCH_KEY and 'q=%EC%8A%A4%EB%A7%88%ED%8A%B8' in path
    grounding = r.grounding
    assert grounding['webSearchQueries'] == ['스마트 오피스 / 시장 규모'] and len(grounding['groundingChunks']) == 3
    assert grounding['groundingChunks'][0]['web']['uri'] == 'https://example.org/doc/1' and r.text
    materials = grounded_material(r)
    assert [m['url'] for m in materials] == [f'https://example.org/doc/{i}' for i in (1, 2, 3)]
    assert materials[0]['facts']['search_supported_summary'].startswith('스마트 오피스')


def test_busy_bodies_are_retried_and_errors_hide_the_keys(env, fake):
    fake.llm_errors = [{'kind': 'busy', 'text': '잠시 후'}]
    r = provider().generate_text(stage='test:inhouse', user='다시')
    assert r.attempts == 2 and r.text.startswith('echo:')
    env.setenv('INTERNAL_LLM_CLIENT_KEY', 'wrong-client-secret-999999')
    with pytest.raises(ProviderError) as caught:
        provider().generate_text(stage='test:inhouse', user='인증', max_attempts=1)
    assert caught.value.code == 'auth_failed' and '가짜 서버 오류' in caught.value.message
    assert TOKEN not in str(caught.value) and 'wrong-client-secret-999999' not in str(caught.value)


def test_a_call_the_class_cannot_take_goes_to_the_next_llm(env, fake, tmp_path):
    env.setenv('WINMATE_INHOUSE_DIR', str(install(tmp_path / 'noimage', patch={'gauss.py': [
        ("CAPABILITIES = frozenset({'text', 'json', 'image', 'stream', 'search'})", "CAPABILITIES = frozenset({'text', 'json', 'stream'})")]})))
    with pytest.raises(ProviderError) as caught:
        provider().generate_text(stage='test:inhouse', user='그림', images=['data:image/png;base64,' + PNG])
    assert caught.value.code == 'unsupported_capability'
    for key, value in (('WINMATE_LLM_FALLBACK', 'openai'), ('WINMATE_LLM_API_KEY', 'local-fallback-000000'),
                       ('WINMATE_LLM_BASE_URL', fake.base + '/v1'), ('WINMATE_LLM_MODEL', 'fallback-model')):
        env.setenv(key, value)
    reset(env)
    r = provider().generate_text(stage='test:inhouse', user='그림', images=['data:image/png;base64,' + PNG])
    assert r.text == 'fallback:fallback-model'
    chunks = list(provider().stream_text(stage='test:inhouse', user='그림', images=['data:image/png;base64,' + PNG]))
    assert chunks[-1] == 'fallback:fallback-model'


def test_the_llm_route_and_its_stream_keep_their_shapes_with_the_class(env, fake):
    """The app's own /api/llm (JSON and SSE) resolved from settings alone — no provider override."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.api.poc.routes import router
    cfg.reload_settings()
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        response = client.post('/api/llm', json={'kind': 'json', 'feature': 'llm', 'prompt': 'test'})
        assert response.status_code == 200 and response.json()['data'] == {'ok': True} and response.json()['model'] == 'gauss-test'
        response = client.post('/api/llm', json={'kind': 'text', 'feature': 'llm', 'prompt': '셋까지', 'stream': True})
        frames = [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith('data:')]
        assert response.status_code == 200 and frames[-1]['type'] == 'result'
        assert [f['text'] for f in frames if f['type'] == 'text'][-1] == '하나 둘 셋'
    assert fake.posts('/fake-llm/chat')[-1][3]['stream'] is True


# ---------------------------------------------------------------- Decision
def test_decision_inhouse_slot_answers_like_system_one(env, fake):
    settings = cfg.reload_settings()
    assert settings.decision_primary == 'inhouse' and settings.decision_enabled('search.rerank')
    assert settings.public()['decision']['provider'] == 'inhouse' and settings.public()['inhouse'] == {'llm': 'ready', 'decision': 'ready'}
    client = decision.get_decision(settings, 'search.rerank')
    assert isinstance(client, inhouse_bridge.InhouseDecisionClient) and client.available and client.model == 'clef-test'
    result = client.ask(stage='test:inhouse', state='고객은 비용 절감을 원한다.', questions=QUESTIONS)
    assert result.answers['pick']['choice'] == 'price' and result.answers['fit']['score'] == 2.0 and result.answers['sensitive']['noul'] == 0.8
    assert result.model == 'clef-test' and result.input_tokens == 40 and result.as_generation().data == result.answers
    assert fake.posts('/v1/systemone')[-1][3]['model'] == 'clef-test'


def test_decision_targets_take_turns_split_and_queue(env, fake, other, tmp_path):
    fake.systemone_fail = 503   # target a answers nothing → target b (small budget · two at a time) answers
    other.delay = 0.05
    (tmp_path / 'admin' / 'clef_remote.json').write_text(json.dumps(clef_config(('a', fake, True, 15_000, 1), ('b', other, True, 400, 2))))
    inhouse_bridge._INSTANCES.clear()
    client = decision.get_decision(cfg.reload_settings(), 'layout.pick')
    questions = {f'q{i}': decision.noul(f'문장 {i} 은 고객 요구와 맞다. ' + '설명 ' * 20) for i in range(12)}
    result = client.ask(stage='test:inhouse', state='상태', questions=questions)
    assert set(result.answers) == set(questions) and result.model == 'clef-other'
    assert fake.posts('/v1/systemone') and len(other.posts('/v1/systemone')) > 1 and other.peak <= 2


def test_decision_falls_back_to_the_next_slot_and_rejects_bad_answers(env, fake, other):
    fake.systemone_fail = 503
    for key, value in (('WINMATE_DECISION_ORDER', 'inhouse,main'), ('TYPESAFE_API_KEY', 'ts-local-000000'),
                       ('TYPESAFE_BASE_URL', other.base + '/v1'), ('TYPESAFE_MODEL', 'jev-1.14.0')):
        env.setenv(key, value)
    settings = cfg.reload_settings()
    client = decision.get_decision(settings, 'layout.pick')
    assert [type(x).__name__ for x in [client, *client.fallbacks]] == ['InhouseDecisionClient', 'TypeSafeDecision']
    result = client.ask(stage='test:inhouse', state='상태', questions=QUESTIONS)
    assert result.model == 'jev-1.14.0' and other.posts('/v1/systemone')
    fake.systemone_fail, fake.bad_answers = 0, True
    with pytest.raises(ProviderError) as caught:
        client.ask(stage='test:inhouse', state='상태', questions=QUESTIONS)
    assert caught.value.code == 'invalid_output'   # a wrong answer is never handed to another model


def test_probes_and_the_check_command(env, fake, capsys):
    settings = cfg.reload_settings()
    assert inhouse_bridge.probe_llm(settings) == {'status': 'ok', 'detail': '가짜 서버가 응답했습니다.', 'models': ['gauss-test', 'gauss-vision']}
    assert inhouse_bridge.probe_decision(settings)['status'] == 'ok'
    assert inhouse_bridge.main(['check', '--live']) == 0
    out = capsys.readouterr().out
    assert 'FAIL' not in out and 'PASS  generate_text' in out and 'PASS  answer(a)' in out and 'PASS  search_web' in out
    assert TOKEN not in out and CLIENT not in out


def test_a_stream_that_cannot_be_built_fails_as_before_without_a_fallback(env, tmp_path):
    env.setenv('WINMATE_INHOUSE_DIR', str(install(tmp_path / 'nobuild', patch={'gauss.py': [
        ('    def build(self, call):\n', "    def build(self, call):\n        if call.stream:\n            raise InhouseError('bad_request', '스트림 요청 형식 오류')\n")]})))
    p = provider()
    with pytest.raises(ProviderError) as caught:
        list(p.stream_text(stage='test:inhouse', user='x'))
    assert caught.value.code == 'bad_request' and p.ledger.view()['failed'] == 0  # not counted as a failed call (as before)


def test_a_model_id_is_required_to_be_ready(env, tmp_path):
    env.setenv('WINMATE_INHOUSE_DIR', str(install(tmp_path / 'nomodel', patch={'gauss.py': [
        ("REQUIRED_ENV = ('INTERNAL_LLM_API_KEY', 'INTERNAL_LLM_CLIENT_KEY', 'INTERNAL_LLM_BASE_URL', 'INTERNAL_LLM_MODEL')",
         "REQUIRED_ENV = ('INTERNAL_LLM_API_KEY', 'INTERNAL_LLM_CLIENT_KEY', 'INTERNAL_LLM_BASE_URL')")]})))
    env.delenv('INTERNAL_LLM_MODEL')
    status = inhouse_bridge.llm_status()
    assert not status.ready and status.missing == ('INTERNAL_LLM_MODEL',)
    assert poc_provider.get_provider(cfg.reload_settings()) == (None, 'no_api_key')


def test_the_check_image_is_a_real_png():
    import base64
    import struct
    import zlib
    data, pos, chunks = base64.b64decode(inhouse_bridge._PNG), 8, {}
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    while pos < len(data):
        n = struct.unpack('>I', data[pos:pos + 4])[0]
        kind, body = data[pos + 4:pos + 8], data[pos + 8:pos + 8 + n]
        assert struct.unpack('>I', data[pos + 8 + n:pos + 12 + n])[0] == zlib.crc32(kind + body) & 0xffffffff
        chunks[kind] = chunks.get(kind, b'') + body
        pos += 12 + n
    width, height = struct.unpack('>II', chunks[b'IHDR'][:8])
    assert (width, height) == (16, 16) and len(zlib.decompress(chunks[b'IDAT'])) == height * (1 + 3 * width)
