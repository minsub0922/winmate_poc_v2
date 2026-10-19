"""Opt-in live-provider smoke. Small synthetic inputs, no credentials in output."""
import json,os,time,urllib.request
from pathlib import Path
BASE=os.environ.get('WINMATE_TEST_URL','http://127.0.0.1:8790')
OUT=Path(__file__).resolve().parent/'output'
OUT.mkdir(exist_ok=True)
def call(path,body=None):
 req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=300) as r:return json.load(r)
text='''# 카페 메뉴보드 도입 제안\n고객사: 테스트 커피\n사업명: 전국 매장 디지털 메뉴보드 전환\n매장 3곳에 QM55 디스플레이를 각 2대 도입한다. MagicINFO로 메뉴와 가격을 원격 관리한다. 점장의 콘텐츠 변경 시간을 줄이고 고객의 주문 대기 경험을 개선한다. 예산은 2천만원이다. 파일럿은 4주 안에 완료하고 점장 교육과 유지보수 지원을 포함한다. 운영 담당자는 쉬운 원격 관리, 구매 담당자는 비용과 도입 효과를 중요하게 본다. 현장 네트워크와 설치 위치는 추가 확인이 필요하다.'''
report={'base':BASE,'checks':[]}
def run(kind,body):
 t=time.time();snap=call('/api/jobs',{'kind':kind,**body});jid=snap.get('id');answered=False
 if not jid: raise RuntimeError(snap)
 while time.time()-t<900:
  snap=call('/api/jobs/'+jid)
  if snap['status']=='waiting':
   answered=True; call('/api/jobs/'+jid+'/answer',{'use_defaults':True,'answers':{}})
  elif snap['status'] in ('done','error','cancelled'):break
  time.sleep(.5)
 assert snap['status']=='done', (kind,snap.get('error'))
 result=snap.get('result') or {}
 assert result.get('llm',{}).get('llm_used'), (kind,result.get('llm'))
 (OUT/('poc-live-'+kind+'.json')).write_text(json.dumps(snap,ensure_ascii=False,indent=2))
 result=snap.get('result') or {}
 report['checks'].append({'kind':kind,'status':snap['status'],'answered_interrupt':answered,'seconds':round(time.time()-t,1),'llm':result.get('llm'),'error':snap.get('error'),'keys':list(result)})
 (OUT/'poc-live-smoke.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 return result
if __name__=='__main__':
 run('rfp',{'text':text,'condition':'single'})
 run('layout',{'input':{'title':'카페 메뉴보드 도입','customer':'테스트 커피','project':'카페 디지털 메뉴보드','free_text':text,'products':['qm55c'],'solutions':['magicinfo']},'max_slides':3,'interactive':True,'force_level':'complex'})
 run('storyboard',{'proposal':{'id':'smoke','title':'메뉴보드 도입','req':{'project':'카페 메뉴보드','customer':'테스트 커피','target':'매장 점장','free':[{'t':text}],'keymen':[]},'ctx':{'products':['qm55c'],'solutions':[],'cases':[]},'parts':[{'id':'old','type':'challenge','name':'운영 과제','items':[{'text':'메뉴 교체 시간을 줄인다'}],'layouts':[]}]}})
 run('review',{'doc':{'kind':'txt','name':'합성 제안서','units':[{'title':'운영 과제','text':'매장별 메뉴 가격 수정에 하루 30분이 소요된다. 원격 관리로 변경 시간을 줄인다.'},{'title':'도입 효과 KPI','text':'QM55 6대와 MagicINFO로 메뉴를 관리한다. 파일럿 전후 메뉴 변경 시간을 비교한다.'},{'title':'실행 일정','text':'1주차 현장 조사, 2주차 설치, 3주차 교육, 4주차 검증. 담당자와 승인 조건은 협의한다.'}]},'context':{'title':'카페 메뉴보드 전환','customer':'테스트 커피'},'budget':4,'min_k':4})
 print(json.dumps(report,ensure_ascii=False,indent=2))
