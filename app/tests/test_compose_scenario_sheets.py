"""고객/공간 시나리오 파트 — 공간별 시나리오(공간 3곳씩 한 장: 공간 사진 + 그 공간 제품 컷(컷 위에 제품 이름) · 공간마다 시나리오(→) ·
솔루션 · 서비스 구분 없는 고정 줄 + 기능 on/off(선 아이콘 + 밑줄 + 기능 이름)) + 활용 맵(공간 수 시트)
(사용자 지시 2026-11-17 · 2차: "이전처럼 공간 3개에 대해서 선택된 솔루션, 서비스를 … 고정하고 on/off … 공간별 이미지와 그 공간에 매칭될 제품들을
overlay 로 … 한 공간만 사용하는 경우는 없어" · 3차: "시트에 솔루션 / 서비스 구분을 하지마 … 제품 이름은 제품 이미지에 overlay … 유저 시나리오는 공간별로 …
→ 로 연결 … 어느 공간에 매핑되는지 정보 필요없어 … 아이콘 배경 없이 밑줄 + 그 밑에 텍스트").

offline — test_compose_auto 의 fixture library 와 fake provider 를 그대로 쓰고, 2026-11-17 에 더한 장(L_TOC_SCN_S2 · S3 · MAP2–10)을
목차 장 생성기(build/toc/layouts.py)에서 만들어 그 library 에 더한다(칸 이름 toc_slots 도).
"""
import copy
import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1].parent
HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('test_compose_auto_base_scn', HERE / 'test_compose_auto.py')
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

NEW = ['L_TOC_SCN_S2', 'L_TOC_SCN_S3'] + [f'L_TOC_SCN_MAP{n}' for n in range(2, 11)]


def _generated():
    """{f: (meta, html, slots)} of the 고객/공간 시나리오 sheets (a fresh import — the generator keeps module-level lists)."""
    gen = str(ROOT / 'build' / 'toc')
    sys.path.insert(0, gen)
    try:
        for m in ('layouts', 'base', 'typed'):
            sys.modules.pop(m, None)
        import layouts
        M, H, S = layouts.build()
        return {m['f']: (m, H[m['f']], S[m['f']]) for m in M if m['f'] in NEW}
    finally:
        sys.path.remove(gen)
        for m in ('layouts', 'base', 'typed'):
            sys.modules.pop(m, None)


MADE = {}


def setUpModule():
    base.setUpModule()
    S = base._STATE
    MADE.update(_generated())
    lib = S['data']['library']
    lib['layouts'].update(S['library'].build_layouts({'layouts': [m for m, _, _ in MADE.values()]}, {f: h for f, (_, h, _) in MADE.items()}))
    for f, (_, _, slots) in MADE.items():
        lib['toc_slots'][f] = slots
    for cache in (S['pictures']._VX, S['pictures']._PIDX, S['pictures']._IDX, S['fill']._IDX, S['fill']._BRAND):
        cache.clear()


def tearDownModule():
    base.tearDownModule()


def scenario_part():
    """the 고객/공간 시나리오 part as the app sends it — 간지 · 조감도 · 활용 맵 · 공간 한 장(템플릿 덱의 예시 장 하나씩)"""
    d = base._STATE['data']
    v = copy.deepcopy(d['extra_parts']['value'])
    bird = next(x for x in v['exemplar'] if x['f'].startswith('L_VS_BIRD_'))
    v['exemplar'] = [v['exemplar'][0], bird, {'f': 'L_TOC_SCN_MAP3', 'role': '활용 맵', 't': {'0': '03 · 공간별 가치 제안 · 활용 맵'}, 'img': {}},
                     {'f': 'L_TOC_SCN_S3', 'role': '공간별 시나리오 01', 't': {'0': '03 · 공간별 가치 제안 · 공간별 시나리오 01', '1': '카운터 → 진열대 → 좌석 홀'}, 'img': {}}]
    TS = MADE['L_TOC_SCN_S3'][2]['t']
    for j, line in enumerate(['카운터에서 메뉴가 스스로 바뀌어 손님이 줄 없이 주문합니다.', '진열대 화면이 오늘의 신선 메뉴를 보여 줍니다.', '좌석 홀은 붐비는 시간에도 쾌적하게 머뭅니다.']):
        v['exemplar'][-1]['t'][str(TS[f'sc{j}'])] = line  # 앱 템플릿 덱처럼 공간마다 견본 시나리오(toc_templates.js B.value)
    v['id'] = 'x_scn'
    v['name'] = '고객/공간 시나리오'
    return v


def run_plan(spaces, products=None, solutions=None, provider=None):
    pr, body = base.request(parts=['s_cafe_std_0', 's_cafe_std_1'])
    part = scenario_part()
    body['parts'].append(part)
    pr['parts'].append({'id': part['id'], 'type': part['type'], 'name': part['name'], 'items': [], 'deck': False, 'layouts': []})
    known = {s['name']: s['id'] for s in base._STATE['data']['body']['space_plan']['spaces']}
    body['space_plan'] = {'vertical': {'id': 'fb_cafe', 'name': '카페·베이커리 프랜차이즈 (AI 스토어 포함)'}, 'birdseye': None,
                          'spaces': [{'id': known.get(n) or f'custom-{n}', 'name': n, 'kind': '', 'products': list(ps), **({'uses': u} if u is not None else {})}
                                     for n, ps, u in spaces]}
    if products is not None:
        pr['ctx']['products'] = products
    if solutions is not None:
        pr['ctx']['solutions'] = solutions
    out, _ = base.run_req(pr, body, provider=provider)
    return next(p for p in out['app_parts'] if p['name'] == '고객/공간 시나리오')


class Recording(base.Provider):
    """the fake provider, keeping every prompt (글쓰기 안내가 실제로 가는지 본다)"""
    def __init__(self):
        super().__init__()
        self.prompts = []

    def generate_json(self, *, stage, user=None, **kw):
        self.prompts.append(str(user or ''))
        return super().generate_json(stage=stage, user=user, **kw)


def T(sheet, name):
    return sheet['ov']['t'].get(str(MADE[sheet['f']][2]['t'][name]))


MAGIC = {'id': 'magicinfo', 'name': 'MagicINFO', 'kind': '솔루션'}
STPRO = {'id': 'stpro', 'name': 'SmartThings Pro', 'kind': '솔루션'}
CARE = {'id': 'care', 'name': '케어 · 유지관리 서비스', 'kind': '서비스'}


def icons_of(sheet, r, per=5):
    I = MADE[sheet['f']][2]['img']
    return [sheet['ov']['img'].get(str(I[f'ui{r}_{q}']), {}).get('src') for q in range(per)]


LABELS = json.loads((ROOT / 'app' / 'web' / 'src' / 'domain' / 'templates' / 'feature_labels.json').read_text(encoding='utf-8'))


class ScenarioSheetTest(unittest.TestCase):
    SP3 = [('카운터·메뉴보드', ['qm55c', 'kiosk'], [MAGIC, STPRO]), ('쇼케이스·진열대', ['oh55a'], [MAGIC]), ('좌석 홀', ['ac360'], [STPRO, CARE])]

    def test_three_spaces_on_one_sheet_with_products_and_fixed_rows(self):
        # 고른 서비스(케어)도 제안서 DSS 에 있어야 한다 — 고르지 않은 항목 이름은 마지막 거름(unlinked)이 지운다
        rec = Recording()
        part = run_plan(self.SP3, solutions=['magicinfo', 'stpro', 'care'], provider=rec)
        fs = [x['f'] for x in part['layouts']]
        self.assertEqual([f for f in fs if f.startswith('L_TOC_SCN_S')], ['L_TOC_SCN_S3'], fs)  # 공간 3곳 = 한 장
        self.assertEqual([f for f in fs if f.startswith('L_TOC_SCN_MAP')], ['L_TOC_SCN_MAP3'])
        a = next(x for x in part['layouts'] if x['f'] == 'L_TOC_SCN_S3')
        auto = base._STATE['auto']
        nm = lambda q: auto._short(auto.load()['products_all'][q]['name'])
        self.assertEqual([T(a, f'sp{j}') for j in range(3)], ['카운터·메뉴보드', '쇼케이스·진열대', '좌석 홀'])
        self.assertEqual([T(a, f'sp{j}n') for j in range(3)], ['1', '2', '3'])
        self.assertEqual([[T(a, f'pn{j}_{q}') for q in range(3)] for j in range(3)], [[nm('qm55c'), nm('kiosk'), ''], [nm('oh55a'), '', ''], [nm('ac360'), '', '']])  # 컷 위 제품 이름
        I = MADE['L_TOC_SCN_S3'][2]['img']
        self.assertEqual(a['agent']['img'][str(I['pc0_0'])].get('product'), 'qm55c')   # 공간 사진 위 제품 컷 = 그 공간의 제품
        self.assertEqual(a['agent']['img'][str(I['pc0_1'])].get('product'), 'kiosk')
        self.assertEqual(a['agent']['img'][str(I['pc1_0'])].get('product'), 'oh55a')
        self.assertTrue(a['ov']['img'][str(I['pc0_2'])]['src'].endswith('blank.png'), '제품이 없는 컷 칸은 빈 그림')
        self.assertEqual([a['agent']['img'][str(I[f'ph{j}'])].get('space') for j in range(3)], [base._STATE['data']['body']['space_plan']['spaces'][j]['id'] for j in range(3)])
        # 고정 줄 — 솔루션 · 서비스 구분 없이 고른 것(여러 공간이 함께 쓰는 것부터), 쓰는 공간 표시 없음
        self.assertEqual([T(a, f'un{r}') for r in range(6)], ['MagicINFO', 'SmartThings Pro', '케어 · 유지관리 서비스', '', '', ''])
        TS = MADE['L_TOC_SCN_S3'][2]['t']
        for gone in ('sc', 'pl0', 'sn0', 'sw0', 'vn0', 'vw0'):
            self.assertNotIn(gone, TS, gone)
        # 기능 아이콘 — 선 아이콘 + 밑줄(켬 · 끔), 켠 것은 이 장의 공간에서 쓰는 기능(업종 공간 자료), 꺼진 것으로 칸을 채운다 · 아래 글 = 기능 이름 · 빈 줄은 빈 그림
        for r in range(3):
            ic = icons_of(a, r)
            self.assertTrue(any(u and u.endswith('.line-on.png') for u in ic), (r, ic))
            self.assertTrue(all(u and ('.line-on.png' in u or '.line-off.png' in u) for u in ic), (r, ic))
            fids = [u.rsplit('/', 1)[1].rsplit('.line-', 1)[0] for u in ic]
            self.assertEqual([T(a, f'ul{r}_{q}') for q in range(5)], [LABELS[f] for f in fids], r)
        self.assertTrue(all(u and u.endswith('blank.png') for u in icons_of(a, 3)), '빈 줄')
        self.assertEqual([T(a, f'ul3_{q}') for q in range(5)], [''] * 5)
        self.assertTrue(T(a, 'title') and T(a, 'sc0'), '제목 · 공간 시나리오는 글쓰기가 쓴다')
        # 글쓰기 안내 — 공간마다 그 공간의 시나리오(앞 공간에서 이어지게 · 그 공간의 솔루션 · 서비스로)
        sent = '\n'.join(rec.prompts)
        for j, (nm_, _, _) in enumerate(self.SP3):
            self.assertIn(f'공간 {j + 1} “{nm_}”의 시나리오', sent, f'공간 {j + 1} 시나리오 안내')
        self.assertIn('앞 공간 “카운터·메뉴보드”에서 이어지고', sent)
        self.assertTrue(a['ov']['t']['0'].endswith(' · 공간별 시나리오 01'), a['ov']['t']['0'])

    def test_four_spaces_are_two_sheets_of_two_and_the_rows_are_the_same_on_both(self):
        sp = self.SP3 + [('베이킹 주방·제조실', ['qm55c'], [STPRO])]
        part = run_plan(sp, solutions=['magicinfo', 'stpro', 'care'])
        sets = [x for x in part['layouts'] if x['f'].startswith('L_TOC_SCN_S')]
        self.assertEqual([x['f'] for x in sets], ['L_TOC_SCN_S2', 'L_TOC_SCN_S2'])  # 4곳 → 2 + 2(한 곳만 남지 않게)
        a, b = sets
        self.assertEqual([T(b, f'sp{j}n') for j in range(2)], ['3', '4'])
        self.assertEqual([T(a, f'un{r}') for r in range(6)], [T(b, f'un{r}') for r in range(6)], '솔루션 · 서비스 줄은 모든 장이 같다')
        self.assertEqual(T(a, 'un0'), 'SmartThings Pro', '여러 공간이 함께 쓰는 것부터(공간 1 · 3 · 4)')
        r = next(r for r in range(6) if T(a, f'un{r}') == 'MagicINFO')
        self.assertTrue(any(u.endswith('.line-on.png') for u in icons_of(a, r)), '첫 장(공간 1 · 2)에서는 켬')
        self.assertTrue(all(u.endswith('.line-off.png') or u.endswith('blank.png') for u in icons_of(b, r)), '쓰지 않는 장에서는 기능이 모두 꺼짐')
        self.assertTrue(b['ov']['t']['0'].endswith(' · 공간별 시나리오 02'))

    def test_without_uses_from_the_app_a_solution_goes_where_its_products_stand(self):
        # MagicINFO 는 qm55c · oh55a 와 함께 쓰는 솔루션(with), SmartThings Pro 는 ac360 · qm55c
        part = run_plan([('카운터·메뉴보드', ['qm55c'], None), ('쇼케이스·진열대', ['oh55a'], None), ('좌석 홀', ['ac360'], None)], products=['qm55c', 'oh55a', 'ac360'], solutions=['magicinfo', 'stpro'])
        m = next(x for x in part['layouts'] if x['f'] == 'L_TOC_SCN_MAP3')
        rows = {T(m, f'rn{r}'): [T(m, f'rc{r}_{j}') for j in range(3)] for r in range(2)}
        self.assertEqual(rows, {'MagicINFO': ['●', '●', ''], 'SmartThings Pro': ['●', '', '●']})

    def test_one_space_gets_no_map_and_no_scenario_sheet(self):
        part = run_plan([('카운터·메뉴보드', ['qm55c', 'kiosk'], [MAGIC])])
        fs = [x['f'] for x in part['layouts']]
        self.assertFalse([f for f in fs if f.startswith('L_TOC_SCN_')], fs)
        self.assertTrue([n for n in part.get('notes') or [] if '활용 맵' in n] and [n for n in part.get('notes') or [] if '공간별 시나리오' in n])


class RuleTest(unittest.TestCase):
    def test_the_same_rules_as_the_app(self):
        auto = base._STATE['auto']
        self.assertEqual(auto.scn_map_groups(1), [])
        self.assertEqual([len(g) for g in auto.scn_map_groups(10)], [10])
        self.assertEqual([len(g) for g in auto.scn_map_groups(11)], [6, 5])
        rows = auto.scn_rows(['a', 'b', 'c'], {'a': [{'id': 'x', 'name': 'X', 'kind': '서비스'}, {'id': 'y', 'name': 'Y', 'kind': '솔루션'}], 'b': [{'id': 'x', 'name': 'X', 'kind': '서비스'}], 'c': []})
        self.assertEqual([(r['id'], r['spaces']) for r in rows], [('x', [0, 1]), ('y', [0])])
        many = [{'id': f's{i}', 'name': f'S{i}', 'kind': '솔루션', 'spaces': [i % 3]} for i in range(7)]
        capped = auto._scn_cap(many, 3)
        self.assertEqual([r['name'] for r in capped], ['S0', 'S1', '그 밖에 5개'])
        self.assertEqual([[len(g) for g in auto.scn_set_groups(n)] for n in (1, 2, 3, 4, 5, 7, 8, 10)], [[], [2], [3], [2, 2], [3, 2], [3, 2, 2], [3, 3, 2], [3, 3, 2, 2]])


class LibraryTest(unittest.TestCase):
    def test_the_new_sheets_are_in_the_app_library_and_have_slot_modes(self):
        js = (ROOT / 'app' / 'web' / 'src' / 'domain' / 'templates' / 'toc_layouts.js').read_text(encoding='utf-8')
        modes = json.loads((ROOT / 'app' / 'web' / 'src' / 'domain' / 'templates' / 'slot_modes.json').read_text(encoding='utf-8'))['layouts']
        for f in NEW:
            self.assertIn(f'"f": "{f}"', js, f)
            self.assertIn(f, modes, f)
            self.assertEqual(modes[f]['lock'], 'mostly', f)
        for m in (2, 3):
            I = MADE[f'L_TOC_SCN_S{m}'][2]['img']
            self.assertEqual(modes[f'L_TOC_SCN_S{m}']['img']['product'], [I[f'pc{j}_{q}'] for j in range(m) for q in range(3)])
            Tn = MADE[f'L_TOC_SCN_S{m}'][2]['t']
            self.assertEqual(modes[f'L_TOC_SCN_S{m}']['product'], [Tn[f'pn{j}_{q}'] for j in range(m) for q in range(3)])
            self.assertEqual(modes[f'L_TOC_SCN_S{m}']['solution'], sorted([Tn[f'un{r}'] for r in range(6)] + [Tn[f'ul{r}_{q}'] for r in range(6) for q in range(5)]))
            self.assertEqual(modes[f'L_TOC_SCN_S{m}']['img']['solution'], [I[f'ui{r}_{q}'] for r in range(6) for q in range(5)])
        self.assertNotIn('"f": "L_TOC_SCN_P', js, '한 공간만 쓰는 장은 없다')


if __name__ == '__main__':
    unittest.main()
