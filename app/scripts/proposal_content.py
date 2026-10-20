"""Existing Samsung catalog records and published media; no layout generation."""
from pathlib import Path
from collections import Counter
import json,re
ROOT=Path(__file__).resolve().parents[2]
read=lambda p:json.loads((ROOT/p).read_text())
CAT=read('app/data/catalog.json');MEDIA=read('app/data/media.json');IMAGES=read('app/data/images.json')['pids']
CURATED=read('app/data/products_db.json')['curated']
P={p['id']:{**p,**CURATED.get(p['id'],{})}for p in CAT['products']}
S={s['id']:s for s in CAT['solutions']};C={str(c['id']):c for c in CAT['cases']}

SPACE_WORDS = [
 (r'세대|모델하우스|거실|주거|입주',r'거실|세대|주택|주거|소파|침실|객실'),
 (r'주방|조리',r'주방|키친|냉장고|식탁|조리'),
 (r'교실|강의|교육장|학습|수업',r'교실|강의|교육|학습|전자칠판|플립|수업|실습실|시험'),
 (r'회의|세미나',r'회의실|회의|세미나|미팅|전자칠판|플립'),
 (r'사무|업무|교무|행정',r'사무|업무|책상|모니터|직원|행정'),
 (r'로비|입구|안내|민원|발권',r'로비|입구|키오스크|카운터|발권|안내|민원|현관|대합'),
 (r'관리|관제|상황실|운영실|지원실',r'관제|대시보드|관리 화면|관리자|제어|점검|스마트싱스|직원|노트북'),
 (r'물류|출고|배송|차량|인계 구역',r'물류|택배|배송|박스|적재|화물|차량|출고|스캔'),
 (r'작업장|현장|공정|생산',r'현장|작업|생산|공장|액티브|스캔'),
 (r'상담|창구|동의|서명|원무|접수',r'상담|창구|은행|직원|태블릿|서명|동의서'),
 (r'매장|카운터|주문|픽업',r'메뉴|주문|매장|카운터|태블릿|고객'),
 (r'상영|공연|전시',r'상영|극장|스크린|공연|강당|객석|무대|오닉스|전시|작품|테마파크'),
 (r'도서관',r'도서관|서가|열람|학습|자료 검색'),
 (r'생활관|병실|객실|주거동',r'병실|입소자|객실|침실|침대|생활관|거실'),
 (r'공조|설비|점검 구역|에어컨',r'실외기|공조|에어컨|시스템에어컨|천장|설비|점검'),
 (r'쇼룸|홍보관',r'쇼룸|전시|빌트인|주방|상담|가전'),
 (r'세탁|의류',r'세탁|빨래|에어드레서|의류|드레스룸'),
 (r'라운지|커뮤니티|대기|휴게',r'라운지|휴게|소파|식당|대기|커뮤니티|카페'),
 (r'공기질|청정|공기청정기',r'공기|청정|에어모니터|환기|에어컨'),
 (r'기기 설정|단말|복귀 점검',r'태블릿|단말|직원|대시보드|노트북|기기|화면'),
]
SPACE_HINTS = {
 '모델하우스':'아파트 거실','입주 세대':'아파트 거실','세대 거실':'아파트 거실',
 '단지 관리실':'통합 관제실','임대 운영실':'통합 관제실','관리사무소':'통합 관제실',
 '세탁·의류 관리':'세탁실','퇴거 점검 구역':'세대 가전 점검',
 '업무층':'사무실','입주 업무층':'사무실','행정 업무실':'사무실','교무실':'사무실',
 '시설 관리실':'통합 관제실','시설 관제실':'통합 관제실','시설 상황실':'통합 관제실',
 '센터 관리실':'통합 관제실','빌딩 관제실':'통합 관제실','운영 관제실':'통합 관제실',
 '분양 홍보관':'빌트인 쇼룸','공용 회의실':'회의실','주민시설':'커뮤니티 라운지',
 '학원 입구':'학교 로비','일반 교실':'강의실 책상','협업 교실':'강의실 전자칠판',
 '교육장':'강의실 전자칠판','강의동':'강의실','캠퍼스 공용부':'학교 로비',
 '연구동':'연구실 사무실','부대시설':'공장 에어컨','물류 운영실':'물류 관리 태블릿',
 '원무 접수':'병원 전자동의서 서명','진료 대기실':'병원 로비','병동 공용부':'병원 라운지',
 '단말 인계실':'업무 태블릿','영업 지원실':'사무실','방문 상담 현장':'은행 상담 태블릿',
 '백오피스':'호텔 원격 관리 노트북','본사 운영실':'사무실',
 '매장 관리실':'매장 직원 태블릿','매장 운영실':'매장 직원 태블릿',
 '브랜드 입구':'매장 입구','기기 체험존':'통신 매장 체험','상품 체험존':'상품 매장 체험',
 '여객 터미널':'공항 대합실','탑승 대기실':'공항 대합실','인계 구역':'물류 택배 차량',
 '기기 설정 공간':'태블릿 설정 화면',
}


def gallery(typ, ident):
    item = MEDIA['case' if typ == 'case' else 'sol'].get(str(ident))
    if not item: return []
    owner = C[str(ident)]['cust'] if typ == 'case' else S[ident]['name']
    page = C[str(ident)]['url'] if typ == 'case' else (item.get('pages') or [''])[0]
    return [dict(src=MEDIA['P'][row[0]//10000]+'#'+str(row[0]%10000), kind=row[1],desc=row[2],w=row[3],h=row[4],owner=owner,page=page,
                 ind=C[str(ident)].get('ind') if typ=='case' else None)
            for row in item['g'] if row[3] >= 260 and row[4] >= 150]


def cut(ident):
    pid = P[ident].get('img')
    pid = pid if pid in IMAGES and IMAGES[pid].get('src') == 'cut' else {
        'kiosk':'km24c.front','flip':'cut.wa75d','window':'cut.om55b',
        'led_indoor':'cut.ifr','led_outdoor':'cut.xhb','hoteltv':'cut.hg55bu',
        'hoteltv43':'cut.hg43bu','tabs11':'cut.tabs11',
    }.get(ident, 'cut.'+ident)
    x = IMAGES.get(pid)
    if not x or x.get('src') != 'cut': return None
    return dict(src=x['file'],desc=x['desc'],owner='삼성 제품 자료',page=x.get('page',''),pid=pid)
