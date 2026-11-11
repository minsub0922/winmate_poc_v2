"""Write src/building/presets-standard.js (표준 건물 조감도 presets) from bld_floors.json."""
import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build
V = build.parse_content()
from paths import ROOT, OUT
plan = json.load(open(OUT + '/bld_floors.json'))
meta = plan['meta']; floors = {f['id']: f for f in plan['floors']}
lines = ["// 생성 파일 — 표준 건물 조감도(샘플 버티컬 시나리오 · 업종별 표준 제안서 03 공간별 제안 첫 장의 건물).",
         "// 공간이 6개를 넘는 업종 8개의 공간을 층마다 나눠 모두 한 번씩 채운 건물(공간 중복 없음 · 층당 2~5공간 · 공간마다 8×6.8m 한 칸).",
         "// 건물 템플릿(빈 층)과 달리 층마다 공간 · 층 이름이 들어 있다. 층 = bake-standard.js의 std-* 층, 아래층부터.",
         "// 직접 고치지 않는다 — app/scripts/vertical_standard/README.md.",
         "const S = (vid, ind, fv, title, floors) => ({ id: `std-${vid}`, vid, ind, fv, title, std: true, floors: floors.map(([tpl, name]) => ({ tpl, fv, name })) });",
         "export const STD_PRESETS = ["]
for vid, m in meta.items():
    ind = floors[m['floors'][0]]['ind']
    fl = ', '.join(f"['{fid}', '{s}']" for fid, s in zip(m['floors'], m['signs']))
    lines.append(f"  S('{vid}', '{ind}', {m['fv']}, '{V[vid]['short']} 표준 건물', [{fl}]),")
lines += ["];", "export const stdPresetOf = (id) => STD_PRESETS.find((p) => p.id === id) || null;", ""]
out = sys.argv[1] if len(sys.argv) > 1 else ROOT + '/app/web/src/building/presets-standard.js'
open(out, 'w').write('\n'.join(lines))
print('wrote', out, len(meta), 'presets')
