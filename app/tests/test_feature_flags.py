"""Feature isolation and streaming failure contracts without outbound requests."""
from app.api.poc.settings import load_settings
from app.api.poc.adapters import llm
from app.api.poc.jobs import BadRequest
from app.api.poc.provider import ProviderError
import pytest

def test_feature_dummy_overrides_global_real():
 s=load_settings({'WINMATE_MODE':'real','WINMATE_FILL_MODE':'dummy'},[])
 req,provider,result=llm.parse({'kind':'json','prompt':'test','feature':'fill'},s)
 assert req is None and provider is None and result['mode']=='dummy' and result['error']=='unavailable'
 assert s.function_mode('simulation')=='real'

def test_unknown_feature_is_rejected():
 with pytest.raises(BadRequest):llm.parse({'prompt':'test','feature':'unknown'},load_settings({},[]))

def test_stream_reports_failure_without_false_result():
 class P:
  def model_for(self,tier):return 'test'
  def stream_text(self,**kw):
   yield '{"partial":'
   raise ProviderError('network','request failed')
 req=llm.LlmRequest('json','test',None,'default',None)
 events=list(llm.stream(req,P()))
 assert events[0]['type']=='text' and events[-1]['type']=='error'
 assert not any(e['type']=='result' for e in events)

def test_settings_do_not_expose_url_credentials():
 s=load_settings({'GEMINI_BASE_URL':'https://user:password@example.com/v1beta?key=private','GEMINI_API_KEY':'private-test-key'},[])
 public=s.public()
 assert public['endpoint_host']=='example.com'
 assert 'private-test-key' not in repr(s) and 'password' not in str(public) and 'private' not in str(public)
