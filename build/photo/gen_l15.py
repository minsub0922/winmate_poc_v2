# 4차 — 공통 레이아웃 중 글 · 도표만으로 빽빽하던 장표의 사진 버전 10장
# 도표(워터폴 · 매트릭스 · 막대 · 동심원)는 그대로 두고 크기를 줄여, 남는 자리에 현장 사진을 넣고 글은 줄였습니다.
# 원본의 문구 · 자리표시([00] 등)를 그대로 옮김.
from gen_ind import *
L = []
FOOT_FB = 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안'
def ARR(x, y):
    return f'<div style="{ab(x, y, 44, 20, f"display: flex; align-items: center; justify-content: center; color: {BLUE}; font-size: 18px; font-weight: 800")}">→</div>'



def thumb(b, pid, x, y, w, h, hint='', radius=8):
    """small product cut (contain, light card)"""
    return b.img(pid, ab(x, y, w, h), fit='contain', kind='cut', hint=hint, radius=radius, pad=4, bg=SOFT)


def label_on(b, top, main, x, y, w):
    return glass(b.tb(top, f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                 + b.tb(main, f'font-size: 14px; font-weight: 800; line-height: 1.4; color: #ffffff; {clamp(2)}'), x, y, w, None, pad='9px 13px', gap=2)


# ---------------------------------------------------------------- 1 cost waterfall + after photo
@layout(L, f='L_PH_EF_G', code='PH-EF-G', p='effect', name='비용 절감 워터폴 · 도입 후 사진', when='지금 운영비가 항목별로 얼마나 줄고 무엇이 새로 생기는지를 워터폴로, 도입 후 매장 사진과 함께',
        pv=['L_EF_G'], sample='A 커피', grp='효과 · 근거')
def _(b):
    s = header(b, '02 · VALUE PROPS', '매장당 연 운영비, 네 군데에서 줄어듭니다', '지금의 연 운영비 → 항목별 절감 → 새로 생기는 비용 → 도입 후', w=1152)
    s += photo(b, 'ph.fb-cafe-air', 64, 152, 268, 496, pos='50% 50%', hint='도입 후 매장 사진 (고객 매장으로 교체)', radius=16)
    s += label_on(b, '도입 후', '메뉴는 본사 화면에서, 매장은 켜 두기만', 76, 568, 244)
    # chart
    X0, BASE, TOP = 356, 500, 200  # left, baseline y, top of 'now' bar
    bars = [('지금', '연 운영비', '[0,000]만 원', 0, 300, 'now'), ('인쇄 · 배송', '메뉴판 · 포스터', '−[000]', 300, 220, 'cut'),
            ('교체 인건비', '매장 교체 작업', '−[000]', 220, 160, 'cut'), ('전기료', '밝기 스케줄', '−[00]', 160, 128, 'cut'),
            ('폐기 · 재작업', '오탈자 · 재인쇄', '−[00]', 128, 104, 'cut'), ('라이선스 · 통신', '새로 생기는 비용', '+[00]', 104, 122, 'add'),
            ('도입 후', '연 운영비', '[0,000]만 원', 0, 122, 'after')]
    cw = 86
    s += b.tb('매장당 연 운영비 (만 원)', ab(X0, 152, 300, 18, f'font-size: 12.5px; font-weight: 700; color: {MUTED}'), 'div')
    s += f'<div style="{ab(X0, BASE, 7 * cw, 1, f"background: {LINE}")}"></div>'
    for i, (nm, sub, val, a, z, k) in enumerate(bars):
        x = X0 + i * cw + 14; w = cw - 28
        lo, hi = min(a, z), max(a, z)
        y = BASE - hi; h = max(2, hi - lo)
        col = {'now': INK, 'cut': '#b9c4ee', 'add': '#f2b8a2', 'after': BLUE}[k]
        s += f'<div style="{ab(x, y, w, h, f"border-radius: 4px 4px 0 0; background: {col}")}"></div>'
        if 0 < i < 6:  # dashed link from the previous bar's end
            s += f'<div style="{ab(x - 28, BASE - a, 28, 0, f"border-top: 1px dashed {FAINT}")}"></div>'
        s += b.tb(val, ab(x - 14, y - 22, cw, 18, f'{NUM}; text-align: center; font-size: {13 if k in ("now", "after") else 12.5}px; font-weight: 800; color: {BLUE if k == "after" else WARN if k == "add" else INK}; white-space: nowrap'), 'div')
        s += (f'<div style="{ab(x - 14, BASE + 10, cw, 40, "display: flex; flex-direction: column; align-items: center; gap: 1px; text-align: center")}">'
              + b.tb(nm, f'font-size: 12px; font-weight: {800 if k in ("now", "after") else 700}; white-space: nowrap')
              + b.tb(sub, f'font-size: 10.5px; color: {MUTED}; white-space: nowrap') + '</div>')
    s += b.tb('점선 = 직전 막대가 끝난 높이 · 수치는 매장 운영 데이터로 확정', ab(X0, 600, 560, 16, f'font-size: 11px; color: {FAINT}'), 'div')
    s += (f'<div style="{ab(976, 152, 240, 496, f"box-sizing: border-box; border-radius: 16px; background: {BLUE}; padding: 20px; display: flex; flex-direction: column; gap: 4px; color: #ffffff")}">'
          + b.tb('순절감', f'font-size: 12.5px; font-weight: 800; color: {LB}') + b.tb('매장당 연', 'font-size: 16px; font-weight: 700')
          + '<span style="display: flex; align-items: baseline; gap: 4px">' + b.tb('−[00]', f'{NUM}; font-size: 52px; font-weight: 800; line-height: 1.1') + b.tb('%', 'font-size: 22px; font-weight: 800') + '</span>'
          + '<span style="display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px">' + b.tb('지금 → 도입 후', f'color: {LT}; white-space: nowrap') + b.tb('[0,000] → [0,000]', f'{NUM}; font-weight: 800; white-space: nowrap') + '</span>'
          + '<span style="height: 1px; background: rgba(255,255,255,0.25); margin: 18px 0 14px"></span>'
          + b.tb('320개 매장 환산', 'font-size: 16px; font-weight: 700')
          + '<span style="display: flex; align-items: baseline; gap: 4px">' + b.tb('연', 'font-size: 18px; font-weight: 800') + b.tb('−[00]', f'{NUM}; font-size: 44px; font-weight: 800; line-height: 1.1') + b.tb('억 원', 'font-size: 18px; font-weight: 800') + '</span>'
          + b.tb('매장당 순절감 × 320개 매장', f'font-size: 12.5px; color: {LT}')
          + b.tb('라이선스 · 통신비는 포함한 순절감', f'margin-top: auto; font-size: 12px; color: {LB}') + '</div>')
    s += footer(b, FOOT_FB + ' · 매장당 연간 · 단가 · 빈도 가정 부록 p.[00] · 막대 길이는 예시 · 사진: samsung.com 외식 · 카페 비즈니스 페이지', 13)
    return s


# ---------------------------------------------------------------- 2 TAM SAM SOM with a photo core
@layout(L, f='L_PH_MS_T', code='PH-MS-T', p='market', name='TAM · SAM · SOM · 사진 원', when='노릴 수 있는 시장을 전체 → 유효 → 획득 가능 시장으로 좁혀 보여줄 때, 가운데 원을 고객사 매장 사진으로',
        pv=['L_MS_C'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · MARKET INTELLIGENCE', 'A 커피가 노릴 수 있는 시장은 [0,000]억 원입니다', '시장 규모 계층 · 단위: 억 원 · 출처: [조사 기관, 연도]', w=1152)
    cx, cy = 330, 404
    for r, col in [(250, '#eef1fb'), (180, '#dfe5f8')]:
        s += f'<div style="{ab(cx - r, cy - r, 2 * r, 2 * r, f"border-radius: 50%; background: {col}")}"></div>'
    s += photo(b, 'ph.fb-cafe-counter', cx - 110, cy - 64, 220, 220, pos='45% 50%', hint='고객사 매장 사진 (SOM)', radius=110)
    s += f'<div style="{ab(cx - 110, cy - 64, 220, 220, f"box-sizing: border-box; border-radius: 50%; border: 4px solid {BLUE}")}"></div>'
    for nm, val, y in [('TAM', '[0,000]억', cy - 238), ('SAM', '[0,000]억', cy - 168)]:
        s += (f'<div style="{ab(cx - 90, y, 180, 50, "display: flex; flex-direction: column; align-items: center; gap: 0")}">'
              + b.tb(nm, f'font-size: 13px; font-weight: 800; color: {BLUE}') + b.tb(val, f'{NUM}; font-size: 22px; font-weight: 800') + '</div>')
    s += glass(b.tb('SOM', f'font-size: 11px; font-weight: 800; color: {LB}; text-align: center') + b.tb('[0,000]억', f'{NUM}; font-size: 20px; font-weight: 800; color: #ffffff; text-align: center'),
               cx - 62, cy + 92, 124, None, pad='6px 10px', gap=0)
    s += b.tb('원 크기는 개념 표현 · 실제 비율과 다름', ab(64, 636, 300, 16, f'font-size: 11px; color: {FAINT}'), 'div')
    rows = [('TAM', '전체 시장 · 국내 상업용 디스플레이', '국내 상업용 디스플레이 연간 출하 [00,000]대 × 평균 단가', 'fill.cafe_menuwall', '50% 50%'),
            ('SAM', '유효 시장 · F&B 매장 디지털 메뉴보드', '국내 F&B 매장 수 [00,000] × 매장당 도입비', 'ph.fb-cafe-signage', '50% 40%'),
            ('SOM', '획득 가능 시장 · A 커피 320개 매장', '320개 매장 × 매장당 도입비 · 3년 교체 주기', 'ph.fb-counter-menu', '50% 35%')]
    for i, (k, t, d, pid, pos) in enumerate(rows):
        y = 160 + i * 128
        s += photo(b, pid, 640, y, 150, 112, pos=pos, hint=f'{k} · {t} 사진', radius=10)
        s += (f'<div style="{ab(808, y + 4, 408, 104, "display: flex; flex-direction: column; gap: 3px")}">'
              + '<span style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">' + b.tb(k, f'font-size: 13px; font-weight: 800; color: {BLUE}')
              + b.tb('[0,000]억', f'{NUM}; font-size: 26px; font-weight: 800; white-space: nowrap') + '</span>'
              + b.tb(t, f'font-size: 15.5px; font-weight: 800; line-height: 1.35; {clamp(1)}') + b.tb(d, f'font-size: 12.5px; line-height: 1.45; color: {MUTED}; {clamp(2)}') + '</div>')
    s += (f'<div style="{ab(640, 552, 576, 96, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 14px 18px; display: flex; flex-direction: column; justify-content: center; gap: 4px")}">'
          + b.tb('SOM = 320개 매장 × 매장당 [0,000]만 원', f'font-size: 16px; font-weight: 800; color: {BLUE}')
          + b.tb('3년 교체 주기 기준 · 메뉴보드 · 키오스크 · 외부 사이니지 포함', f'font-size: 12.5px; color: {BODY}') + '</div>')
    s += footer(b, FOOT_FB + ' · 사진: samsung.com 외식 · 카페 도입사례 · 비즈니스 페이지', 4)
    return s


# ---------------------------------------------------------------- 3 problem → direct cause → root cause, problem photo
@layout(L, f='L_PH_CH_C', code='PH-CH-C', p='challenge', name='문제 → 근본 원인 · 현장 사진', when='눈에 보이는 문제를 현장 사진으로 보여주고, 직접 원인과 근본 원인까지 두 단계로 파고들 때',
        pv=['L_CH_C'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '02 · VALUE PROPS', '표기 오류는 결과일 뿐, 원인은 운영 구조에 있습니다', '눈에 보이는 문제에서 두 단계 아래 원인까지 · 현장 점검 · 인터뷰 기준', w=1152)
    s += photo(b, 'ph.fb-counter-gray', 64, 152, 320, 496, pos='50% 40%', hint='문제가 보이는 현장 사진 (고객 매장으로 교체)', radius=16)
    s += glass(b.tb('눈에 보이는 현상', f'font-size: 11px; font-weight: 800; color: {LB}')
               + b.tb('매장별 가격 · 메뉴 표기 불일치', 'font-size: 18px; font-weight: 800; line-height: 1.35; color: #ffffff')
               + '<span style="display: flex; align-items: baseline; gap: 4px; margin-top: 4px">' + b.tb('월', 'font-size: 14px; font-weight: 700; color: #ffffff')
               + b.tb('[00]', f'{NUM}; font-size: 34px; font-weight: 800; color: #ffffff; line-height: 1') + b.tb('건', 'font-size: 14px; font-weight: 700; color: #ffffff') + '</span>',
               76, 512, 296, 124, pad='12px 16px', gap=3)
    for t, x in [('직접 원인', 412), ('근본 원인', 812)]:
        s += b.tb(t, ab(x, 152, 200, 18, f'font-size: 13px; font-weight: 800; color: {BLUE if t == "근본 원인" else MUTED}'), 'div')
    direct = [('인쇄물 교체 지연', '인쇄 · 배송에 [0]주, 매장마다 교체하는 날이 다름'), ('매장별 수기 수정', '급한 변경은 현장에서 스티커 · 손글씨로 고침'),
              ('본사 · 매장 정보 불일치', '어느 매장이 틀렸는지 본사가 알기 어려움')]
    root = [('메뉴 정보가 매장까지 자동으로 가지 않음', '본사 변경이 사람과 인쇄물을 거쳐야만 전달됨', True), ('가격 정책 잦은 변경', '지역 · 채널별 가격 조정이 자주 일어남 · 운영 정책 과제', False),
            ('매장 화면을 본사가 볼 수 없음', '확인하려면 담당자가 매장을 직접 방문해야 함', True)]
    for i in range(3):
        y = 180 + i * 156
        t, d = direct[i]
        s += (f'<div style="{ab(412, y, 340, 140, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px")}">'
              + '<span style="display: flex; align-items: center; gap: 8px">' + numtag(b, str(i + 1), 22, bg=FAINT) + b.tb(t, 'font-size: 16px; font-weight: 800') + '</span>'
              + b.tb(d, f'font-size: 13px; line-height: 1.5; color: {BODY}; {clamp(2)}')
              + b.tb('왜?', f'margin-top: auto; align-self: flex-end; font-size: 12px; font-weight: 800; color: {MUTED}') + '</div>')
        s += ARR(760, y + 60)
        t, d, ours = root[i]
        s += (f'<div style="{ab(812, y, 404, 140, f"box-sizing: border-box; border-radius: 12px; background: {CHIP if ours else "#ffffff"}; border: 1px solid {BLUE if ours else LINE}; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb(t, f'font-size: 16px; font-weight: 800; line-height: 23px; {clamp(2)}') + b.tb(d, f'font-size: 13px; line-height: 19px; color: {BODY}; {clamp(2)}')
              + (pill(b, '이번 제안이 직접 풉니다', extra='margin-top: auto') if ours else pill(b, '운영 정책 과제', bg=SOFT, color=MUTED, extra='margin-top: auto')) + '</div>')
    s += footer(b, FOOT_FB + ' · 사진: samsung.com 카페 도입사례를 흑백 처리', 10)
    return s


# ---------------------------------------------------------------- 4 impact × urgency matrix + the two to act on now, in photos
@layout(L, f='L_PH_MX_A', code='PH-MX-A', p='market', p2='challenge', name='우선순위 매트릭스 + 지금 할 둘 · 사진', when='여러 변화 · 과제를 영향도 × 시급성(빈도) 매트릭스에 놓고, 지금 대응할 항목은 현장 사진으로 크게 보여줄 때',
        pv=['L_TR_C', 'L_CH_D'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · MARKET INTELLIGENCE', '지금 대응해야 할 변화는 두 가지입니다', '영향도 × 시급성 — 번호는 매트릭스의 점과 같습니다 · 위치는 인터뷰 · 데이터 기반 예시', w=1152)
    X, Y, W, H = 96, 176, 420, 420
    s += f'<div style="{ab(X, Y, W, H, f"box-sizing: border-box; border-left: 1.5px solid {INK}; border-bottom: 1.5px solid {INK}")}"></div>'
    s += f'<div style="{ab(X + W // 2, Y, W // 2, H // 2, f"background: {CHIP}; border-radius: 0 10px 0 0")}"></div>'
    s += f'<div style="{ab(X, Y + H // 2, W, 0, f"border-top: 1px dashed {LINE}")}"></div><div style="{ab(X + W // 2, Y, 0, H, f"border-left: 1px dashed {LINE}")}"></div>'
    for t, x, y, c in [('준비', X + 12, Y + 10, MUTED), ('지금 대응', X + W - 84, Y + 10, BLUE), ('관찰', X + 12, Y + H - 28, MUTED), ('빠르게 확인', X + W - 96, Y + H - 28, MUTED)]:
        s += b.tb(t, ab(x, y, 90, 18, f'font-size: 13px; font-weight: 800; color: {c}; white-space: nowrap'), 'div')
    s += b.tb('A 커피 영향도 ↑', ab(64, 152, 200, 18, f'font-size: 12.5px; font-weight: 700; color: {MUTED}'), 'div')
    s += b.tb('시급성 →', ab(X + W - 80, Y + H + 8, 80, 18, f'font-size: 12.5px; font-weight: 700; color: {MUTED}; text-align: right'), 'div')
    pts = [(1, 0.82, 0.88, True), (2, 0.66, 0.72, True), (3, 0.30, 0.80, False), (4, 0.84, 0.30, False), (5, 0.36, 0.32, False), (6, 0.18, 0.18, False)]
    for n, px, py, hot in pts:
        s += numbadge(b, str(n), X + round(px * W) - 14, Y + round((1 - py) * H) - 14, size=28, bg=BLUE if hot else FAINT)
    items = [('셀프 주문 확산', '키오스크 주문 비중 [00]%', 'fill.kiosk_touch', '50% 40%', '지금 대응'), ('시간대별 메뉴 운영', '연간 신메뉴 [00]회 출시', 'ph.fb-counter-menu', '50% 35%', '지금 대응'),
             ('매장 에너지 관리 강화', '운영비 중 전력비 [00]%', None, None, '준비'), ('모바일 선주문 · 픽업', '픽업 주문 [00]% 증가', None, None, '빠르게 확인'),
             ('매장 내 리테일 미디어', '도입 브랜드 [0]곳', None, None, '관찰'), ('무인 · 하이브리드 매장', '무인 운영 매장 [00]개', None, None, '관찰')]
    for i, (t, m, pid, pos, tag) in enumerate(items[:2]):
        x = 560 + i * 336
        s += photo(b, pid, x, 152, 320, 200, pos=pos, hint=f'{i + 1} {t} 현장 사진', radius=12)
        s += numbadge(b, str(i + 1), x + 10, 162, size=28)
        s += pill(b, tag, extra=f'position: absolute; left: {x + 230}px; top: 164px').replace('align-self: flex-start; ', '')
        s += (f'<div style="{ab(x, 360, 320, 52, "display: flex; flex-direction: column; gap: 2px")}">' + b.tb(t, 'font-size: 17px; font-weight: 800')
              + b.tb(m, f'{NUM}; font-size: 13px; color: {BODY}') + '</div>')
    for i, (t, m, _, _, tag) in enumerate(items[2:]):
        y = 428 + i * 54
        s += (f'<div style="{ab(560, y, 656, 46, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 14px; display: flex; align-items: center; gap: 10px")}">'
              + numtag(b, str(i + 3), 22, bg=FAINT) + b.tb(t, 'width: 220px; flex-shrink: 0; font-size: 14.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(m, f'flex: 1; min-width: 0; {NUM}; font-size: 12.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(tag, f'flex-shrink: 0; font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap') + '</div>')
    s += footer(b, FOOT_FB + ' · 사진: samsung.com 외식 · 카페 비즈니스 페이지', 8)
    return s


# ---------------------------------------------------------------- 5 growth bars + three drivers in photos
@layout(L, f='L_PH_MS_G', code='PH-MS-G', p='market', name='성장 추이 · 막대 + 성장 동인 사진 3', when='시장 규모 추이를 막대로, 시장을 키우는 세 가지 변화를 현장 사진으로 함께 보여줄 때',
        pv=['L_MI02', 'L_MS_E'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · MARKET INTELLIGENCE', '시장 규모는 5년 새 [N]배, 세 가지 변화가 키우고 있습니다', '국내 F&B 디지털 사이니지 시장 규모 (단위: 억 원) · 출처: [조사 기관, 연도]', w=1152)
    s += (f'<div style="{ab(64, 152, 520, 496, f"box-sizing: border-box; border-radius: 16px; background: {SOFT}")}"></div>')
    s += ('<span style="position: absolute; left: 88px; top: 172px; display: flex; align-items: baseline; gap: 6px">'
          + b.tb('2028 시장 전망', f'font-size: 13px; font-weight: 800; color: {MUTED}') + b.tb('[0,000]', f'{NUM}; font-size: 30px; font-weight: 800') + b.tb('억 원', 'font-size: 14px; font-weight: 800')
          + b.tb('연평균 [00]% 성장', f'margin-left: 8px; font-size: 13px; font-weight: 800; color: {BLUE}') + '</span>')
    yrs = ['2021', '2022', '2023', '2024', '2025', '2026E']
    hs = [70, 100, 135, 175, 225, 290]
    BASE = 590
    for i, (yr, h) in enumerate(zip(yrs, hs)):
        x = 100 + i * 78
        s += f'<div style="{ab(x, BASE - h, 52, h, f"border-radius: 6px 6px 0 0; background: {BLUE if i == 5 else "#c5cde6"}")}"></div>'
        s += b.tb('[00]', ab(x - 8, BASE - h - 22, 68, 18, f'{NUM}; text-align: center; font-size: 13px; font-weight: 800; color: {BLUE if i == 5 else INK}'), 'div')
        s += b.tb(yr, ab(x - 8, BASE + 8, 68, 16, f'{NUM}; text-align: center; font-size: 12.5px; font-weight: {800 if i == 5 else 600}; color: {INK if i == 5 else MUTED}'), 'div')
    s += f'<div style="{ab(88, BASE, 472, 1, f"background: {LINE}")}"></div>'
    drivers = [('인건비 상승 → 셀프 주문 확대', '주문 · 결제를 화면으로 넘기는 매장이 빠르게 늘고 있습니다', '[00]%', '최저임금 5년간 상승률', 'fill.kiosk_touch', '50% 40%'),
               ('메뉴 교체 주기 단축', '시즌 · 시간대 메뉴가 늘어 인쇄 메뉴판으로는 속도를 맞추기 어렵습니다', '[0]주', '신메뉴 평균 교체 주기', 'ph.fb-counter-menu', '50% 35%'),
               ('매장 에너지 관리 의무화', '매장 단위 전력 사용량 관리 · 보고 요구가 커지고 있습니다', '[00]%', '매장 운영비 중 전력비 비중', 'ph.fb-lounge-ac', '50% 40%')]
    for i, (t, d, v, vl, pid, pos) in enumerate(drivers):
        y = 152 + i * 168
        s += photo(b, pid, 608, y, 200, 156, pos=pos, hint=f'변화 {i + 1} · {t} 현장 사진', radius=12)
        s += numbadge(b, f'0{i + 1}', 616, y + 8, size=28)
        s += (f'<div style="{ab(824, y + 2, 392, 152, "display: flex; flex-direction: column; gap: 4px")}">'
              + b.tb(t, f'font-size: 16.5px; font-weight: 800; line-height: 23px; {clamp(2)}') + b.tb(d, f'font-size: 13px; line-height: 19px; color: {BODY}; {clamp(2)}')
              + '<span style="margin-top: auto; display: flex; align-items: baseline; gap: 10px">' + b.tb(v, f'{NUM}; font-size: 26px; font-weight: 800; color: {BLUE}')
              + b.tb(vl, f'font-size: 12px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span></div>')
        if i < 2: s += f'<div style="{ab(608, y + 162, 608, 1, f"background: {LINE}")}"></div>'
    s += footer(b, FOOT_FB + ' · 수치는 예시 · 데이터 연결 시 자동 반영 · 사진: samsung.com 외식 · 카페 비즈니스 페이지', 5)
    return s


# ---------------------------------------------------------------- 6 business understanding (RFP) with site photos
@layout(L, f='L_PH_OV_A', code='PH-OV-A', p='overview', p2='requirements', name='사업 이해 · 현장 사진', when='RFP의 추진 배경 · 목적 · 범위 · 기간을 한 장에 정리하되, 대상 현장을 사진으로 먼저 보여줄 때',
        pv=['L_OV_A'], sample='S 지자체', grp='과제 · 가치')
def _(b):
    s = header(b, '00 · 사업 이해', 'S 지자체가 이번 사업으로 이루려는 것', 'RFP 원문 요약과 제안사 해석을 구분해 표시 · RFP p. 표기', w=1152)
    s += photo(b, 'ph.pb-traffic-wall', 64, 152, 456, 196, pos='50% 45%', hint='사업 대상 현장 사진 (고객 현장으로 교체)', radius=14)
    s += label_on(b, '대상 현장', '상황실 · 정류장 · 역사 — 안내와 관제를 한 화면으로', 76, 270, 432)
    s += b.tb('추진 배경', ab(64, 364, 200, 20, 'font-size: 15px; font-weight: 800'), 'div')
    bg = [('노후 안내 장비 [00]% 내구연한 초과', 'RFP p.3'), ('상황실 화면 분산 · 통합 관제 어려움', 'RFP p.3'), ('시민 안내 다국어 요구 증가', '해석')]
    for i, (t, r) in enumerate(bg):
        s += (f'<div style="{ab(64, 390 + i * 30, 456, 26, "display: flex; align-items: center; gap: 8px")}"><i style="width: 5px; height: 5px; border-radius: 50%; background: {INK}; flex-shrink: 0"></i>'
              + b.tb(t, 'flex: 1; min-width: 0; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(r, f'flex-shrink: 0; height: 20px; padding: 0 7px; border-radius: 5px; background: {CHIP if r != "해석" else BLUE}; color: {BLUE if r != "해석" else "#ffffff"}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center') + '</div>')
    s += b.tb('사업 목적', ab(64, 486, 200, 20, 'font-size: 15px; font-weight: 800'), 'div')
    goals = [('한 화면에서 보는 통합 관제', 'RFP p.4'), ('정류장 · 역사 안내의 실시간화', 'RFP p.4'), ('장애를 먼저 아는 운영', 'RFP p.5')]
    for i, (t, r) in enumerate(goals):
        s += (f'<div style="{ab(64, 512 + i * 30, 456, 26, "display: flex; align-items: center; gap: 8px")}">' + numtag(b, str(i + 1), 20)
              + b.tb(t, 'flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(r, f'flex-shrink: 0; height: 20px; padding: 0 7px; border-radius: 5px; background: {CHIP}; color: {BLUE}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center') + '</div>')
    s += ('<span style="position: absolute; left: 552px; top: 152px; display: flex; align-items: baseline; gap: 8px">' + b.tb('사업 범위', 'font-size: 15px; font-weight: 800')
          + b.tb('RFP 과업 범위 · 5개 영역', f'font-size: 12px; color: {MUTED}') + '</span>')
    scope = [('상황실', '비디오월', '관제 화면 통합 · 상황실 전면', '[00]면', 'p.7', 'ph.pb-traffic-room', '50% 50%'),
             ('정류장', 'BIS 사이니지', '버스 도착 정보 · 다국어 안내', '[00]곳', 'p.8', 'fill.station_map', '50% 50%'),
             ('현장', '단말', '현장 점검 · 장애 접수', '[00]대', 'p.8', 'fill.worker_phone', '50% 50%'),
             ('SW', '통합 관제', '장비 상태 · 콘텐츠 원격 관리', '1식', 'p.9', 'r4.pb-traffic-ctl', '50% 50%'),
             ('운영', '유지보수', '하자 보수 · 정기 점검', '[0]년', 'p.12', 'ph.svc-technician', '50% 40%')]
    for i, (g, t, d, q, p, pid, pos) in enumerate(scope):
        y = 180 + i * 76
        s += photo(b, pid, 552, y, 104, 66, pos=pos, hint=f'{g} · {t} 사진', radius=8)
        s += (f'<div style="{ab(668, y, 548, 66, f"box-sizing: border-box; border-bottom: 1px solid {LINE}; display: flex; align-items: center; gap: 12px")}">'
              + b.tb(g, f'width: 54px; flex-shrink: 0; font-size: 13px; font-weight: 800; color: {MUTED}')
              + '<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px">' + b.tb(t, 'font-size: 15px; font-weight: 800')
              + b.tb(d, f'font-size: 12.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
              + b.tb(q, f'{NUM}; width: 70px; flex-shrink: 0; text-align: right; font-size: 17px; font-weight: 800')
              + b.tb(p, f'flex-shrink: 0; height: 20px; padding: 0 7px; border-radius: 5px; background: {CHIP}; color: {BLUE}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center') + '</div>')
    s += f'<div style="{ab(552, 574, 664, 74, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 0 16px; display: flex; align-items: center; gap: 8px")}">'
    s += ('<span style="width: 116px; flex-shrink: 0; display: flex; flex-direction: column; gap: 1px">' + b.tb('사업 기간', 'font-size: 14px; font-weight: 800')
          + b.tb('계약일부터 · 총 [00]개월', f'font-size: 11px; color: {MUTED}; white-space: nowrap') + '</span>')
    for i, (t, d) in enumerate([('착수', '[00]월'), ('설계', '[0]개월'), ('구축', '[0]개월'), ('시범 운영', '[0]개월'), ('검수 · 이관', '')]):
        s += (f'<span style="flex: 1; min-width: 0; height: 44px; border-radius: 8px; background: {BLUE if i == 4 else "#ffffff"}; color: {"#ffffff" if i == 4 else INK}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0">'
              + b.tb(t, 'font-size: 12.5px; font-weight: 800; white-space: nowrap') + (b.tb(d, f'{NUM}; font-size: 11.5px; font-weight: 700; color: {MUTED}') if d else '') + '</span>')
    s += '</div>'
    s += footer(b, 'S 지자체 · 통합 안내 · 관제 고도화 사업 제안 · 출처: 사업 제안요청서(RFP) · 사진: samsung.com 공공 · 교통 도입사례', 4)
    return s


# ---------------------------------------------------------------- 7 one space, one solution — the site photo with device pins
@layout(L, f='L_PH_VC_11', code='PH-VC-11', p='scenario', name='한 공간 · 한 솔루션 · 현장 사진 위 기기', when='한 공간에 한 솔루션을 깊게 — 현장 사진 위에 쓰는 기기를 번호로, 솔루션이 하는 일 셋과 기대 효과를',
        pv=['L_VC_11A', 'L_VC_11B'], sample='J 미디어', grp='공간 · 제품', sols=['magicinfo'])
def _(b):
    s = header(b, '03 · 공간별 가치 제공 시나리오', 'J 미디어의 교차로 전광판, 편성부터 송출 증빙까지 MagicINFO 하나로', '한 공간에 한 솔루션 — 전광판 한 면을 원격으로 편성 · 감시 · 기록합니다', w=1040)
    s += tagpill(b, '공간 1곳 · 솔루션 1개')
    s += photo(b, 'ph.ad-building-led2', 64, 152, 640, 372, pos='50% 40%', hint='대상 공간 사진 (고객 현장으로 교체)', radius=16)
    for n, x, y in [('1', 300, 120), ('2', 470, 70), ('3', 560, 330)]:
        s += pin(b, n, 64 + x, 152 + y, size=32)
    s += glass(''.join('<span style="display: flex; align-items: center; gap: 8px">' + numtag(b, n, 18) + b.tb(t, 'font-size: 12.5px; font-weight: 800; color: #ffffff; white-space: nowrap')
                       + b.tb(d, f'font-size: 11.5px; color: {LT}; white-space: nowrap') + '</span>'
                       for n, t, d in [('1', 'LED 사이니지', '교차로 전면 대형 화면 · 1면'), ('2', '밝기 센서', '주변 밝기 확인'), ('3', '미디어 플레이어', '콘텐츠 재생 · 서버와 연결')]),
               80, 420, 330, 92, pad='9px 13px', gap=4)
    s += (f'<div style="{ab(728, 152, 488, 84, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 12px 18px; display: flex; flex-direction: column; gap: 2px")}">'
          + b.tb('솔루션 1개 · 구축형 사이니지 CMS', f'font-size: 11.5px; font-weight: 800; color: {LB}') + b.tb('MagicINFO', 'font-size: 26px; font-weight: 800; color: #ffffff; line-height: 1.15')
          + b.tb('자체 서버 한 곳에서 편성 · 원격 관리 · 장애 알림', f'font-size: 12.5px; color: {LT}') + '</div>')
    s += ('<span style="position: absolute; left: 728px; top: 252px; display: flex; align-items: baseline; gap: 8px">' + b.tb('이 전광판에서 하는 일', 'font-size: 15px; font-weight: 800')
          + b.tb('사무실에서 원격으로', f'font-size: 12px; color: {MUTED}') + '</span>')
    jobs = [('시간대 · 광고주별 편성 스케줄을 원격으로', '광고주마다 다른 콘텐츠를 사무실에서 편성 · 교체'), ('장애 · 화면 꺼짐을 바로 알림, 밝기는 시간대에 맞춰', '현장에 나가기 전에 화면 상태부터 확인'),
            ('송출 기록을 광고주 증빙 리포트로', '언제 무엇이 나갔는지 기록으로 남깁니다')]
    for i, (t, d) in enumerate(jobs):
        y = 284 + i * 80
        s += (f'<div style="{ab(728, y, 488, 70, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 10px 14px; display: flex; gap: 12px")}">' + numtag(b, str(i + 1), 24)
              + '<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">' + b.tb(t, f'font-size: 14.5px; font-weight: 800; line-height: 1.35; {clamp(1)}')
              + b.tb(d, f'font-size: 12.5px; color: {MUTED}; {clamp(1)}') + '</span></div>')
    s += f'<div style="{ab(64, 544, 1152, 104, f"box-sizing: border-box; border-radius: 14px; background: {CHIP}; padding: 14px 20px; display: flex; align-items: center; gap: 20px")}">'
    s += ('<span style="width: 150px; flex-shrink: 0; display: flex; flex-direction: column; gap: 2px">' + b.tb('이 전광판의 기대 효과', 'font-size: 14px; font-weight: 800; line-height: 1.35')
          + b.tb('수치는 예시 · 유사 사례 기준', f'font-size: 11px; color: {MUTED}') + '</span>')
    for t, d, v in [('현장 출동', '원격으로 먼저 확인하고 필요할 때만', '[00]% ↓'), ('편성 변경', '광고주 요청을 반영하기까지', '[0]일 → [0]시간'), ('송출 증빙', '광고주 리포트 작성', '수작업 → 자동')]:
        s += (f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding-left: 20px; border-left: 1px solid #c9d2f2">'
              + b.tb(t, 'font-size: 13.5px; font-weight: 800') + b.tb(d, f'font-size: 12px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(v, f'{NUM}; font-size: 22px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>')
    s += '</div>'
    s += footer(b, 'J 미디어 · 도심 옥외 전광판 운영 제안 · 사진: samsung.com 옥외 광고 도입사례', 14)
    return s


# ---------------------------------------------------------------- 8 · 9 value pillars 2 and 4 with photos
@layout(L, f='L_PH_VP_B2', code='PH-VP-B2', p='value', name='가치 기둥 2 · 포토', when='핵심 가치 두 가지를, 가치마다 그 장면의 큰 사진과 함께',
        pv=['L_VP02'], sample='A 커피', grp='과제 · 가치', sols=['magicinfo'])
def _(b):
    s = header(b, '02 · VALUE PROPS', 'A 커피가 얻는 두 가지 가치', 'Key Message 2개 — 사진은 같은 업종의 실제 현장', w=1152)
    vs = [('01', '본사에서 320개 매장을 한 번에 운영', '콘텐츠 제작 · 승인 · 배포 · 적용 확인까지 한 화면에서. 매장은 켜 두기만 하면 됩니다.', ['원격 배포', '장애 알림'], 'ph.fb-cafe-signage', '50% 40%'),
          ('02', '전기료 부담을 낮추는 저전력 운영', '자동 밝기와 전원 스케줄로 영업시간에만, 필요한 만큼만 켭니다. 매장별 전력 리포트가 따라옵니다.', ['자동 밝기', '전력 리포트'], 'fill.cafe_night', '50% 50%')]
    for i, (n, t, d, cs, pid, pos) in enumerate(vs):
        x = 64 + i * 584
        s += photo(b, pid, x, 152, 568, 290, pos=pos, hint=f'가치 {n} 장면 사진', radius=16)
        s += b.tb(n, ab(x + 16, 162, 80, 50, f'{NUM}; font-size: 40px; font-weight: 800; color: #ffffff; text-shadow: 0 2px 10px rgba(0,0,0,0.45)'), 'div')
        s += (f'<div style="{ab(x, 458, 568, 190, "display: flex; flex-direction: column; gap: 8px")}">' + b.tb(t, 'font-size: 24px; font-weight: 800; line-height: 1.3')
              + b.tb(d, f'font-size: 15px; line-height: 1.6; color: {BODY}; {clamp(3)}')
              + '<span style="margin-top: 6px; display: flex; gap: 6px">' + ''.join(chip(b, c, size=12, h=26) for c in cs) + '</span></div>')
    s += footer(b, FOOT_FB + ' · 사진: samsung.com 외식 · 카페 비즈니스 페이지', 9)
    return s


@layout(L, f='L_PH_VP_B4', code='PH-VP-B4', p='value', name='가치 기둥 4 · 포토 2×2', when='핵심 가치 네 가지를 2×2로, 가치마다 그 장면 사진과 근거 · 연결 섹션을 함께',
        pv=['L_VP04'], sample='A 커피', grp='과제 · 가치', sols=['magicinfo'])
def _(b):
    s = header(b, '02 · VALUE PROPS', 'A 커피가 얻는 네 가지 가치', 'Key Message 4개 — 사진은 같은 업종의 실제 현장', w=1152)
    vs = [('01', '본사에서 한 번에 운영', '제작 · 승인 · 배포 · 적용 확인까지 한 화면에서', '→ 솔루션 제안 섹션', 'ph.fb-cafe-signage', '50% 40%'),
          ('02', '저전력 자동 운영', '영업시간에만, 필요한 밝기로만 켭니다', '→ 예상 절감 [00]%', 'fill.cafe_night', '50% 50%'),
          ('03', '프로모션을 몇 분 만에', '시간대 · 시즌 콘텐츠를 예약하고 자동 전환', '→ 교체 리드타임 [00]분', 'r4.fb-bakery-menu', '50% 40%'),
          ('04', '손님이 먼저 읽는 메뉴', '멀리서도 선명한 고휘도 화면과 실시간 품절 표시', '→ 공간별 제품 섹션', 'ph.fb-dt-menu', '50% 40%')]
    for i, (n, t, d, link, pid, pos) in enumerate(vs):
        x = 64 + (i % 2) * 584; y = 152 + (i // 2) * 252
        s += photo(b, pid, x, y, 260, 236, pos=pos, hint=f'가치 {n} 장면 사진', radius=14)
        s += (f'<div style="{ab(x + 280, y + 4, 288, 228, "display: flex; flex-direction: column; gap: 8px")}">'
              + b.tb(n, f'{NUM}; font-size: 30px; font-weight: 800; color: {BLUE}; line-height: 1') + b.tb(t, f'font-size: 21px; font-weight: 800; line-height: 30px; {clamp(2)}')
              + b.tb(d, f'font-size: 14px; line-height: 1.55; color: {BODY}; {clamp(3)}')
              + b.tb(link, f'margin-top: auto; font-size: 13px; font-weight: 800; color: {BLUE}') + '</div>')
    s += footer(b, FOOT_FB + ' · 사진: samsung.com 외식 · 카페 비즈니스 페이지', 9)
    return s


# ---------------------------------------------------------------- 10 rollout quantities by phase — phase photos, product cuts once on the left
@layout(L, f='L_PH_BM_D', code='PH-BM-D', p='bom', p2='execution', name='단계별 도입 물량 · 단계 사진 + 제품 컷', when='한 번에 전체가 아니라 단계별로 도입할 때, 단계마다 매장 사진 · 물량 · 다음 단계 조건을 — 제품은 왼쪽에 한 번만',
        pv=['L_BM_D'], sample='A 커피', grp='공간 · 제품', prods=['qm55c', 'oh55a', 'kiosk', 'qm65c', 'qm43c'])
def _(b):
    s = header(b, '04 · 공간별 제품', '한 번에 320곳이 아니라 — 10 → 100 → 320', '매장당 QM55C 3 · KM24C 1 · QM65C 1 · QM43C 1 = 6대, 가두 매장은 OH55C 2대 추가 · 수치는 예시', w=1152)
    prods = [('cut.qm55c', 'QM55C', '카운터 메뉴보드', '×3'), ('cut.oh55a', 'OH55C', '가두 매장만', '×2'), ('cut.km24c', 'KM24C', '주문 키오스크', '×1'),
             ('cut.qm65c', 'QM65C', '대기 공간', '×1'), ('cut.qm43c', 'QM43C', '픽업 호출', '×1')]
    R0, RH = 338, 40
    s += b.tb('매장당', ab(64, 312, 200, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}'), 'div')
    for i, (pid, m, d, q) in enumerate(prods):
        y = R0 + i * RH
        s += thumb(b, pid, 64, y + 2, 44, 34, hint=f'{m} 제품 컷')
        s += (f'<div style="{ab(116, y, 160, 38, "display: flex; flex-direction: column; justify-content: center; gap: 0")}">'
              + '<span style="display: flex; align-items: baseline; gap: 6px">' + b.tb(m, f'{NUM}; font-size: 13.5px; font-weight: 800') + b.tb(q, f'{NUM}; font-size: 12px; font-weight: 700; color: {BLUE}') + '</span>'
              + b.tb(d, f'font-size: 11px; color: {MUTED}; white-space: nowrap') + '</div>')
    phases = [('1차', '파일럿', '직영 매장', '10', '전체의 3%', '[00]주', '운영 검증 — 콘텐츠 · 장애 대응', ['30', '[00]', '10', '10', '10'], '60', '+ OH55C [00]',
               '다음 단계로 가는 조건', ['콘텐츠 교체 리드타임 [00]분 이내', '장애 [0]건 이하 · [0]주 연속'], 'ph.fb-cafe-counter', '50% 40%'),
              ('2차', '확대', '수도권 매장', '90', '전체의 28%', '[00]주', '설치 · 점주 교육 표준화', ['270', '[000]', '90', '90', '90'], '540', '+ OH55C [000]',
               '다음 단계로 가는 조건', ['주당 설치 [00]곳 속도 확보', '점주 교육 이수율 [00]% 이상'], 'r4.fb-bakery-hall', '50% 50%'),
              ('3차', '전 지점', '나머지 전국 매장', '220', '전체의 69%', '[00]주', '권역별 동시 설치', ['660', '[000]', '220', '220', '220'], '1,320', '+ OH55C [000]',
               '완료 기준', ['전 매장 MagicINFO 원격 관리', '권역별 A/S [0]시간 내 대응'], 'ph.fb-dt-order', '50% 45%')]
    for i, (st, nm, who, n, pct, wk, goal, qs, tot, oh, cl, cond, pid, pos) in enumerate(phases):
        x = 296 + i * 312; w = 296; last = i == 2
        s += f'<div style="{ab(x, 152, w, 496, f"box-sizing: border-box; border-radius: 14px; border: 1px solid {BLUE if last else LINE}; background: {CHIP if last else "#ffffff"}")}"></div>'
        s += photo(b, pid, x + 8, 160, w - 16, 104, pos=pos, hint=f'{st} {nm} 대상 매장 사진', radius=9)
        s += glass('<span style="display: flex; align-items: baseline; gap: 6px">' + b.tb(st, f'font-size: 11px; font-weight: 800; color: {LB}') + b.tb(nm, 'font-size: 15px; font-weight: 800; color: #ffffff')
                   + b.tb(who, f'font-size: 11px; color: {LT}; white-space: nowrap') + '</span>', x + 14, 222, None, 34, pad='0 10px', extra='justify-content: center; border-radius: 8px')
        s += ('<span style="position: absolute; left: %dpx; top: 272px; width: %dpx; display: flex; align-items: baseline; gap: 4px">' % (x + 16, w - 32)
              + b.tb(n, f'{NUM}; font-size: 30px; font-weight: 800; color: {BLUE}; line-height: 1.1') + b.tb('곳', 'font-size: 14px; font-weight: 800')
              + b.tb(pct, f'margin-left: 6px; font-size: 11.5px; color: {MUTED}; white-space: nowrap') + b.tb(wk, f'{NUM}; margin-left: auto; font-size: 11.5px; font-weight: 700; color: {MUTED}') + '</span>')
        s += b.tb(goal, ab(x + 16, 312, w - 32, 18, f'font-size: 12px; font-weight: 700; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
        for k, q in enumerate(qs):
            y = R0 + k * RH
            s += f'<div style="{ab(x + 12, y + 4, w - 24, 30, f"border-radius: 7px; background: {SOFT if not last else "#ffffff"}")}"></div>'
            s += b.tb(q, ab(x + 16, y + 9, w - 32, 20, f'{NUM}; text-align: right; font-size: 15px; font-weight: 800'), 'div')
        s += ('<span style="position: absolute; left: %dpx; top: %dpx; width: %dpx; display: flex; align-items: baseline; gap: 4px; border-top: 1px solid %s; padding-top: 6px">' % (x + 16, R0 + 5 * RH + 4, w - 32, LINE)
              + b.tb('이 단계 합계', 'font-size: 12px; font-weight: 700') + b.tb(oh, f'margin-left: auto; font-size: 11px; color: {MUTED}; white-space: nowrap')
              + b.tb(tot, f'{NUM}; font-size: 18px; font-weight: 800; color: {BLUE}') + b.tb('대', 'font-size: 12px; font-weight: 700') + '</span>')
        s += (f'<div style="{ab(x + 16, 580, w - 32, 60, "display: flex; flex-direction: column; gap: 2px")}">' + b.tb(cl, f'font-size: 11px; font-weight: 800; color: {BLUE}')
              + ''.join(b.tb('· ' + c, f'font-size: 12px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') for c in cond) + '</div>')
    s += f'<div style="{ab(64, 560, 220, 88, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px")}">'
    s += b.tb('누적 도입', 'font-size: 13px; font-weight: 800') + b.tb('10곳 · 60대 → 100곳 · 600대', f'{NUM}; font-size: 11.5px; color: {BODY}')
    s += b.tb('→ 320곳 · 1,920대', f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}') + b.tb('실내 기기 기준 · OH55C 별도', f'font-size: 10.5px; color: {MUTED}') + '</div>'
    s += footer(b, FOOT_FB + ' · 제품 컷: 삼성 공식 · 매장 사진: samsung.com 외식 · 카페 도입사례', 16)
    return s
