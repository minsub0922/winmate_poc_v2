#!/usr/bin/env python3
"""Author complete decks using only the pre-existing Winmate layout registry."""
import copy,json,re,subprocess,unicodedata
from html.parser import HTMLParser
from vertical_briefs import BRIEFS
from proposal_content import ROOT,P,S,C,cut
from proposal_visuals import Pictures,media

OUT=ROOT/'output/rebuild-existing'
TARGET=ROOT/'app/web/src/domain/templates'
OUT.mkdir(exist_ok=True,parents=True)
REVISION='existing-layouts-v3'

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
PRODUCT_LABELS={'qm55c':'스마트 사이니지','kiosk':'키오스크','tabs11':'갤럭시 탭','tabactive5':'러기드 탭','xcover7':'러기드 폰','wf1way':'무풍 1Way','wf4way':'무풍 4Way','ac360':'360 카세트','purifier':'공기청정기','bi_fridge':'빌트인 냉장고','bi_induction':'인덕션','bi_dish':'식기세척기','book':'갤럭시 북','flip':'전자칠판 Flip','harman':'하만 오디오','thewall':'The Wall','onyx':'Onyx LED','led_indoor':'실내 LED','led_outdoor':'실외 LED','window':'윈도 사이니지','vm55b':'비디오월','dvms2':'DVM 실외기','dvmchiller':'DVM 칠러','erv':'청정환기','airdresser':'에어드레서','laundry':'세탁·건조','hoteltv':'호텔 TV','watch':'갤럭시 워치','smarttag':'스마트태그'}
SHORT_ACTIONS=['상태·알림·점검 이력 한눈에','설명·필기·화면 공유를 함께','조리·안내·실내 환경 관리','의류 관리와 점검 절차 정리','온도·공기질·안내를 편안하게','동선에 맞춘 안내·콘텐츠','정보 확인·설명·기록 연결','스캔·작업 확인·인계 연결','화면·음향·콘텐츠 경험','기기 제어·생활 안내 연결']
SOLUTION_LABELS={'smartthings':'기기 연결·생활 모드·상태 확인','stpro':'사업장 기기·에너지·운영 스케줄','biot':'공조·설비·에너지 통합 관제','sac':'실내기 그룹·스케줄·피크 관리','magicinfo':'콘텐츠 승인·예약 배포·기기 확인','vxt':'콘텐츠·계정·원격 배포 관리','lynk':'객실 TV·콘텐츠·PMS 연동','knoxsuite':'정책·앱·분실·회수 관리','knoxcapture':'현장 바코드·데이터 연결','dex':'모바일과 큰 화면의 업무 연결','care':'점검·세척·교육·운영 이력','content':'공간별 콘텐츠 제작·편성 지원','unmanned':'사용 인증·결제·정산 범위 확인','partnerapp':'앱·업무 시스템·기기 연동 검토','coldchain':'온도·상태·예외 알림 확인'}
ACTORS={'RS':'입주자·가족·관리실','OF':'직원·방문객·시설팀','FB':'손님·매장 직원·운영 본부','VN':'관람객·행사 직원·시설팀','MD':'이용자·지원 직원·시설팀','ED':'학생·강사·운영자','MF':'작업자·관리자·시설팀','FN':'고객·상담 직원·관리자','HT':'투숙객·프런트·시설팀','RT':'고객·직원·운영 본부','PB':'이용자·업무 담당·시설팀','TC':'방문 고객·상담 직원·본부'}

# Best proposals are projects, rather than copies of the whole industry catalog.
PROJECT_PRODUCTS={
 'ai_apartment':['wf1way purifier bi_fridge bi_induction bi_dish','wf1way purifier airdresser bi_fridge'],
 'ai_office':['flip book tabs11 qm55c ac360','wf4way dvms2 qm55c tabs11'],
 'ai_store':['qm55c window kiosk wf4way','kiosk qm55c tabs11 ac360'],
 'entertainment':['onyx harman led_indoor qm55c kiosk','qm55c led_indoor wf4way harman'],
 'knowledge_industry_center':['qm55c flip ac360 wf4way','wf4way dvms2 tabs11 qm55c'],
 'senior_town':['wf1way purifier hoteltv qm55c','wf1way purifier tabs11 qm55c'],
 'smart_academy':['flip tabs11 book qm55c','tabs11 qm55c book'],
 'smart_barracks':['tabactive5 xcover7 qm55c','wf4way purifier laundry'],
 'smart_factory':['tabactive5 xcover7 watch qm55c','dvms2 wf4way qm55c tabs11'],
 'smart_finance':['tabs11 qm55c flip','tabs11 book tabactive5'],
 'smart_home':['wf1way purifier bi_fridge bi_induction bi_dish','wf1way purifier airdresser bi_fridge'],
 'smart_hospital':['tabs11 qm55c hoteltv wf1way purifier','wf1way wf4way purifier tabs11'],
 'smart_hotel':['hoteltv wf1way ac360 qm55c airdresser','hoteltv wf1way wf4way'],
 'smart_network':['qm55c window tabs11','tabs11 qm55c window'],
 'smart_office':['flip book qm55c ac360','wf4way dvms2 qm55c tabs11'],
 'smart_public':['qm55c kiosk tabs11','wf4way ac360 tabs11'],
 'smart_retail':['qm55c window kiosk tabs11','qm55c window tabs11'],
 'smart_school':['flip tabs11 book purifier','wf4way purifier qm55c'],
 'smart_transportation':['qm55c oh55a led_indoor','tabactive5 xcover7 watch'],
 'smart_university':['flip tabs11 book qm55c','wf4way dvms2 tabs11'],
}
PROJECT_SOLUTIONS={
 'ai_apartment':['smartthings care','smartthings care'],'ai_office':['biot dex','biot stpro'],
 'ai_store':['vxt partnerapp','partnerapp vxt'],'entertainment':['magicinfo content','magicinfo stpro'],
 'knowledge_industry_center':['biot sac','biot care'],'senior_town':['smartthings care','biot care'],
 'smart_academy':['magicinfo knoxsuite','magicinfo knoxsuite'],'smart_barracks':['knoxsuite','sac care'],
 'smart_factory':['knoxcapture knoxsuite','biot care'],'smart_finance':['dex knoxsuite','knoxsuite dex'],
 'smart_home':['smartthings','smartthings care'],'smart_hospital':['magicinfo knoxsuite','sac care'],
 'smart_hotel':['lynk stpro','lynk sac'],'smart_network':['magicinfo stpro','magicinfo knoxsuite'],
 'smart_office':['biot dex','biot sac'],'smart_public':['magicinfo knoxsuite','sac care'],
 'smart_retail':['vxt partnerapp','vxt magicinfo'],'smart_school':['knoxsuite dex','stpro care'],
 'smart_transportation':['magicinfo','knoxcapture knoxsuite'],'smart_university':['knoxsuite dex','biot care'],
}

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
import {repairLayoutHtml} from './app/web/src/domain/templates/layout_repairs.js';
const cat=JSON.parse(fs.readFileSync('app/data/catalog.json'));const html=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('app/data/layouts.b64','utf8'),'base64')));
process.stdout.write(JSON.stringify({metadata:[...cat.layouts,...PHOTO_META,...STD_META,...SPATIAL_META],html:Object.fromEntries(Object.entries({...html,...PHOTO_HTML,...STD_HTML,...SPATIAL_HTML}).map(([f,h])=>[f,repairLayoutHtml(f,h)]))}));"""
 x=json.loads(subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,check=True,capture_output=True,text=True).stdout)
 layouts={}
 for meta in x['metadata']:
  f=meta['f'];p=Slots();p.feed(x['html'][f]);layouts[f]={'meta':meta,'text':p.text,'images':p.images}
 return layouts

LAYOUTS=registry()
COVER_PHOTOS=json.loads((ROOT/'app/data/proposal_cover_photos.json').read_text())
def product_picture(pid):
 p=P[pid]
 if p.get('gal'):
  for i,src in enumerate(p['gal']):
   alt=(p.get('galAlt')or[''])[min(i,len(p.get('galAlt')or[''])-1)]
   kind=(p.get('galKind')or[])
   if (i<len(kind)and kind[i]=='cut')or(re.search(r'정면|전면|사선|후면',alt)and not re.search(r'사용 장면|공간|설치|화면에',alt)):
    return {'src':src,'name':p['name']+' · '+alt,'fit':'contain','keep':True,'products':[pid],'kind':'product'}
 r=cut(pid)
 if r:return {**media(r,'contain'),'products':[pid],'kind':'product'}
 if p.get('th'):return {'src':p['th'],'name':p['name']+' 공식 제품 이미지','fit':'contain','keep':True,'products':[pid],'kind':'product'}
 raise ValueError('No product image '+pid)

def space_content(name,products):
 rules=[
  (r'관제|관리|운영|백오피스|기계실|점검|인계',('기기 상태·알림·조치 이력을 한 흐름으로 확인','운영 담당자', ['dvms2','qm55c','wf4way','tabs11'])),
  (r'회의|교육장|강의|교실|실습|프로그램|강당',('설명·필기·공유를 같은 화면에서 연결','강사·참석자', ['flip','tabs11','qm55c','wf4way'])),
  (r'주방|레스토랑|식당|매점',('조리·안내·실내 환경을 운영 시간에 맞춰 관리','직원·이용자', ['bi_fridge','bi_induction','bi_dish','qm55c','ac360'])),
  (r'세탁|드레스',('의류 관리와 점검·인계 절차를 함께 정리','이용자·시설 담당', ['laundry','airdresser','purifier'])),
  (r'객실|병실|침실|생활관',('온도·공기질·안내를 편안한 이용 환경으로 연결','투숙객·입주자·직원', ['wf1way','hoteltv','purifier','tabs11'])),
  (r'입구|로비|안내|대기|동선|탑승|통로|플랫폼|쇼윈도',('필요한 안내와 콘텐츠를 동선에 맞춰 전달','방문객·안내 담당', ['qm55c','window','led_indoor','kiosk'])),
  (r'상담|창구|행정|교무|사무|준비실|간호|원무|접수',('정보 확인·설명·기록·기기 회수까지 연결','상담·업무 담당', ['tabs11','book','tabactive5','qm55c'])),
  (r'물류|입출고|생산|품질',('스캔·확인·인계 기록을 현장 업무에 연결','작업자·현장 관리자', ['tabactive5','xcover7','watch','qm55c'])),
  (r'상영|공연|전시|체험|연회',('화면·음향·콘텐츠를 공간의 경험에 맞게 구성','관람객·행사 운영', ['onyx','led_indoor','harman','qm55c'])),
  (r'거실|세대|커뮤니티|현관',('기기 제어와 생활 안내를 익숙한 사용 장면으로 구성','입주자·관리자', ['wf1way','purifier','qm55c','bi_fridge'])),
 ]
 for rule_index,(rx,(action,actor,preferred))in enumerate(rules):
  if re.search(r'세탁|드레스|의류',name):rule_index=3;action,actor,preferred=rules[3][1];break
  if re.search(rx,name):break
 else:action,actor,preferred='사용·안내·점검을 공간 운영과 연결','이용자·운영자',products;rule_index=-1
 ids=[p for p in preferred if p in products]+[p for p in products if p not in preferred]
 return {'name':name,'action':action,'shortAction':SHORT_ACTIONS[rule_index]if rule_index>=0 else'사용·안내·점검 흐름 연결','actor':actor,'products':ids[:3]}

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
USE_FLOWS={
 'smartthings':[
  ('귀가','생활 모드 실행',0,'입주자','연동 기기의 상태를 앱에서 확인하고 지원되는 생활 모드를 실행합니다'),
  ('조리','가전 상태 확인',1,'가족','연동된 주방 가전의 동작 상태와 완료 알림을 확인합니다'),
  ('취침','휴식 환경 조정',2,'입주자','취침에 맞는 온도와 지원 기기의 동작 조건을 조정합니다'),
  ('외출','기기 종료 확인',0,'입주자','외출 전에 연동 기기의 전원·모드·상태를 확인합니다')],
 'stpro':[
  ('시작','운영 스케줄 확인',6,'운영자','이용 시간에 맞춰 지원 기기의 운전 스케줄과 시작 상태를 확인합니다'),
  ('이용','공간별 상태 확인',0,'시설 담당','구역의 온습도·기기 상태를 확인하고 운영 조건을 조정합니다'),
  ('예외','알림과 현장 대조',2,'관리자','알림과 실제 현장 상태를 대조하고 조치 담당자를 정합니다'),
  ('마감','종료·이력 확인',6,'운영팀','종료 상태와 사용 이력을 확인해 다음 운영에 반영합니다')],
 'biot':[
  ('시작','구역별 운전 확인',6,'시설팀','구역별 스케줄과 실내 상태를 비교해 운영 시작 조건을 확인합니다'),
  ('운영','설비 데이터 확인',0,'관리자','설비·계측 데이터를 함께 보고 공간별 설정과 운전 상태를 확인합니다'),
  ('민원','위치·이력 대조',2,'시설팀','민원 위치와 운전 이력을 대조해 현장 조치 우선순위를 정합니다'),
  ('보고','운영 기록 활용',6,'운영팀','에너지 사용과 조치 기록을 운영 회의와 개선 검토에 활용합니다')],
 'sac':[
  ('시작','운전 그룹 확인',6,'시설팀','실내기 그룹·이용 시간·운전 조건을 운영 기준과 대조합니다'),
  ('이용','공간별 냉난방 조정',0,'시설 담당','지원 기기의 설정과 실제 실내 상태를 확인합니다'),
  ('예외','스케줄·피크 검토',2,'관리자','사용량·운전 기록과 지원 제어 기능을 확인해 운전 방식을 조정합니다'),
  ('마감','설정·점검 인계',6,'운영팀','종료 상태·변경 설정·점검 이력을 다음 담당자에게 전달합니다')],
 'magicinfo':[
  ('제작','안내 콘텐츠 작성',6,'콘텐츠 담당','공지·상품·행사 안내의 변경안을 만들고 최신 승인본을 구분합니다'),
  ('승인','대상·편성 확인',6,'승인 담당','대상 화면·권한·예약 시간을 확인해 콘텐츠를 편성합니다'),
  ('배포','현장 재생 확인',0,'현장 담당','재생·연결 상태와 실제 적용 버전을 확인합니다'),
  ('변경','수정·복구 확인',6,'운영팀','행사 변경이나 오송출 시 지원 범위 내에서 수정하고 재확인합니다')],
 'lynk':[
  ('입실','웰컴·정책 확인',0,'프런트','PMS 연동 범위와 객실 안내·웰컴 콘텐츠를 확인합니다'),
  ('이용','호텔 안내·서비스',1,'투숙객','객실 TV에서 호텔 안내와 지원되는 서비스 메뉴를 확인합니다'),
  ('점검','TV·콘텐츠 운영',6,'관리자','객실 TV의 상태·설정·콘텐츠를 원격으로 확인하고 운영합니다'),
  ('퇴실','객실 정보 처리',0,'프런트','연동 정책에 따른 객실 정보 처리와 초기화 결과를 확인합니다')],
 'knoxsuite':[
  ('배포','업무 단말 준비',6,'단말 담당','업무 계정·앱·기기 정책을 지원 모델과 라이선스에 맞게 적용합니다'),
  ('사용','허용된 업무 수행',0,'직원','허용된 앱과 업무 데이터로 설명·서명·기록 작업을 수행합니다'),
  ('예외','분실·정책 조치',6,'관리자','분실 신고와 보안 정책에 따른 조치·확인 경로를 실행합니다'),
  ('회수','자료·초기화 확인',6,'운영팀','업무 자료와 계정·초기화 상태를 확인한 뒤 다음 사용자에게 인계합니다')],
 'knoxcapture':[
  ('작업','대상·작업 건 확인',0,'작업자','승인된 업무 화면에서 대상 물품과 작업 건을 확인합니다'),
  ('스캔','바코드 정보 수집',1,'작업자','지원 카메라와 스캔 설정으로 바코드 정보를 읽습니다'),
  ('전달','업무 시스템 연결',6,'운영팀','합의한 API와 항목으로 MES·WMS에 전달 가능한지 검증합니다'),
  ('인계','결과·예외 확인',6,'관리자','처리 결과와 예외 항목을 확인해 다음 담당자에게 넘깁니다')],
 'dex':[
  ('연결','업무 화면 확장',0,'직원','지원 기기를 모니터·입력 장치에 연결해 업무 환경을 준비합니다'),
  ('업무','자료 확인·작성',1,'직원','허용된 업무 앱에서 자료를 확인하고 문서를 작성합니다'),
  ('협업','큰 화면으로 설명',2,'참석자','회의·상담 화면을 공유하고 필요한 자료를 함께 확인합니다'),
  ('종료','세션·자료 정리',6,'운영자','업무 세션과 자료 처리 상태를 확인하고 공용 기기를 정리합니다')],
 'care':[
  ('접수','기기·불편 확인',0,'운영자','기기 모델·사용 환경·불편 사항을 접수합니다'),
  ('계획','작업 범위 협의',6,'지원 담당','점검·세척 범위와 작업 시간·이용 동선을 협의합니다'),
  ('작업','현장 점검·세척',2,'전문 담당','합의한 범위의 점검·세척과 동작 확인을 수행합니다'),
  ('복귀','결과·이력 인계',6,'고객 담당','조치 결과와 다음 점검 항목을 인계받고 운영 상태를 확인합니다')],
 'partnerapp':[
  ('접점','지원 서비스 선택',0,'이용자','지원되는 파트너 앱에서 주문·예약·이용 정보를 선택합니다'),
  ('처리','업무 데이터 전달',6,'운영자','계약한 연동 범위에 따라 처리 상태와 필요한 데이터를 전달합니다'),
  ('안내','현장 정보 확인',2,'현장 담당','연동 대상 기기에 맞는 안내·호출·완료 정보를 확인합니다'),
  ('운영','예외·기록 관리',6,'관리자','거래·연동 오류·개인정보 처리 범위를 확인해 운영합니다')],
 'content':[
  ('기획','공간·행사 주제',0,'기획 담당','관람 목적과 대상 화면에 맞는 콘텐츠 주제를 정합니다'),
  ('편성','콘텐츠·버전 확인',6,'콘텐츠 담당','행사 유형별 재생 순서와 승인된 버전을 구분합니다'),
  ('상영','현장 재생 점검',2,'운영 담당','실제 화면의 표현·재생·안내 상태를 확인합니다'),
  ('종료','복구·기록 인계',6,'관리자','다음 행사에 필요한 복구본과 변경 이력을 남깁니다')],
}

class Deck:
 def __init__(self,b,old,std,variant=0):
  self.b=b;self.std=std;self.v=b['variants'][variant];self.old=copy.deepcopy(old);self.customer=b['name']if std else self.v['customer'];self.name=b['name'];self.variant=variant;self.pic=Pictures(b,0 if std else variant+1);self.slides=[];self.stage=[]
  core=list(b['products']);previous=old.get('products',[])
  self.products=list(dict.fromkeys(core+[p for p in previous if p in P and b['ind']in P[p].get('ind',[])]))if std else PROJECT_PRODUCTS[b['key']][variant].split()
  self.solutions=list(b['solutions'])if std else PROJECT_SOLUTIONS[b['key']][variant].split();self.cases=list(b['cases']);names=SPACES[b['key']].split('|')
  if not std and self.v.get('spaces'):
   operation=next((n for n in reversed(self.v['spaces'])if re.search(r'관리|운영|관제|지원실',n)),names[-1])
   names=[n for n in dict.fromkeys(self.v['spaces']+names)if n!=operation][:6]+[operation]
  self.spaces=[space_content(n,self.products)for n in names]
  self.logo='업종 표준'if std else'제안 예시';self.project=b['name']+' 표준 제안서'if std else self.v['title'];self.pains=self.v['pains'];self.measures=self.v['measures'];self.promise=self.v['promise'];self.pilot='대표 공간·운영 담당자 선정'if std else self.v['pilot'];self.condition=self.v['condition']
 def names(self,ids):return ' · '.join(P[p]['name']for p in ids)
 def shortspec(self,p):return ' · '.join(P[p]['spec'].split(' · ')[:2])
 def product_space(self,p):
  rules={
   'hoteltv':r'객실|침실|생활관','bi_fridge':r'주방|카페|레스토랑|식당','bi_induction':r'주방|레스토랑|식당','bi_dish':r'주방|레스토랑|식당',
   'laundry':r'세탁','airdresser':r'드레스|객실|세탁','flip':r'회의|강의|교실|교육|프로그램','onyx':r'상영|공연',
   'thewall':r'로비|연회|라운지','kiosk':r'주문|창구|접수|입구','window':r'쇼윈도|입구','qm55c':r'로비|안내|대기|입구',
   'book':r'업무|사무|행정|교무|상담','tabs11':r'상담|강의|교실|창구|체험|업무|사무|행정|운영','tabactive5':r'물류|생산|품질|현장|점검|직원|사무|운영','xcover7':r'물류|생산|현장|점검|직원|사무|운영',
   'wf1way':r'객실|침실|세대|거실|생활관','wf4way':r'업무|교육|회의|로비|강의|공용','ac360':r'라운지|카페|식당|레스토랑','purifier':r'교실|침실|객실|거실|생활관',
   'dvms2':r'기계|시설|관리|관제','dvmchiller':r'기계|시설|관리|관제','erv':r'강의|교실|업무|공용'}
  return next((s for s in self.spaces if re.search(rules.get(p,r'$^'),s['name'])),next((s for s in self.spaces if p in s['products']),self.spaces[0]))
 def add(self,f,role,t,imgs,kind):
  if not self.slides and self.old['id']in COVER_PHOTOS:
   imgs=[copy.deepcopy(COVER_PHOTOS[self.old['id']])];self.pic.used[imgs[0]['src']]+=1
  schema=LAYOUTS[f];missing=set(schema['text'])-set(map(str,t));extra=set(map(str,t))-set(schema['text'])
  if missing or extra:raise ValueError(f+' text mapping missing '+str(missing)+' extra '+str(extra))
  t={str(k):unicodedata.normalize('NFC',v)if isinstance(v,str)else v for k,v in t.items()};blank=[k for k,v in t.items()if not str(v).strip()]
  if blank:raise ValueError(f+' empty '+str(blank))
  if len(imgs)!=len(schema['images']):raise ValueError(f+' image count '+str(len(imgs))+' != '+str(schema['images']))
  seen=set()
  for k,im in enumerate(imgs):
   if im['src']in seen and im.get('query'):imgs[k]=self.pic.scene(im['query'],avoid=seen)
   seen.add(imgs[k]['src'])
  if not self.slides:self.hero=copy.deepcopy(imgs[0])
  img=dict(zip(schema['images'],imgs));self.slides.append({'f':f,'t':t,'img':img});self.stage.append((kind,role))
 def footer(self,t,f):
  schema=LAYOUTS[f]['text']
  for k,s in schema.items():
   if s.strip()=='고객사 로고':t[int(k)]=self.logo
   elif s.startswith('CONFIDENTIAL'):t[int(k)]='CONFIDENTIAL · '+str(len(self.slides)+1)
  keys=list(schema);foot=keys[-2]
  if int(foot)not in t:t[int(foot)]=self.customer+' · '+('표준 구성안'if self.std else'가상 고객 제안 예시')+' · 사진: 삼성전자 등록 참고자료'
  if f=='L_PH_CB_A':t[int(foot)]='사진: 삼성전자 · 공식 공간 참고자료'
  return t
 def cover(self,variant):
  t={1:'SAMSUNG',2:'BUSINESS PROPOSAL',3:self.name+'\n표준 제안서',4:'대표 공간의 제품·솔루션과 운영 구상',5:'삼성 B2B',6:'업종별 공간·운영 제안',7:'CONFIDENTIAL'}
  self.add('L_C01','표지 · '+self.name,t,[self.pic.scene(self.spaces[0]['name'],wide=True)],'open')
 def experience_cover(self):
  t={1:'SAMSUNG',2:'BUSINESS PROPOSAL',3:self.name+'\n도입 제안서',4:self.v['title'],5:'CONFIDENTIAL',6:self.customer}
  self.add('L_C02','표지 · '+self.name,t,[self.pic.scene(self.spaces[0]['name'],wide=True)],'open')
 def scene_intro(self):
  sp=self.spaces;t={6:'01 · 고객의 공간',7:self.promise,8:'이번 제안의 출발점',9:self.v['scope']}
  for k in range(3):
   t[k*2]='공간 '+str(k+1);t[k*2+1]=sp[k]['name'];i=10+k*3;t.update({i:f'{k+1:02}',i+1:sp[k]['name'],i+2:self.pains[k]})
  self.add('L_PH_CB_A','세 공간에서 시작하는 고객 경험',self.footer(t,'L_PH_CB_A'),[self.pic.scene(s['name'])for s in sp[:3]],'context')
 def photo_values(self):
  t={0:'02 · 제안 방향',1:self.promise,2:self.v['scope']+' · 공간과 제품, 실제 이용 흐름을 함께 설계합니다',3:'사용',4:'이용자에게 자연스럽게',5:self.spaces[0]['shortAction'],6:'관리',7:'담당자에게 일관되게',8:self.pains[1]+' · 운영 기준을 함께 정합니다',9:'확장',10:'대표 공간부터 단계적으로',11:self.pilot+'에서 사용·운영 조건을 먼저 검증합니다'}
  self.add('L_PH_VP_C','사용·관리·확장 세 가지 설계 원칙',self.footer(t,'L_PH_VP_C'),[self.pic.scene(self.spaces[1]['name'],wide=True)],'value')
 def overview_four(self):
  sp=self.spaces;t={0:'01 · 운영 제안',1:'지금의 불편에서 다음 운영 방식까지',2:self.v['scope']+' · 현장·기기·담당자·도입 순서',3:'적용 공간 · 공식 참고사진'}
  values=[('WHY','무엇이 불편한가',self.pains[0],self.pains[1],'현장 과제','고객 상황',sp[0]['name']),('WHAT','어디에 적용하는가',sp[1]['name']+' · '+sp[2]['name'],self.names(self.products[:2]),'제품 구성','지원 모델 확인',sp[1]['name']),('HOW','어떻게 운영하는가',S[self.solutions[0]]['name'],self.promise,'설정·사용·점검','담당자 합의',sp[6]['name']),('NEXT','무엇부터 검증하는가',self.pilot,self.measures[0]+' · '+self.measures[1],'대표 공간 검증','실사 후 확정',sp[2]['name'])]
  for k,valueset in enumerate(values):
   i=4+k*8;t[i]=str(k+1)
   for j,value in enumerate(valueset):t[i+1+j]=value
  self.add('L_PH_OV_E','현장·기기·운영·검증을 한눈에',self.footer(t,'L_PH_OV_E'),[self.pic.scene(sp[k]['name'])for k in [0,1,6,2]],'open')
 def summary(self):
  p=self.products;sol=self.solutions
  t={0:'01 · 제안 요약',1:self.name+'의 적용 범위와 운영을 한눈에',2:'현장의 과제 · 제품 구성 · 운영 방식 · 도입 조건',3:'01',4:'검토할 과제',5:'분산',6:'기기·안내·업무 관리',7:self.pains[0],8:self.pains[1],9:'02',10:'이번 구성',11:self.names(p[:2]),12:' · '.join(S[s]['name']for s in sol[:2]),13:self.spaces[0]['name']+'부터 단계 적용',14:'03',15:'확인할 변화',16:'연결',17:'공간과 이용 흐름',18:'표준',19:'설정·안내·점검 절차',20:'실측',21:self.measures[0],22:'04',23:'지원 범위',24:'제품군별 설치 조건 확인',25:'연동·권한·라이선스 합의',26:'교육·인수·점검 이력',27:'KEY MESSAGE',28:self.promise,29:'다음 단계 · '+self.pilot}
  self.add('L_PH_ES_A','핵심 과제·구성·효과 요약',self.footer(t,'L_PH_ES_A'),[self.pic.scene(self.spaces[0]['name'])],'open')
 def pains_page(self):
  after=['정보·설정·기록을 같은 기준으로 관리합니다','공간과 사용자별 접근·운영 권한을 정합니다','담당자 변경 뒤에도 점검·인계 이력을 남깁니다']
  t={0:'02 · 고객 과제',1:self.name+'의 현재 과제와 바라는 운영',2:'표준 검토 항목'if self.std else self.v['scope']+' · 가상 고객의 요구 조건',3:'현재 과제',4:'바라는 운영',5:'업무·기기별 관리가 나뉜 상태',6:self.pains[0],7:self.pains[1],8:self.pains[2],9:self.promise,10:after[0],11:after[1],12:after[2]}
  self.add('L_PH_CH_B','현재와 목표 운영 비교',self.footer(t,'L_PH_CH_B'),[self.pic.scene(self.spaces[0]['name']),self.pic.scene(self.spaces[6]['name'])],'context')
 def space_map(self):
  f='L_PH_SS_'+IND_LAYOUT[self.b['ind']]+'_A';sp=self.spaces;t={0:'03 · 공간별 구성',1:self.name+'의 일곱 공간을 제품·운영으로 연결',2:'공간별 사용자 행동, 필요한 제품과 연결할 솔루션을 함께 정리했습니다',3:'1',4:sp[0]['name'],5:'대표 공간',6:sp[0]['action'],7:ACTORS.get(self.b['ind'],sp[0]['actor']),8:' · '.join(PRODUCT_LABELS.get(p,P[p]['cat'])for p in sp[0]['products']),33:'전체 구성',34:'솔루션 · 운영 범위 · 적용 공간',35:'수량·연동 범위는 실사로 확정'}
  for k in range(1,7):
   base=9+(k-1)*4;t.update({base:str(k+1),base+1:sp[k]['name'],base+2:sp[k]['shortAction'],base+3:' · '.join(PRODUCT_LABELS.get(p,P[p]['cat'])for p in sp[k]['products'][:2])})
  schema=LAYOUTS[f]['text'];last=int(list(schema)[-3]);cursor=36;group=0
  while cursor<last:
   sid=self.solutions[group%len(self.solutions)];t[cursor]=S[sid]['name'];cursor+=1
   t[cursor]=SOLUTION_LABELS.get(sid,S[sid]['cat'])if group<len(self.solutions)else'설정·교육·점검·인계의 역할을 분담합니다';cursor+=1
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
  size=4 if not self.std and self.variant==0 else 3
  for start in range(0,len(ids),size):
   group=ids[start:start+size]
   if len(group)<3:
    for p in group:self.single_product(p)
    continue
   f='L_PH_P4_A'if len(group)==4 else'L_PH_P3_A'
   t={0:'04 · 공간별 제품',1:'공간에 맞춰 고르는 '+str(len(group))+'가지 제품',2:'설치 장면과 실제 제품을 함께 비교합니다. 사양과 지원 기능은 모델별로 확인합니다.'};imgs=[]
   for k,p in enumerate(group):
    where=self.product_space(p);i=3+k*4;t.update({i:where['name'],i+1:P[p]['model'],i+2:self.shortspec(p),i+3:where['shortAction']});imgs.extend([self.pic.scene(where['name']+' '+P[p]['cat']),product_picture(p)])
   self.add(f,'적용 제품 · '+self.names(group),self.footer(t,f),imgs,'space')
 def single_product(self,p):
  where=self.product_space(p)
  t={0:'04 · 공간별 제품',1:where['name']+' · '+P[p]['model'],2:where['name'],3:P[p]['name'],4:'KEY MESSAGE',5:where['action']+' · '+P[p]['spec'],6:'SAMSUNG OFFERING',7:P[p]['name'],8:'등록 사양',9:self.shortspec(p),10:'1',11:'설치·운영 확인',12:'설치 위치·전원·연동 지원·운영 담당자를 확인합니다',13:'2'}
  self.add('L_AIS_12','제품 상세 · '+P[p]['name'],self.footer(t,'L_AIS_12'),[self.pic.scene(where['name']),product_picture(p)],'space')
 def ops_challenges(self):
  consequence=['현장 상태와 설정·담당자가 분리되면 같은 요청을 다시 확인하게 됩니다','허용 범위와 실제 동작을 대조할 기록이 있어야 조치 순서를 정할 수 있습니다','발생·조치·인수 이력을 남겨 다음 담당자가 반복 확인하지 않도록 합니다']
  t={0:'02 · 운영 과제',1:self.name+'의 반복 업무를 먼저 정리합니다',2:self.v['scope']+' · 고객 상황 기반 검토 예시'}
  for k in range(3):i=3+k*6;t.update({i:'과제 '+str(k+1),i+1:self.spaces[k]['name'],i+2:self.pains[k],i+3:consequence[k],i+4:['기록','조건','이력'][k],i+5:self.measures[k]})
  self.add('L_PH_CH_A','세 가지 운영 과제와 확인 지표',self.footer(t,'L_PH_CH_A'),[self.pic.scene(self.spaces[k]['name'])for k in range(3)],'context')
 def ops_workflow(self):
  sid=self.solutions[0]
  if sid in['biot','stpro','sac']:steps=['상태 수집','기준 비교','예외 확인','운전 조정','기록·인계']
  elif sid in['vxt','magicinfo','content']:steps=['요청 접수','콘텐츠 승인','예약 배포','적용 확인','복구·인계']
  elif sid in['knoxsuite','knoxcapture','dex']:steps=['단말 배포','정책·앱 설정','현장 사용','예외 대응','회수·초기화']
  elif sid=='lynk':steps=['객실 정보 확인','콘텐츠·정책','영업 중 변경','동작·예외 확인','체크아웃·인계']
  else:steps=['계정·기기 확인','사용 장면 설정','상태·요청 확인','점검·조치','초기화·인계']
  detail=['기기·요청·사용자의 상태를 같은 형식으로 기록합니다','운영 기준과 실제 상태를 대조하고 담당자를 정합니다','우선순위·권한·승인 경로에 따라 예외를 처리합니다','이용자와 운영자가 처리 결과를 함께 확인합니다','설정·조치·인수 이력을 다음 담당자에게 전달합니다']
  t={0:'02 · 운영 흐름',1:'단계 사이의 확인과 인계까지 연결합니다',2:'기록·설정·조치·검증·인계의 담당자와 전달 기준을 정리한 목표 운영안'}
  for k in range(5):i=3+k*6;t.update({i:f'{k+1:02}',i+1:steps[k],i+2:'운영 기준',i+3:detail[k],i+4:['기록','기준','조치','검증','인수'][k],i+5:['현장 담당','운영 담당','지원 담당','공동 확인','관리 담당'][k]})
  t[33]='연결 기준';t[34]=self.promise
  self.add('L_PH_CB_C','접수·설정·조치·확인·인계 흐름',self.footer(t,'L_PH_CB_C'),[self.pic.scene(self.spaces[k]['name'])for k in [0,6,2,5,6]],'context')
 def ops_values(self):
  t={0:'03 · 운영 가치',1:'이용자의 불편과 운영자의 반복 작업을 줄입니다',2:self.promise,3:'01',4:'서비스·업무의 연속성',5:'예외 발생 전후에 어떤 정보를 누가 확인하는지 정하고 본래 업무로 복귀하는 절차를 맞춥니다',6:'예외 처리',7:'계정·설정',8:'02',9:'운영의 일관성과 인계',10:'승인·설정·점검 기준과 조치 이력을 담당자가 바뀌어도 이어갑니다',11:'권한·담당자',12:'운영 이력'}
  self.add('L_PH_VP_B2','이용자 연속성과 운영 일관성',self.footer(t,'L_PH_VP_B2'),[self.pic.scene(self.spaces[0]['name']),self.pic.scene(self.spaces[6]['name'])],'value')
 def ops_solution(self,sid):
  s=S[sid];steps=FLOWS.get(sid,['연동 범위 확인','사용 흐름 구성','운영 권한 설정','기록·예외 확인'])
  t={0:'적용 대상 · 참고 현장',1:self.spaces[0]['name'],2:'05 · 솔루션 기능',3:s['name']+'를 운영자의 업무로 연결',4:'기능·모델·권한·연동 조건을 확인해 적용 범위를 정합니다',5:'기능 01',6:steps[0],7:s['desc'],8:'연결',9:'기능 02',10:steps[1],11:'운영 스케줄과 사용자 역할에 맞춘 설정·예외 처리 기준을 합의합니다',12:'설정',13:'기능 03',14:steps[2],15:self.condition,16:'확인'}
  self.add('L_PH_SF_B',s['name']+' 기능·설정·확인 기준',self.footer(t,'L_PH_SF_B'),[self.pic.scene(self.spaces[0]['name']),self.pic.solution(sid),self.pic.scene(self.spaces[6]['name']),self.pic.scene(self.spaces[1]['name'])],'build')
 def solution_photos(self,sid):
  if len(self.pic.screens(sid))<3:return self.ops_solution(sid)
  s=S[sid];sp=self.spaces;steps=USE_FLOWS.get('magicinfo'if sid=='vxt'else sid)
  if steps is None:return self.ops_solution(sid)
  t={0:'05 · 쓰는 장면과 화면',1:s['name']+'를 실제 업무 장면으로 봅니다',2:'등록된 솔루션 화면과 사용 장면을 함께 살펴봅니다. 모델·버전별 지원 범위는 별도 확인합니다.',3:'장면 · 담당자',4:'연결할 솔루션 화면',5:'현장에서 확인할 것'};imgs=[]
  for k,e in enumerate(steps[:3]):
   i=6+k*7;t.update({i:e[3]+' · '+sp[e[2]]['name'],i+1:e[1],i+2:s['name']+' · '+e[0],i+3:self.measures[k],i+4:['사용','설정','조치'][k],i+5:'확인',i+6:e[4]});imgs.extend([self.pic.scene(sp[e[2]]['name']+' '+e[1]),self.pic.solution(sid)])
  self.add('L_PH_SO_B',s['name']+' · 장면·화면·확인 기준',self.footer(t,'L_PH_SO_B'),imgs,'build')
  self.slides[-1]['notes']=steps[-1][4]+'\n'+self.condition
 def dual_operation(self,sid):
  s=S[sid];sp=self.spaces;steps=USE_FLOWS.get(sid)
  if not steps:return self.ops_solution(sid)
  t={0:'05 · 현장과 운영',1:'사용자와 운영자가 같은 상황을 함께 해결합니다',2:s['name']+' · '+self.v['scope']+' · 지원 범위 안에서 검증할 목표 운영안',3:'이용자 · 현장',4:sp[0]['name'],5:sp[0]['actor'],6:P[self.products[0]]['name'],7:'운영자 · 관리 담당',8:sp[6]['name'],9:'설정·알림·조치·인수 확인',10:s['name'],11:'사용자가 하는 일',12:'운영 단계',13:'운영자가 확인할 일'}
  left=[self.pains[0],steps[0][1],steps[1][1],steps[2][1],steps[3][1]]
  flow=FLOWS.get(sid,['기기 상태 확인','지원 기능 설정','예외 처리','변경 이력 기록'])
  right=[flow[0]+' · 대상 기기 확인',flow[1]+' · 담당자 지정',flow[2]+' · 지원 범위 확인','현장 결과와 예외 항목 공동 확인',flow[3]+' · 변경 이력 기록']
  for k in range(5):i=14+k*5;t.update({i:['불편','준비','사용','확인','종료'][k],i+1:left[k],i+2:['접수','확인','조치','검증','인계'][k],i+3:['확인','설정','대응','검증','기록'][k],i+4:right[k]})
  self.add('L_PH_SO_D',s['name']+' · 현장 사용자와 운영자의 역할',self.footer(t,'L_PH_SO_D'),[self.pic.scene(sp[0]['name']),product_picture(self.products[0]),self.pic.scene(sp[6]['name']),self.pic.solution(sid)],'build')
  self.slides[-1]['notes']=self.condition+'\n'+'\n'.join(e[4]for e in steps)
 def ops_cover(self):
  t={1:'SAMSUNG',2:'BUSINESS PROPOSAL',3:self.name+'\n운영 개선 제안서',4:self.v['title'],5:self.customer,6:self.v['scope'],7:'CONFIDENTIAL'}
  query={'smart_factory':'공장 생산 현장','smart_finance':'은행 상담 태블릿','smart_hotel':'호텔 객실','smart_network':'통신 매장 상담','smart_transportation':'물류 배송 직원','smart_office':'오피스 회의실','ai_office':'오피스 회의실','smart_university':'캠퍼스 도서관','smart_public':'도서관','smart_school':'학교 교실','ai_apartment':'아파트 거실','smart_home':'아파트 거실'}.get(self.b['key'],self.spaces[0]['name'])
  self.add('L_C01','표지 · '+self.name,t,[self.pic.scene(query,wide=True)],'open')
 def bundles(self):
  p=self.products;s=self.solutions;sp=self.spaces
  t={0:'04 · 구성안 비교',1:'필수 구성에서 운영 연동까지 단계 확장',2:'구성 범위를 비교하는 예시입니다. 설치·연동·라이선스와 견적은 현장 조건으로 확정합니다.',3:'필수형',4:'핵심 기능 중심',5:sp[0]['name']+' 핵심 기기',6:'·',7:P[p[0]]['name'],8:P[p[0]]['model'],9:'이용자',10:sp[0]['action'],11:'운영자',12:'설치 위치·사용 방법·담당자를 먼저 정리',13:'운영형',14:'기준 구성',15:'기기·솔루션 연결',16:'정보·설정·점검을 함께 관리',17:'·',18:P[p[1]]['name'],19:P[p[1]]['model'],20:'+',21:S[s[0]]['name'],22:S[s[0]]['cat'],23:'+',24:P[p[2]]['name'],25:sp[1]['name'],26:'이용자',27:sp[1]['action'],28:'운영자',29:'승인·설정 변경·운영 이력을 연결',30:'확장형',31:'공용부·지원 포함',32:'다른 공간과 운영 지원으로 확장',33:'·',34:P[p[3]]['name'],35:P[p[3]]['model'],36:'+',37:S[s[-1]]['name'],38:S[s[-1]]['cat'],39:'+',40:P[p[-1]]['name'],41:sp[5]['name'],42:'이용자',43:sp[5]['action'],44:'운영자',45:'교육·인수·점검 기준을 운영팀에 이관',46:'단계별 적용 범위 비교 · 최종 수량·금액은 현장 실사와 견적서에서 확정'}
  self.add('L_PH_P_O','필수형·운영형·확장형 구성 비교',self.footer(t,'L_PH_P_O'),[self.pic.scene(sp[k]['name'])for k in range(3)],'space')
 def solution_page(self,sid):
  s=S[sid];sp=self.spaces;example=USE_FLOWS.get('magicinfo'if sid=='vxt'else sid)
  if sid=='smartthings'and self.b['ind']=='ED':example=[('수업 전','실내 상태 확인',2,'교직원','연동된 기기의 상태와 수업 전 운영 모드를 확인합니다'),('수업 중','공간 운영 조정',2,'운영자','지원 기기의 동작 상태를 확인하고 이용 상황에 맞춰 조정합니다'),('휴식','공기질 확인',4,'시설 담당','공기질과 지원되는 청정·환기 기기의 상태를 확인합니다'),('종료','전원·모드 확인',6,'운영팀','수업 종료 후 연동 기기의 상태와 다음 수업의 준비 조건을 확인합니다')]
  if example is None:example=[('시작','사용 범위 확인',0,'이용자',s['desc']),('이용','서비스 처리',1,'현장 담당','허용된 업무·서비스 흐름에서 실제 동작을 확인합니다'),('예외','처리 상태 확인',2,'운영자',self.condition),('종료','기록·이력 인계',6,'관리자','사용 결과와 예외 항목을 기록하고 다음 담당자에게 전달합니다')]
  a,b,c,d=example
  t={0:'05 · 솔루션 · '+s['name'],1:s['name']+' 이용·운영 흐름',2:s['desc']+' · 지원 모델·연동 조건을 확인하는 사용 예시',3:'1',4:a[0],5:a[1],6:sp[a[2]]['name']+' · '+a[3],7:a[4],8:'2',9:b[0],10:b[1],11:sp[b[2]]['name'],12:b[3],13:b[4],14:'3',15:c[0],16:c[1],17:sp[c[2]]['name']+' · '+c[3],18:c[4],19:'4',20:d[0],21:d[1],22:d[3],23:d[4],24:'확인',25:self.measures[0]+'를 기준선과 비교해 확인합니다',26:'지원 범위 검증'}
  imgs=[self.pic.scene(sp[e[2]]['name'])for e in example]
  if sid not in['care','smartthings']:imgs[1]=self.pic.solution(sid)
  self.add('L_PH_SOL_S',s['name']+' 사용 장면과 운영 연결',self.footer(t,'L_PH_SOL_S'),imgs,'build')
 def architecture(self):
  s=self.solutions[0];sp=self.spaces;t={0:'05 · 구성·연동 구조',1:'운영 담당자와 현장 기기의 연결을 정리',2:'누가 무엇을 설정하고 확인하는지, 시스템별 책임 경계를 먼저 합의합니다',3:S[s]['name']+' · 운영 기준'}
  for k in range(4):t[4+k*2]=sp[k]['name'];t[5+k*2]=self.names(sp[k]['products'][:1])
  t[12]='관리 구역 · 사용자 권한 · 기기·네트워크·데이터 연동';t[13]=self.condition
  self.add('L_PH_SA_B','현장 기기·운영 시스템 연결',self.footer(t,'L_PH_SA_B'),[self.pic.solution(s)]+[self.pic.scene(sp[k]['name'])for k in range(4)],'build')
 def case_essay(self,cid):
  c=C[cid];space=' · '.join((c.get('space')or[c.get('type','공식 도입 사업장')])[:3]);offer=' · '.join((c.get('offer')or c.get('prod')or['도입 구성'])[:3]);needs=' · '.join((c.get('needs')or['운영 조건 확인'])[:2]);proof=' · '.join((c.get('proof')or[])[:1])
  space=space+' · '+(c.get('needs')or['공간별 운영 목적 확인'])[0]
  if proof and len(offer+' · '+proof)<=110:offer=offer+' · '+proof
  review=self.condition+' · '+self.measures[0]+' 기준선 확인'
  t={0:'06 · 적용 근거',1:c['cust'],2:'공식 도입사례 · '+c['date'][:4]+' · '+(c.get('type')or c.get('sub')or'공간·제품·운영 구성'),3:'1',4:'2',5:'3',6:'도입 내용',7:'1',8:'공간과 도입 과제',9:space,10:'2',11:'제품·솔루션 구성',12:offer,13:'3',14:'고객별 검토 조건',15:review,16:'원문 · '+c['url'].replace('https://',''),18:'공식 사례의 구성 비교 · 고객·공간·연동 조건에 따라 적용 범위 확인'}
  count=len(self.pic.case_images(cid))
  if count>=4 and(self.std or self.variant==1):self.add('L_AIS_29','사례 구성 · '+c['cust'],self.footer(t,'L_AIS_29'),self.pic.case(cid,4),'proof')
  elif count>=3:
   case_space=(c.get('space')or['도입 현장'])[0]
   fields={0:'적용 공간',1:case_space[:24],2:'제품·솔루션',3:'실제 적용 구성',4:'도입 현장',5:c['cust'][:28],6:'06 · 공식 도입사례',7:c['cust']+'에서 살펴보는 적용 방식',8:'공식 사례의 적용 맥락',9:space,10:'01',11:'공간과 과제',12:needs,13:'02',14:'제품·솔루션',15:offer,16:'03',17:'이번 고객의 확인 사항',18:review}
   self.add('L_PH_CB_A','사례 구성 · '+c['cust'],self.footer(fields,'L_PH_CB_A'),self.pic.case(cid,3),'proof')
  else:
   fields={0:'공식 도입 현장',1:c['cust'],2:'06 · 공식 도입사례',3:'한 현장의 도입 맥락을 구체적으로 살펴봅니다',4:'실제 도입 범위와 이번 고객의 조건을 비교합니다',5:'01',6:'공간과 도입 과제',7:space,8:'공식 도입사례',9:'02',10:'제품·솔루션 구성',11:offer,12:'적용 구성',13:'03',14:'이번 고객의 확인 사항',15:review,16:'고객별 검토',18:'사진·내용 출처 · '+c['cust']+' 공식 도입사례'}
   self.add('L_PH_OV_H','사례 구성 · '+c['cust'],self.footer(fields,'L_PH_OV_H'),self.pic.case(cid,1),'proof')
  self.slides[-1]['notes']=proof+'\n'+json.dumps(c,ensure_ascii=False)
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
  self.add('L_AIS_37','다음 단계 · 현장 실사와 범위 합의',t,[copy.deepcopy(self.hero)],'close')
 def ask_page(self):
  t={0:'도입 공간 · 참고 장면',1:self.spaces[0]['name']+' 적용 구상',2:'08 · 다음 단계',3:'시범 범위와 판단 기준을 합의합니다',4:'공간·제품·연동·담당자를 확인하고 다음 행동을 정합니다',5:'01',6:self.pilot,7:'운영·시설·IT 담당자가 대상 공간과 사용 흐름을 확인합니다',8:'다음 협의',9:'고객 운영팀',10:'02',11:'제품·연동·설치 조건 확인',12:self.condition,13:'실사 합의',14:'고객 · 공급·설치 파트너',15:'03',16:'검증 결과와 인수 기준 합의',17:'지표·예외 처리·운영 인계 조건을 함께 확인합니다',18:'공동 판정',19:'공동',20:'협의 담당',21:'운영 담당 · 시설/IT 담당 · 공급 파트너'}
  self.add('L_PH_C13','공간·조건·담당자 결정 요청',self.footer(t,'L_PH_C13'),[self.pic.scene(self.spaces[0]['name'])],'close')
 def build(self,variant):
  ops=not self.std and variant==1
  if self.std:self.cover(variant);self.summary();self.pains_page();self.space_map();self.values()
  elif ops:self.ops_cover();self.overview_four();self.ops_challenges()
  else:self.experience_cover();self.scene_intro();self.photo_values()
  self.products_pages()
  if self.std:self.bundles()
  for k,sid in enumerate(self.solutions[:3 if self.std else 2]):
   if ops and k==0:self.dual_operation(sid)
   elif not self.std or k%2:self.solution_photos(sid)
   else:self.solution_page(sid)
  self.architecture();self.case_essay(self.cases[variant])
  if self.std:self.case_essay(self.cases[1-variant])
  self.measures_page()
  if ops:self.rollout();self.implementation()
  else:self.implementation();self.rollout()
  if self.std:self.why()
  self.ask_page();self.close()
  scenario=copy.deepcopy(self.old);scenario.pop('preview',None)
  groups=[]
  for k,(kind,role)in enumerate(self.stage):
   if not groups or groups[-1]['key']!=kind:groups.append({'key':kind,'name':{'open':'제안 개요','context':'고객 과제와 적용 공간','value':'기대 가치','space':'제품과 구성안','build':'솔루션·연동·운영','proof':'공식 사례와 적용 근거','plan':'검증·구축·운영 계획','close':'다음 단계'}[kind],'goal':role,'slides':[]})
   groups[-1]['slides'].append({'f':self.slides[k]['f'],'role':role})
  scenario.update(flow=groups,products=self.products,solutions=self.solutions,cases=self.cases,minutes=45 if self.std else 30,authoringRevision=REVISION,coverRevision='single-photo-cover-v1',sourceMode='existing-layouts',referenceScenario=REFERENCE[self.b['ind']],title=self.name+' 표준 제안서'if self.std else self.v['customer']+' — '+self.v['title'],short=self.promise,logic=[g['name']for g in groups],diff=['공간별 사용자 행동과 제품·솔루션을 함께 정리','시범·실측·인수 조건까지 완성한 구성','공식 사례의 사실과 고객별 검토 조건을 구분'])
  scenario['tone']='현장 업무·운영 조건·역할을 구체적으로 설명하고 효과는 실측으로 확인'
  if self.std:scenario.update(std=True,req='std',situation=self.name+'의 공간·제품·솔루션을 기존 Best Scenario의 완성된 양식으로 구성한 표준 제안입니다. 반복 목차와 빈 장표는 통합하고 적용 범위·제품 사양·운영 흐름·공식 사례·인수 조건을 함께 제시합니다.',fit='업종별 공간·제품·운영을 함께 검토하는 첫 제안',avoid='확정 도면과 최종 견적만 필요한 발주 단계',objections=[['모델과 수량은 어떻게 정하나요?','설치 공간·전원·네트워크와 운영 조건을 확인한 뒤 지원 모델과 수량을 합의합니다.'],['현장별 차이는 어떻게 반영하나요?','공간별 목적·사용자·연동·권한·운영 지원 범위를 조정합니다.']])
  who=[scenario['audience']['lead'],*scenario['audience']['others']][:3];weights=[40,35,25]if len(who)==3 else[60,40]if len(who)==2 else[100]
  types={'open':'overview','context':'challenge','value':'value','space':'products','build':'solution','proof':'case','plan':'execution','close':'closing'}
  story={'keymen':[[name,weights[k],[scenario['criteria'][k%len(scenario['criteria'])]]]for k,name in enumerate(who)],'note':scenario['situation'],'parts':{g['name']:{'type':types[g['key']],'items':[x['role']for x in g['slides']]}for g in groups}}
  return scenario,self.slides,story,self.customer

def main():
 data=json.loads((ROOT/'app/data/vertical_proposal_briefs.json').read_text())
 previous={True:data['standards'],False:data['best']}
 outputs={k:{'scenarios':[],'fills':{},'story':{},'customers':{},'sources':previous[k]['sources']}for k in [True,False]}
 for b in BRIEFS:
  for std in [True,False]:
   for variant in range(1 if std else 2):
    sid='bs_std_'+b['key']if std else'bs_v_'+b['key']+'_'+str(variant+1);old=next(s for s in previous[std]['scenarios']if s['id']==sid)
    deck=Deck(b,old,std,variant);s,f,st,c=deck.build(variant)
    if std:
     for i,notes in enumerate(old.get('sourceNotes',[])):
      if notes:f[i%len(f)]['notes']=f[i%len(f)].get('notes','')+'\n\n[기준 업종 자료 '+str(i+1)+'쪽]\n'+notes
    s.pop('sourceNotes',None)
    outputs[std]['scenarios'].append(s);outputs[std]['fills'][sid]=f;outputs[std]['story'][sid]=st;outputs[std]['customers'][sid]=c
    print(sid,len(f),'slides',len(deck.products),'products',flush=True)
 for std,name in [(True,'description_standard_scenarios.json'),(False,'vertical_scenarios.json')]:
  (TARGET/name).write_text(json.dumps(outputs[std],ensure_ascii=False,separators=(',',':'))+'\n')
 summary={'standards':len(outputs[True]['scenarios']),'best':len(outputs[False]['scenarios']),'standardSlides':sum(map(len,outputs[True]['fills'].values())),'bestSlides':sum(map(len,outputs[False]['fills'].values())),'layouts':sorted({f['f']for d in outputs.values()for deck in d['fills'].values()for f in deck}),'referenceScenarios':REFERENCE,'revision':REVISION}
 (OUT/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
