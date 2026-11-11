"""표준 건물 조감도 — verticals with more than 6 spaces.

Every space of the vertical appears exactly once, spread over 2-4 floors. Each
space is one 8 x 6.8 m cell (the module's standard room); a floor is a grid of
cells (3x1 = 24x7 m bar floor, 2x1, 3x2 = 24x15 m, 2x2).
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bird_forms as BF
from paths import OUT

CELL_W, CELL_D, GAP_X, GAP_Z = 8.0, 6.8, .22, 1.8

KIND = {
    '아트리움·중앙 광장': 'lounge', '계산대·셀프계산': 'reception', '연회장·컨벤션': 'theatre', '레스토랑·바': 'dining',
    '강당·교육장': 'theatre', '커뮤니티(라운지·피트니스·독서실)': 'lounge', '민원실': 'reception', '진료 대기실': 'lounge',
    '세미나실·강당': 'theatre', '의국·연구실': 'office', '신선식품·냉장 진열': 'retail',
}
# vid -> (facade variant, [(floor sign, cols, rows, cells)]) — floors from the ground up. cells: space numbers
# (1-based) row by row from the back row, None = open floor. Every room is one 8 x 6.8 m cell; upper floors are
# never larger than the floor below (3x2 → 3x1 → 2x1, 3x2 → 2x2).
PLAN = {
    'rt_mall': (2, [('아트리움 · 안내', 3, 1, [2, 4, 1]), ('매장 · 푸드코트', 3, 1, [3, 5, 6]), ('관제 · 기계실', 2, 1, [7, 8])]),
    'rt_hyper': (1, [('신선식품 · 계산대', 3, 1, [2, 1, 4]), ('진열 · 가전', 2, 1, [3, 5]), ('창고 · 기계실', 2, 1, [6, 7])]),
    'ht_large': (2, [('로비 · 레스토랑', 3, 1, [6, 5, 1]), ('연회장 · 백오피스', 3, 1, [4, 10, 8]), ('피트니스 · 관제', 2, 1, [7, 9]), ('객실 · 라운지', 2, 1, [2, 3])]),
    'of_hq': (0, [('로비 · 구내식당', 3, 1, [7, 1, 9]), ('업무 · 라운지', 3, 1, [5, 4, 6]), ('강당 · 대회의실', 2, 1, [8, 3]), ('임원실 · 기계실', 2, 1, [2, 10])]),
    'rs_apt': (0, [('로비 · 커뮤니티', 3, 2, [6, 8, 5, 7, 9, None]), ('세대', 2, 2, [3, 4, 1, 2])]),
    'ed_univ': (0, [('광장 · 학생식당', 3, 1, [8, 6, 9]), ('강의실 · 강당', 3, 1, [1, 2, 5]), ('도서관 · 기숙사', 3, 1, [3, 4, 7])]),
    'pb_agency': (1, [('민원실 · 구내식당', 3, 1, [6, 1, 7]), ('사무실 · 회의실', 2, 1, [2, 3]), ('상황실 · 대강당', 2, 1, [4, 5])]),
    'md_tertiary': (0, [('외래 · 진료', 3, 1, [3, 1, 2]), ('수술실 · 세미나실', 3, 1, [4, 8, 7]), ('입원 병동', 2, 1, [5, 6]), ('식당 · 기계실', 2, 1, [9, 10])]),
}


def geo(c, r, cw, rh):
    return {'x': round(c * (CELL_W + GAP_X), 3), 'z': round(r * (CELL_D + GAP_Z), 3),
            'width': round(cw * CELL_W + (cw - 1) * GAP_X, 3), 'depth': round(rh * CELL_D + (rh - 1) * GAP_Z, 3)}


def plan_floors(vid):
    vp = next(v for v in BF.VP['verticals'] if v['id'] == vid)
    fv, floors = PLAN[vid]
    spaces = vp['spaces']
    used = [n for *_, cells in floors for n in cells if n]
    assert sorted(used) == list(range(1, len(spaces) + 1)), (vid, sorted(used))
    group = vp['group']
    ind = BF.IND.get(group, group)
    out, prev = [], None
    for level, (sign, cols, rows, cells) in enumerate(floors, 1):
        assert len(cells) == cols * rows, (vid, level)
        assert not prev or (cols <= prev[0] and rows <= prev[1]), (vid, level)
        prev = (cols, rows)
        rr = []
        for k, n in enumerate(cells):
            if not n: continue
            sp = spaces[n - 1]
            kind = KIND.get(sp['name']) or BF.kind_of(sp['name'])
            rr.append({'id': f'{vid}-{level}f-s{n}', 'space': n, 'name': sp['name'], 'kind': kind, 'geo': geo(k % cols, k // cols, 1, 1),
                       'products': BF.room_products(sp, kind)})
        out.append({'id': f'std-{vid}-{level}f', 'vid': vid, 'level': level, 'name': f'{level}F {sign}', 'sign': sign, 'ind': ind,
                    'style': BF.STYLE.get(group, 'modern'), 'w': round(cols * CELL_W + (cols - 1) * GAP_X, 3), 'd': round(rows * CELL_D + (rows - 1) * GAP_Z, 3), 'rooms': rr})
    return fv, out


if __name__ == '__main__':
    allf, meta = [], {}
    for vid in PLAN:
        fv, fl = plan_floors(vid)
        allf += fl
        meta[vid] = {'fv': fv, 'floors': [f['id'] for f in fl], 'signs': [f['sign'] for f in fl]}
        for f in fl:
            print(f['id'], ' / '.join(f"{r['space']}.{r['name']}={r['kind']}({len(r['products'])})" for r in f['rooms']))
    json.dump({'floors': allf, 'meta': meta}, open(OUT + '/bld_floors.json', 'w'), ensure_ascii=False, indent=1)
