"""Write the baked 표준 건물 조감도 floors as their own data module (bake-standard.js).

The module's base data (bake.b64) stays as it is; data.js appends these floors at load
time, re-numbering assets after the base table and adding only missing recipes.
"""
import base64, gzip, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import ROOT, OUT as WORK

STD = sys.argv[1] if len(sys.argv) > 1 else WORK + '/std_floors.json'
PLAN = WORK + '/bld_floors.json'
LIB = ROOT + '/app/data/spatial/library.json'
OUT = ROOT + '/app/web/src/building/bake-standard.js'

S = json.load(open(STD))
plan = {f['id']: f for f in json.load(open(PLAN))['floors']}
L = json.load(open(LIB))

order, idx = [], {}
for f in S['floors']:
    for o in f['objs']:
        if o[0] not in idx:
            idx[o[0]] = len(order)
            order.append(o[0])
assets = [S['assets'][a] for a in order]
recipes = {}
for a in assets:
    if a.get('r') and a['r'] not in recipes:
        recipes[a['r']] = L['recipes'][a['r']]
tpl = []
for f in S['floors']:
    p = plan[f['id']]
    tpl.append({'id': f['id'], 'ind': f['ind'], 'name': f'표준 · {f["name"]}', 'lay': 'std', 'style': f['style'], 'v': 'standard',
                'w': f['w'], 'd': f['d'], 'sign': p['sign'], 'rooms': f['rooms'],
                'objs': [[idx[o[0]], *o[1:]] for o in f['objs']], 'ppl': f['ppl']})
data = {'v': 3, 'src': 'winmate-spatial-1 · library 733e40b9 · geometry v6 · 표준 건물 조감도', 'assets': assets, 'recipes': recipes, 'tpl': tpl}
raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
b64 = base64.b64encode(gzip.compress(raw, compresslevel=9, mtime=0)).decode()
head = ("// 생성 파일 — 표준 건물 조감도 층(lay 'std'). 샘플 버티컬 시나리오의 업종별 표준 제안서 중 공간이 6개를 넘는 업종 8개의\n"
        "// 공간을 층마다 나눠(공간 중복 없음) 공간 조감도 엔진으로 조립해 구운 것. 직접 고치지 않는다 — app/scripts/vertical_standard/README.md.\n"
        "// 형식은 bake.b64와 같고(자산 번호는 이 데이터 안에서), data.js가 기본 데이터 뒤에 붙인다. gzip + base64.\n")
open(OUT, 'w').write(head + f"export const STANDARD_BAKE = '{b64}';\n")
print('floors', len(tpl), 'assets', len(assets), 'recipes', len(recipes), 'json', len(raw), 'b64', len(b64))
