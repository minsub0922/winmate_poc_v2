from __future__ import annotations
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
import gzip
import json
import mimetypes
from pathlib import Path
import re
import sqlite3
from urllib.parse import quote, unquote
import uuid

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.applications import Starlette
from starlette.concurrency import run_in_threadpool
from starlette.routing import Mount, Route

from app.api.main import app as winmate
from app.api.auth import csrf_ok
from app.api.poc.settings import get_settings

from .config import HOME, MAX_UPLOAD, ROOT, RUNTIME, ADMIN_WEB
from .engine import EngineError, checked_url
from .inventory import inspect_database
from .service import Service
from .store import digest, dump, now
from .operations import Operations
from .users import Accounts
from .observability import RequestTracing, activity_router, admin_router
from .resources import resources_for, resource_bytes, layout_preview, https as resource_https
from app.api import telemetry

service = Service(RUNTIME)
store = service.store
operations = Operations(RUNTIME)
api = FastAPI(title='Winmate Admin · Local', docs_url=None, redoc_url=None, openapi_url=None)


class AdminGuard:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        from starlette.requests import HTTPConnection
        conn = HTTPConnection(scope)
        auth = winmate.state.auth
        identity = auth.read_token(conn.cookies.get(auth.config.cookie_name))
        if not csrf_ok(scope['method'], conn.headers, scope.get('scheme', 'http')):
            return await JSONResponse({'detail': '요청 출처가 일치하지 않습니다.'}, 403)(scope, receive, send)
        if not identity:
            is_api = '/api/' in scope['path']
            response = JSONResponse({'detail': '관리자 로그인이 필요합니다.', 'code': 'auth_required'}, 401) if is_api else RedirectResponse('/login.html?next=' + quote('/admin/', safe=''), 303)
            return await response(scope, receive, send)
        if identity.get('role', 'admin' if identity.get('u')=='admin' else 'member') != 'admin':
            return await JSONResponse({'detail': '관리자 계정만 접근할 수 있습니다.'}, 403)(scope, receive, send)
        async def secured(message):
            if message['type'] == 'http.response.start':
                message.setdefault('headers', []).extend([(b'cache-control', b'no-store'), (b'x-content-type-options', b'nosniff'),
                    (b'x-frame-options', b'DENY'), (b'referrer-policy', b'same-origin')])
            await send(message)
        return await self.app(scope, receive, secured)


api.add_middleware(AdminGuard)
api.include_router(admin_router(operations,winmate.state.auth))
winmate.include_router(activity_router(operations))


@api.exception_handler(EngineError)
async def engine_error(request, exc):
    return JSONResponse({'detail': str(exc)}, 422)


class Action(BaseModel):
    kind: str
    source_id: str | None = None
    asset_id: str | None = None
    release_id: str | None = None
    database: str | None = None


class SourceInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=2000)
    description: str = Field(default='', max_length=500)
    interval_days: int = Field(default=7, ge=1, le=365)


class SourceEdit(BaseModel):
    enabled: bool | None = None
    interval_days: int | None = Field(default=None, ge=1, le=365)


class AssetEdit(BaseModel):
    status: str | None = None
    notes: str | None = Field(default=None, max_length=4000)
    tags: list[str] | None = Field(default=None, max_length=30)


class URLInput(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=300)


def decoded_asset(identifier):
    asset = store.one('SELECT * FROM assets WHERE id=?', (identifier,))
    if not asset:
        raise HTTPException(404, '에셋을 찾지 못했습니다.')
    asset['payload'] = json.loads(asset['payload'])
    return asset


@api.get('/api/overview')
def overview(request:Request):
    sources = []
    for source in store.rows('SELECT s.*,count(a.id) asset_count FROM sources s LEFT JOIN assets a ON a.source_id=s.id GROUP BY s.id ORDER BY s.rowid'):
        source['decision'] = json.loads(source['decision'])
        sources.append(source)
    stats = store.rows('SELECT kind,count(*) count FROM assets WHERE status!=? GROUP BY kind', ('archived',))
    jobs = store.rows('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 6')
    for job in jobs:
        job['result'] = json.loads(job['result'])
    settings = get_settings()
    auth=winmate.state.auth
    actor=auth.read_token(request.cookies.get(auth.config.cookie_name)) or {}
    profile={'username':actor.get('u'),'role':actor.get('role','admin'),'tracking_enabled':bool(auth.accounts),
             'storage_legacy_owner':auth.accounts.legacy_username if auth.accounts else 'admin'}
    return {'user':profile,'sources': sources, 'stats': stats, 'total_assets': sum(r['count'] for r in stats), 'jobs': jobs,
            'indexed_at': store.setting('indexed_at'), 'baseline_counts': store.setting('baseline_counts', {}),
            'diagnostics': store.setting('diagnostics'), 'automatic_checks': store.setting('automatic_checks', False),
            'ai': {'configured': settings.has_key, 'model': settings.model}, 'scope': 'local',
            'attention': sum(s['status'] in ('refresh', 'uncertain', 'error', 'review', 'unchecked') and s['kind'] != 'local' and s['id'] != 'uploads' for s in sources),
            'active_jobs': store.one("SELECT count(*) n FROM jobs WHERE status IN ('running','queued')")['n'],
            'review_assets': store.one("SELECT count(*) n FROM assets WHERE status IN ('needs_review','analysis_failed','pending')")['n']}


@api.get('/api/sources/{sid}')
def source_detail(sid: str):
    source = store.source(sid)
    if not source:
        raise HTTPException(404, '소스를 찾지 못했습니다.')
    source['decision'] = json.loads(source['decision'])
    snapshot = store.one('SELECT payload FROM snapshots WHERE source_id=? ORDER BY at DESC LIMIT 1', (sid,))
    return {'source': source, 'counts': store.rows('SELECT kind,count(*) n FROM assets WHERE source_id=? GROUP BY kind', (sid,)),
            'latest_snapshot': json.loads(snapshot['payload']) if snapshot else None,
            'snapshots': store.rows('SELECT id,at,hash FROM snapshots WHERE source_id=? ORDER BY at DESC LIMIT 20', (sid,)),
            'releases': store.rows('SELECT id,at,status,manifest FROM releases WHERE source_id=? ORDER BY at DESC LIMIT 10', (sid,))}


@api.post('/api/sources')
def add_source(body: SourceInput):
    url, _, _ = checked_url(body.url)
    existing = store.one('SELECT id FROM sources WHERE url=?', (url,))
    if existing:
        raise HTTPException(409, '이미 등록된 소스입니다.')
    sid = 'source_' + uuid.uuid4().hex[:12]
    with store.db() as db:
        db.execute('INSERT INTO sources(id,name,description,url,kind,interval_days) VALUES (?,?,?,?,?,?)', (sid, body.name.strip(), body.description, url, 'url', body.interval_days))
    store.event('source.add', sid, {'name': body.name, 'url': url})
    return {'id': sid}


@api.patch('/api/sources/{sid}')
def edit_source(sid: str, body: SourceEdit):
    if not store.source(sid):
        raise HTTPException(404, '소스를 찾지 못했습니다.')
    with store.db() as db:
        if body.enabled is not None:
            db.execute('UPDATE sources SET enabled=? WHERE id=?', (body.enabled, sid))
        if body.interval_days is not None:
            db.execute('UPDATE sources SET interval_days=? WHERE id=?', (body.interval_days, sid))
    store.event('source.edit', sid, body.model_dump(exclude_none=True))
    return {'ok': True}


@api.get('/api/assets')
def assets(q: str = Query('', max_length=200), kind: str = '', source: str = '', status: str = '', offset: int = Query(0, ge=0), limit: int = Query(24, ge=1, le=100)):
    return store.assets(q, kind, source, status, offset, limit)


@api.get('/api/assets/{identifier:path}/file')
def asset_file(identifier: str):
    asset = decoded_asset(identifier)
    ref = asset['payload'].get('file_ref')
    if not ref:
        raise HTTPException(404, '다운로드할 추가 원본이 없습니다.')
    file = (store.home / ref).resolve()
    if not file.is_relative_to((store.home / 'uploads').resolve()) or not file.is_file():
        raise HTTPException(404, '원본 파일을 찾지 못했습니다.')
    return FileResponse(file, filename=asset['payload'].get('filename', file.name), media_type='application/octet-stream')


@api.get('/api/assets/{identifier:path}/references')
def asset_references(identifier: str):
    asset = decoded_asset(identifier)
    key = asset['external_id'] or identifier
    return {'items': store.rows('''SELECT id,kind,title,source_id FROM assets a WHERE id!=? AND
        EXISTS(SELECT 1 FROM json_tree(a.payload) j WHERE j.atom IN (?,?)) LIMIT 100''', (identifier, key, identifier)),
            'scope': '등록된 에셋 간의 정확한 ID 참조를 최대 100개 표시합니다. 브라우저 개인 저장 문서는 포함하지 않습니다.'}


@api.get('/api/assets/{identifier:path}/resources')
def asset_resources(identifier: str, group: str = '', kind: str = '', q: str = Query('',max_length=200),
                    offset: int = Query(0,ge=0), limit: int = Query(24,ge=1,le=60)):
    return resources_for(store,decoded_asset(identifier)).page(group,kind,q,offset,limit)


@api.get('/api/asset-resources/{resource_id}')
def asset_resource(resource_id: str, asset: str = Query(...,max_length=2000), download: bool = False,
                   thumb: bool = False, preview: bool = False):
    manifest=resources_for(store,decoded_asset(asset))
    item=manifest.items.get(resource_id)
    if not item: raise HTTPException(404,'이 에셋에 연결된 리소스가 아닙니다.')
    if not item['available']: raise HTTPException(404,'리소스 원본이나 해당 이미지 슬롯을 찾지 못했습니다.')
    if resource_https(item['address']): return RedirectResponse(item['address'],303)
    headers={'Content-Security-Policy': "default-src 'none'; sandbox"}
    if item['kind']=='layout':
        if preview: return {'html':layout_preview(item['_layout'],manifest)}
        return Response(item['_layout'],media_type='application/octet-stream',headers={**headers,
            'Content-Disposition':"attachment; filename*=UTF-8''"+quote(item['label']+'.html')})
    try:
        if preview:
            if item['kind']!='data': raise HTTPException(422,'미리보기를 지원하지 않는 파일입니다.')
            if item.get('_raw'): raw=item['_data'][:60001]
            elif any(k in item for k in ('_member','_pdf_attachment')): raw=resource_bytes(item,original=True)[0][:60001]
            elif item.get('_file'):
                stream=gzip.open(item['_file'],'rb') if item['_file'].suffix=='.gz' else item['_file'].open('rb')
                with stream as file: raw=file.read(60001)
            else: raw=b''
            return {'text':raw[:60000].decode('utf-8',errors='replace'),'truncated':len(raw)>60000}
        special=item.get('_data') is not None or any(k in item for k in ('_slot','_member','_pdf_page','_pdf_image','_pdf_attachment'))
        if item.get('_file') and not special and (download or item['kind'] not in {'image','video'}):
            name=item['label'];extension=item['_file'].suffix
            if extension and not name.lower().endswith(extension.lower()): name+=extension
            return FileResponse(item['_file'],filename=name,media_type='application/octet-stream',headers=headers)
        if item.get('_file') and not special and not thumb and item['_file'].suffix.lower() not in {'.tif','.tiff'}:
            return FileResponse(item['_file'],media_type=mimetypes.guess_type(item['_file'].name)[0] or 'application/octet-stream',headers=headers)
        raw,mime=resource_bytes(item,thumb=thumb and not download,original=download)
    except FileNotFoundError as exc: raise HTTPException(404,str(exc)) from None
    except (OSError,ValueError,RuntimeError,IndexError) as exc: raise HTTPException(422,'리소스를 읽지 못했습니다: '+str(exc)[:180]) from None
    if download or item['kind'] not in {'image','video'}:
        extension={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/avif':'.avif','image/svg+xml':'.svg',
                   'image/gif':'.gif','image/bmp':'.bmp','image/tiff':'.tiff'}.get(mime,'')
        name=item['label']
        if extension and not name.lower().endswith(extension): name+=extension
        headers['Content-Disposition']="attachment; filename*=UTF-8''"+quote(name)
        mime='application/octet-stream'
    return Response(raw,media_type=mime,headers=headers)


@api.get('/api/assets/{identifier:path}')
def asset(identifier: str):
    result = decoded_asset(identifier)
    # Large originals remain downloadable; detail payloads are bounded for the dialog.
    result['content_length'] = len(result['content'])
    result['content'] = result['content'][:60000]
    return result


@api.patch('/api/assets/{identifier:path}')
def edit_asset(identifier: str, body: AssetEdit):
    if body.status is not None and body.status not in ('indexed', 'archived', 'needs_review'):
        raise HTTPException(422, '에셋 상태가 올바르지 않습니다.')
    with store.db(immediate=True) as db:
        row = db.execute('SELECT * FROM assets WHERE id=?', (identifier,)).fetchone()
        if not row:
            raise HTTPException(404, '에셋을 찾지 못했습니다.')
        asset = dict(row)
        payload = json.loads(asset['payload'])
        if body.notes is not None:
            payload['admin_notes'] = body.notes
        if body.tags is not None:
            payload['admin_tags'] = [tag.strip()[:80] for tag in body.tags if tag.strip()]
        db.execute('UPDATE assets SET payload=?,hash=?,status=?,updated_at=? WHERE id=?', (dump(payload), digest({'payload': payload, 'content': asset['content']}), body.status or asset['status'], now(), identifier))
    store.event('asset.edit', identifier, body.model_dump(exclude_none=True))
    return {'ok': True}


@api.post('/api/uploads')
async def upload(request: Request):
    try:
        length = int(request.headers.get('content-length') or 0)
    except ValueError:
        raise HTTPException(400, '요청 크기가 올바르지 않습니다.') from None
    if length > MAX_UPLOAD:
        raise HTTPException(413, '파일은 25MB 이하로 추가해 주세요.')
    raw = bytearray()
    async for chunk in request.stream():
        raw += chunk
        if len(raw) > MAX_UPLOAD:
            raise HTTPException(413, '파일은 25MB 이하로 추가해 주세요.')
    if not raw:
        raise HTTPException(422, '빈 파일입니다.')
    name = unquote(request.headers.get('x-filename', 'file.txt'))
    if len(name) > 300:
        raise HTTPException(422, '파일 이름이 너무 깁니다.')
    aid, duplicate = await run_in_threadpool(service.add_upload, bytes(raw), name, request.headers.get('content-type', ''))
    store.event('asset.upload', aid, {'duplicate': duplicate})
    return enqueue_asset(aid, duplicate)


@api.post('/api/url-assets')
def url_asset(body: URLInput):
    aid, duplicate = service.add_url_asset(body.url, body.title)
    store.event('asset.url', aid, {'duplicate': duplicate})
    return enqueue_asset(aid, duplicate)


def enqueue_asset(aid, duplicate):
    asset = store.one('SELECT status FROM assets WHERE id=?', (aid,))
    result = {'asset_id': aid, 'duplicate': duplicate, 'job': None}
    if not duplicate or asset['status'] in ('pending', 'analysis_failed'):
        try:
            result['job'] = service.submit('analyze', 'uploads', {'asset_id': aid})
        except EngineError as exc:
            with store.db() as db:
                db.execute("UPDATE assets SET status='analysis_failed' WHERE id=?", (aid,))
            result['analysis_error'] = str(exc)
    return result


@api.post('/api/jobs')
def job_action(body: Action):
    extra = body.model_dump(exclude_none=True)
    if body.kind == 'analyze' and not body.asset_id or body.kind == 'rollback' and not body.release_id:
        raise HTTPException(422, '작업 대상이 필요합니다.')
    return service.submit(body.kind, body.source_id, extra, actor=telemetry.current().get('username') or 'admin')


@api.get('/api/jobs')
def jobs(offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100)):
    rows = store.rows('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ? OFFSET ?', (limit, offset))
    for r in rows:
        r['result'] = json.loads(r['result'])
    return {'items': rows, 'total': store.one('SELECT count(*) n FROM jobs')['n']}


@api.get('/api/jobs/{jid}')
def job_detail(jid: str):
    result = store.job(jid)
    if not result:
        raise HTTPException(404, '작업을 찾지 못했습니다.')
    logs = []
    for directory in (store.home / 'releases').glob(jid + '-*') if (store.home / 'releases').exists() else []:
        file = directory / 'collector.log'
        if file.exists():
            from app.api.poc.provider import redact
            with file.open('rb') as stream:
                stream.seek(max(0, file.stat().st_size - 16000))
                logs.append(redact(stream.read().decode('utf-8', 'replace')))
        inventory = read_inventory(directory)
        if inventory:
            result.setdefault('inventories', []).append(inventory)
    result['logs'] = logs
    return result


def read_inventory(directory):
    try:
        return json.loads((directory / 'source-inventory.json').read_text())
    except (OSError, ValueError):
        return None


@api.post('/api/jobs/{jid}/cancel')
def cancel_job(jid: str):
    if not store.job(jid):
        raise HTTPException(404, '작업을 찾지 못했습니다.')
    with store.db() as db:
        db.execute("UPDATE jobs SET cancelled=1 WHERE id=? AND status IN ('queued','running')", (jid,))
    store.event('job.cancel', jid)
    return {'ok': True}


@api.get('/api/releases')
def releases():
    rows = store.rows('SELECT * FROM releases ORDER BY at DESC LIMIT 50')
    for row in rows:
        row['manifest'] = json.loads(row['manifest'])
    return {'items': rows}


@api.get('/api/releases/{rid}/export')
def export_release(rid: str):
    release = store.one('SELECT * FROM releases WHERE id=?', (rid,))
    if not release:
        raise HTTPException(404, '릴리스를 찾지 못했습니다.')
    path = (store.home / release['path'] / 'assets.json').resolve()
    if not path.is_relative_to(store.home.resolve()):
        raise HTTPException(400, '잘못된 경로입니다.')
    return FileResponse(path, media_type='application/json', filename='winmate-assets-' + rid + '.json')


@api.get('/api/backups')
def backups():
    directory = store.home / 'backups'
    return {'items': [{'filename': p.name, 'bytes': p.stat().st_size} for p in sorted(directory.glob('*.sqlite'), reverse=True)[:30]] if directory.exists() else []}


@api.get('/api/backups/{filename}')
def download_backup(filename: str):
    if Path(filename).name != filename or not re.fullmatch(r'[\w.+-]+\.sqlite', filename):
        raise HTTPException(400, '파일 이름이 올바르지 않습니다.')
    path = store.home / 'backups' / filename
    if not path.is_file():
        raise HTTPException(404, '백업을 찾지 못했습니다.')
    return FileResponse(path, media_type='application/octet-stream', filename=filename)


@api.get('/api/export')
def export_assets(source: str = '', kind: str = ''):
    conditions, args = [], []
    if source:
        conditions.append('source_id=?'); args.append(source)
    if kind:
        conditions.append('kind=?'); args.append(kind)
    assets = store.rows('SELECT * FROM assets' + (' WHERE ' + ' AND '.join(conditions) if conditions else ''), args)
    for asset in assets:
        asset['payload'] = json.loads(asset['payload'])
    store.event('assets.export', source or 'all', {'count': len(assets)})
    return Response(dump({'exported_at': now(), 'scope': 'admin-managed', 'assets': assets}), media_type='application/json',
                    headers={'Content-Disposition': 'attachment; filename="winmate-admin-assets.json"'})


@api.get('/api/database/{database}')
def database_tables(database: str):
    return inspect_database(database_path(database))


def database_path(name):
    paths = {'source': ROOT / 'proddb/winmate_products.sqlite', 'runtime': ROOT / 'app/data/runtime/winmate_products.sqlite', 'admin': store.path}
    if name not in paths:
        raise HTTPException(404, 'DB를 찾지 못했습니다.')
    return paths[name]


@api.get('/api/database/{database}/{table}')
def database_rows(database: str, table: str, offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100)):
    with sqlite3.connect(f'file:{database_path(database)}?mode=ro', uri=True) as db:
        allowed = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%_fts%' AND name NOT LIKE 'sqlite_%'")}
        if table not in allowed:
            raise HTTPException(404, '테이블을 찾지 못했습니다.')
        identifier = '"' + table.replace('"', '""') + '"'
        cursor = db.execute('SELECT * FROM ' + identifier + ' LIMIT ? OFFSET ?', (limit, offset))
        rows = [[str(v)[:1800] if v is not None else None for v in row] for row in cursor]
        return {'columns': [c[0] for c in cursor.description], 'items': rows, 'total': db.execute('SELECT count(*) FROM ' + identifier).fetchone()[0], 'offset': offset}


@api.get('/api/events')
def events():
    return {'items': store.rows('SELECT * FROM events ORDER BY id DESC LIMIT 100')}


class SettingsInput(BaseModel):
    automatic_checks: bool


@api.patch('/api/settings')
def settings(body: SettingsInput):
    store.set_setting('automatic_checks', body.automatic_checks)
    store.event('settings.update', 'automatic_checks', body.model_dump())
    return {'ok': True}


api.mount('/static', StaticFiles(directory=ADMIN_WEB, check_dir=False), name='admin-static')


@api.get('/')
@api.get('/{path:path}')
def page(path: str = ''):
    if path.startswith('api/'):
        raise HTTPException(404, 'API를 찾지 못했습니다.')
    file = ADMIN_WEB / 'index.html'
    if not file.exists():
        raise HTTPException(503, 'node admin/build.mjs를 실행해 주세요.')
    return FileResponse(file, headers={'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'"})


@asynccontextmanager
async def lifespan(app):
    previous_accounts=winmate.state.auth.accounts
    operations.accounts=Accounts(operations,winmate.state.auth)
    previous_sink=telemetry.install(operations.receive)
    try:
        with telemetry.scope(username='system',role='system',feature='startup',trace_id=uuid.uuid4().hex):
            async with winmate.router.lifespan_context(winmate):
                await run_in_threadpool(service.start)
                yield
                await run_in_threadpool(service.close)
    finally:
        telemetry.install(previous_sink)
        winmate.state.auth.accounts=previous_accounts


async def admin_redirect(request):
    return RedirectResponse('/admin/', 307)


app = Starlette(routes=[Route('/admin', admin_redirect), Mount('/admin', app=api), Mount('/', app=winmate)], lifespan=lifespan)
app.add_middleware(RequestTracing,auth=winmate.state.auth,operations=operations)
