# 당사의 이해 · 제조 · 물류 — 사업장 · 교대 근무 → 공정 · 물류 흐름 → 현장 환경 → 안전 · 현장 시스템
from kit import *
import compete

CLUSTER = dict(id='MF', name='제조 · 물류', cust='제조 공장', ai='AI 팩토리', verticals=['mf_factory', 'mf_logistics'],
               goal='사업장 규모와 교대 근무, 자재가 들어와 제품이 나가는 흐름, 기기가 견뎌야 하는 현장 환경, 안전 규제와 이어야 할 현장 시스템을 먼저 짚는다')


def site():
    s = sheet('L_TOC_UA_MF_SITE', '사업장 · 교대 근무', '얼마나 넓은 현장이, 하루 몇 교대로 돌아가는지')
    for i, (lb, un, ic) in enumerate([('부지 · 건물 면적', '㎡', 'map'), ('생산 라인 · 도크', '개', 'factory'), ('근무 인원', '명', 'users')]):
        tile(s, 64 + i * 392, 128, 368, 200, ic, lb, un, f't{i}')
    s.box(64, 344, 1152, 304, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 368, '하루 교대 근무', 'st', w=180)
    chiprow(s, 252, 358, ['2교대', '3교대'], 1, 'sh', size=16, h=40)
    s.t(900, 372, 180, '한 주에 가동하는 날', 16, 700, GRAY, 1.3, name='wl', align='right', nowrap=True)
    numu(s, 1092, 362, 96, Z, '일', 32, 16, name='wd', align='right')
    X0, W = 92, 1096
    for i, (nm, tm, col) in enumerate([('주간조', '06 – 14시', C1), ('오후조', '14 – 22시', C2), ('야간조', '22 – 06시', INK2)]):
        x = X0 + i * W / 3; w = W / 3 - 6
        s.box(x, 432, w, 76, bg=col, r=14)
        s.t(x + 24, 444, 200, nm, 20, 800, WHITE, 1.3, name=f's{i}', nowrap=True)
        s.t(x + 24, 474, 200, tm, 16, 700, W88, 1.3, name=f'h{i}', nowrap=True, extra=NUM)
        small(s, x + 24, 530, '근무 인원', MUTE, 200)
        numu(s, x + 24, 556, 240, Z, '명', 48, 20, name=f'v{i}')
    return done(s, CLUSTER, 3, '사업장 · 교대 근무', '숫자 3 + 교대조 띠 3', '사업장 면적 · 라인 수 · 인원과 하루 교대 근무 편성을 짚을 때')


def line():
    s = sheet('L_TOC_UA_MF_LINE', '공정 · 물류 흐름', '자재가 들어와 제품이 나가기까지, 정보가 필요한 자리')
    s.box(168, 250, 944, 16, bg=SOFT, r=8)
    steps = [('입고', 'box', '종이 입고 전표'), ('가공 · 조립', 'gear', '종이 작업 지시서'), ('검사', 'check', '손으로 쓰는 검사 일지'), ('포장', 'cube', '화이트보드 현황판'), ('출하', 'truck', '무전 · 전화 호출')]
    for i, (nm, ic, now) in enumerate(steps):
        cx = 168 + i * 236; x = cx - 104
        s.t(x, 144, 208, nm, 24, 800, INK, 1.3, name=f'n{i}', align='center', nowrap=True)
        disc(s, cx, 258, 88, ic)
        s.box(x, 328, 208, 132, bg=SURF, r=16)
        small(s, x + 20, 346, '지금 정보를 보는 방법', MUTE, 168)
        s.t(x + 20, 374, 168, now, 18, 700, INK2, 1.45, name=f'w{i}', clamp=3)
        s.box(x, 476, 208, 172, bg=TINT, r=16)
        small(s, x + 20, 496, '현황판이 필요한 자리', BLUE, 168)
        numu(s, x + 20, 556, 168, Z, '곳', 56, 20, name=f'v{i}')
    return done(s, CLUSTER, 4, '공정 · 물류 흐름', '공정 5 단계 × 지금의 방법 + 필요한 자리 수', '입고부터 출하까지 공정마다 지금 정보를 보는 방법과 현황판이 필요한 자리를 짚을 때')


def env():
    s = sheet('L_TOC_UA_MF_ENV', '현장 환경', '화면과 기기가 견뎌야 하는 현장 환경')
    cards = [('온도', 'temp', 'range', '℃'), ('습도', 'drop', 'range', '%'), ('분진 · 기름', 'dust', 'level', 2), ('진동 · 충격', 'pulse', 'level', 1), ('밝기 · 눈부심', 'sun', 'range', 'lx'), ('방폭 · 청정 구역', 'fire', 'count', '곳')]
    for i, (nm, ic, kind, arg) in enumerate(cards):
        x = 64 + (i % 3) * 392; y = 128 + (i // 3) * 270
        s.box(x, y, 368, 250, bg=SURF, r=18)
        s.ico(x + 24, y + 24, ic, size=56, r=16, bg=WHITE)
        s.t(x + 96, y + 38, 250, nm, 20, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        if kind == 'range':
            s.box(x + 24, y + 118, 320, 12, bg=WHITE, r=6)
            s.box(x + 104, y + 118, 160, 12, bg=BLUE, r=6)
            for kx in (x + 92, x + 252):
                s.raw(f'<div style="position: absolute; left: {kx}px; top: {y + 112}px; width: 24px; height: 24px; border-radius: 50%; box-sizing: border-box; background: {WHITE}; border: 4px solid {BLUE}"></div>')
            s.t(x + 24, y + 152, 150, Z + arg, 32, 800, BLUE, 1.2, name=f'lo{i}', extra=NUM)
            s.t(x + 194, y + 152, 150, Z + arg, 32, 800, BLUE, 1.2, name=f'hi{i}', align='right', extra=NUM)
            small(s, x + 24, y + 204, '가장 낮을 때', MUTE, 150)
            small(s, x + 194, y + 204, '가장 높을 때', MUTE, 150, 'right')
        elif kind == 'level':
            for k, lv in enumerate(['낮음', '보통', '높음']):
                on = k == arg
                s.box(x + 24 + k * 110, y + 112, 100, 52, bg=BLUE if on else WHITE, r=14)
                s.t(x + 24 + k * 110, y + 126, 100, lv, 18, 800, WHITE if on else GRAY, 1.3, name=f'lv{i}_{k}', align='center')
            small(s, x + 24, y + 204, '기기 둘레 수준', MUTE, 200)
        else:
            numu(s, x + 24, y + 112, 320, Z, arg, 56, 20, name=f'c{i}')
            small(s, x + 24, y + 204, '따로 인증받은 기기가 필요한 구역', MUTE, 320)
    return done(s, CLUSTER, 5, '현장 환경', '환경 조건 6(범위 3 · 수준 2 · 구역 수 1)', '온도 · 습도 · 분진 · 진동 · 밝기와 방폭 · 청정 구역처럼 기기가 견뎌야 하는 조건을 짚을 때')


def safe():
    s = sheet('L_TOC_UA_MF_SAFE', '안전 · 현장 시스템', '안전을 위해 지켜야 할 것과 이어야 할 현장 시스템')
    s.box(64, 128, 560, 316, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 150, '안전 · 규제', 'rt')
    for r, lb in enumerate(['중대 재해 예방 의무', '안전 보건 경영 인증', '위험 구역 · 대피 경로 표시', '비상 방송 · 경보 연동']):
        y = 196 + r * 60
        s.ico(92, y, 'check', size=40, r=12)
        s.t(146, y + 6, 440, lb, 20, 800, INK, 1.3, name=f'r{r}', nowrap=True)
    s.box(64, 460, 272, 188, bg=BLUE, r=18)
    s.t(88, 484, 224, '설비 가동률', 18, 700, W88, 1.3, name='k0', nowrap=True)
    numu(s, 88, 548, 224, Z, '%', 56, 24, color=WHITE, ucolor=W88, name='k0v')
    s.box(352, 460, 272, 188, bg=TINT, r=18)
    s.t(376, 484, 224, '사고 없이 이어 온 날', 18, 800, BLUE, 1.3, name='k1', nowrap=True)
    numu(s, 376, 548, 224, Z, '일', 56, 24, name='k1v')
    s.box(648, 128, 568, 520, bg=SURF, r=18)
    cap(s, 676, 150, '이어야 할 현장 시스템', 'st')
    for i, (lb, w) in enumerate([('경영 정보 · ERP', 300), ('생산 관리 · MES', 372), ('창고 · 물류 관리 · WMS', 444), ('설비 · 센서 감시', 516)]):
        y = 200 + i * 98; x = 932 - w / 2; on = i == 1
        s.box(x, y, w, 84, bg=BLUE if on else WHITE, r=16)
        s.t(x, y + 29, w, lb, 20, 800, WHITE if on else INK, 1.3, name=f's{i}', align='center', nowrap=True)
    small(s, 676, 604, '파란 칸 — 현황판과 가장 먼저 잇는 시스템', BLUE, 512, 'center', name='sn')
    return done(s, CLUSTER, 6, '안전 · 현장 시스템', '안전 · 규제 4 + 숫자 2 + 현장 시스템 4층', '안전 규제와 가동률 · 무사고 일수, 현황판과 이어야 할 현장 시스템을 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'mf_factory',
           'title': '현황판 · 현장 단말 · 작업자 안전까지, 사업장 전체를 한 공급사에서',
           'areas': [('생산 라인 현황판', 'p', '비디오월'), ('현장 단말', 'p', '갤럭시 탭'), ('작업자 안전', 's', 'SmartThings Safety'), ('통제실', 'p', '모니터'), ('공조 · 설비', 'p', 'DVM 칠러')],
           'platform': ['b.IoT', 'SmartThings Pro', 'DMS 2.5'],
           'a': [(0, '미지원'), (1, '동급 내구'), (0, '미지원'), (0, '미지원'), (0, '미지원')],
           'b': [(0, '미지원'), (0, '일반 단말'), (1, '센서 위주'), (1, '관제'), (1, '설비 관제')]},
 'edge': {'vid': 'mf_factory', 'msgs': [('배터리 용량', '교대 근무 내내 가는 배터리'), ('화면 크기', '작업 지시를 크게 보는 화면'), ('무게', '한 손에 들고 현장을 도는 무게')]},
 'proof': {'title': '제조 · 물류 현장에서 먼저 검증했습니다', 'cases': ['포스코', '아이센스 송도2공장', '백광의약품']}}

SHEETS = [site, line, env, safe, *compete.sheets(CLUSTER, COMPETE)]
