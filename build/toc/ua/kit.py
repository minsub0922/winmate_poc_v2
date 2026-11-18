# 당사의 이해 — 업종 묶음별 새 장(L_TOC_UA_<묶음>_<항목>)을 그리는 도구.
#   디자인 체계는 목차 템플릿 장과 같다(build/toc/base.py). 글 칸은 처음부터 글자 역할을 구워 넣는다(typed.TT) —
#   그래서 글자 크기는 역할 크기(12 · 14 · 16 · 18 · 20 · 24 · 32 · 40 · 48 · 56)만 쓴다.
#   숫자는 고객사마다 다르므로 00 으로 둔다(Z) — 제안서 작성자가 직접 넣는다.
import sys, os, math, re
_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_HERE, '..'))
from base import *            # 색 · NUMF · svg_icon · ICONS · f · esc
from typed import TT

Z = '00'                                       # 작성자가 직접 넣는 숫자
C1, C2, C3, C4 = BLUE, '#5b72e0', '#9aaaf0', '#d3dbfb'   # 계열 색(진한 → 옅은)
SOFT = '#c9d2f3'
WHITE = '#ffffff'
W88 = 'rgba(255,255,255,0.88)'                 # 파란 바탕 위 보조 글
GLASS = 'rgba(255,255,255,0.16)'               # 파란 바탕 위 아이콘 바탕
NUM = f'font-family: {NUMF}'

ICONS.update({
  'bed': 'M3 7v11 M3 14h18 M21 18v-5a3 3 0 0 0-3-3h-7v4 M7.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  'cross': 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  'building': 'M5 21V4h10v17 M15 9h4v12 M8 8h4 M8 12h4 M8 16h4 M3 21h18',
  'cap': 'M2 9l10-5 10 5-10 5z M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5 M22 9v6',
  'cart': 'M3 4h2l2.4 11h10.2L20 7H6.2 M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  'tag': 'M3 12V4h8l10 10-8 8z M7.5 8.5h.01',
  'truck': 'M2 6h11v10H2z M13 9h5l4 4v3h-9 M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  'gear': 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1',
  'lock': 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  'eye': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'mic': 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M6 11a6 6 0 0 0 12 0 M12 17v4 M9 21h6',
  'ticket': 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z M14 6v12',
  'cup': 'M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z M17 10h2a2 2 0 0 1 0 4h-2 M8 3v2 M12 3v2',
  'card': 'M3 6h18v12H3z M3 10h18 M7 15h4',
  'megaphone': 'M3 10v4h3l8 4V6l-8 4z M17.5 9a4 4 0 0 1 0 6 M7 14v4h3',
  'camera': 'M4 8h3l2-3h6l2 3h3v11H4z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  'bank': 'M3 10l9-6 9 6 M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 21h18 M3 18h18',
  'bus': 'M5 4h14a1 1 0 0 1 1 1v12H4V5a1 1 0 0 1 1-1z M4 11h16 M7 17v3 M17 17v3 M8 14.5h.01 M16 14.5h.01',
  'factory': 'M3 21V10l6 4v-4l6 4V5h6v16z M7 17h2 M12 17h2 M17 17h1',
  'flask': 'M9 3h6 M10 3v6l-5 10a1.5 1.5 0 0 0 1.4 2h11.2A1.5 1.5 0 0 0 19 19l-5-10V3 M7.5 15h9',
  'dumbbell': 'M3 9v6 M6 6v12 M6 12h12 M18 6v12 M21 9v6',
  'fork': 'M6 3v7a2 2 0 0 0 4 0V3 M8 3v18 M17 3c-2 2-3 5-3 8h3v10',
  'person': 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  'sign': 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  'heart': 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  'door': 'M6 21V4h10v17 M4 21h16 M13 12h.01',
  'star': 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z',
  'scan': 'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M8 12h8',
  'server': 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01',
  'link': 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  'drop': 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  'dust': 'M5 8h.01 M9 5h.01 M14 7h.01 M18 5h.01 M7 12h.01 M12 11h.01 M17 12h.01 M5 16h.01 M10 16h.01 M15 17h.01 M19 16h.01',
  'bag': 'M5 8h14l-1 13H6z M9 8V6a3 3 0 0 1 6 0v2',
})


class UA(TT):
    """글자 역할을 구운 장 + 같은 칸 이름을 두 번 쓰면 바로 알린다(조립기가 칸 이름으로 채우므로)."""
    def tb(self, style, content, tag='div', plain_text=None, name=None):
        if name and name in self.names: raise ValueError(f'{self.fid}: 칸 이름 {name} 이 겹친다')
        return super().tb(style, content, tag, plain_text, name)

    def pic(self, *a, name=None, **k):
        if name and name in self.imgnames: raise ValueError(f'{self.fid}: 그림 칸 이름 {name} 이 겹친다')
        return super().pic(*a, name=name, **k)


PART_NAME = '시장 분석 (MI)'  # 목록에서 쓰는 파트 이름(사용자 지시 2026-11-16: 당사의 이해 → 고객사의 이해 → 시장 분석 (MI)) — 앱의 목차 이름은 아직 '당사의 이해'


def sheet(fid, sub, title):
    """새 장 — 눈썹 '01 · 시장 분석 (MI) · <항목>' + 제목 한 줄. 파트 이름은 목록 이름을 쓴다(admin part-flows.js PART_CATALOG.names.ua)"""
    s = UA(fid); s.head2('01 · ' + PART_NAME + ' · ' + sub, title)
    return s


def done(s, cluster, page, label, form, when, group='know'):
    """꼬리말을 달고 장 정보를 돌려준다 — label: 항목 이름 · form: 장의 모양 · when: 쓰는 상황 · group: know(고객 이해) | compete(경쟁 우위).
    zero: 작성자가 직접 넣는 숫자(00)가 있는 장"""
    s.foot2(f"{cluster['cust']} · {cluster['ai']} 표준 제안서", page)
    zero = any(re.search(r'(?<!\d)00(?!\d)', t) for t in s.texts)
    return {'f': s.fid, 'code': s.fid[2:].replace('_', '-'), 'label': label, 'form': form, 'name': f"{cluster['name']} · {label}", 'when': when, 'zero': zero, 'group': group,
            'html': s.html(), 'slots': {'t': s.names, 'img': s.imgnames}, 'nT': s.ntb, 'nI': s.nimg}


# ------------------------------------------------------------------ 글 · 숫자
def cap(s, x, y, text, name=None, color=INK, w=320):
    """칸 머리말 — 18 · 800"""
    return s.t(x, y, w, text, 18, 800, color, 1.3, name=name, nowrap=True)


def small(s, x, y, text, color=MUTE, w=300, align='left', name=None):
    """작은 머리말 — 14 · 800"""
    return s.t(x, y, w, text, 14, 800, color, 1.3, name=name, nowrap=True, align=align)


def numu(s, x, y, w, val, unit, size=48, usize=20, color=BLUE, ucolor=GRAY, name=None, align='left'):
    """큰 숫자 + 단위를 한 줄에(글 칸 둘) — 숫자 칸 이름 name, 단위 칸 이름 name+'u'"""
    jc = {'left': 'flex-start', 'right': 'flex-end', 'center': 'center'}[align]
    s.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; display: flex; align-items: baseline; justify-content: {jc}; gap: 6px; white-space: nowrap">'
          + s.tb(f'{NUM}; font-size: {size}px; font-weight: 800; line-height: 1.1; letter-spacing: -0.03em; color: {color}', val, 'span', name=name)
          + s.tb(f'font-size: {usize}px; font-weight: 800; line-height: 1.1; color: {ucolor}', unit, 'span', name=(name + 'u') if name else None) + '</div>')


def chiprow(s, x, y, labels, on, name, size=18, h=48, gap=10):
    """고르는 칩 한 줄 — on 번째만 채운다(이 고객이 해당하는 것)"""
    out = f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px; display: flex; gap: {gap}px; white-space: nowrap">'
    for i, lb in enumerate(labels):
        look = f'background: {BLUE}; color: #ffffff; border: 1px solid {BLUE}' if i == on else f'background: #ffffff; color: {GRAY}; border: 1px solid {LINE}'
        out += s.tb(f'height: {h}px; padding: 0 {round(h * 0.42)}px; box-sizing: border-box; border-radius: 999px; display: flex; align-items: center; font-size: {size}px; font-weight: 800; {look}', lb, name=f'{name}{i}')
    s.raw(out + '</div>')


# ------------------------------------------------------------------ 도형
def rarrow(s, cx, cy, d=36):
    """칸 사이 둥근 화살표"""
    s.raw(f'<div style="position: absolute; left: {f(cx - d / 2)}px; top: {f(cy - d / 2)}px; width: {d}px; height: {d}px; border-radius: 50%; background: #ffffff; '
          f'box-shadow: 0 4px 12px rgba(18,20,23,0.16); display: flex; align-items: center; justify-content: center">' + svg_icon('arrow', round(d / 2), BLUE, 2.4) + '</div>')


def disc(s, cx, cy, d, icon, bg=BLUE, color=WHITE, ring=True):
    """아이콘이 든 원(여정 · 공정의 마디)"""
    sh = '; box-shadow: 0 0 0 6px #ffffff' if ring else ''
    s.raw(f'<div style="position: absolute; left: {f(cx - d / 2)}px; top: {f(cy - d / 2)}px; width: {d}px; height: {d}px; border-radius: 50%; background: {bg}{sh}; '
          f'display: flex; align-items: center; justify-content: center">' + svg_icon(icon, round(d * 0.45), color, 2) + '</div>')


def hbar(s, x, y, w, frac, h=12, color=BLUE, track=WHITE):
    """가로 막대(바탕 + 채움)"""
    s.box(x, y, w, h, bg=track, r=h / 2)
    s.box(x, y, max(h, w * frac), h, bg=color, r=h / 2)


def segbar(s, x, y, w, h, fracs, colors, r=14):
    """나눠 쌓은 가로 띠"""
    s.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; height: {f(h)}px; border-radius: {r}px; overflow: hidden; display: flex">'
          + ''.join(f'<div style="width: {fr * 100:.2f}%; height: 100%; background: {c}"></div>' for fr, c in zip(fracs, colors)) + '</div>')


def donut(s, cx, cy, R, wd, fracs, colors, gap=0):
    """도넛 — fracs 합 1. gap(px)을 주면 조각 사이를 띄운다"""
    r = R - wd / 2; circ = 2 * math.pi * r; off = 0; arcs = ''
    for fr, col in zip(fracs, colors):
        ln = circ * fr
        arcs += (f'<circle cx="{R}" cy="{R}" r="{f(r)}" fill="none" stroke="{col}" stroke-width="{wd}" stroke-dasharray="{max(0, ln - gap):.1f} {circ - max(0, ln - gap):.1f}" '
                 f'stroke-dashoffset="{-off:.1f}" transform="rotate(-90 {R} {R})"></circle>')
        off += ln
    s.raw(f'<svg style="position: absolute; left: {f(cx - R)}px; top: {f(cy - R)}px" width="{2 * R}" height="{2 * R}" viewBox="0 0 {2 * R} {2 * R}">{arcs}</svg>')


def bluepanel(s, x, y, w, h, icon, label, unit, name, rows, big=56):
    """파란 큰 칸 — 아이콘 · 대표 숫자 하나 + 그 아래 숫자 줄(rows: [(이름, 단위)])"""
    d = 0 if h >= 500 else 20          # 낮은 칸은 위 간격을 줄인다
    s.box(x, y, w, h, bg=BLUE, r=18)
    s.ico(x + 32, y + 32 - d / 2, icon, size=56, r=16, bg=GLASS, color=WHITE)
    s.t(x + 32, y + 112 - d, w - 64, label, 20, 700, W88, 1.3, name=name + 'l', nowrap=True)
    numu(s, x + 32, y + 148 - d, w - 64, Z, unit, big, 24, color=WHITE, ucolor=W88, name=name)
    top = 244 - d * 1.4
    s.hline(x + 32, y + top, w - 64, color='rgba(255,255,255,0.25)')
    step = (h - top - 20) / max(1, len(rows))
    for j, (lb, un) in enumerate(rows):
        yy = y + top + 22 + j * step
        s.t(x + 32, yy, w - 64, lb, 18, 700, W88, 1.3, name=f'{name}{j}l', nowrap=True)
        numu(s, x + 32, yy + 32, w - 64, Z, un, 40, 18, color=WHITE, ucolor=W88, name=f'{name}{j}')


def tile(s, x, y, w, h, icon, label, unit, name, big=56, bg=SURF):
    """숫자 칸 — 아이콘 + 이름 + 큰 숫자"""
    s.box(x, y, w, h, bg=bg, r=18)
    s.ico(x + 24, y + 24, icon, size=56, r=16, bg=WHITE)
    s.t(x + 96, y + 40, w - 116, label, 20, 800, INK2, 1.3, name=name + 'l', nowrap=True)
    numu(s, x + 24, y + h - 32 - big, w - 48, Z, unit, big, 20, name=name)


def months(s, x0, y, pw, h=40, first=1, gap=4):
    """달 머리 12칸 — first: 첫 달(학사 일정은 3)"""
    for i in range(12):
        m = (first - 1 + i) % 12 + 1
        s.box(x0 + i * pw, y, pw - gap, h, bg=SURF, r=10)
        s.t(x0 + i * pw, y + (h - 19) / 2, pw - gap, f'{m}월', 14, 700, GRAY, 1.3, align='center')


def daytrack(s, x, y, w, a, b, h=14, track=WHITE, ticks=True):
    """하루 24시간 띠 — a시부터 b시까지 채움 + 눈금(0 · 6 · 12 · 18 · 24시)"""
    s.box(x, y, w, h, bg=track, r=h / 2)
    s.box(x + a / 24 * w, y, (b - a) / 24 * w, h, bg=BLUE, r=h / 2)
    if ticks:
        for hh in (0, 6, 12, 18, 24):   # 양 끝 눈금은 띠 끝에 맞춘다
            tx, al = (x, 'left') if hh == 0 else (x + w - 60, 'right') if hh == 24 else (x + hh / 24 * w - 30, 'center')
            s.t(tx, y + h + 12, 60, f'{hh}시', 14, 700, GRAY, 1.2, align=al, extra=NUM)
