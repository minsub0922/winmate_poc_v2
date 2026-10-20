# 5차 — 경쟁사 분석 견본 (다른 5차 생성기 gen_l17 ~ gen_l20 의 기준)
from gen_r5 import *
L = []
FOOT_FB = DEAL['FB']


# ---------------------------------------------------------------- product 1:1 — cut vs rival silhouette, butterfly bars
@layout(L, f='L_PH_CP_A', code='PH-CP-A', p='competition', p2='products', name='제품 1:1 · 제품 컷 + 수치 맞대기',
        when='우리 주력 제품과 경쟁사 동급 제품을 한 장에서 맞대어, 매장에서 차이 나는 수치 여섯 개를 막대로 견줄 때',
        pv=[], sample='A 커피', grp='경쟁 · 제품 비교')
def _(b):
    s = header(b, EB_CP, '같은 55형, 매장에서 갈리는 건 밝기와 운영 시간입니다', '삼성 QM55C vs 경쟁사 A 동급 55형 · 공개 사양 기준 · 출처: [제조사 사양서, 연도]', w=1152)
    # left — ours
    s += cut(b, 'cut.qm55c', 64, 152, 336, 196, hint='삼성 제안 제품 컷', pad=18)
    s += pill(b, '삼성전자 · QM55C', extra='position: absolute; left: 76px; top: 162px')
    s += photo(b, 'ph.fb-counter-menu', 64, 360, 336, 288, pos='50% 35%', hint='제안 제품 설치 장면 (고객 매장으로 교체)', radius=12)
    s += label_on(b, '설치 장면', '카운터 메뉴보드 · 하루 [16]시간 켜 둠', 76, 572, 312, lines=1)
    # right — rival
    s += rival(b, 'signage', 880, 152, 336, 196, hint='경쟁사 A 동급 제품 사진 (공개 자료로 교체)')
    s += pill(b, '경쟁사 A · [모델명]', bg=FAINT, extra='position: absolute; left: 892px; top: 162px')
    s += card(b.tb('경쟁사 A가 앞서는 점', f'font-size: 12px; font-weight: 800; color: {WARN}')
              + b.tb('초기 구매가가 [00]% 낮습니다', 'font-size: 18px; font-weight: 800; line-height: 26px')
              + b.tb('같은 55형 기준 · 설치비 · 소프트웨어 제외', f'font-size: 12.5px; line-height: 18px; color: {BODY}')
              + '<span style="height: 1px; background: #ead9d0; margin: 8px 0 6px"></span>'
              + b.tb('우리의 답', f'font-size: 12px; font-weight: 800; color: {BLUE}')
              + b.tb('5년 총비용은 오히려 [00]% 낮습니다 — 전기료 · 교체 주기를 넣으면', f'font-size: 14px; font-weight: 700; line-height: 21px; {clamp(3)}')
              + '<span style="margin-top: auto"></span>' + evid(b, '근거 · 5년 총비용 비교 p.[00]'),
              880, 360, 336, 288, bg=WARNBG)
    # centre — butterfly bars
    CX, X0, X1 = 640, 420, 860
    s += b.tb('삼성 QM55C', ab(X0, 152, 200, 20, f'font-size: 14px; font-weight: 800; color: {BLUE}'), 'div')
    s += b.tb('경쟁사 A', ab(X1 - 200, 152, 200, 20, f'font-size: 14px; font-weight: 800; color: {MUTED}; text-align: right'), 'div')
    s += rect(CX, 182, 1, 418, LINE)
    rows = [('밝기', '창가 · 낮 시간 가독성', '[700] nit', '[500] nit', 1.0, 0.7, 'win'),
            ('연속 운영', '하루 사용 시간 보증', '24시간 / 7일', '16시간 / 7일', 1.0, 0.66, 'win'),
            ('보증 기간', '패널 · 본체', '[3]년', '[2]년', 1.0, 0.66, 'win'),
            ('원격 관리', '전원 · 화면 · 장애 알림', 'MagicINFO 포함', '별도 구매', 1.0, 0.45, 'win'),
            ('소비 전력', '낮을수록 좋음', '[000] W', '[000] W', 0.82, 0.86, 'tie'),
            ('초기 구매가', '낮을수록 좋음', '[000]만 원', '[000]만 원', 0.92, 0.7, 'lose')]
    MAXL = 96   # bar zone: ours 536–632 · rival 648–744 · values in fixed outer columns
    for i, (nm, d, va, vb, la, lb, res) in enumerate(rows):
        y = 186 + i * 70
        s += (f'<div style="{ab(CX - 110, y, 220, 34, "display: flex; flex-direction: column; align-items: center; gap: 0")}">'
              + b.tb(nm, 'font-size: 14px; font-weight: 800; white-space: nowrap')
              + b.tb(d, f'font-size: 10.5px; color: {MUTED}; white-space: nowrap') + '</div>')
        ca = BLUE if res == 'win' else '#9fb0e6'
        cb = INK if res == 'lose' else '#c3c8d1'
        wa, wb = round(MAXL * la), round(MAXL * lb)
        s += rect(CX - 8 - wa, y + 40, wa, 14, ca, 3)
        s += rect(CX + 8, y + 40, wb, 14, cb, 3)
        s += b.tb(va, ab(X0, y + 37, 108, 20, f'{NUM}; font-size: 13px; font-weight: 800; color: {BLUE if res == "win" else BODY}; text-align: right; white-space: nowrap'), 'div')
        s += b.tb(vb, ab(X1 - 108, y + 37, 108, 20, f'{NUM}; font-size: 13px; font-weight: 800; color: {INK if res == "lose" else MUTED}; white-space: nowrap'), 'div')
    s += (f'<div style="{ab(X0, 612, X1 - X0, 36, f"box-sizing: border-box; border-radius: 10px; background: {CHIP}; display: flex; align-items: center; justify-content: center; gap: 14px")}">'
          + b.tb('여섯 항목 중', f'font-size: 13px; font-weight: 700; color: {BODY}') + b.tb('우위 4', f'font-size: 14px; font-weight: 800; color: {BLUE}')
          + b.tb('동등 1', f'font-size: 14px; font-weight: 800; color: {MUTED}') + b.tb('열위 1 → 오른쪽 대응', f'font-size: 14px; font-weight: 800; color: {WARN}') + '</div>')
    s += footer(b, FOOT_FB + ' · 막대 길이는 예시 · 경쟁사 익명 · 경쟁사 제품은 실루엣 자리 · 사진: samsung.com 카페 도입사례 · 제품 컷', 11)
    return s
