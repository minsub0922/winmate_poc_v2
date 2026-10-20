# 파트 유형별 레이아웃 미리보기 묶음 — build/hist/sheets/<part>-N.jpg (그림 위 f · 이름 · 사진/글 · 업종)
import json, os
from PIL import Image, ImageDraw, ImageFont
L = json.load(open('build/hist/layouts.json'))
SL = json.load(open('build/hist/slots.json'))
OUT = 'build/hist/sheets'; os.makedirs(OUT, exist_ok=True)
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 15)
fontb = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 17)
TW, TH, COLS, ROWS = 400, 225, 3, 4
by = {}
for l in L:
    if l['retired']: continue
    by.setdefault(l['p'], []).append(l)
idx = []
for p, arr in by.items():
    arr.sort(key=lambda l: (0 if l['ph'] else 1, l['ind'] or '', l['f']))
    per = COLS * ROWS
    for s in range(0, len(arr), per):
        chunk = arr[s:s + per]; rows = (len(chunk) + COLS - 1) // COLS
        im = Image.new('RGB', (COLS * (TW + 8), rows * (TH + 46)), (230, 232, 238)); d = ImageDraw.Draw(im)
        for i, l in enumerate(chunk):
            x, y = (i % COLS) * (TW + 8), (i // COLS) * (TH + 46)
            try:
                t = Image.open(f"build/hist/gal/{l['f']}.jpg").convert('RGB'); t.thumbnail((TW, TH)); im.paste(t, (x, y))
            except Exception as e: d.text((x + 4, y + 4), 'ERR', fill=(200, 0, 0), font=font)
            sl = SL.get(l['f']) or {}
            nt, ni = len(sl.get('tbs', [])), len(sl.get('imgs', []))
            d.rectangle([x, y + TH, x + TW, y + TH + 46], fill=(255, 255, 255))
            d.text((x + 3, y + TH + 1), f"{l['f']}  {'사진' if l['ph'] else '글'} · 글{nt} 사진{ni}" + (f" · {l['ind']}" if l['ind'] else ''), fill=(20, 40, 160), font=fontb)
            d.text((x + 3, y + TH + 23), (l['name'] or '')[:30], fill=(30, 30, 30), font=font)
        fn = f"{OUT}/{p}-{s // per}.jpg"; im.save(fn, quality=78)
    idx.append(f"- {p}: {len(arr)}장 (사진 {sum(1 for l in arr if l['ph'])}) → sheets/{p}-0..{(len(arr) - 1) // (COLS * ROWS)}.jpg")
open(f'{OUT}/INDEX.md', 'w').write('\n'.join(idx))
print('\n'.join(idx))
