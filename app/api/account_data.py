"""Account-owned work records and binary assets — the server copy of what used to live only in a browser.

Collections (``COLLECTIONS``) hold JSON records keyed by the record's own ID: proposals, reviews, simulations, customer
personas, favourites, history preferences, the 건물 조감도 buildings, parsed review documents and full attachment text.
Blobs hold uploaded images and building thumbnails. The browser keeps localStorage/IndexedDB only as a cache for
instant rendering (``app/web/src/repositories/account-sync.js``).

Consistency rules
* Every record has a server ``revision``. A write names the ``base_revision`` it was based on; a mismatch is a
  per-record conflict returned with the current server copy (other records in the batch still apply).
* ``mode: migrate`` is the one-time import of browser-only records: an existing server record or deletion always wins,
  so an old browser can never overwrite a newer edit or resurrect a deletion made elsewhere.
* Deletions are tombstones (revision kept), so other browsers learn about them.
* Blobs are immutable: the same ID with different bytes is rejected.
"""
from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import time
import uuid
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from starlette.concurrency import run_in_threadpool

MB = 1024 * 1024
# name → per-record byte limit. Keys are validated so only these collections exist.
COLLECTIONS: Dict[str, int] = {
    'proposals': 32 * MB, 'reviews': 16 * MB, 'simulations': 8 * MB, 'personas': 1 * MB, 'favorites': 4 * MB,
    'preferences': 1 * MB, 'buildings': 4 * MB, 'review-docs': 48 * MB, 'attachment-sources': 16 * MB,
}
MAX_BODY = 96 * MB
MAX_BLOB = 24 * MB
MAX_BATCH = 500
FETCH_BUDGET = 24 * MB
RID = re.compile(r'[A-Za-z0-9_.:@-]{1,200}\Z')
BID = re.compile(r'[A-Za-z0-9_.:-]{1,200}\Z')
BLOB_TYPES = {'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/octet-stream'}


def _now() -> float:
    return time.time()


class AccountDataStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(100):
            try:
                with self.db() as db:
                    db.execute('PRAGMA journal_mode=WAL')
                break
            except sqlite3.OperationalError as exc:
                if 'locked' not in str(exc) or attempt == 99:
                    raise
                time.sleep(.05)
        with self.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS account_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS account_records(
                  owner TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT,
                  revision INTEGER NOT NULL, updated_at REAL NOT NULL, client_updated_at REAL NOT NULL DEFAULT 0,
                  deleted INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY(owner, collection, id));
                CREATE INDEX IF NOT EXISTS account_records_changes ON account_records(owner, collection, id);
                CREATE TABLE IF NOT EXISTS account_blobs(
                  owner TEXT NOT NULL, id TEXT NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL, hash TEXT NOT NULL,
                  size INTEGER NOT NULL, created_at REAL NOT NULL, PRIMARY KEY(owner, id));
            ''')
            db.execute("INSERT OR IGNORE INTO account_settings VALUES ('store_id', ?)", (uuid.uuid4().hex,))
            self.id = db.execute("SELECT value FROM account_settings WHERE key='store_id'").fetchone()[0]

    @contextmanager
    def db(self, write: bool = False):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            if write:
                db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def collection(name: str) -> str:
        if name not in COLLECTIONS:
            raise HTTPException(404, '지원하지 않는 저장 항목입니다.')
        return name

    # ---------------------------------------------------------------- records
    def manifest(self, owner: str, collection: str, after: str = '', limit: int = 1000) -> dict:
        self.collection(collection)
        with self.db() as db:
            rows = db.execute('SELECT id, revision, client_updated_at, deleted, size FROM account_records '
                              'WHERE owner=? AND collection=? AND id>? ORDER BY id LIMIT ?', (owner, collection, after, limit + 1)).fetchall()
        items = [{'id': r['id'], 'revision': r['revision'], 'updated_at': r['client_updated_at'], 'deleted': bool(r['deleted']), 'size': r['size']}
                 for r in rows[:limit]]
        return {'owner': owner, 'store_id': self.id, 'collection': collection, 'items': items,
                'next': items[-1]['id'] if len(rows) > limit else None}

    def fetch(self, owner: str, collection: str, ids: Iterable[str]) -> dict:
        self.collection(collection)
        ids = list(ids)
        if len(ids) > MAX_BATCH or not all(isinstance(i, str) and RID.fullmatch(i) for i in ids):
            raise ValueError('요청한 기록 ID가 올바르지 않습니다.')
        items, budget, rest = [], FETCH_BUDGET, []
        with self.db() as db:
            for index, identifier in enumerate(ids):
                row = db.execute('SELECT id, data, revision, client_updated_at, deleted, size FROM account_records WHERE owner=? AND collection=? AND id=?',
                                 (owner, collection, identifier)).fetchone()
                if not row:
                    items.append({'id': identifier, 'missing': True})
                    continue
                if items and row['size'] > budget:
                    rest = ids[index:]
                    break
                budget -= row['size']
                items.append({'id': row['id'], 'revision': row['revision'], 'updated_at': row['client_updated_at'], 'deleted': bool(row['deleted']),
                              'data': None if row['deleted'] else json.loads(row['data'])})
        return {'items': items, 'remaining': rest}

    def write(self, owner: str, collection: str, body: dict) -> dict:
        self.collection(collection)
        limit = COLLECTIONS[collection]
        upserts, deletes = body.get('items', []), body.get('deletes', [])
        migrate = body.get('mode') == 'migrate'
        if not isinstance(upserts, list) or not isinstance(deletes, list) or len(upserts) + len(deletes) > MAX_BATCH or not upserts + deletes:
            raise ValueError('저장 형식이 올바르지 않습니다.')
        prepared = []
        for item in upserts:
            if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not RID.fullmatch(item['id']) or 'data' not in item:
                raise ValueError('기록 ID와 내용이 필요합니다.')
            base = item.get('base_revision', 0)
            if type(base) is not int or base < 0:
                raise ValueError('기록 버전이 올바르지 않습니다.')
            try:
                text = json.dumps(item['data'], ensure_ascii=False, allow_nan=False, separators=(',', ':'))
            except (TypeError, ValueError):
                raise ValueError('기록 내용을 저장할 수 없는 형식입니다.') from None
            if item['data'] is None or len(text.encode()) > limit:
                raise ValueError(f'기록 하나는 {limit // MB}MB 이하로 저장해 주세요.')
            updated = item.get('updated_at', 0)
            prepared.append(('put', item['id'], base, text, float(updated) if isinstance(updated, (int, float)) and not isinstance(updated, bool) else 0.0))
        for item in deletes:
            if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not RID.fullmatch(item['id']):
                raise ValueError('삭제할 기록 ID가 올바르지 않습니다.')
            base = item.get('base_revision', 0)
            if type(base) is not int or base < 0:
                raise ValueError('기록 버전이 올바르지 않습니다.')
            prepared.append(('delete', item['id'], base, None, 0.0))
        if len({p[1] for p in prepared}) != len(prepared):
            raise ValueError('같은 기록이 한 요청에 두 번 있습니다.')
        applied, conflicts, skipped = [], [], []
        now = _now()
        with self.db(write=True) as db:
            for action, identifier, base, text, updated in prepared:
                old = db.execute('SELECT revision, deleted, data, client_updated_at FROM account_records WHERE owner=? AND collection=? AND id=?',
                                 (owner, collection, identifier)).fetchone()
                if migrate and old:
                    skipped.append({'id': identifier, 'revision': old['revision'], 'deleted': bool(old['deleted'])})
                    continue
                current = old['revision'] if old else 0
                if action == 'delete':
                    if not old or old['deleted']:
                        applied.append({'id': identifier, 'revision': current, 'deleted': True})
                        continue
                    if base != current:
                        conflicts.append(self._conflict(identifier, old))
                        continue
                    db.execute('UPDATE account_records SET deleted=1, data=NULL, size=0, revision=revision+1, updated_at=? WHERE owner=? AND collection=? AND id=?',
                               (now, owner, collection, identifier))
                    applied.append({'id': identifier, 'revision': current + 1, 'deleted': True})
                    continue
                if base != current:
                    conflicts.append(self._conflict(identifier, old))
                    continue
                db.execute('''INSERT INTO account_records(owner, collection, id, data, revision, updated_at, client_updated_at, deleted, size)
                              VALUES (?,?,?,?,?,?,?,0,?) ON CONFLICT(owner, collection, id) DO UPDATE SET data=excluded.data,
                              revision=excluded.revision, updated_at=excluded.updated_at, client_updated_at=excluded.client_updated_at,
                              deleted=0, size=excluded.size''',
                           (owner, collection, identifier, text, current + 1, now, updated, len(text.encode())))
                applied.append({'id': identifier, 'revision': current + 1, 'deleted': False})
        return {'store_id': self.id, 'applied': applied, 'conflicts': conflicts, 'skipped': skipped}

    @staticmethod
    def _conflict(identifier: str, old: Optional[sqlite3.Row]) -> dict:
        if not old:
            return {'id': identifier, 'revision': 0, 'missing': True}
        return {'id': identifier, 'revision': old['revision'], 'deleted': bool(old['deleted']), 'updated_at': old['client_updated_at'],
                'data': None if old['deleted'] else json.loads(old['data'])}

    def usage(self, owner: str) -> dict:
        with self.db() as db:
            records = db.execute('SELECT collection, COUNT(*) n, SUM(size) bytes FROM account_records WHERE owner=? AND deleted=0 GROUP BY collection', (owner,)).fetchall()
            blobs = db.execute('SELECT COUNT(*) n, COALESCE(SUM(size),0) bytes FROM account_blobs WHERE owner=?', (owner,)).fetchone()
        return {'collections': {r['collection']: {'records': r['n'], 'bytes': r['bytes'] or 0} for r in records},
                'blobs': {'count': blobs['n'], 'bytes': blobs['bytes']}}

    # ---------------------------------------------------------------- blobs
    def put_blob(self, owner: str, identifier: str, mime: str, data: bytes) -> dict:
        if not BID.fullmatch(identifier):
            raise ValueError('파일 ID가 올바르지 않습니다.')
        mime = (mime or 'application/octet-stream').split(';')[0].strip().lower()
        if mime not in BLOB_TYPES:
            raise ValueError('지원하지 않는 파일 형식입니다.')
        if not data or len(data) > MAX_BLOB:
            raise ValueError(f'파일은 {MAX_BLOB // MB}MB 이하로 저장해 주세요.')
        if mime == 'image/svg+xml':
            from .my_templates import image_bytes
            import base64
            image_bytes('data:image/svg+xml;base64,' + base64.b64encode(data).decode())  # rejects scriptable SVG
        digest = hashlib.sha256(data).hexdigest()
        with self.db(write=True) as db:
            old = db.execute('SELECT hash FROM account_blobs WHERE owner=? AND id=?', (owner, identifier)).fetchone()
            if old:
                if old['hash'] != digest:
                    raise HTTPException(409, '같은 ID에 다른 파일이 이미 저장되어 있습니다.')
                return {'id': identifier, 'stored': False, 'hash': digest}
            db.execute('INSERT INTO account_blobs VALUES (?,?,?,?,?,?,?)', (owner, identifier, mime, data, digest, len(data), _now()))
        return {'id': identifier, 'stored': True, 'hash': digest}

    def blob(self, owner: str, identifier: str):
        with self.db() as db:
            row = db.execute('SELECT mime, data, hash FROM account_blobs WHERE owner=? AND id=?', (owner, identifier)).fetchone()
        if not row:
            raise HTTPException(404, '파일을 찾지 못했습니다.')
        return row['mime'], row['data'], row['hash']

    def missing_blobs(self, owner: str, ids: List[str]) -> List[str]:
        if not isinstance(ids, list) or len(ids) > 5000 or not all(isinstance(i, str) and BID.fullmatch(i) for i in ids):
            raise ValueError('파일 ID 목록이 올바르지 않습니다.')
        with self.db() as db:
            have = set()
            for start in range(0, len(ids), 500):
                chunk = ids[start:start + 500]
                have.update(r[0] for r in db.execute('SELECT id FROM account_blobs WHERE owner=? AND id IN (%s)' % ','.join('?' * len(chunk)), [owner, *chunk]))
        return [i for i in ids if i not in have]

    def delete_blobs(self, owner: str, ids: List[str]) -> int:
        if not isinstance(ids, list) or len(ids) > 5000 or not all(isinstance(i, str) and BID.fullmatch(i) for i in ids):
            raise ValueError('파일 ID 목록이 올바르지 않습니다.')
        with self.db(write=True) as db:
            return sum(db.execute('DELETE FROM account_blobs WHERE owner=? AND id=?', (owner, i)).rowcount for i in ids)


def owner_for(request: Request) -> str:
    auth = request.app.state.auth
    if not auth.config.enabled:
        return 'local-dev'
    actor = auth.read_token(request.cookies.get(auth.config.cookie_name))
    if not actor:
        raise HTTPException(401, '로그인 후 이용해 주세요.')
    if request.headers.get('x-winmate-user', actor['u']) != actor['u']:
        raise HTTPException(409, {'code': 'account_changed', 'message': '로그인 계정이 바뀌었습니다. 새로고침해 주세요.'})
    return actor['u']


async def _body(request: Request, limit: int = MAX_BODY) -> bytes:
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise HTTPException(413, f'한 번에 {limit // MB}MB 이하로 저장해 주세요.')
    return bytes(data)


async def _json(request: Request) -> dict:
    try:
        body = json.loads(await _body(request))
    except (ValueError, UnicodeError):
        raise HTTPException(422, 'JSON 형식이 올바르지 않습니다.') from None
    if not isinstance(body, dict):
        raise HTTPException(422, '저장 형식이 올바르지 않습니다.')
    return body


def build_router() -> APIRouter:
    router = APIRouter(prefix='/api/account-data', tags=['account-data'])

    def store(request: Request) -> AccountDataStore:
        return request.app.state.account_data

    @router.get('/usage')
    def usage(request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        return store(request).usage(owner_for(request))

    @router.get('/blobs/{identifier}')
    def get_blob(identifier: str, request: Request):
        mime, data, digest = store(request).blob(owner_for(request), identifier)
        etag = f'"{digest[:32]}"'
        headers = {'Cache-Control': 'private, max-age=31536000, immutable', 'ETag': etag, 'X-Content-Type-Options': 'nosniff'}
        if mime == 'image/svg+xml':
            headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'"
        if request.headers.get('if-none-match') == etag:
            return Response(status_code=304, headers=headers)
        return Response(data, media_type=mime, headers=headers)

    @router.put('/blobs/{identifier}')
    async def put_blob(identifier: str, request: Request):
        owner = owner_for(request)
        data = await _body(request, MAX_BLOB + 1)
        try:
            return await run_in_threadpool(store(request).put_blob, owner, identifier, request.headers.get('content-type', ''), data)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post('/blobs/missing')
    async def missing(request: Request):
        owner = owner_for(request)
        body = await _json(request)
        try:
            return {'missing': await run_in_threadpool(store(request).missing_blobs, owner, body.get('ids'))}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post('/blobs/delete')
    async def delete_blobs(request: Request):
        owner = owner_for(request)
        body = await _json(request)
        try:
            return {'deleted': await run_in_threadpool(store(request).delete_blobs, owner, body.get('ids'))}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get('/{collection}')
    def manifest(collection: str, request: Request, response: Response, after: str = '', limit: int = Query(1000, ge=1, le=5000)):
        response.headers['Cache-Control'] = 'no-store'
        return store(request).manifest(owner_for(request), collection, after, limit)

    @router.post('/{collection}/fetch')
    async def fetch(collection: str, request: Request):
        owner = owner_for(request)
        body = await _json(request)
        try:
            return await run_in_threadpool(store(request).fetch, owner, collection, body.get('ids') or [])
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post('/{collection}')
    async def write(collection: str, request: Request):
        owner = owner_for(request)
        body = await _json(request)
        try:
            return await run_in_threadpool(store(request).write, owner, collection, body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    return router
