"""Durable, account-scoped histories and operational traces, separate from asset exports."""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import threading
import time
import uuid

from .store import dump

KST = timezone(timedelta(hours=9))
_SECRET = re.compile(r'(?i)(password|passwd|authorization|cookie|api[_-]?key|secret|access_token|refresh_token)')


def clean(value, key='', depth=0):
    from app.api.poc.provider import redact
    if _SECRET.search(key):
        return '[redacted]'
    if depth > 12:
        return '[nested]'
    if isinstance(value, dict):
        return {str(k)[:100]: clean(v, str(k), depth + 1) for k, v in list(value.items())[:100]}
    if isinstance(value, (list, tuple)):
        return [clean(v, '', depth + 1) for v in value[:200]]
    if isinstance(value, str):
        return redact(value)[:18000]
    return value if value is None or isinstance(value, (int, float, bool)) else redact(str(value))[:2000]


def clean_history(value, key='', depth=0):
    from app.api.poc.provider import redact
    if _SECRET.search(key):return '[redacted]'
    if depth>60:raise ValueError('히스토리 데이터가 너무 깊습니다.')
    if isinstance(value,dict):return {str(k):clean_history(v,str(k),depth+1) for k,v in value.items()}
    if isinstance(value,list):return [clean_history(v,'',depth+1) for v in value]
    if isinstance(value,str):return redact(value)
    return value if value is None or isinstance(value,(int,float,bool)) else redact(str(value))


class Operations:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / 'operations.sqlite'
        self.accounts = None
        with self.db() as db:
            db.executescript('''
              PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS users(
                username TEXT PRIMARY KEY, display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
                active INTEGER NOT NULL DEFAULT 1, credential_source TEXT NOT NULL DEFAULT 'managed',
                salt TEXT, password_hash TEXT, iterations INTEGER, generation TEXT, created_at REAL,
                updated_at REAL, last_login REAL, note TEXT DEFAULT '');
              CREATE TABLE IF NOT EXISTS spans(
                id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_id TEXT, username TEXT NOT NULL,
                session_id TEXT, kind TEXT NOT NULL, feature TEXT, stage TEXT, page TEXT, action TEXT,
                started REAL NOT NULL, ended REAL, duration_ms INTEGER, status TEXT, http_status INTEGER,
                method TEXT, path TEXT, code TEXT, message TEXT, stack TEXT, model TEXT, job_id TEXT,
                input_tokens INTEGER, output_tokens INTEGER, thought_tokens INTEGER, cached_tokens INTEGER,
                total_tokens INTEGER, usage_known INTEGER DEFAULT 0, metadata TEXT DEFAULT '{}');
              CREATE INDEX IF NOT EXISTS spans_time ON spans(started);
              CREATE INDEX IF NOT EXISTS spans_owner ON spans(username,started);
              CREATE INDEX IF NOT EXISTS spans_trace ON spans(trace_id,started);
              CREATE INDEX IF NOT EXISTS spans_feature ON spans(feature,kind,started);
              CREATE TABLE IF NOT EXISTS history(
                username TEXT NOT NULL, kind TEXT NOT NULL, record_id TEXT NOT NULL, title TEXT,
                payload TEXT NOT NULL, hash TEXT NOT NULL, created_at REAL, updated_at REAL,
                last_seen REAL, archived INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY(username,kind,record_id));
              CREATE TABLE IF NOT EXISTS history_versions(
                id INTEGER PRIMARY KEY, username TEXT, kind TEXT, record_id TEXT, revision INTEGER,
                at REAL, payload TEXT, hash TEXT, UNIQUE(username,kind,record_id,revision));
              CREATE INDEX IF NOT EXISTS history_user ON history(username,kind,updated_at);
              CREATE TABLE IF NOT EXISTS operation_meta(key TEXT PRIMARY KEY,value TEXT);
            ''')
            db.execute("UPDATE spans SET status='error',code='process_restarted',message='서버 재시작으로 완료 여부를 확인할 수 없습니다.' WHERE status='running' AND ended IS NULL")
            db.execute("INSERT OR IGNORE INTO operation_meta VALUES ('started_at',?)", (str(time.time()),))
        self.lock = threading.RLock()
        self.path.chmod(0o600)
        for suffix in ('-wal','-shm'):
            file=Path(str(self.path)+suffix)
            if file.exists():file.chmod(0o600)

    @contextmanager
    def db(self, immediate=False):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            if immediate:
                db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback(); raise
        finally:
            db.close()

    def rows(self, sql, args=()):
        with self.db() as db:
            return [dict(r) for r in db.execute(sql, args)]

    def one(self, sql, args=()):
        rows = self.rows(sql, args)
        return rows[0] if rows else None

    def receive(self, kind, event, insert_only=False):
        if kind=='job.state':
            snapshot=(event.get('metadata') or {}).get('snapshot')
            if snapshot:
                self.save_history(event.get('username') or 'system','server_job',[snapshot])
            kind='job'
        event = clean(event)
        started = float(event.get('started') or time.time())
        ended = event.get('ended')
        usage = event.get('usage')
        known = isinstance(usage, dict) and any(k in usage for k in ('promptTokenCount','candidatesTokenCount','totalTokenCount'))
        token = lambda key: max(0, int(usage[key])) if known and isinstance(usage.get(key), (int, float)) else None
        record = {
            'id': event.get('span_id') or uuid.uuid4().hex[:16], 'trace_id': event.get('trace_id') or uuid.uuid4().hex,
            'parent_id': event.get('parent_id'), 'username': event.get('username') or 'system', 'session_id': event.get('session_id'),
            'kind': kind, 'feature': event.get('feature') or event.get('stage') or 'other', 'stage': event.get('stage'),
            'page': event.get('page'), 'action': event.get('action'), 'started': started, 'ended': ended,
            'duration_ms': event.get('duration_ms') if event.get('duration_ms') is not None else max(0, round((ended - started) * 1000)) if ended else None,
            'status': event.get('status', 'ok'), 'http_status': event.get('http_status'), 'method': event.get('method'),
            'path': event.get('path'), 'code': str(event.get('code') or '')[:100], 'message': event.get('message'),
            'stack': event.get('stack'), 'model': event.get('model'), 'job_id': event.get('job_id'),
            'input_tokens': token('promptTokenCount'), 'output_tokens': token('candidatesTokenCount'),
            'thought_tokens': token('thoughtsTokenCount'), 'cached_tokens': token('cachedContentTokenCount'),
            'total_tokens': token('totalTokenCount'), 'usage_known': int(known), 'metadata': dump(event.get('metadata') or {})}
        if known and record['total_tokens'] is None:
            # The API did not report its total; keep it unknown rather than guessing about overlapping counters.
            record['total_tokens'] = None
        keys = list(record)
        with self.db() as db:
            db.execute(('INSERT OR IGNORE' if insert_only else 'INSERT OR REPLACE')+' INTO spans(' + ','.join(keys) + ') VALUES (' + ','.join('?' for _ in keys) + ')', list(record.values()))

    def save_history(self, username, kind, records, complete=False, removed_ids=None):
        if kind not in ('proposal','review','simulation','job','server_job','persona','favorite','template','ui'):
            raise ValueError('지원하지 않는 히스토리 종류입니다.')
        if not isinstance(records, list) or len(records) > 2000:
            raise ValueError('히스토리는 한 번에 2,000개 이하로 보내 주세요.')
        at = time.time()
        touched = set()
        with self.db(immediate=True) as db:
            for value in records:
                if not isinstance(value, dict):
                    raise ValueError('히스토리 형식이 올바르지 않습니다.')
                identifier = str(value.get('id') or value.get('f') or value.get('key') or '')
                if not identifier or len(identifier) > 250:
                    raise ValueError('히스토리 ID가 필요합니다.')
                # Whole documents are preserved for administrator history review; credentials are removed recursively.
                payload = dump(clean_history(value))
                h = hashlib.sha256(payload.encode()).hexdigest()
                touched.add(identifier)
                old = db.execute('SELECT hash,revision FROM history WHERE username=? AND kind=? AND record_id=?', (username,kind,identifier)).fetchone()
                revision = (old['revision'] + 1) if old and old['hash'] != h else old['revision'] if old else 1
                title = str(value.get('title') or value.get('name') or value.get('customer') or identifier)[:300]
                def stamp(v):
                    if isinstance(v,(int,float)):
                        return v/1000 if v > 100_000_000_000 else v
                    return at
                db.execute('''INSERT INTO history VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(username,kind,record_id)
                  DO UPDATE SET title=excluded.title,payload=excluded.payload,hash=excluded.hash,updated_at=excluded.updated_at,
                  last_seen=excluded.last_seen,archived=0,revision=excluded.revision''',
                  (username,kind,identifier,title,payload,h,stamp(value.get('createdAt')),stamp(value.get('updatedAt')),at,0,revision))
                if not old or old['hash'] != h:
                    db.execute('INSERT INTO history_versions(username,kind,record_id,revision,at,payload,hash) VALUES (?,?,?,?,?,?,?)', (username,kind,identifier,revision,at,payload,h))
            if complete:
                previous = db.execute('SELECT record_id FROM history WHERE username=? AND kind=?', (username,kind)).fetchall()
                for old in previous:
                    if old['record_id'] not in touched:
                        db.execute('UPDATE history SET archived=1 WHERE username=? AND kind=? AND record_id=?', (username,kind,old['record_id']))
            for identifier in removed_ids or []:
                db.execute('UPDATE history SET archived=1,last_seen=?,updated_at=? WHERE username=? AND kind=? AND record_id=?',(at,at,username,kind,identifier))
        return {'stored': len(touched)}

    @staticmethod
    def period(start=None, end=None, days=7):
        now = datetime.now(KST)
        try:
            first = datetime.fromisoformat(start).replace(tzinfo=KST) if start else (now - timedelta(days=days-1)).replace(hour=0,minute=0,second=0,microsecond=0)
            last = datetime.fromisoformat(end).replace(tzinfo=KST) + timedelta(days=1) if end else now + timedelta(seconds=1)
        except (ValueError,TypeError):
            raise ValueError('기간은 YYYY-MM-DD 형식으로 입력해 주세요.') from None
        if last <= first or (last-first).days > 730:
            raise ValueError('기간은 시작일 이후, 최대 2년으로 선택해 주세요.')
        return first.timestamp(),last.timestamp()

    def where(self, start=None,end=None,username='',feature='',model='',kind='',status='',q=''):
        first,last = self.period(start,end)
        conditions,args = ['started>=?','started<?'],[first,last]
        for key,value in [('username',username),('feature',feature),('model',model),('kind',kind),('status',status)]:
            if value:
                if key=='username':
                    conditions.append("(username=? OR (kind='auth.login' AND json_extract(metadata,'$.attempted_username')=?))");args.extend([value,value])
                else:
                    conditions.append(key+'=?');args.append(value)
        if q:
            literal='%'+q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
            conditions.append("(code LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\' OR trace_id LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR CAST(http_status AS TEXT) LIKE ? ESCAPE '\\')")
            args.extend([literal]*6)
        return ' AND '.join(conditions),args,first,last

    def dashboard(self, **filters):
        where,args,first,last=self.where(**filters)
        aggregate="""COUNT(*) spans,COUNT(DISTINCT CASE WHEN username NOT IN ('system','anonymous','scheduler') THEN username END) active_users,
          SUM(CASE WHEN kind='http' THEN 1 ELSE 0 END) requests,
          SUM(CASE WHEN kind='screen.enter' THEN 1 ELSE 0 END) visits,
          SUM(CASE WHEN kind='action' THEN 1 ELSE 0 END) actions,
          SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) errors,
          SUM(CASE WHEN kind='llm.usage' THEN 1 ELSE 0 END) llm_calls,
          SUM(CASE WHEN kind='llm.usage' AND (usage_known=0 OR total_tokens IS NULL) THEN 1 ELSE 0 END) unknown_usage,
          SUM(CASE WHEN kind='llm.usage' THEN COALESCE(input_tokens,0) ELSE 0 END) input_tokens,
          SUM(CASE WHEN kind='llm.usage' THEN COALESCE(output_tokens,0) ELSE 0 END) output_tokens,
          SUM(CASE WHEN kind='llm.usage' THEN COALESCE(thought_tokens,0) ELSE 0 END) thought_tokens,
          SUM(CASE WHEN kind='llm.usage' THEN COALESCE(cached_tokens,0) ELSE 0 END) cached_tokens,
          SUM(CASE WHEN kind='llm.usage' THEN COALESCE(total_tokens,0) ELSE 0 END) total_tokens,
          AVG(CASE WHEN kind='http' THEN duration_ms END) avg_duration_ms"""
        summary=self.one('SELECT '+aggregate+' FROM spans WHERE '+where,args)
        hourly=(last-first)<=2*86400
        bucket="strftime('%Y-%m-%dT%H:00:00',started,'unixepoch','+9 hours')" if hourly else "strftime('%Y-%m-%d',started,'unixepoch','+9 hours')"
        series=self.rows('SELECT '+bucket+' bucket,'+aggregate+' FROM spans WHERE '+where+' GROUP BY bucket ORDER BY bucket',args)
        by_bucket={row['bucket']:row for row in series}
        cursor=datetime.fromtimestamp(first,KST).replace(minute=0,second=0,microsecond=0)
        if not hourly:cursor=cursor.replace(hour=0)
        series=[]
        while cursor.timestamp()<last:
            key=cursor.strftime('%Y-%m-%dT%H:00:00' if hourly else '%Y-%m-%d')
            series.append(by_bucket.get(key,{'bucket':key,**{k:0 for k in summary}}))
            cursor+=timedelta(hours=1) if hourly else timedelta(days=1)
        features=self.rows('SELECT feature,'+aggregate+' FROM spans WHERE '+where+' GROUP BY feature ORDER BY total_tokens DESC,requests DESC LIMIT 30',args)
        users=self.rows('SELECT username,'+aggregate+' FROM spans WHERE '+where+' GROUP BY username ORDER BY total_tokens DESC,requests DESC LIMIT 100',args)
        pages=self.rows("SELECT username,page,count(*) visits,min(started) first_visit,max(started) last_visit FROM spans WHERE "+where+" AND kind='screen.enter' GROUP BY username,page ORDER BY visits DESC LIMIT 50",args)
        options={'users':[r['username'] for r in self.rows("SELECT username FROM users UNION SELECT DISTINCT username FROM spans ORDER BY username")],
                 'features':[r['feature'] for r in self.rows('SELECT DISTINCT feature FROM spans WHERE feature IS NOT NULL ORDER BY feature')],
                 'models':[r['model'] for r in self.rows("SELECT DISTINCT model FROM spans WHERE model IS NOT NULL AND model!='' ORDER BY model")]}
        return {'summary':summary,'series':series,'features':features,'users':users,'pages':pages,'options':options,
                'bucket':'hour' if hourly else 'day','first':first,'last':last,'timezone':'Asia/Seoul',
                'collection_started_at':float(self.one("SELECT value FROM operation_meta WHERE key='started_at'")['value'])}

    def spans(self,offset=0,limit=30,**filters):
        where,args,_,_=self.where(**filters)
        fields='id,trace_id,parent_id,username,kind,feature,stage,page,action,started,ended,duration_ms,status,http_status,method,path,code,message,model,job_id,input_tokens,output_tokens,thought_tokens,cached_tokens,total_tokens,usage_known'
        return {'items':self.rows('SELECT '+fields+' FROM spans WHERE '+where+' ORDER BY started DESC LIMIT ? OFFSET ?',[*args,limit,offset]),
                'total':self.one('SELECT count(*) n FROM spans WHERE '+where,args)['n']}
