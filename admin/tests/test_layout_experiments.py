"""Ephemeral experiments: real code paths, no fabricated AI completions."""
from concurrent.futures import ThreadPoolExecutor
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from admin.composition_layouts import inventory
from admin.layout_library import layout_library_router
from admin.store import Store
from app.api import layout_library as live, telemetry
from app.api.poc import layout_experiments as experiments, layout_snapshot
from app.api.poc.provider import ProviderError


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    for name in ('WINMATE_LAYOUT_LIBRARY', 'WINMATE_LAYOUT_FLOWS', 'WINMATE_RESOURCE_SWITCHES'):
        monkeypatch.setenv(name, str(tmp_path / (name + '.json')))
    return tmp_path


def snapshot(f='L_C03', **kwargs):
    _, metas, html = inventory(live.ROOT)
    return experiments.context(f, metas[f], html[f], **kwargs)


def test_five_inputs_follow_industry_and_current_contract(isolated):
    for f in ('L_C03', 'L_VS_NEEDS', 'L_TOC_SPEC', 'L_VS_DSS_FB'):
        s = snapshot(f)
        for industry in ('FB', 'HT'):
            rows = experiments.samples(s, industry)
            assert len(rows) == 5
            assert len({json.dumps(r['input'], ensure_ascii=False) for r in rows}) == 5
            for row in rows:
                values = experiments.inputs_of(s, row['input'])
                assert values['industry'] == industry
                assert {i['param'] for i in s['view']['flow']['inputs']} <= row['input'].keys()
    assert not list(isolated.iterdir())


def test_unsaved_draft_locks_and_parallel_request_isolation(isolated):
    def run(label):
        s = snapshot(draft={'fill': 'fixed', 't': {'1': label}})
        inp = experiments.samples(s, 'FB')[0]['input']
        result = experiments.run(s, inp)
        assert result['ov']['t']['1'] == label
        assert layout_snapshot.current() is None
        return result
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(run, ['임시 실험 A', '임시 실험 B']))
    assert results[0]['ov']['t']['1'] != results[1]['ov']['t']['1']
    assert not list(isolated.iterdir())


def test_fixed_supplemental_sheet_runs_without_provider(isolated):
    s = snapshot('L_VS_DSS_FB')
    assert s['view']['whole_fixed']
    result = experiments.run(s, experiments.samples(s, 'FB')[0]['input'])
    for slot in s['slots']:
        if slot['kind'] == 't':
            assert result['ov']['t'][slot['id']] == slot['value']


def test_flow_snapshot_without_writer_keeps_text(isolated):
    s = snapshot(flow={'inputs': [], 'nodes': [{'id': 'collect', 'module': 'collect'}, {'id': 'lock', 'module': 'lock'}]})
    assert all(n['module'] != 'write' for n in s['view']['flow']['nodes'])
    result = experiments.run(s, experiments.samples(s, 'FB')[0]['input'])
    assert result['f'] == 'L_C03'
    assert not list(isolated.iterdir())


def test_locked_draft_can_keep_current_element_flow(isolated):
    s = snapshot('L_VS_NEEDS', draft={'fill': 'fixed'})
    assert any(n['module'] == 'element' for n in s['view']['flow']['nodes'])
    assert experiments.run(s, experiments.samples(s, 'FB')[0]['input'])['f'] == 'L_VS_NEEDS'


def test_invalid_input_and_cancel_fail_without_writes(isolated):
    s = snapshot(draft={'fill': 'fixed'})
    inp = experiments.samples(s, 'FB')[0]['input']
    with pytest.raises(ValueError):
        experiments.run(s, {**inp, 'unexpected': 'do not save'})
    with pytest.raises(ValueError):
        experiments.run(s, {**inp, 'industry': []})
    def cancel():
        raise ProviderError('cancelled')
    with pytest.raises(ProviderError, match='cancelled'):
        experiments.run(s, inp, cancel)
    assert layout_snapshot.current() is None
    assert not list(isolated.iterdir())


def test_picture_samples_use_only_the_real_picture_stage(isolated):
    from app.api import layout_flows as flows
    from app.api.poc import layout_trace
    policy = flows.image_weights()
    calls = []
    samples = experiments.picture_samples()
    assert len(samples) == len(experiments.PICTURE_SAMPLES)
    for example in samples:
        f = example['f']
        ex, inp = experiments.picture_example(f, example['id'])
        result = experiments.run(snapshot(f), inp, provider=layout_trace._LLM({}, f, calls.append), branch='llm',
                                 pictures={'weights': policy, 'exemplar': ex, 'verify': True})
        assert set(result['ov']) == {'img'}
        assert result['matches'] and all(m['why'] for m in result['matches'])
        assert all(m['before'] == ex.get('img', {}).get(m['slot'], {}).get('src') for m in result['matches'])
    assert {c['stage'] for c in calls} == {'auto_image_verify'}
    assert not list(isolated.iterdir())


def test_managed_image_weights_change_flow_tool_matches(isolated):
    from app.api import layout_flows as flows
    from app.api.poc import layout_tools
    weights = {'caption': 0, 'place': 0, 'subject': 2}
    flows.save_image_weights(weights, 0, 'tester')
    with pytest.raises(flows.Conflict):
        flows.save_image_weights(weights, 0, 'other')
    tool = next(t for t in flows.tools() if t['key'] == 'image_search')
    result = layout_tools.run(tool, 'qm55c')['results']
    assert result and 'qm55c' in result[0]['text'].split()
    excluded = result[0]['ref']
    available = layout_tools.run(tool, 'qm55c', {'off_pictures': {excluded}})['results']
    assert available and all(row['ref'] != excluded for row in available)
    assert not layout_tools.run(tool, 'qm55c', {'image_weights': dict.fromkeys(weights, 0)})['results']


def test_ephemeral_telemetry_is_request_local():
    events = []
    previous = telemetry.install(lambda *a: events.append(a))
    capture = telemetry.capture_content(True)
    try:
        with telemetry.scope(ephemeral=True):
            telemetry.emit('http', message='private experiment')
            assert telemetry.content('input', 'output') == {}
        telemetry.emit('http', message='ordinary request')
        assert len(events) == 1 and events[0][1]['message'] == 'ordinary request'
    finally:
        telemetry.capture_content(capture)
        telemetry.install(previous)


def test_http_preview_has_no_store_or_event_and_does_not_save(isolated):
    store = Store(isolated / 'admin')
    app = FastAPI()
    app.include_router(layout_library_router(lambda: store, lambda: 'tester'))
    with TestClient(app) as http:
        base = '/api/layout-library/L_C03/experiments/'
        body = {'industry': 'FB', 'draft': {'fill': 'fixed', 't': {'1': '저장하지 않는 실험 문구'}}}
        before = store.rows('SELECT * FROM events')
        r = http.post(base + 'samples', json=body)
        assert r.status_code == 200 and r.headers['cache-control'] == 'no-store'
        r = http.post(base + 'run', json={**body, 'input': r.json()['samples'][0]['input']})
        assert r.status_code == 200 and r.headers['cache-control'] == 'no-store'
        assert '저장하지 않는 실험 문구' in r.json()['html']
        assert "script-src 'none'" in r.json()['html']
        assert before == store.rows('SELECT * FROM events')
        assert not (isolated / 'WINMATE_LAYOUT_LIBRARY.json').exists()
        assert not (isolated / 'WINMATE_LAYOUT_FLOWS.json').exists()


def test_http_failures_and_success_do_not_enter_tracing(isolated):
    from types import SimpleNamespace
    from admin.observability import RequestTracing
    events = []
    previous = telemetry.install(lambda *a: events.append(a))
    app = FastAPI()
    store = Store(isolated / 'admin')
    app.include_router(layout_library_router(lambda: store, lambda: 'tester'), prefix='/admin')
    auth = SimpleNamespace(config=SimpleNamespace(cookie_name='test'), read_token=lambda _: None)
    app.add_middleware(RequestTracing, auth=auth, operations=None)
    try:
        with TestClient(app) as http:
            base = '/admin/api/layout-library/L_C03/experiments/'
            ok = http.post(base + 'samples', json={'industry': 'FB'})
            bad = http.post(base + 'run', json={'input': {'private': 'experiment-input'}})
            assert ok.status_code == 200 and bad.status_code == 422
            assert ok.headers['cache-control'] == bad.headers['cache-control'] == 'no-store'
            assert not events
            http.get('/ordinary-request')
            assert events
    finally:
        telemetry.install(previous)
