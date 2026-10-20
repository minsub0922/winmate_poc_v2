"""Direct owner routes preserve local IDs and cannot be used as public capabilities."""
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.auth import Auth, AuthConfig, integrate_app
from app.api.storyboards import StoryboardStore, build_router
from app.tests.test_storyboards import document, change


@pytest.fixture
def histories(tmp_path):
    app = FastAPI()
    app.state.storyboards = StoryboardStore(tmp_path / 'shares')
    app.include_router(build_router())
    auth = Auth(AuthConfig(enabled=True, auth_dir=tmp_path / 'auth', iterations=2000))
    auth.set_credentials('owner', 'history route test password')
    integrate_app(app, auth)
    with TestClient(app) as owner, TestClient(app) as guest:
        owner.post('/api/auth/login', json={'username': 'owner', 'password': 'history route test password'})
        snapshot = owner.post('/api/storyboards', json={'source': 'legacy-id', 'document': document()}).json()
        yield app, owner, guest, snapshot


def test_existing_id_serves_the_app(histories):
    _, owner, _, _ = histories
    response = owner.get('/storyboard/legacy-id')
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/html')
    assert response.headers['cache-control'] == 'no-store'


def test_owner_source_resolves_the_existing_shared_original(histories):
    _, owner, _, original = histories
    snapshot = owner.get('/api/history/legacy-id').json()
    assert snapshot['id'] == original['id']
    assert snapshot['sourceId'] == 'legacy-id'
    assert snapshot['document']['title'] == 'Original'


def test_missing_history_does_not_create_a_document(histories):
    app, owner, _, _ = histories
    assert owner.get('/api/history/unknown').status_code == 404
    with app.state.storyboards.connect() as db:
        assert db.execute('SELECT count(*) FROM storyboards').fetchone()[0] == 1


def test_guest_cannot_read_a_guessable_owner_history_id(histories):
    _, _, guest, original = histories
    guest.get('/api/storyboards/' + original['token'])
    assert guest.get('/api/history/legacy-id').status_code == 401


def test_owner_shell_allows_browsing_but_private_history_still_requires_login(histories):
    _, _, guest, _ = histories
    response = guest.get('/storyboard/legacy-id', headers={'Accept': 'text/html'}, follow_redirects=False)
    assert response.status_code == 200
    assert response.headers['content-type'].startswith('text/html')
    assert response.headers['cache-control'] == 'no-store'
    assert guest.get('/api/history/legacy-id').status_code == 401
    assert guest.patch('/api/history/legacy-id', json={'title': 'unauthorized'}).status_code == 401


def test_unicode_source_ids_resolve_without_changing_identity(histories):
    _, owner, _, _ = histories
    source = '예전 제안서 2026/버전1'
    snapshot = owner.post('/api/storyboards', json={'source': source, 'document': document()}).json()
    result = owner.get('/api/history/' + quote(source, safe='')).json()
    assert result['id'] == snapshot['id']
    assert result['sourceId'] == source


def test_owner_read_does_not_change_permission_or_revision(histories):
    _, owner, _, original = histories
    result = owner.get('/api/history/legacy-id').json()
    assert result['permission'] == original['permission'] == 'view'
    assert result['revision'] == original['revision']


def test_owner_path_uses_latest_server_edits(histories):
    _, owner, _, original = histories
    owner.patch('/api/storyboards/' + original['token'], json={'operations': [change(['title'], 'Original', 'Saved title')]})
    result = owner.get('/api/history/legacy-id').json()
    assert result['document']['title'] == 'Saved title'
    assert result['id'] == original['id']


def test_local_owner_endpoint_does_not_leak_into_shared_document(histories):
    _, owner, _, _ = histories
    proposal = document()
    proposal['endPath'] = '/storyboard/browser-only'
    result = owner.post('/api/storyboards', json={'source': 'another', 'document': proposal}).json()
    assert 'endPath' not in result['document']
    assert 'id' not in result['document']


def test_owner_lookup_is_scoped_and_survives_restart(histories):
    app, owner, _, original = histories
    directory = app.state.storyboards.directory
    app.state.storyboards = StoryboardStore(directory)
    assert owner.get('/api/history/legacy-id').json()['id'] == original['id']
    with pytest.raises(HTTPException) as error:
        app.state.storyboards.get_by_source('legacy-id', 'user:someone-else')
    assert error.value.status_code == 404
