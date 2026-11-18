"""The level ↔ basis rule of checkpoint scoring: the model is told the rule the verifier enforces, and a rejection says exactly
what to change. Before, the caps (schema scoring.basis_caps) were enforced but never stated, and the rejection only said
"근거 수준과 단계가 충돌합니다 … 충분한 가정·계획과 설명이 있는지 구분하세요" — a real model read that as "your levels are too low",
raised other checkpoints while keeping basis 'claim', and failed the whole review after three answers."""
from copy import deepcopy
from types import SimpleNamespace
import json

from app.api.poc import detailed_review, review_schema


def fixture():
    spec = next(c for c in review_schema.schema()['criteria'] if c['id'] == 'VS3')
    page = SimpleNamespace(n=1, text='파일럿 비용은 현장 조사 후 확정합니다. 매장 3곳에 메뉴보드 6대를 도입합니다.')
    proposal = SimpleNamespace(n=1, sheet=lambda n: page)
    points = [{'id': p['id'], 'level': 1, 'basis': 'claim', 'reason': '비용 범위가 제시되지 않았습니다.', 'verification': '',
               'evidence': [{'sheet': 1, 'quote': '파일럿 비용은 현장 조사 후 확정합니다.'}]} for p in spec['checkpoints']]
    row = {'id': 'VS3', 'checks': points, 'anchor': '투자 판단 자료가 부족합니다.', 'improve': '파일럿 비용 범위를 제시하세요.', 'confidence': 'mid'}
    return {'scores': [row]}, ['VS3'], {'VS3': spec}, proposal


def caps():
    return review_schema.schema()['scoring']['basis_caps']


def test_the_fixture_is_valid_as_it_stands():
    assert detailed_review.response_problem(*fixture()) == ''


def test_the_scoring_prompt_states_every_basis_cap_from_the_schema():
    seen = {}

    class Backend:
        def complete(self, stage, system, user, schema, meta=None, temperature=None):
            seen['system'] = system
            data, ids, defs, proposal = fixture()
            return data

    from app.api.poc import imports
    from app.api.poc.adapters.review import scenario_from_doc
    scenario, _ = scenario_from_doc({'kind': 'txt', 'units': [{'n': 1, 'title': '제안', 'text': '파일럿 비용은 현장 조사 후 확정합니다. 매장 3곳에 메뉴보드 6대를 도입합니다.'}]}, {})
    p = imports.score().proposal.from_scenario(scenario)
    spec = review_schema.schema()
    try:
        detailed_review.score_selected(p, SimpleNamespace(backend=Backend(), temperature=0), ['VS3'], {}, spec)
    except Exception:
        pass  # only the prompt matters here
    rule = detailed_review.basis_rule(caps())
    assert rule in seen['system'], 'the rule the verifier enforces is in the prompt'
    for basis, cap in caps().items():
        assert f'{basis} 최대 {cap}단계' in rule
    # basis names the kind of support; how sufficient it is, is the level. "documented = 충분히 설명" left a described-but-incomplete
    # checkpoint (level 2) without a basis that fits it, so the model answered claim and was rejected.
    assert detailed_review.basis_terms() in seen['system']
    assert '충분히 설명' not in seen['system'] and '충분한지는 단계' in seen['system']


def test_a_level_above_its_basis_cap_is_rejected_with_what_to_change():
    data, *rest = fixture()
    data['scores'][0]['checks'][0].update(level=2, basis='claim')
    problem = detailed_review.response_problem(data, *rest)
    assert 'VS3.1' in problem and '2단계' in problem and 'claim' in problem and f'최대 {caps()["claim"]}단계' in problem
    assert '충분한 가정·계획과 설명이 있는지' not in problem, 'no hint that reads as "raise the level"'


def test_every_conflicting_checkpoint_is_reported_in_one_answer():
    data, *rest = fixture()
    data['scores'][0]['checks'][0].update(level=2, basis='claim')
    data['scores'][0]['checks'][1].update(level=2, basis='claim')
    data['scores'][0]['checks'][2].update(level=1, basis='missing', evidence=[])
    problem = detailed_review.response_problem(data, *rest)
    assert 'VS3.1' in problem and 'VS3.2' in problem and 'VS3.3' in problem


def test_a_level_without_a_quote_is_told_both_ways_out():
    data, *rest = fixture()
    data['scores'][0]['checks'][0].update(level=1, evidence=[])
    problem = detailed_review.response_problem(data, *rest)
    assert 'VS3.1' in problem and '인용' in problem and '0단계' in problem


def test_an_unknown_basis_is_named():
    data, *rest = fixture()
    data['scores'][0]['checks'][0].update(basis='evidence')
    problem = detailed_review.response_problem(data, *rest)
    assert 'VS3.1' in problem and 'basis' in problem and all(b in problem for b in caps())


def test_existing_structural_and_citation_checks_still_stop_first():
    data, *rest = fixture()
    data['scores'][0]['checks'].pop()
    assert '체크포인트 4개' in detailed_review.response_problem(data, *rest)
    data, *rest = fixture()
    data['scores'][0]['checks'][0]['evidence'][0]['quote'] = '원문에 없는 문구'
    assert '인용' in detailed_review.response_problem(data, *rest)


def test_the_retry_asks_to_change_only_the_named_checkpoints():
    from app.api.poc.backends import make_score_backend, ModeTracker
    from app.api.poc.provider import GenerationResult
    good, ids, defs, proposal = fixture()
    bad = deepcopy(good)
    bad['scores'][0]['checks'][0].update(level=2, basis='claim')
    seen = []

    class Provider:
        available = True; name = 'synthetic-test-provider'; model = 'fixture'
        def model_for(self, kind): return self.model
        def generate_json(self, **kwargs):
            seen.append(kwargs)
            data = bad if len(seen) == 1 else good
            return GenerationResult(data=data, text=json.dumps(data, ensure_ascii=False), model=self.model)

    provider = Provider(); tracker = ModeTracker(provider=provider)
    result = make_score_backend(provider, tracker).complete('score_detail', 'system', 'source', detailed_review.score_schema(ids, defs),
                                                            meta={'tag': 'test:detail', 'criteria_ids': ids, 'proposal': proposal})
    assert result == good and len(seen) == 2
    retry = seen[1]['user']
    assert '정상 체크포인트의 판단은 유지' in retry
    assert '인용·형식만 고치세요' not in retry, 'a level/basis conflict is a judgment to fix, not only a format'
    assert '최대 1단계' in retry


def test_a_source_id_written_the_way_the_list_shows_it_is_the_same_id():
    """The source list shows each ID in brackets ("[2.3] 원문"); an answer that copies it with the brackets names the same
    source. Rejecting it — with a message that itself says "[원문ID]" — failed whole reviews on a formatting difference."""
    data, *rest = fixture()
    registry = detailed_review.evidence_registry(rest[-1])
    ref = next(iter(registry))
    for point in data['scores'][0]['checks']:
        point['evidence'] = [{'ref': f'[{ref}]'}, {'ref': f' {ref} '}]
    assert detailed_review.response_problem(data, *rest) == ''
    resolved = detailed_review.resolved_evidence([{'ref': f'[{ref}]'}], registry)[0]
    assert resolved == registry[ref]


def test_an_unknown_source_id_is_still_rejected_and_the_message_shows_the_plain_form():
    data, *rest = fixture()
    data['scores'][0]['checks'][0]['evidence'] = [{'ref': '[99.9]'}]
    problem = detailed_review.response_problem(data, *rest)
    assert 'VS3.1' in problem and '[원문ID]' not in problem


def test_a_page_number_given_as_a_source_id_is_named_as_a_page_with_its_ids():
    """The screen-measurement block labels pages "[2]" — for a readability checkpoint a real model cited "[2]" three times and the
    review failed. The rejection says that '2' is a page and which IDs belong to it; nothing is resolved on the model's behalf."""
    data, *rest = fixture()
    proposal = rest[-1]
    registry = detailed_review.evidence_registry(proposal)
    data['scores'][0]['checks'][0]['evidence'] = [{'ref': '[1]'}]
    problem = detailed_review.response_problem(data, *rest)
    ids = sorted(k for k in registry if k.startswith('1.'))
    assert 'VS3.1' in problem and '장 번호' in problem and ids[0] in problem and ids[-1] in problem


def test_the_prompt_says_a_page_label_is_not_a_source_id():
    seen = {}

    class Backend:
        def complete(self, stage, system, user, schema, meta=None, temperature=None):
            seen['system'] = system
            return fixture()[0]

    from app.api.poc import imports
    from app.api.poc.adapters.review import scenario_from_doc
    scenario, _ = scenario_from_doc({'kind': 'txt', 'units': [{'n': 1, 'title': '제안', 'text': '파일럿 비용은 현장 조사 후 확정합니다.'}]}, {})
    p = imports.score().proposal.from_scenario(scenario)
    try:
        detailed_review.score_selected(p, SimpleNamespace(backend=Backend(), temperature=0), ['VS3'], {}, review_schema.schema())
    except Exception:
        pass
    assert '장 번호는 근거 ID가 아닙니다' in seen['system']

