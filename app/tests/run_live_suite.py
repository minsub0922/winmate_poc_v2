"""One command: isolated loopback API/Vite → 140 actual Gemini cases → stop owned processes.
No dummy provider, network replay or offline option is used. API usage is incurred.
"""
from pathlib import Path
import datetime,json,os,signal,socket,subprocess,sys,time,urllib.request
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from app.api.poc.settings import load_settings

def free_port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def stop(process):
 if process.poll() is None:
  try:os.killpg(process.pid,signal.SIGTERM)
  except ProcessLookupError:return
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
def start(args,env,path):
 out=open(path,'w');p=subprocess.Popen(args,cwd=ROOT,env=env,stdout=out,stderr=subprocess.STDOUT,start_new_session=True);return p,out

def main():
 settings=load_settings()
 if not settings.has_key:print('GEMINI_API_KEY가 없습니다. app/.env 또는 poc/.env를 준비하세요.');return 2
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');output=ROOT/'app/tests/output/strict/runs'/stamp;output.mkdir(parents=True)
 api_port=free_port();web_port=free_port();api=f'http://127.0.0.1:{api_port}';web=f'http://127.0.0.1:{web_port}'
 env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','WINMATE_AUTH':'off','WINMATE_LLM_CACHE':'off','WINMATE_GEMINI_RPM':os.environ.get('WINMATE_GEMINI_RPM','42'),'WINMATE_API_PORT':str(api_port),'WINMATE_WEB_PORT':str(web_port),'WINMATE_LIVE_URL':api,'WINMATE_LIVE_WEB':web,'LIVE_RUN':stamp,'LIVE_LIMIT':'10','LANGSMITH_TRACING':'false'}
 services=[];files=[];tests=[];start_time=time.monotonic();report={}
 try:
  for command in ([sys.executable,'-B','app/scripts/prepare_data.py'],['node','app/scripts/export_agent_data.mjs']):subprocess.run(command,cwd=ROOT,env=env,check=True,stdout=subprocess.DEVNULL)
  p,f=start([sys.executable,'-B','-m','uvicorn','app.api.main:app','--host','127.0.0.1','--port',str(api_port),'--no-access-log'],env,output/'api.log');services.append(p);files.append(f)
  for _ in range(180):
   if p.poll() is not None:raise RuntimeError('실제 API 기동 실패: '+str(output/'api.log'))
   try:
    with urllib.request.urlopen(api+'/api/health',timeout=2)as r:health=json.load(r)
    if health.get('gemini',{}).get('verified'):break
   except Exception:pass
   time.sleep(.5)
  else:raise TimeoutError('Gemini 연결 확인을 포함한 서버 기동 시간이 초과되었습니다.')
  p,f=start(['npm','--prefix','app/web','run','dev'],env,output/'vite.log');services.append(p);files.append(f)
  for script,name in [([sys.executable,'-B','app/tests/live_backend.py'],'backend'),(['node','app/tests/live_frontend.mjs'],'frontend')]:
   p,f=start(script,env,output/(name+'.log'));tests.append((name,p));files.append(f)
  while any(p.poll()is None for _,p in tests):
   if time.monotonic()-start_time>1200:raise TimeoutError('실제 테스트 20분 시간 한도를 초과했습니다.')
   time.sleep(.5)
  visual_log=open(output/'visual-review.log','w');files.append(visual_log)
  subprocess.run(['node','app/tests/live_visual_review.mjs'],cwd=ROOT,env=env,stdout=visual_log,stderr=subprocess.STDOUT,timeout=300,check=True)
  visual=json.loads((ROOT/'app/tests/output/strict/visual-review'/stamp/'report.json').read_text())
  durations=sorted(row['seconds']for row in visual['cases'])
  report['visual_review']={'visual_review':{'cases':visual['total'],'passed':visual['passed'],'failed':visual['total']-visual['passed'],'p50_s':durations[len(durations)//2],'p95_s':max(durations)}}
  for name in ('backend','frontend'):
   path=ROOT/f'app/tests/output/strict/live-{name}'/stamp/'report.json'
   if not path.exists():raise RuntimeError('보고서가 없습니다: '+str(path))
   data=json.loads(path.read_text());report[name]=data['summary']
  report['seconds']=round(time.monotonic()-start_time,2);report['run']=stamp
  report['passed']=sum(v['passed']for name in ('backend','frontend','visual_review')for v in report[name].values());report['cases']=sum(v['cases']for name in ('backend','frontend','visual_review')for v in report[name].values())
  (output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2));print('보고서:',output.relative_to(ROOT))
  return 0 if report['passed']==report['cases']==140 and all(p.returncode==0 for _,p in tests) else 1
 finally:
  for _,p in tests:stop(p)
  for p in reversed(services):stop(p)
  for f in files:f.close()
if __name__=='__main__':raise SystemExit(main())
