"""구독 장표 사진 만들기 — proddb/subs/assets.json 의 자르기 · 라벨 지우기 규칙으로 공식 이미지에서 사진만 떼어 app 소유 static 에 쓴다.
  python3 proddb/build/subs/assets.py <raw dir: collect.py 결과> [<out manifest: proddb/subs/assets.out.json>]
제품 컷(model)은 models.json 의 검색 API 이미지(투명 PNG)를 받아 여백을 다듬는다. 모든 결과는 webp(제품 컷은 알파 유지).
같은 원본(해시) · 같은 규칙이면 다시 쓰지 않는다 — 원본이 바뀐 항목만 새로 만들고 changed 로 보고한다."""
import hashlib, io, json, os, sys, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
RAW = sys.argv[1]
OUTMAN = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'proddb/subs/assets.out.json')
SPEC = json.load(open(os.path.join(ROOT, 'proddb/subs/assets.json')))
FACTS = json.load(open(os.path.join(ROOT, 'proddb/subs/facts.json')))
IMAGES = json.load(open(os.path.join(RAW, 'images.json')))
MODELS = json.load(open(os.path.join(RAW, 'models.json')))
OUT = os.path.join(ROOT, SPEC['out'])
os.makedirs(OUT, exist_ok=True)
prev = json.load(open(OUTMAN)) if os.path.exists(OUTMAN) else {'items': {}}
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130'


def erase(img, boxes):
    """사진 위 글자 라벨(pill)을 지운다.
    [x0, y0, x1, y1] → OpenCV inpaint(Telea, 단색 벽 · 하늘처럼 고른 바탕)
    {"box": [...], "copy": [dx, dy]} → 옆 · 아래 같은 결의 조각을 옮겨 덮고 가장자리를 섞는다(창틀 · 커튼처럼 결이 있는 바탕)."""
    if not boxes: return img
    import cv2
    a = np.asarray(img.convert('RGB'))[:, :, ::-1].copy()
    mask = np.zeros(a.shape[:2], np.uint8)
    for b in boxes:
        if isinstance(b, dict):
            x0, y0, x1, y1 = b['box']; dx, dy = b['copy']
            patch = a[y0 + dy:y1 + dy, x0 + dx:x1 + dx].astype(np.float32)
            h, w = patch.shape[:2]; feather = 10
            wy = np.minimum(np.arange(h), np.arange(h)[::-1]); wx = np.minimum(np.arange(w), np.arange(w)[::-1])
            alpha = np.clip(np.minimum.outer(wy, wx) / feather, 0, 1)[..., None]
            core = np.zeros((h, w, 1), np.float32); core[feather:-feather or None, feather:-feather or None] = 1
            alpha = np.maximum(alpha, core)
            a[y0:y1, x0:x1] = (patch * alpha + a[y0:y1, x0:x1].astype(np.float32) * (1 - alpha)).astype(np.uint8)
        else:
            x0, y0, x1, y1 = b; mask[y0:y1, x0:x1] = 255
    if mask.any(): a = cv2.inpaint(a, mask, 9, cv2.INPAINT_TELEA)
    return Image.fromarray(a[:, :, ::-1])


def trim_alpha(img, pad=12):
    a = np.asarray(img.convert('RGBA'))[:, :, 3]
    ys, xs = np.where(a > 8)
    if not len(xs): return img
    x0, y0, x1, y1 = max(0, xs.min() - pad), max(0, ys.min() - pad), min(img.width, xs.max() + 1 + pad), min(img.height, ys.max() + 1 + pad)
    return img.crop((x0, y0, x1, y1))


items, changed = {}, []
for it in SPEC['items']:
    dst = os.path.join(OUT, it['id'] + '.webp')
    if it.get('model'):
        m = MODELS.get(it['model']) or {}
        url = (m.get('image') or '').split('?')[0]  # 검색 API 주소의 크기 프리셋($PF_PRD_PNG$ = 360px)을 떼면 원본(투명 PNG)
        if not url: items[it['id']] = {'error': 'models.json 에 이미지 없음'}; continue
        raw = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=40).read()
        src_hash = hashlib.sha256(raw).hexdigest()
        rule = {'model': it['model']}
        if prev['items'].get(it['id'], {}).get('src_sha256') == src_hash and os.path.exists(dst):
            items[it['id']] = prev['items'][it['id']]; continue
        img = Image.open(io.BytesIO(raw)).convert('RGBA')
        img = trim_alpha(img)
        if max(img.size) > 900: img.thumbnail((900, 900))
        img.save(dst, 'WEBP', quality=88, method=6)
        src = url
    else:
        url = FACTS['images'][it['img']]
        meta = IMAGES.get(url) or {}
        if meta.get('status') != 200: items[it['id']] = {'error': 'collect.py 가 원본을 받지 못함'}; continue
        src_hash = meta['sha256']
        rule = {'crop': it['crop'], 'erase': it['erase']}
        if prev['items'].get(it['id'], {}).get('src_sha256') == src_hash and prev['items'][it['id']].get('rule') == rule and os.path.exists(dst):
            items[it['id']] = prev['items'][it['id']]; continue
        img = Image.open(os.path.join(RAW, meta['file'])).convert('RGB').crop(tuple(it['crop']))
        img = erase(img, it['erase'])
        img.save(dst, 'WEBP', quality=84, method=6)
        src = url
    b = open(dst, 'rb').read()
    w, h = Image.open(dst).size
    items[it['id']] = {'file': '/assets/subs/' + it['id'] + '.webp', 'src': src, 'src_sha256': src_hash, 'rule': rule, 'w': w, 'h': h, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'alt': it['alt']}
    if prev['items'].get(it['id'], {}).get('sha256') != items[it['id']]['sha256']: changed.append(it['id'])
json.dump({'about': '구독 장표 사진 결과(assets.py) — 원본 해시 · 규칙 · 결과 해시', 'items': items}, open(OUTMAN, 'w'), ensure_ascii=False, indent=1)
print(json.dumps({'items': len(items), 'changed': changed, 'errors': [k for k, v in items.items() if v.get('error')]}, ensure_ascii=False))
