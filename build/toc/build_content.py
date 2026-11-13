# 목차 템플릿 콘텐츠 조립 — 데이터(vertical_space_product/solution.json · 공간 사진) + 작성한 문구 → toc_content.json
# 표준 제안서와 이름이 같은 목차(Overview · AI 업종 · 공간별 제안 · 솔루션 · 도입사례 · Why Samsung)는 업종 표준 제안서(bs_std_*) 장을 그대로 쓰므로
# 여기서는 표준에 없는 목차 내용만 만든다: 과제 · 여정(공간별 가치 제안) · 핵심 기술 · 사양 · 구성 · 수량 (+ 업종 묶음별 당사의 이해 데이터 G).
import json, re, sys, os, collections
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from content_common import FAM, SKIP_CAT, SOL, GRP
from content_groups import G, LINEUP
from product import build_pp, std_sheets, F_SOL
from content_compete import CMP
VV = {}
for m in ('content_v1', 'content_v2', 'content_v3', 'content_v4', 'content_v5'):
    VV.update(__import__(m).V)

APP = os.path.abspath(os.path.join(HERE, '..', '..', 'app'))
PROD = json.load(open(APP + '/data/vertical_space_product.json'))
SOLJ = json.load(open(APP + '/data/vertical_space_solution.json'))
SPACE_PHOTOS = json.load(open(os.path.join(HERE, 'space_photos.json')))  # 공간 id → 사진 (앱 사진 묶음 · 사례 사진에서 고름)
SUBS = json.load(open(APP + '/data/subscriptions.json'))  # 구독 레지스트리(B2B 삼성 AI 구독) — 업종별 구독 패키지 · 결제안
SUBI = {x['id']: x for x in SUBS['items']}; SUBC = {c['id']: c for c in SUBS['categories']}
OUT = APP + '/web/src/domain/templates/toc_content.json'

FEAT = {}; GROUPS = {}; SOLCAT = {}
for s in SOLJ['solution_catalog']:
    SOLCAT[s['id']] = s
    for g in s['groups']:
        GROUPS[g['id']] = g
        for f in g['features']: FEAT[f['id']] = (f['name'], g['id'], s['id'])
ICON_DIR = APP + '/web/public/assets/toc/icons'
def has_icon(fid): return os.path.exists(f'{ICON_DIR}/{fid}.on.png')

# ---------- 문장 끝을 합니다체로 ----------
def _jong(ch): return (ord(ch) - 0xAC00) % 28 if '가' <= ch <= '힣' else -1
def _with_jong(ch, j): return chr(ord(ch) - _jong(ch) + j)
def formal(s):
    s = s.strip().rstrip('.')
    if not s: return s
    if s.endswith('는다'): return s[:-2] + '습니다.'
    if s.endswith('있다') or s.endswith('없다'): return s[:-1] + '습니다.'
    if s.endswith('이다'): return s[:-2] + '입니다.'
    if s.endswith('다') and len(s) >= 2:
        p = s[-2]
        if _jong(p) == 4:  # ㄴ다 → ㅂ니다
            return s[:-2] + _with_jong(p, 17) + '니다.'
    return s + '.'
def clause_formal(word):
    """'바꾸고' / '확인하며' → 합니다체 (첫 절만 쓸 때)"""
    stem = word[:-1]
    if not stem: return word
    last = stem[-1]; j = _jong(last)
    if j == 0: return stem[:-1] + _with_jong(last, 17) + '니다.'
    if j == 8: return stem[:-1] + _with_jong(last, 17) + '니다.'  # ㄹ 탈락 + ㅂ니다
    return stem + '습니다.'
def scene(s, limit=None):
    """시나리오 한 줄 → 합니다체. 너무 길면 첫 절만."""
    f = formal(s)
    if limit and len(f) > limit:
        m = re.match(r'^(.+?)(고|며|해),\s', s)
        if m and len(m.group(1)) > 12:
            w = (m.group(1) + m.group(2)).split(' ')
            last = w[-1]
            if last.endswith('해'): last = last[:-1] + '하고'
            w[-1] = clause_formal(last)
            f2 = ' '.join(w)
            if len(f2) <= limit: return f2
    return f

def photo(space_id):
    return SPACE_PHOTOS.get(space_id)

def grp_act(fids, n=3):
    out = []
    for f in fids:
        kw = GRP.get(FEAT[f][1], (GROUPS[FEAT[f][1]]['name'], ''))[0]
        if kw not in out: out.append(kw)
    return ' · '.join(out[:n])

def build_vertical(v):
    vid = v['id']; g = v['group']; A = VV[vid]
    sv = [x for x in SOLJ['verticals'] if x['id'] == vid][0]
    spaces = []
    for i, (sp, ss) in enumerate(zip(v['spaces'], sv['spaces'])):
        prods, seen = [], set()
        for c in sp['products']:
            if c.startswith('s_') or c in SKIP_CAT or c not in FAM: continue
            nm, cut, ln = FAM[c]
            if nm in seen: continue
            seen.add(nm); prods.append([nm, cut, ln, c])
        sols = [[s['solution'], scene(s['scenario']), [f for f in s['features'] if f in FEAT]] for s in ss['solutions']]
        nm = sp['name'] if len(sp['name']) <= 12 else re.sub(r'\s*\([^)]*\)', '', sp['name']).strip()
        spaces.append(dict(id=sp['id'], n=nm, ph=photo(sp['id']), prods=prods[:4], sols=sols))
    # 업종 전체 기준 순위
    cat_cnt = collections.Counter(p[3] for s in spaces for p in s['prods'])
    sol_cnt = collections.Counter(x[0] for s in spaces for x in s['sols'])
    sol_rank = [s for s, _ in sorted(sol_cnt.items(), key=lambda z: (-z[1], list(SOL).index(z[0])))]
    used_feats = collections.defaultdict(list)  # sid → features used anywhere (catalog order)
    for s in spaces:
        for sid, _, fs in s['sols']:
            for f in fs:
                if f not in used_feats[sid]: used_feats[sid].append(f)
    order = {f: i for i, f in enumerate(FEAT)}
    for sid in used_feats: used_feats[sid].sort(key=lambda f: order[f])

    def sp_scene(si, prefer):
        for sid, sc, _ in spaces[si]['sols']:
            if sid in prefer: return sc, sid
        return (spaces[si]['sols'][0][1], spaces[si]['sols'][0][0]) if spaces[si]['sols'] else ('', None)

    # 업종 니즈 문구마다 대표 공간 — 과제 사진 · 표지 사진 · 사양 비교 순서에만 쓴다(니즈 · 제안 장은 표준 제안서 것을 씀)
    needs = []
    for (q, val, c1, c2, nsols, cut, title, sps) in A['needs']:
        has = lambda si: any(x[0] in nsols for x in spaces[si]['sols'])
        idx = [x - 1 for x in sps if has(x - 1)][:3]
        for si in range(len(spaces)):
            if len(idx) >= 2: break
            if si not in idx and has(si): idx.append(si)
        if len(idx) < 2: idx = list(dict.fromkeys(idx + [x - 1 for x in sps]))[:3]
        needs.append(dict(ph=spaces[idx[0]]['ph'], cat=cut))
    pains = [[t, l, needs[i]['ph'] if i < len(needs) else spaces[0]['ph']] for i, (t, l) in enumerate(A['pains'])]

    jrs = []
    for t, sps in A['jr']:
        idx = [x - 1 for x in sps][:3]
        cnt = collections.Counter(sid for si in idx for sid, _, _ in spaces[si]['sols'])
        top = [s for s, _ in sorted(cnt.items(), key=lambda z: (-z[1], sol_rank.index(z[0])))][:2]
        boxes = []
        for sid in top:
            on = []
            for si in idx:
                for s2, _, fs in spaces[si]['sols']:
                    if s2 == sid:
                        for f in fs:
                            if f not in on and has_icon(f): on.append(f)
            boxes.append(dict(s=sid, nm=SOL[sid][0], on=on, all=[f for f in used_feats[sid] if has_icon(f)], act=grp_act(on, 3)))
        jrs.append(dict(t=t, sp=idx, scenes=[scene(sp_scene(si, top)[0], 84) for si in idx], sol=boxes))

    def kw_groups(sid, n=3):
        gc = collections.Counter(FEAT[f][1] for f in used_feats[sid])
        gids = [gid for gid, _ in gc.most_common()]
        for gg in SOLCAT[sid]['groups']:
            if gg['id'] not in gids: gids.append(gg['id'])
        out = []
        for gid in gids[:n]:
            fid = next((f for f in used_feats[sid] if FEAT[f][1] == gid and has_icon(f)), None) or next((f['id'] for f in GROUPS[gid]['features'] if has_icon(f['id'])), None)
            kw, ln = GRP.get(gid, (GROUPS[gid]['name'], ''))
            out.append([fid, kw, ln])
        return out
    tech = [dict(s=sid, nm=SOL[sid][0], intro=SOL[sid][1], kw=kw_groups(sid)) for sid in sol_rank[:4]]

    top_cats = list(dict.fromkeys([n['cat'] for n in needs if n['cat'] in cat_cnt] + [c for c, _ in cat_cnt.most_common()]))
    spec = []
    for c in top_cats[:3]:
        where = [s['n'] for s in spaces if any(p[3] == c for p in s['prods'])]
        lb, vl = LINEUP.get(c, ('특징', FAM[c][2]))
        spec.append(dict(nm=FAM[c][0], cut=FAM[c][1], md=FAM[c][2], rows=[[lb, vl], ['강점', FAM[c][2]], ['공간', ' · '.join(re.split(r'[·(]', w)[0].strip() for w in where[:2])]]))
    bom_cols = [c for c, _ in cat_cnt.most_common(5)]
    rows = [s for s in spaces if any(p[3] in bom_cols for p in s['prods'])] or spaces
    rows = sorted(rows, key=lambda s: -sum(p[3] in bom_cols for p in s['prods']))[:8]
    rows = [s for s in spaces if s in rows]
    bom = dict(cols=[[FAM[c][0], FAM[c][1]] for c in bom_cols], rows=[[s['n'], ['[0]' if any(p[3] == c for p in s['prods']) else '—' for c in bom_cols]] for s in rows])
    ind = {'SF': 'SV', 'MI': 'PB', 'RG': 'VN', 'MB': 'AD'}.get(g, g)
    pp = build_pp(vid, v['spaces'], sv['spaces'], ind)
    for x in pp['vps']:
        if x.get('scenes'): x['scenes'] = [scene(t, 84) for t in x['scenes']]
        if x['k'] == 's':  # 여정 장 기능 줄: 켜진 기능(이 공간에서 쓰는 것) + 이 업종에서 쓰는 나머지 기능(꺼짐)
            x['on'] = [f for f in x['on'] if has_icon(f)]
            x['all'] = [f for f in used_feats.get(x['sid'], []) if has_icon(f)]
    return dict(id=vid, nm=v['name'], g=g, gn=G[g]['nm'], seg=v['size_segment'], cover=needs[0]['ph'] or spaces[0]['ph'],
                sp=[dict(n=s['n'], ph=s['ph']) for s in spaces], pains=pains, jr=jrs, tech=tech, spec=spec, bom=bom,
                pp=pp, nsol=len({F_SOL[f] for _, f, _, _ in std_sheets(vid) if f in F_SOL}), sub=sub_of(v, spaces))

# ---------- 구독 — 업종마다 구독 패키지(공식 패키지 · 비슷한 업종 · 업종 공간 기준 추천) ----------
PAY_ORDER = {'PB': ['sub_pay_annual', 'sub_pay_monthly', 'sub_pay_prepay'], 'ED': ['sub_pay_annual', 'sub_pay_monthly', 'sub_pay_prepay'],
             'MI': ['sub_pay_annual', 'sub_pay_monthly', 'sub_pay_prepay'], 'FN': ['sub_pay_hq', 'sub_pay_monthly', 'sub_pay_stage'],
             'FB': ['sub_pay_hq', 'sub_pay_monthly', 'sub_pay_stage'], 'RT': ['sub_pay_hq', 'sub_pay_monthly', 'sub_pay_stage'],
             'OE': ['sub_pay_hq', 'sub_pay_monthly', 'sub_pay_stage'], 'SV': ['sub_pay_hq', 'sub_pay_monthly', 'sub_pay_stage'],
             'OF': ['sub_pay_monthly', 'sub_pay_hq', 'sub_pay_prepay']}
def sub_of(v, spaces):
    sv = SUBS['verticals'][v['id']]; si = sv['space']; sp = spaces[si] if si < len(spaces) else spaces[0]
    pk = SUBI.get(sv['pkg']) if sv['pkg'] else None
    if pk and sv['match'] == 'direct':
        head = dict(name=pk['name'], title=pk['title'], line=pk['line'], place=pk['place'], ph=pk['photo'])
        items = [[it['label'], it['img'], it.get('model') or it.get('note') or ''] for it in pk['items']]
    elif pk:  # 비슷한 업종 · 가전 품목이 적은 업종(사무 · 관리 공간) — 공식 패키지 품목 + 이 업종 공간 사진
        head = dict(name=pk['name'], title=pk['title'], line=pk['line'], place=sp['n'], ph=sp['ph'] or pk['photo'])
        items = [[it['label'], it['img'], it.get('model') or it.get('note') or ''] for it in pk['items']]
    else:  # 업종 공간 기준 추천 구성 — 구독 가능 품목만
        items = [[SUBC[c]['label'], (SUBC[c]['rep'] or {}).get('img'), (SUBC[c]['rep'] or {}).get('model') or ''] for c in sv['cats']]
        head = dict(name='추천 구독 구성', title=f"{sp['n']}부터, 업종 공간에 맞춘 구독 품목 {len(items)}가지", line='업종 공간에 들어가는 구독 가능 품목으로 고른 구성 — 패키지 · 모델은 구독 문의로 확인', place=sp['n'], ph=sp['ph'])
    return dict(pkg=sv['pkg'], match=sv['match'], **head, items=items[:4], pay=PAY_ORDER.get(v['group'], ['sub_pay_monthly', 'sub_pay_prepay', 'sub_pay_stage']))

def subs_common():
    pick = lambda x: {k: x.get(k) for k in ('id', 'name', 'short', 'basis', 'icon', 'summary', 'points', 'confirm', 'fit')}
    promo = next((x for x in SUBS['items'] if x['type'] == 'promotion'), None)
    return dict(run=SUBS['run'], pay={x['id']: pick(x) for x in SUBS['items'] if x['type'] == 'payment'},
                promo=dict(id=promo['id'], active=promo.get('state') == 'active' and promo.get('status') == 'active', validTo=promo['validTo']) if promo else None,
                addon=SUBS.get('addon'))  # 요구사항에 따라 다른 목차 구성에 더하는 '구독 솔루션 제안' 규칙(신호 · 목차 틀 · 자리)

def main():
    out = dict(v={}, g={})
    for v in PROD['verticals']:
        out['v'][v['id']] = build_vertical(v)
    for k, x in G.items():
        out['g'][k] = dict(x, cs=CMP[k])  # cs: 경쟁사 비교 예시(점수표 · 차별점)
    out['order'] = [v['id'] for v in PROD['verticals']]
    out['subs'] = subs_common()
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    print('verticals', len(out['v']), 'bytes', os.path.getsize(OUT))
    return out

if __name__ == '__main__':
    o = main()
    if len(sys.argv) > 1:
        print(json.dumps(o['v'][sys.argv[1]], ensure_ascii=False, indent=1)[:6000])
