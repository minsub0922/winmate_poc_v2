"""Account-owned editable layouts and their images, stored together in SQLite.

The admin deployment uses the existing account/operations database. A normal
deployment uses WINMATE_TEMPLATE_DB or the runtime account database instead.
"""
from __future__ import annotations

import base64
import binascii
from contextlib import contextmanager
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sqlite3
import time
import uuid
import xml.etree.ElementTree as ET

from fastapi import APIRouter, HTTPException, Query, Request, Response
from starlette.concurrency import run_in_threadpool

MAX_BODY = 64 * 1024 * 1024
MAX_HTML = 8 * 1024 * 1024
MAX_IMAGE = 16 * 1024 * 1024
FID = re.compile(r'L_MY_[A-Za-z0-9_-]{1,180}\Z')
IID = re.compile(r'[A-Za-z0-9_-]{1,200}\Z')
TOKEN = re.compile(r'wmimg:([\w-]+)')
MIMES = {'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'}


class LayoutCheck(HTMLParser):
    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'iframe', 'object', 'embed', 'base', 'link', 'meta'}:
            raise ValueError('실행 가능한 HTML은 템플릿에 저장할 수 없습니다.')
        for key, value in attrs:
            if key.startswith('on') or key in {'srcdoc'} or value and re.match(r'\s*(javascript|vbscript):', value, re.I):
                raise ValueError('실행 가능한 HTML은 템플릿에 저장할 수 없습니다.')

    handle_startendtag = handle_starttag


def image_bytes(value):
    if not isinstance(value, str):
        raise ValueError('이미지 형식이 올바르지 않습니다.')
    match = re.fullmatch(r'data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)', value)
    if not match or match[1] not in MIMES:
        raise ValueError('지원하지 않는 이미지 형식입니다.')
    try:
        data = base64.b64decode(match[2], validate=True)
    except (ValueError, binascii.Error):
        raise ValueError('이미지 데이터를 읽지 못했습니다.') from None
    if not data or len(data) > MAX_IMAGE:
        raise ValueError('이미지는 16MB 이하로 저장해 주세요.')
    mime = match[1]
    if mime == 'image/svg+xml':
        try:
            root = ET.fromstring(data)
        except ET.ParseError:
            raise ValueError('SVG 이미지를 읽지 못했습니다.') from None
        if root.tag.split('}')[-1] != 'svg':
            raise ValueError('SVG 이미지가 아닙니다.')
        for node in root.iter():
            if node.tag.split('}')[-1].lower() in {'script', 'foreignobject', 'iframe'}:
                raise ValueError('실행 가능한 SVG는 저장할 수 없습니다.')
            for key, val in node.attrib.items():
                key = key.split('}')[-1].lower()
                if key.startswith('on') or key == 'href' and not val.startswith(('#', 'data:image/')):
                    raise ValueError('외부 코드를 포함한 SVG는 저장할 수 없습니다.')
    elif not ((mime == 'image/png' and data.startswith(b'\x89PNG\r\n\x1a\n'))
              or (mime == 'image/jpeg' and data.startswith(b'\xff\xd8\xff'))
              or (mime == 'image/gif' and data.startswith((b'GIF87a', b'GIF89a')))
              or (mime == 'image/webp' and data[:4] == b'RIFF' and data[8:12] == b'WEBP')):
        raise ValueError('이미지 종류와 데이터가 일치하지 않습니다.')
    return mime, data


class TemplateStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Two workers may initialize a new shared database at the same time.
        # Switching journal mode can return SQLITE_BUSY before busy_timeout applies.
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
                CREATE TABLE IF NOT EXISTS my_template_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS my_templates(
                  owner TEXT NOT NULL,f TEXT NOT NULL,meta TEXT NOT NULL,html TEXT NOT NULL,
                  revision INTEGER NOT NULL,updated_at REAL NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,
                  PRIMARY KEY(owner,f));
                CREATE TABLE IF NOT EXISTS my_template_images(
                  owner TEXT NOT NULL,id TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL,hash TEXT NOT NULL,
                  PRIMARY KEY(owner,id));
            ''')
            db.execute("INSERT OR IGNORE INTO my_template_settings VALUES ('store_id',?)", (uuid.uuid4().hex,))
            self.id = db.execute("SELECT value FROM my_template_settings WHERE key='store_id'").fetchone()[0]

    @contextmanager
    def db(self, write=False):
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

    def list(self, owner, after='', limit=100):
        with self.db() as db:
            rows = db.execute('SELECT f,meta,revision,deleted FROM my_templates WHERE owner=? AND f>? ORDER BY f LIMIT ?',
                              (owner, after, limit + 1)).fetchall()
        items = [dict(row, meta=json.loads(row['meta']), deleted=bool(row['deleted'])) for row in rows[:limit]]
        return {'owner': owner, 'store_id': self.id, 'items': items, 'next': items[-1]['f'] if len(rows) > limit else None}

    def get(self, owner, f):
        with self.db() as db:
            row = db.execute('SELECT f,meta,html,revision FROM my_templates WHERE owner=? AND f=? AND deleted=0', (owner, f)).fetchone()
        if not row:
            raise HTTPException(404, 'My 템플릿을 찾지 못했습니다.')
        return dict(row, meta=json.loads(row['meta']), imgs=sorted(set(TOKEN.findall(row['html']))))

    def image(self, owner, identifier):
        with self.db() as db:
            row = db.execute('SELECT mime,data FROM my_template_images WHERE owner=? AND id=?', (owner, identifier)).fetchone()
        if not row:
            raise HTTPException(404, '템플릿 이미지를 찾지 못했습니다.')
        return row['mime'], row['data']

    def save(self, owner, body):
        rows = body.get('items')
        images = body.get('images', {})
        migrate = body.get('mode') == 'migrate'
        if not isinstance(rows, list) or not 1 <= len(rows) <= 2000 or not isinstance(images, dict) or len(images) > 5000:
            raise ValueError('템플릿 저장 형식이 올바르지 않습니다.')
        decoded = {}
        for identifier, value in images.items():
            if not IID.fullmatch(identifier):
                raise ValueError('이미지 ID가 올바르지 않습니다.')
            decoded[identifier] = image_bytes(value)
        prepared = []
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get('meta'), dict):
                raise ValueError('템플릿 정보가 필요합니다.')
            meta, html = row['meta'], row.get('html')
            f = meta.get('f', '')
            if not isinstance(f, str) or not FID.fullmatch(f) or not isinstance(meta.get('my'), dict):
                raise ValueError('My 템플릿 ID와 출처가 필요합니다.')
            if not isinstance(html, str) or not html.strip() or len(html.encode()) > MAX_HTML or 'blob:' in html:
                raise ValueError('템플릿 HTML 또는 이미지 주소를 확인해 주세요.')
            LayoutCheck().feed(html)
            revision = row.get('base_revision', 0)
            if type(revision) is not int or revision < 0:
                raise ValueError('템플릿 버전이 올바르지 않습니다.')
            prepared.append((f, meta, html, revision))
        if len({r[0] for r in prepared}) != len(prepared):
            raise ValueError('템플릿 ID가 중복됩니다.')
        with self.db(write=True) as db:
            # Existing server records (including deletions) always win a one-time browser import.
            accepted = []
            for f, meta, html, revision in prepared:
                old = db.execute('SELECT revision,deleted FROM my_templates WHERE owner=? AND f=?', (owner, f)).fetchone()
                if migrate and old:
                    continue
                if old and (old['deleted'] or old['revision'] != revision) or not old and revision:
                    raise HTTPException(409, '다른 화면에서 템플릿이 변경됐어요. 새로고침 후 다시 저장해 주세요.')
                for identifier in set(TOKEN.findall(html)):
                    if identifier not in decoded and not db.execute('SELECT 1 FROM my_template_images WHERE owner=? AND id=?', (owner, identifier)).fetchone():
                        raise ValueError('템플릿에 필요한 이미지가 누락됐습니다: ' + identifier)
                accepted.append((f, meta, html, (old['revision'] if old else 0) + 1))
            used = set(identifier for _, _, html, _ in accepted for identifier in TOKEN.findall(html))
            for identifier in used & decoded.keys():
                mime, data = decoded[identifier]
                digest = hashlib.sha256(data).hexdigest()
                old = db.execute('SELECT hash FROM my_template_images WHERE owner=? AND id=?', (owner, identifier)).fetchone()
                if old and old['hash'] != digest:
                    raise HTTPException(409, '이미지 ID가 다른 이미지와 충돌했습니다.')
                db.execute('INSERT OR IGNORE INTO my_template_images VALUES (?,?,?,?,?)', (owner, identifier, mime, data, digest))
            for f, meta, html, revision in accepted:
                db.execute('''INSERT INTO my_templates VALUES (?,?,?,?,?,?,0) ON CONFLICT(owner,f)
                              DO UPDATE SET meta=excluded.meta,html=excluded.html,revision=excluded.revision,updated_at=excluded.updated_at''',
                           (owner, f, json.dumps(meta, ensure_ascii=False), html, revision, time.time()))
        return {'stored': len(accepted), 'items': [{'f': f, 'revision': revision} for f, _, _, revision in accepted], 'store_id': self.id}

    def delete(self, owner, items):
        if not isinstance(items, list) or not 1 <= len(items) <= 2000:
            raise ValueError('삭제할 템플릿을 선택해 주세요.')
        with self.db(write=True) as db:
            for item in items:
                if not isinstance(item, dict) or not FID.fullmatch(str(item.get('f', ''))):
                    raise ValueError('템플릿 ID가 올바르지 않습니다.')
                old = db.execute('SELECT revision,deleted FROM my_templates WHERE owner=? AND f=?', (owner, item['f'])).fetchone()
                if not old:
                    raise HTTPException(404, 'My 템플릿을 찾지 못했습니다.')
                if old['revision'] != item.get('base_revision'):
                    raise HTTPException(409, '다른 화면에서 템플릿이 변경됐어요. 새로고침 후 다시 삭제해 주세요.')
                db.execute('UPDATE my_templates SET deleted=1,revision=revision+1,updated_at=? WHERE owner=? AND f=?', (time.time(), owner, item['f']))
        return {'ok': True}


def owner_for(request):
    auth = request.app.state.auth
    actor = auth.read_token(request.cookies.get(auth.config.cookie_name))
    if not actor:
        raise HTTPException(401, '로그인 후 My 템플릿을 이용해 주세요.')
    if request.headers.get('x-winmate-user', actor['u']) != actor['u']:
        raise HTTPException(409, '로그인 계정이 바뀌었습니다. 새로고침해 주세요.')
    return actor['u']


async def bounded_body(request):
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > MAX_BODY:
            raise HTTPException(413, '한 번에 64MB 이하로 저장해 주세요.')
    try:
        body = json.loads(data)
    except (ValueError, UnicodeError):
        raise HTTPException(422, 'JSON 형식이 올바르지 않습니다.') from None
    if not isinstance(body, dict):
        raise HTTPException(422, '템플릿 저장 형식이 올바르지 않습니다.')
    return body


def build_router():
    router = APIRouter(prefix='/api/my-templates')

    @router.get('')
    def listing(request: Request, response: Response, after: str = '', limit: int = Query(100, ge=1, le=100)):
        response.headers['Cache-Control'] = 'no-store'
        return request.app.state.my_templates.list(owner_for(request), after, limit)

    @router.get('/images/{identifier}')
    def image(identifier: str, request: Request):
        mime, data = request.app.state.my_templates.image(owner_for(request), identifier)
        return Response(data, media_type=mime, headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})

    @router.get('/{f}')
    def detail(f: str, request: Request, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        return request.app.state.my_templates.get(owner_for(request), f)

    @router.post('')
    async def save(request: Request):
        owner = owner_for(request)
        body = await bounded_body(request)
        try:
            return await run_in_threadpool(request.app.state.my_templates.save, owner, body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post('/delete')
    async def delete(request: Request):
        owner = owner_for(request)
        body = await bounded_body(request)
        try:
            return await run_in_threadpool(request.app.state.my_templates.delete, owner, body.get('items'))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    return router
