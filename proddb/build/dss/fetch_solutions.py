"""Fetch every solution / taxonomy / evidence URL used before (status, final URL, title, og image, text hash)."""
import json, re, sys, hashlib, html, urllib.request, urllib.parse, time
from concurrent.futures import ThreadPoolExecutor
repo, out = sys.argv[1], sys.argv[2]
J = lambda p: json.load(open(repo + '/' + p, encoding='utf-8'))
urls = {}
for x in J('build/media/data/sol_urls.json'): urls.setdefault(x['url'], set()).add('sol_urls:' + x['key'])
vss = J('app/data/vertical_space_solution.json')
for sc in vss['solution_catalog']:
    for u in sc.get('sources', []): urls.setdefault(u, set()).add('vss:' + sc['id'])
    if sc.get('url'): urls.setdefault(sc['url'], set()).add('vss-url:' + sc['id'])
vsp = J('app/data/vertical_space_product.json')
base = vsp['meta']['base_url']
for u in vsp['meta'].get('sources', []): urls.setdefault(u, set()).add('vsp-meta')
for g in vsp['product_taxonomy']:
    if g.get('url'): urls.setdefault(base + g['url'], set()).add('tax-group:' + g['id'])
    for c in g.get('categories', []):
        if c.get('url'): urls.setdefault(base + c['url'] if c['url'].startswith('/') else c['url'], set()).add('tax:' + c['id'])
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'ko-KR,ko;q=0.9'}
def get(u):
    # 비 ASCII · 공백 · 대괄호가 든 URL(뉴스룸 한글 주소, 카탈로그 PDF 이름)은 퍼센트 인코딩해서 연다
    q = urllib.parse.quote(u, safe=':/?#&=%+,;@!$\'()*~')
    for k in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(q, headers=UA), timeout=40)
            b = r.read(); return r.status, r.geturl(), b.decode('utf-8', 'ignore')
        except urllib.error.HTTPError as e: return e.code, u, ''
        except Exception as e: err = str(e); time.sleep(2)
    return 0, u, err
def one(u):
    st, fin, h = get(u)
    t = re.search(r'<title[^>]*>(.*?)</title>', h, re.S); og = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', h)
    body = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', h, flags=re.S); text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', body))).strip()
    return u, {'refs': sorted(urls[u]), 'status': st, 'final': fin, 'title': html.unescape(t.group(1)).strip() if t else '', 'og': og.group(1) if og else '',
               'textSha256': hashlib.sha256(text.encode()).hexdigest() if st == 200 else '', 'textLen': len(text), 'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%S%z')}
with ThreadPoolExecutor(4) as ex: res = dict(ex.map(one, sorted(urls)))
json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
import collections; print('urls', len(res), collections.Counter(v['status'] for v in res.values()))
