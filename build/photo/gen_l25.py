# 7차 — 기대 효과 · 사용자 이해 사진 레이아웃 10장
# 기대 효과: L_PH_EF_J 하루 전 → 후 · L_PH_EF_K 사람마다 얻는 것 · L_PH_EF_L 공간별 효과 지도 · L_PH_EF_M 한 장 대시보드 · L_PH_EF_N 시점별 효과
#           L_PH_EF_O 사례로 본 효과 · L_PH_EF_P 효과 범위(원본 L_EF_H) · L_PH_EF_Q 효과를 무엇으로 재나
# 사용자 이해: L_PH_US_G 한 사람의 하루 · L_PH_US_H 사람마다 쓰는 기기
from gen_r5 import *
L = []
EB_E, EB_U = '02 · 기대 효과', '01 · 사용자 이해'
GE, GU = '효과 · 사진', '이해 · 사진'


def foot(X, extra=''):
    return DEAL[X] + (' · ' + extra if extra else '') + f' · 사진: samsung.com {SRC[X]} 도입사례 · 비즈니스 페이지'


def gray(h):
    """사진 칸을 흑백으로 (‘지금’ 자리)"""
    return h.replace('style="', 'style="filter: grayscale(1); ', 1)


def lab(b, text, color=BLUE, size=12):
    return b.tb(text, f'font-size: {size}px; font-weight: 800; color: {color}; white-space: nowrap')


def tline(b, text, size=15, lh=22, lines=1, color=INK, weight=800):
    return b.tb(text, f'font-size: {size}px; font-weight: {weight}; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def dline(b, text, size=12.5, lh=18, lines=2, color=BODY):
    return b.tb(text, f'font-size: {size}px; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def row(inner, gap=6, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; {extra}">{inner}</span>'


def flex(x, y, w, h, inner, extra=''):
    return f'<div style="{ab(x, y, w, h, extra)}">{inner}</div>'


def hline(x, y, w, color=LINE, h=1):
    return f'<div style="{ab(x, y, w, h, f"background: {color}")}"></div>'


def vline(x, y, h, color=LINE, w=1):
    return f'<div style="{ab(x, y, w, h, f"background: {color}")}"></div>'


def big(b, val, size=40, color=BLUE):
    """큰 숫자 (정수 줄 높이 — 겹침 검사용)"""
    return b.tb(val, f'{NUM}; font-size: {size}px; font-weight: 800; line-height: {round(size * 1.2)}px; color: {color}; white-space: nowrap')


def dchip(b, text, color=BLUE, bg=CHIP):
    return b.tb(text, f'align-self: center; height: 22px; padding: 0 9px; border-radius: 6px; background: {bg}; color: {color}; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap; flex-shrink: 0')


# ---------------------------------------------------------------- 1 하루 전 → 후 · 시간대 사진 쌍
@layout(L, f='L_PH_EF_J', code='PH-EF-J', p='effect', p2=None, name='하루 전 → 후 · 시간대 사진 쌍',
        when='매장의 하루를 오픈 · 점심 피크 · 저녁 · 마감으로 나눠, 시간대마다 지금 장면과 도입 후 장면 · 바뀌는 수치를 맞대어 보여줄 때',
        pv=[], sample=CUST['FB'], grp=GE)
def _(b):
    s = header(b, EB_E, '같은 하루, 네 번의 순간이 이렇게 달라집니다', 'A 커피 매장의 하루 · 위는 지금, 아래는 도입 후 · 수치는 예상치 · 출처: [유사 사례 · POS 데이터, 연도]', w=1152)
    cols = [('07:00', '오픈', 'ph.fb-counter-gray', '50% 40%', 'ph.fb-counter-menu', '50% 40%', '아침 메뉴로 바꾸기', '[00]', '분', '[0]', '분',
             '예약한 아침 메뉴가 오픈 시각에 저절로 켜집니다'),
            ('12:00', '점심 피크', 'ph.fb-cafe-counter', '30% 50%', 'fill.kiosk_touch', '60% 40%', '주문 대기', '[0.0]', '분', '[0.0]', '분',
             '키오스크가 주문을 나눠 받아 카운터 줄이 짧아집니다'),
            ('18:00', '저녁', 'ph.fb-cafe-dark', '50% 50%', 'fill.cafe_menuwall', '50% 40%', '저녁 프로모션 판매', '[00]', '%', '[00]', '%',
             '저녁 한정 메뉴 · 디저트 할인을 화면에 바로 띄웁니다'),
            ('22:00', '마감', 'ph.fb-lounge-ac', '50% 50%', 'fill.phone_signage', '50% 50%', '마감 정리', '[00]', '분', '[0]', '분',
             '휴대폰으로 화면 · 냉난방을 끄고 내일 메뉴를 예약합니다')]
    for i, (tm, nm, p0, q0, p1, q1, m, v0, u0, v1, u1, cap) in enumerate(cols):
        x = 64 + i * 292
        s += flex(x, 150, 276, 24, lab(b, tm, BLUE, 15) + tline(b, nm, 15, 22), 'display: flex; align-items: center; gap: 8px')
        ph0 = photo(b, p0, x, 182, 276, 148, pos=q0, hint=f'{nm} · 지금 장면 (고객 매장 사진으로 교체 · 흑백 처리)', radius=12)
        s += ph0 if p0.endswith('-gray') else gray(ph0)
        s += tag_on(b, '지금', x + 10, 192)
        s += card(b.tb(m, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap')
                  + row(bignum(b, v0, u0, size=20, color=FAINT, unit_size=13) + b.tb('→', f'font-size: 16px; font-weight: 800; color: {BLUE}')
                        + bignum(b, v1, u1, size=24, color=BLUE, unit_size=14), 10),
                  x, 338, 276, 58, bg=CHIP, pad='6px 14px', gap=1, radius=10)
        s += photo(b, p1, x, 404, 276, 148, pos=q1, hint=f'{nm} · 도입 후 장면 (제안 화면 · 기기 사진으로 교체)', radius=12)
        s += tag_on(b, '도입 후', x + 10, 414, dark=False)
        s += flex(x, 560, 276, 36, dline(b, cap, 12.5, 18, 2), 'display: flex; flex-direction: column')
    s += (f'<div style="{ab(64, 606, 1152, 42, f"box-sizing: border-box; border-radius: 12px; border: 1.5px solid {BLUE}; background: #ffffff; padding: 0 20px; display: flex; align-items: center; gap: 18px")}">'
          + b.tb('하루를 합치면', f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + b.tb('직원 손이 가는 시간 [00]분 → [00]분 · 피크 주문 처리 +[00]% · 마감 뒤 대기 전력 −[00]%', 'font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += footer(b, foot('FB', '수치는 자리표시 · 위 사진은 흑백 처리한 지금 자리'), 12)
    return s


# ---------------------------------------------------------------- 2 사람마다 얻는 것 · 인물 사진 4 + KPI
@layout(L, f='L_PH_EF_K', code='PH-EF-K', p='effect', p2='user', name='사람마다 얻는 것 · 인물 사진 4 + KPI',
        when='같은 도입이 고객 · 현장 직원 · 시설팀 · 경영진에게 각각 어떤 효과로 돌아가는지, 인물 장면 사진과 KPI 두 개씩으로 나눠 보여줄 때',
        pv=[], sample=CUST['HT'], grp=GE)
def _(b):
    s = header(b, EB_E, 'B 호텔에서 네 사람이 각자 얻는 것이 다릅니다', '투숙객 · 프런트 직원 · 시설팀 · 경영진 — 사람마다 체감하는 효과와 확인할 KPI · 출처: [유사 사례, 연도]', w=1152)
    ps = [('ph.ht-welcome-tv', '8% 50%', '투숙객', '객실 [000]실 · 하루 [000]명', '객실 TV에서 안내 · 주문 · 체크아웃까지 한 번에 끝냅니다',
           ('객실 만족도', '+[0.0]점'), ('체크아웃 대기', '−[00]%'), '덕분에 · 객실 TV 웰컴 · 안내 화면'),
          ('fill.ht_front', '45% 50%', '프런트 직원', '[00]명 · 3교대', '반복 문의가 줄어 체크인 응대에 집중합니다',
           ('전화 · 대면 문의', '−[00]%'), ('체크인 응대', '[0]분 단축'), '덕분에 · 로비 안내 사이니지'),
          ('ph.svc-technician', '50% 30%', '시설팀', '[0]명 · 설비 [000]대', '고장 신고가 오기 전에 원격 알림으로 먼저 갑니다',
           ('긴급 출동', '−[00]%'), ('객실 냉난방 전력', '−[00]%'), '덕분에 · 원격 관제 · 시스템에어컨'),
          ('fill.meet_video', '15% 50%', '경영진', '총지배인 · 본사', '객실 · 로비 운영을 한 화면의 지표로 봅니다',
           ('부대 매출', '+[00]%'), ('투자 회수', '[00]개월'), '덕분에 · 월간 운영 리포트')]
    for k, (pid, pos, who, sub, gain, k1, k2, why) in enumerate(ps):
        x, y = 64 + (k % 2) * 584, 152 + (k // 2) * 257
        s += box(x, y, 568, 239, SOFT, 14)
        s += photo(b, pid, x, y, 236, 239, pos=pos, hint=f'{who} 장면 사진 (고객 현장 · 역할 참고 이미지로 교체)', radius=14)
        s += tag_on(b, who, x + 12, y + 12)
        s += card(lab(b, sub, MUTED, 11.5) + lab(b, '얻는 것', BLUE, 12)
                  + tline(b, gain, 17, 24, 2)
                  + '<span style="margin-top: auto; display: flex; gap: 8px">' + kpi(b, *k1, w=145) + kpi(b, *k2, w=145) + '</span>'
                  + b.tb(why, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
                  x + 236, y, 332, 239, bg='transparent', pad='16px 18px 14px 20px', gap=5)
    s += footer(b, foot('HT', 'KPI 값은 자리표시 · 인물 사진은 역할 참고 이미지'), 13)
    return s


# ---------------------------------------------------------------- 3 공간별 효과 지도 · 공간 사진 격자 + 건물 합계
@layout(L, f='L_PH_EF_L', code='PH-EF-L', p='effect', p2=None, name='공간별 효과 지도 · 공간 사진 격자 + 건물 합계',
        when='건물 · 캠퍼스처럼 공간이 여럿인 제안에서, 로비 · 회의실 · 업무층 · 관제실 · 옥상마다 효과를 사진 위에 적고 건물 전체 합계로 묶을 때',
        pv=[], sample=CUST['OF'], grp=GE)
def _(b):
    s = header(b, EB_E, '공간마다 효과가 다르고, 합치면 건물 전체가 달라집니다', 'C 빌딩 여섯 공간 · 도입 1년 예상치 · 번호는 오른쪽 건물 단면의 위치 · 출처: [유사 빌딩 사례 · 에너지 고지서, 연도]', w=1152)
    sp = [('1', '로비', 'ph.of-lobby-info', '75% 50%', '−[00]%', '안내 문의 · 층별 안내 사이니지'),
          ('2', '회의실', 'ph.of-door-tab', '45% 50%', '−[00]%', '노쇼 · 문 앞 예약 태블릿'),
          ('3', '업무층', 'ph.of-office-ac', '50% 40%', '−[00]%', '냉난방 전력 · 재실 감지 제어'),
          ('4', '라운지', 'ph.of-lounge-tv', '60% 50%', '[00]%', '사내 공지 도달률 · 라운지 화면'),
          ('5', '관제실', 'ph.of-control-room', '50% 40%', '−[00]%', '장애 대응 시간 · 통합 관제'),
          ('6', '옥상', 'ph.of-rooftop-odu', '55% 50%', '−[00]%', '유지보수비 · 고효율 실외기')]
    for k, (n, nm, pid, pos, v, d) in enumerate(sp):
        x, y = 64 + (k % 3) * 266, 152 + (k // 3) * 255
        s += photo(b, pid, x, y, 252, 241, pos=pos, hint=f'{nm} 사진 (고객 건물 공간으로 교체)', radius=12)
        s += pin(b, n, x + 24, y + 24, size=30)
        s += tag_on(b, nm, x + 44, y + 12)
        s += glass(bignum(b, v, '', size=26, color='#ffffff')
                   + b.tb(d, f'font-size: 12px; font-weight: 700; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
                   x + 10, y + 167, 232, 64, pad='8px 12px', gap=2)
    # right — building section + total
    X, W = 868, 348
    s += box(X, 152, W, 496, BLUE, 14)
    s += flex(X + 22, 170, W - 44, 96, lab(b, '건물 전체 · 1년 합계', LB, 12.5)
              + bignum(b, '[000]', 'MWh 절감', size=44, color='#ffffff', unit_size=16)
              + b.tb('여섯 공간 효과의 합 · 운영비 [0,000]만 원/년', f'font-size: 12.5px; color: {LT}; white-space: nowrap'),
              'display: flex; flex-direction: column; gap: 4px')
    fl = [('RF', '옥상 · 실외기', '6', '[00]'), ('[00]F', '업무층 · 냉난방', '3', '[000]'), ('[0]F', '라운지 · 공지', '4', '—'),
          ('[0]F', '회의실 · 예약', '2', '[00]'), ('1F', '로비 · 안내', '1', '[0]'), ('B1', '관제실 · 통합 관제', '5', '[00]')]
    for k, (f, nm, n, v) in enumerate(fl):
        y = 290 + k * 42
        inset = 18 if k == 0 else 0
        s += box(X + 22 + inset, y, W - 44 - 2 * inset, 36, 'rgba(255,255,255,0.12)', 8)
        s += pin(b, n, X + 42 + inset, y + 18, size=22)
        s += flex(X + 60 + inset, y, W - 104 - 2 * inset, 36,
                  b.tb(f, f'{NUM}; font-size: 12px; font-weight: 800; color: {LB}; width: 40px; flex-shrink: 0; white-space: nowrap')
                  + b.tb(nm, 'font-size: 13px; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1')
                  + b.tb(v + (' MWh' if v != '—' else ''), f'{NUM}; font-size: 12.5px; font-weight: 800; color: #ffffff; white-space: nowrap'),
                  'display: flex; align-items: center; gap: 6px')
    s += flex(X + 22, 556, W - 44, 76, kpi(b, '운영비', '−[00]%', w=146, dark=True) + kpi(b, '탄소', '−[000] tCO₂e', w=146, dark=True),
              'display: flex; gap: 12px; align-items: flex-end')
    s += footer(b, foot('OF', '수치는 자리표시 · 공간 구성은 고객 건물에 맞춰 바꿈'), 13)
    return s


# ---------------------------------------------------------------- 4 효과 한 장 대시보드 · 큰 숫자 타일 6
@layout(L, f='L_PH_EF_M', code='PH-EF-M', p='effect', p2=None, name='효과 한 장 대시보드 · 사진 타일 + 숫자 타일',
        when='기대 효과를 여섯 개의 큰 숫자로 한 장에 요약할 때, 셋은 그 효과가 생기는 매장 사진 위에, 셋은 색 타일로 번갈아 놓아 경영진 요약으로 쓸 때',
        pv=[], sample=CUST['RT'], grp=GE)
def _(b):
    s = header(b, EB_E, '한 장으로 보는 D 리테일 플래그십의 1년 뒤', '여섯 개 지표 · 도입 1년 예상치 · 출처: [유사 사례 · POS · 방문객 카운터, 연도]', w=1152)
    T = [('photo', 64, 152, 470, 'r4.rt-flagship-led', '50% 50%', '체류', '매장 체류 시간', '+[00]%', 'LED 체험존 앞 평균 체류 · 방문객 카운터'),
         ('blue', 550, 152, 310, None, None, None, '방문 → 구매 전환', '+[0.0]%p', '체험존 · 상담 연결 · POS 기준'),
         ('photo', 876, 152, 340, 'ph.rt-shoppers', '62% 40%', '응대', '재고 문의 응대 시간', '−[00]%', '매대에서 태블릿으로 바로 조회'),
         ('chip', 64, 407, 340, None, None, None, '객단가', '+[00]%', '추천 · 연관 상품 화면 노출'),
         ('photo', 420, 407, 470, 'fill.price_tag', '45% 50%', '가격', '가격 교체 시간', '−[00]%', '전자 가격표 · 본사 일괄 반영'),
         ('blue', 906, 407, 310, None, None, None, '매장 전력', '−[00]%', '영업 외 시간 화면 · 냉난방 예약 꺼짐')]
    H = 241
    for kind, x, y, w, pid, pos, tg, t, v, d in T:
        if kind == 'photo':
            s += photo(b, pid, x, y, w, H, pos=pos, hint=f'{t} 장면 사진 (고객 매장 사진으로 교체)', radius=14)
            s += tag_on(b, tg, x + 12, y + 12)
            s += glass(b.tb(t, f'font-size: 12px; font-weight: 800; color: {LB}; white-space: nowrap')
                       + big(b, v, 40, '#ffffff')
                       + b.tb(d, f'font-size: 12px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
                       x + 12, y + H - 120, min(300, w - 24), 108, pad='10px 14px', gap=2)
        else:
            bg, c1, c2, c3 = (BLUE, LB, '#ffffff', LT) if kind == 'blue' else (CHIP, BLUE, BLUE, BODY)
            s += card(b.tb(t, f'font-size: 14px; font-weight: 800; color: {c1}; white-space: nowrap')
                      + big(b, v, 56, c2)
                      + b.tb(d, f'font-size: 13px; line-height: 19px; color: {c3}; {clamp(2)}')
                      + '<span style="margin-top: auto"></span>'
                      + evid(b, '출처 · [POS · 카운터 데이터]', color=c3 if kind == 'chip' else '#ffffff', bg='transparent', border='rgba(255,255,255,0.4)' if kind == 'blue' else '#c9d1ee'),
                      x, y, w, H, bg=bg, pad='18px 22px', gap=6, radius=14)
    s += footer(b, foot('RT', '수치는 자리표시 · 1년 예상치'), 12)
    return s


# ---------------------------------------------------------------- 5 시점별 효과 · 3개월 · 1년 · 3년 + 같은 지표 성장 막대
@layout(L, f='L_PH_EF_N', code='PH-EF-N', p='effect', p2='execution', name='시점별 효과 · 단계 사진 + 성장 막대',
        when='효과가 한 번에 나지 않고 3개월 · 1년 · 3년에 걸쳐 커질 때, 단계 사진 아래 같은 지표의 막대가 길어지는 모습과 단계별 조건을 함께 보여줄 때',
        pv=[], sample=CUST['ED'], grp=GE)
def _(b):
    s = header(b, EB_E, '효과는 3개월에 보이기 시작해 3년에 캠퍼스 전체로 커집니다', 'E 대학교 · 같은 지표를 시점별로 · 막대는 3년 목표를 100으로 둔 길이 · 출처: [유사 대학 사례, 연도]', w=1152)
    C = [284, 602, 920]
    W = 296
    st = [('ph.ed-lecture-led', '50% 45%', '3개월 · 시범', '강의실 [00]곳'), ('r4.ed-class-display', '45% 50%', '1년 · 단과대 확산', '강의실 [000]곳'),
          ('r4.ed-main-hall', '50% 45%', '3년 · 캠퍼스 전체', '전 강의동 [00]동')]
    # left label column
    s += flex(64, 152, 204, 180, lab(b, '시점', BLUE, 12.5) + tline(b, '같은 지표가 시간이 갈수록 커집니다', 17, 24, 3)
              + dline(b, '시범 강의실에서 검증한 뒤 단과대 · 캠퍼스로 넓힙니다', 12.5, 18, 2, MUTED), 'display: flex; flex-direction: column; gap: 6px')
    for i, (pid, pos, t, sc) in enumerate(st):
        s += photo(b, pid, C[i], 152, W, 180, pos=pos, hint=f'{t} 단계 장면 (고객 캠퍼스 사진으로 교체)', radius=12)
        s += tag_on(b, t, C[i] + 10, 162)
        s += tag_on(b, sc, C[i] + 10, 296, dark=False, size=11.5)
    kp = [('전자칠판 활용 수업', '전체 수업 중 비율', ['[00]%', '[00]%', '[00]%'], [0.22, 0.58, 1.0]),
          ('강의 준비 시간', '줄어드는 비율', ['−[00]%', '−[00]%', '−[00]%'], [0.3, 0.62, 0.92]),
          ('강의동 냉난방 전력', '줄어드는 비율', ['−[0]%', '−[00]%', '−[00]%'], [0.14, 0.5, 0.86])]
    for r, (nm, u, vs, ls) in enumerate(kp):
        y = 346 + r * 64
        s += hline(64, y + 58, 1152)
        s += flex(64, y, 204, 52, tline(b, nm, 15, 22) + b.tb(u, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap'),
                  'display: flex; flex-direction: column; justify-content: center; gap: 2px')
        for i in range(3):
            fw = round(W * ls[i])
            s += b.tb(vs[i], ab(C[i], y + 2, 120, 24, f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 'div')
            s += rect(C[i], y + 32, W, 12, '#eef0f4', 6)
            s += rect(C[i], y + 32, fw, 12, ['#9fb0e6', '#5b6fcf', BLUE][i], 6)
    # conditions
    s += flex(64, 548, 204, 100, lab(b, '이 효과의 조건', BLUE, 12.5) + dline(b, '조건이 채워져야 다음 시점의 효과가 납니다', 12.5, 18, 2, MUTED),
              'display: flex; flex-direction: column; justify-content: center; gap: 6px')
    cd = [('교수 [00]명 사용 교육 완료', '시범 강의실 설치 · 수업 자료 템플릿'), ('학사 일정에 맞춘 단계 설치', '단과대별 담당 조교 · 자료 공유'),
          ('전 강의동 통합 관리', '교체 주기 · 예산 [0]년 확보')]
    for i, (a, d) in enumerate(cd):
        s += card(row(numtag(b, str(i + 1), 20) + tline(b, a, 14, 20)) + dline(b, d, 12.5, 18, 1)
                  + evid(b, ['확인 · 3개월 차 리포트', '확인 · 1년 차 리포트', '확인 · 3년 차 효과 보고'][i]),
                  C[i], 548, W, 100, bg=SOFT, pad='12px 16px', gap=6)
    s += footer(b, foot('ED', '수치 · 막대 길이는 예시'), 14)
    return s


# ---------------------------------------------------------------- 6 사례로 본 기대 효과 · 사례 사진 → 보수 할인 → 우리 예상치
@layout(L, f='L_PH_EF_O', code='PH-EF-O', p='effect', p2='case', name='사례로 본 기대 효과 · 사례 사진 → 예상치',
        when='비슷한 도입 사례 두세 곳의 실제 실적을 사진과 함께 보여주고, 그 평균에서 보수적으로 깎은 값을 우리 고객의 예상치로 내놓을 때',
        pv=[], sample=CUST['MD'], grp=GE)
def _(b):
    s = header(b, EB_E, '비슷한 세 곳의 실적에서 깎아, W 요양병원 예상치를 잡았습니다', '사례 실적 → 사례 평균 → 보수 할인 [0]% → 예상치 · 출처: [사례 기관 운영 자료, 연도]', w=1152)
    cs = [('ph.md-ward', '50% 40%', '사례 1 · 요양병원 [ ]', '[000]병상 · 도입 [0]년차', '−[00]%', '−[00]%'),
          ('fill.hosp_room', '50% 40%', '사례 2 · 재활병원 [ ]', '[000]병상 · 도입 [0]년차', '−[00]%', '−[00]%'),
          ('ph.md-senior-lounge', '50% 50%', '사례 3 · 시니어 케어 [ ]', '[00]세대 · 도입 [0]년차', '−[00]%', '−[00]%')]
    for i, (pid, pos, nm, sub, a, c) in enumerate(cs):
        y = 152 + i * 172
        s += photo(b, pid, 64, y, 220, 152, pos=pos, hint=f'{nm} 도입 사례 사진 (실제 사례 사진으로 교체 · 기관명은 동의 후 기재)', radius=12)
        s += card(row(lab(b, nm, INK, 14) + '<span style="margin-left: auto"></span>' + evid(b, '실적 · [기관 자료, 연도]').replace('align-self: flex-start', 'align-self: center'), 6)
                  + b.tb(sub, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap')
                  + '<span style="margin-top: auto; display: flex; gap: 28px">'
                  + '<span style="display: flex; flex-direction: column; gap: 0">' + lab(b, '냉난방 전력', MUTED, 11.5) + bignum(b, a, '', size=26, color=BODY) + '</span>'
                  + '<span style="display: flex; flex-direction: column; gap: 0">' + lab(b, '덥다 · 춥다 민원', MUTED, 11.5) + bignum(b, c, '', size=26, color=BODY) + '</span>'
                  + '</span>',
                  296, y, 330, 152, bg=SOFT, pad='14px 16px', gap=3)
        s += hline(626, y + 76, 26, '#b8c2e6', 2)
    # middle — bracket + discount
    s += vline(651, 228, 346, '#b8c2e6', 2)
    s += card(lab(b, '사례 평균', MUTED, 11.5) + bignum(b, '−[00]%', '', size=22, color=INK)
              + '<span style="height: 1px; background: #c9d1ee; margin: 4px 0"></span>'
              + lab(b, '보수 할인 [0]%', BLUE, 11.5) + bignum(b, '× [0.0]', '', size=20, color=BLUE)
              + b.tb('병상 수 · 연식 차이', f'font-size: 10.5px; color: {MUTED}; white-space: nowrap'),
              664, 318, 112, 166, bg=CHIP, pad='12px 12px', gap=1, extra='justify-content: center')
    s += ARR(774, 390, 24, 22, size=20)
    # right — our customer
    X = 800
    s += box(X, 152, 416, 496, BLUE, 14)
    s += photo(b, 'ph.md-lounge', X, 152, 416, 196, pos='50% 55%', hint='W 요양병원 공간 사진 (고객 병원 사진으로 교체)', radius=14)
    s += tag_on(b, 'W 요양병원 · 예상치', X + 12, 164, dark=False)
    ex = [('냉난방 전력', '−[00]%', '[000]MWh/년'), ('덥다 · 춥다 민원', '−[00]%', '월 [00]건 → [00]건'), ('야간 순회 점검', '−[00]%', '병동당 [0]회 → [0]회')]
    for k, (t, v, d) in enumerate(ex):
        y = 364 + k * 74
        if k: s += hline(X + 22, y - 8, 372, 'rgba(255,255,255,0.22)')
        s += flex(X + 22, y, 372, 60, '<span style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0">'
                  + lab(b, t, LB, 12.5) + b.tb(d, f'font-size: 12px; color: {LT}; white-space: nowrap') + '</span>'
                  + bignum(b, v, '', size=36, color='#ffffff'), 'display: flex; align-items: center; gap: 12px')
    s += flex(X + 22, 596, 372, 40, dline(b, '사례 평균보다 낮게 잡은 값 — 데이터가 쌓이면 다시 맞춥니다', 12, 18, 2, LT), 'display: flex; align-items: center')
    s += footer(b, foot('MD', '사례 기관명은 동의 후 기재 · 수치는 자리표시'), 13)
    return s


# ---------------------------------------------------------------- 7 효과 범위 · 보수 · 기준 · 낙관 (원본 L_EF_H)
@layout(L, f='L_PH_EF_P', code='PH-EF-P', p='effect', p2=None, name='효과 범위 · KPI 장면 사진 + 범위 막대',
        when='수치가 불확실해 보수 · 기준 · 낙관 범위로 말할 때, KPI 행마다 그 효과가 생기는 장면 사진을 붙이고 가정 · 받을 데이터를 함께 보여줄 때',
        pv=['L_EF_H'], sample=CUST['VN'], grp=GE)
def _(b):
    s = header(b, EB_E, '확실하지 않은 수치는 범위로 말씀드립니다', '보수 · 기준 · 낙관 세 경우 · 기준값의 근거와 가정을 함께 · 출처: [업종 평균 · 유사 시설, 연도]', w=1152)
    # table head
    s += b.tb('장면', ab(64, 152, 120, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    s += b.tb('KPI · 근거', ab(336, 152, 140, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    s += b.tb('효과 범위 · 왼쪽 보수 → 오른쪽 낙관', ab(488, 152, 312, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    s += hline(64, 176, 736, INK, 2)
    Z0, ZW = 492, 300
    rows_ = [('r4.vn-arena-ext', '50% 60%', '입장 대기 시간', '−%', '줄어드는 비율', '업종 평균', True, '기준 [00]%', 0.30, 0.68, 0.50),
             ('ph.vn-control-staff', '55% 50%', '콘텐츠 교체 비용', '−%', '줄어드는 비율', '유사 시설 2곳', True, '기준 [00]%', 0.40, 0.74, 0.56),
             ('ph.vn-cinema-kiosk', '45% 50%', '매점 객단가', '+%', '늘어나는 비율', '가정', False, '기준 [00]%', 0.14, 0.86, 0.44),
             ('r4.vn-ballpark-board', '50% 40%', '전광판 광고 매출', '+%', '늘어나는 비율', '가정', False, '기준 [00]%', 0.10, 0.82, 0.36)]
    for i, (pid, pos, nm, sg, u, ev, solid, bl, lo, hi, base) in enumerate(rows_):
        y = 184 + i * 111
        s += photo(b, pid, 64, y, 260, 103, pos=pos, hint=f'{nm} 장면 사진 (고객 경기장 사진으로 교체)', radius=10)
        s += flex(336, y, 148, 103, tline(b, nm, 15, 22)
                  + row(b.tb(sg, f'{NUM}; font-size: 13px; font-weight: 800; color: {BLUE}') + b.tb(u, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap'), 5)
                  + (evid(b, ev, BLUE, CHIP, CHIP) if solid else evid(b, ev, MUTED, '#ffffff', '#b8bec8')),
                  'display: flex; flex-direction: column; justify-content: center; gap: 4px')
        cy = y + 56
        s += rect(Z0, cy - 1, ZW, 2, '#cfd4dc')
        s += rect(Z0, cy - 6, 1, 12, '#9aa1ad') + rect(Z0 + ZW - 1, cy - 6, 1, 12, '#9aa1ad')
        xl, xh, xb = Z0 + round(ZW * lo), Z0 + round(ZW * hi), Z0 + round(ZW * base)
        s += rect(xl, cy - 6, xh - xl, 12, '#b9c3ee', 6)
        s += f'<div style="{ab(xb - 9, cy - 9, 18, 18, f"box-sizing: border-box; border-radius: 50%; background: #ffffff; border: 4px solid {BLUE}")}"></div>'
        s += b.tb(bl, ab(xb - 48, cy - 40, 96, 24, f'box-sizing: border-box; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
        s += b.tb('보수 [00]', ab(xl - 40, cy + 12, 80, 18, f'font-size: 11.5px; font-weight: 700; color: {BODY}; text-align: center; white-space: nowrap'), 'div')
        s += b.tb('낙관 [00]', ab(xh - 40, cy + 12, 80, 18, f'font-size: 11.5px; font-weight: 700; color: {BODY}; text-align: center; white-space: nowrap'), 'div')
        if i < 3: s += hline(64, y + 107, 736)
    s += flex(64, 630, 736, 18, '<span style="width: 26px; height: 10px; border-radius: 5px; background: #b9c3ee; flex-shrink: 0"></span>'
              + b.tb('보수–낙관 범위', f'font-size: 11px; color: {MUTED}; white-space: nowrap')
              + f'<span style="width: 12px; height: 12px; box-sizing: border-box; border-radius: 50%; border: 3px solid {BLUE}; flex-shrink: 0; margin-left: 8px"></span>'
              + b.tb('기준값', f'font-size: 11px; color: {MUTED}; white-space: nowrap')
              + b.tb('가정 = 데이터 없이 세운 값 · KPI마다 눈금이 다릅니다 · 막대 길이는 예시', f'font-size: 11px; color: {MUTED}; white-space: nowrap; margin-left: 12px'),
              'display: flex; align-items: center; gap: 6px')
    # right — assumptions on a venue photo + data to narrow the range
    X, W = 824, 392
    s += photo(b, 'ph.vn-stadium-wide', X, 152, W, 186, pos='50% 45%', hint='V 경기장 전경 (고객 경기장 사진으로 교체)', radius=12)
    s += tag_on(b, 'V 경기장 · 가정 기준', X + 12, 164)
    s += box(X + 196, 350, 98, 124, CHIP, 8)
    cols = [('가정', X + 4, 96, 'left'), ('보수', X + 100, 96, 'center'), ('기준', X + 196, 98, 'center'), ('낙관', X + 294, 96, 'center')]
    for t, cx, cw, al in cols:
        s += b.tb(t, ab(cx, 356, cw, 18, f'font-size: 12px; font-weight: 800; color: {BLUE if t == "기준" else MUTED}; text-align: {al}; white-space: nowrap'), 'div')
    s += hline(X, 380, W, INK, 2)
    av = [('경기당 관중', '[00,000]'), ('매점 이용률', '[00]%'), ('홈경기 수', '[00]경기')]
    for k, (t, v) in enumerate(av):
        y = 384 + k * 30
        s += b.tb(t, ab(X + 4, y, 96, 30, 'font-size: 12.5px; font-weight: 800; display: flex; align-items: center; white-space: nowrap'), 'div')
        for j, cx in enumerate([X + 100, X + 196, X + 294]):
            s += b.tb(v, ab(cx, y, 96, 30, f'{NUM}; font-size: 13px; font-weight: {800 if j == 1 else 600}; color: {BLUE if j == 1 else BODY}; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
        s += hline(X, y + 30, W)
    dd = [('지난 시즌 입장 기록', '입장 대기 시간'), ('매점 POS 일별 매출', '매점 객단가'), ('광고 집행 실적', '전광판 광고 매출')]
    inner = row(tline(b, '받으면 범위가 좁혀지는 데이터', 14, 20) + numtag(b, '3', 20), 8)
    for t, k in dd:
        inner += row(f'<span style="width: 6px; height: 6px; border-radius: 50%; background: {BLUE}; flex-shrink: 0"></span>'
                     + b.tb(t, 'font-size: 13px; font-weight: 800; white-space: nowrap')
                     + b.tb('→ ' + k, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 8)
    s += card(inner, X, 488, W, 160, bg=CHIP, pad='16px 18px', gap=13)
    s += footer(b, foot('VN', '동종 사례가 없어 범위로 제시 · 데이터를 받으면 범위를 좁힙니다'), 14)
    return s


# ---------------------------------------------------------------- 8 효과를 무엇으로 재나 · 지표 4 × 측정 화면
@layout(L, f='L_PH_EF_Q', code='PH-EF-Q', p='effect', p2='solution', name='효과 측정 방법 · 지표 4 × 측정 화면',
        when='약속한 효과를 도입 뒤 무엇으로 · 얼마나 자주 · 누가 재는지 정할 때, 지표마다 실제 측정 화면과 계산 · 주기 · 담당 · 기준값을 함께 보여줄 때',
        pv=[], sample=CUST['FN'], grp=GE)
def _(b):
    s = header(b, EB_E, '약속한 효과는 이 네 화면으로 재고, 같은 기준으로 보고합니다', 'T 은행 영업점 · 지표마다 측정 화면 · 계산 · 주기 · 담당 · 기준값 · 화면은 samsung.com 공개 솔루션 화면', w=1152)
    M = [('fill.bank_esign', '50% 40%', '창구 상담 시간', '전자서식 처리 기록',
          [('계산', '서식 시작 → 서명 완료 평균'), ('주기 · 담당', '주간 · 영업점 운영팀'), ('기준값', '도입 전 4주 실측 [00]분'), ('목표', '−[00]%')]),
         ('fill.km_console', '40% 35%', '상담 태블릿 가동률', 'Knox Manage 콘솔',
          [('계산', '영업 시간 중 사용 단말 ÷ 전체'), ('주기 · 담당', '일간 · 본사 IT'), ('기준값', '시범 영업점 [00]%'), ('목표', '[00]% 이상')]),
         ('fill.stp_kv', '35% 50%', '영업점 전력 사용', 'SmartThings Pro 에너지',
          [('계산', '월 kWh · 고지서와 대조'), ('주기 · 담당', '월간 · 시설팀'), ('기준값', '직전 12개월 평균'), ('목표', '−[00]%')]),
         ('fill.vxt_cms', '50% 40%', '상품 안내 화면 반영', 'VXT CMS 배포 기록',
          [('계산', '본사 등록 → 전 영업점 재생 확인'), ('주기 · 담당', '캠페인마다 · 마케팅부'), ('기준값', '지금 [0]일'), ('목표', '[00]분 안')])]
    for k, (pid, pos, nm, src, df) in enumerate(M):
        x, y = 64 + (k % 2) * 584, 152 + (k // 2) * 210
        s += box(x, y, 568, 196, SOFT, 14)
        s += photo(b, pid, x, y, 270, 196, pos=pos, hint=f'{nm} 측정 화면 (고객 환경 화면 캡처로 교체)', radius=14)
        s += tag_on(b, f'지표 {k + 1}', x + 12, y + 12)
        inner = tline(b, nm, 17, 24) + row(b.tb('측정 화면', f'font-size: 11.5px; font-weight: 800; color: {BLUE}; white-space: nowrap') + b.tb(src, f'font-size: 12px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 6)
        inner += '<span style="height: 1px; background: #dde1e8; margin: 4px 0 2px; flex-shrink: 0"></span>'
        for t, v in df:
            inner += row(b.tb(t, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; width: 66px; flex-shrink: 0; white-space: nowrap')
                         + b.tb(v, f'font-size: 12.5px; font-weight: {800 if t in ("기준값", "목표") else 600}; color: {BLUE if t == "목표" else INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 4)
        s += card(inner, x + 270, y, 298, 196, bg='transparent', pad='16px 16px 14px 18px', gap=6)
    st = [('도입 전 4주', '기준값 실측'), ('3개월', '1차 리포트'), ('6개월', '중간 점검 · 목표 조정'), ('12개월', '효과 확정 보고')]
    inner = b.tb('언제 재나', f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap; flex-shrink: 0')
    inner += '<span style="width: 1px; height: 24px; background: #d3d7de; flex-shrink: 0"></span>'
    for k, (t, d) in enumerate(st):
        if k: inner += b.tb('→', f'font-size: 15px; font-weight: 800; color: {BLUE}; flex-shrink: 0')
        inner += row(b.tb(t, f'height: 26px; padding: 0 11px; border-radius: 999px; background: {BLUE if k == 3 else CHIP}; color: {"#ffffff" if k == 3 else BLUE}; font-size: 12.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
                     + b.tb(d, f'font-size: 12.5px; color: {BODY}; white-space: nowrap'), 6, 'flex-shrink: 0')
    inner += b.tb('같은 화면 · 같은 계산으로 매번 비교', f'margin-left: auto; font-size: 12px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
    s += flex(64, 580, 1152, 68, inner, f'box-sizing: border-box; border-radius: 12px; border: 1.5px solid #d6dbe6; background: #ffffff; padding: 0 20px; display: flex; align-items: center; gap: 12px')
    s += footer(b, foot('FN', '기준값 · 주기는 고객과 확정 · 화면은 예시'), 15)
    return s


# ---------------------------------------------------------------- 9 한 사람의 하루 · 현장 작업자 시간대 5칸
@layout(L, f='L_PH_US_G', code='PH-US-G', p='user', p2=None, name='한 사람의 하루 · 인물 사진 + 시간대 5칸',
        when='현장 작업자 한 사람(페르소나)의 하루를 시간대 다섯 칸으로 따라가며, 칸마다 하는 일 · 쓰는 기기 · 불편 한 줄을 사진과 함께 보여줄 때',
        pv=[], sample=CUST['MF'], grp=GU)
def _(b):
    s = header(b, EB_U, 'L 제조 현장 작업자의 하루, 기기 네 가지를 오갑니다', '현장 관찰 · 인터뷰 기반 페르소나 · 시간대마다 하는 일 · 지금 쓰는 기기 · 불편 · 바꿀 기기 · 출처: [현장 관찰, 연도]', w=1152)
    # persona
    s += photo(b, 'r4.mf-helmet', 64, 152, 320, 330, pos='50% 30%', hint='페르소나 인물 사진 (고객 현장 작업자 · 동의 후 촬영으로 교체)', radius=14)
    s += label_on(b, '페르소나 · 생산 라인 작업자', '[이름] · [0]년차 · 주간 교대', 76, 410, 296, lines=1)
    s += card(lab(b, '하루를 합치면', BLUE, 12.5)
              + '<span style="display: flex; gap: 8px">' + kpi(b, '라인 ↔ 사무실 이동', '[00]회', w=140) + kpi(b, '다시 입력하는 기록', '[00]건', w=140) + '</span>'
              + dline(b, '“[현장 작업자 인터뷰 원문 — 익명]”', 13, 19, 2, INK),
              64, 494, 320, 154, bg=SOFT, pad='14px 16px', gap=8)
    # timeline
    vx = 478
    s += vline(vx, 170, 460, '#c9d1ee', 2)
    T = [('06:50', 'ph.mf-worker-watch', '40% 40%', '출근 · 안전 확인', ['종이 체크리스트'], '안전 점검표를 손으로 쓰고 사무실에 따로 냅니다', '갤럭시 워치'),
         ('08:00', 'fill.factory_tab', '30% 40%', '작업 지시 확인', ['공용 PC', '출력물'], '지시서를 받으려면 라인을 떠나 사무실 PC까지 갑니다', '탭 액티브'),
         ('10:30', 'fill.dex_mfg', '30% 40%', '라인 점검 · 기록', ['개인 휴대폰'], '사진 · 수치를 개인 폰에 찍어 두고 나중에 다시 입력합니다', 'XCover 바로 입력'),
         ('13:30', 'fill.scan_phone', '50% 50%', '자재 입출고', ['핸디 스캐너', '무전기'], '스캐너 · 무전기 · 휴대폰 세 개를 번갈아 듭니다', 'XCover 한 대로'),
         ('17:00', 'fill.sign_tab', '50% 50%', '교대 인수인계', ['종이 일지'], '인수인계가 종이에만 남아 다음 조가 찾기 어렵습니다', '전자 일지')]
    for i, (tm, pid, pos, job, dev, pain, nx) in enumerate(T):
        y = 152 + i * 101
        s += b.tb(tm, ab(408, y + 34, 56, 24, f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 'div')
        s += f'<div style="{ab(vx - 6, y + 39, 14, 14, f"box-sizing: border-box; border-radius: 50%; background: #ffffff; border: 3px solid {BLUE}")}"></div>'
        s += photo(b, pid, 500, y, 168, 92, pos=pos, hint=f'{job} 장면 (고객 현장 사진으로 교체)', radius=10)
        s += card(row(tline(b, job, 15, 22) + ''.join(dchip(b, d, MUTED, '#e6e9ee') for d in dev)
                      + '<span style="margin-left: auto"></span>' + dchip(b, '→ ' + nx, '#ffffff', BLUE), 8)
                  + row(lab(b, '불편', WARN, 12) + dline(b, pain, 13, 19, 1, BODY), 8),
                  680, y, 536, 92, bg=SOFT, pad='14px 18px', gap=8, extra='justify-content: center')
    s += footer(b, foot('MF', '페르소나는 관찰 · 인터뷰 종합 · 사진은 바꿀 기기를 쓰는 장면 참고'), 7)
    return s


# ---------------------------------------------------------------- 10 사람마다 쓰는 기기 · 인물 사진 + 제품 컷
@layout(L, f='L_PH_US_H', code='PH-US-H', p='user', p2='products', name='사람마다 쓰는 기기 · 인물 사진 + 제품 컷',
        when='사용자 집단마다 실제로 손에 쥐는 삼성 기기가 다를 때, 인물 사진 아래 그 사람이 쓰는 제품 컷 두 개와 용도를 붙여 구성 · 교육 대상을 나눌 때',
        pv=[], sample=CUST['ED'], grp=GU)
def _(b):
    s = header(b, EB_U, 'E 대학교에서 네 사람이 쓰는 삼성 기기가 다릅니다', '사용자별 기기 · 용도 — 제품 구성과 교육 대상을 나누는 기준 · 출처: [캠퍼스 현장 조사, 연도]', w=1152)
    P = [('r4.ed-teacher-board', '55% 35%', '교수', '강의 · 연구 · [000]명',
          [('cut.wa75d', '전자칠판 75형', '판서 · 자료 띄우기 · 녹화'), ('cut.ifr', 'LED 사이니지', '대형 강의실 뒤까지 보이는 화면')], '켜자마자 바로 수업'),
         ('r4.ed-class-display', '40% 45%', '학생', '학부 · 대학원 · [0,000]명',
          [('cut.tabs11', '갤럭시 탭 S', '필기 · 온라인 시험 · 전자책'), ('cut.km24c', '키오스크', '학생식당 주문 · 열람실 좌석')], '어디서나 같은 자료'),
         ('ph.ed-print-user', '40% 35%', '행정 직원', '학과 · 본부 · [000]명',
          [('cut.qm55c', '스마트 사이니지', '학과 공지 · 행사 안내'), ('cut.vm55b', '비디오월', '본관 로비 · 학교 홍보 영상')], '공지를 한 번에 전 건물로'),
         ('ph.ed-charging', '60% 40%', 'IT · 시설 관리자', '정보처 · 시설팀 · [00]명',
          [('cut.xcover7', '갤럭시 XCover', '장애 알림 · 현장 점검 기록'), ('fill.dms25', '통합관리 DMS', '강의동 냉난방 원격 관리')], '고장을 먼저 알기')]
    for i, (pid, pos, who, sub, prods, want) in enumerate(P):
        x = 64 + i * 292
        s += photo(b, pid, x, 152, 276, 196, pos=pos, hint=f'{who} 사진 (고객 캠퍼스 · 역할 참고 이미지로 교체)', radius=12)
        s += label_on(b, sub, who, x + 10, 278, 256, lines=1)
        s += box(x, 356, 276, 216, SOFT, 12)
        for j, (cp, nm, use) in enumerate(prods):
            cx = x + 10 + j * 132
            s += cut(b, cp, cx, 366, 124, 104, hint=f'{nm} 제품 컷', pad=10, bg='#ffffff', radius=10)
            s += flex(cx, 478, 124, 86, tline(b, nm, 13, 19) + dline(b, use, 12, 17, 3, BODY), 'display: flex; flex-direction: column; gap: 2px')
        s += card(row(lab(b, '바라는 것', BLUE, 12) + tline(b, want, 14, 20), 8)
                  + b.tb('하루 사용 [0]시간 · 교육 [0]회', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap'),
                  x, 582, 276, 66, bg='#ffffff', pad='10px 14px', gap=3, border='#d6dbe6')
    s += footer(b, foot('ED', '인원 · 시간은 자리표시 · 인물 사진은 역할 참고 이미지 · 제품 컷은 공식 이미지'), 8)
    return s
