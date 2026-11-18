"""Account data store: revisions, per-record conflicts, one-time migration, tombstones, owner isolation, blobs."""
import base64
import json
import sqlite3
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from app.api.account_data import AccountDataStore, COLLECTIONS, build_router
from app.api.auth import Auth, AuthConfig, integrate_app

PASSWORD = 'isolated-account-data-password'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')


def proposal(identifier='p1', title='제안서', updated=1000):
    return {'id': identifier, 'title': title, 'updatedAt': updated, 'parts': [], 'req': {'free': [{'t': '요구'}]}}


def put(store, owner, *records, base=0, mode=None, collection='proposals'):
    body = {'items': [{'id': r['id'], 'data': r, 'base_revision': base, 'updated_at': r.get('updatedAt', 0)} for r in records]}
    if mode:
        body['mode'] = mode
    return store.write(owner, collection, body)


def test_round_trip_preserves_json_exactly(tmp_path):
    store = AccountDataStore(tmp_path / 'account.sqlite')
    record = proposal() | {'nested': {'ko': '한글 ✓', 'n': [1, 2.5, None, True]}}
    assert put(store, 'admin', record)['applied'] == [{'id': 'p1', 'revision': 1, 'deleted': False}]
    fetched = store.fetch('admin', 'proposals', ['p1'])['items'][0]
    assert fetched['data'] == record and fetched['revision'] == 1 and fetched['updated_at'] == 1000
    size = len(json.dumps(record, ensure_ascii=False, separators=(',', ':')).encode())
    assert store.manifest('admin', 'proposals')['items'] == [{'id': 'p1', 'revision': 1, 'updated_at': 1000, 'deleted': False, 'size': size}]


def test_stale_base_revision_is_a_per_record_conflict(tmp_path):
    store = AccountDataStore(tmp_path / 'account.sqlite')
    put(store, 'admin', proposal('p1'), proposal('p2'))
    put(store, 'admin', proposal('p1', '다른 브라우저 수정', 2000), base=1)
    result = store.write('admin', 'proposals', {'items': [
        {'id': 'p1', 'data': proposal('p1', '오래된 수정'), 'base_revision': 1},
        {'id': 'p2', 'data': proposal('p2', '정상 수정'), 'base_revision': 1}]})
    assert result['applied'] == [{'id': 'p2', 'revision': 2, 'deleted': False}]
    assert result['conflicts'][0]['id'] == 'p1' and result['conflicts'][0]['revision'] == 2
    assert result['conflicts'][0]['data']['title'] == '다른 브라우저 수정'
    # New record with a non-zero base (client believed it existed) is also a conflict, not a silent create.
    assert store.write('admin', 'proposals', {'items': [{'id': 'p9', 'data': proposal('p9'), 'base_revision': 3}]})['conflicts'][0]['missing']


def test_migration_never_overwrites_edits_or_resurrects_deletions(tmp_path):
    store = AccountDataStore(tmp_path / 'account.sqlite')
    put(store, 'admin', proposal('p1', '서버 원본'))
    put(store, 'admin', proposal('p2'))
    store.write('admin', 'proposals', {'deletes': [{'id': 'p2', 'base_revision': 1}]})
    result = put(store, 'admin', proposal('p1', '옛 브라우저'), proposal('p2', '삭제된 기록'), proposal('p3', '처음 올림'), mode='migrate')
    assert [a['id'] for a in result['applied']] == ['p3']
    assert {s['id']: s['deleted'] for s in result['skipped']} == {'p1': False, 'p2': True}
    assert store.fetch('admin', 'proposals', ['p1'])['items'][0]['data']['title'] == '서버 원본'
    tombstone = store.fetch('admin', 'proposals', ['p2'])['items'][0]
    assert (tombstone['revision'], tombstone['deleted'], tombstone['data']) == (2, True, None)


def test_tombstone_then_recreate_and_stale_delete(tmp_path):
    store = AccountDataStore(tmp_path / 'account.sqlite')
    put(store, 'admin', proposal())
    assert store.write('admin', 'proposals', {'deletes': [{'id': 'p1', 'base_revision': 0}]})['conflicts'][0]['revision'] == 1
    assert store.write('admin', 'proposals', {'deletes': [{'id': 'p1', 'base_revision': 1}]})['applied'][0] == {'id': 'p1', 'revision': 2, 'deleted': True}
    assert store.manifest('admin', 'proposals')['items'][0]['deleted'] is True
    # Deleting again or deleting an unknown record is idempotent.
    assert store.write('admin', 'proposals', {'deletes': [{'id': 'p1', 'base_revision': 2}, {'id': 'nope', 'base_revision': 0}]})['conflicts'] == []
    # A deliberate re-creation must name the tombstone's revision.
    assert put(store, 'admin', proposal(), base=2)['applied'][0]['revision'] == 3


def test_owners_and_collections_are_isolated(tmp_path):
    store = AccountDataStore(tmp_path / 'account.sqlite')
    put(store, 'admin', proposal())
    put(store, 'member', proposal('p1', '다른 계정'))
    assert store.fetch('member', 'proposals', ['p1'])['items'][0]['data']['title'] == '다른 계정'
    assert store.manifest('admin', 'reviews')['items'] == []
    with pytest.raises(HTTPException):
        store.manifest('admin', 'secrets')
    assert set(COLLECTIONS) >= {'proposals', 'reviews', 'simulations', 'personas', 'favorites', 'buildings', 'review-docs', 'attachment-sources'}


def test_validation_limits_and_batches(tmp_path):
    store = AccountDataStore(tmp_path / 'account.sqlite')
    for body in ({'items': []}, {'items': [{'id': '../x', 'data': {}}]}, {'items': [{'id': 'a', 'data': None}]},
                 {'items': [{'id': 'a', 'data': {}}, {'id': 'a', 'data': {}}]}, {'items': [{'id': 'a', 'data': {}, 'base_revision': -1}]},
                 {'items': [{'id': 'a', 'data': float('nan')}]}):
        with pytest.raises(ValueError):
            store.write('admin', 'proposals', body)
    with pytest.raises(ValueError):
        store.write('admin', 'personas', {'items': [{'id': 'a', 'data': {'x': 'y' * (1024 * 1024)}}]})
    # A large fetch is split by byte budget; the rest is named for the next request.
    big = {'id': 'big', 'blob': 'x' * (13 * 1024 * 1024)}
    store.write('admin', 'proposals', {'items': [{'id': 'big', 'data': big}, {'id': 'big2', 'data': big | {'id': 'big2'}}]})
    result = store.fetch('admin', 'proposals', ['big', 'big2'])
    assert [i['id'] for i in result['items']] == ['big'] and result['remaining'] == ['big2']


def test_blobs_are_immutable_owner_scoped_and_survive_backup(tmp_path):
    path = tmp_path / 'account.sqlite'
    store = AccountDataStore(path)
    assert store.put_blob('admin', 'u123', 'image/png', PNG)['stored'] is True
    assert store.put_blob('admin', 'u123', 'image/png', PNG)['stored'] is False
    with pytest.raises(HTTPException):
        store.put_blob('admin', 'u123', 'image/png', PNG + b'x')
    with pytest.raises(ValueError):
        store.put_blob('admin', 'u124', 'text/html', b'<script>')
    with pytest.raises(ValueError):
        store.put_blob('admin', 'u125', 'image/svg+xml', b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    assert store.missing_blobs('admin', ['u123', 'u999']) == ['u999']
    assert store.missing_blobs('member', ['u123']) == ['u123']
    with pytest.raises(HTTPException):
        store.blob('member', 'u123')
    copy = tmp_path / 'restored.sqlite'
    with sqlite3.connect(path) as source, sqlite3.connect(copy) as target:
        source.backup(target)
    restored = AccountDataStore(copy)
    assert restored.id == store.id and restored.blob('admin', 'u123')[1] == PNG
    assert store.delete_blobs('admin', ['u123']) == 1 and store.missing_blobs('admin', ['u123']) == ['u123']


def make_app(tmp_path):
    auth = Auth(AuthConfig(auth_dir=tmp_path / 'auth', iterations=2000))
    auth.set_credentials('admin', PASSWORD)
    other = Auth(AuthConfig(auth_dir=tmp_path / 'member-auth', iterations=2000))
    other.set_credentials('member', PASSWORD)
    credentials = {'admin': auth.credentials(), 'member': other.credentials()}
    auth.accounts = SimpleNamespace(credentials=lambda username, legacy: credentials.get(username),
                                    role=lambda username: 'admin' if username == 'admin' else 'member',
                                    configured=lambda: True, login=lambda _: None)
    app = FastAPI()
    integrate_app(app, auth)
    app.state.account_data = AccountDataStore(tmp_path / 'account.sqlite')
    app.include_router(build_router())
    return app


def test_http_api_requires_session_and_isolates_accounts(tmp_path):
    app = make_app(tmp_path)
    with TestClient(app) as admin, TestClient(app) as member, TestClient(app) as guest:
        assert guest.get('/api/account-data/proposals').status_code == 401
        assert guest.put('/api/account-data/blobs/u1', content=PNG, headers={'Content-Type': 'image/png'}).status_code in (401, 403)
        for client, username in ((admin, 'admin'), (member, 'member')):
            assert client.post('/api/auth/login', json={'username': username, 'password': PASSWORD}).status_code == 200
        body = {'items': [{'id': 'p1', 'data': proposal(), 'base_revision': 0, 'updated_at': 1000}]}
        assert admin.post('/api/account-data/proposals', json=body).json()['applied'][0]['revision'] == 1
        assert admin.post('/api/account-data/proposals', json=body, headers={'Origin': 'https://unrelated.example'}).status_code == 403
        manifest = admin.get('/api/account-data/proposals')
        assert manifest.headers['cache-control'] == 'no-store' and manifest.json()['owner'] == 'admin' and len(manifest.json()['items']) == 1
        assert member.get('/api/account-data/proposals').json()['items'] == []
        assert member.post('/api/account-data/proposals/fetch', json={'ids': ['p1']}).json()['items'] == [{'id': 'p1', 'missing': True}]
        assert admin.post('/api/account-data/proposals/fetch', json={'ids': ['p1']}).json()['items'][0]['data'] == proposal()
        assert admin.get('/api/account-data/proposals', headers={'X-Winmate-User': 'member'}).status_code == 409
        assert admin.get('/api/account-data/unknown').status_code == 404
        assert admin.post('/api/account-data/proposals', content=b'not json', headers={'Content-Type': 'application/json'}).status_code == 422

        assert admin.put('/api/account-data/blobs/u1', content=PNG, headers={'Content-Type': 'image/png'}).json()['stored'] is True
        image = admin.get('/api/account-data/blobs/u1')
        assert image.content == PNG and image.headers['content-type'] == 'image/png'
        assert image.headers['cache-control'] == 'private, max-age=31536000, immutable'
        assert admin.get('/api/account-data/blobs/u1', headers={'If-None-Match': image.headers['etag']}).status_code == 304
        assert member.get('/api/account-data/blobs/u1').status_code == 404
        assert admin.post('/api/account-data/blobs/missing', json={'ids': ['u1', 'u2']}).json() == {'missing': ['u2']}
        usage = admin.get('/api/account-data/usage').json()
        assert usage['collections']['proposals']['records'] == 1 and usage['blobs']['count'] == 1
