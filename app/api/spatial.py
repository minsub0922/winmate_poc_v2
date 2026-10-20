"""Reproducible spatial library, real LLM planning and account-scoped scene history."""
from __future__ import annotations
import copy
import hashlib
import json
import math
import os
import re
from pathlib import Path
import secrets
import sqlite3
import threading
import time

from fastapi import APIRouter, Body, HTTPException, Query, Request, Response
from .spatial_people import validate_people

DATA = Path(__file__).resolve().parents[1] / 'data/spatial'
STYLES = ('warm', 'modern', 'premium', 'clinical', 'industrial')


def detail_support_error(o, asset, byid, assets):
    placement=asset.get('placement',{})
    if placement.get('mode')!='surface':return None
    support=byid.get(o.get('supportId'));base=assets.get(support.get('assetId')) if support else None
    kind=base.get('supportSurface',base['kind']) if base else None
    if not support or support['roomId']!=o['roomId'] or not base or kind not in placement['supports']:
        return asset['name']+': 알맞은 테이블·가구 위에 배치해 주세요.'
    angle=math.radians(support['rotation']);dx=o['x']-support['x'];dz=o['z']-support['z']
    x=dx*math.cos(angle)+dz*math.sin(angle);z=-dx*math.sin(angle)+dz*math.cos(angle)
    turn=math.radians(o['rotation']-support['rotation']);w,h,d=asset['size']
    ew=abs(w*math.cos(turn))+abs(d*math.sin(turn));ed=abs(d*math.cos(turn))+abs(w*math.sin(turn))
    if abs(x)+ew/2>base['size'][0]/2-.012 or abs(z)+ed/2>base['size'][2]/2-.012:
        return asset['name']+': 받침 가구의 상판 영역을 벗어납니다.'
    fraction=placement.get('surfaceHeights',{}).get(kind,1)
    height=base.get('supportSurfaceHeight',base['size'][1]*fraction)
    expected=support['elevation']+height+placement.get('surfaceGap',.004)
    if abs(o['elevation']-expected)>.012:return asset['name']+': 받침 가구의 표면 높이에 맞춰 주세요.'
    return None


class SpatialLibrary:
    def __init__(self, directory=DATA):
        self.directory = Path(directory)
        self.library = json.loads((self.directory / 'library.json').read_text())
        self.scenes = json.loads((self.directory / 'scenes.json').read_text())
        self.examples = json.loads((self.directory / 'examples.json').read_text())
        self.assets = {a['id']:a for a in self.library['assets']}
        self.templates = {t['id']:t for t in self.library['templates']}
        self.revisions = {self.library['sourceHash']:self.library}

    def revision(self,identifier):
        if not identifier:return self.library
        if not isinstance(identifier,str) or not re.fullmatch(r'[a-f0-9]{8}',identifier):raise ValueError('오브젝트 버전이 올바르지 않습니다.')
        if identifier not in self.revisions:
            file=self.directory/'versions'/f'{identifier}.json'
            if not file.is_file():raise ValueError('저장된 오브젝트 버전을 찾지 못했습니다.')
            data=json.loads(file.read_text())
            if data.get('sourceHash')!=identifier:raise ValueError('오브젝트 버전이 일치하지 않습니다.')
            self.revisions[identifier]=data
        return self.revisions[identifier]

    def validate(self, scene):
        if not isinstance(scene, dict) or scene.get('version') != 1:
            raise ValueError('지원하지 않는 장면 버전입니다.')
        assets={a['id']:a for a in self.revision(scene.get('assetRevision'))['assets']}
        if len(json.dumps(scene, ensure_ascii=False)) > 2_000_000:
            raise ValueError('장면 데이터가 너무 큽니다.')
        def finite(x):
            return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)
        if not all(finite(scene.get(k)) and 4 <= scene[k] <= 150 for k in ('width','depth')):
            raise ValueError('가로·세로는 4~150m로 입력해 주세요.')
        if scene.get('industry') not in {i['code'] for i in self.library['industries']} or scene.get('style') not in STYLES:
            raise ValueError('업종·스타일 참조가 올바르지 않습니다.')
        if not isinstance(scene.get('title'),str) or not 1 <= len(scene['title']) <= 150:
            raise ValueError('제목은 1~150자여야 합니다.')
        camera=scene.get('camera',{})
        if not isinstance(camera,dict):raise ValueError('카메라 설정이 올바르지 않습니다.')
        for key in ('position','target'):
            if key in camera and (not isinstance(camera[key],list) or len(camera[key])!=3 or not all(finite(v) for v in camera[key])):raise ValueError('카메라 좌표가 올바르지 않습니다.')
        for key in ('zoom','fit','azimuth','elevation'):
            if key in camera and not finite(camera[key]):raise ValueError('카메라 설정이 올바르지 않습니다.')
        rooms, objects = scene.get('rooms'),scene.get('objects')
        if not isinstance(rooms,list) or not 1 <= len(rooms) <= 30 or not isinstance(objects,list) or len(objects)>2000:
            raise ValueError('공간·오브젝트 수가 올바르지 않습니다.')
        ids = set()
        room_map = {}
        for room in rooms:
            if not isinstance(room,dict) or not isinstance(room.get('id'),str) or room['id'] in ids:
                raise ValueError('공간 ID가 올바르지 않습니다.')
            ids.add(room['id']);room_map[room['id']]=room
            if not isinstance(room.get('name'),str) or len(room['name'])>150:raise ValueError('공간 이름이 올바르지 않습니다.')
            if not all(finite(room.get(k)) for k in ('x','z','width','depth','height')):
                raise ValueError('공간 치수가 올바르지 않습니다.')
            if room['x']<0 or room['z']<0 or room['width']<2 or room['depth']<2 or not 2<=room['height']<=20 or room['x']+room['width']>scene['width']+.01 or room['z']+room['depth']>scene['depth']+.01:
                raise ValueError('공간이 전체 맵 경계를 벗어납니다.')
        bounds = {}
        for o in objects:
            if not isinstance(o,dict) or not isinstance(o.get('id'),str) or o['id'] in ids:
                raise ValueError('오브젝트 ID가 올바르지 않습니다.')
            ids.add(o['id'])
            asset,room=assets.get(o.get('assetId')),room_map.get(o.get('roomId'))
            if not asset or not room or not asset['physical']:
                raise ValueError('등록되지 않은 물리 오브젝트·공간 참조입니다.')
            if not all(finite(o.get(k)) for k in ('x','z','elevation','rotation')):
                raise ValueError('오브젝트 위치가 올바르지 않습니다.')
            w,h,d=asset['size'];angle=math.radians(o['rotation'])
            ew,ed=abs(w*math.cos(angle))+abs(d*math.sin(angle)),abs(d*math.cos(angle))+abs(w*math.sin(angle))
            b=dict(x=o['x']-ew/2,z=o['z']-ed/2,w=ew,d=ed,y=o['elevation'],h=h)
            bounds[o['id']]=b
            if b['x']<room['x']-.01 or b['z']<room['z']-.01 or b['x']+ew>room['x']+room['width']+.01 or b['z']+ed>room['z']+room['depth']+.01 or b['y']<0 or b['y']+h>room['height']+.01:
                raise ValueError(asset['name']+': 공간 경계를 벗어납니다.')
            if asset['kind']!='rug' and b['y']<2 and b['z']+ed>room['z']+room['depth']-1.15 and b['x']<room['x']+room['width']/2+.66 and b['x']+ew>room['x']+room['width']/2-.66:
                raise ValueError(asset['name']+': 출입문 동선을 막습니다.')
        byid = {o['id']:o for o in objects}
        for o in objects:
            support_error=detail_support_error(o,assets[o['assetId']],byid,assets)
            if support_error:raise ValueError(support_error)
            if o.get('supportId') and (o['supportId'] not in byid or byid[o['supportId']]['roomId']!=o['roomId']):
                raise ValueError('받침 가구를 찾지 못했습니다.')
            if assets[o['assetId']]['kind']=='rug':continue
            a=bounds[o['id']]
            for other in objects:
                if other['id']==o['id'] or other['roomId']!=o['roomId'] or other['id']==o.get('supportId') or other.get('supportId')==o['id'] or assets[other['assetId']]['kind']=='rug':continue
                b=bounds[other['id']]
                small=assets[o['assetId']].get('placement',{}).get('mode')=='surface' or assets[other['assetId']].get('placement',{}).get('mode')=='surface'
                pad=.012 if small else .06;epsilon=.001 if small else .02
                if a['x']<b['x']+b['w']+pad and a['x']+a['w']+pad>b['x'] and a['z']<b['z']+b['d']+pad and a['z']+a['d']+pad>b['z'] and a['y']<b['y']+b['h']-epsilon and a['y']+a['h']>b['y']+epsilon:
                    raise ValueError(assets[o['assetId']]['name']+': 가구·제품과 겹칩니다.')
        validate_people(scene,assets)
        return scene

    def validate_form(self, value):
        if value is None:value={'version':1,'title':'','industry':'','style':'modern','templateId':None,'rooms':[]}
        if not isinstance(value,dict) or value.get('version')!=1:raise ValueError('지원하지 않는 공간 입력 형식입니다.')
        if len(json.dumps(value,ensure_ascii=False))>200_000:raise ValueError('공간 입력 데이터가 너무 큽니다.')
        if not isinstance(value.get('title',''),str) or len(value.get('title',''))>150:raise ValueError('조감도 이름은 150자 이내여야 합니다.')
        industry=value.get('industry','')
        if industry and industry not in {i['code'] for i in self.library['industries']}:raise ValueError('등록된 업종을 선택해 주세요.')
        if value.get('style','modern') not in STYLES:raise ValueError('공간 스타일이 올바르지 않습니다.')
        if value.get('templateId') is not None and not isinstance(value['templateId'],str):raise ValueError('공간 템플릿 참조가 올바르지 않습니다.')
        rooms=value.get('rooms',[])
        if not isinstance(rooms,list) or len(rooms)>30:raise ValueError('공간은 최대 30개까지 입력할 수 있습니다.')
        ids=set();kinds={'reception','office','meeting','lounge','dining','kitchen','classroom','study','bedroom','medical','retail','warehouse','utility','theatre','fitness','outdoor'}
        for room in rooms:
            if not isinstance(room,dict) or not isinstance(room.get('id'),str) or not 1<=len(room['id'])<=100 or room['id'] in ids:raise ValueError('공간 ID가 올바르지 않습니다.')
            ids.add(room['id'])
            if not isinstance(room.get('name'),str) or len(room['name'])>100 or room.get('kind') not in kinds:raise ValueError('공간 이름·용도가 올바르지 않습니다.')
            if room.get('customPurpose') is not None and (not isinstance(room['customPurpose'],str) or len(room['customPurpose'])>100):raise ValueError('공간 용도는 100자 이내로 입력해 주세요.')
            for key in ('width','depth','capacity'):
                number=room.get(key,'')
                if number in ('',None):continue
                try:parsed=float(number)
                except (TypeError,ValueError):raise ValueError('공간 치수·좌석 수는 숫자로 입력해 주세요.')
                if isinstance(number,bool) or not math.isfinite(parsed) or not 0<=parsed<=150:raise ValueError('공간 치수·좌석 수가 올바르지 않습니다.')
            products=room.get('products',[])
            if not isinstance(products,list) or len(products)>80:raise ValueError('공간별 제품은 최대 80종까지 입력할 수 있습니다.')
            product_ids=set()
            for product in products:
                if not isinstance(product,dict):raise ValueError('공간별 제품 형식이 올바르지 않습니다.')
                identifier=product.get('productId');asset=self.assets.get('product:'+str(identifier))
                if not asset or not asset['physical'] or identifier in product_ids:raise ValueError('등록된 물리 제품을 선택해 주세요.')
                product_ids.add(identifier);quantity=product.get('quantity')
                if quantity in ('',None):continue
                if type(quantity) is not int or not 1<=quantity<=30:raise ValueError('제품 수량은 1~30개여야 합니다.')
            furniture=room.get('furniture',[])
            if not isinstance(furniture,list) or len(furniture)>80:raise ValueError('공간별 가구는 최대 80종까지 입력할 수 있습니다.')
            furniture_ids=set()
            for item in furniture:
                if not isinstance(item,dict):raise ValueError('가구 입력 형식이 올바르지 않습니다.')
                identifier=item.get('assetId');asset=self.assets.get(identifier) if isinstance(identifier,str) else None
                if not asset or not asset['physical'] or asset.get('productId') or identifier in furniture_ids:raise ValueError('등록된 공용 가구를 선택해 주세요.')
                furniture_ids.add(identifier);quantity=item.get('quantity')
                if quantity in ('',None):continue
                if type(quantity) is not int or not 1<=quantity<=30:raise ValueError('가구 수량은 1~30개여야 합니다.')
        return value


class SpatialStore:
    def __init__(self, filename, library):
        self.filename=Path(filename);self.filename.parent.mkdir(parents=True,exist_ok=True)
        self.library=library;self.lock=threading.Lock()
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS scenes (owner TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,scene TEXT NOT NULL,view TEXT NOT NULL,revision INTEGER NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,example INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,id))')
            columns={row['name'] for row in db.execute('PRAGMA table_info(scenes)')}
            if 'form' not in columns:db.execute('ALTER TABLE scenes ADD COLUMN form TEXT')
            if 'status' not in columns:db.execute("ALTER TABLE scenes ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'")
            if 'scene_form_key' not in columns:db.execute('ALTER TABLE scenes ADD COLUMN scene_form_key TEXT')
            db.execute('CREATE INDEX IF NOT EXISTS scenes_history_page ON scenes(owner,deleted,updated_at DESC,id DESC)')
        self.seed_admin()

    def connect(self):
        db=sqlite3.connect(self.filename,timeout=15);db.row_factory=sqlite3.Row;return db

    def seed_admin(self):
        now=int(time.time()*1000)
        with self.connect() as db:
            for i,e in enumerate(self.library.examples):
                self.library.validate(e['scene'])
                db.execute('INSERT OR IGNORE INTO scenes(owner,id,title,scene,view,revision,created_at,updated_at,example) VALUES (?,?,?,?,?,1,?,?,1)',
                           ('admin',e['id'],e['title'],json.dumps(e['scene'],ensure_ascii=False),e['view'],now-i*1000,now-i*1000))
                # Upgrade untouched requested examples; user edits/deletions are retained.
                db.execute('UPDATE scenes SET scene=? WHERE owner=? AND id=? AND example=1 AND revision=1 AND deleted=0',
                           (json.dumps(e['scene'],ensure_ascii=False),'admin',e['id']))

    def restore_template_drafts(self, db, owner, identifiers=None):
        # Older template launches saved only the form. Materialize the existing
        # template once, retaining the person's inputs, ID and edit revision.
        query="SELECT id,form FROM scenes WHERE owner=? AND deleted=0 AND scene='null' AND form IS NOT NULL"
        args=[owner]
        if identifiers is not None:
            if not identifiers:return
            query+=' AND id IN ('+','.join('?' for _ in identifiers)+')';args.extend(identifiers)
        rows=db.execute(query,args).fetchall()
        for row in rows:
            form=json.loads(row['form']);template_id=form.get('templateId')
            original=self.library.scenes.get(template_id) if isinstance(template_id,str) else None
            if original is None:continue
            scene=copy.deepcopy(original)
            db.execute("UPDATE scenes SET scene=?,status='ready',scene_form_key=NULL WHERE owner=? AND id=? AND scene='null'",(json.dumps(scene,ensure_ascii=False,allow_nan=False),owner,row['id']))

    @staticmethod
    def decode(row, detail=False):
        out={k:row[k] for k in ('id','title','view','revision','created_at','updated_at','example')}
        scene=json.loads(row['scene']);form=json.loads(row['form']) if row['form'] else None
        out['status']='ready' if scene else 'draft';out['form']=form
        out['generatedFormKey']=(scene or {}).get('formKey') or row['scene_form_key']
        if scene:out.update(industry=scene['industry'],scope=scene['scope'],rooms=len(scene['rooms']),products=sum(o['assetId'].startswith('product:') for o in scene['objects']))
        else:out.update(industry=(form or {}).get('industry',''),scope='draft',rooms=len((form or {}).get('rooms',[])),products=sum(len(r.get('products',[])) for r in (form or {}).get('rooms',[])))
        if detail:out['scene']=scene
        else:out['preview']=scene
        preview=Path(__file__).resolve().parents[1]/'web/public/assets/spatial-examples'/f"{row['id']}.webp"
        if row['example'] and row['revision']==1 and preview.is_file():out['thumbnail']='/assets/spatial-examples/'+row['id']+'.webp'
        return out

    def list(self,owner):
        with self.lock,self.connect() as db:
            self.restore_template_drafts(db,owner)
            return [self.decode(row) for row in db.execute('SELECT * FROM scenes WHERE owner=? AND deleted=0 ORDER BY updated_at DESC LIMIT 200',(owner,))]

    def list_page(self,owner,page=1,page_size=12):
        if type(page) is not int or page<1 or type(page_size) is not int or not 1<=page_size<=48:
            raise ValueError('페이지와 표시 개수가 올바르지 않습니다.')
        with self.lock,self.connect() as db:
            db.execute('BEGIN')
            total=db.execute('SELECT COUNT(*) FROM scenes WHERE owner=? AND deleted=0',(owner,)).fetchone()[0]
            total_pages=math.ceil(total/page_size);page=min(page,total_pages or 1)
            query='SELECT * FROM scenes WHERE owner=? AND deleted=0 ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?'
            args=(owner,page_size,(page-1)*page_size)
            rows=db.execute(query,args).fetchall()
            self.restore_template_drafts(db,owner,[row['id'] for row in rows])
            # Migration may materialize a template draft, but only for this page.
            rows=db.execute(query,args).fetchall()
            items=[self.decode(row) for row in rows]
        return {'items':items,'total':total,'page':page,'page_size':page_size,'total_pages':total_pages}

    def get(self,owner,identifier):
        with self.lock,self.connect() as db:
            self.restore_template_drafts(db,owner,[identifier])
            row=db.execute('SELECT * FROM scenes WHERE owner=? AND id=? AND deleted=0',(owner,identifier)).fetchone()
        if not row:raise HTTPException(404,'조감도 히스토리를 찾지 못했습니다.')
        return self.decode(row,True)

    def save(self,owner,body,identifier=None):
        try:self.library.validate(body.get('scene'))
        except (ValueError,TypeError,KeyError) as exc:raise HTTPException(422,str(exc)) from exc
        try:form=self.library.validate_form(body['form']) if 'form' in body else None
        except ValueError as exc:raise HTTPException(422,str(exc)) from exc
        view=body.get('view','3d')
        if view not in ('2d','3d'):raise HTTPException(422,'보기 모드가 올바르지 않습니다.')
        now=int(time.time()*1000);scene=body['scene'];payload=json.dumps(scene,ensure_ascii=False,allow_nan=False)
        with self.lock,self.connect() as db:
            if identifier:
                row=db.execute('SELECT * FROM scenes WHERE owner=? AND id=? AND deleted=0',(owner,identifier)).fetchone()
                if not row:raise HTTPException(404,'조감도 히스토리를 찾지 못했습니다.')
                if body.get('revision')!=row['revision']:raise HTTPException(409,'다른 화면에서 수정되었습니다. 히스토리에서 다시 열어 주세요.')
                db.execute("UPDATE scenes SET title=?,scene=?,view=?,form=?,scene_form_key=?,status='ready',revision=revision+1,updated_at=? WHERE owner=? AND id=?",(scene['title'],payload,view,json.dumps(form,ensure_ascii=False) if form is not None else row['form'],scene.get('formKey') or row['scene_form_key'],now,owner,identifier))
            else:
                identifier='sp-'+secrets.token_hex(12)
                db.execute("INSERT INTO scenes(owner,id,title,scene,view,revision,created_at,updated_at,form,status) VALUES (?,?,?,?,?,1,?,?,?,'ready')",(owner,identifier,scene['title'],payload,view,now,now,json.dumps(form,ensure_ascii=False) if form is not None else None))
        return self.get(owner,identifier)

    def create_draft(self,owner,body):
        try:form=self.library.validate_form(body.get('form'))
        except ValueError as exc:raise HTTPException(422,str(exc)) from exc
        identifier='sp-'+secrets.token_hex(12);now=int(time.time()*1000);view=body.get('view','3d')
        if view not in ('2d','3d'):raise HTTPException(422,'보기 모드가 올바르지 않습니다.')
        original=self.library.scenes.get(form.get('templateId'))
        scene=copy.deepcopy(original) if original is not None else None
        with self.connect() as db:
            db.execute("INSERT INTO scenes(owner,id,title,scene,view,revision,created_at,updated_at,form,status) VALUES (?,?,?,?,?,1,?,?,?,?)",(owner,identifier,form.get('title','').strip() or (scene or {}).get('title') or '새 조감도',json.dumps(scene,ensure_ascii=False,allow_nan=False),view,now,now,json.dumps(form,ensure_ascii=False),'ready' if scene else 'draft'))
        return self.get(owner,identifier)

    def save_form(self,owner,identifier,body):
        try:form=self.library.validate_form(body.get('form'))
        except ValueError as exc:raise HTTPException(422,str(exc)) from exc
        view=body.get('view','3d')
        if view not in ('2d','3d'):raise HTTPException(422,'보기 모드가 올바르지 않습니다.')
        with self.lock,self.connect() as db:
            row=db.execute('SELECT * FROM scenes WHERE owner=? AND id=? AND deleted=0',(owner,identifier)).fetchone()
            if not row:raise HTTPException(404,'조감도를 찾지 못했습니다.')
            if body.get('revision')!=row['revision']:raise HTTPException(409,'다른 화면에서 수정되었습니다. 조감도를 다시 열어 주세요.')
            baseline=body.get('sceneFormKey');baseline=row['scene_form_key'] or (baseline if isinstance(baseline,str) and re.fullmatch('[a-f0-9]{8}',baseline) else None)
            db.execute('UPDATE scenes SET title=?,form=?,scene_form_key=?,view=?,revision=revision+1,updated_at=? WHERE owner=? AND id=?',(form.get('title','').strip() or row['title'],json.dumps(form,ensure_ascii=False),baseline,view,int(time.time()*1000),owner,identifier))
        return self.get(owner,identifier)

    def delete(self,owner,identifier):
        with self.connect() as db:
            cursor=db.execute('UPDATE scenes SET deleted=1,revision=revision+1 WHERE owner=? AND id=? AND deleted=0',(owner,identifier))
            if not cursor.rowcount:raise HTTPException(404,'조감도 히스토리를 찾지 못했습니다.')


def owner_for(request):
    auth=request.app.state.auth
    if not auth.config.enabled:return 'local-dev'
    identity=auth.read_token(request.cookies.get(auth.config.cookie_name))
    if not identity:raise HTTPException(401,'로그인이 필요합니다.')
    return identity['u']


def build_router():
    router=APIRouter(prefix='/api/spatial',tags=['spatial'])
    @router.get('/library')
    def library(request:Request,response:Response):
        response.headers['Cache-Control']='private, max-age=60'
        return request.app.state.spatial_library.library

    @router.get('/library/{revision}')
    def library_revision(revision:str,request:Request,response:Response):
        try:result=request.app.state.spatial_library.revision(revision)
        except ValueError as exc:raise HTTPException(404,str(exc)) from exc
        response.headers['Cache-Control']='private, max-age=31536000, immutable'
        return result

    @router.get('/templates/{identifier}')
    def template(identifier:str,request:Request):
        scene=request.app.state.spatial_library.scenes.get(identifier)
        if scene is None:raise HTTPException(404,'공간 템플릿을 찾지 못했습니다.')
        return {'scene':scene}

    @router.get('/history')
    def history(request:Request,response:Response,page:int=Query(1,ge=1),page_size:int=Query(12,ge=1,le=48)):
        response.headers['Cache-Control']='no-store'
        return request.app.state.spatial_store.list_page(owner_for(request),page,page_size)

    @router.post('/drafts',status_code=201)
    def create_draft(request:Request,body:dict=Body(default={})):
        return request.app.state.spatial_store.create_draft(owner_for(request),body)

    @router.put('/drafts/{identifier}')
    def save_draft(identifier:str,request:Request,body:dict=Body(...)):
        return request.app.state.spatial_store.save_form(owner_for(request),identifier,body)

    @router.get('/history/{identifier}')
    def get_history(identifier:str,request:Request,response:Response):
        response.headers['Cache-Control']='no-store'
        return request.app.state.spatial_store.get(owner_for(request),identifier)

    @router.post('/history',status_code=201)
    def save_history(request:Request,body:dict=Body(...)):
        return request.app.state.spatial_store.save(owner_for(request),body)

    @router.put('/history/{identifier}')
    def update_history(identifier:str,request:Request,body:dict=Body(...)):
        return request.app.state.spatial_store.save(owner_for(request),body,identifier)

    @router.delete('/history/{identifier}',status_code=204)
    def delete_history(identifier:str,request:Request):
        request.app.state.spatial_store.delete(owner_for(request),identifier)
        return Response(status_code=204)

    @router.post('/layout-description')
    def layout_description(request:Request,body:dict=Body(...)):
        from .spatial_descriptions import description_context,generate_description
        from .poc.settings import get_settings
        from .poc.provider import get_provider
        owner_for(request)
        scene=body.get('scene');lib=request.app.state.spatial_library
        try:lib.validate(scene)
        except (ValueError,TypeError) as exc:raise HTTPException(422,str(exc)) from exc
        assets={a['id']:a for a in lib.revision(scene.get('assetRevision'))['assets']}
        context=description_context(scene,assets,body.get('targetId'),getattr(request.app.state,'products',None))
        provider,_=get_provider(get_settings())
        if provider is None:raise HTTPException(503,'LLM 연결 설정을 확인해 주세요.')
        return generate_description(context,provider)

    @router.post('/edit')
    def edit(request:Request,body:dict=Body(...)):
        from .poc.settings import get_settings
        from .poc.provider import get_provider,ProviderError
        prompt=body.get('prompt');scene=body.get('scene');lib=request.app.state.spatial_library
        if not isinstance(prompt,str) or not 3<=len(prompt.strip())<=6000:raise HTTPException(422,'조작할 내용을 3~6,000자로 입력해 주세요.')
        try:lib.validate(scene)
        except (ValueError,TypeError) as exc:raise HTTPException(422,str(exc)) from exc
        assets={a['id']:a for a in lib.revision(scene.get('assetRevision'))['assets']}
        objects={o['id']:o for o in scene['objects']};rooms={r['id']:r for r in scene['rooms']}
        def reference(value,items):return isinstance(value,str) and value in items
        mentions=body.get('mentions',[])
        if not isinstance(mentions,list) or len(mentions)>100 or any(not isinstance(m,dict) or m.get('kind') not in ('object','asset') or not isinstance(m.get('label'),str) or len(m['label'])>300 or not reference(m.get('id'),objects if m.get('kind')=='object' else assets) for m in mentions):raise HTTPException(422,'@ 오브젝트 참조가 올바르지 않습니다.')
        focus=body.get('roomId')
        if focus is not None and not reference(focus,rooms):raise HTTPException(422,'편집할 공간을 찾지 못했습니다.')
        terms=re.findall(r'[\w-]+',prompt.lower())
        mentioned={m['id'] for m in mentions if m['kind']=='asset'}
        def relevance(a):
            text=' '.join([a['name'],a.get('model',''),a.get('description',''),a.get('category',''),*a.get('spaces',[]),*a.get('keywords',[]),*a.get('variants',[])]).lower()
            return (10000 if a['id'] in mentioned else 0)+(100 if a.get('model') and a['model'].lower() in prompt.lower() else 0)+sum(5 for t in terms if len(t)>1 and t in text)+(2 if scene['industry'] in a.get('industries',[]) else 0)
        candidates=[a for a in assets.values() if a.get('physical') and a.get('catalogVisible') is not False and not a.get('productId')]+sorted((a for a in assets.values() if a.get('physical') and a.get('catalogVisible') is not False and a.get('productId')),key=relevance,reverse=True)[:180]
        patch={'type':'OBJECT','properties':{k:{'type':'NUMBER'} for k in ('x','z','elevation','rotation')}}
        schema={'type':'OBJECT','properties':{'explanation':{'type':'STRING'},'operations':{'type':'ARRAY','items':{'type':'OBJECT','properties':{
            # Large identifier enums make Gemini reject the schema with HTTP 400.
            # IDs stay in the prompt and are checked against the frozen scene below.
            'type':{'type':'STRING','enum':['move','add','remove','style']},'objectId':{'type':'STRING'},'assetId':{'type':'STRING'},'roomId':{'type':'STRING'},'quantity':{'type':'INTEGER'},'patch':patch,'style':{'type':'STRING','enum':list(STYLES)}},'required':['type']}}},'required':['explanation','operations']}
        provider,reason=get_provider(get_settings())
        if provider is None:raise HTTPException(503,'LLM 연결 설정을 확인해 주세요.')
        try:
            result=provider.generate_json(stage='spatial:edit',system='현재 공간 장면을 편집하세요. 요청한 변경만 operations로 반환하고 장면을 새로 만들지 마세요. @ references의 kind=object는 특정 인스턴스, kind=asset는 새로 추가할 카탈로그 오브젝트입니다. 사람 연출은 사람과 가구·도구가 묶인 한 오브젝트이며 quantity는 묶음 개수입니다. 내부 사람이나 가구를 분리해서 조작하지 마세요. 같은 제품이 여러 개 있어도 지정한 인스턴스만 조작하세요. move.patch는 전체 맵의 절대 미터 좌표 x,z 및 하단 설치 높이 elevation, 절대 회전각 rotation(도)입니다. 왼쪽은 -X, 오른쪽은 +X, 위/뒤는 -Z, 아래/앞은 +Z이며 상대 이동은 기존 값에 더하세요. 현재 공간 좌표계를 사용하고 카메라 화면 방향으로 해석하지 마세요. add는 등록된 assetId와 roomId, 추가 개수 quantity(1~30)를 지정합니다. quantity를 생략하면 한 개를 추가합니다. add.patch는 정확한 좌표를 요청한 경우에만 지정하고, 일반적인 추가는 자동 안전 배치에 맡기세요. 기존에 없는 제품도 후보에서 찾아 add로 추가하세요. 가구를 이동하면 받침 위 제품과 연결 의자가 함께 이동하므로 중복 이동하지 마세요. remove는 objectId, style은 style만 필요합니다. 경계·출입문·가구 충돌을 피하고 등록된 ID만 쓰세요. 모호하거나 후보에 없는 제품 요청을 임의 제품으로 대체하지 말고 operations=[]와 확인이 필요한 이유를 반환하세요. 변경 설명은 한국어로 작성하세요.',
                user=json.dumps({'request':prompt,'references':mentions,'focusedRoomId':focus,'scene':{'title':scene['title'],'style':scene['style'],'rooms':scene['rooms'],'objects':[{**o,'name':assets[o['assetId']]['name'],'size':assets[o['assetId']]['size']} for o in scene['objects']]},
                    'availableAssets':[{'id':a['id'],'name':a['name'],'model':a.get('model'),'size':a['size'],**({'composition':a['composition'],'roles':a.get('roles',[])} if a.get('assetGroup')=='people' else {})} for a in candidates],
                    'geometryFeedback':str(body.get('feedback',''))[:1000]},ensure_ascii=False),schema=schema,max_output_tokens=4096,max_attempts=2,cache_allowed=False)
        except ProviderError as exc:raise HTTPException(502,exc.message or '오브젝트 편집을 계획하지 못했습니다.') from exc
        out=result.data
        if not isinstance(out,dict) or not isinstance(out.get('explanation'),str) or not isinstance(out.get('operations'),list) or len(out['operations'])>100:raise HTTPException(502,'AI 편집 응답 형식이 올바르지 않습니다.')
        for op in out['operations']:
            if not isinstance(op,dict) or op.get('type') not in ('move','add','remove','style'):raise HTTPException(502,'지원하지 않는 AI 편집 명령입니다.')
            kind=op['type']
            if kind=='add':op.setdefault('quantity',1)
            if kind in ('move','remove') and not reference(op.get('objectId'),objects):raise HTTPException(502,'편집할 오브젝트 참조가 올바르지 않습니다.')
            if kind=='add' and (not reference(op.get('assetId'),assets) or not assets[op['assetId']].get('physical') or not reference(op.get('roomId'),rooms) or type(op.get('quantity')) is not int or not 1<=op['quantity']<=30):raise HTTPException(502,'추가할 제품·공간·수량이 올바르지 않습니다.')
            if kind=='style' and op.get('style') not in STYLES:raise HTTPException(502,'공간 스타일이 올바르지 않습니다.')
            if kind=='move' or 'patch' in op:
                p=op.get('patch')
                if not isinstance(p,dict) or not p or any(k not in ('x','z','elevation','rotation') or not isinstance(v,(int,float)) or isinstance(v,bool) or not math.isfinite(v) for k,v in p.items()):raise HTTPException(502,'편집 좌표·회전 값이 올바르지 않습니다.')
        return {'plan':out,'model':result.model,'mode':'real','source':'llm'}

    @router.post('/plan')
    def plan(request:Request,body:dict=Body(...)):
        from .poc.settings import get_settings
        from .poc.provider import get_provider,ProviderError
        prompt=body.get('prompt','');industry=body.get('industry','OF')
        if not isinstance(prompt,str) or not 3<=len(prompt.strip())<=6000:raise HTTPException(422,'공간 요구사항을 3~6,000자로 입력해 주세요.')
        lib=request.app.state.spatial_library
        if industry not in {i['code'] for i in lib.library['industries']}:raise HTTPException(422,'등록된 업종을 선택해 주세요.')
        choices=[t for t in lib.library['templates'] if t['industry']==industry and t['variant']=='standard' and not t['id'].startswith('case-')]
        candidates=[a for a in lib.library['assets'] if a.get('productId') and a['physical']]
        terms=prompt.lower().split()
        def relevance(a):
            text=(a['name']+' '+a['model']).lower()
            return (100 if a['model'].lower() in prompt.lower() else 0)+sum(3 for t in terms if len(t)>1 and t in text)+(2 if industry in a.get('industries',[]) else 0)+(8 if not a['productId'].startswith(('sg_','ec_')) else 0)
        products=[{'id':a['productId'],'name':a['name'],'model':a['model'],'size':a['size']} for a in sorted(candidates,key=relevance,reverse=True)[:160]]
        furniture=[{'assetId':a['id'],'name':a['name'],'size':a['size'],'category':a.get('category'),'spaces':a.get('spaces',[]),'description':a.get('description',''),**({'composition':a['composition'],'roles':a.get('roles',[])} if a.get('assetGroup')=='people' else {})} for a in lib.library['assets'] if not a.get('productId') and a.get('physical') and a.get('catalogVisible') is not False]
        schema={'type':'OBJECT','properties':{
            'title':{'type':'STRING'},'templateId':{'type':'STRING','enum':[t['id'] for t in choices]},
            'style':{'type':'STRING','enum':list(STYLES)},'width':{'type':'NUMBER'},'depth':{'type':'NUMBER'},'explanation':{'type':'STRING'},
            'roomKeys':{'type':'ARRAY','items':{'type':'STRING'}},
            'roomSettings':{'type':'ARRAY','items':{'type':'OBJECT','properties':{'roomId':{'type':'STRING'},'capacity':{'type':'INTEGER'}},'required':['roomId','capacity']}},
            'furniture':{'type':'ARRAY','items':{'type':'OBJECT','properties':{'assetId':{'type':'STRING'},'roomId':{'type':'STRING'},'quantity':{'type':'INTEGER'}},'required':['assetId','roomId','quantity']}},
            'placements':{'type':'ARRAY','items':{'type':'OBJECT','properties':{'productId':{'type':'STRING'},'roomId':{'type':'STRING'},'placementMode':{'type':'STRING','enum':['auto','exact']},'quantity':{'type':'INTEGER'},'x':{'type':'NUMBER'},'z':{'type':'NUMBER'},'elevation':{'type':'NUMBER'},'rotation':{'type':'NUMBER'}},'required':['productId','roomId','placementMode']}},
        },'required':['title','templateId','style','width','depth','explanation','roomKeys','placements','roomSettings','furniture']}
        provider,reason=get_provider(get_settings())
        if provider is None:raise HTTPException(503,'LLM 연결 설정을 확인해 주세요.')
        try:
            result=provider.generate_json(stage='spatial:plan',system='당신은 공간·가구·삼성 제품 배치 설계자입니다. 입력 요구를 등록된 재사용 공간 템플릿과 오브젝트로 계획하세요. 이미지나 코드를 생성하지 않습니다. 전체/개별 범위와 공간 스타일, 업무 동선, 제품 설치 위치를 고려하세요. 등록된 ID만 사용하세요. 기본 제품·가구는 유지되므로 placements와 furniture에는 필요한 항목만 넣으세요. 사람 연출은 사람과 가구·도구가 묶인 한 오브젝트이며 quantity는 묶음 개수입니다. quantity는 기본을 포함한 목표 총수량입니다. 기본 1개와 동일한 항목을 중복 추가하지 않습니다. 좌석 수 요구는 roomSettings.capacity로 지정하며 office/study/classroom 1~60석, meeting 2~14석을 지원합니다. 좌석이 많으면 전체 면적을 충분히 확대하세요. 격자는 최대3열, 행수=ceil(선택공간수/3), 복도1.8m입니다. 업무석은 가로1.85m*세로2.25m(의자 뒤 동선 포함), 여백1.5m가 필요합니다. 30석 업무실을 포함한 전체5개공간이면 가로40m 세로27m 이상 권장. placements의 x,z는 공간 내부 미터 좌표이며 정확히 요청된 위치에만 사용하고 그 외에는 생략해 자동 충돌검사를 받으세요. elevation은 바닥에서 제품 하단 높이입니다. roomKeys는 사용할 템플릿 공간 키만 선택하세요. 전체 구성은 원래 공간 수를 유지하세요. 실측 자료가 없으므로 개념 설계임을 설명하세요. 최대 가로/세로150m. 유효한 JSON만 반환하세요.',
                user=json.dumps({'request':prompt,'industry':industry,'selectedTemplate':body.get('templateId'),'placementPolicy':'사용자가 숫자 좌표를 직접 제시하지 않았다면 placementMode=auto로 정하고 x,z,elevation,rotation을 생략하세요. exact는 사용자가 직접 지정한 미터 좌표에만 사용하며 quantity=1입니다. 기본 제품과 같은 항목의 quantity=1은 추가 배치가 아니라 현행 유지입니다.',
                  'geometryFeedback':str(body.get('feedback',''))[:1000],'previousPlan':body.get('previousPlan') if isinstance(body.get('previousPlan'),dict) and len(json.dumps(body['previousPlan']))<20000 else None,
                  'templates':[{'id':t['id'],'name':t['name'],'width':t['width'],'depth':t['depth'],'rooms':t['rooms']} for t in choices],'products':products,'furniture':furniture},ensure_ascii=False),schema=schema,max_output_tokens=4096,max_attempts=2,cache_allowed=False)
        except ProviderError as exc:raise HTTPException(502,exc.message or '공간 설계를 생성하지 못했습니다. 다시 시도해 주세요.') from exc
        out=result.data
        if not isinstance(out,dict) or out.get('templateId') not in {t['id'] for t in choices} or out.get('style') not in STYLES:raise HTTPException(502,'LLM이 유효하지 않은 공간 템플릿을 반환했습니다.')
        chosen=lib.templates[out['templateId']];room_keys={r['key'] for r in chosen['rooms']}
        keys=out.get('roomKeys')
        if not isinstance(keys,list) or not keys or any(k not in room_keys for k in keys):raise HTTPException(502,'LLM의 공간 참조가 올바르지 않습니다.')
        if not all(isinstance(out.get(k),(int,float)) and not isinstance(out[k],bool) and math.isfinite(out[k]) and 4<=out[k]<=150 for k in ('width','depth')):raise HTTPException(502,'LLM의 공간 치수가 올바르지 않습니다.')
        for field in ('placements','furniture','roomSettings'):
            if not isinstance(out.get(field,[]),list) or len(out.get(field,[]))>100 or any(not isinstance(p,dict) for p in out.get(field,[])):raise HTTPException(502,'LLM의 배치 목록 형식이 올바르지 않습니다.')
        for p in out.get('placements',[]):
            if p.get('roomId') not in keys or not lib.assets.get('product:'+str(p.get('productId')) ,{}).get('physical'):raise HTTPException(502,'LLM의 제품 배치 참조가 올바르지 않습니다.')
            if 'quantity' in p and (type(p['quantity']) is not int or not 1<=p['quantity']<=30):raise HTTPException(502,'LLM의 제품 수량이 올바르지 않습니다.')
            if p.get('placementMode') not in ('auto','exact'):raise HTTPException(502,'LLM의 배치 방식이 올바르지 않습니다.')
            if p.get('placementMode')=='exact' and (p.get('quantity',1)!=1 or 'x' not in p or 'z' not in p):raise HTTPException(502,'LLM의 좌표 지정 배치가 올바르지 않습니다.')
            if any(k in p and (not isinstance(p[k],(int,float)) or isinstance(p[k],bool) or not math.isfinite(p[k])) for k in ('x','z','elevation','rotation')):raise HTTPException(502,'LLM의 배치 좌표가 올바르지 않습니다.')
        for p in out.get('furniture',[]):
            if p.get('roomId') not in keys or p.get('assetId') not in {a['assetId'] for a in furniture} or type(p.get('quantity')) is not int or not 1<=p['quantity']<=30:raise HTTPException(502,'LLM의 가구 참조·수량이 올바르지 않습니다.')
        for setting in out.get('roomSettings',[]):
            if setting.get('roomId') not in keys or type(setting.get('capacity')) is not int or not 1<=setting['capacity']<=60:raise HTTPException(502,'LLM의 좌석 계획이 올바르지 않습니다.')
        out['title']=str(out.get('title') or chosen['name'])[:150]
        return {'plan':out,'model':result.model,'mode':'real','source':'llm'}
    return router
