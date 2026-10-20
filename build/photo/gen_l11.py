# 4차 — 고객 여정: 업종별 '고객 여정'(L_MI_xx_C)의 사진 버전 (ind 지정)
# 왼쪽 손님 유형 세 줄, 오른쪽 다섯 단계 — 단계마다 현장 사진 · 감정 곡선(지금 / 삼성 적용 후) · 손님 · 직원 고민 · 삼성 개입.
# 원본의 단계 이름 · 고민 · 제품 · 솔루션을 그대로 옮기고 긴 문장만 줄임. 데이터: r4data/mi_c.py
from gen_ind import *
from r4data.mi_c import D
L = []

X0, X1 = 332, 1216          # stage area
GAP = 12
CW = (X1 - X0 - GAP * 4) / 5  # column width ≈ 167
YH, YP, PH = 148, 190, 132   # stage title · photo top · photo height
YC, CH = YP + PH + 8, 64     # emotion curve band
YQ = YC + CH + 6             # pains
YS = YQ + 118                # samsung box


def segs(b, d):
    s = photo(b, d['segs_photo'][0], 64, 148, 252, 112, pos=d['segs_photo'][1], hint=f"{d['segs_title']} 사진", radius=14, kind='people')
    s += f'<div style="{ab(64, 252, 252, 396, f"box-sizing: border-box; border-radius: 0 0 14px 14px; background: {SOFT}; padding: 14px 16px 14px; display: flex; flex-direction: column; gap: 9px")}">'
    s += ('<span style="display: flex; flex-direction: column; gap: 2px">' + b.tb(d['segs_title'], 'font-size: 16px; font-weight: 800')
          + b.tb(d['segs_note'], f'font-size: 11px; color: {FAINT}') + '</span>')
    for i, (nm, pct, need) in enumerate(d['segs']):
        s += (f'<span style="display: flex; flex-direction: column; gap: 3px; padding-top: 10px; border-top: 1px solid {LINE}">'
              + '<span style="display: flex; align-items: baseline; gap: 6px">'
              + f'<i style="width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; background: {["#1428a0", "#5b6fd6", "#a7b3ea"][i]}"></i>'
              + b.tb(nm, 'flex: 1; min-width: 0; font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(pct, f'{NUM}; font-size: 15px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>'
              + b.tb(need, f'font-size: 12px; line-height: 1.5; color: {BODY}; {clamp(3)}') + '</span>')
    s += (f'<span style="margin-top: auto; border-radius: 10px; background: #ffffff; padding: 9px 11px; display: flex; flex-direction: column; gap: 2px">'
          + b.tb(d.get('common_label', '모든 유형 공통'), f'font-size: 11px; font-weight: 800; color: {BLUE}') + b.tb(d['common'], f'font-size: 12px; line-height: 1.45; color: {INK}; {clamp(3)}') + '</span>')
    return s + '</div>'


def curve(b, stages):
    """emotion curve over the five photos: grey = now, blue dashed = with Samsung (0 low … 4 high)"""
    xs = [X0 + CW / 2 + i * (CW + GAP) for i in range(5)]
    yv = lambda v: YC + 10 + (4 - v) * (CH - 22) / 4
    now = ' '.join(f'{x - X0:.0f},{yv(st[9]) - YC:.0f}' for x, st in zip(xs, stages))
    aft = ' '.join(f'{x - X0:.0f},{yv(st[10]) - YC:.0f}' for x, st in zip(xs, stages))
    w = X1 - X0
    s = (f'<svg style="{ab(X0, YC, w, CH)}" width="{w}" height="{CH}" viewBox="0 0 {w} {CH}" aria-hidden="true">'
         f'<line x1="0" y1="{CH - 2}" x2="{w}" y2="{CH - 2}" stroke="{LINE}" stroke-width="1"/>'
         f'<polyline points="{now}" fill="none" stroke="#9aa1ad" stroke-width="2"/>'
         f'<polyline points="{aft}" fill="none" stroke="{BLUE}" stroke-width="2.5" stroke-dasharray="6 4"/>')
    for x, st in zip(xs, stages):
        s += f'<circle cx="{x - X0:.0f}" cy="{yv(st[9]) - YC:.0f}" r="4" fill="#ffffff" stroke="#9aa1ad" stroke-width="2"/>'
        s += f'<circle cx="{x - X0:.0f}" cy="{yv(st[10]) - YC:.0f}" r="4.5" fill="{BLUE}"/>'
    s += '</svg>'
    return s


def legend(b, d):
    return (f'<div style="{ab(X0, YS + 112, X1 - X0, 18, f"display: flex; align-items: center; gap: 14px; font-size: 11px; color: {MUTED}")}">'
            + b.tb(d.get('who', '손님') + ' 감정', f'font-weight: 800; color: {BODY}; white-space: nowrap')
            + '<span style="display: flex; align-items: center; gap: 5px"><i style="width: 18px; height: 0; border-top: 2px solid #9aa1ad"></i>' + b.tb('지금', 'white-space: nowrap') + '</span>'
            + f'<span style="display: flex; align-items: center; gap: 5px"><i style="width: 18px; height: 0; border-top: 2.5px dashed {BLUE}"></i>' + b.tb('삼성 적용 후', 'white-space: nowrap') + '</span>'
            + f'<span style="display: flex; align-items: center; gap: 5px"><i style="width: 14px; height: 10px; box-sizing: border-box; border: 2px solid {BLUE}; border-radius: 3px"></i>' + b.tb('결정적 순간 — 고객사를 평가하는 단계', 'white-space: nowrap') + '</span></div>')


def stage(b, i, st, d=None):
    d = d or {}
    nm, place, pid, pos, pain, staff, prod, does, sol, now, aft, key = st
    x = round(X0 + i * (CW + GAP)); w = round(CW)
    s = (f'<div style="{ab(x, YH, w, 39, "display: flex; flex-direction: column; gap: 1px")}">'
         + '<span style="display: flex; align-items: center; gap: 6px">' + numtag(b, str(i + 1), 20)
         + b.tb(nm, 'font-size: 14px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
         + b.tb(place, f'font-size: 11px; color: {MUTED}; padding-left: 26px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += photo(b, pid, x, YP, w, PH, pos=pos, hint=f'{i + 1} {nm} · {place} 사진', radius=10)
    if key:
        s += pill(b, '결정적 순간', extra='position: absolute; left: %dpx; top: %dpx' % (x + 8, YP + 8)).replace('align-self: flex-start; ', '')
        s += f'<div style="{ab(x - 4, YP - 4, w + 8, YS + 104 - YP + 8, f"box-sizing: border-box; border: 2px solid {BLUE}; border-radius: 14px; pointer-events: none")}"></div>'
    s += (f'<div style="{ab(x, YQ, w, 110, "display: flex; flex-direction: column; gap: 6px")}">'
          + '<span style="display: flex; flex-direction: column; gap: 1px">' + b.tb(d.get('who', '손님'), f'font-size: 10.5px; font-weight: 800; color: {WARN}')
          + b.tb(pain, f'font-size: 12.5px; font-weight: 700; line-height: 1.45; color: {INK}; {clamp(2)}') + '</span>'
          + '<span style="display: flex; flex-direction: column; gap: 1px">' + b.tb(d.get('staff_label', '직원 · 운영'), f'font-size: 10.5px; font-weight: 800; color: {MUTED}')
          + b.tb(staff, f'font-size: 12px; line-height: 1.45; color: {BODY}; {clamp(2)}') + '</span></div>')
    s += (f'<div style="{ab(x, YS, w, 104, f"box-sizing: border-box; border-radius: 10px; background: {BLUE}; padding: 9px 11px; display: flex; flex-direction: column; gap: 3px")}">'
          + b.tb(prod, f'font-size: 12.5px; font-weight: 800; line-height: 1.35; color: #ffffff; {clamp(2)}')
          + b.tb(does, f'font-size: 11.5px; line-height: 1.45; color: {LT}; {clamp(2)}')
          + b.tb('+ ' + sol, f'margin-top: auto; font-size: 11px; font-weight: 700; color: {LB}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    return s


for code, d in D.items():
    eb, hl, sub = HDR[f'L_MI_{code}_C']; sub = d.get('sub', sub); hl = d.get('hl', hl)
    note, page = foot(f'L_MI_{code}_C', code, '비중 · 감정 곡선은 예시')

    @layout(L, f=f'L_PH_MI_{code}_C', code=f'PH-MI-{code}-C', p='customer', p2='user', ind=code, name=f'{NAMES[code]} · 고객 여정 · 사진',
            when=f'{NAMES[code]} 고객사의 손님 유형과 방문 여정 다섯 단계를, 단계마다 현장 사진 · 감정 곡선 · 삼성 개입으로 보여줄 때',
            pv=[f'L_MI_{code}_C'], sample=ORIG[f'L_MI_{code}_C']['sample'], grp='분석 · 이해')
    def _(b, code=code, d=d, eb=eb, hl=hl, sub=sub, note=note, page=page):
        s = header(b, eb, hl, sub, w=1152)
        s += segs(b, d)
        s += curve(b, d['stages'])
        for i, st in enumerate(d['stages']): s += stage(b, i, st, d)
        s += legend(b, d)
        s += footer(b, note, page)
        return s
