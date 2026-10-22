#!/usr/bin/env python3
"""Complete public-account B2B scenarios using existing photo layouts and one buyer-role layout."""
from pathlib import Path
from collections import Counter
import copy,json,re,subprocess,sys
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'app/scripts'))
from proposal_content import P,S,C,cut,gallery
OUT=ROOT/'output/account-proposals';TARGET=ROOT/'app/web/src/domain/templates'
BRIEFS=json.loads((ROOT/'app/data/account_case_briefs.json').read_text());EVIDENCE=json.loads((ROOT/'app/data/account_case_sources.json').read_text());PHOTOS=json.loads((TARGET/'account_photo_assets.json').read_text())
class Slots(HTMLParser):
 def __init__(self):super().__init__();self.stack=[];self.text={};self.img={}
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);tb=None if 'data-img'in a else a.get('data-tb',self.stack[-1][1]if self.stack else None)
  if 'data-tb'in a and 'data-img'not in a:self.text.setdefault(a['data-tb'],'')
  if 'data-img'in a:self.img[a['data-img']]=a.get('data-hint','')
  if tag not in ['img','br','hr','input','meta','link','source','wbr','area','base','embed','param','track','col']:self.stack.append((tag,tb))
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,-1,-1):
   if self.stack[i][0]==tag:self.stack=self.stack[:i];break
 def handle_data(self,text):
  if self.stack and self.stack[-1][1]is not None:
   key=self.stack[-1][1];self.text[key]=self.text.get(key,'')+text

def schemas():
 code="""import fs from 'node:fs';import zlib from 'node:zlib';
import {PHOTO_HTML} from './app/web/src/domain/templates/photo_layouts.js';
import {STD_HTML} from './app/web/src/domain/templates/std_layouts.js';
import {ACCOUNT_HTML} from './app/web/src/domain/templates/account_layouts.js';
const html={...JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('app/data/layouts.b64','utf8'),'base64'))),...PHOTO_HTML,...STD_HTML,...ACCOUNT_HTML};process.stdout.write(JSON.stringify(html));"""
 raw=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],cwd=ROOT,text=True));result={}
 for f,html in raw.items():
  p=Slots();p.feed(html);result[f]={'t':p.text,'img':p.img}
 return result
SCHEMA=schemas()
BASE=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {SC} from './app/web/src/domain/templates/scenarios.js';process.stdout.write(JSON.stringify(SC));"],cwd=ROOT,text=True))
DATE=EVIDENCE['verifiedAt'];REVISION='public-account-analysis-v1'

def photo(r,fit='cover'):
 return {'src':r['src'],'name':r.get('desc',r.get('name','공식 공간 이미지'))+' · '+r.get('owner','공식 자료'),'fit':fit,'keep':True,'source':r.get('page',''),'kind':r.get('kind','s')}

def product(pid):
 r=cut(pid)
 if not r:raise ValueError('Missing product cut '+pid)
 return {**photo(r,'contain'),'products':[pid],'kind':'product'}

class Deck:
 def __init__(self,key,b):
  self.key=key;self.b=b;self.slides=[];self.stages=[];self.used=Counter();self.asset={p['id']:p for p in PHOTOS};self.case=gallery('case',b['proofCase']);self.ui={id:gallery('sol',id)for id in set(b['solutionScreens']+['lynk','vxt','smartthings','care'])}
  self.scenes=gallery('case','3080')if key=='inspire'else[p for p in PHOTOS if p['case']==key and p['w']>=500 and p['h']>=250 and 'brandSubVisual'not in p['id'] and 'loft_visual'not in p['id']]
  self.foot={'inspire':'인스파이어 · 공개자료 기반 검토안','paul':'엠즈씨드 폴 바셋 · 검토안','episode':'에피소드 용산241 · 검토안'}[key]
 def im(self,selector):
  if isinstance(selector,int):r=gallery('case','3080')[selector]
  else:r=self.asset[selector]
  return photo(r)
 def fresh(self,n,avoid=()):
  choices=[r for r in self.scenes if r['src']not in avoid];choices.sort(key=lambda r:(self.used[r['src']],r['src']));return [photo(r)for r in choices[:n]]
 def screen(self,kind,n=1,avoid=()):
  pool=[r for r in self.ui[kind]if r['kind']=='u'and r['w']>=350 and r['h']>=200 and r['src']not in avoid];pool.sort(key=lambda r:(self.used[r['src']],r['src']));return[photo(r,'contain')for r in pool[:n]]
 def add(self,f,role,values,images,stage,source_ids=None):
  t={int(k):str(v)for k,v in (values.items()if isinstance(values,dict)else enumerate(values))}
  if not f.startswith('L_C0'):
   m=max(map(int,SCHEMA[f]['t']));t.update({m-2:'업체 분석',m-1:self.foot,m:'CONFIDENTIAL · '+str(len(self.slides)+1)})
  expected=set(SCHEMA[f]['t']);assert set(map(str,t))==expected,(f,expected-set(map(str,t)),set(map(str,t))-expected)
  assert all(str(v).strip()for v in t.values()),f
  assert len(images)==len(SCHEMA[f]['img']),(f,len(images),len(SCHEMA[f]['img']))
  assert len({r['src']for r in images})==len(images),(f,'same-page photo repeated')
  assert not any(re.search(r'\[(?:00|N|모델명|고객사|이름|기간|그룹명)',v)for v in t.values()),f
  for r in images:self.used[r['src']]+=1
  selected=set(source_ids or self.b['sources']);sources=[s for s in EVIDENCE['sources']if s['id']in selected]
  note='[공개자료 기반 B2B 검토안]\n대상: '+self.b['customer']+' / '+self.b['brand']+'\n자료 확인: '+DATE+'\n'+self.b['public']+'\n\n[분석·제안]\n'+self.b['proposal']+'\n실제 고객의 의뢰·내부 예산·조직·현재 성과를 확인한 자료가 아닙니다. 협의 역할과 시범 수량·합격 기준은 제안안입니다.\n\n[이 장의 역할]\n'+role+'\n\n[근거]\n'+'\n'.join(s['id']+' · '+s['title']+'\n'+s['url']+'\n'+s['scope']for s in sources)
  self.slides.append({'f':f,'t':{str(i):v for i,v in t.items()},'img':dict(zip(SCHEMA[f]['img'],images)),'r':[['samsung.com 공식','공식 제공 이미지']],'notes':note});self.stages.append(stage)
 def build(self):
  b=self.b;k=self.key
  if k=='inspire':cover=self.im(6);profile=[self.im(i)for i in [0,4,2]];business=[self.im(i)for i in [1,3,7]]
  elif k=='paul':cover=self.im('paul-interiorSlide03');profile=[self.im('paul-interiorSlide0'+str(i))for i in [1,2,3]];business=[self.im('paul-baristaSlide01'),self.im('paul-baristaSlide02'),self.im('paul-interiorSlide02')]
  else:cover=self.im('episode-1-3-1');profile=[self.im('episode-1-1-1'),self.im('episode-CON-T-01'),self.im('episode-EPLOUNGE1')];business=[self.im('episode-ROOFTOP'),self.im('episode-3-R'),self.im('episode-5-3')]
  f='L_C02'if k=='inspire'else'L_C01'
  if f=='L_C02':t={1:'SAMSUNG',2:'BUSINESS PROPOSAL',3:b['cover'],4:b['promise'],5:'CONFIDENTIAL',6:b['customer']}
  else:t={1:'SAMSUNG',2:'BUSINESS PROPOSAL',3:b['cover'],4:b['promise'],5:b['customer'],6:'공개자료 기반 B2B 검토안',7:'CONFIDENTIAL'}
  self.add(f,'표지 · 실제 제안 대상과 검토 목적',t,[cover],'open')
  t={0:'01 · 제안 대상 기업',1:b['profileTitle'],2:'공개 정보와 제안 방향을 구분한 업체 프로필 · 자료 확인 '+DATE}
  t.update({i+3:v for i,v in enumerate(b['profileCaptions'])})
  for j,items in enumerate(b['profile']):t.update({6+j*3+i:v for i,v in enumerate(items)})
  self.add('L_PH_CB_P','운영 법인·브랜드·자산·기구축 투자에 대한 공개 사실',t,profile,'account')
  t={0:'01 · 사업·수익 구조',1:b['modelTitle'],2:'공개 사업 구조와 제안 원칙 · 실제 계약·권한·현재 성과는 사전 확인'}
  for j,items in enumerate(b['modelCards']):t.update({3+j*11+i:v for i,v in enumerate(items)})
  t.update({36+i:v for i,v in enumerate(b['valueFlow'])});self.add('L_PH_CB_M','제안 상대의 사업 구조와 주체별 수입·책임의 경계',t,business,'account')
  t={0:'01 · 사업 방향과 제안',1:b['strategyTitle'],2:'공개된 사업·브랜드 방향을 검토 가설로 연결 · 실제 경영 계획이나 내부 목표가 아님'}
  t.update({3+i:v for i,v in enumerate(b['strategyGoal'])})
  for j,items in enumerate(b['strategies']):
   start=[7,15,23][j];vals=['전략 0'+str(j+1),items[0],items[1],items[2],'이번 검토',items[3]]
   if j<2:vals +=[items[4],items[5]]
   t.update({start+i:v for i,v in enumerate(vals)})
  self.add('L_PH_CB_B','공개 사업 방향→실행 가설→제품·운영 제안의 연결',t,self.fresh(4),'account')
  t={0:'01 · 구매·운영 책임',1:b['governanceTitle'],2:'역할 기반 협의안 · 실제 조직·결재·계약 권한은 첫 협의에서 확인',3:'제안 대상 · 사업 범위',4:b['governanceCompany'],5:b['governanceScope']}
  for j,items in enumerate(b['governance']):t.update({6+j*4+i:v for i,v in enumerate(items)})
  for j,items in enumerate(b['boundaries']):t.update({22+j*2+i:v for i,v in enumerate(items)})
  self.add('L_AC_GOV_01','발주·투자·IT·현장·서비스의 승인 산출물과 책임',t,self.fresh(1),'account')
  t={0:'02 · 제안 범위',1:'사업 이해에서 시범 범위와 판단 기준을 도출합니다',2:'기존 자산·서비스를 먼저 대조하고, 지원 모델·권한·인수 조건을 정합니다',3:'공개 자료 · 검토안'}
  for j,items in enumerate(b['scope']):
   start=4+j*8;t.update({start:str(j+1),start+1:['WHY','WHAT','HOW','EVALUATE'][j],start+2:items[0],start+3:items[1],start+4:items[2],start+5:items[3],start+6:items[4]})
   if j<3:t[start+7]=['사업·자산 이해','적용·지원 검토','공동 검수'][j]
  imgs=self.fresh(2)+self.screen(b['solutionScreens'][0],2);self.add('L_PH_OV_E','업체의 사업 구조를 이번 제안 범위·평가 기준으로 연결',t,imgs,'scope')
  t={0:'02 · 내부 운영 접점',1:b['processTitle'],2:'제안 대상의 업무·승인·인수 지점을 검토하는 흐름 · 실제 장애·지연을 단정하지 않음'}
  for j,items in enumerate(b['process']):
   start=3+j*6;t.update({start:'0'+str(j+1),start+1:items[0],start+2:items[1],start+3:items[2],start+4:items[3],start+5:items[4]})
  t.update({33:'확인할 연결점',34:b['processCause']});self.add('L_PH_CB_C','최종 소비자 여정과 구분한 구매 기업의 내부 운영 흐름',t,self.fresh(3)+self.screen(b['solutionScreens'][0],2),'scope')
  f={'inspire':'L_PH_SS_HT_A','paul':'L_PH_SS_FB_A','episode':'L_PH_SS_RS_A'}[k];t={0:'03 · 구역·업무 적용',1:b['brand']+'의 공간을 운영 책임과 연결합니다',2:'공식 공간 사진과 솔루션 참고 화면 · 현재 모델·지원·권한은 현장에서 대조',3:'1',4:b['spaces'][0][0],5:'검토 기준',6:b['spaces'][0][1],7:b['spaces'][0][2],8:b['spaces'][0][3]}
  for j,items in enumerate(b['spaces'][1:]):
   start=9+j*4;t.update({start:str(j+2),start+1:items[0],start+2:items[1],start+3:items[3]})
  t.update({33:'운영 연결',34:'구역 → 담당 역할 → 검수 기록',35:'공개 사례와 적용 검토를 구분'})
  if k=='inspire':
   t.update({36:'LYNK Cloud',37:'기존 객실 채널·지원 항목 대조',38:'1',39:'콘텐츠 운영',40:'로비·행사·다이닝의 승인·게시 확인',41:'2',42:'3',43:'4',44:'기존 미디어',45:'LED·플레이어·콘텐츠의 운영 책임 확인',46:'5',47:'공동 검수',48:'운영·IT·마케팅의 인수·원복 기록',49:'3',50:'4',51:'6',52:'7',53:'계약·권한',54:'실제 발주·비용·접근 범위 확인',55:'1',56:'7'})
   images=[self.im(i)for i in [4,6,3,2,0,7]]+self.screen('lynk',1)
  elif k=='paul':
   t.update({36:'브랜드·품질 기준',37:'표현·메뉴·제조 동선과 검수 기준',38:'1',39:'2',40:'3',41:'4',42:'7',43:'Samsung VXT',44:'지원 모델의 콘텐츠·편성·게시 검수',45:'2',46:'3',47:'7',48:'매장별 공간',49:'일반·라운지·DT의 가독성·설치 조건',50:'1',51:'2',52:'3',53:'4',54:'5',55:'6',56:'기존 주문·회원 앱',57:'크라운 오더·결제·회원 데이터의 경계 유지',58:'3',59:'7',60:'운영 인수',61:'예외 변경·원복·현장 교육 기록',62:'1',63:'2',64:'3',65:'4',66:'5',67:'6',68:'7'})
   images=[self.im(x)for x in ['paul-interiorSlide01','paul-interiorSlide03','paul-baristaSlide02','paul-baristaSlide01','paul-interiorSlide02','paul-baristaSlide03']]+self.screen('vxt',1)
  else:
   t.update({36:'SmartThings',37:'기존 연결·개인 계정·지원 모델 대조',38:'1',39:'2',40:'3',41:'4',42:'5',43:'7',44:'기존 공조·가전',45:'실제 기기·연동·점검 항목의 목록화',46:'2',47:'3',48:'4',49:'자체 앱·출입',50:'기존 서비스 유지 · 개인·운영 접근 구분',51:'1',52:'5',53:'공용 설비',54:'공용 공간과 전용 세대의 책임을 분리',55:'6',56:'7',57:'운영 인수',58:'공실·입주·퇴거의 점검·해제·예외 조치',59:'1',60:'7'})
   images=[self.im(x)for x in ['episode-1-1-1','episode-1-1-2','episode-1-1-3','episode-1-3-3','episode-CON-T-01','episode-EPLOUNGE1','episode-3-R']]
  self.add(f,'공개된 사업장 공간과 운영·제품·지원 범위의 매핑',t,images,'site')
  t={0:'03 · 기존 자산과 제품',1:'현재 자산을 먼저 대조하고 필요한 범위만 보강합니다',2:'기존 설비·지원 조건 대조 → 적용 범위 판단 · 오른쪽 제품은 후보·제품군 참고',3:'기존 자산 우선',4:'조건 확인 후 보강',5:b['existing'][0],6:b['existing'][1],7:b['existing'][2],8:b['existing'][3],9:b['candidate'][0],10:b['candidate'][1],11:b['candidate'][2],12:b['candidate'][3]}
  self.add('L_PH_CH_B','현재 자산·서비스와 후보 제품의 조건부 적용 범위',t,self.fresh(1)+[product(b['product'])],'site')
  t={0:'04 · 솔루션·운영 기준',1:'기능 도입보다 승인·게시·인수 절차를 먼저 정합니다',2:b['solution']+' · 실제 모델·연동·권한은 확인 후 적용',24:'운영 인수',25:'역할·지원 범위·예외 조치의 기록을 공동 확인',26:'4단계 검수'}
  for j,items in enumerate(b['operations']):
   start=[3,8,14,19][j];t.update({start:str(j+1),start+1:items[0],start+2:items[1],start+3:items[2]})
   if j==1:t[start+4]=items[3];t[start+5]=items[4]
   else:t[start+4]=items[4]
  screens=self.screen(b['solutionScreens'][0],3);images=screens+self.fresh(1,avoid=[r['src']for r in screens]);self.add('L_PH_SOL_S','제품·솔루션 기능을 업체의 네 단계 운영 절차로 연결',t,images,'solution')
  t={0:'04 · 역할별 업무 시나리오',1:'제안 상대의 각 역할이 확인할 화면과 기록입니다',2:'공식 공간 사진·삼성 솔루션 참고 화면 · 실제 고객의 시스템 화면을 확인한 자료가 아님',3:'업무·담당 역할',4:'참고 화면·확인 항목',5:'인수 판단'}
  for j,items in enumerate(b['roleScenarios']):
   start=[6,13,20][j];t.update({start:items[0],start+1:items[1],start+2:items[2],start+3:items[3],start+4:['기록','검수','인수'][j],start+5:items[4],start+6:items[5]})
  ims=self.fresh(3)
  selected={'inspire':[('vxt',41),('lynk',3),('vxt',49)],'paul':[('vxt',3),('vxt',43),('vxt',49)],'episode':[('smartthings',1),('smartthings',3),('care',7)]}[k]
  screenpool=[photo(self.ui[kind][n],'contain')for kind,n in selected]
  images=[v for pair in zip(ims,screenpool)for v in pair];self.add('L_PH_SO_B','구매 기업의 승인·운영·IT 역할별 장면→화면→인수 기준',t,images,'solution')
  packages=b['packages'];a,m,e=packages;t={0:'04 · 도입 범위 선택',1:'기존 활용·시범 표준·연계 확장의 범위를 구분합니다',2:'범위 선택을 위한 검토안 · 최종 모델·수량·라이선스·비용은 지원 확인 후 협의',3:a[0],4:a[1],5:a[2],6:'·',7:a[3][0],8:a[3][1],9:a[4][0],10:a[4][1],11:a[5][0],12:a[5][1],13:m[0],14:'검토 중심',15:m[1],16:m[2],17:'·',18:m[3][0],19:m[3][1],20:'+',21:m[4][0],22:m[4][1],23:'+',24:m[5][0],25:m[5][1],26:'운영',27:'지원·예외를 시범에서 검수',28:'승인',29:'추가 비용·개발은 별도 승인',30:e[0],31:e[1],32:e[2],33:'·',34:e[3][0],35:e[3][1],36:'+',37:e[4][0],38:e[4][1],39:'+',40:e[5][0],41:e[5][1],42:'계약',43:'연계·개발의 계약·비용 협의',44:'확산',45:'결과와 예산으로 다음 범위 결정',46:'지원 모델·현재 자산을 대조한 뒤 수량·견적·연동 계약을 확정합니다.'}
  self.add('L_PH_P_O','한 번에 전면 교체하지 않고 사업자의 투자·운영 범위를 선택',t,self.fresh(3),'solution')
  case=C[b['proofCase']];t={0:'05 · 공개 사례·근거',1:b['proofTitle'],2:case['cust']+' · 삼성 공식 공개사례 · 해당 기업의 도입 사실과 이번 검토안을 구분',3:'1',4:'2',5:'3',6:'공개 근거와 적용 판단'}
  for j,(h,body)in enumerate(b['proofPoints']):t.update({7+j*3:str(j+1),8+j*3:h,9+j*3:body})
  t[16]='근거 · 삼성전자 공식 사례 '+b['proofCase']
  picks=[self.case[i]for i in ({'inspire':[6,0,7,5],'paul':[6,0,1,4],'episode':[6,0,4,2]}[k])];self.add('L_AIS_29','공개 도입사례의 사실과 제안 대상에게 적용할 검증을 구분',t,[photo(r)for r in picks],'proof',[{'inspire':'inspire-case','paul':'vxt-case','episode':'episode-case'}[k]])
  t={0:'시범 대상 · 공개 공간 이미지',1:b['brand']+'의 검증 범위',2:'05 · 시범 합격 기준',3:'성과 수치 대신 통과 조건부터 합의합니다',4:'현재 성과는 미확정 · 아래 지표와 수량은 공동 검토할 제안 기준'}
  for j,items in enumerate(b['evaluation']):t.update({5+j*4:'0'+str(j+1),6+j*4:items[0],7+j*4:items[1],8+j*4:items[2]})
  self.add('L_PH_OV_H','현재 수치를 꾸미지 않고 시범 지표·측정·합격 조건을 명시',t,self.fresh(1),'proof')
  t={0:'06 · 시범 실행 계획',1:'사업자·운영·IT의 산출물을 네 단계로 인수합니다',2:'8주 시범은 검토안 · 실제 일정·대상·비용은 사전 대조 후 확정',3:'1–2주',4:'3–6주',5:'7주',6:'8주'}
  for j,items in enumerate(b['execution']):
   start=7+j*7;t.update({start:'0'+str(j+1),start+1:items[0],start+2:items[1],start+3:'산출물',start+4:items[2],start+5:'담당',start+6:items[3]})
  self.add('L_PH_IP_A','실사·지원 검토·운영 인수·확산 판단의 역할과 산출물',t,self.fresh(2)+self.screen(b['solutionScreens'][0],1)+[photo(gallery('sol','care')[8])],'plan')
  t={0:'06 · 단계별 합의',1:'시범 결과와 실제 계약으로 다음 범위를 결정합니다',2:'범위·기간·합격 조건은 제안안 · 기존 성과·절감률·예산을 확인한 자료가 아님',18:b['pilot']}
  for j,items in enumerate(b['phases']):t.update({3+j*5:items[0],4+j*5:items[1],5:'다음 단계의 합의 조건',6+j*5:items[2],7+j*5:items[3]})
  t[10]='다음 단계의 합의 조건';t[15]='다음 단계의 합의 조건'
  self.add('L_PH_PL_A','시범 수량·기간과 확산 의사결정의 합격 기준',t,self.fresh(3),'plan')
  close=b['close'];t={0:'제안 대상 · 공식 공간',1:b['brand'],2:'07 · 다음 협의',3:'사업 주체와 시범 인수 범위를 합의합니다',4:'운영 역할·자산·지원 조건을 확인하고 다음 행동을 결정합니다',20:'협의 역할',21:' · '.join(b['audience'][:2])}
  for j in range(3):t.update({5+j*5:'0'+str(j+1),6+j*5:close[j*3],7+j*5:close[j*3+1],8+j*5:['사전 협의','실사 합의','공동 판정'][j],9+j*5:close[j*3+2]})
  self.add('L_PH_C13','구매 기업의 책임·자산·권한과 다음 검토 행동으로 종료',t,self.fresh(1),'close')
  assert len(self.slides)==17,len(self.slides)
  names={'open':('open','표지','실제 제안 대상과 검토 목적'), 'account':('context','제안 대상·사업 이해','운영 법인·사업 구조·기존 투자·구매 역할을 분석'), 'scope':('value','사업 과제·제안 범위','분석을 업무·검증 범위로 연결'),'site':('space','구역·기기 검토','기존 공간·설비와 조건부 후보 제품 대조'),'solution':('build','운영 솔루션·역할','승인·게시·검수·인수 기준을 구체화'),'proof':('proof','근거·성과 검증','공개 사실과 시범 평가 기준을 구분'),'plan':('plan','시범·확산 실행','산출물과 확산 판단을 단계별 합의'),'close':('close','다음 협의','검토 주체·지원 조건·다음 행동 확정')}
  flow=[];story={'keymen':[[role,[35,25,20,20][j],[[b['governance'][j][2],b['governance'][j][3]][q]for q in range(2)]]for j,role in enumerate(b['audience'])],'note':b['public']+'\n'+b['proposal'],'parts':{}}
  for slide,stage in zip(self.slides,self.stages):
   key,name,goal=names[stage]
   if not flow or flow[-1]['name']!=name:flow.append({'key':key,'name':name,'goal':goal,'slides':[]})
  # Roles are recorded independently so the filled payload remains the same as existing scenarios.
  roles=[x['notes'].split('[이 장의 역할]\n')[1].split('\n\n')[0]for x in self.slides]
  cursor=0
  for group in flow:
   stage=next(s for s,v in names.items()if v[1]==group['name']);n=self.stages.count(stage)
   group['slides']=[{'f':self.slides[cursor+j]['f'],'role':roles[cursor+j]}for j in range(n)];cursor+=n
   story['parts'][group['name']]={'type':{'open':'cover','account':'customer','scope':'overview','site':'products','solution':'solution','proof':'case','plan':'execution','close':'closing'}[stage],'items':[x['role']for x in group['slides']]}
  scenario=copy.deepcopy(BASE[b['base']]);scenario.pop('preview',None);scenario.update(id=b['id'],title=b['title'],short=b['promise'],ind=b['ind'],req='ops',strategy='pain',ending='pilot',situation=b['public']+' '+b['proposal'],signals=[b['public'],b['proposal'],'실제 조직·계약·예산·현재 성과는 공개자료로 확정하지 않음'],audience={'lead':b['audience'][0],'others':b['audience'][1:]},criteria=[x[0]for x in b['evaluation']]+['기존 자산·앱·계약 경계의 유지'],thesis=b['promise'],logic=[g['name']for g in flow if g['key']!='open'],diff=['제안 대상 업체·운영 법인·브랜드·자산의 사업 분석','발주·운영·이용자의 책임과 승인 산출물 구분','공개 사실·분석·시범 제안 기준을 분리'],tone='공개 근거와 협의 가설을 구분하고 사업자의 책임·인수 산출물로 설명',messages=b['promise'].split(' · '),flow=flow,ask=b['pilot']+'의 사전 검토·시범 조건 합의',next=[b['close'][0],b['close'][3],b['close'][6]],prep=['현재 계약·발주·운영 역할과 예산 승인 경계','실제 설치 모델·라이선스·연동·권한 목록','시범 기준선·검수·예외·원복 기록'],products=b['products'],solutions=b['solutions'],cases=b['cases'],kpis=[x[0]for x in b['evaluation']],objections=[['이미 갖춘 기기·앱이 있는데 무엇을 더 제안하나요?','기존 투자를 먼저 대조하고, 이번 범위는 승인·점검·인수의 운영 기준을 검증합니다.'],['이 내용이 회사의 실제 내부 계획이나 확정 성과인가요?','공개자료 기반 검토안입니다. 실제 조직·계약·예산·현재 지표는 협의하고 시범으로 검증합니다.']],fit='실제 운영 법인·사업장에 대한 첫 B2B 협의와 시범 설계',avoid='실사 없이 최종 견적·확정 성과·실제 내부 조직을 단정해야 하는 경우',minutes=35,authoringRevision=REVISION,coverRevision='single-photo-cover-v1',sourceMode='public-account-analysis',sourceSpec='account_'+k,referenceScenario=b['base'],research={'verifiedAt':DATE,'sources':b['sources'],'facts':EVIDENCE['accounts'][k]['facts'],'unverified':EVIDENCE['accounts'][k]['unverified'],'documents':[x for x in EVIDENCE['sources']if x['id']in b['sources']]})
  return scenario,self.slides,story

def main():
 result={'scenarios':[],'fills':{},'story':{},'customers':{},'sources':EVIDENCE['sources']}
 for key,b in BRIEFS.items():
  if key=='verifiedAt':continue
  d=Deck(key,b);s,slides,story=d.build();result['scenarios'].append(s);result['fills'][s['id']]=slides;result['story'][s['id']]=story;result['customers'][s['id']]=b['customer'];print(s['id'],len(slides),'pages',len(d.used),'images')
 (TARGET/'account_scenarios.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
 (OUT/'authoring-summary.json').write_text(json.dumps({'scenarios':len(result['scenarios']),'slides':sum(map(len,result['fills'].values())),'newLayouts':['L_AC_GOV_01'],'existingLayoutTypes':sorted({p['f']for v in result['fills'].values()for p in v if p['f']!='L_AC_GOV_01'}),'revision':REVISION},ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
