"""DSS DB 업데이트 — 소스 인벤토리(proddb/reviews/<RUN>/source-inventory.json).
기존에 쓴 소스 + 같은 채널에 새로 생긴 소스의 합집합. 행마다 기대 수 · 받은 수 · 상태(complete/partial/failed/same/changed/new/moved/gone).
사용: python3 proddb/build/dss/inventory.py <run dir> <review dir>"""
import json, os, sys, hashlib, urllib.parse
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
# 지난 수집에도 있던 오류인지(proddb/raw/collect_errors.json) — 같은 오류가 이어지는 것과 이번에 새로 난 것을 구분해 적는다
PE = os.path.join(ROOT, 'proddb/raw/collect_errors.json')
sig = lambda e: (e.get('stage'), e.get('p') or e.get('gid') or e.get('c'), e.get('status') or e.get('e'))
known = {sig(e) for e in (J(PE) if os.path.exists(PE) else [])}
again = lambda e: '지난 수집도 같은 오류' if sig(e) in known else '이번 수집에서 새로 난 오류'
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
        n_old = sum(1 for p in OP['products'].values() if p.get('catPath') == e['p'] or e['p'] in (p.get('alsoIn') or []))
        src.append({'id': 'site:list:' + e['p'], 'channel': 'samsung.com/sec/business', 'kind': 'goodsList', 'url': SITE + e['p'] + '/', 'status': 'failed',
                    'error': e['e'], 'note': f"{again(e)} — 지난 원문에서 이 분류로 받은 상품 {n_old}개" + (' (이 분류에만 근거가 있던 DSS 없음)' if not n_old else '')})
n_goods = len(set(NP['products']) | set(NP.get('variants') or {}))  # 상품 카드와 옵션 상품의 goodsId 합집합(카드의 대표 옵션은 양쪽에 다 있다)
src.append({'id': 'site:spec-api', 'channel': 'samsung.com/sec/business', 'kind': 'getGoodsSpecList', 'cur': {'expected': n_goods, 'received': len(S)},
            'status': 'complete' if len(S) >= n_goods and not [e for e in errs if e['stage'] == 'spec'] else 'partial', 'note': '상품 카드 + 옵션 상품(variants)별 사양'})
fe = [e for e in errs if e['stage'] == 'feature']
src.append({'id': 'site:pdp', 'channel': 'samsung.com/sec/business', 'kind': 'PDP 특장점 · USP · 이미지', 'cur': {'expected': len(NP['products']), 'received': len(NP['products']) - len(fe)},
            'status': 'complete' if not fe else 'partial', 'error': [f"{e['gid']} HTTP {e.get('status') or e.get('e')}" for e in fe],
            'note': ' · '.join(f"{e['gid']} 상품 페이지 {again(e)} — 이 상품은 목록 · 사양 API 로 확인" for e in fe)})
for b in ec['books']:
    if b['status'] == 'not-fetched':
        src.append({'id': f"ecat:{b['dir']}", 'channel': 'samsung.aiibook.net/b2b', 'kind': 'e-catalog', 'dir': b['dir'], 'title': b['title'], 'status': 'failed', 'note': '쪽 텍스트를 받지 못함'})
        continue
    if b['status'] not in ('same', 'changed', 'new'): continue  # 빠진 권은 아래에 따로 적는다
    st = b['status']
    if b.get('prevDir') and b['prevDir'] != b['dir']: st = 'moved'
    if b.get('newlyMissing'): st = 'partial'  # 지난 수집에는 글이 있던 쪽을 이번에 못 받음 — 이 권에만 근거가 있는 DSS 는 판정하지 않는다
    src.append({'id': f"ecat:{b['dir']}", 'channel': 'samsung.aiibook.net/b2b', 'kind': 'e-catalog', 'dir': b['dir'], 'title': b['title'], 'docTitle': b.get('docTitle'),
                'prev': {'dir': b.get('prevDir'), 'pages': b.get('prevPages')}, 'cur': {'expected': b['pages'], 'received': b['pages'] - len(b.get('missing') or []), 'noTextPages': b.get('missing') or []},
                'status': st, 'changedPages': b.get('changedPages') if st != 'moved' else f"{len(b.get('changedPages') or [])}쪽", 'addedPages': b.get('addedPages'),
                'note': ('지난 수집에는 글이 있던 쪽을 못 받음: ' + ','.join(map(str, b['newlyMissing']))) if b.get('newlyMissing') else
                        '텍스트가 없는 쪽(이미지 전용)은 지난 수집과 같음' if b.get('missing') and st != 'new' else ''})
# 지난 권 목록에는 있고 이번 run 목록에는 없는 권 — 정기 호 교체(새 호가 대신함)이거나 사라진 권(run.json ecat_gone: {Dir: 확인한 내용})
prev_books = {c[2]: c for c in J(os.path.join(ROOT, 'proddb/ecat/catalogs.json'))}
cur_dirs = {b['dir'] for b in ec['books'] if b['status'] in ('same', 'changed', 'new', 'not-fetched')}
replaced = {b['prevDir']: b['dir'] for b in ec['books'] if b.get('prevDir') and b['prevDir'] != b['dir']}
for d, c in prev_books.items():
    if d in cur_dirs: continue
    src.append({'id': f'ecat:{d}', 'channel': 'samsung.aiibook.net/b2b', 'kind': 'e-catalog', 'dir': d, 'title': f'{c[3]} {c[1]}' if c[0] == 'tab1' else c[3], 'status': 'gone',
                'note': f'정기 호 교체 — 최신 호 Dir {replaced[d]} 만 현재 근거. 추출 id(ec{d}_*)는 유지하고 근거를 새 호 쪽으로 옮김' if d in replaced else
                        CFG.get('ecat_gone', {}).get(d, '이번 run 권 목록에 없음 — Dir 직접 접근 결과를 run.json ecat_gone 에 적는다')})
# 솔루션 · 분류 · 근거 페이지 — 지난 전체 run 의 인벤토리와 비교해 새로 생긴 리디렉트(주소 이동)를 가려 적는다
last = {}
for r in reversed(J(os.path.join(ROOT, 'proddb/dss/ledger.json'))['runs'] if os.path.exists(os.path.join(ROOT, 'proddb/dss/ledger.json')) else []):
    f = os.path.join(ROOT, 'proddb/reviews', r['run_id'], 'source-inventory.json')
    if not r.get('scope') and r['run_id'] != CFG['run_id'] and os.path.exists(f):
        last = {x['url']: x.get('cur') or {} for x in J(f)['sources'] if x['id'].startswith('page:')}; break
same_url = lambda a, b: urllib.parse.unquote(a or '').rstrip('/') == urllib.parse.unquote(b or '').rstrip('/')
tax_moves, sol_moves = CFG.get('taxonomy_url_moves', {}), CFG.get('sol_url_moves', {})
for u, x in pages.items():
    st = x['status']
    if u in CFG.get('solution_recheck', {}): st = CFG['solution_recheck'][u]
    redirected = st == 200 and not same_url(x.get('final'), u)
    new_redirect = redirected and u in last and not same_url(last[u].get('final'), x.get('final'))
    note = ('분류 URL 은 site_lists 목록 주소로 교체' if st == 404 and any(r.startswith('tax:') and r[4:] in tax_moves for r in x['refs']) else
            f'주소 이동 — 기록한 주소를 {sol_moves[u]} 로 교체' if u in sol_moves else
            f"리디렉트가 새로 생김 → {x.get('final')} (기록한 주소는 그대로)" if new_redirect else
            f"리디렉트 → {x.get('final')}" + (' (지난 run 과 같음)' if u in last else '') if redirected else
            '열지 못함 — 같은 솔루션의 다른 공식 출처로 확인' if st == 0 else '')
    src.append({'id': 'page:' + hashlib.sha1(u.encode()).hexdigest()[:10], 'channel': 'official' if any(d in u for d in ('samsung.com', 'samsungknox.com', 'aiibook.net')) else 'external',
                'kind': 'solution · 분류 · 근거 페이지', 'url': u, 'refs': x['refs'], 'cur': {'status': st, 'final': x.get('final'), 'title': x.get('title'), 'sha256': x.get('textSha256')},
                'status': ('moved' if u in sol_moves or new_redirect else 'complete') if st == 200 else 'failed', 'note': note})
for u, st in CFG.get('solution_recheck', {}).items():  # 수집 목록에 없던 주소를 사람이 따로 연 결과(옮겨 간 새 주소 등)
    if u not in pages:
        src.append({'id': 'page:' + hashlib.sha1(u.encode()).hexdigest()[:10], 'channel': 'official' if any(d in u for d in ('samsung.com', 'samsungknox.com', 'aiibook.net')) else 'external',
                    'kind': 'solution · 분류 · 근거 페이지', 'url': u, 'refs': sorted(k for k, v in sol_moves.items() if v == u), 'cur': {'status': st}, 'status': 'complete' if st == 200 else 'failed',
                    'note': '옮겨 간 새 주소 — run.json solution_recheck 로 확인' if u in sol_moves.values() else 'run.json solution_recheck 로 확인'})
# 구독(subscription) 소스 — proddb/build/subs/collect.py 의 inventory.json(전체 run 에서 함께 받은 경우)
SUBS = os.path.join(RUN_DIR, 'subs/raw/inventory.json')
for x in (J(SUBS)['sources'] if os.path.exists(SUBS) else []):
    src.append({'id': 'subs:' + x['id'], 'channel': urllib.parse.urlparse(x['url']).netloc.replace('www.', ''), 'kind': 'subscription · ' + x['id'].split(':')[0], 'url': x['url'],
                'cur': {k: x[k] for k in ('http', 'final', 'textHash', 'images') if k in x}, 'status': x['status'], 'note': x.get('note', '')})
from collections import Counter
out = {'run': CFG['run_id'], 'run_at': CFG['run_at'], 'summary': dict(Counter(x['status'] for x in src)), 'sources': src}
json.dump(out, open(os.path.join(REVIEW, 'source-inventory.json'), 'w'), ensure_ascii=False, indent=1)
print(out['summary'], len(src))
