# 당사의 이해 · 호텔 · 숙박 — 객실 · 부대시설 → 투숙객 · 성수기 → 투숙 여정 → 브랜드 표준 · 시스템
from kit import *
import compete

CLUSTER = dict(id='HT', name='호텔 · 숙박', cust='비즈니스 호텔', ai='AI 비즈니스 호텔', verticals=['ht_large', 'ht_mid', 'ht_stay'],
               goal='객실과 부대시설 규모, 투숙객 구성과 성수기, 예약부터 체크아웃까지의 접점, 브랜드 표준과 이어야 할 시스템을 먼저 짚는다')


def rooms():
    s = sheet('L_TOC_UA_HT_ROOMS', '객실 · 부대시설', '객실은 몇 실, 어떤 타입으로, 무엇과 함께 운영되는지')
    s.pic(64, 128, 400, 520, 'img/media/g0.json#935', '고객 호텔 객실 사진', r=18, name='ph')
    s.box(488, 128, 232, 248, bg=BLUE, r=18)
    s.t(512, 152, 184, '전체 객실', 18, 700, W88, 1.3, name='tl', nowrap=True)
    numu(s, 512, 190, 184, Z, '실', 56, 20, color=WHITE, ucolor=W88, name='tv')
    s.hline(512, 276, 184, color='rgba(255,255,255,0.25)')
    s.t(512, 294, 184, '호텔 등급', 16, 700, W88, 1.3, name='gl', nowrap=True)
    numu(s, 512, 322, 184, Z, '성급', 32, 16, color=WHITE, ucolor=W88, name='gv')
    s.box(736, 128, 480, 248, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 760, 148, '객실 타입', 'rt')
    for i, (lb, fr) in enumerate([('스탠다드', 0.9), ('디럭스', 0.6), ('스위트', 0.25), ('레지던스형', 0.4)]):
        y = 196 + i * 44
        s.t(760, y, 120, lb, 16, 700, INK2, 1.3, name=f't{i}', nowrap=True)
        hbar(s, 884, y + 5, 216, fr, 12, track=SURF)
        s.t(1108, y - 3, 84, Z + '실', 18, 800, BLUE, 1.3, name=f'tv{i}', align='right', extra=NUM)
    cap(s, 488, 394, '부대시설', 'fl')
    for i, (lb, ic) in enumerate([('연회장 · 회의실', 'users'), ('레스토랑 · 바', 'fork'), ('피트니스 · 스파', 'dumbbell'), ('수영장 · 사우나', 'drop'), ('라운지', 'cup')]):
        x = 488 + i * 148
        s.box(x, 432, 136, 216, bg=SURF, r=16)
        s.ico(x + 18, 450, ic, size=48, r=14, bg=WHITE)
        s.t(x + 18, 512, 104, lb, 16, 800, INK, 1.35, name=f'f{i}', clamp=2)
        numu(s, x + 18, 590, 104, Z, '곳', 32, 16, name=f'fv{i}')
    return done(s, CLUSTER, 3, '객실 · 부대시설', '사진 + 객실 수 · 등급 + 객실 타입 막대 4 + 부대시설 5', '객실 수 · 등급 · 객실 타입 구성과 부대시설 수를 한 장으로 짚을 때')


def guest():
    s = sheet('L_TOC_UA_HT_GUEST', '투숙객 · 성수기', '누가 묵고, 언제 가득 차는지')
    cols = [C1, C2, C3, C4]
    s.box(64, 128, 520, 520, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 152, '투숙 목적', 'dt')
    donut(s, 324, 404, 170, 60, [0.42, 0.3, 0.18, 0.1], cols)
    s.t(224, 376, 200, '올해 기준', 16, 700, GRAY, 1.3, name='dc', align='center')
    s.t(224, 402, 200, Z + '년', 24, 800, BLUE, 1.3, name='dy', align='center', extra=NUM)
    s.box(608, 128, 608, 244, bg=SURF, r=18)
    for i, lb in enumerate(['비즈니스 출장', '레저 · 가족', '단체 · 행사', '장기 투숙']):
        y = 152 + i * 53
        s.box(632, y + 3, 20, 20, bg=cols[i], r=6)
        s.t(666, y, 300, lb, 18, 800, INK, 1.3, name=f'g{i}', nowrap=True)
        s.t(1072, y - 4, 120, Z + '%', 24, 800, BLUE, 1.2, name=f'gv{i}', align='right', extra=NUM)
    s.box(608, 388, 608, 260, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 632, 408, '월별 객실 점유율', 'mt')
    s.chip(1036, 402, f'성수기 {Z}–{Z}월', name='pk', bg=BLUE, color=WHITE, size=14, h=32, pad=14)
    for k, hh in enumerate([0.5, 0.45, 0.6, 0.7, 0.85, 0.75, 0.95, 1.0, 0.7, 0.8, 0.6, 0.75]):
        x = 640 + k * 46; h = 118 * hh
        s.box(x, 600 - h, 30, h, bg=C1 if k in (6, 7) else SOFT, extra='border-radius: 6px 6px 0 0')
        s.t(x - 8, 608, 46, str(k + 1), 14, 700, GRAY, 1.2, align='center', extra=NUM)
    s.hline(632, 600, 560, color=DASH)
    return done(s, CLUSTER, 4, '투숙객 · 성수기', '투숙 목적 도넛 4 + 월별 점유율 막대 12', '투숙객 구성과 달마다 객실이 차는 정도 · 성수기를 짚을 때')


def touch():
    s = sheet('L_TOC_UA_HT_TOUCH', '투숙 여정', '예약부터 체크아웃까지, 손님이 만나는 접점')
    s.hline(168, 149, 944, color=SOFT, t=2)
    steps = [('예약', '전화 · 예약 사이트 · 홈페이지로 나뉘어 들어옵니다', '예약 채널', '개'), ('체크인', '프런트에서 확인하고 카드 키를 드립니다', '프런트 창구', '곳'),
             ('객실', '리모컨과 종이 안내문으로 안내합니다', '객실 TV', '대'), ('부대시설', '엘리베이터 게시물과 전화로 안내합니다', '시설 안내 화면', '대'), ('체크아웃', '프런트에 줄을 서서 정산합니다', '정산 창구', '곳')]
    for i, (nm, now, cl, un) in enumerate(steps):
        x = 64 + i * 236
        s.num2(x + 86, 132, i + 1, 36, 16)
        s.t(x, 180, 208, nm, 24, 800, INK, 1.3, name=f'n{i}', align='center', nowrap=True)
        s.box(x, 232, 208, 196, bg=SURF, r=16)
        small(s, x + 20, 252, '지금의 방식', MUTE, 168)
        s.t(x + 20, 282, 168, now, 18, 700, INK2, 1.5, name=f'w{i}', clamp=5)
        s.box(x, 444, 208, 204, bg=TINT, r=16)
        s.t(x + 20, 466, 168, cl, 18, 800, BLUE, 1.3, name=f'c{i}', nowrap=True)
        numu(s, x + 20, 548, 168, Z, un, 56, 20, name=f'v{i}')
    return done(s, CLUSTER, 5, '투숙 여정', '접점 5 × 지금의 방식 + 접점 수', '예약 · 체크인 · 객실 · 부대시설 · 체크아웃마다 지금 손님을 맞는 방식과 접점 수를 짚을 때')


def std():
    s = sheet('L_TOC_UA_HT_STD', '브랜드 표준 · 시스템', '지켜야 할 브랜드 기준과 이어야 할 시스템')
    cap(s, 64, 132, '브랜드 표준', 'bl')
    for r, (lb, tg) in enumerate([('객실 TV 크기 · 사양', f'{Z}인치 이상'), ('화면 콘텐츠 · 로고 지침', '본사 지침서'), ('투숙객 정보 지우기', '체크아웃 때 자동'), ('객실 에너지 기준', '빈 방 자동 절전')]):
        y = 172 + r * 121
        s.box(64, y, 560, 109, bg=SURF, r=16)
        s.ico(84, y + 28, 'check', size=52, r=14, bg=WHITE)
        s.t(152, y + 24, 440, lb, 20, 800, INK, 1.3, name=f'b{r}', nowrap=True)
        s.t(152, y + 60, 440, tg, 16, 800, BLUE, 1.3, name=f'bt{r}', nowrap=True)
    s.box(648, 128, 568, 300, bg=SURF, r=18)
    cap(s, 672, 148, '이어야 할 시스템', 'sl')
    for i, lb in enumerate(['객실 예약 · 운영 관리', '객실 조명 · 온도 제어', '도어록 · 카드 키', '객실 TV 방송 · 화면 공유', '건물 설비 관리']):
        y = 188 + i * 46
        s.box(672, y, 520, 38, bg=WHITE, r=19)
        s.raw(f'<div style="position: absolute; left: 688px; top: {y + 9}px">' + svg_icon('link', 20, BLUE, 2) + '</div>')
        s.t(720, y + 8, 456, lb, 16, 800, INK, 1.4, name=f's{i}', nowrap=True)
    s.box(648, 444, 568, 204, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 672, 464, '새 단장 주기', 'rl')
    s.hline(760, 555, 344, color=SOFT, t=3)
    for i, lb in enumerate(['문을 연 해', '최근 새 단장', '다음 계획']):
        cx = 760 + i * 172
        s.t(cx - 86, 514, 172, lb, 16, 700, GRAY, 1.3, name=f'y{i}', align='center', nowrap=True)
        s.raw(f'<div style="position: absolute; left: {cx - 11}px; top: 545px; width: 22px; height: 22px; border-radius: 50%; box-sizing: border-box; background: {WHITE if i == 2 else BLUE}; border: 4px solid {BLUE}"></div>')
        s.t(cx - 86, 580, 172, Z + '년', 24, 800, BLUE, 1.3, name=f'yv{i}', align='center', extra=NUM)
    return done(s, CLUSTER, 6, '브랜드 표준 · 시스템', '표준 4 + 연동 시스템 5 + 새 단장 시점 3', '체인 · 브랜드가 정한 기준, 이어야 할 객실 시스템, 새 단장 주기를 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'ht_mid',
           'title': '객실 TV · 공조 · 로비 화면까지, 호텔 전체를 한 공급사에서',
           'areas': [('로비', 'p', '스마트 사이니지'), ('객실 TV', 'p', '호텔 TV'), ('객실 냉난방', 'p', '무풍 4Way'), ('조식당 · 부대시설', 'p', '비즈니스 TV'), ('라운지 · 복도', 'p', 'The Frame')],
           'platform': ['LYNK Cloud', 'SmartThings Pro', 'DMS 2.5'],
           'a': [(0, '화면 별도'), (1, '기본 환영 화면'), (0, '공조 미지원'), (0, 'TV만 관리'), (0, '미지원')],
           'b': [(0, '미지원'), (1, '채널 송출만'), (1, '객실 제어'), (0, '설비 일부'), (0, '미지원')]},
 'edge': {'vid': 'ht_mid', 'msgs': [('해상도', '객실에서 누리는 4K 화질', '3,840 x 2,160'), ('에너지효율 등급', '객실마다 놓여도 전기료 부담이 적은 1등급'), ('소비전력', '객실 수만큼 쌓이는 전력을 줄이는 소비 전력')]},
 'proof': {'title': '호텔에서 먼저 검증했습니다', 'cases': ['인스파이어 엔터테인먼트 리조트', '신라스테이 서초', '크라운 파크 호텔 서울']}}

SHEETS = [rooms, guest, touch, std, *compete.sheets(CLUSTER, COMPETE)]
