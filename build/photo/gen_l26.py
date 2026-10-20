# 7차 — 제안 개요 · 사용자 이해 사진 레이아웃 10장 (L_PH_OV_D ~ L_PH_OV_K · L_PH_US_I · L_PH_US_J)
# 기존 개요 장(ES_A 히어로 · OV_A 사업 이해 · OV_B 범위 포함/제외 · OV_C 전제)과 사용자 장(US_A · B · D)과 겹치지 않는 짜임
# 수치는 자리표시 · 예시 고객은 CUST[X] · 사진은 samsung.com 도입사례 · 비즈니스 페이지 · 공식 제품 컷
from gen_r5 import *
L = []
EB_OV, EB_US = '00 · 제안 개요', '01 · 사용자 이해'
G_OV, G_US = '개요 · 사진', '이해 · 사진'


def foot(X, extra='수치는 자리표시'):
    return f"{DEAL[X]} · {extra} · 사진: samsung.com {SRC[X]} 도입사례 · 비즈니스 페이지"


def lab(b, text, color=BLUE, size=12):
    return b.tb(text, f'font-size: {size}px; font-weight: 800; color: {color}; white-space: nowrap')


def tline(b, text, size=15, lh=22, lines=2, color=INK, weight=800):
    return b.tb(text, f'font-size: {size}px; font-weight: {weight}; line-height: {lh}px; color: {color}; {clamp(lines)}')


def dline(b, text, size=12.5, lh=18, lines=2, color=BODY):
    return b.tb(text, f'font-size: {size}px; line-height: {lh}px; color: {color}; {clamp(lines)}')


def one(b, text, size=12.5, color=BODY, weight=400, extra=''):
    return b.tb(text, f'font-size: {size}px; font-weight: {weight}; line-height: {round(size * 1.5)}px; color: {color}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; {extra}')


def row(inner, gap=6, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; {extra}">{inner}</span>'


def dchip(b, text):
    """어두운 칸 위 근거 칩"""
    return evid(b, text, color='#ffffff', bg='rgba(255,255,255,0.14)', border='rgba(255,255,255,0.32)')


# ---------------------------------------------------------------- 1. one-page summary — full-bleed stadium + glass sentence + 4 numbers
@layout(L, f='L_PH_OV_D', code='PH-OV-D', p='overview', name='한 장 요약 · 풀블리드 현장 + 숫자 넷',
        when='제안 전체를 현장 사진 한 장 위에 한 문장과 범위 · 기간 · 효과 · 투자 네 숫자로 줄여, 맨 앞에서 결론부터 보여 줄 때',
        pv=[], sample=CUST['VN'], grp=G_OV)
def _(b):
    s = photo(b, 'ph.vn-stadium-board', 0, 0, 1280, 720, pos='50% 100%', hint='경기장 전경 · 전광판 (풀블리드 · 고객 경기장 사진으로 교체)', radius=0)
    s += f'<div style="{ab(0, 0, 1280, 720, "background: linear-gradient(180deg, rgba(8,12,20,0.82) 0%, rgba(8,12,20,0.30) 30%, rgba(8,12,20,0.30) 42%, rgba(8,12,20,0.62) 62%, rgba(8,12,20,0.92) 100%)")}"></div>'
    s += header(b, EB_OV, 'V 경기장 제안을 한 장으로 보면 이렇습니다', '범위 · 기간 · 효과 · 투자 — 자세한 근거는 각 장에서 · 수치는 자리표시', w=1000, dark=True)
    s += glass(b.tb('이번 제안 · 한 문장', f'font-size: 12px; font-weight: 800; letter-spacing: 0.04em; color: {LB}; white-space: nowrap')
               + b.tb('입장부터 퇴장까지, 경기 밖의 시간을 하나의 화면 체계로 바꿉니다', f'font-size: 30px; font-weight: 800; line-height: 44px; color: #ffffff; white-space: nowrap')
               + b.tb('외야 전광판 · 콘코스 안내 · 매점 주문을 한 관제에서 — 관중은 덜 기다리고, 구단은 한 번에 운영합니다', f'font-size: 14px; line-height: 20px; color: {LT}; white-space: nowrap'),
               64, 332, None, None, pad='16px 24px', gap=6)
    tiles = [('SCOPE', '범위', '[00]', '개 구역', '외야 LED · 콘코스 사이니지 · 매점 키오스크'),
             ('TIME', '기간', '[00]', '개월', '시즌 종료 [00]월 착공 → 개막 전 오픈'),
             ('EFFECT', '효과', '-[00]', '%', '매점 대기 시간 · 출처: [현장 관찰, 연도]'),
             ('INVEST', '투자', '[00]', '억 원', 'VAT 별도 · 유지보수 [0]년 포함')]
    for i, (en, ko, v, u, d) in enumerate(tiles):
        x = 64 + i * 292
        inner = (row(b.tb(en, f'{NUM}; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: {LB}') + b.tb(ko, 'font-size: 14px; font-weight: 800; color: #ffffff'), 8)
                 + '<span style="margin-top: 4px"></span>' + bignum(b, v, u, size=40, color='#ffffff', unit_size=17)
                 + '<span style="height: 1px; background: rgba(255,255,255,0.22); margin: 6px 0 2px"></span>'
                 + one(b, d, size=12.5, color=LT))
        s += glass(inner, x, 478, 276, 158, pad='14px 18px', gap=4, extra=f'border-top: 3px solid {LB if i != 2 else "#ffffff"}')
    s += footer(b, foot('VN', '수치는 자리표시 · 상세는 각 장'), 2, dark=True)
    return s


# ---------------------------------------------------------------- 2. why · what · how · how much — zigzag photo cards
@layout(L, f='L_PH_OV_E', code='PH-OV-E', p='overview', name='왜 · 무엇을 · 어떻게 · 얼마나 · 사진 4열',
        when='제안 전체를 왜 · 무엇을 · 어떻게 · 얼마나 네 질문에 한 줄씩 답하고, 열마다 장면 사진과 근거 쪽을 붙여 흐름으로 보여 줄 때',
        pv=[], sample=CUST['OF'], grp=G_OV)
def _(b):
    s = header(b, EB_OV, '네 가지 질문으로 보는 이번 제안입니다', 'C 빌딩 스마트 오피스 — 왜 · 무엇을 · 어떻게 · 얼마나 · 근거는 칩의 쪽에서 · 수치는 자리표시', w=1152)
    cols = [('WHY', '왜 지금인가', 'ph.of-meeting-gray', '50% 50%', '흑백 = 지금 장면', '회의실 · 냉난방 · 안내가 따로 움직입니다',
             '설비마다 다른 화면 · 관리 담당 [0]명이 수작업으로 맞춤', ['입주사 설문 p.[00]', '현장 실사']),
            ('WHAT', '무엇을 하는가', 'ph.of-door-tab', '45% 50%', '회의실 예약 태블릿', '공용부 화면 · 회의실 예약 · 냉난방을 한 체계로',
             '로비 사이니지 [00]대 · 예약 태블릿 [00]대 · 실내기 [000]대', ['제안 범위 p.[00]', 'RFP p.[0]']),
            ('HOW', '어떻게 하는가', 'ph.of-control-room', '50% 40%', '통합 관제', '관제실 한 화면에서 보고, 층별로 단계 전환합니다',
             '시범 [0]개 층 → 전 층 · 업무 중단 없는 야간 시공', ['실행 계획 p.[00]', '유사 사례 [0]건']),
            ('HOW MUCH', '얼마나 좋아지는가', 'fill.stp_kv', '40% 50%', '에너지 대시보드', '냉난방 에너지 -[00]% · 회의실 노쇼 -[00]%',
             '투자 [00]억 원 · 회수 [0.0]년 · 출처: [시뮬레이션, 연도]', ['기대 효과 p.[00]', '비용 p.[00]'])]
    W, PH, CH = 276, 232, 252
    for i, (en, q, pid, pos, cap, key, d, chips) in enumerate(cols):
        x = 64 + i * 292
        last = i == 3
        py, cy = (152, 152 + PH + 12) if i % 2 == 0 else (152 + CH + 12, 152)
        s += photo(b, pid, x, py, W, PH, pos=pos, hint=f'{q} — 장면 사진 (고객 현장으로 교체)', radius=14)
        s += tag_on(b, cap, x + 10, py + 10)
        c1, c2, c3 = ('#ffffff', LB, LT) if last else (INK, BLUE, BODY)
        inner = (row(numtag(b, str(i + 1), 24, bg='#ffffff' if last else BLUE).replace('color: #ffffff', f'color: {BLUE}' if last else 'color: #ffffff', 1)
                     + b.tb(en, f'{NUM}; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; color: {c2}; white-space: nowrap'), 8)
                 + b.tb(q, f'font-size: 13px; font-weight: 700; color: {c3}; white-space: nowrap; margin-top: 4px')
                 + tline(b, key, size=18, lh=26, lines=3, color=c1)
                 + dline(b, d, size=12.5, lh=18, lines=2, color=c3)
                 + '<span style="margin-top: auto"></span>'
                 + row(''.join((dchip(b, c) if last else evid(b, c)) for c in chips), 6, 'flex-wrap: wrap'))
        s += card(inner, x, cy, W, CH, bg=BLUE if last else SOFT, pad='16px 18px', gap=6, radius=14)
    for i in range(3):
        x = 64 + i * 292 + W + 8
        s += f'<div style="{ab(x - 15, 386, 30, 30, f"box-sizing: border-box; border-radius: 50%; background: #ffffff; border: 2px solid {BLUE}; display: flex; align-items: center; justify-content: center; color: {BLUE}; font-size: 15px; font-weight: 800")}">→</div>'
    s += footer(b, foot('OF', '근거 쪽은 자리표시'), 3)
    return s


# ---------------------------------------------------------------- 3. scope at a glance — space photo grid + product chips + totals
@layout(L, f='L_PH_OV_F', code='PH-OV-F', p='overview', p2='dss', name='제안 범위 한눈에 · 공간 사진 격자',
        when='제안 범위를 공간별 사진 격자로 펼쳐, 칸마다 들어갈 제품과 수량을 얹고 오른쪽에서 전체 수량 합계를 확인시킬 때',
        pv=[], sample=CUST['HT'], grp=G_OV)
def _(b):
    s = header(b, EB_OV, 'B 호텔 어디에 무엇이 들어가는지 한눈에 봅니다', '공간 다섯 곳 · 제품과 수량 — 수량은 객실 [000]실 기준 자리표시 · 확정은 실사 후', w=1152)
    cells = [('객실', 'ph.ht-welcome-tv', '50% 50%', 64, 152, 548, 242, [('호텔 TV 55형', '[000]대'), ('LYNK Cloud 웰컴 화면', '[000]실'), ('무풍 1Way 에어컨', '[000]대')]),
             ('로비', 'ph.ht-lobby-signage', '85% 50%', 624, 152, 276, 242, [('세로형 안내 사이니지', '[0]대'), ('셀프 체크인 키오스크', '[0]대')]),
             ('연회장', 'ph.ht-ballroom', '50% 50%', 64, 406, 266, 242, [('LED 스크린', '[0]식'), ('행사 안내 화면', '[0]대')]),
             ('레스토랑', 'ph.ht-buffet-wall', '70% 50%', 342, 406, 270, 242, [('메뉴 · 혼잡 안내 화면', '[0]대')]),
             ('백오피스', 'fill.lynk_mgmt', '35% 50%', 624, 406, 276, 242, [('객실 TV · 콘텐츠 관리', '1식')])]
    for i, (sp, pid, pos, x, y, w, h, items) in enumerate(cells):
        s += photo(b, pid, x, y, w, h, pos=pos, hint=f'{sp} — 공간 사진 (고객 호텔로 교체)', radius=12)
        s += tag_on(b, f'{i + 1:02d} · {sp}', x + 10, y + 10)
        inner = ''.join(f'<span style="display: flex; align-items: center; justify-content: space-between; gap: 10px; height: 22px">'
                        + one(b, n, size=12.5, color='#ffffff', weight=700) + b.tb(q, f'{NUM}; font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap; flex-shrink: 0') + '</span>' for n, q in items)
        gw = min(w - 20, 300)
        gx = x + w - gw - 10 if i == 0 else x + 10
        s += glass(inner, gx, y + h - 10 - (len(items) * 22 + 16), gw, None, pad='8px 12px', gap=0)
    # right — totals
    tot = [('호텔 TV', '[000]대'), ('사이니지 · 키오스크', '[00]대'), ('LED 스크린', '[0]식'), ('시스템에어컨', '[000]대'), ('LYNK Cloud · 관리', '1식')]
    inner = (lab(b, '제안 범위 합계') + b.tb('공간 5곳 · 제품 [0]종', f'font-size: 12.5px; color: {MUTED}; white-space: nowrap')
             + '<span style="margin-top: 6px"></span>' + bignum(b, '[000]', '대', size=46, unit_size=18)
             + b.tb('하드웨어 전체 · 솔루션 제외', f'font-size: 12px; color: {MUTED}; white-space: nowrap')
             + '<span style="height: 1px; background: #cfd6ec; margin: 12px 0 4px"></span>'
             + ''.join(f'<span style="display: flex; align-items: center; justify-content: space-between; height: 42px; border-bottom: 1px solid #dfe4f3">'
                       + b.tb(n, f'font-size: 13.5px; font-weight: 700; color: {INK}; white-space: nowrap') + b.tb(q, f'{NUM}; font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>' for n, q in tot)
             + '<span style="margin-top: auto"></span>'
             + b.tb('설치 · 시운전 · 직원 교육 포함', f'font-size: 12.5px; font-weight: 800; color: {BLUE}; white-space: nowrap')
             + evid(b, '공간별 상세 · 배치도 p.[00]'))
    s += card(inner, 916, 152, 300, 496, bg=CHIP, pad='18px 20px', gap=4, radius=14)
    s += footer(b, foot('HT', '수량은 자리표시 · 실사 후 확정'), 5)
    return s


# ---------------------------------------------------------------- 4. project fact sheet — big site photo + bold-label table + bid timeline
@layout(L, f='L_PH_OV_G', code='PH-OV-G', p='overview', name='사업 개요 카드 · 현장 사진 + 개요 표',
        when='공공 · 입찰 사업의 사업명 · 발주처 · 기간 · 예산 · 범위 · 평가 방식을 한 장의 개요 표로 정리하고, 입찰 일정을 띠로 보여 줄 때',
        pv=[], sample=CUST['PB'], grp=G_OV)
def _(b):
    s = header(b, EB_OV, '이번 사업을 한 장의 개요 카드로 정리했습니다', 'S 지자체 공고문 · 제안요청서(RFP) 기준 — 원문 쪽 번호 표기 · 금액은 자리표시', w=1152)
    s += photo(b, 'ph.pb-control', 64, 152, 480, 496, pos='45% 50%', hint='대상 현장 — 상황실 사진 (고객 현장으로 교체)', radius=14)
    s += tag_on(b, '대상 현장', 76, 164)
    s += label_on(b, '교통정보센터 상황실 · 정류장 · 역사', '흩어진 안내와 관제를 한 화면 체계로 묶는 사업', 76, 560, 456, lines=1)
    rows = [('사업명', 'S 지자체 통합 교통 안내 · 관제 고도화 사업', 'RFP p.1'),
            ('발주처', 'S 지자체 교통정보과 · 조달청 계약 대행', 'RFP p.1'),
            ('사업 기간', '계약일부터 [00]개월 · 하자 보수 [0]년', 'RFP p.3'),
            ('사업 예산', '[00]억 원 (VAT 포함) · 기초 금액 기준', 'RFP p.3'),
            ('사업 범위', '상황실 비디오월 · 정류장 BIS [00]곳 · 관제 SW · 유지보수', 'RFP p.7'),
            ('평가 방식', '협상에 의한 계약 · 기술 [80] : 가격 [20]', 'RFP p.15')]
    s += b.tb('사업 개요', ab(568, 152, 200, 20, f'font-size: 14px; font-weight: 800; color: {INK}'), 'div')
    s += rect(568, 180, 648, 2, INK)
    for i, (k, v, ref) in enumerate(rows):
        y = 182 + i * 46
        val = b.tb(v, f'font-size: 14px; font-weight: {800 if i == 0 else 500}; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0')
        if i == 5:
            val = (f'<span style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0">' + b.tb(v, f'font-size: 14px; color: {INK}; white-space: nowrap')
                   + f'<span style="display: flex; width: 120px; height: 10px; border-radius: 5px; overflow: hidden; flex-shrink: 0"><i style="width: 80%; background: {BLUE}"></i><i style="width: 20%; background: #c3c8d1"></i></span></span>')
        s += (f'<div style="{ab(568, y, 648, 46, f"box-sizing: border-box; border-bottom: 1px solid {LINE}; display: flex; align-items: center; gap: 14px")}">'
              + b.tb(k, f'width: 84px; flex-shrink: 0; font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap') + val
              + chip(b, ref, color=BLUE, bg=CHIP, size=11, h=20, extra='align-self: center; flex-shrink: 0') + '</div>')
    # bid timeline strip
    s += box(568, 478, 648, 170, bg=SOFT, radius=14)
    s += b.tb('입찰 일정', ab(588, 494, 200, 20, f'font-size: 14px; font-weight: 800; color: {INK}'), 'div')
    s += b.tb('공고일 기준 · 날짜는 자리표시', ab(1196 - 300, 496, 300, 18, f'font-size: 11.5px; color: {MUTED}; text-align: right; white-space: nowrap'), 'div')
    ms = [('공고', '[00/00]'), ('설명회', '[00/00]'), ('제안서 마감', '[00/00]'), ('발표 평가', '[00/00]'), ('우선 협상', '[00/00]'), ('계약 · 착수', '[00/00]')]
    X0, X1, LY = 616, 1168, 560
    s += rect(X0, LY - 1, X1 - X0, 3, '#c9cfdb', 2)
    s += rect(X0, LY - 1, round((X1 - X0) * 0.4), 3, BLUE, 2)
    for i, (n, d) in enumerate(ms):
        cx = X0 + round(i * (X1 - X0) / 5)
        hi = i == 2
        sz = 18 if hi else 12
        s += f'<div style="{ab(cx - sz // 2, LY - sz // 2 + 1, sz, sz, f"box-sizing: border-box; border-radius: 50%; background: {BLUE if i <= 2 else "#ffffff"}; border: 2px solid {BLUE if i <= 2 else "#b8bec8"}")}"></div>'
        s += b.tb(d, ab(cx - 50, LY - 34, 100, 18, f'{NUM}; font-size: 12px; font-weight: 800; color: {BLUE if hi else MUTED}; text-align: center; white-space: nowrap'), 'div')
        s += b.tb(n, ab(cx - 50, LY + 16, 100, 20, f'font-size: 13px; font-weight: 800; color: {BLUE if hi else INK}; text-align: center; white-space: nowrap'), 'div')
    s += b.tb('지금 여기 → 제안서 마감까지 D-[00]', ab(588, 608, 608, 24, f'font-size: 12.5px; font-weight: 800; color: {BLUE}; white-space: nowrap; display: flex; align-items: center'), 'div')
    s += footer(b, foot('PB', '출처: 공고문 · 제안요청서(RFP) · 금액은 자리표시'), 4)
    return s


# ---------------------------------------------------------------- 5. three promises — bleed key visual + big numbers
@layout(L, f='L_PH_OV_H', code='PH-OV-H', p='overview', p2='value', name='세 가지 약속 · 키 비주얼 매장 사진',
        when='제안의 핵심을 고객에게 드리는 세 가지 약속으로 줄여, 매장 키 비주얼 옆에 큰 번호 · 한 줄 · 증거 칩으로 새길 때',
        pv=[], sample=CUST['RT'], grp=G_OV)
def _(b):
    s = photo(b, 'ph.rt-fashion-store', 600, 0, 680, 648, pos='62% 50%', hint='키 비주얼 — 매장 전경 (고객 플래그십 매장 사진으로 교체)', radius=0)
    s += label_on(b, 'KEY VISUAL · 플래그십 1층', '들어서는 첫 3초에 브랜드가 보이는 매장', 624, 560, 420, lines=1)
    s += header(b, EB_OV, 'D 리테일 플래그십에 드리는 세 가지 약속입니다', None, w=500)
    s += b.tb('제안 전체를 세 문장으로 — 각 약속의 근거는 칩의 쪽에서', ab(64, 152, 500, 22, f'font-size: 15px; color: {MUTED}; white-space: nowrap'), 'div')
    pr = [('01', '매장 화면은 본사에서 한 번에 바뀝니다', '[00]개 매장 · 프로모션 반영 [0]일 → [0]시간', '근거 · 운영 방식 p.[00]'),
          ('02', '손님은 기다리지 않고 직접 찾습니다', '재고 조회 · 셀프 결제 · 계산 대기 -[00]%', '근거 · 기대 효과 p.[00]'),
          ('03', '오픈 뒤 [0]년, 화면이 꺼지지 않게 지킵니다', '원격 관제 · [0]시간 안 현장 출동 · 연 [0]회 점검', '근거 · 유지보수 p.[00]')]
    for i, (n, t, d, ev) in enumerate(pr):
        y = 198 + i * 152
        if i: s += rect(64, y - 12, 512, 1, LINE)
        s += b.tb(n, ab(64, y, 84, None, f'{NUM}; font-size: 44px; font-weight: 800; line-height: 64px; color: {BLUE}'), 'div')
        s += (f'<div style="{ab(152, y + 2, 424, 124, "display: flex; flex-direction: column; gap: 6px")}">'
              + tline(b, t, size=19, lh=28, lines=2) + one(b, d, size=13, color=BODY) + '<span style="margin-top: 4px"></span>' + evid(b, ev, color=BLUE, bg=CHIP, border=CHIP) + '</div>')
    s += footer(b, foot('RT', '수치는 자리표시 · 근거 쪽은 자리표시'), 3)
    return s


# ---------------------------------------------------------------- 6. assumptions with site thumbnails — card grid + question card (photo version of L_OV_C)
@layout(L, f='L_PH_OV_I', code='PH-OV-I', p='overview', name='전제 조건 · 확인 요청 · 현장 사진 카드',
        when='금액 · 일정이 기대는 전제를 현장 사진 카드로 하나씩 보이고, 확인 상태와 고객께 여쭙는 질문 · 회신 기한을 함께 받을 때',
        pv=['L_OV_C'], sample=CUST['ED'], grp=G_OV)
def _(b):
    s = header(b, EB_OV, '금액과 일정은 아래 전제에서 유효합니다', '가정값은 실사 · 고객 확인 후 확정 · 바뀌면 영향 범위를 다시 알려드립니다', w=1152)
    conds = [('전원', '벽면 콘센트 1.5m 이내', '실사', ['금액'], True, '', 'ph.ed-charging', '40% 50%'),
             ('네트워크', '강의실당 유선 LAN 1포트', '학교 전산원', ['일정'], False, 'Q2', 'ph.ed-kiosks', '30% 50%'),
             ('시공 시간', '수업 없는 시간 · 방학 중 야간', '학교 시설팀', ['일정', '금액'], False, 'Q1', 'ph.ed-ac-clean', '70% 40%'),
             ('벽체', '조적벽 · 앵커 고정 가능', '실사', ['금액'], False, '', 'ph.ed-library-wall', '30% 50%'),
             ('콘텐츠 원본', '학교 제공 · 4K', '학교 홍보팀', ['일정'], True, '', 'ph.ed-lobby-signage', '60% 40%'),
             ('기존 장비', '반출은 학교 처리', '학교 시설팀', ['금액'], False, 'Q4', 'ph.ed-lab-gray', '50% 60%')]
    W, H, PHH = 245, 242, 142
    for i, (nm, v, who, imp, ok, q, pid, pos) in enumerate(conds):
        x, y = 64 + (i % 3) * 257, 152 + (i // 3) * 254
        s += box(x, y, W, H, bg=SOFT, radius=12)
        s += photo(b, pid, x, y, W, PHH, pos=pos, hint=f'{nm} — 관련 현장 사진 (고객 현장으로 교체)', radius=12)
        s += tag_on(b, '확인됨' if ok else '확인 필요' + (f' · {q}' if q else ''), x + 8, y + 8, dark=not ok)
        inner = (b.tb(nm, f'font-size: 16px; font-weight: 800; color: {INK}; white-space: nowrap')
                 + one(b, v, size=13, color=BODY)
                 + '<span style="margin-top: auto"></span>'
                 + row(b.tb('확인 · ' + who, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap')
                       + '<span style="flex: 1"></span>'
                       + ''.join(chip(b, '영향 ' + m, color=INK, bg='#ffffff', size=11, h=20, extra='align-self: center') for m in imp), 4))
        s += card(inner, x, y + PHH, W, H - PHH, bg='transparent', pad='10px 12px 12px', gap=3)
    # right — questions
    qs = [('Q1', '야간 시공 때 경비 동행이 가능한가요?', '관련 전제 · 시공 시간'),
          ('Q2', '건물별 네트워크 포트 위치 도면이 있나요?', '관련 전제 · 네트워크'),
          ('Q3', '콘텐츠 운영은 홍보팀이 맡나요?', '관련 · 운영 교육 대상'),
          ('Q4', '기존 장비 반출일을 정해 주실 수 있나요?', '관련 전제 · 기존 장비')]
    inner = row(b.tb('고객께 여쭙는 것', f'font-size: 16px; font-weight: 800; color: {BLUE}; white-space: nowrap') + numtag(b, '4', 22), 8)
    for k, (q, t, rel) in enumerate(qs):
        inner += (('<span style="height: 1px; background: #cfd6ec"></span>' if k else '<span style="height: 4px"></span>')
                  + '<span style="display: flex; gap: 10px; align-items: flex-start">'
                  + b.tb(q, f'width: 28px; height: 22px; flex-shrink: 0; border-radius: 6px; background: {BLUE}; color: #ffffff; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; {NUM}')
                  + '<span style="display: flex; flex-direction: column; gap: 2px; min-width: 0">'
                  + tline(b, t, size=14, lh=20, lines=2) + b.tb(rel, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + '</span></span>')
    inner += ('<span style="margin-top: auto"></span>'
              + f'<span style="box-sizing: border-box; height: 46px; border-radius: 10px; background: #ffffff; padding: 0 14px; display: flex; align-items: center; justify-content: space-between">'
              + b.tb('답변 기한', f'font-size: 14px; font-weight: 800; color: {INK}; white-space: nowrap') + b.tb('[00]/[00]', f'{NUM}; font-size: 20px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>'
              + row(b.tb('확인 현황', f'font-size: 12px; font-weight: 800; color: {INK}; white-space: nowrap')
                    + '<span style="display: flex; gap: 3px">' + ''.join(f'<i style="width: 16px; height: 8px; border-radius: 3px; box-sizing: border-box; {"background: " + BLUE if k < 2 else "border: 1.5px solid " + INK}"></i>' for k in range(6)) + '</span>'
                    + b.tb('확인됨 2 · 확인 필요 4', f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 8, 'margin-top: 4px')
              + dline(b, '답이 없으면 가정값으로 진행하고 변경 시 견적을 다시 드립니다', size=11.5, lh=16, lines=2, color=MUTED))
    s += card(inner, 848, 152, 368, 496, bg=CHIP, pad='18px 20px', gap=13, radius=14)
    s += footer(b, foot('ED', '실사 항목은 현장 실사 [00]/[00]에 확인 · Q는 오른쪽 질문'), 6)
    return s


# ---------------------------------------------------------------- 7. schedule at a glance — time-proportional photo strip + today → open
@layout(L, f='L_PH_OV_J', code='PH-OV-J', p='overview', p2='execution', name='한눈에 보는 추진 일정 · 기간 비례 사진',
        when='계약부터 오픈까지 네 단계를 기간에 비례한 사진 폭으로 보여 주고, 단계마다 날짜와 산출물, 오늘 → 오픈까지 남은 기간을 짚을 때',
        pv=[], sample=CUST['FB'], grp=G_OV)
def _(b):
    s = header(b, EB_OV, '오늘부터 오픈까지, 네 단계 [28]주입니다', '사진 폭 = 기간 · 단계가 끝날 때마다 드리는 산출물 · 날짜는 자리표시', w=1152)
    ph = [('실사 · 설계', 4, 'W1–W4', 'ph.fb-cafe-air', '50% 50%', '매장 실사 · 설치 위치', ['실사 보고서', '설치 도면']),
          ('시범 매장', 6, 'W5–W10', 'ph.fb-counter-menu', '50% 30%', '시범 [10]개 매장', ['시범 결과 보고', '표준 설치안']),
          ('1차 확산', 10, 'W11–W20', 'ph.fb-dt-order', '35% 50%', '직영 · 드라이브스루 [000]곳', ['확산 현황 대시보드', '매장 교육 영상']),
          ('전국 확산 · 이관', 8, 'W21–W28', 'fill.vxt_cms', '50% 40%', '본사 CMS 운영 이관', ['운영 매뉴얼', '이관 확인서'])]
    tot = sum(p[1] for p in ph); avail = 1152 - 12 * (len(ph) - 1)
    # week ruler
    s += rect(64, 178, 1152, 1, '#c9cfdb')
    x = 64
    xs = []
    for i, (nm, wk, wr, pid, pos, cap, dl) in enumerate(ph):
        w = round(avail * wk / tot) if i < len(ph) - 1 else 1216 - x
        xs.append((x, w))
        s += rect(x, 172, 1, 12, '#9aa3b2')
        s += b.tb(wr, ab(x + 6, 154, w - 6, 16, f'{NUM}; font-size: 11.5px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
        s += b.tb(f'{wk}주', ab(x + w - 60, 154, 60, 16, f'font-size: 11.5px; font-weight: 800; color: {BLUE}; text-align: right; white-space: nowrap'), 'div')
        s += photo(b, pid, x, 192, w, 196, pos=pos, hint=f'{nm} — 단계 장면 사진 (고객 매장으로 교체)', radius=12)
        s += tag_on(b, f'{i + 1:02d}', x + 10, 202)
        s += f'<div style="{ab(x, 396, w, 6, f"border-radius: 3px; background: {BLUE if i < 3 else "#9fb0e6"}")}"></div>'
        inner = (b.tb('[00/00] – [00/00]', f'{NUM}; font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap')
                 + b.tb(nm, f'font-size: 16px; font-weight: 800; color: {INK}; white-space: nowrap')
                 + one(b, cap, size=12, color=MUTED)
                 + '<span style="margin-top: 4px"></span>'
                 + b.tb('산출물', f'font-size: 11px; font-weight: 800; color: {MUTED}; white-space: nowrap')
                 + ''.join(chip(b, d, color=INK, bg=SOFT, size=11.5, h=22) for d in dl))
        s += f'<div style="{ab(x, 412, w, 164, "box-sizing: border-box; padding: 0 2px; display: flex; flex-direction: column; gap: 4px")}">{inner}</div>'
        x += w + 12
    # today → open
    s += box(64, 584, 1152, 64, bg=CHIP, radius=14)
    s += (f'<div style="{ab(84, 596, 220, 40, "display: flex; flex-direction: column; gap: 0")}">'
          + b.tb('TODAY · 계약', f'{NUM}; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; color: {MUTED}; white-space: nowrap')
          + b.tb('[00]월 [00]일', f'font-size: 17px; font-weight: 800; color: {INK}; white-space: nowrap') + '</div>')
    s += rect(270, 615, 640, 3, BLUE, 2)
    s += f'<div style="{ab(902, 609, 0, 0, f"border-left: 14px solid {BLUE}; border-top: 8px solid transparent; border-bottom: 8px solid transparent")}"></div>'
    for k in range(1, 4):
        s += f'<div style="{ab(270 + k * 160 - 5, 611, 10, 10, f"box-sizing: border-box; border-radius: 50%; background: #ffffff; border: 2px solid {BLUE}")}"></div>'
    s += b.tb('D-[000] · 개막 · 성수기 전에 전 매장 오픈', ab(420, 588, 340, 20, f'font-size: 12.5px; font-weight: 800; color: {BLUE}; text-align: center; white-space: nowrap'), 'div')
    s += (f'<div style="{ab(936, 596, 260, 40, "display: flex; flex-direction: column; align-items: flex-end; gap: 0")}">'
          + b.tb('OPEN · 전 매장', f'{NUM}; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; color: {BLUE}; white-space: nowrap')
          + b.tb('[00]월 [00]일', f'font-size: 17px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')
    s += footer(b, foot('FB', '주 수 · 날짜는 자리표시 · 상세 일정은 실행 계획 p.[00]'), 5)
    return s


# ---------------------------------------------------------------- 8. what you will see — chapter photo cards (TOC + overview)
@layout(L, f='L_PH_OV_K', code='PH-OV-K', p='overview', name='이 제안서에서 보실 것 · 장 사진 카드',
        when='제안서 맨 앞에서 장 여덟 개를 사진 카드로 펼쳐, 장 번호 · 이름 · 한 줄 요약 · 쪽을 보여 주며 목차 겸 개요로 쓸 때',
        pv=[], sample=CUST['MD'], grp=G_OV)
def _(b):
    s = header(b, EB_OV, '이 제안서에서 보실 여덟 가지입니다', 'W 요양병원 케어 환경 제안 · 궁금한 장부터 펼쳐 보셔도 됩니다 · 쪽 번호는 자리표시', w=1152)
    ch = [('01', '사용자 이해', '간호사 · 환자 · 보호자, 세 사람의 하루', 'p.[03]', 'ph.md-station', '50% 50%'),
          ('02', '케어 환경 진단', '병실 온도 · 공기 · 소음을 직접 쟀습니다', 'p.[06]', 'ph.md-ward', '50% 50%'),
          ('03', '시장 · 제도 변화', '인증 · 감염 관리 기준이 이렇게 바뀝니다', 'p.[09]', 'r4.md-nursing-bldg', '50% 50%'),
          ('04', '시사점 · 제안 방향', '분석에서 뽑은 세 가지 방향', 'p.[12]', 'r4.md-wait-lounge', '50% 45%'),
          ('05', '솔루션', '무풍 냉난방 · 공기 관리 · 통합 제어', 'p.[15]', 'ph.md-air-cube', '50% 50%'),
          ('06', '기대 효과', '감염 · 민원 · 에너지, 세 숫자로', 'p.[20]', 'fill.patient_tab', '50% 40%'),
          ('07', '실행 계획', '병동 운영을 멈추지 않는 단계 시공', 'p.[23]', 'ph.svc-technician', '50% 30%'),
          ('08', '비용 · Why Samsung', '[0]년 총비용과 우리가 맞는 이유', 'p.[27]', 'ph.md-staff-tab', '50% 45%')]
    for i, (n, nm, d, pg, pid, pos) in enumerate(ch):
        x, y = 64 + (i % 4) * 292, 152 + (i // 4) * 256
        s += box(x, y, 276, 240, bg=SOFT, radius=14)
        s += photo(b, pid, x, y, 276, 158, pos=pos, hint=f'{nm} 장 대표 사진 (해당 장 사진으로 교체)', radius=14)
        s += b.tb(n, ab(x + 12, y + 112, 54, 36, f'box-sizing: border-box; border-radius: 10px; background: {GLASS}; color: #ffffff; {NUM}; font-size: 20px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
        inner = (f'<span style="display: flex; align-items: center; justify-content: space-between; gap: 8px">'
                 + b.tb(nm, f'font-size: 16px; font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0')
                 + b.tb(pg, f'{NUM}; font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap; flex-shrink: 0') + '</span>'
                 + dline(b, d, size=13, lh=19, lines=2, color=BODY))
        s += card(inner, x, y + 158, 276, 82, bg='transparent', pad='10px 16px', gap=2)
    s += footer(b, foot('MD', '쪽 번호는 자리표시 · 장 구성은 제안에 맞게 조정'), 2)
    return s


# ---------------------------------------------------------------- 9. same space, two views — one store photo split guest / staff
@layout(L, f='L_PH_US_I', code='PH-US-I', p='user', name='같은 공간 두 시선 · 매장 사진 좌우 분할',
        when='같은 매장을 손님과 직원이 어떻게 다르게 겪는지 한 장의 사진을 좌우로 나눠 보이고, 각자의 기대 · 불편 · 원하는 것을 견줄 때',
        pv=[], sample=CUST['RT'], grp=G_US)
def _(b):
    s = header(b, EB_US, '같은 매대 앞, 손님과 직원은 다른 것을 봅니다', 'D 리테일 매장 관찰 [00]시간 · 인터뷰 손님 [00]명 · 직원 [00]명 — 사진은 역할 참고 이미지', w=1152)
    PX, PW, PY, PH = 340, 600, 152, 408
    s += photo(b, 'r4.rt-consult', PX, PY, PW, PH, pos='60% 40%', hint='한 매장 — 손님과 직원이 함께 보이는 장면 (고객 매장으로 교체)', radius=14)
    s += rect(PX + PW // 2 - 1, PY, 2, PH, 'rgba(255,255,255,0.9)')
    s += tag_on(b, '← 손님 시선', PX + 12, PY + 12)
    s += tag_on(b, '직원 시선 →', PX + PW - 112, PY + 12, dark=False)
    s += glass(b.tb('“직접 보고 비교해 보고 싶어요”', 'font-size: 13.5px; font-weight: 800; line-height: 20px; color: #ffffff; white-space: nowrap'), PX + 12, PY + PH - 52, None, None, pad='8px 12px')
    s += glass(b.tb('“상담하면서 재고도 봐야 해요”', 'font-size: 13.5px; font-weight: 800; line-height: 20px; color: #ffffff; white-space: nowrap'), PX + PW // 2 + 12, PY + PH - 52, None, None, pad='8px 12px')
    sides = [(64, '손님', '가족 단위 · 주말 방문', False,
              [('기대', '여러 제품을 한자리에서 견주고 싶습니다', '사양 · 가격 · 체험을 한 번에'),
               ('불편', '원하는 색상 · 재고를 물어볼 직원을 찾습니다', '주말 응대 대기 평균 [0]분'),
               ('원하는 것', '매대에서 바로 비교 · 재고 확인', '직원 없이도 스스로')]),
             (956, '직원', '매장 상담사 · 하루 [00]명 응대', True,
              [('기대', '상담에 집중해 구매로 잇고 싶습니다', '설명보다 제안에 시간을'),
               ('불편', '재고를 보러 창고 · 단말을 오갑니다', '상담 1건당 이동 [0]회'),
               ('원하는 것', '매대 옆 화면 하나로 재고 · 비교', '상담 중 손님과 같이 보기')])]
    for x, who, d, staff, items in sides:
        s += (f'<div style="{ab(x, PY, 260, 26, "display: flex; align-items: baseline; gap: 8px")}">'
              + b.tb(who, f'font-size: 18px; font-weight: 800; color: {BLUE if staff else INK}; white-space: nowrap')
              + b.tb(d, f'font-size: 12px; color: {MUTED}; white-space: nowrap') + '</div>')
        for k, (lb, t, sm) in enumerate(items):
            y = PY + 36 + k * 126
            col = WARN if lb == '불편' else BLUE
            inner = (lab(b, lb, color=col, size=12) + tline(b, t, size=14.5, lh=21, lines=2) + one(b, sm, size=12, color=MUTED))
            bg = WARNBG if lb == '불편' else (CHIP if staff else SOFT)
            s += card(inner, x, y, 260, 114, bg=bg, pad='12px 14px', gap=4, radius=12)
    s += (f'<div style="{ab(64, 576, 1152, 72, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 0 24px; display: flex; align-items: center; gap: 18px")}">'
          + b.tb('두 시선이 만나는 곳', f'font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap; flex-shrink: 0')
          + b.tb('매대 옆 화면 하나 — 손님은 스스로 비교하고, 직원은 같은 화면으로 재고를 보며 상담합니다', 'font-size: 18px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</div>')
    s += footer(b, foot('RT', '관찰 · 인터뷰 수치는 자리표시'), 8)
    return s


# ---------------------------------------------------------------- 10. empathy map — visitor photo centre, says · thinks · does · feels, pains · gains
@layout(L, f='L_PH_US_J', code='PH-US-J', p='user', name='공감 지도 · 관람객 사진 가운데',
        when='대표 관람객 한 사람을 가운데 사진으로 세우고 말 · 생각 · 행동 · 감정 네 칸과 고통 · 얻고 싶은 것을 정리해 공감대를 만들 때',
        pv=[], sample=CUST['TP'], grp=G_US)
def _(b):
    s = header(b, EB_US, 'P 테마파크를 찾는 가족 관람객의 공감 지도입니다', '대표 관람객 · 30대 부모와 초등생 자녀 — 현장 인터뷰 [00]가족 · 동행 관찰 기반 · 사진은 참고 이미지', w=1152)
    s += photo(b, 'ph.tp-panda-touch', 424, 152, 432, 368, pos='72% 40%', hint='대표 관람객 — 가족이 전시를 즐기는 장면 (고객 현장 사진으로 교체)', radius=16)
    s += label_on(b, '대표 관람객', '아이와 함께 온 30대 부모 · 연 [0]회 방문', 436, 452, 408, lines=1)
    quads = [('SAYS', '말', 64, 152, ['“줄이 얼마나 긴지 미리 알면 좋겠어요”', '“아이가 직접 만질 수 있는 게 좋아요”', '“다음엔 어디로 가야 해요?”']),
             ('THINKS', '생각', 872, 152, ['오늘 안에 다 볼 수 있을까?', '이 돈 내고 온 보람이 있을까?', '아이가 지루해하기 전에 움직여야 해']),
             ('DOES', '행동', 64, 344, ['지도 앱 · 안내판을 번갈아 봅니다', '대기 줄에서 휴대폰으로 시간을 확인합니다', '인기 전시 앞에서 [00]분 넘게 기다립니다']),
             ('FEELS', '감정', 872, 344, ['기다릴 때 지치고 초조합니다', '아이가 웃을 때 가장 만족합니다', '길을 잃으면 당황하고 서두르게 됩니다'])]
    for en, ko, x, y, items in quads:
        inner = row(b.tb(ko, f'font-size: 16px; font-weight: 800; color: {INK}; white-space: nowrap')
                    + b.tb(en, f'{NUM}; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: {BLUE}; white-space: nowrap'), 8)
        for t in items:
            inner += ('<span style="display: flex; gap: 8px; align-items: flex-start">'
                      + f'<i style="width: 5px; height: 5px; border-radius: 50%; background: {BLUE}; margin-top: 8px; flex-shrink: 0"></i>'
                      + tline(b, t, size=14, lh=21, lines=2, color=BODY, weight=700) + '</span>')
        s += card(inner, x, y, 344, 176, bg=SOFT, pad='16px 18px', gap=10, radius=14)
    # pains · gains with thumbnails
    pg = [('PAIN', '고통', '기다림과 길 찾기에 하루의 [00]%를 씁니다', '대기 · 혼잡을 미리 알 수 없음 · 안내가 흩어져 있음', 'ph.tp-preshow', '50% 50%', True),
          ('GAIN', '얻고 싶은 것', '아이와 함께 몰입하는 시간이 길어지길 바랍니다', '실시간 대기 안내 · 직접 만지는 체험 · 동선 추천', 'ph.tp-panda-corridor', '50% 50%', False)]
    for i, (en, ko, t, d, pid, pos, pain) in enumerate(pg):
        x = 64 + i * 584
        s += box(x, 536, 568, 112, bg=WARNBG if pain else CHIP, radius=14)
        s += photo(b, pid, x, 536, 168, 112, pos=pos, hint=f'{ko} — 관련 장면 (고객 현장으로 교체)', radius=14)
        inner = (row(b.tb(ko, f'font-size: 14px; font-weight: 800; color: {WARN if pain else BLUE}; white-space: nowrap')
                     + b.tb(en, f'{NUM}; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; color: {WARN if pain else BLUE}; white-space: nowrap'), 8)
                 + tline(b, t, size=15, lh=22, lines=1) + one(b, d, size=12.5, color=BODY))
        s += card(inner, x + 168, 536, 400, 112, bg='transparent', pad='14px 18px', gap=5)
    s += footer(b, foot('TP', '인터뷰 수치는 자리표시'), 7)
    return s
