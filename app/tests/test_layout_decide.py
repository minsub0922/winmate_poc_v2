"""Decision branches of the layout flows (app/api/poc/layout_decide.py · composer pictures.py) — with a fake decision model:
the branch is taken only when ``llm.decisions`` holds the task (and the layout is not 'off'); each branch returns exactly what
the LLM branch returns (same interface before and after the node); without it nothing changes.
  app/.venv/bin/python -m pytest app/tests/test_layout_decide.py -q
"""
import json
import os
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
LIBRARY = ROOT / 'app' / 'data' / 'runtime' / 'composer' / 'library.json'
pytestmark = pytest.mark.skipif(not LIBRARY.exists(), reason='composer library not built')


class FakeDecision:
    """answers every question: choice → the option ``pick(qid, criteria)`` names (else the first), score → level, noul → p"""
    def __init__(self, pick=None, level=2, p=0.9):
        self.pick, self.level, self.p, self.asked = pick or (lambda qid, crit: None), level, p, []

    def ask(self, stage, state, questions):
        self.asked.append((stage, state, questions))
        out = {}
        for qid, q in questions.items():
            if q['type'] == 'choice':
                keys = list(q['criteria'])
                k = self.pick(qid, q['criteria']) or keys[0]
                out[qid] = {'type': 'choice', 'choice': k, 'confidence': 0.9, 'probabilities': {x: (0.9 if x == k else 0.1 / max(1, len(keys) - 1)) for x in keys}}
            elif q['type'] == 'score':
                out[qid] = {'type': 'score', 'score': float(self.level), 'confidence': 0.8, 'probabilities': {str(self.level): 1.0}}
            else:
                out[qid] = {'type': 'noul', 'noul': self.p}
        return out


@pytest.fixture(scope='module')
def auto():
    os.environ.setdefault('WM_COMPOSER_DATA', str(LIBRARY.parent))
    from app.api.poc.adapters import compose
    return compose._auto(grounded=True)


@pytest.fixture()
def registry(tmp_path, monkeypatch):
    def write(layouts, **top):
        p = tmp_path / 'decisions.json'
        p.write_text(json.dumps({'version': 1, 'layouts': layouts, **top}, ensure_ascii=False))
        monkeypatch.setenv('WINMATE_LAYOUT_DECISIONS', str(p))
    return write


def test_tasks_are_registered_and_attached_only_with_a_key():
    from app.api.poc import layout_decide, settings as cfg
    assert set(layout_decide.TASKS) <= set(cfg.DECISION_TASKS)
    off = types.SimpleNamespace(decision_enabled=lambda task: False)
    llm = types.SimpleNamespace()
    assert layout_decide.attach(llm, off) == {} and llm.decisions == {}
    assert layout_decide.client_for(llm, 'layout.verify') is None


PILOT = {'cells': {'3': {'pick': 'solutions', 'group': 'g', 'when': 'pre', 'q': '1단계 솔루션'},
                   '8': {'pick': 'solutions', 'group': 'g', 'when': 'pre', 'q': '2단계 솔루션'},
                   '10': {'pick': 'solutions', 'nth': 1, 'when': 'pre'},
                   '13': {'pick': 'options', 'options': ['진행', '보류'], 'when': 'post', 'q': '3단계 상태'}}}


def test_pre_name_choices_stay_with_the_writer_by_default(auto, registry):
    from app.api.poc import layout_decide
    registry({'L_TOC_PILOT': PILOT})
    assert not layout_decide.pre_choice()
    ctx = {'products': [], 'solutions': ['magicinfo', 'stpro'], 'cases': [], 'spaces': [], 'short': {}, 'customer': '고객', 'title': '과제'}
    sl = {'f': 'L_TOC_PILOT', 'kind': 'generic', 'bind': {}, 't': {}, 'ex_t': {}}
    asks = {0: [{'i': 3, 'max': 12}, {'i': 8, 'max': 12}, {'i': 10, 'max': 20}, {'i': 13, 'max': 6}]}
    llm = types.SimpleNamespace(decisions={'layout.cells': FakeDecision()}, decision_on=layout_decide.on)
    cplan = layout_decide.cell_plan(auto, ctx, [sl], asks, llm, {0: {}})
    assert [x['i'] for x in asks[0]] == [3, 8]                                # model-chosen names: the writer
    assert [x['i'] for x, _ in cplan['pre'][0]] == [10] and [x['i'] for x, _ in cplan['post'][0]] == [13]   # n-th entry (code) · a label after writing
    locked = {0: {}}
    layout_decide.decide_pre(auto, ctx, {'brief': {'requirements': []}}, [sl], cplan, locked)
    assert locked[0] == {'10': 'MagicINFO'}


def test_cells_pre_names_and_post_labels(auto, registry):
    from app.api.poc import layout_decide
    registry({'L_TOC_PILOT': PILOT, 'L_OFF': {'cells': {}, 'off': {'layout.verify': 'test'}}}, pre_choice=True)
    assert not layout_decide.on('L_OFF', 'layout.verify') and layout_decide.on('L_OFF', 'layout.cells')
    ctx = {'products': [], 'solutions': ['magicinfo', 'stpro'], 'cases': [], 'spaces': [], 'short': {}, 'customer': '고객', 'title': '과제'}
    sl = {'f': 'L_TOC_PILOT', 'kind': 'generic', 'bind': {}, 't': {'1': '제목'}, 'ex_t': {'13': '견본 상태'}}
    asks = {0: [{'i': 1, 'max': 30}, {'i': 3, 'max': 12}, {'i': 8, 'max': 12}, {'i': 10, 'max': 20}, {'i': 13, 'max': 6}]}
    # both solution cells would like the same answer: the group gives the second its next choice
    dec = FakeDecision(pick=lambda qid, crit: next((k for k in crit if k.startswith('MagicINFO')), None))
    llm = types.SimpleNamespace(decisions={'layout.cells': dec}, decision_on=layout_decide.on)
    cplan = layout_decide.cell_plan(auto, ctx, [sl], asks, llm, {0: {}})
    assert [x['i'] for x in asks[0]] == [1]                                  # the writer keeps only the free cell
    locked = {0: {}}
    layout_decide.decide_pre(auto, ctx, {'brief': {'requirements': []}}, [sl], cplan, locked)
    assert sorted(v for k, v in locked[0].items() if k in ('3', '8')) == ['MagicINFO', 'SmartThings Pro']   # different within the group
    sl['t'] = {**sl['t'], **locked[0]}
    layout_decide.decide_post(auto, ctx, {'brief': {'requirements': []}}, [sl], cplan, locked)
    assert sl['t']['13'] in ('진행', '보류') and sl['decided']['13']['by'] == 'decision'
    # no decision client: no plan, the asks stay
    asks2 = {0: [{'i': 3, 'max': 12}]}
    assert layout_decide.cell_plan(auto, ctx, [sl], asks2, types.SimpleNamespace(), {0: {}}) is None and asks2[0] == [{'i': 3, 'max': 12}]


def test_verify_answer_has_the_llm_checker_shape(auto):
    from app.api.poc import layout_decide
    from app.api.poc.compose_grounding import slot_intent
    slides = [{'f': 'L_TOC_PILOT', 'kind': 'generic', 't': {'1': '파일럿 승인 요청', '5': '근거 없는 절감 30% 보장'}}]
    editable = {0: {1: {'i': 1, 'max': 30}, 5: {'i': 5, 'max': 30}}}
    rendered = [{'s': 0, 'f': 'L_TOC_PILOT', 't': slides[0]['t']}]
    brief = {'requirements': [{'id': 'R1', 'text': '파일럿부터 시작해 주세요', 'kind': 'need'}], 'facts': {}}

    def pick(qid, crit):
        if qid == 'cov:R1':
            return '0:1'
        return 'claim' if qid == 'cell:0:5' else 'ok'
    asked = []

    class LLM:
        def json(self, **kw):
            asked.append(kw['stage'])
            return {'fixes': [{'s': 0, 'i': 5, 'v': '절감 효과는 측정 후 합의'}]}
    d = layout_decide.verify_answer(auto, {'customer': '고객'}, {'name': '파트'}, brief, rendered, editable, slides, FakeDecision(pick), LLM(), slot_intent)
    assert set(d) == {'coverage', 'issues', 'fixes'}
    assert d['coverage'] == [{'id': 'R1', 's': 0, 'quote': '파일럿 승인 요청'}]
    assert [i['slots'] for i in d['issues']] == [[5]] and d['issues'][0]['kind'] == 'claim'
    assert asked == ['auto_part_verify_fix'] and d['fixes'][0]['i'] == 5    # the LLM writes the fix of the flagged cell only


def test_pictures_decision_branch_returns_the_llm_shapes(auto):
    from composer import pictures as P
    slot = {'key': '0', 'kind': 'scene', 'osrc': '', 'near': '로비', 'title': '', 'hint': '', 'bind': {}, 'cands': [{'src': 'a'}, {'src': 'b'}]}
    slides = [{'f': 'L_X'}]
    gate = {'on': True}
    dec = FakeDecision(pick=lambda qid, crit: 'wrong_space' if qid.startswith('v') else ('a0' if qid.startswith('b') else 'c1'))
    llm = types.SimpleNamespace(decisions={'layout.pictures': dec}, decision_on=lambda f, task: gate['on'])
    assert P._decision(llm, slides) is dec
    out = P._verify_decision({}, {}, [(0, slot)], {'0:0': 'a'}, {'0:0': ['b']}, dec)
    assert out == {'0:0': {'verdict': 'mismatch', 'reason': 'wrong_space', 'better': 'b'}}
    assert P._pick_decision({}, {}, [(0, slot)], {'0:0': ['a', 'b']}, dec, set()) == {'0:0': 'b'}
    gate['on'] = False
    assert P._decision(llm, slides) is None                                # the layout keeps the LLM
    assert P._decision(types.SimpleNamespace(), slides) is None            # no decision branch at all


def test_review_answer_redoes_only_flagged_sheets(auto):
    from app.api.poc import layout_decide
    slides = [{'f': 'L_TOC_PILOT', 't': {'1': '같은 말'}, 'directive': '파일럿 단계'}, {'f': 'L_TOC_PILOT', 't': {'1': '좋은 말'}}]
    editable = {0: [{'i': 1, 'max': 20}], 1: [{'i': 1, 'max': 20}]}
    findings = {'repeats': [{'s': 0, 'i': 1, 'text': '같은 말'}], 'empty': [], 'unanswered': []}
    dec = FakeDecision(pick=lambda qid, crit: 'repeat' if qid == 'redo:0' else 'ok')
    redo = layout_decide.review_answer(auto, {'customer': '고객'}, {'name': '파트'}, {'brief': {'requirements': []}}, slides, editable, findings, dec, 3)
    assert [x['s'] for x in redo] == [0] and redo[0]['cells'] == [1] and set(redo[0]) == {'s', 'why', 'instruction', 'cells'}


def test_flow_view_lists_each_steps_decision_questions():
    from app.api import layout_flows as flows
    v = flows.view('L_TOC_PILOT')
    d = v.get('decision') or {}
    assert 'verify' in d and d['verify']['task'] == 'layout.verify' and {q['type'] for q in d['verify']['questions']} == {'choice'}
    assert 'review' in d['verify'] and d['verify']['llm']


def test_decided_values_fit_their_cell(auto, monkeypatch):
    from app.api.poc import layout_decide, compose_grounding
    # (the real check also measures the cell's box; here the character budget alone decides)
    monkeypatch.setattr(compose_grounding, 'fits_slot', lambda auto_, sl_, i, value, cap: len(value) <= cap)
    ctx = {'products': ['qm55c'], 'solutions': [], 'cases': [], 'spaces': [], 'short': {}}
    sl = {'f': 'L_TOC_PILOT'}
    # a ' · ' list keeps the entries that fit (at least the first)
    assert layout_decide._fit(auto, ctx, sl, {'i': 3, 'max': 9}, '로비 · 객실 · 라운지', {'multi': ' · '}) == '로비 · 객실'
    assert layout_decide._fit(auto, ctx, sl, {'i': 3, 'max': 2}, '로비 · 객실', {'multi': ' · '}) == '로비'
    # a product name past the width becomes its model code; a value that fits stays
    name = layout_decide.lists(auto, ctx)['products'][0][0]
    model = auto.load()['products_all']['qm55c']['model']
    assert layout_decide._fit(auto, ctx, sl, {'i': 3, 'max': len(model)}, name, {'pick': 'products'}) == model
    assert layout_decide._fit(auto, ctx, sl, {'i': 3, 'max': 40}, name, {'pick': 'products'}) == name
