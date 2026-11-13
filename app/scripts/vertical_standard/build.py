# -*- coding: utf-8 -*-
"""Build the 44 vertical standard proposals (scenarios · fills · story) from
vertical_space_product.json + vertical_space_solution.json + authored content (content_*.txt)."""
import json, re, math, glob, os, collections
import prod, sols, scene_match
from polite import polite
from sols import SOL, media

from paths import ROOT, HERE, OUT
SCH = json.load(open(OUT + '/schema.json'))
SCHEMA, SOLS_L, WHY_IMG = SCH['schema'], SCH['sols'], SCH['why_img']
VP = json.load(open(ROOT + '/app/data/vertical_space_product.json'))
VS = json.load(open(ROOT + '/app/data/vertical_space_solution.json'))
# 표준 건물 조감도: vertical → {space no: floor} (bld_forms.py)
BLD_FLOOR = {}
if os.path.exists(OUT + '/bld_floors.json'):
    for _f in json.load(open(OUT + '/bld_floors.json'))['floors']:
        for _r in _f['rooms']: BLD_FLOOR.setdefault(_f['vid'], {})[_r['space']] = _f['level']
CAT = json.load(open(ROOT + '/app/data/catalog.json'))
MEDIA = json.load(open(ROOT + '/app/data/media.json'))
# 공간 장 왼쪽 사진: 공간 id → 사진 주소 — 목차 템플릿(공간별 가치 제안 여정)과 같은 표
SPACE_PH = json.load(open(ROOT + '/build/toc/space_photos.json'))
MEDIA_LABEL = {g[0]: g[2] for c in MEDIA['case'].values() for g in c.get('g', [])}
CASE = {str(c['id']): c for c in CAT['cases']}
SOLCAT = {s['id']: s for s in VS['solution_catalog']}
VSOL = {v['id']: v for v in VS['verticals']}
GROUPS = VP['meta']['groups']
CATGROUP = {c['id']: g['id'] for g in VP['product_taxonomy'] for c in g.get('categories', [])}
P_IDS = {p['id'] for p in CAT['products']} | {p['id'] for p in json.load(open(ROOT + '/app/data/products_db.json'))['products']}
S_IDS = {s['id'] for s in CAT['solutions']}

IND = {'SF': 'VN', 'RG': 'VN', 'MB': 'VN', 'MI': 'PB'}
PH = {'FB': 'fb', 'RT': 'rt', 'SV': 'sv', 'HT': 'ht', 'TP': 'tp', 'VN': 'vn', 'AD': 'ad', 'OF': 'of', 'RS': 'rs', 'ID': 'id', 'ED': 'ed', 'PB': 'pb',
      'MD': 'md', 'MF': 'mf', 'FN': 'fn', 'OE': 'oe', 'SF': 'vn', 'RG': 'vn', 'MB': 'vn', 'MI': 'pb'}
CASES = {
    'fb_qsr': ['1490', '50'], 'fb_cafe': ['3727', '159'], 'fb_rest': ['2560', '1645'], 'rt_mall': ['1761', '49'], 'rt_hyper': ['122', '45'],
    'rt_flag': ['2813', '2081'], 'rt_small': ['3541', '116'], 'sv_unmanned': ['145', '59'], 'sv_screen': ['3262', '3668'], 'sv_laundry': ['2151', '2172'],
    'sv_beauty': ['60', '56'], 'ht_large': ['3080', '101'], 'ht_mid': ['42', '1'], 'ht_stay': ['3625', '82'], 'tp_park': ['1817', '157'],
    'tp_museum': ['2549', '39'], 'vn_stadium': ['12', '3268'], 'vn_cinema': ['3657', '2045'], 'sf_fitness': ['2202', '2891'], 'ad_ooh': ['83', '32'],
    'of_hq': ['3716', '47'], 'of_sme': ['3226', '89'], 'of_cowork': ['3310', '155'], 'rs_apt': ['3125', '7'], 'rs_officetel': ['3349', '67'],
    'rs_senior': ['3656', '3683'], 'id_partner': ['3696', '2679'], 'ed_univ': ['3370', '34'], 'ed_k12': ['3967', '130'], 'ed_academy': ['153', '73'],
    'pb_agency': ['2349', '142'], 'pb_transport': ['156', '1958'], 'mi_military': ['2962', '152'], 'md_tertiary': ['76', '16'], 'md_hospital': ['77', '16'],
    'md_clinic': ['2105', '162'], 'md_ltc': ['2538', '3683'], 'mf_factory': ['3035', '1451'], 'mf_logistics': ['3088', '9'], 'fn_bank': ['1892', '98'],
    'fn_hq': ['2129', '88'], 'oe_telco': ['158', '1801'], 'rg_church': ['2737', '97'], 'mb_studio': ['2366', '128'],
}
WHY_ROWS = [('Samsung Business', 'L_VS_WHY_1'), ('최고의 전문가 집단', 'L_VS_WHY_2'), ('통합 오퍼링', 'L_VS_WHY_3'), ('비즈니스 고객 맞춤 전문 프로세스', 'L_VS_WHY_4'), ('브랜드 가치', 'L_VS_WHY_5')]
SAMSUNG_BLDG = ('img/fill/ais-a.json#6', '삼성전자 수원 디지털시티 사옥과 SAMSUNG 조형물')
TECHNICIAN = ('img/ph/svc-technician.jpg', '시스템에어컨 점검 엔지니어')


# ------------------------------------------------------------------ text width (rough, for nowrap checks)
def em(ch):
    o = ord(ch)
    if 0xAC00 <= o <= 0xD7A3 or 0x3130 <= o <= 0x318F: return 1.0
    if ch == ' ': return 0.26
    if ch in '·•': return 0.32
    if ch in '.,:;\'"|!()[]/-–—': return 0.36 if ch not in '—–' else 0.9
    if ch.isdigit(): return 0.57
    if ch.isupper(): return 0.66
    if ch.isalpha(): return 0.55
    return 0.8


def width(s, px, ls=0.0):
    return sum((em(c) + ls) * px for c in s)


def fits(s, px, w, ls=0.0):
    return all(width(line, px, ls) <= w for line in str(s).split('\n'))


def clip(s, px, w, suffix='…'):
    s = str(s)
    if fits(s, px, w): return s
    while s and not fits(s + suffix, px, w): s = s[:-1]
    return s.rstrip(' ·,') + suffix


def wrap_lines(s, px, w):
    """estimated number of lines when wrapping s (word-keep) at width w"""
    n = 0
    for para in str(s).split('\n'):
        cur, lines = 0.0, 1
        for word in para.split(' '):
            ww = width(word, px) + 0.26 * px
            if cur + ww > w and cur > 0: lines += 1; cur = ww
            else: cur += ww
        n += lines
    return n


# ------------------------------------------------------------------ authored content
def parse_content():
    V, cur = {}, None
    for fn in sorted(glob.glob(HERE + '/content_*.txt')):
        for raw in open(fn, encoding='utf-8'):
            line = raw.rstrip('\n')
            if not line or line.startswith('#'): continue
            f = line.split('|')
            if f[0].startswith('@'):
                vid = f[0][1:]
                cur = V[vid] = {'id': vid, 'short': f[1], 'ai': f[2], 'place': f[3], 'who': f[4], 'cover': f[5], 'lead': f[6], 'others': f[7].split(','), 'P': []}
            elif f[0] == 'Q':
                assert len(f) == 10, line
                cur['P'].append({'quote': f[1], 'tech': f[2], 'note': f[3], 'tkey': f[4], 'prop': f[5], 'head': f[6], 'sub': f[7], 'chips': [f[8], f[9]], 'subs': []})
            elif f[0] == 'S':
                assert len(f) == 7, line
                key, _, tag = f[2].partition('/')
                cur['P'][-1]['subs'].append({'title': f[1], 'key': key, 'tag': tag or key_tag(key), 'desc': f[3], 'steps': f[4:7]})
    for v in V.values():
        assert len(v['P']) == 3 and all(len(p['subs']) == 2 for p in v['P']), v['id']
    return V


def key_tag(key):
    if key in SOL: return SOL[key][0]
    return prod.SHORT.get(key, key)


def key_img(key, small=False):
    """image for a product category or a solution key → (src, fit, name)"""
    if key in SOL:
        if small and key in sols.THUMB: return media(sols.THUMB[key]), 'cover', SOL[key][0]
        lst = sols.IMGS.get(key, {}).get('img0', [])
        src = lst[0] if lst else None
        if isinstance(src, int): src = media(src)
        return src, 'contain', SOL[key][0]
    if key in prod.P:
        return prod.image_of(key), ('cover' if key in prod.PHOTO else 'contain'), prod.P[key][1]
    raise KeyError(key)


def img(src, name, fit='cover', pos=None):
    d = {'src': src, 'fit': fit, 'name': name, 'keep': True}
    if pos: d['pos'] = pos
    return d


def space_photo(sp):
    """공간 장 왼쪽 공간 사진 — 이름은 사진 묶음의 설명(없으면 공간 이름)"""
    src = SPACE_PH[sp['id']]
    m = re.fullmatch(r'img/media/(g0|g1|t)\.json#(\d+)', src)
    name = MEDIA_LABEL.get(('g0', 'g1', 't').index(m.group(1)) * 10000 + int(m.group(2))) if m else None
    return img(src, name or f'{sp["name"]} 공간 사진')


# ------------------------------------------------------------------ media helpers
def case_photos(cid):
    g = MEDIA['case'].get(cid, {}).get('g', [])
    out = []
    for code, kind, label, w, h, *_ in g:
        if kind in ('s', 'e', 'p'):
            out.append({'src': media(code), 'name': label, 'w': w, 'h': h, 'kind': kind})
    return out


def ph_pool(group):
    pre = PH[group]
    files = sorted(os.listdir(ROOT + '/app/data/static/img/ph'))
    return [{'src': 'img/ph/' + f, 'name': f[:-4], 'w': 1, 'h': 1, 'kind': 'ph'} for f in files if f.startswith(pre + '-')]


# ------------------------------------------------------------------ slide fill builder
def fill(f, vals=None, imgs=None, r=None, raw_t=None):
    sch = SCHEMA[f]
    t = {}
    for i, lab in sch['labels'].items():
        t[str(i)] = lab
    # one-line slots: when a value does not fit, drop parenthetical notes (e.g. '(Server)') from it and from its
    # siblings (same key with another number, e.g. i0t · i1t) so a set of titles reads alike; clip what still overflows
    vals = dict(vals or {})
    box = sch.get('box', {})
    one = lambda k, v: k in box and box[k][2] and isinstance(v, str) and '\n' not in v
    over = {re.sub(r'\d+', '#', k) for k, v in vals.items() if one(k, v) and not fits(v, box[k][1], box[k][0])}
    for k, v in list(vals.items()):
        if one(k, v) and re.sub(r'\d+', '#', k) in over:
            v0, v = v, re.sub(r'\s*\([^)]*\)', '', v).strip()
            vals[k] = v if fits(v, box[k][1], box[k][0]) else clip(v, box[k][1], box[k][0])
            if os.environ.get('DEBUG_FIT') and vals[k] != v0: print('FIT', f, k, repr(v0), '->', repr(vals[k]))
    for k, v in vals.items():
        if k not in sch['keys']: raise KeyError(f'{f}: no text key {k}')
        t[str(sch['keys'][k])] = v
    if raw_t: t.update({str(k): v for k, v in raw_t.items()})
    missing = [i for i in range(sch['nT']) if not str(t.get(str(i), '')).strip()]
    if missing:
        inv = {v: k for k, v in sch['keys'].items()}
        raise ValueError(f'{f}: missing text slots {[inv.get(i, i) for i in missing]}')
    im = {}
    for k, v in (imgs or {}).items():
        if k not in sch['ikeys']: raise KeyError(f'{f}: no image key {k}')
        im[str(sch['ikeys'][k])] = v
    if len(im) != sch['nI']:
        raise ValueError(f'{f}: images {sorted(im)} of {sch["nI"]}')
    out = {'f': f, 't': {k: t[k] for k in sorted(t, key=int)}, 'img': {k: im[k] for k in sorted(im, key=int)}}
    if r: out['r'] = r
    return out


# ------------------------------------------------------------------ per-vertical derivations
def space_products(sp, first=None):
    """short product names of a space in its own order (featured category first), solutions skipped"""
    names = []
    for c in ([first] if first else []) + list(sp['products']):
        if c.startswith('s_'): continue
        n2 = prod.SHORT.get(c)
        if n2 and n2 not in names: names.append(n2)
    return names


def featured(vp, vs):
    """space마다 (대표 제품, 그 제품이 실제로 나오는 시나리오 문장 또는 None) — scene_match.pick"""
    by = {sp['id']: sp for sp in vs['spaces']}
    used, out = set(), []
    for sp in vp['spaces']:
        c, scene = scene_match.pick(sp, (by.get(sp['id']) or {}).get('solutions', []), used)
        used.add(c)
        out.append((c, scene))
    return out


def vertical_solutions(vid):
    vs = VSOL[vid]
    order, spaces, feats, scen = [], collections.defaultdict(list), collections.Counter(), {}
    for sp in vs['spaces']:
        for s in sp.get('solutions', []):
            sid = s['solution']
            if sid not in order: order.append(sid)
            spaces[sid].append(sp['name'])
            feats.update(s['features'])
            prev = scen.get(sid)
            if not prev or len(s['features']) > prev[0]: scen[sid] = (len(s['features']), s['scenario'], sp['name'])
    # most-used first (by spaces), stable
    order.sort(key=lambda s: -len(spaces[s]))
    return order, spaces, feats, scen


def clean(name):
    return re.sub(r'\s+', ' ', name).strip()


def chip_name(f):
    n = f['name']
    return {'ECG(심전도)·IHRN(불규칙 심장 리듬)': 'ECG · 심장 리듬', '활동(운동) 기록': '활동 · 운동 기록'}.get(n, re.sub(r'\(.*?\)', '', n).strip())


def sol_items(sid, mode, n, used):
    cat = SOLCAT[sid]
    if mode == 'group':
        groups = list(enumerate(cat['groups']))
        if sid == 's_health': groups = [x for x in groups if not x[1]['id'].endswith('.data')]
        sc = lambda g: sum(used[f['id']] for f in g['features'])
        chosen = sorted(groups, key=lambda x: (-sc(x[1]), x[0]))[:n]
        chosen.sort(key=lambda x: x[0])
        items = []
        for _, g in chosen:
            fs = [f for f in g['features'] if used[f['id']]]
            fs.sort(key=lambda f: -used[f['id']])
            for f in g['features']:
                if len(fs) >= 3: break
                if f not in fs and f.get('status') != 'planned': fs.append(f)
            body = '\n'.join('· ' + clean(re.sub(r'\s*\((?:어드밴스|ENTERPRISE|b\.IoT ENERGY)\)', '', f['name'])) for f in fs[:3])
            items.append((clean(g['name']), body))
        return items
    feats = [(gi, fi, g, f) for gi, g in enumerate(cat['groups']) for fi, f in enumerate(g['features']) if f.get('status') != 'planned']
    if sid == 's_meeting':
        book = [x for x in feats if x[2]['id'].endswith('.book')]
        ops = sorted([x for x in feats if not x[2]['id'].endswith('.book')], key=lambda x: (-used[x[3]['id']], x[0], x[1]))
        chosen = book[:3] + ops[:1]
    else:
        chosen = sorted(feats, key=lambda x: (-used[x[3]['id']], x[0], x[1]))[:n]
        chosen.sort(key=lambda x: (x[0], x[1]))
    out = []
    for gi, fi, g, f in chosen:
        d = sols.DESC.get(f['id']) or f.get('desc') or g['name']
        d = d.strip("'")
        out.append((clean(f['name']), d))
    return out


# ------------------------------------------------------------------ deck
class Deck:
    def __init__(self, v):
        self.v = v
        self.slides = []  # [fill, stage, role]

    def add(self, stage, role, fl):
        self.slides.append((stage, role, fl))
        return len(self.slides)


def build_vertical(v):
    vid = v['id']
    vp = next(x for x in VP['verticals'] if x['id'] == vid)
    vs = VSOL[vid]
    group = vp['group']
    ind = IND.get(group, group)
    N = len(vp['spaces'])
    picks = featured(vp, vs)
    feat = [c for c, _ in picks]
    order, s_spaces, used, scen = vertical_solutions(vid)
    K = len(order)
    short, ai, place, who = v['short'], v['ai'], v['place'], v['who']
    ch4 = ai[3:] + ' 솔루션' if ai.startswith('AI ') else ai + ' 솔루션'
    foot = f'{short} · {ai} 표준 제안서'
    cases = CASES[vid]
    building = N > 6
    bird_f = f'L_VS_BIRD_{"B" if building else "S"}{N}'

    # ---------------- photos
    # 공간 장 왼쪽 사진은 그 장에서만 — 표지 · 목차 · 간지 사진 후보에서 빼고, 도입사례 사진에서는 사진이 모자랄 때만 뒤에서 쓴다
    space_srcs = {SPACE_PH[sp['id']] for sp in vp['spaces']}
    case_imgs = {}
    for cid in cases:
        ph = case_photos(cid)
        ph = [p for p in ph if p['src'] not in space_srcs] + [p for p in ph if p['src'] in space_srcs]
        land = sorted([p for p in ph if p['w'] >= p['h'] * 1.2], key=lambda p: (p['src'] in space_srcs, -(p['w'] * p['h']) - (4e5 if re.search(r'전경|외관|공간|매장|로비|홀|실내|내부', p['name']) else 0)))
        big = land[0] if land else ph[0]
        rest = [p for p in ph if p is not big]
        case_imgs[cid] = [big] + rest[:3]
        while len(case_imgs[cid]) < 4: case_imgs[cid].append(big)
    used_src = {p['src'] for c in case_imgs.values() for p in c}
    GOOD = re.compile(r'매장|로비|외관|전경|공간|사무실|객실|라운지|홀|실내|내부|교실|강의|병원|병실|병동|공장|창고|경기장|극장|상영관|전시|단지|거실|주방|카페|식당|레스토랑|무대|스튜디오|예배당|센터|쇼룸|청사|역사|대합실|관제|사옥|캠퍼스|도서관|학교|매장 안|입구')
    BAD = re.compile(r'클로즈업|제품 컷|로고|버튼|패널|리모컨|화면 근접|라벨|설명서|규격|치수|아이콘|확대')
    def scene_score(p):
        sc = p['w'] * p['h'] / 1e5
        if GOOD.search(p['name']): sc += 6
        if BAD.search(p['name']): sc -= 10
        if p['kind'] == 'e': sc += 2
        return sc
    pool = []
    for cid in cases:
        pool += [p for p in sorted(case_photos(cid), key=lambda p: -scene_score(p)) if p['src'] not in used_src and p['w'] >= p['h'] * 1.1 and scene_score(p) > 0]
    pool += ph_pool(group)
    pool.append({'src': f'img/cover/{ind}.jpg', 'name': f'{GROUPS.get(group, group)} 대표 사진', 'w': 1, 'h': 1, 'kind': 'cover'})
    seen, photos = set(space_srcs), []
    for p in pool:
        if p['src'] not in seen: seen.add(p['src']); photos.append(p)
    pick_i = [0]

    def photo():
        p = photos[pick_i[0] % len(photos)]
        pick_i[0] += 1
        return img(p['src'], p['name'])

    # ---------------- pages (computed after assembly; placeholders first)
    D = Deck(v)
    PAGE = {}

    def mark(name):
        PAGE[name] = len(D.slides) + 1

    # cover
    cover_p = photo()
    t3a = f'{short}\n{ai} 제안서'
    t3 = t3a if fits(t3a, 48, 505, -0.03) else f'{ai}\n표준 제안서'
    t4 = v['cover'] if t3 == t3a else f'{short} — {v["cover"]}'
    D.add('open', f'표지 · {ai}', {'f': 'L_C01', 't': {'1': '고객사 로고', '2': 'BUSINESS PROPOSAL', '3': t3, '4': t4, '5': '삼성전자 한국총괄 B2B 영업팀', '6': '2026. 11', '7': 'SAMSUNG'},
                                   'img': {'0': cover_p}})
    mark('toc'); D.add('context', '여섯 장(章) 목차 · 사진 카드', None)
    mark('div1'); D.add('context', '간지 · 01 Overview', None)
    mark('dss'); D.add('context', 'Device · Solution · Service 도식', None)
    mark('div2'); D.add('value', f'간지 · 02 {ai}', None)
    mark('needs'); D.add('value', '니즈 · 기술 · 제안 매트릭스', None)
    for k in range(3):
        mark(f'core{k}'); D.add('value', f'{v["P"][k]["prop"]} — {v["P"][k]["chips"][0]} · {v["P"][k]["chips"][1]}', None)
    mark('div3'); D.add('space', '간지 · 03 공간별 제안', None)
    mark('bird'); D.add('space', ('표준 건물 조감도' if building else '공간 조감도') + f' · {N}개 공간 범례', None)
    for i, sp in enumerate(vp['spaces']):
        mark(f'sp{i}'); D.add('space', f'{sp["name"]} — {prod.SHORT[feat[i]]}', None)
    mark('map'); D.add('space', f'{ai} Map — 공간 × 제품', None)
    mark('div4'); D.add('build', f'간지 · 04 {ch4}', None)
    for j, sid in enumerate(order):
        mark(f'sol{j}'); D.add('build', f'{SOL[sid][0]} — 기능 · 적용 공간 · 대표 장면', None)
    mark('div5'); D.add('proof', '간지 · 05 도입사례', None)
    for j, cid in enumerate(cases):
        mark(f'case{j}'); D.add('proof', f'도입사례 · {CASE[cid]["cust"]}', None)
    mark('div6'); D.add('proof6', '간지 · 06 Why Samsung', None)
    for j, (nm, f) in enumerate(WHY_ROWS):
        mark(f'why{j}'); D.add('proof6', 'Why Samsung · ' + nm, None)
    mark('end'); D.add('proof6', 'SAMSUNG 브랜드로 마감', None)
    total = len(D.slides)

    def pg(name): return PAGE[name]
    def rng(a, b): return str(pg(a)) if pg(a) == pg(b) else f'{pg(a)}–{pg(b)}'
    def F(n): return {'cust': '고객사 로고', 'foot': foot, 'page': f'CONFIDENTIAL · {n}'}

    fills = [None] * total
    fills[0] = D.slides[0][2]

    def put(name, fl):
        fills[PAGE[name] - 1] = fl

    # ---------------- images used in several places
    bird_src = f'/assets/vertical-std/{vid}.webp'
    sol_first_img = None
    for sid in order:
        if sid in sols.IMGS:
            c = sols.GROUP_IMGS.get((sid, group), sols.IMGS[sid]).get('img0', sols.IMGS[sid]['img0'])[0]
            sol_first_img = media(c) if isinstance(c, int) else c
            break
    case0 = case_imgs[cases[0]][0]
    p_ov, p_ai, p_sp, p_sol = photo(), photo(), photo(), photo()
    case_extra = [p for p in case_photos(cases[1]) if p['src'] not in used_src and p['src'] not in space_srcs]
    fb = case_imgs[cases[1]][1]  # 사례 사진이 모자라면 사례 장의 둘째 사진 — 그게 공간 장 사진이면 일반 사진 후보에서
    p_case = img(case_extra[0]['src'], case_extra[0]['name']) if case_extra else (photo() if fb['src'] in space_srcs else img(fb['src'], fb['name']))

    # ---------------- TOC
    props = [p['prop'] for p in v['P']]
    sol_names = [SOL[s][0] for s in order]
    toc_tags = [
        'Device · Solution · Service',
        ' · '.join(props),
        ' · '.join(sp['name'] for sp in vp['spaces'][:4]) + (f' 외 {N - 4}곳' if N > 4 else ''),
        ' · '.join(sol_names[:3]) + (f' 외 {K - 3}종' if K > 3 else ''),
        ' · '.join(CASE[c]['cust'] for c in cases),
        '전문가 · 오퍼링 · 프로세스 · 브랜드',
    ]
    toc_t = ['Overview', ai, '공간별 제안', ch4, '도입사례', 'Why Samsung']
    toc_s = [f'삼성 AI 비즈니스가 {place}에 주는 가치', f'{who}의 니즈마다 AI 기술로 답하는 세 가지 제안', f'{N}개 공간과 공간마다의 대표 제품',
             f'{K}개 솔루션으로 운영은 가볍게', '같은 업종의 삼성 공식 도입사례', '끝까지 책임지는 비즈니스 파트너']
    toc_p = ['p.' + rng('div1', 'dss'), 'p.' + rng('div2', 'core2'), 'p.' + rng('div3', 'map'), 'p.' + rng('div4', f'sol{K - 1}'), 'p.' + rng('div5', 'case1'), 'p.' + rng('div6', 'end')]
    toc_img = [p_ov, p_ai, img(bird_src, f'{short} ' + ('표준 건물 조감도' if building else '공간 조감도')), img(sol_first_img or p_sol['src'], f'{SOL[order[0]][0]} 화면'), img(case0['src'], case0['name']), img(*SAMSUNG_BLDG)]
    vals = {'eb': 'CONTENTS', 'title': '목차', 'sub': f'{short} · {ai} 표준 제안서 · 6개 장', **F(pg('toc'))}
    ims = {}
    for k in range(6):
        vals[f'c{k}t'] = clip(toc_t[k], 20, 252)
        vals[f'c{k}p'] = toc_p[k]
        vals[f'c{k}s'] = clip(toc_s[k], 16, 368)
        vals[f'c{k}tags'] = clip(toc_tags[k], 14, 368)
        ims[f'c{k}img'] = toc_img[k]
    put('toc', fill('L_VS_TOC', vals, ims))

    # ---------------- dividers
    def divider(name, n, chap, title, sub, rows, bg):
        vals = {'cust': '고객사 로고', 'chapter': f'0{chap} / 06', 'title': title, 'sub': sub, 'page': f'CONFIDENTIAL · {pg(name)}'}
        for r, (item, p) in enumerate(rows):
            vals[f'r{r}'] = clip(item, 16, 290)
            vals[f'r{r}p'] = p
        put(name, fill(f'L_VS_DIV_R{n}', vals, {'bg': bg}))

    divider('div1', 1, 1, 'Overview', clip(f'삼성 AI 비즈니스가 {short}에 주는 가치', 18, 700), [('삼성 AI 비즈니스', str(pg('dss')))], p_ov)
    divider('div2', 4, 2, ai, clip(f'{who}의 니즈마다 삼성 AI 기술로 답하는 세 가지 제안', 18, 700),
            [(f'{ai} 핵심 제안', str(pg('needs')))] + [(v['P'][k]['prop'], str(pg(f'core{k}'))) for k in range(3)], p_ai)
    divider('div3', 3, 3, '공간별 제안', clip(f'{short}의 {N}개 공간, 공간마다 대표 제품', 18, 700),
            [(('표준 건물 조감도' if building else '공간 조감도') + f' · {N}개 공간', str(pg('bird'))), ('공간별 대표 제품', rng('sp0', f'sp{N - 1}')), (f'{ai} Map', str(pg('map')))], p_sp)
    rows4 = []
    for j in range(0, K, 2):
        pair = order[j:j + 2]
        rows4.append((' · '.join(SOL[s][0] for s in pair), rng(f'sol{j}', f'sol{j + len(pair) - 1}')))
    divider('div4', len(rows4), 4, ch4, clip(f'{K}개 솔루션으로 {place} 운영을 가볍게', 18, 700), rows4, p_sol)
    divider('div5', 2, 5, '도입사례', clip(f'{place} 업종 고객의 삼성 공식 도입사례', 18, 700), [(CASE[c]['cust'], str(pg(f'case{j}'))) for j, c in enumerate(cases)], p_case)
    divider('div6', 5, 6, 'Why Samsung', '전문가 · 오퍼링 · 프로세스 · 브랜드로 끝까지 책임집니다', [(nm, str(pg(f'why{j}'))) for j, (nm, _) in enumerate(WHY_ROWS)], img(*TECHNICIAN))

    # ---------------- 01 DSS
    fam = [('SAC', '시스템에어컨', lambda c: c.startswith('sac_')), ('LED', 'LED 사이니지', lambda c: c in ('led_in', 'led_out')),
           ('SIG', '스마트 사이니지', lambda c: c in ('lcd_std', 'vwall', 'lcd_out', 'lcd_win', 'epaper', 'spatial', 'btv')), ('IWB', 'Flip Pro 전자칠판', lambda c: c == 'iwb'),
           ('TV', 'Samsung AI TV', lambda c: c in ('htv', 'tv')), ('AUD', '하만 프로 오디오', lambda c: c == 'harman'),
           ('KIT', 'Bespoke AI 주방가전', lambda c: CATGROUP.get(c) == 'KIT'), ('LIV', 'Bespoke AI 리빙가전', lambda c: CATGROUP.get(c) == 'LIV'),
           ('MOB', 'Galaxy AI 모바일', lambda c: c in ('phone', 'tab', 'watch', 'buds', 'xr', 'g_rugged')), ('PC', '갤럭시 북 · 모니터', lambda c: c in ('nb', 'mon', 'desk', 'cb')),
           ('PRT', '디지털 복합기', lambda c: c in ('dmfp', 'mfp')), ('KIO', '삼성 키오스크', lambda c: c == 'g_kiosk'), ('CIN', 'Onyx 시네마 LED', lambda c: c == 'g_cinema')]
    fscore = []
    for fi, (fk, fname, fn) in enumerate(fam):
        cnt = sum(1 for sp in vp['spaces'] if any(fn(c) for c in sp['products']))
        if not cnt: continue
        cats = collections.Counter(c for sp in vp['spaces'] for c in sp['products'] if fn(c) and c in prod.P)
        rep = max(cats, key=lambda c: (cats[c], prod.PRI.get(c, 0))) if cats else None
        if rep: fscore.append((cnt, -fi, fname, rep))
    fscore.sort(reverse=True)
    devs = fscore[:5]
    while len(devs) < 5:
        for extra in [('MOB', 'Galaxy AI 모바일', 'phone'), ('SAC', '시스템에어컨', 'sac_sm'), ('SIG', '스마트 사이니지', 'lcd_std'), ('LIV', 'Bespoke AI 리빙가전', 'air')]:
            if len(devs) >= 5: break
            if not any(d[2] == extra[1] for d in devs): devs.append((0, 0, extra[1], extra[2]))
    dsol = [SOL[s][0] for s in order][:5]
    for extra in ['SmartThings Pro', 'Knox', 'VXT CMS', '파트너 AI 솔루션', '삼성케어플러스']:
        if len(dsol) >= 5: break
        if extra not in dsol: dsol.append(extra)
    serv = ['업종 맞춤 컨설팅', '공조 케어 · 전문 세척' if 'svc_sac' in order else '전문 설치 · 시공', '업무 기기 보증 연장' if 'svc_mobile' in order else 'B2B 전문 A/S']
    vals = {'eb': '01 · OVERVIEW', 'title': clip(f'{place}에 필요한 AI, Device · Solution · Service로 한 번에', 32, 1150, ''),
            'sub': '최적의 Device · Solution · Service로 고객이 언제 어디서나 AI를 누리도록, 차별적 비즈니스 가치와 지속 성장을 지원합니다.', **F(pg('dss'))}
    ims = {}
    for r in range(5):
        vals[f'd{r}'] = clip(devs[r][2], 18, 210)
        src, fit, name = key_img(devs[r][3])
        ims[f'd{r}img'] = img(src, name, 'contain')
        vals[f's{r}'] = clip(dsol[r], 18, 280)
    for k in range(3): vals[f'v{k}'] = serv[k]
    put('dss', fill('L_VS_DSS', vals, ims))

    # ---------------- 02 needs + cores
    vals = {'eb': f'02 · {ai}', 'title': clip(f'{who}의 세 가지 니즈에 삼성 AI 기술로 답합니다', 32, 1150), 'sub': clip(f'{props[0]} · {props[1]} · {props[2]} — {ai}로 바꾸는 세 가지 제안', 18, 1150),
            'h1': clip(ai, 24, 280), **F(pg('needs'))}
    ims = {}
    for r, p in enumerate(v['P']):
        vals[f'q{r}'] = '“' + p['quote'] + '”'
        vals[f't{r}'] = p['tech']
        vals[f't{r}n'] = p['note']
        vals[f'p{r}'] = p['prop']
        for c in range(2): vals[f'p{r}c{c}'] = p['chips'][c]
        src, fit, name = key_img(p['tkey'], small=p['tkey'] in SOL)
        ims[f't{r}img'] = img(src, name, fit)
    put('needs', fill('L_VS_NEEDS', vals, ims))
    for k, p in enumerate(v['P']):
        vals = {'eb': f'02 · {ai} · {p["prop"]}', 'title': clip(p['head'], 32, 1150), 'sub': clip(p['sub'], 18, 1150), **F(pg(f'core{k}'))}
        ims = {}
        for r, s in enumerate(p['subs']):
            vals[f'r{r}t'] = s['title']
            vals[f'r{r}tag'] = s['tag']
            vals[f'r{r}d'] = s['desc']
            for j in range(3): vals[f'r{r}s{j}'] = s['steps'][j]
            src, fit, name = key_img(s['key'])
            ims[f'r{r}img'] = img(src, name, fit)
        put(f'core{k}', fill(f'L_VS_CORE_{k + 1}', vals, ims))

    # ---------------- 03 bird + spaces + map
    floor_of = BLD_FLOOR.get(vid, {})
    n_floors = len(set(floor_of.values()))
    vals = {'eb': '03 · 공간별 제안', 'title': clip(f'{short}의 {N}개 공간', 32, 1150),
            'sub': clip((f'표준 건물 조감도 · {n_floors}개 층에 나눈 {N}개 공간과 공간별 대표 제품' if building else f'공간 조감도 · 한 층에 놓은 {N}개 공간과 공간별 대표 제품'), 18, 1150), **F(pg('bird'))}
    for r, sp in enumerate(vp['spaces']):
        vals[f's{r}'] = sp['name']
        # 대표 제품 먼저, 한 줄에 들어가는 만큼 그 공간의 다른 제품을 잇는다 (건물은 층 표시를 앞에)
        names = space_products(sp, feat[r])
        head = f'{floor_of[r + 1]}F · ' if building else ''
        line = head + names[0]
        for n2 in names[1:]:
            if not fits(line + ' · ' + n2, 14, 238): break
            line += ' · ' + n2
        vals[f's{r}p'] = line if fits(line, 14, 238) else names[0]
    if 'note' in SCHEMA[bird_f]['keys']:
        vals['note'] = f'번호 순서대로 다음 장부터 공간마다 대표 제품과 쓰임을 한 장씩 소개하고, 공간 × 제품 전체는 {ai} Map(p.{pg("map")})에서 한 번에 봅니다.'
    put('bird', fill(bird_f, vals, {'img': img(bird_src, f'{short} ' + ('표준 건물 조감도' if building else '공간 조감도'), 'contain')}))
    scenes = []
    for i, sp in enumerate(vp['spaces']):
        c = feat[i]
        # 대표 제품과 한 문장은 함께 고른다 — 맞는 시나리오가 없는 공간만 제품 기준 문장(scene_match.ROLE)
        scene = polite(picks[i][1] or scene_match.role(c, sp['name'], ind))
        scenes.append(scene)
        name, feats = prod.P[c][1], scene_match.tailor(c, prod.P[c][3], ind, sp['name'])
        src = prod.image_of(c)
        # 왼쪽 공간 사진 | 오른쪽 제품 이름 → key message(이 공간에서 제품이 하는 일) → 제품 컷 + 특징 2
        vals = {'eb': f'03 · 공간별 제안 · {i + 1:02d}', 'title': clip(sp['name'], 32, 1150), 'msg': scene, 'prod': clip(name, 24, SCHEMA['L_VS_SPACE']['box']['prod'][0]), **F(pg(f'sp{i}'))}
        for r in range(2): vals[f'f{r}t'], vals[f'f{r}d'] = feats[r]
        put(f'sp{i}', fill('L_VS_SPACE', vals, {'img': img(src, name, 'cover' if c in prod.PHOTO else 'contain'), 'space': space_photo(sp)}))
    vals = {'eb': '03 · 공간별 제안', 'title': clip(f'{ai} Map', 32, 1150), 'sub': clip(f'{N}개 공간 × 삼성 제품 — 공간마다 놓이는 제품을 한눈에', 18, 1150), **F(pg('map'))}
    ims = {}
    box_w = SCHEMA[f'L_VS_MAP_{N}']['box']['s0p'][0]
    for k, sp in enumerate(vp['spaces']):
        # 제품 다음에 그 공간의 솔루션까지 — 두 줄(칸 너비 × 2)에 들어가는 만큼, 나머지는 '외 N종'
        names = space_products(sp, feat[k]) + [SOL[c][0] for c in sp['products'] if c in SOL]
        for cut in range(len(names), 0, -1):
            lst = ' · '.join(names[:cut]) + (f' 외 {len(names) - cut}종' if cut < len(names) else '')
            if width(lst, 14) <= box_w * 1.8: break
        vals[f's{k}'] = sp['name']
        vals[f's{k}p'] = lst
        if f's{k}d' in SCHEMA[f'L_VS_MAP_{N}']['keys']:
            dw = SCHEMA[f'L_VS_MAP_{N}']['box'][f's{k}d'][0]
            vals[f's{k}d'] = scenes[k] if width(scenes[k], 16) <= dw * 3.6 else clip(scenes[k], 16, dw * 3.6)
        c = feat[k]
        ims[f's{k}img'] = img(prod.image_of(c), prod.P[c][1], 'cover' if c in prod.PHOTO else 'contain')
    put('map', fill(f'L_VS_MAP_{N}', vals, ims))

    # ---------------- 04 solutions
    for j, sid in enumerate(order):
        f, mode, n = SOLS_L[sid]
        items = sol_items(sid, mode, n, used)
        sp_names = s_spaces[sid]
        sp_txt = ' · '.join(sp_names[:3]) + (f' 외 {len(sp_names) - 3}곳' if len(sp_names) > 3 else '')
        vals = {'eb': f'04 · {ch4} · {j + 1:02d}', 'title': clip(SOL[sid][1].format(place=place), 32, 1150), 'sub': clip(SOL[sid][2], 18, 1150),
                'spaces': sp_txt, 'scene': polite(scen[sid][1]), **F(pg(f'sol{j}'))}
        for i2, (t, b) in enumerate(items):
            vals[f'i{i2}t'], vals[f'i{i2}b'] = t, b
        if sid == 's_health':
            data = [f for g in SOLCAT[sid]['groups'] if g['id'].endswith('.data') for f in g['features']]
            for i2, f2 in enumerate(data[:5]): vals[f'c{i2}'] = chip_name(f2)
        spec = dict(sols.IMGS[sid]); spec.update(sols.GROUP_IMGS.get((sid, group), {}))
        if sid == 's_vxt':
            gmap = {'create': 35, 'ops': 59, 'rm': 61, 'epaper': prod.image_of('epaper'), 'apps': 33, 'player': 66}
            chosen = [g for g in SOLCAT[sid]['groups'] if clean(g['name']) in [it[0] for it in items]]
            spec = {f'img{i2}': [gmap.get(g['id'].split('.')[-1], 35)] for i2, g in enumerate(chosen)}
            if group in ('FB',) and 'img1' in spec and chosen[1]['id'].endswith('.ops'): spec['img1'] = [39]
        ims = {}
        for k2, lst in spec.items():
            c = lst[0]
            src = media(c) if isinstance(c, int) else c
            nm = f'{SOL[sid][0]} 화면'
            if isinstance(c, int):
                for sk, sv in MEDIA['sol'].items():
                    for g in sv['g']:
                        if g[0] == c: nm = g[2]
            ims[k2] = img(src, nm, 'contain' if f in ('L_VS_SOL_DMS', 'L_VS_SOL_HEALTH', 'L_VS_SOL_BOOKEE', 'L_VS_SOL_WIFI', 'L_VS_SOL_COUNTHRU') else 'cover')
        put(f'sol{j}', fill(f, vals, ims))

    # ---------------- 05 cases
    for j, cid in enumerate(cases):
        c = CASE[cid]
        pts = []
        offer, needs_, proof = c.get('offer') or [], c.get('needs') or [], c.get('proof') or []
        for k in range(3):
            t = offer[k] if k < len(offer) else (needs_[k] if k < len(needs_) else c['sub'])
            d = needs_[k] if k < len(needs_) else ''
            if k < len(proof): d = (d + ' — ' + proof[k]) if d else proof[k]
            if not d: d = c.get('quote') or c['title']
            t = re.sub(r'\s+', ' ', t).strip()
            pts.append((clip(t, 20, 494 * 2 - 30), d))
        sub = clip(f'{c.get("type") or c["indRaw"]} — {c["sub"] or c["title"]}', 18, 1150)
        vals = {'eb': '05 · 도입사례', 'title': clip(c['cust'], 32, 1150), 'sub': sub, 'src': clip(f'원문 · samsung.com 도입사례 · {c["date"][:7].replace("-", ". ")}', 14, 490), **F(pg(f'case{j}'))}
        for k, (t, d) in enumerate(pts): vals[f'p{k}t'], vals[f'p{k}d'] = t, d
        ims = {f'img{k}': img(p['src'], p['name']) for k, p in enumerate(case_imgs[cid][:4])}
        put(f'case{j}', fill('L_VS_CASE', vals, ims, r=[[f'도입사례 · {c["cust"]}', c['url']]]))

    # ---------------- 06 why + end (identical content)
    for j, (nm, f) in enumerate(WHY_ROWS):
        ims = {k: img(src, name) for k, (src, name) in WHY_IMG[f].items()}
        put(f'why{j}', fill(f, F(pg(f'why{j}')), ims))
    put('end', fill('L_VS_END', {'cust': '고객사 로고', 'foot': foot}, {k: img(src, name) for k, (src, name) in WHY_IMG['L_VS_END'].items()}))

    assert all(fills), [i for i, x in enumerate(fills) if not x]

    # ---------------- scenario + story
    stage_names = {'open': ('표지', '제안 전체를 먼저 보여 준다'), 'context': ('목차 · 01 Overview', f'여섯 장의 흐름과 삼성 AI 비즈니스가 {place}에 주는 가치'),
                   'value': (f'02 {ai}', f'{who}의 니즈마다 AI 기술로 답한다'), 'space': ('03 공간별 제안', f'{N}개 공간 · 공간별 대표 제품'),
                   'build': (f'04 {ch4}', f'{K}개 솔루션으로 운영을 바꾼다'), 'proof': ('05 도입사례', '같은 업종의 공식 도입사례'),
                   'proof6': ('06 Why Samsung', '끝까지 책임지는 공급사, 브랜드로 닫는다')}
    flow = []
    for (stage, role, _), fl in zip(D.slides, fills):
        key = 'proof' if stage == 'proof6' else stage
        nm, goal = stage_names[stage]
        if not flow or flow[-1]['name'] != nm:
            flow.append({'key': key, 'name': nm, 'goal': goal, 'slides': []})
        flow[-1]['slides'].append({'f': fl['f'], 'role': role})
    products = []
    for c in feat:
        pid = prod.P[c][0]
        if pid in P_IDS and pid not in products: products.append(pid)
    sol_ids = []
    for sid in order:
        s_id = SOL[sid][3]
        if s_id and s_id in S_IDS and s_id not in sol_ids: sol_ids.append(s_id)
    if any(c == 'sac_cold' for sp in vp['spaces'] for c in sp['products']) and 'coldchain' not in sol_ids: sol_ids.append('coldchain')
    if any(c in ('sac_l_out', 'sac_ctr') for sp in vp['spaces'] for c in sp['products']) and 'hvac' not in sol_ids: sol_ids.append('hvac')
    techs = [p['tech'] for p in v['P']]
    ask = f'{N}개 공간 중 우선 적용 공간 선정과 현장 실사 일정 합의'
    sid_ = 'bs_std_' + vid
    scenario = {
        'id': sid_, 'req': 'std', 'std': True, 'ind': ind, 'strategy': 'value', 'ending': 'workshop',
        'minutes': max(20, int(round(total * 1.0 / 5.0)) * 5),
        'title': f'{short} · {ai} 표준 제안서',
        'short': f'Overview → {ai} 세 가지 제안 → 공간 {N}곳 → 솔루션 {K}종 → 도입사례 → Why Samsung',
        'situation': f'{short}에 삼성 AI 제품 · 솔루션을 처음 소개하는 자리입니다. {who}의 세 가지 니즈({props[0]} · {props[1]} · {props[2]})에 답하고, {N}개 공간마다 놓이는 대표 제품과 {K}개 솔루션, 같은 업종의 도입사례까지 표준 구성으로 보여 준 뒤 실사 범위를 정합니다.',
        'signals': ['“' + p['quote'] + '”' for p in v['P']] + ['“삼성 제품과 솔루션을 한 번에 보고 싶어요”'],
        'audience': {'lead': v['lead'], 'others': v['others']},
        'criteria': [f'{who} 경험', '운영 인력 · 관리 효율', '공간별 적용 범위', '도입 사례 · 공급사 신뢰'],
        'thesis': f'“{v["cover"]}” — Device · Solution · Service로 짠 {ai}를 공간 순서대로 보여 주고, 솔루션과 도입사례로 운영까지 증명한다.',
        'logic': ['삼성 AI 비즈니스 — Device · Solution · Service', f'{who} 니즈 셋에 AI 기술로 답한다 — ' + ' · '.join(props), f'{N}개 공간 · 공간마다 대표 제품 · {ai} Map',
                  f'{K}개 솔루션 — ' + ' · '.join(sol_names[:3]) + (' 등' if K > 3 else ''), '같은 업종 공식 도입사례 두 건', '전문가 · 오퍼링 · 프로세스 · 브랜드로 끝까지 책임'],
        'diff': [' · '.join(dict.fromkeys(techs)) + f'를 한 흐름으로 묶은 {ai}', ' · '.join(sol_names[:3]) + '로 운영까지 연결', '배송 · 설치 · 유지보수까지 하나의 공급사'],
        'tone': '표준 양식의 언어로 · 공간 장면과 공식 사진 중심',
        'messages': [v['cover'], ' · '.join(props), '같은 구성을 먼저 도입한 고객이 있습니다'],
        'flow': flow,
        'ask': ask,
        'next': ['우선 적용 공간 · 운영 담당자 확인', '모델 · 설치 · 네트워크 · 연동 조건 실사', '시범 범위와 일정 합의'],
        'prep': ['현장 도면 · 공간 목록', '기존 장비 · 제어기 현황', '네트워크 · 보안 · 운영 조건'],
        'products': products[:10], 'solutions': sol_ids, 'cases': cases,
        'kpis': [f'{who} 만족도', '운영 인력 · 관리 시간', '에너지 사용량', '적용 범위 확정'],
        'objections': [['모델과 수량은 어떻게 정하나요?', '설치 공간 · 전원 · 네트워크와 운영 조건을 확인한 뒤 지원 모델과 수량을 합의합니다.'],
                       ['기존 장비 · 시스템과 연동되나요?', '현장 실사에서 기존 제어기 · 시스템을 확인하고 연동 범위와 책임을 정합니다.']],
        'fit': f'{short}에 삼성 제품 · 솔루션을 처음 제안하는 자리', 'avoid': '확정 도면과 최종 견적만 필요한 발주 단계',
        'vs': {'id': vid, 'group': group, 'groupName': GROUPS.get(group, group), 'name': vp['name'], 'size': vp.get('size_segment', ''),
               'spaces': N, 'solutions': K, 'slides': total, 'spaceNames': [sp['name'] for sp in vp['spaces']], 'building': building},
    }
    others = v['others']
    w = [40, 25, 20, 15] if len(others) >= 3 else ([45, 30, 25] if len(others) == 2 else [60, 40])
    km = [[v['lead'], w[0], [v['P'][0]['prop'] + ' — ' + v['P'][0]['chips'][0], '공간마다 무엇이 놓이는지 한 번에 보기']]]
    pool_r = [[v['P'][1]['prop'], v['P'][1]['chips'][1]], [v['P'][2]['prop'], v['P'][2]['chips'][0]], ['적용 범위 · 일정', '현장 실사 조건']]
    for i, o in enumerate(others[:len(w) - 1]):
        km.append([o, w[i + 1], pool_r[i % len(pool_r)]])
    assert sum(x[1] for x in km) == 100
    parts = {}
    for g in flow:
        if g['key'] == 'open': continue
        typ = {'context': 'overview', 'value': 'value', 'space': 'products', 'build': 'solution'}.get(g['key'], 'case' if g['name'].startswith('05') else 'why')
        parts[g['name']] = {'type': typ, 'items': [x['role'] for x in g['slides']][:6]}
    story = {'keymen': km, 'note': f'특정 RFP 없음 — {short} 표준 구성으로 공간별 적용 범위를 보여 주고 실사 범위를 정하는 첫 제안.', 'parts': parts}
    return scenario, fills, story, short


def main():
    V = parse_content()
    assert set(V) == {v['id'] for v in VP['verticals']}, set(v['id'] for v in VP['verticals']) ^ set(V)
    out = {'scenarios': [], 'fills': {}, 'story': {}, 'customers': {}, 'sources': {'generated': '2026-11-11', 'from': ['app/data/vertical_space_product.json', 'app/data/vertical_space_solution.json'],
                                                                                  'note': '44개 업종 표준 제안서 — 목차 6장 고정, 업종마다 내용 · 공간 수 · 솔루션만 다름 (app/scripts/vertical_standard/build.py)'}}
    for vp in VP['verticals']:
        s, fl, st, cust = build_vertical(V[vp['id']])
        out['scenarios'].append(s); out['fills'][s['id']] = fl; out['story'][s['id']] = st; out['customers'][s['id']] = cust
    return out


if __name__ == '__main__':
    out = main()
    path = ROOT + '/app/web/src/domain/templates/standard_vertical_scenarios.json'
    json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    n = sum(len(x) for x in out['fills'].values())
    print(len(out['scenarios']), 'scenarios', n, 'slides', os.path.getsize(path) // 1024, 'KB')
