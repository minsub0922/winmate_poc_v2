# Independent check of the matched media: numbered contact sheets per item (final.json order, #0 = card thumbnail).
import json, sys, math, glob
sys.path.insert(0, '/home/claude/media/scripts')
from photocrop import load
from PIL import Image, ImageDraw, ImageFont
M = '/home/claude/media'
f = json.load(open(f'{M}/final.json'))['items']
cat = json.load(open('/home/claude/w2/data/catalog.json'))
C = {str(c['id']): c for c in cat['cases']}; S = {s['id']: s for s in cat['solutions']}
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK-Regular.ttc', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))[0]
F = ImageFont.truetype(fp, 15); FB = ImageFont.truetype(fp, 26)
CW, CH, COLS, PER = 300, 230, 5, 20
sheets = []
for key, L in f.items():
    t, i = key.split(':')
    if t == 'case':
        c = C[i]; title = f"사례 {i} · {c['cust']} — {c.get('sub') or ''}"; ctx = {'title': c['title'], 'industry': c.get('indRaw'), 'offer': c.get('offer'), 'space': c.get('space'), 'type': c.get('type')}
    else:
        s = S[i]; title = f"솔루션 {i} · {s['name']} ({s['cat']})"; ctx = {'desc': s['desc'], 'kw': s['kw']}
    for p in range(math.ceil(len(L) / PER)):
        part = L[p * PER:(p + 1) * PER]
        rows = math.ceil(len(part) / COLS)
        W, H = COLS * CW, rows * CH + 44
        im = Image.new('RGB', (W, H), (236, 238, 242)); d = ImageDraw.Draw(im)
        d.text((10, 8), title[:90] + (f'  [{p + 1}/{math.ceil(len(L) / PER)}]' if len(L) > PER else ''), fill=(0, 0, 0), font=F)
        imgs = []
        for j, x in enumerate(part):
            n = p * PER + j
            X, Y = (j % COLS) * CW, 44 + (j // COLS) * CH
            d.rectangle((X + 3, Y + 3, X + CW - 3, Y + CH - 3), fill=(255, 255, 255))
            try:
                a = load(x['file']).convert('RGB'); a.thumbnail((CW - 14, CH - 40))
                im.paste(a, (X + (CW - a.width) // 2, Y + 7 + (CH - 40 - a.height) // 2))
            except Exception as e:
                d.text((X + 10, Y + 60), 'LOAD FAIL', fill=(200, 0, 0), font=F)
            d.rectangle((X + 3, Y + 3, X + 46, Y + 33), fill=(220, 30, 40) if n == 0 else (20, 40, 160))
            d.text((X + 8, Y + 3), str(n), fill=(255, 255, 255), font=FB)
            d.text((X + 8, Y + CH - 30), f"{x['kind']} · {x['desc'][:17]}", fill=(60, 60, 60), font=F)
            imgs.append({'n': n, 'kind': x['kind'], 'd': x['desc'], 'role': x['role'], 'size': list(load(x['file']).size)})
        name = f"{key.replace(':', '_')}" + (f'_p{p + 1}' if len(L) > PER else '') + '.jpg'
        im.save(f'{M}/verify/sheets/{name}', quality=82)
        sheets.append({'sheet': f'{M}/verify/sheets/{name}', 'key': key, 'title': title, 'ctx': ctx, 'imgs': imgs})
# batches of roughly equal image count
N = int(sys.argv[1]) if len(sys.argv) > 1 else 8
tot = sum(len(s['imgs']) for s in sheets); per = tot / N
batches = [[] for _ in range(N)]; acc = 0; b = 0
for s in sheets:
    if acc >= per * (b + 1) and b < N - 1: b += 1
    batches[b].append(s); acc += len(s['imgs'])
for k, B in enumerate(batches):
    json.dump(B, open(f'{M}/verify/batch_{k}.json', 'w'), ensure_ascii=False, indent=1)
    print(k, len(B), sum(len(s['imgs']) for s in B))
print('sheets', len(sheets), 'images', tot)
