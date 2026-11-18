"""칸 설계 (app/data/layout_cells.json + admin edits): the writer is told what each cell is for, structural labels stay, figure
cells take stated numbers only; the design also sets the sheet directive and whether the elements are written one by one."""
import json

import pytest

from app.api import layout_cells, layout_flows as flows


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    design = {'L_TOC_PILOT': {'say': '작게 시작해 같은 기준으로 넓히는 세 단계', 'split': False, 'cells': {
        '3': {'role': '1단계 이름 (2~6자)'}, '4': {'role': '1단계 범위 — 매장 수', 'num': True}, '1': {'role': '제목 — 승인 요청 한 줄'}}},
        'L_PH_CH_A': {'cells': {'3': {'role': "'과제 01' 그대로", 'keep': True}, '5': {'role': '과제 제목 — 이 공간의 불편 한 줄'}}},
        'L_PH_TO_B': {'split': True, 'element': '이 단계 하나 — 이관할 일과 담당'}}
    p = tmp_path / 'cells.json'
    p.write_text(json.dumps(design, ensure_ascii=False))
    monkeypatch.setenv('WINMATE_LAYOUT_CELLS', str(p))
    monkeypatch.setenv('WINMATE_LAYOUT_FLOWS', str(tmp_path / 'flows.json'))
    monkeypatch.setenv('WINMATE_LAYOUT_LIBRARY', str(tmp_path / 'library.json'))
    flows._base_cached.cache_clear()
    yield
    flows._base_cached.cache_clear()


def test_design_sets_directive_split_and_roles():
    v = flows.view('L_TOC_PILOT')
    write = next(n for n in v['flow']['nodes'] if n['module'] == 'write')
    assert '작게 시작해 같은 기준으로 넓히는 세 단계' in write['prompt']
    assert v['cells']['cells']['4'] == {'role': '1단계 범위 — 매장 수', 'num': True}
    assert {c['i'] for c in v['cells']['list']} >= {1, 3, 4}
    to = flows.view('L_PH_TO_B')
    assert 'element' in [n['module'] for n in to['flow']['nodes']]          # the design splits it (topic stages, < 36 cells)
    assert next(n for n in to['flow']['nodes'] if n['module'] == 'element')['prompt'] == '이 단계 하나 — 이관할 일과 담당'


def test_admin_edit_overrides_a_cell_and_returning_to_the_design_drops_it():
    v = flows.view('L_TOC_PILOT')
    flows.save_cells('L_TOC_PILOT', {'3': {'role': '1단계 이름 — 동사 없이'}, '1': {'role': '제목 — 승인 요청 한 줄'}}, v['rev'])
    assert layout_cells.cell('L_TOC_PILOT', 3) == {'role': '1단계 이름 — 동사 없이'}
    assert flows.view('L_TOC_PILOT')['cells']['edited'] == ['3']             # cell 1 equals the design: not stored
    with pytest.raises(ValueError):
        flows.save_cells('L_TOC_PILOT', {'999': {'role': 'x'}}, flows.load()['rev'])
    flows.save_cells('L_TOC_PILOT', {'3': {'role': '1단계 이름 (2~6자)'}}, flows.load()['rev'])
    assert flows.view('L_TOC_PILOT')['cells']['edited'] == []


def test_composer_uses_roles_keeps_labels_and_marks_figures():
    from unittest.mock import patch
    from app.api.poc import compose_grounding as g
    from app.api.poc.adapters import compose
    auto = compose._auto(grounded=True)
    assert g.slot_intent('L_PH_CH_A', {'i': 5, 'r': 'text'}) == '과제 제목 — 이 공간의 불편 한 줄'
    sl = {'f': 'L_PH_CH_A', 'kind': 'generic', 'bind': {}, 'ex_t': {'3': '과제 01', '5': '견본 제목'}, 'role': ''}
    plan = [{'i': 3, 'r': 'text', 'ref': '과제 01', 'max': 10, 'mode': 'ai'}, {'i': 5, 'r': 'text', 'ref': '견본 제목', 'max': 20, 'mode': 'ai'}]
    with patch.object(auto, 'slot_plan', lambda ctx, s: [dict(x) for x in plan]):
        asks, locked = g.prepare_slots(auto, {}, [sl])
    assert [x['i'] for x in asks[0]] == [5] and locked[0]['3'] == '과제 01'
    sl2 = {'f': 'L_TOC_PILOT', 'kind': 'generic', 'bind': {}, 'ex_t': {'4': '[0]곳'}, 'role': ''}
    with patch.object(auto, 'slot_plan', lambda ctx, s: [{'i': 4, 'r': 'text', 'ref': '[0]곳', 'max': 8, 'mode': 'ai'}]):
        asks, _ = g.prepare_slots(auto, {}, [sl2])
    assert asks[0][0]['num_cell'] and '지어내지 않음' in asks[0][0]['note']


def test_item_and_model_cells_take_selected_names_only():
    from app.api.poc import compose_grounding as g
    from app.api.poc.adapters import compose
    from unittest.mock import patch
    auto = compose._auto(grounded=True)
    design = {'L_TOC_PILOT': {'cells': {'3': {'role': '선택 제품 이름 그대로 (없으면 빈칸)'}, '4': {'role': '모델 코드'},
                                        '5': {'role': '선택 제품 이름 그대로'}, '6': {'role': '선택 제품 이름 그대로'}}}}
    ctx = {'products': ['qm55c'], 'solutions': [], 'cases': [], 'short': {'qm55c': '스마트 사이니지 QM55C'}}
    sl = {'f': 'L_TOC_PILOT', 'kind': 'generic', 't': {'3': 'OMC-4000-PRO 사이니지', '4': 'SCH-ORCH-2024', '5': 'QM55C 스마트 사이니지', '6': '스마트 사이니지 QM55C 시리즈'}}
    with patch.object(layout_cells, 'designs', lambda: design):
        g.snap_item_names(auto, ctx, [sl])
    model = auto.load()['products_all']['qm55c']['model']
    assert sl['t'] == {'3': '', '4': model, '5': '스마트 사이니지 QM55C', '6': '스마트 사이니지 QM55C'}
