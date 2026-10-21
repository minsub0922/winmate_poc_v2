from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import uuid

from .config import SOURCE_SEEDS


def now():
    return datetime.now(timezone.utc).isoformat()


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else dump(value).encode()).hexdigest()


def semantic_digest(payload, content):
    def clean(value):
        if isinstance(value, dict):
            return {key: clean(v) for key, v in sorted(value.items()) if key not in ('source_checked_at', 'fetched_at', 'engine')}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value
    try:
        structured_content = json.loads(content)
    except (ValueError, TypeError):
        structured_content = content
    return digest({'payload': clean(payload), 'content': clean(structured_content)})


class Store:
    def __init__(self, home: Path):
        self.home = home
        home.mkdir(parents=True, exist_ok=True)
        self.path = home / 'admin.sqlite'
        with self.db() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sources(
                  id TEXT PRIMARY KEY, name TEXT, description TEXT, url TEXT, kind TEXT,
                  interval_days INTEGER, enabled INTEGER DEFAULT 1, imported_at TEXT,
                  checked_at TEXT, refreshed_at TEXT, status TEXT DEFAULT 'unchecked',
                  decision TEXT DEFAULT '{}', error TEXT);
                CREATE TABLE IF NOT EXISTS assets(
                  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
                  kind TEXT, title TEXT, external_id TEXT, url TEXT, path TEXT,
                  content TEXT, payload TEXT, hash TEXT, imported_at TEXT,
                  first_seen TEXT, updated_at TEXT, checked_at TEXT, status TEXT DEFAULT 'indexed');
                CREATE INDEX IF NOT EXISTS asset_kind ON assets(kind,source_id);
                CREATE VIRTUAL TABLE IF NOT EXISTS asset_fts USING fts5(id UNINDEXED,title,content,tokenize='unicode61');
                CREATE TABLE IF NOT EXISTS jobs(
                  id TEXT PRIMARY KEY, kind TEXT, source_id TEXT, status TEXT,
                  progress INTEGER DEFAULT 0, stage TEXT, created_at TEXT, started_at TEXT,
                  finished_at TEXT, error TEXT, result TEXT DEFAULT '{}', cancelled INTEGER DEFAULT 0);
                CREATE TABLE IF NOT EXISTS events(
                  id INTEGER PRIMARY KEY, at TEXT, actor TEXT, action TEXT, target TEXT, detail TEXT);
                CREATE TABLE IF NOT EXISTS snapshots(
                  id TEXT PRIMARY KEY, source_id TEXT, at TEXT, hash TEXT, path TEXT, payload TEXT);
                CREATE TABLE IF NOT EXISTS releases(
                  id TEXT PRIMARY KEY, at TEXT, source_id TEXT, status TEXT, path TEXT,
                  manifest TEXT, previous_id TEXT);
                CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
            ''')
            db.executemany('INSERT OR IGNORE INTO sources(id,name,description,url,kind,interval_days) VALUES (?,?,?,?,?,?)', SOURCE_SEEDS)

    @contextmanager
    def db(self, immediate=False):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            if immediate:
                db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def rows(self, sql, args=()):
        with self.db() as db:
            return [dict(r) for r in db.execute(sql, args)]

    def one(self, sql, args=()):
        rows = self.rows(sql, args)
        return rows[0] if rows else None

    def event(self, action, target='', detail=None, actor='admin'):
        with self.db() as db:
            db.execute('INSERT INTO events(at,actor,action,target,detail) VALUES (?,?,?,?,?)', (now(), actor, action, target, dump(detail or {})))

    def setting(self, key, default=None):
        r = self.one('SELECT value FROM settings WHERE key=?', (key,))
        return json.loads(r['value']) if r else default

    def set_setting(self, key, value):
        with self.db() as db:
            db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', (key, dump(value)))

    def upsert_assets(self, assets, analyzed_parent=None):
        assets = list(assets)
        at = now()
        with self.db(immediate=True) as db:
            for a in assets:
                value = a.get('payload', {})
                payload = dict(value) if isinstance(value, dict) else {'items': value}
                old = db.execute('SELECT rowid,hash,first_seen,updated_at,payload FROM assets WHERE id=?', (a['id'],)).fetchone()
                if old:
                    previous_payload = json.loads(old['payload'])
                    for key in ('admin_notes', 'admin_tags'):
                        if key in previous_payload:
                            payload[key] = previous_payload[key]
                value_hash = digest({'payload': payload, 'content': a.get('content', '')})
                updated = old['updated_at'] if old and old['hash'] == value_hash else at
                db.execute('''INSERT INTO assets(id,source_id,kind,title,external_id,url,path,content,payload,hash,imported_at,first_seen,updated_at,status)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                  source_id=excluded.source_id,kind=excluded.kind,title=excluded.title,
                  external_id=excluded.external_id,url=excluded.url,path=excluded.path,
                  content=excluded.content,payload=excluded.payload,hash=excluded.hash,
                  imported_at=excluded.imported_at,updated_at=excluded.updated_at''',
                  (a['id'], a['source_id'], a['kind'], a['title'], a.get('external_id'), a.get('url'), a.get('path'),
                   a.get('content', ''), dump(payload), value_hash, a.get('imported_at'), old['first_seen'] if old else at, updated, a.get('status', 'indexed')))
                rowid = old['rowid'] if old else db.execute('SELECT rowid FROM assets WHERE id=?', (a['id'],)).fetchone()[0]
                db.execute('DELETE FROM asset_fts WHERE rowid=?', (rowid,))
                db.execute('INSERT INTO asset_fts(rowid,id,title,content) VALUES (?,?,?,?)', (rowid, a['id'], a['title'], a.get('content', '')[:50000]))
            if analyzed_parent:
                db.execute("UPDATE assets SET status=CASE WHEN status IN ('pending','analysis_failed') THEN 'indexed' ELSE status END,checked_at=? WHERE id=?", (at, analyzed_parent))
                # Keep former interpretations for history and mark them for review, rather than reassigning their IDs.
                current_ids = {a['id'] for a in assets}
                children = db.execute("SELECT id FROM assets WHERE json_extract(payload,'$.parent_asset_id')=? AND status!='archived'", (analyzed_parent,)).fetchall()
                for child in children:
                    if child['id'] not in current_ids:
                        db.execute("UPDATE assets SET status='needs_review' WHERE id=?", (child['id'],))

    def assets(self, q='', kind='', source='', status='', offset=0, limit=24):
        clauses, args = [], []
        for k, v in [('kind', kind), ('source_id', source), ('status', status)]:
            if v:
                clauses.append(f'a.{k}=?'); args.append(v)
        if q:
            literal = '%' + q.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
            clauses.append("(a.title LIKE ? ESCAPE '\\' OR a.external_id LIKE ? ESCAPE '\\' OR a.content LIKE ? ESCAPE '\\' OR a.payload LIKE ? ESCAPE '\\')")
            args += [literal] * 4
        where = ' WHERE ' + ' AND '.join(clauses) if clauses else ''
        total = self.one('SELECT count(*) n FROM assets a' + where, args)['n']
        rows = self.rows('SELECT a.id,a.source_id,a.kind,a.title,a.external_id,a.url,a.path,a.hash,a.imported_at,a.first_seen,a.updated_at,a.status FROM assets a' + where + ' ORDER BY a.updated_at DESC,a.title LIMIT ? OFFSET ?', [*args, limit, offset])
        return {'items': rows, 'total': total, 'offset': offset, 'limit': limit}

    def source(self, sid):
        return self.one('SELECT * FROM sources WHERE id=?', (sid,))

    def job(self, jid):
        r = self.one('SELECT * FROM jobs WHERE id=?', (jid,))
        if r:
            r['result'] = json.loads(r['result'])
        return r

    def new_job(self, kind, source, extra=None):
        jid = uuid.uuid4().hex
        with self.db() as db:
            db.execute('INSERT INTO jobs(id,kind,source_id,status,stage,created_at,result) VALUES (?,?,?,?,?,?,?)', (jid, kind, source, 'queued', '시작 대기', now(), dump({'input': extra or {}})))
        return jid

    def progress(self, jid, stage, n):
        with self.db() as db:
            db.execute("UPDATE jobs SET status='running',stage=?,progress=?,started_at=COALESCE(started_at,?) WHERE id=?", (stage, min(99, n), now(), jid))

    def finish(self, jid, result, status='succeeded', error=None):
        with self.db() as db:
            previous = db.execute('SELECT result FROM jobs WHERE id=?', (jid,)).fetchone()
            params = json.loads(previous[0]).get('input', {}) if previous else {}
            db.execute('UPDATE jobs SET status=?,progress=?,finished_at=?,error=?,result=? WHERE id=?', (status, 100 if status == 'succeeded' else 0, now(), error, dump({'input': params, **result}), jid))

    def cancelled(self, jid):
        r = self.one('SELECT cancelled FROM jobs WHERE id=?', (jid,))
        return bool(r and r['cancelled'])
