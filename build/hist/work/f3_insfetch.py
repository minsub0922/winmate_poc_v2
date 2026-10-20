# F3 전용 — insights.samsung.com(Samsung Business Insights) 사진 가져오기. addphoto.py 와 같은 출력 형식.
# python3 -I build/hist/work/f3_insfetch.py <s47295.pcdn.co 사진 주소> <이름> "<설명>" <insights.samsung.com 페이지> [--crop x0,y0,x1,y1] [--gray]
import sys, os, re, json, io, subprocess
from PIL import Image, ImageOps
a = sys.argv[1:]
url, name, desc, page = a[0], a[1], a[2], a[3]
crop = [float(x) for x in a[a.index('--crop') + 1].split(',')] if '--crop' in a else None
gray = '--gray' in a; mx = 1400
assert re.match(r'https://s47295\.pcdn\.co/wp-content/uploads/', url)
assert re.match(r'https://insights\.samsung\.com/', page)
assert re.match(r'^f3-[a-z0-9-]{2,40}$', name)
out = f'build/hist/newimg/{name}.jpg'
if os.path.exists(out): print('이미 있음', out); sys.exit(1)
b = subprocess.run(['curl', '-sL', '-m', '30', url], capture_output=True).stdout
im = Image.open(io.BytesIO(b)).convert('RGB'); W, H = im.size
if crop: im = im.crop((round(crop[0] * W), round(crop[1] * H), round(crop[2] * W), round(crop[3] * H)))
if gray: im = ImageOps.grayscale(im).convert('RGB')
if im.width > mx: im = im.resize((mx, round(im.height * mx / im.width)), Image.LANCZOS)
im.save(out, quality=84, optimize=True, progressive=True)
json.dump({'file': out, 'addr': f'img/hist/{name}.jpg', 'desc': desc, 'page': page, 'orig': url, 'crop': crop, 'gray': gray, 'size': [im.width, im.height],
           'site': 'insights.samsung.com (Samsung Business Insights · 사진 CDN s47295.pcdn.co)'}, open(f'build/hist/newimg/{name}.json', 'w'), ensure_ascii=False, indent=1)
os.makedirs('dist/img/hist', exist_ok=True); im.save(f'dist/img/hist/{name}.jpg', quality=84)
print('ok', out, im.size)
