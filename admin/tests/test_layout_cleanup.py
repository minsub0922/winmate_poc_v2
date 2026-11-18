"""Deletion safeguards and saved-sheet compatibility, using isolated live files."""
import hashlib
import json
import re

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from admin.composition_layouts import inventory, supplemental
from admin.layout_library import layout_library_router
from admin.layout_presets import layout_presets_router
from admin.store import Store
from app.api import layout_library as live, layout_presets as presets


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('WINMATE_LAYOUT_LIBRARY', str(tmp_path / 'library.json'))
    monkeypatch.setenv('WINMATE_LAYOUT_PRESETS', str(tmp_path / 'presets.json'))
    store = Store(tmp_path / 'admin')
    app = FastAPI()
    app.include_router(layout_library_router(lambda: store, lambda: 'test'))
    app.include_router(layout_presets_router(lambda: store, lambda: 'test'))
    return TestClient(app)


def delete(client, f):
    return client.request('DELETE', '/api/layout-library/' + f, json={'confirmed': True, 'rev': live.load()['rev']})


def custom_part(f):
    return {'parts': {'cp_test': {'name': '보호 확인', 'color': '#1428a0', 'icon': 'pi-box', 'sheets': [{'f': f, 'label': ''}]}},
            'templates': {}, 'items': {}, 'order': [], 'fixed': None}


def test_every_composition_sheet_is_listed_and_protected(client):
    rows = {m['f']: m for m in client.get('/api/layout-library').json()['items']}
    protected = live.protected_layouts()
    assert protected <= rows.keys()
    assert all(rows[f]['protected'] and not rows[f].get('removed') for f in protected)
    extra = {f for f, m in rows.items() if m.get('compositionOnly')}
    assert len(extra) == 111
    assert all(not rows[f].get('hidden') for f in extra)
    for f in ('L_VS_CORE_1', 'L_TOC_INDEX10', next(iter(extra))):
        assert delete(client, f).status_code == 409
        assert live.load()['rev'] == 0
        with pytest.raises(live.Conflict):
            live.save(f, {'deleted': True}, 0)


def test_custom_parts_protect_their_sheets_and_content_parent_immediately(client):
    f = next(m['f'] for m in client.get('/api/layout-library').json()['items']
             if not m['protected'] and not m.get('retired') and not m.get('hidden') and not m.get('variantOf'))
    assert client.put('/api/layout-presets', json=custom_part(f)).status_code == 200
    assert delete(client, f).status_code == 409
    listing = client.get('/api/layout-library').json()
    assert listing['protection_rev'] == 1
    assert next(m for m in listing['items'] if m['f'] == f)['protected']
    _, layouts, _ = live.base()
    parent = next(m for m in layouts.values() if not m.get('retired') and m.get('variants'))
    child = next(v['f'] for v in parent['variants'] if v['f'] != parent['f'])
    presets.save(custom_part(child))
    assert delete(client, parent['f']).status_code == 409
    assert delete(client, child).status_code == 409
    assert live.load()['rev'] == 0


def test_unreadable_composition_references_stop_deletion(client):
    presets.path().write_text('{broken')
    assert delete(client, 'L_C01').status_code == 503
    assert live.load()['rev'] == 0


def test_supplemental_sheets_preview_without_changing_saved_ids(client):
    extras, _ = supplemental(live.ROOT)
    base_ids = set(live.base()[1])
    for prefix in ('L_VS_DSS_', 'L_TOC_UA_', 'L_VS_SPACE_', 'L_TOC_PSPEC_'):
        f = next(f for f in extras if f.startswith(prefix) and f not in base_ids)
        response = client.get('/api/layout-library/' + f)
        assert response.status_code == 200, response.text[:300]
        detail = response.json()
        assert detail['layout']['protected'] and detail['slots'] and detail['preview']
        assert detail['flow'] is None
        assert '@img' not in detail['html']
        image_urls = re.findall(r'/admin/api/layout-presets/layouts/[^"\s]+/resource/[0-9a-f]{24}', detail['preview'])
        assert image_urls
        assert all(client.get(url.removeprefix('/admin')).status_code == 200 for url in set(image_urls))
        preview = client.get('/api/layout-presets/layouts/' + f + '/preview')
        assert preview.status_code == 200
        assert "script-src 'none'" in preview.json()['html']
        assert client.put('/api/layout-library/' + f, json={'confirmed': True, 'rev': 0}).status_code == 409


def test_cleanup_preserves_original_html_and_protected_geometry(client):
    plan = live.read(live.ROOT / 'app/web/src/domain/templates/layout_cleanup_manifest.json')
    _, layouts, html = inventory(live.ROOT)
    assert not set(plan['removed']) & live.protected_layouts()
    for f, item in plan['removed'].items():
        assert layouts[f]['removed'] and layouts[f]['retired']
        assert hashlib.sha256(html[f].encode()).hexdigest() == item['htmlSha256'], f
        if item.get('replacement'):
            assert not layouts[item['replacement']].get('retired')
    assert len(html) == 1113  # all 1,002 prior sheets + the missing 111 composition sheets
    assert all(f in layouts for f in plan['protected'])


def test_agent_inventory_counts_structures_and_accepts_archived_aliases(client):
    from app.api.poc import knowledge
    result = knowledge.verify_bundle(knowledge.bundle())
    assert result['counts_ok']
    assert result['counts']['layouts_active'] == 357
    assert result['errors'] == []
    assert result['warnings'] == []
