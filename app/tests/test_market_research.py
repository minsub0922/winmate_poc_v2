"""시장조사 엔진(app/api/poc/market_research.py) — 네트워크 · 모델 없이: 검증 규칙과, 가짜 검색 · 가짜 모델로 돌린 전체 흐름.

이 엔진이 지켜야 하는 것은 하나다: **원문에서 확인되지 않은 값 · 이름은 장에 실리지 않는다.** 모델이 무엇을 답하든 코드가 원문과 대조해
걸러내야 하므로, 여기서는 모델이 틀리게 답하는 경우(값을 잘라 읽음 · 단위를 바꿈 · 연도를 끌어옴 · 인용을 지어냄 · 범위를 넓힌 이름)를 하나씩 넣어 본다.
"""
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')
sys.dont_write_bytecode = True

from app.api.poc import market_research as m  # noqa: E402

DOC = ('외식업계는 ‘인건비 절감’과 ‘운영 효율화’로 생존활로를 모색하고 있다. 키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며, '
       '인력난과 비용 부담에 대응하고 있다. 외식업체에 설치한 키오스크 대수는 2019년 5479대에서 2022년 8만7341대로 늘었다. '
       '음식서비스 온라인 거래액은 2023년 32.4조 원에서 2024년 37.0조 원으로 14.3% 증가했으며 점유율은 3.2%p 상승했다. '
       '국내 일반음식점의 매출에서 식재료비와 인건비가 차지하는 비중이 2024년에 처음으로 70%를 넘어섰다. 이 비중은 2019년 63.6%에서 2020년 66.1%, 2021년 66.7%, 2024년 71.6%로 올랐다. '
       '주문 채널별 비중은 키오스크 41.5%, 카운터 대면 33.5%, 배달 앱 25.0%로 나타났다. '
       '최근 외식업체는 키오스크 등 디지털 기반 주문 시스템을 도입하는 등 디지털 전환이 빠르게 진행되고 있다. '
       '[...] 수 대비 비중은 ‘음식료품 제조업’이 1.6%, ‘음식점업·주점업’이 9.3%로 높다. 이어지는 문장이다. [...] 같은 기간 외식업체 평균 매출은 1억4883만원에서 2')
SRC = {'W1': {'text': DOC}}


def fact(metric, value, unit, quote, period=''):
    return {'src': 'W1', 'metric': metric, 'value': value, 'unit': unit, 'period': period, 'statement': '', 'quote': quote}


def verify(**raw):
    out, why = m.verify({'facts': [], 'series': [], 'shares': [], 'trends': [], **raw}, SRC, [])
    return out, why


class Matching(unittest.TestCase):
    def test_value_must_be_whole_number_in_text(self):
        t = m.norm(DOC)
        self.assertTrue(m.value_in('8만7341', t))
        self.assertFalse(m.value_in('7341', t), '더 긴 숫자의 일부')
        self.assertFalse(m.value_in('2.4', t), '32.4 의 일부')
        self.assertTrue(m.value_in('32.4', t))

    def test_unit_must_follow_value(self):
        t = m.norm(DOC)
        self.assertTrue(m.unit_after('32.4', '조 원', t))
        self.assertFalse(m.unit_after('32.4', '원', t), '조를 빼고 읽음')
        self.assertFalse(m.unit_after('32.4', '', t), '큰 수 단위가 붙은 값을 단위 없이 읽음')
        self.assertFalse(m.unit_after('3.2', '%', t), '%p 를 % 로 읽음')
        self.assertTrue(m.unit_after('3.2', '%p', t))
        self.assertFalse(m.unit_after('5479', '억', t))

    def test_truncated_number_at_chunk_edge_is_rejected(self):
        t = m.norm(DOC)
        self.assertFalse(m.value_in('2', t[t.rfind(m.norm('평균 매출은')):]), '본문이 숫자에서 끝남')

    def test_to_number(self):
        self.assertEqual(m.to_number('8만7341'), 87341)
        self.assertEqual(m.to_number('1,200'), 1200)
        self.assertEqual(m.to_number('약 53만 7천'), 537000)
        self.assertIsNone(m.to_number('많음'))

    def test_public_query_scrubs_customer_but_keeps_industry_words(self):
        p = m.private_terms({'customer': 'B 호텔', 'industry': '호텔 · 리조트', 'title': 'B 호텔 객실 리뉴얼'})
        self.assertEqual(m.public_query('B 호텔 객실 TV 교체 통계', p), '호텔 객실 TV 교체 통계')
        p = m.private_terms({'customer': '스타벅스코리아 강남점', 'industry': '외식 프랜차이즈'})
        q = m.public_query('스타벅스코리아 강남점 커피전문점 시장 규모 예산 3억 원 hong@a.com 010-1234-5678', p)
        self.assertNotIn('스타벅스', q)
        self.assertNotIn('강남점', q)
        self.assertNotIn('3억', q)
        self.assertNotIn('@', q)
        self.assertNotIn('1234', q)
        self.assertIn('커피전문점 시장 규모', q)

    def test_name_must_use_words_of_the_quote(self):
        q = '둘째, 외식업체 중 로봇을 도입한 업체 비중은 0.2%로 매우 미미한 것으로 나타났다.'
        self.assertEqual(m.ungrounded('외식업체 로봇 도입 업체 비중', q), [])
        self.assertIn('프랜차이즈', m.ungrounded('외식 프랜차이즈 로봇 도입 비중', q))

    def test_anaphoric_quote(self):
        self.assertTrue(m.anaphoric('이 비중은 2019년 63.6%에서 2024년 71.6%로 올랐다.', '63.6'))
        self.assertFalse(m.anaphoric('식재료비와 인건비가 차지하는 비중이 70%를 넘어섰다. 이 비중은 2019년 63.6%에서 2024년 71.6%로 올랐다.', '63.6'))
        self.assertFalse(m.anaphoric('이마트의 매출은 2024년 29조 원', '29'))


class Verify(unittest.TestCase):
    def test_good_fact_passes_with_period_and_display(self):
        out, why = verify(facts=[fact('무인주문기 도입률', '13.0', '%', '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며', '2025')])
        self.assertEqual(len(out['facts']), 1, why)
        self.assertEqual(out['facts'][0]['period'], '2025')

    def test_invented_quote_is_rejected(self):
        out, why = verify(facts=[fact('키오스크 매출 성장률', '13.0', '%', '키오스크 매출은 해마다 13.0%씩 성장해 업계의 대세가 되었다고 전문가들은 말한다')])
        self.assertEqual(out['facts'], [])
        self.assertIn('인용이 원문과 다름', why)

    def test_lightly_edited_quote_is_reanchored_to_the_real_sentence(self):
        out, why = verify(facts=[fact('무인주문기 도입률', '13.0', '%', '키오스크·테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대', '2025')])
        self.assertEqual(len(out['facts']), 1, why)
        self.assertIn(m.norm(out['facts'][0]['quote']), m.norm(DOC), '저장되는 인용은 원문 그대로')

    def test_partial_value_wrong_unit_wrong_year(self):
        q = '외식업체에 설치한 키오스크 대수는 2019년 5479대에서 2022년 8만7341대로 늘었다.'
        out, _ = verify(facts=[fact('외식업체 키오스크 대수', '7341', '대', q, '2022')])
        self.assertEqual(out['facts'], [], '8만7341 을 7341 로 읽음')
        out, _ = verify(facts=[fact('외식업체 키오스크 대수', '8만7341', '억', q, '2022')])
        self.assertEqual(out['facts'], [], '단위가 다름')
        out, _ = verify(facts=[fact('외식업체 키오스크 대수', '8만7341', '대', q, '2024')])
        self.assertEqual(out['facts'][0]['period'], '2022', '시점은 모델의 말이 아니라 인용에서 값 바로 앞의 연도')

    def test_period_is_the_year_next_to_the_value(self):
        q = '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며'
        out, _ = verify(facts=[fact('무인주문기 도입률', '4.5', '%', q, '2025'), fact('무인주문기 도입률', '13.0', '%', q, '2021')])
        self.assertEqual({f['value']: f['period'] for f in out['facts']}, {'4.5': '2021', '13.0': '2025'}, '연도를 서로 바꿔 말해도 코드가 바로잡는다')
        doc = '조사 결과는 다음과 같다. 외식업체에 설치한 키오스크 대수는 2019년 5479대에서 지난해 8만7341대로 늘었다. 한편 전처리 식재료의 구매 비중은 23.0%에서 29.3%로 크게 확대되었다. 끝.'
        v, why = m.verify({'facts': [{**fact('외식업체 키오스크 대수', '8만7341', '대', '외식업체에 설치한 키오스크 대수는 2019년 5479대에서 지난해 8만7341대로 늘었다.', '2019')},
                                     {**fact('전처리 식재료 구매 비중', '23.0', '%', '한편 전처리 식재료의 구매 비중은 23.0%에서 29.3%로 크게 확대되었다.')},
                                     {**fact('전처리 식재료 구매 비중', '29.3', '%', '한편 전처리 식재료의 구매 비중은 23.0%에서 29.3%로 크게 확대되었다.')}],
                          'series': [], 'shares': [], 'trends': []}, {'W1': {'text': doc}}, [])
        got = {f['value']: f['period'] for f in v['facts']}
        self.assertEqual(got.get('8만7341'), '', "'지난해'의 값에 앞의 다른 값의 연도(2019)를 붙이지 않는다")
        self.assertNotIn('23.0', got, '시점 없는 변화의 이전 값은 지금의 값이 아니다')
        self.assertEqual(got.get('29.3'), '')

    def test_edited_quote_on_spaceless_pdf_text_is_reanchored(self):
        doc = '조사결과는다음과같다.무인주문기를사용하고있는외식업체의비중은2017년0.6%에서,2023년7.8%,2024년12.9%로대폭증가하였으며,로봇을도입한업체비중은0.2%로매우미미한것으로나타났다.둘째문장이이어진다.'
        v, why = m.verify({'facts': [fact('무인주문기 사용 외식업체 비중', '12.9', '%', '무인주문기를 사용하는 외식업체 비중은 2017년 0.6%에서 2023년 7.8%, 2024년 12.9%로 대폭 증가')],
                           'series': [], 'shares': [], 'trends': []}, {'W1': {'text': doc}}, [])
        self.assertEqual(len(v['facts']), 1, why)
        self.assertIn(v['facts'][0]['quote'], doc, '저장되는 인용은 원문 글자 그대로')
        self.assertEqual(v['facts'][0]['period'], '2024')

    def test_only_trusted_domestic_evidence_reaches_a_sheet(self):
        base = {'metric': '호텔 객실점유율', 'value': '75.2', 'unit': '%', 'disp': ['75.2', '%'], 'tier': 1}
        self.assertTrue(m.usable('stat', base))
        self.assertFalse(m.usable('stat', {**base, 'tier': 3}), '업체 홍보 글의 수치')
        self.assertFalse(m.usable('stat', {**base, 'foreign': True}), '다른 나라의 수치')
        self.assertEqual(m.tier_of('mafra.go.kr'), 1)
        self.assertEqual(m.tier_of('foodnews.co.kr'), 2)
        self.assertEqual(m.tier_of('aonkiosk.com'), 3)
        self.assertEqual(m.qualifiers('75', '%', m.norm('대기 시간을 최대 75%까지 단축'), (0, 99)), ('최대 ', ''))

    def test_headless_and_truncated_quotes_are_rejected(self):
        out, why = verify(facts=[fact('음식점업 비중', '9.3', '%', '수 대비 비중은 ‘음식료품 제조업’이 1.6%, ‘음식점업·주점업’이 9.3%로 높다.')])
        self.assertEqual(out['facts'], [], why)
        out, why = verify(facts=[fact('외식업체 평균 매출', '2', '', '같은 기간 외식업체 평균 매출은 1억4883만원에서 2')])
        self.assertEqual(out['facts'], [], why)

    def test_anaphoric_fact_is_rejected_unless_antecedent_is_quoted(self):
        out, why = verify(facts=[fact('인건비 비중', '71.6', '%', '이 비중은 2019년 63.6%에서 2020년 66.1%, 2021년 66.7%, 2024년 71.6%로 올랐다.', '2024')])
        self.assertEqual(out['facts'], [], why)
        out, why = verify(facts=[fact('일반음식점 식재료비 인건비 비중', '71.6', '%',
                                      '국내 일반음식점의 매출에서 식재료비와 인건비가 차지하는 비중이 2024년에 처음으로 70%를 넘어섰다. 이 비중은 2019년 63.6%에서 2020년 66.1%, 2021년 66.7%, 2024년 71.6%로 올랐다.', '2024')])
        self.assertEqual(len(out['facts']), 1, why)

    def test_name_with_words_outside_the_quote_is_rejected(self):
        out, why = verify(facts=[fact('외식 프랜차이즈 무인주문기 도입률', '13.0', '%', '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며', '2025')])
        self.assertEqual(out['facts'], [])
        self.assertIn('지표 이름이 인용에 없는 말', why)

    def test_series_needs_three_points_in_one_document(self):
        q = '국내 일반음식점의 매출에서 식재료비와 인건비가 차지하는 비중이 2024년에 처음으로 70%를 넘어섰다. 이 비중은 2019년 63.6%에서 2020년 66.1%, 2021년 66.7%, 2024년 71.6%로 올랐다.'
        pts = [{'period': y, 'value': v} for y, v in (('2019', '63.6'), ('2020', '66.1'), ('2021', '66.7'), ('2024', '71.6'))]
        out, why = verify(series=[{'src': 'W1', 'metric': '일반음식점 식재료비 인건비 비중', 'unit': '%', 'points': pts, 'quote': q}])
        self.assertEqual(len(out['series']), 1, why)
        self.assertEqual([p['year'] for p in out['series'][0]['points']], [2019, 2020, 2021, 2024])
        bad = pts[:2] + [{'period': '2022', 'value': '68.0'}]  # 원문에 없는 점
        out, why = verify(series=[{'src': 'W1', 'metric': '일반음식점 식재료비 인건비 비중', 'unit': '%', 'points': bad, 'quote': q}])
        self.assertEqual(out['series'], [], why)

    def test_share_must_sum_to_100(self):
        q = '주문 채널별 비중은 키오스크 41.5%, 카운터 대면 33.5%, 배달 앱 25.0%로 나타났다.'
        items = [{'label': '키오스크', 'value': '41.5'}, {'label': '카운터 대면', 'value': '33.5'}, {'label': '배달 앱', 'value': '25.0'}]
        out, why = verify(shares=[{'src': 'W1', 'subject': '주문 채널별 비중', 'period': '', 'items': items, 'quote': q}])
        self.assertEqual(len(out['shares']), 1, why)
        out, why = verify(shares=[{'src': 'W1', 'subject': '주문 채널별 비중', 'period': '', 'items': items[:2], 'quote': q}])
        self.assertEqual(out['shares'], [], '합이 100%가 아니면 구성비가 아니다')

    def test_trend_statement_may_not_add_numbers(self):
        q = '최근 외식업체는 키오스크 등 디지털 기반 주문 시스템을 도입하는 등 디지털 전환이 빠르게 진행되고 있다.'
        out, why = verify(trends=[{'src': 'W1', 'keyword': '디지털 전환', 'statement': '외식업체의 디지털 전환이 빠르게 진행되고 있다.', 'quote': q}])
        self.assertEqual(len(out['trends']), 1, why)
        out, why = verify(trends=[{'src': 'W1', 'keyword': '디지털 전환', 'statement': '외식업체의 80%가 디지털 전환을 마쳤다.', 'quote': q}])
        self.assertEqual(out['trends'], [], why)

    def test_stat_display_keeps_the_value(self):
        self.assertEqual(m.stat_display({'value': '8만7341', 'unit': '대', 'num': 87341.0}), ('87,341', '대'))
        self.assertEqual(m.stat_display({'value': '53만 7천', 'unit': '대', 'num': 537000.0, 'pre': '약 '}), ('53.7', '만 대 안팎'))
        self.assertEqual(m.stat_display({'value': '60', 'unit': '%', 'num': 60.0, 'post': ' 이상'}), ('60', '% 이상'))
        self.assertIsNone(m.stat_display({'value': '1억4883만', 'unit': '원', 'num': 148830000.0}), '칸에 안 들어가는 값은 쓰지 않는다')


class FakeResult:
    def __init__(self, data):
        self.data, self.prompt_tokens, self.output_tokens = data, 10, 10


class FakeProvider:
    """stage 별로 정해 둔 답을 돌려준다 — 추출 단계에는 맞는 항목과 틀린 항목을 섞어 넣는다."""
    model = 'fake'

    def __init__(self, select=None, judge_ok=True, audit_ok=True, scope='market', keep=None, plan=None):
        self.calls, self.select, self.judge_ok, self.audit_ok, self.scope, self.keep, self.plan = [], select, judge_ok, audit_ok, scope, keep, plan
        self.screened = []

    def model_for(self, tier):
        return 'fake'

    def search_web(self, *, stage, query, cancel=None):  # 파이프라인 시험은 search_topic 을 바꿔 끼우므로 불리지 않는다
        self.calls.append(stage)
        return types.SimpleNamespace(grounding={}, text='', prompt_tokens=0, output_tokens=0)

    def generate_json(self, *, stage, user='', **kw):
        self.calls.append(stage)
        if stage == 'research:plan' and self.plan is not None:
            return FakeResult(self.plan)
        if stage == 'research:screen':
            import json
            import re
            rows = json.loads(re.search(r'<<<DATA\n(.*)\nDATA>>>', user, re.S).group(1))
            self.screened = rows
            if isinstance(self.keep, Exception):
                raise self.keep
            return FakeResult({'keep': [r['n'] for r in rows] if self.keep is None else [r['n'] for r in rows if self.keep(r)]})
        if stage == 'research:plan':
            return FakeResult({'topics': [{'id': 't1', 'shape': 'series', 'metric': '원가 비중', 'why': '인건비 부담', 'queries': ['A 커피 외식업 원가 비중 추이']},
                                          {'id': 't2', 'shape': 'stat', 'metric': '무인주문기 도입률', 'why': '키오스크 검토', 'queries': ['외식업 무인주문기 도입률 통계']},
                                          {'id': 't3', 'shape': 'stat', 'metric': '온라인 거래액', 'why': '주문 채널', 'queries': ['음식서비스 온라인 거래액 통계']},
                                          {'id': 't4', 'shape': 'trend', 'metric': '디지털 전환', 'why': '메뉴보드 전환', 'queries': ['외식업 디지털 전환 동향']}]})
        if stage == 'research:extract':
            q_cost = '국내 일반음식점의 매출에서 식재료비와 인건비가 차지하는 비중이 2024년에 처음으로 70%를 넘어섰다. 이 비중은 2019년 63.6%에서 2020년 66.1%, 2021년 66.7%, 2024년 71.6%로 올랐다.'
            return FakeResult({
                'facts': [fact('무인주문기 도입률', '13.0', '%', '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며', '2025'),
                          fact('외식업체 키오스크 대수', '8만7341', '대', '외식업체에 설치한 키오스크 대수는 2019년 5479대에서 2022년 8만7341대로 늘었다.', '2022'),
                          fact('음식서비스 온라인 거래액', '37.0', '조 원', '음식서비스 온라인 거래액은 2023년 32.4조 원에서 2024년 37.0조 원으로 14.3% 증가했으며', '2024'),
                          fact('외식업 매출 성장률', '25', '%', '외식업 매출은 해마다 25%씩 성장하고 있다고 한다', '2025'),          # 지어낸 인용
                          fact('외식업체 키오스크 대수', '7341', '대', '외식업체에 설치한 키오스크 대수는 2019년 5479대에서 2022년 8만7341대로 늘었다.', '2022')],  # 잘라 읽은 값
                'series': [{'src': 'W1', 'topic': 't1', 'metric': '일반음식점 식재료비 인건비 비중', 'unit': '%', 'quote': q_cost,
                            'points': [{'period': y, 'value': v} for y, v in (('2019', '63.6'), ('2020', '66.1'), ('2021', '66.7'), ('2024', '71.6'))]}],
                'shares': [], 'trends': [{'src': 'W1', 'topic': 't4', 'keyword': '디지털 전환', 'statement': '외식업체의 디지털 전환이 빠르게 진행되고 있다.',
                                          'quote': '최근 외식업체는 키오스크 등 디지털 기반 주문 시스템을 도입하는 등 디지털 전환이 빠르게 진행되고 있다.'}]})
        if stage in ('research:audit', 'research:judge'):
            import json
            import re
            rows = json.loads(re.search(r'<<<DATA\n(.*)\nDATA>>>', user, re.S).group(1))
            ok = self.audit_ok if stage == 'research:audit' else self.judge_ok
            scope = self.scope if isinstance(self.scope, str) else None
            return FakeResult({'checks': [{'n': r['n'], 'says': '확인', 'ok': ok, 'scope': scope or self.scope(r)} for r in rows]})
        if stage == 'research:select':
            if isinstance(self.select, Exception):
                raise self.select
            return FakeResult(self.select)
        raise AssertionError(stage)


def fake_search(provider, topic, **kw):
    return [{'title': '외식업 통계', 'url': 'https://www.mafra.go.kr/stat/1', 'text': DOC, 'score': 0.9, 'published': ''}]


def cfg(engines=('llm',), db='', **over):
    """시험용 설정 — 기본은 모델 연결의 검색만 · 근거 DB 없음(바깥 사이트 · 실제 DB 파일을 건드리지 않는다)."""
    base = {'on': True, 'ttl': 0, 'queries': 10, 'engines': tuple(engines), 'store': bool(db), 'db': db, 'reuse': 30 * 86400, 'keep': 365 * 86400,
            'search_ttl': 7 * 86400, 'doc_ttl': 30 * 86400}
    return lambda: {**base, **over}


ON = cfg()


SPEC = {'industry': '외식 프랜차이즈', 'industry_short': '외식 프랜차이즈', 'ind': 'FB', 'customer': 'A 커피', 'title': 'A 커피 메뉴보드',
        'requirement': '전국 매장 메뉴판을 디지털 메뉴보드로 바꾸고 키오스크 도입도 검토 중이다. 인건비 부담이 크다.', 'products': [], 'solutions': [], 'hints': [], 'today': '2026-11-15'}


class Pipeline(unittest.TestCase):
    def run_sheets(self, provider, want, spec=None):
        with mock.patch.object(m, 'settings', ON), mock.patch.object(m, 'search_topic', fake_search), mock.patch.object(m, '_cache_put', lambda *a: None):
            return m.trend_sheets(spec or SPEC, want, provider)

    def test_values_come_from_verified_evidence_only(self):
        sel = {'sheets': [{'kind': 'line', 'ids': ['R1'], 'title': '원가 비중이 처음 70%를 넘었습니다', 'note': '2019년 63.6%에서 2024년 71.6%로', 'labels': [''], 'lines': [], 'why': '인건비 부담 ↔ 원가 비중'},
                          {'kind': 'stat', 'ids': ['F1', 'F2', 'F3'], 'title': '숫자로 보는 외식업', 'note': '', 'labels': ['', '', ''], 'lines': [], 'why': '키오스크 검토 ↔ 도입률'}]}
        out = self.run_sheets(FakeProvider(select=sel), ['line', 'stat'])
        self.assertTrue(out['ok'], out)
        line, stat = out['sheets']
        self.assertEqual([line['v'][f'v{i}'] for i in range(6)], ['63.6', '66.1', '66.7', '71.6', '', ''])
        self.assertEqual([line['v'][f'y{i}'] for i in range(4)], ['2019', '2020', '2021', '2024'])
        self.assertEqual(line['v']['sv'], '+8.0%p', '비율의 추이는 %p 차이로')
        shown = {stat['v'][f'vl{i}'] for i in range(3)}
        self.assertEqual(shown, {'13.0', '87,341', '37.0'})
        self.assertNotIn('25', shown, '지어낸 인용의 값')
        self.assertNotIn('7341', shown, '잘라 읽은 값')
        for sh in (line, stat):
            for slot, evs in sh['ev'].items():
                for e in evs:
                    self.assertTrue(e['url'].startswith('https://'), slot)
                    self.assertTrue(e['sub'].startswith('“'), '근거에는 인용 원문이 들어 있다')
        self.assertEqual(out['research']['queries'][0], '커피 외식업 원가 비중 추이', '검색어에서 고객사 이름을 지운다')

    def test_title_with_unsupported_number_is_replaced(self):
        sel = {'sheets': [{'kind': 'stat', 'ids': ['F1', 'F2', 'F3'], 'title': '도입률이 99%에 이르렀습니다', 'note': '', 'labels': ['', '', ''], 'lines': [], 'why': ''}]}
        out = self.run_sheets(FakeProvider(select=sel), ['stat'])
        self.assertNotIn('99', out['sheets'][0]['v']['title'])

    def test_judge_rejection_falls_back_to_neutral_text(self):
        sel = {'sheets': [{'kind': 'stat', 'ids': ['F1', 'F2', 'F3'], 'title': '무인 주문이 대세입니다', 'note': '', 'labels': ['', '', ''], 'lines': [], 'why': ''}]}
        out = self.run_sheets(FakeProvider(select=sel, judge_ok=False), ['stat'])
        self.assertEqual(out['sheets'][0]['v']['title'], '숫자로 보는 외식 프랜차이즈의 지금')

    def test_kind_follows_the_evidence_not_the_template(self):
        # 템플릿은 구성비(share)를 원하지만 검증된 구성비 근거가 없다 → 근거가 있는 종류로 바뀐다
        sel = {'sheets': [{'kind': 'share', 'ids': ['H1'], 'title': '주문 채널', 'note': '', 'labels': [''], 'lines': [], 'why': ''}]}
        out = self.run_sheets(FakeProvider(select=sel), ['share'])
        sh = out['sheets'][0]
        self.assertTrue(sh['filled'])
        self.assertIn(sh['kind'], ('stat', 'line'))
        self.assertEqual(sh['was'], 'share')

    def test_selection_failure_still_builds_from_ranked_evidence(self):
        out = self.run_sheets(FakeProvider(select=RuntimeError('model down')), ['stat'])
        self.assertTrue(out['sheets'][0]['filled'])
        self.assertEqual(out['sheets'][0]['kind'], 'stat')

    def test_audit_failure_means_no_values(self):
        out = self.run_sheets(FakeProvider(select={'sheets': []}, audit_ok=False), ['stat', 'key'])
        self.assertFalse(out['ok'])
        self.assertTrue(all(not sh['filled'] and not sh['v'] for sh in out['sheets']), '이름 확인을 못 받은 근거로는 채우지 않는다')

    def test_without_web_search_nothing_is_planned_or_searched(self):
        class NoSearch(FakeProvider):
            search_web = None
        p = NoSearch()
        with mock.patch.object(m, 'settings', ON):
            out = m.trend_sheets(SPEC, ['stat'], p)
        self.assertFalse(out['ok'])
        self.assertEqual(out['research']['reason'], 'no_web_search')
        self.assertFalse(out['sheets'][0]['filled'])
        self.assertEqual(p.calls, [], '검색을 못 하는 연결이면 조사 계획도 세우지 않는다')

    def test_failed_or_unreadable_search_never_raises(self):
        def boom(*a, **k):
            raise RuntimeError('network')
        with mock.patch.object(m, 'settings', ON), mock.patch.object(m, 'search_topic', boom):
            out = m.trend_sheets(SPEC, ['stat'], FakeProvider())
        self.assertFalse(out['ok'])
        self.assertEqual(out['research']['reason'], 'search_failed')
        with mock.patch.object(m, 'settings', ON), mock.patch.object(m, 'search_topic', lambda *a, **k: []):
            out = m.trend_sheets(SPEC, ['stat'], FakeProvider())
        self.assertEqual(out['research']['reason'], 'fetch_failed')
        self.assertFalse(out['sheets'][0]['filled'])


class WebSearch(unittest.TestCase):
    """검색은 공통 LLM 모듈(provider.search_web)이, 근거 글은 서버가 직접 받은 출처 페이지가 맡는다 — 별도 검색 키는 없다."""

    def test_adapter_probe(self):
        from app.api.llm.adapters import GeminiAdapter, OpenRouterAdapter
        cfg = types.SimpleNamespace(base_url='', api_key=lambda: 'k', schema_mode='json_object', reasoning='')
        gem = types.SimpleNamespace(adapter=GeminiAdapter(cfg), model='gemini-x', search_web=lambda **k: None)
        orr = types.SimpleNamespace(adapter=OpenRouterAdapter(cfg), model='qwen', search_web=lambda **k: None)
        self.assertTrue(m.web_search_supported(gem))
        self.assertFalse(m.web_search_supported(orr), 'OpenRouter(Qwen) 연결은 웹 검색을 지원하지 않는다')
        with mock.patch.object(m, 'settings', ON):
            self.assertEqual(m.available(orr), (False, 'no_web_search'))
            self.assertEqual(m.available(gem), (True, ''))
            self.assertEqual(m.available(None), (False, 'no_provider'))

    def test_evidence_comes_from_the_page_not_the_search_summary(self):
        page = ('외식업 경영실태조사 결과입니다. 키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며, '
                '인력난에 대응하고 있다. 관계없는 문단입니다. ' * 3)
        grounding = {'groundingChunks': [{'web': {'uri': 'https://vertexaisearch.example/redirect/1', 'title': 'mafra.go.kr'}},
                                         {'web': {'uri': 'https://vertexaisearch.example/redirect/2', 'title': 'blog'}},
                                         {'web': {'uri': 'https://vertexaisearch.example/redirect/3', 'title': 'dead'}}],
                     'groundingSupports': [{'segment': {'text': '모델 요약: 무인주문기 도입률은 99%다'}, 'groundingChunkIndices': [0]}]}
        prov = types.SimpleNamespace(search_web=lambda **k: types.SimpleNamespace(grounding=grounding, text='모델 요약: 무인주문기 도입률은 99%다', prompt_tokens=1, output_tokens=1))
        pages = {'https://vertexaisearch.example/redirect/1': {'url': 'https://www.mafra.go.kr/stat/1', 'title': '보도자료', 'text': page, 'kind': 'html'},
                 'https://vertexaisearch.example/redirect/2': {'url': 'https://blog.naver.com/x/1', 'title': 'b', 'text': page, 'kind': 'html'}}
        with mock.patch.object(m, 'fetch_page', lambda url, **k: pages.get(url)):
            docs = m.search_topic(prov, {'metric': '외식업 무인주문기 도입률', 'queries': ['외식업 무인주문기 도입률 통계']})
        self.assertEqual([d['url'] for d in docs], ['https://www.mafra.go.kr/stat/1'], '리다이렉트가 아닌 실제 주소 · 블로그와 열리지 않는 출처는 뺀다')
        self.assertIn('2025년 13.0%', docs[0]['text'])
        self.assertNotIn('99%', docs[0]['text'], '검색 모델의 요약은 근거 글에 들어가지 않는다')
        self.assertTrue(docs[0]['text'].startswith(m.FULL), '대목은 문장 시작에서 자른다')

    def test_passages_are_whole_sentences_near_the_topic(self):
        text = '서론입니다. 오늘 날씨가 맑다. 무인주문기 도입률은 2025년 13.0%로 확대됐다. 결론입니다.'
        out = m.passages(text, ['무인주문기 도입률'], k=1)
        self.assertIn('무인주문기 도입률은 2025년 13.0%로 확대됐다.', out)
        body = out.replace(m.FULL, '')
        self.assertIn(body, text, '원문 글자 그대로')


class Display(unittest.TestCase):
    """2026-11-16 벤치 감사에서 나온 결함 — 값이 칸에 들어갈 때 바뀌면 안 된다."""

    def test_korean_magnitudes_are_read_with_the_unit(self):
        self.assertEqual(m.to_number('2조2천387', '억원'), 2e12 + 2387e8)
        self.assertEqual(m.to_number('8만7341', '대'), 87341)
        self.assertEqual(m.to_number('53만 7천', '대'), 537000)
        self.assertEqual(m.to_number('1,276', '만 명'), 1276)
        self.assertEqual(m.to_number('3천2만'), 30020000, '3,002만')
        self.assertIsNone(m.to_number('2만3억'), '큰 수 단위의 차례가 어긋난 표기는 읽지 않는다')

    def test_stat_display_never_recombines_units(self):
        # 벤치에서 '2조2천387억원'이 '2' + '조 억원'으로 실렸다 — 칸에 안 들어가면 쓰지 않는 것이 맞다
        f = {'value': '2조2천387', 'unit': '억원', 'num': m.to_number('2조2천387', '억원')}
        d = m.stat_display(f)
        self.assertTrue(d is None or m.norm(''.join(d)) == m.norm('2조2천387억원'), d)
        self.assertEqual(m.stat_display({'value': '8만7341', 'unit': '대'}), ('87,341', '대'))
        self.assertEqual(m.stat_display({'value': '53만 7천', 'unit': '대', 'pre': '약 '}), ('53.7', '만 대 안팎'))
        self.assertEqual(m.stat_display({'value': '1,276', 'unit': '만 명'}), ('1,276', '만 명'))
        self.assertIsNone(m.stat_display({'value': '1억4883만', 'unit': '원'}))

    def test_approximation_after_the_unit_is_kept(self):
        t = m.norm('최근 서울의 신규 호텔 공급은 연간 1000실 안팎으로 팬데믹 이전의 4분의 1 수준에 그친다.')
        self.assertEqual(m.qualifiers('1000', '실', t, (0, len(t))), ('', ' 안팎'))
        d = m.stat_display({'value': '1000', 'unit': '실', 'post': ' 안팎'})
        self.assertTrue(d is None or d[1].endswith('안팎'), '어림값을 정확한 값처럼 싣지 않는다(칸에 안 들어가면 쓰지 않는다)')

    def test_old_evidence_is_not_used(self):
        base = {'metric': '옥외광고 시장 규모', 'value': '1조342', 'unit': '억 원', 'disp': ['1조342', '억 원'], 'tier': 1}
        self.assertTrue(m.usable('stat', base))
        self.assertFalse(m.usable('stat', {**base, 'old': True}))


# ================================================================================================ 동적 검색 — 출처 자체 검색 · 정제 · 추리기 · 근거 DB
from app.api.poc import market_sources as ms  # noqa: E402
from app.api.poc import market_store  # noqa: E402

RESULT_PAGE = '''<html><body>
<div class="topSokbo"><a href="/news/economy/900001" title="코스피 5100선까지 밀려…반도체 6%대 급락"><span>코스피 5100선까지 밀려…반도체 6%대 급락</span></a>
<a href="/news/economy/900002"><span>제45회 문학상 수상자 발표</span></a></div>
<ul id="list_area">
<li><a href="https://www.mk.co.kr/news/economy/12184751?utm=x" class="news_item"><div class="txt_area"><h3 class="news_ttl">“남는 게 없다”…일반음식점 식재료·인건비 비중 70% 돌파<span class="is_blind">매경플러스</span></h3>
<p class="news_desc">외식업체 경영실태조사 결과 2028.12.31까지 유예되는 제도와 별개로 인건비 부담이 커졌다.</p><p class="time_info">2026-09-14 05:31:00</p></div></a></li>
<li><a href="/news/business/12169405"><div class="thumb"><img alt=""></div></a>
<strong><a href="/news/business/12169405">외식업 키오스크 도입 30% 넘어</a></strong>
<span><a href="/news/business/12169405">... 서울 음식점 2천곳 설문에서 <i class="highlight">인건비</i> 부담으로 무인주문기를 들였다 ...</a></span>
<em><i>경제</i><i>2026-10-07</i></em></li>
</ul></body></html>'''


class Sources(unittest.TestCase):
    """출처 자체 검색(market_sources) — 결과 화면을 한 가지 방식으로 읽고, robots.txt 를 지킨다."""

    def test_only_links_that_match_the_query_are_results(self):
        res = ms.parse_results(ms.ENGINES['mk'], RESULT_PAGE, '외식업 인건비')
        self.assertEqual([r['url'] for r in res], ['https://www.mk.co.kr/news/economy/12184751', 'https://www.mk.co.kr/news/business/12169405'],
                         '속보 · 순위 목록(검색어가 없는 링크)은 결과가 아니다 · 주소의 추적 쿼리는 뗀다')
        self.assertEqual(res[0]['title'], '“남는 게 없다”…일반음식점 식재료·인건비 비중 70% 돌파', '화면에 보이지 않는 글(is_blind)은 제목이 아니다')
        self.assertEqual(res[0]['published'], '2026-09-14', '요약 문장 속 미래 날짜(2028.12.31)는 발행일이 아니다')
        self.assertEqual(res[1]['title'], '외식업 키오스크 도입 30% 넘어')
        self.assertIn('무인주문기', res[1]['snippet'])
        self.assertEqual(res[1]['published'], '2026-10-07', '링크 뒤의 날짜 칸')

    def test_robots_txt_is_obeyed_including_redirect_targets(self):
        calls = []

        def raw(url, timeout, limit, redirect=None):
            calls.append(url)
            if url.endswith('/robots.txt'):
                body = b'User-agent: *\nDisallow: /search\n' if 'closed.example' in url else b'User-agent: *\nAllow: /\n'
                return url, 'text/plain', body
            if 'hop.example' in url and redirect:
                redirect('https://closed.example/search?q=1')  # 리다이렉트로 옮겨 간 곳이 금지된 주소
            return url, 'text/html', b'<html>ok</html>'
        with mock.patch.object(ms, '_raw_get', raw), mock.patch.dict(ms._ROBOTS, {}, clear=True):
            self.assertTrue(ms.robots_allows('https://open.example/a'))
            self.assertFalse(ms.robots_allows('https://closed.example/search?q=1'))
            with self.assertRaises(ms.Disallowed):
                ms.http_get('https://closed.example/search?q=1')
            self.assertNotIn('https://closed.example/search?q=1', calls, '금지된 주소는 받지 않는다')
            with self.assertRaises(ms.Disallowed):
                ms.http_get('https://hop.example/r', check_first=False)

    def test_unreadable_robots_means_the_site_is_skipped(self):
        def raw(url, timeout, limit, redirect=None):
            raise OSError('timeout')
        with mock.patch.object(ms, '_raw_get', raw), mock.patch.dict(ms._ROBOTS, {}, clear=True):
            self.assertFalse(ms.robots_allows('https://slow.example/a'))

    def test_a_failing_source_is_not_hammered_and_cached_results_skip_the_site(self):
        hits = []

        def search(engine, query, **kw):
            hits.append((engine, query))
            if engine == 'mk':
                raise RuntimeError('blocked')
            return [{'url': 'https://www.korea.kr/news/policyNewsView.do?newsId=1', 'title': query, 'snippet': '', 'published': ''}]
        seen = []
        with mock.patch.object(ms, 'search', search):
            out = ms.search_many([(e, q) for q in ('가 나', '다 라', '마 바', '사 아') for e in ('mk', 'korea')],
                                 cached=lambda e, q: [] if (e, q) == ('korea', '다 라') else None, done=lambda e, q, res, err: seen.append((e, q, res is not None)))
        self.assertEqual([h for h in hits if h[0] == 'mk'], [('mk', '가 나'), ('mk', '다 라')], '연달아 두 번 실패한 출처는 남은 검색어로 더 부르지 않는다')
        self.assertNotIn(('korea', '다 라'), hits, '저장된 결과가 있으면 사이트를 부르지 않는다')
        self.assertEqual(len(out[('korea', '가 나')]), 1)
        self.assertEqual(out[('mk', '사 아')], [])


ARTICLE = '''<html><head><title>식재료·인건비 비중 70% 돌파 - 매일경제</title><meta property="article:published_time" content="2026-09-14T05:31:00+09:00"></head><body>
<div class="ticker"><div><a href="/n/1"><span>호텔 객실 점유율 85% 기록한 A호텔</span></a></div></div>
<div class="rank"><em>1</em><p>첫 출근도 안 했는데 보너스 4000만원을 준다는 회사가 화제다.</p></div>
<div class="news_cnt_detail_wrap" itemprop="articleBody"><p>__DOC__</p><div class="inner"><p>둘째 문단입니다.</p></div></div>
<div class="ai_summary"><p>AI 요약: 외식업 매출은 해마다 25%씩 성장하고 있어요.</p></div>
</body></html>'''.replace('__DOC__', DOC)


class Cleaning(unittest.TestCase):
    """정제 — 그 기사의 글만 근거가 된다(속보 줄 · 순위 목록 · 기계 요약 상자는 그 기사의 사실이 아니다)."""

    def test_only_the_article_body_is_kept(self):
        title, text, published = m.clean_html(ARTICLE)
        self.assertEqual(published, '2026-09-14')
        self.assertIn('무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로', text)
        self.assertIn('둘째 문단입니다.', text, '본문 요소 안에 겹친 요소도 끝까지 읽는다')
        for outside in ('85%', '4000만원', '25%씩'):
            self.assertNotIn(outside, text, '본문 요소 밖의 글')

    def test_without_a_body_element_link_lists_are_dropped(self):
        page = ('<html><body><ul><li><a href="/a">관련기사: 키오스크 도입률 99% 돌파</a></li><li><a href="/b">많이 본 뉴스: 매출 500% 급증</a></li></ul>'
                '<p>본문 문장입니다. 자세한 내용은 <a href="/c">보고서</a>에 실려 있다고 농식품부가 밝혔다.</p></body></html>')
        _, text, _ = m.clean_html(page)
        self.assertNotIn('99%', text)
        self.assertNotIn('500%', text)
        self.assertIn('자세한 내용은 보고서에 실려 있다고', re_space(text), '문장 안의 링크는 그대로 둔다')


def re_space(t):
    import re
    return re.sub(r'\s+', ' ', t)


GOOD = {'url': 'https://www.mk.co.kr/news/economy/12184751', 'title': '외식업 식재료·인건비 비중 70% 돌파', 'snippet': '농식품부 외식업체 경영실태조사 결과 키오스크 무인주문기 도입률도 올랐다',
        'published': '2026-09-14', 'host': 'mk.co.kr', 'tier': 2}
PROMO = {'url': 'https://www.mk.co.kr/news/business/777', 'title': 'A치킨, 외식업 키오스크 신제품 출시', 'snippet': 'A치킨이 무인주문기 신제품을 내놨다', 'published': '2026-10-01', 'host': 'mk.co.kr', 'tier': 2}
PAGES = {GOOD['url']: {'url': GOOD['url'], 'title': GOOD['title'], 'text': DOC, 'kind': 'html', 'published': '2026-09-14'},
         PROMO['url']: {'url': PROMO['url'], 'title': PROMO['title'], 'text': 'A치킨은 올해 폐점률이 2.1%라고 밝혔다. ' * 20, 'kind': 'html', 'published': '2026-10-01'}}
SEL_STAT = {'sheets': [{'kind': 'stat', 'ids': ['F1', 'F2', 'F3'], 'title': '숫자로 보는 외식업', 'note': '', 'labels': ['', '', ''], 'lines': [], 'why': ''}]}


class Dynamic(unittest.TestCase):
    """검색 키워드 추출 → 출처 자체 검색 → 추리기 → 본문 읽기 → 추출 · 검증 — 바깥 사이트 없이(가짜 검색 결과 · 가짜 페이지)."""

    def run_site(self, provider, want=('stat',), spec=None, results=(GOOD, PROMO), settings=None, fetched=None, search=None, **kw):
        def site(engine, query, **k):
            return [{**r, 'engine': engine} for r in results]

        def fetch(url, **k):
            if fetched is not None:
                fetched.append(url)
            return PAGES.get(url)
        with mock.patch.object(m, 'settings', settings or cfg(engines=('mk',))), mock.patch.object(ms, 'search', search or site), mock.patch.object(m, 'fetch_page', fetch), \
                mock.patch.object(m, '_cache_put', lambda *a: None):
            return m.trend_sheets(spec or SPEC, list(want), provider, **kw)

    def test_site_search_without_a_search_capable_model(self):
        class NoSearch(FakeProvider):
            search_web = None  # 운영 기본 연결(OpenRouter · Qwen)처럼 모델 검색이 없다
        fetched, p = [], NoSearch(select=SEL_STAT, keep=lambda r: 'A치킨' not in r['title'])
        out = self.run_site(p, fetched=fetched)
        self.assertTrue(out['ok'], out)
        self.assertEqual({out['sheets'][0]['v'][f'vl{i}'] for i in range(3)}, {'13.0', '87,341', '37.0'})
        self.assertEqual(fetched, [GOOD['url']], '추리기에서 뺀 글(한 회사의 신제품 기사)은 받지도 않는다')
        self.assertIn('research:screen', p.calls)
        self.assertTrue(all({'n', 'topic', 'title', 'snippet', 'site', 'date'} <= set(r) for r in p.screened), '추리기는 제목 · 요약 · 출처 · 날짜만 본다')
        self.assertEqual(out['research']['engines'], {'mk': 1})
        ev = out['sheets'][0]['ev']['vl0'][0]
        self.assertEqual(ev['url'], GOOD['url'])
        self.assertRegex(ev['checked'], r'^\d{4}-\d{2}-\d{2}$', '근거마다 원문과 대조한 날이 남는다')

    def test_keywords_and_phrases_never_carry_the_customer_name(self):
        plan = {'segment': 'A 커피 같은 커피 전문점', 'topics': [
            {'id': 't1', 'shape': 'stat', 'metric': '무인주문기 도입률', 'why': '', 'keywords': ['A 커피', '키오스크', '도입률'], 'phrases': ['A 커피 키오스크 도입률', '외식업체 경영실태조사 2025'],
             'queries': ['A 커피 외식업 무인주문기 도입률 통계']},
            {'id': 't2', 'shape': 'stat', 'metric': '인건비 비중', 'why': '', 'queries': ['외식업 인건비 비중 통계']},
            {'id': 't3', 'shape': 'trend', 'metric': '디지털 전환', 'why': '', 'queries': ['외식업 디지털 전환 동향']}]}
        p = FakeProvider(plan=plan)
        with mock.patch.object(m, 'settings', cfg()):
            topics = m.plan_topics(SPEC, p)
        said = ' '.join(' '.join(t['queries'] + t['keywords'] + t['phrases']) for t in topics)
        self.assertNotIn('A 커피', said)
        self.assertEqual(topics[0]['phrases'][:2], ['커피 키오스크 도입률', '외식업체 경영실태조사'], '고객 고유 이름 · 연도를 뗀 검색 문구')
        self.assertEqual(topics[0]['keywords'][0], '커피')
        self.assertTrue(all(t['phrases'] and t['keywords'] for t in topics), '모델이 빠뜨린 형태의 주제 · 받침 주제에도 검색 문구가 있다')
        self.assertTrue(topics[-1].get('broad'))

    def test_screen_failure_falls_back_to_code_ranking(self):
        out = self.run_site(FakeProvider(select=SEL_STAT, keep=RuntimeError('model down')))
        self.assertTrue(out['sheets'][0]['filled'], '추리기 판정을 못 받아도 조사는 이어진다(값은 원문 대조 · 이름 확인을 통과한 것만)')

    def test_search_failures_never_raise(self):
        def boom(engine, query, **k):
            raise RuntimeError('network down')
        out = self.run_site(FakeProvider(), search=boom)
        self.assertEqual(out['research']['reason'], 'search_failed')
        out = self.run_site(FakeProvider(), results=())
        self.assertEqual(out['research']['reason'], 'no_results')
        out = self.run_site(FakeProvider(keep=lambda r: False))
        self.assertEqual(out['research']['reason'], 'no_results', '고를 글이 없으면 지어내지 않는다')
        with mock.patch.dict(PAGES, {}, clear=True):
            out = self.run_site(FakeProvider())
        self.assertEqual(out['research']['reason'], 'fetch_failed')
        self.assertTrue(all(not sh['filled'] for sh in out['sheets']))

    def test_a_source_that_ignores_the_query_is_not_used(self):
        latest = [{**GOOD, 'url': f'https://www.mk.co.kr/news/economy/{n}', 'title': f'외식업 소식 {n}'} for n in (1, 2, 3)]
        out = self.run_site(FakeProvider(), results=latest)  # 어떤 검색어에도 같은 목록 = 검색 결과가 아니라 최신 글 목록
        self.assertFalse(out['ok'])
        self.assertEqual(out['research']['reason'], 'no_results')

    def test_single_company_figures_are_not_industry_evidence(self):
        company = lambda r: 'company' if '키오스크 대수' in r['name'] else 'market'  # noqa: E731
        sel = {'sheets': [{'kind': 'stat', 'ids': ['F1', 'F2', 'F3'], 'title': '', 'note': '', 'labels': ['', '', ''], 'lines': [], 'why': ''}]}
        out = self.run_site(FakeProvider(select=sel, scope=company))
        shown = {v for sh in out['sheets'] if sh['filled'] for k, v in sh['v'].items() if k.startswith('vl')}
        self.assertNotIn('87,341', shown, '한 회사의 값으로 판정된 수치는 업계 지표 장에 싣지 않는다')
        with mock.patch.object(m, 'settings', cfg(engines=('mk',))), mock.patch.object(ms, 'search', lambda e, q, **k: [{**GOOD, 'engine': e}]), \
                mock.patch.object(m, 'fetch_page', lambda url, **k: PAGES.get(url)), mock.patch.object(m, '_cache_put', lambda *a: None):
            pack = m.collect(SPEC, FakeProvider(scope='unknown'))
        self.assertTrue(pack['ok'])
        self.assertFalse(any(m.usable('stat', f) for f in pack['facts']), '범위를 알 수 없는 값도 싣지 않는다')
        self.assertEqual(m.source_pool(pack), [])

    def test_rejected_items_get_one_repair_round_under_the_same_rules(self):
        class Repairing(FakeProvider):
            def generate_json(self, *, stage, user='', **kw):
                if stage == 'research:extract':
                    self.calls.append(stage)
                    return FakeResult({'facts': [fact('프랜차이즈 무인주문기 도입률', '13.0', '%', '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며', '2025')],
                                       'series': [], 'shares': [], 'trends': []})
                if stage == 'research:repair':
                    self.calls.append(stage)
                    self.repair_prompt = user
                    return FakeResult({'facts': [fact('무인주문기 도입률', '13.0', '%', '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며', '2025'),
                                                 fact('무인주문기 도입률', '4.5', '%', '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며', '2021')],
                                       'series': [], 'shares': [], 'trends': []})
                return super().generate_json(stage=stage, user=user, **kw)
        p = Repairing()
        with mock.patch.object(m, 'settings', cfg(engines=('mk',))), mock.patch.object(ms, 'search', lambda e, q, **k: [{**GOOD, 'engine': e}]), \
                mock.patch.object(m, 'fetch_page', lambda url, **k: PAGES.get(url)), mock.patch.object(m, '_cache_put', lambda *a: None):
            pack = m.collect(SPEC, p)
        self.assertIn('프랜차이즈', p.repair_prompt, '탈락 사유와 인용에 없는 낱말을 알려 준다')
        self.assertEqual([(f['metric'], f['value']) for f in pack['facts']], [('무인주문기 도입률', '13.0')], '고친 이름은 받고, 고치는 김에 가져온 다른 값(4.5)은 받지 않는다')

    def test_no_placeholder_is_ever_returned(self):
        long_line = '외식업체는 인건비 부담과 인력난에 대응하기 위해 키오스크와 테이블오더 같은 디지털 기반 주문 시스템을 빠르게 도입하고 있으며 이 흐름은 계속된다.'
        q = '최근 외식업체는 키오스크 등 디지털 기반 주문 시스템을 도입하는 등 디지털 전환이 빠르게 진행되고 있다.'

        class Trends(FakeProvider):
            def generate_json(self, *, stage, user='', **kw):
                if stage == 'research:extract':
                    self.calls.append(stage)
                    return FakeResult({'facts': [], 'series': [], 'shares': [], 'trends': [
                        {'src': 'W1', 'topic': 't4', 'keyword': '디지털 전환', 'statement': '외식업체의 디지털 전환이 빠르게 진행되고 있다.', 'quote': q},
                        {'src': 'W1', 'topic': 't4', 'keyword': '디지털 기반 주문 시스템', 'statement': long_line.replace('인건비 부담과 인력난에 대응하기 위해 ', '').replace('이 흐름은 계속된다', '도입한다'), 'quote': q},
                        {'src': 'W1', 'topic': 't4', 'keyword': '키오스크', 'statement': '외식업체는 키오스크 등 디지털 기반 주문 시스템을 도입하고 있다.', 'quote': q}]})
                return super().generate_json(stage=stage, user=user, **kw)
        sel = {'sheets': [{'kind': 'key', 'ids': ['T1', 'T2', 'T3'], 'title': '', 'note': '', 'labels': ['', '', ''], 'lines': ['', '모델이 줄여 쓴 문장', ''], 'why': ''}]}
        with mock.patch.object(m, 'settings', cfg(engines=('mk',))), mock.patch.object(ms, 'search', lambda e, q_, **k: [{**GOOD, 'engine': e}]), \
                mock.patch.object(m, 'fetch_page', lambda url, **k: PAGES.get(url)), mock.patch.object(m, '_cache_put', lambda *a: None):
            out = m.trend_sheets(SPEC, ['key'], Trends(select=sel, judge_ok=False))
        for sh in out['sheets']:
            self.assertFalse(any(m.CHECK in str(v) for v in sh['v'].values()), sh)
            if not sh['filled']:
                self.assertEqual(sh['v'], {}, '확인된 문구가 모자라면 채우지 않은 장으로 알린다')


class Store(unittest.TestCase):
    """근거 DB — 동적 검색으로 얻은 것을 쌓아 다른 고객의 조사에서도 다시 쓴다. 고객 정보는 들어가지 않는다."""

    def setUp(self):
        import tempfile
        self.dir = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.dir.name, 'evidence.db')
        self.addCleanup(self.dir.cleanup)

    def collect(self, provider, spec=SPEC, search=None, fresh=False, counter=None):
        def site(engine, query, **k):
            if counter is not None:
                counter.append(query)
            return [{**GOOD, 'engine': engine}]
        with mock.patch.object(m, 'settings', cfg(engines=('db', 'mk'), db=self.db)), mock.patch.object(ms, 'search', search or site), \
                mock.patch.object(m, 'fetch_page', lambda url, **k: PAGES.get(url)), mock.patch.object(m, '_cache_put', lambda *a: None):
            return m.collect(spec, provider, fresh=fresh)

    def test_evidence_is_stored_and_reused_for_another_customer(self):
        first = self.collect(FakeProvider())
        self.assertTrue(first['ok'])
        self.assertEqual(first['reused'], 0)
        st = market_store.Store(self.db).stats()
        self.assertGreaterEqual(st['evidence'], 4)
        self.assertEqual(st['docs'], 1)

        def down(engine, query, **k):
            raise RuntimeError('바깥 접속 불가')
        other = {**SPEC, 'customer': 'B 버거', 'title': 'B 버거 제안', 'requirement': '직영점 주문 대기를 줄이려고 키오스크를 늘리려 한다. 인건비도 부담이다.'}
        second = self.collect(FakeProvider(), spec=other, search=down)
        self.assertTrue(second['ok'], second)
        self.assertGreaterEqual(second['reused'], 1)
        self.assertTrue(second['facts'])
        self.assertLessEqual({(f['metric'], f['value'], f['quote']) for f in second['facts']}, {(f['metric'], f['value'], f['quote']) for f in first['facts']},
                             '저장 근거는 값 · 이름 · 인용 그대로 다시 쓴다(주제 키워드에 맞는 것만)')
        again = [x for k in ('facts', 'series', 'shares', 'trends') for x in second[k] if x.get('stored')]
        self.assertTrue(again and all(x['checked'] and x['scope'] == 'market' for x in again), '저장 근거에는 확인한 날과 범위 판정이 함께 있다')
        self.assertTrue(all(s['url'].startswith('https://') for s in second['sources']))
        self.assertIn('db', second['engines'])
        self.assertGreaterEqual(market_store.Store(self.db).stats()['reused'], 1)

    def test_a_document_already_read_for_a_topic_is_not_read_again(self):
        self.collect(FakeProvider())
        p = FakeProvider()
        self.collect(p, spec={**SPEC, 'customer': 'B 버거', 'requirement': '키오스크를 늘리려 한다.'})
        self.assertLessEqual(p.calls.count('research:extract'), 1, '같은 주제 키워드로 이미 뽑아 본 문서는 다시 모델에 넘기지 않는다')
        store = market_store.Store(self.db)
        key = market_store.Store.topic_key(['무인주문기', '도입률', '외식업'])
        self.assertEqual(store.extracted_urls(key, m.PACK_VERSION, 86400), {GOOD['url']})
        self.assertEqual(store.extracted_urls(key, m.PACK_VERSION + 1, 86400), set(), '검증 규칙이 바뀌면 다시 읽는다')

    def test_nothing_about_the_customer_is_stored(self):
        self.collect(FakeProvider())
        raw = b''.join(open(os.path.join(self.dir.name, f), 'rb').read() for f in os.listdir(self.dir.name))
        for secret in ('A 커피', '메뉴보드로 바꾸고', 'A 커피 메뉴보드'):
            self.assertNotIn(secret.encode('utf-8'), raw, secret)

    def test_topics_with_enough_fresh_evidence_are_not_searched_again(self):
        self.collect(FakeProvider())
        store = market_store.Store(self.db)
        topics = [{'id': 't1', 'shape': 'series', 'metric': '식재료비 인건비 비중', 'keywords': ['음식점', '인건비', '비중'], 'queries': ['x']},
                  {'id': 't2', 'shape': 'share', 'metric': '주문 채널', 'keywords': ['외식업', '주문채널'], 'queries': ['x']}]
        c = cfg(db=self.db)()
        stored, covered = m.recall(topics, SPEC, store, c)
        self.assertEqual(covered, {'t1'}, '추이 근거가 있는 주제만 검색을 건너뛴다(구성비 근거는 없다)')
        self.assertTrue(any(r['kind'] == 'series' for r in stored))
        _, covered = m.recall(topics, SPEC, store, {**c, 'reuse': 0})
        self.assertEqual(covered, set(), '재사용 기간이 지난 근거는 보조로만 쓰고 검색은 다시 한다')
        with mock.patch.object(m, 'PACK_VERSION', m.PACK_VERSION + 1):
            self.assertEqual(m.recall(topics, SPEC, store, c), ([], set()), '검증 규칙이 바뀌면 이전 규칙으로 확인한 근거는 쓰지 않는다')
        self.assertEqual(m.recall([{**topics[0], 'keywords': ['호텔', '객실', '점유율']}], {**SPEC, 'ind': 'HT'}, store, c), ([], set()), '다른 업종 · 다른 지표의 근거는 끌어오지 않는다')
        # 실제 실행에서 외식업체의 '매장 내 · 포장 · 배달' 구성비가 키워드('매장' · '매출')만 맞아 유통 제안서에 다시 쓰였다 — 키워드가 같아도 업종이 다르면 쓰지 않는다
        self.assertEqual(m.recall(topics, {**SPEC, 'ind': 'RT'}, store, c), ([], set()))
        self.assertEqual(m.recall(topics, {**SPEC, 'ind': ''}, store, c), ([], set()), '업종 코드가 없는 조사는 저장 근거를 다시 쓰지 않는다')

    def test_search_results_and_pages_are_cached_and_fresh_bypasses_them(self):
        n1, n2, n3 = [], [], []
        self.collect(FakeProvider(), counter=n1)
        self.assertTrue(n1)
        os.remove(self.db)  # 근거는 지우고 …
        for ext in ('-wal', '-shm'):
            if os.path.exists(self.db + ext):
                os.remove(self.db + ext)
        self.collect(FakeProvider(), counter=n1)
        store = market_store.Store(self.db)
        store._run(lambda con: con.execute('DELETE FROM evidence'))  # … 검색 결과 · 문서만 남긴 상태에서
        self.collect(FakeProvider(), counter=n2)
        self.assertEqual(n2, [], '같은 검색어는 저장된 결과를 쓴다(사이트를 부르지 않는다)')
        self.collect(FakeProvider(), counter=n3, fresh=True)
        self.assertTrue(n3, 'fresh 는 저장분을 쓰지 않고 새로 검색한다')

    def test_stored_documents_are_searchable_and_an_unusable_db_never_raises(self):
        self.collect(FakeProvider())
        store = market_store.Store(self.db)
        hits = store.docs_search(['키오스크', '도입률', '외식업'])
        self.assertEqual([h['url'] for h in hits], [GOOD['url']])
        self.assertEqual(store.docs_search(['호텔', '객실']), [])
        broken = market_store.Store(os.path.join(self.dir.name, 'evidence.db', 'nope', 'x.db'))  # 만들 수 없는 경로
        self.assertIsNone(broken.search_get('mk', 'q', 60))
        self.assertEqual(broken.evidence_find(['a', 'b'], ind='FB', version=1, max_age=10), [])
        broken.doc_put({'url': 'https://a.example/1', 'text': 'x' * 300})
        with mock.patch.object(m, 'settings', cfg(engines=('db', 'mk'), db=os.path.join(self.dir.name, 'evidence.db', 'nope', 'x.db'))), \
                mock.patch.object(ms, 'search', lambda e, q, **k: [{**GOOD, 'engine': e}]), mock.patch.object(m, 'fetch_page', lambda url, **k: PAGES.get(url)), \
                mock.patch.object(m, '_cache_put', lambda *a: None):
            self.assertTrue(m.collect(SPEC, FakeProvider())['ok'], 'DB를 못 써도 조사는 된다')


class Audited(unittest.TestCase):
    """2026-11-16 실제 실행(Qwen + 출처 자체 검색)에서 채워진 값을 원문과 대조해 찾은 결함 — 다시 실리지 않게."""

    KB = ('부산 서면은 전포 카페거리와 오피스, 백화점, 호텔, 의료시설 등이 결합해 지역 주민의 반복적인 소비가 뒷받침되는 상권으로 분석됐다. '
          '반면 지방 상권 전체의 상황은 여전히 녹록지 않은 것으로 나타났다. 올해 3월 기준 지방 점포 한 곳당 월평균 방문객은 31.6명으로, 서울의 116.6명과 비교해 약 27% 수준에 그쳤다. '
          '점포당 월평균 매출도 지방은 1751만원으로, 서울 4890만원의 35.8% 수준이었다. 이어지는 문단은 길이를 채우기 위한 문장이다. ' * 2)

    def check(self, metric, value, unit, quote):
        out, why = m.verify({'facts': [{'src': 'W1', 'metric': metric, 'value': value, 'unit': unit, 'period': '', 'statement': '', 'quote': quote}], 'series': [], 'shares': [], 'trends': []},
                            {'W1': {'text': self.KB}}, [])
        return out['facts'], why

    def test_a_subject_without_its_kind_is_rejected(self):
        # 백화점 제안서의 지표 장에 '지방 점포 월평균 방문객 수 31.6명'이 실렸다 — 원문은 백화점이 아니라 지방 **상권** 점포 이야기였다(어떤 점포인지는 앞 문장에만 있었다)
        short = '올해 3월 기준 지방 점포 한 곳당 월평균 방문객은 31.6명으로, 서울의 116.6명과 비교해 약 27% 수준에 그쳤다.'
        facts, why = self.check('지방 점포 한 곳당 월평균 방문객', '31.6', '명', short)
        self.assertEqual(facts, [])
        self.assertEqual(why, {'대상의 종류가 이름에 없음': 1})
        self.assertEqual(self.check('점포당 월평균 매출', '1751', '만원', '점포당 월평균 매출도 지방은 1751만원으로, 서울 4890만원의 35.8% 수준이었다.')[0], [])
        # 종류가 나오는 앞 문장부터 인용하고 이름에 그 종류를 넣으면 받는다 — 이름만 읽어도 백화점 점포가 아님을 알 수 있다
        facts, why = self.check('지방 상권 점포 한 곳당 월평균 방문객', '31.6', '명', '반면 지방 상권 전체의 상황은 여전히 녹록지 않은 것으로 나타났다. ' + short)
        self.assertEqual([f['metric'] for f in facts], ['지방 상권 점포 한 곳당 월평균 방문객'], why)
        for name in ('외식업체의 평균 영업이익률', '서울 음식점 키오스크 도입률', '편의점 3사 점포 수', '백화점 오프라인 매장 비중', '외식업 가맹점의 평균 차액가맹금', '방한 외국인 관광객 수', '의료기관 병상 수'):
            self.assertEqual(m.bare_subject(name), '', name)
        for name in ('국내 가맹점 수', '주요 업체 매출', '오프라인 매장 매출 비중', '서울 점포 한 곳당 월평균 방문객 수'):
            self.assertTrue(m.bare_subject(name), name)

    def test_an_undated_statement_from_an_old_article_is_not_a_current_trend(self):
        # 2022년 기사의 '골프용품 인기가 … 확대되는 모습이다'가 2026년 제안서의 '지금의 흐름'으로 실렸다 — 인용에 연도가 없으면 문서의 발행 연도로 본다
        q = '최근 외식업체는 키오스크 등 디지털 기반 주문 시스템을 도입하는 등 디지털 전환이 빠르게 진행되고 있다.'

        class Trends(FakeProvider):
            def generate_json(self, *, stage, user='', **kw):
                if stage == 'research:extract':
                    self.calls.append(stage)
                    return FakeResult({'facts': [fact('무인주문기 도입률', '13.0', '%', '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며', '2025')],
                                       'series': [], 'shares': [], 'trends': [{'src': 'W1', 'topic': 't4', 'keyword': '디지털 전환', 'statement': '외식업체의 디지털 전환이 빠르게 진행되고 있다.', 'quote': q}]})
                return super().generate_json(stage=stage, user=user, **kw)

        def collect(published):
            page = {**PAGES[GOOD['url']], 'published': published}
            with mock.patch.object(m, 'settings', cfg(engines=('mk',))), mock.patch.object(ms, 'search', lambda e, q_, **k: [{**GOOD, 'engine': e, 'published': published}]), \
                    mock.patch.object(m, 'fetch_page', lambda url, **k: page), mock.patch.object(m, '_cache_put', lambda *a: None):
                return m.collect(SPEC, Trends())
        this = __import__('datetime').date.today().year
        old = collect(f'{this - 4}-02-22')
        self.assertTrue(old['trends'][0]['old'])
        self.assertFalse(m.usable('key', old['trends'][0]))
        self.assertFalse(old['facts'][0]['old'], '연도가 인용에 있는 수치는 그 연도로 본다(2025)')
        self.assertFalse(collect(f'{this - 1}-02-22')['trends'][0]['old'])

    def test_audited_names_are_shown_as_they_are(self):
        # 모델이 줄여 쓴 이름이 뜻을 바꿨다: '지방 점포 한 곳당 월평균 방문객 수' → '지방 점포 월평균 방문객 수', '매출이 감소했다고 밝힌 비율' → '입점 매출 감소 비율'
        sel = {'sheets': [{'kind': 'stat', 'ids': ['F1', 'F2', 'F3'], 'title': '', 'note': '', 'labels': ['무인주문기 보급', '키오스크 수', '온라인 거래'], 'lines': [], 'why': ''}]}
        with mock.patch.object(m, 'settings', cfg(engines=('mk',))), mock.patch.object(ms, 'search', lambda e, q, **k: [{**GOOD, 'engine': e}]), \
                mock.patch.object(m, 'fetch_page', lambda url, **k: PAGES.get(url)), mock.patch.object(m, '_cache_put', lambda *a: None):
            out = m.trend_sheets(SPEC, ['stat'], FakeProvider(select=sel))
        sh = out['sheets'][0]
        self.assertTrue(sh['filled'], out)
        labels = {sh['v'][f'lb{i}'] for i in range(3)}
        self.assertEqual(labels, {'무인주문기 도입률 (2025)', '외식업체 키오스크 대수 (2022)', '음식서비스 온라인 거래액 (2024)'}, '지표 이름은 이름 확인을 통과한 그대로 싣는다')

    def test_an_undated_figure_is_only_as_current_as_its_article(self):
        # '상급종합병원 신규환자 입원 24% 감소'(2024-02 집단행동 때의 값)와 '올해 … 2.2조 원 전망'(2025-03 기사)이 2026-11 제안서의 '지금의 지표'로 실렸다 — 인용에 연도가 없었다
        import datetime
        today = datetime.date.today()
        q = '키오스크, 테이블오더 등 무인주문기 도입률은 2021년 4.5%에서 2025년 13.0%로 약 3배 확대되며'
        undated = '외식업체에 설치한 키오스크 대수는 2019년 5479대에서 2022년 8만7341대로 늘었다.'

        class NoYear(FakeProvider):
            def generate_json(self, *, stage, user='', **kw):
                if stage == 'research:extract':
                    self.calls.append(stage)
                    return FakeResult({'facts': [fact('주문 채널 점유율 상승폭', '3.2', '%p', '음식서비스 온라인 거래액은 2023년 32.4조 원에서 2024년 37.0조 원으로 14.3% 증가했으며 점유율은 3.2%p 상승했다.'),
                                                 fact('무인주문기 도입률', '13.0', '%', q, '2025')], 'series': [], 'shares': [], 'trends': []})
                return super().generate_json(stage=stage, user=user, **kw)

        def facts(published, text=None):
            page = {**PAGES[GOOD['url']], 'published': published, **({'text': text} if text else {})}
            with mock.patch.object(m, 'settings', cfg(engines=('mk',))), mock.patch.object(ms, 'search', lambda e, q_, **k: [{**GOOD, 'engine': e, 'published': published}]), \
                    mock.patch.object(m, 'fetch_page', lambda url, **k: page), mock.patch.object(m, '_cache_put', lambda *a: None):
                return {f['metric']: f for f in m.collect(SPEC, NoYear())['facts']}
        self.assertEqual(m.days_since((today - datetime.timedelta(days=40)).isoformat()), 40)
        self.assertIsNone(m.days_since(''))
        long_ago = facts((today - datetime.timedelta(days=700)).isoformat())
        self.assertFalse(long_ago['무인주문기 도입률']['old'], '연도가 인용에 있는 값은 그 연도로 본다')
        recent = facts((today - datetime.timedelta(days=100)).isoformat())
        self.assertFalse(recent['무인주문기 도입률']['old'])
        # 인용에 연도가 없는 값(여기서는 인용의 연도를 지운 글)은 기사의 발행일로 본다
        plain = DOC.replace('2023년 ', '').replace('2024년 ', '')

        class Plain(NoYear):
            def generate_json(self, *, stage, user='', **kw):
                if stage == 'research:extract':
                    self.calls.append(stage)
                    return FakeResult({'facts': [fact('음식서비스 온라인 거래액', '37.0', '조 원', '음식서비스 온라인 거래액은 32.4조 원에서 37.0조 원으로 14.3% 증가했으며')], 'series': [], 'shares': [], 'trends': []})
                return super().generate_json(stage=stage, user=user, **kw)

        def one(published):
            page = {**PAGES[GOOD['url']], 'published': published, 'text': plain}
            with mock.patch.object(m, 'settings', cfg(engines=('mk',))), mock.patch.object(ms, 'search', lambda e, q_, **k: [{**GOOD, 'engine': e, 'published': published}]), \
                    mock.patch.object(m, 'fetch_page', lambda url, **k: page), mock.patch.object(m, '_cache_put', lambda *a: None):
                return m.collect(SPEC, Plain())['facts'][0]
        self.assertFalse(one((today - datetime.timedelta(days=100)).isoformat())['old'], '최근 기사의 연도 없는 값은 쓸 수 있다(연도 칸은 비우고 확인을 요청한다)')
        self.assertTrue(one((today - datetime.timedelta(days=500)).isoformat())['old'], '1년 넘은 기사의 연도 없는 값은 지금의 지표로 싣지 않는다')
        self.assertTrue(one('')['old'], '발행일도 모르면 싣지 않는다')

    def test_a_trend_statement_may_not_add_causes_or_forecasts(self):
        # 이름 확인(모델, 두 번)이 통과시킨 흐름 문장들 — 인용에 없는 원인 · 전망을 더했다
        added = [('원가 상승과 가격 인상 어려움으로 프랜차이즈와 비프랜차이즈 간 양극화가 심화된다.', '이 때문에 업계에서는 프랜차이즈와 비프랜차이즈 간 양극화가 더욱 심화될 수밖에 없다는 우려가 커지고 있다.'),
                 ('호텔 등 관광기업의 구인난이 심화될 것으로 예상된다.', '“호텔, 테마파크 등 관광기업의 구인난 심화 등 난제들이 많다”'),
                 ('방한 관광객 증가와 객실 공급 부족으로 호텔업이 구조적 호황 국면에 진입했다.', '반도체를 넘어 관광·호텔 산업이 구조적 호황 국면에 진입하고 있다는 분석이 나왔다.')]
        faithful = [('소상공인의 디지털 기술 도입이 증가했으나 대부분 기초 단계에 머물러 있다.', '소상공인의 디지털 기술 도입률은 2024년 30.8%로 늘었지만, 대부분이 POS·키오스크 설치 등 기초 단계에 머물러 있다.'),
                    ('백화점과 온라인으로 수요가 쏠리며 소비 양극화가 뚜렷해졌다.', '정부의 내수 진작책에도 불구하고 백화점과 온라인으로만 수요가 쏠리는 ‘소비 양극화’가 뚜렷해진 것이다.'),
                    ('외식업체의 디지털 전환이 빠르게 진행되고 있다.', '최근 외식업체는 키오스크 등 디지털 기반 주문 시스템을 도입하는 등 디지털 전환이 빠르게 진행되고 있다.')]
        for st, q in added:
            self.assertTrue(m.drifted(st, q), st)
        for st, q in faithful:
            self.assertEqual(m.drifted(st, q), [], st)
        q = '최근 외식업체는 키오스크 등 디지털 기반 주문 시스템을 도입하는 등 디지털 전환이 빠르게 진행되고 있다.'
        out, why = m.verify({'facts': [], 'series': [], 'shares': [], 'trends': [
            {'src': 'W1', 'keyword': '디지털 전환', 'statement': '인건비 급등과 인력난 때문에 외식업체의 디지털 전환이 빠르게 진행될 전망이다.', 'quote': q},
            {'src': 'W1', 'keyword': '디지털 전환', 'statement': '외식업체의 디지털 전환이 빠르게 진행되고 있다.', 'quote': q}]}, SRC, [])
        self.assertEqual([t['statement'] for t in out['trends']], ['외식업체의 디지털 전환이 빠르게 진행되고 있다.'])
        self.assertEqual(why, {'문장에 인용에 없는 내용': 1})
