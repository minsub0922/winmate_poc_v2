# 당사의 이해 · 오피스 — 인원 · 근무 방식 → 층별 구성 → 회의 · 협업 → IT · 보안 · ESG 기준
from kit import *
import compete

CLUSTER = dict(id='OF', name='오피스', cust='대기업 사옥', ai='AI 오피스', verticals=['of_hq', 'of_sme', 'of_cowork'],
               goal='인원과 근무 방식, 층별 공간 구성, 회의실과 협업 환경, 들이기 전에 통과해야 할 IT · 보안 · ESG 기준을 먼저 짚는다')


def work():
    s = sheet('L_TOC_UA_OF_WORK', '인원 · 근무 방식', '몇 명이, 어떤 방식으로 일하는지')
    bluepanel(s, 64, 128, 400, 520, 'users', '임직원', '명', 'p', [('사용하는 층', '개 층'), ('좌석', '석')])
    s.box(488, 128, 728, 248, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 516, 150, '근무 방식', 'wt')
    fr = [0.5, 0.35, 0.15]; cols = [C1, C2, C4]
    segbar(s, 516, 196, 672, 52, fr, cols, r=14)
    x = 516
    for i, lb in enumerate(['사무실 출근', '섞어서 근무', '원격 근무']):
        s.box(x, 275, 16, 16, bg=cols[i], r=5)
        s.t(x + 24, 268, 90 if i == 2 else 200, lb, 18, 800, INK, 1.3, name=f'w{i}', nowrap=True)
        s.t(x + 24, 298, 90, Z + '%', 24, 800, BLUE, 1.2, name=f'wv{i}', extra=NUM)
        x += 672 * fr[i]
    s.box(488, 392, 352, 256, bg=SURF, r=18)
    cap(s, 512, 412, '좌석 방식', 'st', w=300)
    for k, lb in enumerate(['지정석', '자율 좌석']):
        on = k == 1
        s.box(512 + k * 156, 456, 148, 52, bg=BLUE if on else WHITE, r=26, border=None if on else f'1px solid {LINE}')
        s.t(512 + k * 156, 470, 148, lb, 18, 800, WHITE if on else GRAY, 1.3, name=f'o{k}', align='center', nowrap=True)
    small(s, 512, 540, '좌석 하나를 나눠 쓰는 인원', MUTE, 300)
    numu(s, 512, 566, 300, Z, '명', 40, 18, name='sv')
    s.box(864, 392, 352, 256, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 888, 412, '출근이 몰리는 요일', 'dt', w=300)
    for k, (d, hh) in enumerate(zip('월화수목금', [0.6, 1.0, 0.95, 0.85, 0.45])):
        x = 900 + k * 60; h = 110 * hh
        s.box(x, 596 - h, 40, h, bg=C1 if k in (1, 2) else SOFT, extra='border-radius: 6px 6px 0 0')
        s.t(x, 606, 40, d, 14, 700, GRAY, 1.3, name=f'd{k}', align='center')
    s.hline(888, 596, 304, color=DASH)
    return done(s, CLUSTER, 3, '인원 · 근무 방식', '대표 숫자 3 + 근무 방식 띠 3 + 좌석 방식 + 요일 막대 5', '임직원 수 · 근무 방식 비중 · 좌석 방식 · 출근이 몰리는 요일을 짚을 때')


def stack():
    s = sheet('L_TOC_UA_OF_STACK', '층별 구성', '건물을 층으로 펼쳐, 어디에 무엇이 있는지')
    floors = [('임원 · 이사회', '임원실 · 이사회실', 'star'), ('업무 공간', '부서별 업무 좌석', 'users'), ('회의 · 교육', '회의실 · 교육장', 'chat'),
              ('라운지 · 카페', '직원 휴게 · 가벼운 미팅', 'cup'), ('구내식당 · 강당', '식사 · 전사 행사', 'fork'), ('로비 · 안내', '방문객 맞이 · 출입 게이트', 'door')]
    cols = [BLUE, '#2438b4', '#3550cc', '#4a66dd', '#637de6', '#7f97ee']
    for i, (nm, use, ic) in enumerate(floors):
        y = 128 + i * 88
        s.box(64, y, 336, 76, bg=cols[i], extra='border-radius: 18px 18px 0 0' if i == 0 else 'border-radius: 4px')
        s.t(88, y + 25, 200, f'{Z} – {Z}층', 20, 800, WHITE, 1.3, name=f'f{i}', nowrap=True, extra=NUM)
        s.raw(f'<div style="position: absolute; left: 340px; top: {y + 20}px">' + svg_icon(ic, 36, 'rgba(255,255,255,0.9)', 1.8) + '</div>')
        s.box(400, y + 34, 24, 8, bg=cols[i])
        s.box(424, y, 792, 76, bg=SURF, r=14)
        s.t(448, y + 13, 400, nm, 20, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        s.t(448, y + 43, 400, use, 16, 600, GRAY, 1.3, name=f'u{i}', nowrap=True)
        small(s, 884, y + 13, '회의실', MUTE, 120)
        numu(s, 884, y + 33, 120, Z, '실', 24, 14, name=f'r{i}')
        small(s, 1048, y + 13, '화면', MUTE, 120)
        numu(s, 1048, y + 33, 120, Z, '대', 24, 14, name=f'd{i}')
    return done(s, CLUSTER, 4, '층별 구성', '건물 층 6 × 쓰임 · 회의실 · 화면 수', '건물을 층별로 나눠 층마다 쓰임과 회의실 · 화면 수를 짚을 때')


def meet():
    s = sheet('L_TOC_UA_OF_MEET', '회의 · 협업', '회의실은 몇 실, 무엇으로 회의하는지')
    for x, lb in ((88, '회의실 유형'), (468, '실 수'), (628, '지금 쓰는 장비'), (1012, '화상 회의')):
        small(s, x, 134, lb, MUTE, 200)
    rows = [('1–2인', '집중 업무실', '화면 없음', '거의 없음'), ('4–6인', '소회의실', 'TV + 유선 연결', '가끔'), ('8–12인', '중회의실', '빔프로젝터 + 스피커폰', '매일'),
            ('20인+', '대회의실 · 이사회실', '프로젝터 + 음향 장비', '매일'), ('100인+', '강당 · 전사 모임 공간', '빔프로젝터 + 마이크', '가끔')]
    for r, (capa, nm, dev, vc) in enumerate(rows):
        y = 164 + r * 84
        s.box(64, y, 1152, 74, bg=SURF, r=16)
        s.t(84, y + 17, 84, capa, 16, 800, WHITE, 1.3, name=f'p{r}', align='center', nowrap=True,
            extra=f'height: 40px; line-height: 40px; border-radius: 20px; background: {BLUE}; {NUM}')
        s.t(184, y + 24, 270, nm, 20, 800, INK, 1.3, name=f'n{r}', nowrap=True)
        numu(s, 468, y + 20, 130, Z, '실', 32, 16, name=f'v{r}')
        s.t(628, y + 25, 360, dev, 18, 700, INK2, 1.3, name=f'd{r}', nowrap=True)
        s.t(1012, y + 25, 180, vc, 18, 800, BLUE, 1.3, name=f'c{r}', nowrap=True)
    s.box(64, 592, 1152, 56, bg=TINT, r=16)
    s.t(88, 609, 230, '함께 쓰는 화상 회의 도구', 16, 800, BLUE, 1.3, name='tl', nowrap=True)
    chiprow(s, 316, 600, ['Teams', 'Zoom', 'Webex', 'Google Meet'], 0, 'vc', size=16, h=40)
    return done(s, CLUSTER, 5, '회의 · 협업', '회의실 유형 5 × 실 수 · 장비 · 화상 회의 표', '회의실을 크기별로 나눠 실 수와 지금 쓰는 장비 · 화상 회의 빈도를 짚을 때')


def policy():
    s = sheet('L_TOC_UA_OF_POLICY', 'IT · 보안 · ESG', '들이기 전에 통과해야 할 기준 세 가지')
    cols = [('IT 표준', 'server', ['네트워크 · 무선 접속 방식', '기기 중앙 관리', '표준 운영체제 · 회의 도구'], '관리하는 기기', '대'),
            ('보안', 'lock', ['반입 기기 보안 심사', '화면 · 문서 유출 방지', '업무망 분리 · 방문객 통제'], '보안 심사 기간', '일'),
            ('ESG · 에너지', 'leaf', ['전력 사용 절감 목표', '녹색 건축 · 건물 인증', '대기 전력 · 자동 꺼짐'], '전력 절감 목표', '%')]
    for c, (nm, ic, items, sl, un) in enumerate(cols):
        x = 64 + c * 392
        s.box(x, 128, 368, 520, bg=WHITE, r=18, border=f'1px solid {LINE}')
        s.box(x, 128, 368, 96, bg=BLUE, extra='border-radius: 18px 18px 0 0')
        s.ico(x + 24, 148, ic, size=56, r=16, bg=GLASS, color=WHITE)
        s.t(x + 96, 160, 250, nm, 24, 800, WHITE, 1.3, name=f'h{c}', nowrap=True)
        for k, it in enumerate(items):
            y = 248 + k * 88
            s.ico(x + 24, y + 4, 'check', size=40, r=12)
            s.t(x + 78, y + 11, 268, it, 18, 800, INK, 1.4, name=f'i{c}_{k}', clamp=2)
        s.box(x + 20, 520, 328, 108, bg=TINT, r=14)
        s.t(x + 40, 538, 288, sl, 16, 800, BLUE, 1.3, name=f's{c}', nowrap=True)
        numu(s, x + 40, 568, 288, Z, un, 40, 18, name=f'v{c}')
    return done(s, CLUSTER, 6, 'IT · 보안 · ESG', '기준 3 묶음 × 확인 항목 3 + 숫자 1', '기기를 들이기 전에 통과해야 하는 IT 표준 · 보안 · ESG 기준을 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'of_hq',
           'title': '회의실 · 업무 단말 · 빌딩 설비까지, 오피스 전체를 한 공급사에서',
           'areas': [('로비', 'p', 'The Wall'), ('회의실', 'p', '전자칠판 Flip Pro'), ('업무 공간', 'p', '모니터'), ('업무 단말', 'p', '갤럭시 북 EE'), ('공조 · 설비', 'p', 'DVM S2 실외기')],
           'platform': ['b.IoT', 'SmartThings Pro', 'VXT CMS'],
           'a': [(0, '미지원'), (1, '화상 회의'), (0, '모니터 별도'), (1, '자체 보안'), (0, '관제 미지원')],
           'b': [(0, '미지원'), (0, '예약만'), (0, '미지원'), (0, '미지원'), (1, '설비 관제')]},
 'edge': {'vid': 'of_sme', 'msgs': [('무게', '회의실과 자리를 오가도 가벼운 무게'), ('배터리 용량', '충전기 없이 이어 가는 하루 업무'), ('화면 크기', '문서 두 개를 나란히 보는 화면', '35.6 cm')]},
 'proof': {'title': '오피스에서 먼저 검증했습니다', 'cases': ['KT 광화문빌딩 웨스트', '이트너스', '패스트파이브']}}

SHEETS = [work, stack, meet, policy, *compete.sheets(CLUSTER, COMPETE)]
