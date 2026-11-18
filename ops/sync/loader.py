"""Load Winmate's sanitized operations snapshot into Postgres for Metabase.

Winmate (app/api/ops_bridge.py) writes SNAPSHOT_DIR/winmate.sqlite atomically, then manifest.json with its sha256.
This loop loads a new snapshot in one transaction (TRUNCATE + COPY, then views), so Metabase never sees a half load.
The snapshot is opened with immutable=1: it is never written after the rename, and nothing here touches the live DB.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import time

import psycopg
from psycopg.types.json import Jsonb

SNAPSHOT_DIR = Path(os.environ.get('SNAPSHOT_DIR', '/snapshots'))
DSN = os.environ['SYNC_DSN']
READER = os.environ.get('SYNC_READER_ROLE', 'metabase_ro')
INTERVAL = max(10, int(os.environ.get('SYNC_INTERVAL', '60')))
LANGFUSE_URL = os.environ.get('LANGFUSE_PUBLIC_URL', 'http://localhost:8810').rstrip('/')
LANGFUSE_PROJECT = os.environ.get('LANGFUSE_PROJECT_ID', 'winmate')
VIEWS = Path(__file__).with_name('views.sql')
_HEX32 = re.compile(r'[0-9a-f]{32}')
_IDENT = re.compile(r'[a-z_][a-z0-9_]*')

TABLES = {
    'users': ('''username text PRIMARY KEY, display_name text, role text, active boolean, credential_source text,
                 created_at timestamptz, updated_at timestamptz, last_login timestamptz, note text''',
              ['username', 'display_name', 'role', 'active', 'credential_source', 'created_at', 'updated_at', 'last_login', 'note']),
    'spans': ('''id text PRIMARY KEY, trace_id text, langfuse_trace_id text, parent_id text, username text, session_id text,
                 kind text, feature text, stage text, page text, action text, started_at timestamptz, ended_at timestamptz,
                 duration_ms bigint, status text, http_status integer, method text, path text, code text, message text, stack text,
                 model text, job_id text, input_tokens bigint, output_tokens bigint, thought_tokens bigint, cached_tokens bigint,
                 total_tokens bigint, usage_known boolean, metadata jsonb''',
              ['id', 'trace_id', 'langfuse_trace_id', 'parent_id', 'username', 'session_id', 'kind', 'feature', 'stage', 'page',
               'action', 'started_at', 'ended_at', 'duration_ms', 'status', 'http_status', 'method', 'path', 'code', 'message',
               'stack', 'model', 'job_id', 'input_tokens', 'output_tokens', 'thought_tokens', 'cached_tokens', 'total_tokens',
               'usage_known', 'metadata']),
    'history': ('''username text, kind text, record_id text, title text, created_at timestamptz, updated_at timestamptz,
                   last_seen timestamptz, archived boolean, revision integer, payload_bytes bigint, payload jsonb,
                   PRIMARY KEY(username, kind, record_id)''',
                ['username', 'kind', 'record_id', 'title', 'created_at', 'updated_at', 'last_seen', 'archived', 'revision',
                 'payload_bytes', 'payload']),
    'proposals': ('''username text, record_id text, title text, customer text, industry text, stage text, scenario text,
                     created_at timestamptz, updated_at timestamptz, exported_at timestamptz, archived boolean, revision integer,
                     parts integer, slides integer, products integer, solutions integer, cases integer, keymen integer,
                     req_files integer, shared boolean, PRIMARY KEY(username, record_id)''',
                  ['username', 'record_id', 'title', 'customer', 'industry', 'stage', 'scenario', 'created_at', 'updated_at',
                   'exported_at', 'archived', 'revision', 'parts', 'slides', 'products', 'solutions', 'cases', 'keymen',
                   'req_files', 'shared']),
    'customer_voice': ('''id text PRIMARY KEY, owner text, message text, created_at timestamptz, status text,
                          updated_at timestamptz, work_type text, work_id text, stage text, path text''',
                       ['id', 'owner', 'message', 'created_at', 'status', 'updated_at', 'work_type', 'work_id', 'stage', 'path']),
}
TIMES = {'created_at', 'updated_at', 'last_login', 'last_seen', 'exported_at'}
BOOLS = {'active', 'archived', 'usage_known', 'shared'}


def langfuse_trace_id(value) -> str:
    """Same rule as app/api/ops_bridge.py: keep 32-hex ids, hash anything else."""
    text = str(value or '')
    if _HEX32.fullmatch(text) and text != '0' * 32:
        return text
    return hashlib.sha256(text.encode('utf-8')).hexdigest()[:32]


def clean(value):
    if isinstance(value, str):
        return value.replace('\x00', '')
    if isinstance(value, dict):
        return {clean(k): clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


def stamp(value):
    if value is None or value == '':
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 100_000_000_000:
        number /= 1000
    return datetime.fromtimestamp(number, timezone.utc)


def as_json(text):
    if text in (None, ''):
        return None
    try:
        return Jsonb(clean(json.loads(text)))
    except (TypeError, ValueError):
        return None


def rows(db: sqlite3.Connection, table: str):
    db.row_factory = sqlite3.Row
    have = {r[1] for r in db.execute(f'PRAGMA table_info({table})')}
    if not have:
        return
    for row in db.execute(f'SELECT * FROM {table}'):
        record = dict(row)
        if table == 'spans':
            record['langfuse_trace_id'] = langfuse_trace_id(record.get('trace_id'))
            record['started_at'] = stamp(record.pop('started', None))
            record['ended_at'] = stamp(record.pop('ended', None))
            record['metadata'] = as_json(record.get('metadata'))
        elif table == 'history':
            record['payload'] = as_json(record.get('payload'))
        for key in TIMES & record.keys():
            record[key] = stamp(record[key])
        for key in BOOLS & record.keys():
            record[key] = None if record[key] is None else bool(record[key])
        yield [clean(record.get(c)) for c in TABLES[table][1]]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def ensure_schema(cur):
    for table, (columns, _) in TABLES.items():
        cur.execute(f'CREATE TABLE IF NOT EXISTS winmate.{table} ({columns})')
    cur.execute('''CREATE TABLE IF NOT EXISTS winmate.sync_status(
        id integer PRIMARY KEY DEFAULT 1, sha256 text, snapshot_at timestamptz, loaded_at timestamptz, rows jsonb,
        langfuse_url text, langfuse_project text, CHECK (id = 1))''')


def load(manifest: dict, snapshot: Path) -> dict:
    counts = {}
    source = sqlite3.connect(f'file:{snapshot}?immutable=1', uri=True)
    try:
        with psycopg.connect(DSN, autocommit=False) as pg:
            with pg.cursor() as cur:
                cur.execute('SET LOCAL lock_timeout = \'30s\'')
                ensure_schema(cur)
                for table, (_, columns) in TABLES.items():
                    cur.execute(f'TRUNCATE winmate.{table}')
                    with cur.copy(f'COPY winmate.{table} ({",".join(columns)}) FROM STDIN') as copy:
                        n = 0
                        for record in rows(source, table) or ():
                            copy.write_row(record)
                            n += 1
                    counts[table] = n
                cur.execute('''INSERT INTO winmate.sync_status(id, sha256, snapshot_at, loaded_at, rows, langfuse_url, langfuse_project)
                               VALUES (1, %s, %s, now(), %s, %s, %s)
                               ON CONFLICT (id) DO UPDATE SET sha256=excluded.sha256, snapshot_at=excluded.snapshot_at,
                               loaded_at=excluded.loaded_at, rows=excluded.rows, langfuse_url=excluded.langfuse_url,
                               langfuse_project=excluded.langfuse_project''',
                            (manifest['sha256'], stamp(manifest.get('created_at')), Jsonb(counts), LANGFUSE_URL, LANGFUSE_PROJECT))
                cur.execute(VIEWS.read_text(encoding='utf-8'))
                if _IDENT.fullmatch(READER):
                    cur.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA winmate TO {READER}')
            pg.commit()
    finally:
        source.close()
    return counts


def main():
    loaded = None
    print(f'winmate-sync: watching {SNAPSHOT_DIR} every {INTERVAL}s', flush=True)
    while True:
        try:
            manifest_path = SNAPSHOT_DIR / 'manifest.json'
            if manifest_path.is_file():
                manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
                snapshot = SNAPSHOT_DIR / manifest.get('file', 'winmate.sqlite')
                if manifest.get('sha256') != loaded and snapshot.is_file():
                    if snapshot.stat().st_size != manifest.get('bytes') or sha256(snapshot) != manifest.get('sha256'):
                        print('winmate-sync: snapshot is being replaced, retrying next round', flush=True)
                    else:
                        started = time.time()
                        counts = load(manifest, snapshot)
                        loaded = manifest['sha256']
                        print(f'winmate-sync: loaded {counts} in {time.time() - started:.1f}s', flush=True)
            elif loaded is None:
                print('winmate-sync: no snapshot yet — Winmate writes one after restart (WINMATE_ANALYTICS_DIR)', flush=True)
                loaded = ''
        except Exception as exc:  # keep running; the next snapshot may load
            print(f'winmate-sync: load failed: {type(exc).__name__}: {exc}', flush=True)
        time.sleep(INTERVAL)


if __name__ == '__main__':
    main()
