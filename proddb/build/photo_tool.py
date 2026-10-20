"""e-카탈로그 쪽 이미지에서 제품 사진을 잘라 내는 도구(사람 · 에이전트가 쓰는 작업 도구, 규칙은 ecat/PHOTO_BRIEF.md).
Tool for cutting product photos out of e-catalog pages.

Pages: $PHOTO_WORK/pages/<DIR>_<PAGE3>.jpg  (page key like 297_037)
Coordinates are always PERCENT of the page (x0 y0 x1 y1, 0..100, left/top origin).

  python3 ptool.py grid KEY                      → view/KEY.grid.jpg  whole page + 5% grid, labelled rulers
  python3 ptool.py zoom KEY x0 y0 x1 y1          → view/KEY.zoom.jpg  that region enlarged + 1% grid (labels every 5%)
  python3 ptool.py crop PID KEY x0 y0 x1 y1 [--kind cut|scene|diagram] [--nosnap] [--n 2] [--note "..."]
        → crops/PID.jpg (or PID__2.jpg for a 2nd picture) + crops/PID.json record; prints the snapped box.
          Snap: tightens the box to the object(s) inside it on a flat background (white or a panel colour).
          --nosnap keeps your box exactly (use for photos that fill a frame, scenes, or when snap cuts wrongly).
  python3 ptool.py none PID "reason"             → crops/PID.none.json (no usable picture anywhere)
  python3 ptool.py find DIR "text"               → catalog pages of DIR whose text contains "text" (model code / name)
  python3 ptool.py sheet PID [PID ...]           → view/sheet_<first>.jpg contact sheet of finished crops (to check)
"""
import sys, os, json, sqlite3, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W0 = os.environ.get('PHOTO_WORK', os.path.join(HERE, '..', 'photo_work'))  # 작업 폴더: pages/(쪽 이미지) · pdf/(카탈로그 PDF + map.json) · crops/ · view/
PAGES = f'{W0}/pages'
VIEW = f'{W0}/view'
CROPS = f'{W0}/crops'
DB = os.path.join(HERE, '..', 'winmate_products.sqlite')
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_KO = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
os.makedirs(VIEW, exist_ok=True)
os.makedirs(CROPS, exist_ok=True)
RED = (225, 0, 0)


def font(sz, ko=False):
    p = FONT_KO if ko and os.path.exists(FONT_KO) else FONT
    return ImageFont.truetype(p, sz)


def page(key):
    return Image.open(f'{PAGES}/{key}.jpg').convert('RGB')


def grid(key, max_side=1500):
    im = page(key)
    W, H = im.size
    sc = min(1.0, max_side / max(W, H))
    base = im.resize((int(W * sc), int(H * sc)), Image.LANCZOS)
    cw, ch = base.size
    pad = 30
    cv = Image.new('RGB', (cw + 2 * pad, ch + 2 * pad), (255, 255, 255))
    cv.paste(base, (pad, pad))
    ov = Image.new('RGBA', cv.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    f = font(12)
    for i in range(0, 21):
        t = i / 20
        x, y = pad + t * cw, pad + t * ch
        a = 110 if i % 2 == 0 else 55
        d.line([(x, pad), (x, pad + ch)], fill=(255, 0, 0, a), width=1)
        d.line([(pad, y), (pad + cw, y)], fill=(255, 0, 0, a), width=1)
    cv = Image.alpha_composite(cv.convert('RGBA'), ov).convert('RGB')
    d = ImageDraw.Draw(cv)
    for i in range(0, 21, 2):
        t = i / 20
        x, y = pad + t * cw, pad + t * ch
        s = str(i * 5)
        d.text((x - 7, 8), s, font=f, fill=RED)
        d.text((x - 7, pad + ch + 8), s, font=f, fill=RED)
        d.text((2, y - 7), s, font=f, fill=RED)
        d.text((pad + cw + 3, y - 7), s, font=f, fill=RED)
    out = f'{VIEW}/{key}.grid.jpg'
    cv.save(out, quality=85)
    return out


def zoom(key, x0, y0, x1, y1, max_side=1400):
    im = page(key)
    W, H = im.size
    bx = [int(W * x0 / 100), int(H * y0 / 100), int(W * x1 / 100), int(H * y1 / 100)]
    reg = im.crop(bx)
    rw, rh = reg.size
    sc = min(max_side / max(rw, rh), 6.0)
    reg = reg.resize((max(1, int(rw * sc)), max(1, int(rh * sc))), Image.LANCZOS)
    cw, ch = reg.size
    pad = 34
    cv = Image.new('RGB', (cw + 2 * pad, ch + 2 * pad), (255, 255, 255))
    cv.paste(reg, (pad, pad))
    ov = Image.new('RGBA', cv.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    span_x, span_y = x1 - x0, y1 - y0
    step = 1 if max(span_x, span_y) <= 40 else 5
    f = font(12)
    labels = []
    v = int(np.ceil(x0))
    while v <= x1:
        x = pad + (v - x0) / span_x * cw
        major = v % 5 == 0
        d.line([(x, pad), (x, pad + ch)], fill=(255, 0, 0, 120 if major else 45), width=1)
        if major: labels.append(('x', x, v))
        v += step
    v = int(np.ceil(y0))
    while v <= y1:
        y = pad + (v - y0) / span_y * ch
        major = v % 5 == 0
        d.line([(pad, y), (pad + cw, y)], fill=(255, 0, 0, 120 if major else 45), width=1)
        if major: labels.append(('y', y, v))
        v += step
    cv = Image.alpha_composite(cv.convert('RGBA'), ov).convert('RGB')
    d = ImageDraw.Draw(cv)
    for k, p, v in labels:
        if k == 'x':
            d.text((p - 8, 10), str(v), font=f, fill=RED); d.text((p - 8, pad + ch + 10), str(v), font=f, fill=RED)
        else:
            d.text((2, p - 7), str(v), font=f, fill=RED); d.text((pad + cw + 4, p - 7), str(v), font=f, fill=RED)
    out = f'{VIEW}/{key}.zoom.jpg'
    cv.save(out, quality=88)
    return out


def snap(a, R, W, H):
    """a: page array; R: [x0,y0,x1,y1] px. Returns tightened box or None (keep R)."""
    import cv2
    mx, my = int(W * 0.012), int(H * 0.012)
    E = [max(0, R[0] - mx), max(0, R[1] - my), min(W, R[2] + mx), min(H, R[3] + my)]
    e = a[E[1]:E[3], E[0]:E[2]].astype(np.int16)
    if e.size == 0:
        return None
    border = np.concatenate([e[0], e[-1], e[:, 0], e[:, -1]])
    bg = np.median(border, axis=0)
    close = (np.abs(border - bg).max(axis=1) < 14).mean()
    if close < 0.6:  # no flat background around it (scene / full-bleed photo): keep the box
        return None
    fg = (np.abs(e - bg).max(axis=2) > 16).astype(np.uint8)
    fg = cv2.dilate(fg, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg, 8)
    rx0, ry0, rx1, ry1 = R[0] - E[0], R[1] - E[1], R[2] - E[0], R[3] - E[1]
    keep = []
    for i in range(1, n):
        x, y, w, h, ar = st[i]
        if ar < 12:
            continue
        if min(w, h) <= 7 and max(w, h) / max(1, min(w, h)) > 10:  # rule line / underline
            continue
        sub = lab[max(y, ry0):min(y + h, ry1), max(x, rx0):min(x + w, rx1)]
        inside = (sub == i).sum() if sub.size else 0
        if inside / ar >= 0.5:
            keep.append((x, y, x + w, y + h, ar))
    if not keep:
        return None
    tot = sum(k[4] for k in keep)
    big = max(k[4] for k in keep)
    keep = [k for k in keep if k[4] >= big * 0.004 or k[4] >= 40]
    x0 = min(k[0] for k in keep); y0 = min(k[1] for k in keep); x1 = max(k[2] for k in keep); y1 = max(k[3] for k in keep)
    if (x1 - x0) * (y1 - y0) < 0.08 * (R[2] - R[0]) * (R[3] - R[1]) or tot < 200:
        return None
    p = max(4, int(0.03 * max(x1 - x0, y1 - y0)))
    return [int(max(0, E[0] + x0 - p)), int(max(0, E[1] + y0 - p)), int(min(W, E[0] + x1 + p)), int(min(H, E[1] + y1 + p))]


def hires(key, box, W, H):
    """Re-cut the same region from the catalogue PDF at a higher resolution when we have it."""
    dr, pg = key.split('_')
    mpf = f'{W0}/pdf/map.json'
    pdf = f'{W0}/pdf/{dr}.pdf'
    if not (os.path.exists(mpf) and os.path.exists(pdf)):
        return None
    mp = json.load(open(mpf)).get(dr, {}).get(str(int(pg)))
    if not mp or not (mp[2] == mp[2]) or mp[2] < 0.85:
        return None
    import fitz
    d = fitz.open(pdf)
    p = d[mp[0]]
    r = p.rect
    half = mp[1]
    hx0, hw = (r.x0, r.width) if half == 'F' else ((r.x0, r.width / 2) if half == 'L' else (r.x0 + r.width / 2, r.width / 2))
    fx0 = hx0 + box[0] / W * hw; fx1 = hx0 + box[2] / W * hw
    fy0 = r.y0 + box[1] / H * r.height; fy1 = r.y0 + box[3] / H * r.height
    clip = fitz.Rect(fx0, fy0, fx1, fy1)
    want = max(900, (box[2] - box[0]) * 2)
    z = min(8.0, want / max(1e-3, clip.width))
    pix = p.get_pixmap(matrix=fitz.Matrix(z, z), clip=clip, alpha=False)
    im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    return im if im.width > (box[2] - box[0]) * 1.2 else None


def crop(pid, key, x0, y0, x1, y1, kind='cut', nosnap=False, n=1, note=''):
    im = page(key)
    W, H = im.size
    R = [int(W * x0 / 100), int(H * y0 / 100), int(round(W * x1 / 100)), int(round(H * y1 / 100))]
    a = np.array(im)
    box = None if nosnap else snap(a, R, W, H)
    snapped = box is not None
    box = box or R
    hi = hires(key, box, W, H)
    out_im = hi or im.crop(box)
    base = pid if n == 1 else f'{pid}__{n}'
    out_im.save(f'{CROPS}/{base}.jpg', quality=92)
    recf = f'{CROPS}/{pid}.json'
    try:
        rec = json.load(open(recf)) if os.path.exists(recf) else {'id': pid, 'pics': []}
    except ValueError:
        rec = {'id': pid, 'pics': []}
    rec['pics'] = [p for p in rec['pics'] if p['n'] != n]
    rec['pics'].append({'n': n, 'page': key, 'req': [x0, y0, x1, y1], 'box_px': box, 'snapped': snapped, 'kind': kind,
                        'note': note, 'size': list(out_im.size), 'src': 'pdf' if hi else 'page'})
    rec['pics'].sort(key=lambda p: p['n'])
    json.dump(rec, open(recf, 'w'), ensure_ascii=False)
    nf = f'{CROPS}/{pid}.none.json'
    if os.path.exists(nf): os.remove(nf)
    # preview: the page region around the crop with the final box drawn
    pv = im.copy()
    d = ImageDraw.Draw(pv)
    d.rectangle(box, outline=(255, 0, 0), width=max(2, W // 400))
    mx, my = int(W * 0.06), int(H * 0.06)
    ctx = pv.crop([max(0, box[0] - mx), max(0, box[1] - my), min(W, box[2] + mx), min(H, box[3] + my)])
    ctx.thumbnail((700, 700))
    cut = out_im.copy(); cut.thumbnail((700, 700))
    cv = Image.new('RGB', (ctx.width + cut.width + 30, max(ctx.height, cut.height) + 10), (255, 255, 255))
    cv.paste(ctx, (5, 5)); cv.paste(cut, (ctx.width + 25, 5))
    pvf = f'{VIEW}/{base}.check.jpg'
    cv.save(pvf, quality=85)
    pct = [round(box[0] / W * 100, 1), round(box[1] / H * 100, 1), round(box[2] / W * 100, 1), round(box[3] / H * 100, 1)]
    return {'crop': f'{CROPS}/{base}.jpg', 'check': pvf, 'snapped': snapped, 'box_pct': pct, 'size': list(out_im.size), 'src': 'pdf' if hi else 'page'}


def none(pid, reason):
    json.dump({'id': pid, 'none': True, 'reason': reason}, open(f'{CROPS}/{pid}.none.json', 'w'), ensure_ascii=False)
    for f in (f'{CROPS}/{pid}.json',):
        if os.path.exists(f): os.remove(f)
    return 'recorded none'


def find(dr, text):
    d = sqlite3.connect(DB)
    rows = d.execute('SELECT page, text FROM catalog_page WHERE dir=? AND text LIKE ? ORDER BY page', (dr, f'%{text}%')).fetchall()
    out = []
    for p, t in rows:
        i = t.find(text)
        out.append(f'{dr}_{p:03d}: …{t[max(0, i - 60):i + 80]}…'.replace('\n', ' '))
    return '\n'.join(out) or 'no page'


def sheet(pids, names=None):
    tiles = []
    for pid in pids:
        rec = f'{CROPS}/{pid}.json'
        if not os.path.exists(rec):
            continue
        for p in json.load(open(rec))['pics']:
            f = f'{CROPS}/{pid}.jpg' if p['n'] == 1 else f'{CROPS}/{pid}__{p["n"]}.jpg'
            tiles.append((pid + ('' if p['n'] == 1 else f' #{p["n"]}'), f))
    if not tiles:
        return 'nothing'
    TW, TH = 300, 230
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    cv = Image.new('RGB', (cols * TW, rows * TH), (245, 245, 245))
    d = ImageDraw.Draw(cv)
    f = font(13, True)
    for i, (lab, fpath) in enumerate(tiles):
        im = Image.open(fpath).convert('RGB'); im.thumbnail((TW - 12, TH - 40))
        x, y = (i % cols) * TW, (i // cols) * TH
        d.rectangle([x + 2, y + 2, x + TW - 2, y + TH - 2], fill=(255, 255, 255))
        cv.paste(im, (x + (TW - im.width) // 2, y + 6))
        d.text((x + 6, y + TH - 30), lab[:40], font=f, fill=(0, 0, 0))
    out = f'{VIEW}/sheet_{pids[0]}.jpg'
    cv.save(out, quality=85)
    return out


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'grid':
        print(grid(sys.argv[2]))
    elif cmd == 'zoom':
        print(zoom(sys.argv[2], *map(float, sys.argv[3:7])))
    elif cmd == 'crop':
        ap = argparse.ArgumentParser()
        ap.add_argument('pid'); ap.add_argument('key'); ap.add_argument('c', nargs=4, type=float)
        ap.add_argument('--kind', default='cut'); ap.add_argument('--nosnap', action='store_true'); ap.add_argument('--n', type=int, default=1); ap.add_argument('--note', default='')
        a = ap.parse_args(sys.argv[2:])
        print(json.dumps(crop(a.pid, a.key, *a.c, kind=a.kind, nosnap=a.nosnap, n=a.n, note=a.note), ensure_ascii=False))
    elif cmd == 'none':
        print(none(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ''))
    elif cmd == 'find':
        print(find(sys.argv[2], sys.argv[3]))
    elif cmd == 'sheet':
        print(sheet(sys.argv[2:]))
    else:
        print(__doc__)
