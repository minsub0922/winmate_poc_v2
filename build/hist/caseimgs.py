# samsung.com 페이지의 사진 후보 보기 — python3 build/bs/caseimgs.py <samsung.com 페이지 주소> [이름표]
# → 사진 주소 목록(번호) + 미리보기 묶음 build/hist/tmp/cand-<이름표>.jpg  (고른 뒤 addphoto.py 로 가져오기)
import sys, re, os, subprocess, hashlib, io
from PIL import Image, ImageDraw, ImageFont
url = sys.argv[1]; tag = sys.argv[2] if len(sys.argv) > 2 else hashlib.md5(url.encode()).hexdigest()[:8]
assert re.match(r'https://(www\.)?samsung\.com/', url), 'samsung.com 페이지만'
os.makedirs('build/hist/tmp', exist_ok=True)
html = subprocess.run(['curl', '-sL', '-m', '30', url], capture_output=True).stdout.decode('utf8', 'ignore')
urls = []
for m in re.finditer(r'(?:https?:)?//images\.samsung\.com/[^"\'\s)<>]+?\.(?:jpg|jpeg|png|webp)(?:\?\$[A-Z_]+\$)?', html, re.I):
    u = m.group(0); u = 'https:' + u if u.startswith('//') else u
    u = u.replace('&amp;', '&')
    if any(x in u.lower() for x in ('icon', 'logo', 'favicon', 'sprite', 'btn', 'arrow', '/gnb/', 'gnb_', 'footer')): continue
    if u not in urls: urls.append(u)
for m in re.finditer(r'(?:https?:)?//images\.samsung\.com/is/image/samsung/[^"\'\s)<>?]+', html):
    u = m.group(0); u = 'https:' + u if u.startswith('//') else u
    if not re.search(r'\.(jpg|png|webp)', u) and u + '?$ORIGIN_JPG$' not in urls and u not in urls and not any(x in u.lower() for x in ('icon', 'logo')): urls.append(u + '?$ORIGIN_JPG$')
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 16)
th = []; ok = []
for i, u in enumerate(urls[:40]):
    b = subprocess.run(['curl', '-sL', '-m', '20', u], capture_output=True).stdout
    try:
        im = Image.open(io.BytesIO(b)); w, h = im.size
        if w < 300 or h < 200: continue
        im = im.convert('RGB'); im.thumbnail((360, 240)); th.append((len(ok) + 1, im, f'{w}×{h}')); ok.append((u, w, h))
    except Exception: continue
for i, (u, w, h) in enumerate(ok): print(f'{i + 1:2d}. {w}×{h}  {u}')
if th:
    cols = 4; rows = (len(th) + cols - 1) // cols
    S = Image.new('RGB', (cols * 366, rows * 270), (230, 232, 236)); d = ImageDraw.Draw(S)
    for j, (n, im, sz) in enumerate(th):
        x, y = (j % cols) * 366, (j // cols) * 270
        S.paste(im, (x, y + 22)); d.text((x + 3, y + 2), f'{n}  {sz}', fill=(20, 40, 160), font=font)
    S.save(f'build/hist/tmp/cand-{tag}.jpg', quality=78); print('미리보기:', f'build/hist/tmp/cand-{tag}.jpg')
else: print('사진 없음')
