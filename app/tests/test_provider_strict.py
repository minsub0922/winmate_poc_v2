"""Network fault and resource ownership tests; fixtures never replace production AI output."""
import concurrent.futures,io,json,threading,time,urllib.error
import pytest
from app.api.poc.provider import GeminiProvider,ProviderError,get_provider
from app.api.poc.settings import load_settings
from app.api.llm.queue import CallQueue,SQLiteBroker

@pytest.fixture(autouse=True)
def isolated_queue(tmp_path,monkeypatch):
 # Network fixtures share a fast test broker, never the running application's quota.
 monkeypatch.setattr('app.api.llm.provider.create_queue',lambda s:CallQueue(SQLiteBroker(tmp_path/'queue.sqlite',window=.005),rpm=s.rpm,concurrency=s.concurrency,timeout=s.queue_timeout))

def settings(**kw):
 return load_settings({'GEMINI_API_KEY':'test-provider-secret-0123456789','WINMATE_LLM_RPM':'42',**kw},[])
def response(text='{"ok":true}',finish='STOP'):
 return io.BytesIO(json.dumps({'candidates':[{'content':{'parts':[{'text':text}]},'finishReason':finish}],'usageMetadata':{'promptTokenCount':4,'candidatesTokenCount':3}}).encode())
def stream(text='hello',finish='STOP'):
 return io.BytesIO(('data: '+json.dumps({'candidates':[{'content':{'parts':[{'text':text}]},'finishReason':finish}]})+'\n\n').encode())

def test_missing_key_never_calls_network():
 p=GeminiProvider(load_settings({},[]),urlopen=lambda *a,**k:pytest.fail('unexpected network'))
 with pytest.raises(ProviderError,match='no_api_key'):p.generate_json(stage='test',user='x',max_attempts=1)
 assert p.ledger.view()['active_requests']==0

def test_no_backoff_after_last_429():
 def fail(*a,**k):raise urllib.error.HTTPError('https://example.test',429,'quota',{},io.BytesIO(b'quota'))
 p=GeminiProvider(settings(),urlopen=fail);sleeps=[];p._sleep=lambda n,c:sleeps.append(n)
 with pytest.raises(ProviderError,match='rate_limited'):p.generate_json(stage='test',user='x',max_attempts=1)
 assert sleeps==[0] or all(x<=0 for x in sleeps)
 assert p.ledger.view()['active_requests']==0

def test_no_backoff_after_last_network_error():
 def fail(*a,**k):raise urllib.error.URLError('failed')
 p=GeminiProvider(settings(),urlopen=fail);wait=[];p._sleep=lambda n,c:wait.append(n)
 with pytest.raises(ProviderError,match='network'):p.generate_text(stage='test',user='x',max_attempts=1)
 assert all(x<=0 for x in wait)

def test_invalid_json_fails_and_closes_every_response():
 opened=[]
 def fetch(*a,**k):r=response('not json');opened.append(r);return r
 p=GeminiProvider(settings(),urlopen=fetch)
 with pytest.raises(ProviderError,match='invalid_json'):p.generate_json(stage='test',user='x',max_attempts=3)
 assert len(opened)==2 and all(r.closed for r in opened)
 assert p.ledger.view()['active_requests']==0

def test_retry_after_then_real_response_contract():
 calls=[];wait=[]
 def fetch(*a,**k):
  calls.append(1)
  if len(calls)==1:raise urllib.error.HTTPError('https://example.test',503,'retry',{'Retry-After':'0'},io.BytesIO(b'retry'))
  return response()
 p=GeminiProvider(settings(),urlopen=fetch);p._sleep=lambda n,c:wait.append(n)
 r=p.generate_json(stage='test',user='x',max_attempts=2)
 assert r.data=={'ok':True} and len(calls)==2 and not any(n>0 for n in wait)
 assert p.ledger.view()['requests']==2

def test_parallel_calls_are_bounded():
 lock=threading.Lock();active=peak=0
 def fetch(*a,**k):
  nonlocal active,peak
  with lock:active+=1;peak=max(peak,active)
  time.sleep(.015)
  with lock:active-=1
  return response()
 p=GeminiProvider(settings(WINMATE_LLM_CONCURRENCY='2'),urlopen=fetch)
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
  results=list(pool.map(lambda i:p.generate_json(stage=f'concurrent-{i}',user='x'),range(12)))
 assert len(results)==12 and peak<=2
 assert p.ledger.view()['peak_requests']<=2 and p.ledger.view()['active_requests']==0

def test_cancelling_queued_request_does_not_call_upstream():
 p=GeminiProvider(settings(WINMATE_LLM_CONCURRENCY='1'),urlopen=lambda *a,**k:pytest.fail('cancelled request sent'))
 p._slots.acquire();cancel=threading.Event()
 with concurrent.futures.ThreadPoolExecutor() as pool:
  future=pool.submit(p.generate_json,stage='queued',user='x',cancel=cancel.is_set)
  time.sleep(.12);cancel.set()
  with pytest.raises(ProviderError,match='cancelled'):future.result(timeout=1)
 p._slots.release()
 assert p.ledger.view()['requests']==0

def test_truncated_stream_is_an_error_not_success():
 p=GeminiProvider(settings(),urlopen=lambda *a,**k:stream('partial','MAX_TOKENS'))
 with pytest.raises(ProviderError,match='max_tokens'):list(p.stream_text(stage='truncation',user='x'))
 assert p.ledger.view()['ok']==0 and p.ledger.view()['active_requests']==0

def test_cancelled_stream_releases_slot():
 cancel=threading.Event();p=GeminiProvider(settings(),urlopen=lambda *a,**k:stream())
 it=p.stream_text(stage='cancel',user='x',cancel=cancel.is_set);cancel.set()
 with pytest.raises(ProviderError,match='cancelled'):list(it)
 assert p.ledger.view()['active_requests']==0

def test_empty_stream_does_not_fabricate_text():
 p=GeminiProvider(settings(),urlopen=lambda *a,**k:io.BytesIO(b'data: invalid\n\n'))
 with pytest.raises(ProviderError,match='empty'):list(p.stream_text(stage='empty',user='x'))
 assert p.ledger.view()['ok']==0

def test_secret_only_in_header_and_redacted_error():
 seen=[]
 def fetch(req,**kw):
  seen.append(req)
  raise urllib.error.HTTPError(req.full_url,403,'auth',{},io.BytesIO(json.dumps({'error':{'message':settings().api_key()}}).encode()))
 p=GeminiProvider(settings(),urlopen=fetch)
 with pytest.raises(ProviderError) as exc:p.generate_json(stage='secret',user='x',max_attempts=1)
 assert p._key not in str(exc.value) and p._key not in seen[0].full_url
 assert seen[0].get_header('X-goog-api-key')==p._key

def test_provider_settings_changes_take_effect():
 p,_=get_provider(settings(WINMATE_GEMINI_TIMEOUT='10'))
 other,_=get_provider(settings(WINMATE_GEMINI_TIMEOUT='20'))
 assert p is not other and other.timeout==20

def test_operation_deadline_bounds_retry_backoff():
 def fail(*a,**kw):
  time.sleep(.015)
  raise urllib.error.HTTPError('https://example.test',503,'transient',{},io.BytesIO(b'transient'))
 p=GeminiProvider(settings(),urlopen=fail);p.timeout=.06;start=time.monotonic()
 with pytest.raises(ProviderError,match='timeout'):p.generate_json(stage='deadline',user='x',max_attempts=3)
 assert time.monotonic()-start<.5 and p.ledger.view()['active_requests']==0

def test_closing_partial_stream_releases_network_lease():
 raw=stream('partial');p=GeminiProvider(settings(),urlopen=lambda *a,**kw:raw)
 it=p.stream_text(stage='closed',user='x');assert next(it)=='partial';it.close()
 assert raw.closed and p.ledger.view()['active_requests']==0 and p.ledger.view()['ok']==0

def test_startup_probe_cannot_be_satisfied_by_cached_response(tmp_path):
 def fail(*a,**kw):raise urllib.error.HTTPError('https://example.test',403,'invalid key',{},io.BytesIO(b'invalid key'))
 p=GeminiProvider(settings(),urlopen=fail);p.cache_dir=tmp_path
 p._cache_get=lambda cache_path:pytest.fail('connection proof must not read cached output') if cache_path is not None else None
 with pytest.raises(ProviderError,match='auth_failed'):p.generate_json(stage='startup:connection',user='probe',cache_allowed=False,max_attempts=1)
 assert p.ledger.view()['requests']==1


def test_valid_repeated_json_rows_are_not_mistaken_for_runaway_output():
 from app.api.poc.provider import degenerate
 rows=[{'id':f'CU{i}','checks':[{'id':f'CU{i}.{j}','level':2,'reason':'제공된 문서에 구체적인 가정이 있으나 실측 증빙은 없습니다.','verification':'','evidence':[{'sheet':1,'quote':'A 커피 본사 운영팀'}]}for j in range(4)]}for i in range(6)]
 assert not degenerate(json.dumps({'scores':rows},ensure_ascii=False,indent=2))


def test_runaway_is_detected_within_one_value_in_valid_or_incomplete_json():
 from app.api.poc.provider import degenerate
 loop='정상적인 평가 설명처럼 보이지만 같은 의미와 문장을 끝없이 반복하는 잘못된 응답입니다. '*20
 assert degenerate(json.dumps({'reason':loop},ensure_ascii=False))
 assert degenerate('{"reason":"'+loop)
 assert degenerate(loop)


def test_grounded_search_sends_the_real_search_tool_preserves_sources_and_never_uses_cache(tmp_path):
 seen=[]
 metadata={'webSearchQueries':['공개 제품 검색'],'groundingChunks':[{'web':{'uri':'https://example.test/product','title':'제품 자료'}}]}
 def fetch(request,**kwargs):
  seen.append(json.loads(request.data));return io.BytesIO(json.dumps({'candidates':[{'content':{'parts':[{'text':'검색 자료에 근거한 요약'}]},'finishReason':'STOP','groundingMetadata':metadata}]}).encode())
 p=GeminiProvider(settings(),urlopen=fetch);p.cache_dir=tmp_path
 first=p.search_web(stage='test:search',query='공개 제품 검색');second=p.search_web(stage='test:search',query='공개 제품 검색')
 assert len(seen)==2 and all(x['tools']==[{'google_search':{}}] for x in seen)
 assert first.grounding==metadata and second.grounding==metadata and not first.cached and not second.cached
 assert not list(tmp_path.glob('*.json'))


def test_stream_completion_reports_actual_usage_once_and_never_on_partial_close():
 events=[]
 raw=io.BytesIO(('data: '+json.dumps({'candidates':[{'content':{'parts':[{'text':'요약'},{'text':'숨은 사고','thought':True}]},'finishReason':'STOP'}],'usageMetadata':{'promptTokenCount':17,'candidatesTokenCount':8}})+'\n\n').encode())
 p=GeminiProvider(settings(),urlopen=lambda *a,**k:raw)
 assert list(p.stream_text(stage='skill-analysis',user='x',on_result=events.append))==['요약']
 assert len(events)==1 and events[0].prompt_tokens==17 and events[0].output_tokens==8
 raw=stream('partial');p=GeminiProvider(settings(),urlopen=lambda *a,**k:raw)
 it=p.stream_text(stage='partial',user='x',on_result=events.append);next(it);it.close()
 assert len(events)==1 and p.ledger.view()['active_requests']==0
