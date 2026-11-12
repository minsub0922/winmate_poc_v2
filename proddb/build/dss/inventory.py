"""DSS DB 업데이트 — 소스 인벤토리(proddb/reviews/<RUN>/source-inventory.json).
기존에 쓴 소스 + 같은 채널에 새로 생긴 소스의 합집합. 행마다 기대 수 · 받은 수 · 상태(complete/partial/failed/same/changed/new/moved/gone).
사용: python3 proddb/build/dss/inventory.py <run dir> <review dir>"""
import json, os, sys, hashlib
RUN_DIR, REVIEW = sys.argv[1], sys.argv[2]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
J = lambda p: json.load(open(p))
CFG = J(os.path.join(REVIEW, 'run.json'))
NP, OP = J(os.path.join(RUN_DIR, 'raw/wkb_products.json')), J(os.path.join(ROOT, 'proddb/raw/wkb_products.json'))
errs = J(os.path.join(RUN_DIR, 'raw/errors.json'))
S, F = J(os.path.join(RUN_DIR, 'raw/wkb_specs.json')), J(os.path.join(RUN_DIR, 'raw/wkb_features.json'))
ec = J(os.path.join(RUN_DIR, 'review/ecat-diff.json'))
pages = J(os.path.join(RUN_DIR, 'sol/pages.json'))
SITE = 'https://www.samsung.com/sec/business/'
src = []
old = {c['p']: c for c in OP['cats']}
for c in NP['cats']:
    o = old.get(c['p'], {})
    st = 'complete' if c.get('received', c.get('count')) == c.get('count') else 'partial'
    src.append({'id': 'site:list:' + c['p'], 'channel': 'samsung.com/sec/business', 'kind': 'goodsList', 'url': SITE + c['p'] + '/',
                'prev': {'count': o.get('count'), 'no': o.get('no')}, 'cur': {'expected': c.get('count'), 'received': c.get('received', c.get('count')), 'no': c['no']},
                'status': st, 'note': '분류 페이지가 dispClsfNo 를 더 내놓지 않아 지난 번호로 목록 API 를 부름(같은 상품 반환)' if c.get('noFrom') == 'previous' else ''})
for e in errs:
    if e['stage'] == 'cat':
        src.append({'id': 'site:list:' + e['p'], 'channel': 'samsung.com/sec/business', 'kind': 'goodsList', 'url': SITE + e['p'] + '/', 'status': 'failed',
                    'error': e['e'], 'note': '지난 수집(2026-10-18)도 같은 오류 — 이 분류에만 근거가 있던 DSS 없음'})
n_goods = len(NP['products']) + len(NP.get('variants') or {})
src.append({'id': 'site:spec-api', 'channel': 'samsung.com/sec/business', 'kind': 'getGoodsSpecList', 'cur': {'expected': n_goods, 'received': len(S)},
            'status': 'complete' if len(S) >= len(NP['products']) else 'partial', 'note': '상품 카드 + 옵션 상품(variants)별 사양'})
fe = [e for e in errs if e['stage'] == 'feature']
src.append({'id': 'site:pdp', 'channel': 'samsung.com/sec/business', 'kind': 'PDP 특장점 · USP · 이미지', 'cur': {'expected': len(NP['products']), 'received': len(NP['products']) - len(fe)},
            'status': 'complete' if not fe else 'partial', 'error': [f"{e['gid']} HTTP {e['status']}" for e in fe],
            'note': 'G000181220 상품 페이지는 지난 수집도 HTTP 500 — 이 상품은 목록 · 사양 API 로 확인'})
for b in ec['books']:
    if b['status'] not in ('same', 'changed', 'new'): continue  # 빠진 권(203)은 아래에 따로 적는다
    st = b['status']
    if b.get('prevDir') and b['prevDir'] != b['dir']: st = 'moved'
    src.append({'id': f"ecat:{b['dir']}", 'channel': 'samsung.aiibook.net/b2b', 'kind': 'e-catalog', 'dir': b['dir'], 'title': b['title'], 'docTitle': b.get('docTitle'),
                'prev': {'dir': b.get('prevDir'), 'pages': b.get('prevPages')}, 'cur': {'expected': b['pages'], 'received': b['pages'] - len(b.get('missing') or []), 'noTextPages': b.get('missing') or []},
                'status': st, 'changedPages': b.get('changedPages') if st != 'moved' else f"{len(b.get('changedPages') or [])}쪽", 'addedPages': b.get('addedPages'),
                'note': '텍스트가 없는 쪽(이미지 전용)은 지난 수집과 같음' if b.get('missing') and st != 'new' else ''})
src.append({'id': 'ecat:360', 'channel': 'samsung.aiibook.net/b2b', 'kind': 'e-catalog', 'dir': '360', 'title': '비즈니스 종합 26년 9-10월호', 'status': 'gone',
            'note': '정기 호 교체 — 최신 호 Dir 364(11-12월호)만 현재 근거. 추출 id(ec360_*)는 유지하고 근거를 364 쪽으로 옮김'})
src.append({'id': 'ecat:203', 'channel': 'samsung.aiibook.net/b2b', 'kind': 'e-catalog', 'dir': '203', 'title': '삼성 시스템에어컨 DVM Home 일반용(2026년 7-8월호)', 'status': 'gone',
            'note': "목록에서 빠지고 Dir 직접 접근도 'Dir does not exist'"})
for u, x in pages.items():
    st = x['status']
    if u in CFG.get('solution_recheck', {}): st = CFG['solution_recheck'][u]
    src.append({'id': 'page:' + hashlib.sha1(u.encode()).hexdigest()[:10], 'channel': 'official' if any(d in u for d in ('samsung.com', 'samsungknox.com', 'aiibook.net')) else 'external',
                'kind': 'solution · 분류 · 근거 페이지', 'url': u, 'refs': x['refs'], 'cur': {'status': st, 'final': x.get('final'), 'title': x.get('title'), 'sha256': x.get('textSha256')},
                'status': 'complete' if st == 200 else 'failed', 'note': '분류 URL 은 site_lists 목록 주소로 교체' if st == 404 and any(r.startswith('tax:') for r in x['refs']) else
                ('Knox Suite 주소 이동 — 새 주소로 교체' if st == 404 and 'knox-suite' in u else ('urllib 이 비 ASCII URL 을 못 엶 — 같은 솔루션의 다른 공식 출처로 확인' if st == 0 else ''))})
from collections import Counter
out = {'run': CFG['run_id'], 'run_at': CFG['run_at'], 'summary': dict(Counter(x['status'] for x in src)), 'sources': src}
json.dump(out, open(os.path.join(REVIEW, 'source-inventory.json'), 'w'), ensure_ascii=False, indent=1)
print(out['summary'], len(src))
