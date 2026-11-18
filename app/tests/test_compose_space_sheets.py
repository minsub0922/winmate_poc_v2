"""공간별 제안 파트 — 공간 수와 공간마다의 제품 수가 조감도 · 공간별 제품 장 · Map 에서 같다 (사용자 지시 2026-11-17, 제안서 pn63a3to:
"공간별 제품에 시트 갯수는 공간 갯수와 일치해야해 … 공간의 갯수와 그 공간에서의 제품 갯수가 다 맞아야해").

offline — test_compose_auto 의 fixture library 와 fake provider 를 그대로 쓰고, 2026-11-17 에 더한 레이아웃(L_VS_BIRD_S1 · S2 ·
L_VS_MAP_2 · L_VS_SPACE_P2 ~ P8)을 생성기(app/scripts/vertical_standard/gen_layouts.py)에서 만들어 그 library 에 더한다.
"""
import copy
import importlib.util
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1].parent
HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('test_compose_auto_base', HERE / 'test_compose_auto.py')
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

NEW = ['L_VS_BIRD_S1', 'L_VS_BIRD_S2', 'L_VS_MAP_2'] + [f'L_VS_SPACE_P{k}' for k in range(2, 9)]


def _generated():
    """{f: (meta, html)} of the layouts the generator adds on 2026-11-17 (a fresh import — the generator keeps module-level lists)."""
    gen = str(ROOT / 'app' / 'scripts' / 'vertical_standard')
    sys.path.insert(0, gen)
    try:
        for m in ('gen_layouts', 'layouts', 'sol_layouts', 'why_layouts', 'paths'):
            sys.modules.pop(m, None)
        import gen_layouts
        out = gen_layouts.build()
        return {m['f']: (m, h) for m, h in out if m['f'] in NEW}
    finally:
        sys.path.remove(gen)
        for m in ('gen_layouts', 'layouts', 'sol_layouts', 'why_layouts', 'paths'):
            sys.modules.pop(m, None)


def setUpModule():
    base.setUpModule()
    S = base._STATE
    made = _generated()
    lib = S['data']['library']
    lib['layouts'].update(S['library'].build_layouts({'layouts': [m for m, _ in made.values()]}, {f: h for f, (_, h) in made.items()}))
    for cache in (S['pictures']._VX, S['pictures']._PIDX, S['pictures']._IDX, S['fill']._IDX, S['fill']._BRAND):
        cache.clear()


def tearDownModule():
    base.tearDownModule()


def plan(*spaces):
    """a space plan in the app's form — (name, [product ids]) per space, ids from the fixture vertical where the name is one of its spaces."""
    known = {s['name']: s['id'] for s in base._STATE['data']['body']['space_plan']['spaces']}
    return {'vertical': {'id': 'fb_cafe', 'name': '카페·베이커리 프랜차이즈 (AI 스토어 포함)'},
            'spaces': [{'id': known.get(n) or f'custom-space-{n}', 'name': n, 'kind': '', 'products': list(ps)} for n, ps in spaces], 'birdseye': None}


def space_part(out):
    return next(p for p in out['app_parts'] if p['name'] == '공간별 제안')


def short(pid):
    auto = base._STATE['auto']
    return auto._short(auto.load()['products_all'][pid]['name'])


class SpaceSheetCountTest(unittest.TestCase):
    def run_plan(self, sp, products=None):
        pr, body = base.request(space_plan=sp)
        if products is not None:
            pr['ctx']['products'] = products
        out, _ = base.run_req(pr, body)
        return out, space_part(out)

    def test_a_space_with_several_products_gets_one_sheet_with_all_of_them(self):
        out, part = self.run_plan(plan(('카운터·메뉴보드', ['qm55c', 'kiosk']), ('쇼케이스·진열대', ['oh55a']), ('좌석 홀', ['ac360'])))
        fs = [x['f'] for x in part['layouts']]
        sheets = [x for x in part['layouts'] if x['agent']['kind'] == 'space']
        self.assertEqual(len(sheets), 3, fs)                                      # 장 수 = 공간 수
        self.assertEqual([x['f'] for x in sheets], ['L_VS_SPACE_P2', 'L_VS_SPACE', 'L_VS_SPACE'])
        p2 = sheets[0]
        self.assertEqual(p2['ov']['t']['1'], '카운터·메뉴보드')
        self.assertEqual((p2['ov']['t']['3'], p2['ov']['t']['8']), (short('qm55c'), short('kiosk')))  # 카드마다 그 공간의 제품 이름
        self.assertEqual(p2['agent']['img']['0'].get('product'), 'qm55c')
        self.assertEqual(p2['agent']['img']['1'].get('product'), 'kiosk')
        self.assertEqual(p2['agent']['img']['2'].get('kind'), 'space')         # 마지막 사진 칸 = 그 공간의 사진
        self.assertIn('L_VS_BIRD_S3', fs)
        self.assertIn('L_VS_MAP_3', fs)

    def test_two_spaces_with_the_same_product_get_two_sheets_a_two_row_legend_and_a_two_card_map(self):
        # pn63a3to: DT 매장 · 가두 매장, QM55C in both — it showed one product sheet, a 3-row legend and a 3-card Map
        out, part = self.run_plan(plan(('DT 매장', ['qm55c']), ('가두 매장', ['qm55c'])), products=['qm55c'])
        fs = [x['f'] for x in part['layouts']]
        self.assertEqual(fs.count('L_VS_SPACE'), 2, fs)
        self.assertIn('L_VS_BIRD_S2', fs)
        self.assertIn('L_VS_MAP_2', fs)
        self.assertFalse([f for f in fs if re.fullmatch(r'L_VS_(BIRD_S[3-9]|MAP_[3-9])', f)], fs)
        bird = next(x for x in part['layouts'] if x['f'] == 'L_VS_BIRD_S2')
        self.assertEqual((bird['ov']['t']['4'], bird['ov']['t']['6']), ('DT 매장', '가두 매장'))
        # no 조감도 was rendered yet: the industry template drawing (its own five rooms) is not left on the sheet — the app fills the frame
        self.assertTrue(bird['ov']['img']['0'].get('hidden'))
        self.assertEqual(bird['agent']['img']['0'].get('flag'), 'birdseye')
        sheets = [x for x in part['layouts'] if x['f'] == 'L_VS_SPACE']
        self.assertEqual([x['ov']['t']['1'] for x in sheets], ['DT 매장', '가두 매장'])

    def test_one_space_gets_a_one_row_legend_its_sheet_and_no_map(self):
        out, part = self.run_plan(plan(('카운터·메뉴보드', ['qm55c', 'kiosk', 'oh55a'])))
        fs = [x['f'] for x in part['layouts']]
        self.assertIn('L_VS_BIRD_S1', fs)
        self.assertEqual([f for f in fs if f.startswith('L_VS_SPACE')], ['L_VS_SPACE_P3'])
        self.assertFalse([f for f in fs if f.startswith('L_VS_MAP_')], fs)
        self.assertTrue([n for n in part['notes'] if 'Map 장 제외' in n])
        p3 = next(x for x in part['layouts'] if x['f'] == 'L_VS_SPACE_P3')
        self.assertEqual([p3['ov']['t'][str(3 + 5 * j)] for j in range(3)], [short(q) for q in ('qm55c', 'kiosk', 'oh55a')])

    def test_a_given_birdseye_still_fills_the_plan_frame(self):
        sp = plan(('DT 매장', ['qm55c']), ('가두 매장', ['qm55c']))
        sp['birdseye'] = {'status': 'done', 'image': '/api/spatial/previews/test.png'}
        out, part = self.run_plan(sp, products=['qm55c'])
        bird = next(x for x in part['layouts'] if x['f'] == 'L_VS_BIRD_S2')
        self.assertEqual(bird['ov']['img']['0']['src'], '/api/spatial/previews/test.png')

    def test_a_card_cell_speaks_of_its_own_product(self):
        auto = base._STATE['auto']
        sl = {'f': 'L_VS_SPACE_P3', 'bind': {'kind': 'space', 'space': 's', 'product': 'a', 'products': ['a', 'b', 'c']}}
        self.assertEqual(auto._space_p('L_VS_SPACE_P3'), (3, 5))
        self.assertEqual(auto._space_p('L_VS_SPACE_P5'), (5, 3))
        self.assertEqual([auto._cell_product(sl, i) for i in (2, 3, 7, 8, 12, 13, 17)], ['a', 'a', 'a', 'b', 'b', 'c', 'c'])
        self.assertIsNone(auto._cell_product(sl, 18))                           # the footer is no card's
        self.assertEqual(auto._cell_product({'f': 'L_VS_SPACE', 'bind': {'product': 'a'}}, 6), 'a')


class LibraryTest(unittest.TestCase):
    def test_the_new_sheets_are_in_the_app_library_and_have_slot_modes(self):
        js = (ROOT / 'app' / 'web' / 'src' / 'domain' / 'templates' / 'vertical_std_layouts.js').read_text(encoding='utf-8')
        modes = json.loads((ROOT / 'app' / 'web' / 'src' / 'domain' / 'templates' / 'slot_modes.json').read_text(encoding='utf-8'))['layouts']
        made = _generated()
        for f in NEW:
            self.assertIn(f'"f": "{f}"', js, f)
            self.assertIn(f, modes, f)
        for k in range(2, 9):
            m, html = made[f'L_VS_SPACE_P{k}']
            self.assertEqual(m['nI'], k + 1)                                       # a cut per product + the space photo
            self.assertEqual(len(re.findall(r'data-kind="cut"', html)), k)
            self.assertEqual(modes[f'L_VS_SPACE_P{k}']['img']['product'], list(range(k)))


if __name__ == '__main__':
    unittest.main()
