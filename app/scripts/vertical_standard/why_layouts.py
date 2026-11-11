# -*- coding: utf-8 -*-
"""06 Why Samsung — identical pages for every vertical standard proposal (content baked in as fixed label slots;
only footer · page number change). Same wording and photos as the hotel AI 스테이 deck, re-laid out without overflow."""
from layouts import *


def nlines(text, px, width):
    """rough wrapped line count (Hangul ≈ 1em, latin ≈ .56em, space ≈ .26em)"""
    n = 0
    for para in str(text).split('\n'):
        cur, lines = 0.0, 1
        for word in para.split(' '):
            ww = sum(px if '가' <= c <= '힣' else (px * .26 if c == ' ' else px * .56) for c in word) + px * .26
            if cur + ww > width and cur > 0: lines += 1; cur = ww
            else: cur += ww
        n += lines
    return n

WHY_IMG = {}  # f -> {img key: src}


def H(f, title, sub):
    b = B(f)
    b.text('label', 64, 44, 1000, '06 · WHY SAMSUNG', f'font-weight: 700; letter-spacing: 0.06em; color: {BLUE}; white-space: nowrap;', h=19, key='eb', label=True)
    b.text('title', 64, 64, 1152, title, f'font-weight: 700; letter-spacing: -0.02em; color: {INK}; white-space: nowrap;', h=40, key='title', label=True)
    b.text('body', 64, 110, 1152, sub, f'color: {GRAY}; white-space: nowrap;', h=25, key='sub', label=True)
    return b


def T(b, role, x, y, w, text, style, h=None):
    return b.text(role, x, y, w, text, style, h=h or round(ROLE[role][0] * ROLE[role][1]), label=True)


def fin(b, name, when, imgs):
    footer(b)
    WHY_IMG[b.f] = imgs
    add(b, meta(b.f, 'VS-' + b.f[5:].replace('_', '-'), name, when, 'why', None, G.format('06 Why Samsung'), '06 · WHY SAMSUNG', name, '', ['images']))


def why1():
    b = H('L_VS_WHY_1', 'Samsung Business', '20년간의 경험과 신뢰를 바탕으로 고객 맞춤형 솔루션과 최적의 프로세스를 제공합니다.')
    b.img(64, 152, 520, 496, 'photo', '삼성전자 사옥', radius=16, key='img0')
    data = [('user', 'People', '비즈니스 고객의 성공을 위해 축적된 노하우와 전문성을 제공합니다.'),
            ('layers', 'Product', '전문 디바이스부터 솔루션과 서비스까지, 비즈니스 고객의 니즈를 한 번에 해결합니다.'),
            ('gear', 'Process', '배송, 설치, 서비스 그리고 유지보수까지 신뢰할 수 있는 프로세스를 제공합니다.'),
            ('shield', 'Brand', '품질과 기술로 입증된 글로벌 브랜드로서 비즈니스의 안정성을 제공합니다.')]
    for n, (ic, t, d) in enumerate(data):
        x, y = 608 + (n % 2) * 312, 152 + (n // 2) * 256
        b.box(x, y, 296, 240, f'border-radius: 16px; background: #ffffff; border: 1px solid {LINE};')
        b.box(x + 22, y + 22, 52, 52, f'border-radius: 12px; background: {TINT}; display: flex; align-items: center; justify-content: center;', icon(ic, BLUE, 24))
        b.circle(x + 248, y + 24, 26, str(n + 1), fs=13)
        T(b, 'title', x + 22, y + 92, 252, t, f'font-family: {MAN}; font-weight: 800; color: {INK}; white-space: nowrap;')
        T(b, 'body', x + 22, y + 140, 252, d, f'color: {INK2};', h=76)
    fin(b, 'Why Samsung · Samsung Business (People · Product · Process · Brand)', '06 Why Samsung — 삼성 비즈니스의 네 가지 약속', {'img0': ('img/fill/ais-a.json#6', '삼성전자 수원 디지털시티 사옥과 SAMSUNG 조형물')})


def why2():
    b = H('L_VS_WHY_2', '최고의 전문가 집단, One team synergy', '고객 맞춤형 솔루션부터 철저한 사후 관리까지, 신뢰할 수 있는 비즈니스 전문가가 함께합니다.')
    cols = [('고객 산업에 특화된 전문가', '', [('맞춤형 영업 조직 운영', '고객 니즈에 맞춘 솔루션 제공'), ('산업별 전문 영업 조직 운영', '제조, 건설, 금융 등 산업별 맞춤 지원'), ('제안 컨설팅 조직 운영', '미래 변화에 대비한 전략 제시')]),
            ('제품과 기술 전문가', '', [('제품별 기술 지원 조직 운영', '비즈니스 제품에 대한 체계적 지원'), ('미래 기술과 혁신 개발', '혁신적 기술로 차별화된 가치 제공'), ('산업 트렌드 인사이트 공유', '산업 인사이트를 공유하는 포럼 · 웨비나 개최')]),
            ('처음부터 끝까지 책임지는 전문가', '설계 – 배송/설치 – AS/유지보수', [('전문 시공 관리 조직 운영', '초기 도면 설계부터 구축 단계까지 안전하고 정확한 시공'), ('유지보수 지원', '지속적인 유지보수로 사용 효율 개선과 에너지 절감 실현'), ('배송 및 A/S 지원', '신속한 배송과 철저한 전문 A/S')])]
    for n, (t, s, rows) in enumerate(cols):
        x = 64 + n * 400
        b.box(x, 152, 352, 496, f'border-radius: 16px; background: #ffffff; border: 1px solid {LINE};')
        b.img(x, 152, 352, 160, 'photo', t, radius=16, extra='border-radius: 16px 16px 0 0;', key=f'img{n}')
        T(b, 'heading', x + 22, 328, 308, t, f'font-weight: 800; color: {BLUE}; white-space: nowrap;')
        if s: T(b, 'label', x + 22, 356, 308, s, f'color: {GRAY}; white-space: nowrap;')
        for r, (rt, rd) in enumerate(rows):
            y = 388 + r * 84
            b.box(x + 22, y, 308, 1, f'background: {LINE};')
            T(b, 'dense', x + 22, y + 12, 308, rt, f'font-weight: 800; color: {INK}; white-space: nowrap;')
            T(b, 'label', x + 22, y + 38, 308, rd, f'color: {GRAY};', h=38)
        if n < 2:
            b.box(x + 360, 384, 32, 32, f'border-radius: 50%; background: {BLUE}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-family: {MAN}; font-size: 20px; font-weight: 800;', '+')
    fin(b, 'Why Samsung · 최고의 전문가 집단 (3열)', '06 Why Samsung — 산업 · 제품 · 시공 전문가', {
        'img0': ('img/ph/oe-team-tabs.jpg', '태블릿 · 노트북으로 함께 일하는 팀'), 'img1': ('img/ph/of-demo-zone.jpg', '데모 존 사이니지'), 'img2': ('img/ph/of-rooftop-odu.jpg', '옥상 실외기')})


def why3():
    b = H('L_VS_WHY_3', '통합 오퍼링', '전문 Device부터 Solution과 Service까지, 비즈니스 고객의 니즈를 해결하고 비즈니스 효율성을 극대화합니다.')
    cols = [('Device', '비즈니스 환경에 최적화된 다양한 디바이스', ['일반 가전, 전문 빌트인 가전', 'AI TV, 사이니지, The Wall, LED 전광판', '하만 Professional', '시스템에어컨, 중앙공조(칠러)', '폰 · 태블릿, 웨어러블', 'DPC / NPC, 프린팅']),
            ('Solution', '비즈니스 운영 효율성을 극대화하는 맞춤형 솔루션', ['SmartThings Pro, b.IoT', 'DMS 2.5, 터치 중앙제어기, 멀티 Wi-Fi KIT', 'MagicINFO, LYNK Cloud', 'Knox, CounThru, SecuThru']),
            ('Service', '전문 케어와 지속적인 운영 지원 서비스', ['에어컨 세척 서비스', '에어컨 케어 서비스', 'Samsung Care+ for Business'])]
    for n, (t, s, items) in enumerate(cols):
        x = 64 + n * 391
        mid = n == 1
        b.box(x, 152, 370, 496, f'border-radius: 16px; background: {TINT if mid else "#ffffff"}; border: {2 if mid else 1}px solid {BLUE if mid else LINE};')
        b.img(x + (2 if mid else 1), 152 + (2 if mid else 1), 370 - (4 if mid else 2), 150, 'photo', t, radius=14, extra='border-radius: 14px 14px 0 0;', key=f'img{n}')
        T(b, 'heading', x + 24, 326, 40, f'0{n + 1}', f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap;')
        T(b, 'title', x + 60, 316, 280, t, f'font-family: {MAN}; font-weight: 800; color: {INK}; white-space: nowrap;')
        T(b, 'dense', x + 24, 362, 322, s, f'font-weight: 800; color: {BLUE if mid else INK2};', h=44)
        b.box(x + 24, 416, 322, 1, f'background: {"#c5cde6" if mid else LINE};')
        for r, it in enumerate(items):
            y = 430 + r * 35
            b.box(x + 24, y + 3, 16, 16, 'display: flex;', CHECK.format(c=BLUE))
            T(b, 'dense', x + 50, y, 300, it, f'color: {INK}; white-space: nowrap;')
    fin(b, 'Why Samsung · 통합 오퍼링 (Device · Solution · Service)', '06 Why Samsung — 디바이스 · 솔루션 · 서비스를 한 번에', {
        'img0': ('img/fill/ais-a.json#5', '객실 가전 · 시스템에어컨 · TV'), 'img1': ('img/fill/ais-a.json#16', 'LYNK Cloud 콘텐츠 관리 화면'), 'img2': ('img/fill/ais-b.json#14', '천장 매립 1Way 실내기')})


def why4():
    b = H('L_VS_WHY_4', '비즈니스 고객 맞춤 전문 프로세스', '배송부터 설치, 서비스, 유지보수까지 비즈니스 고객을 위한 체계적인 프로세스를 운영합니다.')
    cols = [('01 배송', '빠르고 효율적인 물류 시스템', [('전국망 물류 체계', '신속한 배송 및 철저한 납기 일정 준수'), ('비즈니스 특화 배송 지원', '주말, 야간, 공휴일, 당일 배송')]),
            ('02 설치', '맞춤형 설치와 제작업 서비스', [('특수 기기 설치', '사이니지, 시스템에어컨'), ('고객 맞춤 설치', '쉬는 시간 설치, 야간 설치'), ('제작업 서비스', 'HDM(윈도우/보안 프로그램/마스터 작업), 모바일 앱 커스터마이징 설치, 실크 인쇄, 옵션물 삽입')]),
            ('03 유지보수', '안정성 강화를 위한 전문 유지보수', [('전문 유지보수', '에어컨 세척/케어 서비스, 이전 설치'), ('안정성 보장', '워런티 연장 서비스')]),
            ('04 서비스', '비즈니스 고객 맞춤형 서비스', [('전국 서비스센터', '삼성전자 전국 서비스센터 운영'), ('비즈니스 맞춤 지원', '내/외근, 온라인, 특화 서비스')])]
    w = 270
    for n, (pill, t, rows) in enumerate(cols):
        x = 64 + n * (w + 24)
        b.box(x, 152, w, 436, f'border-radius: 16px; background: #ffffff; border: 1px solid {LINE};')
        b.img(x, 152, w, 84, 'photo', pill, radius=16, extra='border-radius: 16px 16px 0 0;', key=f'img{n}')
        b.box(x + 14, 164, 88, 26, f'border-radius: 13px; background: {BLUE};')
        T(b, 'label', x + 14, 167, 88, pill, 'font-weight: 800; color: #ffffff; text-align: center; white-space: nowrap;')
        T(b, 'heading', x + 20, 250, w - 40, t, f'font-weight: 800; color: {INK};', h=52)
        b.box(x + 20, 310, w - 40, 1, f'background: {LINE};')
        y = 322
        for rt, rd in rows:
            T(b, 'dense', x + 20, y, w - 40, rt, f'font-weight: 800; color: {INK}; white-space: nowrap;')
            lines = nlines(rd, 14, w - 44)
            T(b, 'label', x + 20, y + 24, w - 40, rd, f'color: {GRAY};', h=19 * lines)
            y += 24 + 19 * lines + 14
        if n < 3:
            b.box(x + w + 2, 358, 20, 22, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=18, c='#c5cde6'))
    b.box(64, 600, 1152, 48, f'border-radius: 14px; background: {BLUE};')
    T(b, 'label', 88, 614, 110, 'ONE PROCESS', f'font-family: {MAN}; font-weight: 800; letter-spacing: .06em; color: {LB}; white-space: nowrap;')
    T(b, 'heading', 206, 611, 200, '비즈니스 고객', 'font-weight: 800; color: #ffffff; white-space: nowrap;')
    for n, (ic, t) in enumerate([('cart', '배송'), ('wrench', '설치'), ('gear', '유지보수'), ('chat', '서비스')]):
        x = 640 + n * 144
        b.box(x, 608, 124, 32, 'border-radius: 16px; background: #ffffff; display: flex; align-items: center; padding-left: 12px; box-sizing: border-box;', icon(ic, BLUE, 16))
        T(b, 'dense', x + 36, 613, 84, t, f'font-weight: 800; color: {BLUE}; white-space: nowrap;')
        if n < 3: b.box(x + 126, 614, 16, 20, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=14, c=LB))
    fin(b, 'Why Samsung · 비즈니스 고객 맞춤 전문 프로세스 (배송 · 설치 · 유지보수 · 서비스)', '06 Why Samsung — 원 프로세스', {
        'img0': ('img/fill/r4-mdmf.json#5', '배송 — 물류 창고'), 'img1': ('img/fill/r9-bs04.json#3', '설치 — 천장 실내기 설치 · 점검'),
        'img2': ('img/ph/ed-ac-clean.jpg', '유지보수 — 에어컨 세척 · 케어'), 'img3': ('img/fill/r9-bs21.json#0', '서비스 — 비즈니스 고객 상담 센터')})


def why5():
    b = H('L_VS_WHY_5', '브랜드 가치', '품질과 기술로 세계적 브랜드 가치를 입증하였습니다.')
    T(b, 'label', 64, 152, 400, 'INTERBRAND 글로벌 브랜드 가치', f'font-weight: 800; letter-spacing: .04em; color: {BLUE}; white-space: nowrap;')
    years = [('2025', '905억 달러', 905), ('2024', '1,008억 달러', 1008), ('2023', '914억 달러', 914), ('2022', '877억 달러', 877), ('2021', '746억 달러', 746), ('2020', '623억 달러', 623)]
    for n, (yr, val, v) in enumerate(years):
        x = 64 + n * 118
        hi = n == 0
        b.box(x, 180, 108, 212, f'border-radius: 14px; background: {BLUE if hi else "#ffffff"}; border: 1px solid {BLUE if hi else LINE};')
        T(b, 'dense', x, 194, 108, yr, f'font-family: {MAN}; font-weight: 800; color: {"#ffffff" if hi else INK}; text-align: center; white-space: nowrap;')
        bh = round(86 * v / 1008)
        b.box(x + 40, 312 - bh, 28, bh, f'border-radius: 6px 6px 0 0; background: {"#9db4ff" if hi else "#c5cde6"};')
        T(b, 'dense', x, 324, 108, val, f'font-weight: 800; color: {"#ffffff" if hi else INK}; text-align: center; white-space: nowrap; letter-spacing: -0.02em;')
        T(b, 'label', x, 350, 108, '글로벌 5위', f'color: {"rgba(255,255,255,.8)" if hi else GRAY}; text-align: center; white-space: nowrap;')
    metrics = [('TV', '20', '년 연속 1위', '글로벌 TV 시장\n20년 연속 1위'), ('DISPLAY', '17', '년 연속 1위', '글로벌 상업용 디스플레이\n시장 17년 연속 1위'),
               ('iF', '58', '개 수상', 'iF 디자인 어워드 2025\n금상 2개 포함'), ('IDEA', '47', '개 수상', 'IDEA 2025\n금상 2개 수상 등')]
    for n, (k, num, unit, d) in enumerate(metrics):
        x = 64 + n * 179
        b.box(x, 408, 167, 240, f'border-radius: 14px; background: {SURF};')
        T(b, 'label', x + 18, 426, 130, k, f'font-family: {MAN}; font-weight: 800; letter-spacing: .08em; color: {MUTE}; white-space: nowrap;')
        T(b, 'display', x + 18, 452, 70, num, f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap; letter-spacing: -0.03em;')
        T(b, 'label', x + 18, 520, 130, unit, f'font-weight: 800; color: {INK}; white-space: nowrap;')
        T(b, 'dense', x + 18, 556, 140, d, f'color: {INK2};', h=66)
    b.box(786, 152, 430, 496, f'border-radius: 16px; background: {SURF};')
    secs = [('Global Top Brands', ['인터브랜드(Interbrand) ‘글로벌 100대 브랜드’에서 브랜드 가치 905억 달러 기록', '6년 연속 ‘글로벌 톱 5’ 수성']),
            ('No.1 Market Leader', ['글로벌 TV 시장 20년 연속 1위', '글로벌 상업용 디스플레이 시장 17년 연속 1위 (옴디아)']),
            ('Samsung Design', ['iF 디자인 어워드 2025 금상 2개 포함 총 58개 수상', 'IDEA 2025 금상 2개 수상 등 총 47개 수상'])]
    y = 176
    for si, (t, items) in enumerate(secs):
        if si: b.box(812, y - 14, 378, 1, f'background: {LINE};')
        T(b, 'heading', 812, y, 378, t, f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap;')
        y += 36
        for it in items:
            lines = nlines(it, 16, 360)
            b.box(812, y + 9, 5, 5, f'border-radius: 50%; background: {BLUE};')
            T(b, 'dense', 826, y, 364, it, f'font-weight: 700; color: {INK2};', h=22 * lines + 1)
            y += 22 * lines + 10
        y += 22
    fin(b, 'Why Samsung · 브랜드 가치 (Interbrand · 시장 1위 · 디자인 수상)', '06 Why Samsung — 브랜드 가치', {})


def end():
    b = B('L_VS_END', bg='#121417', dark=True)
    b.img(0, 0, 1280, 720, 'photo', '마무리 사진 (풀블리드)', radius=0, key='img0')
    b.box(0, 0, 1280, 720, 'background: linear-gradient(180deg, rgba(18,20,23,0) 40%, rgba(18,20,23,.82) 100%);')
    b.text('utility', 64, 44, 96, '고객사 로고', 'height: 26px; border: 1px dashed rgba(255,255,255,.55); border-radius: 4px; background: rgba(255,255,255,.88); color: #3d4452; text-align: center; line-height: 24px; white-space: nowrap; box-sizing: border-box;', h=26, fixed=True, key='cust')
    b.text('display', 64, 560, 600, 'SAMSUNG', f'font-family: {MAN}; font-weight: 800; letter-spacing: .22em; color: #ffffff; white-space: nowrap;', h=64, label=True)
    b.text('body', 64, 640, 700, '업종 · AI 표준 제안서', 'color: rgba(255,255,255,.86); white-space: nowrap;', h=25, key='foot')
    b.text('label', 816, 646, 400, '삼성전자 한국총괄 B2B 영업팀', 'color: rgba(255,255,255,.75); text-align: right; white-space: nowrap;', h=19, label=True)
    WHY_IMG['L_VS_END'] = {'img0': ('img/ph/ad-building-led.jpg', '도심 빌딩 외벽 삼성 대형 디스플레이')}
    add(b, meta('L_VS_END', 'VS-END', '마무리 · 풀블리드 사진 + SAMSUNG', '표준 제안서 마지막 장 — 모든 업종 같은 마무리', 'closing', None, G.format('마무리'), '', 'SAMSUNG', '', ['images']))


def build_all():
    why1(); why2(); why3(); why4(); why5(); end()
