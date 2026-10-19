"""Ten genuinely live Gemini cases for each server workflow (no provider overrides/cache/offline).
Explicit integration run only: WINMATE_LIVE_URL=http://127.0.0.1:8790 python -B app/tests/live_backend.py
"""
from pathlib import Path
import concurrent.futures,json,os,statistics,threading,time,urllib.request,urllib.error
ROOT=Path(__file__).resolve().parents[2]
CASES=json.loads((ROOT/'app/tests/fixtures/strict/live-cases.json').read_text())
BASE=os.environ.get('WINMATE_LIVE_URL','http://127.0.0.1:8790')
OUT=ROOT/'app/tests/output/strict/live-backend'/os.environ.get('LIVE_RUN','final');OUT.mkdir(parents=True,exist_ok=True)
FEATURES=os.environ.get('LIVE_FEATURES','rfp,layout,storyboard,search,review').split(',')
LIMIT=int(os.environ.get('LIVE_LIMIT','10'))
LOCK=threading.Lock();rows=[]

def call(path,body=None):
 data=json.dumps(body,ensure_ascii=False).encode() if body is not None else None
 req=urllib.request.Request(BASE+path,data=data,headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=180) as response:return json.load(response)
 except urllib.error.HTTPError as exc:
  try:detail=json.load(exc)
  except Exception:detail={'code':'http_error'}
  raise RuntimeError(f'HTTP {exc.code} {detail}') from None

def wait_job(snapshot):
 start=time.monotonic();answers=0
 assert snapshot.get('id'),snapshot
 while time.monotonic()-start<240:
  s=call('/api/jobs/'+snapshot['id'])
  if s['status']=='waiting':
   assert s.get('waiting',{}).get('questions'),'missing strategy questions'
   call('/api/jobs/'+s['id']+'/answer',{'answers':{},'use_defaults':True});answers+=1
  elif s['status'] in ('done','error','cancelled'):
   assert s['status']=='done',s.get('error')
   return s,answers
  time.sleep(.25)
 raise TimeoutError('job exceeded 240s')

def mode_ok(result):
 llm=result.get('llm') or {}
 assert llm.get('effective')=='llm' and llm.get('llm_used') and llm.get('calls_ok',0)>0,llm
 assert llm.get('cached',0)==0,llm
 assert not llm.get('fallbacks'),llm
 return llm

def body_for(feature,c,index):
 if feature=='rfp':return {'kind':'rfp','text':c['text'],'condition':['single','chunk_nocarry','chunk_carry','chunk_carry_gap'][index%4],'max_chars':900,'title':c['proposal']['title']}
 if feature=='layout':
  level=['minimal','ambiguous','complex'][index%3]
  inp=dict(c['layout_input'])
  if level=='minimal':inp['free_text']='신규 장비 도입 검토. 세부 수량과 예산은 미정.';inp['keymen']=[]
  return {'kind':'layout','input':inp,'force_level':level,'interactive':True,'max_slides':3}
 if feature=='storyboard':return {'kind':'storyboard','proposal':c['proposal'],'mode':'continue','seed':index}
 if feature=='review':return {'kind':'review','doc':c['review_doc'],'context':{'title':c['proposal']['title'],'customer':c['company'],'ind':c['industry']},'budget':4,'min_k':4}
 raise KeyError(feature)

def one(feature,c,index):
 t=time.monotonic();row={'feature':feature,'case':c['id'],'topic':c['topic'],'pass':False}
 try:
  if feature=='search':
   r=call('/api/layouts/search',{'q':c['queries'],'industry':c['industry'],'products':[c['product']],'k':8})
   assert r.get('mode')=='real',r
   assert 'gemini' in r.get('engine','').lower(),r
   assert r.get('items') and len({x['f']for x in r['items']})==len(r['items']),r
   assert all(x.get('why')for x in r['items']),r
   llm=r.get('llm') or {};assert llm.get('llm_used') or r.get('model'),r
   row.update(items=len(r['items']),model=llm.get('model') or r.get('model'),llm=llm)
  else:
   snapshot,answers=wait_job(call('/api/jobs',body_for(feature,c,index)));r=snapshot['result'];llm=mode_ok(r)
   row.update(job_id=snapshot['id'],llm=llm,interrupt_answers=answers)
   if feature=='rfp':
    assert r.get('forms') and r.get('items'),'no extracted requirements'
    assert r.get('guards',{}).get('grounded_rate',0)>=.85,r.get('guards')
    assert all(f.get('project')and f.get('keymen')for f in r['forms']),r['forms']
    row.update(forms=len(r['forms']),requirements=len(r['items']),grounded_rate=r['guards']['grounded_rate'])
   elif feature=='layout':
    assert r.get('slides') and r.get('app_proposal',{}).get('parts'),r.keys()
    assert all(s.get('f')and s.get('texts') for s in r['slides']),'unfilled slide'
    row.update(slides=len(r['slides']),route=r.get('route'),requirements=len((r.get('analysis') or {}).get('requirements',[])))
   elif feature=='storyboard':
    assert r.get('app_parts'),'continuation returned no parts'
    assert all(p.get('name')and p.get('items')for p in r['app_parts']),r['app_parts']
    assert all(p.get('name')!='운영 과제'for p in r['app_parts']),'duplicated existing part'
    row['parts']=len(r['app_parts'])
   elif feature=='review':
    ev=r.get('evaluation') or {};scores=ev.get('scores') or []
    assert len(scores)>=4 and all(s.get('mode')=='llm' and s.get('score') in [1,2,3] for s in scores),scores
    assert 0<=ev['aggregate']['total']<=100,ev['aggregate']
    assert all((e.get('sheet')==0 and not e.get('quote','').strip()) or 1<=e.get('sheet',0)<=3 for s in scores for e in s.get('evidence',[])),'invalid evidence sheet (0 is only allowed for missing evidence with empty quote)'
    row.update(criteria=len(scores),score=ev['aggregate']['total'])
  row['pass']=True
  (OUT/(feature+'-'+c['id']+'.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2))
 except Exception as exc:row['error']=f'{type(exc).__name__}: {exc}'[:1600]
 row['seconds']=round(time.monotonic()-t,3)
 with LOCK:
  rows.append(row);(OUT/'progress.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2));print(json.dumps(row,ensure_ascii=False),flush=True)
 return row

def main():
 deadline=time.monotonic()+90
 while True:
  try:
   assert call('/api/health')['llm_mode']=='real'
   break
  except Exception:
   if time.monotonic()>deadline:raise RuntimeError('real API did not become ready')
   time.sleep(.25)
 for feature in FEATURES:
  with concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get('LIVE_WORKERS','2'))) as pool:
   list(pool.map(lambda pair:one(feature,pair[1],pair[0]),enumerate(CASES[:LIMIT])))
 summary={}
 for feature in FEATURES:
  group=[r for r in rows if r['feature']==feature];times=sorted(r['seconds']for r in group)
  summary[feature]={'cases':len(group),'passed':sum(r['pass']for r in group),'failed':sum(not r['pass']for r in group),'median_s':statistics.median(times),'p95_s':times[min(len(times)-1,int(len(times)*.95))],'max_s':max(times)}
 report={'actual_gemini':True,'base':BASE,'summary':summary,'cases':rows}
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))
 return 1 if any(not r['pass']for r in rows) else 0
if __name__=='__main__':raise SystemExit(main())
