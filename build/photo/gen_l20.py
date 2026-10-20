# 5차 — 시사점 · 제안 방향 사진 레이아웃 9장 (L_PH_IM_F ~ L_PH_IM_N)
# Win Theme · 결정 기준 대응 · ERRC · 인사이트 풀블리드 · 단계별 방향 · 빈자리 · 고객 질문 · 제안서 흐름 · 메시지 하우스
from gen_r5 import *
L = []
GRP = '시사점 · 제안 방향'


def foot(X, extra, rivals=False):
    return (DEAL[X] + ' · ' + extra + ' · 경쟁사 익명' + (' · 경쟁사 제품은 실루엣 자리' if rivals else '')
            + f' · 사진: samsung.com {SRC[X]} 도입사례 · 비즈니스 페이지')


def lab(b, text, color=BLUE, size=12):
    """작은 섹션 라벨 (flex 칸 안 조각)"""
    return b.tb(text, f'font-size: {size}px; font-weight: 800; color: {color}; white-space: nowrap')


def tline(b, text, size=15, lh=21, lines=2, color=INK, weight=800):
    return b.tb(text, f'font-size: {size}px; font-weight: {weight}; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def dline(b, text, size=12.5, lh=18, lines=2, color=BODY):
    return b.tb(text, f'font-size: {size}px; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def row(inner, gap=6, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; flex-wrap: wrap; {extra}">{inner}</span>'


# ---------------------------------------------------------------- F · Win Theme — hero photo + glass message, 3 differentiators with proof
@layout(L, f='L_PH_IM_F', code='PH-IM-F', p='insight', p2='why', name='Win Theme · 풀블리드 사진 + 차별화 셋',
        when='이번 제안의 핵심 메시지 한 문장을 현장 사진 위에 크게 걸고, 그것을 받치는 차별화 셋과 증거 수치를 함께 보여줄 때',
        pv=[], sample=CUST['MD'], grp=GRP)
def _(b):
    s = photo(b, 'ph.md-care-room', 0, 0, 1280, 396, pos='50% 62%', hint='요양병원 병실 · 케어 공간 전경 (고객 병원 사진으로 교체)', radius=0)
    s += f'<div style="{ab(0, 0, 1280, 396, "background: linear-gradient(90deg, rgba(10,14,24,0.72) 0%, rgba(10,14,24,0.42) 50%, rgba(10,14,24,0.06) 100%)")}"></div>'
    s += header(b, EB_IN, '이번 제안을 한 문장으로 — Win Theme', 'W 요양병원 경영진 · 간호부 인터뷰에서 뽑은 핵심 메시지와, 그것을 받치는 차별화 셋', w=900, dark=True)
    s += glass(b.tb('WIN THEME · 핵심 메시지', f'font-size: 12px; font-weight: 800; letter-spacing: 0.04em; color: {LB}; white-space: nowrap')
               + b.tb('어르신 곁의 공기는 밤낮 같게, 간호 인력의 시간은 다시 병상 곁으로', f'font-size: 30px; font-weight: 800; line-height: 44px; color: #ffffff; {clamp(2)}')
               + b.tb('설비 관리를 사람에서 시스템으로 옮겨, 케어의 질과 운영비를 함께 잡는 병원', f'font-size: 14px; line-height: 20px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
               64, 178, 760, None, pad='18px 24px', gap=8)
    s += tag_on(b, '[ ] 요양병원 · 케어 공간', 1060, 352)
    cols = [('ph.md-ward-360', '50% 30%', '01', '병실마다 따로 맞추던 온도를 한 화면에서', '[00]', '%', '야간 온도 민원 감소', ['사례 · [ ] 요양병원', '수치 · 출처 [ ]']),
            ('ph.md-air-cube', '50% 60%', '02', '감염 걱정을 덜어 주는 병실 공기 관리', '[0.0]', '배', '시간당 환기 · 정화 횟수', ['인증 · [공기청정 인증]', '시험 · [기관]']),
            ('ph.md-staff-tab', '45% 45%', '03', '설비 점검은 태블릿으로, 간호는 병상 곁에서', '[00]', '분', '근무조당 순회 시간 절감', ['사례 · [ ] 병원', '수치 · 시범 측정'])]
    for i, (pid, pos, n, t, v, u, d, ev) in enumerate(cols):
        x = 64 + i * 392
        s += box(x, 412, 368, 236, SOFT, 14)
        s += photo(b, pid, x, 412, 140, 236, pos=pos, hint=f'차별화 {n} 근거 장면 (고객 병원 사진으로 교체)', radius=14)
        s += (f'<div style="{ab(x + 156, 426, 198, 208, "display: flex; flex-direction: column; gap: 6px")}">'
              + row(numtag(b, n, 22) + lab(b, f'차별화 {int(n)}'), 6) + tline(b, t, 15, 21, 2)
              + '<span style="margin-top: auto"></span>' + bignum(b, v, u, size=36)
              + b.tb(d, f'font-size: 12px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + '<span style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px">' + ''.join(evid(b, e) for e in ev) + '</span></div>')
    s += footer(b, foot('MD', '수치는 자리표시 · 출처: [병원 운영 데이터 · 시험 기관, 연도]'), 9)
    return s


# ---------------------------------------------------------------- G · decision criteria (weights · key people) → our response + proof photo
@layout(L, f='L_PH_IM_G', code='PH-IM-G', p='insight', p2='requirements', name='결정 기준 → 우리 대응 · 증거 사진',
        when='인터뷰 · RFP에서 뽑은 고객의 결정 기준을 가중치 순으로 세우고, 기준마다 우리 대응 방향과 증거 장면을 붙일 때',
        pv=[], sample=CUST['FN'], grp=GRP)
def _(b):
    s = header(b, EB_IN, 'T 은행이 고르는 기준 넷, 기준마다 답을 준비했습니다', '결정 기준 · 가중치 = 키맨 인터뷰 [00]명 + RFP 평가표 · 출처: [인터뷰 · RFP, 연도]', w=1152)
    s += b.tb('고객의 결정 기준 · 가중치 순', ab(64, 152, 400, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}'), 'div')
    s += b.tb('우리 대응 방향 · 증거 장면', ab(568, 152, 400, 18, f'font-size: 12px; font-weight: 800; color: {BLUE}'), 'div')
    rows = [('정보 보안 · 규제 준수', 0.92, '[00]%', ['IT', '준법감시'], 'ph.fn-tab-banker', '50% 40%', '단말 단에서 막는 보안 — 업무 앱만 도는 전용 태블릿', '인증 · [금융권 보안 인증]'),
            ('창구 처리 시간', 0.78, '[00]%', ['영업점장'], 'fill.bank_esign', '50% 45%', '종이 서식을 전자서식 · S펜 서명으로, 한 건 [00]분 단축', '사례 · [ ] 은행 영업점'),
            ('고객 상담 경험', 0.6, '[00]%', ['영업점장', '마케팅'], 'fill.banker_tab', '50% 40%', '고객과 같은 화면을 보며 상품을 설명합니다', '수치 · 상담 만족도 [00]점'),
            ('총비용 · 운영 부담', 0.48, '[00]%', ['구매', 'IT'], 'ph.fn-branch', '50% 55%', '[000]개 영업점 일괄 공급 · 원격 관리로 운영 인력 그대로', '근거 · 5년 총비용 p.[00]')]
    for i, (nm, wt, wv, keys, pid, pos, ans, ev) in enumerate(rows):
        y = 178 + i * 120
        s += (f'<div style="{ab(64, y, 456, 108, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px")}">'
              + '<span style="display: flex; align-items: center; gap: 8px">' + numtag(b, str(i + 1), 24, BLUE if i == 0 else '#6f7a90')
              + b.tb(nm, 'font-size: 16px; font-weight: 800; white-space: nowrap')
              + b.tb('가중치 ' + wv, f'{NUM}; margin-left: auto; font-size: 15px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>'
              + f'<span style="display: block; height: 10px; border-radius: 5px; background: {LINE}"><i style="display: block; width: {round(wt * 100)}%; height: 10px; border-radius: 5px; background: {BLUE if i == 0 else "#7f91d6"}"></i></span>'
              + '<span style="display: flex; align-items: center; gap: 6px">' + b.tb('키맨', f'font-size: 11.5px; font-weight: 700; color: {MUTED}')
              + ''.join(chip(b, k, color=INK, bg='#ffffff', size=11.5, h=22, extra=f'border: 1px solid {LINE}') for k in keys) + '</span></div>')
        s += ARR(524, y + 44, 40, 20)
        s += photo(b, pid, 568, y, 320, 108, pos=pos, hint=f'기준 {i + 1} 증거 장면 (고객 영업점 사진으로 교체)', radius=12)
        s += card(lab(b, f'우리 대응 {i + 1}', BLUE, 11.5) + tline(b, ans, 15, 21, 2) + '<span style="margin-top: auto"></span>' + evid(b, ev),
                  900, y, 316, 108, bg=CHIP, pad='11px 14px', gap=3)
    s += footer(b, foot('FN', '가중치 · 막대 길이는 예시 · 키맨 직함은 익명'), 10)
    return s


# ---------------------------------------------------------------- H · ERRC four columns with photos
@layout(L, f='L_PH_IM_H', code='PH-IM-H', p='insight', name='ERRC · 네 칸 사진 + 항목',
        when='고객 매장에서 없앨 것 · 줄일 것 · 늘릴 것 · 새로 만들 것을 네 칸으로 나눠, 칸마다 그 장면 사진과 항목 두세 개로 보여줄 때',
        pv=[], sample=CUST['FB'], grp=GRP)
def _(b):
    s = header(b, EB_IN, 'A 커피 매장에서 없애고 · 줄이고 · 늘리고 · 새로 만들 것입니다', 'ERRC — 손님 가치는 올리고 매장 운영 부담은 덜어 내는 네 방향 · 출처: 매장 관찰 · 점장 인터뷰 [00]명', w=1152)
    cols = [('ph.fb-counter-gray', '50% 40%', 'ELIMINATE', '없앨 것', '×', SOFT, INK, MUTED,
             [('종이 메뉴판 · 가격표 인쇄', '[000]개 매장 출력 · 배송'), ('매장별 수작업 메뉴 교체', '점장이 영업 뒤에 하던 일'), ('가격 불일치 클레임', '본사 · 매장 가격 차이')]),
            ('ph.fb-pickup', '50% 45%', 'REDUCE', '줄일 것', '−', SOFT, INK, MUTED,
             [('주문 · 픽업 대기 시간', '[00]% 단축 목표'), ('메뉴 교체 리드타임', '[00]일 → [0]일'), ('장애 때 매장 방문 점검', '원격 알림 · 원격 조치로')]),
            ('ph.fb-cafe-bright', '50% 40%', 'RAISE', '늘릴 것', '+', CHIP, BLUE, BODY,
             [('추천 · 세트 메뉴 노출', '시간대별 자동 전환'), ('신메뉴 출시 속도', '전 매장 같은 날 동시'), ('객단가', '[00]% 상승 목표')]),
            ('ph.fb-mobile-order', '50% 60%', 'CREATE', '새로 만들 것', '★', BLUE, '#ffffff', '#dfe5ff',
             [('모바일 주문 ↔ 매장 화면 연동', '픽업 번호 화면 호출'), ('날씨 · 시간 연동 메뉴', '데이터로 자동 편성'), ('매장 화면 제휴 광고', '협력사 프로모션 수익')])]
    for i, (pid, pos, en, ko, sym, bg, c1, c2, items) in enumerate(cols):
        x = 64 + i * 292
        s += photo(b, pid, x, 152, 276, 252, pos=pos, hint=f'{ko} — 해당 장면 사진 (고객 매장으로 교체)', radius=14)
        s += tag_on(b, f'{en} · {ko}', x + 10, 162)
        inner = (f'<span style="display: flex; align-items: baseline; gap: 8px">' + b.tb(ko, f'font-size: 18px; font-weight: 800; color: {c1}; white-space: nowrap')
                 + b.tb(en, f'{NUM}; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; color: {c2}; white-space: nowrap') + '</span>')
        for t, d in items:
            inner += ('<span style="display: flex; gap: 10px; align-items: flex-start">'
                      + b.tb(sym, f'width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; background: {"rgba(255,255,255,0.18)" if bg == BLUE else "#ffffff"}; color: {c1}; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center')
                      + '<span style="display: flex; flex-direction: column; gap: 1px; min-width: 0">'
                      + b.tb(t, f'font-size: 14px; font-weight: 800; line-height: 20px; color: {c1}; {clamp(2)}')
                      + b.tb(d, f'font-size: 12px; line-height: 17px; color: {c2}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span></span>')
        s += card(inner, x, 416, 276, 232, bg=bg, pad='14px 16px', gap=12, radius=14)
    s += footer(b, foot('FB', '목표 수치는 자리표시 · 흑백 사진은 ‘지금’ 장면 표시'), 12)
    return s


# ---------------------------------------------------------------- I · one insight on a full-bleed stadium + 3 data cards
@layout(L, f='L_PH_IM_I', code='PH-IM-I', p='insight', name='핵심 인사이트 한 문장 · 풀블리드 + 데이터 셋',
        when='분석에서 얻은 가장 중요한 인사이트 한 문장을 현장 사진 전체 위에 크게 놓고, 그것을 받치는 데이터 셋과 제안 방향으로 넘길 때',
        pv=[], sample=CUST['VN'], grp=GRP)
def _(b):
    s = photo(b, 'ph.vn-stadium-wide', 0, 0, 1280, 720, pos='50% 50%', hint='경기장 전경 (풀블리드 · 고객 경기장 사진으로 교체)', radius=0)
    s += f'<div style="{ab(0, 0, 1280, 720, "background: linear-gradient(180deg, rgba(8,12,20,0.78) 0%, rgba(8,12,20,0.38) 34%, rgba(8,12,20,0.55) 62%, rgba(8,12,20,0.9) 100%)")}"></div>'
    s += header(b, EB_IN, '관중이 떠나는 이유는 경기가 아니라 기다림입니다', 'V 경기장 관람객 설문 [0,000]명 · 현장 관찰 [00]경기 · 출처: [조사 기관, 연도]', w=1000, dark=True)
    s += glass(b.tb('KEY INSIGHT', f'{NUM}; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; color: {LB}')
               + b.tb('“관중은 경기를 보러 오지만, 다시 오지 않는 이유는 줄 서고 헤맨 시간입니다”', f'font-size: 32px; font-weight: 800; line-height: 46px; color: #ffffff; {clamp(3)}')
               + b.tb('매표 · 매점 · 화장실 · 퇴장 — 경기 밖의 시간이 재방문을 가릅니다', f'font-size: 14px; line-height: 20px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
               64, 300, 660, None, pad='22px 26px', gap=10)
    data = [('[00]', '%', '경기당 줄 서기에 쓴 시간 비율', '출처: [관람객 설문, 연도]'),
            ('[00]', '분', '매점 평균 대기 · 이닝 사이 15분 중', '출처: [현장 관찰, 연도]'),
            ('[0.0]', '배', '대기 불만 관중의 재방문 의향 차이', '출처: [조사 기관, 연도]')]
    for i, (v, u, t, src) in enumerate(data):
        y = 236 + i * 108
        s += (f'<div style="{ab(776, y, 440, 96, f"box-sizing: border-box; border-radius: 12px; background: {GLASS}; padding: 12px 18px; display: flex; align-items: center; gap: 16px")}">'
              + f'<span style="width: 128px; flex-shrink: 0">' + bignum(b, v, u, size=38, color='#ffffff') + '</span>'
              + '<span style="display: flex; flex-direction: column; gap: 4px; min-width: 0">'
              + b.tb(t, f'font-size: 14px; font-weight: 800; line-height: 20px; color: #ffffff; {clamp(2)}')
              + b.tb(src, f'font-size: 11px; color: {LT}; white-space: nowrap') + '</span></div>')
    s += (f'<div style="{ab(64, 580, 1152, 64, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 0 24px; display: flex; align-items: center; gap: 18px")}">'
          + b.tb('그래서 제안 방향 →', f'font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap; flex-shrink: 0')
          + b.tb('경기 밖의 기다림을 줄이는 경기장 — 모바일 주문 · 대기 안내 화면 · 동선 사이니지', 'font-size: 19px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += footer(b, foot('VN', '수치는 자리표시'), 9, dark=True)
    return s


# ---------------------------------------------------------------- J · phased direction now · 1 year · 3 years
@layout(L, f='L_PH_IM_J', code='PH-IM-J', p='insight', p2='execution', name='단계별 제안 방향 · 지금 · 1년 · 3년 사진',
        when='제안 방향을 지금 시범 · 1년 확산 · 3년 새 모델의 세 단계로 나눠, 단계마다 장면 사진 · 범위 · 목표 KPI와 바꾸지 않을 원칙을 보여줄 때',
        pv=[], sample=CUST['SV'], grp=GRP)
def _(b):
    s = header(b, EB_IN, '지금 시범으로 검증하고, 3년 뒤엔 새 매장 모델이 됩니다', 'N 체인 무인 운영 — 단계마다 방향 · 범위 · 목표 KPI · 출처: [N 체인 매장 데이터, 연도]', w=1152)
    cols = [('r4.sv-cvs-mfp', '50% 40%', 'NOW', '지금 · 시범', '0–6개월', '시범 매장에서 무인 결제 · 셀프 서비스 코너를 먼저 검증합니다', '매장 [00]곳', '무인 결제 [00]%'),
            ('ph.sv-cu-store', '50% 45%', '1 YEAR', '1년 · 확산', '7–18개월', '검증된 구성을 표준 패키지로 묶어 체인 전체로 넓힙니다', '매장 [000]곳', '운영비 −[00]%'),
            ('ph.sv-study-night', '50% 55%', '3 YEARS', '3년 · 새 모델', '19–36개월', '심야 무인 · 원격 관제로 24시간 매장 모델을 만듭니다', '[000]곳', '심야 매출 [00]%')]
    for i, (pid, pos, en, ko, per, d, scope, kp) in enumerate(cols):
        x = 64 + i * 398
        s += photo(b, pid, x, 152, 356, 236, pos=pos, hint=f'{ko} 단계 장면 사진 (고객 매장으로 교체)', radius=14)
        s += tag_on(b, f'{en} · {per}', x + 10, 162)
        bg = BLUE if i == 2 else SOFT
        c1, c2 = ('#ffffff', LB) if i == 2 else (INK, BLUE)
        s += (f'<div style="{ab(x, 400, 356, 180, f"box-sizing: border-box; border-radius: 14px; background: {bg}; padding: 14px 18px; display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb(ko, f'font-size: 13px; font-weight: 800; color: {c2}; white-space: nowrap')
              + b.tb(d, f'font-size: 16px; font-weight: 800; line-height: 23px; color: {c1}; {clamp(2)}')
              + '<span style="margin-top: auto; display: flex; gap: 8px">' + kpi(b, '범위 · 신규 포함' if i == 2 else '범위', scope, w=150, dark=(i == 2)) + kpi(b, '목표 KPI', kp, w=162, dark=(i == 2)) + '</span></div>')
        if i < 2: s += ARR(x + 356, 258, 42, 24, size=22)
    s += (f'<div style="{ab(64, 594, 1152, 54, f"box-sizing: border-box; border-radius: 12px; border: 1.5px solid {BLUE}; background: #ffffff; padding: 0 22px; display: flex; align-items: center; gap: 18px")}">'
          + b.tb('끝까지 바꾸지 않을 원칙', f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap; flex-shrink: 0')
          + b.tb('손님은 혼자서도 막힘없이 — 모든 단계에서 매장 상태를 원격으로 지켜봅니다', 'font-size: 17px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += footer(b, foot('SV', '기간 · 범위 · KPI는 자리표시 · 고객과 확정'), 13)
    return s


# ---------------------------------------------------------------- K · where rivals crowd → the empty space → our position
@layout(L, f='L_PH_IM_K', code='PH-IM-K', p='insight', p2='competition', name='경쟁사가 비운 자리 → 우리 포지셔닝 사진',
        when='경쟁사가 몰린 곳과 아무도 채우지 않은 빈자리를 나란히 놓고, 그 빈자리를 우리 포지셔닝으로 가져가는 방향을 보여줄 때',
        pv=[], sample=CUST['AD'], grp=GRP)
def _(b):
    s = header(b, EB_IN, '경쟁사가 비워 둔 자리 — 광고 효과까지 책임지는 공급사입니다', 'Q 미디어 랜드마크 LED 입찰 · 경쟁사 제안서 · 공개 자료 분석 · 출처: [입찰 공고 · 업계 자료, 연도]', w=1152)
    # left — where rivals crowd
    s += b.tb('경쟁사가 몰린 곳', ab(64, 152, 300, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}'), 'div')
    s += box(64, 176, 340, 472, SOFT, 14)
    s += rival(b, 'led', 78, 190, 152, 172, hint='경쟁사 A 옥외 LED 사진 (공개 자료로 교체)', bg='#eceef2')
    s += rival(b, 'outdoor', 238, 190, 152, 172, hint='경쟁사 B 옥외 사이니지 사진 (공개 자료로 교체)', bg='#eceef2')
    s += pill(b, '경쟁사 A', bg=FAINT, extra='position: absolute; left: 86px; top: 198px')
    s += pill(b, '경쟁사 B · C', bg=FAINT, extra='position: absolute; left: 246px; top: 198px')
    crowd = [('가격 경쟁', '경쟁사 A · B — 단가 [00]% 인하로 입찰'), ('단품 납품', '패널만 납품, 콘텐츠 · 편성은 광고주 몫'), ('설치 후 철수', '유지보수 [0]년 · 현장 상주 없음')]
    for i, (k, d) in enumerate(crowd):
        y = 376 + i * 90
        s += (f'<div style="{ab(78, y, 312, 80, f"box-sizing: border-box; border-radius: 10px; background: #ffffff; border: 1px solid {LINE}; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px")}">'
              + chip(b, k, color='#ffffff', bg=FAINT, size=12) + dline(b, d, 13, 19, 2) + '</div>')
    s += ARR(404, 400, 24, 24, size=20, color=FAINT)
    # centre — empty space
    s += b.tb('아무도 채우지 않은 빈자리', ab(428, 152, 360, 18, f'font-size: 12px; font-weight: 800; color: {BLUE}'), 'div')
    gaps = [('fill.vxt_cms', '50% 50%', '콘텐츠 운영', '광고 편성 · 송출을 우리가 대신 운영'), ('fill.mi_console', '50% 40%', '광고 효과 측정', '노출 · 유동 인구 데이터를 광고주 리포트로'),
            ('fill.ctrl_room', '50% 50%', '원격 관제', '장애를 먼저 알고, 밤에도 화면을 지킴')]
    for i, (pid, pos, t, d) in enumerate(gaps):
        y = 176 + i * 162
        s += box(428, y, 360, 148, '#ffffff', 14, f'border: 2px dashed {BLUE}')
        s += photo(b, pid, 440, y + 12, 140, 124, pos=pos, hint=f'빈자리 {i + 1} · {t} 화면 (제안 솔루션 화면으로 교체)', radius=10)
        s += (f'<div style="{ab(594, y + 14, 182, 120, "display: flex; flex-direction: column; gap: 4px")}">'
              + lab(b, f'빈자리 {i + 1}', BLUE, 11.5) + b.tb(t, 'font-size: 17px; font-weight: 800; white-space: nowrap')
              + dline(b, d, 12.5, 18, 3) + '</div>')
    s += ARR(788, 400, 24, 24, size=20)
    # right — our position
    s += b.tb('우리 포지셔닝', ab(812, 152, 300, 18, f'font-size: 12px; font-weight: 800; color: {BLUE}'), 'div')
    s += photo(b, 'ph.ad-building-led', 812, 176, 404, 300, pos='35% 50%', hint='랜드마크 옥외 LED 사진 (고객 매체 사진으로 교체)', radius=14)
    s += tag_on(b, 'Q 미디어 · 랜드마크 LED', 824, 186)
    s += card(b.tb('광고 효과까지 책임지는 공급사', f'font-size: 19px; font-weight: 800; line-height: 26px; color: {BLUE}; white-space: nowrap')
              + dline(b, '패널 납품에서 끝나지 않고 콘텐츠 운영 · 효과 측정 · 원격 관제를 한 계약으로', 13, 19, 2)
              + '<span style="margin-top: auto; display: flex; gap: 6px">' + evid(b, '사례 · [ ] 랜드마크 LED') + evid(b, '수치 · 가동률 [00.0]%') + '</span>',
              812, 488, 404, 160, bg=CHIP, pad='16px 18px', gap=6, radius=14)
    s += footer(b, foot('AD', '경쟁 구도는 공개 자료 기준 예시', rivals=True), 11)
    return s


# ---------------------------------------------------------------- L · customer questions (scene photo) → our answers (+ product cut)
@layout(L, f='L_PH_IM_L', code='PH-IM-L', p='insight', p2='requirements', name='고객 질문 셋 → 우리의 답 · 현장 사진',
        when='현장 인터뷰에서 키맨이 던진 질문 셋을 그 질문이 나온 현장 사진 위에 놓고, 질문마다 우리의 답과 근거를 붙일 때',
        pv=[], sample=CUST['MF'], grp=GRP)
def _(b):
    s = header(b, EB_IN, '현장에서 받은 질문 셋, 이번 제안이 답합니다', 'L 제조 공장 현장 인터뷰 · 공장장 · 안전 · IT 담당 · 출처: [인터뷰 기록, 연도]', w=1152)
    qs = [('fill.factory_tab2', '30% 30%', '공장장', '“라인이 멈추면 누가 몇 분 안에 알 수 있나요?”',
           '설비 이상을 러기드 태블릿 · 워치로 바로 알립니다', '알람 → 담당자 단말 → 조치 기록까지 한 흐름', ['사례 · [ ] 공장', '수치 · 대응 [00]분 → [0]분'], 'cut.tabactive5'),
          ('ph.mf-worker-watch', '50% 22%', '안전', '“더위 · 위험 구역에서 작업자는 어떻게 지키나요?”',
           '워치가 온열 · 낙상 위험을 먼저 알립니다', '관제 화면에서 구역별 위험 · 위치 확인', ['인증 · [안전 인증]', '사례 · [ ] 제철소'], 'fill.watch_alert'),
          ('fill.dex_mfg', '50% 15%', 'IT', '“기존 MES · 보안 정책과 그대로 붙나요?”',
           '업무 앱만 도는 전용 단말 — MES 화면은 그대로', 'Knox 보안 · 원격 관리 · 기존 화면 연동', ['인증 · [보안 인증]', '근거 · 연동 구성 p.[00]'], 'cut.xcover7')]
    for i, (pid, pos, role, q, a, d, ev, cutp) in enumerate(qs):
        y = 152 + i * 170
        s += photo(b, pid, 64, y, 364, 156, pos=pos, hint=f'질문이 나온 현장 사진 · {role} (고객 공장으로 교체)', radius=12)
        s += tag_on(b, f'현장 · {role}', 74, y + 10)
        s += card(row(b.tb(f'질문 {i + 1}', f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap') + chip(b, role, color='#ffffff', bg=FAINT, size=11, h=20), 8)
                  + b.tb(q, f'font-size: 15px; font-weight: 800; line-height: 21px; flex-shrink: 0; {clamp(3)}')
                  + b.tb('현장 인터뷰 · [0000.00]', f'margin-top: auto; font-size: 11px; color: {FAINT}; white-space: nowrap'),
                  440, y, 220, 156, bg='#ffffff', pad='12px 14px', gap=6, border=LINE)
        s += ARR(660, y + 66, 36, 24, size=20)
        s += box(700, y, 516, 156, SOFT, 12)
        s += (f'<div style="{ab(718, y + 14, 340, 128, "display: flex; flex-direction: column; gap: 5px")}">'
              + lab(b, '우리의 답', BLUE, 12) + tline(b, a, 16, 24, 2) + dline(b, d, 13, 19, 1)
              + '<span style="margin-top: auto; display: flex; gap: 6px">' + ''.join(evid(b, e) for e in ev) + '</span></div>')
        s += cut(b, cutp, 1068, y + 10, 136, 136, hint='제안 제품 컷', pad=10, bg='#ffffff')
    s += footer(b, foot('MF', '인터뷰 원문은 요약 · 수치는 자리표시'), 10)
    return s


# ---------------------------------------------------------------- M · direction → proposal flow (6 chapters, a photo each)
@layout(L, f='L_PH_IM_M', code='PH-IM-M', p='insight', p2='overview', name='제안 방향 → 제안서 흐름 · 장마다 사진',
        when='제안 방향 한 문장을 맨 위에 두고, 그것을 풀어 갈 제안서 여섯 장의 흐름을 장마다 사진 · 보여줄 것 · 쪽 번호로 미리 보여줄 때',
        pv=[], sample=CUST['FB'], grp=GRP)
def _(b):
    s = header(b, EB_IN, '제안 방향 하나를 여섯 장의 흐름으로 풀어 갑니다', '이 장 다음부터의 제안서 지도 — 장마다 무엇을 보여 주는지와 쪽 번호', w=1152)
    s += (f'<div style="{ab(64, 152, 1152, 92, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 0 28px; display: flex; flex-direction: column; justify-content: center; gap: 4px")}">'
          + b.tb('제안 방향', f'font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: {LB}')
          + b.tb('[000]개 매장 메뉴를 본사에서 한 번에 — 손님은 빨리 고르고, 점장은 손대지 않습니다', 'font-size: 22px; font-weight: 800; line-height: 32px; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += f'<div style="{ab(632, 248, 16, 16, f"display: flex; align-items: center; justify-content: center; color: {BLUE}; font-size: 14px; font-weight: 800")}">↓</div>'
    steps = [('ph.fb-cafe-counter', '50% 40%', '시장', '커피 매장 메뉴판이 화면으로 바뀌는 흐름', 'p.[03]'),
             ('ph.fb-counter-menu', '50% 30%', '과제', '메뉴 교체 [00]일 · 가격 불일치 [00]건', 'p.[06]'),
             ('ph.fb-tablet-menu', '45% 45%', '가치', '손님은 고르기 쉽게, 점장은 손 안 대게', 'p.[09]'),
             ('ph.fb-lounge-ac', '50% 50%', '공간', '카운터 · 픽업 · 좌석, 자리마다 맞는 화면', 'p.[12]'),
             ('ph.fb-pos-pay', '50% 50%', '효과', '객단가 [00]% · 운영비 [00]% 개선 목표', 'p.[16]'),
             ('r4.fb-kitchen-tab', '55% 40%', '실행', '시범 [00]곳 → 전 매장 [000]곳 일정', 'p.[20]')]
    for i, (pid, pos, nm, d, pg) in enumerate(steps):
        x = 64 + i * 196
        s += photo(b, pid, x, 270, 172, 228, pos=pos, hint=f'{nm} 장을 대표하는 사진 (고객 매장으로 교체)', radius=12)
        s += tag_on(b, f'{i + 1:02d}', x + 8, 278)
        s += card(b.tb(nm, 'font-size: 17px; font-weight: 800; white-space: nowrap') + dline(b, d, 12.5, 18, 3)
                  + '<span style="margin-top: auto"></span>' + evid(b, pg, color=BLUE, bg='#ffffff', border='#c9d2f2'),
                  x, 508, 172, 140, bg=CHIP if i in (2, 3) else SOFT, pad='12px 14px', gap=5)
        if i < 5: s += ARR(x + 172, 374, 24, 20, size=16)
    s += footer(b, foot('FB', '쪽 번호는 자리표시'), 14)
    return s


# ---------------------------------------------------------------- N · message house — roof · 3 photo pillars · proof foundation
@layout(L, f='L_PH_IM_N', code='PH-IM-N', p='insight', p2='value', name='메시지 하우스 · 기둥 셋 사진 카드',
        when='핵심 메시지를 지붕에, 그것을 받치는 지원 메시지 셋을 사진 기둥으로, 증거를 바닥 띠로 쌓아 제안 메시지 구조를 한 장에 보여줄 때',
        pv=[], sample=CUST['TP'], grp=GRP)
def _(b):
    s = header(b, EB_IN, '하나의 메시지를 세 기둥과 네 가지 증거가 받칩니다', 'P 테마파크 몰입형 전시 제안의 메시지 하우스 — 지붕 · 기둥 · 기반', w=1152)
    s += f'<div style="{ab(64, 150, 1152, 124, f"background: {BLUE}; clip-path: polygon(50% 0, 100% 100%, 0 100%)")}"></div>'
    s += b.tb('핵심 메시지', ab(440, 206, 400, 16, f'font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: {LB}; text-align: center'), 'div')
    s += b.tb('입구에서 퇴장까지, 관람객이 이야기 속에 머무는 테마파크', ab(290, 230, 700, 32, 'font-size: 23px; font-weight: 800; line-height: 32px; color: #ffffff; text-align: center; white-space: nowrap'), 'div')
    pillars = [('ph.tp-panda-corridor', '50% 45%', '기둥 1 · 몰입', '공간 전체가 화면이 됩니다', '곡면 · 천장 LED로 끊김 없는 장면'),
               ('ph.tp-panda-touch', '55% 40%', '기둥 2 · 참여', '보는 전시에서 만지는 전시로', '터치 사이니지로 가족이 함께 참여'),
               ('ph.tp-exit-wall', '50% 50%', '기둥 3 · 운영', '콘텐츠는 하루에도 여러 번 바뀝니다', '시즌 · 시간대 콘텐츠를 원격 송출')]
    for i, (pid, pos, k, t, d) in enumerate(pillars):
        x = 104 + i * 368
        s += photo(b, pid, x, 284, 336, 296, pos=pos, hint=f'{k} 장면 사진 (고객 시설로 교체)', radius=12)
        s += glass(b.tb(k, f'font-size: 11.5px; font-weight: 800; color: {LB}; white-space: nowrap')
                   + b.tb(t, 'font-size: 17px; font-weight: 800; line-height: 24px; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                   + b.tb(d, f'font-size: 12.5px; line-height: 18px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
                   x + 12, 494, 312, None, pad='9px 14px', gap=1)
    s += (f'<div style="{ab(64, 592, 1152, 56, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; border-top: 3px solid {BLUE}; padding: 0 18px; display: flex; align-items: center; gap: 10px")}">'
          + b.tb('기반 · 증거', f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap; flex-shrink: 0; margin-right: 6px')
          + ''.join(chip(b, e, color=INK, bg='#ffffff', size=12, h=28, extra=f'border: 1px solid {LINE}; flex-shrink: 0; align-self: center')
                    for e in ['사례 · [ ] 테마파크 몰입 전시', '인증 · [LED 화질 인증]', '수치 · 체류 시간 +[00]분', '서비스 · 현장 상주 · 원격 관제']) + '</div>')
    s += footer(b, foot('TP', '수치 · 인증은 자리표시 · 출처: [ ]'), 15)
    return s
