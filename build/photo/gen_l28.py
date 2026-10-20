# 8차 — 솔루션 제안 · 유저 시나리오 사진 레이아웃 8장 (사람이 나오는 실사 사진이 주인공)
# L_PH_SO_A 직원의 하루 × 솔루션 · L_PH_SO_B 장면 → 화면 → 결과 · L_PH_SO_C 스토리보드 4컷 · L_PH_SO_D 한 사건 두 사람
# L_PH_SO_E 전 / 후 같은 사람의 하루 · L_PH_SO_F 장면별 솔루션 매칭 · L_PH_SO_G 손님 여정 위 솔루션 레이어 · L_PH_SO_H 쓰는 사람의 말
from gen_r5 import *
L = []
EB = '06 · 솔루션 제안 — 유저 시나리오'
G = '솔루션 · 사람'
RP = '고객 현장 인물 사진으로 교체'


def foot(X, extra=''):
    return DEAL[X] + (' · ' + extra if extra else '') + ' · 사진: samsung.com 도입사례 인물 사진(참고 이미지) · 솔루션 화면 samsung.com'


def lab(b, text, color=BLUE, size=12):
    return b.tb(text, f'font-size: {size}px; font-weight: 800; color: {color}; white-space: nowrap')


def tline(b, text, size=15, lh=22, lines=1, color=INK, weight=800, extra=''):
    return b.tb(text, f'font-size: {size}px; font-weight: {weight}; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}{"; " + extra if extra else ""}')


def dline(b, text, size=12.5, lh=18, lines=2, color=BODY, extra=''):
    return b.tb(text, f'font-size: {size}px; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}{"; " + extra if extra else ""}')


def row(inner, gap=6, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; {extra}">{inner}</span>'


def flex(x, y, w, h, inner, extra=''):
    return f'<div style="{ab(x, y, w, h, extra)}">{inner}</div>'


def hline(x, y, w, color=LINE, h=1):
    return f'<div style="{ab(x, y, w, h, f"background: {color}")}"></div>'


def vline(x, y, h, color=LINE, w=1):
    return f'<div style="{ab(x, y, w, h, f"background: {color}")}"></div>'


def schip(b, text, color='#ffffff', bg=BLUE, size=11.5):
    """솔루션 · 기기 칩 (세로 flex 안에서도 왼쪽 붙음)"""
    return b.tb(text, f'align-self: flex-start; flex-shrink: 0; height: 22px; padding: 0 8px; border-radius: 6px; background: {bg}; color: {color}; font-size: {size}px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


def rchip(b, text, color='#ffffff', bg=BLUE, size=11.5):
    """가로 flex 줄 안의 칩"""
    return b.tb(text, f'align-self: center; flex-shrink: 0; height: 22px; padding: 0 8px; border-radius: 6px; background: {bg}; color: {color}; font-size: {size}px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


def ui(b, pid, x, y, w, h, hint, radius=10, pad=6, bg=SOFT):
    """솔루션 화면 — 잘리지 않게 contain (사진 칸의 보조)"""
    return b.img(pid, ab(x, y, w, h), fit='contain', kind='ui', hint=hint, radius=radius, pad=pad, bg=bg)


def ui_in(b, pid, w, h, hint, bg='#ffffff', pad=4, radius=8):
    """flex 줄 안에 넣는 작은 솔루션 화면"""
    return b.img(pid, f'position: relative; width: {w}px; height: {h}px; flex-shrink: 0', fit='contain', kind='ui', hint=hint, radius=radius, pad=pad, bg=bg)


def grayed(x, y, w, h, radius=12):
    """‘지금’ 칸 — 사진 위 회색 처리 오버레이 (채도 제거 + 옅게)"""
    return (f'<div style="{ab(x, y, w, h, f"border-radius: {radius}px; background: #7d838f; mix-blend-mode: saturation")}"></div>'
            f'<div style="{ab(x, y, w, h, f"border-radius: {radius}px; background: rgba(245,246,248,0.22)")}"></div>')


def frame(x, y, w, h, radius=6, color=INK, bw=2.5):
    """만화 칸 테두리"""
    return f'<div style="{ab(x, y, w, h, f"box-sizing: border-box; border-radius: {radius}px; border: {bw}px solid {color}")}"></div>'


def bubble(b, text, x, y):
    """말풍선 (한 줄 · 흰 바탕 · 왼쪽 아래 꼬리)"""
    return (f'<div style="{ab(x + 18, y + 28, 14, 14, "background: #ffffff; transform: rotate(45deg); box-shadow: 2px 2px 4px rgba(0,0,0,0.12)")}"></div>'
            + b.tb(text, ab(x, y, None, 36, f'box-sizing: border-box; border-radius: 14px; background: #ffffff; color: {INK}; font-size: 13.5px; font-weight: 800; line-height: 20px; padding: 8px 13px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.18)'), 'div'))


def big(b, val, size=40, color=BLUE):
    return b.tb(val, f'{NUM}; font-size: {size}px; font-weight: 800; line-height: {round(size * 1.2)}px; color: {color}; white-space: nowrap')


def mtile(b, label, val):
    """흰 숫자 타일 (CHIP 카드 안)"""
    return (f'<span style="box-sizing: border-box; border-radius: 10px; background: #ffffff; padding: 7px 12px; display: flex; flex-direction: column; gap: 1px; flex-shrink: 0">'
            + b.tb(label, f'font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap')
            + b.tb(val, f'{NUM}; font-size: 17px; font-weight: 800; line-height: 24px; color: {BLUE}; white-space: nowrap') + '</span>')


def qmark(b, size=40):
    return b.tb('“', f'font-family: Georgia, serif; font-size: {size}px; font-weight: 800; line-height: {size}px; color: {BLUE}; flex-shrink: 0')


# ================================================================ 1 한 사람의 하루 × 솔루션 (FB)
@layout(L, f='L_PH_SO_A', code='PH-SO-A', p='solution', p2='scenario', name='직원의 하루 × 솔루션 · 인물 사진 5칸',
        when='매장 직원 한 사람의 하루를 다섯 순간으로 따라가며, 순간마다 뒤에서 움직이는 솔루션을 칩과 한 줄로 보여줄 때',
        pv=[], sample=CUST['FB'], grp=G)
def _(b):
    s = header(b, EB, 'A 커피 직원의 하루, 그 뒤에서 솔루션 세 가지가 움직입니다', '매장 직원 1인 · 다섯 순간 · 칸마다 그때 뒤에서 움직이는 솔루션 · 시간은 예시 · 출처: [매장 운영 관찰, 연도]', w=1152)
    T = [('07:00 · 오픈', 'ph.p-rt-staff-store', '40% 30%', '직원 · 오픈 준비', '문을 열면 화면은 이미 켜짐',
          'SmartThings Pro', '06:50 예약 — 조명 · 냉방 · 메뉴보드가 먼저 켜집니다', '문 열기만'),
         ('12:30 · 피크', 'ph.p-fb-staff-tab', '25% 40%', '직원 · 점심 피크', '줄이 길면 태블릿 주문',
          'Knox Manage', '매장 태블릿 [0]대가 주문 앱만 열리게 잠기고 원격 관리', '태블릿 들고 줄로'),
         ('15:00 · 품절', 'r4.fb-kitchen-tab', '62% 30%', '주방 · 재료 소진', '주방 태블릿에서 품절 한 번',
          'MagicINFO', '메뉴보드 · 키오스크에서 그 메뉴가 바로 품절로 바뀝니다', '버튼 한 번'),
         ('22:00 · 마감', 'ph.p-tp-staff-clean', '45% 50%', '직원 · 마감 청소', '청소 중 매장은 자동 꺼짐',
          'SmartThings Pro', '마감 모드 — 사이니지 · 에어컨 · 조명을 [22:10]에 한 번에 끕니다', '청소만'),
         ('23:00 · 퇴근 후', 'ph.of-desk-control', '50% 70%', '본사 운영팀', '전 매장 상태를 다음 날 아침에',
          'MagicINFO · SmartThings Pro', '매장 [000]곳 재생 기록 · 장애 · 전력량이 한 화면에 모입니다', '따로 보고 없음')]
    s += hline(64, 401, 1152, '#c9d1ee', 2)
    for i, (tm, pid, pos, who, act, sol, what, staff) in enumerate(T):
        x = 64 + i * 233
        s += photo(b, pid, x, 152, 220, 232, pos=pos, hint=f'{who} 장면 ({RP})', radius=12)
        s += tag_on(b, tm, x + 10, 162)
        s += label_on(b, who, act, x + 10, 318, 200, lines=1)
        s += f'<div style="{ab(x + 103, 395, 14, 14, f"box-sizing: border-box; border-radius: 50%; background: #ffffff; border: 3px solid {BLUE}")}"></div>'
        s += card(lab(b, '뒤에서 움직이는 솔루션', MUTED, 11) + schip(b, sol)
                  + tline(b, what, 13.5, 20, 3, INK, 700)
                  + '<span style="margin-top: auto"></span>'
                  + row(lab(b, '직원', BLUE, 11.5) + b.tb(staff, f'font-size: 12px; color: {BODY}; white-space: nowrap'), 6),
                  x, 418, 220, 154, bg=SOFT, pad='11px 13px', gap=6)
    s += flex(64, 584, 1152, 64,
              ui_in(b, 'fill.mi_console', 104, 48, 'MagicINFO 콘솔 화면')
              + f'<span style="display: flex; flex-direction: column; gap: 1px">' + lab(b, '하루를 합치면', BLUE, 12)
              + b.tb('직원이 화면 · 기기에 직접 손대는 시간', f'font-size: 14px; font-weight: 800; color: {INK}; white-space: nowrap') + '</span>'
              + row(b.tb('[00]분', f'{NUM}; font-size: 18px; font-weight: 800; color: {FAINT}; text-decoration: line-through; white-space: nowrap')
                    + b.tb('→', f'font-size: 18px; font-weight: 800; color: {BLUE}') + big(b, '[0]분', 28), 10, 'margin-left: 18px')
              + '<span style="margin-left: auto"></span>'
              + rchip(b, 'SmartThings Pro') + rchip(b, 'Knox Manage') + rchip(b, 'MagicINFO'),
              'box-sizing: border-box; border-radius: 12px; background: #eaeefb; display: flex; align-items: center; gap: 14px; padding: 0 18px 0 8px')
    s += footer(b, foot('FB', '시간 · 수치는 예시'), 16)
    return s


# ================================================================ 2 장면 → 화면 → 결과 (RT)
@layout(L, f='L_PH_SO_B', code='PH-SO-B', p='solution', p2='effect', name='장면 → 화면 → 결과 · 인물 사진 3행',
        when='손님 · 직원 · 매니저가 각자 쓰는 솔루션 화면을 한 줄씩 잇고, 그 장면이 만드는 결과 수치까지 한 장에 보여줄 때',
        pv=[], sample=CUST['RT'], grp=G)
def _(b):
    s = header(b, EB, '손님 · 직원 · 매니저, 각자 쓰는 화면이 결과를 만듭니다', 'D 리테일 플래그십 매장 · 장면 → 그때 쓰는 솔루션 화면 → 결과 · 수치는 자리표시 · 출처: [매장 측정, 연도]', w=1152)
    s += lab(b, '장면 · 누가', MUTED, 12).replace('<span style="', f'<span style="{ab(64, 154)}; ', 1)
    s += lab(b, '그때 쓰는 솔루션 화면', MUTED, 12).replace('<span style="', f'<span style="{ab(484, 154)}; ', 1)
    s += lab(b, '결과', MUTED, 12).replace('<span style="', f'<span style="{ab(836, 154)}; ', 1)
    R = [('ph.p-rt-display-user', '50% 15%', '손님 · 체험존', '대형 터치 화면으로 제품 비교',
          'fill.vxt_ui_ad', 'VXT · 체험존 콘텐츠', '체험존 체류 시간', '+[00]', '%', '터치 기록이 남아 인기 제품 순위가 데이터로'),
         ('ph.rt-staff-tablet', '40% 40%', '직원 · 상담석', '태블릿으로 재고 · 혜택을 손님 옆에서',
          'fill.km_console', 'Knox Manage · 업무 태블릿', '상담 1건 걸리는 시간', '−[00]', '%', '창고 확인 · 계산대 왕복이 사라짐'),
         ('ph.p-oe-manager-tab', '80% 10%', '매니저 · 매장 [00]곳', '주말 행사를 전 매장 화면에 한 번에',
          'fill.vxt_cms', 'VXT CMS · 매장 그룹 배포', '전 매장 화면 바꾸는 데', '[00]', '분', '지금 [0]일 — 매장 방문 · USB 교체 없이')]
    for i, (pid, pos, who, act, scr, sol, met, val, unit, desc) in enumerate(R):
        y = 178 + i * 158
        s += photo(b, pid, 64, y, 372, 148, pos=pos, hint=f'{who} 장면 ({RP})', radius=12)
        s += label_on(b, who, act, 74 if i == 2 else 436 - 10 - 262, y + 82, 262, lines=1)
        s += ARR(440, y + 64, 40, 20, 20)
        s += ui(b, scr, 484, y, 300, 148, f'{sol} 화면', radius=12, pad=8)
        s += pill(b, sol, extra=f'position: absolute; left: {494}px; top: {y + 10}px')
        s += ARR(788, y + 64, 44, 20, 20)
        s += card(lab(b, met, BLUE, 12.5) + bignum(b, val, unit, size=40)
                  + dline(b, desc, 13, 19, 2, BODY),
                  836, y, 380, 148, bg=CHIP, pad='14px 18px', gap=4, extra='justify-content: center')
    s += footer(b, foot('RT', '수치는 자리표시'), 17)
    return s


# ================================================================ 3 스토리보드 4컷 (HT)
@layout(L, f='L_PH_SO_C', code='PH-SO-C', p='solution', p2='scenario', name='투숙객 스토리보드 · 인물 사진 4컷 + 말풍선',
        when='투숙객 한 사람의 1박을 만화 칸처럼 네 컷으로 풀어, 컷마다 손님의 한마디와 뒤에서 쓰인 솔루션을 이야기로 보여줄 때',
        pv=[], sample=CUST['HT'], grp=G)
def _(b):
    s = header(b, EB, '투숙객 [ ] 님의 1박, 네 컷으로 보면 솔루션이 보입니다', 'B 호텔 · 가족 투숙객 시나리오 · 컷마다 손님의 한마디 · 그때 뒤에서 움직이는 솔루션 · 시나리오 예시', w=1152)
    P = [('fill.ht_front', '50% 50%', (96, 22), '도착 전에 방이 준비됐네', '1 · 15:00 체크인', '도착 [30]분 전에 객실이 먼저 준비됨',
          '예약 연동 — 냉방 · 조명이 미리 켜지고 프런트 화면에 준비 완료', ['SmartThings Pro']),
         ('ph.p-oe-relax-tab', '45% 50%', (110, 210), '태블릿 하나로 다 되네', '2 · 17:00 객실 휴식', '조명 · 냉방 · TV를 한 화면에서',
          '객실 태블릿 · TV 홈 화면에 객실 제어와 룸서비스 메뉴', ['SmartThings Pro', 'LYNK Cloud']),
         ('fill.dex_ins', '55% 40%', (100, 20), '노트북 없이도 되네', '3 · 21:00 객실 업무', '휴대폰을 객실 화면에 이어 업무',
          '휴대폰 화면을 큰 모니터 · TV로 — 출장 손님의 업무 공간', ['DeX', 'LYNK Cloud']),
         ('ph.p-ht-kids-pool', '75% 50%', (54, 22), '수영장 몇 시까지야?', '4 · 다음 날 10:00 수영장', '운영 시간은 TV · 옥외 화면에서',
          '객실 TV 안내와 수영장 옆 옥외 화면이 같은 내용으로 바뀜', ['LYNK Cloud', 'MagicINFO'])]
    for i, (pid, pos, (bx, by), say, when, what, why, sols) in enumerate(P):
        x = 64 + i * 292
        s += photo(b, pid, x, 152, 276, 268, pos=pos, hint=f'투숙객 장면 {i + 1} — 같은 인물로 이어지게 ({RP})', radius=6)
        s += frame(x, 152, 276, 268)
        s += b.tb(str(i + 1), ab(x + 12, 164, 34, 34, f'box-sizing: border-box; border-radius: 50%; background: {INK}; color: #ffffff; border: 2px solid #ffffff; font-size: 16px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}'), 'div')
        s += bubble(b, say, x + bx, 152 + by)
        s += flex(x + 2, 432, 272, 118,
                  lab(b, when, BLUE, 12) + tline(b, what, 15, 22, 1) + dline(b, why, 12.5, 18, 2, BODY)
                  + row(''.join(rchip(b, t, BLUE, CHIP, 11) for t in sols), 5, 'margin-top: 2px'),
                  'display: flex; flex-direction: column; gap: 4px')
    S = [('fill.stp_hotel', 'SmartThings Pro', '컷 1 · 2', '객실 제어 화면'), ('fill.lynk_home', 'LYNK Cloud', '컷 2 · 3 · 4', '호텔 TV 홈 화면'),
         ('fill.dex_ext', 'DeX', '컷 3', '탭 · 모니터 DeX 화면'), ('fill.mi_playlist', 'MagicINFO', '컷 4', '옥외 화면 콘텐츠')]
    inner = (f'<span style="display: flex; flex-direction: column; gap: 2px; width: 150px; flex-shrink: 0">' + lab(b, '이 이야기에 쓰인 솔루션', BLUE, 12)
             + b.tb('네 가지 · 컷 번호', f'font-size: 12px; color: {MUTED}; white-space: nowrap') + '</span>')
    for pid, nm, cuts, h in S:
        inner += row(ui_in(b, pid, 92, 54, f'{nm} — {h}')
                     + f'<span style="display: flex; flex-direction: column; gap: 1px">' + b.tb(nm, f'font-size: 14px; font-weight: 800; color: {INK}; white-space: nowrap')
                     + b.tb(cuts, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap') + '</span>', 10, 'flex: 1; min-width: 0')
    s += flex(64, 566, 1152, 82, inner, 'box-sizing: border-box; border-radius: 12px; background: #f5f6f8; display: flex; align-items: center; gap: 16px; padding: 0 18px')
    s += footer(b, foot('HT', '시나리오 예시 · 네 컷은 같은 인물로 교체'), 18)
    return s


# ================================================================ 4 한 사건, 두 사람 (OF)
@layout(L, f='L_PH_SO_D', code='PH-SO-D', p='solution', p2='user', name='한 사건 두 사람 · 현장 · 관리자 사진 좌우',
        when='같은 사건(냉방 · 장애 등)을 현장 사용자와 관리자가 각각 어떻게 겪는지 좌우로 나란히, 가운데 시간 순서로 보여줄 때',
        pv=[], sample=CUST['OF'], grp=G)
def _(b):
    s = header(b, EB, '회의실이 더워진 14:00, 두 사람은 같은 일을 이렇게 겪습니다', 'C 빌딩 [12]층 회의실 냉방 이상 1건 · 왼쪽 현장 사용자 · 오른쪽 시설 관리자 · b.IoT 관제 · 시간은 예시', w=1152)
    # left — on site
    s += photo(b, 'r4.of-flip-team', 64, 152, 300, 300, pos='45% 50%', hint=f'회의실 사용자 장면 ({RP})', radius=12)
    s += tag_on(b, '현장 · 회의실 사용자', 76, 164)
    s += label_on(b, '[12]층 대회의실', '발표 중인 팀 [8]명', 76, 386, 276, lines=1)
    s += cut(b, 'cut.wf4way', 64, 464, 300, 184, hint='회의실 천장 실내기 제품 컷', pad=22)
    s += pill(b, '무풍 4Way 카세트 · 회의실 천장', bg=FAINT, extra='position: absolute; left: 76px; top: 474px')
    # right — manager
    s += photo(b, 'ph.vn-control-staff', 916, 152, 300, 300, pos='75% 50%', hint=f'시설 관리자 · 관제실 장면 ({RP})', radius=12)
    s += tag_on(b, '관리자 · 시설팀', 928, 164)
    s += label_on(b, '방재 · 관제실', '[1]명이 [20]개 층을 관리', 928, 386, 276, lines=1)
    s += ui(b, 'fill.biot_floor', 916, 464, 300, 184, 'b.IoT 도면 관제 화면', radius=12, pad=8)
    s += pill(b, 'b.IoT · 도면 관제', extra='position: absolute; left: 928px; top: 474px')
    # centre — timeline
    s += b.tb('현장 사람이 겪는 것', ab(380, 154, 216, 18, f'font-size: 12.5px; font-weight: 800; color: {MUTED}; text-align: right; white-space: nowrap'), 'div')
    s += b.tb('같은 시각', ab(600, 154, 80, 18, f'font-size: 12.5px; font-weight: 800; color: {INK}; text-align: center; white-space: nowrap'), 'div')
    s += b.tb('관리자가 하는 것', ab(684, 154, 216, 18, f'font-size: 12.5px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 'div')
    s += vline(639, 180, 456, '#c9d1ee', 2)
    E = [('14:00', '느낌', '방이 점점 더워지지만 발표는 계속', '알림', '[12]층 회의실이 설정보다 [3]℃ 높다는 알림'),
         ('14:02', '행동', '리모컨 · 시설팀 전화 없이 회의에 집중', '확인', '도면 화면에서 그 실내기의 필터 경고 확인'),
         ('14:04', '느낌', '찬 바람이 다시 나오기 시작', '조치', '원격으로 풍량 · 온도 조정 · 옆 실내기 보조 가동'),
         ('14:25', '결과', '실내 [24]℃ 회복 · 회의 끝까지', '지시', '정상 확인 후 필터 교체를 엔지니어에게 배정'),
         ('18:30', '퇴근 후', '아무도 모르게 필터 교체 끝', '기록', '조치 이력이 월간 리포트에 자동으로 남음')]
    for i, (tm, kl, lt, kr, rt) in enumerate(E):
        y = 182 + i * 92
        s += card(lab(b, kl, MUTED, 11.5).replace('white-space', 'align-self: flex-end; white-space', 1) + tline(b, lt, 14, 20, 2, INK, 700, 'text-align: right'),
                  380, y, 216, 82, bg=SOFT, pad='10px 14px', gap=3, extra='justify-content: center')
        s += b.tb(tm, ab(604, y + 29, 72, 24, f'box-sizing: border-box; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}'), 'div')
        s += card(lab(b, kr, BLUE, 11.5) + tline(b, rt, 14, 20, 2, INK, 700),
                  684, y, 216, 82, bg=CHIP, pad='10px 14px', gap=3, extra='justify-content: center')
    s += footer(b, foot('OF', '시간 · 온도는 예시'), 19)
    return s


# ================================================================ 5 전 / 후 같은 사람의 하루 (SV)
@layout(L, f='L_PH_SO_E', code='PH-SO-E', p='solution', p2='effect', name='도입 전 · 후 하루 · 흑백 / 컬러 인물 사진',
        when='같은 사람의 하루를 위 줄 지금(흑백) · 아래 줄 도입 후(컬러)로 맞대어, 순간마다 줄어드는 시간과 그걸 맡는 솔루션을 보여줄 때',
        pv=[], sample=CUST['SV'], grp=G)
def _(b):
    s = header(b, EB, 'N 체인 점주의 하루, 매장까지 가는 일이 거의 사라집니다', '같은 점주 · 같은 하루 — 위 지금(흑백) · 아래 도입 후(컬러) · 칸마다 걸린 시간 · 시간은 예시 · 출처: [점주 인터뷰, 연도]', w=1152)
    s += b.tb('지금', ab(64, 182, 76, 170, f'box-sizing: border-box; border-radius: 12px; background: #e6e9ee; color: {MUTED}; font-size: 16px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
    s += b.tb('도입 후', ab(64, 408, 76, 170, f'box-sizing: border-box; border-radius: 12px; background: {BLUE}; color: #ffffff; font-size: 16px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
    s += b.tb('걸린 시간', ab(64, 371, 76, 18, f'font-size: 11.5px; font-weight: 800; color: {MUTED}; text-align: center; white-space: nowrap'), 'div')
    C = [('08:00', '매장 열기', 'ph.p-rt-staff-clean', '40% 40%', '직접 가서 켜고 청소', 'ph.oe-tab-user', '20% 35%', '집에서 오픈 확인',
          '[40]분', '[3]분', 'SmartThings Pro', '예약 오픈 — 조명 · 냉방 · 화면 자동'),
         ('11:00', '결제 단말 오류', 'ph.p-oe-kids-card', '50% 55%', '손님 전화 → 출동', 'ph.sv-study-tab', '70% 50%', '원격 재시작 · 정상',
          '[60]분', '[5]분', 'Knox Manage', '입실 태블릿 · 단말 원격 재시작'),
         ('15:00', '덥다는 민원', 'ph.p-svc-ac-engineer', '55% 30%', '직접 가서 온도 조정', 'ph.md-staff-tab', '55% 50%', '앱에서 확인 · 조정',
          '[30]분', '[2]분', 'SmartThings Pro', '이용자 수에 맞춰 냉난방 자동'),
         ('23:00', '마감 · 정산', 'ph.p-mf-staff-tablet', '50% 30%', '종이로 매장별 합산', 'fill.fin_chart', '50% 40%', '매장 [00]곳 한 화면',
          '[50]분', '[10]분', 'SmartThings Pro', '전력 · 장애 · 이용 현황 리포트')]
    for i, (tm, task, p0, q0, t0, p1, q1, t1, v0, v1, sol, sd) in enumerate(C):
        x = 152 + i * 214
        s += row(b.tb(tm, f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}; white-space: nowrap') + b.tb(task, f'font-size: 14px; font-weight: 800; color: {INK}; white-space: nowrap'), 8,
                 f'position: absolute; left: {x}px; top: 152px; width: 202px; height: 24px')
        s += photo(b, p0, x, 182, 202, 170, pos=q0, hint=f'지금 — {t0} 장면 ({RP})', radius=12)
        s += grayed(x, 182, 202, 170)
        s += tag_on(b, t0, x + 8, 318, size=11.5)
        s += flex(x, 360, 202, 40,
                  b.tb(v0, f'{NUM}; font-size: 15px; font-weight: 800; color: {FAINT}; text-decoration: line-through; white-space: nowrap')
                  + b.tb('→', f'font-size: 16px; font-weight: 800; color: {BLUE}')
                  + b.tb(v1, f'{NUM}; font-size: 20px; font-weight: 800; line-height: 26px; color: {BLUE}; white-space: nowrap'),
                  f'box-sizing: border-box; border-radius: 10px; background: {CHIP}; display: flex; align-items: center; justify-content: center; gap: 10px')
        s += photo(b, p1, x, 408, 202, 170, pos=q1, hint=f'도입 후 — {t1} 장면 ({RP})', radius=12)
        s += tag_on(b, t1, x + 8, 544, size=11.5)
        s += card(schip(b, sol) + dline(b, sd, 12, 17, 1, BODY), x, 588, 202, 60, bg=SOFT, pad='8px 11px', gap=4)
    s += card(lab(b, '하루를 합치면', BLUE, 12.5)
              + row(b.tb('[180]분', f'{NUM}; font-size: 16px; font-weight: 800; color: {FAINT}; text-decoration: line-through; white-space: nowrap')
                    + b.tb('→', f'font-size: 16px; font-weight: 800; color: {BLUE}'), 8)
              + big(b, '[20]분', 40)
              + mtile(b, '매장 방문', '[3]회 → [0]회') + mtile(b, '긴급 출동', '[2]건 → [0]건')
              + dline(b, '남는 시간은 매장을 늘리는 데 씁니다', 12.5, 18, 2, BODY)
              + '<span style="margin-top: auto"></span>'
              + ui_in(b, 'fill.stp_auto', 172, 100, 'SmartThings Pro 자동화 화면')
              + b.tb('SmartThings Pro 자동화 화면', f'font-size: 11px; color: {MUTED}; white-space: nowrap')
              + evid(b, '근거 · 점주 인터뷰 [0]명'),
              1012, 152, 204, 496, bg=CHIP, pad='16px 16px', gap=6)
    s += footer(b, foot('SV', '시간은 예시 · 위 줄 사진은 회색 처리'), 20)
    return s


# ================================================================ 6 장면별 솔루션 매칭 (ED)
@layout(L, f='L_PH_SO_F', code='PH-SO-F', p='solution', p2='dss', name='장면별 솔루션 매칭 · 인물 사진 6 + 솔루션 집계',
        when='여러 사용자의 장면 여섯 개에 쓰이는 솔루션 · 기기를 하나씩 짝짓고, 솔루션마다 맡는 장면 수로 도입 우선순위를 보여줄 때',
        pv=[], sample=CUST['ED'], grp=G)
def _(b):
    s = header(b, EB, 'E 대학교의 여섯 장면, 맡는 솔루션은 네 가지입니다', '캠퍼스에서 쓰는 사람별 장면 · 장면마다 쓰는 솔루션과 기기 · 오른쪽은 솔루션별로 맡는 장면 수 · 장면은 예시', w=1152)
    S = [('r4.ed-teacher-board', '60% 30%', '교수 · 강의', 'MagicINFO', '전자칠판', '강의 자료 · 학사 공지를 강의실 칠판과 화면에 원격 배포'),
         ('ph.ed-tab-exam', '50% 40%', '학생 · 시험', 'Knox Manage', '갤럭시 탭', '시험 중엔 시험 앱만 열리고, 끝나면 자동으로 풀림'),
         ('ph.p-ed-pc-user', '60% 40%', '학생 · 열람실', 'SmartThings Pro', '시스템에어컨', '빈 좌석 구역은 냉난방 · 조명을 알아서 줄임'),
         ('ph.ed-charging', '40% 40%', 'IT 직원 · 기기 관리', 'Knox Manage', '충전 보관함', '태블릿 [000]대의 앱 · 설정을 밤사이 한 번에'),
         ('ph.p-ed-kid-tablet', '50% 40%', '아이 · 부속 유치원', 'Knox Manage', '갤럭시 탭', '학습 앱만 보이는 아이 전용 화면 · 사용 시간 제한'),
         ('ph.p-svc-ac-engineer2', '50% 30%', '시설 관리자', 'b.IoT', '시스템에어컨', '강의동 실내기 고장 알림 → 위치 확인 후 바로 출동')]
    for k, (pid, pos, who, sol, dev, line) in enumerate(S):
        x, y = 64 + (k % 3) * 282, 152 + (k // 3) * 252
        s += photo(b, pid, x, y, 268, 150, pos=pos, hint=f'{who} 장면 ({RP})', radius=12)
        s += tag_on(b, f'{k + 1} · {who}', x + 8, y + 8)
        s += card(row(rchip(b, sol) + rchip(b, dev, BODY, '#e2e5ea'), 6) + dline(b, line, 12.5, 18, 2, BODY),
                  x, y + 156, 268, 88, bg=SOFT, pad='10px 12px', gap=6)
    s += lab(b, '솔루션별 맡는 장면', INK, 13).replace('<span style="', f'<span style="{ab(920, 154)}; ', 1)
    M = [('fill.km_console', 'Knox Manage', [2, 4, 5], '태블릿 · 단말 관리 콘솔'), ('fill.mi_console', 'MagicINFO', [1], '콘텐츠 관리 콘솔'),
         ('fill.stp_energy', 'SmartThings Pro', [3], '에너지 관리 화면'), ('fill.biot_dash', 'b.IoT', [6], '통합 관제 대시보드')]
    for j, (pid, nm, ks, h) in enumerate(M):
        y = 180 + j * 96
        dots = ''.join(b.tb(str(n), f'width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; background: {BLUE if n in ks else "#e2e5ea"}; color: {"#ffffff" if n in ks else FAINT}; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; {NUM}') for n in range(1, 7))
        s += flex(920, y, 296, 88,
                  ui_in(b, pid, 84, 64, f'{nm} — {h}', bg=SOFT)
                  + f'<span style="display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0">'
                  + row(b.tb(nm, f'font-size: 14px; font-weight: 800; color: {INK}; white-space: nowrap')
                        + '<span style="margin-left: auto"></span>'
                        + b.tb(str(len(ks)), f'{NUM}; font-size: 22px; font-weight: 800; line-height: 26px; color: {BLUE if len(ks) > 1 else INK}; white-space: nowrap')
                        + b.tb('장면', f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap'), 4)
                  + row(dots, 4) + '</span>',
                  f'box-sizing: border-box; border-radius: 12px; background: #ffffff; border: 1px solid {LINE}; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 10px')
    s += card(lab(b, '먼저 도입', BLUE, 12) + tline(b, 'Knox Manage — 세 장면을 맡습니다', 15, 22, 1)
              + dline(b, '태블릿 [000]대 · 시험 · 유치원까지 한 콘솔', 12.5, 18, 1, BODY),
              920, 566, 296, 82, bg=CHIP, pad='11px 14px', gap=3)
    s += footer(b, foot('ED', '장면 · 대수는 예시'), 21)
    return s


# ================================================================ 7 손님 여정 위 솔루션 레이어 (FB)
@layout(L, f='L_PH_SO_G', code='PH-SO-G', p='solution', p2='user', name='손님 여정 × 솔루션 층 · 여정 인물 사진 5',
        when='손님 여정 다섯 단계를 인물 사진으로 놓고, 그 아래 손님 화면 · 매장 직원 · 본사 솔루션 세 층이 단계마다 무엇을 하는지 보여줄 때',
        pv=[], sample=CUST['FB'], grp=G)
def _(b):
    s = header(b, EB, 'A 커피 드라이브스루 손님의 다섯 걸음, 그 아래 세 층이 움직입니다', '손님 여정 5단계 × 손님에게 보이는 화면 · 매장 직원 · 본사 솔루션 · 단계별 칩 · 시나리오 예시', w=1152)
    J = [('ph.p-fb-dt-driver2', '0% 50%', '1 · 차 안'), ('ph.p-fb-dt-driver', '0% 50%', '2 · 주문'), ('fill.pos2', '50% 50%', '3 · 결제'),
         ('ph.p-fb-dt-driver3', '0% 50%', '4 · 픽업'), ('fill.phone_signage', '55% 60%', '5 · 재방문')]
    for i, (pid, pos, nm) in enumerate(J):
        x = 184 + i * 208
        s += photo(b, pid, x, 152, 200, 226, pos=pos, hint=f'손님 여정 {nm} 장면 ({RP})', radius=12)
        s += tag_on(b, nm, x + 8, 160)
    s += card(lab(b, '손님 여정', BLUE, 12.5) + tline(b, '진입부터 재방문까지', 15, 22, 2)
              + '<span style="margin-top: auto"></span>'
              + dline(b, '한 대가 머무는 시간', 12, 17, 2, MUTED)
              + b.tb('[0]분 [00]초', f'{NUM}; font-size: 15px; font-weight: 800; line-height: 22px; color: {BLUE}; white-space: nowrap'),
              64, 152, 108, 226, bg=SOFT, pad='14px 12px', gap=4)
    LN = [('손님에게 보이는 화면', '#f5f6f8', [('옥외 메뉴보드', '날씨 · 시간대별 추천 메뉴가 먼저'), ('주문 확인 화면', '말한 메뉴 · 합계가 바로 화면에'),
                                         ('결제 단말', '카드 · 앱 결제 · 영수증은 휴대폰'), ('픽업 안내 화면', '대기 번호 · 남은 시간 표시'), ('앱 · 매장 화면', '지난 주문 기반 쿠폰 · 신메뉴')]),
          ('매장 직원', '#f5f6f8', [('진입 알림', '차가 들어오면 주방 화면에 알림'), ('주방 태블릿', '주문이 제조 순서대로 도착'),
                                ('POS 태블릿', '창구에서 한 번에 결제 · 원격 지원'), ('완료 알림', '제조 끝 → 픽업 창구 화면에 번호'), (None, '직원이 따로 할 일 없음')]),
          ('본사 솔루션', CHIP, [('MagicINFO', '시간 · 날씨 조건으로 메뉴 자동 전환'), ('MagicINFO', '품절 · 가격 변경을 전 매장 동시 반영'),
                               ('Knox Manage', '결제 태블릿 잠금 · 앱 업데이트'), ('MagicINFO', '대기 번호와 행사 영상을 함께 재생'), ('MagicINFO 리포트', '재생 기록 × 주문으로 효과 분석')])]
    for k, (ln, bg, cells) in enumerate(LN):
        y = 388 + k * 88
        s += box(64, y, 1152, 82, bg, 12)
        if k == 2:
            s += flex(76, y + 8, 100, 66, lab(b, ln, BLUE, 12.5) + ui_in(b, 'fill.mi_console', 96, 42, 'MagicINFO 콘솔 화면'),
                      'display: flex; flex-direction: column; gap: 4px')
        else:
            s += flex(76, y, 100, 82, tline(b, ln, 13, 19, 2, INK), 'display: flex; flex-direction: column; justify-content: center')
        for i, (c, d) in enumerate(cells):
            x = 184 + i * 208
            hi = k == 2
            inner = (schip(b, c, '#ffffff' if hi else BLUE, BLUE if hi else '#ffffff') if c else schip(b, '—', FAINT, '#ffffff')) + dline(b, d, 12, 17, 2, BODY if c else FAINT)
            s += flex(x + 6, y + 10, 188, 64, inner, 'display: flex; flex-direction: column; gap: 5px')
            if i: s += vline(x - 4, y + 12, 58, '#d6dbe6')
    s += footer(b, foot('FB', '시나리오 예시'), 22)
    return s


# ================================================================ 8 쓰는 사람의 말 (FN)
@layout(L, f='L_PH_SO_H', code='PH-SO-H', p='solution', p2='case', name='쓰는 사람의 말 · 인물 사진 3 + 인용',
        when='솔루션을 실제로 쓰는 상인 · 직원 · 손님의 한마디를 인물 사진과 함께 놓고, 그 말을 만든 기능과 수치를 붙여 보여줄 때',
        pv=[], sample=CUST['FN'], grp=G)
def _(b):
    s = header(b, EB, '쓰는 사람의 말로 보면, 사라지는 것은 기다림과 종이입니다', 'T 은행 영업점 · 거래 상인 · 손님 인터뷰 형식 · 인용은 사례 성격의 자리표시 · 출처: [고객 인터뷰, 연도]', w=1152)
    # hero — merchant
    s += photo(b, 'ph.p-fn-vendor-tab', 64, 152, 560, 318, pos='40% 35%', hint=f'거래 상인이 결제 태블릿을 쓰는 장면 ({RP})', radius=14)
    s += tag_on(b, '상인 · 거래 가맹점', 78, 166)
    s += card(row(qmark(b, 48)
                  + f'<span style="display: flex; flex-direction: column; gap: 4px; min-width: 0">'
                  + tline(b, '[손님이 카드를 내밀면 이제 태블릿 하나로 끝나요. 정산도 저녁에 따로 안 해요]', 21, 30, 2)
                  + b.tb('— [ ] 시장 [ ] 가게 사장님 · 거래 [00]년', f'font-size: 12px; color: {MUTED}; white-space: nowrap') + '</span>', 12, 'align-items: flex-start')
              + '<span style="margin-top: auto"></span>' + f'<span style="height: 1px; flex-shrink: 0; background: {LINE}"></span>'
              + row(lab(b, '이 말을 만든 것', MUTED, 11.5) + rchip(b, '결제 태블릿 · Knox Manage')
                    + '<span style="margin-left: auto"></span>' + lab(b, '하루 정산 시간', BLUE, 12) + bignum(b, '−[00]', '%', size=30), 8),
              64, 482, 560, 166, bg=SOFT, pad='16px 20px', gap=8)
    R = [('fill.banker_tab', '40% 30%', '직원 · 영업점 창구', '[손님 옆에 앉아 같은 화면을 보며 설명합니다]', '— [ ]지점 창구 직원 · [0]년차',
          '상담 태블릿 · 전자서식', '상담 1건 시간', '−[00]', '%'),
         ('ph.oe-phone-user', '50% 50%', '손님 · 모바일 고객', '[앱으로 미리 접수하고 가니 기다리지 않았어요]', '— [ ]지점 방문 고객 · [30]대',
          '모바일 접수 · MagicINFO 대기 화면', '창구 대기 시간', '−[00]', '%')]
    for i, (pid, pos, who, q, by, fn, met, val, unit) in enumerate(R):
        y = 152 + i * 256
        s += photo(b, pid, 640, y, 236, 240, pos=pos, hint=f'{who} 장면 ({RP})', radius=14)
        s += tag_on(b, who, 650, y + 10)
        s += card(row(qmark(b, 40)
                      + f'<span style="display: flex; flex-direction: column; gap: 6px; min-width: 0">' + tline(b, q, 18, 26, 2)
                      + b.tb(by, f'font-size: 12px; color: {MUTED}; white-space: nowrap') + '</span>', 10, 'align-items: flex-start')
                  + '<span style="margin-top: auto"></span>'
                  + lab(b, '이 말을 만든 것', MUTED, 11.5) + schip(b, fn)
                  + row(lab(b, met, BLUE, 12) + '<span style="margin-left: auto"></span>' + bignum(b, val, unit, size=28), 8),
                  888, y, 328, 240, bg=SOFT, pad='14px 18px', gap=5)
    s += footer(b, foot('FN', '인용 · 수치는 자리표시'), 15)
    return s
