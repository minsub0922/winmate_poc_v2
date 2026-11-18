"""Which catalog item each photo shows — a vision check for the scene photos whose source names no item (사용자 지시 2026-11-18 (b):
'제품 미확인' 사진을 비전으로 대조해 정확한 제품을 더 등록).

    python scripts/identify_items.py [--limit N] [--jobs 6] [--detect-model M] [--match-model M]
    python scripts/identify_items.py --validate 160 --out /tmp/check.json     # the same check on photos whose items a source names
        → image_items.json (next to this kit, versioned; composer.library merges it — images[src] items · items_how 'vision')

Two looks:
  1. detect (8 photos a call): every product in view — its visual type (composer.item_types.TYPES), whether it is a main subject of
     the photo, a visible brand, how it looks (shape · colour · mounting) and a name or model when one is readable.
  2. match (one call a product in view): the photo beside the reference pictures (the product's own cut — composer.pictures.product_cut)
     of up to 7 catalog products of that type and 2 of each type it is often mistaken for (products whose reference picture is the same
     are one; the nearest by name first) → the references that show the same product, or none, and whether the model is sure.
  3. verify (each sure match): the photo beside the one picked reference, asked of two models (VERIFY_MODELS) with what tells such
     products apart (outlets of a ceiling unit · washer or dryer · a screen's frame) — both must answer 'same'. Measured on 120 photos
     whose source names the item (2026-11-18): the matcher alone was wrong 7 times in 80 picks (a dryer for a washer, a 2Way for a 4Way,
     a Flip for a framed TV …); each verifier let 1–2 of those through, the two together none.
A photo gets items only when every main product in it was matched and verified ('complete') — a product nobody can name keeps the
photo 'unknown', and a space never shows it (composer.pictures.item_reject). Resumable (finished photos are kept); every call is cached
(eval.tpl_judge.gemini). Pictures are decoded with ffmpeg (build machine only); the key is read from the root .env, never printed.
"""
from __future__ import annotations

import argparse
import base64
import json
import random
import re
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from composer import item_types as T  # noqa: E402
from composer import items as I  # noqa: E402
from composer import pictures as PIC  # noqa: E402
from composer.library import load  # noqa: E402
from eval.render import resolve  # noqa: E402
from eval.tpl_judge import USAGE, gemini  # noqa: E402

OUT = HERE / 'image_items.json'
TYPE_CODES = list(T.TYPES)
DETECT_SCHEMA = {'type': 'OBJECT', 'properties': {'photos': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
    'n': {'type': 'INTEGER'},
    'products': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
        'type': {'type': 'STRING', 'enum': TYPE_CODES}, 'main': {'type': 'BOOLEAN'}, 'count': {'type': 'INTEGER'},
        'brand': {'type': 'STRING', 'enum': ['samsung', 'other', 'unknown']}, 'look': {'type': 'STRING'}, 'name': {'type': 'STRING'}},
        'required': ['type', 'main', 'count', 'brand', 'look', 'name']}}},
    'required': ['n', 'products']}}}, 'required': ['photos']}
DETECT_PROMPT = """B2B 제안서 사진 라이브러리의 사진 {n}장입니다(1번부터 순서대로). 사진마다 보이는 전자제품 · 설비를 빠짐없이 적습니다. 보이는 그대로만, 추측하지 않습니다.
- type: 아래 목록의 코드 하나(가장 가까운 것).
{types}
- main: 그 제품이 사진의 주인공이거나 또렷하게 눈에 띄면 true, 멀리 · 작게 · 일부만 보이면 false.
- count: 같은 제품이 보이는 대수.
- brand: 제품에 보이는 로고 — samsung · other(다른 회사) · unknown(안 보임).
- look: 모양 · 색 · 설치 방식(30자 이내, 예: '천장 매립 원형 흰색 패널', '벽면 세로형 검은 화면 3대', '전면 도어 흑색 드럼').
- name: 제품 위 글자 · 모델명이 읽히면 그대로, 아니면 빈 문자열.
사람이 손에 든 폰 · 태블릿도 적되 main 은 false. 제품이 하나도 없으면 products 는 [].
JSON만: {{"photos":[{{"n":1,"products":[{{"type":"...","main":true,"count":1,"brand":"unknown","look":"...","name":""}}]}}]}}"""
MATCH_SCHEMA = {'type': 'OBJECT', 'properties': {'same': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}}, 'sure': {'type': 'BOOLEAN'},
                                                 'why': {'type': 'STRING'}}, 'required': ['same', 'sure', 'why']}
MATCH_PROMPT = """첫 이미지는 현장 사진이고, 그 뒤 이미지 {k}장은 제품 사진(후보 1번부터 순서대로)입니다.
현장 사진 속 「{label}」({look})이 어느 후보와 같은 제품인지 봅니다. 같은 제품 = 모양 · 비율 · 색 · 디자인 · 베젤 · 설치 방식이 모두 같아 보이는 것.
- 판단은 두 이미지의 생김새로만 합니다. 설치 사례 · 장소 · 사진 출처에 대한 지식으로 추측하지 않습니다.
- 크기만 다른 같은 제품처럼 똑같아 보이는 후보가 여럿이면 모두 고릅니다.
- 같은 종류라도 디자인 · 색 · 모양이 다르면 고르지 않습니다(다른 세탁기 · 다른 에어컨은 다른 제품입니다). 종류가 다르면(LED 대형 화면과 LCD 비디오월,
  원형과 사각 천장 에어컨) 당연히 다른 제품입니다.
- 현장 사진의 그 제품이 작거나 가려져 비교할 수 없으면, 또는 어느 후보와도 같다고 말할 수 없으면 same 은 []입니다.
- sure: 고른 후보가 같은 제품이라고 생김새로 확신하면 true.
후보: {cands}
JSON만: {{"same":[1],"sure":true,"why":"현장 제품에서 보이는 생김새 근거 30자 이내"}}"""
# a match call also shows a few products of the types a photo's product is most often mistaken for — the model sees the contrast
NEIGHBORS = {'sign': ['vwall', 'tv'], 'vwall': ['led', 'sign'], 'led': ['vwall', 'outdoor', 'cinema'], 'tv': ['sign', 'monitor'], 'monitor': ['tv'],
             'outdoor': ['led', 'sign'], 'window': ['sign'], 'kiosk': ['sign'], 'board': ['tv', 'sign'], 'epaper': ['sign'], 'cinema': ['led'],
             'c360': ['c4way'], 'c4way': ['c360', 'c1way', 'duct'], 'c1way': ['c4way', 'duct'], 'duct': ['c1way', 'c4way', 'vent'],
             'stand': ['wall_ac', 'purifier'], 'wall_ac': ['stand'], 'outunit': ['chiller', 'cold'], 'chiller': ['outunit'], 'purifier': ['stand'],
             'vent': ['duct'], 'heatpump': ['outunit'], 'cold': ['fridge', 'outunit'], 'washer': ['dryer', 'combo', 'laundry'],
             'dryer': ['washer', 'combo', 'laundry'], 'combo': ['washer', 'dryer'], 'laundry': ['washer', 'dryer'], 'fridge': ['kimchi', 'cold'],
             'kimchi': ['fridge'], 'dishwasher': ['oven'], 'oven': ['dishwasher', 'cooktop'], 'cooktop': ['oven', 'hood'], 'airdresser': ['fridge'],
             'tablet': ['phone', 'laptop'], 'phone': ['tablet'], 'laptop': ['tablet', 'monitor']}
MAX_CANDS = 8
VERIFY_MODELS = ('gemini-3.8-flash', 'gemini-3.1-pro-preview')
VERIFY_SCHEMA = {'type': 'OBJECT', 'properties': {'answer': {'type': 'STRING', 'enum': ['same', 'different', 'cannot_tell']}, 'why': {'type': 'STRING'}},
                 'required': ['answer', 'why']}
VERIFY_PROMPT = """첫 이미지는 현장 사진, 둘째 이미지는 제품 「{name}」의 제품 사진입니다.
현장 사진 속 「{label}」({look})이 바로 이 제품인지 생김새로만 판단합니다(설치 사례 · 장소 · 출처에 대한 지식으로 추측하지 않음).
- same: 모양 · 비율 · 색 · 디자인 · 설치 방식이 모두 같아 보임(크기만 다를 수 있음)
- different: 어느 하나라도 다름(같은 종류의 다른 제품 포함)
- cannot_tell: 현장 제품이 작거나 가려져 비교할 수 없음
{check}
JSON만: {{"answer":"same","why":"30자 이내"}}"""
# what tells products of one kind apart — said to the verifier
CHECK = {
    'laundry': '세탁기와 건조기는 생김새가 거의 같습니다 — 세제 투입구 · 조작부 · 도어 · 아래 필터 덮개까지 같은지 보고, 세탁기인지 건조기인지 가릴 수 없으면 cannot_tell.',
    'ceiling': '천장형 에어컨은 토출구 수(1 · 2 · 4방향 · 원형)와 패널 모양이 같아야 같은 제품입니다. 토출구 수를 셀 수 없으면 cannot_tell.',
    'screen': '화면 제품은 테두리(베젤)의 색 · 두께, 받침대 · 거치 방식, 화면 비율, LED 모듈 이음과 LCD 베젤의 차이를 봅니다. 전자칠판 · 액자형 TV · 사이니지 · 비디오월 · LED 화면은 서로 다른 제품입니다.',
    'fridge': '냉장고는 도어 수 · 배열 · 손잡이 · 색이 같아야 같은 제품입니다.',
}
CHECK_OF = {**{t: 'laundry' for t in ('washer', 'dryer', 'combo', 'laundry')}, **{t: 'ceiling' for t in ('c360', 'c4way', 'c1way', 'duct', 'vent')},
            **{t: 'screen' for t in ('sign', 'vwall', 'led', 'tv', 'board', 'monitor', 'outdoor', 'window', 'kiosk', 'epaper', 'cinema')},
            **{t: 'fridge' for t in ('fridge', 'kimchi', 'cold')}}
_JPEG: dict = {}


def to_jpeg(src: str, cache: Path, width: int) -> bytes:
    """a library picture (packed data URL or file) → JPEG bytes no wider than ``width``."""
    out = cache / f"{base64.urlsafe_b64encode(src.encode()).decode().rstrip('=')[:150]}-{width}.jpg"
    if out.exists() and out.stat().st_size > 500:
        return out.read_bytes()
    u = resolve(src)
    if not u or not u.startswith('data:'):
        return b''
    head, data = u.split(',', 1)
    ext = head[5:].split(';')[0].split('/')[-1].replace('svg+xml', 'svg')
    with tempfile.NamedTemporaryFile(suffix='.' + ext, delete=False) as f:
        f.write(base64.b64decode(data))
        tmp = f.name
    part = out.with_name(out.stem + f'.{abs(hash(tmp))}.part.jpg')
    try:  # (a cut with a transparent background sits on white)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-filter_complex',
                        f"color=white:s=16x16[bg];[bg][0:v]scale2ref[bg2][img];[bg2][img]overlay=format=auto,scale='min({width},iw)':-2",
                        '-frames:v', '1', '-q:v', '4', str(part)], check=True, timeout=60)
        part.replace(out)  # (two calls may convert the same reference at once — the file appears whole)
    except Exception:  # noqa: BLE001
        return b''
    finally:
        Path(tmp).unlink(missing_ok=True)
        part.unlink(missing_ok=True)
    return out.read_bytes() if out.exists() else b''


def reference(pid: str) -> str:
    """the picture the app shows as the product itself (its cut — the same choice as a product frame)."""
    try:
        return PIC.product_cut(pid) or ''
    except Exception:  # noqa: BLE001
        return ''


def catalog_by_type(lib: dict) -> dict:
    """type → [(name, [product ids], reference src)] — products whose reference picture is the same are one candidate."""
    out: dict = {}
    for pid, p in (lib.get('products_all') or {}).items():
        t = T.of_product(p)
        ref = reference(pid) if t else ''
        if not t or not ref:
            continue
        rows = out.setdefault(t, {})
        key = PIC.pic(ref)
        if key in rows:
            rows[key]['pids'].append(pid)
        else:
            rows[key] = {'name': p.get('name') or pid, 'pids': [pid], 'ref': ref, 'cur': bool(p.get('cur')), 'kw': ' '.join(str(x) for x in p.get('kw') or [])}
    return {t: list(rows.values()) for t, rows in out.items()}


def _words(text: str) -> set:
    return set(re.findall(r'[0-9a-z가-힣]{2,}', str(text or '').lower()))


def shortlist(by_type: dict, product: dict, caption: str) -> list:
    """the candidates one match call shows — up to 7 of the product's own type and 2 of each type it is often mistaken for, the nearest
    by name to what the photo says and how the product looks first (curated rows first among equals)."""
    said = _words(' '.join([product.get('name') or '', product.get('look') or '', caption]))
    near = lambda groups: sorted(groups, key=lambda g: (-len(said & _words(g['name'] + ' ' + g['kw'])), not g['cur'], g['name']))
    out = near(by_type.get(product['type']) or [])[:7]
    for t in NEIGHBORS.get(product['type'], []):
        out += near(by_type.get(t) or [])[:2]
    return out[:MAX_CANDS + 3]


def detect(batch: list, model: str, cache: Path) -> dict:
    imgs, keys = [], []
    for k in batch:
        b = to_jpeg(k, cache, 768)
        if b:
            imgs.append(('image/jpeg', b))
            keys.append(k)
    if not imgs:
        return {}
    types = '\n'.join(f'  {code}: {label}' for code, (label, _) in T.TYPES.items())
    try:
        d = gemini(model, DETECT_PROMPT.format(n=len(imgs), types=types), DETECT_SCHEMA, imgs, max_tokens=6000)
    except Exception as e:  # noqa: BLE001
        print('  detect failed:', str(e)[:140], flush=True)
        return {}
    out = {}
    for ph in d.get('photos') or []:
        if isinstance(ph, dict) and isinstance(ph.get('n'), int) and 1 <= ph['n'] <= len(keys):
            out[keys[ph['n'] - 1]] = [x for x in ph.get('products') or [] if isinstance(x, dict) and x.get('type') in T.TYPES]
    return out


def match(src: str, product: dict, by_type: dict, caption: str, model: str, cache: Path) -> dict:
    cands = shortlist(by_type, product, caption)
    photo = to_jpeg(src, cache, 768)
    refs = [(g, to_jpeg(g['ref'], cache, 320)) for g in cands]
    refs = [(g, b) for g, b in refs if b]
    if not photo or not refs:
        return {'cands': [], 'same': [], 'sure': False, 'why': 'no picture'}
    label = T.TYPES[product['type']][0]
    names = ' · '.join(f'{n}. {g["name"][:40]}' for n, (g, _) in enumerate(refs, 1))
    try:
        d = gemini(model, MATCH_PROMPT.format(k=len(refs), label=label, look=product.get('look') or '', cands=names), MATCH_SCHEMA,
                   [('image/jpeg', photo)] + [('image/jpeg', b) for _, b in refs], max_tokens=2000)
    except Exception as e:  # noqa: BLE001
        print('  match failed:', str(e)[:140], flush=True)
        return {'cands': [], 'same': [], 'sure': False, 'why': 'call failed', 'failed': True}
    picked = [refs[i - 1][0] for i in d.get('same') or [] if isinstance(i, int) and 1 <= i <= len(refs)]
    return {'cands': [g['pids'][0] for g, _ in refs], 'same': sorted({p for g in picked for p in g['pids']}), 'sure': bool(d.get('sure')),
            'why': str(d.get('why') or '')[:60]}


def verify(src: str, product: dict, pid: str, ref: str, names: dict, model: str, cache: Path) -> str:
    """'same' · 'different' · 'cannot_tell' — one model's look at the photo beside the one picked product."""
    photo, pic = to_jpeg(src, cache, 768), to_jpeg(ref, cache, 384)
    if not photo or not pic:
        return 'missing'
    try:
        d = gemini(model, VERIFY_PROMPT.format(name=names.get(pid) or pid, label=T.TYPES[product['type']][0], look=product.get('look') or '',
                                               check=CHECK.get(CHECK_OF.get(product['type']), '')), VERIFY_SCHEMA,
                   [('image/jpeg', photo), ('image/jpeg', pic)], max_tokens=3000)
    except Exception as e:  # noqa: BLE001
        print('  verify failed:', model, str(e)[:120], flush=True)
        return 'error'
    return str(d.get('answer') or '')


def to_match(product: dict, by_type: dict) -> str:
    """'' when the product is to be matched, else why not."""
    if product['type'] in ('tablet', 'phone', 'laptop', 'watch') and not product.get('main'):
        return "in somebody's hand"
    if not by_type.get(product['type']):
        return 'no catalog product of this type'
    if product.get('brand') == 'other':
        return 'other brand'
    return ''


def verdict(rows: list) -> dict:
    """items when every main product was matched surely."""
    main = [r for r in rows if r.get('main')]
    ok = lambda r: bool(r['same']) and r['sure'] and r.get('verified') is True
    complete = bool(main) and all(ok(r) for r in main)
    items = sorted({p for r in rows if ok(r) for p in r['same']})
    return {'seen': rows, 'items': items, 'complete': complete and bool(items),
            'failed': any(r.get('failed') or 'error' in (r.get('verify') or {}).values() for r in rows)}


def save(path: Path, state: dict) -> None:
    """written whole — the library build may read the file at any moment"""
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=0), encoding='utf-8')
    tmp.replace(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--detect-model', default='gemini-3.8-flash')
    ap.add_argument('--match-model', default='gemini-3.8-flash')
    ap.add_argument('--jobs', type=int, default=10)
    ap.add_argument('--batch', type=int, default=8)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--validate', type=int, default=0, help='check N photos whose items a source names (their items hidden), write --out')
    ap.add_argument('--out', default='')
    ap.add_argument('--seed', type=int, default=7)
    args = ap.parse_args()
    lib = load()
    IM = lib['images']
    by_type = catalog_by_type(lib)
    print('candidates by type', {t: len(v) for t, v in sorted(by_type.items())}, flush=True)
    out_path = Path(args.out) if args.out else OUT
    state = json.loads(out_path.read_text(encoding='utf-8')) if out_path.exists() else {'images': {}}
    state.update({'detect_model': args.detect_model, 'match_model': args.match_model})
    done = state['images']
    photo = lambda it: it.get('cls') in ('scene', 'kv') and (it.get('vf') or {}).get('kind') == 'photo'
    if args.validate:
        refs = {PIC.pic(g['ref']) for groups in by_type.values() for g in groups}
        PA = lib.get('products_all') or {}
        pool = [k for k, it in IM.items() if photo(it) and it.get('shows') == 'item' and str(it.get('items_how') or '').startswith(('lib_', 'app_'))
                and any(T.of_product(PA.get(p) or {}) for p in it.get('items') or []) and PIC.pic(k) not in refs]
        random.Random(args.seed).shuffle(pool)
        todo = [k for k in pool[:args.validate] if k not in done]
    else:
        todo = [k for k, it in IM.items() if photo(it) and it.get('shows') == 'unknown' and k not in done]
    if args.limit:
        todo = todo[:args.limit]
    cache = Path(tempfile.gettempdir()) / 'wm_identify_jpeg'
    cache.mkdir(exist_ok=True)
    batches = [todo[i:i + args.batch] for i in range(0, len(todo), args.batch)]
    print(len(todo), 'photos ·', len(batches), 'detect calls ·', args.detect_model, '/', args.match_model, flush=True)
    t0 = time.time()

    seen: dict = {}
    with ThreadPoolExecutor(args.jobs) as ex:
        for n, res in enumerate(ex.map(lambda b: detect(b, args.detect_model, cache), batches), 1):
            seen.update(res)
            if n % 20 == 0 or n == len(batches):
                print(f'  detect {n}/{len(batches)} · {len(seen)} photos · {round(time.time() - t0)}s · usage {dict(USAGE)}', flush=True)
    tasks = [(k, i) for k, rows in seen.items() for i, product in enumerate(rows) if not to_match(product, by_type)]
    print(len(tasks), 'match calls', flush=True)

    def one(task):
        k, i = task
        return task, match(k, seen[k][i], by_type, I.caption_of(IM[k]), args.match_model, cache)
    got: dict = {}
    with ThreadPoolExecutor(args.jobs) as ex:
        for n, ((k, i), res) in enumerate(ex.map(one, tasks), 1):
            got[(k, i)] = res
            if n % 100 == 0 or n == len(tasks):
                print(f'  match {n}/{len(tasks)} · {round(time.time() - t0)}s · usage {dict(USAGE)}', flush=True)
    names = {pid: p.get('name') for pid, p in (lib.get('products_all') or {}).items()}
    ref_of = {pid: g['ref'] for groups in by_type.values() for g in groups for pid in g['pids']}
    checks = [(k, i, m) for (k, i), res in got.items() if res['same'] and res['sure'] for m in VERIFY_MODELS]
    print(len(checks), 'verify calls', flush=True)

    def two(job):
        k, i, m = job
        pid = got[(k, i)]['same'][0]
        return job, verify(k, seen[k][i], pid, ref_of.get(pid, ''), names, m, cache)
    with ThreadPoolExecutor(args.jobs) as ex:
        for n, ((k, i, m), answer) in enumerate(ex.map(two, checks), 1):
            got[(k, i)].setdefault('verify', {})[m] = answer
            if n % 200 == 0 or n == len(checks):
                print(f'  verify {n}/{len(checks)} · {round(time.time() - t0)}s · usage {dict(USAGE)}', flush=True)
    for res in got.values():
        if res['same'] and res['sure']:
            res['verified'] = all((res.get('verify') or {}).get(m) == 'same' for m in VERIFY_MODELS)
    for k, rows in seen.items():
        full = [{**product, **(got.get((k, i)) or {'cands': [], 'same': [], 'sure': False, 'why': to_match(product, by_type)})} for i, product in enumerate(rows)]
        v = verdict(full)
        if not v['failed']:
            done[k] = v
    save(out_path, state)
    if args.validate:
        report(state, IM, lib)


def report(state: dict, IM: dict, lib: dict) -> None:
    """precision of the items the check would register, against the items the photos' sources name."""
    table = lib.get('item_keys') or {}
    rows = [(k, v) for k, v in state['images'].items() if k in IM]
    reg = [(k, v) for k, v in rows if v['complete']]
    ok = [(k, v) for k, v in reg if I.same_items(v['items'], IM[k].get('items') or [], table)]
    print(f'validation: {len(rows)} photos · registered {len(reg)} · right {len(ok)} · wrong {len(reg) - len(ok)} · '
          f'precision {len(ok) / max(1, len(reg)):.3f} · coverage {len(reg) / max(1, len(rows)):.3f}')
    for k, v in reg:
        if (k, v) not in ok:
            print('  WRONG', k, IM[k].get('desc', '')[:40], 'source', IM[k].get('items')[:3], '→ vision', v['items'][:4])


if __name__ == '__main__':
    main()
