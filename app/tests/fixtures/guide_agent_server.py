"""Isolated browser harness: real auth and real guide LLM; no production credentials or user DB writes."""
import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from app.api.auth import Auth, AuthConfig, integrate_app
from app.api.guide_agent import router

ROOT=Path(__file__).resolve().parents[3]
DATA=ROOT/'app/data'
WEB=ROOT/'app/web/dist'
app=FastAPI();app.include_router(router)
auth=Auth(AuthConfig(auth_dir=Path(os.environ['WINMATE_GUIDE_TEST_AUTH_DIR']),iterations=2000))
auth.set_credentials('guide-test','guide-agent-live-password')
integrate_app(app,auth)
@app.get('/api/bootstrap')
def bootstrap(request:Request):
    identity=auth.read_token(request.cookies.get(auth.config.cookie_name))
    read=lambda name:json.loads((DATA/(name+'.json')).read_text())
    return {'catalog':read('catalog'),'products':read('products_db'),'images':read('images'),'capabilities':None,
            'user':{'username':identity['u'] if identity else None,'guest':not bool(identity),'auth_enabled':True,'tracking_enabled':bool(identity)}}
app.state.activity_events=[]
@app.get('/api/activity/history')
def activity_history():return {'items':[]}
@app.post('/api/activity/events')
async def activity_events(request:Request):
    body=await request.json();app.state.activity_events.extend(body.get('events',[]));return {'accepted':len(body.get('events',[]))}
@app.post('/api/activity/history')
def history_write():return {'ok':True}
@app.get('/api/guide-test/events')
def recorded_events():return {'events':app.state.activity_events}
@app.get('/api/catalog/metrics')
def catalog_metrics():
    catalog=json.loads((DATA/'catalog.json').read_text());products=json.loads((DATA/'products_db.json').read_text())
    layouts=[item for item in catalog['layouts'] if not item.get('retired') and not item.get('hidden')]
    return {'counts':{'layouts':len(layouts),'industry_layouts':sum(bool(item.get('ind')) for item in layouts),'products':len(catalog['products'])+len(products['products']),'solutions':len(catalog['solutions']),'cases':len(catalog['cases'])},'next_refresh_at':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()}
@app.get('/api/jobs')
def jobs():return {'jobs':[]}
@app.get('/api/spatial/library')
def spatial():return json.loads((DATA/'spatial/library.json').read_text())
@app.get('/tokens.css')
def tokens():return FileResponse(ROOT/'app/web/src/styles/tokens.css')
@app.get('/')
def index():return FileResponse(WEB/'index.html',headers={'Cache-Control':'no-store'})
app.mount('/assets',StaticFiles(directory=WEB/'assets'),name='assets')
app.mount('/fonts',StaticFiles(directory=ROOT/'app/web/public/fonts'),name='fonts')
app.mount('/img/lib',StaticFiles(directory=ROOT/'img/lib',check_dir=False),name='product-images')
app.mount('/img/backgrounds',StaticFiles(directory=DATA/'backgrounds',check_dir=False),name='backgrounds')
app.mount('/img',StaticFiles(directory=DATA/'static/img'),name='images')
app.mount('/lib',StaticFiles(directory=DATA/'static/lib'),name='libraries')
