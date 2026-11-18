"""사용자 관리 활동 내역 (admin/activity.py) and the read-only inspection link into the webapp (app/api/inspect.py)."""
import json
import sqlite3
import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.routing import Mount

from app.api import telemetry
from app.api.account_data import AccountDataStore, build_router as account_data_router
from app.api.auth import Auth, AuthConfig, integrate_app
from app.api.inspect import InspectMiddleware
from admin.activity import Activity, activity_router as user_activity_router
from admin.observability import RequestTracing, admin_router
from admin.operations import Operations
from admin.users import Accounts

ADMIN_PASSWORD = 'Existing-admin-2026!'
SHARED = 'Shared-initial-password!'
DAY = 86400


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr('admin.users.DEFAULT_ITERATIONS', 1000)
    auth = Auth(AuthConfig(auth_dir=tmp_path / 'auth', iterations=1000))
    auth.set_credentials('admin', ADMIN_PASSWORD)
    ops = Operations(tmp_path / 'ops'); ops.accounts = Accounts(ops, auth)
    previous = telemetry.install(ops.receive)
    root = FastAPI(); integrate_app(root, auth); root.add_middleware(InspectMiddleware)
    root.state.account_data = AccountDataStore(tmp_path / 'account_data.sqlite')
    spatial = tmp_path / 'spatial.sqlite'
    with sqlite3.connect(spatial) as db:
        db.execute('CREATE TABLE scenes (owner TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,scene TEXT NOT NULL,view TEXT NOT NULL,revision INTEGER NOT NULL,'
                   'created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,example INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0,form TEXT,'
                   "status TEXT NOT NULL DEFAULT 'ready',scene_form_key TEXT,PRIMARY KEY(owner,id))")
    root.state.spatial_store = SimpleNamespace(filename=spatial)
    root.include_router(account_data_router())

    @root.get('/api/whoami')
    def whoami(request: __import__('fastapi').Request):
        identity = auth.read_token(request.cookies.get(auth.config.cookie_name))
        return {'u': identity and identity['u'], 'inspect': bool(identity and identity.get('inspect'))}

    activity = Activity(ops, lambda: root.state)
    console = FastAPI(); console.include_router(admin_router(ops, auth, activity)); console.include_router(user_activity_router(activity, auth))

    @console.middleware('http')
    async def guard(request, call_next):
        identity = auth.read_token(request.cookies.get(auth.config.cookie_name))
        if not identity or identity.get('role') != 'admin':
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail': 'denied'}, 403)
        return await call_next(request)
    app = Starlette(routes=[Mount('/admin', console), Mount('/', root)])
    app.add_middleware(RequestTracing, auth=auth, operations=ops)
    with TestClient(app) as client:
        client.post('/api/auth/login', json={'username': 'admin', 'password': ADMIN_PASSWORD}).raise_for_status()
        client.post('/admin/api/users', json={'usernames': 'alice,bob', 'password': SHARED}).raise_for_status()
        yield SimpleNamespace(c=client, ops=ops, auth=auth, root=root, activity=activity, spatial=spatial)
    telemetry.install(previous)


def login(c, username, password=SHARED):
    c.post('/api/auth/login', json={'username': username, 'password': password}).raise_for_status()


def put(store, owner, collection, record_id, data):
    result = store.write(owner, collection, {'items': [{'id': record_id, 'data': data, 'base_revision': 0, 'updated_at': data.get('updatedAt', 0)}]})
    assert result['applied'], result


def ms(seconds_ago):
    return int((time.time() - seconds_ago) * 1000)


def open_link(c, username, kind='proposal', record='p1'):
    response = c.get(f'/admin/api/users/{username}/open', params={'kind': kind, 'id': record}, follow_redirects=False)
    assert response.status_code == 303, response.text
    location = urlsplit(response.headers['location'])
    return location.path, parse_qs(location.fragment)


def test_inspection_reads_as_the_user_and_never_writes(env):
    c, store = env.c, env.root.state.account_data
    put(store, 'alice', 'proposals', 'p1', {'title': 'Alice deck', 'createdAt': ms(60), 'updatedAt': ms(30)})
    put(store, 'admin', 'proposals', 'mine', {'title': 'Admin deck', 'createdAt': ms(60)})
    path, fragment = open_link(env.c, 'alice')
    assert path == '/storyboard/p1' and fragment['open'] == ['proposal:p1']
    token = fragment['inspect'][0]
    header = {'X-Winmate-Inspect': token}

    listed = c.get('/api/account-data/proposals', headers=header)
    assert listed.status_code == 200 and listed.json()['owner'] == 'alice'
    assert [i['id'] for i in listed.json()['items']] == ['p1']
    assert listed.headers['cache-control'] == 'no-store'
    fetched = c.post('/api/account-data/proposals/fetch', headers=header, json={'ids': ['p1']}).json()
    assert fetched['items'][0]['data']['title'] == 'Alice deck'
    assert c.get('/api/account-data/proposals?inspect=' + token).json()['owner'] == 'alice'  # <img>-style address
    assert c.get('/api/whoami', headers=header).json() == {'u': 'alice', 'inspect': True}

    # Every write is refused — the header or the query, any collection, deletes too.
    for response in (c.post('/api/account-data/proposals', headers=header, json={'items': [{'id': 'p1', 'data': {'title': 'x'}, 'base_revision': 1}]}),
                     c.post('/api/account-data/proposals', headers=header, json={'deletes': [{'id': 'p1', 'base_revision': 1}]}),
                     c.post('/api/account-data/proposals?inspect=' + token, json={'items': [{'id': 'p2', 'data': {'title': 'x'}}]}),
                     c.put('/api/account-data/blobs/b1', headers={**header, 'Content-Type': 'image/png'}, content=b'png')):
        assert response.status_code in (403, 401), response.text
    assert c.post('/api/account-data/proposals', headers=header, json={'items': [{'id': 'p1', 'data': {}, 'base_revision': 1}]}).json()['code'] == 'inspect_read_only'
    assert store.fetch('alice', 'proposals', ['p1', 'p2'])['items'][0]['data']['title'] == 'Alice deck'
    assert store.fetch('alice', 'proposals', ['p2'])['items'][0].get('missing')

    # The admin's own tab (no token) is still the admin, and the visit is audited under the admin.
    assert c.get('/api/account-data/proposals').json()['owner'] == 'admin'
    audit = env.ops.one("SELECT username,metadata FROM spans WHERE kind='admin.user' AND action='inspect'")
    assert audit['username'] == 'admin' and json.loads(audit['metadata'])['target'] == 'alice'


def test_inspection_token_is_bound_to_the_admin_session(env):
    c = env.c
    _, fragment = open_link(c, 'alice', 'simulation', 's1')
    token = fragment['inspect'][0]
    header = {'X-Winmate-Inspect': token}
    assert c.get('/api/whoami', headers=header).json()['u'] == 'alice'
    tampered = token[:-2] + ('00' if not token.endswith('00') else '11')
    assert c.get('/api/whoami', headers={'X-Winmate-Inspect': tampered}).json()['code'] == 'inspect_expired'
    # A member's session cannot use it, and neither can a later session of the same admin.
    login(c, 'alice')
    assert c.get('/api/whoami', headers=header).status_code == 403
    login(c, 'admin', ADMIN_PASSWORD)
    assert c.get('/api/whoami', headers=header).json()['code'] == 'inspect_expired'
    # Only existing accounts and known record kinds can be opened.
    assert c.get('/admin/api/users/nobody/open', params={'kind': 'proposal', 'id': 'p1'}, follow_redirects=False).status_code == 404
    assert c.get('/admin/api/users/alice/open', params={'kind': 'secrets', 'id': 'p1'}, follow_redirects=False).status_code == 422
    home, fragment = open_link(c, 'alice', 'home', '')
    assert home == '/' and fragment['open'] == ['home']


def test_activity_counts_by_period_and_lists_records_with_their_tokens(env):
    store, ops = env.root.state.account_data, env.ops
    put(store, 'alice', 'proposals', 'p1', {'title': 'A 커피 제안서', 'customer': 'A 커피', 'stage': 'story', 'createdAt': ms(2 * DAY), 'updatedAt': ms(DAY),
                                            'parts': [{'id': 'a', 'layouts': [{'uid': '1', 'f': 'x'}, {'uid': '2', 'f': 'y'}]}], '_share': {'token': 't' * 40}})
    put(store, 'alice', 'proposals', 'old', {'title': 'Old deck', 'createdAt': ms(90 * DAY), 'updatedAt': ms(90 * DAY)})
    put(store, 'alice', 'proposals', 'sample', {'title': 'Sample deck', 'sample': {'id': 'bs01'}, 'createdAt': ms(DAY)})
    put(store, 'alice', 'simulations', 's1', {'status': 'active', 'setup': {'customer': 'A 커피'}, 'profile': {'name': '이준호', 'role': '본부장'}, 'msgs': [1, 2, 3], 'createdAt': ms(3 * DAY)})
    put(store, 'alice', 'buildings', 'bld-example', {'title': 'Example', 'example': True, 'createdAt': ms(DAY)})
    put(store, 'alice', 'buildings', 'b1', {'title': '본사 건물', 'floors': [1, 2, 3], 'createdAt': ms(DAY - 600)})  # newest record
    with sqlite3.connect(env.spatial) as db:
        db.execute("INSERT INTO scenes(owner,id,title,scene,view,revision,created_at,updated_at) VALUES ('alice','sp1','매장 조감도','{}','{}',1,?,?)", (ms(DAY), ms(DAY)))
    for page, tokens in (('proposal:p1', 1200), ('proposal:p1', 800), ('library:', 50)):
        ops.receive('llm.usage', {'username': 'alice', 'feature': 'fill', 'page': page, 'model': 'test-model', 'started': time.time() - 3600,
                                  'usage': {'promptTokenCount': tokens - 10, 'candidatesTokenCount': 10, 'totalTokenCount': tokens}})
    ops.receive('llm.usage', {'username': 'bob', 'feature': 'fill', 'page': 'proposal:p1', 'started': time.time() - 60, 'usage': {'totalTokenCount': 999}})
    ops.receive('client.error', {'username': 'alice', 'status': 'error', 'code': 'TypeError', 'started': time.time() - 60})
    ops.receive('http', {'username': 'alice', 'status': 'error', 'http_status': 404, 'started': time.time() - 60})

    summary = env.c.get('/admin/api/users/alice/activity', params={'start': time.strftime('%Y-%m-%d', time.gmtime(time.time() + 9 * 3600 - 29 * DAY))}).json()
    counts = summary['counts']
    assert counts['proposal'] == {'created': 1, 'active': 1, 'total': 2}  # the sample is not Alice's work; 'old' is outside the period
    assert counts['simulation']['created'] == 1 and counts['building']['created'] == 1 and counts['spatial']['created'] == 1
    assert summary['llm']['total_tokens'] == 2050 and summary['llm']['calls'] == 3
    assert summary['access']['errors'] == 1 and summary['access']['rejected'] == 1  # a 404 is a rejected request, not breakage
    assert summary['samples'] == 2 and sum(r['proposal'] for r in summary['series']['rows']) == 1
    assert sum(r['total_tokens'] for r in summary['series']['rows']) == 2050
    assert (summary['llm']['input_tokens'], summary['llm']['output_tokens']) == (2020, 30)
    assert sum(r['input_tokens'] for r in summary['series']['rows']) == 2020 and sum(r['output_tokens'] for r in summary['series']['rows']) == 30
    assert {(f['feature'], f['input_tokens'], f['output_tokens']) for f in summary['features']} == {('fill', 2020, 30)}

    items = env.c.get('/admin/api/users/alice/activity/items', params={'all': 'true'}).json()
    assert [r['id'] for r in items['items']] == ['b1', 'sp1', 'p1', 's1', 'old']
    deck = next(r for r in items['items'] if r['id'] == 'p1')
    assert deck['total_tokens'] == 2000 and deck['llm_calls'] == 2 and deck['sheets'] == 2 and deck['shared'] and deck['status'] == '스토리보드'
    assert (deck['input_tokens'], deck['output_tokens']) == (1980, 20)
    assert {r['id'] for r in env.c.get('/admin/api/users/alice/activity/items', params={'all': 'true', 'kind': 'birdseye'}).json()['items']} == {'b1', 'sp1'}
    assert env.c.get('/admin/api/users/alice/activity/items', params={'all': 'true', 'q': '커피'}).json()['total'] == 2
    with_samples = env.c.get('/admin/api/users/alice/activity/items', params={'all': 'true', 'samples': 'true'}).json()
    assert {'sample', 'bld-example'} <= {r['id'] for r in with_samples['items']}
    assert env.c.get('/admin/api/users/nobody/activity').status_code == 404


def test_user_list_has_segments_usage_and_sorting(env):
    store, ops = env.root.state.account_data, env.ops
    put(store, 'bob', 'proposals', 'p1', {'title': 'Bob deck', 'createdAt': ms(DAY)})
    put(store, 'bob', 'proposals', 'p2', {'title': 'Bob sample', 'sample': {'id': 'x'}, 'createdAt': ms(DAY)})
    ops.receive('llm.usage', {'username': 'bob', 'feature': 'fill', 'started': time.time() - 60, 'usage': {'totalTokenCount': 5000}})
    login(env.c, 'bob'); login(env.c, 'admin', ADMIN_PASSWORD)
    result = env.c.get('/admin/api/users', params={'sort': 'tokens'}).json()
    assert result['items'][0]['username'] == 'bob'
    bob = result['items'][0]
    assert bob['proposals'] == 1 and bob['tokens_30d'] == 5000 and bob['last_seen']
    assert result['stats']['total'] == 3 and result['stats']['never'] == 1  # alice has never logged in
    assert [u['username'] for u in env.c.get('/admin/api/users', params={'segment': 'never'}).json()['items']] == ['alice']
    assert [u['username'] for u in env.c.get('/admin/api/users', params={'segment': 'admin'}).json()['items']] == ['admin']
    assert [u['username'] for u in env.c.get('/admin/api/users', params={'sort': 'name'}).json()['items']] == ['admin', 'alice', 'bob']
    # 입력 · 출력 30일: listed apart and sortable apart
    ops.receive('llm.usage', {'username': 'alice', 'feature': 'fill', 'started': time.time() - 60, 'usage': {'promptTokenCount': 10, 'candidatesTokenCount': 900, 'totalTokenCount': 910}})
    ops.receive('llm.usage', {'username': 'bob', 'feature': 'fill', 'started': time.time() - 60, 'usage': {'promptTokenCount': 3000, 'candidatesTokenCount': 5, 'totalTokenCount': 3005}})
    by_output = env.c.get('/admin/api/users', params={'sort': 'output'}).json()['items']
    by_input = env.c.get('/admin/api/users', params={'sort': 'input'}).json()['items']
    assert [u['username'] for u in by_output[:2]] == ['alice', 'bob'] and [u['username'] for u in by_input[:2]] == ['bob', 'alice']
    assert (by_output[0]['input_30d'], by_output[0]['output_30d']) == (10, 900) and (by_input[0]['input_30d'], by_input[0]['output_30d']) == (3000, 5)


def test_user_trend_counts_everyone_by_day_and_leaves_admins_out(env):
    store, ops = env.root.state.account_data, env.ops
    put(store, 'alice', 'proposals', 'a1', {'title': 'A', 'createdAt': ms(60)})
    put(store, 'alice', 'proposals', 'a2', {'title': 'B', 'createdAt': ms(DAY + 60)})
    put(store, 'alice', 'proposals', 'sample', {'title': 'S', 'sample': {'id': 'x'}, 'createdAt': ms(60)})
    put(store, 'bob', 'proposals', 'b1', {'title': 'C', 'createdAt': ms(60)})
    put(store, 'admin', 'proposals', 'm1', {'title': 'Admin deck', 'createdAt': ms(60)})
    put(store, 'bob', 'simulations', 's1', {'status': 'active', 'createdAt': ms(60)})
    put(store, 'bob', 'buildings', 'bld', {'title': '건물', 'createdAt': ms(60)})
    with sqlite3.connect(env.spatial) as db:
        db.execute("INSERT INTO scenes(owner,id,title,scene,view,revision,created_at,updated_at) VALUES ('alice','sp1','조감도','{}','{}',1,?,?)", (ms(60), ms(60)))
    login(env.c, 'alice'); login(env.c, 'bob'); login(env.c, 'admin', ADMIN_PASSWORD)
    ops.receive('llm.usage', {'username': 'alice', 'feature': 'fill', 'started': time.time() - 60, 'usage': {'promptTokenCount': 900, 'candidatesTokenCount': 100, 'totalTokenCount': 1000}})
    ops.receive('llm.usage', {'username': 'admin', 'feature': 'fill', 'started': time.time() - 60, 'usage': {'promptTokenCount': 5000, 'candidatesTokenCount': 50, 'totalTokenCount': 5050}})

    trend = env.c.get('/admin/api/user-trend').json()
    assert len(trend['rows']) == 30 and trend['include_admin'] is False
    totals = trend['totals']
    assert (totals['proposal'], totals['simulation'], totals['birdseye']) == (3, 1, 2)  # samples and the admin's deck stay out
    assert (totals['login'], totals['input_tokens'], totals['output_tokens']) == (2, 900, 100)
    today = trend['rows'][-1]
    assert today['proposal'] == 2 and today['active'] == 2 and trend['rows'][-2]['proposal'] == 1
    everyone = env.c.get('/admin/api/user-trend', params={'include_admin': 'true'}).json()
    assert (everyone['totals']['proposal'], everyone['totals']['login'], everyone['totals']['input_tokens']) == (4, 4, 5900)  # the fixture's own admin login too
    assert everyone['rows'][-1]['active'] == 3
    assert len(env.c.get('/admin/api/user-trend', params={'start': time.strftime('%Y-%m-%d', time.gmtime(time.time() + 9 * 3600 - 6 * DAY))}).json()['rows']) == 7
    assert env.c.get('/admin/api/user-trend', params={'start': 'nope'}).status_code == 422
