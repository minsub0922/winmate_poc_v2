"""데이터 소스 브라우저 · 자원 앱 사용(on/off) — 격리 저장소와 임시 on/off 파일로만 시험한다(실제 사이트 · 모델 호출 없음)."""
from dataclasses import dataclass, field
from io import BytesIO
import json
from urllib.parse import quote

from fastapi.testclient import TestClient
import httpx
import pytest
from PIL import Image

from admin import server, source_browser
from admin.service import Service
from app.api import resource_switches as switches
from app.api.auth import Auth, AuthConfig


@pytest.fixture(autouse=True)
def switch_file(tmp_path, monkeypatch):
    path = tmp_path / 'resource_switches.json'
    monkeypatch.setenv('WINMATE_RESOURCE_SWITCHES', str(path))
    return path


@pytest.fixture
def client(tmp_path, monkeypatch):
    svc = Service(tmp_path / 'state')
    auth = Auth(AuthConfig(auth_dir=tmp_path / 'auth'))
    auth.set_credentials('admin', 'isolated-test-password')
    monkeypatch.setattr(server, 'store', svc.store)
    monkeypatch.setattr(server, 'service', svc)
    monkeypatch.setattr(server.winmate.state, 'auth', auth)
    token, _ = auth.issue_token()
    svc.store.upsert_assets([
        {'id': 'product:qm55c', 'external_id': 'qm55c', 'source_id': 'samsung', 'kind': 'product', 'title': '스마트 사이니지 QM55C',
         'url': 'https://www.samsung.com/sec/business/smart-signage/qmc-series/LH55QMCEBGCXKR/',
         'payload': {'id': 'qm55c', 'model': 'QM55C', 'th': 'img/prod/t03.json#127', 'cat': 'LCD 사이니지'}},
        {'id': 'product:ec_360_091', 'external_id': 'ec_360_091', 'source_id': 'catalogs', 'kind': 'product', 'title': 'VMHX-E',
         'payload': {'id': 'ec_360_091', 'model': 'LH55VMHEBGBXKR', 'cdir': '360', 'cpage': 54}},
        {'id': 'catalog:131', 'external_id': '131', 'source_id': 'catalogs', 'kind': 'catalog', 'title': '데이코 카탈로그',
         'url': 'https://samsung.aiibook.net/b2b/ecatalog5.php?Dir=131', 'payload': {'dir': '131', 'pages': 88, 'viewer_url': 'https://samsung.aiibook.net/b2b/ecatalog5.php?Dir=131'}},
        {'id': 'category:cat_x', 'external_id': 'cat_x', 'source_id': 'samsung', 'kind': 'category', 'title': '콜드체인',
         'payload': {'list_url': 'https://www.samsung.com/sec/business/Cold_Chain_System/'}},
        {'id': 'solution:vxt', 'external_id': 'vxt', 'source_id': 'media', 'kind': 'solution', 'title': 'VXT', 'payload': {'id': 'vxt'}},
    ])
    with TestClient(server.api) as c:
        c.cookies.set(auth.config.cookie_name, token)
        yield c, svc
    svc.close()


def test_browse_lists_thumbnails_origins_and_counts(client):
    c, _ = client
    d = c.get('/api/sources/samsung/browse').json()
    assert d['counts'] == {'all': 2, 'switchable': 1, 'off': 0}
    assert [k['kind'] for k in d['kinds']] == ['product', 'category']
    product = next(i for i in d['items'] if i['id'] == 'product:qm55c')
    assert product['thumb'] == {'type': 'image', 'src': '/admin/api/asset-thumb?id=product%3Aqm55c', 'key': 'img/prod/t03.json#127'}
    assert product['origin']['type'] == 'link' and product['origin']['host'] == 'samsung.com'
    assert product['switchable'] and not product['off']
    category = next(i for i in d['items'] if i['id'] == 'category:cat_x')
    assert not category['switchable'] and category['origin']['href'].startswith('https://www.samsung.com/')
    # e-카탈로그 제품의 출처는 카탈로그의 그 쪽 — PDF 보기로 연다
    e = c.get('/api/sources/catalogs/browse?kind=product').json()['items'][0]
    assert e['origin']['type'] == 'catalog' and (e['origin']['dir'], e['origin']['page']) == ('360', 54)
    cat = c.get('/api/sources/catalogs/browse?kind=catalog').json()['items'][0]
    assert cat['thumb']['src'] == 'https://samsung.aiibook.net/b2b/catImage/131/001.jpg' and cat['origin']['pages'] == 88


def test_thumbnail_is_a_small_image_and_cacheable(client):
    c, _ = client
    r = c.get('/api/asset-thumb', params={'id': 'product:qm55c'})
    assert r.status_code == 200 and r.headers['content-type'] == 'image/webp'
    assert r.headers['cache-control'] == 'private, max-age=600'  # 관리자 가드가 no-store 로 덮지 않는다
    assert c.get('/api/asset-thumb', params={'id': 'category:cat_x'}).status_code == 404
    other = c.get('/api/sources/samsung/browse')
    assert other.headers['cache-control'] == 'no-store'


def test_switches_reach_registry_bootstrap_and_listing(client, switch_file):
    c, svc = client
    r = c.put('/api/resource-switches', json={'ids': ['product:qm55c', 'solution:vxt'], 'on': False})
    assert r.status_code == 200 and sorted(r.json()['changed']) == ['product:qm55c', 'solution:vxt']
    state = json.loads(switch_file.read_text())
    assert state['rev'] == 1 and state['off']['product:qm55c']['title'] == '스마트 사이니지 QM55C'
    assert switches.public() == {'rev': 1, 'off': {'product': ['qm55c'], 'solution': ['vxt']}}
    off = c.get('/api/sources/samsung/browse?state=off').json()
    assert [i['id'] for i in off['items']] == ['product:qm55c'] and off['counts']['off'] == 1 and off['items'][0]['off_by'] == 'admin'
    assert c.get('/api/sources/samsung/browse?state=on').json()['total'] == 0  # 분류는 켜고 끄는 대상이 아니다
    assert [s['off_count'] for s in c.get('/api/overview').json()['sources'] if s['id'] == 'samsung'] == [1]
    assert svc.store.one("SELECT action FROM events WHERE action='resource.off'")
    # 같은 상태로 다시 보내면 바뀐 것이 없다 · 다시 켜면 빠진다
    assert c.put('/api/resource-switches', json={'ids': ['product:qm55c'], 'on': False}).json()['changed'] == []
    assert c.put('/api/resource-switches', json={'ids': ['product:qm55c'], 'on': True}).json()['changed'] == ['product:qm55c']
    assert switches.off_refs('product') == set()


def test_switch_rejects_unknown_and_unswitchable(client):
    c, _ = client
    assert c.put('/api/resource-switches', json={'ids': ['category:cat_x'], 'on': False}).status_code == 422
    assert c.put('/api/resource-switches', json={'ids': ['product:nope'], 'on': False}).status_code == 404
    assert c.put('/api/resource-switches', json={'ids': [], 'on': False}).status_code == 422


def test_filtered_bulk_switch(client):
    c, _ = client
    r = c.put('/api/sources/catalogs/switches', json={'on': False, 'kind': 'product'})
    assert r.json()['changed'] == ['product:ec_360_091']
    assert c.put('/api/sources/catalogs/switches', json={'on': False, 'kind': 'catalog'}).status_code == 422
    assert c.put('/api/sources/catalogs/switches', json={'on': True, 'state': 'off'}).json()['changed'] == ['product:ec_360_091']


def test_detail_has_origins_fields_and_off_meta(client):
    c, _ = client
    c.put('/api/resource-switches', json={'ids': ['product:ec_360_091'], 'on': False})
    d = c.get('/api/source-items/product:ec_360_091').json()
    assert d['off'] and d['off_meta']['by'] == 'admin'
    assert d['origins'][0]['type'] == 'catalog' and d['origins'][0]['href'] == 'https://samsung.aiibook.net/b2b/ecatalog5.php?Dir=360&start=54'
    assert {'label': '모델', 'value': 'LH55VMHEBGBXKR'} in d['fields']
    assert c.get('/api/source-items/product:none').status_code == 404


def test_packed_photo_is_searchable_by_layout_and_resolves_to_the_real_image(client):
    from admin.inventory import sync_composer_images
    c, svc = client
    assert sync_composer_images(svc.store) > 0
    assert sync_composer_images(svc.store) == 0
    query = {'kind': 'image', 'q': 'L_VS_CASE'}
    found = c.get('/api/sources/images/browse', params=query).json()
    row = next(r for r in found['items'] if r['ref'].startswith('composer/img/media/'))
    src = row['ref'].removeprefix('composer/')
    assert row['thumb']['key'] == src
    detail = c.get('/api/source-items/' + quote(row['id'], safe=''), params={'q': query['q']}).json()
    assert detail['metadata']['indexed']
    assert {'label': '사용 레이아웃', 'values': ['L_VS_CASE']} in detail['metadata']['matches']
    thumb = c.get('/api/asset-thumb', params={'id': row['id']})
    assert thumb.status_code == 200
    with Image.open(BytesIO(thumb.content)) as image:
        image.verify()
    assert c.put('/api/resource-switches', json={'ids': [row['id']], 'on': False}).status_code == 200
    assert src in switches.image_refs()[1]


def test_existing_inventory_receives_new_spatial_and_building_presets(tmp_path):
    from admin.inventory import sync_spatial_assets
    from admin.store import Store
    root = tmp_path / 'repo'
    data = root / 'app/data/spatial'
    data.mkdir(parents=True)
    source = data / 'library.json'
    source.write_text(json.dumps({'sourceHash': 'abcd1234', 'templates': [{'id': 'shared', 'name': '최초'}]}))
    (data / 'building-presets.json').write_text(json.dumps({'version': '1', 'presets': [{'id': 'tower', 'title': '건물'}]}))
    store = Store(tmp_path / 'admin')
    sync_spatial_assets(store, root)
    assert store.one("SELECT title FROM assets WHERE external_id='buildings/tower'")['title'] == '건물'
    with store.db() as db:
        db.execute("UPDATE assets SET payload=json_set(payload,'$.admin_tags','검토') WHERE external_id='templates/shared'")
    source.write_text(json.dumps({'sourceHash': 'abcd2345', 'templates': [{'id': 'shared', 'name': '갱신'}, {'id': 'new', 'name': '추가'}]}))
    sync_spatial_assets(store, root)
    row = store.one("SELECT title,payload FROM assets WHERE external_id='templates/shared'")
    assert row['title'] == '갱신' and json.loads(row['payload'])['admin_tags'] == '검토'
    assert store.one("SELECT title FROM assets WHERE external_id='templates/new'")


def test_catalog_viewer_links_become_catalog_pages():
    o = source_browser.link_origin('https://samsung.aiibook.net/b2b/access/ecatalogt.php?catimage=&start=6&callmode=&eclang=ko&Dir=236')
    assert (o['type'], o['dir'], o['page'], o['ns']) == ('catalog', '236', 6, 'b2b')
    assert source_browser.link_origin('http://insecure.example/x') is None
    assert source_browser.link_origin('https://www.samsung.com/sec/business/')['type'] == 'link'


def test_pdf_proxy_only_allowed_hosts_and_forwards_range(client, monkeypatch):
    c, _ = client
    assert c.get('/api/pdf', params={'url': 'https://evil.example/a.pdf'}).status_code == 422
    assert c.get('/api/pdf', params={'url': 'https://samsung.aiibook.net/b2b/catImage/360/x.html'}).status_code == 422
    seen = {}

    def upstream(request):
        seen['range'] = request.headers.get('range')
        return httpx.Response(206, headers={'content-type': 'application/pdf', 'accept-ranges': 'bytes', 'content-range': 'bytes 0-3/100', 'content-length': '4'}, stream=httpx.ByteStream(b'%PDF'))
    monkeypatch.setattr(source_browser, '_PDF_CLIENT', httpx.AsyncClient(transport=httpx.MockTransport(upstream)))
    r = c.get('/api/pdf', params={'url': 'https://samsung.aiibook.net/b2b/catImage/360/business.pdf'}, headers={'Range': 'bytes=0-3'})
    assert r.status_code == 206 and r.content == b'%PDF' and seen['range'] == 'bytes=0-3'
    assert r.headers['content-range'] == 'bytes 0-3/100' and r.headers['accept-ranges'] == 'bytes'
    assert c.get('/api/pdf', params={'url': 'https://samsung.aiibook.net/b2b/catImage/360/business.pdf'}, headers={'Range': 'items=1'}).status_code == 416
    monkeypatch.setattr(source_browser, '_PDF_CLIENT', None)


def test_catalog_pdf_found_from_viewer_page_and_remembered(client, monkeypatch):
    c, _ = client
    calls = []

    def fake_get(url, **kw):
        calls.append(url)
        return httpx.Response(200, text='<a href="./catImage/131/dacor_catalogue.pdf" download title="다운로드">', request=httpx.Request('GET', url))
    monkeypatch.setattr(source_browser.httpx, 'get', fake_get)
    first = c.get('/api/catalog-pdf', params={'dir': '131'}).json()
    assert first['url'] == 'https://samsung.aiibook.net/b2b/catImage/131/dacor_catalogue.pdf'
    assert c.get('/api/catalog-pdf', params={'dir': '131'}).json()['url'] == first['url'] and len(calls) == 1
    assert c.get('/api/catalog-pdf', params={'dir': '../etc'}).status_code == 422


@dataclass
class FakeBundle:
    catalog: dict
    hidden_layouts: dict
    scenarios: dict
    manifest: dict = field(default_factory=dict)


def test_kb_overlay_marks_off_rows_and_retires_layouts():
    switches.apply([{'id': i} for i in ['product:a', 'solution:s1', 'case:7', 'layout:L_X', 'scenario:bs1']], False)
    b = FakeBundle({'products': [{'id': 'a'}, {'id': 'b'}], 'curated_product_ids': ['a', 'b'], 'solutions': [{'id': 's1'}, {'id': 's2'}],
                    'cases': [{'id': 7}, {'id': 8}], 'layouts': [{'f': 'L_X'}, {'f': 'L_Y'}]}, {'L_X': {'f': 'L_X'}}, {'SCENARIOS': [{'id': 'bs1'}, {'id': 'bs2'}]})
    o = switches.overlay_bundle(b)
    assert o.catalog['curated_product_ids'] == ['b']
    assert [p['id'] for p in switches.live(o.catalog['products'])] == ['b'] and len(o.catalog['products']) == 2
    assert [s['id'] for s in switches.live(o.catalog['solutions'])] == ['s2']
    assert [c['id'] for c in switches.live(o.catalog['cases'])] == [8]
    assert o.catalog['layouts'][0]['retired'] == 'removed' and o.hidden_layouts['L_X']['removed'] is True
    assert [s['id'] for s in switches.live(o.scenarios['SCENARIOS'])] == ['bs2']
    assert o.manifest['resource_switch_rev'] == 1
    assert b.catalog['products'][0] == {'id': 'a'}  # 원본 묶음은 그대로
    switches.apply([{'id': 'product:a'}], True)
    assert switches.off_refs('product') == set() and switches.revision() == 2
