# 검사 그림 묶음 — build/hist/check/<id>-sheet-N.jpg (장 4개씩, 크게)
import sys, os, glob, json
from PIL import Image, ImageDraw, ImageFont
id = sys.argv[1]
fs = sorted(glob.glob(f'build/hist/check/{id}/*.jpg'))
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 22)
rep = {}
try: rep = {str(r['k']): r for r in json.load(open(f'build/hist/check/{id}.json'))['report']}
except Exception: pass
W, H = 960, 540
for s in range(0, len(fs), 4):
    ch = fs[s:s + 4]
    im = Image.new('RGB', (2 * W + 12, ((len(ch) + 1) // 2) * (H + 36)), (40, 40, 48)); d = ImageDraw.Draw(im)
    for i, f in enumerate(ch):
        k = str(int(os.path.basename(f)[:2])); x, y = (i % 2) * (W + 12), (i // 2) * (H + 36)
        t = Image.open(f).convert('RGB').resize((W, H)); im.paste(t, (x, y + 36))
        r = rep.get(k, {}); d.text((x + 6, y + 4), f"#{k} [{r.get('where', '')}] {r.get('f', '')} {r.get('status', '')}  {'✗' + str(len(r.get('errs', []))) if r.get('errs') else ''}", fill=(255, 255, 255), font=font)
    im.save(f'build/hist/check/{id}-sheet-{s // 4}.jpg', quality=80)
print('sheets', (len(fs) + 3) // 4)
