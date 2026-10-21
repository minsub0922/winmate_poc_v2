"""Opt-in real Gemini smoke test against an isolated admin server. No fake model output."""
import json
import os
from pathlib import Path
import time
import httpx

base = os.environ.get('WINMATE_ADMIN_TEST_URL', 'http://127.0.0.1:8794')
out = Path(__file__).resolve().parents[1] / 'runtime/evidence'
out.mkdir(parents=True, exist_ok=True)
results = []
client = httpx.Client(base_url=base, timeout=30)
r = client.post('/api/auth/login', json={'username': 'admin', 'password': 'Admin-local-test-2026!'})
r.raise_for_status()


def wait(job):
    start = time.monotonic()
    while time.monotonic() - start < 180:
        r = client.get('/admin/api/jobs/' + job['id'])
        r.raise_for_status()
        value = r.json()
        if value['status'] not in ('queued', 'running'):
            return value
        time.sleep(.6)
    raise RuntimeError('Live job exceeded 180 seconds')


def submit(kind, source=None, **extra):
    r = client.post('/admin/api/jobs', json={'kind': kind, 'source_id': source, **extra})
    r.raise_for_status()
    return wait(r.json())


def save(name, result):
    results.append({'test': name, 'status': result.get('status'), 'job_id': result.get('id'), 'error': result.get('error')})
    (out / (name + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(name, result.get('status'), result.get('error') or '', flush=True)


check = submit('check', 'catalogs')
save('live-catalog-freshness', check)
assert check['status'] == 'succeeded', check['error']
decision = check['result']['sources'][0]['decision']
assert decision['engine']['model'] and decision['evidence']
assert check['result']['sources'][0]['evidence']['items']

text = '''이 자료는 Winmate 관리 기능 검증에만 사용하는 합성 문서입니다.
실제 삼성 제품이나 판매 사양이 아닙니다.
제품명: WMT 데모 디스플레이
모델코드: WMT-DEMO-2026
화면 크기: 55형
설치 공간: 회의실
용도: 회의 일정 안내 표시
공급사: 테스트 공급사
'''
r = client.post('/admin/api/uploads', content=text.encode(), headers={'X-Filename': 'admin-live-synthetic.txt', 'Content-Type': 'text/plain; charset=utf-8'})
r.raise_for_status()
uploaded = r.json()
job = wait(uploaded['job']) if uploaded['job'] else submit('analyze', 'uploads', asset_id=uploaded['asset_id'])
save('live-upload-analysis', job)
assert job['status'] == 'succeeded', job['error']
asset = client.get('/admin/api/assets/' + uploaded['asset_id']).json()
assert asset['payload']['analysis']['engine']['model']
assert asset['payload']['analysis']['entities']
for entity in asset['payload']['analysis']['entities']:
    for e in entity['evidence']:
        assert e['quote'] in text
client.patch('/admin/api/assets/' + uploaded['asset_id'], json={'status': 'archived', 'notes': '실제 AI 연결 확인에 사용한 합성 테스트 자료. production 미반영.'}).raise_for_status()

source = client.post('/admin/api/sources', json={'name': '[검증용] 카탈로그 공개 목록', 'url': 'https://samsung.aiibook.net/b2b/?winmate-admin-live=' + str(time.time_ns()), 'description': '단일 공개 페이지의 실제 AI 분석·DB 반영·복구 검증', 'interval_days': 365})
source.raise_for_status()
sid = source.json()['id']
refresh = submit('refresh', sid)
save('live-refresh-apply', refresh)
assert refresh['status'] == 'succeeded', refresh['error']
release = refresh['result']['sources'][0]['release']
assert release['sync']['admin_database'] is True
assert release['sync']['production_database'] is False
assert client.get('/admin/api/assets', params={'source': sid}).json()['total'] > 0
restore = submit('rollback', release_id=release['id'])
save('live-release-rollback', restore)
assert restore['status'] == 'succeeded', restore['error']
assert client.get('/admin/api/assets', params={'source': sid}).json()['total'] == 0
client.patch('/admin/api/sources/' + sid, json={'enabled': False}).raise_for_status()

diagnosis = submit('diagnose')
save('live-diagnostics', diagnosis)
assert diagnosis['status'] == 'succeeded'
assert all(c.get('integrity', ['ok']) == ['ok'] for c in diagnosis['result']['checks'])

(out / 'live-results.json').write_text(json.dumps({'at': time.time(), 'model': decision['engine']['model'], 'results': results}, ensure_ascii=False, indent=2))
print('Real-model smoke tests passed', len(results), flush=True)
