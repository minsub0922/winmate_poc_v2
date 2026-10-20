# Turn composite case slices into individual photo crops; keep plain photos / cuts as they are.
import json, os, sys, hashlib
sys.path.insert(0, '/home/claude/media/scripts')
from photocrop import load, regions, split, trim_box
import numpy as np
from PIL import Image
M = '/home/claude/media'
cands = json.load(open(f'{M}/cands.json'))
os.makedirs(f'{M}/crops', exist_ok=True)
def dhash(im):
    g = np.asarray(im.convert('L').resize((9, 8)), dtype=np.int16)
    return ''.join('1' if x else '0' for x in (g[:, 1:] > g[:, :-1]).flatten())
def ham(a, b): return sum(x != y for x, y in zip(a, b))
out = {}
stat = {'whole': 0, 'crop': 0, 'nophoto': 0}
for key, L in cands.items():
    res = []
    for x in L:
        try: im = load(x['file'])
        except Exception: continue
        W, H = im.size
        if not key.startswith('case:') or x['role'] in ('list', 'video', 'og'):
            res.append({**x, 'src_id': x['id'], 'box': None, 'dh': dhash(im)}); stat['whole'] += 1; continue
        rs = regions(im)
        big = [r for r in rs if r['frac'] >= 0.8]
        if big or (not rs):
            res.append({**x, 'src_id': x['id'], 'box': None, 'dh': dhash(im), 'nophoto': not rs}); stat['nophoto' if not rs else 'whole'] += 1; continue
        n = 0
        for r in rs:
            if r['tones'] < 90: continue
            for b in split(im, r['box']):
                b = trim_box(im, b)
                if b[2] - b[0] < 160 or b[3] - b[1] < 110: continue
                n += 1
                c = im.crop(b)
                cid = x['id'] + f'_{n}'
                fn = f'{M}/crops/{cid}.jpg'
                if not os.path.exists(fn): c.save(fn, quality=92)
                res.append({**x, 'id': cid, 'src_id': x['id'], 'file': fn, 'w': c.width, 'h': c.height, 'box': b, 'dh': dhash(c), 'fmt': 'JPEG', 'role': 'crop'})
                stat['crop'] += 1
        if not n:
            res.append({**x, 'src_id': x['id'], 'box': None, 'dh': dhash(im), 'nophoto': True}); stat['nophoto'] += 1
    # dedupe (keep the larger)
    ded = []
    for x in res:
        j = next((i for i, y in enumerate(ded) if ham(x['dh'], y['dh']) <= 5), None)
        if j is None: ded.append(x)
        elif x['w'] * x['h'] > ded[j]['w'] * ded[j]['h'] and ded[j]['role'] not in ('list',): ded[j] = x
    out[key] = ded
json.dump(out, open(f'{M}/cands2.json', 'w'), ensure_ascii=False)
print(stat, {t: sum(len(v) for k, v in out.items() if k.startswith(t)) for t in ('case', 'solution', 'pool')})
