"""제품 사진 → 앱 사진 묶음.
  img/prod/tNN.json  썸네일(탐색기 · 태그 카드) — 상품당 1장, 240×150 안에 맞춘 WebP
  img/prod/gNN.json  갤러리(hover 상세 · 슬라이드에 넣기) — 상품당 최대 3~4장, 560×400 안에 맞춘 WebP
묶음 형식은 배경 사진 묶음(bgpack.js)과 같다: { images: [dataURL, …] }, 주소 "img/prod/t00.json#k".

사진 출처
  · 사이트 카드: samsung.com/business 상품 카드 이미지(download_images.sh → img_raw/<goodsId>_<k>.png)
  · 카탈로그 전용 제품: 그 제품이 실린 e-카탈로그 쪽에서 잘라 낸 제품 사진(ecat/photos.json · ecat/photos/*.jpg,
    cut_ecat_photos.py 가 다시 만들 수 있음)
  · 큐레이션 40개 중 사이트 카드와 합치지 않은 것: ecat/photos.json 의 curated 표(앱 사진 · 사이트 카드 사진 · 카탈로그에서 자른 사진)
data/products_db.json 의 제품 · 큐레이션 항목에 th · gal · galAlt · galSrc · galKind · thK(·img)를 적는다.
  thK: 없음 = 투명 배경 제품 컷(사이트), 'w' = 흰/단색 바탕 제품 컷(카탈로그), 's' = 장면 · 화면(꽉 채워 보여 줌)"""
import json, os, io, base64, sys, re
from PIL import Image, ImageChops
HERE = os.path.dirname(os.path.abspath(__file__))
APP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..')
RAW = os.path.join(HERE, '..', 'img_raw')  # download_images.sh 가 받는 곳(용량이 커서 폴더에는 두지 않음)
ECAT = os.path.join(HERE, '..', 'ecat')
PRODS = json.load(open(os.path.join(HERE, '..', 'raw', 'wkb_products.json')))['products']
PH = json.load(open(os.path.join(ECAT, 'photos.json')))
import sqlite3
DOCS = {r[0]: r[1] for r in sqlite3.connect(os.path.join(HERE, '..', 'winmate_products.sqlite')).execute('SELECT dir, title FROM catalog_doc')}
DB = os.path.join(APP, 'data/products_db.json')
db = json.load(open(DB))
OUT = os.path.join(APP, 'img/prod')
SITE_MAP = os.path.join(HERE, '..', 'site_photos.json')  # 사이트 카드 사진 묶음 주소(이미 게시한 t00~ · g00~ 를 그대로 두려고)
SM = json.load(open(SITE_MAP)) if os.path.exists(SITE_MAP) and '--resite' not in sys.argv else None
if SM and not all(os.path.exists(f'{OUT}/{k}{i:02d}.json') for k in 'tg' for i in range(SM['files'][k])):
    SM = None
for f in os.listdir(OUT):
    m = re.match(r'^([tg])(\d+)\.json$', f)
    if m and not (SM and int(m.group(2)) < SM['files'][m.group(1)]): os.remove(os.path.join(OUT, f))
TPER, GPER = 160, 220   # 사이트 카드 사진 묶음(t00~ · g00~) — 2026-10-18 배치 그대로(주소가 바뀌지 않게)
TPER2, GPER2 = 500, 600  # 그 뒤에 붙는 카탈로그 · 큐레이션 사진 묶음(아티팩트 파일 수 한도 511 때문에 크게 묶음 — t04 · g08 한 파일씩)


def trim(im):
    im = im.convert('RGBA')
    a = im.split()[-1]
    box = a.getbbox()
    if box and box != (0, 0) + im.size and (box[2] - box[0]) * (box[3] - box[1]) > 0:
        im = im.crop(box)
    else:  # 알파가 없으면 흰 여백
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 12 else 0)
        b2 = diff.getbbox()
        if b2: im = im.crop(b2)
    return im


def webp(im, W, H, q, do_trim=True):
    im = trim(im) if do_trim else im.convert('RGB')
    im.thumbnail((W, H), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=q, method=4)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


from concurrent.futures import ProcessPoolExecutor


def enc_site(gid):
    out = []
    for k in range(3):
        f = f'{RAW}/{gid}_{k}.png'
        if not (os.path.exists(f) and os.path.getsize(f) > 500): continue
        try:
            im = Image.open(f); im.load()
        except Exception:
            continue
        out.append((k, webp(im, 240, 150, 72) if not out else None, webp(im, 560, 400, 74)))
    return gid, out


def enc_crop(args):
    """(owner, [(file, kind), …]) → owner, [(thumb|None, gallery), …]"""
    owner, pics = args
    out = []
    for f, kind in pics:
        p = os.path.join(ECAT, 'photos', f)
        if not os.path.exists(p): continue
        im = Image.open(p); im.load()
        scene = kind in ('scene', 'diagram')
        out.append((webp(im, 240, 150, 74, not scene) if not out else None, webp(im, 560, 400, 76, not scene)))
    return owner, out


thumbs, gals = [], []      # 1단계: 사이트 카드(파일 t00.. · g00..)
thumbs2, gals2 = [], []    # 2단계: 카탈로그 · 큐레이션(사이트 묶음 다음 번호부터)
STAGE = [1]


def addr(kind, idx):
    if STAGE[0] == 1:
        per = TPER if kind == 't' else GPER
        return f'img/prod/{kind}{idx // per:02d}.json#{idx % per}'
    base = SITE_FILES[kind] if SM else (-(-len(thumbs) // TPER) if kind == 't' else -(-len(gals) // GPER))  # 사이트 묶음 파일 수
    per = TPER2 if kind == 't' else GPER2
    return f'img/prod/{kind}{base + idx // per:02d}.json#{idx % per}'


def add(th_g):
    """[(thumb|None, gallery)] → (th addr, [gal addrs])"""
    T, G = (thumbs, gals) if STAGE[0] == 1 else (thumbs2, gals2)
    th = None; gal = []
    for t, g in th_g:
        if t is not None and th is None:
            T.append(t); th = addr('t', len(T) - 1)
        G.append(g); gal.append(addr('g', len(G) - 1))
    return th, gal


def ecat_label(pic):
    pg = pic.get('page', '')
    if pic.get('source_url'):
        return pic.get('source_label') or '삼성전자 공식 카탈로그'
    m = re.match(r'^(\w+)_(\d+)$', pg)
    if not m: return 'e-카탈로그'
    return f'e-카탈로그 「{DOCS.get(m.group(1), m.group(1))}」 {int(m.group(2))}쪽'


# ── 1) 사이트 카드(제품 행 + 사이트 카드와 합친 큐레이션) ──
rows = [('p', p) for p in db['products'] if p.get('gid')] + [('c', (k, x)) for k, x in db['curated'].items() if x.get('gid')]
gids = list(dict.fromkeys((item['gid'] if kind == 'p' else item[1]['gid']) for kind, item in rows))
seen_g = {}  # goodsId → (th, gal, alts) — 같은 카드를 쓰는 큐레이션 항목은 같은 사진
if SM:  # 이미 만든 사이트 사진 묶음을 그대로(주소 · 파일 안 바뀜)
    for g in gids:
        x = SM['gids'].get(g, {})
        seen_g[g] = (x.get('th'), x.get('gal', []), x.get('galAlt', []))
    SITE_FILES = SM['files']
    ENC = {}
else:
    with ProcessPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
        ENC = dict(ex.map(enc_site, gids, chunksize=8))
for kind, item in rows:
    gid = item['gid'] if kind == 'p' else item[1]['gid']
    if gid in seen_g: continue
    alts = [im.get('alt') for im in (PRODS.get(gid, {}).get('images') or [])[:3]]
    enc = ENC.get(gid, [])
    th, gal = add([(t, g) for _, t, g in enc])
    galt = [((alts[k] if k < len(alts) else '') or '') for k, _, _ in enc]
    seen_g[gid] = (th, gal, galt)
for kind, item in rows:
    gid = item['gid'] if kind == 'p' else item[1]['gid']
    th, gal, galt = seen_g.get(gid, (None, [], []))
    tgt = item if kind == 'p' else item[1]
    if th: tgt['th'] = th
    if gal: tgt['gal'] = gal; tgt['galAlt'] = galt

# ── 2) 카탈로그 전용 제품 + 큐레이션의 카탈로그 · 공식 자료 사진(사이트 묶음 뒤 새 파일에) ──
STAGE[0] = 2
ITEMS = PH['items']
CUR = PH.get('curated', {})
jobs = []
for p in db['products']:
    if p['src'] == 'catalog' and ITEMS.get(p['id'], {}).get('pics'):
        jobs.append((p['id'], [(x['file'], x['kind']) for x in ITEMS[p['id']]['pics']]))
for cid, spec in CUR.items():
    own = spec.get('photos')
    if own and ITEMS.get(own, {}).get('pics'):
        jobs.append((own, [(x['file'], x['kind']) for x in ITEMS[own]['pics']]))
jobs = list({o: (o, ps) for o, ps in jobs}.values())
with ProcessPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
    CENC = dict(ex.map(enc_crop, jobs))


def crop_fields(owner, name):
    pics = ITEMS[owner]['pics']
    th, gal = add(CENC.get(owner, []))
    kinds = [x['kind'] for x in pics][:len(gal)]
    f = {'gal': gal, 'galAlt': [(name + (' · ' + x['note'] if x.get('note') and x['note'] != '작음' else '')) for x in pics][:len(gal)],
         'galSrc': [ecat_label(x) for x in pics][:len(gal)], 'galKind': kinds}
    if th: f['th'] = th
    f['thK'] = 's' if kinds and kinds[0] in ('scene', 'diagram') else 'w'
    return f


site_by_gid = {p['gid']: p for p in db['products'] if p.get('gid')}


def site_fields(gids, note):
    """사이트 카드 사진(이미 묶음에 든 주소)을 다른 항목에 — 같은 모델 · 같은 시리즈 또는 대표 사진(note 에 무엇인지 적음)"""
    th = None; gal = []; galt = []; gsrc = []
    for g in gids:
        s = site_by_gid.get(g)
        if not s or not s.get('gal'): continue
        th = th or s.get('th')
        for k, a in enumerate(s['gal'][:3]):
            gal.append(a); galt.append((s.get('galAlt') or [''] * 9)[k] or s['name'])
            gsrc.append('samsung.com/business · ' + s['name'] + (' — ' + note if note else ''))
    f = {}
    if th: f['th'] = th
    if gal: f.update({'gal': gal[:6], 'galAlt': galt[:6], 'galSrc': gsrc[:6], 'galKind': ['cut'] * len(gal[:6])})
    return f


for p in db['products']:
    if p['src'] != 'catalog': continue
    it = ITEMS.get(p['id'], {})
    if p['id'] in CENC:
        p.update(crop_fields(p['id'], p['name']))
    elif it.get('gids'):
        p.update(site_fields(it['gids'], it.get('note', '')))
    if it.get('note') and (p.get('th')): p['phNote'] = it['note']

# ── 3) 큐레이션(사이트 카드와 합치지 않은 것) ──
CAT = json.load(open(os.path.join(APP, 'data/catalog.json')))
cur_name = {c['id']: c['name'] for c in CAT['products']}
for cid, spec in CUR.items():
    x = db['curated'].setdefault(cid, {})
    if x.get('gid'): continue  # 이미 사이트 카드와 합친 항목
    name = cur_name.get(cid, cid)
    if spec.get('img'): x['img'] = spec['img']
    th = None; gal = []; galt = []; gsrc = []; gk = []
    if spec.get('photos') and spec['photos'] in CENC:
        f = crop_fields(spec['photos'], name)
        th = f.get('th'); gal += f['gal']; galt += f['galAlt']; gsrc += f['galSrc']; gk += f['galKind']
        x['thK'] = f['thK']
    if spec.get('gids'):
        f = site_fields(spec['gids'], spec.get('note', ''))
        th = th or f.get('th'); gal += f.get('gal', []); galt += f.get('galAlt', []); gsrc += f.get('galSrc', []); gk += f.get('galKind', [])
    if th: x['th'] = th
    if gal: x['gal'] = gal[:6]; x['galAlt'] = galt[:6]; x['galSrc'] = gsrc[:6]; x['galKind'] = gk[:6]
    if spec.get('note'): x['phNote'] = spec['note']

def write(kind, L1, per1, L2, per2):
    n = SM['files'][kind] if SM else 0
    for i in range(0, 0 if SM else len(L1), per1):
        json.dump({'images': L1[i:i + per1]}, open(f'{OUT}/{kind}{n:02d}.json', 'w'), separators=(',', ':')); n += 1
    for i in range(0, len(L2), per2):
        json.dump({'images': L2[i:i + per2]}, open(f'{OUT}/{kind}{n:02d}.json', 'w'), separators=(',', ':')); n += 1
write('t', thumbs, TPER, thumbs2, TPER2)
write('g', gals, GPER, gals2, GPER2)
if not SM:  # 다음 실행부터 사이트 사진 주소를 고정
    json.dump({'about': '사이트 카드 사진 묶음 주소. pack_images.py 가 이 표가 있으면 사이트 사진을 다시 만들지 않고 이 주소를 씀(--resite 로 다시 만들기)',
               'files': {'t': -(-len(thumbs) // TPER), 'g': -(-len(gals) // GPER)},
               'gids': {g: {'th': v[0], 'gal': v[1], 'galAlt': v[2]} for g, v in seen_g.items() if v[0]}}, open(SITE_MAP, 'w'), ensure_ascii=False, separators=(',', ':'))
nsite = sum(1 for v in seen_g.values() if v[0])
thumbs = thumbs + thumbs2; gals = gals + gals2
json.dump(db, open(DB, 'w'), ensure_ascii=False, separators=(',', ':'))
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f[0] in 'tg')
nop = [p['id'] for p in db['products'] if not p.get('th')]
nocur = [c['id'] for c in CAT['products'] if not (db['curated'].get(c['id'], {}).get('th') or db['curated'].get(c['id'], {}).get('img') or c.get('img'))]
print('thumbs', len(thumbs), 'gallery', len(gals), 'files', len([f for f in os.listdir(OUT) if f[0] in 'tg']), 'MB', round(tot / 1e6, 1),
      '| no-photo products', len(nop), nop[:12], '| curated without photo', nocur)
