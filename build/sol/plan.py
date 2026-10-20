# Isometric shared-office floor plan for P03 — zones placed under the slide's space labels.
X0, Y0, C = 420, 40, 0.866
U, V = 460, 440
def P(u, v, z=0): return (X0 + (u - v) * C, Y0 + (u + v) * 0.5 - z)
def poly(pts, fill, stroke='none', sw=0, op=1):
    d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    return f'<polygon points="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" fill-opacity="{op}" stroke-linejoin="round"/>'
def shade(hexc, k):
    r, g, b = int(hexc[1:3], 16), int(hexc[3:5], 16), int(hexc[5:7], 16)
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(c * k))) for c in (r, g, b))
items = []  # (depth, svg)
def box(u0, v0, u1, v1, z0, z1, col, line='#9aa3ae', sw=0.6, op=1, d=None):
    top = [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)]
    fr = [P(u1, v0, z0), P(u1, v1, z0), P(u1, v1, z1), P(u1, v0, z1)]
    fl = [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)]
    s = poly(fl, shade(col, 0.86), line, sw, op) + poly(fr, shade(col, 0.76), line, sw, op) + poly(top, col, line, sw, op)
    items.append((d if d is not None else (u0 + u1) / 2 + (v0 + v1) / 2 + z0 * 0.01, s))
def flat(u0, v0, u1, v1, col, z=0.2, d=-1, op=1, line='none', sw=0):
    items.append((d, poly([P(u0, v0, z), P(u1, v0, z), P(u1, v1, z), P(u0, v1, z)], col, line, sw, op)))
def circ(u, v, z, r, col, d=None, line='none'):
    x, y = P(u, v, z)
    items.append((d if d is not None else u + v + 0.5, f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r:.1f}" ry="{r*0.58:.1f}" fill="{col}" stroke="{line}" stroke-width="0.6"/>'))
def plant(u, v, s=1.0):
    box(u - 5 * s, v - 5 * s, u + 5 * s, v + 5 * s, 0, 9 * s, '#e3e6ea', d=u + v)
    x, y = P(u, v, 9 * s + 9 * s)
    items.append((u + v + 0.3, f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{11*s:.1f}" fill="#9ec19c"/><circle cx="{x-4*s:.1f}" cy="{y-3*s:.1f}" r="{6*s:.1f}" fill="#b6d3b2"/>'))
def chair(u, v, col='#c3c9d2'):
    box(u - 5, v - 5, u + 5, v + 5, 6, 9, col, sw=0.4); box(u - 1, v - 1, u + 1, v + 1, 0, 6, '#aab1bb', sw=0, d=u + v - 0.1)
def desk(u0, v0, u1, v1, mon=True, side='v'):
    box(u0, v0, u1, v1, 14, 16, '#ffffff'); box(u0 + 2, v0 + 2, u0 + 4, v0 + 4, 0, 14, '#c9ced6', sw=0, d=(u0 + v0) + 0.1)
    if mon:
        if side == 'v': box((u0 + u1) / 2 - 7, v0 + 3, (u0 + u1) / 2 + 7, v0 + 5, 16, 30, '#2f3a4a', line='#2f3a4a')
        else: box(u0 + 3, (v0 + v1) / 2 - 7, u0 + 5, (v0 + v1) / 2 + 7, 16, 30, '#2f3a4a', line='#2f3a4a')
WH = 46
# floor slab + zone tints
items.append((-10, poly([P(0, 0, 0), P(U, 0, 0), P(U, V, 0), P(0, V, 0)], '#f1f2f4', '#c7ccd3', 1)))
items.append((-9, poly([P(U, 0, 0), P(U, V, 0), P(U, V, -10), P(U, 0, -10)], '#d6dae0', '#c0c6ce', 0.8)))
items.append((-9, poly([P(0, V, 0), P(U, V, 0), P(U, V, -10), P(0, V, -10)], '#e2e5e9', '#c0c6ce', 0.8)))
flat(0, 100, 130, 310, '#e7eaee', d=-5)            # lobby
flat(165, 135, 405, 325, '#eef0f3', d=-5)          # workspace carpet
flat(330, 235, U, V, '#efe9e1', d=-5)              # lounge · cafe (warm)
flat(0, 0, 160, 95, '#eceef1', d=-5)               # phone booths
# back walls
box(-6, 0, 0, V, 0, WH, '#ffffff', d=-3)          # left back wall (u=0)
box(0, -6, U, 0, 0, WH, '#ffffff', d=-3)          # right back wall (v=0)
# entrance gap glass + door in left wall
box(-6, 175, 0, 232, 0, WH, '#cfe0f2', line='#9bb6d4', op=0.85, d=-2)
# video wall on left back wall (lobby)
items.append((-1.5, poly([P(1, 112, 12), P(1, 168, 12), P(1, 168, 40), P(1, 112, 40)], '#27354b', '#1d2838', 1)))
items.append((-1.4, poly([P(1.2, 115, 15), P(1.2, 165, 15), P(1.2, 165, 37), P(1.2, 115, 37)], '#3f6eb5', 'none', 0, 0.85)))
# lobby reception desk + sign + plants
box(62, 135, 82, 250, 0, 20, '#ffffff'); box(64, 137, 80, 248, 20, 21.5, '#dfe3e8', sw=0.3)
box(98, 262, 112, 266, 0, 44, '#ffffff', d=98 + 262); box(99, 263, 111, 265, 18, 42, '#2b3a52', line='#2b3a52', d=99 + 264)  # standalone signage
plant(20, 285); plant(110, 125, 0.9)
# phone booths (top-left corner)
for i, u0 in enumerate([20, 70, 120]):
    box(u0, 12, u0 + 38, 52, 0, WH - 4, '#f7f8fa', line='#aab2bc', d=u0 + 12)
    box(u0 + 38, 14, u0 + 39, 50, 2, WH - 6, '#bcd2ea', line='#9bb6d4', op=0.6, d=u0 + 60)
# admin room (glass) — top-right
box(180, 0, 330, 2, 0, WH, '#bcd2ea', line='#9bb6d4', op=0.5, d=170)
box(178, 0, 180, 112, 0, WH - 6, '#bcd2ea', line='#9bb6d4', op=0.45, d=200)
desk(210, 30, 300, 56, mon=True)
for u in (225, 255, 285): chair(u, 66)
box(312, 20, 326, 70, 0, 30, '#e3e6ea')  # cabinet
items.append((326 + 20 + 1, poly([P(326.5, 24, 6), P(326.5, 66, 6), P(326.5, 66, 26), P(326.5, 24, 26)], '#3d5d8f', 'none', 0, 0.0)))
box(180, 110, 330, 112, 0, WH - 6, '#bcd2ea', line='#9bb6d4', op=0.45, d=330 + 110)
# workspace desk rows
for v0 in (155, 205, 255):
    for u0 in (190, 250, 310):
        desk(u0, v0, u0 + 52, v0 + 22, mon=True)
        chair(u0 + 14, v0 + 30); chair(u0 + 38, v0 + 30)
plant(390, 145, 0.9); plant(160, 300, 0.9)
# printer (MFP) next to workspace
box(140, 150, 156, 168, 0, 26, '#f4f5f7'); box(141, 151, 155, 167, 26, 28, '#4d7fc4', sw=0)
# meeting room (glass) — left corner
box(0, 330, 200, 333, 0, WH - 6, '#bcd2ea', line='#9bb6d4', op=0.45, d=330)
box(46, 362, 150, 412, 14, 16, '#ffffff'); box(50, 366, 52, 368, 0, 14, '#c9ced6', sw=0, d=416)
for u in (60, 85, 110, 135): chair(u, 355); chair(u, 420)
items.append((-1.2, poly([P(1, 350, 12), P(1, 420, 12), P(1, 420, 38), P(1, 350, 38)], '#27354b', '#1d2838', 1)))
items.append((-1.1, poly([P(1.2, 353, 15), P(1.2, 417, 15), P(1.2, 417, 35), P(1.2, 353, 35)], '#f4f5f7', 'none', 0, 0.95)))
box(200, 333, 203, 440, 0, WH - 6, '#bcd2ea', line='#9bb6d4', op=0.4, d=200 + 440)
# lounge · cafe
box(350, 395, 455, 425, 0, 22, '#ffffff')               # counter
box(432, 395, 455, 425, 22, 23, '#e7e2da', sw=0.3)
box(452, 350, 460, 392, 0, 50, '#f6d24a', line='#c9a92d')  # yellow fridge
box(452, 300, 460, 340, 0, 50, '#e9e6df', line='#b9b4ab')  # water purifier · dresser
box(345, 250, 362, 330, 0, 10, '#9bb0d6', line='#7f93b8')  # sofa
box(345, 250, 400, 262, 0, 10, '#9bb0d6', line='#7f93b8')
box(345, 250, 362, 330, 10, 20, '#8aa1cc', line='#7f93b8', d=345 + 250 + 0.5) if False else None
for (u, v) in ((392, 300), (420, 345), (380, 360)):
    box(u - 9, v - 9, u + 9, v + 9, 13, 14.5, '#ffffff'); box(u - 1, v - 1, u + 1, v + 1, 0, 13, '#c4c9d1', sw=0, d=u + v - 0.2)
    chair(u - 15, v); chair(u + 15, v)
plant(440, 255); plant(330, 430, 0.9)
items.sort(key=lambda t: t[0])
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 594" width="1260" height="891">' + ''.join(s for _, s in items) + '</svg>'
open('plan.svg', 'w').write(svg)
print(len(items))
