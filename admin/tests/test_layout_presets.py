"""레이아웃 구성 관리: 운영 값 저장 형식 · 관리자 API · 앱 bootstrap 반영 · 레이아웃 미리보기.

운영 값 파일은 시험마다 임시 경로(``WINMATE_LAYOUT_PRESETS``)를 쓴다 — 실제 앱이 읽는 파일을 건드리지 않는다.
"""
import json
import re

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from admin.layout_presets import layout_index, layout_presets_router
from admin.store import Store
from app.api import layout_presets as presets


@pytest.fixture
def file(tmp_path, monkeypatch):
    target = tmp_path / 'presets' / 'layout_presets.json'
    monkeypatch.setenv('WINMATE_LAYOUT_PRESETS', str(target))
    return target


@pytest.fixture
def client(tmp_path, file):
    store = Store(tmp_path / 'admin')
    app = FastAPI()
    app.include_router(layout_presets_router(lambda: store, lambda: 'tester'))
    return TestClient(app), store


def test_empty_until_saved(file):
    assert presets.load() == {'v': 1, 'rev': 0, 'fixed': None, 'order': [], 'items': {}, 'parts': {}, 'templates': {}, 'updated_at': None, 'updated_by': None}
    assert presets.public() == {'v': 1, 'rev': 0, 'fixed': None, 'order': [], 'items': {}, 'parts': {}, 'templates': {}}
    assert not file.exists()


def test_clean_keeps_only_overrides():
    value = presets.clean({'fixed': 'roi', 'order': ['roi', 'std'], 'unknown': 1, 'items': {
        'std': {'enabled': True, 'name': '  표준   제안서 A ', 'badge': '대표', 'desc': None},  # 배지는 없앤 값(2026-11-16) — 받아도 버린다
        'pain': {'enabled': False, 'hint': ' 현장 과제 ', 'related': ['bs07', 'bs07', 'bs_v_ai_store_2'], 'extra': 'x'},
        'build': {}}})
    assert value == {'fixed': 'roi', 'order': ['roi', 'std'], 'items': {
        'std': {'name': '표준 제안서 A'}, 'pain': {'enabled': False, 'hint': '현장 과제', 'related': ['bs07', 'bs_v_ai_store_2']}}, 'parts': {}, 'templates': {}}
    assert presets.clean({}) == {'fixed': None, 'order': [], 'items': {}, 'parts': {}, 'templates': {}}
    assert presets.clean({'items': {'roi': {'related': []}}})['items'] == {'roi': {'related': []}}  # 연결 샘플을 모두 푼 것도 바꾼 값


@pytest.mark.parametrize('body', [
    [], {'fixed': 'Bad id'}, {'fixed': 3}, {'order': 'std'}, {'order': ['std', 'std']}, {'order': ['../x']},
    {'items': []}, {'items': {'std': 'x'}}, {'items': {'STD': {}}}, {'items': {'std': {'enabled': 'no'}}},
    {'items': {'std': {'name': 'x' * 41}}}, {'items': {'std': {'desc': 3}}}, {'items': {'std': {'related': ['a b']}}},
    {'items': {'std': {'related': ['x'] * 61}}}, {'fixed': 'std', 'items': {'std': {'enabled': False}}},
])
def test_clean_rejects_bad_values(body):
    with pytest.raises(ValueError):
        presets.clean(body)


def test_save_reset_and_revision(file):
    first = presets.save({'fixed': 'roi', 'items': {'pain': {'enabled': False}}}, 'kim')
    assert (first['rev'], first['fixed'], first['updated_by']) == (1, 'roi', 'kim')
    assert re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', first['updated_at'])
    assert json.loads(file.read_text(encoding='utf-8'))['items'] == {'pain': {'enabled': False}}
    assert presets.save({'order': ['std']}, 'lee')['rev'] == 2
    assert presets.load()['fixed'] is None and presets.load()['order'] == ['std']
    cleared = presets.reset('lee')
    assert (cleared['rev'], cleared['fixed'], cleared['order'], cleared['items']) == (3, None, [], {})  # rev 는 이어진다
    assert not file.with_name(file.name + '.tmp').exists()


def test_broken_file_falls_back_to_defaults(file):
    file.parent.mkdir(parents=True)
    file.write_text('{"fixed": "std", "items": {"std": {"enabled": false}}, "rev": 9}', encoding='utf-8')  # 스스로 모순인 값
    assert presets.load()['rev'] == 0 and presets.load()['items'] == {}
    file.write_text('not json', encoding='utf-8')
    assert presets.public()['items'] == {}
    assert presets.save({'items': {'roi': {'name': 'ROI'}}})['rev'] == 1


def test_admin_api_saves_and_records_history(client):
    http, store = client
    assert http.get('/api/layout-presets').json()['limits'] == {'name': 40, 'desc': 300, 'hint': 160, 'related': 60}
    saved = http.put('/api/layout-presets', json={'fixed': 'stdx', 'order': ['roi', 'std'], 'items': {'pain': {'enabled': False}, 'roi': {'name': 'ROI 제안서'}}})
    assert saved.status_code == 200
    body = saved.json()['presets']
    assert (body['rev'], body['fixed'], body['updated_by']) == (1, 'stdx', 'tester')
    assert http.get('/api/layout-presets').json()['presets'] == body
    assert presets.public()['items'] == {'pain': {'enabled': False}, 'roi': {'name': 'ROI 제안서'}}
    event = store.one("SELECT actor,action,detail FROM events WHERE action='layout-presets.update'")
    assert event['actor'] == 'tester' and json.loads(event['detail']) == {'rev': 1, 'fixed': 'stdx', 'off': ['pain'], 'edited': ['pain', 'roi'], 'order': ['roi', 'std'],
                                                                           'custom': [], 'parts': []}
    assert http.delete('/api/layout-presets').json()['presets']['items'] == {}
    assert store.one("SELECT count(*) n FROM events WHERE action='layout-presets.reset'")['n'] == 1


def test_admin_api_rejects_bad_input(client):
    http, _ = client
    refused = http.put('/api/layout-presets', json={'fixed': 'std', 'items': {'std': {'enabled': False}}})
    assert refused.status_code == 422 and '기본 구성은 끌 수 없습니다' in refused.json()['detail']
    assert http.put('/api/layout-presets', content=b'{').status_code == 422
    assert http.put('/api/layout-presets', content=b'{"items":{"std":{"desc":"' + b'x' * 300_000 + b'"}}}').status_code == 413
    assert presets.load()['rev'] == 0


def test_app_bootstrap_carries_presets(file):
    """앱은 /api/bootstrap 의 layout_presets 로 받는다 — 누가 · 언제 바꿨는지는 싣지 않는다."""
    from starlette.requests import Request
    from app.api import main
    presets.save({'fixed': 'roi', 'items': {'pain': {'enabled': False}}}, 'kim')
    scope = {'type': 'http', 'method': 'GET', 'path': '/api/bootstrap', 'headers': [], 'query_string': b'', 'app': main.app}
    with TestClient(main.app):  # lifespan: products · auth
        payload = main.bootstrap_payload(Request(scope))
    assert payload['layout_presets'] == {'v': 1, 'rev': 1, 'fixed': 'roi', 'order': [], 'items': {'pain': {'enabled': False}}, 'parts': {}, 'templates': {}}


def test_layout_names_and_preview(client):
    http, _ = client
    index = layout_index()
    if not index:
        pytest.skip('Agent KB 스냅샷(app/data/runtime/kb)이 없습니다.')
    items = http.get('/api/layout-presets/layouts').json()['items']
    assert items['L_TOC_KPI']['code'] == 'TOC-KPI' and items['L_TOC_KPI']['name']
    assert set(items['L_TOC_KPI']) == {'code', 'name', 'when', 'g', 'p'}
    # 에셋 색인(관리 DB)에 없는 레이아웃도 KB 스냅샷에서 바로 미리보기를 만든다 — 이 시험의 관리 DB 는 비어 있다
    preview = http.get('/api/layout-presets/layouts/L_TOC_UAPAIN/preview?thumb=1')
    assert preview.status_code == 200
    html = preview.json()['html']
    assert '<script' not in html and "script-src 'none'" in html
    assert '/admin/api/asset-resources/' not in html
    urls = sorted(set(re.findall(r'/admin/api/layout-presets/layouts/L_TOC_UAPAIN/resource/[0-9a-f]{24}\?thumb=1', html)))
    assert urls
    image = http.get(urls[0].removeprefix('/admin'))
    assert image.status_code == 200 and image.headers['content-type'].startswith('image/') and image.content
    assert http.get(urls[0].removeprefix('/admin').replace('?thumb=1', '')).status_code == 200
    assert http.get('/api/layout-presets/layouts/L_TOC_UAPAIN/resource/' + '0' * 24).status_code == 404
    assert http.get('/api/layout-presets/layouts/NOPE/preview').status_code == 404
    assert http.get('/api/layout-presets/layouts/..%2Fx/preview').status_code == 404


# ---------------- 직접 만든 파트 · 구성 (「구성 추가하기」 — 사용자 지시 2026-11-16) ----------------
PART = {'name': ' 매장   운영 ', 'color': '#0f7a72', 'icon': 'pi-store', 'type': 'scenario', 'sheets': [{'f': 'L_VS_SPACE', 'label': '대표 공간 장면'}, {'f': 'L_VS_NEEDS'}], 'extra': 1}
MINE = {'name': '매장 운영형 제안서', 'badge': '운영 중심', 'desc': '매장 운영을 앞에', 'tocs': ['overview', 'cp_store01', 'space', 'why', 'pspec'], 'extra': 1}


def test_clean_custom_parts_and_templates():
    value = presets.clean({'fixed': 'ct_mine01', 'order': ['ct_mine01', 'std'], 'items': {'ct_mine01': {'enabled': True}},
                           'parts': {'cp_store01': PART}, 'templates': {'ct_mine01': MINE}})
    assert value['parts'] == {'cp_store01': {'name': '매장 운영', 'color': '#0f7a72', 'icon': 'pi-store', 'type': 'scenario',
                                             'sheets': [{'f': 'L_VS_SPACE', 'label': '대표 공간 장면'}, {'f': 'L_VS_NEEDS', 'label': ''}]}}
    assert value['templates'] == {'ct_mine01': {'name': '매장 운영형 제안서', 'tocs': ['overview', 'cp_store01', 'space', 'why', 'pspec'], 'desc': '매장 운영을 앞에'}}  # 이전 배지 값은 버린다
    assert value['fixed'] == 'ct_mine01' and value['order'] == ['ct_mine01', 'std']
    # 구독 솔루션이 있으면 8개까지
    # Spec 은 넣지 않아도 된다 — 넣으면 맨 끝(2026-11-16)
    assert presets.clean({'templates': {'ct_nospec1': {'name': '스펙 없음', 'tocs': ['overview', 'needs', 'why', 'case']}}})['templates']['ct_nospec1']['tocs'] == ['overview', 'needs', 'why', 'case']
    eight = ['overview', 'ua', 'needs', 'space', 'subx', 'sol', 'case', 'pspec']
    assert presets.clean({'templates': {'ct_sub001': {'name': '여덟', 'tocs': eight}}})['templates']['ct_sub001']['tocs'] == eight


@pytest.mark.parametrize('body', [
    {'parts': []}, {'parts': {'store': PART}}, {'parts': {'cp_store01': {**PART, 'name': ''}}}, {'parts': {'cp_store01': {**PART, 'color': 'teal'}}},
    {'parts': {'cp_store01': {**PART, 'icon': 'store'}}}, {'parts': {'cp_store01': {**PART, 'sheets': []}}}, {'parts': {'cp_store01': {**PART, 'sheets': [{'f': '../x'}]}}},
    {'parts': {'cp_store01': {**PART, 'sheets': [{'f': 'L_MI01'}] * 21}}}, {'parts': {'cp_store01': PART, 'cp_store02': PART}},  # 이름이 겹친다
    {'templates': {'mine': MINE}, 'parts': {'cp_store01': PART}}, {'templates': {'ct_mine01': MINE}},  # 없는 파트
    {'templates': {'ct_mine01': {**MINE, 'name': ' '}}, 'parts': {'cp_store01': PART}},
    {'templates': {'ct_short1': {'name': '짧은', 'tocs': ['overview', 'why', 'pspec']}}},
    {'templates': {'ct_specx1': {'name': '스펙 중간', 'tocs': ['overview', 'pspec', 'needs', 'why']}}},
    {'templates': {'ct_dup001': {'name': '겹침', 'tocs': ['overview', 'needs', 'needs', 'pspec']}}},
    {'templates': {'ct_long01': {'name': '여덟', 'tocs': ['overview', 'ua', 'needs', 'space', 'value', 'sol', 'case', 'pspec']}}},  # 구독 솔루션 없이 8개
    {'fixed': 'ct_gone01'},
])
def test_clean_rejects_bad_custom_values(body):
    with pytest.raises(ValueError):
        presets.clean(body)


def test_admin_api_custom_layouts_must_exist(client):
    http, store = client
    if not layout_index():
        pytest.skip('Agent KB 스냅샷(app/data/runtime/kb)이 없습니다.')
    body = {'parts': {'cp_store01': PART}, 'templates': {'ct_mine01': MINE}}
    saved = http.put('/api/layout-presets', json=body)
    assert saved.status_code == 200, saved.text
    assert presets.public()['templates']['ct_mine01']['tocs'][1] == 'cp_store01'
    detail = json.loads(store.one("SELECT detail FROM events WHERE action='layout-presets.update'")['detail'])
    assert detail['custom'] == ['ct_mine01'] and detail['parts'] == ['cp_store01']
    # 직접 만든 값을 모르는 화면이 저장해도(parts · templates 칸 없음) 지워지지 않는다 — 비운 칸을 보내면 지운다
    assert http.put('/api/layout-presets', json={'fixed': 'stdx'}).json()['presets']['templates']['ct_mine01']['name'] == '매장 운영형 제안서'
    assert http.put('/api/layout-presets', json={'parts': {}, 'templates': {}}).json()['presets']['parts'] == {}
    assert http.put('/api/layout-presets', json=body).status_code == 200
    gone = http.put('/api/layout-presets', json={'parts': {'cp_store01': {**PART, 'sheets': [{'f': 'L_NOPE_X'}]}}})
    assert gone.status_code == 422 and 'L_NOPE_X' in gone.json()['detail']
    assert http.delete('/api/layout-presets').json()['presets']['templates'] == {}


def test_layout_library_for_part_builder(client):
    """직접 만드는 파트에 더할 레이아웃 — 은퇴한 장은 빼고, 앱 템플릿 라이브러리의 필터에 쓰는 값을 싣는다."""
    http, _ = client
    if not layout_index():
        pytest.skip('Agent KB 스냅샷(app/data/runtime/kb)이 없습니다.')
    data = http.get('/api/layout-presets/library').json()
    rows = {x['f']: x for x in data['layouts']}
    assert len(rows) > 300 and 'L_TOC_KPI' in rows and 'L_MI01' not in rows  # L_MI01 은 은퇴(사진판으로 바뀜)
    assert {'f', 'code', 'name', 'p'} <= set(rows['L_TOC_KPI'])
    assert data['industries'] and {'code', 'name'} <= set(data['industries'][0])
    assert data['solutions'] and {'id', 'name', 'cat'} <= set(data['solutions'][0])
