"""Persistent, capability-link Storyboards with owner-controlled access and conflict checks."""
from __future__ import annotations

import copy
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse

from .auth import create_private

ROOT = Path(__file__).resolve().parents[2]
ACTOR_COOKIE = 'winmate_collaborator'
ACCESS_COOKIE = 'winmate_shared_access'
TOKEN = re.compile(r'^[A-Za-z0-9_-]{32,64}$')
MAX_BODY = 40 * 1024 * 1024
MISSING = object()
LOCAL_FIELDS = {'_share', 'share', 'id', 'endPath', 'sample'}


def validate_document(value):
    if not isinstance(value, dict) or not isinstance(value.get('title'), str):
        raise HTTPException(422, '올바른 Storyboard가 아닙니다.')
    if not isinstance(value.get('req'), dict) or not isinstance(value.get('ctx'), dict) or not isinstance(value.get('parts'), list):
        raise HTTPException(422, '요구사항 · 제품 선택 · 파트가 필요합니다.')
    req = value['req']
    if not isinstance(req.get('free'), list) or not isinstance(req.get('files'), list) or not isinstance(req.get('form'), dict) or not isinstance(req['form'].get('keymen'), list):
        raise HTTPException(422, '고객 요구사항 형식이 올바르지 않습니다.')
    if any(not isinstance(value['ctx'].get(k), list) for k in ('products', 'solutions', 'cases')):
        raise HTTPException(422, '제품 선택 형식이 올바르지 않습니다.')
    for part in value['parts']:
        if not isinstance(part, dict) or not isinstance(part.get('id'), str) or not isinstance(part.get('layouts'), list):
            raise HTTPException(422, '파트 형식이 올바르지 않습니다.')
        if any(not isinstance(x, dict) or not isinstance(x.get('uid'), str) or not isinstance(x.get('f'), str) for x in part['layouts']):
            raise HTTPException(422, '레이아웃 형식이 올바르지 않습니다.')
    return {k: v for k, v in value.items() if k not in LOCAL_FIELDS}


def encode_document(document):
    encoded = json.dumps(document, ensure_ascii=False, allow_nan=False)
    if len(encoded.encode('utf-8')) > MAX_BODY:
        raise HTTPException(413, '공유할 내용이 너무 큽니다. 이미지 크기를 줄여 주세요.')
    return encoded


def resolve_path(document, path):
    if not isinstance(path, list) or not path or len(path) > 40 or not isinstance(path[0], str) or path[0] in LOCAL_FIELDS:
        raise HTTPException(422, '변경 경로가 올바르지 않습니다.')
    node = document
    for segment in path[:-1]:
        if isinstance(node, list) and isinstance(segment, str) and segment.startswith('@'):
            node = next((x for x in node if isinstance(x, dict) and str(x.get('uid', x.get('id'))) == segment[1:]), MISSING)
        elif isinstance(node, dict) and isinstance(segment, str) and segment not in {'__proto__', 'prototype', 'constructor'}:
            node = node.get(segment, MISSING)
        else:
            raise HTTPException(409, '변경하려던 항목이 다른 참여자에 의해 바뀌었습니다.')
        if node is MISSING:
            raise HTTPException(409, '변경하려던 항목이 다른 참여자에 의해 삭제되었습니다.')
    key = path[-1]
    if not isinstance(node, dict) or not isinstance(key, str) or key in {'__proto__', 'prototype', 'constructor'}:
        raise HTTPException(422, '변경 경로가 올바르지 않습니다.')
    return node, key


class StoryboardStore:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        secret_path = directory / 'collaboration.secret'
        create_private(secret_path, secrets.token_bytes(32))
        self.secret = secret_path.read_bytes()
        self.database = directory / 'storyboards.sqlite'
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS storyboards (
                  token TEXT PRIMARY KEY, owner TEXT NOT NULL, source TEXT NOT NULL,
                  permission TEXT NOT NULL DEFAULT 'view', revision INTEGER NOT NULL DEFAULT 1,
                  content TEXT NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(owner, source));
                CREATE TABLE IF NOT EXISTS storyboard_editors (
                  token TEXT NOT NULL, actor TEXT NOT NULL, PRIMARY KEY(token, actor));
            ''')
        os.chmod(self.database, 0o600)

    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def exists(self, token):
        if not isinstance(token, str) or not TOKEN.fullmatch(token):
            return False
        with self.connect() as db:
            return db.execute('SELECT 1 FROM storyboards WHERE token=?', (token,)).fetchone() is not None

    def guest(self, cookie):
        if cookie and re.fullmatch(r'[A-Za-z0-9_-]{32}\.[0-9a-f]{64}', cookie):
            value, signature = cookie.split('.')
            expected = hmac.new(self.secret, value.encode(), hashlib.sha256).hexdigest()
            if hmac.compare_digest(signature, expected):
                return 'guest:' + value, cookie
        value = secrets.token_urlsafe(24)
        return 'guest:' + value, value + '.' + hmac.new(self.secret, value.encode(), hashlib.sha256).hexdigest()

    def snapshot(self, row, actor, db):
        return {'id': row['token'], 'endPath': '/s/' + row['token'],
                'token': row['token'], 'permission': row['permission'], 'revision': row['revision'],
                'sourceId': row['source'] if row['owner'] == actor else None,
                'updatedAt': row['updated_at'], 'isOwner': row['owner'] == actor,
                'canEdit': row['owner'] == actor or row['permission'] == 'edit',
                'hasEdited': bool(db.execute('SELECT 1 FROM storyboard_editors WHERE token=? AND actor=?', (row['token'], actor)).fetchone()),
                'document': json.loads(row['content'])}

    def get(self, token, actor):
        with self.connect() as db:
            row = db.execute('SELECT * FROM storyboards WHERE token=?', (token,)).fetchone()
            if row is None:
                raise HTTPException(404, '공유 Storyboard를 찾을 수 없습니다.')
            return self.snapshot(row, actor, db)

    def get_by_source(self, source, actor):
        with self.connect() as db:
            row = db.execute('SELECT * FROM storyboards WHERE owner=? AND source=?', (actor, source)).fetchone()
            if row is None:
                raise HTTPException(404, '이 계정에서 제안서 히스토리를 찾을 수 없습니다.')
            return self.snapshot(row, actor, db)

    def ensure(self, source, document, actor):
        document = validate_document(document)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM storyboards WHERE owner=? AND source=?', (actor, source)).fetchone()
            if row is None:
                token = secrets.token_urlsafe(32)
                db.execute('INSERT INTO storyboards(token, owner, source, content, updated_at) VALUES(?,?,?,?,?)',
                           (token, actor, source, encode_document(document), int(time.time() * 1000)))
                row = db.execute('SELECT * FROM storyboards WHERE token=?', (token,)).fetchone()
            return self.snapshot(row, actor, db)

    def permission(self, token, actor, permission):
        if not isinstance(permission, str) or permission not in {'view', 'edit'}:
            raise HTTPException(422, '읽기전용 또는 편집가능을 선택하세요.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM storyboards WHERE token=?', (token,)).fetchone()
            if row is None:
                raise HTTPException(404, '공유 Storyboard를 찾을 수 없습니다.')
            if row['owner'] != actor:
                raise HTTPException(403, '공유 권한은 소유자만 변경할 수 있습니다.')
            if row['permission'] != permission:
                db.execute('UPDATE storyboards SET permission=?, revision=revision+1 WHERE token=?', (permission, token))
            return self.snapshot(db.execute('SELECT * FROM storyboards WHERE token=?', (token,)).fetchone(), actor, db)

    def patch(self, token, actor, operations):
        if not isinstance(operations, list) or len(operations) > 10000:
            raise HTTPException(422, '변경 내역이 올바르지 않습니다.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM storyboards WHERE token=?', (token,)).fetchone()
            if row is None:
                raise HTTPException(404, '공유 Storyboard를 찾을 수 없습니다.')
            if row['owner'] != actor and row['permission'] != 'edit':
                raise HTTPException(403, '이 Storyboard는 읽기전용입니다.')
            document = json.loads(row['content'])
            changed = False
            for operation in operations:
                if not isinstance(operation, dict) or not isinstance(operation.get('exists'), bool):
                    raise HTTPException(422, '변경 내역이 올바르지 않습니다.')
                parent, key = resolve_path(document, operation.get('path'))
                before = operation.get('before') if operation['exists'] else MISSING
                current = parent.get(key, MISSING)
                after = MISSING if operation.get('delete') else operation.get('value')
                if current == after:
                    continue
                if current != before:
                    raise HTTPException(409, {'code': 'edit_conflict', 'message': '같은 항목을 다른 참여자가 수정했습니다. 내 변경은 보관되어 있습니다.', 'latest': self.snapshot(row, actor, db)})
                if after is MISSING:
                    parent.pop(key, None)
                else:
                    parent[key] = copy.deepcopy(after)
                changed = True
            document = validate_document(document)
            if changed:
                at = int(time.time() * 1000)
                document['updatedAt'] = at
                db.execute('UPDATE storyboards SET content=?, revision=revision+1, updated_at=? WHERE token=?',
                           (encode_document(document), at, token))
                db.execute('INSERT OR IGNORE INTO storyboard_editors(token, actor) VALUES(?,?)', (token, actor))
            return self.snapshot(db.execute('SELECT * FROM storyboards WHERE token=?', (token,)).fetchone(), actor, db)


async def body_json(request):
    if request.headers.get('content-type', '').split(';')[0] != 'application/json':
        raise HTTPException(415, 'JSON 형식으로 보내세요.')
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY:
            raise HTTPException(413, '공유할 내용이 너무 큽니다. 이미지 크기를 줄여 주세요.')
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, 'JSON 본문이 올바르지 않습니다.') from None
    if not isinstance(value, dict):
        raise HTTPException(422, '요청 형식이 올바르지 않습니다.')
    return value


def actor_for(request, response):
    auth = request.app.state.auth
    identity = auth.read_token(request.cookies.get(auth.config.cookie_name)) if auth.config.enabled else None
    guest, cookie = request.app.state.storyboards.guest(request.cookies.get(ACTOR_COOKIE))
    response.set_cookie(ACTOR_COOKIE, cookie, max_age=365 * 86400, path='/', httponly=True, samesite='lax', secure=request.url.scheme == 'https')
    response.headers['Cache-Control'] = 'no-store'
    return 'user:' + identity['u'] if identity else guest


def share_cookie(request, response, token):
    response.set_cookie(ACCESS_COOKIE, token, max_age=30 * 86400, path='/', httponly=True, samesite='lax', secure=request.url.scheme == 'https')
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'


def build_router():
    router = APIRouter()

    @router.get('/api/history/{source_id:path}')
    def history(source_id: str, request: Request, response: Response):
        return request.app.state.storyboards.get_by_source(source_id, actor_for(request, response))

    @router.get('/storyboard/{source_id:path}')
    def history_page(source_id: str):
        return FileResponse(ROOT / 'app/web/dist/index.html', headers={'Cache-Control': 'no-store'})

    @router.post('/api/storyboards')
    async def create(request: Request, response: Response):
        auth = request.app.state.auth
        if auth.config.enabled and not auth.read_token(request.cookies.get(auth.config.cookie_name)) and not request.app.state.storyboards.exists(request.cookies.get(ACCESS_COOKIE)):
            raise HTTPException(401, '로그인하거나 공유 링크로 접속하세요.')
        data = await body_json(request)
        source = data.get('source')
        if not isinstance(source, str) or not source or len(source) > 200:
            raise HTTPException(422, '제안서 ID가 필요합니다.')
        return request.app.state.storyboards.ensure(source, data.get('document'), actor_for(request, response))

    @router.get('/api/storyboards/{token}')
    def get(token: str, request: Request, response: Response, version: str | None = None):
        result = request.app.state.storyboards.get(token, actor_for(request, response))
        share_cookie(request, response, token)
        current = f"{result['revision']}-{result['permission']}-{int(result['isOwner'])}-{int(result['hasEdited'])}"
        if version == current:
            response.status_code = 204
            return response
        return result

    @router.patch('/api/storyboards/{token}')
    async def patch(token: str, request: Request, response: Response):
        data = await body_json(request)
        return request.app.state.storyboards.patch(token, actor_for(request, response), data.get('operations'))

    @router.patch('/api/storyboards/{token}/permission')
    async def permission(token: str, request: Request, response: Response):
        data = await body_json(request)
        return request.app.state.storyboards.permission(token, actor_for(request, response), data.get('permission'))

    @router.get('/s/{token}')
    def page(token: str, request: Request):
        if not request.app.state.storyboards.exists(token):
            raise HTTPException(404, '공유 Storyboard를 찾을 수 없습니다.')
        response = FileResponse(ROOT / 'app/web/dist/index.html', headers={'Cache-Control': 'no-store'})
        share_cookie(request, response, token)
        actor_for(request, response)
        return response

    return router


def allows_shared_request(scope, connection):
    """Only the sharing API is public; guest asset access needs an existing capability."""
    path = scope['path']
    if re.fullmatch(r'/s/[A-Za-z0-9_-]{32,64}', path) or re.fullmatch(r'/api/storyboards(?:/[A-Za-z0-9_-]{32,64}(?:/(?:permission|bootstrap))?)?', path):
        return True
    if scope['method'] not in {'GET', 'HEAD'}:
        return False
    app = scope.get('app')
    store = getattr(getattr(app, 'state', None), 'storyboards', None)
    if store is None or not store.exists(connection.cookies.get(ACCESS_COOKIE)):
        return False
    return path in {'/', '/api/bootstrap', '/api/catalog/metrics'} or path.startswith(('/assets/', '/img/', '/lib/', '/api/products', '/api/product-packs/'))
