# 덱 안 같은 사진(다르게 자른 사본 · 흑백 · 밝기 보정 포함) 찾기 — python3 build/hist/dupcheck.py <id> [...]
# SIFT 특징점 + RANSAC 호모그래피 인라이어 수로 판정 (제품 컷 · contain 은 제외)
import sys, json, base64, os, io, functools
import numpy as np, cv2
from PIL import Image
@functools.lru_cache(maxsize=None)
def pack(p): return json.load(open(p))['images']
def load(src):
    if '.json#' in src:
        p, k = src.split('#'); d = pack(p)[int(k)]
        b = base64.b64decode(d.split(',', 1)[1])
    elif src.startswith('img/hist/'):
        b = open('build/hist/newimg/' + os.path.basename(src), 'rb').read()
    else:
        if not os.path.exists(src): return None
        b = open(src, 'rb').read()
    im = Image.open(io.BytesIO(b)).convert('L'); im.thumbnail((640, 640))
    return np.array(im)
sift = cv2.SIFT_create(nfeatures=1500)
bf = cv2.BFMatcher()
CUT = ('/p-', 'cut.json', '-front.png', '-persp.png', 'prod/', 'wordmark')
def run(id):
    o = json.load(open(f'build/hist/out/{id}.json'))
    items = []
    slides = [('deck', x) for x in o.get('deck', [])] + [(f'{pi + 1}.{j + 1}', x) for pi, s in enumerate(o['parts']) for j, x in enumerate(s['layouts'])]
    for k, (w, x) in enumerate(slides):
        for i, v in (x.get('img') or {}).items():
            src = (v or {}).get('src', '')
            if not src or v.get('fit') == 'contain' or any(c in src for c in CUT): continue
            items.append((f'kk{k:02d}[{w}]:img{i}', src))
    feats = {}
    for _, src in items:
        if src in feats: continue
        a = load(src)
        feats[src] = sift.detectAndCompute(a, None) if a is not None else (None, None)
    out = []
    for a in range(len(items)):
        for b in range(a + 1, len(items)):
            sa, sb = items[a][1], items[b][1]
            if sa == sb: out.append((999, items[a][0], items[b][0], sa, sb)); continue
            (ka, da), (kb, db) = feats[sa], feats[sb]
            if da is None or db is None or len(ka) < 10 or len(kb) < 10: continue
            m = bf.knnMatch(da, db, k=2)
            good = [p[0] for p in m if len(p) == 2 and p[0].distance < 0.7 * p[1].distance]
            if len(good) < 15: continue
            A = np.float32([ka[g.queryIdx].pt for g in good]); B = np.float32([kb[g.trainIdx].pt for g in good])
            H, mask = cv2.findHomography(A, B, cv2.RANSAC, 5.0)
            inl = int(mask.sum()) if mask is not None else 0
            if inl >= 25: out.append((inl, items[a][0], items[b][0], sa, sb))
    out.sort(key=lambda x: -x[0])
    print(f'# {id} — 사진 {len(items)}칸 · 같은 사진 의심 {len(out)}쌍')
    for inl, wa, wb, sa, sb in out: print(f'  {"✗" if inl >= 80 else "?"} {wa} {sa}  ≈  {wb} {sb}  (일치점 {inl if inl < 999 else "같은 파일"}{"" if inl >= 80 else " — 눈으로 확인: 같은 화면 · 같은 장소의 다른 컷일 수 있음"})')
    return out
for id in sys.argv[1:]: run(id)
