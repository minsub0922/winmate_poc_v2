"""Select different, relevant photographs from the existing published asset library."""
import hashlib,re,json
from collections import Counter
from proposal_content import ROOT,C,IMAGES,SPACE_WORDS,SPACE_HINTS,gallery

def media(record,fit='cover'):
 return {'src':record['src'],'name':record.get('desc',record.get('name','공간 참고사진'))+' · '+record.get('owner','삼성전자 등록 자료'),'fit':fit,'keep':True,'source':record.get('page',''),'kind':record.get('kind','s')}

class Pictures:
 def __init__(self,b,variant=0):
  self.b=b;self.variant=variant;self.used=Counter();self.pool={};self.screen_used=Counter()
  for cid in C:
   for im in gallery('case',cid):
    # The 350–500px case details are useful card photographs. Previously all were discarded.
    if im['kind']in['s','e','p']and im['w']>=350 and im['h']>=190:
     self.pool[im['src']]={**im,'cid':cid,'preferred':cid==str(b['cases'][variant%len(b['cases'])])}
  for key,im in IMAGES.items():
   if key.startswith('ph.')and im.get('src')in['case','life']and'gray'not in key and(ROOT/'app/data/static'/im['file']).is_file():
    self.pool.setdefault(im['file'],{'src':im['file'],'desc':im['desc'],'kind':'s','w':im.get('w',1000),'h':im.get('h',600),'ind':key.split('.')[1].split('-')[0].upper(),'owner':'삼성전자 공식 참고사진','page':im.get('page','')})
  for im in json.loads((ROOT/'app/web/src/domain/templates/proposal_photo_assets.json').read_text()):
   self.pool[im['src']]=im
 def scene(self,query,wide=False,avoid=()):
  q=query
  for label in sorted(SPACE_HINTS,key=len,reverse=True):
   if q.startswith(label):q=SPACE_HINTS[label]+q[len(label):];break
  def score(im):
   d=im['desc'];s=7*(im.get('ind')==self.b['ind'])+2*im.get('preferred',False)
   for a,z in SPACE_WORDS:
    if re.search(a,q)and re.search(z,d):s+=16
   for word in q.split():
    if len(word)>1 and word in d:s+=7
   if re.search(r'공항|터미널|탑승|대합|역사|플랫폼',q):s+=36 if re.search(r'공항|터미널|탑승|대합|역사|플랫폼|철도|버스|교통',d)else-35
   if self.b['key']=='smart_network'and re.search(r'매장|체험|개통|상담',q):s+=24 if re.search(r'스토어|디지털프라자|디지털플라자|스마트폰|휴대폰|통신|갤럭시|체험',d)else-15
   if re.search(r'거실|세대|주방|침실|입주',q)and re.search(r'학교|교실|학원|병원|병실|은행|공항|수업',d):s-=90
   if re.search(r'병실|간호|원무',q)and not re.search(r'병원|병실|간호|의료|환자',d):s-=40
   if re.search(r'물류|출고|생산',q)and not re.search(r'공장|작업|물류|제조|배송|택배|창고|스캔',d):s-=40
   if re.search(r'외관|조감|실외기|건물 전경|항공',d)and not re.search(r'외벽|기계|기계실|설비|옥상|열원|입구',q):s-=30
   if re.search(r'객실',q)and not re.search(r'객실|호텔|침실|침대|숙박',d):s-=40
   if re.search(r'상영|공연|전시',q)and not re.search(r'상영|극장|영화|공연|무대|전시|스크린|객석',d):s-=30
   if wide and im['w']<600:s-=20
   # Repetition used to cost at most four points, so one photo won 19 times.
   s-=18*self.used[im['src']]
   tie=int(hashlib.sha256((self.b['key']+str(self.variant)+q+im['src']).encode()).hexdigest()[:6],16)/0xffffff
   return s+tie
  pool=[im for im in self.pool.values()if im['src']not in avoid]
  if self.b['ind']=='FN':
   banking=[im for im in pool if im.get('ind')in['FN','OF']and not re.search(r'주방|카페|음료|커피|식당|레스토랑|병원|병실|환자|진료|학교|교실|학생|기내|항공|슈퍼|편의점|PC방|모텔|침실|객실',im['desc']+' '+im['owner'])]
   if banking:pool=banking
  if self.b['key']=='senior_town':
   residential=[im for im in pool if not re.search(r'쇼룸|스튜디오|체험관|미디어아트|전시관|갤러리',im['desc']+' '+im['owner'])]
   if residential:pool=residential
  if re.search(r'사무|업무|행정|교무|연구|관리|관제|백오피스',q):
   professional=[im for im in pool if not re.search(r'PC방|모텔|게임 화면|호텔 객실|기내|비행기',im['desc']+' '+im['owner'])]
   if professional:pool=professional
  if self.b['key']=='smart_factory':
   manufacturing=[im for im in pool if not re.search(r'기내|항공기|항공사|아시아나|객실|승무원|여객|비행|탑승|면세|공항|온실|육묘|모종|농장|하우스',im['desc']+' '+im['owner'])]
   if not re.search(r'물류|출고|배송|인계',q):manufacturing=[im for im in manufacturing if not re.search(r'택배|배송 차량',im['desc']+' '+im['owner'])]
   if manufacturing:pool=manufacturing
  context_pool=pool
  # Route by the actual room first. A bedroom must not turn into a kitchen,
  # and a bank consultation must not become an auditorium just to be different.
  routes=[
   (r'기계실|옥상|실외기',r'기계실|공조기|실외기|옥상|배관|설비|칠러'),
   (r'세탁|드레스',r'세탁|빨래|의류|드레스룸|에어드레서'),
   (r'주방|키친',r'주방|키친|빌트인|냉장고|조리|식기'),
   (r'침실|자녀방',r'침실|침대|침구|자녀방|아이방|기숙사'),
   (r'객실|생활관|병실',r'객실|침실|침대|병실|생활관|입소자'),
   (r'공항|터미널|탑승|대합|역사|플랫폼',r'공항|터미널|탑승|대합|역사|플랫폼|철도|버스'),
   (r'관리|관제|백오피스|지원실|운영실',r'관제|상황실|관리자|관리 화면|대시보드|운영 담당|사무실|책상|프런트|점검하는 기사'),
   (r'상담|창구|원무|개통|서명',r'상담|창구|서명|응대|동의서|태블릿'),
   (r'강의|교육장|수업|교실|실습|프로그램실',r'교실|강의|학습|학생|전자칠판|프로그램|교육|수업'),
   (r'회의|미팅',r'회의|미팅|컨퍼런스|프레젠테이션|전자칠판'),
   (r'도서관',r'도서관|열람|서가|자료 검색'),
   (r'피트니스|운동',r'운동|체육|피트니스|헬스|재활'),
   (r'레스토랑|식당|매점|카페',r'레스토랑|식당|매점|카페|테이블|메뉴|뷔페'),
   (r'물류|출고|배송',r'물류|출고|배송|택배|창고|스캔|적재'),
   (r'생산|작업|품질',r'생산|작업|공장|제조|스캔|현장'),
   (r'거실|세대',r'거실|소파|주거|아파트|세대'),
   (r'로비|프런트|입구|접수',r'로비|프런트|리셉션|접수|입구|현관|출입구'),
   (r'라운지|휴게|대기',r'라운지|휴게|대기|좌석|소파'),
   (r'사무|업무|행정|교무|연구',r'사무실|업무 공간|책상|회의|연구실|모니터'),
   (r'상영|공연|전시',r'상영|극장|영화|공연|무대|전시|객석'),
  ]
  route=next((target for query_rx,target in routes if re.search(query_rx,q)),None)
  if route:
   matching=[im for im in pool if re.search(route,im['desc'])]
   if matching:pool=matching
  if re.search(r'관리|관제|백오피스|지원실|운영실|상담|창구',q):
   professional=[im for im in pool if not re.search(r'학생|수업|교실|교수|어린이',im['desc'])]
   if professional:pool=professional
   if self.b['ind']not in['FB','RT','TC']:
    office=[im for im in pool if not re.search(r'주방|조리|음료|카페|레스토랑|식당|매장 카운터',im['desc'])]
    if office:pool=office
  if self.b['key']=='smart_network'and re.search(r'매장|체험|개통|상담|카운터',q):
   phone_rx=r'SKT|KT|삼성 강남|삼성.*스토어|메가스토어 삼성|통신|휴대폰|스마트폰|갤럭시|디지털프라자|디지털플라자'
   relevant=[im for im in pool if re.search(phone_rx,im['desc']+' '+im['owner'])]
   if relevant and all(self.used[im['src']]>=2 for im in relevant):relevant=[im for im in context_pool if re.search(phone_rx,im['desc']+' '+im['owner'])]
   if relevant:pool=relevant
  same_industry=[im for im in pool if im.get('ind')==self.b['ind']]
  fresh_industry=[im for im in same_industry if self.used[im['src']]<2]
  if fresh_industry:pool=fresh_industry
  available=[im for im in pool if self.used[im['src']]<3]
  im=max(available or pool,key=score);self.used[im['src']]+=1
  return {**media(im),'query':query}
 def case_images(self,cid):
  pool=gallery('case',cid);scenes=[im for im in pool if im['kind']in['s','e','p']and im['w']>=350 and im['h']>=190]
  rest=[im for im in pool if im['kind']in['u','d']and im['w']>=300]
  return list({im['src']:im for im in scenes+rest}.values())
 def case(self,cid,n):
  pool=self.case_images(cid)
  if len(pool)<n:raise ValueError('Choose a smaller case layout instead of duplicating '+str(cid))
  pool.sort(key=lambda im:(self.used[im['src']],-im['w']))
  chosen=pool[:n]
  for im in chosen:self.used[im['src']]+=1
  return [media(im,'contain'if im['kind']in['u','d']else'cover')for im in chosen]
 def screens(self,sid):
  return list({im['src']:im for im in gallery('solution',sid)if im['kind']in['u','d']and im['w']>=300}.values())
 def solution(self,sid):
  pool=self.screens(sid)or gallery('solution',sid)
  if not pool:return self.scene('관리실 관제 화면')
  im=min(pool,key=lambda im:(self.screen_used[im['src']],-im['w']))
  self.screen_used[im['src']]+=1;self.used[im['src']]+=1
  return media(im,'contain')
