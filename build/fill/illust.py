"""samsung.com 에 사진이 없는 설비 두 가지를 같은 결의 등각 그림으로 그린다 (구성도 아이콘 칸용).

  turbo_chiller  마그네틱 베어링 터보 냉동기 — 위아래 원통 열교환기 두 개 + 위에 얹은 압축기 + 제어반
  cooling_tower  공조용 패키지 냉각탑 — 루버가 있는 사각 본체 + 위의 팬 슈라우드

특정 회사 제품을 본뜨지 않은 일반적인 모양이고, 글자 · 로고는 넣지 않는다.
    python3 build/fill/illust.py <out dir>   → <out>/turbo_chiller.png · cooling_tower.png (투명 배경)
"""
import math
import os
import sys

from PIL import Image, ImageDraw

S = 4  # supersampling
LIGHT = (0.35, 0.55, 0.75)
_n = math.sqrt(sum(c * c for c in LIGHT)); LIGHT = tuple(c / _n for c in LIGHT)
VIEW = (1 / math.sqrt(3),) * 3


def proj(p, o, k):
    x, y, z = p
    return (o[0] + (x - y) * 0.866 * k, o[1] + (x + y) * 0.5 * k - z * k)


def shade(base, n, amb=0.55):
    d = max(0.0, sum(a * b for a, b in zip(n, LIGHT)))
    f = amb + (1 - amb) * d
    return tuple(min(255, int(c * f)) for c in base)


class Scene:
    def __init__(self):
        self.polys = []  # (depth, pts3d, color, outline)
        self.lines = []  # (depth, a, b, color, width)

    def quad(self, pts, base, n, outline=None, amb=0.55):
        if sum(a * b for a, b in zip(n, VIEW)) <= 0: return
        c = [sum(p[i] for p in pts) / len(pts) for i in range(3)]
        self.polys.append((c[0] + c[1] + c[2], pts, shade(base, n, amb), outline))

    def box(self, x0, y0, z0, x1, y1, z1, base, outline=(120, 128, 138)):
        P = lambda x, y, z: (x, y, z)
        self.quad([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], base, (0, 0, 1), outline)       # top
        self.quad([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], base, (1, 0, 0), outline)       # +x
        self.quad([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], base, (0, 1, 0), outline)       # +y

    def cyl_x(self, x0, x1, yc, zc, r, base, n=40, cap=None):
        """cylinder along x (heat-exchanger shell)"""
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            am = (a0 + a1) / 2
            nn = (0, math.cos(am), math.sin(am))
            pts = [(x0, yc + r * math.cos(a0), zc + r * math.sin(a0)), (x1, yc + r * math.cos(a0), zc + r * math.sin(a0)),
                   (x1, yc + r * math.cos(a1), zc + r * math.sin(a1)), (x0, yc + r * math.cos(a1), zc + r * math.sin(a1))]
            self.quad(pts, base, nn, None)
        ring = [(x1, yc + r * math.cos(2 * math.pi * i / n), zc + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
        self.quad(ring, cap or base, (1, 0, 0), (120, 128, 138), amb=0.7)

    def cyl_z(self, xc, yc, z0, z1, r, base, n=48, top=None):
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            am = (a0 + a1) / 2
            nn = (math.cos(am), math.sin(am), 0)
            pts = [(xc + r * math.cos(a0), yc + r * math.sin(a0), z0), (xc + r * math.cos(a1), yc + r * math.sin(a1), z0),
                   (xc + r * math.cos(a1), yc + r * math.sin(a1), z1), (xc + r * math.cos(a0), yc + r * math.sin(a0), z1)]
            self.quad(pts, base, nn, None)
        ring = [(xc + r * math.cos(2 * math.pi * i / n), yc + r * math.sin(2 * math.pi * i / n), z1) for i in range(n)]
        self.quad(ring, top or base, (0, 0, 1), (110, 118, 128), amb=0.8)

    def line(self, a, b, color=(110, 118, 128), w=1.0, lift=0.0):
        c = [(a[i] + b[i]) / 2 for i in range(3)]
        self.lines.append((c[0] + c[1] + c[2] + lift, a, b, color, w))

    def render(self, size, pad=10):
        pts = [p for _, ps, _, _ in self.polys for p in ps]
        k = 1.0
        xy = [proj(p, (0, 0), k) for p in pts]
        mnx, mxx = min(x for x, _ in xy), max(x for x, _ in xy)
        mny, mxy = min(y for _, y in xy), max(y for _, y in xy)
        W, H = size
        k = min((W - 2 * pad) / (mxx - mnx), (H - 2 * pad) / (mxy - mny)) * S
        o = (pad * S - mnx * k + ((W - 2 * pad) * S - (mxx - mnx) * k) / 2, pad * S - mny * k + ((H - 2 * pad) * S - (mxy - mny) * k) / 2)
        im = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        items = [(dep, 'p', it) for dep, *it in self.polys] + [(dep, 'l', it) for dep, *it in self.lines]
        for dep, t, it in sorted(items, key=lambda z: z[0]):
            if t == 'p':
                ps, col, outl = it
                d.polygon([proj(p, o, k) for p in ps], fill=col + (255,))
                if outl: d.line([proj(p, o, k) for p in ps] + [proj(ps[0], o, k)], fill=outl + (255,), width=max(1, int(S * 0.8)))
            else:
                a, b, col, w = it
                d.line([proj(a, o, k), proj(b, o, k)], fill=col + (255,), width=max(1, int(S * w)))
        return im.resize((W, H), Image.LANCZOS)


def turbo_chiller():
    s = Scene()
    body, dark, steel = (226, 230, 235), (92, 100, 112), (200, 206, 214)
    s.box(0, 0, 0, 200, 70, 8, dark, outline=None)                         # base frame
    for x in (18, 182):
        s.box(x - 6, 8, 8, x + 6, 62, 30, steel)                           # saddles
    s.cyl_x(4, 196, 35, 32, 24, body, cap=(214, 219, 226))                 # evaporator shell
    s.cyl_x(10, 190, 35, 82, 22, body, cap=(214, 219, 226))               # condenser shell
    s.cyl_x(196, 212, 35, 32, 20, (176, 184, 194), cap=(190, 197, 206))    # water box (evaporator)
    s.cyl_x(190, 206, 35, 82, 18, (176, 184, 194), cap=(190, 197, 206))    # water box (condenser)
    for zc in (32, 82):                                                     # nozzles
        s.cyl_x(206 if zc == 82 else 212, 226 if zc == 82 else 230, 22, zc + 6, 6, (140, 148, 160), cap=(160, 168, 178))
        s.cyl_x(206 if zc == 82 else 212, 226 if zc == 82 else 230, 48, zc - 6, 6, (140, 148, 160), cap=(160, 168, 178))
    s.cyl_x(60, 136, 35, 114, 12, (88, 118, 170), cap=(104, 134, 186))     # compressor + motor (horizontal)
    s.cyl_x(136, 152, 35, 114, 16, (70, 98, 150), cap=(90, 118, 170))       # volute
    s.box(60, 66, 10, 100, 78, 64, (238, 240, 243))                        # control panel (front)
    s.box(66, 78, 36, 94, 79, 56, (40, 52, 70), outline=None)              # panel screen
    return s.render((480, 300))


def cooling_tower():
    s = Scene()
    body, grey = (232, 236, 240), (170, 178, 188)
    W, D, H = 120, 120, 120
    s.box(-4, -4, 0, W + 4, D + 4, 14, (150, 158, 168))                    # basin
    s.box(0, 0, 14, W, D, H, body)
    # louvers on the two visible faces
    for z in range(22, 82, 7):
        s.line((W + 0.1, 6, z), (W + 0.1, D - 6, z + 3), grey, 1.4, lift=400)
        s.line((6, D + 0.1, z), (W - 6, D + 0.1, z + 3), grey, 1.4, lift=400)
    s.line((W + 0.1, 0, 88), (W + 0.1, D, 88), (150, 158, 168), 1.2, lift=400)
    s.line((0, D + 0.1, 88), (W, D + 0.1, 88), (150, 158, 168), 1.2, lift=400)
    # fan stack
    s.cyl_z(W / 2, D / 2, H, H + 26, 44, (215, 220, 226), top=(78, 86, 98))
    for i in range(8):                                                       # guard grille
        a = math.pi * i / 8
        s.line((W / 2 - 42 * math.cos(a), D / 2 - 42 * math.sin(a), H + 26.2), (W / 2 + 42 * math.cos(a), D / 2 + 42 * math.sin(a), H + 26.2), (170, 176, 186), 0.9, lift=900)
    s.cyl_z(W / 2, D / 2, H + 26, H + 27, 8, (60, 66, 76), top=(60, 66, 76))
    # access ladder on +x face
    for y in (D - 22, D - 12):
        s.line((W + 1, y, 14), (W + 1, y, H + 4), (120, 128, 138), 1.2, lift=500)
    for z in range(20, H, 10):
        s.line((W + 1, D - 22, z), (W + 1, D - 12, z), (120, 128, 138), 1.0, lift=500)
    return s.render((360, 380))


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    turbo_chiller().save(os.path.join(out, 'turbo_chiller.png'))
    cooling_tower().save(os.path.join(out, 'cooling_tower.png'))
    print('ok')
