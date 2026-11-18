"""Provider 탭의 사내 연결 — GaussLLM 이 든 「사내 LLM」 카드와 ClefDecision 의 「CLEF (사내)」 카드.

클래스는 app/tests/fixtures/inhouse/* (가짜 규격), 서버는 app/tests/fixtures/inhouse_fake.py. 밖으로 나가는 네트워크는 없다.
"""
import json
import os

import pytest

from admin.operations import Operations
from admin.providers import Providers, ProviderInputError
from admin.store import Store
from app.api.llm import decision
from app.api.poc import provider as poc_provider
from app.api.poc import settings as cfg
from app.api.llm import inhouse_bridge
from app.tests.fixtures.inhouse_fake import CLIENT, SEARCH_KEY, TOKEN, FakeInhouse, clef_config, install


@pytest.fixture
def fake():
    server = FakeInhouse('clef-test')
    yield server
    server.close()


@pytest.fixture
def providers(tmp_path, monkeypatch, fake):
    """OpenRouter 가 대표인 checkout 에 사내 클래스 두 개와 그 키 · 관리자 CLEF 설정이 있다."""
    for key in list(os.environ):
        if key.startswith(('WINMATE_LLM', 'WINMATE_GEMINI', 'OPENROUTER_', 'INTERNAL_', 'GEMINI_', 'TYPESAFE_', 'WINMATE_DECISION', 'CLEF_',
                           'INHOUSE_', 'GAUSS_', 'WINMATE_CLEF', 'WINMATE_PROVIDER')):
            monkeypatch.delenv(key)
    admin = tmp_path / 'admin'
    admin.mkdir()
    (admin / 'clef_remote.json').write_text(json.dumps(clef_config(('a', fake, True, 15_000, 1))), encoding='utf-8')
    values = {'WINMATE_ENV_FILES': 'none', 'WINMATE_LLM_QUEUE_DB': str(tmp_path / 'queue.sqlite'), 'WINMATE_LLM_PROVIDER': 'openrouter',
              'OPENROUTER_API_KEY': 'sk-or-external-secret-000000', 'WINMATE_INHOUSE_DIR': str(install(tmp_path / 'inhouse')),
              'WINMATE_ADMIN_DATA': str(admin), 'INTERNAL_LLM_API_KEY': TOKEN, 'INTERNAL_LLM_CLIENT_KEY': CLIENT,
              'INTERNAL_LLM_BASE_URL': fake.base, 'INTERNAL_LLM_MODEL': 'gauss-test', 'INTERNAL_SEARCH_API_KEY': SEARCH_KEY,
              'WINMATE_PROVIDER_CHECK_INTERVAL': 'off'}
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    cfg.set_overrides({})
    monkeypatch.setattr(cfg, '_SETTINGS', None)
    monkeypatch.setattr(decision, '_CLIENT', None)
    monkeypatch.setattr(poc_provider, '_PROVIDER', None)
    poc_provider._NAMED.clear()
    yield Providers(Store(tmp_path / 'state'), Operations(tmp_path / 'ops'), root=tmp_path / 'checkout')
    cfg.set_overrides({})


def by_id(providers):
    return {e['id']: e for e in providers.entries(usage=False)}


def test_cards_show_the_classes_and_their_state(providers, fake, monkeypatch):
    cards = by_id(providers)
    llm, clef = cards['llm.internal'], cards['decision.inhouse']
    assert llm['impl'] == 'GaussLLM' and llm['registered'] and llm['scope'] == 'internal' and llm['capabilities'] == ['image', 'json', 'search', 'stream', 'text']
    assert clef['impl'] == 'ClefDecision' and clef['registered'] and clef['scope'] == 'internal' and not clef['editable']
    assert clef['model'] == 'clef-test' and clef['targets'][0]['id'] == 'a' and clef['timeout_s'] == 30
    assert not llm['active'] and not clef['active']  # .env picks OpenRouter and TypeSafe
    view = json.dumps(providers.view())
    assert TOKEN not in view and CLIENT not in view and SEARCH_KEY not in view
    monkeypatch.delenv('INTERNAL_LLM_CLIENT_KEY')
    cfg.reload_settings()
    llm = by_id(providers)['llm.internal']
    assert not llm['registered'] and llm['missing'] == ['INTERNAL_LLM_CLIENT_KEY'] and llm['missing_hint'].endswith('gauss.py')
    with pytest.raises(ProviderInputError):
        providers.activate('llm.internal')


def test_turn_on_make_primary_check_and_experiment(providers, fake):
    result = providers.make_primary('decision.inhouse', 'tester')
    assert result['check']['status'] == 'ok' and result['provider']['primary']
    settings = cfg.get_settings()
    assert settings.decision_primary == 'inhouse' and settings.decision_enabled('layout.pick')
    assert type(decision.get_decision(settings, 'layout.pick')).__name__ == 'InhouseDecisionClient'
    result = providers.make_primary('llm.internal', 'tester')
    assert result['check'] == {**result['check'], 'status': 'ok', 'models': ['gauss-test', 'gauss-vision']}
    settings = cfg.get_settings()
    assert settings.provider == 'internal' and [n for n, *_ in settings.llm_fallbacks] == ['openrouter']
    app_provider, _ = poc_provider.get_provider(settings)
    assert app_provider.generate_text(stage='test:admin', user='안녕').text == 'echo:gauss-test:0:안녕'
    ran = providers.run('llm.internal', user='실험', max_tokens=64)
    assert ran['ok'] and ran['text'] == 'echo:gauss-test:0:실험' and ran['input_tokens'] == 12
    ran = providers.run('decision.inhouse', state='고객은 비용을 본다.', questions={'q': {'type': 'noul', 'instructions': '가격에 민감하다.'}})
    assert ran['ok'] and ran['answers']['q']['noul'] == 0.8 and ran['model'] == 'clef-test'
    fake.systemone_fail = 503
    ran = providers.run('decision.inhouse', state='x', questions={'q': {'type': 'noul', 'instructions': 'y'}})
    assert not ran['ok'] and ran['error']['code'] == 'upstream_error'
    record = providers.check('decision.inhouse')
    assert record['status'] == 'ok'  # the class's own probe (/health) still answers
    with pytest.raises(ProviderInputError):
        providers.check('decision.inhouse', base='http://127.0.0.1:1/v1')  # its servers live in the class's own settings


def test_an_experiment_model_override_asks_only_the_first_target(providers, fake, tmp_path):
    other = FakeInhouse('clef-other')
    try:
        fake.systemone_fail = 503
        (tmp_path / 'admin' / 'clef_remote.json').write_text(json.dumps(clef_config(('a', fake, True, 15_000, 1), ('b', other, True, 15_000, 1))))
        inhouse_bridge._INSTANCES.clear()
        cfg.reload_settings()
        question = {'q': {'type': 'noul', 'instructions': '가격에 민감하다.'}}
        ran = providers.run('decision.inhouse', state='x', questions=question)
        assert ran['ok'] and ran['model'] == 'clef-other'   # no override: target a fails, b answers
        before = len(other.posts('/v1/systemone'))
        ran = providers.run('decision.inhouse', model='clef-big', state='x', questions=question)
        assert not ran['ok'] and len(other.posts('/v1/systemone')) == before   # override: only a, which serves that model
    finally:
        other.close()


def test_select_one_enabled_inhouse_target(providers, fake, tmp_path):
    other = FakeInhouse('clef-other')
    try:
        (tmp_path / 'admin' / 'clef_remote.json').write_text(json.dumps(clef_config(
            ('a', fake, True, 15_000, 1), ('b', other, True, 700, 2), ('disabled', fake, False, 700, 1))))
        providers.apply()
        providers.activate('decision.inhouse', target='b')
        providers.apply()
        live = decision.get_decision(cfg.get_settings(), 'layout.pick')
        assert [t['id'] for t in live.targets] == ['b'] and live.model == 'clef-other'
        assert by_id(providers)['decision.inhouse']['selected_target'] == 'b'
        with pytest.raises(ProviderInputError):
            providers.activate('decision.inhouse', target='disabled')
        other.systemone_fail = 503
        with pytest.raises(Exception) as caught:
            live.ask(stage='test:single', state='x', questions={'q': {'type': 'noul', 'instructions': 'y'}})
        assert caught.value.code == 'upstream_error' and not fake.posts('/v1/systemone')
        providers.activate('decision.inhouse', target='a')
        assert decision.get_decision(cfg.get_settings(), 'layout.pick').model == 'clef-test'
    finally:
        other.close()
