# 당사의 이해 · 금융 — 영업망 · 점포 유형 → 내점 고객 여정 → 디지털 전환 → 보안 · 규제
from kit import *
import compete

CLUSTER = dict(id='FN', name='금융', cust='은행 영업점', ai='AI 브랜치', verticals=['fn_bank', 'fn_hq'],
               goal='영업망과 점포 유형, 번호표를 뽑고 일을 마치기까지의 여정, 창구에서 디지털로 옮겨 가는 속도, 금융이라서 지켜야 하는 보안 · 규제를 먼저 짚는다')


def branch():
    s = sheet('L_TOC_UA_FN_BRANCH', '영업망 · 점포 유형', '어떤 점포를 몇 곳 운영하는지')
    s.box(64, 128, 1152, 148, bg=BLUE, r=18)
    s.ico(96, 166, 'bank', size=72, r=20, bg=GLASS, color=WHITE)
    s.t(192, 156, 300, '전국 영업점', 18, 700, W88, 1.3, name='tl', nowrap=True)
    numu(s, 192, 190, 300, Z, '곳', 56, 24, color=WHITE, ucolor=W88, name='tv')
    for k, (lb, un) in enumerate([('하루 내점 고객', '명'), ('창구 직원', '명')]):
        x = 600 + k * 320
        s.vline(x - 40, 156, 92, color='rgba(255,255,255,0.25)')
        s.t(x, 156, 260, lb, 18, 700, W88, 1.3, name=f'a{k}l', nowrap=True)
        numu(s, x, 198, 260, Z, un, 40, 18, color=WHITE, ucolor=W88, name=f'a{k}')
    for i, (nm, ic) in enumerate([('일반 영업점', 'bank'), ('기업 · 복합 점포', 'building'), ('자산 관리 센터', 'star'), ('디지털 · 무인 점포', 'device')]):
        x = 64 + i * 294
        s.box(x, 300, 270, 348, bg=WHITE, r=18, border=f'1px solid {LINE}')
        s.ico(x + 24, 324, ic, size=64, r=18)
        s.t(x + 24, 410, 222, nm, 24, 800, INK, 1.3, name=f'k{i}', nowrap=True)
        numu(s, x + 24, 468, 222, Z, '곳', 48, 20, name=f'kv{i}')
        s.hline(x + 24, 548, 222)
        for j, (lb, un) in enumerate([('창구', '개'), ('대기석', '석')]):
            y = 566 + j * 34
            s.t(x + 24, y, 100, lb, 16, 700, GRAY, 1.3, nowrap=True)
            s.t(x + 126, y - 2, 120, Z + un, 18, 800, INK2, 1.3, name=f'k{i}_{j}', align='right', extra=NUM)
    return done(s, CLUSTER, 3, '영업망 · 점포 유형', '대표 숫자 3 + 점포 유형 4', '영업점 수 · 하루 내점 고객과 점포 유형별 수 · 창구 · 대기석을 짚을 때')


def visit():
    s = sheet('L_TOC_UA_FN_VISIT', '내점 고객 여정', '번호표를 뽑고 일을 마치기까지')
    s.box(64, 128, 300, 520, bg=WHITE, r=18, border=f'2px dashed {SOFT}')
    s.t(64, 160, 300, '대기 번호', 18, 800, MUTE, 1.3, name='tk', align='center')
    s.t(64, 196, 300, '000', 56, 800, BLUE, 1.15, name='tn', align='center', extra=NUM + '; letter-spacing: 0.04em')
    s.raw(f'<div style="position: absolute; left: 96px; top: 290px; width: 236px; height: 0; border-top: 2px dashed {SOFT}"></div>')
    for j, (lb, un) in enumerate([('앞에 기다리는 손님', '명'), ('예상 대기 시간', '분'), ('열려 있는 창구', '개')]):
        y = 316 + j * 106
        small(s, 96, y, lb, MUTE, 236)
        numu(s, 96, y + 26, 236, Z, un, 40, 18, name=f't{j}')
    for i, (nm, ic) in enumerate([('번호표 뽑기', 'scan'), ('객장 대기', 'clock'), ('창구 상담', 'chat'), ('서류 · 서명', 'sign'), ('자동화 기기', 'device')]):
        x = 388 + i * 169.5
        s.box(x, 128, 150, 250, bg=SURF, r=18)
        s.num2(x + 16, 144, i + 1, 32, 14)
        s.ico(x + 86, 140, ic, size=48, r=14, bg=WHITE)
        s.t(x + 16, 208, 118, nm, 18, 800, INK, 1.35, name=f'n{i}', clamp=2)
        small(s, x + 16, 290, '걸리는 시간', MUTE, 118)
        numu(s, x + 16, 316, 118, Z, '분', 32, 16, name=f'm{i}')
        if i < 4: s.arrow(x + 150, 244, 18, DASH)
    s.box(388, 394, 828, 254, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 416, 414, '창구 구성', 'ct')
    for i, (lb, fr) in enumerate([('빠른 창구 · 입출금', 0.75), ('상담 창구 · 대출 · 상품', 0.5), ('기업 창구', 0.25)]):
        y = 466 + i * 58
        s.t(416, y, 270, lb, 18, 700, INK, 1.3, name=f'c{i}', nowrap=True)
        hbar(s, 700, y + 6, 380, fr, 14, track=SURF)
        s.t(1092, y - 2, 100, Z + '개', 20, 800, BLUE, 1.3, name=f'cv{i}', align='right', extra=NUM)
    return done(s, CLUSTER, 4, '내점 고객 여정', '번호표 + 여정 5 단계 + 창구 구성 막대 3', '번호표 발권부터 자동화 기기까지 걸리는 시간과 창구 구성을 짚을 때')


def shift():
    s = sheet('L_TOC_UA_FN_SHIFT', '디지털 전환', '창구에서 디지털로, 얼마나 빨리 옮겨 가는지')
    s.box(64, 128, 680, 520, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 150, '거래가 이뤄지는 곳', 'ct')
    for k, (lb, col) in enumerate([('창구 · 대면', C1), ('앱 · 비대면', SOFT)]):
        s.box(472 + k * 128, 155, 16, 16, bg=col, r=5)
        s.t(494 + k * 128, 150, 100, lb, 14, 800, GRAY, 1.3, name=f'lg{k}', nowrap=True)
    for j, (lb, a) in enumerate([('지금', 0.35), ('3년 뒤', 0.2)]):
        y = 206 + j * 104
        s.t(92, y + 18, 110, lb, 24, 800, INK, 1.3, name=f'y{j}', nowrap=True)
        segbar(s, 212, y, 504, 68, [a, 1 - a], [C1, SOFT], r=16)
        s.t(228, y + 22, 80, Z + '%', 18, 800, WHITE, 1.3, name=f'a{j}', extra=NUM)
        s.t(212 + 504 * a + 16, y + 22, 100, Z + '%', 18, 800, INK2, 1.3, name=f'b{j}', extra=NUM)
    s.box(92, 432, 624, 188, bg=TINT, r=16)
    for k, (lb, un) in enumerate([('3년 동안 줄어드는 창구 거래', '%'), ('늘어나는 디지털 기기', '대')]):
        x = 116 + k * 312
        s.t(x, 458, 280, lb, 18, 800, BLUE, 1.3, name=f'd{k}', nowrap=True)
        numu(s, x, 516, 280, Z, un, 56, 20, name=f'dv{k}')
    for i, (lb, ic) in enumerate([('합치거나 닫는 점포', 'swap'), ('디지털 라운지로 바꾸는 점포', 'device'), ('새로 여는 점포', 'store')]):
        y = 128 + i * 179
        s.box(768, y, 448, 162, bg=SURF, r=18)
        s.ico(792, y + 53, ic, size=56, r=16, bg=WHITE)
        s.t(868, y + 28, 324, lb, 18, 800, INK2, 1.3, name=f'p{i}', nowrap=True)
        numu(s, 868, y + 68, 324, Z, '곳', 56, 20, name=f'pv{i}')
    return done(s, CLUSTER, 5, '디지털 전환', '대면 · 비대면 띠 2(지금 · 3년 뒤) + 숫자 5', '창구 거래가 디지털로 옮겨 가는 속도와 점포를 합치고 바꾸는 계획을 짚을 때')


def secure():
    s = sheet('L_TOC_UA_FN_SECURE', '보안 · 규제', '금융이라서 지켜야 하는 보안과 규제')
    data = [('lock', '업무망 · 인터넷망 분리', '이을 수 있는 망 확인'), ('eye', '고객 정보 화면 노출', '옆에서 보이지 않는 화면'), ('camera', '영상 기록 · 보관', f'보관 기간 {Z}일'),
            ('doc', '전자 금융 감독 기준', '기기 반입 전 심사'), ('person', '장애인 · 고령자 접근성', '낮은 창구 · 큰 글씨'), ('clock', '멈추지 않는 구역', f'24시간 가동 {Z}곳')]
    for i, (ic, nm, tg) in enumerate(data):
        x = 64 + (i % 2) * 588; y = 128 + (i // 2) * 180
        s.box(x, y, 564, 160, bg=SURF, r=18)
        s.ico(x + 28, y + 44, ic, size=72, r=20, bg=BLUE, color=WHITE)
        s.t(x + 124, y + 44, 420, nm, 24, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        s.t(x + 124, y + 90, 420, tg, 18, 800, BLUE, 1.3, name=f't{i}', nowrap=True)
    return done(s, CLUSTER, 6, '보안 · 규제', '지켜야 하는 기준 6칸', '망 분리 · 화면 노출 · 영상 보관 · 감독 기준 · 접근성 · 무중단 구역을 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'fn_bank',
           'title': '객장 화면 · 창구 태블릿 · 출력까지, 점포 전체를 한 공급사에서',
           'areas': [('객장 안내', 'p', '스마트 사이니지'), ('무인 · 자동화 존', 'p', '키오스크'), ('창구', 'p', '갤럭시 탭'), ('상담 · 사무', 'p', '모니터'), ('출력 · 문서', 'p', '디지털 복합기')],
           'platform': ['Knox', 'MagicINFO', 'CounThru'],
           'a': [(0, '수동 편성'), (0, '미지원'), (0, '서명 패드 별도'), (1, '모니터'), (1, '일반 출력')],
           'b': [(0, '대기 번호만'), (1, '전용 단말'), (1, '전용 단말'), (0, '미지원'), (0, '미지원')]},
 'edge': {'vid': 'fn_hq', 'msgs': [('제품 사용 시간', '상황판처럼 24시간 켜 두는 화면'), ('밝기', '밝은 객장에서도 또렷한 안내'), ('해상도', '여러 대를 이을수록 커지는 풀 HD 화면')]},
 'proof': {'title': '은행에서 먼저 검증했습니다', 'cases': ['KB국민은행 InsighT 지점', 'KEB하나은행', 'NH농협은행']}}

SHEETS = [branch, visit, shift, secure, *compete.sheets(CLUSTER, COMPETE)]
