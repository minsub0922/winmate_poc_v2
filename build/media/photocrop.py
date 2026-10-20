# Find photo regions inside composite "page slice" images (photo + paragraphs on white).
import numpy as np
from PIL import Image
def load(path):
    im = Image.open(path); im.seek(0); im = im.convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); return bg.convert('RGB')
def runs(mask, min_len, gap=0):
    out, s, last = [], None, None
    for i, v in enumerate(mask):
        if v:
            if s is None: s = i
            last = i
        elif s is not None and i - last > gap:
            if last - s + 1 >= min_len: out.append((s, last + 1))
            s = None
    if s is not None and last - s + 1 >= min_len: out.append((s, last + 1))
    return out
def regions(im, min_h=110, min_w=160):
    a = np.asarray(im, dtype=np.int16)
    H, W = a.shape[:2]
    mx, mn = a.max(axis=2), a.min(axis=2)
    # "ink": not near-white background
    ink = (mn < 236) | ((mx - mn) > 18)
    # local texture: photo pixels rarely sit in long flat white runs
    rowf = ink.mean(axis=1)
    bands = runs(rowf > 0.42, min_h, gap=6)
    out = []
    for (y0, y1) in bands:
        colf = ink[y0:y1].mean(axis=0)
        cols = runs(colf > 0.55, min_w, gap=4)
        for (x0, x1) in cols:
            sub = ink[y0:y1, x0:x1]
            # tighten rows inside this column span
            rf = sub.mean(axis=1); rr = runs(rf > 0.6, min_h, gap=6)
            for (a0, a1) in rr:
                yy0, yy1 = y0 + a0, y0 + a1
                blk = a[yy0:yy1, x0:x1]
                # photos: many distinct tones; text blocks/flat banners: few
                std = float(blk.std())
                q = blk[::4, ::4].reshape(-1, 3) // 16
                tones = len(np.unique(q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]))
                out.append({'box': (int(x0), int(yy0), int(x1), int(yy1)), 'std': round(std, 1), 'tones': tones, 'frac': round((x1 - x0) * (yy1 - yy0) / (W * H), 3)})
    return out
if __name__ == '__main__':
    import sys, json
    for p in sys.argv[1:]:
        im = load(p); print(p.split('/')[-1], im.size, json.dumps(regions(im)))

def seams(im, box, axis=0):
    """split points between side-by-side photos (only for very wide bands)"""
    x0, y0, x1, y1 = box
    a = np.asarray(im.crop(box).convert('L'), dtype=np.int16)
    if axis == 1: a = a.T
    h, w = a.shape
    if w < 300 or w / h < 1.9: return []
    d = np.abs(a[:, 1:] - a[:, :-1])
    strong = (d > 16).mean(axis=0)
    white = (a > 238).mean(axis=0)
    n = max(1, round(w / h / 1.45))          # expected number of photos (≈ 3:2 each)
    out = []
    for k in range(1, n):
        c = int(w * k / n); lo, hi = max(1, int(c - w * 0.12)), min(w - 2, int(c + w * 0.12))
        if hi - lo < 3: continue
        seg = strong[lo:hi]; wseg = white[lo:hi]
        gut = np.where(wseg > 0.9)[0]
        if len(gut): out.append(lo + int(gut[len(gut) // 2])); continue
        x = int(seg.argmax())
        if seg[x] > 0.45: out.append(lo + x + 1)
    return out

def split(im, box):
    x0, y0, x1, y1 = box
    xs = seams(im, box, 0)
    cols = sorted(set([x0] + [x0 + s for s in xs] + [x1]))
    parts = []
    for i in range(len(cols) - 1):
        bb = (cols[i], y0, cols[i + 1], y1)
        if bb[2] - bb[0] < 20: continue
        sub = np.asarray(im.crop(bb).convert('L'))
        cm = (sub < 238).mean(axis=0); rm = (sub < 238).mean(axis=1)
        cx = np.where(cm > 0.25)[0]; ry = np.where(rm > 0.25)[0]
        if len(cx) and len(ry): bb = (bb[0] + int(cx[0]), bb[1] + int(ry[0]), bb[0] + int(cx[-1]) + 1, bb[1] + int(ry[-1]) + 1)
        if bb[2] - bb[0] >= 160 and bb[3] - bb[1] >= 110: parts.append(bb)
    return parts

def trim_box(im, box, tol=7):
    """shrink a box past flat white/black borders"""
    x0, y0, x1, y1 = box
    a = np.asarray(im.crop(box).convert('L'), dtype=np.int16)
    h, w = a.shape
    def flat(v): return v.std() < tol and (v.mean() > 228 or v.mean() < 30)
    t, b, l, r = 0, h, 0, w
    while t < b - 60 and flat(a[t, l:r]): t += 1
    while b > t + 60 and flat(a[b - 1, l:r]): b -= 1
    while l < r - 60 and flat(a[t:b, l]): l += 1
    while r > l + 60 and flat(a[t:b, r - 1]): r -= 1
    return (x0 + l, y0 + t, x0 + r, y0 + b)
