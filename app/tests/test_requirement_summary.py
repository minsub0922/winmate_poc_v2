"""Summary provenance, taxonomy and strict failure behavior; no synthetic output is used by the app."""
import copy
from types import SimpleNamespace
import unittest

from app.api.poc.adapters import requirements as summary
from app.api.poc.adapters.common import ModePlan, requirement_context
from app.api.poc.jobs import BadRequest, Job, ModelFailure
from app.api.poc.provider import ProviderError


def item(text='매장 320개에 메뉴보드를 설치합니다.', kind='fact', source='free', quote='매장 320개에 메뉴보드를 설치합니다.'):
    return {'text': text, 'kind': kind, 'refs': [{'source_id': source, 'quote': quote}]}


class RequirementSummaryTests(unittest.TestCase):
    def setUp(self):
        self.sources = [{'id': 'free', 'label': '요구사항', 'kind': 'customer', 'text': '매장 320개에 메뉴보드를 설치합니다. 예산은 견적 후 결정합니다.', 'partial': False},
                        {'id': 'author', 'label': '제작자 의견', 'kind': 'author', 'text': '운영 효율을 중심으로 설득하고 싶습니다.', 'partial': False}]
        self.value = {'overview': item(), **{key: [] for key in summary.SECTIONS}}
        self.value['requirements'] = [item()]

    def test_valid_summary_keeps_all_categories_and_distinguishes_inference(self):
        self.value['strategy'] = [item('운영 효율을 중심으로 제안합니다.', 'inference', 'author', '운영 효율을 중심으로 설득하고 싶습니다.')]
        self.assertEqual(summary.validate_summary(self.value, self.sources), '')

    def test_fake_citations_and_unreferenced_numbers_are_rejected(self):
        for change in [{'source_id': 'invented'}, {'quote': '매장 500개에 설치합니다.'}, {'quote': ''}]:
            with self.subTest(change=change):
                value = copy.deepcopy(self.value); value['overview']['refs'][0].update(change)
                self.assertTrue(summary.validate_summary(value, self.sources))
        value = copy.deepcopy(self.value); value['overview']['text'] = '매장 500개에 설치합니다.'
        self.assertIn('숫자', summary.validate_summary(value, self.sources))

    def test_repair_feedback_identifies_every_invalid_item_and_number(self):
        value = copy.deepcopy(self.value)
        value['overview']['text'] = '매장 500개에 설치합니다.'
        value['requirements'][0]['refs'] = []
        problem = summary.validate_summary(value, self.sources)
        self.assertIn('overview[0]', problem)
        self.assertIn('500', problem)
        self.assertIn('requirements[0]', problem)

    def test_author_opinion_cannot_become_a_customer_fact(self):
        self.value['strategy'] = [item('운영 효율을 중심으로 설득합니다.', 'fact', 'author', '운영 효율을 중심으로 설득하고 싶습니다.')]
        self.assertTrue(summary.validate_summary(self.value, self.sources))
        self.value['strategy'] = []
        self.value['requirements'] = [item('운영 효율을 중심으로 설득합니다.', 'fact', 'author', '운영 효율을 중심으로 설득하고 싶습니다.')]
        self.assertIn('제작자', summary.validate_summary(self.value, self.sources))

    def test_questions_are_explicitly_unconfirmed(self):
        self.value['questions'] = [item('예산 확정 시점을 확인해야 합니다.', 'question', quote='예산은 견적 후 결정합니다.')]
        self.assertEqual(summary.validate_summary(self.value, self.sources), '')
        self.value['questions'][0]['kind'] = 'fact'
        self.assertIn('question', summary.validate_summary(self.value, self.sources))

    def test_conflicting_totals_are_preserved_as_a_question_not_a_selected_fact(self):
        sources = [{'id': 'free', 'text': '전국 278여 개 매장. 시범 매장 10곳, DT 약 40곳.'},
                   {'id': 'author', 'text': '전국 320개 매장.'}]
        value = {'overview': item('전국 320개 매장 전환'), **{key: [] for key in summary.SECTIONS}}
        result = summary.retain_scope_conflicts(value, sources)
        self.assertNotIn('320', result['overview']['text'])
        self.assertEqual(len(result['questions']), 1)
        question = result['questions'][0]
        self.assertIn('278 / 320', question['text'])
        self.assertEqual([r['quote'] for r in question['refs']], ['전국 278여 개 매장', '전국 320개 매장'])
        self.assertEqual(len(summary.retain_scope_conflicts(result, sources)['questions']), 1)

    def test_pilot_and_dt_subsets_do_not_conflict_with_total(self):
        self.assertEqual(summary.scope_conflicts([{'id': 'free', 'text': '전국 320개 매장 · DT 매장 40곳 · 시범 10곳'}]), [])

    def test_bounded_repair_and_verified_source_positions(self):
        calls = []
        invalid = copy.deepcopy(self.value); invalid['overview']['refs'][0]['quote'] = '가짜 인용'
        provider = SimpleNamespace(name='test-protocol', model='test-protocol')
        def generate(**kwargs):
            calls.append(kwargs)
            return SimpleNamespace(data=copy.deepcopy(invalid if len(calls) == 1 else self.value), cached=False, model='test-protocol', prompt_tokens=1, output_tokens=1)
        provider.generate_json = generate
        result = summary.run(Job('requirements', 'protocol', {}, 100), 'key', self.sources, ModePlan('real', True, provider), ['읽지 못한 파일.pdf'])
        self.assertEqual(len(calls), 2)
        ref = result['summary']['overview']['refs'][0]
        self.assertEqual(self.sources[0]['text'][ref['start']:ref['end']], ref['quote'])
        self.assertFalse(result['coverage']['complete'])
        self.assertEqual(result['coverage']['missing_sources'], ['읽지 못한 파일.pdf'])
        self.assertIn('검증 오류', calls[1]['user'])
        self.assertIn('이전 응답 JSON', calls[1]['user'])

    def test_answers_that_fail_twice_keep_only_what_the_sources_confirm(self):
        # 띄어쓰기만 다른 인용은 원문 표기로 바로잡고, 지어낸 인용 · 근거 없는 숫자를 쓴 항목은 뺀다 — 요약 전체를 실패시키지 않는다
        value = copy.deepcopy(self.value)
        value['overview'] = item('매장 320개에 메뉴보드를 설치합니다.', 'fact', 'free', '매장 320개에  메뉴보드를 설치 합니다.')
        value['requirements'] = [item(), item('매장 500개로 확대합니다.', 'fact', 'free', '매장 320개에 메뉴보드를 설치합니다.'), item('본사 일괄 관리가 필요합니다.', 'fact', 'free', '원문에 없는 문장')]
        value['goals'] = [item('메뉴보드 320개 설치가 목표입니다.', 'fact', 'free', '예산은 견적 후 결정합니다.')]
        value['strategy'] = [item('운영 효율을 중심으로 제안합니다.', 'fact', 'author', '운영 효율을 중심으로 설득하고 싶습니다.')]
        self.assertTrue(summary.validate_summary(value, self.sources))
        kept, dropped = summary.prune_summary(value, self.sources)
        self.assertEqual(summary.validate_summary(kept, self.sources), '')
        self.assertEqual(kept['overview']['refs'][0]['quote'], '매장 320개에 메뉴보드를 설치합니다.')
        self.assertEqual([x['text'] for x in kept['requirements']], ['매장 320개에 메뉴보드를 설치합니다.'])
        self.assertIn('매장 320개에 메뉴보드를 설치합니다.', [r['quote'] for r in kept['goals'][0]['refs']])  # 숫자의 근거 문장이 더해짐
        self.assertEqual(kept['strategy'][0]['kind'], 'inference')
        self.assertEqual(dropped, 2)
        provider = SimpleNamespace(name='test-protocol', model='test-protocol')
        provider.generate_json = lambda **kwargs: SimpleNamespace(data=copy.deepcopy(value), cached=False, model='test-protocol', prompt_tokens=1, output_tokens=1)
        result = summary.run(Job('requirements', 'prune', {}, 100), 'key', self.sources, ModePlan('real', True, provider))
        self.assertEqual(summary.validate_summary({k: result['summary'][k] if k == 'overview' else [{x: v for x, v in row.items() if x in ('text', 'kind', 'refs')} | {'refs': [{'source_id': r['source_id'], 'quote': r['quote']} for r in row['refs']]} for row in result['summary'][k]] for k in ('overview', *summary.SECTIONS)} | {'overview': {'text': result['summary']['overview']['text'], 'kind': result['summary']['overview']['kind'], 'refs': [{'source_id': r['source_id'], 'quote': r['quote']} for r in result['summary']['overview']['refs']]}}, self.sources), '')
        ref = result['summary']['overview']['refs'][0]
        self.assertEqual(self.sources[0]['text'][ref['start']:ref['end']], ref['quote'])
        # 개요를 살릴 수 없으면 요약을 만들지 않는다
        broken = copy.deepcopy(value); broken['overview'] = item('매장 500개에 설치합니다.', 'fact', 'free', '원문에 없는 문장')
        self.assertIsNone(summary.prune_summary(broken, self.sources))

    def test_a_no_break_space_in_the_original_is_a_space_to_the_reader(self):
        """편집기 · 붙여넣기가 원문에 남긴 줄바꿈 없는 공백(U+00A0)은 보이지 않는다 — 모델이 보통 공백으로 옮겨 적은 인용은 같은 인용이다."""
        text = '운영은 @MagicINFO\u00a0FO를 통해 본사에서 관리한다. 매장 3곳에 도입한다.'
        sources = [{'id': 'free', 'label': '요구사항', 'kind': 'customer', 'text': text, 'partial': False}]
        typed = '운영은 @MagicINFO FO를 통해 본사에서 관리한다.'      # what a reader copies: an ordinary space
        self.assertNotIn(typed, text)
        value = {'overview': item('MagicINFO FO로 본사에서 관리한다.', 'fact', 'free', typed), **{key: [] for key in summary.SECTIONS}}
        value['requirements'] = [item('본사에서 관리한다.', 'fact', 'free', typed)]
        provider = SimpleNamespace(name='test-protocol', model='test-protocol')
        calls = []
        provider.generate_json = lambda **kwargs: calls.append(1) or SimpleNamespace(data=copy.deepcopy(value), cached=False, model='test-protocol', prompt_tokens=1, output_tokens=1)
        result = summary.run(Job('requirements', 'nbsp', {}, 100), 'key', sources, ModePlan('real', True, provider))
        self.assertEqual(len(calls), 1, 'accepted at once — not sent back to the model for a difference it cannot see')
        ref = result['summary']['overview']['refs'][0]
        self.assertEqual(ref['quote'], text[:len(typed)], 'the stored quote is the original as written, so it can be found in it')
        self.assertEqual(text[ref['start']:ref['end']], ref['quote'])
        # spacing the reader can see is still not changed for the model: a dropped or doubled space stays a wrong quote
        for wrong in ('운영은 @MagicINFOFO를 통해 본사에서 관리한다.', '운영은  @MagicINFO FO를 통해 본사에서 관리한다.'):
            bad = copy.deepcopy(value); bad['overview']['refs'][0]['quote'] = wrong; bad['requirements'] = []
            summary.restore_spaces(bad, sources)
            self.assertIn('quote', summary.validate_summary(bad, sources))

    # ---- 여러 줄 · 들여쓰기가 많은 원문(붙여넣은 제안 메모)에서도 요약이 실패하지 않는다 ----
    MEMO = ("파트너사에 에어드레서와 공기청정기를 제안합니다.- 파트너사 개요\n\n\n  .연매출 500억 이상, '26년 매출 900억원 달성 예상\n\n\n"
            "  .직원 25명 중 18명이 내근직으로 근무\n\n\n  .사무실 총 면적은 60평 규모로 대표실(5평), 회의실(5평)으로 구성\n\n\n"
            "- 제안 방향 : 직원 근무 밀도가 높은 공간에서의 에어케어와 \n\n\n                  에어드레서 설치를 통해 외투에 밴 음식 냄새를 처리\n\n\n"
            "- 제안 품목\n  .에어드레서 : DF90H24R4B 탕비실 1대,  DF18CB8700CRA1 대표실 1대")

    def _memo(self):
        sources = [{'id': 'free', 'label': '요구사항', 'kind': 'customer', 'text': self.MEMO, 'partial': False}]
        empty = {key: [] for key in summary.SECTIONS}
        provider = SimpleNamespace(name='test-protocol', model='test-protocol')
        calls = []
        def run(value):
            calls.clear()
            provider.generate_json = lambda **kwargs: calls.append(1) or SimpleNamespace(data=copy.deepcopy(value), cached=False, model='test-protocol', prompt_tokens=1, output_tokens=1)
            return summary.run(Job('requirements', 'memo', {}, 100), 'key', sources, ModePlan('real', True, provider))
        return sources, empty, calls, run

    def test_a_quote_across_line_breaks_and_indentation_is_the_same_quote(self):
        sources, empty, calls, run = self._memo()
        typed = '직원 근무 밀도가 높은 공간에서의 에어케어와 에어드레서 설치를 통해 외투에 밴 음식 냄새를 처리'   # one line, one space — as a reader copies it
        self.assertNotIn(typed, self.MEMO)
        value = {'overview': item('에어케어와 에어드레서로 음식 냄새를 처리하려 합니다.', 'fact', 'free', typed), **empty,
                 'requirements': [item('에어드레서를 탕비실과 대표실에 둡니다.', 'fact', 'free', '에어드레서 : DF90H24R4B 탕비실 1대, DF18CB8700CRA1 대표실 1대')]}
        result = run(value)
        self.assertEqual(len(calls), 1, 'accepted at once — the model cannot reproduce the line breaks and indentation')
        for row in [result['summary']['overview'], result['summary']['requirements'][0]]:
            ref = row['refs'][0]
            self.assertEqual(self.MEMO[ref['start']:ref['end']], ref['quote'], 'the stored quote is the original as written')
        self.assertIn('\n', result['summary']['overview']['refs'][0]['quote'])
        self.assertIn('1대,  DF18', result['summary']['requirements'][0]['refs'][0]['quote'], 'the doubled space of the original is kept')
        # spacing the model itself changed stays a wrong quote: a dropped space, or a doubled space the original does not have
        for wrong in ('직원근무 밀도가 높은 공간에서의 에어케어와', '직원  근무 밀도가 높은 공간에서의 에어케어와'):
            bad = {'overview': item('근무 밀도가 높습니다.', 'fact', 'free', wrong), **empty}
            summary.restore_spaces(bad, sources)
            self.assertIn('quote', summary.validate_summary(bad, sources))

    def test_a_quote_that_skips_the_middle_keeps_its_longest_real_piece(self):
        sources, empty, calls, run = self._memo()
        value = {'overview': item('에어드레서를 탕비실과 대표실에 둡니다.', 'fact', 'free', '에어드레서 : ... DF90H24R4B 탕비실 1대, DF18CB8700CRA1 대표실 1대'), **empty,
                 'requirements': [item('사무실은 대표실과 회의실로 구성됩니다.', 'fact', 'free', '사무실 총 면적은… 대표실(5평), 회의실(5평)으로 구성')]}
        result = run(value)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result['summary']['overview']['refs'][0]['quote'], 'DF90H24R4B 탕비실 1대,  DF18CB8700CRA1 대표실 1대')
        self.assertEqual(result['summary']['requirements'][0]['refs'][0]['quote'], '대표실(5평), 회의실(5평)으로 구성')
        # nothing of it is in the original → still a wrong quote
        bad = {'overview': item('둡니다.', 'fact', 'free', '원문에 없는 말 ... 역시 없는 말입니다'), **empty}
        summary.restore_spaces(bad, sources)
        self.assertIn('quote', summary.validate_summary(bad, sources))

    def test_numbers_written_in_the_original_get_their_evidence_instead_of_a_failure(self):
        sources, empty, calls, run = self._memo()
        # 개요: 숫자 다섯 개가 원문 네 곳에 흩어져 있고, 연도는 원문이 줄여 썼다('26년) — 모델은 근거를 하나만 달았다
        text = '2026년 매출 900억원을 예상하며, 직원 25명 중 18명이 근무하는 60평 사무실입니다.'
        value = {'overview': item(text, 'fact', 'free', "'26년 매출 900억원 달성 예상"), **empty,
                 'background': [item('직원 25명 가운데 18명이 내근직입니다.', 'fact', 'free', '파트너사 개요')]}
        self.assertIn('숫자', summary.validate_summary(copy.deepcopy(value), sources), 'as answered it lacks evidence for the numbers')
        result = run(value)
        self.assertEqual(len(calls), 1, 'the evidence is in the original — it is attached, not asked for again')
        overview = result['summary']['overview']
        self.assertEqual(overview['text'], text)
        self.assertGreater(len(overview['refs']), 1); self.assertLessEqual(len(overview['refs']), summary.MAX_REFS['overview'])
        for ref in overview['refs'] + result['summary']['background'][0]['refs']:
            self.assertEqual(self.MEMO[ref['start']:ref['end']], ref['quote'])
        self.assertEqual(summary._missing_numbers(text, [ref['quote'] for ref in overview['refs']]), set())
        self.assertEqual(summary._missing_numbers('2026년', ["'26년 매출"]), set()); self.assertEqual(summary._missing_numbers('2026년', ['26명']), {'2026'})
        # a number the original does not have is still rejected (no evidence can be attached)
        self.assertIn('숫자', summary.validate_summary(summary.ground_numbers({'overview': item('직원 300명이 근무합니다.', 'fact', 'free', '직원 25명 중 18명이 내근직으로 근무'), **empty}, sources), sources))

    def test_one_unsupported_number_in_the_overview_does_not_fail_the_whole_summary(self):
        sources, empty, calls, run = self._memo()
        value = {'overview': item('직원 300명이 일하는 회사입니다. 에어드레서와 공기청정기 제안을 검토합니다.', 'fact', 'free', '파트너사에 에어드레서와 공기청정기를 제안합니다.'), **empty,
                 'requirements': [item('에어드레서를 둡니다.', 'fact', 'free', '에어드레서 설치를 통해 외투에 밴 음식 냄새를 처리')]}
        result = run(value)
        self.assertEqual(len(calls), 2, 'asked once more, then only what the original confirms is kept')
        self.assertEqual(result['summary']['overview']['text'], '에어드레서와 공기청정기 제안을 검토합니다.', 'the sentence with the made-up number is left out, nothing is rewritten')
        self.assertEqual(len(result['summary']['requirements']), 1)

    def test_invalid_output_and_provider_errors_never_create_rule_summaries(self):
        provider = SimpleNamespace(name='test-protocol', model='test-protocol')
        provider.generate_json = lambda **kwargs: SimpleNamespace(data={}, cached=False, model='test-protocol', prompt_tokens=1, output_tokens=1)
        with self.assertRaises(ModelFailure):
            summary.run(Job('requirements', 'invalid', {}, 100), 'key', self.sources, ModePlan('real', True, provider))
        def fail(**kwargs): raise ProviderError('network', 'test network error')
        provider.generate_json = fail
        with self.assertRaises(ModelFailure):
            summary.run(Job('requirements', 'error', {}, 100), 'key', self.sources, ModePlan('real', True, provider))

    def test_consumer_context_is_fenced_and_bounded(self):
        text = requirement_context({'requirement_context': {'source_key': 'input-key', 'sections': {'goals': []}}})
        self.assertIn('원문이 우선', text)
        self.assertIn('input-key', text)
        for value in ['wrong', {'source_key': 'key', 'sections': {}, 'oversized': 'x' * 40001}]:
            with self.subTest(value=type(value)), self.assertRaises(BadRequest):
                requirement_context({'requirement_context': value})
