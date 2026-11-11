import json, sys
import layouts as L, sol_layouts as S, why_layouts as W
from paths import ROOT, OUT

def build():
    L.toc(); [L.divider(n) for n in range(1, 7)]; L.dss(); L.needs(); [L.core(k) for k in range(3)]; L.space_sheet()
    [L.bird(n) for n in range(3, 7)]; [L.bird(n, True) for n in range(7, 11)]; [L.map_sheet(n) for n in range(3, 11)]; L.case_sheet()
    S.build_all(); W.build_all()
    return L.OUT

if __name__ == '__main__':
    out = build()
    L.write_module(ROOT + '/app/web/src/domain/templates/vertical_std_layouts.js')
    json.dump({'schema': L.SCHEMA, 'sols': S.SOLS, 'why_img': W.WHY_IMG}, open(OUT + '/schema.json', 'w'), ensure_ascii=False)
    print(len(out), 'layouts written')
