"""원천 소스 점검 · 코드 에이전트 · 삭제 확인 — 격리 서비스와 가짜 도구 · 가짜 CLI 로 흐름을 검증한다. 네트워크 · 실제 에이전트 호출 없음."""
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import stat
import sys
import time

from fastapi.testclient import TestClient
import pytest

from admin import dss as dss_module, server
from admin.engine import EngineError
from admin.service import Service
from app.api.auth import Auth, AuthConfig

KST = timezone(timedelta(hours=9))

WATCH = '''import json, os, sys
out = sys.argv[sys.argv.index('--out') + 1]; channels = sys.argv[sys.argv.index('--channels') + 1].split(',')
state = json.load(open(os.path.join(os.path.dirname(__file__), 'watch-state.json')))
os.makedirs(out, exist_ok=True)
res = {'version': 1, 'channels': {c: {'label': c, 'status': state.get(c, 'same'), 'summary': c + ' ' + state.get(c, 'same'), 'changes': [{'status': 'changed', 'name': 'X', 'why': ['사양']}] if state.get(c) == 'changed' else [], 'errors': []} for c in channels}}
st = [v['status'] for v in res['channels'].values()]
res['status'] = 'failed' if 'failed' in st else 'changed' if 'changed' in st else 'same'; res['changed'] = 'changed' in st
print('@@progress 50 절반', flush=True)
json.dump(res, open(os.path.join(out, 'watch.json'), 'w'))
print('@@progress 100 점검 완료', flush=True)
sys.exit(2 if 'failed' in st else 0)
'''

DELETIONS = '''import json, os, sys
here = os.path.dirname(__file__)
data = json.load(open(os.path.join(here, 'candidates.json')))
if sys.argv[1] == 'list':
    print(json.dumps(data)); sys.exit(0)
ids = sys.argv[sys.argv.index('--ids') + 1].split(','); by = sys.argv[sys.argv.index('--by') + 1]; report = sys.argv[sys.argv.index('--report') + 1]
print('@@progress 40 연관 자료 반영', flush=True)
code = 1 if 'product:fails' in ids else 0
json.dump({'deleted': ids if not code else [], 'by': by}, open(report, 'w'))
if not code:
    data['candidates'] = [c for c in data['candidates'] if c['key'] not in ids]
    json.dump(data, open(os.path.join(here, 'candidates.json'), 'w'))
sys.exit(code)
'''

CLAUDE = '''#!%s
import json, os, sys
home = os.environ['CLAUDE_CONFIG_DIR']; flag = os.path.join(home, 'logged-in'); a = sys.argv[1:]
assert 'ANTHROPIC_API_KEY' not in os.environ
if a == ['--version']: print('9.9.9 (Fake Code)')
elif a[:2] == ['auth', 'status']: print(json.dumps({'loggedIn': os.path.exists(flag), 'authMethod': 'claude.ai' if os.path.exists(flag) else 'none', 'email': 'ops@example.test'}))
elif a[:2] == ['auth', 'logout']: os.path.exists(flag) and os.remove(flag)
elif a[:2] == ['auth', 'login']:
    print('Opening browser to sign in…'); print("If the browser didn't open, visit: https://auth.example.test/authorize?code=true&state=abc"); print('Paste code here if prompted > ', end='', flush=True)
    code = sys.stdin.readline().strip()
    if code != 'good-code-1234': print('Invalid code'); sys.exit(1)
    open(flag, 'w').write('1'); print('Login successful')
elif '-p' in a:
    prompt = sys.stdin.read(); open(os.path.join(home, 'last-prompt.txt'), 'w').write(prompt); open(os.path.join(home, 'last-args.json'), 'w').write(json.dumps(a))
    print(json.dumps({'type': 'system', 'subtype': 'init', 'model': 'fake'}), flush=True)
    print(json.dumps({'type': 'assistant', 'message': {'content': [{'type': 'tool_use', 'name': 'Bash', 'input': {'command': 'python3 proddb/build/dss/refcheck.py'}}]}}), flush=True)
    if 'FAIL-RUN' in prompt or os.path.exists(os.path.join(home, 'fail')):
        print(json.dumps({'type': 'result', 'subtype': 'error', 'is_error': True, 'result': '수집 실패'})); sys.exit(1)
    text = '끝났습니다.\\n@@result {"run_id": "dss-20991231-0900", "changed": 2, "new": 1, "deprecated": ["product:gone"], "unresolved": 0, "report": "proddb/reviews/x/REPORT.md"}'
    print(json.dumps({'type': 'assistant', 'message': {'content': [{'type': 'text', 'text': text}]}}), flush=True)
    print(json.dumps({'type': 'result', 'subtype': 'success', 'is_error': False, 'result': text, 'num_turns': 3, 'total_cost_usd': 0.0}))
else: sys.exit(2)
''' % sys.executable

CANDIDATES = {'generated_at': 'x', 'candidates': [
    {'key': 'product:gone', 'id': 'gone', 'kind': 'device', 'name': '단종 모니터', 'model': 'LS00', 'reason': '목록에서 빠짐', 'replacement': {'id': 'next', 'name': '후속 모니터'}, 'refs': [], 'blocked': []},
    {'key': 'product:fails', 'id': 'fails', 'kind': 'device', 'name': '검증 실패 제품', 'model': 'LS01', 'reason': '목록에서 빠짐', 'replacement': None, 'refs': [], 'blocked': []},
    {'key': 'product:text', 'id': 'text', 'kind': 'device', 'name': '글에 남은 제품', 'model': 'LS02', 'reason': '목록에서 빠짐', 'replacement': None,
     'refs': [{'area': '샘플 시나리오', 'file': 'vertical_scenarios.json', 'count': 2, 'action': 'manual'}], 'blocked': ['샘플 시나리오 글에 모델명이 남아 있음']}]}


@pytest.fixture
def env(tmp_path, monkeypatch):
    tools = tmp_path / 'tools'
    tools.mkdir()
    (tools / 'watch.py').write_text(WATCH)
    (tools / 'watch-state.json').write_text(json.dumps({'site': 'changed'}))
    (tools / 'deletions.py').write_text(DELETIONS)
    (tools / 'candidates.json').write_text(json.dumps(CANDIDATES))
    cli = tmp_path / 'fake-claude'
    cli.write_text(CLAUDE)
    cli.chmod(cli.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv('WINMATE_AGENT_CLAUDE_BIN', str(cli))
    monkeypatch.setenv('WINMATE_AGENT_CODEX_BIN', str(tmp_path / 'no-codex'))
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'must-not-reach-the-agent')
    monkeypatch.delenv('WINMATE_AGENT_GIT', raising=False)
    monkeypatch.setattr(dss_module, 'TOOLS', tools)
    svc = Service(tmp_path / 'state')
    svc.dss.staging = tmp_path / 'staging'
    svc.store.set_setting('dss_last_scheduled', None)  # 처음 켠 날 건너뛰기 표시를 지워, 아래 테스트가 시각을 직접 정한다
    auth = Auth(AuthConfig(auth_dir=tmp_path / 'auth'))
    auth.set_credentials('admin', 'isolated-test-password')
    monkeypatch.setattr(server, 'store', svc.store)
    monkeypatch.setattr(server, 'service', svc)
    monkeypatch.setattr(server.winmate.state, 'auth', auth)
    token, _ = auth.issue_token()
    with TestClient(server.api) as c:
        c.cookies.set(auth.config.cookie_name, token)
        yield c, svc, tools
    svc.close()


def done(svc, jid, seconds=30):
    deadline = time.time() + seconds
    while time.time() < deadline:
        job = svc.store.job(jid)
        if job['status'] not in ('queued', 'running'):
            return job
        time.sleep(0.05)
    raise AssertionError('job did not finish: ' + json.dumps(svc.store.job(jid), ensure_ascii=False))


def connect(c, svc):
    home = svc.dss.agents.home('claude')
    (home / 'logged-in').write_text('1')
    return home


def test_requires_admin_session(env):
    c, _, _ = env
    c.cookies.clear()
    assert c.get('/api/dss').status_code == 401
    assert c.post('/api/dss/check', json={}, headers={'origin': 'http://testserver'}).status_code == 401


def test_check_records_each_channel_and_latest_result(env):
    c, svc, tools = env
    job = c.post('/api/dss/check', json={'channels': ['ecat', 'site']}).json()
    finished = done(svc, job['id'])
    assert finished['status'] == 'succeeded' and finished['result']['changed'] is True
    assert finished['result']['channels'] == {'ecat': {'status': 'same', 'summary': 'ecat same'}, 'site': {'status': 'changed', 'summary': 'site changed'}}
    view = c.get('/api/dss').json()
    latest = {ch['id']: ch['latest'] for ch in view['channels']}
    assert latest['site']['status'] == 'changed' and latest['ecat']['status'] == 'same' and latest['subs'] is None
    assert view['checks'][0]['trigger'] == 'manual' and view['checks'][0]['changed'] == 1
    detail = c.get('/api/dss/checks/' + view['checks'][0]['id']).json()
    assert detail['result']['channels']['site']['changes'][0]['why'] == ['사양']
    # 채널 하나만 다시 점검해도 다른 채널의 최근 결과는 남는다
    (tools / 'watch-state.json').write_text(json.dumps({}))
    svc.dss.clock = lambda: datetime.now(KST) + timedelta(seconds=2)
    done(svc, c.post('/api/dss/check', json={'channels': ['site']}).json()['id'])
    latest = {ch['id']: ch['latest'] for ch in c.get('/api/dss').json()['channels']}
    assert latest['site']['status'] == 'same' and latest['ecat']['status'] == 'same'


def test_failed_channel_is_not_reported_as_unchanged(env):
    c, svc, tools = env
    (tools / 'watch-state.json').write_text(json.dumps({'site': 'failed'}))
    finished = done(svc, c.post('/api/dss/check', json={'channels': ['site']}).json()['id'])
    assert finished['status'] == 'succeeded' and finished['result']['status'] == 'failed' and finished['result']['changed'] is False
    assert c.get('/api/dss').json()['channels'][0]['latest']['status'] == 'failed'


def test_daily_schedule_runs_once_after_nine_and_catches_up(env):
    c, svc, _ = env
    day = datetime(2026, 11, 16, 8, 59, tzinfo=KST)
    svc.dss.clock = lambda: day
    assert svc.dss.schedule() == {'enabled': True, 'time': '09:00', 'channels': ['site', 'solutions', 'ecat', 'subs']}
    assert not svc.dss.due() and svc.dss.next_run() == '2026-11-16T09:00:00+09:00'
    svc.dss.tick()
    assert svc.store.one("SELECT count(*) n FROM jobs WHERE kind='dss-check'")['n'] == 0
    svc.dss.clock = lambda: day.replace(hour=11, minute=30)  # 9시에 서버가 꺼져 있었어도 켜지면 그날 한 번 돈다
    svc.dss.tick()
    job = svc.store.one("SELECT id FROM jobs WHERE kind='dss-check'")
    assert done(svc, job['id'])['status'] == 'succeeded'
    assert c.get('/api/dss').json()['checks'][0]['trigger'] == 'schedule'
    svc.dss.tick()
    assert svc.store.one("SELECT count(*) n FROM jobs WHERE kind='dss-check'")['n'] == 1 and svc.dss.next_run() == '2026-11-17T09:00:00+09:00'
    svc.dss.clock = lambda: day.replace(day=17, hour=9, minute=0)
    assert svc.dss.due()
    assert c.patch('/api/dss/schedule', json={'enabled': False}).json()['next'] is None
    assert not svc.dss.due()
    assert c.patch('/api/dss/schedule', json={'time': '25:00'}).status_code == 422
    assert c.patch('/api/dss/schedule', json={'enabled': True, 'time': '07:30', 'channels': ['ecat']}).json()['time'] == '07:30'


def test_new_store_started_after_nine_waits_until_tomorrow(tmp_path, monkeypatch):
    late = datetime(2026, 11, 16, 16, 20, tzinfo=KST)
    monkeypatch.setattr(dss_module.Dss, 'clock', staticmethod(lambda: late))
    svc = Service(tmp_path / 'late')
    try:
        assert not svc.dss.due() and svc.dss.next_run() == '2026-11-17T09:00:00+09:00'  # 켜자마자 전체 수집을 시작하지 않는다
        svc.dss.tick()
        assert svc.store.one("SELECT count(*) n FROM jobs")['n'] == 0
        monkeypatch.setattr(dss_module.Dss, 'clock', staticmethod(lambda: late + timedelta(hours=17)))
        assert svc.dss.due()
    finally:
        svc.close()
    monkeypatch.setattr(dss_module.Dss, 'clock', staticmethod(lambda: late.replace(hour=8)))
    early = Service(tmp_path / 'early')  # 점검 시각 전에 처음 켰으면 그날 09:00 에 돈다
    try:
        assert not early.dss.due() and early.dss.next_run() == '2026-11-16T09:00:00+09:00'
        monkeypatch.setattr(dss_module.Dss, 'clock', staticmethod(lambda: late.replace(hour=9, minute=0)))
        assert early.dss.due()
    finally:
        early.close()


def test_schedule_waits_while_another_source_job_runs(env):
    c, svc, _ = env
    svc.dss.clock = lambda: datetime(2026, 11, 16, 9, 1, tzinfo=KST)
    with svc.store.db() as db:
        db.execute("INSERT INTO jobs(id,kind,status,created_at,result) VALUES ('busy','dss-update','running','x','{}')")
    with pytest.raises(EngineError):
        svc.dss.tick()
    assert svc.store.setting('dss_last_scheduled') is None  # 표시를 남기지 않아 다음 주기에 다시 시도한다
    with svc.store.db() as db:
        db.execute("UPDATE jobs SET status='succeeded' WHERE id='busy'")
    svc.dss.tick()
    assert svc.store.setting('dss_last_scheduled') == '2026-11-16'


def test_oauth_login_passes_url_and_code_through_the_cli(env):
    c, svc, _ = env
    before = c.get('/api/dss/agent').json()
    claude, codex = before['providers']
    assert claude['installed'] and not claude['connected'] and claude['version'] == '9.9.9 (Fake Code)' and not codex['installed']
    assert c.post('/api/dss/agent/login', json={'provider': 'codex'}).status_code == 422
    login = c.post('/api/dss/agent/login', json={'provider': 'claude'}).json()
    assert login['state'] == 'waiting' and login['needs_code'] and login['url'] == 'https://auth.example.test/authorize?code=true&state=abc'
    assert c.post('/api/dss/agent/login/' + login['session'], json={'code': 'bad code!'}).status_code == 422
    assert c.post('/api/dss/agent/login/' + login['session'], json={'code': 'good-code-1234'}).json()['state'] == 'verifying'
    deadline = time.time() + 15
    while time.time() < deadline and c.get('/api/dss/agent/login/' + login['session']).json()['state'] != 'connected':
        time.sleep(0.1)
    assert c.get('/api/dss/agent/login/' + login['session']).json()['state'] == 'connected'
    after = c.get('/api/dss/agent').json()['providers'][0]
    assert after['connected'] and after['account'] == 'ops@example.test'
    assert not c.post('/api/dss/agent/logout', json={'provider': 'claude'}).json()['connected']


def test_wrong_code_fails_and_login_can_be_cancelled(env):
    c, svc, _ = env
    login = c.post('/api/dss/agent/login', json={'provider': 'claude'}).json()
    c.post('/api/dss/agent/login/' + login['session'], json={'code': 'wrong-code-0000'})
    deadline = time.time() + 15
    while time.time() < deadline and c.get('/api/dss/agent/login/' + login['session']).json()['state'] == 'verifying':
        time.sleep(0.1)
    failed = c.get('/api/dss/agent/login/' + login['session']).json()
    assert failed['state'] == 'failed' and 'Invalid code' in failed['error']
    second = c.post('/api/dss/agent/login', json={'provider': 'claude'}).json()
    assert c.delete('/api/dss/agent/login/' + second['session']).json()['state'] == 'cancelled'
    assert not c.get('/api/dss/agent').json()['providers'][0]['connected']


def test_update_runs_the_fixed_channel_prompt_through_the_agent(env):
    c, svc, _ = env
    assert c.post('/api/dss/update', json={'channel': 'site'}).status_code == 422  # 연결 전
    home = connect(c, svc)
    assert c.post('/api/dss/update', json={'channel': 'nope'}).status_code == 422
    prompts = {p['id']: p['prompt'] for p in c.get('/api/dss/prompts').json()['channels']}
    assert set(prompts) == {'site', 'solutions', 'ecat', 'subs'}
    job = done(svc, c.post('/api/dss/update', json={'channel': 'ecat'}).json()['id'])
    assert job['status'] == 'succeeded', job
    assert job['result']['summary'] == {'run_id': 'dss-20991231-0900', 'changed': 2, 'new': 1, 'deprecated': ['product:gone'], 'unresolved': 0, 'report': 'proddb/reviews/x/REPORT.md'}
    sent = (home / 'last-prompt.txt').read_text()
    assert sent == prompts['ecat']  # 화면에 보여 준 고정 프롬프트 그대로
    assert '.agents/skills/winmate-update-dss-db/SKILL.md' in sent and 'e-카탈로그' in sent and 'deletions.py' in sent and '지우지 않는다' in sent
    assert 'cascade.py' in sent and 'refcheck.py' in sent and '커밋 · 푸시는 하지 않는다' in sent
    args = json.loads((home / 'last-args.json').read_text())
    assert 'Bash(git push:*)' in args and 'Bash(git commit:*)' in args and '--dangerously-skip-permissions' not in args
    run = c.get('/api/dss').json()['runs'][0]
    assert run['kind'] == 'update' and run['channel'] == 'ecat' and run['status'] == 'succeeded' and run['provider'] == 'claude' and run['actor'] == 'admin'
    detail = c.get('/api/dss/runs/' + run['id']).json()
    assert detail['prompt'] == sent
    log = c.get('/api/dss/runs/' + run['id'] + '/log').json()['text']
    assert '[도구] Bash: python3 proddb/build/dss/refcheck.py' in log and '[결과] 완료' in log
    assert c.get('/api/dss/runs/..%2F..%2Fx/log').status_code in (400, 404)


def test_update_uses_todays_staged_check_and_failed_agent_run_is_reported(env):
    c, svc, _ = env
    home = connect(c, svc)
    done(svc, c.post('/api/dss/check', json={'channels': ['site']}).json()['id'])
    job = done(svc, c.post('/api/dss/update', json={'channel': 'site'}).json()['id'])
    sent = (home / 'last-prompt.txt').read_text()
    assert job['status'] == 'succeeded' and 'watch.json' in sent and str(svc.dss.staging) in sent
    (home / 'fail').write_text('1')
    svc.dss.clock = lambda: datetime.now(KST) + timedelta(seconds=2)
    failed = done(svc, c.post('/api/dss/update', json={'channel': 'site'}).json()['id'])
    assert failed['status'] == 'failed' and '수집 실패' in failed['error']
    assert c.get('/api/dss').json()['runs'][0]['status'] == 'failed'


def test_deletion_needs_explicit_confirmation_of_current_candidates(env):
    c, svc, tools = env
    listed = c.get('/api/dss/deletions').json()['candidates']
    assert [x['key'] for x in listed] == ['product:gone', 'product:fails', 'product:text']
    assert c.post('/api/dss/deletions', json={'ids': ['product:gone']}).status_code == 422                       # 확인 없음
    assert c.post('/api/dss/deletions', json={'ids': ['product:gone'], 'confirm': True, 'expected': 2}).status_code == 422  # 확인한 수와 다름
    assert c.post('/api/dss/deletions', json={'ids': ['product:other'], 'confirm': True, 'expected': 1}).status_code == 422  # 후보가 아님
    assert c.post('/api/dss/deletions', json={'ids': ['product:text'], 'confirm': True, 'expected': 1}).status_code == 409   # 글 정리 먼저
    assert c.post('/api/jobs', json={'kind': 'dss-delete'}).status_code == 422                                   # 일반 작업 API 로는 못 돌린다
    paired = json.loads(json.dumps(CANDIDATES))
    paired['candidates'][0]['depends_on'] = ['product:fails']                                                   # gone 을 대체로 삼은 후보가 있다
    (tools / 'candidates.json').write_text(json.dumps(paired))
    assert c.post('/api/dss/deletions', json={'ids': ['product:gone'], 'confirm': True, 'expected': 1}).status_code == 409   # 함께 지워야 함
    (tools / 'candidates.json').write_text(json.dumps(CANDIDATES))
    assert json.loads((tools / 'candidates.json').read_text()) == CANDIDATES
    job = done(svc, c.post('/api/dss/deletions', json={'ids': ['product:gone'], 'confirm': True, 'expected': 1}).json()['id'])
    assert job['status'] == 'succeeded' and job['result']['deleted'] == ['product:gone'] and job['result']['report']['by'] == 'admin'
    assert [x['key'] for x in c.get('/api/dss/deletions').json()['candidates']] == ['product:fails', 'product:text']
    assert svc.store.one("SELECT actor,detail FROM events WHERE action='dss.delete'")['actor'] == 'admin'
    run = c.get('/api/dss').json()['runs'][0]
    assert run['kind'] == 'delete' and run['status'] == 'succeeded' and run['input']['ids'] == ['product:gone']


def test_failed_deletion_is_reported_and_blocked_items_go_to_the_agent(env):
    c, svc, _ = env
    svc.dss.clock = lambda: datetime.now(KST)
    failed = done(svc, c.post('/api/dss/deletions', json={'ids': ['product:fails'], 'confirm': True, 'expected': 1}).json()['id'])
    assert failed['status'] == 'failed' and '되돌렸습니다' in failed['error']
    assert c.post('/api/dss/deletions/prepare', json={'ids': ['product:text']}).status_code == 422  # 에이전트 연결 전
    home = connect(c, svc)
    svc.dss.clock = lambda: datetime.now(KST) + timedelta(seconds=2)
    job = done(svc, c.post('/api/dss/deletions/prepare', json={'ids': ['product:text']}).json()['id'])
    sent = (home / 'last-prompt.txt').read_text()
    assert job['status'] == 'succeeded' and 'product:text' in sent and '삭제 자체는 하지 않는다' in sent
    assert c.get('/api/dss').json()['runs'][0]['kind'] == 'cascade'


def test_source_jobs_never_overlap(env):
    c, svc, _ = env
    with svc.store.db() as db:
        db.execute("INSERT INTO jobs(id,kind,status,created_at,result) VALUES ('busy','dss-check','running','x','{\"input\":{\"trigger\":\"manual\",\"channels\":[\"ecat\"]}}')")
    assert c.post('/api/dss/check', json={'channels': ['ecat']}).json()['id'] == 'busy'      # 같은 요청은 진행 중인 작업으로
    assert c.post('/api/dss/check', json={'channels': ['site']}).status_code == 422          # 다른 소스 작업은 끝난 뒤에
    assert c.post('/api/dss/deletions', json={'ids': ['product:gone'], 'confirm': True, 'expected': 1}).status_code == 422
