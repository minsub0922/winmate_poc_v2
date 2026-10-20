"""4차 — 업종별 레이아웃 묶음 사진: samsung.com 도입사례 사진을 잘라 · 줄여 업종 둘씩 묶음(img/fill/r4-<업종>.json)으로.

    python3 build/photo/r4_photos.py [도입사례 원본 폴더(raw)] [도입사례 목록(case_images.json)]

읽음: build/photo/r4_spec.py (이름 → 사진 id · 자르기 · 설명)
씀:   build/photo/r4img/<이름>.jpg (확인 · 출처 기록용) · img/fill/r4-<업종>.json ({"images": [data URL …]})
      build/photo/r4_images.json (이름 → 묶음 주소 · 설명 · 도입사례 페이지 · 원본 주소)
레이아웃은 'r4.<이름>' 으로 쓴다(gen_base.img_info) — 화면은 그 묶음을 처음 그릴 때 한 번만 받는다(src/fillpack.js).
아티팩트 한 버전에 올릴 수 있는 파일 수(511)가 정해져 있어 사진을 따로 올리지 않고 묶는다.
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from r4_spec import R4, PAIR  # noqa: E402

RAW = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/raw'
CASES = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/work/case_images.json'
OUT = os.path.join(HERE, 'r4img')
os.makedirs(OUT, exist_ok=True)
META = {c['id']: c for c in json.load(open(CASES))}
W = 880  # 가장 큰 칸(약 600px × 1.5배 화면)을 덮는 너비


def segments(frac, thr, minlen):
    segs, s = [], None
    for i, v in enumerate(frac):
        if v >= thr and s is None: s = i
        if v < thr and s is not None:
            if i - s >= minlen: segs.append((s, i))
            s = None
    if s is not None and len(frac) - s >= minlen: segs.append((s, len(frac)))
    return segs


def flat(q, axis):
    """per row (axis=1) / column (axis=0): share of the most common colour — card background, gaps and caption bands are flat"""
    q = q if axis == 1 else q.transpose(1, 0)
    out = np.empty(q.shape[0])
    for i, line in enumerate(q):
        out[i] = np.bincount(line, minlength=4096).max() / line.size
    return out


def run(nonflat, gap=3, minlen=60):
    """longest stretch of non-flat lines (flat breaks shorter than gap are bridged)"""
    segs = segments(nonflat.astype(float), 0.5, 1)
    merged = []
    for s0, s1 in segs:
        if merged and s0 - merged[-1][1] < gap: merged[-1] = (merged[-1][0], s1)
        else: merged.append((s0, s1))
    merged = [m for m in merged if m[1] - m[0] >= minlen]
    return max(merged, key=lambda x: x[1] - x[0]) if merged else (0, len(nonflat))


def autotrim(im):
    """card-style case image (title bar · photo · caption on a plain background, white frame) → the photo part:
    the longest stretch of rows, then columns, that are not one flat colour"""
    a = np.asarray(im).astype(int) // 16
    q = a[:, :, 0] * 256 + a[:, :, 1] * 16 + a[:, :, 2]
    r = run(flat(q, 1) < 0.8)
    c = run(flat(q[r[0]:r[1]], 0) < 0.8)
    # a caption line left right under / over the photo: a light band (dark text on white) at the edge
    lum = np.asarray(im.convert('L')).astype(int)[r[0]:r[1], c[0]:c[1]]
    lf = (lum > 215).mean(axis=1)
    light = lf > 0.7
    top, bot = r[0], r[1]
    k = 0
    while k < len(light) and light[len(light) - 1 - k]: k += 1
    if 6 <= k <= 100 and (lf[len(lf) - k:] > 0.98).sum() >= 3: bot -= k
    k = 0
    while k < len(light) and light[k]: k += 1
    if 6 <= k <= 100 and (lf[:k] > 0.98).sum() >= 3: top += k
    return (c[0] + 2, top + 2, c[1] - 2, bot - 2)


packs, out = {}, {}
for name, (cid, crop, desc) in R4.items():
    im = Image.open(os.path.join(RAW, cid)).convert('RGB')
    if isinstance(crop, str) or (isinstance(crop, tuple) and crop and crop[0] == 'auto'):  # 'auto' or ('auto', (x0, y0, x1, y1)) = trim, then cut a part
        im = im.crop(autotrim(im))
        if isinstance(crop, tuple): crop = crop[1]
        else: crop = None
    if crop:
        x0, y0, x1, y1 = crop
        im = im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
    if im.width > W: im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=74, optimize=True, progressive=True); data = buf.getvalue()
    open(os.path.join(OUT, name + '.jpg'), 'wb').write(data)
    pack = 'r4-' + PAIR[name.split('-')[0].upper()]
    lst = packs.setdefault(pack, [])
    m = META[cid]
    out[name] = dict(file=f'build/photo/r4img/{name}.jpg', addr=f'img/fill/{pack}.json#{len(lst)}', pack=pack, desc=desc,
                     kind='case', size=[im.width, im.height], bytes=len(data), cid=cid, cust=m.get('cust'), page=m.get('page'),
                     orig=m['url'].split('?')[0], crop=R4[name][1])
    lst.append('data:image/jpeg;base64,' + base64.b64encode(data).decode())
for p, lst in packs.items():
    json.dump({'images': lst}, open(os.path.join(ROOT, 'img/fill', p + '.json'), 'w'), separators=(',', ':'))
json.dump(out, open(os.path.join(HERE, 'r4_images.json'), 'w'), ensure_ascii=False, indent=1)
print(len(out), 'photos ·', ' '.join(f'{p} {len(l)}장 {sum(len(x) for x in l) // 1024}KB' for p, l in sorted(packs.items())))
