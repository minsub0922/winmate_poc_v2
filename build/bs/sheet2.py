# 검사 스크린샷 → build/bs/check/<sid>-sheet-N.jpg (2열 큰 미리보기)
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont
sid = sys.argv[1]; cols = 2; TW = 900; TH = TW * 9 // 16
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 18)
fs_ = sorted(glob.glob(f'build/bs/check/{sid}/*.jpg'))
for o in glob.glob(f'build/bs/check/{sid}-sheet-*.jpg'): os.remove(o)
per = 6
for s in range(0, len(fs_), per):
    ch = fs_[s:s + per]; rows = (len(ch) + cols - 1) // cols
    im = Image.new('RGB', (cols * (TW + 8), rows * (TH + 28)), (190, 195, 205)); d = ImageDraw.Draw(im)
    for i, p in enumerate(ch):
        x, y = (i % cols) * (TW + 8), (i // cols) * (TH + 28)
        im.paste(Image.open(p).resize((TW, TH)), (x, y + 26)); d.text((x + 4, y + 2), os.path.basename(p)[:-4], fill=(0, 0, 0), font=font)
    im.save(f'build/bs/check/{sid}-sheet-{s // per}.jpg', quality=80)
print('sheets', (len(fs_) + per - 1) // per)
