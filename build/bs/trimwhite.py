# 사진 가장자리 흰 여백 떼기 — python3 build/bs/trimwhite.py <newimg 이름> [문턱 245]
import sys, json
from PIL import Image, ImageChops
name = sys.argv[1]; th = int(sys.argv[2]) if len(sys.argv) > 2 else 245
p = f'build/bs/newimg/{name}.jpg'; im = Image.open(p).convert('RGB')
g = im.convert('L').point(lambda v: 255 if v < th else 0)
box = g.getbbox()
if box:
    l, t, r, b = box; l = min(l + 2, r); t = min(t + 2, b); r = max(r - 2, l); b = max(b - 2, t)
    im = im.crop((l, t, r, b)); im.save(p, quality=84, optimize=True, progressive=True); im.save(f'dist/img/bsn/{name}.jpg', quality=84)
    j = json.load(open(f'build/bs/newimg/{name}.json')); j['size'] = list(im.size); json.dump(j, open(f'build/bs/newimg/{name}.json', 'w'), ensure_ascii=False, indent=1)
print(name, box, im.size)
