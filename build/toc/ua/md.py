# 당사의 이해 · 병의원 — 병상 · 진료 규모 → 환자 여정 · 대기 → 구역 구성 → 인증 · 감염 · 시스템
from kit import *
import compete

CLUSTER = dict(id='MD', name='병의원', cust='중소 병원', ai='AI 스마트 병원', verticals=['md_tertiary', 'md_hospital', 'md_clinic', 'md_ltc'],
               goal='병상 · 진료 규모, 접수부터 귀가까지 환자가 기다리는 시간, 구역 구성, 병원이라서 지켜야 하는 기준과 이어야 하는 시스템을 먼저 짚는다')


def scale():
    s = sheet('L_TOC_UA_MD_SCALE', '병상 · 진료 규모', '어떤 병원이고, 하루에 몇 명을 진료하는지')
    s.box(64, 128, 320, 520, bg=SURF, r=18)
    cap(s, 88, 150, '병원 종류', 'kt', w=200)
    for i, (nm, w) in enumerate([('상급 종합 병원', 272), ('종합 병원', 236), ('병원', 200), ('의원', 164), ('요양 병원', 236)]):
        y = 196 + i * 80 + (14 if i == 4 else 0); on = i == 1
        if i == 4: s.hline(88, 518, 272, color=DASH)
        s.box(88, y, w, 66, bg=BLUE if on else WHITE, r=14, border=None if on else f'1px solid {LINE}')
        s.t(88, y + 21, w, nm, 18, 800, WHITE if on else GRAY, 1.3, name=f'k{i}', align='center', nowrap=True)
    bluepanel(s, 408, 128, 392, 520, 'bed', '병상', '병상', 'b', [('진료과', '개'), ('의료진', '명')])
    s.pic(824, 128, 392, 248, 'img/media/g0.json#1099', '고객 병원 병실 사진', r=18, name='ph')
    s.box(824, 392, 392, 256, bg=TINT, r=18)
    s.t(852, 416, 336, '하루 외래 환자', 18, 800, BLUE, 1.3, name='ol', nowrap=True)
    numu(s, 852, 452, 336, Z, '명', 56, 20, name='ov')
    s.hline(852, 544, 336, color=SOFT)
    s.t(852, 572, 180, '하루 입원 · 퇴원', 16, 700, GRAY, 1.3, name='al', nowrap=True)
    numu(s, 1028, 560, 160, Z, '명', 32, 16, name='av', align='right')
    return done(s, CLUSTER, 3, '병상 · 진료 규모', '병원 종류 사다리 5 + 대표 숫자 3 + 병실 사진 + 환자 숫자 2', '병원 종류와 병상 · 진료과 · 의료진 수, 하루 환자 수를 짚을 때')


def patient():
    s = sheet('L_TOC_UA_MD_PATIENT', '환자 여정 · 대기', '접수부터 귀가까지, 환자가 기다리는 시간')
    steps = [('접수', 'doc', '원무 창구'), ('대기', 'clock', '대기 공간'), ('진료', 'cross', '진료실'), ('검사', 'pulse', '검사실 · 영상실'), ('수납', 'card', '수납 창구'), ('약 · 귀가', 'home', '약국 · 출구')]
    s.box(64, 344, 1152, 304, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 364, '단계마다 기다리는 시간', 'wt')
    s.chip(1056, 358, f'모두 더해 {Z}분', name='sum', bg=BLUE, color=WHITE, size=14, h=32, pad=14)
    for i, ((nm, ic, where), hh) in enumerate(zip(steps, [0.45, 1.0, 0.3, 0.8, 0.55, 0.35])):
        x = 64 + i * 198.4
        s.box(x, 128, 160, 196, bg=SURF, r=18)
        disc(s, x + 80, 176, 56, ic, ring=False)
        s.t(x, 222, 160, nm, 20, 800, INK, 1.3, name=f'n{i}', align='center', nowrap=True)
        s.t(x, 258, 160, where, 16, 700, GRAY, 1.3, name=f'p{i}', align='center', nowrap=True)
        if i < 5: s.arrow(x + 169, 216, 20, DASH)
        h = 120 * hh
        s.box(x + 48, 610 - h, 64, h, bg=C1 if hh >= 0.8 else SOFT, extra='border-radius: 8px 8px 0 0')
        numu(s, x, 610 - h - 36, 160, Z, '분', 24, 14, name=f'm{i}', align='center')
    s.hline(92, 610, 1096, color=DASH)
    return done(s, CLUSTER, 4, '환자 여정 · 대기', '여정 6 단계 + 단계별 대기 막대 6', '접수 · 대기 · 진료 · 검사 · 수납 · 귀가 단계마다 환자가 기다리는 시간을 짚을 때')


def zone():
    s = sheet('L_TOC_UA_MD_ZONE', '구역 구성', '병원을 구역으로 나눠, 어디에 무엇이 몇 곳인지')
    zones = [(64, 128, 368, 172, '로비 · 원무', 'users', '창구', '개', 'pub'), (448, 128, 464, 172, '외래 진료', 'cross', '진료실', '실', 'cli'), (928, 128, 288, 172, '검사 · 영상', 'pulse', '검사실', '실', 'cli'),
             (64, 316, 560, 172, '병동', 'bed', '병동', '개', 'cli'), (640, 316, 288, 172, '수술 · 중환자', 'shield', '수술실 · 병상', '곳', 'pro'), (944, 316, 272, 172, '응급', 'alert', '병상', '개', 'cli'),
             (64, 504, 368, 144, '간호 스테이션', 'heart', '스테이션', '곳', 'pub'), (448, 504, 368, 144, '재활 · 건강 검진', 'dumbbell', '치료 · 검진실', '실', 'cli'), (832, 504, 384, 144, '약국 · 편의 시설', 'bag', '시설', '곳', 'pub')]
    for i, (x, y, w, h, nm, ic, what, un, kind) in enumerate(zones):
        if kind == 'pro': s.box(x, y, w, h, bg=WHITE, r=18, border=f'2px dashed {BLUE}')
        else: s.box(x, y, w, h, bg=TINT if kind == 'pub' else SURF, r=18)
        s.ico(x + 20, y + 20, ic, size=48, r=14, bg=TINT if kind == 'pro' else WHITE)
        s.t(x + 80, y + 31, w - 100, nm, 20, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        s.t(x + 20, y + h - 46, 120, what, 16, 700, GRAY, 1.3, name=f'w{i}', nowrap=True)
        numu(s, x + w - 170, y + h - 62, 150, Z, un, 40, 18, name=f'v{i}', align='right')
    s.chip(720, 382, '보호 구역', name='pz', bg=BLUE, color=WHITE, size=14, h=28, pad=12)
    return done(s, CLUSTER, 5, '구역 구성', '병원 구역 9칸(공용 · 진료 · 보호 구역)', '로비 · 외래 · 검사 · 병동 · 수술 · 응급 같은 구역마다 수를 짚고 보호 구역을 가를 때')


def rule():
    s = sheet('L_TOC_UA_MD_RULE', '인증 · 감염 · 시스템', '병원이라서 지켜야 하는 기준과 이어야 하는 시스템')
    s.box(64, 128, 560, 520, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 150, '지켜야 하는 기준', 'rt')
    for r, (lb, ic, tg) in enumerate([('의료 기관 인증 평가', 'shield', f'평가 주기 {Z}년'), ('감염 관리 · 청결 구역', 'drop', '닦아 소독할 수 있는 표면'), ('환자 정보 화면 노출', 'eye', '이름 가림 표시'), ('의료 기기 둘레 전자파', 'pulse', '적합 인증 확인')]):
        y = 194 + r * 110
        s.box(84, y, 520, 98, bg=SURF, r=16)
        s.ico(104, y + 23, ic, size=52, r=14, bg=WHITE)
        s.t(172, y + 20, 410, lb, 20, 800, INK, 1.3, name=f'r{r}', nowrap=True)
        s.t(172, y + 54, 410, tg, 16, 800, BLUE, 1.3, name=f't{r}', nowrap=True)
    s.box(648, 128, 568, 520, bg=SURF, r=18)
    cap(s, 676, 150, '이어야 하는 시스템', 'st')
    pills = [(672, 214, '진료 · 처방 기록'), (964, 214, '의료 영상 저장 · 조회'), (672, 522, '진료 대기 · 호출'), (964, 522, '수납 · 무인 접수')]
    lines = ''.join(f'<path d="M932 404 L{x + 114} {y + 36}" stroke="{SOFT}" stroke-width="3" stroke-dasharray="6 8" stroke-linecap="round"></path>' for x, y, _ in pills)
    s.raw(f'<svg style="position: absolute; left: 0; top: 0; overflow: visible" width="1280" height="720" viewBox="0 0 1280 720">{lines}</svg>')
    s.raw(f'<div style="position: absolute; left: 858px; top: 330px; width: 148px; height: 148px; border-radius: 50%; background: {BLUE}; box-shadow: 0 0 0 8px {SURF}"></div>')
    s.t(858, 378, 148, '병원 정보<br>시스템', 20, 800, WHITE, 1.3, name='hub', align='center')
    for i, (x, y, lb) in enumerate(pills):
        s.box(x, y, 228, 72, bg=WHITE, r=16, extra='box-shadow: 0 4px 14px rgba(18,20,23,0.08)')
        s.t(x + 12, y + 24, 204, lb, 18, 800, INK, 1.3, name=f's{i}', align='center', nowrap=True)
    return done(s, CLUSTER, 6, '인증 · 감염 · 시스템', '지켜야 하는 기준 4 + 시스템 연결 그림 4', '의료 기관 인증 · 감염 관리 · 환자 정보 기준과 병원 정보 시스템에 이어야 할 것을 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'md_hospital',
           'title': '안내 화면 · 병동 태블릿 · 병실 공조까지, 병원 전체를 한 공급사에서',
           'areas': [('로비 · 원무', 'p', '스마트 사이니지'), ('진료실', 'p', '모니터'), ('병동 · 간호', 'p', '갤럭시 탭'), ('병실 냉난방', 'p', '무풍 4Way'), ('병실 공기', 'p', 'Infinite AI 공기청정기')],
           'platform': ['병원 안내 · 병동', 'SmartThings Pro', 'VXT CMS'],
           'a': [(1, '대기 화면만'), (1, '의료 모니터'), (1, '전용 단말 고가'), (0, '미지원'), (0, '미지원')],
           'b': [(1, '무인 접수 위주'), (0, '미지원'), (1, '소프트웨어 위주'), (0, '별도 업체'), (0, '별도 업체')]},
 'edge': {'vid': 'md_tertiary', 'msgs': [('화면 크기', '차트와 영상을 크게 보는 화면'), ('무게', '회진 내내 들고 다니는 무게'), ('배터리 용량', '근무 시간 내내 가는 배터리')]},
 'proof': {'title': '병원에서 먼저 검증했습니다', 'cases': ['메드렉스 병원 병상 TV탭', '인천 더드림병원', '성심요양병원']}}

SHEETS = [scale, patient, zone, rule, *compete.sheets(CLUSTER, COMPETE)]
