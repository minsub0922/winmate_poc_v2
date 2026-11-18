import json, sys
import layouts as L, sol_layouts as S, why_layouts as W
from paths import ROOT, OUT

def build():
    L.toc(); [L.divider(n) for n in range(1, 7)]; L.dss(); L.needs(); [L.core(k) for k in range(3)]; L.space_sheet()
    [L.bird(n) for n in range(3, 7)]; [L.bird(n, True) for n in range(7, 11)]; [L.map_sheet(n) for n in range(3, 11)]; L.case_sheet()
    S.build_all(); W.build_all()
    # 2026-11-17 — 조감도 · Map · 공간별 제품 장의 수가 공간 수와 그 공간의 제품 수에 맞도록: 공간 1 · 2곳 조감도, 2곳 Map,
    # 한 공간에 제품이 여럿일 때의 공간별 제품 장(제품 2 ~ 8). 앞의 59종 뒤에 붙여 기존 장의 순서 · 내용은 그대로 둔다.
    [L.bird(n) for n in (1, 2)]; L.map_sheet(2); [L.space_products(k) for k in range(2, L.SPACE_P_MAX + 1)]
    return L.OUT

if __name__ == '__main__':
    out = build()
    L.write_module(ROOT + '/app/web/src/domain/templates/vertical_std_layouts.js')
    json.dump({'schema': L.SCHEMA, 'sols': S.SOLS, 'why_img': W.WHY_IMG}, open(OUT + '/schema.json', 'w'), ensure_ascii=False)
    print(len(out), 'layouts written')
