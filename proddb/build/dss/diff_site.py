"""samsung.com/business: previous raw (proddb/raw) vs this run (staging raw) → site-diff.json"""
import json, sys, re, collections, hashlib
old_dir, new_dir, app_data, out = sys.argv[1:5]
L = lambda d, f: json.load(open(f'{d}/{f}', encoding='utf-8'))
W0, W1 = L(old_dir, 'wkb_products.json'), L(new_dir, 'wkb_products.json')
S0, S1 = L(old_dir, 'wkb_specs.json'), L(new_dir, 'wkb_specs.json')
F0, F1 = L(old_dir, 'wkb_features.json'), L(new_dir, 'wkb_features.json')
pdb = json.load(open(f'{app_data}/products_db.json', encoding='utf-8'))
cat = json.load(open(f'{app_data}/catalog.json', encoding='utf-8'))
# app ids per goodsId
app_of = collections.defaultdict(list)
for r in pdb['products']:
    if r.get('gid'): app_of[r['gid']].append(r['id'])
for cid, c in pdb['curated'].items():
    if c.get('gid'): app_of[c['gid']].append(cid)
def models(W, gid):
    p = W['products'][gid]; ms = [p.get('mdlCode')] + [v['mdlCode'] for v in W['variants'].values() if v.get('parentGoodsId') == gid]
    return sorted({m for m in ms if m})
def opts(W, gid):
    return sorted((v.get('mdlCode'), v.get('optName'), v.get('optValue'), v.get('optValue2')) for v in W['variants'].values() if v.get('parentGoodsId') == gid)
def soldout(W, gid):
    return sorted((v.get('mdlCode'), v.get('soldOut')) for v in W['variants'].values() if v.get('parentGoodsId') == gid)
img = lambda s: re.sub(r'\?.*$', '', s or '')
def feat_norm(f):
    if not f: return None
    return [(x.get('h'), x.get('desc'), x.get('disc'), [img(i.get('src')) for i in x.get('imgs', [])]) for x in f.get('feats', [])]
def spec_norm(rows): return [tuple(r) for r in rows or []]
cards0, cards1 = set(W0['products']), set(W1['products'])
removed = sorted(cards0 - cards1); added = sorted(cards1 - cards0)
# a removed card whose models all live on in a new card = same product under a new goodsId (or merged as an option)
mod_to_new = {}
for g in W1['products']:
    for m in models(W1, g): mod_to_new.setdefault(m, set()).add(g)
for v in W1['variants'].values(): mod_to_new.setdefault(v.get('mdlCode'), set()).add(v.get('parentGoodsId'))
res = {'cards': [len(cards0), len(cards1)], 'removed': [], 'added': [], 'changed': [], 'unchanged': 0}
for g in removed:
    p = W0['products'][g]; ms = models(W0, g)
    hosts = collections.Counter(h for m in ms for h in mod_to_new.get(m, ()))
    host = hosts.most_common(1)[0][0] if hosts else None
    res['removed'].append({'gid': g, 'name': p.get('goodsNm'), 'models': ms, 'cat': p.get('catPath'), 'url': p.get('goodsDetailUrl'), 'app': app_of.get(g, []),
                           'movedTo': host if host and hosts[host] == len(ms) else None, 'partialHost': host if host and hosts[host] < len(ms) else None, 'hostShare': [hosts[host], len(ms)] if host else None})
for g in added:
    p = W1['products'][g]
    res['added'].append({'gid': g, 'name': p.get('goodsNm'), 'models': models(W1, g), 'cat': p.get('catPath'), 'url': p.get('goodsDetailUrl'), 'sale': p.get('saleStatCd'), 'reg': p.get('sysRegDtm')})
FIELDS = ['goodsNm', 'mdlCode', 'goodsDetailUrl', 'uspDescList', 'goodsTpCd', 'dlgtDispClsfEnNm']
for g in sorted(cards0 & cards1):
    a, b = W0['products'][g], W1['products'][g]; d = {}
    for k in FIELDS:
        if (a.get(k) or None) != (b.get(k) or None): d[k] = [a.get(k), b.get(k)]
    if models(W0, g) != models(W1, g): d['models'] = [models(W0, g), models(W1, g)]
    if opts(W0, g) != opts(W1, g): d['options'] = True
    if [img(i['src']) for i in a.get('images', [])][:3] != [img(i['src']) for i in b.get('images', [])][:3]: d['cardImages'] = True
    ids = [g] + [v['goodsId'] for v in W1['variants'].values() if v.get('parentGoodsId') == g]
    sd = [i for i in ids if spec_norm(S0.get(i)) != spec_norm(S1.get(i))]
    if sd: d['specs'] = sd
    if feat_norm(F0.get(g)) != feat_norm(F1.get(g)): d['features'] = 'missing-new' if g not in F1 else ('missing-old' if g not in F0 else True)
    so0, so1 = soldout(W0, g), soldout(W1, g)
    if so0 != so1: d['soldOut'] = [so0, so1]
    if d: res['changed'].append({'gid': g, 'name': b.get('goodsNm'), 'app': app_of.get(g, []), 'diff': d})
    else: res['unchanged'] += 1
json.dump(res, open(out, 'w'), ensure_ascii=False, indent=1)
c = collections.Counter(k for x in res['changed'] for k in x['diff'])
print('cards', res['cards'], 'removed', len(res['removed']), '(moved', sum(1 for x in res['removed'] if x['movedTo']), ') added', len(res['added']), 'changed', len(res['changed']), 'unchanged', res['unchanged'])
print('changed fields', dict(c))
