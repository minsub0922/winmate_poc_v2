"""Optional bridges from Winmate's own telemetry to the local ops stack (``ops/``).

* **Langfuse** — server LLM calls (each network attempt as a ``generation``), the logical call around its
  retries and server jobs are exported as OTLP/HTTP JSON spans to a self-hosted Langfuse v4
  (``/api/public/otel/v1/traces`` with ``x-langfuse-ingestion-version: 4``). Trace IDs are Winmate's own
  ``trace_id`` (hashed only when it is not 32 lowercase hex), so the admin tracing screen, Metabase and
  Langfuse point at the same request.
* **Metabase** — a sanitized SQLite snapshot of the operations DB (no password material, no customer-voice
  screen state, history payloads trimmed, spans of the last N days) is written atomically to
  ``WINMATE_ANALYTICS_DIR``; ``ops/sync`` loads it into Postgres for Metabase.

Both stay off unless configured in the environment or the repository-root ``.env`` (same precedence as
``poc/settings.py``)::

    LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY   Langfuse export
    WINMATE_LANGFUSE_CONTENT=on|off                            prompts/outputs (default on; secrets redacted, trimmed)
    WINMATE_LANGFUSE_ENVIRONMENT                               Langfuse environment (default: winmate)
    WINMATE_ANALYTICS_DIR                                      snapshot directory (enables the snapshot thread)
    WINMATE_ANALYTICS_INTERVAL, WINMATE_ANALYTICS_DAYS         seconds between snapshots (300) / span days kept (90)

Nothing here may slow down or fail a user request: the telemetry hook only enqueues (bounded), conversion and
network I/O run on daemon threads, and every failure is counted instead of raised.
"""
from __future__ import annotations

import base64
from collections import OrderedDict
import hashlib
import json
import logging
import os
from pathlib import Path
import queue
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, Iterable, List, Optional

from . import telemetry

log = logging.getLogger('winmate.ops')
ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / 'app/data/runtime'
DEFAULT_ENV_FILES = ('.env',)
_ENV_LINE = re.compile(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$')
_HEX32 = re.compile(r'[0-9a-f]{32}')
_HEX16 = re.compile(r'[0-9a-f]{16}')
_ENVIRONMENT = re.compile(r'(?!langfuse)[a-z0-9_-]{1,40}')
_TERMINAL = ('ok', 'error', 'cancelled', 'cached')

# ---------------------------------------------------------------- configuration


def _parse_env_file(path: Path) -> Dict[str, str]:
    values: Dict[str, str] = {}
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeError):
        return values
    for line in lines:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        match = _ENV_LINE.match(line)
        if not match:
            continue
        value = match.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
            value = value[1:-1]
        values[match.group(1)] = value
    return values


def load_config(environ: Optional[Dict[str, str]] = None, env_files: Optional[Iterable[str]] = None) -> Dict[str, str]:
    environ = dict(os.environ if environ is None else environ)
    if env_files is None:
        raw = environ.get('WINMATE_ENV_FILES')
        if raw is not None:
            env_files = () if raw.strip().lower() in ('', 'none', 'off') else [x.strip() for x in raw.split(',') if x.strip()]
        else:
            env_files = DEFAULT_ENV_FILES
    layers = [environ] + [_parse_env_file((ROOT / rel).resolve()) for rel in env_files]
    keys = ('LANGFUSE_HOST', 'LANGFUSE_BASE_URL', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'WINMATE_LANGFUSE',
            'WINMATE_LANGFUSE_CONTENT', 'WINMATE_LANGFUSE_ENVIRONMENT', 'WINMATE_ANALYTICS_DIR',
            'WINMATE_ANALYTICS_INTERVAL', 'WINMATE_ANALYTICS_DAYS')
    config = {}
    for key in keys:
        for layer in layers:
            value = layer.get(key)
            if value is not None and str(value).strip():
                config[key] = str(value).strip()
                break
    return config


def _flag(value: Optional[str], default: bool) -> bool:
    if value is None or value == '':
        return default
    return value.strip().lower() not in ('0', 'off', 'false', 'no')


def _number(value: Optional[str], default: float, low: float, high: float) -> float:
    try:
        return min(high, max(low, float(value))) if value not in (None, '') else default
    except ValueError:
        return default


# ---------------------------------------------------------------- shared helpers


def langfuse_trace_id(value: Any) -> str:
    """Winmate trace_id -> OTEL trace id. Same rule as ops/sync/loader.py (Metabase links)."""
    text = str(value or '')
    if _HEX32.fullmatch(text) and text != '0' * 32:
        return text
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:32]


def langfuse_span_id(value: Any) -> str:
    text = str(value or '')
    if _HEX16.fullmatch(text) and text != '0' * 16:
        return text
    return hashlib.sha256(('span:' + text).encode('utf-8')).hexdigest()[:16]


def _redact(text: str) -> str:
    try:
        from .llm.provider import redact
        return redact(text)
    except Exception:  # pragma: no cover - provider import problems must not stop export
        return re.sub(r'AIza[\w-]{20,}', '[redacted]', text)


def _clip(text: Any, limit: int) -> str:
    value = _redact(str(text or ''))
    if len(value) <= limit:
        return value
    return value[:limit] + f'\n… [+{len(value) - limit:,} chars]'


def _nano(seconds: Any) -> str:
    try:
        return str(int(float(seconds) * 1_000_000_000))
    except (TypeError, ValueError):
        return str(int(time.time() * 1_000_000_000))


def _attr(key: str, value: Any) -> Optional[dict]:
    if value is None or value == '' or value == []:
        return None
    if isinstance(value, bool):
        inner = {'boolValue': value}
    elif isinstance(value, int):
        inner = {'intValue': str(value)}
    elif isinstance(value, float):
        inner = {'doubleValue': value}
    elif isinstance(value, (list, tuple)):
        inner = {'arrayValue': {'values': [{'stringValue': str(v)} for v in value if v not in (None, '')]}}
    elif isinstance(value, (dict,)):
        inner = {'stringValue': json.dumps(value, ensure_ascii=False, default=str)}
    else:
        inner = {'stringValue': str(value)}
    return {'key': key, 'value': inner}


def _inline_label(part: dict) -> str:
    data = part.get('inlineData') or part.get('inline_data') or {}
    mime = data.get('mimeType') or data.get('mime_type') or 'binary'
    size = len(data.get('data') or '') * 3 // 4
    return f'[{mime} · {size / 1024:.0f} KB]'


def _messages(body: Any, per_message: int = 20_000, total: int = 120_000) -> list:
    """Gemini-style request body -> chat messages; inline images become placeholders."""
    if not isinstance(body, dict):
        return []
    out = []
    system = (body.get('systemInstruction') or {}).get('parts') or []
    system_text = '\n'.join(p.get('text', '') for p in system if isinstance(p, dict) and p.get('text'))
    if system_text:
        out.append({'role': 'system', 'content': _clip(system_text, per_message)})
    for content in body.get('contents') or []:
        if not isinstance(content, dict):
            continue
        role = {'model': 'assistant'}.get(content.get('role') or 'user', content.get('role') or 'user')
        pieces = []
        for part in content.get('parts') or []:
            if not isinstance(part, dict):
                continue
            if 'text' in part:
                pieces.append(_clip(part.get('text'), per_message))
            elif 'inlineData' in part or 'inline_data' in part:
                pieces.append(_inline_label(part))
            elif 'fileData' in part or 'file_data' in part:
                pieces.append('[file]')
            else:
                pieces.append('[' + ', '.join(sorted(part)[:4]) + ']')
        out.append({'role': role, 'content': '\n'.join(pieces)})
    budget = total
    for message in out:
        if budget <= 0:
            message['content'] = '[생략 — 입력이 너무 깁니다]'
        elif len(message['content']) > budget:
            message['content'] = message['content'][:budget] + '\n… [잘림]'
        budget -= len(message['content'])
    if body.get('tools'):
        out.append({'role': 'system', 'content': 'tools: ' + ', '.join(sorted({k for t in body['tools'] if isinstance(t, dict) for k in t}))})
    return out


def _output(result: Any, limit: int = 50_000) -> Optional[str]:
    if not isinstance(result, dict):
        return None
    if 'text' in result and not result.get('candidates'):
        return _clip(result.get('text'), limit)
    candidate = (result.get('candidates') or [{}])[0] or {}
    parts = (candidate.get('content') or {}).get('parts') or []
    text = ''.join(p.get('text', '') for p in parts if isinstance(p, dict) and not p.get('thought'))
    return _clip(text, limit)


def _parameters(body: Any) -> Optional[dict]:
    gen = body.get('generationConfig') if isinstance(body, dict) else None
    if not isinstance(gen, dict):
        return None
    keep = ('temperature', 'maxOutputTokens', 'responseMimeType', 'seed', 'topP', 'topK')
    params = {k: gen[k] for k in keep if k in gen}
    if 'responseSchema' in gen:
        params['responseSchema'] = True
    return params or None


def _usage(usage: Any) -> Optional[dict]:
    if not isinstance(usage, dict):
        return None
    number = lambda key: int(usage[key]) if isinstance(usage.get(key), (int, float)) and usage[key] >= 0 else None
    prompt, candidates = number('promptTokenCount'), number('candidatesTokenCount')
    thoughts, total = number('thoughtsTokenCount'), number('totalTokenCount')
    if prompt is None and candidates is None and total is None:
        return None
    details = {}
    if prompt is not None:
        details['input'] = prompt
    if candidates is not None or thoughts is not None:
        details['output'] = (candidates or 0) + (thoughts or 0)  # thinking tokens are billed as output
    if total is not None:
        details['total'] = total
    return details


# ---------------------------------------------------------------- Langfuse


class LangfuseExporter:
    PATH = '/api/public/otel/v1/traces'

    def __init__(self, host: str, public_key: str, secret_key: str, *, environment: str = 'winmate', content: bool = True,
                 max_queue: int = 5000, batch: int = 100, flush_interval: float = 2.0, timeout: float = 5.0):
        self.host = host.rstrip('/')
        self.endpoint = self.host + self.PATH
        token = base64.b64encode(f'{public_key}:{secret_key}'.encode('utf-8')).decode('ascii')
        self.headers = {'Content-Type': 'application/json', 'Authorization': 'Basic ' + token,
                        'x-langfuse-ingestion-version': '4', 'User-Agent': 'winmate-ops-bridge/1'}
        self.environment = environment if _ENVIRONMENT.fullmatch(environment or '') else 'winmate'
        self.content = content
        self.batch, self.flush_interval, self.timeout = batch, flush_interval, timeout
        self.queue: 'queue.Queue[tuple]' = queue.Queue(maxsize=max_queue)
        self.stats = {'queued': 0, 'sent': 0, 'dropped': 0, 'failed_batches': 0, 'last_ok_at': None,
                      'last_error': '', 'last_error_at': None}
        self._traces: 'OrderedDict[str, dict]' = OrderedDict()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._idle = threading.Event()
        self._idle.set()
        self._thread: Optional[threading.Thread] = None
        # The ops stack runs on this machine: never route its traffic through an HTTP(S) proxy from the environment.
        self._opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    # -- telemetry hook (request threads): filter and enqueue only
    def handle(self, kind: str, record: dict) -> None:
        try:
            if kind not in ('llm.usage', 'llm.logical', 'job.state'):
                return
            if kind == 'job.state':
                self._remember(record)
            if record.get('status') not in _TERMINAL:
                return
            item = {k: record.get(k) for k in ('trace_id', 'span_id', 'parent_id', 'username', 'session_id', 'role', 'feature',
                                               'stage', 'page', 'path', 'job_id', 'model', 'status', 'code', 'message',
                                               'started', 'ended', 'usage', 'metadata', 'content')}
            if kind == 'job.state':
                item['metadata'] = {}  # the job snapshot stays in Winmate's own history
            self.queue.put_nowait((kind, item))
            self._idle.clear()
            with self._lock:
                self.stats['queued'] += 1
        except queue.Full:
            with self._lock:
                self.stats['dropped'] += 1
        except Exception:  # pragma: no cover - the hook must never raise into telemetry
            with self._lock:
                self.stats['dropped'] += 1

    def _remember(self, record: dict) -> None:
        trace = record.get('trace_id')
        if not trace:
            return
        with self._lock:
            if trace not in self._traces:
                self._traces[trace] = {'name': record.get('feature'), 'user': record.get('username'),
                                       'session': record.get('session_id'), 'page': record.get('page'),
                                       'path': record.get('path'), 'job_id': record.get('job_id')}
                while len(self._traces) > 4096:
                    self._traces.popitem(last=False)

    def _trace_attrs(self, record: dict) -> dict:
        trace = record.get('trace_id') or ''
        with self._lock:
            known = self._traces.get(trace)
            if known is None:
                known = {'name': record.get('feature') or (record.get('stage') or 'llm').split(':')[0],
                         'user': record.get('username'), 'session': record.get('session_id'),
                         'page': record.get('page'), 'path': record.get('path'), 'job_id': record.get('job_id')}
                self._traces[trace] = known
                while len(self._traces) > 4096:
                    self._traces.popitem(last=False)
            else:
                self._traces.move_to_end(trace)
        return known

    # -- conversion (worker thread)
    def to_span(self, kind: str, record: dict) -> Optional[dict]:
        trace = self._trace_attrs(record)
        status = record.get('status') or 'ok'
        started = record.get('started') or time.time()
        ended = record.get('ended') or started
        level = 'ERROR' if status == 'error' else 'WARNING' if status == 'cancelled' else 'DEFAULT'
        attrs: List[Optional[dict]] = [
            _attr('langfuse.trace.name', trace.get('name')),
            _attr('langfuse.user.id', trace.get('user')),
            _attr('langfuse.session.id', trace.get('session')),
            _attr('langfuse.trace.tags', ['winmate', trace.get('name') or '']),
            _attr('langfuse.environment', self.environment),
            _attr('langfuse.trace.metadata.winmate_trace_id', record.get('trace_id')),
            _attr('langfuse.trace.metadata.page', trace.get('page')),
            _attr('langfuse.trace.metadata.path', trace.get('path')),
            _attr('langfuse.trace.metadata.job_id', record.get('job_id') or trace.get('job_id')),
            _attr('langfuse.observation.level', level),
        ]
        if status in ('error', 'cancelled'):
            message = ': '.join(x for x in (str(record.get('code') or ''), str(record.get('message') or '')) if x)
            attrs.append(_attr('langfuse.observation.status_message', _clip(message, 1000) or status))
        metadata = record.get('metadata') if isinstance(record.get('metadata'), dict) else {}
        parent = None
        if kind == 'job.state':
            name = f"job:{record.get('feature') or 'job'}"
            attrs += [_attr('langfuse.observation.type', 'agent'),
                      _attr('langfuse.observation.metadata.job_id', record.get('job_id')),
                      _attr('langfuse.observation.metadata.status', status)]
        elif kind == 'llm.logical':
            name = record.get('stage') or 'llm'
            if str(record.get('parent_id') or '').startswith('job-'):
                parent = record.get('parent_id')
            attrs += [_attr('langfuse.observation.type', 'span'),
                      _attr('langfuse.observation.metadata.status', status),
                      _attr('langfuse.observation.metadata.model', record.get('model'))]
            for key in ('attempts', 'cached', 'schema_dropped', 'stream'):
                if key in metadata:
                    attrs.append(_attr(f'langfuse.observation.metadata.{key}', metadata.get(key)))
        else:  # llm.usage = one real model request
            name = record.get('stage') or 'llm'
            parent = record.get('parent_id')
            usage = _usage(record.get('usage'))
            raw_usage = record.get('usage') if isinstance(record.get('usage'), dict) else {}
            attrs += [_attr('langfuse.observation.type', 'generation'),
                      _attr('langfuse.observation.model.name', record.get('model')),
                      _attr('langfuse.observation.usage_details', json.dumps(usage) if usage else None),
                      _attr('langfuse.observation.metadata.usage_reported', bool(usage))]
            for key, source in (('thought_tokens', 'thoughtsTokenCount'), ('cached_tokens', 'cachedContentTokenCount')):
                if isinstance(raw_usage.get(source), (int, float)):
                    attrs.append(_attr(f'langfuse.observation.metadata.{key}', int(raw_usage[source])))
            for key in ('finish_reason', 'transport', 'attempt', 'input_characters'):
                if metadata.get(key) not in (None, ''):
                    attrs.append(_attr(f'langfuse.observation.metadata.{key}', metadata.get(key)))
            content = record.get('content') if self.content else None
            if isinstance(content, dict):
                body = content.get('input')
                messages = _messages(body)
                if messages:
                    attrs.append(_attr('langfuse.observation.input', json.dumps(messages, ensure_ascii=False)))
                output = _output(content.get('output'))
                if output:
                    attrs.append(_attr('langfuse.observation.output', json.dumps(output, ensure_ascii=False)))
                params = _parameters(body)
                if params:
                    attrs.append(_attr('langfuse.observation.model.parameters', json.dumps(params)))
        span = {'traceId': langfuse_trace_id(record.get('trace_id')),
                'spanId': langfuse_span_id(record.get('span_id') or (('job-' + str(record.get('job_id'))) if kind == 'job.state' else '')),
                'name': str(name)[:200], 'kind': 1,
                'startTimeUnixNano': _nano(started), 'endTimeUnixNano': _nano(ended),
                'attributes': [a for a in attrs if a],
                'status': {'code': 2 if status == 'error' else 1, **({'message': _clip(record.get('code') or 'error', 200)} if status == 'error' else {})}}
        if parent:
            span['parentSpanId'] = langfuse_span_id(parent)
        return span

    def payload(self, spans: List[dict]) -> dict:
        return {'resourceSpans': [{
            'resource': {'attributes': [a for a in (_attr('service.name', 'winmate'), _attr('deployment.environment', self.environment)) if a]},
            'scopeSpans': [{'scope': {'name': 'winmate.ops_bridge', 'version': '1'}, 'spans': spans}]}]}

    # -- delivery
    def _send(self, spans: List[dict]) -> bool:
        data = json.dumps(self.payload(spans), ensure_ascii=False).encode('utf-8')
        error = ''
        for attempt in range(3):
            if attempt:
                if self._stop.wait(1.5 * attempt) and attempt > 1:
                    break
            request = urllib.request.Request(self.endpoint, data=data, headers=self.headers, method='POST')
            try:
                with self._opener.open(request, timeout=self.timeout) as response:
                    response.read()
                with self._lock:
                    self.stats['sent'] += len(spans)
                    self.stats['last_ok_at'] = time.time()
                return True
            except urllib.error.HTTPError as exc:
                detail = exc.read(300).decode('utf-8', 'replace') if exc.fp else ''
                error = f'HTTP {exc.code} {detail}'.strip()
                if exc.code in (400, 401, 403, 404, 413):
                    break  # not retryable
            except (urllib.error.URLError, OSError, ValueError) as exc:
                error = f'{type(exc).__name__}: {getattr(exc, "reason", exc)}'
        with self._lock:
            first = not self.stats['failed_batches']
            self.stats['failed_batches'] += 1
            self.stats['dropped'] += len(spans)
            self.stats['last_error'] = _clip(error, 300)
            self.stats['last_error_at'] = time.time()
        if first or self.stats['failed_batches'] in (10, 100, 1000):
            log.warning('Langfuse export failed (%s batches): %s', self.stats['failed_batches'], self.stats['last_error'])
        return False

    def _run(self) -> None:
        pending: List[dict] = []
        deadline = time.monotonic() + self.flush_interval
        while True:
            stopping = self._stop.is_set()
            try:
                kind, record = self.queue.get(timeout=0.05 if stopping else max(0.05, deadline - time.monotonic()))
                try:
                    span = self.to_span(kind, record)
                    if span:
                        pending.append(span)
                except Exception as exc:  # a malformed record must not stop the exporter
                    with self._lock:
                        self.stats['dropped'] += 1
                        self.stats['last_error'] = f'convert: {type(exc).__name__}'
            except queue.Empty:
                if stopping:
                    break
            if pending and (len(pending) >= self.batch or time.monotonic() >= deadline or stopping):
                self._send(pending)
                pending = []
            if time.monotonic() >= deadline:
                deadline = time.monotonic() + self.flush_interval
            if not pending and self.queue.empty():
                self._idle.set()
        if pending:
            self._send(pending)
        self._idle.set()

    def start(self) -> 'LangfuseExporter':
        if self._thread is None:
            self._thread = threading.Thread(target=self._run, name='winmate-langfuse-export', daemon=True)
            self._thread.start()
        return self

    def flush(self, timeout: float = 5.0) -> bool:
        return self._idle.wait(timeout)

    def stop(self, timeout: float = 3.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout)

    def health(self) -> dict:
        with self._lock:
            return {'enabled': True, 'endpoint': self.host, 'content': self.content, 'environment': self.environment,
                    **self.stats, 'queue': self.queue.qsize()}


# ---------------------------------------------------------------- Metabase snapshot

SNAPSHOT_SCHEMA = '''
CREATE TABLE users(username TEXT PRIMARY KEY, display_name TEXT, role TEXT, active INTEGER, credential_source TEXT,
  created_at REAL, updated_at REAL, last_login REAL, note TEXT);
CREATE TABLE spans(id TEXT PRIMARY KEY, trace_id TEXT, parent_id TEXT, username TEXT, session_id TEXT, kind TEXT, feature TEXT,
  stage TEXT, page TEXT, action TEXT, started REAL, ended REAL, duration_ms INTEGER, status TEXT, http_status INTEGER, method TEXT,
  path TEXT, code TEXT, message TEXT, stack TEXT, model TEXT, job_id TEXT, input_tokens INTEGER, output_tokens INTEGER,
  thought_tokens INTEGER, cached_tokens INTEGER, total_tokens INTEGER, usage_known INTEGER, metadata TEXT);
CREATE TABLE history(username TEXT, kind TEXT, record_id TEXT, title TEXT, created_at REAL, updated_at REAL, last_seen REAL,
  archived INTEGER, revision INTEGER, payload_bytes INTEGER, payload TEXT, PRIMARY KEY(username, kind, record_id));
CREATE TABLE proposals(username TEXT, record_id TEXT, title TEXT, customer TEXT, industry TEXT, stage TEXT, scenario TEXT,
  created_at REAL, updated_at REAL, exported_at REAL, archived INTEGER, revision INTEGER, parts INTEGER, slides INTEGER,
  products INTEGER, solutions INTEGER, cases INTEGER, keymen INTEGER, req_files INTEGER, shared INTEGER,
  PRIMARY KEY(username, record_id));
CREATE TABLE customer_voice(id TEXT PRIMARY KEY, owner TEXT, message TEXT, created_at REAL, status TEXT, updated_at REAL,
  work_type TEXT, work_id TEXT, stage TEXT, path TEXT);
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
'''
_SPAN_COLUMNS = ('id', 'trace_id', 'parent_id', 'username', 'session_id', 'kind', 'feature', 'stage', 'page', 'action', 'started',
                 'ended', 'duration_ms', 'status', 'http_status', 'method', 'path', 'code', 'message', 'stack', 'model', 'job_id',
                 'input_tokens', 'output_tokens', 'thought_tokens', 'cached_tokens', 'total_tokens', 'usage_known', 'metadata')
_USER_COLUMNS = ('username', 'display_name', 'role', 'active', 'credential_source', 'created_at', 'updated_at', 'last_login', 'note')
_VOICE_COLUMNS = ('id', 'owner', 'message', 'created_at', 'status', 'updated_at', 'work_type', 'work_id', 'stage', 'path')
_SECRET_KEY = re.compile(r'(?i)(password|passwd|authorization|cookie|api[_-]?key|secret|access_token|refresh_token|share_?token)')


def _seconds(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return value / 1000 if value > 100_000_000_000 else float(value)
    return None


def lite(value: Any, depth: int = 0, key: str = '') -> Any:
    """Keep the shape of a history document for analysis; drop secrets, images and long text."""
    if _SECRET_KEY.search(key):
        return '[redacted]'
    if depth > 12:
        return '[depth]'
    if isinstance(value, dict):
        return {str(k)[:80]: lite(v, depth + 1, str(k)) for k, v in list(value.items())[:200]}
    if isinstance(value, list):
        items = [lite(v, depth + 1) for v in value[:500]]
        if len(value) > 500:
            items.append(f'[+{len(value) - 500} items]')
        return items
    if isinstance(value, str):
        if value.startswith('data:'):
            return f'[{value[5:value.find(";")] if ";" in value[:80] else "data"} · {len(value) * 3 // 4 // 1024} KB]'
        return value if len(value) <= 300 else value[:200] + f'… [{len(value):,} chars]'
    return value


def proposal_summary(document: Any) -> dict:
    doc = document if isinstance(document, dict) else {}
    parts = [p for p in (doc.get('parts') or []) if isinstance(p, dict)]
    ctx = doc.get('ctx') if isinstance(doc.get('ctx'), dict) else {}
    req = doc.get('req') if isinstance(doc.get('req'), dict) else {}
    form = req.get('form') if isinstance(req.get('form'), dict) else {}
    count = lambda value: len(value) if isinstance(value, list) else 0
    text = lambda value: str(value)[:300] if value not in (None, '') else None
    return {'customer': text(doc.get('customer') or form.get('customer')), 'industry': text(doc.get('ind')),
            'stage': text(doc.get('stage')), 'scenario': text(doc.get('scenario')),
            'exported_at': _seconds(doc.get('exportedAt')), 'parts': len(parts),
            'slides': sum(count(p.get('layouts')) for p in parts), 'products': count(ctx.get('products')),
            'solutions': count(ctx.get('solutions')), 'cases': count(ctx.get('cases')),
            'keymen': count(form.get('keymen')), 'req_files': count(req.get('files')), 'shared': int(bool(doc.get('_share')))}


class AnalyticsSnapshot:
    FILE = 'winmate.sqlite'
    MANIFEST = 'manifest.json'

    def __init__(self, directory: Path, *, operations: Optional[Path], voice: Optional[Path], interval: float = 300, days: float = 90):
        self.directory = Path(directory)
        self.operations, self.voice = operations, voice
        self.interval, self.days = interval, days
        self.stats: Dict[str, Any] = {'enabled': True, 'dir': str(self.directory), 'last_snapshot_at': None, 'rows': {},
                                      'bytes': 0, 'last_error': '', 'runs': 0}
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    @staticmethod
    def _open(path: Path) -> sqlite3.Connection:
        db = sqlite3.connect(path, timeout=30)
        db.execute('PRAGMA query_only=ON')
        return db

    @staticmethod
    def _tables(db: sqlite3.Connection) -> set:
        return {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    @staticmethod
    def _columns(db: sqlite3.Connection, table: str) -> set:
        return {row[1] for row in db.execute(f'PRAGMA table_info({table})')}

    def build(self, target: Path) -> Dict[str, int]:
        rows: Dict[str, int] = {}
        out = sqlite3.connect(target)
        try:
            out.executescript(SNAPSHOT_SCHEMA)
            if self.operations and Path(self.operations).is_file():
                src = self._open(Path(self.operations))
                try:
                    src.execute('BEGIN')  # one consistent read snapshot across tables (WAL)
                    tables = self._tables(src)
                    if 'users' in tables:
                        have = self._columns(src, 'users')
                        cols = [c if c in have else 'NULL' for c in _USER_COLUMNS]
                        data = src.execute('SELECT ' + ','.join(cols) + ' FROM users').fetchall()
                        out.executemany(f'INSERT INTO users VALUES ({",".join("?" * len(_USER_COLUMNS))})', data)
                        rows['users'] = len(data)
                    if 'spans' in tables:
                        have = self._columns(src, 'spans')
                        cols = [c if c in have else 'NULL' for c in _SPAN_COLUMNS]
                        cursor = src.execute('SELECT ' + ','.join(cols) + ' FROM spans WHERE started >= ? ORDER BY started',
                                             (time.time() - self.days * 86400,))
                        count = 0
                        while True:
                            chunk = cursor.fetchmany(5000)
                            if not chunk:
                                break
                            out.executemany(f'INSERT OR IGNORE INTO spans VALUES ({",".join("?" * len(_SPAN_COLUMNS))})', chunk)
                            count += len(chunk)
                        rows['spans'] = count
                    if 'history' in tables:
                        cursor = src.execute('SELECT username,kind,record_id,title,created_at,updated_at,last_seen,archived,revision,payload FROM history')
                        history = proposals = 0
                        while True:
                            chunk = cursor.fetchmany(500)
                            if not chunk:
                                break
                            for username, kind, record_id, title, created, updated, seen, archived, revision, payload in chunk:
                                try:
                                    document = json.loads(payload or 'null')
                                except ValueError:
                                    document = None
                                trimmed = json.dumps(lite(document), ensure_ascii=False, default=str)
                                if len(trimmed) > 200_000:
                                    trimmed = json.dumps({'truncated': True, 'bytes': len(payload or '')})
                                out.execute('INSERT OR REPLACE INTO history VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                                            (username, kind, record_id, title, created, updated, seen, archived, revision,
                                             len(payload or ''), trimmed))
                                history += 1
                                if kind == 'proposal':
                                    s = proposal_summary(document)
                                    out.execute('INSERT OR REPLACE INTO proposals VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                                (username, record_id, title, s['customer'], s['industry'], s['stage'], s['scenario'],
                                                 created, updated, s['exported_at'], archived, revision, s['parts'], s['slides'],
                                                 s['products'], s['solutions'], s['cases'], s['keymen'], s['req_files'], s['shared']))
                                    proposals += 1
                        rows['history'], rows['proposals'] = history, proposals
                finally:
                    src.rollback()
                    src.close()
            if self.voice and Path(self.voice).is_file():
                src = self._open(Path(self.voice))
                try:
                    if 'customer_voice' in self._tables(src):
                        data = src.execute('SELECT ' + ','.join(_VOICE_COLUMNS) + ' FROM customer_voice').fetchall()
                        out.executemany(f'INSERT OR REPLACE INTO customer_voice VALUES ({",".join("?" * len(_VOICE_COLUMNS))})', data)
                        rows['customer_voice'] = len(data)
                finally:
                    src.close()
            out.executemany('INSERT INTO meta VALUES (?,?)', [('created_at', str(time.time())), ('span_days', str(self.days)),
                                                                ('format', '1')])
            out.commit()
        finally:
            out.close()
        return rows

    def run_once(self) -> Dict[str, Any]:
        self.directory.mkdir(parents=True, exist_ok=True)
        tmp = self.directory / f'.{self.FILE}.{os.getpid()}.tmp'
        tmp.unlink(missing_ok=True)
        try:
            rows = self.build(tmp)
            digest = hashlib.sha256()
            with tmp.open('rb') as handle:
                for block in iter(lambda: handle.read(1 << 20), b''):
                    digest.update(block)
            size = tmp.stat().st_size
            os.replace(tmp, self.directory / self.FILE)
            manifest = {'format': 1, 'file': self.FILE, 'created_at': time.time(), 'bytes': size,
                        'sha256': digest.hexdigest(), 'rows': rows, 'span_days': self.days}
            mtmp = self.directory / f'.{self.MANIFEST}.tmp'
            mtmp.write_text(json.dumps(manifest), encoding='utf-8')
            os.replace(mtmp, self.directory / self.MANIFEST)
            with self._lock:
                self.stats.update(last_snapshot_at=manifest['created_at'], rows=rows, bytes=size, last_error='')
                self.stats['runs'] += 1
            return manifest
        except Exception as exc:
            tmp.unlink(missing_ok=True)
            with self._lock:
                self.stats['last_error'] = f'{type(exc).__name__}: {exc}'[:300]
            log.warning('Analytics snapshot failed: %s', self.stats['last_error'])
            raise

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.run_once()
            except Exception:
                pass
            self._stop.wait(self.interval)

    def start(self) -> 'AnalyticsSnapshot':
        if self._thread is None:
            self._thread = threading.Thread(target=self._run, name='winmate-analytics-snapshot', daemon=True)
            self._thread.start()
        return self

    def stop(self, timeout: float = 3.0) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout)

    def health(self) -> dict:
        with self._lock:
            return dict(self.stats)


# ---------------------------------------------------------------- lifecycle


class Bridge:
    def __init__(self, exporter: Optional[LangfuseExporter], snapshot: Optional[AnalyticsSnapshot], status_file: Optional[Path]):
        self.exporter, self.snapshot, self.status_file = exporter, snapshot, status_file
        self._previous_sink = None
        self._sink: Optional[Callable] = None
        self._previous_capture = False
        self._stop = threading.Event()
        self._status_thread: Optional[threading.Thread] = None

    def health(self) -> dict:
        return {'langfuse': self.exporter.health() if self.exporter else {'enabled': False},
                'analytics': self.snapshot.health() if self.snapshot else {'enabled': False}}

    def _write_status(self) -> None:
        if not self.status_file:
            return
        try:
            self.status_file.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.status_file.with_name('.' + self.status_file.name + '.tmp')
            tmp.write_text(json.dumps({'updated_at': time.time(), **self.health()}, ensure_ascii=False, indent=1), encoding='utf-8')
            os.replace(tmp, self.status_file)
        except OSError:
            pass

    def _status_loop(self) -> None:
        while not self._stop.wait(30):
            self._write_status()

    def start(self) -> 'Bridge':
        if self.exporter:
            self.exporter.start()
            exporter = self.exporter
            primary = telemetry.install(None)

            def sink(kind: str, record: dict) -> None:
                try:
                    if primary is not None:
                        primary(kind, {k: v for k, v in record.items() if k != 'content'} if 'content' in record else record)
                finally:
                    exporter.handle(kind, record)

            self._previous_sink, self._sink = primary, sink
            telemetry.install(sink)
            self._previous_capture = telemetry.capture_content(exporter.content)
        if self.snapshot:
            self.snapshot.start()
        telemetry.register_health('ops', self.health)
        if self.exporter or self.snapshot:
            self._write_status()
            self._status_thread = threading.Thread(target=self._status_loop, name='winmate-ops-status', daemon=True)
            self._status_thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        if self.exporter:
            if telemetry.install(None) is not self._sink:
                log.warning('Telemetry sink changed while the ops bridge was active; restoring the previous sink anyway.')
            telemetry.install(self._previous_sink)
            telemetry.capture_content(self._previous_capture)
            self.exporter.flush(2.0)
            self.exporter.stop()
        if self.snapshot:
            self.snapshot.stop()
        telemetry.register_health('ops', None)
        self._write_status()


def _sources(app: Any) -> tuple:
    state = getattr(app, 'state', None)
    accounts = getattr(getattr(state, 'auth', None), 'accounts', None)
    operations = getattr(getattr(accounts, 'ops', None), 'path', None)
    voice = getattr(getattr(state, 'my_templates', None), 'path', None)
    return (Path(operations) if operations else None), (Path(voice) if voice else None)


def start(app: Any = None, config: Optional[Dict[str, str]] = None) -> Bridge:
    config = load_config() if config is None else config
    exporter = snapshot = None
    host = config.get('LANGFUSE_HOST') or config.get('LANGFUSE_BASE_URL')
    if host and config.get('LANGFUSE_PUBLIC_KEY') and config.get('LANGFUSE_SECRET_KEY') and _flag(config.get('WINMATE_LANGFUSE'), True):
        exporter = LangfuseExporter(host, config['LANGFUSE_PUBLIC_KEY'], config['LANGFUSE_SECRET_KEY'],
                                    environment=config.get('WINMATE_LANGFUSE_ENVIRONMENT', 'winmate').lower(),
                                    content=_flag(config.get('WINMATE_LANGFUSE_CONTENT'), True))
    directory = config.get('WINMATE_ANALYTICS_DIR')
    if directory:
        operations, voice = _sources(app)
        path = Path(directory)
        snapshot = AnalyticsSnapshot(path if path.is_absolute() else ROOT / path, operations=operations, voice=voice,
                                     interval=_number(config.get('WINMATE_ANALYTICS_INTERVAL'), 300, 30, 86400),
                                     days=_number(config.get('WINMATE_ANALYTICS_DAYS'), 90, 1, 3650))
    bridge = Bridge(exporter, snapshot, RUNTIME / 'ops-bridge.json' if (exporter or snapshot) else None)
    bridge.start()
    if exporter or snapshot:
        log.warning('Ops bridge on — Langfuse: %s, analytics snapshot: %s',
                    exporter.host if exporter else 'off', snapshot.directory if snapshot else 'off')
    return bridge
