# 라이브러리 사진(묶음 포함)을 잘라 새 사진으로 — python3 build/bs/fromlib.py <addr> <이름> --crop x0,y0,x1,y1 | --trim
import sys, json, io, base64, os
from PIL import Image
addr, name = sys.argv[1], sys.argv[2]
L = {e['addr']: e for e in json.load(open('build/bs/lib/catalog.json'))}
e = L[addr]
if '.json#' in addr:
    pk, k = addr.split('#'); d = json.load(open(pk))['images'][int(k)]; im = Image.open(io.BytesIO(base64.b64decode(d.split(',', 1)[1]))).convert('RGB')
else: im = Image.open(addr).convert('RGB')
if '--crop' in sys.argv:
    c = [float(x) for x in sys.argv[sys.argv.index('--crop') + 1].split(',')]; W, H = im.size
    im = im.crop((round(c[0] * W), round(c[1] * H), round(c[2] * W), round(c[3] * H)))
if '--trim' in sys.argv:
    box = im.convert('L').point(lambda v: 255 if v < 245 else 0).getbbox(); im = im.crop(box)
im.save(f'build/bs/newimg/{name}.jpg', quality=86, optimize=True, progressive=True)
os.makedirs('dist/img/bsn', exist_ok=True); im.save(f'dist/img/bsn/{name}.jpg', quality=86)
src = {'fill/office': 'https://www.samsung.com/sec/business/system-air-conditioners/'}
json.dump({'file': f'build/bs/newimg/{name}.jpg', 'addr': f'img/bsn/{name}.jpg', 'desc': e['desc'] + ' (여백 · 캡션 띠 잘라냄)', 'page': e.get('page') or '', 'orig': addr, 'crop': sys.argv[3:], 'size': list(im.size)}, open(f'build/bs/newimg/{name}.json', 'w'), ensure_ascii=False, indent=1)
print(name, im.size, e.get('page'))
