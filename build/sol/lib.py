# Winmate 레이아웃 빌더 — 공유오피스 Lite 표준 제안서 (L_SOL_01..15)
# 좌표 입력은 원본 PDF pt(명세 그대로) → 1280×720 px 로 ×4/3. 텍스트는 기준선(baseline) 기준으로 배치.
import json, html as _h
K = 1280 / 960.0095
BUND = json.load(open('/home/claude/gen/out/bundles.json'))['idx']
MAN = {m['key']: m for m in json.load(open('/home/claude/gen/out/manifest.json'))}
GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
FONT = "'Noto Sans KR', system-ui, sans-serif"
BLUE, NAVY, TEAL, SKY, CYAN = '#006eff', '#0051bc', '#19b4b4', '#00a0ff', '#00b0f0'
INK, GRAY, MUTE, PGN, LINE = '#000000', '#404040', '#808080', '#8b8b8b', '#bfbfbf'

def k(v): return v * K
def f(v): return ('%.2f' % v).rstrip('0').rstrip('.')
def esc(s): return _h.escape(s, quote=True)

class Slide:
    def __init__(self, fid, bg='#ffffff', color=INK):
        self.fid = fid; self.parts = []; self.tb = 0; self.ni = 0; self.bg = bg; self.color = color
        self.texts = []; self.hints = []; self.kinds = []; self.alts = []; self.photo_area = 0.0; self.pids = []
    # ---------- primitives (px) ----------
    def raw(self, s): self.parts.append(s)
    def box(self, x, y, w, h, bg=None, r=0, border=None, extra=''):
        st = f'position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; height: {f(h)}px'
        if bg: st += f'; background: {bg}'
        if r: st += f'; border-radius: {f(r)}px'
        if border: st += f'; border: {border}; box-sizing: border-box'
        if extra: st += '; ' + extra
        self.parts.append(f'<div style="{st}"></div>')
    def text(self, x, top, content, size, color=INK, weight=400, w=None, align='left', lh=None, nowrap=False, extra='', pgno=False, plain=None):
        lh = lh or size * 1.3
        st = f'position: absolute; left: {f(x)}px; top: {f(top)}px'
        if w is not None: st += f'; width: {f(w)}px'
        st += f'; font-size: {f(size)}px; line-height: {f(lh)}px; color: {color}; font-weight: {weight}; text-align: {align}'
        if nowrap: st += '; white-space: nowrap'
        if extra: st += '; ' + extra
        a = f' data-pgno="1"' if pgno else ''
        self.parts.append(f'<div style="{st}" data-tb="{self.tb}"{a}>{content}</div>')
        self.texts.append(plain if plain is not None else _plain(content)); self.tb += 1
        return self.tb - 1
    def tbl(self, x_pt, bl_pt, content, size_pt, lh_px=None, **kw):
        """text by baseline (pt). size in pt, lh in px."""
        fs = k(size_pt); lh = lh_px or fs * 1.3
        top = k(bl_pt) - (lh / 2 + 0.436 * fs)
        return self.text(k(x_pt), top, content, fs, lh=lh, **kw)
    def tcen(self, cx_px, bl_pt, content, size_pt, w_px, lh_px=None, **kw):
        fs = k(size_pt); lh = lh_px or fs * 1.3
        top = k(bl_pt) - (lh / 2 + 0.436 * fs)
        return self.text(cx_px - w_px / 2, top, content, fs, lh=lh, w=w_px, align='center', **kw)
    def photo(self, x, y, w, h, key, hint, kind='space', r=0, fit='cover', pos='50% 50%', pad=0, bg='transparent', border=None, count=True):
        m = MAN[key]; pid = 'sol.' + key
        st = f'position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; height: {f(h)}px; box-sizing: border-box; padding: {f(pad)}px; overflow: hidden; border-radius: {f(r)}px; background: {bg}'
        if border: st += f'; border: {border}'
        self.parts.append(f'<div style="{st}" data-slot="Photo" data-pid="{pid}" data-img="{self.ni}" data-kind="{kind}" data-hint="{esc(hint)}">'
                          f'<img src="{GIF}" data-fill="{BUND[key]}" alt="{esc(m["alt"])}" style="display: block; width: 100%; height: 100%; object-fit: {fit}; object-position: {pos};" data-pid="{pid}"></div>')
        self.hints.append(hint); self.kinds.append(kind); self.alts.append(m['alt']); self.pids.append(key)
        if count and kind != 'cut': self.photo_area += w * h
        elif count: self.photo_area += w * h * 0.5
        self.ni += 1
        return self.ni - 1
    def static(self, x, y, w, h, key, fit='contain'):
        m = MAN[key]
        self.parts.append(f'<img src="{GIF}" data-fill="{BUND[key]}" alt="{esc(m["alt"])}" style="position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; height: {f(h)}px; display: block; object-fit: {fit};">')
        self.pids.append(key)
    def hl(self, x, y, w, color, t=1):
        self.box(x, y - t / 2, w, t, bg=color)
    def vl(self, x, y, h, color, t=1):
        self.box(x - t / 2, y, t, h, bg=color)
    def dot(self, cx, cy, d, color):
        self.box(cx - d / 2, cy - d / 2, d, d, bg=color, r=9999)
    # ---------- shared chrome (original PDF pt geometry) ----------
    def sec_title(self, num, lines, x_text_pt=61.6):
        """section title 22pt bold — number block + title block (1–2 lines)"""
        fs = k(22); lh = k(26.42)
        top = k(48.19) - (lh / 2 + 0.436 * fs)
        if num: self.text(k(26.39), top, num, fs, weight=700, lh=lh, nowrap=True)
        self.text(k(x_text_pt if num else 26.39), top, '<br>'.join(lines), fs, weight=700, lh=lh, w=k(300), extra='letter-spacing: -0.02em')
    def sec_desc(self, lines):
        fs = k(14); lh = k(16.7)
        top = k(40.31) - (lh / 2 + 0.436 * fs)
        self.text(k(366.89), top, '<br>'.join(lines), fs, color=GRAY, lh=lh, w=k(933.59 - 366.89) + 4, extra='letter-spacing: -0.03em')
    def band(self, label, x_pt=26.36, w_pt=907.23, bl_pt=118.29):
        self.box(k(x_pt), k(93.69), k(w_pt), k(35.12), bg=BLUE)
        fs = k(22); lh = fs * 1.2
        self.text(k(x_pt), k(bl_pt) - (lh / 2 + 0.436 * fs), label, fs, color='#ffffff', weight=700, w=k(w_pt), align='center', lh=lh, nowrap=True)
    def frame(self, x_pt=26.33, y_pt=92.98, w_pt=907.23, h_pt=389.96):
        self.box(k(x_pt), k(y_pt), k(w_pt), k(h_pt), border=f'0.68px solid {LINE}')
    def pageno(self, n):
        fs = k(10.49); lh = fs * 1.2
        self.text(k(933.6) - 60, k(524.21) - (lh / 2 + 0.436 * fs), str(n), fs, color=PGN, w=60, align='right', lh=lh, nowrap=True, pgno=True)
    def note(self, x_pt, bl_pt, lines, pitch_pt=10.0, w_pt=600, color=MUTE, align='left'):
        fs = k(7); lh = k(pitch_pt)
        top = k(bl_pt) - (lh / 2 + 0.436 * fs)
        x = k(x_pt)
        self.text(x, top, '<br>'.join(lines), fs, color=color, lh=lh, w=k(w_pt), align=align)
    def card(self, x_pt, y_pt, w_pt, h_pt, title, body, tx_pt=None, t_bl=None, b_bl=None, pitch=14.4, r=10, op=0.74, tsize=14, bsize=11.99, tcolor=BLUE):
        """흰 설명 카드 — 74% 흰색, 둥근 모서리, 파란 제목 + 검은 본문"""
        self.box(k(x_pt), k(y_pt), k(w_pt), k(h_pt), bg=f'rgba(255,255,255,{op})', r=r)
        tx = tx_pt if tx_pt is not None else x_pt + 12.5
        t_bl = t_bl if t_bl is not None else y_pt + 20.5
        b_bl = b_bl if b_bl is not None else t_bl + 22.7
        wpx = k(x_pt + w_pt - tx) - 6
        self.tbl(tx, t_bl, title, tsize, lh_px=k(tsize) * 1.25, color=tcolor, weight=700, w=wpx + 30, nowrap=True)
        self.tbl(tx, b_bl, body, bsize, lh_px=k(pitch), w=wpx + 8)
    def qr(self, x_pt, y_pt, s_pt, key, label_lines, lab_y_pt=None, lab_h_pt=28.4, lsize=7.0, lpitch=8.42):
        self.static(k(x_pt), k(y_pt), k(s_pt), k(s_pt), key)
        ly = lab_y_pt if lab_y_pt is not None else y_pt + s_pt + 3.8
        self.box(k(x_pt), k(ly), k(s_pt), k(lab_h_pt), bg='#000000')
        fs = k(lsize); lh = k(lpitch)
        n = len(label_lines)
        top = k(ly) + (k(lab_h_pt) - n * lh) / 2
        self.text(k(x_pt), top, '<br>'.join(label_lines), fs, color='#ffffff', weight=700, w=k(s_pt), align='center', lh=lh, nowrap=True)
    def capsule(self, x_pt, y_pt, label, w_pt=100.69, h_pt=20.18, r=3.8, bg=BLUE, color='#ffffff', size=14, border=None, weight=700):
        self.box(k(x_pt), k(y_pt), k(w_pt), k(h_pt), bg=bg, r=r, border=border)
        fs = k(size); lh = k(h_pt)
        self.text(k(x_pt), k(y_pt), label, fs, color=color, weight=weight, w=k(w_pt), align='center', lh=lh, nowrap=True)
    def html(self):
        root = f'width: 1280px; height: 720px; position: relative; overflow: hidden; background: {self.bg}; color: {self.color}; font-family: {FONT}; word-break: keep-all; overflow-wrap: anywhere'
        return f'<div style="{root}">' + ''.join(self.parts) + '</div>'

import re as _re
def _plain(s):
    s = _re.sub(r'<br\s*/?>', ' ', s); s = _re.sub(r'<[^>]+>', '', s)
    return _h.unescape(s).strip()
