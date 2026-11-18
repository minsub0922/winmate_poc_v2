# 당사의 이해 · 외식 · 카페 — 매장망 → 주문 흐름 → 본사 · 가맹 운영 구조 → 메뉴 · 행사 주기
from kit import *
import compete

CLUSTER = dict(id='FB', name='외식 · 카페', cust='외식 프랜차이즈', ai='AI 퀵서비스', verticals=['fb_qsr', 'fb_cafe', 'fb_rest'],
               goal='매장망과 직영 · 가맹 구성, 주문이 몰리는 시간과 들어오는 길, 본사 · 가맹 운영 구조, 메뉴 · 행사가 바뀌는 주기를 먼저 짚는다')


def stores():
    s = sheet('L_TOC_UA_FB_STORES', '매장망', '외식 프랜차이즈, 매장망과 운영 형태부터 짚습니다')
    s.pic(64, 128, 400, 520, 'img/media/g0.json#690', '고객 매장 대표 사진', r=18, name='ph')
    s.box(488, 128, 728, 172, bg=SURF, r=18)
    cap(s, 512, 150, '전국 매장', 'tl', INK2, 200)
    numu(s, 512, 196, 220, Z, '개', 56, 20, name='tv')
    small(s, 760, 152, '직영', BLUE, 120, name='al')
    numu(s, 760, 178, 200, Z, '개', 32, 16, name='av')
    small(s, 992, 152, '가맹', GRAY, 200, 'right', name='bl')
    numu(s, 992, 178, 200, Z, '개', 32, 16, color=INK2, name='bv', align='right')
    segbar(s, 760, 240, 432, 24, [0.3, 0.7], [C1, SOFT], r=12)
    for i, (lb, ic) in enumerate([('로드숍', 'store'), ('몰 · 푸드코트', 'cart'), ('드라이브스루', 'route'), ('배달 전문', 'box')]):
        x = 488 + i * 186
        s.box(x, 316, 170, 332, bg=WHITE, r=18, border=f'1px solid {LINE}')
        s.ico(x + 24, 340, ic, size=56, r=16)
        s.t(x + 24, 420, 122, lb, 20, 800, INK, 1.3, name=f'k{i}', clamp=2)
        small(s, x + 24, 548, '매장 수', MUTE, 120)
        numu(s, x + 24, 576, 122, Z, '개', 40, 18, name=f'kv{i}')
    return done(s, CLUSTER, 3, '매장망', '사진 + 직영 · 가맹 띠 + 매장 유형 4', '매장 수와 직영 · 가맹 비중, 매장 유형별 수를 한 장으로 짚을 때')


def peak():
    s = sheet('L_TOC_UA_FB_PEAK', '주문 흐름', '주문이 몰리는 시간과 들어오는 길을 먼저 봅니다')
    s.box(64, 128, 720, 520, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 152, '시간대별 주문 수', 'ct')
    hs = [0.18, 0.3, 0.42, 0.5, 0.72, 1.0, 0.86, 0.5, 0.4, 0.46, 0.62, 0.9, 0.95, 0.7, 0.48, 0.3]  # 7시 – 22시
    base, mh = 572, 280
    for k, hh in enumerate(hs):
        x = 104 + k * 40; h = mh * hh
        s.box(x, base - h, 28, h, bg=C1 if k in (5, 6, 11, 12) else SOFT, extra='border-radius: 6px 6px 0 0')
        s.t(x - 6, base + 10, 40, str(7 + k), 14, 700, GRAY, 1.2, align='center', extra=NUM)
    s.hline(92, base, 664, color=DASH)
    s.chip(250, 232, f'점심 피크 · {Z}–{Z}시', name='p0', bg=BLUE, color=WHITE, size=14, h=32, pad=14)
    s.chip(500, 250, f'저녁 피크 · {Z}–{Z}시', name='p1', bg=BLUE, color=WHITE, size=14, h=32, pad=14)
    s.box(808, 128, 408, 520, bg=SURF, r=18)
    cap(s, 836, 152, '주문이 들어오는 길', 'cl')
    for i, (lb, fr) in enumerate([('카운터 대면', 0.5), ('키오스크', 0.8), ('테이블 오더', 0.35), ('배달 앱', 0.6), ('포장 · 드라이브스루', 0.25)]):
        y = 206 + i * 86
        s.t(836, y, 240, lb, 18, 700, INK, 1.3, name=f'c{i}', nowrap=True)
        s.t(1088, y - 4, 100, Z + '%', 24, 800, BLUE, 1.2, name=f'cv{i}', align='right', extra=NUM)
        hbar(s, 836, y + 38, 352, fr, 12)
    return done(s, CLUSTER, 4, '주문 흐름', '시간대 막대 16 + 주문 채널 막대 5', '하루 중 주문이 몰리는 시간과 주문 채널 비중을 함께 볼 때')


def hq():
    s = sheet('L_TOC_UA_FB_HQ', '운영 구조', '누가 정하고, 누가 비용을 내고, 누가 운영하는지')
    s.box(64, 128, 288, 148, bg=TINT, r=18)
    s.t(88, 148, 240, '새 설비를 들일 때<br>누가 맡습니까', 24, 800, BLUE, 1.3, name='q')
    small(s, 88, 236, '● 주관   ◐ 협의   ○ 관여 없음', GRAY, 250, name='lg')
    for c, (nm, ic, ln) in enumerate([('본사', 'building', '메뉴 · 가격 · 행사를 정함'), ('지역 담당', 'users', '매장을 돌며 점검 · 교육'), ('매장 · 점주', 'store', '매일 열고 손님을 맞음')]):
        x = 376 + c * 288
        s.box(x, 128, 264, 148, bg=BLUE, r=18)
        s.ico(x + 20, 148, ic, size=48, r=14, bg=GLASS, color=WHITE)
        s.t(x + 80, 156, 170, nm, 24, 800, WHITE, 1.3, name=f'r{c}', nowrap=True)
        s.t(x + 20, 222, 228, ln, 16, 600, W88, 1.4, name=f'rl{c}', nowrap=True)
    for r, (lb, ic, mk) in enumerate([('도입 결정', 'check', '●◐○'), ('비용 부담', 'coin', '◐○●'), ('메뉴 · 화면 운영', 'image', '●○◐'), ('고장 접수 · 수리', 'wrench', '○◐●')]):
        y = 292 + r * 92
        s.box(64, y, 1152, 80, bg=SURF, r=16)
        s.ico(84, y + 16, ic, size=48, r=14, bg=WHITE)
        s.t(148, y + 27, 200, lb, 20, 800, INK, 1.3, name=f'w{r}', nowrap=True)
        for c in range(3):
            s.t(376 + c * 288, y + 24, 264, mk[c], 24, 800, BLUE, 1.3, name=f'm{r}_{c}', align='center')
    return done(s, CLUSTER, 5, '운영 구조', '역할 3 × 맡는 일 4 표', '본사 · 지역 담당 · 점주 가운데 누가 정하고 비용을 내고 운영하는지 짚을 때')


def cycle():
    s = sheet('L_TOC_UA_FB_CYCLE', '메뉴 · 행사 주기', '메뉴와 행사가 얼마나 자주, 어떻게 바뀌는지')
    s.box(64, 128, 1152, 252, bg=WHITE, r=18, border=f'1px solid {LINE}')
    X0, PW = 216, 81
    months(s, X0, 150, PW, 36, gap=6)
    s.t(88, 211, 120, '시즌 메뉴', 18, 800, INK, 1.3, name='l0', nowrap=True)
    for i, (a, b, lb, col) in enumerate([(1, 2, '겨울', C2), (3, 5, '봄 시즌', C1), (6, 8, '여름 시즌', C2), (9, 11, '가을 시즌', C1), (12, 12, '겨울', C2)]):
        x = X0 + (a - 1) * PW; w = (b - a + 1) * PW - 6
        s.box(x, 200, w, 46, bg=col, r=12)
        s.t(x, 212, w, lb, 16, 800, WHITE, 1.3, name=f's{i}', align='center', nowrap=True)
    s.t(88, 271, 120, '행사', 18, 800, INK, 1.3, name='l1', nowrap=True)
    for i, (m, lb) in enumerate([(1, '신년'), (3, '신학기'), (5, '가정의 달'), (7, '여름 한정'), (9, '명절'), (12, '연말')]):
        x = X0 + (m - 1) * PW
        s.box(x, 260, PW - 6, 46, bg=TINT, r=12)
        s.t(x, 273, PW - 6, lb, 14, 800, BLUE, 1.3, name=f'e{i}', align='center', nowrap=True)
    s.t(88, 328, 120, '메뉴판 교체', 18, 800, INK, 1.3, name='l2', nowrap=True)
    for m in (3, 6, 9, 12):
        x = X0 + (m - 1) * PW
        s.box(x, 322, PW - 6, 36, bg=WHITE, r=18, border=f'1.5px solid {BLUE}')
        s.t(x, 330, PW - 6, '교체', 14, 800, BLUE, 1.3, align='center')
    s.box(64, 396, 736, 252, bg=SURF, r=18)
    cap(s, 88, 418, '지금 메뉴판을 바꾸는 절차', 'pt')
    for i, (lb, ic) in enumerate([('디자인', 'image'), ('인쇄', 'doc'), ('배송', 'truck'), ('매장 교체', 'store')]):
        x = 88 + i * 176
        s.box(x, 464, 156, 72, bg=WHITE, r=14)
        s.ico(x + 12, 476, ic, size=48, r=12)
        s.t(x + 70, 489, 82, lb, 16, 800, INK, 1.3, name=f'st{i}', nowrap=True)
        if i < 3: s.arrow(x + 157, 491, 18, DASH)
    s.t(88, 584, 260, '한 번 바꾸는 데 걸리는 시간', 16, 700, GRAY, 1.3, name='dl', nowrap=True)
    numu(s, 340, 568, 200, Z, '일', 40, 18, name='dv')
    for i, (lb, un) in enumerate([('신메뉴 출시', '회 / 년'), ('가격 조정', '회 / 년'), ('행사', '회 / 월')]):
        y = 396 + i * 90
        s.box(816, y, 400, 72, bg=TINT, r=16)
        s.t(840, y + 24, 180, lb, 18, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        numu(s, 1016, y + 20, 180, Z, un, 32, 16, name=f'nv{i}', align='right')
    return done(s, CLUSTER, 6, '메뉴 · 행사 주기', '연간 일정 3줄 + 교체 절차 4 + 횟수 3', '시즌 메뉴 · 행사 일정과 메뉴판을 바꾸는 절차 · 횟수를 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'fb_qsr',
           'title': '메뉴판 · 공조 · 주문 단말까지, 매장 전체를 한 공급사에서',
           'areas': [('쇼윈도 · 외부', 'p', '윈도 사이니지'), ('주문 카운터', 'p', '비디오월'), ('객석', 'p', '비즈니스 TV'), ('매장 냉난방', 'p', '무풍 4Way'), ('점주 · 본사', 'p', '갤럭시 탭')],
           'platform': ['SmartThings Pro', 'VXT CMS', 'Knox'],
           'a': [(1, '사이니지'), (1, '메뉴보드'), (1, 'TV'), (0, '공조 미지원'), (0, '기기별 앱 따로')],
           'b': [(0, '소형 화면만'), (1, '자사 POS 연동'), (0, '미지원'), (0, '공조 미지원'), (1, '매장 단위 관리')]},
 'edge': {'vid': 'fb_qsr', 'msgs': [('제품 사용 시간', '문을 열 때부터 닫을 때까지 켜 두는 메뉴보드'), ('밝기', '밝은 매장 조명 아래서도 또렷한 메뉴'), ('해상도', '작은 가격 글씨까지 선명한 4K')]},
 'proof': {'title': '외식 매장에서 먼저 검증했습니다', 'cases': ['맥도날드 고양삼송DT점', '스타벅스 의왕청계DT점', '밀키프레소']}}

SHEETS = [stores, peak, hq, cycle, *compete.sheets(CLUSTER, COMPETE)]
