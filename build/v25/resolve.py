# 덱 채움(fills_st/of/ap) → 앱 FILLS 형식 슬라이드 목록. 이름 칸('logo','foot',...)은 새 레이아웃 칸 번호로, 'page' 는 CONFIDENTIAL 번호로.
# python3 resolve.py st|of|ap [--final]  →  out/slides_<deck>[_final].json
import sys, json, re, importlib
sys.path.insert(0, '/home/claude/v3')
import decks_new, keys
W = '/home/claude/w25'
MOD = {'st': 'fills_st', 'of': 'fills_of', 'ap': 'fills_ap'}

def _std():
    s = open(f'{W}/src/std_layouts.js').read(); mi = s.index('export const STD_META = ') + 24; me = s.index('\n];', mi) + 2
    return {m['f']: m for m in json.loads(s[mi:me])}
def _fills():
    s = open(f'{W}/src/scenario_fills.js', encoding='utf8').read(); i = s.index('export const FILLS = ') + len('export const FILLS = ')
    return json.loads(s[i:s.index(';\n', i)])
META = _std()
NAMES, KINDS = {}, {}
for lay, _ in decks_new.OUT:
    NAMES[lay.fid] = (lay.names, lay.imgnames); KINDS[lay.fid] = lay.kinds
for f, m in META.items(): KINDS.setdefault(f, m.get('ik') or [])
KINDS['L_STD_PH09N'] = KINDS['L_AIS_09']
SRCNAME = {}
for sc in _fills().values():
    for sl in sc:
        for v in (sl.get('img') or {}).values():
            if v.get('src') and v.get('name'): SRCNAME.setdefault(v['src'], v['name'])

REUSEALT = {}
for _d in ('store', 'office', 'apt'):
    for _m in keys.manifest(_d):
        if _m['status'] == 'reuse': REUSEALT.setdefault(_m['ref'], _m.get('alt', ''))
def tidx(f, k):
    if isinstance(k, int): return k
    names = NAMES.get(f, ({}, {}))[0]
    if k not in names: raise KeyError(f'{f}: 글 칸 이름 {k!r} 없음 ({sorted(names)})')
    return names[k]
def iidx(f, k):
    if isinstance(k, int): return k
    return NAMES[f][1][k]

def slides(deck, final=False):
    mod = importlib.import_module(MOD[deck]); importlib.reload(mod)
    out, miss = [], []
    for n, s in enumerate(mod.SLIDES, 1):
        f = s['f']; t = {}
        for k, v in (s.get('t') or {}).items():
            if k == 'page': t[str(tidx(f, 'conf'))] = f'CONFIDENTIAL · {v}'; continue
            t[str(tidx(f, k))] = v
        img = {}
        kinds = KINDS.get(f) or []
        for k, v in (s.get('img') or {}).items():
            i = iidx(f, k); src = v
            fit = 'contain' if i < len(kinds) and kinds[i] == 'cut' else 'cover'
            if src.startswith('@'):
                name = keys.alt(src)
                if final:
                    a = keys.app_addr(src)
                    if not a: miss.append((n, f, i, src)); continue
                    src = a
                elif not keys.preview_src(src): miss.append((n, f, i, src))
            else:
                name = SRCNAME.get(src, '') or REUSEALT.get(src, '')
            img[str(i)] = dict(src=src, fit=fit, name=name, keep=True)
        out.append(dict(t=t, img=img, f=f, label=f'{n:02d} {f}'))
    return out, miss

if __name__ == '__main__':
    d = sys.argv[1]; final = '--final' in sys.argv
    sl, miss = slides(d, final)
    p = f'/home/claude/v3/out/slides_{d}{"_final" if final else ""}.json'
    json.dump(sl, open(p, 'w'), ensure_ascii=False)
    print(p, len(sl), 'slides · missing img', len(miss))
    for m in miss[:80]: print('  miss', m)
