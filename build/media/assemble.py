# Candidate images per case / solution → cands.json, then contact sheets (one item per sheet, ≤20 images) for visual review.
import json, os, hashlib, collections, re
from PIL import Image, ImageDraw, ImageFont
M = '/home/claude/media'
meta = json.load(open(f'{M}/dl_meta.json'))
H = json.load(open(f'{M}/hashes.json'))
CAT = json.load(open('/home/claude/wm/data/catalog.json'))
cp = json.load(open(f'{M}/case_pages.json'))
cl = {x['id']: x for x in json.load(open(f'{M}/case_list.json'))}
posters = json.load(open(f'{M}/posters.json'))
sp = json.load(open(f'{M}/sol_pages.json'))
def k(u): return hashlib.sha1(u.encode()).hexdigest()[:16]
def full(u): return 'https:' + u if u.startswith('//') else u
def ham(a, b): return sum(x != y for x, y in zip(a, b))
def path_of(c): return c['file']
def dl(u, **kw):
    kk = k(u); m = meta.get(kk)
    if not m or not m.get('ok'): return None
    return {'id': kk, 'file': f'{M}/dl/{kk}', 'u': u, 'w': m['w'], 'h': m['h'], 'fmt': m['fmt'], **kw}
def loc(path, src, **kw):
    im = Image.open(path)
    rid = 'f' + hashlib.sha1(path.encode()).hexdigest()[:15]
    return {'id': rid, 'file': path, 'u': src, 'w': im.width, 'h': im.height, 'fmt': im.format, **kw}
def hashof(c):
    if c['id'] in H: return H[c['id']]
    rel = os.path.relpath(c['file'], f'{M}/pdfimg') if '/pdfimg/' in c['file'] else None
    return H.get('pdf:' + rel) if rel else None
# generic images: same URL in ≥3 different cases (not product cards)
uc = collections.Counter()
for cid, v in cp.items():
    for u in {x['u'] for x in v.get('imgs', [])}: uc[u] += 1
GENERIC = {u for u, n in uc.items() if n >= 3 and 'PRD_CARD' not in u}
cands = {}
for c in CAT['cases']:
    cid = str(c['id']); L = []
    li = cl.get(cid)
    if li and li.get('thumb'): x = dl(full(li['thumb']), alt=li.get('alt', ''), role='list', page=c['url'] or '')
    else: x = None
    if x: L.append(x)
    v = cp.get(cid, {})
    if v.get('og'):
        x = dl(v['og'], alt='', role='og', page=c['url']); x and L.append(x)
    for it in v.get('imgs', []):
        if it['u'] in GENERIC or it['u'].lower().endswith('.svg'): continue
        x = dl(it['u'], alt=it.get('alt', ''), role='body', page=c['url'])
        if x: L.append(x)
    pv = posters.get(cid)
    if pv and pv.get('posters'):
        x = dl(pv['posters'][0], alt='영상 대표 장면', role='video', page=pv['url']); x and L.append(x)
    pd = f'{M}/pdfimg/{cid}'
    if os.path.isdir(pd):
        for f in sorted(os.listdir(pd)):
            p = f'{pd}/{f}'; im = Image.open(p)
            if im.mode == 'L' or (im.width, im.height) == (500, 157) or min(im.size) < 250: continue
            L.append(loc(p, f'pdf:{cid}/{f}', alt='', role='pdf', page='report'))
    pg = f'{M}/pdfpage/{cid}'
    if os.path.isdir(pg):
        for f in sorted(os.listdir(pg)): L.append(loc(f'{pg}/{f}', f'pdfpage:{cid}/{f}', alt='', role='pdfpage', page='report'))
    # filter tiny, dedupe near-identical (keep larger)
    out = []
    for x in L:
        if min(x['w'], x['h']) < 160: continue
        hx = hashof(x); x['hash'] = hx
        dup = None
        for y in out:
            if hx and y.get('hash') and ham(hx['dh'], y['hash']['dh']) <= 4: dup = y; break
        if dup:
            if x['w'] * x['h'] > dup['w'] * dup['h'] and dup['role'] != 'list': out[out.index(dup)] = {**x, 'role': dup['role'] if dup['role'] == 'list' else x['role']}
            continue
        out.append(x)
    cands['case:' + cid] = out
# solutions: own pages
for s in CAT['solutions']:
    L = []
    for key, v in sp.items():
        sid, tag = key.split('|')
        if sid != s['id']: continue
        for it in v.get('items', []):
            if it['u'].lower().split('?')[0].endswith('.svg'): continue
            x = dl(it['u'], alt=it.get('alt', ''), role=tag, page=v['url'], ctx=it.get('c', ''))
            if x: L.append(x)
        if v.get('og'):
            x = dl(v['og'], alt='', role=tag + '-og', page=v['url']); x and L.append(x)
    out = []
    for x in L:
        if min(x['w'], x['h']) < 160: continue
        hx = hashof(x); x['hash'] = hx
        if any(hx and y.get('hash') and ham(hx['dh'], y['hash']['dh']) <= 4 for y in out): continue
        out.append(x)
    cands['solution:' + s['id']] = out
# industry pages (to assign to solutions)
pool = []
for key, v in sp.items():
    if not key.startswith('x|') and key != 'lynk|hospitality': continue
    for it in v.get('items', []):
        if it['u'].lower().split('?')[0].endswith('.svg'): continue
        x = dl(it['u'], alt=it.get('alt', ''), role=key, page=v['url'], ctx=it.get('c', ''))
        if x and min(x['w'], x['h']) >= 200:
            hx = hashof(x); x['hash'] = hx
            if any(hx and y.get('hash') and ham(hx['dh'], y['hash']['dh']) <= 4 for y in pool): continue
            pool.append(x)
cands['pool:industry'] = pool
json.dump(cands, open(f'{M}/cands.json', 'w'), ensure_ascii=False)
n = collections.Counter(k.split(':')[0] for k in cands)
print({t: sum(len(v) for kk, v in cands.items() if kk.startswith(t)) for t in n}, 'empty cases', [kk for kk, v in cands.items() if not v])
