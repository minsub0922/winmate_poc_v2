# 9차 새 레이아웃을 앱 데이터에 넣기 — python3 build/bs/integrate_layouts.py
# L_PH_SD_G · L_PH_QA_A → src/photo_layouts.js (사진 중심), L_PH_AIS_* → src/std_layouts.js (표준 제안서 ST)
# 원래 텍스트 장은 src/data.js RETIRED 에 (원래 f → 사진 f) — 목록에서 빠지고 이미 만든 장은 그대로 그려짐
import json, re
H = json.load(open('build/bs/new_layouts.json')); META = json.load(open('build/bs/new_meta.json')); PF = json.load(open('build/bs/new_pf.json'))
CAT = json.load(open('data/catalog.json')); OLD = {l['f']: l for l in CAT['layouts']}
def load(fn, a, b):
    s = open(fn, encoding='utf8').read()
    i = s.index(f'export const {a} = ') + len(f'export const {a} = ')
    sep = f';\n\nexport const {b} = ' if f';\n\nexport const {b} = ' in s else f';\nexport const {b} = '
    j = s.index(sep, i); k = j + len(sep); l = s.rindex(';')
    return s, s[:i], json.loads(s[i:j]), sep, json.loads(s[k:l]), s[l:]
def save(fn, head, M, sep, Hh, tail):
    open(fn, 'w', encoding='utf8').write(head + json.dumps(M, ensure_ascii=False, indent=0) + sep + json.dumps(Hh, ensure_ascii=False) + tail)
def texts_of(html):
    return [re.sub(r'<[^>]+>', ' ', m).strip() for m in re.findall(r'data-tb="\d+"[^>]*>(.*?)</(?:span|div)>', html)]
def slots_of(html):
    return [{'kind': m[0], 'hint': m[1]} for m in re.findall(r'data-img="\d+" data-kind="([^"]+)" data-hint="([^"]+)"', html)]
s1, h1, PM, sep1, PH, t1 = load('src/photo_layouts.js', 'PHOTO_META', 'PHOTO_HTML')
s2, h2, SM, sep2, SH, t2 = load('src/std_layouts.js', 'STD_META', 'STD_HTML')
SMd = {m['f']: m for m in SM}
added = []
for m in META:
    f = m['f']; html = H[f]; sl = slots_of(html); tx = texts_of(html)
    if f.startswith('L_PH_AIS_'):
        base = dict(SMd[m['base']])
        base.update({'f': f, 'code': m['code'], 'name': m['name'], 'when': m['when'], 'nI': len(sl), 'ik': list(dict.fromkeys(x['kind'] for x in sl))[:4], 'ih': [x['hint'] for x in sl[:6]], 'pv': m['pv'], 'pf': PF[f]})
        base['g'] = base['g'].replace(' — 2025', ' · 사진 버전 — 2025')
        if 'images' not in base['req']: base['req'].append('images')
        SM = [x for x in SM if x['f'] != f]; SM.append(base); SH[f] = html; added.append(f)
    else:
        o = OLD[m['base']]
        out = {'f': f, 'c': 'PH', 'code': m['code'], 'name': m['name'], 'when': m['when'], 'g': f"사진 중심 · {m['grp']} — 텍스트 위주 장표를 사진으로 채운 버전",
               'p': m['p'], 'p2': m.get('p2'), 'ind': m.get('ind'), 'sol': None, 'sample': m['sample'],
               'eb': tx[0] if tx else '', 'hl': tx[1] if len(tx) > 1 else '', 'sub': tx[2] if len(tx) > 2 else '', 'foot': o.get('foot', ''),
               'nT': html.count('data-tb='), 'nI': len(sl), 'ik': list(dict.fromkeys(x['kind'] for x in sl))[:4], 'ih': [x['hint'] for x in sl[:6]],
               'ph': o.get('ph', 0), 'phs': o.get('phs', []), 'pc': o.get('pc', 0), 'req': list(dict.fromkeys((o.get('req') or []) + ['images'])), 'prods': o.get('prods', []), 'sols': o.get('sols', []),
               'txt': ' '.join(tx)[:700], 'pv': m['pv'], 'pf': PF[f]}
        PM = [x for x in PM if x['f'] != f]; PM.append(out); PH[f] = html; added.append(f)
news = [m for m in SM if m['f'].startswith('L_PH_AIS_')]; rest = [m for m in SM if not m['f'].startswith('L_PH_AIS_')]; SM = []
for m in rest:
    SM.append(m); SM += [n for n in news if n['pv'] == [m['f']]]
n_ind = sum(1 for o in PM if o.get('ind'))
h1 = re.sub(r'^// 사진 중심 레이아웃 \d+장 \(L_PH_\*\)[^\n]*', f'// 사진 중심 레이아웃 {len(PM)}장 (L_PH_*) — 텍스트만 있던 레이아웃과 같은 맥락을 사진으로 채운 버전. 업종 지정(ind) {n_ind}장.', h1)
if '9차' not in h1: h1 = h1.replace('\n// meta.pv', '\n// 9차(2026-10-17, Best Scenario 사진 중심 전환): L_PH_SD_G · L_PH_QA_A — 원래 장의 글 칸 번호를 그대로 두고 사진 칸만 더함 (build/bs/newlayouts.mjs)\n// meta.pv', 1)
if '사진 버전' not in h2.split('export const')[0]: h2 = h2.replace('\nexport const STD_META', '\n// 사진 버전(2026-10-17): L_PH_AIS_08 · 25 · 35 — 아이콘 · 도식 칸을 객실 · 현장 사진으로 (글 칸 번호는 원래 장과 같음, build/bs/newlayouts.mjs) · 원래 장은 data.js RETIRED\nexport const STD_META', 1)
save('src/photo_layouts.js', h1, PM, sep1, PH, t1)
save('src/std_layouts.js', h2, SM, sep2, SH, t2)
# RETIRED
d = open('src/data.js', encoding='utf8').read()
NEWR = {m['base']: m['f'] for m in META}
line = '  ' + ', '.join(f"{a}: '{b}'" for a, b in NEWR.items()) + ', // 9차 — Best Scenario 사진 중심 전환 때 새로 만든 사진 버전 (build/bs/newlayouts.mjs)\n'
if "L_SD_G: 'L_PH_SD_G'" not in d:
    d = d.replace("  L_P3A: 'L_PH_P3_A',", line + "  L_P3A: 'L_PH_P3_A',", 1)
    open('src/data.js', 'w', encoding='utf8').write(d)
print('added', added, 'photo', len(PM), 'std', len(SM))
