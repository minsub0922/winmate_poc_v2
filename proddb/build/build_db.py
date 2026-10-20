"""Winmate 제품 DB (v2) — samsung.com/sec/business 수집 원본(raw/) + e-카탈로그 텍스트 → SQLite.
v1 winmate-kb 의 제품 계층(category · product_family · product_model · family_category · product_tag · spec · feature · image)을
같은 모양으로 다시 만들고, e-카탈로그 계층(catalog_doc · catalog_page · catalog_mention · catalog_product)을 더한다.
사실 값(이름 · 모델코드 · 스펙 · 문구 · 이미지 주소)은 원문 그대로만 넣는다."""
import json, sqlite3, re, os, sys, hashlib, html, collections
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'raw')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, '..', 'winmate_products.sqlite')
ECAT = os.environ.get('ECAT', os.path.join(HERE, '..', 'ecat'))
if os.path.exists(OUT): os.remove(OUT)
J = lambda f: json.load(open(os.path.join(RAW, f)))
P = J('wkb_products.json'); S = J('wkb_specs.json'); F = J('wkb_features.json'); FM = J('wkb_filter_meta.json')
db = sqlite3.connect(OUT); x = db.execute
x('PRAGMA journal_mode=OFF'); x('PRAGMA synchronous=OFF')
db.executescript(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'schema.sql')).read())
SITE = 'https://www.samsung.com/sec/business/'
def img(u):
    if not u: return None
    u = u.strip()
    if u.startswith('//'): u = 'https:' + u
    elif u.startswith('/'): u = 'https://www.samsung.com' + u
    return u
x('INSERT INTO meta VALUES (?,?)', ('site_fetched_at', P.get('fetchedAt')))
x('INSERT INTO meta VALUES (?,?)', ('site_finished_at', P.get('finishedAt') or P.get('finishedListsAt')))
x('INSERT INTO meta VALUES (?,?)', ('source', 'samsung.com/sec/business (KR) — cxhr/pf/goodsList · xhr/goods/getGoodsSpecList · PDP · 목록 필터 패널'))
# ── 분류 ──
FAMILY = [  # 제품군(앱 탐색기 1단) ← 사이트 목록 경로
  ('디스플레이', ['smart-signage', 'led-signage', 'hotel-tvs', 'tvs', 'monitors', 'display-solution', 'tv-vd-solution']),
  ('공조 · 에어컨', ['dvms', 'cooling-single', 'cooling-for-residential', 'heat-pump-boilers', 'ventilations', 'central-air-conditionings', 'Cold_Chain_System', 'air-conditioners', 'sac-solution', 'ac-clean', 'air-conditioners-care-service']),
  ('모바일 · PC', ['smartphones', 'tablets', 'watches', 'buds', 'rings', 'mobile-accessories', 'xr', 'notebook', 'desktop', 'chromebooks', 'mobile-solution']),
  ('프린팅', ['digital-multifunction-printers', 'general-multifunction-printers', 'multifunction-printers-supplies', 'printing-solution', 'printing-solutions']),
  ('주방 · 리빙 가전', ['refrigerator', 'kimchi-refrigerators', 'dish-washer', 'electric-range', 'micro-wave-ovens', 'qooker', 'water-purifier', 'hood', 'accessories', 'washing-machines', 'dryers', 'airdresser', 'shoedresser', 'air-cleaners', 'vacuum-cleaners']),
  ('조명', ['led-lights']),
  ('오디오', ['harman']),
  ('기타', ['soho']),
]
FAM_OF = {s: f for f, ss in FAMILY for s in ss}
cat_id = {}
for c in P['cats']:
    slug = c['p'].split('/')[0]
    cid = 'cat_' + slug
    cat_id[c['no']] = cid
    x('INSERT OR REPLACE INTO category VALUES (?,?,?,?,?,?,?,?,?)', (cid, c['p'], c.get('title'), c['no'], FAM_OF.get(slug, '기타'), SITE + c['p'] + '/', c.get('count'), json.dumps(c.get('allFilters') or [], ensure_ascii=False), 'site_extra' if c.get('extra') else 'site_gnb'))
# ── 상품 카드 · 모델 ──
meta = FM.get('meta', {})
n_models = 0
for gid in dict.fromkeys(P['cardOrder']):
    p = P['products'][gid]
    fid = 'pf_' + gid
    fe = F.get(gid) or {}
    url = SITE + p['goodsDetailUrl'] if p.get('goodsDetailUrl') else None
    x('INSERT INTO product_family VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (
        fid, gid, cat_id.get(p['catNo']), p.get('dlgtDispClsfEnNm'), p.get('compDispClsfEnNm'), p.get('goodsNm'), p.get('mdlCode'), p.get('mdlNm'), p.get('grpPath'), url,
        json.dumps(p.get('uspDescList') or [], ensure_ascii=False), p.get('saleStatCd'), p.get('sysRegDtm'), p.get('goodsTpCd'), p.get('flagStr') or None,
        fe.get('title'), fe.get('desc'), img(fe.get('ogImage')), fe.get('ctg1'), fe.get('ctg2'), 'T2_official'))
    x('INSERT OR IGNORE INTO family_category VALUES (?,?,?)', (fid, cat_id.get(p['catNo']), 'list'))
    for ap in p.get('alsoIn') or []:
        cno = next((c['no'] for c in P['cats'] if c['p'] == ap), None)
        if cno: x('INSERT OR IGNORE INTO family_category VALUES (?,?,?)', (fid, cat_id[cno], 'list'))
    seen = set()
    for line in (p.get('goodsOptStr') or '').split('\n'):
        f = line.split('|')
        if len(f) > 9 and f[8]:
            mc = f[8]
            if mc in seen: continue
            seen.add(mc)
            ov = html.unescape(f[5]).replace('‎', '').strip()
            x('INSERT OR IGNORE INTO product_model VALUES (?,?,?,?,?,?,?)', (mc, f[9], fid, f[4], ov, 1 if mc == p.get('mdlCode') else 0, f[7]))
            n_models += 1
    if p.get('mdlCode') and p['mdlCode'] not in seen:
        x('INSERT OR IGNORE INTO product_model VALUES (?,?,?,?,?,?,?)', (p['mdlCode'], gid, fid, None, None, 1, None)); n_models += 1
    for k, im in enumerate(p.get('images') or []):
        x('INSERT INTO image_asset (url, family_id, role, seq, alt, source) VALUES (?,?,?,?,?,?)', (img(im['src']), fid, 'card', k, im.get('alt'), 'goodsList'))
# 필터 소속 (목록 필터 패널의 공식 그룹 · 라벨)
cnt = {c['no']: c.get('count') or 0 for c in P['cats']}
n_skip = 0
for cno, fl in (P.get('filters') or {}).items():
    m = meta.get(cno, {})
    for f, gids in fl.items():
        if f not in m and cnt.get(cno) and len(gids) >= cnt[cno]:
            n_skip += 1; continue  # 패널에 없는 필터값 → 목록 전체가 그대로 돌아옴(v1 빌드와 같은 처리)
        mm = m.get(f) or {}
        for g in gids:
            if g in P['products']:
                x('INSERT OR IGNORE INTO product_tag VALUES (?,?,?,?,?)', ('pf_' + g, cat_id.get(cno), f, mm.get('group'), mm.get('label')))
x('INSERT INTO meta VALUES (?,?)', ('filters_skipped_whole_list', str(n_skip)))
# ── 스펙 ──
var = P.get('variants') or {}
for gid, rows in S.items():
    fam = 'pf_' + gid if gid in P['products'] else ('pf_' + var[gid]['parentGoodsId'] if gid in var else None)
    mc = (P['products'].get(gid) or {}).get('mdlCode') or (var.get(gid) or {}).get('mdlCode')
    for k, (g, a, v) in enumerate(rows):
        x('INSERT INTO spec_value (goods_id, model_code, family_id, seq, group_name, attr_name, value_raw) VALUES (?,?,?,?,?,?,?)', (gid, mc, fam, k, g, a, v))
# ── PDP 특장점 ──
for gid, fe in F.items():
    fid = 'pf_' + gid
    for k, b in enumerate(fe.get('feats') or []):
        cur = x('INSERT INTO feature_block (family_id, seq, component_type, headline, sub, body, disclaimer, n_images) VALUES (?,?,?,?,?,?,?,?)',
                (fid, k, b.get('type'), b.get('h'), b.get('sub'), b.get('desc') or None, b.get('disc') or None, len(b.get('imgs') or [])))
        bid = cur.lastrowid
        for j, it in enumerate(b.get('items') or []):
            x('INSERT INTO feature_item (block_id, seq, headline, body) VALUES (?,?,?,?)', (bid, j, it.get('h'), it.get('desc') or None))
        for j, im in enumerate(b.get('imgs') or []):
            x('INSERT INTO image_asset (url, url_mobile, family_id, role, seq, alt, block_id, source) VALUES (?,?,?,?,?,?,?,?)', (img(im.get('src')), img(im.get('mo_src')), fid, 'feature', j, im.get('alt') or None, bid, 'pdp'))
db.commit()
# ── e-카탈로그 ──
CATS = {c[2]: c for c in json.load(open(os.path.join(ECAT, 'catalogs.json')))}
tdir = os.path.join(ECAT, 'text')
docs = {}
for fn in sorted(os.listdir(tdir)) if os.path.isdir(tdir) else []:
    d = json.load(open(os.path.join(tdir, fn))); docs[d['dir']] = d
    x('INSERT INTO catalog_doc VALUES (?,?,?,?,?,?,?)', (d['dir'], d['title'], d.get('docTitle'), d.get('group'), d.get('tab'), d['pages'], f"https://samsung.aiibook.net/b2b/ecatalog5.php?Dir={d['dir']}"))
    for pg, t in d['text'].items():
        x('INSERT INTO catalog_page VALUES (?,?,?,?)', (d['dir'], int(pg), t, f"https://samsung.aiibook.net/b2b/catImage/{d['dir']}/{int(pg):03d}.jpg"))
# 모델코드 언급: 사이트 모델코드(정확) + 마케팅 모델명(접두) 를 카탈로그 쪽 텍스트에서 찾는다
models = {r[0]: r[1] for r in x('SELECT model_code, family_id FROM product_model')}
norm = lambda s: re.sub(r'[^A-Z0-9]', '', s.upper())
idx = {}
for mc, fid in models.items():
    idx.setdefault(norm(mc), set()).add((mc, fid))
TOK = re.compile(r'(?<![A-Za-z0-9])([A-Z]{1,4}[-]?[0-9]{2,4}[A-Z0-9][A-Z0-9-]{2,14})(?![A-Za-z0-9])')
n_ment = 0
for dd, d in docs.items():
    for pg, t in d['text'].items():
        for m in TOK.finditer(t):
            s = m.group(1).rstrip('-'); k = norm(s)
            hit = idx.get(k)
            method = 'exact'
            if not hit:
                # 카탈로그는 국가 접미(KR · XKR · EN …)나 색상 코드를 뺀 기본 코드로 적는 일이 많다 → 사이트 코드가 그 코드로 시작하면 대응
                if len(k) >= 7:
                    cands = [(mc, fid) for kk, v in idx.items() if kk.startswith(k) for (mc, fid) in v]
                    fams = {f for _, f in cands}
                    if cands and len(fams) <= 2: hit = set(cands); method = 'prefix'
            sn = t[max(0, m.start() - 60): m.end() + 60].replace('\n', ' ')
            if hit:
                for mc, fid in sorted(hit)[:3]:
                    x('INSERT INTO catalog_mention VALUES (?,?,?,?,?,?,?)', (dd, int(pg), s, mc, fid, method, sn)); n_ment += 1
            else:
                x('INSERT INTO catalog_mention VALUES (?,?,?,?,?,?,?)', (dd, int(pg), s, None, None, 'unmatched', sn)); n_ment += 1
# 카탈로그에서 뽑은 제품(사이트에 없는 것 포함) — extract/*.json (에이전트가 원문에서만 옮기고 원문 대조한 목록)
# 사이트 대응: 모델코드 정확 일치 → 카탈로그 코드가 사이트 코드의 앞부분(국가 · 색상 접미 생략) → 사이트 코드 안에 포함(SL- 같은 접두 생략) → 와일드카드(*) 앞부분
exdir = os.path.join(ECAT, 'extract')
keys = list(idx.keys())
def match_model(m):
    w = '*' in m
    k = norm(m.split('*')[0] if w else m)
    if not k or len(k) < 5: return set(), None
    if not w and k in idx: return {f for _, f in idx[k]}, 'exact'
    if len(k) >= 6:
        c = {f for kk in keys if kk.startswith(k) for _, f in idx[kk]}
        if c and len(c) <= 3: return c, 'wildcard' if w else 'prefix'
    if not w and len(k) >= 7:
        c = {f for kk in keys if k in kk for _, f in idx[kk]}
        if c and len(c) <= 2: return c, 'contains'
    return set(), None
def nname(t):
    t = re.sub(r'\(.*?\)', ' ', (t or '').lower())
    t = re.sub(r'삼성|samsung|자급제|시리즈|series', ' ', t)
    return re.sub(r'[^0-9a-z가-힣+]', '', t)
fam_names = {r[0]: (nname(r[1]), r[2]) for r in x('SELECT f.id, f.name_ko, c.family_group FROM product_family f JOIN category c ON c.id=f.category_id')}
fam_full = {r[0]: r[1] or '' for r in x('SELECT id, name_ko FROM product_family')}
# 원문 기호 교정(쪽 이미지로 확인한 표기, ecat/corrections.json) — 추출 텍스트에서 '~ / ( )' 가 빠진 값
CORR = {}
cfile = os.path.join(ECAT, 'corrections.json')
if os.path.exists(cfile):
    for c in json.load(open(cfile)): CORR[(c['id'], c['attr'])] = c
n_corr = 0
n_cp = 0
for fn in sorted(os.listdir(exdir)) if os.path.isdir(exdir) else []:
    if not fn.endswith('.json'): continue
    for it in json.load(open(os.path.join(exdir, fn))):
        sp2 = []
        for a, v in it.get('specs') or []:
            c = CORR.get((it['id'], a))
            if c and (c.get('old') in (None, v)): v = c['new']; n_corr += 1
            sp2.append([a, v])
        it['specs'] = sp2
        mcs = list(dict.fromkeys(m.strip() for m in it.get('models') or [] if m and m.strip()))
        fams = collections.Counter(); hit = {}
        for m in mcs:
            fs, how = match_model(m)
            if fs:
                hit[m] = how
                for f in fs: fams[f] += 1
        how_name = None
        if not fams:  # 모델코드가 없거나 안 맞으면 이름으로(같은 제품군 안에서, 4곳 이하일 때만)
            nn = nname(it['name'])
            if len(nn) >= 5:
                acc = re.compile(r'커버|케이스|키보드|충전|어댑터|필름|펜$|스트랩|브라켓|스탠드|거치')
                c = [f for f, (fnn, grp) in fam_names.items() if nn in fnn and (not it.get('family') or grp == it.get('family')) and not (acc.search(fam_full[f]) and not acc.search(it['name']))]
                if 0 < len(c) <= 4:
                    for f in c: fams[f] += 0.5 + 0.4 * (len(nn) / max(len(fam_names[f][0]), 1))
                    how_name = 'name'
        fam = fams.most_common(1)[0][0] if fams else None
        # 공용 부품(실외기 · 판넬 · 리모컨) 코드 한두 개만 맞은 경우는 같은 제품이 아님 — 3개 이상 · 모델의 1/3 이상 · 이름이 서로 들어 있음 중 하나여야 대응
        if fam and not how_name and mcs:
            nn, fnn = nname(it['name']), fam_names[fam][0]
            STOPT = {'냉난방', '냉방전용', '냉방', '전용', '겸용', '싱글', '시스템에어컨', '무풍', '에어컨', '삼성', '냉장고', '세트', 'set', 'wi-fi', '내장형', '실내기', '실외기', '용'}
            tok = lambda t: {w for w in re.split(r'[\s/,()·]+', re.sub(r'\(.*?\)', ' ', (t or '').lower())) if len(w) >= 2 and w not in STOPT}
            share = bool(tok(it['name']) & tok(fam_full[fam]))
            if len(hit) < 3 and len(hit) / len(mcs) < 0.3 and not share and not (len(nn) >= 3 and (nn in fnn or fnn in nn)): fam = None
        x('INSERT INTO catalog_product VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', (it['id'], it['name'], it.get('series'), json.dumps(mcs, ensure_ascii=False), it.get('category'), it.get('family'),
           json.dumps(it.get('specs') or [], ensure_ascii=False), json.dumps(it.get('features') or [], ensure_ascii=False), str(it['dir']), json.dumps(it.get('pages') or [], ensure_ascii=False), fam, it.get('note'),
           json.dumps([m for m in mcs if m not in hit], ensure_ascii=False)))
        for f, n in fams.items(): x('INSERT INTO catalog_product_family VALUES (?,?,?)', (it['id'], f, n))
        n_cp += 1
db.commit()
# ── 카탈로그 전용 제품 · 큐레이션 항목의 실제 사진(e-카탈로그 쪽에서 자른 영역, ecat/photos.json) ──
sys.path.insert(0, HERE)
from photos_db import write_photos
write_photos(db)
from imglib_db import write_imglib  # 제품 이미지 라이브러리(imglib/index.json) → lib_image · lib_image_product · lib_image_fts
write_imglib(db)
# ── 요약 ──
for t in ['category', 'product_family', 'product_model', 'product_tag', 'spec_value', 'feature_block', 'feature_item', 'image_asset', 'catalog_doc', 'catalog_page', 'catalog_mention', 'catalog_product', 'catalog_product_family', 'product_photo']:
    n = x(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    x('INSERT INTO meta VALUES (?,?)', ('count.' + t, str(n)))
    print(f'{t:18s} {n}')
x('INSERT INTO meta VALUES (?,?)', ('catalog_spec_corrections', str(n_corr)))
print('catalog spec corrections', n_corr)
db.commit(); db.execute('VACUUM'); db.close()
