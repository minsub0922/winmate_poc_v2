#!/usr/bin/env python3
"""Author complete decks using only the pre-existing Winmate layout registry."""
import copy,json,re,subprocess,hashlib
from collections import Counter
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from vertical_briefs import BRIEFS
from proposal_content import ROOT,P,S,C,IMAGES,SPACE_WORDS,SPACE_HINTS,gallery,cut

OUT=ROOT/'output/rebuild-existing'
TARGET=ROOT/'app/web/src/domain/templates'
OUT.mkdir(exist_ok=True,parents=True)
REVISION='existing-layouts-v1'

SPACES={
 'ai_apartment':'세대 거실|주방|침실·자녀방|드레스룸·세탁실|단지 로비|커뮤니티 시설|관리사무소',
 'ai_office':'업무층|회의실|공용 라운지|로비·방문 동선|강당·교육장|시설 관제실|기계실',
 'ai_store':'매장 입구|주문 카운터|셀프 주문존|픽업 구역|좌석 공간|주방 지원실|본사 운영실',
 'entertainment':'입장 로비|상영관|매점|공연장|체험존|전시 공간|운영 관제실',
 'knowledge_industry_center':'분양 홍보관|입주사 업무층|공용 회의실|입주사 라운지|로비·공용 동선|관리사무소|기계실',
 'senior_town':'세대 거실|세대 침실|커뮤니티 라운지|프로그램실|식당|생활 지원실|시설 관리실',
 'smart_academy':'학원 입구|상담실|강의실|디지털 실습실|자습실|교무실|시설 관리실',
 'smart_barracks':'교육장|행정 업무실|생활관|세탁실|식당|부대 안내 구역|시설 관리실',
 'smart_factory':'생산 현장|물류 입출고|품질 검사 구역|연구실|현장 교육장|직원 휴게실|시설 관제실',
 'smart_finance':'디지털 창구|상담실|고객 대기 공간|무인 업무존|방문 상담|행정 지원실|지점 운영실',
 'smart_home':'세대 거실|주방|침실·자녀방|드레스룸·세탁실|현관|커뮤니티 시설|관리사무소',
 'smart_hospital':'원무 접수|진료 대기실|입원 병실|간호 스테이션|외래 상담실|직원 교육장|시설 관리실',
 'smart_hotel':'로비·프런트|객실|레스토랑|연회장|피트니스|세탁실|백오피스',
 'smart_network':'매장 입구|상품 체험존|개통 상담|고객 대기 공간|액세서리존|단말 준비실|지점 운영실',
 'smart_office':'업무층|회의실|공용 라운지|로비·방문 동선|강당·교육장|시설 관제실|기계실',
 'smart_public':'민원 안내홀|서비스 창구|직원 업무실|회의실|교육장|통합 관제실|기계실',
 'smart_retail':'쇼윈도|브랜드 입구|상품 체험존|상담·결제|픽업 구역|직원 휴게실|매장 운영실',
 'smart_school':'교실|특별교실|도서관|학생 라운지|강당·방송실|교무실|시설 관리실',
 'smart_transportation':'터미널 대합실|탑승구|역사 통로|플랫폼|직원 사무실|운영 상황실|기계실',
 'smart_university':'강의실|도서관|학생 라운지|강당·행사장|행정실|연구실|시설 관제실',
}
IND_LAYOUT={'RS':'RS','OF':'OF','FB':'FB','VN':'VN','MD':'MD','ED':'ED','MF':'MF','FN':'FN','HT':'HT','RT':'RT','PB':'PB','TC':'RT','OE':'OE'}
REFERENCE={'RS':'bs04','OF':'bs02','FB':'bs01','VN':'bs12','MD':'bs08','ED':'bs03','MF':'bs14','FN':'bs17','HT':'bs07','RT':'bs06','PB':'bs11','TC':'bs06','OE':'bs18'}

class Slots(HTMLParser):
 def __init__(self):super().__init__();self.stack=[];self.text={};self.images={}
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);self.stack.append(a.get('data-tb',self.stack[-1]if self.stack else None))
  if 'data-img'in a:self.images[a['data-img']]=a.get('data-hint','')
  if tag in ['img','br','hr','input','meta','link']:self.stack.pop()
 def handle_endtag(self,tag):
  if self.stack:self.stack.pop()
 def handle_startendtag(self,tag,attrs):
  self.handle_starttag(tag,attrs)
  if tag not in ['img','br','hr','input','meta','link']:self.handle_endtag(tag)
 def handle_data(self,text):
  if self.stack and self.stack[-1]is not None:self.text[self.stack[-1]]=self.text.get(self.stack[-1],'')+text

def registry():
 code="""import fs from 'node:fs';import zlib from 'node:zlib';
import {PHOTO_META,PHOTO_HTML} from './app/web/src/domain/templates/photo_layouts.js';
import {STD_META,STD_HTML} from './app/web/src/domain/templates/std_layouts.js';
import {SPATIAL_META,SPATIAL_HTML} from './app/web/src/domain/templates/spatial-layouts.js';
const cat=JSON.parse(fs.readFileSync('app/data/catalog.json'));const html=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('app/data/layouts.b64','utf8'),'base64')));
process.stdout.write(JSON.stringify({metadata:[...cat.layouts,...PHOTO_META,...STD_META,...SPATIAL_META],html:{...html,...PHOTO_HTML,...STD_HTML,...SPATIAL_HTML}}));"""
 x=json.loads(subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,check=True,capture_output=True,text=True).stdout)
 layouts={}
 for meta in x['metadata']:
  f=meta['f'];p=Slots();p.feed(x['html'][f]);layouts[f]={'meta':meta,'text':p.text,'images':p.images}
 return layouts

LAYOUTS=registry()
def media(record,fit='cover'):
 return {'src':record['src'],'name':record.get('desc',record.get('name','공식 참고사진'))+' · '+record.get('owner','삼성전자 등록 자료'),'fit':fit,'keep':True,'source':record.get('page','')}

def product_picture(pid):
 p=P[pid]
 if p.get('gal'):
  for i,src in enumerate(p['gal']):
   alt=(p.get('galAlt')or[''])[min(i,len(p.get('galAlt')or[''])-1)]
   kind=(p.get('galKind')or[])
   if (i<len(kind)and kind[i]=='cut')or(re.search(r'정면|전면|사선|후면',alt)and not re.search(r'사용 장면|공간|설치|화면에',alt)):
    return {'src':src,'name':p['name']+' · '+alt,'fit':'contain','keep':True,'products':[pid]}
 r=cut(pid)
 if r:return {**media(r,'contain'),'products':[pid]}
 if p.get('th'):return {'src':p['th'],'name':p['name']+' 공식 제품 이미지','fit':'contain','keep':True,'products':[pid]}
 raise ValueError('No product image '+pid)

class Pictures:
 def __init__(self,b):
  self.b=b;self.used=Counter();self.pool={}
  for cid,c in C.items():
   for im in gallery('case',cid):
    if im['kind']in['s','e','p']and im['w']>=500 and im['h']>=270:self.pool[im['src']]={**im,'preferred':cid in b['cases']}
  for key,im in IMAGES.items():
   if key.startswith('ph.')and im.get('src')in['case','life']and'gray'not in key and(ROOT/'app/data/static'/im['file']).is_file():
    self.pool.setdefault(im['file'],{'src':im['file'],'desc':im['desc'],'w':im.get('w',1000),'h':im.get('h',600),'ind':key.split('.')[1].split('-')[0].upper(),'owner':'삼성전자 공식 참고사진','page':im.get('page','')})
 def scene(self,query):
  q=query
  for label in sorted(SPACE_HINTS,key=len,reverse=True):
   if q.startswith(label):q=SPACE_HINTS[label]+q[len(label):];break
  def score(im):
   d=im['desc'];s=8*(im.get('ind')==self.b['ind'])+4*im.get('preferred',False)
   for a,z in SPACE_WORDS:
    if re.search(a,q)and re.search(z,d):s+=18
   for word in q.split():
    if len(word)>1 and word in d:s+=6
   if re.search(r'거실|세대|주방|침실',q)and re.search(r'학교|교실|학원|병원|병실|수업',d):s-=70
   if re.search(r'병실|간호',q)and not re.search(r'병원|병실|간호|의료',d):s-=35
   if re.search(r'물류|출고|생산',q)and not re.search(r'공장|작업|물류|제조|배송|택배|창고',d):s-=35
   if re.search(r'외관|조감|실외기|건물 전경|항공',d)and not re.search(r'외벽|기계|기계실|설비|옥상|열원|입구',q):s-=25
   s+=min(3,im.get('w',600)/600);s-=min(4,self.used[im['src']])
   return s
  im=max(self.pool.values(),key=score);self.used[im['src']]+=1;return media(im)
 def case(self,cid,n):
  pool=[im for im in gallery('case',cid)if im['kind']in['s','e','p','u','d']and im['w']>=400]
  if len(pool)<n:pool=[im for im in gallery('case',cid)if im['w']>=260]
  if not pool:raise ValueError('No case image '+cid)
  return [media(pool[i%len(pool)])for i in range(n)]
 def solution(self,sid):
  pool=gallery('solution',sid);ui=[im for im in pool if im['kind']in['u','d']]
  return media((ui or pool)[0],'contain')if pool else self.scene('관리실 관제 화면')

def space_content(name,products):
 rules=[
  (r'관제|관리|운영|백오피스|기계실',('기기 상태·알림·조치 이력을 한 흐름으로 확인','운영 담당자', ['dvms2','qm55c','wf4way','tabs11'])),
  (r'회의|교육장|강의|교실|실습|프로그램|강당',('설명·필기·공유를 같은 화면에서 연결','강사·참석자', ['flip','tabs11','qm55c','wf4way'])),
  (r'주방|레스토랑|식당|매점',('조리·안내·실내 환경을 운영 시간에 맞춰 관리','직원·이용자', ['bi_fridge','bi_induction','bi_dish','qm55c','ac360'])),
  (r'세탁|드레스',('의류 관리와 점검·인계 절차를 함께 정리','이용자·시설 담당', ['laundry','airdresser','purifier'])),
  (r'객실|병실|침실|생활관',('온도·공기질·안내를 편안한 이용 환경으로 연결','투숙객·입주자·직원', ['wf1way','hoteltv','purifier','tabs11'])),
  (r'입구|로비|안내|대기|동선|탑승|통로|플랫폼|쇼윈도',('필요한 안내와 콘텐츠를 동선에 맞춰 전달','방문객·안내 담당', ['qm55c','window','led_indoor','kiosk'])),
  (r'상담|창구|행정|교무|사무|준비실',('정보 확인·설명·기록·기기 회수까지 연결','상담·업무 담당', ['tabs11','book','tabactive5','qm55c'])),
  (r'물류|입출고|생산|품질',('스캔·확인·인계 기록을 현장 업무에 연결','작업자·현장 관리자', ['tabactive5','xcover7','watch','qm55c'])),
  (r'상영|공연|전시|체험|연회',('화면·음향·콘텐츠를 공간의 경험에 맞게 구성','관람객·행사 운영', ['onyx','led_indoor','harman','qm55c'])),
  (r'거실|커뮤니티|현관',('기기 제어와 생활 안내를 익숙한 사용 장면으로 구성','입주자·관리자', ['wf1way','purifier','qm55c','bi_fridge'])),
 ]
 for rx,(action,actor,preferred)in rules:
  if re.search(rx,name):break
 else:action,actor,preferred='사용·안내·점검을 공간 운영과 연결','이용자·운영자',products
 ids=[p for p in preferred if p in products]+[p for p in products if p not in preferred]
 return {'name':name,'action':action,'actor':actor,'products':ids[:3]}

FLOWS={
 'smartthings':['기기 연결','생활 장면 설정','앱·음성 조작','계정·기기 인계'],
 'stpro':['사업장·구역 등록','운영 스케줄 설정','상태·사용량 확인','알림·조치 이력 관리'],
 'biot':['설비·계량 연동','관제 구역 설정','운전·에너지 확인','점검·운영 보고'],
 'sac':['실내기 그룹 구성','운전 조건 설정','스케줄·피크 관리','점검·설정 이관'],
 'magicinfo':['콘텐츠 제작','권한·승인 설정','예약·일괄 배포','적용·장애 확인'],
 'vxt':['콘텐츠 제작','계정·권한 설정','예약·원격 배포','재생·기기 상태 확인'],
 'lynk':['호텔·연동 정책 확인','객실 콘텐츠 구성','TV·서비스 운영','체크아웃 처리 확인'],
 'knoxsuite':['업무 정책 설계','앱·설정 배포','상태·예외 조치','회수·초기화'],
 'knoxcapture':['바코드 스캔','데이터 검증','업무 시스템 연동','처리 결과 확인'],
 'dex':['업무 단말 연결','화면·입력 확장','문서 작업·공유','세션·기기 종료'],
 'care':['기기·환경 진단','범위·일정 협의','세척·점검 수행','결과·이력 인계'],
}

class Deck:
 def __init__(self,b,old,std,variant=0):
  self.b=b;self.std=std;self.v=b['variants'][variant];self.old=copy.deepcopy(old);self.customer=b['name']if std else self.v['customer'];self.name=b['name'];self.pic=Pictures(b);self.slides=[];self.stage=[]
  core=list(b['products']);previous=old.get('products',[])
  self.products=list(dict.fromkeys(core+[p for p in previous if p in P and b['ind']in P[p].get('ind',[])]))if std else core
  self.solutions=list(b['solutions']);self.cases=list(b['cases']);self.spaces=[space_content(n,self.products)for n in SPACES[b['key']].split('|')]
  self.logo='업종 표준'if std else'제안 예시';self.project=b['name']+' 표준 제안서'if std else self.v['title'];self.pains=self.v['pains'];self.measures=self.v['measures'];self.promise=self.v['promise'];self.pilot='대표 공간·운영 담당자 선정'if std else self.v['pilot'];self.condition=self.v['condition']
 def names(self,ids):return ' · '.join(P[p]['name']for p in ids)
 def shortspec(self,p):return ' · '.join(P[p]['spec'].split(' · ')[:2])
 def add(self,f,role,t,imgs,kind):
  schema=LAYOUTS[f];missing=set(schema['text'])-set(map(str,t));extra=set(map(str,t))-set(schema['text'])
  if missing or extra:raise ValueError(f+' text mapping missing '+str(missing)+' extra '+str(extra))
  t={str(k):v for k,v in t.items()};blank=[k for k,v in t.items()if not str(v).strip()]
  if blank:raise ValueError(f+' empty '+str(blank))
  if len(imgs)!=len(schema['images']):raise ValueError(f+' image count '+str(len(imgs))+' != '+str(schema['images']))
  img=dict(zip(schema['images'],imgs));self.slides.append({'f':f,'t':t,'img':img});self.stage.append((kind,role))
 def footer(self,t,f):
  schema=LAYOUTS[f]['text']
  for k,s in schema.items():
   if s.strip()=='고객사 로고':t[int(k)]=self.logo
   elif s.startswith('CONFIDENTIAL'):t[int(k)]='CONFIDENTIAL · '+str(len(self.slides)+1)
  keys=list(schema);foot=keys[-2]
  if int(foot)not in t:t[int(foot)]=self.customer+' · '+('표준 구성안'if self.std else'가상 고객 제안 예시')+' · 사진: 삼성전자 등록 참고자료'
  return t
 def cover(self,variant):
  p=self.products[0];s=self.spaces;v=self.v
  t={0:self.logo,1:'SAMSUNG B2B PROPOSAL',2:self.name+'의 제품과 운영을 연결합니다'if self.std else v['title'],3:self.name+' · '+('공간별 제품·솔루션 표준 구성'if self.std else v['scope']),4:'공간별 제품 구성',5:'솔루션 운영 흐름',6:'단계별 도입·지원',7:'삼성 B2B 제안 구성',8:'표준 구성안'if self.std else'고객 상황 기반 예시',9:'SAMSUNG',10:'01',11:'02',12:'03',13:'01',14:'공간',15:s[0]['name']+' 적용 장면',16:'02',17:'운영',18:s[6]['name']+' 관리 흐름',19:'03',20:'제품',21:P[p]['name']}
  self.add('L_C08','공간·제품·운영 제안',t,[self.pic.scene(s[0]['name']),self.pic.scene(s[6]['name']),product_picture(p)],'open')
 def summary(self):
  p=self.products;sol=self.solutions
  t={0:'01 · 제안 요약',1:self.name+'의 적용 범위와 운영을 한눈에',2:'현장의 과제 · 제품 구성 · 운영 방식 · 도입 조건',3:'01',4:'검토할 과제',5:'분산',6:'기기·안내·업무 관리',7:self.pains[0],8:self.pains[1],9:'02',10:'이번 구성',11:self.names(p[:2]),12:' · '.join(S[s]['name']for s in sol[:2]),13:self.spaces[0]['name']+'부터 단계 적용',14:'03',15:'확인할 변화',16:'연결',17:'공간과 이용 흐름',18:'표준',19:'설정·안내·점검 절차',20:'실측',21:self.measures[0],22:'04',23:'지원 범위',24:'제품군별 설치 조건 확인',25:'연동·권한·라이선스 합의',26:'교육·인수·점검 이력',27:'KEY MESSAGE',28:self.promise,29:'다음 단계 · '+self.pilot}
  self.add('L_PH_ES_A','핵심 과제·구성·효과 요약',self.footer(t,'L_PH_ES_A'),[self.pic.scene(self.spaces[0]['name'])],'open')
 def pains_page(self):
  after=['정보·설정·기록을 같은 기준으로 관리합니다','공간과 사용자별 접근·운영 권한을 정합니다','담당자 변경 뒤에도 점검·인계 이력을 남깁니다']
  t={0:'02 · 고객 과제',1:self.name+'의 현재 과제와 바라는 운영',2:'표준 검토 항목'if self.std else self.v['scope']+' · 가상 고객의 요구 조건',3:'현재 과제',4:'바라는 운영',5:'업무·기기별 관리가 나뉜 상태',6:self.pains[0],7:self.pains[1],8:self.pains[2],9:self.promise,10:after[0],11:after[1],12:after[2]}
  self.add('L_PH_CH_B','현재와 목표 운영 비교',self.footer(t,'L_PH_CH_B'),[self.pic.scene(self.spaces[0]['name']),self.pic.scene(self.spaces[6]['name'])],'context')
 def space_map(self):
  f='L_PH_SS_'+IND_LAYOUT[self.b['ind']]+'_A';sp=self.spaces;t={0:'03 · 공간별 구성',1:self.name+'의 일곱 공간을 제품·운영으로 연결',2:'공간별 사용자 행동, 필요한 제품과 연결할 솔루션을 함께 정리했습니다',3:'1',4:sp[0]['name'],5:'대표 공간',6:sp[0]['action'],7:sp[0]['actor'],8:self.names(sp[0]['products']),33:'전체 구성',34:'솔루션 · 운영 범위 · 적용 공간',35:'수량·연동 범위는 실사로 확정'}
  for k in range(1,7):
   base=9+(k-1)*4;t.update({base:str(k+1),base+1:sp[k]['name'],base+2:sp[k]['action'],base+3:self.names(sp[k]['products'][:2])})
  schema=LAYOUTS[f]['text'];last=int(list(schema)[-3]);cursor=36;group=0
  while cursor<last:
   sid=self.solutions[group%len(self.solutions)];t[cursor]=S[sid]['name'];cursor+=1
   t[cursor]=S[sid]['desc']if group<len(self.solutions)else'설정·교육·점검·인계의 역할을 분담합니다';cursor+=1
   while cursor<last and re.fullmatch(r'\d+',schema[str(cursor)].strip()):t[cursor]=schema[str(cursor)].strip();cursor+=1
   group+=1
  self.add(f,'공간·제품·솔루션 전체 맵',self.footer(t,f),[self.pic.scene(s['name'])for s in sp],'context')
 def values(self):
  s=self.spaces;t={0:'03 · 제공 가치',1:self.name+'에서 확인할 네 가지 변화',2:'제품·공간·운영 절차를 함께 바꾸는 구성안'}
  values=[('이용 흐름의 연결',self.promise,self.spaces[0]['name']+' → '+self.spaces[1]['name']),('현장 업무의 일관성','기기 설정·정보·인계 기준을 담당자와 함께 정합니다',self.measures[0]),('운영 상태의 확인','기록·알림·점검 결과로 개선 여부를 확인합니다',self.measures[1]),('도입 이후의 지속성','교육·인수·변경 관리까지 운영 절차에 포함합니다',self.measures[2])]
  for k,(a,b,c)in enumerate(values):i=3+k*4;t.update({i:f'{k+1:02}',i+1:a,i+2:b,i+3:c})
  self.add('L_PH_VP_B4','이용자·업무·운영·지원 가치',self.footer(t,'L_PH_VP_B4'),[self.pic.scene(s[k]['name'])for k in range(4)],'value')
 def products_pages(self):
  ids=self.products
  for start in range(0,len(ids),3):
   group=ids[start:start+3]
   if len(group)<3:group=group+[p for p in ids if p not in group][:3-len(group)]
   t={0:'04 · 제품 구성',1:self.name+' 적용 제품 · '+str(start//3+1),2:'제품군·주요 사양·적용 위치를 함께 확인합니다. 모델별 지원 조건은 개별 확인합니다.'};imgs=[]
   for k,p in enumerate(group):
    where=next((s for s in self.spaces if p in s['products']),self.spaces[k]);i=3+k*4;t.update({i:P[p]['cat'],i+1:P[p]['model'],i+2:self.shortspec(p),i+3:where['name']+' · '+where['action'][:30]});imgs.extend([self.pic.scene(where['name']),product_picture(p)])
   self.add('L_PH_P3_A','적용 제품 '+str(start//3+1)+' · '+self.names(group),self.footer(t,'L_PH_P3_A'),imgs,'space')
 def bundles(self):
  p=self.products;s=self.solutions;sp=self.spaces
  t={0:'04 · 구성안 비교',1:'필수 구성에서 운영 연동까지 단계 확장',2:'구성 범위를 비교하는 예시입니다. 설치·연동·라이선스와 견적은 현장 조건으로 확정합니다.',3:'필수형',4:'핵심 기능 중심',5:sp[0]['name']+' 핵심 기기',6:'·',7:P[p[0]]['name'],8:P[p[0]]['model'],9:'이용자',10:sp[0]['action'],11:'운영자',12:'설치 위치·사용 방법·담당자를 먼저 정리',13:'운영형',14:'기준 구성',15:'기기·솔루션 연결',16:'정보·설정·점검을 함께 관리',17:'·',18:P[p[1]]['name'],19:P[p[1]]['model'],20:'+',21:S[s[0]]['name'],22:S[s[0]]['cat'],23:'+',24:P[p[2]]['name'],25:sp[1]['name'],26:'이용자',27:sp[1]['action'],28:'운영자',29:'승인·설정 변경·운영 이력을 연결',30:'확장형',31:'공용부·지원 포함',32:'다른 공간과 운영 지원으로 확장',33:'·',34:P[p[3]]['name'],35:P[p[3]]['model'],36:'+',37:S[s[-1]]['name'],38:S[s[-1]]['cat'],39:'+',40:P[p[-1]]['name'],41:sp[5]['name'],42:'이용자',43:sp[5]['action'],44:'운영자',45:'교육·인수·점검 기준을 운영팀에 이관',46:'단계별 적용 범위 비교 · 최종 수량·금액은 현장 실사와 견적서에서 확정'}
  self.add('L_PH_P_O','필수형·운영형·확장형 구성 비교',self.footer(t,'L_PH_P_O'),[self.pic.scene(sp[k]['name'])for k in range(3)],'space')
 def solution_page(self,sid):
  s=S[sid];steps=FLOWS.get(sid,['연동 범위 확인','사용 흐름 구성','운영 권한 설정','기록·예외 확인']);sp=self.spaces
  desc=[s['desc'],'지원 모델·사용자·네트워크·라이선스를 합의합니다',self.condition,'장애·변경·인계 상황의 담당자와 복구 절차를 정합니다']
  t={0:'05 · 솔루션 · '+s['name'],1:s['name']+' 운영을 네 단계로 연결',2:s['desc']+' · 기능·연동 범위는 현장 조건으로 확인합니다',3:'1',4:'준비',5:steps[0],6:sp[6]['name'],7:desc[0],8:'2',9:'설정',10:steps[1],11:sp[0]['name'],12:sp[1]['name'],13:desc[1],14:'3',15:'운영',16:steps[2],17:sp[2]['name'],18:desc[2],19:'4',20:'인계',21:steps[3],22:'운영 담당자',23:desc[3],24:'확인',25:'연동 테스트 → 담당자 교육 → 예외 처리 → 운영 기록',26:'지원 범위 확인'}
  self.add('L_PH_SOL_S',s['name']+' 준비·설정·운영·인계',self.footer(t,'L_PH_SOL_S'),[self.pic.scene(sp[k]['name'])for k in [6,0,2,5]],'build')
 def architecture(self):
  s=self.solutions[0];sp=self.spaces;t={0:'05 · 구성·연동 구조',1:'운영 담당자와 현장 기기의 연결을 정리',2:'누가 무엇을 설정하고 확인하는지, 시스템별 책임 경계를 먼저 합의합니다',3:S[s]['name']+' · 운영 기준'}
  for k in range(4):t[4+k*2]=sp[k]['name'];t[5+k*2]=self.names(sp[k]['products'][:1])
  t[12]='관리 구역 · 사용자 권한 · 기기·네트워크·데이터 연동';t[13]=self.condition
  self.add('L_PH_SA_B','현장 기기·운영 시스템 연결',self.footer(t,'L_PH_SA_B'),[self.pic.solution(s)]+[self.pic.scene(sp[k]['name'])for k in range(4)],'build')
 def case_page(self,cid):
  c=C[cid];offers=c.get('offer')or c.get('prod')or['도입 제품'];spaces=c.get('space')or[c.get('type','적용 사업장')];needs=c.get('needs')or['도입 목적과 운영 범위 확인'];proof=c.get('proof')or[]
  t={0:'06 · 공식 도입사례',1:c['cust'],2:c['title'],3:c['date'][:4],4:'공식 사례 등록 연도',5:str(len(spaces))+'개',6:'원문에 기재된 적용 공간',7:str(len(offers))+'종',8:'원문에 기재된 제품·구성',9:needs[0],10:'— 공식 사례의 도입 과제',11:'원문 · '+c['url'].replace('https://','')}
  t[13]='내용·사진: 삼성전자 공식 도입사례 · 같은 성과를 보장하지 않으며 적용 조건을 비교합니다'
  self.add('L_PH_CD_C','공식 사례 · '+c['cust'],self.footer(t,'L_PH_CD_C'),self.pic.case(cid,2),'proof')
  # Case details stay visible in the deck rather than only in a notes field.
  self.slides[-1]['notes']='공식 사례\n'+json.dumps(c,ensure_ascii=False,indent=2)
 def case_essay(self,cid):
  c=C[cid];space=' · '.join(c.get('space')or[c.get('type','공식 도입 사업장')]);offer=' · '.join((c.get('offer')or c.get('prod')or['도입 구성'])[:4]);needs=' · '.join((c.get('needs')or['운영 조건 확인'])[:2]);proof=' · '.join((c.get('proof')or[])[:1])
  t={0:'06 · 적용 근거',1:c['cust']+'의 구성과 검토 조건',2:c.get('type',c['title']),3:'1',4:'2',5:'3',6:'도입 내용',7:'1',8:'적용 공간',9:space,10:'2',11:'제품·솔루션 구성',12:offer,13:'3',14:'도입 과제와 확인점',15:needs,16:'원문 · '+c['url'].replace('https://',''),18:'공식 사례의 구성 비교 · 고객·공간·연동 조건에 따라 적용 범위 확인'}
  self.add('L_AIS_29','사례 구성 · '+c['cust'],self.footer(t,'L_AIS_29'),self.pic.case(cid,4),'proof');self.slides[-1]['notes']=proof+'\n'+json.dumps(c,ensure_ascii=False)
 def measures_page(self):
  t={0:'실측 대상 · '+self.pilot,1:self.spaces[0]['name']+'의 사용·운영 장면',2:'07 · 확인 지표',3:'좋아졌는지는 같은 조건에서 확인합니다',4:'결과 수치를 가정하지 않고, 측정 대상·기록 방법·담당자를 먼저 합의합니다'}
  for k,m in enumerate(self.measures):
   i=5+k*4
   method='시작·종료 시각을 동일한 기준으로 기록합니다'if re.search('시간|분',m)else'대상 건수와 완료·발생 건수를 함께 기록합니다'if re.search('률|건|오류|누락',m)else'동일한 질문·운영 조건으로 기준선을 비교합니다'
   t.update({i:f'{k+1:02}',i+1:m,i+2:method,i+3:'담당 · 운영팀 / 비교 · 도입 전후'})
  self.add('L_PH_OV_H','지표·측정 방법·담당자',self.footer(t,'L_PH_OV_H'),[self.pic.scene(self.spaces[0]['name'])],'plan')
 def implementation(self):
  t={0:'07 · 구축·운영 계획',1:'실사부터 인수까지 네 단계를 연결합니다',2:'범위·산출물·책임자를 먼저 정하고, 세부 일정은 현장 조건으로 확정합니다',3:'준비',4:'구축',5:'인수',6:'운영',7:'01',8:'현장 실사·설계',9:'공간별 전원·통신·치수·설치 조건과 연동 범위를 확인합니다',10:'산출물',11:'설치 도면 · 제품·연동 목록',12:'담당',13:'고객 시설·IT / 공급·설치 파트너',14:'02',15:'설치·구축',16:'업무·이용 동선의 영향을 나누고 시험·복구 절차를 수행합니다',17:'산출물',18:'설치·시험·복구 기록',19:'담당',20:'설치 파트너 / 고객 운영팀',21:'03',22:'교육·인수',23:'설정 변경·장애·인계 상황을 운영자가 직접 수행하고 확인합니다',24:'산출물',25:'운영 매뉴얼 · 인수 확인서',26:'담당',27:'고객 운영팀 / 공급 파트너',28:'04',29:'운영·지원',30:'알림·점검·변경 이력을 남기고 지원 범위를 계약에 맞게 운영합니다',31:'산출물',32:'점검·변경·운영 리포트',33:'담당',34:'고객 담당자 / 지원 창구'}
  self.add('L_PH_IP_A','실사·구축·인수·운영 책임',self.footer(t,'L_PH_IP_A'),[self.pic.scene(self.spaces[k]['name'])for k in [6,0,1,6]],'plan')
 def rollout(self):
  t={0:'07 · 단계별 도입',1:'대표 공간에서 확인하고 같은 기준으로 확대',2:'다음 단계로 넘어가는 판단 기준을 도입 전에 합의합니다',3:'STEP 1 · 대표 공간',4:self.pilot,5:'다음 단계 판단',6:self.measures[0],7:'기준선·동작·예외 처리 기록 확보',8:'STEP 2 · 동일 유형 확대',9:'유형이 다른 구역에서 재현성 확인',10:'다음 단계 판단',11:self.measures[1],12:'설정·권한·지원 절차의 반복 적용',13:'STEP 3 · 운영 이관',14:'합의한 대상 공간으로 단계 확산',15:'다음 단계 판단',16:self.measures[2],17:'교육·인수·점검 담당자 확정',18:'대표 공간 → 동일 유형 → 전체 운영'}
  self.add('L_PH_PL_A','시범·확대·인수 판단 기준',self.footer(t,'L_PH_PL_A'),[self.pic.scene(self.spaces[k]['name'])for k in [0,2,6]],'plan')
 def why(self):
  t={0:'08 · 지원 체계',1:'제품부터 운영 인수까지 함께 설계합니다',2:'제품 선정·구축·교육·지원의 책임 경계를 합의하고 필요한 전문 파트너와 연결합니다',3:'1',4:'People',5:'현장 운영자·시설·IT 담당자가 요구와 인수 조건을 함께 확인합니다',6:'2',7:'Product',8:'공간별 제품과 실제 지원 가능한 솔루션·연동 범위를 검토합니다',9:'3',10:'Process',11:'실사·설치·시험·교육·인수의 산출물과 담당자를 정합니다',12:'4',13:'Support',14:'장애 접수·점검·변경 관리의 지원 범위를 계약 조건으로 확인합니다'}
  self.add('L_AIS_32','제품·구축·운영 지원',self.footer(t,'L_AIS_32'),[{'src':'img/fill/ais-a.json#6','name':'삼성전자 디지털시티 사옥 · 공식 참고사진','fit':'cover','keep':True}],'plan')
 def close(self):
  t={0:self.logo,1:'SAMSUNG',2:self.project,3:'공간·제품·연동 범위를 현장에서 함께 확인합니다',4:'CONFIDENTIAL · '+str(len(self.slides)+1)}
  self.add('L_AIS_37','다음 단계 · 현장 실사와 범위 합의',t,[self.pic.scene(self.spaces[0]['name'])],'close')
 def build(self,variant):
  self.cover(variant);self.summary();self.pains_page();self.space_map();self.values();self.products_pages();self.bundles()
  for sid in self.solutions[:3 if self.std else 2]:self.solution_page(sid)
  self.architecture();self.case_page(self.cases[variant])
  if self.std:self.case_essay(self.cases[1-variant])
  self.measures_page();self.implementation();self.rollout();self.why();self.close()
  scenario=copy.deepcopy(self.old);scenario.pop('preview',None)
  groups=[]
  for k,(kind,role)in enumerate(self.stage):
   if not groups or groups[-1]['key']!=kind:groups.append({'key':kind,'name':{'open':'제안 개요','context':'고객 과제와 적용 공간','value':'기대 가치','space':'제품과 구성안','build':'솔루션·연동·운영','proof':'공식 사례와 적용 근거','plan':'검증·구축·운영 계획','close':'다음 단계'}[kind],'goal':role,'slides':[]})
   groups[-1]['slides'].append({'f':self.slides[k]['f'],'role':role})
  scenario.update(flow=groups,products=self.products,solutions=self.solutions,cases=self.cases,minutes=45 if self.std else 30,authoringRevision=REVISION,sourceMode='existing-layouts',title=self.name+' 표준 제안서'if self.std else self.v['customer']+' — '+self.v['title'],short=self.promise,logic=[g['name']for g in groups],diff=['공간별 사용자 행동과 제품·솔루션을 함께 정리','시범·실측·인수 조건까지 완성한 구성','공식 사례의 사실과 고객별 검토 조건을 구분'])
  if self.std:scenario.update(std=True,req='std',situation=self.name+'의 공간·제품·솔루션을 기존 Best Scenario의 완성된 양식으로 구성한 표준 제안입니다. 반복 목차와 빈 장표는 통합하고 적용 범위·제품 사양·운영 흐름·공식 사례·인수 조건을 함께 제시합니다.')
  who=[scenario['audience']['lead'],*scenario['audience']['others']][:3];weights=[40,35,25]if len(who)==3 else[60,40]if len(who)==2 else[100]
  types={'open':'overview','context':'challenge','value':'value','space':'products','build':'solution','proof':'case','plan':'execution','close':'closing'}
  story={'keymen':[[name,weights[k],[scenario['criteria'][k%len(scenario['criteria'])]]]for k,name in enumerate(who)],'note':scenario['situation'],'parts':{g['name']:{'type':types[g['key']],'items':[x['role']for x in g['slides']]}for g in groups}}
  return scenario,self.slides,story,self.customer

def main():
 before=OUT/'before';before.mkdir(exist_ok=True)
 for file,backup in [('description_standard_scenarios.json','standards.json'),('vertical_scenarios.json','best.json')]:
  if not(before/backup).exists():(before/backup).write_bytes((TARGET/file).read_bytes())
 previous={True:json.loads((before/'standards.json').read_text()),False:json.loads((before/'best.json').read_text())}
 outputs={k:{'scenarios':[],'fills':{},'story':{},'customers':{},'sources':previous[k]['sources']}for k in [True,False]}
 for b in BRIEFS:
  for std in [True,False]:
   for variant in range(1 if std else 2):
    sid='bs_std_'+b['key']if std else'bs_v_'+b['key']+'_'+str(variant+1);old=next(s for s in previous[std]['scenarios']if s['id']==sid)
    deck=Deck(b,old,std,variant);s,f,st,c=deck.build(variant)
    if std:
     for i,page in enumerate(previous[True]['fills'][sid]):
      notes=page.get('notes','')
      if notes:f[i%len(f)]['notes']=f[i%len(f)].get('notes','')+'\n\n[기준 업종 자료 '+str(i+1)+'쪽]\n'+notes
    outputs[std]['scenarios'].append(s);outputs[std]['fills'][sid]=f;outputs[std]['story'][sid]=st;outputs[std]['customers'][sid]=c
    print(sid,len(f),'slides',len(deck.products),'products',flush=True)
 for std,name in [(True,'description_standard_scenarios.json'),(False,'vertical_scenarios.json')]:
  (TARGET/name).write_text(json.dumps(outputs[std],ensure_ascii=False,separators=(',',':'))+'\n')
 summary={'standards':len(outputs[True]['scenarios']),'best':len(outputs[False]['scenarios']),'standardSlides':sum(map(len,outputs[True]['fills'].values())),'bestSlides':sum(map(len,outputs[False]['fills'].values())),'layouts':sorted({f['f']for d in outputs.values()for deck in d['fills'].values()for f in deck}),'referenceScenarios':REFERENCE,'revision':REVISION}
 (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
