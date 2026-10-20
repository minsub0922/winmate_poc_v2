# 8차 — 솔루션 제안 · 유저 시나리오 (사람이 솔루션을 쓰는 장면이 주인공) 8장
from gen_r5 import *
L = []

EB = '06 · 솔루션 제안 — 유저 시나리오'
G = '솔루션 · 사람'
SW = ' (고객 현장 인물 사진으로 교체)'


def T(b, text, x, y, w, h=None, st=''):
    return b.tb(text, ab(x, y, w, h, st), 'div')


def ui(b, pid, x, y, w, h, hint, radius=10, pad=6, bg=SOFT):
    """솔루션 화면 — 잘리지 않게 contain"""
    return b.img(pid, ab(x, y, w, h), fit='contain', kind='ui', hint=hint, radius=radius, pad=pad, bg=bg)


def row(inner, x, y, w, h, gap=8, extra=''):
    return f'<div style="{ab(x, y, w, h, f"display: flex; align-items: center; gap: {gap}px; {extra}")}">{inner}</div>'


def clock(b, t, size=18, color=BLUE):
    return b.tb(t, f'{NUM}; font-size: {size}px; font-weight: 800; line-height: {round(size * 1.4)}px; color: {color}; white-space: nowrap; flex-shrink: 0')


def ttl(b, t, size=15, color=INK, extra=''):
    return b.tb(t, f'font-size: {size}px; font-weight: 800; line-height: {round(size * 1.47)}px; color: {color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; {extra}')


def dsc(b, t, n=2, size=12.5, lh=18, color=BODY):
    return b.tb(t, f'font-size: {size}px; line-height: {lh}px; color: {color}; {clamp(n)}')


def ok(b, t='충족'):
    return b.tb(t, f'align-self: center; flex-shrink: 0; height: 20px; padding: 0 8px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


def actor(b, t, hi=False):
    bg, c = (BLUE, '#ffffff') if hi else ('#ffffff', INK)
    return b.tb(t, f'align-self: flex-start; flex-shrink: 0; height: 20px; padding: 0 8px; border-radius: 999px; background: {bg}; color: {c}; border: 1px solid {BLUE if hi else LINE}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


# ================================================================ 1 이상 감지 → 알림 → 조치 → 복구 (b.IoT · SmartThings Pro)
@layout(L, f='L_PH_SO_I', code='PH-SO-I', p='solution', p2='execution', name='이상 감지 → 복구 · 시각 스탬프 사진 4',
        when='설비 이상을 시스템이 먼저 알리고 엔지니어가 고치기까지, 누가 언제 무엇을 하는지 걸린 시간과 함께 보일 때',
        pv=[], sample=CUST['OF'], grp=G)
def _(b):
    s = header(b, EB, '설비가 먼저 알리고, [00]분 안에 복구합니다',
               'b.IoT · SmartThings Pro 장애 대응 시나리오 · 감지 → 알림 → 출동 · 점검 → 복구 확인 · 시각은 예시', w=1152)
    W, GP, PY, PH = 276, 16, 190, 250
    cols = [('09:12', '감지', '+1분', 'fill.meet_ac', '50% 15%', '이상이 난 실내기 · 설비 사진 (고객 건물 사진으로 교체)',
             '시스템', '설비가 스스로 이상을 알립니다', '온도 · 압력 · 전류 값이 기준을 벗어나면 바로 경보를 냅니다'),
            ('09:13', '알림', '+27분', 'ph.md-staff-tab', '62% 50%', '시설 담당자가 태블릿 · 폰으로 알림을 받는 장면' + SW,
             '시설 담당자', '폰 · 대시보드로 동시에 받습니다', '위치 · 증상 · 최근 이력이 함께 와서 출동 전에 원인을 좁힙니다'),
            ('09:40', '출동 · 점검', '+25분', 'ph.p-svc-ac-engineer', '55% 35%', '천장 실내기를 점검하는 서비스 엔지니어' + SW,
             '서비스 엔지니어', '원인을 알고 부품을 챙겨 갑니다', '원격 진단 결과대로 필터 · 센서를 교체해 한 번 방문에 끝냅니다'),
            ('10:05', '복구 확인', None, 'ph.of-control-room', '50% 70%', '관제실에서 화면으로 복구를 확인하는 직원' + SW,
             '관제 · 시설팀', '복구를 화면으로 확인하고 닫습니다', '조치 내용 · 걸린 시간이 이력으로 남아 월간 보고에 반영됩니다')]
    s += rect(64, 165, 1152, 2, LINE)
    for i, (t, nm, gap, pid, pos, hint, who, title, desc) in enumerate(cols):
        x = 64 + i * (W + GP)
        s += row(numtag(b, str(i + 1), 24) + clock(b, t, 18) + ttl(b, nm, 15)
                 + (b.tb(gap + ' →', f'margin-left: auto; align-self: center; height: 22px; padding: 0 9px; border-radius: 999px; background: {CHIP}; color: {BLUE}; {NUM}; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap') if gap
                    else b.tb('완료', f'margin-left: auto; align-self: center; height: 22px; padding: 0 10px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')),
                 x, 152, W, 28, gap=8, extra='background: #ffffff; padding-right: 0')
        s += photo(b, pid, x, PY, W, PH, pos=pos, hint=hint, radius=12)
        s += card(actor(b, who, hi=(i == 0)) + ttl(b, title, 15) + dsc(b, desc, 2), x, PY + PH + 10, W, 118, pad='11px 14px', gap=4)
    # 사진 위 표시
    s += label_on(b, '자동 감지 · 7층 회의실 실내기', '토출 온도 이상 · 필터 막힘', 64 + 10, PY + PH - 10 - 58, W - 20, lines=1)
    x2 = 64 + (W + GP)
    s += tag_on(b, '알림 도착 · 09:13', x2 + 10, PY + 10)
    s += ui(b, 'fill.biot_dash', x2 + W - 10 - 140, PY + PH - 10 - 82, 140, 82, 'b.IoT 대시보드 알림 화면', radius=8, pad=4, bg='#ffffff')
    s += tag_on(b, '현장 도착 · 09:40', 64 + 2 * (W + GP) + 10, PY + 10)
    s += label_on(b, '정상 복귀 · 10:05', '설정 온도 [24]℃ 도달 확인', 64 + 3 * (W + GP) + 10, PY + PH - 10 - 58, W - 20, lines=1)
    # 아래 — 걸린 시간 비교
    BY = 578
    s += box(64, BY, 1152, 70, CHIP, 12)
    s += (f'<div style="{ab(84, BY + 10, 230, 50, "display: flex; flex-direction: column; gap: 0")}">'
          + b.tb('알림부터 복구까지', f'font-size: 12px; font-weight: 800; line-height: 18px; color: {BODY}; white-space: nowrap')
          + bignum(b, '[53]', '분', size=26, unit_size=14) + '</div>')
    BX = 330
    for k, (lab, w, c, val, vc) in enumerate([('지금 · 전화 접수 → 순회 점검', 380, '#c3c8d1', '[0]시간 [00]분', MUTED),
                                              ('도입 후 · 자동 감지 → 원격 진단', 112, BLUE, '[53]분', BLUE)]):
        y = BY + 14 + k * 24
        s += T(b, lab, BX, y, 210, 18, f'font-size: 12px; font-weight: 700; line-height: 18px; color: {BODY}; white-space: nowrap')
        s += rect(BX + 214, y + 3, w, 12, c, 3)
        s += T(b, val, BX + 214 + w + 8, y, 110, 18, f'{NUM}; font-size: 13px; font-weight: 800; line-height: 18px; color: {vc}; white-space: nowrap')
    s += f'<div style="{ab(1040, BY + 24, 160, 22, "display: flex; justify-content: flex-end")}">' + evid(b, '근거 · 대응 이력 p.[00]') + '</div>'
    s += footer(b, DEAL['OF'] + ' · 시각 · 걸린 시간 · 막대 길이는 예시 · 출처: [장애 대응 이력, 연도] · 사진: samsung.com 오피스 · 호텔 도입사례 · 비즈니스 페이지', 17)
    return s


# ================================================================ 2 본사 → 매장 콘텐츠 배포 (MagicINFO · VXT)
@layout(L, f='L_PH_SO_J', code='PH-SO-J', p='solution', p2='scenario', name='본사 → 매장 배포 · 담당자 · 화면 · 손님 사진',
        when='본사 담당자가 콘텐츠를 한 번 올리면 여러 매장 화면이 바뀌고 손님이 보기까지를 사람 사진과 걸린 시간으로 보일 때',
        pv=[], sample=CUST['FB'], grp=G)
def _(b):
    s = header(b, EB, '본사에서 한 번 바꾸면, [000]개 매장이 같은 날 바뀝니다',
               'MagicINFO · VXT 콘텐츠 배포 시나리오 · 신메뉴 출시일 · 본사 담당자 → CMS → 매장 손님 · 시각은 예시', w=1152)
    AX, AW, BX, BW, CX, CW = 64, 372, 480, 320, 844, 372
    PY = 188
    for x, w, n, who, t in [(AX, AW, '1', '본사 마케팅 담당', '10:00'), (BX, BW, '2', 'CMS · 편집 → 예약 배포', '10:15'), (CX, CW, '3', '매장 · 손님이 보는 화면', '11:00')]:
        s += row(numtag(b, n, 24) + ttl(b, who, 15) + b.tb(t, f'margin-left: auto; {NUM}; font-size: 16px; font-weight: 800; line-height: 22px; color: {BLUE}; white-space: nowrap'), x, 152, w, 26, gap=8)
    # A 본사 담당자
    s += photo(b, 'ph.rt-staff-tablet', AX, PY, AW, 290, pos='22% 50%', hint='본사 담당자가 노트북 · 태블릿으로 콘텐츠를 올리는 장면' + SW, radius=12)
    s += label_on(b, '10:00 · 본사', '신메뉴 이미지 · 가격을 한 번 올립니다', AX + 10, PY + 290 - 10 - 62, AW - 20, lines=1)
    # B CMS 화면
    s += ui(b, 'fill.vxt_canvas', BX, PY, BW, 176, 'VXT Canvas 편집 화면', radius=12, pad=8)
    s += tag_on(b, '편집 · 템플릿에 교체', BX + 10, PY + 10)
    s += ui(b, 'fill.mi_playlist', BX, PY + 186, BW, 104, 'MagicINFO 플레이리스트 · 예약 배포 화면', radius=12, pad=8)
    s += tag_on(b, '예약 배포 · 매장 그룹별', BX + 10, PY + 196)
    for ax in (AX + AW, BX + BW):
        s += ARR(ax + 1, PY + 130, w=42, h=30, size=24)
    # C 매장 손님
    s += photo(b, 'ph.p-fb-dt-driver2', CX, PY, CW, 196, pos='50% 45%', hint='매장 화면 앞의 손님 — 드라이브스루 메뉴보드' + SW, radius=12)
    s += tag_on(b, '11:00 · 드라이브스루', CX + 10, PY + 10)
    SW3 = (CW - 2 * 9) // 3
    for k, (pid, pos, tg, hint) in enumerate([('fill.kiosk_touch', '70% 40%', 'B점 키오스크', '키오스크로 주문하는 손님'),
                                              ('ph.p-fb-dt-driver3', '60% 40%', 'C점 DT', '드라이브스루 메뉴 화면을 보는 손님'),
                                              ('ph.p-fb-staff-tab', '50% 40%', 'D점 테이블', '직원이 손님에게 주문 태블릿을 보여 주는 장면')]):
        x = CX + k * (SW3 + 9)
        s += photo(b, pid, x, PY + 204, SW3 if k < 2 else CW - 2 * (SW3 + 9), 86, pos=pos, hint=hint + SW, radius=10)
        s += tag_on(b, tg, x + 6, PY + 204 + 86 - 6 - 22, size=11)
    # 단계 설명
    for x, w, title, desc in [(AX, AW, '담당자 한 명이 한 번 올립니다', '매장별 파일 · USB 전달 없이 템플릿의 이미지 · 가격만 바꿉니다'),
                              (BX, BW, '승인 후 시간 예약으로 배포', '매장 그룹 · 시간대를 정해 11:00에 전 매장 동시 전환'),
                              (CX, CW, '손님은 출시 첫 시간부터 봅니다', '드라이브스루 · 카운터 · 키오스크가 같은 메뉴로 바뀝니다')]:
        s += card(ttl(b, title, 15) + dsc(b, desc, 2), x, 490, w, 76, pad='10px 14px', gap=2)
    # 아래 — 걸린 시간 막대
    BY = 580
    s += box(64, BY, 1152, 68, SOFT, 12)
    s += (f'<div style="{ab(84, BY + 9, 170, 50, "display: flex; flex-direction: column; gap: 0")}">'
          + b.tb('출시 당일 걸린 시간', f'font-size: 12px; font-weight: 800; line-height: 18px; color: {BODY}; white-space: nowrap')
          + bignum(b, '[65]', '분', size=26, unit_size=14) + '</div>')
    X0, TW = 270, 620
    segs = [('편집 [15]분', 15, BLUE, '#ffffff'), ('승인 · 예약 [10]분', 10, '#5b6fd0', '#ffffff'), ('전송 · 재생 대기 [35]분', 35, '#c3ccf2', INK), ('확인', 5, '#8fa0e0', '#ffffff')]
    x = X0
    for lab, m, c, tc in segs:
        w = round(TW * m / 65)
        s += b.tb(lab, ab(x, BY + 22, w - 3, 24, f'border-radius: 5px; background: {c}; color: {tc}; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden'), 'div')
        x += w
    s += (f'<div style="{ab(912, BY + 10, 290, 48, "display: flex; flex-direction: column; justify-content: center; gap: 0")}">'
          + b.tb('지금 · 매장 방문 · USB 교체', f'font-size: 12px; font-weight: 700; line-height: 18px; color: {MUTED}; white-space: nowrap')
          + b.tb('[3]일 · 매장마다 바뀌는 날이 다름', f'font-size: 14px; font-weight: 800; line-height: 22px; color: {MUTED}; white-space: nowrap') + '</div>')
    s += footer(b, DEAL['FB'] + ' · 시각 · 걸린 시간은 예시 · 매장 수는 고객 확인 후 · 사진: samsung.com 외식 · 리테일 도입사례 · 솔루션 화면', 18)
    return s


# ================================================================ 3 현장 작업자 모바일 (Knox · 러기드 단말)
@layout(L, f='L_PH_SO_K', code='PH-SO-K', p='solution', p2='products', name='현장 작업자 하루 · 인물 + 단계 사진 4 + 단말',
        when='현장 작업자가 러기드 단말 한 대로 출근 인증부터 보고까지 끝내는 하루를 사람 사진 · 제품 컷과 함께 보일 때',
        pv=[], sample=CUST['MF'], grp=G)
def _(b):
    s = header(b, EB, '작업자 손에 단말 하나, 출근부터 보고까지 이어집니다',
               '러기드 단말 + Knox Suite · L 제조 현장 작업자의 하루 4단계 · 시각은 예시', w=1152)
    s += photo(b, 'r4.mf-helmet', 64, 152, 360, 496, pos='82% 40%', hint='러기드 단말을 쓰는 현장 작업자' + SW, radius=12)
    s += tag_on(b, '현장 작업자 · 교대조 [3]개', 76, 164)
    s += label_on(b, '작업자 [000]명 · 단말 [000]대', '장갑 낀 손으로도 한 대로 끝냅니다', 74, 648 - 10 - 62, 340, lines=1)
    steps = [('07:50', '출근 인증', 'ph.mf-worker-watch', '50% 35%', '작업자가 단말 · 워치로 출근을 인증하는 장면',
              '사원증 태그 · 생체 인증으로 로그인, 교대조 단말을 바로 내 것처럼', 'Knox Manage'),
             ('08:00', '작업 지시', 'ph.p-mf-staff-tablet', '50% 35%', '작업 지시를 함께 확인하는 직원',
              '오늘 라인 · 설비 작업이 단말로 내려오고 업무 앱만 열립니다', 'Knox Configure'),
             ('10:30', '스캔', 'fill.scan_tab', '50% 60%', '단말 카메라로 부품 바코드를 스캔하는 손',
              '전용 스캐너 없이 카메라로 부품 · 박스 바코드를 읽어 기록', 'Knox Capture'),
             ('17:00', '보고', 'fill.dex_mfg', '30% 50%', '현장 모니터에 단말을 연결해 보고하는 작업자',
              '사진 · 서명을 붙여 보고, 모니터에 꽂으면 큰 화면으로 정리', 'Samsung DeX')]
    MX, RH, RG = 440, 116, 10
    for i, (t, nm, pid, pos, hint, desc, sol) in enumerate(steps):
        y = 152 + i * (RH + RG)
        s += photo(b, pid, MX, y, 160, RH, pos=pos, hint=hint + SW, radius=10)
        s += card('<span style="display: flex; align-items: center; gap: 8px">' + numtag(b, str(i + 1), 22) + clock(b, t, 15) + ttl(b, nm, 16) + '</span>'
                  + dsc(b, desc, 2) + pill(b, sol, bg=CHIP, color=BLUE, extra='margin-top: auto'),
                  MX + 168, y, 448 - 168 + 8, RH, pad='10px 14px', gap=4)
    RX, RW = 912, 304
    s += cut(b, 'cut.tabactive5', RX, 152, RW, 214, hint='갤럭시 탭 액티브 제품 컷', pad=20)
    s += pill(b, '갤럭시 탭 액티브 · 지시 · 보고', extra=f'position: absolute; left: {RX + 12}px; top: 162px')
    s += cut(b, 'cut.xcover7', RX, 376, RW, 160, hint='갤럭시 XCover 제품 컷', pad=16)
    s += pill(b, 'XCover · 스캔', extra=f'position: absolute; left: {RX + 12}px; top: 386px')
    chips = ''.join(chip(b, c, color=BODY, bg='#ffffff', size=11.5) for c in ['[IP68] 방수 · 방진', '[MIL-STD-810H]', '장갑 터치', '배터리 교체형'])
    s += card(ttl(b, '현장용 기본기', 14) + f'<span style="display: flex; flex-wrap: wrap; gap: 6px">{chips}</span>', RX, 546, RW, 102, pad='10px 14px', gap=6)
    s += footer(b, DEAL['MF'] + ' · 시각은 예시 · 사양은 [제조사 사양서, 연도] 확인 · 사진: samsung.com 제조 · 물류 도입사례 · 비즈니스 페이지 · 제품 컷', 19)
    return s


# ================================================================ 4 손님 셀프 서비스 5단계 (키오스크 · 무인 복합기 · 모바일)
@layout(L, f='L_PH_SO_L', code='PH-SO-L', p='solution', p2='user', name='손님 셀프 동선 5단계 · 사진 + 화면 칩',
        when='무인 매장에서 손님이 혼자 들어와 고르고 결제하고 나가는 흐름과, 그 덕에 직원이 안 해도 되는 일을 함께 보일 때',
        pv=[], sample=CUST['SV'], grp=G)
def _(b):
    s = header(b, EB, '손님 혼자 들어와 쓰고 나가는 [5]분, 카운터는 비어도 됩니다',
               '키오스크 · 무인 복합기 · 모바일 셀프 서비스 · N 체인 무인 매장 손님 동선 5단계 · 시간은 예시', w=1152)
    W, GP = 218, 15
    s += rect(64, 506, 1152, 1, LINE)
    steps = [('들어옴', '[10]초', 'ph.sv-study-tab', '60% 50%', '입실 태블릿', '태블릿으로 입실하는 손님', 'QR 입실 · 좌석 고르기',
              '좌석 안내 · 입실 확인', '빈 좌석 자동 배정'),
             ('고름', '[1]분', 'ph.p-sv-mfp-user', '45% 50%', '복합기 화면', '복합기 화면에서 메뉴를 고르는 손님', '출력 · 스캔 메뉴 큰 버튼',
              '용지 · 옵션 설명', '화면 안내 · 미리 보기'),
             ('결제', '[20]초', 'r4.ed-mfp-card', '40% 50%', '카드 · 간편결제', '무인 기기에서 카드로 결제하는 손님', '카드 · 간편결제 · 영수증',
              '계산 · 현금 정산', '무인 결제 · 매출 자동 집계'),
             ('이용', '[3]분', 'r4.sv-cvs-print', '60% 50%', '무인 복합기', '무인 복합기로 출력하는 손님', '진행 상태 · 남은 매수',
              '출력물 전달 · 고장 확인', '용지 · 토너 원격 알림'),
             ('나감', '[10]초', 'ph.oe-phone-user', '55% 40%', '모바일 앱', '휴대폰으로 영수증 · 쿠폰을 받는 손님', '영수증 · 재방문 쿠폰 알림',
              '퇴실 확인 · 재방문 안내', '퇴실 자동 · 쿠폰 발송')]
    for i, (nm, t, pid, pos, dev, hint, scr, job, auto) in enumerate(steps):
        x = 64 + i * (W + GP)
        s += row(numtag(b, str(i + 1), 24) + ttl(b, nm, 16) + b.tb(t, f'margin-left: auto; {NUM}; font-size: 13px; font-weight: 800; line-height: 20px; color: {MUTED}; white-space: nowrap'), x, 152, W, 26, gap=8)
        s += photo(b, pid, x, 186, W, 244, pos=pos, hint=hint + SW, radius=12)
        s += tag_on(b, dev, x + 8, 194, size=11)
        s += (f'<div style="{ab(x, 440, W, 52, "box-sizing: border-box; border-radius: 10px; background: #1b2030; padding: 7px 12px; display: flex; flex-direction: column; gap: 1px")}">'
              + b.tb('손님이 보는 화면', f'font-size: 10.5px; font-weight: 800; line-height: 15px; color: {LB}; white-space: nowrap')
              + b.tb(scr, 'font-size: 13px; font-weight: 800; line-height: 20px; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        if i < 4:
            s += ARR(x + W - 3, 456, w=21, h=20, size=14)
        s += card(b.tb(job, f'font-size: 13.5px; font-weight: 700; line-height: 20px; color: {FAINT}; text-decoration: line-through; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                  + b.tb('→ ' + auto, f'font-size: 13px; font-weight: 800; line-height: 20px; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
                  x, 554, W, 94, bg=SOFT, pad='10px 14px', gap=4, extra='justify-content: center')
    s += row(b.tb('직원이 안 해도 되는 일', f'font-size: 16px; font-weight: 800; line-height: 24px; color: {INK}; white-space: nowrap')
             + b.tb('손님 한 명당 직원 손이 가던 일 [5]가지가 기기로 넘어갑니다', f'font-size: 12.5px; line-height: 18px; color: {MUTED}; white-space: nowrap'),
             80, 516, 720, 26, gap=12)
    s += row(b.tb('원격 관리', f'font-size: 12px; font-weight: 700; color: {BODY}; white-space: nowrap')
             + bignum(b, '[1]', '명', size=20, unit_size=13) + b.tb('이', f'font-size: 12px; font-weight: 700; color: {BODY}')
             + bignum(b, '[00]', '개 매장', size=20, unit_size=13), 900, 514, 300, 30, gap=5, extra='justify-content: flex-end')
    s += footer(b, DEAL['SV'] + ' · 단계별 시간은 예시 · 매장 수는 고객 확인 후 · 사진: samsung.com 생활 편의 · 모바일 도입사례 · 비즈니스 페이지', 20)
    return s


# ================================================================ 5 투숙객 시나리오 (LYNK Cloud · 호텔 TV)
@layout(L, f='L_PH_SO_M', code='PH-SO-M', p='solution', p2='scenario', name='투숙객 4장면 · 인물 사진 + 객실 TV 화면',
        when='투숙객이 체크인부터 체크아웃까지 객실 TV로 무엇을 하고, 그때마다 호텔이 무엇을 얻는지 사람 사진과 TV 화면으로 보일 때',
        pv=[], sample=CUST['HT'], grp=G)
def _(b):
    s = header(b, EB, '투숙객이 프런트를 덜 찾을수록, 객실 TV가 일합니다',
               'LYNK Cloud · 호텔 TV 투숙객 시나리오 · B 호텔 체크인부터 체크아웃까지 4장면 · 수치는 예시', w=1152)
    W, GP = 276, 16
    cols = [('15:00', '체크인', 'fill.ht_front', '50% 55%', '프런트에서 체크인하는 투숙객', '키만 받고 바로 객실로',
             'fill.lynk_mgmt', 'PMS 체크인 → TV 이름 · 언어 자동', '프런트 안내 [5]분 → [1]분, 대기 줄이 짧아집니다'),
            ('15:20', '입실 · 웰컴', 'ph.p-oe-relax-tab', '60% 45%', '객실에서 쉬며 화면을 고르는 투숙객', '들어서면 TV가 이름으로 맞이',
             'fill.lynk_welcome', '웰컴 · 와이파이 · 조식 시간 안내', '반복 문의 전화 [00]% ↓ — 안내가 TV에 있습니다'),
            ('19:00', '저녁 주문 · 안내', 'ph.ht-buffet-signage', '60% 60%', '레스토랑 · 다이닝을 이용하는 투숙객', '레스토랑 · 룸서비스를 TV에서 고름',
             'fill.lynk_home', '다이닝 메뉴 · 룸서비스 주문', '객실 내 주문 [00]% ↑ — 부대 매출이 늘어납니다'),
            ('다음 날 11:00', '체크아웃', 'ph.p-ht-kids-pool', '75% 60%', '체크아웃 전 부대시설을 즐기는 투숙객 가족', '청구 확인은 TV로, 남은 시간은 수영장',
             'fill.lynk_cloud', '청구 확인 · 익스프레스 체크아웃', '체크아웃 대기 [0]분 → [0]분, 후기 요청까지 자동')]
    for i, (t, nm, pid, pos, hint, cap, tv, scr, gain) in enumerate(cols):
        x = 64 + i * (W + GP)
        s += row(numtag(b, str(i + 1), 24) + clock(b, t, 16) + ttl(b, nm, 15), x, 152, W, 26, gap=8)
        s += photo(b, pid, x, 186, W, 198, pos=pos, hint=hint + SW, radius=12)
        s += tag_on(b, cap, x + 8, 186 + 198 - 8 - 26, size=12)
        # 객실 TV 화면 (어두운 테두리)
        s += box(x, 394, W, 124, '#1b2030', 10)
        s += ui(b, tv, x + 6, 400, W - 12, 112, '객실 TV 화면 — ' + scr, radius=6, pad=0, bg='#0e1118')
        s += b.tb('객실 TV', ab(x + 12, 406, extra=f'border-radius: 999px; background: #ffffff; color: {BLUE}; font-size: 11px; font-weight: 800; padding: 3px 9px; white-space: nowrap'), 'div')
        s += T(b, scr, x, 524, W, 20, f'font-size: 12.5px; font-weight: 700; line-height: 20px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
        s += card(b.tb('호텔이 얻는 것', f'font-size: 11.5px; font-weight: 800; line-height: 16px; color: {BLUE}; white-space: nowrap')
                  + b.tb(gain, f'font-size: 14px; font-weight: 800; line-height: 21px; color: {INK}; {clamp(3)}'),
                  x, 552, W, 96, bg=CHIP, pad='10px 14px', gap=3)
        if i < 3:
            s += ARR(x + W - 2, 446, w=20, h=20, size=14)
    s += footer(b, DEAL['HT'] + ' · 시각 · 수치는 예시 · 출처: [호텔 운영 데이터, 연도] · 사진: samsung.com 호텔 · 외식 도입사례 · LYNK Cloud 화면', 21)
    return s


# ================================================================ 6 수업 · 회의 협업 (전자칠판 · DeX)
@layout(L, f='L_PH_SO_N', code='PH-SO-N', p='solution', p2='scenario', name='수업 · 회의 3장면 · 인물 사진 + 준비 시간',
        when='교수 · 학생 · 교직원이 전자칠판과 DeX로 수업 · 회의를 바로 시작하는 장면을 보이고 준비 시간이 줄어드는 것을 짚을 때',
        pv=[], sample=CUST['ED'], grp=G)
def _(b):
    s = header(b, EB, '켜고 꽂으면 바로 수업 · 회의, 준비 시간이 사라집니다',
               '전자칠판 + Samsung DeX · 교수 · 학생 · 교직원 3장면 · E 대학교 강의동 기준', w=1152)
    s += photo(b, 'r4.ed-teacher-board', 64, 152, 600, 300, pos='55% 40%', hint='전자칠판으로 수업하는 교수' + SW, radius=12)
    s += tag_on(b, '장면 1 · 교수 강의', 76, 164)
    s += label_on(b, '강의실 · 09:00 수업', '판서를 바로 저장하고 학생 화면을 띄웁니다', 74, 452 - 10 - 58, 400, lines=1)
    s += row(chip(b, '전자칠판 [75]형', color='#ffffff', bg=BLUE, extra='align-self: center')
             + ''.join(chip(b, c, extra='align-self: center') for c in ['판서 저장 · 공유', '학생 화면 띄우기', '녹화 · 다시 보기']), 64, 462, 600, 24, gap=6)
    RX, PW = 680, 286
    for k, (pid, pos, tg, title, desc, dev, feats, hint) in enumerate([
            ('r4.ed-class-display', '45% 50%', '장면 2 · 학생 팀 과제', '각자 태블릿에서 큰 화면으로', '모둠별 화면을 전자칠판에 나눠 띄워 바로 비교합니다',
             '갤럭시 탭', '화면 미러링', '태블릿과 대형 화면으로 수업하는 학생'),
            ('fill.meet_video', '40% 50%', '장면 3 · 교직원 회의', '휴대폰 하나로 회의를 시작', 'DeX로 연결하면 PC 없이 자료 공유 · 화상 회의',
             'Samsung DeX', '화상 회의', '대화면으로 화상 회의를 하는 교직원')]):
        y = 152 + k * 168
        s += photo(b, pid, RX, y, PW, 160, pos=pos, hint=hint + SW, radius=12)
        s += tag_on(b, tg, RX + 8, y + 8, size=11)
        s += card(ttl(b, title, 15) + dsc(b, desc, 2)
                  + '<span style="margin-top: auto; display: flex; gap: 6px">' + chip(b, dev, color='#ffffff', bg=BLUE) + chip(b, feats) + '</span>',
                  RX + PW + 10, y, 1216 - RX - PW - 10, 160, pad='12px 14px', gap=4)
    # 아래 — 준비 시간
    BY = 504
    s += box(64, BY, 760, 144, SOFT, 12)
    s += row(b.tb('수업 · 회의 시작까지 준비 시간', f'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap')
             + b.tb('강의실 1곳 · 수업 1회 기준', f'font-size: 12px; line-height: 18px; color: {MUTED}; white-space: nowrap'), 84, BY + 12, 700, 24, gap=10)
    s += T(b, '지금', 84, BY + 50, 60, 26, f'font-size: 13px; font-weight: 800; line-height: 26px; color: {MUTED}; white-space: nowrap')
    x = 146
    for lab, w in [('PC 켜기 · 로그인', 180), ('케이블 · 입력 전환', 170), ('파일 USB 이동', 150)]:
        s += b.tb(lab, ab(x, BY + 50, w - 3, 26, f'border-radius: 5px; background: #c3c8d1; color: {INK}; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden'), 'div')
        x += w
    s += row(bignum(b, '[15]', '분', size=24, color=MUTED, unit_size=13), x + 10, BY + 46, 120, 34)
    s += T(b, '도입 후', 84, BY + 94, 60, 26, f'font-size: 13px; font-weight: 800; line-height: 26px; color: {BLUE}; white-space: nowrap')
    s += b.tb('꽂고 켜기', ab(146, BY + 94, 90, 26, f'border-radius: 5px; background: {BLUE}; color: #ffffff; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
    s += row(bignum(b, '[1]', '분', size=24, unit_size=13) + b.tb('하루 [6]교시면 [00]분이 수업으로 돌아옵니다', f'font-size: 12.5px; font-weight: 700; line-height: 18px; color: {BODY}; white-space: nowrap'),
             246, BY + 90, 560, 34, gap=12)
    s += cut(b, 'cut.wa75d', 840, BY, 220, 144, hint='전자칠판 제품 컷', pad=14)
    s += cut(b, 'cut.tabs11', 1070, BY, 146, 144, hint='갤럭시 탭 제품 컷', pad=14)
    s += footer(b, DEAL['ED'] + ' · 준비 시간은 예시 · 출처: [강의실 운영 조사, 연도] · 사진: samsung.com 교육 · 오피스 도입사례 · 비즈니스 페이지 · 제품 컷', 22)
    return s


# ================================================================ 7 시설 담당자의 에너지 하루 (통합공조 · SmartThings Pro)
@layout(L, f='L_PH_SO_O', code='PH-SO-O', p='solution', p2='effect', name='시설 담당자 하루 · 인물 + 시간대 4 + 절감',
        when='시설 담당자 한 사람의 하루를 따라가며 시간대마다 공조가 알아서 줄어드는 장면과 절감 수치를 함께 보일 때',
        pv=[], sample=CUST['OF'], grp=G)
def _(b):
    s = header(b, EB, '시설 담당자의 하루, 에너지는 시간대마다 알아서 줄어듭니다',
               '통합공조 + SmartThings Pro · C 빌딩 시설팀 하루 4장면 · 절감 수치는 예시 · 출처: [에너지 시뮬레이션, 연도]', w=1152)
    s += photo(b, 'ph.of-desk-control', 64, 152, 300, 496, pos='55% 50%', hint='PC로 냉난방을 관리하는 시설 담당자' + SW, radius=12)
    s += tag_on(b, '시설 담당 · [2]명', 76, 164)
    s += label_on(b, '[00]개 층 · 실내기 [000]대', '화면 하나로 건물 전체를 봅니다', 74, 648 - 10 - 58, 280, lines=1)
    # 하루 막대 (시간대별 냉난방 전력, 예시)
    MX, MW = 380, 560
    s += box(MX, 152, MW, 112, SOFT, 12)
    s += row(b.tb('시간대별 냉난방 전력 · 하루', f'font-size: 12.5px; font-weight: 800; line-height: 18px; white-space: nowrap')
             + '<span style="margin-left: auto"></span>'
             + f'<span style="width: 10px; height: 10px; border-radius: 2px; background: #c3c8d1"></span>' + b.tb('지금', f'font-size: 11px; color: {MUTED}; white-space: nowrap')
             + f'<span style="width: 10px; height: 10px; border-radius: 2px; background: {BLUE}; margin-left: 6px"></span>' + b.tb('도입 후', f'font-size: 11px; color: {MUTED}; white-space: nowrap'),
             MX + 14, 160, MW - 28, 20, gap=5)
    before = [2, 5, 7, 8, 8, 9, 9, 10, 10, 9, 8, 7, 5, 4, 3, 2]
    after = [3, 5, 6, 6, 6, 7, 6, 6, 5, 6, 5, 4, 3, 1, 1, 1]
    BX0, BASE, HW = MX + 20, 238, 33
    for h in range(16):
        x = BX0 + h * HW
        s += rect(x + 3, BASE - before[h] * 4, 12, before[h] * 4, '#c3c8d1', 2)
        s += rect(x + 16, BASE - after[h] * 4, 12, after[h] * 4, BLUE, 2)
        if h % 3 == 0:
            s += T(b, f'{h + 6:02d}', x, BASE + 4, 32, 14, f'{NUM}; font-size: 10.5px; line-height: 14px; color: {MUTED}; text-align: center; white-space: nowrap')
    s += rect(BX0, BASE, 16 * HW, 1, '#b8bec8')
    for n, hh in [('1', 7), ('2', 14), ('3', 15), ('4', 18)]:
        s += pin(b, n, BX0 + (hh - 6) * HW + 16, 190, size=20)
    # 4 장면 카드 2×2
    scenes = [('07:30', '출근 전 예약 운전', 'fill.lobby_ac', '50% 8%', 'photo', '출근 [30]분 전 로비 · 업무층만 미리, 빈 층은 그대로 둡니다', '출근 전 로비 · 업무층'),
              ('14:00', '피크 자동 제한', 'fill.stp_energy', None, 'ui', '목표 전력에 닿으면 실외기 출력을 [00]% 자동으로 낮춥니다', 'SmartThings Pro 에너지 관리 화면'),
              ('15:00', '빈 회의실 자동 꺼짐', 'ph.of-meeting-display', '50% 55%', 'photo', '예약이 없고 재실 센서가 [10]분 비면 냉난방 · 화면을 끕니다', '비어 있는 회의실'),
              ('18:00', '월말 리포트', 'fill.stp_dash', None, 'ui', '층 · 시간대별 사용량과 절감액을 보고서로 자동 정리합니다', 'SmartThings Pro 인사이트 대시보드')]
    CW, CH = 272, 176
    for i, (t, nm, pid, pos, kd, desc, hint) in enumerate(scenes):
        x = MX + (i % 2) * (CW + 16); y = 278 + (i // 2) * (CH + 2) + (i // 2) * 0
        y = 278 if i < 2 else 648 - CH
        s += box(x, y, CW, CH, SOFT, 12)
        if kd == 'photo':
            s += photo(b, pid, x, y, CW, 96, pos=pos, hint=hint + ' (고객 건물 사진으로 교체)', radius=12)
        else:
            s += ui(b, pid, x, y, CW, 96, hint, radius=12, pad=6, bg='#e9ecf1')
        s += pin(b, str(i + 1), x + 18, y + 18, size=22)
        s += (f'<div style="{ab(x, y + 100, CW, CH - 100, "box-sizing: border-box; padding: 4px 14px 8px; display: flex; flex-direction: column; gap: 2px")}">'
              + '<span style="display: flex; align-items: center; gap: 8px">' + clock(b, t, 14) + ttl(b, nm, 15) + '</span>'
              + dsc(b, desc, 2, size=12, lh=18) + '</div>')
    # 절감 수치
    RX, RW = 956, 260
    for k, (lab, v, u, d, dark) in enumerate([('냉난방 전력', '[00]', '% ↓', '작년 같은 달 대비', '근거 · 작년 고지서 p.[00]'),
                                              ('피크 전력', '[00]', 'kW ↓', '기본 요금 구간 낮춤', '근거 · 피크 기록 p.[00]'),
                                              ('월 전기 요금', '[000]', '만 원 ↓', '건물 전체 · 월 평균', '근거 · 시뮬레이션 p.[00]')]):
        y = 152 + k * 170
        ev, dark = dark, k == 2
        bg, lc, vc, dc = (BLUE, LT, '#ffffff', LT) if dark else (CHIP, BODY, BLUE, MUTED)
        s += card(b.tb(lab, f'font-size: 13px; font-weight: 800; line-height: 20px; color: {lc}; white-space: nowrap')
                  + bignum(b, v, u, size=40, color=vc, unit_size=17)
                  + b.tb(d, f'font-size: 12px; line-height: 18px; color: {dc}; white-space: nowrap')
                  + '<span style="margin-top: auto"></span>' + (evid(b, ev, color=BLUE, bg='#ffffff', border='#ffffff') if dark else evid(b, ev)),
                  RX, y, RW, 156 if k < 2 else 156, bg=bg, pad='14px 18px', gap=4)
    s += footer(b, DEAL['OF'] + ' · 막대 · 절감 수치는 예시 · 출처: [에너지 시뮬레이션, 연도] · 사진: samsung.com 오피스 도입사례 · SmartThings Pro 화면', 23)
    return s


# ================================================================ 8 IT 관리자 보안 시나리오 (Knox Manage · Knox Suite)
@layout(L, f='L_PH_SO_P', code='PH-SO-P', p='solution', p2='requirements', name='분실 대응 4단계 · 직원 · 관리자 사진 + 콘솔',
        when='업무 단말을 잃어버렸을 때 직원 신고부터 원격 잠금 · 삭제 · 새 단말까지 걸린 시간과 보안 요구 대응을 함께 보일 때',
        pv=[], sample=CUST['FN'], grp=G)
def _(b):
    s = header(b, EB, '단말을 잃어버려도, [5]분 안에 고객 정보를 지킵니다',
               'Knox Manage · Knox Suite 분실 대응 시나리오 · T 은행 영업점 태블릿 기준 · 시각은 예시', w=1152)
    PW, PH = 268, 336
    s += photo(b, 'ph.fn-counter', 64, 152, PW, PH, pos='28% 50%', hint='태블릿으로 고객을 응대하는 영업점 직원' + SW, radius=12)
    s += tag_on(b, '영업점 직원', 76, 164)
    s += label_on(b, '18:40 · 신고', '퇴근길에 태블릿이 없어졌어요', 74, 152 + PH - 10 - 58, PW - 20, lines=1)
    s += photo(b, 'ph.vn-control-staff', 1216 - PW, 152, PW, PH, pos='72% 50%', hint='콘솔로 단말을 관리하는 본사 IT 관리자' + SW, radius=12)
    s += tag_on(b, '본사 IT 관리자', 1216 - PW + 12, 164)
    s += label_on(b, '18:45 · 조치', 'Knox Manage 콘솔 하나로', 1216 - PW + 10, 152 + PH - 10 - 58, PW - 20, lines=1)
    MX, MW, RH, RG = 348, 584, 78, 8
    steps = [('18:40', '+0분', '분실 신고', 'fill.watch_phone', '직원이 앱 · 전화로 신고, 마지막 위치를 확인합니다', '← 직원', False, '직원 휴대폰 신고 화면'),
             ('18:45', '+5분', '원격 잠금', 'fill.km_console', '콘솔에서 단말 잠금, 화면에 회수 안내 문구를 띄웁니다', '관리자 →', True, 'Knox Manage 콘솔 · 잠금 화면'),
             ('18:50', '+10분', '업무 데이터 삭제', 'fill.knox_vault', '업무 영역만 원격 삭제, 고객 정보 접근을 막고 기록합니다', '관리자 →', True, 'Knox 보안 · 원격 삭제 화면'),
             ('08:50', '다음 날', '새 단말 재설정', 'fill.knox_cfg', '새 태블릿을 켜면 업무 앱 · 정책이 자동으로 깔립니다', '← 직원', False, 'Knox Configure 자동 설정 화면')]
    for i, (t, el, nm, pid, desc, who, adm, hint) in enumerate(steps):
        y = 152 + i * (RH + RG)
        s += box(MX, y, MW, RH, CHIP if adm else SOFT, 10)
        s += (f'<div style="{ab(MX + 12, y + 14, 62, 50, "display: flex; flex-direction: column; gap: 0")}">'
              + clock(b, t, 15) + b.tb(el, f'font-size: 11px; font-weight: 700; line-height: 16px; color: {MUTED}; white-space: nowrap') + '</div>')
        s += ui(b, pid, MX + 80, y + 6, 128, RH - 12, hint, radius=8, pad=3, bg='#ffffff')
        s += (f'<div style="{ab(MX + 220, y + 7, 270, RH - 14, "display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
              + ttl(b, nm, 15) + dsc(b, desc, 2, size=12, lh=18) + '</div>')
        s += row(b.tb(who, f'height: 24px; padding: 0 10px; border-radius: 999px; background: {BLUE if adm else "#ffffff"}; color: {"#ffffff" if adm else INK}; border: 1px solid {BLUE if adm else LINE}; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap'),
                 MX + 494, y + 27, 80, 24, extra='justify-content: flex-end')
    # 아래 — 보안 요구 대응
    BY, BH = 504, 144
    s += card(b.tb('신고부터 잠금까지', f'font-size: 12.5px; font-weight: 800; line-height: 18px; color: {LT}; white-space: nowrap')
              + bignum(b, '[5]', '분', size=40, color='#ffffff', unit_size=17)
              + b.tb('새 단말 업무 재개 · 다음 날 아침', f'font-size: 12px; line-height: 18px; color: {LT}; white-space: nowrap')
              + '<span style="margin-top: auto"></span>' + evid(b, '근거 · 보안 운영 절차 p.[00]', color=BLUE, bg='#ffffff', border='#ffffff'),
              64, BY, PW, BH, bg=BLUE, pad='14px 18px', gap=3)
    reqs = [('SER-003 · 필수', '분실 단말 즉시 잠금', 'Knox Manage 원격 잠금 · 회수 문구'),
            ('SER-004 · 필수', '고객 정보 원격 삭제', '업무 영역만 선택 삭제 · 키 보호'),
            ('SER-007 · 필수', '조치 이력 감사', '콘솔 로그 · 월간 보고 자동')]
    RW3 = (1216 - 348 - 2 * 16) // 3
    for k, (rid, req, ans) in enumerate(reqs):
        x = 348 + k * (RW3 + 16)
        s += card('<span style="display: flex; align-items: center; justify-content: space-between; gap: 6px">'
                  + b.tb(rid, f'{NUM}; font-size: 11.5px; font-weight: 700; line-height: 18px; color: {MUTED}; white-space: nowrap') + ok(b) + '</span>'
                  + ttl(b, req, 16) + b.tb('→ ' + ans, f'font-size: 12.5px; line-height: 18px; color: {BODY}; {clamp(2)}')
                  + '<span style="margin-top: auto"></span>' + evid(b, '대응 단계 ' + ['②', '③', '② ③'][k] + ' · p.[00]'),
                  x, BY, RW3, BH, pad='12px 16px', gap=4)
    s += footer(b, DEAL['FN'] + ' · 시각은 예시 · 요구 번호는 예시 RFP 기준 · 사진: samsung.com 금융 · 경기장 도입사례 · Knox 화면', 24)
    return s
