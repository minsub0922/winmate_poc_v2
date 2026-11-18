"""사진 속 정확한 제품(품목) — 사용자 지시 2026-11-18:
"공간 이미지의 경우 정확한 품목이 포함된 이미지야. 그래서 세탁기여도 다른 세탁기면 가져오면 에러야. 이를 이미지 메타데이터에도 등록하고 이미지 탐색
로직에도 적용해서 이러한 에러가 없도록 개선해. 공간인데 제품이 없을수도 있는데 이러한 경우는 상관없는거야."

  메타데이터  composer/items.py — 사진마다 출처가 말하는 정확한 제품(items · items_how) · 제품 노출(shows: item · none · unknown) · 보이는 제품군
  탐색 로직   composer/pictures.py item_reject — 공간 사진 칸: 제품 없음 · 그 공간의 제품만 / 그 밖의 사진 칸: 확인된 다른 제품 금지

offline — test_compose_auto 의 fixture library 에 이 테스트의 사진 · 제품을 더해서 본다(마지막 한 건만 실제 라이브러리를 메모리에 만든다).
  app/.venv/bin/python -m pytest app/tests/test_picture_items.py -q
"""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1].parent
HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('test_compose_auto_items_base', HERE / 'test_compose_auto.py')
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

WASHER_A = {'id': 'wash_a', 'name': 'AI 세탁기 21kg', 'model': 'WF21DG6650BV', 'specModel': 'WF21DG6650BV', 'cat': '세탁기', 'fam': '주방 · 리빙 가전'}
WASHER_B = {'id': 'wash_b', 'name': '상업용 세탁기', 'model': 'WF18A9100KV', 'specModel': 'WF18A9100KV', 'cat': '세탁기', 'fam': '주방 · 리빙 가전'}
WASHER_B_CURATED = {'id': 'laundry_cur', 'name': '상업용 세탁 · 건조기', 'model': 'Commercial Laundry', 'specModel': 'WF18A9100KV', 'cat': '상업용 세탁 · 건조',
                    'fam': '주방 · 리빙 가전', 'cur': True}
# an e-카탈로그 row lists the combinations it is sold in — that must not make the two washers one item
CATALOG_PAGE = {'id': 'ec_wash', 'name': '세탁기 라인업', 'model': 'WW13BB844DGB', 'models': ['WF21DG6650BV', 'WF18A9100KV'], 'cat': '세탁기', 'fam': '주방 · 리빙 가전'}
SPACE = 'fb_cafe_s3'  # 좌석 홀 of the fixture vertical


def setUpModule():
    base.setUpModule()


def tearDownModule():
    base.tearDownModule()


def photo(src, desc, *, shows='none', items=(), fams=(), how=''):
    """a scene photo of the 좌석 홀 the way the library registers it (what the caption says · what the vision pass saw · its items)."""
    it = base.scene_photo(src, desc, desc, '카페·베이커리')
    it.update({'shows': shows, 'items': list(items), 'items_how': how or ('lib_site_pdp' if items else ''), 'item_fams': list(fams)})
    if shows != 'none':
        it['vf']['products'] = [f for f in fams] or ['display']
    return it


def library_with(*photos, products=(WASHER_A, WASHER_B, WASHER_B_CURATED, CATALOG_PAGE)):
    from composer import items as I

    def mut(lib):
        base.with_profiles(lib)
        for p in products:
            lib['products_all'][p['id']] = {**p, 'cur': bool(p.get('cur'))}
        lib['item_keys'] = {**(lib.get('item_keys') or {}), **I.item_keys(list(products))}
        for it in photos:
            lib['images'][it['src']] = it
    return base.patched_library(mut)


def context(space_products, products=None):
    spaces = [{'id': SPACE, 'name': '좌석 홀', 'products': list(space_products)}]
    return {'ind': 'FB', 'vertical': 'fb_cafe', 'products': list(products if products is not None else space_products), 'solutions': [], 'cases': [],
            'spaces': spaces, 'space_by_id': {s['id']: s for s in spaces}, 'who': 'A 커피', 'customer': 'A 커피'}


def space_slot(product=None):
    return {'key': '1', 'kind': 'space', 'bind': {'space': SPACE, 'product': product}, 'near': '좌석 홀', 'title': '', 'hint': '', 'part_type': 'products',
            'fit': 'cover', 'w': 544, 'h': 512, 'families': set(), 'orig': None, 'osrc': '', 'message': ''}


SCENE = {'key': '0', 'kind': 'scene', 'bind': {}, 'near': '', 'title': '', 'hint': '', 'part_type': 'value', 'fit': 'cover', 'w': 960, 'h': 540,
         'families': set(), 'orig': None, 'osrc': '', 'message': ''}


class ItemIdentityTest(unittest.TestCase):
    def test_one_item_in_two_catalogs_is_one_item_and_a_listed_combination_is_not(self):
        from composer import items as I
        t = I.item_keys([WASHER_A, WASHER_B, WASHER_B_CURATED, CATALOG_PAGE])
        self.assertEqual(I.same_items(['laundry_cur'], ['wash_b'], t), ['laundry_cur'], 'the curated row and its DSS row share their own model code')
        self.assertEqual(I.same_items(['wash_a'], ['wash_b'], t), [], 'two washers are two items')
        self.assertEqual(I.same_items(['ec_wash'], ['wash_a'], t), [], 'a catalog page that lists a model in its combinations is not that model')
        self.assertEqual(I.same_items(['wash_a', 'qm55c'], ['qm55c'], t), ['qm55c'])


class RegisteredItemsTest(unittest.TestCase):
    """composer.items.annotate — the source says which item a photo shows; a caption's generic word never does."""

    def test_items_come_from_the_source_or_a_model_code_or_a_curated_name(self):
        from composer import items as I
        products = [{'id': 'qm55c', 'name': '스마트 사이니지 QM55C', 'model': 'QM55C', 'fam': '디스플레이', 'cur': True},
                    {'id': 'ac360', 'name': '360 카세트', 'model': '360 Cassette', 'fam': '공조 · 에어컨', 'cur': True},
                    {'id': 'watch', 'name': '갤럭시 워치', 'model': 'Galaxy Watch', 'fam': '모바일 · PC', 'cur': True}, WASHER_A]
        vf = lambda *fams: {'shows': '', 'place': '카페·베이커리', 'products': list(fams) or ['none'], 'kind': 'photo', 'quality': 'good'}
        images = {
            'page.jpg': {'cls': 'scene', 'desc': '빨래방 벽면의 세탁기', 'items': ['wash_a'], 'items_how': 'lib_site_pdp', 'vf': vf('appliance')},
            'generic.jpg': {'cls': 'scene', 'desc': '메뉴보드가 걸린 카페 카운터', 'vf': vf('display')},
            'code.jpg': {'cls': 'scene', 'desc': '아침 시간대 메뉴 화면 · QM55C 3면', 'vf': vf('display')},
            'name.jpg': {'cls': 'scene', 'desc': '카페 좌석과 천장의 360 카세트', 'vf': vf('hvac')},
            'case.jpg': {'cls': 'scene', 'desc': '직원과 고객이 키오스크로 주문하는 모습', 'names': ['직원과 고객이 키오스크로 주문하는 모습',
                                                                                 '직원과 고객이 키오스크로 주문하는 모습 · 롯데시네마 – 갤럭시 탭, 갤럭시 워치'], 'vf': vf('display')},
            'empty.jpg': {'cls': 'scene', 'desc': '창가 좌석이 이어진 카페 홀', 'vf': vf()},
            'washer.jpg': {'cls': 'scene', 'desc': '빨래방에 줄지어 선 세탁기', 'vf': vf()},
            'unseen.jpg': {'cls': 'scene', 'desc': '카페 홀'},
        }
        counts = I.annotate(images, products)
        self.assertEqual((images['page.jpg']['shows'], images['page.jpg']['items'], images['page.jpg']['items_how']), ('item', ['wash_a'], 'lib_site_pdp'))
        self.assertEqual((images['generic.jpg']['shows'], images['generic.jpg']['items']), ('unknown', []), "'메뉴보드' names a kind of product, not an item")
        self.assertEqual((images['code.jpg']['items'], images['code.jpg']['items_how']), (['qm55c'], 'caption_model'))
        self.assertEqual((images['name.jpg']['items'], images['name.jpg']['items_how']), (['ac360'], 'caption_name'))
        self.assertEqual(images['case.jpg']['items'], [], "a case title appended to another name speaks of the case, not of this frame")
        self.assertEqual(images['empty.jpg']['shows'], 'none', 'no product seen, none named')
        self.assertEqual(images['washer.jpg']['shows'], 'unknown', 'the caption says a washer is in view')
        self.assertEqual(images['unseen.jpg']['shows'], 'unknown', 'never looked at: nobody can say no product is in view')
        self.assertEqual(sum(counts.values()), len(images))


class VisionItemsTest(unittest.TestCase):
    """(b) 2026-11-18 — a photo no source names: the vision check (scripts/identify_items.py → image_items.json → images[src]['vi'])."""

    def test_a_photo_takes_the_vision_items_only_when_every_main_product_was_confirmed(self):
        from composer import items as I
        products = [WASHER_A, WASHER_B]
        vf = {'shows': '', 'place': '편의점·소형 매장', 'products': ['appliance'], 'kind': 'photo', 'quality': 'good'}
        images = {
            'sure.jpg': {'cls': 'scene', 'desc': '빨래방 벽면의 세탁기', 'vf': vf, 'vi': {'items': ['wash_b'], 'complete': True, 'seen': ['laundry']}},
            'partial.jpg': {'cls': 'scene', 'desc': '빨래방 벽면의 세탁기', 'vf': vf, 'vi': {'items': ['wash_b'], 'complete': False, 'seen': ['laundry', 'tv']}},
            'source.jpg': {'cls': 'scene', 'desc': '빨래방 벽면의 세탁기', 'vf': vf, 'items': ['wash_a'], 'items_how': 'lib_site_pdp',
                           'vi': {'items': ['wash_b'], 'complete': True}},
        }
        I.annotate(images, products)
        self.assertEqual((images['sure.jpg']['shows'], images['sure.jpg']['items'], images['sure.jpg']['items_how']), ('item', ['wash_b'], 'vision'))
        self.assertEqual((images['partial.jpg']['shows'], images['partial.jpg']['items']), ('unknown', []),
                         'a main product nobody confirmed keeps the photo unknown')
        self.assertEqual((images['source.jpg']['items'], images['source.jpg']['items_how']), (['wash_a'], 'lib_site_pdp'), "the source speaks first")

    def test_the_check_registers_only_what_both_verifiers_confirmed(self):
        import sys
        sys.path.insert(0, str(ROOT / 'poc' / 'test' / 'scenario_composer' / 'scripts'))
        import identify_items as X
        row = lambda **kw: {'type': 'laundry', 'main': True, 'same': ['wash_b'], 'sure': True, **kw}
        self.assertTrue(X.verdict([row(verified=True)])['complete'])
        self.assertFalse(X.verdict([row(verified=False)])['complete'], 'one verifier said different')
        self.assertFalse(X.verdict([row(verified=True), row(type='tv', same=[], sure=False)])['complete'], 'a main TV nobody matched')
        self.assertTrue(X.verdict([row(verified=True), row(type='tv', main=False, same=[], sure=False)])['complete'], 'a small TV far away does not decide')
        self.assertEqual(X.verdict([row(verified=True), row(type='tv', main=False, same=[], sure=False)])['items'], ['wash_b'])
        by_type = {'laundry': [{'name': '상업용 세탁기', 'pids': ['wash_b'], 'ref': 'x', 'cur': False, 'kw': ''}], 'tablet': [{'name': '탭', 'pids': ['t'], 'ref': 'y', 'cur': False, 'kw': ''}]}
        self.assertEqual(X.to_match({'type': 'tablet', 'main': False}, by_type), "in somebody's hand")
        self.assertEqual(X.to_match({'type': 'laundry', 'main': True, 'brand': 'other'}, by_type), 'other brand')
        self.assertEqual(X.to_match({'type': 'laundry', 'main': True, 'brand': 'samsung'}, by_type), '')
        self.assertEqual(X.VERIFY_MODELS, ('gemini-3.8-flash', 'gemini-3.1-pro-preview'))

    def test_products_are_sorted_into_what_one_sees(self):
        from composer import item_types as T
        kinds = {'qm55c': ({'name': '스마트 사이니지 QM55C', 'cat': 'LCD 사이니지', 'sc': '스마트 LCD 사이니지', 'fam': '디스플레이'}, 'sign'),
                 'kiosk': ({'name': '삼성 키오스크 KM24C', 'cat': '키오스크', 'sc': '키오스크', 'fam': '디스플레이'}, 'kiosk'),
                 'qled': ({'name': '2025 Neo QLED QNF90', 'cat': 'TV', 'sc': 'TV', 'fam': '디스플레이'}, 'tv'),
                 'c360': ({'name': '시스템에어컨 360 (Wi-Fi 내장형)', 'cat': '시스템에어컨', 'sc': '시스템에어컨', 'fam': '공조 · 에어컨'}, 'c360'),
                 'book360': ({'name': '갤럭시 북5 Pro 360', 'cat': '노트북', 'sc': '노트북', 'fam': '모바일 · PC'}, 'laptop'),
                 'compact': ({'name': 'DVM S Compact', 'cat': '중소건물용 실내외기', 'sc': '중소건물용 실내외기', 'fam': '공조 · 에어컨'}, 'outunit'),
                 'laundry': ({'name': '상업용 세탁기', 'cat': '세탁기', 'sc': '세탁기', 'fam': '주방 · 리빙 가전'}, 'laundry'),
                 'dryer': ({'name': 'Bespoke AI 건조기', 'cat': '건조기', 'sc': '건조기', 'fam': '주방 · 리빙 가전'}, 'dryer'),
                 'remote': ({'name': '무선 리모컨', 'cat': '시스템에어컨 › 판넬 및 옵션', 'sc': '시스템에어컨 · 액세서리', 'fam': '공조 · 에어컨'}, ''),
                 'ehs': ({'name': 'EHS 히트펌프 보일러', 'cat': '히트펌프', 'sc': '바닥난방/급탕 솔루션', 'fam': '공조 · 에어컨'}, 'heatpump'),
                 'rugged': ({'name': '갤럭시 엑스커버7 프로', 'cat': '갤럭시 스마트폰', 'sc': '스마트폰', 'fam': '모바일 · PC'}, 'phone')}
        for pid, (p, want) in kinds.items():
            self.assertEqual(T.of_product(p), want, pid)


class SpacePhotoItemsTest(unittest.TestCase):
    """composer.pictures.item_reject in rule_reject — never relaxed."""

    def test_a_photo_of_another_washer_never_stands_for_the_space(self):
        P = base._STATE['pictures']
        a = photo('img/test/wash-a.jpg', '좌석 홀 옆 세탁 코너의 세탁기', shows='item', items=['wash_a'], fams=['appliance'])
        b = photo('img/test/wash-b.jpg', '좌석 홀 옆 세탁 코너의 세탁기', shows='item', items=['wash_b'], fams=['appliance'])
        cur = photo('img/test/wash-cur.jpg', '좌석 홀 옆 세탁 코너의 세탁기', shows='item', items=['laundry_cur'], fams=['appliance'])
        unknown = photo('img/test/wash-x.jpg', '좌석 홀 옆 세탁 코너의 세탁기', shows='unknown', fams=['appliance'])
        empty = photo('img/test/hall.jpg', '좌석 홀의 테이블과 손님')
        with library_with(a, b, cur, unknown, empty):
            ctx = context(['wash_b'])
            slot = space_slot('wash_b')
            self.assertEqual(P.rule_reject(a['src'], slot, ctx), 'other_item', 'a washer, but another washer')
            self.assertEqual(P.rule_reject(b['src'], slot, ctx), '')
            self.assertEqual(P.rule_reject(cur['src'], slot, ctx), '', 'the same washer in the curated catalog (same model code)')
            self.assertEqual(P.rule_reject(unknown['src'], slot, ctx), 'unverified_item', 'a washer nobody can name may be another one')
            self.assertEqual(P.rule_reject(empty['src'], slot, ctx), '', 'a space photo with no product in it is fine')
            self.assertEqual(P.rule_reject(a['src'], {**slot, 'families': set()}, ctx, relax=True), 'other_item', 'never relaxed')
            cands = [c['src'] for c in P.candidates(slot, ctx, set(), 12)]
            self.assertNotIn(a['src'], cands)
            self.assertNotIn(unknown['src'], cands)
            self.assertIn(b['src'], cands)
            self.assertEqual(cands[0], b['src'], 'the space with its own washer in view comes first')
            first = P.scene_candidates(slot, ctx, set(), 1)[0]
            self.assertIn('item_exact', first['why'])

    def test_a_phone_in_somebodys_hand_is_not_an_item_of_the_space(self):
        P = base._STATE['pictures']
        people = photo('img/test/phones.jpg', '좌석 홀에서 휴대폰을 보는 손님', shows='unknown', fams=['mobile'])
        with library_with(people, products=(WASHER_B, {'id': 'tab', 'name': '갤럭시 탭', 'model': 'SM-X930', 'fam': '모바일 · PC'})):
            self.assertEqual(P.rule_reject(people['src'], space_slot('wash_b'), context(['wash_b'])), '')
            self.assertEqual(P.rule_reject(people['src'], space_slot('tab'), context(['tab'])), 'unverified_item',
                             'a space that gets tablets: a tablet nobody can name may be another one')

    def test_the_spaces_item_with_another_kind_of_product_beside_it(self):
        P = base._STATE['pictures']
        both = photo('img/test/wash-tv.jpg', '좌석 홀 세탁기와 벽면 TV', shows='item', items=['wash_b'], fams=['appliance', 'display'])
        with library_with(both):
            self.assertEqual(P.rule_reject(both['src'], space_slot('wash_b'), context(['wash_b'])), 'other_item_kind')
            self.assertEqual(P.rule_reject(both['src'], space_slot('wash_b'), context(['wash_b', 'qm55c'])), '', 'the space gets a display too')

    def test_a_space_without_products_shows_none_or_one_the_customer_selected(self):
        P = base._STATE['pictures']
        mine = photo('img/test/mine.jpg', '좌석 홀 세탁 코너', shows='item', items=['wash_b'], fams=['appliance'])
        other = photo('img/test/other.jpg', '좌석 홀 세탁 코너', shows='item', items=['wash_a'], fams=['appliance'])
        with library_with(mine, other):
            ctx = context([], products=['wash_b'])
            self.assertEqual(P.rule_reject(mine['src'], space_slot(), ctx), '')
            self.assertEqual(P.rule_reject(other['src'], space_slot(), ctx), 'other_item')

    def test_a_chapter_photo_known_to_show_an_unselected_item_is_not_used(self):
        P = base._STATE['pictures']
        other = photo('img/test/ch-other.jpg', '좌석 홀 세탁 코너', shows='item', items=['wash_a'], fams=['appliance'])
        unknown = photo('img/test/ch-unknown.jpg', '좌석 홀 세탁 코너', shows='unknown', fams=['appliance'])
        with library_with(other, unknown):
            ctx = context(['wash_b'])
            self.assertEqual(P.item_reject(other['src'], SCENE, ctx), 'other_item')
            self.assertEqual(P.item_reject(unknown['src'], SCENE, ctx), '', 'a chapter photo keeps the product-family rules')

    def test_the_space_frame_stays_empty_rather_than_show_another_item(self):
        """every photo of the library shows a product nobody can name — the space sheet's photo frame is hidden with a note."""
        P = base._STATE['pictures']
        lib0 = base._STATE['data']['library']

        def blur(lib):
            base.with_profiles(lib)
            for it in lib['images'].values():
                if it.get('cls') in ('scene', 'kv'):
                    it.update({'shows': 'unknown', 'items': [], 'item_fams': ['display']})
        self.assertIn('L_VS_SPACE', lib0['layouts'])
        with base.patched_library(blur):
            ctx = context(['qm55c'])
            slide = {'f': 'L_VS_SPACE', 't': {'1': '좌석 홀'}, 'ex_img': {}, 'bind': {'kind': 'space', 'space': SPACE, 'product': 'qm55c', 'products': ['qm55c']}}
            part = {'id': 'space', 'type': 'space', 'name': '공간별 제안'}
            P.fill_part_images(ctx, part, [slide], None, P.PictureRegistry(), verify=False, pick='rank')
            frames = [(k, v, slide['img_meta'].get(k) or {}) for k, v in slide['img'].items()]
            space = [x for x in frames if x[2].get('kind') == 'space']
            self.assertTrue(space, frames)
            for k, v, m in space:
                self.assertTrue(v.get('hidden'), (k, v, m))
                self.assertEqual(m.get('flag'), 'no_space_photo')
            self.assertTrue(any('좌석 홀' in w for w in part.get('warnings') or []), part.get('warnings'))

    def test_whatever_the_fixture_deck_chooses_for_a_space_shows_its_own_items_or_none(self):
        out, _, _ = base.run()
        IM = base._STATE['data']['library']['images']
        table = base._STATE['data']['library'].get('item_keys') or {}
        from composer import items as I
        spaces = {p['id']: p for p in (out.get('plan') or {}).get('spaces') or []}
        checked = 0
        for part, f, k, src, m in base.shown(out):
            if m.get('kind') != 'space' or (IM.get(src) or {}).get('cls') not in ('scene', 'kv'):
                continue
            it = IM[src]
            own = (spaces.get(m.get('space')) or {}).get('products') or []
            installed = set(it.get('item_fams') or []) - {'mobile'}
            ok = it.get('shows') == 'none' or (it.get('shows') == 'item' and I.same_items(it.get('items') or [], own, table)) or \
                (it.get('shows') == 'unknown' and not installed)
            self.assertTrue(ok, (part, f, k, src, it.get('shows'), it.get('items'), own))
            checked += 1
        self.assertGreaterEqual(checked, 1, 'the 좌석 홀 (360 카세트) keeps a photo of its own 360 카세트')
        # a space whose photos all show other or unknown items keeps an empty frame — said in the part's notes, never a photo of another item
        hidden = [(p['name'], x['agent']['img'].get(k) or {}) for p in out['app_parts'] for x in p['layouts'] for k, v in x['ov']['img'].items()
                  if isinstance(v, dict) and v.get('hidden') and (x['agent']['img'].get(k) or {}).get('kind') == 'space']
        notes = ' '.join(n for p in out['app_parts'] for n in p.get('notes') or [])
        for name, m in hidden:
            self.assertEqual(m.get('flag'), 'no_space_photo')
        if hidden:
            self.assertIn('이 공간의 제품에 맞는 사진', notes)


class LegacyFillTest(unittest.TestCase):
    def test_the_older_layouts_step_follows_the_same_rule(self):
        """step 'layouts' ('장표 자동 완성' — composer.fill.candidates): the customer's own place shows none or one of the customer's items."""
        fill = base._STATE['fill']
        a = photo('img/test/legacy-a.jpg', '좌석 홀 세탁 코너의 세탁기', shows='item', items=['wash_a'], fams=['appliance'])
        b = photo('img/test/legacy-b.jpg', '좌석 홀 세탁 코너의 세탁기', shows='item', items=['wash_b'], fams=['appliance'])
        unknown = photo('img/test/legacy-x.jpg', '좌석 홀 세탁 코너의 세탁기', shows='unknown', fams=['appliance'])
        empty = photo('img/test/legacy-hall.jpg', '좌석 홀의 테이블과 손님')
        with library_with(a, b, unknown, empty):
            slot = {'cls': 'scene', 'target': '좌석 홀 세탁 코너', 'hint': '공간 사진', 'alt': '', 'near': '좌석 홀 세탁 코너', 'products': [],
                    'part_type': 'space', 'strict': True}
            inp = {'products': ['wash_b'], 'cases': [], 'solutions': [], 'ind': 'FB', 'customer': 'A 커피', 'title': ''}
            got = [c['src'] for c in fill.candidates(slot, inp, {'industry': 'FB', 'spaces': ['좌석 홀']}, set(), set(), k=400)]
            got_relaxed = [c['src'] for c in fill.candidates(slot, inp, {'industry': 'FB', 'spaces': ['좌석 홀']}, set(), set(), k=400, relax=True)]
        self.assertIn(b['src'], got)
        self.assertIn(empty['src'], got)
        for src in (a['src'], unknown['src']):
            self.assertNotIn(src, got)
            self.assertNotIn(src, got_relaxed)


class ProductCutTest(unittest.TestCase):
    def test_a_product_without_any_cut_shows_its_own_photo_in_place(self):
        P = base._STATE['pictures']
        own = photo('img/lib/test.json#0', '360 카세트 · 노출 천장에 설치된 360 카세트', shows='item', items=['solo'], fams=['hvac'])
        own['group'] = 'lib'
        with library_with(own, products=({'id': 'solo', 'name': '360 카세트', 'model': '360 Cassette', 'fam': '공조 · 에어컨'},)):
            self.assertEqual(P.product_cut('solo'), own['src'])
            self.assertEqual(P.product_scenes('solo'), [own['src']])


class BrowserTableTest(unittest.TestCase):
    def test_the_web_app_reads_the_same_items(self):
        """GET /api/picture-items — scene photos only: [shows, items, families] (services/picture-items.js judges space frames with it)."""
        from app.api.poc import picture_items
        exact = photo('img/test/table-a.jpg', '좌석 홀 세탁 코너', shows='item', items=['wash_b'], fams=['appliance'])
        with library_with(exact):
            picture_items._compact.cache_clear()
            table = picture_items.public()
            picture_items._compact.cache_clear()
        self.assertEqual(table['images']['img/test/table-a.jpg'], ['i', ['wash_b'], ['appliance']])
        self.assertTrue(all(code in ('i', 'n', 'u') for code, _, _ in table['images'].values()))
        self.assertEqual(sorted(table['keys']['laundry_cur']), ['WF18A9100KV'])
        IM = base._STATE['data']['library']['images']
        self.assertFalse([src for src in table['images'] if (IM.get(src) or {}).get('cls') == 'product'], 'product cuts are their product by definition')


LIBRARY = ROOT / 'app' / 'data' / 'runtime' / 'composer' / 'library.json'
KB = ROOT / 'app' / 'data' / 'runtime' / 'kb' / 'catalog.json'


@unittest.skipUnless(LIBRARY.exists() and KB.exists(), 'composer KB / scenario export not built')
class RealLibraryTest(unittest.TestCase):
    """the real library build (in memory — the runtime file stays the server's) registers the items of every picture."""

    @classmethod
    def setUpClass(cls):
        library = base._STATE['library']
        cls.lib = library.build(write=False)

    def test_product_library_scenes_are_scenes_with_their_products(self):
        IM = self.lib['images']
        lib_scenes = [it for it in IM.values() if it.get('group') == 'lib' and it.get('cls') == 'scene']
        self.assertGreater(len(lib_scenes), 500, 'the product image library scenes (k: scene) are scenes, not product cuts')
        self.assertTrue(all(it['shows'] == 'item' and it['items'] and it['items_how'].startswith('lib_') for it in lib_scenes))
        it = IM['img/lib/p00.json#135']
        self.assertEqual((it['cls'], it['shows']), ('scene', 'item'))
        self.assertIn('ac360', it['items'])
        self.assertTrue(it.get('vf'), 'looked at by the vision pass (image_facts.json)')

    def test_case_photos_of_a_kind_of_product_are_not_an_item_and_empty_rooms_are_none(self):
        IM = self.lib['images']
        laundromat = IM['img/media/g1.json#576']  # '벽면에 층층이 설치된 상업용 세탁기·건조기' — a case photo: no source names the washer
        if (laundromat.get('vi') or {}).get('complete'):
            # the vision check matched it (two models confirmed) — then it is the commercial washer, never a household one
            self.assertEqual((laundromat['shows'], laundromat['items_how']), ('item', 'vision'))
            from composer import items as I
            self.assertTrue(I.same_items(laundromat['items'], ['laundry', 'sg_g000180288'], self.lib['item_keys']), laundromat['items'])
        else:
            self.assertEqual((laundromat['shows'], laundromat['items']), ('unknown', []))
        self.assertIn('appliance', laundromat['item_fams'])
        shows = {it['shows'] for it in IM.values() if it.get('cls') in ('scene', 'kv')}
        self.assertEqual(shows, {'item', 'none', 'unknown'})

    def test_vision_items_come_only_from_complete_confirmed_checks(self):
        IM = self.lib['images']
        vision = [it for it in IM.values() if it.get('items_how') == 'vision']
        for it in vision:
            self.assertTrue(it['vi']['complete'], it.get('desc'))
            self.assertEqual(it['shows'], 'item')
        unconfirmed = [it for it in IM.values() if it.get('vi') and not it['vi'].get('complete') and not str(it.get('items_how') or '').startswith(('lib_', 'app_', 'gallery', 'caption'))]
        self.assertTrue(all(it['shows'] != 'item' for it in unconfirmed))

    def test_the_curated_and_the_dss_row_of_one_washer_are_one_item(self):
        from composer import items as I
        self.assertEqual(I.same_items(['laundry'], ['sg_g000180288'], self.lib['item_keys']), ['laundry'])
        self.assertEqual(I.same_items(['sg_g000181648'], ['sg_g000181609'], self.lib['item_keys']), [], 'two indoor units sold with one outdoor unit')


if __name__ == '__main__':
    unittest.main()
