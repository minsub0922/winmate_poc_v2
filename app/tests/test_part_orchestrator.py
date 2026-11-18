"""파트 orchestrator — deck plan repair, per-sheet directives through the layout flows, part review (app/api/poc/part_orchestrator.py)."""
import copy
import re
import unittest
from types import SimpleNamespace

from app.api.poc import compose_grounding as g


def plan_ctx():
    parts = [
        {'id': 'cover', 'name': '', 'type': 'cover', 'deck': True, 'mode': '', 'cap': {'spaces': False}, 'exemplar': [{'f': 'L_C01', 'role': ''}]},
        {'id': 'value', 'name': '가치 제안', 'type': 'value', 'deck': False, 'mode': '', 'cap': {'spaces': False},
         'exemplar': [{'f': 'L_VS_NEEDS', 'role': '니즈'}]},
        {'id': 'case', 'name': '유관 사례', 'type': 'case', 'deck': False, 'mode': '', 'cap': {'spaces': False},
         'exemplar': [{'f': 'L_VS_CASE', 'role': '사례'}, {'f': 'L_VS_CASE', 'role': '사례'}]},
    ]
    rows = [{'id': 'R1', 'text': '객실 판매를 유지한 채 교체', 'path': 'free', 'speaker': ''},
            {'id': 'R2', 'text': '장애 때 기존 운영으로 돌아가는 절차', 'path': 'free', 'speaker': ''}]
    evidence = {'product:hoteltv': {'kind': 'product', 'id': 'hoteltv', 'name': '호텔 TV', 'text': '호텔 TV'},
                'solution:lynk': {'kind': 'solution', 'id': 'lynk', 'name': 'LYNK Cloud', 'text': 'LYNK'}}
    return {'parts': parts, 'source_rows': rows, 'evidence': evidence, 'spaces': [], 'fixed': [], 'customer': '포레스트호텔', 'title': '객실 교체',
            'products': ['hoteltv'], 'solutions': ['lynk'], 'cases': [], 'short': {'hoteltv': '호텔 TV', 'lynk': 'LYNK Cloud'}}


def plan_auto():
    lib = {'products_all': {'hoteltv': {'name': '호텔 TV HG55', 'model': 'HG55AU800'}}, 'solutions': {'lynk': {'name': 'LYNK Cloud'}},
           'cases': {'c1': {'cust': '신라스테이 서초'}}, 'layouts': {}, 'modules': []}
    return SimpleNamespace(load=lambda: lib, fixed_part=lambda p: False)


def model_plan(**over):
    d = {'thesis': '객실 판매를 멈추지 않고 교체', 'storyline': '요구 → 해법 → 사례',
         'requirements': [{'id': 'R1', 'kind': 'need', 'owner': 'value', 'deliverable': '층별 전환', 'label': '판매 유지', 'answer': '층별 교체', 'measure': '객실 가동',
                           'evidence': ['product:hoteltv']},
                          {'id': 'R2', 'kind': 'need', 'owner': 'value', 'deliverable': '복구 절차', 'label': '복구 절차', 'answer': '복귀 절차', 'measure': '복구 시간',
                           'evidence': ['solution:lynk']}],
         'conflicts': [], 'open_items': [],
         'parts': [{'id': 'cover', 'message': '표지', 'products': [], 'solutions': [], 'cases': [], 'extra_layouts': []},
                   {'id': 'value', 'message': '판매를 멈추지 않는 교체', 'products': ['hoteltv'], 'solutions': ['lynk'], 'cases': [], 'extra_layouts': []},
                   # the template's own industry cases, named by customer although this customer linked none (p54x1hjb, 2026-11-18)
                   {'id': 'case', 'message': '같은 업종 사례', 'products': [], 'solutions': [], 'cases': ['신라스테이 서초', '크라운 파크 호텔 서울'], 'extra_layouts': []}],
         'scope': [{'ref': 'product:hoteltv', 'status': 'proposed', 'reason': '교체', 'owner': 'value'},
                   {'ref': 'solution:lynk', 'status': 'proposed', 'reason': '원격', 'owner': 'value'}]}
    d.update(over)
    return d


class OneAnswer:
    """returns the same answer to every call, validated the way the app provider does (one repair round, then invalid_output)"""

    def __init__(self, answer):
        self.answer, self.calls = answer, 0

    def json(self, *, stage, prompt, schema, validate=None, **kw):
        from composer.llm import LLMError  # noqa: WPS433 — on sys.path once the adapter imported the composer
        for _ in range(2):
            self.calls += 1
            d = copy.deepcopy(self.answer)
            problem = validate(d) if validate else True
            if problem is True or problem is None:
                return d
        err = LLMError('invalid_output', f'{stage}: {problem}')
        err.last = d
        raise err


class DeckPlanRepairTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from app.api.poc.adapters import compose
        compose._auto(grounded=True)   # puts the composer package on sys.path

    def test_unselected_case_names_are_dropped_not_a_failed_job(self):
        llm = OneAnswer(model_plan())
        plan = g.orchestrate(plan_auto(), plan_ctx(), llm)
        self.assertEqual(llm.calls, 1, 'repairable ids cost no second model call')
        case = next(p for p in plan['parts'] if p['name'] == '유관 사례')
        self.assertEqual(case['cases'], [])
        self.assertTrue(any('신라스테이 서초' in f for f in plan['fixes']))

    def test_selected_items_named_instead_of_id_are_resolved(self):
        d = model_plan()
        d['parts'][1].update(products=['호텔 TV HG55', 'HG55AU800'], solutions=['LYNK Cloud', 'magicinfo'])
        plan = g.orchestrate(plan_auto(), plan_ctx(), OneAnswer(d))
        value = next(p for p in plan['parts'] if p['name'] == '가치 제안')
        self.assertEqual(value['products'], ['hoteltv'])
        self.assertEqual(value['solutions'], ['lynk'])
        self.assertTrue(any('magicinfo' in f for f in plan['fixes']))

    def test_unknown_evidence_scope_owner_and_layouts_are_repaired(self):
        d = model_plan()
        d['requirements'][0]['evidence'] = ['product:hoteltv', 'product:qm55c']
        d['requirements'][1]['owner'] = 'nowhere'
        d['scope'].append({'ref': 'case:c9', 'status': 'proposed', 'reason': '?', 'owner': 'case'})
        d['scope'].append(dict(d['scope'][0]))
        d['parts'][1]['extra_layouts'] = [{'f': 'L_TOC_PILOT', 'reason': '파일럿', 'requirements': ['R1']}]
        plan = g.orchestrate(plan_auto(), plan_ctx(), OneAnswer(d))
        self.assertEqual(plan['requirements'][0]['evidence'], ['product:hoteltv'])
        self.assertEqual(plan['requirements'][1]['owner'], 'value')
        self.assertEqual(sorted(s['ref'] for s in plan['scope']), ['product:hoteltv', 'solution:lynk'])
        value = next(p for p in plan['parts'] if p['name'] == '가치 제안')
        self.assertEqual(value.get('extra_layouts'), [])

    def test_structural_gap_asks_again_then_keeps_the_row_instead_of_failing(self):
        d = model_plan()
        d['requirements'] = d['requirements'][:1]   # R2 left out: the model must account for every source row
        llm = OneAnswer(d)
        plan = g.orchestrate(plan_auto(), plan_ctx(), llm)
        self.assertEqual(llm.calls, 4, 'a fresh plan once more (each with its repair round) before code completes it')
        r2 = next(r for r in plan['requirements'] if r['id'] == 'R2')
        self.assertEqual((r2['kind'], r2['owner']), ('need', 'value'))
        self.assertIn('R2', [p['id'] for p in plan['points']])
        self.assertTrue(any('R2' in f for f in plan['fixes']))

    def test_unusable_answer_still_fails(self):
        with self.assertRaises(Exception) as caught:
            g.orchestrate(plan_auto(), plan_ctx(), OneAnswer({'thesis': 'x'}))
        self.assertEqual(getattr(caught.exception, 'code', ''), 'invalid_output')


if __name__ == '__main__':
    unittest.main()


def _auto_ns(**over):
    from app.api.poc.adapters import compose
    real = compose._auto(grounded=True)
    lib = {'layouts': {f: {'name': f} for f in ('L_VS_NEEDS', 'L_VS_CORE_1', 'L_VS_CORE_2', 'L_VS_CORE_3', 'L_VS_SOL_LYNK')},
           'products_all': {'hoteltv': {'name': '호텔 TV'}, 'dvms2': {'name': 'DVM S2'}}, 'solutions': {'lynk': {'name': 'LYNK Cloud'}}, 'cases': {}}
    ns = SimpleNamespace(near_same=real.near_same, plain=real.plain, load=lambda: lib, need_columns=real.need_columns, column_items=real.column_items)
    for k, v in over.items():
        setattr(ns, k, v)
    return ns


FOREST_POINTS = [
    {'id': 'R5', 'kind': 'need', 'speaker': '', 'label': '객실 가동률 유지', 'text': '고장 접수가 늘지만 객실을 오래 비우기 어렵다'},
    {'id': 'R7', 'kind': 'decision', 'speaker': '', 'label': '전략 승인', 'text': '전략: 문제 해결형'},
    {'id': 'R11', 'kind': 'need', 'speaker': '■ 총지배인 (가중치 40%)', 'label': '판매 유지 교체', 'text': '- 객실 판매를 유지한 채 교체할 수 있는지',
     'products': ['hoteltv'], 'solutions': []},
    {'id': 'R13', 'kind': 'need', 'speaker': '■ 객실 · 프런트 운영 담당 (가중치 35%)', 'label': '장애 복귀 절차', 'text': '- 장애 때 기존 운영으로 돌아가는 절차',
     'products': [], 'solutions': ['lynk']},
    {'id': 'R15', 'kind': 'need', 'speaker': '■ 호텔 IT · 시설 담당 (가중치 25%)', 'label': '중복 확인 감소', 'text': '- 프런트와 시설팀의 중복 확인 감소',
     'products': [], 'solutions': ['lynk']},
]


class ColumnsTest(unittest.TestCase):
    def test_draft_takes_one_need_per_keyman_and_never_an_approval_request(self):
        from app.api.poc import part_orchestrator as po
        hint = po.column_hint(_auto_ns(), {'points': FOREST_POINTS})
        self.assertEqual([x['id'] for x in hint], ['R11', 'R13', 'R15'])
        no_keymen = [{**x, 'speaker': ''} for x in FOREST_POINTS]
        self.assertNotIn('R7', [x['id'] for x in po.column_hint(_auto_ns(), {'points': no_keymen})])

    def _sheets(self):
        slides = [{'f': f, 'kind': 'generic'} for f in ('L_VS_NEEDS', 'L_VS_CORE_1', 'L_VS_CORE_2', 'L_VS_CORE_3')]
        rows = [{'s': s, 'writes': True} for s in range(4)]
        return slides, rows

    def test_core_sheets_follow_the_columns_and_a_bad_column_is_filled_from_the_draft(self):
        from app.api.poc import part_orchestrator as po
        slides, rows = self._sheets()
        pp = {'products': ['hoteltv', 'dvms2'], 'solutions': ['lynk'], 'brief': {'requirements': [{'id': 'R11', 'kind': 'need'}]}, 'message': '판매 유지'}
        ctx = {'products': ['hoteltv', 'dvms2'], 'solutions': ['lynk']}
        d = {'sheets': [{'s': 0, 'directive': '세 고민을 잇는 니즈 장', 'points': ['R11'], 'items': []}],
             'columns': [{'points': ['R11'], 'items': ['hoteltv', 'qm55c'], 'directive': '호텔 TV 로 층별 교체'},
                         {'points': ['R7'], 'items': ['lynk'], 'directive': '승인 요청'},          # an approval request is no column
                         {'points': ['R11'], 'items': ['dvms2'], 'directive': '같은 고민 두 번'}]}  # the same concern twice
        orch, fixes = po.clean_plan(_auto_ns(), ctx, {'points': FOREST_POINTS}, {'id': 'v'}, pp, slides, rows, d)
        cols = orch['columns']
        self.assertEqual([c['points'][0] for c in cols], ['R11', 'R13', 'R15'])
        self.assertEqual(cols[0]['items'], ['hoteltv'], 'unselected item dropped')
        by = {x['s']: x for x in orch['sheets']}
        self.assertEqual(by[1]['directive'], '호텔 TV 로 층별 교체')
        self.assertEqual(by[2]['points'], ['R13'])
        self.assertIn('장애 복귀 절차', by[2]['directive'])
        self.assertTrue(any('승인 요청' in f for f in fixes))

    def test_orchestrator_columns_reach_need_columns_and_column_items(self):
        from app.api.poc import part_orchestrator as po
        auto = _auto_ns()
        pp = {'point_ids': ['R5', 'R7', 'R11'], 'orch_columns': [{'points': ['R13'], 'items': ['lynk']}, {'points': ['R15'], 'items': ['lynk', 'hoteltv']}]}
        per, problem = po.columns_for(auto.need_columns, FOREST_POINTS, pp)
        self.assertEqual(per[0], ['R13'])
        self.assertEqual(per[1], ['R15'])
        self.assertEqual(len(per), 3, 'the code fills the column the orchestrator left')
        got = po.items_for(auto.column_items, {'products': ['hoteltv'], 'solutions': ['lynk']}, per, {x['id']: x for x in FOREST_POINTS})
        self.assertEqual(got[0][0], 'lynk')
        self.assertEqual(got[1], ('lynk', ['hoteltv']))

    def test_owned_requirement_left_out_goes_to_an_answering_sheet_never_onto_a_fact_sheet(self):
        from app.api.poc import part_orchestrator as po
        pp = {'solutions': ['lynk'], 'brief': {'requirements': [{'id': 'R13', 'kind': 'need'}, {'id': 'R7', 'kind': 'decision'}]}}
        plan = {'points': FOREST_POINTS}
        d = {'sheets': [{'s': 0, 'directive': 'LYNK 원격 관리 장면', 'points': ['R7'], 'items': ['lynk']}]}
        # a solution sheet writes the solution's facts: neither the left-out need nor the approval request is pushed onto it
        orch, fixes = po.clean_plan(_auto_ns(), {'solutions': ['lynk']}, plan, {'id': 's'}, pp, [{'f': 'L_VS_SOL_LYNK', 'kind': 'solution'}],
                                    [{'s': 0, 'writes': True}], d)
        self.assertEqual(orch['sheets'][0]['points'], [])
        self.assertTrue(any('R13' in f and '자리가 없음' in f for f in fixes))
        # a generic sheet answers requirements: the left-out need goes there
        orch, _ = po.clean_plan(_auto_ns(), {'solutions': ['lynk']}, plan, {'id': 's'}, pp, [{'f': 'L_TOC_X', 'kind': 'generic'}],
                                [{'s': 0, 'writes': True}], {'sheets': [{'s': 0, 'directive': '운영 절차', 'points': [], 'items': []}]})
        self.assertEqual(orch['sheets'][0]['points'], ['R13'])


class ReviewGuardTest(unittest.TestCase):
    def test_redo_that_repeats_another_sheet_or_writes_chinese_goes_back(self):
        from app.api.poc import part_orchestrator as po
        auto = _auto_ns()
        slides = [{'t': {'1': '프런트와 시설팀이 같은 객실을 따로 확인하지 않게 합니다'}}, {'t': {'1': '새 문장', '2': '동일房型 3실'}}]
        editable = {0: [{'i': 1}], 1: [{'i': 1}, {'i': 2}]}
        before = {'1': '층별 전환으로 판매를 유지합니다', '2': '같은 타입 3실'}
        slides[1]['t']['1'] = '프런트와 시설팀이 같은 객실을 따로 확인하지 않게 합니다'
        back = po._keep_distinct(auto, slides, editable, 1, before)
        self.assertEqual(sorted(back), ['1', '2'])
        self.assertEqual(slides[1]['t'], {'1': '층별 전환으로 판매를 유지합니다', '2': '같은 타입 3실'})

    def test_same_instruction_is_given_to_one_sheet_only(self):
        from app.api.poc import part_orchestrator as po

        class Reviewer:   # (the review reads one sheet a call — prompt_budget): the answer of the sheet the prompt names
            def json(self, **kw):
                same = 'R7의 TV와 공조 통합 교체 전략을 명시하세요'
                n = int(re.search(r'이 장: 장 (\d+)', kw['prompt']).group(1)) - 1
                return [{'redo': True, 'why': 'x', 'instruction': same, 'cells': [1]}, {'redo': True, 'why': 'x', 'instruction': same + '.', 'cells': []},
                        {'redo': True, 'why': 'y', 'instruction': '복구 절차를 이 장의 각도로', 'cells': [9]}][n]
        slides = [{'f': 'L_VS_CORE_1', 't': {'1': '가'}}, {'f': 'L_VS_CORE_2', 't': {'1': '나'}}, {'f': 'L_VS_CORE_3', 't': {'1': '다'}}]
        editable = {0: [{'i': 1}], 1: [{'i': 1}], 2: [{'i': 1}]}
        redo, _ = po.review_part(_auto_ns(), {}, {}, {'name': '가치'}, {'brief': {}}, slides, editable, Reviewer())
        self.assertEqual([x['s'] for x in redo], [0, 2])
        self.assertEqual(redo[1]['cells'], [], 'a cell the sheet does not write is dropped')


class CheckAttributionTest(unittest.TestCase):
    def test_issue_stays_on_its_sheet_and_unanswered_requirement_goes_to_its_sheet(self):
        slides = [{'f': 'L_VS_DIV_R4'}, {'f': 'L_VS_NEEDS', 'orch_points': ['R11']}, {'f': 'L_VS_CORE_2', 'orch_points': ['R13']}]
        per = g.sheet_issues(slides, {1: {}, 2: {}}, [(1, '니즈 칸 길이', ''), (None, '요구 답변 누락: R13', '요구 답변 누락: R13')])
        self.assertEqual(per, {1: ['니즈 칸 길이'], 2: ['요구 답변 누락: R13']})
        self.assertNotIn(0, per, 'the divider is not reviewed for the 니즈 sheet')
        failed = g.sheet_issues(slides, {1: {}, 2: {}}, [('all', '최종 내용 검증 실패', '')])
        self.assertEqual(sorted(failed), [1, 2])

    def test_coverage_answered_on_two_sheets_and_quoted_with_other_punctuation_is_answered(self):
        req = [{'id': 'R1'}, {'id': 'R2'}]
        slides = [{'t': {'1': '같은 타입 객실 3곳 · 3주 시범 교체'}}, {'t': {'2': '장애 시 기존 운영 복귀 절차'}}]
        receipts = [{'id': 'R1', 's': 0, 'quote': '같은 타입 객실 3곳, 3주 시범 교체'}, {'id': 'R1', 's': 1, 'quote': '없는 문장'},
                    {'id': 'R2', 's': 1, 'quote': '기존 운영 복귀 절차'}]
        self.assertEqual(g.coverage_errors(req, receipts, slides), [])


class RequirementIdTest(unittest.TestCase):
    def test_internal_ids_leave_customer_text_but_refrigerants_stay(self):
        ids = {'R4', 'R17', 'R13', 'R32'}
        self.assertEqual(g.strip_requirement_ids('운영 효율(R4, R17)과 고객 신뢰', ids), '운영 효율과 고객 신뢰')
        self.assertEqual(g.strip_requirement_ids('핵심 제안 (R10-R15) 정리', ids), '핵심 제안 정리')
        self.assertEqual(g.strip_requirement_ids('R13: 장애 복귀 절차', ids), '장애 복귀 절차')
        for keep in ('냉매 R32 적용', '냉매 R410A · 친환경', 'HR15 제품', '모델 R9 기준'):
            self.assertEqual(g.strip_requirement_ids(keep, ids), keep)


class CodeReviewTest(unittest.TestCase):
    def test_parts_without_a_needs_sheet_redo_only_found_cells(self):
        from app.api.poc import part_orchestrator as po
        findings = {'repeats': [{'s': 2, 'i': 5, 'same_as': {'s': 1, 'i': 4}, 'text': '같은 말'}], 'empty': [{'s': 1, 'i': 7}, {'s': 9, 'i': 1}]}
        items = po.code_review(findings, {1: [{'i': 7}], 2: [{'i': 5}]})
        self.assertEqual(sorted((x['s'], x['cells']) for x in items), [(1, [7]), (2, [5])])
        self.assertTrue(all(x['strict'] for x in items))

    def test_strict_item_on_a_number_cell_touches_nothing(self):
        from app.api.poc import part_orchestrator as po
        slides = [{'f': 'L_TOC_X', 't': {'3': '', '4': '문장'}}]
        editable = {0: [{'i': 3, 'num_cell': True, 'max': 6}, {'i': 4, 'max': 30}]}

        class NoCall:
            def json(self, **kw):
                raise AssertionError('no model call for a cell the redo may not touch')
        item = {'s': 0, 'why': '빈 칸', 'instruction': '채움', 'cells': [3], 'strict': True}
        self.assertEqual(po.redo_sheet(_auto_ns(), {}, {}, {'name': 'p'}, {'brief': {}}, slides, 0, item, editable, NoCall()), [])


class EchoTest(unittest.TestCase):
    def test_a_cell_that_copies_its_directive_is_found_and_rewritten_alone(self):
        from app.api.poc import part_orchestrator as po
        d = '카운터와 메뉴보드에 설치된 QM55C가 고객에게 전달하는 정보의 역할과 화면의 핵심 특징을 보여줍니다.'
        slides = [{'f': 'L_VS_SPACE', 'directive': d, 't': {'2': d, '6': '3,840 x 2,160 해상도로 메뉴 이미지를 선명하게 표현합니다.'}}]
        editable = {0: [{'i': 2}, {'i': 6}]}
        f = po.code_findings(_auto_ns(), {}, {}, {}, slides, editable)
        self.assertEqual([(x['s'], x['i']) for x in f['echo']], [(0, 2)])
        self.assertEqual(po.code_review(f, editable)[0]['cells'], [2])


class SpaceGuardTest(unittest.TestCase):
    def test_invented_space_rows_are_emptied_with_their_products_and_the_count_follows(self):
        from unittest.mock import patch
        from app.api.poc import part_orchestrator as po
        roles = {'1': '제목 — 업종 이름 + 선택 공간 수 (예: ○○의 N개 공간)', '4': '범례 1 공간 이름 (선택 공간 그대로)', '5': '칸 4 공간의 대표 선택 제품 이름',
                 '10': '범례 4 공간 이름 (선택 공간 그대로)', '11': '칸 10 공간의 대표 선택 제품 이름'}
        sl = {'f': 'L_VS_BIRD_S5', 'kind': 'bird', 't': {'1': '데일리픽 5개 매장 유형별 시나리오', '4': '대형 매장', '5': 'MagicINFO', '10': '백화점 입점점', '11': 'MagicINFO'}}
        ctx = {'spaces': [], 'req_text': '대형 · 표준 · 소형 매장 각 1곳에서 시범 운영'}
        with patch.object(po.layout_cells, 'cell', side_effect=lambda f, k: {'role': roles.get(str(k), '')}):
            got = po.guard_space_names(_auto_ns(), ctx, [sl])
        self.assertEqual(got, {0: ['10']})
        self.assertEqual((sl['t']['10'], sl['t']['11'], sl['t']['4']), ('', '', '대형 매장'))
        self.assertEqual(sl['t']['1'], '데일리픽 1개 매장 유형별 시나리오')
