# 공유오피스 Lite 표준 제안서 15장 — 명세 P01–P15 기하(PDF pt) 그대로 + samsung.com 사진
import sys; sys.path.insert(0, '/home/claude/gen/lay')
from lib import *

SEC1 = ('01.', ['생산성 향상을 위한', '효율적인 업무 공간'], 64.0)
SEC2 = ('02', ['입주사 만족도를 높이는', '쾌적한 공용 공간'], 61.6)
SEC3 = ('03', ['b.IoT Cloud 기반의', '관리 편의성 강화'], 61.6)
SEC4 = ('04', ['공유오피스 레퍼런스'], 61.6)
SEC5 = ('05', ['제안 제품 리스트'], 61.6)
NOTE_ALL = '* 제안서 內 모든 이미지는 소비자 이해를 돕기 위해 연출된 이미지입니다.'
PAGES = []

def page(fn):
    PAGES.append(fn); return fn

# ---------------- P01 표지 ----------------
@page
def p01():
    s = Slide('L_SOL_01')
    s.photo(0, k(47.96), 1280, 720 - k(47.96), 'p01_cover', '표지 사진 — 공유오피스 라운지 · 공용 공간', kind='space')
    s.text(72, 262, 'SAMSUNG BUSINESS', 15, color='#ffffff', weight=700, lh=20, nowrap=True, extra="letter-spacing: 0.18em; font-family: Manrope, 'Noto Sans KR', sans-serif")
    s.text(72, 292, '공유오피스<br>솔루션 제안서', 54, color='#ffffff', weight=700, lh=66, w=640, extra='letter-spacing: -0.03em')
    s.text(72, 432, '유연한 업무 환경을 완성하는 새로운 패러다임', 21, color='#ffffff', lh=30, w=640)
    s.text(72, 476, '[제안 부서명] · 2026', 15, color='rgba(255,255,255,0.82)', lh=22, w=520, nowrap=True)
    s.text(72, 690, NOTE_ALL, 9.33, color='rgba(255,255,255,0.78)', lh=12, w=520, nowrap=True)
    return s, dict(p='cover', p2=None, code='SOL-01 · L-01', name='표지 · 라운지 사진 + 흰 상단 띠', when='제안서 첫 장 — 공유오피스 라운지 사진 위에 제안명 · 부서 · 연도',
                   sample='N 공유오피스', eb='SAMSUNG BUSINESS', hl='공유오피스 솔루션 제안서', sub='유연한 업무 환경을 완성하는 새로운 패러다임', foot='', req=['customer', 'project', 'images'], prods=[], sols=[], phs=['[제안 부서명]'])

# ---------------- P02 3가지 제안 개요 ----------------
@page
def p02():
    s = Slide('L_SOL_02')
    s.tcen(640, 58.00, '유연한 업무 환경을 완성하는 새로운 패러다임', 20.01, 760, weight=500, nowrap=True)
    s.tcen(640, 107.49, '공유오피스', 40, 620, weight=700, nowrap=True, extra='letter-spacing: -0.02em')
    xs = [145.106, 381.43, 617.726]
    keys = [('p02_work', '효율적인 업무 공간 사진 — 회의 · 협업 장면'), ('p02_lounge', '쾌적한 공용 공간 사진 — 라운지 · 휴게 공간'), ('p02_biot', '관리 편의성 사진 — b.IoT 빌딩 · 원격 관리')]
    for x, (key, hint) in zip(xs, keys):
        s.photo(k(x), k(141.648), k(197.12), k(197.12), key, hint, kind='space', r=10)
    for x in (362.04, 598.73):
        s.box(k(x), k(142.53), 1, k(318.47), extra=f'border-left: 1px dotted {LINE}')
    cx = [k(x + 98.56) for x in xs]
    titles = ['01. 효율적인 업무 공간', '02. 쾌적한 공용 공간', '03. 관리 편의성 강화']
    descs = ['유연한 업무 진행을 위한<br>최적의 사무 환경을 제공합니다.', '공기질 케어 및 프리미엄 디지털<br>기기를 통해 고객 만족도를 높입니다.', 'b.IoT Cloud 기반의 편의성으로<br>손쉽게 오피스 기기를 관리하세요.']
    for c, t in zip(cx, titles): s.tcen(c, 385.09, t, 22, 310, weight=700, nowrap=True, extra='letter-spacing: -0.02em')
    for c, d in zip(cx, descs): s.tcen(c, 431.09, d, 14, 312, lh_px=k(16.81))
    s.tcen(640, 508.59, NOTE_ALL, 7, 600, color=MUTE, nowrap=True)
    s.pageno(2)
    return s, dict(p='overview', p2='value', code='SOL-02 · L-02', name='세 가지 제안 · 정사각 사진 3열 + 점선 구분', when='제안 전체를 세 가지 가치(업무 공간 · 공용 공간 · 관리 편의)로 먼저 보여 줄 때',
                   sample='N 공유오피스', eb='유연한 업무 환경을 완성하는 새로운 패러다임', hl='공유오피스', sub='', foot='', req=['values', 'images'], prods=[], sols=['biot'], phs=[])

# ---------------- P03 공간별 맞춤 제안 (아이소메트릭 지도) ----------------
@page
def p03():
    s = Slide('L_SOL_03')
    s.sec_title(None, ['공유오피스', '공간별 맞춤 제안'])
    s.sec_desc(['유연한 업무 환경을 갖춘 공유오피스, 각 공간에 특화된 제품과 솔루션을 만나보세요!', '입주사의 만족도를 높이는 차별화된 업무 환경을 구축할 수 있습니다.'])
    s.photo(k(141.534), k(76.478), k(629.972), k(445.465), 'p03_plan', '공유오피스 아이소메트릭 평면도 — 입구 · 로비 / 업무 공간 / 미팅룸 / 라운지 · 카페 / 관리자 공간', kind='aerial')
    LC = '#006fff'
    def poly(pts):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if abs(y0 - y1) < 0.01: s.hl(k(min(x0, x1)), k(y0), k(abs(x1 - x0)), LC, 1)
            else: s.vl(k(x0), k(min(y0, y1)), k(abs(y1 - y0)), LC, 1)
    poly([(235.219, 163.531), (356.825, 163.531), (356.825, 198.283)])
    poly([(631.446, 208.97), (676.176, 208.97), (676.176, 167.159), (720.907, 167.159)])
    poly([(136.46, 204.633), (136.46, 302.258), (228.387, 302.258)])
    poly([(548.561, 429.817), (548.561, 411.194), (454.025, 411.194), (454.025, 301.351)])
    poly([(571.748, 361.191), (649.446, 361.191), (649.446, 472.564), (631.446, 472.564)])
    def callout(x, y, num, l1, l2, bl1):
        s.box(k(x), k(y), k(189.07), k(83.62), bg=BLUE, r=k(13.18))
        fs = k(15.99); lh = k(19.08); top = k(bl1) - (lh / 2 + 0.436 * fs)
        s.text(k(x), top, f'<span style="font-family: Manrope, \'Noto Sans KR\', sans-serif; font-weight: 800">{num}</span> {l1}<br>{l2}', fs, color='#ffffff', weight=700, w=k(189.07), align='center', lh=lh, nowrap=True,
               plain=f'{num} {l1} {l2}')
    callout(46.97, 121.72, '01', '생산성 향상을 위한', '효율적인 업무 공간', 160.41)
    callout(720.91, 125.35, '03', 'b.IoT Cloud 기반의', '관리 편의성 강화', 164.01)
    callout(442.38, 430.72, '02', '입주사 만족도를 높이는', '쾌적한 공용 공간', 469.39)
    for (x, y, t) in [(313.91, 186.41, '입구 / 로비'), (560.32, 198.28, '관리자 공간'), (425.91, 279.50, '업무 공간'), (228.36, 292.39, '미팅룸'), (474.55, 351.33, '라운지 / 카페')]:
        s.capsule(x, y, t, w_pt=97.26, h_pt=19.76, r=k(8.84), bg='#ffffff', color=NAVY, border=f'0.68px solid {BLUE}')
    s.pageno(3)
    return s, dict(p='dss', p2='scenario', code='SOL-03 · L-03', name='공간 지도 · 아이소메트릭 평면도 + 가치 콜아웃 3 + 공간 라벨 5', when='세 가지 가치가 어느 공간에 놓이는지 평면도 한 장으로 연결할 때',
                   sample='N 공유오피스', eb='', hl='공유오피스 공간별 맞춤 제안', sub='각 공간에 특화된 제품과 솔루션', foot='', req=['spaces', 'values', 'images'], prods=[], sols=[], phs=[])

def head(s, sec, desc):
    num, lines, xt = sec
    s.sec_title(num, lines, x_text_pt=xt)
    s.sec_desc(desc)

# ---------------- P04 입구 / 로비 ----------------
@page
def p04():
    s = Slide('L_SOL_04')
    head(s, SEC1, ['공유오피스의 첫인상을 결정짓는 입구 / 로비에 다양한 형태의 사이니지를 비치함으로써', '인테리어의 품격을 높이며, 다양한 공지사항을 효과적으로 전달하실 수 있습니다.'])
    s.band('입구 / 로비')
    s.photo(k(26.362), k(128.806), k(454.28), k(353.764), 'p04_lobby', '입구 · 로비 사진 — 대형 디스플레이 벽면 · Flip Pro', kind='space')
    s.photo(k(480.699), k(128.836), k(452.89), k(353.73), 'p04_sign', '로비 · 복도 사진 — 단독형 사이니지', kind='space')
    s.capsule(234.68, 166.00, '비디오월')
    s.capsule(328.31, 327.51, 'Flip Pro')
    s.capsule(709.82, 161.01, '단독형')
    s.card(665.21, 395.15, 166.68, 70.87, '스마트 사이니지', '다양한 형태의 사이니지로<br>공지사항 및 알림 공유', tx_pt=679.0, t_bl=415.70, b_bl=438.41)
    s.qr(841.89, 366.12, 70.84, 'qr_sign', ['스마트 사이니지', '제품정보 바로가기'], lab_y_pt=440.65)
    s.pageno(4)
    return s, dict(p='products', p2='scenario', code='SOL-04 · L-04', name='입구 · 로비 — 사진 2장 + 사이니지 라벨 3 + 제품 카드 · QR', when='공간 하나에 같은 제품군 여러 형태(비디오월 · Flip · 단독형)를 사진 위 라벨로 보여 줄 때',
                   sample='N 공유오피스', eb='01. 생산성 향상을 위한 효율적인 업무 공간', hl='입구 / 로비', sub='', foot='', req=['spaces', 'products', 'images'], prods=['qm55c', 'vm55b', 'flip'], sols=['magicinfo'], phs=[])

# ---------------- P05 업무 공간 프라이빗 / 오픈형 ----------------
@page
def p05():
    s = Slide('L_SOL_05')
    head(s, SEC1, ['스마트한 업무를 위한 최적의 IT/프린팅 제품들을 통해 최적의 업무 환경을 제공합니다.', '유연한 업무 진행을 위한 차별화된 공간을 완성해보세요!'])
    s.band('업무 공간 (프라이빗)', x_pt=26.334, w_pt=443.338)
    s.band('업무 공간 (오픈형)', x_pt=489.487, w_pt=443.338)
    s.photo(k(26.362), k(128.835), k(443.31), k(354.132), 'p05_private', '프라이빗 업무 공간 사진 — 소규모 회의 · Flip', kind='space', border=f'0.68px solid {LINE}')
    s.photo(k(490.592), k(128.835), k(442.686), k(354.132), 'p05_open', '오픈형 업무 공간 사진 — 복합기 · Flip · 노트북', kind='space', border=f'0.68px solid {LINE}')
    # left panel: Flip Pro card (wall, top-right of the room) · Galaxy Book card + laptop cut + QR along the bottom
    s.card(320.0, 145.0, 131.56, 70.5, 'Flip Pro', '자유로운 이동이 가능한<br>인터렉티브 전자칠판', tx_pt=331.0, t_bl=165.5, b_bl=187.0)
    s.card(149.216, 378.395, 130.73, 74.55, '갤럭시 북 Pro', '강력한 퍼포먼스로<br>업무 생산성 향상', tx_pt=160.0, t_bl=402.61, b_bl=425.39)
    s.photo(k(283.068), k(318.983), k(107.036), k(82.063), 'p05_book', '노트북 제품 컷 — 갤럭시 북 Pro', kind='cut', fit='contain')
    s.qr(387.978, 365.726, 70.838, 'qr_book', ['갤럭시 북6 Pro', '제품정보 바로가기'], lab_y_pt=439.54)
    # right panel: Flip Pro card over the wall above the Flip · MX Pro card beside the printer
    s.card(602.0, 162.0, 133.5, 75.0, 'Flip Pro', '시원한 대화면에 직접<br>필기하며 회의 가능', tx_pt=612.5, t_bl=182.5, b_bl=205.0)
    s.card(750.0, 225.0, 180.0, 82.5, '디지털 복합기 MX Pro', '기존 획일적인 디자인과<br>색상에서 벗어나 공유오피스<br>인테리어의 포인트를 완성', tx_pt=760.5, t_bl=245.5, b_bl=268.0)
    s.qr(842.372, 367.483, 70.838, 'qr_mx', ['디지털 복합기', '제품정보 바로가기'], lab_y_pt=440.646)
    s.pageno(5)
    return s, dict(p='products', p2='scenario', code='SOL-05 · L-05', name='업무 공간 2패널 — 프라이빗 · 오픈형 (패널별 제목 띠 · 제품 카드 · QR)', when='같은 업무 공간을 두 유형(프라이빗 · 오픈형)으로 나눠 제품 구성을 비교해 보여 줄 때',
                   sample='N 공유오피스', eb='01. 생산성 향상을 위한 효율적인 업무 공간', hl='업무 공간 (프라이빗) · 업무 공간 (오픈형)', sub='', foot='', req=['spaces', 'products', 'images'], prods=['flip', 'book'], sols=[], phs=[])

# ---------------- P06 무인 과금 프린팅 ----------------
@page
def p06():
    s = Slide('L_SOL_06')
    head(s, SEC1, ['무인 과금 솔루션을 통해 스마트한 프린팅 과금 환경을 구축하세요!', '다양한 결제 방식으로 입주사 고객의 편의성은 높이고, 사업장 관리자의 관리 부담은 줄어듭니다.'])
    s.photo(k(26.362), k(128.806), k(907.228), k(349.399), 'p06_print', '프린팅 공간 사진 — 디지털 복합기 · 결제 단말', kind='space')
    s.box(k(26.107), k(97.483), k(907.739), k(380.977), border=f'0.68px solid {LINE}')
    s.box(k(26.334), k(421.0), k(907.228), k(61.965), bg='rgba(0,0,0,0.7)')
    fs = k(24.01); lh = fs * 1.25
    hi = f'color: {CYAN}'
    s.text(k(26.334), k(461.59) - (lh / 2 + 0.436 * fs), f'출력물에 대한 요금을 <span style="{hi}">개인카드로 즉시 결제</span>할 수 있어 보다 <span style="{hi}">간편합니다!</span>', fs, color='#ffffff', weight=700, w=k(907.228), align='center', lh=lh, nowrap=True)
    s.tbl(560.0, 164.49, 'T-money, 신용카드, 모바일 충전 등', 18, color='#ffffff', w=k(909.1 - 560.0), align='right', nowrap=True)
    s.tbl(520.0, 208.09, '다양한 결제 방식 지원', 40, color=TEAL, weight=700, w=k(909.1 - 520.0), align='right', nowrap=True, extra='letter-spacing: -0.02em')
    s.band('업무 공간')
    s.card(466.186, 263.622, 157.78, 83.06, '무인 과금 솔루션', '효율적인 프린팅 운영을 위한<br>비대면 무인 과금 프린팅', tx_pt=478.49, t_bl=292.11, b_bl=314.79)
    s.pageno(6)
    return s, dict(p='solution', p2='effect', code='SOL-06 · L-06', name='넓은 사진 + 큰 강조 문구 + 하단 메시지 띠 (무인 과금 프린팅)', when='솔루션 하나의 핵심 효과를 큰 문구 · 한 줄 메시지로 강조할 때',
                   sample='N 공유오피스', eb='01. 생산성 향상을 위한 효율적인 업무 공간', hl='다양한 결제 방식 지원', sub='T-money, 신용카드, 모바일 충전 등', foot='', req=['solutions', 'values', 'images'], prods=[], sols=['unmanned'], phs=[])

# ---------------- P07 미팅룸 ----------------
@page
def p07():
    s = Slide('L_SOL_07')
    head(s, SEC1, ['삼성 Flip Pro는 추가적인 솔루션 호환성 없이도 간단하고 원활한 화상 회의를 지원합니다.', 'Google Duo와 같은 앱은 사용자가 터치 한 번으로 쉽고 원활한 커뮤니케이션을 할 수 있게 합니다.'])
    s.photo(k(26.362), k(128.835), k(455.896), k(354.444), 'p07_flip', '미팅룸 사진 — Flip Pro 발표 · 회의', kind='space', border=f'0.68px solid {LINE}')
    s.photo(k(482.286), k(129.629), k(451.303), k(353.338), 'p07_video', '미팅룸 사진 — 화상 회의', kind='space', border=f'0.68px solid {LINE}')
    s.band('미팅룸')
    s.card(51.08, 373.549, 140.8, 83.06, 'Flip Pro', '시원한 대화면에<br>직접 필기하며 회의 가능', tx_pt=65.39, t_bl=402.01, b_bl=424.8)
    s.card(806.0, 140.0, 125.0, 75.0, '화상 회의 솔루션', 'Google Duo를 통해<br>간편한 화상회의 가능', tx_pt=816.5, t_bl=160.5, b_bl=183.0)
    s.card(504.51, 350.758, 144.71, 74.55, '갤럭시 북 Pro', '강력한 퍼포먼스로<br>업무 생산성 향상', tx_pt=518.0, t_bl=375.0, b_bl=397.7)
    s.photo(k(645.846), k(376.668), k(140.769), k(107.943), 'p07_book', '노트북 제품 컷 — 갤럭시 북 Pro', kind='cut', fit='contain')
    s.qr(388.29, 366.009, 70.838, 'qr_flip', ['Flip Pro', '제품정보 바로가기'], lab_y_pt=439.54)
    s.qr(844.781, 368.645, 70.838, 'qr_book', ['갤럭시 북6 Pro', '제품정보 바로가기'], lab_y_pt=442.46)
    s.box(k(26.362), k(499.635), k(300.246), k(29.338), bg=BLUE)
    s.note(36.0, 517.89, ['* 구글 듀오 라이선스 및 화상 장비는 별도 구매가 필요합니다.'], w_pt=286, color='#ffffff')
    s.pageno(7)
    return s, dict(p='products', p2='scenario', code='SOL-07 · L-07', name='미팅룸 — 발표 · 화상 회의 사진 2장 + 제품 카드 3 · 노트북 컷 · QR 2', when='회의 공간의 두 장면(발표 · 화상 회의)과 쓰이는 제품을 함께 보여 줄 때',
                   sample='N 공유오피스', eb='01. 생산성 향상을 위한 효율적인 업무 공간', hl='미팅룸', sub='', foot='* 구글 듀오 라이선스 및 화상 장비는 별도 구매가 필요합니다.', req=['spaces', 'products', 'images'], prods=['flip', 'book'], sols=[], phs=[])

# ---------------- P08 공기질 솔루션 ----------------
@page
def p08():
    s = Slide('L_SOL_08')
    s.frame()
    head(s, SEC2, ['쾌적한 냉난방은 물론, 실시간 공기질 모니터링과 청정 시스템을 통해 깨끗한 실내 환경을 유지합니다.', '편리한 자동화 시스템을 통해 입주사 고객의 만족도를 높여드립니다.'])
    s.photo(k(26.362), k(128.806), k(454.139), k(354.586), 'p08_office', '업무 공간 사진 — 천장 시스템에어컨 · 공기청정기 · 에어모니터', kind='space')
    # cards over the photo — each sits where the product is (and over the scene's own label area)
    s.card(258.0, 198.0, 139.0, 73.0, '무풍 시스템에어컨', '천장의 부유 먼지까지<br>깨끗하게 청정', tx_pt=268.5, t_bl=218.5, b_bl=241.0)
    s.card(58.0, 257.0, 145.0, 72.0, 'Bespoke AI 제트', '바닥의 미세먼지까지<br>강력하게 흡입', tx_pt=68.5, t_bl=277.5, b_bl=300.0)
    s.card(195.0, 352.0, 135.0, 56.0, '에어모니터 플러스', '실시간 공기질 측정', tx_pt=205.5, t_bl=372.5, b_bl=395.0)
    s.card(239.5, 416.0, 149.0, 66.5, 'Infinite AI 공기청정기', '업무 공간의 공기질을<br>깨끗하게 청정', tx_pt=250.0, t_bl=436.0, b_bl=458.5)
    # right half — real-time air quality solution diagram
    s.tbl(593.4, 195.11, '실시간 공기질 솔루션', 28.01, color=TEAL, weight=700, nowrap=True, extra='letter-spacing: -0.02em')
    s.photo(k(560.0), k(226.0), k(52.0), k(52.0), 'p08_airmon', '에어모니터 제품 컷', kind='cut', fit='contain')
    s.tbl(620.9, 248.51, '삼성 에어모니터 플러스', 11.99, color=CYAN, weight=700, nowrap=True)
    s.tbl(618.8, 263.2, '근무자 근처의 온 / 습도를 정밀하게 측정', 10.49, color=MUTE, weight=700, nowrap=True)
    # svg 는 위치를 잡은 div 안에 — svg 자체에 position/left/top 이 있으면 PPTX(svg→png) 때 그림 밖으로 밀려 빈 그림이 됨
    cloud = ('<div style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px"><svg viewBox="0 0 134.56 81.5" width="100%" height="100%" style="display: block; overflow: visible">'
             '<defs><linearGradient id="solcl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00a2ff"/><stop offset="1" stop-color="#006fff"/></linearGradient></defs>'
             '<path d="M30 76 C 12 76 2 64 4 51 C 6 39 17 32 29 34 C 30 18 44 6 62 7 C 76 8 87 17 90 29 C 96 23 108 22 117 28 C 127 35 131 47 126 58 C 133 63 133 76 120 76 Z" fill="url(#solcl)" stroke="#ffffff" stroke-width="3.3"/></svg></div>')
    s.raw(cloud.format(x=f(k(625.861)), y=f(k(282.586)), w=f(k(134.56)), h=f(k(81.5))))
    s.text(k(625.861), k(282.586) + 44, 'SmartThings<br>Cloud', 19, color='#ffffff', weight=800, w=k(134.56), align='center', lh=21, nowrap=True, extra="font-family: Manrope, 'Noto Sans KR', sans-serif; letter-spacing: -0.01em")
    dash = f'border-left: 2.35px dotted {LINE}'
    s.box(k(586.52) - 1, k(272.0), 2.35, k(331.71 - 272.0), extra=dash)
    s.box(k(586.52), k(331.71) - 1, k(618.83 - 586.52), 2.35, extra=f'border-top: 2.35px dotted {LINE}')
    s.box(k(763.99), k(334.66) - 1, k(803.08 - 763.99), 2.35, extra=f'border-top: 2.35px dotted {LINE}')
    s.box(k(803.08) - 1, k(334.66), 2.35, k(369.64 - 334.66), extra=dash)
    s.photo(k(720.0), k(372.0), k(80.0), k(52.0), 'p08_sac', '시스템에어컨 제품 컷', kind='cut', fit='contain')
    s.photo(k(818.0), k(330.0), k(32.0), k(98.0), 'p08_inf', '공기청정기 제품 컷', kind='cut', fit='contain')
    s.tbl(737.09, 442.6, '시스템 에어컨', 10.49, color=MUTE, weight=700, nowrap=True)
    s.tbl(808.21, 442.6, '공기청정기', 10.49, color=MUTE, weight=700, nowrap=True)
    s.qr(560.891, 352.148, 60.293, 'qr_airmon', ['에어모니터 플러스', '제품정보 바로가기'], lab_y_pt=414.567, lab_h_pt=24.6, lsize=6.01, lpitch=7.2)
    s.band('업무 공간')
    s.note(26.39, 508.31, ['* 해당 이미지는 연출된 장면이며, 실사용시 차이가 있을 수 있습니다.', '* 미국 냉공조학회(ASHRAE) 기준 Cold Draft가 없는 0.15 m/s 이하의 바람을 무풍(Still Air)으로 정의합니다.', '* 시스템에어컨의 공기 청정 기능은 옵션 사항입니다.'], pitch_pt=10.0, w_pt=500)
    s.pageno(8)
    return s, dict(p='solution', p2='products', code='SOL-08 · L-08', name='업무 공간 사진 + 제품 카드 4 · 실시간 공기질 솔루션 도식 (SmartThings Cloud)', when='공간 사진 속 제품과, 그 제품들이 클라우드로 이어지는 운영 도식을 한 장에 같이 보여 줄 때',
                   sample='N 공유오피스', eb='02 입주사 만족도를 높이는 쾌적한 공용 공간', hl='실시간 공기질 솔루션', sub='', foot='* 해당 이미지는 연출된 장면이며, 실사용시 차이가 있을 수 있습니다.', req=['spaces', 'products', 'solutions', 'images'], prods=['wf4way', 'purifier'], sols=['smartthings', 'stpro'], phs=[])

# ---------------- P09 라운지 ----------------
@page
def p09():
    s = Slide('L_SOL_09')
    head(s, SEC2, ['업무 중간 리프레쉬 타임이나 유연한 선택 근무를 위해 프리미엄 휴게 공간을 완성해보세요!', '임직원을 위한 복지 서비스로 근무 만족도가 향상됩니다.'])
    s.band('라운지')
    s.photo(k(26.362), k(128.836), k(907.228), k(353.763), 'p09_lounge', '라운지 사진 — 냉장고 · 정수기 · 세로 TV · 에어드레서 · 공기청정기', kind='space')
    B = BLUE
    def link(pts, dot):
        s.dot(k(dot[0]), k(dot[1]), k(5.95), B)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if abs(y0 - y1) < 0.01: s.hl(k(min(x0, x1)), k(y0), k(abs(x1 - x0)), B, 1)
            else: s.vl(k(x0), k(min(y0, y1)), k(abs(y1 - y0)), B, 1)
    # product points in the scene → cards (cards sit over the scene's own label areas)
    link([(89.4, 292.6), (89.4, 371.0)], (89.4, 292.6))                                   # 에어드레서 (left mirror cabinets)
    link([(708.0, 287.0), (708.0, 255.0)], (708.0, 287.0))                                # 세로 TV
    link([(330.0, 345.0), (356.0, 345.0), (356.0, 440.0), (374.0, 440.0)], (330.0, 345.0))  # 공기청정기
    link([(884.0, 360.0), (861.0, 360.0), (861.0, 412.0), (840.0, 412.0)], (884.0, 360.0))  # 슈드레서
    s.card(47.0, 371.0, 166.0, 75.0, 'Bespoke AI 에어드레서', '냄새 · 세균 · 미세먼지 제거<br>의류 청정 서비스', tx_pt=57.5, t_bl=391.5, b_bl=414.0)
    s.card(185.0, 248.0, 134.0, 73.0, 'Bespoke AI 냉장고', '휴게실에 맞춤 냉장고로<br>럭셔리 인테리어 완성', tx_pt=195.5, t_bl=268.5, b_bl=291.0)
    s.card(349.0, 211.0, 163.0, 73.0, 'Bespoke 정수기', '4단계 필터 시스템의<br>압도적인 정수력과 안정성', tx_pt=359.5, t_bl=231.5, b_bl=254.0)
    s.card(651.0, 182.0, 160.0, 73.0, '세로 TV', '세로형 TV로 영화/게임은<br>가로로 몰입감 있게 감상', tx_pt=661.5, t_bl=202.5, b_bl=225.0)
    s.card(374.0, 406.0, 154.0, 74.0, 'Infinite AI 공기청정기', '공용 라운지 공간의<br>공기질을 깨끗하게 청정', tx_pt=384.5, t_bl=426.5, b_bl=449.0)
    s.card(691.0, 379.0, 149.0, 74.0, 'Bespoke 슈드레서', '매일 신는 신발을<br>기분 좋게 강력 탈취', tx_pt=701.5, t_bl=399.5, b_bl=422.0)
    s.note(26.39, 508.31, ['* 에어드레서의 냄새, 세균, 미세먼지 제거 관련 상세 시험 내용은 삼성닷컴을 참조하시기 바랍니다.'], w_pt=500)
    s.pageno(9)
    return s, dict(p='products', p2='scenario', code='SOL-09 · L-09', name='라운지 — 넓은 공간 사진 + 제품 점 · 연결선 + 제품 카드 6', when='한 공간에 놓이는 여러 가전을 사진 속 위치에 점으로 찍고 카드로 설명할 때',
                   sample='N 공유오피스', eb='02 입주사 만족도를 높이는 쾌적한 공용 공간', hl='라운지', sub='', foot='* 에어드레서의 냄새, 세균, 미세먼지 제거 관련 상세 시험 내용은 삼성닷컴을 참조하시기 바랍니다.', req=['spaces', 'products', 'images'], prods=['bi_fridge', 'airdresser', 'purifier'], sols=[], phs=[])

# ---------------- P10 카페 ----------------
@page
def p10():
    s = Slide('L_SOL_10')
    head(s, SEC2, ['색다른 비스포크 가전을 통해 공유오피스 공간의 인테리어 효과를 높여보세요!', '각 공간의 컨셉에 맞춰 컬러를 선택하실 수 있습니다.'])
    s.photo(k(25.851), k(128.836), k(667.842), k(353.763), 'p10_main', '카페 공간 대표 사진 — 컬러 냉장고 · 카운터', kind='space')
    s.photo(k(703.757), k(128.835), k(229.833), k(173.31), 'p10_coral', '카페 공간 사진 2 — 다른 컬러 냉장고', kind='space')
    s.photo(k(703.757), k(311.925), k(229.833), k(170.674), 'p10_mint', '카페 공간 사진 3 — 다른 컬러 냉장고', kind='space')
    s.card(415.587, 381.174, 188.76, 73.64, 'Bespoke AI 냉장고', '공간별 컨셉에 맞춘 냉장고로<br>개성있는 카페 인테리어 완성', tx_pt=430.0, t_bl=405.01, b_bl=427.69)
    s.qr(610.101, 351.694, 70.838, 'qr_fridge', ['BESPOKE 냉장고', '제품정보 바로가기'], lab_y_pt=425.934)
    s.band('카페')
    s.pageno(10)
    return s, dict(p='products', p2='scenario', code='SOL-10 · L-10', name='카페 — 큰 사진 + 작은 사진 2 (컬러 비교) + 제품 카드 · QR', when='같은 제품의 색 · 컨셉 변화를 사진 세 장으로 비교해 보여 줄 때',
                   sample='N 공유오피스', eb='02 입주사 만족도를 높이는 쾌적한 공용 공간', hl='카페', sub='', foot='', req=['spaces', 'products', 'images'], prods=['bi_fridge'], sols=[], phs=[])

# ---------------- P11 관리자 공간 · b.IoT ----------------
@page
def p11():
    s = Slide('L_SOL_11')
    s.frame()
    head(s, SEC3, ['클라우드 기반의 원격 관리로 공유오피스의 각 지점별 다양한 기기를 효율적으로 관리하실 수 있습니다.', '보다 편리한 원격 관리 서비스로 신속한 유지보수는 물론, 관리자의 업무 부담을 줄여보세요!'])
    s.photo(k(100.431), k(188.759), k(158.967), k(158.825), 'p11_map', 'b.IoT Cloud 지점 연결 도식', kind='ui', fit='contain')
    s.photo(k(312.462), k(181.929), k(227.055), k(163.955), 'p11_dash', 'b.IoT Cloud 대시보드 화면', kind='ui', r=6, border=f'0.68px solid #e2e5ea')
    s.photo(k(587.99), k(181.928), k(168.179), k(163.984), 'p11_remote', '원격 모니터링 · 유지보수 장면', kind='people', r=10)
    cols = [(179.9, '각 지점별 다양한 기기 연계', '편리한 원격 관리', 386.59, 417.4), (425.95, '사용자 관심 항목으로', '맞춤형 대시보드', 385.31, 416.1), (672.1, '실시간 모니터링을 통한', '신속한 유지 · 보수', 383.19, 414.0)]
    for cx, sm, big, b1, b2 in cols:
        s.tcen(k(cx), b1, sm, 14, k(230), color=SKY, nowrap=True)
        s.tcen(k(cx), b2, big, 28.01, k(240), color=TEAL, weight=700, nowrap=True, extra='letter-spacing: -0.03em')
    s.qr(828.68, 360.51, 71.518, 'qr_biot', ['b.IoT 솔루션', '제품정보 바로가기'], lab_y_pt=435.118)
    s.note(26.39, 508.31, ['* 제품에 따라 기능 지원 여부, 지원 환경 및 사양이 다를 수 있습니다.', '* 호환 가능한 특정 제품만 연계 가능합니다.'], pitch_pt=10.09, w_pt=400)
    s.band('관리자 공간')
    s.pageno(11)
    return s, dict(p='solution', p2='effect', code='SOL-11 · L-11', name='솔루션 효익 3열 — 도식 · 대시보드 · 현장 사진 + 큰 강조 문구 · QR', when='관리 솔루션의 효익 세 가지를 화면 · 도식 · 사진으로 나란히 보여 줄 때',
                   sample='N 공유오피스', eb='03 b.IoT Cloud 기반의 관리 편의성 강화', hl='관리자 공간', sub='', foot='* 호환 가능한 특정 제품만 연계 가능합니다.', req=['solutions', 'values', 'images'], prods=[], sols=['biot'], phs=[])

def capbar(s, x_pt, w_pt, key, label, title, sub, qr_x, qr_s):
    """레퍼런스 사례 캡션 — 투명 검은 바 + QR + 사례명 · 한 줄 설명"""
    s.box(k(x_pt), k(396.935), k(w_pt), k(87.024), bg='rgba(0,0,0,0.45)')
    s.box(k(x_pt), k(396.935), k(w_pt), k(87.024), extra='background: linear-gradient(90deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0) 100%)')
    s.static(k(qr_x), k(410.1), k(qr_s), k(qr_s), key)
    s.tbl(99.3, 443.31, title, 22, color='#ffffff', weight=700, nowrap=True, lh_px=k(22) * 1.2)
    s.tbl(99.3, 458.79, sub, 14, color='#ffffff', nowrap=True, lh_px=k(14) * 1.25)

# ---------------- P12 레퍼런스 — 패스트파이브 삼성3호점 ----------------
@page
def p12():
    s = Slide('L_SOL_12')
    s.frame()
    head(s, SEC4, ['유연한 업무 환경을 완성하는 공유오피스의 완성, 삼성전자와 함께 만들어갑니다.', 'QR 코드를 통해 상세 내용을 확인해 보세요!'])
    s.photo(k(26.362), k(93.006), k(599.725), k(390.982), 'p12_main', '레퍼런스 대표 사진 — 회의실 Flip 사용 장면', kind='space')
    s.photo(k(637.001), k(92.75), k(296.588), k(197.206), 'p12_room', '레퍼런스 사진 2 — 업무 공간', kind='space')
    s.photo(k(636.009), k(298.007), k(297.609), k(185.981), 'p12_desk', '레퍼런스 사진 3 — 라운지 · 데스크', kind='space')
    capbar(s, 26.334, 599.754, 'qr_ff', '', '패스트파이브 삼성 3호점', '삼성 플립, 생각까지 공유하는 스마트 오피스를 완성하다', 35.405, 59.754)
    s.pageno(12)
    return s, dict(p='case', p2=None, code='SOL-12 · L-12', name='도입 사례 — 큰 사진 + 세로 사진 2 + 사례 캡션 바 · QR', when='같은 업종 도입 사례 한 곳을 사진 세 장과 한 줄 캡션으로 보여 줄 때',
                   sample='N 공유오피스', eb='04 공유오피스 레퍼런스', hl='패스트파이브 삼성 3호점', sub='삼성 플립, 생각까지 공유하는 스마트 오피스를 완성하다', foot='', req=['cases', 'images'], prods=['flip'], sols=[], phs=[])

# ---------------- P13 레퍼런스 — 패스트파이브 역삼3호점 ----------------
@page
def p13():
    s = Slide('L_SOL_13')
    s.frame()
    head(s, SEC4, ['유연한 업무 환경을 완성하는 공유오피스의 완성, 삼성전자와 함께 만들어갑니다.', 'QR 코드를 통해 상세 내용을 확인해 보세요!'])
    s.photo(k(26.362), k(93.006), k(360.7), k(390.982), 'p13_fridge', '레퍼런스 사진 1 — 컬러 냉장고 카운터', kind='space')
    s.photo(k(399.5), k(93.006), k(534.09), k(390.982), 'p13_sofa', '레퍼런스 사진 2 — 카페 라운지 전경', kind='space')
    capbar(s, 26.334, 360.624, 'qr_ffb', '', '패스트파이브 역삼 3호점', '삼성 비스포크 냉장고, 색다른 사무공간을 만들다', 36.397, 59.839)
    s.pageno(13)
    return s, dict(p='case', p2=None, code='SOL-13 · L-13', name='도입 사례 — 좁은 사진 + 넓은 사진 + 사례 캡션 바 · QR', when='도입 사례 한 곳을 사진 두 장(디테일 · 전경)과 한 줄 캡션으로 보여 줄 때',
                   sample='N 공유오피스', eb='04 공유오피스 레퍼런스', hl='패스트파이브 역삼 3호점', sub='삼성 비스포크 냉장고, 색다른 사무공간을 만들다', foot='', req=['cases', 'images'], prods=['bi_fridge'], sols=[], phs=[])

# ---------------- P14 제안 제품 리스트 ----------------
@page
def p14():
    s = Slide('L_SOL_14')
    s.frame()
    s.sec_title(SEC5[0], SEC5[1], x_text_pt=SEC5[2])
    s.vl(k(307.531), k(92.976), k(389.96), LINE, 0.68)
    s.vl(k(623.509), k(92.976), k(389.96), LINE, 0.68)
    cols = [(k(26.334 + (307.531 - 26.334) / 2), '업무 공간', 'p14_work', (139.58, 166.6, 130.17), '업무 공간 대표 사진'),
            (k(307.531 + (623.509 - 307.531) / 2), '미팅룸', 'p14_meet', (503.39, 228.73, 130.16), '미팅룸 대표 사진'),
            (k(623.509 + (933.562 - 623.509) / 2), '라운지 / 카페', 'p14_lounge', (920.09, 246.39, 130.51), '라운지 · 카페 대표 사진')]
    for cx, name, key, (x, w, h), hint in cols:
        s.tcen(cx, 135.81, name, 18, 300, color=MUTE, weight=700, nowrap=True)
        s.photo(cx - w / 2, 195.5, w, h, key, hint, kind='space', r=4)
    def item(cx, bl_pt, key, label, bw, bh, hint):
        cap_top = k(bl_pt) - (k(9.01) * 1.3 / 2 + 0.436 * k(9.01))
        s.photo(cx - bw / 2, cap_top - 6 - bh, bw, bh, key, hint, kind='cut', fit='contain')
        s.tcen(cx, bl_pt, label, 9.01, 150, color=GRAY, nowrap=True)
    # 업무 공간 — 3 + 3 + 2
    c1 = [k(86.0), k(170.0), k(254.7)]
    item(c1[0], 329.6, 'c_sign', '스마트 사이니지', 92, 64, '사이니지 제품 컷')
    item(c1[1], 329.6, 'c_mx', '디지털 복합기 MX Pro', 72, 84, '복합기 제품 컷')
    item(c1[2], 329.6, 'p05_book', '갤럭시 북 Pro', 84, 64, '노트북 제품 컷')
    item(c1[0], 390.61, 'c_flip45', 'Flip Pro', 78, 60, '전자칠판 제품 컷')
    item(c1[1], 390.61, 'p08_sac', '무풍 시스템에어컨', 84, 52, '시스템에어컨 제품 컷')
    item(c1[2], 390.61, 'p08_airmon', '에어모니터 플러스', 46, 50, '에어모니터 제품 컷')
    item(k(113.9), 471.5, 'p08_inf', 'Infinite AI 공기청정기', 30, 80, '공기청정기 제품 컷')
    item(k(214.9), 471.5, 'c_jet', 'Bespoke AI 제트', 28, 80, '청소기 제품 컷')
    # 미팅룸 — 2 + 2 + 1
    item(k(419.95), 329.6, 'c_flipfront', 'Flip Pro', 100, 62, '전자칠판 제품 컷')
    item(k(509.7), 329.6, 'p07_book', '갤럭시 북 Pro', 88, 64, '노트북 제품 컷')
    item(k(422.8), 393.9, 'c_sacfront', '무풍 시스템에어컨', 62, 56, '시스템에어컨 제품 컷')
    item(k(513.3), 393.9, 'c_airmon45', '에어모니터 플러스', 50, 52, '에어모니터 제품 컷')
    item(k(452.2), 472.8, 'c_infopen', 'Infinite AI 공기청정기', 30, 76, '공기청정기 제품 컷')
    # 라운지 / 카페 — 2 + 1 + 2
    item(k(721.0), 329.6, 'c_fridge', 'Bespoke AI 냉장고', 34, 84, '냉장고 제품 컷')
    item(k(844.6), 329.6, 'c_water', 'Bespoke 정수기', 44, 84, '정수기 제품 컷')
    item(k(778.5), 393.9, 'c_erv', '시스템 청정환기', 110, 36, '환기 제품 컷')
    item(k(721.0), 472.8, 'c_dresser', 'Bespoke AI 에어드레서', 24, 76, '에어드레서 제품 컷')
    item(k(844.6), 472.8, 'p08_airmon', '에어모니터 플러스', 46, 50, '에어모니터 제품 컷')
    s.pageno(14)
    return s, dict(p='bom', p2='products', code='SOL-14 · L-14', name='제안 제품 리스트 — 3열 공간 사진 + 제품 컷 · 이름', when='공간별로 제안 제품을 한 장에 정리해 범위를 확인할 때',
                   sample='N 공유오피스', eb='05 제안 제품 리스트', hl='제안 제품 리스트', sub='업무 공간 · 미팅룸 · 라운지 / 카페', foot='', req=['products', 'spaces', 'images'], prods=['qm55c', 'flip', 'book', 'wf4way', 'purifier', 'bi_fridge', 'airdresser', 'erv'], sols=[], phs=[])

# ---------------- P15 마감 ----------------
@page
def p15():
    s = Slide('L_SOL_15', bg='#000000', color='#ffffff')
    s.static(380, 320.5, 520, 80.5, 'logo_white')
    s.text(340, 650, '공유오피스 솔루션 제안 · [제안 부서명]', 13, color='rgba(255,255,255,0.45)', w=600, align='center', lh=18, nowrap=True)
    return s, dict(p='closing', p2=None, code='SOL-15 · L-15', name='검은 배경 · SAMSUNG 워드마크 마감', when='제안서 마지막 장 — 브랜드 워드마크만',
                   sample='N 공유오피스', eb='', hl='SAMSUNG', sub='', foot='공유오피스 솔루션 제안 · [제안 부서명]', req=[], prods=[], sols=[], phs=['[제안 부서명]'])
