"""Card photos for new site products → app/web/public/assets/products/<id>-{t,0,1,2}.webp (app-owned static, not the frozen pack)."""
import json, sys, io, re, urllib.request
from PIL import Image
raw, outdir, spec = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])   # spec: {gid: [image indexes]}
W = json.load(open(raw, encoding='utf-8'))
UA = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.samsung.com/sec/business/'}
res = {}
for gid, idx in spec.items():
    p = W['products'][gid]; pid = 'sg_' + gid.lower(); files = []; alts = []
    for n, k in enumerate(idx):
        im = p['images'][k]; url = 'https:' + im['src'] if im['src'].startswith('//') else im['src']
        b = urllib.request.urlopen(urllib.request.Request(url + '?$1300_1038_PNG$', headers=UA), timeout=60).read()
        img = Image.open(io.BytesIO(b)).convert('RGBA')
        bg = Image.new('RGBA', img.size, (255, 255, 255, 255)); bg.alpha_composite(img); img = bg.convert('RGB')
        bbox = Image.eval(img.convert('L'), lambda v: 255 - v).point(lambda v: 255 if v > 8 else 0).getbbox()   # trim white margin like the existing cut packs
        if bbox: img = img.crop(bbox)
        for suffix, size in ([('t', 320)] if n == 0 else []) + [(str(n), 640)]:
            c = img.copy(); c.thumbnail((size, size)); c.save(f'{outdir}/{pid}-{suffix}.webp', 'WEBP', quality=82)
        files.append(f'/assets/products/{pid}-{n}.webp'); alts.append(im['alt'])
    res[pid] = {'th': f'/assets/products/{pid}-t.webp', 'gal': files, 'galAlt': alts, 'galSrc': ['samsung.com 상품 카드 이미지'] * len(files)}
print(json.dumps(res, ensure_ascii=False))
