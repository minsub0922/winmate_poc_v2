"""요소별 작성 (fan-out / fan-in) — element plans, the flow registry's split · element · merge steps, and the real grounded
composer writing a 니즈 + 핵심 제안 part element by element (the model is a recorder that answers each requested cell)."""
import json
import re
from unittest.mock import patch

import pytest

from app.api import layout_elements as elements
from app.api import layout_flows as flows


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv('WINMATE_LAYOUT_FLOWS', str(tmp_path / 'flows.json'))
    monkeypatch.setenv('WINMATE_LAYOUT_LIBRARY', str(tmp_path / 'library.json'))
    flows._base_cached.cache_clear()
    yield
    flows._base_cached.cache_clear()


# ---------------------------------------------------------------- element plans
def test_composition_sheets_have_their_designed_elements():
    needs = elements.plan_for('L_VS_NEEDS')
    assert needs['split'] and needs['frame'] == [1, 2]
    assert [u['slots'] for u in needs['units']] == [[7, 8, 10, 11, 12], [14, 15, 17, 18, 19], [21, 22, 24, 25, 26]]
    assert {u['entity'] for u in needs['units']} == {'point'}
    core = elements.plan_for('L_VS_CORE_2')
    assert [u['slots'] for u in core['units']] == [[4, 5, 6, 7, 8, 9], [11, 12, 13, 14, 15, 16]]
    p3 = elements.plan_for('L_VS_SPACE_P3')
    assert [u['entity'] for u in p3['units']] == ['product'] * 3 and [u['imgs'] for u in p3['units']] == [[0], [1], [2]]
    scn = elements.plan_for('L_TOC_SCN_S2')
    spaces = [u for u in scn['units'] if u['writable'] and 7 in u['slots'] or 13 in u['slots']]
    assert len(spaces) == 2 and scn['split']
    tech = elements.plan_for('L_TOC_TECH3')
    assert len(tech['units']) == 3 and {u['entity'] for u in tech['units']} == {'solution'}
    assert not elements.plan_for('L_TOC_PILOT')['split']   # three stages of one plan: written together


def test_every_layout_splits_into_disjoint_elements():
    lib = elements.library()
    for f in lib['layouts']:
        p = elements.detect(f, lib)
        seen = set(p['frame'])
        for u in p['units']:
            assert len(set(u['slots'])) == len(u['slots']), f
            assert not seen & set(u['slots']), f
            seen |= set(u['slots'])
            assert set(u['writable']) <= set(u['slots'])
        if p['split']:
            assert sum(1 for u in p['units'] if u['writable']) >= 2, f


# ---------------------------------------------------------------- registry
def test_split_flow_replaces_write_and_is_switchable():
    v = flows.view('L_VS_NEEDS')
    mods = [n['module'] for n in v['flow']['nodes']]
    assert {'split', 'element', 'merge'} <= set(mods) and 'write' not in mods
    assert mods.index('split') < mods.index('element') < mods.index('merge') < mods.index('shorten')
    assert v['elements']['units'] and '고객이 직접 말하듯' in next(n for n in v['flow']['nodes'] if n['module'] == 'element')['prompt']
    assert {'requirement_summary', 'part_directive'} <= {i['source'] for i in v['flow']['inputs'] if i['required']}
    assert 'write' in [n['module'] for n in flows.view('L_TOC_PILOT')['flow']['nodes']]
    base = flows.base_for('L_VS_NEEDS')[1]
    nodes = v['flow']['nodes']
    with pytest.raises(ValueError, match='함께 둘 수 없습니다'):
        flows.normalize({'inputs': v['flow']['inputs'], 'nodes': nodes + [{'id': 'write', 'module': 'write', 'prompt': '', 'reads': []}]},
                        'generic', flows.source_map(), base)
    # an element step alone brings its split and merge steps
    alone = [n for n in nodes if n['module'] not in ('split', 'merge')]
    got = flows.normalize({'inputs': v['flow']['inputs'], 'nodes': alone}, 'generic', flows.source_map(), base)
    assert [n['module'] for n in got['nodes'] if n['module'] in flows.FANOUT] == ['split', 'element', 'merge']
    # per-element prompts: only this layout's elements
    el = next(n for n in nodes if n['module'] == 'element')
    with pytest.raises(ValueError, match='요소'):
        flows.normalize({'inputs': v['flow']['inputs'], 'nodes': [{**n, 'units': [{'id': 'zz', 'prompt': 'x'}]} if n is el else n for n in nodes]},
                        'generic', flows.source_map(), base)
    edited = [{**n, 'units': [{'id': 'q2', 'prompt': 'Q2 는 시설팀의 말로.'}, {'id': 'q3', 'prompt': ''}]} if n is el else n for n in nodes]
    flows.save_flow('L_VS_NEEDS', {'inputs': v['flow']['inputs'], 'nodes': edited}, v['rev'])
    after = flows.flow_for('L_VS_NEEDS')
    assert after['edited'] and next(n for n in after['flow']['nodes'] if n['module'] == 'element')['units'] == [{'id': 'q2', 'prompt': 'Q2 는 시설팀의 말로.'}]
    # back to one call: write instead of the three
    one = [n for n in after['flow']['nodes'] if n['module'] not in flows.FANOUT]
    one.insert(2, {'id': 'write', 'module': 'write', 'prompt': '한 번에 씁니다.', 'reads': []})
    flows.save_flow('L_VS_NEEDS', {'inputs': after['flow']['inputs'], 'nodes': one}, flows.load()['rev'])
    assert 'element' not in [n['module'] for n in flows.flow_for('L_VS_NEEDS')['flow']['nodes']]
    assert {'split', 'element', 'merge'} <= set(flows.view('L_VS_NEEDS')['logic'])


# ---------------------------------------------------------------- the real grounded composer
WORDS = ['객실', '관제', '복구', '전환', '알림', '점검', '교체', '계획', '확인', '설비', '공조', '화면', '운영', '절차', '기록', '현장', '지표', '단계',
         '예약', '보고', '안내', '경보', '데이터', '시범', '층별', '승인', '교육', '협의', '기준', '일정']


def sentence(tag, i):
    """a distinct sentence per (element, cell) — no two share a word pair"""
    k = (sum(map(ord, tag)) * 7 + i * 13) % len(WORDS)
    return f'{tag}-{i} ' + ' '.join(WORDS[(k + j * 11) % len(WORDS)] for j in range(3))


class CellWriter:
    """answers each requested cell with a distinct sentence; records every call."""
    def __init__(self, same=None):
        self.calls, self.same = [], same or {}

    def json(self, **kw):
        self.calls.append(kw)
        p = kw['prompt']
        if kw['stage'] in ('auto_unit_fill', 'auto_frame_fill'):
            cells = json.loads(re.search(r'\n칸: (\[.*\])', p).group(1))
            who = re.search(r'이 요소: (\S+)', p)
            tag = who.group(1) if who else '장'
            return {'t': [{'i': c['i'], 'v': self.same.get((tag, c['i'])) or sentence(tag, c['i'])} for c in cells]}
        if kw['stage'] == 'auto_unit_repair':
            cells = json.loads(re.search(r'다시 쓸 칸: (\[.*\])', p).group(1))
            return {'items': [{'i': c['i'], 'v': sentence('fix', c['i'])} for c in cells]}
        return {'slides': [], 'items': []}


def needs_part():
    from app.api.poc.adapters import compose
    auto = compose._auto(grounded=True)
    pts = [{'id': 'R1', 'text': '교체 때 객실을 오래 비우기 어렵다', 'label': '객실 판매 유지', 'products': ['wf1way'], 'solutions': ['lynk']},
           {'id': 'R2', 'text': '프런트와 시설팀이 같은 객실을 따로 확인한다', 'label': '중복 확인 감소', 'products': [], 'solutions': ['biot']},
           {'id': 'R3', 'text': '장애 때 기존 운영으로 돌아가는 절차', 'label': '복구 절차', 'products': ['hoteltv43'], 'solutions': []}]
    ctx = {'customer': '포레스트호텔', 'title': '객실 TV · 공조 교체', 'short': {'lynk': 'LYNK Cloud', 'biot': 'b.IoT', 'hoteltv43': '호텔 TV 43"', 'wf1way': '무풍 1Way 카세트'},
           'products': ['hoteltv43', 'wf1way'], 'solutions': ['lynk', 'biot'], 'cases': [], 'space_by_id': {}, 'spaces': [], 'layout_inputs': {}}
    plan = {'thesis': '판매를 멈추지 않고 바꾼다', 'points': pts}
    pp = {'message': 'AI 호텔', 'point_ids': ['R1', 'R2', 'R3'], 'brief': {'requirements': [], 'facts': {}}, 'products': ['hoteltv43'], 'solutions': ['lynk', 'biot']}
    slides = [{'f': f, 'kind': 'generic', 'bind': {}, 'ex_t': {'1': '견본 제목'}, 'role': ''} for f in ('L_VS_NEEDS', 'L_VS_CORE_1', 'L_VS_CORE_2')]
    lib = auto.load()['layouts']
    asks = {s: [{'i': t['i'], 'r': t.get('role') or 'text', 'ref': t.get('text') or '', 'max': 40} for t in lib[sl['f']]['texts']
                if not t.get('img') and t['i'] not in (0, 3, 4, 5, 6, 13, 20) or (sl['f'] != 'L_VS_NEEDS' and t['i'] in (4, 5, 6, 13))]
            for s, sl in enumerate(slides)}
    asks = {s: [x for x in xs if x['i'] < 27 and (slides[s]['f'] == 'L_VS_NEEDS' or x['i'] not in (3, 10, 17))] for s, xs in asks.items()}
    return auto, ctx, plan, pp, slides, asks


def test_needs_and_core_are_written_element_by_element():
    from app.api.poc import compose_grounding as g
    auto, ctx, plan, pp, slides, asks = needs_part()
    llm = CellWriter()
    with patch.object(g, 'prepare_slots', return_value=(asks, {s: {} for s in asks})), patch.object(auto, 'assign_focus', lambda *a: None):
        g.fill_part(auto, ctx, plan, {'id': 'p1', 'name': 'AI 호텔'}, pp, slides, llm)
    stages = [c['stage'] for c in llm.calls]
    assert 'auto_part_fill' not in stages                  # every sheet of this part is split
    units = [c['prompt'] for c in llm.calls if c['stage'] == 'auto_unit_fill']
    assert len(units) == 3 + 2 + 2 and stages.count('auto_frame_fill') == 3
    q1 = next(p for p in units if '이 요소: Q1' in p)
    facts = q1.split('이 요소의 자료(근거는 이것뿐): ')[1].split('\n')[0]
    assert facts.startswith('LYNK Cloud') and 'b.IoT' not in facts   # its own item's facts only
    assert '“교체 때 객실을 오래 비우기 어렵다”' not in q1 and '교체 때 객실을 오래 비우기 어렵다' in q1
    assert 'Q2 = b.IoT' in q1                              # what the other rows carry, so they do not overlap
    needs, core1 = slides[0]['t'], slides[1]['t']
    assert (needs['8'], needs['15'], needs['22']) == ('LYNK Cloud', 'b.IoT', '호텔 TV 43"')   # the item chips are set by code
    assert needs['7'] == sentence('Q1', 7) and needs['1'] == sentence('장', 1)
    assert core1['5'] == 'LYNK Cloud' and core1['12'] == '무풍 1Way 카세트'          # rows of 핵심 제안 1: the column's two items
    core2 = slides[2]['t']
    assert core2['5'] == 'b.IoT' and core2['12'] == 'b.IoT'   # no other item answers R2: a second sub-proposal of the same item
    c1 = next(p for p in units if '핵심 제안 상세 1' in p and '이 요소: 01' in p)
    assert '니즈 장 Q1 행' in c1 and sentence('Q1', 10) in c1                        # it elaborates the 니즈 row written first
    assert slides[0]['fanout']['units'][0]['entity']['id'] == 'lynk'


def test_merge_rewrites_repeats_and_bare_item_names():
    from app.api.poc import compose_grounding as g
    auto, ctx, plan, pp, slides, asks = needs_part()
    llm = CellWriter(same={('Q1', 11): '원격 관리로 객실 비움 최소화', ('Q2', 18): '원격 관리로 객실 비움 최소화', ('Q3', 24): '호텔 TV 43"'})
    slides, asks = slides[:1], {0: asks[0]}
    with patch.object(g, 'prepare_slots', return_value=(asks, {0: {}})), patch.object(auto, 'assign_focus', lambda *a: None):
        g.fill_part(auto, ctx, plan, {'id': 'p1', 'name': 'AI 호텔'}, pp, slides, llm)
    repair = next(c for c in llm.calls if c['stage'] == 'auto_unit_repair')
    asked = {c['i']: c['why'] for c in json.loads(re.search(r'다시 쓸 칸: (\[.*\])', repair['prompt']).group(1))}
    assert set(asked) == {18, 24} and asked[24].startswith('항목 이름만')
    assert slides[0]['t']['24'] == sentence('fix', 24) and slides[0]['t']['18'] == sentence('fix', 18)
    assert slides[0]['t']['11'] == '원격 관리로 객실 비움 최소화'
