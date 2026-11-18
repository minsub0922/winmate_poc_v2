"""제품 코드 · 솔루션 이름 없는 프롬프트 (app/api/poc/item_mask.py) — the model sees family handles, the deck gets the names.
  app/.venv/bin/python -m pytest app/tests/test_item_mask.py -q
"""
import os
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
LIBRARY = ROOT / 'app' / 'data' / 'runtime' / 'composer' / 'library.json'
pytestmark = pytest.mark.skipif(not LIBRARY.exists(), reason='composer library not built')
CODE = re.compile(r'(?<![A-Za-z0-9])(?:QM|QH|OH|KM|HG)\d{2}[A-Z0-9-]*')
CTX = {'products': ['qm55c', 'qm43c', 'kiosk', 'hoteltv43'], 'solutions': ['magicinfo', 'vxt', 'stpro'],
       'short': {'qm55c': 'QM55C', 'qm43c': 'QM43C', 'kiosk': 'KM24C'}}


@pytest.fixture(scope='module')
def auto():
    os.environ.setdefault('WM_COMPOSER_DATA', str(LIBRARY.parent))
    from app.api.poc.adapters import compose
    return compose._auto(grounded=True)


@pytest.fixture(scope='module')
def vocab(auto):
    from app.api.poc import item_mask
    return item_mask.Vocab(auto, CTX)


def test_codes_become_family_handles_and_other_items_their_family(vocab):
    text = ('스마트 사이니지 QM55C 3대 · QM43C · 삼성 키오스크 KM24C · 옥외 OH55A-S · 신모델 QM65C · MagicInfo 배포 · Samsung VXT · ST Pro · '
            'IP65 방수 · 요구 R13 · 55" 화면 · id qm55c · 통합관리시스템 DMS 2.5')
    out = vocab.mask(text)
    assert not CODE.search(out), out
    for w in ('사이니지①', '사이니지②', '키오스크①', '다른 사이니지', '사이니지 CMSⓐ', '사이니지 CMSⓑ', '다지점 IoTⓒ', 'IP65', 'R13', '55"'):
        assert w in out, (w, out)
    assert not re.search(r'MagicInfo|VXT|ST Pro|DMS', out), out


def test_a_model_named_in_korean_is_masked_too(vocab):
    out = vocab.mask('작업자가 갤럭시 엑스커버7 프로로 스캔 · 탭 액티브5 프로 서명')
    assert not re.search(r'엑스커버\d|액티브\d', out), out


def test_a_solution_keeps_its_name_on_its_own_page_only(auto, vocab):
    from app.api.poc import item_mask
    assert 'MagicINFO' in vocab.mask('MagicINFO 배포', {'magicinfo'}) and 'MagicINFO' not in vocab.mask('MagicINFO 배포')
    sol = {'f': 'L_VS_SOL_MAGIC', 'kind': 'solution', 'bind': {'solution': 'magicinfo'}}
    other = {'f': 'L_VP_G', 'kind': 'generic', 'bind': {'solutions': ['magicinfo']}}
    assert item_mask.allowed(auto, CTX, sol) == {'magicinfo'} and item_mask.allowed(auto, CTX, other) == frozenset()


def test_answers_come_back_with_names_and_ids(vocab):
    schema = {'type': 'OBJECT', 'properties': {'items': {'type': 'ARRAY', 'items': {'type': 'STRING', 'enum': ['qm55c', 'vxt', 'none']}}, 'v': {'type': 'STRING'}}}
    masked, back = vocab.mask_schema(schema)
    assert masked['properties']['items']['items']['enum'] == ['사이니지①', '사이니지 CMSⓑ', 'none']
    got = vocab.unmask_answer({'items': ['사이니지①', 'none'], 'v': '사이니지 ①로 메뉴를 · 키오스크①은 주문'}, back)
    assert got == {'items': ['qm55c', 'none'], 'v': 'QM55C로 메뉴를 · KM24C은 주문'}


def test_the_model_boundary_masks_prompts_and_decisions(auto):
    from app.api.poc import item_mask
    seen = {}

    class LLM:
        def json(self, *, stage, prompt, schema=None, validate=None, **kw):
            seen['prompt'], seen['schema'] = prompt, schema
            d = {'t': [{'i': 1, 'v': '사이니지①'}, {'i': 2, 'v': '사이니지①로 메뉴를 바꿉니다'}]}
            assert validate is None or validate(d) is True
            return d

    class Dec:
        def ask(self, stage, state, questions):
            seen['state'], seen['q'] = state, questions
            return {'c': {'choice': next(iter(questions['c']['criteria'])), 'probabilities': {k: 0.5 for k in questions['c']['criteria']}}}
    raw = LLM()
    raw.decisions = {'layout.final': Dec()}
    llm = item_mask.Masked(raw, {'vocab': item_mask.Vocab(auto, CTX)})
    out = llm.json(stage='auto_part_fill', prompt='쓸 칸: 이름 칸 1 = 고른 제품 스마트 사이니지 QM55C', validate=lambda d: True if d['t'][0]['v'] == 'QM55C' else 'x')
    assert 'QM55C' not in seen['prompt'] and '사이니지①' in seen['prompt'] and seen['prompt'].startswith('표식')
    assert out['t'][0]['v'] == 'QM55C' and out['t'][1]['v'] == 'QM55C로 메뉴를 바꿉니다'
    from app.api.llm import decision as dm
    a = llm.decisions['layout.final'].ask('s', {'고른 제품': ['스마트 사이니지 QM43C']},
                                          {'c': dm.choice('칸 8 — 묶음의 항목은 칸 9 “QM55C”: 그 항목을 말하는가', {'QM55C': '그 제품', 'none': '없음'})})
    assert 'QM' not in str(seen['state']) + str(seen['q']) and a['c']['choice'] == 'QM55C' and set(a['c']['probabilities']) == {'QM55C', 'none'}
    assert '사이니지①' in seen['q']['c']['instructions']   # (the question text as decision.choice builds it)


def test_a_composition_asks_with_handles_and_writes_the_names(auto):
    """fill_part_text through the installed chain: the model sees no code; the name cell it answers with a handle holds the name"""
    from unittest.mock import patch
    from app.api.poc import compose_grounding as g
    prompts = []

    class LLM:
        def json(self, *, stage, prompt, schema=None, validate=None, **kw):
            prompts.append(prompt)
            m = re.search(r'(사이니지①)', prompt)
            return {'t': [{'i': 3, 'v': m.group(1) if m else ''}]}
    ctx = {'customer': '고객사', 'title': '메뉴보드 교체', 'products': ['qm55c'], 'solutions': [], 'cases': [], 'short': {'qm55c': 'QM55C'}, 'space_by_id': {},
           'layout_inputs': {}}
    from app.api.poc import item_mask
    ctx['_mask'] = item_mask.Vocab(auto, ctx)
    slides = [{'f': 'L_TOC_PILOT', 'kind': 'generic', 'bind': {'products': ['qm55c']}, 'ex_t': {}}]
    with patch.object(g, 'prepare_slots', return_value=({0: [{'i': 3, 'r': '1단계 이름', 'max': 20, 'note': '이 칸은 고른 제품 이름 그대로: QM55C'}]}, {0: {}})), \
            patch.object(auto, 'assign_focus', lambda *a: None):
        auto.fill_part_text(ctx, {'thesis': ''}, {'id': 'p1', 'name': '실행'}, {'message': 'QM55C 3대로 시작', 'brief': {'requirements': [], 'facts': {}}, 'points': []},
                            slides, LLM())
    assert prompts and not any(CODE.search(p) for p in prompts), prompts
    assert slides[0]['t']['3'] == 'QM55C'
