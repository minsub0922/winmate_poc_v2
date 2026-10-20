"""Customer feedback with the submitted working context, kept in the account DB."""
import hashlib
import json
import math
import re
import time
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, Response
from starlette.concurrency import run_in_threadpool

MAX_BODY = 768 * 1024
MAX_CONTEXT = 640 * 1024
SECRET = re.compile(r'(password|passwd|authorization|cookie|api[_-]?key|secret|access_token|refresh_token|sharetoken|share_token|session_token|^token$)', re.I)


def clean_context(value, depth=0):
    if depth > 40:
        return '[depth limit]'
    if isinstance(value, dict):
        return {str(key): '[redacted]' if SECRET.search(str(key)) else clean_context(item, depth + 1) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_context(item, depth + 1) for item in value]
    if isinstance(value, str):
        value = re.sub(r'AIza[\w-]{20,}', '[redacted]', value)
        value = re.sub(r'(?i)((?:api[_-]?key|password|authorization|access_token|refresh_token)\s*[=:]\s*)[^\s,;&]+', r'\1[redacted]', value)
        value = re.sub(r'(/s/)[A-Za-z0-9_-]{12,}', r'\1[shared]', value)
        return value
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('화면 상태에 잘못된 숫자가 있습니다.')
    if value is None or isinstance(value, (bool, int, float)):
        return value
    raise ValueError('화면 상태 형식이 올바르지 않습니다.')


class CustomerVoiceStore:
    def __init__(self, database):
        self.database = database
        with database.db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS customer_voice(
                  id TEXT PRIMARY KEY,owner TEXT NOT NULL,submission_id TEXT NOT NULL,
                  message TEXT NOT NULL,context TEXT NOT NULL,hash TEXT NOT NULL,
                  created_at REAL NOT NULL,status TEXT NOT NULL DEFAULT 'new',updated_at REAL NOT NULL,
                  work_type TEXT,work_id TEXT,stage TEXT,path TEXT,
                  UNIQUE(owner,submission_id));
                CREATE INDEX IF NOT EXISTS customer_voice_time ON customer_voice(created_at DESC);
                CREATE INDEX IF NOT EXISTS customer_voice_status ON customer_voice(status,created_at DESC);
            ''')

    def submit(self, owner, body):
        message, submission = body.get('message'), body.get('submission_id')
        if not isinstance(message, str) or not message.strip() or len(message) > 5000:
            raise ValueError('의견은 1~5,000자로 입력해 주세요.')
        if not isinstance(submission, str) or not re.fullmatch(r'[A-Za-z0-9_-]{12,100}', submission):
            raise ValueError('전송 ID가 올바르지 않습니다.')
        context = body.get('context')
        if not isinstance(context, dict) or not isinstance(context.get('current'), dict):
            raise ValueError('현재 작업 상태가 필요합니다.')
        context = clean_context(context)
        encoded = json.dumps(context, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        if len(encoded.encode()) > MAX_CONTEXT:
            raise ValueError('화면 상태가 너무 큽니다. 다시 열어 전송해 주세요.')
        message = clean_context(message.strip())
        digest = hashlib.sha256((message + encoded).encode()).hexdigest()
        current = context['current']
        work = current.get('work') if isinstance(current.get('work'), dict) else {}
        route = current.get('route') if isinstance(current.get('route'), dict) else {}
        stamp, identifier = time.time(), 'voice_' + uuid.uuid4().hex
        with self.database.db(write=True) as db:
            old = db.execute('SELECT id,hash FROM customer_voice WHERE owner=? AND submission_id=?', (owner, submission)).fetchone()
            if old:
                if old['hash'] != digest:
                    raise HTTPException(409, '같은 전송 ID의 내용이 달라졌습니다. 입력 내용을 다시 확인해 주세요.')
                return {'id': old['id'], 'stored': True, 'duplicate': True}
            text = lambda value: str(value or '')[:250]
            db.execute('''INSERT INTO customer_voice VALUES (?,?,?,?,?,?,?,'new',?,?,?,?,?)''',
                       (identifier, owner, submission, message, encoded, digest, stamp, stamp,
                        text(work.get('type') or route.get('name')), text(work.get('id') or route.get('id')),
                        text(work.get('stage')), text(current.get('path'))))
        return {'id': identifier, 'stored': True, 'duplicate': False}

    def list(self, status='', q='', offset=0, limit=20):
        conditions, args = [], []
        if status:
            conditions.append('status=?'); args.append(status)
        if q:
            conditions.append('(instr(message,?)>0 OR instr(owner,?)>0 OR instr(work_id,?)>0)'); args.extend([q, q, q])
        where = ' WHERE ' + ' AND '.join(conditions) if conditions else ''
        with self.database.db() as db:
            total = db.execute('SELECT count(*) FROM customer_voice' + where, args).fetchone()[0]
            unread = db.execute("SELECT count(*) FROM customer_voice WHERE status='new'").fetchone()[0]
            rows = db.execute('''SELECT id,owner,message,created_at,status,work_type,work_id,stage,path
                                 FROM customer_voice''' + where + ' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?', [*args, limit, offset]).fetchall()
        return {'items': [dict(row) for row in rows], 'total': total, 'unread': unread}

    def get(self, identifier):
        with self.database.db() as db:
            row = db.execute('SELECT * FROM customer_voice WHERE id=?', (identifier,)).fetchone()
        if not row:
            raise HTTPException(404, '고객 의견을 찾지 못했습니다.')
        result = dict(row)
        result['context'] = json.loads(result['context'])
        result.pop('hash'); result.pop('submission_id')
        return result

    def status(self, identifier, value):
        if value not in ('new', 'reviewing', 'closed'):
            raise ValueError('의견 처리 상태가 올바르지 않습니다.')
        with self.database.db(write=True) as db:
            if not db.execute('UPDATE customer_voice SET status=?,updated_at=? WHERE id=?', (value, time.time(), identifier)).rowcount:
                raise HTTPException(404, '고객 의견을 찾지 못했습니다.')
        return {'ok': True}


def actor_for(request, admin=False):
    auth = request.app.state.auth
    actor = auth.read_token(request.cookies.get(auth.config.cookie_name))
    if not actor:
        raise HTTPException(401, '로그인 후 의견을 보내 주세요.')
    if request.headers.get('x-winmate-user', actor['u']) != actor['u']:
        raise HTTPException(409, '로그인 계정이 바뀌었습니다. 새로고침해 주세요.')
    if admin and actor.get('role', 'admin' if actor['u'] == 'admin' else 'member') != 'admin':
        raise HTTPException(403, '관리자 계정만 고객 의견을 확인할 수 있습니다.')
    return actor['u']


async def body_for(request):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY:
            raise HTTPException(413, '의견과 작업 상태의 전송 크기를 초과했습니다.')
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeError):
        raise HTTPException(422, 'JSON 형식이 올바르지 않습니다.') from None
    if not isinstance(body, dict):
        raise HTTPException(422, '의견 형식이 올바르지 않습니다.')
    return body


def build_router():
    router = APIRouter()

    @router.post('/api/customer-voice')
    async def submit(request: Request, response: Response):
        owner = actor_for(request)
        body = await body_for(request)
        response.headers['Cache-Control'] = 'no-store'
        try:
            return await run_in_threadpool(request.app.state.customer_voice.submit, owner, body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.get('/api/admin/customer-voice')
    def listing(request: Request, response: Response, status: str = '', q: str = Query('', max_length=200), offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
        actor_for(request, admin=True)
        response.headers['Cache-Control'] = 'no-store'
        return request.app.state.customer_voice.list(status, q, offset, limit)

    @router.get('/api/admin/customer-voice/{identifier}')
    def detail(identifier: str, request: Request, response: Response):
        actor_for(request, admin=True)
        response.headers['Cache-Control'] = 'no-store'
        return request.app.state.customer_voice.get(identifier)

    @router.patch('/api/admin/customer-voice/{identifier}')
    async def status(identifier: str, request: Request):
        actor_for(request, admin=True)
        body = await body_for(request)
        try:
            return await run_in_threadpool(request.app.state.customer_voice.status, identifier, body.get('status'))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    return router
