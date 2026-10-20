import json, re
H = json.load(open('build/photo/new_layouts.json')); M = json.load(open('build/photo/new_meta.json')); PF = json.load(open('build/photo/pf.json'))
cat = json.load(open('data/catalog.json'))
OLD = {l['f']: l for l in cat['layouts']}
PROD = cat['products']; SOL = cat['solutions']
BASEREQ = {'market': ['industry', 'kpis'], 'customer': ['customer', 'challenges'], 'user': ['users'], 'competition': ['competitors'], 'insight': ['challenges', 'values'], 'challenge': ['challenges', 'kpis'], 'value': ['values', 'products', 'solutions'], 'effect': ['kpis'], 'dss': ['spaces', 'products'], 'products': ['spaces', 'products'], 'bom': ['products', 'quantities'], 'scenario': ['spaces', 'solutions', 'products'], 'birdseye': ['spaces'], 'solution': ['solutions', 'products'], 'case': ['cases'], 'why': ['competitors', 'values'], 'spec': ['products'], 'overview': ['customer', 'project', 'values'], 'requirements': ['keymen', 'challenges'], 'execution': ['timeline'], 'cost': ['costs'], 'cover': ['customer', 'project'], 'closing': ['contacts', 'timeline'], 'appendix': ['sources']}
KIND = ['photo', 'space', 'people', 'insitu', 'cut', 'ui']
out = []
for m in M:
    f = m['f']; texts = m['texts']; allt = ' '.join(texts)
    eb, hl, sub = m['hdr'] if m['hdr'] else (None, None, None)
    if not eb:
        i = next(i for i, t in enumerate(texts) if re.match(r'^\d\d · ', t))
        eb, hl, sub = texts[i], texts[i + 1], texts[i + 2]
    ph = re.findall(r'\[[^\[\]]{1,24}\]', allt)
    req = list(BASEREQ.get(m['p'], []))
    def add(k):
        if k not in req: req.append(k)
    add('images')
    if re.search(r'\[0|\[00|\[N\]', allt): add('kpis')
    if m['p'] in ('scenario', 'products', 'value', 'bom') and re.search(r'공간|매장|객실|로비|층', allt): add('spaces')
    if m['p'] in ('execution', 'closing') and re.search(r'주|일정|단계|월', allt): add('timeline')
    if m['p'] in ('case',): add('cases')
    prods = m.get('prods') or [p['id'] for p in PROD if p['model'] in allt]
    sols = m.get('sols') or [s['id'] for s in SOL if s['name'] in allt]
    pv = [x for x in m['pv'] if x in OLD]
    missing = [x for x in m['pv'] if x not in OLD]
    if missing: print('missing twin', f, missing)
    slots = m['slots']
    out.append({
        'f': f, 'c': 'PH', 'code': m['code'], 'name': m['name'], 'when': m['when'],
        'g': f"사진 중심 · {m['grp']} — 텍스트 위주 장표를 사진으로 채운 버전",
        'p': m['p'], 'p2': m.get('p2'), 'ind': m.get('ind'), 'sol': None, 'sample': m['sample'],
        'eb': eb, 'hl': hl, 'sub': sub or '', 'foot': m['foot'],
        'nT': len(texts), 'nI': len(slots), 'ik': list(dict.fromkeys(s['kind'] for s in slots))[:4], 'ih': [s['hint'] for s in slots[:6]],
        'ph': len(ph), 'phs': list(dict.fromkeys(ph))[:6], 'pc': m.get('pc', 0), 'req': req, 'prods': prods, 'sols': sols,
        'txt': allt[:700], 'pv': pv, 'pf': PF[f],
    })
# pf for existing layouts (added to catalog.json)
n_ind = sum(1 for o in out if o.get('ind'))
js = (f'// 사진 중심 레이아웃 {len(out)}장 (L_PH_*) — 텍스트만 있던 레이아웃과 같은 맥락을 사진으로 채운 버전. 업종 지정(ind) {n_ind}장.\n'
      '// 생성: Winmate 세션(2026-10-13, 1차 35장 + 2차 45장 + 3차 고객사 이해 24장 + 4차 업종별 묶음 96장 · 공통 10장 + 5차 경쟁사 분석 23장 · 시사점 · 제안 방향 13장 + 6차 실행 계획 · 비용 22장 + 7차 고객 과제 · 기대 효과 · 제안 개요 · 요구 · 사용자 40장 + 8차 솔루션 유저 시나리오 24장) · 사진은 img/ph/ · img/fill/*.json (samsung.com 도입사례 · 비즈니스 페이지, 출처는 src/photo_sources.md) · 제품 컷은 img/bs/p-*.png\n'
      '// meta.pv = 같은 맥락의 텍스트 레이아웃 f 목록, meta.pf = 슬라이드에서 사진이 차지하는 비율(0~1)\n'
      'export const PHOTO_META = ' + json.dumps(out, ensure_ascii=False, indent=0) + ';\n\n'
      'export const PHOTO_HTML = ' + json.dumps(H, ensure_ascii=False) + ';\n')
open('src/photo_layouts.js', 'w').write(js)
print(len(out), len(js) // 1024, 'KB')
# add pf to existing catalog layouts
for l in cat['layouts']: l['pf'] = PF.get(l['f'], 0)
json.dump(cat, open('data/catalog.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# register photos in data/images.json (pids) so the image picker / applyOverrides know them
IM = json.load(open('data/images.json'))
PHI = json.load(open('build/photo/ph_images.json'))
for k, v in PHI.items():
    if v.get('addr'): IM['pids'].pop(k, None); continue  # 묶음 그림(경쟁사 실루엣)은 라이브러리에 넣지 않음
    IM['pids'][k] = v
json.dump(IM, open('data/images.json', 'w'), ensure_ascii=False, indent=1)
print('images.json pids', len(IM['pids']))

# 4차 대체 목록 (텍스트 f → 사진 · 원본 사진 f) — src/data.js 의 RETIRED 에 합쳐진다
RET = json.load(open('build/photo/r4_retired.json'))
known = set(OLD) | set(H)
bad = [k for k, v in RET.items() if k not in OLD or v not in known]
if bad: raise SystemExit('retired: unknown ' + ' '.join(bad))
open('src/retired.js', 'w').write('// 4차(2026-10-13) — 글 · 도표만으로 빽빽하던 레이아웃을 사진 버전으로 대체 (텍스트 f → 대체 f). build/photo/r4_retired.json 에서 생성 · 직접 고치지 않음\n'
                                  '// 뺀 레이아웃은 목록 · 개수 · 고르기에서 빠지고, 이미 만든 제안서 · Best Scenario 에서는 그대로 그려진다.\n'
                                  'export const RETIRED_R4 = ' + json.dumps(RET, ensure_ascii=False, indent=0) + ';\n')
print('retired', len(RET))
