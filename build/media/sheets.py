import json, os, math
from PIL import Image, ImageDraw, ImageFont
M = '/home/claude/media'
cands = json.load(open(f'{M}/cands2.json'))
CAT = json.load(open('/home/claude/wm/data/catalog.json'))
C = {str(c['id']): c for c in CAT['cases']}; S = {s['id']: s for s in CAT['solutions']}
FONT = None
for p in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc']:
    if os.path.exists(p): FONT = p
f_big = ImageFont.truetype(FONT, 26) if FONT else ImageFont.load_default()
f_sm = ImageFont.truetype(FONT, 15) if FONT else ImageFont.load_default()
CW, CH, COLS, PER = 260, 180, 6, 24
os.makedirs(f'{M}/sheets', exist_ok=True)
index = []
def thumb(path):
    im = Image.open(path); im.seek(0); im = im.convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
    im.thumbnail((CW, CH)); return im
for key, L in cands.items():
    if not L: continue
    t, iid = key.split(':')
    title = (C[iid]['title'] if t == 'case' else S[iid]['name'] + ' · ' + S[iid]['cat']) if t != 'pool' else '업종 페이지 이미지 풀'
    chunks = [L[i:i + PER] for i in range(0, len(L), PER)]
    for ci, ch in enumerate(chunks):
        rows = math.ceil(len(ch) / COLS)
        sh = Image.new('RGB', (COLS * (CW + 10) + 10, 50 + rows * (CH + 34)), (236, 238, 242))
        d = ImageDraw.Draw(sh)
        d.text((12, 10), f'{key}  {title[:70]}' + (f'  ({ci + 1}/{len(chunks)})' if len(chunks) > 1 else ''), fill=(20, 20, 20), font=f_sm)
        side = []
        for j, x in enumerate(ch):
            n = ci * PER + j + 1
            r, c = divmod(j, COLS)
            x0, y0 = 10 + c * (CW + 10), 40 + r * (CH + 34)
            d.rectangle([x0, y0, x0 + CW, y0 + CH], fill=(255, 255, 255))
            try:
                im = thumb(x['file']); sh.paste(im, (x0 + (CW - im.width) // 2, y0 + (CH - im.height) // 2))
            except Exception as e: d.text((x0 + 10, y0 + 10), 'ERR', fill=(200, 0, 0), font=f_sm)
            d.rectangle([x0, y0, x0 + 44, y0 + 32], fill=(20, 40, 160))
            d.text((x0 + 6, y0 + 1), str(n), fill=(255, 255, 255), font=f_big)
            d.text((x0 + 2, y0 + CH + 6), f"{x['w']}×{x['h']} {x['role']}", fill=(60, 60, 60), font=f_sm)
            side.append({'n': n, 'id': x['id'], 'alt': (x.get('alt') or '')[:120], 'ctx': (x.get('ctx') or '')[:160], 'size': f"{x['w']}x{x['h']}", 'role': x['role']})
        name = key.replace(':', '_').replace('|', '_') + (f'_{ci + 1}' if len(chunks) > 1 else '')
        sh.save(f'{M}/sheets/{name}.jpg', quality=82)
        index.append({'sheet': f'{M}/sheets/{name}.jpg', 'key': key, 'title': title, 'imgs': side})
json.dump(index, open(f'{M}/sheets/index.json', 'w'), ensure_ascii=False, indent=0)
print(len(index), 'sheets')
