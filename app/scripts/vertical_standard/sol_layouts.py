# -*- coding: utf-8 -*-
"""04 솔루션 — solution-specific layouts (one per solution, same across verticals). Item slots: i{n}t (title) · i{n}b (body),
band slots: spaces · scene, images: img0.."""
from layouts import *

SOLS = {}  # sid -> (f, item_mode, n_items)


def band(b, x, y, w, h, vertical=False, bg=SURF):
    b.box(x, y, w, h, f'border-radius: 14px; background: {bg};')
    if vertical:
        lab(b, x + 20, y + 16, w - 40, '적용 공간')
        b.text('dense', x + 20, y + 40, w - 40, '공간 · 공간', f'font-weight: 700; color: {INK};', h=44, key='spaces')
        mid = y + 96
        b.box(x + 20, mid, w - 40, 1, f'background: {LINE};')
        lab(b, x + 20, mid + 14, w - 40, '대표 장면')
        b.text('dense', x + 20, mid + 38, w - 40, '장면 설명', f'color: {INK2};', h=h - (mid - y) - 52, key='scene')
    else:
        wl = int(w * 0.34)
        lab(b, x + 20, y + 16, wl - 40, '적용 공간')
        b.text('dense', x + 20, y + 40, wl - 40, '공간 · 공간', f'font-weight: 700; color: {INK};', h=h - 56, key='spaces')
        b.box(x + wl, y + 16, 1, h - 32, f'background: {LINE};')
        lab(b, x + wl + 20, y + 16, w - wl - 40, '대표 장면')
        b.text('dense', x + wl + 20, y + 40, w - wl - 40, '장면 설명', f'color: {INK2};', h=h - 56, key='scene')


def item_text(b, n, x, y, w, th=52, bh=66, trole='heading', brole='dense', tcolor=INK, bcolor=INK2, gap=6, tstyle='', bstyle=''):
    b.text(trole, x, y, w, '항목', f'font-weight: 800; color: {tcolor}; {tstyle}', h=th, key=f'i{n}t')
    b.text(brole, x, y + th + gap, w, '· 기능', f'color: {bcolor}; {bstyle}', h=bh, key=f'i{n}b')


def card(b, n, x, y, w, h, acc=BLUE, icon=None, num=True, bg='#ffffff', border=True, th=52, bh=None, pad=20):
    b.box(x, y, w, h, f'border-radius: 14px; background: {bg};' + (f' border: 1px solid {LINE};' if border else ''))
    ty = y + pad
    if icon:
        b.box(x + pad, ty, 40, 40, f'border-radius: 10px; background: {TINT}; display: flex; align-items: center; justify-content: center;', ICON(icon, acc))
        if num: b.circle(x + w - pad - 26, ty + 7, 26, str(n + 1), bg=acc, fs=12)
        ty += 52
    elif num:
        b.circle(x + pad, ty, 28, str(n + 1), bg=acc, fs=13)
        ty += 40
    bh = bh if bh is not None else (y + h - pad) - (ty + th + 6)
    item_text(b, n, x + pad, ty, w - 2 * pad, th=th, bh=bh)


def ICON(name, color=BLUE, size=22):
    return icon(name, color, size)


def done(b, sid, name, when, mode, n):
    footer(b)
    f = b.f
    SOLS[sid] = (f, mode, n)
    add(b, meta(f, 'VS-' + f[5:].replace('_', '-'), name, when, 'solution', 'scenario', G.format('04 솔루션'), '04 · 솔루션', name, '', ['solutions', 'spaces', 'images'], sols=[sid]))


def H(f):
    b = B(f)
    header(b, '04 · 솔루션', '솔루션 이름 — 핵심 가치', '솔루션 한 줄 요약')
    return b


# 1 SmartThings Pro — dashboard hero (image left, 2×2 cards right)
def l_stp():
    b = H('L_VS_SOL_STP')
    b.img(64, 152, 560, 300, 'ui', 'SmartThings Pro 대시보드', radius=16, bg=SURF, key='img0')
    band(b, 64, 468, 560, 180)
    for n, (x, y) in enumerate([(648, 152), (940, 152), (648, 408), (940, 408)]):
        card(b, n, x, y, 276, 240, icon=['grid', 'clock', 'bolt', 'chart'][n])
    done(b, 's_stp', 'SmartThings Pro · 대시보드 + 기능 4', 'SmartThings Pro 솔루션 장 — 통합 관리 · 자동화 · AI 절약 · 분석 기능과 적용 공간', 'group', 4)


# 2 안전관리 — alert flow (4 steps with chevrons) + watch image + band
def l_safety():
    b = H('L_VS_SOL_SAFETY')
    w = 267
    for n in range(4):
        x = 64 + n * (w + 28)
        card(b, n, x, 152, w, 240, acc='#c2410c' if n == 0 else BLUE, icon=['alert', 'sun', 'pin', 'bell'][n])
        if n < 3:
            b.box(x + w + 2, 260, 24, 24, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=20, c='#c5cde6'))
    b.img(64, 412, 360, 236, 'ui', '워치 위험 알림 화면', radius=16, bg=SURF, key='img0')
    band(b, 440, 412, 776, 236)
    done(b, 's_safety', '안전관리 솔루션 · 감지 → 알림 흐름 4단계', '안전관리 솔루션 장 — 위험 감지부터 긴급 대응까지 흐름과 적용 공간', 'group', 4)


# 3 b.IoT — center image with four cards around
def l_biot():
    b = H('L_VS_SOL_BIOT')
    b.img(448, 152, 384, 300, 'diagram', 'b.IoT 빌딩 통합 관제', radius=16, bg=SURF, key='img0')
    for n, (x, y) in enumerate([(64, 152), (64, 308), (848, 152), (848, 308)]):
        b.box(x, y, 368, 144, f'border-radius: 14px; background: #ffffff; border: 1px solid {LINE};')
        b.circle(x + 18, y + 18, 28, str(n + 1), fs=13)
        item_text(b, n, x + 58, y + 18, 292, th=26, bh=80, tstyle='white-space: nowrap; overflow: hidden; text-overflow: ellipsis;')
    for (x1, y1) in [(432, 224), (432, 380), (832, 224), (832, 380)]:
        b.box(x1, y1, 16, 2, f'background: {DASH};')
    band(b, 64, 476, 1152, 172)
    done(b, 's_biot', 'b.IoT · 관제 화면 가운데 + 기능 4 (십자 배치)', 'b.IoT 솔루션 장 — 공조 · 에너지 · 설비 · 관제를 한 화면에, 적용 공간과 장면', 'group', 4)


# 4 DMS 2.5 — rows list + device image + vertical band
def l_dms():
    b = H('L_VS_SOL_DMS')
    for n in range(5):
        y = 152 + n * 101
        b.box(64, y, 720, 92, f'border-radius: 12px; background: {"#ffffff" if n % 2 else SURF}; border: 1px solid {LINE};')
        b.circle(84, y + 32, 28, str(n + 1), fs=13)
        b.text('heading', 128, y + 32, 210, '항목', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=26, key=f'i{n}t')
        b.text('dense', 352, y + 14, 414, '· 기능', f'color: {INK2};', h=66, key=f'i{n}b')
    b.img(808, 152, 408, 236, 'cut', 'DMS 2.5 중앙 제어기', radius=16, bg=SURF, fit='contain', pad=16, key='img0')
    band(b, 808, 404, 408, 244, vertical=True)
    done(b, 's_dms', 'DMS 2.5 · 기능 5행 + 제어기 사진', 'DMS 2.5 솔루션 장 — 제어 · 피크 · 요금 분배 · 스케줄 기능과 적용 공간', 'group', 5)


# 5 터치 중앙 제어기 — tinted tiles left + tall controller photo right
def l_touch():
    b = H('L_VS_SOL_TOUCH')
    for n, (x, y) in enumerate([(64, 152), (382, 152), (64, 330), (382, 330)]):
        b.box(x, y, 306, 166, f'border-radius: 14px; background: {TINT};')
        b.text('metric', x + 20, y + 14, 80, f'0{n + 1}', f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap;', h=48, label=True)
        item_text(b, n, x + 20, y + 68, 266, th=26, bh=44, tstyle='white-space: nowrap; overflow: hidden; text-overflow: ellipsis;')
    band(b, 64, 512, 624, 136)
    b.img(712, 152, 504, 496, 'photo', '벽에 설치한 터치 중앙 제어기', radius=16, bg=SURF, key='img0')
    done(b, 's_touch', '터치 중앙 제어기 · 숫자 타일 4 + 설치 사진', '터치 중앙 제어기 솔루션 장 — 제어 · 스케줄 · 센서 · 알람 기능과 적용 공간', 'group', 4)


# 6 Wi-Fi KIT — app image center, 3 features each side
def l_wifi():
    b = H('L_VS_SOL_WIFI')
    b.img(464, 152, 352, 336, 'ui', '스마트싱스 앱 원격 제어', radius=16, bg=SURF, fit='contain', pad=12, key='img0')
    for n in range(6):
        left = n < 3
        x = 64 if left else 840
        y = 152 + (n % 3) * 116
        b.box(x, y, 376, 104, f'border-radius: 14px; background: #ffffff; border: 1px solid {LINE};')
        b.box(x + (376 if left else -2), y + 51, 22, 2, f'background: {DASH};')
        b.circle(x + 18, y + 18, 26, str(n + 1), fs=12)
        b.text('heading', x + 54, y + 16, 304, '기능', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=26, key=f'i{n}t')
        b.text('dense', x + 54, y + 48, 304, '설명', f'color: {INK2};', h=44, key=f'i{n}b')
    band(b, 64, 512, 1152, 136)
    done(b, 's_wifi', 'Wi-Fi KIT · 앱 화면 가운데 + 기능 6', 'Wi-Fi KIT 솔루션 장 — 앱 원격 제어 · 스마트 편의 기능과 적용 공간', 'feature', 6)


# 7 스마트싱스 홈 — wide banner + five columns
def l_sthome():
    b = H('L_VS_SOL_STHOME')
    b.img(64, 152, 1152, 176, 'photo', '세대 · 단지 스마트싱스 앱', radius=16, key='img0')
    w = (1152 - 4 * 16) / 5
    for n in range(5):
        x = round(64 + n * (w + 16))
        b.box(x, 344, round(w), 192, f'border-radius: 14px; background: #ffffff; border: 1px solid {LINE}; border-top: 4px solid {BLUE};')
        b.text('label', x + 18, 360, 60, f'0{n + 1}', f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap;', h=19, label=True)
        item_text(b, n, x + 18, 384, round(w) - 36, th=52, bh=88)
    band(b, 64, 552, 1152, 96)
    done(b, 's_sthome', '스마트싱스 홈 · 배너 사진 + 기능 5열', '스마트싱스 홈 솔루션 장 — 세대 통합 제어 · 자동화 · 에너지 · 가전 케어와 적용 공간', 'group', 5)


# 8 VXT — three-step flow with an image per step
def l_vxt():
    b = H('L_VS_SOL_VXT')
    w = 352
    for n in range(3):
        x = 64 + n * (w + 48)
        b.img(x, 152, w, 216, 'ui', ['콘텐츠 제작 화면', '콘텐츠 운영 화면', '원격 관리 화면'][n], radius=14, bg=SURF, key=f'img{n}')
        b.box(x + 14, 166, 40, 26, f'border-radius: 13px; background: {BLUE};')
        b.text('label', x + 14, 169, 40, f'0{n + 1}', f'font-family: {MAN}; font-weight: 800; color: #ffffff; text-align: center; white-space: nowrap;', h=19, label=True)
        item_text(b, n, x, 384, w, th=26, bh=110, tstyle=f'color: {BLUE};')
        if n < 2:
            b.box(x + w + 12, 248, 24, 24, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=22, c='#c5cde6'))
    band(b, 64, 528, 1152, 120)
    done(b, 's_vxt', 'VXT CMS · 3단계 흐름(제작 → 운영 → 관리) + 화면 3', 'VXT CMS 솔루션 장 — 클라우드 사이니지 콘텐츠 제작 · 운영 · 원격 관리와 적용 공간', 'group', 3)


# 9 MagicINFO — tall photo + stacked layer bars
def l_magic():
    b = H('L_VS_SOL_MAGIC')
    b.img(64, 152, 432, 496, 'photo', 'MagicINFO 사이니지 운영', radius=16, key='img0')
    for n in range(4):
        y = 152 + n * 96
        b.box(520, y, 696, 86, f'border-radius: 12px; background: {"#ffffff" if n % 2 else TINT}; border: 1px solid {LINE};')
        b.box(520, y, 6, 86, f'border-radius: 12px 0 0 12px; background: {BLUE};')
        b.text('utility', 542, y + 14, 60, f'0{n + 1}', f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap;', h=19, label=True)
        b.text('heading', 542, y + 38, 210, '항목', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=26, key=f'i{n}t')
        b.text('dense', 770, y + 10, 428, '· 기능', f'color: {INK2};', h=66, key=f'i{n}b')
    band(b, 520, 542, 696, 106)
    done(b, 's_magic', 'MagicINFO · 세로 사진 + 레이어 4단', 'MagicINFO 솔루션 장 — 제작 · 스케줄 · 데이터 연동 · 원격 관리 · 분석 레이어와 적용 공간', 'group', 4)


# 10 LYNK Cloud — hero photo + three cards + vertical band
def l_lynk():
    b = H('L_VS_SOL_LYNK')
    b.img(64, 152, 1152, 248, 'photo', '객실 TV 웰컴 화면', radius=16, key='img0')
    w = 245
    for n in range(3):
        x = 64 + n * (w + 16)
        card(b, n, x, 416, w, 232, icon=['tv', 'remote', 'user'][n])
    band(b, 848, 416, 368, 232, vertical=True)
    done(b, 's_lynk', 'LYNK Cloud · 히어로 사진 + 기능 3', 'LYNK Cloud 솔루션 장 — 객실 TV 콘텐츠 · 기기 관리 · 게스트 서비스와 적용 공간', 'group', 3)


# 11 Knox — stacked shield layers + image + band
def l_knox():
    b = H('L_VS_SOL_KNOX')
    for n in range(5):
        x = 64 + 18 * n
        w = 700 - 36 * n
        y = 152 + n * 100
        b.box(x, y, w, 88, f'border-radius: 14px; background: {["#0f1d6b", "#14289f", "#2c43b8", "#5068cc", "#7d90dc"][n]};')
        b.box(x + 18, y + 24, 40, 40, 'border-radius: 10px; background: rgba(255,255,255,.16); display: flex; align-items: center; justify-content: center;', icon(['shield', 'layers', 'monitor', 'scan', 'lock'][n], '#ffffff', 22))
        b.text('heading', x + 72, y + 14, 210, '항목', 'font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=26, key=f'i{n}t')
        b.text('dense', x + 72, y + 44, w - 92, '· 기능', 'color: rgba(255,255,255,.88); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'i{n}b')
    b.img(784, 152, 432, 260, 'photo', 'Knox 업무 기기', radius=16, bg=SURF, key='img0')
    band(b, 784, 428, 432, 220, vertical=True)
    done(b, 's_knox', 'Knox · 보안 레이어 5단 + 사진', 'Knox 솔루션 장 — 보안 · 도입 · 관리 · 운영 · 현장 업무 레이어와 적용 공간', 'group', 5)


# 12 삼성헬스 — watch image + data chips + two cards
def l_health():
    b = H('L_VS_SOL_HEALTH')
    b.img(64, 152, 400, 496, 'cut', '갤럭시 워치 건강 데이터', radius=16, bg=SURF, fit='contain', pad=24, key='img0')
    lab(b, 488, 152, 400, '건강 데이터')
    for n in range(5):
        x = 488 + (n % 3) * 248
        y = 180 + (n // 3) * 56
        b.box(x, y, 236, 44, f'border-radius: 22px; background: {TINT};')
        b.box(x + 14, y + 12, 20, 20, 'display: flex;', icon('heart', BLUE, 20))
        b.text('dense', x + 42, y + 11, 182, '데이터', f'font-weight: 700; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'c{n}')
    for n in range(2):
        x = 488 + n * 372
        card(b, n, x, 304, 356, 196, icon=['link', 'user'][n], num=False)
    band(b, 488, 516, 728, 132)
    done(b, 's_health', '삼성헬스 · 워치 사진 + 데이터 칩 5 + 기능 2', '삼성헬스 솔루션 장 — 워치 건강 데이터 · SDK · 활용 프로그램과 적용 공간', 'group', 2)


# 13 갤럭시 클래스룸 — classroom photo + checklist
def l_class():
    b = H('L_VS_SOL_CLASS')
    b.img(64, 152, 520, 330, 'photo', '교실 수업 장면', radius=16, key='img0')
    band(b, 64, 498, 520, 150)
    for n in range(5):
        y = 152 + n * 101
        b.box(608, y, 608, 91, f'border-radius: 12px; background: #ffffff; border: 1px solid {LINE};')
        b.box(628, y + 26, 36, 36, f'border-radius: 50%; background: {TINT}; display: flex; align-items: center; justify-content: center;', CHECK.format(c=BLUE))
        b.text('heading', 680, y + 14, 516, '기능', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=26, key=f'i{n}t')
        b.text('dense', 680, y + 46, 516, '설명', f'color: {INK2}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'i{n}b')
    done(b, 's_class', '갤럭시 클래스룸 · 교실 사진 + 체크리스트 5', '갤럭시 클래스룸 솔루션 장 — 수업 관리 · 기기 관리 기능 다섯과 적용 공간', 'feature', 5)


# 14 갤럭시 북 EE — timeline pills + image + three cards
def l_bookee():
    b = H('L_VS_SOL_BOOKEE')
    steps = ['주문 · 사양 확정', '출고 전 사전 구성', '배송 · 설치', '받자마자 업무']
    w = (1152 - 3 * 28) / 4
    for n, t in enumerate(steps):
        x = round(64 + n * (w + 28))
        b.box(x, 152, round(w), 48, f'border-radius: 24px; background: {BLUE if n == 1 else TINT};')
        b.text('dense', x, 165, round(w), t, f'font-weight: 800; color: {"#ffffff" if n == 1 else BLUE}; text-align: center; white-space: nowrap;', h=22, label=True)
        if n < 3:
            b.box(x + round(w) + 2, 164, 24, 24, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=20, c='#c5cde6'))
    b.img(64, 220, 400, 260, 'cut', '갤럭시 북 엔터프라이즈 에디션', radius=16, bg=SURF, fit='contain', pad=20, key='img0')
    for n in range(3):
        x = 488 + n * 248
        card(b, n, x, 220, 232, 260, icon=['doc', 'shield', 'monitor'][n])
    band(b, 64, 496, 1152, 152)
    done(b, 's_bookee', '갤럭시 북 EE · 출고 타임라인 + 기능 3', '갤럭시 북 엔터프라이즈 에디션 장 — 사전 구성 · 하드웨어 보안 · 원격 관리와 적용 공간', 'group', 3)


# 15 삼성 DeX — before / after cards
def l_dex():
    b = H('L_VS_SOL_DEX')
    for n in range(2):
        x = 64 + n * 604
        b.box(x, 152, 548, 340, f'border-radius: 16px; background: #ffffff; border: 1px solid {LINE};')
        b.img(x + 16, 168, 516, 200, 'photo', ['휴대폰 · 태블릿', '모니터 · 회의실 대화면'][n], radius=12, bg=SURF, key=f'img{n}')
        item_text(b, n, x + 24, 384, 500, th=26, bh=66)
    b.box(616, 300, 48, 48, f'border-radius: 50%; background: {BLUE}; display: flex; align-items: center; justify-content: center;', CHEV.format(s=24, c='#ffffff'))
    band(b, 64, 508, 1152, 140)
    done(b, 's_dex', '삼성 DeX · 연결 전 → 연결 후 카드 2', '삼성 DeX 장 — 휴대폰을 PC처럼 · 회의실 대화면 연결과 적용 공간', 'feature', 2)


# 16 CounThru — four KPI tiles + diagram + band
def l_counthru():
    b = H('L_VS_SOL_COUNTHRU')
    w = (1152 - 3 * 16) / 4
    for n in range(4):
        x = round(64 + n * (w + 16))
        b.box(x, 152, round(w), 192, f'border-radius: 14px; background: {SURF};')
        b.text('metric', x + 20, 166, 90, f'0{n + 1}', f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap;', h=48, label=True)
        item_text(b, n, x + 20, 220, round(w) - 40, th=26, bh=88, tstyle='white-space: nowrap; overflow: hidden; text-overflow: ellipsis;')
    b.img(64, 360, 560, 288, 'diagram', '통합 출력 관리 구성도', radius=16, bg=SURF, fit='contain', pad=8, key='img0')
    band(b, 648, 360, 568, 288, vertical=True)
    done(b, 's_counthru', 'CounThru · 기능 타일 4 + 구성도', 'CounThru 솔루션 장 — 출력기 · 장애 · 소모품 · 과금 관리와 적용 공간', 'group', 4)


# 17 SecuThru — three lock columns + image + band
def l_secuthru():
    b = H('L_VS_SOL_SECUTHRU')
    w = 245
    for n in range(3):
        x = 64 + n * (w + 16)
        b.box(x, 152, w, 288, f'border-radius: 14px; background: #ffffff; border: 1px solid {LINE};')
        b.box(x + w / 2 - 32, 172, 64, 64, f'border-radius: 50%; background: {BLUE}; display: flex; align-items: center; justify-content: center;', icon(['user', 'doc', 'lock'][n], '#ffffff', 28))
        b.text('heading', x + 18, 252, w - 36, '항목', f'font-weight: 800; color: {INK}; text-align: center;', h=52, key=f'i{n}t')
        b.text('dense', x + 18, 312, w - 36, '· 기능', f'color: {INK2}; text-align: center;', h=110, key=f'i{n}b')
    b.img(856, 152, 360, 288, 'photo', '사원증 인증 복합기', radius=16, bg=SURF, key='img0')
    band(b, 64, 456, 1152, 192)
    done(b, 's_secuthru', 'SecuThru · 보안 3단 아이콘 열 + 사진', 'SecuThru 솔루션 장 — 인증 · 출력물 실명제 · 개인정보 검출과 적용 공간', 'group', 3)


# 18 갤럭시 탭 POS — two photo cards
def l_pos():
    b = H('L_VS_SOL_POS')
    for n in range(2):
        x = 64 + n * 592
        b.box(x, 152, 560, 380, f'border-radius: 16px; background: #ffffff; border: 1px solid {LINE};')
        b.img(x, 152, 560, 236, 'photo', ['카운터 POS 결제', '테이블 오더'][n], radius=16, key=f'img{n}')
        b.circle(x + 20, 404, 30, str(n + 1), fs=14)
        b.text('subheading', x + 62, 406, 478, '기능', f'font-weight: 800; color: {INK};', h=30, key=f'i{n}t')
        b.text('body', x + 20, 448, 520, '설명', f'color: {INK2};', h=75, key=f'i{n}b')
    band(b, 64, 548, 1152, 100)
    done(b, 's_pos', '갤럭시 탭 POS · 사진 카드 2 (결제 · 테이블 오더)', '갤럭시 탭 POS · 테이블 오더 장 — 카운터 결제와 테이블 주문, 적용 공간', 'feature', 2)


# 19 병원 안내 · 업무 — banner + patient journey steps
def l_hospital():
    b = H('L_VS_SOL_HOSPITAL')
    b.img(64, 152, 1152, 170, 'photo', '병원 대기 안내 사이니지', radius=16, key='img0')
    w = (1152 - 3 * 28) / 4
    for n in range(4):
        x = round(64 + n * (w + 28))
        b.box(x, 338, round(w), 202, f'border-radius: 14px; background: #ffffff; border: 1px solid {LINE}; border-top: 4px solid {BLUE};')
        b.text('utility', x + 18, 354, 120, f'0{n + 1}', f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap;', h=19, label=True)
        item_text(b, n, x + 18, 378, round(w) - 36, th=52, bh=88)
        if n < 3:
            b.box(x + round(w) + 2, 427, 24, 24, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=20, c='#c5cde6'))
    band(b, 64, 556, 1152, 92)
    done(b, 's_hospital', '병원 안내 · 업무 솔루션 · 배너 + 환자 여정 4단계', '병원 안내 · 업무 솔루션 장 — 대기 · 안내 · 원무 · 병동 흐름과 적용 공간', 'feature', 4)


# 20 현장 업무 — photo + three icon columns + band
def l_field():
    b = H('L_VS_SOL_FIELD')
    b.img(64, 152, 400, 300, 'photo', '현장 바코드 스캔', radius=16, key='img0')
    for n in range(3):
        x = 488 + n * 248
        b.box(x, 152, 232, 300, f'border-radius: 14px; background: {SURF};')
        b.box(x + 20, 172, 52, 52, f'border-radius: 14px; background: {BLUE}; display: flex; align-items: center; justify-content: center;', icon(['scan', 'chat', 'clock'][n], '#ffffff', 26))
        item_text(b, n, x + 20, 240, 192, th=52, bh=132)
    band(b, 64, 468, 1152, 180)
    done(b, 's_field', '현장 업무 솔루션 · 사진 + 아이콘 열 3', '현장 업무 솔루션 장 — 스캔 · 현장 커뮤니케이션 · 워치 현장 관리와 적용 공간', 'group', 3)


# 21 회의실 예약 — tall door photo + vertical steps + band
def l_meeting():
    b = H('L_VS_SOL_MEETING')
    b.img(64, 152, 456, 496, 'photo', '회의실 앞 예약 태블릿', radius=16, key='img0')
    for n in range(4):
        y = 152 + n * 84
        b.circle(544, y + 14, 36, str(n + 1), fs=15)
        if n < 3: b.box(561, y + 52, 2, 46, f'background: {DASH};')
        b.text('heading', 596, y + 8, 620, '단계', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=26, key=f'i{n}t')
        b.text('dense', 596, y + 38, 620, '설명', f'color: {INK2}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'i{n}b')
    band(b, 544, 492, 672, 156)
    done(b, 's_meeting', '회의실 예약 솔루션 · 문 앞 태블릿 사진 + 세로 단계 4', '회의실 예약 솔루션 장 — 예약 현황 · 즉석 예약 · 체크인 · 사용 분석과 적용 공간', 'feature', 4)


# 22 삼성케어플러스 SAC — care cycle (four cards around a round photo)
def l_svcsac():
    b = H('L_VS_SOL_SVCSAC')
    b.box(520, 160, 240, 240, f'border-radius: 50%; border: 10px solid {TINT};')
    b.img(536, 176, 208, 208, 'photo', '시스템에어컨 점검 엔지니어', radius=104, key='img0')
    b.text('dense', 520, 416, 240, '연중 공조 케어', f'font-weight: 800; color: {BLUE}; text-align: center; white-space: nowrap;', h=22, label=True)
    for n, (x, y) in enumerate([(64, 152), (64, 344), (784, 152), (784, 344)]):
        card(b, n, x, y, 432, 176, icon=['calendar', 'bolt', 'air', 'chart'][n])
    band(b, 64, 536, 1152, 112)
    done(b, 'svc_sac', '삼성케어플러스 SAC · 케어 순환 4 + 원형 사진', '시스템에어컨 케어 서비스 장 — 정기점검 · 출동 · 세척 · 원격케어와 적용 공간', 'feature', 4)


# 23 삼성케어플러스 비즈니스 — image + three benefit rows
def l_svcmobile():
    b = H('L_VS_SOL_SVCMOBILE')
    b.img(64, 152, 400, 260, 'photo', '업무 기기 수리 · 보증', radius=16, key='img0')
    band(b, 64, 428, 400, 220, vertical=True)
    for n in range(3):
        y = 152 + n * 168
        b.box(488, y, 728, 160, f'border-radius: 14px; background: #ffffff; border: 1px solid {LINE};')
        b.text('display', 512, y + 40, 90, f'0{n + 1}', f'font-family: {MAN}; font-weight: 800; color: {TINT}; white-space: nowrap; -webkit-text-stroke: 1px {BLUE};', h=64, label=True)
        item_text(b, n, 620, y + 28, 572, th=26, bh=72, trole='subheading')
    done(b, 'svc_mobile', '삼성케어플러스 비즈니스 · 사진 + 혜택 3행', '모바일 보증연장 서비스 장 — 보증 연장 · 무상수리 · 수리 이력 관리와 적용 공간', 'feature', 3)


def build_all():
    for fn in [l_stp, l_safety, l_biot, l_dms, l_touch, l_wifi, l_sthome, l_vxt, l_magic, l_lynk, l_knox, l_health, l_class,
               l_bookee, l_dex, l_counthru, l_secuthru, l_pos, l_hospital, l_field, l_meeting, l_svcsac, l_svcmobile]:
        fn()
