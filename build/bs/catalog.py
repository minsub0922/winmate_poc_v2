# 사진 라이브러리 목록 + 미리보기 묶음 — python3 build/bs/catalog.py
# → build/bs/lib/catalog.json · catalog.md · sheets/<묶음>-N.jpg (사진마다 #번호)
import json, os, re, base64, io, glob, collections
from PIL import Image, ImageDraw, ImageFont
OUT = 'build/bs/lib'; os.makedirs(OUT + '/sheets', exist_ok=True); os.makedirs(OUT + '/ais', exist_ok=True)
D = json.load(open('build/bs/data.json'))
ent = []
def add(addr, desc, kind, origin, page, thumb, group, model=''):
    ent.append({'addr': addr, 'desc': desc, 'kind': kind, 'origin': origin, 'page': page or '', 'thumb': thumb, 'group': group, 'model': model})
PRE = {'fb': '외식·카페', 'rt': '리테일', 'ht': '호텔', 'of': '오피스', 'ed': '교육', 'md': '의료·요양', 'mf': '제조·물류', 'pb': '공공·교통', 'fn': '금융', 'sv': '생활편의·무인', 'tp': '테마파크·전시', 'vn': '공연·경기장', 'ad': '옥외광고', 'rs': '주거', 'id': '인테리어·빌트인', 'oe': '전용단말·모바일', 'svc': '서비스'}
def grp_of(name):
    p = name.split('-')[0]
    return PRE.get(p, '기타')
# 1) data/images.json (img/ph · img/bs/p-* · 루트 사진)
I = json.load(open('data/images.json'))['pids']
for pid, v in I.items():
    if 'gen-rival' in pid: continue
    f = v['file']; base = os.path.basename(f)
    if pid.startswith('cut.'): g = '제품 컷'
    elif v.get('src') == 'ui' or base.startswith('ui-'): g = '솔루션 화면'
    elif f.startswith('img/ph/'): g = grp_of(base)
    elif base.startswith('case-mcd') or base.startswith('life-'): g = '외식·카페' if ('mcd' in base or 'coffee' in base or 'bakery' in base or 'km24c' in base) else '기타'
    else: g = '기타'
    add(f, (v.get('desc') or '') + (f" · {v['model']}" if v.get('model') and v.get('model') not in (v.get('desc') or '') else ''), v.get('kind', ''), 'samsung.com', v.get('page', ''), f, g, v.get('model', ''))
# 2) build/fill/images.json (img/fill/{cut,ui,office,hotel,retail,public,mobile}.json#k)
FG = {'cut': '제품 컷', 'ui': '솔루션 화면', 'office': '오피스', 'hotel': '호텔', 'retail': '리테일', 'public': '공공·교통', 'mobile': '전용단말·모바일'}
for k, v in json.load(open('build/fill/images.json')).items():
    if v['kind'] in ('icon',): continue
    org = 'wordmark' if v['kind'] == 'wm' else 'generated' if v['kind'] in ('gen', 'ill') else 'samsung.com'
    add(v['addr'], v['desc'], v['kind'], org, v.get('page', ''), v['file'], FG.get(v['pack'], '기타'))
# 3) r4
for k, v in json.load(open('build/photo/r4_images.json')).items():
    add(v['addr'], v['desc'], v['kind'], 'samsung.com', v.get('page', ''), v['file'], grp_of(k))
# 4) r8 people
for k, v in json.load(open('build/photo/ph_images.json')).items():
    if v.get('addr') and k.startswith('ph.p-'): add(v['addr'], v['desc'], 'people', 'samsung.com', v.get('page', ''), v['file'], '사람')
# 5) ais packs — from src/fill_sources.md rows + pack data
rows = {}
for ln in open('src/fill_sources.md', encoding='utf8'):
    m = re.match(r'\| (img/fill/ais-[ab]\.json#\d+) \| [^|]* \| ([^|]+) \| ([^|]+) \|', ln)
    if m: rows[m.group(1)] = (m.group(2).strip(), m.group(3).strip())
for pk in ('ais-a', 'ais-b'):
    imgs = json.load(open(f'img/fill/{pk}.json'))['images']
    for i, d in enumerate(imgs):
        addr = f'img/fill/{pk}.json#{i}'
        raw = base64.b64decode(d.split(',', 1)[1]); fn = f'{OUT}/ais/{pk}-{i}.' + ('png' if 'png' in d[:30] else 'jpg')
        open(fn, 'wb').write(raw)
        desc, page = rows.get(addr, ('', ''))
        add(addr, desc, 'cut' if '컷' in desc else 'photo', 'samsung.com', page, fn, '호텔(AI 스테이)')
# 5b) r9 packs (samsung.com, 9차) — from src/fill_sources.md
for ln in open('src/fill_sources.md', encoding='utf8'):
    m = re.match(r'\| `(img/fill/r9-[a-z0-9]+\.json#\d+)` \| ([^|]+) \| ([^|]+) \|', ln)
    if m:
        addr = m.group(1); desc = m.group(2).strip(); page = m.group(3).strip()
        nm = desc.split(' · ')[0]; rest = ' · '.join(desc.split(' · ')[1:])
        add(addr, rest or desc, 'photo', 'samsung.com', page, '__pack__', 'r9 · ' + addr.split('/')[-1].split('.')[0])
# 6) covers (stock)
for f in sorted(glob.glob('img/cover/*.jpg')):
    add(f, '업종 표지 사진 · ' + os.path.basename(f)[:-4], 'cover', 'stock(Pexels/Unsplash)', '', f, '표지(stock)')
# 7) img/bs — names from FILLS
names = {}
for sid, arr in D['fills'].items():
    for x in arr:
        for kk, v in (x.get('img') or {}).items():
            if v and v.get('src', '').startswith('img/bs/'): names.setdefault(v['src'], v.get('name', ''))
SOL_OFF = {'bs01-7-0', 'bs01-8-0', 'bs02-11-1', 'bs02-12-5', 'bs02-5-3', 'bs02-7-4', 'bs03-5-0', 'bs05-4-3', 'bs05-5-0', 'bs06-10-0', 'bs06-10-4', 'bs06-6-2', 'bs07-7-2', 'bs07-7-5', 'bs08-6-0', 'bs11-8-1', 'bs11-8-4', 'bs13-6-2', 'bs13-7-3', 'bs15-5-6', 'bs16-4-1', 'bs16-6-0', 'bs16-7-0', 'bs16-7-1', 'bs16-7-2', 'bs16-8-0', 'bs20-9-0', 'bs01-6-2', 'bs13-6-1'}
for f in sorted(glob.glob('img/bs/*')):
    b = os.path.basename(f).rsplit('.', 1)[0]
    if b.startswith('p-'): continue  # 제품 컷은 1)에서
    org = 'samsung.com' if b in SOL_OFF else 'wordmark' if f.endswith('.png') else 'mockup' if False else 'unsplash'
    add(f, names.get(f, ''), 'scene', org, '', f, 'Unsplash·시나리오 사진' if org == 'unsplash' else '솔루션 화면')
# packed images without a local source file → extract from the pack
PK = {}
for e in ent:
    if (e['thumb']=='__pack__' or not os.path.exists(e['thumb'])) and '.json#' in e['addr']:
        pack, k = e['addr'].split('#')
        if pack not in PK: PK[pack] = json.load(open(pack))['images']
        d = PK[pack][int(k)]
        fn = f"{OUT}/ais/" + pack.replace('/', '_') + '-' + k + ('.png' if 'png' in d[:30] else '.jpg')
        open(fn, 'wb').write(base64.b64decode(d.split(',', 1)[1])); e['thumb'] = fn
# dedupe by addr
seen = set(); E = []
for e in ent:
    if e['addr'] in seen: continue
    seen.add(e['addr']); E.append(e)
for i, e in enumerate(E): e['id'] = i + 1
json.dump(E, open(f'{OUT}/catalog.json', 'w'), ensure_ascii=False, indent=0)
# size
for e in E:
    try:
        with Image.open(e['thumb']) as im: e['w'], e['h'] = im.size
    except Exception: e['w'] = e['h'] = 0
json.dump(E, open(f'{OUT}/catalog.json', 'w'), ensure_ascii=False, indent=0)
G = collections.OrderedDict()
for e in E: G.setdefault(e['group'], []).append(e)
md = ['# 사진 라이브러리 (Best Scenario 채우기용)', '', '주소(addr)를 그대로 fills 의 img src 로 씁니다. samsung.com 출처를 먼저 고르고, Unsplash · stock 은 맞는 samsung.com 사진이 없을 때만.', '미리보기: build/bs/lib/sheets/<묶음>-N.jpg (사진 위 #번호 = 아래 id)', '']
font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 14)
fontb = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 16)
TW, TH, COLS, ROWS = 300, 190, 6, 5
gi = 0
for g, arr in G.items():
    gi += 1; slug = f'g{gi:02d}'
    md.append(f'## {g} ({len(arr)}장) — sheets/{slug}-*.jpg'); md.append('')
    md.append('| id | addr | 내용 | 종류 | 크기 | 출처 |'); md.append('|---|---|---|---|---|---|')
    for e in arr: md.append(f"| {e['id']} | `{e['addr']}` | {e['desc']} | {e['kind']} | {e['w']}×{e['h']} | {e['origin']} |")
    md.append('')
    per = COLS * ROWS
    for s in range(0, len(arr), per):
        chunk = arr[s:s + per]; rows = (len(chunk) + COLS - 1) // COLS
        im = Image.new('RGB', (COLS * (TW + 6), rows * (TH + 40)), (236, 238, 242)); d = ImageDraw.Draw(im)
        for i, e in enumerate(chunk):
            x, y = (i % COLS) * (TW + 6), (i // COLS) * (TH + 40)
            try:
                t = Image.open(e['thumb']).convert('RGBA'); t.thumbnail((TW, TH))
                bg = Image.new('RGBA', (TW, TH), (255, 255, 255, 255)); bg.paste(t, ((TW - t.width) // 2, (TH - t.height) // 2), t)
                im.paste(bg.convert('RGB'), (x, y))
            except Exception as ex: d.text((x + 4, y + 4), 'ERR ' + str(ex)[:30], fill=(200, 0, 0), font=font)
            d.rectangle([x, y, x + 52, y + 20], fill=(20, 40, 160)); d.text((x + 4, y + 1), f"#{e['id']}", fill=(255, 255, 255), font=fontb)
            d.text((x + 2, y + TH + 2), e['desc'][:22], fill=(0, 0, 0), font=font)
            d.text((x + 2, y + TH + 19), (e['desc'][22:44] or '') + (' · ' + e['origin'] if e['origin'] != 'samsung.com' else ''), fill=(90, 90, 90), font=font)
        im.save(f'{OUT}/sheets/{slug}-{s // per}.jpg', quality=80)
open(f'{OUT}/catalog.md', 'w').write('\n'.join(md))
print(len(E), 'images', {g: len(a) for g, a in G.items()})
