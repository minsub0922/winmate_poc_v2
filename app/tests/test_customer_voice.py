import copy

from fastapi.testclient import TestClient

from app.api.customer_voice import CustomerVoiceStore, build_router
from app.api.my_templates import TemplateStore
from app.tests.test_my_templates import make_app, PASSWORD


def feedback():
    return {'submission_id': 'voice_submission_123', 'message': '카드를 수정하던 중 위치가 어긋납니다.',
            'context': {'version': 1, 'opened': {'scroll': {'top': 100}}, 'current': {
                'route': {'name': 'proposal', 'id': 'proposal-123'}, 'path': '/storyboard/proposal-123',
                'work': {'type': 'proposal', 'id': 'proposal-123', 'stage': 'story'},
                'scroll': {'window': {'x': 0, 'y': 0}, 'containers': [{'path': '.story-canvas', 'top': 354, 'left': 72}]},
                'ui': {'controls': [{'label': '제목', 'value': '저장 전 수정한 제목'}]},
                'contexts': {'layout_editor': {'dirty': True, 'f': 'L_MY_example', 'html': '<div>수정 중</div>'}},
                'state': {'req': {'free': ['요구사항']}, 'api_key': 'private-key', '_share': {'token': 'secret-sharing-token'}},
            }}}


def test_context_is_durable_idempotent_and_does_not_include_credentials(tmp_path):
    database = TemplateStore(tmp_path / 'accounts.sqlite')
    store = CustomerVoiceStore(database)
    value = feedback()
    result = store.submit('member', value)
    assert store.submit('member', value)['id'] == result['id']
    assert store.list()['total'] == 1
    restored = CustomerVoiceStore(TemplateStore(database.path)).get(result['id'])
    assert restored['owner'] == 'member'
    assert restored['work_id'] == 'proposal-123'
    assert restored['context']['current']['scroll']['containers'][0]['top'] == 354
    assert restored['context']['current']['ui']['controls'][0]['value'] == '저장 전 수정한 제목'
    assert restored['context']['current']['state']['api_key'] == '[redacted]'
    assert restored['context']['current']['state']['_share']['token'] == '[redacted]'
    assert store.list()['unread'] == 1
    store.status(result['id'], 'reviewing')
    assert store.list()['unread'] == 0
    assert store.list(status='reviewing', q='proposal-123')['total'] == 1


def test_session_identity_admin_access_csrf_and_validation(tmp_path):
    app = make_app(tmp_path)
    app.state.customer_voice = CustomerVoiceStore(app.state.my_templates)
    app.include_router(build_router())
    with TestClient(app) as admin, TestClient(app) as member, TestClient(app) as guest:
        for client, username in ((admin, 'admin'), (member, 'member')):
            assert client.post('/api/auth/login', json={'username': username, 'password': PASSWORD}).status_code == 200
        assert guest.post('/api/customer-voice', json=feedback()).status_code == 401
        assert member.get('/api/admin/customer-voice').status_code == 403
        value = feedback() | {'owner': 'admin', 'role': 'admin'}
        result = member.post('/api/customer-voice', json=value)
        assert result.status_code == 200
        identifier = result.json()['id']
        assert member.get('/api/admin/customer-voice/' + identifier).status_code == 403
        assert member.patch('/api/admin/customer-voice/' + identifier, json={'status': 'closed'}).status_code == 403
        row = admin.get('/api/admin/customer-voice/' + identifier)
        assert row.status_code == 200 and row.json()['owner'] == 'member'
        assert row.headers['cache-control'] == 'no-store'
        assert admin.get('/api/admin/customer-voice?q=member').json()['total'] == 1
        assert member.post('/api/customer-voice', json=value).json()['duplicate']
        changed = copy.deepcopy(value); changed['message'] = '변경한 메시지'
        assert member.post('/api/customer-voice', json=changed).status_code == 409
        assert member.post('/api/customer-voice', json=value, headers={'Origin': 'https://unrelated.example'}).status_code == 403
        assert member.post('/api/customer-voice', json=value | {'message': '   '}).status_code == 422
        assert member.post('/api/customer-voice', json=value | {'message': 'x' * 5001}).status_code == 422
        assert member.post('/api/customer-voice', json=value, headers={'X-Winmate-User': 'admin'}).status_code == 409
        large = copy.deepcopy(value); large['context']['current']['large'] = 'x' * (800 * 1024)
        assert member.post('/api/customer-voice', json=large).status_code == 413
        assert admin.patch('/api/admin/customer-voice/' + identifier, json={'status': 'closed'}).status_code == 200
        assert admin.get('/api/admin/customer-voice?status=closed').json()['total'] == 1
        assert admin.patch('/api/admin/customer-voice/' + identifier, json={'status': 'unknown'}).status_code == 422
        assert admin.get('/api/admin/customer-voice/' + identifier).json()['status'] == 'closed'
