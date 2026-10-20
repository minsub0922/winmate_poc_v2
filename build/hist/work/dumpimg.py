# python3 build/hist/work/dumpimg.py OUTDIR src [src ...]  → OUTDIR/<n>.jpg + sheet.jpg
import sys, json, base64, io, os
from PIL import Image, ImageDraw
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
ims = []
for n, src in enumerate(sys.argv[2:]):
    if '#' in src:
        f, k = src.split('#'); p = f if os.path.exists(f) else 'dist/' + f
        d = json.load(open(p))['images'][int(k)]
        im = Image.open(io.BytesIO(base64.b64decode(d.split(',', 1)[1])))
    else:
        p = src if os.path.exists(src) else 'dist/' + src
        im = Image.open(p)
    im = im.convert('RGB'); print(n, src, im.size)
    im.save(f'{out}/{n}.jpg', quality=90)
    t = im.copy(); t.thumbnail((600, 400)); ims.append((src, t))
W = 600; H = 430
sh = Image.new('RGB', (W * min(3, len(ims)), H * ((len(ims) + 2) // 3)), 'white')
dr = ImageDraw.Draw(sh)
for n, (s, t) in enumerate(ims):
    x, y = (n % 3) * W, (n // 3) * H
    sh.paste(t, (x, y + 24)); dr.text((x + 4, y + 4), f'{n} {s}', fill='black')
sh.save(f'{out}/sheet.jpg', quality=85)
