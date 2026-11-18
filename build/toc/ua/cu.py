# 당사의 이해 · 문화 · 여가 · 집회 시설 — 규모 · 방문객 → 시즌 · 행사 일정 → 관람 동선 → 콘텐츠 · 수익
from kit import *
import compete

CLUSTER = dict(id='CU', name='문화 · 여가 · 집회 시설', cust='전시관·미술관', ai='AI 뮤지엄',
               verticals=['tp_park', 'tp_museum', 'vn_stadium', 'vn_cinema', 'sf_fitness', 'rg_church'],
               goal='수용 규모와 방문객이 몰리는 날, 한 해의 시즌 · 행사 일정, 입장부터 퇴장까지의 동선, 콘텐츠와 수익 구조를 먼저 짚는다')


def visit():
    s = sheet('L_TOC_UA_CU_VISIT', '규모 · 방문객', '얼마나 많은 사람이, 언제 찾아오는지')
    bluepanel(s, 64, 128, 440, 520, 'ticket', '한 해 방문객', '만 명', 'y', [('한 번에 받을 수 있는 인원', '명'), ('관 · 홀 · 구역', '개')])
    s.box(528, 128, 688, 300, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 556, 150, '요일별 방문객', 'wt')
    s.chip(1052, 146, f'주말 집중 {Z}%', name='wk', bg=BLUE, color=WHITE, size=14, h=32, pad=14)
    for k, (d, hh) in enumerate(zip('월화수목금토일', [0.35, 0.3, 0.38, 0.42, 0.6, 1.0, 0.9])):
        x = 588 + k * 88; h = 150 * hh
        s.box(x, 372 - h, 56, h, bg=C1 if k >= 5 else SOFT, extra='border-radius: 8px 8px 0 0')
        s.t(x, 384, 56, d, 16, 700, GRAY, 1.3, name=f'd{k}', align='center')
    s.hline(556, 372, 632, color=DASH)
    for i, (lb, ic) in enumerate([('평일 하루', 'person'), ('주말 · 공휴일 하루', 'users')]):
        tile(s, 528 + i * 356, 444, 332, 204, ic, lb, '명', f't{i}')
    return done(s, CLUSTER, 3, '규모 · 방문객', '대표 숫자 3 + 요일 막대 7 + 평일 · 주말 숫자', '연간 방문객 · 수용 인원과 방문객이 몰리는 요일을 짚을 때')


def season():
    s = sheet('L_TOC_UA_CU_SEASON', '시즌 · 행사 일정', '한 해의 시즌과 행사, 그리고 설치할 수 있는 때')
    X0, PW = 276, 78
    months(s, X0, 128, PW, 40)
    lanes = [('기획 전시 · 공연', 'film', C1, [(3, 5, '봄 기획'), (7, 8, '여름 특별'), (10, 12, '가을 · 연말 기획')]),
             ('정규 시즌 · 정기 행사', 'flag', '#2f4bd6', [(4, 10, '정규 시즌')]),
             ('사람이 몰리는 때', 'users', C2, [(5, 5, '가정의 달'), (7, 8, '여름 방학'), (12, 12, '연말')]),
             ('휴관 · 정기 점검', 'wrench', GRAY, [(2, 2, '점검'), (11, 11, '점검')]),
             ('설치할 수 있는 때', 'check', GOOD, [(1, 2, '설치 가능'), (11, 11, '가능')])]
    for i, (lb, ic, col, bars) in enumerate(lanes):
        y = 184 + i * 93
        s.box(64, y, 1152, 81, bg=SURF, r=14)
        s.ico(80, y + 18, ic, size=44, r=12, bg=WHITE, color=col)
        s.t(134, y + 18, 134, lb, 16, 800, INK, 1.35, name=f'l{i}', h=45, extra='display: flex; align-items: center')
        for k, (a, b, t) in enumerate(bars):
            x = X0 + (a - 1) * PW; w = (b - a + 1) * PW - 4
            s.box(x, y + 18, w, 45, bg=col, r=12)
            s.t(x + 2, y + 30, w - 4, t, 16, 800, WHITE, 1.3, name=f'b{i}_{k}', align='center', nowrap=True)
    return done(s, CLUSTER, 4, '시즌 · 행사 일정', '12달 × 일정 5줄', '기획 · 정규 시즌 · 성수기 · 휴관 일정을 한 해 달력에 놓고 설치할 수 있는 때를 찾을 때')


def route():
    s = sheet('L_TOC_UA_CU_ROUTE', '관람 동선', '입장부터 퇴장까지, 어디가 붐비고 무엇으로 안내하는지')
    steps = [('매표 · 입장', 'ticket', '●●●●○', '매표소 앞 입간판'), ('로비 · 대기', 'users', '●●●○○', '안내 데스크 · 인쇄물'), ('관람 · 이용 구역', 'eye', '●●○○○', '벽면 패널 · 해설사'),
             ('식음 · 기념품', 'cup', '●●●●●', '메뉴판 · 가격표'), ('퇴장', 'door', '●●○○○', '출구 유도 표지')]
    for i, (nm, ic, dots, now) in enumerate(steps):
        x = 64 + i * 236
        s.box(x, 128, 208, 520, bg=SURF, r=18)
        disc(s, x + 56, 184, 64, ic, ring=False)
        s.t(x + 24, 236, 160, nm, 24, 800, INK, 1.3, name=f'n{i}', clamp=2)
        small(s, x + 24, 318, '붐비는 정도', MUTE, 160)
        s.t(x + 24, 342, 172, dots, 20, 800, BLUE, 1.3, name=f'd{i}', nowrap=True, extra='letter-spacing: 0.14em')
        small(s, x + 24, 392, '가장 길 때 기다림', MUTE, 160)
        numu(s, x + 24, 416, 160, Z, '분', 40, 18, name=f'm{i}')
        s.hline(x + 24, 484, 160)
        small(s, x + 24, 500, '지금의 안내', MUTE, 160)
        s.t(x + 24, 528, 160, now, 18, 700, INK2, 1.45, name=f'w{i}', clamp=3)
        if i < 4: rarrow(s, x + 222, 184)
    return done(s, CLUSTER, 5, '관람 동선', '동선 구간 5 × 붐비는 정도 · 대기 · 지금의 안내', '입장부터 퇴장까지 구간마다 붐비는 정도와 지금의 안내 방법을 짚을 때')


def revenue():
    s = sheet('L_TOC_UA_CU_REVENUE', '콘텐츠 · 수익', '무엇으로 벌고, 화면에 올릴 콘텐츠는 누가 만드는지')
    s.box(64, 128, 1152, 232, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 150, '수익 구성', 'rt')
    fr = [0.45, 0.25, 0.2, 0.1]; cols = [C1, C2, C3, C4]
    segbar(s, 92, 196, 1096, 56, fr, cols, r=14)
    x = 92
    for i, lb in enumerate(['입장 · 회원', '식음 · 상품', '광고 · 후원', '대관']):
        s.box(x, 277, 16, 16, bg=cols[i], r=5)
        s.t(x + 24, 270, 84 if i == 3 else 190, lb, 18, 800, INK, 1.3, name=f'r{i}', nowrap=True)
        s.t(x + 24, 300, 84, Z + '%', 24, 800, BLUE, 1.2, name=f'rv{i}', extra=NUM)
        x += 1096 * fr[i]
    for i, (ic, lb, un, sub) in enumerate([('swap', '콘텐츠 교체', '회 / 월', '전시 · 공연이 바뀔 때마다'), ('sign', '콘텐츠 제작 기간', '일', '기획부터 화면에 올리기까지'), ('megaphone', '광고 · 후원 구좌', '개', '로비 · 통로 화면 기준')]):
        x = 64 + i * 392
        s.box(x, 376, 368, 272, bg=SURF, r=18)
        s.ico(x + 24, 400, ic, size=56, r=16, bg=WHITE)
        s.t(x + 96, 414, 250, lb, 20, 800, INK2, 1.3, name=f'c{i}', nowrap=True)
        numu(s, x + 24, 496, 320, Z, un, 56, 20, name=f'cv{i}')
        s.t(x + 24, 592, 320, sub, 16, 700, GRAY, 1.3, name=f'cs{i}', nowrap=True)
    return done(s, CLUSTER, 6, '콘텐츠 · 수익', '수익 띠 4 + 콘텐츠 운영 숫자 3', '수익원 비중과 콘텐츠 교체 · 제작 · 광고 구좌 규모를 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'tp_museum',
           'title': '전시 화면 · 관람 기기 · 설비까지, 시설 전체를 한 공급사에서',
           'areas': [('매표 · 로비', 'p', '스마트 사이니지'), ('전시 · 관람 구역', 'p', 'The Wall'), ('몰입 연출', 'p', '스페이셜 사이니지'), ('해설 · 관람 기기', 'p', '갤럭시 탭'), ('공조 · 설비', 'p', '시스템에어컨 360')],
           'platform': ['VXT CMS', 'MagicINFO', 'b.IoT'],
           'a': [(0, '소형 화면 별도'), (1, 'LED 위주'), (0, '미지원'), (0, '미지원'), (0, '화면만 관리')],
           'b': [(0, '현장 수동 교체'), (1, '프로젝터 중심'), (1, '연출 운영'), (0, '미지원'), (0, '일부 설비')]},
 'edge': {'vid': 'vn_stadium',
          'msgs': [('Pixel Pitch', '가까이 다가가도 화소가 보이지 않는 화면', None, '픽셀 피치'),
                   ('Contrast Ratio', '어두운 전시실 · 공연장에서 살아나는 깊은 검정', None, '명암비'),
                   ('Viewing Angle', '어느 자리에서 봐도 같은 색', None, '시야각')]},
 'proof': {'title': '전시 · 공연 · 경기장에서 먼저 검증했습니다', 'cases': ['인천SK행복드림구장', '제주 유민 미술관', '롯데시네마 광음LED']}}

SHEETS = [visit, season, route, revenue, *compete.sheets(CLUSTER, COMPETE)]
