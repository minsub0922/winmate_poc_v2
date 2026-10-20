"""Explicit live verification of simulation skills (uses configured real model/search quota)."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import sys
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from app.api.poc.adapters.simulation_skills import run,skills
from app.api.poc.settings import get_settings
from app.api.products import ProductRepository
from app.scripts.prepare_data import prepare
context={'customer':{'company':'A 커피','name':'김운영','role':'운영본부장','ind':'FB','interests':['본사 통합 메뉴 관리','매장 영업 중단 최소화'],'revealed_concerns':[]},'requirements':'전국 320개 카페 매장 메뉴보드를 본사에서 원격 운영하려고 합니다. 먼저 10개 매장 파일럿으로 검증하려고 합니다. 카운터 55형, 24시간 운영, 본사 가격·메뉴 배포가 중요합니다.','proposal':None,'messages':[{'who':'cust','text':'LG 대안과 비교했을 때 삼성은 무엇이 다른가요? 밝기·운영 시간·통합 운영을 비교해 주세요.'}]}
requests=[{'skill_id':'competitor-analysis','prompt':'삼성 QM55C와 LG 55UH5N-M의 공식 자료를 찾아 비교하고, 이 고객에게 말할 근거 있는 답변을 준비해 주세요.','refs':['product:qm55c','solution:magicinfo'],'context':context},{'skill_id':'product-fit','prompt':'앱에 등록된 제품과 솔루션 자료에서 이 고객에게 맞는 구성을 제안해 주세요.','refs':['product:qm55c','solution:magicinfo'],'context':{**context,'messages':[{'who':'cust','text':'카운터 메뉴보드에 맞는 55형 제품과 본사에서 관리할 솔루션을 알려 주세요.'}]}}]
if len(sys.argv)>1:
 requests=[next((r for r in requests if r['skill_id']==sid),{**requests[1],'skill_id':sid,'prompt':definition['task']}) for sid,definition in skills().items() if '--all' in sys.argv or sid in sys.argv[1:]]
products=ProductRepository(prepare());out=ROOT/'app/tests/output/simulation-skills';out.mkdir(parents=True,exist_ok=True)
def check(body):
 events=[]
 try:
  result=run(body,get_settings(),products=products,on_progress=lambda text:print(body['skill_id'],text,flush=True),on_event=events.append)
 except Exception as exc:
  detail=exc.public() if hasattr(exc,'public') else {'message':str(exc)}
  (out/(body['skill_id']+'-failure.json')).write_text(json.dumps({'request':body,'error':detail},ensure_ascii=False,indent=2))
  print('FAILED',body['skill_id'],detail,flush=True);return False
 (out/(body['skill_id']+'-live.json')).write_text(json.dumps({'request':body,'result':result,'events':events},ensure_ascii=False,indent=2))
 print(json.dumps({'skill':body['skill_id'],'title':result['data']['title'],'replies':len(result['data']['replies']),'stream_chunks':sum(e['status']=='streaming' for e in events),'sources':len(result['sources']),'web':result['research']['web_used'],'llm':result['llm']['effective'],'recommendations':[r['ref'] for r in result['data']['recommendations']]},ensure_ascii=False),flush=True)
 return True
with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(check,requests))
if not all(results):sys.exit(1)
