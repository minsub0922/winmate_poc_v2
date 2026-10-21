"""Identity, isolation and exact usage accounting. Provider replies here are transport fixtures, not live model evidence."""
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timezone
import io
import json
from pathlib import Path
import threading
import time
import urllib.error
from contextvars import copy_context

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.routing import Mount

from app.api import telemetry
from app.api.auth import Auth,AuthConfig,integrate_app
from app.api.poc.jobs import JobManager,NotFound
from app.api.poc.provider import GeminiProvider,ProviderError
from app.api.poc.settings import load_settings
from admin.operations import Operations
from admin.users import Accounts
from admin.engine import EngineError
from admin.observability import RequestTracing,activity_router,admin_router


@pytest.fixture(autouse=True)
def isolated_provider_queue(tmp_path,monkeypatch):
    from app.api.llm.queue import CallQueue,SQLiteBroker
    monkeypatch.setattr('app.api.llm.provider.create_queue',lambda settings:CallQueue(
        SQLiteBroker(tmp_path/'llm-queue.sqlite',window=.005),rpm=settings.rpm,
        concurrency=settings.concurrency,timeout=settings.queue_timeout))


@pytest.fixture
def state(tmp_path,monkeypatch):
    monkeypatch.setattr('admin.users.DEFAULT_ITERATIONS',1000)
    auth=Auth(AuthConfig(auth_dir=tmp_path/'auth',iterations=1000))
    auth.set_credentials('admin','Existing-admin-2026!')
    old_token,_=auth.issue_token()
    ops=Operations(tmp_path/'ops');accounts=Accounts(ops,auth);ops.accounts=accounts
    previous=telemetry.install(ops.receive)
    yield ops,accounts,auth,old_token
    telemetry.install(previous)


def test_legacy_password_and_session_are_preserved(state):
    ops,accounts,auth,old_token=state
    assert auth.verify_password('admin','Existing-admin-2026!')
    assert auth.read_token(old_token)['role']=='admin'
    assert accounts.list()['items'][0]['credential_source']=='legacy'


def test_batch_users_share_one_password_with_distinct_salts(state):
    ops,accounts,auth,_=state
    result=accounts.create(' alice, bob , carol\n dave','One-password,for-all!')
    assert result['users']==['alice','bob','carol','dave']
    for name in result['users']:
        assert auth.verify_password(name,'One-password,for-all!')
        token,_=auth.issue_token(name)
        assert auth.read_token(token)['u']==name
        assert auth.read_token(token)['role']=='member'
    assert len({row['salt'] for row in ops.rows("SELECT salt FROM users WHERE credential_source='managed'")})==4
    listed=json.dumps(accounts.list())
    assert 'password_hash' not in listed and 'One-password' not in listed


def test_auto_password_is_one_value_and_never_saved(state):
    ops,accounts,auth,_=state
    result=accounts.create('alice,bob')
    password=result['initial_password']
    assert len(password)>=12
    assert auth.verify_password('alice',password) and auth.verify_password('bob',password)
    assert password not in json.dumps(ops.rows('SELECT * FROM users'))
    assert password not in json.dumps(ops.rows('SELECT * FROM spans'))


@pytest.mark.parametrize('names',['',',,,','alice,alice','alice, bad name','system','anonymous','guest',','.join('u'+str(i) for i in range(51))])
def test_bad_batch_is_rejected_without_partial_creation(state,names):
    ops,accounts,auth,_=state
    with pytest.raises(EngineError):accounts.create(names)
    assert accounts.list()['total']==1


def test_existing_name_rejects_whole_batch(state):
    ops,accounts,auth,_=state
    accounts.create('alice')
    with pytest.raises(EngineError):accounts.create('bob,alice')
    assert not ops.one("SELECT 1 FROM users WHERE username='bob'")


def test_deactivation_reset_and_roles_take_effect_for_existing_tokens(state):
    ops,accounts,auth,_=state
    accounts.create('alice,bob','First-shared-password!')
    a,_=auth.issue_token('alice');b,_=auth.issue_token('bob')
    accounts.edit('alice',active=False)
    assert auth.read_token(a) is None and auth.read_token(b)
    accounts.edit('alice',active=True,role='admin')
    assert auth.read_token(a) is None
    a,_=auth.issue_token('alice')
    assert auth.read_token(a)['role']=='admin'
    accounts.reset('alice,bob','New-shared-password!')
    assert auth.read_token(a) is None and auth.read_token(b) is None
    assert auth.verify_password('alice','New-shared-password!') and auth.verify_password('bob','New-shared-password!')


def test_last_admin_cannot_be_disabled_or_demoted(state):
    ops,accounts,auth,_=state
    with pytest.raises(EngineError):accounts.edit('admin',active=False)
    with pytest.raises(EngineError):accounts.edit('admin',role='member')
    accounts.create('second_admin',role='admin')
    accounts.edit('admin',active=False)
    assert not auth.verify_password('admin','Existing-admin-2026!')


def test_history_preserves_full_documents_versions_and_removed_records(state):
    ops,accounts,auth,_=state
    record={'id':'p1','title':'Original','text':'x'*50000,'slides':[{'i':i} for i in range(350)],'password':'do-not-log-me'}
    ops.save_history('alice','proposal',[record],True)
    ops.save_history('alice','proposal',[record],True)
    assert ops.one('SELECT count(*) n FROM history_versions')['n']==1
    row=ops.one('SELECT * FROM history');data=json.loads(row['payload'])
    assert len(data['text'])==50000 and len(data['slides'])==350
    assert data['password']=='[redacted]'
    ops.save_history('alice','proposal',[{**record,'title':'Updated'}],True)
    ops.save_history('alice','proposal',[],True)
    assert ops.one('SELECT archived FROM history')['archived']==1
    assert ops.one('SELECT count(*) n FROM history_versions')['n']==2
    ops.save_history('bob','proposal',[{'id':'p1','title':'Different owner'}])
    assert len(ops.rows('SELECT * FROM history'))==2


def test_usage_total_is_reported_not_reconstructed_and_filters_use_kst(state):
    ops,accounts,auth,_=state
    at=datetime(2026,10,19,15,1,tzinfo=timezone.utc).timestamp()
    ops.receive('llm.usage',{'username':'alice','feature':'review','started':at,'ended':at+1,'status':'ok','model':'model-fixture','usage':{'promptTokenCount':100,'candidatesTokenCount':20,'thoughtsTokenCount':10,'cachedContentTokenCount':30,'totalTokenCount':130}})
    ops.receive('llm.usage',{'username':'bob','feature':'layout','started':at,'status':'error','usage':None})
    result=ops.dashboard(start='2026-10-20',end='2026-10-20',username='alice',feature='review')
    s=result['summary'];assert s['total_tokens']==130 and s['input_tokens']==100 and s['thought_tokens']==10 and s['cached_tokens']==30
    assert result['bucket']=='hour' and len(result['series'])==24
    assert ops.dashboard(start='2026-10-19',end='2026-10-19')['summary']['llm_calls'] is None
    assert ops.dashboard(start='2026-10-20',end='2026-10-20',username='bob')['summary']['unknown_usage']==1


def test_partial_usage_is_not_fabricated(state):
    ops,accounts,auth,_=state
    ops.receive('llm.usage',{'username':'alice','usage':{'promptTokenCount':7,'candidatesTokenCount':2}})
    row=ops.one("SELECT * FROM spans WHERE kind='llm.usage'")
    assert row['total_tokens'] is None
    assert ops.dashboard(username='alice')['summary']['unknown_usage']==1


def test_failures_keep_safe_stack_and_do_not_store_keys(state):
    ops,accounts,auth,_=state
    ops.receive('http',{'username':'alice','status':'error','message':'api_key=abcdef-secret','stack':'Traceback\npassword=some-secret','metadata':{'password':'plain-password','authorization':'Bearer secret'}})
    raw=json.dumps(ops.rows('SELECT * FROM spans'))
    assert 'plain-password' not in raw and 'Bearer secret' not in raw and 'abcdef-secret' not in raw


def provider(reply):
    settings=load_settings(environ={'WINMATE_LLM_PROVIDER':'gemini','GEMINI_API_KEY':'transport-fixture-only','WINMATE_LLM_RPM':'42'},env_files=())
    p=GeminiProvider(settings,urlopen=reply);p.min_gap=0;p._sleep=lambda *a,**k:None
    return p


def response(text='{"ok":true}',usage=None,finish='STOP'):
    return {'candidates':[{'content':{'parts':[{'text':text}]},'finishReason':finish}],**({'usageMetadata':usage} if usage is not None else {})}


def test_provider_accounts_for_each_retry_transport_and_cache_hit(state,tmp_path):
    ops,accounts,auth,_=state
    replies=[response('{"ok":true}',{'promptTokenCount':7,'candidatesTokenCount':3,'totalTokenCount':10},'MAX_TOKENS'),response('{"ok":true}',{'promptTokenCount':8,'candidatesTokenCount':2,'totalTokenCount':10})]
    def open_reply(*args,**kwargs):return io.BytesIO(json.dumps(replies.pop(0)).encode())
    p=provider(open_reply);p.cache_dir=tmp_path/'cache'
    with telemetry.scope(username='alice',role='member',trace_id='retry-fixture-123456',feature='review'):
        p.generate_json(stage='test:retry',user='transport-fixture',max_attempts=2)
        p.generate_json(stage='test:retry',user='transport-fixture',max_attempts=2)
    rows=ops.rows("SELECT * FROM spans WHERE kind='llm.usage'")
    assert len(rows)==2 and sum(r['total_tokens'] for r in rows)==20
    assert all(r['username']=='alice' and r['feature']=='review' for r in rows)
    assert ops.one("SELECT count(*) n FROM spans WHERE kind='llm.logical' AND status='cached'")['n']==1


def test_streaming_usage_is_cumulative_not_added_twice(state):
    ops,accounts,auth,_=state
    chunks=[response('hello',{'promptTokenCount':10,'candidatesTokenCount':1,'totalTokenCount':11}),response(' world',{'promptTokenCount':10,'candidatesTokenCount':3,'thoughtsTokenCount':2,'totalTokenCount':15})]
    p=provider(lambda *a,**k:io.BytesIO(('\n'.join('data: '+json.dumps(c) for c in chunks)+'\n').encode()))
    with telemetry.scope(username='bob',role='member',feature='simulation',trace_id='stream-fixture-1234'):
        assert list(p.stream_text(stage='test:stream',user='transport-fixture'))[-1]=='hello world'
    rows=ops.rows("SELECT * FROM spans WHERE kind='llm.usage'")
    assert len(rows)==1 and rows[0]['total_tokens']==15 and rows[0]['thought_tokens']==2


def test_stream_can_cross_request_worker_contexts_without_leaking_identity(state):
    ops,accounts,auth,_=state
    chunks=[response('one',{'promptTokenCount':3,'totalTokenCount':4}),response(' two',{'promptTokenCount':3,'candidatesTokenCount':2,'totalTokenCount':5})]
    p=provider(lambda *a,**k:io.BytesIO(('\n'.join('data: '+json.dumps(c) for c in chunks)+'\n').encode()))
    with telemetry.scope(username='alice',role='member',trace_id='context-stream-12345',span_id='http-original'):
        generator=p.stream_text(stage='test:contexts',user='fixture')
        first=copy_context();second=copy_context()
        assert first.run(next,generator)=='one'
        assert telemetry.current()['span_id']=='http-original'
        assert second.run(next,generator)=='one two'
        with pytest.raises(StopIteration):second.run(next,generator)
    row=ops.one("SELECT username,total_tokens FROM spans WHERE kind='llm.usage'")
    assert row['username']=='alice' and row['total_tokens']==5


def test_unknown_usage_remains_unknown_when_transport_fails(state):
    ops,accounts,auth,_=state
    def unavailable(*a,**k):raise urllib.error.URLError('unavailable')
    p=provider(unavailable)
    with telemetry.scope(username='alice',trace_id='network-fixture-1234'):
        with pytest.raises(ProviderError):p.generate_json(stage='test:network',user='fixture',max_attempts=1)
    row=ops.one("SELECT * FROM spans WHERE kind='llm.usage'")
    assert row['total_tokens'] is None and row['status']=='error'


def test_sse_application_validation_failure_is_logged_even_with_http_200(state):
    from app.api.poc.adapters.llm import LlmRequest,open_stream
    ops,accounts,auth,_=state
    chunk=response('invalid json',{'promptTokenCount':4,'candidatesTokenCount':3,'totalTokenCount':7})
    p=provider(lambda *a,**k:io.BytesIO(('data: '+json.dumps(chunk)+'\n').encode()))
    with telemetry.scope(username='alice',feature='review',trace_id='invalid-sse-123456'):
        frames=list(open_stream(LlmRequest('json','fixture',None,'normal',None,'review'),p))
    assert frames[-1]['type']=='error'
    row=ops.one("SELECT code,username FROM spans WHERE kind='application.error'")
    assert row['username']=='alice' and row['code']=='invalid_json'


def test_background_jobs_preserve_context_and_enforce_owner(state):
    ops,accounts,auth,_=state
    manager=JobManager(workers=2)
    barrier=threading.Barrier(2)
    def work(job):barrier.wait(timeout=3);return {'owner':telemetry.current().get('username')}
    with telemetry.scope(username='alice',role='member',trace_id='alice-job-12345'):
        a=manager.submit('rfp','Alice',{},work)
    with telemetry.scope(username='bob',role='member',trace_id='bob-job-1234567'):
        b=manager.submit('rfp','Bob',{},work)
    for _ in range(300):
        if a.terminal and b.terminal:break
        time.sleep(.01)
    assert a.result['owner']=='alice' and b.result['owner']=='bob'
    with telemetry.scope(username='alice',role='member'):
        with pytest.raises(NotFound):manager.get(b.id)
        assert manager.recent()[0]['id']==a.id
    with telemetry.scope(username='admin',role='admin'):assert manager.get(b.id).id==b.id
    assert ops.one("SELECT count(*) n FROM history WHERE kind='server_job'")['n']==2


@pytest.fixture
def api_client(state,monkeypatch):
    ops,accounts,auth,_=state
    root=FastAPI();integrate_app(root,auth);root.include_router(activity_router(ops))
    console=FastAPI();console.include_router(admin_router(ops,auth))
    @console.middleware('http')
    async def guard(request,call_next):
        identity=auth.read_token(request.cookies.get(auth.config.cookie_name))
        if not identity or identity.get('role')!='admin':
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail':'denied'},403)
        return await call_next(request)
    app=Starlette(routes=[Mount('/admin',console),Mount('/',root)])
    app.add_middleware(RequestTracing,auth=auth,operations=ops)
    with TestClient(app) as client:
        client.post('/api/auth/login',json={'username':'admin','password':'Existing-admin-2026!'}).raise_for_status()
        yield client,ops,auth


def test_admin_creation_and_member_history_isolation(api_client):
    c,ops,auth=api_client
    created=c.post('/admin/api/users',json={'usernames':'alice,bob','password':'Shared-initial-password!'}).json()
    assert created['users']==['alice','bob']
    c.post('/api/auth/login',json={'username':'alice','password':'Shared-initial-password!'}).raise_for_status()
    assert c.get('/admin/api/users').status_code==403
    c.post('/api/activity/history',json={'kind':'proposal','username':'bob','records':[{'id':'p1','title':'Alice only'}]}).raise_for_status()
    assert ops.one("SELECT username FROM history WHERE record_id='p1'")['username']=='alice'
    c.post('/api/auth/login',json={'username':'bob','password':'Shared-initial-password!'}).raise_for_status()
    assert c.get('/api/activity/history').json()['items']==[]


def test_client_actor_cannot_be_spoofed_and_ids_do_not_collide(api_client):
    c,ops,auth=api_client
    event={'id':'same-id','kind':'screen.enter','username':'bob','page':'library','trace_id':'events-fixture-1234'}
    c.post('/api/activity/events',json={'events':[event]}).raise_for_status()
    c.post('/api/activity/events',json={'events':[event]}).raise_for_status()
    row=ops.one("SELECT username FROM spans WHERE kind='screen.enter'")
    assert row['username']=='admin'
    assert ops.one("SELECT count(*) n FROM spans WHERE kind='screen.enter'")['n']==1
    c.post('/api/auth/login',json={'username':'admin','password':'Existing-admin-2026!'}).raise_for_status()
    c.post('/api/activity/events',json={'events':[event]}).raise_for_status()
    assert ops.one("SELECT count(*) n FROM spans WHERE kind='screen.enter'")['n']==1
    assert c.post('/api/activity/events',headers={'X-Winmate-User':'bob'},json={'events':[event]}).status_code==409


def test_self_reset_rotates_session_without_losing_generated_password(api_client):
    c,ops,auth=api_client
    old=c.cookies.get(auth.config.cookie_name)
    response=c.post('/admin/api/users/reset-password',json={'usernames':'admin'})
    response.raise_for_status();password=response.json()['initial_password']
    assert auth.verify_password('admin',password)
    assert auth.read_token(old) is None
    assert c.get('/admin/api/users').status_code==200
    assert password not in json.dumps(ops.rows('SELECT * FROM spans'))


def test_user_filters_include_unverified_login_attempts(api_client):
    c,ops,auth=api_client
    c.post('/admin/api/users',json={'usernames':'someone','password':'Known-user-password!'}).raise_for_status()
    c.post('/api/auth/logout')
    assert c.post('/api/auth/login',json={'username':'someone','password':'Incorrect-password!'}).status_code==401
    result=ops.dashboard(username='someone')
    assert result['summary']['errors']==1
    row=ops.one("SELECT username,metadata FROM spans WHERE kind='auth.login' AND status='error'")
    assert row['username']=='anonymous' and json.loads(row['metadata'])['attempted_username']=='someone'


def test_partial_browser_snapshot_does_not_archive_other_devices(api_client):
    c,ops,auth=api_client
    ops.save_history('admin','proposal',[{'id':'device_a','title':'A'},{'id':'device_b','title':'B'}])
    c.post('/api/activity/history',json={'kind':'proposal','records':[{'id':'device_a','title':'Updated A'}],'complete':True}).raise_for_status()
    assert ops.one("SELECT archived FROM history WHERE record_id='device_b'")['archived']==0
    c.post('/api/activity/history',json={'kind':'proposal','records':[],'removed_ids':['device_a']}).raise_for_status()
    assert ops.one("SELECT archived FROM history WHERE record_id='device_a'")['archived']==1
    assert ops.one("SELECT archived FROM history WHERE record_id='device_b'")['archived']==0


def test_client_cannot_overwrite_server_audit_and_personas_sync(api_client):
    c,ops,auth=api_client
    assert c.post('/api/activity/history',json={'kind':'server_job','records':[{'id':'fake'}]}).status_code==422
    c.post('/api/activity/history',json={'kind':'persona','records':[{'key':'custom_persona','name':'Customer fixture'}]}).raise_for_status()
    assert ops.one("SELECT record_id FROM history WHERE kind='persona'")['record_id']=='custom_persona'


def test_unknown_username_is_not_retained_as_possible_plaintext_password(api_client):
    c,ops,auth=api_client
    c.post('/api/auth/logout')
    candidate='MayBePassword2026'
    c.post('/api/auth/login',json={'username':candidate,'password':'Incorrect-password!'} )
    assert candidate not in json.dumps(ops.rows('SELECT * FROM spans'))


def test_global_limit_still_blocks_password_spraying(state):
    ops,accounts,auth,_=state
    for i in range(auth.config.global_failures):auth.limiter.failure('127.0.0.1:unknown'+str(i))
    assert auth.limiter.retry_after('127.0.0.1:another-user')>0
