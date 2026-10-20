# 표준 제안서 v2 스타일(L_AIS_* 와 같은 규칙) 레이아웃 빌더 — 새 장(L_STD_* · L_AST_* · L_AOF_* · L_AAP_*)용
import html as _h, re, json
GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
FONT = "'Noto Sans KR', system-ui, sans-serif"
BLUE, INK, INK2, GRAY, MUTE, LINE, SURF, TINT, DASH, LB = '#1428a0', '#121417', '#3d4452', '#596170', '#8a91a0', '#e2e5ea', '#f5f6f8', '#eaeefb', '#b8bec8', '#9db4ff'
BAND, CAP = 'rgba(18,20,23,0.82)', 'rgba(12,16,26,0.74)'
BADGE = ("<span style=\"position: absolute; right: 8px; top: 8px; height: 18px; padding: 0 7px; border-radius: 999px; background: rgba(18,20,23,0.66); color: #ffffff; "
         "font-family: 'Noto Sans KR', system-ui, sans-serif; font-size: 10px; font-weight: 600; display: flex; align-items: center; white-space: nowrap;\">samsung.com 공식</span>")
ICONS = {  # 24×24 stroke paths (L_AIS_* 아이콘과 같은 결)
    'swap': 'M4 8h15l-4-4 M20 16H5l4 4', 'cloud': 'M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 8a4.5 4.5 0 0 1 0 10z',
    'chat': 'M4 5h16v11H9l-5 4z M8 10h.01 M12 10h.01 M16 10h.01', 'bolt': 'M13 3L5 14h6l-1 7 8-11h-6z',
    'chart': 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2', 'monitor': 'M3 5h18v11H3z M8 20h8 M12 16v4',
    'layers': 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5', 'image': 'M4 5h16v14H4z M4 15l5-5 4 4 3-3 4 4 M15 9h.01',
    'type': 'M5 6V4h14v2 M12 4v16 M9 20h6', 'template': 'M4 4h16v6H4z M4 14h7v6H4z M15 14h5v6h-5z',
    'remote': 'M12 3a9 9 0 0 1 9 9 M12 7a5 5 0 0 1 5 5 M5 21l6-6 M3 14l7 7',
    'map': 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14 M15 6v14', 'cube': 'M12 2l9 5v10l-9 5-9-5V7z M12 12l9-5 M12 12v10 M12 12L3 7',
    'leaf': 'M5 19c8 0 14-6 14-14C11 5 5 11 5 19z M5 19l6-6', 'shield': 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    'home': 'M3 11l9-7 9 7 M5 10v10h14V10', 'phone': 'M8 3h8v18H8z M11 18h2', 'wind': 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h7',
    'temp': 'M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z', 'clock': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 3',
    'calendar': 'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4', 'sun': 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2',
    'trend': 'M3 17l6-6 4 4 8-8 M15 7h6v6', 'alert': 'M12 3l10 18H2z M12 10v5 M12 18h.01', 'split': 'M12 3v8 M12 11l-7 6 M12 11l7 6 M5 17v4 M19 17v4',
    'grid': 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z', 'plug': 'M9 3v5 M15 3v5 M6 8h12v3a6 6 0 0 1-12 0z M12 17v4',
    'book': 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z M20 4h-4a3 3 0 0 0-3 3', 'moon': 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
    'film': 'M4 4h16v16H4z M8 4v16 M16 4v16 M4 8h4 M4 12h4 M4 16h4 M16 8h4 M16 12h4 M16 16h4', 'fire': 'M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-2 0-4 0-6z',
}

def esc(s): return _h.escape(s, quote=True)
def f(v): return ('%.1f' % v).rstrip('0').rstrip('.')
def plain(s):
    s = re.sub(r'<br\s*/?>', ' ', s); s = re.sub(r'<[^>]+>', '', s)
    return _h.unescape(s).strip()

class L:
    def __init__(self, fid, bg='#ffffff'):
        self.fid = fid; self.bg = bg; self.parts = []; self.ntb = 0; self.nimg = 0
        self.texts = []; self.hints = []; self.kinds = []; self.pids = []; self.area = 0.0; self.names = {}; self.imgnames = {}
    # ---------- low level ----------
    def raw(self, s): self.parts.append(s); return self
    def tb(self, style, content, tag='div', plain_text=None, name=None):
        i = self.ntb; self.ntb += 1
        if name: self.names[name] = i
        self.texts.append(plain(content) if plain_text is None else plain_text)
        return f'<{tag} style="{style}" data-tb="{i}">{content}</{tag}>'
    def text(self, x, y, content, size=14, w=None, weight=400, color=INK, lh=1.5, nowrap=False, align='left', extra='', name=None):
        st = f'position: absolute; left: {f(x)}px; top: {f(y)}px'
        if w: st += f'; width: {f(w)}px'
        st += f'; font-size: {f(size)}px; font-weight: {weight}; line-height: {lh}; color: {color}; text-align: {align}'
        if nowrap: st += '; white-space: nowrap'
        if extra: st += '; ' + extra
        self.raw(self.tb(st, content, name=name)); return self.ntb - 1
    def box(self, x, y, w, h, bg=None, r=0, border=None, extra=''):
        st = f'position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; height: {f(h)}px'
        if r: st += f'; border-radius: {f(r)}px'
        if border: st += f'; border: {border}'
        if bg: st += f'; background: {bg}'
        st += '; box-sizing: border-box'
        if extra: st += '; ' + extra
        self.raw(f'<div style="{st}"></div>')
    def card(self, x, y, w, h, bg='#ffffff', r=16): self.box(x, y, w, h, bg=bg, r=r, border=f'1px solid {LINE}')
    def hline(self, x, y, w, color=LINE, t=1): self.box(x, y, w, t, bg=color)
    def vline(self, x, y, h, color=LINE, t=1): self.box(x, y, t, h, bg=color)
    def num(self, x, y, n, d=24, bg=BLUE, color='#ffffff', size=12):
        st = (f'width: {d}px; height: {d}px; flex-shrink: 0; font-family: Manrope, sans-serif; border-radius: 9999px; background: {bg}; color: {color}; '
              f'font-size: {size}px; font-weight: 800; display: flex; align-items: center; justify-content: center')
        self.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px">' + self.tb(st, str(n)) + '</div>')
    def icon(self, x, y, name, size=64, r=16, bg=TINT, color=BLUE, stroke=1.8, isz=None):
        isz = isz or round(size * 0.47)
        self.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px"><div style="width: {size}px; height: {size}px; flex-shrink: 0; border-radius: {r}px; background: {bg}; '
                 f'display: flex; align-items: center; justify-content: center"><svg width="{isz}" height="{isz}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="{stroke}" '
                 f'stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="{ICONS[name]}"></path></svg></div></div>')
    def photo(self, x, y, w, h, fill, hint, alt='', kind='space', r=16, pos='50% 50%', fit='cover', badge=None, pid=None, bg='transparent', pad=0, name=None):
        i = self.nimg; self.nimg += 1
        if name: self.imgnames[name] = i
        pid = pid or ('std.' + re.sub(r'[^a-z0-9_]', '_', (fill.split('/')[-1].split('.')[0] + '_' + fill.split('#')[-1]).lower()))
        badge = (kind == 'space' and w >= 300) if badge is None else badge
        self.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px"><div style="position: relative; width: {f(w)}px; height: {f(h)}px; box-sizing: border-box; '
                 f'padding: {f(pad)}px; overflow: hidden; border-radius: {f(r)}px; background: {bg};" data-slot="Photo" data-pid="{pid}" data-img="{i}" data-kind="{kind}" data-hint="{esc(hint)}">'
                 f'<img src="{GIF}" data-fill="{fill}" alt="{esc(alt or hint)}" style="display: block; width: 100%; height: 100%; object-fit: {fit}; object-position: {pos};" data-pid="{pid}">'
                 + (BADGE if badge else '') + '</div></div>')
        self.hints.append(hint); self.kinds.append(kind); self.pids.append(pid)
        self.area += w * h * (0.5 if kind == 'cut' else 1.0)
        return i
    # ---------- shared chrome ----------
    def head(self, eb, title, sub=None):
        self.raw(self.tb(f'position: absolute; left: 64px; top: 44px; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: {BLUE}; white-space: nowrap', eb, name='eb'))
        self.raw(self.tb(f'position: absolute; left: 64px; top: 66px; width: 1152px; font-size: 30px; font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis', title, name='title'))
        if sub is not None:
            self.raw(self.tb(f'position: absolute; left: 64px; top: 113px; width: 1152px; font-size: 15px; line-height: 1.5; color: {GRAY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis', sub, name='sub'))
    def foot(self, text, page, dark=False):
        line = 'rgba(255,255,255,0.22)' if dark else LINE
        col = 'rgba(255,255,255,0.7)' if dark else MUTE
        bd = 'rgba(255,255,255,0.45)' if dark else DASH
        self.raw(f'<div style="position: absolute; left: 64px; top: 668px; width: 1152px; height: 1px; background: {line}"></div>')
        self.raw(f'<div style="position: absolute; left: 64px; top: 680px; display: flex; align-items: center; gap: 12px; font-size: 11px; color: {col}; max-width: 1032px">'
                 + self.tb(f'width: 72px; height: 20px; flex-shrink: 0; box-sizing: border-box; border: 1px dashed {bd}; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 9px', '고객사 로고', 'span', name='logo')
                 + self.tb('white-space: nowrap; overflow: hidden; text-overflow: ellipsis', text, 'span', name='foot') + '</div>')
        self.raw(self.tb(f'position: absolute; left: 1106px; width: 110px; text-align: right; top: 683px; font-size: 11px; color: {col}; font-family: Manrope, sans-serif', f'CONFIDENTIAL · {page}', name='conf'))
    def label(self, x, y, text, color=MUTE, size=11.5):
        return self.text(x, y, text, size, weight=800, color=color, nowrap=True, extra='letter-spacing: 0.06em')
    def pill(self, x, y, n, label, dark=True):
        """사진 위 번호 + 이름 캡슐 (L_AIS_11 과 같은 모양)"""
        nst = ('width: 24px; height: 24px; flex-shrink: 0; font-family: Manrope, sans-serif; border-radius: 9999px; background: #1428a0; color: #ffffff; font-size: 12px; '
               'font-weight: 800; display: flex; align-items: center; justify-content: center')
        self.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px"><div style="display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px 0 4px; '
                 f'border-radius: 999px; background: {CAP if dark else "#ffffff"}">' + self.tb(nst, str(n)) +
                 self.tb(f'font-size: 13px; font-weight: 800; color: {"#ffffff" if dark else INK}; white-space: nowrap', label, 'span') + '</div></div>')
    def html(self):
        return (f'<div style="width: 1280px; height: 720px; position: relative; overflow: hidden; background: {self.bg}; color: {INK}; font-family: {FONT}; '
                f'word-break: keep-all; overflow-wrap: anywhere">' + ''.join(self.parts) + '</div>')
