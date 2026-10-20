"""Isolated authenticated UI replay: recorded real skill events over actual SSE, no model calls."""
import json
import os
from pathlib import Path
import sys
import time
from dataclasses import replace
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[3]))
from app.api import main
from app.api.poc import settings,service,strict
from app.api.poc.adapters import simulation_skills
from app.api.poc.jobs import ModelFailure
import uvicorn
fixture=json.loads((Path(__file__).parent/'simulation-skills/product-fit-real.json').read_text())
count=0
settings._SETTINGS=settings.load_settings({},[])
main.initialize_poc=lambda:service.initialize(require_provider=False,warm=False)
strict.require_provider=lambda *a:SimpleNamespace(available=True,name='recorded-real-result')
def replay(body,settings,**kw):
 global count
 count+=1;n=count
 if n==3:raise ModelFailure('upstream_unavailable','자료 준비 연결 오류 — 검사 fixture',step='simulation:skill:answer',retryable=True)
 if n==2:
  kw['on_progress']('취소 검증을 위한 검색 대기')
  time.sleep(2)
  return fixture['result']
 kw['on_progress']('현재 고객 조건으로 실제 기록된 검색·분석을 재생합니다.')
 for event in fixture['events']:
  if kw['cancel']():return {}
  kw['on_event'](event)
  time.sleep(.035 if event['status']=='streaming' else .04)
 return fixture['result']
simulation_skills.run=replay
auth=main.app.state.auth
auth.reconfigure(replace(auth.config,enabled=True,auth_dir=Path(os.environ['WINMATE_AUTH_DIR']),iterations=2000))
auth.set_credentials('sharing-owner','sharing-browser-test-password')
uvicorn.run(main.app,host='127.0.0.1',port=int(os.environ['WINMATE_API_PORT']),log_level='warning')
