# 사진 중심 레이아웃 · 2차 (시장 · 가치 · 효과 · 제품)
from gen_base import *
L = []
def layout(**meta):
    def deco(fn):
        b = B(); html = fn(b)
        L.append({**meta, 'html': html, '_b': b})
        return fn
    return deco


def pin(b, n, x, y, bg=BLUE, size=30):
    return b.tb(n, ab(x - size // 2, y - size // 2, size, size, f'box-sizing: border-box; border-radius: 50%; background: {bg}; color: #ffffff; border: 2px solid #ffffff; font-size: {round(size * 0.43)}px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}'), 'div')


def glass(inner, x, y, w=None, h=None, pad='10px 14px', gap=3, extra=''):
    return f'<div style="{ab(x, y, w, h, f"box-sizing: border-box; border-radius: 12px; background: {GLASS}; padding: {pad}; display: flex; flex-direction: column; gap: {gap}px; {extra}")}">{inner}</div>'


def dot_line(b, text, color=BODY, size=13):
    return (f'<span style="display: flex; gap: 8px; align-items: baseline"><i style="width: 5px; height: 5px; border-radius: 50%; background: {BLUE}; flex-shrink: 0; transform: translateY(-2px)"></i>'
            + b.tb(text, f'font-size: {size}px; line-height: 1.5; color: {color}') + '</span>')


# ---------------------------------------------------------------- market size × segment photos
@layout(f='L_PH_MS_C', code='PH-MS-C', p='market', name='시장 규모 · 세그먼트 사진', when='시장 규모 · 세그먼트 성장률을, 세그먼트마다 대표 매장 사진과 함께 보여줄 때',
        pv=['L_MS_C', 'L_MS_D', 'L_CP_C', 'L_MS_F'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · MARKET INTELLIGENCE', '가장 빠르게 크는 곳은 커피 · 디저트 매장입니다', '세그먼트별 현재 규모 × 연평균 성장률 — 사진은 세그먼트 대표 매장 · 출처: [조사 기관, 연도]', w=1152)
    s += b.img('ph.fb-cafe-bright', ab(64, 160, 560, 360), pos='50% 40%', kind='space', hint='우리 고객이 속한 세그먼트의 대표 매장 사진', radius=16)
    s += b.tb('A 커피가 속한 세그먼트', ab(80, 176, extra=f'border-radius: 999px; background: {BLUE}; color: #fff; font-size: 12px; font-weight: 800; padding: 5px 12px'), 'div')
    inner = (b.tb('성장률 1위 · 규모 2위', f'font-size: 11.5px; font-weight: 800; color: {LB}; letter-spacing: 0.03em') + b.tb('커피 · 디저트', 'font-size: 22px; font-weight: 800; color: #ffffff')
             + '<span style="display: flex; gap: 24px; margin-top: 4px">'
             + '<span style="display: flex; flex-direction: column">' + b.tb('[000]억', f'{NUM}; font-size: 28px; font-weight: 800; color: #ffffff') + b.tb('현재 시장 규모', f'font-size: 11.5px; color: {LT}') + '</span>'
             + '<span style="display: flex; flex-direction: column">' + b.tb('연 [00]%', f'{NUM}; font-size: 28px; font-weight: 800; color: {LB}') + b.tb('연평균 성장률', f'font-size: 11.5px; color: {LT}') + '</span></span>')
    s += glass(inner, 80, 384, 360, 124, pad='12px 16px')
    ins = [('1', '성장률 1위, 규모 2위', '커피 · 디저트는 연평균 [00]% 성장해 F&B 평균의 [0.0]배'),
           ('2', '가장 큰 퀵서비스는 정체', '규모는 [000]억 원으로 1위지만 성장률은 [0]%'),
           ('3', 'A 커피는 성장 구간의 중심', '세그먼트 내 매장 수 [0]위 · 교체 수요가 가장 먼저')]
    for i, (n, t, d) in enumerate(ins):
        y = 536 + i * 38
        s += (f'<div style="{ab(64, y, 560, 32, "display: flex; align-items: center; gap: 10px; min-width: 0")}">'
              + b.tb(n, f'{NUM}; width: 22px; height: 22px; border-radius: 50%; background: {CHIP}; color: {BLUE}; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0')
              + b.tb(t, 'font-size: 14px; font-weight: 800; white-space: nowrap; flex-shrink: 0') + b.tb(d, f'font-size: 12.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    segs = [('ph.fb-dt-menu', '50% 40%', '퀵서비스', '[000]억', '[0]%', 22), ('ph.fb-cafe-signage', '50% 50%', '베이커리', '[000]억', '[00]%', 58),
            ('ph.ht-restaurant', '50% 50%', '패밀리 레스토랑', '[000]억', '[0]%', 30), ('ph.sv-cu-store', '50% 50%', '편의점', '[000]억', '[00]%', 44)]
    for i, (pid, pos, nm, sz, gr, pct) in enumerate(segs):
        y = 160 + i * 126
        s += b.img(pid, ab(648, y, 188, 112), pos=pos, kind='space', hint=f'{nm} 대표 매장 사진', radius=12)
        s += (f'<div style="{ab(852, y + 4, 364, 104, "display: flex; flex-direction: column; gap: 6px")}">'
              + '<span style="display: flex; align-items: baseline; gap: 10px">' + b.tb(nm, 'font-size: 16px; font-weight: 800') + b.tb(f'규모 {sz}', f'{NUM}; font-size: 13px; font-weight: 700; color: {MUTED}') + '</span>'
              + '<span style="display: flex; align-items: center; gap: 10px">'
              + f'<span style="position: relative; flex: 1; height: 10px; border-radius: 5px; background: {LINE}"><i style="position: absolute; left: 0; top: 0; bottom: 0; width: {pct}%; border-radius: 5px; background: #8fa0d8"></i></span>'
              + b.tb(f'연 {gr}', f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}; width: 64px; text-align: right') + '</span>'
              + b.tb('막대 = 연평균 성장률 · 길이는 예시', f'font-size: 11px; color: {FAINT}') + '</div>')
        if i < 3: s += f'<div style="{ab(648, y + 119, 568, 1, f"background: {LINE}")}"></div>'
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 수치는 예시 · 사진: samsung.com 도입사례 · 공식 연출', 5)
    return root(s)


# ---------------------------------------------------------------- SWOT with a photo per quadrant
@layout(f='L_PH_CB_D', code='PH-CB-D', p='customer', name='SWOT · 사분면 현장 사진', when='SWOT을 칸마다 근거가 보이는 현장 사진과 함께, 한 장으로 정리할 때',
        pv=['L_CB_D'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · MARKET INTELLIGENCE', 'A 커피의 강점은 규모, 위협은 인건비입니다', 'SWOT — 칸마다 그 근거가 보이는 현장 사진 · 아래는 이번 제안의 방향', w=1152)
    q = [('S', '강점', '내부 · 도움', 'ph.fb-cafe-counter', '50% 45%', ['전국 320개 매장 규모의 구매 · 운영력', '매장 레이아웃 · 메뉴 구성 표준화', '멤버십 [00]만 명의 재방문 기반'], BLUE),
         ('W', '약점', '내부 · 위험', 'ph.fb-counter-menu', '50% 30%', ['메뉴 교체마다 인쇄물 재제작 · 배송', '매장별 가격 · 품절 표기 불일치', '피크 시간 카운터 대기 줄'], WARN),
         ('O', '기회', '외부 · 도움', 'ph.fb-tablet-menu', '50% 45%', ['본사 일괄 콘텐츠 운영의 보편화', '시간대별 메뉴 · 프로모션 자동 전환', '셀프 주문 · 픽업 호출 수요 확대'], BLUE),
         ('T', '위협', '외부 · 위험', 'ph.fb-dt-order', '45% 50%', ['인건비 부담 확대', '저가 브랜드의 공격적 출점', '원두 · 원재료 가격 변동성'], WARN)]
    for i, (k, t, sub, pid, pos, items, col) in enumerate(q):
        x = 64 + (i % 2) * 584; y = 156 + (i // 2) * 240
        right = i % 2 == 1
        px = x + 268 if right else x
        tx = x if right else x + 316
        s += f'<div style="{ab(x, y, 568, 228, f"box-sizing: border-box; border-radius: 16px; background: {SOFT}")}"></div>'
        s += b.img(pid, ab(px, y, 300, 228), pos=pos, kind='space', hint=f'{t} 근거 사진', radius=16)
        s += b.tb(k, ab(px + 14, y + 14, 46, 46, f'{NUM}; border-radius: 12px; background: {GLASS}; color: #ffffff; font-size: 24px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
        s += (f'<div style="{ab(tx + 18, y + 18, 220, 196, "display: flex; flex-direction: column; gap: 6px")}">'
              + '<span style="display: flex; align-items: baseline; gap: 8px">' + b.tb(t, f'font-size: 18px; font-weight: 800; color: {col}') + b.tb(sub, f'font-size: 11.5px; font-weight: 700; color: {MUTED}') + '</span>'
              + ''.join(dot_line(b, it, size=13) for it in items) + '</div>')
    s += (f'<div style="{ab(64, 630, 1152, 30, "display: flex; align-items: center; gap: 12px")}">'
          + b.tb('제안 방향', f'height: 24px; padding: 0 10px; border-radius: 999px; background: {BLUE}; color: #fff; font-size: 12px; font-weight: 800; display: inline-flex; align-items: center; flex-shrink: 0')
          + b.tb('표준화된 320개 매장(S) 위에서, 메뉴 교체 부담(W)과 인건비(T)를 디지털 메뉴보드 · 셀프 주문(O)으로 함께 줄입니다', 'font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 외식 도입사례 · 공식 연출', 6)
    return root(s)


# ---------------------------------------------------------------- comparison with criteria as photo columns
@layout(f='L_PH_CM_A', code='PH-CM-A', p='why', p2='competition', name='비교 · 기준마다 현장 사진', when='공급사 비교를, 비교 기준마다 그 기준이 중요한 현장 사진을 머리에 두고 보여줄 때',
        pv=['L_WS01', 'L_MI04', 'L_CM_B', 'L_CM_C', 'L_CP_B', 'L_CM_D', 'L_CM_E'], sample='A 커피', grp='경쟁 · 강점')
def _(b):
    s = header(b, '07 · WHY SAMSUNG', '운영까지 보면, 차이는 분명합니다', 'A 커피의 다섯 가지 기준으로 비교 — 기준마다 그 기준이 중요한 매장 장면 · ● 충족 ◐ 일부 ○ 미흡', w=1152)
    crit = [('ph.of-control-room', '50% 50%', '원격 통합 관리', '본사 한 곳에서 320개 매장'), ('ph.fb-dt-order', '45% 50%', '24시간 운영', '드라이브스루 · 심야 영업'),
            ('ph.fb-cafe-bright', '50% 40%', '프로모션 배포 속도', '시즌 메뉴 · 품절 즉시'), ('ph.svc-technician', '50% 40%', '장애 대응 · 유지보수', '전국 직영 서비스망'),
            ('ph.fb-counter-menu', '50% 30%', '초기 도입 비용', '매장당 하드웨어 · 설치')]
    rows = [('삼성전자', '이번 제안', ['●', '●', '●', '●', '◐'], True), ('공급사 A', '[자체 CMS · 서버 별도]', ['◐', '●', '○', '◐', '●'], False),
            ('공급사 B', '[3rd-party CMS 연동]', ['○', '◐', '◐', '○', '●'], False)]
    cw = 182; x0 = 254
    for j, (pid, pos, t, d) in enumerate(crit):
        x = x0 + j * (cw + 10)
        s += b.img(pid, ab(x, 160, cw, 280), pos=pos, kind='space', hint=f'기준 · {t} 장면 사진', radius=12)
        s += glass(b.tb(t, 'font-size: 14px; font-weight: 800; color: #ffffff') + b.tb(d, f'font-size: 11px; color: {LT}'), x + 8, 364, cw - 16, 66, pad='8px 10px', gap=2)
    s += (f'<div style="{ab(64, 160, 174, 280, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 16px; display: flex; flex-direction: column; gap: 8px")}">'
          + b.tb('비교 기준', f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb('A 커피가 요구사항에서 직접 꼽은 다섯 가지', 'font-size: 15px; font-weight: 800; line-height: 1.4')
          + b.tb('사진은 기준마다 그 기준이 드러나는 매장 장면입니다', f'font-size: 12px; line-height: 1.5; color: {MUTED}; margin-top: auto') + '</div>')
    for i, (nm, d, marks, hi) in enumerate(rows):
        y = 452 + i * 62
        if hi: s += f'<div style="{ab(64, y, 1152, 56, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; border: 1.5px solid {BLUE}")}"></div>'
        else: s += f'<div style="{ab(64, y + 56, 1152, 1, f"background: {LINE}")}"></div>'
        s += (f'<div style="{ab(80, y + 8, 160, 42, "display: flex; flex-direction: column; justify-content: center; gap: 1px")}">'
              + b.tb(nm, f'font-size: 15px; font-weight: 800; color: {BLUE if hi else INK}') + b.tb(d, f'font-size: 11px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        for j, mk in enumerate(marks):
            x = x0 + j * (cw + 10)
            s += b.tb(mk, ab(x, y + 8, cw, 40, f'display: flex; align-items: center; justify-content: center; font-size: 24px; color: {BLUE if hi else "#7c8597"}'), 'div')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 비교 출처: [공개 자료, 연도] · 확정 전 검증 필요 · 공급사 익명', 24)
    return root(s)


# ---------------------------------------------------------------- findings → implications → direction
@layout(f='L_PH_IM_A', code='PH-IM-A', p='insight', name='발견 4 → 시사점 → 방향 · 사진', when='시장 · 고객 · 사용자 · 경쟁에서 찾은 것을 사진으로 짚고, 시사점과 제안 방향으로 모을 때',
        pv=['L_IM_A', 'L_IM_B'], sample='A 커피', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · MARKET INTELLIGENCE', '시장 분석이 가리키는 이번 제안의 방향', '발견 넷 → 시사점 둘 → 제안 방향 하나 — 발견마다 그 근거가 보이는 장면', w=1152)
    f4 = [('ph.fb-cafe-bright', '50% 40%', '시장', '메뉴보드 시장, 연 [00]% 성장'), ('ph.fb-counter-menu', '50% 30%', '고객사', '메뉴 교체 한 번에 다섯 단계 · [00]일'),
          ('ph.fb-pickup', '50% 35%', '사용자', '메뉴 탐색 · 픽업 대기에서 머뭇거림'), ('ph.of-control-room', '50% 50%', '경쟁', '원격 운영까지 갖춘 공급사는 소수')]
    for i, (pid, pos, k, t) in enumerate(f4):
        x = 64 + i * 293
        s += b.img(pid, ab(x, 156, 275, 248), pos=pos, kind='space', hint=f'발견 · {k} 근거 사진', radius=14)
        s += b.tb(f'발견 · {k}', ab(x + 10, 166, extra=f'border-radius: 999px; background: {GLASS}; color: #fff; font-size: 12px; font-weight: 800; padding: 5px 11px'), 'div')
        s += b.tb(t, ab(x, 412, 275, extra='font-size: 15px; font-weight: 800; line-height: 1.4'), 'div')
    imp = [('시사점 1', '메뉴는 본사에서 한 번에 바꿔야 합니다', '교체 비용과 가격 불일치를 함께 해결', ['시장', '고객사']),
           ('시사점 2', '화면이 손님의 선택을 도와야 합니다', '추천 메뉴 · 픽업 호출로 머뭇거림 해소', ['사용자', '경쟁'])]
    for i, (k, t, d, ev) in enumerate(imp):
        x = 64 + i * 586
        s += (f'<div style="{ab(x, 462, 566, 100, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 12px 18px; display: flex; flex-direction: column; gap: 5px")}">'
              + '<span style="display: flex; align-items: center; gap: 8px">' + b.tb(k, f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb('근거', f'font-size: 11px; color: {FAINT}; margin-left: auto')
              + ''.join(chip(b, e, size=11, h=20) for e in ev) + '</span>'
              + b.tb(t, 'font-size: 17px; font-weight: 800') + b.tb(d, f'font-size: 13px; color: {BODY}') + '</div>')
    s += f'<svg style="{ab(628, 566, 24, 20)}" viewBox="0 0 24 20" fill="none" stroke="{BLUE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l7 8 7-8"/></svg>'
    s += (f'<div style="{ab(64, 590, 1152, 58, f"box-sizing: border-box; border-radius: 14px; background: {BLUE}; padding: 0 22px; display: flex; align-items: center; gap: 16px")}">'
          + b.tb('제안 방향', f'font-size: 12px; font-weight: 800; letter-spacing: 0.06em; color: {LB}; flex-shrink: 0')
          + b.tb('320개 매장을 한 번에 운영하는 디지털 메뉴보드', 'font-size: 20px; font-weight: 800; color: #ffffff') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 외식 도입사례 · 공식 연출', 9)
    return root(s)


# ---------------------------------------------------------------- VOC with the scene where it happens
@layout(f='L_PH_US_D', code='PH-US-D', p='user', name='VOC · 불만 장면 사진 + 원문', when='리뷰 · VOC에서 많이 나온 불만을, 그 불만이 생기는 장면 사진과 대표 원문, 대응 제품으로 보여줄 때',
        pv=['L_US_D', 'L_QA_A'], sample='D 리테일', grp='분석 · 이해')
def _(b):
    s = header(b, '01 · MARKET INTELLIGENCE', '손님의 불만은 ‘기다림’과 ‘찾기’에 몰려 있습니다', '리뷰 [0,000]건 · 상위 키워드 셋 — 불만이 생기는 장면, 대표 원문(익명), 대응 제품', w=1152)
    s += (f'<div style="{ab(64, 150, 1152, 26, "display: flex; align-items: center; gap: 10px")}">'
          + b.tb('전체 감성', f'font-size: 12px; font-weight: 800; color: {MUTED}; flex-shrink: 0')
          + '<span style="flex: 1; display: flex; height: 12px; border-radius: 6px; overflow: hidden">' + f'<i style="width: 38%; background: #8fa0d8"></i><i style="width: 22%; background: {LINE}"></i><i style="width: 40%; background: #e3a48a"></i></span>'
          + b.tb('긍정 [00]% · 중립 [00]% · 부정 [00]%', f'{NUM}; font-size: 12px; font-weight: 700; color: {MUTED}; flex-shrink: 0') + '</div>')
    cols = [('ph.fb-pos-pay', '50% 40%', '기다림', '계산 대기', '[000]', '“계산하려고 [00]분을 줄 섰어요. 셀프 계산대가 있었으면.”', '셀프 결제 키오스크'),
            ('ph.rt-shoppers', '50% 40%', '찾기', '재고 문의', '[000]', '“원하는 사이즈가 있는지 직원 찾기가 어려웠어요.”', '재고 조회 사이니지'),
            ('ph.rt-atrium-kiosk', '50% 60%', '찾기', '위치 찾기', '[000]', '“2층 어디에 있는지 한참 헤맸어요.”', '층별 안내 키오스크')]
    for i, (pid, pos, grp, kw, n, q, prop) in enumerate(cols):
        x = 64 + i * 392
        s += b.img(pid, ab(x, 190, 368, 248), pos=pos, kind='people', hint=f'{kw} 장면 사진', radius=14)
        s += (f'<span style="{ab(x + 10, 200, extra="display: flex; gap: 6px")}">' + b.tb(grp, f'border-radius: 999px; background: {WARN}; color: #fff; font-size: 11.5px; font-weight: 800; padding: 4px 10px')
              + b.tb(f'{kw} · {n}건', f'{NUM}; border-radius: 999px; background: {GLASS}; color: #fff; font-size: 11.5px; font-weight: 800; padding: 4px 10px') + '</span>')
        s += (f'<div style="{ab(x, 450, 368, 120, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb(q, 'font-size: 15px; font-weight: 700; line-height: 1.5') + b.tb('[플랫폼] · [0000.00] · 익명 · 원문 예시', f'font-size: 11px; color: {FAINT}; margin-top: auto') + '</div>')
        s += (f'<div style="{ab(x, 582, 368, 40, f"box-sizing: border-box; border-radius: 10px; border: 1.5px solid {BLUE}; padding: 0 14px; display: flex; align-items: center; gap: 10px")}">'
              + b.tb('제안', f'font-size: 11.5px; font-weight: 800; color: {BLUE}') + b.tb(prop, 'font-size: 14px; font-weight: 800') + '</div>')
    s += footer(b, 'D 리테일 플래그십 · 매장 경험 리뉴얼 제안 · 수집: [플랫폼] · [기간] · 사진: samsung.com 도입사례 · 공식 연출', 8)
    return root(s)


# ---------------------------------------------------------------- field questions with the scene they come from
@layout(f='L_PH_VP_U', code='PH-VP-U', p='value', name='현장 질문 3 · 질문이 나온 자리 사진', when='현장에서 자주 듣는 질문 셋에, 질문이 나온 자리 사진과 답하는 제품 · 핵심 가치로 답할 때',
        pv=['L_VP_U', 'L_VP_U_HT', 'L_VP_U_MD', 'L_VP_E'], sample='A 커피', grp='과제 · 가치', prods=['qm55c', 'kiosk'], sols=['magicinfo', 'stpro'])
def _(b):
    s = header(b, '02 · VALUE PROPS · 현장 질문', '카페 매장에서 자주 듣는 질문 셋, 이렇게 답합니다', '질문은 요구사항 · 현장 인터뷰에서 그대로 — 질문이 나온 자리, 답하는 제품, 핵심 가치', w=1152)
    qs = [('Q1', '본사 운영팀', '“신메뉴가 나올 때마다 메뉴판을 다시 뽑아야 하나요?”', 'ph.rt-staff-tablet', '50% 40%', 'cut.qm55c', 'QM55C + MagicINFO', '메뉴보드 · 콘텐츠 원격 관리', '본사가 바꾸면 전 매장이 같은 날 바뀝니다', ['#인쇄 · 배송 0', '#원격 배포']),
          ('Q2', '점장', '“점심 피크에 주문 줄이 너무 길어요”', 'ph.fb-cafe-counter', '40% 50%', 'cut.km24c', 'KM24C', '셀프 주문 키오스크', '주문은 나눠 받고, 카운터는 음료에 집중', ['#셀프 주문', '#대기 단축']),
          ('Q3', '가맹점주', '“여름만 되면 전기요금이 부담돼요”', 'ph.fb-lounge-ac', '55% 35%', 'cut.wf4way', 'SmartThings Pro', '에너지 관리 · 냉난방 스케줄', '영업시간에만, 필요한 만큼 냉방', ['#스케줄 운전', '#사용량 확인'])]
    for i, (q, who, quote, pid, pos, cut, prod, pd, val, tags) in enumerate(qs):
        x = 64 + i * 392
        s += b.img(pid, ab(x, 156, 368, 262), pos=pos, kind='space', hint=f'{q} 질문이 나온 자리 사진', radius=14)
        s += glass('<span style="display: flex; align-items: center; gap: 8px">' + b.tb(q, f'{NUM}; font-size: 12px; font-weight: 800; color: {LB}') + b.tb(who, f'font-size: 12px; font-weight: 700; color: {LT}') + '</span>'
                   + b.tb(quote, 'font-size: 15px; font-weight: 800; line-height: 1.45; color: #ffffff'), x + 10, 316, 348, 92, pad='10px 14px')
        s += b.img(cut, ab(x, 432, 84, 72), fit='contain', kind='cut', hint=f'{prod} 제품 컷', pad=8, bg=SOFT, radius=10)
        s += (f'<div style="{ab(x + 96, 436, 272, 66, "display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
              + b.tb('답하는 제품 · 솔루션', f'font-size: 11px; font-weight: 700; color: {MUTED}') + b.tb(prod, 'font-size: 16px; font-weight: 800') + b.tb(pd, f'font-size: 12px; color: {BODY}') + '</div>')
        s += (f'<div style="{ab(x, 516, 368, 112, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb('핵심 가치', f'font-size: 11.5px; font-weight: 800; color: {BLUE}') + b.tb(val, 'font-size: 16px; font-weight: 800; line-height: 1.4')
              + '<span style="display: flex; gap: 6px; margin-top: auto">' + ''.join(b.tb(t, f'font-size: 12px; font-weight: 700; color: {BLUE}') for t in tags) + '</span></div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 질문은 본사 · 매장 인터뷰에서 · 사진: samsung.com 도입사례', 6)
    return root(s)


# ---------------------------------------------------------------- same spot, before → after
@layout(f='L_PH_VP_L', code='PH-VP-L', p='value', name='같은 자리 · 도입 전 → 후 사진', when='같은 공간에서 제품 하나만 바꿔도 운영이 달라지는 것을, 전후 사진 두 장과 세 가지 변화로',
        pv=['L_VP_L'], sample='A 커피', grp='과제 · 가치', prods=['qm55c'], sols=['magicinfo'])
def _(b):
    s = header(b, '02 · VALUE PROPS', '같은 카운터, 메뉴판만 바꿨을 뿐인데 운영이 달라집니다', '바뀌는 건 화면이 아니라 일하는 방식 — 본사가 바꾸고, 매장은 손님만 봅니다', w=1152)
    s += b.img('ph.fb-counter-gray', ab(64, 156, 556, 292), pos='50% 30%', kind='space', hint='도입 전 · 지금 매장 사진 (고객 매장 사진으로 교체)', radius=16)
    s += b.img('ph.fb-counter-menu', ab(660, 156, 556, 292), pos='50% 30%', kind='space', hint='도입 후 · 같은 자리 사진', radius=16)
    s += b.tb('지금 · 인쇄 메뉴판', ab(78, 170, extra=f'border-radius: 999px; background: {GLASS}; color: #fff; font-size: 12.5px; font-weight: 800; padding: 5px 12px'), 'div')
    s += b.tb('도입 후 · QM55C × 3 + MagicINFO', ab(674, 170, extra=f'border-radius: 999px; background: {BLUE}; color: #fff; font-size: 12.5px; font-weight: 800; padding: 5px 12px'), 'div')
    s += f'<div style="{ab(620, 280, 40, 40, f"border-radius: 50%; background: #ffffff; border: 2px solid {BLUE}; box-sizing: border-box")}"></div>'
    s += f'<svg style="{ab(628, 288, 24, 24)}" viewBox="0 0 24 24" fill="none" stroke="{BLUE}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
    rows = [('메뉴 교체', '공문 → 인쇄 → 배송 → 교체, [0]일', '본사 예약 한 번, 전 매장 동시', '[00]분'),
            ('가격 표기', '매장마다 달라 수정 스티커로 덧붙임', 'POS와 연동해 모든 매장이 같은 값', '오류 0'),
            ('품절 안내', '직원이 주문받을 때마다 말로', '다 떨어지면 화면에서 자동으로 흐리게', '문의 ↓')]
    for i, (k, a, c, kp) in enumerate(rows):
        y = 468 + i * 58
        s += f'<div style="{ab(64, y + 52, 1152, 1, f"background: {LINE}")}"></div>'
        s += b.tb(k, ab(64, y + 14, 130, extra='font-size: 15px; font-weight: 800'), 'div')
        s += b.tb(a, ab(200, y + 15, 400, extra=f'font-size: 14px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
        s += b.tb(c, ab(660, y + 14, 420, extra='font-size: 14.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
        s += b.tb(kp, ab(1096, y + 11, 120, 28, f'{NUM}; border-radius: 999px; background: {CHIP}; color: {BLUE}; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례(말리커피) · 왼쪽은 흑백 처리한 자리 표시', 9)
    return root(s)


# ---------------------------------------------------------------- payback with an after photo
@layout(f='L_PH_EF_B', code='PH-EF-B', p='effect', name='투자 회수 · 도입 후 사진 + 누적 차트', when='회수 기간 · 누적 효과 · TCO를, 도입 후 현장 사진 위 숫자와 누적 막대로 보여줄 때',
        pv=['L_EF_B', 'L_EF_F', 'L_EF_G', 'L_EF_H', 'L_CO_B'], sample='A 커피', grp='효과 · 근거')
def _(b):
    s = header(b, '02 · VALUE PROPS', '[00]개월이면 투자비를 회수합니다', '누적 투자비와 누적 절감액 · 도입 후 36개월 · 예상치 (유사 사례 기준)', w=1152)
    s += b.img('ph.fb-cafe-counter', ab(64, 156, 548, 492), pos='40% 50%', kind='space', hint='도입 후 매장 사진', radius=16)
    inner = (b.tb('투자 회수 시점', f'font-size: 12px; font-weight: 800; color: {LB}') + b.tb('[00]개월', f'{NUM}; font-size: 44px; font-weight: 800; color: #ffffff; line-height: 1.1')
             + '<span style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 8px">'
             + ''.join('<span style="display: flex; flex-direction: column; gap: 1px">' + b.tb(v, f'{NUM}; font-size: 20px; font-weight: 800; color: #ffffff') + b.tb(k, f'font-size: 11px; color: {LT}') + '</span>'
                       for v, k in [('[0.0]억', '초기 투자'), ('[0.0]억', '연간 절감'), ('[0.0]억', '3년 순효과')]) + '</span>')
    s += glass(inner, 80, 452, 516, 180, pad='14px 18px')
    # chart
    s += b.tb('누적 금액 (억 원)', ab(640, 160, extra=f'font-size: 12px; font-weight: 700; color: {MUTED}'), 'div')
    bx, by, bw, bh = 640, 186, 576, 300
    s += f'<div style="{ab(bx, by + bh, bw, 1, f"background: {INK}")}"></div>'
    inv = 0.62
    s += f'<div style="{ab(bx, round(by + bh * (1 - inv)), bw, 0, f"border-top: 2px dashed {WARN}")}"></div>'
    s += b.tb('초기 투자 [0.0]억', ab(bx, round(by + bh * (1 - inv)) - 22, 200, extra=f'font-size: 11.5px; font-weight: 800; color: {WARN}'), 'div')
    vals = [0.06, 0.18, 0.33, 0.48, 0.64, 0.80, 0.95]
    for i, v in enumerate(vals):
        x = bx + 18 + i * 80; h = round(bh * v)
        s += f'<div style="{ab(x, by + bh - h, 44, h, f"border-radius: 6px 6px 0 0; background: {BLUE if v >= inv else "#aab6e2"}")}"></div>'
        s += b.tb(str(i * 6), ab(x - 8, by + bh + 8, 60, extra=f'{NUM}; font-size: 12px; color: {MUTED}; text-align: center'), 'div')
    s += b.tb('회수 · [00]개월', ab(bx + 18 + 4 * 80 - 30, round(by + bh * (1 - 0.64)) - 34, 104, 26, f'border-radius: 999px; background: {BLUE}; color: #fff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
    s += b.tb('가로축 · 도입 후 경과 개월 · 막대 = 누적 절감액 · 수치는 예시', ab(bx, by + bh + 32, bw, extra=f'font-size: 11.5px; color: {FAINT}'), 'div')
    s += (f'<div style="{ab(640, 556, 576, 92, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 12px 16px; display: flex; flex-direction: column; gap: 4px")}">'
          + b.tb('가정', f'font-size: 11.5px; font-weight: 800; color: {BLUE}')
          + b.tb('320개 매장 · 유지보수 [0]년 포함 · 할인율 미적용', f'font-size: 13px; color: {BODY}')
          + b.tb('절감 항목 — 인쇄 · 배송 · 교체 인력 · 전력 · 산출 근거는 부록', f'font-size: 13px; color: {BODY}') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 수치는 예시 · 사진: samsung.com 도입사례(말리커피)', 12)
    return root(s)


# ---------------------------------------------------------------- ESG full-bleed
@layout(f='L_PH_EF_I', code='PH-EF-I', p='effect', name='ESG · 탄소 감축 · 풀블리드 사진', when='전력 절감을 탄소 감축 · 생활 속 환산으로 바꿔, 건물 · 설비 사진 한 장 위에 크게 보여줄 때',
        pv=['L_EF_I'], sample='R 건설', grp='효과 · 근거')
def _(b):
    s = b.img('ph.of-rooftop-odu', ab(0, 0, 1280, 720), pos='50% 50%', kind='space', hint='건물 · 설비 전경 사진 (풀블리드)')
    s += f'<div style="{ab(0, 0, 700, 720, f"background: {GLASS}")}"></div>'
    s += header(b, '02 · VALUE PROPS · ESG', '줄인 전기는 해마다 탄소 [000]톤입니다', '전력 절감 → 탄소 감축 → 생활 속 환산 · 배출계수 [기관 · 연도]', w=600, dark=True)
    steps = [('전력 절감', '[000]', 'MWh/년'), ('배출계수', '[0.000]', 'tCO₂/MWh'), ('탄소 감축', '[000]', 'tCO₂e/년')]
    for i, (k, v, u) in enumerate(steps):
        x = 64 + i * 206
        s += (f'<div style="{ab(x, 176, 180, 112, "box-sizing: border-box; border-radius: 12px; border: 1px solid rgba(255,255,255,0.28); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px")}">'
              + b.tb(k, f'font-size: 12px; font-weight: 800; color: {LB}') + b.tb(v, f'{NUM}; font-size: 32px; font-weight: 800; color: #ffffff') + b.tb(u, f'{NUM}; font-size: 12px; color: {LT}') + '</div>')
        if i < 2: s += b.tb('×' if i == 0 else '=', ab(x + 180, 214, 26, 30, f'font-size: 22px; font-weight: 800; color: {LB}; text-align: center'), 'div')
    s += b.tb('생활 속 환산', ab(64, 314, extra=f'font-size: 12px; font-weight: 800; color: {LB}'), 'div')
    for i, (v, k) in enumerate([('[0,000]그루', '소나무가 1년 동안 흡수하는 양'), ('[000]대', '승용차 1년 운행을 멈춘 효과')]):
        x = 64 + i * 310
        s += (f'<div style="{ab(x, 338, 290, 70, "display: flex; flex-direction: column; gap: 2px")}">' + b.tb(v, f'{NUM}; font-size: 28px; font-weight: 800; color: #ffffff') + b.tb(k, f'font-size: 12.5px; color: {LT}') + '</div>')
    s += b.tb('5년 누적 탄소 감축 (tCO₂e)', ab(64, 428, extra=f'font-size: 12px; font-weight: 800; color: {LB}'), 'div')
    for i in range(5):
        w = 110 + i * 90
        s += f'<div style="{ab(64, 454 + i * 30, w, 20, "border-radius: 4px; background: rgba(157,180,255,0.75)")}"></div>'
        s += b.tb(f'{i + 1}년차 · [0,000]', ab(64 + w + 10, 454 + i * 30, 160, 20, f'{NUM}; font-size: 12px; font-weight: 700; color: #ffffff; display: flex; align-items: center'), 'div')
    s += b.tb('연결되는 항목 — 녹색건축 인증 · 제로에너지건축물 · ESG 보고서 · 입주민 앱 (반영 범위는 확정 필요)', ab(64, 616, 600, extra=f'font-size: 12px; line-height: 1.5; color: {LT}'), 'div')
    s += footer(b, 'R 건설 · 단지 스마트홈 제안 · 배출계수 · 환산 기준 확정 필요 · 사진: samsung.com 도입사례', 15, dark=True)
    return root(s, bg='#0f131c', color='#ffffff')


# ---------------------------------------------------------------- one product: install photo + numbers
@layout(f='L_PH_P1_C', code='PH-P1-C', p='products', name='한 제품 · 설치 사진 + 숫자', when='제품 하나를, 실제 설치된 모습과 이 자리에 필요한 숫자 넷으로 설명할 때',
        pv=['L_P1C', 'L_P1D', 'L_SPEC1', 'L_SD_B'], sample='A 커피', grp='공간 · 제품', pc=1, prods=['qm55c'], sols=['magicinfo'])
def _(b):
    s = header(b, '04 · 공간별 제품 — B 카운터', 'Smart Signage QM55C — 숫자로 보는 선택 이유', '카운터 상단 3연 · 매장당 3대 · 960대 — 설치된 모습과 이 자리에 필요한 숫자', w=1152)
    s += b.img('ph.fb-counter-menu', ab(64, 156, 600, 492), pos='55% 35%', kind='insitu', hint='설치 장면 사진', radius=16)
    s += glass(b.tb('설치 위치', f'font-size: 11px; font-weight: 800; color: {LB}') + b.tb('카운터 상단 3연 · 매장당 3대', 'font-size: 16px; font-weight: 800; color: #ffffff'), 80, 572, 340, 62)
    s += b.img('cut.qm55c', ab(688, 156, 216, 136), fit='contain', kind='cut', hint='QM55C 제품 컷', pad=14, bg=SOFT, radius=12)
    s += (f'<div style="{ab(920, 166, 296, 116, "display: flex; flex-direction: column; justify-content: center; gap: 3px")}">'
          + b.tb('Smart Signage · 55"', f'font-size: 12px; font-weight: 700; color: {MUTED}') + b.tb('QM55C', f'{NUM}; font-size: 30px; font-weight: 800') + b.tb('24시간 상업용 4K 사이니지', f'font-size: 13px; color: {BODY}') + '</div>')
    nums = [('500', 'nit', '밝기', '조명 아래 카운터에서도 선명'), ('24/7', '', '운영 시간', '오픈부터 마감까지 끄지 않음'), ('4K', 'UHD', '해상도', '메뉴 사진 · 가격이 또렷'), ('55', '"', '화면 크기', '3연으로 카운터 폭에 맞춤')]
    for i, (v, u, k, d) in enumerate(nums):
        x = 688 + (i % 2) * 272; y = 308 + (i // 2) * 116
        s += (f'<div style="{ab(x, y, 256, 104, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px")}">'
              + b.tb(k, f'font-size: 11.5px; font-weight: 800; color: {MUTED}')
              + '<span style="display: flex; align-items: baseline; gap: 4px">' + b.tb(v, f'{NUM}; font-size: 30px; font-weight: 800; color: {BLUE}') + b.tb(u, f'{NUM}; font-size: 14px; font-weight: 700; color: {BLUE}') + '</span>'
              + b.tb(d, f'font-size: 12.5px; color: {BODY}') + '</div>')
    specs = [('소비전력', '[000] W'), ('OS · 플레이어', 'Tizen · 내장'), ('관리 솔루션', 'MagicINFO'), ('무게', '[00.0] kg')]
    s += f'<div style="{ab(688, 548, 528, 100, "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; row-gap: 0")}">'
    for k, v in specs:
        s += (f'<span style="display: flex; justify-content: space-between; align-items: center; height: 44px; border-bottom: 1px solid {LINE}">'
              + b.tb(k, f'font-size: 13px; color: {MUTED}') + b.tb(v, f'{NUM}; font-size: 13.5px; font-weight: 800') + '</span>')
    s += '</div>'
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례(말리커피) · 제품 컷: samsung.com', 14)
    return root(s)


# ---------------------------------------------------------------- two products VS, each in its place
@layout(f='L_PH_P2_C', code='PH-P2-C', p='products', name='두 제품 VS · 각자의 자리 사진', when='두 후보 제품을, 각각 어울리는 자리 사진과 같은 줄의 사양 비교로 고르게 할 때',
        pv=['L_P2C'], sample='A 커피', grp='공간 · 제품', pc=2, prods=['qm55c', 'qb55c'])
def _(b):
    s = header(b, '04 · 공간별 제품 — B 카운터', 'QM55C와 QB55C, 카운터에는 무엇이 맞을까', '같은 55", 다른 자리 — 파란 값이 이 공간에 유리한 쪽입니다', w=1152)
    sides = [('추천', 'QM55C', 'Smart Signage · 55"', 'ph.fb-counter-menu', '50% 30%', '24시간 영업 매장의 카운터', 'cut.qm55c', 64, True),
             ('대안', 'QB55C', 'Smart Signage · 55"', 'ph.of-lounge-tv', '70% 40%', '영업시간이 짧은 라운지 · 사무 공간', 'cut.qb55c', 660, False)]
    for tag, m, sub, pid, pos, place, cut, x, hi in sides:
        s += b.img(pid, ab(x, 156, 556, 250), pos=pos, kind='insitu', hint=f'{m}이 어울리는 자리 사진', radius=16)
        s += b.img(cut, ab(x + 14, 286, 150, 106), fit='contain', kind='cut', hint=f'{m} 제품 컷', pad=10, bg='#ffffff', radius=10)
        s += glass('<span style="display: flex; align-items: center; gap: 8px">' + b.tb(tag, f'border-radius: 999px; background: {BLUE if hi else "#596170"}; color: #fff; font-size: 11px; font-weight: 800; padding: 2px 8px') + b.tb(m, f'{NUM}; font-size: 20px; font-weight: 800; color: #ffffff') + '</span>'
                   + b.tb(place, f'font-size: 12px; color: {LT}'), x + 178, 324, 364, 68, pad='8px 14px')
    s += b.tb('VS', ab(612, 254, 56, 56, f'{NUM}; border-radius: 50%; background: {INK}; color: #ffffff; border: 3px solid #ffffff; box-sizing: border-box; font-size: 17px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
    rows = [('밝기', '500 nit', '350 nit', 0), ('운영 시간', '24/7', '16/7', 0), ('해상도', '4K UHD', '4K UHD', None), ('소비전력', '[000] W', '[000] W', None), ('가격대', '[₩]', '[₩]', 1)]
    for i, (k, a, c, win) in enumerate(rows):
        y = 422 + i * 38
        s += f'<div style="{ab(64, y + 37, 1152, 1, f"background: {LINE}")}"></div>'
        s += b.tb(a, ab(64, y + 6, 520, 26, f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE if win == 0 else INK}; text-align: right'), 'div')
        s += b.tb(k, ab(596, y + 9, 88, 22, f'font-size: 12.5px; font-weight: 700; color: {MUTED}; text-align: center'), 'div')
        s += b.tb(c, ab(696, y + 6, 520, 26, f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE if win == 1 else INK}'), 'div')
    s += (f'<div style="{ab(64, 616, 1152, 40, f"box-sizing: border-box; border-radius: 10px; background: {CHIP}; padding: 0 16px; display: flex; align-items: center; gap: 12px")}">'
          + b.tb('결론', f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb('카운터 상단은 QM55C — 24시간 영업과 조명 아래 밝기가 결정합니다', 'font-size: 14.5px; font-weight: 800') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례 · 제품 컷: samsung.com', 15)
    return root(s)


# ---------------------------------------------------------------- five products with install photos
@layout(f='L_PH_P5_A', code='PH-P5-A', p='products', name='제품 5 · 설치 장면 5열', when='한 매장에 들어가는 다섯 제품을, 설치 장면 사진과 위치 · 수량으로 한 줄에 보여줄 때',
        pv=['L_P5A', 'L_P5C', 'L_P5D', 'L_SPEC5', 'L_P_T'], sample='A 커피', grp='공간 · 제품', pc=5, prods=['qm55c', 'qm65c', 'qm43c', 'kiosk'])
def _(b):
    s = header(b, '04 · 공간별 제품 — 표준 매장 전체', '표준 매장 한 곳에 들어가는 다섯 가지 제품', '설치 장면 · 제품 · 위치 · 수량 — 사진은 같은 업종 도입사례', w=1152)
    ps = [('ph.fb-counter-menu', '45% 30%', 'cut.qm55c', '사이니지', 'QM55C', '55" · 500nit · 4K', '카운터 메인 메뉴보드', '카운터', '×3'),
          ('ph.fb-dt-order', '40% 50%', 'cut.oh55a', '옥외', 'OH55A-S', '55" · 고휘도 · 옥외', '드라이브스루 · 외부 메뉴', '외벽', '×2'),
          ('ph.vn-cinema-kiosk', '50% 40%', 'cut.km24c', '키오스크', 'KM24C', '24" · 터치 · 결제', '셀프 주문', '대기열', '×1'),
          ('ph.fb-cafe-signage', '50% 40%', 'cut.qm65c', '사이니지', 'QM65C', '65" · 500nit · 4K', '대기 공간 프로모션', '대기 벽면', '×1'),
          ('ph.fb-pickup', '50% 30%', 'cut.qm43c', '사이니지', 'QM43C', '43" · 500nit', '픽업 번호 호출', '픽업대', '×1')]
    for i, (pid, pos, cut, cat, m, sp, use, place, q) in enumerate(ps):
        x = 64 + i * 234
        s += b.img(pid, ab(x, 156, 218, 300), pos=pos, kind='insitu', hint=f'{m} 설치 장면 사진', radius=14)
        s += b.img(cut, ab(x + 10, 376, 92, 70), fit='contain', kind='cut', hint=f'{m} 제품 컷', pad=7, bg='#ffffff', radius=10)
        s += b.tb(q, ab(x + 146, 398, 62, 44, f'{NUM}; border-radius: 10px; background: {BLUE}; color: #ffffff; font-size: 20px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
        s += (f'<div style="{ab(x, 470, 218, 170, "display: flex; flex-direction: column; gap: 4px")}">'
              + chip(b, cat, size=11, h=20) + b.tb(m, f'{NUM}; font-size: 20px; font-weight: 800; margin-top: 2px') + b.tb(sp, f'font-size: 12px; color: {MUTED}')
              + b.tb(use, 'font-size: 14px; font-weight: 700; margin-top: 6px') + b.tb(f'위치 · {place}', f'font-size: 12.5px; color: {BODY}') + '</div>')
    s += b.tb('매장당 8대 · 사진은 설치 예시 (고객 매장 사진으로 교체)', ab(64, 636, 1152, extra=f'font-size: 12px; color: {FAINT}'), 'div')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례 · 제품 컷: samsung.com', 18)
    return root(s)


# ---------------------------------------------------------------- site conditions pinned on a photo
@layout(f='L_PH_P_K', code='PH-P-K', p='products', name='공간 조건 → 대응 · 사진 위 번호', when='설치 공간의 조건(빛 · 온도 · 비 · 시간 · 거리)을 사진 위 번호로 짚고, 제품의 대응을 나란히',
        pv=['L_P_K', 'L_P_E', 'L_P_F', 'L_P_H', 'L_P_J'], sample='A 커피', grp='공간 · 제품')
def _(b):
    s = header(b, '04 · 공간별 제품 — 드라이브스루 · 외부', '드라이브스루는 실내와 조건이 다릅니다 — 다섯 조건, 다섯 대응', '사진 위 번호 = 조건이 생기는 자리 · 현장 값은 실측 후 기입', w=1152)
    s += b.img('ph.fb-dt-order', ab(64, 156, 560, 492), pos='60% 50%', kind='space', hint='설치 공간 사진 (조건이 보이게)', radius=16)
    for n, x, y in [('1', 458, 76), ('2', 92, 214), ('3', 392, 452), ('4', 250, 170), ('5', 520, 300)]:
        s += pin(b, n, 64 + x, 156 + y)
    rows = [('한낮 직사광', '오후 해가 화면 정면으로 · [00,000] lux', '고휘도 + 자동 밝기', '한낮에도 메뉴가 바래 보이지 않게'),
            ('여름 · 겨울 외기', '외벽 복사열 · 새벽 한파 · [00]℃ / -[00]℃', '동작 온도 [-00~00]℃ · 냉각 설계', '폭염 · 한파에도 화면 유지'),
            ('비 · 먼지 · 물보라', '지붕 없는 차로 옆 · 상시 노출', 'IP56 방진 · 방수', '비 오는 날도 그대로 운영'),
            ('24시간 영업', '심야 · 새벽에도 주문', '24/7 연속 운영', '끄고 켤 필요 없이 매일'),
            ('운전석 거리 · 각도', '차 안, 앉은 눈높이에서 3–5 m', '설치 높이 [0.0] m · 틸트 [0]°', '운전석 눈높이에 맞춘 설치')]
    for i, (c, v, r, d) in enumerate(rows):
        y = 156 + i * 99
        s += pin(b, str(i + 1), 664, y + 22, size=28)
        s += (f'<div style="{ab(690, y + 6, 240, 84, "display: flex; flex-direction: column; gap: 3px")}">'
              + b.tb(c, 'font-size: 15px; font-weight: 800') + b.tb(v, f'font-size: 12px; line-height: 1.45; color: {MUTED}') + '</div>')
        s += (f'<div style="{ab(944, y + 2, 272, 84, f"box-sizing: border-box; border-radius: 10px; background: {CHIP}; padding: 10px 14px; display: flex; flex-direction: column; gap: 3px")}">'
              + b.tb(r, f'font-size: 14px; font-weight: 800; color: {BLUE}') + b.tb(d, f'font-size: 12px; line-height: 1.45; color: {BODY}') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례(커피빈 DT점)', 14)
    return root(s)


# ---------------------------------------------------------------- old equipment → replacement with photos
@layout(f='L_PH_P_N', code='PH-P-N', p='products', name='기존 장비 → 교체 · 도입 후 사진', when='지금 쓰는 장비 넷을 무엇으로 바꾸는지, 바꾼 뒤의 모습 사진과 바뀌는 점으로 보여줄 때',
        pv=['L_P_N', 'L_SC_F'], sample='E 대학교', grp='공간 · 제품', prods=['qm55c', 'dvms2'])
def _(b):
    s = header(b, '04 · 공간별 제품 — 강의동', '지금 쓰는 장비를 이렇게 바꿉니다 — 강의동 네 가지 교체', '위: 지금 쓰는 장비 · 아래: 바꾼 뒤의 모습 — 연식 · 수량은 현장 조사 후 확정', w=1152)
    cs = [('강의실 · [00]실', '빔프로젝터 + 스크린', '[0000]년 설치 · 램프 교체 연 [0]회', 'ph.ed-lecture-led', '50% 40%', '대형 디스플레이 86"', '불 켜고도 선명 · 램프 교체 없음'),
          ('강의실 · [00]실', '화이트보드', '판서 기록이 남지 않음', 'ph.of-desk-touch', '40% 40%', 'Flip Pro WM75 · 75" 터치', '판서를 파일로 저장 · 바로 공유'),
          ('복도 · 로비 · [00]곳', '종이 게시판', '매주 손으로 교체', 'ph.ed-lobby-signage', '50% 40%', 'Smart Signage QM55C', '휴강 · 공지를 즉시 원격 변경'),
          ('강의실 천장 · [00]실', '천장형 에어컨', '[00]년 사용 · 정속형', 'ph.of-hall-ac', '50% 20%', '4Way 카세트 + DVM S2', '실별 개별 제어 · 인버터로 전력 ↓')]
    for i, (loc, old, od, pid, pos, new, chg) in enumerate(cs):
        x = 64 + i * 292
        s += (f'<div style="{ab(x, 156, 276, 92, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; border: 1px dashed #b8bec8; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px")}">'
              + '<span style="display: flex; justify-content: space-between; align-items: center">' + b.tb('지금', f'font-size: 11px; font-weight: 800; color: {MUTED}') + b.tb(loc, f'font-size: 11px; font-weight: 700; color: {MUTED}') + '</span>'
              + b.tb(old, f'font-size: 15px; font-weight: 800; color: {MUTED}') + b.tb(od, f'font-size: 12px; color: {FAINT}') + '</div>')
        s += f'<svg style="{ab(x + 126, 252, 24, 20)}" viewBox="0 0 24 20" fill="none" stroke="{BLUE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l7 8 7-8"/></svg>'
        s += b.img(pid, ab(x, 276, 276, 250), pos=pos, kind='insitu', hint=f'교체 후 · {new} 설치 사진', radius=14)
        s += glass(b.tb('도입 후', f'font-size: 11px; font-weight: 800; color: {LB}') + b.tb(new, 'font-size: 14px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), x + 8, 458, 260, 58, pad='7px 12px', gap=1)
        s += b.tb(chg, ab(x, 536, 276, extra='font-size: 14px; font-weight: 800; line-height: 1.45'), 'div')
    s += (f'<div style="{ab(64, 600, 1152, 48, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 0 18px; display: flex; align-items: center; gap: 16px")}">'
          + b.tb('교체 합계', f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb('[000]대', f'{NUM}; font-size: 20px; font-weight: 800; color: {BLUE}')
          + b.tb('기존 장비 철거 · 반출 포함 · 방학 기간 시공', f'font-size: 13.5px; color: {BODY}') + '</div>')
    s += footer(b, 'E 대학교 · 스마트 캠퍼스 제안 · 사진: samsung.com 교육 · 오피스 도입사례', 14)
    return root(s)
