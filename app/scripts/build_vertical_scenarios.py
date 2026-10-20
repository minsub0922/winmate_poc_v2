#!/usr/bin/env python3
"""Build forty authored customer decks from twenty individually reviewed specifications.

Uses only app-owned catalog and existing published image packs. No model calls,
source rewording of standard decks, or changes to saved user proposals.
"""
from html.parser import HTMLParser
from collections import Counter
import json
from pathlib import Path
import re
import subprocess

from vertical_briefs import BRIEFS
from read_vertical_spec import parse as parse_source

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = ROOT / 'app/web/src/domain/templates'
read = lambda p: json.loads((ROOT / p).read_text())
CAT = read('app/data/catalog.json')
MEDIA = read('app/data/media.json')
IMAGES = read('app/data/images.json')['pids']
CURATED = read('app/data/products_db.json')['curated']
P = {p['id']: {**p, **CURATED.get(p['id'], {})} for p in CAT['products']}
S = {s['id']: s for s in CAT['solutions']}
C = {str(c['id']): c for c in CAT['cases']}
SOURCE = ROOT / 'output/vertical-scenarios/sources'
# Read the canonical, dependency-free photo registry directly. Rebuilding must
# not depend on a temporary inventory from an earlier work session.
EXISTING = {'html': json.loads(subprocess.run(
    ['node','--input-type=module','-e',
     "import {PHOTO_HTML} from './app/web/src/domain/templates/photo_layouts.js';process.stdout.write(JSON.stringify(PHOTO_HTML));"],
    cwd=ROOT, check=True, capture_output=True, text=True).stdout)}

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


class Slots(HTMLParser):
    def __init__(self):
        super().__init__(); self.text = []; self.img = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'data-tb' in a: self.text.append(a['data-tb'])
        if 'data-img' in a: self.img.append(a['data-img'])


SLOTS = {}
for f, html in EXISTING['html'].items():
    p = Slots(); p.feed(html); SLOTS[f] = p


def photo(record, fit='cover'):
    return dict(src=record['src'], name=record['desc']+' · '+record['owner'], keep=True, fit=fit,
                source=record.get('page',''), note='기존 공식 자료 참고사진 · 가상 고객의 실제 현장이 아님')


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


def make_deck(brief, variant, index):
    v = brief['variants'][variant]
    customer, pains, measures, spaces = v['customer'], v['pains'], v['measures'], v.get('spaces',brief['spaces'])
    products, solutions, cases = brief['products'], brief['solutions'], brief['cases']
    for key in products:
        if key not in P: raise ValueError('unknown product '+key)
    for key in solutions:
        if key not in S: raise ValueError('unknown solution '+key)
    for key in cases:
        if key not in C: raise ValueError('unknown case '+key)
    case = C[cases[variant]]
    exact_case = gallery('case', cases[variant])
    pool = [x for x in exact_case if x['kind'] in ['s','e','p'] and x['w']/x['h']>=1.15]
    if len(pool)<3:
        pool += [x for c in cases if c!=cases[variant] for x in gallery('case',c)
                 if x['kind'] in ['s','e','p'] and x['w']/x['h']>=1.15]
    if len(pool) < 3:
        pool += [dict(src=x['file'],desc=x['desc'],owner='삼성 공식 참고자료',page=x.get('page',''),kind='s')
                 for pid,x in IMAGES.items() if pid.startswith('ph.'+brief['ind'].lower()+'-') and 'gray' not in pid and 'night' not in pid]
    if len(pool) < 3: raise ValueError('not enough relevant photos '+brief['key'])
    # Rank the actual scene description against its intended space. Industry
    # relevance alone is insufficient: an exterior cannot illustrate a kitchen.
    used=Counter()
    primary={x['src'] for x in exact_case}
    candidates={x['src']:x for x in pool}
    for pid,x in IMAGES.items():
        if not pid.startswith('ph.') or x.get('src') not in ['case','life'] or 'gray' in pid or 'night' in pid:continue
        if not (ROOT/'app/data/static'/x['file']).is_file():continue
        candidates.setdefault(x['file'],dict(src=x['file'],kind='s',desc=x['desc'],w=x['w'],h=x['h'],
            owner='삼성 공식 참고자료',page=x.get('page',''),ind=pid.split('.')[1].split('-')[0].upper()))
    # The published case gallery also includes spaces that are absent from the
    # small curated photo registry (e.g. loading bays and hospital reception).
    for cid,reference in C.items():
        for x in gallery('case',cid):
            if x['kind'] in ['s','e','p'] and x['w']/x['h']>=1.1:
                candidates.setdefault(x['src'],{**x,'ind':reference.get('ind')})
    def scene(n,space=None):
        query=space or spaces[0]
        # These spaces have unambiguous existing photographs. Do not let a
        # generic "tablet" or "scan" match substitute a different activity.
        if query.startswith('간호 스테이션'):
            x=IMAGES['ph.md-station']
            return dict(src=x['file'],desc=x['desc'],owner='삼성 공식 참고자료',page=x.get('page',''))
        if query.startswith('출고 작업장'):
            return next(x for x in gallery('case','3088') if '물류 창고' in x['desc'])
        for label in sorted(SPACE_HINTS,key=len,reverse=True):
            if query.startswith(label):query=SPACE_HINTS[label]+query[len(label):];break
        def score(x):
            desc=x['desc'];value=6 if x['src'] in primary else 0
            value+=6 if x.get('ind')==brief['ind'] else 0
            for token in query.split():
                if len(token)>1 and token in re.sub(r'\s','',desc):value+=5
            for pattern,terms in SPACE_WORDS:
                if re.search(pattern,query) and re.search(terms,desc):value+=12
            if re.search(r'동의|서명',query) and not re.search(r'동의|서명',desc):value-=30
            if re.search(r'물류|택배|출고',query) and not re.search(r'물류|택배|출고|배송|적재|박스|창고',desc):value-=30
            if re.search(r'외관|건물 외벽|옥상|실외기|항공|조감|건물 전경',desc) and not re.search(r'외부|설비|공조|실외|옥상|입구|관제',query):value-=24
            # Variety must never push an actually matching room below an
            # unrelated photo merely because the room appears more than once.
            value-=min(4,used[x['src']])
            return value
        ranked=sorted(candidates.values(),key=lambda x:(-score(x),x['src']))
        best=score(ranked[0]);ties=[x for x in ranked if score(x)>=best-1]
        chosen=ties[n%len(ties)];used[chosen['src']]+=1
        return chosen
    cuts = [(p,cut(p)) for p in products if cut(p)]
    if len(cuts) < 3: raise ValueError('not enough matching product cuts '+brief['key'])
    cuts = cuts[:3]
    sid = 'bs_v_'+brief['key']+'_'+str(variant+1)
    fills = []
    roles = []
    foot = customer+' · 가상 제안 · 사진: 삼성 공식 참고자료'

    def slide(f, title, values, pics, count=None):
        if f in SLOTS:
            t = {i:'' for i in SLOTS[f].text}
            expected_images = set(SLOTS[f].img)
        else:
            t = {str(i):'' for i in range(count)}
            expected_images = {'0','1'} if f == 'L_PH_VX_PROOF' else {'0'}
        for k,val in values.items():
            if str(k) not in t: raise ValueError(f'{f}: unknown text slot {k}')
            t[str(k)] = val
        im = {str(i): photo(x,fit) for i,(x,fit) in enumerate(pics)}
        if set(im) != expected_images: raise ValueError(f'{f}: image slots {set(im)} != {expected_images}')
        fills.append({'f':f,'t':t,'img':im,'design':'winmate-2'});roles.append(title)

    cover = 'L_PH_VX_COVER_B' if variant else 'L_PH_VX_COVER_A'
    cover_photo=scene(0,spaces[0])
    slide(cover,'표지 · '+v['title'],{0:brief['name']+' / '+('운영 개선' if variant else '공간 경험'),
          1:v['title'],2:v['promise'],3:customer,4:'가상 고객·일정·목표 · 제품 및 솔루션은 등록 자료 기준',
          5:cover_photo['desc']+' · '+cover_photo['owner']+' 참고',6:'삼성 B2B 제품 · 솔루션'},[(cover_photo,'cover')],7)

    def challenges():
        if variant:
            slide('L_PH_CH_B','현재 운영과 바라는 상태',{
                0:'01 · 운영 과제',1:customer+'의 반복 업무부터 줄입니다',2:'가상 고객 요구 · 두 사진은 공식 현장 참고자료',
                3:'현재의 과제',4:'제안하는 운영 상태',5:pains[0],6:pains[1],7:pains[2],8:'기준선은 착수 후 현장에서 확인',
                9:v['promise'],10:measures[0]+'을 같은 방식으로 기록',11:measures[1]+'으로 작업 품질 확인',12:v['condition'],
                13:'가상 고객',14:foot,15:'2'},[(scene(1,spaces[0]),'cover'),(scene(2,spaces[1]),'cover')])
        else:
            t={0:'01 · 고객 과제',1:customer+'의 세 가지 현장 요구',2:'가상 고객 조건 · 사전 인터뷰와 현장 실사로 기준선 확정',21:'가상 고객',22:foot,23:'2'}
            for j in range(3):
                base=3+j*6
                t.update({base:f'과제 {j+1:02d}',base+1:spaces[j],base+2:pains[j],base+3:measures[j]+'을 기록해 개선 여부를 확인합니다',base+4:'실측',base+5:'기준선 수집 후 목표 합의'})
            slide('L_PH_CH_A','공간별 요구와 측정 기준',t,[(scene(i+1,spaces[i]),'cover') for i in range(3)])

    def value():
        if index % 2:
            t={0:'02 · 제안 방향',1:v['promise'],2:v['scope']+' · 가상 고객 요구를 바탕으로 설계',19:'가상 고객',20:foot,21:'3'}
            for j in range(4):
                base=3+j*4;t.update({base:f'{j+1:02d}',base+1:spaces[j],base+2:pains[j%3] if j<3 else v['condition'],base+3:'확인 지표 · '+measures[j%3]})
            slide('L_PH_VP_B4','네 공간의 제안 포인트',t,[(scene(i+3,spaces[i]),'cover') for i in range(4)])
        else:
            slide('L_PH_VP_B2','이 제안의 두 가지 약속',{
                0:'02 · 제안 방향',1:v['promise'],2:v['scope']+' · 범위와 운영 조건을 먼저 합의',3:'01',4:'사용자가 체감하는 공간',
                5:pains[0]+' — '+spaces[0]+'부터 확인합니다.',6:spaces[0],7:measures[0],8:'02',9:'관리자가 이어갈 수 있는 운영',
                10:pains[2]+' — 점검과 인수 절차까지 만듭니다.',11:spaces[3],12:measures[2],13:'가상 고객',14:foot,15:'3'},
                [(scene(3,spaces[0]),'cover'),(scene(4,spaces[3]),'cover')])

    # The two customer decisions use a different argument order, not just a cover swap.
    if variant: value(); challenges()
    else: challenges(); value()
    slide('L_PH_P_I','대표 공간 · '+spaces[0],{
        0:'03 · 공간 경험 — '+spaces[0],1:spaces[0]+'에서 시작되는 변화',2:v['promise']+' · 사용 동선과 설치 위치를 함께 검토합니다.',
        3:P[products[0]]['name'],4:S[solutions[0]]['name'],5:'설치 조건 현장 확인',6:'가상 고객',7:foot,8:'4'},[(scene(5,spaces[0]),'cover')])
    slide('L_PH_VP_C','다음 공간 · '+spaces[1],{
        0:'03 · 공간 경험 — '+spaces[1],1:spaces[1]+'에서도 같은 사용 흐름으로',2:v['scope']+' · 제품 선택과 운영 역할을 연결합니다',
        3:'사용',4:spaces[1],5:pains[1],6:'운영',7:spaces[3],8:'상태 확인과 담당자 인계',9:'검증',10:'현장 확인',11:measures[1],12:'가상 고객',13:foot,14:'5'},[(scene(6,spaces[1]),'cover')])
    t={0:'04 · 제품 구성',1:'제품은 설치 공간과 사용 목적에 맞춰 고릅니다',2:'등록 제품 사양 기준 · 설치·연동 조건은 실사로 확정',15:'가상 고객',16:foot,17:'6'}
    pics=[]
    for j,(pid,asset) in enumerate(cuts):
        base=3+j*4
        t.update({base:P[pid]['name'],base+1:P[pid]['model'],base+2:P[pid]['spec'],base+3:spaces[j]+' · 설치 수량은 실사 후 산출'})
        pics += [(scene(7+j,spaces[j]+' '+P[pid]['name']),'cover'),(asset,'contain')]
    slide('L_PH_P3_A','공간에 맞춘 주력 제품 3종',t,pics)
    sol0,sol1=solutions[:2]
    slide('L_PH_VP_B2','사용자와 관리자를 위한 솔루션',{
        0:'05 · 솔루션',1:'기능에서 끝나지 않고 운영 절차로 연결합니다',2:'솔루션 설명은 현재 등록 자료 기준 · 모델·현장별 지원 확인',
        3:'01',4:S[sol0]['name'],5:S[sol0]['desc'],6:'담당자 · 현장 운영',7:'적용 범위 사전 확인',8:'02',9:S[sol1]['name'],
        10:S[sol1]['desc'],11:'담당자 · 관리 운영',12:'권한·인수 절차 합의',13:'가상 고객',14:foot,15:'7'},[(scene(10,spaces[0]),'cover'),(scene(11,spaces[3]),'cover')])
    # Use the actual solution gallery for the central image; no unrelated console.
    solpics=gallery('solution',sol0)
    hub=next((x for x in solpics if x['kind'] in ['u','d','k']), solpics[0] if solpics else scene(0))
    if index%3:
      slide('L_PH_SA_B','운영 주체와 공간을 연결하는 흐름',{
        0:'05 · 운영 흐름',1:'확인 · 조치 · 인계의 담당자를 정합니다',2:S[sol0]['name']+' 자료와 공간 참고사진 · 연결선은 제안하는 업무 흐름',
        3:S[sol0]['name']+' · 운영 검토',4:spaces[0],5:'사용 상태 확인',6:spaces[1],7:'업무 요청 확인',8:spaces[2],9:'담당자 조치',
        10:spaces[3],11:'완료 기록 · 인계',12:'지원 기기와 연동 범위는 도입 전 확인합니다',13:v['condition'],14:'가상 고객',15:foot,16:'8'},
        [(hub,'contain')]+[(scene(12+i,spaces[i]),'cover') for i in range(4)])
    else:
      ui=[x for x in solpics if x['kind'] in ['u','d','k']]
      if not ui:ui=solpics or [scene(12)]
      slide('L_PH_SF_B','현장·솔루션 자료·운영 기준',{
        0:'적용을 검토할 공간',1:spaces[0],2:'05 · 솔루션 제안',3:S[sol0]['name']+'를 실제 운영 기준으로 연결합니다',
        4:'현장 사진과 공식 솔루션 자료 · 기능별 지원 범위는 도입 전 확인',5:'범위 01',6:S[sol0]['name'],7:S[sol0]['desc'],8:'지원 확인',
        9:'범위 02',10:S[sol1]['name'],11:S[sol1]['desc'],12:'설치 검토',13:'범위 03',14:'운영 인수·예외 대응',15:v['condition'],16:'범위 합의',
        17:'가상 고객',18:foot,19:'8'},[(scene(12,spaces[0]),'cover')]+[(ui[i%len(ui)],'contain') for i in range(3)])
    slide('L_PH_P_I','운영자가 보는 공간 · '+spaces[3],{
        0:'05 · 공간 운영 — '+spaces[3],1:'사람이 바뀌어도 운영 기준은 남도록',2:spaces[3]+'에서 담당자·권한·점검 이력을 관리하는 절차를 마련합니다.',
        3:measures[2],4:'공동 점검과 인계',5:'예외 대응 절차',6:'가상 고객',7:foot,8:'9'},[(scene(14,spaces[3]),'cover')])
    case_photos=[x for x in exact_case if x['kind'] in ['s','e','p']]
    if len(case_photos)<2:case_photos=exact_case
    if len(case_photos)<2:raise ValueError('case needs two attributable images '+case['cust'])
    offers=' · '.join(case.get('offer',[])[:3]) or case['sub']
    slide('L_PH_VX_PROOF','관련 사례 · '+case['cust'],{
        0:'06 · 관련 사례',1:case['cust'],2:('다른 업종의 유사 운영 참고 · ' if case.get('ind')!=brief['ind'] else '')+case['sub']+' · 등록된 삼성 공식 도입사례',3:'실제 적용 공간',
        4:' · '.join(case.get('space',[])[:3]) or case.get('type','공식 도입 현장'),5:'공식 사례의 적용 내용',6:offers,
        7:'이번 고객에게 검토할 점',8:v['promise']+' — '+v['condition'],9:'두 사진: '+case['cust']+' 공식 도입 현장',
        10:'사례의 적용 내용은 참고 근거이며 이번 고객의 성과·호환·납기를 보장하지 않습니다.',11:'가상 고객',12:'사례 원문: '+case['url'],13:'10'},
        [(case_photos[0],'cover'),(case_photos[1],'cover')],14)
    t={0:'07 · 검증 기준',1:'목표 수치보다 먼저 측정 방법을 맞춥니다',2:'기준선 수집 → 같은 조건으로 비교 → 운영자가 개선 여부 판단',19:'가상 고객',20:foot+' · 성과 수치 미확정',21:'11'}
    for j in range(4):
        base=3+j*4
        t.update({base:f'{j+1:02d}',base+1:measures[j] if j<3 else '적용 조건',base+2:'기준선과 시범 운영 기간을 같은 방식으로 기록' if j<3 else v['condition'],base+3:'판정 · 고객과 합의' if j<3 else '지원 범위 확인 후 확산'})
    if index%2:
      t2={0:'검증할 공간 · '+spaces[0],1:v['promise'],2:'07 · 검증 기준',3:'지표와 담당자를 함께 정합니다',4:'목표 수치·기준선은 현장 실사 후 합의',17:'가상 고객',18:foot,19:'11'}
      for j in range(3):
        base=5+j*4;t2.update({base:f'{j+1:02d}',base+1:measures[j],base+2:'기준선과 시범 운영 기록을 동일한 조건으로 비교',base+3:'고객·공급 담당자 공동 검토'})
      slide('L_PH_OV_H','실측 기준과 공동 판정 방법',t2,[(scene(15,spaces[0]),'cover')])
    else:
      slide('L_PH_VP_B4','측정 지표와 현장 검증 조건',t,[(scene(15+i,spaces[i]),'cover') for i in range(4)])
    slide('L_PH_PL_A','파일럿과 단계 확산 계획',{
        0:'08 · 실행 계획',1:'작은 범위에서 확인한 뒤 다음 범위로 갑니다',2:'일정 가정 · 기준선과 전환 조건은 착수 워크숍에서 확정',
        3:'STEP 1 · 실사·기준선',4:'착수 1주 · '+v['pilot'],5:'다음 단계 판단 기준',6:'전원·네트워크·설치·연동 확인',7:'측정 방법과 담당자 합의',
        8:'STEP 2 · 시범 운영',9:'착수 2~3주 · 대표 공간 적용',10:'다음 단계 판단 기준',11:measures[0]+' 비교',12:'불편·오류·예외 대응 기록',
        13:'STEP 3 · 확산 검토',14:'착수 4주 · 결과 공동 검토',15:'다음 단계 판단 기준',16:measures[2]+' 확인',17:'운영 인수·교육·복구 시험 완료',
        18:'기준선 → 시범 운영 → 확산 판단',19:'가상 고객',20:foot+' · 일정은 제안 가정',21:'12'},[(scene(19+i,spaces[i]),'cover') for i in range(3)])
    slide('L_PH_CH_B','예외와 전환 조건',{
        0:'08 · 실행 조건',1:'확대 전에 예외 대응부터 확인합니다',2:'안정적인 운영을 위한 검토 항목 · 확정 서비스 조건이 아님',3:'확인할 위험',4:'전환 조건',
        5:'기기·솔루션 호환 미확인',6:v['condition'],7:'네트워크·권한·라이선스 미확정',8:'설치 수량과 현장 작업 시간 미확정',
        9:'작은 범위에서 검증 후 확대',10:'현장 실사와 지원 모델 대조',11:'오류 발생 시 복구 절차 확인',12:'운영 담당자 교육·인수 완료',
        13:'가상 고객',14:foot,15:'13'},[(scene(22,spaces[0]),'cover'),(scene(23,spaces[3]),'cover')])
    ask=v['pilot']+'의 현장 실사와 시범 운영 범위 합의'
    slide('L_PH_C13','결정 요청과 다음 행동',{
        0:'공간 참고사진 · 가상 고객 제안',1:v['promise'],2:'09 · 결정 요청',3:'오늘은 첫 검증 범위를 정합니다',4:ask,
        5:'01',6:'대상 공간·담당자 선정',7:v['pilot'],8:'착수 1주',9:'고객 운영·시설 담당',10:'02',11:'현장 실사·연동 조건 확인',
        12:v['condition'],13:'착수 1주',14:'고객 IT·구축 담당',15:'03',16:'시범 운영 결과와 확산 판단',17:measures[0]+' · '+measures[2],
        18:'착수 4주 · 가정',19:'공동 검토',20:'협의 창구',21:'고객 실무 담당자와 공급·구축 담당자 지정',22:'가상 고객',23:foot,24:'14'},[(scene(24,spaces[0]),'cover')])
    groups=[('open','표지',0,1,'cover'),('problem','고객 요구와 제안 방향',1,3,'challenge'),
            ('space','공간 경험과 제품',3,6,'scenario'),('build','솔루션과 운영',6,9,'solution'),
            ('proof','관련 사례와 검증',9,11,'case'),('plan','실행과 전환 조건',11,13,'execution'),('close','결정 요청',13,14,'closing')]
    flow=[dict(key=k,name=n,goal=roles[a],slides=[dict(f=fills[j]['f'],role=roles[j]) for j in range(a,b)]) for k,n,a,b,p in groups]
    scenario=dict(id=sid,req='ops' if variant else 'new',ind=brief['ind'],strategy='pain' if variant else 'space',ending='workshop',minutes=20,
        title=customer+' — '+v['title'],short=v['scope']+' · '+v['promise'],
        situation='가상 고객 사례. '+customer+'가 '+v['scope']+'을 검토한다. '+' '.join(pains)+' '+v['condition']+'.',
        signals=['“'+p+'”' for p in pains],audience=v['audience'],
        criteria=measures+[v['condition']],thesis=v['promise'],logic=[g['name'] for g in flow],
        diff=[S[solutions[0]]['name']+'의 적용 범위를 공간과 연결', '제품과 설치 조건을 함께 검토', '기준선·예외 대응·운영 인수를 확산 조건으로 설정'],
        tone='가상 고객 조건을 명시하고 실제 제품·솔루션·사례로 근거 제시',messages=[v['promise'],v['condition'],'먼저 작은 범위에서 검증합니다'],flow=flow,
        ask=ask,next=['현장 담당자·일정 합의','설치·네트워크·연동 범위 확인','기준선 측정 후 성공 기준 확정'],
        prep=['현장 도면·운영 시간','기존 기기·제어기·네트워크 현황','사용자 동선과 운영 담당자','측정할 로그와 개인정보 처리 범위'],
        products=products,solutions=solutions,cases=cases,kpis=measures,
        objections=[['효과를 바로 보장할 수 있나요?','이 제안은 가상 사례이며 기준선을 측정한 뒤 같은 조건에서 검증합니다.'],
                    ['기존 시스템과 연동되나요?',v['condition']+' 후 지원 모델·API·계약 범위를 확인합니다.'],
                    ['도입 후 누가 운영하나요?','담당자·권한·교육·복구 절차를 운영 인수 조건으로 정합니다.']],
        fit=v['scope']+'을 검토하며 '+('운영 기준부터 정리하려는 고객' if variant else '사용자 경험을 먼저 설계하려는 고객'),
        avoid='실사 없이 확정 견적·효과 보장을 요구하는 경우',sourceSpec=brief['key'],fictional=True,
        assumptions=['고객·문제·범위·일정은 가상 제안 조건','성과 수치와 견적은 확정하지 않음','사진은 기존 공식 도입 현장 참고자료'])
    story=dict(keymen=[[v['audience']['lead'],40,[v['promise'],measures[0]]],[v['audience']['others'][0],35,[pains[2],measures[2]]],[v['audience']['others'][1],25,[v['condition'],measures[1]]]],
               note=scenario['situation']+' 기준 수집 및 일정은 가정이며 사진은 실제 고객 현장을 뜻하지 않습니다.',
               parts={n:dict(type=p,items=[roles[j] for j in range(a,b)]) for k,n,a,b,p in groups})
    return scenario,fills,story,customer


def main():
    data=dict(scenarios=[],fills={},story={},customers={},sources=[])
    SOURCE.mkdir(parents=True,exist_ok=True)
    for index,brief in enumerate(BRIEFS):
        src=parse_source(ROOT/'poc/vertical_examples'/(brief['key']+'.md'))
        (SOURCE/(brief['key']+'.json')).write_text(json.dumps(src,ensure_ascii=False,indent=2)+'\n')
        data['sources'].append(dict(key=brief['key'],name=brief['name'],source=src['source'],sha256=src['sha256'],slides=src['slide_count']))
        for variant in range(2):
            s,f,st,customer=make_deck(brief,variant,index)
            data['scenarios'].append(s);data['fills'][s['id']]=f;data['story'][s['id']]=st;data['customers'][s['id']]=customer
        print(brief['key']+': '+str(src['slide_count'])+' source pages → 2 customer scenarios / 28 slides')
    dest=TEMPLATES/'vertical_scenarios.json'
    dest.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f'{len(data["scenarios"])} scenarios / {sum(map(len,data["fills"].values()))} slides → {dest.relative_to(ROOT)}')


if __name__=='__main__':main()
