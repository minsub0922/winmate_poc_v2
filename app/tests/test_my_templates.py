import base64
import sqlite3
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from app.api.auth import Auth, AuthConfig, integrate_app
from app.api.my_templates import TemplateStore, build_router
from app.scripts.template_account_db import export_account, import_account

PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
PASSWORD = 'isolated-template-password'


def record(f='L_MY_example', title='계정에 저장한 레이아웃', revision=0):
    return {'meta': {'f': f, 'name': title, 'my': {'kind': 'edit', 'from': 'L_AIS_02'}},
            'html': '<div style="width:1280px;height:720px"><div data-tb="0">' + title + '</div><img src="wmimg:photo"></div>',
            'base_revision': revision}


def test_sqlite_preserves_images_across_instances_and_backups(tmp_path):
    path = tmp_path / 'operations.sqlite'
    store = TemplateStore(path)
    store.save('admin', {'items': [record()], 'images': {'photo': PNG}})
    assert TemplateStore(path).get('admin', 'L_MY_example')['meta']['name'] == '계정에 저장한 레이아웃'
    assert TemplateStore(path).image('admin', 'photo')[1] == base64.b64decode(PNG.split(',')[1])
    target = tmp_path / 'another-server.sqlite'
    with sqlite3.connect(path) as source, sqlite3.connect(target) as destination:
        source.backup(destination)
    restored = TemplateStore(target)
    assert restored.id == store.id
    assert restored.get('admin', 'L_MY_example')['html'] == store.get('admin', 'L_MY_example')['html']
    assert restored.image('admin', 'photo') == store.image('admin', 'photo')


def test_conflicts_images_and_batch_saves_are_atomic(tmp_path):
    store = TemplateStore(tmp_path / 'accounts.sqlite')
    store.save('admin', {'items': [record()], 'images': {'photo': PNG}})
    updated = record(title='수정본', revision=1)
    assert store.save('admin', {'items': [updated]})['items'][0]['revision'] == 2
    with pytest.raises(HTTPException) as raised:
        store.save('admin', {'items': [record('L_MY_new'), record(revision=1)]})
    assert raised.value.status_code == 409
    with pytest.raises(HTTPException):
        store.get('admin', 'L_MY_new')
    missing = record('L_MY_missing'); missing['html'] = '<img src="wmimg:missing">'
    with pytest.raises(ValueError):
        store.save('admin', {'items': [missing]})
    assert store.get('admin', 'L_MY_example')['meta']['name'] == '수정본'
    with pytest.raises(ValueError):
        store.save('admin', {'items': [record('L_MY_script') | {'html': '<img onerror="alert(1)" src="x">'}]})


def test_migration_never_overwrites_edits_or_resurrects_deletions(tmp_path):
    store = TemplateStore(tmp_path / 'accounts.sqlite')
    old = {'mode': 'migrate', 'items': [record()], 'images': {'photo': PNG}}
    assert store.save('admin', old)['stored'] == 1
    store.save('admin', {'items': [record(title='다른 브라우저에서 수정', revision=1)]})
    assert store.save('admin', old)['stored'] == 0
    assert store.get('admin', 'L_MY_example')['meta']['name'] == '다른 브라우저에서 수정'
    store.delete('admin', [{'f': 'L_MY_example', 'base_revision': 2}])
    assert store.save('admin', old)['stored'] == 0
    assert store.list('admin')['items'][0]['deleted']
    with pytest.raises(HTTPException):
        store.get('admin', 'L_MY_example')


def test_portable_account_export_includes_only_its_templates_and_images(tmp_path):
    source = TemplateStore(tmp_path / 'source.sqlite')
    source.save('admin', {'items': [record()], 'images': {'photo': PNG}})
    source.save('member', {'items': [record('L_MY_private', title='다른 계정 자료')], 'images': {'photo': PNG}})
    value = export_account(source, 'admin')
    assert value['owner'] == 'admin' and len(value['items']) == 1
    target = TemplateStore(tmp_path / 'target.sqlite')
    assert import_account(target, 'admin', value) == 1
    assert target.get('admin', 'L_MY_example')['html'] == source.get('admin', 'L_MY_example')['html']
    assert target.image('admin', 'photo') == source.image('admin', 'photo')
    assert import_account(target, 'admin', value) == 0
    assert target.list('member')['items'] == []


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
    app.state.my_templates = TemplateStore(tmp_path / 'operations.sqlite')
    app.include_router(build_router())
    return app


def test_api_uses_session_owner_and_isolates_images_and_writes(tmp_path):
    app = make_app(tmp_path)
    with TestClient(app) as admin, TestClient(app) as member, TestClient(app) as guest:
        assert guest.get('/api/my-templates').status_code == 401
        for client, username in ((admin, 'admin'), (member, 'member')):
            assert client.post('/api/auth/login', json={'username': username, 'password': PASSWORD}).status_code == 200
        body = {'items': [record()], 'images': {'photo': PNG}, 'owner': 'member'}
        assert admin.post('/api/my-templates', json=body).status_code == 200
        assert admin.get('/api/my-templates').json()['owner'] == 'admin'
        assert member.get('/api/my-templates').json()['items'] == []
        assert member.get('/api/my-templates/L_MY_example').status_code == 404
        assert member.get('/api/my-templates/images/photo').status_code == 404
        assert member.post('/api/my-templates/delete', json={'items': [{'f': 'L_MY_example', 'base_revision': 1}]}).status_code == 404
        assert admin.post('/api/my-templates', json=body, headers={'Origin': 'https://unrelated.example'}).status_code == 403
        assert admin.get('/api/my-templates', headers={'X-Winmate-User': 'member'}).status_code == 409
        image = admin.get('/api/my-templates/images/photo')
        assert image.content == base64.b64decode(PNG.split(',')[1])
        assert image.headers['cache-control'] == 'private, no-store'
        assert admin.get('/api/my-templates').headers['cache-control'] == 'no-store'
