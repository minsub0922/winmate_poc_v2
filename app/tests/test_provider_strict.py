"""Network fault and resource ownership tests; fixtures never replace production AI output."""
import concurrent.futures,io,json,threading,time,urllib.error
from unittest.mock import patch
import pytest
from app.api.poc.provider import GeminiProvider,ProviderError,get_provider
from app.api.poc.settings import load_settings

def settings(**kw):
 return load_settings({'GEMINI_API_KEY':'test-provider-secret-0123456789','WINMATE_GEMINI_RPM':'0',**kw},[])
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
 with patch.dict('os.environ',{'WINMATE_GEMINI_CONCURRENCY':'2'}):p=GeminiProvider(settings(),urlopen=fetch)
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
  results=list(pool.map(lambda i:p.generate_json(stage=f'concurrent-{i}',user='x'),range(12)))
 assert len(results)==12 and peak<=2
 assert p.ledger.view()['peak_requests']<=2 and p.ledger.view()['active_requests']==0

def test_cancelling_queued_request_does_not_call_upstream():
 with patch.dict('os.environ',{'WINMATE_GEMINI_CONCURRENCY':'1'}):p=GeminiProvider(settings(),urlopen=lambda *a,**k:pytest.fail('cancelled request sent'))
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
