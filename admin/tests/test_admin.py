"""Isolated API/transaction tests. No model success responses are simulated."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sqlite3
import threading
import time
import os
import shutil
import subprocess

from fastapi.testclient import TestClient
import pytest

from admin import engine, server
from admin.engine import EngineError, Evidence, checked_url, extract, verify_evidence
from admin.inventory import index_repository
from admin.refresh import rollback, save_release
from admin.service import Service, extracted_assets
from admin.store import Store, digest, dump, semantic_digest
from app.api.auth import Auth, AuthConfig


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / 'state')


def sample(identifier='product:one', text='original', sid='samsung', **extra):
    return {'id': identifier, 'source_id': sid, 'kind': 'product', 'title': 'Example product',
            'external_id': identifier, 'payload': {'model': 'WMT-TEST'}, 'content': text, **extra}


def release_dir(store, name='release-one'):
    path = store.home / 'releases' / name
    path.mkdir(parents=True)
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
    with TestClient(server.api) as c:
        c.cookies.set(auth.config.cookie_name, token)
        yield c, svc, auth
    svc.close()


def test_fts_upsert_keeps_rowids_and_annotations(store):
    store.upsert_assets([sample(payload={'model': 'WMT-TEST', 'admin_notes': 'keep', 'admin_tags': ['tag']})])
    store.upsert_assets([sample(text='updated')])
    row = store.one('SELECT * FROM assets')
    assert json.loads(row['payload'])['admin_notes'] == 'keep'
    assert json.loads(row['payload'])['admin_tags'] == ['tag']
    assert store.one('SELECT count(*) n FROM asset_fts')['n'] == 1
    assert store.assets(q='updated')['total'] == 1
    with store.db() as db:
        assert db.execute('SELECT rowid FROM assets').fetchone()[0] == db.execute('SELECT rowid FROM asset_fts').fetchone()[0]


def test_release_applies_and_rollback_restores_exact_rows(store):
    store.upsert_assets([sample()])
    before = store.rows('SELECT * FROM assets')
    result = save_release(store, 'samsung', [sample(text='new'), sample('product:two', text='second')], {}, {}, [], release_dir(store))
    assert len(result['changes']) == 2
    assert store.assets()['total'] == 2
    assert rollback(store, 'release-one')['restored_assets'] == 1
    assert store.rows('SELECT * FROM assets') == before
    assert store.one('SELECT count(*) n FROM asset_fts')['n'] == 1


def test_release_failure_is_atomic(store):
    store.upsert_assets([sample()])
    with store.db() as db:
        db.execute("CREATE TRIGGER fail_release BEFORE INSERT ON releases BEGIN SELECT RAISE(ABORT,'forced failure'); END")
    with pytest.raises(sqlite3.IntegrityError):
        save_release(store, 'samsung', [sample(text='must rollback')], {}, {}, [], release_dir(store))
    assert store.one('SELECT content FROM assets')['content'] == 'original'
    assert store.assets(q='must rollback')['total'] == 0
    assert store.one('SELECT count(*) n FROM releases')['n'] == 0
    assert store.source('samsung')['refreshed_at'] is None


def test_rollback_does_not_erase_later_edits(store):
    store.upsert_assets([sample()])
    save_release(store, 'samsung', [sample(text='new')], {}, {}, [], release_dir(store))
    store.upsert_assets([sample(text='later edit')])
    with pytest.raises(EngineError, match='릴리스 후 변경'):
        rollback(store, 'release-one')
    assert store.one('SELECT content FROM assets')['content'] == 'later edit'
    assert store.one('SELECT status FROM releases')['status'] == 'active'


def test_rollback_blocks_new_assets_and_status_edits(store):
    store.upsert_assets([sample()])
    save_release(store, 'samsung', [sample(text='new')], {}, {}, [], release_dir(store))
    store.upsert_assets([sample('product:later')])
    with pytest.raises(EngineError, match='에셋 구성'):
        rollback(store, 'release-one')


def test_release_preserves_admin_notes_and_archived_state(store):
    store.upsert_assets([sample(payload={'admin_notes': 'editor note', 'admin_tags': ['x']}, status='archived')])
    save_release(store, 'samsung', [sample(text='official update')], {}, {}, ['product:one'], release_dir(store))
    row = store.one('SELECT * FROM assets')
    assert json.loads(row['payload'])['admin_notes'] == 'editor note'
    assert row['status'] == 'archived'
    rollback(store, 'release-one')


def test_source_verification_timestamp_is_not_a_content_change(store):
    before = {'model': 'WMT-TEST', 'source_checked_at': '2026-10-18'}
    after = {**before, 'source_checked_at': '2026-10-20'}
    store.upsert_assets([sample(payload=before, content=dump(before))])
    previous_updated = store.one('SELECT updated_at FROM assets')['updated_at']
    result = save_release(store, 'samsung', [sample(payload=after, content=dump(after))], {}, {}, [], release_dir(store))
    assert result['changes'] == []
    assert store.one('SELECT updated_at FROM assets')['updated_at'] == previous_updated
    rollback(store, 'release-one')


def test_semantic_hash_ignores_engine_usage_but_not_facts():
    assert semantic_digest({'model': 'A', 'engine': {'at': 'one'}}, '') == semantic_digest({'model': 'A', 'engine': {'at': 'two'}}, '')
    assert semantic_digest({'model': 'A'}, '') != semantic_digest({'model': 'B'}, '')


def test_repository_rescan_preserves_refreshed_source(store, tmp_path):
    root = tmp_path / 'repo'
    data = root / 'app/data'
    data.mkdir(parents=True)
    (data / 'catalog.json').write_text(dump({'products': [{'id': 'one', 'name': 'stale'}]}))
    store.upsert_assets([sample('product:one', title='current')])
    with store.db() as db:
        db.execute("UPDATE sources SET refreshed_at='2026-10-20' WHERE id='samsung'")
    index_repository(store, root=root)
    assert store.one("SELECT title FROM assets WHERE id='product:one'")['title'] == 'current'


def test_store_reconnect_does_not_interrupt_running_jobs(store):
    jid = store.new_job('check', 'samsung')
    store.progress(jid, 'working', 50)
    Store(store.home)
    assert store.job(jid)['status'] == 'running'


def test_evidence_must_match_exact_source_quote():
    verify_evidence([Evidence(source_id='p1', quote='원문 모델')], [{'id': 'p1', 'text': '이것은 원문 모델입니다.'}])
    with pytest.raises(EngineError):
        verify_evidence([Evidence(source_id='p1', quote='없는 모델')], [{'id': 'p1', 'text': '원문 모델'}])
    with pytest.raises(EngineError):
        verify_evidence([Evidence(source_id='p2', quote='원문 모델')], [{'id': 'p1', 'text': '원문 모델'}])


@pytest.mark.parametrize('url', ['http://example.com', 'https://127.0.0.1/', 'https://[::1]/', 'https://localhost/', 'https://user:password@example.com/', 'https://example.com:8080/'])
def test_private_or_unsafe_urls_are_rejected(url):
    with pytest.raises(EngineError):
        checked_url(url)


def test_mixed_public_private_dns_is_rejected(monkeypatch):
    monkeypatch.setattr(engine.socket, 'getaddrinfo', lambda *a, **k: [(None, None, None, None, ('8.8.8.8', 443)), (None, None, None, None, ('10.0.0.1', 443))])
    with pytest.raises(EngineError):
        checked_url('https://example.com/')


def test_catalog_namespaces_do_not_merge_same_dir():
    html = '<li><a href="../b2c/ecatalog5.php?Dir=272"><img alt="소형가전"></a></li><li><a href="./ecatalog5.php?Dir=272"><img alt="비디오월"></a></li>'
    rows = engine.catalog_listing(html, 'https://samsung.aiibook.net/b2b/')
    assert {r['id'] for r in rows} == {'b2b:272', 'b2c:272'}
    assert len({r['url'] for r in rows}) == 2


def test_snapshot_is_preserved_when_ai_fails(store, monkeypatch):
    html = b'<li><a href="./ecatalog5.php?Dir=360"><img alt="Catalog"></a></li>'
    monkeypatch.setattr(engine, 'fetch', lambda *a, **k: {'body': html, 'url': 'https://samsung.aiibook.net/b2b/', 'fetched_at': '2026-10-20'})
    def fail(*args, **kwargs):
        raise EngineError('AI unavailable')
    monkeypatch.setattr(engine, 'decide', fail)
    with pytest.raises(EngineError, match='AI unavailable'):
        engine.probe(store.source('catalogs'), store, lambda *a: None, lambda: False)
    assert store.one('SELECT count(*) n FROM snapshots')['n'] == 1
    assert store.source('catalogs')['status'] == 'unchecked'


def test_document_extraction_rejects_binary_empty_and_huge_inputs():
    with pytest.raises(EngineError):
        extract(b'\x00bad', 'test.txt')
    with pytest.raises(EngineError):
        extract(b'', 'test.txt')
    with pytest.raises(EngineError):
        extract(b'x' * 350001, 'test.txt')
    blocks, image_type = extract('모델 WMT-TEST'.encode(), 'test.txt')
    assert blocks[0]['text'] == '모델 WMT-TEST'
    assert image_type is None


def test_admin_auth_and_csrf(client):
    c, svc, auth = client
    assert c.get('/api/overview').status_code == 200
    assert c.post('/api/jobs', json={'kind': 'diagnose'}, headers={'origin': 'https://evil.example'}).status_code == 403
    c.cookies.clear()
    assert c.get('/api/overview').status_code == 401
    assert c.get('/', follow_redirects=False).status_code == 303


def test_non_admin_account_is_denied(client):
    c, svc, auth = client
    auth.set_credentials('member', 'isolated-test-password')
    token, _ = auth.issue_token()
    c.cookies.set(auth.config.cookie_name, token)
    assert c.get('/api/overview').status_code == 403


def test_api_edits_preserve_content_and_archive(client):
    c, svc, auth = client
    svc.store.upsert_assets([sample(text='exact original')])
    response = c.patch('/api/assets/product:one', json={'notes': 'keep me', 'tags': ['tag'], 'status': 'archived'})
    assert response.status_code == 200
    row = svc.store.one('SELECT * FROM assets')
    assert row['content'] == 'exact original' and row['status'] == 'archived'
    assert json.loads(row['payload'])['admin_notes'] == 'keep me'
    svc.store.upsert_assets([sample(text='new content')])
    assert json.loads(svc.store.one('SELECT payload FROM assets')['payload'])['admin_notes'] == 'keep me'


def test_api_paths_upload_limit_and_read_only_database(client):
    c, svc, auth = client
    assert c.get('/api/database/secret').status_code == 404
    assert c.get('/api/database/admin/unknown').status_code == 404
    assert c.get('/api/database/admin/assets').status_code == 200
    assert c.post('/api/uploads', content=b'x', headers={'content-length': str(26 * 1024 * 1024), 'x-filename': 'a.txt'}).status_code == 413
    assert c.post('/api/uploads', content=b'x', headers={'content-length': 'invalid', 'x-filename': 'a.txt'}).status_code == 400
    assert c.post('/api/url-assets', json={'url': 'https://127.0.0.1/private'}).status_code == 422
    assert c.post('/api/sources', json={'name': 'bad', 'url': 'http://localhost'}).status_code == 422


def test_failed_analysis_can_retry_duplicate_instead_of_staying_pending(client, monkeypatch):
    c, svc, auth = client
    def no_model(*a, **k):
        raise EngineError('No model configured for this isolated failure test')
    monkeypatch.setattr(engine, 'provider', no_model)
    def submit():
        r = c.post('/api/uploads', content='원문 모델 WMT-TEST'.encode(), headers={'x-filename': 'source.txt', 'content-type': 'text/plain'})
        assert r.status_code == 200
        return r.json()
    first = submit()
    for _ in range(200):
        if svc.store.job(first['job']['id'])['status'] == 'failed':
            break
        time.sleep(.01)
    second = submit()
    assert second['duplicate'] and second['job'] is not None
    assert first['job']['id'] != second['job']['id']


def test_queue_full_retains_raw_asset_with_retry_state(client):
    c, svc, auth = client
    for _ in range(12):
        svc.store.new_job('check', 'samsung')
    response = c.post('/api/uploads', content='자료 내용'.encode(), headers={'x-filename': 'queue.txt', 'content-type': 'text/plain'})
    assert response.status_code == 200
    value = response.json()
    assert value['job'] is None and value['analysis_error']
    asset = svc.store.one('SELECT * FROM assets WHERE id=?', (value['asset_id'],))
    assert asset['status'] == 'analysis_failed'
    assert (svc.store.home / json.loads(asset['payload'])['file_ref']).exists()


def test_backup_is_actual_sqlite_snapshot(client):
    c, svc, auth = client
    svc.store.upsert_assets([sample()])
    job = c.post('/api/jobs', json={'kind': 'backup'}).json()
    for _ in range(300):
        current = svc.store.job(job['id'])
        if current['status'] not in ('running', 'queued'):
            break
        time.sleep(.01)
    assert current['status'] == 'succeeded'
    backup = svc.store.home / 'backups' / current['result']['filename']
    with sqlite3.connect(backup) as db:
        assert db.execute('PRAGMA quick_check').fetchone()[0] == 'ok'
        assert db.execute('SELECT count(*) FROM assets').fetchone()[0] == 1


def test_pdf_pptx_docx_and_image_readers_preserve_source_locations():
    import io
    import zipfile
    import pymupdf
    from PIL import Image
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((30, 40), 'Winmate PDF WMT-TEST')
    body = doc.tobytes()
    doc.close()
    blocks, _ = extract(body, 'sample.pdf')
    assert blocks[0]['id'] == 'p1' and 'WMT-TEST' in blocks[0]['text']
    for extension, member in [('docx', 'word/document.xml'), ('pptx', 'ppt/slides/slide1.xml')]:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z:
            z.writestr(member, '<root xmlns:a="urn:office"><a:t>Exact model WMT-TEST</a:t></root>')
        blocks, _ = extract(buffer.getvalue(), 'sample.' + extension)
        assert blocks[0]['text'] == 'Exact model WMT-TEST'
        assert blocks[0]['location'] == ('1장' if extension == 'pptx' else '본문')
    buffer = io.BytesIO()
    Image.new('RGB', (8, 8), 'white').save(buffer, 'PNG')
    blocks, mime = extract(buffer.getvalue(), 'sample.png')
    assert mime == 'image/png' and blocks[0]['id'] == 'image'
    with pytest.raises(EngineError):
        extract(b'not a PDF', 'sample.pdf')


def test_cancelled_multi_source_job_keeps_committed_results(tmp_path, monkeypatch):
    svc = Service(tmp_path / 'state')
    jid = svc.store.new_job('refresh', None)
    def commit_prepared_records(source, progress, cancel, job_id):
        directory = release_dir(svc.store, source['id'])
        manifest = save_release(svc.store, source['id'], [sample(sid=source['id'])], {}, {}, [], directory)
        with svc.store.db() as db:
            db.execute('UPDATE jobs SET cancelled=1 WHERE id=?', (job_id,))
        return {'release': manifest}
    monkeypatch.setattr(svc, 'refresh', commit_prepared_records)
    svc.run(jid, 'refresh', None, {}, 'unit-test')
    job = svc.store.job(jid)
    assert job['status'] == 'cancelled'
    assert len(job['result']['sources']) == 1
    assert '이미 완료한 1개' in job['error']
    assert svc.store.one('SELECT status FROM releases')['status'] == 'active'
    assert svc.store.assets()['total'] == 1
    svc.close()


def test_extracted_entity_ids_and_parent_links_are_stable(store):
    parent = sample('upload:one', sid='uploads')
    entities = [{'kind': 'product', 'name': 'WMT product', 'model': 'WMT-TEST', 'summary': 'Source-backed fixture', 'tags': [], 'evidence': [{'source_id': 'p1', 'quote': 'WMT-TEST'}]}]
    first = extracted_assets(parent, {'entities': entities, 'engine': {'model': 'metadata-fixture'}})
    second = extracted_assets(parent, {'entities': list(reversed(entities)), 'engine': {'model': 'metadata-fixture'}})
    assert first[0]['id'] == second[0]['id']
    assert first[0]['payload']['parent_asset_id'] == parent['id']
    store.upsert_assets([parent, *first], analyzed_parent=parent['id'])
    assert store.assets(kind='product', source='uploads', q='WMT-TEST')['total'] == 2
    store.upsert_assets([parent], analyzed_parent=parent['id'])
    assert store.one('SELECT status FROM assets WHERE id=?', (first[0]['id'],))['status'] == 'needs_review'


def test_structured_catalog_facts_remain_exactly_quotable():
    sources = engine.decision_sources([{'id': 'current', 'text': dump({'kind': 'catalog-list', 'items': [{'id': 'b2b:360', 'title': '종합', 'url': 'https://samsung.aiibook.net/b2b/ecatalog5.php?Dir=360'}], 'new_ids': ['b2b:360'], 'headers': [], 'coverage': '목록'})}])
    verify_evidence([Evidence(source_id='current-facts', quote='기존 관리 자료 대비 새로 발견: 1권')], sources)


def test_search_includes_admin_tags(client):
    c, svc, auth = client
    svc.store.upsert_assets([sample()])
    c.patch('/api/assets/product:one', json={'tags': ['unique-admin-label']}).raise_for_status()
    assert c.get('/api/assets', params={'q': 'unique-admin-label'}).json()['total'] == 1


@pytest.mark.parametrize('admin_files,enabled,expected', [
    (False, False, 'app.api.main:app'),
    (True, False, 'app.api.main:app'),
    (False, True, 'app.api.main:app'),
    (True, True, 'admin.server:app'),
])
def test_normal_startup_only_mounts_opted_in_local_admin(tmp_path, admin_files, enabled, expected):
    # Exercise the actual launcher in a disposable project; build commands record their arguments.
    root = tmp_path / 'project'
    (root / 'app/.venv/bin').mkdir(parents=True)
    (root / 'app/web/node_modules').mkdir(parents=True)
    commands = root / 'commands'
    commands.mkdir()
    trace = root / 'trace.txt'
    script = Path(__file__).resolve().parents[2] / 'app/start.sh'
    shutil.copy2(script, root / 'app/start.sh')
    stub = '#!/bin/sh\nprintf "%s" "$(basename "$0")" >> "$WINMATE_BOOT_TRACE"\nprintf " %s" "$@" >> "$WINMATE_BOOT_TRACE"\nprintf "\\n" >> "$WINMATE_BOOT_TRACE"\n'
    for path in [root / 'app/.venv/bin/python', *[commands / name for name in ('node', 'npm', 'uv')]]:
        path.write_text(stub)
        path.chmod(0o755)
    if admin_files or enabled:
        (root / 'admin').mkdir()
    if admin_files:
        (root / 'admin/server.py').write_text('# local admin entrypoint')
        (root / 'admin/prepare.sh').write_text('#!/bin/sh\nprintf "admin-prepare\\n" >> "$WINMATE_BOOT_TRACE"\n')
    if enabled:
        (root / 'admin/.enabled').touch()
    environment = {'PATH': str(commands) + os.pathsep + '/usr/bin:/bin', 'WINMATE_API_PORT': '8796', 'WINMATE_BOOT_TRACE': str(trace)}
    subprocess.run(['bash', str(root / 'app/start.sh')], env=environment, check=True, capture_output=True, text=True)
    lines = trace.read_text().splitlines()
    assert f'python -B -m uvicorn {expected} --host 127.0.0.1 --port 8796 --no-access-log' == lines[-1]
    assert ('admin-prepare' in lines) == (admin_files and enabled)
