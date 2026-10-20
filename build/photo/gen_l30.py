# 8차 — 솔루션 제안 · 유저 시나리오 사진 레이아웃 8장 (사람이 나오는 실사 사진이 주인공)
# L_PH_SO_Q 같은 솔루션 · 사람마다 다른 화면 · L_PH_SO_R 시나리오 매트릭스 · L_PH_SO_S 시나리오 히어로 · L_PH_SO_T 현장 요원의 한 출동
# L_PH_SO_U 첫 사용 온보딩 · L_PH_SO_V 예외 상황 · L_PH_SO_W 파일럿 반응 · L_PH_SO_X 고객의 고객까지 (B2B2C)
from gen_r5 import *
L = []
EB = '06 · 솔루션 제안 — 유저 시나리오'
G = '솔루션 · 사람'


def foot(X, extra=''):
    return DEAL[X] + (' · ' + extra if extra else '') + ' · 사진: samsung.com 도입사례 · 비즈니스 페이지 (인물은 역할 참고)'


def lab(b, text, color=BLUE, size=12):
    return b.tb(text, f'font-size: {size}px; font-weight: 800; color: {color}; white-space: nowrap')


def tline(b, text, size=15, lh=22, lines=1, color=INK, weight=800):
    return b.tb(text, f'font-size: {size}px; font-weight: {weight}; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def dline(b, text, size=12.5, lh=18, lines=2, color=BODY):
    return b.tb(text, f'font-size: {size}px; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def row(inner, gap=6, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; {extra}">{inner}</span>'


def col(inner, gap=2, extra=''):
    return f'<span style="display: flex; flex-direction: column; gap: {gap}px; min-width: 0; {extra}">{inner}</span>'


def flex(x, y, w, h, inner, extra=''):
    return f'<div style="{ab(x, y, w, h, extra)}">{inner}</div>'


def hline(x, y, w, color=LINE, h=1):
    return f'<div style="{ab(x, y, w, h, f"background: {color}")}"></div>'


def vline(x, y, h, color=LINE, w=1):
    return f'<div style="{ab(x, y, w, h, f"background: {color}")}"></div>'


def big(b, val, size=40, color=BLUE):
    return b.tb(val, f'{NUM}; font-size: {size}px; font-weight: 800; line-height: {round(size * 1.25)}px; color: {color}; white-space: nowrap')


def schip(b, text, color=BLUE, bg=CHIP, center=False):
    """작은 칩 (flex 줄 · 열 어디서나)"""
    return b.tb(text, f'align-self: {"center" if center else "flex-start"}; height: 20px; padding: 0 8px; border-radius: 6px; background: {bg}; color: {color}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap; flex-shrink: 0')


def frame(b, pid, x, y, w, h, pos='50% 50%', hint='', bw=3):
    """흰 테두리 · 그림자 인셋 사진 (사람 사진 위에 겹치는 ‘보는 화면’)"""
    return (f'<div style="{ab(x, y, w, h, "box-sizing: border-box; border-radius: 10px; background: #ffffff; box-shadow: 0 6px 18px rgba(12,16,26,0.30)")}"></div>'
            + photo(b, pid, x + bw, y + bw, w - 2 * bw, h - 2 * bw, pos=pos, hint=hint, radius=8))


def capg(b, text, x, y, w, lines=2, size=13, lh=19):
    """사진 아래쪽 유리 캡션 (한두 줄)"""
    return glass(b.tb(text, f'font-size: {size}px; font-weight: 800; line-height: {lh}px; color: #ffffff; {clamp(lines)}'), x, y, w, None, pad='7px 11px', gap=0)


def bar(fill, color=BLUE, track='#dfe3ea', h=8, mark=None):
    """가로 막대 (span — flex 줄 안에서 늘어남). mark = 목표선 위치(0–1)"""
    m = f'<span style="position: absolute; left: {round(mark * 100)}%; top: -4px; width: 2px; height: {h + 8}px; background: {INK}"></span>' if mark else ''
    return (f'<span style="position: relative; flex: 1; height: {h}px; border-radius: {h // 2}px; background: {track}; display: block; min-width: 0">'
            f'<span style="position: absolute; left: 0; top: 0; height: {h}px; width: {round(fill * 100)}%; border-radius: {h // 2}px; background: {color}"></span>{m}</span>')


# ---------------------------------------------------------------- 1 같은 솔루션, 사람마다 다른 화면
@layout(L, f='L_PH_SO_Q', code='PH-SO-Q', p='solution', p2='user', name='같은 솔루션 · 사람마다 다른 화면 사진 짝',
        when='솔루션 하나를 손님 · 매장 직원 · 본사 매니저가 각자 다른 화면으로 쓸 때, 인물 사진과 그 사람이 보는 화면을 짝지어 하는 일을 보여줄 때',
        pv=[], sample=CUST['RT'], grp=G)
def _(b):
    s = header(b, EB, 'VXT 하나를, 세 사람이 서로 다른 화면으로 씁니다',
               'D 리테일 플래그십 매장 · 손님은 매장 화면, 직원은 폰 · 태블릿, 본사 매니저는 웹 콘솔 — 콘텐츠 · 데이터는 하나', w=1152)
    s += (f'<div style="{ab(64, 150, 1152, 28, f"box-sizing: border-box; border-radius: 8px; background: {CHIP}; padding: 0 14px; display: flex; align-items: center; gap: 12px")}">'
          + lab(b, 'VXT 하나', BLUE, 13)
          + b.tb('콘텐츠 · 일정 · 매장 데이터를 세 화면이 함께 씁니다 — 본사가 바꾸면 매장 화면 · 직원 폰에 [1]분 안에 반영',
                 f'font-size: 12.5px; font-weight: 700; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    cols = [('손님', '하루 [0,000]명', 'ph.p-rt-display-user', '50% 28%', '매장 화면을 쓰는 손님 사진 (고객 매장 인물 사진으로 교체)',
             'ph.rt-fashion-phone', '45% 50%', '손님이 보는 매장 화면 · 휴대폰 연동 (제안 콘텐츠 화면으로 교체)', '터치 사이니지 · 휴대폰',
             [('상품 비교', '색상 · 사양 · 가격을 화면에서 나란히'), ('재고 확인', '이 매장 · 온라인 재고를 한 번에'), ('QR로 담기', '고른 상품을 휴대폰 장바구니로')]),
            ('매장 직원', '매장당 [00]명', 'ph.rt-shoppers', '45% 35%', '태블릿으로 안내하는 매장 직원 사진 (고객 현장 인물 사진으로 교체)',
             'fill.phone_signage', '50% 60%', '직원이 폰으로 매장 화면을 바꾸는 화면', '업무 폰 · 태블릿',
             [('상담 화면 띄우기', '손님 앞 사이니지에 비교표를 전송'), ('오늘 행사 켜기', '폰에서 탭 한 번으로 매장 화면 전환'), ('꺼진 화면 알림', '고장 · 무신호는 바로 직원 폰으로')]),
            ('본사 매니저', '[000]개 매장 담당', 'ph.p-ed-pc-user', '60% 45%', 'PC 앞 본사 매니저 사진 (고객 현장 인물 사진으로 교체)',
             'fill.vxt_cms', '50% 30%', 'VXT CMS 웹 콘솔 화면', 'PC 웹 콘솔',
             [('일괄 배포', '[000]개 매장에 같은 시각 송출'), ('상권별 편성', '지역 · 매장 유형마다 다른 콘텐츠'), ('성과 보기', '화면별 재생 · 터치 반응 리포트')])]
    for i, (role, sub, pid, pos, hint, spid, spos, shint, see, items) in enumerate(cols):
        x = 64 + i * 392
        s += rect(x + 183, 178, 2, 10, BLUE)
        s += photo(b, pid, x, 188, 368, 206, pos=pos, hint=hint)
        s += tag_on(b, f'{i + 1} · {role} · {sub}', x + 12, 200)
        right = i == 0   # 사람이 왼쪽에 있는 사진은 인셋을 오른쪽에
        s += frame(b, spid, x + (204 if right else 12), 344, 152, 100, spos, shint)
        s += flex(x + (4 if right else 178), 404, 190, 42, lab(b, '보는 화면', MUTED, 11) + tline(b, see, 14, 20, 1),
                  'display: flex; flex-direction: column; gap: 2px')
        inner = lab(b, '이 화면에서 하는 일', BLUE, 12)
        for k, (t, d) in enumerate(items):
            inner += row(numtag(b, str(k + 1), 20) + col(tline(b, t, 14, 20, 1) + dline(b, d, 12, 17, 1), 1), 10, 'align-items: flex-start')
        s += card(inner, x, 456, 368, 192, bg=SOFT, pad='12px 16px', gap=9)
    s += footer(b, foot('RT', '인원 · 시간은 자리표시'), 16)
    return s


# ---------------------------------------------------------------- 2 시나리오 매트릭스 · 사람 × 시간
@layout(L, f='L_PH_SO_R', code='PH-SO-R', p='solution', p2='scenario', name='시나리오 매트릭스 · 인물 행 × 시간 열 사진',
        when='투숙객 · 직원 · 시설팀처럼 여러 사람의 하루를 시간대별 칸으로 펼쳐, 칸마다 장면 사진이나 한 줄과 솔루션 칩을 둘 때',
        pv=[], sample=CUST['HT'], grp=G)
def _(b):
    s = header(b, EB, '한 투숙객의 하룻밤, 세 사람이 같은 시스템으로 움직입니다',
               'B 호텔 · 행은 사람, 열은 시간 — 칸마다 그 순간의 장면과 쓰는 솔루션 · 시각은 예시', w=1152)
    times = [('도착', '15:00'), ('저녁', '19:00'), ('밤', '23:00'), ('출발', '11:00')]
    CX = [290, 524, 758, 992]
    CW, RH, RY = 224, 146, [186, 340, 494]
    s += b.tb('사람 ↓ · 시간 →', ab(64, 154, 214, 20, f'font-size: 12px; font-weight: 700; color: {MUTED}; white-space: nowrap'), 'div')
    s += hline(290, 178, 926, LINE, 2)
    for k, (nm, tm) in enumerate(times):
        s += flex(CX[k], 150, CW, 22, f'<i style="width: 10px; height: 10px; border-radius: 50%; background: {BLUE}; flex-shrink: 0"></i>'
                  + b.tb(nm, 'font-size: 15px; font-weight: 800; white-space: nowrap') + b.tb(tm, f'{NUM}; font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap'),
                  'display: flex; align-items: center; gap: 8px')
    heads = [('투숙객', '하루 [000]명', 'ph.p-ht-kids-pool', '78% 55%', '투숙객 가족 사진 (고객 호텔 인물 사진으로 교체)'),
             ('프런트', '교대당 [0]명', 'fill.ht_front', '45% 50%', '프런트 직원과 투숙객 사진 (고객 호텔 인물 사진으로 교체)'),
             ('시설팀', '설비 [000]대', 'ph.p-svc-ac-engineer2', '45% 40%', '시설 점검 엔지니어 사진 (고객 현장 인물 사진으로 교체)')]
    # 칸: ('p', pid, pos, 솔루션, 캡션) 또는 ('t', 솔루션, 제목, 설명)
    cells = [[('p', 'ph.ht-lobby-signage', '50% 35%', 'VXT', '로비 화면이 이름 · 객실 층을 안내합니다'),
              ('t', 'LYNK Cloud', '객실 TV로 레스토랑 자리를 예약', '프런트 전화 없이 시간만 고르면 끝'),
              ('p', 'ph.ht-room-night', '50% 50%', 'SmartThings Pro', '취침 모드 — 조명 · 냉난방이 알아서 낮아집니다'),
              ('t', 'LYNK Cloud', 'TV에서 청구서 확인 · 체크아웃', '프런트 줄 없이 키 반납만')],
             [('t', 'LYNK Cloud', '도착 전 객실 TV에 웰컴 화면 예약', '이름 · 와이파이 · 조식 안내 자동 표시'),
              ('p', 'fill.lynk_mgmt', '50% 50%', 'LYNK Cloud', '프런트 PC로 전 객실 TV 공지를 한 번에'),
              ('t', 'LYNK Cloud', '야간 문의는 TV 안내 화면이 먼저', '단순 문의 전화 −[00]%'),
              ('p', 'ph.ht-lobby-art', '50% 50%', 'VXT', '로비 화면에 공항 리무진 · 날씨 안내')],
             [('p', 'fill.stp_hotel', '30% 50%', 'SmartThings Pro', '체크인 [30]분 전 객실 냉난방을 미리 켭니다'),
              ('t', 'b.IoT', '연회장 공조를 예약 일정에 맞춰 가동', '행사가 끝나면 자동 절전'),
              ('p', 'fill.biot_floor', '50% 40%', 'b.IoT', '이상 알림 — 도면에서 실내기 위치 확인'),
              ('t', 'SmartThings Pro', '빈 객실은 자동 절전 · 점검 목록 생성', '객실 전력 −[00]%')]]
    for r, (who, sub, pid, pos, hint) in enumerate(heads):
        y = RY[r]
        s += photo(b, pid, 64, y, 214, RH, pos=pos, hint=hint)
        s += label_on(b, sub, who, 72, y + RH - 63, 120, lines=1)
        for k, c in enumerate(cells[r]):
            x = CX[k]
            if c[0] == 'p':
                _, cp, cpos, sol, cap = c
                s += photo(b, cp, x, y, CW, RH, pos=cpos, hint=f'{who} · {times[k][0]} 장면 (고객 현장 사진으로 교체)')
                s += tag_on(b, sol, x + 8, y + 8, dark=False, size=11)
                s += capg(b, cap, x + 8, y + RH - 54, CW - 16, lines=2, size=12.5, lh=18)
            else:
                _, sol, t, d = c
                s += card(schip(b, sol) + tline(b, t, 15, 22, 2) + '<span style="margin-top: auto"></span>' + dline(b, d, 12, 17, 1, MUTED),
                          x, y, CW, RH, bg=SOFT, pad='12px 14px', gap=6)
    s += footer(b, foot('HT', '시각 · 수치는 예시'), 17)
    return s


# ---------------------------------------------------------------- 3 시나리오 히어로 · 풀블리드 인물 사진 + 번호 말풍선
@layout(L, f='L_PH_SO_S', code='PH-SO-S', p='solution', p2='value', name='시나리오 히어로 · 인물 사진 위 번호 말풍선',
        when='손님이 화면을 쓰는 한 장면을 크게 보여주고, 사진 속 화면 · 손 · 사물에 번호를 달아 기능과 효과를 한 줄씩 설명할 때',
        pv=[], sample=CUST['FB'], grp=G)
def _(b):
    s = photo(b, 'ph.oe-phone-user', 0, 0, 1280, 720, pos='50% 40%', hint='손님이 휴대폰으로 주문하는 장면 (고객 매장 · 주문 앱 인물 사진으로 교체)', radius=0)
    s += f'<div style="{ab(0, 0, 1280, 250, "background: linear-gradient(180deg, rgba(10,14,24,0.80) 0%, rgba(10,14,24,0.55) 45%, rgba(10,14,24,0) 100%)")}"></div>'
    s += f'<div style="{ab(0, 600, 1280, 120, "background: linear-gradient(0deg, rgba(10,14,24,0.78) 0%, rgba(10,14,24,0) 100%)")}"></div>'
    s += header(b, EB, '자리에 앉은 채로 주문하고, 다 되면 알림을 받습니다',
                'A 커피 손님의 [5]분 · 주문 앱 · 매장 메뉴보드 · 픽업 화면이 한 흐름으로 이어집니다', w=860, dark=True)
    BX, BW = 930, 286
    pts = [('1', 738, 262, 207, '앉은 자리에서 모바일 주문', '줄 서지 않고 메뉴 · 옵션 · 결제까지 [1]분 — 품절은 앱 · 메뉴보드에서 함께 숨김', '앱 ↔ 메뉴보드 연동'),
           ('2', 708, 438, 384, '탭 한 번에 스탬프 · 쿠폰 적립', '포인트 카드 없이 적립 · 다음 방문 쿠폰은 자동 발송', 'POS 연동'),
           ('3', 846, 590, 536, '음료가 나오면 픽업 알림', '휴대폰 · 픽업대 화면에 번호가 함께 — 이름 부르지 않아도 됩니다', '픽업 화면 · VXT')]
    for n, px, py, by, t, d, sol in pts:
        s += f'<div style="{ab(px, py - 1, BX - px, 2, "background: rgba(255,255,255,0.92); box-shadow: 0 0 4px rgba(0,0,0,0.35)")}"></div>'
        s += f'<div style="{ab(px - 24, py - 24, 48, 48, "box-sizing: border-box; border-radius: 50%; border: 2px solid rgba(255,255,255,0.85); background: rgba(20,40,160,0.18)")}"></div>'
        s += pin(b, n, px, py, size=32)
        s += glass(row(numtag(b, n, 22) + tline(b, t, 15, 22, 1, '#ffffff'), 8)
                   + dline(b, d, 12.5, 18, 2, LT) + schip(b, sol, '#ffffff', 'rgba(255,255,255,0.16)'),
                   BX, by, BW, 110, pad='12px 14px', gap=5)
    kp = [('주문 대기', '−[00]%'), ('픽업 호출', '[0]회'), ('재방문', '+[00]%')]
    s += glass(lab(b, '이 장면이 바꾸는 숫자 · 출처: [유사 매장 POS, 연도]', LB, 11)
               + row(''.join(kpi(b, k, v, w=128, dark=True) for k, v in kp), 8), 64, 540, 416, None, pad='10px 12px', gap=7)
    s += footer(b, foot('FB', '수치는 자리표시'), 18, dark=True)
    return s


# ---------------------------------------------------------------- 4 현장 요원의 한 출동 · 세로 타임라인
@layout(L, f='L_PH_SO_T', code='PH-SO-T', p='solution', p2='scenario', name='현장 요원의 한 출동 · 인물 사진 + 세로 타임라인',
        when='현장 요원 한 사람이 신고부터 보고까지 거치는 다섯 순간을, 큰 인물 사진 옆 세로 타임라인에 시각 · 기기 · 솔루션 · 화면으로 보여줄 때',
        pv=[], sample=CUST['PB'], grp=G)
def _(b):
    s = header(b, EB, '신고부터 보고까지, 현장 요원의 한 번 출동을 따라갑니다',
               'S 지자체 현장 대응팀 · 한 건의 출동 [50]분 · 시각은 예시 · 단말 · 앱은 제안 구성', w=1152)
    # 사진 위아래 흰 여백을 잘라 내려고 칸보다 크게 넣고 바깥 칸으로 자름
    s += (f'<div style="{ab(64, 150, 460, 498, "overflow: hidden; border-radius: 14px")}">'
          + photo(b, 'ph.p-pb-police-phone', 0, -29, 460, 557, pos='78% 50%', hint='업무용 폰을 확인하는 현장 요원 사진 (고객 현장 인물 사진으로 교체)', radius=0) + '</div>')
    s += tag_on(b, '현장 요원 · 순찰 [0]팀', 80, 166)
    gl = ''
    for k, (nm, v, was) in enumerate([('신고 → 현장 도착', '[0]분', '지금 [00]분'), ('보고서 작성', '[0]분', '지금 [00]분')]):
        gl += col(lab(b, nm, LB, 11) + big(b, v, 26, '#ffffff') + b.tb(was, f'font-size: 11.5px; color: {LT}; white-space: nowrap'), 0, 'flex: 1')
    s += glass(row(gl, 16, 'align-items: flex-start'), 80, 538, 428, 94, pad='10px 16px')
    s += vline(641, 164, 452, LINE, 2)
    steps = [('14:02', '+0분', '신고 접수', '상황실이 신고를 받아 가장 가까운 요원에게 바로 배정합니다', '상황실 비디오월', '관제 시스템 연동',
              'ph.pb-control', '50% 50%', '상황실 관제 화면'),
             ('14:03', '+1분', '단말 알림', '요원 폰에 위치 · 신고 내용이 푸시로 — 잠금 화면에서 바로 확인', 'Galaxy XCover', 'Knox Manage',
              'cut.xcover7', '50% 50%', '현장 요원 러기드 폰'),
             ('14:05', '+3분', '이동 중 정보 확인', '차량 태블릿에서 경로 · 이전 신고 이력 · 현장 사진을 봅니다', '차량 태블릿', 'Knox Suite',
              'r4.oe-car-tab', '50% 50%', '차량 거치 태블릿 화면'),
             ('14:14', '+12분', '현장 조치', '워치 버튼 한 번으로 지원 요청 · 위치 공유, 폰으로 사진 기록', 'Galaxy Watch', 'SOS · 위치 공유',
              'ph.pb-ranger-watch', '72% 45%', '워치를 확인하는 현장 요원 (현장 장면으로 교체)'),
             ('14:52', '+50분', '보고', '복귀 전 DeX로 큰 화면에서 보고서 작성 · 상황실 전송', 'Galaxy Tab · 모니터', 'Samsung DeX',
              'fill.dex_ins', '55% 40%', 'DeX로 보고서를 쓰는 장면')]
    for i, (tm, rel, t, d, dev, sol, pid, pos, hint) in enumerate(steps):
        y = 150 + i * 101
        s += flex(556, y, 70, 44, b.tb(tm, f'{NUM}; font-size: 17px; font-weight: 800; line-height: 22px; color: {BLUE}; white-space: nowrap')
                  + b.tb(rel, f'{NUM}; font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap'), 'display: flex; flex-direction: column; gap: 1px')
        s += f'<div style="{ab(634, y + 4, 16, 16, f"box-sizing: border-box; border-radius: 50%; background: #ffffff; border: 4px solid {BLUE}")}"></div>'
        s += flex(664, y, 392, 94, row(tline(b, t, 15, 22, 1), 8) + dline(b, d, 12.5, 18, 2)
                  + row(schip(b, dev, BODY, SOFT) + schip(b, sol), 6, 'margin-top: 2px'), 'display: flex; flex-direction: column; gap: 4px')
        if pid.startswith('cut.'):
            s += cut(b, pid, 1072, y + 2, 144, 88, hint=hint, radius=10, pad=6)
        else:
            s += photo(b, pid, 1072, y + 2, 144, 88, pos=pos, hint=hint, radius=10)
    s += footer(b, foot('PB', '시각 · 수치는 예시 · 기기 · 앱 구성은 제안안'), 19)
    return s


# ---------------------------------------------------------------- 5 첫 사용 온보딩 · 설치 당일 · 첫 주 · 한 달
@layout(L, f='L_PH_SO_U', code='PH-SO-U', p='solution', p2='execution', name='첫 사용 온보딩 · 단계별 인물 사진 + 적응 지표',
        when='설치 당일 · 첫 주 · 한 달 동안 직원과 이용자가 새 솔루션에 익숙해지는 과정을, 단계마다 사람 사진과 우리가 돕는 일 · 적응 지표로 보여줄 때',
        pv=[], sample=CUST['MD'], grp=G)
def _(b):
    s = header(b, EB, '첫날 배우고, 첫 주에 손에 익고, 한 달이면 환자가 직접 씁니다',
               'W 요양병원 · 병동 태블릿 · 접수 안내 화면 · 냉난방 관리 — 단계마다 사람이 하는 일과 우리가 돕는 일 · 지표는 자리표시', w=1152)
    s += hline(64, 166, 1152, LINE, 2)
    st = [('D-day', '설치 당일', '직원 교육 · 간호 · 원무', 'ph.md-cart-tablet', '65% 35%', '태블릿을 시연하는 교육 장면 (고객 병원 직원 교육 사진으로 교체)',
           '간호 · 원무 직원이 [30]분 실습으로 기본 화면을 익힙니다', '병동별 현장 교육 · 한 장짜리 사용 카드 · 계정 일괄 등록',
           '교육 이수', '[00]%', '목표 [100]%', 0.4),
          ('1주', '첫 주', '접수 · 원무 창구', 'ph.p-md-reception', '50% 60%', '접수 창구의 직원 · 환자 사진 (고객 병원 사진으로 교체)',
           '접수 창구가 대기 번호 · 안내 화면을 직접 바꿔 씁니다', '상주 지원 [5]일 · 자주 묻는 질문 정리 · 원격 화면 점검',
           '직원 직접 사용률', '[00]%', '목표 [80]%', 0.66),
          ('1개월', '한 달', '환자 · 보호자', 'fill.patient_tab', '40% 50%', '병상 태블릿을 쓰는 환자 사진 (고객 병원 사진으로 교체)',
           '환자가 병상 태블릿으로 식단 · 일정을 보고 직원을 부릅니다', '사용 리포트 · 불편한 화면 개선 · 월간 점검 일정 확정',
           '환자 직접 사용', '[00]%', '스테이션 문의 −[00]%', 0.9)]
    for i, (dd, nm, who, pid, pos, hint, does, helps, mn, mv, goal, fl) in enumerate(st):
        x = 64 + i * 392
        s += flex(x, 152, 368, 30, b.tb(dd, f'{NUM}; height: 28px; padding: 0 12px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 14px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
                  + b.tb(nm, 'font-size: 16px; font-weight: 800; white-space: nowrap; background: #ffffff; padding: 0 10px 0 4px'),
                  'display: flex; align-items: center; gap: 6px')
        s += photo(b, pid, x, 192, 368, 204, pos=pos, hint=hint)
        s += tag_on(b, who, x + 12, 204)
        s += card(lab(b, '사람이 하는 일', MUTED, 11.5) + tline(b, does, 14, 20, 2)
                  + '<span style="height: 6px"></span>'
                  + lab(b, '우리가 돕는 일', BLUE, 11.5) + tline(b, helps, 14, 20, 2, BODY, 700),
                  x, 406, 368, 132, bg=SOFT, pad='12px 16px', gap=2)
        s += card(row(lab(b, '적응 지표', BLUE, 11.5) + b.tb(mn, 'font-size: 13px; font-weight: 800; white-space: nowrap'), 8)
                  + row(big(b, mv, 24) + b.tb(goal, f'font-size: 12px; font-weight: 700; color: {MUTED}; white-space: nowrap; margin-left: auto'), 8)
                  + row(bar(fl, BLUE, LINE, 8), 0, 'margin-top: 2px'),
                  x, 548, 368, 100, bg='#ffffff', border=LINE, pad='9px 16px', gap=3)
    s += footer(b, foot('MD', '막대 길이는 예시 · 일정 · 지표는 협의'), 20)
    return s


# ---------------------------------------------------------------- 6 예외 상황 시나리오 · 혼잡 · 정전 · 장애 · 우천
@layout(L, f='L_PH_SO_V', code='PH-SO-V', p='solution', p2='execution', name='예외 상황 시나리오 · 인물 사진 4 + 걸린 시간',
        when='혼잡 · 정전 · 장애 · 우천처럼 평소와 다른 순간에 솔루션이 무엇을 하는지, 그 자리의 사람 사진과 대응 단계 · 걸린 시간으로 보여줄 때',
        pv=[], sample=CUST['VN'], grp=G)
def _(b):
    s = header(b, EB, '평소가 아닌 순간에도, 관객과 직원은 기다리지 않습니다',
               'V 경기장 예외 상황 네 가지 · 그 순간 솔루션이 하는 일과 걸린 시간 · 시간은 예상치 · 출처: [유사 경기장 운영 기록, 연도]', w=1152)
    ex = [('혼잡', '가족 관객 · 출입 게이트', '경기 직후 [0]만 명이 한 출구로', 'ph.tp-panda-touch', '72% 35%', '화면 앞 가족 관객 사진 (고객 현장 인물 사진으로 교체 — 출입구 혼잡 장면)',
           ['게이트 집계로 출구별 혼잡을 감지', '전광판 · 통로 화면을 우회 출구 안내로 전환', '관객 앱에 가까운 출구 알림'], 'VXT', '[30]초', '[5]분', 0.12),
          ('정전', '운영 직원 · 컨트롤룸', '일부 구역 전원이 끊긴 순간', 'ph.vn-control-staff', '60% 50%', '컨트롤룸 운영 직원 사진 (고객 경기장 사진으로 교체)',
           ['컨트롤룸 · 비상 화면은 UPS로 유지', '비상구 안내 화면을 자동 송출', '복전 후 전 화면 원격 재시작 · 상태 확인'], 'MagicINFO', '[2]분', '[30]분', 0.18),
          ('장애', '엔지니어 · 설비 점검', '전광판 · 설비 일부가 꺼짐', 'ph.p-svc-ac-engineer', '55% 40%', '장애를 점검하는 엔지니어 사진 (전광판 점검 장면으로 교체)',
           ['원격 모니터링이 장애 위치를 알림', '대체 레이아웃으로 화면을 자동 전환', '엔지니어 폰으로 작업 지시 · 부품 정보'], 'b.IoT', '[10]분', '[2]시간', 0.15),
          ('우천', '관객 · 외야석', '경기 중 비로 [00]분 중단', 'r4.oe-ballpark', '50% 40%', '휴대폰을 든 야구장 관객 사진 (고객 경기장 인물 사진으로 교체)',
           ['전광판 · 매점 화면을 우천 안내로 일괄 전환', '관객 휴대폰에 재개 예상 시각 알림', '매점 화면은 우비 · 따뜻한 메뉴로'], 'VXT', '[1]분', '[15]분', 0.1)]
    for i, (nm, who, moment, pid, pos, hint, acts, sol, t1, t0, fl) in enumerate(ex):
        x = 64 + i * 292
        s += photo(b, pid, x, 150, 276, 242, pos=pos, hint=hint)
        s += tag_on(b, f'예외 {i + 1} · {nm}', x + 10, 160)
        s += label_on(b, who, moment, x + 8, 329, 260, lines=1)
        inner = row(lab(b, '그 순간 솔루션이 하는 일', BLUE, 12) + schip(b, sol, BLUE, '#ffffff', True), 6, 'justify-content: space-between')
        for k, a in enumerate(acts):
            inner += row(numtag(b, str(k + 1), 18) + dline(b, a, 12.5, 18, 2, INK), 8, 'align-items: flex-start')
        s += card(inner, x, 402, 276, 128, bg=SOFT, pad='12px 14px', gap=8)
        s += card(row(lab(b, '걸린 시간', MUTED, 11.5) + big(b, t1, 22) , 8, 'justify-content: space-between')
                  + row(b.tb('지금', f'width: 40px; flex-shrink: 0; font-size: 11px; font-weight: 700; color: {MUTED}') + bar(1.0, '#c3c8d1', SOFT, 8)
                        + b.tb(t0, f'width: 44px; flex-shrink: 0; text-align: right; {NUM}; font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 8)
                  + row(b.tb('도입 후', f'width: 40px; flex-shrink: 0; font-size: 11px; font-weight: 800; color: {BLUE}') + bar(fl, BLUE, SOFT, 8)
                        + b.tb(t1, f'width: 44px; flex-shrink: 0; text-align: right; {NUM}; font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 8),
                  x, 540, 276, 108, bg='#ffffff', border=LINE, pad='8px 14px', gap=6, extra='justify-content: center')
    s += footer(b, foot('VN', '시간 · 막대 길이는 예시'), 21)
    return s


# ---------------------------------------------------------------- 7 파일럿에서 본 반응 · 사용자 사진 + 인용 + 지표
@layout(L, f='L_PH_SO_W', code='PH-SO-W', p='solution', p2='effect', name='파일럿 반응 · 사용자 사진 + 인용 + 지표 막대',
        when='파일럿 · 시범 운영에서 실제 사용자가 한 말과 반응 지표(만족 · 사용률 · 문의 감소)를, 사용자 인물 사진과 함께 보여줄 때',
        pv=[], sample=CUST['OE'], grp=G)
def _(b):
    s = header(b, EB, '파일럿 [4]주, 써 본 사람들이 먼저 말했습니다',
               'U 통신사 전용 단말 파일럿 · [3]개 지역 · 사용자 [000]명 · 인용은 인터뷰 자리표시 · 출처: [파일럿 설문 · 사용 로그, 연도]', w=1152)
    us = [('보호자 · 키즈', 'r4.oe-kids-use', '35% 50%', '키즈 단말을 쓰는 아이 사진 (파일럿 참여자 사진으로 교체)',
           '“[아이가 쓸 앱만 보여서 마음이 놓여요]”', '보호자 · [40]대', '주간 사용', '[00]회'),
          ('택시 승객', 'ph.p-oe-taxi-screen', '60% 50%', '뒷좌석 화면을 누르는 승객 사진 (파일럿 참여자 사진으로 교체)',
           '“[가는 동안 볼 거리가 생겼고, 결제도 화면으로 끝났어요]”', '승객 · [50]대', '1회 이용', '[00]분'),
          ('휴식 공간 고객', 'ph.p-oe-relax-tab', '62% 45%', '거치 태블릿으로 영상을 고르는 고객 사진 (파일럿 참여자 사진으로 교체)',
           '“[영상 고르기가 쉬워 기다리는 시간이 짧게 느껴져요]”', '매장 고객 · [20]대', '재이용', '[00]%'),
          ('현장 담당자', 'ph.p-oe-manager-tab', '82% 40%', '태블릿을 든 현장 담당자 사진 (파일럿 참여자 사진으로 교체)',
           '“[단말 [00]대 설정을 한 번에 끝냈어요]”', '운영 담당 · [30]대', '설정 시간', '−[00]%')]
    for i, (who, pid, pos, hint, q, at, mn, mv) in enumerate(us):
        x = 64 + i * 188
        s += photo(b, pid, x, 150, 172, 272, pos=pos, hint=hint)
        s += tag_on(b, who, x + 8, 160, size=11)
        s += f'<div style="{ab(x + 26, 431, 14, 14, f"background: #ffffff; border-left: 1.5px solid {LINE}; border-top: 1.5px solid {LINE}; transform: rotate(45deg)")}"></div>'
        s += card(tline(b, q, 15, 23, 4) + '<span style="margin-top: auto"></span>' + b.tb(at, f'font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap'),
                  x, 438, 172, 154, bg='#ffffff', border=LINE, pad='12px 13px', gap=4)
        s += f'<div style="{ab(x + 27, 438, 12, 3, "background: #ffffff")}"></div>'
        s += card(row(lab(b, mn, MUTED, 11) + b.tb(mv, f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE}; white-space: nowrap; margin-left: auto'), 6),
                  x, 602, 172, 46, bg=CHIP, pad='0 12px', gap=0, radius=10, extra='justify-content: center')
    s += photo(b, 'fill.km_console', 832, 150, 384, 150, pos='30% 18%', hint='파일럿 단말 사용 로그를 모으는 관리 화면 (Knox Manage)')
    s += tag_on(b, '측정 · Knox Manage 사용 로그', 842, 160, dark=False, size=11)
    ms = [('만족도', '[4.0] / 5', 0.8, 0.84, '“다시 쓰겠다” 응답 [00]%'),
          ('주간 사용률', '[00]%', 0.72, 0.6, '단말을 받은 사용자 중 주 3회 이상'),
          ('고객센터 문의', '−[00]%', 0.46, 0.4, '설정 · 사용법 문의 · 같은 기간 일반 단말 대비')]
    inner = row(lab(b, '반응 지표 · 파일럿 [4]주', BLUE, 12.5) + b.tb('│ 목표선', f'font-size: 11px; font-weight: 700; color: {INK}; white-space: nowrap; margin-left: auto'), 6)
    for nm, v, fl, mk, d in ms:
        inner += col(row(tline(b, nm, 14, 20, 1) + b.tb(v, f'{NUM}; font-size: 20px; font-weight: 800; line-height: 26px; color: {BLUE}; white-space: nowrap; margin-left: auto'), 8)
                     + row(bar(fl, BLUE, '#ffffff', 10, mk), 0, 'margin: 4px 0 3px')
                     + b.tb(d, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 2)
    inner += '<span style="margin-top: auto"></span>' + b.tb('막대 길이는 예시 · 목표선은 본 사업 KPI', f'font-size: 11px; color: {FAINT}; white-space: nowrap')
    s += card(inner, 832, 312, 384, 336, bg=SOFT, pad='14px 16px', gap=18)
    s += footer(b, foot('OE', '인용 · 수치는 자리표시'), 22)
    return s


# ---------------------------------------------------------------- 8 고객의 고객까지 · B2B2C 사슬
@layout(L, f='L_PH_SO_X', code='PH-SO-X', p='solution', p2='value', name='고객의 고객까지 · B2B2C 인물 사진 사슬',
        when='고객사 담당자 → 현장 직원 → 그들의 손님으로 솔루션 가치가 이어질 때, 세 사람 사진 사이에 주고받는 것과 각자 얻는 것을 보여줄 때',
        pv=[], sample=CUST['FN'], grp=G)
def _(b):
    s = header(b, EB, 'T 은행의 솔루션은 직원을 거쳐 손님에게까지 닿습니다',
               'T 은행 영업점 · 본점 담당자 → 창구 직원 → 내방 손님, 단계마다 주고받는 것과 각자 얻는 것 · 수치는 자리표시', w=1152)
    ps = [('본점 디지털 담당', 'fill.meet_video', '30% 50%', '본점 디지털 담당자 회의 사진 (고객사 담당자 사진으로 교체)',
           '전 영업점의 화면 · 서식을 하루 만에 바꾸고 결과를 데이터로 봅니다', ('서식 배포', '[1]일'), ('종이 서식', '−[00]%')),
          ('영업점 창구 직원', 'ph.fn-counter', '40% 40%', '태블릿으로 상담하는 창구 직원 사진 (고객 영업점 사진으로 교체)',
           '서류를 찾는 대신 손님 얼굴을 보며 상담에 집중합니다', ('상담 시간', '−[00]%'), ('서식 오류', '−[00]%')),
          ('내방 손님', 'ph.fn-tab-customer', '45% 40%', '창구에서 태블릿 화면을 보는 손님 사진 (고객 영업점 사진으로 교체)',
           '화면으로 비교하고, 서명 한 번에 업무가 끝납니다', ('창구 대기', '−[00]%'), ('만족도', '+[0.0]점'))]
    for i, (who, pid, pos, hint, gain, k1, k2) in enumerate(ps):
        x = 64 + i * 400
        s += photo(b, pid, x, 150, 352, 246, pos=pos, hint=hint)
        s += tag_on(b, f'{i + 1} · {who}', x + 12, 162)
        s += vline(x + 175, 396, 48, BLUE, 2)
        s += f'<div style="{ab(x + 170, 439, 12, 12, f"border-radius: 50%; background: {BLUE}")}"></div>'
        s += card(lab(b, '얻는 것', BLUE, 12) + tline(b, gain, 16, 23, 2)
                  + '<span style="margin-top: auto; display: flex; gap: 8px">' + kpi(b, *k1, w=154) + kpi(b, *k2, w=154) + '</span>',
                  x, 492, 352, 156, bg=SOFT, pad='12px 16px', gap=4)
        if i < 2:
            s += b.tb('→', ab(x + 356, 255, 40, 40, f'border-radius: 50%; background: {BLUE}; color: #ffffff; font-size: 20px; font-weight: 800; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 4px #ffffff'), 'div')
    s += hline(240, 444, 800, BLUE, 2)
    ex = [(250, 'Knox Manage · VXT', '상품 화면 · 전자서식 · 오늘의 금리를 전 영업점에', '상담 기록 · 서식 완료 데이터'),
          (650, '갤럭시 탭 · 전자서명', '태블릿 상담 화면 · 서명 한 번', '고른 상품 · 서명 · 만족도 응답')]
    for x, sol, dn, up in ex:
        s += card(schip(b, sol)
                  + row(lab(b, '→', BLUE, 13) + b.tb(dn, f'font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 6)
                  + row(lab(b, '←', MUTED, 13) + b.tb(up, f'font-size: 12.5px; font-weight: 700; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 6),
                  x, 406, 380, 76, bg='#ffffff', border=BLUE, pad='7px 14px', gap=2, radius=10)
    s += footer(b, foot('FN', '수치는 자리표시'), 18)
    return s
