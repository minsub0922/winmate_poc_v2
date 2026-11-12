"""판매 종료 후보 재검토: ① 기존 PDP URL 직접 열기 ② samsung.com 검색 API(모델코드) ③ 이번 run e-카탈로그 전 권 텍스트"""
import json, sys, re, os, glob, urllib.request, urllib.parse, time
repo, run, cands_file, out = sys.argv[1:5]
cands = json.load(open(cands_file, encoding='utf-8'))
tmpl = json.load(open(f'{repo}/proddb/reviews/specs-20261020/search-template.json', encoding='utf-8'))
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130', 'Accept-Language': 'ko-KR'}
key = lambda s: re.sub(r'[^A-Z0-9]', '', (s or '').upper())
texts = {}
for f in glob.glob(f'{run}/ecat/text/*.json'):
    d = json.load(open(f, encoding='utf-8')); texts[d['dir']] = {int(p): (t, key(t)) for p, t in d['text'].items()}
def pdp(url):
    if not url: return None
    u = url if url.startswith('http') else 'https://www.samsung.com/sec/business/' + url.lstrip('/')
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40); h = r.read().decode('utf-8', 'ignore')
        t = re.search(r'<title>([^<]*)', h)
        return {'url': u, 'status': r.status, 'final': r.geturl(), 'title': (t.group(1).strip() if t else ''),
                'saleEnd': bool(re.search(r'판매\s*종료|단종|판매가 종료', h)), 'soldOut': bool(re.search(r'일시\s*품절|품절', h))}
    except urllib.error.HTTPError as e: return {'url': u, 'status': e.code}
    except Exception as e: return {'url': u, 'status': 0, 'error': str(e)[:120]}
def search(code):
    q = dict(urllib.parse.parse_qsl(tmpl['request'])); q['keyword'] = code
    req = urllib.request.Request(tmpl['url'], data=urllib.parse.urlencode(q).encode(), headers={**UA, 'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        j = json.loads(urllib.request.urlopen(req, timeout=40).read())
        hits = []
        def walk(x):
            if isinstance(x, dict):
                m = x.get('modelCode') or x.get('mdlCode') or x.get('modelcode')
                if m and key(code) in key(m): hits.append({'model': m, 'name': x.get('name') or x.get('displayName') or x.get('goodsNm'), 'url': x.get('consumerUrl') or x.get('pdpUrl') or x.get('url'), 'type': x.get('type')})
                for v in x.values(): walk(v)
            elif isinstance(x, list):
                for v in x: walk(v)
        walk(j); return hits[:6]
    except Exception as e: return [{'error': str(e)[:120]}]
def ecat(code, name=None):
    k = key(code); hits = []
    for D, pages in texts.items():
        for p, (t, kt) in pages.items():
            if (len(k) >= 5 and k in kt) or (name and name in t): hits.append([D, p])
    return hits[:12]
res = []
for c in cands:
    r = {'id': c['id'], 'name': c.get('name'), 'models': c.get('models', [])}
    r['pdp'] = pdp(c.get('url'))
    r['search'] = {m: search(m) for m in c.get('models', [])[:3]}
    r['ecat'] = {m: ecat(m) for m in c.get('models', [])}
    if c.get('searchName'): r['ecatName'] = ecat('', c['searchName'])
    res.append(r); time.sleep(0.3)
json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
for r in res:
    biz = [h for v in r['search'].values() for h in v if isinstance(h, dict) and h.get('url') and '/business/' in str(h.get('url'))]
    anys = sum(1 for v in r['search'].values() for h in v if isinstance(h, dict) and h.get('model'))
    ec = sorted({d for v in r['ecat'].values() for d, p in v} | {d for d, p in r.get('ecatName', [])})
    print(r['id'], (r['name'] or '')[:26], '| pdp', (r['pdp'] or {}).get('status'), '->', ((r['pdp'] or {}).get('final') or '')[-60:], 'saleEnd' if (r['pdp'] or {}).get('saleEnd') else '', '| search hits', anys, 'biz', len(biz), '| ecat', ec)
