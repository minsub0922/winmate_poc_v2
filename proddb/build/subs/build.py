"""구독(subscription) 레지스트리 만들기 — 원문 확인 사실 + 연결 규칙 + 추론 결제안 + 이번 run 원문 → app/data/subscriptions.json.
  python3 proddb/build/subs/build.py <raw dir> <RUN_ID> <RUN_AT> [--raw-out proddb/raw/subs]

DSS 의 네 번째 종류 subscription(구독) — 제품 · 솔루션 · 서비스와 따로 둔다. 레지스트리 항목 하나 = 원장(proddb/dss/ledger.json) 항목 하나(subscription:<id>).
  program(구독 프로그램) · care(B2B 블루패스) · care-option(관리 옵션) · package(사업장별 패키지) · promotion(기간 한정 혜택) · payment(결제 · 납부)
표식(checkedAt): 그 항목의 근거 소스가 이번 run 에서 complete 이고, 원문 문장(텍스트 사실)이 본문에 그대로 있고, 이미지 사실의 원본 해시가 확인 때와 같을 때만.
  하나라도 어긋나면 status 'needs-review'(사람이 원문을 다시 읽고 facts.json 을 고친 뒤 다시 빌드), 소스가 complete 가 아니면 'unresolved'.
결제안 중 basis 'inferred' 는 표식 대상이 아니다(status 'inferred') — 장표에는 '협의안'으로만 쓴다. 혜택은 validTo 가 지나면 status 'expired'."""
import json, os, re, shutil, sys
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
RAW, RUN_ID, RUN_AT = sys.argv[1], sys.argv[2], sys.argv[3]
RAW_OUT = sys.argv[sys.argv.index('--raw-out') + 1] if '--raw-out' in sys.argv else None
J = lambda p: json.load(open(p, encoding='utf-8'))
P = lambda *a: os.path.join(ROOT, *a)
F = J(P('proddb/subs/facts.json')); M = J(P('proddb/subs/mapping.json')); INF = J(P('proddb/subs/inferred.json')); SRC = J(P('proddb/subs/sources.json'))
ASSETS = J(P('proddb/subs/assets.out.json'))['items']
PAGES = {p['id']: p for p in J(os.path.join(RAW, 'pages.json'))}
IMAGES = J(os.path.join(RAW, 'images.json')); MODELS = J(os.path.join(RAW, 'models.json'))
INV = {x['id']: x for x in J(os.path.join(RAW, 'inventory.json'))['sources']}
PDB = J(P('app/data/products_db.json')); CAT = J(P('app/data/catalog.json')); VSP = J(P('app/data/vertical_space_product.json'))
OUT = P('app/data/subscriptions.json')
PREV = J(OUT) if os.path.exists(OUT) else {'items': []}
PREV_ITEMS = {x['id']: x for x in PREV['items']}

# ---------------------------------------------------------------- 원문 대조
norm = lambda s: re.sub(r'[^0-9A-Za-z가-힣%]', '', s or '')
BODY = {k: norm(' '.join(p.get('text') or [])) for k, p in PAGES.items()}
SRCURL = {s['id']: s['url'] for s in SRC['sources']}
complete = lambda sid: INV.get(sid, {}).get('status') == 'complete'
issues = []


def probe(sid, text, what):
    """원문 문장이 본문에 그대로 있는지(공백 · 문장부호 무시). 빠지면 needs-review 근거로 남김."""
    ok = norm(text) in BODY.get(sid, '')
    if not ok: issues.append({'source': sid, 'kind': 'text', 'what': what, 'text': text})
    return ok


def img_ok(key, what):
    url = F['images'][key]; cur = (IMAGES.get(url) or {}).get('sha256')
    ok = cur is not None and cur == F['imageHashes'].get(key)
    if not ok: issues.append({'source': 'image:' + key, 'kind': 'image', 'what': what, 'url': url, 'verified': F['imageHashes'].get(key), 'now': cur})
    return ok


def ev_text(sid): return {'source': sid, 'kind': 'text', 'url': SRCURL[sid], 'textHash': (PAGES.get(sid) or {}).get('textHash')}
def ev_img(key, sid): return {'source': sid, 'kind': 'image', 'url': F['images'][key], 'sha256': (IMAGES.get(F['images'][key]) or {}).get('sha256')}


def stamp(item, sids, checks):
    """근거 소스 complete + 원문 대조 통과 → 이번 run 시각으로 표식"""
    prev = PREV_ITEMS.get(item['id'], {})
    if not all(complete(s) for s in sids): status, at, run = 'unresolved', prev.get('checkedAt'), prev.get('checkedRun')
    elif not all(checks): status, at, run = 'needs-review', prev.get('checkedAt'), prev.get('checkedRun')
    else: status, at, run = 'active', RUN_AT, RUN_ID
    item.update(status=status, checkedAt=at, checkedRun=run)
    item['firstSeen'] = prev.get('firstSeen') or RUN_AT
    return item


# ---------------------------------------------------------------- 제품 DB · 구독 품목
ROWS = [dict(c, **PDB['curated'].get(c['id'], {}), _cur=True) for c in CAT['products']] + PDB['products']
BYID = {p['id']: p for p in ROWS}
LIVE = [p for p in ROWS if not p.get('deprecated') and not p.get('supersededBy')]
models_of = lambda p: [m for m in [p.get('model')] + list(p.get('models') or []) if m]
pic_of = lambda p: (p.get('gal') or [None])[0] or p.get('th')
CATS = {c['id']: c for c in M['categories']}


def in_cat(p, c):
    if p.get('sc') not in c['sc']: return False
    name = p.get('name') or ''
    if c.get('includeName') and not re.search(c['includeName'], name): return False
    if c.get('excludeName') and re.search(c['excludeName'], name): return False
    return True


def asset(model): return (ASSETS.get('p-' + model) or {}).get('file') if model else None


def rep_of(cid):
    c = CATS[cid]; r = c.get('rep') or {}
    if r.get('model'):
        m = MODELS.get(r['model']) or {}
        near = match_model(r['model'], cid)
        return {'img': asset(r['model']), 'name': m.get('name'), 'model': r['model'], 'product': near[0], 'match': near[1]}
    p = BYID.get(r.get('product'))
    return p and {'img': pic_of(p), 'name': p['name'], 'model': p.get('model'), 'product': p['id'], 'match': 'category'}


def match_model(code, cid):
    """B2C(D2C) 모델코드 → B2B 제품 DB 행: 같은 모델(exact) > 같은 시리즈 앞 11자리(series) > 같은 품목 대표(category)"""
    for p in LIVE:
        if code in models_of(p): return p['id'], 'exact'
    for p in LIVE:
        if any(m[:11] == code[:11] for m in models_of(p)) and in_cat(p, CATS[cid]): return p['id'], 'series'
    for p in LIVE:
        if any(m[:9] == code[:9] for m in models_of(p)) and in_cat(p, CATS[cid]): return p['id'], 'series'
    r = CATS[cid].get('rep') or {}
    return (r.get('product'), 'category') if r.get('product') else (None, None)  # B2B 제품 DB 에 같은 모델 · 시리즈가 없으면 같은 품목 대표 행


categories = []
for c in M['categories']:
    hits = [p for p in LIVE if in_cat(p, c)]
    categories.append({'id': c['id'], 'label': c['label'], 'status': c['status'], 'tax': c['tax'], 'sc': c['sc'], 'note': c.get('note', ''),
                       'count': len(hits), 'products': [p['id'] for p in hits], 'rep': rep_of(c['id']) if c['status'] == 'official' else None})
ELIG = {c['id'] for c in categories if c['status'] == 'official'}
TAX2CAT = {}
for c in M['categories']:
    if c['status'] != 'official' or c['id'] in ('washdry',): continue
    for t in c['tax']: TAX2CAT.setdefault(t, c['id'])

# ---------------------------------------------------------------- 항목
G = F['program']; items = []
S1, S2, N1, N2 = 'site:b2b-ai-subs', 'site:b2b-ai-subs-festival', 'news:20260928', 'news:20261027'
KM = lambda text, src, basis='official': {'text': text, 'src': src, 'basis': basis}

prog = {
 'id': 'sub_b2b_ai', 'type': 'program', 'parent': None, 'name': G['name'], 'brand': G['brand'], 'badge': G['badge']['text'], 'tagline': G['tagline']['text'],
 'url': G['url'], 'menu': G['menu']['text'], 'launch': G['launch'], 'target': G['target']['text'], 'eligibility': G['eligibility']['text'], 'inquiry': G['inquiry'],
 'headline': G['headline']['text'], 'investLine': G['investLine']['text'], 'pains': G['pains'], 'values': G['values'], 'compare': G['compare'], 'items': G['items'],
 'care': G['care'], 'industries': G['industries'], 'industriesHead': G['industriesSrc']['head'], 'terms': G['terms'], 'faq': G['faq'], 'paymentOfficial': G['payment']['official'],
 'basis': 'official',
 'keyMessages': [
  KM(f"{G['tagline']['text']}, {G['name']}", S1), KM(G['badge']['text'], S1),
  KM('초기 비용 부담은 낮추고, 시설 관리는 편해지고, 고객 만족도는 올라갑니다', S1),
  KM('목돈이 드는 일시불 구매 대신 월 분할 납부로 초기 비용을 확보하고, 무상 A/S로 비용을 줄입니다', S1),
  KM('삼성의 전문 엔지니어가 정기적 · 체계적으로 점검하고 관리합니다', S1),
  KM('최대 6년 무상 AS와 체계적인 정기 관리 서비스', N1),
  KM('다양한 최신 AI 가전도 부담 없이 B2B 삼성 AI 구독으로', S1),
 ],
 'evidence': [ev_text(S1), ev_text(S2), ev_text(N1), ev_img('kv', S1), ev_img('why', S1), ev_img('compare', S1), ev_img('items', S1), ev_img('care', S1), ev_img('pain', S1), ev_img('promo', S2)],
 'children': [],
}
checks = [probe(S1, G['headline']['text'], 'program.headline'), probe(S1, G['investLine']['text'], 'program.investLine'), probe(S1, G['care']['head'], 'program.care.head'),
          probe(S1, G['care']['line'], 'program.care.line'), probe(S1, G['items']['head'], 'program.items.head'), probe(S1, G['industriesSrc']['head'], 'program.industries.head'),
          probe(N1, '최대 6년 무상 AS', 'program.freeAs'), probe(N1, G['target']['text'], 'program.target')]
for k in ('period', 'careCycle', 'conditions', 'termination', 'restricted'):
    t = G['terms'][k]['text']
    checks.append(probe(S1, t, 'program.terms.' + k))
for f in G['faq']: checks.append(probe(S1, f['q'], 'program.faq.q'))
for k in ('kv', 'why', 'compare', 'items', 'care', 'pain', 'promo'): checks.append(img_ok(k, 'program 이미지 사실 · ' + k))
items.append(stamp(prog, [S1, S2, N1], checks))

B = F['bluepass']
bp = {'id': B['id'], 'type': 'care', 'parent': 'sub_b2b_ai', 'name': B['name'], 'line': B['line'], 'services': B['services'], 'basis': 'official',
      'keyMessages': [KM(B['line'], N1)] + [KM(f"{s['name']} — {s['line']}", N1) for s in B['services']],
      'evidence': [ev_text(N1), ev_text(N2)]}
checks = [probe(N1, B['line'], 'bluepass.line')] + [probe(N1, s['name'], 'bluepass.' + s['id']) for s in B['services']] + [probe(N1, s['line'], 'bluepass.' + s['id'] + '.line') for s in B['services']]
items.append(stamp(bp, [N1, N2], checks))

for o in F['careOptions']:
    sids = [o['src']] + ([o['also']] if o.get('also') else [])
    it = {'id': o['id'], 'type': 'care-option', 'parent': 'sub_b2b_ai', 'name': o['name'], 'scope': o['scope'], 'b2b': o.get('b2b', 'confirmed'), 'line': o['line'], 'points': o['points'],
          'basis': 'official', 'keyMessages': [KM(o['line'], o['src'])], 'evidence': [ev_img(o['img'], o['src']) if o.get('from') == 'image' else ev_text(o['src'])]}
    ck = [img_ok(o['img'], 'care-option ' + o['id'])] if o.get('from') == 'image' else [probe(o['src'], o['name'], 'care-option ' + o['id'])]
    items.append(stamp(it, sids, ck))

for pk in F['packages']:
    rows = []
    for x in pk['items']:
        if x.get('model'):
            m = MODELS.get(x['model']) or {}
            near, how = match_model(x['model'], x['cat'])
            rows.append({'label': x['label'], 'cat': x['cat'], 'model': x['model'], 'name': m.get('name'), 'url': m.get('url'), 'img': asset(x['model']),
                         'product': near, 'productName': BYID[near]['name'] if near else None, 'match': how, 'note': x.get('note', '')})
        else:
            r = rep_of(x['cat']) or {}
            rows.append({'label': x['label'], 'cat': x['cat'], 'model': None, 'name': None, 'url': None, 'img': r.get('img'), 'product': r.get('product'),
                         'productName': r.get('name'), 'match': 'category', 'note': x.get('note', '')})
    pv = M['packageVerticals'][pk['id']]
    it = {'id': pk['id'], 'type': 'package', 'parent': 'sub_b2b_ai', 'name': pk['name'], 'place': pk['place'], 'title': pk['title'], 'line': pk['line'],
          'photo': (ASSETS.get('pkg-' + pk['id'].split('_')[-1]) or {}).get('file'), 'items': rows, 'verticals': {'direct': pv['direct'], 'similar': pv['similar'], 'why': pv['why']},
          'basis': 'official', 'keyMessages': [KM(f"{pk['title']} — {pk['line']}", S2), KM(f"{pk['name']}: " + ' · '.join(r['label'] for r in rows), S2)],
          'evidence': [ev_img(pk['img'], S2)]}
    items.append(stamp(it, [S2], [img_ok(pk['img'], 'package ' + pk['id'])] + [MODELS.get(x['model'], {}).get('found', False) for x in pk['items'] if x.get('model')]))

day = RUN_AT[:10]
for pr in F['promotions']:
    it = {'id': pr['id'], 'type': 'promotion', 'parent': 'sub_b2b_ai', 'name': pr['name'], 'validFrom': pr['validFrom'], 'validTo': pr['validTo'], 'extended': pr.get('extended', False),
          'headline': pr['headline'], 'note': pr['note'], 'target': pr['target'], 'benefits': pr['benefits'], 'summary': pr['summary'], 'notes': pr['notes'],
          'basis': 'official', 'keyMessages': [KM(pr['summary'], S2), KM(f"{pr['validFrom'].replace('-', '.')} ~ {pr['validTo'].replace('-', '.')} 계약 고객 대상", S2)],
          'evidence': [ev_img('promo', S2), ev_img('festKv', S2)]}
    stamp(it, [S2], [img_ok('promo', 'promotion ' + pr['id']), img_ok('festKv', 'promotion ' + pr['id'] + ' · 기간')])
    it['state'] = 'expired' if day > pr['validTo'] else 'upcoming' if day < pr['validFrom'] else 'active'
    if it['state'] == 'expired' and it['status'] == 'active': it['status'] = 'expired'
    items.append(it)

for pay in INF['payments']:
    it = {'id': pay['id'], 'type': 'payment', 'parent': 'sub_b2b_ai', 'name': pay['name'], 'short': pay['short'], 'icon': pay['icon'], 'basis': pay['basis'],
          'summary': pay['summary'], 'fit': pay['fit'], 'points': pay['points'], 'confirm': pay['confirm'], 'reference': pay.get('reference', ''), 'detailInferred': pay.get('detailInferred', []),
          'evidenceRefs': pay['evidence'], 'keyMessages': [KM(pay['summary'], pay['evidence'][0].split('#')[0], pay['basis'])], 'evidence': []}
    if pay['basis'] == 'official':
        it['evidence'] = [ev_img('why', S1), ev_img('compare', S1)]
        stamp(it, [S1], [img_ok('why', 'payment monthly'), img_ok('compare', 'payment budget')])
    else:
        prev = PREV_ITEMS.get(pay['id'], {})
        it.update(status='inferred', checkedAt=None, checkedRun=None, firstSeen=prev.get('firstSeen') or RUN_AT, inferredAt=INF['inferredAt'])
    items.append(it)
prog['children'] = [x['id'] for x in items if x['parent'] == 'sub_b2b_ai']
paymentNotes = INF['notes']

# ---------------------------------------------------------------- 업종(버티컬) 44 → 구독 구성
PKG_OF = {}
for pid, pv in M['packageVerticals'].items():
    for v in pv['direct']: PKG_OF[v] = (pid, 'direct')
    for v in pv['similar']: PKG_OF.setdefault(v, (pid, 'similar'))
order = [c['id'] for c in M['categories'] if c['status'] == 'official']
verticals = {}
for v in VSP['verticals']:
    per_space = []
    for sp in v['spaces']:
        cs = {TAX2CAT[t] for t in sp['products'] if t in TAX2CAT}
        if {'wash', 'dry'} <= cs: cs -= {'wash', 'dry'}; cs.add('washdry')
        per_space.append(cs)
    cnt = Counter(c for cs in per_space for c in cs)
    tier = lambda c: CATS[c].get('tier') or 0
    cats = [c for c, _ in sorted(cnt.items(), key=lambda z: (tier(z[0]), -z[1], order.index(z[0])))][:M['derived']['max']]
    core = [c for c in cats if tier(c) == 0]
    best = max(range(len(per_space)), key=lambda i: (len(per_space[i] & set(cats)), -i)) if per_space else 0
    pkg, how = PKG_OF.get(v['id'], (None, 'derived'))
    if not pkg and len(core) < M['derived']['minCore']:  # 가전 품목이 적은 업종 — 사무 · 관리 공간 기준 오피스 패키지
        pkg, how = M['derived']['fallback'], 'fallback'
        for rx in (r'사무|관리|관제|상황실|행정|오피스', r'라운지|로비|대기실|대기 공간'):
            hit = next((i for i, sp in enumerate(v['spaces']) if re.search(rx, sp['name'])), None)
            if hit is not None: best = hit; break
    verticals[v['id']] = {'name': v['name'], 'pkg': pkg, 'match': how, 'cats': cats, 'space': best, 'spaceName': v['spaces'][best]['name'] if v['spaces'] else ''}

# ---------------------------------------------------------------- 쓰기
by_type = Counter(x['type'] for x in items); by_status = Counter(x['status'] for x in items)
reg = {
 'version': 1,
 'about': 'B2B 삼성 AI 구독 레지스트리 — DSS 의 구독(subscription) 종류. 원문 사실(basis official) · 추론 결제안(basis inferred, 장표에는 협의안으로) · 기간 한정 혜택(validTo 지나면 expired). proddb/build/subs/build.py 가 만들고 DSS DB 업데이트 skill 이 run 마다 갱신한다 — 손으로 고치지 말고 proddb/subs/*.json 을 고친다.',
 'generated': RUN_AT, 'run': RUN_ID,
 'types': {'program': '구독 프로그램', 'care': '구독 케어(블루패스)', 'care-option': '관리 옵션', 'package': '사업장별 구독 패키지', 'promotion': '구독 혜택(기간 한정)', 'payment': '결제 · 납부'},
 'sources': [{'id': s['id'], 'kind': s['kind'], 'role': s['role'], 'url': s['url'], 'title': (PAGES.get(s['id']) or {}).get('title') or s['title'],
              'status': INV.get(s['id'], {}).get('status'), 'textHash': (PAGES.get(s['id']) or {}).get('textHash'), 'checkedAt': RUN_AT if complete(s['id']) else None} for s in SRC['sources']],
 'items': items, 'paymentNotes': paymentNotes, 'consumerRef': F['consumerRef'], 'categories': categories, 'verticals': verticals, 'addon': M['addon'],
 'counts': {'items': len(items), 'byType': dict(by_type), 'byStatus': dict(by_status), 'eligibleProducts': len({i for c in categories if c['status'] == 'official' for i in c['products']}),
            'restrictedProducts': len({i for c in categories if c['status'] == 'restricted' for i in c['products']}),
            'verticals': {k: sum(1 for v in verticals.values() if v['match'] == k) for k in ('direct', 'similar', 'derived', 'fallback')}},
 'issues': issues,
}
tmp = OUT + '.tmp'
json.dump(reg, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
os.replace(tmp, OUT)
if RAW_OUT:  # 이번 run 원문(이미지 바이트 제외 — 해시만) → proddb/raw/subs
    os.makedirs(P(RAW_OUT), exist_ok=True)
    for n in ('pages.json', 'images.json', 'models.json', 'discover.json', 'inventory.json'): shutil.copyfile(os.path.join(RAW, n), P(RAW_OUT, n))
print(json.dumps({'items': len(items), 'byType': dict(by_type), 'byStatus': dict(by_status), 'issues': len(issues), 'eligible': reg['counts']['eligibleProducts'],
                  'verticals': reg['counts']['verticals']}, ensure_ascii=False))
for x in issues: print('  !', json.dumps(x, ensure_ascii=False)[:300])
