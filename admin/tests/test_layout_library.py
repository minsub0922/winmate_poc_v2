"""Live sheet management: persistence, concurrency, agent policies and examples.

Every write uses a temporary live-registry file. No model responses are simulated.
"""
from concurrent.futures import ThreadPoolExecutor
import copy
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from admin.layout_library import layout_library_router, sample_html
from admin.composition_layouts import inventory
from admin.layout_presets import layout_library
from admin.store import Store
from app.api import layout_library as live

F = 'L_C01'


@pytest.fixture
def registry(tmp_path, monkeypatch):
    target = tmp_path / 'live/layouts.json'
    monkeypatch.setenv('WINMATE_LAYOUT_LIBRARY', str(target))
    return target


@pytest.fixture
def http(registry, tmp_path):
    store = Store(tmp_path / 'admin')
    app = FastAPI()
    app.include_router(layout_library_router(lambda: store, lambda: 'tester'))
    return TestClient(app), store


def body(**extra):
    return {'rev': live.load()['rev'], 'confirmed': True, 'meta': {}, 't': {}, 'img': {}, 'modes': {}, 'fill': 'inherit', **extra}


def test_inventory_contains_live_retired_and_hidden_without_duplicates(http):
    client, _ = http
    value = client.get('/api/layout-library').json()
    catalog, metas, _ = inventory(live.ROOT)
    assert len(value['items']) == len(metas)
    assert len({m['f'] for m in value['items']}) == len(metas)
    assert any(m.get('hidden') for m in value['items'])
    assert any(m.get('variantOf') for m in value['items'])
    assert any(m.get('retired') for m in value['items'])
    assert value['parts'] and value['modes']['ai'] == 'AI 작성'


def test_detail_and_real_examples(http):
    client, _ = http
    value = client.get('/api/layout-library/' + F).json()
    assert value['slots'] and value['base_slots'] and value['examples']
    assert 'sandbox' not in value['html']  # sheet content, not an interactive app
    assert "script-src 'none'" in value['preview']
    example = value['examples'][0]
    response = client.get(f'/api/layout-library/{F}/examples/{example["scenario"]}/{example["page"]}/preview')
    assert response.status_code == 200
    fills = live.read(live.ROOT / 'app/data/runtime/kb/layout_examples.json.gz')['fills'][example['scenario']]
    text = next(v for v in fills[example['page']]['t'].values() if isinstance(v, str) and len(v) > 12)
    from html import unescape
    assert text.replace('\n', '<br>') in unescape(response.json()['html'])
    assert client.get(f'/api/layout-library/{F}/examples/missing/0/preview').status_code == 404
    assert client.get('/api/layout-library/not-a-layout').status_code == 404


def test_confirmed_save_updates_app_and_records_actor(http, registry):
    client, store = http
    response = client.put('/api/layout-library/' + F, json=body(meta={'name': '관리자가 바꾼 표지'}, t={'3': '실제 반영한 문구 <고정>'}, modes={'t': {'3': 'fixed', '1': 'ai'}}, fill='slots'))
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['rev'] == 1 and result['layout']['name'] == '관리자가 바꾼 표지'
    slots = {(s['kind'], s['id']): s for s in result['slots']}
    assert slots['t', '3']['value'] == '실제 반영한 문구 <고정>' and slots['t', '3']['mode'] == 'fixed'
    assert slots['t', '1']['mode'] == 'ai'
    assert live.public()['items'][F]['meta']['name'] == '관리자가 바꾼 표지'
    assert json.loads(registry.read_text())['items'][F]['updated_by'] == 'tester'
    assert store.one("SELECT actor FROM events WHERE action='layout-library.update'")['actor'] == 'tester'
    assert next(m for m in layout_library()['layouts'] if m['f'] == F)['name'] == '관리자가 바꾼 표지'
    # The generated source stays reproducible; it was not overwritten by admin.
    assert live.base()[1][F]['name'] != '관리자가 바꾼 표지'


def test_image_placeholder_with_both_ids_is_editable_as_image(http):
    client, _ = http
    response = client.put('/api/layout-library/' + F, json=body(img={'0': 'img/ph/of-meeting.jpg'}, modes={'img': {'0': 'fixed'}}))
    assert response.status_code == 200, response.text
    value = response.json()
    assert not any(s['kind'] == 't' and s['id'] == '0' for s in value['slots'])
    image = next(s for s in value['slots'] if s['kind'] == 'img' and s['id'] == '0')
    assert image['value'] == 'img/ph/of-meeting.jpg' and image['mode'] == 'fixed'
    assert 'img/ph/of-meeting.jpg' in value['html']
    assert '/admin/api/asset-resources/' in value['preview']


def test_sample_image_preserves_actual_crop_and_replaces_old_pid():
    h = live.base()[2][F]
    value = sample_html(h, {'img': {'0': {'src': 'img/ph/of-meeting.jpg', 'fit': 'cover', 'pos': '40% 30%', 'keep': True}}})
    image = next(n for n in live.nodes(value) if n['tag'] == 'img')
    assert image['attrs']['src'] == 'img/ph/of-meeting.jpg'
    assert 'object-fit:cover' in image['attrs']['style']
    assert 'object-position:40% 30%' in image['attrs']['style']
    assert 'data-pid' not in image['attrs']


@pytest.mark.parametrize('extra', [
    {'confirmed': False}, {'t': {'99999': 'no such slot'}}, {'modes': {'t': {'3': 'unknown'}}},
    {'modes': {'img': {'not-a-slot': 'fixed'}}}, {'meta': {'f': 'L_NEW'}}, {'meta': {'p': 'not-a-part'}},
    {'fill': 'sometimes'}, {'img': {'0': 'javascript:alert(1)'}}, {'img': {'0': '/img/../credentials.json'}},
])
def test_bad_edits_cannot_change_live_registry(http, extra):
    client, _ = http
    result = client.put('/api/layout-library/' + F, json=body(**extra))
    assert result.status_code == 422, result.text
    assert live.load()['rev'] == 0


def test_revision_prevents_lost_updates_and_delete_requires_confirmation(http):
    client, _ = http
    assert client.put('/api/layout-library/' + F, json=body(meta={'name': '첫 수정'})).status_code == 200
    stale = body(meta={'name': '덮어쓰기'}, rev=0)
    assert client.put('/api/layout-library/' + F, json=stale).status_code == 409
    assert client.request('DELETE', '/api/layout-library/' + F, json={'rev': 1}).status_code == 422
    assert live.load()['items'][F]['meta']['name'] == '첫 수정'
    response = client.request('DELETE', '/api/layout-library/' + F, json={'rev': 1, 'confirmed': True})
    assert response.status_code == 409  # the default cover is referenced by a composition
    f = next(m['f'] for m in client.get('/api/layout-library').json()['items']
             if not m['protected'] and not m.get('retired') and not m.get('hidden') and not m.get('variantOf'))
    response = client.request('DELETE', '/api/layout-library/' + f, json={'rev': 1, 'confirmed': True})
    assert response.status_code == 200
    assert f not in {m['f'] for m in layout_library()['layouts']}
    detail = client.get('/api/layout-library/' + f).json()
    assert detail['layout']['removed'] and detail['preview']  # saved proposals remain renderable
    assert client.put('/api/layout-library/' + f, json=body()).status_code == 409


def test_parallel_writes_are_atomic(registry):
    def write(n):
        try:
            live.save('L_TEST_' + str(n), {'t': {'0': str(n)}}, 0)
            return 'saved'
        except live.Conflict:
            return 'conflict'
    with ThreadPoolExecutor(4) as pool:
        outcomes = list(pool.map(write, range(4)))
    assert outcomes.count('saved') == 1
    assert outcomes.count('conflict') == 3
    assert live.load()['rev'] == 1 and len(live.load()['items']) == 1


def test_corrupt_live_file_does_not_silently_restore_defaults(registry):
    registry.parent.mkdir(parents=True)
    registry.write_text('{broken')
    with pytest.raises(ValueError):
        live.load()


def test_backend_kb_policies_refresh_without_restart(http):
    from app.api.poc import knowledge
    client, _ = http
    previous = knowledge.bundle()
    response = client.put('/api/layout-library/' + F, json=body(t={'3': '서버 공통 고정 값'}, modes={'t': {'3': 'fixed', '1': 'ai'}}, fill='slots'))
    assert response.status_code == 200, response.text
    current = knowledge.bundle()
    assert current is not previous
    actual = {(s['kind'], s['id']): s for s in live.slots(current.html[F])}
    assert actual['t', '3']['value'] == '서버 공통 고정 값' and actual['t', '3']['mode'] == 'fixed'
    assert actual['t', '1']['mode'] == 'ai'
    assert current.manifest['layout_library_rev'] == 1


def test_composer_reads_live_modes_and_protects_fixed_output(http):
    from app.api.poc.adapters.compose import _composer, _auto
    client, _ = http
    _, library, _, _ = _composer()
    auto = _auto()
    response = client.put('/api/layout-library/' + F, json=body(t={'3': '자동완성 고정 문구'}, modes={'t': {'3': 'fixed', '1': 'ai'}, 'img': {'0': 'fixed'}}, fill='slots'))
    assert response.status_code == 200, response.text
    meta = library.load()['layouts'][F]
    assert meta['modes']['t']['1'] == 'ai'
    # Start with an inherited whole-sheet lock: the explicit AI slot must be free.
    sheet = {'f': F, 'kind': 'cover', 'fixed': True, 't': {'3': '다른 결과'}, 'ex_t': {}, 'img': {}, 'ex_img': {}}
    plans = {str(p['i']): p for p in auto.slot_plan({}, sheet)}
    assert 'lock' not in plans['1'] and plans['1']['mode'] == 'ai'
    assert plans['3']['lock'] == '자동완성 고정 문구'
    output = auto._layout_out(sheet)
    assert output['ov']['t']['3'] == '자동완성 고정 문구'
    assert '0' in output['ov']['img']
    from composer import fill, pipeline
    # The older two-step completion path has its own writer; it follows the same policy.
    requested = {str(s['i']) for s in fill.text_slots({'f': F}, {})}
    assert '1' in requested and '3' not in requested
    legacy = pipeline.to_app_parts([{'slides': [{'f': F, 't': {'3': '다른 결과'}}]}])
    assert legacy[0]['layouts'][0]['ov']['t']['3'] == '자동완성 고정 문구'
    # A second revision is seen by the same imported composer modules.
    assert client.put('/api/layout-library/' + F, json=body(meta={'name': '자동완성 최신 이름'})).status_code == 200
    assert library.load()['layouts'][F]['name'] == '자동완성 최신 이름'


def test_delete_representative_retires_candidates(registry):
    catalog, layouts, html = live.base()
    representative = next(m for m in layouts.values() if len(m.get('variants', [])) > 1 and not m.get('retired'))
    live.save(representative['f'], {'deleted': True}, 0)
    expanded = live.effective_items(live.load(), layouts)
    assert all(expanded[m['f']]['deleted'] for m in representative['variants'])
    assert all(m['f'] in html for m in representative['variants'])


def test_variant_policy_is_shared_atomically_but_content_stays_specific(http):
    client, _ = http
    _, layouts, html = live.base()
    representative = next(m for m in layouts.values() if len(m.get('variants', [])) > 1 and not m.get('retired'))
    f = representative['f']
    text = next(s for s in live.slots(html[f]) if s['kind'] == 't')
    i = text['id']
    response = client.put('/api/layout-library/' + f, json=body(t={i: '대표에만 고정한 기본 문구'}, modes={'t': {i: 'fixed'}}, fill='slots'))
    assert response.status_code == 200, response.text
    state = live.load()
    assert state['rev'] == 1
    for member in representative['variants']:
        item = state['items'][member['f']]
        assert item['modes']['t'][i] == 'fixed' and item['fill'] == 'slots'
        if member['f'] != f:
            assert i not in item.get('t', {})
    sibling = next(m['f'] for m in representative['variants'] if m['f'] != f)
    response = client.put('/api/layout-library/' + sibling, json=body(modes={'t': {i: 'ai'}}, fill='slots'))
    assert response.status_code == 200, response.text
    state = live.load()
    assert state['items'][f]['modes']['t'][i] == 'ai'
    assert state['items'][f]['t'][i] == '대표에만 고정한 기본 문구'
