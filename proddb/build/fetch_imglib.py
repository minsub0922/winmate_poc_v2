"""imglib/index.json 의 원본 주소(samsung.com 상품 카드 · 상세페이지 · 도입사례)를 imglib_cache/<id>.* 로 받는다(없는 것만).
카탈로그에서 자른 사진은 imglib/ecat/ 에 파일로 있으므로 받지 않는다.  python3 build/fetch_imglib.py [동시 받기 수]"""
import json, os, sys, urllib.request, concurrent.futures
HERE = os.path.dirname(os.path.abspath(__file__))
IDX = json.load(open(os.path.join(HERE, '..', 'imglib', 'index.json'), encoding='utf-8'))['images']
CACHE = os.path.join(HERE, '..', 'imglib_cache'); os.makedirs(CACHE, exist_ok=True)


def get(o):
    if o.get('file') or not o.get('url'): return 'skip'
    ext = '.png' if 'PNG' in o['url'] or o['url'].split('?')[0].lower().endswith('.png') else '.jpg'
    dst = os.path.join(CACHE, o['id'] + ext)
    if os.path.exists(dst): return 'have'
    try:
        with urllib.request.urlopen(o['url'], timeout=120) as r, open(dst + '.part', 'wb') as f:
            f.write(r.read())
        os.replace(dst + '.part', dst); return 'ok'
    except Exception as e:
        return 'err'


with concurrent.futures.ThreadPoolExecutor(int(sys.argv[1]) if len(sys.argv) > 1 else 8) as ex:
    from collections import Counter
    print(Counter(ex.map(get, IDX)))
