"""Admin 레이아웃 관리 → 입력 · 흐름 · 입력 소스 API (temporary registries; no model)."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from admin.layout_library import layout_library_router
from admin.store import Store
from app.api import layout_flows as flows

F = 'L_MI01'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('WINMATE_LAYOUT_FLOWS', str(tmp_path / 'flows.json'))
    monkeypatch.setenv('WINMATE_LAYOUT_LIBRARY', str(tmp_path / 'library.json'))
    flows._base_cached.cache_clear()
    store = Store(tmp_path / 'admin')
    app = FastAPI()
    app.include_router(layout_library_router(lambda: store, lambda: 'tester'))
    return TestClient(app), store


def test_detail_carries_the_flow_and_sources_route_is_not_a_layout(client):
    http, _ = client
    detail = http.get('/api/layout-library/' + F).json()
    assert detail['flow']['kind'] == 'market' and detail['flow']['flow']['nodes'][0]['module'] == 'collect'
    sources = http.get('/api/layout-library/sources').json()
    assert sources['rev'] == 0 and any(s['key'] == 'product_ids' for s in sources['sources'])
    assert sources['always'] == ['requirement_summary', 'part_directive']


def test_flow_edit_round_trip_with_conflict_and_reset(client):
    http, store = client
    view = http.get(f'/api/layout-library/{F}/flow').json()
    flow = view['flow']
    write = next(n for n in flow['nodes'] if n['module'] == 'write')
    write['prompt'] = '연평균 성장률을 제목으로'
    assert http.put(f'/api/layout-library/{F}/flow', json={'rev': view['rev'], 'flow': flow}).status_code == 422   # unconfirmed
    saved = http.put(f'/api/layout-library/{F}/flow', json={'rev': view['rev'], 'flow': flow, 'confirmed': True}).json()
    assert saved['edited'] and saved['rev'] == 1
    assert next(n for n in saved['flow']['nodes'] if n['module'] == 'write')['prompt'] == '연평균 성장률을 제목으로'
    stale = http.put(f'/api/layout-library/{F}/flow', json={'rev': 0, 'flow': flow, 'confirmed': True})
    assert stale.status_code == 409
    bad = http.put(f'/api/layout-library/{F}/flow', json={'rev': 1, 'flow': {'inputs': [], 'nodes': [{'module': 'agent'}]}, 'confirmed': True})
    assert bad.status_code == 422 and '프롬프트' in bad.json()['detail']
    reset = http.request('DELETE', f'/api/layout-library/{F}/flow', json={'rev': 1, 'confirmed': True}).json()
    assert not reset['edited'] and reset['rev'] == 2
    assert http.get('/api/layout-library/NOPE/flow').status_code == 404
    events = {r['action'] for r in store.rows("SELECT action FROM events WHERE actor='tester'")}
    assert {'layout-flow.update', 'layout-flow.reset'} <= events


def test_sources_save_adds_custom_source(client):
    http, _ = client
    data = http.get('/api/layout-library/sources').json()
    rows = data['sources'] + [{'key': 'store_count', 'label': '매장 수', 'type': 'string', 'group': 'extract', 'supply': 'external', 'desc': '가맹 · 직영 매장 수'}]
    saved = http.put('/api/layout-library/sources', json={'rev': 0, 'sources': rows, 'confirmed': True}).json()
    assert saved['rev'] == 1 and any(s['key'] == 'store_count' and not s['base'] for s in saved['sources'])
    dup = http.put('/api/layout-library/sources', json={'rev': 1, 'sources': rows + rows[-1:], 'confirmed': True})
    assert dup.status_code == 422
