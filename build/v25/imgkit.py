# 이미지 수집 도구 — 표준 제안서 3종(스토어 · 오피스 · 아파트)
# 사용: python3 -I 로 실행할 필요 없음(직접 만든 스크립트). from imgkit import *
import os, json, re, subprocess, io
from PIL import Image
ROOT = '/home/claude/v3/img'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

def get(url, out=None, timeout=60):
    """curl 로 받기. out 없으면 bytes 반환."""
    cmd = ['curl', '-sL', '--max-time', str(timeout), '-A', UA, url]
    if out:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        subprocess.run(cmd + ['-o', out], check=True)
        return out
    return subprocess.run(cmd, capture_output=True, check=True).stdout

def page_images(url):
    """페이지 HTML 에서 images.samsung.com 이미지 주소를 모두 뽑기(중복 제거, 등장 순서)."""
    h = get(url).decode('utf-8', 'ignore')
    urls = re.findall(r'(?:https?:)?//images\.samsung\.com/[^"\'\s\)<>,]+', h)
    seen, out = set(), []
    for u in urls:
        u = 'https:' + u if u.startswith('//') else u
        u = u.replace('&amp;', '&')
        if u in seen: continue
        seen.add(u)
        if re.search(r'/(gnb|script|common|static/common)/|\.(css|js)(\?|$)|favicon|/icon', u): continue
        out.append(u)
    return out

def load(path):
    return Image.open(path)

def crop_to(im, w, h, anchor=(0.5, 0.5), box=None):
    """box(x0,y0,x1,y1) 안에서 w:h 비율로 최대한 크게 자르기. anchor 는 남는 쪽 기준(0=왼/위, 1=오른/아래)."""
    if box: im = im.crop(box)
    W, H = im.size; r = w / h
    if W / H > r:
        nw = round(H * r); x = round((W - nw) * anchor[0]); return im.crop((x, 0, x + nw, H))
    nh = round(W / r); y = round((H - nh) * anchor[1]); return im.crop((0, y, W, y + nh))

def _man(deck):
    p = f'{ROOT}/{deck}/manifest.json'
    return p, (json.load(open(p)) if os.path.exists(p) else [])

def _put(deck, entry):
    p, m = _man(deck)
    m = [x for x in m if x['key'] != entry['key']] + [entry]
    json.dump(m, open(p, 'w'), ensure_ascii=False, indent=1)

def save_photo(deck, key, im, alt, page, src, note, maxw=1600):
    """사진/화면 저장(JPEG q84, 가로 최대 maxw) + manifest 기록."""
    os.makedirs(f'{ROOT}/{deck}', exist_ok=True)
    im = im.convert('RGB')
    if im.width > maxw: im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    fn = f'{ROOT}/{deck}/{key}.jpg'; im.save(fn, quality=84, optimize=True, progressive=True)
    _put(deck, dict(key=key, status='new', file=fn, w=im.width, h=im.height, alt=alt, page=page, src=src, note=note))
    print(key, im.size, os.path.getsize(fn) // 1024, 'KB')

def trim_alpha(im, pad=0):
    im = im.convert('RGBA'); bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if bb: im = im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad)))
    return im

def white_to_alpha(im, thr=245):
    """흰 배경 제품 이미지 → 투명(가장자리에서 이어진 흰 영역만). 투명 PNG 가 없을 때만."""
    import numpy as np
    from scipy import ndimage
    a = np.asarray(im.convert('RGB')).astype(int)
    white = (a.min(axis=2) >= thr)
    lab, n = ndimage.label(white)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    rgba = np.dstack([a, np.where(bg, 0, 255)]).astype('uint8')
    return Image.fromarray(rgba, 'RGBA')

def save_cut(deck, key, im, alt, page, src, note, maxside=640):
    """제품 컷 저장(투명 PNG, 여백 자르기, 긴 변 최대 maxside) + manifest 기록."""
    os.makedirs(f'{ROOT}/{deck}', exist_ok=True)
    im = trim_alpha(im)
    s = maxside / max(im.size)
    if s < 1: im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    fn = f'{ROOT}/{deck}/{key}.png'; im.save(fn, optimize=True)
    _put(deck, dict(key=key, status='new', file=fn, w=im.width, h=im.height, alt=alt, page=page, src=src, note=note))
    print(key, im.size, os.path.getsize(fn) // 1024, 'KB')

def reuse(deck, key, ref, alt, note=''):
    """앱에 이미 있는 사진 재사용 — ref 는 'img/ph/x.jpg' · 'img/fill/x.json#k' · 'img/bs/p-x.png' · 'img/x.png'."""
    _put(deck, dict(key=key, status='reuse', ref=ref, alt=alt, note=note))
    print(key, 'reuse', ref)

def missing(deck, key, why):
    _put(deck, dict(key=key, status='missing', note=why))
    print(key, 'missing', why)

def contact(deck, out=None, keys=None):
    """확인용 밀착 인화지(키 이름 포함) — Read 로 보기."""
    from PIL import ImageDraw
    p, m = _man(deck)
    items = [x for x in m if x['status'] == 'new' and (not keys or x['key'] in keys)]
    tw, th = 300, 200; cols = 4; rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (tw + 8), rows * (th + 26)), (235, 235, 235))
    d = ImageDraw.Draw(sheet)
    for i, x in enumerate(items):
        im = Image.open(x['file']).convert('RGBA'); im.thumbnail((tw, th))
        bg = Image.new('RGBA', (tw, th), (210, 214, 220, 255)); bg.paste(im, ((tw - im.width) // 2, (th - im.height) // 2), im)
        X, Y = (i % cols) * (tw + 8), (i // cols) * (th + 26)
        sheet.paste(bg.convert('RGB'), (X, Y)); d.text((X + 4, Y + th + 6), x['key'], fill=(0, 0, 0))
    out = out or f'{ROOT}/{deck}/_contact.png'; sheet.save(out); return out
