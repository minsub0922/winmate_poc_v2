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
