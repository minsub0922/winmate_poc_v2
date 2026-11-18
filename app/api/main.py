from __future__ import annotations
from contextlib import asynccontextmanager
import json
import os
import sqlite3
from pathlib import Path
import sys

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware
from starlette.concurrency import run_in_threadpool

from .products import ProductRepository
from .catalog_metrics import DailyCatalogMetrics, collect_counts
from .review_example_layouts import repair_shared_examples
from .spatial import SpatialLibrary, SpatialStore, build_router as spatial_router
from .spatial_previews import SpatialPreviews, load_renderer_config, build_router as spatial_previews_router
from .image_cache import build_cache
from .account_data import AccountDataStore, build_router as account_data_router
from .guide_agent import router as guide_router
from .auth import bootstrap_default_admin, integrate_app
from .inspect import InspectMiddleware, current as inspected
from .my_templates import TemplateStore, build_router as my_templates_router
from .customer_voice import CustomerVoiceStore, build_router as customer_voice_router
from .storyboards import StoryboardStore, build_router as storyboards_router, actor_for, share_cookie
from .poc.routes import router as poc_router, initialize as initialize_poc, capabilities as poc_capabilities
from .poc import service as poc_service
from . import ops_bridge
from . import layout_presets, layout_flows
from . import layout_library
from . import resource_switches

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'app/data'
WEB = Path(os.environ.get('WINMATE_WEB_DIST', ROOT / 'app/web/dist')).resolve()
sys.path.insert(0,str(ROOT / 'app/scripts'))
from prepare_data import prepare


@asynccontextmanager
async def lifespan(app):
    # No login account yet → admin / WINMATE_ADMIN_PASSWORD (root .env). Existing accounts are left alone.
    bootstrap_default_admin(app.state.auth)
    account_store = getattr(getattr(app.state.auth.accounts, 'ops', None), 'path', None)
    template_db = os.environ.get('WINMATE_TEMPLATE_DB') or account_store or DATA / 'runtime/my_templates.sqlite'
    app.state.my_templates = TemplateStore(Path(template_db))
    app.state.customer_voice = CustomerVoiceStore(app.state.my_templates)
    # Proposals, reviews, simulations, favourites, uploads … (the browser keeps only a cache of these).
    app.state.account_data = AccountDataStore(Path(os.environ.get('WINMATE_ACCOUNT_DATA_DB') or DATA / 'runtime/account_data.sqlite'))
    # Server jobs (자동 구성 …) are recorded on disk next to the account data, so a browser that comes back — after leaving,
    # reloading or a server restart — finds the finished result by id instead of running the work again.
    poc_service.JOBS.use_archive(Path(os.environ.get('WINMATE_JOB_DB') or Path(app.state.account_data.path).parent / 'jobs.sqlite'))
    poc_service.STEPS.use_path(Path(os.environ.get('WINMATE_JOB_DB') or Path(app.state.account_data.path).parent / 'jobs.sqlite'))
    app.state.spatial_library = SpatialLibrary()
    app.state.spatial_store = SpatialStore(Path(os.environ.get('WINMATE_SPATIAL_DB', DATA / 'runtime/spatial.sqlite')), app.state.spatial_library)
    # Heavy 3D 조감도 images: server rendering + bounded Redis cache (WINMATE_CACHE_* / WINMATE_SPATIAL_* in the root .env).
    app.state.image_cache = build_cache()
    await run_in_threadpool(app.state.image_cache.start)
    app.state.spatial_previews = SpatialPreviews(app.state.spatial_library, app.state.image_cache, load_renderer_config())
    app.state.spatial_previews.start_prewarm()
    app.state.storyboards = StoryboardStore(Path(os.environ.get('WINMATE_STORYBOARD_DIR', DATA / 'runtime/storyboards')))
    repair_shared_examples(app.state.storyboards)
    app.state.products = ProductRepository(prepare())
    app.state.catalog_metrics = DailyCatalogMetrics(DATA / 'runtime/catalog_metrics.sqlite', lambda: collect_counts(app.state.products, DATA))
    initialize_poc()
    # Optional: Langfuse trace export and the Metabase snapshot (ops/). Off unless configured in the root .env.
    bridge = ops_bridge.start(app)
    try:
        yield
    finally:
        bridge.stop()
        await app.state.spatial_previews.stop()
        app.state.image_cache.close()


app = FastAPI(title='Winmate v2',lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)
app.include_router(poc_router)
app.include_router(guide_router)
app.include_router(storyboards_router())
app.include_router(spatial_router())
app.include_router(spatial_previews_router())
app.include_router(account_data_router())
app.include_router(my_templates_router())
app.include_router(customer_voice_router())
integrate_app(app)
app.add_middleware(InspectMiddleware)  # 관리자 읽기 전용 열람 (app/api/inspect.py) — outermost, so auth sees the inspected user


@app.get('/api/health')
def health():
    capabilities=poc_capabilities()
    cache=getattr(app.state,'image_cache',None)
    return {'ok':True,'stage':3,'llm_mode':capabilities['settings']['mode'],'products':len(app.state.products.list()),'knowledge':capabilities['knowledge'],'llm':capabilities.get('connection'),'gemini':capabilities.get('connection'),
            'image_cache':cache.kind if cache else None}


def bootstrap_payload(request: Request):
    auth = request.app.state.auth
    identity = auth.read_token(request.cookies.get(auth.config.cookie_name)) if auth.config.enabled else None
    username = identity['u'] if identity else None
    user = {'username':username,'auth_enabled':auth.config.enabled,'guest':bool(auth.config.enabled and not identity),
            'template_sync': bool(username)}
    if auth.accounts is not None:
        user.update({'role':identity.get('role','member') if identity else 'guest','tracking_enabled':True,
                     'storage_legacy_owner':auth.accounts.legacy_username})
    if username == 'admin':
        user['sample_history'] = {'version':1,'scenarios':['bs01','bs_std_ht_large','bs03']}
    if (inspection := inspected()) is not None:
        user['inspect'] = {'by': inspection['inspect']['by'], 'expires_at': inspection['inspect']['exp']}
    subscriptions = DATA/'subscriptions.json'  # 구독(subscription) DSS 레지스트리 — B2B 삼성 AI 구독(proddb/build/subs/build.py)
    return {'catalog':json.loads((DATA/'catalog.json').read_text()),'images':json.loads((DATA/'images.json').read_text()),'products':request.app.state.products.bootstrap(),
            'subscriptions':json.loads(subscriptions.read_text()) if subscriptions.is_file() else None,'capabilities':poc_capabilities(),'user':user,
            'layout_presets':layout_presets.public(), 'layout_library':layout_library.public(),
            # 관리자 데이터 소스에서 끈 자원 — 새로 고르는 목록 · 검색 · 추천에서 뺀다(services/catalog.js · api/resource-switches.js)
            'resource_switches':resource_switches.public(), 'image_weights':layout_flows.image_weights()}


@app.get('/api/image-search')
def image_search_policy(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return layout_flows.image_weights()


@app.get('/api/layout-library')
def live_layout_library(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return layout_library.public()


@app.get('/api/layout-flows')
def layout_flow_contracts(response: Response, f: list[str] = Query(default=[])):
    """input contract per layout (admin 레이아웃 관리 → 입력 · 흐름) — what to send as `layout_inputs` with step auto."""
    from . import layout_flows
    response.headers['Cache-Control'] = 'no-store'
    return layout_flows.contracts([x for x in f if isinstance(x, str) and len(x) <= 80][:200])


@app.get('/api/bootstrap')
def bootstrap(response: Response, request: Request):
    response.headers['Cache-Control'] = 'no-store'
    return bootstrap_payload(request)


@app.get('/api/storyboards/{token}/bootstrap')
def shared_bootstrap(token: str, response: Response, request: Request):
    shared = request.app.state.storyboards.get(token, actor_for(request, response))
    share_cookie(request, response, token)
    return {**bootstrap_payload(request), 'shared': shared}


@app.get('/api/products')
def products(q: str = '', offset: int = Query(0,ge=0), limit: int | None = Query(None,ge=1)):
    # The largest page is the whole catalog (the row count of the runtime projection — it follows DSS updates and deletions).
    if limit is not None and limit > app.state.products.count():
        raise HTTPException(422, 'limit 은 전체 제품 수 이하여야 합니다.')
    return {'items':app.state.products.list(q,offset,limit),'total':app.state.products.count(q)}


@app.get('/api/catalog/metrics')
def catalog_metrics(response: Response, request: Request):
    response.headers['Cache-Control'] = 'no-store'
    try:
        return request.app.state.catalog_metrics.get()
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as exc:
        raise HTTPException(503, '자산 건수를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.') from exc


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


# The product image index/packs are a separate, read-only source from the frozen UI export.
app.mount('/img/lib',StaticFiles(directory=ROOT/'img/lib',check_dir=False),name='product-image-library')
app.mount('/img/backgrounds',StaticFiles(directory=DATA/'backgrounds',check_dir=False),name='backgrounds')
app.mount('/img',StaticFiles(directory=DATA/'static/img'),name='images')
app.mount('/lib',StaticFiles(directory=DATA/'static/lib'),name='document-libraries')
# Unmodified, frozen reference. It has no local platform adapter, exactly as exported.
# Frozen reference stays on disk for historical comparisons; it is not a production app route.
app.mount('/assets',StaticFiles(directory=WEB/'assets',check_dir=False),name='web-assets')
app.mount('/fonts',StaticFiles(directory=ROOT/'app/web/public/fonts',check_dir=False),name='fonts')


@app.get('/favicon.ico')
def favicon():
    return Response(status_code=204)


@app.get('/tokens.css')
def design_tokens():
    return FileResponse(ROOT/'app/web/src/styles/tokens.css',media_type='text/css',headers={'Cache-Control':'no-cache'})


@app.get('/migration.html')
def migration():
    return FileResponse(WEB/'migration.html')


@app.get('/account.html')
def account():
    return FileResponse(ROOT/'app/web/public/account.html',headers={'Cache-Control':'no-store'})


@app.get('/migration-export.js')
def migration_export():
    return FileResponse(WEB/'migration-export.js',media_type='text/javascript')


@app.get('/')
def index():
    if not (WEB/'index.html').exists(): raise HTTPException(503,'웹 빌드가 없습니다. app/web에서 npm run build를 실행하세요.')
    return FileResponse(WEB/'index.html', headers={'Cache-Control':'no-store'})


@app.get('/spatial')
@app.get('/spatial/{identifier}')
def spatial_page(identifier: str = ''):
    return index()


if __name__ == '__main__':
    import uvicorn
    from app.api.runtime_env import port_value
    uvicorn.run('app.api.main:app',host=port_value('WINMATE_BIND_HOST'),port=int(port_value('WINMATE_API_PORT')))
