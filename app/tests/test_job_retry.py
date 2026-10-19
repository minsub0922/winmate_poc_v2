"""Non-AI job lifecycle tests, including full-input retry and overload admission control."""
import concurrent.futures,json,time,threading
import pytest
from app.api.poc.jobs import JobManager,Conflict,Waiting,Unavailable

def wait(j,status=('done','error','cancelled','waiting')):
 for _ in range(500):
  if j.status in status and not j.busy:return j
  time.sleep(.005)
 raise AssertionError(j.snapshot())
def failed(manager,text='original'):
 seen=[]
 def fn(job):
  seen.append(text)
  if len(seen)==1:raise RuntimeError('transient failure')
  return {'length':len(text)}
 return wait(manager.submit('rfp','source',{'chars':len(text)},fn)),seen

def test_retry_keeps_full_26000_characters():
 m=JobManager();raw='원문표12 '*5000;j,seen=failed(m,raw);r=wait(m.retry(j.id));assert seen==[raw,raw] and r.result['length']>26000

def test_concurrent_retry_clicks_are_idempotent():
 m=JobManager();j,seen=failed(m)
 with concurrent.futures.ThreadPoolExecutor(max_workers=10)as p:ids=list(p.map(lambda _:m.retry(j.id).id,range(10)))
 assert len(set(ids))==1;wait(m.get(ids[0]));assert len(seen)==2

def test_running_job_cannot_retry():
 m=JobManager();gate=threading.Event();j=m.submit('rfp','running',{},lambda _:gate.wait(.2))
 try:
  with pytest.raises(Conflict):m.retry(j.id)
 finally:gate.set();wait(j)

def test_queued_job_cannot_retry():
 m=JobManager(workers=1);gate=threading.Event();first=m.submit('rfp','hold',{},lambda _:gate.wait(.2));j=m.submit('rfp','queue',{},lambda _:True)
 try:
  with pytest.raises(Conflict):m.retry(j.id)
 finally:gate.set();wait(first);wait(j)

def test_waiting_job_requires_answer_not_retry():
 m=JobManager();j=wait(m.submit('layout','waiting',{},lambda _:Waiting({'questions':[]},{})))
 with pytest.raises(Conflict):m.retry(j.id)
 m.cancel(j.id)

def test_completed_job_cannot_retry():
 m=JobManager();j=wait(m.submit('rfp','done',{},lambda _:{}))
 with pytest.raises(Conflict):m.retry(j.id)

def test_expired_source_requires_reattachment():
 m=JobManager();j,_=failed(m);j.finished=time.time()-3601
 with pytest.raises(Conflict,match='원문'):m.retry(j.id)
 assert j.retry_fn is None

def test_cancelled_queued_input_can_restart_once():
 m=JobManager(workers=1);gate=threading.Event();first=m.submit('rfp','hold',{},lambda _:gate.wait(.2));calls=[];j=m.submit('rfp','queue',{},lambda _:(calls.append(1) or {}));m.cancel(j.id);gate.set();wait(first);wait(j);r=wait(m.retry(j.id));assert len(calls)==1 and r.status=='done'

def test_private_source_not_in_snapshot():
 m=JobManager();raw='private-input-abcdef '*2000;j,_=failed(m,raw);public=json.dumps(j.snapshot());assert raw not in public and 'retry_fn' not in public and j.snapshot()['can_retry'] is True

def test_success_releases_source_closure():
 m=JobManager();j,_=failed(m);r=wait(m.retry(j.id));assert r.retry_fn is None and not r.snapshot()['can_retry'] and r.retry_of==j.id

def test_overload_does_not_spawn_unbounded_threads():
 m=JobManager(workers=1,max_jobs=2);gate=threading.Event();a=m.submit('rfp','hold',{},lambda _:gate.wait(.2));b=m.submit('rfp','queued',{},lambda _:None)
 try:
  with pytest.raises(Unavailable,match='작업'):m.submit('rfp','overload',{},lambda _:None)
  assert len(m._jobs)==2
 finally:gate.set();wait(a);wait(b)

def test_terminal_job_evicted_before_active_job():
 m=JobManager(max_jobs=2);a=wait(m.submit('rfp','done1',{},lambda _:{}));b=wait(m.submit('rfp','done2',{},lambda _:{}));c=wait(m.submit('rfp','done3',{},lambda _:{}));assert c.id in m._jobs and len(m._jobs)==2 and a.id not in m._jobs
