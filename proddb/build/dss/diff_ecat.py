"""e-catalog: previous text/extract (proddb/ecat) vs this run's text (staging) → ecat-diff.json"""
import json, sys, os, re, hashlib, collections
old_ecat, new_ecat, out = sys.argv[1:4]
# 정기 호 교체: 새 Dir → 지난 Dir (같은 책의 다음 호). 예: REPLACE=364:360 (여럿이면 쉼표)
REPLACE = dict(x.split(':') for x in os.environ.get('REPLACE', '').split(',') if ':' in x)
run = json.load(open(f'{new_ecat}/catalogs.json', encoding='utf-8'))
T = lambda d, D: (json.load(open(f'{d}/text/{D}.json', encoding='utf-8')) if os.path.exists(f'{d}/text/{D}.json') else None)
norm = lambda s: re.sub(r'\s+', ' ', s or '').strip()
TOK = re.compile(r'(?<![A-Za-z0-9])([A-Z]{1,4}[-]?[0-9]{2,4}[A-Z0-9][A-Z0-9-]{2,14})(?![A-Za-z0-9])')
key = lambda s: re.sub(r'[^A-Z0-9]', '', s.upper())
items = []
for fn in sorted(os.listdir(f'{old_ecat}/extract')):
    if fn.endswith('.json'):
        for it in json.load(open(f'{old_ecat}/extract/{fn}', encoding='utf-8')): it['_file'] = fn; items.append(it)
new_text = {}
books = []
for tab, grp, D, title in run:
    n = T(new_ecat, D); prevD = REPLACE.get(D, D); o = T(old_ecat, prevD)
    if not n: books.append({'dir': D, 'title': title, 'status': 'not-fetched'}); continue
    new_text[D] = {int(k): v for k, v in n['text'].items()}
    b = {'dir': D, 'title': title, 'docTitle': n.get('docTitle'), 'pages': n['pages'], 'missing': n.get('missing', []), 'prevDir': prevD if o else None}
    if not o: b['status'] = 'new'
    else:
        ot = {int(k): norm(v) for k, v in o['text'].items()}; nt = {int(k): norm(v) for k, v in n['text'].items()}
        b['prevPages'] = o['pages']
        b['newlyMissing'] = [p for p in b['missing'] if p in ot]   # 지난번엔 글이 있었는데 이번엔 없는 쪽 = 수집 실패 의심
        same = [p for p in nt if ot.get(p) == nt[p]]
        b['changedPages'] = sorted(p for p in nt if p in ot and ot[p] != nt[p]); b['addedPages'] = sorted(p for p in nt if p not in ot); b['removedPages'] = sorted(p for p in ot if p not in nt)
        b['status'] = 'same' if not (b['changedPages'] or b['addedPages'] or b['removedPages']) and o['pages'] == n['pages'] else 'changed'
        # 새 글에만 있는 모델코드 후보 (지난 글 전체에 없던 토큰)
        oldtok = {key(m.group(1)) for v in ot.values() for m in TOK.finditer(v)}
        b['newTokens'] = sorted({m.group(1) for p in b['changedPages'] + b['addedPages'] for m in TOK.finditer(nt[p]) if key(m.group(1)) not in oldtok})
    books.append(b)
for D in sorted({it['dir'] for it in items} - {b['dir'] for b in books} - set(REPLACE.values())):
    books.append({'dir': D, 'status': 'gone-or-out-of-run'})
if '360' in {it['dir'] for it in items}: pass
# 추출 항목마다: 모델코드가 이번 run 글 어디에 있는지 (같은 권 → 새 호 → 다른 권)
alltext = {(D, p): (t, key(t)) for D, pages in new_text.items() for p, t in pages.items()}   # 쪽 글 · 정규화 글을 한 번만 만든다
_where = {}
def where(m):
    k = key(m)
    if len(k) < 5: return []
    if k not in _where: _where[k] = sorted({(D, p) for (D, p), (t, kt) in alltext.items() if k in kt or m in t})
    return _where[k]
res_items = []
for it in items:
    D = it['dir']; cur = {v: k for k, v in REPLACE.items()}.get(D, D)
    ms = [m for m in it.get('models') or [] if m and '*' not in m]
    found = {m: where(m) for m in ms}
    inbook = {m: [p for (d, p) in w if d == cur] for m, w in found.items()}
    elsewhere = sorted({d for w in found.values() for (d, p) in w if d != cur})
    okm = [m for m in ms if inbook[m]]
    st = ('no-models' if not ms else 'all-in-book' if len(okm) == len(ms) else 'some-in-book' if okm else 'elsewhere' if elsewhere else 'missing')
    specs_missing = []
    if st in ('all-in-book', 'some-in-book'):
        pages = sorted({p for m in okm for p in inbook[m]})
        txt = re.sub(r'\s+', '', ' '.join(new_text[cur].get(p, '') for p in set(pages) | set(it.get('pages') or [])))
        for a, v in it.get('specs') or []:
            vv = re.sub(r'\s+', '', str(v))
            if vv and txt.find(vv) < 0: specs_missing.append([a, v])
    else: pages = []
    res_items.append({'id': it['id'], 'file': it['_file'], 'name': it['name'], 'dir': D, 'curDir': cur, 'status': st, 'models': len(ms), 'inBook': len(okm),
                      'newPages': pages, 'oldPages': it.get('pages'), 'elsewhere': elsewhere, 'specsNotFound': specs_missing})
json.dump({'books': books, 'items': res_items}, open(out, 'w'), ensure_ascii=False, indent=1)
print('books', collections.Counter(b['status'] for b in books))
print('items', collections.Counter(x['status'] for x in res_items), 'specs-not-found items', sum(1 for x in res_items if x['specsNotFound']))
