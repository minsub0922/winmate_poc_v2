# 갤러리 묶음: python3 build/bs/gsheet.py <dir> <out prefix> [cols] [width]
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4; TW = int(sys.argv[4]) if len(sys.argv) > 4 else 420
TH = TW * 9 // 16
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 15)
files = sorted(glob.glob(os.path.join(src, '*.jpg')))
per = cols * 4
for s in range(0, len(files), per):
    chunk = files[s:s + per]; rows = (len(chunk) + cols - 1) // cols
    im = Image.new('RGB', (cols * (TW + 8), rows * (TH + 24)), (200, 204, 212)); d = ImageDraw.Draw(im)
    for i, p in enumerate(chunk):
        x, y = (i % cols) * (TW + 8), (i // cols) * (TH + 24)
        im.paste(Image.open(p).resize((TW, TH)), (x, y + 22)); d.text((x + 4, y + 2), os.path.basename(p)[:-4], fill=(0, 0, 0), font=font)
    im.save(f"{out}{s // per}.jpg", quality=78)
print((len(files) + per - 1) // per, 'sheets')
