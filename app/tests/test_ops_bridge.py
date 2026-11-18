"""Ops bridge: Langfuse OTLP export from Winmate telemetry and the sanitized Metabase snapshot (no network)."""
import base64
import hashlib
import http.server
import json
import sqlite3
import threading
import time
from types import SimpleNamespace

import pytest

from app.api import ops_bridge, telemetry


class Collector(http.server.BaseHTTPRequestHandler):
    requests = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        Collector.requests.append({'path': self.path, 'headers': dict(self.headers), 'body': json.loads(body)})
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{}')

    def log_message(self, *args):
        pass


@pytest.fixture
def collector():
    Collector.requests = []
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Collector)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_address[1]}', Collector.requests
    server.shutdown()


@pytest.fixture(autouse=True)
def clean_telemetry():
    previous = telemetry.install(None)
    capture = telemetry.capture_content(False)
    yield
    telemetry.install(previous)
    telemetry.capture_content(capture)
    telemetry.register_health('ops', None)


class FakeProvider:
    model = 'gemini-test'

    @telemetry.network
    def _post(self, model, body, cancel=None, deadline=None):
        return {'candidates': [{'content': {'parts': [{'text': '{"ok": true}'}]}, 'finishReason': 'STOP'}],
                'usageMetadata': {'promptTokenCount': 12, 'candidatesTokenCount': 5, 'thoughtsTokenCount': 3, 'totalTokenCount': 20}}

    @telemetry.generation
    def _generate(self, *, stage, model):
        self._post(model, {'systemInstruction': {'parts': [{'text': 'system rules'}]},
                           'contents': [{'role': 'user', 'parts': [{'text': 'hello key=AIzaSyA1234567890abcdefghijklmnopq'},
                                                                   {'inlineData': {'mimeType': 'image/png', 'data': 'A' * 4096}}]}],
                           'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 64}})
        return SimpleNamespace(cached=False, model=model, attempts=1, schema_dropped=False)


def attrs(span):
    out = {}
    for item in span['attributes']:
        value = item['value']
        out[item['key']] = value.get('stringValue', value.get('intValue', value.get('boolValue', value.get('arrayValue'))))
    return out


def test_llm_job_trace_reaches_langfuse_and_operations_keep_their_records(collector, tmp_path):
    url, requests = collector
    seen = []
    telemetry.install(lambda kind, record: seen.append((kind, record)))
    exporter = ops_bridge.LangfuseExporter(url, 'pk-lf-test', 'sk-lf-test', content=True, flush_interval=0.1)
    bridge = ops_bridge.Bridge(exporter, None, tmp_path / 'ops-bridge.json').start()
    trace = 'ab' * 16
    job = {'trace_id': trace, 'username': 'alice', 'session_id': 'sess-1', 'feature': 'layout', 'job_id': 'job123', 'page': 'proposal'}
    with telemetry.scope(**job, span_id='job-job123'):
        telemetry.emit('job.state', span_id='job-job123', status='running', started=time.time())
        FakeProvider()._generate(stage='layout:fill', model='gemini-test')
        telemetry.emit('job.state', span_id='job-job123', status='ok', started=time.time() - 2, ended=time.time(), metadata={'snapshot': {'big': 'x' * 10}})
    assert exporter.flush(5)
    bridge.stop()

    assert requests and requests[0]['path'] == '/api/public/otel/v1/traces'
    headers = {k.lower(): v for k, v in requests[0]['headers'].items()}
    assert headers['x-langfuse-ingestion-version'] == '4'
    assert headers['authorization'] == 'Basic ' + base64.b64encode(b'pk-lf-test:sk-lf-test').decode()
    spans = [s for r in requests for rs in r['body']['resourceSpans'] for ss in rs['scopeSpans'] for s in ss['spans']]
    by_type = {attrs(s)['langfuse.observation.type']: s for s in spans}
    generation, logical, agent = by_type['generation'], by_type['span'], by_type['agent']
    assert {s['traceId'] for s in spans} == {trace}
    assert generation['parentSpanId'] == logical['spanId'] and logical['parentSpanId'] == agent['spanId']
    assert agent['spanId'] == ops_bridge.langfuse_span_id('job-job123') and agent['name'] == 'job:layout'
    g = attrs(generation)
    assert g['langfuse.observation.model.name'] == 'gemini-test'
    assert json.loads(g['langfuse.observation.usage_details']) == {'input': 12, 'output': 8, 'total': 20}
    assert g['langfuse.user.id'] == 'alice' and g['langfuse.session.id'] == 'sess-1' and g['langfuse.trace.name'] == 'layout'
    prompt = g['langfuse.observation.input']
    assert 'system rules' in prompt and '[image/png' in prompt and 'AIzaSy' not in prompt and 'AAAA' not in prompt
    assert json.loads(g['langfuse.observation.output']) == '{"ok": true}'
    assert all('content' not in record for _, record in seen)
    usage = [r for k, r in seen if k == 'llm.usage' and r.get('status') == 'ok']
    assert usage and usage[0]['usage']['totalTokenCount'] == 20
    assert telemetry.install(None) is not None  # previous primary restored on stop
    status = json.loads((tmp_path / 'ops-bridge.json').read_text())
    assert status['langfuse']['sent'] == 3 and 'sk-lf' not in json.dumps(status)


def test_content_can_be_turned_off(collector, tmp_path):
    url, requests = collector
    exporter = ops_bridge.LangfuseExporter(url, 'pk', 'sk', content=False, flush_interval=0.1)
    bridge = ops_bridge.Bridge(exporter, None, None).start()
    with telemetry.scope(trace_id='cd' * 16, username='bob', feature='guide'):
        FakeProvider()._generate(stage='guide', model='gemini-test')
    exporter.flush(5)
    bridge.stop()
    keys = {item['key'] for r in requests for rs in r['body']['resourceSpans'] for ss in rs['scopeSpans'] for s in ss['spans'] for item in s['attributes']}
    assert 'langfuse.observation.usage_details' in keys
    assert not keys & {'langfuse.observation.input', 'langfuse.observation.output'}


def test_unreachable_langfuse_never_breaks_requests(tmp_path):
    seen = []
    telemetry.install(lambda kind, record: seen.append(kind))
    exporter = ops_bridge.LangfuseExporter('http://127.0.0.1:9', 'pk', 'sk', flush_interval=0.05, timeout=0.5)
    bridge = ops_bridge.Bridge(exporter, None, None).start()
    with telemetry.scope(trace_id='ef' * 16, username='carol', feature='review'):
        FakeProvider()._generate(stage='review', model='gemini-test')
    exporter.flush(10)
    bridge.stop()
    health = exporter.health()
    assert 'llm.usage' in seen and health['failed_batches'] >= 1 and health['dropped'] >= 1 and health['sent'] == 0


def test_without_configuration_nothing_changes():
    primary = lambda kind, record: None
    telemetry.install(primary)
    bridge = ops_bridge.start(None, config={})
    assert telemetry.install(primary) is primary
    assert telemetry.health()['ops'] == {'langfuse': {'enabled': False}, 'analytics': {'enabled': False}}
    bridge.stop()
    assert 'ops' not in telemetry.health()


def test_trace_ids_match_the_metabase_loader_rule():
    assert ops_bridge.langfuse_trace_id('0123456789abcdef' * 2) == '0123456789abcdef' * 2
    assert ops_bridge.langfuse_trace_id('client_trace-01') == hashlib.sha256(b'client_trace-01').hexdigest()[:32]
    assert ops_bridge.langfuse_trace_id('0' * 32) == hashlib.sha256(b'0' * 32).hexdigest()[:32]
    assert len(ops_bridge.langfuse_span_id('job-abc')) == 16 and ops_bridge.langfuse_span_id('0123456789abcdef') == '0123456789abcdef'


def test_config_precedence(tmp_path):
    first, second = tmp_path / 'a.env', tmp_path / 'b.env'
    first.write_text('LANGFUSE_HOST=http://first\n# comment\nWINMATE_ANALYTICS_DIR="ops/data/snapshots"\n')
    second.write_text('LANGFUSE_HOST=http://second\nLANGFUSE_PUBLIC_KEY=pk\n')
    config = ops_bridge.load_config({'LANGFUSE_SECRET_KEY': 'sk', 'LANGFUSE_HOST': ''}, [str(first), str(second)])
    assert config == {'LANGFUSE_HOST': 'http://first', 'LANGFUSE_PUBLIC_KEY': 'pk', 'LANGFUSE_SECRET_KEY': 'sk',
                      'WINMATE_ANALYTICS_DIR': 'ops/data/snapshots'}


def make_operations(path):
    db = sqlite3.connect(path)
    db.executescript('''
      PRAGMA journal_mode=WAL;
      CREATE TABLE users(username TEXT PRIMARY KEY, display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
        active INTEGER NOT NULL DEFAULT 1, credential_source TEXT NOT NULL DEFAULT 'managed', salt TEXT, password_hash TEXT,
        iterations INTEGER, generation TEXT, created_at REAL, updated_at REAL, last_login REAL, note TEXT DEFAULT '');
      CREATE TABLE spans(id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_id TEXT, username TEXT NOT NULL, session_id TEXT,
        kind TEXT NOT NULL, feature TEXT, stage TEXT, page TEXT, action TEXT, started REAL NOT NULL, ended REAL, duration_ms INTEGER,
        status TEXT, http_status INTEGER, method TEXT, path TEXT, code TEXT, message TEXT, stack TEXT, model TEXT, job_id TEXT,
        input_tokens INTEGER, output_tokens INTEGER, thought_tokens INTEGER, cached_tokens INTEGER, total_tokens INTEGER,
        usage_known INTEGER DEFAULT 0, metadata TEXT DEFAULT '{}');
      CREATE TABLE history(username TEXT NOT NULL, kind TEXT NOT NULL, record_id TEXT NOT NULL, title TEXT, payload TEXT NOT NULL,
        hash TEXT NOT NULL, created_at REAL, updated_at REAL, last_seen REAL, archived INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(username,kind,record_id));
      CREATE TABLE customer_voice(id TEXT PRIMARY KEY, owner TEXT NOT NULL, submission_id TEXT NOT NULL, message TEXT NOT NULL,
        context TEXT NOT NULL, hash TEXT NOT NULL, created_at REAL NOT NULL, status TEXT NOT NULL DEFAULT 'new', updated_at REAL NOT NULL,
        work_type TEXT, work_id TEXT, stage TEXT, path TEXT, UNIQUE(owner,submission_id));
    ''')
    now = time.time()
    db.execute("INSERT INTO users VALUES ('alice','Alice','member',1,'managed','SALT-SECRET','HASH-SECRET',600000,'gen',?,?,?, '')", (now, now, now))
    db.execute("INSERT INTO spans(id,trace_id,username,kind,feature,started,status,model,total_tokens,usage_known) VALUES ('s1','t1','alice','llm.usage','layout',?, 'ok','m',20,1)", (now,))
    db.execute("INSERT INTO spans(id,trace_id,username,kind,started,status) VALUES ('old','t0','alice','http',?, 'ok')", (now - 200 * 86400,))
    proposal = {'id': 'p1', 'title': '본점 로비 LED', 'customer': 'N 은행', 'ind': 'FN', 'stage': 'layout', 'exportedAt': now * 1000,
                'req': {'form': {'keymen': [{'id': 'k'}]}, 'files': [{'name': 'rfp.pdf', 'data': 'data:application/pdf;base64,' + 'Q' * 9000}]},
                'ctx': {'products': [1, 2], 'solutions': [1], 'cases': []},
                'parts': [{'layouts': [{'html': 'x' * 5000}, {'img': 'data:image/png;base64,' + 'A' * 9000}]}, {'layouts': [{}]}],
                'api_key': 'SHOULD-NOT-LEAK'}
    db.execute("INSERT INTO history VALUES ('alice','proposal','p1','본점 로비 LED',?, 'h', ?, ?, ?, 0, 3)", (json.dumps(proposal), now, now, now))
    db.execute("INSERT INTO customer_voice VALUES ('v1','alice','sub123456789','PPT 글자가 넘칩니다',?, 'h', ?, 'new', ?, 'proposal','p1','layout','/p/p1')",
               (json.dumps({'current': {'screen': 'CONTEXT-SECRET'}}), now, now))
    db.commit()
    return db  # stays open: the live DB is in WAL mode with readers/writers


def test_snapshot_is_consistent_and_sanitized(tmp_path):
    live = make_operations(tmp_path / 'operations.sqlite')
    snapshot = ops_bridge.AnalyticsSnapshot(tmp_path / 'out', operations=tmp_path / 'operations.sqlite',
                                            voice=tmp_path / 'operations.sqlite', days=30)
    manifest = snapshot.run_once()
    live.close()
    out = tmp_path / 'out' / 'winmate.sqlite'
    raw = out.read_bytes()
    assert manifest['sha256'] == hashlib.sha256(raw).hexdigest() and manifest['bytes'] == len(raw)
    assert json.loads((tmp_path / 'out' / 'manifest.json').read_text())['rows'] == {
        'users': 1, 'spans': 1, 'history': 1, 'proposals': 1, 'customer_voice': 1}
    for secret in (b'HASH-SECRET', b'SALT-SECRET', b'SHOULD-NOT-LEAK', b'CONTEXT-SECRET', b'AAAAAAAAAA', b'QQQQQQQQQQ'):
        assert secret not in raw
    db = sqlite3.connect(out)
    assert db.execute('PRAGMA journal_mode').fetchone()[0] == 'delete'
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert 'password_hash' not in {r[1] for r in db.execute('PRAGMA table_info(users)')}
    assert 'context' not in {r[1] for r in db.execute('PRAGMA table_info(customer_voice)')}
    row = db.execute('SELECT customer,industry,stage,parts,slides,products,solutions,keymen,req_files,exported_at FROM proposals').fetchone()
    assert row[:9] == ('N 은행', 'FN', 'layout', 2, 3, 2, 1, 1, 1) and row[9] > 1e9
    payload = json.loads(db.execute('SELECT payload FROM history').fetchone()[0])
    assert payload['api_key'] == '[redacted]' and payload['parts'][0]['layouts'][1]['img'].startswith('[image/png')
    assert not list((tmp_path / 'out').glob('.*.tmp'))


def _ops_example():
    """Ops lines of the root .env.example, selected the way ops/start.sh selects them."""
    import re
    example, start = ops_bridge.ROOT / '.env.example', ops_bridge.ROOT / 'ops/start.sh'
    if not (example.exists() and start.exists()):
        pytest.skip('ops/ not in this checkout')
    script = start.read_text(encoding='utf-8')
    ops_keys = re.compile(re.search(r"^ops_keys='([^']+)'", script, re.M).group(1))
    values = {}
    for line in example.read_text(encoding='utf-8').splitlines():
        match = re.match(r'([A-Z][A-Z0-9_]*)=(.*)$', line)
        if match and ops_keys.search(match.group(1)):
            values[match.group(1)] = match.group(2)
    return values, script


def test_root_env_example_reproduces_every_setting_the_ops_stack_reads(tmp_path):
    """The ops section of the root .env.example is the single source of the stack's configuration: every variable
    docker-compose reads and every value start.sh reads has a line there, with the fixed ports and pinned images."""
    import re
    example, start = _ops_example()
    compose = (ops_bridge.ROOT / 'ops/docker-compose.yml').read_text(encoding='utf-8')
    assert set(re.findall(r'\$\{([A-Z][A-Z0-9_]*)', compose)) <= set(example)
    assert set(re.findall(r'\$\(get ([A-Z][A-Z0-9_]*)\)', start)) <= set(example)
    assert (example['OPS_BIND'], example['LANGFUSE_PORT'], example['METABASE_PORT']) == ('127.0.0.1', '8810', '8820')
    for key in ('LANGFUSE_IMAGE_TAG', 'METABASE_IMAGE_TAG', 'CLICKHOUSE_IMAGE_TAG', 'POSTGRES_IMAGE_TAG', 'REDIS_IMAGE_TAG', 'PYTHON_IMAGE'):
        assert example[key] and 'latest' not in example[key], key
    assert '@sha256:' in example['MINIO_IMAGE']
    # defaults inside docker-compose match the example, so the same versions start even before .env is filled
    for key, default in re.findall(r'\$\{([A-Z][A-Z0-9_]*):-([^}]*)\}', compose):
        assert example[key] == default, key
    # secrets stay empty in the versioned file (start.sh generates them); LANGFUSE_HOST is derived from the port
    for key, value in example.items():
        if key.endswith(('_PASSWORD', '_SECRET', '_SALT', '_SECRET_KEY', '_PUBLIC_KEY', '_ENCRYPTION_KEY')) or key == 'LANGFUSE_HOST':
            assert value == '', key
    # Winmate reads its side of the connection from the same file
    winmate = [key for key in example if key.startswith(('LANGFUSE_HOST', 'LANGFUSE_PUBLIC', 'LANGFUSE_SECRET', 'WINMATE_'))]
    env = tmp_path / '.env'
    env.write_text(''.join(f'{key}=1\n' for key in winmate), encoding='utf-8')
    assert sorted(ops_bridge.load_config(environ={}, env_files=[str(env)])) == sorted(winmate)
    assert ops_bridge.DEFAULT_ENV_FILES == ('.env',)
