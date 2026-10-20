# Build the app's solution / case media from the reviewed candidates.
#   in : cands2.json (candidates per item) · sheets/index.json (sheet number → candidate id) · review/out/*.json (keep · kind · rep · desc · sol)
#   out: media_names.json (items → file names) · out/*.webp (one file per image; *_t = item thumbnail) · <repo>/src/media_sources.md
#   then link_media.py writes <repo>/data/media.json with each name → its address (asset store url, or a local path for tests)
# Usage: python3 build_media.py <repo root>
import json, os, sys, glob, io, base64, hashlib, collections, datetime
import numpy as np
from PIL import Image
sys.path.insert(0, '/home/claude/media/scripts')
from photocrop import load
M = '/home/claude/media'
ROOT = sys.argv[1]
CAT = json.load(open(f'{ROOT}/data/catalog.json'))
IMG = json.load(open(f'{ROOT}/data/images.json'))['pids']
C = {str(c['id']): c for c in CAT['cases']}; S = {s['id']: s for s in CAT['solutions']}
cands = json.load(open(f'{M}/cands2.json'))
index = json.load(open(f'{M}/sheets/index.json'))
GAL_SIDE, GAL_Q, TH_SIDE, TH_Q = 960, 60, 520, 62
KEEP_KIND = {'scene', 'people', 'exterior', 'product', 'screen', 'diagram', 'kv'}
REP_KIND = {'scene': 3, 'people': 3, 'exterior': 2, 'kv': 3, 'screen': 2, 'product': 1, 'diagram': 0}

# ---- merge review decisions: (item key, candidate id) → decision ----
dec = {}
missing = []
for sh in index:
    name = os.path.basename(sh['sheet'])
    f = glob.glob(f"{M}/review/out/*__{name[:-4]}.json") + glob.glob(f"{M}/review/out/*__{name}.json")
    if not f: missing.append(name); continue
    r = json.load(open(f[0]))
    items = r.get('items', {})
    for im in sh['imgs']:
        d = items.get(str(im['n']))
        if d: dec[(sh['key'], im['id'])] = d
print('sheets without review:', missing)

def dh(im):
    g = np.asarray(im.convert('L').resize((9, 8)), dtype=np.int16)
    return ''.join('1' if x else '0' for x in (g[:, 1:] > g[:, :-1]).flatten())
def ham(a, b): return sum(x != y for x, y in zip(a, b))
# library images already in the app (keep those; drop matched media that repeats them)
LIB = {}
for pid, v in IMG.items():
    if v['src'] in ('ui', 'case') and not v['file'].startswith('img/ph/'):
        try: LIB[pid] = dh(Image.open(f"{ROOT}/{v['file']}").convert('RGB'))
        except Exception: pass

# ---- items ----
items = collections.OrderedDict()
def add(key, x, d, order):
    items.setdefault(key, []).append({**x, 'kind': d.get('kind', 'scene'), 'desc': (d.get('d') or '').strip(), 'rep': int(d.get('rep') or 0), 'ord': order})
for key, L in cands.items():
    for i, x in enumerate(L):
        d = dec.get((key, x['id']))
        if not d or not d.get('k') or d.get('kind') not in KEEP_KIND: continue
        if key == 'pool:industry':
            for sid in d.get('sol') or []:
                if sid in S: add('solution:' + sid, x, d, 1000 + i)
            continue
        targets = [t for t in (d.get('sol') or []) if t in S] if key.startswith('solution:') else []
        if targets:
            for sid in targets: add('solution:' + sid, x, d, 500 + i)
        else:
            add(key, x, d, i)

def page_of(key, x):
    if x.get('page') and x['page'] != 'report': return x['page']
    return ''
def orig_of(x):
    u = x.get('u') or ''
    if u.startswith('pdf:') or u.startswith('pdfpage:'):
        cid = u.split(':')[1].split('/')[0]
        info = json.load(open(f'{M}/fileinfo.json')).get(cid, {})
        return info.get('url') or ''
    return u
def short(u): return '~/' + u[len('https://images.samsung.com/'):] if u.startswith('https://images.samsung.com/') else u

# ---- choose order (representative first) + dedupe ----
final = {}
for key, L in items.items():
    seen, out = [], []
    for x in sorted(L, key=lambda z: z['ord']):
        try: im = load(x['file'])
        except Exception: continue
        h = dh(im)
        if any(ham(h, y) <= 5 for y in seen): continue
        if any(ham(h, y) <= 5 for y in LIB.values()): continue
        seen.append(h); out.append({**x, 'dh': h, 'img': None})
    if not out: continue
    def score(z):
        r = z['rep'] * 10 + REP_KIND.get(z['kind'], 0) * 2 - (4 if z['role'] == 'list' else 0)
        if not z['desc']: r -= 3
        ar = z['w'] / max(1, z['h'])
        if ar > 2.4 or ar < 0.6: r -= 12        # banner strips / tall slices make poor card thumbnails
        return (r, -z['ord'])
    best = max(out, key=score)
    out.remove(best); out.insert(0, best)
    final[key] = out

# ---- encode: one WebP per image (gallery) + one small WebP per item (thumbnail) ----
# Files go to OUT (named by content hash); media.json names them, and publish_media maps each name to its asset in the artifact's asset store.
OUT = f'{M}/out'
os.makedirs(OUT, exist_ok=True)
def webp_file(path, side, q, suffix):
    im = load(path); im.thumbnail((side, side), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6)
    data = b.getvalue(); name = hashlib.sha1(data).hexdigest()[:20] + suffix + '.webp'
    fn = f'{OUT}/{name}'
    if not os.path.exists(fn): open(fn, 'wb').write(data)
    return name, im.size

def thumb_file(path):
    """card thumbnail: crop very wide / tall pictures to 16:10 around their busiest part, then 520px"""
    im = load(path); W, H = im.size; ar = W / H
    if ar > 1.9 or ar < 0.75:
        tw, th_ = (int(H * 1.6), H) if ar > 1.9 else (W, int(W / 1.6))
        g = np.asarray(im.convert('L').resize((max(1, W // 4), max(1, H // 4))), dtype=np.float32)
        e = np.abs(np.diff(g, axis=1))[:-1, :] + np.abs(np.diff(g, axis=0))[:, :-1]
        if ar > 1.9:
            col = e.sum(axis=0); win = max(1, tw // 4); cs = np.convolve(col, np.ones(win), 'valid')
            x0 = int(cs.argmax()) * 4; x0 = max(0, min(W - tw, x0)); box = (x0, 0, x0 + tw, H)
        else:
            row = e.sum(axis=1); win = max(1, th_ // 4); rs = np.convolve(row, np.ones(win), 'valid')
            y0 = int(rs.argmax()) * 4; y0 = max(0, min(H - th_, y0)); box = (0, y0, W, y0 + th_)
        im = im.crop(box)
    im.thumbnail((TH_SIDE, TH_SIDE), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=TH_Q, method=6)
    data = b.getvalue(); name = hashlib.sha1(data).hexdigest()[:20] + '_t.webp'
    fn = f'{OUT}/{name}'
    if not os.path.exists(fn): open(fn, 'wb').write(data)
    return name, im.size

def case_sort(k):
    c = C[k.split(':')[1]]
    return (c.get('ind') or 'ZZ', '' if not c.get('date') else ''.join(chr(255 - ord(ch)) for ch in c['date']))
case_keys = sorted([k for k in final if k.startswith('case:')], key=case_sort)
sol_keys = [k for k in final if k.startswith('solution:')]
media = {'generated': datetime.date.today().isoformat(), 'counts': {}, 'case': {}, 'sol': {}}
ledger = []
memo = {}
used = set()
for keys, bucket in ((sol_keys, 'sol'), (case_keys, 'case')):
    for k in keys:
        L = final[k]
        pages, g = [], []
        for x in L:
            pg = page_of(k, x)
            if pg and pg not in pages: pages.append(pg)
            pi = pages.index(pg) if pg in pages else 0
            mk = hashlib.sha1(open(x['file'], 'rb').read()).hexdigest() + (str(x.get('box')) if x.get('box') else '')
            if mk not in memo: memo[mk] = webp_file(x['file'], GAL_SIDE, GAL_Q, '')
            name, (w, h) = memo[mk]; used.add(name)
            o = orig_of(x)
            g.append([name, x['kind'], x['desc'], w, h, short(o), pi])
            ledger.append((k, x['desc'], x['kind'], o, x['role'], pg))
        th, _ = thumb_file(L[0]['file']); used.add(th)
        media[bucket][k.split(':')[1]] = {'th': th, 'g': g, 'pages': pages}
media['counts'] = {'case': len(media['case']), 'sol': len(media['sol']), 'images': sum(len(v['g']) for b in ('case', 'sol') for v in media[b].values()), 'files': len(used)}
json.dump(media, open(f'{M}/media_names.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(sorted(used), open(f'{M}/media_used.json', 'w'))
json.dump({'items': {k: [{'file': x['file'], 'id': x['id'], 'kind': x['kind'], 'desc': x['desc'], 'rep': x['rep'], 'role': x['role'], 'orig': orig_of(x)} for x in L] for k, L in final.items()}}, open(f'{M}/final.json', 'w'), ensure_ascii=False, indent=0)

# ---- ledger ----
KN = {'scene': '현장', 'people': '사용 장면', 'exterior': '외관', 'product': '제품', 'screen': '화면', 'diagram': '구성도', 'kv': '대표'}
RN = {'list': '목록 썸네일', 'og': '공유 이미지', 'body': '본문', 'crop': '본문(사진 부분만 자름)', 'video': '영상 대표 장면', 'pdf': '리포트 PDF 사진', 'pdfpage': '리포트 PDF 쪽'}
lines = ['# 솔루션 · 유관사례 이미지 출처 대장', '',
         f"`data/media.json` · `img/media/` — {media['counts']['sol']}개 솔루션 · {media['counts']['case']}건 사례, 이미지 {media['counts']['images']}장 ({media['generated']}).",
         '모두 각 항목의 연관 리소스(삼성전자 samsung.com 고객 도입사례 원문 · 원문에 걸린 리포트 PDF · 영상, 솔루션 공식 페이지 · 업종 페이지, vxt.samsung.com · samsungknox.com)에서 받은 삼성전자 공식 이미지입니다.',
         '원문이 사진과 글을 한 이미지에 섞어 둔 곳은 사진 부분만 잘라 썼고(‘본문(사진 부분만 자름)’), 글 · 아이콘 · 배너는 뺐습니다. 갤러리는 긴 변 960px · 썸네일 520px WebP(이미지마다 한 파일, 아티팩트 자산 저장소).', '']
cur = None
for k, desc, kind, o, role, pg in ledger:
    if k != cur:
        cur = k; t, i = k.split(':')
        lines += ['', f"## {('솔루션 · ' + S[i]['name']) if t == 'solution' else ('사례 · ' + C[i]['cust'])}", '']
        lines += [f"원문: {C[i]['url'] or '(리포트 · 영상)'}" if t == 'case' else '', '', '| 설명 | 종류 | 가져온 곳 | 원본 |', '|---|---|---|---|']
    lines.append(f"| {desc} | {KN.get(kind, kind)} | {RN.get(role, role)}{(' · ' + pg) if t == 'solution' and pg else ''} | {o} |")
open(f'{ROOT}/src/media_sources.md', 'w').write('\n'.join(lines) + '\n')
sz = sum(os.path.getsize(f'{OUT}/{n}') for n in used)
print(json.dumps(media['counts']), 'files MB', round(sz / 1e6, 1))
