"""One-shot Metabase provisioning for the Winmate ops stack (safe to re-run).

1. First run only: create the admin account (root .env) — Korean locale, usage tracking off.
2. Connect the data: "Winmate 운영 데이터" (Postgres, read-only role) and "Langfuse (ClickHouse)" (read-only user).
3. Create the "Winmate 운영" collection and dashboard once. Existing items are left as they are, so edits made in
   Metabase survive re-runs; delete the dashboard to have it rebuilt.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

MB = os.environ.get('MB_URL', 'http://metabase:3000').rstrip('/')
EMAIL = os.environ['MB_ADMIN_EMAIL']
PASSWORD = os.environ['MB_ADMIN_PASSWORD']
READER_PASSWORD = os.environ['ANALYTICS_READER_PASSWORD']
CLICKHOUSE_PASSWORD = os.environ.get('CLICKHOUSE_METABASE_PASSWORD', '')
LANGFUSE_URL = os.environ.get('LANGFUSE_PUBLIC_URL', 'http://localhost:8810')
WINMATE_DB = 'Winmate 운영 데이터'
LANGFUSE_DB = 'Langfuse (ClickHouse)'
COLLECTION = 'Winmate 운영'
DASHBOARD = 'Winmate 운영 대시보드'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
session = None


def call(method, path, body=None, *, ok=(200, 202, 204), quiet=False):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(MB + path, data=data, method=method, headers={'Content-Type': 'application/json'})
    if session:
        request.add_header('X-Metabase-Session', session)
    try:
        with OPENER.open(request, timeout=120) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', 'replace')[:500]
        if not quiet:
            print(f'metabase-init: {method} {path} -> HTTP {exc.code} {detail}', flush=True)
        raise


def wait_healthy(limit=900):
    started = time.time()
    while time.time() - started < limit:
        try:
            if (call('GET', '/api/health', quiet=True) or {}).get('status') == 'ok':
                return
        except Exception:
            pass
        time.sleep(5)
    sys.exit('metabase-init: Metabase did not become healthy')


def setup_and_login():
    global session
    props = call('GET', '/api/session/properties')
    if props.get('setup-token') and not props.get('has-user-setup'):
        call('POST', '/api/setup', {
            'token': props['setup-token'],
            'user': {'email': EMAIL, 'first_name': 'Winmate', 'last_name': 'Admin', 'password': PASSWORD, 'site_name': 'Winmate 운영'},
            'prefs': {'site_name': 'Winmate 운영', 'site_locale': 'ko', 'allow_tracking': False}})
        print('metabase-init: admin account created', flush=True)
    for attempt in range(12):  # 앱 DB가 막 재시작된 직후엔 5xx가 잠깐 난다 — 비밀번호 거절(400/401)만 바로 포기
        try:
            session = call('POST', '/api/session', {'username': EMAIL, 'password': PASSWORD}, quiet=True)['id']
            break
        except urllib.error.HTTPError as exc:
            if exc.code in (400, 401, 403):
                print('metabase-init: admin login failed (password changed in Metabase?) — skipping provisioning', flush=True)
                sys.exit(0)
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(5)
    else:
        sys.exit('metabase-init: Metabase login kept failing (see Metabase logs)')
    for key, value in (('site-locale', 'ko'), ('anon-tracking-enabled', False), ('report-timezone', 'Asia/Seoul')):
        try:
            call('PUT', f'/api/setting/{key}', {'value': value}, quiet=True)
        except Exception:
            pass
    return props


def databases():
    result = call('GET', '/api/database')
    return result.get('data', result) if isinstance(result, dict) else result


def ensure_database(name, engine, details, full_sync=True):
    for db in databases():
        if db.get('name') == name:
            return db['id']
    created = call('POST', '/api/database', {'name': name, 'engine': engine, 'details': details,
                                             'is_full_sync': full_sync, 'is_on_demand': False})
    print(f'metabase-init: connected {name} (#{created["id"]})', flush=True)
    return created['id']


def ensure_collection():
    for item in call('GET', '/api/collection'):
        if item.get('name') == COLLECTION and not item.get('archived'):
            return item['id']
    return call('POST', '/api/collection', {'name': COLLECTION, 'description': 'Winmate 사용자 · AI 사용 · 제안서 · 고객의 소리 (ops/로 자동 생성)'})['id']


LINK = {'view_as': 'link', 'link_text': 'Langfuse에서 보기'}
CARDS = [
    # name, display, sql, visualization settings, (row, col, size_x, size_y)[, database]
    ('활성 사용자 (최근 7일)', 'scalar',
     "SELECT count(DISTINCT username) AS users FROM winmate.spans WHERE started_at >= now() - interval '7 days' "
     "AND username NOT IN ('system','anonymous','scheduler')", {}, (0, 0, 6, 3)),
    ('AI 호출 (최근 7일)', 'scalar',
     "SELECT count(*) AS calls FROM winmate.v_llm_calls WHERE started_at >= now() - interval '7 days'", {}, (0, 6, 6, 3)),
    ('AI 토큰 (최근 7일)', 'scalar',
     "SELECT coalesce(sum(total_tokens), 0) AS tokens FROM winmate.v_llm_calls WHERE started_at >= now() - interval '7 days'",
     {}, (0, 12, 6, 3)),
    ('처리 대기 중인 고객의 소리', 'scalar',
     "SELECT count(*) AS open_voc FROM winmate.v_voc WHERE status <> 'closed'", {}, (0, 18, 6, 3)),
    ('일별 활성 사용자 · AI 호출 · 오류 (30일)', 'line',
     "SELECT day_kst AS \"날짜\", active_users AS \"활성 사용자\", llm_calls AS \"AI 호출\", errors AS \"오류\" "
     "FROM winmate.v_daily_activity WHERE day_kst >= (now() AT TIME ZONE 'Asia/Seoul')::date - 29 ORDER BY 1",
     {'graph.dimensions': ['날짜'], 'graph.metrics': ['활성 사용자', 'AI 호출', '오류']}, (3, 0, 12, 6)),
    ('기능별 AI 토큰 (30일)', 'bar',
     "SELECT coalesce(feature, '기타') AS \"기능\", sum(total_tokens) AS \"토큰\", sum(calls) AS \"호출\", sum(errors) AS \"오류\" "
     "FROM winmate.v_daily_ai_usage WHERE day_kst >= (now() AT TIME ZONE 'Asia/Seoul')::date - 29 "
     "GROUP BY 1 ORDER BY 2 DESC LIMIT 15",
     {'graph.dimensions': ['기능'], 'graph.metrics': ['토큰']}, (3, 12, 12, 6)),
    ('고객의 소리 (처리 대기 우선)', 'table',
     "SELECT created_at AS \"접수\", owner AS \"사용자\", status_label AS \"상태\", message AS \"내용\", work_type AS \"작업\", "
     "work_id AS \"작업 ID\", proposal_title AS \"제안서\", age_hours AS \"경과(시간)\" "
     "FROM winmate.v_voc ORDER BY (status = 'closed'), created_at DESC LIMIT 200", {}, (9, 0, 24, 7)),
    ('최근 오류', 'table',
     "SELECT started_at AS \"시각\", username AS \"사용자\", kind AS \"종류\", feature AS \"기능\", code AS \"코드\", "
     "message AS \"메시지\", path AS \"경로\", langfuse_url FROM winmate.v_errors ORDER BY started_at DESC LIMIT 100",
     {'column_settings': {'["name","langfuse_url"]': LINK}}, (16, 0, 12, 8)),
    ('최근 AI 작업', 'table',
     "SELECT started_at AS \"시작\", job_kind AS \"작업\", username AS \"사용자\", status AS \"상태\", "
     "round(duration_ms / 1000.0, 1) AS \"소요(초)\", llm_calls AS \"AI 호출\", total_tokens AS \"토큰\", code AS \"오류 코드\", "
     "langfuse_url FROM winmate.v_jobs ORDER BY started_at DESC LIMIT 100",
     {'column_settings': {'["name","langfuse_url"]': LINK}}, (16, 12, 12, 8)),
    ('사용자별 활동 (30일)', 'table',
     "SELECT username AS \"사용자\", display_name AS \"이름\", role AS \"권한\", last_seen AS \"최근 활동\", "
     "visits_30d AS \"방문\", actions_30d AS \"동작\", jobs_30d AS \"AI 작업\", llm_calls_30d AS \"AI 호출\", "
     "tokens_30d AS \"토큰\", errors_30d AS \"오류\", proposals AS \"제안서\", voc AS \"VOC\" "
     "FROM winmate.v_user_activity ORDER BY last_seen DESC NULLS LAST", {}, (24, 0, 24, 7)),
    ('제안서 목록', 'table',
     "SELECT updated_at AS \"수정\", username AS \"사용자\", title AS \"제목\", customer AS \"고객사\", industry AS \"업종\", "
     "stage AS \"단계\", parts AS \"목차\", slides AS \"장표\", products AS \"제품\", solutions AS \"솔루션\", "
     "exported AS \"PPT 내보냄\" FROM winmate.v_proposals WHERE NOT coalesce(archived, false) ORDER BY updated_at DESC LIMIT 300",
     {}, (31, 0, 24, 8)),
    # Langfuse(ClickHouse) — 모델 단가로 계산한 비용과 지연은 Langfuse에만 있다
    ('AI 비용 · 지연 — 모델별 (Langfuse, 7일)', 'table',
     "SELECT provided_model_name AS \"모델\", count() AS \"생성\", countIf(level = 'ERROR') AS \"오류\", "
     "round(sum(total_cost), 4) AS \"비용(USD)\", round(avg(dateDiff('millisecond', start_time, end_time))) AS \"평균 지연(ms)\", "
     "sum(usage_details['input']) AS \"입력 토큰\", sum(usage_details['output']) AS \"출력 토큰\" "
     "FROM default.events_core FINAL WHERE type = 'GENERATION' AND start_time >= now() - INTERVAL 7 DAY "
     "GROUP BY provided_model_name ORDER BY count() DESC", {}, (39, 0, 12, 6), 'langfuse'),
    ('일별 AI 비용 (Langfuse, 30일)', 'line',
     "SELECT toDate(start_time, 'Asia/Seoul') AS \"날짜\", round(sum(total_cost), 4) AS \"비용(USD)\", count() AS \"생성\" "
     "FROM default.events_core FINAL WHERE type = 'GENERATION' AND start_time >= now() - INTERVAL 30 DAY GROUP BY 1 ORDER BY 1",
     {'graph.dimensions': ['날짜'], 'graph.metrics': ['비용(USD)']}, (39, 12, 12, 6), 'langfuse'),
]


def ensure_dashboard(db_ids, collection_id):
    for item in call('GET', f'/api/collection/{collection_id}/items?models=dashboard').get('data', []):
        if item.get('name') == DASHBOARD:
            print(f'metabase-init: dashboard exists (#{item["id"]}) — left unchanged', flush=True)
            return item['id']
    dashcards = []
    for index, (name, display, sql, viz, (row, col, sx, sy), *db) in enumerate(CARDS):
        db_id = db_ids.get(db[0] if db else 'winmate')
        if not db_id:
            continue
        card = call('POST', '/api/card', {
            'name': name, 'display': display, 'collection_id': collection_id, 'visualization_settings': viz,
            'dataset_query': {'type': 'native', 'database': db_id, 'native': {'query': sql, 'template-tags': {}}}})
        dashcards.append({'id': -(index + 1), 'card_id': card['id'], 'row': row, 'col': col, 'size_x': sx, 'size_y': sy,
                          'parameter_mappings': [], 'visualization_settings': {}})
    dashboard = call('POST', '/api/dashboard', {'name': DASHBOARD, 'collection_id': collection_id,
                                                'description': f'Winmate 운영 데이터 + Langfuse 비용. AI 요청 상세는 Langfuse({LANGFUSE_URL})에서.'})
    call('PUT', f'/api/dashboard/{dashboard["id"]}', {'dashcards': dashcards})
    print(f'metabase-init: dashboard created (#{dashboard["id"]}, {len(dashcards)} cards)', flush=True)
    return dashboard['id']


def main():
    wait_healthy()
    setup_and_login()
    winmate_db = ensure_database(WINMATE_DB, 'postgres', {
        'host': 'analytics-db', 'port': 5432, 'dbname': 'winmate', 'user': 'metabase_ro', 'password': READER_PASSWORD,
        'ssl': False, 'schema-filters-type': 'inclusion', 'schema-filters-patterns': 'winmate'})
    db_ids = {'winmate': winmate_db}
    if CLICKHOUSE_PASSWORD:
        try:
            db_ids['langfuse'] = ensure_database(LANGFUSE_DB, 'clickhouse', {
                'host': 'clickhouse', 'port': 8123, 'user': 'metabase', 'password': CLICKHOUSE_PASSWORD,
                'dbname': 'default', 'databases': 'default', 'ssl': False}, full_sync=False)
        except urllib.error.HTTPError:
            print('metabase-init: Langfuse ClickHouse connection skipped', flush=True)
    collection_id = ensure_collection()
    dashboard_id = ensure_dashboard(db_ids, collection_id)
    print(f'metabase-init: done — open /dashboard/{dashboard_id}', flush=True)


if __name__ == '__main__':
    main()
