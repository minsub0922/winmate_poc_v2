# 당사의 이해 · 주거 — 단지 · 평형 → 사업 일정 → 의사결정 구조 → 세대 · 커뮤니티
from kit import *
import compete

CLUSTER = dict(id='RS', name='주거', cust='아파트', ai='AI 아파트', verticals=['rs_apt', 'rs_officetel', 'rs_senior', 'id_partner'],
               goal='단지 규모와 평형 구성, 사업 일정과 제품이 정해지는 때, 고르고 사고 쓰는 사람의 구조, 세대 · 커뮤니티 구성을 먼저 짚는다')


def units():
    s = sheet('L_TOC_UA_RS_UNITS', '단지 · 평형', '몇 세대, 어떤 평형으로 지어지는지')
    s.pic(64, 128, 400, 520, 'img/media/g1.json#356', '단지 · 견본 주택 사진', r=18, name='ph')
    for i, (lb, un, ic) in enumerate([('세대 수', '세대', 'home'), ('동 수', '개 동', 'building'), ('가장 높은 층', '층', 'layers')]):
        x = 488 + i * 248
        s.box(x, 128, 232, 200, bg=SURF, r=18)
        s.ico(x + 24, 150, ic, size=48, r=14, bg=WHITE)
        s.t(x + 84, 162, 136, lb, 18, 800, INK2, 1.3, name=f't{i}', nowrap=True)
        numu(s, x + 24, 244, 184, Z, un, 56, 20, name=f'v{i}')
    s.box(488, 344, 728, 304, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 516, 366, '평형 구성', 'pt')
    for i, (lb, fr) in enumerate([('59㎡', 0.3), ('74㎡', 0.45), ('84㎡', 0.9), ('101㎡ 이상', 0.25)]):
        y = 416 + i * 56
        s.t(516, y, 150, lb, 20, 800, INK, 1.3, name=f'p{i}', nowrap=True, extra=NUM)
        hbar(s, 676, y + 6, 380, fr, 16, track=SURF)
        s.t(1068, y, 124, Z + '세대', 20, 800, BLUE, 1.3, name=f'pv{i}', align='right', extra=NUM)
    return done(s, CLUSTER, 3, '단지 · 평형', '사진 + 숫자 3 + 평형 막대 4', '세대 수 · 동 수 · 층수와 평형별 세대 수를 짚을 때')


def phase():
    s = sheet('L_TOC_UA_RS_PHASE', '사업 일정', '분양부터 입주까지, 제품이 정해지는 때')
    gates = {1: '옵션 품목 확정', 2: '제품 사양 확정 · 발주', 3: '납품 · 설치', 5: '입주 서비스 · 수리'}
    s.hline(160, 235, 960, color=SOFT, t=4)
    for i, nm in enumerate(['인허가', '분양 · 견본 주택', '착공 · 골조', '마감 · 설치', '준공', '입주']):
        cx = 160 + i * 192; on = i in gates
        s.t(cx - 90, 150, 180, nm, 20, 800, INK, 1.3, name=f'n{i}', align='center', nowrap=True)
        s.raw(f'<div style="position: absolute; left: {cx - 14}px; top: 223px; width: 28px; height: 28px; border-radius: 50%; box-sizing: border-box; '
              f'background: {BLUE if on else WHITE}; border: 4px solid {BLUE if on else SOFT}"></div>')
        s.t(cx - 90, 264, 180, f'{Z}.{Z}', 18, 800, GRAY, 1.3, name=f'd{i}', align='center', extra=NUM)
        if on:
            s.raw(f'<div style="position: absolute; left: {cx - 1}px; top: 296px; width: 0; height: 26px; border-left: 2px dashed {BLUE}"></div>')
            s.box(cx - 90, 322, 180, 124, bg=TINT, r=14)
            small(s, cx - 74, 338, '이때 정해집니다', BLUE, 150)
            s.t(cx - 74, 366, 148, gates[i], 18, 800, INK, 1.4, name=f'g{i}', clamp=2)
    s.box(64, 470, 1152, 178, bg=BLUE, r=18)
    s.t(96, 498, 400, '지금 이 단지는', 18, 700, W88, 1.3, name='nl', nowrap=True)
    s.t(96, 534, 480, '착공 · 골조 단계', 32, 800, WHITE, 1.25, name='now', nowrap=True)
    for k, lb in enumerate(['제품을 정하기까지', '입주까지']):
        x = 640 + k * 288
        s.vline(x - 32, 498, 122, color='rgba(255,255,255,0.25)')
        s.t(x, 498, 240, lb, 16, 700, W88, 1.3, name=f'r{k}l', nowrap=True)
        numu(s, x, 534, 240, Z, '개월', 48, 20, color=WHITE, ucolor=W88, name=f'r{k}')
    return done(s, CLUSTER, 4, '사업 일정', '사업 단계 6 + 정해지는 때 4 + 지금 단계', '인허가부터 입주까지 단계와 날짜, 제품 · 옵션이 정해지는 때를 짚을 때')


def who():
    s = sheet('L_TOC_UA_RS_WHO', '의사결정 구조', '누가 정하고, 누가 사고, 누가 쓰는지')
    roles = [('시행사 · 조합', 'flag', '사업을 정합니다', '분양가 · 상품성', '●●●●○', '개발 사업 담당'), ('시공사', 'building', '사양을 정하고 삽니다', '원가 · 납기 · 하자', '●●●●●', '구매 · 상품 설계 담당'),
             ('설계 · 인테리어사', 'sign', '도면에 반영합니다', '규격 · 설치 조건', '●●●○○', '설계 담당'), ('입주 예정자', 'home', '옵션을 고르고 씁니다', '생활 편의 · 디자인', '●●○○○', '계약자 · 입주자 대표')]
    s.box(64, 460, 1152, 188, bg=SURF, r=18)
    cap(s, 88, 480, '제품 선정에 미치는 힘', 'pt')
    for c, (nm, ic, verb, sees, dots, person) in enumerate(roles):
        x = 64 + c * 296
        s.box(x, 128, 264, 316, bg=WHITE, r=18, border=f'1px solid {LINE}')
        s.box(x, 128, 264, 92, bg=BLUE, extra='border-radius: 18px 18px 0 0')
        s.ico(x + 20, 150, ic, size=48, r=14, bg=GLASS, color=WHITE)
        s.t(x + 80, 161, 174, nm, 20, 800, WHITE, 1.3, name=f'r{c}', nowrap=True)
        s.t(x + 24, 244, 216, verb, 24, 800, BLUE, 1.35, name=f'v{c}', clamp=2)
        small(s, x + 24, 340, '무엇을 봅니까', MUTE, 200)
        s.t(x + 24, 366, 216, sees, 18, 700, INK2, 1.4, name=f's{c}', clamp=2)
        if c < 3: rarrow(s, x + 280, 174)
        s.t(x + 24, 526, 230, dots, 24, 800, BLUE, 1.3, name=f'd{c}', nowrap=True, extra='letter-spacing: 0.14em')
        small(s, x + 24, 578, '만나야 할 사람', MUTE, 200)
        s.t(x + 24, 602, 230, person, 16, 800, INK, 1.3, name=f'w{c}', nowrap=True)
    return done(s, CLUSTER, 5, '의사결정 구조', '관계자 4 × 하는 일 · 보는 것 · 미치는 힘', '시행사 · 시공사 · 설계사 · 입주 예정자가 제품 선정에서 맡는 일과 미치는 힘을 짚을 때')


def home():
    s = sheet('L_TOC_UA_RS_HOME', '세대 · 커뮤니티', '세대 안과 커뮤니티, 어디까지 기본이고 어디부터 옵션인지')
    s.box(64, 128, 564, 520, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 150, '세대 안', 'ht', w=200)
    small(s, 412, 154, '기본 제공', MUTE, 90, 'center', name='c0')
    small(s, 508, 154, '유상 옵션', MUTE, 90, 'center', name='c1')
    for r, (nm, ic, a, b) in enumerate([('거실', 'monitor', '●', '○'), ('주방', 'fork', '●', '●'), ('침실 · 드레스룸', 'bed', '○', '●'), ('현관 · 복도', 'door', '●', '○'), ('발코니 · 다용도실', 'wind', '○', '●')]):
        y = 190 + r * 88
        s.box(84, y, 524, 76, bg=SURF, r=14)
        s.ico(100, y + 14, ic, size=48, r=12, bg=WHITE)
        s.t(164, y + 25, 240, nm, 20, 800, INK, 1.3, name=f'n{r}', nowrap=True)
        s.t(412, y + 22, 90, a, 24, 800, BLUE, 1.3, name=f'a{r}', align='center')
        s.t(508, y + 22, 90, b, 24, 800, BLUE, 1.3, name=f'b{r}', align='center')
    s.box(652, 128, 564, 520, bg=SURF, r=18)
    cap(s, 676, 150, '커뮤니티 시설', 'ct')
    for i, (lb, ic) in enumerate([('피트니스', 'dumbbell'), ('라운지 · 카페', 'cup'), ('독서실', 'book'), ('키즈룸', 'heart'), ('게스트 하우스', 'bed'), ('회의 · 공유 오피스', 'users')]):
        x = 676 + (i % 3) * 174; y = 192 + (i // 3) * 218
        s.box(x, y, 164, 206, bg=WHITE, r=14)
        s.ico(x + 16, y + 16, ic, size=44, r=12)
        s.t(x + 16, y + 72, 132, lb, 18, 800, INK, 1.35, name=f'k{i}', clamp=2)
        numu(s, x + 16, y + 152, 132, Z, '곳', 32, 16, name=f'kv{i}')
    return done(s, CLUSTER, 6, '세대 · 커뮤니티', '세대 공간 5 × 기본 · 옵션 + 커뮤니티 시설 6', '세대 안 공간별 기본 제공 · 유상 옵션과 커뮤니티 시설 수를 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'rs_apt',
           'title': '빌트인 가전 · 스마트홈 · 공용부까지, 단지 전체를 한 공급사에서',
           'areas': [('세대 냉난방', 'p', '무풍 시스템에어컨'), ('빌트인 주방', 'p', '빌트인 냉장고'), ('의류 · 공기 관리', 'p', '에어드레서'), ('세대 통합 제어', 's', 'SmartThings Home'), ('커뮤니티 · 공용부', 'p', 'The Frame')],
           'platform': ['SmartThings Pro', 'DMS 2.5', 'VXT CMS'],
           'a': [(1, '동급 에어컨'), (1, '동급 라인업'), (1, '가전'), (0, '가전만 연결'), (0, '미지원')],
           'b': [(0, '미지원'), (0, '미지원'), (0, '미지원'), (1, '월패드 위주'), (1, '관리 강점')]},
 'edge': {'vid': 'rs_apt', 'msgs': [('정격 냉방', '방 하나에 꼭 맞춘 냉방 능력'), ('냉방 소비 전력', '세대 관리비를 낮추는 실내기 소비 전력'), ('제품 중량', '천장에 올리기 쉬운 가벼운 실내기')]},
 'proof': {'title': '주거 단지에서 먼저 검증했습니다', 'cases': ['그란츠 리버파크', '에피소드 용산 241', '래미안 용산']}}

SHEETS = [units, phase, who, home, *compete.sheets(CLUSTER, COMPETE)]
