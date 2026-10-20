# 6차 — 실행 계획(유지보수) · 비용 사진 레이아웃 7장 (L_PH_MT_B · L_PH_CO_A ~ L_PH_CO_F)
# pv 가 있는 장(MT_B · CO_A · CO_B)은 원본 텍스트 장의 eyebrow · 예시 고객 · 각주 앞부분 · 쪽 번호를 그대로 쓰고 내용을 줄여 옮김
# 수치는 자리표시 · 경쟁사는 익명 + 실루엣 · 사진은 samsung.com 도입사례 · 비즈니스 페이지 · 공식 제품 컷
import math
from gen_r5 import *
L = []
GRP = '비용 · 사진'
EB_CO = '10 · 비용 · '


def _row(inner, gap=8, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; {extra}">{inner}</span>'


def _seg(x1, y1, x2, y2, color, w=2.5, dash=False):
    """선분 (div 회전)"""
    ln = math.hypot(x2 - x1, y2 - y1); ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
    bg = f'repeating-linear-gradient(90deg, {color} 0 6px, transparent 6px 10px)' if dash else color
    return f'<div style="{ab(round(x1, 1), round(y1 - w / 2, 1), round(ln, 1), w, f"background: {bg}; border-radius: 2px; transform: rotate({ang:.2f}deg); transform-origin: 0 50%")}"></div>'


def _sq(n, of=3, color=INK, size=11):
    """상대 비용 네모 (채움 n / 전체 of)"""
    return ('<span style="display: flex; gap: 4px">' + ''.join(
        f'<i style="width: {size}px; height: {size}px; border-radius: 2px; box-sizing: border-box; '
        + (f'background: {color}' if k < n else f'border: 1px solid #c3c8d1; background: #ffffff') + '"></i>' for k in range(of)) + '</span>')


def _kv(b, k, v, hi=False, h=28, ks=12.5, vs=13.5, line=True, vhtml=None):
    """한 줄 항목 — 왼쪽 이름 · 오른쪽 값"""
    vc = BLUE if hi else INK
    if v == '—': vc = '#b8bec8'
    val = vhtml if vhtml is not None else b.tb(v, f'font-size: {vs}px; font-weight: 800; color: {vc}; white-space: nowrap')
    bd = f'border-bottom: 1px solid {LINE}; ' if line else ''
    return (f'<div style="box-sizing: border-box; height: {h}px; {bd}display: flex; align-items: center; justify-content: space-between; gap: 8px">'
            + b.tb(k, f'font-size: {ks}px; color: {BODY}; white-space: nowrap') + val + '</div>')


def _dot_in(b, hi):
    c = BLUE if hi else INK
    return _row(f'<i style="width: 8px; height: 8px; border-radius: 50%; background: {c}"></i>'
                + b.tb('포함', f'font-size: 13.5px; font-weight: 800; color: {c}; white-space: nowrap'), 6)


# ---------------------------------------------------------------- 1. care plans — three cards with a service scene on top
@layout(L, f='L_PH_MT_B', code='PH-MT-B', p='execution', p2='cost', name='케어 플랜 3등급 · 장면 사진 카드',
        when='유지보수 상품 세 등급을 견주며, 등급마다 어떤 서비스 장면인지 사진으로 보여 주고 하나를 고르게 할 때',
        pv=['L_MT_B'], sample='A 커피', grp='실행 · 사진')
def _(b):
    s = header(b, '09 · 실행 계획 — 유지보수', '세 가지 케어 플랜 — 매장 수와 운영 방식에 맞춰', '320개 매장 기준 · 가운데가 추천', w=1152)
    plans = [
        ('기본', '보증 기간 안의 방문 수리 중심', 1, 'ph.svc-technician', '50% 25%', '방문 수리',
         '매장이 적고 IT 인력이 있을 때', '방문 수리 장면 (사이니지 수리 엔지니어 사진으로 교체)',
         ['[0]년', '—', '[00]시간 이내', '연 1회', '—', '—']),
        ('표준', '원격으로 먼저 살피고, 필요할 때 방문', 2, 'fill.vxt_control', '50% 50%', '원격 관제 화면',
         '매장이 많고 본사 운영팀이 작을 때', '원격 관리 화면 (제안 CMS 화면으로 교체)',
         ['[0]년', 'IN', '[0]시간 이내', '연 [0]회', '지역 거점', '월 [0]건']),
        ('프리미엄', '매장 가까이에서, 가장 빠르게', 3, 'ph.fb-dt-order', '50% 45%', '24시간 드라이브스루',
         '24시간 매장 · 장애가 매출로 직결될 때', '24시간 · 드라이브스루 매장 (고객 매장으로 교체)',
         ['[0]년', 'IN', '[0]시간 이내', '분기', '매장 근처', '상시'])]
    keys = ['무상 보증', '원격 모니터링', '장애 대응 방문', '정기 점검', '예비품 보유', '콘텐츠 운영 지원']
    for i, (nm, d, cost, pid, pos, tg, when, hint, vals) in enumerate(plans):
        x = 64 + i * 392; hi = i == 1
        s += box(x, 150, 368, 456, '#ffffff', 14, f'border: {"2px solid " + BLUE if hi else "1px solid " + LINE}')
        s += photo(b, pid, x + 8, 158, 352, 200, pos=pos, hint=hint, radius=9)
        s += tag_on(b, '추천' if hi else tg, x + 20, 170, dark=not hi)
        s += label_on(b, '이럴 때', when, x + 20, 288, 328, lines=1)
        s += b.tb(nm, ab(x + 22, 368, 200, 30, f'font-size: 22px; font-weight: 800; line-height: 30px; color: {BLUE if hi else INK}; white-space: nowrap'), 'div')
        s += f'<div style="{ab(x + 196, 374, 150, 18, "display: flex; align-items: center; justify-content: flex-end; gap: 8px")}">' + b.tb('상대 비용', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + _sq(cost, 3, BLUE if hi else INK) + '</div>'
        s += b.tb(d, ab(x + 22, 400, 324, 18, f'font-size: 13px; line-height: 18px; color: {BODY}; white-space: nowrap'), 'div')
        rows = ''.join(_kv(b, k, v, hi, h=28, line=k != keys[-1], vhtml=_dot_in(b, hi) if v == 'IN' else None) for k, v in zip(keys, vals))
        s += f'<div style="{ab(x + 22, 426, 324, 170, f"border-top: 1px solid {LINE}; display: flex; flex-direction: column")}">{rows}</div>'
    s += (f'<div style="{ab(64, 618, 1152, 34, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 18px; display: flex; align-items: center; gap: 18px")}">'
          + b.tb('추천 이유', f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + f'<i style="width: 1px; height: 16px; background: {LINE}"></i>'
          + b.tb('320개 매장 · 본사 운영 인원 [0]명 · 드라이브스루 [00]곳 포함', f'font-size: 13px; font-weight: 700; color: {INK}; white-space: nowrap')
          + '<span style="margin-left: auto"></span>'
          + _row(f'<i style="width: 8px; height: 8px; border-radius: 50%; background: {BLUE}"></i>' + b.tb('포함', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap')
                 + b.tb('—  미포함', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap; margin-left: 10px'), 6) + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 금액은 견적서 · SLA는 계약 조건으로 확정 · 리포트 항목은 부록 p.[00] · 사진: samsung.com 카페 도입사례 · 솔루션 페이지', 43)
    return s


# ---------------------------------------------------------------- 2. purchase options — three cards with a branch photo + small crossover chart
@layout(L, f='L_PH_CO_A', code='PH-CO-A', p='cost', name='구매 방식 3 · 지점 사진 + 누적 비용 선',
        when='일시 구매 · 구독 · 렌탈을 지점 사진과 함께 견주고, 누적 비용이 같아지는 시점을 작은 선으로 보여 줄 때',
        pv=['L_CO_A'], sample='P 스터디카페', grp=GRP)
def _(b):
    s = header(b, EB_CO + '구매 방식', '같은 구성, 세 가지 방법으로 도입할 수 있습니다', '지점 [00]곳 · 키오스크 · 복합기 · 사이니지 · 같은 구성 기준', w=1152)
    opts = [
        ('일시 구매', '한 번에 사서 자산으로 보유', 'ph.sv-studycafe', '50% 40%', '지점이 안정적 · 5년 이상 쓸 때', '오래 운영할 기존 지점 (고객 지점 사진으로 교체)',
         [('초기 비용', 3, '높음'), ('월 비용', None, '—'), ('유지보수', None, '별도'), ('소유권', None, '구매 시'), ('중도 해지', None, '—')]),
        ('구독', '월 요금에 유지보수까지 포함', 'ph.sv-study-tab', '50% 45%', '지점을 빠르게 늘릴 때', '새로 여는 지점 · 태블릿 입실 (고객 신규 지점으로 교체)',
         [('초기 비용', 1, '낮음'), ('월 비용', None, '월 [00]만 원 · [00]개월'), ('유지보수', None, '포함'), ('소유권', None, '만기 후 인수 선택'), ('중도 해지', None, '위약금 [00]%')]),
        ('렌탈', '필요한 기간만 빌려 쓰고 반납', 'r4.sv-studycafe-mfp', '50% 45%', '계절 · 단기 매장일 때', '단기 운영 코너 · 무인 출력 (고객 단기 매장으로 교체)',
         [('초기 비용', 0, '없음'), ('월 비용', None, '월 [00]만 원'), ('유지보수', None, '포함'), ('소유권', None, '반납'), ('중도 해지', None, '[0]개월 전 통보')])]
    for i, (nm, d, pid, pos, when, hint, rows) in enumerate(opts):
        x = 64 + i * 392; hi = i == 1
        s += box(x, 150, 368, 394, CHIP if hi else '#ffffff', 14, f'border: {"2px solid " + BLUE if hi else "1px solid " + LINE}')
        s += photo(b, pid, x + 8, 158, 352, 184, pos=pos, hint=hint, radius=9)
        if hi: s += tag_on(b, '추천', x + 20, 170, dark=False)
        s += label_on(b, '이럴 때 맞아요', when, x + 20, 274, 328, lines=1)
        s += b.tb(nm, ab(x + 22, 350, 180, 28, f'font-size: 20px; font-weight: 800; line-height: 28px; color: {BLUE if hi else INK}; white-space: nowrap'), 'div')
        s += b.tb(d, ab(x + 22, 378, 324, 18, f'font-size: 12.5px; line-height: 18px; color: {BODY}; white-space: nowrap'), 'div')
        inner = ''
        for k, n, v in rows:
            vh = (_row(_sq(n, 3, BLUE if hi else INK, 10) + b.tb(v, f'font-size: 13.5px; font-weight: 800; color: {BLUE if hi else INK}; white-space: nowrap'), 7)
                  if n is not None else None)
            inner += _kv(b, k, v, hi, h=26, line=k != '중도 해지', vhtml=vh)
        s += f'<div style="{ab(x + 22, 402, 324, 132, f"border-top: 1px solid {LINE if not hi else '#c9d3f2'}; display: flex; flex-direction: column")}">{inner}</div>'
    # crossover band
    s += box(64, 556, 1152, 96, SOFT, 12)
    s += b.tb('누적 비용이 같아지는 시점 · 선은 예시', ab(88, 574, 330, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    s += (f'<div style="{ab(88, 598, 360, 40, "display: flex; align-items: baseline; gap: 8px")}">'
          + b.tb('구독 대비 구매', f'font-size: 16px; font-weight: 800; color: {INK}; white-space: nowrap')
          + bignum(b, '[00]', '개월째', size=30, unit_size=16) + '</div>')
    X0, X1, BY = 520, 1176, 626
    s += rect(X0, BY, X1 - X0, 1, '#c3c8d1')
    p0, p1, q0, q1 = 600, 588, 620, 578
    s += _seg(X0, p0, X1, p1, INK, 2.5)
    s += _seg(X0, q0, X1, q1, BLUE, 2.5)
    t = (q0 - p0) / ((q0 - q1) - (p0 - p1)); cx = X0 + t * (X1 - X0); cy = p0 + t * (p1 - p0)
    s += f'<div style="{ab(round(cx) - 1, round(cy), 0, BY - round(cy), f"border-left: 2px dashed {BLUE}")}"></div>'
    s += f'<div style="{ab(round(cx) - 7, round(cy) - 7, 14, 14, f"box-sizing: border-box; border-radius: 50%; background: #ffffff; border: 3px solid {BLUE}")}"></div>'
    s += pill(b, '[00]개월', extra=f'position: absolute; left: {round(cx) + 10}px; top: {round(cy) + 6}px; height: 20px')
    for k, yl in enumerate(['도입', '1년', '2년', '3년', '4년', '5년']):
        xx = X0 + k * (X1 - X0) / 5
        s += b.tb(yl, ab(round(xx) - 20, BY + 6, 40, 16, f'font-size: 11px; font-weight: 700; color: {MUTED}; text-align: center; white-space: nowrap'), 'div')
    s += (f'<div style="{ab(X0, 566, 300, 16, "display: flex; align-items: center; gap: 14px")}">'
          + _row(f'<i style="width: 18px; height: 3px; background: {INK}; border-radius: 2px"></i>' + b.tb('구매 누적', f'font-size: 11.5px; color: {BODY}; white-space: nowrap'), 6)
          + _row(f'<i style="width: 18px; height: 3px; background: {BLUE}; border-radius: 2px"></i>' + b.tb('구독 누적', f'font-size: 11.5px; color: {BODY}; white-space: nowrap'), 6) + '</div>')
    s += footer(b, 'P 스터디카페 · 지점 확장 제안 · 회계 처리는 고객 회계 기준 확인 필요 · 금액은 견적서 · 업그레이드 · 회계 항목은 부록 p.[00] · 사진: samsung.com 생활 편의 · 교육 도입사례', 34)
    return s


# ---------------------------------------------------------------- 3. 5-year TCO — stacked bars standing on product cuts + store photo
@layout(L, f='L_PH_CO_B', code='PH-CO-B', p='cost', name='총소유비용 5년 · 제품 컷 + 누적 막대',
        when='처음 가격과 5년 운영비를 함께 보여 주며, 각 안의 제품 그림 위에 5년 총비용 막대를 세워 순서가 바뀌는 것을 보일 때',
        pv=['L_CO_B'], sample='A 커피', grp=GRP)
def _(b):
    s = header(b, EB_CO + '총소유비용', '5년을 보면, 처음 가격의 순서가 바뀝니다', '세 가지 안의 5년 총비용 · 구매 · 설치 · 라이선스 · 전기 · 유지보수 · 교체', w=1152)
    s += b.tb('5년 총비용 구성 · 억 원', ab(64, 152, 300, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    BL = ['#1428a0', '#2f45b5', '#5068c8', '#7a8fd8', '#a3b2e6', '#c9d3f2']   # 초기 구매 → 교체 (아래 → 위)
    GR = ['#2e333d', '#4a505c', '#6b7280', '#8d939e', '#adb3bd', '#cfd3da']
    cols = [('삼성 안', 'cut.qm55c', 0, 160, [0.42, 0.10, 0.14, 0.17, 0.11, 0.06], '삼성 제안 제품 컷 · QM55C'),
            ('경쟁사 C 안', 'signage', 1, 228, [0.07, 0.08, 0.24, 0.18, 0.15, 0.28], '경쟁사 C 동급 제품 사진 (공개 자료로 교체)'),
            ('경쟁사 A 안', 'signage', 2, 208, [0.38, 0.11, 0.15, 0.17, 0.12, 0.07], '경쟁사 A 동급 제품 사진 (공개 자료로 교체)')]
    BY = 428
    for nm, pid, i, H, fr, hint in cols:
        x = 64 + i * 188; cx = x + 88; ours = i == 0
        y = BY
        for k, f in enumerate(fr):
            hh = round(H * f)
            s += rect(cx - 44, y - hh, 88, hh - 2, (BL if ours else GR)[k], 3 if k == len(fr) - 1 else 0)
            y -= hh
        s += b.tb('[0.0]억', ab(x, y - 32, 176, 26, f'{NUM}; font-size: 18px; font-weight: 800; line-height: 26px; color: {BLUE if ours else BODY}; text-align: center; white-space: nowrap'), 'div')
        s += rect(x, BY, 176, 2, '#b8bec8')
        s += cut(b, pid, x, BY + 10, 176, 112, hint=hint, pad=12) if ours else rival(b, pid, x, BY + 10, 176, 112, hint=hint, pad=14)
        s += b.tb(nm, ab(x, BY + 130, 176, 22, f'font-size: 15px; font-weight: 800; line-height: 22px; color: {BLUE if ours else INK}; text-align: center; white-space: nowrap'), 'div')
        s += b.tb('처음 가격 [0.0]억', ab(x, BY + 152, 176, 18, f'font-size: 12px; line-height: 18px; color: {MUTED}; text-align: center; white-space: nowrap'), 'div')
    # legend
    s += b.tb('구간 · 삼성 / 경쟁', ab(636, 186, 120, 16, f'font-size: 11px; color: {MUTED}; white-space: nowrap'), 'div')
    leg = [('교체 · 폐기', '노후 화면 교체'), ('유지보수', '출장 · 부품'), ('전기', '5년 전력 사용'), ('라이선스 · 구독', 'CMS · 서버'), ('설치', '시공 · 배선'), ('초기 구매', '화면 · 플레이어')]
    for k, (a, c) in enumerate(leg):
        y = 210 + k * 36; ci = 5 - k
        s += rect(636, y + 4, 9, 9, BL[ci], 2) + rect(648, y + 4, 9, 9, GR[ci], 2)
        s += (f'<div style="{ab(664, y, 92, 34, "display: flex; flex-direction: column; gap: 0")}">'
              + b.tb(a, f'font-size: 12px; font-weight: 800; line-height: 17px; color: {INK}; white-space: nowrap')
              + b.tb(c, f'font-size: 10.5px; line-height: 15px; color: {MUTED}; white-space: nowrap') + '</div>')
    # yearly cumulative strip (reduced to 1 · 3 · 5년차)
    cells = ''
    for yl, hi in [('1년차', False), ('3년차 · 역전', True), ('5년차', False)]:
        cells += (f'<div style="flex: 1; min-width: 0; box-sizing: border-box; height: 40px; border-radius: 8px; background: {CHIP if hi else "#ffffff"}; padding: 4px 10px; display: flex; flex-direction: column; justify-content: center; gap: 1px">'
                  + b.tb(yl, f'font-size: 11px; font-weight: 800; line-height: 15px; color: {BLUE if hi else MUTED}; white-space: nowrap')
                  + _row(b.tb('[0.0]', f'{NUM}; font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap')
                         + b.tb('[0.0]', f'{NUM}; font-size: 13px; font-weight: 800; color: {INK if hi else MUTED}; white-space: nowrap')
                         + b.tb('[0.0]', f'{NUM}; font-size: 13px; font-weight: 800; color: {INK if hi else MUTED}; white-space: nowrap'), 10) + '</div>')
    s += (f'<div style="{ab(64, 606, 692, 46, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 3px 3px 3px 14px; display: flex; align-items: center; gap: 6px")}">'
          + '<span style="width: 150px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0">'
          + b.tb('연도별 누적 · 억 원', f'font-size: 12px; font-weight: 800; line-height: 17px; color: {INK}; white-space: nowrap')
          + b.tb('삼성 · 경쟁사 C · 경쟁사 A', f'font-size: 10.5px; line-height: 15px; color: {MUTED}; white-space: nowrap') + '</span>' + cells + '</div>')
    # right — store photo + conclusion
    s += photo(b, 'ph.fb-cafe-counter', 780, 150, 436, 318, pos='50% 40%', hint='5년 켜 둘 매장 메뉴보드 (고객 매장으로 교체)', radius=12)
    s += tag_on(b, '320개 매장 · 5년', 794, 164)
    s += label_on(b, '하루 [16]시간 켜 두는 메뉴보드', '전기 · 교체 비용이 5년 차이를 만듭니다', 794, 398, 408, lines=1)
    s += (f'<div style="{ab(780, 480, 436, 172, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 18px 24px; display: flex; flex-direction: column; gap: 4px")}">'
          + b.tb('5년 총비용', f'font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap')
          + '<span style="display: flex; align-items: baseline; gap: 10px">' + b.tb('−[00]%', f'{NUM}; font-size: 50px; font-weight: 800; line-height: 64px; color: #ffffff; white-space: nowrap')
          + b.tb('경쟁 안 대비', 'font-size: 15px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</span>'
          + '<span style="height: 1px; background: rgba(255,255,255,0.25); margin: 4px 0 6px"></span>'
          + _row(b.tb('경쟁사 C 안 대비 −[00]%', f'font-size: 12.5px; font-weight: 700; color: {LT}; white-space: nowrap')
                 + b.tb('경쟁사 A 안 대비 −[00]%', f'font-size: 12.5px; font-weight: 700; color: {LT}; white-space: nowrap'), 18) + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 320개 매장 · 5년 · 막대 길이는 예시 · 산출 가정은 부록 p.[00] · 경쟁사 익명 · 경쟁사 제품은 실루엣 자리 · 사진: samsung.com 카페 도입사례', 35)
    return s


# ---------------------------------------------------------------- 4. phased investment — space photo per phase + yearly budget bars
@layout(L, f='L_PH_CO_C', code='PH-CO-C', p='cost', p2='execution', name='단계별 투자 · 공간 사진 + 연도별 예산',
        when='한 번에 다 사기 어려운 고객에게 공간별 단계 투자액과 연도별 예산을 보여 주며, 한 해 예산 한도 안에 든다는 것을 보일 때',
        pv=[], sample=CUST['ED'], grp=GRP)
def _(b):
    s = header(b, EB_CO + '단계별 투자', '한 해 예산 한도 [00]억 안에서, 세 단계로 나눠 투자합니다', '강의동 → 도서관 · 라운지 → 기숙사 · [4]년 분할 · 출처: [E 대학교 예산 편성 기준, 연도]', w=1152)
    ph = [('1단계 · [2027]년', '강의동', '전자칠판 · 강의실 디스플레이', 'r4.ed-class-display', '50% 45%', '강의실 [00]실', '전자칠판 · 디스플레이 [00]대', '강의동 수업 장면 (고객 강의실로 교체)'),
          ('2단계 · [2028]년', '도서관 · 라운지', '안내 사이니지 · 비디오월 · 복합기', 'ph.ed-library', '50% 50%', '도서관 · 라운지 [0]곳', '사이니지 · 비디오월 [00]대', '도서관 열람 공간 (고객 도서관으로 교체)'),
          ('3단계 · [2029]년', '기숙사', '호실 공조 · 공용부 안내 화면', 'r4.ed-dorm', '50% 40%', '기숙사 [0]개 동', '에어컨 · 안내 화면 [000]대', '기숙사 외관 (고객 기숙사로 교체)')]
    for i, (tg, nm, d, pid, pos, q1, q2, hint) in enumerate(ph):
        x = 64 + i * 396
        s += photo(b, pid, x, 150, 360, 198, pos=pos, hint=hint, radius=12)
        s += tag_on(b, tg, x + 12, 162)
        s += label_on(b, nm, d, x + 12, 280, 336, lines=1)
        s += (f'<div style="{ab(x, 356, 360, 92, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 12px 18px; display: flex; align-items: center; gap: 16px")}">'
              + '<span style="display: flex; flex-direction: column; gap: 2px; width: 130px; flex-shrink: 0">'
              + b.tb('투자액', f'font-size: 11.5px; font-weight: 800; color: {MUTED}; white-space: nowrap') + bignum(b, '[0.0]', '억', size=32, unit_size=16) + '</span>'
              + f'<i style="width: 1px; height: 52px; background: {LINE}; flex-shrink: 0"></i>'
              + '<span style="display: flex; flex-direction: column; gap: 3px; min-width: 0">'
              + b.tb(q1, f'font-size: 14px; font-weight: 800; line-height: 20px; color: {INK}; white-space: nowrap')
              + b.tb(q2, f'font-size: 12px; line-height: 17px; color: {BODY}; white-space: nowrap') + '</span></div>')
        if i < 2: s += ARR(x + 360, 238, 36, 22, 20)
    # yearly budget chart
    s += b.tb('연도별 예산 · 억 원', ab(64, 466, 200, 18, f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    PC = [BLUE, '#7a8fd8', '#c9d3f2']
    s += (f'<div style="{ab(260, 466, 560, 18, "display: flex; align-items: center; gap: 14px; justify-content: flex-end")}">'
          + ''.join(_row(f'<i style="width: 10px; height: 10px; border-radius: 2px; background: {c}"></i>' + b.tb(t, f'font-size: 11.5px; color: {BODY}; white-space: nowrap'), 5)
                    for c, t in zip(PC, ['1단계', '2단계', '3단계']))
          + _row(f'<i style="width: 16px; height: 0; border-top: 2px dashed {WARN}"></i>' + b.tb('한 해 한도', f'font-size: 11.5px; color: {BODY}; white-space: nowrap'), 5) + '</div>')
    BY, LIM = 620, 110
    s += rect(64, BY, 756, 1, '#b8bec8')
    s += f'<div style="{ab(64, BY - LIM, 756, 0, f"border-top: 2px dashed {WARN}")}"></div>'
    s += b.tb('한 해 예산 한도 [00]억', ab(700, BY - LIM + 6, 120, 18, f'font-size: 11.5px; font-weight: 800; color: {WARN}; text-align: right; white-space: nowrap'), 'div')
    yrs = [('[2027]', [0.72, 0, 0], '[0.0]'), ('[2028]', [0.16, 0.66, 0], '[00.0]'), ('[2029]', [0, 0.22, 0.58], '[00.0]'), ('[2030]', [0, 0, 0.38], '[00.0]')]
    SC = round(LIM * 0.8)
    for k, (yl, parts, cum) in enumerate(yrs):
        cx = 150 + k * 168; y = BY
        for j, f in enumerate(parts):
            if f:
                hh = round(SC * f)
                s += rect(cx - 36, y - hh, 72, hh - (2 if j < 2 and any(parts[j + 1:]) else 0), PC[j], 0)
                y -= hh
        s += b.tb('[00.0]', ab(cx - 40, y - 22, 80, 18, f'{NUM}; font-size: 13px; font-weight: 800; line-height: 18px; color: {INK}; text-align: center; white-space: nowrap'), 'div')
        s += (f'<div style="{ab(cx - 80, BY + 6, 160, 16, "display: flex; justify-content: center; gap: 6px")}">'
              + b.tb(yl + '년', f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap')
              + b.tb('누적 ' + cum, f'{NUM}; font-size: 11.5px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')
    # summary card
    s += (f'<div style="{ab(856, 466, 360, 186, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 16px 22px; display: flex; flex-direction: column; gap: 4px")}">'
          + b.tb('세 단계 총 투자', f'font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap')
          + '<span style="display: flex; align-items: baseline; gap: 6px">' + b.tb('[00.0]', f'{NUM}; font-size: 46px; font-weight: 800; line-height: 58px; color: #ffffff; white-space: nowrap')
          + b.tb('억 · [4]년 분할', 'font-size: 16px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</span>'
          + '<span style="height: 1px; background: rgba(255,255,255,0.25); margin: 4px 0 6px"></span>'
          + b.tb('한 해 최대 [00.0]억 — 한도 [00]억 안', 'font-size: 14px; font-weight: 800; line-height: 20px; color: #ffffff; white-space: nowrap')
          + b.tb('단계마다 효과를 확인한 뒤 다음 단계 승인', f'font-size: 12.5px; line-height: 18px; color: {LT}; white-space: nowrap') + '</div>')
    s += footer(b, DEAL['ED'] + ' · 금액 · 수량은 예시 · 막대 길이는 예시 · 연도는 예산 일정에 맞춰 조정 · 사진: samsung.com 교육 도입사례 · 비즈니스 페이지', 36)
    return s


# ---------------------------------------------------------------- 5. quote summary — product cuts × qty × unit price + receipt card
@layout(L, f='L_PH_CO_D', code='PH-CO-D', p='cost', p2='bom', name='견적 요약 · 제품 컷별 수량 × 단가',
        when='제안 제품을 제품 그림으로 늘어놓고 수량 · 단가 · 소계를 보여 주며, 설치 · 소프트웨어 · 할인까지 더한 총액을 한 장에 정리할 때',
        pv=[], sample=CUST['HT'], grp=GRP)
def _(b):
    s = header(b, EB_CO + '견적 요약', '여섯 가지 제품, 한 장의 견적으로 정리했습니다', '객실 [000]실 · 로비 · 연회장 기준 · VAT 별도 · 출처: [견적서 번호, 날짜]', w=1152)
    items = [('cut.hg55bu', '객실', '호텔 TV', 'HG55BU · 객실마다 1대', '[000]대'),
             ('cut.wf4way', '객실', '무풍 에어컨', '천장 4Way 카세트 · 실내기', '[000]대'),
             ('cut.purifier', '객실', '공기청정기', '객실 · 라운지', '[000]대'),
             ('cut.qm65c', '로비', '로비 사이니지', 'QM65C · 안내 · 행사', '[00]대'),
             ('cut.km24c', '로비', '셀프 체크인 키오스크', 'KM24C · 프런트 옆', '[0]대'),
             ('cut.ifr', '연회장', '연회장 LED', '실내 LED · [000]인치급', '[0]식')]
    for k, (pid, where, nm, d, q) in enumerate(items):
        x = 64 + (k % 3) * 252; y = 150 + (k // 3) * 254
        s += box(x, y, 240, 244, SOFT, 12)
        s += cut(b, pid, x + 8, y + 8, 224, 124, hint=f'{nm} 제품 컷', pad=12, bg='#ffffff', radius=8)
        s += pill(b, where, bg=CHIP, color=BLUE, extra=f'position: absolute; left: {x + 16}px; top: {y + 16}px')
        s += b.tb(nm, ab(x + 16, y + 142, 208, 22, f'font-size: 15px; font-weight: 800; line-height: 22px; color: {INK}; white-space: nowrap'), 'div')
        s += b.tb(d, ab(x + 16, y + 164, 208, 17, f'font-size: 11.5px; line-height: 17px; color: {MUTED}; white-space: nowrap'), 'div')
        s += rect(x + 16, y + 190, 208, 1, LINE)
        s += (f'<div style="{ab(x + 16, y + 198, 208, 36, "display: flex; align-items: center; justify-content: space-between; gap: 6px")}">'
              + '<span style="display: flex; flex-direction: column; gap: 0">'
              + b.tb(q + ' × [000]만 원', f'{NUM}; font-size: 12px; font-weight: 700; line-height: 17px; color: {BODY}; white-space: nowrap')
              + b.tb('수량 × 단가', f'font-size: 10.5px; line-height: 15px; color: {FAINT}; white-space: nowrap') + '</span>'
              + b.tb('[0.0]억', f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')
    # right — room photo + receipt
    s += photo(b, 'fill.ht_room_purifier', 832, 150, 384, 176, pos='50% 45%', hint='제안 객실 장면 (고객 객실 사진으로 교체)', radius=12)
    s += tag_on(b, '한 객실에 TV · 에어컨 · 공기청정기', 844, 162)
    rows = [('제품 6종 소계', '[0.0]억', False), ('설치 · 시공', '[0.0]억', False), ('소프트웨어 · LYNK Cloud · MagicINFO', '[0.0]억', False), ('물량 할인 [00]%', '−[0.0]억', True)]
    inner = b.tb('견적 합계', f'font-size: 13px; font-weight: 800; color: {INK}; white-space: nowrap; margin-bottom: 4px')
    for k, v, neg in rows:
        inner += (f'<div style="height: 28px; box-sizing: border-box; border-bottom: 1px solid {LINE}; display: flex; align-items: center; justify-content: space-between; gap: 8px">'
                  + b.tb(k, f'font-size: 12.5px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0')
                  + b.tb(v, f'{NUM}; font-size: 14px; font-weight: 800; color: {BLUE if neg else INK}; white-space: nowrap') + '</div>')
    inner += (f'<span style="height: 0; border-top: 2px dashed #b8bec8; margin: 8px 0 4px"></span>'
              + '<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px">'
              + b.tb('총액 · VAT 별도', f'font-size: 14px; font-weight: 800; color: {INK}; white-space: nowrap')
              + bignum(b, '[00.0]', '억', size=36, unit_size=16) + '</div>'
              + f'<div style="margin-top: 10px; box-sizing: border-box; border-radius: 10px; background: {CHIP}; padding: 8px 12px; display: flex; flex-direction: column; gap: 1px">'
              + _row(b.tb('객실 1실당', f'font-size: 12px; color: {BODY}; white-space: nowrap') + b.tb('[000]만 원', f'{NUM}; font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 8)
              + _row(b.tb('[36]개월 분할 시', f'font-size: 12px; color: {BODY}; white-space: nowrap') + b.tb('월 [0,000]만 원', f'{NUM}; font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 8) + '</div>'
              + '<span style="margin-top: auto"></span>'
              + _row(evid(b, '견적 유효 [30]일') + evid(b, '분할 납부 · p.[00]'), 6))
    s += card(inner, 832, 338, 384, 314, bg='#ffffff', pad='14px 18px', gap=0, border=LINE)
    s += footer(b, DEAL['HT'] + ' · 금액은 예시 · 확정 금액은 견적서 · 세부 품목은 부록 p.[00] · 사진: samsung.com 호텔 도입사례 · 제품 컷', 37)
    return s


# ---------------------------------------------------------------- 6. monthly cost per store — pins over the store photo
@layout(L, f='L_PH_CO_E', code='PH-CO-E', p='cost', name='매장당 월 비용 · 매장 사진 위 기기 핀',
        when='구독 · 렌탈 제안에서 매장 사진 위 기기마다 월 비용을 핀으로 달고, 매장당 월 금액을 큰 숫자와 일상 비교로 쉽게 보여 줄 때',
        pv=[], sample=CUST['SV'], grp=GRP)
def _(b):
    s = header(b, EB_CO + '매장당 월 비용', '매장 하나에 한 달 [00]만 원이면 운영할 수 있습니다', '무인 매장 구독 · 기기 4종 · 설치 · 원격 관리 포함 · [36]개월 기준 · 출처: [견적서, 연도]', w=1152)
    s += photo(b, 'fill.food_kiosk', 64, 150, 524, 418, pos='22% 50%', hint='무인 매장 주문 · 메뉴 화면 (고객 매장으로 교체)', radius=12)
    s += tag_on(b, 'N 체인 표준 매장', 78, 164)
    # pins on photo
    s += pin(b, '1', 150, 330)
    s += glass(b.tb('키오스크 × [2]대', f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
               + b.tb('월 [00]만 원', 'font-size: 15px; font-weight: 800; line-height: 21px; color: #ffffff; white-space: nowrap'), 172, 352, None, None, pad='7px 12px', gap=1)
    s += pin(b, '2', 330, 214)
    s += glass(b.tb('메뉴 사이니지 × [2]대', f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap')
               + b.tb('월 [00]만 원', 'font-size: 15px; font-weight: 800; line-height: 21px; color: #ffffff; white-space: nowrap'), 352, 236, None, None, pad='7px 12px', gap=1)
    # side tiles — devices not visible in the photo
    tiles = [('3', 'cut.wf4way', '공조 · 무풍 카세트', '월 [0]만 원', '천장 에어컨 제품 컷'),
             ('4', 'fill.stp_multi', '관리 소프트웨어', '월 [0]만 원', '여러 매장 원격 관리 화면 (제안 관리 솔루션 화면으로 교체)')]
    for k, (n, pid, nm, v, hint) in enumerate(tiles):
        y = 150 + k * 214
        s += box(600, y, 160, 204, SOFT, 12)
        if pid.startswith('cut.'): s += cut(b, pid, 608, y + 8, 144, 108, hint=hint, pad=12, bg='#ffffff', radius=8)
        else: s += photo(b, pid, 608, y + 8, 144, 108, pos='50% 50%', hint=hint, radius=8)
        s += pin(b, n, 622, y + 22, size=26)
        s += b.tb(nm, ab(614, y + 126, 132, 20, f'font-size: 13.5px; font-weight: 800; line-height: 20px; color: {INK}; white-space: nowrap'), 'div')
        s += b.tb(v, ab(614, y + 150, 132, 22, f'{NUM}; font-size: 16px; font-weight: 800; line-height: 22px; color: {BLUE}; white-space: nowrap'), 'div')
        s += b.tb('기기 · 라이선스 포함' if k == 0 else '매장 화면 · 장애 알림', ab(614, y + 174, 132, 16, f'font-size: 11px; line-height: 16px; color: {MUTED}; white-space: nowrap'), 'div')
    # right — big number + comparison + included
    s += b.tb('매장당 월 구독료 · VAT 별도', ab(784, 152, 432, 18, f'font-size: 13px; font-weight: 800; color: {MUTED}; white-space: nowrap'), 'div')
    s += f'<div style="{ab(784, 186, 432, 72)}">' + bignum(b, '[00]', '만 원', size=70, unit_size=24) + '</div>'
    s += b.tb('① [00] + ② [00] + ③ [0] + ④ [0] 만 원', ab(784, 270, 432, 18, f'{NUM}; font-size: 12.5px; font-weight: 700; color: {BODY}; white-space: nowrap'), 'div')
    s += (f'<div style="{ab(784, 300, 432, 62, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 10px 18px; display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
          + b.tb('하루로 나누면', f'font-size: 11.5px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + b.tb('하루 [0,000]원 — 커피 [0]잔 값입니다', f'font-size: 16px; font-weight: 800; line-height: 23px; color: {INK}; white-space: nowrap') + '</div>')
    inc = ['기기 4종 · [36]개월 사용', '설치 · 철거 · 운반', '원격 관리 · 장애 알림', '방문 수리 [0]시간 이내', '만기 때 새 기기로 교체']
    rows = b.tb('월 요금에 포함', f'font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap; margin-bottom: 4px')
    for t in inc:
        rows += (f'<div style="height: 30px; box-sizing: border-box; border-bottom: 1px solid {LINE}; display: flex; align-items: center; gap: 10px">'
                 + b.tb('✓', f'font-size: 13px; font-weight: 800; color: {BLUE}; width: 14px')
                 + b.tb(t, f'font-size: 13.5px; font-weight: 700; color: {INK}; white-space: nowrap') + '</div>')
    s += f'<div style="{ab(784, 378, 432, 190, "display: flex; flex-direction: column")}">{rows}</div>'
    # bottom — stores × monthly
    def eq(top, val, hi=False, w=None):
        return (f'<div style="{"width: " + str(w) + "px; " if w else "flex: 1; "}min-width: 0; box-sizing: border-box; height: 52px; border-radius: 10px; background: {BLUE if hi else "#ffffff"}; '
                f'border: 1px solid {BLUE if hi else LINE}; padding: 4px 14px; display: flex; flex-direction: column; justify-content: center; gap: 0">'
                + b.tb(top, f'font-size: 11px; font-weight: 800; line-height: 15px; color: {LB if hi else MUTED}; white-space: nowrap')
                + b.tb(val, f'{NUM}; font-size: 17px; font-weight: 800; line-height: 24px; color: {"#ffffff" if hi else INK}; white-space: nowrap') + '</div>')
    op = lambda c: b.tb(c, f'font-size: 18px; font-weight: 800; color: {BLUE}; width: 18px; text-align: center; flex-shrink: 0')
    s += (f'<div style="{ab(64, 582, 1152, 70, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 9px 12px 9px 20px; display: flex; align-items: center; gap: 10px")}">'
          + '<span style="width: 140px; flex-shrink: 0; display: flex; flex-direction: column; gap: 0">'
          + b.tb('체인 전체로 보면', f'font-size: 13px; font-weight: 800; line-height: 19px; color: {INK}; white-space: nowrap')
          + b.tb('매장 수 × 월 비용', f'font-size: 11px; line-height: 16px; color: {MUTED}; white-space: nowrap') + '</span>'
          + eq('매장 수', '[000]곳') + op('×') + eq('매장당 월', '[00]만 원') + op('=') + eq('체인 월 합계', '[0.0]억 원')
          + op('→') + eq('[36]개월 총액 · 초기 비용 0원', '[00]억 원', hi=True, w=240) + '</div>')
    s += footer(b, DEAL['SV'] + ' · 금액은 예시 · 확정 금액은 견적서 · 커피 한 잔 [0,000]원 가정 · 사진: samsung.com 생활 편의 · 외식 비즈니스 페이지 · 제품 컷', 38)
    return s


# ---------------------------------------------------------------- 7. trade-in & replacement support — old (gray) → programs → new
@layout(L, f='L_PH_CO_F', code='PH-CO-F', p='cost', name='보상 · 교체 지원 · 기존 → 새 장비 사진',
        when='기존 장비 보상 · 무상 철거 · 분할 납부 같은 지원으로 교체 부담이 얼마나 줄어드는지, 지금과 교체 후 사진 사이에 보여 줄 때',
        pv=[], sample=CUST['OF'], grp=GRP)
def _(b):
    s = header(b, EB_CO + '보상 · 교체 지원', '기존 장비를 보상받고, 실 부담을 [00]% 줄입니다', '대회의실 · 사무 공간 디스플레이 · 공조 교체 · 지원 금액은 예시 · 출처: [보상 프로그램 기준, 연도]', w=1152)
    s += photo(b, 'ph.of-meeting-gray', 64, 150, 340, 306, pos='45% 50%', hint='지금 쓰는 장비 · 흑백 처리 (고객 현장 사진으로 교체)', radius=12)
    s += tag_on(b, '지금 · [0]년 사용', 76, 162)
    s += label_on(b, '기존 장비', '노후 디스플레이 · 공조 [00]대', 76, 388, 316, lines=1)
    s += photo(b, 'ph.of-meeting', 876, 150, 340, 306, pos='45% 50%', hint='교체 후 장면 (고객 현장 사진으로 교체)', radius=12)
    s += tag_on(b, '교체 후', 888, 162, dark=False)
    s += label_on(b, '새 장비', '회의실 디스플레이 · 무풍 공조', 888, 388, 316, lines=1)
    s += ARR(404, 292, 24, 22, 18) + ARR(852, 292, 24, 22, 18)
    s += b.tb('C 빌딩 교체 지원 프로그램', ab(440, 150, 400, 20, f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 'div')
    progs = [('1', '기존 장비 보상', '디스플레이 · 에어컨 [00]대 · 연식 기준', '−[0.0]억'),
             ('2', '무상 철거 · 폐기', '철거 · 운반 · 폐가전 처리 포함', '−[0.0]억'),
             ('3', '분할 납부', '[36]개월 무이자 · 첫해 부담 줄임', '월 [000]만')]
    for k, (n, t, d, v) in enumerate(progs):
        y = 178 + k * 94
        s += (f'<div style="{ab(440, y, 400, 84, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 0 18px; display: flex; align-items: center; gap: 14px")}">'
              + numtag(b, n, 28)
              + '<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px">'
              + b.tb(t, f'font-size: 16px; font-weight: 800; line-height: 23px; color: {INK}; white-space: nowrap')
              + b.tb(d, f'font-size: 12px; line-height: 17px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
              + b.tb(v, f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE}; white-space: nowrap; flex-shrink: 0') + '</div>')
    # bottom — burden bars
    s += (f'<div style="{ab(64, 474, 800, 24, "display: flex; align-items: baseline; gap: 12px")}">'
          + b.tb('실 부담 [0.0]억 → [0.0]억', f'font-size: 17px; font-weight: 800; line-height: 24px; color: {INK}; white-space: nowrap')
          + b.tb('정가 기준 대비 · 막대 길이는 예시', f'font-size: 12px; color: {MUTED}; white-space: nowrap') + '</div>')
    X0, W = 196, 560
    for k, (lab, sub) in enumerate([('정가 기준', '장비 · 설치 전체'), ('지원 후 실 부담', '보상 · 철거 반영')]):
        y = 516 + k * 66
        s += (f'<div style="{ab(64, y, 124, 40, "display: flex; flex-direction: column; justify-content: center; gap: 0")}">'
              + b.tb(lab, f'font-size: 13.5px; font-weight: 800; line-height: 20px; color: {BLUE if k else INK}; white-space: nowrap')
              + b.tb(sub, f'font-size: 11px; line-height: 16px; color: {MUTED}; white-space: nowrap') + '</div>')
    s += rect(X0, 520, W, 32, '#c3c8d1', 6)
    s += b.tb('[0.0]억', ab(X0 + W + 14, 522, 90, 28, f'{NUM}; font-size: 17px; font-weight: 800; line-height: 28px; color: {BODY}; white-space: nowrap'), 'div')
    wn, wa, wb = 380, 100, 80
    s += rect(X0, 586, wn, 32, BLUE, 6)
    s += b.tb('남는 부담', ab(X0 + 14, 588, 120, 28, f'font-size: 12.5px; font-weight: 800; line-height: 28px; color: #ffffff; white-space: nowrap'), 'div')
    for xx, ww, t in [(X0 + wn + 2, wa - 2, '보상 −[0.0]'), (X0 + wn + wa + 2, wb - 4, '철거 −[0.0]')]:
        s += b.tb(t, ab(xx, 586, ww, 32, f'box-sizing: border-box; border-radius: 6px; border: 1.5px dashed {BLUE}; background: {CHIP}; color: {BLUE}; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
    s += b.tb('[0.0]억', ab(X0 + W + 14, 588, 90, 28, f'{NUM}; font-size: 17px; font-weight: 800; line-height: 28px; color: {BLUE}; white-space: nowrap'), 'div')
    s += (f'<div style="{ab(876, 474, 340, 178, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 16px 22px; display: flex; flex-direction: column; gap: 4px")}">'
          + b.tb('실 부담', f'font-size: 13px; font-weight: 800; color: {LB}; white-space: nowrap')
          + '<span style="display: flex; align-items: baseline; gap: 8px">' + b.tb('−[00]%', f'{NUM}; font-size: 48px; font-weight: 800; line-height: 60px; color: #ffffff; white-space: nowrap')
          + b.tb('정가 대비', 'font-size: 15px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</span>'
          + '<span style="height: 1px; background: rgba(255,255,255,0.25); margin: 4px 0 6px"></span>'
          + b.tb('남은 금액은 [36]개월 분할 · 월 [000]만 원', f'font-size: 13px; font-weight: 700; line-height: 19px; color: {LT}; white-space: nowrap') + '</div>')
    s += footer(b, DEAL['OF'] + ' · 지원 금액 · 조건은 예시 · 확정은 보상 프로그램 기준 · 막대 길이는 예시 · 사진: samsung.com 오피스 도입사례 · 비즈니스 페이지', 39)
    return s
