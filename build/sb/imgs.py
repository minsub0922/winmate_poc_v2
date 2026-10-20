# list candidate photos: python3 build/sb/imgs.py <bsNN> [pattern…] — pack r9-<id> + img/ph matching patterns; marks used-in-deck and size
import json, re, sys, os, base64, io, glob
from PIL import Image
sid = sys.argv[1]; pats = sys.argv[2:]
s = open('src/scenario_fills.js').read()
F = json.loads(re.search(r'export const FILLS = (\{.*\});', s).group(1))
used = set(v['src'] for x in F.get(sid, []) for v in (x.get('img') or {}).values())
names = {}
for line in open('src/fill_sources.md'):
    m = re.match(r'\| `([^`]+)` \| ([^|]+)\|', line)
    if m: names[m.group(1)] = m.group(2).strip()
for line in open('src/photo_sources.md'):
    m = re.match(r'\| `?([^`|]+?)`? \| ([^|]+)\|', line)
    if m and m.group(1).startswith('img/'): names.setdefault(m.group(1).strip(), m.group(2).strip())
def size_of(src):
    if '#' in src:
        f, k = src.split('#'); d = json.load(open(f))['images'][int(k)]
        b = base64.b64decode(d.split(',', 1)[1]); im = Image.open(io.BytesIO(b)); return im.size
    im = Image.open(src); return im.size
cands = []
pack = f'img/fill/r9-{sid}.json'
if os.path.exists(pack):
    n = len(json.load(open(pack))['images']); cands += [f'{pack}#{i}' for i in range(n)]
for p in pats:
    if p.endswith('.json'):
        n = len(json.load(open(p))['images']); cands += [f'{p}#{i}' for i in range(n)]
    else: cands += sorted(glob.glob(p))
for c in cands:
    try: w, h = size_of(c)
    except Exception as e: w = h = 0
    print(('U ' if c in used else '  ') + f'{c:34s} {w}x{h}  {names.get(c, "")[:90]}')
