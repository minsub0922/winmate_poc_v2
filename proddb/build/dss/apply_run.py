"""DSS DB 업데이트 — 한 run 의 staging 결과를 앱 데이터에 반영할 모양으로 만든다(활성 파일은 쓰지 않는다).

3-way 반영: 기준(base) = 지난 원문으로 다시 만든 export, 새것(new) = 이번 원문 export, 현재(active) = app/data.
  · 행/상세의 각 필드는 base 와 new 가 다를 때만 new 값으로 바꾼다 — export 뒤에 따로 붙인 사진 pack · 검토 사양 · 수동 수정은 그대로 둔다.
  · 검토 사양(product-details 의 specs · spec*)은 공식 사양 API(official-api) 출처를 이번 원문(raw/wkb_specs.json)으로 다시 대조하고,
    e-카탈로그 출처(catalog · official-page-extract)는 새 권·새 쪽에서 원문을 다시 찾는다. 다시 확인한 출처에만 checkedAt 을 새로 찍는다.
  · 사라진 행은 지우지 않는다: 판매 종료(deprecated) 표식 / 사이트 목록에서만 빠짐(siteListed false) / 다른 행으로 대체(supersededBy).
  · 같은 제품이 다른 id 로 다시 생긴 행(alias)은 기존 id 행에 합친다.
사용: python3 proddb/build/dss/apply_run.py <run dir: output/dss/RUN_ID> <review dir: proddb/reviews/RUN_ID>
출력: <run dir>/stage/{app/data/products_db.json, app/data/product-details/dNN.json, proddb/dss/ledger.json, review/*.json}"""
import copy, glob, hashlib, json, os, re, sys

RUN_DIR, REVIEW = sys.argv[1], sys.argv[2]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CFG = json.load(open(os.path.join(REVIEW, 'run.json')))
RUN_ID, RUN_AT = CFG['run_id'], CFG['run_at']
DATE = RUN_AT[:10]
J = lambda p: json.load(open(p))
STAGE = os.path.join(RUN_DIR, 'stage')
os.makedirs(os.path.join(STAGE, 'app/data/product-details'), exist_ok=True)
os.makedirs(os.path.join(STAGE, 'review'), exist_ok=True)

# ── 입력 ──
act = J(os.path.join(ROOT, 'app/data/products_db.json'))
catalog = J(os.path.join(ROOT, 'app/data/catalog.json'))
base = J(os.path.join(RUN_DIR, 'base-app/data/products_db.json'))
new = J(os.path.join(RUN_DIR, 'new-app/data/products_db.json'))
base_dt = J(os.path.join(RUN_DIR, 'base-app/img/prod/d00.json'))['items']
new_dt = J(os.path.join(RUN_DIR, 'new-app/img/prod/d00.json'))['items']
overlay, pack_of = {}, {}
for f in sorted(glob.glob(os.path.join(ROOT, 'app/data/product-details/d[0-9][0-9].json'))):
    n = int(os.path.basename(f)[1:3])
    for k, v in J(f)['items'].items(): overlay[k] = v; pack_of[k] = n
RAWP = J(os.path.join(RUN_DIR, 'raw/wkb_products.json'))
RAWS = J(os.path.join(RUN_DIR, 'raw/wkb_specs.json'))
RAWF = J(os.path.join(RUN_DIR, 'raw/wkb_features.json'))
OLDP = J(os.path.join(ROOT, 'proddb/raw/wkb_products.json'))  # 지난 원문(활성) — 공식 사양 행이 바뀌었는지 비교
OLDS = J(os.path.join(ROOT, 'proddb/raw/wkb_specs.json'))
texts = {}
for f in glob.glob(os.path.join(RUN_DIR, 'ecat/text/*.json')):
    d = J(f); texts[str(d['dir'])] = {int(k): v for k, v in d['text'].items()}
remap = J(os.path.join(RUN_DIR, 'review/remap-360-364.json'))
PAGEMAP = {('360', int(k)): ('364', v) for k, v in remap['pageMap'].items()}
DEC = J(os.path.join(REVIEW, 'extract-decisions.json'))
REPOINT = DEC['a_light_dacor_harman.json']['repoint']
DEPREV = J(os.path.join(REVIEW, 'deprecation-review.json'))
PHOTOS = J(os.path.join(REVIEW, 'new-photos.json'))
EX_OLD = {it['id']: it for f in glob.glob(os.path.join(ROOT, 'proddb/ecat/extract/*.json')) for it in J(f)}
EX_NEW = {it['id']: it for f in glob.glob(os.path.join(RUN_DIR, 'ecat-build/extract/*.json')) for it in J(f)}
ALIAS = CFG['alias']            # new export id → 유지할 기존 id (같은 제품)
SUPERSEDED = CFG['superseded']  # 기존 id → 같은 제품을 대신하는 사이트 행들
NEW_PACK = CFG['new_pack']

A = {p['id']: p for p in act['products']}
B = {p['id']: p for p in base['products']}
N = {p['id']: p for p in new['products']}
assert set(A) == set(B), 'base export 가 현재 앱 행과 다르다 — 지난 원문 재현부터 확인'
changes = []
def log(kind, pid, **kw): changes.append(dict(kind=kind, id=pid, **kw))

def merge3(cur, b, n, skip=()):
    """b→n 에서 바뀐 필드만 cur 에 반영. 바뀐 필드 이름 목록을 돌려준다."""
    out = []
    for k in sorted(set(b) | set(n)):
        if k in skip: continue
        if b.get(k) != n.get(k):
            if k in n: cur[k] = copy.deepcopy(n[k])
            else: cur.pop(k, None)
            out.append(k)
    return out

# ── 1. 행 ──
dep = {x['id']: x for x in DEPREV['items'] if x['verdict'] == 'deprecated'}
still = {x['id']: x for x in DEPREV['items'] if x['verdict'] == 'still_listed'}
rows = []
for p in act['products']:
    pid = p['id']; cur = copy.deepcopy(p)
    if pid in N:
        f = merge3(cur, B[pid], N[pid])
        if f: log('row-changed', pid, fields=f)
    else:
        src = next((k for k, v in ALIAS.items() if v == pid), None)
        if pid in dep:
            x = dep[pid]
            cur['deprecated'] = {'at': RUN_AT, 'run': RUN_ID, 'replacedBy': x['replacedBy'], 'reason': x['reason']}
            log('deprecated', pid, replacedBy=x['replacedBy'])
        elif pid in still:
            n = N[src]
            cur.update(siteListed=False, url='', cdir=n['cdir'], cpage=n['cpage'])
            log('still-listed', pid, catalog=f"Dir {n['cdir']} p.{n['cpage']}", via=src)
        elif pid in SUPERSEDED:
            cur['supersededBy'] = SUPERSEDED[pid]
            if str(cur.get('cdir')) == '360' and ('360', int(cur.get('cpage') or 0)) in PAGEMAP:
                cur['cdir'], cur['cpage'] = PAGEMAP[('360', int(cur['cpage']))]
            log('superseded', pid, by=SUPERSEDED[pid])
        else:
            raise SystemExit('판정 없이 사라진 행: ' + pid)
        if src and pid not in still:  # 같은 제품이 다른 id 로 다시 생김 → 그 내용으로 이 행을 갱신
            f = merge3(cur, B[pid], N[src], skip=('id',))
            log('row-changed', pid, fields=f, via=src)
    rows.append(cur)
for pid, x in N.items():
    if pid in B or pid in ALIAS: continue
    cur = copy.deepcopy(x); cur['d'] = NEW_PACK
    if pid in PHOTOS: cur.update(PHOTOS[pid])
    rows.append(cur); log('new', pid, name=x['name'])

# 행 순서: 새 export 순서(정렬 규칙)를 따르고, 사라진 행은 원래 바로 앞 행 뒤에 둔다
order = {pid: i for i, pid in enumerate(N)}
prev = None; pos = {}
for p in act['products']:
    if p['id'] in N: prev = order[p['id']]
    pos[p['id']] = (prev if prev is not None else -1) + 0.5 if p['id'] not in N else order[p['id']]
for p in rows:
    if p['id'] not in pos: pos[p['id']] = order[p['id']]
rows.sort(key=lambda p: pos[p['id']])

# 큐레이션(curated) — 같은 3-way
cur_out = copy.deepcopy(act['curated'])
for cid, x in cur_out.items():
    f = merge3(x, base['curated'].get(cid, {}), new['curated'].get(cid, {}))
    if f: log('curated-changed', cid, fields=f)

# ── 2. 확인 시점 표식 ──
raw_gids = set(RAWP['products']) | set((RAWP.get('variants') or {}))
def goods_map(P):
    m = {}
    for g, p in P['products'].items():
        if p.get('mdlCode'): m.setdefault(p['mdlCode'], g)
    for g, v in (P.get('variants') or {}).items():
        if v.get('mdlCode'): m.setdefault(v['mdlCode'], g)
    for g, p in P['products'].items():
        for line in (p.get('goodsOptStr') or '').split('\n'):
            f = line.split('|')
            if len(f) > 9 and f[8]: m.setdefault(f[8], g)
    return m
model_goods, old_model_goods = goods_map(RAWP), goods_map(OLDP)
evidence = {}
for p in rows:
    pid = p['id']
    if p.get('deprecated'): continue
    if pid.startswith('sg_') and p.get('gid') in raw_gids and p.get('siteListed') is not False:
        evidence[pid] = [{'source': 'site', 'url': p.get('url'), 'goods': p.get('gid')}]
    elif p.get('cdir') and str(p['cdir']) in texts:
        evidence[pid] = [{'source': 'ecat', 'dir': str(p['cdir']), 'page': p.get('cpage')}]
    if pid in evidence: p['checkedAt'] = RUN_AT
cur_ids = [c['id'] for c in catalog['products']]

# ── 3. 상세(product-details overlay) ──
def clean(rows_):
    LEGAL = re.compile(r'(상품 기본정보|안전인증|인증정보|EMC|RF모듈|제조|A/S|품질보증|KC 인증)')
    LEGAL_ATTRIBUTE = re.compile(r'^(제품명|모델명|제조자.*|제조국.*|제조년.*|동일모델.*|A/S.*|KC 인증.*|품질보증.*|소비자.*전화.*)$')
    out = []
    for row in rows_:
        if len(row) != 3: continue
        g, n, v = [str(x or '').strip() for x in row]
        if not n or not v or LEGAL.search(g) or LEGAL_ATTRIBUTE.search(n) or v in ('해당없음', '해당 없음', '-'): continue
        if [g, n, v] not in out: out.append([g, n, v])
    return out
norm = lambda s: re.sub(r'\s+', '', str(s or '')).casefold()
ntext = {d: {p: norm(t) for p, t in pg.items()} for d, pg in texts.items()}
feat_text = {g: norm(json.dumps(v, ensure_ascii=False)) for g, v in RAWF.items()}
ecat_url = lambda d, p: f'https://samsung.aiibook.net/b2b/access/ecatalogt.php?eclang=ko&Dir={d}&start={p}'
stats = {'api_same': 0, 'api_changed': 0, 'api_missing': 0, 'catalog_ok': 0, 'catalog_moved': 0, 'catalog_unverified': 0, 'quote_ok': 0, 'quote_moved': 0, 'quote_unverified': 0, 'not_rechecked': 0}

def find_quote(q, prefer=None):
    nq = norm(q)
    if not nq: return None
    if prefer and prefer[0] in ntext and nq in ntext[prefer[0]].get(prefer[1], ''): return prefer
    for d, pg in ntext.items():
        for p, t in pg.items():
            if nq in t: return (d, p)
    return None

def recheck_source(pid, s, rows_out):
    """출처 하나를 이번 원문으로 다시 확인. 확인되면 checkedAt=DATE. official-api 는 새 사양 행을 rows_out 에 넣는다."""
    k = s.get('kind')
    if k == 'official-api':
        g = model_goods.get(s.get('model'))
        if not g or g not in RAWS:
            stats['api_missing'] += 1; return False
        go = old_model_goods.get(s.get('model'))
        rows_out.append({'source': s, 'new': clean(RAWS[g]), 'old': clean(OLDS.get(go) or []) if go else None, 'goods': g})
        return None  # 호출한 쪽이 바뀜 여부를 보고 표식한다
    d = str(s.get('dir') or '')
    if k == 'catalog' and d:
        pages = s.get('pages') or ([s['page']] if s.get('page') else [])
        if d in texts and d != '360':
            stats['catalog_ok'] += 1; s['checkedAt'] = DATE; return True
        if d == '360':
            np = sorted({PAGEMAP[('360', int(p))][1] for p in pages if ('360', int(p)) in PAGEMAP})
            if np:
                s.update(dir='364', pages=np, url=ecat_url('364', np[0]), checkedAt=DATE); stats['catalog_moved'] += 1; return True
        if d == '203' and pid.startswith('ec_203_') and ('ec' + pid[3:]) in REPOINT:
            r = REPOINT['ec' + pid[3:]]
            s.update(dir=r['dir'], pages=r['pages'], url=ecat_url(r['dir'], r['pages'][0]), checkedAt=DATE); stats['catalog_moved'] += 1; return True
        stats['catalog_unverified'] += 1; return False
    if k == 'official-page-extract' and s.get('quote'):
        if d.startswith('manufacturer:'):
            stats['not_rechecked'] += 1; return False
        if d.startswith('pdp:'):
            g = d[4:]
            if g in feat_text and norm(s['quote']) in feat_text[g]:
                s['checkedAt'] = DATE; stats['quote_ok'] += 1; return True
            stats['quote_unverified'] += 1; return False
        page = int(s.get('page') or 0)
        prefer = PAGEMAP.get(('360', page)) if d == '360' else (d, page)
        hit = find_quote(s['quote'], prefer)
        if hit:
            if hit != (d, page):
                s.update(dir=hit[0], page=hit[1], url=ecat_url(*hit)); stats['quote_moved'] += 1
            else: stats['quote_ok'] += 1
            s['checkedAt'] = DATE; return True
        stats['quote_unverified'] += 1; return False
    stats['not_rechecked'] += 1
    return False

def status_of(dt):
    n = len(dt.get('specs') or [])
    if dt.get('specModelUnverified'): return 'model_identity_unverified'
    return 'verified_detailed' if n >= 4 and dt.get('specSources') else 'limited_official_data' if n else 'needs_primary_source'

final_ids = [p['id'] for p in rows]
details = {}
spec_ledger = []
for pid in cur_ids + final_ids:
    if pid in details: continue
    before = overlay.get(pid)
    row = next((p for p in rows if p['id'] == pid), None) if pid not in cur_ids else None
    if before is not None:
        dt = copy.deepcopy(before)
        src_id = next((k for k, v in ALIAS.items() if v == pid), pid)
        if not (row and row.get('deprecated')) and pid in base_dt and src_id in new_dt and not (row and row.get('siteListed') is False):
            f = merge3(dt, base_dt[pid], new_dt[src_id], skip=tuple(k for k in set(base_dt[pid]) | set(new_dt[src_id]) if k == 'specs' or k.startswith('spec')))
            if f: log('detail-changed', pid, fields=f)
        if not (row and row.get('deprecated')):
            state = {'changed': False}; review = []
            def settle(holder, srcs, key='specs'):
                """holder(상세 또는 specVariants 항목)의 출처를 다시 확인. 공식 사양 API 행이 바뀌었으면 출처가 하나일 때만 새 행으로 바꾼다."""
                api = []
                ok = [recheck_source(pid, s, api) for s in srcs]
                for a in api:
                    s = a['source']
                    same = a['old'] is not None and a['old'] == a['new']
                    if not same and len(srcs) == 1 and a['new']:
                        if holder.get(key) != a['new']: holder[key] = a['new']; state['changed'] = True
                        same = True
                    if same:
                        s.update(checkedAt=DATE, evidence='proddb/raw/wkb_specs.json',
                                 sha256=hashlib.sha256(json.dumps(RAWS[a['goods']], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest())
                        stats['api_same'] += 1
                    else:
                        review.append(s.get('model')); stats['api_changed'] += 1
                return any(ok) or bool(api)
            touched = settle(dt, dt.get('specSources') or [])
            # 카탈로그 전용 행: 검토 사양의 '카탈로그' 행은 추출 항목 사양에서 왔다 — 새 권에서 값이 바뀌었으면 그 행만 바꾼다
            cid = 'ec' + pid[3:] if pid.startswith('ec_') else None
            if cid and cid in EX_OLD and cid in EX_NEW and EX_OLD[cid].get('specs') != EX_NEW[cid].get('specs'):
                old_rows = [['카탈로그', a, v] for a, v in EX_OLD[cid].get('specs') or []]
                new_rows = [['카탈로그', a, v] for a, v in EX_NEW[cid].get('specs') or []]
                kept = [r for r in dt.get('specs') or [] if r not in old_rows]
                if new_rows + kept != dt.get('specs'):
                    dt['specs'] = clean(new_rows + kept); state['changed'] = True
            for v in dt.get('specVariants') or []:
                settle(v, v.get('sources') or [])
            if dt.get('specVariants') and dt.get('specScope') != 'package':
                first = dt['specVariants'][0]
                if first['specs'] != dt.get('specs') and first.get('model') == dt.get('specModel'):
                    dt['specs'] = first['specs']; state['changed'] = True
            if state['changed']:
                dt['specReviewedAt'] = DATE; dt['specReviewStatus'] = status_of(dt)
                log('specs-changed', pid, before=len(before.get('specs') or []), after=len(dt['specs']))
            elif touched:
                dt['specReviewedAt'] = DATE
            if review: log('specs-need-review', pid, models=review)
        details[pid] = dt
    else:
        src = new_dt[pid]
        dt = copy.deepcopy(src)
        if pid.startswith('sg_'):
            g = row['gid']; model = row.get('model')
            rows_new = clean(RAWS.get(model_goods.get(model, g)) or RAWS.get(g) or [])
            dt.update(specs=rows_new, specProductId=pid, specScope='model', specModel=model,
                      specSources=[{'url': row.get('url'), 'kind': 'official-api', 'model': model, 'checkedAt': DATE, 'evidence': 'proddb/raw/wkb_specs.json',
                                    'sha256': hashlib.sha256(json.dumps(RAWS.get(model_goods.get(model, g)) or [], ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()}])
        else:
            cp = dt.get('ecat') or []
            d0 = str(row.get('cdir')); pg = sorted({e['p'] for e in cp if str(e['dir']) == d0}) or [row.get('cpage')]
            dt.update(specProductId=pid, specScope='family' if row.get('nm', 0) > 1 or not row.get('model') else 'model', specModel=row.get('model') or '',
                      specSources=[{'url': ecat_url(d0, pg[0]), 'kind': 'catalog', 'model': '', 'checkedAt': DATE, 'evidence': 'proddb/winmate_products.sqlite:catalog_page', 'dir': d0, 'pages': pg}])
        dt['specs'] = [r for r in clean(dt.get('specs') or [])]
        dt['specReviewedAt'] = DATE; dt['specReviewStatus'] = status_of(dt)
        details[pid] = dt
        log('detail-new', pid, specs=len(dt['specs']))
    dt = details[pid]
    spec_ledger.append(dict(id=pid, name=(row or {}).get('name') or next((c['name'] for c in catalog['products'] if c['id'] == pid), ''), model=(row or {}).get('model', ''),
                            before=len((before or {}).get('specs') or []), after=len(dt.get('specs') or []), options=len(dt.get('specVariants') or []),
                            status=dt.get('specReviewStatus'), changed=(before or {}).get('specs') != dt.get('specs'), scope=dt.get('specScope', ''),
                            sources=dt.get('specSources', []), note=dt.get('specReviewNote', '')))

for cid in cur_ids:
    x = cur_out.setdefault(cid, {})
    srcs = details[cid].get('specSources') or []
    if x.get('gid') in raw_gids or any(s.get('checkedAt') == DATE for s in srcs):
        x['checkedAt'] = RUN_AT
        evidence[cid] = [{'source': 'site', 'goods': x['gid']}] if x.get('gid') in raw_gids else [{'source': s.get('kind'), 'url': s.get('url')} for s in srcs if s.get('checkedAt') == DATE][:3]
    else:
        log('curated-unresolved', cid)

# ── 4. 출력 ──
assert len(rows) + len(cur_ids) == len(details) == len(spec_ledger)
packs = {}
for pid in cur_ids: packs[pid] = pack_of.get(pid, cur_out.get(pid, {}).get('d', 0))
for p in rows: packs[p['id']] = p.get('d', pack_of.get(p['id'], NEW_PACK))
for n in sorted(set(packs.values())):
    json.dump({'items': {pid: details[pid] for pid in details if packs[pid] == n}}, open(os.path.join(STAGE, f'app/data/product-details/d{n:02d}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
total = len(rows) + len(cur_ids)
out = dict(act)
out.update(generated=new['generated'], source=new['source'], famOrder=new['famOrder'], catOrder=new['catOrder'], curated=cur_out, products=rows)
out['counts'] = dict(new['counts'], site_rows=sum(1 for p in rows if p.get('src') == 'site'), catalog_rows=sum(1 for p in rows if p.get('src') == 'catalog'),
                     deprecated=sum(1 for p in rows if p.get('deprecated')), superseded=sum(1 for p in rows if p.get('supersededBy')))
out['specReview'] = dict(date=DATE, total=total, ledger=f'proddb/reviews/{RUN_ID}/product-review.json', previous=act.get('specReview'))
out['dss'] = dict(run=RUN_ID, checkedAt=RUN_AT, ledger='proddb/dss/ledger.json')
json.dump(out, open(os.path.join(STAGE, 'app/data/products_db.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(spec_ledger, open(os.path.join(STAGE, 'review/product-review.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump({'stats': stats, 'changes': changes}, open(os.path.join(STAGE, 'review/apply-changes.json'), 'w'), ensure_ascii=False, indent=0)
json.dump({'evidence': evidence, 'total': total}, open(os.path.join(STAGE, 'review/row-evidence.json'), 'w'), ensure_ascii=False)
from collections import Counter
print('rows', len(rows), 'curated', len(cur_ids), 'total', total, 'stamped', len(evidence), Counter(c['kind'] for c in changes), stats)
