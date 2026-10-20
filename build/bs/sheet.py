# 장 스크린샷 → 시나리오별 확인용 묶음: python3 build/bs/sheet.py <shots dir> <out dir> [cols] [width]
import sys, os, glob, json
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3; TW = int(sys.argv[4]) if len(sys.argv) > 4 else 560
os.makedirs(out, exist_ok=True)
TH = TW * 9 // 16
audit = {}
aj = os.path.join(os.path.dirname(src.rstrip('/')), os.path.basename(src.rstrip('/')).replace('shots', 'audit') + '.json')
if os.path.exists(aj):
    for a in json.load(open(aj)): audit[(a['id'], a['k'])] = a
try: font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 15)
except Exception: font = ImageFont.load_default()
groups = {}
for p in sorted(glob.glob(os.path.join(src, '*.jpg'))):
    b = os.path.basename(p)[:-4]; sid, k = b.rsplit('-', 1); groups.setdefault(sid, []).append((int(k), p))
for sid, items in groups.items():
    for part in range(0, len(items), cols * 4):
        chunk = items[part:part + cols * 4]
        rows = (len(chunk) + cols - 1) // cols
        W, Hh = cols * (TW + 8), rows * (TH + 26)
        im = Image.new('RGB', (W, Hh), (200, 204, 212)); d = ImageDraw.Draw(im)
        for i, (k, p) in enumerate(chunk):
            x, y = (i % cols) * (TW + 8), (i // cols) * (TH + 26)
            im.paste(Image.open(p).resize((TW, TH)), (x, y + 22))
            a = audit.get((sid, k), {})
            d.text((x + 4, y + 2), f"{k} {a.get('f','')} pf={a.get('pfReal','')}", fill=(0, 0, 0), font=font)
        im.save(os.path.join(out, f"{sid}-{part // (cols * 4)}.jpg"), quality=78)
print('ok', len(groups))
