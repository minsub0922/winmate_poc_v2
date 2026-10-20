# samsung.com 사진 가져오기 — python3 build/bs/addphoto.py <사진 주소> <이름(영문-소문자)> "<내용 설명>" <출처 페이지> [--crop x0,y0,x1,y1 (0~1 비율)] [--max 1400]
# → build/bs/newimg/<이름>.jpg + <이름>.json(출처). 채우기에서는 "img/bsn/<이름>.jpg" 로 씀 (게시 때 묶음으로 옮김).
import sys, os, re, json, io, subprocess
from PIL import Image
a = sys.argv[1:]
url, name, desc, page = a[0], a[1], a[2], a[3]
crop = None; mx = 1400
if '--crop' in a: crop = [float(x) for x in a[a.index('--crop') + 1].split(',')]
if '--max' in a: mx = int(a[a.index('--max') + 1])
assert re.match(r'https://images\.samsung\.com/', url), '사진 주소는 images.samsung.com 만'
assert re.match(r'https://(www\.)?samsung\.com/', page), '출처 페이지는 samsung.com 만'
assert re.match(r'^[a-z0-9][a-z0-9-]{2,40}$', name), '이름은 영문 소문자 · 숫자 · - 만'
out = f'build/bs/newimg/{name}.jpg'
if os.path.exists(out): print('이미 있음 — 다른 이름을 쓰거나 그대로 쓰세요:', out); sys.exit(1)
b = subprocess.run(['curl', '-sL', '-m', '30', url], capture_output=True).stdout
im = Image.open(io.BytesIO(b)).convert('RGB'); W, H = im.size
if crop: im = im.crop((round(crop[0] * W), round(crop[1] * H), round(crop[2] * W), round(crop[3] * H)))
if im.width > mx: im = im.resize((mx, round(im.height * mx / im.width)), Image.LANCZOS)
im.save(out, quality=84, optimize=True, progressive=True)
json.dump({'file': out, 'addr': f'img/bsn/{name}.jpg', 'desc': desc, 'page': page, 'orig': url, 'crop': crop, 'size': [im.width, im.height]}, open(f'build/bs/newimg/{name}.json', 'w'), ensure_ascii=False, indent=1)
os.makedirs('dist/img/bsn', exist_ok=True); im.save(f'dist/img/bsn/{name}.jpg', quality=84)
print('ok', out, im.size, '→ 채우기 주소: img/bsn/' + name + '.jpg')
