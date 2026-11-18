"""Look at every scene photo of the picture library once and write down what is *actually* in it (build-time, vision model).

    python scripts/tag_images.py [--model gemini-3.1-flash-lite] [--limit N] [--jobs 4]      → image_facts.json (next to this kit, versioned)

Why: the picture stage judges a photo by its caption. Captions were written for other purposes (a case study, a slide of
another deck) — they do not say that a competitor's sign is in the frame, that the "매장" is a traditional market, or that
the photo is a blurry thumbnail. This pass records, per photo: what it shows (one line), the kind of place, a visible
brand / sign, the product families in view, and whether it is a usable photo. ``composer.library`` merges the file into
the library (``images[src]['vf']``) and ``composer.pictures`` filters and ranks with it.

Pictures are packed AVIF; they are decoded with ffmpeg (build machine only — the server never needs to decode a picture).
The key is read from the root .env (GEMINI_API_KEY) and never printed. Resumable: finished pictures are kept.
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from composer.library import load  # noqa: E402
from eval.render import resolve  # noqa: E402
from eval.tpl_judge import USAGE, gemini  # noqa: E402

OUT = HERE / 'image_facts.json'
PLACES = ['카페·베이커리', '패스트푸드·퀵서비스', '레스토랑·식당', '대형마트·슈퍼', '백화점·쇼핑몰', '브랜드 매장·쇼룸', '편의점·소형 매장', '전통시장', '호텔 로비·프런트', '호텔 객실',
          '연회장·행사장', '사무실', '회의실', '건물 로비·라운지', '교실·강의실', '병원·의료', '공장·물류', '은행·금융', '공공기관·교통', '경기장·공연장·영화관', '전시·박물관·테마파크',
          '주거(거실·주방·침실)', '건물 외관·옥외', '기계실·옥상·설비', '서비스·점검 작업', '제품·화면만', '기타']
SCHEMA = {'type': 'OBJECT', 'properties': {'items': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
    'n': {'type': 'INTEGER'}, 'shows': {'type': 'STRING'}, 'place': {'type': 'STRING', 'enum': PLACES}, 'brand': {'type': 'STRING'},
    'brand_prominent': {'type': 'BOOLEAN'}, 'products': {'type': 'ARRAY', 'items': {'type': 'STRING', 'enum': ['display', 'hvac', 'appliance', 'mobile', 'none']}},
    'kind': {'type': 'STRING', 'enum': ['photo', 'illustration', 'screen', 'diagram', 'product_cut']}, 'quality': {'type': 'STRING', 'enum': ['good', 'ok', 'low']}},
    'required': ['n', 'shows', 'place', 'brand', 'brand_prominent', 'products', 'kind', 'quality']}}}, 'required': ['items']}
PROMPT = """B2B 제안서에 쓸 사진 라이브러리를 정리합니다. 이미지 {n}장이 순서대로 주어집니다(1번부터). 사진마다 보이는 그대로 적습니다 — 추측하지 않습니다.
- shows: 무엇이 보이는지 한국어 한 줄(40자 이내, 장소 · 주요 대상 · 설치된 제품).
- place: 사진 속 장소의 종류(목록에서 하나). 장소가 아닌 제품 컷 · 화면 캡처면 '제품·화면만'.
- brand: 사진에 또렷이 읽히는 다른 회사의 간판 · 로고 · 상호 글자(삼성 로고는 제외, 없으면 빈 문자열).
- brand_prominent: 그 간판 · 로고가 사진의 주인공이거나 한눈에 띄면 true.
- products: 사진에 보이는 제품군 — display(사이니지 · 메뉴보드 · TV · 키오스크 · LED 화면), hvac(천장 에어컨 · 실외기 · 환기), appliance(냉장고 · 세탁기 등 가전), mobile(폰 · 태블릿 · 노트북 · 워치). 없으면 ["none"].
- kind: photo(실제 사진) · illustration(그림 · 합성 · 렌더) · screen(화면 캡처) · diagram(도식) · product_cut(배경 없는 제품 사진).
- quality: good · ok · low(흐림 · 너무 작음 · 워터마크 · 글자 범벅).
JSON만: {{"items":[{{"n":1,"shows":"…","place":"…","brand":"","brand_prominent":false,"products":["none"],"kind":"photo","quality":"good"}}]}}"""


def to_jpeg(src: str, cache: Path) -> bytes:
    """a library picture (packed data URL or file, usually AVIF) → small JPEG bytes."""
    out = cache / (base64.urlsafe_b64encode(src.encode()).decode().rstrip('=')[:180] + '.jpg')
    if out.exists() and out.stat().st_size > 500:
        return out.read_bytes()
    u = resolve(src)
    if not u.startswith('data:'):
        return b''
    head, data = u.split(',', 1)
    ext = head[5:].split(';')[0].split('/')[-1]
    with tempfile.NamedTemporaryFile(suffix='.' + ext, delete=False) as f:
        f.write(base64.b64decode(data))
        tmp = f.name
    try:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-vf', "scale='min(640,iw)':-2", '-q:v', '5', str(out)], check=True, timeout=60)
    except Exception:  # noqa: BLE001
        return b''
    finally:
        Path(tmp).unlink(missing_ok=True)
    return out.read_bytes() if out.exists() else b''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='gemini-3.1-flash-lite')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--batch', type=int, default=8)
    ap.add_argument('--only', default='', help='comma separated caption prefixes (probe)')
    args = ap.parse_args()
    IM = load()['images']
    facts = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'model': args.model, 'images': {}}
    done = facts['images']
    todo = [k for k, v in IM.items() if v.get('cls') in ('scene', 'kv') and not k.startswith('img/cover/') and k not in done]
    if args.only:
        pre = args.only.split(',')
        todo = [k for k in IM if any((IM[k].get('desc') or '').startswith(p) for p in pre)]
    if args.limit:
        todo = todo[:args.limit]
    cache = Path(tempfile.gettempdir()) / 'wm_composer_jpeg'
    cache.mkdir(exist_ok=True)
    batches = [todo[i:i + args.batch] for i in range(0, len(todo), args.batch)]
    print(len(todo), 'pictures ·', len(batches), 'calls ·', args.model, flush=True)

    def one(batch):
        imgs, keys = [], []
        for k in batch:
            b = to_jpeg(k, cache)
            if b:
                imgs.append(('image/jpeg', b))
                keys.append(k)
        if not imgs:
            return {}
        try:
            d = gemini(args.model, PROMPT.format(n=len(imgs)), SCHEMA, imgs, max_tokens=4000)
        except Exception as e:  # noqa: BLE001
            print('  batch failed:', str(e)[:120], flush=True)
            return {}
        out = {}
        for it in d.get('items') or []:
            if isinstance(it, dict) and isinstance(it.get('n'), int) and 1 <= it['n'] <= len(keys):
                out[keys[it['n'] - 1]] = {k: it.get(k) for k in ('shows', 'place', 'brand', 'brand_prominent', 'products', 'kind', 'quality')}
        return out
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        for n, res in enumerate(ex.map(one, batches), 1):
            done.update(res)
            if args.only:
                for k, v in res.items():
                    print(' ', (IM[k].get('desc') or '')[:36], '→', json.dumps(v, ensure_ascii=False))
            if n % 20 == 0 or n == len(batches):
                if not args.only:
                    OUT.write_text(json.dumps(facts, ensure_ascii=False, indent=0), encoding='utf-8')
                print(f'  {n}/{len(batches)} calls · {len(done)} tagged · {round(time.time() - t0)}s · usage {USAGE}', flush=True)


if __name__ == '__main__':
    main()
