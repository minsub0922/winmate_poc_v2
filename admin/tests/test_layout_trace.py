"""레이아웃 관리 → 흐름: every step's in/out, and 모델 입력 — what each model step sends, recorded on a sample input without
calling a model (app/api/poc/layout_trace.py). Temporary registries; the app provider must never be asked."""
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from admin.layout_library import layout_library_router
from admin.store import Store
from app.api import layout_flows as flows
from app.api.poc import layout_decide, layout_experiments, layout_trace


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('WINMATE_LAYOUT_FLOWS', str(tmp_path / 'flows.json'))
    monkeypatch.setenv('WINMATE_LAYOUT_LIBRARY', str(tmp_path / 'library.json'))
    flows._base_cached.cache_clear()

    def no_model(*a, **k):
        raise AssertionError('the trace must not reach the app provider')
    monkeypatch.setattr(layout_experiments, '_Provider', no_model)
    store = Store(tmp_path / 'admin')
    app = FastAPI()
    app.include_router(layout_library_router(lambda: store, lambda: 'tester'))
    return TestClient(app), tmp_path


def test_every_step_has_in_and_out(client):
    http, _ = client
    for f in ('L_MI01', 'L_VS_NEEDS', 'L_TOC_PILOT'):
        view = http.get(f'/api/layout-library/{f}/flow').json()
        assert set(view['io']) == {n['id'] for n in view['flow']['nodes']}
        assert all(set(io) == {'in', 'out'} and io['out'] for io in view['io'].values())
        assert set(view['io']['collect']['in']) == {i['param'] for i in view['flow']['inputs']}   # START → collect: the input JSON
        writer = next(n for n in view['flow']['nodes'] if n['module'] in ('write', 'element'))
        assert set(writer.get('reads') or []) <= set(view['io'][writer['id']]['in'])


def test_model_inputs_follow_the_saved_flow_on_both_branches(client):
    http, tmp = client
    f = 'L_MI01'
    view = http.get(f'/api/layout-library/{f}/flow').json()
    flow = json.loads(json.dumps(view['flow']))
    next(n for n in flow['nodes'] if n['module'] == 'write')['prompt'] = '연평균 성장률을 제목에 씁니다.'
    assert http.put(f'/api/layout-library/{f}/flow', json={'rev': view['rev'], 'flow': flow, 'confirmed': True}).status_code == 200
    before = sorted(p.name for p in tmp.iterdir())
    t = http.get(f'/api/layout-library/{f}/flow/trace?industry=HT').json()
    assert sorted(p.name for p in tmp.iterdir()) == before   # nothing stored
    assert t['sample']['industry'] == 'HT' and t['sample']['input']['industry'] == 'HT'
    llm, dec = t['llm']['calls'], t['decision']['calls']
    assert not t['llm']['error'] and not t['decision']['error']
    fill = next(c for c in llm if c['stage'] == 'auto_part_fill')
    assert fill['module'] == 'write' and '연평균 성장률을 제목에 씁니다.' in fill['prompt']   # an admin edit reaches the real prompt
    # (one sheet's chunk of cells a call — app/api/poc/sheet_writer.py: the answer is {"t": [{i, v}]})
    assert fill['schema']['properties']['t'] and fill['temperature'] is not None and fill['max_tokens']
    assert all(c['kind'] == 'llm' and c['module'] in {n['module'] for n in view['flow']['nodes']} for c in llm)
    assert not any(c.get('retry') for c in llm)   # the stand-in's answers pass the composer's own checks
    asked = [c for c in dec if c['kind'] == 'decision']
    assert {c['module'] for c in asked} >= {'verify', 'final'}
    for c in asked:
        assert c['task'] in layout_decide.TASKS and json.loads(c['state'])
        assert all(q['type'] in t['question_types'] for q in c['questions'].values())
    assert 'auto_part_verify' not in {c['stage'] for c in llm if c['kind'] == 'decision'}


def test_stand_in_answers_the_cells_asked_within_max():
    own = {'1': '견본 제목입니다', '2': '아주 긴 견본 본문 문장입니다'}
    schema = {'type': 'OBJECT', 'properties': {'slides': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
        's': {'type': 'INTEGER'}, 't': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {'i': {'type': 'INTEGER'}, 'v': {'type': 'STRING'}}}}}}}}}
    out = layout_trace._answer(schema, '칸: [{"i":2,"intent":"본문","max":6},{"i":9,"max":3}]', own, '장')
    assert out == {'slides': [{'s': 0, 't': [{'i': 2, 'v': '아주 긴 견'}]}]}   # 6 characters: max
    assert layout_trace._decide({'type': 'choice', 'criteria': {'claim': 'x', 'ok': 'y'}})['choice'] == 'ok'
    assert layout_trace.module_of('compose:auto_unit_fill') == 'element'
    assert layout_trace.module_of('auto_cells_post', 'layout.cells', ['collect', 'split', 'element', 'merge']) == 'element'
