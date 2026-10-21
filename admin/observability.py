from __future__ import annotations
import hashlib
import json
import re
import time
import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.requests import HTTPConnection
from starlette.concurrency import run_in_threadpool

from app.api import telemetry
from app.api.auth import validate_password
from .operations import clean
from .users import Accounts, PUBLIC
from .engine import EngineError


class PasswordChange(BaseModel):
    current_password:str=Field(min_length=1,max_length=1024)
    new_password:str=Field(min_length=12,max_length=1024)


class AddUsers(BaseModel):
    usernames:str=Field(min_length=1,max_length=6500)
    password:str|None=Field(default=None,max_length=1024)
    role:str='member'
    display_name:str=Field(default='',max_length=120)


class EditUser(BaseModel):
    active:bool|None=None
    role:str|None=None
    display_name:str|None=Field(default=None,max_length=120)
    note:str|None=Field(default=None,max_length=4000)


class ResetUsers(BaseModel):
    usernames:str=Field(min_length=1,max_length=6500)
    password:str|None=Field(default=None,max_length=1024)


def identity(request):
    auth=request.app.state.auth
    value=auth.read_token(request.cookies.get(auth.config.cookie_name))
    if not value:raise HTTPException(401,'로그인 후 이용해 주세요.')
    return value


async def bounded_json(request,maximum=8*1024*1024):
    data=bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data)>maximum:raise HTTPException(413,'한 번에 보낼 수 있는 데이터 크기를 넘었습니다.')
    try:return json.loads(data)
    except (ValueError,UnicodeError):raise HTTPException(422,'JSON 형식이 올바르지 않습니다.') from None


def activity_router(operations):
    router=APIRouter(prefix='/api/activity')

    @router.post('/events')
    async def events(request:Request):
        actor=identity(request)
        body=await bounded_json(request,256*1024)
        events=body.get('events') if isinstance(body,dict) else None
        if not isinstance(events,list) or len(events)>100:raise HTTPException(422,'이벤트는 한 번에 100개 이하로 보내 주세요.')
        accepted=0
        for event in events:
            if not isinstance(event,dict) or event.get('kind') not in ('action','screen.enter','screen.leave','client.error'):continue
            now=time.time()
            occurred=event.get('at',now)
            if not isinstance(occurred,(int,float)) or occurred<now-7*86400 or occurred>now+300:occurred=now
            event_id=str(event.get('id') or uuid.uuid4().hex)
            span_id=hashlib.sha256((actor['u']+'\0'+event_id).encode()).hexdigest()[:32]
            trace_id=str(event.get('trace_id') or uuid.uuid4().hex)
            if not re.fullmatch(r'[a-zA-Z0-9_-]{8,80}',trace_id):trace_id=uuid.uuid4().hex
            await run_in_threadpool(operations.receive,event['kind'],{'span_id':span_id,'trace_id':trace_id,'username':actor['u'],'session_id':actor['sid'],
                'page':str(event.get('page') or '')[:150],'feature':str(event.get('feature') or event.get('page') or 'browser')[:100],
                'action':str(event.get('action') or '')[:180], 'started':occurred,'ended':occurred,
                'duration_ms':min(86400000,max(0,int(event.get('duration_ms') or 0))),
                'status':'error' if event['kind']=='client.error' else 'ok',
                'code':str(event.get('code') or '')[:100], 'message':str(event.get('message') or '')[:2000],
                'stack':str(event.get('stack') or '')[:18000], 'metadata':clean(event.get('metadata') or {})},True)
            accepted+=1
        return {'accepted':accepted}

    @router.post('/history')
    async def history(request:Request):
        actor=identity(request)
        body=await bounded_json(request)
        if not isinstance(body,dict):raise HTTPException(422,'히스토리 형식이 올바르지 않습니다.')
        if body.get('kind')=='server_job':raise HTTPException(422,'서버 작업 이력은 클라이언트가 변경할 수 없습니다.')
        removed=body.get('removed_ids') or []
        if not isinstance(removed,list) or len(removed)>2000 or any(not isinstance(v,str) or len(v)>250 for v in removed):raise HTTPException(422,'삭제한 기록 ID 형식이 올바르지 않습니다.')
        try:return await run_in_threadpool(operations.save_history,actor['u'],body.get('kind'),body.get('records'),False,removed)
        except ValueError as exc:raise HTTPException(422,str(exc)) from None

    @router.get('/history')
    def own_history(request:Request,limit:int=Query(500,ge=1,le=2000),offset:int=Query(0,ge=0),browser_only:bool=False):
        actor=identity(request)
        where="username=? AND archived=0"+(" AND kind NOT IN ('server_job','template')" if browser_only else '')
        rows=operations.rows('SELECT kind,record_id,payload,updated_at FROM history WHERE '+where+' ORDER BY updated_at DESC LIMIT ? OFFSET ?',(actor['u'],limit,offset))
        for row in rows:row['payload']=json.loads(row['payload'])
        return {'items':rows,'total':operations.one('SELECT count(*) n FROM history WHERE '+where,(actor['u'],))['n']}

    @router.post('/password')
    def change_password(request:Request,body:PasswordChange):
        actor=identity(request);auth=request.app.state.auth
        if not auth.verify_password(actor['u'],body.current_password):raise HTTPException(403,'현재 비밀번호가 맞지 않습니다.')
        try:auth.accounts.reset(actor['u'],body.new_password,actor=actor['u'])
        except EngineError as exc:raise HTTPException(422,str(exc)) from None
        response=JSONResponse({'ok':True,'login_required':True},headers={'Cache-Control':'no-store'})
        response.delete_cookie(auth.config.cookie_name,path='/')
        return response

    return router


def admin_router(operations,auth):
    router=APIRouter(prefix='/api')

    def directory():
        if operations.accounts is None:operations.accounts=Accounts(operations,auth)
        return operations.accounts

    def actor(request):
        value=auth.read_token(request.cookies.get(auth.config.cookie_name))
        return value['u'] if value else 'admin'

    @router.get('/users')
    def users(q:str=Query('',max_length=150),active:bool|None=None,offset:int=Query(0,ge=0),limit:int=Query(30,ge=1,le=100)):
        result=directory().list(q,active,offset,limit)
        for row in result['items']:
            username=row['username']
            row['history_count']=operations.one('SELECT count(*) n FROM history WHERE username=?',(username,))['n']
            row['visits']=operations.one("SELECT count(*) n FROM spans WHERE username=? AND kind='screen.enter'",(username,))['n']
            row['total_tokens']=operations.one("SELECT coalesce(sum(total_tokens),0) n FROM spans WHERE username=? AND kind='llm.usage'",(username,))['n']
        return result

    @router.post('/users')
    def add_users(body:AddUsers,request:Request):
        return JSONResponse(directory().create(body.usernames,body.password,body.role,body.display_name,actor(request)),headers={'Cache-Control':'no-store'})

    @router.patch('/users/{username}')
    def edit_user(username:str,body:EditUser,request:Request):
        return directory().edit(username,**body.model_dump(exclude_none=True),actor=actor(request))

    @router.post('/users/reset-password')
    def reset_users(body:ResetUsers,request:Request):
        requester=actor(request)
        result=directory().reset(body.usernames,body.password,requester)
        response=JSONResponse(result,headers={'Cache-Control':'no-store'})
        if requester in result['users']:
            token,_=auth.issue_token(requester)
            response.set_cookie(auth.config.cookie_name,token,max_age=auth.config.session_seconds,path='/',httponly=True,samesite='strict',secure=request.url.scheme=='https')
        return response

    @router.get('/users/{username}')
    def user_detail(username:str):
        directory()
        row=operations.one('SELECT '+PUBLIC+' FROM users WHERE username=?',(username,))
        if not row:raise HTTPException(404,'사용자를 찾지 못했습니다.')
        row['history']=operations.rows('SELECT kind,count(*) count,sum(archived) archived FROM history WHERE username=? GROUP BY kind',(username,))
        return row

    def filter_args(start,end,username,feature,model,kind='',status='',q=''):
        return dict(start=start,end=end,username=username,feature=feature,model=model,kind=kind,status=status,q=q)

    @router.get('/tracing/dashboard')
    def dashboard(start:str|None=None,end:str|None=None,username:str='',feature:str='',model:str=''):
        try:
            result=operations.dashboard(start=start,end=end,username=username,feature=feature,model=model)
            result['logging']=telemetry.health()
            return result
        except ValueError as exc:raise HTTPException(422,str(exc)) from None

    @router.get('/tracing/spans')
    def spans(start:str|None=None,end:str|None=None,username:str='',feature:str='',model:str='',kind:str='',status:str='',q:str=Query('',max_length=200),offset:int=Query(0,ge=0),limit:int=Query(30,ge=1,le=100)):
        try:return operations.spans(offset,limit,**filter_args(start,end,username,feature,model,kind,status,q))
        except ValueError as exc:raise HTTPException(422,str(exc)) from None

    @router.get('/tracing/trace/{trace_id}')
    def trace(trace_id:str):
        rows=operations.rows('SELECT * FROM spans WHERE trace_id=? ORDER BY started',(trace_id,))
        for row in rows:row['metadata']=json.loads(row['metadata'])
        return {'trace_id':trace_id,'items':rows}

    @router.get('/tracing/history')
    def history(username:str='',kind:str='',q:str=Query('',max_length=200),offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
        clauses,args=[],[]
        for key,value in [('username',username),('kind',kind)]:
            if value:clauses.append(key+'=?');args.append(value)
        if q:clauses.append('(instr(title,?)>0 OR instr(record_id,?)>0)');args.extend([q,q])
        where=' WHERE '+' AND '.join(clauses) if clauses else ''
        return {'items':operations.rows('SELECT username,kind,record_id,title,created_at,updated_at,last_seen,archived,revision FROM history'+where+' ORDER BY updated_at DESC LIMIT ? OFFSET ?',[*args,limit,offset]),
                'total':operations.one('SELECT count(*) n FROM history'+where,args)['n']}

    @router.get('/tracing/history/{username}/{kind}/{record_id:path}')
    def history_detail(username:str,kind:str,record_id:str,revision:int|None=None):
        row=operations.one('SELECT * FROM history WHERE username=? AND kind=? AND record_id=?',(username,kind,record_id))
        if not row:raise HTTPException(404,'히스토리를 찾지 못했습니다.')
        row['versions']=operations.rows('SELECT revision,at,hash FROM history_versions WHERE username=? AND kind=? AND record_id=? ORDER BY revision DESC',(username,kind,record_id))
        if revision is not None:
            version=operations.one('SELECT payload FROM history_versions WHERE username=? AND kind=? AND record_id=? AND revision=?',(username,kind,record_id,revision))
            if not version:raise HTTPException(404,'해당 버전을 찾지 못했습니다.')
            row['payload']=version['payload']
        row['payload']=json.loads(row['payload'])
        return row

    @router.get('/tracing/export')
    def export(start:str|None=None,end:str|None=None,username:str='',feature:str='',model:str='',kind:str='',status:str=''):
        try:where,args,_,_=operations.where(start,end,username,feature,model,kind,status)
        except ValueError as exc:raise HTTPException(422,str(exc)) from None
        rows=operations.rows('SELECT * FROM spans WHERE '+where+' ORDER BY started LIMIT 50000',args)
        for row in rows:row['metadata']=json.loads(row['metadata'])
        return Response(json.dumps({'timezone':'Asia/Seoul','items':rows,'limit':50000},ensure_ascii=False),media_type='application/json',headers={'Content-Disposition':'attachment; filename="winmate-tracing.json"','Cache-Control':'no-store'})

    return router


class RequestTracing:
    def __init__(self,app,auth,operations):
        self.app,self.auth,self.operations=app,auth,operations

    async def __call__(self,scope,receive,send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        conn=HTTPConnection(scope);path=scope['path'];method=scope['method'];started=time.time()
        user=self.auth.read_token(conn.cookies.get(self.auth.config.cookie_name))
        username=user['u'] if user else 'anonymous'
        expected=conn.headers.get('x-winmate-user')
        if expected and expected!=username and path not in ('/api/bootstrap','/api/auth/login','/api/auth/status'):
            return await JSONResponse({'detail':'로그인 계정이 변경되었습니다. 화면을 다시 불러옵니다.','code':'account_changed'},409)(scope,receive,send)
        supplied=conn.headers.get('x-winmate-trace','')
        trace_id=supplied if re.fullmatch(r'[a-zA-Z0-9_-]{8,80}',supplied) else uuid.uuid4().hex
        span_id=uuid.uuid4().hex[:16]
        feature=conn.headers.get('x-winmate-feature','')
        if not re.fullmatch(r'[a-zA-Z0-9._:-]{1,100}',feature):
            parts=path.strip('/').split('/')
            feature='admin.'+(parts[2] if len(parts)>2 else 'page') if path.startswith('/admin') else (parts[1] if len(parts)>1 and parts[0]=='api' else parts[0] if parts[0] else 'home')
        page=conn.headers.get('x-winmate-page','')[:150]
        safe_path=re.sub(r'(/api/storyboards/|/s/)[^/]+',r'\1[shared]',path)
        routine=(path.startswith(('/assets/','/fonts/','/img/','/lib/','/admin/static/','/api/activity/','/admin/api/tracing/')) or path in ('/api/health','/favicon.ico','/tokens.css') or method=='GET' and (path.startswith('/api/jobs/') or path=='/admin/api/overview'))
        status=500;error_body=bytearray();size=0
        async def traced_send(message):
            nonlocal status,size
            if message['type']=='http.response.start':
                status=message['status']
                message.setdefault('headers',[]).extend([(b'x-winmate-trace',trace_id.encode()),(b'x-winmate-request',span_id.encode())])
            elif message['type']=='http.response.body':
                chunk=message.get('body',b'');size+=len(chunk)
                if status>=400 and len(error_body)<20000:error_body.extend(chunk[:20000-len(error_body)])
            await send(message)
        with telemetry.scope(username=username,role=user.get('role','admin' if username=='admin' else 'member') if user else 'guest',
                             session_id=user.get('sid') if user else None,trace_id=trace_id,span_id=span_id,
                             parent_id=None,feature=feature,page=page,path=safe_path,method=method):
            if not routine:await run_in_threadpool(telemetry.emit,'http',started=started,status='running')
            failure=None
            try:
                return await self.app(scope,receive,traced_send)
            except Exception as exc:
                failure=exc
                raise
            finally:
                if not routine or status>=400 or failure:
                    code=message=''
                    try:
                        parsed=json.loads(error_body)
                        code=str(parsed.get('code') or '')
                        detail=parsed.get('detail') or parsed.get('message')
                        message=detail if isinstance(detail,str) else '입력값 검증 실패' if isinstance(detail,list) else ''
                    except (ValueError,UnicodeError):pass
                    await run_in_threadpool(telemetry.emit,'http',started=started,ended=time.time(),status='error' if status>=400 or failure else 'ok',http_status=status,
                                   code=getattr(failure,'code',type(failure).__name__) if failure else code or ('http_'+str(status) if status>=400 else ''),message=str(failure) if failure else message,
                                   stack=telemetry.stack(failure) if failure else None,
                                   metadata={'response_bytes':size,'user_agent':conn.headers.get('user-agent','')[:300]})
