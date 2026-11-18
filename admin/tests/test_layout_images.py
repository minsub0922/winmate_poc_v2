"""레이아웃 관리 상세 → 이미지 칸: 관련 이미지 · 검색 · 썸네일 · 바꾼 이미지 미리보기 · 저장 (admin/layout_images.py; temporary registries)."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from admin.layout_library import layout_library_router
from admin.store import Store
from app.api import layout_flows as flows, layout_library as live

F = 'L_VP_H'


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('WINMATE_LAYOUT_FLOWS', str(tmp_path / 'flows.json'))
    monkeypatch.setenv('WINMATE_LAYOUT_LIBRARY', str(tmp_path / 'library.json'))
    flows._base_cached.cache_clear()
    store = Store(tmp_path / 'admin')
    app = FastAPI()
    app.include_router(layout_library_router(lambda: store, lambda: 'tester'))
    return TestClient(app)


def first_image(http):
    detail = http.get('/api/layout-library/' + F).json()
    return detail, next(s for s in detail['base_slots'] if s['kind'] == 'img' and '.json#' in s['value'])


def test_related_images_put_the_same_slot_and_kind_first(client):
    detail, slot = first_image(client)
    r = client.get(f"/api/layout-library/{F}/images/{slot['id']}", params={'src': slot['value'], 'ratio': 1.6}).json()
    assert r['current']['src'] == slot['value'] and r['total'] > 20 and len(r['items']) == r['page']
    assert slot['value'] not in {x['src'] for x in r['items']}
    assert r['items'][0]['why'], 'the best match says why it is related'
    more = client.get(f"/api/layout-library/{F}/images/{slot['id']}", params={'src': slot['value'], 'ratio': 1.6, 'offset': r['page']}).json()
    assert not {x['src'] for x in more['items']} & {x['src'] for x in r['items']}
    found = client.get(f"/api/layout-library/{F}/images/{slot['id']}", params={'src': slot['value'], 'q': '메뉴보드'}).json()
    assert 0 < found['total'] < r['total'] and '메뉴보드' in found['items'][0]['desc']


def test_thumbnails_read_only_library_images_and_resource_images(client):
    _, slot = first_image(client)
    ok = client.get(f'/api/layout-library/{F}/images/file', params={'src': slot['value']})
    assert ok.status_code == 200 and ok.headers['content-type'].startswith('image/')
    icon = client.get(f'/api/layout-library/{F}/images/file', params={'src': '/assets/toc/icons/s_stp.aisave.comfort.on.png'})
    assert icon.status_code == 200
    for bad in ('app/data/runtime/composer/library.json', '../app/.env', 'https://example.com/a.png', 'app/data/runtime/auth/users.json'):
        assert client.get(f'/api/layout-library/{F}/images/file', params={'src': bad}).status_code in (404, 422), bad


def test_picked_image_previews_then_saves_for_the_app(client):
    detail, slot = first_image(client)
    other = client.get(f"/api/layout-library/{F}/images/{slot['id']}", params={'src': slot['value']}).json()['items'][0]['src']
    draft = {'meta': {}, 't': {}, 'img': {slot['id']: other}, 'modes': {'t': {}, 'img': {}}, 'fill': 'inherit'}
    preview = client.post(f'/api/layout-library/{F}/draft-preview', json={**draft, 'confirmed': True})
    assert preview.status_code == 200 and 'data:image/' in preview.json()['html']
    assert live.load()['items'].get(F) is None, 'a preview stores nothing'
    saved = client.put('/api/layout-library/' + F, json={**draft, 'rev': detail['rev'], 'confirmed': True})
    assert saved.status_code == 200, saved.text
    assert saved.json()['edits']['img'] == {slot['id']: other}
    assert next(s for s in live.slots(saved.json()['html']) if s['kind'] == 'img' and s['id'] == slot['id'])['value'] == other
