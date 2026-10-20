# 4차 — 하루 시나리오: 업종별 '하루 시나리오'(L_SS_xx_C)의 사진 버전 (ind 지정)
# 역할 × 시간대 격자 대신 시간대 다섯 칸 — 칸마다 그 시간의 현장 사진, 그 시간의 장면 둘(누가 · 몇 시 · 어느 공간 · 무엇이 · 달라지는 것).
# 아래 띠는 원본의 '비수기 · 특별 일정' 등 이어지는 장면. 데이터: r4data/ss_c.py
from gen_ind import *
from r4data.ss_c import D
L = []

X0, GAP = 64, 14
CW = (1152 - GAP * 4) / 5
WHO = {'이용': ('#eaeefb', BLUE), '운영': ('#fdf0ea', WARN)}


def scene(b, sc):
    who, kind, t, sp, txt, eff = sc
    bg, fg = WHO.get(kind, WHO['이용'])
    return ('<span style="display: flex; flex-direction: column; gap: 3px; min-width: 0">'
            + '<span style="display: flex; align-items: center; gap: 6px; min-width: 0">'
            + b.tb(who, f'flex-shrink: 0; height: 18px; padding: 0 7px; border-radius: 999px; background: {bg}; color: {fg}; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
            + b.tb(t, f'{NUM}; flex-shrink: 0; font-size: 12px; font-weight: 800; color: {INK}')
            + b.tb(sp, f'min-width: 0; font-size: 10.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
            + b.tb(txt, f'font-size: 12.5px; line-height: 1.45; color: {INK}; {clamp(2)}')
            + b.tb('→ ' + eff, f'font-size: 11.5px; font-weight: 800; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>')


def period(b, i, p):
    nm, tm, pid, pos, scenes = p
    x = round(X0 + i * (CW + GAP)); w = round(CW)
    s = (f'<div style="{ab(x, 150, w, 26, "display: flex; align-items: baseline; justify-content: space-between; gap: 6px")}">'
         + b.tb(nm, 'font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
         + b.tb(tm, f'{NUM}; flex-shrink: 0; font-size: 12px; font-weight: 800; color: {BLUE}') + '</div>')
    s += f'<div style="{ab(x, 178, w, 3, f"border-radius: 2px; background: {BLUE if i % 2 == 0 else "#5b6fd6"}")}"></div>'
    s += photo(b, pid, x, 188, w, 178, pos=pos, hint=f'{nm} {tm} 장면 사진', radius=10)
    s += f'<div style="{ab(x, 378, w, 186, "display: flex; flex-direction: column; gap: 12px")}">' + ''.join(scene(b, sc) for sc in scenes) + '</div>'
    return s


def extra(b, d):
    y = 572
    s = f'<div style="{ab(64, y, 1152, 76, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 10px 16px; display: flex; align-items: center; gap: 16px")}">'
    s += b.tb(d['extra_title'], 'width: 120px; flex-shrink: 0; font-size: 14px; font-weight: 800; line-height: 1.35')
    for tag, txt in d['extra']:
        s += (f'<span style="flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; padding-left: 14px; border-left: 1px solid {LINE}">'
              + b.tb(tag, f'flex-shrink: 0; height: 20px; padding: 0 8px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
              + b.tb(txt, f'min-width: 0; font-size: 12px; line-height: 1.45; color: {BODY}; {clamp(2)}') + '</span>')
    return s + '</div>'


for code, d in D.items():
    f0 = f'L_SS_{code}_C'
    eb, hl, sub = HDR[f0]; sub = d.get('sub', sub); hl = d.get('hl', hl)
    note, page = foot(f0, code, '시간 · 수치는 예시')

    @layout(L, f=f'L_PH_SS_{code}_C', code=f'PH-SS-{code}-C', p='scenario', ind=code, name=f'{NAMES[code]} · 하루 시나리오 · 시간대 사진 5',
            when=f'{NAMES[code]} 고객사의 하루를 시간대 다섯 칸으로 — 칸마다 현장 사진과 이용 · 운영 장면 둘, 아래는 이어지는 일정',
            pv=[f0], sample=ORIG[f0]['sample'], grp='공간 · 제품')
    def _(b, code=code, d=d, eb=eb, hl=hl, sub=sub, note=note, page=page):
        s = header(b, eb, hl, sub, w=1152)
        for i, p in enumerate(d['periods']): s += period(b, i, p)
        s += extra(b, d)
        s += footer(b, note, page)
        return s
