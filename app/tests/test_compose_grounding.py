"""App composition contracts, independent of the historical composer fixtures."""
import copy
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.api.poc import compose_grounding as g
from app.api.poc.adapters import compose


class GroundingTest(unittest.TestCase):
    def test_raw_requirements_keep_tail_and_more_than_eight_needs(self):
        text = '\n'.join(f'- 요구 {n}: 운영 항목을 검증' for n in range(40))
        rows = g.source_rows({'free_text': text, 'note': '시범 매장 10곳 · 8주 파일럿 착수 승인',
                              'files': [{'name': 'RFP', 'text': '긴 본문 ' * 700 + '\n최종 책임자 승인 필요'}]})
        self.assertEqual(len(rows), 43)
        self.assertEqual(rows[-1]['text'], '최종 책임자 승인 필요')
        self.assertIn('8주', rows[40]['text'])

    def test_oversize_input_is_rejected_instead_of_silently_truncated(self):
        with self.assertRaisesRegex(ValueError, '생략하지'):
            g.source_rows({'free_text': '\n'.join('요구' for _ in range(161))})

    def test_source_identity_includes_stakeholder_and_conflicting_values(self):
        rows = g.source_rows({'free_text': '전국 278개 매장\n■ 가맹사업팀 (10%)\n- 초기 비용 완화', 'note': '전국 320개 매장'})
        self.assertEqual(rows[-1]['text'], '전국 320개 매장')
        self.assertIn('가맹사업팀', rows[2]['speaker'])
        self.assertEqual(len({x['id'] for x in rows}), 4)

    def test_coverage_receipt_must_quote_final_saved_text(self):
        req = [{'id': 'R1'}, {'id': 'R2'}]
        slides = [{'t': {'1': '시범 10곳 · 8주 승인 요청'}}]
        errors = g.coverage_errors(req, [{'id': 'R1', 's': 0, 'quote': '가격 오류 원천 차단'}], slides)
        self.assertTrue(any('최종 문구' in x for x in errors))
        self.assertIn('요구 답변 누락: R2', errors)
        self.assertTrue(g.coverage_errors(req, [{'id': 'R9', 's': 0, 'quote': '8주'}], slides))

    def test_spec_cards_replace_title_model_labels_and_images_together(self):
        names = {'nm0': 2, 'md0': 3, 'sl0_0': 4, 'sv0_0': 5, 'sl0_1': 6, 'sv0_1': 7, 'sl0_2': 8, 'sv0_2': 9}
        for n in (1, 2):
            names.update({k.replace('0', str(n), 1): v + n * 8 for k, v in list(names.items())[:8]})
        products = {'ac': {'name': '중대형에어컨 냉난방 Bespoke', 'model': 'AP083BNPPBH6', 'cat': '공조', 'spec': '냉방 8.30 kW', 'spaces': ['매장']}}
        auto = SimpleNamespace(load=lambda: {'toc_slots': {'L_TOC_SPEC': {'t': names}}, 'products_all': products}, product_cut=lambda q: None)
        sl = {'f': 'L_TOC_SPEC', 'bind': {'products': ['ac']}, 'ex_t': {'2': '키오스크', '6': '결제', '7': '카드·간편결제'}}
        g.bind_spec(auto, {}, sl)
        self.assertEqual(sl['lock']['2'], products['ac']['name'])
        self.assertEqual(sl['lock']['3'], 'AP083BNPPBH6')
        self.assertNotIn('결제', ' '.join(sl['lock'].values()))
        self.assertEqual(sl['img_bind']['0']['product'], 'ac')
        self.assertTrue(sl['ex_img']['1']['hidden'])

    def test_spec_picture_is_kept_when_the_picture_picker_finds_a_cut(self):
        """p54x1hjb (2026-11-18): 호텔 TV · DVM S2 have no catalog th / gal but a product cut file (img/bs/p-hg55bu.png …) —
        the spec sheet hid its picture while every other sheet showed the same product's cut. "Has a picture" is the
        picture stage's own answer (product_cut), not the catalog's thumbnail fields."""
        products = {'tv': {'name': '호텔 TV 55" (HBU)', 'model': 'HG55BU', 'cat': '호텔 TV', 'th': None, 'gal': [],
                           'specs': ['화면 크기: 55"', 'OS: Tizen', '해상도: 4K']},
                    'tag': {'name': '스마트태그2', 'model': 'EI-T5600', 'cat': '태그', 'th': None, 'gal': [], 'specs': ['배터리: 500일']}}
        cuts = {'tv': 'img/bs/p-hg55bu.png'}
        pspec = {'title': 1, 'nm': 2, 'md': 3, **{f'kl{n}': 4 + 2 * n for n in range(3)}, **{f'kv{n}': 5 + 2 * n for n in range(3)},
                 **{f'sl{n}': 10 + 2 * n for n in range(8)}, **{f'sv{n}': 11 + 2 * n for n in range(8)}}
        spec = {f'{k}{n}{s}': 2 + n * 8 + j for n in range(3) for j, (k, s) in enumerate(
            [('nm', ''), ('md', ''), ('sl', '_0'), ('sv', '_0'), ('sl', '_1'), ('sv', '_1'), ('sl', '_2'), ('sv', '_2')])}
        lib = {'toc_slots': {'L_TOC_PSPEC': {'t': pspec}, 'L_TOC_SPEC': {'t': spec}}, 'products_all': products,
               'layouts': {'L_TOC_PSPEC': {'texts': [{'i': i, 'w': 188, 'font': 26} for i in range(30)]}}}
        auto = SimpleNamespace(load=lambda: lib, product_cut=lambda q: cuts.get(q), _em=lambda c: 1.0)
        source = {'f': 'L_TOC_PSPEC', 'bind': {}, 'ex_img': {'0': {'src': 'img/bs/p-qm55c.png'}}}
        shown = g.product_spec_sheet(auto, {}, source, 'tv')
        self.assertEqual(shown['img_bind'], {'0': {'product': 'tv'}})
        self.assertNotIn('0', shown['ex_img'], 'the picture stage fills the slot with the product cut')
        none = g.product_spec_sheet(auto, {}, source, 'tag')
        self.assertTrue(none['ex_img']['0']['hidden'] and none['ex_img']['0']['intentional'], 'no picture at all: still left empty on purpose')
        card = {'f': 'L_TOC_SPEC', 'bind': {'products': ['tv', 'tag']}, 'ex_t': {}}
        g.bind_spec(auto, {}, card)
        self.assertNotIn('0', card['ex_img'])
        self.assertTrue(card['ex_img']['1']['hidden'])

    def test_checker_failure_does_not_mark_any_slide_ready(self):
        class Broken:
            def json(self, **kwargs): raise RuntimeError('offline')
        slides = [{'f': 'test', 'kind': 'generic', 'bind': {}, 't': {'1': '초기 비용 협의'}}]
        brief = {'requirements': [{'id': 'R1'}], 'facts': {}}
        g.check_part(None, {'customer': '고객'}, {'name': '가치'}, {'brief': brief}, slides, Broken(), {0: [{'i': 1, 'max': 30}]})
        self.assertEqual(slides[0]['quality']['status'], 'review')
        self.assertIn('검증 실패', slides[0]['quality']['issues'][0])

    def test_fully_bound_card_is_applied_without_writer_but_still_verified(self):
        auto = SimpleNamespace(assign_focus=lambda *args: None)
        slides = [{'f': 'L_TOC_SPEC', 'ex_t': {'2': '키오스크'}, 'product_cards': [{'product': 'ac'}]}]
        ctx = {}
        with patch.object(g, 'prepare_slots', return_value=({0: []}, {0: {'2': 'Bespoke 냉난방', '3': 'AP083BNPPBH6'}})):
            g.fill_part(auto, ctx, {}, {'id': 'p'}, {'brief': {}}, slides, None)
        self.assertEqual(slides[0]['t']['2'], 'Bespoke 냉난방')
        self.assertIn('p', ctx['_part_checks'])

    def test_requirements_do_not_create_tables_or_split_birdseye_by_store(self):
        lib = {'layouts': {'L_TOC_RFP': {}, 'L_VS_BIRD_S2': {}, 'L_VS_BIRD_S1': {}}, 'sol_layouts': {}}
        auto = SimpleNamespace(load=lambda: lib)
        rows = [{'id': f'R{i}', 'label': f'요구 {i}', 'answer': f'대응 {i}', 'measure': '실측 확인'} for i in range(11)]
        bird = {'f': 'L_VS_BIRD_S2', 'kind': 'bird', 'bind': {'spaces': ['dt', 'street']}}
        part = {'exemplar': [{'f': 'L_VS_BIRD_S2'}], 'type': 'products'}
        result = g.compose_part(auto, lambda *args: [bird], {'evidence': {}, 'separate_sites': True}, part,
                                {'brief': {'requirements': rows}, 'message': '공간 구성'}, None)
        self.assertEqual([s['f'] for s in result], ['L_VS_BIRD_S2'])
        self.assertEqual(result[0]['bind']['spaces'], ['dt', 'street'])

    def test_existing_flow_has_no_supplement_candidates(self):
        auto = SimpleNamespace()
        self.assertEqual(g.candidates(auto, {'exemplar': [{'f': 'L_VS_NEEDS'}]}), [])
        with self.assertRaisesRegex(ValueError, '추가할 수 없습니다'):
            g.compose_part(auto, lambda *args: self.fail('must reject before composing'), {},
                           {'exemplar': [{'f': 'L_VS_NEEDS'}], 'type': 'value'},
                           {'extra_layouts': [{'f': 'L_TOC_PILOT', 'reason': '파일럿 요구'}]}, None)

    def test_selection_without_flow_uses_only_the_part_inventory(self):
        lib = {'layouts': {'own': {'name': '등록된 장'}, 'L_TOC_PILOT': {'name': '파일럿', 'p': 'value'},
                           'retired': {'retired': True}}, 'modules': []}
        auto = SimpleNamespace(load=lambda: lib, fixed_part=lambda p: False)
        part = {'exemplar': [], 'deck': False, 'type': 'value', 'layout_candidates': ['own', 'retired']}
        self.assertEqual([x['f'] for x in g.candidates(auto, part)], ['own'])
        self.assertEqual(g.candidates(auto, {**part, 'layout_candidates': []}), [])

    def test_flow_rejects_cross_part_layouts_reordering_and_extra_birdseye_sheets(self):
        auto = SimpleNamespace(load=lambda: {'sol_layouts': {}})
        part = {'name': '제품 제안', 'exemplar': [{'f': f} for f in ['L_VS_DIV_R3', 'L_VS_BIRD_S4', 'L_VS_SPACE', 'L_VS_MAP_4']]}
        expected = [{'f': f} for f in ['L_VS_DIV_R3', 'L_VS_BIRD_S2', 'L_VS_SPACE_P2', 'L_VS_SPACE_P2', 'L_VS_MAP_2']]
        self.assertEqual(g.enforce_flow(auto, part, expected), expected)
        for invalid in (expected + [{'f': 'L_TOC_RFP'}], expected + [{'f': 'L_TOC_PILOT'}],
                        [expected[0], expected[2], expected[1]], [expected[0], expected[1], expected[1]]):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                g.enforce_flow(auto, part, invalid)

    def test_sparse_requirements_do_not_remove_authored_value_step(self):
        auto = SimpleNamespace(load=lambda: {'sol_layouts': {}}, fixed_part=lambda p: False, fixed_sheet=lambda f: False,
                               _mk=lambda x: {**x, 'kind': 'generic'})
        part = {'type': 'value', 'exemplar': [{'f': f} for f in ['L_VS_NEEDS', 'L_VS_CORE_1', 'L_VS_CORE_2', 'L_VS_CORE_3']]}
        result = g.preserve_flow(auto, {}, part, [{'f': 'L_VS_NEEDS'}, {'f': 'L_VS_CORE_2'}])
        self.assertEqual([s['f'] for s in result], [s['f'] for s in part['exemplar']])

    def test_explicit_candidate_list_rejects_invalid_input(self):
        from app.api.poc.jobs import BadRequest
        with self.assertRaises(BadRequest):
            compose._auto_body({'parts': [{'id': 'p', 'exemplar': [], 'layout_candidates': 'entire library'}]})

    def test_checker_repair_is_revalidated_on_final_text(self):
        class Checker:
            calls = 0
            def json(self, **kwargs):
                self.calls += 1
                if self.calls == 1:
                    return {'coverage': [], 'issues': [{'s': 0, 'reason': '에어컨에 결제 기능을 부여함'}],
                            'fixes': [{'s': 0, 'i': 1, 'v': '냉난방 제공 · 연동 검증'}]}
                self.assert_final = '냉난방 제공 · 연동 검증' in kwargs['prompt']
                return {'coverage': [{'id': 'R1', 's': 0, 'quote': '냉난방 제공 · 연동 검증'}], 'issues': [], 'fixes': []}
        checker = Checker()
        slides = [{'f': 'test', 'kind': 'generic', 'bind': {}, 't': {'1': '에어컨으로 카드 결제'}}]
        brief = {'requirements': [{'id': 'R1'}], 'facts': {}}
        g.check_part(None, {'customer': '고객'}, {'name': '공조'}, {'brief': brief}, slides, checker, {0: [{'i': 1, 'max': 30}]})
        self.assertEqual(checker.calls, 2)
        self.assertTrue(checker.assert_final)
        self.assertEqual(slides[0]['quality']['textKey'], g.fingerprint(slides[0]['t']))
        self.assertEqual(slides[0]['quality']['status'], 'ready')

    def test_app_hooks_do_not_modify_historical_engine(self):
        legacy = compose._auto()
        original = legacy.orchestrate
        current = compose._auto(grounded=True)
        self.assertIs(legacy.orchestrate, original)
        self.assertIsNot(current, legacy)
        self.assertTrue(current._grounded_contract)

    def test_part_writer_drops_positional_product_lock_and_binds_its_final_solution(self):
        def assign(*args):
            args[3][0].update(lock={'5': 'Bespoke 냉난방'}, core_rows=['ac'], img_bind={'0': {'product': 'ac'}})
        auto = SimpleNamespace(assign_focus=assign, load=lambda: {'layouts': {'L_VS_CORE_1': {'name': '메뉴 운영'}}},
                               _bind_line=lambda *args: '', plain=str,
                               selected_item=lambda ctx, value: ('solution', 'vxt') if value == 'Samsung VXT' else None)
        class Writer:   # (one sheet's chunk a call — sheet_writer)
            def json(self, **kwargs):
                return {'t': [{'i': 5, 'v': 'Samsung VXT'}]}
        def slots(auto, ctx, slides):
            self.assertNotIn('5', slides[0]['lock'])
            self.assertNotIn('core_rows', slides[0])
            self.assertNotIn('img_bind', slides[0])
            return {0: [{'i': 5, 'r': '담당 솔루션', 'max': 30}]}, {0: {}}
        slides = [{'f': 'L_VS_CORE_1', 'ex_t': {'5': '잘못된 제품'}, 'kind': 'generic'}]
        with patch.object(g, 'prepare_slots', side_effect=slots):
            g.fill_part(auto, {'customer': '고객', 'title': '제안'}, {'thesis': '메뉴 운영'}, {'id': 'p', 'name': '가치'},
                        {'message': '중앙 배포', 'brief': {'requirements': []}}, slides, Writer())
        self.assertEqual(slides[0]['t']['5'], 'Samsung VXT')
        self.assertEqual(slides[0]['img_bind']['0'], {'solution': 'vxt'})

    def test_checker_uses_original_requirements_not_planner_inventions(self):
        class Checker:
            def json(self, **kwargs):
                self.prompt = kwargs['prompt']
                return {'coverage': [{'id': 'R1', 's': 0, 'quote': '원격 상태 확인'}], 'issues': [], 'fixes': []}
        checker = Checker()
        slides = [{'f': 'test', 'kind': 'generic', 'bind': {}, 't': {'1': '원격 상태 확인'}}]
        req = {'id': 'R1', 'text': '본사에서 화면 장애 확인', 'deliverable': '가상의 초지능 자동경보', 'answer': '존재하지 않는 확정 기능'}
        g.check_part(None, {'customer': '고객'}, {'name': '관리'}, {'brief': {'requirements': [req], 'facts': {}}}, slides, checker, {0: [{'i': 1, 'max': 30}]})
        self.assertIn(req['text'], checker.prompt)
        self.assertNotIn(req['deliverable'], checker.prompt)
        self.assertNotIn(req['answer'], checker.prompt)

    def test_checker_product_repair_replaces_photo_and_unknown_item_cannot_borrow_one(self):
        auto = SimpleNamespace(selected_item=lambda ctx, v: ('solution', 'vxt') if v == 'VXT' else None,
                               plain=lambda v: str(v or ''), solution_media=lambda *args: ['vxt.png'])
        slides = [{'f': 'L_VS_CORE_1', 't': {'5': 'VXT', '12': '옥외 모델 별도 선정'},
                   'img': {'0': {'src': 'ac.png'}, '1': {'src': 'qm55c.png'}}}]
        g.bind_final_value_images(auto, {}, slides)
        self.assertEqual(slides[0]['img']['0']['src'], 'vxt.png')
        self.assertTrue(slides[0]['img']['1']['intentional'])
        self.assertNotIn('src', slides[0]['img']['1'])

    def test_exact_english_solution_name_uses_geometry_not_korean_character_count(self):
        auto = compose._auto(grounded=True)
        self.assertTrue(g.fits_slot(auto, {'f': 'L_VS_CORE_1'}, 5, 'SmartThings Pro', 10))
        self.assertFalse(g.fits_slot(auto, {'f': 'L_VS_CORE_1'}, 5, '아주 긴 설명입니다 ' * 20, 10))

    def test_same_solution_uses_next_available_picture_instead_of_empty_card(self):
        auto = SimpleNamespace(selected_item=lambda ctx, v: ('solution', 'vxt'), plain=str,
                               solution_media=lambda *args: ['vxt-a.png', 'vxt-b.png'])
        slides = [{'f': 'L_VS_CORE_1', 't': {'5': 'VXT', '12': 'VXT'}, 'img': {}}]
        g.bind_final_value_images(auto, {}, slides)
        self.assertEqual([slides[0]['img'][str(i)]['src'] for i in range(2)], ['vxt-a.png', 'vxt-b.png'])

    def test_missing_issue_with_multiple_owned_ids_is_not_silently_discarded(self):
        class Checker:
            def json(self, **kwargs):
                return {'coverage': [{'id': 'R1', 's': 0, 'quote': '내용'}],
                        'issues': [{'kind': 'missing', 'requirement': 'R1, R2', 'reason': '실행 조건 누락'}], 'fixes': []}
        slides = [{'f': 'test', 'kind': 'generic', 'bind': {}, 't': {'1': '내용'}}]
        g.check_part(None, {'customer': '고객'}, {'name': '관리'}, {'brief': {'requirements': [{'id': 'R1'}], 'facts': {}}}, slides, Checker(), {})
        self.assertEqual(slides[0]['quality']['status'], 'review')
        self.assertIn('실행 조건 누락', slides[0]['quality']['issues'])


if __name__ == '__main__':
    unittest.main()
