from __future__ import annotations
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .products import ProductRepository

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'app/data'
WEB = ROOT / 'app/web/dist'
sys.path.insert(0,str(ROOT / 'app/scripts'))
from prepare_data import prepare


@asynccontextmanager
async def lifespan(app):
    app.state.products = ProductRepository(prepare())
    yield


app = FastAPI(title='Winmate v2',lifespan=lifespan)


@app.get('/api/health')
def health():
    return {'ok':True,'stage':1,'llm_mode':'dummy','products':len(app.state.products.list())}


@app.get('/api/bootstrap')
def bootstrap():
    return {'catalog':json.loads((DATA/'catalog.json').read_text()),'images':json.loads((DATA/'images.json').read_text()),'products':app.state.products.bootstrap()}


@app.get('/api/products')
def products(q: str = '', offset: int = Query(0,ge=0), limit: int | None = Query(None,ge=1,le=1068)):
    return {'items':app.state.products.list(q,offset,limit),'total':1068}


@app.get('/api/products/{identifier}')
def product(identifier: str):
    value = app.state.products.get(identifier)
    if value is None: raise HTTPException(404,'제품을 찾지 못했습니다.')
    return value


@app.get('/api/product-packs/{pack}')
def detail_pack(pack: int):
    result = app.state.products.detail_pack(pack)
    if not result['items']: raise HTTPException(404,'제품 상세 묶음을 찾지 못했습니다.')
    return result


@app.post('/api/llm')
def llm(body: dict):
    return {'mode':'dummy','error':'sampling_disabled','message':'AI 더미 모드: 기존 기본 규칙으로 처리합니다.'}


app.mount('/img',StaticFiles(directory=DATA/'static/img'),name='images')
app.mount('/lib',StaticFiles(directory=DATA/'static/lib'),name='document-libraries')
# Unmodified, frozen reference. It has no local platform adapter, exactly as exported.
app.mount('/reference',StaticFiles(directory=ROOT/'reference/live',html=True),name='artifact-reference')
app.mount('/assets',StaticFiles(directory=WEB/'assets',check_dir=False),name='web-assets')
app.mount('/fonts',StaticFiles(directory=ROOT/'app/web/public/fonts',check_dir=False),name='fonts')


@app.get('/favicon.ico')
def favicon():
    return Response(status_code=204)


@app.get('/migration.html')
def migration():
    return FileResponse(WEB/'migration.html')


@app.get('/migration-export.js')
def migration_export():
    return FileResponse(WEB/'migration-export.js',media_type='text/javascript')


@app.get('/')
def index():
    if not (WEB/'index.html').exists(): raise HTTPException(503,'웹 빌드가 없습니다. app/web에서 npm run build를 실행하세요.')
    return FileResponse(WEB/'index.html')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('app.api.main:app',host='127.0.0.1',port=int(os.environ.get('WINMATE_API_PORT','8788')))
