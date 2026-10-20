# Best Scenario 9차 — 채운 결과(build/bs/out/<id>.json)를 앱 소스에 합치기
# python3 build/bs/merge.py            → src/scenarios.js (장 레이아웃 f) · src/scenario_fills.js (FILLS) · img/fill/r9-<id>.json (시나리오별 새 사진 묶음) · src/fill_sources.md (출처)
# 원래 값은 build/bs/data.json (작업 시작 때 덤프)에 남아 있다.
import json, re, os, glob, base64, io
from PIL import Image
D = json.load(open('build/bs/data.json'))
OUT = {os.path.basename(p)[:-5]: json.load(open(p)) for p in sorted(glob.glob('build/bs/out/bs*.json'))}

# ---- FILLS
fs_src = open('src/scenario_fills.js', encoding='utf8').read()
m = re.search(r'^export const FILLS = (.*);$', fs_src, re.M)
FILLS = json.loads(m.group(1))
changed = {}
for sid, o in OUT.items():
    for k, v in o.items():
        k = int(k)
        e = {'t': v.get('t', {}), 'img': v.get('img', {})}
        if v.get('r'): e['r'] = v['r']
        e['f'] = v['f']
        FILLS[sid][k] = e
        changed.setdefault(sid, {})[k] = v['f']

# ---- 제품 이름은 카탈로그 그대로 — 전자칠판은 Flip Pro WM75B (예전 값의 WA75D 를 모두 바꿈, 제품 컷 파일 이름은 그대로)
def fixname(o, key=None):
    if isinstance(o, dict): return {k: fixname(v, k) for k, v in o.items()}
    if isinstance(o, list): return [fixname(v) for v in o]
    if isinstance(o, str) and key != 'src': return o.replace('WA75D', 'WM75B')
    return o
FILLS = fixname(FILLS)

# ---- new samsung.com photos → a pack per scenario (img/fill/r9-<id>.json; first scenario that uses a photo holds it)
first = {}
def walk(o, sid):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == 'src' and isinstance(v, str) and v.startswith('img/bsn/'): first.setdefault(v, sid)
            else: walk(v, sid)
    elif isinstance(o, list):
        for v in o: walk(v, sid)
for sid in FILLS: walk(FILLS[sid], sid)
addr = {}; packs = {}; meta = []
for a, sid in first.items():
    name = os.path.basename(a)[:-4]
    j = json.load(open(f'build/bs/newimg/{name}.json'))
    im = Image.open(f'build/bs/newimg/{name}.jpg').convert('RGB')
    if im.width > 1280: im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=80, optimize=True, progressive=True)
    pk = f'img/fill/r9-{sid}.json'; lst = packs.setdefault(pk, [])
    lst.append('data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode())
    addr[a] = f'{pk}#{len(lst) - 1}'; meta.append((addr[a], name, j))
def rewrite(o):
    if isinstance(o, dict): return {k: (addr.get(v, v) if k == 'src' and isinstance(v, str) else rewrite(v)) for k, v in o.items()}
    if isinstance(o, list): return [rewrite(v) for v in o]
    return o
FILLS = rewrite(FILLS)
for old in glob.glob('img/fill/r9-*.json'): os.remove(old)
for pk, lst in packs.items(): json.dump({'images': lst}, open(pk, 'w'))
images = [x for l in packs.values() for x in l]
fs_src = fs_src[:m.start(1)] + json.dumps(FILLS, ensure_ascii=False) + fs_src[m.end(1):]
if '9차' not in fs_src:
    fs_src = fs_src.replace('\nexport const FILL_CUSTOMER', '\n// 9차(2026-10-17): 사진 중심 레이아웃으로 바꾼 장은 그 레이아웃의 칸에 맞춰 다시 채움 — 사진은 samsung.com 우선, 새로 가져온 사진은 시나리오별 묶음 img/fill/r9-<id>.json(출처: src/fill_sources.md 9차 표). 작업 도구 · 브리프: build/bs/\nexport const FILL_CUSTOMER', 1)
open('src/scenario_fills.js', 'w', encoding='utf8').write(fs_src)

# ---- scenarios.js — 장마다 레이아웃 f
sc = open('src/scenarios.js', encoding='utf8').read()
for sid, ks in changed.items():
    a = sc.index(f"id: '{sid}'")
    b = sc.find("\n  {\n    id: 'bs", a + 10); e = sc.find('\n];', a); b = e if b < 0 or (e >= 0 and e < b) else b
    block = sc[a:b]
    fl = block.index('flow: [')
    hits = list(re.finditer(r"\['(L_[A-Za-z0-9_]+)', '", block[fl:]))
    orig = [x['f'] for x in next(s for s in D['scenarios'] if s['id'] == sid)['slides']]
    assert [h.group(1) for h in hits] == orig, (sid, [h.group(1) for h in hits], orig)
    nb = block[:fl]; pos = fl
    for k, h in enumerate(hits):
        s0, s1 = fl + h.start(1), fl + h.end(1)
        nb += block[pos:s0] + (ks.get(k) or h.group(1)); pos = s1
    nb += block[pos:]
    sc = sc[:a] + nb + sc[b:]
# featured representative sheets follow their slides
REPS_NEW = {}
mm = re.search(r'const REPS = \{(.*?)\n\};', sc, re.S)
if mm:
    body = mm.group(1)
    for sid, ks in changed.items():
        orig = [x['f'] for x in next(s for s in D['scenarios'] if s['id'] == sid)['slides']]
        for k, nf in ks.items(): body = body.replace(f"'{orig[k]}'", f"'{nf}'") if f'{sid}:' in body else body
    sc = sc[:mm.start(1)] + body + sc[mm.end(1):]
open('src/scenarios.js', 'w', encoding='utf8').write(sc)

# ---- sources
fsrc = open('src/fill_sources.md', encoding='utf8').read()
sec = '\n\n## 9차 · Best Scenario 사진 중심 전환 — 새로 가져온 사진 (`img/fill/r9-<시나리오>.json`)\n\n장을 사진 중심 레이아웃으로 바꾸며 라이브러리에 맞는 사진이 없던 칸에 samsung.com 비즈니스 · 도입사례 페이지에서 가져온 사진입니다(자르기 · 크기 조정만).\n\n| 묶음 주소 | 이름 · 내용 | 출처 페이지 | 원본 이미지 |\n|---|---|---|---|\n' + '\n'.join(f"| `{a}` | {n} · {j['desc']} | {j['page']} | {j['orig']} |" for a, n, j in meta) + '\n'
fsrc = re.sub(r'\n\n## 9차 · Best Scenario 사진 중심 전환[\s\S]*?(?=\n\n## |\Z)', '', fsrc)
if meta: fsrc = fsrc.rstrip('\n') + sec
open('src/fill_sources.md', 'w', encoding='utf8').write(fsrc)
print('packs', {k: len(v) for k, v in packs.items()}); print('scenarios', {k: len(v) for k, v in changed.items()}, 'slides', sum(len(v) for v in changed.values()), '· new photos', len(images), f'({sum(len(x) for x in images) // 1024} KB)')
