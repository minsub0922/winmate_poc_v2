"""Current rubric consistency, ownership and arithmetic; never call a model."""
from collections import Counter
import json
from pathlib import Path
from types import SimpleNamespace
from app.api.poc import imports, knowledge, review_schema

ROOT = Path(__file__).resolve().parents[2]


def test_current_rubric_matches_requested_four_categories_and_24_criteria():
    s = review_schema.schema()
    assert s['version'] == 5
    assert [c['id'] for c in s['cats']] == ['CU', 'PR', 'VS', 'DQ']
    assert sum(c['w'] for c in s['cats']) == 100
    assert len(s['criteria']) == len({c['id'] for c in s['criteria']}) == 24
    assert all(c['w'] == 25 for c in s['cats'])
    assert all(c['w'] == 1 for c in s['criteria'])
    expected = json.loads((ROOT / 'app/tests/fixtures/review-criteria-v3.json').read_text())['categories']
    assert [{'name': c['name'], 'criteria': [x['name'] for x in s['criteria'] if x['cat'] == c['id']]} for c in s['cats']] == expected
    assert all(sum(x['cat'] == c['id'] for x in s['criteria']) == 6 for c in s['cats'])
    assert s['legacy_map']['MK3'] == 'DQ2'


def test_exported_kb_has_the_same_rubrics_and_unique_routing_ownership():
    s = review_schema.schema()
    cs, tax, _ = knowledge.score_assets()
    assert set(cs.ids()) == {c['id'] for c in s['criteria']}
    assert len(cs.cats) == 4
    counts = Counter(i for g in tax['fine'] for i in g['criteria'])
    assert set(counts) == set(cs.ids()) and set(counts.values()) == {1}
    assert len(tax['coarse']) == 4
    for c in s['criteria']:
        actual = cs[c['id']]
        assert actual.r1 == c['r1'] and actual.r3 == c['r3']
        assert actual.cat == c['cat'] and actual.w == c['w']


def test_automatic_notes_have_one_owner_and_source_check_is_restored_in_quality():
    result = review_schema.remap_checks({'MK3': ['출처 표기가 없다는 과거 메모'], 'DS3': ['정보량'], 'DS4': ['정보량', '작은 글씨'], 'WR3': ['공식 이름'], 'PR5': ['공식 이름']})
    assert result['DQ5'] == ['정보량', '작은 글씨']
    assert result['PR2'] == ['공식 이름']
    assert 'MK3' not in result and 'DS4' not in result
    assert result['DQ2'] == ['출처 표기가 없다는 과거 메모']


def test_current_gates_keep_all_requested_criteria_available_without_fabricating_visual_evidence():
    ps = imports.score()
    cs, _, _ = knowledge.score_assets()
    gates = review_schema.applicable(cs, {'kind': 'txt', 'units': 2, 'rfp_format': True, 'brand_terms': ['Knox']}, ps.criteria.gate)
    assert gates['CU2'][0] and gates['PR2'][0]
    assert len(gates) == 24 and all(ok for ok, _ in gates.values())
    assert '추정하지 않는다' in next(c for c in review_schema.schema()['criteria'] if c['id'] == 'DQ5')['check']


def test_equal_category_aggregation_renormalizes_only_scored_categories():
    ps = imports.score()
    cs, tax, _ = knowledge.score_assets()
    # Equal weights, missing categories omitted: (100*25 + 0*25) / 50 = 50.
    scores = [SimpleNamespace(id='CU1', score=3), SimpleNamespace(id='DQ1', score=1)]
    result = ps.pipeline.aggregate(cs, tax, scores, {'CU1': (True, ''), 'DQ1': (True, '')}, ['CU1', 'DQ1'])
    assert result['categories'] == {'CU': 100.0, 'DQ': 0.0}
    assert result['total'] == 50.0
    assert result['n_all'] == 24


def test_research_criteria_remain_a_54_item_reference():
    old = json.loads((ROOT / 'poc/test/proposal_score/criteria/criteria.json').read_text())
    assert len(old['criteria']) == 54 and any(c['id'] == 'MK3' for c in old['criteria'])


def test_prior_schema_and_real_example_data_are_retained():
    folder = ROOT / 'app/web/src/domain/review'
    old = json.loads((folder / 'schema-v2.json').read_text())
    previous = json.loads((folder / 'linked-review-examples-v2.json').read_text())
    assert old['version'] == 2 and len(old['criteria']) == 26 and len(old['cats']) == 5
    assert previous['version'] == 2 and all(e['review']['criteriaVersion'] == 2 for e in previous['examples'])
