# TOC sheet builder — same design system as the standard deck (L_AIS_*), without subtitles / footnotes.
import re, json, html as _h
import sys as _sys, os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', 'v25'))
from std import L as _L, esc, f, plain, ICONS as STD_ICONS, GIF, BLUE, INK, INK2, GRAY, MUTE, LINE, SURF, TINT, DASH, BAND, CAP
FONT = "'Noto Sans KR', system-ui, sans-serif"
NUMF = "Manrope, 'Noto Sans KR', sans-serif"
BLUE2 = '#2f4bd6'; SKY = '#eef2ff'; GOOD = '#0f8a5f'
ICONS = dict(STD_ICONS)
ICONS.update({
  'arrow': 'M5 12h14 M13 6l6 6-6 6', 'check': 'M5 12l5 5 9-10', 'users': 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M21 19v-1a4 4 0 0 0-3-3.8 M15.5 3.2a3.5 3.5 0 0 1 0 6.6',
  'target': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12h.01',
  'coin': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15 9.5c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.8 3 2 3 .9 3 2-1.3 2-3 2c-1.3 0-2.4-.5-3-1.5 M12 6v2 M12 16v2',
  'flag': 'M5 21V4 M5 4h11l-2 4 2 4H5', 'store': 'M3 9l1.5-5h15L21 9 M4 9v11h16V9 M3 9h18 M9 20v-6h6v6',
  'spark': 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'route': 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 15V9a4 4 0 0 1 4-4h6 M18 9v6a4 4 0 0 1-4 4H8',
  'device': 'M4 5h16v10H4z M8 19h8 M12 15v4', 'service': 'M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v5H4z M17 14h3v5h-3z',
  'chart2': 'M4 19V5 M4 19h16 M8 15l3-4 3 2 5-6', 'list': 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  'box': 'M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10', 'wrench': 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  'rocket': 'M5 15c-1.5 1.5-2 4.5-2 4.5s3-.5 4.5-2 M14 4c3 0 6 3 6 6-2 4-6 7-10 8l-4-4c1-4 4-8 8-10z M15 9h.01', 'scale': 'M12 3v18 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0z M19 7l-3 7a3 3 0 0 0 6 0z M8 21h8',
  'doc': 'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h7', 'question': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7 M12 17h.01',
  'pin': 'M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  'pulse': 'M3 12h4l2-6 4 12 2-6h6',
})
BLANK = '/assets/toc/icons/blank.png'

def svg_icon(name, size=24, color=BLUE, stroke=1.9):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{stroke}" '
            f'stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; display: block"><path d="{ICONS[name]}"></path></svg>')

class T(_L):
    """L with TOC chrome: eyebrow + one-line title (no subtitle), deck footer, and named slots for the composer."""
    def __init__(self, fid, bg='#ffffff'):
        super().__init__(fid, bg)
        self.meta = {}
    # pictures: pack address (.json#k) → data-fill, anything else → src
    def pic(self, x, y, w, h, src, hint, kind='space', r=14, pos='50% 50%', fit=None, name=None, bg=None, pad=0, shadow=False):
        i = self.nimg; self.nimg += 1
        if name: self.imgnames[name] = i
        fit = fit or ('contain' if kind in ('cut', 'icon') else 'cover')
        bg = bg if bg is not None else ('#ffffff' if kind == 'cut' else ('transparent' if kind == 'icon' else '#e9ecf1'))
        packed = bool(re.search(r'\.json#\d+$', src or ''))
        imgsrc = f'src="{GIF}" data-fill="{src}"' if packed else f'src="{esc(src or GIF)}"'
        sh = '; box-shadow: 0 6px 18px rgba(18,20,23,0.10)' if shadow else ''
        self.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px"><div style="position: relative; width: {f(w)}px; height: {f(h)}px; box-sizing: border-box; '
                 f'padding: {f(pad)}px; overflow: hidden; border-radius: {f(r)}px; background: {bg}{sh};" data-slot="Photo" data-img="{i}" data-kind="{kind}" data-hint="{esc(hint)}">'
                 f'<img {imgsrc} alt="{esc(hint)}" style="display: block; width: 100%; height: 100%; object-fit: {fit}; object-position: {pos};"></div></div>')
        self.hints.append(hint); self.kinds.append(kind); self.pids.append('')
        self.area += w * h * (0.5 if kind in ('cut', 'icon') else 1.0)
        return i
    def head2(self, eb, title):
        self.raw(self.tb(f'position: absolute; left: 64px; top: 44px; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: {BLUE}; white-space: nowrap', eb, name='eb'))
        self.raw(self.tb(f'position: absolute; left: 64px; top: 66px; width: 1152px; font-size: 30px; font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis', title, name='title'))
    def foot2(self, text, page=7, dark=False):
        self.foot(text, page, dark)
    def t(self, x, y, w, content, size=16, weight=400, color=INK, lh=1.45, name=None, nowrap=False, align='left', extra='', h=None, clamp=None):
        st = f'position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; font-size: {f(size)}px; font-weight: {weight}; line-height: {lh}; color: {color}; text-align: {align}'
        if nowrap: st += '; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'
        if h: st += f'; height: {f(h)}px; overflow: hidden'
        if clamp: st += f'; display: -webkit-box; -webkit-line-clamp: {clamp}; -webkit-box-orient: vertical; overflow: hidden'
        if extra: st += '; ' + extra
        self.raw(self.tb(st, content, name=name)); return self.ntb - 1
    def num2(self, x, y, n, d=30, size=14, bg=BLUE, color='#ffffff', name=None):
        st = (f'position: absolute; left: {f(x)}px; top: {f(y)}px; width: {d}px; height: {d}px; font-family: {NUMF}; border-radius: 9999px; background: {bg}; color: {color}; '
              f'font-size: {size}px; font-weight: 800; display: flex; align-items: center; justify-content: center')
        self.raw(self.tb(st, str(n), name=name))
    def chip(self, x, y, content, name=None, bg=SKY, color=BLUE, size=14, h=32, pad=14, border=None, weight=700, maxw=None):
        st = (f'position: absolute; left: {f(x)}px; top: {f(y)}px; height: {h}px; padding: 0 {pad}px; box-sizing: border-box; border-radius: 999px; background: {bg}; color: {color}; '
              f'font-size: {size}px; font-weight: {weight}; display: flex; align-items: center; white-space: nowrap')
        if border: st += f'; border: {border}'
        if maxw: st += f'; max-width: {maxw}px; overflow: hidden; text-overflow: ellipsis'
        self.raw(self.tb(st, content, name=name))
    def ico(self, x, y, name, size=56, r=16, bg=TINT, color=BLUE, isz=None, stroke=1.9):
        isz = isz or round(size * 0.48)
        self.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px; width: {size}px; height: {size}px; border-radius: {r}px; background: {bg}; display: flex; align-items: center; justify-content: center">'
                 + svg_icon(name, isz, color, stroke) + '</div>')
    def arrow(self, x, y, size=22, color=DASH):
        self.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px">' + svg_icon('arrow', size, color, 2.2) + '</div>')
    def label2(self, x, y, text, color=MUTE, size=13, name=None):
        return self.t(x, y, 400, text, size, 800, color, 1.2, name=name, nowrap=True, extra='letter-spacing: 0.06em; width: auto')
    def html(self):
        return (f'<div style="width: 1280px; height: 720px; position: relative; overflow: hidden; background: {self.bg}; color: {INK}; font-family: {FONT}; '
                f'word-break: keep-all; overflow-wrap: anywhere">' + ''.join(self.parts) + '</div>')
