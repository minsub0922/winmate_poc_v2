"""데이터 소스 최신성 점검 — 실제 DB 기록 ↔ 실제 원본 대조. 가짜 원본(origins.fetch)과 가짜 점검 도구로 검증한다. 네트워크 · AI 호출 없음."""
import importlib.util
import json
from pathlib import Path
import sys
import time

from fastapi.testclient import TestClient
import pytest

from admin import dss as dss_module, engine, origins, server
from admin.engine import EngineError
from admin.service import Service
from admin.store import dump
from app.api.auth import Auth, AuthConfig

# 가짜 채널 점검 도구 — 상태는 옆의 watch-state.json 이 정하고, 받은 --links 는 결과에 그대로 싣는다
WATCH = '''import json, os, sys
a = sys.argv
out = a[a.index('--out') + 1]; channels = a[a.index('--channels') + 1].split(',')
state = json.load(open(os.path.join(os.path.dirname(__file__), 'watch-state.json')))
links = json.load(open(a[a.index('--links') + 1])) if '--links' in a else {}
os.makedirs(out, exist_ok=True)
if state.get('_sleep'):
    import time; time.sleep(state['_sleep'])
RICH = ([{'status': 'new', 'gid': 'N%03d' % i, 'name': '새 제품 %d' % i, 'models': ['NEW%03d' % i], 'cat': 'monitors/all-monitors', 'url': 'monitors/new/NEW%03d/' % i, 'why': ['새 상품 카드']} for i in range(70)]
        + [{'status': 'removed', 'gid': 'R1', 'name': '단종 사이니지', 'models': ['LH55OLD'], 'app': ['sg_old'], 'cat': 'smart-signage/all-smart-signage', 'url': 'smart-signage/old/LH55OLD/', 'why': ['목록에서 빠짐 — 판매 종료 후보']},
           {'status': 'moved', 'gid': 'M1', 'name': '옮겨진 모니터', 'models': ['LS27MOVE'], 'app': [], 'cat': 'monitors/all-monitors', 'why': ['상품 카드가 G9 (새 카드) 로 옮겨짐']},
           {'status': 'changed', 'gid': 'C1', 'name': '바뀐 에어컨', 'app': ['ac1'], 'models': ['AC100'], 'cat': 'air-conditioners/all-air-conditioners', 'url': 'air-conditioners/x/AC100/', 'why': ['이름', '사양'], 'detail': ['이름: 옛 이름 → 바뀐 에어컨', '사양: 옵션 2개의 사양표가 바뀜']},
           {'status': 'new-category', 'cat': 'robots/all-robots', 'url': 'https://www.samsung.com/sec/business/robots/all-robots/', 'why': ['메뉴에 새로 생긴 분류']}])
def channel(c):
    s = state.get(c, 'same')
    if c == 'site' and s == 'rich':
        return {'label': c, 'status': 'changed', 'summary': '상품 카드 74개 중 1개 같음', 'checked_at': '2026-11-16T09:00:00+09:00', 'seconds': 500, 'coverage': '분류 51개의 목록 전체', 'collectedAt': '2026-11-16T00:00:00Z',
                'counts': {'cards': [4, 74], 'unchanged': 1, 'new': 70, 'removed': 1, 'moved': 1, 'changed': 1, 'new-category': 1, 'specs': 120, 'categories': 51, 'changedFields': {'이름': 1, '사양': 1}}, 'changes': RICH, 'errors': [], 'knownErrors': 2}
    if c == 'ecat' and s == 'books':
        return {'label': c, 'status': 'changed', 'summary': '3권 중 2권 같음 · 바뀜 1', 'checked_at': '2026-11-16T09:00:00+09:00', 'seconds': 15, 'coverage': '권 파일',
                'counts': {'listed': 3, 'excluded': 0, 'db': 3, 'same': 2, 'changed': 1, 'new': 0, 'gone': 0, 'pageFiles': 90}, 'errors': [], 'excluded': [], 'issue': {'live': '종합 11-12월호', 'db': '종합 11-12월호', 'applied': True},
                'changes': [{'dir': '12', 'title': '모니터', 'url': 'https://samsung.aiibook.net/b2b/access/ecatalog5.php?Dir=12', 'status': 'changed', 'why': ['받은 뒤에 바뀐 쪽 파일 3개'], 'modifiedPages': [1, 2, 9], 'fileModified': '2026-11-10T10:00:00+09:00', 'fetchedAt': '2026-11-01T10:00:00+09:00'}],
                'books': [{'dir': '12', 'title': '모니터', 'tab': 'tab4', 'pages': 30, 'fileModified': '2026-11-10T10:00:00+09:00', 'fetchedAt': '2026-11-01T10:00:00+09:00', 'status': 'changed'},
                          {'dir': '10', 'title': '사이니지', 'tab': 'tab4', 'pages': 30, 'fileModified': '2026-10-01T10:00:00+09:00', 'fetchedAt': '2026-11-01T10:00:00+09:00', 'status': 'same'},
                          {'dir': '11', 'title': '시스템에어컨', 'tab': 'tab4', 'pages': 30, 'fileModified': '2026-10-01T10:00:00+09:00', 'fetchedAt': '2026-11-01T10:00:00+09:00', 'status': 'same'}]}
    r = {'label': c, 'status': s, 'summary': c + ' ' + s, 'checked_at': '2026-11-16T09:00:00+09:00', 'seconds': 1, 'coverage': c + ' 범위', 'counts': {'db': 3, 'cards': [3, 3]},
         'changes': [{'status': 'changed', 'name': '바뀐 항목', 'url': 'https://example.com/x', 'why': ['사양']}] if s == 'changed' else [],
         'errors': [{'url': 'https://example.com/e', 'error': '연결 실패'}] if s == 'partial' else []}
    if c == 'ecat' and links:
        r['links'] = {'listing': links['ecat'].get('listing'), 'listings': [{'url': u, 'status': 'same', 'volumes': 2} for u in links['ecat'].get('listings', [])],
                      'volumes': [{'url': v['url'], 'dir': v['dir'], 'status': 'new', 'why': ['관리자가 넣은 링크의 권 — DB 에 없음'], 'title': '새 권', 'pages': 12} for v in links['ecat'].get('volumes', [])]}
        r['changes'] += [{'status': 'new', 'dir': v['dir'], 'title': '새 권', 'url': v['url'], 'why': ['관리자가 넣은 링크의 권 — DB 에 없음']} for v in links['ecat'].get('volumes', [])]
        if r['changes']: r['status'] = 'changed'
    return r
res = {'version': 1, 'channels': {c: channel(c) for c in channels}}
st = [v['status'] for v in res['channels'].values()]
res['status'] = 'failed' if 'failed' in st else 'partial' if 'partial' in st else 'changed' if 'changed' in st else 'same'; res['changed'] = 'changed' in st
json.dump(res, open(os.path.join(out, 'watch.json'), 'w'))
print('@@progress 100 점검 완료', flush=True)
sys.exit(2 if 'failed' in st else 0)
'''


def case_page(rows, total):
    items = ''.join(f'''<li data-lett-no="{r['id']}"  data-omni="x"><div><a href="{r.get('href', '/sec/business/insights/case-study/c' + r['id'] + '/')}" class="thumb"></a></div>
        <div class="prop-txt"><h3><a href="#">\n {r['title']}</a></h3><span>{r.get('date', '2026-09-01')}</span></div></li>''' for r in rows)
    template = '''<script>html += '<li data-lett-no="' + list[i].lettNo + '">';</script>'''
    return (template + '<ul>' + items + f'</ul><input type="hidden" id="totalCount" value="{total}" />').encode()


def page(title, body):
    return f'<html><head><title>{title}</title></head><body><nav>메뉴 {time.time()}</nav><main>{body}</main><footer>푸터</footer></body></html>'.encode()


class Web:
    """가짜 원본 — 주소별 응답을 바꿔 가며 점검을 돌린다."""
    def __init__(self):
        self.pages, self.cases, self.total, self.calls = {}, [], None, []

    def __call__(self, url, data=None, **options):
        self.calls.append(url)
        if url == origins.CASE_LIST:
            number = int(dict(pair.split('=') for pair in data.decode().split('&'))['page'])
            return {'url': url, 'type': 'text/html', 'body': case_page(self.cases[(number - 1) * 2:number * 2], len(self.cases) if self.total is None else self.total)}
        value = self.pages.get(url)
        if value is None:
            raise EngineError('원본 서버가 HTTP 404로 응답했습니다.')
        body = value() if callable(value) else value
        return {'url': url, 'type': 'text/html', 'body': body}


@pytest.fixture
def env(tmp_path, monkeypatch):
    tools = tmp_path / 'tools'
    tools.mkdir()
    (tools / 'watch.py').write_text(WATCH)
    (tools / 'watch-state.json').write_text('{}')
    monkeypatch.setattr(dss_module, 'TOOLS', tools)
    monkeypatch.setattr(engine.socket, 'getaddrinfo', lambda *a, **k: [(None, None, None, None, ('93.184.216.34', 443))])
    root = tmp_path / 'repo'
    (root / 'app/data').mkdir(parents=True)
    (root / 'app/data/catalog.json').write_text(dump({'cases': [{'id': 1, 'title': '사례 하나', 'url': 'https://www.samsung.com/sec/business/insights/case-study/c1/'},
                                                                 {'id': 2, 'title': '사례 둘', 'url': 'https://www.samsung.com/sec/business/insights/case-study/c2/'},
                                                                 {'id': 3, 'title': '영상 사례'}]}))
    web = Web()
    web.cases = [{'id': '1', 'title': '사례 하나'}, {'id': '2', 'title': '사례 둘'}, {'id': '3', 'title': '영상 사례', 'href': 'javascript:;'}]
    monkeypatch.setattr(origins, 'fetch', web)
    svc = Service(tmp_path / 'state')
    svc.dss.staging = tmp_path / 'staging'
    svc.origins.root = root
    svc.store.set_setting('dss_last_scheduled', None)
    auth = Auth(AuthConfig(auth_dir=tmp_path / 'auth'))
    auth.set_credentials('admin', 'isolated-test-password')
    monkeypatch.setattr(server, 'store', svc.store)
    monkeypatch.setattr(server, 'service', svc)
    monkeypatch.setattr(server.winmate.state, 'auth', auth)
    token, _ = auth.issue_token()
    with TestClient(server.api) as c:
        c.cookies.set(auth.config.cookie_name, token)
        yield c, svc, tools, web
    svc.close()


def state(tools, **values):
    (tools / 'watch-state.json').write_text(json.dumps(values))


def check(svc, sid):
    return svc.origins.check(svc.store.source(sid), 'job-' + sid, lambda *a: None, lambda: False)


def done(svc, jid, seconds=30):
    deadline = time.time() + seconds
    while time.time() < deadline:
        job = svc.store.job(jid)
        if job['status'] not in ('queued', 'running'):
            return job
        time.sleep(0.05)
    raise AssertionError('job did not finish: ' + json.dumps(svc.store.job(jid), ensure_ascii=False))


def add_url_source(c, url='https://example.com/guide'):
    return c.post('/api/sources', json={'name': '외부 안내', 'url': url}).json()['id']


def load_watch():
    spec = importlib.util.spec_from_file_location('winmate_watch_under_test', Path(__file__).resolve().parents[2] / 'proddb/build/dss/watch.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# ───────────────────────── 판정 규칙 ─────────────────────────

def test_verdict_comes_only_from_the_comparison():
    same = origins.part({'id': 'a', 'label': 'A'}, {'status': 'same', 'summary': '3개 같음', 'checked_at': '2026-11-16T09:00:00+09:00'})
    changed = origins.part({'id': 'b', 'label': 'B'}, {'status': 'changed', 'summary': '바뀜 1', 'changes': [{'status': 'new', 'title': '새 권', 'why': ['새로 올라옴']}]})
    partial = origins.part({'id': 'c', 'label': 'C'}, {'status': 'partial', 'summary': '확인 못 함 1', 'errors': [{'url': 'https://x', 'error': '연결 실패'}]})
    unchecked = origins.part({'id': 'd', 'label': 'D'}, None)
    assert origins.verdict([same])['status'] == 'fresh'
    assert origins.verdict([same, changed])['status'] == 'refresh' and origins.verdict([same, changed])['counts']['changes'] == 1
    assert origins.verdict([same, partial])['status'] == 'uncertain'      # 확인하지 못한 원본이 있으면 최신이라고 하지 않는다
    assert origins.verdict([same, unchecked])['status'] == 'uncertain'
    assert origins.verdict([changed, partial])['status'] == 'refresh'     # 다른 항목이 하나라도 확인되면 갱신 권장
    report = origins.verdict([same, changed])
    assert report['basis'] == 'origin' and 'A: 3개 같음' in report['reason'] and report['origins'][1]['changes'][0]['title'] == '새 권'


# ───────────────────────── 도입사례 목록 ─────────────────────────

def test_case_list_matches_the_database(env):
    _, svc, _, web = env
    result = origins.check_cases(svc.origins.root, lambda: False)
    assert result['status'] == 'same' and result['counts'] == {'listed': 3, 'db': 3, 'same': 3}
    assert web.calls.count(origins.CASE_LIST) == 2  # 두 쪽으로 전체 3건을 읽고 멈춘다


def test_case_list_reports_new_renamed_moved_and_gone(env):
    _, svc, _, web = env
    web.cases = [{'id': '9', 'title': '새 사례', 'date': '2026-11-10'}, {'id': '1', 'title': '사례 하나(개정)'},
                 {'id': '2', 'title': '사례 둘', 'href': '/sec/business/insights/case-study/moved/'}]
    result = origins.check_cases(svc.origins.root, lambda: False)
    by = {c['id']: c for c in result['changes']}
    assert result['status'] == 'changed' and by['9']['status'] == 'new' and '2026-11-10' in by['9']['why'][0]
    assert by['1']['why'] == ['제목 사례 하나 → 사례 하나(개정)'] and '주소 이동' in by['2']['why'][0]
    assert by['3']['status'] == 'gone' and result['counts']['same'] == 0


def test_incomplete_case_list_never_reports_missing_cases(env):
    _, svc, _, web = env
    web.total = 40  # 원본은 40건이라고 하는데 3건만 내려온 경우
    result = origins.check_cases(svc.origins.root, lambda: False)
    assert result['status'] == 'partial' and not result['changes'] and '40건 중 3건' in result['errors'][0]['error']
    web.cases = []
    failed = origins.check_cases(svc.origins.root, lambda: False)
    assert failed['status'] == 'failed' and failed['errors']


# ───────────────────────── 채널로 대조하는 소스 ─────────────────────────

def test_catalog_check_uses_the_real_origin_comparison(env):
    c, svc, tools, _ = env
    report = check(svc, 'catalogs')
    source = svc.store.source('catalogs')
    assert report['status'] == 'fresh' == source['status'] and report['origins'][0]['id'] == 'channel:ecat' and report['origins'][0]['summary'] == 'ecat same'
    assert svc.store.one('SELECT trigger,channels FROM dss_checks')['trigger'] == 'source'  # 「소스 점검 · 업데이트」와 같은 기록
    state(tools, ecat='changed')
    report = check(svc, 'catalogs')
    assert report['status'] == 'refresh' and report['origins'][0]['changes'][0] == {'status': 'changed', 'why': ['사양'], 'title': '바뀐 항목', 'url': 'https://example.com/x', 'id': None}
    state(tools, ecat='partial')
    assert check(svc, 'catalogs')['status'] == 'uncertain'
    state(tools, ecat='failed')
    assert check(svc, 'catalogs')['status'] == 'uncertain' and svc.store.source('catalogs')['status'] == 'uncertain'


def test_media_check_covers_solutions_and_the_case_list(env):
    _, svc, tools, web = env
    report = check(svc, 'media')
    assert [o['id'] for o in report['origins']] == ['channel:solutions', 'cases'] and report['status'] == 'fresh'
    web.cases.append({'id': '7', 'title': '새 사례'})
    report = check(svc, 'media')
    assert report['status'] == 'refresh' and report['origins'][1]['changes'][0]['title'] == '새 사례' and report['origins'][0]['status'] == 'same'


def test_daily_dss_check_updates_the_source_cards(env):
    c, svc, tools, _ = env
    state(tools, site='changed')
    job = svc.submit('dss-check', None, {'trigger': 'schedule', 'channels': ['ecat', 'solutions', 'subs', 'site']}, actor='scheduler')
    assert done(svc, job['id'])['status'] == 'succeeded'
    status = {s['id']: s for s in c.get('/api/overview').json()['sources']}
    assert status['samsung']['status'] == 'refresh' and status['catalogs']['status'] == 'fresh' and status['media']['status'] == 'fresh'
    assert status['samsung']['decision']['basis'] == 'origin' and 'origins' not in status['samsung']['decision']  # 목록에는 요약만
    detail = c.get('/api/sources/samsung').json()['source']['decision']
    assert detail['origins'][0]['changes'][0]['title'] == '바뀐 항목' and detail['origins'][0]['counts'] == {'db': 3}


def test_check_all_runs_the_channels_once(env):
    c, svc, tools, _ = env
    sid = add_url_source(c)
    job = done(svc, c.post('/api/jobs', json={'kind': 'check'}).json()['id'])
    assert job['status'] == 'succeeded'
    # 열리지 않는 URL 소스는 작업 실패가 아니라 '확인 필요'로 남는다
    assert {s['source_id']: s['decision']['status'] for s in job['result']['sources']} == {'samsung': 'fresh', 'catalogs': 'fresh', 'media': 'fresh', sid: 'uncertain'}
    rows = svc.store.rows('SELECT channels FROM dss_checks')
    assert len(rows) == 1 and set(json.loads(rows[0]['channels'])) == {'ecat', 'solutions', 'site'}


def test_legacy_ai_verdicts_are_reset_and_existing_results_restored(env, tmp_path):
    _, svc, tools, _ = env
    with svc.store.db() as db:
        db.execute("UPDATE sources SET status='refresh',decision=? WHERE id='samsung'", (dump({'status': 'refresh', 'summary': '메뉴 구조가 바뀜', 'evidence': []}),))
    svc.origins.sync()
    assert svc.store.source('samsung')['status'] == 'unchecked' and svc.store.source('samsung')['decision'] == '{}'
    check(svc, 'samsung')
    with svc.store.db() as db:
        db.execute("UPDATE sources SET status='unchecked',decision='{}' WHERE id='samsung'")
    svc.origins.sync()  # 서버를 다시 켜면 마지막 대조 결과로 되돌아온다
    assert svc.store.source('samsung')['status'] == 'fresh'


def test_internal_libraries_have_no_origin_check(env):
    c, svc, _, _ = env
    with pytest.raises(EngineError, match='내부 라이브러리'):
        check(svc, 'images')
    assert c.get('/api/sources/images/origin').status_code == 422


# ───────────────────────── 홈의 최신성 점검 — 소스별 동시 실행 · 전체 보고 ─────────────────────────

def test_product_and_catalog_checks_run_side_by_side(env):
    c, svc, tools, _ = env
    state(tools, _sleep=0.8)
    jobs = [c.post('/api/jobs', json={'kind': 'check', 'source_id': sid}).json()['id'] for sid in ('samsung', 'catalogs')]
    together, deadline = False, time.time() + 10
    while time.time() < deadline and not together:
        together = all(svc.store.job(j)['status'] == 'running' for j in jobs)
        time.sleep(0.02)
    assert together  # 한 소스가 끝나기를 기다리지 않는다
    assert [done(svc, j)['status'] for j in jobs] == ['succeeded', 'succeeded']
    rows = svc.store.rows('SELECT id,channels FROM dss_checks ORDER BY id')
    assert len({r['id'] for r in rows}) == 2 and {r['channels'] for r in rows} == {'["site"]', '["ecat"]'}  # 같은 초에 시작해도 기록이 겹치지 않는다


def test_checks_and_database_updates_never_overlap(env):
    c, svc, _, _ = env
    updating = svc.store.new_job('dss-update', None, {'run': 'update', 'channel': 'site'})
    assert c.post('/api/jobs', json={'kind': 'check', 'source_id': 'samsung'}).status_code == 422  # 업데이트 중에는 대조하지 않는다
    svc.store.finish(updating, {})
    checking = svc.store.new_job('check', 'catalogs')
    with pytest.raises(EngineError, match='끝난 뒤'):
        svc.submit('dss-update', None, {'run': 'update', 'channel': 'ecat'})  # 대조 중에는 DB 를 고치지 않는다
    svc.store.finish(checking, {})


def test_product_report_lists_every_new_removed_and_changed_product(env):
    c, svc, tools, _ = env
    assert c.get('/api/sources/samsung/report').json()['detail'] is None  # 아직 점검 전
    state(tools, site='rich')
    check(svc, 'samsung')
    report = c.get('/api/sources/samsung/report').json()
    d = report['detail']
    assert report['decision']['status'] == 'refresh' and d['kind'] == 'site' and d['counts'] == {'db': 4, 'origin': 74, 'same': 1, 'categories': 51, 'specs': 120}
    assert len(d['new']) == 70 and d['new'][69] == {'gid': 'N069', 'name': '새 제품 69', 'models': ['NEW069'], 'category': 'monitors', 'url': 'https://www.samsung.com/sec/business/monitors/new/NEW069/', 'app': [], 'why': ['새 상품 카드'], 'detail': []}
    assert [r['name'] for r in d['removed']] == ['단종 사이니지'] and d['removed'][0]['app'] == ['sg_old'] and d['removed'][0]['models'] == ['LH55OLD']
    assert d['moved'][0]['why'] == ['상품 카드가 G9 (새 카드) 로 옮겨짐'] and d['changed'][0]['detail'] == ['이름: 옛 이름 → 바뀐 에어컨', '사양: 옵션 2개의 사양표가 바뀜']
    assert d['fields'] == {'이름': 1, '사양': 1} and d['categories'] == [{'name': 'robots/all-robots', 'url': 'https://www.samsung.com/sec/business/robots/all-robots/'}] and d['known_errors'] == 2


def test_catalog_report_says_which_files_differ(env):
    c, svc, tools, _ = env
    state(tools, ecat='books')
    check(svc, 'catalogs')
    d = c.get('/api/sources/catalogs/report').json()['detail']
    assert d['kind'] == 'ecat' and d['counts'] == {'db': 3, 'listed': 3, 'same': 2, 'changed': 1, 'new': 0, 'gone': 0, 'files': 90}
    assert d['different'][0]['title'] == '모니터' and d['different'][0]['modified_pages'] == [1, 2, 9] and d['different'][0]['why'] == ['받은 뒤에 바뀐 쪽 파일 3개']
    assert [b['status'] for b in d['books']] == ['changed', 'same', 'same'] and d['issue']['applied']


def test_watch_tool_describes_what_changed_in_a_product():
    watch = load_watch()
    field = {'goodsNm': '이름', 'models': '모델 구성', 'soldOut': '품절 상태', 'specs': '사양', 'features': '특장점', 'options': '옵션'}
    diff = {'goodsNm': ['옛 이름', '새 이름'], 'models': [['A', 'B'], ['B', 'C']], 'soldOut': [[['A', 'N'], ['B', 'N']], [['B', 'Y'], ['C', 'N']]],
            'specs': ['G1', 'G2'], 'features': 'missing-new', 'options': True}
    assert watch.site_detail(diff, field) == ['이름: 옛 이름 → 새 이름', '모델 구성: 추가 C · 빠짐 A', '품절 상태: B 품절',
                                              '사양: 옵션 2개의 사양표가 바뀜', '특장점: 상품 페이지에서 특장점이 사라짐', '옵션: 바뀜']


# ───────────────────────── 리소스 링크 ─────────────────────────

def test_ecatalog_links_join_the_channel_check(env):
    c, svc, tools, _ = env
    view = c.get('/api/sources/catalogs/origin').json()
    assert view['url_editable'] and view['origins'][0]['url'] == 'https://samsung.aiibook.net/b2b/' and view['links'] == []
    view = c.post('/api/sources/catalogs/links', json={'url': 'https://samsung.aiibook.net/b2b/access/ecatalog5.php?Dir=370', 'label': '비즈니스 종합 새 호'}).json()
    view = c.post('/api/sources/catalogs/links', json={'url': 'https://samsung.aiibook.net/b2c/ecatalog5.php?Dir=274'}).json()
    view = c.post('/api/sources/catalogs/links', json={'url': 'https://samsung.aiibook.net/b2b/list2.php'}).json()
    assert [l['kind'] for l in view['links']] == ['volume', 'volume', 'listing']
    assert c.post('/api/sources/catalogs/links', json={'url': 'https://samsung.aiibook.net/b2b/list2.php/'}).status_code == 422  # 같은 링크
    assert c.post('/api/sources/catalogs/links', json={'url': 'http://samsung.aiibook.net/b2b/'}).status_code == 422          # 공개 HTTPS 만
    assert svc.origins.watch_links() == {'ecat': {'volumes': [
        {'dir': '370', 'base': 'https://samsung.aiibook.net/b2b/', 'url': 'https://samsung.aiibook.net/b2b/access/ecatalog5.php?Dir=370', 'label': '비즈니스 종합 새 호'},
        {'dir': '274', 'base': 'https://samsung.aiibook.net/b2c/', 'url': 'https://samsung.aiibook.net/b2c/ecatalog5.php?Dir=274', 'label': ''}],
        'listings': ['https://samsung.aiibook.net/b2b/list2.php']}}
    report = check(svc, 'catalogs')
    assert report['status'] == 'refresh' and [ch['id'] for ch in report['origins'][0]['changes']] == ['370', '274']
    view = c.get('/api/sources/catalogs/origin').json()
    assert view['links'][0]['result']['status'] == 'new' and view['links'][0]['result']['pages'] == 12 and view['links'][2]['result']['volumes'] == 2
    first = view['links'][0]['id']
    assert len(c.delete('/api/sources/catalogs/links/' + first).json()['links']) == 2
    assert c.delete('/api/sources/catalogs/links/' + first).status_code == 404


def test_catalog_listing_address_can_be_replaced_and_restored(env):
    c, svc, _, _ = env
    view = c.put('/api/sources/catalogs/url', json={'url': 'https://samsung.aiibook.net/biz/'}).json()
    assert view['url'] == 'https://samsung.aiibook.net/biz/' and svc.origins.watch_links() == {'ecat': {'listing': 'https://samsung.aiibook.net/biz/'}}
    assert c.put('/api/sources/catalogs/url', json={'url': ''}).json()['url'] == view['default_url'] and svc.origins.watch_links() == {}
    assert c.put('/api/sources/samsung/url', json={'url': 'https://example.com/'}).status_code == 422  # 수집기에 고정된 주소


def test_page_links_keep_a_baseline_and_report_changes(env):
    c, svc, _, web = env
    url = 'https://www.samsung.com/sec/business/new-solution/'
    web.pages[url] = lambda: page('새 솔루션', '<p>첫 문단</p><p>둘째 문단</p>')
    link = c.post('/api/sources/media/links', json={'url': url, 'label': '새 솔루션 페이지'}).json()['links'][0]
    assert link['kind'] == 'page' and link['result'] is None
    report = check(svc, 'media')
    assert report['status'] == 'fresh' and report['origins'][2]['id'] == 'links' and '기준을 새로 잡음 1' in report['origins'][2]['summary']
    assert check(svc, 'media')['origins'][2]['summary'] == '링크 1개 중 1개 같음'  # 메뉴 · 푸터가 달라져도 본문이 같으면 같음
    web.pages[url] = lambda: page('새 솔루션', '<p>첫 문단</p><p>둘째 문단(개정)</p><p>셋째 문단</p>')
    report = check(svc, 'media')
    change = report['origins'][2]['changes'][0]
    assert report['status'] == 'refresh' and change['why'] == ['본문이 바뀜'] and change['diff']['removed'] == ['둘째 문단'] and change['diff']['added'] == ['둘째 문단(개정)', '셋째 문단']
    assert check(svc, 'media')['status'] == 'refresh'  # 확인하기 전에는 계속 갱신 권장
    lid = c.get('/api/sources/media/origin').json()['links'][0]['id']
    view = c.post(f'/api/sources/media/links/{lid}/accept').json()
    assert view['links'][0]['result']['status'] == 'same' and svc.store.source('media')['status'] == 'fresh'
    assert c.post(f'/api/sources/media/links/{lid}/accept').status_code == 422
    del web.pages[url]
    report = check(svc, 'media')
    assert report['status'] == 'uncertain' and report['origins'][2]['errors'][0]['error'].startswith('원본 서버가 HTTP 404')


def test_pages_that_differ_on_every_fetch_are_not_judged_by_text(env):
    c, svc, _, web = env
    url = 'https://www.samsung.com/sec/business/rotating/'
    counter = iter(range(100))
    web.pages[url] = lambda: page('회전 배너', f'<p>오늘의 추천 {next(counter)}</p>')
    c.post('/api/sources/samsung/links', json={'url': url})
    check(svc, 'samsung')
    report = check(svc, 'samsung')
    assert report['status'] == 'fresh' and report['origins'][1]['total_changes'] == 0


def test_url_source_is_compared_with_what_the_database_holds(env):
    c, svc, _, web = env
    url = 'https://example.com/guide'
    sid = add_url_source(c, url)
    web.pages[url] = lambda: page('설치 안내', '<p>설치 순서 하나</p>')
    report = check(svc, sid)
    assert report['status'] == 'refresh' and report['origins'][0]['changes'][0]['status'] == 'new'  # 아직 DB 에 반영한 적 없음
    raw = svc.store.home / 'releases/r1/guide.source'
    raw.parent.mkdir(parents=True)
    raw.write_bytes(page('설치 안내', '<p>설치 순서 하나</p>'))
    svc.store.upsert_assets([{'id': 'document:guide', 'source_id': sid, 'kind': 'document', 'title': '설치 안내', 'url': url, 'path': 'releases/r1/guide.source', 'payload': {}, 'content': '설치 순서 하나'}])
    assert check(svc, sid)['status'] == 'fresh'
    web.pages[url] = lambda: page('설치 안내 v2', '<p>설치 순서 하나</p><p>설치 순서 둘</p>')
    report = check(svc, sid)
    assert report['status'] == 'refresh' and report['origins'][0]['changes'][0]['why'] == ['제목 설치 안내 → 설치 안내 v2', '본문이 바뀜']
    raw.unlink()
    assert check(svc, sid)['status'] == 'uncertain'
    job = done(svc, c.post('/api/jobs', json={'kind': 'check', 'source_id': sid}).json()['id'])
    assert job['status'] == 'succeeded' and job['result']['sources'][0]['decision']['basis'] == 'origin'


# ───────────────────────── 점검 도구의 e-카탈로그 링크 ─────────────────────────

def test_watch_tool_checks_volumes_given_by_link(tmp_path, monkeypatch):
    watch = load_watch()
    (tmp_path / 'proddb/ecat/text').mkdir(parents=True)
    (tmp_path / 'proddb/dss').mkdir(parents=True)
    (tmp_path / 'proddb/ecat/catalogs.json').write_text(json.dumps([['tab4', '', '10', '사이니지'], ['tab4', '', '11', '시스템에어컨'], ['tab4', '', '93', 'LED 조명']]))
    for d in ('10', '11', '93'):
        (tmp_path / f'proddb/ecat/text/{d}.json').write_text(json.dumps({'pages': 2, 'docTitle': '권 ' + d, 'fetchedAt': '2026-11-01T00:00:00+0900'}))
    monkeypatch.setattr(watch, 'P', lambda *a: str(tmp_path.joinpath(*a)))
    listing = '<main><section id="tab4"><ul><li><a data-catalog-dir="10"><p>사이니지</p></a></li><li><a data-catalog-dir="11"><p>시스템에어컨</p></a></li></ul></section></main>'
    second = '<main><section id="tab4"><ul><li><a data-catalog-dir="12"><p>모니터</p></a></li></ul></section></main>'
    opened = {'10': 2, '11': 2, '12': 8, '93': 2, '370': 30}

    def http(url, method='GET', **options):
        if method == 'HEAD':
            return 200, url, {'Last-Modified': 'Wed, 01 Oct 2026 00:00:00 GMT', 'ETag': 'x'}, b''
        if url == 'https://samsung.aiibook.net/b2b/':
            return 200, url, {}, listing.encode()
        if url == 'https://samsung.aiibook.net/b2b/more.php':
            return 200, url, {}, second.encode()
        if url == 'https://samsung.aiibook.net/b2b/broken.php':
            return 500, url, {}, b''
        found = __import__('re').search(r'(b2b|b2c)/access/ecatalogt\.php\?Dir=(\d+)', url)
        if found and found.group(1) == 'b2b' and found.group(2) in opened:
            return 200, url, {}, f'<title>권 {found.group(2)}</title> var cataPages = {opened[found.group(2)]};'.encode()
        return 200, url, {}, b'Dir does not exist'
    monkeypatch.setattr(watch, 'http', http)
    plain = watch.check_ecat(str(tmp_path), lambda *a: None)
    assert plain['status'] == 'changed' and [c['dir'] for c in plain['changes']] == ['93']  # 목록에 없는 기존 권은 링크가 없으면 '목록에서 빠짐'
    watch.LINKS.update({'ecat': {'listings': ['https://samsung.aiibook.net/b2b/more.php', 'https://samsung.aiibook.net/b2b/broken.php'], 'volumes': [
        {'dir': '370', 'base': 'https://samsung.aiibook.net/b2b/', 'url': 'https://samsung.aiibook.net/b2b/access/ecatalog5.php?Dir=370', 'label': '새 호'},
        {'dir': '93', 'base': 'https://samsung.aiibook.net/b2b/', 'url': 'https://samsung.aiibook.net/b2b/ecatalog5.php?Dir=93', 'label': ''},
        {'dir': '274', 'base': 'https://samsung.aiibook.net/b2c/', 'url': 'https://samsung.aiibook.net/b2c/ecatalog5.php?Dir=274', 'label': ''}]}})
    result = watch.check_ecat(str(tmp_path), lambda *a: None)
    changes = {c['dir']: c for c in result['changes']}
    assert set(changes) == {'12', '370'} and changes['370']['why'] == ['관리자가 넣은 링크의 권 — DB 에 없음'] and changes['370']['pages'] == 30 and changes['12']['why'] == ['목록에 새로 올라온 권']
    volumes = {v['dir']: v for v in result['links']['volumes']}
    assert volumes['370']['status'] == 'new' and volumes['93']['status'] == 'same' and volumes['b2c:274']['status'] == 'failed'
    assert [l['status'] for l in result['links']['listings']] == ['same', 'failed'] and result['status'] == 'partial' and result['counts']['same'] == 3
