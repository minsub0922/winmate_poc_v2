# Download every candidate image once (keyed by URL hash) and record size/format.
import json, hashlib, os, sys, concurrent.futures as cf, urllib.request, io
from PIL import Image
D = '/home/claude/media/dl'; os.makedirs(D, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'Referer': 'https://www.samsung.com/'}
urls = json.load(open(sys.argv[1]))
meta_p = '/home/claude/media/dl_meta.json'
meta = json.load(open(meta_p)) if os.path.exists(meta_p) else {}
def key(u): return hashlib.sha1(u.encode()).hexdigest()[:16]
def one(u):
    k = key(u)
    if k in meta and meta[k].get('ok'): return k, meta[k]
    fn = f'{D}/{k}'
    try:
        req = urllib.request.Request(u.replace(' ', '%20') if '%' not in u else u, headers=UA)
        try:
            data = urllib.request.urlopen(req, timeout=60).read()
        except Exception:
            req = urllib.request.Request(urllib.request.quote(u, safe=':/?$&=%#'), headers=UA)
            data = urllib.request.urlopen(req, timeout=60).read()
        open(fn, 'wb').write(data)
        im = Image.open(io.BytesIO(data))
        n = getattr(im, 'n_frames', 1)
        return k, {'u': u, 'ok': True, 'w': im.width, 'h': im.height, 'fmt': im.format, 'frames': n, 'bytes': len(data), 'mode': im.mode}
    except Exception as e:
        return k, {'u': u, 'ok': False, 'err': str(e)[:160]}
with cf.ThreadPoolExecutor(12) as ex:
    for k, m in ex.map(one, urls): meta[k] = m
json.dump(meta, open(meta_p, 'w'), indent=0)
ok = [m for m in meta.values() if m.get('ok')]
print('total', len(meta), 'ok', len(ok), 'fail', len(meta) - len(ok))
