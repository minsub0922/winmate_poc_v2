# 6차 — 실행 계획 사진 레이아웃 7장 (L_PH_OG_A · L_PH_IP_B · L_PH_IP_C · L_PH_IG_A · L_PH_IG_B · L_PH_PL_B · L_PH_EX_A)
# 원본 텍스트 장(L_OG_A · L_IP_B · L_IP_C · L_IG_A · L_IG_B · L_PL_B)의 eyebrow · 제목 · 예시 고객 · 각주 · 쪽 번호를 그대로 옮기고,
# 표 · 조직도 · 간트는 줄여 남는 자리에 현장 사진 · 솔루션 화면을 넣었다. L_PH_EX_A 는 새 장(설치 하룻밤).
from gen_r5 import *
L = []
GRP = '실행 · 사진'


def foot(base, src, extra=''):
    return base + (' · ' + extra if extra else '') + f' · 사진: samsung.com {src} 도입사례 · 비즈니스 페이지'


def lab(b, text, color=BLUE, size=12.5):
    return b.tb(text, f'font-size: {size}px; font-weight: 800; color: {color}; white-space: nowrap')


def tline(b, text, size=15, lh=22, lines=1, color=INK, weight=800):
    return b.tb(text, f'font-size: {size}px; font-weight: {weight}; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def dline(b, text, size=12.5, lh=18, lines=2, color=BODY):
    return b.tb(text, f'font-size: {size}px; line-height: {lh}px; color: {color}; flex-shrink: 0; {clamp(lines)}')


def row(inner, gap=6, extra=''):
    return f'<span style="display: flex; align-items: center; gap: {gap}px; {extra}">{inner}</span>'


def topright(inner, y=112, gap=8):
    """header 오른쪽 아래 범례 · 요약 줄 (오른쪽 정렬)"""
    return f'<div style="position: absolute; right: 64px; top: {y}px; display: flex; align-items: center; gap: {gap}px">{inner}</div>'


def vline(x, y, h, color=LINE, w=1):
    return f'<div style="{ab(x, y, w, h, f"background: {color}")}"></div>'


def hline(x, y, w, color=LINE, h=1):
    return f'<div style="{ab(x, y, w, h, f"background: {color}")}"></div>'


# ---------------------------------------------------------------- 1 추진 체계 · 팀 사진 (원본 L_OG_A)
@layout(L, f='L_PH_OG_A', code='PH-OG-A', p='execution', p2=None, name='추진 체계 · 팀별 현장 사진',
        when='여러 회사 · 팀이 함께 수행할 때, 팀마다 일하는 현장 사진과 함께 역할 · 인원 · 보고 체계를 보여 줄 때',
        pv=['L_OG_A'], sample='S 지자체', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 추진 체계', '세 회사가 한 팀으로 움직입니다', '조직 · 역할 · 투입 인원 · 보고 체계', w=760)
    s += topright(pill(b, '삼성전자', bg=CHIP, color=BLUE, extra='align-self: center') + pill(b, '협력사', bg=SOFT, color=BODY, extra='align-self: center')
                  + f'<span style="width: 1px; height: 16px; background: {LINE}"></span>'
                  + b.tb('총 투입', f'font-size: 12.5px; color: {MUTED}; white-space: nowrap')
                  + b.tb('[00]명', f'{NUM}; font-size: 17px; font-weight: 800; color: {BLUE}; white-space: nowrap'), y=112)
    # org band — 발주처 ← 보고 · 승인 ← 총괄 PM · QA · 보안
    s += (f'<div style="{ab(64, 152, 376, 48, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 0 16px; display: flex; align-items: center; gap: 10px")}">'
          + pill(b, '발주처', bg='#ffffff', color=BODY, extra=f'align-self: center; border: 1px solid {LINE}')
          + b.tb('S 지자체', 'font-size: 16px; font-weight: 800; white-space: nowrap')
          + b.tb('사업 담당관 · PMO 위원회', f'font-size: 12.5px; color: {MUTED}; white-space: nowrap') + '</div>')
    s += hline(440, 176, 80, '#b8bec8', 2)
    s += b.tb('보고 · 승인', ab(440, 156, 80, 16, f'font-size: 11px; color: {MUTED}; text-align: center; white-space: nowrap'), 'div')
    s += (f'<div style="{ab(520, 152, 240, 48, f"box-sizing: border-box; border-radius: 12px; background: {BLUE}; display: flex; align-items: center; justify-content: center; gap: 10px")}">'
          + b.tb('총괄 PM', 'font-size: 17px; font-weight: 800; color: #ffffff; white-space: nowrap')
          + '<span style="width: 1px; height: 16px; background: rgba(255,255,255,0.35)"></span>'
          + b.tb('삼성전자', f'font-size: 13px; color: {LT}; white-space: nowrap')
          + b.tb('1명', f'{NUM}; font-size: 15px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</div>')
    s += f'<div style="{ab(760, 176, 40, 0, "border-top: 2px dashed #b8bec8")}"></div>'
    s += (f'<div style="{ab(800, 152, 416, 48, f"box-sizing: border-box; border-radius: 12px; background: #ffffff; border: 1px solid {LINE}; padding: 0 18px; display: flex; align-items: center; gap: 10px")}">'
          + b.tb('품질 관리 (QA)', 'font-size: 14px; font-weight: 800; white-space: nowrap') + b.tb('1명', f'{NUM}; font-size: 13px; font-weight: 800; color: {MUTED}; white-space: nowrap')
          + f'<span style="width: 1px; height: 16px; background: {LINE}; margin: 0 8px"></span>'
          + b.tb('보안 담당', 'font-size: 14px; font-weight: 800; white-space: nowrap') + b.tb('1명', f'{NUM}; font-size: 13px; font-weight: 800; color: {MUTED}; white-space: nowrap') + '</div>')
    # tree
    W, G = 276, 16
    xs = [64 + i * (W + G) for i in range(4)]
    s += vline(639, 200, 14, BLUE, 2)
    s += hline(xs[0] + W // 2, 213, xs[3] - xs[0], BLUE, 2)
    for x in xs:
        s += vline(x + W // 2 - 1, 213, 13, BLUE, 2)
    teams = [('삼성전자', True, '설계 · 구축', '구성 설계 · 장비 설치 감리 · 시운전', 'r4.of-flip-team', '55% 40%', '설계 · 구축 회의 장면 (실제 프로젝트 팀 사진으로 교체)'),
             ('SI 파트너 [회사명]', False, 'SW · 연동', '통합 관제 SW · BIS · 재난 연동 · 데이터 이관', 'ph.of-control-room', '50% 45%', 'SW 연동 · 개발 작업 화면 (SI 파트너 사진으로 교체)'),
             ('시공 협력사 [회사명]', False, '설치 · 시공', '현장 설치 · 전기 · 통신 · 야간 시공', 'ph.svc-technician', '40% 30%', '현장 설치 · 시공 장면 (시공 협력사 사진으로 교체)'),
             ('삼성전자 서비스', True, '운영 · 유지보수', '원격 모니터링 · 정기 점검 · 장애 대응', 'ph.pb-control', '50% 50%', '운영 관제실 장면 (고객 관제 센터 사진으로 교체)')]
    for x, (co, ours, nm, items, pid, pos, hint) in zip(xs, teams):
        s += box(x, 226, W, 352, '#ffffff', 12, f'border: 1px solid {LINE}')
        s += photo(b, pid, x + 8, 234, W - 16, 212, pos=pos, hint=hint, radius=8)
        s += (pill(b, co, extra=f'position: absolute; left: {x + 16}px; top: 242px') if ours else tag_on(b, co, x + 16, 242, size=11.5))
        s += card(tline(b, nm, 17, 24) + dline(b, items, 13, 19, 2)
                  + f'<span style="height: 1px; background: {LINE}; margin-top: auto"></span>'
                  + row(b.tb('투입 인원', f'font-size: 12.5px; color: {MUTED}; white-space: nowrap')
                        + b.tb('[0]명', f'{NUM}; margin-left: auto; font-size: 18px; font-weight: 800; color: {BLUE}; white-space: nowrap')),
                  x + 8, 452, W - 16, 120, bg='#ffffff', pad='4px 8px 2px', gap=6)
    # 보고 · 소통
    s += box(64, 592, 1152, 56, SOFT, 12)
    s += photo(b, 'fill.meet_video', 64, 592, 164, 56, pos='50% 35%', hint='주간 보고 · 화상 회의 장면', radius=12)
    s += (f'<div style="{ab(244, 592, 130, 56, "display: flex; flex-direction: column; justify-content: center; gap: 1px")}">'
          + b.tb('보고 · 소통', 'font-size: 15px; font-weight: 800; white-space: nowrap') + b.tb('총괄 PM 주관', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + '</div>')
    for i, (k, v) in enumerate([('주간 보고', '매주 [요일]'), ('월간 PMO', '매월 [0]주'), ('이슈 에스컬레이션', '4h → 24h'), ('공동 작업 공간', '[도구]')]):
        x = 380 + i * 209
        s += vline(x, 604, 32)
        s += (f'<div style="{ab(x + 18, 592, 180, 56, "display: flex; flex-direction: column; justify-content: center; gap: 0")}">'
              + b.tb(k, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + b.tb(v, f'{NUM}; font-size: 15px; font-weight: 800; white-space: nowrap') + '</div>')
    s += footer(b, foot('S 지자체 · 통합 안내 · 관제 고도화 사업 제안 · 인원은 투입 계획 기준 예시', '공공 · 오피스'), 40)
    return s


# ---------------------------------------------------------------- 2 공사 범위 R&R · 작업 사진 (원본 L_IP_B)
RACI = {'A': (BLUE, '#ffffff', BLUE), 'A/R': (BLUE, '#ffffff', BLUE), 'R': (CHIP, BLUE, CHIP), 'C': ('#ffffff', BODY, '#b8bec8'), 'I': ('#ffffff', FAINT, LINE)}


def raci(b, v, cx, cy, size=26):
    if v == '—':
        return b.tb('—', ab(cx - 12, cy - 10, 24, 20, 'color: #c3c8d1; font-size: 14px; line-height: 20px; text-align: center'), 'div')
    bg, c, bd = RACI[v]
    w = 42 if '/' in v else size
    return b.tb(v, ab(cx - w // 2, cy - size // 2, w, size, f'box-sizing: border-box; border-radius: 999px; background: {bg}; border: 1.5px solid {bd}; color: {c}; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}'), 'div')


@layout(L, f='L_PH_IP_B', code='PH-IP-B', p='execution', p2=None, name='공사 범위 R&R · 작업별 사진',
        when='여러 주체가 공사를 나눌 때, 작업마다 현장 사진을 붙여 누가 책임 · 수행하는지와 흐린 경계를 정리할 때',
        pv=['L_IP_B'], sample='C 빌딩', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 설치 · 시공', '공사 범위, 네 주체가 이렇게 나눠 맡습니다', '작업 × 주체 · 책임(A)은 작업마다 한 곳', w=760)
    leg = ''
    for k, t in [('A', '책임'), ('R', '수행'), ('C', '협의'), ('I', '통보')]:
        bg, c, bd = RACI[k]
        leg += (b.tb(k, f'width: 22px; height: 22px; flex-shrink: 0; box-sizing: border-box; border-radius: 50%; background: {bg}; border: 1.5px solid {bd}; color: {c}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; {NUM}')
                + b.tb(t, f'font-size: 12.5px; color: {BODY}; white-space: nowrap; margin-right: 6px'))
    s += topright(leg, y=114, gap=6)
    tasks = [('기존 장비 철거', 'r4.ed-ac-check', '50% 30%', 0, '기존 장비 철거 작업 사진'),
             ('배관 · 배선', 'ph.of-rooftop-odu', '50% 55%', 0, '배관 · 배선 작업 사진'),
             ('전기 간선 · 분전반', 'fill.dms25', '', 3, '분전반 · 간선 작업 사진으로 교체'),
             ('천장 개구 · 마감 복구', 'ph.ed-ac-clean', '50% 25%', 1, '천장 개구부 · 마감 작업 사진'),
             ('제품 설치', 'ph.svc-technician', '40% 30%', 0, '제품 설치 장면'),
             ('시운전 · 세팅', 'ph.of-dms-screen', '50% 40%', 0, '시운전 · 세팅 화면'),
             ('폐기물 반출', 'fill.wh_workers', '20% 40%', 2, '철거품 · 포장재 반출 사진으로 교체'),
             ('사용자 교육', 'r4.of-flip-team', '50% 40%', 0, '사용자 교육 장면')]
    X0, CW = 240, 122
    for i, (nm, pid, pos, ref, hint) in enumerate(tasks):
        x = X0 + i * CW
        if pid.startswith('fill.dms'):
            s += cut(b, pid, x + 4, 152, CW - 8, 108, hint=hint, radius=8, pad=10)
        else:
            s += photo(b, pid, x + 4, 152, CW - 8, 108, pos=pos, hint=hint, radius=8)
        if ref:
            s += pin(b, str(ref), x + 20, 168, bg=INK, size=24)
        s += b.tb(nm, ab(x + 2, 266, CW - 4, 34, f'font-size: 13px; font-weight: 800; line-height: 17px; text-align: center; {clamp(2)}'), 'div')
    s += b.tb('작업 →', ab(64, 266, 160, 18, f'font-size: 12px; font-weight: 700; color: {MUTED}'), 'div')
    s += b.tb('주체 ↓', ab(64, 284, 160, 18, f'font-size: 12px; font-weight: 700; color: {MUTED}'), 'div')
    s += hline(64, 306, 1152, INK, 2)
    ents = [('삼성전자', '제안 · 총괄', BLUE, '#ffffff', ['A', 'A', 'C', 'I', 'A', 'A/R', 'I', 'A/R'], 'A5', 'R2'),
            ('설치 협력사', '삼성 협력 시공', CHIP, BLUE, ['R', 'R', 'I', 'C', 'R', 'C', 'R', '—'], 'A0', 'R4'),
            ('고객사 시설팀', 'C 빌딩 운영', INK, '#ffffff', ['C', 'I', 'A', 'A', 'I', 'I', 'A', 'C'], 'A3', 'R0'),
            ('인테리어 업체', '고객 발주', SOFT, BODY, ['I', 'C', 'R', 'R', '—', '—', 'C', '—'], 'A0', 'R2')]
    for j, (nm, sub, bg, c, vals, na, nr) in enumerate(ents):
        y = 310 + j * 46
        if j % 2 == 0:
            s += box(64, y, 1152, 46, '#f8f9fb', 0)
        s += hline(64, y + 46, 1152)
        s += (f'<div style="{ab(68, y, 120, 46, "display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
              + pill(b, nm, bg=bg, color=c, extra=f'border: 1px solid {LINE}' if bg == SOFT else '')
              + b.tb(sub, f'font-size: 11px; color: {MUTED}; white-space: nowrap') + '</div>')
        s += (f'<div style="{ab(188, y, 48, 46, "display: flex; flex-direction: column; justify-content: center; align-items: flex-end; gap: 0")}">'
              + b.tb(na, f'{NUM}; font-size: 12px; font-weight: 800; color: {BLUE if na != "A0" else "#b8bec8"}; white-space: nowrap')
              + b.tb(nr, f'{NUM}; font-size: 12px; font-weight: 800; color: {MUTED}; white-space: nowrap') + '</div>')
        for i, v in enumerate(vals):
            s += raci(b, v, X0 + i * CW + CW // 2, y + 23)
    # 경계가 흐린 세 가지 — 사진 카드
    s += (f'<div style="{ab(64, 504, 1152, 22, "display: flex; align-items: center; gap: 12px")}">'
          + b.tb('경계가 흐린 세 가지', 'font-size: 15px; font-weight: 800; white-space: nowrap')
          + b.tb('착공 전에 책임 주체를 정해야 합니다', f'font-size: 12.5px; color: {MUTED}; white-space: nowrap')
          + b.tb('착공 [0]주 전 4자 회의에서 확정', f'margin-left: auto; font-size: 12.5px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')
    bounds = [('1', '천장 마감 복구 범위', '개구부 주변만 · 천장판 전체', 'ph.of-office-ac', '50% 20%', '천장판 · 마감 상태 사진 (C 빌딩 현장으로 교체)'),
              ('2', '폐기물 처리 비용', '철거품 · 포장재 반출비 부담', 'r4.of-cleaning', '55% 50%', '철거 뒤 반출 · 정리 장면 (현장 사진으로 교체)'),
              ('3', '전원 증설 비용', '용량 부족 시 분전반 증설비', 'r4.of-odu-row', '50% 50%', '전원 · 실외기 설비 사진 (C 빌딩 설비로 교체)')]
    for k, (n, t, d, pid, pos, hint) in enumerate(bounds):
        x = 64 + k * 392
        s += box(x, 534, 368, 114, SOFT, 12)
        s += photo(b, pid, x, 534, 144, 114, pos=pos, hint=hint, radius=12)
        s += pin(b, n, x + 18, 552, bg=INK, size=24)
        s += card(tline(b, t, 15, 22) + dline(b, d, 12.5, 18, 1, MUTED)
                  + row(b.tb('결정 필요', f'height: 22px; padding: 0 8px; border-radius: 6px; background: #ffffff; border: 1px solid {LINE}; color: {INK}; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
                        + b.tb('[00]/[00]까지', f'{NUM}; font-size: 12.5px; font-weight: 800; white-space: nowrap'), 8, 'margin-top: auto'),
                  x + 144, 534, 224, 114, bg='transparent', pad='14px 16px', gap=4)
    s += footer(b, foot('C 빌딩 · 스마트 오피스 제안 · R 수행 · A 책임 · C 협의 · I 통보', '오피스', '숫자 ① ② ③ = 경계가 흐린 작업'), 37)
    return s


# ---------------------------------------------------------------- 3 무중단 · 야간 시공 · 구역 사진 (원본 L_IP_C)
@layout(L, f='L_PH_IP_C', code='PH-IP-C', p='execution', p2=None, name='무중단 야간 시공 · 구역 사진 일정',
        when='영업을 멈추지 않고 시공할 때, 구역마다 매장 사진을 붙여 밤별 반입 · 설치 · 시운전 · 복구 일정을 보여 줄 때',
        pv=['L_IP_C'], sample='H 백화점', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 설치 · 시공', '영업을 멈추지 않고, 여섯 밤에 끝냅니다', '구역 × 밤(D1–D6) · 22:00–06:00 · 반입 → 설치 → 시운전 → 복구', w=820)
    s += b.tb('영업 시작 10:30 · 매일 오전 09시 점검', f'position: absolute; right: 64px; top: 72px; height: 28px; padding: 0 14px; border-radius: 999px; background: {INK}; color: #ffffff; font-size: 12.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap', 'div')
    COL = {'반입': '#b9c4ef', '설치': BLUE, '시운전': '#6f80d6', '복구': '#c3c8d1'}
    leg = ''
    for k, t in [('반입', '반입'), ('설치', '설치'), ('시운전', '시운전'), ('복구', '복구 · 청소')]:
        leg += f'<span style="width: 14px; height: 10px; border-radius: 3px; background: {COL[k]}"></span>' + b.tb(t, f'font-size: 12px; color: {BODY}; white-space: nowrap; margin-right: 6px')
    s += topright(leg, y=116, gap=6)
    GX, NW = 448, 128
    PH = NW / 8  # px per hour (22 → 06)
    for n in range(6):
        x = GX + n * NW
        s += (f'<div style="{ab(x + 4, 150, NW - 8, 20, "display: flex; align-items: baseline; gap: 6px")}">'
              + b.tb(f'D{n + 1}', f'{NUM}; font-size: 15px; font-weight: 800; white-space: nowrap') + b.tb('[00]/[00]', f'{NUM}; font-size: 11px; color: {MUTED}; white-space: nowrap') + '</div>')
        for h, t in [(0, '22'), (4, '02'), (8, '06')]:
            tx = x + round(h * PH)
            al = 'left' if h == 0 else 'right' if h == 8 else 'center'
            ox = tx + 4 if h == 0 else tx - 24 if h == 8 else tx - 12
            s += b.tb(t, ab(ox, 172, 20, 14, f'{NUM}; font-size: 10.5px; font-weight: {800 if h == 4 else 600}; color: {INK if h == 4 else FAINT}; text-align: {al}'), 'div')
        s += box(x + 2, 194, NW - 4, 380, SOFT, 0)
        s += vline(x + round(4 * PH), 194, 380, '#d9dde3')
        s += f'<div style="{ab(x + NW - 1, 194, 0, 380, "border-left: 1px dashed #8a91a0")}"></div>'
        s += b.tb('06:00 복구 완료', ab(x + 4, 578, NW - 8, 16, f'font-size: 11px; font-weight: 800; color: {MUTED}; text-align: right; white-space: nowrap'), 'div')
    s += b.tb('구역 · 설치 제품', ab(314, 172, 130, 14, f'font-size: 11px; color: {MUTED}; white-space: nowrap'), 'div')
    s += hline(64, 192, 1152, INK, 2)
    A3 = [(0.1, 1.0, '반입'), (1.1, 5.9, '설치'), (6.0, 7.8, '복구')]      # 첫 밤: 반입 → 설치 → 복구
    B3 = [(0.1, 3.6, '설치'), (3.7, 5.9, '시운전'), (6.0, 7.8, '복구')]   # 둘째 밤: 설치 마무리 → 시운전 → 복구
    zones = [('1F 외벽 미디어', 'OH55A-S × [00]', 'ph.ad-dept-led', '50% 30%', '외벽 미디어 구역 사진 (H 백화점 외관으로 교체)', {0: A3, 1: B3}),
             ('1F 화장품', 'QM55C × [00]', 'fill.fashion_led', '60% 30%', '화장품 매장 구역 사진', {1: A3, 2: [(0.1, 3.6, '시운전'), (3.7, 5.5, '복구')]}),
             ('2F 여성', 'VM55B-U 비디오월 [0]면', 'ph.rt-fashion-store', '50% 40%', '여성 패션 구역 사진', {2: A3, 3: B3}),
             ('3F 남성', 'QM55C × [00]', 'ph.rt-fashion-phone', '70% 40%', '남성 패션 구역 사진', {3: A3, 4: B3}),
             ('B1 식품관', 'QM55C 메뉴보드 × [00]', 'ph.rt-foodhall', '50% 30%', '식품관 구역 사진', {4: [(0.1, 1.0, '반입'), (1.1, 4.0, '설치'), (4.1, 5.5, '복구')], 5: [(0.1, 2.0, '설치'), (2.1, 4.0, '시운전'), (4.1, 5.5, '복구')]})]
    for i, (nm, prod, pid, pos, hint, plan) in enumerate(zones):
        y = 194 + i * 76
        s += hline(64, y + 76, 1152)
        s += photo(b, pid, 64, y + 3, 240, 70, pos=pos, hint=hint, radius=8)
        s += (f'<div style="{ab(314, y, 130, 76, "display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
              + b.tb(nm, 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap')
              + b.tb(prod, f'font-size: 11.5px; font-weight: 700; line-height: 16px; color: {MUTED}; {clamp(2)}') + '</div>')
        for n, bars in plan.items():
            for a, z, k in bars:
                bx = GX + n * NW + round(a * PH); bw = round((z - a) * PH)
                txt = k if k in ('설치', '시운전') and bw >= 34 else ''
                st = f'box-sizing: border-box; border-radius: 4px; background: {COL[k]}'
                if txt:
                    s += b.tb(txt, ab(bx, y + 26, bw, 26, f'{st}; color: #ffffff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
                else:
                    s += f'<div style="{ab(bx, y + 26, bw, 26, st)}"></div>'
        if i == 4:
            for n in (4, 5):
                s += rect(GX + n * NW + round(4 * PH) - 1, y + 20, 3, 38, INK, 1)
            s += b.tb('냉장 쇼케이스 주변은 02시 이전 작업 →', ab(GX + 2 * NW + 10, y + 26, 2 * NW - 20, 26, f'box-sizing: border-box; border-radius: 999px; background: #ffffff; border: 1.5px solid {INK}; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
    rules = [('소음 작업 02시 전 종료', '타공 · 앵커 · 절단은 22–02시에만'),
             ('고객 동선 차단 없음 · 가림막', '작업 구역만 가림막 · 통로 폭 [0.0] m 유지'),
             ('매일 06시 원상 복구 · 사진 기록', '복구 전후 사진을 시설팀에 공유')]
    for k, (t, d) in enumerate(rules):
        x = 64 + k * 392
        s += card(tline(b, t, 13.5, 20) + dline(b, d, 12, 17, 1, MUTED), x, 602, 368, 46, pad='4px 14px', gap=0, extra='justify-content: center')
    s += footer(b, foot('H 백화점 · VMD 사이니지 리뉴얼 제안 · 시간은 예시 · 매일 06시 원상 복구', '리테일'), 38)
    return s


# ---------------------------------------------------------------- 4 시스템 연동 매트릭스 · 솔루션 화면 (원본 L_IG_A)
CHIPS = {'API': (BLUE, '#ffffff', BLUE), '인터페이스 모듈': ('#6f80d6', '#ffffff', '#6f80d6'), '파일 연계': (SOFT, BODY, LINE), '확인 필요': ('#ffffff', INK, INK)}


def mchip(b, k, extra=''):
    bg, c, bd = CHIPS[k]
    return b.tb(k, f'align-self: flex-start; height: 20px; padding: 0 8px; box-sizing: border-box; border-radius: 999px; background: {bg}; border: 1.2px solid {bd}; color: {c}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap; {extra}')


@layout(L, f='L_PH_IG_A', code='PH-IG-A', p='execution', p2='solution', name='시스템 연동 매트릭스 · 솔루션 화면',
        when='고객 시스템과 붙을 곳이 여럿일 때, 솔루션 화면과 현장 사진을 머리에 두고 연동 방식 · 데이터를 한 표로 보여 줄 때',
        pv=['L_IG_A'], sample='B 비즈니스', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 시스템 연동', '호텔이 쓰는 다섯 시스템과 이렇게 연결합니다', '고객 시스템 × 삼성 솔루션 · 연동 방식 · 주고받는 데이터', w=840)
    sols = [('LYNK Cloud', '객실 TV', 'fill.lynk_mgmt', '70% 50%'), ('MagicINFO', '사이니지 · 메뉴', 'fill.mi_console', '50% 50%'),
            ('b.IoT', '객실 · 설비 제어', 'fill.biot_dash', '0% 0%'), ('SmartThings Pro', '에너지 · 기기', 'fill.stp_kv', '50% 50%'),
            ('Knox Suite', '직원 단말 보안', 'fill.km_console', '0% 0%')]
    X0, CW = 252, 131
    s += (f'<div style="{ab(64, 152, 180, 90, "display: flex; flex-direction: column; justify-content: flex-end; gap: 1px")}">'
          + b.tb('고객 시스템', 'font-size: 13px; font-weight: 800; white-space: nowrap') + b.tb('× 삼성 솔루션', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + '</div>')
    for i, (nm, sub, pid, pos) in enumerate(sols):
        x = X0 + i * CW
        s += photo(b, pid, x + 4, 152, CW - 8, 90, pos=pos, hint=f'{nm} 화면 (고객 구성 화면으로 교체)', radius=8)
        s += f'<div style="{ab(x + 4, 152, CW - 8, 90, f"box-sizing: border-box; border-radius: 8px; border: 1px solid {LINE}")}"></div>'
        s += b.tb(nm, ab(x, 248, CW, 18, f'font-size: 13px; font-weight: 800; color: {BLUE}; text-align: center; white-space: nowrap'), 'div')
        s += b.tb(sub, ab(x, 266, CW, 16, f'font-size: 11px; color: {MUTED}; text-align: center; white-space: nowrap'), 'div')
    s += hline(64, 288, 844, INK, 2)
    rows = [('PMS', '객실 관리', 'fill.ht_front', '50% 50%', '프런트 · 체크인 장면', {0: ('API', '투숙객 이름 · 체크인/아웃'), 2: ('인터페이스 모듈', '재실 → 객실 공조')}),
            ('POS', 'F&B', 'ph.ht-restaurant', '50% 60%', '호텔 레스토랑 · 결제 장면', {1: ('API', '메뉴 · 가격 · 품절')}),
            ('BMS', '빌딩 설비', 'ph.ht-corridor-info', '80% 50%', '빌딩 설비 · 공조 관리 장면', {2: ('인터페이스 모듈', '공조 · 조명 상태'), 3: ('확인 필요', '전력 계량')}),
            ('예약 · CRM', '고객 관리', 'ph.ht-welcome-tv', '20% 40%', '객실 TV 웰컴 화면', {0: ('파일 연계', '웰컴 메시지 · 언어')}),
            ('SSO', '사내 인증', 'ph.rt-staff-tablet', '40% 40%', '직원 단말 로그인 장면 (호텔 직원 사진으로 교체)', {1: ('확인 필요', '관리자 로그인'), 4: ('API', '직원 계정 · 권한')})]
    for j, (nm, sub, pid, pos, hint, cells) in enumerate(rows):
        y = 292 + j * 71
        s += hline(64, y + 71, 844)
        s += photo(b, pid, 64, y + 5, 92, 61, pos=pos, hint=hint, radius=8)
        s += (f'<div style="{ab(166, y, 84, 71, "display: flex; flex-direction: column; justify-content: center; gap: 1px")}">'
              + b.tb(nm, 'font-size: 15px; font-weight: 800; line-height: 22px; white-space: nowrap') + b.tb(sub, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + '</div>')
        for i in range(5):
            x = X0 + i * CW
            if i in cells:
                k, d = cells[i]
                s += card(mchip(b, k) + dline(b, d, 11, 15, 2, BODY), x + 4, y + 4, CW - 8, 63, bg='#ffffff', pad='6px 9px', gap=3, radius=10, border=LINE)
            else:
                s += b.tb('—', ab(x, y + 25, CW, 20, 'color: #c3c8d1; font-size: 14px; line-height: 20px; text-align: center'), 'div')
    # 연동 전제 조건 패널
    conds = [('PMS 벤더 API 제공 여부', None), ('방화벽 포트 개방', '[00]개 · 고객 IT팀 승인'), ('연동 개발 주체', 'SI 파트너 · 범위 [확정 필요]'), ('시험 환경(스테이징) 제공', '운영 전 [0]주 · 고객 제공')]
    inner = tline(b, '연동 전제 조건', 16, 24) + f'<span style="height: 1px; background: {LINE}; margin: 4px 0 2px"></span>'
    for t, d in conds:
        inner += (f'<span style="display: flex; gap: 10px; align-items: flex-start">'
                  + f'<span style="width: 16px; height: 16px; flex-shrink: 0; margin-top: 3px; box-sizing: border-box; border-radius: 4px; border: 1.5px solid #b8bec8; background: #ffffff"></span>'
                  + '<span style="display: flex; flex-direction: column; gap: 3px; min-width: 0">' + b.tb(t, 'font-size: 13.5px; font-weight: 800; line-height: 20px; white-space: nowrap')
                  + (b.tb(d, f'font-size: 12px; color: {BODY}; white-space: nowrap') if d else mchip(b, '확인 필요')) + '</span></span>')
    inner += f'<span style="height: 1px; background: {LINE}; margin: 4px 0 2px"></span>' + lab(b, '연동 방식 · 건수', MUTED, 12)
    for k, d, n in [('API', '표준 API · 실시간 호출', '3'), ('인터페이스 모듈', '게이트웨이로 변환', '2'), ('파일 연계', '정해진 시각에 교환', '1'), ('확인 필요', '벤더 협의 후 확정', '2')]:
        inner += row(mchip(b, k, 'align-self: center') + b.tb(d, f'font-size: 11.5px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0')
                     + b.tb(n, f'{NUM}; margin-left: auto; font-size: 13px; font-weight: 800; white-space: nowrap'), 8)
    s += card(inner, 928, 152, 288, 496, bg=SOFT, pad='18px 18px', gap=12, radius=14)
    s += footer(b, foot('B 비즈니스 호텔 · 객실 · 공용부 리뉴얼 제안 · 연동 방식은 벤더 협의로 확정', '호텔', '화면은 솔루션 소개 이미지'), 39)
    return s


# ---------------------------------------------------------------- 5 연동 데이터 흐름 · 매장 화면 사진 (원본 L_IG_B)
@layout(L, f='L_PH_IG_B', code='PH-IG-B', p='execution', p2='solution', name='연동 데이터 흐름 · POS · 매장 화면 사진',
        when='데이터가 어디서 와서 어디로 가는지를, 시작(POS 결제)과 끝(매장 메뉴보드 · 키오스크) 사진 사이의 흐름으로 보여 줄 때',
        pv=['L_IG_B'], sample='A 커피', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 시스템 연동', 'POS에서 품절이 나면, [00]초 안에 메뉴판이 바뀝니다', '고객 시스템 → 연동 → 삼성 → 매장 · 데이터 · 주기 · 장애 시 동작', w=1152)
    s += b.tb('품절 반영 [00]초 이내', f'position: absolute; right: 64px; top: 72px; height: 28px; padding: 0 14px; border-radius: 999px; background: {INK}; color: #ffffff; font-size: 12.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap', 'div')
    # start — POS photo + ERP
    s += photo(b, 'ph.fb-pos-pay', 64, 152, 236, 208, pos='50% 45%', hint='매장 POS 결제 장면 (A 커피 매장 POS로 교체)', radius=12)
    s += tag_on(b, '고객 시스템 · A 커피', 76, 162, size=11.5)
    s += label_on(b, 'POS (매장)', '매장 320곳 · 품절 입력', 76, 300, 212, lines=1)
    s += card(tline(b, '메뉴 마스터 (ERP)', 14, 20) + dline(b, '본사 · 가격 · 프로모션', 12, 17, 1, MUTED), 64, 368, 236, 64, bg=SOFT, pad='10px 14px', gap=2, border=LINE)
    s += ARR(300, 246, 28, 20, 18)
    s += ARR(300, 390, 28, 20, 18)
    # middle panel
    s += box(328, 152, 560, 280, SOFT, 14)
    s += row(lab(b, '연동', INK, 13.5) + b.tb('SI 파트너 구축', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap'), 6, 'position: absolute; left: 344px; top: 164px')
    s += row(lab(b, '삼성', BLUE, 13.5) + b.tb('MagicINFO · 매장 320곳 동시 반영', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap'), 6, 'position: absolute; left: 592px; top: 164px')
    for y, t, d, ch in [(194, 'API 게이트웨이', '인증 · 호출 제한', '품절 · 실시간'), (316, '변환 · 검증', '형식 변환 · 오류 검사', '가격 · 프로모션')]:
        s += card(tline(b, t, 14, 20) + dline(b, d, 12, 17, 1, MUTED) + evid(b, ch, BLUE, CHIP, CHIP).replace('align-self: flex-start', 'align-self: flex-start; margin-top: auto'),
                  344, y, 212, 100, bg='#ffffff', pad='12px 14px', gap=2, border=LINE)
    s += ARR(558, 234, 32, 20, 16)
    s += ARR(558, 356, 32, 20, 16)
    s += photo(b, 'fill.mi_editor', 592, 194, 280, 132, pos='50% 50%', hint='MagicINFO 콘텐츠 편집 화면 (실제 메뉴 템플릿 화면으로 교체)', radius=10)
    s += f'<div style="{ab(592, 194, 280, 132, f"box-sizing: border-box; border-radius: 10px; border: 1px solid {LINE}")}"></div>'
    s += tag_on(b, 'CMS 화면', 602, 202, size=11)
    for k, (t, d) in enumerate([('데이터 링크', '데이터 → 메뉴 템플릿'), ('MagicINFO 서버', '콘텐츠 예약 배포')]):
        s += card(tline(b, t, 13.5, 20, color=BLUE) + dline(b, d, 11.5, 16, 1, BODY), 592 + k * 144, 336, 136, 80, bg='#ffffff', pad='10px 12px', gap=2, border='#9fb0e6')
    s += ARR(888, 216, 28, 20, 18)
    s += ARR(888, 360, 28, 20, 18)
    # end — store screens
    s += photo(b, 'ph.fb-counter-menu', 916, 152, 300, 152, pos='50% 30%', hint='매장 메뉴보드 사진 (A 커피 매장으로 교체)', radius=12)
    s += label_on(b, '매장 · 메뉴보드 QM55C × 3', '품절 표시 · 가격 · 행사', 928, 244, 276, lines=1)
    s += photo(b, 'fill.kiosk_touch', 916, 312, 300, 120, pos='30% 35%', hint='매장 키오스크 주문 장면', radius=12)
    s += label_on(b, '매장 · 키오스크 KM24C', '품절 메뉴 주문 막음', 1016, 372, 188, lines=1)
    # table
    cols = [(64, '흐름'), (254, '방향'), (454, '주기'), (654, '형식'), (834, '장애 시')]
    for x, t in cols:
        s += b.tb(t, ab(x + 4, 450, 160, 18, f'font-size: 12px; font-weight: 700; color: {MUTED}; white-space: nowrap'), 'div')
    s += hline(64, 472, 1152, INK, 2)
    flows = [('품절 · 실시간', (BLUE, '#ffffff', BLUE), 'POS → 화면', '실시간', 'JSON', '마지막 값 유지 + 알림'),
             ('가격 · 일 1회', ('#ffffff', BODY, '#b8bec8'), 'ERP → 화면', '일 1회 06시', 'CSV', '전날 가격 유지'),
             ('프로모션 · 예약', (CHIP, BLUE, CHIP), '본사 → 화면', '예약', '콘텐츠', '기본 화면으로 복귀')]
    for j, (nm, (bg, c, bd), d, per, fmt, fail) in enumerate(flows):
        y = 474 + j * 56
        s += hline(64, y + 56, 1152)
        s += b.tb(nm, ab(68, y + 16, None, 24, f'box-sizing: border-box; height: 24px; padding: 0 10px; border-radius: 999px; background: {bg}; border: 1.2px solid {bd}; color: {c}; font-size: 12px; font-weight: 800; display: flex; align-items: center; white-space: nowrap'), 'div')
        for x, t in [(254, d), (454, per), (654, fmt)]:
            s += b.tb(t, ab(x + 4, y + 17, 190, 22, f'font-size: 14.5px; font-weight: 800; line-height: 22px; white-space: nowrap'), 'div')
        s += row(b.tb('✓', f'width: 18px; height: 18px; flex-shrink: 0; border-radius: 50%; background: {CHIP}; color: {BLUE}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center')
                 + b.tb(fail, f'font-size: 14px; color: {INK}; white-space: nowrap'), 8, f'position: absolute; left: 838px; top: {y + 17}px; height: 22px')
    s += footer(b, foot('A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 주기 · 형식은 POS 벤더 협의로 확정', '외식 · 카페', '화면은 솔루션 소개 이미지'), 39)
    return s


# ---------------------------------------------------------------- 6 파일럿 설계 · 후보 지점 사진 (원본 L_PL_B)
def dots(b, n, size=9, gap=3, color=BLUE):
    return ('<span style="display: inline-flex; gap: %dpx">' % gap
            + ''.join(f'<span style="width: {size}px; height: {size}px; box-sizing: border-box; border-radius: 50%; '
                      + (f'background: {color}' if k < n else f'border: 1.5px solid {color}; background: #ffffff') + '"></span>' for k in range(3)) + '</span>')


@layout(L, f='L_PH_PL_B', code='PH-PL-B', p='execution', p2=None, name='파일럿 설계 · 선정 지점 사진',
        when='시범 대상 · 기간 · 측정 지표를 정할 때, 선정한 지점을 사진 카드로 크게 보여 주고 비교군 · 12주 일정 · 지표를 함께 정리할 때',
        pv=['L_PL_B'], sample='T 은행', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 파일럿 · 확산', '시범 지점 세 곳은 이렇게 고릅니다', '후보 6곳 × 선정 기준 · 기간 12주 · 측정 지표와 비교군', w=1152)
    crit = ['방문객', '고객 연령', '창구 수', '네트워크', '지점장 의지']
    picks = [('가 지점', '도심 · 대형', [3, 2, 3, 3, 3], '방문객 · 창구가 많아 처리 시간 효과를 보기 좋음', '나 지점', 'ph.fn-branch', '50% 50%'),
             ('다 지점', '주거지 · 중형', [2, 3, 2, 3, 3], '고령 고객 비중이 높아 쉬운 화면 효과를 볼 수 있음', '라 지점', 'ph.fn-tab-banker', '50% 40%'),
             ('마 지점', '대학가 · 소형', [1, 1, 1, 3, 3], '규모는 작지만 회선 · 지점장 의지가 충분함', '바 지점', 'ph.fn-tab-customer', '50% 30%')]
    for k, (nm, typ, sc, why, pair, pid, pos) in enumerate(picks):
        x = 64 + k * 316
        s += box(x, 152, 300, 284, '#ffffff', 12, f'border: 1.5px solid {BLUE}')
        s += photo(b, pid, x + 6, 158, 288, 150, pos=pos, hint=f'{nm} 영업점 사진 (T 은행 후보 지점으로 교체)', radius=8)
        s += pill(b, '선정', extra=f'position: absolute; left: {x + 16}px; top: 168px')
        s += label_on(b, typ, nm, x + 16, 250, 120, lines=1)
        cells = ''.join(f'<span style="display: flex; flex-direction: column; align-items: center; gap: 4px; width: 54px">'
                        + b.tb(c, f'font-size: 10.5px; font-weight: 700; color: {MUTED}; white-space: nowrap') + dots(b, v) + '</span>' for c, v in zip(crit, sc))
        s += f'<div style="{ab(x + 8, 318, 284, 34, "display: flex; justify-content: space-between")}">{cells}</div>'
        s += hline(x + 16, 360, 268)
        s += card(dline(b, why, 12.5, 18, 2, INK) + evid(b, f'비교군 → {pair}').replace('align-self: flex-start', 'align-self: flex-start; margin-top: auto'),
                  x + 6, 364, 288, 68, bg='transparent', pad='6px 10px 2px', gap=4)
    # 비교군 — one gray photo + 3 rows
    s += box(1012, 152, 204, 284, SOFT, 12)
    s += photo(b, 'ph.fn-branch-gray', 1012, 152, 204, 116, pos='50% 50%', hint='비교군 영업점 · 지금 그대로 (흑백 처리)', radius=12)
    s += tag_on(b, '비교군 · 지금 그대로', 1022, 162, size=11)
    for k, (nm, typ) in enumerate([('나 지점', '도심 · 대형'), ('라 지점', '주거지 · 중형'), ('바 지점', '대학가 · 소형')]):
        y = 278 + k * 46
        if k:
            s += hline(1026, y - 2, 176)
        s += (f'<div style="{ab(1028, y, 176, 42, "display: flex; flex-direction: column; justify-content: center; gap: 1px")}">'
              + b.tb(nm, 'font-size: 14px; font-weight: 800; white-space: nowrap') + b.tb(typ, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + '</div>')
    s += row(dots(b, 2) + b.tb('점수 3단계 · 예시', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap')
             + f'<span style="width: 1px; height: 12px; background: {LINE}"></span>'
             + b.tb('유형마다 1곳 선정 · 같은 유형 1곳은 비교군', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap'), 8, 'position: absolute; left: 64px; top: 444px; height: 18px')
    # 12주
    s += lab(b, '기간 12주', BLUE, 13).replace('<span style="', f'<span style="position: absolute; left: 64px; top: 476px; ', 1)
    WX, WW = 64, 46
    for w in range(12):
        s += b.tb(f'W{w + 1}', ab(WX + w * WW, 500, WW, 14, f'{NUM}; font-size: 10.5px; font-weight: 700; color: {FAINT}; text-align: center'), 'div')
    for a, z, t, sub, bg, c in [(0, 2, '준비 2주', '설치 · 직원 교육', '#b9c4ef', INK), (2, 10, '운영 8주', '실사용 · 지표 수집 · 비교군 동시 측정', BLUE, '#ffffff'), (10, 12, '평가 2주', '분석 · 확산 판단', '#6f80d6', '#ffffff')]:
        x = WX + a * WW + 2; w = (z - a) * WW - 4
        s += b.tb(t, ab(x, 518, w, 34, f'border-radius: 6px; background: {bg}; color: {c}; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
        s += b.tb(sub, ab(x, 558, w, 16, f'font-size: 11.5px; color: {MUTED}; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
    s += row(b.tb('비교군 3곳과 같은 기간 비교', f'height: 26px; padding: 0 12px; border-radius: 999px; background: {CHIP}; color: {BLUE}; font-size: 12.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
             + b.tb('목표는 시범 시작 전 고객과 합의', f'font-size: 12.5px; color: {MUTED}; white-space: nowrap'), 10, 'position: absolute; left: 64px; top: 600px; height: 28px')
    # 측정 지표
    MX = 648
    s += lab(b, '측정 지표', BLUE, 13).replace('<span style="', f'<span style="position: absolute; left: {MX}px; top: 476px; ', 1)
    for x, t in [(MX, '지표'), (MX + 200, '측정 방법'), (MX + 330, '도입 전'), (MX + 450, '목표')]:
        s += b.tb(t, ab(x + 2, 500, 120, 16, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap'), 'div')
    s += hline(MX, 520, 1216 - MX, INK, 2)
    for j, (nm, sub, how, now, tgt) in enumerate([('창구 처리 시간', '건당 평균', '시스템 로그', '[00]분', '−[00]%'), ('종이 서식', '지점 · 월', '출력 건수', '[0,000]장', '−[00]%'),
                                                   ('고객 만족', '5점 척도', '출구 설문', '[0.0]', '+[0.0]'), ('직원 업무 부담', '5점 척도', '설문', '[0.0]', '−[0.0]')]):
        y = 522 + j * 31
        s += hline(MX, y + 31, 1216 - MX)
        s += row(b.tb(nm, 'font-size: 13.5px; font-weight: 800; white-space: nowrap') + b.tb(sub, f'font-size: 11px; color: {MUTED}; white-space: nowrap'), 6, f'position: absolute; left: {MX + 2}px; top: {y + 5}px; height: 22px')
        s += b.tb(how, ab(MX + 202, y + 6, 120, 20, f'font-size: 12.5px; color: {BODY}; white-space: nowrap'), 'div')
        s += b.tb(now, ab(MX + 332, y + 5, 110, 22, f'{NUM}; font-size: 13.5px; font-weight: 800; color: {BODY}; white-space: nowrap'), 'div')
        s += b.tb(tgt, ab(MX + 452, y + 4, 110, 24, f'{NUM}; font-size: 16px; font-weight: 800; color: {BLUE}; white-space: nowrap'), 'div')
    s += footer(b, foot('T 은행 · 영업점 디지털 창구 제안 · 지점 이름은 익명(가–바)', '금융', '후보 6곳 전체 점수표 부록 p.[00]'), 41)
    return s


# ---------------------------------------------------------------- 7 (새 장) 설치 하룻밤 · 시간대 사진
@layout(L, f='L_PH_EX_A', code='PH-EX-A', p='execution', p2=None, name='설치 하룻밤 · 시간대별 사진',
        when='매장 영업을 멈추지 않고 하룻밤에 설치하는 과정을, 마감부터 오픈까지 시간대별 사진 · 할 일 · 담당으로 보여 줄 때',
        pv=['L_IP_C'], sample='A 커피', grp=GRP)
def _(b):
    s = header(b, '09 · 실행 계획 — 설치 · 시공', '밤 10시에 닫고, 아침 6시에 새 메뉴판으로 엽니다', '매장 1곳의 설치 하룻밤 · 22:00 → 06:00 · 시간대별 할 일 · 담당', w=880)
    s += b.tb('매장당 하룻밤 · 영업 중단 없음', f'position: absolute; right: 64px; top: 112px; height: 26px; padding: 0 12px; border-radius: 999px; background: {CHIP}; color: {BLUE}; font-size: 12.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap', 'div')
    steps = [('22:00', '마감 · 보양', '영업 종료 · 손님 퇴장 확인 · 카운터 · 바닥에 보양재', '매장 점장 · 설치 협력사', 'fill.cafe_night', '50% 50%', '영업 종료 뒤 매장 (A 커피 매장 야간 사진으로 교체)'),
             ('22:30', '기존 메뉴판 철거', '기존 메뉴판 · 브래킷 철거 · 전원 · 배선 위치 확인', '설치 협력사', 'ph.fb-counter-gray', '50% 20%', '철거 전 기존 메뉴판 (철거 작업 사진으로 교체)'),
             ('23:30', '설치', 'QM55C × 3 거치 · 수평 맞춤 · 전원 · 네트워크 연결', '설치 협력사 · 삼성 감리', 'ph.svc-technician', '40% 30%', '설치 작업 장면 (실제 설치 사진으로 교체)'),
             ('02:00', '시운전', 'MagicINFO 등록 · 메뉴 콘텐츠 배포 · POS 품절 연동 시험', '삼성 엔지니어 · SI 파트너', 'fill.phone_signage', '50% 40%', '시운전 · 콘텐츠 확인 장면'),
             ('05:00', '복구 · 오픈 준비', '보양재 걷기 · 청소 · 점장 확인 서명 → 06:00 오픈', '설치 협력사 · 매장 점장', 'ph.fb-counter-menu', '50% 30%', '새 메뉴판으로 연 매장 (설치 뒤 사진으로 교체)')]
    W, G = 220, 13
    # time rail
    s += hline(64 + 10, 166, 1152 - 20, '#b8bec8', 2)
    for i, (t, nm, todo, who, pid, pos, hint) in enumerate(steps):
        x = 64 + i * (W + G)
        s += numtag(b, str(i + 1), 24).replace('<span style="', f'<span style="position: absolute; left: {x}px; top: 154px; ', 1)
        s += b.tb(t, ab(x + 30, 152, None, 28, f'{NUM}; font-size: 20px; font-weight: 800; line-height: 28px; color: {BLUE if i in (0, 4) else INK}; white-space: nowrap; background: #ffffff; padding: 0 8px 0 4px'), 'div')
        s += photo(b, pid, x, 188, W, 220, pos=pos, hint=hint, radius=12)
        s += card(tline(b, nm, 16, 24) + dline(b, todo, 13, 19, 3, BODY)
                  + f'<span style="height: 1px; background: {LINE}; margin-top: auto"></span>'
                  + row(b.tb('담당', f'font-size: 11.5px; font-weight: 800; color: {BLUE}; white-space: nowrap')
                        + b.tb(who, f'font-size: 12px; font-weight: 700; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0'), 8),
                  x, 416, W, 146, bg=SOFT, pad='12px 14px', gap=5)
    # checks
    s += box(64, 576, 1152, 72, CHIP, 12)
    s += (f'<div style="{ab(84, 576, 210, 72, "display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
          + b.tb('다음 날 06시 오픈에', f'font-size: 13px; font-weight: 700; color: {BLUE}; white-space: nowrap') + b.tb('지장 없음', 'font-size: 19px; font-weight: 800; line-height: 26px; white-space: nowrap') + '</div>')
    for k, (t, d) in enumerate([('전원 · 네트워크 이상 없음', '03시 시운전 체크리스트로 확인'), ('품절 · 가격이 POS와 일치', '시험 주문 1건으로 화면 반영 확인'), ('카운터 · 바닥 원상 복구', '점장 확인 서명 · 전후 사진 기록')]):
        x = 300 + k * 305
        s += row(b.tb('✓', f'width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%; background: {BLUE}; color: #ffffff; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center')
                 + '<span style="display: flex; flex-direction: column; gap: 1px; min-width: 0">' + b.tb(t, 'font-size: 14px; font-weight: 800; line-height: 20px; white-space: nowrap')
                 + b.tb(d, f'font-size: 12px; color: {BODY}; white-space: nowrap') + '</span>', 10, f'position: absolute; left: {x}px; top: 588px; height: 48px; width: 290px')
    s += footer(b, foot(DEAL['FB'], '외식 · 카페', '시간은 예시 · 매장 1곳 기준'), 38)
    return s
