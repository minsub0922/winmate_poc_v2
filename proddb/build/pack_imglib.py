"""제품 이미지 라이브러리 → 앱 묶음.
  ../img/lib/index.json   앱이 처음 필요할 때 받는 색인(이미지마다 id · 종류 · 출처 · 제품 · 설명 · 맥락 · 공간 · 원본 주소/쪽 · 묶음 주소)
  ../img/lib/pNN.json     사진 묶음 { images: [dataURL …] } — 주소 "img/lib/p03.json#12" (bgpack.js 와 같은 형식)
사진 원본: imglib/ 의 파일(카탈로그에서 자른 것) 또는 imglib_cache/<id>.* (fetch_imglib.py 가 원본 주소에서 받음).
앱용은 400×300 안 WebP(제품 컷은 여백을 잘라 320×240 안), 품질 60 — 파일 수 한도 때문에 묶음 2개. 묶음은 제품 순서로 채워 한 제품의 사진이 한두 묶음에 모이게 한다."""
import json, os, sys, io, base64, re
from PIL import Image, ImageChops
HERE = os.path.dirname(os.path.abspath(__file__))
APP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..')
LIBD = os.path.join(HERE, '..', 'imglib')
CACHE = os.path.join(HERE, '..', 'imglib_cache')
IDX = json.load(open(os.path.join(LIBD, 'index.json'), encoding='utf-8'))
OUT = os.path.join(APP, 'img', 'lib'); os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if re.match(r'^p\d+\.json$', f) or f == 'index.json': os.remove(os.path.join(OUT, f))
PACK_BYTES = 15_200_000  # 아티팩트 파일 하나 16MB 한도 · 파일 수 한도(511) 때문에 크게 묶음
MAX_PACKS = 2            # 색인 1 + 묶음 2 = 파일 3개(2026-10-19 아티팩트 508 → 511)
CUT_BOX, PH_BOX, Q = (320, 240), (400, 300), 60  # 앱 미리보기 크기(제품 컷은 여백을 잘라서) · WebP 품질
db = json.load(open(os.path.join(APP, 'data', 'products_db.json'), encoding='utf-8'))
CAT = json.load(open(os.path.join(APP, 'data', 'catalog.json'), encoding='utf-8'))
order = {c['id']: k for k, c in enumerate(CAT['products'])}
for k, p in enumerate(db['products']): order[p['id']] = 1000 + k
KO = {'cut': 0, 'scene': 1, 'detail': 2, 'ui': 3, 'diagram': 4}


def source_path(o):
    if o.get('file'): return os.path.join(LIBD, o['file'])
    if o.get('app_file'): return os.path.join(APP, o['app_file'])
    for ext in ('.jpg', '.png', '.webp'):
        p = os.path.join(CACHE, o['id'] + ext)
        if os.path.exists(p): return p
    return None


def enc(o):
    p = source_path(o)
    if not p: return None
    im = Image.open(p); im.load()
    if im.mode in ('P', 'LA'): im = im.convert('RGBA')
    if o['kind'] == 'cut':
        if im.mode == 'RGBA':
            b = im.split()[-1].getbbox()
            if b: im = im.crop(b)
        else:
            rgb = im.convert('RGB'); diff = ImageChops.difference(rgb, Image.new('RGB', rgb.size, (255, 255, 255))).convert('L').point(lambda v: 255 if v > 14 else 0)
            b = diff.getbbox()
            if b: im = im.crop(b)
        im.thumbnail(CUT_BOX, Image.LANCZOS)
    else:
        im = im.convert('RGB'); im.thumbnail(PH_BOX, Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=Q, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode(), im.size


def dhash(im):
    a = im.convert('L').resize((9, 8), Image.LANCZOS).tobytes()
    v = 0
    for y in range(8):
        for x in range(8): v = (v << 1) | (a[y * 9 + x + 1] > a[y * 9 + x])
    return v


# 상품 카드 컷 중 이미 제품 사진 묶음(img/prod/gNN.json)에 든 것은 그 주소를 그대로 씀(중복 저장 안 함)
PROD = {}
GAL_SIZE = {}
for f in sorted(os.listdir(os.path.join(APP, 'img', 'prod'))):
    if not re.match(r'^g\d+\.json$', f): continue
    for k, d in enumerate(json.load(open(os.path.join(APP, 'img', 'prod', f)))['images']):
        try:
            im = Image.open(io.BytesIO(base64.b64decode(d.split(',', 1)[1])))
            bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im.convert('RGBA'))
            PROD.setdefault(dhash(bg) >> 40, []).append((dhash(bg), f'img/prod/{f}#{k}', im.size)); GAL_SIZE[f'img/prod/{f}#{k}'] = im.size
        except Exception: pass


# 상품 카드 사진 원본 주소 → 갤러리 묶음 주소(pack_images.py 의 enc_site 와 같은 순서: img_raw/<gid>_<k>.png 중 받아진 것)
RAW = os.path.join(HERE, '..', 'img_raw')
WKB = json.load(open(os.path.join(HERE, '..', 'raw', 'wkb_products.json')))['products']
norm_url = lambda u: re.sub(r'^(https?:)?//', '', (u or '').split('?')[0])
BY_URL = {}
for x in list(db['products']) + list(db['curated'].values()):
    g = x.get('gid'); gal = x.get('gal') or []
    if not g or g not in WKB or not gal or not str(gal[0]).startswith('img/prod/g0'): continue
    ks = [k for k in range(3) if os.path.exists(f'{RAW}/{g}_{k}.png') and os.path.getsize(f'{RAW}/{g}_{k}.png') > 500]
    for a, k in zip(gal, ks):
        u = norm_url(WKB[g]['images'][k]['src'])
        BY_URL.setdefault(u, a)


def prod_addr(o):
    if o['src'] == 'site_card' and o['kind'] == 'cut':
        for u in [o.get('url')] + [a.get('url') for a in (o.get('also') or [])]:
            a = BY_URL.get(norm_url(u))
            if a:
                pk, n = a.split('#'); 
                return a, GAL_SIZE.get(a, (560, 400))
    p = source_path(o)
    if not p or o['src'] != 'site_card' or o['kind'] != 'cut': return None
    im = Image.open(p); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im.convert('RGBA'))
    h = dhash(bg)
    for h2, a, sz in PROD.get(h >> 40, []):
        if bin(h ^ h2).count('1') <= 3: return a, sz
    return None


L = sorted(IDX['images'], key=lambda o: (min(order.get(p, 9e9) for p in o['products']), KO.get(o['kind'], 9), o['id']))
packs = [[]]; size = 0; out = []; reused = 0
for o in L:
    pa = prod_addr(o)
    if pa:
        reused += 1
        out.append({'i': o['id'], 'k': o['kind'], 's': o['src'], 'p': o['products'], 't': o['title'], 'd': (o.get('desc') or '')[:140], 'c': (o.get('ctx') or '')[:120],
                    'sp': o.get('spaces') or [], 'm': (o.get('models') or [])[:4], 'u': o.get('url') or '', 'pg': o.get('page') or '', 'cs': '', 'a': pa[0], 'w': pa[1][0], 'h': pa[1][1]})
        continue
    r = enc(o)
    if not r: continue
    data, (w, h) = r
    if size + len(data) > PACK_BYTES and packs[-1]:
        packs.append([]); size = 0
    packs[-1].append(data); size += len(data)
    n = len(packs) - 1
    out.append({'i': o['id'], 'k': o['kind'], 's': o['src'], 'p': o['products'], 't': o['title'], 'd': (o.get('desc') or '')[:140], 'c': (o.get('ctx') or '')[:120],
                'sp': o.get('spaces') or [], 'm': (o.get('models') or [])[:4], 'u': o.get('url') or '', 'pg': o.get('page') or '',
                'cs': (o.get('case') or {}).get('cust') or '', 'a': f'img/lib/p{n:02d}.json#{len(packs[-1]) - 1}', 'w': w, 'h': h})
assert len(packs) <= MAX_PACKS, f'묶음 {len(packs)}개 — MAX_PACKS {MAX_PACKS} 넘음(크기 · 품질을 줄일 것)'
for n, pk in enumerate(packs):
    json.dump({'images': pk}, open(os.path.join(OUT, f'p{n:02d}.json'), 'w'), separators=(',', ':'))
json.dump({'generated': IDX.get('generated'), 'n': len(out), 'images': out}, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('images', len(out), '(of which reuse product gallery', reused, ') packs', len(packs), 'MB', round(tot / 1e6, 1), 'index KB', os.path.getsize(os.path.join(OUT, 'index.json')) // 1024)
