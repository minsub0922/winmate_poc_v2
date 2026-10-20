import cv2, numpy as np, json, os, io
from PIL import Image, ImageFilter, ImageEnhance
RAW = '/home/claude/img/raw'; CUT = '/home/claude/img/cut'; OUT = '/home/claude/gen/out/img'
MAN = []

def load(p):
    return Image.open(p if p.startswith('/') else os.path.join(RAW, p))

def box_component(arr, roi, thr=250, pad=4):
    """largest bright component inside roi → bbox (x0,y0,x1,y1) in image px"""
    x0, y0, x1, y1 = [int(v) for v in roi]
    sub = arr[y0:y1, x0:x1]
    m = (sub.min(axis=2) >= thr).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1: return None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = st[i, 0], st[i, 1], st[i, 2], st[i, 3]
    return (x0 + x - pad, y0 + y - pad, x0 + x + w + pad, y0 + y + h + pad)

def blue_lines(arr, roi):
    x0, y0, x1, y1 = [int(v) for v in roi]
    sub = arr[y0:y1, x0:x1].astype(int)
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    m = ((b > 170) & (r < 110) & (b - r > 90)).astype(np.uint8)
    full = np.zeros(arr.shape[:2], np.uint8); full[y0:y1, x0:x1] = m
    return full

def inpaint(im, rects=(), extra_mask=None, radius=9, dil=3):
    arr = np.asarray(im.convert('RGB'))
    mask = np.zeros(arr.shape[:2], np.uint8)
    for r in rects:
        x0, y0, x1, y1 = [int(round(v)) for v in r]
        mask[max(0, y0):y1, max(0, x0):x1] = 1
    if extra_mask is not None: mask |= extra_mask
    if dil: mask = cv2.dilate(mask, np.ones((dil * 2 + 1, dil * 2 + 1), np.uint8))
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    res = cv2.inpaint(bgr, mask * 255, radius, cv2.INPAINT_TELEA)
    return Image.fromarray(cv2.cvtColor(res, cv2.COLOR_BGR2RGB))

def trim_alpha(im, pad=0.02):
    im = im.convert('RGBA'); bb = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bb); w, h = im.size; p = int(max(w, h) * pad)
    c = Image.new('RGBA', (w + 2 * p, h + 2 * p), (0, 0, 0, 0)); c.paste(im, (p, p)); return c

def fit(im, maxw, maxh):
    im = im.copy(); im.thumbnail((int(maxw), int(maxh)), Image.LANCZOS); return im

def darken_grad(im, x_from=0.45, strength=0.55, side='right', overall=1.0):
    im = im.convert('RGB'); w, h = im.size
    g = np.ones((h, w), np.float32) * overall
    xs = np.linspace(0, 1, w)
    if side == 'right': t = np.clip((xs - x_from) / (1 - x_from), 0, 1)
    else: t = np.clip((x_from - xs) / x_from, 0, 1)
    g *= (1 - strength * t ** 1.2)[None, :]
    a = np.asarray(im).astype(np.float32) * g[..., None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def save(key, im, kind, alt, src_page, src_img, note, q=84, maxw=None, maxh=None):
    if maxw: im = fit(im, maxw, maxh or 99999)
    if kind in ('cut', 'logo', 'qr', 'plan') or im.mode == 'RGBA':
        fn = f'{OUT}/{key}.png'
        if kind == 'qr': im.convert('L').save(fn, optimize=True)
        elif kind == 'plan': im.convert('RGB').quantize(colors=128, method=Image.Quantize.MEDIANCUT).save(fn, optimize=True)
        else:
            q2 = im.convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE)
            q2.save(fn, optimize=True)
    else:
        fn = f'{OUT}/{key}.jpg'; im.convert('RGB').save(fn, quality=q, optimize=True, progressive=True)
    w, h = Image.open(fn).size
    MAN.append(dict(key=key, file=fn, kind=kind, w=w, h=h, bytes=os.path.getsize(fn), alt=alt, page=src_page, src=src_img, note=note))
    print(f'{key:18s} {kind:5s} {w}x{h} {os.path.getsize(fn)//1024}KB')
    return fn

def dump():
    json.dump(MAN, open('/home/claude/gen/out/manifest.json', 'w'), ensure_ascii=False, indent=1)

def line_mask(shape, segs, w=5, dots=(), r=7):
    m = np.zeros(shape[:2], np.uint8)
    for (x0, y0, x1, y1) in segs: cv2.line(m, (int(x0), int(y0)), (int(x1), int(y1)), 1, w)
    for (x, y) in dots: cv2.circle(m, (int(x), int(y)), r, 1, -1)
    return m

def put_cut(base, cut, cx, bottom, h, shadow=70, sw=1.05):
    from PIL import ImageDraw
    w = int(cut.size[0] * h / cut.size[1]); c = cut.resize((w, h), Image.LANCZOS)
    b = base.convert('RGBA')
    if shadow:
        d = Image.new('L', (int(w * sw) + 16, max(10, int(h * 0.035)) + 10), 0)
        ImageDraw.Draw(d).ellipse((8, 5, d.size[0] - 9, d.size[1] - 6), fill=shadow); d = d.filter(ImageFilter.GaussianBlur(4))
        b.paste((0, 0, 0, 255), (int(cx - d.size[0] / 2), int(bottom - d.size[1] / 2)), d)
    b.alpha_composite(c, (int(cx - w / 2), int(bottom - h)))
    return b.convert('RGB')

def crop_aspect(im, box, aspect, anchor=(0.5, 0.5)):
    """largest crop of the given aspect (w/h) inside box (x0,y0,x1,y1), positioned by anchor"""
    x0, y0, x1, y1 = box; W, H = x1 - x0, y1 - y0
    if W / H > aspect: w, h = H * aspect, H
    else: w, h = W, W / aspect
    x = x0 + (W - w) * anchor[0]; y = y0 + (H - h) * anchor[1]
    return im.crop((int(round(x)), int(round(y)), int(round(x + w)), int(round(y + h))))

def inpaint_fsr(im, rects=(), extra_mask=None, dil=3, best=True):
    """frequency-selective reconstruction (opencv-contrib xphoto) — better texture than Telea for big areas"""
    arr = np.asarray(im.convert('RGB'))
    mask = np.zeros(arr.shape[:2], np.uint8)
    for r in rects:
        x0, y0, x1, y1 = [int(round(v)) for v in r]
        mask[max(0, y0):y1, max(0, x0):x1] = 1
    if extra_mask is not None: mask |= extra_mask
    if dil: mask = cv2.dilate(mask, np.ones((dil * 2 + 1, dil * 2 + 1), np.uint8))
    valid = (1 - mask).astype(np.uint8)  # xphoto: 1 = known pixel
    bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    out = np.zeros_like(bgr)
    cv2.xphoto.inpaint(bgr, valid, out, cv2.xphoto.INPAINT_FSR_BEST if best else cv2.xphoto.INPAINT_FSR_FAST)
    return Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB))
