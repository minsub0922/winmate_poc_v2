"""원본 레이아웃의 빈 이미지 칸 채우기 — 1단계: 사진 처리 · 묶음 · 칸별 계획.

spec.py 의 NEW(새로 가져온 samsung.com 사진) · WORDMARK(글자 워드마크)를 칸 크기에 맞게 처리해
build/fill/img/<이름>.jpg|png 로 저장하고(확인용 · 출처 기록용), 주제별로 img/fill/<묶음>.json
({"images": [data URL …]}) 에 묶는다 — 아티팩트 한 버전에 올릴 수 있는 파일 수(511)가 정해져 있어
사진 150여 장을 따로 올리지 않는다. 화면은 그 묶음의 사진이 든 장을 처음 그릴 때 한 번만 받는다(src/fillpack.js).
이미 앱에 있는 파일(img/ph/*, img/bs/p-*.png …)은 그 파일 주소를 그대로 쓴다.

칸별 계획(build/fill/plan.json)은 2단계 patch.mjs 가 레이아웃 HTML 에 넣는다.

    python3 build/fill/build.py <작업 폴더(web)> <도입사례 원본 폴더(raw)>
"""
import base64
import colorsys
import hashlib
import io
import json
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(__file__))
import spec  # noqa: E402

WEB = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/fill/web'
RAW = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/work/raw'
OUT = os.path.join(ROOT, 'build/fill/img')
os.makedirs(OUT, exist_ok=True)
MEASURE = json.load(open(os.path.join(ROOT, 'build/fill/measure.json')))
IMDB = json.load(open(os.path.join(ROOT, 'data/images.json')))['pids']
PID_OF_FILE = {v['file']: k for k, v in IMDB.items()}

# 묶음: 이름 → 묶음 (주제별 — 한 장표가 받는 묶음 수를 줄인다)
def pack_of(name, kind):
    if kind in ('cut', 'icon', 'ill') or name.startswith('wm_'): return 'cut'
    if re.match(r'(mi_|vxt_|stp_(dash|energy|auto|multi|3d|kv|safety_diag)$|ai_save_app|dms_diagram|km_console|biot_(dash|floor|lineup|bldg|cloud))', name): return 'ui'
    if re.match(r'(ht_|lynk_|stp_hotel|tex_)', name): return 'hotel'
    if re.match(r'(cafe_|bakery|kiosk_touch|pos2|phone_signage|food_kiosk|menu_|price_tag|fashion_|mall_|mart|gz_|cc_|showcase|coldroom|unitcooler)', name): return 'retail'
    if re.match(r'(hosp_|ward_|patient_|class_|acad_|station_|airport_|smarthome|living_)', name): return 'public'
    if re.match(r'(factory_|wh_|worker_|scan_|sign_|watch_|kid_|golf_|kids_|phone_store|knox_|dex_|fin_|bank|stp_safety_dash|line_dash)', name): return 'mobile'
    return 'office'


def src_path(src):
    t, i = src.split(':', 1)
    return {'w': f'{WEB}/img/{i}', 'x': f'{WEB}/img/{i}', 'k': f'{WEB}/img/{i}', 'i3': f'{WEB}/img3/{i}', 'api': f'{WEB}/api/{i}',
            'raw': f'{RAW}/{i}', 'ph': f'{ROOT}/img/ph/{i}.jpg', 'icon': f'{WEB}/img/wf9f58df', 'f': f'{ROOT}/{i}'}[t]


def crop_frac(im, c):
    x0, y0, x1, y1 = c
    return im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))


def white_to_alpha(im):
    """RGB product cut on white → RGBA: near-white connected to the border becomes transparent"""
    im = im.convert('RGB')
    a = np.asarray(im).astype(np.int16)
    near = (a.min(axis=2) > 238)
    mask = Image.fromarray((near * 255).astype(np.uint8))
    # flood from the four corners / edges
    fill = Image.new('L', im.size, 0)
    m = np.zeros(near.shape, bool)
    from collections import deque
    q = deque()
    H, W = near.shape
    for x in range(W):
        for y in (0, H - 1):
            if near[y, x] and not m[y, x]: m[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if near[y, x] and not m[y, x]: m[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and near[yy, xx] and not m[yy, xx]:
                m[yy, xx] = True; q.append((yy, xx))
    alpha = Image.fromarray(((~m) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    out = im.convert('RGBA'); out.putalpha(alpha)
    return out


def trim(im):
    if im.mode == 'RGBA' and im.getextrema()[3][0] < 250:
        bb = im.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    else:
        rgb = np.asarray(im.convert('RGB')).astype(np.int16)
        bgc = rgb[0, 0]
        diff = np.abs(rgb - bgc).max(axis=2) > 18
        ys, xs = np.where(diff)
        bb = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None
    if not bb: return im
    pad = 4
    return im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad)))


def tint(im, mode):
    """같은 사진의 시간대 보정 (아침 · 노을 · 야간). 야간은 'night:keep:x0,y0,x1,y1'(그 화면은 켜진 채 빛남) ·
    'night:off:x0,y0,x1,y1'(그 화면은 꺼짐) 으로 화면 자리를 줄 수 있다."""
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    H_, W_ = a.shape[:2]
    if mode == 'warm':
        b = (a * np.array([1.06, 1.0, 0.9]) + 0.03) * 1.04
    elif mode == 'sunset':
        b = a * 0.86 * np.array([1.18, 0.95, 0.74]) + np.array([0.06, 0.02, 0.0])
        g = np.linspace(1.0, 0.0, H_)[:, None, None]  # 위쪽(창)에 노을빛
        b = b + g * np.array([0.10, 0.04, -0.02])
    else:  # night
        parts = mode.split(':')
        b = (a ** 1.25) * 0.34 * np.array([0.80, 0.90, 1.18]) + np.array([0.005, 0.01, 0.025])
        if len(parts) == 3:
            x0, y0, x1, y1 = (float(v) for v in parts[2].split(','))
            m = np.zeros((H_, W_), np.float32); m[int(y0 * H_):int(y1 * H_), int(x0 * W_):int(x1 * W_)] = 1
            m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(2, W_ // 300)))).astype(np.float32)[..., None] / 255
            if parts[1] == 'keep':  # the screen stays lit and throws a little light around it
                glow = np.asarray(Image.fromarray((a * m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(W_ // 18))).astype(np.float32) / 255
                b = b * (1 - m) + a * 0.96 * m + glow * 0.55 * (1 - m)
            else:  # the screen is off — the lit (bluish, bright) pixels inside the box, holes closed, go dark
                lit = ((a[..., 2] > a[..., 0] + 0.12) & (a.max(axis=2) > 0.35)).astype(np.uint8) * 255
                k = max(3, (W_ // 120) | 1)
                lit = Image.fromarray(lit).filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MinFilter(k))
                ms = (np.asarray(lit).astype(np.float32) / 255)[..., None] * (m > 0.5)
                ms = np.asarray(Image.fromarray((ms[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32)[..., None] / 255
                b = b * (1 - ms) + ms * (0.035 + 0.05 * a.mean(axis=2, keepdims=True))  # glossy black panel with a faint reflection
    return Image.fromarray((np.clip(b, 0, 1) * 255).astype(np.uint8))


def lift(im):
    """어둡게 깐 배경 사진(아이콘 · 글자를 올리려고 어둡게 한 것)을 밝힌다"""
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    return Image.fromarray((np.clip(a, 0, 1) ** 0.62 * 255).astype(np.uint8))


def dehaze(im):
    """흰 그러데이션을 덮은 키비주얼 — 줄마다 덮인 정도를 어림해 대비를 되살린다"""
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    mn = a.min(axis=2)
    rows = np.array([np.percentile(mn[y], 3) for y in range(a.shape[0])])
    k = max(3, a.shape[0] // 20)
    rows = np.convolve(np.pad(rows, (k, k), mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), mode='same')[k:-k]
    al = np.clip((rows - 25) / 230, 0, 0.8)[:, None, None]
    return Image.fromarray(np.clip((a - 255 * al) / (1 - al), 0, 255).astype(np.uint8))


def enc_jpeg(im, w):
    im = im.convert('RGB')
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=80, optimize=True, progressive=True)
    return buf.getvalue(), 'image/jpeg', im.size


def enc_png(im, w):
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im = im.convert('RGBA')
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    buf = io.BytesIO(); q.save(buf, 'PNG', optimize=True)
    raw = buf.getvalue()
    buf2 = io.BytesIO(); im.save(buf2, 'PNG', optimize=True)
    if len(buf2.getvalue()) < len(raw) * 1.15: raw = buf2.getvalue()  # 양자화가 별 이득 없으면 원본
    return raw, 'image/png', im.size


# ---------- 칸 → 참조 ----------
def parse(v):
    if isinstance(v, tuple):
        ref = v[0]; mode = v[1] if len(v) > 1 else None; pos = v[2] if len(v) > 2 else None
    else:
        ref, mode, pos = v, None, None
    return ref, mode, pos


PH_ALT = {}
for m in re.finditer(r'src=\\"img/ph/([a-z0-9-]+)\.jpg\\" alt=\\"([^\\"]*)', open(os.path.join(ROOT, 'src/photo_layouts.js'), encoding='utf-8').read()):
    PH_ALT.setdefault(m.group(1), m.group(2))
for line in open(os.path.join(ROOT, 'src/photo_sources.md'), encoding='utf-8'):
    m = re.match(r'\| `img/ph/([a-z0-9-]+)\.jpg` \| ([^|]+) \|', line)
    if m: PH_ALT.setdefault(m.group(1), m.group(2).strip())

slots = []  # (f, i, ref, fit, pos) — i: data-img 번호 · 't<n>' 사진 자리 글 상자 · 's:<글자>' 고정 상자
TARGETS = [(f, i, v) for f, a in spec.ASSIGN.items() for i, v in a.items()]
TARGETS += [(f, 't%d' % i, v) for f, a in spec.TB.items() for i, v in a.items()]
TARGETS += [(f, 's:' + l, v) for f, a in spec.FIX.items() for l, v in a.items()]
TARGETS += [(f, 'b%d' % i, v) for f, a in spec.TBX.items() for i, v in a.items()]
TARGETS += [(f, 'd%d' % k, (v, 'k') if isinstance(v, str) else v) for f, a in spec.SIL.items() for k, v in enumerate(a) if v]
for f, i, v in TARGETS:
        ref, mode, pos = parse(v)
        if (f, i) in spec.SKIP: raise SystemExit(f'{f} {i} is in SKIP and ASSIGN')
        if ref.startswith('n:'):
            n = ref[2:]
            kind = 'wm' if n in spec.WORDMARK else spec.NEW[n][4]
        elif ref.startswith('f:'):
            kind = 'cut' if ref.endswith('.png') else 'photo'
        else:
            kind = 'photo'
        fit = 'contain' if mode == 'k' else 'cover' if mode == 'c' else ('contain' if kind in ('cut', 'icon', 'wm', 'ill') else 'cover')
        slots.append(dict(f=f, i=i, ref=ref, kind=kind, fit=fit, pos=pos))

# ---------- 필요한 해상도 (칸에서 보이는 크기의 2배) ----------
need = {}
for s in slots:
    m = MEASURE[s['f']][re.sub(r'^b', 't', str(s['i']))]  # 'b<n>' = the box around text block n
    vw, vh = (m['vw'], m['vh']) if m['vis'] < 0.9 else (m['w'], m['h'])
    s['vw'], s['vh'], s['sprite'] = vw, vh, m['vis'] < 0.9
    s['bg'] = m['bg']; s['slotpos'] = m['pos']
    if s['ref'].startswith('n:'):
        need.setdefault(s['ref'][2:], []).append((vw, vh, s['fit']))

# ---------- 새 사진 처리 ----------
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
done = {}   # name → dict(file, mime, size, pack)
for n, (src, how, page, desc, kind) in spec.NEW.items():
    if n not in need: continue
    if src.startswith('gen:'):
        import illust
        im = getattr(illust, src[4:])()
        im = trim(im)
    elif src.startswith('icon:'):
        im = Image.open(src_path(src)).convert('RGB')
        im = crop_frac(im, tuple(float(x) for x in src[5:].split(',')))
        im = white_to_alpha(trim(im))
    else:
        im = Image.open(src_path(src))
        if isinstance(how, tuple): im = crop_frac(im, how)
        elif how == 'trim': im = trim(im)
        elif how in ('warm', 'sunset') or (isinstance(how, str) and how.startswith('night')): im = tint(im, how)
        elif how == 'gray': im = ImageEnhance.Contrast(im.convert('L').convert('RGB')).enhance(0.92)
        elif isinstance(how, str) and how.startswith('tex:'): im = crop_frac(im, tuple(float(x) for x in how[4:].split(',')))
        adj = spec.ADJ.get(n)
        if adj == 'lift': im = lift(im)
        elif adj == 'dehaze': im = dehaze(im)
        if kind == 'cut':
            if im.mode != 'RGBA' or im.getextrema()[3][0] >= 250: im = white_to_alpha(im)
            im = trim(im)
        elif im.mode in ('RGBA', 'LA', 'P'):
            im = im.convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg.convert('RGB')
    ar = im.width / im.height
    w_need = max((2 * (max(vw, vh * ar) if fit == 'cover' else min(vw, vh * ar)) for vw, vh, fit in need[n]))
    cap = 1280 if kind not in ('cut', 'ill') else 640
    w = int(min(im.width, cap, max(w_need, 360 if kind != 'icon' else 80)))
    data, mime, size = (enc_png if kind in ('cut', 'icon', 'ill') else enc_jpeg)(im, w)
    ext = 'png' if mime == 'image/png' else 'jpg'
    open(os.path.join(OUT, f'{n}.{ext}'), 'wb').write(data)
    done[n] = dict(file=f'build/fill/img/{n}.{ext}', mime=mime, size=size, bytes=len(data), pack=pack_of(n, kind), desc=desc, kind=kind, src=src, page=page, how=how, adj=spec.ADJ.get(n))

# ---------- 워드마크 (글자 렌더링 · 배경 밝기에 따라 두 색) ----------
def wordmark(text, color):
    font = ImageFont.truetype(FONT, 96, index=1)  # KR
    l, t, r, b = font.getbbox(text)
    im = Image.new('RGBA', (r - l + 24, b - t + 24), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((12 - l, 12 - t), text, font=font, fill=color)
    return trim(im)

for s in slots:
    if s['kind'] != 'wm': continue
    n = s['ref'][2:]; dark = s['bg'] < 0.5
    key = n + ('_w' if dark else '')
    s['ref'] = 'n:' + key
    if key in done: continue
    im = wordmark(spec.WORDMARK[n], (255, 255, 255, 255) if dark else (20, 40, 160, 255))
    data, mime, size = enc_png(im, 640)
    open(os.path.join(OUT, f'{key}.png'), 'wb').write(data)
    done[key] = dict(file=f'build/fill/img/{key}.png', mime=mime, size=size, bytes=len(data), pack='cut', desc=spec.WORDMARK[n] + ' 워드마크 (글자)', kind='wm', src='text', page='', how='')

# ---------- 묶음 ----------
packs = {}
for n in sorted(done):
    packs.setdefault(done[n]['pack'], []).append(n)
os.makedirs(os.path.join(ROOT, 'img/fill'), exist_ok=True)
for p in list(os.listdir(os.path.join(ROOT, 'img/fill'))):
    if p.endswith('.json'): os.remove(os.path.join(ROOT, 'img/fill', p))
addr = {}
for p, names in packs.items():
    imgs = []
    for k, n in enumerate(names):
        d = done[n]
        imgs.append(f"data:{d['mime']};base64," + base64.b64encode(open(os.path.join(ROOT, d['file']), 'rb').read()).decode())
        addr[n] = f'img/fill/{p}.json#{k}'
    json.dump({'images': imgs}, open(os.path.join(ROOT, f'img/fill/{p}.json'), 'w'), separators=(',', ':'))
    print(f'img/fill/{p}.json', len(names), 'images', round(os.path.getsize(os.path.join(ROOT, f"img/fill/{p}.json")) / 1e6, 2), 'MB')

# ---------- 칸별 계획 ----------
plan = {}
for s in slots:
    ref = s['ref']
    if ref.startswith('n:'):
        n = ref[2:]; d = done[n]
        item = dict(fill=addr[n], alt=d['desc'] + (' (samsung.com)' if d['kind'] not in ('wm', 'gen', 'ill') else ''), pid='fill.' + n)
    elif ref.startswith('ph:'):
        n = ref[3:]
        item = dict(src=f'img/ph/{n}.jpg', alt=PH_ALT.get(n, n), pid='ph.' + n)
    else:
        p = ref[2:]
        pid = PID_OF_FILE.get(p) or ('cut.' + os.path.basename(p).rsplit('.', 1)[0])
        item = dict(src=p, alt=(IMDB[pid]['desc'] if pid in IMDB else os.path.basename(p)), pid=pid)
    pos = s['pos'] or (s['slotpos'] if s['kind'] == 'wm' and s['slotpos'] else '50% 50%')
    item.update(fit=s['fit'], pos=pos, sprite=s['sprite'], kind=s['kind'])
    plan.setdefault(s['f'], {})[str(s['i'])] = item
json.dump(plan, open(os.path.join(ROOT, 'build/fill/plan.json'), 'w'), ensure_ascii=False, indent=0)
for n in done: done[n]['addr'] = addr[n]
json.dump(done, open(os.path.join(ROOT, 'build/fill/images.json'), 'w'), ensure_ascii=False, indent=1)
json.dump({f: len(a) for f, a in spec.SIL.items()}, open(os.path.join(ROOT, 'build/fill/sil_count.json'), 'w'))
print(len(slots), 'slots ·', len(done), 'new images ·', round(sum(d['bytes'] for d in done.values()) / 1e6, 2), 'MB')

# ---------- 출처 기록 (src/fill_sources.md) ----------
def _load(name):
    p = os.path.join(WEB, name)
    return {x['id']: x for x in json.load(open(p))} if os.path.exists(p) else {}
POOL = {**_load('pool_ok.json'), **_load('pool_x.json'), **_load('pool_cc.json')}
API = json.load(open(os.path.join(WEB, 'api_src.json'))) if os.path.exists(os.path.join(WEB, 'api_src.json')) else {}
CASES = {x['id']: x for x in (json.load(open('/home/claude/work/case_images.json')) if os.path.exists('/home/claude/work/case_images.json') else [])} if True else {}
I3 = {'chiller_roof': ('https://www.samsung.com/latin_en/business/system-air-conditioners/chiller/',
                       'https://images.samsung.com/is/image/samsung/assets/latin_en/p6-b2b/gro2-1/chiller/DA_FT02_Easily_increase_performance_save_space_720x752.png')}
KIND = {'life': '공식 연출', 'case': '도입사례', 'ui': '솔루션 화면', 'cut': '제품 컷', 'icon': '구성도 그림', 'gen': '보정', 'wm': '워드마크(글자)', 'ill': '생성 그림'}
uses = {}
for f, items in plan.items():
    for i, it in items.items():
        k = it['pid'].split('.', 1)[1] if it['pid'].startswith('fill.') else (it.get('src') or '')
        uses.setdefault(k, set()).add(f)


def origin(n, d):
    src = d['src']; t, i = (src.split(':', 1) + [''])[:2]
    if t in ('w', 'x', 'k') and i in POOL:
        pg = POOL[i].get('page', '')
        pg = pg if pg.startswith('http') else ('https://www.samsung.com/' + pg if pg.startswith(('us/', 'sec/', 'global/', 'latin')) else 'https://www.samsung.com/sec/business/' + pg) if pg else 'https://www.samsung.com/sec/business/ (' + d['page'] + ')'
        return pg, POOL[i]['url'].split('?')[0]
    if t == 'api' and i in API: return API[i]['page'], API[i]['url'].split('?')[0]
    if t == 'raw' and i in CASES: return CASES[i]['page'], CASES[i]['url']
    if t == 'icon':
        p = POOL.get('wf9f58df', {})
        return 'https://www.samsung.com/sec/business/' + p.get('page', ''), p.get('url', '').split('?')[0] + ' (구성도에서 기기 그림만 잘라냄)'
    if n in I3: return I3[n]
    if t == 'ph': return 'img/ph/' + i + '.jpg 를 보정 (원본 출처는 src/photo_sources.md)', '—'
    if t == 'f': return i + ' 를 보정', '—'
    if t == 'gen': return 'build/fill/illust.py 로 그림 (samsung.com 에 제품 사진 없음)', '—'
    if t == 'text': return 'Noto Sans CJK KR Bold 글자로 렌더링 (로고 모양 아님)', '—'
    return 'samsung.com (' + d['page'] + ')', '원본 주소 기록 없음'


def how_txt(d):
    h, out = d.get('how'), []
    if isinstance(h, (list, tuple)): out.append('자르기 ' + ', '.join('%g' % v for v in h))
    elif h == 'trim': out.append('여백 자르기')
    elif h == 'gray': out.append('흑백 처리')
    elif h in ('warm', 'sunset'): out.append({'warm': '아침 햇빛 톤', 'sunset': '노을 톤'}[h] + ' 보정')
    elif isinstance(h, str) and h.startswith('night'): out.append('야간 보정' + (' · 화면만 켜 둠' if ':keep:' in h else ' · 화면 끔' if ':off:' in h else ''))
    elif isinstance(h, str) and h.startswith('tex:'): out.append('질감 부분만 자르기')
    if d.get('adj') == 'lift': out.append('어둡게 깐 배경을 밝힘')
    if d.get('adj') == 'dehaze': out.append('흰 그러데이션 걷어 냄')
    if d['kind'] in ('cut', 'icon'): out.append('배경 투명')
    return ' · '.join(out) or '크기만 줄임'


L = ['# 원본 레이아웃 빈 이미지 칸 채운 사진 — 출처', '',
     '원본 카탈로그 레이아웃에서 회색 자리표시 · 제품 모양 그림 · 이름만 적힌 상자 · 검은 사각형으로만 그린 제품 자리를 사진으로 채웠습니다 (build/fill — `python3 build/fill/build.py` → `node build/fill/patch.mjs`).',
     '새로 가져온 사진은 주제별 묶음 `img/fill/<묶음>.json` 에 들어 있고(아티팩트 파일 수 제한 때문에 따로 올리지 않음), 레이아웃에는 `data-fill="img/fill/<묶음>.json#번호"` 로 들어갑니다. 확인용 원본은 `build/fill/img/`.',
     '사진은 samsung.com 에서 가져왔고(국내 비즈니스 · 제품 · 도입사례 페이지가 먼저, 없으면 다른 나라 samsung.com 비즈니스 · 지원 페이지 — Knox Manage 콘솔 화면 1장만 삼성 Knox 공식 사이트 samsungknox.com), 보정한 장면과 직접 그린 설비 그림 2장(터보 냉동기 · 냉각탑 — samsung.com 에 사진 없음)은 ‘구분’ 칸에 적었습니다. 칸마다 원래 마크업은 `build/fill/orig_slots.json` 에 있어 되돌릴 수 있습니다.', '',
     f'채운 칸 {len(slots)}개 · 레이아웃 {len(plan)}개 · 새 사진 {len(done)}장 ({round(sum(d["bytes"] for d in done.values()) / 1e6, 1)} MB).', '',
     '## 새로 가져온 사진', '', '| 묶음 주소 | 이름 · 내용 | 구분 | 처리 | 쓰는 레이아웃 | 출처 페이지 | 원본 이미지 |', '|---|---|---|---|---|---|---|']
for n in sorted(done, key=lambda n: (done[n]['pack'], n)):
    d = done[n]; pg, url = origin(n, d)
    L.append(f"| `{addr[n]}` | {n} · {d['desc']} | {KIND.get(d['kind'], d['kind'])} | {how_txt(d)} | {', '.join(sorted(uses.get(n, [])))} | {pg} | {url} |")
L += ['', '## 앱에 이미 있던 사진 · 제품 컷을 그대로 쓴 칸', '', '| 파일 | 쓰는 레이아웃 |', '|---|---|']
for k in sorted(x for x in uses if '/' in x):
    L.append(f"| `{k}` | {', '.join(sorted(uses[k]))} |")
L += ['', '## 비워 둔 칸 (samsung.com 에 맞는 사진이 없음)', '', '| 레이아웃 | 칸 | 이유 |', '|---|---|---|']
for (f, i), why in spec.SKIP.items():
    L.append(f'| {f} | {i} | {why} |')
open(os.path.join(ROOT, 'src/fill_sources.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('src/fill_sources.md', len(done), 'rows')
