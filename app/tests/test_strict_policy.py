"""Negative contracts only: no successful AI result is substituted in these tests."""
import json,time
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.poc import settings as cfg,provider as providers
from app.api.poc.provider import ProviderError
from app.api.poc.routes import router

@pytest.fixture
def client(monkeypatch):
 monkeypatch.setattr(cfg,'_SETTINGS',cfg.load_settings({},[]))
 monkeypatch.setattr(providers,'_OVERRIDE',{})
 app=FastAPI();app.include_router(router)
 with TestClient(app) as c:yield c

@pytest.mark.parametrize('feature',['rfp','layout','storyboard','search','rerank','review','part','fill','simulation','llm'])
def test_every_ai_feature_requires_key(client,feature):
 r=client.post('/api/llm',json={'feature':feature,'kind':'json','prompt':'Test missing key only.'})
 assert r.status_code==503 and r.json()['code']=='no_api_key'
 assert 'data' not in r.json() and 'text' not in r.json()

@pytest.mark.parametrize('body',[
 {'offline':True},{'offline':'true'},{'llm':False},{'llm':0},{'mode':'dummy'},{'mode':'offline'},
 {'offline':1},{'offline':[]},{'offline':{}},{'llm':'false'}])
def test_no_legacy_option_can_enable_rules(client,body):
 r=client.post('/api/llm',json={'feature':'llm','kind':'json','prompt':'test',**body})
 assert r.status_code==422 and r.json()['code']=='unsupported_option'
 assert 'data' not in r.json()

class FailingProvider:
 name='gemini';model='error-contract';available=True
 def __init__(self,code):self.code=code
 def model_for(self,tier):return self.model
 def generate_json(self,**kw):raise ProviderError(self.code,'Intentional network-fault contract')
 def generate_text(self,**kw):raise ProviderError(self.code,'Intentional network-fault contract')
 def stream_text(self,**kw):raise ProviderError(self.code,'Intentional network-fault contract');yield ''

@pytest.mark.parametrize('code',['auth_failed','rate_limited','upstream_unavailable','network','invalid_json','max_tokens','blocked','model_not_found','empty','bad_request'])
def test_model_errors_are_http_failures_not_dummy_200(client,code):
 providers.set_provider_override(FailingProvider(code))
 r=client.post('/api/llm',json={'feature':'part','kind':'json','prompt':'irrelevant fault input'})
 assert r.status_code>=400 and r.json()['code']
 assert r.json().get('mode')=='real' and not r.json().get('data')
 assert not r.json().get('fallbacks')

@pytest.mark.parametrize('kind',['rfp','layout','storyboard','review'])
def test_pipeline_failure_does_not_publish_rule_result(client,kind):
 providers.set_provider_override(FailingProvider('upstream_unavailable'))
 bodies={
 'rfp':{'text':'고객사 테스트 카페의 메뉴보드 사업입니다. 세 매장에 여섯 대를 설치하고 네 주 동안 파일럿 운영으로 효과를 검증합니다.'},
 'layout':{'input':{'title':'테스트','free_text':'매장 메뉴보드를 도입하고 원격 운영을 지원한다.','products':['qm55c']},'interactive':False,'max_slides':2},
 'storyboard':{'proposal':{'title':'실패 검사','req':{'free':[{'t':'운영 시간 단축'}],'form':{}},'ctx':{'products':['qm55c'],'solutions':[],'cases':[]},'parts':[]}},
 'review':{'doc':{'kind':'txt','units':[{'n':1,'title':'도입 제안','text':'메뉴보드 도입과 원격 관리'}]},'budget':4,'min_k':4}}
 r=client.post('/api/jobs',json={'kind':kind,**bodies[kind]});assert r.status_code==202,r.text;jid=r.json()['id']
 for _ in range(200):
  snap=client.get('/api/jobs/'+jid).json()
  if snap['status'] in ['done','error','cancelled']:break
  time.sleep(.02)
 assert snap['status']=='error',snap
 assert snap['result'] is None and snap['error']['retryable'] is True
 assert snap['error']['code']=='upstream_unavailable',snap
 assert not (snap.get('llm') or {}).get('fallbacks')

@pytest.mark.parametrize('old',['dummy','offline','rules','false','none','malformed'])
def test_legacy_environment_never_turns_model_off(old):
 s=cfg.load_settings({'WINMATE_MODE':old,'WINMATE_FILL_MODE':old},[])
 assert s.mode=='real' and all(s.function_mode(f)=='real'for f in cfg.FUNCTIONS)
 assert s.legacy_ignored and s.warnings

@pytest.mark.parametrize('selection',[[], 'DS4', {'DS4':True}, [True], ['unknown'], ['DS4','DS4'], [' DS4'], ['ds4'], ['DS4',None], ['CU1']*55, ['MK3'], ['WR1'], ['SB1'], ['DS4']])
def test_manual_criteria_reject_invalid_inputs_before_any_model(client,selection):
 providers.set_provider_override(FailingProvider('network'))
 body={'kind':'review','doc':{'kind':'txt','units':[{'n':1,'title':'test','text':'synthetic source'}]},'criteria':selection}
 r=client.post('/api/jobs',json=body)
 assert r.status_code==422 and not r.json().get('id')

@pytest.mark.parametrize('images',[
 [{'sheet':1,'data_url':'data:image/png;base64,AA=='}]*5,
 [{'sheet':0,'data_url':'data:image/png;base64,AA=='}],
 [{'sheet':2,'data_url':'data:image/png;base64,AA=='}],
 [{'sheet':True,'data_url':'data:image/png;base64,AA=='}],
 [{'sheet':'1','data_url':'data:image/png;base64,AA=='}],
 [{'sheet':1}],
 [{'sheet':1,'data_url':'not a data url'}],
 [{'sheet':1,'data_url':'data:text/html;base64,AA=='}],
 [{'sheet':1,'data_url':'data:image/png;base64,invalid!'}],
 [{'sheet':1,'data_url':'data:image/png;base64,AA=='},{'sheet':1,'data_url':'data:image/png;base64,AA=='}],
])
def test_visual_review_rejects_bad_images_before_any_model(client,images):
 providers.set_provider_override(FailingProvider('network'))
 r=client.post('/api/jobs',json={'kind':'review','doc':{'kind':'txt','units':[{'n':1,'text':'synthetic source'}]},'images':images})
 assert r.status_code==422 and not r.json().get('id')
