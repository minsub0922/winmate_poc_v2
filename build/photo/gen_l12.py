# 4차 — 공간 맵: 업종별 '공간 맵'(L_SS_xx_A)의 사진 버전 (ind 지정)
# 평면도 대신 대표 공간 사진 한 장 + 나머지 여섯 공간 사진, 공간마다 번호 · 이름 · 그 공간의 가치 · 놓는 제품.
# 아래 띠는 원본의 '전체 구성'(솔루션 → 하는 일 → 공간 번호). 데이터: r4data/ss_a.py
from gen_ind import *
from r4data.ss_a import D
L = []

TX, TW, TH, TG = 500, 230, 172, 12   # tiles: left · width · height · gap
Y0 = 152


def big(b, d):
    no, nm, pid, pos, who, prods, val = d['big']
    s = photo(b, pid, 64, Y0, 420, 2 * TH + TG, pos=pos, hint=f'{no} {nm} — 대표 공간 사진', radius=16)
    s += glass('<span style="display: flex; align-items: center; gap: 8px">' + numtag(b, no, 24)
               + b.tb(nm, 'font-size: 17px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
               + b.tb('대표 공간', f'flex-shrink: 0; font-size: 11px; font-weight: 800; color: {LB}') + '</span>'
               + b.tb(val, f'font-size: 14px; font-weight: 800; line-height: 1.4; color: #ffffff; {clamp(2)}')
               + b.tb(who, f'font-size: 11.5px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
               + b.tb(prods, f'font-size: 11.5px; font-weight: 700; color: {LB}; {clamp(2)}'), 76, Y0 + 2 * TH + TG - 132, 396, 120, pad='10px 14px', gap=4)
    return s


def tile(b, i, t):
    no, nm, pid, pos, prods, val = t
    x = TX + (i % 3) * (TW + TG); y = Y0 + (i // 3) * (TH + TG)
    s = photo(b, pid, x, y, TW, TH, pos=pos, hint=f'공간 {no} · {nm} 사진', radius=12)
    s += glass('<span style="display: flex; align-items: center; gap: 6px">' + numtag(b, no, 18)
               + b.tb(nm, 'font-size: 13px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
               + b.tb(val, f'font-size: 11.5px; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
               + b.tb(prods, f'font-size: 10.5px; font-weight: 600; color: {LB}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
               x + 6, y + TH - 70, TW - 12, 64, pad='6px 10px', gap=1, extra='border-radius: 9px')
    return s


def stack(b, d):
    y = Y0 + 2 * TH + TG + 16; h = 648 - y
    sols = d['sols']
    s = f'<div style="{ab(64, y, 1152, h, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 12px 16px; display: flex; gap: 14px")}">'
    s += ('<span style="width: 132px; flex-shrink: 0; display: flex; flex-direction: column; gap: 3px">' + b.tb('전체 구성', 'font-size: 15px; font-weight: 800')
          + b.tb('솔루션 → 하는 일 → 공간 번호', f'font-size: 11px; color: {MUTED}') + b.tb(d.get('qty', '수량은 실사 후 확정'), f'margin-top: auto; font-size: 11px; color: {FAINT}') + '</span>')
    for nm, does, sp in sols:
        s += (f'<span style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding-left: 14px; border-left: 1px solid {LINE}">'
              + b.tb(nm, f'font-size: 13.5px; font-weight: 800; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(does, f'font-size: 11.5px; line-height: 1.45; color: {BODY}; {clamp(2)}')
              + '<span style="margin-top: auto; display: flex; gap: 3px; flex-wrap: wrap">'
              + ''.join(numtag(b, n, 18) for n in sp.split('·')) + '</span></span>')
    return s + '</div>'


for code, d in D.items():
    f0 = f'L_SS_{code}_A'
    eb, hl, sub = HDR[f0]; sub = d.get('sub', sub); hl = d.get('hl', hl)
    note, page = foot(f0, code)

    @layout(L, f=f'L_PH_SS_{code}_A', code=f'PH-SS-{code}-A', p='scenario', p2='dss', ind=code, name=f'{NAMES[code]} · 공간 맵 · 공간 사진 7',
            when=f'{NAMES[code]} 고객사 한 사업장의 일곱 공간을 평면도 대신 공간 사진으로 — 공간마다 가치 · 놓는 제품, 아래는 솔루션 전체 구성',
            pv=[f0], sample=ORIG[f0]['sample'], grp='공간 · 제품')
    def _(b, code=code, d=d, eb=eb, hl=hl, sub=sub, note=note, page=page):
        s = header(b, eb, hl, sub, w=1152)
        s += big(b, d)
        for i, t in enumerate(d['tiles']): s += tile(b, i, t)
        s += stack(b, d)
        s += footer(b, note, page)
        return s
