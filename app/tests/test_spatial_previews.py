"""Server-rendered 조감도 previews: cache → file → render order, single flight, integrity keys, HTTP caching, auth."""
import asyncio
import copy
from pathlib import Path
import shutil
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from app.api.image_cache import CacheConfig, MemoryCache
from app.api.spatial import SpatialLibrary, SpatialStore, build_router as spatial_router
from app.api.spatial_previews import (RendererConfig, RendererProcess, RendererUnavailable, SpatialPreviews, WORKER,
                                      build_router, scene_digest)

WEBP = b'RIFF\x1a\x00\x00\x00WEBPVP8 fake-preview'


@pytest.fixture(scope='module')
def library():
    return SpatialLibrary()


class FakeRenderer:
    def __init__(self, delay=0.0, fail=False):
        self.calls, self.delay, self.fail = [], delay, fail
        self.backgrounds = []

    async def render(self, revision, scene, *, background=False):
        self.calls.append((revision, scene_digest(scene)))
        self.backgrounds.append(background)
        await asyncio.sleep(self.delay)
        if self.fail:
            raise RendererUnavailable('renderer offline')
        return WEBP + scene_digest(scene).encode()

    async def snapshot(self, revision, scene, options):
        self.calls.append((revision, scene_digest({'scene': scene, 'options': options})))
        await asyncio.sleep(self.delay)
        if self.fail:
            raise RendererUnavailable('renderer offline')
        return {'image': 'data:image/png;base64,aW1hZ2U=', 'anchors': {'width': options['w'], 'height': options['h']}, 'camera': scene.get('camera', {})}

    async def building(self, revision, body):
        self.calls.append((revision, scene_digest(body)))
        await asyncio.sleep(self.delay)
        return {'image': 'data:image/png;base64,aW1hZ2U='}

    async def stop(self):
        pass

    def status(self):
        return {'alive': True}


def service(library, tmp_path, renderer=None, cache=None, **config):
    return SpatialPreviews(library, cache or MemoryCache(CacheConfig()), RendererConfig(directory=tmp_path / 'previews', **config), renderer or FakeRenderer())


def template(library, identifier='cowork-full-standard'):
    return library.scenes[identifier]


def test_render_once_then_cache_then_file(library, tmp_path):
    fake = FakeRenderer()
    previews = service(library, tmp_path, fake)
    scene = template(library)

    async def run():
        first = await previews.image(scene)
        second = await previews.image(scene)
        return first, second
    (first, digest), (second, _) = asyncio.run(run())
    assert first == second and len(fake.calls) == 1 and previews.stats['cache_hits'] == 1
    assert previews.path(scene['assetRevision'], digest).read_bytes() == first
    # A new process (empty L1) reads the durable file instead of rendering again.
    restarted = service(library, tmp_path, FakeRenderer())
    data, _ = asyncio.run(restarted.image(scene))
    assert data == first and restarted.renderer.calls == [] and restarted.stats['file_hits'] == 1


def test_concurrent_requests_share_one_render(library, tmp_path):
    fake = FakeRenderer(delay=.05)
    previews = service(library, tmp_path, fake)

    async def run():
        return await asyncio.gather(*(previews.image(template(library)) for _ in range(8)))
    results = asyncio.run(run())
    assert len(fake.calls) == 1 and len({data for data, _ in results}) == 1


def test_key_is_server_digest_not_client_hash(library, tmp_path):
    previews = service(library, tmp_path)
    original = template(library)
    forged = copy.deepcopy(original)
    forged['rooms'][0]['name'] = '다른 내용'          # same contentHash, different content
    assert forged['contentHash'] == original['contentHash']
    assert previews.identity(forged) != previews.identity(original)
    with pytest.raises(Exception):
        previews.identity({**original, 'assetRevision': '../../etc'})


def test_renderer_failure_is_not_cached(library, tmp_path):
    fake = FakeRenderer(fail=True)
    previews = service(library, tmp_path, fake)
    with pytest.raises(RendererUnavailable):
        asyncio.run(previews.image(template(library)))
    fake.fail = False
    data, _ = asyncio.run(previews.image(template(library)))
    assert data.startswith(WEBP) and len(fake.calls) == 2


def test_prewarm_renders_missing_templates_in_background(library, tmp_path, monkeypatch):
    fake = FakeRenderer()
    previews = service(library, tmp_path, fake)
    subset = dict(list(library.scenes.items())[:3])
    monkeypatch.setattr(previews.library, 'scenes', subset)
    monkeypatch.setattr(asyncio, 'sleep', _no_sleep)
    asyncio.run(previews.prewarm())
    assert previews.prewarm_state == {'state': 'done', 'done': 3, 'total': 3, 'revision': library.library['sourceHash']}
    assert fake.backgrounds == [True, True, True]
    asyncio.run(previews.prewarm())   # files exist: nothing is rendered twice
    assert len(fake.calls) == 3


async def _no_sleep(*_):
    return None


def make_app(library, tmp_path, renderer=None):
    app = FastAPI()
    app.state.spatial_library = library
    app.state.spatial_store = SpatialStore(tmp_path / 'history.sqlite', library)
    app.state.image_cache = MemoryCache(CacheConfig())
    app.state.spatial_previews = service(library, tmp_path, renderer, app.state.image_cache)
    app.state.auth = SimpleNamespace(config=SimpleNamespace(enabled=False))
    app.include_router(build_router())
    app.include_router(spatial_router())
    return app


def test_template_endpoint_is_immutable_with_revision_and_supports_etag(library, tmp_path):
    client = TestClient(make_app(library, tmp_path))
    revision = library.library['sourceHash']
    response = client.get(f'/api/spatial/templates/cowork-full-standard/preview.webp?rev={revision}')
    assert response.status_code == 200 and response.headers['content-type'] == 'image/webp'
    assert response.headers['cache-control'] == 'public, max-age=31536000, immutable'
    again = client.get(f'/api/spatial/templates/cowork-full-standard/preview.webp?rev={revision}', headers={'If-None-Match': response.headers['etag']})
    assert again.status_code == 304
    assert client.get('/api/spatial/templates/cowork-full-standard/preview.webp').headers['cache-control'] == 'public, max-age=300'
    assert client.get('/api/spatial/templates/cowork-full-standard/preview.webp?rev=deadbeef').status_code == 404
    assert client.get('/api/spatial/templates/not-a-template/preview.webp').status_code == 404


def test_template_scene_cache_is_bound_to_the_asset_revision(library, tmp_path):
    client = TestClient(make_app(library, tmp_path))
    revision = library.library['sourceHash']
    url = '/api/spatial/templates/cowork-full-standard'
    response = client.get(f'{url}?rev={revision}')
    assert response.status_code == 200
    assert response.json()['scene'] == library.scenes['cowork-full-standard']
    assert response.json()['scene']['assetRevision'] == revision
    assert response.headers['cache-control'] == 'private, max-age=31536000, immutable'
    assert client.get(url).headers['cache-control'] == 'private, max-age=60'
    assert client.get(f'{url}?rev=deadbeef').status_code == 404
    assert client.get('/api/spatial/templates/not-a-template').status_code == 404


def test_confirmed_template_edit_survives_reopen_and_asset_upgrade(library, tmp_path):
    app = make_app(library, tmp_path)
    client, store = TestClient(app), app.state.spatial_store
    tid = 'cowork-full-standard'
    path = '/api/spatial/templates/' + tid
    source = library.scenes[tid]
    initial = client.get(path + '/preview.webp?managed=1')
    body = {'revision': 0, 'scene': {**source, 'title': '관리자 공간 배치'}}
    with pytest.raises(HTTPException) as missing:
        store.save_template(tid, body)
    assert missing.value.status_code == 422
    assert store.template_edits() == {}
    saved = store.save_template(tid, {**body, 'confirmed': True})
    with pytest.raises(HTTPException) as conflict:
        store.save_template(tid, {**body, 'confirmed': True})
    assert conflict.value.status_code == 409
    assert client.get(path + '?managed=1').json() == saved
    changed = client.get(path + '/preview.webp?managed=1', headers={'If-None-Match': initial.headers['etag']})
    assert changed.status_code == 200 and changed.headers['etag'] != initial.headers['etag']
    assert client.get(path + '?rev=' + source['assetRevision']).json()['scene'] == source
    newer = copy.copy(library)
    newer.library = {**library.library, 'sourceHash': '01234567'}
    newer.scenes = {**library.scenes, tid: {**source, 'assetRevision': '01234567'}}
    reopened = SpatialStore(store.filename, newer)
    assert reopened.template(tid) == saved
    assert reopened.template_edits()[tid]['assets'] == source['assetRevision']


def test_building_preset_requires_confirmation_and_preserves_concurrent_edit(library, tmp_path):
    app = make_app(library, tmp_path)
    store = app.state.spatial_store.buildings
    tid = next(iter(store.presets))
    record = store.get(tid)
    req = {'scene': {**record['scene'], 'title': '공유 건물'}, 'revision': 0}
    with pytest.raises(HTTPException) as missing:
        store.save(tid, req)
    assert missing.value.status_code == 422 and not store.edits()
    saved = store.save(tid, {**req, 'confirmed': True})
    with pytest.raises(HTTPException) as stale:
        store.save(tid, {**req, 'confirmed': True})
    assert stale.value.status_code == 409
    with pytest.raises(HTTPException) as invalid:
        store.save(tid, {'confirmed': True, 'revision': 1, 'scene': {**req['scene'], 'floors': []}})
    assert invalid.value.status_code == 422
    client = TestClient(app)
    assert client.get('/api/spatial/building-templates/' + tid).json() == saved
    assert client.get('/api/spatial/building-templates').json()[tid]['scene'] == saved['scene']


def test_history_endpoint_is_private_and_uses_saved_scene(library, tmp_path):
    app = make_app(library, tmp_path)
    client = TestClient(app)
    scene = copy.deepcopy(template(library))
    saved = app.state.spatial_store.save('local-dev', {'scene': scene, 'view': '3d'})
    response = client.get(f"/api/spatial/history/{saved['id']}/preview.webp?v={scene['contentHash']}")
    assert response.status_code == 200 and response.headers['cache-control'] == 'private, max-age=31536000, immutable'
    assert response.content.endswith(scene_digest(saved['scene']).encode())
    assert client.get(f"/api/spatial/history/{saved['id']}/preview.webp?v=old").headers['cache-control'] == 'private, no-cache'
    draft = app.state.spatial_store.create_draft('local-dev', {'form': {'version': 1, 'title': '초안', 'industry': '', 'style': 'modern', 'rooms': []}})
    assert client.get(f"/api/spatial/history/{draft['id']}/preview.webp").status_code == 404
    assert client.get('/api/spatial/history/sp-missing/preview.webp').status_code == 404
    other = app.state.spatial_store.save('someone-else', {'scene': scene, 'view': '3d'})
    assert client.get(f"/api/spatial/history/{other['id']}/preview.webp").status_code == 404


def test_unavailable_renderer_returns_503_for_client_fallback(library, tmp_path):
    client = TestClient(make_app(library, tmp_path, FakeRenderer(fail=True)))
    response = client.get('/api/spatial/templates/cowork-full-standard/preview.webp')
    assert response.status_code == 503 and response.json()['detail']['code'] == 'renderer_unavailable'
    status = client.get('/api/spatial/previews/status').json()
    assert status['previews']['unavailable'] == 1 and status['cache']['kind'] == 'memory'


def test_disabled_renderer_fails_fast(tmp_path):
    process = RendererProcess(RendererConfig(enabled=False, directory=tmp_path))
    with pytest.raises(RendererUnavailable):
        asyncio.run(process.render('733e40b9', {}))


def test_snapshot_cache_binds_pixels_camera_size_and_asset_revision(library, tmp_path):
    fake = FakeRenderer(delay=.01)
    previews = service(library, tmp_path, fake)
    scene = template(library)
    options = {'w': 1280, 'h': 820}

    async def run():
        results = await asyncio.gather(*(previews.snapshot(scene, options) for _ in range(4)))
        assert all(r == results[0] for r in results)
        assert len(fake.calls) == 1
        moved = {**scene, 'camera': {**scene.get('camera', {}), 'zoom': 1.7}}
        other = await previews.snapshot(moved, options)
        resized = await previews.snapshot(scene, {**options, 'w': 1600})
        assert len({results[0]['digest'], other['digest'], resized['digest']}) == 3
        assert len(fake.calls) == 3
        return results[0]
    first = asyncio.run(run())
    restarted = service(library, tmp_path, FakeRenderer())
    assert asyncio.run(restarted.snapshot(scene, options)) == first
    assert not restarted.renderer.calls


def test_snapshot_endpoint_rejects_mismatched_revision_and_invalid_options(library, tmp_path):
    client = TestClient(make_app(library, tmp_path))
    scene = copy.deepcopy(template(library))
    original = copy.deepcopy(scene)
    body = {'scene': scene, 'revision': scene['assetRevision'], 'options': {'w': 1280, 'h': 820, 'preview': True}}
    result = client.post('/api/spatial/snapshot', json=body)
    assert result.status_code == 200, result.text
    assert result.json()['snapshot']['anchors'] == {'width': 1280, 'height': 820}
    assert result.json()['revision'] == scene['assetRevision']
    assert result.headers['cache-control'] == 'no-store'
    for opts in ({'w': 999999}, {'pixelRatio': 20}, {'type': 'text/html'}, {'encode': False}, {'camera': {'position': [1, 2]}}):
        assert client.post('/api/spatial/snapshot', json={**body, 'options': opts}).status_code == 422
    assert client.post('/api/spatial/snapshot', json={**body, 'revision': 'deadbeef'}).status_code == 422
    assert client.post('/api/spatial/snapshot', json={**body, 'scene': []}).status_code == 422
    assert scene == original


def test_compute_and_snapshot_require_login(library, tmp_path):
    app = make_app(library, tmp_path)
    app.state.auth = SimpleNamespace(config=SimpleNamespace(enabled=True, cookie_name='test'), read_token=lambda _: None)
    client = TestClient(app)
    assert client.post('/api/spatial/snapshot', json={'scene': template(library)}).status_code == 401
    assert client.post('/api/spatial/compute', json={'kind': 'template', 'templateId': 'cowork-full-standard'}).status_code == 401
    assert client.post('/api/spatial/building-snapshot', json={}).status_code == 401


def test_building_snapshot_uses_entire_saved_floor_content_in_cache(library, tmp_path):
    app = make_app(library, tmp_path)
    client = TestClient(app)
    body = {'data': {'tpl': [{'id': 'saved-floor', 'name': 'old'}], 'assets': [], 'recipes': {}, 'styles': {}, 'ind': []},
            'options': {'floors': [{'tpl': 'saved-floor'}], 'w': 640, 'h': 410}}
    first = client.post('/api/spatial/building-snapshot', json=body)
    assert first.status_code == 200, first.text
    assert client.post('/api/spatial/building-snapshot', json=body).json() == first.json()
    body['data']['tpl'][0]['name'] = 'changed'
    other = client.post('/api/spatial/building-snapshot', json=body)
    assert other.status_code == 200 and other.json()['digest'] != first.json()['digest']
    assert len(app.state.spatial_previews.renderer.calls) == 2
    body['options']['floors'] = [{'tpl': 'missing'}]
    assert client.post('/api/spatial/building-snapshot', json=body).status_code == 422


def test_saved_form_uses_scene_revision_when_product_is_no_longer_current(tmp_path):
    library = SpatialLibrary()
    frozen = copy.deepcopy(library.library)
    frozen['sourceHash'] = 'deadbeef'
    scene = copy.deepcopy(template(library))
    asset_id = next(o['assetId'] for o in scene['objects'] if library.assets[o['assetId']].get('productId'))
    asset = next(a for a in frozen['assets'] if a['id'] == asset_id)
    asset['id'], asset['productId'] = 'product:retired-product', 'retired-product'
    for obj in scene['objects']:
        if obj['assetId'] == asset_id:
            obj['assetId'] = asset['id']
    scene['assetRevision'] = frozen['sourceHash']
    library.revisions[frozen['sourceHash']] = frozen
    form = {'version': 1, 'title': scene['title'], 'industry': scene['industry'], 'style': scene['style'],
            'rooms': [{'id': 'old-room', 'name': '기존 공간', 'kind': 'meeting', 'products': [{'productId': asset['productId'], 'quantity': 1}]}]}
    with pytest.raises(ValueError):
        library.validate_form(form)
    assert library.validate_form(form, frozen['sourceHash']) == form
    store = SpatialStore(tmp_path / 'spatial.sqlite', library)
    saved = store.save('test-owner', {'scene': scene, 'form': form, 'view': '3d'})
    changed = store.save_form('test-owner', saved['id'], {'form': {**form, 'title': '기존 제품 유지'}, 'view': '2d', 'revision': saved['revision']})
    assert changed['scene'] == scene and changed['form']['rooms'] == form['rooms']


def _browser_available():
    import os
    if not shutil.which('node') or not WORKER.is_file():
        return False
    if os.environ.get('WINMATE_SPATIAL_RENDER_CHROME') or os.environ.get('CHROME'):
        return True
    candidates = [Path.home() / 'Library/Caches/ms-playwright', Path.home() / '.cache/ms-playwright',
                  Path('/Applications/Google Chrome.app'), Path('/usr/bin/google-chrome'), Path('/usr/bin/chromium')]
    return any(path.exists() for path in candidates)


@pytest.mark.skipif(not _browser_available(), reason='real renderer integration needs Node and Chromium/Chrome')
def test_real_worker_renders_webp_and_survives_restart(library, tmp_path):
    config = RendererConfig(directory=tmp_path / 'previews', concurrency=1, timeout=90, log_file=tmp_path / 'renderer.log', node=shutil.which('node'))

    async def run():
        process = RendererProcess(config)
        previews = SpatialPreviews(library, MemoryCache(CacheConfig()), config, process)
        try:
            data, digest = await previews.image(template(library))
            assert data[:4] == b'RIFF' and data[8:12] == b'WEBP' and 5_000 < len(data) < 400_000
            built = await process.compute(library.library['sourceHash'], {'kind': 'template', 'templateId': 'cowork-full-standard'})
            library.validate(built['scene'])
            assert built['scene']['assetRevision'] == library.library['sourceHash'] and built['form']['rooms']
            blank = await process.compute(library.library['sourceHash'], {'kind': 'command', 'state': {'scene': None, 'form': {**built['form'], 'rooms': []}},
                'documentId': 'blank-test', 'plan': {'operations': [{'type': 'room_add', 'kind': 'meeting', 'name': '첫 공간'}]}})
            library.validate(blank['scene'])
            assert len(blank['scene']['rooms']) == 1 and blank['scene']['rooms'][0]['name'] == '첫 공간'
            snapshot = await process.snapshot(built['scene']['assetRevision'], built['scene'], {'w': 1280, 'h': 820, 'preview': True})
            assert snapshot['image'].startswith('data:image/png;base64,')
            assert snapshot['preview'].startswith('data:image/jpeg;base64,')
            assert (snapshot['anchors']['width'], snapshot['anchors']['height']) == (1280, 820)
            assert set(snapshot['anchors']['rooms']) == {r['id'] for r in built['scene']['rooms']}
            assert len(snapshot['camera']['position']) == 3
            process.process.kill()                       # crash → the next request starts a new worker
            await process.process.wait()
            await asyncio.sleep(.1)
            process.failed_at = 0
            other, _ = await previews.image(template(library, 'fb-full-compact'))
            assert other[8:12] == b'WEBP' and process.status()['restarts'] == 2
            return digest
        finally:
            await previews.stop()
    digest = asyncio.run(run())
    assert (tmp_path / 'previews' / library.library['sourceHash'] / f'{digest}-w960.webp').is_file()
