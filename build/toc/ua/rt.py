# 당사의 이해 · 리테일 · 서비스 매장 — 점포 포맷 → 고객 동선 → 판촉 · 진열 교체 → 운영 시간 · 인력
from kit import *
import compete

CLUSTER = dict(id='RT', name='리테일 · 서비스 매장', cust='대형마트·SSM', ai='AI 마트',
               verticals=['rt_mall', 'rt_hyper', 'rt_flag', 'rt_small', 'sv_unmanned', 'sv_screen', 'sv_laundry', 'sv_beauty', 'oe_telco'],
               goal='점포 포맷과 점포 수, 손님이 움직이는 길과 머무는 시간, 판촉 · 진열이 바뀌는 방식, 하루 운영 시간과 인력을 먼저 짚는다')


def fmt():
    s = sheet('L_TOC_UA_RT_FORMAT', '점포 포맷', '어떤 크기의 점포를 몇 곳 운영하는지')
    for i, (nm, h, col) in enumerate([('대형점', 240, C1), ('중형점', 176, C2), ('소형점', 116, C3), ('무인점', 68, C4)]):
        x = 64 + i * 296
        s.t(x, 416 - h - 44, 264, nm, 24, 800, INK, 1.3, name=f'k{i}', nowrap=True)
        s.box(x, 416 - h, 264, h, bg=col, extra='border-radius: 18px 18px 0 0')
        s.raw(f'<div style="position: absolute; left: {x + 24}px; top: {416 - h + (h - 32) / 2:.0f}px">' + svg_icon('store', 32, WHITE if i < 2 else BLUE, 2) + '</div>')
        for j, (lb, un) in enumerate([('점포 수', '곳'), ('평균 면적', '㎡'), ('화면 수', '대')]):
            y = 440 + j * 70
            if j: s.hline(x, y - 10, 264)
            s.t(x, y + 12, 110, lb, 16, 700, GRAY, 1.3, nowrap=True)
            numu(s, x + 104, y + 4, 160, Z, un, 32, 16, name=f'v{i}_{j}', align='right')
    s.hline(64, 416, 1152, color=DASH, t=2)
    return done(s, CLUSTER, 3, '점포 포맷', '크기별 포맷 4 × 숫자 3', '점포를 크기 · 포맷으로 나눠 점포 수 · 면적 · 화면 수를 견줄 때')


def path():
    s = sheet('L_TOC_UA_RT_PATH', '고객 동선', '손님이 들어와 나갈 때까지, 어디에 얼마나 머무는지')
    s.raw(f'<svg style="position: absolute; left: 0; top: 0; overflow: visible" width="1280" height="400" viewBox="0 0 1280 400">'
          f'<path d="M168 214 C 256 214, 316 274, 404 274 S 552 214, 640 214 S 788 274, 876 274 S 1024 214, 1112 214" fill="none" stroke="{SOFT}" stroke-width="6" stroke-dasharray="2 14" stroke-linecap="round"></path></svg>')
    steps = [('입구', 'door', '현수막 · 입간판'), ('주동선', 'route', '천장 걸이 행사 배너'), ('진열 · 체험', 'grid', '가격표 · 종이 안내판'), ('계산 · 상담', 'card', '계산대 안내문'), ('출구', 'bag', '쿠폰 · 전단')]
    for i, (nm, ic, now) in enumerate(steps):
        cx = 168 + i * 236; x = cx - 104
        disc(s, cx, 214 if i % 2 == 0 else 274, 84, ic)
        s.t(x, 350, 208, nm, 24, 800, INK, 1.3, name=f'n{i}', align='center', nowrap=True)
        small(s, x, 402, '머무는 시간', MUTE, 208, 'center')
        numu(s, x, 424, 208, Z, '분', 40, 18, name=f'm{i}', align='center')
        s.box(x, 504, 208, 144, bg=SURF, r=16)
        small(s, x + 20, 522, '지금 보이는 것', MUTE, 168)
        s.t(x + 20, 550, 168, now, 18, 700, INK2, 1.45, name=f'w{i}', clamp=3)
    return done(s, CLUSTER, 4, '고객 동선', '동선 마디 5 + 머무는 시간 + 지금 보이는 것', '입구부터 출구까지 손님이 머무는 자리와 그 자리의 지금 안내물을 짚을 때')


def promo():
    s = sheet('L_TOC_UA_RT_PROMO', '판촉 · 진열 교체', '행사와 진열이 얼마나 자주, 누구 손으로 바뀌는지')
    for x, lb in ((88, '바꾸는 것'), (456, '바꾸는 주기'), (676, '맡는 사람'), (936, '지금의 방법')):
        small(s, x, 138, lb, MUTE, 200)
    rows = [('가격표', 'tag', f'주 {Z}회', '점포 직원', '인쇄해서 손으로 교체'), ('행사 안내판 · 배너', 'megaphone', f'월 {Z}회', '본사 마케팅', '인쇄 · 배송 · 설치'),
            ('진열대 · 행사 매대', 'grid', f'분기 {Z}회', '협력사 진열 사원', '사람이 직접 재진열'), ('매장 영상 · 안내 화면', 'monitor', f'월 {Z}회', '본사 · 대행사', '저장 장치로 수동 교체')]
    for r, (nm, ic, cy, who, how) in enumerate(rows):
        y = 172 + r * 119
        s.box(64, y, 1152, 107, bg=SURF, r=18)
        s.ico(88, y + 25, ic, size=56, r=16, bg=WHITE)
        s.t(164, y + 40, 270, nm, 20, 800, INK, 1.3, name=f'n{r}', nowrap=True)
        s.t(456, y + 37, 200, cy, 24, 800, BLUE, 1.3, name=f'c{r}', nowrap=True)
        s.t(676, y + 41, 240, who, 18, 700, INK2, 1.3, name=f'w{r}', nowrap=True)
        s.chip(936, y + 31, how, name=f'h{r}', bg=WHITE, color=INK2, size=16, h=44, pad=18, border=f'1px solid {LINE}', maxw=264)
    return done(s, CLUSTER, 5, '판촉 · 진열 교체', '바꾸는 것 4 × 주기 · 담당 · 방법 표', '가격표 · 행사물 · 진열 · 영상을 누가 얼마나 자주 어떤 방법으로 바꾸는지 짚을 때')


def hours():
    s = sheet('L_TOC_UA_RT_HOURS', '운영 시간 · 인력', '하루를 어떻게 열고 닫는지, 몇 명이 지키는지')
    s.box(64, 128, 1152, 216, bg=WHITE, r=18, border=f'1px solid {LINE}')
    cap(s, 92, 152, '하루 운영 시간표', 'ct')
    s.t(668, 154, 170, '직원이 있는 시간', 16, 700, GRAY, 1.3, name='ol', align='right', nowrap=True)
    numu(s, 848, 146, 110, Z, '시간', 24, 16, name='ov')
    s.t(948, 154, 130, '무인 운영', 16, 700, GRAY, 1.3, name='ul', align='right', nowrap=True)
    numu(s, 1088, 146, 100, Z, '시간', 24, 16, name='uv')
    X0, W = 92, 1096
    for k, (a, b, lb, col, tc) in enumerate([(0, 7, '무인 운영', C4, INK2), (7, 10, '오픈 준비', C2, WHITE), (10, 22, '직원 상주 영업', C1, WHITE), (22, 24, '마감', C2, WHITE)]):
        x = X0 + a / 24 * W; w = (b - a) / 24 * W - 4
        s.box(x, 208, w, 56, bg=col, r=12)
        s.t(x, 225, w, lb, 16, 800, tc, 1.3, name=f'b{k}', align='center', nowrap=True)
    for hh in range(0, 25, 3):
        x, al = (X0, 'left') if hh == 0 else (X0 + W - 64, 'right') if hh == 24 else (X0 + hh / 24 * W - 30, 'center')
        s.t(x, 278, 60, f'{hh}시', 14, 700, GRAY, 1.2, align=al, extra=NUM)
    for i, (nm, ic) in enumerate([('오픈조', 'sun'), ('미들조', 'users'), ('마감조', 'moon')]):
        x = 64 + i * 392
        s.box(x, 360, 368, 288, bg=SURF, r=18)
        s.ico(x + 24, 384, ic, size=56, r=16, bg=WHITE)
        s.t(x + 96, 398, 250, nm, 24, 800, INK, 1.3, name=f's{i}', nowrap=True)
        s.t(x + 24, 468, 320, f'{Z}:{Z} – {Z}:{Z}', 20, 800, GRAY, 1.3, name=f't{i}', nowrap=True, extra=NUM)
        small(s, x + 24, 540, '근무 인원', MUTE, 200)
        numu(s, x + 24, 566, 320, Z, '명', 48, 20, name=f'v{i}')
    return done(s, CLUSTER, 6, '운영 시간 · 인력', '24시간 띠 + 근무조 3', '하루 운영 시간(유인 · 무인)과 근무조별 인원을 짚을 때')



# 경쟁 우위 장 3종(compete.py) — 이 업종의 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위(예시), 대표 제품과 스펙별 메시지, 같은 업종 사례
#   areas: (영역, 'p' 제품 | 's' 솔루션, 이름) · a / b: 경쟁 유형 둘이 영역마다 (맡는가, 한마디) · msgs: (스펙 이름, 메시지[, 값에서 보일 부분[, 보일 이름]])
COMPETE = {'rival': {'rep': 'rt_hyper',
           'title': '화면 · 가격표 · 냉장 설비까지, 매장 전체를 한 공급사에서',
           'areas': [('입구 · 행사 존', 'p', 'The Wall'), ('신선 · 냉장 진열', 'p', '콜드체인 유닛'), ('진열 통로', 'p', 'E Paper'), ('계산대', 'p', '갤럭시 탭'), ('매장 안내 화면', 'p', '스마트 사이니지')],
           'platform': ['VXT CMS', 'MagicINFO', 'b.IoT'],
           'a': [(1, 'LED 위주'), (0, '냉장 설비 미지원'), (0, '가격표 별도'), (0, '단말 별도'), (1, '사이니지')],
           'b': [(1, '소형 LED'), (0, '별도 업체'), (1, '가격표만 연동'), (0, '미지원'), (0, '매장 단위 관리')]},
 'edge': {'vid': 'rt_hyper', 'msgs': [('효율', '하루 종일 도는 냉장 진열, 전기료를 낮추는 효율'), ('정격성능', '신선 식품 진열대를 맡는 냉장 능력'), ('소비전력', '매장 수만큼 쌓이는 전력을 줄이는 소비 전력')]},
 'proof': {'title': '리테일 · 서비스 매장에서 먼저 검증했습니다', 'cases': ['더현대 서울', '룰루레몬 파르나스몰 스토어', '넥슨 메이플 아지트']}}

SHEETS = [fmt, path, promo, hours, *compete.sheets(CLUSTER, COMPETE)]
