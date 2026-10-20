"""Skill routing/retrieval/source contracts. Fixture model output is never production data."""
from copy import deepcopy
from types import SimpleNamespace
import json
import pytest
from app.api.poc.adapters import simulation_skills as sk
from app.api.poc.jobs import BadRequest,ModelFailure
from app.api.poc.provider import GenerationResult,ProviderError


def body(skill='product-fit'):
 return {'skill_id':skill,'prompt':'55형 카페 메뉴보드와 본사 원격 운영','refs':['product:qm55c','solution:magicinfo'],'context':{'customer':{'company':'비공개 고객사','name':'홍길동','ind':'FB'},'requirements':'매장 10곳 파일럿','proposal':None,'messages':[{'who':'cust','text':'본사에서 가격을 한 번에 바꾸고 싶습니다.'}]}}


def answer():
 return {'title':'카페 통합 운영','summary':'현재 고객 요구에 맞춘 구성입니다.','findings':[{'heading':'통합 배포','text':'본사에서 메뉴를 배포합니다.','source_ids':['solution:magicinfo','context']}],'recommendations':[{'ref':'product:qm55c','reason':'55형 메뉴보드 용도','conditions':'설치 환경 확인','source_ids':['product:qm55c']}],'comparison':[],'replies':[{'title':'핵심 제안','approach':'핵심 구성을 짧게 전달할 때','text':'QM55C와 MagicINFO로 매장 메뉴를 본사에서 일괄 배포하는 구성을 제안합니다.','source_ids':['product:qm55c','solution:magicinfo']},{'title':'운영 근거','approach':'원격 운영의 이유를 설명할 때','text':'본사 통합 운영이 중요하므로 관리 솔루션의 배포 흐름과 네트워크 조건을 함께 확인하겠습니다.','source_ids':['solution:magicinfo']},{'title':'실행 협의','approach':'검증할 범위를 정할 때','text':'우선 10개 매장의 운영 환경을 확인하고 파일럿 대상과 검증 방법부터 함께 정하면 어떨까요?','source_ids':['context']}],'reply_draft':'QM55C와 MagicINFO로 매장 메뉴를 일괄 배포하는 구성을 제안합니다.','missing_information':['매장별 네트워크 확인'],'next_steps':['파일럿 매장 선정']}


def test_eight_real_skill_definitions_have_unique_ids_and_competitor_requires_search():
 assert len(sk.skills())==8 and sk.skills()['competitor-analysis']['web']=='required'
 assert sk.skills()['product-fit']['name']=='맞춤 제품 제시'
 assert all(s['task'] and s['types'] for s in sk.skills().values())


@pytest.mark.parametrize('change',[
 lambda b:b.update(skill_id='missing'),lambda b:b.update(skill_id={}),
 lambda b:b.update(context=None),lambda b:b.update(prompt='x'*4001),
 lambda b:b.update(refs=[True]),lambda b:b['context'].update(messages=[{'who':'skill','text':'hidden'}]),
 lambda b:b['context'].update(proposal='bad'),lambda b:b['context'].update(requirements='x'*61000),
])
def test_bad_requests_never_reach_a_model(change):
 b=body();change(b)
 with pytest.raises(BadRequest):sk.validate(b)


def test_current_query_retrieves_actual_different_catalog_materials_and_keeps_explicit_refs():
 one=sk.retrieve(['QM55C MagicINFO 카페 메뉴보드'],body()['context'],body()['refs'],sk.skills()['product-fit'])
 two=sk.retrieve(['WM75B Flip Pro 전자칠판 강의실'],{'customer':{'ind':'ED'}},[],sk.skills()['product-fit'])
 assert {'product:qm55c','solution:magicinfo'}<={d['id'] for d in one}
 assert [d['id'] for d in one]!=[d['id'] for d in two]
 assert any('WM75B' in json.dumps(d,ensure_ascii=False) or 'Flip' in json.dumps(d,ensure_ascii=False) for d in two)
 assert all(d['type']!='scenario' or '가상' in d['facts']['reference_type'] for d in one)


def test_public_web_query_does_not_include_named_customer_person_budget_or_contact():
 q=sk.public_query(['비공개 고객사 홍길동 예산 3억원 010-1234-5678 name@example.com QM55C LG 비교'],body()['context'])
 for secret in ['비공개 고객사','홍길동','3억원','010-1234-5678','name@example.com']:assert secret not in q
 assert 'QM55C' in q and 'LG' in q


def test_only_actual_grounding_metadata_can_create_web_sources():
 r=GenerationResult(None,'retrieved summary','fixture',grounding={'groundingChunks':[{'web':{'uri':'https://www.lg.com/business/test','title':'LG 공식 자료'}},{'web':{'uri':'javascript:alert(1)','title':'bad'}}],'groundingSupports':[{'segment':{'text':'제공된 자료의 비교 요약'},'groundingChunkIndices':[0]}]})
 sources=sk.grounded_material(r);assert len(sources)==1 and sources[0]['url'].startswith('https://www.lg.com')
 assert '비교 요약' in sources[0]['facts']['search_supported_summary']
 assert sk.grounded_material(GenerationResult(None,'unsourced model words','fixture'))==[]


def test_answer_rejects_unknown_sources_and_unretrieved_products():
 materials=[{'id':'product:qm55c','ref':'product:qm55c'},{'id':'solution:magicinfo','ref':'solution:magicinfo'}]
 assert sk.answer_problem(answer(),materials,sk.skills()['product-fit'])==''
 bad=answer();bad['recommendations'][0]['ref']='product:made-up';assert sk.answer_problem(bad,materials,sk.skills()['product-fit'])
 bad=answer();bad['findings'][0]['source_ids']=['web:invented'];assert sk.answer_problem(bad,materials,sk.skills()['product-fit'])
 bad=answer();bad['comparison']=[{'criterion':'밝기','option_a':'확인한 삼성 정보','option_b':'확인한 타사 정보','implication':'조건 비교','source_ids':['context']}]
 assert sk.answer_problem(bad,materials,sk.skills()['competitor-analysis'])


class FixtureProvider:
 available=True;name='test-fixture';model='fixture'
 def __init__(self,web=False):self.calls=[];self.web=web;self.searched=[]
 def model_for(self,tier):return self.model
 def generate_json(self,**kw):
  self.calls.append(kw)
  data={'queries':['QM55C MagicINFO 카페 메뉴보드'],'needs_web':False} if kw['stage'].endswith(':plan') else answer()
  if self.web and kw['stage'].endswith(':answer'):
   data['comparison']=[{'criterion':'운영','option_a':'삼성 운영 조건','option_b':'대안 운영 조건','implication':'같은 기준 확인','source_ids':['web:1']}]
  return GenerationResult(data,json.dumps(data,ensure_ascii=False),self.model)
 def stream_text(self,**kw):
  if kw.get('cancel') and kw['cancel']():raise ProviderError('cancelled','취소')
  for text in ['실제 분석', '실제 분석 결과: 원격 배포와 매장별 운영 조건을 대조합니다.']:yield text
  kw['on_result'](GenerationResult(None,text,self.model,100,30))
 def search_web(self,**kw):
  self.searched.append(kw)
  return GenerationResult(None,'실제 검색 응답 형태의 테스트 fixture',self.model,grounding={'webSearchQueries':['QM55C LG 공식 비교'],'groundingChunks':[{'web':{'uri':'https://www.lg.com/business/test','title':'테스트용 공식 자료'}}],'groundingSupports':[{'segment':{'text':'비교 조건'},'groundingChunkIndices':[0]}],'searchEntryPoint':{'renderedContent':'<div>검색 제안 fixture</div>'}})


@pytest.mark.parametrize('skill',list(sk.skills()))
def test_every_skill_runs_real_search_and_streamed_analysis_with_three_answers(monkeypatch,skill):
 provider=FixtureProvider(web=True);monkeypatch.setattr(sk,'require_provider',lambda *args:provider);events=[];stages=[];b=body(skill);before=deepcopy(b)
 result=sk.run(b,None,on_progress=events.append,on_event=stages.append)
 assert b==before and result['llm']['effective']=='llm' and len(provider.calls)==2 and len(provider.searched)==1
 assert result['research']['local_documents']>0 and result['research']['web_used'] is True
 assert result['sources'] and all(s['summary'] for s in result['sources'])
 assert len(result['data']['replies'])==3 and result['analysis'].startswith('실제 분석')
 assert [e['stage'] for e in stages if e['status']=='done']==['context','database','web','analysis','answers']
 assert len([e for e in stages if e['status']=='streaming'])==2
 assert result['llm']['calls_ok']==4 and result['llm']['tokens']['output']==30
 assert '현재 대화' in events[0] and '본사에서 가격' in provider.calls[0]['user']


def test_competitor_skill_always_executes_search_even_when_plan_says_local_only(monkeypatch):
 provider=FixtureProvider(web=True);monkeypatch.setattr(sk,'require_provider',lambda *args:provider)
 result=sk.run(body('competitor-analysis'),None)
 assert len(provider.searched)==1 and result['research']['web_used'] is True
 assert result['research']['search_entry_html'] and any(s['id']=='web:1' for s in result['sources'])


def test_missing_search_proof_fails_instead_of_answering_from_model_memory(monkeypatch):
 provider=FixtureProvider(web=True);provider.search_web=lambda **kw:GenerationResult(None,'no search evidence','fixture')
 monkeypatch.setattr(sk,'require_provider',lambda *args:provider)
 with pytest.raises(ModelFailure):sk.run(body('competitor-analysis'),None)
 assert len(provider.calls)==1


def test_model_failure_and_cancellation_never_produce_a_success_result(monkeypatch):
 provider=FixtureProvider();provider.generate_json=lambda **kw:(_ for _ in ()).throw(ProviderError('upstream_unavailable','fixture failure'))
 monkeypatch.setattr(sk,'require_provider',lambda *args:provider)
 with pytest.raises(ModelFailure):sk.run(body(),None)
 with pytest.raises(ProviderError,match='cancelled'):sk.run(body(),None,cancel=lambda:True)


def test_stream_endpoint_returns_progress_and_success_or_typed_error_without_fake_result(monkeypatch):
 from fastapi.testclient import TestClient
 from dataclasses import replace
 import tempfile
 from pathlib import Path
 import app.api.main as main
 from app.api.poc import strict
 previous=main.app.state.auth.config
 monkeypatch.setattr(main,'initialize_poc',lambda:None)
 monkeypatch.setattr(strict,'require_provider',lambda *args:FixtureProvider())
 def successful(body,settings,**kwargs):
  kwargs['on_progress']('현재 맥락 검색 중')
  kwargs['on_event']({'type':'skill_event','stage':'analysis','status':'streaming','text':'실제 분석 결과 fixture'})
  return {'skill_id':body['skill_id'],'data':answer(),'sources':[],'research':{},'llm':{'effective':'llm'}}
 monkeypatch.setattr(sk,'run',successful)
 try:
  with tempfile.TemporaryDirectory() as temp:
   monkeypatch.setenv('WINMATE_STORYBOARD_DIR',str(Path(temp)/'shares'))
   main.app.state.auth.reconfigure(replace(previous,enabled=False))
   with TestClient(main.app) as client:
    response=client.post('/api/simulation/skills/run',json=body())
    events=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    assert [e['type'] for e in events]==['progress','skill_event','result'] and events[-1]['mode']=='real'
    def fail(*args,**kwargs):raise ModelFailure('upstream_unavailable','검사용 모델 실패',step='simulation:skill:answer',retryable=True)
    monkeypatch.setattr(sk,'run',fail)
    response=client.post('/api/simulation/skills/run',json=body())
    events=[json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
    assert [e['type'] for e in events]==['error'] and events[0]['code']=='upstream_unavailable'
    assert client.post('/api/simulation/skills/run',json=body('unknown')).status_code==422
    main.app.state.auth.reconfigure(replace(previous,enabled=True,auth_dir=Path(temp)/'auth',iterations=1000))
    main.app.state.auth.set_credentials('skill-tester','synthetic-skill-test-password')
    assert client.post('/api/simulation/skills/run',json=body()).status_code==401
 finally:main.app.state.auth.reconfigure(previous)


def test_closing_stream_cancels_the_worker(monkeypatch):
 import asyncio
 import time
 from app.api.poc import routes,strict
 completed=__import__('threading').Event()
 monkeypatch.setattr(strict,'require_provider',lambda *args:FixtureProvider())
 def waiting(*args,**kwargs):
  kwargs['on_progress']('검색 중')
  for _ in range(100):
   if kwargs['cancel']():completed.set();return {}
   time.sleep(.01)
 monkeypatch.setattr(sk,'run',waiting)
 class Request:
  app=SimpleNamespace(state=SimpleNamespace(products=None))
  async def is_disconnected(self):return False
 async def exercise():
  response=await routes.run_simulation_skill(Request(),body())
  assert b'progress' in await response.body_iterator.__anext__()
  await response.body_iterator.aclose()
  for _ in range(100):
   if completed.is_set():break
   await asyncio.sleep(.01)
  assert completed.is_set()
 asyncio.run(exercise())

@pytest.mark.parametrize('mutate',[
 lambda a:a.update(replies=a['replies'][:2]),
 lambda a:a['replies'][1].update(text=a['replies'][0]['text']),
 lambda a:a['replies'][0].update(source_ids=['web:invented']),
 lambda a:a['replies'][1].update(title=a['replies'][0]['title']),
])
def test_replies_require_three_distinct_sourced_approaches(mutate):
 a=answer();mutate(a)
 assert sk.answer_problem(a,[{'id':'product:qm55c','ref':'product:qm55c'},{'id':'solution:magicinfo','ref':'solution:magicinfo'}],sk.skills()['product-fit'])

def test_cancel_during_streaming_analysis_prevents_answer_generation(monkeypatch):
 provider=FixtureProvider();monkeypatch.setattr(sk,'require_provider',lambda *args:provider)
 stopped=False
 def event(e):
  nonlocal stopped
  if e['status']=='streaming':stopped=True
 with pytest.raises(ProviderError):sk.run(body(),None,on_event=event,cancel=lambda:stopped)
 assert len(provider.calls)==1


def test_search_without_sources_retries_real_search_once_before_synthesis(monkeypatch):
 provider=FixtureProvider(web=True);search=provider.search_web;attempts=[]
 def sometimes_empty(**kw):
  attempts.append(kw)
  return GenerationResult(None,'출처 없는 검색 응답','fixture') if len(attempts)==1 else search(**kw)
 provider.search_web=sometimes_empty
 monkeypatch.setattr(sk,'require_provider',lambda *args:provider)
 result=sk.run(body(),None)
 assert len(attempts)==2 and result['llm']['calls_rejected']==1
 assert result['research']['web_queries'] and len(result['data']['replies'])==3
