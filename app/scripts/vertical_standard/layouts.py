# -*- coding: utf-8 -*-
"""Vertical standard proposal layouts (L_VS_*) — generated HTML (1280x720, data-tb text slots, data-img image slots).
Typography is baked in (data-type-role + font sizes from PROPOSAL_TYPE) so the app's typography pass leaves them untouched."""
import json, html as _h

ROLE = {'fineprint': (10, 1.35), 'utility': (12, 1.35), 'label': (14, 1.35), 'dense': (16, 1.4), 'body': (18, 1.4),
        'heading': (20, 1.3), 'subheading': (24, 1.25), 'title': (32, 1.25), 'metric': (40, 1.2), 'cover': (48, 1.2), 'display': (56, 1.15)}
BLUE, INK, INK2, GRAY, MUTE, LINE, SURF, TINT, DASH, LB = '#1428a0', '#121417', '#3d4452', '#596170', '#8a91a0', '#e2e5ea', '#f5f6f8', '#eaeefb', '#b8bec8', '#9db4ff'
ACC = [('#1428a0', '#eaeefb'), ('#0b7a70', '#e2f3f0'), ('#7342c8', '#f0eafb')]  # 핵심 제안 1 · 2 · 3 accent + tint
MAN = "Manrope, 'Noto Sans KR', sans-serif"
BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
CHEV = '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"></path></svg>'
CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="M5 12l5 5 9-10"></path></svg>'
ICONS = {  # 24px stroke icons
    'grid': 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z', 'bolt': 'M13 3L5 13h6l-1 8 8-10h-6z',
    'remote': 'M7 3h10v18H7z M12 7h.01 M10 11h4 M10 15h4', 'chart': 'M4 20V10 M10 20V4 M16 20v-8 M22 20H2',
    'shield': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5', 'cloud': 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 7 18z',
    'tv': 'M3 5h18v12H3z M8 21h8', 'clock': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2', 'link': 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    'user': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c1-4 4-6 8-6s7 2 8 6', 'gear': 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1L7 17 M17 7l2.1-2.1',
    'bell': 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 21h4', 'lock': 'M6 11h12v10H6z M9 11V7a3 3 0 0 1 6 0v4', 'wave': 'M3 12c3-5 6 5 9 0s6 5 9 0',
    'heart': 'M12 20s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 6.9a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z', 'doc': 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6',
    'scan': 'M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M7 12h10', 'chat': 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5A9 9 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0z',
    'calendar': 'M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4', 'wrench': 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
    'alert': 'M12 3l10 18H2z M12 10v5 M12 18v.5', 'pin': 'M12 21s-7-6.5-7-11.5a7 7 0 0 1 14 0C19 14.5 12 21 12 21z M12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    'sun': 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
    'home': 'M4 11l8-7 8 7 M6 9.5V20h12V9.5', 'cart': 'M3 4h2l2.5 11h11L21 7H6.2 M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'print': 'M7 9V3h10v6 M6 18H4v-7h16v7h-2 M7 14h10v7H7z', 'book': 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5', 'layers': 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
    'monitor': 'M3 4h18v12H3z M8 20h8 M12 16v4', 'air': 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h7', 'phone': 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2',
}


def icon(name, color=BLUE, size=22, width=2):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"><path d="{ICONS[name]}"></path></svg>'


def esc(s):
    return _h.escape(str(s), quote=False)


class B:
    """one layout under construction"""

    def __init__(self, f, bg='#ffffff', dark=False):
        self.f, self.parts, self.nt, self.ni, self.bg, self.dark = f, [], 0, 0, bg, dark
        self.roles = {}
        self.keys, self.labels, self.ikeys, self.samples = {}, {}, {}, {}
        self.box_of = {}  # key -> (width, font px, nowrap) for one-line fit checks in the fill builder

    def _reg(self, i, key, label, sample):
        self.samples[i] = sample
        if key: self.keys[key] = i
        if label: self.labels[i] = sample

    def raw(self, s):
        self.parts.append(s)

    def box(self, x, y, w, h, style='', inner=''):
        # decoration only: never take clicks from the text and picture slots under or around it (overlays sit on photos)
        self.parts.append(f'<div style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px; box-sizing: border-box; {style} pointer-events: none;">{inner}</div>')

    def text(self, role, x, y, w, sample, style='', h=None, fixed=False, tag='div', key=None, label=False):
        """absolute text slot — returns its data-tb index (key = semantic name for the fill builder, label = fixed wording)"""
        size, lead = ROLE[role]
        i = self.nt; self.nt += 1
        self._reg(i, key, label, sample)
        if key: self.box_of[key] = (w, size, 'white-space: nowrap' in style)
        hh = f' height: {h}px;' if (h and fixed) else (f' min-height: {h}px;' if h else '')
        st = f'position: absolute; left: {x}px; top: {y}px; width: {w}px;{hh} font-size: {size}px; line-height: {lead}; white-space: pre-line; overflow-wrap: anywhere; word-break: keep-all; min-width: 0; max-width: 100%; {style}'
        self.parts.append(f'<{tag} style="{st}" data-tb="{i}" data-type-role="{role}">{esc(sample)}</{tag}>')
        self.roles[i] = role
        return i

    def ftext(self, role, sample, style='', key=None, label=False):
        """flow (non-absolute) text slot html — caller places it"""
        size, lead = ROLE[role]
        i = self.nt; self.nt += 1
        self._reg(i, key, label, sample)
        self.roles[i] = role
        return i, f'<div style="font-size: {size}px; line-height: {lead}; white-space: pre-line; overflow-wrap: anywhere; word-break: keep-all; min-width: 0; max-width: 100%; {style}" data-tb="{i}" data-type-role="{role}">{esc(sample)}</div>'

    def img(self, x, y, w, h, kind='photo', hint='', radius=12, bg='transparent', fit='cover', pad=0, pos='50% 50%', extra='', key=None):
        i = self.ni; self.ni += 1
        if key: self.ikeys[key] = i
        self.parts.append(
            f'<div style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px; box-sizing: border-box; padding: {pad}px; overflow: hidden; border-radius: {radius}px; background: {bg}; {extra}" data-slot="Photo" data-img="{i}" data-kind="{kind}" data-hint="{esc(hint)}">'
            f'<img src="{BLANK}" alt="{esc(hint)}" style="display: block; width: 100%; height: 100%; object-fit: {fit}; object-position: {pos};"></div>')
        return i

    def circle(self, x, y, d, label, bg=BLUE, color='#ffffff', fs=14, font=MAN, border=''):
        """static numbered circle (not a text slot)"""
        self.parts.append(f'<div style="position: absolute; left: {x}px; top: {y}px; width: {d}px; height: {d}px; min-width: {d}px; min-height: {d}px; max-width: {d}px; max-height: {d}px; border-radius: 50%; background: {bg}; color: {color}; display: flex; align-items: center; justify-content: center; font-family: {font}; font-size: {fs}px; font-weight: 800; line-height: 1; {border} pointer-events: none;" data-layout-shape="circle">{esc(label)}</div>')

    def html(self):
        col = '#ffffff' if self.dark else INK
        return (f'<div data-proposal-typography="2" style="width: 1280px; height: 720px; position: relative; overflow: hidden; background: {self.bg}; color: {col}; '
                f"font-family: 'Noto Sans KR', system-ui, sans-serif; word-break: keep-all; overflow-wrap: anywhere\">" + ''.join(self.parts) + '</div>')


# ------------------------------------------------------------------ shared pieces
SCHEMA = {}  # f -> {'keys','labels','ikeys','nT','nI','samples'}


def header(b, eb='03 · 공간별 제안', title='제목', sub='부제', sub_lines=1):
    b.text('label', 64, 44, 1000, eb, f'font-weight: 700; letter-spacing: 0.06em; color: {BLUE}; white-space: nowrap;', h=19, key='eb')
    b.text('title', 64, 64, 1152, title, f'font-weight: 700; letter-spacing: -0.02em; color: {INK}; white-space: nowrap;', h=40, key='title')
    b.text('body', 64, 110, 1152, sub, f'color: {GRAY};' + ('white-space: nowrap;' if sub_lines == 1 else ''), h=25 * sub_lines, key='sub')


def footer(b, dark=False):
    line = 'rgba(255,255,255,.22)' if dark else LINE
    b.box(64, 668, 1152, 1, f'background: {line};')
    b.text('utility', 64, 680, 72, '고객사 로고', f'height: 20px; border: 1px dashed {DASH if not dark else "rgba(255,255,255,.5)"}; border-radius: 4px; text-align: center; color: {GRAY if not dark else "rgba(255,255,255,.85)"}; white-space: nowrap; overflow: hidden; line-height: 18px; box-sizing: border-box;', h=20, fixed=True, key='cust')
    b.text('utility', 148, 682, 760, '업종 · AI 제안', f'color: {GRAY if not dark else "rgba(255,255,255,.8)"}; white-space: nowrap;', h=16, key='foot')
    b.text('utility', 996, 682, 220, 'CONFIDENTIAL · 1', f'font-family: {MAN}; color: {MUTE if not dark else "rgba(255,255,255,.7)"}; text-align: right; white-space: nowrap; letter-spacing: .04em;', h=16, key='page')


def meta(f, code, name, when, p, p2, g, eb, hl, sub, req, ik=None, ih=None, prods=(), sols=()):
    return {'f': f, 'c': 'ST', 'cv': 'ST_VS', 'code': code, 'name': name, 'when': when, 'g': g, 'p': p, 'p2': p2, 'ind': None, 'sol': None,
            'sample': '표준 제안서', 'eb': eb, 'hl': hl, 'sub': sub, 'foot': '', 'ik': ik or [], 'ih': ih or [], 'ph': 0, 'phs': [], 'pc': 0,
            'req': list(req), 'prods': list(prods), 'sols': list(sols)}


G = '표준 제안서 · 업종 공통 · {} — 6장 목차(Overview · AI 업종 · 공간별 제안 · 솔루션 · 도입사례 · Why Samsung)'
OUT = []  # (meta, html)


def add(b, m):
    m['nT'], m['nI'] = b.nt, b.ni
    m['txt'] = ''
    OUT.append((m, b.html()))
    SCHEMA[b.f] = {'keys': dict(b.keys), 'labels': dict(b.labels), 'ikeys': dict(b.ikeys), 'nT': b.nt, 'nI': b.ni, 'samples': dict(b.samples), 'box': dict(b.box_of)}


def lab(b, x, y, w, text, color=BLUE, role='label', extra=''):
    """fixed label slot"""
    return b.text(role, x, y, w, text, f'font-weight: 700; color: {color}; white-space: nowrap; {extra}', h=ROLE[role][0] + 5, label=True)


# ------------------------------------------------------------------ 목차
def toc():
    b = B('L_VS_TOC')
    header(b, 'CONTENTS', '목차', '업종 · AI 제안 · 6개 장')
    xs, ys = [64, 456, 848], [156, 404]
    for k in range(6):
        x, y = xs[k % 3], ys[k // 3]
        b.img(x, y, 368, 120, 'space', '장 대표 사진', radius=12, key=f'c{k}img')
        b.text('heading', x, y + 134, 52, f'0{k + 1}', f'font-family: {MAN}; font-weight: 800; color: {BLUE}; white-space: nowrap;', h=26, key=f'c{k}no', label=True)
        b.text('heading', x + 36, y + 134, 252, '장 제목', f'font-weight: 800; color: {INK}; white-space: nowrap;', h=26, key=f'c{k}t')
        b.text('label', x + 288, y + 138, 80, 'p.4', f'color: {MUTE}; text-align: right; white-space: nowrap; font-family: {MAN};', h=19, key=f'c{k}p')
        b.text('dense', x, y + 166, 368, '장 설명 한 줄', f'color: {INK2}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'c{k}s')
        b.box(x, y + 196, 368, 1, f'background: {LINE};')
        b.text('label', x, y + 208, 368, '다루는 것', f'color: {GRAY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=19, key=f'c{k}tags')
    footer(b)
    add(b, meta('L_VS_TOC', 'VS-TOC', '목차 · 사진 카드 6 (6장 고정)', '표준 제안서 둘째 장 — 여섯 장의 제목 · 쪽 · 다루는 것', 'overview', None, G.format('표지 · 목차'),
                'CONTENTS', '목차', '6개 장', ['customer', 'images']))


# ------------------------------------------------------------------ 간지 (rows 1..6)
def divider(n):
    f = f'L_VS_DIV_R{n}'
    b = B(f, bg='#121417', dark=True)
    b.img(0, 0, 1280, 720, 'space', '장 대표 사진 (풀블리드)', radius=0, key='bg')
    top = min(520, 622 - 36 * n)
    b.box(0, top, 1280, 720 - top, 'background: rgba(18,20,23,.80);')
    b.text('utility', 64, 44, 96, '고객사 로고', 'height: 26px; border: 1px dashed rgba(255,255,255,.55); border-radius: 4px; background: rgba(255,255,255,.88); color: #3d4452; text-align: center; line-height: 24px; white-space: nowrap; box-sizing: border-box;', h=26, fixed=True, key='cust')
    b.text('heading', 64, top + 30, 300, '01 / 06', f'font-family: {MAN}; font-weight: 800; color: {LB}; white-space: nowrap;', h=26, key='chapter')
    b.text('cover', 64, top + 60, 700, '장 제목', 'font-weight: 800; color: #ffffff; letter-spacing: -0.02em; white-space: nowrap;', h=58, key='title')
    b.text('body', 64, top + 128, 700, '장 설명', 'color: rgba(255,255,255,.86);', h=25, key='sub')
    b.text('label', 820, top + 30, 396, '이 장에서 다루는 것', f'font-weight: 700; color: {LB}; white-space: nowrap;', h=19, label=True)
    for r in range(n):
        y = top + 58 + 36 * r
        b.box(820, y, 396, 1, 'background: rgba(255,255,255,.2);')
        b.text('label', 820, y + 8, 28, f'0{r + 1}', f'font-family: {MAN}; font-weight: 800; color: {LB}; white-space: nowrap;', h=19, label=True)
        b.text('dense', 850, y + 6, 290, '항목', 'font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f'r{r}')
        b.text('dense', 1140, y + 6, 76, '4', f'font-family: {MAN}; font-weight: 700; color: rgba(255,255,255,.82); text-align: right; white-space: nowrap;', h=22, key=f'r{r}p')
    b.box(820, top + 58 + 36 * n, 396, 1, 'background: rgba(255,255,255,.2);')
    b.text('utility', 996, 696, 220, 'CONFIDENTIAL · 1', f'font-family: {MAN}; color: rgba(255,255,255,.7); text-align: right; white-space: nowrap; letter-spacing: .04em;', h=16, key='page')
    add(b, meta(f, f'VS-DIV-{n}', f'간지 · 풀블리드 사진 + 목록 {n}줄', f'장을 여는 간지 — 장 번호 · 제목 · 다루는 것 {n}줄과 쪽', 'cover', None, G.format('간지'),
                '01 / 06', '장 제목', '', ['images']))


# ------------------------------------------------------------------ 01 Overview — Device · Solution · Service
def dss():
    b = B('L_VS_DSS')
    header(b, '01 · OVERVIEW', '업종에 필요한 AI, Device · Solution · Service로 한 번에', '부제')
    b.box(64, 156, 340, 420, f'border: 1px solid {LINE}; border-radius: 16px; background: #ffffff;')
    b.text('label', 84, 174, 200, 'DEVICE', f'font-family: {MAN}; font-weight: 800; letter-spacing: .08em; color: {BLUE}; white-space: nowrap;', h=19, label=True)
    for r in range(5):
        y = 204 + 72 * r
        if r: b.box(84, y - 6, 300, 1, f'background: {LINE};')
        b.img(84, y + 2, 76, 58, 'cut', '대표 제품 컷', radius=8, bg=SURF, fit='contain', pad=6, key=f'd{r}img')
        b.text('body', 176, y + 18, 210, '디바이스', f'font-weight: 700; color: {INK}; white-space: nowrap;', h=25, key=f'd{r}')
    b.box(876, 156, 340, 420, f'border: 1px solid {LINE}; border-radius: 16px; background: #ffffff;')
    b.text('label', 896, 174, 200, 'SOLUTION', f'font-family: {MAN}; font-weight: 800; letter-spacing: .08em; color: {BLUE}; white-space: nowrap;', h=19, label=True)
    for r in range(5):
        y = 204 + 72 * r
        if r: b.box(896, y - 6, 300, 1, f'background: {LINE};')
        b.box(898, y + 27, 8, 8, f'border-radius: 50%; background: {BLUE};')
        b.text('body', 918, y + 18, 280, '솔루션', f'font-weight: 700; color: {INK}; white-space: nowrap;', h=25, key=f's{r}')
    b.box(490, 216, 300, 300, f'border-radius: 50%; background: {TINT}; border: 1px dashed #c5cde6;')
    b.box(536, 262, 208, 208, 'border-radius: 50%; background: #ffffff;')
    b.text('subheading', 546, 336, 188, '삼성\nAI 비즈니스', f'font-weight: 800; color: {INK}; text-align: center;', h=60, label=True)
    for (cx, cy) in [(476, 222), (724, 222), (600, 474)]:
        b.box(cx, cy, 80, 80, f'border-radius: 50%; background: {BLUE}; border: 4px solid #ffffff;')
    b.text('dense', 476, 250, 80, 'Device', f'font-family: {MAN}; font-weight: 800; color: #ffffff; text-align: center; white-space: nowrap;', h=22, label=True)
    b.text('dense', 724, 250, 80, 'Solution', f'font-family: {MAN}; font-weight: 800; color: #ffffff; text-align: center; white-space: nowrap;', h=22, label=True)
    b.text('dense', 600, 502, 80, 'Service', f'font-family: {MAN}; font-weight: 800; color: #ffffff; text-align: center; white-space: nowrap;', h=22, label=True)
    b.box(404, 365, 70, 2, 'background: #c5cde6;')
    b.box(806, 365, 70, 2, 'background: #c5cde6;')
    b.box(64, 592, 1152, 56, f'border-radius: 14px; background: {BLUE};')
    b.text('label', 84, 610, 80, 'SERVICE', f'font-family: {MAN}; font-weight: 800; letter-spacing: .08em; color: {LB}; white-space: nowrap;', h=19, label=True)
    for k in range(3):
        x = 172 + 348 * k
        b.box(x, 602, 336, 36, 'border: 1px solid rgba(255,255,255,.4); border-radius: 18px;')
        b.text('dense', x, 609, 336, '서비스', 'font-weight: 700; color: #ffffff; text-align: center; white-space: nowrap;', h=22, key=f'v{k}')
    footer(b)
    add(b, meta('L_VS_DSS', 'VS-DSS', 'Device · Solution · Service 도식 (디바이스 컷 5 · 솔루션 5 · 서비스 3)', '01 Overview — 업종에 맞춘 삼성 AI 비즈니스 구성을 한 장에', 'dss', 'overview', G.format('01 Overview'),
                '01 · OVERVIEW', '업종에 필요한 AI, Device · Solution · Service로 한 번에', '', ['products', 'solutions', 'images']))


# ------------------------------------------------------------------ 02 니즈 · 기술 · 제안 3열
def needs():
    b = B('L_VS_NEEDS')
    header(b, '02 · AI 업종', '고객의 세 가지 니즈에 삼성 AI 기술로 답합니다', '부제')
    cols = [(64, 396, '고객 니즈', 'h0'), (492, 280, 'AI 업종', 'h1'), (804, 412, '핵심 제안', 'h2')]
    for x, w, t, k in cols:
        b.text('subheading', x, 148, w, t, f'font-weight: 800; color: {INK}; white-space: nowrap;', h=30, key=k, label=(k != 'h1'))
        b.box(x, 184, 36, 3, f'background: {BLUE}; border-radius: 2px;')
    for r in range(3):
        y = 200 + 150 * r
        acc, tint = ACC[r]
        b.box(64, y, 396, 138, f'border-radius: 14px; background: {SURF};')
        b.text('label', 88, y + 20, 60, f'Q{r + 1}', f'font-family: {MAN}; font-weight: 800; color: {acc}; white-space: nowrap;', h=19, label=True)
        b.text('heading', 88, y + 44, 348, '“고객의 목소리”', f'font-weight: 700; color: {INK};', h=78, key=f'q{r}')
        b.box(464, y + 58, 24, 22, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=22, c='#c5cde6'))
        b.box(492, y, 280, 138, f'border: 1px solid {LINE}; border-radius: 14px; background: #ffffff;')
        b.img(504, y + 12, 96, 114, 'cut', 'AI 기술 대표 제품 · 솔루션', radius=10, bg=SURF, fit='contain', pad=8, key=f't{r}img')
        b.text('heading', 612, y + 20, 150, 'AI 기술', f'font-family: {MAN}; font-weight: 800; color: {INK};', h=26, key=f't{r}')
        b.text('dense', 612, y + 74, 150, '※ 설명', f'color: {GRAY};', h=44, key=f't{r}n')
        b.box(776, y + 58, 24, 22, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=22, c='#c5cde6'))
        b.box(804, y, 412, 138, f'border: 2px solid {acc}; border-radius: 14px; background: #ffffff;')
        b.text('subheading', 826, y + 18, 370, '핵심 제안', f'font-weight: 800; color: {acc}; white-space: nowrap;', h=30, key=f'p{r}')
        for c in range(2):
            x = 826 + 190 * c
            b.box(x, y + 62, 180, 56, f'border-radius: 10px; background: {tint};')
            b.box(x + 10, y + 70, 16, 16, 'display: flex;', CHECK.format(c=acc))
            b.text('dense', x + 32, y + 68, 140, '세부 제안', f'font-weight: 700; color: {INK};', h=44, key=f'p{r}c{c}')
    footer(b)
    add(b, meta('L_VS_NEEDS', 'VS-NEEDS', '니즈 · 기술 · 제안 3열 (니즈 문장 · 기술 컷 · 제안별 색 테두리)', '02 AI 업종 첫 장 — 고객 니즈 셋에 삼성 AI 기술과 핵심 제안을 잇는다', 'value', 'challenge', G.format('02 AI 업종'),
                '02 · AI 업종', '고객의 세 가지 니즈에 삼성 AI 기술로 답합니다', '', ['needs', 'products', 'solutions', 'images']))


# ------------------------------------------------------------------ 02 핵심 제안 상세 (accent 1..3)
def core(k):
    f = f'L_VS_CORE_{k + 1}'
    acc, tint = ACC[k]
    b = B(f)
    header(b, '02 · AI 업종', '핵심 제안 제목', '부제')
    for r in range(2):
        y = 152 + 252 * r
        b.box(64, y, 320, 240, f'border-radius: 14px; background: {SURF};')
        b.box(64, y, 6, 240, f'background: {acc}; border-radius: 12px 0 0 12px;')
        b.text('label', 90, y + 20, 60, f'0{r + 1}', f'font-family: {MAN}; font-weight: 800; color: {acc}; white-space: nowrap;', h=19, label=True)
        b.text('subheading', 90, y + 42, 272, '세부 제안', f'font-weight: 800; color: {INK};', h=60, key=f'r{r}t')
        b.text('dense', 90, y + 108, 272, '대표 제품', f'font-weight: 700; color: {acc}; white-space: nowrap; display: inline-block; width: auto; max-width: 272px; padding: 4px 12px; border-radius: 999px; background: #ffffff; box-sizing: border-box;', h=30, key=f'r{r}tag')
        b.text('body', 90, y + 148, 272, '설명', f'color: {INK2};', h=75, key=f'r{r}d')
        xs = [408, 685, 962]
        for s in range(3):
            x = xs[s]
            if s == 1:
                b.img(x, y, 254, 150, 'cut', '제품 · 솔루션', radius=14, bg=tint, fit='contain', pad=14, key=f'r{r}img')
                b.circle(x + 12, y + 12, 28, str(s + 1), bg=acc)
                b.box(x + 206, y + 12, 36, 22, f'border-radius: 11px; background: {acc}; color: #ffffff; font-family: {MAN}; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center;', 'AI')
                b.text('heading', x, y + 162, 254, '단계 2', f'font-weight: 700; color: {acc};', h=78, key=f'r{r}s1')
            else:
                b.box(x, y, 254, 240, f'border: 1px solid {LINE}; border-radius: 14px; background: #ffffff;')
                b.circle(x + 18, y + 18, 28, str(s + 1), bg=acc)
                b.text('heading', x + 18, y + 62, 218, f'단계 {s + 1}', f'font-weight: 600; color: {INK};', h=78, key=f'r{r}s{s}')
            if s < 2:
                b.box(x + 256, y + 109, 26, 22, 'display: flex; align-items: center; justify-content: center;', CHEV.format(s=20, c='#c5cde6'))
    footer(b)
    add(b, meta(f, f'VS-CORE-{k + 1}', f'핵심 제안 상세 {k + 1} · 2행 × 3단계 (가운데 제품 · 솔루션만 이미지)', '02 AI 업종 — 핵심 제안 하나를 세부 제안 둘로, 각 3단계 흐름', 'scenario', 'value', G.format('02 AI 업종'),
                '02 · AI 업종', '핵심 제안 상세', '', ['scenario', 'products', 'images']))


# ------------------------------------------------------------------ 03 공간별 제품 시트
def space_sheet():
    b = B('L_VS_SPACE')
    header(b, '03 · 공간별 제안 · 01', '공간 이름', '이 공간에서 삼성 제품이 하는 일', sub_lines=2)
    b.box(64, 172, 6, 36, f'background: {BLUE}; border-radius: 3px;')
    b.text('label', 84, 168, 300, '대표 제품', f'font-weight: 700; letter-spacing: .04em; color: {BLUE}; white-space: nowrap;', h=19, label=True)
    b.text('subheading', 84, 186, 1132, '제품 이름', f'font-weight: 800; color: {INK}; white-space: nowrap;', h=30, key='prod')
    b.img(64, 232, 560, 412, 'cut', '대표 제품 컷', radius=16, bg=SURF, fit='contain', pad=36, key='img')
    for r in range(2):
        y = 232 + 212 * r
        b.box(656, y, 560, 200, f'border: 1px solid {LINE}; border-radius: 16px; background: #ffffff;')
        b.circle(684, y + 28, 36, str(r + 1), fs=16)
        b.text('subheading', 736, y + 30, 456, '특징', f'font-weight: 800; color: {INK};', h=60, key=f'f{r}t')
        b.text('body', 684, y + 102, 508, '특징 설명', f'color: {INK2};', h=75, key=f'f{r}d')
    footer(b)
    add(b, meta('L_VS_SPACE', 'VS-SPACE', '공간별 대표 제품 · 왼쪽 제품 컷 + 오른쪽 특징 2 (제품명은 위)', '03 공간별 제안 — 공간마다 한 장, 그 공간의 대표 제품과 두 가지 특징', 'products', 'scenario', G.format('03 공간별 제안'),
                '03 · 공간별 제안', '공간 이름', '', ['spaces', 'products', 'images']))


# ------------------------------------------------------------------ 03 조감도 (space / building)
def bird(n, building=False):
    f = f'L_VS_BIRD_{"B" if building else "S"}{n}'
    b = B(f)
    header(b, '03 · 공간별 제안', '업종의 N개 공간', '부제')
    b.img(64, 152, 816, 496, 'plan', '표준 건물 조감도' if building else '공간 조감도', radius=16, bg='#f3f5f3', fit='contain', key='img')
    b.box(904, 152, 312, 496, f'border-radius: 16px; background: {SURF};')
    b.text('label', 924, 170, 272, '공간 · 대표 제품', f'font-weight: 700; color: {GRAY}; white-space: nowrap;', h=19, label=True)
    avail = 496 - 52
    rh = min(84, avail // n)
    for r in range(n):
        y = 200 + rh * r
        b.circle(924, y + 2, 24, str(r + 1), fs=12)
        if rh >= 60:
            b.text('dense', 958, y, 238, '공간', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f's{r}')
            b.text('label', 958, y + 24, 238, '제품', f'color: {GRAY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=19, key=f's{r}p')
        else:
            b.text('dense', 958, y + 1, 238, '공간', f'font-weight: 800; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=22, key=f's{r}')
            b.text('label', 958, y + 22, 238, '제품', f'color: {GRAY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=19, key=f's{r}p')
    if n <= 4:  # room under a short legend: how the next pages follow the numbers
        ny = 200 + rh * n + 12
        b.box(924, ny, 272, 1, f'background: {LINE};')
        b.text('label', 924, ny + 14, 272, '번호 순서대로 다음 장부터 소개합니다', f'color: {GRAY};', h=648 - 16 - ny - 14, key='note')
    footer(b)
    add(b, meta(f, f'VS-BIRD-{"B" if building else "S"}{n}', ('표준 건물 조감도 · 층별 ' if building else '공간 조감도 · ') + f'{n}개 공간 범례', '03 공간별 제안 첫 장 — ' + ('층마다 공간을 나눈 표준 건물 조감도와 공간 범례' if building else '한 층에 모든 공간을 놓은 공간 조감도와 범례'), 'birdseye', 'dss', G.format('03 공간별 제안'),
                '03 · 공간별 제안', '공간 조감도', '', ['spaces', 'products', 'images']))


# ------------------------------------------------------------------ 03 Map (N spaces)
def grid_of(n):
    if n <= 4: return [n]
    return [(n + 1) // 2, n // 2]


def map_sheet(n):
    f = f'L_VS_MAP_{n}'
    b = B(f)
    header(b, '03 · 공간별 제안', 'AI 업종 Map', '부제')
    rows = grid_of(n)
    gap = 12
    top, bottom = 152, 648
    rh = (bottom - top - gap * (len(rows) - 1)) // len(rows)
    k = 0
    for ri, cnt in enumerate(rows):
        cw = (1152 - gap * (cnt - 1)) / cnt
        y = top + ri * (rh + gap)
        for c in range(cnt):
            x = round(64 + c * (cw + gap))
            w = round(cw)
            b.box(x, y, w, rh, f'border: 1px solid {LINE}; border-radius: 14px; background: #ffffff;')
            b.circle(x + 14, y + 14, 24, str(k + 1), fs=12)
            b.text('dense', x + 46, y + 14, w - 58, '공간', f'font-weight: 800; color: {INK};', h=22, key=f's{k}')
            # one row (4 spaces or fewer): a taller picture and what the space does, so the card is not left half empty
            single = len(rows) == 1
            ih = min(240, rh - 200) if single else max(70, min(150, rh - 150))
            b.img(x + 14, y + 66, w - 28, ih, 'cut', '대표 제품 컷', radius=10, bg=SURF, fit='contain', pad=8, key=f's{k}img')
            b.text('label', x + 14, y + 66 + ih + 10, w - 28, '제품 목록', f'color: {INK2};', h=40, key=f's{k}p')
            if single:
                b.box(x + 14, y + 66 + ih + 56, w - 28, 1, f'background: {LINE};')
                b.text('dense', x + 14, y + 66 + ih + 68, w - 28, '이 공간에서 하는 일', f'color: {INK};', h=88, key=f's{k}d')
            k += 1
    footer(b)
    add(b, meta(f, f'VS-MAP-{n}', f'업종 Map · 공간 {n}개 × 제품', '03 공간별 제안 마무리 — 공간마다 놓이는 삼성 제품을 한 장에', 'bom', 'dss', G.format('03 공간별 제안'),
                '03 · 공간별 제안', 'AI 업종 Map', '', ['spaces', 'products', 'images']))


# ------------------------------------------------------------------ 05 도입사례
def case_sheet():
    b = B('L_VS_CASE')
    header(b, '05 · 도입사례', '고객사 이름', '업종 · 지역 — 도입 제품 · 솔루션')
    b.img(64, 152, 600, 300, 'case', '사례 대표 사진', radius=16, key='img0')
    for k in range(3):
        x = 64 + 204 * k
        b.img(x, 464, 192, 184, 'case', f'적용 사진 {k + 1}', radius=12, key=f'img{k + 1}')
        b.circle(x + 10, 474, 24, str(k + 1), fs=12)
    b.text('label', 688, 152, 300, '도입 포인트', f'font-weight: 700; color: {BLUE}; white-space: nowrap;', h=19, label=True)
    for k in range(3):
        y = 184 + 140 * k
        if k: b.box(688, y - 12, 528, 1, f'background: {LINE};')
        b.circle(688, y + 2, 24, str(k + 1), fs=12)
        b.text('heading', 722, y, 494, '도입 포인트', f'font-weight: 800; color: {INK};', h=52, key=f'p{k}t')
        b.text('dense', 722, y + 58, 494, '설명', f'color: {INK2};', h=66, key=f'p{k}d')
    b.box(688, 616, 528, 32, f'border-radius: 8px; background: {SURF};')
    b.text('label', 704, 622, 500, '원문 · samsung.com 도입사례', f'color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;', h=19, key='src')
    footer(b)
    add(b, meta('L_VS_CASE', 'VS-CASE', '도입사례 · 대표 사진 + 적용 사진 3 + 도입 포인트 3', '05 도입사례 — 같은 업종 고객의 공식 도입사례 한 건', 'case', None, G.format('05 도입사례'),
                '05 · 도입사례', '고객사 이름', '', ['cases', 'images']))


def write_module(path):
    metas = [m for m, _ in OUT]
    htmls = {m['f']: h for m, h in OUT}
    head = ('// 표준 제안서 · 업종 공통 레이아웃 (L_VS_*) — vertical_space_product.json 44개 업종의 표준 제안서가 함께 쓰는 장표.\n'
            '// 목차 6장 고정(01 Overview · 02 AI 업종 · 03 공간별 제안 · 04 솔루션 · 05 도입사례 · 06 Why Samsung), 업종마다 내용 · 공간 수 · 솔루션만 다름.\n'
            '// 호텔 AI 스테이(L_AIS_*)를 기준으로 개선: 니즈 열 사진 제거 · 제안별 색 테두리 · 하단 각주 없음 · 상세 장은 가운데 제품/솔루션 이미지만 · 공간별 장 = 왼쪽 제품 컷 + 오른쪽 특징 2.\n'
            '// 04 솔루션은 솔루션마다 다른 레이아웃(L_VS_SOL_*, 23종 — 업종이 달라도 같은 솔루션은 같은 레이아웃), 06 Why Samsung(L_VS_WHY_*)은 모든 업종 같은 내용.\n'
            '// 글자 크기는 PROPOSAL_TYPE 역할(data-type-role)을 미리 넣어 둠(data-proposal-typography="2"). 생성: app/scripts/vertical_standard/gen_layouts.py\n')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(head)
        fh.write('export const VSTD_META = ' + json.dumps(metas, ensure_ascii=False, indent=0) + ';\n')
        fh.write('export const VSTD_HTML = ' + json.dumps(htmls, ensure_ascii=False) + ';\n')
